#pragma once

#include <filesystem>
#include <memory>

#include <Aurora/Runtime/ApplyRoutes.hpp>
#include <Aurora/Runtime/LightTest.hpp>

namespace Aurora::Network::Http::Server { class AccessGuard; class HttpServer; }

// Test on lights (Aurora-52oz.5).
namespace Aurora::Runtime
{
  class DraftStore;
  class PipelineHost;
  class Registry;

  // Every write under /api/graph/test needs `apply` (LAN only, loopback is
  // trusted). GET /api/graph/test keeps the default `read` requirement.
  void addTestAccessRules(Aurora::Network::Http::Server::AccessGuard& guard);

  // The draft of a session replaces the live effect on the real outputs, in
  // place. One slot: a new test ends the one running. The server puts the
  // live effect back (read fresh from disk) on an explicit revert, once the
  // confirm window passes, or when heartbeats stop, so a closed tab cannot
  // strand the lights. A pause, or any rebuild of the pipeline, also ends the
  // test: the new pipeline starts from disk. Nothing is written to disk.
  //
  // POST /api/graph/test {"session"}: starts a test of that session's draft.
  // Answers {"succeeded": true, "confirmWithinMs", "heartbeatMs",
  // "revertAfterMs"}. 400 "invalid_body" / "invalid_session", 404 "no_draft",
  // 422 "invalid_graph" (as the draft routes report it), 409 "cannot_test"
  // when the running pipeline cannot take the graph in place (paused, other
  // inputs or outputs, or the dev dual-capture spike). Errors on the lights
  // leave a failing node on its last good value.
  //
  // POST /api/graph/test/heartbeat {"session"}: {"succeeded": true,
  // "confirmRemainingMs"}. 404 "no_test" when that session has none running
  // (it ended, was replaced or never started).
  //
  // POST /api/graph/test/revert {"session"}: {"succeeded": true} once the live
  // effect is back, plus "revertError" if putting it back failed. 404 "no_test".
  //
  // POST /api/graph/test/confirm {"session", "id"}: the tested draft becomes
  // the live effect exactly like POST /api/graph/apply, and the test ends
  // without a revert. 404 "no_test", 409 "draft_changed" when the draft is no
  // longer the graph under test, else apply's answers.
  //
  // GET /api/graph/test: {"active", "confirmRemainingMs", "revertAfterMs",
  // "lastEnd"} (lastEnd names why the previous test ended, or null).
  //
  // `watchdog` false leaves deadlines to be enforced by poll() on the returned
  // LightTest (tests with a fake clock).
  std::shared_ptr<LightTest> registerTestRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot,
    std::shared_ptr<DraftStore> drafts,
    ApplyDraftFn applyDraft,
    Aurora::Network::Http::Server::AccessGuard* guard = nullptr,
    LightTestOptions options = {},
    LightTest::Clock clock = {},
    bool watchdog = true
  );
}
