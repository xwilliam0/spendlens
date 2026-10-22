import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectFormat, normalizeRows, mergeTransactions } from '../src/lib/importers.js';

const load = (f) => readFileSync(new URL(`../sample-data/${f}`, import.meta.url), 'utf8');
const run = (text, accountId = 'a1') => {
  const d = detectFormat(text);
  return { d, ...normalizeRows(d, { mapping: d.mapping, purchasesPositive: d.purchasesPositive, accountId }) };
};

test('Discover: detected, purchases flipped to negative', () => {
  const { d, transactions } = run(load('discover-sample.csv'));
  assert.equal(d.profile.id, 'discover');
  const tm = transactions.find((t) => t.description.startsWith('TICKETMASTER'));
  assert.equal(tm.amountCents, -18430);
  assert.equal(tm.category, 'concerts');
  const pay = transactions.find((t) => t.description.startsWith('INTERNET PAYMENT'));
  assert.equal(pay.amountCents, 41275);
  assert.equal(pay.category, 'transfer');
  const refund = transactions.find((t) => t.description.includes('RETURN'));
  assert.equal(refund.amountCents, 2150);
  assert.equal(refund.category, 'shopping');
});

test('Discover: two identical same-day purchases are both kept', () => {
  const { transactions } = run(load('discover-sample.csv'));
  const chipotle = transactions.filter((t) => t.description.startsWith('CHIPOTLE'));
  assert.equal(chipotle.length, 2);
  assert.notEqual(chipotle[0].id, chipotle[1].id);
});

test('BofA credit card: detected, negative purchases kept as-is', () => {
  const { d, transactions } = run(load('bofa-credit-sample.csv'));
  assert.equal(d.profile.id, 'bofa-credit');
  assert.equal(transactions.find((t) => t.description.startsWith('WHOLEFDS')).amountCents, -8612);
  assert.equal(transactions.find((t) => t.description.startsWith('PAYMENT')).category, 'transfer');
});

test('BofA checking: skips summary block and balance rows', () => {
  const { d, transactions, skipped } = run(load('bofa-checking-sample.csv'));
  assert.equal(d.profile.id, 'bofa-bank');
  assert.equal(transactions.length, 9);
  assert.equal(skipped, 1); // "Beginning balance" row has no amount
  const rent = transactions.find((t) => t.description.includes('RENT'));
  assert.equal(rent.amountCents, -185000);
  assert.equal(rent.category, 'housing');
  assert.equal(transactions.filter((t) => t.category === 'income').length, 2);
});

test('Capital One style debit/credit columns', () => {
  const csv = 'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n' +
    '2026-09-01,2026-09-02,1234,SPOTIFY USA,Entertainment,11.99,\n' +
    '2026-09-05,2026-09-05,1234,CAPITAL ONE AUTOPAY PYMT,Payment/Credit,,200.00\n';
  const { d, transactions } = run(csv);
  assert.equal(d.profile.id, 'capitalone');
  assert.equal(transactions[0].amountCents, -1199);
  assert.equal(transactions[1].amountCents, 20000);
  assert.equal(transactions[1].category, 'transfer');
});

test('unknown bank: columns and sign guessed from content', () => {
  const csv = 'Date,Merchant Name,Charge Amount\n09/01/2026,LOCAL BAKERY,8.50\n09/02/2026,STARBUCKS,5.25\n09/03/2026,REFUND,-3.00\n';
  const { d, transactions } = run(csv);
  assert.equal(d.profile, null);
  assert.equal(d.mapping.description, 1);
  assert.equal(d.purchasesPositive, true);
  assert.equal(transactions[0].amountCents, -850);
});

test('headerless export (Wells Fargo style)', () => {
  const csv = '"09/01/2026","-45.10","*","","SAFEWAY #1234"\n"09/02/2026","-12.00","*","","CHIPOTLE 22"\n"09/03/2026","1500.00","*","","PAYROLL ACME"\n';
  const { d, transactions } = run(csv);
  assert.equal(d.hasHeader, false);
  assert.equal(transactions.length, 3);
  assert.equal(transactions[0].category, 'groceries');
  assert.equal(transactions[0].amountCents, -4510);
});

test('re-importing an overlapping statement skips duplicates', () => {
  const first = run(load('discover-sample.csv')).transactions;
  const again = run(load('discover-sample.csv')).transactions;
  const { merged, added, duplicates } = mergeTransactions(first, again);
  assert.equal(added, 0);
  assert.equal(duplicates, first.length);
  assert.equal(merged.length, first.length);
});
