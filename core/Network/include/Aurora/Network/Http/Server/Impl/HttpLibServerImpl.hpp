#pragma once

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

#include <httplib.h>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

#include <Aurora/Network/Http/Server/HttpDataStructs.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>

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
    // Not a DNS-rebinding defense (a rebound page matches its own Host);
    // the Host allowlist in _hostAllowed covers that.
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


    // Aurora-5ipy.4: DNS rebinding sends the victim's browser to an
    // attacker hostname that resolves to this daemon, so Host carries a
    // name we never served. A bare IP literal can't be that name, so admit
    // IP literals, localhost, this machine's hostname and .local name, and
    // the user's extra list. A missing Host (HTTP/1.0 tools) is not a browser.
    static bool _isIpLiteral(const std::string& host)
    {
      if(host.empty()){
        return false;
      }
      in_addr v4;
      in6_addr v6;
      return inet_pton(AF_INET, host.c_str(), &v4) == 1
        || inet_pton(AF_INET6, host.c_str(), &v6) == 1;
    }


    static std::string _machineHostname()
    {
      char buffer[256] = {};
      if(::gethostname(buffer, sizeof(buffer) - 1) != 0){
        return "";
      }
      return _lowered(buffer);
    }


    static std::string _normalizedHost(std::string host)
    {
      host = _lowered(std::move(host));
      while(!host.empty() && host.back() == '.'){
        host.pop_back();
      }
      return host;
    }


    static bool _hostAllowed(const std::string& hostHeader, const std::unordered_set<std::string>& names)
    {
      std::string host = _normalizedHost(_hostPart(hostHeader));
      if(host.empty()){
        return false;
      }
      if(_isIpLiteral(host) || host == "localhost"){
        return true;
      }
      constexpr const char suffix[] = ".localhost";
      if(host.size() > sizeof(suffix) - 1
        && host.compare(host.size() - (sizeof(suffix) - 1), std::string::npos, suffix) == 0){
        return true;
      }
      return names.count(host) > 0;
    }


    static std::unordered_set<std::string> _allowedNames(const std::vector<std::string>& extraHosts)
    {
      std::unordered_set<std::string> names;
      std::string machine = _normalizedHost(_machineHostname());
      if(!machine.empty()){
        names.insert(machine);
        auto dot = machine.find('.');
        std::string shortName = dot == std::string::npos ? machine : machine.substr(0, dot);
        names.insert(shortName);
        names.insert(shortName + ".local");
      }
      for(const std::string& extra : extraHosts){
        std::string name = _normalizedHost(_hostPart(extra));
        if(!name.empty()){
          names.insert(name);
        }
      }
      return names;
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


    static bool _methodOf(const std::string& name, HttpMethod& method)
    {
      static const std::unordered_map<std::string, HttpMethod> table = {
        {"GET", HttpMethod::Get},
        {"HEAD", HttpMethod::Get},
        {"POST", HttpMethod::Post},
        {"PUT", HttpMethod::Put},
        {"DELETE", HttpMethod::Delete},
        {"PATCH", HttpMethod::Patch},
      };
      auto it = table.find(name);
      if(it == table.end()){
        return false;
      }
      method = it->second;
      return true;
    }


    // Aurora-5ipy.5: unknown verbs (OPTIONS etc.) count as writes.
    static AccessDecision _decide(const AccessGuard& guard, const httplib::Request& req)
    {
      AccessRequest access;
      access.method = HttpMethod::Post;
      _methodOf(req.method, access.method);
      access.path = req.path;
      access.remoteAddr = req.remote_addr;
      access.authorization = req.get_header_value("Authorization");
      access.cookie = req.get_header_value("Cookie");
      return guard.decide(access);
    }


    static Request _makeRequest(const httplib::Request& req, HttpMethod method, const std::shared_ptr<AccessGuard>& guard)
    {
      Request r;

      r.method = method;
      r.body = req.body;
      r.path = req.path;
      r.client = req.get_header_value("X-Aurora-Client");
      std::transform(r.client.begin(), r.client.end(), r.client.begin(),
        [](unsigned char c){ return static_cast<char>(std::tolower(c)); });

      if(guard){
        AccessDecision decision = _decide(*guard, req);
        r.remoteAddr = req.remote_addr;
        r.local = decision.local;
        r.scope = decision.scope;
      }

      for(const auto& [key, value] : req.path_params){
        r.pathParams[key] = value;
      }

      for(const auto& [key, value] : req.params){
        r.queryParams[key] = value;
      }

      return r;
    }


    static httplib::Server::Handler _wrapHandler(Handler handler, HttpMethod method, std::shared_ptr<AccessGuard> guard)
    {
      return [handler = std::move(handler), method, guard = std::move(guard)](const httplib::Request& req, httplib::Response& res){
        if(_crossOriginWrite(req, method)){
          res.status = 403;
          res.set_content("{\"succeeded\":false,\"error\":\"cross_origin_forbidden\"}", "application/json");
          return;
        }

        Request r = _makeRequest(req, method, guard);
        Response w;

        handler(r, w);

        res.status = w.status;
        for(const auto& [name, value] : w.headers){
          res.set_header(name, value);
        }
        res.set_content(w.body, w.contentType);
      };
    }


    class SinkStream final : public EventStream
    {
    public:
      SinkStream(httplib::DataSink& sink, const std::atomic<bool>& stopping):
      m_sink(sink),
      m_stopping(stopping)
      {
      }

      bool open() const override
      {
        return m_ok && !m_stopping.load() && m_sink.is_writable();
      }

      bool write(const std::string& text) override
      {
        if(m_ok){
          m_ok = m_sink.write(text.data(), text.size());
        }
        return m_ok;
      }

    private:
      httplib::DataSink& m_sink;
      const std::atomic<bool>& m_stopping;
      bool m_ok{true};
    };


    // Holds the stream's slot from the 200 until cpp-httplib destroys the
    // response, which is also when the worker is done with the connection.
    void _serveStream(const StreamHandler& handler, const httplib::Request& req, httplib::Response& res, const std::shared_ptr<AccessGuard>& guard)
    {
      const size_t previous = m_openStreams.fetch_add(1);
      if(previous >= m_maxStreams || m_stopping.load()){
        _releaseStream();
        res.status = 503;
        res.set_header("Retry-After", "3");
        res.set_content("{\"succeeded\":false,\"error\":\"too_many_streams\"}", "application/json");
        return;
      }

      res.set_header("Cache-Control", "no-store");
      res.set_chunked_content_provider(
        "text/event-stream",
        [this, handler, request = _makeRequest(req, HttpMethod::Get, guard)](size_t, httplib::DataSink& sink){
          SinkStream stream(sink, m_stopping);
          // Same as the browser default, stated so other SSE clients match it.
          stream.write("retry: 3000\n\n");
          handler(request, stream);
          sink.done();
          return true;
        },
        [this](bool){ _releaseStream(); }
      );
    }


    void _releaseStream()
    {
      {
        std::lock_guard<std::mutex> lock(m_streamsMutex);
        m_openStreams.fetch_sub(1);
      }
      m_streamsCv.notify_all();
    }


  public:
    ~Impl()
    {
      stop();
    }


    Impl(
      const std::vector<Route>& routes,
      const std::vector<StreamRoute>& streamRoutes,
      size_t workerThreads,
      size_t maxStreams,
      const std::optional<std::filesystem::path>& staticDir,
      const std::optional<std::unordered_map<std::string, std::string>>& embeddedFiles,
      const std::vector<std::pair<std::string, std::unordered_map<std::string, std::string>>>& prefixedEmbeddedFiles,
      const std::vector<std::string>& extraAllowedHosts,
      const std::shared_ptr<AccessGuard>& accessGuard
    )
    {
      m_service.emplace();

      // Explicit pool (cpp-httplib's own default is the same shape): every
      // open stream pins one worker, so size it here rather than inherit it.
      const size_t cores = std::thread::hardware_concurrency();
      const size_t baseWorkers = workerThreads > 0 ? workerThreads : std::max<size_t>(8, cores > 1 ? cores - 1 : 1);
      m_maxStreams = maxStreams > 0 ? maxStreams : std::max<size_t>(1, baseWorkers / 2);
      m_service->new_task_queue = [baseWorkers]{
        return new httplib::ThreadPool(baseWorkers, baseWorkers * 4);
      };

      // Runs before routing and the static mount, so no path is exempt.
      // Host check first, then the pairing guard when one is set.
      m_service->set_pre_routing_handler([names = _allowedNames(extraAllowedHosts), accessGuard](const httplib::Request& req, httplib::Response& res){
        if(req.has_header("Host") && !_hostAllowed(req.get_header_value("Host"), names)){
          res.status = 403;
          res.set_content("{\"succeeded\":false,\"error\":\"host_forbidden\"}", "application/json");
          return httplib::Server::HandlerResponse::Handled;
        }
        if(!accessGuard){
          return httplib::Server::HandlerResponse::Unhandled;
        }
        AccessDecision decision = _decide(*accessGuard, req);
        if(decision.result == AccessDecision::Result::Allow){
          return httplib::Server::HandlerResponse::Unhandled;
        }
        const bool unauthorized = decision.result == AccessDecision::Result::Unauthorized;
        res.status = unauthorized ? 401 : 403;
        res.set_content(
          unauthorized ? "{\"succeeded\":false,\"error\":\"pairing_required\"}"
                       : "{\"succeeded\":false,\"error\":\"insufficient_scope\"}",
          "application/json"
        );
        return httplib::Server::HandlerResponse::Handled;
      });

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
        auto wrapped = _wrapHandler(route.handler, route.method, accessGuard);
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

      for(const auto& route : streamRoutes){
        m_service->Get(route.path, [this, handler = route.handler, accessGuard](const httplib::Request& req, httplib::Response& res){
          _serveStream(handler, req, res, accessGuard);
        });
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

      // Streams watch m_stopping; wait them out so the server is not
      // destroyed under a worker still inside a handler.
      m_stopping.store(true);
      m_service->stop();
      {
        std::unique_lock<std::mutex> lock(m_streamsMutex);
        m_streamsCv.wait_for(lock, std::chrono::seconds(5), [this]{ return m_openStreams.load() == 0; });
      }
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


    int bindToAnyPort(const std::string& boundAddress)
    {
      return m_service->bind_to_any_port(boundAddress);
    }


    bool listen()
    {
      if(!m_service){
        return false;
      }

      return m_service->listen_after_bind();
    }

    std::atomic<bool> m_stopping{false};
    std::atomic<size_t> m_openStreams{0};
    size_t m_maxStreams{0};
    std::mutex m_streamsMutex;
    std::condition_variable m_streamsCv;

    std::optional<httplib::Server> m_service;
  };
}
