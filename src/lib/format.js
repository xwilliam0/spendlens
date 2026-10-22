// Money and date helpers.
//
// Money is always stored as integer cents to avoid floating point drift
// (0.1 + 0.2 !== 0.3). Dates are stored as ISO "YYYY-MM-DD" strings and all
// date math is done in UTC so a user's time zone can never shift a day.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
});

export function fmtMoney(cents) {
  return usd.format(cents / 100);
}

/** $1,284 / $12.9K / $4.2M: for stat tiles and axis ticks. */
export function fmtMoneyCompact(cents) {
  const dollars = cents / 100;
  return Math.abs(dollars) < 10000 ? usdWhole.format(dollars) : usdCompact.format(dollars);
}

export function fmtPercent(fraction, digits = 0) {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/**
 * Parse a bank-formatted amount into integer cents.
 * Handles "$1,234.56", "-12.34", "(12.34)" (accounting negative), "12.34-", "+5".
 * Returns null when the cell is not a number (blank cells, headers, etc).
 */
export function parseAmountToCents(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  s = s.replace(/[$,\s]/g, '').replace(/^USD/i, '');
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
  // Round on the third decimal, if any (some exports carry 3+ digits).
  const extra = frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0;
  const result = cents + extra;
  return negative ? -result : result;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad(n) { return String(n).padStart(2, '0'); }

function validYMD(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. Feb 30
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Parse common US bank date formats into "YYYY-MM-DD".
 * Supports MM/DD/YYYY, M/D/YY, MM-DD-YYYY, YYYY-MM-DD, YYYY/MM/DD, "Jan 5, 2026", "05 Jan 2026".
 */
export function parseDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    return validYMD(+m[1], +m[2], +m[3]);
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/))) {
    let y = +m[3];
    if (m[3].length === 2) y += y >= 70 ? 1900 : 2000;
    return validYMD(y, +m[1], +m[2]);
  }
  if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/))) {
    const mi = MONTHS.indexOf(m[1].toLowerCase());
    return mi < 0 ? null : validYMD(+m[3], mi + 1, +m[2]);
  }
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/))) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    return mi < 0 ? null : validYMD(+m[3], mi + 1, +m[1]);
  }
  return null;
}

export function isoToUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function utcToISO(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const DAY = 86400000;

export function addDays(iso, n) { return utcToISO(isoToUTC(iso) + n * DAY); }
export function daysBetween(a, b) { return Math.round((isoToUTC(b) - isoToUTC(a)) / DAY); }
export function dayOfWeek(iso) { return new Date(isoToUTC(iso)).getUTCDay(); } // 0 = Sunday
export function monthKey(iso) { return iso.slice(0, 7); }
export function startOfMonth(iso) { return `${iso.slice(0, 7)}-01`; }

export function endOfMonth(iso) {
  const [y, m] = iso.split('-').map(Number);
  return utcToISO(Date.UTC(y, m, 0));
}

export function addMonths(iso, n) {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}

/** Every "YYYY-MM" from the month of `from` through the month of `to`. */
export function monthRange(from, to) {
  const out = [];
  for (let cur = startOfMonth(from); cur <= to; cur = addMonths(cur, 1)) out.push(monthKey(cur));
  return out;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtMonth(key, long = false) {
  const [y, m] = key.split('-').map(Number);
  const name = MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1);
  return long ? `${name} ${y}` : `${name} '${String(y).slice(2)}`;
}

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const name = MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1);
  return `${name} ${d}, ${y}`;
}
