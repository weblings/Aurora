#pragma once

#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Network/Http/Server/HttpDataStructs.hpp>

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

    bool listen();

    bool stop();

    void addRoute(
      HttpMethod method,
      const std::string& path,
      Handler handler
    );

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

  private:
    std::unique_ptr<Impl> m_httpServerImpl;
    std::vector<Route> m_routes;
    std::optional<std::filesystem::path> m_staticDir;
    std::optional<EmbeddedFiles> m_embeddedFiles;
  };
}
