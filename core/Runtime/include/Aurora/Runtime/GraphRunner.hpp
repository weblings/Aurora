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
    // Both inputs for a custom graph that mixes video.capture and
    // audio.capture. Video drives config, zones and the built-in fallback.
    GraphRunner(
      Input::IVideoInput& video,
      Input::IAudioInput& audio,
      std::vector<Output::IOutput*> outputs,
      Config config,
      ZoneMapStore zoneMapStore
    );
#endif

    // Not movable: the host adapter points back at this object.
    GraphRunner(const GraphRunner&) = delete;
    GraphRunner& operator=(const GraphRunner&) = delete;

    // A custom graph doc to run instead of the built-in one. Call before
    // init(). If it fails to load, the runner runs the built-in graph and
    // customError() says why.
    void setCustomGraph(nlohmann::json doc);

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

    // Swaps a running custom (or built-in) graph for `doc` in place, moving node
    // state across by id (Aurora-52oz.4). Inputs and outputs are untouched.
    // False with errorOut set, running graph untouched, if `doc` fails to load.
    bool swapCustomGraph(nlohmann::json doc, std::string& errorOut);

    // Puts back the live graph after a test (Aurora-52oz.5): `doc` as the
    // custom graph, or the built-in one when empty. Node state moves across.
    bool restoreGraph(std::optional<nlohmann::json> doc, std::string& errorOut);

    // Applies a live-tunable Config change (Aurora-c0g): rebuilds the graph
    // from the new Config and moves node state across by id. Capture-side
    // effects of a subsampleWidth change are the caller's, since they can
    // block. False with errorOut set, running graph untouched, if the new
    // graph fails to load.
    bool setConfig(Config config, std::string& errorOut);

    // The graph doc the running graph was built from (built-in doc plus the
    // current Config overlay), as GET /api/graph serves it.
    nlohmann::json graphJson() const;

    // True while the custom graph from setCustomGraph() is the one running.
    bool runningCustom() const { return m_runningCustom; }

    // Why the custom graph was not loaded; empty when it was, or none was set.
    const std::string& customError() const { return m_customError; }

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

    // Loads the custom graph if one is set, else (or when it fails, with
    // customError set) the built-in one.
    bool _load(const Config& config, Graph::LoadResult& result, bool& custom, std::string& customError) const;

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
    std::optional<nlohmann::json> m_customDoc;
    bool m_runningCustom{false};
    std::string m_customError;
    Host m_host{*this};

    // Dev-only visualization tap, no-op unless AURORA_DEV_FRAME_DUMP is set.
    DevFrameDump m_devFrameDump;
  };
}
