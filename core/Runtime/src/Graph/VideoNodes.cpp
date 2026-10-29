#include <Aurora/Runtime/Graph/VideoNodes.hpp>

#include <cmath>
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Processing/ImageProcessing.hpp>
#include <Aurora/Runtime/FrameCompositor.hpp>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    Contracts::Interpolation::Type parseInterpolation(const std::string& name)
    {
      const auto& known = Contracts::Interpolation::availableInterpolations;
      auto it = known.find(name);
      if(it == known.end()){
        throw std::runtime_error("unknown interpolation '" + name + "' (expected Nearest, Cubic or Area)");
      }
      return it->second;
    }

    // video.capture: grabFrameSubsample every tick (the lazy rebuild lives
    // there), unhealthy or empty -> Absent. Reuses the same ImagePtr while
    // frameSerial() is unchanged (Aurora-igwa); serial 0 means unknown, so
    // every frame is treated as new.
    class VideoCaptureNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        Input::IVideoInput* input = ctx.requireHost().videoInput();
        if(input == nullptr){
          ctx.fail("needs a video input but the host offers none");
        }
        // grabFrameSubsample runs unconditionally: backends rebuild a lost
        // capture source here (e.g. macOS screen-lock teardown).
        input->grabFrameSubsample(m_scratch);
        if(!input->isHealthy() || !m_scratch.hasData()){
          outputs.emplace("image", Absent{});
          return;
        }
        const std::uint64_t serial = input->frameSerial();
        if(serial == 0 || !m_hasCache || serial != m_serial || !m_cached ||
           !m_cached->hasData()){
          m_cached = std::make_shared<Contracts::ImageData>(m_scratch);
          m_serial = serial;
          m_hasCache = true;
        }
        outputs.emplace("image", m_cached);
      }

    private:
      std::vector<PortDecl> m_in{};
      std::vector<PortDecl> m_out{{"image", PortType::Image, false}};
      Contracts::ImageData m_scratch{};
      ImagePtr m_cached{};
      std::uint64_t m_serial{0};
      bool m_hasCache{false};
    };

    // image.rescale: today's subsampleWidth/interpolation. Width 0 (or an
    // upscale request, which rescale() answers with empty output) passes
    // the input pointer through, matching _prepareSource's hasData guard.
    // Caches by input pointer identity; any param change rebuilds
    // (today's setConfig resets m_preparedSerial for the same reason).
    class RescaleNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const ImagePtr& input = ctx.input<ImagePtr>("image");
        const float widthParam = ctx.param<float>("width");
        const std::string& interpName = ctx.param<std::string>("interpolation");
        const int width = static_cast<int>(std::round(widthParam));

        if(width <= 0 || !input->hasData() || input->width() <= width){
          m_lastInput = input;
          m_cached = input;
          m_lastWidth = widthParam;
          m_lastInterp = interpName;
          outputs.emplace("image", input);
          return;
        }
        if(m_lastInput == input && m_lastWidth == widthParam && m_lastInterp == interpName &&
           m_cached && m_cached->hasData() && m_cached->width() == width){
          outputs.emplace("image", m_cached);
          return;
        }
        Contracts::ImageData resized{};
        Processing::ImageProcessing::rescale(*input, resized, width, parseInterpolation(interpName));
        if(resized.hasData()){
          m_cached = std::make_shared<Contracts::ImageData>(std::move(resized));
        } else {
          // Upscale guard: rescale() leaves output empty when the source
          // is narrower than requested -- keep flowing the input.
          m_cached = input;
        }
        m_lastInput = input;
        m_lastWidth = widthParam;
        m_lastInterp = interpName;
        outputs.emplace("image", m_cached);
      }

    private:
      std::vector<PortDecl> m_in{{"image", PortType::Image, true}};
      std::vector<PortDecl> m_out{{"image", PortType::Image, false}};
      ImagePtr m_lastInput{};
      ImagePtr m_cached{};
      float m_lastWidth{0.f};
      std::string m_lastInterp{"Area"};
    };

    // image.dropAlpha: safe no-op for already-opaque formats. Passes the
    // input pointer through when there is no alpha channel, and caches by
    // input identity so a static BGRA desktop converts once (Aurora-igwa).
    class DropAlphaNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const ImagePtr& input = ctx.input<ImagePtr>("image");
        if(input->format == Contracts::PixelFormat::RGB ||
           input->format == Contracts::PixelFormat::BGR){
          outputs.emplace("image", input);
          return;
        }
        if(m_lastInput != input || !m_cached){
          Contracts::ImageData opaque{};
          Processing::ImageProcessing::dropAlpha(*input, opaque);
          m_cached = std::make_shared<Contracts::ImageData>(std::move(opaque));
          m_lastInput = input;
        }
        outputs.emplace("image", m_cached);
      }

    private:
      std::vector<PortDecl> m_in{{"image", PortType::Image, true}};
      std::vector<PortDecl> m_out{{"image", PortType::Image, false}};
      ImagePtr m_lastInput{};
      ImagePtr m_cached{};
    };

    // zones.sample: composeFrame over the live zone map for one output.
    // Reads IGraphHost::zoneMap(output) every tick so updateZone edits
    // apply without a graph reload.
    class ZonesSampleNode : public INode
    {
    public:
      const std::vector<PortDecl>& inputPorts() const override { return m_in; }
      const std::vector<PortDecl>& outputPorts() const override { return m_out; }

      void evaluate(
        const EvalContext& ctx,
        float,
        std::unordered_map<std::string, GraphValue>& outputs) override
      {
        const ImagePtr& image = ctx.input<ImagePtr>("image");
        const std::string& outputName = ctx.param<std::string>("output");
        if(outputName.empty()){
          ctx.fail("needs param 'output' naming an output (expected an output the app registered)");
        }
        const ZoneMap* zoneMap = ctx.requireHost().zoneMap(outputName);
        if(zoneMap == nullptr){
          ctx.fail("unknown output '" + outputName + "' (expected an output the app registered)");
        }
        outputs.emplace("frame", composeFrame(*image, *zoneMap));
      }

    private:
      std::vector<PortDecl> m_in{{"image", PortType::Image, true}};
      std::vector<PortDecl> m_out{{"frame", PortType::Frame, false}};
    };

    ParamDecl widthParam()
    {
      ParamDecl decl;
      decl.name = "width";
      decl.kind = ParamKind::Float;
      decl.schema.label = "Resample width";
      decl.schema.min = 0.f;
      decl.schema.max = 7680.f; // UI hint only, the loader doesn't range-check
      decl.schema.step = 1.f;
      decl.schema.unit = "px";
      decl.schema.defaultValue = 0.f; // 0 = passthrough (unset subsampleWidth)
      decl.description = "Target width in px; 0 passes the image through (today's unset subsampleWidth).";
      return decl;
    }

    ParamDecl interpolationParam()
    {
      ParamDecl decl;
      decl.name = "interpolation";
      decl.kind = ParamKind::Enum;
      decl.enumOptions = {"Nearest", "Cubic", "Area"};
      decl.defaultEnum = "Area"; // today's default
      decl.description = "Downscale filter (today's video.interpolation; keep Area for thin detail).";
      return decl;
    }

    ParamDecl outputParam()
    {
      ParamDecl decl;
      decl.name = "output";
      decl.kind = ParamKind::Enum;
      decl.enumOptions = {}; // any output name; checked against knownOutputs at load
      decl.defaultEnum = "";
      decl.description = "Output whose live zone map is sampled (per-output binding, not a port).";
      return decl;
    }
  } // namespace

  void registerVideoNodes(NodeRegistry& registry)
  {
    registry.registerType(
      "video.capture",
      NodeTypeInfo{
        .meta =
          {
            .title = "Video capture",
            .purpose = "Grab one video frame per tick; Absent while the source is unhealthy.",
            .useWhen = "First node of any video path.",
            .example = "{\"id\": \"cap\", \"type\": \"video.capture\", \"params\": {}}",
            .cost = "heavy",
          },
        .inputs = {},
        .outputs = {{"image", PortType::Image, false, "One video frame per tick; Absent while the source is unhealthy."}},
        .params = {},
        .factory = [] { return std::make_unique<VideoCaptureNode>(); },
      });

    registry.registerType(
      "image.rescale",
      NodeTypeInfo{
        .meta =
          {
            .title = "Rescale image",
            .purpose = "Downscale an image to a target width (today's subsampleWidth).",
            .useWhen = "After capture, before sampling; width 0 passes through.",
            .example =
              "{\"id\": \"small\", \"type\": \"image.rescale\", \"params\": {\"width\": 96, \"interpolation\": "
              "\"Area\"}}",
            .cost = "moderate",
          },
        .inputs = {{"image", PortType::Image, true, "The Image to downscale."}},
        .outputs = {{"image", PortType::Image, false, "The downscaled Image."}},
        .params = {widthParam(), interpolationParam()},
        .factory = [] { return std::make_unique<RescaleNode>(); },
      });

    registry.registerType(
      "image.dropAlpha",
      NodeTypeInfo{
        .meta =
          {
            .title = "Drop alpha",
            .purpose = "Drop the alpha channel (no-op for already-opaque images).",
            .useWhen = "After rescale, before zone sampling.",
            .example = "{\"id\": \"opaque\", \"type\": \"image.dropAlpha\", \"params\": {}}",
            .cost = "cheap",
          },
        .inputs = {{"image", PortType::Image, true, "The Image to make opaque."}},
        .outputs = {{"image", PortType::Image, false, "The Image without its alpha channel."}},
        .params = {},
        .factory = [] { return std::make_unique<DropAlphaNode>(); },
      });

    registry.registerType(
      "zones.sample",
      NodeTypeInfo{
        .meta =
          {
            .title = "Sample zones",
            .purpose = "Sample zone colors from an image via one output's live zone map.",
            .useWhen = "After the image path is prepared; outputs one Frame.",
            .example = "{\"id\": \"zones\", \"type\": \"zones.sample\", \"params\": {\"output\": \"hue\"}}",
            .cost = "moderate",
          },
        .inputs = {{"image", PortType::Image, true, "The Image to sample zone colors from."}},
        .outputs = {{"frame", PortType::Frame, false, "One color per zone of the output."}},
        .params = {outputParam()},
        .factory = [] { return std::make_unique<ZonesSampleNode>(); },
      });
  }
} // namespace Aurora::Runtime::Graph
