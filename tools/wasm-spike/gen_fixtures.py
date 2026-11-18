"""Writes the fixed inputs both spike builds read (Aurora-51nv.4).

frames.rgba: 30 frames of 64x32 RGBA (shifting gradient, as VideoParityTests).
pcm.f32:     240 ticks x 800 mono float32 samples at 48 kHz (click track).
Generated once in Python so native and WASM read identical bytes.
"""
import math
import struct
import sys
from pathlib import Path

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)

W, H, FRAMES = 64, 32, 30
with open(out / "frames.rgba", "wb") as f:
    for tick in range(FRAMES):
        for y in range(H):
            for x in range(W):
                s = (x + tick * 3) % 64
                f.write(bytes([(255 - s * 4) & 255, (y * 8) & 255, (s * 4) & 255, 255]))

RATE, PER_TICK, TICKS = 48000, 800, 240
state = 12345


def noise():
    global state
    state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
    return state / 2147483648.0 - 1.0


def click(since, bright):
    if since < 0 or since > RATE // 20:
        return 0.0
    t = since / RATE
    tone = 0.4 * math.sin(2 * math.pi * bright * t) if bright > 0 else 0.0
    return math.exp(-t / 0.008) * (0.5 * noise() + tone)


beat = RATE // 2
with open(out / "pcm.f32", "wb") as f:
    for i in range(PER_TICK * TICKS):
        bed = 0.05 * math.sin(2 * math.pi * 220.0 * ((i % RATE) / RATE))
        b = i // beat
        v = bed + click(i - b * beat - RATE // 10, 3000.0 if b % 2 else 0.0)
        f.write(struct.pack("<f", v))
print("wrote", out)
