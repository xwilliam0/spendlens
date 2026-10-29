// Persistence layer.
//
// Unencrypted mode: each state key is stored as-is in chrome.storage.local.
// Encrypted mode:   the whole state is one AES-GCM "vault" record in
//                   chrome.storage.local. The derived key is cached only in
//                   chrome.storage.session, which lives in memory, is never
//                   written to disk, is cleared when the browser closes, and is
//                   only readable by this extension's own pages. An idle
//                   timeout locks the vault by deleting that cached key.
//
// Outside Chrome (local dev server) localStorage / sessionStorage stand in.

import { DEFAULT_CATEGORIES } from './categorize.js';
import {
  PBKDF2_ITERATIONS, deriveKey, seal, decryptJSON, openWithPassphrase,
  exportRawKey, importRawKey, randomBytes, fromB64,
} from './crypto.js';

const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

function webStorageBackend(store, prefix) {
  return {
    async get(keys) {
      const out = {};
      for (const k of keys) {
        const v = store.getItem(prefix + k);
        if (v != null) out[k] = JSON.parse(v);
      }
      return out;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) store.setItem(prefix + k, JSON.stringify(v)); },
    async remove(keys) { for (const k of keys) store.removeItem(prefix + k); },
    async clear() {
      for (const k of Object.keys(store)) if (k.startsWith(prefix)) store.removeItem(k);
    },
  };
}

const local = hasChrome ? chrome.storage.local : webStorageBackend(globalThis.localStorage, 'spendlens:');
const session = hasChrome && chrome.storage.session
  ? chrome.storage.session
  : webStorageBackend(globalThis.sessionStorage, 'spendlens-session:');

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
const VAULT = 'vault';
const SECURITY = 'security'; // non-sensitive: { autoLockMinutes }
const DEFAULT_SECURITY = { autoLockMinutes: 15 };
// Kept outside the vault so the background worker can read it while locked.
// Holds only on/off switches and timestamps, never financial data.
const ALERTS = 'alerts';
export const DEFAULT_ALERTS = Object.freeze({
  afterImport: true, // spending check dialog after importing
  badge: true, // alert count on the toolbar icon
  reminders: true, // Windows notification when it's been a while since the last import
  reminderDays: 7,
  lastImportAt: null,
  lastReminderAt: null,
});

/** Thrown when data is encrypted and no unlocked key is available. */
export class LockedError extends Error {
  constructor() { super('SpendLens is locked'); this.name = 'LockedError'; }
}

const pick = (state, keys) => Object.fromEntries(keys.map((k) => [k, state[k]]));

function normalize(raw) {
  const state = structuredClone({ ...DEFAULT_STATE, ...pick(raw, KEYS.filter((k) => raw[k] !== undefined)) });
  // Make sure built-in categories exist even if saved data predates them.
  const ids = new Set(state.categories.map((c) => c.id));
  for (const c of DEFAULT_CATEGORIES) if (!ids.has(c.id)) state.categories.push(c);
  return state;
}

// ---------- Security settings & session key ----------

export async function getSecurity() {
  const { [SECURITY]: sec } = await local.get([SECURITY]);
  return { ...DEFAULT_SECURITY, ...sec };
}

export async function setAutoLockMinutes(minutes) {
  await local.set({ [SECURITY]: { ...(await getSecurity()), autoLockMinutes: minutes } });
}

export async function getAlertSettings() {
  const { [ALERTS]: a } = await local.get([ALERTS]);
  return { ...DEFAULT_ALERTS, ...a };
}

export async function updateAlertSettings(patch) {
  const next = { ...(await getAlertSettings()), ...patch };
  await local.set({ [ALERTS]: next });
  return next;
}

export async function isEncrypted() {
  return Boolean((await local.get([VAULT]))[VAULT]);
}

/** The unlocked key, or null if locked or idle for longer than the auto-lock timeout. */
async function sessionKey() {
  const { key, lastActive } = await session.get(['key', 'lastActive']);
  if (!key) return null;
  const { autoLockMinutes } = await getSecurity();
  if (autoLockMinutes > 0 && Date.now() - (lastActive || 0) > autoLockMinutes * 60000) {
    await lock();
    return null;
  }
  return importRawKey(key);
}

