#!/usr/bin/env python3
"""Bring the fake-Hue light viz stack up/down in one command (dev-only).

    py tools/light-viz-relay/devstack.py up [--app PATH] [--viz-port 8000]
    py tools/light-viz-relay/devstack.py status
    py tools/light-viz-relay/devstack.py down

Starts fake bridge, relay, the app (AURORA_DEV_LIGHT_TAP=1 --fake-hue --fresh)
and a viz web server with a real accept backlog, drops in the 4-zone zone map,
sets the fake connection + active output over REST, then waits for a frame on
the relay's SSE. Stdlib only. State (pids, logs) lives in <tmp>/aurora-devstack.
"""
import argparse, functools, json, os, shutil, signal, socket, subprocess, sys, tempfile, time
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WIN = sys.platform == "win32"
STATE = Path(tempfile.gettempdir()) / "aurora-devstack"
STATE_FILE = STATE / "state.json"
SSE = "http://127.0.0.1:18245/events"
CONNECTION = {
    "bridgeAddress": "127.0.0.1:18443",
    "username": "fakedevuser01",
    "clientkey": "00112233445566778899aabbccddeeff",
    "entertainmentConfigurationId": "conf-room-4zone",
}
DEFAULT_APP = {
    "win32": REPO / "build/windows-app/bin/Release/Aurora.exe",
    "darwin": REPO / "build/mac-app/bin/Aurora.app/Contents/MacOS/Aurora",
}.get(sys.platform, REPO / "build/linux-app/bin/Aurora")


# Real capture input per platform; "dummy" is the synthetic drifting signal.
LIVE_INPUT = {"win32": "windows", "darwin": "mac"}.get(sys.platform, "linux")


def py():
    return ["py"] if WIN and shutil.which("py") else [sys.executable]


def spawn(name, cmd, env=None, cwd=None):
    STATE.mkdir(exist_ok=True)
    log = open(STATE / f"{name}.log", "wb")
    kw = {"creationflags": 0x00000008 | 0x00000200} if WIN else {"start_new_session": True}
    p = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, env=env, cwd=cwd, **kw)
    return p.pid


def kill(pid):
    try:
        if WIN:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
        else:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
    except (OSError, ProcessLookupError):
        pass


def http(method, url, body=None, timeout=3):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_for(fn, what, seconds=30):
    end = time.time() + seconds
    while time.time() < end:
        try:
            v = fn()
            if v:
                return v
        except Exception:
            pass
        time.sleep(0.5)
    sys.exit(f"timed out waiting for {what}; logs in {STATE}")


def find_webui():
    for port in range(8215, 8235):
        if port_open(port):
            try:
                http("GET", f"http://127.0.0.1:{port}/api/hue/connection")
                return port
            except Exception:
                pass


def one_frame():
    with urllib.request.urlopen(SSE, timeout=5) as r:
        for line in r:
            if line.startswith(b"data:"):
                return line.decode()[:200]


