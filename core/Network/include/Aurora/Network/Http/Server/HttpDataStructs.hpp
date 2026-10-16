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

  struct Route
  {
    HttpMethod method;
    std::string path;
    Handler handler;
  };
}
