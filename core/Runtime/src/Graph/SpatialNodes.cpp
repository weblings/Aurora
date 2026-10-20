#include <Aurora/Runtime/Graph/SpatialNodes.hpp>

#include <algorithm>
#include <cmath>
#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <glm/vec3.hpp>

#include <Aurora/Runtime/Graph/ColorNodes.hpp>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    using Outputs = std::unordered_map<std::string, GraphValue>;
    using Contracts::Color;

    constexpr float kPi = 3.14159265358979f;
    constexpr float kMaxSide = 1024.f;

    float fract(float x)
    {
      return x - std::floor(x);
    }

    // Float input if connected, else the param of the same name.
    float inputOrParam(const EvalContext& ctx, const char* name)
    {
      const float* value = ctx.optionalInput<float>(name);
      float result = value != nullptr ? *value : ctx.param<float>(name);
      if(!std::isfinite(result)){
        ctx.fail(std::string("got a non-finite ") + name);
      }
      return result;
    }

    int sideParam(const EvalContext& ctx, const char* name)
    {
      float value = ctx.param<float>(name);
      if(!std::isfinite(value) || value < 1.f || value > kMaxSide){
        ctx.fail(std::string("param '") + name + "' must be 1 to " + std::to_string(int(kMaxSide)));
      }
      return static_cast<int>(std::round(value));
    }

    // Position of pixel center (x, y) along the axis at `angle` degrees
    // (0 runs left to right, 90 top to bottom), scaled so the image corners
    // land on exactly 0 and 1.
    class Axis
    {
    public:
      Axis(float angleDegrees, int width, int height)
      : m_width(width)
      , m_height(height)
      {
        float radians = angleDegrees * kPi / 180.f;
        m_cos = std::cos(radians);
        m_sin = std::sin(radians);
        m_norm = std::abs(m_cos) + std::abs(m_sin);
      }

      float at(int x, int y) const
      {
        float u = (x + 0.5f) / m_width - 0.5f;
        float v = (y + 0.5f) / m_height - 0.5f;
        return (u * m_cos + v * m_sin) / m_norm + 0.5f;
      }

    private:
      int m_width;
      int m_height;
      float m_cos = 1.f;
      float m_sin = 0.f;
      float m_norm = 1.f;
    };

    using ColorAt = std::function<Color(float)>;

    ImagePtr render(int width, int height, float angle, const ColorAt& colorAt)
    {
      auto image = std::make_shared<Contracts::ImageData>();
      image->format = Contracts::PixelFormat::RGB;
      image->imageMatrix = cv::Mat(height, width, CV_8UC3);
      Axis axis(angle, width, height);
      for(int y = 0; y < height; ++y){
        uint8_t* row = image->imageMatrix.ptr<uint8_t>(y);
        for(int x = 0; x < width; ++x){
          glm::vec3 rgb = colorAt(axis.at(x, y)).toNormalized() * Color::Max;
          row[x * 3] = static_cast<uint8_t>(std::lround(rgb.r));
          row[x * 3 + 1] = static_cast<uint8_t>(std::lround(rgb.g));
          row[x * 3 + 2] = static_cast<uint8_t>(std::lround(rgb.b));
        }
      }
      return image;
    }

    // This tick's per-pixel color function plus a key naming everything the
    // picture depends on.
    struct Plan
    {
      std::vector<float> key;
      ColorAt colorAt;
    };
    using Planner = std::function<Plan(const EvalContext&)>;

    // Re-renders only when width, height, angle or the plan's key changes,
    // otherwise returns the same ImagePtr so downstream caches hit.
    class GeneratorNode : public INode
    {
    public:
      GeneratorNode(std::vector<PortDecl> in, Planner planner)
      : m_in(std::move(in))
      , m_planner(std::move(planner))
      {}

      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(const EvalContext& ctx, float, Outputs& outputs) override
      {
        int width = sideParam(ctx, "width");
        int height = sideParam(ctx, "height");
        float angle = ctx.param<float>("angle");
        if(!std::isfinite(angle)){
          ctx.fail("got a non-finite angle");
        }
        Plan plan = m_planner(ctx);
        plan.key.insert(plan.key.end(), {float(width), float(height), angle});
        if(!m_cached || plan.key != m_key){
          m_cached = render(width, height, angle, plan.colorAt);
          m_key = std::move(plan.key);
        }
        outputs.emplace("image", m_cached);
      }

    private:
      std::vector<PortDecl> m_in;
      std::vector<PortDecl> m_out{{"image", PortType::Image, false}};
      Planner m_planner;
      std::vector<float> m_key{};
      ImagePtr m_cached{};
    };

    void appendColor(std::vector<float>& key, const Color& color)
    {
      glm::vec3 rgb = color.toNormalized();
      key.insert(key.end(), {rgb.r, rgb.g, rgb.b});
    }

    ParamDecl floatParam(
      std::string name, std::string label, float min, float max, float defaultValue, std::string description)
    {
      ParamDecl decl;
      decl.name = std::move(name);
      decl.kind = ParamKind::Float;
      decl.schema.label = std::move(label);
      decl.schema.min = min;
      decl.schema.max = max;
      decl.schema.step = 0.01f;
      decl.schema.defaultValue = defaultValue;
      decl.description = std::move(description);
      return decl;
    }

    // width, height, angle: shared by every generator.
    std::vector<ParamDecl> layoutParams()
    {
      ParamDecl width = floatParam("width", "Width", 1.f, kMaxSide, 64.f,
        "Rendered width in px. Keep small: zones.sample only needs a coarse grid.");
      width.schema.step = 1.f;
      width.schema.unit = "px";
      ParamDecl height = floatParam("height", "Height", 1.f, kMaxSide, 36.f, "Rendered height in px.");
      height.schema.step = 1.f;
      height.schema.unit = "px";
      ParamDecl angle = floatParam("angle", "Angle", -360.f, 360.f, 0.f,
        "Direction of travel in degrees: 0 left to right, 90 top to bottom.");
      angle.schema.unit = "deg";
      return {width, height, angle};
    }

    void add(
      NodeRegistry& registry,
      std::string type,
      NodeTypeMeta meta,
      std::vector<PortDecl> inputs,
      std::vector<ParamDecl> params,
      Planner planner)
    {
      auto in = inputs;
      std::vector<ParamDecl> all = layoutParams();
      all.insert(all.end(), params.begin(), params.end());
      registry.registerType(
        std::move(type),
        NodeTypeInfo{
          .meta = std::move(meta),
          .inputs = std::move(inputs),
          .outputs = {{"image", PortType::Image, false}},
          .params = std::move(all),
          .factory = [in, planner] { return std::make_unique<GeneratorNode>(in, planner); },
        });
    }

    // Bar coverage at axis position p: 1 within size/2 of center, falling to
    // 0 over `softness` beyond that. wrap measures distance around the loop.
    float barCoverage(float p, float center, float size, float softness, bool wrap)
    {
      float d = std::abs(p - center);
      if(wrap){
        d = std::abs(fract(p - center + 0.5f) - 0.5f);
      }
      float half = size * 0.5f;
      if(softness <= 0.f){
        return d <= half ? 1.f : 0.f;
      }
      return std::clamp((half + softness - d) / softness, 0.f, 1.f);
    }

    ParamDecl wrapParam()
    {
      ParamDecl wrap;
      wrap.name = "wrap";
      wrap.kind = ParamKind::Bool;
      wrap.schema.label = "Wrap";
      wrap.defaultBool = false;
      wrap.description = "A bar leaving one end re-enters at the other.";
      return wrap;
    }
  } // namespace

  void registerSpatialNodes(NodeRegistry& registry)
  {
    ParamDecl gradient;
    gradient.name = "gradient";
    gradient.kind = ParamKind::Gradient;
    gradient.schema.label = "Gradient";
    gradient.defaultGradient = {{{0.f, Color(0, 0, 0)}, {1.f, Color(255, 255, 255)}}};
    gradient.description =
      "2 to 16 stops [{\"pos\": 0..1, \"color\": \"#rrggbb\"}] in ascending pos, blended in RGB.";

    add(registry, "image.gradient",
      {.purpose =
         "Render a gradient param across a small RGB image along an angle. phase scrolls it, wrapping "
         "past 1. Pair with zones.sample so zones read colors by their position in the ZoneMap.",
       .useWhen = "Color zones by where they sit, e.g. a palette spread across a room.",
       .example =
         "{\"id\": \"ramp\", \"type\": \"image.gradient\", \"params\": {\"angle\": 0, \"gradient\": "
         "[{\"pos\": 0, \"color\": \"#ff0000\"}, {\"pos\": 1, \"color\": \"#0000ff\"}]}}",
       .cost = "cheap"},
      {{"phase", PortType::Float, false}},
      {gradient, floatParam("phase", "Phase", -1.f, 1.f, 0.f,
         "Scroll along the gradient (1 is a full loop) when the 'phase' input is unconnected.")},
      [](const EvalContext& c) {
        float phase = inputOrParam(c, "phase");
        const Gradient& stops = c.param<Gradient>("gradient");
        Plan plan;
        plan.key.push_back(phase);
        for(const auto& stop : stops.stops){
          plan.key.push_back(stop.position);
          appendColor(plan.key, stop.color);
        }
        plan.colorAt = [phase, &stops](float p) {
          float t = phase == 0.f ? std::clamp(p, 0.f, 1.f) : fract(p + phase);
          return sampleGradient(stops, t);
        };
        return plan;
      });

    add(registry, "image.bar",
      {.purpose =
         "Render a bar of color on a background along an angle, for chase effects. position moves the "
         "bar center (0..1 across the image). Drive position with an lfo or integrate for motion.",
       .useWhen = "A light that sweeps across the room, sampled per zone by zones.sample.",
       .example =
         "{\"id\": \"chase\", \"type\": \"image.bar\", \"params\": {\"size\": 0.2, \"softness\": 0.1, "
         "\"wrap\": true}}",
       .cost = "cheap"},
      {{"position", PortType::Float, false}, {"color", PortType::Color, false},
        {"background", PortType::Color, false}},
      {floatParam("position", "Position", 0.f, 1.f, 0.5f,
         "Bar center when the 'position' input is unconnected."),
        floatParam("size", "Size", 0.f, 1.f, 0.2f, "Bar width as a fraction of the image."),
        floatParam("softness", "Softness", 0.f, 1.f, 0.f,
          "Fade distance beyond the bar edge, as a fraction of the image. 0 is a hard edge."),
        wrapParam()},
      [](const EvalContext& c) {
        float position = inputOrParam(c, "position");
        float size = std::clamp(c.param<float>("size"), 0.f, 1.f);
        float softness = std::clamp(c.param<float>("softness"), 0.f, 1.f);
        bool wrap = c.param<bool>("wrap");
        if(!std::isfinite(size) || !std::isfinite(softness)){
          c.fail("got a non-finite size or softness");
        }
        const Color* colorIn = c.optionalInput<Color>("color");
        const Color* backgroundIn = c.optionalInput<Color>("background");
        Color color = colorIn != nullptr ? *colorIn : Color(255, 255, 255);
        Color background = backgroundIn != nullptr ? *backgroundIn : Color(0, 0, 0);
        Plan plan;
        plan.key = {position, size, softness, wrap ? 1.f : 0.f};
        appendColor(plan.key, color);
        appendColor(plan.key, background);
        glm::vec3 fg = color.toNormalized();
        glm::vec3 bg = background.toNormalized();
        plan.colorAt = [=](float p) {
          float cover = barCoverage(p, position, size, softness, wrap);
          return Color::fromNormalized(bg + (fg - bg) * cover);
        };
        return plan;
      });

    add(registry, "image.hueRamp",
      {.purpose =
         "Render a rainbow along an angle: hue runs span degrees across the image starting at phase. "
         "Fixed saturation and value.",
       .useWhen = "Quick rainbow across zones, cycling by driving phase with integrate.",
       .example = "{\"id\": \"rainbow\", \"type\": \"image.hueRamp\", \"params\": {\"span\": 360}}",
       .cost = "cheap"},
      {{"phase", PortType::Float, false}},
      {floatParam("phase", "Phase", -360.f, 360.f, 0.f,
         "Hue in degrees at the start of the ramp when the 'phase' input is unconnected."),
        floatParam("span", "Span", -720.f, 720.f, 360.f, "Degrees of hue across the image."),
        floatParam("saturation", "Saturation", 0.f, 1.f, 1.f, "HSV saturation."),
        floatParam("value", "Value", 0.f, 1.f, 1.f, "HSV value.")},
      [](const EvalContext& c) {
        float phase = inputOrParam(c, "phase");
        float span = c.param<float>("span");
        float saturation = std::clamp(c.param<float>("saturation"), 0.f, 1.f);
        float value = std::clamp(c.param<float>("value"), 0.f, 1.f);
        if(!std::isfinite(span) || !std::isfinite(saturation) || !std::isfinite(value)){
          c.fail("got a non-finite span, saturation or value");
        }
        Plan plan;
        plan.key = {phase, span, saturation, value};
        plan.colorAt = [=](float p) { return Color::fromHSV(phase + p * span, saturation, value); };
        return plan;
      });
  }
} // namespace Aurora::Runtime::Graph
