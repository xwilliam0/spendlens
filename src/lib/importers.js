// Detect which bank a CSV came from and normalize it into transactions.
//
// Every bank exports a different shape, and they disagree on sign:
// Discover and Amex show purchases as POSITIVE numbers, while Bank of America,
// Chase and most checking accounts show them as NEGATIVE. Internally every
// transaction uses one convention: negative = money out, positive = money in.

import { parseCSV } from './csv.js';
import { parseAmountToCents, parseDate } from './format.js';
import { categorize, merchantName } from './categorize.js';

const norm = (h) => String(h || '').trim().toLowerCase();

/**
 * Known export formats. `columns` maps our fields to header names.
 * `purchasesPositive` = true when the bank shows charges as positive numbers.
 */
export const PROFILES = [
  {
    id: 'discover', name: 'Discover Card', institution: 'Discover', accountType: 'credit',
    required: ['trans. date', 'post date', 'description', 'amount', 'category'],
    columns: { date: 'trans. date', description: 'description', amount: 'amount', category: 'category' },
    purchasesPositive: true,
  },
  {
    id: 'bofa-credit', name: 'Bank of America Credit Card', institution: 'Bank of America', accountType: 'credit',
    required: ['posted date', 'reference number', 'payee', 'amount'],
    columns: { date: 'posted date', description: 'payee', amount: 'amount' },
    purchasesPositive: false,
  },
  {
    id: 'bofa-bank', name: 'Bank of America Checking / Savings', institution: 'Bank of America', accountType: 'debit',
    required: ['date', 'description', 'amount', 'running bal.'],
    columns: { date: 'date', description: 'description', amount: 'amount' },
    purchasesPositive: false,
  },
  {
    id: 'chase-credit', name: 'Chase Credit Card', institution: 'Chase', accountType: 'credit',
    required: ['transaction date', 'post date', 'description', 'category', 'type', 'amount'],
    columns: { date: 'transaction date', description: 'description', amount: 'amount', category: 'category' },
    purchasesPositive: false,
  },
  {
    id: 'chase-bank', name: 'Chase Checking / Savings', institution: 'Chase', accountType: 'debit',
    required: ['details', 'posting date', 'description', 'amount', 'balance'],
    columns: { date: 'posting date', description: 'description', amount: 'amount' },
    purchasesPositive: false,
  },
  {
    id: 'capitalone', name: 'Capital One Card', institution: 'Capital One', accountType: 'credit',
    required: ['transaction date', 'posted date', 'card no.', 'description', 'category', 'debit', 'credit'],
    columns: { date: 'transaction date', description: 'description', debit: 'debit', credit: 'credit', category: 'category' },
    purchasesPositive: true,
  },
  {
    id: 'citi', name: 'Citi Card', institution: 'Citi', accountType: 'credit',
    required: ['status', 'date', 'description', 'debit', 'credit'],
    columns: { date: 'date', description: 'description', debit: 'debit', credit: 'credit' },
    purchasesPositive: true,
  },
  {
    id: 'amex', name: 'American Express', institution: 'American Express', accountType: 'credit',
    required: ['date', 'description', 'amount'],
    anyOf: ['appears on your statement as', 'extended details', 'card member', 'account #'],
    columns: { date: 'date', description: 'description', amount: 'amount', category: 'category' },
    purchasesPositive: true,
  },
];

function profileMatches(profile, headers) {
  if (!profile.required.every((r) => headers.includes(r))) return false;
  return !profile.anyOf || profile.anyOf.some((r) => headers.includes(r));
}

const looksLikeHeader = (row) => {
  const h = row.map(norm);
  return h.some((c) => c.includes('date')) && h.some((c) => /amount|debit|credit|withdrawal|deposit/.test(c));
};

