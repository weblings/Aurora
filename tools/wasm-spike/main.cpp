// WASM spike driver (Aurora-51nv.4): runs a built-in graph over fixed inputs
// and prints one JSON line per recorded frame. Same source builds native and
// wasm32-emscripten so the two outputs can be diffed.
//   spike video|audio <fixtureDir>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Input/IAudioInput.hpp>
#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>
#include <Aurora/Runtime/Graph/GraphHost.hpp>

using namespace Aurora;
using namespace Aurora::Runtime;

namespace
{
  std::vector<char> readFile(const std::string& path)
  {
    std::ifstream in(path, std::ios::binary);
    return {std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
  }

  class FrameVideoInput : public Input::IVideoInput
  {
  public:
    FrameVideoInput(std::vector<char> bytes, int w, int h): m_bytes(std::move(bytes)), m_w(w), m_h(h) {}
    const std::string& name() const override { static const std::string n = "fixed"; return n; }
    Resolution displayResolution() const override { return {m_w, m_h}; }
    RefreshRate displayRefreshRate() const override { return 60; }
    void grabFrameSubsample(Contracts::ImageData& image) override
    {
      const size_t frameBytes = size_t(m_w) * m_h * 4;
      const size_t offset = (m_tick++ % (m_bytes.size() / frameBytes)) * frameBytes;
      image.format = Contracts::PixelFormat::RGBA;
      image.imageMatrix = cv::Mat(m_h, m_w, CV_8UC4);
      std::memcpy(image.imageMatrix.data, m_bytes.data() + offset, frameBytes);
    }
  private:
    std::vector<char> m_bytes;
    int m_w, m_h;
    size_t m_tick{0};
  };

  class PcmAudioInput : public Input::IAudioInput
  {
  public:
    explicit PcmAudioInput(std::vector<char> bytes): m_bytes(std::move(bytes)) {}
    const std::string& name() const override { static const std::string n = "fixed"; return n; }
    void readNextBuffer(Contracts::AudioBuffer& buffer) override
    {
      constexpr size_t perTick = 800;
      buffer.sampleRate = 48000;
      buffer.channelCount = 1;
      buffer.samples.assign(perTick, 0.f);
      const size_t total = m_bytes.size() / sizeof(float);
      if((m_pos + perTick) <= total){
        std::memcpy(buffer.samples.data(), m_bytes.data() + m_pos * sizeof(float), perTick * sizeof(float));
      }
      m_pos += perTick;
    }
  private:
    std::vector<char> m_bytes;
    size_t m_pos{0};
  };

  class PrintOutput : public Output::IOutput
  {
  public:
    PrintOutput(std::string name, std::vector<uint8_t> ids, const int& tick): m_name(std::move(name)), m_ids(std::move(ids)), m_tick(tick) {}
    const std::string& name() const override { return m_name; }
    void init() override {}
    bool isConnected() const override { return true; }
    void shutdown(bool) override {}
    std::vector<uint8_t> zoneIds() const override { return m_ids; }
    void send(const Contracts::Frame& frame) override
    {
      std::printf("{\"tick\":%d,\"output\":\"%s\",\"zones\":[", m_tick, m_name.c_str());
      for(size_t i = 0; i < frame.size(); ++i){
        const glm::vec3 c = frame[i].color.toNormalized();
        std::printf("%s[%d,%.9g,%.9g,%.9g,%.9g]", i ? "," : "", int(frame[i].id), c.r, c.g, c.b, frame[i].gamma);
      }
      std::printf("]}\n");
    }
  private:
    std::string m_name;
    std::vector<uint8_t> m_ids;
    const int& m_tick;
  };

  class Host : public Runtime::Graph::IGraphHost
  {
  public:
    Input::IVideoInput* video{nullptr};
    Input::IAudioInput* audio{nullptr};
    std::unordered_map<std::string, Output::IOutput*> outputs;
    std::unordered_map<std::string, ZoneMap> zoneMaps;
    Input::IVideoInput* videoInput() override { return video; }
    Input::IAudioInput* audioInput() override { return audio; }
    Output::IOutput* output(std::string_view n) override
    {
      auto it = outputs.find(std::string(n));
      return it == outputs.end() ? nullptr : it->second;
    }
    const ZoneMap* zoneMap(std::string_view n) override
    {
      auto it = zoneMaps.find(std::string(n));
      return it == zoneMaps.end() ? nullptr : &it->second;
    }
  };

  ZoneConfig zone(uint8_t id, float u0, float v0, float u1, float v1, bool active = true, float gamma = 0.f)
  {
    ZoneConfig z;
    z.zoneId = id;
    z.uvs = {{u0, v0}, {u1, v1}};
    z.active = active;
    z.gamma = gamma;
    z.everConfigured = true;
    return z;
  }
}

int main(int argc, char** argv)
{
  if(argc < 3){
    std::fprintf(stderr, "usage: spike video|audio <fixtureDir>\n");
    return 2;
  }
  const std::string mode = argv[1];
  const std::string dir = argv[2];
  const bool isAudio = mode == "audio";

  ConfigData config;
  config.refreshRate = 60;
  Graph::NodeRegistry registry;
  Graph::registerAllNodes(registry, true);

  int tick = 0;
  Host host;
  std::unique_ptr<Input::IVideoInput> video;
  std::unique_ptr<Input::IAudioInput> audio;
  std::vector<std::unique_ptr<PrintOutput>> outputs;
  int ticks = 0;

  if(isAudio){
    config.audioFixedAnchorHue = 30.f;
    audio = std::make_unique<PcmAudioInput>(readFile(dir + "/pcm.f32"));
    host.audio = audio.get();
    ZoneMap zones = {zone(1, 0, 0, 1, 1), zone(2, 0, 0, 1, 1, true, 0.5f), zone(3, 0, 0, 1, 1, false)};
    outputs.push_back(std::make_unique<PrintOutput>("hue", std::vector<uint8_t>{1, 2, 3}, tick));
    host.zoneMaps["hue"] = zones;
    ticks = 240;
  } else {
    config.subsampleWidth = 16;
    config.interpolation = Contracts::Interpolation::Type::Area;
    config.transitionSmoothing = 0.5f;
    video = std::make_unique<FrameVideoInput>(readFile(dir + "/frames.rgba"), 64, 32);
    host.video = video.get();
    ZoneMap quads = {zone(1, 0, 0, .5f, .5f), zone(2, .5f, 0, 1, .5f), zone(3, 0, .5f, .5f, 1), zone(4, .5f, .5f, 1, 1)};
    outputs.push_back(std::make_unique<PrintOutput>("hue", std::vector<uint8_t>{1, 2, 3, 4}, tick));
    host.zoneMaps["hue"] = quads;
    ticks = 30;
  }
  host.outputs["hue"] = outputs.front().get();

  const std::vector<std::string> names{"hue"};
  Graph::LoadResult loaded = isAudio
    ? Graph::loadBuiltInAudioGraph(registry, names, config)
    : Graph::loadBuiltInVideoGraph(registry, names, config);
  if(!loaded.ok){
    std::fprintf(stderr, "load failed: %s\n", loaded.error.c_str());
    return 1;
  }

  for(tick = 0; tick < ticks; ++tick){
    loaded.graph.tick(1.0f / 60.0f, &host);
  }
  return 0;
}
