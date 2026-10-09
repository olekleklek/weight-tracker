# Weight Tracker Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `weight-tracker_4.html` into an installable, offline iPhone web app hosted on GitHub Pages, with data kept only on the phone.

**Architecture:** Plain static files, with no framework and no build step. `logic.js` holds the pure functions (no DOM) and is shared by `index.html` (the app) and `test.html` (browser self-check). `sw.js` caches the app files so it works offline. `manifest.json` and `icon.png` make it installable.

**Tech Stack:** HTML, CSS, vanilla JS, Service Worker, Web App Manifest, localStorage, GitHub Pages, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-10-09-foundation-design.md`

## Global Constraints

- Data only in `localStorage`: key `weight-entries` → `{ "entries": [{ "date": "YYYY-MM-DD", "weight": <number> }], "unit": "kg" }`; seed flag key `weight-seeded` = `"1"`.
- One-time seed: `{ date: "2026-10-09", weight: 98.8 }`, only when no entries AND flag not set.
- No `window.storage`, no external scripts, fonts or CDNs. Everything must work offline.
- Input font-size ≥ 16px; viewport `viewport-fit=cover`; safe-area padding.
- Goal stays hard-coded at 75 kg (editable goal is Part 2).
- Service worker cache name `wt-v1`; bump it on every later app change.
- Repo: public `olekleklek/weight-tracker`, Pages from `main` `/ (root)`, URL `https://olekleklek.github.io/weight-tracker/`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Comma decimal from the iPhone keypad in comma locales (`98,8`): it should be accepted as 98.8, not rejected. Covered by a test in Task 1.
2. Future date. iOS Safari ignores the date input's `max`, so a future date must be rejected with an error, not saved. Covered by a test in Task 1.
3. Corrupt or foreign data under `weight-entries`: the app should start empty without crashing, and the bad data stays untouched until the next save. Covered by a test in Task 1.
4. Floating-point noise in the change column: 98.8 → 98.7 must show `-0.1`, not `-0.0999…`. Covered by a test in Task 1.
5. Deleting all entries after the seed (or clearing storage while the flag is set) must NOT re-seed 98.8. Covered by a test in Task 1, and a reload check in Task 2.

## Dev server (used by Tasks 1–3)

No Python on this machine, so use a Node one-liner. Run it from the project root **in the background**, and leave it running:

```bash
node -e "const h=require('http'),f=require('fs'),p=require('path');const t={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png'};h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';f.readFile(p.join('.',u),(e,d)=>{if(e){s.writeHead(404);return s.end()}s.writeHead(200,{'Content-Type':t[p.extname(u)]||'application/octet-stream','Cache-Control':'no-store'});s.end(d)})}).listen(8080,()=>console.log('http://localhost:8080'))"
```

Browser checks use the Playwright MCP tools (`browser_navigate`, `browser_evaluate`, `browser_snapshot`, `browser_resize`).

---

### Task 1: Pure logic + browser self-check

**Files:**
- Create: `logic.js`
- Create: `test.html`

**Interfaces:**
- Produces (globals in `logic.js`):
  - `SEED` → `{ date: '2026-10-09', weight: 98.8 }`
  - `ymd(d: Date) → 'YYYY-MM-DD'` (local time)
  - `sortEntries(entries) → entries[]` (new array, ascending by date)
  - `changeMap(sorted) → { [date]: number|null }` (1-decimal change vs previous; first is `null`)
  - `upsert(entries, date, weight) → entries[]` (new array; replaces same date)
  - `parseEntries(raw: string|null) → entries[]` (never throws; drops invalid items)
  - `parseWeight(text) → number|null` (accepts `,` or `.`; 0 < w < 1000; rounded to 0.1)
  - `validateEntry(dateStr, weightText, today) → { date, weight } | { error: string }`
  - `seedIfNeeded(entries, seeded: boolean) → { entries, seeded: true }`
  - `nextLogDate(date, today) → 'YYYY-MM-DD'` (date + 1 day, capped at today)

- [ ] **Step 1: Start the dev server** (see "Dev server" above) in the background.

