"""Production HTTP model protocol exercised only with HTTPX MockTransport."""
import json
import httpx
import pytest
from fastapi import HTTPException
from backend.config import Service

S = Service('https://example.invalid/v1', 'synthetic-key', 'test-model')

def test_final_json_protocol_ignores_reasoning_and_sets_bounded_tokens():
    from backend.inference import complete_json
    requests = []
    def respond(request):
        requests.append(json.loads(request.content))
        assert request.url.path == '/v1/chat/completions'
        return httpx.Response(200,json={'model':'test-model','choices':[{'finish_reason':'stop','message':{'content':'```json\n{"ok":true}\n```','reasoning_content':'PRIVATE REASONING'}}]})
    result = complete_json(S, [{'role':'user','content':'synthetic'}], vision=True, transport=httpx.MockTransport(respond))
    assert result == {'ok':True}
    assert requests[0]['max_tokens'] == 4096
    assert requests[0]['stream'] is False

@pytest.mark.parametrize('change', ['wrong_model','truncated','missing_content','bad_json','oversized','duplicate_keys'])
def test_invalid_model_responses_are_sanitized(change):
    from backend.inference import complete_json
    def respond(request):
        message = {'content':'{"ok":true}', 'reasoning_content':'private'}
        response = {'model':'test-model','choices':[{'finish_reason':'stop','message':message}]}
        if change == 'wrong_model': response['model'] = 'different'
        if change == 'truncated': response['choices'][0]['finish_reason'] = 'length'
        if change == 'missing_content': message.pop('content')
        if change == 'bad_json': message['content'] = '<think>text</think>{"ok":true}'
        if change == 'oversized': message['content'] = 'x'*70000
        if change == 'duplicate_keys': message['content'] = '{"ok":true,"ok":false}'
        return httpx.Response(200,json=response)
    with pytest.raises(HTTPException) as err:
        complete_json(S, [], transport=httpx.MockTransport(respond))
    assert err.value.status_code == 502
    assert 'private' not in str(err.value.detail)

@pytest.mark.parametrize('failure,code', [('timeout',504),('network',503),('http',502)])
def test_upstream_failures_are_bounded_and_sanitized(failure, code):
    from backend.inference import complete_json
    def respond(request):
        assert request.extensions['timeout']['read'] <= 90
        if failure == 'timeout': raise httpx.ReadTimeout('PRIVATE',request=request)
        if failure == 'network': raise httpx.ConnectError('PRIVATE',request=request)
        return httpx.Response(500,text='PRIVATE')
    with pytest.raises(HTTPException) as err:
        complete_json(S, [], transport=httpx.MockTransport(respond))
    assert err.value.status_code == code
    assert 'PRIVATE' not in str(err.value.detail)

@pytest.mark.parametrize('url',['http://[broken','ftp://example.invalid','https://u:p@example.invalid','https://example.invalid:bad/v1'])
def test_invalid_service_configuration_is_sanitized(url):
    from backend.inference import complete_json
    with pytest.raises(HTTPException) as err:
        complete_json(Service(url,'synthetic','test-model'),[],transport=httpx.MockTransport(lambda request:httpx.Response(500)))
    assert err.value.status_code == 503


def test_missing_service_configuration_does_not_attempt_http():
    from backend.inference import complete_json
    def forbidden(request):
        pytest.fail('not configured must not call HTTP')
    with pytest.raises(HTTPException) as err:
        complete_json(Service(),[],transport=httpx.MockTransport(forbidden))
    assert err.value.status_code == 503
