#include <Aurora/Runtime/Graph/TimeNodes.hpp>

#include <cmath>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Runtime/Graph/ValueNoise.hpp>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    constexpr float kPi = 3.14159265358979323846f;

    float wrapDegrees(float degrees)
    {
      float wrapped = std::fmod(degrees, 360.f);
      return wrapped < 0.f ? wrapped + 360.f : wrapped;
    }

    // Shortest signed arc from current to target, in [-180, 180).
    float shortestArc(float target, float current)
    {
      return std::fmod(std::fmod(target - current + 180.f, 360.f) + 360.f, 360.f) - 180.f;
    }

    // tau 0 is instant. Exact for any dt, so settle time is rate-independent.
    float blendFor(float dt, float tau)
    {
      return tau <= 0.f ? 1.f : 1.f - std::exp(-dt / tau);
    }

    void requireFinite(const EvalContext& ctx, float value, const char* what)
    {
      if(!std::isfinite(value)){
        ctx.fail(std::string("got a non-finite ") + what);
      }
    }

    ParamDecl floatParam(
      std::string name, std::string label, float min, float max, float defaultValue,
      std::string unit, std::string description)
    {
      ParamDecl decl;
      decl.name = std::move(name);
      decl.kind = ParamKind::Float;
      decl.schema.label = std::move(label);
      decl.schema.min = min;
      decl.schema.max = max;
      decl.schema.step = 0.01f;
      decl.schema.unit = std::move(unit);
      decl.schema.defaultValue = defaultValue;
      decl.description = std::move(description);
      return decl;
    }

    ParamDecl tauParam(float defaultValue, std::string description)
    {
      return floatParam("tau", "Tau", 0.f, 60.f, defaultValue, "s", std::move(description));
    }

    struct ScalarState
    {
      float value = 0.f;
      bool initialized = false;
    };

    // One-input, one-output node around a ScalarState. `step` owns the update.
    template<class In, class Out>
    class StateNode : public INode
    {
    public:
      using Step = Out (*)(const EvalContext&, float, const In&, ScalarState&);

      StateNode(PortDecl in, PortDecl out, Step step)
      : m_in{std::move(in)}
      , m_out{std::move(out)}
      , m_step(step)
      {}

      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float dt,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        outputs.emplace(m_out[0].name, m_step(ctx, dt, ctx.input<In>(m_in[0].name), m_state));
      }

      bool checkStateInvariants() const override
      {
        return !m_state.initialized || std::isfinite(m_state.value);
      }
      void resetState() override { m_state = ScalarState{}; }

    private:
      std::vector<PortDecl> m_in;
      std::vector<PortDecl> m_out;
      Step m_step;
      ScalarState m_state{};
    };

    // First tick snaps to the input, like Smoother's first-tick rule.
    float smoothExp(const EvalContext& ctx, float dt, const float& in, ScalarState& s)
    {
      requireFinite(ctx, in, "input");
      if(!s.initialized){
        s = {in, true};
      }else{
        s.value += (in - s.value) * blendFor(dt, ctx.param<float>("tau"));
      }
      return s.value;
    }

    Angle smoothAngle(const EvalContext& ctx, float dt, const Angle& in, ScalarState& s)
    {
      requireFinite(ctx, in.degrees, "input");
      if(!s.initialized){
        s = {wrapDegrees(in.degrees), true};
      }else{
        s.value = wrapDegrees(
          s.value + shortestArc(in.degrees, s.value) * blendFor(dt, ctx.param<float>("tau")));
      }
      return Angle{s.value};
    }

    // rate is degrees per second, negative runs backwards.
    Angle integrate(const EvalContext& ctx, float dt, const float& rate, ScalarState& s)
    {
      requireFinite(ctx, rate, "rate");
      if(!s.initialized){
        s = {wrapDegrees(ctx.param<float>("initial")), true};
      }
      s.value = wrapDegrees(s.value + rate * dt);
      return Angle{s.value};
    }

    // Adds a step to an angle on each pulse and holds it between pulses.
    class StepOnTriggerNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        if(ctx.input<Trigger>("trigger").fired){
          const float* amount = ctx.optionalInput<float>("amount");
          float step = (amount != nullptr ? *amount : 1.f) * ctx.param<float>("scale");
          requireFinite(ctx, step, "step");
          m_value = wrapDegrees(m_value + step);
        }
        outputs.emplace("angle", Angle{m_value});
      }

      bool checkStateInvariants() const override { return std::isfinite(m_value); }
      void resetState() override { m_value = 0.f; }

    private:
      std::vector<PortDecl> m_in{
        {"trigger", PortType::Trigger, true}, {"amount", PortType::Float, false}};
      std::vector<PortDecl> m_out{{"angle", PortType::Angle, false}};
      float m_value = 0.f;
    };

    // Free-running: phase advances by rateHz * dt from graph start and is
    // not reset by param edits.
    class LfoNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float dt,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        m_phase = std::fmod(m_phase + ctx.param<float>("rateHz") * dt, 1.f);
        float unit = 0.f;
        const std::string& shape = ctx.param<std::string>("shape");
        if(shape == "sine"){
          unit = 0.5f - 0.5f * std::cos(2.f * kPi * m_phase);
        }else if(shape == "saw"){
          unit = m_phase;
        }else{
          unit = m_phase < 0.5f ? 0.f : 1.f;
        }
        float lo = ctx.param<float>("min");
        outputs.emplace("value", lo + (ctx.param<float>("max") - lo) * unit);
      }

      bool checkStateInvariants() const override { return std::isfinite(m_phase); }
      void resetState() override { m_phase = 0.f; }

    private:
      std::vector<PortDecl> m_in{};
      std::vector<PortDecl> m_out{{"value", PortType::Float, false}};
      float m_phase = 0.f;
    };

    // Free-running: lattice position advances by rateHz * dt, so the output
    // is smooth and varies at about rateHz new random targets per second.
    class NoiseNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float dt,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        m_time += static_cast<double>(ctx.param<float>("rateHz")) * dt;
        float seed = ctx.param<float>("seed");
        requireFinite(ctx, seed, "seed");
        float unit = ValueNoise::sample(m_time, 0u, static_cast<uint32_t>(std::lround(seed)));
        float lo = ctx.param<float>("min");
        outputs.emplace("value", lo + (ctx.param<float>("max") - lo) * unit);
      }

      bool checkStateInvariants() const override { return std::isfinite(m_time); }
      void resetState() override { m_time = 0.0; }

    private:
      std::vector<PortDecl> m_in{};
      std::vector<PortDecl> m_out{{"value", PortType::Float, false}};
      double m_time = 0.0;
    };

    template<class In, class Out>
    void addState(
      NodeRegistry& registry,
      std::string type,
      NodeTypeMeta meta,
      PortDecl in,
      PortDecl out,
      std::vector<ParamDecl> params,
      typename StateNode<In, Out>::Step step)
    {
      registry.registerType(
        std::move(type),
        NodeTypeInfo{
          .meta = std::move(meta),
          .inputs = {in},
          .outputs = {out},
          .params = std::move(params),
          .factory = [in, out, step] { return std::make_unique<StateNode<In, Out>>(in, out, step); },
        });
    }
  } // namespace

  void registerTimeNodes(NodeRegistry& registry)
  {
    addState<float, float>(registry, "smooth.exp",
      {.title = "Smooth",
       .purpose = "Ease a Float toward its input; tau seconds to cover ~63% of a step at any tick rate.",
       .useWhen = "Damp a jumpy signal, e.g. rms into a brightness envelope.",
       .example = "{\"id\": \"damp\", \"type\": \"smooth.exp\", \"params\": {\"tau\": 0.15}}"},
      {"value", PortType::Float, true, "The Float to ease."}, {"value", PortType::Float, false, "The eased Float."},
      {tauParam(0.15f, "Smoothing time constant in seconds, 0 is instant.")},
      smoothExp);

    addState<Angle, Angle>(registry, "smooth.angle",
      {.title = "Smooth angle",
       .purpose = "Ease an Angle toward its input along the shortest arc, wrapping at 360.",
       .useWhen = "Damp a hue target, e.g. the beat swing in a bounce.",
       .example = "{\"id\": \"hue\", \"type\": \"smooth.angle\", \"params\": {\"tau\": 0.15}}"},
      {"angle", PortType::Angle, true, "The Angle to ease."}, {"angle", PortType::Angle, false, "The eased Angle."},
      {tauParam(0.15f, "Smoothing time constant in seconds, 0 is instant.")},
      smoothAngle);

    addState<float, float>(registry, "rollingAverage",
      {.title = "Rolling average",
       .purpose = "Running average of a Float over about tau seconds, independent of tick rate.",
       .useWhen = "Get a slow baseline to compare a signal against, e.g. centroid deviation.",
       .example = "{\"id\": \"base\", \"type\": \"rollingAverage\", \"params\": {\"tau\": 0.8}}"},
      {"value", PortType::Float, true, "The Float to average."}, {"value", PortType::Float, false, "The running average."},
      {tauParam(0.8f, "Averaging time constant in seconds, 0 passes the input through.")},
      smoothExp);

    addState<float, Angle>(registry, "integrate",
      {.title = "Integrate",
       .purpose = "Accumulate a rate in degrees per second into an Angle that wraps at 360.",
       .useWhen = "Turn a speed signal into a hue position, e.g. drift's rate into its anchor.",
       .example = "{\"id\": \"anchor\", \"type\": \"integrate\", \"params\": {\"initial\": 0}}"},
      {"rate", PortType::Float, true, "Rate in degrees per second."}, {"angle", PortType::Angle, false, "The accumulated Angle."},
      {floatParam("initial", "Initial", 0.f, 360.f, 0.f, "deg", "Angle on the first tick.")},
      integrate);

    registry.registerType(
      "stepOnTrigger",
      NodeTypeInfo{
        .meta =
          {.title = "Step on trigger",
           .purpose = "Add a step to an Angle on each Trigger pulse and hold it between pulses.",
           .useWhen = "Swing a hue on each beat, e.g. onset strength times 180 degrees per onset.",
           .example = "{\"id\": \"swing\", \"type\": \"stepOnTrigger\", \"params\": {\"scale\": 1}}"},
        .inputs = {{"trigger", PortType::Trigger, true, "Each pulse adds one step."},
                   {"amount", PortType::Float, false, "Scales the step; param scale alone is the step when unwired."}},
        .outputs = {{"angle", PortType::Angle, false, "The accumulated Angle, held between pulses."}},
        .params = {floatParam(
          "scale", "Scale", -1.0e6f, 1.0e6f, 1.f, "",
          "Degrees per pulse: multiplies 'amount', or is the whole step when 'amount' is unconnected.")},
        .factory = [] { return std::make_unique<StepOnTriggerNode>(); },
      });

    ParamDecl shape;
    shape.name = "shape";
    shape.kind = ParamKind::Enum;
    shape.schema.label = "Shape";
    shape.enumOptions = {"sine", "saw", "square"};
    shape.defaultEnum = "sine";
    shape.description =
      "Waveform: sine starts at min and rises, saw ramps min to max, square is half max then half min.";

    registry.registerType(
      "lfo",
      NodeTypeInfo{
        .meta =
          {.title = "LFO",
           .purpose = "Free-running oscillator between min and max at rateHz.",
           .useWhen = "Slow modulation with no audio, e.g. a breathing brightness.",
           .example =
             "{\"id\": \"breathe\", \"type\": \"lfo\", \"params\": {\"shape\": \"sine\", \"rateHz\": 0.2}}"},
        .inputs = {},
        .outputs = {{"value", PortType::Float, false, "The oscillator value between min and max."}},
        .params =
          {shape,
           floatParam("rateHz", "Rate", 0.f, 100.f, 1.f, "Hz", "Cycles per second."),
           floatParam("min", "Min", -1.0e6f, 1.0e6f, 0.f, "", "Output at the bottom of the wave."),
           floatParam("max", "Max", -1.0e6f, 1.0e6f, 1.f, "", "Output at the top of the wave.")},
        .factory = [] { return std::make_unique<LfoNode>(); },
      });

    registry.registerType(
      "noise",
      NodeTypeInfo{
        .meta =
          {.title = "Noise",
           .purpose = "Smooth random wander between min and max, drifting to a new random target about "
                      "rateHz times per second. Irregular where lfo is periodic.",
           .useWhen = "Flicker with no audio, e.g. a candle or fire brightness. Use image.noise for "
                      "independent flicker per light.",
           .example = "{\"id\": \"flicker\", \"type\": \"noise\", \"params\": {\"rateHz\": 6, \"min\": 0.6}}",
           .cost = "cheap"},
        .inputs = {},
        .outputs = {{"value", PortType::Float, false, "The random value between min and max."}},
        .params =
          {floatParam("rateHz", "Rate", 0.f, 100.f, 1.f, "Hz", "New random targets per second."),
           floatParam("min", "Min", -1.0e6f, 1.0e6f, 0.f, "", "Output at the bottom of the range."),
           floatParam("max", "Max", -1.0e6f, 1.0e6f, 1.f, "", "Output at the top of the range."),
           floatParam("seed", "Seed", 0.f, 65535.f, 0.f, "", "Different seeds give different sequences.")},
        .factory = [] { return std::make_unique<NoiseNode>(); },
      });
  }
} // namespace Aurora::Runtime::Graph
