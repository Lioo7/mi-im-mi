// The words behind a 🚩 (#49): every red-line row carries the statement that makes it a coalition condition (quote, date,
// URL, an English translation), every other row carries none, and the live data meets both rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, validatePositions, RED_LINE_FIELDS } from '../scripts/lib.mjs';

const party = { id: 'p' };
const topic = { id: 't' };
const base = { partyId: 'p', topicId: 't', position: -2, summary: 'תקציר', summaryEn: 'Summary', quote: null,
  sourceUrl: 'https://example.org/a', sourceType: 'statement', sourceDate: '2026-10-01' };
const evidence = { redLineQuote: 'לא נשב בממשלה בלי X', redLineQuoteTranslationEn: 'We will not sit in a government without X',
  redLineBy: null, redLineChannel: null, redLineUrl: 'https://example.org/b', redLineDate: '2026-10-14' };
const check = (row) => validatePositions([row], [party], [topic]);

test('a red line with its quote, URL, date and translation passes', () => {
  assert.deepEqual(check({ ...base, redLine: true, ...evidence }), []);
});

test('a red line without its evidence is refused, field by field', () => {
  assert.match(check({ ...base, redLine: true }).join('\n'), /redLine without redLineQuote/);
  assert.match(check({ ...base, redLine: true, ...evidence, redLineUrl: null }).join('\n'), /redLine without a valid redLineUrl/);
  assert.match(check({ ...base, redLine: true, ...evidence, redLineUrl: 'http://example.org/b' }).join('\n'), /redLineUrl/);
  assert.match(check({ ...base, redLine: true, ...evidence, redLineDate: '2026' }).join('\n'), /full redLineDate/);
  assert.match(check({ ...base, redLine: true, ...evidence, redLineQuoteTranslationEn: null }).join('\n'), /redLineQuoteTranslationEn/);
  assert.match(check({ ...base, redLine: true, ...evidence, redLineQuote: 'א'.repeat(301) }).join('\n'), /redLineQuote too long/);
});

test('red-line fields on a row without a red line are refused', () => {
  assert.match(check({ ...base, redLine: false, ...evidence }).join('\n'), /on a row without a red line/);
  assert.deepEqual(check({ ...base, redLine: false }), []);
});

test('the live data: every 🚩 row has its evidence, and no other row has any', () => {
  const { positions } = loadData();
  const red = positions.filter((p) => p.redLine);
  assert.ok(red.length > 0);
  for (const p of red) assert.ok(p.redLineQuote && p.redLineUrl && p.redLineDate, `${p.partyId}|${p.topicId}`);
  for (const p of positions.filter((x) => !x.redLine)) assert.deepEqual(RED_LINE_FIELDS.filter((f) => p[f] != null), [], `${p.partyId}|${p.topicId}`);
});
