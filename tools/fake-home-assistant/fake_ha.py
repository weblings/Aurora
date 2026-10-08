#!/usr/bin/env python3
"""Fake Home Assistant server: dev-only test target, no HA install needed.

Speaks just enough of HA's protocol for Aurora's output work (bead
Aurora-21h): the WebSocket API handshake and a few commands, plus the
OAuth-style token endpoints. Stdlib only, same as tools/fake-hue-bridge.

Usage:
    python3 fake_ha.py [--port 18123] [--turn-on-delay 0.2]

Then point a scripted client at ws://127.0.0.1:18123/api/websocket.
See README.md for the full flag list and the emulated-vs-real notes.
"""

import argparse
import base64
import copy
import hashlib
import json
import secrets
import socket
import struct
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import fixtures

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
WS_CLOSE_NORMAL = 1000
WS_CLOSE_PROTOCOL = 1002
WS_CLOSE_UNSUPPORTED = 1003

ACCESS_TOKEN_LIFETIME = 30 * 60  # HA issues 30-minute access tokens.
AUTH_CODE_LIFETIME = 10 * 60


class WsClosed(Exception):
    """Peer sent a close frame or the socket went away cleanly."""


class WsProtocolError(Exception):
    """Peer violated the framing rules; close with `code`."""

    def __init__(self, code):
        super().__init__("websocket protocol error %d" % code)
        self.code = code


def ws_send(sock, lock, payload, opcode=0x1):
    """Send one server-to-client frame (never masked, per RFC 6455)."""
    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    header = bytes([0x80 | opcode])
    length = len(payload)
    if length < 126:
        header += bytes([length])
    elif length < 65536:
        header += bytes([126]) + struct.pack(">H", length)
    else:
        header += bytes([127]) + struct.pack(">Q", length)
    with lock:
        sock.sendall(header + payload)


def ws_send_close(sock, lock, code=WS_CLOSE_NORMAL):
    try:
        ws_send(sock, lock, struct.pack(">H", code), opcode=0x8)
    except (OSError, WsClosed):
        pass


def _rfile_recvn(rfile, count):
    """Like _recvn but through the handler's buffered reader.

    BaseHTTPRequestHandler may have read past the HTTP headers into the
    first WebSocket bytes already; raw sock.recv would lose them, so all
    post-upgrade reads go through rfile. Honors the socket timeout.
    """
    chunks = []
    while count > 0:
        data = rfile.read(count)
        if not data:
            raise WsClosed("peer closed the socket")
        chunks.append(data)
        count -= len(data)
    return b"".join(chunks)


