# Weight Tracker — Part 2: Features

Date: 2026-10-10
Status: approved in chat, awaiting written-spec review
Builds on: `2026-10-09-foundation-design.md` and the 2026-10-10 tweaks (today-only logging, "Oct. 10, '26" dates, one-screen layout: card → table → summary).

## Goal

Keep the user's entries safe beyond the phone and add a chart, an editable goal, entry edit/delete, and a light/dark toggle — all on the existing one-screen layout with no page scroll.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Backup | File via the iPhone Share sheet; Restore picks a file. |
| Restore | Replaces everything after a confirmation. |
| Chart | `Table \| Chart` toggle in the middle box; chart fills it; dashed goal line. |
| Settings | ⚙ button, top-right on the "Today" line, opens a bottom sheet. |
| Edit/delete | Tap a table row → bottom sheet: date read-only, weight editable, Save, Delete (confirm). |
| Theme | System · Light · Dark segmented control in the ⚙ sheet; default System. |
| Build approach | Extend current structure: pure logic in `logic.js` (tested in `test.html`), UI in `index.html`, chart as inline SVG. No libraries, no new files. |

## Hard constraints

- **Never lose entries.** `weight-entries` key and format (`{ entries: [{date, weight}], unit }`) unchanged; no migration needed.
- One screen, page never scrolls (check with 60 entries); only the table scrolls inside its box.
- Today-only logging stays. Edit changes weight only, never the date.
- Works offline; bump `sw.js` `CACHE` to `wt-v6`. No service worker on localhost (unchanged).
- Dates displayed with `fmtDate` ("Oct. 10, '26"); stored as `YYYY-MM-DD`.

## Screen

```
┌───────────────────────────────┐
│ Today · Oct. 10, '26       ⚙ │
│ [ 0.0           kg ] [ LOG ] │
├───────────────────────────────┤
│   [ Table | Chart ]           │
│ Date ↓    Weight   Change     │
│ Oct. 10, '26  98.4  -0.4      │  tap row → edit sheet
│ …            (scrolls inside) │
├───────────────────────────────┤
│ Latest: … / delta / quote     │
└───────────────────────────────┘
```

- **Toggle** `Table | Chart` at the top of the middle box; the last choice is remembered (`weight-view`). Hidden when there are no entries.
- **Rows** are tappable (cursor pointer, `role="button"`, keyboard Enter/Space) and open the edit sheet.

### Chart (inline SVG)

- Fills the middle box; resizes with it (redraw on `resize` and when shown).
- Weight line through entries in date order, one dot per entry. The x axis is proportional to dates (gaps show as gaps).
- Dashed horizontal goal line labelled `Goal <goal> kg`.
- Y range: min/max of all weights and the goal, padded by 0.5 kg each side.
- X labels: first and last date (`fmtDate`); Y labels: top and bottom value (1 decimal).
- One entry: single dot plus text "Log another day to see your trend."
- Colours come from CSS variables, so the chart follows the theme.

### ⚙ settings sheet

Bottom sheet over a dimmed backdrop; closes via **Done**, tapping the backdrop, or Escape. Contents:
1. **Goal weight** — text input (`inputmode="decimal"`) with "kg", **Save** button; error shown inline.
2. **Appearance** — segmented `System · Light · Dark`; applies immediately.
3. **Backup** — button; shares `weight-backup-YYYY-MM-DD.json`.
4. **Restore** — button → file picker (`.json`) → confirm → replace.

### Edit sheet

Same sheet style. Shows the entry date (read-only text), weight input prefilled, **Save**, and **Delete** (red). Delete asks `Delete Oct. 9, '26 · 98.8 kg?` via `confirm()`. Save validates like logging.

## Data

| Key | Value | Default |
|---|---|---|
| `weight-entries` | unchanged | — |
| `weight-goal` | number as string, e.g. `"75"` | 75 |
| `weight-theme` | `system` \| `light` \| `dark` | `system` |
| `weight-view` | `table` \| `chart` | `table` |

Goal replaces every hard-coded 75: summary "to go" text, the "hit your goal" text, and quotes (quotes say `${goal}` instead of "75").

### Backup file

```json
{ "app": "weight-tracker", "version": 1, "exported": "2026-10-10",
  "goal": 75, "entries": [{ "date": "2026-10-09", "weight": 98.8 }] }
```

- Share: `navigator.share({ files: [File] })` when `navigator.canShare({ files })` is true; otherwise download via a temporary `<a download>`. A cancelled share (`AbortError`) does nothing.
- Restore accepts a file whose JSON has `app === "weight-tracker"` and an `entries` array. Valid entries are kept via the existing entry rules; invalid ones are counted as skipped. `goal` is restored if valid, otherwise the current goal stays.

## Logic (pure, in `logic.js`, each tested in `test.html`)

- `parseGoal(text) → number|null` — same number rules as `parseWeight` (comma ok, 0 < g < 1000, 0.1 rounding).
- `makeBackup(entries, goal, today) → string` — JSON as above, entries sorted by date.
- `readBackup(text) → { entries, goal, skipped } | { error }` — errors: `"That isn't a Weight Tracker backup"` (not JSON / wrong `app` / no `entries` array), `"Backup has no entries"` (zero valid entries). `goal` is `null` if missing/invalid.
- `removeEntry(entries, date) → entries[]`.
- Edit uses existing `upsert(entries, date, weight)`.
- `chartPoints(sorted, goal, width, height, pad) → { points: [{x, y, date, weight}], goalY, min, max }` — pure geometry; one entry centres its x.

## Error handling

| Case | Behaviour |
|---|---|
| Not a backup / broken JSON | Inline message in the sheet; nothing changes. |
| Some bad entries in backup | Skipped; confirm text says `40 entries (2 skipped)`. |
| Backup with zero valid entries | "Backup has no entries"; nothing changes. |
| Restore confirm cancelled | Nothing changes. |
| Invalid goal | Inline "Enter a goal between 1 and 999 kg"; goal unchanged. |
| Invalid edited weight | Inline "Enter a valid weight first"; entry unchanged. |
| Share cancelled | Nothing happens. |
| Storage write fails | Existing red "Not saved" warning. |

## Theme

`<html data-theme>` set from `weight-theme` before first paint (small inline script in `<head>`, so there's no flash). CSS: light variables on `:root`; dark variables applied when `data-theme="dark"`, or when `data-theme="system"` and `prefers-color-scheme: dark`. `color-scheme` and `<meta name="theme-color">` follow the active theme.

## Testing

1. **`test.html`** (+ CLI runner): `parseGoal`, `makeBackup`→`readBackup` round trip, `readBackup` errors and skip counts, `removeEntry`, `chartPoints` (2 entries, 1 entry, goal outside the weight range).
2. **Browser at 390×844** (Playwright): sheets open/close (Done, backdrop, Escape); edit and delete update the table and summary; goal change updates the summary and chart line; theme System/Light/Dark switches and persists after reload; Backup then Restore round-trips the same entries (download path on desktop); 60 entries → page does not scroll in both Table and Chart views; screenshots in light and dark.
3. **iPhone (user)**: Backup → Save to Files; delete an entry; Restore from the file → entry back.

## Success criteria

- The user can back up to Files/iCloud and restore on the phone.
- The chart shows their trend and goal line; the goal is editable.
- Any entry's weight can be fixed or the entry deleted, with confirmation.
- Light/Dark/System works and is remembered.
- Existing entries survive the update untouched; the page still never scrolls.
