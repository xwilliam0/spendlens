import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveKey, encryptJSON, decryptJSON, seal, openWithPassphrase, randomBytes, toB64, fromB64, passphraseProblem } from '../src/lib/crypto.js';

const FAST = 1000; // low iteration count keeps unit tests quick; production uses 600k

test('encrypt/decrypt round trip; ciphertext reveals nothing', async () => {
  const key = await deriveKey('correct horse battery staple', randomBytes(16), FAST);
  const secret = { merchant: 'TICKETMASTER', amountCents: -18430 };
  const box = await encryptJSON(key, secret);
  assert.ok(!atob(box.ct).includes('TICKETMASTER'));
  assert.deepEqual(await decryptJSON(key, box), secret);
});

test('fresh IV every time, so identical data encrypts differently', async () => {
  const key = await deriveKey('pass phrase here', randomBytes(16), FAST);
  const a = await encryptJSON(key, { x: 1 });
  const b = await encryptJSON(key, { x: 1 });
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
});

test('wrong passphrase and tampering are both rejected', async () => {
  const salt = randomBytes(16);
  const env = await seal(await deriveKey('right passphrase', salt, FAST), salt, FAST, { ok: true });
  await assert.rejects(openWithPassphrase(env, 'wrong passphrase'));
  const bytes = fromB64(env.ct);
  bytes[0] ^= 1;
  await assert.rejects(openWithPassphrase({ ...env, ct: toB64(bytes) }, 'right passphrase'));
  assert.deepEqual((await openWithPassphrase(env, 'right passphrase')).value, { ok: true });
});

test('envelope records KDF parameters for future upgrades', async () => {
  const salt = randomBytes(16);
  const env = await seal(await deriveKey('p', salt, FAST), salt, FAST, 1);
  assert.equal(env.kdf.name, 'PBKDF2');
  assert.equal(env.kdf.iterations, FAST);
  assert.equal(fromB64(env.kdf.salt).length, 16);
  assert.equal(fromB64(env.iv).length, 12);
});

test('passphrase strength check', () => {
  assert.ok(passphraseProblem('short'));
  assert.ok(passphraseProblem('aaaaaaaaaaaa'));
  assert.ok(passphraseProblem('password123456'));
  assert.equal(passphraseProblem('maple orbit lantern'), null);
});
