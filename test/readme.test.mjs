// The README's data figures match site/data in both languages (validate.mjs runs the same check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { README_FILE, README_ENGLISH, loadData, readmeFigures, validateReadme } from '../scripts/lib.mjs';

const text = readFileSync(README_FILE, 'utf8');
const want = readmeFigures(loadData());
const [he, en] = [text.slice(0, text.indexOf(README_ENGLISH)), text.slice(text.indexOf(README_ENGLISH))];

test('the README states the current figures in Hebrew and in English', () => {
  assert.deepEqual(validateReadme(text, want), []);
  assert.equal(want.platform + want.statement + want.record + want.noPosition, want.positions);
});

test('a stale figure in either section fails, naming the section', () => {
  const cases = [
    [he.replace(`(${want.noPosition} תאים)`, `(${want.noPosition + 1} תאים)`) + en, /README \(he\).*noPosition/],
    [he + en.replace(`statements (${want.statement})`, `statements (${want.statement - 1})`), /README \(en\).*statement/],
    [he + en.replace(`${want.parties} parties ×`, `${want.parties + 1} parties ×`), /README \(en\).*parties/],
    [he.replace(/יש \S+ תרחישים/, 'יש שלושה תרחישים') + en, /README \(he\).*scenarios = שלושה/],
  ];
  for (const [t, re] of cases) {
    assert.notEqual(t, text, 'the case must change the README');
    assert.match(validateReadme(t, want).join('\n'), re);
  }
});

test('a figure that is no longer stated fails', () => {
  const errors = validateReadme(he + en.replace(/- \*\*Red lines:\*\*[^\n]*\n/, ''), want);
  assert.match(errors.join('\n'), /README \(en\): no longer states redLines/);
});

test('a changed data figure fails against the unchanged README', () => {
  assert.match(validateReadme(text, { ...want, redLines: want.redLines + 1 }).join('\n'), /README \(he\).*redLines.*README \(en\).*redLines/s);
});
