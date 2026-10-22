#!/usr/bin/env python3
"""Sequence D gate (Aurora-4xqt.12): a scripted MCP client against the fake-Hue stack.

    py tools/light-viz-relay/sequence_d_gate.py [--app PATH] [--adapter PATH] [--keep]

Spawns the aurora-mcp adapter over stdio, as an agent client would. Phase 1 runs
the stack with no audio input: a both-input graph must fail preview and
try_on_lights with the 'ask the user to choose' message. Phase 2 restarts the
stack with an audio input and walks status, the both preset, a broken draft fixed
from the error options, preview, try on lights from a video-live state, keep,
apply, the mcpEffectId and toggle state, an app restart, revert_effect, and a
killed client whose test reverts on its own. A phase 2 with no audio input on the
box is reported SKIP, which fails the run unless --allow-skip. Stdlib only.
"""
import argparse, json, os, queue, subprocess, sys, threading, time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import devstack as ds
import sequence_c_gate as sc

RESULTS = sc.RESULTS
step = sc.step
call = sc.call
KEPT = "d6-gate"
APPLIED = "d6-gate-lit"


class Client:
    """A minimal MCP client: newline-delimited JSON-RPC over the adapter's stdio."""

    def __init__(self, adapter, url):
        env = dict(os.environ, AURORA_URL=url)
        self.proc = subprocess.Popen([str(adapter)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, env=env)
        self.lines = queue.Queue()
        self.next_id = 0
        threading.Thread(target=self._read, daemon=True).start()
        init = self.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                       "clientInfo": {"name": "sequence-d-gate", "version": "1"}})
        assert init["serverInfo"]["name"] == "aurora" and init.get("instructions"), init
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _read(self):
        for raw in self.proc.stdout:
            self.lines.put(raw.decode())
        self.lines.put(None)

    def _send(self, msg):
        self.proc.stdin.write((json.dumps(msg) + "\n").encode())
        self.proc.stdin.flush()

    def rpc(self, method, params, timeout=90):
        self.next_id += 1
        self._send({"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params})
        line = self.lines.get(timeout=timeout)
        assert line is not None, "the adapter closed its stdout"
        reply = json.loads(line)
        assert reply["id"] == self.next_id and "error" not in reply, reply
        return reply["result"]

    def tool(self, name, **args):
        """(isError, structured result or text) of one tools/call."""
        r = self.rpc("tools/call", {"name": name, "arguments": args})
        return r["isError"], r.get("structuredContent", r["content"][0]["text"])

    def ok(self, name, **args):
        err, out = self.tool(name, **args)
        assert not err, f"{name} failed: {out}"
        return out

    def kill(self):
        self.proc.kill()
        self.proc.wait()

    def close(self):
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=15)
        except Exception:
            self.proc.kill()


def adapter_path(args):
    if args.adapter:
        return Path(args.adapter)
    app = Path(args.app) if args.app else ds.DEFAULT_APP
    return app.parent / ("aurora-mcp.exe" if ds.WIN else "aurora-mcp")


def state(base):
    return call(base, "GET", "/api/state")[1]


def run_phase(label, adapter, args, audio, body):
    ds.up(SimpleNamespace(app=args.app, viz_port=8000, banner_errors=0, input="dummy",
                          audio_input="live" if audio else None))
    try:
        port = ds.find_webui()
        base = f"http://127.0.0.1:{port}"
        frames = sc.Frames()
        frames.wait(sc.lit, "lit at start")
        if audio and not call(base, "GET", "/api/capabilities")[1]["audioInputs"]:
            RESULTS.append((f"{label}: audio input", "SKIP", "no audio input on this box", 0.0))
            print(f"SKIP {label}: no audio input on this box", flush=True)
            return True
        body({"base": base, "port": port, "frames": frames, "adapter": adapter, "app": Path(args.app) if args.app else ds.DEFAULT_APP})
        return not any(s == "FAIL" for _, s, _, _ in RESULTS)
    except Exception as e:
        print(f"FAIL {label}: {type(e).__name__}: {e}", flush=True)
        return False
    finally:
        if not args.keep:
            ds.down(None)
            # kill() doesn't wait: the next phase's up() would see the ports still bound
            end = time.time() + 15
            while time.time() < end and any(ds.port_open(p) for p in (18443, 18244, 18245, 8000)):
                time.sleep(0.2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app")
    ap.add_argument("--adapter")
    ap.add_argument("--keep", action="store_true", help="leave the stack up afterwards")
    ap.add_argument("--allow-skip", action="store_true")
    args = ap.parse_args()
    adapter = adapter_path(args)
    if not adapter.exists():
        sys.exit(f"adapter binary not found: {adapter} (build it, or pass --adapter)")

    ok = run_phase("no audio input", adapter, args, False, no_audio_phase)
    if ok:
        ok = run_phase("audio input", adapter, args, True, audio_phase)
    print("\n== Sequence D gate ==")
    for name, status, note, secs in RESULTS:
        print(f"{status:4} {secs:5.1f}s  {name}  {note}")
    skipped = any(s == "SKIP" for _, s, _, _ in RESULTS)
    sys.exit(0 if ok and (args.allow_skip or not skipped) else 1)


def no_audio_phase(c):
    client = Client(c["adapter"], c["base"])
    try:
        both_input_refused(c, client)
    finally:
        client.close()


@step("no audio input: both-input graph refused")
def both_input_refused(c, client):
    status = client.ok("aurora_status")
    assert status["configuredInputs"]["audio"] is None and status["configuredInputs"]["video"], status
    both = client.ok("get_preset", id="both")
    saved = client.ok("put_draft", graph=both["graph"])
    assert saved["valid"], saved
    for tool in ("preview", "try_on_lights"):
        err, text = client.tool(tool)
        assert err and "ask the user to choose" in text, (tool, err, text)
    assert not client.ok("aurora_status")["activeTest"]
    assert sc.lit(c["frames"].wait(sc.lit, "stayed lit"))
    return "preview and try_on_lights both say to ask the user, configuredInputs.audio null, no test started"


def audio_phase(c):
    client = Client(c["adapter"], c["base"])
    c["client"] = client
    ctx = {}
    # Silence holds the last frame, and a capture that delivers no buffers never runs the
    # audio chain (the pulse falls through to factor 1), so give the dark steps a signal.
    tone = sc.Tone()
    try:
        tone.start()
        status_and_preset(c, client, ctx)
        broken_draft_fixed(c, client, ctx)
        dark_preview(c, client, ctx)
        try_and_keep(c, client, ctx)
        apply_lit(c, client, ctx)
        restart_check(c, client)
        revert_effect(c, client)
        killed_client(c)
    finally:
        tone.stop()
        client.close()


@step("status and the both preset")
def status_and_preset(c, client, ctx):
    status = client.ok("aurora_status")
    assert status["running"] and not status["fallback"] and status["configuredInputs"]["audio"], status
    assert status["inputs"]["video"] and not status["inputs"]["audio"], status
    presets = client.ok("list_presets")["presets"]
    assert any(p["id"] == "both" and p["inputs"] == ["video", "audio"] for p in presets), presets
    ctx["graph"] = client.ok("get_preset", id="both")["graph"]
    return f"live {status['effect']} on video only, audio {status['configuredInputs']['audio']} chosen"


@step("broken draft fixed from the error options")
def broken_draft_fixed(c, client, ctx):
    graph = json.loads(json.dumps(ctx["graph"]))
    next(n for n in graph["nodes"] if n["id"] == "level")["type"] = "smooth.expo"
    bad = client.ok("put_draft", graph=graph)
    assert not bad["valid"], bad
    err = next(e for e in bad["errors"] if e["node"] == "level")
    assert err["code"] == "node_type_unknown" and err["options"], err
    next(n for n in graph["nodes"] if n["id"] == "level")["type"] = err["options"][0]
    good = client.ok("put_draft", graph=graph)
    assert good["valid"], good
    ctx["graph"] = graph
    return f"{err['code']} on level, fixed with option {err['options'][0]}"


@step("preview of a dark draft")
def dark_preview(c, client, ctx):
    for label in ("Quiet brightness", "Loud brightness"):
        assert client.ok("set_control", control=label, value=0)["valid"]
    summary = client.ok("preview", seconds=3)
    zones = summary["outputs"][0]["zones"]
    # A fresh preview starts bright until its audio chain delivers a buffer (Mac: ~1 s), so
    # the window's max and 'reacting' include that transient; the dark end is what counts.
    low = max(z["brightnessMin"] for z in zones)
    assert low < 0.05, summary
    assert sc.lit(c["frames"].wait(sc.lit, "stayed lit")), "live lights changed during the preview"
    return f"reached dark (brightness min {low:.2f}, reacting {summary['reacting']}), live lights untouched"


@step("try on lights, keep")
def try_and_keep(c, client, ctx):
    base = c["base"]
    assert state(base)["usesVideoInput"] and not state(base)["usesAudioInput"]
    before = sc.bridge_counts()
    started = client.ok("try_on_lights")
    assert started["started"], started
    c["frames"].wait(sc.dark, "went dark under test")
    s = state(base)
    assert s["usesVideoInput"] and s["usesAudioInput"], s
    assert client.ok("aurora_status")["activeTest"]
    time.sleep(started["revertAfterMs"] / 1000 * 0.6)
    c["frames"].wait(sc.dark, "stayed dark on the adapter's heartbeats")
    kept = client.ok("keep", id=KEPT)
    assert kept["applied"] and kept["effect"] == KEPT, kept
    s = state(base)
    assert s["effect"] == KEPT and s["mcpEffectId"] == KEPT, s
    assert not call(base, "GET", "/api/graph/test")[1]["active"]
    after = sc.bridge_counts()
    assert after == before, f"the test restarted the Hue stream: {before} -> {after}"
    return f"dark under test past revertAfterMs/2, kept as {KEPT}, mcpEffectId set, Hue starts held at {before['start']}"


@step("apply, mcpEffectId and toggle state")
def apply_lit(c, client, ctx):
    base = c["base"]
    for label in ("Quiet brightness", "Loud brightness"):
        assert client.ok("set_control", control=label, value=1)["valid"]
    applied = client.ok("apply", id=APPLIED)
    assert applied["applied"] and applied["effect"] == APPLIED, applied
    c["frames"].wait(sc.lit, "lit under the applied graph")
    s = state(base)
    # The Dashboard shows its MCP toggle while mcpEffectId is set, filled only while that effect runs.
    assert s["effect"] == APPLIED and s["mcpEffectId"] == APPLIED, s
    return f"{APPLIED} running, mcpEffectId {s['mcpEffectId']} (toggle shown and filled)"


@step("restart keeps the MCP effect")
def restart_check(c, client):
    c["frames"].level = None
    port = sc.restart_app(c["app"], c["port"])
    assert port == c["port"], f"WebUI moved from {c['port']} to {port}, the adapter's URL is stale"
    c["frames"].wait(sc.lit, "lit after restart", 60)
    s = state(c["base"])
    assert s["effect"] == APPLIED and s["mcpEffectId"] == APPLIED and not s["errors"], s
    status = client.ok("aurora_status")
    assert status["effect"] == APPLIED and not status["fallback"], status
    return f"{APPLIED} running again, mcpEffectId kept, the adapter reconnected"


@step("revert_effect")
def revert_effect(c, client):
    out = client.ok("revert_effect")
    assert out["effect"] == "builtin.video", out
    s = state(c["base"])
    # mcpEffectId stays set, so the toggle remains but is unfilled while another effect runs.
    assert s["effect"] == "builtin.video" and s["mcpEffectId"] == APPLIED, s
    c["frames"].wait(sc.lit, "lit on the built-in")
    return f"back on {out['restored']}, toggle unfilled (mcpEffectId {s['mcpEffectId']})"


@step("killed client reverts the test")
def killed_client(c):
    base = c["base"]
    victim = Client(c["adapter"], base)
    graph = victim.ok("get_preset", id="both")["graph"]
    for n in graph["nodes"]:
        if n["id"] == "pulse":
            n["params"]["outMin"] = n["params"]["outMax"] = 0
    assert victim.ok("put_draft", graph=graph)["valid"]
    started = victim.ok("try_on_lights")
    c["frames"].wait(sc.dark, "went dark under test")
    victim.kill()
    t = time.time()
    c["frames"].wait(sc.lit, "reverted after the client was killed", started["revertAfterMs"] / 1000 + 20)
    info = call(base, "GET", "/api/graph/test")[1]
    assert info["lastEnd"] == "heartbeat_lost" and not info["active"], info
    s = state(base)
    assert s["effect"] == "builtin.video" and not s["errors"], s
    return f"lit again {time.time() - t:.1f}s after the kill (revertAfterMs {started['revertAfterMs']}), lastEnd heartbeat_lost"


if __name__ == "__main__":
    main()
