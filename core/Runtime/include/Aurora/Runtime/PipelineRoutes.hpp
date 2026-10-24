#pragma once

#include <chrono>
#include <filesystem>
#include <memory>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Routes that talk only to PipelineHost. The first two were once copied
// into every app's main.cpp (Aurora-9ig moved them here with Pipeline).
namespace Aurora::Runtime
{
  class LightTest;
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
  // "effectTitle" and "effectDescription" (Aurora-mfud) are the running
  // effect's picker text (title falls back to the id, description to null).
  // The flags describe what the running pipeline uses, kept through pause;
  // all false means nothing runs.
  // "mcpEffectId" (Aurora-4xqt.2) is the custom effect an MCP client applied
  // last, null until one has.
  // Aurora-5ipy.2 adds "effect" (the running graph id: "builtin.video",
  // "builtin.audio" or a custom effect's id, null when idle or failed),
  // Aurora-52oz.1 adds "requestedEffect" (what Config asked for; it differs
  // from "effect" while a custom effect that failed to load is replaced by
  // the built-in, with an "effect_fallback" error held) and "source": {"video":
  // {"input", "monitor" (string or null)} or null, "audio": {"input", "sink"
  // (string or null), "auto" (follows the default sink)} or null}. A null side
  // is unused. Kept through pause; "sink" is the platform-resolved sink while
  // running where the build can tell (Linux), else the configured target.
  // Aurora-zfre adds "test": {"active", "confirmRemainingMs"}, the test on
  // lights from `lightTest` (inactive without one); "effect" keeps naming the
  // live effect the test will revert to.
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
    const std::filesystem::path& configRoot,
    std::shared_ptr<LightTest> lightTest = nullptr
  );

  // GET /api/events?topics=state,health (Aurora-5ipy.3): one text/event-stream
  // for every live topic (browsers cap ~6 connections per host), default all.
  // Each event is "event: <topic>\ndata: <json>\n\n"; unknown topics are
  // ignored. "state" carries exactly the GET /api/state document and "health"
  // its {"errors", "conditions"} part, each sent first on connect (so clients
  // can skip the GET and nothing is lost between GET and subscribe), then
  // again only when it changed. A ": ping" comment every `heartbeat` makes a
  // dead client's write fail so it frees its worker. Streams past the
  // server's cap answer 503 {"error": "too_many_streams"}. Changes are
  // pushed by PipelineHost::changes(), never from the tick loop; brightness
  // is re-read from config.json about once a second, as is the light test, so
  // a running test sends its countdown about once a second.
  void registerEventsRoute(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const std::filesystem::path& configRoot,
    std::chrono::milliseconds heartbeat = std::chrono::seconds(15),
    std::shared_ptr<LightTest> lightTest = nullptr
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
