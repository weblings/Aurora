#pragma once

#include <filesystem>

namespace Aurora::Network::Http::Server { class HttpServer; }

// The two routes that talk only to PipelineHost, once copied into every
// app's main.cpp (Aurora-9ig moved them here with Pipeline itself).
namespace Aurora::Runtime
{
  class PipelineHost;
  class Registry;

  // GET /api/monitors: the live video input's monitor list. Empty in audio
  // mode or with no pipeline -- not an error.
  void registerMonitorsRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost
  );

  // POST /api/reload: reloads Config from disk into the pipeline, answering
  // {"succeeded": true}, or 500 with {"succeeded": false, "error": ...}.
  void registerReloadRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  );
}
