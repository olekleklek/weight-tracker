# Weight Tracker Part 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backup/restore, a chart with a goal line, an editable goal, entry edit/delete and a System/Light/Dark theme to the one-screen tracker without touching stored entries.

**Architecture:** Same structure as today. New pure functions go in `logic.js` with tests in `test.html`. UI goes in `index.html`: two bottom sheets (settings, edit) sharing one backdrop, a `Table | Chart` switch in the middle box, and the chart drawn as inline SVG coloured by CSS variables. No libraries, no new files.

**Tech Stack:** HTML, CSS, vanilla JS, inline SVG, Web Share API (files), localStorage, service worker.

**Spec:** `docs/superpowers/specs/2026-10-10-part2-features-design.md`

## Global Constraints

- `weight-entries` key and format `{ entries: [{date, weight}], unit }` are unchanged. Never clear storage.
- New keys: `weight-goal` (default 75), `weight-theme` (`system`|`light`|`dark`, default `system`), `weight-view` (`table`|`chart`, default `table`).
- One screen, and the page never scrolls (check with 60 entries in both views). Only the table scrolls, inside its box.
- Today-only logging stays. Edit changes the weight only, never the date.
- Dates are shown via `fmtDate` ("Oct. 10, '26") and stored as `YYYY-MM-DD`.
- `sw.js` `CACHE` becomes `wt-v6`. No service worker on localhost (existing guard).
- Backup file: `{ "app": "weight-tracker", "version": 1, "exported": "YYYY-MM-DD", "goal": <number>, "entries": [...] }`, named `weight-backup-YYYY-MM-DD.json`.
- Error copy, exactly:
  - "That isn't a Weight Tracker backup"
  - "Backup has no entries"
  - "Enter a goal between 1 and 999 kg"
  - "Enter a valid weight first"
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A backup containing the same date twice** (hand-edited file or an older bug): the restore should keep one entry per date (the last one wins), and the duplicate counts as skipped. Covered by a test in Task 1.
2. **A goal typed with a comma** (`72,5`): it should be accepted as 72.5, like weights are. Covered by a test in Task 1.
3. **Deleting the last remaining entry:** the app should show the empty state and NOT re-seed 98.8. Covered by a check in Task 3.
4. **Theme set to Dark, then the app is reopened:** it should open dark straight away, with no light flash. Covered by a check in Task 2.
5. **Restoring a JSON file from another app:** the app should show the error and leave entries untouched. Covered by a test in Task 1 and a check in Task 4.

## Test commands

- Logic: `node "C:/Users/sevil/AppData/Local/Temp/claude/D--Olek-IT-vibe-coder-Weight-Tracker/3b10d1cd-e312-415d-9cb7-b19c6e279f56/scratchpad/run-tests.js"` from the project root. It runs `test.html`'s script against `logic.js` and prints `ALL PASS`. If the file is missing, recreate it as below:

```js
// CLI twin of test.html: runs logic.js + test.html's inline test script in a vm. Run from project root.
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('test.html', 'utf8');
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const out = { textContent: 'running…' };
const ctx = vm.createContext({ document: { getElementById: () => out } });
try { vm.runInContext(fs.readFileSync('logic.js', 'utf8'), ctx); vm.runInContext(js, ctx); }
catch (e) { out.textContent = 'ERROR ' + e.message; }
console.log(out.textContent);
process.exit(out.textContent === 'ALL PASS' ? 0 : 1);
```

- Browser: run the dev server in the background from the project root, then use the Playwright MCP tools at 390×844:

```bash
node -e "const h=require('http'),f=require('fs'),p=require('path');const t={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png'};h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';f.readFile(p.join('.',u),(e,d)=>{if(e){s.writeHead(404);return s.end()}s.writeHead(200,{'Content-Type':t[p.extname(u)]||'application/octet-stream','Cache-Control':'no-store'});s.end(d)})}).listen(8080,()=>console.log('http://localhost:8080'))"
```

Before the first browser check, clear any old service worker once:
`async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); location.reload(); }`

---

### Task 1: Pure logic for goal, backup, delete and chart

**Files:**
- Modify: `test.html` (add tests before the final `document.getElementById('out')` line)
- Modify: `logic.js` (append functions)

**Interfaces:**
- Consumes: `parseWeight`, `parseEntries`, `sortEntries`, `upsert` (existing).
- Produces:
  - `parseGoal(text) → number|null` (accepts numbers or strings; ≥ 1 and < 1000; comma ok; 0.1 rounding)
  - `makeBackup(entries, goal, today) → string` (pretty JSON, entries sorted)
  - `readBackup(text) → { entries, goal: number|null, skipped } | { error }`
  - `removeEntry(entries, date) → entries[]`
  - `chartPoints(sorted, goal, width, height, pad) → { points: [{x, y, date, weight}], goalY, min, max }` (coordinates rounded to 0.1)

