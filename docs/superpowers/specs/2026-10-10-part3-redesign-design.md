# Weight Tracker — Part 3: Redesign + Kilo the mascot

Date: 2026-10-10
Status: approved in chat (with visual companion), awaiting written-spec review
Builds on: Part 1 foundation, Part 2 features, and the 2026-10-10 tweaks (wt-v10).

## Goal

Give the app its own look and a mascot, Kilo the turtle, who greets the user and cheers their progress. Fix the flat chart line. Everything that exists keeps working, and stored entries are never touched.

## Decisions (from the user)

| Topic | Decision |
|---|---|
| Palette | **Garden**: warm cream background, white cards, moss green accents, terracotta for gains and the streak. No purple. |
| Font | **Instrument Sans** everywhere (Lagoon's font), bundled with the app. |
| Mascot | **Kilo**, an original turtle (inspired by Koopa Troopa, not a copy). **Face only, front view**: round green head, terracotta sweatband across the forehead, big white eyes with small pupils, simple smile, small **cream** shell collar under the chin with three plate lines. Flat sticker style with a white outline. |
| Moods | **Happy** (default), **Cheering** (eyes `^ ^`, open smile, holding the flame), **Resting** (eyes closed, small mouth, "z z"). |
| Streak flame | **Classic two-tone** teardrop: orange outside, yellow core. |
| Kilo's home | **Top card**, next to the streak badge and the date (option B). |
| Congrats pop-up | Kilo **centred**, cheering. |
| Home-screen icon | Happy Kilo **with the white sticker border** on moss green. |
| Chart | **Zoom to the user's weights**. Goal shown as an edge tag (`Goal 75 kg ↓ · 23.3 kg to go`) until it falls inside the range, then the dashed goal line. |

## Hard constraints

- `weight-entries`, `weight-seeded`, `weight-cleanup-1`, `weight-goal`, `weight-theme` and `weight-view` keep their keys and formats. Nothing is migrated or cleared.
- One screen, and the page never scrolls (check with 60 entries in Table and Chart views). Only the history scrolls.
- All existing behaviour stays as it is:
  - today-only logging, with the input and LOG disabled (never hidden) after logging, plus the "Logged today" note
  - edit and delete via a table row, with the old edit sheet (weight and Save row, wide Delete entry, wide Cancel)
  - 2 streak saves, the congrats pop-up that only closes via "Nice!", backup and restore, the goal, and the System/Light/Dark theme
  - dot-only decimals
- Works offline. Bump `sw.js` `CACHE` to `wt-v11` and add the font file to the cached `FILES`.
- No external requests at runtime (no Google Fonts link, no CDN).

## Visual system

### Colour tokens (`:root`)

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F6F1E7` | `#171611` |
| `--surface-1` (cards) | `#FFFFFF` | `#22201A` |
| `--surface-2` (inputs, segmented bg) | `#F1EBDD` | `#2B2820` |
| `--border` | `#E3DACA` | `#3A362C` |
| `--border-strong` | `#D2C7B2` | `#4A4538` |
| `--text` | `#2B2A24` | `#EDE6D6` |
| `--text-secondary` | `#6B675C` | `#B8B0A0` |
| `--text-muted` | `#9A9483` | `#8C8576` |
| `--text-danger` | `#B3261E` | `#F2B8B5` |
| `--accent` (LOG, buttons) | `#2F5D3A` | `#6FAE6A` |
| `--on-accent` | `#FFFFFF` | `#10200F` |
| `--loss` (green: lost, today line) | `#3E7A4A` | `#8FD08A` |
| `--gain` (terracotta: gained) | `#C2622D` | `#F0A57A` |
| `--streak-bg` | `#FBF3E8` | `#3A2A1E` |
| `--quote` | `#2F5D3A` | `#A9D7A0` |
| `--row-alt` | `#FBF8F1` | `#26231C` |

The theme mechanism is unchanged (`data-theme` = system/light/dark, set before first paint). `theme-color` follows `--bg`.

### Type

- `Instrument Sans`, weights 400/500/600/700, from a bundled `fonts/InstrumentSans.woff2` (variable font, latin subset). `@font-face` uses `font-display: swap`. Fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.
- Font sizes stay as now. Inputs stay ≥ 16px.

### Kilo: artwork (inline SVG, defined once in `index.html`)

ViewBox `0 0 150 140` (Resting is drawn with room for the "z z"). Stroke `#24452C`, width 3.5, round caps and joins. The white sticker outline is an SVG filter, so it works on any background:

```html
<filter id="kilo-sticker" x="-20%" y="-20%" width="140%" height="140%">
  <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="d"/>
  <feFlood flood-color="#ffffff"/><feComposite in2="d" operator="in" result="o"/>
  <feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<clipPath id="kilo-head-clip"><ellipse cx="75" cy="72" rx="56" ry="50"/></clipPath>
<clipPath id="kilo-collar-clip"><ellipse cx="75" cy="123" rx="32" ry="10"/></clipPath>

<!-- cream shell collar under the chin, three plate lines -->
<g id="kilo-collar">
  <ellipse cx="75" cy="123" rx="32" ry="10" fill="#F3E3B5"/>
  <g clip-path="url(#kilo-collar-clip)" stroke-width="2.4"><path d="M57 110 V136 M75 110 V136 M93 110 V136" fill="none"/></g>
  <ellipse cx="75" cy="123" rx="32" ry="10" fill="none"/>
</g>
<!-- round head + sweatband clipped to the head -->
<g id="kilo-head">
  <ellipse cx="75" cy="72" rx="56" ry="50" fill="#A8D88F" stroke="none"/>
  <g clip-path="url(#kilo-head-clip)">
    <path d="M10 50 Q75 22 140 50" fill="none" stroke="#24452C" stroke-width="17"/>
    <path d="M10 50 Q75 22 140 50" fill="none" stroke="#D8643A" stroke-width="11"/>
  </g>
  <ellipse cx="75" cy="72" rx="56" ry="50" fill="none"/>
</g>
<!-- Happy mood's open eyes (Cheering and Resting draw their own eye shapes) -->
<g id="kilo-eyes" stroke-width="2.8">
  <ellipse cx="56" cy="76" rx="13" ry="16" fill="#fff"/><circle cx="58" cy="80" r="4" fill="#1D1D1B" stroke="none"/><circle cx="59.5" cy="78" r="1.4" fill="#fff" stroke="none"/>
  <ellipse cx="94" cy="76" rx="13" ry="16" fill="#fff"/><circle cx="96" cy="80" r="4" fill="#1D1D1B" stroke="none"/><circle cx="97.5" cy="78" r="1.4" fill="#fff" stroke="none"/>
</g>
<!-- two-tone flame, viewBox 0 0 60 68 -->
<g id="flame" stroke="#24452C" stroke-width="3" stroke-linejoin="round">
  <path d="M30 4 C40 18 50 28 50 44 C50 57 41 64 30 64 C19 64 10 57 10 44 C10 34 16 28 20 20 C22 28 25 30 28 28 C26 20 26 12 30 4 Z" fill="#F08A3C"/>
  <path d="M30 32 C35 40 40 44 40 51 C40 57 35 60 30 60 C25 60 20 57 20 51 C20 46 24 43 26 39 C27 43 29 43 30 41 C29 38 29 35 30 32 Z" fill="#FFD166" stroke-width="2.4"/>
</g>
```

Moods (each is `collar + head` plus face parts):
- **Happy:** `kilo-eyes` + smile `M62 102 Q75 113 88 102`.
- **Cheering:** eyes `M44 80 Q56 68 68 80 M82 80 Q94 68 106 80`, open mouth `M58 98 Q75 120 92 98 Z` fill `#B5523A`, flame at `translate(122 2) scale(.55)`. The flame sits inside the 150 viewBox so the head stays centred.
- **Resting:** eyes `M44 78 Q56 88 68 78 M82 78 Q94 88 106 78`, mouth `M68 104 Q75 108 82 104`, and "z z" text (`z` 22px at 118,22 and `z` 15px at 134,8, fill `--accent`, the second at 0.7 opacity).

Kilo always uses `filter="url(#kilo-sticker)"` plus a light `drop-shadow(0 2px 2px rgb(0 0 0 / .12))`. Same art in dark mode (the sticker edge keeps him readable).

### Home-screen icon

`icon.png`, 180×180: moss green `#2F5D3A` square, Happy Kilo centred at about 140px wide **with the white sticker outline**. It's rendered from the SVG by a browser screenshot of a 180×180 page (no Python available). iOS rounds the corners.

## Screen (top to bottom, one screen)

```
                                   ⚙   (fixed, top-right, unchanged)
┌───────────────────────────────────┐
│ [Kilo 64px]  (🔥 5-day streak ·   │  Kilo card
│              1 save left)         │
│              Today · Oct. 10, '26 │  (green, --loss)
├───────────────────────────────────┤
│ [ 0.0              kg ] [ LOG ]   │  Log card (disabled + "✅ Logged today"
│ ✅ Logged today: 98.3 kg          │   note after logging, as now)
├───────────────────────────────────┤
│ [ Table | Chart ]                 │
│ history (only this scrolls)       │
├───────────────────────────────────┤
│ Latest / change / quote           │  Summary
└───────────────────────────────────┘
```

- **Kilo card:** a white card holding Kilo on the left (64px) and, on the right, the streak badge (pill, `--streak-bg`, flame icon 14px, terracotta bold text; hidden when the streak is 0) above the green `Today · <date>` line. The existing ids `wt-streak` and `wt-today` move into this card.
- **Log card:** the same form, input and LOG (72px wide, 52px tall). `wt-error` and `wt-done` stay below.
- **Streak badge text:** unchanged (`5-day streak`, `· 1 save left` once a save is used). The 🔥 emoji is replaced by the flame SVG.
- Cards: radius 16px, 1px `--border`, `--surface-1`. Table: white with soft row dividers (`--row-alt` stripes), sticky header. Segmented control and sheets restyled with the new tokens.

### Kilo's mood on the main screen

`kiloMood(info, loggedToday, cheeredToday)`, a pure function in `logic.js`:
- `'cheering'` if the user logged successfully today (`cheeredToday`, set when the congrats pop-up is shown, stored in memory for the session; on reload the mood falls back to the rules below).
- `'resting'` if `!loggedToday && info.days > 0 && info.saves < STREAK_SAVES` (a save is in use and today isn't logged yet).
- `'happy'` otherwise.

`cheeredToday` is in memory only, so no new storage key is needed. Re-render on `visibilitychange` as now.

### Congrats pop-up

Same behaviour, restyled: white card, **Cheering Kilo centred** (about 150px wide), the message (700, 17px), the streak badge with the flame (shown when the streak is ≥ 2, unless the message is the milestone), and a full-width moss "Nice!" button. Only "Nice!" (or Enter/Escape) closes it.

## Chart: zoom to weights (fixes the flat line)

New pure function `chartRange(weights, goal)` → `{ min, max, goalInRange, goalDir }`:
- `min = minWeight − 0.5`, `max = maxWeight + 0.5`.
- If `goal` lies within `[min − 1, max + 1]` then `goalInRange = true` and the range expands to include it (`min = min(min, goal − 0.5)`, `max = max(max, goal + 0.5)`).
- Otherwise `goalInRange = false` and `goalDir = goal < min ? 'down' : 'up'`.

`chartPoints(sorted, goal, w, h, pad)` uses `chartRange`. `goalY` is `null` when the goal is out of range.

Drawing:
- In range: the dashed goal line with the `Goal 75 kg` label (as now).
- Out of range: a small tag at the bottom-right (`down`) or top-right (`up`) edge: `Goal 75 kg ↓ · 23.3 kg to go` (↑ when the goal is above). The "to go" amount is `|latest − goal|` to 1 decimal.
- The y labels show the **real** highest and lowest logged weights (fixes the deferred "padded labels" minor), not the padded range.
- The line uses `--accent`, dots `--accent`, the goal line and tag `--loss`.

## Logic (pure, tested in `test.html`)

- `chartRange(weights, goal)` (above).
- `chartPoints` updated to use it. Existing chart tests are updated to the new range rules.
- `kiloMood(info, loggedToday, cheeredToday)` (above).

## Error handling

Unchanged. If the font file fails to load, the system font is used (no error). If an SVG filter is unsupported, Kilo renders without the white edge.

## Testing

1. **Logic** (`test.html` + CLI runner):
   - `chartRange` cases: goal far below, goal within 1 kg, goal above, single weight
   - updated `chartPoints` tests
   - `kiloMood` cases: happy, resting with a save used, cheering after a log, a save used but today logged → happy
2. **Browser at 390×844, light and dark:**
   - the Kilo card renders with Happy Kilo, and Resting appears when a save is used and today is unlogged
   - log → the pop-up shows centred Cheering Kilo and the flame badge; after "Nice!" the main Kilo is Cheering
   - the chart with the goal far below shows the tag and a non-flat line; with the goal near, the dashed line
   - 60 entries: the page doesn't scroll in either view
   - the font is applied (`document.fonts.check('16px "Instrument Sans"')`) and works offline from the cache
   - screenshots read and checked
3. **iPhone (user), required by the design rules:** Kilo and the flame show correctly on the real device (WebKit), in light and dark, plus the home-screen icon with the sticker border.

## Out of scope

- Animations beyond what exists.
- Changing any feature behaviour.
- The deferred Part-2 minors other than the chart's padded labels.
