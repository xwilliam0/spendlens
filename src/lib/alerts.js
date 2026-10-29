// Spending alerts: wording, the toolbar badge, and Windows notifications.
// Used by extension pages and the background worker. Outside Chrome (dev
// server, tests) the chrome.* calls are skipped.

import { kindMap, spendingAlerts } from './analytics.js';
import { fmtMoney, todayISO } from './format.js';

const DAY = 86400000;
const hasChrome = typeof chrome !== 'undefined';

export const alertKey = (a) => `${a.type}:${a.category}`;

export function alertsFor(state, today = todayISO()) {
  return spendingAlerts(state.transactions, kindMap(state.categories), state.budgets, today);
}

/** One plain-English sentence per alert. @param {(id: string) => string} name */
export function describeAlert(a, name) {
  const cat = name(a.category);
  switch (a.type) {
    case 'over': return `${cat} is over budget: ${fmtMoney(a.spent)} of ${fmtMoney(a.limitCents)} this month.`;
    case 'pace': return `${cat} is on pace for ${fmtMoney(a.projected)} this month, over its ${fmtMoney(a.limitCents)} budget.`;
    default: return a.spent >= a.typical
      ? `${cat} is running high: ${fmtMoney(a.spent)} so far this month vs. about ${fmtMoney(a.typical)} in a typical month.`
      : `${cat} is on pace for ${fmtMoney(a.projected)} this month vs. about ${fmtMoney(a.typical)} in a typical month.`;
  }
}

/** Show the alert count on the toolbar icon, or clear it when off or there's nothing to show. */
export async function updateBadge(state, settings) {
  if (!hasChrome || !chrome.action) return;
  const alerts = settings.badge && state ? alertsFor(state) : [];
  const n = alerts.length;
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
  await chrome.action.setTitle({ title: n ? `SpendLens: ${n} spending alert${n === 1 ? '' : 's'}` : 'SpendLens' });
  if (n) await chrome.action.setBadgeBackgroundColor({ color: alerts.some((a) => a.type === 'over') ? '#d03b3b' : '#b35c00' });
}

/** True when an import reminder should go out now. */
export function reminderDue(settings, now = Date.now()) {
  if (!settings.reminders || !settings.lastImportAt) return false;
  const gap = settings.reminderDays * DAY;
  return now - settings.lastImportAt >= gap && now - (settings.lastReminderAt || 0) >= gap;
}

export const daysSince = (ms, now = Date.now()) => Math.floor((now - ms) / DAY);

/** @returns {Promise<boolean>} false where notifications aren't available */
export async function notify(id, title, message) {
  if (!hasChrome || !chrome.notifications) return false;
  await chrome.notifications.create(id, {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title, message,
  });
  return true;
}
