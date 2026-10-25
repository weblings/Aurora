#pragma once

#include <filesystem>
#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

// Custom effects (Aurora-52oz.1): each graph is <configRoot>/effects/<id>.json
// beside config.json, in the graph.json format. The two built-ins live in the
// binary and have the fixed ids below; a custom id can never collide with
// them because ids cannot contain '.'.
namespace Aurora::Runtime
{
  constexpr const char* kBuiltInVideoEffectId = "builtin.video";
  constexpr const char* kBuiltInAudioEffectId = "builtin.audio";

  bool isBuiltInEffectId(const std::string& id);

  // What the effect picker shows (Aurora-mfud). title falls back to the id;
  // description is empty when the graph sets none.
  struct EffectInfo
  {
    std::string title;
    std::string description;
  };

  // Built-ins have fixed text. A custom effect reads its graph's top-level
  // title and description; an unreadable file or a missing field falls back.
  EffectInfo effectInfo(const std::filesystem::path& configRoot, const std::string& id);

  class EffectStore
  {
  public:
    explicit EffectStore(const std::filesystem::path& configRoot);

    // [a-z0-9][a-z0-9_-]{0,63}. Checked before any id touches a path.
    static bool validId(const std::string& id);

    // Sorted ids of the files present; a file with a bad name is ignored.
    std::vector<std::string> list() const;

    bool exists(const std::string& id) const;

    // The parsed file, or nullopt with errorOut set (invalid id, missing or
    // unparseable file).
    std::optional<nlohmann::json> read(const std::string& id, std::string& errorOut) const;

    // Writes through a temp file and rename, so a crash never leaves half a
    // graph. False with errorOut set on an invalid id or a failed write.
    bool write(const std::string& id, const nlohmann::json& doc, std::string& errorOut) const;

    // False when no such file.
    bool remove(const std::string& id) const;

  private:
    std::filesystem::path m_dir;
  };
}
