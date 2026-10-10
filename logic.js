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
  // Dot decimals only: "90,4" is rejected, never converted (user decision 2026-10-10).
  const s = String(text == null ? '' : text).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Math.round(Number(s) * 10) / 10;
  return n > 0 && n < 1000 ? n : null;
}

// Entries are always logged for today: no past or future dates.
function validateEntry(weightText, today) {
  const weight = parseWeight(weightText);
  if (weight === null) return { error: 'Enter a valid weight first' };
  return { date: today, weight };
}

// Display only; storage keeps 'YYYY-MM-DD'. '2026-10-10' -> "Oct. 10, '26" (May has no period).
const MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
function fmtDate(date) {
  const [y, m, d] = date.split('-');
  return `${MONTHS[m - 1]} ${Number(d)}, '${y.slice(2)}`;
}

// One-time cleanup: drop entries dated before `date`.
function dropBefore(entries, date) {
  return entries.filter(e => e.date >= date);
}

// Seeds once. Once seeded (or data already exists) it never seeds again,
// so deleting every entry later stays empty.
function seedIfNeeded(entries, seeded) {
  return { entries: seeded || entries.length ? entries : [{ ...SEED }], seeded: true };
}

// Goal uses the weight rules (dot decimals, 0.1 rounding) but must be at least 1 kg.
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

// Restore confirmation names the backup's date range, so restoring an old file can't silently wipe newer entries.
function restorePrompt(currentCount, backup) {
  const count = n => n + (n === 1 ? ' entry' : ' entries');
  const first = fmtDate(backup.entries[0].date), last = fmtDate(backup.entries[backup.entries.length - 1].date);
  const skipped = backup.skipped ? ` (${backup.skipped} skipped)` : '';
  const range = first === last ? first : `${first} – ${last}`;
  return `Replace your ${count(currentCount)} with ${count(backup.entries.length)}${skipped} from ${range}?`;
}
