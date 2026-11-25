# Step 1 verification record

## Scope
Python API and SQLite guest storage, existing-form integration, private configuration, synthetic course-service checks, deployment preparation, and manual acceptance instructions. No dining-feature AI calls, menu extraction, website import, recommendations, learning, or accounts have been added.

## Executed checks

| Check | Observed outcome |
| --- | --- |
| Python API/storage/security tests | 47 passed; one documented test-only Starlette/HTTPX deprecation warning |
| JavaScript unit/package tests | 17 passed |
| Browser regression and simulated failure tests | 37 passed, including the photo/save timing regression |
| Browser-to-real-backend tests | 6 passed |
| Real class text check | Configured DeepSeek model listed; complete expected final answer returned |
| Real class vision check | Configured Qwen model listed; generated red square correctly identified |
| Clean-source Python environment | New Python 3.12 environment; locked dependencies installed; compatibility check passed |
| Clean-source Node setup | `npm ci` succeeded; all JavaScript/browser suites passed |
| Clean-source backend without private configuration | UI and storage worked with text/vision explicitly unconfigured |
| Real OS-process restart | Sample guest state survived stop/start with the same cookie; sample state cleared afterward |
| Desktop/mobile screenshots and DOM checks | All nine views fit, no broken images or page errors; visible buttons met the checked height target |
| Static security checks | No matched literal secrets, dangerous eval/exec, shell injection, formatted SQL, unsafe deserialization or innerHTML assignment in changed/new code |
| Private-file checks | App and restricted preview deny `.env`, `.git/config`, database files and backend source routes |
| Git/privacy | `.env`, databases, installed dependencies and generated results are ignored; no commit or push for this step |

The clean source snapshot contained the current tracked/untracked deliverable, not the old committed-only UI. It excluded `.env`, real data, installed dependencies, and Hermes-specific runtime state. Therefore it verifies fresh source setup, but it is not a claim that these uncommitted changes are already available from GitHub. Tests used temporary databases or independent synthetic browser guests, not the user's workspace.

The on-demand endpoint CLI was executed locally and reported both model-list and inference checks successful. It used only a harmless prompt and generated image. Availability may change. Health/UI configuration indicators do not substitute for this inference check.

## Outstanding checks and boundaries
The first independent review found a race where photo preparation could unlock the review button during a different form's pending save. A separate fix agent reproduced success/error timing failures before changing code, centralized the submit state, guarded submission before reading disabled fields, and added three controlled browser tests. The parent reran all four suites successfully. The final independent re-review **passed**, with no security concerns, logic errors, or remaining suggestions. It independently reran all three timing regressions and the JavaScript unit suite. No later-stage functionality was added.
- No deployment host selected; actual deployed-host connectivity is unverified.
- Docker unavailable in this environment: packaging source checks passed, but no image build/run was performed.
- Real-phone camera and Safari verification remain outstanding.
- This is a local/sample-data foundation, not a public-production security certification. Class model transport is unencrypted HTTP, guest cookies are not accounts, SQLite is not encrypted at rest, and public abuse/identity controls are not implemented.

Manual actions and expected outcomes are in `docs/step-1-manual-tests.md`. Stop at this checkpoint until those checks and any host decision are reviewed.
