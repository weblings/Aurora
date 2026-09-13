#pragma once

#include <memory>
#include <string>
#include <vector>

// Ported as-is from huenicorn's MonitorData -- Input-side vocabulary, not a
// Contracts type, since Processing/Output never touch monitor identity.
namespace Aurora::Input
{
  struct MonitorData
  {
    MonitorData(
      const std::string& name,
      unsigned width,
      unsigned height,
      double refreshRate,
      bool isPrimary
    ):
    name(name),
    width(width),
    height(height),
    refreshRate(refreshRate),
    isPrimary(isPrimary)
    {}

    virtual ~MonitorData() = default;

    std::string name{""};
    unsigned width{0};
    unsigned height{0};
    double refreshRate{0};
    bool isPrimary{false};
  };

  using UniqueMonitor = std::shared_ptr<MonitorData>;
  using Monitors = std::vector<UniqueMonitor>;
}
