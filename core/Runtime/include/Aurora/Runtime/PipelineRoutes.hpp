#pragma once

#include <filesystem>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Routes that talk only to PipelineHost. The first two were once copied
// into every app's main.cpp (Aurora-9ig moved them here with Pipeline).
namespace Aurora::Runtime
{
  class PipelineHost;
  class Registry;

  // GET /api/monitors: the live video input's monitor list. Empty in audio
  // mode or with no pipeline -- not an error.
  void registerMonitorsRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost
  );

  // POST /api/reload: reloads Config from disk into the pipeline, answering
  // {"succeeded": true}, or 500 with {"succeeded": false, "error": ...}.
  void registerReloadRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  );

  // GET /api/state (Aurora-kea, Aurora-d3ec): {"state", "errors", "paused",
  // "usesVideoInput", "usesAudioInput", "samplesZones", "audioDevicesUrl"
  // (string or null)}. state is idle|running|paused|failed (clients ignore
  // values they do not know); errors is an array of {"source", "message"}
  // read in the same snapshot as state, empty unless a build failed with no
  // pipeline to fall back on (host failed, or paused after a failed resume).
  // The flags describe what the running pipeline uses, kept through pause;
  // all false means nothing runs. Aurora-5ipy.2 extends this route.
  //
  // PUT /api/state {"running": bool}: pause (false) or resume (true),
  // idempotent (Aurora-3ddb); on a failed host running:true is a retry
  // (rebuild, like POST /api/reload). Answers {"succeeded": true, "running":
  // bool (state is running), "state"}, 400 on a bad body, 409
  // {"succeeded": false, "error": "nothing_to_pause"} when the host is idle
  // or failed, or on a failed build 500 {"succeeded": false, "error": ...}
  // (a paused host stays paused).
  void registerStateRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  );
}
