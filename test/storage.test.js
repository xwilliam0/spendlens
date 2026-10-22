import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// In-memory stand-in for chrome.storage so we can inspect exactly what would hit disk.
function fakeArea() {
  const data = {};
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(obj) { for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v); },
    async remove(keys) { for (const k of keys) delete data[k]; },
    async clear() { for (const k of Object.keys(data)) delete data[k]; },
  };
}
const local = fakeArea();
const session = fakeArea();
globalThis.chrome = { storage: { local, session, onChanged: { addListener() {} } } };

let S;
before(async () => { S = await import('../src/lib/storage.js'); });

const PASS = 'maple orbit lantern';
const onDisk = () => JSON.stringify(local.data);

test('full encryption lifecycle', async () => {
  // Plain mode stores readable data.
  const state = await S.loadState();
  state.transactions.push({ id: 't1', date: '2026-09-01', description: 'TICKETMASTER 800-653-8000', merchant: 'Ticketmaster', amountCents: -18430, accountId: 'a', category: 'concerts' });
  await S.saveState(state);
  assert.ok(onDisk().includes('TICKETMASTER'));

  // Enabling encryption removes every plaintext key from disk.
  await S.enableEncryption(state, PASS);
  assert.ok(!onDisk().includes('TICKETMASTER'));
  assert.deepEqual(Object.keys(local.data).sort(), ['vault']);
  assert.equal(local.data.vault.kdf.iterations, 600000);
  assert.ok(!JSON.stringify(local.data).includes(PASS));

  // Unlocked: loads normally; saves stay encrypted.
  const loaded = await S.loadState();
  assert.equal(loaded.transactions[0].merchant, 'Ticketmaster');
  loaded.budgets.concerts = 15000;
  await S.saveState(loaded, ['budgets']);
  assert.ok(!onDisk().includes('Ticketmaster'));
  assert.equal((await S.loadState()).budgets.concerts, 15000);

  // Locking forgets the key; loading now throws.
  await S.lock();
  assert.equal(session.data.key, undefined);
  await assert.rejects(S.loadState(), S.LockedError);
  await assert.rejects(S.saveState(loaded), S.LockedError);

  // Wrong passphrase fails, right one works.
  assert.equal(await S.unlock('not the passphrase'), false);
  assert.equal(await S.unlock(PASS), true);
  assert.equal((await S.loadState()).transactions.length, 1);
});

test('auto-lock after inactivity', async () => {
  await S.setAutoLockMinutes(15);
  session.data.lastActive = Date.now() - 16 * 60000;
  await assert.rejects(S.loadState(), S.LockedError);
  assert.equal(session.data.key, undefined);
  assert.equal(await S.unlock(PASS), true);
});

test('encrypted backups restore only with the passphrase', async () => {
  const state = await S.loadState();
  const backup = JSON.parse(JSON.stringify(await S.makeBackup(state)));
  assert.equal(backup.encrypted, true);
  assert.ok(!JSON.stringify(backup).includes('Ticketmaster'));
  await assert.rejects(S.readBackup(backup, async () => 'wrong'), /wrong passphrase/);
  assert.equal(await S.readBackup(backup, async () => null), null);
  const restored = await S.readBackup(backup, async () => PASS);
  assert.equal(restored.transactions[0].merchant, 'Ticketmaster');
});

test('changing the passphrase re-encrypts; old one stops working', async () => {
  const state = await S.loadState();
  const oldSalt = local.data.vault.kdf.salt;
  await assert.rejects(S.changePassphrase(state, 'wrong current', 'river candle quartz'));
  await S.changePassphrase(state, PASS, 'river candle quartz');
  assert.notEqual(local.data.vault.kdf.salt, oldSalt);
  await S.lock();
  assert.equal(await S.unlock(PASS), false);
  assert.equal(await S.unlock('river candle quartz'), true);
});

test('turning encryption off requires the passphrase and restores plain storage', async () => {
  const state = await S.loadState();
  await assert.rejects(S.disableEncryption(state, 'nope'));
  assert.ok(local.data.vault);
  await S.disableEncryption(state, 'river candle quartz');
  assert.equal(local.data.vault, undefined);
  assert.equal((await S.loadState()).transactions[0].merchant, 'Ticketmaster');
});
