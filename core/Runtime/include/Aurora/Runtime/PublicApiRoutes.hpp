#pragma once

#include <filesystem>
#include <memory>

namespace Aurora::Network::Http::Server { class AccessGuard; class HttpServer; }

namespace Aurora::Runtime
{
  class LightTest;
  class PipelineHost;
  class Registry;
  class ReloadCoalescer;

  // The one registration call for the public /api/v1 surface (Aurora-5ipy.39),
  // made by every app main so later v1 routes land here and not in three mains.
  // `reload` is the host's shared coalescer. Registers nothing yet.
  void registerPublicApiRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<ReloadCoalescer> reload,
    std::shared_ptr<LightTest> lightTest,
    Aurora::Network::Http::Server::AccessGuard* guard
  );
}
