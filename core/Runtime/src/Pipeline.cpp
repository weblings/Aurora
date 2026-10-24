#include <Aurora/Runtime/Pipeline.hpp>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <stdexcept>

#include <Aurora/Runtime/ConfigApply.hpp>
#include <Aurora/Runtime/ConfigStore.hpp>
#include <Aurora/Runtime/EffectStore.hpp>
#include <Aurora/Runtime/MonitorSelector.hpp>
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


    struct SourceNeeds
    {
      bool video{false};
      bool audio{false};
    };

    // A built-in effect uses the inputs its pipeline mode captures (Aurora-5ipy.26).
    PipelineSummary::GraphInputs _builtInInputs(const PipelineCapabilities& capabilities)
    {
      return {capabilities.usesVideoInput, capabilities.usesAudioInput};
    }

    // Which capture sources a graph doc declares, by node type.
    SourceNeeds _sourceNeeds(const nlohmann::json& doc)
    {
      SourceNeeds needs;
      const auto nodes = doc.find("nodes");
      if(nodes == doc.end() || !nodes->is_array()){
        return needs;
      }
      for(const auto& node : *nodes){
        const std::string type = node.is_object() ? node.value("type", std::string{}) : std::string{};
        needs.video = needs.video || type == "video.capture";
        needs.audio = needs.audio || type == "audio.capture";
      }
      return needs;
    }


    struct ModePlan
    {
      bool audioMode{false};
      bool bothInputs{false};
      // Set when the graph needs a source whose input is not configured.
      std::string missing;
    };

    // Which inputs a pipeline runs: the config picks (video wins when both
    // are named), then a custom graph's source nodes override.
    ModePlan _planMode(const Config& config, const nlohmann::json* doc)
    {
      ModePlan plan;
      plan.audioMode = config.activeInputName().empty();
      if(!doc){
        return plan;
      }

      const SourceNeeds needs = _sourceNeeds(*doc);
      const bool haveVideo = !config.activeInputName().empty();
      const bool haveAudio = !config.activeAudioInputName().empty();
      if((needs.video && !haveVideo) || (needs.audio && !haveAudio)){
        plan.missing = std::string("graph needs ") + (needs.video && !haveVideo ? "a video" : "an audio")
          + " input but none is configured";
      }
      else if(needs.video && needs.audio){
        plan.bothInputs = true;
      }
      else if(needs.audio){
        plan.audioMode = true;
      }
      else if(needs.video){
        plan.audioMode = false;
      }
      return plan;
    }


    constexpr std::uint8_t kUsesVideoInput = 1u << 0;
    constexpr std::uint8_t kUsesAudioInput = 1u << 1;
    constexpr std::uint8_t kSamplesZones = 1u << 2;
  }


  std::unique_ptr<Pipeline> Pipeline::build(
    const Registry& registry,
    const Config& config,
    const std::filesystem::path& configRoot,
    const PipelineOptions& options,
    const PipelineBuildOverrides& overrides
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
    if(overrides.outputsFrom && overrides.outputsFrom->m_outputKeys == outputNames){
      pipeline->m_outputKeys = outputNames;
      pipeline->m_outputPtrs = overrides.outputsFrom->m_outputPtrs;
      pipeline->m_borrowedOutputs = true;
    }
    else{
      for(const auto& name : outputNames){
        auto output = registry.createOutput(name);
        if(!output){
          _log(options, LogLevel::Error, "Unknown output '" + name + "', skipping");
          continue;
        }
        output->init();
        pipeline->m_outputKeys.push_back(name);
        pipeline->m_outputPtrs.push_back(output.get());
        pipeline->m_outputs.push_back(std::move(output));
      }
    }

    if(pipeline->m_outputPtrs.empty()){
      throw std::runtime_error("No outputs available -- nothing to drive");
    }

    // Video wins if both could apply -- explicit opt-in to audio requires
    // leaving activeInputName unset. Past the early return above, an empty
    // activeInputName therefore always means audio mode. A custom graph's
    // source nodes override this below.
    bool useAudioMode = config.activeInputName().empty();

    // Aurora-o13 spike: presence-only flag, same convention as
    // AURORA_DEV_LIGHT_TAP. Builds both inputs when both names are set;
    // logs per-runner tick timing in every mode, for comparison.
    const bool dualFlag = std::getenv("AURORA_DEV_DUAL_CAPTURE") != nullptr;
    const bool dualCapture = dualFlag
      && !config.activeInputName().empty() && !config.activeAudioInputName().empty();
    if(dualFlag){
      pipeline->m_dualStats.log = [options](LogLevel level, const std::string& line){ _log(options, level, line); };
    }

    // A custom effect runs on the primary runner only. An unreadable file
    // becomes the fallback reason; the dev dual-capture spike ignores customs.
    const std::string customId = dualCapture ? std::string{} : config.customEffectId();
    std::string customFailure;
    std::optional<nlohmann::json> customDoc;
    if(overrides.graph){
      if(dualCapture){
        throw std::runtime_error("a graph cannot run in place while the dual-capture spike runs");
      }
      customDoc = *overrides.graph;
    }
    else if(!customId.empty()){
      customDoc = EffectStore(configRoot).read(customId, customFailure);
    }

    // A custom graph picks its inputs from its source nodes. A source whose
    // input is not configured sends the graph back to the built-in.
    bool bothInputs = false;
    if(customDoc){
      const ModePlan plan = _planMode(config, &*customDoc);
      if(!plan.missing.empty()){
        if(overrides.graph){
          throw std::runtime_error(plan.missing);
        }
        customFailure = plan.missing;
        customDoc.reset();
      }
      else{
        useAudioMode = plan.audioMode;
        bothInputs = plan.bothInputs;
      }
    }

    // Inputs the running pipeline has open under what this build asks for are
    // reused, not reopened. Any difference in name, monitor, width or sink, or
    // the dev spike, opens a fresh one as before.
    Input::IVideoInput* borrowedVideo = nullptr;
    Input::IAudioInput* borrowedAudio = nullptr;
    if(const Pipeline* from = overrides.inputsFrom; from && !dualFlag && !(from->m_videoRunner && from->m_audioRunner)){
      const Config& live = from->m_appliedConfig;
      Input::IVideoInput* fromVideo = from->m_videoInput ? from->m_videoInput.get() : from->m_parkedVideo.get();
      Input::IAudioInput* fromAudio = from->m_audioInput ? from->m_audioInput.get() : from->m_parkedAudio.get();
      if(fromVideo
        && !config.activeInputName().empty()
        && config.activeInputName() == live.activeInputName()
        && config.activeMonitorName() == live.activeMonitorName()
        && config.subsampleWidth() != 0
        && config.subsampleWidth() == live.subsampleWidth()){
        borrowedVideo = fromVideo;
      }
      if(fromAudio
        && !config.activeAudioInputName().empty()
        && config.activeAudioInputName() == live.activeAudioInputName()
        && config.audioTargetSinkName() == live.audioTargetSinkName()){
        borrowedAudio = fromAudio;
      }
    }
    // What the summary and the runners use, owned here or borrowed.
    Input::IVideoInput* videoInput = nullptr;

    ScopedPhaseTimer captureTimer(options, "capture+graph init");
    if(dualCapture){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
      // Audio first: on Mac its TCC prompt and SCK's are separate gates, and
      // the order shows which one blocks the other.
      auto audioInput = registry.createAudioInput(config.activeAudioInputName());
      if(!audioInput){
        throw std::runtime_error("Unknown audio input '" + config.activeAudioInputName() + "'");
      }
      pipeline->m_audioRunner.emplace(
        *audioInput, pipeline->m_outputPtrs, config, ZoneMapStore(configRoot)
      );
      pipeline->m_audioRunner->init();
      pipeline->m_audioInput = std::move(audioInput);
      pipeline->m_isDualCapture = true;
      _log(options, LogLevel::Info, "[dual-capture] audio input='" + config.activeAudioInputName() + "' up; building video too");
#else
      throw std::runtime_error(options.noAudioSupportMessage);
#endif
    }
    if(useAudioMode){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
      std::unique_ptr<Input::IAudioInput> audioInput;
      if(!borrowedAudio){
        audioInput = registry.createAudioInput(config.activeAudioInputName());
        if(!audioInput){
          throw std::runtime_error("Unknown audio input '" + config.activeAudioInputName() + "'");
        }
      }

      pipeline->m_audioRunner.emplace(
        borrowedAudio ? *borrowedAudio : *audioInput, pipeline->m_outputPtrs, config, ZoneMapStore(configRoot)
      );
      if(customDoc){ pipeline->m_audioRunner->setCustomGraph(*customDoc); }
      pipeline->m_audioRunner->init();
      pipeline->m_audioInput = std::move(audioInput);
      pipeline->m_borrowedAudio = borrowedAudio != nullptr;
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
      std::unique_ptr<Input::IVideoInput> input;
      if(!borrowedVideo){
        input = registry.createInput(inputName);
        if(!input){
          throw std::runtime_error("Unknown input '" + inputName + "'");
        }
        input->init();
      }
      videoInput = borrowedVideo ? borrowedVideo : input.get();

      if(bothInputs){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
        std::unique_ptr<Input::IAudioInput> audioInput;
        if(!borrowedAudio){
          audioInput = registry.createAudioInput(config.activeAudioInputName());
          if(!audioInput){
            throw std::runtime_error("Unknown audio input '" + config.activeAudioInputName() + "'");
          }
        }
        pipeline->m_videoRunner.emplace(
          *videoInput, borrowedAudio ? *borrowedAudio : *audioInput, pipeline->m_outputPtrs, config, ZoneMapStore(configRoot)
        );
        pipeline->m_audioInput = std::move(audioInput);
        pipeline->m_borrowedAudio = borrowedAudio != nullptr;
        pipeline->m_isDualCapture = true;
        pipeline->m_bothInputs = true;
#else
        throw std::runtime_error(options.noAudioSupportMessage);
#endif
      }
      else{
        pipeline->m_videoRunner.emplace(
          *videoInput, pipeline->m_outputPtrs, config, ZoneMapStore(configRoot)
        );
      }
      if(customDoc){ pipeline->m_videoRunner->setCustomGraph(*customDoc); }
      pipeline->m_videoRunner->init(/*videoReady*/ borrowedVideo != nullptr);
      pipeline->m_videoInput = std::move(input);
      pipeline->m_borrowedVideo = borrowedVideo != nullptr;
      pipeline->m_isAudioMode = false;
      // Post-derivation: refreshRate/subsampleWidth are the display-derived
      // values, matching what the settings save now holds on disk.
      pipeline->m_appliedConfig = pipeline->m_videoRunner->config();
      pipeline->m_tickIntervalSeconds = Runtime::tickIntervalSeconds(pipeline->m_videoRunner->config().refreshRate());

      // Persists any refreshRate/subsampleWidth just derived from the
      // display -- same as main() always did right after construction.
      // Only those two fields, and only where still unset on disk: this
      // runs after output init (1-3s on Hue), so saving the whole Config
      // built from the pre-init load would overwrite a settings PUT that
      // landed meanwhile (Aurora-d6i7).
      const Config& derived = pipeline->m_videoRunner->config();
      // A legacy monitor name is rewritten to its key, but only if disk still
      // holds that name (no reload: update() never triggers one).
      const std::string legacyMonitor = config.activeMonitorName();
      ConfigStore(configRoot).update([&derived, &legacyMonitor](Config& onDisk){
        bool changed = false;
        if(!legacyMonitor.empty() && derived.activeMonitorName() != legacyMonitor
          && onDisk.activeMonitorName() == legacyMonitor){
          onDisk.setActiveMonitorName(derived.activeMonitorName());
          changed = true;
        }
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
        "Aurora running: input='" + inputName + "'"
        + (bothInputs ? ", audio input='" + config.activeAudioInputName() + "'" : std::string{}) + ", "
        + std::to_string(pipeline->m_outputPtrs.size()) + " output(s).");
    }

    // Audio-only is the audio graph; video (plain or dual-capture) is the
    // video graph, matching what the dev spike runs as primary.
    const std::string builtInId = useAudioMode ? kBuiltInAudioEffectId : kBuiltInVideoEffectId;
    if(overrides.graph){
      // A test on lights: the graph runs, the summary keeps naming the live effect.
      const GraphRunner& primary = useAudioMode ? *pipeline->m_audioRunner : *pipeline->m_videoRunner;
      if(!primary.runningCustom()){
        throw std::runtime_error("the graph failed to load: " + primary.customError());
      }
      const std::string liveBuiltIn = _planMode(config, nullptr).audioMode ? kBuiltInAudioEffectId : kBuiltInVideoEffectId;
      pipeline->m_summary.effect = customId.empty() ? liveBuiltIn : customId;
      pipeline->m_summary.requestedEffect = pipeline->m_summary.effect;
      const SourceNeeds needs = _sourceNeeds(*customDoc);
      pipeline->m_summary.graphInputs = PipelineSummary::GraphInputs{needs.video, needs.audio};
    }
    else{
      pipeline->m_summary.effect = builtInId;
      pipeline->m_summary.requestedEffect = customId.empty() ? builtInId : customId;
    }
    if(!customId.empty() && !overrides.graph){
      const GraphRunner& primary = useAudioMode ? *pipeline->m_audioRunner : *pipeline->m_videoRunner;
      if(primary.runningCustom()){
        pipeline->m_summary.effect = customId;
        const SourceNeeds needs = _sourceNeeds(*customDoc);
        pipeline->m_summary.graphInputs = PipelineSummary::GraphInputs{needs.video, needs.audio};
      }
      else{
        pipeline->m_summary.fallbackReason = customFailure.empty() ? primary.customError() : customFailure;
      }
    }
    if(!pipeline->m_summary.graphInputs){
      pipeline->m_summary.graphInputs = _builtInInputs(pipeline->capabilities());
    }
    if(!useAudioMode){
      pipeline->m_summary.video = PipelineSummary::Video{
        config.activeInputName(), videoInput->selectedMonitorName()
      };
    }
    if(useAudioMode || dualCapture || bothInputs){
      pipeline->m_summary.audio = PipelineSummary::Audio{
        config.activeAudioInputName(),
        config.audioTargetSinkName(),
        config.audioTargetSinkName().empty()
      };
    }

    return pipeline;
  }


  std::optional<GraphPreview::Inputs> openPreviewInputs(
    const Registry& registry, const PreviewInputPlan& plan, std::string& errorOut)
  {
    GraphPreview::Inputs inputs;
    if(!plan.video.empty()){
      inputs.video = registry.createInput(plan.video);
      if(!inputs.video){
        errorOut = "Unknown input '" + plan.video + "'";
        return std::nullopt;
      }
      inputs.video->init();
      selectConfiguredMonitor(*inputs.video, plan.config);
      if(plan.config.subsampleWidth() != 0){
        inputs.video->setCaptureWidthHint(plan.config.subsampleWidth());
      }
    }
    if(!plan.audio.empty()){
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
      inputs.audio = registry.createAudioInput(plan.audio);
      if(!inputs.audio){
        errorOut = "Unknown audio input '" + plan.audio + "'";
        return std::nullopt;
      }
#else
      errorOut = "this build has no audio support";
      return std::nullopt;
#endif
    }
    return inputs;
  }


  ConfigApplyResult Pipeline::applyConfig(const Config& next)
  {
    const ChangeAction action = planConfigChange(m_appliedConfig, next, m_isAudioMode);
    if(action == ChangeAction::Reload){
      return {/*needsReload*/ true, {}};
    }

    ConfigApplyResult result;
    if(action == ChangeAction::Hot){
      std::string error;
      if(m_isAudioMode){
        if(!m_audioRunner->setConfig(next, error)){
          return {/*needsReload*/ true, {}};
        }
      }
      else{
        const unsigned width = next.subsampleWidth();
        const bool widthChanged = width != m_appliedConfig.subsampleWidth();

        if(!m_videoRunner->setConfig(next, error)){
          return {/*needsReload*/ true, {}};
        }
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


  bool Pipeline::swapEffect(const Config& next, const nlohmann::json& doc)
  {
    // The dev dual-capture spike runs two graphs; a swap has no one to target.
    if(m_videoRunner && m_audioRunner){
      return false;
    }

    // Anything but the effect id moving, or a graph that wants other inputs
    // than the ones running, needs the rebuild.
    Config probe = next;
    probe.setActiveEffectId(m_appliedConfig.activeEffectId());
    if(planConfigChange(m_appliedConfig, probe, m_isAudioMode) != ChangeAction::None){
      return false;
    }
    const ModePlan plan = _planMode(next, &doc);
    if(!plan.missing.empty() || plan.audioMode != m_isAudioMode || plan.bothInputs != m_bothInputs){
      return false;
    }

    std::string error;
    GraphRunner& runner = m_isAudioMode ? *m_audioRunner : *m_videoRunner;
    if(!runner.swapCustomGraph(doc, error)){
      return false;
    }

    const std::string id = next.customEffectId();
    m_summary.effect = id;
    m_summary.requestedEffect = id;
    m_summary.fallbackReason.clear();
    const SourceNeeds needs = _sourceNeeds(doc);
    m_summary.graphInputs = PipelineSummary::GraphInputs{needs.video, needs.audio};
    m_appliedConfig.setActiveEffectId(next.activeEffectId());
    return true;
  }


  bool Pipeline::testGraph(const nlohmann::json& doc)
  {
    if(m_videoRunner && m_audioRunner){
      return false;
    }
    const ModePlan plan = _planMode(m_appliedConfig, &doc);
    if(!plan.missing.empty() || plan.audioMode != m_isAudioMode || plan.bothInputs != m_bothInputs){
      return false;
    }
    std::string error;
    if(!(m_isAudioMode ? *m_audioRunner : *m_videoRunner).restoreGraph(doc, error)){
      return false;
    }
    const SourceNeeds needs = _sourceNeeds(doc);
    m_summary.graphInputs = PipelineSummary::GraphInputs{needs.video, needs.audio};
    return true;
  }


  void Pipeline::adoptOutputsFrom(Pipeline& previous)
  {
    m_outputs = std::move(previous.m_outputs);
    previous.m_outputs.clear();
    previous.m_outputPtrs.clear();
    m_borrowedOutputs = false;
  }


  void Pipeline::adoptInputsFrom(Pipeline& previous, bool parkUnused)
  {
    // An input is in one slot of `previous`: in use, or parked by an earlier test.
    auto takeVideo = [&previous]{
      return previous.m_videoInput ? std::move(previous.m_videoInput) : std::move(previous.m_parkedVideo);
    };
    auto takeAudio = [&previous]{
      return previous.m_audioInput ? std::move(previous.m_audioInput) : std::move(previous.m_parkedAudio);
    };

    if(m_borrowedVideo){
      m_videoInput = takeVideo();
      m_borrowedVideo = false;
    }
    if(m_borrowedAudio){
      m_audioInput = takeAudio();
      m_borrowedAudio = false;
    }
    if(parkUnused){
      if(!m_videoInput){ m_parkedVideo = takeVideo(); }
      if(!m_audioInput){ m_parkedAudio = takeAudio(); }
    }
  }


  std::optional<PreviewInputPlan> Pipeline::previewInputsFor(const nlohmann::json& doc, std::string& errorOut) const
  {
    if(m_videoRunner && m_audioRunner){
      errorOut = "preview is off while the dual-capture spike runs";
      return std::nullopt;
    }
    // What the live runner serves: video unless audio-only, audio when audio-only or both.
    const SourceNeeds needs = _sourceNeeds(doc);
    PreviewInputPlan plan;
    plan.config = m_appliedConfig;
    if(needs.video && m_isAudioMode){
      plan.video = m_appliedConfig.activeInputName();
      if(plan.video.empty()){
        errorOut = "graph needs a video input but none is configured";
        return std::nullopt;
      }
    }
    if(needs.audio && !m_isAudioMode && !m_bothInputs){
      plan.audio = m_appliedConfig.activeAudioInputName();
      if(plan.audio.empty()){
        errorOut = "graph needs an audio input but none is configured";
        return std::nullopt;
      }
    }
    return plan;
  }


  std::shared_ptr<GraphPreview> Pipeline::openPreview(
    const std::string& session, const nlohmann::json& doc, GraphPreview::Inputs inputs, std::string& errorOut)
  {
    // Recheck against the inputs handed in: the pipeline may have changed since
    // previewInputsFor(), and the plan itself is not trusted past the lock.
    const auto plan = previewInputsFor(doc, errorOut);
    if(!plan){
      return nullptr;
    }
    if((!plan->video.empty() && !inputs.video) || (!plan->audio.empty() && !inputs.audio)){
      errorOut = "the preview's inputs do not cover what the graph needs";
      return nullptr;
    }
    return (m_isAudioMode ? *m_audioRunner : *m_videoRunner).openPreview(session, doc, std::move(inputs), errorOut);
  }


  bool Pipeline::reloadPreview(GraphPreview& preview, const nlohmann::json& doc, std::string& errorOut)
  {
    // An edit can add a source nobody opened; the stream has to restart to open it.
    const SourceNeeds needs = _sourceNeeds(doc);
    const bool haveVideo = !m_isAudioMode || preview.hasVideo();
    const bool haveAudio = m_isAudioMode || m_bothInputs || preview.hasAudio();
    if((needs.video && !haveVideo) || (needs.audio && !haveAudio)){
      errorOut = std::string("the draft now needs a ") + (needs.video && !haveVideo ? "video" : "audio")
        + " input the preview did not open; reconnect the preview";
      return false;
    }
    return (m_isAudioMode ? *m_audioRunner : *m_videoRunner).reloadPreview(preview, doc, errorOut);
  }


  void Pipeline::closePreview(const std::string& session, const GraphPreview* preview)
  {
    (m_isAudioMode ? *m_audioRunner : *m_videoRunner).closePreview(session, preview);
  }


  bool Pipeline::restoreEffect(const Config& live, const std::optional<nlohmann::json>& doc)
  {
    if(doc){
      return swapEffect(live, *doc);
    }
    if(m_videoRunner && m_audioRunner){
      return false;
    }
    // A built-in restore only undoes the graph swap: any Config change since
    // goes through the usual apply or reload.
    if(planConfigChange(m_appliedConfig, live, m_isAudioMode) != ChangeAction::None
      || live.activeEffectId() != m_appliedConfig.activeEffectId()
      || m_bothInputs){
      return false;
    }
    std::string error;
    if(!(m_isAudioMode ? *m_audioRunner : *m_videoRunner).restoreGraph(std::nullopt, error)){
      return false;
    }
    m_summary.graphInputs = _builtInInputs(capabilities());
    return true;
  }


  void Pipeline::tick(float dt)
  {
    if(m_dualStats.log){
      // Video then audio. Both send to the same outputs every tick, so the
      // output sees two frames per tick, one from each.
      using Clock = std::chrono::steady_clock;
      DualCaptureStats& s = m_dualStats;
      const auto t0 = Clock::now();
      if(s.ticks == 0){ s.windowStart = t0; }
      if(m_videoRunner){ m_videoRunner->tick(dt); }
      const auto t1 = Clock::now();
      if(m_audioRunner){ m_audioRunner->tick(dt); }
      const auto t2 = Clock::now();

      const double videoMs = std::chrono::duration<double, std::milli>(t1 - t0).count();
      const double audioMs = std::chrono::duration<double, std::milli>(t2 - t1).count();
      s.videoSum += videoMs; s.videoMax = std::max(s.videoMax, videoMs);
      s.audioSum += audioMs; s.audioMax = std::max(s.audioMax, audioMs);
      ++s.ticks;
      const double elapsed = std::chrono::duration<double>(t2 - s.windowStart).count();
      if(elapsed >= 5.0){
        char line[220];
        std::snprintf(line, sizeof(line),
          "[dual-capture] %s %u ticks/%.1fs (%.1f Hz): video avg %.2f max %.2f ms, audio avg %.2f max %.2f ms, budget %.2f ms",
          m_isDualCapture ? "both" : (m_isAudioMode ? "audio-only" : "video-only"),
          s.ticks, elapsed, s.ticks / elapsed, s.videoSum / s.ticks, s.videoMax, s.audioSum / s.ticks, s.audioMax, dt * 1000.0);
        s.log(LogLevel::Info, line);
        std::cout.flush(); // app stdout is block-buffered under the devstack
        DualCaptureStats fresh;
        fresh.log = std::move(s.log);
        s = std::move(fresh);
      }
      return;
    }
    if(m_isAudioMode){
      m_audioRunner->tick(dt);
    }
    else{
      m_videoRunner->tick(dt);
    }
  }


  PipelineCapabilities Pipeline::capabilities() const
  {
    // One built-in graph per pipeline today: video samples zones, audio
    // doesn't. Arbitrary graphs will set these per node instead.
    PipelineCapabilities capabilities;
    capabilities.usesVideoInput = !m_isAudioMode;
    capabilities.usesAudioInput = m_isAudioMode || m_isDualCapture;
    capabilities.samplesZones = !m_isAudioMode;
    return capabilities;
  }


  Input::Monitors Pipeline::listMonitors() const
  {
    return m_videoInput ? m_videoInput->monitors() : Input::Monitors{};
  }


  Input::IAudioInput* Pipeline::audioInput() const
  {
    return (m_isAudioMode || m_isDualCapture) ? m_audioInput.get() : nullptr;
  }


  nlohmann::json Pipeline::graphJson() const
  {
    return (m_isAudioMode ? *m_audioRunner : *m_videoRunner).graphJson();
  }


  ZoneListResult Pipeline::listZones() const
  {
    if(m_outputPtrs.empty()){
      return {};
    }

    const std::string& name = m_outputPtrs.front()->name();
    const GraphRunner& runner = m_isAudioMode ? *m_audioRunner : *m_videoRunner;
    return {name, runner.zoneMap(name), m_outputPtrs.front()->zoneLabels()};
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

    GraphRunner& runner = m_isAudioMode ? *m_audioRunner : *m_videoRunner;
    return runner.updateZone(m_outputPtrs.front()->name(), zoneId, uvs, active, gamma);
  }


  void Pipeline::shutdown(bool isReplacement)
  {
    // Borrowed outputs belong to the pipeline they came from.
    if(m_borrowedOutputs){
      return;
    }
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
    for(HostError& error : errors){ error.id = m_nextErrorId++; }
    if(errors.empty()){
      _publishBuiltLocked();
    }
    else{
      _publishStatusLocked(std::move(errors));
    }
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

    {
      std::lock_guard<std::mutex> lock(m_statusMutex);
      m_status = HostStatus{state, std::move(errors)};
    }
    m_changes.bump();
  }


  void PipelineHost::_publishBuiltLocked()
  {
    m_captureError.clear();
    std::vector<HostError> errors;
    if(m_pipeline && !m_pipeline->summary().fallbackReason.empty()){
      // After the build, not before: a successful build clears held errors,
      // and this one describes the build that just succeeded.
      const PipelineSummary summary = m_pipeline->summary();
      errors.push_back({
        "effect_fallback",
        "Custom effect '" + summary.requestedEffect + "' did not load, so " + summary.effect
          + " is running: " + summary.fallbackReason,
        m_nextErrorId++
      });
    }
    _publishStatusLocked(std::move(errors));
  }


  void PipelineHost::_setErrorLocked(const std::string& source, const std::string& message)
  {
    // Every writer of m_status holds m_mutex, so reading it here needs no
    // m_statusMutex.
    std::vector<HostError> errors = m_status.errors;
    const HostError entry{source, message, m_nextErrorId++};
    auto existing = std::find_if(errors.begin(), errors.end(), [&](const HostError& e){ return e.source == source; });
    if(existing != errors.end()){ *existing = entry; }
    else{ errors.push_back(entry); }
    _publishStatusLocked(std::move(errors));
  }


  void PipelineHost::_setBuildErrorLocked(const std::string& source, const std::string& message)
  {
    const auto isBuildSource = [](const std::string& name){
      return name == "startup" || name == "resume" || name == "reload";
    };
    std::vector<HostError> errors = m_status.errors;
    errors.erase(
      std::remove_if(errors.begin(), errors.end(), [&](const HostError& e){ return isBuildSource(e.source); }),
      errors.end()
    );
    errors.push_back({source, message, m_nextErrorId++});
    _publishStatusLocked(std::move(errors));
  }


  void PipelineHost::_recordFailure(const char* source, const std::string& message, std::uint64_t epoch)
  {
    std::lock_guard<std::mutex> change(m_changeMutex);
    std::lock_guard<std::mutex> lock(m_mutex);
    if(m_paused.load() || m_buildEpoch.load() != epoch){ return; }
    _setBuildErrorLocked(source, message);
  }


  bool PipelineHost::setError(const std::string& source, const std::string& message)
  {
    std::lock_guard<std::mutex> change(m_changeMutex);
    std::lock_guard<std::mutex> lock(m_mutex);
    if(m_paused.load() || !m_pipeline){ return false; }
    _setErrorLocked(source, message);
    return true;
  }


  void PipelineHost::setCondition(const std::string& source, const std::string& message)
  {
    {
      std::lock_guard<std::mutex> lock(m_conditionsMutex);
      bool found = false;
      for(HostCondition& condition : m_conditions){
        if(condition.source == source){
          condition.message = message;
          found = true;
          break;
        }
      }
      if(!found){ m_conditions.push_back({source, message}); }
    }
    m_changes.bump();
  }


  bool PipelineHost::clearCondition(const std::string& source)
  {
    {
      std::lock_guard<std::mutex> lock(m_conditionsMutex);
      const auto removed = std::remove_if(m_conditions.begin(), m_conditions.end(),
        [&](const HostCondition& c){ return c.source == source; });
      if(removed == m_conditions.end()){ return false; }
      m_conditions.erase(removed, m_conditions.end());
    }
    m_changes.bump();
    return true;
  }


  std::vector<HostCondition> PipelineHost::conditions() const
  {
    std::lock_guard<std::mutex> lock(m_conditionsMutex);
    return m_conditions;
  }


  bool PipelineHost::removeError(const std::string& source)
  {
    std::lock_guard<std::mutex> change(m_changeMutex);
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<HostError> errors = m_status.errors;
    const auto removed = std::remove_if(errors.begin(), errors.end(), [&](const HostError& e){ return e.source == source; });
    if(removed == errors.end()){ return false; }
    errors.erase(removed, errors.end());
    _publishStatusLocked(std::move(errors));
    return true;
  }


  PipelineHost::DismissResult PipelineHost::dismissError(const std::string& source, std::uint64_t id)
  {
    std::lock_guard<std::mutex> change(m_changeMutex);
    std::lock_guard<std::mutex> lock(m_mutex);
    if(m_paused.load() || !m_pipeline){ return DismissResult::NotRunning; }

    std::vector<HostError> errors = m_status.errors;
    const auto match = std::find_if(errors.begin(), errors.end(), [&](const HostError& e){
      return e.source == source && e.id == id;
    });
    if(match == errors.end()){ return DismissResult::Stale; }
    errors.erase(match);
    _publishStatusLocked(std::move(errors));
    return DismissResult::Removed;
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

    std::lock_guard<std::mutex> lock(m_summaryMutex);
    m_summary = pipeline ? pipeline->summary() : PipelineSummary{};
  }


  PipelineSummary PipelineHost::summary() const
  {
    std::lock_guard<std::mutex> lock(m_summaryMutex);
    return m_summary;
  }


  std::string PipelineHost::resolvedAudioSink()
  {
    if(!m_options.describeAudioSink){ return {}; }
    return withAudioInput([this](Input::IAudioInput* input){
      return input ? m_options.describeAudioSink(*input) : std::string{};
    });
  }


  double PipelineHost::tick()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    // Interval read under the same lock as the tick, so a concurrent
    // pipeline swap can't pair one pipeline's dt with another's tick.
    if(!m_pipeline){ return Runtime::tickIntervalSeconds(); }
    const double interval = m_pipeline->tickIntervalSeconds();
    m_pipeline->tick(static_cast<float>(interval));

    std::string captureError = m_pipeline->captureError();
    if(captureError != m_captureError){
      if(captureError.empty()){
        std::vector<HostError> errors = m_status.errors;
        errors.erase(std::remove_if(errors.begin(), errors.end(),
          [](const HostError& e){ return e.source == "video_capture"; }), errors.end());
        _publishStatusLocked(std::move(errors));
      }
      else{
        _setErrorLocked("video_capture", captureError);
      }
      m_captureError = std::move(captureError);
    }
    return interval;
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


  std::optional<nlohmann::json> PipelineHost::graphJson()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    if(!m_pipeline){ return std::nullopt; }
    return m_pipeline->graphJson();
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


  bool PipelineHost::_swapInPlace(const std::function<bool(Pipeline&)>& swap, bool clearFallback, const char* logLine)
  {
    std::lock_guard<std::mutex> change(m_changeMutex);
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      if(!m_pipeline || !swap(*m_pipeline)){
        return false;
      }
      _storeCapabilities(m_pipeline.get());

      if(clearFallback){
        // The effect now runs, so only its fallback entry goes.
        std::vector<HostError> errors = m_status.errors;
        errors.erase(
          std::remove_if(errors.begin(), errors.end(), [](const HostError& e){ return e.source == "effect_fallback"; }),
          errors.end()
        );
        _publishStatusLocked(std::move(errors));
      }
    }
    _log(m_options, LogLevel::Info, logLine);
    return true;
  }


  bool PipelineHost::applyEffect(const Config& next, const nlohmann::json& doc)
  {
    return _swapInPlace(
      [&](Pipeline& p){ return p.swapEffect(next, doc); }, true, "Effect applied live, no pipeline reload.");
  }


  bool PipelineHost::testGraph(const nlohmann::json& doc)
  {
    return _swapInPlace([&](Pipeline& p){ return p.testGraph(doc); }, false, "Test graph running on the lights.");
  }


  std::shared_ptr<GraphPreview> PipelineHost::openPreview(
    const std::string& session, const nlohmann::json& doc, const Registry& registry, std::string& errorOut)
  {
    PreviewInputPlan plan;
    std::uint64_t epoch = 0;
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      if(!m_pipeline){
        errorOut = "no pipeline is running";
        return nullptr;
      }
      auto needed = m_pipeline->previewInputsFor(doc, errorOut);
      if(!needed){
        return nullptr;
      }
      plan = std::move(*needed);
      epoch = m_buildEpoch.load();
    }

    // A capture API can block for seconds, so the lock is not held across it.
    GraphPreview::Inputs inputs;
    if(plan.any()){
      auto opened = openPreviewInputs(registry, plan, errorOut);
      if(!opened){
        return nullptr;
      }
      inputs = std::move(*opened);
    }

    std::lock_guard<std::mutex> lock(m_mutex);
    if(!m_pipeline || m_buildEpoch.load() != epoch){
      errorOut = "the pipeline changed while the preview opened its inputs";
      return nullptr;
    }
    return m_pipeline->openPreview(session, doc, std::move(inputs), errorOut);
  }


  bool PipelineHost::reloadPreview(GraphPreview& preview, const nlohmann::json& doc, std::string& errorOut)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    if(!m_pipeline){
      errorOut = "no pipeline is running";
      return false;
    }
    return m_pipeline->reloadPreview(preview, doc, errorOut);
  }


  void PipelineHost::closePreview(const std::string& session, const GraphPreview* preview)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    if(m_pipeline){
      m_pipeline->closePreview(session, preview);
    }
  }


  bool PipelineHost::restoreEffect(const Config& live, const std::optional<nlohmann::json>& doc)
  {
    return _swapInPlace(
      [&](Pipeline& p){ return p.restoreEffect(live, doc); }, true, "Live effect restored after a test.");
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
    const std::uint64_t epoch = m_buildEpoch.load();
    std::unique_ptr<Pipeline> next;
    try{
      next = Pipeline::build(registry, config, configRoot, m_options);
    }
    catch(const std::exception& e){
      errorOut = _describeBuildError(e);
      _recordFailure("reload", errorOut, epoch);
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
        ++m_buildEpoch;
        _publishBuiltLocked();
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


  bool PipelineHost::reloadInputs(
    const Registry& registry,
    const Config& config,
    const std::filesystem::path& configRoot,
    const nlohmann::json* graph,
    std::string& errorOut
  )
  {
    // Held through the build so the pipeline whose outputs the new one borrows
    // cannot be replaced, paused or destroyed meanwhile. Ticks are not blocked.
    std::lock_guard<std::mutex> change(m_changeMutex);
    if(m_paused || !m_pipeline){
      errorOut = "no pipeline is running";
      return false;
    }

    ScopedPhaseTimer timer(m_options, "input rebuild total");
    std::unique_ptr<Pipeline> next;
    try{
      PipelineBuildOverrides overrides;
      overrides.graph = graph;
      overrides.outputsFrom = m_pipeline.get();
      overrides.inputsFrom = m_pipeline.get();
      next = Pipeline::build(registry, config, configRoot, m_options, overrides);
    }
    catch(const std::exception& e){
      errorOut = _describeBuildError(e);
      return false;
    }
    if(!next){
      errorOut = "no input is configured";
      return false;
    }

    std::unique_ptr<Pipeline> previous;
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      previous = std::move(m_pipeline);
      if(next->borrowsOutputs()){
        next->adoptOutputsFrom(*previous);
      }
      // A test keeps the inputs its graph skips open, for the revert.
      next->adoptInputsFrom(*previous, /*parkUnused*/ graph != nullptr);
      m_pipeline = std::move(next);
      _storeCapabilities(m_pipeline.get());
      ++m_buildEpoch;
      _publishBuiltLocked();
    }
    // Shuts down nothing when the outputs moved on, else the replaced ones.
    previous->shutdown(/*isReplacement*/ true);
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
      _setBuildErrorLocked("resume", errorOut);
      return false;
    }

    std::lock_guard<std::mutex> change(m_changeMutex);
    std::lock_guard<std::mutex> lock(m_mutex);
    m_pipeline = std::move(next);
    _storeCapabilities(m_pipeline.get());
    m_pausedMonitors.clear();
    m_pausedZones = {};
    m_paused = false;
    ++m_buildEpoch;
    _publishBuiltLocked();
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


  std::string applyEffectFromDisk(
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  )
  {
    const Config freshConfig = ConfigStore(configRoot).load();
    const std::string id = freshConfig.customEffectId();
    if(id.empty()){
      return applyConfigFromDisk(pipelineHost, registry, configRoot);
    }

    std::string readError;
    if(auto doc = EffectStore(configRoot).read(id, readError)){
      if(pipelineHost.applyEffect(freshConfig, *doc)){
        return {};
      }
    }
    // Reload even when only the file changed: the config diff is empty then.
    return reloadPipelineFromDisk(pipelineHost, registry, configRoot);
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
