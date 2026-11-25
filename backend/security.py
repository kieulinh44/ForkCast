"""Bounded request buffering and response headers, including error responses."""
from starlette.responses import JSONResponse

MAX_BODY = 5 * 1024 * 1024
CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

class SecurityMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)

        async def secure_send(message):
            if message['type'] == 'http.response.start':
                headers = list(message.get('headers', []))
                headers.extend([(b'x-content-type-options', b'nosniff'), (b'x-frame-options', b'DENY'), (b'referrer-policy', b'no-referrer'), (b'content-security-policy', CSP.encode())])
                if scope['path'].startswith('/api/'):
                    headers.append((b'cache-control', b'no-store'))
                message['headers'] = headers
            await send(message)

        body = bytearray()
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            body.extend(message.get('body', b''))
            if len(body) > MAX_BODY:
                return await JSONResponse({'detail': 'Request too large'}, status_code=413)(scope, receive, secure_send)
            if not message.get('more_body', False):
                break
        delivered = False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
            return await receive()
        await self.app(scope, replay, secure_send)
