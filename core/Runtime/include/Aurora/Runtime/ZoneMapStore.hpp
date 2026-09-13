#pragma once

#include <filesystem>
#include <string>

#include <Aurora/Runtime/ZoneMap.hpp>

// Persists one zone map per output plugin: <configRoot>/profiles/<pluginName>.json.
// One file per plugin (not one shared profile) so unrelated outputs' zone
// maps never collide or overwrite each other.
namespace Aurora::Runtime
{
  class ZoneMapStore
  {
  public:
    explicit ZoneMapStore(std::filesystem::path configRoot);

    // Empty if the named plugin has no saved zone map yet.
    ZoneMap load(const std::string& pluginName) const;
    void save(const std::string& pluginName, const ZoneMap& zoneMap) const;

  private:
    std::filesystem::path _profilePath(const std::string& pluginName) const;

    std::filesystem::path m_profilesDir;
  };
}
