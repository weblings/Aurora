#!/usr/bin/env python3
"""Live validation of the DevLightTap -> relay -> SSE chain (stdlib only).

Run against a real Aurora + relay.py, not a self-check (that's check.py).

  passthrough  Sits between the tap and the relay as a UDP tee: records every
               datagram the tap sends, forwards it to the relay, and records
               what an SSE subscriber receives. PASS = identical sequences.
               Run Aurora with AURORA_DEV_LIGHT_TAP_ADDRESS=127.0.0.1:18246.

  color        Samples the SSE stream and checks per-zone values against an
               expected on-screen color (solid red/green/blue/gray/#RRGGBB),
               per zone (--zone ID=COLOR) or for all zones (--expect COLOR).
               No expectation = just print the per-zone table.

  frame        Cross-checks the tap's reported zone colors against an
               independent recomputation from DevFrameDump's raw captured
               frame -- works for arbitrary (not just solid-color) on-screen
               content, unlike `color`. Needs a zone-map JSON file (the same
               shape Aurora::Runtime::ZoneMapStore saves/loads, e.g.
               tools/fake-hue-bridge/room-4zone-zonemap.json) so it knows
               each zone's uvs/gamma. Run Aurora with AURORA_DEV_LIGHT_TAP=1
               AURORA_DEV_FRAME_DUMP=1.

Examples:
    python3 validate.py passthrough --seconds 10
    python3 validate.py color --expect red
    python3 validate.py color --expect gray --gamma-factor 0.5
    python3 validate.py color --zone 0=red --zone 1=blue
    python3 validate.py frame --zonemap ../fake-hue-bridge/room-4zone-zonemap.json
"""

import argparse
import base64
import json
import math
import socket
import statistics
import sys
import threading
import time
import urllib.request

START_SENTINEL = json.dumps({"zones": [], "_validate": "start"})
END_SENTINEL = json.dumps({"zones": [], "_validate": "end"})

NAMED_COLORS = {
    "red": (255, 0, 0),
    "green": (0, 255, 0),
    "blue": (0, 0, 255),
    "white": (255, 255, 255),
    "black": (0, 0, 0),
    "gray": (128, 128, 128),
    "grey": (128, 128, 128),
}


class SseReader(threading.Thread):
    """Collects SSE `data:` payloads (raw strings, in arrival order)."""

    def __init__(self, url):
        super().__init__(daemon=True)
        self.url = url
        self.payloads = []
        self.lock = threading.Lock()
        self.error = None
        self.connected = threading.Event()

    def run(self):
        try:
            with urllib.request.urlopen(self.url, timeout=30) as resp:
                self.connected.set()
                for raw in resp:
                    line = raw.decode("utf-8").rstrip("\r\n")
                    if line.startswith("data: "):
                        with self.lock:
                            self.payloads.append(line[len("data: "):])
        except Exception as exc:  # surfaced by the caller, not swallowed
            self.error = exc
            self.connected.set()

    def snapshot(self):
        with self.lock:
            return list(self.payloads)

    def wait_for(self, payload, timeout):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if payload in self.snapshot():
                return True
            time.sleep(0.02)
        return False


def start_reader(args):
    reader = SseReader(f"http://{args.relay_host}:{args.http_port}/events")
    reader.start()
    reader.connected.wait(5)
    if reader.error or not reader.connected.is_set():
        sys.exit(f"FAIL: can't reach relay SSE at {reader.url} ({reader.error}) -- is relay.py running?")
    return reader


# --- passthrough ------------------------------------------------------------

