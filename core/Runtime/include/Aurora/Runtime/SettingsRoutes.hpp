#pragma once

#include <filesystem>
#include <functional>
#include <memory>
#include <string>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Generic settings REST endpoints over Config's user-facing fields -- not
// restServerPort/boundBackendIP, which are read once before the server binds
// and couldn't take effect from a request reaching this route anyway. See
// docs/WebUI/WebUI_Design_1stPass.md's build-order step 11.
//
// GET /api/config returns the full current persisted config as JSON.
// PUT /api/config merges only the fields present in the request body --
// deliberately PATCH-style semantics despite the PUT verb, since asking a
// caller to resend all ~19 fields to change one slider would be painful.
// Each field funnels through Config's own setter, so existing clamping
// (e.g. transitionSmoothing to [0, 0.97]) applies with no duplicated
// validation here.
//
// Persists via a fresh ConfigStore(configRoot). `reload`, if given, runs after
// every successful save ("every settings PUT funnels into the reload entrypoint"
// per this step's own build-order line). Deliberately injected rather than this
// module owning reload logic: the pipeline being reloaded is an app-layer
// concept. Its reload returns "" on success or an error message, which is
// reported distinctly from a save failure (the save itself succeeded).
//
// Writes are ConfigStore::update(), atomic against Pipeline::build's own
// derived-rate save. `reload` is the host's one ReloadCoalescer (Aurora-5ipy.8),
// shared with the effects and v1 routes: never concurrent, at most one queued
// behind the one in flight, so its reload must load config fresh from disk. A
// queued run covers every write before it starts and its waiting PUTs all
// receive its result.
//
// onEffectChosen, if given, runs after that for a PUT naming activeEffectId
// (the Dashboard's Video/Audio toggle), even when the value is unchanged.
namespace Aurora::Runtime
{
  class ReloadCoalescer;

  void registerSettingsRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    const std::filesystem::path& configRoot,
    std::shared_ptr<ReloadCoalescer> reload = {},
    std::function<void()> onEffectChosen = {}
  );
}
