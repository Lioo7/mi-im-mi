import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, plural } from '../site/js/strings.js';

test('plural helper spells out the singular', () => {
  assert.equal(plural(1, 'נושא אחד', 'נושאים'), 'נושא אחד');
  assert.equal(plural(0, 'נושא אחד', 'נושאים'), '0 נושאים');
  assert.equal(plural(5, 'זוג אחד', 'זוגות'), '5 זוגות');
});

test('count labels use the singular for 1 and the digit plural otherwise', () => {
  const [agree] = S.results.breakdown(1, 0, 0, 0, 0);
  assert.equal(agree[0], 'נושא אחד בהסכמה');
  assert.equal(S.results.breakdown(3, 0, 0, 0, 0)[0][0], '3 נושאים בהסכמה');
  assert.equal(S.nav.partyCount(1), 'מפלגה אחת נבחרה');
  assert.equal(S.nav.partyCount(6), '6 מפלגות נבחרו');
  assert.equal(S.results.morePairs(1), 'ועוד זוג מפלגות אחד');
  assert.equal(S.results.morePairs(4), 'ועוד 4 זוגות מפלגות');
  assert.equal(S.builder.clashChipLabel(1), 'הוספתה תיצור סתירה חזיתית בנושא אחד');
  assert.equal(S.builder.clashChipLabel(2), 'הוספתה תיצור סתירה חזיתית ב-2 נושאים');
  assert.equal(S.builder.ownMissingLabel(1), 'אין עמדה מוצהרת בנושא אחד');
  assert.equal(S.results.overall(1, 1), '1 מתוך נושא אחד ללא סתירה חזיתית');
  assert.ok(!/(^|\D)1 (נושאים|מפלגות|זוגות)/.test(S.builder.impactLabel(1, 1, 1)));
});

test('friction preview: never "0 במקום 0", hides when nothing changes', () => {
  assert.equal(S.results.withoutPreview(null, null), '');
  assert.equal(S.results.withoutPreview(null, 52), 'בלעדיה: כ-52 מנדטים');
  assert.equal(S.results.withoutPreview({ kind: 'major', before: 3, after: 1 }, null), 'בלעדיה: נושא אחד בפער מהותי במקום 3');
  assert.equal(S.results.withoutPreview({ kind: 'clash', before: 2, after: 0 }, null), 'בלעדיה: אין נושא בסתירה חזיתית במקום 2');
  assert.equal(S.results.pairsTag('פער מהותי', 3), 'פער מהותי · 3 זוגות מפלגות');
  assert.equal(S.results.pairsTag('סתירה חזיתית', 1), 'סתירה חזיתית · זוג מפלגות אחד');
});

import { readFileSync } from 'node:fs';
import { S as EN } from '../site/js/strings.en.js';

// Every key in one language exists in the other, with the same kind of value: a missing translation fails here.
function shape(v, path, out) {
  if (typeof v === 'function') out.set(path, `function/${v.length}`);
  else if (Array.isArray(v)) { out.set(path, `array/${v.length}`); v.forEach((x, i) => shape(x, `${path}[${i}]`, out)); }
  else if (v && typeof v === 'object') { out.set(path, 'object'); for (const k of Object.keys(v)) shape(v[k], `${path}.${k}`, out); }
  else out.set(path, typeof v);
  return out;
}

test('the English strings have exactly the shape of the Hebrew ones', () => {
  const he = shape(S, 'S', new Map());
  const en = shape(EN, 'S', new Map());
  assert.deepEqual([...he.keys()].filter((k) => !en.has(k)), [], 'missing in English');
  assert.deepEqual([...en.keys()].filter((k) => !he.has(k)), [], 'missing in Hebrew');
  assert.deepEqual([...he].filter(([k, t]) => en.get(k) !== t), [], 'different kind of value');
});

test('the English strings contain no Hebrew, except the switch to Hebrew and a ballot letter', () => {
  // The NAMES map is keyed by the Hebrew names in the data; its English values are checked in english.test.mjs.
  const src = readFileSync(new URL('../site/js/strings.en.js', import.meta.url), 'utf8').replace(/export const NAMES = \{[^}]*\};/, '');
  const lines = src.split('\n');
  const hebrew = lines.filter((l) => /[֐-׿]/.test(l) && !/langNames:|\(ט\)/.test(l) && !/^\s*\/\//.test(l));
  assert.deepEqual(hebrew, []);
  assert.equal(EN.lang, 'en');
  assert.equal(EN.langSwitch.other, 'he');
  assert.equal(S.langSwitch.other, 'en');
  assert.deepEqual(EN.langNames, S.langNames);
});

