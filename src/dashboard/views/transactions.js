import { summarize } from '../../lib/analytics.js';
import { categorize, merchantName } from '../../lib/categorize.js';
import { fmtMoney, fmtDate, parseAmountToCents, todayISO } from '../../lib/format.js';
import { hash } from '../../lib/importers.js';
import { el, setChildren } from '../../lib/charts.js';

const PAGE_SIZE = 50;

// View-local UI state survives re-renders.
const ui = { search: '', category: '', sort: 'date', dir: -1, page: 0 };

function categorySelect(app, value, attrs = {}) {
  const groups = { expense: 'Spending', income: 'Income', transfer: 'Not counted' };
  return el('select', attrs, Object.entries(groups).map(([kind, label]) =>
    el('optgroup', { label }, app.state.categories.filter((c) => c.kind === kind).map((c) =>
      el('option', { value: c.id, selected: c.id === value }, c.name)))));
}

/**
 * Turn a merchant into a rule pattern that actually matches the raw
 * description, e.g. "Trader Joe's" -> "TRADER JOE" for "TRADER JOE S #509".
 */
function rulePatternFor(t) {
  const desc = t.description.toUpperCase();
  const m = t.merchant.toUpperCase();
  if (desc.includes(m)) return m;
  const words = desc.replace(/[^A-Z0-9&.' ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !/^\d+$/.test(w));
  return words.slice(0, 2).join(' ') || m;
}

async function changeCategory(app, t, category) {
  t.category = category;
  t.manual = true;
  await app.save(['transactions']);
  const pattern = rulePatternFor(t);
  const similar = app.state.transactions.filter((x) => x !== t && !x.manual && x.category !== category &&
    x.description.toUpperCase().includes(pattern));
  app.rerender();
  app.toast(`Moved to ${app.catName(category)}.`, {
    label: similar.length ? `Apply to ${similar.length} similar + future imports` : 'Always for this merchant',
    run: async () => {
      app.state.rules = app.state.rules.filter((r) => r.pattern !== pattern);
      app.state.rules.unshift({ id: hash(`${pattern}|${Date.now()}`), pattern, category });
      for (const x of similar) x.category = category;
      await app.save(['rules', 'transactions']);
      app.toast(`Rule created: "${pattern}" → ${app.catName(category)}`);
      app.rerender();
    },
  });
}

function addTransactionForm(app, onDone) {
  const date = el('input', { type: 'date', value: todayISO(), required: true });
  const desc = el('input', { type: 'text', placeholder: 'Description (e.g. Farmers market)', required: true, style: { minWidth: '240px' } });
  const amount = el('input', { type: 'text', placeholder: 'Amount', inputmode: 'decimal', required: true, style: { width: '110px' } });
  const type = el('select', {}, el('option', { value: 'out' }, 'Money out'), el('option', { value: 'in' }, 'Money in'));
  const account = el('select', {},
    el('option', { value: 'cash' }, 'Cash'),
    app.state.accounts.filter((a) => a.id !== 'cash').map((a) => el('option', { value: a.id }, a.name)));
  const cat = categorySelect(app, 'uncategorized');
  const form = el('form', { class: 'card inline-form', style: { marginBottom: '12px' } },
    date, desc, amount, type, account, cat,
    el('button', { class: 'btn btn-primary', type: 'submit' }, 'Add'),
    el('button', { class: 'btn', type: 'button', onclick: onDone }, 'Cancel'));
  desc.addEventListener('change', () => {
    if (cat.value === 'uncategorized') cat.value = categorize({ description: desc.value }, app.state.rules);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cents = parseAmountToCents(amount.value);
    if (!cents) { amount.setCustomValidity('Enter an amount like 12.50'); amount.reportValidity(); return; }
    amount.setCustomValidity('');
    if (account.value === 'cash' && !app.state.accounts.some((a) => a.id === 'cash')) {
      app.state.accounts.push({ id: 'cash', name: 'Cash', institution: 'Manual', type: 'cash' });
    }
    const signed = type.value === 'out' ? -Math.abs(cents) : Math.abs(cents);
    app.state.transactions.push({
      id: hash(`manual|${Date.now()}|${desc.value}`), date: date.value, description: desc.value.trim(),
      merchant: merchantName(desc.value), amountCents: signed, accountId: account.value, category: cat.value, manual: true,
    });
    await app.save(['transactions', 'accounts']);
    app.toast('Transaction added.');
    onDone();
  });
  requestAnimationFrame(() => desc.focus());
  return form;
}

export function renderTransactions(root, app) {
  if (app.pendingTransactionFilter) {
    ui.category = app.pendingTransactionFilter.category;
    ui.search = '';
    ui.page = 0;
    app.pendingTransactionFilter = null;
  }
  let adding = false;

  const draw = () => {
    const txns = app.filtered({ categoryIds: ui.category ? [ui.category] : null, search: ui.search });
    const key = {
      date: (t) => t.date, amount: (t) => t.amountCents, merchant: (t) => t.merchant.toLowerCase(),
      category: (t) => app.catName(t.category), account: (t) => app.acctName(t.accountId),
    }[ui.sort];
    txns.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * ui.dir || (a.date < b.date ? 1 : -1));
    const pages = Math.max(1, Math.ceil(txns.length / PAGE_SIZE));
    ui.page = Math.min(ui.page, pages - 1);
    const pageTxns = txns.slice(ui.page * PAGE_SIZE, (ui.page + 1) * PAGE_SIZE);
    const sum = summarize(txns, app.kinds);

    const search = el('input', { type: 'search', placeholder: 'Search merchant, description or note…', value: ui.search, style: { minWidth: '280px' }, 'aria-label': 'Search transactions' });
    search.addEventListener('input', () => {
      ui.search = search.value; ui.page = 0; draw();
      const s = root.querySelector('input[type=search]');
      s.focus(); s.setSelectionRange(s.value.length, s.value.length);
    });
    const catFilter = el('select', { 'aria-label': 'Filter by category' },
      el('option', { value: '' }, 'All categories'),
      app.state.categories.map((c) => el('option', { value: c.id, selected: c.id === ui.category }, c.name)));
    catFilter.addEventListener('change', () => { ui.category = catFilter.value; ui.page = 0; draw(); });

    const th = (label, sortKey, numeric) => {
      const active = ui.sort === sortKey;
      const node = el('th', { class: `sortable${numeric ? ' num' : ''}`, tabindex: 0, 'aria-sort': active ? (ui.dir > 0 ? 'ascending' : 'descending') : 'none' },
        label, active ? (ui.dir > 0 ? ' ↑' : ' ↓') : '');
      const go = () => { if (active) ui.dir *= -1; else { ui.sort = sortKey; ui.dir = sortKey === 'date' || sortKey === 'amount' ? -1 : 1; } draw(); };
      node.addEventListener('click', go);
      node.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      return node;
    };

    const rows = pageTxns.map((t) => {
      const sel = categorySelect(app, t.category, { class: 'cat-select', 'aria-label': `Category for ${t.merchant}` });
      sel.addEventListener('change', () => changeCategory(app, t, sel.value));
      const del = el('button', { class: 'btn btn-small btn-link', title: 'Delete transaction', 'aria-label': `Delete ${t.merchant} transaction` }, '✕');
      del.addEventListener('click', async () => {
        if (!(await app.confirm(`Delete "${t.merchant}" (${fmtMoney(t.amountCents)}) on ${fmtDate(t.date)}?`))) return;
        app.state.transactions = app.state.transactions.filter((x) => x !== t);
        await app.save(['transactions']);
        draw();
      });
      return el('tr', {},
        el('td', { style: { whiteSpace: 'nowrap' } }, fmtDate(t.date)),
        el('td', {}, el('div', { class: 'txn-desc' }, el('span', {}, t.merchant), el('span', { class: 'raw', title: t.description }, t.description))),
        el('td', { class: 'muted' }, app.acctName(t.accountId)),
        el('td', {}, sel),
        el('td', { class: `num${t.amountCents > 0 ? ' amount-in' : ''}` }, t.amountCents > 0 ? `+${fmtMoney(t.amountCents)}` : fmtMoney(t.amountCents)),
        el('td', {}, del));
    });

    const prevBtn = el('button', { class: 'btn btn-small', disabled: ui.page === 0, onclick: () => { ui.page--; draw(); } }, '← Prev');
    const nextBtn = el('button', { class: 'btn btn-small', disabled: ui.page >= pages - 1, onclick: () => { ui.page++; draw(); } }, 'Next →');

    setChildren(root,
      adding ? addTransactionForm(app, () => { adding = false; draw(); }) : null,
      el('section', { class: 'card' },
        el('div', { class: 'toolbar' }, search, catFilter,
          el('span', { class: 'grow muted' }, `${txns.length.toLocaleString()} transactions · ${fmtMoney(sum.spent)} spent · ${fmtMoney(sum.income)} income`),
          el('button', { class: 'btn', onclick: () => { adding = true; draw(); } }, '+ Add transaction')),
        txns.length
          ? el('table', { class: 'data-table' },
            el('thead', {}, el('tr', {}, th('Date', 'date'), th('Merchant', 'merchant'), th('Account', 'account'), th('Category', 'category'), th('Amount', 'amount', true), el('th', {}))),
            el('tbody', {}, rows))
          : el('p', { class: 'muted' }, 'No transactions match these filters.'),
        pages > 1 ? el('div', { class: 'pager' }, el('span', { class: 'muted' }, `Page ${ui.page + 1} of ${pages}`), prevBtn, nextBtn) : null));
  };
  draw();
}
