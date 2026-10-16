#include <Aurora/Runtime/Graph/MathNodes.hpp>

#include <algorithm>
#include <cmath>
#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    using Compute = std::function<float(const EvalContext&)>;

    // One stateless node shape for every math type: the compute lambda reads
    // inputs and params, the wrapper rejects non-finite results.
    class ScalarMathNode : public INode
    {
    public:
      ScalarMathNode(std::vector<PortDecl> inputs, Compute compute)
      : m_in(std::move(inputs))
      , m_compute(std::move(compute))
      {}

      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        float result = m_compute(ctx);
        if(!std::isfinite(result)){
          ctx.fail("produced a non-finite value; check its inputs and params");
        }
        outputs.emplace("value", result);
      }

    private:
      std::vector<PortDecl> m_in;
      std::vector<PortDecl> m_out{{"value", PortType::Float, false}};
      Compute m_compute;
    };

    constexpr float kParamLimit = 1.0e6f;

    ParamDecl floatParam(
      std::string name, std::string label, float defaultValue, std::string description)
    {
      ParamDecl decl;
      decl.name = std::move(name);
      decl.kind = ParamKind::Float;
      decl.schema.label = std::move(label);
      decl.schema.min = -kParamLimit;
      decl.schema.max = kParamLimit;
      decl.schema.step = 0.01f;
      decl.schema.defaultValue = defaultValue;
      decl.description = std::move(description);
      return decl;
    }

    ParamDecl boolParam(std::string name, std::string label, bool defaultValue, std::string description)
    {
      ParamDecl decl;
      decl.name = std::move(name);
      decl.kind = ParamKind::Bool;
      decl.schema.label = std::move(label);
      decl.defaultBool = defaultValue;
      decl.description = std::move(description);
      return decl;
    }

    void add(
      NodeRegistry& registry,
      std::string type,
      NodeTypeMeta meta,
      std::vector<PortDecl> inputs,
      std::vector<ParamDecl> params,
      Compute compute)
    {
      std::vector<PortDecl> declared = inputs;
      registry.registerType(
        std::move(type),
        NodeTypeInfo{
          .meta = std::move(meta),
          .inputs = std::move(inputs),
          .outputs = {{"value", PortType::Float, false}},
          .params = std::move(params),
          .factory =
            [declared, compute] { return std::make_unique<ScalarMathNode>(declared, compute); },
        });
    }

    float in(const EvalContext& ctx, const char* name) { return ctx.input<float>(name); }
    float param(const EvalContext& ctx, const char* name) { return ctx.param<float>(name); }
  } // namespace

  void registerMathNodes(NodeRegistry& registry)
  {
    add(registry, "math.scale",
      {.purpose = "Multiply a Float by a constant factor.",
       .useWhen = "Convert units or set a gain, e.g. onset strength times 180 degrees.",
       .example = "{\"id\": \"gain\", \"type\": \"math.scale\", \"params\": {\"factor\": 180}}"},
      {{"value", PortType::Float, true}},
      {floatParam("factor", "Factor", 1.f, "Constant the input is multiplied by.")},
      [](const EvalContext& c) { return in(c, "value") * param(c, "factor"); });

    add(registry, "math.divide",
      {.purpose = "Divide a Float by a constant divisor. A zero divisor fails the node.",
       .useWhen = "Normalize against a reference, e.g. rms divided by a reference loudness.",
       .example = "{\"id\": \"norm\", \"type\": \"math.divide\", \"params\": {\"divisor\": 0.3}}"},
      {{"value", PortType::Float, true}},
      {floatParam("divisor", "Divisor", 1.f, "Constant the input is divided by, must not be 0.")},
      [](const EvalContext& c) {
        float divisor = param(c, "divisor");
        if(divisor == 0.f){
          c.fail("param 'divisor' is 0");
        }
        return in(c, "value") / divisor;
      });

    add(registry, "math.clamp",
      {.purpose = "Limit a Float to the range min..max.",
       .useWhen = "Keep a signal in a safe range before scaling or mixing.",
       .example = "{\"id\": \"cap\", \"type\": \"math.clamp\", \"params\": {\"min\": 0, \"max\": 1}}"},
      {{"value", PortType::Float, true}},
      {floatParam("min", "Min", 0.f, "Lower bound."),
       floatParam("max", "Max", 1.f, "Upper bound, must be at least min.")},
      [](const EvalContext& c) {
        float lo = param(c, "min");
        float hi = param(c, "max");
        if(lo > hi){
          c.fail("param 'min' is above 'max'");
        }
        return std::clamp(in(c, "value"), lo, hi);
      });

    add(registry, "math.mapRange",
      {.purpose = "Linearly remap a Float from one range to another, optionally clamped to the output range.",
       .useWhen = "Turn a signal in known bounds into another range, e.g. 0..1 loudness into 0.2..1 brightness.",
       .example =
         "{\"id\": \"remap\", \"type\": \"math.mapRange\", \"params\": {\"inMin\": 0, \"inMax\": 1, "
         "\"outMin\": 0.2, \"outMax\": 1, \"clamp\": true}}"},
      {{"value", PortType::Float, true}},
      {floatParam("inMin", "In min", 0.f, "Input value that maps to outMin."),
       floatParam("inMax", "In max", 1.f, "Input value that maps to outMax, must differ from inMin."),
       floatParam("outMin", "Out min", 0.f, "Output at inMin."),
       floatParam("outMax", "Out max", 1.f, "Output at inMax."),
       boolParam("clamp", "Clamp", true, "Hold the output inside outMin..outMax.")},
      [](const EvalContext& c) {
        float inMin = param(c, "inMin");
        float inMax = param(c, "inMax");
        if(inMin == inMax){
          c.fail("params 'inMin' and 'inMax' are equal");
        }
        float outMin = param(c, "outMin");
        float outMax = param(c, "outMax");
        float t = (in(c, "value") - inMin) / (inMax - inMin);
        if(c.param<bool>("clamp")){
          t = std::clamp(t, 0.f, 1.f);
        }
        return outMin + (outMax - outMin) * t;
      });

    add(registry, "math.lerp",
      {.purpose = "Blend from 'from' to 'to' by a Float t (0 gives from, 1 gives to, not clamped).",
       .useWhen = "Interpolate between two constants with a signal, e.g. lerp(floor, 1) driven by onset strength.",
       .example = "{\"id\": \"swing\", \"type\": \"math.lerp\", \"params\": {\"from\": 0.3, \"to\": 1}}"},
      {{"t", PortType::Float, true}},
      {floatParam("from", "From", 0.f, "Output when t is 0."),
       floatParam("to", "To", 1.f, "Output when t is 1.")},
      [](const EvalContext& c) {
        float from = param(c, "from");
        return from + (param(c, "to") - from) * in(c, "t");
      });

    add(registry, "math.add",
      {.purpose = "Add two Floats.",
       .useWhen = "Combine two signals or offset one by another.",
       .example = "{\"id\": \"sum\", \"type\": \"math.add\", \"params\": {}}"},
      {{"a", PortType::Float, true}, {"b", PortType::Float, true}},
      {},
      [](const EvalContext& c) { return in(c, "a") + in(c, "b"); });

    add(registry, "math.multiply",
      {.purpose = "Multiply two Floats.",
       .useWhen = "Modulate one signal by another, e.g. brightness times a loudness envelope.",
       .example = "{\"id\": \"mod\", \"type\": \"math.multiply\", \"params\": {}}"},
      {{"a", PortType::Float, true}, {"b", PortType::Float, true}},
      {},
      [](const EvalContext& c) { return in(c, "a") * in(c, "b"); });

    add(registry, "math.max",
      {.purpose = "The larger of two Floats.",
       .useWhen = "Floor one signal with another, e.g. keep a rate from going negative.",
       .example = "{\"id\": \"floor\", \"type\": \"math.max\", \"params\": {}}"},
      {{"a", PortType::Float, true}, {"b", PortType::Float, true}},
      {},
      [](const EvalContext& c) { return std::max(in(c, "a"), in(c, "b")); });

    add(registry, "math.invert",
      {.purpose = "Flip a 0..1 Float to 1 minus the value.",
       .useWhen = "Reverse a normalized signal, e.g. quiet becomes bright.",
       .example = "{\"id\": \"flip\", \"type\": \"math.invert\", \"params\": {}}"},
      {{"value", PortType::Float, true}},
      {},
      [](const EvalContext& c) { return 1.f - in(c, "value"); });
  }
} // namespace Aurora::Runtime::Graph
