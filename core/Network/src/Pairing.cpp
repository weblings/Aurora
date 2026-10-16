#include <Aurora/Network/Http/Server/Pairing.hpp>

#include <algorithm>
#include <array>
#include <chrono>
#include <cstdio>
#include <fstream>
#include <random>

#include <nlohmann/json.hpp>


namespace Aurora::Network::Http::Server
{
  namespace
  {
    constexpr std::int64_t kRequestLifetimeSeconds = 300;
    constexpr std::size_t kMaxPending = 8;
    constexpr std::size_t kMaxNameLength = 64;
    constexpr char kCookieName[] = "aurora_token";

    std::int64_t systemNow()
    {
      return std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()
      ).count();
    }


    std::string randomHex(std::size_t byteCount)
    {
      static constexpr char digits[] = "0123456789abcdef";
      std::random_device source;
      std::string out;
      out.reserve(byteCount * 2);
      for(std::size_t i = 0; i < byteCount; ++i){
        auto byte = static_cast<unsigned>(source() & 0xFF);
        out += digits[byte >> 4];
        out += digits[byte & 0xF];
      }
      return out;
    }


    // No ambiguous glyphs (0/O, 1/I), read aloud or compared across screens.
    std::string randomCode()
    {
      static constexpr char alphabet[] = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      std::random_device source;
      std::string code;
      for(int i = 0; i < 5; ++i){
        code += alphabet[source() % (sizeof(alphabet) - 1)];
      }
      return code;
    }


    std::string cleanName(const std::string& raw)
    {
      std::string name;
      for(char c : raw){
        if(static_cast<unsigned char>(c) >= 0x20 && c != 0x7F){
          name += c;
        }
      }
      if(name.size() > kMaxNameLength){
        name.resize(kMaxNameLength);
      }
      return name.empty() ? "Unnamed device" : name;
    }


