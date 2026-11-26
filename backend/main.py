"""ForkCast same-origin API; model calls require explicit user actions."""
import sqlite3
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.concurrency import run_in_threadpool
from .config import ROOT, Settings
from .models import PutState, DeleteState
from .security import SecurityMiddleware
from .storage import connection, get_state, write_state, empty_state, TTL, guest_id


def create_app(settings=None):
    settings = settings or Settings.from_env()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))
    app.add_middleware(SecurityMiddleware)

    async def unavailable(request, error):
        return JSONResponse({'detail': 'Database unavailable'}, status_code=503)
    app.add_exception_handler(sqlite3.Error, unavailable)
    app.add_exception_handler(OSError, unavailable)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        return JSONResponse({'detail': 'Invalid request'}, status_code=422)

    @app.get('/api/health')
    def health():
        with connection(settings) as db:
            db.execute('SELECT id FROM guests LIMIT 1').fetchall()
        return {'ok': True, 'database': {'ok': True, 'schema_version': 2}, 'services': {name: {'configured': getattr(settings, name).configured} for name in ('text', 'vision')}, 'features': {'menu_extraction': True, 'recommendations': True, 'preference_learning': False}}

    @app.get('/api/state')
    def read_state(request: Request):
        envelope, cookie = get_state(settings, request.cookies.get('forkcast_guest'))
        response = JSONResponse(envelope)
        if cookie:
            response.set_cookie('forkcast_guest', cookie, max_age=TTL, httponly=True, secure=settings.secure_cookie, samesite='strict')
        return response

    async def parse_write(request, model):
        if request.headers.get('X-ForkCast-Request') != '1':
            raise HTTPException(403, 'Request header required')
        origin = request.headers.get('origin')
        if origin is not None and origin != f'{request.url.scheme}://{request.url.netloc}':
            raise HTTPException(403, 'Origin not allowed')
        if request.headers.get('content-type', '').split(';', 1)[0].strip().lower() != 'application/json':
            raise HTTPException(415, 'JSON required')
        # Missing/expired guests must never be created by a write, even an invalid one.
        with connection(settings) as db:
            import time
            if not db.execute('SELECT 1 FROM guests WHERE id=? AND expires_at>?', (guest_id(request.cookies.get('forkcast_guest')), int(time.time()))).fetchone():
                raise HTTPException(403, 'Guest session required')
        try:
            return model.model_validate(await request.json())
        except (ValueError, ValidationError, UnicodeError, RecursionError):
            raise HTTPException(422, 'Invalid request') from None

    @app.put('/api/state')
    async def put_state(request: Request):
        body = await parse_write(request, PutState)
        return await run_in_threadpool(write_state, settings, request.cookies.get('forkcast_guest'), body.state.model_dump(exclude_unset=True), body.revision)

    @app.delete('/api/state')
    async def delete_state(request: Request):
        body = await parse_write(request, DeleteState)
        return await run_in_threadpool(write_state, settings, request.cookies.get('forkcast_guest'), empty_state(), body.revision, True)

    @app.get('/api/menu')
    def read_menu(request: Request):
        from .workflow import read_workflow
        return read_workflow(settings, request.cookies.get('forkcast_guest'))[0]

    @app.put('/api/menu')
    async def put_menu(request: Request):
        from .menu_models import PutMenu
        from .workflow import reviewed_menu
        body = await parse_write(request, PutMenu)
        return await run_in_threadpool(reviewed_menu, settings, request.cookies.get('forkcast_guest'), body)

    @app.delete('/api/menu')
    async def delete_menu(request: Request):
        from .menu_models import WorkflowVersion
        from .workflow import write_workflow
        body = await parse_write(request, WorkflowVersion)
        return await run_in_threadpool(write_workflow, settings, request.cookies.get('forkcast_guest'), body, None)

    @app.post('/api/menu/extract')
    async def extract_menu(request: Request):
        from .menu_models import ExtractMenu
        from .pipeline import extract
        body = await parse_write(request, ExtractMenu)
        return await run_in_threadpool(extract, settings, request.cookies.get('forkcast_guest'), body, getattr(app.state, 'model_transport', None))

    @app.post('/api/recommendations')
    async def recommendations(request: Request):
        from .menu_models import WorkflowVersion
        from .pipeline import recommend
        body = await parse_write(request, WorkflowVersion)
        return await run_in_threadpool(recommend, settings, request.cookies.get('forkcast_guest'), body, getattr(app.state, 'model_transport', None))

    static_names = {'index.html', 'app.js', 'state.js', 'styles.css', 'server-state.js', 'system-status.js', 'menu-flow.js'}
    asset_names = {str(p.relative_to(ROOT)) for p in (ROOT / 'assets').glob('*.svg') if p.is_file() and not p.is_symlink()}

    @app.api_route('/{path:path}', methods=['GET', 'HEAD'])
    def static_file(path: str):
        path = path or 'index.html'
        target = ROOT / path
        if path not in static_names | asset_names or not target.is_file() or target.is_symlink() or target.resolve().parent not in (ROOT, ROOT / 'assets'):
            raise HTTPException(404, 'Not found')
        return FileResponse(target)

    return app

app = create_app()
