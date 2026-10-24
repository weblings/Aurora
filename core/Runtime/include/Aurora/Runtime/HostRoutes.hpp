#pragma once

#include <functional>
#include <string>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Routes every app host answers identically bar a few parameters (Aurora-5ipy.24).
// They were copied into each app's main.cpp, out of reach of core tests.
namespace Aurora::Runtime
{
  class PipelineHost;
  class Registry;

  // GET /api/capabilities: {"inputs", "audioInputs", "outputs", "zeroOffOutputs",
  // "platform", "paused"}. The contract is "compiled with", not "already
  // paired": with `hueCompiledIn` "hue" is listed in outputs even before
  // credentials register it. `platform` is a literal per host binary.
  // Reads only lock-free state, so it can be registered before Config loads.
  void registerCapabilitiesRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    const Registry& registry,
    const PipelineHost& pipelineHost,
    std::string platform,
    bool hueCompiledIn
  );

  // GET /api/version: {"version"}, the superbuild VERSION baked in as
  // AURORA_VERSION (or "dev" for standalone slice configures).
  void registerVersionRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    std::string version
  );

  // POST /api/stop: answers {"succeeded": true} and calls `requestStop`, which
  // sets the host's stop flag so it exits through its normal shutdown path.
  // Stops the whole process, not a pause (PUT /api/state pauses).
  void registerStopRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    std::function<void()> requestStop
  );
}