def run_passthrough(args):
    tee = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        tee.bind((args.tee_host, args.tee_port))
    except OSError as exc:
        sys.exit(f"FAIL: can't bind tee on {args.tee_host}:{args.tee_port} ({exc})")
    tee.settimeout(0.1)
    relay_addr = (args.relay_host, args.udp_port)

    reader = start_reader(args)

    # Relay registers the subscriber just after sending headers, so a
    # connected socket isn't proof of subscription -- ping until echoed.
    deadline = time.monotonic() + 5
    while not reader.wait_for(START_SENTINEL, 0.2):
        tee.sendto(START_SENTINEL.encode(), relay_addr)
        if time.monotonic() > deadline:
            sys.exit("FAIL: relay never echoed the start sentinel -- wrong --udp-port?")

    print(f"tee: {args.tee_host}:{args.tee_port} -> relay {relay_addr[0]}:{relay_addr[1]}, "
          f"recording {args.seconds}s...")
    sent = []
    deadline = time.monotonic() + args.seconds
    while time.monotonic() < deadline:
        try:
            data, _ = tee.recvfrom(65535)
        except socket.timeout:
            continue
        sent.append(data.decode("utf-8", errors="replace"))
        tee.sendto(data, relay_addr)

    tee.sendto(END_SENTINEL.encode(), relay_addr)
    if not reader.wait_for(END_SENTINEL, 5):
        sys.exit("FAIL: end sentinel never arrived over SSE")

    received = reader.snapshot()
    start = len(received) - 1 - received[::-1].index(START_SENTINEL)
    received = received[start + 1:received.index(END_SENTINEL, start)]

    print(f"sent (tap -> tee):      {len(sent)}")
    print(f"received (relay -> SSE): {len(received)}")
    if args.seconds > 0 and sent:
        print(f"send rate: {len(sent) / args.seconds:.1f} frames/s")

    if not sent:
        sys.exit("FAIL: tap sent nothing to the tee -- is Aurora running with "
                 f"AURORA_DEV_LIGHT_TAP=1 AURORA_DEV_LIGHT_TAP_ADDRESS={args.tee_host}:{args.tee_port} "
                 "and a registered hue output?")

    if sent == received:
        if all(json.loads(p).get("zones") == [] for p in sent):
            print("WARN: transport OK, but every frame has an empty zone list -- "
                  "nothing meaningful was carried (see `color` mode)")
        print("PASS: every datagram arrived byte-identical and in order")
        return

    sent_set, received_set = set(sent), set(received)
    missing = [p for p in sent if p not in received_set]
    extra = [p for p in received if p not in sent_set]
    print(f"FAIL: sequences differ -- {len(missing)} sent-but-not-received, "
          f"{len(extra)} received-but-never-sent, order differs: {not missing and not extra}")
    for label, items in (("missing", missing), ("extra", extra)):
        for p in items[:3]:
            print(f"  {label}: {p[:200]}")
    sys.exit(1)


# --- color ------------------------------------------------------------------

def parse_color(text):
    text = text.strip().lower()
    if text in NAMED_COLORS:
        rgb = NAMED_COLORS[text]
    elif text.startswith("#") and len(text) == 7:
        rgb = tuple(int(text[i:i + 2], 16) for i in (1, 3, 5))
    else:
        raise argparse.ArgumentTypeError(f"unknown color {text!r} (name or #RRGGBB)")
    return tuple(c / 255 for c in rgb)


def parse_zone_expectation(text):
    zone_id, sep, color = text.partition("=")
    if not sep:
        raise argparse.ArgumentTypeError("--zone takes ID=COLOR")
    return int(zone_id), parse_color(color)


def per_zone_medians(frames):
    by_zone = {}
    for frame in frames:
        for z in frame.get("zones", []):
            by_zone.setdefault(z["id"], []).append((z["r"], z["g"], z["b"]))
    return {zid: tuple(statistics.median(v[i] for v in vals) for i in range(3))
            for zid, vals in sorted(by_zone.items())}


def expected_after_gamma(rgb, gamma_factor):
    # Mirrors HueOutput's toChannelStream: pow(color, 2^(-2*gammaFactor)).
    exponent = 2 ** (-2 * gamma_factor)
    return tuple(c ** exponent for c in rgb)


def implied_gamma_factor(value, source):
    # Inverse of the above, for reporting when gamma isn't asserted.
    if not (0 < value < 1 and 0 < source < 1):
        return None
    return -math.log2(math.log(value) / math.log(source)) / 2


def check_zone(zid, observed, expected_src, args):
    problems = []
    is_neutral = max(expected_src) - min(expected_src) < 1e-6
    has_midtones = any(0 < c < 1 for c in expected_src)

    if has_midtones and args.gamma_factor is None:
        # Gamma unknown: check shape (neutral stays neutral, still a midtone),
        # report the gamma. Black/white would pass neutrality on their own.
        if is_neutral and max(observed) - min(observed) > args.tolerance:
            problems.append("not neutral (channels differ)")
        if max(observed) < args.tolerance or min(observed) > 1 - args.tolerance:
            problems.append("not a midtone (reads as black/white)")
        factor = implied_gamma_factor(statistics.mean(observed), expected_src[0]) if is_neutral else None
        note = f"implied gammaFactor={factor:.2f}" if factor is not None else "gamma not asserted"
        return problems, note

    expected = expected_after_gamma(expected_src, args.gamma_factor or 0.0)
    for name, o, e in zip("rgb", observed, expected):
        if abs(o - e) > args.tolerance:
            problems.append(f"{name}={o:.3f} expected {e:.3f}")

    # Name the classic bug outright rather than leaving it to the reader.
    # Only meaningful when something is actually lit (all-zero has no "dominant").
    if problems and sum(1 for c in expected_src if c > 0.5) == 1 and max(observed) > 0.5:
        want = "rgb"[max(range(3), key=lambda i: expected_src[i])]
        got = "rgb"[max(range(3), key=lambda i: observed[i])]
        if want != got:
            problems.append(f"dominant channel is {got.upper()} not {want.upper()} -- channel order swap?")
    return problems, ""


