#include "BrowserEngine.hpp"

#include <cstring>
#include <optional>
#include <utility>

#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/GraphValidation.hpp>
#include <Aurora/Runtime/NodeCatalog.hpp>
#include <Aurora/Runtime/ZoneMapJson.hpp>

namespace Aurora::Wasm
{
  using Json = nlohmann::json;
  using namespace Aurora::Runtime;

  namespace
  {
    std::string _ok()
    {
      return R"({"ok":true})";
    }

    std::string _error(const std::string& code, const std::string& message = {})
    {
      Json body{{"error", code}};
      if(!message.empty()){
        body["message"] = message;
      }
      return body.dump();
    }

    // False with `error` set to the ready reply when `text` is not JSON.
    bool _parse(const std::string& text, Json& out, std::string& error)
    {
      out = Json::parse(text, nullptr, /*allow_exceptions*/ false);
      if(out.is_discarded()){
        error = _error("invalid_json");
        return false;
      }
      return true;
    }
  }


  // Serves the last fed frame to every graph. A fresh matrix per feed, so a node
  // that cached the previous frame keeps its own copy.
  class BrowserEngine::VideoSource : public Input::IVideoInput
  {
  public:
    const std::string& name() const override { static const std::string n = "browser"; return n; }
    Resolution displayResolution() const override { return {m_image.width(), m_image.height()}; }
    RefreshRate displayRefreshRate() const override { return 60; }
    std::uint64_t frameSerial() const override { return m_serial; }
    void grabFrameSubsample(Contracts::ImageData& image) override { image = m_image; }

    void feed(const std::uint8_t* rgba, int width, int height)
    {
      m_image.format = Contracts::PixelFormat::RGBA;
      m_image.imageMatrix = cv::Mat(height, width, CV_8UC4);
      std::memcpy(m_image.imageMatrix.data, rgba, std::size_t(width) * height * 4);
      ++m_serial;
    }

  private:
    Contracts::ImageData m_image{};
    std::uint64_t m_serial{0};
  };


  // Serves one fed block to every graph that reads this step, then reads empty.
  class BrowserEngine::AudioSource : public Input::IAudioInput
  {
  public:
    const std::string& name() const override { static const std::string n = "browser"; return n; }
    void readNextBuffer(Contracts::AudioBuffer& buffer) override { buffer = m_block; }

    void feed(const float* samples, std::size_t count, unsigned sampleRate, unsigned channels)
    {
      m_block.samples.assign(samples, samples + count);
      m_block.sampleRate = sampleRate;
      m_block.channelCount = channels;
    }
    void clear() { m_block.samples.clear(); }

  private:
    Contracts::AudioBuffer m_block{};
  };


  // A preview's sinks swallow frames, so this only reports zone ids for the error path.
  class BrowserEngine::ZonesOutput : public Output::IOutput
  {
  public:
    ZonesOutput(std::string name, const ZoneMap& zones): m_name(std::move(name)), m_zones(zones) {}

    const std::string& name() const override { return m_name; }
    void init() override {}
    bool isConnected() const override { return true; }
    void shutdown(bool) override {}
    std::vector<std::uint8_t> zoneIds() const override
    {
      std::vector<std::uint8_t> ids;
      for(const ZoneConfig& zone : m_zones){
        ids.push_back(zone.zoneId);
      }
      return ids;
    }
    void send(const Contracts::Frame&) override {}

  private:
    std::string m_name;
    const ZoneMap& m_zones;
  };


  class BrowserEngine::Host : public Graph::IGraphHost
  {
  public:
    explicit Host(BrowserEngine& owner): m_owner(owner) {}

    Input::IVideoInput* videoInput() override { return m_owner.m_video.get(); }
    Input::IAudioInput* audioInput() override { return m_owner.m_audio.get(); }
    Output::IOutput* output(std::string_view name) override
    {
      auto it = m_owner.m_outputs.find(std::string(name));
      return it == m_owner.m_outputs.end() ? nullptr : it->second.output.get();
    }
    const ZoneMap* zoneMap(std::string_view name) override
    {
      auto it = m_owner.m_outputs.find(std::string(name));
      return it == m_owner.m_outputs.end() ? nullptr : &it->second.zones;
    }

  private:
    BrowserEngine& m_owner;
  };


  BrowserEngine::BrowserEngine()
  : m_video(std::make_unique<VideoSource>())
  , m_audio(std::make_unique<AudioSource>())
  , m_host(std::make_unique<Host>(*this))
  {
    Graph::registerAllNodes(m_registry, true);
  }


  BrowserEngine::~BrowserEngine() = default;


  std::vector<std::string> BrowserEngine::_outputNames() const
  {
    std::vector<std::string> names;
    for(const auto& entry : m_outputs){
      names.push_back(entry.first);
    }
    return names;
  }


