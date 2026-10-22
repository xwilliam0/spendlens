import { categorize } from '../../lib/categorize.js';
import {
  clearState, DEFAULT_STATE, readBackup, getSecurity, setAutoLockMinutes, touch,
  enableEncryption, changePassphrase, disableEncryption,
} from '../../lib/storage.js';
import { passphraseProblem } from '../../lib/crypto.js';
import { hash } from '../../lib/importers.js';
import { el } from '../../lib/charts.js';

const KIND_LABEL = { expense: 'Spending', income: 'Income', transfer: 'Not counted (transfer)' };

function section(title, description, ...content) {
  return el('section', { class: 'card settings-section' }, el('h2', {}, title), el('p', {}, description), ...content);
}

export function renderSettings(root, app) {
  const { state } = app;
  const count = (pred) => state.transactions.filter(pred).length;
  const builtinIds = new Set(DEFAULT_STATE.categories.map((c) => c.id));

  // ----- Accounts -----
  const accounts = section('Accounts', 'Each imported file belongs to an account. Deleting an account deletes its transactions.',
    state.accounts.length ? el('table', { class: 'data-table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Institution'), el('th', {}, 'Type'), el('th', { class: 'num' }, 'Transactions'), el('th', {}))),
      el('tbody', {}, state.accounts.map((a) => {
        const name = el('input', { type: 'text', value: a.name, 'aria-label': 'Account name' });
        name.addEventListener('change', async () => { a.name = name.value.trim() || a.name; await app.save(['accounts']); });
        return el('tr', {},
          el('td', {}, name), el('td', {}, a.institution || ''), el('td', {}, a.type || ''),
          el('td', { class: 'num' }, count((t) => t.accountId === a.id).toLocaleString()),
          el('td', {}, el('button', {
            class: 'btn btn-small btn-danger',
            onclick: async () => {
              if (!(await app.confirm(`Delete "${a.name}" and its ${count((t) => t.accountId === a.id)} transactions?`))) return;
              state.accounts = state.accounts.filter((x) => x !== a);
              state.transactions = state.transactions.filter((t) => t.accountId !== a.id);
              await app.save(['accounts', 'transactions']);
              app.rerender();
            },
          }, 'Delete')));
      }))) : el('p', { class: 'muted' }, 'No accounts yet. They are created when you import a CSV.'));

  // ----- Categories -----
  const newCatName = el('input', { type: 'text', placeholder: 'New category name', 'aria-label': 'New category name' });
  const newCatKind = el('select', { 'aria-label': 'Category type' }, Object.entries(KIND_LABEL).map(([k, v]) => el('option', { value: k }, v)));
  const categories = section('Categories', 'Add your own categories (e.g. "Coffee" or "Pets"). "Not counted" categories are left out of spending totals, which is useful for transfers between your own accounts.',
    el('table', { class: 'data-table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Category'), el('th', {}, 'Counts as'), el('th', { class: 'num' }, 'Transactions'), el('th', {}))),
      el('tbody', {}, state.categories.map((c) => {
        const kind = el('select', { 'aria-label': `Type of ${c.name}` }, Object.entries(KIND_LABEL).map(([k, v]) => el('option', { value: k, selected: k === c.kind }, v)));
        kind.addEventListener('change', async () => { c.kind = kind.value; await app.save(['categories']); app.rerender(); });
        return el('tr', {},
          el('td', {}, c.name), el('td', {}, kind),
          el('td', { class: 'num' }, count((t) => t.category === c.id).toLocaleString()),
          el('td', {}, builtinIds.has(c.id) ? el('span', { class: 'muted' }, 'built-in') : el('button', {
            class: 'btn btn-small btn-danger',
            onclick: async () => {
              if (!(await app.confirm(`Delete category "${c.name}"? Its transactions become Uncategorized.`))) return;
              state.categories = state.categories.filter((x) => x !== c);
              state.transactions.forEach((t) => { if (t.category === c.id) t.category = 'uncategorized'; });
              state.rules = state.rules.filter((r) => r.category !== c.id);
              delete state.budgets[c.id];
              await app.save(['categories', 'transactions', 'rules', 'budgets']);
              app.rerender();
            },
          }, 'Delete')));
      }))),
    el('form', {
      class: 'inline-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const name = newCatName.value.trim();
        if (!name) return;
        if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) { app.toast('That category already exists.'); return; }
        state.categories.push({ id: `c-${hash(name + Date.now())}`, name, kind: newCatKind.value });
        await app.save(['categories']);
        app.rerender();
      },
    }, newCatName, newCatKind, el('button', { class: 'btn', type: 'submit' }, 'Add category')));

  // ----- Rules -----
  const rulePattern = el('input', { type: 'text', placeholder: 'Description contains… (e.g. SWEETGREEN)', style: { minWidth: '280px' }, 'aria-label': 'Rule text' });
  const ruleCat = el('select', { 'aria-label': 'Rule category' }, state.categories.map((c) => el('option', { value: c.id }, c.name)));
  const validIds = () => new Set(state.categories.map((c) => c.id));
  const reapply = async () => {
    let changed = 0;
    for (const t of state.transactions) {
      if (t.manual) continue;
      const next = categorize(t, state.rules, validIds());
      if (next !== t.category) { t.category = next; changed++; }
    }
    await app.save(['transactions']);
    app.toast(`Re-categorized ${changed} transactions.`);
    app.rerender();
  };
  const rules = section('Categorization rules', 'Rules run before the built-in keyword list, top to bottom. Changing a transaction\'s category on the Transactions tab offers to create one for you. Transactions you categorized by hand are never overwritten.',
    state.rules.length ? el('table', { class: 'data-table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'If the description contains'), el('th', {}, 'Categorize as'), el('th', { class: 'num' }, 'Matches'), el('th', {}))),
      el('tbody', {}, state.rules.map((r) => el('tr', {},
        el('td', {}, el('code', {}, r.pattern)),
        el('td', {}, app.catName(r.category)),
        el('td', { class: 'num' }, count((t) => t.description.toUpperCase().includes(r.pattern.toUpperCase())).toLocaleString()),
        el('td', {}, el('button', {
          class: 'btn btn-small btn-danger',
          onclick: async () => { state.rules = state.rules.filter((x) => x !== r); await app.save(['rules']); app.rerender(); },
        }, 'Delete')))))) : el('p', { class: 'muted' }, 'No custom rules yet.'),
    el('form', {
      class: 'inline-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const pattern = rulePattern.value.trim().toUpperCase();
        if (!pattern) return;
        state.rules.unshift({ id: hash(pattern + Date.now()), pattern, category: ruleCat.value });
        await app.save(['rules']);
        await reapply();
      },
    }, rulePattern, el('span', { class: 'muted' }, '→'), ruleCat, el('button', { class: 'btn', type: 'submit' }, 'Add rule & apply')),
    el('div', { class: 'inline-form' }, el('button', { class: 'btn', onclick: reapply }, 'Re-apply all rules to existing transactions')));

  // ----- Data -----
  const restoreInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files[0];
    if (!file) return;
    restoreInput.value = '';
    try {
      const data = await readBackup(JSON.parse(await file.text()),
        () => app.promptPassphrase('This backup is encrypted. Enter the passphrase that was set when it was created.', 'Decrypt'));
      if (!data) return;
      if (!(await app.confirm(`Replace all current data with this backup (${data.transactions.length} transactions)?`, 'Restore'))) return;
      for (const k of Object.keys(DEFAULT_STATE)) if (data[k] !== undefined) state[k] = data[k];
      await app.save();
      app.toast('Backup restored.');
      app.rerender();
    } catch (err) {
      app.toast(`That file isn't a valid SpendLens backup (${err.message}).`);
    }
  });

  const data = section('Your data', `Everything is stored only in this browser profile${app.encrypted ? ', encrypted' : ''}. Nothing is uploaded anywhere. Export a backup before uninstalling the extension.`,
    el('div', { class: 'inline-form' },
      el('span', {}, `${state.transactions.length.toLocaleString()} transactions across ${state.accounts.length} accounts.`)),
    el('div', { class: 'inline-form' },
      el('button', { class: 'btn', onclick: () => document.querySelector('[data-export="json"]').click() }, 'Download backup (.json)'),
      el('button', { class: 'btn', onclick: () => restoreInput.click() }, 'Restore from backup…'), restoreInput,
      el('button', { class: 'btn', onclick: () => app.loadSample() }, 'Load sample data'),
      el('button', {
        class: 'btn btn-danger',
        onclick: async () => {
          if (!(await app.confirm('Permanently delete ALL transactions, accounts, rules and budgets?', 'Delete everything'))) return;
          await clearState(); // also removes the encrypted vault and passphrase
          Object.assign(state, structuredClone(DEFAULT_STATE));
          await app.save();
          await app.refreshSecurity();
          app.rerender();
        },
      }, 'Delete all data')));

  const security = el('div');
  renderSecurity(security, app);
  root.replaceChildren(security, accounts, categories, rules, data);
}

