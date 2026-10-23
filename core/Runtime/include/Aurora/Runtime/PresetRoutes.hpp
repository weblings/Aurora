#pragma once

#include <filesystem>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Starter graphs for clients that write graphs (Aurora-4xqt.8). Each preset is
// filled with the user's output names, so every client gets the same graph.
namespace Aurora::Runtime
{
  class Registry;

  // GET /api/graph/presets: {"presets": [{"id", "title", "description",
  // "inputs": ["video"|"audio"], "controls": [label]}]}. Presets whose node
  // types are not registered (audio nodes in a no-audio build) are left out.
  //
  // GET /api/graph/presets/<id>: {"id", "title", "description", "inputs",
  // "outputs": [name], "graph": <graph.json doc>, "valid", "errors"}, the
  // graph built for the app's current outputs (the saved Config's, else every
  // registered one) and validated like a draft. 404 "unknown_preset", 409
  // "no_outputs". Read scope, nothing is stored.
  void registerPresetRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    const Registry& registry,
    const std::filesystem::path& configRoot
  );
}
