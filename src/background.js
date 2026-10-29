// Background service worker. Every few hours it refreshes the toolbar badge
// (budgets reset each month even when no new data arrives) and sends the
// import reminder if one is due. Reads never restart the auto-lock timer, and
// while SpendLens is locked transactions can't be read, so only the reminder
// runs then and the badge keeps its last value.

import { loadState, getAlertSettings, updateAlertSettings, LockedError } from './lib/storage.js';
import { updateBadge, reminderDue, daysSince, notify } from './lib/alerts.js';

const CHECK = 'spendlens-check';
const REMINDER = 'import-reminder';

async function check() {
  const settings = await getAlertSettings();
  try {
    await updateBadge(await loadState({ activity: false }), settings);
  } catch (e) {
    if (!(e instanceof LockedError)) throw e;
  }
  if (reminderDue(settings)) {
    await notify(REMINDER, 'Time to update SpendLens',
      `It's been ${daysSince(settings.lastImportAt)} days since your last import. Download fresh CSVs from Discover and your bank to keep budgets and alerts accurate.`);
    await updateAlertSettings({ lastReminderAt: Date.now() });
  }
}

function schedule() {
  chrome.alarms.create(CHECK, { delayInMinutes: 1, periodInMinutes: 360 });
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === CHECK && check());

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
});
