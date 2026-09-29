#include <Aurora/Output/Hue/DevLightTap.hpp>

#include <cstdlib>

#include <nlohmann/json.hpp>

#ifndef _WIN32
#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#else
#include <winsock2.h>
#include <ws2tcpip.h>
#endif

namespace Aurora::Output::Hue
{
  namespace
  {
    constexpr const char* DefaultHost = "127.0.0.1";
  }


  DevLightTapAddress parseDevLightTapAddress(const std::string& envValue)
  {
    if(envValue.empty()){
      return {DefaultHost, DefaultDevLightTapPort};
    }

    auto colonPos = envValue.rfind(':');
    if(colonPos == std::string::npos){
      return {envValue, DefaultDevLightTapPort};
    }

    std::string host = envValue.substr(0, colonPos);
    std::string portStr = envValue.substr(colonPos + 1);

    if(host.empty()){
      host = DefaultHost;
    }

    uint16_t port = DefaultDevLightTapPort;
    if(!portStr.empty()){
      try{
        port = static_cast<uint16_t>(std::stoi(portStr));
      }
      catch(const std::exception&){
        // Unparseable port -- keep the default rather than throwing out of
        // what's meant to be a best-effort dev-only path.
        port = DefaultDevLightTapPort;
      }
    }

    return {host, port};
  }


  std::string buildDevLightTapPayload(const ChannelStreams& channelStreams)
  {
    nlohmann::json zones = nlohmann::json::array();
    for(const auto& channel : channelStreams){
      zones.push_back({
        {"id", channel.id},
        {"r", channel.r},
        {"g", channel.g},
        {"b", channel.b}
      });
    }

    nlohmann::json payload = {{"zones", zones}};
    return payload.dump();
  }


#ifndef _WIN32

  DevLightTap::DevLightTap()
  {
    // Presence-only flag, same convention as AURORA_DEV_FAKE_HUE -- its own
    // value is never parsed as an address (a plain "1"/"true" set to enable
    // it would otherwise get read as a hostname). The optional address
    // override lives in its own separate var, matching how
    // AURORA_HUE_BRIDGE_ADDRESS is separate from AURORA_DEV_FAKE_HUE.
    if(!std::getenv("AURORA_DEV_LIGHT_TAP")){
      return;
    }

    const char* addressEnv = std::getenv("AURORA_DEV_LIGHT_TAP_ADDRESS");
    DevLightTapAddress address = parseDevLightTapAddress(addressEnv ? addressEnv : "");

    int fd = ::socket(AF_INET, SOCK_DGRAM, 0);
    if(fd < 0){
      return;
    }
    m_socketFd = fd;

    // Non-blocking: belt-and-suspenders on top of UDP's own connectionless
    // send never blocking on a slow/absent receiver -- this tap must never
    // add latency to the real streaming path.
    int flags = ::fcntl(fd, F_GETFL, 0);
    ::fcntl(fd, F_SETFL, flags | O_NONBLOCK);

    sockaddr_in destAddr{};
    destAddr.sin_family = AF_INET;
    destAddr.sin_port = htons(address.port);
    if(::inet_pton(AF_INET, address.host.c_str(), &destAddr.sin_addr) != 1){
      ::close(fd);
      m_socketFd = -1;
      return;
    }

    // connect() on a UDP socket just fixes the default destination for
    // send() below -- no handshake, no connection state to fail.
    if(::connect(fd, reinterpret_cast<sockaddr*>(&destAddr), sizeof(destAddr)) < 0){
      ::close(fd);
      m_socketFd = -1;
      return;
    }

    m_enabled = true;
  }


  DevLightTap::~DevLightTap()
  {
    if(m_socketFd >= 0){
      ::close(static_cast<int>(m_socketFd));
    }
  }


  void DevLightTap::publish(const ChannelStreams& channelStreams) const
  {
    if(!m_enabled){
      return;
    }

    std::string payload = buildDevLightTapPayload(channelStreams);
    // Best-effort: return value intentionally ignored -- a dropped/partial
    // datagram just means one skipped frame in the visualization, never an
    // error the real streaming path should care about.
    ::send(static_cast<int>(m_socketFd), payload.data(), payload.size(), 0);
  }

#else

  // Winsock twin of the POSIX path above. WSAStartup is refcounted, so
  // calling it here alongside the DTLS client's own is harmless.
  DevLightTap::DevLightTap()
  {
    if(!std::getenv("AURORA_DEV_LIGHT_TAP")){
      return;
    }

    const char* addressEnv = std::getenv("AURORA_DEV_LIGHT_TAP_ADDRESS");
    DevLightTapAddress address = parseDevLightTapAddress(addressEnv ? addressEnv : "");

    WSADATA wsaData;
    if(::WSAStartup(MAKEWORD(2, 2), &wsaData) != 0){
      return;
    }

    SOCKET sock = ::socket(AF_INET, SOCK_DGRAM, 0);
    if(sock == INVALID_SOCKET){
      ::WSACleanup();
      return;
    }

    u_long nonBlocking = 1;
    ::ioctlsocket(sock, FIONBIO, &nonBlocking);

    sockaddr_in destAddr{};
    destAddr.sin_family = AF_INET;
    destAddr.sin_port = htons(address.port);
    if(::inet_pton(AF_INET, address.host.c_str(), &destAddr.sin_addr) != 1
       || ::connect(sock, reinterpret_cast<sockaddr*>(&destAddr), sizeof(destAddr)) == SOCKET_ERROR){
      ::closesocket(sock);
      ::WSACleanup();
      return;
    }

    m_socketFd = static_cast<std::intptr_t>(sock);
    m_enabled = true;
  }


  DevLightTap::~DevLightTap()
  {
    if(m_enabled){
      ::closesocket(static_cast<SOCKET>(m_socketFd));
      ::WSACleanup();
    }
  }


  void DevLightTap::publish(const ChannelStreams& channelStreams) const
  {
    if(!m_enabled){
      return;
    }

    std::string payload = buildDevLightTapPayload(channelStreams);
    ::send(static_cast<SOCKET>(m_socketFd), payload.data(), static_cast<int>(payload.size()), 0);
  }

#endif
}
