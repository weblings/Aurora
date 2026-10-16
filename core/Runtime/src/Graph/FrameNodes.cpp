#include <Aurora/Runtime/Graph/FrameNodes.hpp>

#include <cmath>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <glm/vec3.hpp>

#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/ControlDescriptorTables.hpp>
#include <Aurora/Runtime/Smoother.hpp>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    ParamDecl outputParam(std::string description)
    {
      ParamDecl decl;
      decl.name = "output";
      decl.kind = ParamKind::Enum;
      decl.enumOptions = {}; // any output name; checked against knownOutputs at load
      decl.defaultEnum = "";
      decl.description = std::move(description);
      return decl;
    }

    const std::string& requireOutputName(const EvalContext& ctx)
    {
      const std::string& outputName = ctx.param<std::string>("output");
      if(outputName.empty()){
        ctx.fail("needs param 'output' naming an output (expected an output the app registered)");
      }
      return outputName;
    }

    // frame.smooth: Smoother::smooth keyed by the bound output. Owns the
    // per-zone previous colors, so state survives ticks and graph swaps.
    class FrameSmoothNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const Contracts::Frame& frame = ctx.input<Contracts::Frame>("frame");
        const std::string& outputName = requireOutputName(ctx);
        outputs.emplace(
          "frame", m_smoother.smooth(outputName, frame, ctx.param<float>("smoothing")));
      }

      void resetState() override { m_smoother = Smoother{}; }

    private:
      std::vector<PortDecl> m_in{{"frame", PortType::Frame, true}};
      std::vector<PortDecl> m_out{{"frame", PortType::Frame, false}};
      Smoother m_smoother{};
    };

    // frame.smoothTime: time-based easing, 1 - exp(-dt/tau) per zone. State
    // is float so small steps are not lost to 8-bit rounding, and zones that
    // leave the frame are forgotten so a returning zone snaps.
    class FrameSmoothTimeNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float dt,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const Contracts::Frame& frame = ctx.input<Contracts::Frame>("frame");
        float tau = ctx.param<float>("tau");
        float blend = tau <= 0.f ? 1.f : 1.f - std::exp(-dt / tau);

        std::unordered_map<uint8_t, glm::vec3> next;
        Contracts::Frame result;
        result.reserve(frame.size());
        for(const auto& zone : frame){
          glm::vec3 target = zone.color.toNormalized();
          auto previous = m_previous.find(zone.id);
          glm::vec3 eased =
            previous == m_previous.end() ? target : previous->second + (target - previous->second) * blend;
          next[zone.id] = eased;
          result.push_back({zone.id, Contracts::Color::fromNormalized(eased), zone.gamma});
        }
        m_previous = std::move(next);
        outputs.emplace("frame", std::move(result));
      }

      void resetState() override { m_previous.clear(); }

    private:
      std::vector<PortDecl> m_in{{"frame", PortType::Frame, true}};
      std::vector<PortDecl> m_out{{"frame", PortType::Frame, false}};
      std::unordered_map<uint8_t, glm::vec3> m_previous;
    };

    // frame.gain: scales every zone color by `gain`. Exactly 1 returns the
    // input untouched, so golden parity holds at full brightness.
    class FrameGainNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const Contracts::Frame& frame = ctx.input<Contracts::Frame>("frame");
        float gain = ctx.param<float>("gain");
        if(gain >= 1.f){
          outputs.emplace("frame", frame);
          return;
        }
        Contracts::Frame result;
        result.reserve(frame.size());
        for(const auto& zone : frame){
          result.push_back({zone.id, Contracts::Color::fromNormalized(zone.color.toNormalized() * gain), zone.gamma});
        }
        outputs.emplace("frame", std::move(result));
      }

    private:
      std::vector<PortDecl> m_in{{"frame", PortType::Frame, true}};
      std::vector<PortDecl> m_out{{"frame", PortType::Frame, false}};
    };

    // output.send: sink. Absent/error inputs never reach evaluate, so a
    // skipped tick sends nothing, like today's early returns.
    class OutputSendNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>&) override
      {
        const Contracts::Frame& frame = ctx.input<Contracts::Frame>("frame");
        const std::string& outputName = requireOutputName(ctx);
        Output::IOutput* output = ctx.requireHost().output(outputName);
        if(output == nullptr){
          ctx.fail("unknown output '" + outputName + "' (expected an output the app registered)");
        }
        output->send(frame);
      }

    private:
      std::vector<PortDecl> m_in{{"frame", PortType::Frame, true}};
      std::vector<PortDecl> m_out{};
    };
  } // namespace

  void registerFrameNodes(NodeRegistry& registry)
  {
    ParamDecl smoothing;
    smoothing.name = "smoothing";
    smoothing.kind = ParamKind::Float;
    smoothing.schema = paramSchema("video.transitionSmoothing"); // one source with Config
    smoothing.description =
      "Easing between color changes, 0 is instant (today's video.transitionSmoothing).";

    registry.registerType(
      "frame.smooth",
      NodeTypeInfo{
        .meta =
          {
            .purpose = "Ease each zone's color toward its new value, per output.",
            .useWhen = "Between zone sampling and output.send; one instance per output.",
            .example =
              "{\"id\": \"ease\", \"type\": \"frame.smooth\", \"params\": {\"output\": \"hue\", \"smoothing\": 0.5}}",
            .cost = "cheap",
          },
        .inputs = {{"frame", PortType::Frame, true}},
        .outputs = {{"frame", PortType::Frame, false}},
        .params = {outputParam("Output whose zones are smoothed (keys the smoother state)."), smoothing},
        .factory = [] { return std::make_unique<FrameSmoothNode>(); },
      });

    ParamDecl tau;
    tau.name = "tau";
    tau.kind = ParamKind::Float;
    tau.schema.label = "Tau";
    tau.schema.min = 0.f;
    tau.schema.max = 60.f;
    tau.schema.step = 0.01f;
    tau.schema.unit = "s";
    tau.schema.defaultValue = 0.15f;
    tau.description = "Easing time constant in seconds, 0 is instant. Same settle time at any tick rate.";

    registry.registerType(
      "frame.smoothTime",
      NodeTypeInfo{
        .meta =
          {
            .purpose = "Ease each zone's color toward its new value over tau seconds, at any tick rate.",
            .useWhen = "Instead of frame.smooth when easing must feel the same at every refresh rate.",
            .example = "{\"id\": \"ease\", \"type\": \"frame.smoothTime\", \"params\": {\"tau\": 0.15}}",
            .cost = "cheap",
          },
        .inputs = {{"frame", PortType::Frame, true}},
        .outputs = {{"frame", PortType::Frame, false}},
        .params = {tau},
        .factory = [] { return std::make_unique<FrameSmoothTimeNode>(); },
      });

    ParamDecl gain;
    gain.name = "gain";
    gain.kind = ParamKind::Float;
    gain.schema = paramSchema("app.brightness"); // one source with Config
    gain.description = "Brightness multiplier, 1 leaves colors unchanged (the global brightness setting).";

    registry.registerType(
      "frame.gain",
      NodeTypeInfo{
        .meta =
          {
            .purpose = "Scale every zone's color by a brightness factor.",
            .useWhen = "Last step before output.send; the built-in graphs run the global brightness here.",
            .example = "{\"id\": \"dim\", \"type\": \"frame.gain\", \"params\": {\"gain\": 0.5}}",
            .cost = "cheap",
          },
        .inputs = {{"frame", PortType::Frame, true}},
        .outputs = {{"frame", PortType::Frame, false}},
        .params = {gain},
        .factory = [] { return std::make_unique<FrameGainNode>(); },
      });

    registry.registerType(
      "output.send",
      NodeTypeInfo{
        .meta =
          {
            .purpose = "Send a Frame to one output; sends nothing on a skipped tick.",
            .useWhen = "Last node of every path, one per output.",
            .example = "{\"id\": \"send\", \"type\": \"output.send\", \"params\": {\"output\": \"hue\"}}",
            .cost = "moderate",
          },
        .inputs = {{"frame", PortType::Frame, true}},
        .outputs = {},
        .params = {outputParam("Output that receives the frame (per-output binding, not a port).")},
        .factory = [] { return std::make_unique<OutputSendNode>(); },
        .sinkBindingParam = "output",
      });
  }
} // namespace Aurora::Runtime::Graph
