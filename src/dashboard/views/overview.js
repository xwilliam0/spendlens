import {
  summarize, spendingByCategory, spendingByMerchant, spendingByAccount, monthlyTotals,
  dailySpending, weekdaySpending, previousPeriod, filterTransactions, detectRecurring, insights,
} from '../../lib/analytics.js';
import {
  fmtMoney, fmtMoneyCompact, fmtMonth, fmtDate, addDays, addMonths, dayOfWeek, daysBetween, monthRange,
} from '../../lib/format.js';
import { el, donutChart, barList, columnChart, calendarHeatmap, weekdayChart } from '../../lib/charts.js';

function statTile({ label, value, delta, hero }) {
  return el('div', { class: `stat${hero ? ' hero' : ''}` },
    el('div', { class: 'stat-label' }, label),
    el('div', { class: 'stat-value' }, value),
    delta ? el('div', { class: `stat-delta ${delta.cls || ''}` }, delta.text) : el('div', { class: 'stat-delta' }, ' '));
}

/** "▲ 12% vs prev. 90 days" colored by whether the direction is good. */
function deltaOf(cur, prev, upIsGood, periodLabel) {
  if (!prev) return null;
  const change = (cur - prev) / Math.abs(prev);
  if (!Number.isFinite(change)) return null;
  const up = change > 0;
  const good = up === upIsGood;
  return {
    text: `${up ? '▲' : '▼'} ${Math.abs(change * 100).toFixed(0)}% vs ${periodLabel}`,
    cls: Math.abs(change) < 0.01 ? '' : good ? 'delta-good' : 'delta-bad',
  };
}

