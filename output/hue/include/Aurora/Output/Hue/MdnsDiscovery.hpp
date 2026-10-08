#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

// Local Hue bridge discovery over mDNS/DNS-SD (Aurora-cyee): finds bridges
// with no internet and no dependence on discovery.meethue.com, which
// rate-limits (HTTP 429) and is unreachable offline. The bridge advertises
// _hue._tcp.local with its address and a TXT record carrying bridgeid.
namespace Aurora::Output::Hue
{
  struct MdnsBridge
  {
    std::string id;      // TXT bridgeid, lower-cased; empty when absent
    std::string address; // dotted IPv4
  };

  // A DNS-SD PTR query for _hue._tcp.local (id 0, QM, so answered by
  // legacy unicast to the sender's own port).
  std::vector<uint8_t> buildHueMdnsQuery();

  // Bridges described by one mDNS response packet: instances named by PTR
  // records for _hue._tcp.local, resolved through their SRV target's A
  // record (or, failing that, an A record named by the instance's host).
  // Malformed or unrelated packets yield an empty list, never throw.
  std::vector<MdnsBridge> parseHueMdnsResponse(const uint8_t* data, std::size_t size);

  // Sends the query and gathers replies for `timeoutMs` (the sockets' work
  // is blocking). Deduplicated by address. Empty on timeout, no network, or
  // a macOS Local Network denial (the send fails).
  std::vector<MdnsBridge> discoverBridgesMdns(int timeoutMs = 1500);
}
