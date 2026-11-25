from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient


def test_health(tmp_path):
    from backend.main import create_app
    from backend.config import Settings
    client = TestClient(create_app(Settings(db_path=tmp_path / 'state.db')))
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json() == {'ok': True, 'database': {'ok': True, 'schema_version': 1}, 'services': {'text': {'configured': False}, 'vision': {'configured': False}}, 'features': {'menu_extraction': False, 'recommendations': False, 'preference_learning': False}}
    assert not client.cookies


def test_persistence_isolation_and_revision(tmp_path):
    from backend.main import create_app
    from backend.config import Settings
    settings = Settings(db_path=tmp_path / 'state.db')
    a, b = [TestClient(create_app(settings)) for _ in range(2)]
    first = a.get('/api/state')
    assert first.status_code == 200
    assert first.json() == {'state': {'profile': {}, 'mood': '', 'craving': '', 'feedback': [], 'menuUrl': ''}, 'revision': 0}
    cookie = a.cookies.get('forkcast_guest')
    assert cookie and 'HttpOnly' in first.headers['set-cookie']
    state = first.json()['state']
    state['profile'] = {'name': 'Sample', 'dietary': 'sample vegetarian'}
    headers = {'X-ForkCast-Request': '1'}
    assert a.put('/api/state', json={'state': state, 'revision': 0}, headers=headers).json() == {'state': state, 'revision': 1}
    assert a.put('/api/state', json={'state': state, 'revision': 0}, headers=headers).status_code == 409
    assert b.get('/api/state').json()['state']['profile'] == {}
    restarted = TestClient(create_app(settings))
    restarted.cookies.set('forkcast_guest', cookie)
    assert restarted.get('/api/state').json()['state'] == state
    assert restarted.request('DELETE', '/api/state', json={'revision': 1}, headers=headers).json()['revision'] == 2
    assert b.get('/api/state').json()['revision'] == 0
    db = sqlite3.connect(settings.db_path)
    rows = db.execute('SELECT id FROM guests').fetchall()
    assert all(cookie not in row for row in rows)
    assert all(len(row[0]) == 64 for row in rows)


import pytest
from concurrent.futures import ThreadPoolExecutor

@pytest.fixture
def client(tmp_path):
    from backend.main import create_app
    from backend.config import Settings
    return TestClient(create_app(Settings(db_path=tmp_path / 'state.db')))


def test_write_security(client):
    state = client.get('/api/state').json()['state']
    payload = {'state': state, 'revision': 0}
    assert client.put('/api/state', json=payload).status_code == 403
    h = {'X-ForkCast-Request': '1'}
    assert client.put('/api/state', json=payload, headers={**h, 'Origin': 'https://evil.example'}).status_code == 403
    assert client.put('/api/state', json=payload, headers={**h, 'Origin': 'http://testserver.evil'}).status_code == 403
    assert client.put('/api/state', content='{}', headers={**h, 'Content-Type': 'text/plain'}).status_code == 415
    assert client.put('/api/state', content='{', headers={**h, 'Content-Type': 'application/json'}).status_code == 422
    assert client.put('/api/state', json=payload, headers={**h, 'Origin': 'http://testserver'}).status_code == 200
    client.cookies.clear()
    assert client.put('/api/state', json=payload, headers=h).status_code == 403
    assert not client.cookies

