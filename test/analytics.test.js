import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CATEGORIES } from '../src/lib/categorize.js';
import {
  kindMap, summarize, spendingByCategory, monthlyTotals, detectRecurring, previousPeriod, budgetStatus, filterTransactions, spendingAlerts,
} from '../src/lib/analytics.js';
import { generateSampleData } from '../src/lib/sample.js';

const kinds = kindMap(DEFAULT_CATEGORIES);
let n = 0;
const t = (date, amountCents, category, merchant = 'M') => ({ id: String(n++), date, amountCents, category, merchant, description: merchant, accountId: 'a' });

test('transfers are excluded and refunds reduce spending', () => {
  const txns = [
    t('2026-09-01', -5000, 'food'),
    t('2026-09-02', 1500, 'food'), // refund
    t('2026-09-03', -40000, 'transfer'), // paying the card from checking
    t('2026-09-03', 40000, 'transfer'), // payment received on the card
    t('2026-09-15', 250000, 'income'),
  ];
  const s = summarize(txns, kinds);
  assert.equal(s.spent, 3500);
  assert.equal(s.income, 250000);
  assert.equal(s.net, 246500);
  assert.equal(s.count, 3);
  assert.deepEqual(spendingByCategory(txns, kinds), [{ category: 'food', cents: 3500, count: 2 }]);
});

test('monthlyTotals fills empty months', () => {
  const rows = monthlyTotals([t('2026-07-10', -100, 'food'), t('2026-09-10', -300, 'food')], kinds);
  assert.deepEqual(rows.map((r) => [r.month, r.spent]), [['2026-07', 100], ['2026-08', 0], ['2026-09', 300]]);
});

test('detectRecurring finds monthly subscriptions and ignores irregular spending', () => {
  const txns = [
    ...['2026-05-03', '2026-06-03', '2026-07-03', '2026-08-03', '2026-09-03'].map((d) => t(d, -1549, 'subscriptions', 'Netflix.com')),
    ...['2026-05-02', '2026-05-09', '2026-06-20', '2026-06-21', '2026-08-30'].map((d, i) => t(d, -(500 + i * 700), 'food', 'Chipotle')),
  ];
  const found = detectRecurring(txns, kinds);
  assert.equal(found.length, 1);
  assert.equal(found[0].merchant, 'Netflix.com');
  assert.equal(found[0].frequency, 'Monthly');
  assert.equal(found[0].monthlyCents, 1549);
  assert.equal(found[0].nextDate, '2026-10-03');
});

test('previousPeriod has the same length', () => {
  assert.deepEqual(previousPeriod('2026-09-01', '2026-09-30'), { from: '2026-08-02', to: '2026-08-31' });
});

test('budgetStatus projects to month end', () => {
  const txns = [t('2026-09-01', -10000, 'food'), t('2026-09-10', -5000, 'food')];
  const [b] = budgetStatus(txns, kinds, { food: 30000 }, '2026-09-15');
  assert.equal(b.spent, 15000);
  assert.equal(b.projected, 30000);
  assert.equal(b.ratio, 0.5);
});

test('spendingAlerts: over budget, on pace to exceed, and quiet early in the month', () => {
  const txns = [t('2026-09-02', -32000, 'food'), t('2026-09-03', -6000, 'shopping'), t('2026-09-09', -6000, 'shopping')];
  const budgets = { food: 30000, shopping: 25000, groceries: 40000 };
  assert.deepEqual(spendingAlerts(txns, kinds, budgets, '2026-09-10').map((a) => [a.type, a.category]),
    [['over', 'food'], ['pace', 'shopping']]); // shopping: $120 in 10 days -> $360 projected
  assert.deepEqual(spendingAlerts(txns, kinds, budgets, '2026-09-03').map((a) => a.type), ['over']);
});

test('spendingAlerts: unbudgeted category well above its usual month', () => {
  const history = ['2026-06', '2026-07', '2026-08'].flatMap((m) => [t(`${m}-05`, -20000, 'food'), t(`${m}-06`, -9000, 'groceries')]);
  const txns = [...history, t('2026-09-03', -18000, 'food'), t('2026-09-08', -16000, 'food'), t('2026-09-08', -9500, 'groceries')];
  const [a, ...rest] = spendingAlerts(txns, kinds, {}, '2026-09-10');
  assert.equal(rest.length, 0); // groceries: one big monthly trip, not a spike
  assert.deepEqual([a.type, a.category, a.spent, a.typical], ['unusual', 'food', 34000, 20000]);
  // A budget on the category replaces the comparison with the budget rules.
  assert.equal(spendingAlerts(txns, kinds, { food: 50000 }, '2026-09-10').some((x) => x.type === 'unusual'), false);
  // Early warning: under a typical month so far, but far ahead of a typical day 10.
  const early = [...['2026-06', '2026-07', '2026-08'].map((m) => t(`${m}-05`, -40000, 'food')), t('2026-09-04', -35000, 'food')];
  const [p] = spendingAlerts(early, kinds, {}, '2026-09-10');
  assert.deepEqual([p.type, p.category, p.projected], ['unusual', 'food', 105000]);
  // Not enough history: no comparison at all.
  assert.deepEqual(spendingAlerts(txns.slice(4), kinds, {}, '2026-09-10'), []);
});

test('sample data is internally consistent', () => {
  const { transactions } = generateSampleData(6, '2026-10-22');
  assert.ok(transactions.length > 300, String(transactions.length));
  assert.ok(transactions.every((x) => x.date <= '2026-10-22'));
  const cats = new Set(transactions.map((x) => x.category));
  for (const c of ['food', 'groceries', 'concerts', 'subscriptions', 'income', 'transfer', 'housing']) assert.ok(cats.has(c), c);
  const recurring = detectRecurring(transactions, kinds).map((r) => r.merchant);
  assert.ok(recurring.includes('Netflix.com'), recurring.join(', '));
  assert.ok(filterTransactions(transactions, { search: 'ticketmaster' }).every((x) => x.category === 'concerts'));
});