- [ ] **Step 2: Write the failing test page** `test.html`:

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Logic tests</title></head>
<body>
<pre id="out">running…</pre>
<script src="logic.js"></script>
<script>
  const fails = [];
  const eq = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g !== w) fails.push(`${name}: got ${g}, want ${w}`);
  };

  // ymd
  eq('ymd', ymd(new Date(2026, 9, 9)), '2026-10-09');

  // sortEntries
  const a = [{ date: '2026-10-11', weight: 98 }, { date: '2026-10-09', weight: 98.8 }];
  eq('sortEntries order', sortEntries(a).map(e => e.date), ['2026-10-09', '2026-10-11']);
  eq('sortEntries no mutate', a[0].date, '2026-10-11');

  // changeMap (float noise: Review Focus 4)
  eq('changeMap', changeMap([
    { date: '2026-10-09', weight: 98.8 },
    { date: '2026-10-10', weight: 98.7 },
    { date: '2026-10-11', weight: 99.0 },
    { date: '2026-10-12', weight: 99.0 }
  ]), { '2026-10-09': null, '2026-10-10': -0.1, '2026-10-11': 0.3, '2026-10-12': 0 });

  // upsert
  eq('upsert append', upsert([SEED], '2026-10-10', 98.5).length, 2);
  eq('upsert replace', upsert([SEED], '2026-10-09', 97), [{ date: '2026-10-09', weight: 97 }]);

  // parseEntries (Review Focus 3)
  eq('parseEntries null', parseEntries(null), []);
  eq('parseEntries corrupt', parseEntries('{not json'), []);
  eq('parseEntries foreign', parseEntries('{"foo":1}'), []);
  eq('parseEntries drops bad', parseEntries(JSON.stringify({ entries: [
    { date: '2026-10-09', weight: 98.8 }, { date: 'x', weight: 1 }, { date: '2026-10-10', weight: '9' }, null
  ] })), [{ date: '2026-10-09', weight: 98.8 }]);

  // parseWeight (Review Focus 1)
  eq('parseWeight dot', parseWeight('98.8'), 98.8);
  eq('parseWeight comma', parseWeight('98,8'), 98.8);
  eq('parseWeight spaces', parseWeight(' 98.8 '), 98.8);
  eq('parseWeight rounds', parseWeight('98.84'), 98.8);
  eq('parseWeight empty', parseWeight(''), null);
  eq('parseWeight zero', parseWeight('0'), null);
  eq('parseWeight neg', parseWeight('-5'), null);
  eq('parseWeight text', parseWeight('abc'), null);
  eq('parseWeight huge', parseWeight('1000'), null);

  // validateEntry (Review Focus 2)
  eq('validate ok', validateEntry('2026-10-09', '98,8', '2026-10-09'), { date: '2026-10-09', weight: 98.8 });
  eq('validate empty date → today', validateEntry('', '98', '2026-10-09'), { date: '2026-10-09', weight: 98 });
  eq('validate future', validateEntry('2026-10-10', '98', '2026-10-09'), { error: "Date can't be in the future" });
  eq('validate bad weight', validateEntry('2026-10-09', '', '2026-10-09'), { error: 'Enter a valid weight first' });

  // seedIfNeeded (Review Focus 5)
  eq('seed fresh', seedIfNeeded([], false), { entries: [SEED], seeded: true });
  eq('seed already seeded', seedIfNeeded([], true), { entries: [], seeded: true });
  eq('seed has data', seedIfNeeded([{ date: '2026-10-01', weight: 99 }], false),
     { entries: [{ date: '2026-10-01', weight: 99 }], seeded: true });

  // nextLogDate
  eq('next normal', nextLogDate('2026-10-08', '2026-10-09'), '2026-10-09');
  eq('next capped', nextLogDate('2026-10-09', '2026-10-09'), '2026-10-09');
  eq('next month end', nextLogDate('2026-09-30', '2026-12-01'), '2026-10-01');

  document.getElementById('out').textContent =
    fails.length ? 'FAIL\n' + fails.join('\n') : 'ALL PASS';
