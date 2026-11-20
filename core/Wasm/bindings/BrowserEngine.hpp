#pragma once

#include <cstddef>
#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <unordered_set>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Runtime/Graph/GraphHost.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>
#include <Aurora/Runtime/PreviewEvaluator.hpp>

// The browser-facing engine: one live graph plus any number of preview sessions over
// one fed frame and audio block. Every call takes and returns JSON text, shaped by
// the same C++ the server routes use, so a wrapper forwards it unchanged. Not
// thread-safe. Plain C++ so the sample generator checks it natively.
namespace Aurora::Wasm
{
  class BrowserEngine
  {
  public:
    BrowserEngine();
    ~BrowserEngine();

    // {"outputs": [{"name", "zones": [ZoneMapStore zone JSON]}]}. Resets everything.
    std::string init(const std::string& json);
    // {"output", "zones": [...]}. Applies on the next step, no graph reload.
    std::string setZones(const std::string& json);
    // The GET /api/nodes body, with the init outputs in the "output" enums.
    std::string nodes();
    // The draft validation body: {"valid", "errors": [...]}.
    std::string validate(const std::string& doc);
    std::string loadLive(const std::string& doc);
    // layout is "lights" (or empty), "room" or "basic". Replaces an open session of that name.
    std::string openPreview(const std::string& session, const std::string& doc, const std::string& layout);
    std::string reloadPreview(const std::string& session, const std::string& doc);
    std::string closePreview(const std::string& session);

    // Tightly packed RGBA, copied. Kept until the next feed.
    void feedVideo(const std::uint8_t* rgba, int width, int height);
    // Interleaved floats, copied. Served to every graph for the next step only.
    void feedAudio(const float* samples, std::size_t count, unsigned sampleRate, unsigned channels);

    // Ticks the live graph, then each preview, then drops the audio block.
    std::string step(float dt);
    std::string liveColors();
    std::string previewSnapshot(const std::string& session);

  private:
    class VideoSource;
    class AudioSource;
    class ZonesOutput;
    class Host;

    struct OutputState
    {
      Runtime::ZoneMap zones;
      std::unique_ptr<ZonesOutput> output;
    };

    std::vector<std::string> _outputNames() const;
    std::unordered_set<std::string> _outputSet() const;

    Runtime::Graph::NodeRegistry m_registry;
    std::unique_ptr<VideoSource> m_video;
    std::unique_ptr<AudioSource> m_audio;
    std::unique_ptr<Host> m_host;
    std::map<std::string, OutputState> m_outputs;
    std::unique_ptr<Runtime::PreviewEvaluator> m_live;
    std::map<std::string, std::unique_ptr<Runtime::PreviewEvaluator>> m_previews;
  };
}
