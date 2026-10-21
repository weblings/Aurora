#!/usr/bin/env python3
"""Sequence C gate (Aurora-52oz.8): a scripted client against the fake-Hue stack.

    py tools/light-viz-relay/sequence_c_gate.py [--app PATH] [--keep]

Brings the stack up on the dummy video input (devstack.py), then walks: draft,
validate, preview, test on lights, heartbeat loss and the revert, apply of a
both-input custom graph, app restart, and an output that is gone at load (the
fallback warning). Exits 0 when every step passes. A both-input step with no
audio input on the box is reported SKIP, which fails the run unless --allow-skip.
Stdlib only.
"""
import argparse, json, math, os, shutil, struct, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request, wave
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import devstack as ds

SESSION = "gate"
EFFECT = "gate-both"
RESULTS = []


class Skip(Exception):
    pass


def call(base, method, path, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


class Frames:
    """Latest zone brightness off the relay SSE, read on a thread."""

    def __init__(self):
        self.level = None
        self.stamp = 0.0
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        while True:
            try:
                with urllib.request.urlopen(ds.SSE, timeout=10) as r:
                    for line in r:
                        if line.startswith(b"data:"):
                            zones = json.loads(line[5:])["zones"]
                            self.level = sum(max(z["r"], z["g"], z["b"]) for z in zones) / len(zones)
                            self.stamp = time.time()
            except Exception:
                time.sleep(0.3)

    def wait(self, pred, what, seconds=15):
        end = time.time() + seconds
        while time.time() < end:
            if self.level is not None and time.time() - self.stamp < 1 and pred(self.level):
                return self.level
            time.sleep(0.05)
        raise AssertionError(f"lights never {what} (last level {self.level})")


class Tone:
    """A looping 440 Hz tone on the default output, for the audio capture to hear."""

    def __init__(self):
        self.path = Path(tempfile.gettempdir()) / "aurora-gate-tone.wav"
        with wave.open(str(self.path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(44100)
            w.writeframes(b"".join(
                struct.pack("<h", int(12000 * math.sin(2 * math.pi * 440 * i / 44100))) for i in range(44100)))
        self.proc = None
        self.stop_flag = False

    def _cmd(self):
        if sys.platform == "darwin":
            return ["afplay", str(self.path)]
        if sys.platform == "win32":
            return ["powershell", "-NoProfile", "-Command",
                    f"(New-Object Media.SoundPlayer '{self.path}').PlaySync()"]
        for tool in ("pw-play", "paplay", "aplay"):
            if shutil.which(tool):
                return [tool, str(self.path)]
        return None

    def start(self):
        cmd = self._cmd()
        if cmd is None:
            raise Skip("no tone player on this box")
        def loop():
            while not self.stop_flag:
                self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                self.proc.wait()
        threading.Thread(target=loop, daemon=True).start()

    def stop(self):
        self.stop_flag = True
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()


def lit(v):
    return v > 0.1


def dark(v):
    return v < 0.02


def step(name):
    def wrap(fn):
        def run(*a):
            t = time.time()
            try:
                note = fn(*a) or ""
                RESULTS.append((name, "PASS", note, time.time() - t))
            except Skip as e:
                RESULTS.append((name, "SKIP", str(e), time.time() - t))
            except Exception as e:
                RESULTS.append((name, "FAIL", f"{type(e).__name__}: {e}", time.time() - t))
                raise
            print(f"{RESULTS[-1][1]:4} {name} {RESULTS[-1][2]}", flush=True)
        return run
    return wrap


def dark_graph(live):
    g = json.loads(json.dumps(live))
    for n in g["nodes"]:
        if n["id"] == "gain_hue":
            n["params"]["gain"] = 0
    return g


def gain_of(base):
    nodes = call(base, "GET", "/api/graph")[1]["graph"]["nodes"]
    return next(n for n in nodes if n["id"] == "gain_hue")["params"]["gain"]


def preview_levels(base, seconds=8):
    """Brightness of the first preview event that carries zones."""
    r = urllib.request.urlopen(f"{base}/api/graph/preview?session={SESSION}", timeout=seconds)
    end = time.time() + seconds
    try:
        event = None
        for raw in r:
            line = raw.decode().strip()
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:") and event == "preview":
                doc = json.loads(line[5:])
                if doc["outputs"]:
                    z = doc["outputs"][0]["zones"]
                    return sum(max(c["r"], c["g"], c["b"]) for c in z) / len(z), doc["errors"]
            if time.time() > end:
                break
    finally:
        r.close()
    raise AssertionError("no preview event with zones")


def restart_app(app, base_port, between=None):
    pids = json.loads(ds.STATE_FILE.read_text())
    ds.kill(pids["app"])
    if ds.WIN:
        ds.subprocess.run(["taskkill", "/F", "/IM", "Aurora.exe"], capture_output=True)
    ds.wait_for(lambda: not ds.port_open(base_port), "the old app to release its WebUI port", 20)
    if between:
        between()
    # No --fresh: that would wipe the config root. The fresh run's root is reused as-is.
    env = dict(os.environ, AURORA_DEV_LIGHT_TAP="1", AURORA_CONFIG_DIR=str(Path(tempfile.gettempdir()) / "aurora-fresh"))
    pids["app"] = ds.spawn("app", [str(app), "--fake-hue"], env)
    ds.STATE_FILE.write_text(json.dumps(pids))
    return ds.wait_for(ds.find_webui, "the restarted WebUI port", 40)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app")
    ap.add_argument("--keep", action="store_true", help="leave the stack up afterwards")
    ap.add_argument("--allow-skip", action="store_true")
    args = ap.parse_args()
    app = Path(args.app) if args.app else ds.DEFAULT_APP

    ds.up(SimpleNamespace(app=args.app, viz_port=8000, banner_errors=0, input="dummy"))
    ok = False
    try:
        ok = run(app)
    finally:
        if not args.keep:
            ds.down(None)
    print("\n== Sequence C gate ==")
    for name, status, note, secs in RESULTS:
        print(f"{status:4} {secs:5.1f}s  {name}  {note}")
    skipped = any(s == "SKIP" for _, s, _, _ in RESULTS)
    sys.exit(0 if ok and (args.allow_skip or not skipped) else 1)


def run(app):
    port = ds.find_webui()
    base = f"http://127.0.0.1:{port}"
    frames = Frames()
    frames.wait(lit, "lit up at start")
    live = call(base, "GET", "/api/graph")[1]["graph"]
    dark_doc = dark_graph(live)
    ctx = {"base": base, "frames": frames, "live": live, "dark": dark_doc}

    try:
        draft_validate(ctx)
        preview(ctx)
        test_on_lights(ctx)
        heartbeat_lost(ctx)
        both_input_apply(ctx)
        audio_reaches_lights(ctx)
        ctx["base"] = base = restart_and_check(ctx, app, port)
        fallback_warning(ctx, app)
    except Skip:
        pass
    except Exception:
        return False
    return not any(s == "FAIL" for _, s, _, _ in RESULTS)


@step("draft + validate")
def draft_validate(c):
    b = c["base"]
    code, body = call(b, "PUT", f"/api/graph/drafts/{SESSION}", {"graph": c["dark"]})
    assert code == 200 and body["valid"], body
    code, body = call(b, "POST", "/api/graph/validate", {"graph": c["dark"]})
    assert code == 200 and body["valid"], body
    bad = json.loads(json.dumps(c["dark"]))
    bad["nodes"].append({"id": "nope", "type": "no.such.node", "params": {}})
    code, body = call(b, "POST", "/api/graph/validate", {"graph": bad})
    assert not body["valid"] and any(e["node"] == "nope" for e in body["errors"]), body
    return "valid draft accepted, bad node reported with its id"


@step("preview beside live")
def preview(c):
    level, errors = preview_levels(c["base"])
    assert dark(level) and not errors, (level, errors)
    assert lit(c["frames"].wait(lit, "stayed lit")), "live lights changed during preview"
    return f"preview {level:.2f}, live lit, nothing reached the lights"


@step("test on lights")
def test_on_lights(c):
    b = c["base"]
    code, body = call(b, "POST", "/api/graph/test", {"session": SESSION})
    assert code == 200, (code, body)
    c["frames"].wait(dark, "went dark under test")
    for _ in range(2):
        time.sleep(body["heartbeatMs"] / 1000)
        assert call(b, "POST", "/api/graph/test/heartbeat", {"session": SESSION})[0] == 200
    c["frames"].wait(dark, "stayed dark with heartbeats")
    assert gain_of(b) == 0
    return f"dark under test, revert after {body['revertAfterMs']} ms without a heartbeat"


@step("heartbeat lost reverts")
def heartbeat_lost(c):
    b = c["base"]
    t = time.time()
    c["frames"].wait(lit, "reverted", 20)
    info = call(b, "GET", "/api/graph/test")[1]
    assert info["lastEnd"] == "heartbeat_lost" and not info["active"], info
    assert gain_of(b) == 1
    state = call(b, "GET", "/api/state")[1]
    assert state["state"] == "running" and not state["errors"], state
    return f"lit again {time.time() - t:.1f}s after the last heartbeat, lastEnd heartbeat_lost"


@step("both-input custom graph applies")
def both_input_apply(c):
    b = c["base"]
    audio = call(b, "GET", "/api/capabilities")[1]["audioInputs"]
    if not audio:
        raise Skip("no audio input on this box")
    code, body = call(b, "PUT", "/api/config", {"activeAudioInputName": audio[0]})
    assert code == 200, body
    both = json.loads(json.dumps(c["live"]))
    # Audio loudness drives the video brightness: 0.05 + 20 * rms, so the zones follow the
    # tone on and off.
    both["nodes"] += [
        {"id": "mic", "type": "audio.capture", "params": {}},
        {"id": "feat", "type": "audio.features", "params": {}},
        {"id": "loud", "type": "math.scale", "params": {"factor": 20}},
        {"id": "base", "type": "math.add", "params": {"b": 0.05}},
        {"id": "amp", "type": "frame.brightnessScale", "params": {}},
    ]
    both["edges"] = [e for e in both["edges"] if e != ["gain_hue.frame", "floor_hue.frame"]]
    both["edges"] += [["mic.buffer", "feat.buffer"], ["feat.rms", "loud.value"], ["loud.value", "base.a"],
                      ["base.value", "amp.factor"], ["gain_hue.frame", "amp.frame"],
                      ["amp.frame", "floor_hue.frame"]]
    assert call(b, "PUT", f"/api/graph/drafts/{SESSION}", {"graph": both})[1]["valid"]
    code, body = call(b, "POST", "/api/graph/test", {"session": SESSION})
    assert code == 409 and body["error"] == "cannot_test", (code, body)
    code, body = call(b, "POST", "/api/graph/apply", {"session": SESSION, "id": EFFECT})
    assert code == 200 and body["effect"] == EFFECT, (code, body)
    s = call(b, "GET", "/api/state")[1]
    assert s["usesVideoInput"] and s["usesAudioInput"] and s["effect"] == EFFECT, s
    c["frames"].wait(lit, "lit under the both-input graph")
    return f"applied {EFFECT} on {audio[0]}, test on lights refused (needs a rebuild)"


@step("audio reaches the lights")
def audio_reaches_lights(c):
    if not any(r[0] == "both-input custom graph applies" and r[1] == "PASS" for r in RESULTS):
        raise Skip("needs the both-input step")
    frames = c["frames"]

    seen = []
    tone = Tone()
    try:
        for cycle in range(2):
            tone.start()
            seen.append(("tone", frames.wait(lambda v: v > 0.6, "followed the tone up", 20)))
            tone.stop()
            seen.append(("quiet", frames.wait(lambda v: v < 0.2, "followed the quiet down", 20)))
            tone = Tone()
    finally:
        tone.stop()
    text = ", ".join(f"{k} {v:.2f}" for k, v in seen)
    return text


@step("restart keeps the custom graph")
def restart_and_check(c, app, port):
    if not any(r[0] == "both-input custom graph applies" and r[1] == "PASS" for r in RESULTS):
        raise Skip("needs the both-input step")
    c["frames"].level = None
    new_port = restart_app(app, port)
    base = f"http://127.0.0.1:{new_port}"
    c["frames"].wait(lit, "lit after restart", 60)
    s = call(base, "GET", "/api/state")[1]
    assert s["effect"] == EFFECT and s["usesAudioInput"] and not s["errors"], s
    return f"{EFFECT} running again, audio input {s['source']['audio']['input']}"


@step("gone output falls back with a warning")
def fallback_warning(c, app):
    if not any(r[0] == "restart keeps the custom graph" and r[1] == "PASS" for r in RESULTS):
        raise Skip("needs the restart step")
    # Hue is the only registered output here, so the stored graph is edited to
    # name one the app no longer has, which is what a removed output looks like at load.
    root = Path(tempfile.gettempdir()) / "aurora-fresh"
    def rename_output():
        path = root / "effects" / f"{EFFECT}.json"
        doc = json.loads(path.read_text())
        for n in doc["nodes"]:
            if n["type"] == "output.send":
                n["params"]["output"] = "removed-output"
        path.write_text(json.dumps(doc))

    port = restart_app(app, ds.find_webui(), rename_output)
    base = f"http://127.0.0.1:{port}"
    s = ds.wait_for(lambda: (lambda x: x if x.get("state") == "running" else None)(call(base, "GET", "/api/state")[1]),
                    "the fallback to run", 40)
    held = [e for e in s["errors"] if e["source"] == "effect_fallback"]
    assert s["effect"] == "builtin.video" and s["requestedEffect"] == EFFECT and held, s
    c["frames"].wait(lit, "lit on the built-in")
    return f"running builtin.video, asked for {EFFECT}: {held[0]['message'][:70]}"


if __name__ == "__main__":
    main()
