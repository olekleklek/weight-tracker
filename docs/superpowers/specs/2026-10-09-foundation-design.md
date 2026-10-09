# Weight Tracker — Part 1: Foundation (installable iPhone app)

Date: 2026-10-09
Status: approved in chat, awaiting written-spec review

## Goal

Turn the existing single-file tracker into one clean web app that installs on the user's iPhone home screen and works fully offline. Data lives only on the phone.

This is part 1 of 3. Out of scope here (later parts):
- Part 2 — features: chart, editable goal, edit/delete entries, export/import backup.
- Part 3 — visual redesign.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Data location | Phone only. No sync with the PC. |
| Phone | iPhone (Safari, "Add to Home Screen"). |
| Delivery | Small installable web app (PWA): plain files, no framework, no build step. |
| Hosting | GitHub Pages under `github.com/olekleklek`. Code is public; weight data never leaves the phone. |
| Starting data | Fresh start. On first launch the app seeds one entry: `2026-10-09`, `98.8` kg. |

## Files

```
index.html      merged app, based on weight-tracker_4.html
manifest.json   name "Weight Tracker", display "standalone", icon, theme colour
logic.js        pure functions (no DOM), shared by index.html and test.html
sw.js           service worker: caches the app files for offline use
icon.png        180×180 home-screen icon
test.html       browser-run self-check of the pure logic (not linked from the app)
old/            weight-tracker.html … weight-tracker_4.html, kept for reference
```

Everything in the repo root is published by GitHub Pages; `old/` and `test.html` are harmless if served.

## index.html — changes from weight-tracker_4.html

1. **Define the theme variables.** `_4` uses `--surface-1`, `--surface-2`, `--border`, `--border-strong`, `--text-secondary`, `--text-muted`, `--text-danger`, which only existed inside the Claude chat page. Define them in `:root` with light values, plus a `prefers-color-scheme: dark` override. Hard-coded light colours in the table rows (`#FFFFFF`, `#EEEDFE`) switch to variables so dark mode is readable.
2. **Storage: localStorage only.** Remove the `window.storage` branch and its 4-second timeout. Key and format stay the same: `weight-entries` → `{ "entries": [{ "date": "YYYY-MM-DD", "weight": 98.8 }], "unit": "kg" }`.
3. **One-time seed.** On load, if there are no entries and `weight-seeded` is not set: add `{ date: "2026-10-09", weight: 98.8 }`, save, then set `weight-seeded = "1"`. Once set, the seed never runs again, so deleting all entries later stays empty.
4. **iPhone fit.**
   - Viewport meta with `viewport-fit=cover`; body padding uses `env(safe-area-inset-*)` for the notch and home bar.
   - Input `font-size` at least 16px so Safari does not zoom on tap.
   - Apple meta tags: `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`, `apple-touch-icon`.
   - Page is a full document (`<!doctype html>`, `<head>`, `<body>`); `_4` was a fragment.
5. **Storage failure is visible.** If `localStorage` throws on save, show a persistent message ("Not saved — storage unavailable") instead of failing silently.
6. **Register the service worker** (`navigator.serviceWorker.register('sw.js')`), guarded so it does nothing where unsupported.
7. **Unchanged behaviour:** date picker (max today), weight input with Enter to log, same-date entry replaces the old one, date auto-advances after logging, change column, sortable date header, latest + delta summary, motivational quotes, 75 kg goal message.

## Logic kept testable

Pure functions (no DOM) live in `logic.js`, loaded by both `index.html` and `test.html`:
- `sortEntries(entries)`: chronological order.
- `changeMap(sorted)`: date → change vs previous entry, 1 decimal, first entry is `null`.
- `upsert(entries, date, weight)`: replace same date or append.
- `seedIfNeeded(entries, seededFlag)`: returns `{ entries, seeded }`.

## sw.js

- `CACHE = 'wt-v1'`, caching `./`, `index.html`, `logic.js`, `manifest.json`, `icon.png`.
- install: pre-cache. activate: delete caches whose name ≠ `CACHE`. fetch: cache-first, falling back to network.
- **Updating the app = bump `CACHE`** (`wt-v2`, …). The phone picks up the new version on the next launch with signal. User data is in localStorage, not the cache, so updates never touch it.
- If registration fails, the app still runs online.

## Hosting

1. `git init` in the project folder (done with this spec).
2. Create public repo `olekleklek/weight-tracker` on GitHub (user does this in the browser; no `gh` CLI installed).
3. `git remote add origin … && git push -u origin main`.
4. Repo Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
5. App URL: `https://olekleklek.github.io/weight-tracker/`.
6. On iPhone: open the URL in Safari → Share → Add to Home Screen.

## Error handling

| Case | Behaviour |
|---|---|
| Invalid / empty / ≤ 0 weight | Inline "Enter a valid weight first" (existing). |
| localStorage throws on save | Persistent warning; entry stays on screen. |
| localStorage throws on load | Start empty and show the same warning. |
| Corrupt JSON in storage | Treat as empty, do not overwrite until the next successful save. |
| Service worker unsupported/fails | App works online only. |

## Testing

1. **`test.html`**: open in a browser; `console.assert` checks for `sortEntries`, `changeMap`, `upsert`, `seedIfNeeded` (seeds once, never re-seeds after delete-all). The page prints "ALL PASS" or the failures.
2. **Desktop, phone-sized**: Playwright at 390×844: page loads, seed row shows 98.8 on 2026-10-09, logging a new weight updates the table and summary, a reload keeps the data, and offline (served over localhost) loads from cache.
3. **On the iPhone** (user): Add to Home Screen → opens full screen → airplane mode → app opens and logs an entry → reopen, entry is still there.

## Success criteria

- App installed on the iPhone home screen, opens full screen, works in airplane mode.
- First launch shows exactly one entry: 2026-10-09, 98.8 kg.
- Entries persist across app restarts.
- Readable in light and dark mode; no zoom-on-tap.
