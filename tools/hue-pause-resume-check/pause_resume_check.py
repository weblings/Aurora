#!/usr/bin/env python3
"""Aurora-jwcd: cycle pause/resume against a real Hue bridge and confirm the
entertainment session actually stops and restarts, not just that Aurora's
own state flips.

Stdlib-only (urllib + ssl), matching the other devstack/check scripts.

Bridge address and entertainment_configuration id are read from Aurora's own
GET /api/hue/connection (it withholds the app key on purpose -- see
PairingRoutes.cpp -- so that still has to be supplied).

Usage:
  HUE_APP_KEY=<app-key> python pause_resume_check.py [--api http://127.0.0.1:8215] [--cycles 5]

The app key is the "hue-application-key" / username field Aurora already
holds in <configRoot>/hue-credentials.json (plain JSON -- not a secret
store). Read it from that file; do NOT re-run pairing to "see it once",
that mints a brand-new, unrelated bridge user instead (every bridge call
then 403s). The value commonly starts with "-", which breaks
`--hue-key -WwOi...` under argparse (reads as another flag) -- use
`--hue-key=-WwOi...` or the HUE_APP_KEY env var (shown above) instead.
"""

import argparse
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

UNVERIFIED_SSL = ssl._create_unverified_context()  # Hue bridges use self-signed certs


def http(method, url, body=None, headers=None, timeout=5.0):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=UNVERIFIED_SSL) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        return None, str(e)


def aurora_connection(api_base):
    status, body = http("GET", f"{api_base}/api/hue/connection")
    if status != 200 or not body or not body.get("configured"):
        print(f"Aurora has no Hue pairing configured (GET /api/hue/connection: {status} {body})", file=sys.stderr)
        sys.exit(1)
    return body["bridgeAddress"], body["entertainmentConfigurationId"]


def bridge_entertainment_resource(bridge_address, entertainment_id, app_key):
    """Returns (resource_or_None, diag) -- diag is the raw (status, body) so
    a caller can tell "bridge says 401" from "connection refused" from "200
    with no matching id" instead of all three collapsing into None."""
    url = f"https://{bridge_address}/clip/v2/resource/entertainment_configuration/{entertainment_id}"
    status, body = http("GET", url, headers={"hue-application-key": app_key})
    diag = (status, body)
    if status != 200 or not body or not body.get("data"):
        return None, diag
    return body["data"][0], diag


def aurora_paused(api_base):
    status, body = http("GET", f"{api_base}/api/state")
    if status != 200 or not body:
        return None
    return bool(body.get("paused"))


def set_running(api_base, running):
    # Pipeline::build on resume makes several sequential Hue REST calls
    # (each capped at HttpClient.cpp's 1s curl timeout) before this returns,
    # so give the client-side timeout plenty of room above that budget.
    t0 = time.monotonic()
    status, body = http("PUT", f"{api_base}/api/state", body={"running": running}, timeout=15.0)
    return status, body, time.monotonic() - t0


def poll_until(predicate, timeout_s, interval_s=0.25):
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        value = predicate()
        if value is not None and value:
            return True, time.monotonic()
        time.sleep(interval_s)
    return False, time.monotonic()


def poll_bridge_status(bridge_address, entertainment_id, app_key, want_active, timeout_s, interval_s=0.25):
    """Polls the bridge's entertainment_configuration resource until its
    status matches want_active (True -> "active", False -> anything else),
    but only counts an actual successful response -- a dropped/failed GET
    (diag status != 200, or no "data") never satisfies either direction, so
    a dead bridge connection can't masquerade as a confirmed pause.

    Returns (reached: bool, values_seen: list[str], diags_seen: list[(status, body)],
    last_resource: dict | None) -- values_seen/diags_seen are deduped
    consecutively so a stuck state prints once, not forty times.
    """
    values_seen = []
    diags_seen = []
    last_resource = None
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        resource, diag = bridge_entertainment_resource(bridge_address, entertainment_id, app_key)
        if resource is not None:
            last_resource = resource
        value = resource.get("status") if resource else "<no response>"
        if not values_seen or values_seen[-1] != value:
            values_seen.append(value)
        if not diags_seen or diags_seen[-1] != diag:
            diags_seen.append(diag)
        if resource is not None and (value == "active") == want_active:
            return True, values_seen, diags_seen, last_resource
        time.sleep(interval_s)
    return False, values_seen, diags_seen, last_resource


