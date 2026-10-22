// Dashboard controller: owns state, filters, routing between views,
// and shared UI helpers (toast, confirm dialog, chart cards).

import { loadState, saveState, onExternalChange } from '../lib/storage.js';
import { kindMap, filterTransactions, spendingByCategory } from '../lib/analytics.js';
import { addDays, addMonths, endOfMonth, startOfMonth, todayISO, fmtDate } from '../lib/format.js';
import { el, setChildren, dataTable, hideTooltip } from '../lib/charts.js';
import { generateSampleData } from '../lib/sample.js';
import { renderOverview } from './views/overview.js';
import { renderTransactions } from './views/transactions.js';
import { renderBudgets } from './views/budgets.js';
import { renderSubscriptions } from './views/subscriptions.js';
import { renderSettings } from './views/settings.js';
import { openImportDialog } from './import.js';
import { exportCSV, exportXLSX, exportJSON } from './export.js';

const VIEWS = {
  overview: renderOverview,
  transactions: renderTransactions,
  budgets: renderBudgets,
  subscriptions: renderSubscriptions,
  settings: renderSettings,
};

const $ = (sel) => document.querySelector(sel);
const viewEl = $('#view');

/** Shared context handed to every view. */
export const app = {
  state: null,
  view: 'overview',
  filters: { range: 'last90', from: null, to: null, account: '' },
  kinds: new Map(),

  catName(id) { return app.state.categories.find((c) => c.id === id)?.name || 'Uncategorized'; },
  acctName(id) { return app.state.accounts.find((a) => a.id === id)?.name || 'Unknown account'; },
  expenseCategories() { return app.state.categories.filter((c) => c.kind === 'expense'); },

  /** Resolved [from, to] for the current date-range filter. */
  range() {
    const today = todayISO();
    const f = app.filters;
    const dates = app.state.transactions.map((t) => t.date);
    const earliest = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today;
    switch (f.range) {
      case 'thisMonth': return { from: startOfMonth(today), to: today };
      case 'lastMonth': { const s = addMonths(startOfMonth(today), -1); return { from: s, to: endOfMonth(s) }; }
      case 'last30': return { from: addDays(today, -29), to: today };
      case 'last90': return { from: addDays(today, -89), to: today };
      case 'ytd': return { from: `${today.slice(0, 4)}-01-01`, to: today };
      case 'last12': return { from: addMonths(startOfMonth(today), -11), to: today };
      case 'custom': return { from: f.from || earliest, to: f.to || today };
      default: {
        const latest = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : today;
        return { from: earliest, to: latest > today ? latest : today };
      }
    }
  },

  /** Transactions matching the filter row (date range + account). */
  filtered(extra = {}) {
    const { from, to } = app.range();
    return filterTransactions(app.state.transactions, {
      from, to, accountIds: app.filters.account ? [app.filters.account] : null, ...extra,
    });
  },

  /** Same account filter, any date: used for comparisons and recurring detection. */
  allForAccount() {
    return app.filters.account ? app.state.transactions.filter((t) => t.accountId === app.filters.account) : app.state.transactions;
  },

  /**
   * Stable colors: the five largest expense categories across ALL data get
   * series slots 1-5, everything else is "Other". Colors follow the category,
   * so changing the date filter never repaints a slice.
   */
  categoryColors() {
    const top = spendingByCategory(app.state.transactions, app.kinds).slice(0, 5);
    return new Map(top.map((r, i) => [r.category, `var(--series-${i + 1})`]));
  },

  async save(keys) {
    app.kinds = kindMap(app.state.categories);
    await saveState(app.state, keys);
  },

  rerender() { render(); },
  toast,
  confirm: confirmDialog,
  chartCard,
  openImport: () => $('#file-input').click(),
  async loadSample() {
    const { accounts, transactions } = generateSampleData();
    const ids = new Set(app.state.accounts.map((a) => a.id));
    app.state.accounts.push(...accounts.filter((a) => !ids.has(a.id)));
    const txnIds = new Set(app.state.transactions.map((t) => t.id));
    app.state.transactions.push(...transactions.filter((t) => !txnIds.has(t.id)));
    if (!Object.keys(app.state.budgets).length) {
      app.state.budgets = { food: 30000, groceries: 45000, concerts: 15000, shopping: 25000, transport: 20000 };
    }
    await app.save(['accounts', 'transactions', 'budgets']);
    toast(`Loaded ${transactions.length} sample transactions.`);
    render();
  },
};

