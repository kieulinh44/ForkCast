# Step 2 implementation contract

Scope: one menu photo → editable extracted menu → mandatory saved review → personalized recommendations from that menu. No URL fetching/discovery, learning, accounts, or deployment. Keep diner UI and all step-1 data/functionality. No automatic AI calls at page load or preference save. Images/profile text reach the existing HTTP class services only through explicit Analyze/Generate actions and visible sample-data warnings. Do not retain original uploaded image bytes in SQLite.

## Same-origin API
Existing state endpoints stay compatible. Add optional profile key `currency` (uppercase three-letter currency; default comparison currency USD for old profiles because the existing budget label was USD). Never convert currencies.

All new writes require the existing guest cookie, `X-ForkCast-Request: 1`, JSON, matching Origin, 5 MiB body cap. Never accept another guest ID. Enforce current guest-state revision and workflow revision both before model work and in the final transaction, so old results cannot overwrite profile/menu changes or a clear. Avoid holding a DB transaction during inference. Reject concurrent model requests for the same guest (429) and bound upstream timeouts. Errors must be sanitized; preserve saved menu/results on failure.

- `GET /api/menu` → workflow envelope below. A new guest has `menu_revision:0`, `menu:null`, `recommendations:null`, `context_changed:false`. `state_revision` reflects current saved guest state. Do not create guests here; use GET /api/state first.
- `POST /api/menu/extract` body `{image_data,menu_revision,state_revision}` → workflow envelope. `image_data` is a bounded JPEG/PNG/WebP data URL (not a remote URL); validate actual bytes/pixels. Qwen extracts only visible menu facts, no inferred ingredients/currency/price. New extraction replaces the current menu **only on successful nonempty extraction**, marks `reviewed:false`, clears recommendations, increments workflow revision. Empty/non-menu/unreadable input is an explicit 422, not invented items. Browser confirms replacement when an existing menu is present.
- `PUT /api/menu` body `{menu:{restaurant_name,currency,items:[{id,name,description,price,price_note}]},menu_revision,state_revision,manual_replacement?:boolean}` → workflow envelope. The optional strict boolean `manual_replacement` signals the explicit Enter menu manually action; true sets server-owned source to manual, false/omitted preserves photo provenance for ordinary edits. It cannot assert photo provenance, and arbitrary `source` fields remain forbidden. This action explicitly saves/marks the reviewed menu, invalidates prior recommendations, increments workflow revision. IDs can be omitted/null for new items; server assigns IDs. Preserve provided valid unique IDs. Permit manually entered menus too. At most 40 dishes; nonblank names; bounded text; finite nonnegative prices or null; unknown currency null; duplicate IDs invalid. `price_note` preserves variants/unclear prices without inventing a single numeric price. No guest-supplied reviewed/source/model fields.
- `POST /api/recommendations` body `{menu_revision,state_revision}` → workflow envelope. Requires a saved reviewed nonempty menu. Read saved profile/craving from SQLite, not request-supplied copies. Explicit user action calls DeepSeek. Model selects at most three allowed item IDs with exact menu-text evidence and match tags; reject unknown/duplicate IDs or invented evidence. Build names/prices/currency and explanation/cautions server-side from the reviewed menu, not model-supplied facts. Never guess a result from reasoning or substitute fabricated API output on failure.
- `DELETE /api/menu` body `{menu_revision,state_revision}` → workflow envelope. Clear only this guest's menu/results and increment workflow revision.
- Existing `DELETE /api/state` also clears this guest's menu/results transactionally. Preserve step-1 state shape; menu data is separate.

