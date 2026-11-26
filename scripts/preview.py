"""Restricted, browser-only UI preview; never serves the repository directory."""
from argparse import ArgumentParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FILES = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/index.html': ('index.html', 'text/html; charset=utf-8'),
    '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
    '/menu-flow.js': ('menu-flow.js', 'text/javascript; charset=utf-8'),
    '/state.js': ('state.js', 'text/javascript; charset=utf-8'),
    '/server-state.js': ('server-state.js', 'text/javascript; charset=utf-8'),
    '/styles.css': ('styles.css', 'text/css; charset=utf-8'),
    '/assets/diner-burger.svg': ('assets/diner-burger.svg', 'image/svg+xml'),
    '/assets/favicon.svg': ('assets/favicon.svg', 'image/svg+xml'),
    '/assets/forkcast-logo.svg': ('assets/forkcast-logo.svg', 'image/svg+xml'),
}

class PreviewHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Keep automated runs readable; request bodies and query strings are never logged.
        return

    def serve(self, body=True):
        name = unquote(urlsplit(self.path).path)
        target = PUBLIC_FILES.get(name)
        if target is None:
            self.send_error(404, 'Not found')
            return
        try:
            content = (ROOT / target[0]).read_bytes()
        except OSError:
            self.send_error(404, 'Not found')
            return
        self.send_response(200)
        self.send_header('Content-Type', target[1])
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.end_headers()
        if body:
            self.wfile.write(content)

    def do_GET(self):
        self.serve()

    def do_HEAD(self):
        self.serve(body=False)

if __name__ == '__main__':
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=18014)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), PreviewHandler)
    print(f'Browser-only preview: http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
