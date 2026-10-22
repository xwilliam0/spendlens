// RFC 4180 CSV parsing and writing, no dependencies.

/**
 * Parse CSV text into an array of rows (arrays of strings).
 * Handles quoted fields, escaped quotes (""), embedded commas/newlines,
 * CRLF or LF line endings, and a leading UTF-8 BOM.
 */
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop rows that are entirely blank.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Neutralize spreadsheet formula injection: a merchant name such as
 * "=HYPERLINK(...)" would otherwise execute when the export is opened in Excel.
 */
function sanitizeText(s) {
  return /^[=+@\t\r]/.test(s) || /^-[^\d.]/.test(s) ? `'${s}` : s;
}

function escapeField(value) {
  if (value == null) return '';
  const s = typeof value === 'number' ? String(value) : sanitizeText(String(value));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows) {
  return rows.map((r) => r.map(escapeField).join(',')).join('\r\n') + '\r\n';
}
