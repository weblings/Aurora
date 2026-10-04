#!/usr/bin/env python3
"""Aurora-1t1 repro runner: does capture keep tracking when Firefox is fullscreen? (dev-only)

Runs pattern.html in Firefox in two phases and judges each with
`validate.py color --track`:

  window  normal (non-fullscreen) window -- the control; should PASS
  kiosk   `firefox --kiosk` (fullscreen from launch; stands in for F11, since
          synthetic keypresses are unreliable on GNOME Wayland)

Brings the devstack up first if it isn't already (live capture; the first run
may need you to click through GNOME's screen-share prompt) and tears down only
what it started. Exit 0 = every phase tracked; 1 = some phase stalled.

    python3 fullscreen_repro.py
    python3 fullscreen_repro.py --seconds 20 --max-stall 4 --phases kiosk
    python3 fullscreen_repro.py --keep-stack     # leave the stack up afterwards

Stdlib only. Needs the snap/apt `firefox` on PATH and a graphical session.
"""
import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAGE = HERE / "pattern.html"
# Snap Firefox can only use profiles under non-hidden $HOME paths or its own
# common dir, not /tmp.
PROFILE = Path.home() / "snap/firefox/common/aurora-fullscreen-repro-profile"
PROFILE_PREFS = """\
user_pref("browser.aboutwelcome.enabled", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.tabs.warnOnClose", false);
"""


def devstack(*args, timeout=None):
    return subprocess.run([sys.executable, str(HERE / "devstack.py"), *args],
                          capture_output=True, text=True, timeout=timeout)


def launch_firefox(phase, interval):
    PROFILE.mkdir(parents=True, exist_ok=True)
    (PROFILE / "user.js").write_text(PROFILE_PREFS)
    cmd = ["firefox", "--no-remote", "--new-instance", "--profile", str(PROFILE)]
    if phase == "kiosk":
        cmd.append("--kiosk")
    cmd.append(f"file://{PAGE}?interval={interval}&kiosk")
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            start_new_session=True)


def stop_firefox(proc):
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=10)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass


def run_phase(phase, args):
    print(f"\n== {phase}: launching Firefox ==", flush=True)
    proc = launch_firefox(phase, args.interval)
    try:
        time.sleep(args.settle)  # let the window map and the capture catch up
        res = subprocess.run(
            [sys.executable, str(HERE / "validate.py"), "color", "--track",
             "--seconds", str(args.seconds), "--max-stall", str(args.max_stall),
             "--tolerance", str(args.tolerance)],
            capture_output=True, text=True)
    finally:
        stop_firefox(proc)
    out = (res.stdout + res.stderr).strip()
    print(out)
    return res.returncode == 0, out.splitlines()[-1] if out else "(no output)"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog="\n".join(__doc__.splitlines()[2:]))
    ap.add_argument("--phases", default="window,kiosk", help="comma list of window,kiosk")
    ap.add_argument("--seconds", type=float, default=30, help="tracking window per phase")
    ap.add_argument("--max-stall", type=float, default=5, help="longest allowed stall, seconds")
    ap.add_argument("--tolerance", type=float, default=0.08, help="color change threshold, 0..1")
    ap.add_argument("--interval", type=int, default=1500, help="pattern flip period, ms")
    ap.add_argument("--settle", type=float, default=8, help="seconds to wait after launching Firefox")
    ap.add_argument("--keep-stack", action="store_true", help="don't tear down a stack this run started")
    ap.add_argument("--app", help="Aurora binary for devstack up (default: build/linux-app/bin/Aurora)")
    args = ap.parse_args()

    phases = [p.strip() for p in args.phases.split(",") if p.strip()]
    bad = [p for p in phases if p not in ("window", "kiosk")]
    if bad:
        sys.exit(f"unknown phase(s): {', '.join(bad)}")
    if not shutil.which("firefox"):
        sys.exit("firefox not found on PATH")

    started_stack = False
    results = []
    try:
        if ":18245 listening" in devstack("status").stdout:
            print("devstack already up; using it")
        else:
            print("bringing devstack up (live capture: accept the GNOME share prompt if shown)...",
                  flush=True)
            up = devstack("up", *(["--app", args.app] if args.app else []), timeout=240)
            started_stack = True  # even a failed up can leave orphans for `down`
            print(up.stdout.strip() or up.stderr.strip())
            if up.returncode != 0:
                sys.exit("FAIL: devstack up failed")
        for phase in phases:
            results.append((phase, *run_phase(phase, args)))
    finally:
        if started_stack and not args.keep_stack:
            print("\ntearing devstack down...")
            devstack("down")

    print("\n== summary ==")
    for phase, ok, last in results:
        print(f"  {phase:7s} {'PASS' if ok else 'FAIL'}  {last}")
    sys.exit(0 if all(ok for _, ok, _ in results) else 1)


if __name__ == "__main__":
    main()
