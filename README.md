# ForkCast

**Your table, your taste.** An AI-powered restaurant menu assistant proposed for the MBAX 6418 group final project.

**Contributors:** Linh · Jamie · Jana · Kelly · Mirina

## Our proposal

Choosing what to order can be overwhelming, particularly when dishes and ingredients are unfamiliar. Dietary restrictions, allergies, religious dietary requirements, food preferences, budgets, and cravings can make the choice harder.

ForkCast aims to recommend dishes from a restaurant's available menu based on an individual's preferences. Our proposed features are a personalized taste profile, menu-photo recognition, mood-based recommendations, dish ratings and feedback to improve future recommendations, and a mobile-friendly interface. Professor Dobolyi also suggested accepting online menu links.

## Current dashboard

- Responsive overview with the proposal description, project brief, and team credits.
- Taste-profile form covering preferences, dietary needs, allergies, spice tolerance, and budget.
- Local menu-photo preview with file-type and size validation.
- Menu-link entry, validation, local saving, opening, and removal.
- Mood/craving selection and meal-feedback forms.
- Browser-local persistence and a confirmed clear-drafts action.

**This is a frontend foundation, not the finished AI application.** It does not fetch restaurant websites, recognize menu text, generate recommendations, or learn preferences. AI models and API endpoints have not been selected. Python and SQLite are proposed for a future backend; no database or authentication is implemented yet.

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

The browser tests use installed Chrome and start a local Python server if port 8014 is not already serving the dashboard. Coverage includes navigation, mobile layout, local persistence, draft clearing, safe text rendering, photo validation, menu-link validation, and unavailable/corrupt browser storage.

## Where to edit

| File | Purpose |
| --- | --- |
| `index.html` | Dashboard sections, proposal text, forms, and credits |
| `styles.css` | Main theme and responsive layout |
| `menu-links.css` | Menu-link control styling |
| `app.js` | Navigation and user interactions |
| `state.js` | Browser-local draft loading and saving |
| `tests/` | State and browser regression tests |

Make changes on personal/feature branches, run the tests, then open a pull request into `main`. Keep main stable and do not commit credentials, local drafts, or installed dependencies. Hermes and Codex are the proposed AI coding tools; GitHub is used for version control and collaboration.

## Privacy and limitations

Profiles, cravings, feedback, and saved menu links belong only to the current browser and origin; they are not shared between teammates or devices. Use sample information for testing. Menu photos are previewed locally and are not retained after refreshing. The app sends no photos or profile details to an AI service. Opening a saved link visits the restaurant's website in a separate tab.

ForkCast cannot establish whether food is safe for someone with allergies or confirm ingredients, religious compliance, or cross-contact. Always verify these with restaurant staff.