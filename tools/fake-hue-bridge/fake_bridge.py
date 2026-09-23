#!/usr/bin/env python3
"""Tier-1 fake Hue bridge: REST only, no DTLS streaming.

Serves the static JSON Aurora's output/hue slice expects so pairing,
entertainment-config selection, zone mapping, and test-pulse can be
developed with no physical bridge. Start/stop and light PUTs are logged
and (for stream status) tracked in memory -- nothing renders anywhere.

Expected tier-1 behavior in Aurora: HueOutput::init() succeeds but
isConnected() stays False and send() is a no-op, because the DTLS
entertainment stream on UDP 2100 (tier 2) is not emulated.

Usage:
    python3 fake_bridge.py [--port 18443] [--link-button pressed|not-pressed]
"""

import argparse
import json
import ssl
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import fixtures

CERT_DIR = Path(__file__).resolve().parent / ".certs"
CERT_FILE = CERT_DIR / "cert.pem"
KEY_FILE = CERT_DIR / "key.pem"


def ensure_cert():
    if CERT_FILE.exists() and KEY_FILE.exists():
        return
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048",
             "-keyout", str(KEY_FILE), "-out", str(CERT_FILE),
             "-days", "3650", "-nodes", "-subj", "/CN=FakeHueBridge"],
            check=True, capture_output=True)
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        sys.exit(f"error: could not generate a self-signed cert "
                 f"(is openssl installed?): {exc}")
    print(f"generated dev-only cert in {CERT_DIR}", file=sys.stderr)


class Handler(BaseHTTPRequestHandler):
    server_version = "FakeHueBridge/1"

    def log_message(self, fmt, *args):  # keep stdout parseable; logs go here
        sys.stderr.write("fake-hue-bridge: " + fmt % args + "\n")

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def _route(self):
        return self.path.split("?", 1)[0].rstrip("/") or "/"

    def _link_button_state(self):
        return {"pressed": self.server.fake_config["link_button"] == "pressed"}

    def do_GET(self):
        cfg = self.server.fake_config
        route = self._route()

        if route == "/dev/link-button":
            self._send_json(self._link_button_state())
        elif route == "/api/0/config":
            self._send_json(fixtures.config_response())
        elif route == "/clip/v2/resource/entertainment_configuration":
            self._send_json(fixtures.entertainment_configurations())
        elif route == "/clip/v2/resource":
            self._send_json(fixtures.resources())
        elif route.startswith("/clip/v2/resource/entertainment_configuration/"):
            conf_id = route.rsplit("/", 1)[-1]
            if conf_id not in self.server.stream_status:
                self._send_json({"errors": [{"description": "unknown configuration"}]},
                                status=404)
                return
            self._send_json(fixtures.entertainment_configuration_status(
                conf_id, self.server.stream_status[conf_id]))
        elif route.startswith("/clip/v2/resource/light/"):
            light_id = route.rsplit("/", 1)[-1]
            device = next((d for d in fixtures.DEVICES
                           if d["light_id"] == light_id), None)
            if device is None:
                self._send_json({"errors": [{"description": "unknown light"}]},
                                status=404)
                return
            self._send_json(fixtures.light_snapshot(device))
        else:
            self._send_json({"errors": [{"description": "not found"}]}, status=404)

    def do_POST(self):
        if self._route() == "/api":
            body = self._read_json_body()
            self.log_message("POST /api devicetype=%r", body.get("devicetype"))
            if self.server.fake_config["link_button"] == "not-pressed":
                self._send_json(fixtures.register_link_button_not_pressed())
            else:
                self._send_json(fixtures.register_success(
                    self.server.fake_config["username"],
                    self.server.fake_config["clientkey"]))
        else:
            self._send_json({"errors": [{"description": "not found"}]}, status=404)

    def do_PUT(self):
        route = self._route()
        body = self._read_json_body()

        if route == "/dev/link-button":
            pressed = bool(body.get("pressed", True))
            self.server.fake_config["link_button"] = (
                "pressed" if pressed else "not-pressed")
            self.log_message("link-button -> %s",
                             self.server.fake_config["link_button"])
            self._send_json(self._link_button_state())
        elif route.startswith("/clip/v2/resource/entertainment_configuration/"):
            conf_id = route.rsplit("/", 1)[-1]
            if conf_id not in self.server.stream_status:
                self._send_json({"errors": [{"description": "unknown configuration"}]},
                                status=404)
                return
            action = body.get("action", "")
            if action == "start":
                self.server.stream_status[conf_id] = "active"
            elif action == "stop":
                self.server.stream_status[conf_id] = "inactive"
            self.log_message("stream %s -> %s", conf_id,
                             self.server.stream_status[conf_id])
            self._send_json(fixtures.entertainment_configuration_status(
                conf_id, self.server.stream_status[conf_id]))
        elif route.startswith("/clip/v2/resource/light/"):
            light_id = route.rsplit("/", 1)[-1]
            self.log_message("PUT light %s body=%s", light_id, json.dumps(body))
            self._send_json({})
        else:
            self._send_json({"errors": [{"description": "not found"}]}, status=404)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=18443)
    parser.add_argument("--username", default=fixtures.DEV_USERNAME)
    parser.add_argument("--clientkey", default=fixtures.DEV_CLIENTKEY)
    parser.add_argument("--link-button", choices=("pressed", "not-pressed"),
                        default="pressed",
                        help="simulate the bridge link-button state for POST /api")
    args = parser.parse_args()

    ensure_cert()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.fake_config = {"username": args.username,
                          "clientkey": args.clientkey,
                          "link_button": args.link_button}
    server.stream_status = {c["id"]: "inactive" for c in fixtures.CONFIGS}

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(str(CERT_FILE), str(KEY_FILE))
    server.socket = context.wrap_socket(server.socket, server_side=True)

    host, port = server.socket.getsockname()[:2]
    print(f"fake-hue-bridge listening on https://{host}:{port}", flush=True)
    print(f"username={args.username} link-button={args.link_button}",
          file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
