import { detectRecurring } from '../../lib/analytics.js';
import { fmtMoney, fmtDate, todayISO, daysBetween } from '../../lib/format.js';
import { el, setChildren } from '../../lib/charts.js';

export function renderSubscriptions(root, app) {
  const today = todayISO();
  const recurring = detectRecurring(app.allForAccount(), app.kinds);
  // A charge that's more than a week overdue was probably cancelled.
  const active = recurring.filter((r) => daysBetween(r.nextDate, today) <= 7);
  const lapsed = recurring.filter((r) => daysBetween(r.nextDate, today) > 7);
  const monthly = active.reduce((s, r) => s + r.monthlyCents, 0);

  const table = (list, showNext) => el('table', { class: 'data-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Merchant'), el('th', {}, 'Category'), el('th', {}, 'Frequency'),
      el('th', { class: 'num' }, 'Typical charge'), el('th', { class: 'num' }, 'Per month'),
      el('th', {}, 'Last charge'), el('th', {}, showNext ? 'Next expected' : 'Charges seen'))),
    el('tbody', {}, list.map((r) => el('tr', {},
      el('td', {}, el('strong', {}, r.merchant)),
      el('td', { class: 'muted' }, app.catName(r.category)),
      el('td', {}, el('span', { class: 'pill' }, r.frequency)),
      el('td', { class: 'num' }, fmtMoney(r.typicalCents)),
      el('td', { class: 'num' }, fmtMoney(r.monthlyCents)),
      el('td', {}, fmtDate(r.lastDate)),
      el('td', {}, showNext ? fmtDate(r.nextDate) : String(r.count))))));

  setChildren(root,
    el('div', { class: 'stats', style: { gridTemplateColumns: 'repeat(3, 1fr)' } },
      el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, 'Recurring charges'), el('div', { class: 'stat-value' }, String(active.length))),
      el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, 'Cost per month'), el('div', { class: 'stat-value' }, fmtMoney(monthly))),
      el('div', { class: 'stat' }, el('div', { class: 'stat-label' }, 'Cost per year'), el('div', { class: 'stat-value' }, fmtMoney(monthly * 12)))),
    el('section', { class: 'card', style: { marginBottom: '16px' } },
      el('div', { class: 'card-head' }, el('div', {}, el('h2', {}, 'Active subscriptions & bills'),
        el('p', {}, 'Found automatically: the same merchant charging a similar amount on a regular schedule (weekly to yearly). Review these. Forgotten subscriptions are the easiest money to save.'))),
      active.length ? table(active, true) : el('p', { class: 'muted' }, 'No recurring charges found yet. Detection needs at least 3 charges from the same merchant.')),
    lapsed.length ? el('section', { class: 'card' },
      el('div', { class: 'card-head' }, el('div', {}, el('h2', {}, 'Possibly cancelled'),
        el('p', {}, 'These used to recur but the last expected charge never showed up.'))),
      table(lapsed, false)) : null);
}
