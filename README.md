# Sub-20 Training Planner

A gym, running and food planner that installs on your phone like an app (a PWA), works offline at the gym, and syncs between devices through Supabase.

## What's where

| File | What it does |
| --- | --- |
| `index.html` | The page shell. Loads everything below. |
| `css/app.css` | All the planner's styling. |
| `css/sync.css` | Styling for the sign-in screen. |
| `js/app.js` | The planner itself: plan, log, food, progress, settings. Most fixes happen here. |
| `js/sync.js` | Sign-in, syncing between devices, offline queue, photo storage. |
| `js/config.js` | Your Supabase URL and key. |
| `js/vendor/supabase.js` | The Supabase library (v2.119.0), kept in the repo so the app works offline. |
| `sw.js` | Service worker: keeps a copy of the app on the device for offline use. |
| `manifest.webmanifest`, `icons/` | Name and icon used when you add it to your home screen. |
| `supabase/schema.sql` | Database setup. Run once in Supabase. |
| `supabase/strava.sql` | Extra database setup for Strava. Run once in Supabase. |
| `supabase/functions/strava/index.ts` | The small server piece that copies Strava runs in. Lives in Supabase, not on GitHub Pages. |

## How the data works

- Every change saves on the device first, then uploads to Supabase. With no signal, changes wait in a queue and upload when you're back online.
- Other devices pick up changes live while open, and whenever the app is reopened or brought to the front.
- Data is stored in a few chunks (core plan, workouts, runs, weights, food log, check-ins, activities), and each chunk on the server has a version number. A device can only upload a chunk if it has seen the latest version. If another device changed it first, the two sets of changes are merged (both are kept; if both changed the very same value, the later upload wins) and the upload is retried. Anything older than what a device already has is ignored, so a slow reply can't undo a newer change.
- An open copy of the app checks every minute whether a new version has been deployed and reloads itself when you're not in the middle of typing.
- `DATA_V` near the top of the saving code in `js/app.js` is the data version. **Bump it whenever a change alters how saved data is shaped or automatically rewritten** (anything run from `render()`). A copy of the app older than the data it receives stops saving and reloads, so it can't undo the newer copy's work.
- The first time you sign in on a device, anything already saved on that device is uploaded if your account is still empty.
- Backups: Settings > Download backup gives you a JSON file. Settings > Restore from a backup file puts one back.

## How the plan works

- **Run paces follow your fitness, not the goal.** They come from a current 5K estimate (22:30 to start; change it in Settings). A time trial or race replaces the estimate, and any other run of 3 km or more that shows you're faster moves it down. Intervals are at about 5K pace, tempo about 25 s/km slower, easy and long runs 80–110 s/km slower. There's a time trial in week 4 to check the estimate, and another in week 12.
- **Three runs a week:** a hard run (intervals, tempo or time trial), an easy run and a long easy run, plus the four gym sessions.
- **The week sorts itself.** Four gym sessions, Upper A, Lower A, Upper B and Lower B, train every muscle twice a week. The two upper (or two lower) sessions aren't put on back-to-back days when there's room, including across the weekend into the next week. Both lower sessions are kept away from the day before a hard or long run. Block a day on the Training page and the rest of the week, and the next week, re-sort around it.

## The calendar

The top of the Progress page is a month calendar. Each day shows three small letters: **G** for gym, **R** for run and **F** for food. A solid letter means done (or food on target), a dashed, crossed-out one means it was planned and missed, and an outlined one means it's still to come. Days where everything planned got done are shaded green, and a small dot marks a weigh-in. Tap a day to see what was planned and what you actually did. Underneath are the month's totals.

- Gym and runs come from the Log (and Strava). A session ticked off on the Training page without a log counts on the day it was planned.
- Food is on target when the day's calories are within 200 kcal of the target and protein is no more than 10 g under its target. Past meals you didn't tick count as eaten, like on the Food tab, so those days show a faded F.

## One-time setup

### 1. Supabase (database and login)

1. Create a free account at [supabase.com](https://supabase.com) and a new project (any name, pick the London region, save the database password somewhere).
2. Open **SQL Editor > New query**, paste all of `supabase/schema.sql`, and press **Run**.
3. Open **Authentication > Sign In / Providers > Email** and turn **off** "Confirm email" (optional, but saves a step).
4. Open **Project Settings > API** and copy the **Project URL** and the **anon** (or **publishable**) key into `js/config.js`.
5. After you've created your own account in the app, you can turn off **Allow new users to sign up** in Authentication settings so nobody else can make an account.

### 2. GitHub Pages (hosting)

1. Push this folder to a GitHub repository.
2. In the repository, open **Settings > Pages**, set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
3. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.
4. In Supabase, open **Authentication > URL Configuration** and set **Site URL** to that address (password reset emails link back to it).

### 3. Install on each device

- **iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the menu, then **Install app** or **Add to Home screen**.
- **Laptop (Chrome or Edge):** open the link and click the install icon in the address bar, or just bookmark it.

Then sign in with the same email and password on each one.

### 4. Strava (optional: runs added automatically)

Runs you record on Strava (or on your Garmin, synced to Strava) are added to the log on their own. Only runs are copied: rides, gym and other activities are left out. The app guesses the run type from the name and your plan for that day; change it in Log > History if it's wrong. A run you delete in the app isn't added again.

1. **Strava subscription.** Strava only lets subscribers create an API app, so subscribe first (in the Strava app: You > Settings > Subscription).
2. **Create the API app.** On a computer, go to <https://www.strava.com/settings/api> and fill in: Application Name `Sub-20 Planner`, Category `Training`, Website `https://willkell7.github.io/gym-planner/`, Authorization Callback Domain `willkell7.github.io`. Save, then note the **Client ID** and **Client Secret**. Keep the secret private: it never goes in this repo.
3. **Database.** In Supabase, open **SQL Editor > New query**, paste all of `supabase/strava.sql`, and press **Run**.
4. **Server piece.** In Supabase, open **Edge Functions > Deploy a new function > Via Editor**. Name it exactly `strava`, replace the example code with all of `supabase/functions/strava/index.ts`, and press **Deploy function**. Then open the function's **Details** (or Settings) and turn **off** the JWT verification switch, and save. (Strava calls this function without a Supabase login; the code checks your login itself.)
5. **Secrets.** In **Edge Functions > Secrets**, add `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` with the values from step 2.
6. **Client ID in the app.** Put the Client ID (not the secret) in `stravaClientId` in `js/config.js`, and push.
7. **Connect.** Open the app, go to **Settings > Strava > Connect Strava**, and press **Authorize** on Strava's page. Runs since 15 Nov 2026 are copied straight away, and new ones arrive shortly after you finish.

If you change the function later, paste the new code into the same function in Supabase and deploy again.

## Making changes

1. Edit the files (most fixes are in `js/app.js`).
2. Test locally: run `python3 -m http.server 8000` in this folder and open <http://localhost:8000>.
3. Commit and push to `main`. GitHub Pages redeploys in about a minute.
4. On your phone, close and reopen the app once to pick up the new version. If you added or renamed a file, add it to the list in `sw.js` and bump `VERSION` there.
