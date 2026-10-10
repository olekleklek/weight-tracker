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

// Zoom the chart to the logged weights (±0.5 kg). The goal joins the range only when it is
// within 1 kg of it; otherwise the UI shows a "Goal … ↓/↑" tag at the edge instead of a line.
function chartRange(weights, goal) {
  const r = v => Math.round(v * 10) / 10; // weights are 0.1 kg steps; rounding avoids float noise at the edges
  const min = r(Math.min(...weights) - 0.5), max = r(Math.max(...weights) + 0.5);
  if (goal == null) return { min, max, goalInRange: false, goalDir: null };
  if (goal >= r(min - 1) && goal <= r(max + 1)) {
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
  if (cheeredToday && loggedToday) return 'cheering'; // stops cheering if today's entry is deleted
  if (!loggedToday && info.days > 0 && info.saves < STREAK_SAVES) return 'resting';
  return 'happy';
}

// Restore confirmation names the backup's date range, so restoring an old file can't silently wipe newer entries.
function restorePrompt(currentCount, backup) {
  const count = n => n + (n === 1 ? ' entry' : ' entries');
  const first = fmtDate(backup.entries[0].date), last = fmtDate(backup.entries[backup.entries.length - 1].date);
  const skipped = backup.skipped ? ` (${backup.skipped} skipped)` : '';
  const range = first === last ? first : `${first} – ${last}`;
  return `Replace your ${count(currentCount)} with ${count(backup.entries.length)}${skipped} from ${range}?`;
}

// Streak with 2 saves: walk every day from the first entry up to today (or yesterday if today
// isn't logged yet). A logged day adds 1; a missed day uses a save; a miss with no saves left
// resets the streak, and the new streak starts with 2 saves again.
const STREAK_SAVES = 2;
function streakInfo(entries, today) {
  let days = 0, saves = STREAK_SAVES;
  if (!entries.length) return { days, saves };
  const dates = new Set(entries.map(e => e.date));
  const end = new Date(today + 'T00:00:00');
  if (!dates.has(today)) end.setDate(end.getDate() - 1);
  const d = new Date(sortEntries(entries)[0].date + 'T00:00:00');
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    if (dates.has(ymd(d))) days++;
    else if (days > 0 && saves > 0) saves--;
    else { days = 0; saves = STREAK_SAVES; }
  }
  return { days, saves };
}

function streak(entries, today) {
  return streakInfo(entries, today).days;
}

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

// Congrats text after a successful log. prevWeight = the entry before this one (null if none).
function logMessage(weight, prevWeight, streakDays) {
  if (STREAK_MILESTONES.includes(streakDays)) return `🔥 ${streakDays}-day streak! Keep it up.`;
  if (prevWeight == null) return '🎉 First entry — great start!';
  const diff = +(weight - prevWeight).toFixed(1);
  if (diff < 0) return `🎉 Down ${Math.abs(diff).toFixed(1)} kg — nice work!`;
  if (diff > 0) return "✅ Logged. One day doesn't define you.";
  return '✅ Logged. Holding steady!';
}
