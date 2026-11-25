# ForkCast UI: Corner Diner

## Design intent
A familiar, everyday food companion: warm cream, navy, paprika, subtle checkerboard, and an upright rounded wordmark. Nostalgia comes from color and tactile details, not distressed or italic type. The primary surface is **Configure/Operate**: choose a craving, provide the restaurant menu, then review dish recommendations. Home explains that this is a restaurant-menu assistant before asking the user to begin. Taste profile and meal history are supporting destinations, not prerequisites or competing steps. Use plain-language labels and American English (favorite, flavor, color).

## Recreating the visual system
All screen styling is in `styles.css`; its `:root` block is the source of truth. No CDN, web-font service, framework or build step is required for the UI. Local SVGs live in `assets/`.

| Role | Value |
| --- | --- |
| Page cream | `#fff0cf` |
| Card cream | `#fffaf0` |
| Navy / text | `#213d62` |
| Muted text | `#546076` |
| Paprika / primary action | `#ad371e` |
| Border | `#d5bfa0` |
| Warm accent surface | `#f4d3a0` |
| Standard card radius | `10px` |
| Buttons / fields | `5px` radius |

The chosen wordmark stack is `ui-rounded, 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif`, weight 900, upright. This mirrors wordmark A approved in the visual studies. Body type is `'Trebuchet MS', Arial, sans-serif`; major headings use bold Arial. These are OS fonts: exact glyphs can vary by device, while sizing, hierarchy, spacing and colors remain defined in CSS. No proprietary font files are redistributed. If identical typography across platforms later becomes a requirement, choose and bundle a properly licensed rounded font.

## Layout and navigation
- Maximum outer width: 1240px, fluid content, 40px desktop side gutters.
- Desktop: Home, Cravings, Restaurant menu, and Dish recommendations in journey order; Taste profile and Meal history have secondary styling.
- Each workflow screen shows the same three-step navigator, with the current step marked explicitly. Saving a craving advances to the restaurant-menu screen only after a successful save. Failed saves retain the input and current step.
- Preserve the stable `#mood`, `#menu`, and `#picks` hashes for existing links, but do not expose ambiguous “My menu” or “Your picks” labels.
- Between 641 and 1000px the header uses a three-column navigation grid to avoid orphaned wrapped items.
- At 900px: tighter gutters and spacing.
- At 640px and below: a labeled Menu toggle, two-column expanded navigation, stacked panels/forms, 20px gutters.
- Without the JavaScript enhancement class, mobile navigation remains visible rather than disappearing. App views and forms still require JavaScript.
- All screens have a heading, breadcrumb and shared footer. URLs use stable hashes (`#overview`, `#profile`, `#menu`, `#mood`, `#picks`, `#feedback`, `#preferences`, `#brief`, `#system`).
- Learned preferences are accessible from the footer and taste profile; the project brief stays secondary. System status exposes safe app/database checks and configuration presence, not credentials or live inference.

## Components and states
- Primary: paprika fill, navy 2px border, small navy offset shadow; no large pill buttons.
- Secondary: light surface, navy outline.
- Major controls target at least 44px height; text inputs use 16px type for mobile readability.
- Forms stack on phones; no fixed-width forms or desktop-only hover interactions.
- Selected moods include a checkmark; state does not rely on colour alone.
- Focus rings, native form labels, skip link, live feedback, and reduced-motion support are retained.
- Decorative burger illustration is branding, not a restaurant dish image. Do not show it as recommendation evidence.

## Honest feature boundaries
Dish recommendations and Learned preferences are intentionally empty, explicitly labelled UI sections. There is no fake recommendation data, dining-feature model call, preference inference, account system, menu extraction or website fetching. Backend persistence and an explicit synthetic endpoint checker are available in step 1. In the actual Python app, profile, mood, links, reviews and resized meal photos persist to an isolated SQLite guest workspace. A separate restricted preview remains browser-only. Menu photos are local previews only. Old local drafts migrate only after explicit approval.

Future backend work should populate these screens rather than replace the design system. Explicit dietary requirements take priority; unsupported ingredients, prices and safety claims must not be invented.

## Mobile and independent reproduction
Run the Python backend as documented in README. Never serve the repository root with `http.server`: it contains ignored configuration and user data. Use `python scripts/preview.py --port 18014` for a restricted browser-only preview. Install test dependencies with `npm ci`, then run `npm test` and `npm run test:ui` (installed Chrome required). Tests cover the nine screens at 320, 390, 768 and 1440px widths, plus functional regressions and mobile navigation.

For an optional trusted-LAN phone preview, bind the Python backend to `0.0.0.0` and explicitly allow the computer’s LAN hostname/IP in backend settings and use the computer's LAN IP with port 8014. This exposes the app to the network; private repository files are not served, but use sample data, only on a trusted private network, and do not treat it as production hosting. This has not been started automatically. Localhost on the phone is the phone itself, not the computer. Camera behavior depends on the browser/device; physical-phone and Safari checks remain required. Guest data does not sync across origins/devices. SQLite persistence is implemented; public deployment and authentication remain separate upcoming stages.

## Visual self-audit
The composition prioritizes a concrete task and real saved state. No gradients, glass panels, fake statistics, generated testimonials or equal-weight SaaS feature tiles. The rounded system font is a deliberate brand choice. Checkerboard and illustration appear only at the entry point; forms remain restrained. Functional screenshot and contrast checks supplement, but do not replace, a full accessibility audit or physical-device testing.
