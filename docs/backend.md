# ForkCast backend — step 2

The Python/SQLite foundation now supports explicit menu-photo extraction, editable review and grounded recommendations. Accounts and preference learning are not implemented. The existing frontend is served from the same origin. Use sample data only. Guest cookies are bearer credentials, not authenticated accounts; anyone possessing a cookie can access that guest's draft. There is no account recovery, cross-device identity, encryption-at-rest, retention administrator, or public-production safety claim.

## Fresh clone / local development

Use Python 3.11 or newer (verified here with Python 3.12) and `uv`. From the repository root:

```sh
uv venv --python 3.12 .venv
uv pip sync requirements-dev.txt
# Only if .env does not already exist; never overwrite an existing configuration:
cp -n .env.example .env
chmod 600 .env
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8014 --workers 1 --no-access-log
```

Open `http://127.0.0.1:8014`. Opening the UI or health endpoint does not call either AI service. `backend.main.create_app(settings=None)` supports isolated test settings; `backend.main:app` is the ASGI entry point. No Hermes configuration or installed user tools are needed by the application.

`requirements.txt` and `requirements-dev.txt` contain resolved pins, including transitive dependencies. To intentionally refresh them:

```sh
uv pip compile requirements.in --python-version 3.11 -o requirements.txt
uv pip compile requirements-dev.in --python-version 3.11 -o requirements-dev.txt
uv pip sync requirements-dev.txt
uv pip check
```

## Configuration

Root `.env` is read without changing the process environment. Process environment values take precedence. Never commit `.env`, copy secrets into JavaScript, pass keys in query parameters, or embed them in Docker layers.

| Name | Default / purpose |
| --- | --- |
| `FORKCAST_DB_PATH` | `data/forkcast.sqlite3` under the repository root. Relative configured paths are also relative to this root. |
| `FORKCAST_SECURE_COOKIE` | `false` for local HTTP; set `true` behind HTTPS. |
| `FORKCAST_ALLOWED_HOSTS` | `localhost,127.0.0.1,testserver`; exact public hostname(s) must be added for deployment. Do not use `*`. |
| `FORKCAST_TEXT_BASE_URL`, `FORKCAST_TEXT_API_KEY`, `FORKCAST_TEXT_MODEL` | All three required to mark text configured. API root, typically including `/v1`; no hardcoded service address/key/model. |
| `FORKCAST_VISION_BASE_URL`, `FORKCAST_VISION_API_KEY`, `FORKCAST_VISION_MODEL` | Parallel vision settings. |

`configured` means configuration is present, **not that networking, authorization, the model, or inference works**. Secrets and service addresses are never returned by health.

## API and data contract

- `GET /api/health`: `{ok:true,database:{ok:true,schema_version:2},services:{text:{configured:boolean},vision:{configured:boolean}},features:{menu_extraction:true,recommendations:true,preference_learning:false}}`. Checks SQLite only; no guest creation. Database failure or unsupported newer schema returns 503.
- `GET /api/state`: `{state:{profile:{},mood:"",craving:"",feedback:[],menuUrl:""},revision:0}` for a new guest. Missing, malformed, unknown, or expired cookies create a fresh opaque guest here only.
- `PUT /api/state`: JSON `{state:<entire validated state>,revision:<current integer>}`. Returns the saved envelope with revision incremented once.
- `DELETE /api/state`: JSON `{revision:<current integer>}`. Returns the empty state with revision incremented once. Clears only this guest, not the database or other guests; retains the guest cookie.

Both writes require `Content-Type: application/json` and `X-ForkCast-Request: 1`. A supplied Origin must exactly equal the trusted request origin (scheme and authority); there is no permissive CORS. Writes without an existing live guest return 403, stale revisions return 409, invalid bodies return 422, oversized bodies return 413, and database unavailability/busy failures return sanitized 503. Error responses do not echo submitted fields. On conflict reload and reconcile; do not silently overwrite or retry an old revision.

The `forkcast_guest` cookie is HttpOnly, SameSite Strict, path `/`, host-only, and has a 30-day Max-Age. Secure is configurable. Browser closure does not discard it. SQLite stores only its SHA-256 identifier, expiry, validated JSON state, revision, and update timestamp. Expiry is fixed at creation; expired rows are opportunistically removed when a new guest is created. This is application deletion, not forensic secure erasure from SQLite pages/backups. Back up privately using SQLite's backup API, or stop the instance before copying; WAL sidecars can contain recent data.

