#!/usr/bin/env python3
"""Local relay: UDP in (from output/hue's DevLightTap), SSE out (to a browser).

output/hue's HueOutput::send() fire-and-forget UDP-broadcasts one JSON
line of computed per-zone colors per frame when AURORA_DEV_LIGHT_TAP is
set (see output/hue/include/Aurora/Output/Hue/DevLightTap.hpp). This
relay re-serves that same stream to any number of browser tabs over
Server-Sent Events, so the standalone three.js viz tool (web/demo/viz.html)
can subscribe with a plain EventSource -- no WebSocket support needed on
either end (cpp-httplib, what Aurora's own daemon uses, has none).

Usage:
    python3 relay.py [--udp-port 18244] [--http-port 18245]
"""

import argparse
import json
import queue
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def udp_listener(sock, server):
    while True:
        try:
            data, _addr = sock.recvfrom(65536)
        except OSError:
            return  # socket closed during shutdown

        try:
            payload = data.decode("utf-8")
            json.loads(payload)  # validate only -- forwarded as-is below
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            sys.stderr.write(f"light-viz-relay: dropped malformed datagram: {exc}\n")
            continue

        with server.subscribers_lock:
            subscribers = list(server.subscribers)
        for q in subscribers:
            q.put(payload)


class Handler(BaseHTTPRequestHandler):
    server_version = "LightVizRelay/1"

    def log_message(self, fmt, *args):  # keep stdout parseable; logs go here
        sys.stderr.write("light-viz-relay: " + fmt % args + "\n")

    def _route(self):
        return self.path.split("?", 1)[0].rstrip("/") or "/"

    def do_GET(self):
        if self._route() not in ("/", "/events"):
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        # Cross-origin by default: viz.html is typically served by a
        # separate static file server (web/demo/README's "any static file
        # server works"), a different origin from this relay.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        client_queue = queue.Queue()
        with self.server.subscribers_lock:
            self.server.subscribers.add(client_queue)
        self.log_message("client connected (%d total)", len(self.server.subscribers))

        try:
            while True:
                try:
                    payload = client_queue.get(timeout=15)
                    self.wfile.write(f"data: {payload}\n\n".encode())
                except queue.Empty:
                    # Keeps intermediary proxies/browsers from timing out an
                    # idle connection -- SSE comment lines are ignored by
                    # EventSource but keep the socket visibly alive.
                    self.wfile.write(b": heartbeat\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            with self.server.subscribers_lock:
                self.server.subscribers.discard(client_queue)
            self.log_message("client disconnected (%d remain)", len(self.server.subscribers))


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--udp-port", type=int, default=18244,
                        help="must match DevLightTap's address (default 18244)")
    parser.add_argument("--http-port", type=int, default=18245)
    args = parser.parse_args()

    udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp_sock.bind((args.host, args.udp_port))
    bound_udp_port = udp_sock.getsockname()[1]

    http_server = ThreadingHTTPServer((args.host, args.http_port), Handler)
    bound_http_port = http_server.socket.getsockname()[1]
    http_server.subscribers = set()
    http_server.subscribers_lock = threading.Lock()

    listener_thread = threading.Thread(
        target=udp_listener, args=(udp_sock, http_server), daemon=True)
    listener_thread.start()

    # Two parseable lines (not one, and not free-form) so check.py -- or
    # anything else launching this as a subprocess with --udp-port 0/
    # --http-port 0 for ephemeral binding -- can read the actual bound
    # ports back reliably, same reasoning as fake_bridge.py's single
    # "listening on https://host:port" line.
    print(f"udp_port={bound_udp_port}", flush=True)
    print(f"http_port={bound_http_port}", flush=True)
    print(f"light-viz-relay: UDP in on {args.host}:{bound_udp_port}, "
          f"SSE out on http://{args.host}:{bound_http_port}/events", file=sys.stderr)
    try:
        http_server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        udp_sock.close()


if __name__ == "__main__":
    main()
