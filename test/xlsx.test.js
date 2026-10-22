import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, buildXlsx } from '../src/lib/xlsx.js';

test('crc32 matches the reference value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('buildXlsx produces a ZIP with the required parts', () => {
  const bytes = buildXlsx([{
    name: 'Sheet/1',
    columns: [{ header: 'Date', type: 'date' }, { header: 'Name' }, { header: 'Amt', type: 'currency' }],
    rows: [['2026-01-01', 'A & <B>', -1.5]],
  }]);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50); // ZIP local header
  const text = new TextDecoder().decode(bytes);
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
    assert.ok(text.includes(part), part);
  }
  assert.ok(text.includes('A &amp; &lt;B&gt;'));
  assert.ok(text.includes('<v>46023</v>')); // 2026-01-01 as an Excel serial date
  assert.ok(text.includes('name="Sheet 1"')); // "/" is illegal in sheet names
});