// ---------- Rendering ----------

function render() {
  hideTooltip();
  for (const b of document.querySelectorAll('.tabs button')) {
    b.setAttribute('aria-selected', String(b.dataset.view === app.view));
  }
  const hasData = app.state.transactions.length > 0;
  $('#filters').hidden = !hasData || app.view === 'settings' || app.view === 'budgets';
  renderAccountFilter();
  // Subscriptions always look at full history, so only the account filter applies there.
  const noDates = app.view === 'subscriptions';
  $('#range').parentElement.hidden = noDates;
  $('#range-label').hidden = noDates;
  for (const n of document.querySelectorAll('.custom-range')) n.hidden = noDates || app.filters.range !== 'custom';
  const { from, to } = app.range();
  $('#range-label').textContent = `${fmtDate(from)} – ${fmtDate(to)}`;

  if (!hasData && app.view !== 'settings') {
    viewEl.replaceChildren(emptyState());
    return;
  }
  VIEWS[app.view](viewEl, app);
}

function renderAccountFilter() {
  const sel = $('#account');
  const opts = [el('option', { value: '' }, 'All accounts'),
    ...app.state.accounts.map((a) => el('option', { value: a.id }, a.name))];
  sel.replaceChildren(...opts);
  if (!app.state.accounts.some((a) => a.id === app.filters.account)) app.filters.account = '';
  sel.value = app.filters.account;
}

function emptyState() {
  return el('div', { class: 'empty' },
    el('h1', {}, 'See where your money goes'),
    el('p', { class: 'muted' }, 'Import the CSV files your bank and card issuers already let you download. Everything stays on this computer: SpendLens never connects to your bank or any server.'),
    el('div', { class: 'steps' },
      el('div', { class: 'card' }, el('h3', {}, 'Discover'),
        el('ol', {}, el('li', {}, 'Log in at discover.com'), el('li', {}, 'Open "All Activity & Statements"'), el('li', {}, 'Pick a date range, then Download → CSV'))),
      el('div', { class: 'card' }, el('h3', {}, 'Bank of America'),
        el('ol', {}, el('li', {}, 'Open the checking or credit card account'), el('li', {}, 'Click "Download" above the transactions'), el('li', {}, 'Choose "Microsoft Excel Format" (.csv)'))),
      el('div', { class: 'card' }, el('h3', {}, 'Others'),
        el('p', {}, 'Chase, Capital One, Citi and Amex are detected automatically. Any other CSV works too: you\'ll just pick which column is which.'))),
    el('div', { class: 'cta' },
      el('button', { class: 'btn btn-primary', onclick: app.openImport }, 'Import CSV files'),
      el('button', { class: 'btn', onclick: () => app.loadSample() }, 'Try with sample data')));
}

/**
 * A card with a title, a chart, and a "Table" toggle that swaps in an
 * accessible table with the same numbers.
 */
function chartCard({ title, subtitle, span = 6, draw, table, actions }) {
  const body = el('div', { class: 'card-body' });
  let showingTable = false;
  const toggle = table ? el('button', { class: 'btn btn-small view-toggle', 'aria-pressed': 'false' }, 'Table') : null;
  const paint = () => {
    if (showingTable) body.replaceChildren(dataTable(table()));
    else draw(body);
  };
  toggle?.addEventListener('click', () => {
    showingTable = !showingTable;
    toggle.textContent = showingTable ? 'Chart' : 'Table';
    toggle.setAttribute('aria-pressed', String(showingTable));
    paint();
  });
  const card = el('section', { class: `card span-${span}` },
    el('div', { class: 'card-head' },
      el('div', {}, el('h2', {}, title), subtitle ? el('p', {}, subtitle) : null),
      el('div', { class: 'actions' }, actions, toggle)),
    body);
  // Draw after insertion so charts can measure their width.
  requestAnimationFrame(paint);
  card._repaint = () => !showingTable && draw(body);
  return card;
}

