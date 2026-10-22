# SpendLens: personal spending tracker for Chrome

SpendLens is a privacy-first Chrome extension (Manifest V3). It turns the CSV exports from your credit cards and bank accounts into a categorized, visual picture of where your money goes. Everything runs locally in the browser. It has no server, no bank logins and no third-party code.

## Features

- **Import from any bank.** Discover, Bank of America (credit and checking), Chase, Capital One, Citi and Amex formats are detected automatically. Any other CSV, even one with no header row, works through a column-mapping dialog with a live preview.
- **Auto-categorization.** About 340 merchant keywords, a priority order (user rules, then built-in keywords, then the issuer's own category), and word-boundary matching so "GAP" doesn't match "SINGAPORE". When you recategorize a transaction, SpendLens offers to create a rule for that merchant.
- **Correct totals.** Money is stored as integer cents. Credit card payments are classed as transfers, so paying your Discover bill from BofA checking isn't counted twice. Refunds reduce their category's total.
- **Duplicate-safe re-imports.** Each transaction gets a deterministic ID, so overlapping statements merge cleanly while two genuine identical purchases on the same day are both kept.
- **Visuals.** Spending-share donut, ranked category bars, spending vs. income by month, a calendar heatmap of daily spending, day-of-week pattern, top merchants and spending by account. Every chart has a hover tooltip, keyboard focus and a **Table** toggle with the same numbers.
- **Insights.** Plain-English notes such as change vs. the previous period, the fastest-growing category, the largest purchase, the weekend share of spending, and your yearly subscription cost.
- **Budgets.** Monthly limits per category with progress meters, an end-of-month projection, and suggested amounts based on your last 3 months.
- **Subscription detection.** Finds recurring charges (weekly through yearly) and flags ones that look cancelled.
- **Export.** A multi-sheet Excel workbook (.xlsx: Transactions, By Category, By Month, Top Merchants, Recurring), CSV, or a full JSON backup with restore.
- **Toolbar popup.** This month's spending, the comparison to the same point last month, top categories and budget alerts.
- **Dark mode**, a colorblind-validated chart palette, and spreadsheet formula-injection protection on CSV export.

## Install (developer mode)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Pin SpendLens, click the icon, then click **Open dashboard**. Use **Try with sample data** or import your own CSVs. There are sample files in `sample-data/`.

### Getting your CSVs

| Bank | Where |
|---|---|
| Discover | All Activity & Statements → choose dates → Download → CSV |
| Bank of America | Account page → **Download** (above transactions) → "Microsoft Excel Format" |
| Chase / Capital One / Citi / Amex | Account activity → Download → CSV |

## Development

```bash
npm test          # 31 unit tests (Node's built-in runner, no dependencies)
npm run serve     # http://localhost:5173/src/dashboard/dashboard.html?demo  (uses localStorage instead of chrome.storage)
npm run icons     # regenerate icons/*.png
npm run package   # dist/spendlens.zip for the Chrome Web Store
```

## Architecture

```
manifest.json            MV3, permissions: storage + unlimitedStorage only, strict CSP
src/lib/                 Pure, DOM-free modules (unit tested in Node)
  csv.js                 RFC 4180 parser and writer (+ formula-injection guard)
  importers.js           Bank format detection, sign normalization, dedupe IDs
  categorize.js          Categories, keyword rules, merchant-name cleanup
  analytics.js           Aggregations, recurring detection, budgets, insights
  format.js              Cents and UTC-safe ISO date helpers
  xlsx.js                .xlsx writer (OOXML + store-only ZIP + CRC-32) from scratch
  charts.js              SVG/HTML charts with tooltips and accessible table twins
  storage.js             chrome.storage.local wrapper (localStorage fallback)
src/dashboard/           Full-page app: views, import dialog, export
src/popup/               Toolbar popup
test/                    Unit tests
```

**Design decisions**

- **CSV import instead of scraping or Plaid.** Scraping bank websites breaks whenever their pages change and touches authenticated sessions. Plaid needs a backend and API secrets. Banks already provide CSV exports, so the extension needs no host permissions and no network access at all.
- **Offline is enforced by the browser, not just promised.** The manifest's Content Security Policy sets `connect-src 'none'` and `img-src 'self'`. Chrome blocks any `fetch`, XHR, WebSocket, beacon or remote image/script from extension pages, even if a bug or a malicious change tried one. The only permissions are `storage` and `unlimitedStorage`, with no host permissions and no content scripts. Untrusted CSV text is only ever inserted with `textContent`, never `innerHTML`.
- **Zero dependencies.** MV3 forbids remotely hosted code, and every library would be bundled into a sensitive finance app. Charts and the Excel writer are hand-built.
- **One sign convention.** Negative means money out. Each bank profile records whether that bank shows purchases as positive numbers (Discover, Amex) or negative (BofA, Chase).

## Roadmap ideas

- TypeScript and a bundler (Vite + CRXJS), plus Playwright end-to-end tests
- Optional encrypted sync via `chrome.storage.sync` or a passphrase-encrypted backup
- Split transactions; tags; notes UI
- Optional bank sync through Plaid with a small backend
- Learning-based categorization (e.g. a naive Bayes model trained on the user's own corrections)
