"""Compares two spike .jsonl outputs zone by zone (Aurora-51nv.4).

usage: compare.py native.jsonl wasm.jsonl
Values are normalized 0..1 channels. Reports max abs diff (in 8-bit steps)
and how many zone values differ at all.
"""
import json
import sys


def load(path):
    return [json.loads(line) for line in open(path)]


a, b = load(sys.argv[1]), load(sys.argv[2])
assert len(a) == len(b), f"frame count {len(a)} vs {len(b)}"
worst, worst_at, differing, total, byte_diff = 0.0, None, 0, 0, 0
for fa, fb in zip(a, b):
    assert fa["tick"] == fb["tick"] and len(fa["zones"]) == len(fb["zones"])
    for za, zb in zip(fa["zones"], fb["zones"]):
        assert za[0] == zb[0] and za[4] == zb[4], (fa["tick"], za, zb)
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