// ---------- Toast & confirm ----------

let toastTimer;
function toast(message, action) {
  const t = $('#toast');
  setChildren(t, el('span', {}, message),
    action ? el('button', { onclick: () => { t.hidden = true; action.run(); } }, action.label) : null);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 9000 : 3500);
}

function confirmDialog(message, confirmLabel = 'Delete') {
  const d = $('#confirm-dialog');
  return new Promise((resolve) => {
    d.replaceChildren(
      el('div', { class: 'dialog-body' }, el('p', {}, message)),
      el('div', { class: 'dialog-foot' },
        el('button', { class: 'btn', onclick: () => { d.close(); resolve(false); } }, 'Cancel'),
        el('button', { class: 'btn btn-primary', onclick: () => { d.close(); resolve(true); } }, confirmLabel)));
    d.addEventListener('cancel', () => resolve(false), { once: true });
    d.showModal();
  });
}

// ---------- Wiring ----------

function bindChrome() {
  for (const b of document.querySelectorAll('.tabs button')) {
    b.addEventListener('click', () => {
      app.view = b.dataset.view;
      location.hash = app.view;
      render();
      viewEl.focus({ preventScroll: true });
    });
  }

  const range = $('#range');
  range.value = app.filters.range;
  const syncCustom = () => {
    for (const n of document.querySelectorAll('.custom-range')) n.hidden = range.value !== 'custom';
  };
  syncCustom();
  range.addEventListener('change', () => {
    app.filters.range = range.value;
    if (range.value === 'custom') {
      const r = app.range();
      $('#from').value = app.filters.from || r.from;
      $('#to').value = app.filters.to || r.to;
    }
    syncCustom();
    app.state.settings.range = range.value;
    saveState(app.state, ['settings']);
    render();
  });
  $('#from').addEventListener('change', (e) => { app.filters.from = e.target.value; render(); });
  $('#to').addEventListener('change', (e) => { app.filters.to = e.target.value; render(); });
  $('#account').addEventListener('change', (e) => { app.filters.account = e.target.value; render(); });

  $('#import-btn').addEventListener('click', app.openImport);
  $('#file-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      const imported = await openImportDialog(f, app);
      if (imported == null) break; // user cancelled the batch
    }
    render();
  });

  const menuBtn = $('#export-btn'), menu = $('#export-menu');
  const closeMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());
  menu.addEventListener('click', (e) => {
    const kind = e.target.closest('[data-export]')?.dataset.export;
    if (!kind) return;
    if (!app.state.transactions.length && kind !== 'json') { toast('Nothing to export yet. Import a CSV first.'); return; }
    ({ csv: exportCSV, xlsx: exportXLSX, json: exportJSON })[kind](app);
  });

  // Charts size themselves to their card, so repaint on resize.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => document.querySelectorAll('.card').forEach((c) => c._repaint?.()), 150);
  });

  window.addEventListener('hashchange', () => {
    const v = location.hash.slice(1);
    if (VIEWS[v] && v !== app.view) { app.view = v; render(); }
  });

  // Keep in sync if data changes in another tab.
  onExternalChange(async () => {
    app.state = await loadState();
    app.kinds = kindMap(app.state.categories);
    render();
  });
}

async function init() {
  app.state = await loadState();
  app.kinds = kindMap(app.state.categories);
  app.filters.range = app.state.settings.range || 'last90';
  const hash = location.hash.slice(1);
  if (VIEWS[hash]) app.view = hash;
  // ?demo loads sample data when empty (handy for screenshots and the dev server).
  if (new URLSearchParams(location.search).has('demo') && !app.state.transactions.length) {
    await app.loadSample();
  }
  bindChrome();
  render();
}

init();
