import asyncio
import base64
import json
import sqlite3
import pytest
from fastapi.testclient import TestClient
from backend.config import Settings, Service
from backend.main import create_app


def test_settings_environment_precedence(monkeypatch, tmp_path):
    import backend.config as config
    monkeypatch.setattr(config, 'ROOT', tmp_path)
    (tmp_path / '.env').write_text('FORKCAST_DB_PATH=data/example.db\nFORKCAST_TEXT_BASE_URL=http://sample.invalid/v1\nFORKCAST_TEXT_API_KEY=sample\nFORKCAST_TEXT_MODEL=dotenv-model\nFORKCAST_ALLOWED_HOSTS=example.test,localhost\n')
    for name in list(config.os.environ):
        if name.startswith('FORKCAST_'):
            monkeypatch.delenv(name)
    monkeypatch.setenv('FORKCAST_TEXT_MODEL', 'env-model')
    monkeypatch.setenv('FORKCAST_SECURE_COOKIE', 'true')
    settings = Settings.from_env()
    assert settings.db_path == tmp_path / 'data/example.db'
    assert settings.text.model == 'env-model'
    assert settings.text.configured is True
    assert settings.allowed_hosts == ('example.test', 'localhost')
    assert settings.secure_cookie is True
    assert not settings.vision.configured


def test_valid_boundaries_and_secure_cookie(tmp_path):
    client = TestClient(create_app(Settings(db_path=tmp_path / 'state.db', secure_cookie=True)), base_url='https://testserver')
    first = client.get('/api/state')
    cookie = first.headers['set-cookie'].lower()
    assert all(part in cookie for part in ('secure', 'httponly', 'samesite=strict', 'max-age=2592000'))
    state = first.json()['state']
    state['profile'] = {key: 'x'*2000 for key in ('name', 'budget', 'favorites', 'dislikes', 'dietary', 'allergies', 'spice')}
    state['craving'] = 'x'*2000
    state['feedback'] = [{'dish': 'd'*200, 'rating': 1, 'notes': 'n'*5000} for _ in range(100)]
    state['feedback'][0]['photo'] = 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8\xff\xe0sample\xff\xd9').decode()
    r = client.put('/api/state', json={'state': state, 'revision': 0}, headers={'X-ForkCast-Request': '1', 'Origin': 'https://testserver'})
    assert r.status_code == 200
    assert r.json()['state'] == state


def test_busy_write_no_data_leak(tmp_path):
    path = tmp_path / 'state.db'
    client = TestClient(create_app(Settings(db_path=path)))
    state = client.get('/api/state').json()['state']
    with sqlite3.connect(path) as lock:
        lock.execute('BEGIN IMMEDIATE')
        response = client.put('/api/state', json={'state': state, 'revision': 0}, headers={'X-ForkCast-Request': '1'})
    assert response.status_code == 503
    assert response.json() == {'detail': 'Database unavailable'}
    assert client.get('/api/state').json()['revision'] == 0


def test_no_upstream_calls_in_health(tmp_path, monkeypatch):
    import httpx
    def forbidden(*args, **kwargs):
        raise AssertionError('Health must not contact AI')
    monkeypatch.setattr(httpx.Client, 'request', forbidden)
    # TestClient itself uses httpx, so call the endpoint directly.
    app = create_app(Settings(db_path=tmp_path / 'state.db', text=Service('http://sample.invalid', 'sample', 'sample')))
    route = next(route for route in app.routes if route.path == '/api/health')
    result = route.endpoint()
    assert result['services']['text']['configured'] is True
    assert result['services']['vision']['configured'] is False


def test_asgi_chunked_limit(tmp_path):
    app = create_app(Settings(db_path=tmp_path / 'state.db'))
    async def run():
        count = 0
        sent = []
        async def receive():
            nonlocal count
            count += 1
            return {'type': 'http.request', 'body': b'x'*1000000, 'more_body': True}
        async def send(message):
            sent.append(message)
        await app({'type': 'http', 'method': 'PUT', 'path': '/api/state', 'raw_path': b'/api/state', 'scheme': 'http', 'query_string': b'', 'root_path': '', 'http_version': '1.1', 'server': ('testserver', 80), 'client': ('127.0.0.1', 1), 'headers': [(b'host', b'testserver'), (b'transfer-encoding', b'chunked')]}, receive, send)
        assert sent[0]['status'] == 413
        assert count == 6
        assert (b'cache-control', b'no-store') in sent[0]['headers']
    asyncio.run(run())
