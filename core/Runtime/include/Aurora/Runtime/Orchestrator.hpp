#pragma once

#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Contracts/ImageData.hpp>
#include <Aurora/Input/IInput.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/Smoother.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>
#include <Aurora/Runtime/ZoneMapStore.hpp>

// Ties one IInput to any number of IOutputs per-tick -- the generalized
// replacement for huenicorn's Runtime::_update(). Deliberately has no
// threading/timing of its own (unlike huenicorn's Runtime): a real app
// entry point drives update() at Config::refreshRate(), keeping this class
// synchronous and testable against fakes. See Analysis/RuntimeAnalysis.md.
namespace Aurora::Runtime
{
  class Orchestrator
  {
  public:
    // input/outputs must already be init()'d; Orchestrator doesn't own them.
    Orchestrator(
      Input::IInput& input,
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

    const Config& config() const;

  private:
    void _prepareSource(Contracts::ImageData& source) const;

    Input::IInput& m_input;
    std::vector<Output::IOutput*> m_outputs;
    Config m_config;
    ZoneMapStore m_zoneMapStore;
    std::unordered_map<std::string, ZoneMap> m_zoneMapsByOutput;
    Smoother m_smoother;
    Contracts::ImageData m_frameData;
  };
}
