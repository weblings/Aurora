#!/usr/bin/env python3
"""Self-check for the fake Hue bridge (stdlib only, no extra deps).

Starts fake_bridge.py on an ephemeral port, asserts every endpoint shape
Aurora's output/hue slice parses, then shuts the server down. Run from
this directory:

    python3 check.py
"""

import json
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CTX = ssl._create_unverified_context()

# Bypass any ambient HTTP(S)_PROXY: the target is always localhost, and a
# proxy would only blackhole the self-check (seen in sandboxed shells that
# export HTTPS_PROXY without a localhost no_proxy entry).
_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    urllib.request.HTTPSHandler(context=CTX))

PASS_COUNT = 0


def check(name, condition, detail=""):
    global PASS_COUNT
    if not condition:
        sys.exit(f"FAIL: {name} {detail}")
    PASS_COUNT += 1
    print(f"ok: {name}")


def start_server(*extra_args):
    proc = subprocess.Popen(
        [sys.executable, str(HERE / "fake_bridge.py"), "--port", "0",
         *extra_args],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    first_line = proc.stdout.readline()
    port = int(first_line.rsplit(":", 1)[-1])
    return proc, port


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def request(port, method, path, body=None):
    url = f"https://127.0.0.1:{port}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    try:
        with _OPENER.open(req, timeout=10) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


def main():
    proc, port = start_server()

    try:
        status, config = request(port, "GET", "/api/0/config")
        check("validate shape has name+bridgeid",
              status == 200 and "name" in config and "bridgeid" in config,
              repr(config))

        status, reg = request(port, "POST", "/api",
                              {"devicetype": "aurora#check", "generateclientkey": True})
        check("register returns username+clientkey",
              status == 200 and "success" in reg[0]
              and "username" in reg[0]["success"]
              and "clientkey" in reg[0]["success"], repr(reg))

        status, entconfs = request(
            port, "GET", "/clip/v2/resource/entertainment_configuration")
        ids = {c["id"] for c in entconfs["data"]}
        check("two entertainment configs served", ids == {"conf-living-room", "conf-office"},
              repr(ids))
        members = entconfs["data"][0]["channels"][0]["members"]
        check("channel members carry entertainment rids",
              all(m["service"]["rid"].startswith("ent-") for m in members),
              repr(members))

        status, resources = request(port, "GET", "/clip/v2/resource")
        devices = [d for d in resources["data"] if d["type"] == "device"]
        check("devices resolve names plus both rid spaces",
              len(devices) == 2
              and all(d["metadata"]["name"] for d in devices)
              and {s["rtype"] for d in devices for s in d["services"]}
              == {"entertainment", "light"}, repr(resources))

        conf_id = "conf-living-room"
        status, before = request(
            port, "GET", f"/clip/v2/resource/entertainment_configuration/{conf_id}")
        check("stream starts inactive", before["data"][0]["status"] == "inactive",
              repr(before))
        request(port, "PUT",
                f"/clip/v2/resource/entertainment_configuration/{conf_id}",
                {"action": "start", "metadata": {"name": "Living Room"}})
        status, active = request(
            port, "GET", f"/clip/v2/resource/entertainment_configuration/{conf_id}")
        check("start flips status to active",
              active["data"][0]["status"] == "active", repr(active))
        request(port, "PUT",
                f"/clip/v2/resource/entertainment_configuration/{conf_id}",
                {"action": "stop", "metadata": {"name": "Living Room"}})
        status, stopped = request(
            port, "GET", f"/clip/v2/resource/entertainment_configuration/{conf_id}")
        check("stop flips status back", stopped["data"][0]["status"] == "inactive",
              repr(stopped))

        status, light = request(port, "GET", "/clip/v2/resource/light/light-1")
        snap = light["data"][0]
        check("light snapshot shape",
              snap["metadata"]["name"] == "Lamp A"
              and "on" in snap["on"] and "brightness" in snap["dimming"]
              and "x" in snap["color"]["xy"], repr(snap))
        status, _ = request(port, "PUT", "/clip/v2/resource/light/light-1",
                            {"on": {"on": True}, "dynamics": {"duration": 400}})
        check("light PUT accepted", status == 200, f"status={status}")

        status, unknown = request(port, "GET", "/clip/v2/resource/light/nope")
        check("unknown light 404s as JSON", status == 404, repr(unknown))

        status, state = request(port, "GET", "/dev/link-button")
        check("link-button reads pressed by default",
              state == {"pressed": True}, repr(state))
        status, state = request(port, "PUT", "/dev/link-button",
                                {"pressed": False})
        check("link-button toggles to not-pressed",
              state == {"pressed": False}, repr(state))
        status, reg = request(port, "POST", "/api", {"devicetype": "x"})
        check("register fails with 101 while not-pressed",
              reg[0].get("error", {}).get("type") == 101, repr(reg))
        request(port, "PUT", "/dev/link-button", {"pressed": True})
        status, reg = request(port, "POST", "/api", {"devicetype": "x"})
        check("register succeeds after console-style press",
              "success" in reg[0], repr(reg))
    finally:
        stop_server(proc)

    proc2, port2 = start_server("--link-button", "not-pressed")
    try:
        status, reg = request(port2, "POST", "/api", {"devicetype": "x"})
        check("link-button mode returns error 101",
              reg[0].get("error", {}).get("type") == 101, repr(reg))
    finally:
        stop_server(proc2)

    print(f"\n{PASS_COUNT} checks passed")


if __name__ == "__main__":
    main()