/** Guess column indexes from header names for banks we don't have a profile for. */
export function guessMapping(headers) {
  const h = headers.map(norm);
  const find = (...patterns) => {
    for (const p of patterns) {
      const i = h.findIndex((c) => p.test(c));
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    date: find(/^trans(action)?\.? date/, /^date$/, /date/),
    description: find(/^description$/, /desc/, /payee|merchant|name/, /memo|details/),
    amount: find(/^amount$/, /amount/),
    debit: find(/^debit$/, /debit|withdrawal|charge/),
    credit: find(/^credit$/, /^credit|deposit/),
    category: find(/category/),
  };
}

/**
 * When a generic file has a single amount column we can't know the sign
 * convention for sure. Credit card exports are mostly positive charges,
 * bank exports are mostly negative debits, so go with the majority. The
 * import dialog shows this guess so the user can flip it.
 */
function guessPurchasesPositive(rows, amountIdx) {
  if (amountIdx < 0) return false;
  let pos = 0, neg = 0;
  for (const r of rows) {
    const c = parseAmountToCents(r[amountIdx]);
    if (c > 0) pos++; else if (c < 0) neg++;
  }
  return pos > neg;
}

/**
 * Inspect a CSV file.
 * @returns {{profile: object|null, headers: string[], rows: string[][], mapping: object,
 *            purchasesPositive: boolean, hasHeader: boolean}}
 */
export function detectFormat(text) {
  const all = parseCSV(text);
  // Some banks (BofA checking) put a summary block above the real header row.
  let headerIdx = all.slice(0, 40).findIndex(looksLikeHeader);
  const hasHeader = headerIdx >= 0;
  if (!hasHeader) headerIdx = -1;
  const headers = hasHeader ? all[headerIdx].map((c) => c.trim()) : (all[0] || []).map((_, i) => `Column ${i + 1}`);
  const rows = all.slice(headerIdx + 1);
  const normHeaders = headers.map(norm);

  const profile = hasHeader ? PROFILES.find((p) => profileMatches(p, normHeaders)) || null : null;
  let mapping;
  if (profile) {
    mapping = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, category: -1 };
    for (const [field, name] of Object.entries(profile.columns)) mapping[field] = normHeaders.indexOf(name);
  } else if (hasHeader) {
    mapping = guessMapping(headers);
  } else {
    mapping = guessHeaderlessMapping(rows);
  }
  if (mapping.amount >= 0) { mapping.debit = -1; mapping.credit = -1; }

  const purchasesPositive = profile ? profile.purchasesPositive : guessPurchasesPositive(rows, mapping.amount);
  return { profile, headers, rows, mapping, purchasesPositive, hasHeader };
}

/** Headerless exports (e.g. Wells Fargo): find columns by their content. */
function guessHeaderlessMapping(rows) {
  const sample = rows.slice(0, 20);
  const cols = sample[0]?.length || 0;
  const score = (test) => {
    let best = -1, bestCount = 0;
    for (let i = 0; i < cols; i++) {
      const n = sample.filter((r) => test(r[i])).length;
      if (n > bestCount) { best = i; bestCount = n; }
    }
    return best;
  };
  const date = score((v) => parseDate(v) != null);
  const amount = score((v) => /\d/.test(v || '') && parseAmountToCents(v) != null && parseDate(v) == null);
  const description = score((v) => /[a-z]{3,}/i.test(v || '') && parseAmountToCents(v) == null);
  return { date, description, amount, debit: -1, credit: -1, category: -1 };
}

/** 32-bit FNV-1a hash, hex encoded: stable ids without crypto APIs. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Convert parsed rows into transactions.
 *
 * Each transaction gets a deterministic id built from account, date, amount,
 * description, and how many identical rows came before it in the same file.
 * Re-importing an overlapping statement therefore produces the same ids (and
 * gets de-duplicated), while two genuine $5.00 coffees on the same day stay
 * as two transactions.
 */
export function normalizeRows(detection, { mapping, purchasesPositive, accountId, rules = [], validIds }) {
  const transactions = [];
  let skipped = 0;
  const seen = new Map();
  const cell = (row, idx) => (idx >= 0 && idx < row.length ? row[idx].trim() : '');

  for (const row of detection.rows) {
    const date = parseDate(cell(row, mapping.date));
    let cents = null;
    if (mapping.amount >= 0) {
      cents = parseAmountToCents(cell(row, mapping.amount));
      if (cents != null && purchasesPositive) cents = -cents;
    } else {
      const debit = parseAmountToCents(cell(row, mapping.debit));
      const credit = parseAmountToCents(cell(row, mapping.credit));
      if (debit) cents = -Math.abs(debit);
      else if (credit) cents = Math.abs(credit);
      else if (debit === 0 || credit === 0) cents = 0;
    }
    const description = cell(row, mapping.description).replace(/\s+/g, ' ');
    if (!date || cents == null || cents === 0 || !description) { skipped++; continue; }

    const key = `${accountId}|${date}|${cents}|${description.toUpperCase()}`;
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);

    const sourceCategory = cell(row, mapping.category);
    const txn = {
      id: hash(`${key}#${n}`),
      date,
      description,
      merchant: merchantName(description),
      amountCents: cents,
      accountId,
      sourceCategory: sourceCategory || undefined,
    };
    txn.category = categorize(txn, rules, validIds);
    transactions.push(txn);
  }
  return { transactions, skipped };
}

/** Merge new transactions into existing ones, skipping ids already present. */
export function mergeTransactions(existing, incoming) {
  const ids = new Set(existing.map((t) => t.id));
  const added = incoming.filter((t) => !ids.has(t.id));
  return { merged: existing.concat(added), added: added.length, duplicates: incoming.length - added.length };
}
