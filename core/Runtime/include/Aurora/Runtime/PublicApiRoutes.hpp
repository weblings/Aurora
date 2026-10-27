#pragma once

#include <filesystem>
#include <memory>
#include <string>

#include <nlohmann/json.hpp>

#include <Aurora/Runtime/PipelineRoutes.hpp>

namespace Aurora::Network::Http::Server { class AccessGuard; class HttpServer; }

namespace Aurora::Runtime
{
  class DescriptorRegistry;
  class LightTest;
  class PipelineHost;
  class Registry;
  class ReloadCoalescer;

  // What the host binary knows and the core cannot: the v1 capabilities,
  // version and descriptors routes report it.
  struct PublicApiInfo
  {
    std::string platform;
    std::string appVersion;
    bool hueCompiledIn{};
    bool canSelectMonitor{};
    const DescriptorRegistry* descriptors{};
  };

  // The v1 state document: the internal state trimmed to what adapters may
  // rely on, plus configuredInputs, with brightness as 0 to 100 percent.
  nlohmann::json v1StateToJson(const StateSnapshot& snapshot);

  // The one registration call for the public /api/v1 surface (Aurora-5ipy.39),
  // made by every app main so later v1 routes land here and not in three mains.
  // `reload` is the host's shared coalescer.
  //
  // Read routes (Aurora-5ipy.40), all Read scope: GET state, events (topics
  // state and health, as /api/events), capabilities, version ({"version",
  // "apiVersion"}), effects, effects/:id and descriptors. They answer the
  // internal documents bar the v1 state, so the spec in docs/api/openapi.yaml
  // is the contract and these are thin.
  void registerPublicApiRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<ReloadCoalescer> reload,
    std::shared_ptr<LightTest> lightTest,
    Aurora::Network::Http::Server::AccessGuard* guard,
    PublicApiInfo info
  );
}