- [ ] **Step 1: Write the failing tests.** Insert this into `test.html` just before `document.getElementById('out').textContent =`:

```js
  // parseGoal (Review Focus 2)
  eq('parseGoal comma', parseGoal('72,5'), 72.5);
  eq('parseGoal number', parseGoal(75), 75);
  eq('parseGoal too small', parseGoal('0.5'), null);
  eq('parseGoal empty', parseGoal(''), null);
  eq('parseGoal null', parseGoal(null), null);

  // makeBackup / readBackup round trip
  const bk = makeBackup([{ date: '2026-10-10', weight: 98.4 }, SEED], 72.5, '2026-10-10');
  eq('backup shape', JSON.parse(bk), { app: 'weight-tracker', version: 1, exported: '2026-10-10', goal: 72.5,
    entries: [SEED, { date: '2026-10-10', weight: 98.4 }] });
  eq('backup round trip', readBackup(bk), { entries: [SEED, { date: '2026-10-10', weight: 98.4 }], goal: 72.5, skipped: 0 });

  // readBackup errors and skips (Review Focus 1, 5)
  eq('readBackup not json', readBackup('{nope'), { error: "That isn't a Weight Tracker backup" });
  eq('readBackup other app', readBackup('{"app":"other","entries":[]}'), { error: "That isn't a Weight Tracker backup" });
  eq('readBackup no entries array', readBackup('{"app":"weight-tracker"}'), { error: "That isn't a Weight Tracker backup" });
  eq('readBackup zero valid', readBackup('{"app":"weight-tracker","entries":[{"date":"x","weight":1}]}'), { error: 'Backup has no entries' });
  eq('readBackup skips bad + bad goal', readBackup(JSON.stringify({ app: 'weight-tracker', goal: 'abc', entries: [SEED, { date: 'bad', weight: 1 }] })),
     { entries: [SEED], goal: null, skipped: 1 });
  eq('readBackup duplicate date, last wins', readBackup(JSON.stringify({ app: 'weight-tracker', entries: [SEED, { date: '2026-10-09', weight: 97 }] })),
     { entries: [{ date: '2026-10-09', weight: 97 }], goal: null, skipped: 1 });

  // removeEntry
  eq('removeEntry', removeEntry([SEED, { date: '2026-10-10', weight: 98.4 }], '2026-10-09'), [{ date: '2026-10-10', weight: 98.4 }]);
  eq('removeEntry missing', removeEntry([SEED], '2026-01-01'), [SEED]);

  // chartPoints (200×100, pad 10)
  eq('chart 2 entries', chartPoints([{ date: '2026-10-01', weight: 80 }, { date: '2026-10-11', weight: 78 }], 75, 200, 100, 10),
     { points: [{ x: 10, y: 16.7, date: '2026-10-01', weight: 80 }, { x: 190, y: 43.3, date: '2026-10-11', weight: 78 }],
       goalY: 83.3, min: 74.5, max: 80.5 });
  eq('chart 1 entry centred', chartPoints([{ date: '2026-10-01', weight: 80 }], 75, 200, 100, 10).points,
     [{ x: 100, y: 16.7, date: '2026-10-01', weight: 80 }]);
  eq('chart goal above weights', chartPoints([{ date: '2026-10-01', weight: 80 }, { date: '2026-10-11', weight: 78 }], 100, 200, 100, 10),
     { points: [{ x: 10, y: 81.3, date: '2026-10-01', weight: 80 }, { x: 190, y: 88.3, date: '2026-10-11', weight: 78 }],
       goalY: 11.7, min: 77.5, max: 100.5 });
```

- [ ] **Step 2: Run the tests to verify they fail.** Run the logic test command.
Expected: `ERROR parseGoal is not defined`

- [ ] **Step 3: Implement.** Append this to `logic.js`:

