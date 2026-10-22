// Generates realistic demo data so the dashboard can be explored (and
// screenshotted) without importing real statements.

import { addDays, startOfMonth, addMonths, todayISO, dayOfWeek } from './format.js';
import { categorize, merchantName } from './categorize.js';
import { hash } from './importers.js';

// Deterministic PRNG (mulberry32) so the demo looks the same every time.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SAMPLE_ACCOUNTS = [
  { id: 'demo-discover', name: 'Discover it', institution: 'Discover', type: 'credit' },
  { id: 'demo-bofa-cc', name: 'BofA Customized Cash', institution: 'Bank of America', type: 'credit' },
  { id: 'demo-bofa-chk', name: 'BofA Checking', institution: 'Bank of America', type: 'debit' },
];

const DISCRETIONARY = [
  // [descriptor, min $, max $, weight, account]
  ['STARBUCKS STORE 08812 BOSTON MA', 4, 9, 14, 'demo-discover'],
  ['SQ *BLUE BOTTLE COFFEE BOSTON MA', 5, 8, 5, 'demo-discover'],
  ['CHIPOTLE 2291 CAMBRIDGE MA', 11, 16, 6, 'demo-discover'],
  ['DOORDASH*THAI GARDEN SAN FRANCISCO CA', 22, 48, 5, 'demo-bofa-cc'],
  ['UBER *EATS PENDING HELP.UBER.COM CA', 18, 42, 4, 'demo-bofa-cc'],
  ['TST* ROXYS GRILLED CHEESE BOSTON MA', 13, 24, 3, 'demo-discover'],
  ['WHOLEFDS BOS 10234 BOSTON MA', 35, 120, 6, 'demo-bofa-cc'],
  ['TRADER JOE S #509 BOSTON MA', 28, 85, 7, 'demo-bofa-cc'],
  ['UBER *TRIP HELP.UBER.COM CA', 9, 34, 6, 'demo-discover'],
  ['MBTA CHARLIECARD BOSTON MA', 10, 40, 2, 'demo-bofa-chk'],
  ['SHELL OIL 57444212 BOSTON MA', 30, 55, 3, 'demo-discover'],
  ['AMAZON.COM*2K4L19 AMZN.COM/BILL WA', 12, 140, 8, 'demo-discover'],
  ['TARGET 00012345 BOSTON MA', 15, 90, 4, 'demo-bofa-cc'],
  ['UNIQLO BOSTON MA', 30, 110, 1, 'demo-discover'],
  ['AMC THEATRES BOSTON COMMON MA', 14, 32, 2, 'demo-discover'],
  ['STEAMGAMES.COM 4259522985 WA', 10, 60, 1, 'demo-discover'],
  ['CVS/PHARMACY #01234 BOSTON MA', 8, 40, 3, 'demo-bofa-cc'],
  ['SEPHORA BOSTON MA', 20, 70, 1, 'demo-discover'],
];

const CONCERTS = [
  ['TICKETMASTER 800-653-8000 CA', 85, 260],
  ['LIVE NATION* HOUSE OF BLUES 800-653-8000 CA', 45, 120],
  ['SEATGEEK.COM NEW YORK NY', 70, 210],
  ['AXS.COM*TD GARDEN 888-929-7849 CA', 60, 180],
];

const MONTHLY = [
  // [descriptor, $ amount, day of month, account]
  ['NETFLIX.COM LOS GATOS CA', 15.49, 3, 'demo-discover'],
  ['SPOTIFY USA NEW YORK NY', 11.99, 8, 'demo-discover'],
  ['APPLE.COM/BILL 866-712-7753 CA', 2.99, 12, 'demo-discover'],
  ['PLANET FITNESS BOSTON MA', 24.99, 17, 'demo-bofa-cc'],
  ['VERIZON WIRELESS PAYMENTS', 65.0, 21, 'demo-bofa-chk'],
  ['EVERSOURCE ELECTRIC PAYMENT', 0, 24, 'demo-bofa-chk'], // variable amount
  ['XFINITY COMCAST AUTOPAY', 60.0, 14, 'demo-bofa-chk'],
];

/**
 * @param {number} months how many months of history to generate
 * @returns {{accounts: object[], transactions: object[]}}
 */
export function generateSampleData(months = 7, today = todayISO()) {
  const rand = rng(42);
  const between = (min, max) => Math.round((min + rand() * (max - min)) * 100);
  const pick = (list) => {
    const total = list.reduce((s, x) => s + x[3], 0);
    let r = rand() * total;
    for (const x of list) { r -= x[3]; if (r <= 0) return x; }
    return list[list.length - 1];
  };
  const txns = [];
  const add = (date, description, cents, accountId, sourceCategory) => {
    if (date > today) return;
    const t = { id: hash(`demo|${txns.length}|${date}|${description}`), date, description, merchant: merchantName(description), amountCents: cents, accountId, sourceCategory };
    t.category = categorize(t);
    txns.push(t);
  };

  const start = addMonths(startOfMonth(today), -(months - 1));
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const weekend = [0, 5, 6].includes(dayOfWeek(d));
    const n = Math.floor(rand() * (weekend ? 4 : 2.6));
    for (let i = 0; i < n; i++) {
      const [desc, min, max, , acct] = pick(DISCRETIONARY);
      add(d, desc, -between(min, max), acct);
    }
    const dom = Number(d.slice(8));
    for (const [desc, amt, day, acct] of MONTHLY) {
      if (dom === day) add(d, desc, -(amt ? Math.round(amt * 100) : between(55, 140)), acct);
    }
    if (dom === 1) add(d, 'AVALON APTS RENT PAYMENT', -185000, 'demo-bofa-chk');
    if (dom === 15 || dom === 28) add(d, 'ACME CORP PAYROLL DIRECT DEP', between(2380, 2420), 'demo-bofa-chk');
    if (dom === 20) {
      add(d, 'DISCOVER E-PAYMENT 7744', -between(700, 1100), 'demo-bofa-chk');
      add(d, 'INTERNET PAYMENT - THANK YOU', between(700, 1100), 'demo-discover');
      add(d, 'BANK OF AMERICA CREDIT CARD BILL PAYMENT', -between(400, 800), 'demo-bofa-chk');
      add(d, 'PAYMENT - THANK YOU', between(400, 800), 'demo-bofa-cc');
    }
    if (rand() < 0.035) {
      const [desc, min, max] = CONCERTS[Math.floor(rand() * CONCERTS.length)];
      add(d, desc, -between(min, max), 'demo-discover', 'Travel/ Entertainment');
    }
    if (rand() < 0.012) add(d, 'DELTA AIR LINES ATLANTA GA', -between(180, 420), 'demo-bofa-cc');
    if (rand() < 0.02) add(d, 'AMAZON.COM*RETURN AMZN.COM/BILL WA', between(15, 60), 'demo-discover');
  }
  return { accounts: SAMPLE_ACCOUNTS, transactions: txns };
}
