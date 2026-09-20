# C++ language

Namespace, thread-lifetime, and C-portability gotchas. See [README.md](README.md) for filing rules.

---

## A C library's own example code can use patterns that don't compile in C++, even when the header is C++-safe
Tags: c-port, cpp, macros, pipewire
Applies-when: porting C example code with macro-expanded initializers into C++

Porting PipeWire's real `audio-capture.c`/`audio-src.c` example pattern
(verified against the actual source, not assumed) into `AudioGrabber.cpp`,
`&SPA_AUDIO_INFO_RAW_INIT(.format = SPA_AUDIO_FORMAT_F32)` failed to
compile: "taking address of rvalue". `SPA_AUDIO_INFO_RAW_INIT(...)` expands
to a C99 compound literal, which is an **lvalue** in C (address-of is
routine) but a **prvalue** in C++ (address-of is illegal without binding it
to a name first). The header itself compiles fine in both languages; only
this specific call-site pattern from the reference example doesn't
transfer as-is.

**Fix:** assign the macro's result to a named local (`spa_audio_info_raw
audioInfo = SPA_AUDIO_INFO_RAW_INIT(...);`), then pass `&audioInfo`.
General principle: verifying a C API's behavior against its own real
example code (the right instinct, and the one that caught this) doesn't
guarantee every *syntactic pattern* in that example ports unchanged into a
C++ translation unit -- compound-literal address-of is the specific
recurring offender, worth a second look whenever porting C example code
that takes the address of a macro-expanded initializer.

---

---

## `using namespace` doesn't make a sibling namespace's own name resolvable
Tags: cpp, namespaces, tests
Applies-when: writing a new plugin test file referencing Contracts:: types

Wrote `using namespace Aurora::Output::Hue;` in a test file, then referenced
`Contracts::UVCorner::TopLeft` expecting it to resolve — it didn't, compile
error. `using namespace` injects a namespace's *contents* into scope; it
doesn't make `Contracts` itself a name you can write, since `Aurora::Contracts`
was never brought in.

**Fix:** `using namespace Aurora::Contracts;` too (or fully qualify), then
drop the now-redundant `Contracts::` prefix at each call site.

**Recurred** in `Aurora-Input-Linux`'s test file right after this was first
fixed in `Aurora-Output-Hue`'s — knowing the lesson didn't stop it happening
again in the next plugin repo. Treat as a checklist item, not a one-off fix:
any new plugin test file that references `Contracts::` types needs `using
namespace Aurora::Contracts;` from the start, checked before the first build
attempt, not discovered by it.

---

---

## A bare `std::thread` manually joined only at the tail of `main()` aborts the process on any earlier `return`
Tags: cpp, threading, main, app-shell
Applies-when: managing thread lifetime in main() with early returns

Wiring up the new `HttpServer`'s lifecycle in both app shells' `main()`
initially stored the server thread as a plain `std::optional<std::thread>`,
stopped and joined only in the last few lines of `main()`. That code never
ran on the pre-existing "no outputs available -- nothing to drive" early-return
path. `std::thread::~thread()` calls `std::terminate()` if the thread object
is destroyed while still joinable, so that path would have aborted the whole
process instead of exiting cleanly with status 1 -- invisible at compile time,
and invisible on the happy path too, since only the no-outputs branch ever
reached the unjoined destructor.

**Fix:** wrapped the thread in a small RAII class (`HttpServerThread`) whose
destructor unconditionally calls `stop()` then `join()`, so every exit path
(early returns, an exception caught by `main()`'s own `catch`, normal
completion) unwinds through it via ordinary C++ stack-unwinding rather than
relying on one manually-placed cleanup call at the end. General principle: a
resource whose safe teardown depends on a specific line of `main()` being
reached needs to be re-checked against every early-return path already in that
function, not just the one being actively edited -- and this class of bug
usually doesn't show up by compiling, only by actually exercising the
early-return branch at runtime.

---