</script>
</body>
</html>
```

- [ ] **Step 3: Run it to verify it fails**

`browser_navigate` → `http://localhost:8080/test.html`, then `browser_evaluate` → `() => document.getElementById('out').textContent`
Expected: `running…` (logic.js is missing, so the test script throws `ymd is not defined`).

- [ ] **Step 4: Write `logic.js`**

```js
// Pure functions shared by index.html and test.html. No DOM access here.
const SEED = { date: '2026-10-09', weight: 98.8 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

function changeMap(sorted) {
  const out = {};
  sorted.forEach((e, i) => {
    const prev = sorted[i - 1];
    out[e.date] = prev ? +(e.weight - prev.weight).toFixed(1) : null;
  });
  return out;
}

function upsert(entries, date, weight) {
  return [...entries.filter(e => e.date !== date), { date, weight }];
}

function parseEntries(raw) {
  try {
    const data = JSON.parse(raw);
    const list = data && Array.isArray(data.entries) ? data.entries : [];
    return list.filter(e => e && DATE_RE.test(e.date) && typeof e.weight === 'number' && e.weight > 0);
  } catch (e) {
    return [];
  }
}

function parseWeight(text) {
  const s = String(text == null ? '' : text).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 10) / 10;
  return n > 0 && n < 1000 ? n : null;
}

function validateEntry(dateStr, weightText, today) {
  const weight = parseWeight(weightText);
  if (weight === null) return { error: 'Enter a valid weight first' };
  const date = dateStr || today;
  if (!DATE_RE.test(date)) return { error: 'Pick a valid date' };
  if (date > today) return { error: "Date can't be in the future" };
  return { date, weight };
}

// Seeds once. Once seeded (or data already exists) it never seeds again,
// so deleting every entry later stays empty.
function seedIfNeeded(entries, seeded) {
  return { entries: seeded || entries.length ? entries : [{ ...SEED }], seeded: true };
}

function nextLogDate(date, today) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const next = ymd(d);
  return next > today ? today : next;
}
```

- [ ] **Step 5: Run it to verify it passes**

`browser_navigate` → `http://localhost:8080/test.html`, then `browser_evaluate` → `() => document.getElementById('out').textContent`
Expected: `ALL PASS`

- [ ] **Step 6: Commit**

