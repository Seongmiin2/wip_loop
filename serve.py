"""Serve only the built exhibition site on loopback; Python 3.9+, no packages."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

WEB = Path(__file__).resolve().parent / "web"

class ExhibitionHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2"}
    def list_directory(self, path):
        self.send_error(404)
        return None
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        super().end_headers()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5180)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--monitor", action="store_true")
    args = parser.parse_args()
    if not (0 <= args.port <= 65535):
        parser.error("port must be between 0 and 65535")
    if not (WEB / "index.html").is_file():
        parser.error("Missing web/index.html. Copy the entire WIP_LOOP folder.")
    handler = partial(ExhibitionHandler, directory=str(WEB))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        parser.exit(1, f"Cannot start exhibition server: {error}. Close the previous window or use --port 5182.\n")
    url = f"http://127.0.0.1:{server.server_port}/" + ("?monitor=1" if args.monitor else "") + "#dashboard"
    print(f"WIP LOOP exhibition: {url}", flush=True)
    print("Keep this window open. Press Ctrl+C to stop.", flush=True)
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
