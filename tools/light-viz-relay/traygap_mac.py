"""Measure SSE frame gaps while a human holds Aurora's Mac status-item menu open.

    python3 tools/light-viz-relay/traygap_mac.py [WINDOW_SECONDS=20]

Needs `devstack.py up` running. Click the Aurora menu-bar icon after the
prompt and hold the menu open several seconds, then dismiss it. (Programmatic
menu opening needs Accessibility permission for the caller, which the dev
shell usually lacks -- the Windows twin, traygap.py, posts a message instead.)
Any frame gap over 0.25s is reported; PASS = max gap under 0.5s.
"""
import sys, threading, time, urllib.request
WINDOW = float(sys.argv[1]) if len(sys.argv) > 1 else 20.0
stamps = []
def reader():
    with urllib.request.urlopen("http://127.0.0.1:18245/events") as r:
        for line in r:
            if line.startswith(b"data:"):
                stamps.append(time.monotonic())
threading.Thread(target=reader, daemon=True).start()
time.sleep(1)
t0 = time.monotonic()
print(f">>> CLICK the Aurora menu-bar icon now and hold the menu open ~8s, then close it. Capturing {WINDOW:.0f}s...", flush=True)
time.sleep(WINDOW)
gaps = [(b - a, a - t0) for a, b in zip(stamps, stamps[1:]) if a >= t0]
worst = max(gaps) if gaps else (0.0, 0.0)
for g, t in gaps:
    if g > 0.25:
        print(f"  gap {g:.2f}s at t={t:+.2f}s")
print(f"frames={len(stamps)} max_gap={worst[0]:.2f}s at t={worst[1]:+.2f}s")
print("PASS" if stamps and worst[0] < 0.5 else "FAIL: pipeline stalled")
