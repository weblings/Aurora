#pragma once

#include <condition_variable>
#include <cstdint>
#include <functional>
#include <map>
#include <mutex>
#include <string>

namespace Aurora::Runtime
{
  // One reload in flight, at most one queued behind it. Every run loads
  // config from disk when it starts, so a queued run covers all writes
  // that landed before it (newest wins) and its waiters share its result.
  class ReloadCoalescer
  {
  public:
    explicit ReloadCoalescer(std::function<std::string()> reload)
      : m_reload(std::move(reload))
    {}

    std::string submit()
    {
      std::unique_lock<std::mutex> lock(m_mutex);
      const std::uint64_t target = m_started + 1;
      while(m_completed < target){
        if(!m_running && m_started + 1 == target){
          m_started = target;
          m_running = true;
          lock.unlock();
          std::string error = m_reload();
          lock.lock();
          m_results[target] = std::move(error);
          m_results.erase(m_results.begin(), m_results.lower_bound(target > kKeep ? target - kKeep : 0));
          m_completed = target;
          m_running = false;
          m_cv.notify_all();
        }
        else{
          m_cv.wait(lock);
        }
      }
      return m_results[target];
    }

  private:
    static constexpr std::uint64_t kKeep = 64;

    std::function<std::string()> m_reload;
    std::mutex m_mutex;
    std::condition_variable m_cv;
    std::map<std::uint64_t, std::string> m_results;
    std::uint64_t m_started{0};
    std::uint64_t m_completed{0};
    bool m_running{false};
  };
}
