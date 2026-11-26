"""Step-two synthetic-only API tracer bullets; no live service calls."""
import json
import sqlite3
import time
import pytest
import httpx
from backend.check_endpoints import red_png
from fastapi.testclient import TestClient
from backend.config import Settings, Service
from backend.main import create_app
from backend.storage import guest_id, empty_state

H = {'X-ForkCast-Request': '1'}

@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(Settings(db_path=tmp_path / 'workflow.db')))

def begin(client):
    client.get('/api/state')
    return {'menu_revision': 0, 'state_revision': 0}

def menu(**changes):
    return {'restaurant_name': 'Sample', 'currency': 'USD', 'items': [{'name': 'Rice bowl', 'description': 'Rice and beans', 'price': 12.0, 'price_note': ''}], **changes}

def save(client, **changes):
    return client.put('/api/menu', headers=H, json={'menu': menu(**changes), **begin(client)})

def test_v1_migration_preserves_guest_and_adds_workflow(tmp_path):
    path = tmp_path / 'v1.db'
    cookie = 'A' * 43
    state = {**empty_state(), 'craving': 'beans'}
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE guests (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL)')
        db.execute('INSERT INTO guests VALUES (?,?,?,?,?)', (guest_id(cookie), int(time.time())+1000, json.dumps(state), 4, 1))
        db.execute('PRAGMA user_version=1')
    c = TestClient(create_app(Settings(db_path=path)))
    c.cookies.set('forkcast_guest', cookie)
    assert c.get('/api/state').json() == {'state': state, 'revision': 4}
    assert c.get('/api/menu').json() == {'menu_revision': 0, 'state_revision': 4, 'menu': None, 'recommendations': None, 'context_changed': False}
    with sqlite3.connect(path) as db:
        assert db.execute('PRAGMA user_version').fetchone()[0] == 2

def test_manual_review_roundtrip_isolation_and_clear(client):
    assert client.get('/api/menu').status_code == 403
    assert not client.cookies
    response = save(client)
    assert response.status_code == 200, response.text
    envelope = response.json()
    assert envelope['menu_revision'] == 1
    assert envelope['menu']['reviewed'] is True
    assert envelope['menu']['source'] == 'manual'
    ident = envelope['menu']['items'][0]['id']
    assert ident
    assert client.get('/api/menu').json() == envelope
    other = TestClient(client.app)
    begin(other)
    assert other.get('/api/menu').json()['menu'] is None
    assert client.put('/api/menu', headers=H, json={'menu': menu(), 'state_revision':0,'menu_revision':0}).status_code == 409
    edited = envelope['menu'].copy()
    for key in ('reviewed', 'source', 'warnings'):
        edited.pop(key)
    assert client.put('/api/menu', headers=H, json={'menu':edited,'state_revision':0,'menu_revision':1}).json()['menu']['items'][0]['id'] == ident
    assert client.request('DELETE','/api/menu',headers=H,json={'state_revision':0,'menu_revision':2}).json() == {'menu_revision':3,'state_revision':0,'menu':None,'recommendations':None,'context_changed':False}
    assert other.get('/api/menu').json()['menu_revision'] == 0


def test_state_clear_removes_workflow_and_currency_validation(client):
    assert save(client).status_code == 200
    state = client.get('/api/state').json()['state']
    state['profile'] = {'currency': 'EUR'}
    response = client.put('/api/state', headers=H, json={'state':state,'revision':0})
    assert response.status_code == 200
    for currency in ['usd', 'US', '$', 'EURO', ' USD']:
        state['profile']['currency'] = currency
        assert client.put('/api/state', headers=H, json={'state':state,'revision':1}).status_code == 422
    assert client.request('DELETE','/api/state', headers=H, json={'revision':1}).status_code == 200
    result = client.get('/api/menu').json()
    assert result['menu'] is None
    assert result['state_revision'] == 2
    with sqlite3.connect(client.app.state.settings.db_path) as db:
        assert db.execute('SELECT COUNT(*) FROM workflows').fetchone()[0] == 0

@pytest.mark.parametrize('change', [
    {'items':[]}, {'items':[{'name':'   '}]}, {'items':[{'name':'x','price':True}]},
    {'items':[{'name':'x','price':-1}]}, {'items':[{'name':'x','price':'3'}]},
    {'items':[{'name':'x'}]*41}, {'items':[{'name':'x','id':'same'},{'name':'y','id':'same'}]},
    {'items':[{'name':'x','id':'bad id'}]}, {'currency':'$'}, {'reviewed':True}, {'source':'photo'},
])
def test_menu_validation_keeps_saved_work(client, change):
    good = save(client).json()
    bad = client.put('/api/menu',headers=H,json={'menu':menu(**change),'state_revision':0,'menu_revision':1})
    assert bad.status_code == 422
    assert client.get('/api/menu').json() == good

def test_explicit_manual_replacement_changes_photo_provenance(tmp_path):
    settings = Settings(db_path=tmp_path / 'provenance.db',
                        vision=Service('https://example.invalid/v1', 'synthetic', 'vision-test'))
    app = create_app(settings)
    client = TestClient(app)
    def extract(request):
        return httpx.Response(200, json={'model': 'vision-test', 'choices': [
            {'finish_reason': 'stop', 'message': {'content': json.dumps(menu())}}]})
    app.state.model_transport = httpx.MockTransport(extract)
    extracted = client.post('/api/menu/extract', headers=H,
                            json={**begin(client), 'image_data': red_png()})
    assert extracted.status_code == 200, extracted.text
    photo = extracted.json()
    assert photo['menu']['source'] == 'photo'
    dish = {**photo['menu']['items'][0], 'name': 'Corrected rice bowl'}
    edited = client.put('/api/menu', headers=H, json={
        'menu_revision': photo['menu_revision'], 'state_revision': 0,
        'menu': menu(items=[dish])})
    assert edited.status_code == 200, edited.text
    assert edited.json()['menu']['source'] == 'photo'
    assert edited.json()['menu']['items'][0]['id'] == dish['id']
    replacement = client.put('/api/menu', headers=H, json={
        'menu_revision': edited.json()['menu_revision'], 'state_revision': 0,
        'manual_replacement': True, 'menu': menu(items=[{'name': 'Unrelated pasta'}])})
    assert replacement.status_code == 200, replacement.text
    saved = replacement.json()
    assert saved['menu']['source'] == 'manual'
    assert saved['menu']['reviewed'] is True
    assert saved['menu_revision'] == edited.json()['menu_revision'] + 1
    assert saved['recommendations'] is None
    assert client.get('/api/menu').json() == saved
    assert client.put('/api/menu', headers=H, json={
        'menu_revision': saved['menu_revision'], 'state_revision': 0,
        'menu': menu(source='photo')}).status_code == 422


@pytest.mark.parametrize('intent', ['true', 'false', 0, 1, None, 'photo'])
def test_manual_replacement_intent_requires_strict_boolean(client, intent):
    good = save(client).json()
    response = client.put('/api/menu', headers=H, json={
        'menu_revision': good['menu_revision'], 'state_revision': 0,
        'menu': menu(), 'manual_replacement': intent})
    assert response.status_code == 422
    assert client.get('/api/menu').json() == good


@pytest.mark.parametrize('literal',['NaN','Infinity','-Infinity'])
def test_nonfinite_prices_rejected(client, literal):
    begin(client)
    raw = '{"state_revision":0,"menu_revision":0,"menu":{"items":[{"name":"x","price":'+literal+'}]}}'
    assert client.put('/api/menu',headers={**H,'Content-Type':'application/json'},content=raw).status_code == 422