def ws_read_message(sock, lock, read):
    """Next complete client text message; answers pings, joins fragments.

    `read` supplies n bytes (the server passes its buffered rfile reader).
    Raises WsClosed on a close frame or dropped socket, WsProtocolError on
    unmasked client frames (RFC 6455 section 5.1) or binary frames, which
    this fake has no use for.
    """
    fragments = []
    while True:
        header = read(2)
        first, second = header[0], header[1]
        fin = bool(first & 0x80)
        opcode = first & 0x0F
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            length = struct.unpack(">H", read(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", read(8))[0]
        mask = read(4) if masked else None
        payload = read(length) if length else b""
        if opcode == 0x8:
            raise WsClosed("peer sent close")
        if opcode == 0x9:  # ping -> pong with the same payload
            ws_send(sock, lock, payload, opcode=0xA)
            continue
        if opcode == 0xA:  # unsolicited pong: nothing to do
            continue
        if opcode == 0x2:
            raise WsProtocolError(WS_CLOSE_UNSUPPORTED)
        if not masked:
            raise WsProtocolError(WS_CLOSE_PROTOCOL)
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        if opcode == 0x1:
            fragments = [payload]
        elif opcode == 0x0:
            fragments.append(payload)
        else:
            raise WsProtocolError(WS_CLOSE_PROTOCOL)
        if fin:
            return b"".join(fragments).decode("utf-8")


def _as_entity_list(value):
    if value is None:
        return []
    return [value] if isinstance(value, str) else list(value)


def find_light(lights, entity_id):
    return next((l for l in lights if l["entity_id"] == entity_id), None)


def apply_turn_on(light, service_data):
    """Mutate a light dict from light.turn_on service data; dev shortcut.

    Real HA converts rgb_color to the bulb's native mode; the fake just
    stores what it was told so get_states shows it back.
    """
    if "rgb_color" in service_data:
        light["rgb_color"] = [int(c) for c in service_data["rgb_color"]]
    if "brightness" in service_data:
        light["brightness"] = int(service_data["brightness"])
    if "color_temp_kelvin" in service_data:
        light["color_temp_kelvin"] = int(service_data["color_temp_kelvin"])
    light["state"] = "on"


def forward_to_viz(lights, address):
    """Best-effort forward of current colors to tools/light-viz-relay.

    Light index doubles as the relay zone id. Fire-and-forget UDP, the same
    delivery shape as output/hue's DevLightTap.
    """
    zones = []
    for index, light in enumerate(lights):
        rgb = light.get("rgb_color", [0, 0, 0])
        if light["state"] != "on":
            rgb = [0, 0, 0]
        zones.append({
            "id": index,
            "r": rgb[0] / 255.0,
            "g": rgb[1] / 255.0,
            "b": rgb[2] / 255.0,
        })
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.sendto(json.dumps({"zones": zones}).encode("utf-8"), address)
    except OSError:
        pass


def _valid_token(server, token):
    if token == server.dev_access_token:
        return True
    with server.fake_lock:
        expiry = server.access_tokens.get(token)
        if expiry is None:
            return False
        if expiry < time.time():
            del server.access_tokens[token]
            return False
    return True


def _issue_token_pair(server, client_id):
    access = "fake-at-" + secrets.token_urlsafe(16)
    refresh = "fake-rt-" + secrets.token_urlsafe(16)
    with server.fake_lock:
        server.access_tokens[access] = time.time() + ACCESS_TOKEN_LIFETIME
        server.refresh_tokens[refresh] = client_id
    return access, refresh


class Handler(BaseHTTPRequestHandler):
    server_version = "FakeHomeAssistant/1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # keep stdout parseable; logs go here
        sys.stderr.write("fake-home-assistant: " + fmt % args + "\n")

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return b""
        return self.rfile.read(length) if length else b""

    def _route(self):
        return urlparse(self.path).path.rstrip("/") or "/"

    def do_GET(self):
        route = self._route()
        if route == "/api/websocket":
            self._handle_websocket()
        elif route == "/auth/authorize":
            self._handle_authorize()
        else:
            self._send_json({"error": "not_found"}, status=404)

    def do_POST(self):
        if self._route() == "/auth/token":
            self._handle_token()
        else:
            self._send_json({"error": "not_found"}, status=404)

    def _handle_authorize(self):
        """Dev shortcut for the OAuth login: returns a code as JSON.

        Real HA redirects the browser to redirect_uri with ?code=&state=.
        The fake hands the code straight back so scripted clients never need
        a browser; redirect_uri is still validated against client_id the way
        components/auth/indieauth.py does (same scheme and host:port).
        """
        params = parse_qs(urlparse(self.path).query)
        client_id = (params.get("client_id") or [None])[0]
        redirect_uri = (params.get("redirect_uri") or [None])[0]
        state = (params.get("state") or [None])[0]
        if not client_id or not redirect_uri:
            self._send_json({"error": "invalid_request",
                             "error_description": "client_id and redirect_uri "
                             "are required"}, status=400)
            return
        client, redirect = urlparse(client_id), urlparse(redirect_uri)
        if (client.scheme != redirect.scheme
                or client.netloc.rsplit(":", 1)[0]
                != redirect.netloc.rsplit(":", 1)[0]
                or client.netloc != redirect.netloc):
            self._send_json({"error": "invalid_request",
                             "error_description": "redirect_uri must share "
                             "client_id scheme and host:port"}, status=400)
            return
        code = "fake-code-" + secrets.token_urlsafe(16)
        with self.server.fake_lock:
            self.server.auth_codes[code] = {
                "client_id": client_id,
                "expires": time.time() + AUTH_CODE_LIFETIME,
            }
        self.log_message("authorize client_id=%r -> code issued", client_id)
        self._send_json({"code": code, "state": state})

    def _handle_token(self):
        content_type = (self.headers.get("Content-Type") or "").split(";")[0]
        if content_type == "application/json":
            try:
                form = json.loads(self._read_body() or b"{}")
            except json.JSONDecodeError:
                form = {}
        else:
            form = {k: v[0] for k, v in
                    parse_qs(self._read_body().decode("utf-8")).items()}
        grant = form.get("grant_type")
        client_id = form.get("client_id")
        if grant == "authorization_code":
            self._grant_authorization_code(form.get("code"), client_id)
        elif grant == "refresh_token":
            self._grant_refresh_token(form.get("refresh_token"), client_id)
        else:
            self._send_json({"error": "unsupported_grant_type"}, status=400)

    def _grant_authorization_code(self, code, client_id):
        with self.server.fake_lock:
            entry = self.server.auth_codes.pop(code, None) if code else None
            if entry is None or entry["expires"] < time.time():
                entry = None
        if entry is None or entry["client_id"] != client_id:
            # Matches HA: a refresh/code bound to another client_id fails.
            self._send_json({"error": "invalid_grant"}, status=400)
            return
        access, refresh = _issue_token_pair(self.server, client_id)
        self.log_message("token issued for client_id=%r", client_id)
        self._send_json({"access_token": access, "refresh_token": refresh,
                         "expires_in": ACCESS_TOKEN_LIFETIME,
                         "token_type": "Bearer"})

    def _grant_refresh_token(self, refresh_token, client_id):
        with self.server.fake_lock:
            bound = self.server.refresh_tokens.get(refresh_token)
        if bound is None or bound != client_id:
            self._send_json({"error": "invalid_grant"}, status=400)
            return
        with self.server.fake_lock:  # rotate, like HA's auth store
            del self.server.refresh_tokens[refresh_token]
        access, refresh = _issue_token_pair(self.server, client_id)
        self.log_message("token refreshed for client_id=%r", client_id)
        self._send_json({"access_token": access, "refresh_token": refresh,
                         "expires_in": ACCESS_TOKEN_LIFETIME,
                         "token_type": "Bearer"})

    # -- WebSocket ------------------------------------------------------

    def _handle_websocket(self):
        key = self.headers.get("Sec-WebSocket-Key")
        upgrade = (self.headers.get("Upgrade") or "").lower()
        if upgrade != "websocket" or not key:
            self._send_json({"error": "websocket_upgrade_required"},
                            status=400)
            return
        accept = base64.b64encode(hashlib.sha1(
            (key + WS_GUID).encode("utf-8")).digest()).decode("ascii")
        self.send_response(101, "Switching Protocols")
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()
        self.close_connection = True  # socket closes when this returns
        sock, lock = self.connection, threading.Lock()
        try:
            self._ws_serve(sock, lock)
        except WsClosed as exc:
            self.log_message("websocket closed: %s", exc)
        except WsProtocolError as exc:
            self.log_message("websocket protocol error, closing %d",
                             exc.code)
            ws_send_close(sock, lock, exc.code)
        except (OSError, ConnectionError) as exc:
            self.log_message("websocket error: %s", exc)

    def _ws_serve(self, sock, lock):
        ws_send(sock, lock, json.dumps({"type": "auth_required",
                                       "ha_version": self.server.ha_version}))
        deadline = (time.monotonic() + self.server.disconnect_after
                    if self.server.disconnect_after > 0 else None)
        # Reads go through rfile (see _rfile_recvn); the socket timeout
        # doubles as the auth window, and buffered bytes return at once.
        read = lambda n: _rfile_recvn(self.rfile, n)  # noqa: E731
        sock.settimeout(max(self.server.auth_timeout, 0.1))
        try:
            first = json.loads(ws_read_message(sock, lock, read))
        except socket.timeout:
            self.log_message("auth not sent within %gs, closing",
                             self.server.auth_timeout)
            ws_send_close(sock, lock)
            return
        except (ValueError, UnicodeDecodeError):
            ws_send_close(sock, lock, WS_CLOSE_PROTOCOL)
            return
        if not isinstance(first, dict) or first.get("type") != "auth":
            ws_send(sock, lock, json.dumps({"type": "auth_invalid",
                                            "message": "First message must "
                                            "be auth"}))
            ws_send_close(sock, lock)
            return
        token = first.get("access_token")
        if token is None or not _valid_token(self.server, token):
            ws_send(sock, lock, json.dumps({"type": "auth_invalid",
                                            "message": "Invalid access token"}))
            ws_send_close(sock, lock)
            return
        ws_send(sock, lock, json.dumps({"type": "auth_ok",
                                       "ha_version": self.server.ha_version}))
        self.log_message("websocket authenticated")
        sock.settimeout(1.0)
        subscribers = {}  # subscribe command id -> event type
        if self.server.event_burst > 0:
            self.log_message("event burst armed (%d, fires on subscribe)",
                             self.server.event_burst)
        while True:
            if deadline is not None and time.monotonic() >= deadline:
                self.log_message("disconnect-after deadline hit, closing")
                ws_send_close(sock, lock)
                return
            try:
                raw = ws_read_message(sock, lock, read)
            except socket.timeout:
                continue
            except UnicodeDecodeError:
                ws_send_close(sock, lock, WS_CLOSE_PROTOCOL)
                return
            try:
                message = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                continue  # non-JSON ignored; ids stay matchable
            if isinstance(message, dict):
                self._ws_command(sock, lock, message, subscribers)

    def _ws_reply(self, sock, lock, msg_id, success, result=None, code=None,
                  message=None):
        reply = {"id": msg_id, "type": "result", "success": success}
        if success:
            reply["result"] = result
        else:
            reply["error"] = {"code": code or "unknown_error",
                              "message": message or "Command failed."}
        ws_send(sock, lock, json.dumps(reply))

    def _ws_command(self, sock, lock, message, subscribers):
        msg_id = message.get("id")
        kind = message.get("type")
        if not isinstance(msg_id, int) or not kind:
            return  # HA drops id-less messages; nothing to match against
        if kind == "get_states":
            with self.server.fake_lock:
                states = [fixtures.state_response(copy.deepcopy(light))
                          for light in self.server.lights]
            self._ws_reply(sock, lock, msg_id, True, states)
        elif kind in ("config/entity_registry/list",
                      "config/entity_registry/list_for_display"):
            with self.server.fake_lock:
                entries = [fixtures.registry_entry(i, light) for i, light
                           in enumerate(self.server.lights)]
            self._ws_reply(sock, lock, msg_id, True, entries)
        elif kind == "call_service":
            self._ws_call_service(sock, lock, msg_id, message, subscribers)
        elif kind == "subscribe_events":
            subscribers[msg_id] = message.get("event_type")
            self._ws_reply(sock, lock, msg_id, True, None)
            self._fire_burst(sock, lock, msg_id, subscribers)
        elif kind == "ping":
            ws_send(sock, lock, json.dumps({"id": msg_id, "type": "pong"}))
        else:
            self._ws_reply(sock, lock, msg_id, False, code="unknown_command",
                           message="Unknown command.")

    def _ws_call_service(self, sock, lock, msg_id, message, subscribers):
        if message.get("domain") != "light" \
                or message.get("service") != "turn_on":
            self._ws_reply(sock, lock, msg_id, False,
                           code="service_not_found",
                           message="Only light.turn_on is emulated.")
            return
        target = message.get("target") or {}
        service_data = message.get("service_data") or {}
        entity_ids = _as_entity_list(target.get("entity_id"))
        entity_ids += _as_entity_list(service_data.get("entity_id"))
        with self.server.fake_lock:
            lights = [find_light(self.server.lights, e) for e in entity_ids]
        if not entity_ids or any(l is None for l in lights):
            self._ws_reply(sock, lock, msg_id, False,
                           code="service_not_found",
                           message="Unknown entity.")
            return
        # blocking=True: HA replies only after the service finishes, so the
        # reply lands after the configured delay, on a worker per call.
        worker = threading.Thread(
            target=self._delayed_turn_on,
            args=(sock, lock, msg_id, entity_ids, service_data,
                  dict(subscribers)),
            daemon=True)
        worker.start()

    def _delayed_turn_on(self, sock, lock, msg_id, entity_ids, service_data,
                         subscribers):
        time.sleep(self.server.turn_on_delay)
        with self.server.fake_lock:
            old = {}
            for entity_id in entity_ids:
                light = find_light(self.server.lights, entity_id)
                old[entity_id] = fixtures.state_response(copy.deepcopy(light))
                apply_turn_on(light, service_data)
                light["last_event"] = time.time()
            new = {e: fixtures.state_response(
                copy.deepcopy(find_light(self.server.lights, e)))
                for e in entity_ids}
            lights = copy.deepcopy(self.server.lights)
        try:
            self._ws_reply(sock, lock, msg_id, True,
                           {"context": {"id": secrets.token_hex(16),
                                        "parent_id": None,
                                        "user_id": None}})
            for entity_id in entity_ids:
                self._emit(sock, lock, subscribers, "state_changed",
                           {"entity_id": entity_id,
                            "old_state": old[entity_id],
                            "new_state": new[entity_id]})
            if self.server.viz_forward:
                forward_to_viz(lights, self.server.viz_address)
        except (OSError, WsClosed):
            pass  # client went away mid-service; nothing to report to

    def _emit(self, sock, lock, subscribers, event_type, data):
        for sub_id, wanted in subscribers.items():
            if wanted == event_type:
                ws_send(sock, lock, json.dumps({"id": sub_id, "type": "event",
                                               "event": {"event_type":
                                                         event_type,
                                                         "data": data}}))

    def _fire_burst(self, sock, lock, sub_id, subscribers):
        """Flood state_changed events so clients can prove they drain fast.

        Mirrors the pressure behind HA's 4096-queued / 1024-for-10s drop
        without emulating the drop itself (documented in README).
        """
        count = self.server.event_burst
        if count <= 0 or subscribers.get(sub_id) != "state_changed":
            return
        with self.server.fake_lock:
            lights = copy.deepcopy(self.server.lights)
        try:
            for i in range(count):
                light = lights[i % len(lights)]
                self._emit(sock, lock, {sub_id: "state_changed"},
                           "state_changed",
                           {"entity_id": light["entity_id"],
                            "old_state": None,
                            "new_state": fixtures.state_response(light)})
        except (OSError, WsClosed):
            pass


def _parse_host_port(value, default_port):
    host, _, port = value.rpartition(":")
    if not host:
        return "127.0.0.1", int(port or default_port)
    return host, int(port)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=18123,
                        help="plain-HTTP listen port (HA's own 8123 with a "
                        "1 prefix, like fake-hue's 18443; 0 picks one and "
                        "prints it for check.py)")
    parser.add_argument("--turn-on-delay", type=float, default=0.2,
                        help="seconds before a light.turn_on reply, "
                        "mirroring HA's blocking=True service call")
    parser.add_argument("--auth-timeout", type=float, default=10.0,
                        help="seconds HA waits for `auth` before closing")
    parser.add_argument("--access-token", default=fixtures.DEV_ACCESS_TOKEN,
                        help="dev token accepted without the OAuth flow")
    parser.add_argument("--disconnect-after", type=float, default=0.0,
                        help="close each websocket this many seconds after "
                        "auth (restart simulation; 0 disables)")
    parser.add_argument("--event-burst", type=int, default=0,
                        help="state_changed events fired per state_changed "
                        "subscription (drain-pressure test; the 4096/1024 "
                        "drop itself is NOT emulated)")
    parser.add_argument("--viz-forward", action="store_true",
                        help="forward light colors to tools/light-viz-relay "
                        "over UDP on every turn_on")
    parser.add_argument("--viz-udp", default="127.0.0.1:18244",
                        help="relay UDP address for --viz-forward")
    parser.add_argument("--ha-version", default=fixtures.HA_VERSION,
                        help="ha_version string reported in handshakes")
    args = parser.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    server.fake_lock = threading.Lock()
    server.lights = copy.deepcopy(fixtures.LIGHTS)
    server.auth_codes = {}
    server.refresh_tokens = {}
    server.access_tokens = {}
    server.turn_on_delay = args.turn_on_delay
    server.auth_timeout = args.auth_timeout
    server.dev_access_token = args.access_token
    server.disconnect_after = args.disconnect_after
    server.event_burst = args.event_burst
    server.viz_forward = args.viz_forward
    server.viz_address = _parse_host_port(args.viz_udp, 18244)
    server.ha_version = args.ha_version

    host, port = server.socket.getsockname()[:2]
    print("fake-home-assistant listening on http://%s:%d" % (host, port),
          flush=True)
    print("HA core pin=%s turn_on_delay=%gs auth_timeout=%gs" % (
        fixtures.HA_CORE_PIN, args.turn_on_delay, args.auth_timeout),
        file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
