from fastapi.testclient import TestClient
from backend.config import Settings
from backend.main import create_app


def test_brand_assets_are_served_with_browser_paths(tmp_path):
    client = TestClient(create_app(Settings(db_path=tmp_path / 'brand-test.db')))
    for asset in ['forkcast-logo.svg', 'favicon.svg', 'diner-burger.svg']:
        response = client.get(f'/assets/{asset}')
        assert response.status_code == 200, asset
        assert response.headers['content-type'].startswith('image/svg+xml')
        assert '<svg' in response.text
    for path in ['/assets/../.env', '/assets/%2e%2e/backend/config.py', '/assets/missing.svg']:
        assert client.get(path).status_code == 404
