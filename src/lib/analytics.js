// Pure aggregation functions. Nothing here touches the DOM or chrome.* APIs,
// which keeps it unit-testable in Node.

import { fmtDate, addDays, addMonths, daysBetween, dayOfWeek, monthKey, monthRange, startOfMonth, endOfMonth, todayISO } from './format.js';

/** Map of category id -> kind ('expense' | 'income' | 'transfer'). */
export function kindMap(categories) {
  return new Map(categories.map((c) => [c.id, c.kind]));
}

export function filterTransactions(txns, { from, to, accountIds, categoryIds, search } = {}) {
  const q = search ? search.trim().toLowerCase() : '';
  return txns.filter((t) =>
    (!from || t.date >= from) &&
    (!to || t.date <= to) &&
    (!accountIds || accountIds.length === 0 || accountIds.includes(t.accountId)) &&
    (!categoryIds || categoryIds.length === 0 || categoryIds.includes(t.category)) &&
    (!q || t.description.toLowerCase().includes(q) || t.merchant.toLowerCase().includes(q) ||
      (t.notes || '').toLowerCase().includes(q)));
}

/**
 * Spending in cents for one transaction: purchases are positive, refunds in
 * an expense category are negative (they reduce that category's total), and
 * income / transfers contribute nothing.
 */
export function spendOf(t, kinds) {
  return (kinds.get(t.category) || 'expense') === 'expense' ? -t.amountCents : 0;
}

export function incomeOf(t, kinds) {
  return kinds.get(t.category) === 'income' ? t.amountCents : 0;
}

export function summarize(txns, kinds) {
  let spent = 0, income = 0, count = 0, largest = null;
  for (const t of txns) {
    const s = spendOf(t, kinds);
    spent += s;
    income += incomeOf(t, kinds);
    if (kinds.get(t.category) !== 'transfer') count++;
    if (s > 0 && (!largest || s > -largest.amountCents)) largest = t;
  }
  return { spent, income, net: income - spent, count, largest };
}

/** [{category, cents, count}] sorted by spend desc; categories netting <= 0 are dropped. */
export function spendingByCategory(txns, kinds) {
  const totals = new Map();
  for (const t of txns) {
    const s = spendOf(t, kinds);
    if (!s) continue;
    const cur = totals.get(t.category) || { category: t.category, cents: 0, count: 0 };
    cur.cents += s;
    cur.count++;
    totals.set(t.category, cur);
  }
  return [...totals.values()].filter((r) => r.cents > 0).sort((a, b) => b.cents - a.cents);
}

export function spendingByMerchant(txns, kinds, limit = 10) {
  const totals = new Map();
  for (const t of txns) {
    const s = spendOf(t, kinds);
    if (!s) continue;
    const cur = totals.get(t.merchant) || { merchant: t.merchant, cents: 0, count: 0 };
    cur.cents += s;
    cur.count++;
    totals.set(t.merchant, cur);
  }
  return [...totals.values()].filter((r) => r.cents > 0).sort((a, b) => b.cents - a.cents).slice(0, limit);
}

export function spendingByAccount(txns, kinds) {
  const totals = new Map();
  for (const t of txns) {
    const s = spendOf(t, kinds);
    if (s) totals.set(t.accountId, (totals.get(t.accountId) || 0) + s);
  }
  return [...totals].map(([accountId, cents]) => ({ accountId, cents })).sort((a, b) => b.cents - a.cents);
}

/** One row per month in [from, to], including empty months. */
export function monthlyTotals(txns, kinds, from, to) {
  if (!txns.length && (!from || !to)) return [];
  const dates = txns.map((t) => t.date).sort();
  const start = from || dates[0];
  const end = to || dates[dates.length - 1];
  const rows = new Map(monthRange(start, end).map((m) => [m, { month: m, spent: 0, income: 0 }]));
  for (const t of txns) {
    const row = rows.get(monthKey(t.date));
    if (!row) continue;
    row.spent += spendOf(t, kinds);
    row.income += incomeOf(t, kinds);
  }
  return [...rows.values()];
}

