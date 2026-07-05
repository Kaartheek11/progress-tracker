# Momentum Progress Tracker

Momentum is a local-first React and TypeScript progress tracker for planning tomorrow's goals, tracking today's work, protecting streaks, earning badges, and reviewing progress.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. App data is persisted in browser storage under `momentum.state.v1`, so refreshes keep goals, streaks, settings, reviews, badges, and freeze history.

## Quality checks

```bash
npm run test
npm run build
```

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow at `.github/workflows/deploy.yml`.
After the project is pushed to GitHub, every push to `main` will:

1. Install dependencies with `npm ci`.
2. Run the test suite.
3. Build the Vite app.
4. Publish `dist` to GitHub Pages.

The Vite base path is detected from `GITHUB_REPOSITORY`, so the app works from a
standard repo URL such as `https://<user>.github.io/<repo>/`.

## Notes

- Streaks only count goals planned on time before the planning deadline for the goal's planned date.
- Late goals remain trackable and contribute to general completion totals, but not streak eligibility.
- Browser notifications are optional. If permission is denied, Momentum falls back to in-app reminders while the app is open.
- The current implementation is local-first. Server scheduling, accounts, and cross-device sync can be added behind the storage service without moving streak or badge logic into an external agent.