```bash
git add logic.js test.html
git commit -m "feat: pure tracker logic with browser self-check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Standalone app page (`index.html`)

**Files:**
- Move: `weight-tracker.html`, `weight-tracker_1.html` … `weight-tracker_4.html` → `old/`
- Create: `index.html` (based on `old/weight-tracker_4.html`)

**Interfaces:**
- Consumes: every global from Task 1 (`SEED` indirectly, `ymd`, `sortEntries`, `changeMap`, `upsert`, `parseEntries`, `validateEntry`, `seedIfNeeded`, `nextLogDate`).
- Produces: element ids used by the checks: `wt-form`, `wt-date`, `wt-weight`, `wt-submit`, `wt-error`, `wt-storage`, `wt-table-wrap`, `wt-table-body`, `wt-sort-date`, `wt-sort-arrow`, `wt-summary`, `wt-latest`, `wt-delta`, `wt-quote`, `wt-empty`. It also references `manifest.json` and `icon.png`, which are created in Task 3; until then they 404 harmlessly.

- [ ] **Step 1: Move the old versions**

```bash
mkdir -p old && mv weight-tracker*.html old/
```

- [ ] **Step 2: Write the failing check.** Make sure the dev server is running, then:
`browser_resize` 390×844 → `browser_navigate` `http://localhost:8080/` →
`browser_evaluate` → `() => document.getElementById('wt-latest')?.textContent ?? 'missing'`
Expected: `missing` (the server returns 404 because `index.html` doesn't exist yet).

- [ ] **Step 3: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Weight Tracker</title>
<meta name="theme-color" content="#26215C">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Weight">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icon.png">
<style>
  :root {
    color-scheme: light dark;
    --bg: #F7F6FB; --surface-1: #FFFFFF; --surface-2: #F1F0F7;
    --border: #E2E0EC; --border-strong: #CFCCE0;
    --text: #1B1830; --text-secondary: #5E5A75; --text-muted: #8C88A3; --text-danger: #B3261E;
    --row-alt: #EEEDFE; --accent: #26215C; --quote: #534AB7; --gain: #993C1D; --loss: #0F6E56;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #121019; --surface-1: #1C1927; --surface-2: #232032;
      --border: #34304A; --border-strong: #46415F;
      --text: #ECEAF5; --text-secondary: #B4B0C8; --text-muted: #8A86A0; --text-danger: #F2B8B5;
      --row-alt: #2A2640; --accent: #7F77DD; --quote: #AFA9EC; --gain: #F0997B; --loss: #5DCAA5;
    }
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
             max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }
  main { max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .card { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
  .entry { display: flex; gap: 8px; flex-wrap: wrap; }
  .entry input {
    height: 44px; border-radius: 8px; color: var(--text); background: var(--surface-1);
    font-family: inherit; font-size: 16px; font-weight: 500; min-width: 0; -webkit-appearance: none;
  }
  #wt-date { flex: 1 1 140px; border: none; padding: 0 12px; }
  .weight { flex: 1 1 140px; position: relative; }
  #wt-weight { width: 100%; border: 1px solid var(--border-strong); padding: 0 36px 0 12px; }
  .weight span { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-secondary); pointer-events: none; }
  #wt-submit {
    min-width: 64px; height: 44px; border: none; border-radius: 8px; background: var(--accent); color: #fff;
    font-family: inherit; font-size: 13px; font-weight: 600; letter-spacing: 0.3px; cursor: pointer;
  }
  .error { margin: 8px 0 0; min-height: 1em; text-align: right; font-size: 13px; color: var(--text-danger); }
  .warn { margin: 0; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--text-danger); background: var(--surface-2); color: var(--text-danger); font-size: 14px; }
  .table-wrap { background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 12px; padding: 0.5rem; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 10px 8px; border: 1px solid var(--border-strong); text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--text-secondary); font-weight: 500; }
  td { background: var(--surface-1); }
  td:nth-child(2) { font-weight: 500; }
  tr.alt td { background: var(--row-alt); }
  .sort { all: unset; cursor: pointer; }
  .gain { color: var(--gain); } .loss { color: var(--loss); } .muted { color: var(--text-muted); }
  .summary { background: var(--surface-1); border-radius: 8px; padding: 1rem; }
  #wt-latest { margin: 0; font-size: 15px; font-weight: 500; }
  #wt-delta { margin: 4px 0 0; font-size: 14px; color: var(--text-secondary); }
  #wt-quote { margin: 10px 0 0; padding-top: 10px; border-top: 1px solid var(--border); font-size: 14px; font-style: italic; color: var(--quote); }
  #wt-empty { text-align: center; color: var(--text-muted); font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1 class="sr-only">Weight tracker: log your weight in kilograms and see gain or loss versus your last entry.</h1>

  <p id="wt-storage" class="warn" role="alert" hidden>Not saved — storage is unavailable on this device.</p>

  <section class="card">
    <form id="wt-form" class="entry" novalidate>
      <label class="sr-only" for="wt-date">Date</label>
      <input type="date" id="wt-date">
      <div class="weight">
        <label class="sr-only" for="wt-weight">Weight in kg</label>
        <input type="text" id="wt-weight" inputmode="decimal" autocomplete="off" placeholder="0.0">
        <span>kg</span>
      </div>
      <button id="wt-submit" type="submit">LOG</button>
    </form>
    <p id="wt-error" class="error" role="alert"></p>
  </section>

  <div id="wt-table-wrap" class="table-wrap" hidden>
    <table>
      <thead>
        <tr>
          <th><button id="wt-sort-date" class="sort" type="button">Date <span id="wt-sort-arrow">↓</span></button></th>
          <th>Weight (kg)</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody id="wt-table-body"></tbody>
    </table>
  </div>

  <div id="wt-summary" class="summary" hidden>
    <p id="wt-latest"></p>
    <p id="wt-delta"></p>
    <p id="wt-quote"></p>
  </div>

  <p id="wt-empty">No entries yet — log your first weight above.</p>
</main>

