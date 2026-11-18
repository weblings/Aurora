# core/Runtime

Two targets share `src/` and `include/`.

## AuroraGraphEngine

The node graph and everything it evaluates. No HTTP, filesystem or thread use, so the
same sources build natively and with Emscripten (`core/Wasm`, `AURORA_CORE_GRAPH_ONLY`).

- `Graph/*`: nodes, loader, built-in graphs, `Graph`.
- `Config`, `ControlDescriptors` and tables, `Smoother`, `FrameCompositor`,
  `AudioFrameCompositor`, `BrightnessFloor`, `ZoneMap` (header only).
- `GraphValidation` (`validateGraphDoc` for a node registry and output names),
  `NodeCatalog` (`nodesPayload`, the `/api/nodes` body), `PreviewEvaluator` (lock-free
  preview core and `previewSnapshotJson`, the preview stream's event body).
- Links Contracts, Processing, the Input and Output interfaces and, with audio,
  AudioProcessing. `AURORA_RUNTIME_AUDIO_AVAILABLE` is defined here.

## AuroraRuntime

Links AuroraGraphEngine. Config persistence (`ConfigStore`, `ConfigApply`), every HTTP
route file, drafts and effect stores, `ZoneMapStore`, `GraphRunner`, `Pipeline`,
`Registry`, `DevFrameDump`. `GraphPreview` wraps `PreviewEvaluator` with the mutex,
the closed flag and the published snapshot. The 4-argument `validateGraphDoc` in
`DraftRoutes` resolves output names from the saved Config and calls the engine one.

Keep new graph code transport-free so it stays in AuroraGraphEngine. A source that
needs `HttpServer`, `<filesystem>`, `<thread>` or `<mutex>` belongs in AuroraRuntime.