/** Record user activity so the idle timer restarts. */
export async function touch() {
  const { key } = await session.get(['key']);
  if (key) await session.set({ lastActive: Date.now() });
}

/** Forget the key. Data stays encrypted on disk until the passphrase is entered again. */
export async function lock() {
  await session.remove(['key', 'lastActive']);
}

/** Minutes left before auto-lock, or null when not applicable. */
export async function idleMinutesRemaining() {
  const { key, lastActive } = await session.get(['key', 'lastActive']);
  const { autoLockMinutes } = await getSecurity();
  if (!key || !autoLockMinutes) return null;
  return autoLockMinutes - (Date.now() - (lastActive || 0)) / 60000;
}

async function cacheKey(key) {
  await session.set({ key: await exportRawKey(key), lastActive: Date.now() });
}

// ---------- Load / save ----------

/**
 * @param {{activity?: boolean}} [opts] activity: false for background reads,
 *   so they don't restart the auto-lock idle timer
 * @throws {LockedError} when encrypted and locked
 */
export async function loadState({ activity = true } = {}) {
  const raw = await local.get([...KEYS, VAULT]);
  if (!raw[VAULT]) return normalize(raw);
  const key = await sessionKey();
  if (!key) throw new LockedError();
  try {
    const data = await decryptJSON(key, raw[VAULT]);
    if (activity) await touch();
    return normalize(data);
  } catch {
    // Cached key no longer matches (e.g. passphrase changed in another tab).
    await lock();
    throw new LockedError();
  }
}

/**
 * Try a passphrase. On success the key is cached for this browser session.
 * @returns {Promise<boolean>} false for a wrong passphrase
 */
export async function unlock(passphrase) {
  const { [VAULT]: vault } = await local.get([VAULT]);
  if (!vault) return true;
  try {
    const { key } = await openWithPassphrase(vault, passphrase);
    await cacheKey(key);
    return true;
  } catch {
    return false;
  }
}

/** Persist state. In encrypted mode the whole state is re-sealed with a fresh IV. */
export async function saveState(state, keys = KEYS) {
  const { [VAULT]: vault } = await local.get([VAULT]);
  if (!vault) {
    await local.set(pick(state, keys));
    return;
  }
  const key = await sessionKey();
  if (!key) throw new LockedError();
  await local.set({ [VAULT]: await seal(key, fromB64(vault.kdf.salt), vault.kdf.iterations, pick(state, KEYS)) });
  await touch();
}

// ---------- Scrubbing deleted data from disk ----------

/**
 * chrome.storage.local is backed by LevelDB, an append-only database: deleting
 * a key only writes a tombstone, and the old value stays in the database files
 * until a compaction rewrites them. Right after encryption is turned on, that
 * would leave the old plaintext sitting on disk.
 *
 * To force those compactions now, write ~1 MB of random (incompressible) data
 * under each old key name plus nearby filler keys, so LevelDB's level 1 grows
 * past its ~10 MB limit and gets merged into the tables holding the old
 * values, then delete it all. Verified against Chrome's actual database files:
 * old plaintext is gone afterwards. Takes 1-2 seconds; the filler leaves
 * ~25 MB of dead space that later compactions reclaim.
 */
