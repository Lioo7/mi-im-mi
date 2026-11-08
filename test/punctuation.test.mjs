// No semicolons in Hebrew UI text (#33): in Hebrew ";" reads stiff and machine-written. A period, a comma or a list
// instead. Checks every string literal of strings.js (and the Hebrew ones in app.js), and every Hebrew text field of
// the data, with quoted spans removed: quotes are verbatim and keep their punctuation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../scripts/lib.mjs';
import { stringLiterals, unquoted } from './text.mjs';

const HEBREW = /[א-ת]/;
const src = (f) => readFileSync(new URL(`../site/js/${f}`, import.meta.url), 'utf8');

test('no ";" in the Hebrew UI strings', () => {
  const bad = [
    ...stringLiterals(src('strings.js')).map((l) => ({ ...l, file: 'strings.js' })),
    ...stringLiterals(src('app.js')).filter((l) => HEBREW.test(l.text)).map((l) => ({ ...l, file: 'app.js' })),
  ].filter((l) => l.text.includes(';')).map((l) => `${l.file}:${l.line}: ${l.text.slice(0, 80)}`);
  assert.deepEqual(bad, []);
});

test('no ";" in Hebrew data text outside quotes (summaries, axis labels and notes, names, notes, sources)', () => {
  const data = loadData();
  const bad = [];
  const skip = (k) => k === 'en' || /En$/.test(k) || /^quote/.test(k) || /Url$/.test(k);
  const walk = (v, path) => {
    if (typeof v === 'string') { if (HEBREW.test(v) && unquoted(v).includes(';')) bad.push(`${path}: ${v.slice(0, 80)}`); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!skip(k)) walk(x, `${path}.${k}`);
  };
  for (const name of ['parties', 'topics', 'meta', 'positions', 'results', 'scenarios', 'recommendations', 'changelog']) walk(data[name], name);
  assert.deepEqual(bad, []);
});

test('the check itself: it finds ";" in plain text, and ignores it inside a quote', () => {
  assert.ok(stringLiterals("const a = 'אחת; שתיים';").some((l) => l.text.includes(';')));
  assert.ok(!stringLiterals('const a = 1; // ; in a comment\nconst b = `x ${y ? \'ש\' : \'ת\'} z`;').some((l) => l.text.includes(';')));
  assert.ok(stringLiterals('const b = `x ${y ? \'ש; ת\' : 0}`;').some((l) => l.text.includes(';')));
  assert.equal(unquoted('המצע: ״א; ב״ ועוד').includes(';'), false);
  assert.equal(unquoted('א; ב').includes(';'), true);
});
