#pragma once

#include <memory>

// Detects (and, on first use, triggers the prompt for) macOS's Local Network
// permission (Aurora-o1qt). macOS has no "is it allowed?" API. Measured on
// macOS 27: with the permission off, a UDP send to the mDNS multicast group
// (like any LAN connect) fails at once with EHOSTUNREACH, while
// NWBrowser still reports `ready` and even sees its own advertisement -- so
// the browser says nothing about permission. The verdict therefore comes
// from the send; an NWBrowser on a service type declared in Info.plist's
// NSBonjourServices runs alongside only because Bonjour traffic is what
// makes macOS raise the permission prompt.
namespace Aurora::App
{

enum class LocalNetworkStatus
{
  Unknown,
  Granted,
  Denied,
};

inline const char* toString(LocalNetworkStatus status)
{
  switch(status){
    case LocalNetworkStatus::Granted: return "granted";
    case LocalNetworkStatus::Denied: return "denied";
    case LocalNetworkStatus::Unknown: break;
  }
  return "unknown";
}

// Maps a sendto() result onto a status: success is Granted, EHOSTUNREACH is
// Denied, any other failure (e.g. no network at all) is Unknown. Split out so
// the mapping tests without a network.
LocalNetworkStatus statusFromSend(long sent, int err);

// Retries the send until it succeeds or `timeoutSeconds` pass, returning the
// last verdict. Use a long timeout (30 s) the first time so the prompt can be
// answered, a short one (3 s) for rechecks.
LocalNetworkStatus probeLocalNetwork(double timeoutSeconds);

// Runs one long probe on a background thread at construction (which is what
// raises the prompt at launch) and caches the verdict.
class LocalNetworkProbe
{
public:
  LocalNetworkProbe();
  ~LocalNetworkProbe();
  LocalNetworkProbe(const LocalNetworkProbe&) = delete;
  LocalNetworkProbe& operator=(const LocalNetworkProbe&) = delete;

  // Thread-safe. The cached verdict from the last probe.
  LocalNetworkStatus status() const;

  // Fresh short probe (up to ~3 s, blocking); updates the cache.
  LocalNetworkStatus recheck();

private:
  struct Impl;
  std::shared_ptr<Impl> m_impl;
};

} // namespace Aurora::App