<script src="logic.js"></script>
<script>
(function () {
  const $ = id => document.getElementById(id);
  const form = $('wt-form'), dateInput = $('wt-date'), weightInput = $('wt-weight');
  const errorEl = $('wt-error'), storageEl = $('wt-storage');
  const tableWrap = $('wt-table-wrap'), tableBody = $('wt-table-body');
  const sortBtn = $('wt-sort-date'), sortArrow = $('wt-sort-arrow');
  const summaryEl = $('wt-summary'), latestEl = $('wt-latest'), deltaEl = $('wt-delta'), quoteEl = $('wt-quote');
  const emptyEl = $('wt-empty');

  const KEY = 'weight-entries', SEEDED_KEY = 'weight-seeded', unit = 'kg', GOAL = 75;
  let entries = [];
  let sortDesc = true;

  const lossQuotes = [
    "Every kg down is a step closer to 75. Keep going.",
    "Progress, not perfection. You're moving the right direction.",
    "Small drops add up to big change. Stay consistent.",
    "The scale is catching up to your effort. Well done."
  ];
  const gainQuotes = [
    "One day doesn't undo your progress. Reset tomorrow.",
    "Fluctuations happen. Focus on the trend, not the day.",
    "75 kg is still the plan. This is just a bump in the road.",
    "Be kind to yourself. Consistency beats a single bad day."
  ];
  const steadyQuotes = [
    "Holding steady. Keep showing up for your goal.",
    "No change today — stability is progress too."
  ];
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const today = () => ymd(new Date());

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ entries, unit }));
      storageEl.hidden = true;
      return true;
    } catch (e) {
      storageEl.hidden = false; // entry stays on screen, but tell the user it isn't stored
      return false;
    }
  }

  function load() {
    let raw = null, seeded = false;
    try {
      raw = localStorage.getItem(KEY);
      seeded = localStorage.getItem(SEEDED_KEY) === '1';
    } catch (e) {
      storageEl.hidden = false;
    }
    // Corrupt data parses to [] and is left in storage until the next successful save.
    const result = seedIfNeeded(parseEntries(raw), seeded);
    entries = result.entries;
    if (!seeded && save()) {
      try { localStorage.setItem(SEEDED_KEY, '1'); } catch (e) { storageEl.hidden = false; }
    }
    render();
  }

  function renderTable(sorted) {
    const changes = changeMap(sorted);
    const display = sortDesc ? [...sorted].reverse() : sorted;
    tableBody.innerHTML = display.map((e, i) => {
      const d = changes[e.date];
      let cell = '<span class="muted">—</span>';
      if (d === 0) cell = '<span class="muted">0.0</span>';
      else if (d !== null) cell = `<span class="${d > 0 ? 'gain' : 'loss'}">${d > 0 ? '+' : ''}${d.toFixed(1)}</span>`;
      return `<tr${i % 2 ? ' class="alt"' : ''}><td>${e.date}</td><td>${e.weight.toFixed(1)}</td><td>${cell}</td></tr>`;
    }).join('');
    sortArrow.textContent = sortDesc ? '↓' : '↑';
  }

  function render() {
    const sorted = sortEntries(entries);
    const last = sorted[sorted.length - 1];
    emptyEl.hidden = !!last;
    summaryEl.hidden = !last;
    tableWrap.hidden = !last;
    if (!last) return;

    latestEl.textContent = `Latest: ${last.weight.toFixed(1)} kg on ${last.date}`;
    if (sorted.length >= 2) {
      const prev = sorted[sorted.length - 2];
      const diff = +(last.weight - prev.weight).toFixed(1);
      const days = Math.round((Date.parse(last.date) - Date.parse(prev.date)) / 86400000);
      const dayLabel = days + (days === 1 ? ' day' : ' days');
      if (diff === 0) {
        deltaEl.textContent = `No change since ${prev.date} (${dayLabel} ago).`;
        quoteEl.textContent = pick(steadyQuotes);
      } else {
        deltaEl.textContent = `You've ${diff > 0 ? 'gained' : 'lost'} ${Math.abs(diff).toFixed(1)} kg since ${prev.date} (${dayLabel} ago).`;
        quoteEl.textContent = pick(diff > 0 ? gainQuotes : lossQuotes);
      }
    } else {
      deltaEl.textContent = 'Log another entry to see your trend.';
      const toGo = +(last.weight - GOAL).toFixed(1);
      quoteEl.textContent = toGo > 0
        ? `${toGo.toFixed(1)} kg to go until your ${GOAL} kg goal. You've got this.`
        : `You've hit your ${GOAL} kg goal — keep it steady.`;
    }
    renderTable(sorted);
  }

  form.addEventListener('submit', ev => {
    ev.preventDefault(); // also handles Enter and the iPhone keyboard "Go" key
    errorEl.textContent = '';
    const now = today();
    const result = validateEntry(dateInput.value, weightInput.value, now);
    if (result.error) {
      errorEl.textContent = result.error;
      return;
    }
    entries = upsert(entries, result.date, result.weight);
    save();
    weightInput.value = '';
    dateInput.value = nextLogDate(result.date, now);
    render();
  });

  sortBtn.addEventListener('click', () => {
    sortDesc = !sortDesc;
    renderTable(sortEntries(entries));
  });

  dateInput.value = today();
  dateInput.max = today();
  load();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* online-only fallback */ });
  }
})();
</script>
</body>
</html>
```

- [ ] **Step 4: Run the checks to verify they pass** (390×844 viewport)

1. Fresh start: `browser_evaluate` → `() => { localStorage.clear(); location.reload(); }`, then `browser_evaluate` →
   `() => [document.getElementById('wt-latest').textContent, document.querySelectorAll('#wt-table-body tr').length, localStorage.getItem('weight-seeded')]`
   Expected: `["Latest: 98.8 kg on 2026-10-09", 1, "1"]`
2. Comma entry: type `98,2` in `#wt-weight`, set `#wt-date` to `2026-10-09`, and click LOG. Expected `#wt-latest` = `Latest: 98.2 kg on 2026-10-09` (it replaced the seed, so there's still 1 row).
3. Future date: `browser_evaluate` → `() => { document.getElementById('wt-date').value = '2099-01-01'; document.getElementById('wt-weight').value = '98'; document.getElementById('wt-form').requestSubmit(); return document.getElementById('wt-error').textContent; }`
   Expected: `Date can't be in the future`
