#pragma once

#include <filesystem>

#include <Aurora/Runtime/Config.hpp>

// Persists Config as <configRoot>/config.json. Missing or partial files
// fall back to ConfigData's defaults per-field, not as an all-or-nothing load.
namespace Aurora::Runtime
{
  class ConfigStore
  {
  public:
    explicit ConfigStore(std::filesystem::path configRoot);

    Config load() const;
    void save(const Config& config) const;

  private:
    std::filesystem::path m_configFilePath;
  };
}