export async function scrubDeletedData(keys = KEYS) {
  if (!hasChrome) return; // localStorage (dev) has no such log and a 5 MB quota
  const junk = () => {
    const bytes = new Uint8Array(768 * 1024);
    for (let o = 0; o < bytes.length; o += 65536) crypto.getRandomValues(bytes.subarray(o, o + 65536));
    let s = '';
    for (let o = 0; o < bytes.length; o += 32768) s += String.fromCharCode(...bytes.subarray(o, o + 32768));
    return btoa(s); // ~1 MB of base64
  };
  // For each old key: the key itself (except the live vault), plus filler that
  // sorts just before ("vaul!...") and just after ("vault~...") it, so the
  // compaction is forced to rewrite whichever table holds the old value.
  const filler = keys.flatMap((k) => [
    ...(k === VAULT ? [] : [k]),
    `${k.slice(0, -1)}!scrub-1`, `${k.slice(0, -1)}!scrub-2`, `${k}~scrub-1`, `${k}~scrub-2`,
  ]);
  // Level 1 must exceed ~10 MB of live data before it compacts into level 2.
  for (let i = 0; filler.length < 16; i++) filler.push(`${keys[0]}~pad-${i}`);
  for (const k of filler) await local.set({ [k]: junk() });
  await local.remove(filler);
}

// ---------- Turning encryption on / off ----------

export async function enableEncryption(state, passphrase) {
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  // Write the vault before removing plaintext, so a crash can never lose data.
  await local.set({ [VAULT]: await seal(key, salt, PBKDF2_ITERATIONS, pick(state, KEYS)) });
  await local.remove(KEYS);
  await cacheKey(key);
  await scrubDeletedData(KEYS); // purge the old plaintext from LevelDB's files
}

/** Re-encrypt under a new passphrase (new salt). Requires the current one. */
export async function changePassphrase(state, currentPassphrase, newPassphrase) {
  const { [VAULT]: vault } = await local.get([VAULT]);
  await openWithPassphrase(vault, currentPassphrase); // throws if wrong
  const salt = randomBytes(16);
  const key = await deriveKey(newPassphrase, salt, PBKDF2_ITERATIONS);
  await local.set({ [VAULT]: await seal(key, salt, PBKDF2_ITERATIONS, pick(state, KEYS)) });
  await cacheKey(key);
  await scrubDeletedData([VAULT]); // drop the copy encrypted under the old passphrase
}

/** Store data unencrypted again. Requires the current passphrase. */
export async function disableEncryption(state, passphrase) {
  const { [VAULT]: vault } = await local.get([VAULT]);
  await openWithPassphrase(vault, passphrase); // throws if wrong
  await local.set(pick(state, KEYS));
  await local.remove([VAULT]);
  await lock();
}

export async function clearState() {
  await local.clear();
  await lock();
  await scrubDeletedData([...KEYS, VAULT]);
}

// ---------- Backups ----------

/** A backup file: encrypted with the vault key when encryption is on. */
export async function makeBackup(state) {
  const meta = { app: 'SpendLens', exportedAt: new Date().toISOString() };
  const { [VAULT]: vault } = await local.get([VAULT]);
  if (!vault) return { ...meta, encrypted: false, ...pick(state, KEYS) };
  const key = await sessionKey();
  if (!key) throw new LockedError();
  return { ...meta, encrypted: true, ...(await seal(key, fromB64(vault.kdf.salt), vault.kdf.iterations, pick(state, KEYS))) };
}

/**
 * Read a backup file's contents.
 * @param {object} file parsed JSON
 * @param {() => Promise<string|null>} askPassphrase called only for encrypted backups
 * @returns {Promise<object|null>} state, or null if the user cancelled
 * @throws {Error} on a wrong passphrase or an invalid file
 */
export async function readBackup(file, askPassphrase) {
  let data = file;
  if (file.encrypted) {
    const passphrase = await askPassphrase();
    if (passphrase == null) return null;
    try {
      data = (await openWithPassphrase(file, passphrase)).value;
    } catch {
      throw new Error('wrong passphrase for this backup');
    }
  }
  if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts)) throw new Error('missing transactions/accounts');
  return normalize(data);
}

/** Call `fn` when another extension page changes data or locks/unlocks. */
export function onExternalChange(fn) {
  // Session changes only matter when the key itself changes (lock/unlock),
  // not on every lastActive heartbeat, which would cause a reload loop.
  if (hasChrome) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' || (area === 'session' && 'key' in changes)) fn();
    });
  } else {
    window.addEventListener('storage', (e) => (e.key?.startsWith('spendlens:') || e.key === 'spendlens-session:key') && fn());
  }
}
