#pragma once

#include <filesystem>
#include <functional>
#include <string>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Bridge-pairing HTTP routes (discover/validate/register/list configs/save),
// modeled on huenicorn's SetupBackend -- see Analysis/WebUI/WebUI_Design_1stPass.md's
// build-order step 5. Deliberately stateless, unlike huenicorn's CoreService:
// each call carries the bridge/credentials it needs in its own request body
// rather than the server holding pairing-in-progress state between calls.
// CredentialsStore(configRoot) is only written by the final "save" step.
//
// onConnectionChanged mirrors SettingsRoutes' onConfigChanged -- called after
// POST /api/hue/connection persists successfully, so an already-registered
// "hue" output picks up a changed entertainmentConfigurationId (e.g. Zone
// Mapping's picker) without a process restart. registry.registerOutput's
// factory must itself re-read CredentialsStore fresh per call for this to
// have any effect -- see registerOutputs() in main.cpp.
//
// Only declared here; only compiled into AuroraOutputHue when
// AURORA_OUTPUT_HUE_ENABLE_IO is on (needs ApiTools/HttpClient, i.e. curl).
// Guard the #include and call the same way main.cpp already guards
// HueOutput.hpp/CredentialsStore.hpp, with AURORA_OUTPUT_HUE_IO_AVAILABLE.
namespace Aurora::Output::Hue
{
  void registerPairingRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    const std::filesystem::path& configRoot,
    std::function<std::string()> onConnectionChanged = {}
  );
}
