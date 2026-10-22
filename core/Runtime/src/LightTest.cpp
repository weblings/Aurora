#include <Aurora/Runtime/LightTest.hpp>

#include <algorithm>
#include <chrono>

namespace Aurora::Runtime
{
  LightTest::LightTest(LightTestHooks hooks, LightTestOptions options, Clock clock):
  m_hooks(std::move(hooks)),
  m_options(options),
  m_clock(std::move(clock))
  {
    if(!m_clock){
      m_clock = []{
        return std::chrono::duration_cast<std::chrono::milliseconds>(
          std::chrono::steady_clock::now().time_since_epoch()).count();
      };
    }
  }


  LightTest::~LightTest()
  {
    {
      std::lock_guard<std::mutex> lock(m_wakeMutex);
      m_stop = true;
    }
    m_wake.notify_all();
    if(m_watchdog.joinable()){
      m_watchdog.join();
    }
  }


  void LightTest::_endLocked(const char* reason)
  {
    m_active = false;
    m_session.clear();
    m_doc = nullptr;
    m_lastEnd = reason;
  }


  void LightTest::_expireLocked()
  {
    if(!m_active){
      return;
    }
    if(m_hooks.generation() != m_generation){
      _endLocked("pipeline_gone");
      return;
    }
    const std::int64_t now = m_clock();
    const char* reason = nullptr;
    if(now - m_startedAt >= m_options.confirmMs){
      reason = "confirm_timeout";
    }
    else if(now - m_lastBeat >= m_options.lapseMs){
      reason = "heartbeat_lost";
    }
    if(reason){
      m_hooks.revert();
      _endLocked(reason);
    }
  }


  std::string LightTest::start(const std::string& session, const nlohmann::json& doc)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    _expireLocked();
    std::string error = m_hooks.start(doc);
    if(!error.empty()){
      return error;
    }
    // After the start: an input-only rebuild moves the generation, and the
    // pipeline it built is the one this test must revert (Aurora-4xqt.1).
    const std::uint64_t generation = m_hooks.generation();
    const std::int64_t now = m_clock();
    m_active = true;
    m_session = session;
    m_doc = doc;
    m_startedAt = now;
    m_lastBeat = now;
    m_generation = generation;
    return {};
  }


  bool LightTest::heartbeat(const std::string& session)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    _expireLocked();
    if(!m_active || m_session != session){
      return false;
    }
    m_lastBeat = m_clock();
    return true;
  }


  bool LightTest::revert(const std::string& session, std::string& error)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    _expireLocked();
    if(!m_active || m_session != session){
      return false;
    }
    error = m_hooks.revert();
    _endLocked("reverted");
    return true;
  }


  bool LightTest::confirm(const std::string& session)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    _expireLocked();
    if(!m_active || m_session != session){
      return false;
    }
    _endLocked("confirmed");
    return true;
  }


  std::optional<nlohmann::json> LightTest::testedGraph(const std::string& session)
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    _expireLocked();
    if(!m_active || m_session != session){
      return std::nullopt;
    }
    return m_doc;
  }


  LightTest::Info LightTest::info()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    _expireLocked();
    Info info;
    info.lastEnd = m_lastEnd;
    if(m_active){
      const std::int64_t now = m_clock();
      info.active = true;
      info.confirmRemainingMs = std::max<std::int64_t>(0, m_options.confirmMs - (now - m_startedAt));
      info.lapseRemainingMs = std::max<std::int64_t>(0, m_options.lapseMs - (now - m_lastBeat));
    }
    return info;
  }


  void LightTest::poll()
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    _expireLocked();
  }


  void LightTest::startWatchdog(std::int64_t intervalMs)
  {
    m_watchdog = std::thread([this, intervalMs]{
      std::unique_lock<std::mutex> lock(m_wakeMutex);
      while(!m_stop){
        m_wake.wait_for(lock, std::chrono::milliseconds(intervalMs), [this]{ return m_stop; });
        if(m_stop){
          break;
        }
        lock.unlock();
        poll();
        lock.lock();
      }
    });
  }
}
