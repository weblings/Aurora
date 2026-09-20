# Aurora-Input-Windows — agent notes

Windows capture plugin (`WindowsGrabber`, `AudioGrabber`, `DummyGrabber`).
Expects a sibling `Aurora/` checkout (core interfaces via relative path).

- Build/test: `cmake -S . -B build`, `cmake --build build`,
  `ctest --test-dir build --output-on-failure` (MSVC).
- Tasks (`bd`) and lessons (`Analysis/lessons/`) live in core `Aurora/`.
