#pragma once

#include <filesystem>
#include <functional>
#include <string>
#include <vector>

#include <Aurora/Runtime/Config.hpp>

// Persists Config as <configRoot>/config.json. Missing or partial files
// fall back to ConfigData's defaults per-field, not as an all-or-nothing load.
//
// Every file access goes through one process-wide mutex, so a load never sees
// a save half-written (which would parse as discarded and read back as
// defaults) and update() is an atomic read-modify-write. Anything that changes
// part of the config should use update(), not load() + save(): the latter
// loses whatever another writer saved in between (Aurora-d6i7). This is a
// leaf lock -- nothing is called while holding it except `mutate`, which must
// not call back into a ConfigStore.
namespace Aurora::Runtime
{
  class ConfigStore
  {
  public:
    explicit ConfigStore(std::filesystem::path configRoot);

    Config load() const;
    void save(const Config& config) const;

    // Loads, runs `mutate` on the result, and saves iff it returns true, all
    // under the lock. Returns the Config as it stands afterwards. If `mutate`
    // throws, nothing is saved and the exception propagates.
    Config update(const std::function<bool(Config&)>& mutate) const;

  private:
    Config _loadLocked() const;
    void _saveLocked(const Config& config) const;

    std::filesystem::path m_configFilePath;
  };


  // The persisted field names, i.e. every key config.json carries. Anything
  // that must say something about every field (ConfigApply's classification)
  // is tested against this list, so a new field cannot be added unclassified.
  std::vector<std::string> configKeys();

  // Keys whose persisted value differs between a and b -- compared the way
  // config.json stores them, so two Configs that save identically are equal.
  std::vector<std::string> changedConfigKeys(const Config& a, const Config& b);
}
