#include <Aurora/Runtime/GraphPreview.hpp>

#include <algorithm>
#include <utility>

namespace Aurora::Runtime
{
  namespace
  {
    constexpr float kCostSmoothing = 0.1f;
  }


  std::shared_ptr<GraphPreview> GraphPreview::create(
    const nlohmann::json& doc,
    const Graph::NodeRegistry& registry,
    const std::unordered_set<std::string>& knownOutputs,
    std::string& errorOut)
  {
    std::shared_ptr<GraphPreview> preview(new GraphPreview());
    if(!preview->m_evaluator.load(doc, registry, knownOutputs, errorOut)){
      return nullptr;
    }
    return preview;
  }


  bool GraphPreview::reload(
    const nlohmann::json& doc,
    const Graph::NodeRegistry& registry,
    const std::unordered_set<std::string>& knownOutputs,
    std::string& errorOut)
  {
    if(!m_evaluator.reload(doc, registry, knownOutputs, errorOut)){
      return false;
    }
    // Outputs the new graph no longer sends to drop out of the published snapshot.
    const Snapshot& fresh = m_evaluator.snapshot();
    std::lock_guard<std::mutex> lock(m_mutex);
    m_snapshot.outputs = fresh.outputs;
    m_snapshot.errors.clear();
    return true;
  }


  void GraphPreview::tick(float dt, Graph::IGraphHost& live)
  {
    const auto start = std::chrono::steady_clock::now();
    m_evaluator.tick(dt, live);

    Snapshot next = m_evaluator.snapshot();
    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
    std::lock_guard<std::mutex> lock(m_mutex);
    next.tickMs = m_snapshot.tickMs == 0.0 ? ms : m_snapshot.tickMs + (ms - m_snapshot.tickMs) * kCostSmoothing;
    m_snapshot = std::move(next);
  }


  GraphPreview::Snapshot GraphPreview::snapshot() const
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_snapshot;
  }
}