export function renderOverview(root, app) {
  const { kinds } = app;
  const { from, to } = app.range();
  const txns = app.filtered();
  const prevRange = previousPeriod(from, to);
  const prevTxns = filterTransactions(app.allForAccount(), prevRange);
  const cur = summarize(txns, kinds);
  const prev = summarize(prevTxns, kinds);
  const days = daysBetween(from, to) + 1;
  const prevLabel = `prev. ${days} days`;

  const stats = el('div', { class: 'stats' },
    statTile({ label: 'Total spent', value: fmtMoney(cur.spent), delta: deltaOf(cur.spent, prev.spent, false, prevLabel), hero: true }),
    statTile({ label: 'Income', value: fmtMoneyCompact(cur.income), delta: deltaOf(cur.income, prev.income, true, prevLabel) }),
    statTile({ label: 'Net cash flow', value: fmtMoneyCompact(cur.net), delta: cur.net >= 0 ? { text: 'Saved money', cls: 'delta-good' } : { text: 'Spent more than earned', cls: 'delta-bad' } }),
    statTile({ label: 'Average per day', value: fmtMoneyCompact(Math.round(cur.spent / days)), delta: deltaOf(cur.spent / days, prev.spent / days, false, prevLabel) }),
    statTile({ label: 'Transactions', value: cur.count.toLocaleString() }),
  );

  if (!txns.length) {
    root.replaceChildren(stats, el('div', { class: 'card' },
      el('p', { class: 'muted' }, 'No transactions in this date range. Try "All time" in the date filter.')));
    return;
  }

  const byCat = spendingByCategory(txns, kinds);
  const colors = app.categoryColors();
  const goToCategory = (catId) => {
    app.pendingTransactionFilter = { category: catId };
    app.view = 'transactions';
    location.hash = 'transactions';
    app.rerender();
  };

  // Donut: the five stable-colored categories, the rest folded into "Other".
  const donutData = [];
  let other = 0;
  for (const r of byCat) {
    if (colors.has(r.category)) donutData.push({ id: r.category, label: app.catName(r.category), value: r.cents, color: colors.get(r.category) });
    else other += r.cents;
  }
  donutData.sort((a, b) => [...colors.keys()].indexOf(a.id) - [...colors.keys()].indexOf(b.id));
  if (other > 0) donutData.push({ id: null, label: 'Other', value: other, color: 'var(--series-other)' });

  const donutCard = app.chartCard({
    title: 'Where your money went',
    subtitle: 'Share of spending: top categories, rest grouped as Other',
    span: 5,
    draw: (body) => donutChart(body, {
      data: donutData, format: fmtMoney, centerLabel: 'spent',
      onSelect: (label) => { const d = donutData.find((x) => x.label === label); if (d?.id) goToCategory(d.id); },
    }),
    table: () => ({
      columns: ['Category', 'Spent', 'Share'], numeric: [1, 2],
      rows: donutData.map((d) => [d.label, fmtMoney(d.value), `${((d.value / cur.spent) * 100).toFixed(1)}%`]),
    }),
  });

  const catCard = app.chartCard({
    title: 'Spending by category',
    subtitle: 'Click a category to see its transactions',
    span: 7,
    draw: (body) => barList(body, {
      rows: byCat.map((r) => ({ id: r.category, label: app.catName(r.category), value: r.cents, sub: `${r.count} transactions · ${((r.cents / cur.spent) * 100).toFixed(1)}%` })),
      format: fmtMoney,
      onSelect: (r) => goToCategory(r.id),
    }),
    table: () => ({
      columns: ['Category', 'Spent', 'Transactions', 'Average'], numeric: [1, 2, 3],
      rows: byCat.map((r) => [app.catName(r.category), fmtMoney(r.cents), String(r.count), fmtMoney(Math.round(r.cents / r.count))]),
    }),
  });

  // Monthly trend: show at least 6 months of context ending at the range end.
  const monthsFrom = monthRange(from, to).length < 6 ? addMonths(to, -5) : from;
  const monthly = monthlyTotals(filterTransactions(app.allForAccount(), { from: monthsFrom, to }), kinds, monthsFrom, to);
  const monthlyCard = app.chartCard({
    title: 'Spending vs. income by month',
    subtitle: 'Credit card payments and transfers between your accounts are excluded',
    span: 12,
    draw: (body) => columnChart(body, {
      labels: monthly.map((m) => fmtMonth(m.month)),
      longLabels: monthly.map((m) => fmtMonth(m.month, true)),
      series: [
        { name: 'Spent', color: 'var(--series-1)', values: monthly.map((m) => m.spent) },
        { name: 'Income', color: 'var(--series-2)', values: monthly.map((m) => m.income) },
      ],
      format: fmtMoney, formatTick: fmtMoneyCompact,
    }),
    table: () => ({
      columns: ['Month', 'Spent', 'Income', 'Net'], numeric: [1, 2, 3],
      rows: monthly.map((m) => [fmtMonth(m.month, true), fmtMoney(m.spent), fmtMoney(m.income), fmtMoney(m.income - m.spent)]),
    }),
  });

  const daily = dailySpending(txns, kinds);
  const heatCard = app.chartCard({
    title: 'Daily spending',
    subtitle: 'Darker days cost more. Spot paydays, weekends and splurges.',
    span: 7,
    draw: (body) => calendarHeatmap(body, {
      days: daily, from, to, format: fmtMoney, addDays, dayOfWeek, fmtDate, monthLabel: (k) => fmtMonth(k).split(' ')[0],
    }),
    table: () => ({
      columns: ['Date', 'Spent'], numeric: [1],
      rows: [...daily.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([d, v]) => [fmtDate(d), fmtMoney(v)]),
    }),
  });

  const weekday = weekdaySpending(txns, kinds);
  const weekdayCard = app.chartCard({
    title: 'By day of week',
    span: 5,
    draw: (body) => weekdayChart(body, { values: weekday, format: fmtMoneyCompact }),
    table: () => ({
      columns: ['Day', 'Spent'], numeric: [1],
      rows: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => [d, fmtMoney(weekday[i])]),
    }),
  });

  const merchants = spendingByMerchant(txns, kinds, 10);
  const merchantCard = app.chartCard({
    title: 'Top merchants',
    span: 6,
    draw: (body) => barList(body, {
      rows: merchants.map((m) => ({ label: m.merchant, value: m.cents, sub: `${m.count} transactions` })),
      format: fmtMoney,
    }),
    table: () => ({
      columns: ['Merchant', 'Spent', 'Transactions'], numeric: [1, 2],
      rows: merchants.map((m) => [m.merchant, fmtMoney(m.cents), String(m.count)]),
    }),
  });

  const byAccount = spendingByAccount(txns, kinds);
  const accountCard = app.chartCard({
    title: 'Spending by account',
    span: 6,
    draw: (body) => barList(body, {
      rows: byAccount.map((a) => ({ label: app.acctName(a.accountId), value: a.cents })),
      format: fmtMoney,
    }),
    table: () => ({
      columns: ['Account', 'Spent'], numeric: [1],
      rows: byAccount.map((a) => [app.acctName(a.accountId), fmtMoney(a.cents)]),
    }),
  });

  const recurring = detectRecurring(app.allForAccount(), kinds);
  const notes = insights(txns, prevTxns, kinds, (id) => app.catName(id), recurring);
  const insightCard = el('section', { class: 'card span-12' },
    el('div', { class: 'card-head' }, el('h2', {}, 'Insights')),
    el('ul', { class: 'insights' }, notes.map((n) => el('li', {}, n))));

  root.replaceChildren(stats, el('div', { class: 'grid' },
    insightCard, donutCard, catCard, monthlyCard, heatCard, weekdayCard, merchantCard, accountCard));
}
