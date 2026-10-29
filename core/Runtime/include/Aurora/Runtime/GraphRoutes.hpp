#pragma once

#include <filesystem>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Read-only node-graph routes (Sequence B, Aurora-id8j.2). Both sit behind
// the server's Host allowlist like every other route.
namespace Aurora::Runtime
{
  class PipelineHost;
  class Registry;

  // GET /api/nodes: {"nodes": [{type, purpose, useWhen, example, cost,
  // inputs: [{name, type, required}], outputs: [{name, type}], params:
  // [{name, kind, description, label?, min?, max?, step?, unit?, default,
  // allowsUnset?, options?}], sink?: <binding param>}]} for every
  // registered node type, in registration order. Static per build: the
  // catalog is built once from the same registrations the runner uses
  // (audio nodes only in audio builds).
  void registerNodesRoute(Aurora::Network::Http::Server::HttpServer& server);

  // Same route, but the "output" enum param (output.send, zones.sample,
  // frame.smooth) lists the outputs a graph load accepts (graphOutputNames:
  // the saved Config's, else every registered one), filled in per request
  // since outputs register after startup. The catalog is otherwise as above.
  // `registry` must outlive the server. /api/v1/nodes aliases this route.
  void registerNodesRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    const Registry& registry,
    const std::filesystem::path& configRoot
  );

  // GET /api/graph: {"graph": <graph.json doc>} for the running pipeline,
  // or {"graph": null} when none runs (idle, failed or paused), which is
  // not an error. The doc is the built-in graph with the current Config
  // overlay applied, ready to feed back into the loader.
  void registerGraphRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost
  );
}
