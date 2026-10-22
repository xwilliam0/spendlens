import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountToCents, parseDate, addMonths, monthRange, endOfMonth, fmtMoneyCompact } from '../src/lib/format.js';

test('parseAmountToCents handles bank number formats', () => {
  assert.equal(parseAmountToCents('12.34'), 1234);
  assert.equal(parseAmountToCents('-12.34'), -1234);
  assert.equal(parseAmountToCents('$1,234.56'), 123456);
  assert.equal(parseAmountToCents('(45.00)'), -4500);
  assert.equal(parseAmountToCents('12.30-'), -1230);
  assert.equal(parseAmountToCents('-1,850.00'), -185000);
  assert.equal(parseAmountToCents('7'), 700);
  assert.equal(parseAmountToCents('.5'), 50);
  assert.equal(parseAmountToCents('0.1'), 10);
  assert.equal(parseAmountToCents(''), null);
  assert.equal(parseAmountToCents('Amount'), null);
});

test('integer cents avoid floating point drift', () => {
  const sum = ['0.10', '0.20'].map(parseAmountToCents).reduce((a, b) => a + b);
  assert.equal(sum, 30);
});

test('parseDate normalizes formats to ISO', () => {
  assert.equal(parseDate('09/02/2026'), '2026-09-02');
  assert.equal(parseDate('9/2/26'), '2026-09-02');
  assert.equal(parseDate('2026-09-02'), '2026-09-02');
  assert.equal(parseDate('Sep 2, 2026'), '2026-09-02');
  assert.equal(parseDate('02 Sep 2026'), '2026-09-02');
  assert.equal(parseDate('02/30/2026'), null);
  assert.equal(parseDate('Beginning balance'), null);
});

test('month helpers', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-01');
  assert.equal(addMonths('2026-01-15', -1), '2025-12-01');
  assert.equal(endOfMonth('2028-02-10'), '2028-02-29');
  assert.deepEqual(monthRange('2025-11-20', '2026-02-03'), ['2025-11', '2025-12', '2026-01', '2026-02']);
});

test('compact money', () => {
  assert.equal(fmtMoneyCompact(128400), '$1,284');
  assert.equal(fmtMoneyCompact(1290000), '$12.9K');
});
