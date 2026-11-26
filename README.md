# ForkCast

**Your table, your taste.** A restaurant-menu assistant for the MBAX 6418 group final project.

**Contributors:** Linh · Jamie · Jana · Kelly · Mirina

## What the app does

The intended flow is **Cravings → Restaurant menu → Dish recommendations**. Tell ForkCast what you want to eat, provide the restaurant's menu, and receive suggestions based on that menu, your preferences, dietary requirements, and budget. Taste profile and Meal history are supporting destinations.

## Current checkpoint: step 2 — photo to reviewed recommendations

**Working:** the Corner Diner responsive UI, Python API, SQLite guest workspaces, profile/craving/link/review persistence, resized meal-review photos, clear-saved-data, conflict detection, and a System status screen. Separate guest cookies isolate browsers; there are no accounts or cross-device sync yet. Old browser-only drafts are imported only after an explicit confirmation.

**New in step 2:** explicit Qwen menu-photo extraction, an editable dish/price/currency review, manual-entry fallback, mandatory saved review, and DeepSeek ranking constrained to the reviewed menu. Dish names/prices and quoted evidence come from that menu. Known explicit conflicts and comparable over-budget dishes are excluded before ranking; unknown prices/currencies remain unverified. Reviewed menus and results persist per guest, with revision checks and stale-context invalidation.

**Still not implemented:** restaurant website/PDF import or menu discovery (step 3), preference learning, and accounts. Menu links remain save/open/remove only. Original menu-photo bytes are not retained; extracted/reviewed text is saved. A photo with no readable menu is an error, not invented data.

The existing class **DeepSeek text** and **Qwen vision** services are configured server-side and have passed synthetic local inference checks. Analyze photo with AI sends only the resized menu image to Qwen; Generate recommendations sends saved profile/craving and reviewed-menu data to DeepSeek. These are explicit actions, never automatic page-load or preference-save requests. Availability can change; use the on-demand checker below. A configured status is not a live service check. The class services use unencrypted HTTP: use sample data, never sensitive dietary details or private photos.

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

Open `http://127.0.0.1:8014`. The server creates `data/forkcast.sqlite3` and transactionally upgrades version-1 guest databases to schema 2 without removing their saved state. Back up an existing database before upgrades. Stop with Ctrl+C in its terminal. Keep the database and the same browser/hostname to retain the same guest data across restarts.

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
# Optional, explicit live model calls using only synthetic fixtures:
npx playwright test --config playwright.ai.config.cjs
```

`test:ui` starts an isolated restricted browser-only preview on port 18014 and uses simulated API responses only for transport/UI failure tests. It does not touch the live guest workspace or call AI services. `test:live` exercises the real API and database with independent sample guests, then clears their saved state. Backend tests use temporary databases and simulated upstream responses, not live AI calls. The separate `playwright.ai.config.cjs` suite makes real Qwen/DeepSeek calls using the synthetic menu in `tests/fixtures/`; it is never included in ordinary test commands. One test-only Starlette/HTTPX deprecation warning is documented in the backend guide.

Coverage includes all eight views at 320/390/768/1440px, keyboard/mobile navigation, contrast checks, safe text rendering, photo validation, guest persistence/isolation, failed saves/imports/clears, stale revisions, CSRF/origin checks, body limits, and private-file denial. This is not a full accessibility, physical-device or Safari audit.

## Manual acceptance checklist

Use [the step-2 checklist](docs/step-2-manual-tests.md) with the included [synthetic menu image](tests/fixtures/sample-menu.png). It lists concrete sample preferences, expected extracted values, review/price/budget tests, stale results, invalid input, failure/retry, guest isolation and mobile checks. The [step-1 checklist](docs/step-1-manual-tests.md) remains useful for storage regressions; its no-AI boundary describes the earlier checkpoint.

## Where to edit

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `assets/` | Shared Corner Diner UI, design tokens, responsive components, local decorative SVGs |
| `app.js` | Navigation, forms, persistence flow, legacy-import consent and connection status |
| `menu-flow.js` | Explicit photo analysis, safe editable review and menu-sourced recommendation UI |
| `server-state.js` | Same-origin revision-aware API transport and safe failure handling |
| `state.js` | Legacy/browser-only draft helpers |
| `backend/` | Python API, SQLite storage, configuration, validation and endpoint diagnostics |
| `docs/ui-design.md` | Recreating the theme and navigation conventions |
| `docs/backend.md` | API/configuration, setup, security limits and deployment preparation |
| `tests/`, `tests/backend/`, `tests/live/` | Unit, browser, API and live integration tests |

Make feature changes on personal branches, test, then open a pull request into `main`. Do not commit credentials, user data, test outputs, databases or installed dependencies. Hermes and Codex are coding tools; GitHub supports version control and collaboration.

## Privacy, storage and deployment limits

- In **server mode**, profiles, cravings, saved links, reviews and resized meal-review photos are stored in SQLite for this guest browser. They are not synced to other devices. Profile/craving data and the reviewed menu are sent to the text service only when you explicitly generate recommendations; photo extraction sends the menu image only. Saved reviews are not used for learning yet. Original photo metadata is discarded by browser re-encoding.
- In **browser-only preview**, saved data stays in browser storage. Existing browser-only data never auto-uploads. An explicit import replaces this guest's server state, rather than merging it.
- Guest cookies are bearer credentials, not accounts. The local cookie is HttpOnly/SameSite Strict and persists for up to 30 days. Clearing cookies starts another guest; it does not erase the old database record. Use Clear saved data first if deletion is intended. There is no account recovery yet.
- SQLite and backups are not encrypted at rest. Keep the database private. `.env` and database files are ignored by Git and cannot be downloaded through the app's static routes. Unsaved forms may be lost on refresh; failure messages keep them on screen for retry.
- A menu-photo preview is not a persisted meal-review photo. A resized menu image is analyzed only on explicit request, while original image bytes are not stored. Menu text/results are stored; links are not fetched. No food-safety or religious-compliance guarantees are made. Verify ingredients, religious compliance and cross-contact with restaurant staff.
- Docker/deployment configuration is prepared, **not deployed**. No host has been selected, actual deployed-host connectivity is unverified, and Docker could not be built/run here because Docker is not installed. A public host needs persistent storage, HTTPS, secure cookies, explicit allowed hosts, service access and further abuse/identity controls; see the backend guide.
- Physical-phone camera and Safari checks remain outstanding. Trusted-LAN setup is separate from localhost; do not expose the development server automatically.
