#!/usr/bin/env python3
"""Lane B gate (Aurora-5ipy.45): PATCH /api/v1/state, scopes and the spec on a running app.

    py tools/light-viz-relay/lane_b_gate.py [--app PATH] [--keep] [--allow-skip] [--skip-schemathesis]

Brings up the fake-Hue stack (devstack.py), then checks on the fake bridge that pause stops
the stream and resume restarts it, that brightness and effect reach the lights, and that a
light test ends superseded. Scopes run over the host's LAN address with real tokens: Control
can PATCH but not apply, Draft cannot PATCH. Then a JSON 404 on /api/v2 and, last, Schemathesis
from a venv built from docs/api/requirements.txt, failing on its exit code. Response shapes are
checked there only. Doubles as the launch check on each OS. Exits 0 when every step passes.
The script itself is stdlib only.
"""
import argparse, json, os, socket, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import devstack as ds
import lane_a_gate as la
import sequence_c_gate as sc

RESULTS = sc.RESULTS
step = sc.step
SESSION = "lane-b"
DARK_EFFECT = "lane-b-dark"
VENV = ds.STATE / "lane-b-venv"
SPEC = ds.REPO / "docs/api/openapi.yaml"
REQUIREMENTS = ds.REPO / "docs/api/requirements.txt"


def api(base, method, path, body=None, token=None):
    """(status, headers, parsed body) without raising on 4xx or 5xx."""
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        r = urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as e:
        r = e
    with r:
        return r.status, r.headers, json.loads(r.read() or b"{}")


def patch(base, body, token=None, status=200):
    got, _, doc = api(base, "PATCH", "/api/v1/state", body, token)
    assert got == status, (body, got, doc)
    return doc


