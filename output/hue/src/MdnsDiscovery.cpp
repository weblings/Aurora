#include <Aurora/Output/Hue/MdnsDiscovery.hpp>

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstring>
#include <map>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace Aurora::Output::Hue
{
  namespace
  {
    constexpr const char* HueServiceName = "_hue._tcp.local";
    constexpr uint16_t TypeA = 1;
    constexpr uint16_t TypePtr = 12;
    constexpr uint16_t TypeTxt = 16;
    constexpr uint16_t TypeSrv = 33;

    std::string lower(std::string text)
    {
      std::transform(text.begin(), text.end(), text.begin(), [](unsigned char c){ return std::tolower(c); });
      return text;
    }

    void appendName(std::vector<uint8_t>& out, const std::string& dotted)
    {
      std::size_t start = 0;
      while(start < dotted.size()){
        std::size_t dot = dotted.find('.', start);
        if(dot == std::string::npos){ dot = dotted.size(); }
        out.push_back(static_cast<uint8_t>(dot - start));
        out.insert(out.end(), dotted.begin() + start, dotted.begin() + dot);
        start = dot + 1;
      }
      out.push_back(0);
    }

    struct Reader
    {
      const uint8_t* data;
      std::size_t size;

      bool has(std::size_t pos, std::size_t count) const { return pos <= size && count <= size - pos; }
      uint16_t u16(std::size_t pos) const { return static_cast<uint16_t>((data[pos] << 8) | data[pos + 1]); }

      // Reads a possibly compressed name at `pos`, advancing `pos` past its
      // in-place bytes only (a pointer ends the name there). Returns false on
      // truncation, a bad label, or a pointer loop.
      bool name(std::size_t& pos, std::string& out) const
      {
        out.clear();
        std::size_t cursor = pos;
        bool jumped = false;
        int hops = 0;
        while(true){
          if(!has(cursor, 1)){ return false; }
          const uint8_t len = data[cursor];
          if(len == 0){
            if(!jumped){ pos = cursor + 1; }
            return true;
          }
          if((len & 0xC0) == 0xC0){
            if(!has(cursor, 2) || ++hops > 16){ return false; }
            const std::size_t target = ((len & 0x3F) << 8) | data[cursor + 1];
            if(!jumped){ pos = cursor + 2; }
            jumped = true;
            cursor = target;
            continue;
          }
          if((len & 0xC0) != 0 || !has(cursor + 1, len)){ return false; }
          if(!out.empty()){ out.push_back('.'); }
          out.append(reinterpret_cast<const char*>(data + cursor + 1), len);
          cursor += 1 + len;
        }
      }
    };
  }


  std::vector<uint8_t> buildHueMdnsQuery()
  {
    std::vector<uint8_t> packet = {
      0, 0,  // id
      0, 0,  // flags: standard query
      0, 1,  // one question
      0, 0, 0, 0, 0, 0
    };
    appendName(packet, HueServiceName);
    packet.insert(packet.end(), {0, TypePtr, 0, 1}); // PTR, class IN
    return packet;
  }


  std::vector<MdnsBridge> parseHueMdnsResponse(const uint8_t* data, std::size_t size)
  {
    const Reader reader{data, size};
    if(!reader.has(0, 12)){ return {}; }

    const uint16_t questions = reader.u16(4);
    const uint16_t records = static_cast<uint16_t>(reader.u16(6) + reader.u16(8) + reader.u16(10));

    std::size_t pos = 12;
    std::string name;
    for(uint16_t i = 0; i < questions; ++i){
      if(!reader.name(pos, name) || !reader.has(pos, 4)){ return {}; }
      pos += 4;
    }

    std::vector<std::string> instances;                 // PTR targets for the Hue service
    std::map<std::string, std::string> instanceHost;    // instance -> SRV target host
    std::map<std::string, std::string> instanceId;      // instance -> TXT bridgeid
    std::map<std::string, std::string> hostAddress;     // host -> A record

    for(uint16_t i = 0; i < records; ++i){
      std::string owner;
      if(!reader.name(pos, owner) || !reader.has(pos, 10)){ break; }
      const uint16_t type = reader.u16(pos);
      const std::size_t rdLength = reader.u16(pos + 8);
      pos += 10;
      if(!reader.has(pos, rdLength)){ break; }
      const std::size_t rdStart = pos;
      pos += rdLength;
      owner = lower(owner);

      if(type == TypePtr && owner == HueServiceName){
        std::size_t at = rdStart;
        std::string target;
        if(reader.name(at, target)){ instances.push_back(lower(target)); }
      }
      else if(type == TypeSrv && rdLength > 6){
        std::size_t at = rdStart + 6;
        std::string target;
        if(reader.name(at, target)){ instanceHost[owner] = lower(target); }
      }
      else if(type == TypeTxt){
        std::size_t at = rdStart;
        while(at < rdStart + rdLength){
          const std::size_t len = data[at++];
          if(at + len > rdStart + rdLength){ break; }
          const std::string entry(reinterpret_cast<const char*>(data + at), len);
          if(lower(entry.substr(0, 9)) == "bridgeid="){ instanceId[owner] = lower(entry.substr(9)); }
          at += len;
        }
      }
      else if(type == TypeA && rdLength == 4){
        char text[INET_ADDRSTRLEN] = {};
        in_addr address{};
        std::memcpy(&address, data + rdStart, 4);
        if(inet_ntop(AF_INET, &address, text, sizeof text)){ hostAddress[owner] = text; }
      }
    }

    std::vector<MdnsBridge> bridges;
    for(const std::string& instance : instances){
      std::string address;
      if(auto host = instanceHost.find(instance); host != instanceHost.end()){
        if(auto found = hostAddress.find(host->second); found != hostAddress.end()){ address = found->second; }
      }
      if(address.empty()){ continue; }
      MdnsBridge bridge;
      bridge.address = address;
      if(auto id = instanceId.find(instance); id != instanceId.end()){ bridge.id = id->second; }
      bridges.push_back(bridge);
    }
    return bridges;
  }


  std::vector<MdnsBridge> discoverBridgesMdns(int timeoutMs)
  {
#ifdef _WIN32
    WSADATA wsa;
    if(WSAStartup(MAKEWORD(2, 2), &wsa) != 0){ return {}; }
    using Socket = SOCKET;
    const Socket invalid = INVALID_SOCKET;
#else
    using Socket = int;
    const Socket invalid = -1;
#endif

    const Socket sock = socket(AF_INET, SOCK_DGRAM, 0);
    if(sock == invalid){ return {}; }

    sockaddr_in group{};
    group.sin_family = AF_INET;
    group.sin_port = htons(5353);
    inet_pton(AF_INET, "224.0.0.251", &group.sin_addr);

    const std::vector<uint8_t> query = buildHueMdnsQuery();
    std::vector<MdnsBridge> bridges;

    auto sendQuery = [&]{
      return sendto(sock, reinterpret_cast<const char*>(query.data()), static_cast<int>(query.size()), 0,
                    reinterpret_cast<const sockaddr*>(&group), sizeof group) >= 0;
    };

    if(sendQuery()){
      using Clock = std::chrono::steady_clock;
      const auto deadline = Clock::now() + std::chrono::milliseconds(timeoutMs);
      auto nextResend = Clock::now() + std::chrono::milliseconds(500);
      uint8_t buffer[9000];

      while(Clock::now() < deadline){
        const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - Clock::now()).count();
        const int waitMs = static_cast<int>(std::min<long long>(remaining, 100));
#ifdef _WIN32
        pollfd watch{sock, POLLRDNORM, 0};
        const int ready = WSAPoll(&watch, 1, waitMs);
#else
        pollfd watch{sock, POLLIN, 0};
        const int ready = poll(&watch, 1, waitMs);
#endif
        if(ready > 0){
          const auto received = recv(sock, reinterpret_cast<char*>(buffer), sizeof buffer, 0);
          if(received > 0){
            for(MdnsBridge& found : parseHueMdnsResponse(buffer, static_cast<std::size_t>(received))){
              const bool known = std::any_of(bridges.begin(), bridges.end(),
                [&](const MdnsBridge& seen){ return seen.address == found.address; });
              if(!known){ bridges.push_back(std::move(found)); }
            }
          }
        }
        // Responders may miss the first packet; one resend is cheap.
        if(Clock::now() >= nextResend){
          sendQuery();
          nextResend = deadline;
        }
      }
    }

#ifdef _WIN32
    closesocket(sock);
#else
    close(sock);
#endif
    return bridges;
  }
}
