// Toolbar popup: a glance at this month, plus a button into the dashboard.

import { loadState, unlock, LockedError, getAlertSettings } from '../lib/storage.js';
import { kindMap, filterTransactions, summarize, spendingByCategory, budgetStatus } from '../lib/analytics.js';
import { alertsFor, describeAlert, updateBadge } from '../lib/alerts.js';
import { fmtMoney, fmtMonth, startOfMonth, endOfMonth, todayISO, addMonths, addDays } from '../lib/format.js';
import { el, setChildren, barList } from '../lib/charts.js';

const openDashboard = () => {
  const url = 'src/dashboard/dashboard.html';
  if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url: chrome.runtime.getURL(url) });
  else window.open('../dashboard/dashboard.html');
  window.close();
};

function showUnlock(content) {
  const input = el('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Passphrase', 'aria-label': 'Passphrase', style: { width: '100%' } });
  const error = el('div', { class: 'lock-error', role: 'alert' });
  const btn = el('button', { class: 'btn', type: 'submit', style: { width: '100%' } }, 'Unlock');
  content.replaceChildren(el('form', {
    class: 'popup-unlock',
    onsubmit: async (e) => {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Unlocking…';
      if (await unlock(input.value)) { init(); return; }
      error.textContent = 'Wrong passphrase.';
      btn.disabled = false;
      btn.textContent = 'Unlock';
      input.select();
    },
  }, el('p', { class: 'muted' }, 'SpendLens is locked. Your data is encrypted.'), input, error, btn));
  input.focus();
}

async function init() {
  const today = todayISO();
  const content = document.getElementById('content');
  document.getElementById('month').textContent = fmtMonth(today.slice(0, 7), true);
  let state;
  try {
    state = await loadState();
  } catch (e) {
    if (e instanceof LockedError) { showUnlock(content); return; }
    throw e;
  }
  const kinds = kindMap(state.categories);
  await updateBadge(state, await getAlertSettings());

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
  const alerts = alertsFor(state, today);
  const alerted = new Set(alerts.map((a) => a.category));
  const close = budgetStatus(state.transactions, kinds, state.budgets, today).filter((b) => b.ratio >= 0.8 && !alerted.has(b.category));

  setChildren(content,
    el('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Spent this month'),
    el('div', { class: 'popup-total' }, fmtMoney(cur.spent)),
    el('div', { class: `popup-sub ${change == null ? 'muted' : change > 0 ? 'delta-bad' : 'delta-good'}` },
      change == null ? `${cur.count} transactions` : `${change > 0 ? '▲' : '▼'} ${Math.abs(change * 100).toFixed(0)}% vs. same point last month`),
    top.length ? el('h3', {}, 'Top categories') : null,
    listEl,
    alerts.length || close.length ? el('h3', {}, 'Spending alerts') : null,
    ...alerts.map((a) => el('div', { class: 'popup-alert' },
      el('span', { class: 'status-icon', style: { background: a.type === 'over' ? 'var(--critical)' : 'var(--serious)' } }, '!'),
      describeAlert(a, name))),
    ...close.map((b) => el('div', { class: 'popup-alert' },
      el('span', { class: 'status-icon', style: { background: 'var(--warning)' } }, '!'),
      `${name(b.category)} is close to its limit: ${fmtMoney(b.spent)} of ${fmtMoney(b.limitCents)}.`)),
  );
  barList(listEl, { rows: top.map((r) => ({ label: name(r.category), value: r.cents })), format: fmtMoney });
}

document.getElementById('open').addEventListener('click', openDashboard);
init();
