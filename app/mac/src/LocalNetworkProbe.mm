#include <Aurora/App/LocalNetworkProbe.hpp>

#include <cerrno>

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#import <Network/Network.h>

namespace Aurora::App
{

namespace
{
  // Must match NSBonjourServices in Info.plist.in. Dedicated type so the
  // browse never sees (or is mistaken for) a real Hue bridge.
  constexpr const char* kPromptServiceType = "_aurora-preflight._tcp";

  // Long enough for the user to answer the prompt; the browse's results are
  // never used.
  constexpr int64_t kPromptBrowseSeconds = 30;
}

LocalNetworkStatus checkLocalNetworkOnce()
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

void requestLocalNetworkPrompt()
{
  dispatch_queue_t queue = dispatch_queue_create("aurora.localnetwork.prompt", DISPATCH_QUEUE_SERIAL);
  nw_browse_descriptor_t descriptor = nw_browse_descriptor_create_bonjour_service(kPromptServiceType, nullptr);
  nw_browser_t browser = nw_browser_create(descriptor, nw_parameters_create());
  nw_browser_set_queue(browser, queue);
  nw_browser_start(browser);
  // The block keeps `browser` alive until it cancels it.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, kPromptBrowseSeconds * NSEC_PER_SEC), queue, ^{
    nw_browser_cancel(browser);
  });
}

} // namespace Aurora::App
