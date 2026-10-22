// Categories, keyword rules, and merchant-name cleanup.
//
// A category's `kind` decides whether it counts as spending:
//   expense  - counted in spending totals and charts
//   income   - paychecks, interest, cashback; shown as income
//   transfer - credit card payments and moves between your own accounts.
//              Excluded from both, otherwise paying a Discover bill from a
//              BofA checking account would double count every purchase.

export const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food & Dining', kind: 'expense' },
  { id: 'groceries', name: 'Groceries', kind: 'expense' },
  { id: 'concerts', name: 'Concerts & Events', kind: 'expense' },
  { id: 'entertainment', name: 'Entertainment', kind: 'expense' },
  { id: 'subscriptions', name: 'Subscriptions', kind: 'expense' },
  { id: 'shopping', name: 'Shopping', kind: 'expense' },
  { id: 'transport', name: 'Transportation', kind: 'expense' },
  { id: 'travel', name: 'Travel', kind: 'expense' },
  { id: 'bills', name: 'Bills & Utilities', kind: 'expense' },
  { id: 'housing', name: 'Housing', kind: 'expense' },
  { id: 'health', name: 'Health & Fitness', kind: 'expense' },
  { id: 'education', name: 'Education', kind: 'expense' },
  { id: 'personal', name: 'Personal Care', kind: 'expense' },
  { id: 'gifts', name: 'Gifts & Donations', kind: 'expense' },
  { id: 'fees', name: 'Fees & Interest', kind: 'expense' },
  { id: 'uncategorized', name: 'Uncategorized', kind: 'expense' },
  { id: 'income', name: 'Income', kind: 'income' },
  { id: 'transfer', name: 'Transfers & Payments', kind: 'transfer' },
];