```js
// Goal uses the weight rules (comma ok, 0.1 rounding) but must be at least 1 kg.
function parseGoal(text) {
  const n = parseWeight(text);
  return n !== null && n >= 1 ? n : null;
}

function makeBackup(entries, goal, today) {
  return JSON.stringify({ app: 'weight-tracker', version: 1, exported: today, goal, entries: sortEntries(entries) }, null, 2);
}

const NOT_A_BACKUP = "That isn't a Weight Tracker backup";

// Valid entries are kept (one per date, last wins); everything else counts as skipped.
function readBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { error: NOT_A_BACKUP }; }
  if (!data || data.app !== 'weight-tracker' || !Array.isArray(data.entries)) return { error: NOT_A_BACKUP };
  const valid = parseEntries(JSON.stringify({ entries: data.entries }));
  const entries = sortEntries(valid.reduce((acc, e) => upsert(acc, e.date, e.weight), []));
  if (!entries.length) return { error: 'Backup has no entries' };
  return { entries, goal: parseGoal(data.goal), skipped: data.entries.length - entries.length };
}

function removeEntry(entries, date) {
  return entries.filter(e => e.date !== date);
}

// Chart geometry: x proportional to date, y range = weights + goal padded by 0.5 kg.
function chartPoints(sorted, goal, width, height, pad) {
  const r = v => Math.round(v * 10) / 10;
  const ws = sorted.map(e => e.weight).concat(goal == null ? [] : [goal]);
  const min = Math.min(...ws) - 0.5, max = Math.max(...ws) + 0.5;
  const t0 = Date.parse(sorted[0].date), t1 = Date.parse(sorted[sorted.length - 1].date);
  const x = t => t1 === t0 ? width / 2 : pad + (t - t0) / (t1 - t0) * (width - 2 * pad);
  const y = w => pad + (max - w) / (max - min) * (height - 2 * pad);
  return {
    points: sorted.map(e => ({ x: r(x(Date.parse(e.date))), y: r(y(e.weight)), date: e.date, weight: e.weight })),
    goalY: goal == null ? null : r(y(goal)),
    min, max
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass.** Run the logic test command.
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add logic.js test.html
git commit -m "feat: logic for goal, backup/restore, delete and chart geometry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Settings sheet with goal and System/Light/Dark theme

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `parseGoal` (Task 1).
- Produces, used by Tasks 3–5:
  - JS helpers: `openSheet(el)`, `closeSheet()`, `read(key)`, `write(key, value)`, and the variable `goal`
  - CSS classes: `.sheet`, `.backdrop`, `.btn`, `.btn-secondary`, `.btn-danger`, `.btn-wide`, `.seg`, `.row`, `.field`, `.label`, `.grow`
  - elements: `#wt-backdrop`, `#wt-settings`, `#wt-goal`, a `<div class="field" id="wt-data-field">` placeholder inside settings (Task 4 fills it)
  - attribute: `data-close` closes any sheet

- [ ] **Step 1: Write the failing check.** Start the dev server, clear the old service worker (see Test commands), then `browser_evaluate` →
`() => !!document.getElementById('wt-settings-btn')`
Expected: `false`

- [ ] **Step 2: Theme before first paint.** In `<head>`, directly after `<link rel="apple-touch-icon" href="icon.png">`, add:

```html
<script>
  // Apply the saved theme before first paint so the app never flashes the wrong colours.
  try { document.documentElement.dataset.theme = localStorage.getItem('weight-theme') || 'system'; }
  catch (e) { document.documentElement.dataset.theme = 'system'; }
</script>
```

- [ ] **Step 3: Theme CSS.** Replace the whole `@media (prefers-color-scheme: dark) { :root { … } }` block with:

```css
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #121019; --surface-1: #1C1927; --surface-2: #232032;
    --border: #34304A; --border-strong: #46415F;
    --text: #ECEAF5; --text-secondary: #B4B0C8; --text-muted: #8A86A0; --text-danger: #F2B8B5;
    --row-alt: #2A2640; --accent: #7F77DD; --quote: #AFA9EC; --gain: #F0997B; --loss: #5DCAA5;
  }
  @media (prefers-color-scheme: dark) {
    :root[data-theme="system"] {
      --bg: #121019; --surface-1: #1C1927; --surface-2: #232032;
      --border: #34304A; --border-strong: #46415F;
      --text: #ECEAF5; --text-secondary: #B4B0C8; --text-muted: #8A86A0; --text-danger: #F2B8B5;
      --row-alt: #2A2640; --accent: #7F77DD; --quote: #AFA9EC; --gain: #F0997B; --loss: #5DCAA5;
    }
  }
```

- [ ] **Step 4: Shared input style + sheet CSS.**
  - Change the selector `#wt-weight {` to `.weight input {`, keeping its rules.
  - Change `.today { margin: 0 0 12px;` to `.today { margin: 0;`.
  - Add these rules before `</style>`:

