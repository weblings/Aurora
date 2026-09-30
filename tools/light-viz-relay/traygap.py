"""Open Aurora's tray menu programmatically, hold it, measure SSE frame gaps."""
import ctypes, sys, threading, time, urllib.request
HOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 5.0
u = ctypes.windll.user32
u.FindWindowExA.restype = ctypes.c_void_p
u.FindWindowExA.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p]
u.PostMessageA.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
u.SendMessageTimeoutA.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p]
hwnd = u.FindWindowExA(ctypes.c_void_p(-3), None, b"AuroraTrayWindow", b"Aurora")
if not hwnd:
    sys.exit("tray window not found")
stamps = []
def reader():
    with urllib.request.urlopen("http://127.0.0.1:18245/events") as r:
        for line in r:
            if line.startswith(b"data:"):
                stamps.append(time.monotonic())
threading.Thread(target=reader, daemon=True).start()
time.sleep(3)
t_open = time.monotonic()
u.PostMessageA(hwnd, 0x8001, 1, 0x0205)  # WM_TRAYICON, WM_RBUTTONUP
time.sleep(HOLD)
t_close = time.monotonic()
u.SendMessageTimeoutA(hwnd, 0x001F, 0, 0, 2, 2000, None)  # WM_CANCELMODE
time.sleep(3)
gaps = [(b - a, a) for a, b in zip(stamps, stamps[1:])]
big = max(gaps) if gaps else (0, 0)
during = [s for s in stamps if t_open + 0.5 < s < t_close]
print(f"frames total={len(stamps)} during_hold({HOLD}s)={len(during)} max_gap={big[0]:.2f}s at t={big[1]-t_open:+.2f}s (0=menu open, {HOLD}=close)")
print("PASS" if len(during) > HOLD * 5 else "FAIL: pipeline stalled while menu open")
