#include <Aurora/App/LocalNetworkProbe.hpp>

#include <atomic>
#include <cerrno>
#include <chrono>
#include <thread>

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#import <Network/Network.h>

namespace Aurora::App
{

namespace
{
  // Must match NSBonjourServices in Info.plist.in. Dedicated type so the probe
  // never sees (or is mistaken for) a real Hue bridge.
  constexpr const char* kProbeServiceType = "_aurora-preflight._tcp";

  // Empty datagram to the mDNS group: no payload, nothing listens for it.
  LocalNetworkStatus sendOnce()
  {
    const int fd = socket(AF_INET, SOCK_DGRAM, 0);
    if(fd < 0){ return LocalNetworkStatus::Unknown; }
    sockaddr_in group{};
    group.sin_family = AF_INET;
    group.sin_port = htons(5353);
    inet_pton(AF_INET, "224.0.0.251", &group.sin_addr);
    const ssize_t sent = sendto(fd, "", 0, 0, reinterpret_cast<sockaddr*>(&group), sizeof group);
    const int err = errno;
    close(fd);
    return statusFromSend(sent, err);
  }
}

LocalNetworkStatus probeLocalNetwork(double timeoutSeconds)
{
  // Raises the permission prompt on first use; the result is ignored.
  dispatch_queue_t queue = dispatch_queue_create("aurora.localnetwork.probe", DISPATCH_QUEUE_SERIAL);
  nw_browse_descriptor_t descriptor = nw_browse_descriptor_create_bonjour_service(kProbeServiceType, nullptr);
  nw_browser_t browser = nw_browser_create(descriptor, nw_parameters_create());
  nw_browser_set_queue(browser, queue);
  nw_browser_start(browser);

  using Clock = std::chrono::steady_clock;
  const auto deadline = Clock::now() + std::chrono::duration<double>(timeoutSeconds);
  LocalNetworkStatus status = sendOnce();
  while(status != LocalNetworkStatus::Granted && Clock::now() < deadline){
    std::this_thread::sleep_for(std::chrono::milliseconds(250));
    status = sendOnce();
  }
  nw_browser_cancel(browser);
  return status;
}

struct LocalNetworkProbe::Impl
{
  std::atomic<LocalNetworkStatus> status{LocalNetworkStatus::Unknown};
};

LocalNetworkProbe::LocalNetworkProbe(): m_impl(std::make_shared<Impl>())
{
  // Detached so quitting never waits out an unanswered prompt; the thread
  // holds its own reference to the state.
  std::thread([impl = m_impl]{ impl->status = probeLocalNetwork(30.0); }).detach();
}

LocalNetworkProbe::~LocalNetworkProbe() = default;

LocalNetworkStatus LocalNetworkProbe::status() const
{
  return m_impl->status.load();
}

LocalNetworkStatus LocalNetworkProbe::recheck()
{
  const auto result = probeLocalNetwork(3.0);
  m_impl->status = result;
  return result;
}

} // namespace Aurora::App
