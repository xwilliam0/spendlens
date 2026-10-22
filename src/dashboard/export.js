// Export filtered data as CSV, a multi-sheet Excel workbook, or a JSON backup.

import { toCSV } from '../lib/csv.js';
import { buildXlsx } from '../lib/xlsx.js';
import { spendingByCategory, spendingByMerchant, monthlyTotals, detectRecurring, summarize } from '../lib/analytics.js';
import { todayISO } from '../lib/format.js';
import { makeBackup } from '../lib/storage.js';

function download(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const KIND_LABEL = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };

function rangeSuffix(app) {
  const { from, to } = app.range();
  return `${from}_to_${to}`;
}

function sortedTxns(app) {
  return app.filtered().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function exportCSV(app) {
  const rows = [['Date', 'Merchant', 'Description', 'Category', 'Type', 'Account', 'Amount']];
  for (const t of sortedTxns(app)) {
    rows.push([t.date, t.merchant, t.description, app.catName(t.category), KIND_LABEL[app.kinds.get(t.category)] || 'Expense',
      app.acctName(t.accountId), Number((t.amountCents / 100).toFixed(2))]);
  }
  download(toCSV(rows), `spendlens-transactions_${rangeSuffix(app)}.csv`, 'text/csv;charset=utf-8');
  app.toast(`Exported ${rows.length - 1} transactions.`);
}

export function exportXLSX(app) {
  const txns = sortedTxns(app);
  const { from, to } = app.range();
  const total = summarize(txns, app.kinds);
  const byCat = spendingByCategory(txns, app.kinds);
  const months = monthlyTotals(txns, app.kinds, from, to);
  const merchants = spendingByMerchant(txns, app.kinds, 100);
  const recurring = detectRecurring(app.allForAccount(), app.kinds);
  const $ = (cents) => cents / 100;

  const bytes = buildXlsx([
    {
      name: 'Transactions',
      columns: [
        { header: 'Date', type: 'date', width: 12 }, { header: 'Merchant', width: 26 }, { header: 'Description', width: 44 },
        { header: 'Category', width: 20 }, { header: 'Type', width: 10 }, { header: 'Account', width: 22 },
        { header: 'Amount', type: 'currency', width: 13 },
      ],
      rows: txns.map((t) => [t.date, t.merchant, t.description, app.catName(t.category),
        KIND_LABEL[app.kinds.get(t.category)] || 'Expense', app.acctName(t.accountId), $(t.amountCents)]),
    },
    {
      name: 'By Category',
      columns: [
        { header: 'Category', width: 24 }, { header: 'Spent', type: 'currency', width: 14 },
        { header: 'Share of spending', type: 'percent', width: 18 }, { header: 'Transactions', type: 'int', width: 14 },
        { header: 'Average', type: 'currency', width: 13 },
      ],
      rows: byCat.map((r) => [app.catName(r.category), $(r.cents), total.spent ? r.cents / total.spent : 0, r.count, $(Math.round(r.cents / r.count))]),
    },
    {
      name: 'By Month',
      columns: [
        { header: 'Month', width: 12 }, { header: 'Spent', type: 'currency', width: 14 },
        { header: 'Income', type: 'currency', width: 14 }, { header: 'Net', type: 'currency', width: 14 },
      ],
      rows: months.map((m) => [m.month, $(m.spent), $(m.income), $(m.income - m.spent)]),
    },
    {
      name: 'Top Merchants',
      columns: [{ header: 'Merchant', width: 30 }, { header: 'Spent', type: 'currency', width: 14 }, { header: 'Transactions', type: 'int', width: 14 }],
      rows: merchants.map((m) => [m.merchant, $(m.cents), m.count]),
    },
    {
      name: 'Recurring',
      columns: [
        { header: 'Merchant', width: 26 }, { header: 'Frequency', width: 14 }, { header: 'Typical charge', type: 'currency', width: 15 },
        { header: 'Per month', type: 'currency', width: 13 }, { header: 'Last charge', type: 'date', width: 13 }, { header: 'Next expected', type: 'date', width: 14 },
      ],
      rows: recurring.map((r) => [r.merchant, r.frequency, $(r.typicalCents), $(r.monthlyCents), r.lastDate, r.nextDate]),
    },
  ]);
  download(bytes, `spendlens_${rangeSuffix(app)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  app.toast(`Exported workbook with ${txns.length} transactions.`);
}

export async function exportJSON(app) {
  const backup = await makeBackup(app.state);
  download(JSON.stringify(backup, null, 2), `spendlens-backup_${todayISO()}.json`, 'application/json');
  app.toast(backup.encrypted
    ? 'Encrypted backup downloaded. Restoring it needs your current passphrase.'
    : 'Backup downloaded. It is NOT encrypted. Set a passphrase in Settings to encrypt backups.');
}
