#pragma once

#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <Aurora/Network/Http/Server/HttpDataStructs.hpp>
#include <Aurora/Network/Http/Server/Pairing.hpp>

// Pimpl facade over cpp-httplib -- callers (route-definition classes, e.g. a
// future SetupBackend/SettingsBackend) never include <httplib.h> or see its
// types, only HttpDataStructs.hpp's plain Request/Response/Handler. Register
// every route and call serveStaticFiles() before bind(); both are captured
// and handed to Impl's constructor there. See docs/HttpServerAnalysis.md
// for why this shape (and the dedicated-thread + static-mount-point choices
// below) was carried over from huenicorn's own real implementation.
namespace Aurora::Network::Http::Server
{
  class Impl;


  class HttpServer
  {
  public:
    HttpServer();
    ~HttpServer();

    // listen() blocks the calling thread until stop() is called from
    // elsewhere -- run it on its own thread, never the tick-loop thread.
    bool bind(
      const std::string& boundAddress,
      unsigned port
    );

    // Binds an OS-assigned free port and returns it, or -1 on failure.
    // Tests use it so parallel ctest processes never collide (Aurora-lby1).
    int bindToAnyPort(const std::string& boundAddress);

    bool listen();

    bool stop();

    void addRoute(
      HttpMethod method,
      const std::string& path,
      Handler handler
    );

    // A GET route answering text/event-stream (Aurora-5ipy.3). The handler
    // runs on a server worker for the life of the connection and returns
    // when open() goes false. Streams past the cap from setStreamLimits get
    // 503 {"error":"too_many_streams"}; stop() waits for open streams to
    // return. Call before bind().
    void addStreamRoute(
      const std::string& path,
      StreamHandler handler
    );

    // Worker pool size and the most streams open at once (each holds a
    // worker for its whole life, so the cap must stay below the pool or
    // plain routes starve). 0 picks the defaults: max(8, cores - 1)
    // workers, growing to 4x under load, and half of the base for streams.
    // Call before bind().
    void setStreamLimits(size_t workerThreads, size_t maxStreams);

    // Serves plain files under `directory` at the request path they share a
    // suffix with (cpp-httplib's own mount-point semantics) -- e.g. a
    // `directory/app.js` answers a GET for `/app.js`. Must be called before
    // bind(); huenicorn's own webroot/ is embeddable into the binary for
    // release builds (config/EmbeddedWebrootFiles.hpp.in) -- deliberately not
    // carried over here, out of scope for this skeleton.
    void serveStaticFiles(const std::filesystem::path& directory);

    // Build-time embedded webroot (StandaloneApps P1): keys are webroot-
    // relative paths with forward slashes (e.g. "index.html",
    // "styles/shell.css"), values are raw file bytes. Served as a fallback
    // GET route registered after every API route, so API routes always win
    // ties. Set either this or serveStaticFiles(), not both -- main.cpp
    // picks exactly one via the env-override > source-dir > embedded probe
    // order, keeping the dev hot-edit loop on the source dir.
    using EmbeddedFiles = std::unordered_map<std::string, std::string>;
    void serveEmbeddedFiles(EmbeddedFiles files);

    // A second embedded map under its own URL prefix (e.g. "/graph-editor",
    // Aurora-lzj). Unlike serveEmbeddedFiles(), this works alongside either
    // serving mode, since its routes only answer under the prefix. A
    // trailing-slash path serves that directory's index.html, and the bare
    // prefix redirects to prefix + "/". Call once per prefix, before bind().
    void serveEmbeddedFilesAt(const std::string& prefix, EmbeddedFiles files);

    // Host header allowlist (DNS-rebinding defense, Aurora-5ipy.4). IP
    // literals, localhost, *.localhost and this machine's hostname/.local
    // name always pass; names added here pass too. AURORA_ALLOWED_HOSTS
    // (comma-separated) is merged in at bind(). Call before bind().
    void setExtraAllowedHosts(std::vector<std::string> hosts);

    // LAN pairing (Aurora-5ipy.5): runs after the Host check and before
    // routing, so no path is exempt unless a guard rule opens it. Without a
    // guard every caller is trusted. Call before bind().
    void setAccessGuard(std::shared_ptr<AccessGuard> guard);

  private:
    void makeImpl();

    std::unique_ptr<Impl> m_httpServerImpl;
    std::vector<Route> m_routes;
    std::vector<StreamRoute> m_streamRoutes;
    size_t m_workerThreads{0};
    size_t m_maxStreams{0};
    std::optional<std::filesystem::path> m_staticDir;
    std::optional<EmbeddedFiles> m_embeddedFiles;
    std::vector<std::pair<std::string, EmbeddedFiles>> m_prefixedEmbeddedFiles;
    std::vector<std::string> m_extraAllowedHosts;
    std::shared_ptr<AccessGuard> m_accessGuard;
  };
}