// Order matters: the first matching rule wins, so specific keywords
// ("UBER EATS", "AMAZON PRIME") come before general ones ("UBER", "AMAZON").
export const BUILTIN_RULES = [
  { category: 'transfer', keywords: ['PAYMENT THANK YOU', 'PAYMENT - THANK YOU', 'PAYMENT RECEIVED', 'INTERNET PAYMENT', 'E-PAYMENT', 'EPAYMENT', 'ONLINE PMT', 'CRD AUTOPAY', 'CREDIT CARD BILL PAYMENT', 'CREDIT CRD', 'ONLINE BANKING TRANSFER', 'TRANSFER TO', 'TRANSFER FROM', 'MOBILE PAYMENT', 'DIRECTPAY', 'AUTOMATIC PAYMENT', 'CARDMEMBER SERV'] },
  { category: 'income', keywords: ['PAYROLL', 'DIRECT DEP', 'DIR DEP', 'SALARY', 'INTEREST EARNED', 'INTEREST PAYMENT', 'CASHBACK BONUS', 'CASH BACK REWARD', 'REDEMPTION CREDIT', 'IRS TREAS', 'TAX REF'] },
  { category: 'food', keywords: ['UBER EATS', 'UBER *EATS', 'UBEREATS', 'DOORDASH', 'GRUBHUB', 'POSTMATES', 'SEAMLESS', 'STARBUCKS', 'DUNKIN', 'MCDONALD', 'CHIPOTLE', 'CHICK-FIL-A', 'CHICKFILA', 'TACO BELL', 'WENDY', 'BURGER KING', 'SUBWAY', 'PANERA', 'DOMINO', 'PIZZA', 'SWEETGREEN', 'CAVA', 'SHAKE SHACK', 'FIVE GUYS', 'PANDA EXPRESS', 'RESTAURANT', 'CAFE', 'COFFEE', 'BAKERY', 'GRILL', 'DINER', 'SUSHI', 'RAMEN', 'TAQUERIA', 'BAR & GRILL', 'BREWING', 'TST*'] },
  { category: 'groceries', keywords: ['WHOLEFDS', 'WHOLE FOODS', 'TRADER JOE', 'KROGER', 'SAFEWAY', 'PUBLIX', 'ALDI', 'WEGMANS', 'HEB', 'H-E-B', 'GIANT', 'STOP & SHOP', 'FOOD LION', 'HARRIS TEETER', 'SPROUTS', 'MEIJER', 'COSTCO', 'SAMS CLUB', "SAM'S CLUB", 'BJS WHOLESALE', 'INSTACART', 'GROCERY', 'MARKET BASKET', 'ALBERTSONS', 'RALPHS', 'VONS', 'HY-VEE', 'WINCO'] },
  { category: 'concerts', keywords: ['TICKETMASTER', 'LIVE NATION', 'LIVENATION', 'STUBHUB', 'SEATGEEK', 'AXS', 'EVENTBRITE', 'VIVID SEATS', 'TICKETWEB', 'DICE.FM', 'SONGKICK', 'BANDSINTOWN', 'TIXR', 'ETIX', 'BOX OFFICE', 'AMPHITHEATER', 'AMPHITHEATRE', 'ARENA', 'FESTIVAL', 'CONCERT'] },
  { category: 'subscriptions', keywords: ['NETFLIX', 'SPOTIFY', 'HULU', 'DISNEY PLUS', 'DISNEYPLUS', 'HBO MAX', 'MAX.COM', 'PARAMOUNT+', 'PEACOCK', 'YOUTUBE PREMIUM', 'YOUTUBEPREMIUM', 'GOOGLE *YOUTUBE', 'APPLE.COM/BILL', 'APPLE MUSIC', 'ICLOUD', 'AMAZON PRIME', 'PRIME VIDEO', 'AUDIBLE', 'PATREON', 'OPENAI', 'CHATGPT', 'ANTHROPIC', 'CLAUDE.AI', 'ADOBE', 'MICROSOFT*', 'DROPBOX', 'NYTIMES', 'DUOLINGO', 'GITHUB'] },
  { category: 'entertainment', keywords: ['AMC THEATRES', 'AMC ', 'REGAL', 'CINEMARK', 'FANDANGO', 'STEAM', 'STEAMGAMES', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'BOWLING', 'TOPGOLF', 'DAVE & BUSTER', 'MUSEUM', 'ZOO', 'THEATER', 'THEATRE'] },
  { category: 'transport', keywords: ['UBER', 'LYFT', 'SHELL', 'EXXON', 'MOBIL', 'CHEVRON', 'BP', 'SUNOCO', 'CITGO', 'MARATHON', 'WAWA', 'SPEEDWAY', 'CIRCLE K', 'GAS', 'FUEL', 'PARKING', 'PARKMOBILE', 'SPOTHERO', 'E-ZPASS', 'EZPASS', 'TOLL', 'MTA', 'MBTA', 'METRO', 'TRANSIT', 'BART', 'CLIPPER', 'VENTRA', 'SEPTA', 'AMTRAK', 'JIFFY LUBE', 'AUTOZONE', 'DMV'] },
  { category: 'travel', keywords: ['AIRLINES', 'AIRWAYS', 'DELTA AIR', 'UNITED AIRLINES', 'AMERICAN AIR', 'SOUTHWEST', 'JETBLUE', 'SPIRIT AIRL', 'FRONTIER', 'ALASKA AIR', 'AIRBNB', 'VRBO', 'MARRIOTT', 'HILTON', 'HYATT', 'HOLIDAY INN', 'HOTEL', 'EXPEDIA', 'BOOKING.COM', 'KAYAK', 'HERTZ', 'AVIS', 'ENTERPRISE RENT', 'BUDGET RENT'] },
  { category: 'bills', keywords: ['VERIZON', 'AT&T', 'T-MOBILE', 'TMOBILE', 'COMCAST', 'XFINITY', 'SPECTRUM', 'COX COMM', 'OPTIMUM', 'GOOGLE FI', 'MINT MOBILE', 'ELECTRIC', 'CON ED', 'CONED', 'PG&E', 'DUKE ENERGY', 'WATER', 'UTILIT', 'GEICO', 'PROGRESSIVE', 'STATE FARM', 'ALLSTATE', 'INSURANCE'] },
  { category: 'housing', keywords: ['RENT', 'APARTMENT', 'APTS', 'MORTGAGE', 'HOA', 'ZILLOW', 'LEASING', 'PROPERTY MGMT', 'HOME DEPOT', 'LOWES', "LOWE'S", 'IKEA'] },
  { category: 'health', keywords: ['CVS', 'WALGREENS', 'RITE AID', 'PHARMACY', 'PLANET FITNESS', 'EQUINOX', 'LA FITNESS', 'ANYTIME FITNESS', 'CRUNCH', 'ORANGETHEORY', 'PELOTON', 'CLASSPASS', 'GYM', 'FITNESS', 'MEDICAL', 'DENTAL', 'DENTIST', 'DOCTOR', 'HOSPITAL', 'CLINIC', 'OPTOMETR', 'URGENT CARE'] },
  { category: 'education', keywords: ['TUITION', 'UNIVERSITY', 'COLLEGE', 'BOOKSTORE', 'COURSERA', 'UDEMY', 'CHEGG', 'PEARSON', 'MCGRAW', 'STUDENT LOAN', 'NAVIENT', 'NELNET'] },
  { category: 'personal', keywords: ['SALON', 'BARBER', 'SEPHORA', 'ULTA', 'SPA', 'NAIL', 'HAIR', 'DRY CLEAN', 'LAUNDR'] },
  { category: 'gifts', keywords: ['GOFUNDME', 'DONATION', 'CHARITY', 'RED CROSS', 'UNICEF', 'FLOWERS', '1-800-FLOWERS', 'GIFT'] },
  { category: 'fees', keywords: ['INTEREST CHARGE', 'LATE FEE', 'ANNUAL FEE', 'OVERDRAFT', 'SERVICE FEE', 'FOREIGN TRANSACTION', 'ATM FEE', 'MAINTENANCE FEE', 'FINANCE CHARGE'] },
  { category: 'shopping', keywords: ['AMAZON', 'AMZN', 'TARGET', 'WALMART', 'WAL-MART', 'BEST BUY', 'APPLE STORE', 'EBAY', 'ETSY', 'NIKE', 'ADIDAS', 'UNIQLO', 'H&M', 'ZARA', 'GAP', 'OLD NAVY', 'NORDSTROM', 'MACY', 'KOHL', 'TJ MAXX', 'TJMAXX', 'MARSHALLS', 'ROSS STORES', 'SHEIN', 'TEMU', 'WAYFAIR', 'BED BATH', 'DOLLAR TREE', 'DOLLAR GENERAL', 'MICRO CENTER', 'GAMESTOP'] },
];

