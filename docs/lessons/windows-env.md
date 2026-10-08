# Windows environment

Id: lesson-windows-env

Processes, installers, ACLs, output capture, probing from this environment. See [README.md](README.md) for filing rules.

---

## A process started from this Bash environment can report a different PID than Windows sees, and needs `/F` to stop from a redirected/backgrounded launch
Tags: windows, processes, taskkill, bash
Applies-when: stopping a backgrounded/redirected process launched from Git Bash

Two related gotchas hit together while iterating on a live test run
(`aurora-app-windows.exe`, started via Bash's `&` with output redirected
to a file). First: `taskkill //F //PID $(cat pidfile)` reported "process
not found" even though the app was still visibly running -- Bash's `$!`
is the MSYS/Git-Bash-level PID, not necessarily the real Windows PID
`tasklist`/`netstat` report (confirmed: `$!` gave `1282`, the actual
process was `27344`). Second: even with the right PID, a plain `taskkill`
(no `/F`) on a process launched this way can fail with "can only be
terminated forcefully" -- redirecting output at launch means no real
console is attached, so there's no `CTRL_CLOSE_EVENT` channel for a
graceful stop to use.

**Fix:** find the real PID via `tasklist //FI "IMAGENAME eq <name>.exe"`
(by image name, not by trusting Bash's own job-control PID) when in doubt,
and default to `taskkill //F //IM <name>.exe` (by image name, forceful)
for anything started via a backgrounded/redirected launch from this
environment -- a graceful stop only reliably works for processes given a
real interactive console.

---

---

## An installer's `--quiet`/`--passive` flag can mean "don't prompt," including the elevation prompt
Tags: windows, installer, visual-studio, uac
Applies-when: running an unattended Windows installer from a non-elevated shell

Ran the Visual Studio installer's `modify` command from a normal (non-admin)
PowerShell window with `--passive` to add the C++ workload for the Windows
Input plugin. It didn't fail loudly or throw up a UAC dialog — it printed a
few telemetry lines, logged `Commands with --quiet or --passive should be run
elevated from the beginning`, and exited (code 5007) in under a second. No
installer process, no consent prompt, nothing left running — every
process/log-based check for "is it still working" came back empty, which
looked identical to "never started" until the log was actually read.

**Fix:** `--quiet`/`--passive` assume the invoking shell is *already*
elevated and won't trigger UAC themselves — open the terminal via "Run as
administrator" first, then run the command unchanged. More generally: an
unattended/non-interactive install flag can silently fold in "skip the
elevation prompt too," not just "skip the progress UI" — check for a
running process or a growing log file within the first few seconds of any
such command, rather than assuming a clean, fast exit means success.

---

---

## A directory's ACLs can outlive a machine identity change, denying an account that looks like the same one
Tags: windows, acl, filesystem
Applies-when: undeletable files survive reboot (not a process lock)

`Aurora/core/build/` (created earlier via a WSL2-mounted path) became
completely undeletable — every file inside denied, surviving a full reboot
(ruling out any process lock) and an IDE-extension uninstall. `Get-Acl`
showed why: the file's owning-domain SID prefix differed from the current
session's SID, despite both ending in the same relative ID (`-1001`, "first
regular user account") and both superficially resolving to the same
account name. Windows ACLs bind to the SID, not the display name — a
machine-identity change (reset, reimage, rename) leaves old ACEs granting
access to a SID nothing on the system maps to anymore, even though `whoami`
still prints what looks like the same account.

**Fix:** check for this specifically (`Get-Acl` on a denied file, compare
the SID prefix, not just the account name) before assuming a stubborn
"access denied" is a process lock — rebooting, closing apps, or uninstalling
extensions won't touch it. If `BUILTIN\Administrators`/`SYSTEM` still have a
valid grant (common, since those aren't tied to the per-install SID), an
elevated delete goes through directly with no ownership-repair step needed.

---

---

## Redirecting a live process's stdout to a file for later inspection can look identical to a crash, because console-attached and redirected stdout buffer differently
Tags: live-testing, stdout-buffering, windows
Applies-when: capturing a long-running daemon's redirected output

Debugging why a real double-click launch might be failing, ran the same
binary from this environment via `./aurora-app-windows.exe > log.txt 2>&1 &`
to capture what it prints. The log file came back completely empty --
looked exactly like the process had died before printing anything (the
same symptom a real crash produces). It hadn't: `tasklist` showed it still
running, and curling the port it should be serving got a real `200`. The
C runtime buffers stdout differently depending on what it's attached to --
line-buffered (flushes on every `\n`) when it's a real interactive
console, full/block-buffered (flushes only when the buffer fills or the
process exits) when redirected to a file or pipe. Every `std::cout` call
in this codebase uses a bare `"\n"`, not `std::endl` (which would force a
flush) -- correct and idiomatic for console output, but it means none of
that output reaches a redirected file until either a few KB accumulate or
the process actually exits.

**Fix:** confirmed the process was alive via `tasklist`/a real request to
its own port instead of trusting an empty redirected log file as proof of
an early exit. General principle: when redirecting a live, long-running
process's stdout to a file for this kind of live-testing (a pattern used
throughout this project), an empty or lagging log file is not evidence the
process crashed or hasn't reached that code yet -- verify liveness through
an independent channel (the process list, a real request) before
concluding from buffered output alone. `std::cerr` doesn't have this
problem (unit-buffered by default, flushes every write) — a discrepancy
between "cerr showed nothing" and "cout showed nothing" is itself a signal
worth noticing, not just retrying the same redirect.

---

---

## Live-probing the daemon from this sandbox takes three workarounds, and the probe daemon must die afterward
Tags: sandbox, live-testing, wsl2, curl
Applies-when: probing a freshly built daemon from this environment

Freshly built binaries on the DrvFs mount refuse direct exec (`Operation
not permitted`) -- run via `/lib64/ld-linux-x86-64.so.2 <binary>`
instead. Localhost `curl` goes through the sandbox proxy env (empty
`no_proxy`) -- pass `--noproxy '*'`. And never probe against the real
config: set `AURORA_CONFIG_DIR` to a temp dir so the probe can't touch
pairing/zone state.

**Fix:** the verified recipe is loader-exec + `setsid -f` detached start
+ `curl --noproxy '*'`, all against a temp config dir -- then confirm the
port is closed afterward -- a failing `curl` is the confirmation, since
both `pkill -f` and a /proc PID scan match your own command text (and PID
1's sandbox cmdline, which embeds it) and can kill your own shell. A leftover probe
daemon holds the REST port and looks exactly like the real app misbehaving.

---

---

## A fresh checkout on this machine shows whole-file M flags with zero content changes -- verify normalized before touching anything
Tags: windows, git, line-endings, checkout
Applies-when: git status shows every file modified on a fresh machine that changed nothing

git status showed dozens of modified files (.beads/, AGENTS.md, docs/, skills) on a machine that had changed nothing. git diff --stat --ignore-all-space was empty, and the worktree md5 matched the blob after stripping \r -- the entire diff was LF blobs checked out as CRLF (49 extra bytes on a 49-line file, one \r per line).

**Fix:** before staging anything here, run git diff --ignore-cr-at-eol -- <file> and confirm the only ^[+-] lines are real; never git add -A a wall of M flags on this machine without that check. New files authored here land as LF (repo-blob convention). Correction 2026-09-20: git only normalizes on commit with text conversion configured -- this machine had no core.autocrlf and no .gitattributes, so a commit baked CRLF into 4 lesson blobs (fixed by amend plus .gitattributes * text=auto). Check git config core.autocrlf and ls .gitattributes before assuming; git cat-file -p HEAD:<file> never converts and is the arbiter of what is stored, not the worktree.

---

## Resource IDs must be defined in a shared resource.h, not assumed from windows.h
Tags: windows, resources, rc, tray
Applies-when: adding an .rc icon/menu ID that C++ also references (LoadIcon, TrackPopupMenu)

app.rc used a bare IDI_ICON1 with no definition anywhere and the MSVC build tolerated it -- origin unclear, never rely on it.

**Fix:** resource.h with numeric IDs, included by both app.rc and code; comment that the values are ABI with the compiled .res and must never be renumbered.

---

## TrackPopupMenu needs SetForegroundWindow plus a WM_NULL re-arm
Tags: windows, tray, win32, menu
Applies-when: showing a notification-icon context menu from a message-only window

Without SetForegroundWindow the popup mis-dismisses; without posting WM_NULL after TPM_RETURNCMD the next right-click can fail to reopen it (KB135788).

**Fix:** the foreground + TPM_RETURNCMD + WM_NULL pattern in TrayIcon::showMenu.

---

## NIF_INFO renders as a modern toast on Win10+; WinRT toasts need an installer
Tags: windows, tray, toast, notifications, packaging
Applies-when: choosing a notification API for a portable (uninstalled) Windows app

Classic balloon tips are legacy: since Win10, Shell_NotifyIcon NIF_INFO surfaces as an Action Center toast. Full WinRT toasts demand a Start Menu shortcut with AppUserModelID (+ installer, + COM activator for actions) -- disproportionate for a one-shot hint in a portable zip, and tray-originated NIF_INFO toasts are attributed to the icon with zero install footprint.

**Fix:** keep NIF_INFO; write copy for a detached notification (name the destination, never 'here').

---

## Session-ending broadcasts never reach a message-only window
Tags: windows, shutdown, win32, tray
Applies-when: handling logoff/shutdown in an app whose only window is HWND_MESSAGE

WM_QUERYENDSESSION/WM_ENDSESSION go to top-level windows only; a message-only window never receives them, so a tray app with no other window cannot use its message-only window as the shutdown listener.

**Fix:** promote to a hidden top-level window (or equivalent) that sets the same stop flag the tray Stop path sets; still live-test logoff/shutdown afterward, since delivery is only half the contract.

---

## _putenv_s with "" removes the variable -- an "empty but set" env flag is unobservable to getenv() on Windows
Tags: windows, env, msvc, testing
Applies-when: setting a presence-style env flag to "" in a test or shell and reading it back with getenv() on Windows

POSIX setenv(name, "", 1) keeps the variable defined (getenv() returns non-null ""), but MSVC documents _putenv_s(name, "") as removal -- getenv() then returns NULL, indistinguishable from unset. output/hue's discover dev arm gates on getenv()-nullness, so the two PairingRoutesTests cases that set AURORA_DEV_FAKE_HUE="" to mean "flag carries no address" fell through to the production discovery path on Windows only, while the explicit-address and bare-"1" cases passed. app/windows/tests/LogSinkTests.cpp already encodes the same convention (_putenv_s(name,"") spells clear, like unsetenv).

**Fix:** never use "" to mean "set but empty" in cross-platform code -- spell address-less presence with the flag's own bare idiom ("1"/"true", which the route treats exactly like ""), keeping "" only where readers treat missing and empty identically (both are absent there). PairingRoutesTests.cpp now does this via a kDevFlagNoAddress constant ("1" on _WIN32, "" elsewhere).

---

## LockFileEx's locked byte range is unreadable to anyone else -- holder identity needs a sidecar file
Tags: windows, lock, win32, testing
Applies-when: recording which process holds a LockFileEx lock for others to read

A second instance cannot ReadFile the byte range another process locked with LockFileEx (ERROR_LOCK_VIOLATION), so storing the holder pid inside aurora.lock itself is unreadable exactly when it matters. flock on Linux has no such restriction (it gates flock(), never read()), but the portable shape is one advisory sidecar (aurora.pid) next to the lock on both: written only by the holder, best-effort, never affecting mutual exclusion.

**Fix:** InstanceLock writes configRoot/aurora.pid on acquire (holder only) and reads it back as holderPid(), 0 when absent -- lock semantics untouched on either platform.

---

## `winget install` fails with exit 94 unless `--source winget` is pinned, and the shell that ran it never sees the new `Path`
Tags: windows, winget, path, bootstrap
Applies-when: bootstrapping a bare Windows machine from a script or agent session

On a fresh Windows 11 install, `winget install --id Kitware.CMake -e` (and Python, VS Build Tools) exited 94 with "found among the working sources ... specify one using --source" because the same id resolves in both `winget` and `msstore`. Separately, installers update the machine/user `Path`, but the already-running shell keeps its old one -- `cmake`/`py` stayed "not recognized" until `Path` was rebuilt (`$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`). Also: `python` on a fresh box is the Microsoft Store stub (prints a Store prompt); use `py`.

**Fix:** always `--source winget`; rebuild `Path` at the top of each command in agent sessions (the shell state doesn't persist between calls anyway). VS Build Tools' `--override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"` installs the C++ workload unattended. Recipe: `docs/Building.md`.

---

## Closing a socket while another thread is blocked in `recvfrom()` raises `OSError` on Windows -- join the reader first
Tags: windows, sockets, python, threads, shutdown
Applies-when: writing a dev/test tool with a UDP (or TCP) reader thread that a main thread stops by closing the socket

`tools/light-viz-relay/validate.py frame` printed PASS but exited 9 with `Fatal Python error: _enter_buffered_busy ... at interpreter shutdown, possibly due to daemon threads`. `FrameReader.stop()` set its flag and then `sock.close()`d while the daemon reader thread sat in `recvfrom()` (0.2s timeout); on Windows that raises `OSError` in the thread, not `socket.timeout`, so the loop's `except socket.timeout` missed it and the traceback was printing as the interpreter tore down. It never showed on Linux/Mac. Same class as the earlier LockFileEx lesson: a POSIX-tolerated pattern with a Windows-specific failure mode. The same class also named its stop flag `_stop`, which shadows `threading.Thread._stop`; that was not shown to fail here, but it makes `join()` unsafe to add.

**Fix:** set the flag, `join(timeout=...)` (the recv timeout bounds the wait), then close; flag renamed `_halt`. Re-run: PASS, exit 0. General principle: stop a blocked-reader thread by letting it exit its loop, never by pulling the socket out from under it -- and judge a tool run by its exit code, not just its printed verdict.


---

## TrackPopupMenuEx freezes any work loop sharing its thread; give the tray its own thread, and dismiss the menu before WM_QUIT
Tags: windows, tray, win32, threading, menu, shutdown
Applies-when: a Win32 tray/menu message loop shares a thread with a real-time work loop, or a tray thread must be stopped while a menu may be open

`TrackPopupMenuEx` runs a modal loop and does not return until the menu closes, so pumping tray messages from the tick loop stalled the whole pipeline while a menu was open (Aurora-zlw; measured 0 SSE frames during a 5s hold). Win32 window affinity is per creating thread, not "the main thread" (unlike AppKit), so the fix is to move the tray, not the tick loop: `TrayIcon` owns a thread that creates both windows, adds the icon, and runs `GetMessage`; the constructor blocks on a future for setup. Second trap: a `PostThreadMessage(WM_QUIT)` is not seen while the menu's modal loop runs, so stopping from elsewhere (HTTP `/api/stop`, Ctrl+C) with a menu open hung the join forever.

**Fix:** destructor posts `WM_QUIT` and then `SendMessageTimeout(WM_CANCELMODE)` to the tray window to dismiss the menu; teardown (`NIM_DELETE`, `DestroyWindow`) stays on the tray thread. Stop flag shared across threads must be `std::atomic`, not `volatile`. Verified with `tools/light-viz-relay/traygap.py` (posts the tray callback, holds the menu, reports frame gaps): 147 frames/5s, max gap 0.06s. General principle: a stop-with-menu-open test finds the hang a hold-the-menu test cannot.

---

## Real-time antivirus can deny CreateProcess on a freshly linked exe (`WinError 5`)
Tags: windows, antivirus, defender, build, process-launch, devstack
Applies-when: a just-built Windows exe fails to launch from a script (Python `subprocess.Popen`, devstack) with Access denied although launching it by hand or from another shell worked

`devstack.py up` failed twice in a row with `PermissionError: [WinError 5] Access is denied` from `CreateProcess` on the `Aurora.exe` the build had just produced. Launch flags were not the cause: the same `creationflags` (DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP) launched the exe and `cmd.exe` fine in isolation, and an absolute path made no difference. It launched once real-time antivirus was turned off on that machine; the exact blocker (scan lock vs. block) was not isolated.

**Fix:** after a build, if a scripted launch gets Access denied on the new binary, check antivirus before debugging flags, paths or ACLs: wait and retry, exclude the build dir, or pause real-time scanning on a dev box. Do not conclude the binary is broken.

---

## Do not probe an exe with `--help` or `--version` unless it handles them: Aurora.exe starts a full instance
Tags: windows, cli, process-launch, verification, orphans
Applies-when: testing whether an exe launches, or which flags it takes, by running it with `--help`/`--version` (or in a loop of flag variants)

`Aurora.exe` handles only its known flags and ignores the rest, so `--help` and `--version` start the real app (tray, HTTP server, capture). A loop that launched it once per `creationflags` variant started several live instances; killed ones lingered as zombie entries while a parent still held a handle (`taskkill` said "no running instance"), and a blocking wait on the launcher hung until the app exited. Filed as Aurora-v3in.

**Fix:** probe with a harmless exe first (`cmd /c exit`), launch the real one once, kill it by pid, and verify with `tasklist`/`Get-CimInstance` that nothing is left. Never wrap a possibly-long-lived app in a blocking wait inside an agent call.

---

## AppendMenuA reinterprets its string through the ANSI codepage, not UTF-8 -- a non-ASCII menu literal needs AppendMenuW
Tags: windows, tray, win32, menu, unicode, encoding
Applies-when: a Win32 menu item's text includes a non-ASCII UTF-8 character (e.g. an emoji/symbol literal)

`TrayLabel.hpp`'s `kTraySeeErrorLabel` (Aurora-k73j) is a raw UTF-8 byte
string (`"\xE2\x9A\xA0 See Error"`, the warning sign U+26A0). Mac decodes
it correctly via `[NSString stringWithUTF8String:]` and Linux's dbusmenu
is UTF-8-native, but the Windows tray built its menu with `AppendMenuA`
(and the app's other "A"-suffixed calls throughout). `AppendMenuA` treats
its `const char*` through the system ANSI codepage, not UTF-8, so each
UTF-8 byte gets reinterpreted individually: on a CP1252 machine, bytes
`E2 9A A0` decoded as `â`, `š`, then a non-breaking space -- on screen that
reads as a stray "a" and "s" with diacritics ("lines on top"), which looks
exactly like a missing-glyph/font problem but isn't one. Found live, by
eye, during a manual tray verification pass -- the unit test on the pure
label-string function never touches a real `HMENU` and could not have
caught this.

**Fix:** convert the UTF-8 literal to UTF-16 (`MultiByteToWideChar(CP_UTF8,
...)`) and call `AppendMenuW` instead of `AppendMenuA` for a menu item
carrying non-ASCII text (did all three items in the same `HMENU` for
consistency; mixing `A`/`W` `AppendMenu` calls on one menu is safe if you
don't). General principle: a cross-platform string literal with non-ASCII
bytes needs the Unicode entry point on Windows specifically -- a passing
test on the label string alone doesn't prove the native menu renders it,
only a real, eyes-on manual pass does.

---

## Killing processes by `CommandLine -match` from a shelled-out PowerShell also kills that PowerShell
Tags: windows, processes, powershell, cleanup, devstack
Applies-when: stopping a background server or child by matching its command line, especially from Git Bash via `powershell -Command`

Stopping a test viz server with `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '_serve 8799' } | ForEach-Object { Stop-Process ... }"` stopped two processes and exited 255 (Aurora-57ct check). The pattern was also in that `powershell.exe`'s own command line, so it matched and killed itself mid-pipeline. Filtering on `Name='python.exe'` first had avoided it in the earlier runs.

**Fix:** narrow by process name before matching the command line (`-Filter "Name='python.exe'"`), or exclude `$PID`. Better still, kill by the PID you recorded at launch, as `devstack.py` does with its state file.
