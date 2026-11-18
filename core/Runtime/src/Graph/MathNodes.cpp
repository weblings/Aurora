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
      std::vector<PortDecl> m_out{{"value", PortType::Float, false, "The computed value."}};
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
          .outputs = {{"value", PortType::Float, false, "The computed value."}},
          .params = std::move(params),
          .factory =
            [declared, compute] { return std::make_unique<ScalarMathNode>(declared, compute); },
        });
    }

    float in(const EvalContext& ctx, const char* name) { return ctx.input<float>(name); }
    float param(const EvalContext& ctx, const char* name) { return ctx.param<float>(name); }

    // Float input if wired, else the param of the same name.
    float inputOrParam(const EvalContext& ctx, const char* name)
    {
      const float* value = ctx.optionalInput<float>(name);
      return value != nullptr ? *value : ctx.param<float>(name);
    }
    // math.step: 0 below the edge, 1 at or above it. Holds the last side so
    // a value inside the hysteresis band does not flip it.
    class StepNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        float hysteresis = ctx.param<float>("hysteresis");
        if(hysteresis < 0.f){
          ctx.fail("param 'hysteresis' is below 0");
        }
        float value = ctx.input<float>("value");
        float edge = inputOrParam(ctx, "edge");
        if(!std::isfinite(value) || !std::isfinite(edge)){
          ctx.fail("got a non-finite value or edge");
        }
        if(value >= edge){
          m_high = true;
        }else if(value < edge - hysteresis){
          m_high = false;
        }
        outputs.emplace("value", m_high != ctx.param<bool>("invert") ? 1.f : 0.f);
      }

      void resetState() override { m_high = false; }

    private:
      std::vector<PortDecl> m_in{
        {"value", PortType::Float, true, "The Float to compare against the edge."},
        {"edge", PortType::Float, false, "The threshold; param edge is used when unwired."}};
      std::vector<PortDecl> m_out{{"value", PortType::Float, false, "1 at or above the edge, else 0."}};
      bool m_high = false;
    };
  } // namespace

  void registerMathNodes(NodeRegistry& registry)
  {
    add(registry, "math.scale",
      {.title = "Scale",
       .group = "Numbers",
       .summary = "Multiplies a number by a fixed amount.",
       .tip = "Use to convert units or strengthen a signal.",
       .purpose = "Multiply a Float by a constant factor.",
       .useWhen = "Convert units or set a gain, e.g. onset strength times 180 degrees.",
       .example = "{\"id\": \"gain\", \"type\": \"math.scale\", \"params\": {\"factor\": 180}}"},
      {{"value", PortType::Float, true, "The Float to multiply."}},
      {floatParam("factor", "Factor", 1.f, "Constant the input is multiplied by.")},
      [](const EvalContext& c) { return in(c, "value") * param(c, "factor"); });

    add(registry, "math.divide",
      {.title = "Divide",
       .group = "Numbers",
       .summary = "Divides a number by a fixed amount.",
       .tip = "Use to compare a signal against a reference value.",
       .purpose = "Divide a Float by a constant divisor. A zero divisor fails the node.",
       .useWhen = "Normalize against a reference, e.g. rms divided by a reference loudness.",
       .example = "{\"id\": \"norm\", \"type\": \"math.divide\", \"params\": {\"divisor\": 0.3}}"},
      {{"value", PortType::Float, true, "The Float to divide."}},
      {floatParam("divisor", "Divisor", 1.f, "Constant the input is divided by, must not be 0.")},
      [](const EvalContext& c) {
        float divisor = param(c, "divisor");
        if(divisor == 0.f){
          c.fail("param 'divisor' is 0");
        }
        return in(c, "value") / divisor;
      });

    add(registry, "math.clamp",
      {.title = "Clamp",
       .group = "Numbers",
       .summary = "Keeps a number between a lowest and highest value.",
       .tip = "Use to stop a signal going out of range.",
       .purpose = "Limit a Float to the range min..max.",
       .useWhen = "Keep a signal in a safe range before scaling or mixing.",
       .example = "{\"id\": \"cap\", \"type\": \"math.clamp\", \"params\": {\"min\": 0, \"max\": 1}}"},
      {{"value", PortType::Float, true, "The Float to limit."}},
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
      {.title = "Map range",
       .group = "Numbers",
       .summary = "Converts a number from one range to another.",
       .tip = "Use to fit a signal into the range you need.",
       .purpose = "Linearly remap a Float from one range to another, optionally clamped to the output range.",
       .useWhen = "Turn a signal in known bounds into another range, e.g. 0..1 loudness into 0.2..1 brightness.",
       .example =
         "{\"id\": \"remap\", \"type\": \"math.mapRange\", \"params\": {\"inMin\": 0, \"inMax\": 1, "
         "\"outMin\": 0.2, \"outMax\": 1, \"clamp\": true}}"},
      {{"value", PortType::Float, true, "The Float to remap."}},
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
      {.title = "Lerp",
       .group = "Numbers",
       .summary = "Slides between two values using a signal.",
       .tip = "Use to move smoothly between a low and high setting.",
       .purpose = "Blend from 'from' to 'to' by a Float t (0 gives from, 1 gives to, not clamped).",
       .useWhen = "Interpolate between two constants with a signal, e.g. lerp(floor, 1) driven by onset strength.",
       .example = "{\"id\": \"swing\", \"type\": \"math.lerp\", \"params\": {\"from\": 0.3, \"to\": 1}}"},
      {{"t", PortType::Float, true, "Blend amount: 0 gives from, 1 gives to."}},
      {floatParam("from", "From", 0.f, "Output when t is 0."),
       floatParam("to", "To", 1.f, "Output when t is 1.")},
      [](const EvalContext& c) {
        float from = param(c, "from");
        return from + (param(c, "to") - from) * in(c, "t");
      });

    add(registry, "math.add",
      {.title = "Add",
       .group = "Numbers",
       .summary = "Adds two numbers together.",
       .tip = "Combine two signals, or shift one by a fixed amount.",
       .purpose = "Add two Floats. Input b is optional and falls back to param b.",
       .useWhen = "Combine two signals, or offset one by a constant (leave b unwired, set param b).",
       .example = "{\"id\": \"sum\", \"type\": \"math.add\", \"params\": {\"b\": 0.5}}"},
      {{"a", PortType::Float, true, "The first Float."},
       {"b", PortType::Float, false, "The second Float; param b is used when unwired."}},
      {floatParam("b", "B", 0.f, "Used when input b is not wired.")},
      [](const EvalContext& c) { return in(c, "a") + inputOrParam(c, "b"); });

    add(registry, "math.multiply",
      {.title = "Multiply",
       .group = "Numbers",
       .summary = "Multiplies two numbers together.",
       .tip = "Use to make one signal control the strength of another.",
       .purpose = "Multiply two Floats. Input b is optional and falls back to param b.",
       .useWhen = "Modulate one signal by another, e.g. brightness times a loudness envelope, or by a constant via param b.",
       .example = "{\"id\": \"mod\", \"type\": \"math.multiply\", \"params\": {\"b\": 0.5}}"},
      {{"a", PortType::Float, true, "The first Float."},
       {"b", PortType::Float, false, "The second Float; param b is used when unwired."}},
      {floatParam("b", "B", 1.f, "Used when input b is not wired.")},
      [](const EvalContext& c) { return in(c, "a") * inputOrParam(c, "b"); });

    add(registry, "math.max",
      {.title = "Max",
       .group = "Numbers",
       .summary = "Picks the larger of two numbers.",
       .tip = "Use to stop a signal falling below a floor.",
       .purpose = "The larger of two Floats. Input b is optional and falls back to param b.",
       .useWhen = "Floor one signal with another or a constant, e.g. keep a rate from going negative (param b 0).",
       .example = "{\"id\": \"floor\", \"type\": \"math.max\", \"params\": {\"b\": 0}}"},
      {{"a", PortType::Float, true, "The first Float."},
       {"b", PortType::Float, false, "The second Float; param b is used when unwired."}},
      {floatParam("b", "B", 0.f, "Used when input b is not wired.")},
      [](const EvalContext& c) { return std::max(in(c, "a"), inputOrParam(c, "b")); });

    add(registry, "math.invert",
      {.title = "Invert",
       .group = "Numbers",
       .summary = "Flips a number so high becomes low.",
       .tip = "Use to make quiet moments bright instead of loud ones.",
       .purpose = "Flip a 0..1 Float to 1 minus the value.",
       .useWhen = "Reverse a normalized signal, e.g. quiet becomes bright.",
       .example = "{\"id\": \"flip\", \"type\": \"math.invert\", \"params\": {}}"},
      {{"value", PortType::Float, true, "A 0..1 Float to flip."}},
      {},
      [](const EvalContext& c) { return 1.f - in(c, "value"); });
    registry.registerType(
      "math.step",
      NodeTypeInfo{
        .meta =
          {.title = "Step",
           .group = "Numbers",
           .summary = "Switches between 0 and 1 at a threshold without flickering.",
           .tip = "Use hysteresis so a level near the threshold does not chatter.",
           .purpose =
             "Output the Float 0 below the edge and 1 at or above it. Once flipped, it flips back "
             "only after the input crosses edge minus hysteresis. Holds state between ticks.",
           .useWhen =
             "Switch on a level without flicker, e.g. loudness into frame.mix t. Set invert for 1 below the edge.",
           .example =
             "{\"id\": \"gate\", \"type\": \"math.step\", \"params\": {\"edge\": 0.4, \"hysteresis\": 0.05}}"},
        .inputs = {{"value", PortType::Float, true, "The Float to compare against the edge."},
                   {"edge", PortType::Float, false, "The threshold; param edge is used when unwired."}},
        .outputs = {{"value", PortType::Float, false, "1 at or above the edge, else 0."}},
        .params = {floatParam("edge", "Edge", 0.5f, "Threshold used when input edge is not wired."),
                   floatParam("hysteresis", "Hysteresis", 0.f,
                     "Width of the band below the edge that holds a 1, must be at least 0."),
                   boolParam("invert", "Invert", false, "Output 1 below the edge and 0 at or above it.")},
        .factory = [] { return std::make_unique<StepNode>(); },
      });
  }
} // namespace Aurora::Runtime::Graph
