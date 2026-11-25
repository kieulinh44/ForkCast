# ForkCast

**Your table, your taste.** An AI-powered restaurant menu assistant proposed for the MBAX 6418 group final project.

**Contributors:** Linh · Jamie · Jana · Kelly · Mirina

## Our proposal

Choosing what to order can be overwhelming, particularly when dishes and ingredients are unfamiliar. Dietary restrictions, allergies, religious dietary requirements, food preferences, budgets, and cravings can make the choice harder.

ForkCast aims to recommend dishes from a restaurant's available menu based on an individual's preferences. Our proposed features are a personalized taste profile, menu-photo recognition, mood-based recommendations, dish ratings and feedback to improve future recommendations, and a mobile-friendly interface. Professor Dobolyi also suggested accepting online menu links.

## Current interface — Corner Diner

- Responsive Corner Diner theme: cream, navy, paprika, an upright rounded wordmark, shared components and mobile navigation.
- Clear craving-first flow: choose a craving → add the restaurant menu → review dish recommendations. Home explains the app; taste profile and meal history are secondary.
- Shared workflow steps and a save-and-continue action guide navigation. The project brief and team credits stay secondary.
- Dish recommendations and Learned preferences sections with honest empty states. Neither AI feature is connected yet.
- Taste-profile form covering preferences, dietary needs, allergies, spice tolerance, and budget.
- Local menu-photo preview with file-type and size validation.
- Menu-link entry, validation, local saving, opening, and removal.
- Mood/craving selection and meal-feedback forms.
- Optional meal photo from camera or gallery, with preview/removal and browser-local saving alongside the review. JPEG, PNG, and WebP inputs up to 10 MB are resized to at most 1280 pixels on the longest edge and re-encoded as JPEG. HEIC must be converted first. Camera capture depends on the phone/browser and has not been verified on physical phones yet.
- Browser-local persistence and a confirmed clear-drafts action.

**This is a frontend foundation, not the finished AI application.** It does not fetch restaurant websites, recognize menu text, generate recommendations, or learn preferences. The planned class endpoints are DeepSeek for text/reasoning and Qwen for menu-photo understanding, but neither is connected yet. No connection credentials or real endpoint URLs are stored in the UI. Python and SQLite are proposed for a future backend; no database or authentication is implemented yet.

## Run locally

The dashboard has no runtime JavaScript dependencies. With Python 3 installed, run this from the repository root:

```sh
python -m http.server 8014 --bind 127.0.0.1
```

Open `http://127.0.0.1:8014` in a browser. Stop the server with Ctrl+C. This is a local development server, not a production deployment.

## Tests

Install Node.js 22+ and Google Chrome, then run:

```sh
npm ci
npm test
npm run test:ui
```

The browser tests use installed Chrome and start a local Python server if port 8014 is not already serving the dashboard. Coverage includes all eight views at 320/390/768/1440px, mobile-menu interaction, palette contrast checks, navigation, local persistence, draft clearing, safe text rendering, photo validation, menu-link validation, honest empty states, and unavailable/corrupt browser storage. This is not a full accessibility or physical-device audit.

## Where to edit

| File | Purpose |
| --- | --- |
| `index.html` | Dashboard sections, proposal text, forms, and credits |
| `styles.css` | Single Corner Diner token system, component styling and responsive layout |
| `assets/` | Local decorative SVG artwork and favicon; no external asset requests |
| `docs/ui-design.md` | Design tokens, typography, components, breakpoints, mobile-preview guidance and feature boundaries |
| `app.js` | Navigation and user interactions |
| `state.js` | Browser-local draft loading and saving |
| `tests/` | State and browser regression tests |

Make changes on personal/feature branches, run the tests, then open a pull request into `main`. Keep main stable and do not commit credentials, local drafts, or installed dependencies. Hermes and Codex are the proposed AI coding tools; GitHub is used for version control and collaboration.

See [the UI design guide](docs/ui-design.md) to recreate the theme, understand the shared components, or preview on a phone over a trusted private network. The default server remains bound to localhost. Physical-device camera and Safari behaviour have not been verified.

## Privacy and limitations

Profiles, cravings, feedback, and saved menu links belong only to the current browser and origin; they are not shared between teammates or devices. Use sample information for testing. Menu photos are previewed locally and are not retained after refreshing. The app sends no photos or profile details to an AI service. Opening a saved link visits the restaurant's website in a separate tab.

Meal-review photos (unlike menu previews) are kept with saved feedback in browser storage. They are not uploaded or committed to GitHub. Clearing local drafts or site data removes them. Storage is limited: if saving fails, the form and photo remain on screen so you can retry or remove the photo; no success message is shown. Unsaved forms are lost on refresh. This is not a durable photo backup or a shared gallery.

ForkCast cannot establish whether food is safe for someone with allergies or confirm ingredients, religious compliance, or cross-contact. Always verify these with restaurant staff.