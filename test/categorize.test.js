import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, merchantName } from '../src/lib/categorize.js';

const cat = (description, extra = {}) => categorize({ description, amountCents: -100, ...extra });

test('built-in keywords', () => {
  assert.equal(cat('TICKETMASTER 800-653-8000 CA'), 'concerts');
  assert.equal(cat('LIVE NATION* HOUSE OF BLUES'), 'concerts');
  assert.equal(cat('STARBUCKS STORE 08812 BOSTON MA'), 'food');
  assert.equal(cat('TRADER JOE S #509 BOSTON MA'), 'groceries');
  assert.equal(cat('NETFLIX.COM LOS GATOS CA'), 'subscriptions');
  assert.equal(cat('ACME CORP PAYROLL DIRECT DEP'), 'income');
});

test('specific keywords beat general ones', () => {
  assert.equal(cat('UBER *EATS PENDING'), 'food');
  assert.equal(cat('UBER *TRIP HELP.UBER.COM'), 'transport');
  assert.equal(cat('AMAZON PRIME*2K4L1'), 'subscriptions');
  assert.equal(cat('AMAZON.COM*2K4L19'), 'shopping');
});

test('card payments are transfers, not spending', () => {
  assert.equal(cat('INTERNET PAYMENT - THANK YOU'), 'transfer');
  assert.equal(cat('PAYMENT - THANK YOU'), 'transfer');
  assert.equal(cat('DISCOVER E-PAYMENT 7744'), 'transfer');
  assert.equal(cat('BANK OF AMERICA CREDIT CARD Bill Payment'), 'transfer');
});

test('keywords respect word boundaries', () => {
  assert.equal(cat('BP #8812 BOSTON'), 'transport');
  assert.notEqual(cat('SINGAPORE NOODLE HOUSE'), 'shopping'); // contains "GAP"
  assert.equal(cat('LAS VEGAS SOUVENIRS'), 'uncategorized'); // contains "GAS"
});

test('user rules win over built-ins; issuer category is a fallback', () => {
  const rules = [{ pattern: 'starbucks', category: 'personal' }];
  assert.equal(categorize({ description: 'STARBUCKS #12' }, rules), 'personal');
  assert.equal(cat('JOES CORNER SHOP', { sourceCategory: 'Supermarkets' }), 'groceries');
  assert.equal(cat('MYSTERY LLC'), 'uncategorized');
});

test('rules pointing at deleted categories are ignored', () => {
  const rules = [{ pattern: 'starbucks', category: 'gone' }];
  assert.equal(categorize({ description: 'STARBUCKS #12' }, rules, new Set(['food'])), 'food');
});

test('merchantName cleans statement descriptors', () => {
  assert.equal(merchantName('SQ *BLUE BOTTLE COFFEE 0012 OAKLAND CA'), 'Blue Bottle Coffee');
  assert.equal(merchantName('AMAZON.COM*2K4L19 AMZN.COM/BILL WA'), 'Amazon.com');
  assert.equal(merchantName('TICKETMASTER 800-653-8000 CA'), 'Ticketmaster');
  assert.equal(merchantName('STARBUCKS STORE 08812 BOSTON MA'), 'Starbucks Store');
  assert.equal(merchantName('CHECKCARD 0928 MBTA CHARLIECARD BOSTON MA'), 'Mbta Charliecard');
  assert.equal(merchantName('NETFLIX.COM LOS GATOS CA'), 'Netflix.com');
  assert.equal(merchantName('APPLE.COM/BILL 866-712-7753 CA'), 'Apple.com');
  assert.equal(merchantName('SPOTIFY USA NEW YORK NY'), 'Spotify Usa');
  assert.equal(merchantName('PLANET FITNESS BOSTON MA'), 'Planet Fitness');
  assert.equal(merchantName('SEPHORA BOSTON MA'), 'Sephora');
  assert.equal(merchantName('DELTA AIR LINES ATLANTA GA'), 'Delta Air Lines');
});
