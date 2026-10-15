#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include <Aurora/Contracts/UV.hpp>
#include <Aurora/Input/IAudioInput.hpp>
#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/DevFrameDump.hpp>
#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphHost.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>
#include <Aurora/Runtime/ZoneMapStore.hpp>

// Runs one built-in graph (Video or Audio) against one input and any number
// of outputs (G3, Aurora-ra4o.8). Replaces Orchestrator and AudioOrchestrator.
// No threading or timing of its own: the caller drives tick() and holds the
// lock that guards it (PipelineHost), so zone edits and config swaps never
// interleave with a tick.
namespace Aurora::Runtime
{
  class GraphRunner
  {
  public:
    // input/outputs must already be init()'d; the runner doesn't own them.
    GraphRunner(
      Input::IVideoInput& input,
      std::vector<Output::IOutput*> outputs,
      Config config,
      ZoneMapStore zoneMapStore
    );
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    GraphRunner(
      Input::IAudioInput& input,
      std::vector<Output::IOutput*> outputs,
      Config config,
      ZoneMapStore zoneMapStore
    );
#endif

    // Not movable: the host adapter points back at this object.
    GraphRunner(const GraphRunner&) = delete;
    GraphRunner& operator=(const GraphRunner&) = delete;

    // Video: selects the configured monitor, fills an unset refreshRate and
    // subsampleWidth from the display, hints the capture width. Both kinds:
    // reconciles and persists each output's zone map against its live
    // zoneIds(), then loads the built-in graph. Throws std::runtime_error if
    // the graph fails to load.
    void init();

    // One tick of the graph with nominal dt seconds.
    void tick(float dt);

    // Throws std::out_of_range if outputName wasn't passed to the constructor.
    const ZoneMap& zoneMap(const std::string& outputName) const;

    // Live in-place edit of one zone's fields, persisted immediately. Only
    // the fields present change; everConfigured is set on every call. False
    // (no-op) if outputName isn't live or zoneId isn't in its zone map.
    bool updateZone(
      const std::string& outputName,
      std::uint8_t zoneId,
      const std::optional<Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    );

    // Applies a live-tunable Config change (Aurora-c0g): rebuilds the graph
    // from the new Config and moves node state across by id. Capture-side
    // effects of a subsampleWidth change are the caller's, since they can
    // block. False with errorOut set, running graph untouched, if the new
    // graph fails to load.
    bool setConfig(Config config, std::string& errorOut);

    // Post-derivation for video (refreshRate/subsampleWidth filled in).
    const Config& config() const { return m_config; }

  private:
    // Serves the graph's I/O nodes from this runner's inputs, outputs and
    // live zone maps. Separate type so zoneMap() above stays unambiguous.
    class Host : public Graph::IGraphHost
    {
    public:
      explicit Host(GraphRunner& runner): m_runner(runner) {}

      Input::IVideoInput* videoInput() override { return m_runner.m_videoInput; }
      Input::IAudioInput* audioInput() override { return m_runner.m_audioInput; }
      Output::IOutput* output(std::string_view name) override;
      const ZoneMap* zoneMap(std::string_view outputName) override;

    private:
      GraphRunner& m_runner;
    };

    bool _load(const Config& config, Graph::LoadResult& result) const;

    bool m_isAudio{false};
    Input::IVideoInput* m_videoInput{nullptr};
    Input::IAudioInput* m_audioInput{nullptr};
    std::vector<Output::IOutput*> m_outputs;
    std::vector<std::string> m_outputNames;
    std::unordered_map<std::string, Output::IOutput*> m_outputsByName;
    Config m_config;
    ZoneMapStore m_zoneMapStore;
    std::unordered_map<std::string, ZoneMap> m_zoneMapsByOutput;
    Graph::NodeRegistry m_registry;
    Graph::Graph m_graph;
    bool m_loaded{false};
    Host m_host{*this};

    // Dev-only visualization tap, no-op unless AURORA_DEV_FRAME_DUMP is set.
    DevFrameDump m_devFrameDump;
  };
}
