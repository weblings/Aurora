#include <Aurora/Runtime/Pipeline.hpp>

#include <chrono>
#include <iostream>
#include <stdexcept>

#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/ZoneMapStore.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    void _log(const PipelineOptions& options, LogLevel level, const std::string& line)
    {
      if(options.log){
        options.log(level, line);
      }
      else if(level == LogLevel::Error){
        std::cerr << line << '\n';
      }
      else{
        std::cout << line << '\n';
      }
    }


    // Aurora-vf1.1: reload phase timing. Scoped span printer -- additive
    // logging only, no behavior change. Read the [timing] lines after a
    // Save to see which rebuild slice dominates before tuning anything.
    // (DTLS/streamer time hides inside 'outputs init' -- drill there iff
    // outputs dominate.)
    class ScopedPhaseTimer
    {
    public:
      ScopedPhaseTimer(const PipelineOptions& options, const char* phase):
      m_options(options),
      m_phase(phase),
      m_start(std::chrono::steady_clock::now())
      {
      }

      ~ScopedPhaseTimer()
      {
        const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
          std::chrono::steady_clock::now() - m_start).count();
        _log(m_options, LogLevel::Info, "[timing] " + std::string(m_phase) + ": " + std::to_string(ms) + " ms");
      }

      ScopedPhaseTimer(const ScopedPhaseTimer&) = delete;
      ScopedPhaseTimer& operator=(const ScopedPhaseTimer&) = delete;

    private:
      const PipelineOptions& m_options;
      const char* m_phase;
      std::chrono::steady_clock::time_point m_start;
    };
  }


  std::unique_ptr<Pipeline> Pipeline::build(
    const Registry& registry,
    const Config& config,
    const std::filesystem::path& configRoot,
    const PipelineOptions& options
  )
  {
    // Neither field ever set -- Mode+Device Select hasn't saved anything
    // yet (onboarding still in progress). Previously masked by "no
    // outputs available" always failing this early anyway (pairing alone
    // couldn't make a reload succeed); once that's fixed, a reload right
    // after pairing (Entertainment zone select's own connection save)
    // would otherwise start actually driving lights before the user ever
    // confirmed a capture source. Returning null here (not throwing) is
    // what PipelineHost::reload() already treats as an idle, non-error
    // state -- see its own constructor comment.
    if(config.activeInputName().empty() && config.activeAudioInputName().empty()){
      return nullptr;
    }

    auto pipeline = std::unique_ptr<Pipeline>(new Pipeline());

    std::vector<std::string> outputNames = config.activeOutputNames();
    if(outputNames.empty()){
      outputNames = registry.outputNames(); // no explicit selection -- run everything available
    }

    ScopedPhaseTimer outputsTimer(options, "outputs init");
    for(const auto& name : outputNames){
      auto output = registry.createOutput(name);
      if(!output){
        _log(options, LogLevel::Error, "Unknown output '" + name + "', skipping");
        continue;
      }
      output->init();
      pipeline->m_outputPtrs.push_back(output.get());
      pipeline->m_outputs.push_back(std::move(output));
    }

    if(pipeline->m_outputPtrs.empty()){
      throw std::runtime_error("No outputs available -- nothing to drive");
    }

    // Video wins if both could apply -- explicit opt-in to audio requires
    // leaving activeInputName unset. Past the early return above, an empty
    // activeInputName therefore always means audio mode.
    bool useAudioMode = config.activeInputName().empty();

    ScopedPhaseTimer captureTimer(options, "capture+orchestrator init");
    if(useAudioMode){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
      auto audioInput = registry.createAudioInput(config.activeAudioInputName());
      if(!audioInput){
        throw std::runtime_error("Unknown audio input '" + config.activeAudioInputName() + "'");
      }

      Processing::AudioProcessing::AudioEffectSettings settings;
      if(config.audioFixedAnchorHue() >= 0.f){
        settings.fixedAnchorHue = config.audioFixedAnchorHue();
      }
      settings.bounceSmoothTime = config.audioBounceSmoothTime();
      settings.dynamismFloor = config.audioDynamismFloor();
      settings.centroidStrength = config.audioCentroidStrength();
      settings.driftBaseRateDegPerSec = config.audioDriftBaseRateDegPerSec();
      settings.vibrancySaturation = config.audioVibrancySaturation();
      settings.vibrancyValue = config.audioVibrancyValue();
      settings.referenceRms = config.audioReferenceRms();
      settings.brightnessFloor = config.audioBrightnessFloor();
      settings.centroidRangeHz = config.audioCentroidRangeHz();
      settings.brightnessSmoothTime = config.audioBrightnessSmoothTime();

      pipeline->m_audioOrchestrator.emplace(
        *audioInput, pipeline->m_outputPtrs, ZoneMapStore(configRoot), settings
      );
      pipeline->m_audioOrchestrator->init();
      pipeline->m_audioInput = std::move(audioInput);
      pipeline->m_isAudioMode = true;
      pipeline->m_tickIntervalSeconds = Runtime::tickIntervalSeconds(); // no display-derived rate for audio

      _log(options, LogLevel::Info,
        "Aurora running: audio input='" + config.activeAudioInputName() + "', "
        + std::to_string(pipeline->m_outputPtrs.size()) + " output(s).");
#else
      throw std::runtime_error(options.noAudioSupportMessage);
#endif
    }
    else{
      const std::string& inputName = config.activeInputName();
      auto input = registry.createInput(inputName);
      if(!input){
        throw std::runtime_error("Unknown input '" + inputName + "'");
      }
      input->init();

      pipeline->m_orchestrator.emplace(
        *input, pipeline->m_outputPtrs, config, ZoneMapStore(configRoot)
      );
      pipeline->m_orchestrator->init();
      pipeline->m_videoInput = std::move(input);
      pipeline->m_isAudioMode = false;
      pipeline->m_tickIntervalSeconds = Runtime::tickIntervalSeconds(pipeline->m_orchestrator->config().refreshRate());

      // Persists any refreshRate/subsampleWidth just derived from the
      // display -- same as main() always did right after construction.
      ConfigStore(configRoot).save(pipeline->m_orchestrator->config());

      _log(options, LogLevel::Info,
        "Aurora running: input='" + inputName + "', "
        + std::to_string(pipeline->m_outputPtrs.size()) + " output(s).");
    }

    return pipeline;
  }


  void Pipeline::tick(float dt)
  {
    if(m_isAudioMode){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
      m_audioOrchestrator->update(dt);
#endif
    }
    else{
      m_orchestrator->update(dt);
    }
  }


  Input::Monitors Pipeline::listMonitors() const
  {
    return m_videoInput ? m_videoInput->monitors() : Input::Monitors{};
  }


  Input::IAudioInput* Pipeline::audioInput() const
  {
    return m_isAudioMode ? m_audioInput.get() : nullptr;
  }


  ZoneListResult Pipeline::listZones() const
  {
    if(m_outputPtrs.empty()){
      return {};
    }

    const std::string& name = m_outputPtrs.front()->name();
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    if(m_isAudioMode){
      return {name, m_audioOrchestrator->zoneMap(name), m_outputPtrs.front()->zoneLabels()};
    }
#endif
    return {name, m_orchestrator->zoneMap(name), m_outputPtrs.front()->zoneLabels()};
  }


  bool Pipeline::updateZone(
    std::uint8_t zoneId,
    const std::optional<Contracts::UVs>& uvs,
    const std::optional<bool>& active,
    const std::optional<float>& gamma
  )
  {
    if(m_outputPtrs.empty()){
      return false;
    }

#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    if(m_isAudioMode){
      return m_audioOrchestrator->updateZone(m_outputPtrs.front()->name(), zoneId, uvs, active, gamma);
    }
