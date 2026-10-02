#!/usr/bin/env python3
"""Stdlib-only self-check for the fake Home Assistant server.

Spawns fake_ha.py on an ephemeral port and drives it the way Aurora's
future HA output will: auth, list lights, call turn_on and see the delayed
reply, plus the OAuth token endpoints. Run before finishing any change
here:

    python3 check.py
"""

import base64
import json
import os
import re
import socket
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

FAKE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fake_ha.py")
CLIENT_ID = "http://127.0.0.1:9999/"


class WsError(Exception):
    pass


class Ws:
    """Minimal masked-text WebSocket client (server frames are unmasked)."""

    def __init__(self, host, port):
        self.sock = socket.create_connection((host, port), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        self.sock.sendall((
            "GET /api/websocket HTTP/1.1\r\n"
            "Host: %s:%d\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
            % (host, port, key)).encode("ascii"))
        head = b""
        while b"\r\n\r\n" not in head:
            data = self.sock.recv(4096)
            if not data:
                raise WsError("handshake: connection dropped")
            head += data
        status_line, _, rest = head.partition(b"\r\n\r\n")
        if b"101" not in status_line.split(b"\r\n", 1)[0]:
            raise WsError("handshake: expected 101, got %r" % head[:60])
        # The 101 and the first frame can share a TCP segment; bytes past
        # the headers belong to the frame reader, not the floor.
        self._buf = rest

    def send(self, obj):
        payload = json.dumps(obj).encode("utf-8")
        mask = os.urandom(4)
        header = bytes([0x81])
        if len(payload) < 126:
            header += bytes([0x80 | len(payload)])
        elif len(payload) < 65536:
            header += bytes([0x80 | 126]) + struct.pack(">H", len(payload))
        else:
            header += bytes([0x80 | 127]) + struct.pack(">Q", len(payload))
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(header + mask + masked)

    def recv(self, timeout=10):
        """Next text message as JSON; answers pings, raises on close."""
        self.sock.settimeout(timeout)
        try:
            while True:
                header = self._recvn(2)
                opcode, masked_len = header[0] & 0x0F, header[1]
                length = masked_len & 0x7F
                if length == 126:
                    length = struct.unpack(">H", self._recvn(2))[0]
                elif length == 127:
                    length = struct.unpack(">Q", self._recvn(8))[0]
                payload = self._recvn(length) if length else b""
                if opcode == 0x8:
                    raise WsError("closed by peer")
                if opcode == 0x9:  # ping -> pong, same payload back
                    self._send_frame(payload, opcode=0xA)
                    continue
                if opcode == 0xA:
                    continue
                if opcode != 0x1:
                    raise WsError("unexpected opcode %d" % opcode)
                return json.loads(payload.decode("utf-8"))
        except socket.timeout:
            raise WsError("timed out waiting for message")

    def _recvn(self, count):
        chunks = []
        while count > 0:
            if self._buf:
                data, self._buf = self._buf[:count], self._buf[count:]
            else:
                data = self.sock.recv(count)
                if not data:
                    raise WsError("closed by peer")
            chunks.append(data)
            count -= len(data)
        return b"".join(chunks)

    def _send_frame(self, payload, opcode=0x1):
        mask = os.urandom(4)
        header = bytes([0x80 | opcode, 0x80 | len(payload)])
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(header + mask + masked)

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


def spawn(*extra):
    proc = subprocess.Popen(
        [sys.executable, FAKE, "--port", "0"] + list(extra),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    line = proc.stdout.readline()
    match = re.search(r"http://127\.0\.0\.1:(\d+)", line or "")
    if not match:
        _, err = proc.communicate(timeout=10)
        raise WsError("server did not print a listen line: %r\n%s"
                      % (line, err))
    return proc, int(match.group(1))


def http_get(port, path):
    with urllib.request.urlopen("http://127.0.0.1:%d%s" % (port, path),
                                timeout=10) as response:
        return response.status, json.loads(response.read() or b"{}")


def http_post(port, path, form, as_json=False):
    if as_json:
        data = json.dumps(form).encode("utf-8")
        content = "application/json"
    else:
        data = urllib.parse.urlencode(form).encode("utf-8")
        content = "application/x-www-form-urlencoded"
    request = urllib.request.Request(
        "http://127.0.0.1:%d%s" % (port, path), data=data,
        headers={"Content-Type": content})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


def check_auth_flow(port, token):
    ws = Ws("127.0.0.1", port)
    hello = ws.recv()
    assert hello["type"] == "auth_required", hello
    ws.send({"type": "auth", "access_token": token})
    ok = ws.recv()
    assert ok["type"] == "auth_ok", ok
    return ws


def check_bad_token_rejected(port):
    ws = Ws("127.0.0.1", port)
    assert ws.recv()["type"] == "auth_required"
    ws.send({"type": "auth", "access_token": "wrong-token"})
    denied = ws.recv()
    assert denied["type"] == "auth_invalid", denied
    try:
        ws.recv(timeout=5)
    except WsError:
        return  # close after auth_invalid is the HA behavior
    raise AssertionError("connection stayed open after auth_invalid")


def check_no_auth_timeout():
    proc, port = spawn("--auth-timeout", "1")
    try:
        ws = Ws("127.0.0.1", port)
        assert ws.recv()["type"] == "auth_required"
        start = time.monotonic()
        try:
            ws.recv(timeout=5)  # send nothing; server must close at ~1s
        except WsError:
            pass
        assert time.monotonic() - start < 4, "auth timeout not enforced"
    finally:
        proc.terminate()


def check_states_and_registry(ws):
    ws.send({"id": 1, "type": "get_states"})
    reply = ws.recv()
    assert reply["id"] == 1 and reply["success"], reply
    states = {s["entity_id"]: s for s in reply["result"]}
    assert len(states) == 4, states.keys()
    hallway = states["light.hallway_bulb"]
    assert hallway["attributes"]["supported_color_modes"] == ["color_temp"], \
        hallway
    assert "rgb_color" not in hallway["attributes"], hallway
    ws.send({"id": 2, "type": "config/entity_registry/list"})
    reply = ws.recv()
    assert reply["id"] == 2 and reply["success"], reply
    platforms = {e["entity_id"]: e["platform"] for e in reply["result"]}
    assert platforms == {"light.living_room": "hue",
                         "light.kitchen_strip": "wled",
                         "light.desk_glow": "lifx",
                         "light.hallway_bulb": "zwave_js"}, platforms


def check_turn_on_delayed(ws, delay):
    ws.send({"id": 3, "type": "call_service", "domain": "light",
             "service": "turn_on",
             "target": {"entity_id": "light.living_room"},
             "service_data": {"rgb_color": [255, 0, 0], "brightness": 128}})
    start = time.monotonic()
    reply = ws.recv(timeout=10)
    elapsed = time.monotonic() - start
    assert reply["id"] == 3 and reply["success"], reply
    assert elapsed >= delay - 0.1, "reply came too fast: %.2fs" % elapsed
    assert "context" in reply["result"], reply
    ws.send({"id": 4, "type": "get_states"})
    states = {s["entity_id"]: s for s in ws.recv()["result"]}
    living = states["light.living_room"]["attributes"]
    assert living["rgb_color"] == [255, 0, 0], living
    assert living["brightness"] == 128, living


def check_unknown_and_ping(ws):
    ws.send({"id": 5, "type": "bogus_command"})
    reply = ws.recv()
    assert reply["id"] == 5 and not reply["success"], reply
    ws.send({"id": 6, "type": "ping"})
    assert ws.recv() == {"id": 6, "type": "pong"}


def check_subscribe_burst(ws, count):
    ws.send({"id": 7, "type": "subscribe_events",
             "event_type": "state_changed"})
    assert ws.recv()["success"], "subscribe failed"
    for _ in range(count):
        event = ws.recv(timeout=10)
        assert event == {"id": 7, "type": "event", "event": event["event"]}, \
            event
        assert event["event"]["event_type"] == "state_changed", event


def check_oauth_flow(port):
    query = urllib.parse.urlencode(
        {"client_id": CLIENT_ID, "redirect_uri": CLIENT_ID,
         "response_type": "code", "state": "xyz"})
    status, body = http_get(port, "/auth/authorize?" + query)
    assert status == 200 and body["state"] == "xyz", (status, body)
    code = body["code"]
    status, pair = http_post(port, "/auth/token",
                             {"grant_type": "authorization_code",
                              "code": code, "client_id": CLIENT_ID})
    assert status == 200 and pair["expires_in"] == 1800, (status, pair)
    ws = check_auth_flow(port, pair["access_token"])  # issued token works
    ws.close()
    status, pair2 = http_post(port, "/auth/token",
                              {"grant_type": "refresh_token",
                               "refresh_token": pair["refresh_token"],
                               "client_id": CLIENT_ID}, as_json=True)
    assert status == 200, (status, pair2)
    status, _ = http_post(port, "/auth/token",  # rotated: old refresh dead
                          {"grant_type": "refresh_token",
                           "refresh_token": pair["refresh_token"],
                           "client_id": CLIENT_ID})
    assert status == 400, status
    status, body = http_post(port, "/auth/token",  # wrong client_id rejected
                             {"grant_type": "refresh_token",
                              "refresh_token": pair2["refresh_token"],
                              "client_id": "http://10.0.0.9:9999/"})
    assert status == 400 and body["error"] == "invalid_grant", (status, body)


def main():
    delay, burst = 0.5, 5
    proc, port = spawn("--turn-on-delay", str(delay),
                       "--event-burst", str(burst))
    try:
        ws = check_auth_flow(port, "fake-dev-token")
        try:
            check_states_and_registry(ws)
            check_turn_on_delayed(ws, delay)
            check_unknown_and_ping(ws)
            check_subscribe_burst(ws, burst)
        finally:
            ws.close()
        check_bad_token_rejected(port)
        check_oauth_flow(port)
    finally:
        proc.terminate()
        proc.wait(timeout=10)
    check_no_auth_timeout()
    print("fake-home-assistant check: all green "
          "(auth, states, registry, delayed turn_on, oauth, burst)")


if __name__ == "__main__":
    main()
