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

// iPhone home-screen apps resume without reloading. On a new day, move the date field
// to today unless the user picked a date themselves (field differs from the value the app set).
function resumeDate(fieldValue, autoValue, lastDay, today) {
  return lastDay !== today && fieldValue === autoValue ? today : fieldValue;
}

function nextLogDate(date, today) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const next = ymd(d);
  return next > today ? today : next;
}
