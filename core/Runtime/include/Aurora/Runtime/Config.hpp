#pragma once

#include <string>
#include <vector>

#include <Aurora/Contracts/Interpolation.hpp>

// Generic app-level settings only -- output-specific state (bridge
// credentials, zone maps) lives in each plugin's own scope, never here.
// See Analysis/RuntimeAnalysis.md.
namespace Aurora::Runtime
{
  struct ConfigData
  {
    unsigned restServerPort{8215};
    std::string boundBackendIP{"0.0.0.0"};
    unsigned refreshRate{0};      // 0 == unset, derive from the display
    unsigned subsampleWidth{0};   // 0 == unset, derive from the display
    Contracts::Interpolation::Type interpolation{Contracts::Interpolation::Type::Area};
    float transitionSmoothing{0.f};

    // Which of an app's compiled-in plugins are active, by name -- looked
    // up in that app's own registry, not known to Aurora core at all.
    // Empty means unconfigured. See Analysis/DistributedArchitecturePlan.md.
    std::string activeInputName;
    std::vector<std::string> activeOutputNames;

    // A name (Input::MonitorData::name), not an index -- stable across
    // replug/reorder. Empty means auto (whatever IVideoInput selects by
    // default, usually primary). See Runtime/MonitorSelector.hpp.
    std::string activeMonitorName;
  };


  class Config
  {
  public:
    explicit Config(ConfigData data = {});

    const ConfigData& data() const;

    unsigned restServerPort() const;
    void setRestServerPort(unsigned port);

    const std::string& boundBackendIP() const;
    void setBoundBackendIP(std::string ip);

    unsigned refreshRate() const;
    void setRefreshRate(unsigned refreshRate); // clamped to >= 1

    unsigned subsampleWidth() const;
    void setSubsampleWidth(unsigned subsampleWidth);

    Contracts::Interpolation::Type interpolation() const;
    void setInterpolation(Contracts::Interpolation::Type interpolation);

    float transitionSmoothing() const;
    void setTransitionSmoothing(float transitionSmoothing); // clamped to [0, 0.97]

    const std::string& activeInputName() const;
    void setActiveInputName(std::string name);

    const std::vector<std::string>& activeOutputNames() const;
    void setActiveOutputNames(std::vector<std::string> names);

    const std::string& activeMonitorName() const;
    void setActiveMonitorName(std::string name);

  private:
    ConfigData m_data;
  };
}