    std::uint32_t rotr(std::uint32_t value, int bits)
    {
      return (value >> bits) | (value << (32 - bits));
    }
  }


  const char* scopeName(Scope scope)
  {
    switch(scope)
    {
      case Scope::None: return "none";
      case Scope::Read: return "read";
      case Scope::Draft: return "draft";
      case Scope::Apply: return "apply";
      case Scope::Admin: return "admin";
    }
    return "none";
  }


  std::optional<Scope> scopeFromName(const std::string& name)
  {
    for(Scope scope : {Scope::Read, Scope::Draft, Scope::Apply, Scope::Admin}){
      if(name == scopeName(scope)){
        return scope;
      }
    }
    return std::nullopt;
  }


  // FIPS 180-4 SHA-256; the module links no crypto library.
  std::string sha256Hex(const std::string& data)
  {
    static constexpr std::array<std::uint32_t, 64> k = {
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    };

    std::array<std::uint32_t, 8> h = {
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    };

    std::string message = data;
    const std::uint64_t bitLength = static_cast<std::uint64_t>(data.size()) * 8;
    message += static_cast<char>(0x80);
    while(message.size() % 64 != 56){
      message += '\0';
    }
    for(int shift = 56; shift >= 0; shift -= 8){
      message += static_cast<char>((bitLength >> shift) & 0xFF);
    }

    for(std::size_t offset = 0; offset < message.size(); offset += 64){
      std::array<std::uint32_t, 64> w{};
      for(int i = 0; i < 16; ++i){
        const auto* p = reinterpret_cast<const unsigned char*>(message.data() + offset + i * 4);
        w[i] = (std::uint32_t(p[0]) << 24) | (std::uint32_t(p[1]) << 16) | (std::uint32_t(p[2]) << 8) | p[3];
      }
      for(int i = 16; i < 64; ++i){
        std::uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
        std::uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
      }

      auto v = h;
      for(int i = 0; i < 64; ++i){
        std::uint32_t s1 = rotr(v[4], 6) ^ rotr(v[4], 11) ^ rotr(v[4], 25);
        std::uint32_t ch = (v[4] & v[5]) ^ (~v[4] & v[6]);
        std::uint32_t t1 = v[7] + s1 + ch + k[i] + w[i];
        std::uint32_t s0 = rotr(v[0], 2) ^ rotr(v[0], 13) ^ rotr(v[0], 22);
        std::uint32_t maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
        std::uint32_t t2 = s0 + maj;
        v[7] = v[6];
        v[6] = v[5];
        v[5] = v[4];
        v[4] = v[3] + t1;
        v[3] = v[2];
        v[2] = v[1];
        v[1] = v[0];
        v[0] = t1 + t2;
      }
      for(int i = 0; i < 8; ++i){
        h[i] += v[i];
      }
    }

    static constexpr char digits[] = "0123456789abcdef";
    std::string out;
    for(std::uint32_t word : h){
      for(int shift = 28; shift >= 0; shift -= 4){
        out += digits[(word >> shift) & 0xF];
      }
    }
    return out;
  }


  PairingService::PairingService(std::filesystem::path storePath, Clock clock):
  m_storePath(std::move(storePath)),
  m_clock(clock ? std::move(clock) : Clock(systemNow))
  {
    std::lock_guard lock(m_mutex);
    loadLocked();
  }


  void PairingService::loadLocked()
  {
    if(m_storePath.empty()){
      return;
    }
    std::ifstream file(m_storePath);
    if(!file){
      return;
    }
    // A corrupt store reads as no devices (fail closed), never as open.
    auto doc = nlohmann::json::parse(file, nullptr, false);
    if(!doc.is_object() || !doc.contains("devices") || !doc["devices"].is_array()){
      return;
    }
    for(const auto& item : doc["devices"]){
      if(!item.is_object()){
        continue;
      }
      auto scope = scopeFromName(item.value("scope", ""));
      std::string id = item.value("id", "");
      std::string hash = item.value("hash", "");
      if(!scope || id.empty() || hash.empty()){
        continue;
      }
      PairedDevice device;
      device.id = id;
      device.name = item.value("name", "");
      device.scope = *scope;
      device.createdAt = item.value("createdAt", std::int64_t{0});
      device.lastSeen = item.value("lastSeen", std::int64_t{0});
      m_devices[id] = device;
      m_hashToId[hash] = id;
      m_idToHash[id] = hash;
    }
  }


  bool PairingService::saveLocked()
  {
    if(m_storePath.empty()){
      return true;
    }
    nlohmann::json devices = nlohmann::json::array();
    for(const auto& [id, device] : m_devices){
      devices.push_back({
        {"id", id},
        {"name", device.name},
        {"scope", scopeName(device.scope)},
        {"hash", m_idToHash[id]},
        {"createdAt", device.createdAt},
        {"lastSeen", device.lastSeen}
      });
    }
    nlohmann::json doc = {{"version", 1}, {"devices", devices}};

    // Write-then-rename so a crash never leaves half a store.
    std::filesystem::path temp = m_storePath;
    temp += ".tmp";
    std::error_code ec;
    if(m_storePath.has_parent_path()){
      std::filesystem::create_directories(m_storePath.parent_path(), ec);
    }
    {
      std::ofstream out(temp, std::ios::trunc);
      out << doc.dump(2);
      if(!out){
        return false;
      }
    }
    std::filesystem::rename(temp, m_storePath, ec);
    if(ec){
      std::filesystem::remove(m_storePath, ec);
      std::filesystem::rename(temp, m_storePath, ec);
    }
    return !ec;
  }


  void PairingService::expireLocked()
  {
    const std::int64_t now = m_clock();
    for(auto it = m_pending.begin(); it != m_pending.end();){
      if(now - it->second.createdAt > kRequestLifetimeSeconds){
        it = m_pending.erase(it);
      }
      else{
        ++it;
      }
    }
  }


  std::string PairingService::mintLocked(const std::string& name, Scope scope)
  {
    std::string token = "aur_" + randomHex(32);
    std::string hash = sha256Hex(token);

    PairedDevice device;
    device.id = randomHex(8);
    device.name = cleanName(name);
    device.scope = scope;
    device.createdAt = m_clock();
    device.lastSeen = device.createdAt;

    m_devices[device.id] = device;
    m_hashToId[hash] = device.id;
    m_idToHash[device.id] = hash;
    saveLocked();
    return token;
  }


  std::optional<PairingTicket> PairingService::requestPairing(const std::string& name, Scope scope)
  {
    std::lock_guard lock(m_mutex);
    expireLocked();
    if(m_pending.size() >= kMaxPending || scope == Scope::None){
      return std::nullopt;
    }

    Entry entry;
    entry.ref = randomHex(4);
    entry.name = cleanName(name);
    entry.scope = scope;
    entry.code = randomCode();
    entry.createdAt = m_clock();

    PairingTicket ticket{randomHex(16), entry.code};
    m_pending[ticket.pollKey] = std::move(entry);
    return ticket;
  }


  std::vector<PendingPairing> PairingService::pending()
  {
    std::lock_guard lock(m_mutex);
    expireLocked();
    std::vector<PendingPairing> out;
    for(const auto& [key, entry] : m_pending){
      if(!entry.decided){
        out.push_back({entry.ref, entry.name, entry.scope, entry.code});
      }
    }
    std::sort(out.begin(), out.end(), [](const auto& a, const auto& b){ return a.ref < b.ref; });
    return out;
  }


  bool PairingService::approve(const std::string& ref, std::optional<Scope> grant)
  {
    std::lock_guard lock(m_mutex);
    expireLocked();
    for(auto& [key, entry] : m_pending){
      if(entry.ref == ref && !entry.decided){
        Scope scope = grant.value_or(entry.scope);
        if(scope == Scope::None){
          return false;
        }
        entry.scope = scope;
        entry.token = mintLocked(entry.name, scope);
        entry.decided = true;
        entry.approved = true;
        return true;
      }
    }
    return false;
  }


  bool PairingService::deny(const std::string& ref)
  {
    std::lock_guard lock(m_mutex);
    expireLocked();
    for(auto it = m_pending.begin(); it != m_pending.end(); ++it){
      if(it->second.ref == ref && !it->second.decided){
        m_pending.erase(it);
        return true;
      }
    }
    return false;
  }


  PairingPoll PairingService::poll(const std::string& pollKey)
  {
    std::lock_guard lock(m_mutex);
    expireLocked();
    PairingPoll result;
    auto it = m_pending.find(pollKey);
    if(it == m_pending.end()){
      return result;
    }
    if(!it->second.decided){
      result.state = PairingPoll::State::Pending;
      return result;
    }
    result.state = PairingPoll::State::Approved;
    result.token = std::move(it->second.token);
    result.scope = it->second.scope;
    m_pending.erase(it);
    return result;
  }


  std::optional<PairedDevice> PairingService::authenticate(const std::string& token)
  {
    if(token.empty()){
      return std::nullopt;
    }
    std::string hash = sha256Hex(token);
    std::lock_guard lock(m_mutex);
    auto hashIt = m_hashToId.find(hash);
    if(hashIt == m_hashToId.end()){
      return std::nullopt;
    }
    PairedDevice& device = m_devices[hashIt->second];
    device.lastSeen = m_clock(); // in memory only, saved with the next change
    return device;
  }


  std::vector<PairedDevice> PairingService::devices()
  {
    std::lock_guard lock(m_mutex);
    std::vector<PairedDevice> out;
    for(const auto& [id, device] : m_devices){
      out.push_back(device);
    }
    std::sort(out.begin(), out.end(), [](const auto& a, const auto& b){
      return a.createdAt != b.createdAt ? a.createdAt < b.createdAt : a.id < b.id;
    });
    return out;
  }


  PairingService::RevokeResult PairingService::revoke(const std::string& id)
  {
    std::lock_guard lock(m_mutex);
    auto it = m_devices.find(id);
    if(it == m_devices.end()){
      return RevokeResult::NotFound;
    }
    m_hashToId.erase(m_idToHash[id]);
    m_idToHash.erase(id);
    m_devices.erase(it);
    return saveLocked() ? RevokeResult::Revoked : RevokeResult::NotPersisted;
  }


  std::string PairingService::mintForTest(const std::string& name, Scope scope)
  {
    std::lock_guard lock(m_mutex);
    return mintLocked(name, scope);
  }


  AccessGuard::AccessGuard(std::shared_ptr<PairingService> service, IsLocal isLocal):
  m_service(std::move(service)),
  m_isLocal(isLocal ? std::move(isLocal) : IsLocal(&AccessGuard::isLoopback))
  {
  }


  bool AccessGuard::isLoopback(const std::string& remoteAddr)
  {
    return remoteAddr == "::1"
      || remoteAddr.rfind("127.", 0) == 0
      || remoteAddr.rfind("::ffff:127.", 0) == 0;
  }


  void AccessGuard::addRule(const std::string& pathPrefix, Scope required)
  {
    m_rules.emplace_back(pathPrefix, required);
  }


  namespace
  {
    bool underPrefix(const std::string& path, const std::string& prefix)
    {
      if(path.compare(0, prefix.size(), prefix) != 0){
        return false;
      }
      return path.size() == prefix.size() || prefix.back() == '/' || path[prefix.size()] == '/';
    }


    std::string bearerOrCookieToken(const AccessRequest& request)
    {
      const std::string bearer = "Bearer ";
      if(request.authorization.compare(0, bearer.size(), bearer) == 0){
        return request.authorization.substr(bearer.size());
      }

      const std::string key = std::string(kCookieName) + "=";
      std::size_t pos = 0;
      while(pos < request.cookie.size()){
        while(pos < request.cookie.size() && (request.cookie[pos] == ' ' || request.cookie[pos] == ';')){
          ++pos;
        }
        std::size_t end = request.cookie.find(';', pos);
        if(end == std::string::npos){
          end = request.cookie.size();
        }
        if(request.cookie.compare(pos, key.size(), key) == 0){
          return request.cookie.substr(pos + key.size(), end - pos - key.size());
        }
        pos = end;
      }
      return "";
    }
  }


  AccessDecision AccessGuard::decide(const AccessRequest& request) const
  {
    AccessDecision decision;
    if(m_isLocal(request.remoteAddr)){
      decision.local = true;
      decision.scope = Scope::Admin;
      return decision;
    }

    // Longest matching prefix wins; no rule means GET open, anything else Admin.
    Scope required = request.method == HttpMethod::Get ? Scope::None : Scope::Admin;
    std::size_t best = 0;
    bool matched = false;
    for(const auto& [prefix, scope] : m_rules){
      if(underPrefix(request.path, prefix) && (!matched || prefix.size() > best)){
        required = scope;
        best = prefix.size();
        matched = true;
      }
    }

    auto device = m_service ? m_service->authenticate(bearerOrCookieToken(request)) : std::nullopt;
    if(device){
      decision.scope = device->scope;
    }
    if(required == Scope::None || decision.scope >= required){
      return decision;
    }
    decision.result = device ? AccessDecision::Result::Forbidden : AccessDecision::Result::Unauthorized;
    return decision;
  }
}
