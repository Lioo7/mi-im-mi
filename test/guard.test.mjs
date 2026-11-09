// The safety rails (#47): the public CSVs' formula guard and https-only meta links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, toCsv, parseCsv, validateResults, META_URLS } from '../scripts/lib.mjs';

test('toCsv formulaSafe: text cells that a spreadsheet would run get a leading apostrophe, numbers stay', () => {
  const rows = [{ a: '=HYPERLINK("x")', b: -2 }, { a: '+1', b: 0 }, { a: '-x', b: 1 }, { a: '@SUM(1)', b: 2 }, { a: '\tx', b: null }, { a: 'שלום = 1', b: '' }];
  const csv = toCsv(['a', 'b'], rows, { formulaSafe: true });
  assert.deepEqual(parseCsv(csv.replace(/^﻿/, '')).map((r) => [r.a, r.b]),
    [["'=HYPERLINK(\"x\")", '-2'], ["'+1", '0'], ["'-x", '1'], ["'@SUM(1)", '2'], ["'\tx", ''], ['שלום = 1', '']]);
  // Off by default: the review CSV goes back through import-csv verbatim.
  assert.equal(toCsv(['a'], [{ a: '=1' }]), '﻿a\r\n=1\r\n');
});

test('meta links are https only, in both modes', () => {
  const { meta, results, parties } = loadData();
  assert.deepEqual(validateResults(meta, results, parties), []);
  for (const f of META_URLS) {
    for (const mode of ['results', 'polls']) {
      for (const bad of ['javascript:alert(1)', 'http://example.com', 'https://a b']) {
        assert.ok(validateResults({ ...meta, mode, [f]: bad }, results, parties).some((e) => e.includes(f)), `${mode} ${f} = ${bad}`);
      }
    }
  }
});
