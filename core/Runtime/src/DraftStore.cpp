#include <Aurora/Runtime/DraftStore.hpp>

#include <chrono>

namespace Aurora::Runtime
{
  namespace
  {
    std::int64_t _steadySeconds()
    {
      return std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
    }
  }


  DraftStore::DraftStore(DraftLimits limits, Clock clock):
  m_limits(limits),
  m_clock(clock ? std::move(clock) : Clock(_steadySeconds))
  {}


  bool DraftStore::validSession(const std::string& session)
  {
    if(session.empty() || session.size() > 64){
      return false;
    }
    for(const char c : session){
      const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
        c == '_' || c == '-';
      if(!ok){
        return false;
      }
    }
    return true;
  }


  DraftStore::PutResult DraftStore::put(const std::string& session, const nlohmann::json& doc)
  {
    if(!validSession(session)){
      return PutResult::InvalidSession;
    }
    if(doc.dump().size() > m_limits.maxBytes){
      return PutResult::TooLarge;
    }

    std::lock_guard<std::mutex> lock(m_mutex);
    const std::int64_t now = m_clock();
    evictIdleLocked(now);
    auto it = m_drafts.find(session);
    if(it == m_drafts.end() && m_drafts.size() >= m_limits.maxDrafts){
      return PutResult::TooMany;
    }
    m_drafts[session] = Entry{doc, now};
    return PutResult::Saved;
  }


  std::optional<nlohmann::json> DraftStore::get(const std::string& session)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    const std::int64_t now = m_clock();
    evictIdleLocked(now);
    auto it = m_drafts.find(session);
    if(it == m_drafts.end()){
      return std::nullopt;
    }
    it->second.lastUsed = now;
    return it->second.doc;
  }


  bool DraftStore::remove(const std::string& session)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    evictIdleLocked(m_clock());
    return m_drafts.erase(session) > 0;
  }


  std::size_t DraftStore::size()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    evictIdleLocked(m_clock());
    return m_drafts.size();
  }


  void DraftStore::evictIdleLocked(std::int64_t now)
  {
    for(auto it = m_drafts.begin(); it != m_drafts.end();){
      if(now - it->second.lastUsed > m_limits.idleSeconds){
        it = m_drafts.erase(it);
      }
      else{
        ++it;
      }
    }
  }
}