Workflow envelope:
```json
{
  "menu_revision": 1,
  "state_revision": 0,
  "menu": {
    "restaurant_name": "", "currency": null,
    "items": [{"id":"server-id","name":"Dish","description":"Visible menu description","price":null,"price_note":""}],
    "reviewed": false, "source": "photo", "warnings": []
  },
  "recommendations": null,
  "context_changed": false
}
```
Non-null recommendations shape:
```json
{
  "items": [{"item_id":"server-id","name":"Dish","description":"Visible menu description","price":null,"currency":null,"reason":"Server-built explanation grounded in menu evidence","evidence":"Visible menu description","budget_status":"unknown","cautions":[]}],
  "message":"", "excluded":[{"item_id":"excluded-id","name":"Other dish","reason":"Known conflict"}], "warnings":[]
}
```
`budget_status`: `within_budget`, `unknown`, or `not_set`. Over-budget dishes with comparable known currencies are excluded, not recommended. Unknown prices/currency or differing currencies must clearly say budget cannot be verified. Unknown prices never become zero. If no eligible dishes remain, return honest empty results and exclusions, without fallback inventions/model calls.

Store a digest of relevant saved context (profile, mood, craving) with recommendations. After those change, GET hides old recommendations (`recommendations:null`, `context_changed:true`), requiring regeneration. Editing/replacing a menu clears old results. Feedback alone is not learning and does not affect ranking. Model work must not hold SQLite locks. A transactional schema-v2 migration preserves existing v1 guest data; per-guest workflow rows are removed with guest expiry/clear.

## Safety and grounding
Treat menu/profile text as untrusted data, not instructions. Use exact final JSON content only, check model ID/finish_reason/size/schema, and sanitize service errors. Known explicit dietary/allergy/dislike conflicts and over-budget items are excluded before ranking. Use conservative common allergen/diet mappings; never imply completeness or safety. All suggestions require staff confirmation of ingredients/cross-contact; religious compliance is not established from menu text. Never display allergy-safe/certified or match percentages. Do not expose raw model reasoning or invented prices/ingredients. Limited/free-text restrictions remain uncertain even when no explicit conflict was found.

AI selection format (not public response): `{"selections":[{"item_id":"allowed-id","evidence":"exact substring of name or description","match_tags":["craving","favorites","spice"]}]}`. Tags optional/validated; use only tags with corresponding saved context. Explanations are composed from the validated evidence/context, not unbounded model-written safety claims. No free-form model-generated names/prices are trusted.

## Frontend integration
Add external `menu-flow.js` after app.js. Backend and restricted preview whitelist it; Docker includes it. app.js exposes a small `window.ForkCastApp` bridge with readiness Promise, server mode, current state revision/context, and exclusive `withServerOperation(task)` using the existing saveBusy/form-lock mechanism. Reuse the unified photo/save lock logic; do not re-enable feedback during model work. Emit saved/cleared events for menu-context invalidation and clearing. Keep profile currency selectors consistent with budget comparisons.

Menu screen: select/preview photo → explicit Analyze photo with AI → loading/status → editable dish cards (name, description, price, price note) and restaurant/currency → add/remove dishes → Save reviewed menu → Continue to dish recommendations. Manual entry is a fallback; it does not pretend the image was recognized. Empty/invalid input or failed AI call does not wipe prior saved work. Dirty edits must disable recommendation generation until saved. New photo is not auto-uploaded. Include clear source/review status and explain uncertain fields. Keep menu links explicitly save-only until step 3.

Recommendations screen: show the reviewed source/menu and saved craving/profile context, explicit Generate/Regenerate button, up to three sourced cards, listed price/unknown currency, reason and cautions, exclusion/no-match states, retry action. On profile/menu changes, mark results stale rather than continuing to present them as current. No fake sample cards. Keep learning visibly unconnected. Persist reviewed menu/results across reload/restart; isolate guests; clear all current-guest data through existing clear action. Browser-only preview labels AI unavailable and preserves old local-only features.

## Tests and rollout
Strict vertical TDD. Stub services in automated tests; parent will run a small synthetic live menu through actual Qwen/DeepSeek. Cover v1 migration, schema/price/ID validation, guest isolation, review gate, errors/timeouts/truncation/invalid JSON, prompt injection, bad IDs/evidence, no-match, unknown/cross-currency budgets, stale context and in-flight conflicts/clear, body limits, image validation, async UI locks, edits/reloads, 320px layout, and all step-1 regressions. No push or commit. Stop before step 3 and give manual actions with expected results and verification gaps.
