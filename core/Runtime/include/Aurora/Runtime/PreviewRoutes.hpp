#pragma once

#include <chrono>
#include <functional>
#include <memory>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Draft preview stream (Aurora-52oz.6).
namespace Aurora::Runtime
{
  class DraftStore;
  class PipelineHost;
  class Registry;

  struct PreviewOptions
  {
    std::chrono::milliseconds interval{66}; // about 15 Hz
    std::chrono::milliseconds heartbeat{15000};
    // Waits one sampling step of the summary route. Tests swap in a function
    // that ticks the pipeline instead of sleeping.
    std::function<void(std::chrono::milliseconds)> sleep;
    double maxSummarySeconds{10.0};
  };

  // GET /api/graph/preview?session=<id> (text/event-stream, read scope, counted
  // against the event-stream cap). Runs that session's draft beside the live
  // graph, sharing the inputs (a source the live pipeline lacks opens for the
  // preview alone and closes with it), with every output.send swapped for a sink that
  // never reaches an output. Edits to the draft show up in the stream without
  // reconnecting. A second stream for the same session replaces the first.
  //
  // event: preview, sent when the colors change, at most once per interval
  // and always the latest value (nothing queues):
  //   {"session", "tickMs", "outputs": [{"output", "zones": [{"id", "r", "g",
  //   "b", "error"}]}], "errors": [{"output", "node", "message"}]}
  // r, g, b are 0..1. A zone whose graph failed is magenta with "error": true
  // so a client can add a pattern.
  //
  // event: error {"error", "message"}: "invalid_session", "no_draft",
  // "cannot_preview" (stream ends) or "draft_invalid" (the last good graph
  // keeps running). event: ended {"reason"}: "draft_deleted", "pipeline_gone"
  // or "replaced".
  //
  // GET /api/graph/preview/summary?session=<id>&seconds=<n> (read scope). A
  // one-shot answer for a client that cannot read the stream: runs the draft's
  // preview for n seconds (default 3, at most maxSummarySeconds, sampled each
  // interval) on a preview of its own, so an open stream for the session is
  // left alone. 200:
  //   {"session", "seconds", "samples", "outputs": [{"output", "change",
  //   "zones": [{"id", "mean": {"r","g","b"}, "brightnessMin", "brightnessMax",
  //   "change", "error"}]}], "errors": [{"output", "node", "message"}]}
  // Colors and brightness (the largest channel) are 0..1. change is the mean
  // absolute step per sample across r, g and b, so near 0 means a frozen
  // effect. An output's change is its largest zone change. Errors:
  // 400 "invalid_session" or "invalid_seconds", 404 "no_draft", 422
  // "cannot_preview" (message), 409 "pipeline_gone".
  void registerPreviewRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    const Registry& registry,
    std::shared_ptr<DraftStore> drafts,
    PreviewOptions options = {});
}
