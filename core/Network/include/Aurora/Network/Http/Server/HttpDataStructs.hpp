#pragma once

#include <functional>
#include <string>
#include <unordered_map>

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


  struct Request
  {
    HttpMethod method;
    std::string body;

    Params pathParams;
    Params queryParams;

    std::string path;
  };


  struct Response
  {
    int status{200};
    std::string contentType = "text/plain";
    std::string body;
  };


  using Handler = std::function<void(const Request&, Response&)>;

  struct Route
  {
    HttpMethod method;
    std::string path;
    Handler handler;
  };
}
