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
npm run worker:check
```

## Reminder Behavior

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

## Closed-App Reminder Backend

This repo includes a Cloudflare Worker backend scaffold in
`workers/reminders`. It stores Push API subscriptions in D1, wakes up every five
minutes, checks each user's local reminder times, and sends Web Push requests
even when Momentum is closed. The first version sends an empty push request, so
the service worker shows the default Momentum notification text.

Cloudflare Workers and D1 both have free tiers that should be enough for a
personal tracker. Check the Cloudflare dashboard if usage grows, because free
limits reset daily and extra usage rules can change.

To connect it:

1. Generate Web Push keys.

   ```bash
   npm run vapid:generate
   ```

2. Create a D1 database in your Cloudflare account.

   ```bash
   npx wrangler d1 create momentum_reminders
   ```

3. Copy the returned `database_id` into
   `workers/reminders/wrangler.toml`, and replace
   `REPLACE_WITH_PUBLIC_VAPID_KEY` with the public key from step 1.

4. Store the private key as a Cloudflare secret.

   ```bash
   npx wrangler secret put VAPID_PRIVATE_JWK --config workers/reminders/wrangler.toml
   ```

   Paste the `VAPID_PRIVATE_JWK` JSON printed by `npm run vapid:generate`.

5. Apply the D1 migration.

   ```bash
   npx wrangler d1 migrations apply momentum_reminders --remote --config workers/reminders/wrangler.toml
   ```

6. Deploy the Worker.

   ```bash
   npm run worker:deploy
   ```

7. In the GitHub repo, add these repository variables under
   Settings -> Secrets and variables -> Actions -> Variables:

   ```bash
   VITE_PUSH_REMINDER_PUBLIC_KEY=<public key from npm run vapid:generate>
   VITE_PUSH_REMINDER_SUBSCRIBE_URL=https://<your-worker-subdomain>.workers.dev/subscribe
   VITE_PUSH_REMINDER_UNSUBSCRIBE_URL=https://<your-worker-subdomain>.workers.dev/unsubscribe
   ```

8. Re-run the GitHub Pages workflow or push a new commit. After that, Momentum
   can subscribe the browser to the Worker-backed closed-app reminders.

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