def lan_address():
    """This host's outbound IPv4 address, which the app (bound to all interfaces) also serves."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 9))
            return s.getsockname()[0]
    except OSError as e:
        raise sc.Skip(f"no LAN address on this box ({e})")


def silent(frames, what, seconds=15):
    end = time.time() + seconds
    while time.time() < end:
        if time.time() - frames.stamp > 1.5:
            return
        time.sleep(0.1)
    raise AssertionError(f"frames never stopped after {what}")


def dark_graph(base):
    graph = api(base, "GET", "/api/v1/effects/builtin.video")[2]["graph"]
    return sc.dark_graph(graph)


@step("launch: running, lit, v1 state served")
def launch(base, frames):
    state = api(base, "GET", "/api/v1/state")[2]
    assert state["state"] == "running" and state["effect"] == "builtin.video", state
    level = frames.wait(sc.lit, "lit at start")
    return f"running builtin.video, level {level:.2f}"


@step("pause stops the stream, resume restarts it")
def pause_resume(base, frames):
    before = sc.bridge_counts()
    assert patch(base, {"running": False})["state"] == "paused"
    silent(frames, "pause")
    mid = sc.bridge_counts()
    assert mid["stop"] == before["stop"] + 1 and mid["start"] == before["start"], (before, mid)
    assert patch(base, {"running": True})["state"] == "running"
    frames.wait(sc.lit, "lit after resume")
    after = sc.bridge_counts()
    assert after["start"] == mid["start"] + 1, (mid, after)
    return f"stop {before['stop']}->{mid['stop']}, start {mid['start']}->{after['start']}, frames silent while paused"


@step("brightness applies without a rebuild")
def brightness(base, frames):
    base_level = frames.wait(sc.lit, "lit")
    starts = sc.bridge_counts()
    doc = patch(base, {"brightness": 20})
    assert doc["brightness"] == 20, doc
    low = frames.wait(lambda v: v < base_level * 0.5, "dimmed")
    assert patch(base, {"brightness": 100})["brightness"] == 100
    high = frames.wait(lambda v: v > base_level * 0.8, "restored")
    assert sc.bridge_counts() == starts, "brightness restarted the Hue stream"
    return f"{base_level:.2f} -> {low:.2f} at 20% -> {high:.2f} at 100%, stream untouched"


@step("effect applies")
def effect(base, frames):
    graph = dark_graph(base)
    code, _, doc = api(base, "PUT", f"/api/v1/graph/drafts/{SESSION}", {"graph": graph})
    assert code == 200 and doc["valid"], (code, doc)
    code, _, doc = api(base, "POST", "/api/v1/graph/apply", {"session": SESSION, "id": DARK_EFFECT})
    assert code == 200, (code, doc)
    frames.wait(sc.dark, "dark under the applied effect")
    state = patch(base, {"effect": "builtin.video"})
    assert state["effect"] == "builtin.video", state
    frames.wait(sc.lit, "lit on the built-in")
    state = patch(base, {"effect": DARK_EFFECT})
    assert state["effect"] == DARK_EFFECT and state["requestedEffect"] == DARK_EFFECT, state
    frames.wait(sc.dark, "dark on the saved effect")
    patch(base, {"effect": "builtin.video"}, status=200)
    frames.wait(sc.lit, "lit again")
    return f"built-in lit, {DARK_EFFECT} dark, back to the built-in"


@step("a light test ends superseded")
def superseded(base, frames):
    assert api(base, "POST", "/api/v1/graph/test", {"session": SESSION})[0] == 200
    frames.wait(sc.dark, "dark under test")
    patch(base, {"brightness": 100})
    assert api(base, "GET", "/api/v1/graph/test")[2]["active"], "brightness ended the test"
    patch(base, {"effect": DARK_EFFECT})
    test = api(base, "GET", "/api/v1/graph/test")[2]
    assert not test["active"] and test["lastEnd"] == "superseded", test
    patch(base, {"effect": "builtin.video"})
    frames.wait(sc.lit, "lit after the test")
    return "brightness left the test running, the effect change ended it superseded"


def pair(lan, local, scope):
    """Pairs over the LAN address, approved on loopback the way the user does in Aurora."""
    code, _, ticket = api(lan, "POST", "/api/v1/pairing/request", {"name": f"lane-b-{scope}", "scope": scope})
    assert code == 202, (code, ticket)
    pending = api(local, "GET", "/api/pairing/pending")[2]["pending"]
    ref = next(p["ref"] for p in pending if p["code"] == ticket["code"])
    assert api(local, "POST", f"/api/pairing/pending/{ref}/approve", {})[0] == 200
    time.sleep(ticket["interval"])
    code, _, doc = api(lan, "GET", "/api/v1/pairing/request/" + ticket["pollKey"])
    assert code == 200 and doc["scope"] == scope, (code, doc)
    return doc["token"]


@step("scopes over the LAN address")
def scopes(local, frames):
    lan = f"http://{lan_address()}:{local.rsplit(':', 1)[1]}"
    status = api(lan, "GET", "/api/v1/pairing/status")[2]
    assert status["required"] is True and status["scope"] == "none", status
    patch(lan, {"brightness": 100}, status=401)
    control = pair(lan, local, "control")
    draft = pair(lan, local, "draft")
    assert patch(lan, {"brightness": 100}, control)["brightness"] == 100
    # An unknown session keeps this harmless if the scope check ever lets it through.
    code, headers, doc = api(lan, "POST", "/api/v1/graph/apply", {"session": "no-such", "id": "x"}, control)
    assert code == 403 and headers.get_content_type() == la.PROBLEM, (code, doc)
    code, _, doc = api(lan, "PUT", f"/api/v1/graph/drafts/{SESSION}", {"graph": dark_graph(local)}, draft)
    assert code == 200, (code, doc)
    code, headers, doc = api(lan, "PATCH", "/api/v1/state", {"brightness": 100}, draft)
    assert code == 403 and headers.get_content_type() == la.PROBLEM, (code, doc)
    return f"{lan}: no token 401, Control PATCH 200 and apply 403, Draft PUT 200 and PATCH 403"


@step("/api/v2 answers a JSON 404")
def v2(base):
    la.problem(base, "GET", "/api/v2/state", 404, "not_found")
    la.problem(base, "PATCH", "/api/v2/state", 404, "not_found", {"brightness": 50})
    return "GET and PATCH on /api/v2/state leave as problem+json 404"


@step("Schemathesis against the spec")
def schemathesis(base):
    py = VENV / ("Scripts/python.exe" if ds.WIN else "bin/python")
    if not py.exists() and subprocess.run([sys.executable, "-m", "venv", str(VENV)]).returncode:
        raise AssertionError("venv creation failed (Debian and Ubuntu need the python3-venv package)")
    if subprocess.run([str(py), "-m", "pip", "install", "--quiet", "-r", str(REQUIREMENTS)]).returncode:
        raise AssertionError("pip install failed (the first run needs PyPI access)")
    # The venv's own console script, so a stray schemathesis on PATH is never used.
    exe = py.with_name("schemathesis.exe" if ds.WIN else "schemathesis")
    run = subprocess.run([str(exe), "run", str(SPEC), "--url", base, "--phases", "examples,coverage",
                          "--checks", "response_schema_conformance,not_a_server_error"],
                         env=dict(os.environ, PYTHONIOENCODING="utf-8"),  # its banner fails on cp1252
                         cwd=ds.STATE)  # keeps its .schemathesis cache out of the repo
    assert run.returncode == 0, f"schemathesis exited {run.returncode}"
    return "examples and coverage phases, response_schema_conformance and not_a_server_error"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app")
    ap.add_argument("--keep", action="store_true", help="leave the stack up afterwards")
    ap.add_argument("--allow-skip", action="store_true", help="a SKIP (no LAN address) does not fail the run")
    ap.add_argument("--skip-schemathesis", action="store_true", help="skip the venv build and spec run")
    args = ap.parse_args()

    ds.up(SimpleNamespace(app=args.app, viz_port=8000, banner_errors=0, input="dummy",
                          audio_input=None))
    ok = False
    try:
        port = ds.find_webui()
        base = f"http://127.0.0.1:{port}"
        frames = sc.Frames()
        launch(base, frames)
        pause_resume(base, frames)
        brightness(base, frames)
        effect(base, frames)
        superseded(base, frames)
        scopes(base, frames)
        v2(base)
        if not args.skip_schemathesis:
            schemathesis(base)
        ok = True
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}", flush=True)
    finally:
        if not args.keep:
            ds.down(None)
    print("\n== Lane B gate ==")
    for name, status, note, secs in RESULTS:
        print(f"{status:4} {secs:5.1f}s  {name}  {note}")
    skipped = any(r[1] == "SKIP" for r in RESULTS)
    sys.exit(0 if ok and (args.allow_skip or not skipped) else 1)


if __name__ == "__main__":
    main()
