#include <Aurora/Runtime/Graph/AudioNodes.hpp>

#include <cmath>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include <Aurora/Processing/AudioFeatureExtractor.hpp>
#include <Aurora/Processing/AudioProcessing.hpp>
#include <Aurora/Runtime/AudioFrameCompositor.hpp>
#include <Aurora/Runtime/ControlDescriptorTables.hpp>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    using AudioSettings = Processing::AudioProcessing::AudioEffectSettings;

    // Schema (range, default, label) comes from the Config descriptor
    // tables, so node defaults always match the live Config defaults.
    ParamDecl floatParam(std::string name, std::string_view configKey, std::string description)
    {
      ParamDecl decl;
      decl.name = std::move(name);
      decl.kind = ParamKind::Float;
      decl.schema = paramSchema(configKey);
      decl.description = std::move(description);
      return decl;
    }

    ParamDecl fixedAnchorParam()
    {
      ParamDecl decl;
      decl.name = "fixedAnchorHue";
      decl.kind = ParamKind::OptionalFloat;
      decl.schema = paramSchema("audio.fixedAnchorHue"); // allowsUnset, default -1 (null in graph.json)
      decl.description = "Drift's starting hue in degrees; unset picks a random pair (null in graph.json).";
      return decl;
    }

    // the former AudioOrchestrator::setSettings re-seeds when the fixed hue changes to
    // a different hue. Nodes see params fresh each tick, so each stateful
    // node tracks the last value itself. First tick only records.
    bool changedAnchor(std::optional<float>& last, bool& hasLast, const std::optional<float>& current)
    {
      bool changed = hasLast && current.has_value() && current != last;
      last = current;
      hasLast = true;
      return changed;
    }

    // audio.capture: readNextBuffer every tick; empty -> Absent (today's
    // skipped tick). Reads IGraphHost::audioInput(), like video.capture
    // reads videoInput(). No device selection: the platform grabber's
    // default capture (all-apps tap on Mac, default-sink monitor on Linux,
    // default loopback on Windows) flows through unchanged.
    class AudioCaptureNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        Input::IAudioInput* input = ctx.requireHost().audioInput();
        if(input == nullptr){
          ctx.fail("needs an audio input but the host offers none");
        }
        input->readNextBuffer(m_scratch);
        if(m_scratch.samples.empty()){
          outputs.emplace("buffer", Absent{});
          return;
        }
        outputs.emplace("buffer", m_scratch);
      }

    private:
      std::vector<PortDecl> m_in{};
      std::vector<PortDecl> m_out{{"buffer", PortType::AudioBuffer, false}};
      Contracts::AudioBuffer m_scratch{};
    };

    // audio.features: the stateful aubio extractor, built lazily from the
    // first buffer's sampleRate -- aubio configures its objects at
    // construction, and the rate isn't known until data arrives. Same as
    // the former AudioOrchestrator's lazy m_featureExtractor.
    class AudioFeaturesNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const Contracts::AudioBuffer& buffer = ctx.input<Contracts::AudioBuffer>("buffer");
        if(buffer.samples.empty()){
          outputs.emplace("features", Absent{});
          return;
        }
        if(!m_extractor){
          m_extractor = std::make_unique<Processing::AudioProcessing::AudioFeatureExtractor>(
            buffer.sampleRate
          );
        }
        outputs.emplace("features", m_extractor->process(buffer));
      }

    private:
      std::vector<PortDecl> m_in{{"buffer", PortType::AudioBuffer, true}};
      std::vector<PortDecl> m_out{{"features", PortType::AudioFeatures, false}};
      std::unique_ptr<Processing::AudioProcessing::AudioFeatureExtractor> m_extractor{};
    };

    AudioSettings driftSettingsFrom(const EvalContext& ctx)
    {
      AudioSettings settings;
      settings.fixedAnchorHue = ctx.param<std::optional<float>>("fixedAnchorHue");
      settings.driftBaseRateDegPerSec = ctx.param<float>("driftBaseRateDegPerSec");
      settings.centroidStrength = ctx.param<float>("centroidStrength");
      settings.centroidRangeHz = ctx.param<float>("centroidRangeHz");
      return settings;
    }

    // audio.drift: owns DriftState, outputs the live anchor as an Angle.
    // First tick seeds from fixedAnchorHue (or random), matching
    // updateDrift's cold-start rule.
    class AudioDriftNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float dt,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const Contracts::AudioFeatures& features = ctx.input<Contracts::AudioFeatures>("features");
        AudioSettings settings = driftSettingsFrom(ctx);
        if(changedAnchor(m_lastAnchor, m_hasLast, settings.fixedAnchorHue)){
          m_state = Processing::AudioProcessing::DriftState{};
        }
        Processing::AudioProcessing::updateDrift(m_state, features, settings, dt);
        outputs.emplace("anchor", Angle{m_state.anchorHueDegrees});
      }

      bool checkStateInvariants() const override
      {
        return !m_state.initialized
          || (std::isfinite(m_state.anchorHueDegrees) && std::isfinite(m_state.rollingCentroid));
      }

      void resetState() override { m_state = Processing::AudioProcessing::DriftState{}; }

    private:
      std::vector<PortDecl> m_in{{"features", PortType::AudioFeatures, true}};
      std::vector<PortDecl> m_out{{"anchor", PortType::Angle, false}};
      Processing::AudioProcessing::DriftState m_state{};
      std::optional<float> m_lastAnchor{};
      bool m_hasLast{false};
    };

    AudioSettings bounceSettingsFrom(const EvalContext& ctx)
    {
      AudioSettings settings;
      settings.fixedAnchorHue = ctx.param<std::optional<float>>("fixedAnchorHue");
      settings.bounceSmoothTime = ctx.param<float>("bounceSmoothTime");
      settings.dynamismFloor = ctx.param<float>("dynamismFloor");
      settings.vibrancySaturation = ctx.param<float>("vibrancySaturation");
      settings.vibrancyValue = ctx.param<float>("vibrancyValue");
      settings.referenceRms = ctx.param<float>("referenceRms");
      settings.brightnessFloor = ctx.param<float>("brightnessFloor");
      settings.brightnessSmoothTime = ctx.param<float>("brightnessSmoothTime");
      return settings;
    }

    // audio.bounce: owns BounceState, reads the live anchor every tick and
    // outputs the Color to send. The anchor arrives as an Angle port (not
    // the whole DriftState -- bounce only reads anchorHueDegrees), so the
    // init branch still seeds current/target from the live anchor. Like
    // drift, resets on a fixedAnchorHue change so both ends re-seed
    // together, as the former AudioOrchestrator::setSettings resets both states.
    class AudioBounceNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float dt,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const Contracts::AudioFeatures& features = ctx.input<Contracts::AudioFeatures>("features");
        const Angle& anchor = ctx.input<Angle>("anchor");
        AudioSettings settings = bounceSettingsFrom(ctx);
        if(changedAnchor(m_lastAnchor, m_hasLast, settings.fixedAnchorHue)){
          m_state = Processing::AudioProcessing::BounceState{};
        }
        Processing::AudioProcessing::DriftState anchorShim;
        anchorShim.anchorHueDegrees = anchor.degrees;
        anchorShim.initialized = true;
        outputs.emplace(
          "color", Processing::AudioProcessing::updateBounce(m_state, anchorShim, features, settings, dt));
      }

      bool checkStateInvariants() const override
      {
        return !m_state.initialized
          || (std::isfinite(m_state.currentHueDegrees) && std::isfinite(m_state.targetHueDegrees)
            && std::isfinite(m_state.offsetDegrees)
            && std::isfinite(m_state.smoothedBrightnessFactor));
      }

      void resetState() override { m_state = Processing::AudioProcessing::BounceState{}; }

    private:
      std::vector<PortDecl> m_in{
        {"features", PortType::AudioFeatures, true},
        {"anchor", PortType::Angle, true},
      };
      std::vector<PortDecl> m_out{{"color", PortType::Color, false}};
      Processing::AudioProcessing::BounceState m_state{};
      std::optional<float> m_lastAnchor{};
      bool m_hasLast{false};
    };

    // frame.broadcast: composeAudioFrame over the live zone map for one
    // output, read every tick so updateZone edits apply without a reload.
    class FrameBroadcastNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const Contracts::Color& color = ctx.input<Contracts::Color>("color");
        const std::string& outputName = ctx.param<std::string>("output");
        if(outputName.empty()){
          ctx.fail("needs param 'output' naming an output (expected an output the app registered)");
        }
        const ZoneMap* zoneMap = ctx.requireHost().zoneMap(outputName);
        if(zoneMap == nullptr){
          ctx.fail("unknown output '" + outputName + "' (expected an output the app registered)");
        }
        outputs.emplace("frame", composeAudioFrame(color, *zoneMap));
      }

    private:
      std::vector<PortDecl> m_in{{"color", PortType::Color, true}};
      std::vector<PortDecl> m_out{{"frame", PortType::Frame, false}};
    };
  } // namespace

  void registerAudioNodes(NodeRegistry& registry)
  {
    ParamDecl broadcastOutput;
    broadcastOutput.name = "output";
    broadcastOutput.kind = ParamKind::Enum;
    broadcastOutput.enumOptions = {}; // any output name; checked against knownOutputs at load
    broadcastOutput.defaultEnum = "";
    broadcastOutput.description =
      "Output whose live zone map receives the color (per-output binding, not a port).";

    registry.registerType(
      "frame.broadcast",
      NodeTypeInfo{
        .meta =
          {
            .purpose = "Apply one Color to every active zone of an output as a Frame.",
            .useWhen = "After audio.bounce; audio has no per-zone spatial concept.",
            .example = "{\"id\": \"all\", \"type\": \"frame.broadcast\", \"params\": {\"output\": \"hue\"}}",
            .cost = "cheap",
          },
        .inputs = {{"color", PortType::Color, true}},
        .outputs = {{"frame", PortType::Frame, false}},
        .params = {broadcastOutput},
        .factory = [] { return std::make_unique<FrameBroadcastNode>(); },
      });

    registry.registerType(
      "audio.capture",
      NodeTypeInfo{
        .meta =
          {
            .purpose = "Read one audio buffer per tick; Absent while the source has no data.",
            .useWhen = "First node of any audio path.",
            .example = "{\"id\": \"mic\", \"type\": \"audio.capture\", \"params\": {}}",
            .cost = "moderate",
          },
        .inputs = {},
        .outputs = {{"buffer", PortType::AudioBuffer, false}},
        .params = {},
        .factory = [] { return std::make_unique<AudioCaptureNode>(); },
      });

    registry.registerType(
      "audio.features",
      NodeTypeInfo{
        .meta =
          {
            .purpose = "Extract onset, loudness and centroid features from an audio buffer.",
            .useWhen = "After capture; feeds drift and bounce.",
            .example = "{\"id\": \"feat\", \"type\": \"audio.features\", \"params\": {}}",
            .cost = "moderate",
          },
        .inputs = {{"buffer", PortType::AudioBuffer, true}},
        .outputs = {{"features", PortType::AudioFeatures, false}},
        .params = {},
        .factory = [] { return std::make_unique<AudioFeaturesNode>(); },
      });

    registry.registerType(
      "audio.drift",
      NodeTypeInfo{
        .meta =
          {
            .purpose = "Slow palette drift; outputs the live anchor hue as an Angle.",
            .useWhen = "After features; wire the anchor into audio.bounce.",
            .example =
              "{\"id\": \"drift\", \"type\": \"audio.drift\", \"params\": {\"fixedAnchorHue\": null}}",
            .cost = "cheap",
          },
        .inputs = {{"features", PortType::AudioFeatures, true}},
        .outputs = {{"anchor", PortType::Angle, false}},
        .params =
          {fixedAnchorParam(),
           floatParam(
             "driftBaseRateDegPerSec",
             "audio.driftBaseRateDegPerSec",
             "Idle drift speed in degrees per second (today's audio.driftBaseRateDegPerSec)."),
           floatParam(
             "centroidStrength",
             "audio.centroidStrength",
             "How much spectral centroid speeds or slows the drift (today's audio.centroidStrength)."),
           floatParam(
             "centroidRangeHz",
             "audio.centroidRangeHz",
             "Pitch spread normalizing the centroid nudge (today's audio.centroidRangeHz).")},
        .factory = [] { return std::make_unique<AudioDriftNode>(); },
      });

    registry.registerType(
      "audio.bounce",
      NodeTypeInfo{
        .meta =
          {
            .purpose = "Beat-driven color bounce around the drift anchor; outputs a Color.",
            .useWhen = "After features and the drift anchor; the audio path's color output.",
            .example =
              "{\"id\": \"beat\", \"type\": \"audio.bounce\", \"params\": {\"bounceSmoothTime\": 0.285}}",
            .cost = "cheap",
          },
        .inputs =
          {{"features", PortType::AudioFeatures, true},
           {"anchor", PortType::Angle, true}},
        .outputs = {{"color", PortType::Color, false}},
        .params =
          {fixedAnchorParam(),
           floatParam(
             "bounceSmoothTime",
             "audio.bounceSmoothTime",
             "Beat hue damping time constant (today's audio.bounceSmoothTime)."),
           floatParam(
             "dynamismFloor",
             "audio.dynamismFloor",
             "Minimum swing fraction even for the weakest onset (today's audio.dynamismFloor)."),
           floatParam(
             "vibrancySaturation",
             "audio.vibrancySaturation",
             "HSV saturation of every generated color (today's audio.vibrancySaturation)."),
           floatParam(
             "vibrancyValue",
             "audio.vibrancyValue",
             "Brightness ceiling before loudness scaling (today's audio.vibrancyValue)."),
           floatParam(
             "referenceRms",
             "audio.referenceRms",
             "Loudness mapped to full brightness (today's audio.referenceRms)."),
           floatParam(
             "brightnessFloor",
             "audio.brightnessFloor",
             "Darkest output when quiet (today's audio.brightnessFloor)."),
           floatParam(
             "brightnessSmoothTime",
             "audio.brightnessSmoothTime",
             "Loudness damping time constant (today's audio.brightnessSmoothTime).")},
        .factory = [] { return std::make_unique<AudioBounceNode>(); },
      });
  }
} // namespace Aurora::Runtime::Graph
