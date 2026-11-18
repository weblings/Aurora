"""Compares two parity .jsonl outputs zone by zone (Aurora-51nv.4, .7).

usage: compare.py native.jsonl wasm.jsonl [--label NAME] [--summary FILE]
Values are normalized 0..1 channels. Passes when every channel differs by less than
1/255. Prints bit-identical and 8-bit-difference counts, exits 1 on failure, and
with --summary appends a markdown line (for $GITHUB_STEP_SUMMARY).
"""
import argparse
import json
import sys

parser = argparse.ArgumentParser()
parser.add_argument("native")
parser.add_argument("wasm")
parser.add_argument("--label", default="parity")
parser.add_argument("--summary")
args = parser.parse_args()


def load(path):
    return [json.loads(line) for line in open(path)]


def fail(message):
    print(f"FAIL: {message}")
    if args.summary:
        with open(args.summary, "a") as f:
            f.write(f"- {args.label}: FAIL, {message}\n")
    sys.exit(1)


a, b = load(args.native), load(args.wasm)
if not a or len(a) != len(b):
    fail(f"frame count {len(a)} vs {len(b)}")
worst, worst_at, differing, total, byte_diff = 0.0, None, 0, 0, 0
for fa, fb in zip(a, b):
    if fa["tick"] != fb["tick"] or len(fa["zones"]) != len(fb["zones"]):
        fail(f"frame shape differs at tick {fa['tick']}")
    for za, zb in zip(fa["zones"], fb["zones"]):
        if za[0] != zb[0] or za[4] != zb[4]:
            fail(f"zone id or gamma differs at tick {fa['tick']}: {za} vs {zb}")
        for ca, cb in zip(za[1:4], zb[1:4]):
            total += 1
            d = abs(ca - cb) * 255
            if ca != cb:
                differing += 1
            if round(ca * 255) != round(cb * 255):
                byte_diff += 1
            if d > worst:
                worst, worst_at = d, (fa["tick"], za[0])
print(f"frames={len(a)} channel values={total}")
print(f"bit-identical: {total - differing}/{total}")
print(f"max diff: {worst:.4f} of 255 at (tick, zone)={worst_at}")
print(f"differ after rounding to 8 bit: {byte_diff}")
ok = worst < 1.0
line = (f"{args.label}: {'pass' if ok else 'FAIL'}, bit-identical {total - differing}/{total}, "
        f"8-bit differences {byte_diff}, max diff {worst:.4f}/255")
print(("PASS: " if ok else "FAIL: ") + line)
if args.summary:
    with open(args.summary, "a") as f:
        f.write(f"- {line}\n")
sys.exit(0 if ok else 1)