```css
  .card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .icon-btn {
    all: unset; cursor: pointer; width: 44px; height: 44px; margin: -10px -10px -10px 0; border-radius: 10px;
    display: grid; place-items: center; font-size: 22px; color: var(--text-secondary);
  }
  .backdrop { position: fixed; inset: 0; z-index: 10; background: rgb(0 0 0 / 0.45); }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 11; max-width: 560px; margin: 0 auto;
    max-height: 90svh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;
    background: var(--surface-1); border-radius: 16px 16px 0 0;
    padding: 20px 16px max(20px, env(safe-area-inset-bottom));
  }
  .sheet h2 { margin: 0; font-size: 18px; }
  .sheet .error { margin: 0; text-align: left; }
  .row { display: flex; gap: 8px; align-items: center; }
  .field { display: flex; flex-direction: column; gap: 8px; }
  .label, .field label { font-size: 14px; color: var(--text-secondary); }
  .grow { flex: 1; }
  .btn {
    height: 52px; padding: 0 18px; border: none; border-radius: 10px; cursor: pointer;
    background: var(--accent); color: #fff; font-family: inherit; font-size: 16px; font-weight: 600;
  }
  .btn-secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--border-strong); }
  .btn-danger { background: transparent; color: var(--text-danger); border: 1px solid var(--text-danger); }
  .btn-wide { width: 100%; }
  .seg { display: flex; padding: 3px; border-radius: 10px; background: var(--surface-2); }
  .seg button {
    all: unset; flex: 1; text-align: center; padding: 10px 0; border-radius: 8px; cursor: pointer;
    font-size: 15px; color: var(--text);
  }
  .seg button[aria-checked="true"] { background: var(--surface-1); font-weight: 600; box-shadow: 0 1px 3px rgb(0 0 0 / 0.18); }
```

- [ ] **Step 5: Markup.**
  - Replace `<p id="wt-today" class="today"></p>` with:

```html
    <div class="card-top">
      <p id="wt-today" class="today"></p>
      <button id="wt-settings-btn" class="icon-btn" type="button" aria-label="Settings">&#9881;&#xFE0E;</button>
    </div>
```

  - Add this directly after `</main>`:

```html
<div id="wt-backdrop" class="backdrop" hidden></div>

<section id="wt-settings" class="sheet" role="dialog" aria-modal="true" aria-labelledby="wt-settings-title" hidden>
  <h2 id="wt-settings-title">Settings</h2>
  <form id="wt-goal-form" class="field" novalidate>
    <label for="wt-goal">Goal weight</label>
    <div class="row">
      <div class="weight"><input type="text" id="wt-goal" inputmode="decimal" autocomplete="off"><span>kg</span></div>
      <button type="submit" class="btn">Save</button>
    </div>
    <p id="wt-goal-error" class="error" role="alert"></p>
  </form>
  <div class="field">
    <span class="label" id="wt-theme-label">Appearance</span>
    <div class="seg" role="radiogroup" aria-labelledby="wt-theme-label">
      <button type="button" role="radio" data-theme-choice="system">System</button>
      <button type="button" role="radio" data-theme-choice="light">Light</button>
      <button type="button" role="radio" data-theme-choice="dark">Dark</button>
    </div>
  </div>
  <div class="field" id="wt-data-field"></div>
  <button type="button" class="btn btn-wide" data-close>Done</button>
</section>
```

- [ ] **Step 6: Script.**
  - Replace `const KEY = 'weight-entries', SEEDED_KEY = 'weight-seeded', CLEANUP_KEY = 'weight-cleanup-1', unit = 'kg', GOAL = 75;` with:

```js
  const KEY = 'weight-entries', SEEDED_KEY = 'weight-seeded', CLEANUP_KEY = 'weight-cleanup-1', unit = 'kg';
  const GOAL_KEY = 'weight-goal', THEME_KEY = 'weight-theme', VIEW_KEY = 'weight-view';
  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { storageEl.hidden = false; return false; } };
  let goal = parseGoal(read(GOAL_KEY)) ?? 75;
```

  - In the three quote arrays, change `"Every kg down is a step closer to 75. Keep going."` to `"Every kg down is a step closer to {goal}. Keep going."` and `"75 kg is still the plan. This is just a bump in the road."` to `"{goal} kg is still the plan. This is just a bump in the road."`
  - Change `const pick = list => list[Math.floor(Math.random() * list.length)];` to:

```js
  const pick = list => list[Math.floor(Math.random() * list.length)].replace('{goal}', goal);
```

  - In `render()`, replace `GOAL` with `goal` (three places: `last.weight - GOAL`, `your ${GOAL} kg goal. You've got this.`, `your ${GOAL} kg goal — keep it steady.`).
  - Add this just before `showToday();\n  load();`:

