import json
import httpx
import pytest
from backend.config import Service, Settings


def transport_for(mode='ok'):
    def handler(request):
        assert request.headers['authorization'] == 'Bearer test-secret'
        if mode == 'timeout':
            raise httpx.ReadTimeout('private URL and test-secret', request=request)
        if mode == 'auth':
            return httpx.Response(401, text='private upstream test-secret')
        if request.url.path.endswith('/models'):
            return httpx.Response(200, json={'data': [{'id': 'wrong' if mode == 'missing' else 'test-model'}]})
        body = json.loads(request.content)
        assert body['max_tokens'] >= 1024
        assert body['model'] == 'test-model'
        vision = isinstance(body['messages'][0]['content'], list)
        if vision:
            assert body['messages'][0]['content'][1]['image_url']['url'].startswith('data:image/png;base64,')
        choice = {'finish_reason': 'length' if mode == 'length' else 'stop', 'message': {'content': ('red' if vision else 'OK') if mode not in ('reasoning', 'wrong') else (None if mode == 'reasoning' else 'blue'), 'reasoning_content': 'private reasoning'}}
        return httpx.Response(200, json={'model': 'wrong-model' if mode == 'response_model' else 'test-model', 'choices': [choice]})
    return httpx.MockTransport(handler)


def test_endpoint_checks():
    from backend.check_endpoints import check_services
    service = Service('https://example.invalid/v1', 'test-secret', 'test-model')
    result = check_services(Settings(text=service, vision=service), transport=transport_for())
    for key in ('text', 'vision'):
        assert result[key]['configured'] is True
        assert result[key]['models_ok'] is True
        assert result[key]['inference_ok'] is True
        assert result[key]['model'] == 'test-model'
        assert result[key]['elapsed_seconds'] >= 0
    assert 'checked_at' in result
    assert 'test-secret' not in json.dumps(result)
    assert 'reasoning' not in json.dumps(result)


@pytest.mark.parametrize('mode,error', [('timeout', 'timeout'), ('auth', 'authentication_failed'), ('missing', 'configured_model_not_listed'), ('reasoning', 'final_content_missing'), ('length', 'completion_not_finished'), ('wrong', 'unexpected_final_content'), ('response_model', 'response_model_mismatch')])
def test_endpoint_failures(mode, error):
    from backend.check_endpoints import check_services
    service = Service('https://example.invalid/v1', 'test-secret', 'test-model')
    result = check_services(Settings(text=service, vision=service), transport=transport_for(mode))
    assert result['text']['inference_ok'] is False
    assert result['text']['error'] == error
    assert result['vision']['inference_ok'] is False
    assert 'test-secret' not in json.dumps(result)
    assert 'example.invalid' not in json.dumps(result)


def test_cli_missing_configuration(tmp_path, monkeypatch, capsys):
    from backend import check_endpoints
    monkeypatch.setattr(check_endpoints.Settings, 'from_env', lambda: Settings())
    output = tmp_path / 'result.json'
    assert check_endpoints.main(['--output', str(output)]) == 1
    result = json.loads(output.read_text())
    assert result['text']['error'] == 'not_configured'
    assert result['vision']['configured'] is False
    assert json.loads(capsys.readouterr().out) == result
