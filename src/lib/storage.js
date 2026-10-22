// Persistence layer. Uses chrome.storage.local inside the extension and falls
// back to localStorage when the pages are opened outside Chrome (local dev
// server, screenshots), so the UI can be developed without reloading the
// extension each time.

import { DEFAULT_CATEGORIES } from './categorize.js';

const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export const DEFAULT_STATE = Object.freeze({
  schemaVersion: 1,
  transactions: [],
  accounts: [],
  categories: DEFAULT_CATEGORIES,
  rules: [], // [{id, pattern, category}]
  budgets: {}, // categoryId -> monthly limit in cents
  settings: { range: 'last90' },
});

const KEYS = Object.keys(DEFAULT_STATE);

export async function loadState() {
  let raw;
  if (hasChromeStorage) {
    raw = await chrome.storage.local.get(KEYS);
  } else {
    raw = {};
    for (const k of KEYS) {
      const v = localStorage.getItem(`spendlens:${k}`);
      if (v != null) raw[k] = JSON.parse(v);
    }
  }
  const state = structuredClone({ ...DEFAULT_STATE, ...raw });
  // Make sure built-in categories exist even if saved data predates them.
  const ids = new Set(state.categories.map((c) => c.id));
  for (const c of DEFAULT_CATEGORIES) if (!ids.has(c.id)) state.categories.push(c);
  return state;
}

/** Persist only the given keys of state. */
export async function saveState(state, keys = KEYS) {
  const patch = {};
  for (const k of keys) patch[k] = state[k];
  if (hasChromeStorage) {
    await chrome.storage.local.set(patch);
  } else {
    for (const [k, v] of Object.entries(patch)) localStorage.setItem(`spendlens:${k}`, JSON.stringify(v));
  }
}

export async function clearState() {
  if (hasChromeStorage) await chrome.storage.local.clear();
  else for (const k of KEYS) localStorage.removeItem(`spendlens:${k}`);
}

/** Call `fn` when another extension page (e.g. the dashboard) changes data. */
export function onExternalChange(fn) {
  if (hasChromeStorage) chrome.storage.onChanged.addListener((_, area) => area === 'local' && fn());
  else window.addEventListener('storage', (e) => e.key?.startsWith('spendlens:') && fn());
}