test('English formatting: dates, counts and the share text', () => {
  assert.equal(EN.fmtDate('2026-10-30'), '30 Oct 2026');
  assert.equal(EN.fmtDate(null), '');
  assert.equal(EN.presets.shortDate('2026-11-02'), '2 Nov');
  assert.equal(EN.elected.vsTitle(EN.fmtDate('2026-10-23')), 'Poll average (23 Oct) vs. results');
  assert.equal(EN.nav.partyCount(1), '1 party selected');
  assert.equal(EN.results.breakdown(3, 0, 0, 0, 0)[0][0], '3 topics in agreement');
  assert.equal(EN.share.text('A + B', 1), 'The coalition I built: A + B · 1 topic in a head-on clash');
  assert.equal(EN.share.text('A + B', 1, null), 'The coalition I built: A + B · 1 topic in a head-on clash');
  assert.equal(EN.share.text('A + B', 0, 0), 'The coalition I built: A + B · 0 topics in a head-on clash · no head-on clashes with the supporters and abstainers');
  assert.equal(EN.share.text('A + B', 2, 1), 'The coalition I built: A + B · 2 topics in a head-on clash · 1 head-on clash with the supporters and abstainers');
  assert.equal(EN.share.text('A + B', 2, 7), 'The coalition I built: A + B · 2 topics in a head-on clash · 7 head-on clashes with the supporters and abstainers');
  assert.equal(EN.results.withoutPreview({ kind: 'clash', before: 2, after: 0 }, 52, true), 'Without it: no topic in a head-on clash instead of 2 · 52 seats');
});

test('closest coalitions (#22): "closest to the stated positions", never best or recommended, in both languages', () => {
  const texts = (K, M) => [
    ...Object.entries(K).map(([k, v]) => (k === 'orList' ? v(['X', 'Y']) : typeof v === 'function' ? v('X', 2, 'Y') : v)),
    K.showPartial(1, 'X'), K.redLines(0, ''), K.redLines(1, 'Y'), M.closestTitle, M.closestRule,
  ];
  for (const [K, M] of [[S.closest, S.method], [EN.closest, EN.method]]) {
    const bad = texts(K, M).filter((t) => /הטוב|מומלצ|מועדפ|האידיאלי|\bbest\b|\brecommended\b|\bpreferred\b|\bideal\b/i.test(t));
    assert.deepEqual(bad, []);
  }
  assert.equal(S.closest.orList(['א', 'ב', 'ג']), 'א, ב או ג');
  assert.equal(EN.closest.orList(['A', 'B', 'C']), 'A, B or C');
  assert.equal(EN.closest.orList(['A']), 'A');
  assert.equal(S.closest.showPartial(1, 'ש״ס'), 'הציגו גם קואליציה אחת שכוללת את ש״ס');
  assert.equal(EN.closest.showPartial(117, 'A or B'), 'Also show 117 coalitions that include A or B');
  assert.match(S.method.closestRule, /זו לא המלצה/);
  assert.match(EN.method.closestRule, /not a recommendation/);
});

test('share text (#1): the supporters\' and abstainers\' clashes are added only when there are any, worded like the snapshot pointer', () => {
  assert.equal(S.share.text('א + ב', 1), 'הקואליציה שבניתי: א + ב · נושא אחד בסתירה חזיתית');
  assert.equal(S.share.text('א + ב', 1, null), 'הקואליציה שבניתי: א + ב · נושא אחד בסתירה חזיתית');
  assert.equal(S.share.text('א + ב', 0, 0), 'הקואליציה שבניתי: א + ב · 0 נושאים בסתירה חזיתית · אין סתירות חזיתיות מול התומכות והנמנעות');
  assert.equal(S.share.text('א + ב', 2, 1), 'הקואליציה שבניתי: א + ב · 2 נושאים בסתירה חזיתית · סתירה חזיתית אחת מול התומכות והנמנעות');
  assert.equal(S.share.text('א + ב', 2, 7), 'הקואליציה שבניתי: א + ב · 2 נושאים בסתירה חזיתית · 7 סתירות חזיתיות מול התומכות והנמנעות');
  // The same N and wording as "↓ ועוד N סתירות חזיתיות מול התומכות והנמנעות".
  for (const n of [0, 1, 7]) {
    const tail = S.results.peripheryLink(n).replace(/^↓ (ועוד )?/, '');
    assert.ok(S.share.text('א', 0, n).endsWith(` · ${tail}`), `N=${n}`);
  }
});
