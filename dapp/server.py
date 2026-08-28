from __future__ import annotations

import http.client
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


HOST = "127.0.0.1"
PORT = 8790
BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8787
ROOT = Path(__file__).resolve().parent


class DappHandler(BaseHTTPRequestHandler):
    server_version = "NileBridgeDapp/1.0"

    def do_GET(self) -> None:
        if self.path.startswith("/api/"):
            self.proxy_to_backend()
            return
        self.serve_static()

    def do_POST(self) -> None:
        if self.path.startswith("/api/"):
            self.proxy_to_backend()
            return
        self.send_error(404)

    def proxy_to_backend(self) -> None:
        parsed = urlsplit(self.path)
        backend_path = parsed.path.removeprefix("/api") or "/"
        if parsed.query:
            backend_path = f"{backend_path}?{parsed.query}"
        body_len = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(body_len) if body_len else None
        headers = {
            "Accept": self.headers.get("Accept", "application/json"),
            "Content-Type": self.headers.get("Content-Type", "application/json"),
        }
        conn = http.client.HTTPConnection(BACKEND_HOST, BACKEND_PORT, timeout=10)
        try:
            conn.request(self.command, backend_path, body=body, headers=headers)
            response = conn.getresponse()
            payload = response.read()
            self.send_response(response.status)
            self.send_header("Content-Type", response.getheader("Content-Type", "application/json"))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
        finally:
            conn.close()

    def serve_static(self) -> None:
        parsed = urlsplit(self.path)
        rel = parsed.path.lstrip("/") or "index.html"
        target = (ROOT / rel).resolve()
        if not str(target).startswith(str(ROOT)) or not target.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        payload = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt: str, *args: object) -> None:
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), DappHandler)
    print(f"Serving Nile bridge dApp on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