#endif
    return m_orchestrator->updateZone(m_outputPtrs.front()->name(), zoneId, uvs, active, gamma);
  }


  void Pipeline::shutdown(bool isReplacement)
  {
    for(auto* output : m_outputPtrs){
      output->shutdown(isReplacement);
    }
  }


  PipelineHost::PipelineHost(std::unique_ptr<Pipeline> initial, PipelineOptions options):
  m_options(std::move(options)),
  m_pipeline(std::move(initial))
  {
  }


  void PipelineHost::tick()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    // Interval read under the same lock as the tick, so a concurrent
    // pipeline swap can't pair one pipeline's dt with another's tick.
    if(m_pipeline){ m_pipeline->tick(static_cast<float>(m_pipeline->tickIntervalSeconds())); }
  }


  double PipelineHost::tickIntervalSeconds()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_pipeline ? m_pipeline->tickIntervalSeconds() : Runtime::tickIntervalSeconds();
  }


  Input::Monitors PipelineHost::listMonitors()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_pipeline ? m_pipeline->listMonitors() : Input::Monitors{};
  }


  ZoneListResult PipelineHost::listZones()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_pipeline ? m_pipeline->listZones() : ZoneListResult{};
  }


  bool PipelineHost::updateZone(
    std::uint8_t zoneId,
    const std::optional<Contracts::UVs>& uvs,
    const std::optional<bool>& active,
    const std::optional<float>& gamma
  )
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_pipeline && m_pipeline->updateZone(zoneId, uvs, active, gamma);
  }


  bool PipelineHost::reload(
    const Registry& registry,
    const Config& config,
    const std::filesystem::path& configRoot,
    std::string& errorOut
  )
  {
    ScopedPhaseTimer reloadTimer(m_options, "reload total");
    std::unique_ptr<Pipeline> next;
    try{
      next = Pipeline::build(registry, config, configRoot, m_options);
    }
    catch(const std::exception& e){
      errorOut = m_options.describeBuildError ? m_options.describeBuildError(e) : e.what();
      return false;
    }

    std::unique_ptr<Pipeline> previous;
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      previous = std::move(m_pipeline);
      m_pipeline = std::move(next);
    }
    // previous is null on the first successful reload after a fresh
    // install started with no Pipeline at all.
    if(previous){ previous->shutdown(/*isReplacement*/ true); }
    return true;
  }


  void PipelineHost::shutdown()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    if(m_pipeline){ m_pipeline->shutdown(/*isReplacement*/ false); }
  }


  std::string reloadPipelineFromDisk(
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  )
  {
    Config freshConfig = ConfigStore(configRoot).load();
    std::string error;
    pipelineHost.reload(registry, freshConfig, configRoot, error);
    return error;
  }
}