@pytest.mark.parametrize('change', [
    {'profile': {'restrictions': 'wrong key'}}, {'profile': {'name': 'x'*2001}},
    {'profile': {'name': 5}}, {'mood': 'hungry'}, {'craving': 'x'*2001},
    {'menuUrl': 'javascript:alert(1)'}, {'menuUrl': 'https://u:p@example.com'},
    {'menuUrl': 'https://'}, {'menuUrl': 'https://example.com/'+'x'*2048},
    {'feedback': [{'dish': 'x', 'rating': True, 'notes': ''}]},
    {'feedback': [{'dish': 'x', 'rating': 6, 'notes': ''}]},
    {'feedback': [{'dish': 'x'*201, 'rating': 5, 'notes': ''}]},
    {'feedback': [{'dish': 'x', 'rating': 5, 'notes': 'x'*5001}]},
    {'feedback': [{'dish': 'x', 'rating': 5, 'notes': '', 'photo': 'data:image/svg+xml;base64,AAAA'}]},
    {'feedback': [{'dish': 'x', 'rating': 5, 'notes': '', 'photo': 'data:image/jpeg;base64,'+'A'*700000}]},
    {'feedback': [{'dish': 'x', 'rating': 5, 'notes': '', 'secret': 'private'}]},
    {'feedback': [{'dish': 'x', 'rating': 5, 'notes': ''}]*101}, {'userId': 'private'},
])
def test_validation(client, change):
    state = client.get('/api/state').json()['state']
    response = client.put('/api/state', json={'state': {**state, **change}, 'revision': 0}, headers={'X-ForkCast-Request': '1'})
    assert response.status_code == 422
    assert response.json() == {'detail': 'Invalid request'}
    assert client.get('/api/state').json()['revision'] == 0

@pytest.mark.parametrize('revision', [-1, True, '0', 1.1])
def test_bad_revision(client, revision):
    state = client.get('/api/state').json()['state']
    assert client.put('/api/state', json={'state': state, 'revision': revision}, headers={'X-ForkCast-Request': '1'}).status_code == 422


def test_body_limit_even_chunked(client):
    client.get('/api/state')
    response = client.put('/api/state', content=iter([b' '*1000000]*6), headers={'X-ForkCast-Request': '1', 'Content-Type': 'application/json'})
    assert response.status_code == 413


def test_static_whitelist_and_headers(client):
    for path in ['/', '/index.html', '/app.js', '/state.js', '/styles.css', '/assets/favicon.svg']:
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.headers['x-content-type-options'] == 'nosniff'
        assert response.headers['x-frame-options'] == 'DENY'
        assert "script-src 'self'" in response.headers['content-security-policy']
    for path in ['/.env', '/.git/config', '/data/forkcast.sqlite3', '/backend/main.py', '/README.md', '/package.json', '/tests/backend/test_backend.py', '/api/unknown', '/assets/../.env', '/assets/%2e%2e/.env']:
        assert client.get(path).status_code == 404, path
    assert client.get('/api/health').headers['cache-control'] == 'no-store'
    assert client.get('/api/state').headers['cache-control'] == 'no-store'
    assert client.get('/api/health', headers={'Host': 'evil.example'}).status_code == 400


def test_database_failure_and_newer_schema(tmp_path):
    from backend.main import create_app
    from backend.config import Settings
    path = tmp_path / 'future.db'
    with sqlite3.connect(path) as db:
        db.execute('PRAGMA user_version=99')
    client = TestClient(create_app(Settings(db_path=path)))
    for route in ['/api/health', '/api/state']:
        response = client.get(route)
        assert response.status_code == 503
        assert str(path) not in response.text
    blocked = TestClient(create_app(Settings(db_path=tmp_path)))
    assert blocked.get('/api/health').status_code == 503


def test_unknown_malformed_expired_cookie(client):
    from backend.storage import guest_id
    import time
    client.get('/api/state')
    old = client.cookies.get('forkcast_guest')
    with sqlite3.connect(client.app.state.settings.db_path) as db:
        db.execute('UPDATE guests SET expires_at=?', (int(time.time())-1,))
    assert client.put('/api/state', json={'state': {}, 'revision': 0}, headers={'X-ForkCast-Request': '1'}).status_code == 403
    assert client.get('/api/state').status_code == 200
    assert client.cookies.get('forkcast_guest') != old
    for cookie in ['bad', 'A'*43]:
        client.cookies.clear()
        client.cookies.set('forkcast_guest', cookie)
        assert client.get('/api/state').status_code == 200
        assert client.cookies.get('forkcast_guest', domain='testserver.local') != cookie


def test_concurrent_updates(client):
    state = client.get('/api/state').json()['state']
    def write(_):
        return client.put('/api/state', json={'state': state, 'revision': 0}, headers={'X-ForkCast-Request': '1'}).status_code
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(write, range(2))) == [200, 409]
