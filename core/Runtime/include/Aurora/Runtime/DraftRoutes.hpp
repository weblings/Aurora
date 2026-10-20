#pragma once

#include <filesystem>
#include <memory>

#include <Aurora/Runtime/DraftStore.hpp>

namespace Aurora::Network::Http::Server { class AccessGuard; class HttpServer; }

// Draft and validate routes (Aurora-52oz.3). A draft is a graph.json doc held
// per client session id, never applied by these routes.
namespace Aurora::Runtime
{
  class Registry;

  // Writes under both prefixes need `draft` (LAN only, loopback is trusted).
  // Reads of a draft keep the default `read` requirement.
  void addDraftAccessRules(Aurora::Network::Http::Server::AccessGuard& guard);

  // Every answer reports validation as "valid": bool and "errors": [{"node":
  // id or null, "message"}], listing every problem the loader found. The
  // checks match what loading the effect would run, including the app's
  // current output names.
  //
  // PUT /api/graph/drafts/<session> {"graph": {...}}: saves the draft even when
  // it is invalid. Answers {"succeeded": true, "session", "valid", "errors"}.
  // 400 "invalid_session" / "invalid_body" (not JSON, or "graph" is not an
  // object), 413 "draft_too_large", 429 "too_many_drafts".
  //
  // GET /api/graph/drafts/<session>: {"session", "graph", "valid", "errors"}
  // re-validated now. 404 "no_draft", 400 "invalid_session".
  //
  // DELETE /api/graph/drafts/<session>: {"succeeded": true, "deleted": session}.
  // 404 "no_draft".
  //
  // POST /api/graph/validate {"graph": {...}}: validates without storing.
  // Answers {"valid", "errors"}. 400 "invalid_body", 413 "draft_too_large".
  //
  // Returns the store so later routes (apply, preview) read the same drafts.
  std::shared_ptr<DraftStore> registerDraftRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    Aurora::Network::Http::Server::AccessGuard* guard = nullptr,
    DraftLimits limits = {},
    DraftStore::Clock clock = {}
  );
}
