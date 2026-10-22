// Passphrase-based encryption using the browser's built-in Web Crypto API.
//
//   key        = PBKDF2-SHA256(passphrase, random 16-byte salt, 600k iterations) -> AES-256-GCM key
//   ciphertext = AES-GCM(key, random 12-byte IV, JSON)
//
// AES-GCM is authenticated: a wrong passphrase or any tampering with the
// stored bytes makes decryption fail, so no separate password hash is stored.
// 600,000 PBKDF2 iterations follows OWASP's 2023 guidance for SHA-256 and
// makes each passphrase guess cost real CPU time.

export const PBKDF2_ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/**
 * Derive an AES-GCM key from a passphrase. The key is extractable only so it
 * can be cached in memory-only session storage while the vault is unlocked.
 */
export async function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportRawKey(key) {
  return toB64(await crypto.subtle.exportKey('raw', key));
}

export async function importRawKey(b64) {
  return crypto.subtle.importKey('raw', fromB64(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

/** Encrypt a JSON-serializable value. A fresh IV is used every time (required for GCM). */
export async function encryptJSON(key, value) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

/** @throws {DOMException} OperationError when the key is wrong or data was modified */
export async function decryptJSON(key, { iv, ct }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct));
  return JSON.parse(dec.decode(pt));
}

/** Build a self-describing encrypted envelope (used for the vault and for backups). */
export async function seal(key, salt, iterations, value) {
  return {
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toB64(salt) },
    cipher: 'AES-GCM-256',
    ...(await encryptJSON(key, value)),
  };
}

/** Open an envelope with a passphrase. @returns {{value, key}} */
export async function openWithPassphrase(envelope, passphrase) {
  const key = await deriveKey(passphrase, fromB64(envelope.kdf.salt), envelope.kdf.iterations);
  return { value: await decryptJSON(key, envelope), key };
}

/** Rough strength feedback: length matters far more than symbol rules. */
export function passphraseProblem(p) {
  if (p.length < 10) return 'Use at least 10 characters. A few random words works well.';
  if (/^(.)\1+$/.test(p) || /^(password|1234567890|qwerty)/i.test(p)) return 'That passphrase is too easy to guess.';
  return null;
}
