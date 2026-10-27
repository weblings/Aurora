#pragma once

#include <functional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

// Transport-agnostic request/response shape -- mirrors huenicorn's own
// Network::Http::Server::HttpDataStructs.hpp (see docs/HttpServerAnalysis.md).
// A route handler only ever sees these types, never cpp-httplib's own, so the
// underlying HTTP library stays swappable behind Impl alone.
namespace Aurora::Network::Http::Server
{
  using Params = std::unordered_map<std::string, std::string>;


  enum class HttpMethod
  {
    Get,
    Post,
    Put,
    Delete,
    Patch
  };


  // Ordered: a device holding a scope may call anything needing a lower one.
  // Loopback requests carry Admin (Aurora-5ipy.5).
  enum class Scope
  {
    None,
    Read,
    Draft,
    Control,
    Apply,
    Admin
  };


  struct Request
  {
    HttpMethod method;
    std::string body;

    Params pathParams;
    Params queryParams;

    std::string path;

    // X-Aurora-Client header, lowercase ("mcp" from the MCP adapter), else empty.
    std::string client;

    // Filled by the server from its AccessGuard; defaults stand in when none is set.
    std::string remoteAddr;
    bool local{true};
    Scope scope{Scope::Admin};
  };


  struct Response
  {
    int status{200};
    std::string contentType = "text/plain";
    std::string body;
    std::vector<std::pair<std::string, std::string>> headers;
  };


  using Handler = std::function<void(const Request&, Response&)>;


  // The write side of one open text/event-stream response (Aurora-5ipy.3).
  // A stream handler runs on its own server worker until it returns, so it
  // must loop on open() and write() rather than block forever.
  class EventStream
  {
  public:
    virtual ~EventStream() = default;

    // False once the peer is gone or the server is stopping.
    virtual bool open() const = 0;

    // Sends raw SSE text; false if the peer is gone.
    virtual bool write(const std::string& text) = 0;
  };


  using StreamHandler = std::function<void(const Request&, EventStream&)>;

  struct StreamRoute
  {
    std::string path;
    StreamHandler handler;
  };

  struct Route
  {
    HttpMethod method;
    std::string path;
    Handler handler;
  };
}