```js
  // Bottom sheets: one open at a time; close with Done/Cancel, the backdrop or Escape.
  const backdrop = $('wt-backdrop');
  let openSheetEl = null;
  function openSheet(el) { closeSheet(); openSheetEl = el; el.hidden = false; backdrop.hidden = false; }
  function closeSheet() { if (!openSheetEl) return; openSheetEl.hidden = true; backdrop.hidden = true; openSheetEl = null; }
  backdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') closeSheet(); });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeSheet));

  // Settings: goal + theme
  const settingsSheet = $('wt-settings'), goalForm = $('wt-goal-form'), goalInput = $('wt-goal'), goalError = $('wt-goal-error');
  $('wt-settings-btn').addEventListener('click', () => {
    goalInput.value = String(goal);
    goalError.textContent = '';
    openSheet(settingsSheet);
  });
  goalForm.addEventListener('submit', ev => {
    ev.preventDefault();
    const g = parseGoal(goalInput.value);
    if (g === null) { goalError.textContent = 'Enter a goal between 1 and 999 kg'; return; }
    goal = g;
    write(GOAL_KEY, String(g));
    goalError.textContent = '';
    closeSheet();
    render();
  });

  const themeBtns = document.querySelectorAll('[data-theme-choice]');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  function applyTheme(choice) {
    document.documentElement.dataset.theme = choice;
    themeBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeChoice === choice)));
    themeMeta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  }
  themeBtns.forEach(b => b.addEventListener('click', () => { write(THEME_KEY, b.dataset.themeChoice); applyTheme(b.dataset.themeChoice); }));
  applyTheme(read(THEME_KEY) || 'system');
```

- [ ] **Step 7: Run the checks to verify they pass** (390×844, entries = Oct. 9 98.8 and Oct. 10 98.4)
  1. `() => !!document.getElementById('wt-settings-btn')` → `true`
  2. Click `#wt-settings-btn`. Then `() => [document.getElementById('wt-settings').hidden, document.getElementById('wt-goal').value]` → `[false, "75"]`
  3. Type `72,5` into `#wt-goal` and submit. Then `() => [document.getElementById('wt-settings').hidden, localStorage.getItem('weight-goal')]` → `[true, "72.5"]`
  4. Goal error: open settings, type `0`, submit. `#wt-goal-error` → `Enter a goal between 1 and 999 kg`. Press Escape, then the sheet is hidden.
  5. Theme (Review Focus 4): open settings, click `Dark`, and reload. Then `() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor]` → `["dark", "rgb(18, 16, 25)"]`. Click `Light`: background `rgb(247, 246, 251)`. Click `System` with `browser_emulate_media` `colorScheme: 'dark'`: background `rgb(18, 16, 25)`.
  6. Backdrop: open settings, `browser_click` at the top-left of the page (outside the sheet), and the sheet is hidden.
  7. Screenshot the open settings sheet in light and dark; read both and confirm they're readable.
  8. Run the logic test command → `ALL PASS`.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: settings sheet with editable goal and System/Light/Dark theme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Edit and delete entries

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `openSheet`, `closeSheet`, `.sheet`/`.btn*`/`.row` (Task 2); `removeEntry`, `parseWeight`, `upsert` (logic).
- Produces: table rows carry `data-date`; the `#wt-edit` sheet.

- [ ] **Step 1: Write the failing check.** `() => document.querySelector('#wt-table-body tr')?.dataset.date ?? 'none'` → Expected: `none` (rows have no `data-date` yet; with entries present `?.dataset.date` is `undefined`, so it falls through to `'none'`).

- [ ] **Step 2: Rows become tappable.**
  - In `renderTable`, change the row template start from `` `<tr${i % 2 ? ' class="alt"' : ''}>` `` to:

```js
`<tr data-date="${e.date}" tabindex="0" role="button" aria-label="Edit ${fmtDate(e.date)}"${i % 2 ? ' class="alt"' : ''}>`
```

  - Add the CSS: `  tbody tr { cursor: pointer; }`

- [ ] **Step 3: Edit sheet markup.** Add it after the `#wt-settings` section:

```html
<section id="wt-edit" class="sheet" role="dialog" aria-modal="true" aria-labelledby="wt-edit-title" hidden>
  <h2 id="wt-edit-title">Edit entry</h2>
  <p id="wt-edit-date" class="today"></p>
  <form id="wt-edit-form" class="row" novalidate>
    <div class="weight">
      <label class="sr-only" for="wt-edit-weight">Weight in kg</label>
      <input type="text" id="wt-edit-weight" inputmode="decimal" autocomplete="off"><span>kg</span>
    </div>
    <button type="submit" class="btn">Save</button>
  </form>
  <p id="wt-edit-error" class="error" role="alert"></p>
  <button type="button" id="wt-delete" class="btn btn-danger btn-wide">Delete entry</button>
  <button type="button" class="btn btn-secondary btn-wide" data-close>Cancel</button>
</section>
```

- [ ] **Step 4: Script.** Add it after the theme block from Task 2:

