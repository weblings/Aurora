#pragma once

#include <filesystem>
#include <functional>
#include <string>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Generic settings REST endpoints over Config's user-facing fields -- not
// restServerPort/boundBackendIP, which are read once before the server binds
// and couldn't take effect from a request reaching this route anyway. See
// Analysis/WebUIAnalysis.md's build-order step 11.
//
// GET /api/config returns the full current persisted config as JSON.
// PUT /api/config merges only the fields present in the request body --
// deliberately PATCH-style semantics despite the PUT verb, since asking a
// caller to resend all ~19 fields to change one slider would be painful.
// Each field funnels through Config's own setter, so existing clamping
// (e.g. transitionSmoothing to [0, 0.97]) applies with no duplicated
// validation here.
//
// Persists via a fresh ConfigStore(configRoot). onConfigChanged, if given, is
// called after every successful save -- "every settings PUT funnels into the
// reload entrypoint" per this step's own build-order line. Deliberately a
// callback rather than this module owning reload logic directly: the actual
// pipeline being reloaded (Registry, Input/Output/Orchestrator) is an
// app-layer concept core::Runtime has no business knowing about. Returns an
// empty string on success or an error message on failure; a failure here
// means the save succeeded but the live pipeline couldn't pick it up --
// reported back distinctly, not conflated with a save failure.
namespace Aurora::Runtime
{
  void registerSettingsRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    const std::filesystem::path& configRoot,
    std::function<std::string()> onConfigChanged = {}
  );
}
