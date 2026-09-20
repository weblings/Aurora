#pragma once

#include <filesystem>
#include <string>

// Persists the one Hue bridge pairing this daemon knows about, at
// <configRoot>/hue-credentials.json -- deliberately not part of
// Aurora::Runtime::Config (see that class's own header comment:
// output-specific state like bridge credentials belongs in each plugin's
// own scope, never in core) and not part of ZoneMapStore's profiles/
// either (that's zone/UV data, this is auth/connection -- a different
// concern with a different lifecycle).
namespace Aurora::Output::Hue
{
  struct HueConnection
  {
    std::string bridgeAddress;
    std::string username;
    std::string clientkey;

    // Empty means unset -- HueOutput's own default (first available).
    std::string entertainmentConfigurationId;

    bool isConfigured() const
    {
      return !bridgeAddress.empty() && !username.empty() && !clientkey.empty();
    }
  };


  class CredentialsStore
  {
  public:
    explicit CredentialsStore(std::filesystem::path configRoot);

    // Default-constructed (isConfigured() == false) if no file exists yet
    // or it doesn't parse.
    HueConnection load() const;
    void save(const HueConnection& connection) const;

  private:
    std::filesystem::path m_path;
  };
}
