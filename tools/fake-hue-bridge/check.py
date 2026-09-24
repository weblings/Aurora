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

import fixtures

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
        check("three entertainment configs served",
              ids == {"conf-living-room", "conf-office", "conf-room-4zone"},
              repr(ids))
        members = entconfs["data"][0]["channels"][0]["members"]
        check("channel members carry entertainment rids",
              all(m["service"]["rid"].startswith("ent-") for m in members),
              repr(members))

        room_conf = next(c for c in entconfs["data"] if c["id"] == "conf-room-4zone")
        room_channel_ids = {c["channel_id"] for c in room_conf["channels"]}
        check("conf-room-4zone reports exactly 4 channels, ids 0-3",
              room_channel_ids == {0, 1, 2, 3}, repr(room_channel_ids))
        room_rids_by_channel = {
            c["channel_id"]: c["members"][0]["service"]["rid"]
            for c in room_conf["channels"]
        }
        check("conf-room-4zone channels map to the dedicated quadrant lamps in order",
              room_rids_by_channel == {0: "ent-3", 1: "ent-4", 2: "ent-5", 3: "ent-6"},
              repr(room_rids_by_channel))

        status, resources = request(port, "GET", "/clip/v2/resource")
        devices = [d for d in resources["data"] if d["type"] == "device"]
        check("devices resolve names plus both rid spaces",
              len(devices) == len(fixtures.DEVICES)
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

    check_room_4zone_zonemap()

    print(f"\n{PASS_COUNT} checks passed")


def check_room_4zone_zonemap():
    # Standalone check against Aurora::Runtime::ZoneMapStore's exact JSON
    # schema (core/Runtime/src/ZoneMapStore.cpp) -- this file has no C++
    # build to round-trip through here, so this is the closest available
    # confirmation the shape is one Aurora will actually parse correctly.
    path = HERE / "room-4zone-zonemap.json"
    zone_map = json.loads(path.read_text())

    check("room-4zone-zonemap.json has exactly 4 entries",
          len(zone_map) == 4, repr(zone_map))

    zone_ids = {z["zoneId"] for z in zone_map}
    check("zone ids are exactly 0-3, matching conf-room-4zone's channel_ids",
          zone_ids == {0, 1, 2, 3}, repr(zone_ids))

    for zone in zone_map:
        check(f"zone {zone['zoneId']} has ZoneMapStore's required keys",
              {"zoneId", "uvs", "active", "gamma", "everConfigured"} <= zone.keys(),
              repr(zone))
        mn, mx = zone["uvs"]["min"], zone["uvs"]["max"]
        check(f"zone {zone['zoneId']} uvs are well-formed (min < max, both in [0,1])",
              len(mn) == 2 and len(mx) == 2
              and 0 <= mn[0] < mx[0] <= 1 and 0 <= mn[1] < mx[1] <= 1,
              repr(zone["uvs"]))

    # The 4 quadrants should exactly tile the full [0,1]x[0,1] frame -- no
    # gaps, no overlaps -- so every point maps to exactly one zone.
    area = sum((z["uvs"]["max"][0] - z["uvs"]["min"][0])
              * (z["uvs"]["max"][1] - z["uvs"]["min"][1]) for z in zone_map)
    check("the 4 quadrants' areas sum to exactly 1.0 (full tiling, no gaps/overlaps)",
          abs(area - 1.0) < 1e-9, repr(area))

    by_id = {z["zoneId"]: z["uvs"] for z in zone_map}
    check("zone 0 (front-left) is the top-left quadrant",
          by_id[0] == {"min": [0, 0], "max": [0.5, 0.5]}, repr(by_id[0]))
    check("zone 1 (front-right) is the top-right quadrant",
          by_id[1] == {"min": [0.5, 0], "max": [1, 0.5]}, repr(by_id[1]))
    check("zone 2 (back-left) is the bottom-left quadrant",
          by_id[2] == {"min": [0, 0.5], "max": [0.5, 1]}, repr(by_id[2]))
    check("zone 3 (back-right) is the bottom-right quadrant",
          by_id[3] == {"min": [0.5, 0.5], "max": [1, 1]}, repr(by_id[3]))


if __name__ == "__main__":
    main()
