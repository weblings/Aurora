#pragma once

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <mutex>

// A revision counter with a wake-up. Writers bump() it after a change lands,
// readers wait for the revision to move past the one they last saw. Its mutex
// is a leaf (nothing is called while held), so bumping under any other lock
// is safe and never blocks on a reader.
namespace Aurora::Runtime
{
  class ChangeSignal
  {
  public:
    void bump()
    {
      {
        std::lock_guard<std::mutex> lock(m_mutex);
        ++m_revision;
      }
      m_cv.notify_all();
    }

    std::uint64_t revision() const
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      return m_revision;
    }

    // Returns the current revision once it differs from `seen`, or after
    // `timeout`, whichever comes first.
    std::uint64_t waitPast(std::uint64_t seen, std::chrono::milliseconds timeout) const
    {
      std::unique_lock<std::mutex> lock(m_mutex);
      m_cv.wait_for(lock, timeout, [&]{ return m_revision != seen; });
      return m_revision;
    }

  private:
    mutable std::mutex m_mutex;
    mutable std::condition_variable m_cv;
    std::uint64_t m_revision{0};
  };
}
