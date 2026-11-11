// No semicolons in Hebrew UI text (#33): in Hebrew ";" reads stiff and machine-written. A period, a comma or a list
// instead. Checks every string literal of strings.js (and the Hebrew ones in app.js), and every Hebrew text field of
// the data, with quoted spans removed: quotes are verbatim and keep their punctuation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadData } from '../scripts/lib.mjs';
import { stringLiterals, unquoted, asciiGershayim } from './text.mjs';

const HEBREW = /[א-ת]/;
// Data keys that are not our Hebrew text: English twins, verbatim quotes (also the red-line quote, #49) and URLs.
const SKIP = (k) => k === 'en' || /En$/.test(k) || /^quote/.test(k) || /^redLineQuote/.test(k) || /Url$/.test(k);
const DATA_FILES = ['parties', 'topics', 'meta', 'positions', 'results', 'scenarios', 'recommendations', 'changelog'];
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
  const skip = SKIP;
  const walk = (v, path) => {
    if (typeof v === 'string') { if (HEBREW.test(v) && unquoted(v).includes(';')) bad.push(`${path}: ${v.slice(0, 80)}`); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!skip(k)) walk(x, `${path}.${k}`);
  };
  for (const name of DATA_FILES) walk(data[name], name);
  assert.deepEqual(bad, []);
});

test('the check itself: it finds ";" in plain text, and ignores it inside a quote', () => {
  assert.ok(stringLiterals("const a = 'אחת; שתיים';").some((l) => l.text.includes(';')));
  assert.ok(!stringLiterals('const a = 1; // ; in a comment\nconst b = `x ${y ? \'ש\' : \'ת\'} z`;').some((l) => l.text.includes(';')));
  assert.ok(stringLiterals('const b = `x ${y ? \'ש; ת\' : 0}`;').some((l) => l.text.includes(';')));
  assert.equal(unquoted('המצע: ״א; ב״ ועוד').includes(';'), false);
  assert.equal(unquoted('א; ב').includes(';'), true);
});

// Gershayim (#51, N16 from 26.10): abbreviations take ״, not an ASCII " (צה״ל, not צה"ל). Our Hebrew text only: verbatim
// quotes keep the mark the source used.
test('no ASCII " as gershayim in the Hebrew UI strings or in our Hebrew data text', () => {
  const data = loadData();
  const bad = [
    ...stringLiterals(src('strings.js')).map((l) => ({ ...l, file: 'strings.js' })),
    ...stringLiterals(src('app.js')).filter((l) => HEBREW.test(l.text)).map((l) => ({ ...l, file: 'app.js' })),
  ].flatMap((l) => asciiGershayim(l.text).map((w) => `${l.file}:${l.line}: ${w}`));
  const walk = (v, path) => {
    if (typeof v === 'string') { for (const w of asciiGershayim(v)) bad.push(`${path}: ${w}`); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!SKIP(k)) walk(x, `${path}.${k}`);
  };
  for (const name of DATA_FILES) walk(data[name], name);
  assert.deepEqual(bad, []);
});

test('the gershayim check itself: abbreviations are found, quote marks after a prefix letter are not', () => {
  assert.deepEqual(asciiGershayim('בקדימות לצורכי צה"ל ובשירות'), ['צה"ל']);
  assert.deepEqual(asciiGershayim('יועמ"שית ושב"כ'), ['יועמ"שית', 'ושב"כ']);
  assert.deepEqual(asciiGershayim('צה"ל, והמצע קורא ל"תשתית חוקתית"'), ['צה"ל']);
  assert.deepEqual(asciiGershayim('תמיכה ב"שוק חופשי, פחות רגולציה"'), []);
  assert.deepEqual(asciiGershayim('ו"בלי נתונים" כשאין'), []);
  assert.deepEqual(asciiGershayim('אשר ב"פגוש את העיתונות"'), []);
  assert.deepEqual(asciiGershayim('צה״ל וש״ס'), []);
});
