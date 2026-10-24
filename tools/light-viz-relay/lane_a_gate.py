#!/usr/bin/env python3
"""Lane A smoke gate (Aurora-5ipy.34): the external-control contracts on a running app.

    py tools/light-viz-relay/lane_a_gate.py [--app PATH] [--keep]

Brings up the fake-Hue stack (devstack.py), then checks problem+json bodies and the JSON 404
under /api/, the pairing poll answers (202, 429, 403, 404) with interval and expiresIn,
retry: 3000 on /api/events, and the core helper routes (capabilities, version, stop). Stop runs
last and must end the app. A 410 needs the 300 s pairing lifetime, so PairingTests cover it.
Doubles as the launch check on each OS. Exits 0 when every step passes. Stdlib only.
"""
import argparse, json, sys, time, urllib.error, urllib.request
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import devstack as ds
import sequence_c_gate as sc

RESULTS = sc.RESULTS
step = sc.step
PROBLEM = "application/problem+json"


def raw(base, method, path, body=None):
    """(status, headers, parsed body) without raising on 4xx or 5xx."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as e:
        r = e
    with r:
        text = r.read().decode()
        return r.status, r.headers, text


def problem(base, method, path, status, code, body=None):
    got, headers, text = raw(base, method, path, body)
    assert got == status, (path, got, text)
    assert headers.get_content_type() == PROBLEM, (path, headers.get("Content-Type"))
    p = json.loads(text)
    assert p["status"] == status and p["code"] == code and p["title"], (path, p)
    assert p["error"] == code and p["succeeded"] is False, (path, p)
    return p


@step("problem+json and the JSON 404 under /api/")
def problems(base):
    problem(base, "GET", "/api/no-such-route", 404, "not_found")
    problem(base, "POST", "/api/pairing/request", 400, "invalid_json", None)
    problem(base, "POST", "/api/pairing/request", 400, "unknown_scope", {"scope": "root"})
    problem(base, "POST", "/api/pairing/pending/nope/approve", 404, "not_found", {})
    return "404, 400 invalid_json and unknown_scope, 404 on a bad ref all leave as problem+json"


def request_pairing(base, scope="draft"):
    status, _, text = raw(base, "POST", "/api/pairing/request", {"name": "lane-a-gate", "scope": scope})
    return status, json.loads(text)


def deny_all(base):
    for p in json.loads(raw(base, "GET", "/api/pairing/pending")[2])["pending"]:
        assert raw(base, "POST", f"/api/pairing/pending/{p['ref']}/deny", {})[0] == 200


@step("pairing poll answers 202, 429, 403, 404")
def pairing(base):
    status, ticket = request_pairing(base)
    assert status == 202 and ticket["interval"] > 0 and ticket["expiresIn"] > ticket["interval"], (status, ticket)
    poll = "/api/pairing/request/" + ticket["pollKey"]
    first = raw(base, "GET", poll)
    assert first[0] == 202 and json.loads(first[2])["error"] == "authorization_pending", first[::2]
    # Slow-down counts whole seconds, so a repeat that straddles a second boundary
    # is a plain 202. Keep repeating until one lands in the same second.
    for _ in range(5):
        fast = raw(base, "GET", poll)
        if fast[0] != 202:
            break
    assert fast[0] == 429 and json.loads(fast[2])["error"] == "slow_down", fast[::2]
    assert fast[1]["Retry-After"] == str(ticket["interval"]), fast[1]["Retry-After"]
    ref = next(p["ref"] for p in json.loads(raw(base, "GET", "/api/pairing/pending")[2])["pending"]
               if p["code"] == ticket["code"])
    assert raw(base, "POST", f"/api/pairing/pending/{ref}/deny", {})[0] == 200
    denied = raw(base, "GET", poll)
    assert denied[0] == 403 and json.loads(denied[2])["error"] == "access_denied", denied[::2]
    assert denied[1].get_content_type() == PROBLEM
    problem(base, "GET", "/api/pairing/request/unknown-key", 404, "not_found")
    return f"interval {ticket['interval']}s, expiresIn {ticket['expiresIn']}s, Retry-After on 429"


@step("pairing queue full answers 429")
def pairing_full(base):
    deny_all(base)
    for _ in range(20):
        status, body = request_pairing(base)
        if status == 429:
            assert body["code"] == "too_many_pending", body
            deny_all(base)
            return "too_many_pending once the queue fills"
        assert status == 202, (status, body)
    raise AssertionError("the pending queue never filled")


@step("events stream opens with retry: 3000")
def events(base):
    with urllib.request.urlopen(base + "/api/events", timeout=10) as r:
        assert r.status == 200 and r.headers.get_content_type() == "text/event-stream", r.headers
        head = b""
        while b"\n\n" not in head:
            chunk = r.read1(256)
            assert chunk, f"stream closed before the retry line: {head!r}"
            head += chunk
    assert head.startswith(b"retry: 3000\n\n"), head
    return "first bytes are retry: 3000"


@step("capabilities and version")
def helpers(base):
    status, _, text = raw(base, "GET", "/api/capabilities")
    caps = json.loads(text)
    assert status == 200 and isinstance(caps["canSelectMonitor"], bool) and caps["platform"], caps
    for key in ("inputs", "audioInputs", "outputs", "zeroOffOutputs"):
        assert isinstance(caps[key], list), (key, caps)
    assert isinstance(caps["paused"], bool), caps
    status, _, text = raw(base, "GET", "/api/version")
    version = json.loads(text)["version"]
    assert status == 200 and version, text
    return f"{caps['platform']}, version {version}, canSelectMonitor {caps['canSelectMonitor']}"


@step("stop ends the app")
def stop(base, port):
    status, _, text = raw(base, "POST", "/api/stop", {})
    assert status == 200 and json.loads(text)["succeeded"] is True, (status, text)
    ds.wait_for(lambda: not ds.port_open(port), "the app to release its WebUI port", 30)
    return "200 succeeded, WebUI port released"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app")
    ap.add_argument("--keep", action="store_true", help="leave the stack up afterwards")
    args = ap.parse_args()

    ds.up(SimpleNamespace(app=args.app, viz_port=8000, banner_errors=0, input="dummy",
                          audio_input=None))
    ok = False
    try:
        port = ds.find_webui()
        base = f"http://127.0.0.1:{port}"
        problems(base)
        pairing(base)
        pairing_full(base)
        events(base)
        helpers(base)
        stop(base, port)
        ok = True
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}", flush=True)
    finally:
        if not args.keep:
            ds.down(None)
    print("\n== Lane A gate ==")
    for name, status, note, secs in RESULTS:
        print(f"{status:4} {secs:5.1f}s  {name}  {note}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
