#pragma once

// Process-wide PipeWire library setup, shared by every grabber in this repo
// (PipewireGrabber's screen capture, AudioGrabber's monitor capture).
//
// pw_init()/pw_deinit() are process-global, not per-connection: calling them
// per grabber instance breaks the moment two grabbers overlap, which the
// apps do on purpose -- PipelineHost::reload() fully builds the replacement
// pipeline (including its new grabber) before tearing down the old one, so
// consecutive same-mode reloads briefly hold two live grabbers at once. The
// old instance's pw_deinit() would then pull the globals out from under the
// new one (and a second pw_deinit() double-frees), segfaulting a few swaps
// later. Same reason X11Grabber's XInitThreads() runs once and is never
// un-done. There is intentionally no matching deinit -- a bounded one-time
// leak at process exit beats a use-after-free on every live reload.
namespace Aurora::Input::Linux
{
  // Idempotent and thread-safe (reload builds on the HTTP thread while the
  // tick loop keeps using the old pipeline on the main thread).
  void ensurePipewireInitialized();
}