4. No re-seed: `browser_evaluate` → `() => { localStorage.setItem('weight-entries', JSON.stringify({entries: [], unit: 'kg'})); location.reload(); }`, then read `#wt-empty` hidden state:
   `() => document.getElementById('wt-empty').hidden` → Expected: `false` (empty message shows, no 98.8).
5. Corrupt data: `() => { localStorage.setItem('weight-entries', '{bad'); location.reload(); }`, then
   `() => [document.getElementById('wt-empty').hidden, localStorage.getItem('weight-entries')]` → Expected: `[false, "{bad"]`
6. `browser_take_screenshot` at 390×844, once with `browser_emulate_media` `colorScheme: 'dark'` and once with `'light'`. Check: text readable, inputs not cut off, LOG button 44px tall.
7. `http://localhost:8080/test.html` still shows `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add -A old index.html
git commit -m "feat: standalone iPhone-ready app page; archive old versions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Installable + offline (manifest, icon, service worker)

**Files:**
- Create: `manifest.json`
- Create: `icon.png` (180×180)
- Create: `sw.js`

**Interfaces:**
- Consumes: `index.html` already links `manifest.json` and `icon.png`, and registers `sw.js` (Task 2).
- Produces: cache `wt-v1` containing `./`, `index.html`, `logic.js`, `manifest.json`, `icon.png`.

- [ ] **Step 1: Write the failing check.** With the dev server running: `browser_navigate` `http://localhost:8080/` →
`browser_evaluate` → `async () => (await navigator.serviceWorker.getRegistrations()).length`
Expected: `0` (`sw.js` returns 404, so the registration fails).

- [ ] **Step 2: Write `manifest.json`**