def run_cycle(n, api_base, bridge_address, entertainment_id, app_key, settle_timeout):
    print(f"\n--- cycle {n} ---")
    results = {"pause_ok": False, "resume_ok": False, "resume_s": None}

    status, body, put_s = set_running(api_base, False)
    if status != 200:
        print(f"  PUT /api/state running=false failed: {status} {body} ({put_s:.2f}s)")
        return results

    bridge_inactive, values_seen, diags_seen, _ = poll_bridge_status(
        bridge_address, entertainment_id, app_key, want_active=False, timeout_s=settle_timeout,
    )
    aurora_is_paused, _ = poll_until(lambda: aurora_paused(api_base), settle_timeout)
    print(f"  pause: PUT took {put_s:.2f}s, bridge session inactive={bridge_inactive} "
          f"aurora paused={aurora_is_paused} (bridge statuses seen={values_seen})")
    if not bridge_inactive:
        print(f"  pause: bridge GET diag(s): {diags_seen}")
    results["pause_ok"] = bridge_inactive and aurora_is_paused

    t_resume = time.monotonic()
    status, body, put_s = set_running(api_base, True)
    if status != 200:
        print(f"  PUT /api/state running=true failed: {status} {body} ({put_s:.2f}s)")
        return results
    print(f"  resume: PUT /api/state returned in {put_s:.2f}s -- body={body}")

    bridge_active, values_seen, diags_seen, last_resource = poll_bridge_status(
        bridge_address, entertainment_id, app_key, want_active=True, timeout_s=settle_timeout,
    )
    t_bridge_active = time.monotonic()
    aurora_resumed, _ = poll_until(lambda: aurora_paused(api_base) is False, settle_timeout)
    resume_s = t_bridge_active - t_resume if bridge_active else None
    print(f"  resume: bridge session active={bridge_active} aurora paused=False seen={aurora_resumed} "
          f"(bridge statuses seen={values_seen})"
          + (f" ({resume_s:.2f}s PUT-to-active)" if resume_s is not None else ""))
    if not bridge_active:
        print(f"  resume: bridge GET diag(s): {diags_seen}")
        if last_resource is not None:
            print(f"  resume: last successful resource read: {json.dumps(last_resource, indent=2)}")
    results["resume_ok"] = bool(bridge_active)
    results["resume_s"] = resume_s
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://127.0.0.1:8215", help="Aurora's own WebUI/API base URL")
    parser.add_argument("--hue-key", default=os.environ.get("HUE_APP_KEY"),
                         help="Hue bridge app key (hue-application-key); or set HUE_APP_KEY")
    parser.add_argument("--cycles", type=int, default=5)
    parser.add_argument("--settle-timeout", type=float, default=10.0,
                         help="seconds to wait for the bridge-side status to flip each way")
    parser.add_argument("--gap", type=float, default=1.0, help="seconds to wait between cycles")
    args = parser.parse_args()

    if not args.hue_key:
        print("Need the bridge app key: --hue-key or HUE_APP_KEY. Aurora's own API withholds it "
              "(GET /api/hue/connection never returns the username/clientkey by design).", file=sys.stderr)
        sys.exit(2)

    bridge_address, entertainment_id = aurora_connection(args.api)
    if not entertainment_id:
        print("Aurora has a bridge paired but no entertainmentConfigurationId selected yet.", file=sys.stderr)
        sys.exit(1)
    print(f"Bridge {bridge_address}, entertainment_configuration {entertainment_id}, {args.cycles} cycles")

    all_results = []
    for n in range(1, args.cycles + 1):
        all_results.append(run_cycle(n, args.api, bridge_address, entertainment_id, args.hue_key, args.settle_timeout))
        if n < args.cycles:
            time.sleep(args.gap)

    print("\n=== summary ===")
    failures = 0
    resume_times = []
    for n, r in enumerate(all_results, 1):
        ok = r["pause_ok"] and r["resume_ok"]
        failures += not ok
        if r["resume_s"] is not None:
            resume_times.append(r["resume_s"])
        print(f"cycle {n}: {'PASS' if ok else 'FAIL'}"
              + (f"  resume={r['resume_s']:.2f}s" if r["resume_s"] is not None else ""))

    if resume_times:
        print(f"resume time: min={min(resume_times):.2f}s max={max(resume_times):.2f}s "
              f"avg={sum(resume_times)/len(resume_times):.2f}s")

    if failures:
        print(f"\n{failures}/{len(all_results)} cycle(s) failed -- entertainment session didn't "
              "fully release or didn't reconnect within --settle-timeout.")
        sys.exit(1)

    print(f"\nAll {len(all_results)} cycles clean. Still confirm visually that the lights "
          "themselves went dark and streamed again each cycle -- this script only checks "
          "the bridge's and Aurora's own state, not the physical bulbs.")


if __name__ == "__main__":
    main()
