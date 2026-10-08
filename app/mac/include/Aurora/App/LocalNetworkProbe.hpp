#pragma once

#include <chrono>
#include <functional>
#include <string>

// macOS's Local Network permission (Aurora-o1qt, Aurora-rbp3). macOS has no
// "is it allowed?" API. Measured on macOS 27: with the permission off, a UDP
// send to the mDNS multicast group (like any LAN connect) fails at once with
// EHOSTUNREACH, while NWBrowser still reports `ready` and even sees its own
// advertisement -- so the browser says nothing about permission. The verdict
// therefore comes from the send; a Bonjour browse on a service type declared
// in Info.plist's NSBonjourServices runs at launch only because Bonjour
// traffic is what makes macOS raise the permission prompt.
namespace Aurora::App
{

enum class LocalNetworkStatus
{
  Unknown,
  Granted,
  Denied,
};

// Maps a sendto() result onto a status: success is Granted, EHOSTUNREACH is
// Denied, any other failure (e.g. no network at all) is Unknown. Split out so
// the mapping tests without a network.
LocalNetworkStatus statusFromSend(long sent, int err);

// One empty datagram to 224.0.0.251:5353. Returns at once; cheap enough to
// call every couple of seconds.
LocalNetworkStatus checkLocalNetworkOnce();

// Starts a short-lived Bonjour browse on a background queue, which raises
// the permission prompt on first launch. Fire and forget.
void requestLocalNetworkPrompt();

// Turns the check into the host's "local_network" condition (Aurora-rbp3).
// Level-triggered, not edge-only: it re-checks every `interval` and sets or
// clears to match, so flipping the toggle in System Settings clears the
// banner with no Retry. Unknown clears too: it means "no network", not a
// denial. A denial must repeat `deniedThreshold` checks in a row before the
// condition is set: while the first-run prompt is up the send fails like a
// denial, and one miss flashed the banner under it (Aurora-dwvu). Clearing is
// immediate. Callbacks rather than a PipelineHost so it tests without one.
class LocalNetworkConditionPublisher
{
public:
  static constexpr const char* kSource = "local_network";
  static constexpr const char* kMessage = "macOS is blocking Aurora from your local network";

  using Check = std::function<LocalNetworkStatus()>;
  using Set = std::function<void(const std::string& source, const std::string& message)>;
  using Clear = std::function<void(const std::string& source)>;
  using Clock = std::chrono::steady_clock;

  static constexpr int kDefaultDeniedThreshold = 2;

  LocalNetworkConditionPublisher(Check check, Set set, Clear clear,
                                 Clock::duration interval = std::chrono::seconds(2),
                                 int deniedThreshold = kDefaultDeniedThreshold)
    : m_check(std::move(check)), m_set(std::move(set)), m_clear(std::move(clear)),
      m_interval(interval), m_deniedThreshold(deniedThreshold) {}

  void poll(Clock::time_point now = Clock::now())
  {
    if(m_checked && now - m_lastCheck < m_interval){ return; }
    m_checked = true;
    m_lastCheck = now;
    m_deniedStreak = m_check() == LocalNetworkStatus::Denied ? m_deniedStreak + 1 : 0;
    const bool denied = m_deniedStreak >= m_deniedThreshold;
    if(denied == m_isSet){ return; }
    if(denied){ m_set(kSource, kMessage); }
    else{ m_clear(kSource); }
    m_isSet = denied;
  }

private:
  Check m_check;
  Set m_set;
  Clear m_clear;
  Clock::duration m_interval;
  int m_deniedThreshold;
  int m_deniedStreak{0};
  Clock::time_point m_lastCheck{};
  bool m_checked{false};
  bool m_isSet{false};
};

} // namespace Aurora::App