Actual profile form keys are **`name,budget,favorites,dislikes,dietary,allergies,spice`**; the source form uses `dietary`, not `restrictions`. Values are strings, each at most 2,000 characters; an empty profile is valid. Mood is empty or exactly `Comforting`, `Hearty`, `Refreshing`, `Light`, `Adventurous`; craving max 2,000 characters. At most 100 feedback entries, with `{dish:string<=200,rating:integer 1..5,notes:string<=5000,photo?:JPEG data URL<=700000}`. Photo is optional, not null; base64/JPEG signature checks are performed. No rating labels or dietary interpretations are inferred. `menuUrl` is empty or an HTTP(S) URL without credentials, max 2,048 characters; it is stored, never fetched. Extra fields and coerced types are rejected. Total request size is capped at 5 MiB, including streaming/chunked requests, so 100 large photos will not fit in one state.

SQLite uses WAL, a 1-second busy timeout, parameterized SQL, version-one migration, and transactional optimistic revisions. State survives process restart. One persistent instance and one Uvicorn worker are the deployment target; do not place the SQLite file on network storage or run horizontally scaled replicas against it.

Static serving is allowlisted to index, the frontend JS/CSS, and root `assets/*.svg` files. It never mounts the repository, `.env`, database, source, tests, or docs. API responses are no-store; security headers include CSP (same-origin external scripts only), nosniff, frame denial, and no-referrer.

## On-demand endpoint checks

```sh
.venv/bin/python -m backend.check_endpoints
# Optional sanitized machine-readable report; choose a private path:
.venv/bin/python -m backend.check_endpoints --output ./endpoint-check.json
```

Run this explicitly on **each intended host**. It calls `/models`, confirms the configured model is listed, then performs a tiny chat completion (1,024-token reasoning allowance) with exact final-answer checks: `OK` for text, `red` for a generated red 32px PNG square. No user profile, menu, or meal photo is sent. It requires `finish_reason=stop`, the configured response model, and nonempty final content; reasoning-only output is not success. Redirects are not followed. Reports include UTC check time, configured/models/inference booleans, model name, elapsed seconds, and local error categories only. No raw upstream errors, keys, base URLs, reasoning, or answer bodies are reported. Exit is nonzero if either service is missing configuration or fails. A failed report write is also nonzero.

The supplied course endpoints may use **HTTP: outbound keys and payloads are unencrypted** even when the website itself uses HTTPS. Only synthetic/sample testing is appropriate under that arrangement. A local success does not prove deployed-host reachability, future availability, or suitability for sensitive dietary/allergy data. No deployed-host connectivity has been verified by this backend implementation.

## Tests

All tests use temporary SQLite databases and HTTPX MockTransport, not paid/live endpoints. Set a private test scratch directory outside the source tree (or under an ignored workspace directory):

```sh
mkdir -p "$HOME/.cache/forkcast-tests"
TMPDIR="$HOME/.cache/forkcast-tests" .venv/bin/python -m pytest tests/backend -q --basetemp="$HOME/.cache/forkcast-tests/pytest"
```

Coverage includes health, schema failures, persistence across app recreation, guest isolation/expiry, optimistic conflicts/concurrency, database lock failures, validation boundaries, CSRF/origin rules, body limits with actual multiple ASGI chunks, static traversal/secret blocking, cookie flags, environment precedence, and successful/failed mocked endpoint checks. The resolved Starlette version currently emits one test-only deprecation warning about HTTPX TestClient support; runtime and tests still work. No live endpoint call is made by this test suite.

## Historical step-1 implementation verification

Implementation runs (Python 3.12.6): initial missing-health test red (1 failed), then green (1 passed); persistence route red (1 failed, 1 passed), then green (2 passed); validation/security group red (26 failed, 4 passed), then green (30 passed); endpoint CLI group red (9 failed), then combined green (39 passed); relative configuration regression red (1 failed, 43 passed), then final green **44 passed, 1 test-only Starlette deprecation warning**. Final run completed in 3.12 seconds. Dependency resolver targeted Python 3.11 compatibility; actual execution was Python 3.12, not a separately installed Python 3.11 runtime. `uv pip check` reported all 23 installed packages compatible. `compileall` and CLI `--help` passed. A real short-lived Uvicorn process, using a synthetic temporary database, returned health/UI 200, passed guest GET/PUT/DELETE, and blocked `.env` with 404; it was terminated after the check. No live AI calls were made by this backend task.

## Deployment preparation (not a deployment)

No host has been chosen or deployed. Docker was not available in the implementation environment, so the image has **not been built or run**. These commands are preparation, not reported verification:

```sh
docker build -t forkcast .
docker volume create forkcast-data
docker run --rm --name forkcast -p 127.0.0.1:8014:8014 \
  --env-file .env -e FORKCAST_DB_PATH=/data/forkcast.sqlite3 \
  -v forkcast-data:/data forkcast
```

The Python 3.12 slim image runs non-root with one worker. It copies an explicit application allowlist, never `.env` or the repo root. `/data` must remain writable by UID 10001; named volumes are preferred over unprepared bind mounts. Persist the whole `/data` volume through replacement/restart. The container health check uses `127.0.0.1`, which must remain in `FORKCAST_ALLOWED_HOSTS` alongside the public hostname.

Place it behind an HTTPS reverse proxy, set Secure cookies true, restrict the externally accepted hostnames, configure trusted forwarded headers only from the actual proxy address, and keep the app port private. Uvicorn's forwarded-IP trust must be tailored to the selected proxy network; never blindly trust all sources. Origin validation needs the proxy-preserved original Host and trusted HTTPS scheme. Recheck health, cookies, persistence after restart, both CLI services, 403 cross-origin writes, and 409 conflicts from that host before claiming deployment readiness. This step does not add public-service abuse controls, login, or rate limiting.

Primary implementation references: FastAPI container/worker docs (`https://fastapi.tiangolo.com/deployment/docker/`, `https://fastapi.tiangolo.com/deployment/server-workers/`), HTTPX MockTransport (`https://www.python-httpx.org/advanced/transports/`), and SQLite WAL/PRAGMA references (`https://www.sqlite.org/wal.html`, `https://www.sqlite.org/pragma.html`).


## Step 2 additions

The database migrates transactionally to version 2, preserving version-1 guests and adding a guest-linked `workflows` table. It stores the current menu, workflow revision, recommendations, and a digest of saved profile/mood/craving. Original image bytes are not persisted. Clear-all deletes only the current guest's workflow; expiration cascades through foreign keys.

New same-origin routes (existing guest cookie, Origin/custom-header/JSON/body-size guards apply):
- `GET /api/menu`: current workflow envelope, state/workflow revisions and stale-context status.
- `POST /api/menu/extract`: explicit bounded data-URL image extraction; successful nonempty output replaces the current menu as unreviewed. Failure preserves prior work.
- `PUT /api/menu`: save the editable menu and mark it reviewed; invalidate old recommendations.
- `POST /api/recommendations`: requires a saved reviewed menu; reads saved guest context, filters known explicit conflicts and comparable over-budget items, then validates model-selected IDs and exact source evidence. Names, prices and cautions are server-composed from canonical data.
- `DELETE /api/menu`: clear only the guest's menu/results; preserve profile/craving.

Every write carries `menu_revision` and `state_revision`; both are checked before and after inference. No database transaction stays open during an upstream request. A per-guest in-process guard rejects overlapping model requests (429) and always releases after success/failure. This is a single-worker local foundation, not public abuse protection. Model requests use bounded timeouts/responses and strict final JSON/model/finish validation; errors do not echo upstream responses or secrets.

Menus support 1–40 named dishes. Prices must be finite/nonnegative numbers or null. A dollar sign alone does not establish USD; different/unknown currencies are never silently converted. Unknown-price candidates can appear with unverified-budget warnings, but comparable known over-budget dishes are excluded. Common term mappings are incomplete and conservative, not an allergy-safety or religious-compliance assessment. Every suggestion requires confirmation with staff.

Browser inputs support JPEG/PNG/WebP up to 10 MB and 40 megapixels, normalized to a metadata-free JPEG at most 2400px on the longest edge. The API independently verifies actual JPEG/PNG/WebP bytes, single-frame images, a 3.8 MB decoded-byte cap and a 20-megapixel cap; browser-normalized images are below that pixel cap. The inherited request-body cap remains 5 MiB. No remote image URLs, PDFs or website fetching are accepted in this stage.

Profile `currency` is optional and uppercase three-letter; existing profiles default to USD for budget comparison, consistent with the previous USD budget field. Food mood alone can support a craving match; free text is not required. Feedback is not used for learning.

Full route/data shapes are documented in `docs/step-2-contract.md`. Ordinary Python/browser tests mock upstream responses; explicit `npx playwright test --config playwright.ai.config.cjs` calls real configured services using a synthetic fixture. Do not run it accidentally in CI or with private inputs. The class endpoints still use unencrypted HTTP, and public deployment/actual-host connectivity/Docker runtime/physical-phone checks remain separate unverified concerns.