```js
  // Edit / delete: tap a row. The date is fixed; only the weight can change.
  const editSheet = $('wt-edit'), editDateEl = $('wt-edit-date'), editForm = $('wt-edit-form');
  const editWeight = $('wt-edit-weight'), editError = $('wt-edit-error');
  let editDate = null;
  function openEdit(date) {
    const e = entries.find(x => x.date === date);
    if (!e) return;
    editDate = date;
    editDateEl.textContent = fmtDate(date);
    editWeight.value = e.weight.toFixed(1);
    editError.textContent = '';
    openSheet(editSheet);
  }
  tableBody.addEventListener('click', ev => {
    const tr = ev.target.closest('tr[data-date]');
    if (tr) openEdit(tr.dataset.date);
  });
  tableBody.addEventListener('keydown', ev => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('tr[data-date]')) {
      ev.preventDefault();
      openEdit(ev.target.dataset.date);
    }
  });
  editForm.addEventListener('submit', ev => {
    ev.preventDefault();
    const w = parseWeight(editWeight.value);
    if (w === null) { editError.textContent = 'Enter a valid weight first'; return; }
    entries = upsert(entries, editDate, w);
    save();
    closeSheet();
    render();
  });
  $('wt-delete').addEventListener('click', () => {
    const e = entries.find(x => x.date === editDate);
    if (!e || !confirm(`Delete ${fmtDate(e.date)} · ${e.weight.toFixed(1)} kg?`)) return;
    entries = removeEntry(entries, editDate);
    save();
    closeSheet();
    render();
  });
```

- [ ] **Step 5: Run the checks to verify they pass** (entries = Oct. 9 98.8 and Oct. 10 98.4)
  1. `() => document.querySelector('#wt-table-body tr').dataset.date` → `"2026-10-10"`
  2. Click the first row. Then `() => [document.getElementById('wt-edit').hidden, document.getElementById('wt-edit-date').textContent, document.getElementById('wt-edit-weight').value]` → `[false, "Oct. 10, '26", "98.4"]`
  3. Fill `#wt-edit-weight` with `98,1` and submit. Then `() => [document.getElementById('wt-latest').textContent, document.getElementById('wt-edit').hidden]` → `["Latest: 98.1 kg on Oct. 10, '26", true]`
  4. Invalid edit: open the row, fill `abc`, submit. `#wt-edit-error` → `Enter a valid weight first`. Close with Cancel.
  5. Delete with the dialog dismissed: open the Oct. 10 row, use `browser_handle_dialog` with `accept: false`, click `#wt-delete`. Expect still 2 rows.
  6. Delete with the dialog accepted: repeat with `accept: true`. Expect 1 row, and latest = Oct. 9.
  7. Delete the last entry (Review Focus 3): accept deleting Oct. 9, then reload. `() => [document.getElementById('wt-empty').hidden, localStorage.getItem('weight-entries')]` → `[false, "{\"entries\":[],\"unit\":\"kg\"}"]` (no re-seed).
  8. Run the logic test command → `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: tap a row to edit its weight or delete it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Backup and Restore

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `#wt-data-field`, `openSheet`/`closeSheet`, `write`, `goal`, `goalInput`, `GOAL_KEY` (Task 2); `makeBackup`, `readBackup` (Task 1).
- Produces: `#wt-backup`, `#wt-restore`, `#wt-restore-file`, `#wt-data-msg`.

- [ ] **Step 1: Write the failing check.** `() => !!document.getElementById('wt-backup')` → Expected: `false`

- [ ] **Step 2: Markup.** Replace `<div class="field" id="wt-data-field"></div>` with:

```html
  <div class="field" id="wt-data-field">
    <span class="label">Your data</span>
    <div class="row">
      <button type="button" id="wt-backup" class="btn btn-secondary grow">Backup</button>
      <button type="button" id="wt-restore" class="btn btn-secondary grow">Restore</button>
    </div>
    <input type="file" id="wt-restore-file" accept=".json,application/json" hidden>
    <p id="wt-data-msg" class="error" role="alert"></p>
  </div>
```

- [ ] **Step 3: Script.** Add it after the edit/delete block:

