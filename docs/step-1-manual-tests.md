# Step 1 — manual acceptance checks

Use sample information, not real allergy/health details or private photos. This stage establishes server storage and checks the course services; it does **not** implement menu reading, restaurant-website importing, dish recommendations, accounts, or preference learning.

## Start here
Open `http://127.0.0.1:8014` with the Python backend running (not the separate browser-only preview). Keep using the same hostname: `localhost` and `127.0.0.1` are different browser origins and may use different guest cookies.

| Check | What to do | Expected result |
| --- | --- | --- |
| Connection | Open **System status** in the footer; click **Refresh connection status**. | App server is Connected; SQLite is Ready. Text/vision may say Configured, but this is explicitly not a live AI availability check. |
| Save a profile | Set a sample name, budget, likes/dislikes, and dietary requirements. Save, refresh, then return to Taste profile. | Values remain. Confirmation says the data was saved to the server for this guest browser. |
| Craving-first flow | Choose a food mood or enter a craving, then click **Save craving & continue**. | Save succeeds before opening Restaurant menu. Revisiting Cravings restores the saved values. |
| Link persistence | Save a sample restaurant/menu link, refresh, then remove it and refresh again. | The saved link survives the first refresh and stays removed after the second. No website is fetched or analyzed. |
| Review persistence | Save a sample dish, rating, notes and optional JPEG/PNG/WebP photo. Refresh Meal history. | Review and resized photo remain; the successful save clears the review form. Preference learning remains unconnected. |
| Photo/save timing | If a meal photo is still preparing, save a profile change in another section and return to Meal history. | Review submission remains disabled while either image processing or another save is pending. No console error or lost review draft. This timing overlap is also covered by an automated regression test. |
| Menu-photo boundary | Select a menu photo, then refresh. | Preview works but is intentionally not retained or analyzed in step 1. This is different from a saved meal-review photo. |
| Restart persistence | Restart only the ForkCast Python server, then revisit the same URL in the same browser. | Saved profile, craving, link and reviews return from SQLite. Do not delete `data/` or switch guest cookies. |
| Separate guests | Open the same URL in a private/incognito window or another browser. | It starts with a separate empty guest workspace. Data saved there must not appear in the original browser. There is no account synchronization yet. |
| Failed save | With a form filled, use browser DevTools Network → Offline, then save. Return online and retry. | No success message; input remains; craving does not advance. Retry can save once the connection is back. Never silently switch a server workspace into local-only storage. |
| Two-tab conflict | Open the same profile in two tabs. Save a change in tab A, then save a different change from stale tab B. | Tab B warns that data changed in another tab. It does not silently overwrite tab A. Copy any unsaved text before reloading B. |
| Legacy migration | If you have an older browser-only draft, inspect the migration notice. Choose Not now, or explicitly Import and confirm. | Nothing uploads automatically. Import replaces this guest's saved server data only after consent; a failed import keeps the browser-only copy. A successful import removes that local copy if browser storage allows it. |
| Clear saved data | In the test guest, choose **Clear saved data**, cancel once, then confirm it. Refresh. | Cancel changes nothing. Confirm clears only this guest's profile/craving/link/reviews/photos and local backup; other guests are unaffected. |
| Private files | Try `/.env`, `/.git/config`, `/data/forkcast.sqlite3` and `/backend/main.py` on the same local server. | 404 responses. No credentials, code internals or database download. |
| Small-screen layout | Use a narrow viewport (320–390px) and keyboard navigation; if available, also try a real phone using the deployment/LAN instructions. | Labels, workflow steps, menu toggle and save/error messages remain usable without horizontal scrolling. Localhost on a phone is not the computer. |

For a restart: if you launched the server in a terminal, use Ctrl+C there and rerun the documented command. If Hermes launched it, ask Hermes to restart **only ForkCast's server**. Saved data should remain; do not remove the database for this test.

## Live course-service check
From the repository root, run `.venv/bin/python -m backend.check_endpoints` (or `python -m backend.check_endpoints` after activating the environment). Full setup is in `docs/backend.md`. It uses a harmless text prompt and a generated colored image, not profile data or a restaurant upload. Both configured models must be listed, and both checks must return a complete valid final answer. Missing credentials, wrong models, timeouts or unavailable services must be reported as failures, not guessed results. Do not paste credentials or a `.env` file into chat/GitHub.

The app's **Refresh connection status** button is intentionally different: it checks the app/database and configuration presence without spending model requests.

## Limits to accept at this checkpoint
- Dish recommendations, menu reading and preference learning stay clearly unconnected. Their lack of output is expected, not a failed step-1 test.
- A guest cookie identifies this browser's server workspace. Clearing cookies creates a different guest; it does not delete the old server record. Clear saved data first if deletion is intended.
- Existing class services use unencrypted HTTP. Use synthetic/sample data; do not infer production privacy from these connectivity checks.
- Deployment-host connectivity remains unverified until a host is selected and the same checker is run from that actual host.
- A Docker configuration alone is not a successful image build or deployment. Any untested Docker/physical-device/Safari checks must stay explicitly listed as verification gaps.
