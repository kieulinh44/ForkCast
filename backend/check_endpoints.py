"""Explicit, sanitized OpenAI-compatible service checks; never run at startup."""
import argparse
import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import struct
import time
from urllib.parse import urlsplit
import zlib
import httpx
from .config import Settings

class CheckFailure(Exception):
    pass


def red_png():
    """Generate a synthetic solid red 32px square, without third-party imaging."""
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    raw = (b'\x00' + b'\xff\x00\x00' * 32) * 32
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 32, 32, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    return 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')


def request_json(client, method, url, **kwargs):
    response = client.request(method, url, **kwargs)
    if response.status_code in (401, 403):
        raise CheckFailure('authentication_failed')
    if response.status_code == 429:
        raise CheckFailure('rate_limited')
    if not 200 <= response.status_code < 300:
        raise CheckFailure('upstream_http_error')
    return response.json()


def check_service(service, *, vision=False, transport=None):
    started = time.monotonic()
    result = {'configured': bool(service.configured), 'models_ok': False, 'inference_ok': False, 'model': service.model, 'elapsed_seconds': 0.0}
    try:
        if not service.configured:
            raise CheckFailure('not_configured')
        parsed = urlsplit(service.base_url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.query or parsed.fragment:
            raise CheckFailure('invalid_configuration')
        base = service.base_url.rstrip('/')
        with httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0), headers={'Authorization': f'Bearer {service.api_key}'}, transport=transport, trust_env=False, follow_redirects=False) as client:
            models = request_json(client, 'GET', base + '/models')
            if service.model not in [entry['id'] for entry in models['data']]:
                raise CheckFailure('configured_model_not_listed')
            result['models_ok'] = True
            content = 'Reply with exactly OK and nothing else.'
            if vision:
                content = [{'type': 'text', 'text': 'What is the color of this square? Reply with exactly one lowercase color word, nothing else.'}, {'type': 'image_url', 'image_url': {'url': red_png()}}]
            completion = request_json(client, 'POST', base + '/chat/completions', json={'model': service.model, 'messages': [{'role': 'user', 'content': content}], 'max_tokens': 1024, 'temperature': 0, 'stream': False})
            if completion.get('model') != service.model:
                raise CheckFailure('response_model_mismatch')
            choice = completion['choices'][0]
            if choice.get('finish_reason') != 'stop':
                raise CheckFailure('completion_not_finished')
            final = choice['message'].get('content')
            if not isinstance(final, str) or not final.strip():
                raise CheckFailure('final_content_missing')
            if final.strip().lower() != ('red' if vision else 'ok'):
                raise CheckFailure('unexpected_final_content')
            result['inference_ok'] = True
    except CheckFailure as exc:
        result['error'] = str(exc)
    except httpx.TimeoutException:
        result['error'] = 'timeout'
    except (httpx.HTTPError, OSError):
        result['error'] = 'connection_failed'
    except (KeyError, TypeError, IndexError, ValueError):
        result['error'] = 'invalid_response'
    result['elapsed_seconds'] = round(time.monotonic() - started, 3)
    return result


def check_services(settings, *, transport=None):
    return {'checked_at': datetime.now(timezone.utc).isoformat(), 'text': check_service(settings.text, transport=transport), 'vision': check_service(settings.vision, vision=True, transport=transport)}


def main(argv=None):
    parser = argparse.ArgumentParser(description='On-demand synthetic-only service checks; HTTP transport is unencrypted. No deployed-host verification is implied.')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(argv)
    result = check_services(Settings.from_env())
    encoded = json.dumps(result, indent=2) + '\n'
    if args.output:
        try:
            args.output.write_text(encoded, encoding='utf-8')
        except OSError:
            print(json.dumps({'error': 'report_write_failed'}))
            return 1
    print(encoded, end='')
    return 0 if all(result[name]['inference_ok'] for name in ('text', 'vision')) else 1

if __name__ == '__main__':
    raise SystemExit(main())