// Many issuers ship their own category column (Discover, Chase, Capital One, Amex).
// It is used as a fallback when no keyword matches.
const SOURCE_CATEGORY_MAP = {
  restaurants: 'food', 'food & drink': 'food', dining: 'food', 'restaurant-restaurant': 'food',
  supermarkets: 'groceries', groceries: 'groceries', 'warehouse clubs': 'groceries',
  gasoline: 'transport', gas: 'transport', automotive: 'transport', 'gas/automotive': 'transport', transportation: 'transport',
  'travel/ entertainment': 'travel', travel: 'travel', airfare: 'travel', lodging: 'travel', 'car rental': 'travel',
  entertainment: 'entertainment',
  merchandise: 'shopping', shopping: 'shopping', 'department stores': 'shopping', 'home improvement': 'housing', home: 'housing',
  'payments and credits': 'transfer', payment: 'transfer', 'payment/credit': 'transfer',
  'awards and rebate credits': 'income',
  'medical services': 'health', 'health & wellness': 'health', healthcare: 'health', 'health care': 'health',
  education: 'education',
  'bills & utilities': 'bills', 'phone/cable': 'bills', utilities: 'bills', insurance: 'bills', 'government services': 'bills',
  'personal': 'personal', 'personal care': 'personal',
  'gifts & donations': 'gifts', 'fees & adjustments': 'fees', fees: 'fees', 'interest': 'fees',
};

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Keyword -> RegExp that only matches on word-ish boundaries, so "BP" matches
 * "BP #8812" but not "BPXYZ", and "GAP" doesn't match "SINGAPORE".
 */
function keywordRegex(keyword) {
  const k = keyword.toUpperCase();
  const left = /^[A-Z0-9]/.test(k) ? '(?:^|[^A-Z0-9])' : '';
  const right = /[A-Z0-9]$/.test(k) ? '(?:$|[^A-Z0-9])' : '';
  return new RegExp(left + escapeRegExp(k) + right);
}

const compiledBuiltins = BUILTIN_RULES.flatMap((r) => r.keywords.map((k) => ({ re: keywordRegex(k), category: r.category })));
const ruleCache = new Map();

