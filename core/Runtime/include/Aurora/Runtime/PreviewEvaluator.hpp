#pragma once

#include <cstdint>
#include <map>
#include <memory>
#include <optional>
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
#include <Aurora/Runtime/ZoneMap.hpp>

// The lock-free core of a draft preview: owns the graph and its sinks and keeps
// the last snapshot. Not thread-safe. GraphPreview wraps it with the lock.
namespace Aurora::Runtime
{
  class PreviewEvaluator
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
      // Plain-string code for editors to word the failure (a node threw during a tick); the message is for agents.
      std::string code{"node_tick_failed"};
    };

    struct Snapshot
    {
      std::vector<OutputColors> outputs;
      std::vector<Error> errors;
      double tickMs{0.0}; // smoothed cost of one tick, set by whoever times it
    };

    // Inputs the live pipeline does not run, opened for this preview alone.
    struct Inputs
    {
      std::unique_ptr<Input::IVideoInput> video;
      std::unique_ptr<Input::IAudioInput> audio;
    };

    // False with errorOut set when `doc` fails to load.
    bool load(
      const nlohmann::json& doc,
      const Graph::NodeRegistry& registry,
      const std::unordered_set<std::string>& knownOutputs,
      std::string& errorOut);

    // Swaps in `doc`, moving node state across by id. False with errorOut set
    // and the running graph untouched when it fails to load.
    bool reload(
      const nlohmann::json& doc,
      const Graph::NodeRegistry& registry,
      const std::unordered_set<std::string>& knownOutputs,
      std::string& errorOut);

    void setInputs(Inputs inputs) { m_inputs = std::move(inputs); }
    // Every output the graph sends to samples these zones instead of the live zone map.
    void setSimZones(ZoneMap zones) { m_simZones = std::move(zones); }

    bool hasVideo() const { return m_inputs.video != nullptr; }
    bool hasAudio() const { return m_inputs.audio != nullptr; }

    // `live` serves inputs, zone maps and the live outputs' zone ids.
    void tick(float dt, Graph::IGraphHost& live);

    const Snapshot& snapshot() const { return m_snapshot; }

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
      Host(PreviewEvaluator& owner, Graph::IGraphHost& live): m_owner(owner), m_live(live) {}

      Input::IVideoInput* videoInput() override
      {
        return m_owner.m_inputs.video ? m_owner.m_inputs.video.get() : m_live.videoInput();
      }
      Input::IAudioInput* audioInput() override
      {
        return m_owner.m_inputs.audio ? m_owner.m_inputs.audio.get() : m_live.audioInput();
      }
      Output::IOutput* output(std::string_view name) override;
      const ZoneMap* zoneMap(std::string_view outputName) override
      {
        return m_owner.m_simZones ? &*m_owner.m_simZones : m_live.zoneMap(outputName);
      }

    private:
      PreviewEvaluator& m_owner;
      Graph::IGraphHost& m_live;
    };

    struct SendNode
    {
      std::string nodeId;
      std::string output;
    };

    bool _load(
      const nlohmann::json& doc,
      const Graph::NodeRegistry& registry,
      const std::unordered_set<std::string>& knownOutputs,
      bool adopt,
      std::string& errorOut);

    Inputs m_inputs;
    std::optional<ZoneMap> m_simZones;
    Graph::Graph m_graph;
    std::vector<SendNode> m_sends;
    std::map<std::string, std::unique_ptr<Sink>, std::less<>> m_sinks;
    Snapshot m_snapshot;
  };


  // The preview stream's event body: {"session", "tickMs", "outputs": [{"output",
  // "zones": [{"id", "r", "g", "b", "error"}]}], "errors": [...]}.
  nlohmann::json previewSnapshotJson(const std::string& session, const PreviewEvaluator::Snapshot& snapshot);
}
