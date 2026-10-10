# Weight Tracker Part 3 (Redesign + Kilo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the app in the Garden look with Instrument Sans, add Kilo the turtle (he says the quote in the summary and is centred in the congrats pop-up), and zoom the chart to the user's weights with a goal tag.

**Architecture:** Same files. Pure logic (`chartRange`, updated `chartPoints`, `kiloMood`) goes in `logic.js` with tests in `test.html`. `index.html` gets a hidden SVG sprite (Kilo's three moods plus the flame), a new style block with the Garden tokens, and markup and JS changes. The font ships as `fonts/InstrumentSans.woff2` and is cached by `sw.js`. `icon.png` is re-rendered from the SVG with a browser screenshot.

**Tech Stack:** HTML, CSS, vanilla JS, inline SVG (`<use>`, filters, clip paths), WOFF2 web font, service worker.

**Spec:** `docs/superpowers/specs/2026-10-10-part3-redesign-design.md`

## Global Constraints

- Storage keys and formats unchanged: `weight-entries`, `weight-seeded`, `weight-cleanup-1`, `weight-goal`, `weight-theme`, `weight-view`. No new keys.
- One screen, and the page never scrolls (60 entries, Table and Chart views). Only the history scrolls.
- All existing behaviour stays as it is:
  - today-only logging, with the input and LOG disabled (not hidden) after logging, plus the "Logged today" note
  - the old edit sheet, the 2 streak saves, and the pop-up that only closes via "Nice!"/Enter/Escape
  - backup and restore, the goal, System/Light/Dark, and dot-only decimals
- No runtime requests to other hosts (no Google Fonts link). The font file is local.
- `sw.js` `CACHE` = `wt-v11`, and `FILES` includes `fonts/InstrumentSans.woff2`.
- Kilo artwork, colours and flame exactly as in the spec's "Kilo: artwork" section.
- The speech bubble's tail points at Kilo's head and ends short of it (visible gap, never touching).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Goal exactly at the edge of the zoom range** (e.g. weights 80/78 and a goal of 76.5): it should be treated as in range, so the dashed line shows and the tag doesn't. Covered by a test in Task 1.
2. **A single entry, or all weights equal:** the chart should not divide by zero, and the y labels should not show the same number twice. Covered by a test and a check in Task 1.
3. **Reopening the app the day after logging:** Kilo must not still be cheering, because the in-memory `cheeredOn` date no longer equals today. Covered by a test in Task 1 and a check in Task 3.
4. **The streak badge `4-day streak · 1 save left` at 390px wide:** it should wrap below the date, not squeeze or overflow it. Covered by a check in Task 3.
5. **The font fails to load (offline before the first cache):** the app should fall back to the system font with no error. Covered by a check in Task 2.

## Test commands

- **Logic:** `node "C:/Users/sevil/AppData/Local/Temp/claude/D--Olek-IT-vibe-coder-Weight-Tracker/3b10d1cd-e312-415d-9cb7-b19c6e279f56/scratchpad/run-tests.js"` from the project root, which prints `ALL PASS`. If the file is missing, recreate it as in the Part 2 plan's "Test commands" section.
- **Browser:** run the dev server in the background from the project root, then use the Playwright MCP tools at 390×844. Before the first check, clear the old service worker once, as in Part 2.

```bash
node -e "const h=require('http'),f=require('fs'),p=require('path');const t={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.woff2':'font/woff2'};h.createServer((q,s)=>{let u=decodeURIComponent(q.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';f.readFile(p.join('.',u),(e,d)=>{if(e){s.writeHead(404);return s.end()}s.writeHead(200,{'Content-Type':t[p.extname(u)]||'application/octet-stream','Cache-Control':'no-store'});s.end(d)})}).listen(8080,()=>console.log('http://localhost:8080'))"
```

Seed helper (paste into `browser_evaluate`): `(list) => { localStorage.setItem('weight-seeded','1'); localStorage.setItem('weight-cleanup-1','1'); localStorage.setItem('weight-entries', JSON.stringify({ entries: list, unit: 'kg' })); location.reload(); }`. In practice, pass an inline array in the function body.

---

### Task 1: Chart zoom + Kilo's mood (logic) and the chart drawing

**Files:**
- Modify: `test.html`, `logic.js`, `index.html` (only the `drawChart` function and two chart CSS rules)

**Interfaces:**
- Produces:
  - `chartRange(weights: number[], goal: number|null) → { min, max, goalInRange: boolean, goalDir: 'down'|'up'|null }`
  - `chartPoints(sorted, goal, width, height, pad, padBottom = pad) → { points, goalY: number|null, min, max, goalDir }`. `pad` is used for the top and the left/right; `padBottom` for the bottom.
  - `kiloMood(info: {days, saves}, loggedToday: boolean, cheeredToday: boolean) → 'happy'|'cheering'|'resting'`

- [ ] **Step 1: Write the failing tests.** In `test.html`, **replace** the three existing chart tests (`chart 2 entries`, `chart 1 entry centred`, `chart goal above weights`) with:

```js
  // chartRange: zoom to the weights; goal joins the range only if within 1 kg of it
  eq('range goal far below', chartRange([80, 78], 75), { min: 77.5, max: 80.5, goalInRange: false, goalDir: 'down' });
  eq('range goal near (in)', chartRange([80, 78], 77), { min: 76.5, max: 80.5, goalInRange: true, goalDir: null });
  eq('range goal exactly at edge (in)', chartRange([80, 78], 76.5), { min: 76, max: 80.5, goalInRange: true, goalDir: null });
  eq('range goal above', chartRange([80, 78], 100), { min: 77.5, max: 80.5, goalInRange: false, goalDir: 'up' });
  eq('range single weight = goal', chartRange([80], 80), { min: 79.5, max: 80.5, goalInRange: true, goalDir: null });

  // chartPoints (200×100, pad 10) uses chartRange; goalY null when the goal is out of range
  const two = [{ date: '2026-10-01', weight: 80 }, { date: '2026-10-11', weight: 78 }];
  eq('chart goal far below', chartPoints(two, 75, 200, 100, 10),
     { points: [{ x: 10, y: 23.3, date: '2026-10-01', weight: 80 }, { x: 190, y: 76.7, date: '2026-10-11', weight: 78 }],
       goalY: null, min: 77.5, max: 80.5, goalDir: 'down' });
  eq('chart goal near draws line', chartPoints(two, 77, 200, 100, 10),
     { points: [{ x: 10, y: 20, date: '2026-10-01', weight: 80 }, { x: 190, y: 60, date: '2026-10-11', weight: 78 }],
       goalY: 80, min: 76.5, max: 80.5, goalDir: null });
  eq('chart extra bottom padding', chartPoints(two, 75, 200, 100, 10, 30).points.map(p => p.y), [20, 60]);
  eq('chart 1 entry centred', chartPoints([{ date: '2026-10-01', weight: 80 }], 75, 200, 100, 10).points,
     [{ x: 100, y: 50, date: '2026-10-01', weight: 80 }]);

  // kiloMood
  eq('mood happy', kiloMood({ days: 3, saves: 2 }, false, false), 'happy');
  eq('mood resting (save used, not logged)', kiloMood({ days: 3, saves: 1 }, false, false), 'resting');
  eq('mood happy once logged', kiloMood({ days: 3, saves: 1 }, true, false), 'happy');
  eq('mood cheering after logging today', kiloMood({ days: 3, saves: 2 }, true, true), 'cheering');
  eq('mood not cheering next day', kiloMood({ days: 4, saves: 2 }, false, false), 'happy');
  eq('mood no streak', kiloMood({ days: 0, saves: 2 }, false, false), 'happy');
```

- [ ] **Step 2: Run the tests to verify they fail.** Run the logic test command.
Expected: `ERROR chartRange is not defined`

- [ ] **Step 3: Implement.** In `logic.js`, replace the whole `chartPoints` function (from its comment line `// Chart geometry:` through its closing `}`) with:

```js
// Zoom the chart to the logged weights (±0.5 kg). The goal joins the range only when it is
// within 1 kg of it; otherwise the UI shows a "Goal … ↓/↑" tag at the edge instead of a line.
function chartRange(weights, goal) {
  const min = Math.min(...weights) - 0.5, max = Math.max(...weights) + 0.5;
  if (goal == null) return { min, max, goalInRange: false, goalDir: null };
  if (goal >= min - 1 && goal <= max + 1) {
    return { min: Math.min(min, goal - 0.5), max: Math.max(max, goal + 0.5), goalInRange: true, goalDir: null };
  }
  return { min, max, goalInRange: false, goalDir: goal < min ? 'down' : 'up' };
}

// Chart geometry: x proportional to date; y over chartRange. `pad` = top and sides, `padBottom` = bottom.
function chartPoints(sorted, goal, width, height, pad, padBottom = pad) {
  const r = v => Math.round(v * 10) / 10;
  const range = chartRange(sorted.map(e => e.weight), goal);
  const { min, max } = range;
  const t0 = Date.parse(sorted[0].date), t1 = Date.parse(sorted[sorted.length - 1].date);
  const x = t => t1 === t0 ? width / 2 : pad + (t - t0) / (t1 - t0) * (width - 2 * pad);
  const y = w => pad + (max - w) / (max - min) * (height - pad - padBottom);
  return {
    points: sorted.map(e => ({ x: r(x(Date.parse(e.date))), y: r(y(e.weight)), date: e.date, weight: e.weight })),
    goalY: range.goalInRange ? r(y(goal)) : null,
    min, max,
    goalDir: range.goalDir
  };
}

// Kilo's mood on the main screen.
function kiloMood(info, loggedToday, cheeredToday) {
  if (cheeredToday) return 'cheering';
  if (!loggedToday && info.days > 0 && info.saves < STREAK_SAVES) return 'resting';
  return 'happy';
}
```

`STREAK_SAVES` is defined later in `logic.js`. It's only read when `kiloMood` runs, so the order is fine.

- [ ] **Step 4: Run the tests to verify they pass.** Expected: `ALL PASS`

- [ ] **Step 5: Draw the zoomed chart.** In `index.html`, replace the whole `function drawChart() { … }` with:

```js
  function drawChart() {
    if (chartBox.hidden || historyEl.hidden) return;
    const sorted = sortEntries(entries);
    const w = chartSvg.clientWidth, h = chartSvg.clientHeight, pad = 36;
    if (!sorted.length || !w || !h) return;
    const ws = sorted.map(e => e.weight);
    const dir = chartRange(ws, goal).goalDir;
    // Leave room for the goal tag: above the date labels when the goal is below, at the top when above.
    const padTop = dir === 'up' ? 40 : pad, padBottom = dir === 'down' ? 62 : pad;
    const c = chartPoints(sorted, goal, w, h, padTop, padBottom);
    const ys = c.points.map(p => p.y);
    const hi = Math.max(...ws), lo = Math.min(...ws);
    const first = sorted[0].date, last = sorted[sorted.length - 1].date;
    let goalSvg;
    if (c.goalY !== null) {
      goalSvg = `<line class="goal" x1="${padTop}" x2="${w - padTop}" y1="${c.goalY}" y2="${c.goalY}"/>` +
        `<text class="goal-label" x="${w - padTop}" y="${c.goalY - 6}" text-anchor="end">Goal ${goal} kg</text>`;
    } else {
      const toGo = Math.abs(ws[ws.length - 1] - goal).toFixed(1);
      const label = `Goal ${goal} kg ${c.goalDir === 'down' ? '↓' : '↑'} · ${toGo} kg to go`;
      const tw = label.length * 6.2 + 16, ty = c.goalDir === 'down' ? h - 52 : 8;
      goalSvg = `<rect class="goal-tag" x="${w - 6 - tw}" y="${ty}" width="${tw}" height="20" rx="10"/>` +
        `<text class="goal-tag-text" x="${w - 6 - tw / 2}" y="${ty + 14}" text-anchor="middle">${label}</text>`;
    }
    chartSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    chartSvg.innerHTML = goalSvg +
      (c.points.length > 1 ? `<polyline class="line" points="${c.points.map(p => `${p.x},${p.y}`).join(' ')}"/>` : '') +
      c.points.map(p => `<circle class="dot" cx="${p.x}" cy="${p.y}" r="3.5"/>`).join('') +
      // y labels: the real highest and lowest logged weights, at their own heights
      `<text class="axis" x="2" y="${Math.min(...ys)}" dominant-baseline="middle">${hi.toFixed(1)}</text>` +
      (hi !== lo ? `<text class="axis" x="2" y="${Math.max(...ys)}" dominant-baseline="middle">${lo.toFixed(1)}</text>` : '') +
      `<text class="axis" x="${padTop}" y="${h - 8}">${fmtDate(first)}</text>` +
      (first !== last ? `<text class="axis" x="${w - padTop}" y="${h - 8}" text-anchor="end">${fmtDate(last)}</text>` : '');
    chartNote.hidden = sorted.length > 1;
  }
```

And add these CSS rules after `.chart .axis { … }`:

```css
  .chart .goal-tag { fill: var(--surface-1); stroke: var(--border-strong); stroke-width: 1; }
  .chart .goal-tag-text { fill: var(--loss); font-size: 11px; font-weight: 600; }
```

- [ ] **Step 6: Browser checks** (dev server running, 390×844, Chart view)
  1. Seed `[{date:'2026-10-05',weight:99.4},{date:'2026-10-07',weight:99.1},{date:'2026-10-09',weight:98.8},{date:'2026-10-10',weight:98.3}]` and set `localStorage['weight-view']='chart'`, `localStorage['weight-goal']='75'`, then reload. Then:
     `() => { const t = document.querySelector('#wt-chart-svg .goal-tag-text'); const ys = [...document.querySelectorAll('#wt-chart-svg .dot')].map(c => +c.getAttribute('cy')); const dates = [...document.querySelectorAll('#wt-chart-svg .axis')].filter(e => e.getAttribute('y') > 100); const tag = document.querySelector('#wt-chart-svg .goal-tag').getBBox(); return { tag: t && t.textContent, line: !!document.querySelector('#wt-chart-svg .goal'), spread: Math.max(...ys) - Math.min(...ys), tagBottom: tag.y + tag.height, dateTop: Math.min(...dates.map(d => d.getBBox().y)) }; }`
     Expected:
     - `tag`: `"Goal 75 kg ↓ · 23.3 kg to go"`
     - `line`: `false`
     - `spread` > 80 (not flat)
     - `tagBottom` < `dateTop` (no overlap)
  2. Set the goal to 98 (`localStorage['weight-goal']='98'`) and reload. Expect a `.goal` line to be present, no `.goal-tag-text`, and the label `Goal 98 kg`.
  3. Single entry (Review Focus 2): seed one entry and reload. Expect one `.dot`, one y-axis label with a value, and `#wt-chart-note` visible.
  4. Take a screenshot of the chart, read it, and confirm the line is clearly not flat.

- [ ] **Step 7: Commit**

```bash
git add logic.js test.html index.html
git commit -m "feat: chart zooms to logged weights with a goal tag; kiloMood logic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Garden look + Instrument Sans

**Files:**
- Create: `fonts/InstrumentSans.woff2`
- Modify: `index.html` (the whole `<style>` block and the `theme-color` meta), `manifest.json`, `sw.js` (`FILES` only)

**Interfaces:**
- Produces: CSS classes used by Task 3: `.card-top`, `.streak`, `.flame-icon`, `.say`, `.bubble`, `.kilo`, `.kilo-pop`. The tokens are `--accent`, `--on-accent`, `--streak-bg`, `--quote`, `--surface-2`.

- [ ] **Step 1: Write the failing check.** `() => document.fonts.check('16px "Instrument Sans"') && getComputedStyle(document.body).backgroundColor`
Expected: `false`

- [ ] **Step 2: Download the font.** Use the latin subset of the variable font:

```bash
mkdir -p fonts && CSS=$(curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&display=swap") && URL=$(printf '%s' "$CSS" | awk '/\/\* latin \*\//{f=1} f && /src:/{match($0,/https:[^)]+/); print substr($0,RSTART,RLENGTH); exit}') && echo "$URL" && curl -s -o fonts/InstrumentSans.woff2 "$URL" && ls -l fonts/InstrumentSans.woff2
```

Expected: a `fonts.gstatic.com/...woff2` URL and a file of roughly 20–80 KB. Instrument Sans is SIL Open Font License, which allows bundling.

- [ ] **Step 3: Replace the whole `<style>…</style>` block** in `index.html` with:

```html
<style>
  @font-face {
    font-family: 'Instrument Sans';
    src: url('fonts/InstrumentSans.woff2') format('woff2');
    font-weight: 400 700; font-style: normal; font-display: swap;
  }
  :root {
    color-scheme: light dark;
    --bg: #F6F1E7; --surface-1: #FFFFFF; --surface-2: #F1EBDD;
    --border: #E3DACA; --border-strong: #D2C7B2;
    --text: #2B2A24; --text-secondary: #6B675C; --text-muted: #9A9483; --text-danger: #B3261E;
    --accent: #2F5D3A; --on-accent: #FFFFFF; --loss: #3E7A4A; --gain: #C2622D;
    --streak-bg: #FBF3E8; --quote: #2F5D3A; --row-alt: #FBF8F1;
  }
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #171611; --surface-1: #22201A; --surface-2: #2B2820;
    --border: #3A362C; --border-strong: #4A4538;
    --text: #EDE6D6; --text-secondary: #B8B0A0; --text-muted: #8C8576; --text-danger: #F2B8B5;
    --accent: #6FAE6A; --on-accent: #10200F; --loss: #8FD08A; --gain: #F0A57A;
    --streak-bg: #3A2A1E; --quote: #A9D7A0; --row-alt: #26231C;
  }
  @media (prefers-color-scheme: dark) {
    :root[data-theme="system"] {
      --bg: #171611; --surface-1: #22201A; --surface-2: #2B2820;
      --border: #3A362C; --border-strong: #4A4538;
      --text: #EDE6D6; --text-secondary: #B8B0A0; --text-muted: #8C8576; --text-danger: #F2B8B5;
      --accent: #6FAE6A; --on-accent: #10200F; --loss: #8FD08A; --gain: #F0A57A;
      --streak-bg: #3A2A1E; --quote: #A9D7A0; --row-alt: #26231C;
    }
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font-family: 'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    /* Top padding leaves a 44px lane for the fixed ⚙ button so it never covers the card. */
    --pad-top: calc(max(8px, env(safe-area-inset-top)) + 52px);
    padding: var(--pad-top) max(16px, env(safe-area-inset-right))
             max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }
  /* One screen, no page scroll: the group is centred vertically; once the history outgrows
     the space, only the history scrolls (cards and summary stay put). */
  main {
    max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; gap: 12px;
    height: calc(100svh - var(--pad-top) - max(16px, env(safe-area-inset-bottom)));
  }
  main > * { flex-shrink: 0; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 16px; padding: 14px; }
  /* date + streak badge row; wraps so a long badge drops below the date instead of squeezing it */
  .card-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; margin-bottom: 10px; }
  .today { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-secondary); }
  #wt-today { color: var(--loss); } /* same green as weight lost in the Change column */
  .streak {
    display: inline-flex; align-items: center; gap: 5px; margin: 0; padding: 3px 10px 3px 6px; border-radius: 999px;
    background: var(--streak-bg); color: var(--gain); font-size: 13px; font-weight: 700; white-space: nowrap;
  }
  .flame-icon { width: 14px; height: 16px; flex-shrink: 0; overflow: visible; }
  .done { margin-top: 10px; }
  .done p { margin: 0; font-size: 13px; }
  .weight input:disabled, #wt-submit:disabled { opacity: 0.45; cursor: not-allowed; }
  #wt-done-weight { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
  .congrats {
    position: fixed; z-index: 12; left: 50%; top: 50%; transform: translate(-50%, -50%);
    width: min(320px, calc(100vw - 32px)); display: flex; flex-direction: column; align-items: center; gap: 12px;
    padding: 20px 18px 18px; border-radius: 22px; text-align: center;
    background: var(--surface-1); box-shadow: 0 10px 30px rgb(0 0 0 / 0.3);
  }
  .congrats p { margin: 0; }
  #wt-congrats-msg { font-size: 17px; font-weight: 700; line-height: 1.35; }
  .kilo-pop { width: 150px; height: auto; overflow: visible; filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.16)); }
  .entry { display: flex; gap: 8px; align-items: center; }
  .weight { flex: 1; position: relative; }
  .weight input {
    width: 100%; height: 52px; border: 1px solid var(--border-strong); border-radius: 12px; padding: 0 40px 0 14px;
    color: var(--text); background: var(--surface-2); font-family: inherit; font-size: 18px; font-weight: 500;
    min-width: 0; -webkit-appearance: none; appearance: none;
  }
  .weight span { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 14px; color: var(--text-secondary); pointer-events: none; }
  /* Same 52px height as the weight input; narrow and lighter. */
  #wt-submit {
    width: 72px; height: 52px; margin: 0; padding: 0; border: none; border-radius: 12px; flex-shrink: 0;
    background: var(--accent); color: var(--on-accent); font-family: inherit; font-size: 15px; font-weight: 700;
    line-height: 1; letter-spacing: 0.3px; cursor: pointer; -webkit-appearance: none; appearance: none;
  }
  .error { margin: 8px 0 0; min-height: 1em; text-align: right; font-size: 13px; color: var(--text-danger); }
  .warn { margin: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--text-danger); background: var(--surface-1); color: var(--text-danger); font-size: 14px; }
  .table-wrap {
    flex-shrink: 1; min-height: 0; overflow: auto; -webkit-overflow-scrolling: touch;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--text-secondary); font-weight: 600; font-size: 12.5px; position: sticky; top: 0; background: var(--surface-1); }
  td:nth-child(2) { font-weight: 600; }
  tr.alt td { background: var(--row-alt); }
  tbody tr { cursor: pointer; }
  tbody tr:last-child td { border-bottom: none; }
  .sort { all: unset; cursor: pointer; }
  .gain { color: var(--gain); } .loss { color: var(--loss); } .muted { color: var(--text-muted); }
  .summary { background: var(--surface-1); border: 1px solid var(--border); border-radius: 16px; padding: 14px; }
  #wt-latest { margin: 0; font-size: 15px; font-weight: 700; }
  #wt-delta { margin: 3px 0 0; font-size: 14px; color: var(--text-secondary); }
  /* Kilo says the quote: bubble on the left, Kilo on the right, tail aimed at his head with a gap */
  .say { display: flex; align-items: flex-end; gap: 10px; margin-top: 10px; }
  .bubble {
    position: relative; flex: 1; margin: 0 0 26px; padding: 9px 12px; border-radius: 14px;
    background: var(--surface-2); color: var(--quote); font-size: 14px; font-style: italic; line-height: 1.35;
  }
  /* smooth curved tail (iMessage style) sweeping toward Kilo; it stops short of his head */
  .bubble::before {
    content: ''; position: absolute; right: -7px; bottom: 0; width: 20px; height: 18px;
    background: var(--surface-2); border-bottom-left-radius: 16px 14px;
  }
  .bubble::after {
    content: ''; position: absolute; right: -10px; bottom: 0; width: 10px; height: 18px;
    background: var(--surface-1); border-bottom-left-radius: 10px;
  }
  .kilo { width: 62px; height: auto; flex-shrink: 0; overflow: visible; filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.12)); }
  #wt-empty { text-align: center; color: var(--text-muted); font-size: 14px; }
  /* ⚙ fixed to the top-right of the screen, outside the logging card, clear of the notch. */
  .icon-btn {
    all: unset; cursor: pointer; width: 44px; height: 44px; border-radius: 10px;
    display: grid; place-items: center; font-size: 22px; color: var(--text-secondary);
  }
  .settings-btn {
    position: fixed; z-index: 5;
    top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right));
  }
  .backdrop { position: fixed; inset: 0; z-index: 10; background: rgb(0 0 0 / 0.45); }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 11; max-width: 560px; margin: 0 auto;
    max-height: 90svh; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;
    background: var(--surface-1); border-radius: 20px 20px 0 0;
    padding: 20px 16px max(20px, env(safe-area-inset-bottom));
  }
  .sheet h2 { margin: 0; font-size: 18px; }
  .sheet .error { margin: 0; text-align: left; }
  .row { display: flex; gap: 8px; align-items: center; }
  .field { display: flex; flex-direction: column; gap: 8px; }
  .label, .field label { font-size: 14px; color: var(--text-secondary); }
  .grow { flex: 1; }
  .btn {
    height: 52px; padding: 0 18px; border: none; border-radius: 12px; cursor: pointer;
    background: var(--accent); color: var(--on-accent); font-family: inherit; font-size: 16px; font-weight: 700;
  }
  .btn-secondary { background: var(--surface-2); color: var(--text); border: 1px solid var(--border-strong); }
  .btn-danger { background: transparent; color: var(--text-danger); border: 1px solid var(--text-danger); }
  .btn-wide { width: 100%; }
  .seg { display: flex; padding: 3px; border-radius: 12px; background: var(--surface-2); }
  .seg button {
    all: unset; flex: 1; text-align: center; padding: 9px 0; border-radius: 9px; cursor: pointer;
    font-size: 14px; color: var(--text);
  }
  .seg button[aria-checked="true"] { background: var(--surface-1); font-weight: 600; box-shadow: 0 1px 3px rgb(0 0 0 / 0.14); }
  .history { flex-shrink: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  .chart {
    height: 280px; min-height: 160px; flex-shrink: 1; display: flex; flex-direction: column;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; padding: 8px;
  }
  .chart svg { flex: 1; width: 100%; min-height: 0; }
  .chart p { margin: 0; text-align: center; font-size: 13px; }
  .chart .line { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round; }
  .chart .dot { fill: var(--accent); }
  .chart .goal { stroke: var(--loss); stroke-width: 1.5; stroke-dasharray: 6 5; }
  .chart .goal-label { fill: var(--loss); font-size: 12px; }
  .chart .axis { fill: var(--text-muted); font-size: 11px; }
  .chart .goal-tag { fill: var(--surface-1); stroke: var(--border-strong); stroke-width: 1; }
  .chart .goal-tag-text { fill: var(--loss); font-size: 11px; font-weight: 600; }
</style>
```

Then change `<meta name="theme-color" content="#26215C">` to `<meta name="theme-color" content="#F6F1E7">`.

- [ ] **Step 4: Manifest and cache list.**
  - In `manifest.json`, set `"background_color": "#F6F1E7"` and `"theme_color": "#2F5D3A"`.
  - In `sw.js`, change `FILES` to `['./', 'index.html', 'logic.js', 'manifest.json', 'icon.png', 'fonts/InstrumentSans.woff2']`.

- [ ] **Step 5: Run the checks to verify they pass** (390×844)
  1. `async () => { await document.fonts.ready; return [document.fonts.check('16px "Instrument Sans"'), getComputedStyle(document.body).backgroundColor, getComputedStyle(document.getElementById('wt-submit')).backgroundColor]; }` → `[true, "rgb(246, 241, 231)", "rgb(47, 93, 58)"]`
  2. Dark: with `browser_emulate_media` `colorScheme: 'dark'` and theme System, the body background is `rgb(23, 22, 17)` and LOG is `rgb(111, 174, 106)`.
  3. Font fallback (Review Focus 5): temporarily rename `fonts/InstrumentSans.woff2`, reload, and check the console shows no JS errors and the page renders (the `#wt-today` text is present). Then rename it back.
  4. Take screenshots in light and dark and read them: cream and moss, no purple anywhere.
  5. Run the logic test command → `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add fonts/InstrumentSans.woff2 index.html manifest.json sw.js
git commit -m "feat: Garden palette and bundled Instrument Sans

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Kilo, the flame, the speech bubble and the centred pop-up

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `kiloMood`, `streakInfo`, `STREAK_SAVES` (logic). CSS classes from Task 2.
- Produces: the SVG sprite ids `kilo-sticker`, `kilo-collar`, `kilo-head`, `kilo-eyes`, `flame`, `kilo-happy`, `kilo-cheering`, `kilo-resting`. The elements `#wt-kilo`, `#wt-kilo-use`, `#wt-kilo-z`, `#wt-streak-text`, `#wt-congrats-streak-text`.

- [ ] **Step 1: Write the failing check.** `() => [!!document.getElementById('wt-kilo'), !!document.getElementById('flame')]` → Expected: `[false, false]`

- [ ] **Step 2: SVG sprite.** Insert this directly after `<body>`:

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <filter id="kilo-sticker" x="-20%" y="-20%" width="140%" height="140%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="d"/>
      <feFlood flood-color="#ffffff"/><feComposite in2="d" operator="in" result="o"/>
      <feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="kilo-head-clip"><ellipse cx="75" cy="72" rx="56" ry="50"/></clipPath>
    <clipPath id="kilo-collar-clip"><ellipse cx="75" cy="123" rx="32" ry="10"/></clipPath>
    <g id="kilo-collar">
      <ellipse cx="75" cy="123" rx="32" ry="10" fill="#F3E3B5"/>
      <g clip-path="url(#kilo-collar-clip)" stroke-width="2.4"><path d="M57 110 V136 M75 110 V136 M93 110 V136" fill="none"/></g>
      <ellipse cx="75" cy="123" rx="32" ry="10" fill="none"/>
    </g>
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
    <g id="kilo-happy" stroke="#24452C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
      <use href="#kilo-collar"/><use href="#kilo-head"/><use href="#kilo-eyes"/>
      <path d="M62 102 Q75 113 88 102" fill="none"/>
    </g>
    <g id="kilo-cheering" stroke="#24452C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
      <use href="#kilo-collar"/><use href="#kilo-head"/>
      <path d="M44 80 Q56 68 68 80 M82 80 Q94 68 106 80" fill="none"/>
      <path d="M58 98 Q75 120 92 98 Z" fill="#B5523A"/>
      <g transform="translate(122 2) scale(.55)"><use href="#flame"/></g>
    </g>
    <g id="kilo-resting" stroke="#24452C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
      <use href="#kilo-collar"/><use href="#kilo-head"/>
      <path d="M44 78 Q56 88 68 78 M82 78 Q94 88 106 78" fill="none"/>
      <path d="M68 104 Q75 108 82 104" fill="none"/>
    </g>
  </defs>
</svg>
```

- [ ] **Step 3: Markup.**
  - In the log `<section class="card">`, replace
    `<p id="wt-streak" class="streak" hidden></p>` + newline + `<p id="wt-today" class="today"></p>` with:

```html
    <div class="card-top">
      <p id="wt-today" class="today"></p>
      <p id="wt-streak" class="streak" hidden><svg class="flame-icon" viewBox="0 0 60 68" aria-hidden="true"><use href="#flame"/></svg><span id="wt-streak-text"></span></p>
    </div>
```

  - Replace the summary block `<div id="wt-summary" class="summary" hidden> … </div>` with:

```html
  <div id="wt-summary" class="summary" hidden>
    <p id="wt-latest"></p>
    <p id="wt-delta"></p>
    <div class="say">
      <p id="wt-quote" class="bubble"></p>
      <svg id="wt-kilo" class="kilo" viewBox="0 0 150 140" role="img" aria-label="Kilo the turtle">
        <g filter="url(#kilo-sticker)"><use id="wt-kilo-use" href="#kilo-happy"/></g>
        <g id="wt-kilo-z" hidden font-family="Instrument Sans, sans-serif" font-weight="700" fill="currentColor" style="color: var(--accent)">
          <text x="118" y="22" font-size="22">z</text><text x="134" y="8" font-size="15" opacity=".7">z</text>
        </g>
      </svg>
    </div>
  </div>
```

  - Replace the congrats block's content (between `<div id="wt-congrats" …>` and its `</div>`) with:

```html
  <svg class="kilo-pop" viewBox="0 0 150 140" aria-hidden="true"><g filter="url(#kilo-sticker)"><use href="#kilo-cheering"/></g></svg>
  <p id="wt-congrats-msg"></p>
  <p id="wt-congrats-streak" class="streak" hidden><svg class="flame-icon" viewBox="0 0 60 68" aria-hidden="true"><use href="#flame"/></svg><span id="wt-congrats-streak-text"></span></p>
  <button type="button" id="wt-congrats-ok" class="btn btn-wide">Nice!</button>
```

- [ ] **Step 4: Script.**
  - In `showToday()`, replace the line
    `streakEl.textContent = \`🔥 ${days}-day streak\` + (saves < STREAK_SAVES ? \` · ${saves} save${saves === 1 ? '' : 's'} left\` : '');`
    with:

```js
    streakText.textContent = `${days}-day streak` + (saves < STREAK_SAVES ? ` · ${saves} save${saves === 1 ? '' : 's'} left` : '');
```

    And at the end of `showToday()` (after the `if (todays) { … }` line), add:

```js
    // Kilo's mood: cheering after today's log, resting while a save is in use, happy otherwise.
    const mood = kiloMood({ days, saves }, !!todays, cheeredOn === now);
    kiloUse.setAttribute('href', `#kilo-${mood}`);
    kiloZ.toggleAttribute('hidden', mood !== 'resting');
```

  - Change `const doneEl = $('wt-done'), doneWeight = $('wt-done-weight'), submitBtn = $('wt-submit');` to:

```js
  const doneEl = $('wt-done'), doneWeight = $('wt-done-weight'), submitBtn = $('wt-submit');
  const streakText = $('wt-streak-text'), kiloUse = $('wt-kilo-use'), kiloZ = $('wt-kilo-z');
  let cheeredOn = null; // date of today's successful log (memory only), so Kilo cheers for the rest of that day
```

  - In `showCongrats`, replace `congratsStreak.textContent = \`🔥 ${days}-day streak\`;` with `$('wt-congrats-streak-text').textContent = \`${days}-day streak\`;`
  - In the form submit handler, replace `render();` (the one right after `weightInput.value = '';`) with:

```js
    cheeredOn = result.date;
    render();
```

- [ ] **Step 5: Run the checks to verify they pass** (390×844, light, then dark)
  1. Seed `[{date:'2026-10-08',weight:98.8},{date:'2026-10-09',weight:98.6}]` and reload. Check `() => [document.getElementById('wt-kilo-use').getAttribute('href'), document.getElementById('wt-kilo-z').hasAttribute('hidden'), document.getElementById('wt-streak-text').textContent]` → `["#kilo-happy", true, "2-day streak"]`
  2. Bubble gap: `() => { const b = document.getElementById('wt-quote').getBoundingClientRect(), k = document.getElementById('wt-kilo').getBoundingClientRect(); return Math.round(k.left - (b.right + 10)); }` → a value **≥ 0** (the curved tail, which reaches 10px past the bubble, ends before Kilo's box).
  3. Resting: seed `[{date:'2026-10-06',weight:99},{date:'2026-10-07',weight:98.9},{date:'2026-10-08',weight:98.8}]` (Oct. 9 missed, today not logged) and reload. Expect `["#kilo-resting", false, "3-day streak · 1 save left"]`.
  4. Badge wrap (Review Focus 4): in that state, `() => { const t = document.getElementById('wt-today'), s = document.getElementById('wt-streak'); return [t.scrollWidth <= t.clientWidth, t.getBoundingClientRect().height < 26, s.getBoundingClientRect().right <= document.querySelector('.card').getBoundingClientRect().right]; }` → `[true, true, true]`
  5. Log and pop-up: type `98.6` and submit. Check `() => [!document.getElementById('wt-congrats').hidden, document.querySelector('.kilo-pop').getBoundingClientRect().left + document.querySelector('.kilo-pop').getBoundingClientRect().width / 2 - innerWidth / 2]` → `[true, ≈0]`, meaning Kilo's centre is within ±2px of the screen centre. Click "Nice!" and expect `#wt-kilo-use` href = `#kilo-cheering`.
  6. Next day (Review Focus 3): `cheeredOn` is in memory only. Reload the page (simulating a new launch) and expect href = `#kilo-happy` (logged today, no save in use).
  7. Take screenshots: the main screen in light and dark, the pop-up, and Resting. Read them and confirm:
     - Kilo matches the approved art, with the white sticker edge
     - the flame shows in the badges
     - the bubble's tail points at Kilo's head with a gap
     - no emoji 🔥 remains
  8. Run the logic test command → `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: Kilo says the quote, flame streak badge, centred cheering Kilo in the pop-up

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Home-screen icon (Kilo with the sticker border)

**Files:**
- Create (scratch, git-ignored): `.playwright-mcp/icon-src.html`
- Modify: `icon.png`

- [ ] **Step 1: Write the icon source page** to `.playwright-mcp/icon-src.html`:

```html
<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 180px; height: 180px; background: #2F5D3A; overflow: hidden; }
  svg { position: absolute; left: 20px; top: 26px; width: 140px; height: auto; overflow: visible; }
</style></head><body>
<svg viewBox="0 0 150 140">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="d"/>
      <feFlood flood-color="#ffffff"/><feComposite in2="d" operator="in" result="o"/>
      <feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="hc"><ellipse cx="75" cy="72" rx="56" ry="50"/></clipPath>
    <clipPath id="cc"><ellipse cx="75" cy="123" rx="32" ry="10"/></clipPath>
  </defs>
  <g filter="url(#s)" stroke="#24452C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="75" cy="123" rx="32" ry="10" fill="#F3E3B5"/>
    <g clip-path="url(#cc)" stroke-width="2.4"><path d="M57 110 V136 M75 110 V136 M93 110 V136" fill="none"/></g>
    <ellipse cx="75" cy="123" rx="32" ry="10" fill="none"/>
    <ellipse cx="75" cy="72" rx="56" ry="50" fill="#A8D88F" stroke="none"/>
    <g clip-path="url(#hc)"><path d="M10 50 Q75 22 140 50" fill="none" stroke="#24452C" stroke-width="17"/><path d="M10 50 Q75 22 140 50" fill="none" stroke="#D8643A" stroke-width="11"/></g>
    <ellipse cx="75" cy="72" rx="56" ry="50" fill="none"/>
    <g stroke-width="2.8">
      <ellipse cx="56" cy="76" rx="13" ry="16" fill="#fff"/><circle cx="58" cy="80" r="4" fill="#1D1D1B" stroke="none"/><circle cx="59.5" cy="78" r="1.4" fill="#fff" stroke="none"/>
      <ellipse cx="94" cy="76" rx="13" ry="16" fill="#fff"/><circle cx="96" cy="80" r="4" fill="#1D1D1B" stroke="none"/><circle cx="97.5" cy="78" r="1.4" fill="#fff" stroke="none"/>
    </g>
    <path d="M62 102 Q75 113 88 102" fill="none"/>
  </g>
</svg>
</body></html>
```

- [ ] **Step 2: Render it.** With the dev server running:
  - `browser_resize` 180×180
  - `browser_navigate` `http://localhost:8080/.playwright-mcp/icon-src.html`
  - `browser_take_screenshot` with `scale: 'css'` and `filename: 'icon.png'`, which overwrites the project's `icon.png`

  Then confirm the size: `node -e "const b=require('fs').readFileSync('icon.png');console.log(b.readUInt32BE(16), b.readUInt32BE(20))"` → `180 180`.

- [ ] **Step 3: Check it.** Read `icon.png` and confirm:
  - Kilo is centred on moss green
  - the **white sticker border** is visible all around him
  - nothing is clipped
  - the size is 180×180

  Then resize the browser back to 390×844.

- [ ] **Step 4: Commit**

```bash
git add icon.png
git commit -m "feat: home-screen icon is Kilo with his white sticker border

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: One-screen check, cache bump, deploy

**Files:**
- Modify: `sw.js`

- [ ] **Step 1: One-screen check with 60 entries** (same seed snippet as Part 2, Task 6). Run it in Table and then Chart view, in light and dark:
`() => { const vis = el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }; return { pageScrolls: document.scrollingElement.scrollHeight > innerHeight + 1, card: vis(document.querySelector('.card')), summary: vis(document.getElementById('wt-summary')), kilo: vis(document.getElementById('wt-kilo')) }; }`
Expected each time: `{ pageScrolls: false, card: true, summary: true, kilo: true }`. Take screenshots and read them.

- [ ] **Step 2: Bump the cache.** In `sw.js`, change `const CACHE = 'wt-v10';` to `const CACHE = 'wt-v11';`. `FILES` already includes the font from Task 2.

- [ ] **Step 3: Run the logic test command** → `ALL PASS`. Then commit:

```bash
git add sw.js
git commit -m "chore: bump cache to wt-v11 for the redesign

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Deploy (after the final review; the user has approved automatic deploys).** Merge to `main`, then `git push`, then poll until live:
`for i in $(seq 1 30); do curl -s "https://olekleklek.github.io/weight-tracker/sw.js?$i" | grep -q "wt-v11" && { echo LIVE; break; }; sleep 15; done`
Also `curl -s -o /dev/null -w "%{http_code}" https://olekleklek.github.io/weight-tracker/fonts/InstrumentSans.woff2` → `200`.

- [ ] **Step 5: iPhone check (user, required by the design rules):**
  1. Open the app, close it, and reopen it to update.
  2. Kilo and the flame look right in light and dark.
  3. The bubble's tail points at Kilo.
  4. Log a weight and see centred cheering Kilo.
  5. **Remove and re-add the home-screen icon** to see the new Kilo icon. iOS caches the old icon. Back up first via ⚙ → Backup, because removing the icon deletes the app's data. Then restore the backup after re-adding.
