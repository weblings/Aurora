#pragma once

#include <algorithm>
#include <optional>
#include <string>
#include <vector>

#include <glm/vec2.hpp>

#include <Aurora/Contracts/ImageData.hpp>
#include <Aurora/Input/MonitorData.hpp>

// Stable interface a plugin repo (e.g. Aurora-Input-Linux) implements.
// Generalized from IGrabber -- see docs/LinuxCaptureAnalysis.md for the port notes.
// Renamed from IInput (see docs/AudioAnalysis.md) once IAudioInput arrived --
// this contract turned out to be entirely screen/resolution-shaped, not generic.
namespace Aurora::Input
{
  class IVideoInput
  {
  protected:
    struct MonitorSelectionData
    {
      Monitors monitors;
      std::optional<unsigned> selectedMonitorId;

      MonitorData* selectedMonitor() const
      {
        if(!selectedMonitorId.has_value() || selectedMonitorId.value() >= monitors.size()){
          return nullptr;
        }

        return monitors.at(selectedMonitorId.value()).get();
      }
    };

  public:
    using Divisors = std::vector<int>;
    using Resolution = glm::ivec2;
    using Resolutions = std::vector<Resolution>;
    using RefreshRate = unsigned;

    virtual ~IVideoInput() = default;

    void init()
    {
      _initMonitorsList();
    }

    virtual const std::string& name() const = 0;

    virtual bool hasCustomScreenManagement() const
    {
      return false;
    }

    // Default true, so Linux/Windows (which have nothing analogous to
    // macOS's screen-lock capture teardown -- Aurora-8mk.9) are unaffected
    // by this existing at all. A grabber that can genuinely lose its
    // capture source out from under it (and detect that, rather than just
    // silently serving a stale frame forever) overrides this to reflect
    // real state; Orchestrator::update() skips a tick while unhealthy
    // rather than pushing a frozen frame to outputs.
    virtual bool isHealthy() const
    {
      return true;
    }

    virtual Resolution displayResolution() const = 0;
    virtual RefreshRate displayRefreshRate() const = 0;

    virtual void selectMonitor(unsigned /*monitorId*/)
    {
      if(hasCustomScreenManagement()){
        throw std::runtime_error("Missing '_initMonitorsList' override for " + name());
      }
    }

    // Pull model -- the app calls this once per tick.
    virtual void grabFrameSubsample(Contracts::ImageData& imageData) = 0;

    inline Monitors monitors() const
    {
      return m_monitorSelectionData.monitors;
    }

    // Fixed a completeness bug in the port -- see LinuxCaptureAnalysis.md: the
    // original excluded number/2 itself even when it was a valid divisor.
    Resolutions subsampleResolutionCandidates() const
    {
      auto resolution = displayResolution();
      auto widthDivisors = _divisors(resolution.x);
      auto heightDivisors = _divisors(resolution.y);
      auto validDivisors = _selectValidDivisors(widthDivisors, heightDivisors);

      Resolutions candidates;
      for(const auto& divisor : validDivisors){
        int width = resolution.x / divisor;
        int height = (resolution.y * width) / resolution.x;
        candidates.emplace_back(width, height);
      }

      return candidates;
    }

  protected:
    virtual void _initMonitorsList()
    {
      if(hasCustomScreenManagement()){
        throw std::runtime_error("Missing '_initMonitorsList' override for " + name());
      }
    }

    inline static Divisors _divisors(int number)
    {
      Divisors divisors;
      for(int i = 1; i <= number / 2; i++){
        if(number % i == 0){
          divisors.push_back(i);
        }
      }

      divisors.push_back(number);

      return divisors;
    }

    inline static Divisors _selectValidDivisors(
      const Divisors& widthDivisors,
      const Divisors& heightDivisors
    )
    {
      Divisors validDivisors(std::max(widthDivisors.size(), heightDivisors.size()));
      auto validDivisorsIt = std::set_intersection(
        widthDivisors.begin(), widthDivisors.end(),
        heightDivisors.begin(), heightDivisors.end(),
        validDivisors.begin()
      );

      validDivisors.resize(validDivisorsIt - validDivisors.begin());

      return validDivisors;
    }

    MonitorSelectionData m_monitorSelectionData;
  };
}