```json
{
  "name": "Weight Tracker",
  "short_name": "Weight",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#F7F6FB",
  "theme_color": "#26215C",
  "icons": [{ "src": "icon.png", "sizes": "180x180", "type": "image/png" }]
}
```

- [ ] **Step 3: Generate `icon.png`** (PowerShell, from the project root):

```powershell
Add-Type -AssemblyName System.Drawing
$b = New-Object System.Drawing.Bitmap 180, 180
$g = [System.Drawing.Graphics]::FromImage($b)
$g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#26215C'))
$f = New-Object System.Drawing.Font('Segoe UI', 64, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
$g.DrawString('kg', $f, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 0, 180, 180), $sf)
$b.Save((Join-Path (Get-Location) 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $b.Dispose()
```

Then open `icon.png` with the Read tool to check it: white "kg" centred on dark purple. iOS rounds the corners itself.

- [ ] **Step 4: Write `sw.js`**

```js
// Bump CACHE on every app change so phones pick up the new version.
// User data lives in localStorage, not here, so updates never touch it.
const CACHE = 'wt-v1';
const FILES = ['./', 'index.html', 'logic.js', 'manifest.json', 'icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
```

- [ ] **Step 5: Run the checks to verify they pass**

1. `browser_navigate` `http://localhost:8080/`, then `browser_evaluate` →
   `async () => { await navigator.serviceWorker.ready; return (await caches.open('wt-v1').then(c => c.keys())).map(r => new URL(r.url).pathname).sort(); }`
   Expected: `["/", "/icon.png", "/index.html", "/logic.js", "/manifest.json"]`
2. Offline: stop the dev server (kill the background task), then `browser_navigate` `http://localhost:8080/` →
   `browser_evaluate` → `() => document.getElementById('wt-latest').textContent || document.getElementById('wt-empty').textContent`
   Expected: non-empty text (the page loaded from cache with the server down).
3. Restart the dev server.

- [ ] **Step 6: Commit**

```bash
git add manifest.json icon.png sw.js
git commit -m "feat: installable offline PWA (manifest, icon, service worker)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Publish to GitHub Pages + iPhone check

**Files:** none (deployment only).

**Interfaces:**
- Consumes: the committed `main` branch from Tasks 1–3.
- Produces: `https://olekleklek.github.io/weight-tracker/`.

- [ ] **Step 1: Install the GitHub CLI**

```bash
winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
```

The current shell won't see the new PATH. Shell variables don't persist between Bash calls, so start each command in this task with `GH="/c/Program Files/GitHub CLI/gh.exe";`.

- [ ] **Step 2: User signs in (interactive; only the user can do this).** Ask the user to type:

```
! "C:\Program Files\GitHub CLI\gh.exe" auth login --web --git-protocol https
```

Verify: `"$GH" auth status` shows `Logged in to github.com account olekleklek`.

- [ ] **Step 3: Create the repo and push.** This is outward-facing, so confirm with the user right before running it.

```bash
"$GH" repo create weight-tracker --public --source . --remote origin --push
```

Expected: `https://github.com/olekleklek/weight-tracker` and branch `main` pushed.

- [ ] **Step 4: Enable Pages**

```bash
"$GH" api -X POST repos/olekleklek/weight-tracker/pages -f "source[branch]=main" -f "source[path]=/"
```

- [ ] **Step 5: Verify it's live** (the first build takes about 1–2 minutes; re-check rather than sleeping):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://olekleklek.github.io/weight-tracker/
curl -s -o /dev/null -w "%{http_code}\n" https://olekleklek.github.io/weight-tracker/sw.js
```

Expected: `200` and `200`. Then `browser_navigate` to the live URL: it should show `Latest: 98.8 kg on 2026-10-09`.

- [ ] **Step 6: iPhone check (user).** Give the user these steps:
  1. Open `https://olekleklek.github.io/weight-tracker/` in **Safari**.
  2. Share → **Add to Home Screen** → Add.
  3. Open it from the home screen. It should be full screen and show 98.8 kg on 2026-10-09.
  4. Turn on airplane mode, force-quit the app, and reopen it. It should still open. Log a weight.
  5. Turn airplane mode off, then force-quit and reopen. The entry should still be there.
