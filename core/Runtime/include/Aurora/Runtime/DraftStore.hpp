#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>

#include <nlohmann/json.hpp>

// Per-session graph drafts (Aurora-52oz.3), held in memory only. One draft per
// client session id, so an agent and the editor never overwrite each other.
// A draft is whatever JSON the client sent: it is stored even when invalid.
namespace Aurora::Runtime
{
  struct DraftLimits
  {
    std::size_t maxDrafts = 16;
    std::size_t maxBytes = 256 * 1024; // serialized size of one draft
    std::int64_t idleSeconds = 3600;   // untouched drafts older than this go
  };


  class DraftStore
  {
  public:
    using Clock = std::function<std::int64_t()>; // seconds

    explicit DraftStore(DraftLimits limits = {}, Clock clock = {});

    // [A-Za-z0-9_-]{1,64}.
    static bool validSession(const std::string& session);

    enum class PutResult { Saved, InvalidSession, TooLarge, TooMany };

    // Replaces the session's draft. A new session is refused (TooMany) while
    // the store is full after idle drafts were evicted.
    PutResult put(const std::string& session, const nlohmann::json& doc);

    // Reading counts as use, so a draft being polled never goes idle.
    std::optional<nlohmann::json> get(const std::string& session);

    // False when the session had no draft.
    bool remove(const std::string& session);

    std::size_t size();

    const DraftLimits& limits() const { return m_limits; }

  private:
    struct Entry
    {
      nlohmann::json doc;
      std::int64_t lastUsed{0};
    };

    void evictIdleLocked(std::int64_t now);

    std::mutex m_mutex;
    DraftLimits m_limits;
    Clock m_clock;
    std::unordered_map<std::string, Entry> m_drafts;
  };
}
