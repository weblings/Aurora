#!/usr/bin/env python3
"""Per-platform capture/tick perf harness (dev-only, Aurora-wqzp.1).

    py tools/perf-harness/perf.py [--app PATH] [--seconds 30] [--settle 8]
                                  [--modes video,audio,both] [--content static,moving]
                                  [--json OUT] [--keep-stack] [--no-tone]

Brings up the devstack with AURORA_DEV_DUAL_CAPTURE=1, then for every mode x
content case switches the live config and prints CPU (% of one core, process
time deltas), the app's own `[dual-capture]` update avg/max and real tick rate,
and light frames/s from the relay SSE. Stdlib only. Needs a graphical session
and (for `moving`) tkinter. `static` assumes a quiet desktop. `moving` covers the
screen with slow, dark, low-contrast stripes (no flashing).
"""
import argparse, json, os, re, shutil, statistics, subprocess, sys, tempfile, threading, time, urllib.request, wave, struct, math
from pathlib import Path

HERE = Path(__file__).resolve().parent
RELAY_DIR = HERE.parent / "light-viz-relay"
sys.path.insert(0, str(RELAY_DIR))
import devstack  # noqa: E402  (stdlib-only sibling tool)

WIN = sys.platform == "win32"
MAC = sys.platform == "darwin"
AUDIO_INPUT = "windows-audio" if WIN else "mac-audio" if MAC else "linux-audio"
MODES = {  # mode -> (activeInputName, activeAudioInputName)
    "video": (devstack.LIVE_INPUT, ""),
    "audio": ("", AUDIO_INPUT),
    "both": (devstack.LIVE_INPUT, AUDIO_INPUT),
}
STATS_RE = re.compile(
    r"\[dual-capture\] (\S+) (\d+) ticks/([\d.]+)s \(([\d.]+) Hz\): video avg ([\d.]+) max ([\d.]+) ms, "
    r"audio avg ([\d.]+) max ([\d.]+) ms, budget ([\d.]+) ms")


# ---- process CPU (seconds of CPU time consumed, lifetime) ----

