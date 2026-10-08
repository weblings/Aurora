#pragma once

#include <cctype>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

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
        {".gif", "image/gif"},
        {".ico", "image/x-icon"},
        {".txt", "text/plain"},
        {".md", "text/markdown"},
        {".mjs", "text/javascript"},
        {".map", "application/json"},
        {".woff2", "font/woff2"},
        {".wasm", "application/wasm"},
        {".webp", "image/webp"},
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


    // Shared by the root fallback and every prefixed map. "" or any
    // trailing-slash key resolves to that directory's index.html; a miss
    // serves the map's own 404.html when it has one.
    static void serveEmbeddedKey(
      const std::unordered_map<std::string, std::string>& files,
      std::string key,
      httplib::Response& res
    )
    {
      if(key.empty() || key.back() == '/'){
        key += "index.html";
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
    }


    static std::string escapeRegex(const std::string& text)
    {
      static const std::string special = R"(\^$.|?*+()[]{})";
      std::string escaped;
      for(char c : text){
        if(special.find(c) != std::string::npos){
          escaped += '\\';
        }
        escaped += c;
      }
      return escaped;
    }


    // Aurora-5i3: the daemon binds 0.0.0.0 with no auth, so any web page
    // the user opens could otherwise drive state-changing routes through
    // the browser (e.g. PUT /api/config at 127.0.0.1). Browsers attach
    // Origin to state-changing fetches, while curl/scripts/tests send
    // none -- so reject a non-GET request whose Origin (Referer fallback)
    // names a different host than the request's own Host header.
    // Same-origin WebUI traffic matches by construction, including a WebUI
    // opened from another device (both sides carry the LAN host).
    // Deliberately not a DNS-rebinding defense: a page whose URL already
    // resolves at the daemon would match; that needs a Host allowlist and
    // is tracked as future work in docs/planning/HomeAssistantOutput.md.
    static std::string _lowered(std::string text)
    {
      for(char& c : text){
        c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
      }
      return text;
    }


    static std::string _hostPart(const std::string& authority)
    {
      if(!authority.empty() && authority.front() == '['){
        auto end = authority.find(']');
        return end == std::string::npos ? "" : authority.substr(1, end - 1);
      }
      auto colon = authority.find(':');
      return colon == std::string::npos ? authority : authority.substr(0, colon);
    }


    static std::string _originHost(const std::string& origin)
    {
      auto schemeEnd = origin.find("://");
      if(schemeEnd == std::string::npos){
        return "";
      }
      auto hostEnd = origin.find('/', schemeEnd + 3);
      std::string authority = hostEnd == std::string::npos
        ? origin.substr(schemeEnd + 3)
        : origin.substr(schemeEnd + 3, hostEnd - schemeEnd - 3);
      return authority.empty() ? "" : _hostPart(authority);
    }


    static bool _crossOriginWrite(const httplib::Request& req, HttpMethod method)
    {
      if(method == HttpMethod::Get){
        return false;
      }
      std::string origin;
      if(req.has_header("Origin")){
        origin = req.get_header_value("Origin");
      }
      else if(req.has_header("Referer")){
        origin = req.get_header_value("Referer");
      }
      else{
        return false;
      }
      std::string claimed = _originHost(origin);
      if(claimed.empty()){
        return true; // present but unparseable: fail closed ("null", garbage)
      }
      std::string host = req.has_header("Host") ? req.get_header_value("Host") : "";
      return _lowered(claimed) != _lowered(_hostPart(host));
    }


    static httplib::Server::Handler _wrapHandler(Handler handler, HttpMethod method)
    {
      return [handler = std::move(handler), method](const httplib::Request& req, httplib::Response& res){
        if(_crossOriginWrite(req, method)){
          res.status = 403;
          res.set_content("{\"succeeded\":false,\"error\":\"cross_origin_forbidden\"}", "application/json");
          return;
        }

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


    Impl(
      const std::vector<Route>& routes,
      const std::optional<std::filesystem::path>& staticDir,
      const std::optional<std::unordered_map<std::string, std::string>>& embeddedFiles,
      const std::vector<std::pair<std::string, std::unordered_map<std::string, std::string>>>& prefixedEmbeddedFiles
    )
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

      // Prefixed maps go before the root fallback so its "/(.*)" can't
      // swallow them; cpp-httplib consults the static mount first and only
      // falls through to handlers on a miss, so these also work beside it.
      // Named captures, not structured bindings: capturing those needs
      // Clang 16+, which older Apple Clang predates.
      for(const auto& entry : prefixedEmbeddedFiles){
        m_service->Get(escapeRegex(entry.first), [prefix = entry.first](const httplib::Request&, httplib::Response& res){
          res.set_redirect(prefix + "/", 301);
        });
        m_service->Get(escapeRegex(entry.first) + "/(.*)", [files = entry.second](const httplib::Request& req, httplib::Response& res){
          serveEmbeddedKey(files, req.matches.size() > 1 ? req.matches[1].str() : "", res);
        });
      }

      if(embeddedFiles.has_value()){
        // Fallback registered after every API route above, so explicit
        // routes win ties -- cpp-httplib matches handlers in registration
        // order. Main.cpp sets either this or the mount point, not both.
        m_service->Get("/(.*)", [files = *embeddedFiles](const httplib::Request& req, httplib::Response& res){
          serveEmbeddedKey(files, req.matches.size() > 1 ? req.matches[1].str() : "", res);
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
