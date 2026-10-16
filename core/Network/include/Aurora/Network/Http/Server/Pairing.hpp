#pragma once

#include <cstdint>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Network/Http/Server/HttpDataStructs.hpp>

// LAN pairing (Aurora-5ipy.5): loopback is trusted, other callers need a
// per-device token approved once from a trusted UI. Only token hashes are
// stored, in a file beside config (not core/Secrets: no enumerate, and it
// may block on unlock prompts). Plain HTTP, so a LAN sniffer can still see a
// token in flight (docs/planning/ExternalControl.md, Security).
namespace Aurora::Network::Http::Server
{
  const char* scopeName(Scope scope);

  // Unknown names yield nullopt.
  std::optional<Scope> scopeFromName(const std::string& name);

  std::string sha256Hex(const std::string& data);


  struct PairedDevice
  {
    std::string id;
    std::string name;
    Scope scope{Scope::None};
    std::int64_t createdAt{0};
    std::int64_t lastSeen{0};
  };


  struct PendingPairing
  {
    std::string ref;
    std::string name;
    Scope scope{Scope::None};
    std::string code;
  };


  struct PairingTicket
  {
    std::string pollKey;
    std::string code;
  };


  struct PairingPoll
  {
    enum class State
    {
      Pending,
      Approved,
      Unknown // denied, expired, already collected or never issued
    };

    State state{State::Unknown};
    std::string token;
    Scope scope{Scope::None};
  };


  class PairingService
  {
  public:
    using Clock = std::function<std::int64_t()>;

    // Empty storePath keeps devices in memory only.
    explicit PairingService(std::filesystem::path storePath = {}, Clock clock = {});

    // Display code is short and shown on both screens. nullopt when too many
    // requests are already pending.
    std::optional<PairingTicket> requestPairing(const std::string& name, Scope scope);

    std::vector<PendingPairing> pending();

    bool approve(const std::string& ref, std::optional<Scope> grant = std::nullopt);
    bool deny(const std::string& ref);

    // The token is handed out once; later polls report Unknown.
    PairingPoll poll(const std::string& pollKey);

    std::optional<PairedDevice> authenticate(const std::string& token);

    std::vector<PairedDevice> devices();
    bool revoke(const std::string& id);

    // Test-only: skips the approval flow.
    std::string mintForTest(const std::string& name, Scope scope);

  private:
    struct Entry
    {
      std::string ref;
      std::string name;
      Scope scope{Scope::None};
      std::string code;
      std::int64_t createdAt{0};
      bool decided{false};
      bool approved{false};
      std::string token;
    };

    std::string mintLocked(const std::string& name, Scope scope);
    void expireLocked();
    void loadLocked();
    void saveLocked();

    std::mutex m_mutex;
    std::filesystem::path m_storePath;
    Clock m_clock;
    std::unordered_map<std::string, Entry> m_pending; // keyed by pollKey
    std::unordered_map<std::string, PairedDevice> m_devices; // keyed by id
    std::unordered_map<std::string, std::string> m_hashToId;
    std::unordered_map<std::string, std::string> m_idToHash;
  };


  struct AccessRequest
  {
    HttpMethod method{HttpMethod::Get};
    std::string path;
    std::string remoteAddr;
    std::string authorization; // Authorization header, "Bearer <token>"
    std::string cookie; // Cookie header, carries aurora_token
  };


  struct AccessDecision
  {
    enum class Result
    {
      Allow,
      Unauthorized, // 401: no valid token, pair this device
      Forbidden // 403: valid token, scope too low
    };

    Result result{Result::Allow};
    bool local{false};
    Scope scope{Scope::None};
  };


  // Middleware core, free of httplib so it unit-tests directly. Loopback
  // passes as Admin. Otherwise the longest matching rule decides, and a path
  // with no rule is open for GET and Admin for everything else (fail closed).
  class AccessGuard
  {
  public:
    using IsLocal = std::function<bool(const std::string& remoteAddr)>;

    explicit AccessGuard(std::shared_ptr<PairingService> service, IsLocal isLocal = {});

    // Scope::None marks the prefix open to everyone (e.g. the pairing
    // handshake, or an OAuth callback). Matches the path itself or anything
    // under it.
    void addRule(const std::string& pathPrefix, Scope required);

    AccessDecision decide(const AccessRequest& request) const;

    static bool isLoopback(const std::string& remoteAddr);

  private:
    std::shared_ptr<PairingService> m_service;
    IsLocal m_isLocal;
    std::vector<std::pair<std::string, Scope>> m_rules;
  };
}