def serve_viz(port):
    """Child mode: threaded server with request_queue_size=256 (see the
    http.server lesson in docs/lessons/build-toolchain.md)."""
    class S(ThreadingHTTPServer):
        request_queue_size = 256
        daemon_threads = True

    class H(SimpleHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        # no-store: a cached ES module beside a fresh importer breaks the page
        # after an edit (Aurora-57ct, web-testing caching lesson).
        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

    S(("127.0.0.1", port), functools.partial(H, directory=str(REPO / "web/demo"))).serve_forever()


def up(args):
    if STATE_FILE.exists():
        sys.exit("already up (or stale state) -- run `down` first")
    app = Path(args.app) if args.app else DEFAULT_APP
    if not app.exists():
        sys.exit(f"app binary not found: {app} (build it, or pass --app)")
    for p in (18443, 18244, 18245, args.viz_port):
        if port_open(p):
            sys.exit(f"port {p} already in use -- stale stack? run `down`")
    env = dict(os.environ)
    if WIN:  # fake_bridge.py shells out to openssl; Git for Windows ships one
        env["PATH"] += r";C:\Program Files\Git\usr\bin"
    pids = {}
    try:
        _start(args, app, env, pids)
    except BaseException:
        # Don't leave orphans (ports stay bound and block the next `up`).
        for pid in pids.values():
            kill(pid)
        STATE_FILE.unlink(missing_ok=True)
        raise


def _start(args, app, env, pids):
    pids["bridge"] = spawn("bridge", py() + [str(REPO / "tools/fake-hue-bridge/fake_bridge.py")], env)
    pids["relay"] = spawn("relay", py() + [str(REPO / "tools/light-viz-relay/relay.py")], env)
    STATE_FILE.write_text(json.dumps(pids))
    wait_for(lambda: port_open(18443) and port_open(18245), "bridge + relay")
    pids["viz"] = spawn("viz", py() + [str(Path(__file__).resolve()), "_serve", str(args.viz_port)], env)
    aenv = dict(env, AURORA_DEV_LIGHT_TAP="1")
    if args.banner_errors:
        # Presence-only, same convention as AURORA_DEV_LIGHT_TAP: enables
        # the dev-only /api/dev/errors routes in the app.
        aenv["AURORA_DEV_ERRORS"] = "1"
    pids["app"] = spawn("app", [str(app), "--fake-hue", "--fresh"], aenv)
    STATE_FILE.write_text(json.dumps(pids))
    port = wait_for(find_webui, "the app's WebUI port (8215+)")
    # --fresh wipes the config root at startup, so the zone map goes in AFTER launch.
    root = Path(tempfile.gettempdir()) / "aurora-fresh"  # app logs "Config root:"; $TMPDIR on Mac
    (root / "profiles").mkdir(parents=True, exist_ok=True)
    shutil.copy(REPO / "tools/fake-hue-bridge/room-4zone-zonemap.json", root / "profiles/hue.json")
    # Pairing via REST instead of the WebUI. Note PUT (not POST) for /api/config.
    base = f"http://127.0.0.1:{port}"
    # Both calls below run a pipeline reload before they respond (up to ~10s on a slow box).
    http("POST", base + "/api/hue/connection", CONNECTION, timeout=30)
    cfg = {"activeOutputNames": ["hue"], "nuxCompleted": True}
    cfg["activeInputName"] = args.input if args.input != "live" else LIVE_INPUT
    # Live capture can block on a permission/portal dialog; allow time to accept it.
    live = args.input == "live"
    http("PUT", base + "/api/config", cfg, timeout=120 if live else 30)
    frame = wait_for(one_frame, "a frame on the relay SSE", 120 if live else 40)
    for i in range(args.banner_errors):
        http("POST", base + "/api/dev/errors", {
            "source": f"dev-{i + 1}",
            "message": f"simulated banner error {i + 1} (devstack --banner-errors)",
        }, timeout=10)
    print(f"UP. WebUI {base}/  viz http://localhost:{args.viz_port}/viz.html")
    if args.banner_errors:
        print(f"banner: injected {args.banner_errors} dev error(s); the Dashboard shows 1 row, or a 'N problems' summary for 2")
    print(f"first frame: {frame}")
    print(f"logs: {STATE}")


def status(_):
    if not STATE_FILE.exists():
        return print("down (no state file)")
    print("state:", STATE_FILE.read_text())
    for p in (18443, 18244, 18245, 8000):
        print(f"  :{p}", "listening" if port_open(p) else "-")
    print("  webui port:", find_webui())


def down(_):
    pids = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    for name, pid in pids.items():
        kill(pid)
    if WIN:  # the app may have re-exec'd; belt and braces
        subprocess.run(["taskkill", "/F", "/IM", "Aurora.exe"], capture_output=True)
    STATE_FILE.unlink(missing_ok=True)
    print("down:", ", ".join(pids) or "nothing recorded")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "_serve":
        serve_viz(int(sys.argv[2]))
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    u = sub.add_parser("up")
    u.add_argument("--app")
    u.add_argument("--viz-port", type=int, default=8000)
    u.add_argument("--banner-errors", type=int, default=0, choices=[0, 1, 2],
                   help="inject 1 or 2 generic banner errors once up (dev-only /api/dev/errors, host keeps running)")
    u.add_argument("--input", default="live",
                   help='"live" (default): this platform\'s real capture; "dummy": synthetic signal')
    sub.add_parser("status")
    sub.add_parser("down")
    a = ap.parse_args()
    {"up": up, "status": status, "down": down}[a.cmd](a)
