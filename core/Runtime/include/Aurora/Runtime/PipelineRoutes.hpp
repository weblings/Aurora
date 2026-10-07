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
  // read in the same snapshot as state. An entry is {"source", "message",
  // "id"}; id is stamped when the entry is created or replaced. A running
  // host holds errors too (a reload that failed while the old pipeline kept
  // going, Aurora-ja76), so a non-empty list does not mean failed: read
  // state. A paused host holds only a failed resume.
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
  //
  // POST /api/state/dismiss {"source": string, "id": number} (Aurora-ja76):
  // the banner's X. Removes that entry only if its id still matches and the
  // host is running: 200 {"succeeded": true, "dismissed": true}; 200
  // "dismissed": false for a stale id (already gone or replaced, nothing
  // changes); 409 {"error": "not_running"} when paused, failed or idle (those
  // errors are the reason, not noise); 400 on a bad body.
  void registerStateRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    const std::filesystem::path& configRoot
  );

  // POST /api/dev/errors {"source": string, "message": string} (dev-only):
  // injects a generic host error through PipelineHost::setError, so the
  // shell banner's one- and two-row layouts can be exercised without
  // breaking the real pipeline (unlike the input-config recipes in
  // docs/lessons/output.md). Any non-empty source string works; unknown
  // sources render their message bare (shell.js's SOURCE_PREFIX). Answers
  // 200 {"succeeded": true}; 409 {"succeeded": false, "error":
  // "not_running"} when the host has no pipeline or is paused (setError's
  // own rule); 400 on a bad body.
  //
  // POST /api/dev/errors/remove {"source": string} (dev-only): removes that
  // entry again through PipelineHost::removeError. Answers 200
  // {"succeeded": true, "removed": bool}; 400 on a bad body.
  //
  // Both routes only exist when AURORA_DEV_ERRORS is set (presence-only,
  // same convention as AURORA_DEV_LIGHT_TAP): without it they stay
  // unregistered and answer 404, so no production traffic can reach them.
  // Every app main registers this next to registerStateRoute, which keeps
  // the tooling cross-platform by construction.
  void registerDevErrorsRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost
  );
}
