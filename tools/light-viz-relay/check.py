#!/usr/bin/env python3
"""Self-check for the light-viz relay (stdlib only, no extra deps).

Starts relay.py on ephemeral ports, sends UDP datagrams at it, asserts
they arrive on the SSE side (single and multi-subscriber, plus malformed
datagrams getting dropped rather than forwarded or crashing the relay),
then shuts the server down. Run from this directory:

    python3 check.py
"""

import json
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent

PASS_COUNT = 0


def check(name, condition, detail=""):
    global PASS_COUNT
    if not condition:
        sys.exit(f"FAIL: {name} {detail}")
    PASS_COUNT += 1
    print(f"ok: {name}")


def start_relay():
    proc = subprocess.Popen(
        [sys.executable, str(HERE / "relay.py"), "--udp-port", "0", "--http-port", "0"],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    udp_line = proc.stdout.readline()
    http_line = proc.stdout.readline()
    udp_port = int(udp_line.strip().split("=", 1)[1])
    http_port = int(http_line.strip().split("=", 1)[1])
    return proc, udp_port, http_port


def stop_relay(proc):
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


class SseClient:
    """Reads SSE `data:` lines off a background thread into a list."""

    def __init__(self, http_port):
        self.events = []
        self._lock = threading.Lock()
        self._response = urllib.request.urlopen(
            f"http://127.0.0.1:{http_port}/events", timeout=20)
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()

    def _read_loop(self):
        try:
            for raw_line in self._response:
                line = raw_line.decode("utf-8").rstrip("\n")
                if line.startswith("data: "):
                    with self._lock:
                        self.events.append(line[len("data: "):])
        except Exception:
            pass  # connection closed on shutdown -- nothing left to read

    def wait_for(self, count, timeout=10):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                if len(self.events) >= count:
                    return list(self.events)
            time.sleep(0.05)
        with self._lock:
            return list(self.events)

    def close(self):
        self._response.close()


def send_udp(udp_port, payload_bytes):
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(payload_bytes, ("127.0.0.1", udp_port))
    sock.close()


def main():
    proc, udp_port, http_port = start_relay()

    try:
        client = SseClient(http_port)
        time.sleep(0.3)  # let the SSE subscription register before sending

        payload = json.dumps({"zones": [{"id": 1, "r": 1.0, "g": 0.5, "b": 0.0}]})
        send_udp(udp_port, payload.encode("utf-8"))
        events = client.wait_for(1)
        check("single subscriber receives the datagram",
              len(events) == 1 and json.loads(events[0]) == json.loads(payload),
              repr(events))

        send_udp(udp_port, b"not valid json")
        payload2 = json.dumps({"zones": []})
        send_udp(udp_port, payload2.encode("utf-8"))
        events = client.wait_for(2)
        check("malformed datagram dropped, valid one still arrives",
              len(events) == 2 and json.loads(events[1]) == {"zones": []},
              repr(events))

        client2 = SseClient(http_port)
        time.sleep(0.3)
        payload3 = json.dumps({"zones": [{"id": 2, "r": 0.0, "g": 0.0, "b": 1.0}]})
        send_udp(udp_port, payload3.encode("utf-8"))
        events1 = client.wait_for(3)
        events2 = client2.wait_for(1)
        check("second subscriber also receives new datagrams (fan-out)",
              len(events2) == 1 and json.loads(events2[0]) == json.loads(payload3),
              repr(events2))
        check("first subscriber unaffected by the second one joining",
              len(events1) == 3 and json.loads(events1[2]) == json.loads(payload3),
              repr(events1))

        client.close()
        client2.close()
    finally:
        stop_relay(proc)

    print(f"\n{PASS_COUNT} checks passed")


if __name__ == "__main__":
    main()
