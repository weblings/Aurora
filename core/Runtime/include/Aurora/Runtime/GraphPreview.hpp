#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
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
#include <Aurora/Runtime/PreviewEvaluator.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>

// A draft graph evaluated beside the live one in the same tick (Aurora-52oz.6).
// It reads the live inputs and zone maps, but every output.send lands in a
// preview sink instead of the real output, so nothing reaches the lights. The
// latest zone colors per output are kept for readers on other threads.
namespace Aurora::Runtime
{
  // Which zones the editor preview draws: the live output's, the saved zone map
  // (which outlives an unreachable bridge), or the built-in basic room.
  enum class PreviewLayout { Lights, Room, Basic };

  class GraphPreview
  {
  public:
    using Zone = PreviewEvaluator::Zone;
    using OutputColors = PreviewEvaluator::OutputColors;
    using Error = PreviewEvaluator::Error;
    using Snapshot = PreviewEvaluator::Snapshot;
    using Inputs = PreviewEvaluator::Inputs;

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
    void setInputs(Inputs inputs) { m_evaluator.setInputs(std::move(inputs)); }
    // A sim layout (Aurora-u8jx.6.1): every output the graph sends to samples these zones instead
    // of the live zone map, and nothing is sent anywhere. Unset draws the live zones.
    void setSimZones(ZoneMap zones) { m_evaluator.setSimZones(std::move(zones)); }

    bool hasVideo() const { return m_evaluator.hasVideo(); }
    bool hasAudio() const { return m_evaluator.hasAudio(); }

    // Under the lock that guards the live tick. `live` serves inputs, zone
    // maps and the live outputs' zone ids.
    void tick(float dt, Graph::IGraphHost& live);

    Snapshot snapshot() const;

    // Set once the preview is replaced or removed, so its stream can end.
    void close() { m_closed = true; }
    bool closed() const { return m_closed.load(); }

  private:
    GraphPreview() = default;

    PreviewEvaluator m_evaluator;

    mutable std::mutex m_mutex;
    Snapshot m_snapshot;
    std::atomic<bool> m_closed{false};
  };
}
