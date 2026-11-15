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

## How the data works

- Every change saves on the device first, then uploads to Supabase. With no signal, changes wait in a queue and upload when you're back online.
- Other devices pick up changes live while open, and whenever the app is reopened or brought to the front.
- Data is stored in a few chunks (core plan, workouts, runs, weights, food log, check-ins, activities). If two devices change the **same** chunk while one is offline, the last one to upload wins. Day to day this won't matter, but avoid logging on two devices at once with one of them offline.
- The first time you sign in on a device, anything already saved on that device is uploaded if your account is still empty.
- Backups: Settings > Download backup gives you a JSON file. Settings > Restore from a backup file puts one back.

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

## Making changes

1. Edit the files (most fixes are in `js/app.js`).
2. Test locally: run `python3 -m http.server 8000` in this folder and open <http://localhost:8000>.
3. Commit and push to `main`. GitHub Pages redeploys in about a minute.
4. On your phone, close and reopen the app once to pick up the new version. If you added or renamed a file, add it to the list in `sw.js` and bump `VERSION` there.
