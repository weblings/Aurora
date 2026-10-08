#pragma once

#include <map>
#include <optional>
#include <string>

#include <nlohmann/json.hpp>

// Thin HTTP(S) client returning JSON, ported from huenicorn's
// Network::Http::Client. SSL verification is deliberately disabled --
// Hue bridges use self-signed certs. Never reuse this for a non-Hue target.
namespace Aurora::Output::Hue
{
  using HttpHeaders = std::multimap<std::string, std::string>;

  class HttpResponse
  {
  public:
    explicit HttpResponse(std::string body):
    m_body(std::move(body))
    {}

    const std::string& asString() const { return m_body; }
    nlohmann::json asJson() const { return nlohmann::json::parse(m_body); }

  private:
    std::string m_body;
  };

  // LAN bridge calls answer fast; a cold internet round trip (discovery) needs
  // longer (Aurora-07i: 1s made Autodetect fail on its first click).
  inline constexpr long DefaultHttpTimeoutMs = 1000;

  // Returns std::nullopt on transport failure (timeout, DNS, refused, ...);
  // an HTTP error status still returns a Response -- callers check the body.
  std::optional<HttpResponse> sendHttpRequest(
    const std::string& url,
    const std::string& method,
    const std::string& body = "",
    const HttpHeaders& headers = {},
    long timeoutMs = DefaultHttpTimeoutMs
  );
}