def cpu_seconds(pid):
    if WIN:
        import ctypes
        from ctypes import wintypes
        k = ctypes.windll.kernel32
        k.OpenProcess.restype = wintypes.HANDLE
        h = k.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        ft = [wintypes.FILETIME() for _ in range(4)]
        k.GetProcessTimes(h, *[ctypes.byref(f) for f in ft])
        k.CloseHandle(h)
        ticks = lambda f: ((f.dwHighDateTime << 32) | f.dwLowDateTime)
        return (ticks(ft[2]) + ticks(ft[3])) / 1e7  # kernel + user, 100 ns units
    if MAC:
        out = subprocess.run(["ps", "-o", "cputime=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
        secs = 0.0
        for part in out.split(":"):
            secs = secs * 60 + float(part)
        return secs
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    return (int(fields[11]) + int(fields[12])) / os.sysconf("SC_CLK_TCK")  # utime + stime


# ---- the app's [dual-capture] lines ----

def read_console(pid):
    """Windows: the app's own console buffer, read from a console-less helper."""
    r = subprocess.run([sys.executable, str(Path(__file__).resolve()), "_readconsole", str(pid)],
                       capture_output=True, text=True)
    return r.stdout


def _readconsole(pid):
    import ctypes
    from ctypes import wintypes
    k = ctypes.windll.kernel32
    k.FreeConsole()
    if not k.AttachConsole(pid):
        sys.exit("AttachConsole failed (is AURORA_CONSOLE=1 set for the app?)")

    class Coord(ctypes.Structure):
        _fields_ = [("x", ctypes.c_short), ("y", ctypes.c_short)]

    class Info(ctypes.Structure):
        _fields_ = [("size", Coord), ("cursor", Coord), ("attr", wintypes.WORD),
                    ("win", ctypes.c_short * 4), ("maxsize", Coord)]
    k.CreateFileW.restype = wintypes.HANDLE
    h = k.CreateFileW("CONOUT$", 0xC0000000, 3, None, 3, 0, None)
    info = Info()
    k.GetConsoleScreenBufferInfo(wintypes.HANDLE(h), ctypes.byref(info))
    width, cur_y = info.size.x, info.cursor.y
    total = width * (cur_y + 1)
    buf = ctypes.create_unicode_buffer(total)
    n = wintypes.DWORD()
    k.ReadConsoleOutputCharacterW(wintypes.HANDLE(h), buf, total, 0, ctypes.byref(n))
    sys.stdout.write(buf.value)  # rows concatenated: a wrapped line stays contiguous


def stats_lines(pid):
    text = read_console(pid) if WIN else (devstack.STATE / "app.log").read_text(errors="replace")
    return [m.groups() for m in STATS_RE.finditer(text)]


# ---- light frames/s from the relay SSE ----

class FrameCounter(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.count, self.run_flag = 0, True

    def run(self):
        while self.run_flag:
            try:
                with urllib.request.urlopen(devstack.SSE, timeout=5) as r:
                    for line in r:
                        if not self.run_flag:
                            return
                        if line.startswith(b"data:"):
                            self.count += 1
            except Exception:
                time.sleep(0.2)


# ---- content and tone helpers ----

def start_mover():
    try:
        import tkinter  # noqa: F401
    except ImportError:
        return start_firefox_mover()  # no tkinter on this box (e.g. Linux without python3-tk)
    return subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "_mover"])


def start_firefox_mover():
    """Fallback moving content: fullscreen kiosk Firefox on stripes.html.

    Same dark slow-drifting stripes as _mover (no flashing). Needs a graphical
    session; uses a throwaway profile so the user's Firefox is untouched.
    """
    import shutil
    exe = shutil.which("firefox") or next(
        (c for c in ["/Applications/Firefox.app/Contents/MacOS/firefox"] if Path(c).exists()), None)
    if not exe:
        sys.exit("moving content needs tkinter or firefox, found neither")
    profile = Path(tempfile.mkdtemp(prefix="aurora-perf-ff-"))
    url = (HERE / "stripes.html").as_uri()
    p = subprocess.Popen([exe, "--no-remote", "--profile", str(profile),
                          "--kiosk", url],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p._perf_profile = profile  # cleaned by stop_mover
    time.sleep(3)  # fresh profile + kiosk settle before measuring
    return p


def stop_mover(p):
    import shutil
    stop(p)
    profile = getattr(p, "_perf_profile", None) if p else None
    if profile:
        shutil.rmtree(profile, ignore_errors=True)


def _mover():
    import tkinter as tk
    root = tk.Tk()
    root.attributes("-fullscreen", True)
    root.attributes("-topmost", True)
    cv = tk.Canvas(root, highlightthickness=0, bg="#1c1f26")
    cv.pack(fill="both", expand=True)
    root.update()
    width, height, period, dx = cv.winfo_width(), cv.winfo_height(), 240, 2
    # Dark, low-contrast stripes drifting ~0.5 Hz per pixel: new frame every
    # tick, no flashing (photosensitivity). Capture cost is per delivered frame.
    stripes = [cv.create_rectangle(x, 0, x + period // 2, height, fill="#2b303a", outline="")
               for x in range(-period, width + period, period)]
    state = {"off": 0}

    def tick():
        for sid in stripes:
            cv.move(sid, dx, 0)
        state["off"] += dx
        if state["off"] >= period:  # one period shifted: snap back, pattern repeats
            state["off"] = 0
            for sid in stripes:
                cv.move(sid, -period, 0)
        root.after(16, tick)
    tick()
    root.mainloop()


def start_tone():
    path = Path(tempfile.gettempdir()) / "aurora-perf-tone.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
        w.writeframes(b"".join(struct.pack("<h", int(12000 * math.sin(2 * math.pi * 440 * i / 44100)))
                               for i in range(44100)))
    if WIN:
        cmd = ["powershell", "-NoProfile", "-Command",
               f"(New-Object Media.SoundPlayer '{path}').PlayLooping(); Start-Sleep 86400"]
    elif MAC:
        cmd = ["sh", "-c", f"while :; do afplay '{path}'; done"]
    else:
        cmd = ["sh", "-c", f"while :; do paplay '{path}' || aplay -q '{path}' || sleep 1; done"]
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def stop(p):
    if p and p.poll() is None:
        p.terminate()
        try:
            p.wait(5)
        except subprocess.TimeoutExpired:
            p.kill()


# ---- one measured case ----

def measure(pid, seconds, settle):
    time.sleep(settle)
    before = len(stats_lines(pid))
    counter = FrameCounter()
    counter.start()
    time.sleep(0.5)  # SSE connect
    counter.count = 0
    c0, t0 = cpu_seconds(pid), time.monotonic()
    time.sleep(seconds)
    c1, t1 = cpu_seconds(pid), time.monotonic()
    counter.run_flag = False
    wall = t1 - t0
    rows = [tuple(map(float, g[1:])) for g in stats_lines(pid)[before:]]  # [ticks, s, hz, vavg, vmax, aavg, amax, budget]
    res = {"cpu_pct": 100 * (c1 - c0) / wall, "frames_per_s": counter.count / wall, "windows": len(rows)}
    if rows:
        res.update(hz=statistics.mean(r[2] for r in rows),
                   video_avg=statistics.mean(r[3] for r in rows), video_max=max(r[4] for r in rows),
                   audio_avg=statistics.mean(r[5] for r in rows), audio_max=max(r[6] for r in rows),
                   budget=rows[-1][7])
    return res


def fmt(r):
    cells = [f"{r['cpu_pct']:5.1f}%", f"{r['frames_per_s']:6.1f}"]
    if "hz" in r:
        cells += [f"{r['hz']:5.1f}", f"{r['video_avg']:6.2f}/{r['video_max']:7.2f}",
                  f"{r['audio_avg']:5.2f}/{r['audio_max']:6.2f}", f"{r['budget']:.2f}"]
    else:
        cells += ["  n/a"] * 4
    return cells


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app")
    ap.add_argument("--seconds", type=float, default=30)
    ap.add_argument("--settle", type=float, default=8, help="must exceed the 5 s stats window plus rebuild")
    ap.add_argument("--modes", default="video,audio,both")
    ap.add_argument("--content", default="static,moving")
    ap.add_argument("--json")
    ap.add_argument("--keep-stack", action="store_true")
    ap.add_argument("--no-tone", action="store_true", help="audio modes then produce no light frames")
    a = ap.parse_args()
    modes, contents = a.modes.split(","), a.content.split(",")

    env = dict(os.environ, AURORA_DEV_DUAL_CAPTURE="1")
    if WIN:
        env["AURORA_CONSOLE"] = "1"
    started = not devstack.STATE_FILE.exists()
    if started:
        cmd = devstack.py() + [str(RELAY_DIR / "devstack.py"), "up"] + (["--app", a.app] if a.app else [])
        subprocess.run(cmd, env=env, check=True)
    pid = json.loads(devstack.STATE_FILE.read_text())["app"]
    base = f"http://127.0.0.1:{devstack.find_webui()}"
    tone = None if a.no_tone else start_tone()
    results = []
    try:
        for content in contents:
            mover = start_mover() if content == "moving" else None
            try:
                time.sleep(2 if mover else 0)
                for mode in modes:
                    video, audio = MODES[mode]
                    devstack.http("PUT", base + "/api/config",
                                  {"activeInputName": video, "activeAudioInputName": audio}, timeout=120)
                    print(f"measuring {mode} / {content} ...", flush=True)
                    results.append({"mode": mode, "content": content, **measure(pid, a.seconds, a.settle)})
            finally:
                stop_mover(mover)
    finally:
        stop(tone)
        if started and not a.keep_stack:
            subprocess.run(devstack.py() + [str(RELAY_DIR / "devstack.py"), "down"])

    head = ["mode", "content", "CPU", "frames/s", "Hz", "video avg/max ms", "audio avg/max ms", "budget"]
    rows = [[r["mode"], r["content"]] + fmt(r) for r in results]
    widths = [max(len(str(x)) for x in col) for col in zip(head, *rows)]
    for row in [head] + rows:
        print("  ".join(str(c).ljust(w) for c, w in zip(row, widths)))
    if a.json:
        Path(a.json).write_text(json.dumps(results, indent=2))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "_readconsole":
        _readconsole(int(sys.argv[2]))
    elif len(sys.argv) > 1 and sys.argv[1] == "_mover":
        _mover()
    else:
        main()
