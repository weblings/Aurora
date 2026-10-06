#include <Aurora/Runtime/Pipeline.hpp>

#include <chrono>
#include <iostream>
#include <stdexcept>

#include <Aurora/Runtime/ConfigApply.hpp>
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


#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    // Shared by build() and applyConfig() so the two cannot drift apart.
    Processing::AudioProcessing::AudioEffectSettings _audioSettingsFrom(const Config& config)
    {
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
      return settings;
    }
#endif


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


    constexpr std::uint8_t kUsesVideoInput = 1u << 0;
    constexpr std::uint8_t kUsesAudioInput = 1u << 1;
    constexpr std::uint8_t kSamplesZones = 1u << 2;
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

      Processing::AudioProcessing::AudioEffectSettings settings = _audioSettingsFrom(config);

      pipeline->m_audioOrchestrator.emplace(
        *audioInput, pipeline->m_outputPtrs, ZoneMapStore(configRoot), settings
      );
      pipeline->m_audioOrchestrator->init();
      pipeline->m_audioInput = std::move(audioInput);
      pipeline->m_isAudioMode = true;
      pipeline->m_appliedConfig = config;
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
      // Post-derivation: refreshRate/subsampleWidth are the display-derived
      // values, matching what the settings save now holds on disk.
      pipeline->m_appliedConfig = pipeline->m_orchestrator->config();
      pipeline->m_tickIntervalSeconds = Runtime::tickIntervalSeconds(pipeline->m_orchestrator->config().refreshRate());

      // Persists any refreshRate/subsampleWidth just derived from the
      // display -- same as main() always did right after construction.
      // Only those two fields, and only where still unset on disk: this
      // runs after output init (1-3s on Hue), so saving the whole Config
      // built from the pre-init load would overwrite a settings PUT that
      // landed meanwhile (Aurora-d6i7).
      const Config& derived = pipeline->m_orchestrator->config();
      ConfigStore(configRoot).update([&derived](Config& onDisk){
        bool changed = false;
        if(onDisk.refreshRate() == 0 && derived.refreshRate() != 0){
          onDisk.setRefreshRate(derived.refreshRate());
          changed = true;
        }
        if(onDisk.subsampleWidth() == 0 && derived.subsampleWidth() != 0){
          onDisk.setSubsampleWidth(derived.subsampleWidth());
          changed = true;
        }
        return changed;
      });

      _log(options, LogLevel::Info,
        "Aurora running: input='" + inputName + "', "
        + std::to_string(pipeline->m_outputPtrs.size()) + " output(s).");
    }

    return pipeline;
  }


  ConfigApplyResult Pipeline::applyConfig(const Config& next)
  {
    const ChangeAction action = planConfigChange(m_appliedConfig, next, m_isAudioMode);
    if(action == ChangeAction::Reload){
      return {/*needsReload*/ true, {}};
    }

    ConfigApplyResult result;
    if(action == ChangeAction::Hot){
      if(m_isAudioMode){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
        m_audioOrchestrator->setSettings(_audioSettingsFrom(next));
#endif
      }
      else{
        const unsigned width = next.subsampleWidth();
        const bool widthChanged = width != m_appliedConfig.subsampleWidth();

        m_orchestrator->setConfig(next);
        m_tickIntervalSeconds = Runtime::tickIntervalSeconds(next.refreshRate());

        if(widthChanged){
          // Can block on the capture API (Mac SCK waits up to 5s), so the
          // host runs it after releasing its lock. m_videoInput outlives the
          // call: reload() cannot swap this pipeline out meanwhile.
          Input::IVideoInput* input = m_videoInput.get();
          result.afterUnlock = [input, width]{ input->setCaptureWidthHint(width); };
        }
      }
    }

    // None and Hot both: fields nothing here reads still move the baseline,
    // so the next diff starts from what disk says now.
    m_appliedConfig = next;
    return result;
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


  PipelineCapabilities Pipeline::capabilities() const
  {
    // One orchestrator per pipeline today: video samples zones, audio
    // doesn't. A graph pipeline will set these per node instead.
    PipelineCapabilities capabilities;
    capabilities.usesVideoInput = !m_isAudioMode;
    capabilities.usesAudioInput = m_isAudioMode;
    capabilities.samplesZones = !m_isAudioMode;
    return capabilities;
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


  const char* hostStateName(HostState state)
  {
    switch(state){
      case HostState::Idle: return "idle";
      case HostState::Running: return "running";
      case HostState::Paused: return "paused";
      case HostState::Failed: return "failed";
    }
    return "idle";
  }


  PipelineHost::PipelineHost(
    std::unique_ptr<Pipeline> initial,
    PipelineOptions options,
    std::exception_ptr startupFailure
  ):
  m_options(std::move(options)),
  m_pipeline(std::move(initial))
  {
    _storeCapabilities(m_pipeline.get());

    std::vector<HostError> errors;
    if(!m_pipeline && startupFailure){
      try{ std::rethrow_exception(startupFailure); }
      catch(const std::exception& e){ errors.push_back({"startup", _describeBuildError(e)}); }
      catch(...){ errors.push_back({"startup", "unknown error"}); }
    }
    std::lock_guard<std::mutex> lock(m_mutex);
    _publishStatusLocked(std::move(errors));
  }


  std::string PipelineHost::_describeBuildError(const std::exception& e) const
  {
    return m_options.describeBuildError ? m_options.describeBuildError(e) : e.what();
  }


  HostStatus PipelineHost::status() const
  {
    std::lock_guard<std::mutex> lock(m_statusMutex);
    return m_status;
  }


  void PipelineHost::_publishStatusLocked(std::vector<HostError> errors)
  {
    HostState state;
    if(m_paused.load()){ state = HostState::Paused; }
    else if(m_pipeline){ state = HostState::Running; }
    else{ state = errors.empty() ? HostState::Idle : HostState::Failed; }

    std::lock_guard<std::mutex> lock(m_statusMutex);
    m_status = HostStatus{state, std::move(errors)};
  }


  void PipelineHost::_recordFailure(const char* source, const std::string& message)
  {
    std::lock_guard<std::mutex> change(m_changeMutex);
    std::lock_guard<std::mutex> lock(m_mutex);
    if(m_pipeline || m_paused.load()){ return; }
    _publishStatusLocked({HostError{source, message}});
  }


  PipelineCapabilities PipelineHost::capabilities() const
  {
    const std::uint8_t bits = m_capabilityBits.load();
    PipelineCapabilities capabilities;
    capabilities.usesVideoInput = (bits & kUsesVideoInput) != 0;
    capabilities.usesAudioInput = (bits & kUsesAudioInput) != 0;
    capabilities.samplesZones = (bits & kSamplesZones) != 0;
    return capabilities;
  }


  void PipelineHost::_storeCapabilities(const Pipeline* pipeline)
  {
    std::uint8_t bits = 0;
    if(pipeline){
      const PipelineCapabilities capabilities = pipeline->capabilities();
      if(capabilities.usesVideoInput){ bits |= kUsesVideoInput; }
      if(capabilities.usesAudioInput){ bits |= kUsesAudioInput; }
      if(capabilities.samplesZones){ bits |= kSamplesZones; }
    }
    m_capabilityBits.store(bits);
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
    if(m_pipeline){ return m_pipeline->listMonitors(); }
    return m_paused ? m_pausedMonitors : Input::Monitors{};
  }


  ZoneListResult PipelineHost::listZones()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    if(m_pipeline){ return m_pipeline->listZones(); }
    return m_paused ? m_pausedZones : ZoneListResult{};
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


  bool PipelineHost::applyConfig(const Config& next)
  {
    std::lock_guard<std::mutex> change(m_changeMutex);

    std::function<void()> afterUnlock;
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      if(!m_pipeline){
        return false;
      }

      ConfigApplyResult result = m_pipeline->applyConfig(next);
      if(result.needsReload){
        return false;
      }
      afterUnlock = std::move(result.afterUnlock);
    }

    if(afterUnlock){
      afterUnlock();
    }
    _log(m_options, LogLevel::Info, "Config applied live, no pipeline reload.");
    return true;
  }


  bool PipelineHost::reload(
    const Registry& registry,
    const Config& config,
    const std::filesystem::path& configRoot,
    std::string& errorOut
  )
  {
    // Paused: the config is already on disk and applies on resume.
    if(m_paused){ return true; }

    ScopedPhaseTimer reloadTimer(m_options, "reload total");
    std::unique_ptr<Pipeline> next;
    try{
      next = Pipeline::build(registry, config, configRoot, m_options);
    }
    catch(const std::exception& e){
      errorOut = _describeBuildError(e);
      _recordFailure("reload", errorOut);
      return false;
    }

    std::unique_ptr<Pipeline> previous;
    bool discardNext = false;
    {
      std::lock_guard<std::mutex> change(m_changeMutex);
      std::lock_guard<std::mutex> lock(m_mutex);
      // A pause() that landed during the build wins.
      if(m_paused){
        discardNext = true;
      }
      else{
        previous = std::move(m_pipeline);
        m_pipeline = std::move(next);
        _storeCapabilities(m_pipeline.get());
        _publishStatusLocked({});
      }
    }
    if(discardNext){
      if(next){ next->shutdown(/*isReplacement*/ true); }
      return true;
    }
    // previous is null on the first successful reload after a fresh
    // install started with no Pipeline at all.
    if(previous){ previous->shutdown(/*isReplacement*/ true); }
    return true;
  }


  bool PipelineHost::pause()
  {
    std::lock_guard<std::mutex> pauseLock(m_pauseMutex);

    std::unique_ptr<Pipeline> previous;
    {
      std::lock_guard<std::mutex> change(m_changeMutex);
      std::lock_guard<std::mutex> lock(m_mutex);
      if(m_paused || !m_pipeline){ return false; }

      m_pausedMonitors = m_pipeline->listMonitors();
      m_pausedZones = m_pipeline->listZones();
      previous = std::move(m_pipeline);
      m_paused = true;
      _publishStatusLocked({});
    }
    // Outside the lock: Hue's disableStreaming is a blocking HTTP call that
    // must not stall tick() or zone calls.
    previous->shutdown(/*isReplacement*/ false);
    return true;
  }


  bool PipelineHost::setRunning(
    bool running,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::string& errorOut
  )
  {
    if(!running){
      if(pause() || isPaused()){ return true; }
      errorOut = kNothingToPause;
      return false;
    }
    if(isPaused()){
      return resume(registry, ConfigStore(configRoot).load(), configRoot, errorOut);
    }
    // A failed host has no pipeline and is not paused: running:true is the
    // retry, the same attempt POST /api/reload makes. Idle (nothing configured
    // yet) and running hosts have nothing to retry.
    if(status().state == HostState::Failed){
      return reload(registry, ConfigStore(configRoot).load(), configRoot, errorOut);
    }
    return true;
  }


  bool PipelineHost::resume(
    const Registry& registry,
    const Config& config,
    const std::filesystem::path& configRoot,
    std::string& errorOut
  )
  {
    std::lock_guard<std::mutex> pauseLock(m_pauseMutex);
    if(!m_paused){ return true; }

    ScopedPhaseTimer resumeTimer(m_options, "resume total");
    std::unique_ptr<Pipeline> next;
    try{
      next = Pipeline::build(registry, config, configRoot, m_options);
    }
    catch(const std::exception& e){
      errorOut = _describeBuildError(e);
      // Still paused (m_pauseMutex is held, so nothing can change that):
      // keep the reason on the paused snapshot.
      std::lock_guard<std::mutex> change(m_changeMutex);
      std::lock_guard<std::mutex> lock(m_mutex);
      _publishStatusLocked({HostError{"resume", errorOut}});
      return false;
    }

    std::lock_guard<std::mutex> change(m_changeMutex);
    std::lock_guard<std::mutex> lock(m_mutex);
    m_pipeline = std::move(next);
    _storeCapabilities(m_pipeline.get());
    m_pausedMonitors.clear();
    m_pausedZones = {};
    m_paused = false;
    _publishStatusLocked({});
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


  std::string applyConfigFromDisk(
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  )
  {
    Config freshConfig = ConfigStore(configRoot).load();
    if(pipelineHost.applyConfig(freshConfig)){
      return {};
    }

    std::string error;
    pipelineHost.reload(registry, freshConfig, configRoot, error);
    return error;
  }
}