function compiledUserRule(rule) {
  let re = ruleCache.get(rule.pattern);
  if (!re) { re = keywordRegex(rule.pattern.trim()); ruleCache.set(rule.pattern, re); }
  return re;
}

/**
 * Pick a category for a transaction.
 * Priority: user rules > built-in keywords > issuer's own category > Uncategorized.
 * @param {{description: string, sourceCategory?: string, amountCents: number}} txn
 * @param {Array<{pattern: string, category: string}>} userRules
 * @param {Set<string>} [validIds] category ids that still exist
 */
export function categorize(txn, userRules = [], validIds) {
  const desc = (txn.description || '').toUpperCase();
  for (const rule of userRules) {
    if (rule.pattern && compiledUserRule(rule).test(desc) && (!validIds || validIds.has(rule.category))) {
      return rule.category;
    }
  }
  for (const { re, category } of compiledBuiltins) {
    if (re.test(desc)) return category;
  }
  const src = (txn.sourceCategory || '').trim().toLowerCase();
  if (src && SOURCE_CATEGORY_MAP[src]) return SOURCE_CATEGORY_MAP[src];
  return 'uncategorized';
}

const PREFIXES = [
  /^(SQ|TST|SP|PP|PAYPAL|GOOGLE|APL|IC|DD|LS|WPY|PY|FS|CKE|BT|PMT)\s?\*\s?/,
  /^(POS|ACH|DBT|DEBIT|CHECKCARD|CHECK CARD|PURCHASE|RECURRING|PRE-?AUTH)\b( (CARD )?(PURCHASE|PMT|PAYMENT|DEBIT))?\s*/,
  /^PURCHASE AUTHORIZED ON \d{1,2}\/\d{1,2}\s*/,
  /^\d{4}\s+/, // CHECKCARD 0105 STARBUCKS
];

const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
// First words of common two-word city names ("NEW YORK", "SAN JOSE", "ST LOUIS").
const CITY_PREFIXES = new Set(['NEW', 'LOS', 'SAN', 'SANTA', 'LAS', 'ST', 'ST.', 'FORT', 'FT', 'EL', 'PALO', 'MOUNTAIN', 'SALT', 'LONG', 'NORTH', 'SOUTH', 'EAST', 'WEST', 'BATON', 'CORPUS', 'GRAND', 'CHULA', 'BEVERLY', 'JERSEY', 'KANSAS', 'OKLAHOMA', 'CARSON', 'COLORADO', 'VIRGINIA']);

/**
 * Card descriptors usually end in "CITY ST". When a state code is present,
 * drop it plus the city (one word, or two for "NEW YORK"-style names),
 * always keeping at least one word of merchant name.
 */
function stripTrailingLocation(s) {
  const words = s.split(' ');
  if (words.length < 2 || !US_STATES.has(words[words.length - 1])) return s;
  words.pop();
  const cityWords = words.length >= 3 && CITY_PREFIXES.has(words[words.length - 2]) ? 2 : 1;
  if (words.length > cityWords) words.splice(-cityWords);
  return words.join(' ');
}

/**
 * Turn a raw statement descriptor into a readable merchant name, e.g.
 *   "SQ *BLUE BOTTLE COFFEE 0012 OAKLAND CA" -> "Blue Bottle Coffee"
 *   "AMAZON.COM*2K4L19 AMZN.COM/BILL WA"     -> "Amazon.com"
 *   "TICKETMASTER 800-653-8000 CA"           -> "Ticketmaster"
 */
export function merchantName(description) {
  let s = (description || '').toUpperCase().replace(/\s+/g, ' ').trim();
  for (let pass = 0; pass < 2; pass++) for (const re of PREFIXES) s = s.replace(re, '');
  s = s.split(/\s#|#\d|\*|\s\d{3,}|\s\d+[-/]\d+|\s(?:WWW\.|HTTPS?:)/)[0].trim();
  // "NETFLIX.COM LOS GATOS CA": a web domain is the whole merchant name.
  const domain = s.match(/^(.*?\.(?:COM|NET|ORG|IO|CO|FM|TV))\b/);
  if (domain) s = domain[1];
  else s = stripTrailingLocation(s);
  s = s.replace(/[\s.,-]+$/, '').trim();
  if (!s) s = (description || '').trim() || 'Unknown';
  return s.toLowerCase().replace(/(^|[\s&/-])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/'S\b/g, "'s");
}
