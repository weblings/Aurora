#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_set>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Contracts/Frame.hpp>
#include <Aurora/Input/IAudioInput.hpp>
#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphHost.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

// A draft graph evaluated beside the live one in the same tick (Aurora-52oz.6).
// It reads the live inputs and zone maps, but every output.send lands in a
// preview sink instead of the real output, so nothing reaches the lights. The
// latest zone colors per output are kept for readers on other threads.
namespace Aurora::Runtime
{
  class GraphPreview
  {
  public:
    struct Zone
    {
      std::uint8_t id{0};
      float r{0.f};
      float g{0.f};
      float b{0.f};
      bool error{false}; // magenta, with this flag so a client can add a pattern
    };

    struct OutputColors
    {
      std::string output;
      std::vector<Zone> zones;
    };

    struct Error
    {
      std::string output;
      std::string node;
      std::string message;
    };

    struct Snapshot
    {
      std::vector<OutputColors> outputs;
      std::vector<Error> errors;
      double tickMs{0.0}; // smoothed cost of one preview tick
    };

    // Null with errorOut set when `doc` fails to load.
    static std::shared_ptr<GraphPreview> create(
      const nlohmann::json& doc,
      const Graph::NodeRegistry& registry,
      const std::unordered_set<std::string>& knownOutputs,
      std::string& errorOut);

    // Swaps in `doc`, moving node state across by id. False with errorOut set
    // and the running preview untouched when it fails to load.
    bool reload(
      const nlohmann::json& doc,
      const Graph::NodeRegistry& registry,
      const std::unordered_set<std::string>& knownOutputs,
      std::string& errorOut);

    // Inputs the live pipeline does not run, opened for this preview alone and
    // closed with it (Aurora-4xqt.1). Each one serves in place of the live one.
    struct Inputs
    {
      std::unique_ptr<Input::IVideoInput> video;
      std::unique_ptr<Input::IAudioInput> audio;
    };
    void setInputs(Inputs inputs) { m_inputs = std::move(inputs); }
    bool hasVideo() const { return m_inputs.video != nullptr; }
    bool hasAudio() const { return m_inputs.audio != nullptr; }

    // Under the lock that guards the live tick. `live` serves inputs, zone
    // maps and the live outputs' zone ids.
    void tick(float dt, Graph::IGraphHost& live);

    Snapshot snapshot() const;

    // Set once the preview is replaced or removed, so its stream can end.
    void close() { m_closed = true; }
    bool closed() const { return m_closed.load(); }

  private:
    // Swallows frames. zoneIds stays empty: a preview never reconciles zones.
    class Sink : public Output::IOutput
    {
    public:
      explicit Sink(std::string name): m_name(std::move(name)) {}

      const std::string& name() const override { return m_name; }
      void init() override {}
      bool isConnected() const override { return true; }
      void shutdown(bool) override {}
      std::vector<std::uint8_t> zoneIds() const override { return {}; }
      void send(const Contracts::Frame& frame) override { m_frame = frame; m_got = true; }

      Contracts::Frame takeFrame(bool& got) { got = m_got; m_got = false; return std::move(m_frame); }

    private:
      std::string m_name;
      Contracts::Frame m_frame;
      bool m_got{false};
    };

    class Host : public Graph::IGraphHost
    {
    public:
      Host(GraphPreview& owner, Graph::IGraphHost& live): m_owner(owner), m_live(live) {}

      Input::IVideoInput* videoInput() override
      {
        return m_owner.m_inputs.video ? m_owner.m_inputs.video.get() : m_live.videoInput();
      }
      Input::IAudioInput* audioInput() override
      {
        return m_owner.m_inputs.audio ? m_owner.m_inputs.audio.get() : m_live.audioInput();
      }
      Output::IOutput* output(std::string_view name) override;
      const ZoneMap* zoneMap(std::string_view outputName) override { return m_live.zoneMap(outputName); }

    private:
      GraphPreview& m_owner;
      Graph::IGraphHost& m_live;
    };

    struct SendNode
    {
      std::string nodeId;
      std::string output;
    };

    GraphPreview() = default;

    bool _load(
      const nlohmann::json& doc,
      const Graph::NodeRegistry& registry,
      const std::unordered_set<std::string>& knownOutputs,
      bool adopt,
      std::string& errorOut);

    Inputs m_inputs;
    Graph::Graph m_graph;
    std::vector<SendNode> m_sends;
    std::map<std::string, std::unique_ptr<Sink>, std::less<>> m_sinks;

    mutable std::mutex m_mutex;
    Snapshot m_snapshot;
    std::atomic<bool> m_closed{false};
  };
}
