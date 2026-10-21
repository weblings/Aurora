#pragma once

#include <chrono>
#include <memory>

namespace Aurora::Network::Http::Server { class HttpServer; }

// Draft preview stream (Aurora-52oz.6).
namespace Aurora::Runtime
{
  class DraftStore;
  class PipelineHost;

  struct PreviewOptions
  {
    std::chrono::milliseconds interval{66}; // about 15 Hz
    std::chrono::milliseconds heartbeat{15000};
  };

  // GET /api/graph/preview?session=<id> (text/event-stream, read scope, counted
  // against the event-stream cap). Runs that session's draft beside the live
  // graph, sharing the inputs, with every output.send swapped for a sink that
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
  void registerPreviewRoutes(
    Aurora::Network::Http::Server::HttpServer& server,
    PipelineHost& pipelineHost,
    std::shared_ptr<DraftStore> drafts,
    PreviewOptions options = {});
}
