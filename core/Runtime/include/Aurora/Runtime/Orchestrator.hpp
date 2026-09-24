#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Contracts/ImageData.hpp>
#include <Aurora/Contracts/UV.hpp>
#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/DevFrameDump.hpp>
#include <Aurora/Runtime/Smoother.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>
#include <Aurora/Runtime/ZoneMapStore.hpp>

// Ties one IVideoInput to any number of IOutputs per-tick -- the generalized
// replacement for huenicorn's Runtime::_update(). Deliberately has no
// threading/timing of its own (unlike huenicorn's Runtime): a real app
// entry point drives update() at Config::refreshRate(), keeping this class
// synchronous and testable against fakes. See docs/RuntimeAnalysis.md.
namespace Aurora::Runtime
{
  class Orchestrator
  {
  public:
    // input/outputs must already be init()'d; Orchestrator doesn't own them.
    Orchestrator(
      Input::IVideoInput& input,
      std::vector<Output::IOutput*> outputs,
      Config config,
      ZoneMapStore zoneMapStore
    );

    // Fills in an unset refreshRate/subsampleWidth from the display, and
    // reconciles + persists each output's zone map against its live zoneIds().
    void init();

    // One tick: grab -> prepare -> per-output crop/color -> smooth -> send.
    // No-ops if the input hasn't produced a frame yet (async grabbers can lag).
    void update();

    // Throws std::out_of_range if outputName wasn't passed to the constructor.
    const ZoneMap& zoneMap(const std::string& outputName) const;

    // Live in-place edit of one zone's fields for one output -- unlike a
    // Config-driven settings change, this needs no pipeline reconstruction:
    // it mutates the same in-memory map update() already reads every tick,
    // under whatever external lock the caller already holds around update()
    // (see PipelineHost in each app's main.cpp). Only the fields present
    // (non-nullopt) are changed, matching SettingsRoutes' own PATCH
    // semantics; everConfigured is the one exception, set true on every call
    // regardless of which fields were passed, since a call happening at all
    // is what it records. Persists immediately via the same ZoneMapStore used at
    // init(), matching huenicorn's save-on-every-setter feel. Returns false
    // (no-op) if outputName isn't live or zoneId isn't in its zone map.
    bool updateZone(
      const std::string& outputName,
      std::uint8_t zoneId,
      const std::optional<Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    );

    const Config& config() const;

  private:
    void _prepareSource(Contracts::ImageData& source) const;

    Input::IVideoInput& m_input;
    std::vector<Output::IOutput*> m_outputs;
    Config m_config;
    ZoneMapStore m_zoneMapStore;
    std::unordered_map<std::string, ZoneMap> m_zoneMapsByOutput;
    Smoother m_smoother;
    Contracts::ImageData m_frameData;

    // Dev-only visualization tap -- no-op unless AURORA_DEV_FRAME_DUMP is set.
    DevFrameDump m_devFrameDump;
  };
}
