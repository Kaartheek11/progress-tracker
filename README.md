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

## Reminder behavior

Momentum has two reminder modes:

- **Open-app reminders:** built in. While Momentum is open, it checks the user's
  local reminder times every 30 seconds and shows either a browser notification
  or an in-app toast.
- **Closed-app reminders:** push-ready. The app now registers a service worker
  and can subscribe to Web Push, but true closed-browser reminders require a
  backend scheduler. A static GitHub Pages site cannot wake a closed browser by
  itself.

To connect closed-app reminders, provide these build-time environment variables:

```bash
VITE_PUSH_REMINDER_PUBLIC_KEY=<vapid-public-key>
VITE_PUSH_REMINDER_SUBSCRIBE_URL=<https endpoint that stores subscriptions>
VITE_PUSH_REMINDER_UNSUBSCRIBE_URL=<optional https endpoint>
```

The subscribe endpoint receives:

```json
{
  "subscription": { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } },
  "profile": {
    "userId": "local-user",
    "timezone": "America/Denver",
    "reminders": { "planning": true, "progress": true, "review": true },
    "planningReminderTime": "20:30",
    "progressReminderTime": "09:00",
    "endOfDayReminderTime": "20:45"
  },
  "snapshot": { "today": "2026-07-05", "todayGoalsCount": 3 },
  "appUrl": "https://kaartheek11.github.io/progress-tracker/"
}
```

That backend should store subscriptions, run a timezone-aware schedule, and send
Web Push payloads to the browser push endpoint. The service worker displays the
notification and opens Momentum when the user clicks it.

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
