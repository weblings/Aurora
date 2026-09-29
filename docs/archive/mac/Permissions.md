# macOS Screen Recording permission

Id: mac-permissions

Status: resolved, implemented as Aurora-8mk.8 (permission recovery flow,
closed). Split out of the old `docs/MacSupport.md` (Aurora-le6). See
[[mac-video-capture]] for the tier this gates, [[mac-audio]] for the
separate, narrower audio permission.

### Ad-hoc signing re-prompts every rebuild

A bare, ad-hoc-signed (or unsigned) dev binary re-triggers the macOS
Screen Recording consent dialog on every rebuild, not just every run.
Decided: accept this during development rather than chase a codesign fix,
because the fix doesn't actually work at the complexity it'd cost:

- macOS's TCC store keys a Screen Recording grant to the requesting
  process's code identity. For a binary signed with a real **Developer ID**
  (Team ID present), that identity is stable across rebuilds, so the grant
  persists. For an **ad-hoc** signature (`codesign -s -`, no Team ID —
  the only kind free to produce), the signature's hash is derived from the
  binary's own contents, so it changes on every recompile. `codesign` here
  is a one-line build step, but it doesn't buy the stability that would
  actually stop the re-prompting.
- So this isn't a separate problem to solve — it's the same Developer
  ID / notarization requirement [[mac-notarization]] already covers for
  eventual release zips (Gatekeeper). There's no cheap intermediate fix;
  either pay for the stable identity or accept re-prompting until that
  point. Re-prompting during `cmake --build` + manual test cycles is a
  minor dev-loop annoyance, not a correctness risk.

**Ubuntu parallel:** yes, and Aurora already has a solved version of it on
the Linux side. The Wayland/`xdg-desktop-portal` ScreenCast path (used on
GNOME, so likely what a Wayland-session Ubuntu 24.04 install hits) shows
the same kind of first-use consent dialog Screen Recording does on macOS.
[`XdgDesktopPortal.cpp`](../../../input/linux/src/XdgDesktopPortal.cpp#L343-L468)
already implements the portal's fix for it: it requests `persist_mode = 2`
(permanent) and stores the returned `restore_token`, replaying it on the
next request so the portal skips the dialog on subsequent launches — this
is the direct analog to what a stable macOS code identity buys.

### Recovery flow: denial is sticky, not re-askable

Unlike the Wayland portal dialog (re-askable each session), macOS's Screen
Recording prompt doesn't reappear after a refusal — the user has to open
System Settings → Privacy & Security → Screen Recording (renamed **Screen
& System Audio Recording** in Tahoe 26) themselves, flip Aurora on, then
fully quit (Cmd+Q, not just close the window) and relaunch before the
grant takes effect. Sequoia 15+ additionally re-prompts weekly for apps
holding standing access, as a privacy nudge — expect that as ongoing
behavior, not a one-time setup step.

- A deep link straight to the right pane
  (`x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`)
  is documented as working through Ventura/Sonoma-era System Settings.
- `tccutil reset ScreenCapture` clears all Screen Recording grants
  (useful when a rebuild changes the app's identity enough that macOS
  treats it as a stale/duplicate entry) — a dev-loop escape hatch worth
  knowing regardless of which tier ships.
- The WebUI needed a distinct state for "permission denied, here's how to
  fix it" pointing at System Settings, rather than the generic top-level
  `catch` in [`main()`](../../../app/linux/src/main.cpp#L847) that just prints
  and exits — that pattern is fine for Linux/Windows startup failures but
  not for a mid-session, user-fixable permission gap. Shipped as part of
  Aurora-8mk.8.

### Bridging the async permission wait into IVideoInput's sync contract

`IVideoInput::init()`/`_initMonitorsList()` are synchronous (return
`void`) — [`IVideoInput.hpp:41-44`](../../../core/Input/include/Aurora/Input/IVideoInput.hpp#L41-L44)
— but `SCShareableContent.getShareableContent(completionHandler:)` and the
first-run TCC prompt are async (GCD completion handler). Linux already
solved the same shape of problem for the portal dialog:
`XdgDesktopPortal::Capture` bridges its async D-Bus negotiation to
blocking code with a `std::promise<bool> fdReadyPromise`
([`XdgDesktopPortal.hpp:56`](../../../input/linux/include/Aurora/Input/Linux/XdgDesktopPortal.hpp#L56)),
so the mac grabber followed the same pattern rather than inventing one —
wrapping the completion handler in a promise/semaphore and blocking in
`_initMonitorsList()`. GCD completion handlers run on a background
dispatch queue, not tied to a run loop, so blocking the calling thread
this way needed no `NSApplication`/run-loop pump — confirmed empirically
alongside the responsible-process test.

**The wait needed a bound, and the request handling around it did too.**
Traced the actual call chain: a WebUI settings save (`PUT /api/config`) or
`POST /api/reload` runs `Pipeline::build()` → `registry.createInput()`
synchronously on the HTTP request thread
([`main.cpp:392`](../../../app/linux/src/main.cpp#L392), reload wiring at
[`main.cpp:569-596`](../../../app/linux/src/main.cpp#L569-L596) and
[`SettingsRoutes.cpp:141`](../../../core/Runtime/src/SettingsRoutes.cpp#L141)),
with the response held open until the grabber constructor returns. The
server is stock cpp-httplib with a per-connection thread pool, so a hang
there only ties up one connection/pool-thread rather than the whole server
— but it's still a real hang.
[`AudioGrabber.cpp:38`](../../../input/linux/src/AudioGrabber.cpp#L38)
already did this correctly for its own Pipewire wait
(`wait_for(std::chrono::seconds(5))`, with a comment explaining the
constructor shouldn't hang forever) — that's the in-repo pattern the mac
grabber's promise wait copied.
[`PipewireGrabber.cpp`](../../../input/linux/src/PipewireGrabber.cpp)'s own
unbounded `.wait()` (the same class of bug, on the Linux side, surfaced
while tracing this pattern for Mac) was fixed separately under
`Aurora-1z9`.

No REST-facing "pending" status mechanism existed to reuse as-is. The
closest in-repo shape was Hue pairing
([`PairingRoutes.cpp:166-210`](../../../output/hue/src/PairingRoutes.cpp#L166-L210)):
`PUT /api/hue/register` returns immediately with a structured
`{"error":"link_button_not_pressed"}` and the WebUI polls/retries rather
than the server blocking. The mac permission wait followed that shape —
bound the wait, and on timeout return a structured "permission_pending"
response instead of holding the connection open — shipped as part of
Aurora-8mk.8.
