from fastapi.testclient import TestClient
import pytest
from backend.config import Settings
from backend.main import create_app


def test_multiple_menu_links_persist_and_remove_independently(tmp_path):
    settings = Settings(db_path=tmp_path / 'menus.db')
    client = TestClient(create_app(settings))
    state = client.get('/api/state').json()['state']
    headers = {'X-ForkCast-Request': '1'}
    # Existing single-link workspaces remain valid and readable.
    state['menuUrl'] = 'https://example.com/old-menu'
    assert client.put('/api/state', headers=headers, json={'state': state, 'revision': 0}).status_code == 200
    state['menuUrls'] = [state['menuUrl'], 'https://other.example/menu']
    state['menuUrl'] = state['menuUrls'][-1]
    response = client.put('/api/state', headers=headers, json={'state': state, 'revision': 1})
    assert response.status_code == 200
    assert response.json()['state']['menuUrls'] == state['menuUrls']
    restarted = TestClient(create_app(settings))
    restarted.cookies.update(client.cookies)
    assert restarted.get('/api/state').json()['state']['menuUrls'] == state['menuUrls']
    state['menuUrls'].remove('https://example.com/old-menu')
    response = restarted.put('/api/state', headers=headers, json={'state': state, 'revision': 2})
    assert response.status_code == 200
    assert restarted.get('/api/state').json()['state']['menuUrls'] == ['https://other.example/menu']


@pytest.mark.parametrize('links', [
    ['javascript:alert(1)'], ['https://u:password@example.com'], [''],
    ['https://example.com/menu'] * 2, ['https://example.com/' + 'a' * 2048],
    [f'https://example.com/menu/{i}' for i in range(51)], 'https://example.com/menu', [123],
])
def test_menu_lists_reject_unsafe_duplicate_or_excessive_values(tmp_path, links):
    client = TestClient(create_app(Settings(db_path=tmp_path / 'menus.db')))
    state = client.get('/api/state').json()['state']
    response = client.put('/api/state', headers={'X-ForkCast-Request': '1'}, json={'state': {**state, 'menuUrls': links}, 'revision': 0})
    assert response.status_code == 422
    assert client.get('/api/state').json()['revision'] == 0