```js
  // Backup: iPhone Share sheet with a .json file; download where file sharing isn't supported.
  const dataMsg = $('wt-data-msg'), restoreFile = $('wt-restore-file');
  const count = n => n + (n === 1 ? ' entry' : ' entries');
  $('wt-backup').addEventListener('click', async () => {
    dataMsg.textContent = '';
    const name = `weight-backup-${today()}.json`;
    const file = new File([makeBackup(entries, goal, today())], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Weight Tracker backup' }); }
      catch (e) { if (e.name !== 'AbortError') dataMsg.textContent = 'Could not share the backup.'; }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // Restore: pick a file, confirm, then replace everything.
  $('wt-restore').addEventListener('click', () => { dataMsg.textContent = ''; restoreFile.value = ''; restoreFile.click(); });
  restoreFile.addEventListener('change', async () => {
    const f = restoreFile.files[0];
    if (!f) return;
    const r = readBackup(await f.text());
    if (r.error) { dataMsg.textContent = r.error; return; }
    const skipped = r.skipped ? ` (${r.skipped} skipped)` : '';
    if (!confirm(`Replace your ${count(entries.length)} with ${count(r.entries.length)}${skipped} from this backup?`)) return;
    entries = r.entries;
    save();
    if (r.goal !== null) { goal = r.goal; write(GOAL_KEY, String(goal)); }
    goalInput.value = String(goal);
    closeSheet();
    render();
  });
```

- [ ] **Step 4: Run the checks to verify they pass** (entries = Oct. 9 98.8 and Oct. 10 98.4, goal 72.5)
  1. `() => !!document.getElementById('wt-backup')` → `true`
  2. Backup (download path on desktop): open settings, click `#wt-backup`. Playwright reports a download named `weight-backup-2026-10-10.json`. Read the saved file. Expect `"app": "weight-tracker"`, `"goal": 72.5`, and 2 entries in date order.
  3. Round trip: delete Oct. 10 (accept the dialog), open settings, then `browser_handle_dialog` `accept: true`, click `#wt-restore`, and `browser_file_upload` the downloaded backup. Expect 2 rows again and latest `98.4 kg on Oct. 10, '26`.
  4. Wrong file (Review Focus 5): write `{"app":"other","entries":[]}` to the scratchpad as `other.json`, restore it, and read `#wt-data-msg` → `That isn't a Weight Tracker backup`. Rows are unchanged (2).
  5. Restore dialog dismissed: restore the good file with `accept: false`. Rows are unchanged.
  6. Run the logic test command → `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: backup via Share sheet and restore from file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Table | Chart switch and SVG chart

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `.seg` styles, `read`/`write`, `VIEW_KEY`, `goal` (Task 2); `chartPoints`, `sortEntries`, `fmtDate` (logic).
- Produces: `#wt-history` (wraps the switch, table and chart), `#wt-chart`, `#wt-chart-svg`, `drawChart()`.

- [ ] **Step 1: Write the failing check.** `() => !!document.getElementById('wt-chart')` → Expected: `false`

- [ ] **Step 2: Markup.** Wrap the table and add the switch and chart. Replace the opening `<div id="wt-table-wrap" class="table-wrap" hidden>` with:

```html
  <div id="wt-history" class="history" hidden>
  <div class="seg" role="radiogroup" aria-label="History view">
    <button type="button" role="radio" data-view="table">Table</button>
    <button type="button" role="radio" data-view="chart">Chart</button>
  </div>
  <div id="wt-table-wrap" class="table-wrap">
```

and directly after the table wrap's closing `</div>` (the one after `</table>`), add:

```html
  <div id="wt-chart" class="chart" hidden>
    <svg id="wt-chart-svg" role="img" aria-label="Weight over time"></svg>
    <p id="wt-chart-note" class="muted">Log another day to see your trend.</p>
  </div>
  </div>
```

- [ ] **Step 3: CSS.** Add before `</style>`:

```css
  .history { flex-shrink: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  .chart {
    height: 280px; min-height: 160px; flex-shrink: 1; display: flex; flex-direction: column;
    background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 12px; padding: 8px;
  }
  .chart svg { flex: 1; width: 100%; min-height: 0; }
  .chart p { margin: 0; text-align: center; font-size: 13px; }
  .chart .line { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; }
  .chart .dot { fill: var(--accent); }
  .chart .goal { stroke: var(--loss); stroke-width: 1.5; stroke-dasharray: 6 5; }
  .chart .goal-label { fill: var(--loss); font-size: 12px; }
  .chart .axis { fill: var(--text-muted); font-size: 11px; }
```

- [ ] **Step 4: Script.**
  - In the top-level element list, add: `const historyEl = $('wt-history');`
  - In `render()`, replace `tableWrap.hidden = !last;` with `historyEl.hidden = !last;`, and after `renderTable(sorted);` add `drawChart();`
  - Add after the backup/restore block:

```js
  // History view: Table | Chart, last choice remembered.
  const chartBox = $('wt-chart'), chartSvg = $('wt-chart-svg'), chartNote = $('wt-chart-note');
  const viewBtns = document.querySelectorAll('[data-view]');
  let view = read(VIEW_KEY) === 'chart' ? 'chart' : 'table';
  function applyView() {
    tableWrap.hidden = view !== 'table';
    chartBox.hidden = view !== 'chart';
    viewBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.view === view)));
    drawChart();
  }
  viewBtns.forEach(b => b.addEventListener('click', () => { view = b.dataset.view; write(VIEW_KEY, view); applyView(); }));

  // Chart: inline SVG, coloured by CSS variables so it follows the theme.
  function drawChart() {
    if (chartBox.hidden || historyEl.hidden) return;
    const sorted = sortEntries(entries);
    const w = chartSvg.clientWidth, h = chartSvg.clientHeight, pad = 36;
    if (!sorted.length || !w || !h) return;
    const c = chartPoints(sorted, goal, w, h, pad);
    const first = sorted[0].date, last = sorted[sorted.length - 1].date;
    chartSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    chartSvg.innerHTML =
      `<line class="goal" x1="${pad}" x2="${w - pad}" y1="${c.goalY}" y2="${c.goalY}"/>` +
      `<text class="goal-label" x="${w - pad}" y="${c.goalY - 6}" text-anchor="end">Goal ${goal} kg</text>` +
      (c.points.length > 1 ? `<polyline class="line" points="${c.points.map(p => `${p.x},${p.y}`).join(' ')}"/>` : '') +
      c.points.map(p => `<circle class="dot" cx="${p.x}" cy="${p.y}" r="3.5"/>`).join('') +
      `<text class="axis" x="2" y="${pad}" dominant-baseline="middle">${c.max.toFixed(1)}</text>` +
      `<text class="axis" x="2" y="${h - pad}" dominant-baseline="middle">${c.min.toFixed(1)}</text>` +
      `<text class="axis" x="${pad}" y="${h - 8}">${fmtDate(first)}</text>` +
      (first !== last ? `<text class="axis" x="${w - pad}" y="${h - 8}" text-anchor="end">${fmtDate(last)}</text>` : '');
    chartNote.hidden = sorted.length > 1;
  }
  window.addEventListener('resize', drawChart);
```

  - Change `showToday();\n  load();` to `showToday();\n  load();\n  applyView();`

- [ ] **Step 5: Run the checks to verify they pass**
  1. With 2 entries and goal 72.5: click `Chart`. Then `() => [document.getElementById('wt-chart').hidden, document.querySelectorAll('#wt-chart-svg circle').length, !!document.querySelector('#wt-chart-svg .goal'), document.querySelector('#wt-chart-svg .goal-label').textContent, localStorage.getItem('weight-view')]` → `[false, 2, true, "Goal 72.5 kg", "chart"]`
  2. Reload, and the chart view is still shown (remembered).
  3. With 1 entry: `#wt-chart-note` is visible and there's 1 circle.
  4. Screenshot the chart view in light and dark, read both, and confirm the line, dots, dashed goal line and labels are visible.
  5. Click `Table`, and the table is shown again.
  6. Run the logic test command → `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: Table | Chart switch with SVG weight chart and goal line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: One-screen check, cache bump, deploy

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: The one-screen check with 60 entries, in both views.** Seed 60 daily entries ending 2026-10-10 (see the snippet below) and reload. For `table` and then `chart` view:
`() => { const vis = el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }; return { pageScrolls: document.scrollingElement.scrollHeight > innerHeight + 1, card: vis(document.querySelector('.card')), summary: vis(document.getElementById('wt-summary')) }; }`
Expected for both: `{ pageScrolls: false, card: true, summary: true }`. Take a screenshot of each and read them.

Seed snippet: `() => { const e = []; const d = new Date(2026, 9, 10); for (let i = 0; i < 60; i++) { const x = new Date(d); x.setDate(d.getDate() - i); e.push({ date: ymd(x), weight: +(98.8 - i * 0.05).toFixed(1) }); } localStorage.setItem('weight-entries', JSON.stringify({ entries: e, unit: 'kg' })); location.reload(); }`

- [ ] **Step 2: Bump the cache.** In `sw.js` change `const CACHE = 'wt-v5';` to `const CACHE = 'wt-v6';`

- [ ] **Step 3: Run the logic test command** → `ALL PASS`, then commit:

```bash
git add sw.js
git commit -m "chore: bump cache to wt-v6 for part 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Deploy (after the final review).** `git push`, then poll until live:
`for i in $(seq 1 30); do curl -s "https://olekleklek.github.io/weight-tracker/sw.js?$i" | grep -q "wt-v6" && { echo LIVE; break; }; sleep 15; done`
Expected: `LIVE`.

- [ ] **Step 5: iPhone check (user).**
  1. Open the app, close it, and reopen it to get the update.
  2. ⚙ → Backup → Save to Files.
  3. Delete an entry.
  4. ⚙ → Restore → pick the file → confirm. The entry is back.
  5. Try Chart, the goal, and Dark.
