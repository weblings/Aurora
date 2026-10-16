#include <Aurora/Runtime/Graph/ColorNodes.hpp>

#include <algorithm>
#include <array>
#include <cmath>
#include <functional>
#include <memory>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    using Outputs = std::unordered_map<std::string, GraphValue>;
    using Compute = std::function<void(const EvalContext&, Outputs&)>;
    using Contracts::Color;

    // Matches AudioProcessing's randomAnchorHue(): the anchor side of the
    // six named vibrant complementary pairs.
    constexpr std::array<float, 6> kPairAnchors{0.f, 30.f, 60.f, 90.f, 120.f, 150.f};
    constexpr float kMaxSeed = 16777216.f; // 2^24, the last exact integer in a float

    float wrapDegrees(float degrees)
    {
      float wrapped = std::fmod(degrees, 360.f);
      return wrapped < 0.f ? wrapped + 360.f : wrapped;
    }

    void requireFinite(const EvalContext& ctx, float value, const char* what)
    {
      if(!std::isfinite(value)){
        ctx.fail(std::string("got a non-finite ") + what);
      }
    }

    // Optional Float input, falling back to the param of the same name.
    float inputOrParam(const EvalContext& ctx, const char* name)
    {
      const float* value = ctx.optionalInput<float>(name);
      float result = value != nullptr ? *value : ctx.param<float>(name);
      requireFinite(ctx, result, name);
      return result;
    }

    // One stateless node shape for the whole file.
    class FnNode : public INode
    {
    public:
      FnNode(std::vector<PortDecl> in, std::vector<PortDecl> out, Compute compute)
      : m_in(std::move(in))
      , m_out(std::move(out))
      , m_compute(std::move(compute))
      {}

      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(const EvalContext& ctx, float, Outputs& outputs) override
      {
        m_compute(ctx, outputs);
      }

    private:
      std::vector<PortDecl> m_in;
      std::vector<PortDecl> m_out;
      Compute m_compute;
    };

    // Holds one random pick from the first tick on. The optional 'seed'
    // param pins it for tests and agents.
    class RandomAnchorNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(const EvalContext& ctx, float, Outputs& outputs) override
      {
        if(!m_picked){
          const auto& seed = ctx.param<std::optional<float>>("seed");
          std::mt19937 rng{
            seed ? static_cast<std::mt19937::result_type>(*seed) : std::random_device{}()};
          std::uniform_int_distribution<size_t> dist(0, kPairAnchors.size() - 1);
          m_value = kPairAnchors[dist(rng)];
          m_picked = true;
        }
        outputs.emplace("anchor", Angle{m_value});
      }

      void resetState() override { m_picked = false; }

    private:
      std::vector<PortDecl> m_in{};
      std::vector<PortDecl> m_out{{"anchor", PortType::Angle, false}};
      bool m_picked = false;
      float m_value = 0.f;
    };

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

    void add(
      NodeRegistry& registry,
      std::string type,
      NodeTypeMeta meta,
      std::vector<PortDecl> inputs,
      std::vector<PortDecl> outputs,
      std::vector<ParamDecl> params,
      Compute compute)
    {
      auto in = inputs;
      auto out = outputs;
      registry.registerType(
        std::move(type),
        NodeTypeInfo{
          .meta = std::move(meta),
          .inputs = std::move(inputs),
          .outputs = std::move(outputs),
          .params = std::move(params),
          .factory = [in, out, compute] { return std::make_unique<FnNode>(in, out, compute); },
        });
    }

    Color shiftHue(const Color& color, float degrees)
    {
      glm::vec3 hsv = color.toHSV();
      return Color::fromHSV(hsv.x + degrees, hsv.y, hsv.z);
    }

  } // namespace

  Color sampleGradient(const Gradient& gradient, float t)
  {
    const auto& stops = gradient.stops;
    if(t <= stops.front().position){
      return stops.front().color;
    }
    for(size_t i = 1; i < stops.size(); ++i){
      if(t <= stops[i].position){
        const GradientStop& lo = stops[i - 1];
        const GradientStop& hi = stops[i];
        float span = hi.position - lo.position;
        float f = span > 0.f ? (t - lo.position) / span : 1.f;
        glm::vec3 a = lo.color.toNormalized();
        return Color::fromNormalized(a + (hi.color.toNormalized() - a) * f);
      }
    }
    return stops.back().color;
  }

  void registerColorNodes(NodeRegistry& registry)
  {
    add(registry, "color.fromHSV",
      {.purpose = "Build a Color from a hue Angle plus saturation and value (0..1).",
       .useWhen = "Turn a hue and a brightness signal into a color, e.g. bounce's hue with rms as value.",
       .example =
         "{\"id\": \"col\", \"type\": \"color.fromHSV\", \"params\": {\"saturation\": 1, \"value\": 1}}"},
      {{"hue", PortType::Angle, true},
       {"saturation", PortType::Float, false},
       {"value", PortType::Float, false}},
      {{"color", PortType::Color, false}},
      {floatParam("saturation", "Saturation", 0.f, 1.f, 1.f, "",
         "Used when the 'saturation' input is unconnected."),
       floatParam("value", "Value", 0.f, 1.f, 1.f, "", "Used when the 'value' input is unconnected.")},
      [](const EvalContext& c, Outputs& out) {
        float hue = c.input<Angle>("hue").degrees;
        requireFinite(c, hue, "hue");
        float s = std::clamp(inputOrParam(c, "saturation"), 0.f, 1.f);
        float v = std::clamp(inputOrParam(c, "value"), 0.f, 1.f);
        out.emplace("color", Color::fromHSV(hue, s, v));
      });

    add(registry, "color.toHSV",
      {.purpose = "Split a Color into hue (Angle), saturation and value (Floats, 0..1).",
       .useWhen = "Read a video color's hue to drive another node.",
       .example = "{\"id\": \"split\", \"type\": \"color.toHSV\", \"params\": {}}"},
      {{"color", PortType::Color, true}},
      {{"hue", PortType::Angle, false},
       {"saturation", PortType::Float, false},
       {"value", PortType::Float, false}},
      {},
      [](const EvalContext& c, Outputs& out) {
        glm::vec3 hsv = c.input<Color>("color").toHSV();
        out.emplace("hue", Angle{hsv.x});
        out.emplace("saturation", hsv.y);
        out.emplace("value", hsv.z);
      });

    add(registry, "color.brightness",
      {.purpose = "Perceived brightness of a Color as a Float 0..1 (weighted RGB, not HSV value).",
       .useWhen = "Gate or scale something by how bright a color looks.",
       .example = "{\"id\": \"luma\", \"type\": \"color.brightness\", \"params\": {}}"},
      {{"color", PortType::Color, true}},
      {{"value", PortType::Float, false}},
      {},
      [](const EvalContext& c, Outputs& out) {
        out.emplace("value", c.input<Color>("color").brightness());
      });

    add(registry, "color.mix",
      {.purpose = "Blend Color a toward Color b by t (0 gives a, 1 gives b, clamped), in RGB.",
       .useWhen = "Crossfade two colors, e.g. a video color with the audio color.",
       .example = "{\"id\": \"blend\", \"type\": \"color.mix\", \"params\": {\"t\": 0.5}}"},
      {{"a", PortType::Color, true}, {"b", PortType::Color, true}, {"t", PortType::Float, false}},
      {{"color", PortType::Color, false}},
      {floatParam("t", "Mix", 0.f, 1.f, 0.5f, "", "Blend amount when the 't' input is unconnected.")},
      [](const EvalContext& c, Outputs& out) {
        float t = std::clamp(inputOrParam(c, "t"), 0.f, 1.f);
        glm::vec3 a = c.input<Color>("a").toNormalized();
        glm::vec3 b = c.input<Color>("b").toNormalized();
        out.emplace("color", Color::fromNormalized(a + (b - a) * t));
      });

    add(registry, "color.hueShift",
      {.purpose = "Rotate a Color's hue by degrees, keeping saturation and value.",
       .useWhen = "Offset a color around the wheel, e.g. +30 for an analogous accent.",
       .example = "{\"id\": \"accent\", \"type\": \"color.hueShift\", \"params\": {\"degrees\": 30}}"},
      {{"color", PortType::Color, true}, {"degrees", PortType::Float, false}},
      {{"color", PortType::Color, false}},
      {floatParam("degrees", "Degrees", -360.f, 360.f, 0.f, "deg",
         "Hue rotation when the 'degrees' input is unconnected.")},
      [](const EvalContext& c, Outputs& out) {
        out.emplace("color", shiftHue(c.input<Color>("color"), inputOrParam(c, "degrees")));
      });

    add(registry, "color.complement",
      {.purpose = "The opposite color on the wheel: hue plus 180 degrees.",
       .useWhen = "Get the second color of a complementary pair from the first.",
       .example = "{\"id\": \"pair\", \"type\": \"color.complement\", \"params\": {}}"},
      {{"color", PortType::Color, true}},
      {{"color", PortType::Color, false}},
      {},
      [](const EvalContext& c, Outputs& out) {
        out.emplace("color", shiftHue(c.input<Color>("color"), 180.f));
      });

    ParamDecl gradient;
    gradient.name = "gradient";
    gradient.kind = ParamKind::Gradient;
    gradient.schema.label = "Gradient";
    gradient.defaultGradient = {{{0.f, Color(0, 0, 0)}, {1.f, Color(255, 255, 255)}}};
    gradient.description =
      "2 to 16 stops [{\"pos\": 0..1, \"color\": \"#rrggbb\"}] in ascending pos, blended in RGB.";
    add(registry, "color.fromGradient",
      {.purpose = "Look up a Color on a gradient param at position t (0..1, clamped).",
       .useWhen = "Map a signal to a palette, e.g. loudness to a cool-to-hot ramp.",
       .example =
         "{\"id\": \"ramp\", \"type\": \"color.fromGradient\", \"params\": {\"gradient\": "
         "[{\"pos\": 0, \"color\": \"#0000ff\"}, {\"pos\": 1, \"color\": \"#ff0000\"}]}}"},
      {{"t", PortType::Float, true}},
      {{"color", PortType::Color, false}},
      {gradient},
      [](const EvalContext& c, Outputs& out) {
        float t = c.input<float>("t");
        requireFinite(c, t, "t");
        out.emplace("color", sampleGradient(c.param<Gradient>("gradient"), std::clamp(t, 0.f, 1.f)));
      });

    ParamDecl seed;
    seed.name = "seed";
    seed.kind = ParamKind::OptionalFloat;
    seed.schema.label = "Seed";
    seed.schema.min = 0.f;
    seed.schema.max = kMaxSeed;
    seed.schema.step = 1.f;
    seed.schema.defaultValue = -1.f;
    seed.schema.allowsUnset = true;
    seed.description = "Whole number that pins the pick; unset (null) picks differently each start.";
    registry.registerType(
      "palette.randomAnchor",
      NodeTypeInfo{
        .meta =
          {.purpose =
             "Pick one of the six vibrant complementary pair anchors (0, 30, 60, 90, 120, 150 degrees) "
             "on the first tick and hold it.",
           .useWhen = "Start a palette from a random but pleasant hue, e.g. feeding palette.pick.",
           .example =
             "{\"id\": \"anchor\", \"type\": \"palette.randomAnchor\", \"params\": {\"seed\": null}}"},
        .inputs = {},
        .outputs = {{"anchor", PortType::Angle, false}},
        .params = {seed},
        .factory = [] { return std::make_unique<RandomAnchorNode>(); },
      });

    add(registry, "angle.add",
      {.purpose = "Add two Angles, wrapping at 360.",
       .useWhen = "Offset a hue by another, e.g. a drifting anchor plus a beat swing.",
       .example = "{\"id\": \"target\", \"type\": \"angle.add\", \"params\": {}}"},
      {{"a", PortType::Angle, true}, {"b", PortType::Angle, true}},
      {{"angle", PortType::Angle, false}},
      {},
      [](const EvalContext& c, Outputs& out) {
        float sum = c.input<Angle>("a").degrees + c.input<Angle>("b").degrees;
        requireFinite(c, sum, "angle");
        out.emplace("angle", Angle{wrapDegrees(sum)});
      });

    ParamDecl side;
    side.name = "side";
    side.kind = ParamKind::Enum;
    side.schema.label = "Side";
    side.enumOptions = {"anchor", "complement"};
    side.defaultEnum = "anchor";
    side.description = "Which end of the pair to output: the anchor itself or anchor plus 180.";
    add(registry, "palette.pick",
      {.purpose = "Pick one hue of a complementary pair: the anchor Angle or the anchor plus 180.",
       .useWhen = "Split one anchor into the two colors of a pair, one pick node per color.",
       .example = "{\"id\": \"second\", \"type\": \"palette.pick\", \"params\": {\"side\": \"complement\"}}"},
      {{"anchor", PortType::Angle, true}},
      {{"hue", PortType::Angle, false}},
      {side},
      [](const EvalContext& c, Outputs& out) {
        float hue = c.input<Angle>("anchor").degrees;
        requireFinite(c, hue, "anchor");
        if(c.param<std::string>("side") == "complement"){
          hue += 180.f;
        }
        out.emplace("hue", Angle{wrapDegrees(hue)});
      });
  }
} // namespace Aurora::Runtime::Graph
