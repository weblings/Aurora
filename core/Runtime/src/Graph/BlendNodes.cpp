#include <Aurora/Runtime/Graph/BlendNodes.hpp>

#include <algorithm>
#include <cmath>
#include <functional>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <glm/vec3.hpp>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    using Outputs = std::unordered_map<std::string, GraphValue>;
    using Compute = std::function<void(const EvalContext&, Outputs&)>;
    using ColorFn = std::function<Contracts::Color(const Contracts::Color&)>;
    using Contracts::Color;
    using Contracts::Frame;

    const std::vector<std::string> kModes{"normal", "add", "multiply", "screen", "difference"};

    float blendChannel(const std::string& mode, float a, float b)
    {
      if(mode == "add"){
        return std::min(a + b, 1.f);
      }
      if(mode == "multiply"){
        return a * b;
      }
      if(mode == "screen"){
        return 1.f - (1.f - a) * (1.f - b);
      }
      if(mode == "difference"){
        return std::abs(a - b);
      }
      return b;
    }

    // Result is a lerped toward the blended value by t, so t=0 is always a.
    glm::vec3 blend(const std::string& mode, const glm::vec3& a, const glm::vec3& b, float t)
    {
      glm::vec3 blended{
        blendChannel(mode, a.r, b.r), blendChannel(mode, a.g, b.g), blendChannel(mode, a.b, b.b)};
      return a + (blended - a) * t;
    }

    // Optional Float input, falling back to the param of the same name.
    float inputOrParam(const EvalContext& ctx, const char* name)
    {
      const float* value = ctx.optionalInput<float>(name);
      float result = value != nullptr ? *value : ctx.param<float>(name);
      if(!std::isfinite(result)){
        ctx.fail(std::string("got a non-finite ") + name);
      }
      return result;
    }

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

    ParamDecl modeParam()
    {
      ParamDecl decl;
      decl.name = "mode";
      decl.kind = ParamKind::Enum;
      decl.schema.label = "Mode";
      decl.enumOptions = kModes;
      decl.defaultEnum = "normal";
      decl.description =
        "normal replaces a with b; add, multiply, screen and difference combine them per channel.";
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

    // A per-zone color op: reads params/inputs once per tick, then maps
    // every zone's color, keeping id and gamma.
    void addFrameOp(
      NodeRegistry& registry,
      std::string type,
      NodeTypeMeta meta,
      std::vector<PortDecl> extraInputs,
      std::vector<ParamDecl> params,
      std::function<ColorFn(const EvalContext&)> makeFn)
    {
      std::vector<PortDecl> inputs{{"frame", PortType::Frame, true}};
      inputs.insert(inputs.end(), extraInputs.begin(), extraInputs.end());
      add(registry, std::move(type), std::move(meta), std::move(inputs),
        {{"frame", PortType::Frame, false}}, std::move(params),
        [makeFn](const EvalContext& c, Outputs& out) {
          ColorFn fn = makeFn(c);
          const Frame& frame = c.input<Frame>("frame");
          Frame result;
          result.reserve(frame.size());
          for(const auto& zone : frame){
            result.push_back({zone.id, fn(zone.color), zone.gamma});
          }
          out.emplace("frame", std::move(result));
        });
    }

    Frame mixFrames(const std::string& mode, const Frame& a, const Frame& b, float t)
    {
      std::unordered_map<uint8_t, const Contracts::Zone*> bById;
      for(const auto& zone : b){
        bById.emplace(zone.id, &zone);
      }
      Frame result;
      result.reserve(a.size());
      for(const auto& zone : a){
        auto match = bById.find(zone.id);
        if(match == bById.end()){
          result.push_back(zone);
          continue;
        }
        glm::vec3 mixed = blend(mode, zone.color.toNormalized(), match->second->color.toNormalized(), t);
        result.push_back({zone.id, Color::fromNormalized(mixed), zone.gamma});
      }
      return result;
    }

    bool isEightBit(const cv::Mat& mat)
    {
      return mat.type() == CV_8UC3 || mat.type() == CV_8UC4;
    }

    // b in a's pixel format (RGB/BGR order and channel count).
    cv::Mat convertToFormat(const Contracts::ImageData& b, Contracts::PixelFormat target)
    {
      using F = Contracts::PixelFormat;
      if(b.format == target){
        return b.imageMatrix;
      }
      cv::Mat rgb;
      switch(b.format){
        case F::RGB: rgb = b.imageMatrix; break;
        case F::BGR: cv::cvtColor(b.imageMatrix, rgb, cv::COLOR_BGR2RGB); break;
        case F::RGBA: cv::cvtColor(b.imageMatrix, rgb, cv::COLOR_RGBA2RGB); break;
        case F::BGRA: cv::cvtColor(b.imageMatrix, rgb, cv::COLOR_BGRA2RGB); break;
      }
      cv::Mat converted;
      switch(target){
        case F::RGB: converted = rgb; break;
        case F::BGR: cv::cvtColor(rgb, converted, cv::COLOR_RGB2BGR); break;
        case F::RGBA: cv::cvtColor(rgb, converted, cv::COLOR_RGB2RGBA); break;
        case F::BGRA: cv::cvtColor(rgb, converted, cv::COLOR_RGB2BGRA); break;
      }
      return converted;
    }

    ImagePtr mixImages(const EvalContext& ctx, const std::string& mode, float t)
    {
      const ImagePtr& a = ctx.input<ImagePtr>("a");
      const ImagePtr& b = ctx.input<ImagePtr>("b");
      if(!a || !b || !a->hasData() || !b->hasData()){
        ctx.fail("needs two images with pixel data");
      }
      if(a->width() != b->width() || a->height() != b->height()){
        ctx.fail("images differ in size (a is " + std::to_string(a->width()) + "x" +
          std::to_string(a->height()) + ", b is " + std::to_string(b->width()) + "x" +
          std::to_string(b->height()) + ")");
      }
      if(!isEightBit(a->imageMatrix) || !isEightBit(b->imageMatrix)){
        ctx.fail("images must be 8-bit with 3 or 4 channels");
      }
      cv::Mat bMat = convertToFormat(*b, a->format);
      const int channels = a->imageMatrix.channels();

      auto result = std::make_shared<Contracts::ImageData>();
      result->format = a->format;
      result->imageMatrix = a->imageMatrix.clone();
      for(int row = 0; row < result->imageMatrix.rows; ++row){
        uint8_t* dst = result->imageMatrix.ptr<uint8_t>(row);
        const uint8_t* src = bMat.ptr<uint8_t>(row);
        for(int col = 0; col < result->imageMatrix.cols; ++col){
          for(int ch = 0; ch < 3; ++ch){ // alpha, if any, stays a's
            int i = col * channels + ch;
            float av = dst[i] / 255.f;
            float mixed = av + (blendChannel(mode, av, src[i] / 255.f) - av) * t;
            dst[i] = static_cast<uint8_t>(std::round(std::clamp(mixed, 0.f, 1.f) * 255.f));
          }
        }
      }
      return result;
    }
  } // namespace

  void registerBlendNodes(NodeRegistry& registry)
  {
    add(registry, "frame.mix",
      {.purpose =
         "Blend Frame b into Frame a by t (0 gives a, 1 gives the full blend mode result). Zones match "
         "by id: the output has a's zones, a zone missing from b passes through unchanged, and zones "
         "only in b are dropped. Gamma comes from a.",
       .useWhen = "Combine a video frame with an audio frame, e.g. mode multiply to let audio gate video.",
       .example = "{\"id\": \"mixed\", \"type\": \"frame.mix\", \"params\": {\"mode\": \"add\", \"t\": 0.5}}"},
      {{"a", PortType::Frame, true}, {"b", PortType::Frame, true}, {"t", PortType::Float, false}},
      {{"frame", PortType::Frame, false}},
      {modeParam(), floatParam("t", "Mix", 0.f, 1.f, 1.f, "Blend amount when the 't' input is unconnected.")},
      [](const EvalContext& c, Outputs& out) {
        float t = std::clamp(inputOrParam(c, "t"), 0.f, 1.f);
        out.emplace("frame",
          mixFrames(c.param<std::string>("mode"), c.input<Frame>("a"), c.input<Frame>("b"), t));
      });

    add(registry, "image.mix",
      {.purpose =
         "Blend Image b into Image a by t, per pixel in RGB. Both must be the same size or the node "
         "fails. b is converted to a's pixel format and the result keeps a's format and alpha.",
       .useWhen = "Layer two video sources, e.g. difference of two captures to find motion.",
       .example = "{\"id\": \"layer\", \"type\": \"image.mix\", \"params\": {\"mode\": \"screen\", \"t\": 0.5}}",
       .cost = "moderate"},
      {{"a", PortType::Image, true}, {"b", PortType::Image, true}, {"t", PortType::Float, false}},
      {{"image", PortType::Image, false}},
      {modeParam(), floatParam("t", "Mix", 0.f, 1.f, 1.f, "Blend amount when the 't' input is unconnected.")},
      [](const EvalContext& c, Outputs& out) {
        float t = std::clamp(inputOrParam(c, "t"), 0.f, 1.f);
        out.emplace("image", mixImages(c, c.param<std::string>("mode"), t));
      });

    addFrameOp(registry, "frame.brightnessScale",
      {.purpose = "Multiply every zone's RGB by factor (1 unchanged, 0 black, above 1 brightens, clamped).",
       .useWhen = "Dim or boost a frame, e.g. fade with a Float from an lfo.",
       .example = "{\"id\": \"dim\", \"type\": \"frame.brightnessScale\", \"params\": {\"factor\": 0.5}}"},
      {{"factor", PortType::Float, false}},
      {floatParam("factor", "Factor", 0.f, 4.f, 1.f, "Scale when the 'factor' input is unconnected.")},
      [](const EvalContext& c) -> ColorFn {
        float factor = std::max(0.f, inputOrParam(c, "factor"));
        return [factor](const Color& color) { return Color::fromNormalized(color.toNormalized() * factor); };
      });

    addFrameOp(registry, "frame.saturation",
      {.purpose = "Scale color intensity about each zone's grey (1 unchanged, 0 grey, above 1 vivid).",
       .useWhen = "Wash out or punch up a frame.",
       .example = "{\"id\": \"vivid\", \"type\": \"frame.saturation\", \"params\": {\"amount\": 1.5}}"},
      {{"amount", PortType::Float, false}},
      {floatParam("amount", "Amount", 0.f, 4.f, 1.f, "Saturation when the 'amount' input is unconnected.")},
      [](const EvalContext& c) -> ColorFn {
        float amount = std::max(0.f, inputOrParam(c, "amount"));
        return [amount](const Color& color) {
          glm::vec3 grey{color.brightness()};
          return Color::fromNormalized(grey + (color.toNormalized() - grey) * amount);
        };
      });

    addFrameOp(registry, "frame.hueShift",
      {.purpose = "Rotate every zone's hue by degrees, keeping saturation and value.",
       .useWhen = "Cycle a frame around the color wheel.",
       .example = "{\"id\": \"rotate\", \"type\": \"frame.hueShift\", \"params\": {\"degrees\": 60}}"},
      {{"degrees", PortType::Float, false}},
      {floatParam("degrees", "Degrees", -360.f, 360.f, 0.f,
         "Rotation when the 'degrees' input is unconnected.")},
      [](const EvalContext& c) -> ColorFn {
        float degrees = inputOrParam(c, "degrees");
        return [degrees](const Color& color) {
          glm::vec3 hsv = color.toHSV();
          return Color::fromHSV(hsv.x + degrees, hsv.y, hsv.z);
        };
      });

    addFrameOp(registry, "frame.tint",
      {.purpose = "Multiply every zone by a tint Color, blended in by amount (0 unchanged, 1 full tint).",
       .useWhen = "Warm or cool a frame with a color from the audio or a gradient.",
       .example = "{\"id\": \"warm\", \"type\": \"frame.tint\", \"params\": {\"amount\": 1}}"},
      {{"color", PortType::Color, true}, {"amount", PortType::Float, false}},
      {floatParam("amount", "Amount", 0.f, 1.f, 1.f, "Tint strength when the 'amount' input is unconnected.")},
      [](const EvalContext& c) -> ColorFn {
        float amount = std::clamp(inputOrParam(c, "amount"), 0.f, 1.f);
        glm::vec3 tint = c.input<Color>("color").toNormalized();
        return [amount, tint](const Color& color) {
          glm::vec3 rgb = color.toNormalized();
          return Color::fromNormalized(rgb + (rgb * tint - rgb) * amount);
        };
      });
  }
} // namespace Aurora::Runtime::Graph