/** Map of "YYYY-MM-DD" -> cents spent that day. */
export function dailySpending(txns, kinds) {
  const days = new Map();
  for (const t of txns) {
    const s = spendOf(t, kinds);
    if (s) days.set(t.date, (days.get(t.date) || 0) + s);
  }
  return days;
}

/** Spending by day of week, Sunday first. */
export function weekdaySpending(txns, kinds) {
  const out = Array.from({ length: 7 }, () => 0);
  for (const t of txns) out[dayOfWeek(t.date)] += spendOf(t, kinds);
  return out;
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const FREQUENCIES = [
  { name: 'Weekly', days: 7, perMonth: 52 / 12 },
  { name: 'Every 2 weeks', days: 14, perMonth: 26 / 12 },
  { name: 'Monthly', days: 30.4, perMonth: 1 },
  { name: 'Quarterly', days: 91, perMonth: 1 / 3 },
  { name: 'Yearly', days: 365, perMonth: 1 / 12 },
];

/**
 * Find subscriptions and other recurring charges: the same merchant charging
 * a similar amount (within 15% of the median) on a regular interval.
 */
export function detectRecurring(txns, kinds) {
  const groups = new Map();
  for (const t of txns) {
    if (t.amountCents >= 0 || kinds.get(t.category) !== 'expense') continue;
    const key = t.merchant.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const results = [];
  for (const list of groups.values()) {
    if (list.length < 3) continue;
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    const amounts = list.map((t) => -t.amountCents);
    const typical = median(amounts);
    const consistentAmounts = amounts.filter((a) => Math.abs(a - typical) <= typical * 0.15).length;
    if (consistentAmounts / amounts.length < 0.75) continue;

    const gaps = [];
    for (let i = 1; i < list.length; i++) gaps.push(daysBetween(list[i - 1].date, list[i].date));
    const gap = median(gaps);
    const freq = FREQUENCIES.find((f) => Math.abs(gap - f.days) <= Math.max(2, f.days * 0.12));
    if (!freq) continue;
    const regular = gaps.filter((g) => Math.abs(g - freq.days) <= Math.max(3, freq.days * 0.2)).length;
    if (regular / gaps.length < 0.7) continue;

    const last = list[list.length - 1];
    results.push({
      merchant: last.merchant,
      category: last.category,
      frequency: freq.name,
      typicalCents: Math.round(typical),
      monthlyCents: Math.round(typical * freq.perMonth),
      count: list.length,
      firstDate: list[0].date,
      lastDate: last.date,
      nextDate: addDays(last.date, Math.round(freq.days)),
    });
  }
  return results.sort((a, b) => b.monthlyCents - a.monthlyCents);
}

/** The window of equal length immediately before [from, to]. */
export function previousPeriod(from, to) {
  const len = daysBetween(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

/** Category budgets for the month containing `today`, with a straight-line projection. */
export function budgetStatus(txns, kinds, budgets, today = todayISO()) {
  const from = startOfMonth(today);
  const to = endOfMonth(today);
  const monthTxns = filterTransactions(txns, { from, to });
  const spentBy = new Map(spendingByCategory(monthTxns, kinds).map((r) => [r.category, r.cents]));
  const daysInMonth = daysBetween(from, to) + 1;
  const elapsed = daysBetween(from, today) + 1;
  return Object.entries(budgets)
    .filter(([, limit]) => limit > 0)
    .map(([category, limitCents]) => {
      const spent = spentBy.get(category) || 0;
      const projected = Math.round((spent / elapsed) * daysInMonth);
      return { category, limitCents, spent, projected, ratio: spent / limitCents };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/**
 * Plain-English observations about the selected period.
 * @returns {string[]}
 */
export function insights(current, previous, kinds, nameOf, recurring = []) {
  const out = [];
  const cur = summarize(current, kinds);
  const prev = summarize(previous, kinds);
  if (!cur.spent) return out;

  if (prev.spent > 0) {
    const change = (cur.spent - prev.spent) / prev.spent;
    if (Math.abs(change) >= 0.02) {
      out.push(`You spent ${Math.abs(change * 100).toFixed(0)}% ${change > 0 ? 'more' : 'less'} than in the previous period of the same length.`);
    } else {
      out.push('Your spending is about the same as the previous period.');
    }
  }

  const cats = spendingByCategory(current, kinds);
  if (cats.length) {
    const top = cats[0];
    out.push(`${nameOf(top.category)} was your biggest category at ${(top.cents / cur.spent * 100).toFixed(0)}% of spending.`);
  }

  if (prev.spent > 0) {
    const prevBy = new Map(spendingByCategory(previous, kinds).map((r) => [r.category, r.cents]));
    let biggest = null;
    for (const r of cats) {
      const delta = r.cents - (prevBy.get(r.category) || 0);
      if (!biggest || delta > biggest.delta) biggest = { category: r.category, delta };
    }
    if (biggest && biggest.delta > 2000) {
      out.push(`${nameOf(biggest.category)} grew the most, up $${Math.round(biggest.delta / 100).toLocaleString()} from the previous period.`);
    }
  }

  if (cur.largest) {
    const t = cur.largest;
    out.push(`Largest purchase: $${(-t.amountCents / 100).toFixed(2)} at ${t.merchant} on ${fmtDate(t.date)}.`);
  }

  const wk = weekdaySpending(current, kinds);
  const weekend = wk[0] + wk[6];
  if (cur.spent > 0) {
    const share = weekend / cur.spent;
    if (share > 0.4) out.push(`${(share * 100).toFixed(0)}% of your spending happens on weekends.`);
  }

  if (recurring.length) {
    const monthly = recurring.reduce((s, r) => s + r.monthlyCents, 0);
    out.push(`${recurring.length} recurring charges cost about $${Math.round(monthly / 100).toLocaleString()}/month ($${Math.round(monthly * 12 / 100).toLocaleString()}/year).`);
  }
  return out;
}

// Projections from the first few days of a month are mostly noise.
const MIN_DAYS_FOR_PACE = 7;
const ALERT_ORDER = { over: 0, pace: 1, unusual: 2 };

/**
 * Categories that need attention in the month containing `today`:
 *   over    - spent at least its budget
 *   pace    - under budget, but the daily rate projects past it by month end
 *   unusual - no budget, but well above its average month over the previous
 *             3 months (needs at least 2 months of history)
 * @returns {{type: 'over'|'pace'|'unusual', category: string, spent: number,
 *            projected: number, limitCents?: number, typical?: number}[]}
 */
export function spendingAlerts(txns, kinds, budgets, today = todayISO()) {
  const from = startOfMonth(today);
  const elapsed = daysBetween(from, today) + 1;
  const daysInMonth = daysBetween(from, endOfMonth(today)) + 1;
  const out = [];

  for (const b of budgetStatus(txns, kinds, budgets, today)) {
    if (b.spent >= b.limitCents) out.push({ type: 'over', ...b });
    else if (elapsed >= MIN_DAYS_FOR_PACE && b.projected > b.limitCents) out.push({ type: 'pace', ...b });
  }

  const hist = filterTransactions(txns, { from: addMonths(from, -3), to: addDays(from, -1) });
  const months = new Set(hist.map((t) => monthKey(t.date))).size;
  if (months >= 2) {
    const typical = new Map(spendingByCategory(hist, kinds).map((r) => [r.category, Math.round(r.cents / months)]));
    for (const r of spendingByCategory(filterTransactions(txns, { from, to: today }), kinds)) {
      if (budgets[r.category] > 0) continue;
      const avg = typical.get(r.category) || 0;
      const projected = Math.round((r.cents / elapsed) * daysInMonth);
      const alreadyHigh = r.cents >= avg * 1.25 && r.cents - avg >= 10000;
      // Must also be well past where a typical month stands by this day, so one
      // big monthly purchase (a grocery run) isn't extrapolated into a spike.
      const aheadOfUsual = r.cents - (avg * elapsed) / daysInMonth;
      const onPace = elapsed >= MIN_DAYS_FOR_PACE && r.cents >= avg * 0.75 && aheadOfUsual >= 15000 && projected >= avg * 1.5;
      if (alreadyHigh || onPace) out.push({ type: 'unusual', category: r.category, spent: r.cents, projected, typical: avg });
    }
  }
  return out.sort((a, b) => ALERT_ORDER[a.type] - ALERT_ORDER[b.type] || b.spent - a.spent);
}
