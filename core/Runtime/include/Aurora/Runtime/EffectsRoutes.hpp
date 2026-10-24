#pragma once

#include <filesystem>
#include <functional>
#include <string>

namespace Aurora::Network::Http::Server { class AccessGuard; class HttpServer; }

// Custom effect routes (Aurora-52oz.1). Effects are graph files under
// <configRoot>/effects/, selected by Config's activeEffectId.
namespace Aurora::Runtime
{
  class PipelineHost;
  class Registry;

  // Reads need `read`, the switch needs `apply`, delete needs `admin` (LAN
  // only, loopback is trusted). The PUT shares /api/effects with the GETs and
  // is told apart by method.
  void addEffectsAccessRules(Aurora::Network::Http::Server::AccessGuard& guard);

  // GET /api/effects: {"effects": [{"id", "builtin", "title", "description"}], "activeEffectId":
  // string (the saved setting, "" when unset), "effect": running id or null,
  // "requestedEffect": id or null}. Built-ins come first, then customs by id.
  // "title" is the graph's top-level title, else the id; "description" is the
  // graph's, else null (Aurora-mfud).
  //
  // GET /api/effects/<id>: {"id", "builtin", "graph": <graph.json doc>}. A
  // built-in's doc is the one the running pipeline would build from the
  // current Config. 404 {"error": "unknown_effect"}; 422 {"error":
  // "unreadable_effect"} when the file exists but is not valid JSON.
  //
  // PUT /api/effects {"activeEffectId": string}: the switch. "" or a built-in
  // id runs the mode's built-in (the mode itself still follows the active
  // inputs), anything else must be an existing custom effect (404
  // "unknown_effect"; 400 "invalid_body"). Saves, then reloads through
  // onConfigChanged. A custom that exists but fails to load still answers
  // 200: the built-in runs and /api/state holds the effect_fallback error.
  // Answers {"succeeded": true, "activeEffectId", "effect", "requestedEffect"}
  // plus "reloadError" if the reload failed. With X-Aurora-Client: mcp and a
  // custom id, the id also becomes Config's mcpEffectId.
  //
  // DELETE /api/effects/<id>: removes a custom effect. When it was the active
  // one, activeEffectId is cleared first and the pipeline reloads onto the
  // built-in ("fellBack": true); it also clears mcpEffectId when that named it. 400 "builtin_effect" for a built-in, 404
  // "unknown_effect". Answers {"succeeded": true, "deleted": id, "fellBack":
  // bool} plus "reloadError".
  //
  // Writing a graph file is not a route here: it is POST /api/graph/apply
  // (ApplyRoutes.hpp). When `guard` is set the access rules are added to it.
  void registerEffectsRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::function<std::string()> onConfigChanged,
    Aurora::Network::Http::Server::AccessGuard* guard = nullptr
  );
}
