# Windows environment

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

git status showed dozens of modified files (.beads/, AGENTS.md, Analysis/, skills) on a machine that had changed nothing. git diff --stat --ignore-all-space was empty, and the worktree md5 matched the blob after stripping \r -- the entire diff was LF blobs checked out as CRLF (49 extra bytes on a 49-line file, one \r per line).

**Fix:** before staging anything here, run git diff --ignore-cr-at-eol -- <file> and confirm the only ^[+-] lines are real; never git add -A a wall of M flags on this machine without that check. New files authored here land as LF (repo-blob convention); git normalizes on commit.
