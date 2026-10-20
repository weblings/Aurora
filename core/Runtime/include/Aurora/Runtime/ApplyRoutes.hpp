#pragma once

#include <filesystem>
#include <functional>
#include <memory>
#include <string>

#include <nlohmann/json.hpp>

namespace Aurora::Network::Http::Server { class AccessGuard; class HttpServer; }

// Apply a draft as the live effect (Aurora-52oz.4).
namespace Aurora::Runtime
{
  class DraftStore;
  class PipelineHost;
  class Registry;

  // POST /api/graph/apply needs `apply` (LAN only, loopback is trusted).
  void addApplyAccessRules(Aurora::Network::Http::Server::AccessGuard& guard);

  // POST /api/graph/apply {"session": string, "id": string}: validates the
  // session's draft, writes it to effects/<id>.json (a new id or an existing
  // one), sets activeEffectId to id, then runs `applyLive`. The draft is kept.
  // `applyLive` returns "" or an error, like onConfigChanged. Production wires
  // applyEffectFromDisk: a graph that keeps the same inputs and outputs is
  // swapped into the running pipeline with node state kept, anything else
  // reloads. Calls are coalesced like settings saves (Aurora-5ipy.8).
  //
  // Answers {"succeeded": true, "id", "activeEffectId", "effect",
  // "requestedEffect"} plus "reloadError" if applying failed after the save.
  // "effect" differs from "id" when the graph could not run (a held
  // effect_fallback error says why). Refusals change nothing on disk or live:
  // 400 "invalid_body" / "invalid_session" / "invalid_effect_id" (ids are
  // [a-z0-9][a-z0-9_-]{0,63}, so built-in ids never qualify), 404 "no_draft",
  // 422 "invalid_graph" with "valid": false and "errors" as the draft routes
  // report them, 500 "write_failed".
  // The apply itself, shared with test-on-lights confirm: fills `body` and
  // returns the HTTP status the route answers with.
  using ApplyDraftFn = std::function<int(const std::string& session, const std::string& id, nlohmann::json& body)>;

  ApplyDraftFn registerApplyRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<DraftStore> drafts,
    std::function<std::string()> applyLive,
    Aurora::Network::Http::Server::AccessGuard* guard = nullptr
  );
}