def run_color(args):
    reader = start_reader(args)
    print(f"sampling {args.seconds}s (judging the last half, after smoothing settles)...")
    time.sleep(args.seconds)

    frames = []
    for p in reader.snapshot():
        try:
            frame = json.loads(p)
        except json.JSONDecodeError:
            sys.exit(f"FAIL: relay forwarded non-JSON: {p[:200]}")
        if "_validate" not in frame:
            frames.append(frame)
    if not frames:
        sys.exit("FAIL: no frames received -- is Aurora running with the tap enabled?")

    medians = per_zone_medians(frames[len(frames) // 2:])
    expectations = dict(args.zone or [])
    if args.expect:
        for zid in medians:
            expectations.setdefault(zid, args.expect)

    print(f"{len(frames)} frames, {len(medians)} zones")
    if not medians:
        # Frames flowing but empty = hue output has no zones (e.g. invalid
        # entertainment-config selection), never a color pass.
        sys.exit("FAIL: every frame has an empty zone list -- check the hue output's "
                 "bridge/entertainment config (profiles/hue.json will be [])")
    failed = False
    for zid in sorted(set(medians) | set(expectations)):
        if zid not in medians:
            print(f"  zone {zid}: MISSING from stream")
            failed = True
            continue
        r, g, b = medians[zid]
        line = f"  zone {zid}: r={r:.3f} g={g:.3f} b={b:.3f}"
        if zid in expectations:
            problems, note = check_zone(zid, medians[zid], expectations[zid], args)
            failed |= bool(problems)
            line += "  " + ("FAIL: " + "; ".join(problems) if problems else "ok") + (f"  ({note})" if note else "")
        print(line)

    if not expectations:
        return
    if failed:
        sys.exit("FAIL")
    print("PASS")


# --- frame --------------------------------------------------------------

class FrameReader(threading.Thread):
    """Collects DevFrameDump datagrams (parsed JSON dicts, arrival order)."""

    def __init__(self, host, port):
        super().__init__(daemon=True)
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind((host, port))
        self.sock.settimeout(0.2)
        self.frames = []
        self.lock = threading.Lock()
        self._stop = threading.Event()

    def run(self):
        while not self._stop.is_set():
            try:
                data, _addr = self.sock.recvfrom(65535)
            except socket.timeout:
                continue
            try:
                frame = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            with self.lock:
                self.frames.append(frame)

    def snapshot(self):
        with self.lock:
            return list(self.frames)

    def stop(self):
        self._stop.set()
        self.sock.close()


def load_zonemap(path):
    # Same shape Aurora::Runtime::ZoneMapStore saves/loads
    # (core/Runtime/src/ZoneMapStore.cpp) -- a plain JSON array, not this
    # tool's usual SSE/UDP JSON-line shapes.
    with open(path) as f:
        zone_map = json.load(f)
    for zone in zone_map:
        if "zoneId" not in zone or "uvs" not in zone:
            sys.exit(f"FAIL: {path} doesn't look like a ZoneMapStore zone map: {zone!r}")
    return {z["zoneId"]: z for z in zone_map}


def crop_mean_rgb(width, height, fmt, raw, uv_min, uv_max):
    # Mirrors ImageProcessing::getSubImage + Algorithms::mean
    # (core/Processing/src/ImageProcessing.cpp) exactly: truncating
    # (not rounding) uv->pixel conversion, per-channel arithmetic mean
    # over the crop, format-aware channel reorder, uint8 truncation
    # before normalization -- matching C++'s static_cast<uint8_t> before
    # Color::toNormalized() divides by 255.
    channels = 4 if fmt in ("RGBA", "BGRA") else 3

    ax = max(0, int(uv_min[0] * width))
    ay = max(0, int(uv_min[1] * height))
    bx = min(int(uv_max[0] * width), width)
    by = min(int(uv_max[1] * height), height)
    if bx <= ax or by <= ay:
        return (0.0, 0.0, 0.0)  # matches getDominantColor's width<1/height<1 case

    sums = [0, 0, 0]
    count = 0
    for y in range(ay, by):
        row = y * width * channels
        for x in range(ax, bx):
            p = row + x * channels
            sums[0] += raw[p]
            sums[1] += raw[p + 1]
            sums[2] += raw[p + 2]
            count += 1

    means = [int(s / count) for s in sums]  # truncate like static_cast<uint8_t>
    if fmt in ("RGB", "RGBA"):
        r, g, b = means
    else:  # BGR, BGRA
        b, g, r = means

    return (r / 255.0, g / 255.0, b / 255.0)


def run_frame(args):
    zone_map = load_zonemap(args.zonemap)

    sse_reader = start_reader(args)
    frame_reader = FrameReader(args.frame_host, args.frame_port)
    frame_reader.start()

    print(f"sampling {args.seconds}s (zonemap: {len(zone_map)} zones from {args.zonemap})...")
    time.sleep(args.seconds)
    frame_reader.stop()

    tap_frames = [f for p in sse_reader.snapshot()
                 for f in [json.loads(p)] if "_validate" not in f]
    frames = frame_reader.snapshot()

    if not frames:
        sys.exit("FAIL: no frames received -- is Aurora running with "
                 f"AURORA_DEV_FRAME_DUMP=1 AURORA_DEV_FRAME_DUMP_ADDRESS={args.frame_host}:{args.frame_port}?")
    if not tap_frames:
        sys.exit("FAIL: no tap zone-color frames received over SSE -- "
                 "is AURORA_DEV_LIGHT_TAP=1 set and pointed at this relay?")

    # Paired by arrival index, not a shared timestamp/sequence number:
    # DevFrameDump.publish() and (via HueOutput::send()) DevLightTap's
    # publish() both fire once per Orchestrator::update() tick, in that
    # order, so the Nth frame and Nth tap message correspond -- true for a
    # single registered output; a multi-output setup would need each
    # output's own SSE stream disambiguated, out of scope here.
    pairs = list(zip(frames, tap_frames))
    print(f"{len(frames)} frames, {len(tap_frames)} tap zone-color messages, "
          f"comparing {len(pairs)} paired samples")

    worst_by_zone = {}
    compared = 0
    for frame, tap_frame in pairs:
        raw = base64.b64decode(frame["data"])
        for tap_zone in tap_frame.get("zones", []):
            zid = tap_zone["id"]
            if zid not in zone_map:
                continue  # zone-map file doesn't cover this id -- can't cross-check it
            zone = zone_map[zid]
            if not zone.get("active", True):
                continue

            recomputed = crop_mean_rgb(
                frame["width"], frame["height"], frame["format"], raw,
                zone["uvs"]["min"], zone["uvs"]["max"])
            expected = expected_after_gamma(recomputed, zone.get("gamma", 0.0))
            observed = (tap_zone["r"], tap_zone["g"], tap_zone["b"])

            delta = max(abs(o - e) for o, e in zip(observed, expected))
            compared += 1
            if delta > worst_by_zone.get(zid, -1):
                worst_by_zone[zid] = delta

    if not compared:
        sys.exit("FAIL: nothing to compare -- tap zone ids never matched any id in the zone-map file")

    failed = False
    for zid in sorted(worst_by_zone):
        worst = worst_by_zone[zid]
        status = "ok" if worst <= args.tolerance else "FAIL"
        failed |= worst > args.tolerance
        print(f"  zone {zid}: worst per-channel delta over the run = {worst:.4f}  {status}")

    if failed:
        sys.exit("FAIL")
    print("PASS")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0],
                                     formatter_class=argparse.RawDescriptionHelpFormatter,
                                     epilog="\n".join(__doc__.splitlines()[2:]))
    parser.add_argument("--relay-host", default="127.0.0.1")
    parser.add_argument("--udp-port", type=int, default=18244, help="relay's UDP-in port")
    parser.add_argument("--http-port", type=int, default=18245, help="relay's SSE port")
    sub = parser.add_subparsers(dest="mode", required=True)

    p = sub.add_parser("passthrough", help="tap-sent vs SSE-received, byte for byte")
    p.add_argument("--seconds", type=float, default=10)
    p.add_argument("--tee-host", default="127.0.0.1")
    p.add_argument("--tee-port", type=int, default=18246, help="point AURORA_DEV_LIGHT_TAP_ADDRESS here")
    p.set_defaults(func=run_passthrough)

    c = sub.add_parser("color", help="per-zone values vs an expected on-screen color")
    c.add_argument("--seconds", type=float, default=3)
    c.add_argument("--expect", type=parse_color, help="color every zone should show")
    c.add_argument("--zone", type=parse_zone_expectation, action="append", help="ID=COLOR, repeatable")
    c.add_argument("--tolerance", type=float, default=0.08, help="per-channel, 0..1 (default 0.08)")
    c.add_argument("--gamma-factor", type=float,
                   help="zone gammaFactor to assert for midtones; omitted = report it instead")
    c.set_defaults(func=run_color)

    fr = sub.add_parser("frame", help="tap values vs independent recomputation from the raw captured frame")
    fr.add_argument("--seconds", type=float, default=5)
    fr.add_argument("--zonemap", required=True, help="path to a ZoneMapStore-shaped zone-map JSON file")
    fr.add_argument("--frame-host", default="127.0.0.1")
    fr.add_argument("--frame-port", type=int, default=18247, help="point AURORA_DEV_FRAME_DUMP_ADDRESS here")
    fr.add_argument("--tolerance", type=float, default=0.05, help="per-channel, 0..1 (default 0.05)")
    fr.set_defaults(func=run_frame)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
