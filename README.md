# ForkCast

**Your table, your taste.** A restaurant-menu assistant for the MBAX 6418 group final project.

**Contributors:** Linh · Jamie · Jana · Kelly · Mirina

## What the app does

The intended flow is **Cravings → Restaurant menu → Dish recommendations**. Tell ForkCast what you want to eat, provide the restaurant's menu, and eventually receive suggestions based on that menu, your preferences, dietary requirements, and budget. Taste profile and Meal history are supporting destinations.

## Current checkpoint: step 1 only

**Working:** the Corner Diner responsive UI, Python API, SQLite guest workspaces, profile/craving/link/review persistence, resized meal-review photos, clear-saved-data, conflict detection, and a System status screen. Separate guest cookies isolate browsers; there are no accounts or cross-device sync yet. Old browser-only drafts are imported only after an explicit confirmation.

**Not implemented:** menu-photo extraction, restaurant website/PDF import or menu discovery, dish recommendations, preference learning, and accounts. Their UI sections are intentionally honest empty states. Menu photos preview locally and are not retained; menu links save without fetching websites.

The existing class **DeepSeek text** and **Qwen vision** services are configured server-side and have passed synthetic local inference checks. They are not yet wired into dining features. Availability can change; use the on-demand checker below. A configured status is not a live service check. The class services use unencrypted HTTP: use sample data, never sensitive dietary details or private photos.

## Run the actual app locally

Use Python 3.11+ (verified with 3.12) and `uv`, from the repository root:

```sh
uv venv --python 3.12 .venv
uv pip sync requirements-dev.txt
```

If you do not already have `.env`, copy `.env.example` to `.env` and fill the course credentials privately. **Do not overwrite an existing `.env`.** Empty service credentials do not prevent storage/the website from running; System status will show them as not configured. The app reads `.env` itself; no Hermes installation or shell sourcing is required.

```sh
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8014 --workers 1 --no-access-log
```

Open `http://127.0.0.1:8014`. The server creates `data/forkcast.sqlite3`. Stop with Ctrl+C in its terminal. Keep the database and the same browser/hostname to retain the same guest data across restarts.

On Windows use `.venv\Scripts\python.exe` in place of `.venv/bin/python`. `npm start` is an alternative after activating the Python environment. This is local development, not a public production deployment.

**Do not use `python -m http.server` from the repository root:** it can expose `.env` and the database. For a UI-only preview with no backend, use the restricted server:

```sh
python scripts/preview.py --port 18014
```

That separate preview explicitly uses browser-only storage. It never silently replaces a failed server save with a local save.

## Check the class services

Run only when you intend to make the small synthetic API requests:

```sh
.venv/bin/python -m backend.check_endpoints
```

It verifies the configured models are listed and obtains complete final answers from a harmless text prompt and a generated colored square. It prints a sanitized report and exits nonzero on failure. It does not send profiles, menus, meal photos or credentials to the browser. **System status → Refresh connection status** checks the app/database and configuration presence without calling either model.

## Tests

Install Node.js 22+ and Google Chrome for browser tests:

```sh
npm ci
npm test
npm run test:ui
.venv/bin/python -m pytest tests/backend -q
# With the real backend running on port 8014:
npm run test:live
```

`test:ui` starts an isolated restricted browser-only preview on port 18014 and uses simulated API responses only for transport/UI failure tests. It does not touch the live guest workspace or call AI services. `test:live` exercises the real API and database with independent sample guests, then clears their saved state. Backend tests use temporary databases and simulated upstream responses, not live AI calls. One test-only Starlette/HTTPX deprecation warning is documented in the backend guide.

Coverage includes all nine views at 320/390/768/1440px, keyboard/mobile navigation, contrast checks, safe text rendering, photo validation, guest persistence/isolation, failed saves/imports/clears, stale revisions, CSRF/origin checks, body limits, and private-file denial. This is not a full accessibility, physical-device or Safari audit.

## Manual acceptance checklist

Use [the step-1 checklist](docs/step-1-manual-tests.md) before moving to menu extraction. It lists exact actions and expected outcomes, including refresh/restart persistence, private-browser isolation, failed saves, two-tab conflicts, and data clearing.

## Where to edit

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `assets/` | Shared Corner Diner UI, design tokens, responsive components, local decorative SVGs |
| `app.js` | Navigation, forms, persistence flow, legacy-import consent and connection status |
| `server-state.js` | Same-origin revision-aware API transport and safe failure handling |
| `state.js` | Legacy/browser-only draft helpers |
| `backend/` | Python API, SQLite storage, configuration, validation and endpoint diagnostics |
| `docs/ui-design.md` | Recreating the theme and navigation conventions |
| `docs/backend.md` | API/configuration, setup, security limits and deployment preparation |
| `tests/`, `tests/backend/`, `tests/live/` | Unit, browser, API and live integration tests |

Make feature changes on personal branches, test, then open a pull request into `main`. Do not commit credentials, user data, test outputs, databases or installed dependencies. Hermes and Codex are coding tools; GitHub supports version control and collaboration.

## Privacy, storage and deployment limits

- In **server mode**, profiles, cravings, saved links, reviews and resized meal-review photos are stored in SQLite for this guest browser. They are not synced to other devices and are not sent to an AI service by the dining UI in step 1. Original photo metadata is discarded by browser re-encoding.
- In **browser-only preview**, saved data stays in browser storage. Existing browser-only data never auto-uploads. An explicit import replaces this guest's server state, rather than merging it.
- Guest cookies are bearer credentials, not accounts. The local cookie is HttpOnly/SameSite Strict and persists for up to 30 days. Clearing cookies starts another guest; it does not erase the old database record. Use Clear saved data first if deletion is intended. There is no account recovery yet.
- SQLite and backups are not encrypted at rest. Keep the database private. `.env` and database files are ignored by Git and cannot be downloaded through the app's static routes. Unsaved forms may be lost on refresh; failure messages keep them on screen for retry.
- A menu-photo preview is not a persisted meal-review photo. No menus are analyzed, links fetched, or food-safety guarantees made at this checkpoint. Verify ingredients, religious compliance and cross-contact with restaurant staff.
- Docker/deployment configuration is prepared, **not deployed**. No host has been selected, actual deployed-host connectivity is unverified, and Docker could not be built/run here because Docker is not installed. A public host needs persistent storage, HTTPS, secure cookies, explicit allowed hosts, service access and further abuse/identity controls; see the backend guide.
- Physical-phone camera and Safari checks remain outstanding. Trusted-LAN setup is separate from localhost; do not expose the development server automatically.
