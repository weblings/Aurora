#pragma once

#include <optional>
#include <string>
#include <unordered_map>

#include <httplib.h>

#include <Aurora/Network/Http/Server/HttpDataStructs.hpp>

// The only file in this module that includes <httplib.h> -- keeps
// cpp-httplib swappable behind HttpServer without touching any route
// definition. Mirrors huenicorn's own Impl/HttpLibServerImpl.hpp (verified
// directly, see docs/HttpServerAnalysis.md) plus one addition: an
// optional static-file mount point, via cpp-httplib's own set_mount_point.
namespace Aurora::Network::Http::Server
{
  class HttpServer;


  class Impl
  {
    friend HttpServer;

    static std::string contentTypeFor(const std::string& key)
    {
      static const std::unordered_map<std::string, std::string> table = {
        {".js", "text/javascript"},
        {".html", "text/html"},
        {".css", "text/css"},
        {".svg", "image/svg+xml"},
        {".json", "application/json"},
        {".png", "image/png"},
        {".ico", "image/x-icon"},
        {".txt", "text/plain"},
      };
      auto dot = key.rfind('.');
      if(dot != std::string::npos){
        auto it = table.find(key.substr(dot));
        if(it != table.end()){
          return it->second;
        }
      }
      return "application/octet-stream";
    }


    static httplib::Server::Handler _wrapHandler(Handler handler, HttpMethod method)
    {
      return [handler = std::move(handler), method](const httplib::Request& req, httplib::Response& res){
        Request r;
        Response w;

        r.method = method;
        r.body = req.body;
        r.path = req.path;

        for(const auto& [key, value] : req.path_params){
          r.pathParams[key] = value;
        }

        for(const auto& [key, value] : req.params){
          r.queryParams[key] = value;
        }

        handler(r, w);

        res.status = w.status;
        res.set_content(w.body, w.contentType);
      };
    }

  public:
    ~Impl()
    {
      stop();
    }


    Impl(const std::vector<Route>& routes, const std::optional<std::filesystem::path>& staticDir, const std::optional<std::unordered_map<std::string, std::string>>& embeddedFiles)
    {
      m_service.emplace();

      m_service->set_socket_options([](socket_t sock) {
        httplib::set_socket_opt(sock, SOL_SOCKET, SO_REUSEADDR, 1);
      });

      if(staticDir.has_value()){
        m_service->set_mount_point("/", staticDir->string());
      }

      // No caching, ever -- this is a local dev/single-user daemon serving
      // files straight off disk; a stale browser-cached WebUI file silently
      // outliving an edit costs far more than re-fetching a few small files
      // every load. Applies to every response (static and API alike) via
      // cpp-httplib's shared write_response_core path, confirmed by reading
      // its real source, not assumed.
      m_service->set_post_routing_handler([](const httplib::Request&, httplib::Response& res){
        res.set_header("Cache-Control", "no-store");
      });

      for(const auto& route : routes){
        auto wrapped = _wrapHandler(route.handler, route.method);
        switch(route.method)
        {
          case HttpMethod::Get:
            m_service->Get(route.path, wrapped);
            break;

          case HttpMethod::Post:
            m_service->Post(route.path, wrapped);
            break;

          case HttpMethod::Put:
            m_service->Put(route.path, wrapped);
            break;

          case HttpMethod::Delete:
            m_service->Delete(route.path, wrapped);
            break;

          case HttpMethod::Patch:
            m_service->Patch(route.path, wrapped);
            break;
        }
      }

      if(embeddedFiles.has_value()){
        // Fallback registered after every API route above, so explicit
        // routes win ties -- cpp-httplib matches handlers in registration
        // order. Main.cpp sets either this or the mount point, not both.
        m_service->Get("/(.*)", [files = *embeddedFiles](const httplib::Request& req, httplib::Response& res){
          std::string key = req.matches.size() > 1 ? req.matches[1].str() : "";
          if(key.empty()){
            key = "index.html";
          }

          auto it = files.find(key);
          if(it == files.end()){
            res.status = 404;
            auto notFound = files.find("404.html");
            if(notFound != files.end()){
              res.set_content(notFound->second, "text/html");
            }
            return;
          }

          res.set_content(it->second, contentTypeFor(key));
        });
      }
    }


    bool stop()
    {
      if(!m_service.has_value()){
        return false;
      }

      m_service->stop();
      m_service.reset();

      return true;
    }


    bool bind(
      const std::string& boundAddress,
      unsigned port
    )
    {
      return m_service->bind_to_port(boundAddress, port);
    }


    bool listen()
    {
      if(!m_service){
        return false;
      }

      return m_service->listen_after_bind();
    }

    std::optional<httplib::Server> m_service;
  };
}
