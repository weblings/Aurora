#include <Aurora/Runtime/Graph/FrameNodes.hpp>

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

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
      });
  }
} // namespace Aurora::Runtime::Graph
