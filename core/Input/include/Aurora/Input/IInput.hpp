#pragma once

#include <string>
#include <vector>

#include <glm/vec2.hpp>

#include <Aurora/Contracts/ImageData.hpp>

// Stable interface a plugin repo (e.g. Aurora-Input-Linux) implements.
// First-draft generalization of IGrabber -- pending refinement once Input::Linux gets its own analysis pass.
namespace Aurora::Input
{
  class IInput
  {
  public:
    using Resolution = glm::ivec2;
    using RefreshRate = unsigned;

    virtual ~IInput() = default;

    virtual const std::string& name() const = 0;

    virtual void init() = 0;

    virtual Resolution displayResolution() const = 0;
    virtual RefreshRate displayRefreshRate() const = 0;

    // Pull model -- the app calls this once per tick.
    virtual void grabFrameSubsample(Contracts::ImageData& imageData) = 0;
  };
}
