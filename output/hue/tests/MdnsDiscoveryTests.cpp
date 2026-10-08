#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <array>
#include <cstdint>
#include <string>
#include <vector>

#include <Aurora/Output/Hue/MdnsDiscovery.hpp>

using namespace Aurora::Output::Hue;

namespace
{
  using Bytes = std::vector<uint8_t>;

  void u16(Bytes& out, uint16_t value){ out.push_back(value >> 8); out.push_back(value & 0xFF); }
  void u32(Bytes& out, uint32_t value){ u16(out, value >> 16); u16(out, value & 0xFFFF); }

  void name(Bytes& out, const std::string& dotted)
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

  void record(Bytes& out, const std::string& owner, uint16_t type, const Bytes& rdata)
  {
    name(out, owner);
    u16(out, type);
    u16(out, 0x8001);
    u32(out, 120);
    u16(out, static_cast<uint16_t>(rdata.size()));
    out.insert(out.end(), rdata.begin(), rdata.end());
  }

  // What a bridge sends: PTR for the service, SRV + TXT + A for the instance.
  Bytes bridgeResponse(const std::string& id, const std::string& host, const std::array<uint8_t, 4>& ip)
  {
    const std::string instance = "Philips Hue - 99DD92._hue._tcp.local";
    Bytes packet;
    u16(packet, 0); u16(packet, 0x8400);
    u16(packet, 0); u16(packet, 1); u16(packet, 0); u16(packet, 3);

    Bytes ptr; name(ptr, instance);
    record(packet, "_hue._tcp.local", 12, ptr);

    Bytes srv; u16(srv, 0); u16(srv, 0); u16(srv, 443); name(srv, host);
    record(packet, instance, 33, srv);

    Bytes txt;
    const std::string entry = "bridgeid=" + id;
    txt.push_back(static_cast<uint8_t>(entry.size()));
    txt.insert(txt.end(), entry.begin(), entry.end());
    record(packet, instance, 16, txt);

    record(packet, host, 1, Bytes(ip.begin(), ip.end()));
    return packet;
  }
}

TEST_CASE("query asks for PTR _hue._tcp.local", "[Mdns]")
{
  const Bytes query = buildHueMdnsQuery();
  REQUIRE(query.size() > 12);
  CHECK(query[5] == 1); // one question
  const std::string asText(query.begin() + 12, query.end());
  CHECK(asText.find("_hue") != std::string::npos);
  CHECK(asText.find("_tcp") != std::string::npos);
  CHECK(query[query.size() - 4] == 0);
  CHECK(query[query.size() - 3] == 12); // PTR
}

TEST_CASE("a bridge response yields its address and lower-cased id", "[Mdns]")
{
  const Bytes packet = bridgeResponse("ECB5FAFFFE9CDD92", "ecb5fa-9cdd92.local", {192, 168, 0, 154});
  const auto bridges = parseHueMdnsResponse(packet.data(), packet.size());
  REQUIRE(bridges.size() == 1);
  CHECK(bridges[0].address == "192.168.0.154");
  CHECK(bridges[0].id == "ecb5fafffe9cdd92");
}

TEST_CASE("a response without an A record for the SRV host yields nothing", "[Mdns]")
{
  Bytes packet = bridgeResponse("ECB5FAFFFE9CDD92", "ecb5fa-9cdd92.local", {192, 168, 0, 154});
  // Swap the A record's owner so it no longer matches the SRV target.
  const std::string from = "ecb5fa-9cdd92";
  const std::string to = "other0-000000";
  auto at = std::search(packet.end() - 40, packet.end(), from.begin(), from.end());
  REQUIRE(at != packet.end());
  std::copy(to.begin(), to.end(), at);
  CHECK(parseHueMdnsResponse(packet.data(), packet.size()).empty());
}

TEST_CASE("garbage and truncation never throw or crash", "[Mdns]")
{
  CHECK(parseHueMdnsResponse(nullptr, 0).empty());
  const Bytes junk = {1, 2, 3};
  CHECK(parseHueMdnsResponse(junk.data(), junk.size()).empty());

  const Bytes good = bridgeResponse("ECB5FAFFFE9CDD92", "h.local", {10, 0, 0, 2});
  for(std::size_t cut = 0; cut < good.size(); ++cut){
    parseHueMdnsResponse(good.data(), cut);
  }

  // A compression pointer pointing at itself must terminate.
  Bytes loop = {0, 0, 0x84, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0xC0, 12, 0, 12, 0, 1};
  CHECK(parseHueMdnsResponse(loop.data(), loop.size()).empty());
}
