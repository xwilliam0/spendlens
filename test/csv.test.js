import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, toCSV } from '../src/lib/csv.js';

test('parses quotes, escaped quotes, embedded commas and newlines', () => {
  const rows = parseCSV('﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n\r\n1,2,3');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'say "hi"', 'line1\nline2'], ['1', '2', '3']]);
});

test('round-trips through toCSV', () => {
  const rows = [['Date', 'Desc'], ['2026-01-01', 'Comma, "quote"']];
  assert.deepEqual(parseCSV(toCSV(rows)), rows);
});

test('neutralizes spreadsheet formula injection but keeps negative numbers', () => {
  const out = toCSV([['=HYPERLINK("http://evil")', '@SUM(A1)', -12.5, '-12.50', '-cmd']]);
  assert.match(out, /^"'=HYPERLINK/);
  assert.match(out, /,'@SUM\(A1\),/);
  assert.match(out, /,-12\.5,-12\.50,'-cmd/);
});
