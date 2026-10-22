import { budgetStatus, filterTransactions, spendingByCategory, monthlyTotals } from '../../lib/analytics.js';
import { fmtMoney, parseAmountToCents, todayISO, startOfMonth, addMonths, endOfMonth, fmtMonth } from '../../lib/format.js';
import { el } from '../../lib/charts.js';

// Status always pairs color with an icon and a label, never color alone.
function statusOf(b) {
  if (b.ratio >= 1) return { color: 'var(--critical)', icon: '✕', label: 'Over budget' };
  if (b.projected > b.limitCents) return { color: 'var(--serious)', icon: '!', label: 'On pace to exceed' };
  if (b.ratio >= 0.8) return { color: 'var(--warning)', icon: '!', label: 'Close to limit' };
  return { color: 'var(--good)', icon: '✓', label: 'On track' };
}

export function renderBudgets(root, app) {
  const today = todayISO();
  const statuses = new Map(budgetStatus(app.state.transactions, app.kinds, app.state.budgets, today).map((b) => [b.category, b]));
  const monthTxns = filterTransactions(app.state.transactions, { from: startOfMonth(today), to: today });
  const spentNow = new Map(spendingByCategory(monthTxns, app.kinds).map((r) => [r.category, r.cents]));

  // Suggest a budget from the average of the last 3 full months.
  const histFrom = addMonths(startOfMonth(today), -3);
  const histTo = endOfMonth(addMonths(startOfMonth(today), -1));
  const hist = filterTransactions(app.state.transactions, { from: histFrom, to: histTo });
  const avg = new Map(spendingByCategory(hist, app.kinds).map((r) => [r.category, Math.round(r.cents / 3)]));

  const cats = app.expenseCategories().slice().sort((a, b) => {
    const ra = statuses.get(a.id)?.ratio ?? -1, rb = statuses.get(b.id)?.ratio ?? -1;
    return rb - ra || (spentNow.get(b.id) || 0) - (spentNow.get(a.id) || 0);
  });

  const totalBudget = [...statuses.values()].reduce((s, b) => s + b.limitCents, 0);
  const totalSpent = [...statuses.values()].reduce((s, b) => s + b.spent, 0);

  const rows = cats.map((c) => {
    const b = statuses.get(c.id);
    const spent = spentNow.get(c.id) || 0;
    const input = el('input', {
      type: 'text', inputmode: 'decimal', class: 'budget-input', 'aria-label': `Monthly budget for ${c.name}`,
      placeholder: avg.get(c.id) ? `avg ${fmtMoney(avg.get(c.id)).replace('.00', '')}` : 'No budget',
      value: app.state.budgets[c.id] ? (app.state.budgets[c.id] / 100).toFixed(0) : '',
    });
    input.addEventListener('change', async () => {
      const cents = parseAmountToCents(input.value);
      if (cents && cents > 0) app.state.budgets[c.id] = cents;
      else delete app.state.budgets[c.id];
      await app.save(['budgets']);
      app.rerender();
    });
    let meter = el('div', { class: 'muted', style: { fontSize: '12.5px' } }, spent ? `${fmtMoney(spent)} spent, no budget set` : '');
    let status = el('span');
    let numbers = el('span', { class: 'num muted' }, spent ? fmtMoney(spent) : '');
    if (b) {
      const s = statusOf(b);
      meter = el('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': b.limitCents, 'aria-valuenow': b.spent, 'aria-label': `${c.name} budget used` },
        el('span', { style: { width: `${Math.min(100, b.ratio * 100)}%`, background: s.color } }));
      status = el('span', { class: 'status' }, el('span', { class: 'status-icon', style: { background: s.color } }, s.icon), s.label);
      numbers = el('span', { class: 'num' }, `${fmtMoney(b.spent)} / ${fmtMoney(b.limitCents).replace('.00', '')}`);
    }
    return el('div', { class: 'budget-row' }, el('strong', {}, c.name), meter, numbers, status, input);
  });

  const months = monthlyTotals(filterTransactions(app.state.transactions, { from: addMonths(startOfMonth(today), -5), to: today }), app.kinds, addMonths(startOfMonth(today), -5), today);

  root.replaceChildren(
    el('div', { class: 'stats', style: { gridTemplateColumns: 'repeat(4, 1fr)' } },
      el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, `Budgeted for ${fmtMonth(today.slice(0, 7), true)}`), el('div', { class: 'stat-value' }, fmtMoney(totalBudget))),
      el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, 'Spent in budgeted categories'), el('div', { class: 'stat-value' }, fmtMoney(totalSpent))),
      el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, 'Left to spend'), el('div', { class: 'stat-value' }, fmtMoney(Math.max(0, totalBudget - totalSpent)))),
      el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, '6-month average spending'), el('div', { class: 'stat-value' }, fmtMoney(Math.round(months.reduce((s, m) => s + m.spent, 0) / months.length))))),
    el('section', { class: 'card' },
      el('div', { class: 'card-head' }, el('div', {},
        el('h2', {}, 'Monthly budgets'),
        el('p', {}, 'Type a monthly limit for any category. The placeholder shows your average over the last 3 months. "On pace to exceed" projects your current daily rate to the end of the month.'))),
      rows));
}
