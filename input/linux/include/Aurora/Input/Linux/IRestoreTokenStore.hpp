#pragma once

#include <optional>
#include <string>

// Stands in for Core::Config's restore-token get/set until Aurora core has a
// real Config/Runtime -- a Config-backed store can implement this later
// without PipewireGrabber/XdgDesktopPortal changing at all.
namespace Aurora::Input::Linux
{
  class IRestoreTokenStore
  {
  public:
    virtual ~IRestoreTokenStore() = default;
    virtual std::optional<std::string> restoreToken() const = 0;
    virtual void setRestoreToken(const std::string& token) = 0;
  };

  // No persistence -- always prompts. Default until a real store exists.
  class NullRestoreTokenStore : public IRestoreTokenStore
  {
  public:
    std::optional<std::string> restoreToken() const override { return std::nullopt; }
    void setRestoreToken(const std::string&) override {}
  };
}
