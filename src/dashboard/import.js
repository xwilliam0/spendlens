// Import dialog: detect the bank format, let the user confirm the account,
// column mapping and sign convention, preview the result, then merge.

import { detectFormat, normalizeRows, mergeTransactions, hash } from '../lib/importers.js';
import { fmtMoney, fmtDate } from '../lib/format.js';
import { el } from '../lib/charts.js';

const FIELDS = [
  ['date', 'Date', true],
  ['description', 'Description', true],
  ['amount', 'Amount (single column)', false],
  ['debit', 'Debit / money out', false],
  ['credit', 'Credit / money in', false],
  ['category', 'Bank\'s category (optional)', false],
];

/**
 * Show the import dialog for one file.
 * @returns {Promise<number|null>} number of transactions added, or null if cancelled
 */
export async function openImportDialog(file, app) {
  const dialog = document.getElementById('import-dialog');
  const text = await file.text();
  const detection = detectFormat(text);
  const { profile, headers } = detection;
  const mapping = { ...detection.mapping };
  let purchasesPositive = detection.purchasesPositive;

  // Pick a matching existing account, or propose a new one.
  const existing = app.state.accounts.find((a) => profile && a.profileId === profile.id);
  const accountSel = el('select', {},
    app.state.accounts.map((a) => el('option', { value: a.id, selected: existing?.id === a.id }, a.name)),
    el('option', { value: '__new', selected: !existing }, '+ New account…'));
  const newName = el('input', { type: 'text', value: profile ? profile.name : file.name.replace(/\.csv$/i, ''), 'aria-label': 'New account name' });
  const newType = el('select', { 'aria-label': 'Account type' },
    el('option', { value: 'credit', selected: profile?.accountType !== 'debit' }, 'Credit card'),
    el('option', { value: 'debit', selected: profile?.accountType === 'debit' }, 'Checking / debit'),
    el('option', { value: 'savings' }, 'Savings'));
  const newWrap = el('div', { class: 'form-grid', style: { gridColumn: '1 / -1' } },
    el('label', {}, 'New account name', newName), el('label', {}, 'Type', newType));

  const colSelects = FIELDS.map(([field, label]) => {
    const s = el('select', { 'aria-label': label },
      el('option', { value: '-1' }, '(none)'),
      headers.map((h, i) => el('option', { value: String(i), selected: mapping[field] === i }, h || `Column ${i + 1}`)));
    s.addEventListener('change', () => { mapping[field] = Number(s.value); update(); });
    return el('label', {}, label, s);
  });

  const signBox = el('input', { type: 'checkbox', checked: purchasesPositive });
  signBox.addEventListener('change', () => { purchasesPositive = signBox.checked; update(); });

  const preview = el('div');
  const summary = el('span', { class: 'grow muted' });
  const importBtn = el('button', { class: 'btn btn-primary' }, 'Import');
  const cancelBtn = el('button', { class: 'btn' }, 'Cancel');

  const validIds = new Set(app.state.categories.map((c) => c.id));
  let result = { transactions: [], skipped: 0 };
  const accountId = () => (accountSel.value === '__new' ? `acct-${hash(newName.value + file.name)}` : accountSel.value);

  function update() {
    newWrap.hidden = accountSel.value !== '__new';
    const usable = mapping.date >= 0 && mapping.description >= 0 && (mapping.amount >= 0 || mapping.debit >= 0 || mapping.credit >= 0);
    result = usable
      ? normalizeRows(detection, { mapping, purchasesPositive, accountId: accountId(), rules: app.state.rules, validIds })
      : { transactions: [], skipped: detection.rows.length };
    const sample = result.transactions.slice(0, 8);
    preview.replaceChildren(sample.length
      ? el('table', { class: 'data-table' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Description'), el('th', {}, 'Category'), el('th', { class: 'num' }, 'Amount'))),
        el('tbody', {}, sample.map((t) => el('tr', {},
          el('td', {}, fmtDate(t.date)), el('td', {}, t.description), el('td', {}, app.catName(t.category)),
          el('td', { class: `num${t.amountCents > 0 ? ' amount-in' : ''}` }, t.amountCents > 0 ? `+${fmtMoney(t.amountCents)}` : fmtMoney(t.amountCents))))))
      : el('p', { class: 'muted' }, 'No transactions could be read with this column mapping. Pick the Date, Description and Amount columns above.'));
    summary.textContent = `${result.transactions.length} transactions found${result.skipped ? `, ${result.skipped} rows skipped (blank, balance or header rows)` : ''}.`;
    importBtn.disabled = !result.transactions.length;
  }
  accountSel.addEventListener('change', update);
  newName.addEventListener('input', update);

  dialog.replaceChildren(
    el('div', { class: 'dialog-head' }, el('h2', { id: 'import-title' }, `Import ${file.name}`)),
    el('div', { class: 'dialog-body' },
      el('div', { class: 'detected' }, profile
        ? el('span', {}, '✓ Detected ', el('strong', {}, profile.name), ' format.')
        : el('span', {}, 'Unrecognized format. Check that the columns below are right.')),
      el('div', { class: 'form-grid' }, el('label', {}, 'Import into account', accountSel), newWrap),
      el('details', { open: !profile },
        el('summary', {}, 'Columns & sign convention'),
        el('div', { class: 'form-grid', style: { marginTop: '10px' } }, colSelects),
        el('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' } }, signBox,
          'Purchases appear as positive numbers in this file (typical for Discover, Amex, Capital One)')),
      el('h3', { style: { fontSize: '13px', margin: '8px 0' } }, 'Preview: check that purchases are negative and categories look right'),
      preview),
    el('div', { class: 'dialog-foot' }, summary, cancelBtn, importBtn));

  update();
  dialog.showModal();

  return new Promise((resolve) => {
    const finish = (value) => { dialog.close(); resolve(value); };
    cancelBtn.onclick = () => finish(null);
    dialog.oncancel = (e) => { e.preventDefault(); finish(null); };
    importBtn.onclick = async () => {
      const id = accountId();
      if (accountSel.value === '__new') {
        app.state.accounts.push({
          id, name: newName.value.trim() || 'My account', type: newType.value,
          institution: profile?.institution || '', profileId: profile?.id,
        });
      }
      const { merged, added, duplicates } = mergeTransactions(app.state.transactions, result.transactions);
      app.state.transactions = merged;
      await app.save(['transactions', 'accounts']);
      // The extension can't touch files on disk, so remind the user the CSV is still sitting in Downloads.
      app.toast(`Imported ${added} transactions${duplicates ? ` (${duplicates} duplicates skipped)` : ''}. ` +
        `You can now delete "${file.name}" from your Downloads folder. SpendLens keeps its own copy${app.encrypted ? ', encrypted' : ''}.`);
      finish(added);
    };
  });
}
