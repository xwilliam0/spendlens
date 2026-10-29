import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeAlert, reminderDue } from '../src/lib/alerts.js';
import { DEFAULT_ALERTS } from '../src/lib/storage.js';

const DAY = 86400000;
const now = Date.UTC(2026, 9, 29);

test('reminders go out after the interval, once per interval, and never when off', () => {
  const s = { ...DEFAULT_ALERTS, lastImportAt: now - 8 * DAY };
  assert.equal(reminderDue(s, now), true);
  assert.equal(reminderDue({ ...s, lastImportAt: now - 6 * DAY }, now), false);
  assert.equal(reminderDue({ ...s, lastReminderAt: now - 2 * DAY }, now), false);
  assert.equal(reminderDue({ ...s, lastReminderAt: now - 7 * DAY }, now), true);
  assert.equal(reminderDue({ ...s, reminders: false }, now), false);
  assert.equal(reminderDue({ ...s, lastImportAt: null }, now), false); // never imported: nothing to remind about
});

test('alert wording', () => {
  const name = () => 'Restaurants';
  assert.equal(describeAlert({ type: 'over', category: 'food', spent: 32000, limitCents: 30000 }, name),
    'Restaurants is over budget: $320.00 of $300.00 this month.');
  assert.match(describeAlert({ type: 'unusual', category: 'food', spent: 34000, projected: 90000, typical: 20000 }, name),
    /running high: \$340\.00 so far this month vs\. about \$200\.00/);
  assert.match(describeAlert({ type: 'unusual', category: 'food', spent: 15000, projected: 45000, typical: 20000 }, name),
    /on pace for \$450\.00 this month vs\. about \$200\.00/);
});
