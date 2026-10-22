// Toolbar popup: a glance at this month, plus a button into the dashboard.

import { loadState } from '../lib/storage.js';
import { kindMap, filterTransactions, summarize, spendingByCategory, budgetStatus } from '../lib/analytics.js';
import { fmtMoney, fmtMonth, startOfMonth, endOfMonth, todayISO, addMonths, addDays } from '../lib/format.js';
import { el, setChildren, barList } from '../lib/charts.js';

const openDashboard = () => {
  const url = 'src/dashboard/dashboard.html';
  if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url: chrome.runtime.getURL(url) });
  else window.open('../dashboard/dashboard.html');
  window.close();
};

async function init() {
  document.getElementById('open').addEventListener('click', openDashboard);
  const state = await loadState();
  const kinds = kindMap(state.categories);
  const today = todayISO();
  const content = document.getElementById('content');
  document.getElementById('month').textContent = fmtMonth(today.slice(0, 7), true);

  if (!state.transactions.length) {
    content.replaceChildren(el('p', { class: 'muted' }, 'No data yet. Open the dashboard to import CSV statements from Discover, Bank of America and other banks.'));
    return;
  }

  const name = (id) => state.categories.find((c) => c.id === id)?.name || 'Uncategorized';
  const from = startOfMonth(today);
  const month = filterTransactions(state.transactions, { from, to: today });
  const cur = summarize(month, kinds);
  // Same days of last month, so the comparison is fair mid-month.
  const lastFrom = addMonths(from, -1);
  const sameDay = addDays(lastFrom, Number(today.slice(8)) - 1);
  const lastTo = sameDay < endOfMonth(lastFrom) ? sameDay : endOfMonth(lastFrom);
  const lastSameDay = filterTransactions(state.transactions, { from: lastFrom, to: lastTo });
  const prev = summarize(lastSameDay, kinds);
  const change = prev.spent ? (cur.spent - prev.spent) / prev.spent : null;

  const top = spendingByCategory(month, kinds).slice(0, 5);
  const listEl = el('div');
  const alerts = budgetStatus(state.transactions, kinds, state.budgets, today).filter((b) => b.ratio >= 0.8);

  setChildren(content,
    el('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Spent this month'),
    el('div', { class: 'popup-total' }, fmtMoney(cur.spent)),
    el('div', { class: `popup-sub ${change == null ? 'muted' : change > 0 ? 'delta-bad' : 'delta-good'}` },
      change == null ? `${cur.count} transactions` : `${change > 0 ? '▲' : '▼'} ${Math.abs(change * 100).toFixed(0)}% vs. same point last month`),
    top.length ? el('h3', {}, 'Top categories') : null,
    listEl,
    alerts.length ? el('h3', {}, 'Budget alerts') : null,
    ...alerts.map((b) => el('div', { class: 'popup-alert' },
      el('span', { class: 'status-icon', style: { background: b.ratio >= 1 ? 'var(--critical)' : 'var(--warning)' } }, '!'),
      `${name(b.category)}: ${fmtMoney(b.spent)} of ${fmtMoney(b.limitCents)}${b.ratio >= 1 ? ' (over)' : ''}`)),
  );
  barList(listEl, { rows: top.map((r) => ({ label: name(r.category), value: r.cents })), format: fmtMoney });
}

init();
