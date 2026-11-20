#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <mutex>
#include <string>
#include <thread>

#include <httplib.h>


namespace
{
  // Reads one text/event-stream on its own thread. The destructor aborts the
  // read on the next chunk, so keep the server's heartbeat short or stop the
  // server first.
  class SseReader
  {
  public:
    SseReader(int port, const std::string& path)
    {
      m_thread = std::thread([this, port, path]{
        httplib::Client client("127.0.0.1", port);
        client.set_read_timeout(10, 0);
        client.Get(
          path,
          [this](const httplib::Response& response){
            std::lock_guard<std::mutex> lock(m_mutex);
            m_status = response.status;
            m_retryAfter = response.get_header_value("Retry-After");
            m_cv.notify_all();
            return true;
          },
          [this](const char* chunk, size_t length){
            std::lock_guard<std::mutex> lock(m_mutex);
            m_data.append(chunk, length);
            m_cv.notify_all();
            return !m_abort.load();
          }
        );
        std::lock_guard<std::mutex> lock(m_mutex);
        m_finished = true;
        m_cv.notify_all();
      });
    }

    ~SseReader()
    {
      m_abort.store(true);
      if(m_thread.joinable()){ m_thread.join(); }
    }

    // Blocks until the status line arrived (or the thread ended); 0 if never.
    int status()
    {
      std::unique_lock<std::mutex> lock(m_mutex);
      m_cv.wait_for(lock, std::chrono::seconds(5), [this]{ return m_status != 0 || m_finished; });
      return m_status;
    }

    bool waitFor(const std::string& needle, std::chrono::milliseconds timeout = std::chrono::milliseconds(5000))
    {
      std::unique_lock<std::mutex> lock(m_mutex);
      return m_cv.wait_for(lock, timeout, [&]{ return m_data.find(needle) != std::string::npos; });
    }

    bool waitFinished(std::chrono::milliseconds timeout = std::chrono::milliseconds(5000))
    {
      std::unique_lock<std::mutex> lock(m_mutex);
      return m_cv.wait_for(lock, timeout, [this]{ return m_finished; });
    }

    // Valid once status() returned.
    std::string retryAfter()
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      return m_retryAfter;
    }

    std::string data()
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      return m_data;
    }

  private:
    std::mutex m_mutex;
    std::condition_variable m_cv;
    std::string m_data;
    std::string m_retryAfter;
    int m_status{0};
    bool m_finished{false};
    std::atomic<bool> m_abort{false};
    std::thread m_thread;
  };
}