  std::unordered_set<std::string> BrowserEngine::_outputSet() const
  {
    const auto names = _outputNames();
    return {names.begin(), names.end()};
  }


  std::string BrowserEngine::init(const std::string& json)
  {
    Json body;
    std::string error;
    if(!_parse(json, body, error)){ return error; }
    try{
      std::map<std::string, OutputState> outputs;
      for(const Json& entry : body.at("outputs")){
        const std::string name = entry.at("name").get<std::string>();
        OutputState& state = outputs[name];
        state.zones = zoneMapFromJson(entry.value("zones", Json::array()));
        state.output = std::make_unique<ZonesOutput>(name, state.zones);
      }
      m_live.reset();
      m_previews.clear();
      m_outputs = std::move(outputs);
    }
    catch(const Json::exception& e){
      return _error("invalid_init", e.what());
    }
    return _ok();
  }


  std::string BrowserEngine::setZones(const std::string& json)
  {
    Json body;
    std::string error;
    if(!_parse(json, body, error)){ return error; }
    try{
      auto it = m_outputs.find(body.at("output").get<std::string>());
      if(it == m_outputs.end()){
        return _error("unknown_output");
      }
      it->second.zones = zoneMapFromJson(body.at("zones"));
    }
    catch(const Json::exception& e){
      return _error("invalid_zones", e.what());
    }
    return _ok();
  }


  std::string BrowserEngine::nodes()
  {
    const auto names = _outputNames();
    return nodesPayload(&names).dump();
  }


  std::string BrowserEngine::validate(const std::string& doc)
  {
    Json body;
    std::string error;
    if(!_parse(doc, body, error)){ return error; }
    return validateGraphDoc(m_registry, _outputNames(), body).dump();
  }


  std::string BrowserEngine::loadLive(const std::string& doc)
  {
    Json body;
    std::string error;
    if(!_parse(doc, body, error)){ return error; }
    auto live = std::make_unique<PreviewEvaluator>();
    if(!live->load(body, m_registry, _outputSet(), error)){
      return _error("cannot_load", error);
    }
    m_live = std::move(live);
    return _ok();
  }


  std::string BrowserEngine::openPreview(const std::string& session, const std::string& doc, const std::string& layout)
  {
    Json body;
    std::string error;
    if(!_parse(doc, body, error)){ return error; }

    std::optional<ZoneMap> sim;
    if(layout == "basic"){
      sim = basicRoomZoneMap();
    }
    else if(layout == "room"){
      // The browser keeps one zone map per output, so Room is the first output's zones.
      if(m_outputs.empty() || m_outputs.begin()->second.zones.empty()){
        return _error("cannot_preview", "no saved zone map");
      }
      sim = m_outputs.begin()->second.zones;
    }
    else if(!layout.empty() && layout != "lights"){
      return _error("invalid_layout");
    }

    auto preview = std::make_unique<PreviewEvaluator>();
    if(!preview->load(body, m_registry, _outputSet(), error)){
      return _error("cannot_preview", error);
    }
    if(sim){
      preview->setSimZones(std::move(*sim));
    }
    m_previews[session] = std::move(preview);
    return _ok();
  }


  std::string BrowserEngine::reloadPreview(const std::string& session, const std::string& doc)
  {
    auto it = m_previews.find(session);
    if(it == m_previews.end()){
      return _error("no_preview");
    }
    Json body;
    std::string error;
    if(!_parse(doc, body, error)){ return error; }
    if(!it->second->reload(body, m_registry, _outputSet(), error)){
      return _error("draft_invalid", error);
    }
    return _ok();
  }


  std::string BrowserEngine::closePreview(const std::string& session)
  {
    m_previews.erase(session);
    return _ok();
  }


  void BrowserEngine::feedVideo(const std::uint8_t* rgba, int width, int height)
  {
    m_video->feed(rgba, width, height);
  }


  void BrowserEngine::feedAudio(const float* samples, std::size_t count, unsigned sampleRate, unsigned channels)
  {
    m_audio->feed(samples, count, sampleRate, channels);
  }


  std::string BrowserEngine::step(float dt)
  {
    if(m_live){
      m_live->tick(dt, *m_host);
    }
    for(auto& entry : m_previews){
      entry.second->tick(dt, *m_host);
    }
    m_audio->clear();
    return _ok();
  }


  std::string BrowserEngine::liveColors()
  {
    if(!m_live){
      return _error("no_live_graph");
    }
    return previewSnapshotJson("live", m_live->snapshot()).dump();
  }


  std::string BrowserEngine::previewSnapshot(const std::string& session)
  {
    auto it = m_previews.find(session);
    if(it == m_previews.end()){
      return _error("no_preview");
    }
    return previewSnapshotJson(session, it->second->snapshot()).dump();
  }
}