// ----- Security (encryption at rest) -----

const AUTO_LOCK_OPTIONS = [[5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [0, 'Only when the browser closes']];

function passwordField(label, autocomplete) {
  const input = el('input', { type: 'password', autocomplete, 'aria-label': label, placeholder: label, required: true });
  return input;
}

async function renderSecurity(container, app) {
  const sec = await getSecurity();
  const status = (ok, text) => el('div', { class: 'security-status' },
    el('span', { class: 'status-icon', style: { background: ok ? 'var(--good)' : 'var(--warning)' } }, ok ? '✓' : '!'),
    el('strong', {}, text));
  const busy = (btn, label) => { btn.disabled = true; btn.textContent = label; };

  if (!app.encrypted) {
    const p1 = passwordField('New passphrase', 'new-password');
    const p2 = passwordField('Repeat passphrase', 'new-password');
    const ack = el('input', { type: 'checkbox', required: true });
    const btn = el('button', { class: 'btn btn-primary', type: 'submit' }, 'Encrypt my data');
    const form = el('form', {
      class: 'stack-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const problem = passphraseProblem(p1.value) || (p1.value !== p2.value ? 'The passphrases don\'t match.' : null);
        if (problem) { app.toast(problem); return; }
        busy(btn, 'Encrypting…');
        await enableEncryption(app.state, p1.value);
        await app.refreshSecurity();
        app.toast('Your data is now encrypted. Keep your passphrase somewhere safe.');
        app.rerender();
      },
    }, p1, p2,
    el('label', { class: 'check' }, ack, 'I understand that if I forget this passphrase, my SpendLens data cannot be recovered. I would have to re-import my CSV files.'),
    el('div', {}, btn));
    container.replaceChildren(section('Security',
      'Without a passphrase, your transactions are stored readable on disk in your Chrome profile. Websites and other extensions can\'t access them, but malware or anyone using your Windows account could. A passphrase encrypts everything with AES-256-GCM. The key is derived from your passphrase (PBKDF2, 600,000 rounds), kept only in memory, and forgotten when SpendLens auto-locks or the browser closes.',
      status(false, 'Not encrypted'), form));
    return;
  }

  const autoLock = el('select', { 'aria-label': 'Auto-lock after' },
    AUTO_LOCK_OPTIONS.map(([v, label]) => el('option', { value: String(v), selected: v === sec.autoLockMinutes }, label)));
  autoLock.addEventListener('change', async () => {
    await setAutoLockMinutes(Number(autoLock.value));
    await touch();
    app.toast('Auto-lock updated.');
  });

  const cur = passwordField('Current passphrase', 'current-password');
  const n1 = passwordField('New passphrase', 'new-password');
  const n2 = passwordField('Repeat new passphrase', 'new-password');
  const changeBtn = el('button', { class: 'btn', type: 'submit' }, 'Change passphrase');
  const changeForm = el('form', {
    class: 'stack-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const problem = passphraseProblem(n1.value) || (n1.value !== n2.value ? 'The new passphrases don\'t match.' : null);
      if (problem) { app.toast(problem); return; }
      busy(changeBtn, 'Re-encrypting…');
      try {
        await changePassphrase(app.state, cur.value, n1.value);
        app.toast('Passphrase changed. Older encrypted backups still need the old passphrase.');
      } catch {
        app.toast('Current passphrase is wrong.');
      }
      app.rerender();
    },
  }, cur, n1, n2, el('div', {}, changeBtn));

  const disableBtn = el('button', {
    class: 'btn btn-danger', type: 'button',
    onclick: async () => {
      const pass = await app.promptPassphrase('Turning off encryption stores your data unencrypted on disk again. Enter your passphrase to confirm.', 'Turn off encryption');
      if (pass == null) return;
      try {
        await disableEncryption(app.state, pass);
        await app.refreshSecurity();
        app.toast('Encryption turned off.');
      } catch {
        app.toast('Wrong passphrase. Encryption is still on.');
      }
      app.rerender();
    },
  }, 'Turn off encryption…');

  container.replaceChildren(section('Security',
    'Your data is encrypted with AES-256-GCM. It is only decrypted in memory while SpendLens is unlocked.',
    status(true, 'Encrypted at rest'),
    el('div', { class: 'inline-form' },
      el('label', {}, 'Auto-lock after inactivity ', autoLock),
      el('button', { class: 'btn', type: 'button', onclick: app.lockNow }, 'Lock now')),
    el('details', { style: { marginTop: '14px' } }, el('summary', {}, 'Change passphrase'), changeForm),
    el('div', { class: 'inline-form' }, disableBtn)));
}
