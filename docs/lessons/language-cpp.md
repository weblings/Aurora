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

---

## Generated C++ string literals silently corrupt binary assets two ways
Tags: cpp, codegen, string-literals, binary-assets
Applies-when: emitting file bytes as C++ string literals from a codegen script

Embedding web/ui (StandaloneApps P1) hid two corruptions that text-only testing never shows. First, a `\xNN` escape greedily consumes following hex digits, so a byte like `0x0a` followed by source text starting with `f` compiles as one out-of-range escape -- gcc warns ("hex escape sequence out of range") but still emits truncated bytes. Second, PNG byte 9 is NUL, and map entries built as `{"key", "..."}` construct `std::string` from `const char*`, silently truncating at the first NUL -- the SVG/favicon round-trips passed while the 24K logo came back 8 bytes long.

**Fix:** emit every `\xNN` as its own adjacent literal (`"abc" "\x0a" "def"` -- only `\x` is greedy; `\n`, `\\`, `\"` are safe inline) and construct values with an explicit length (`std::string("...", N)` with N from codegen). Verify with a compiled round-trip over ALL inputs (`cmp` each file, including at least one real binary), not just text samples -- a text-only spot check passes while binaries corrupt.

---

---

## MSVC caps single string literals at 16380 chars (C2026) while GCC and Clang accept longer
Tags: cpp, codegen, string-literals, msvc, windows
Applies-when: emitting large text as C++ string literals in a cross-platform build

The webroot embed encoder (StandaloneApps P1) passed GCC with literals up to 33K chars (large HTML mockups, favicon.svg) and failed MSVC with C2026 on the first Windows build. Per Microsoft's own C2026 doc the limit applies per literal *before* adjacent literals concatenate -- confirmed live: a 120KB line of tiny `\xNN` literals compiled clean while single 24K literals errored. Cross-platform codegen must satisfy the strictest compiler, not the one on the author's machine.

**Fix:** cut printable runs at 16000 source chars (380 under the cap) into adjacent literals; keep one-binary-byte encodings (`\xNN`) isolated as before. Verify by asserting max literal length over the generated output plus the byte-identical round-trip, and treat the first build on each compiler as the real test -- a Linux-green embed proves nothing about MSVC.

---

## GVariant builders sink, @ embeds, lookup matches inner types
Tags: cpp, glib, dbus, ownership, testing
Applies-when: constructing GVariant trees or asserting on them in tests

Three rules, each learned by crash: (1) every g_variant_new_* container call sinks the floating references it is given -- including '@'-embedded values -- so hand unref of anything fed to a builder is a double-free. Only values handed *out* (get_child_value, lookup, get_variant) need unref. (2) A prebuilt GVariant embeds into a format string only with '@' ('@a{sv}'); bare container types expect varargs elements and abort otherwise. dbusmenu children are boxed variants ('av'), not nested structs -- the spec type says so. (3) g_variant_lookup_value matches the *inner* type and returns it unboxed: on an a{sv} dict, look up 's'/'b', not 'v' (which returns NULL).

**Fix:** TrayIcon.cpp documents the ownership contract at the builders; TrayIconTests navigates via unbox + inner-type lookup. Companion trap in the same file: a hand forward-declared `Aurora::App::GVariant` typedef shadows glib's global once gio.h is included -- include the header and use the real type instead.

---

---

## `g_bus_own_name` never completes on a thread whose GMainContext isn't running -- polling GetNameOwner without pumping always times out
Tags: cpp, glib, dbus, threading, tray
Applies-when: acquiring a session-bus name on a worker thread before its GMainLoop starts

The tray worker called `g_bus_own_name` (async, no callbacks) then ran a bounded wait polling `GetNameOwner` with `g_usleep` between passes. The wait always timed out ("bus name never acquired -- running without icon") and registration was skipped -- yet `busctl` showed the name owned afterwards. Acquisition completes by dispatching on the calling thread's thread-default context, which nobody iterates until `g_main_loop_run` starts *after* the wait: the poll can never observe ownership because the reply it waits for needs the very loop that is blocked. Live state matched exactly (name owned, watcher list missing Aurora).

**Fix:** pump the context each pass (`g_main_context_iteration(context, FALSE)` before the poll) in `app/linux/src/TrayIcon.cpp`. General principle: a synchronous poll from the same thread never substitutes for dispatching an async GLib/GIO call -- either pump the thread-default context while waiting or use the blocking `_sync` variant; `g_usleep` between polls only stretches a wait that cannot succeed.
