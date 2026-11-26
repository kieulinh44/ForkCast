"""Bounded, final-content-only OpenAI-compatible HTTP protocol.

No retry or fallback inventions. Transport injection is solely for offline tests.
"""
import json
import re
from urllib.parse import urlsplit
import httpx
from fastapi import HTTPException

MAX_RESPONSE = 256 * 1024
MAX_CONTENT = 64 * 1024


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate key')
        result[key] = value
    return result


def _invalid_constant(value):
    raise ValueError('Nonfinite JSON')


def strict_json(text):
    return json.loads(text, object_pairs_hook=_unique_object, parse_constant=_invalid_constant)


def complete_json(service, messages, *, vision=False, transport=None):
    if not service.configured:
        raise HTTPException(503, 'AI service unavailable')
    try:
        parsed = urlsplit(service.base_url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.query or parsed.fragment:
            raise ValueError('Invalid service URL')
        _ = parsed.port
        httpx.URL(service.base_url)
    except (ValueError, httpx.InvalidURL):
        raise HTTPException(503, 'AI service unavailable') from None
    try:
        with httpx.Client(timeout=httpx.Timeout(90, connect=10, write=10, pool=10), headers={'Authorization':f'Bearer {service.api_key}'}, transport=transport, trust_env=False, follow_redirects=False) as client:
            payload = {'model':service.model, 'messages':messages, 'temperature':0, 'stream':False, 'max_tokens':4096 if vision else 2048}
            with client.stream('POST', service.base_url.rstrip('/') + '/chat/completions', json=payload) as response:
                if not 200 <= response.status_code < 300:
                    raise ValueError('Upstream status')
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_RESPONSE:
                        raise ValueError('Upstream too large')
        data = strict_json(body)
        if data['model'] != service.model or len(data['choices']) != 1:
            raise ValueError('Wrong model or choices')
        choice = data['choices'][0]
        if choice['finish_reason'] != 'stop':
            raise ValueError('Incomplete final')
        content = choice['message']['content']
        if not isinstance(content, str) or not content.strip() or len(content.encode()) > MAX_CONTENT:
            raise ValueError('Invalid content')
        content = content.strip()
        fence = re.fullmatch(r'```(?:json)?\s*\n?(.*?)\n?```', content, flags=re.DOTALL)
        if fence:
            content = fence.group(1)
        result = strict_json(content)
        if not isinstance(result, dict):
            raise ValueError('Expected object')
        return result
    except httpx.TimeoutException:
        raise HTTPException(504, 'AI service timed out; retry explicitly') from None
    except (httpx.HTTPError, OSError):
        raise HTTPException(503, 'AI service unavailable') from None
    except (ValueError, TypeError, KeyError, IndexError, UnicodeError, RecursionError):
        raise HTTPException(502, 'AI service returned an invalid response') from None
