# Step 2 verification record

## Delivered scope
Explicit menu-photo analysis → editable menu → mandatory saved review → personalized recommendations from the reviewed menu. Existing guest state and the approved diner UI are preserved. Website/PDF import, preference learning, accounts and public deployment remain outside this checkpoint. No changes are committed or pushed by this task.

## Actual service and persistence evidence
- Direct protocol probe used a synthetic five-dish menu: Qwen returned the exact expected names/prices and explicit USD; the intentionally missing salad price stayed null. DeepSeek selected allowed IDs with exact source evidence.
- The real API pipeline test used the configured Qwen/DeepSeek services, corrected a price before review, enforced the review gate, checked canonical IDs/prices/evidence/exclusions, and verified relevant profile changes invalidate results.
- The full real browser flow uploaded/resized the fixture, analyzed it, edited/saved the menu, generated actual recommendations, reloaded the saved result, and checked mobile layout. It observed no page errors or automatic pre-action model calls.
- A real application-process restart preserved a reviewed menu and actual model-generated results for the same isolated synthetic guest. The sample data and temporary cookie artifact were cleared afterward.
- An owner-private SQLite backup was made before the schema-v2 upgrade. Transactional v1-to-v2 migration tests preserve guest data; menu/workflow rows remain guest-isolated and are cleared/expired with the guest state.

These are observed test results, not fabricated model output. Fixture facts are labeled synthetic ground truth in `tests/fixtures/sample-menu.expected.json`. Ordinary tests simulate upstream responses; only the explicit AI test configuration calls the real class services. No private user menus/profile data were used.

## Regression and setup evidence
Final clean-source run: **124 backend tests, 18 JavaScript tests, 63 browser regression tests, and 9 real-backend browser tests passed**. The separate explicit real-model suite passed **2 tests** (actual API pipeline and complete browser flow). A pre-existing test-only Starlette/HTTPX deprecation warning remains; it is not a runtime error. The independent review **passed** after two targeted fixes. It verified the protected dirty-menu base revision and explicit manual-replacement provenance, reran workflow/focused browser regressions, and reported no remaining blocking security or logic issues in the step-2 scope.

A clean source snapshot, excluding `.env`, real databases and installed dependencies, was installed into a new Python 3.12 environment with locked Python/Node dependencies. Its ordinary suites and live local-backend tests passed without Hermes or private service credentials. A reviewed menu and profile survived that isolated server's OS-process restart. This verifies current uncommitted-source setup, not that the changes are already on GitHub.

## Issues found and corrected during completion
- Fixed a food-mood-only context being rejected when a model used the craving match tag.
- Added missing `menu-flow.js` to the Docker context whitelist; packaging tests check copied frontend sources are included.
- Preserved explicit favorites/dislikes/dietary/allergy labels in the recommendation summary and corrected clear-all confirmation to name menu/results.
- Ignored older locally superseded refreshes rather than showing false other-tab conflicts.
- A dirty editor no longer rebases its original menu revision onto a newer menu received from another tab. The regression reproduces the overwrite risk before the guard and verifies the original revision remains protected.
- Explicit manual replacement now carries a strict action-intent flag, so an unrelated manually entered menu is not mislabeled as photo-derived. Ordinary photo edits retain provenance, canceled/failed actions preserve work, and clients still cannot supply arbitrary source values.
- Home now reflects a saved reviewed/extracted menu instead of incorrectly calling it unread/missing.
- Replaced a browser-specific computed-grid assertion with actual desktop/mobile field geometry checks after confirming the layout itself already worked.

## Limits, not claims of verification
- Class-service transport remains unencrypted HTTP. Use sample data. Term-based dietary/allergy exclusions are incomplete and do not establish safety or religious compliance; confirm with restaurant staff.
- Docker configuration/packaging sources are checked, but Docker is unavailable here, so no image build/run is claimed.
- No deployment host has been selected; actual deployed-host connectivity is not verified.
- Physical-phone camera and Safari checks remain manual; browser viewport tests are not those tests.
- One existing test-only Starlette/HTTPX deprecation warning remains.

Manual actions and expected outcomes are in `docs/step-2-manual-tests.md`. Stop before step 3.
