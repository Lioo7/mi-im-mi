import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, plural } from '../site/js/strings.js';

test('Hebrew dates have no leading zeros, like the hand-written ones (#42)', () => {
  assert.equal(S.fmtDate('2026-11-04'), '4.11.2026');
  assert.equal(S.fmtDate('2026-10-30'), '30.10.2026');
  assert.equal(S.fmtDate('2026-08-31'), '31.8.2026');
  assert.equal(S.fmtDate('2006'), '2006');
  assert.equal(S.fmtDate(null), '');
});

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
  assert.equal(S.results.live('ש״ס', 1), 'ש״ס: נושא אחד בסתירה חזיתית בקואליציה');
  assert.equal(S.results.liveRemoved('ש״ס', 2), 'ש״ס הוסרה. 2 נושאים בסתירה חזיתית בקואליציה');
  assert.ok(!/(^|\D)1 (נושאים|מפלגות|זוגות)/.test(S.builder.impactLabel(1, 1, 1)));
});

test('friction preview: never "0 במקום 0", hides when nothing changes', () => {
  // Positions only (#H1): the seats without a party are in the seats card.
  assert.equal(S.results.withoutPreview(null), '');
  assert.equal(S.results.withoutPreview({ kind: 'major', before: 3, after: 1 }), 'בלעדיה: נושא אחד בפער מהותי במקום 3');
  assert.equal(S.results.withoutPreview({ kind: 'clash', before: 2, after: 0 }), 'בלעדיה: אין נושא בסתירה חזיתית במקום 2');
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
  assert.equal(EN.share.text('A + B', 0, 0, [['C', 'abstains']]), 'The coalition I built: A + B · Outside the coalition: C (abstains) · 0 topics in a head-on clash between the coalition members · no head-on clashes with the parties outside the coalition');
  assert.equal(EN.share.text('A + B', 2, 1, [['C', 'supports from outside']]), 'The coalition I built: A + B · Outside the coalition: C (supports from outside) · 2 topics in a head-on clash between the coalition members · 1 head-on clash with the parties outside the coalition');
  assert.equal(EN.results.withoutPreview({ kind: 'clash', before: 2, after: 0 }), 'Without it: no topic in a head-on clash instead of 2');
});

test('undo line (#29): what changed, and the restored coalition with the parties outside it', () => {
  assert.equal(S.results.undoAdded(['א']), 'נוספה: א');
  assert.equal(S.results.undoAdded(['א', 'ב']), 'נוספו: א, ב');
  assert.equal(EN.results.undoAdded(['A', 'B']), 'Added: A, B');
  assert.equal(S.results.undoRemoved('א'), 'הוסרה: א');
  assert.equal(EN.results.undoRemoved('A'), 'Removed: A');
  assert.equal(S.results.restored(['א', 'ב'], []), 'הקואליציה הקודמת שוחזרה: א + ב');
  assert.equal(S.results.restored(['א', 'ב'], ['ג (תומכת מבחוץ)', 'ד (נמנעת)']), 'הקואליציה הקודמת שוחזרה: א + ב · מחוץ לקואליציה: ג (תומכת מבחוץ), ד (נמנעת)');
  assert.equal(EN.results.restored(['A', 'B'], ['C (supports from outside)', 'D (abstains)']), 'Previous coalition restored: A + B · Outside the coalition: C (supports from outside), D (abstains)');
  assert.equal(EN.results.restored([], ['C (supports from outside)']), 'Previous coalition restored · Outside the coalition: C (supports from outside)');
});

test('closest coalitions (#22): "closest to the stated positions", never best or recommended, in both languages', () => {
  const texts = (K, M) => [
    ...Object.entries(K).map(([k, v]) => (k === 'orList' ? v(['X', 'Y']) : typeof v === 'function' ? v('X', 2, 'Y') : v)),
    K.showPartial(1, 'X'), K.redLines(0, ''), K.redLines(1, 'Y'), M.closestTitle, ...Object.values(M.closestRule).flat(2),
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
  assert.ok(S.method.closestRule.after.some((t) => /זו לא המלצה/.test(t)));
  assert.ok(EN.method.closestRule.after.some((t) => /not a recommendation/.test(t)));
  // #32: 4 inclusion rules, and the 5 sort keys of closestTo() plus the completions order as the 6th step; no "6 of 8".
  for (const M of [S.method, EN.method]) {
    assert.equal(M.closestRule.included.length, 4);
    assert.equal(M.closestRule.order.length, 6);
    assert.ok(!Object.values(M.closestRule).flat(2).some((t) => /6 מתוך 8|6 of the 8|6 of 8/.test(t)));
  }
});

test('share text: members, then the parties outside the coalition with roles and their clashes; unchanged without them', () => {
  assert.equal(S.share.text('א + ב', 1), 'הקואליציה שבניתי: א + ב · נושא אחד בסתירה חזיתית');
  assert.equal(S.share.text('א + ב', 1, null, []), 'הקואליציה שבניתי: א + ב · נושא אחד בסתירה חזיתית');
  assert.equal(EN.share.text('A + B', 2), 'The coalition I built: A + B · 2 topics in a head-on clash');
  const out = [['הרשימה המשותפת', 'תומכת מבחוץ'], ['רע״ם', 'נמנעת']];
  assert.equal(S.share.text('ישר! + ביחד + הדמוקרטים + ישראל ביתנו', 0, 7, out),
    'הקואליציה שבניתי: ישר! + ביחד + הדמוקרטים + ישראל ביתנו · מחוץ לקואליציה: הרשימה המשותפת (תומכת מבחוץ), רע״ם (נמנעת) · 0 נושאים בסתירה חזיתית בין חברות הקואליציה · 7 סתירות חזיתיות עם המפלגות מחוץ לקואליציה');
  assert.equal(S.share.text('א + ב', 1, 1, [['ג', 'נמנעת']]), 'הקואליציה שבניתי: א + ב · מחוץ לקואליציה: ג (נמנעת) · נושא אחד בסתירה חזיתית בין חברות הקואליציה · סתירה חזיתית אחת עם המפלגות מחוץ לקואליציה');
  assert.equal(S.share.text('א + ב', 2, 0, [['ג', 'תומכת מבחוץ']]), 'הקואליציה שבניתי: א + ב · מחוץ לקואליציה: ג (תומכת מבחוץ) · 2 נושאים בסתירה חזיתית בין חברות הקואליציה · אין סתירות חזיתיות עם המפלגות מחוץ לקואליציה');
  assert.equal(EN.share.text('Yashar! + Beyachad + The Democrats + Yisrael Beytenu', 0, 7, [['The Joint List', 'supports from outside'], ["Ra'am", 'abstains']]),
    "The coalition I built: Yashar! + Beyachad + The Democrats + Yisrael Beytenu · Outside the coalition: The Joint List (supports from outside), Ra'am (abstains) · 0 topics in a head-on clash between the coalition members · 7 head-on clashes with the parties outside the coalition");
  // The same N and count words as the snapshot's outside block ("↓ <count> עם חברות הקואליציה").
  for (const n of [0, 1, 7]) {
    const count = S.results.peripheryLink(n).replace(/^↓ /, '').replace(/ עם חברות הקואליציה$/, '');
    assert.ok(S.share.text('א', 0, n, [['ג', 'נמנעת']]).endsWith(` · ${count} עם המפלגות מחוץ לקואליציה`), `N=${n}`);
    const en = EN.results.peripheryLink(n).replace(/^↓ /, '').replace(/ with the coalition members$/, '');
    assert.ok(EN.share.text('A', 0, n, [['C', 'abstains']]).endsWith(` · ${en[0].toLowerCase() + en.slice(1)} with the parties outside the coalition`), `EN N=${n}`);
  }
});

test('snapshot outside block and header groups: exact wording in both languages', () => {
  assert.equal(S.results.peripheryLink(0), '↓ אין סתירות חזיתיות עם חברות הקואליציה');
  assert.equal(S.results.peripheryLink(1), '↓ סתירה חזיתית אחת עם חברות הקואליציה');
  assert.equal(S.results.peripheryLink(7), '↓ 7 סתירות חזיתיות עם חברות הקואליציה');
  assert.equal(EN.results.peripheryLink(0), '↓ No head-on clashes with the coalition members');
  assert.equal(EN.results.peripheryLink(1), '↓ 1 head-on clash with the coalition members');
  assert.equal(EN.results.peripheryLink(7), '↓ 7 head-on clashes with the coalition members');
  assert.equal(S.results.outsideHeading, 'מול המפלגות מחוץ לקואליציה');
  assert.equal(EN.results.outsideHeading, 'Versus the parties outside the coalition');
  assert.equal(S.results.membersLabel(4), 'בקואליציה (4)');
  assert.equal(EN.results.membersLabel(4), 'In the coalition (4)');
  assert.equal(S.results.outsideLabel, 'מחוץ לקואליציה');
  assert.equal(EN.results.outsideLabel, 'Outside the coalition');
  assert.equal(S.results.outsideParty('הרשימה המשותפת', S.results.roleName.supporter), 'הרשימה המשותפת · תומכת מבחוץ');
  assert.equal(S.results.outsideParty('רע״ם', S.results.roleName.abstainer), 'רע״ם · נמנעת');
  assert.equal(EN.results.outsideParty('The Joint List', EN.results.roleName.supporter), 'The Joint List · supports from outside');
  assert.equal(EN.results.outsideParty("Ra'am", EN.results.roleName.abstainer), "Ra'am · abstains");
  assert.equal(S.results.breakdownLabel, 'נושאים בין חברות הקואליציה:');
  assert.equal(EN.results.breakdownLabel, 'Topics between the coalition members:');
});

test('red-line summary (#14): singular, plural and none, in both languages', () => {
  assert.equal(S.results.redLinesCrossed(1, 'ש״ס · גיוס'), 'קו אדום אחד נחצה בין חברות הקואליציה: ש״ס · גיוס');
  assert.equal(S.results.redLinesCrossed(3, 'א · ב, ג · ד'), '3 קווים אדומים נחצו בין חברות הקואליציה: א · ב, ג · ד');
  assert.equal(S.results.noRedLinesCrossed, 'אין קו אדום שנחצה בין חברות הקואליציה');
  assert.equal(EN.results.redLinesCrossed(1, 'Shas · Draft'), '1 red line is crossed between the coalition members: Shas · Draft');
  assert.equal(EN.results.redLinesCrossed(3, 'A · B, C · D'), '3 red lines are crossed between the coalition members: A · B, C · D');
  assert.equal(EN.results.noRedLinesCrossed, 'No red line is crossed between the coalition members');
  // The method page says the line covers the members only, and what 🚩 marks in the supporters/abstainers card.
  assert.ok(S.method.redLinesCrossedRule.endsWith('השורה הזו בודקת רק את חברות הקואליציה. קווים אדומים של התומכות והנמנעות לא נבדקים בה. בכרטיס שלהן, 🚩 מסמן פער של 2 דרגות שנחשב סתירה חזיתית בגלל קו אדום.'));
  assert.ok(EN.method.redLinesCrossedRule.endsWith('This line checks only the coalition members. Red lines of supporters and abstainers are not checked here. In their card, 🚩 marks a 2-step gap that counts as a head-on clash because of a red line.'));
});

test('seats wording (#H1): the margin, the compact line, the members alone, in both languages', () => {
  const m = (kind, n) => ({ kind, n });
  assert.deepEqual([m('over', 6), m('over', 1), m('exact', 0), m('short', 3), m('short', 1)].map((x) => S.seats.margin(x, true)),
    ['6 מעל הרוב', 'מנדט אחד מעל הרוב', 'בדיוק רוב', 'חסרים 3 לרוב', 'חסר מנדט אחד לרוב']);
  assert.deepEqual([m('over', 6), m('over', 1), m('exact', 0), m('short', 3), m('short', 1)].map((x) => EN.seats.margin(x, true)),
    ['6 above a majority', '1 above a majority', 'exactly a majority', '3 short of a majority', '1 short of a majority']);
  // Poll averages keep their "≈", with no singular in words.
  assert.equal(S.seats.margin(m('short', 1), false), 'חסרים ≈1 לרוב');
  assert.deepEqual(S.seats.compact(67, '6 מעל הרוב'), ['67 מנדטים', '6 מעל הרוב']);
  assert.deepEqual(EN.seats.compact(67, '6 above a majority'), ['67 seats', '6 above a majority']);
  assert.equal(S.seats.membersLine(48, 'חסרים 13 לרוב'), 'חברות הקואליציה לבדן: 48 · חסרים 13 לרוב');
  assert.equal(EN.seats.membersLine(48, '13 short of a majority'), 'Coalition members alone: 48 · 13 short of a majority');
});

test('seats card (#H1): the summary and the rows, numbers only, an abstainer as voting against, in both languages', () => {
  const K = S.seats.card;
  const E = EN.seats.card;
  assert.deepEqual([K.members(4, 4), K.members(2, 2), K.members(2, 4), K.members(1, 4), K.members(0, 4), K.members(1, 1)],
    ['כל 4 החברות נחוצות לרוב', 'שתי החברות נחוצות לרוב', '2 מתוך 4 חברות נחוצות לרוב', 'חברה אחת מתוך 4 נחוצה לרוב', 'אין חברה שבלעדיה אין רוב', 'החברה היחידה בקואליציה נחוצה לרוב']);
  assert.deepEqual([E.members(4, 4), E.members(2, 2), E.members(2, 4), E.members(1, 4), E.members(0, 4)],
    ['All 4 members are needed for a majority', 'Both members are needed for a majority', '2 of the 4 members are needed for a majority', '1 of the 4 members is needed for a majority', 'No member on its own is needed for a majority']);
  assert.deepEqual([K.outside(1, 3), K.outside(2, 3), K.outside(0, 3), K.outside(1, 1)],
    ['מחוץ לקואליציה: אחת מתוך 3 נחוצה לרוב', 'מחוץ לקואליציה: 2 מתוך 3 נחוצות לרוב', 'מחוץ לקואליציה: אף אחת לא נחוצה לרוב', 'מחוץ לקואליציה: המפלגה היחידה נחוצה לרוב']);
  assert.deepEqual([E.outside(1, 3), E.outside(0, 3)], ['Outside the coalition: 1 of 3 is needed for a majority', 'Outside the coalition: none is needed for a majority']);
  assert.equal(K.memberRow('הליכוד', 40, 'חסרים 21 לרוב', null), 'בלי הליכוד: 40 מנדטים (חסרים 21 לרוב)');
  assert.equal(K.memberRow('הציונות הדתית', 61, 'בדיוק רוב', null), 'בלי הציונות הדתית: 61 מנדטים (בדיוק רוב)');
  assert.equal(K.memberRow('עוצמה יהודית', 60, 'חסר מנדט אחד לרוב', 60), 'בלי עוצמה יהודית: 60 מנדטים (חסר מנדט אחד לרוב, תיקו 60 מול 60)');
  assert.equal(E.memberRow('Otzma Yehudit', 60, '1 short of a majority', 60), 'Without Otzma Yehudit: 60 seats (1 short of a majority, a 60–60 tie)');
  assert.equal(E.memberRow('Likud', 40, '21 short of a majority', null), 'Without Likud: 40 seats (21 short of a majority)');
  assert.equal(K.roleRow('ישר!', 'member', 38, 67, K.outcome.no, null), 'בלי ישר!: 38 מול 67 · אין רוב');
  assert.equal(K.roleRow('הרשימה המשותפת', 'supporter', 48, 57, K.outcome.no, null), 'בלי הרשימה המשותפת (תומכת מבחוץ): 48 מול 57 · אין רוב');
  assert.equal(K.roleRow('רע״ם', 'abstainer', 59, 54, K.outcome.yes, null), 'אם רע״ם תצביע נגד: 59 מול 54 · יש רוב');
  assert.equal(K.roleRow('ביחד', 'member', 60, 60, K.outcome.tie, K.membersAlone(58, 'חסרים 3 לרוב')), 'בלי ביחד: 60 מול 60 · תיקו, אין רוב · חברות הקואליציה לבדן 58 (חסרים 3 לרוב)');
  assert.equal(K.roleRow('ביחד', 'member', '≈47', '≈65', K.outcome.no, null), 'בלי ביחד: ≈47 מול ≈65 · אין רוב');
  assert.equal(E.roleRow('Yashar!', 'member', 38, 67, E.outcome.no, null), 'Without Yashar!: 38 vs 67 · no majority');
  assert.equal(E.roleRow("Ra'am", 'abstainer', 59, 54, E.outcome.yes, null), "If Ra'am votes against: 59 vs 54 · a majority");
  assert.equal(E.roleRow('The Joint List', 'supporter', 48, 57, E.outcome.no, null), 'Without The Joint List (supports from outside): 48 vs 57 · no majority');
  assert.equal(E.roleRow('Beyachad', 'member', 60, 60, E.outcome.tie, E.membersAlone(58, '3 short of a majority')), 'Without Beyachad: 60 vs 60 · a tie, no majority · coalition members alone 58 (3 short of a majority)');
});

test('#1, #13, #14: no verdict words (best, recommended, kingmaker, risk…) in the new strings, in both languages', () => {
  const VERDICT = /הטוב|מומלצ|מועדפ|סיכון|מסוכנ|מכריע|לשון מאזניים|קריטי|מפתח|\bbest\b|\brecommended\b|\bkingmaker\b|\brisk|\bcritical\b|\bkey\b|\bdecisive\b/i;
  for (const T of [S, EN]) {
    const texts = [
      T.seats.card.title, T.seats.card.details, T.seats.card.rolesIntro, T.seats.card.noMajority, ...[[4, 4], [2, 4], [0, 4], [1, 1]].flatMap(([k, n]) => [T.seats.card.members(k, n), T.seats.card.outside(k, n)]),
      ...['member', 'supporter', 'abstainer'].map((r) => T.seats.card.roleRow('X', r, 60, 60, T.seats.card.outcome.tie, '58')), T.seats.card.memberRow('X', 60, 'Y', 60),
      ...[['over', 6], ['exact', 0], ['short', 3]].map(([kind, n]) => T.seats.margin({ kind, n }, true)),
      T.results.redLinesCrossed(2, 'X'), T.results.noRedLinesCrossed, T.method.redLinesCrossedRule,
      T.share.text('X', 1, 0, [['Y', T.results.roleName.supporter]]), T.share.text('X', 1, 5, [['Y', T.results.roleName.abstainer]]), ...T.method.rolesRules(true, false),
      T.results.summaryTitleScoped(4), T.results.breakdownLabel, T.results.membersLabel(4), T.results.outsideLabel, T.results.outsideHeading,
      T.results.peripheryLink(0), T.results.peripheryLink(7),
    ];
    assert.deepEqual(texts.filter((t) => VERDICT.test(t)), []);
  }
});

test('snapshot title: scoped to the members (2+), "שתי" for two in Hebrew', () => {
  assert.equal(S.results.summaryTitleScoped(4), 'תמונת מצב בין 4 חברות הקואליציה');
  assert.equal(S.results.summaryTitleScoped(2), 'תמונת מצב בין שתי חברות הקואליציה');
  assert.equal(EN.results.summaryTitleScoped(4), 'Overview: between the 4 coalition members');
  assert.equal(EN.results.summaryTitleScoped(2), 'Overview: between the 2 coalition members');
});

// #26: the task cards describe what each tool shows, never what it concludes, and rank nothing.
test('task cards: neutral wording, no numbers of seats, both languages', async () => {
  const { S: EN } = await import('../site/js/strings.en.js');
  const texts = (H) => [H.title, H.build, H.buildLine(8), H.closest, H.closestLine, H.pair, H.pairLine(8)];
  for (const t of texts(S.home)) {
    assert.ok(!/מומלצ|פופולר|הכי|הטוב|הקרוב|מנדט|61/.test(t), `HE: ${t}`);
  }
  for (const t of texts(EN.home)) {
    assert.ok(!/recommend|popular|best|closest|top\b|seat|61/i.test(t), `EN: ${t}`);
  }
  assert.equal(S.buildIntro(8), 'איפה המפלגות מסכימות ואיפה הן מתנגשות, ב-8 נושאים, עם מקור לכל עמדה.');
  assert.equal(EN.buildIntro(8), 'Where the parties agree and where they clash, on 8 topics, with a source for every position.');
  assert.equal(S.home.buildLine(8), 'בחרו מפלגות ותפקיד לכל אחת, וראו איפה הן מסכימות ואיפה הן מתנגשות ב-8 נושאים.');
  assert.equal(S.home.pairLine(1), 'העמדות המוצהרות של שתי מפלגות זו לצד זו בנושא אחד, עם מקור לכל עמדה.');
  assert.equal(S.presets.scenariosStart(3, '1.11'), 'או התחילו מתרחיש שעלה בתקשורת (3) · נכון ל-1.11');
  // The purpose line keeps the disclaimer and names the three source kinds, record = bills (never votes).
  assert.equal(S.buildPurpose, 'העמדות לקוחות ממצעים, מהצהרות רשמיות ומהצעות חוק שהמפלגות יזמו או קידמו. זו לא המלצת הצבעה.');
  assert.ok(EN.buildPurpose.endsWith('This is not a voting recommendation.'));
});

test('scenario sources (#34): a party\'s reply is prefixed with its name, in both languages', () => {
  assert.equal(S.presets.replyBy.denial('ש״ס') + 'mako, 7.11', 'הכחשת ש״ס: mako, 7.11');
  assert.equal(S.presets.replyBy.refusal('ישראל ביתנו') + 'ynet, 6.11', 'דחיית ישראל ביתנו: ynet, 6.11');
  assert.equal(S.presets.replyBy.response('יהדות התורה') + 'ynet, 6.11', 'תגובת יהדות התורה: ynet, 6.11');
  assert.equal(EN.presets.replyBy.denial('Shas') + 'N12 (Mako), 7 Nov', 'Denial by Shas: N12 (Mako), 7 Nov');
  assert.equal(EN.presets.replyBy.refusal('Yisrael Beytenu') + 'ynet, 6 Nov', 'Rejection by Yisrael Beytenu: ynet, 6 Nov');
  assert.equal(EN.presets.replyBy.response('United Torah Judaism') + 'ynet, 6 Nov', 'Response by United Torah Judaism: ynet, 6 Nov');
  // A person's statement: a hyphen before an outlet in Latin letters only.
  assert.equal(S.presets.personIn('אביגדור ליברמן', 'ynet') + 'ynet', 'אביגדור ליברמן ב-ynet');
  assert.equal(S.presets.personIn('עמית סגל', 'כיפה') + 'כיפה', 'עמית סגל בכיפה');
  assert.equal(EN.presets.personIn('Avigdor Liberman', 'ynet') + 'ynet', 'Avigdor Liberman in ynet');
});

test('why rows and the votes line (#30): the gap sentence in both languages, the votes as unbreakable segments', () => {
  assert.equal(S.sheet.gapTitle('א', 'ב', 2), 'א ↔ ב: פער של 2 דרגות');
  assert.equal(S.sheet.gapTitle('א', 'ב', 1), 'א ↔ ב: פער של דרגה אחת');
  assert.equal(EN.sheet.gapTitle('A', 'B', 3), 'A ↔ B: a gap of 3 steps');
  assert.equal(EN.sheet.gapTitle('A', 'B', 1), 'A ↔ B: a gap of 1 step');
  assert.deepEqual(S.elected.partyResult(8, '6.44', '366,278', false), ['8 מנדטים', '6.44% מהקולות', '366,278 קולות']);
  assert.deepEqual(EN.elected.partyResult(8, '6.44', '366,278', false), ['8 seats', '6.44% of the vote', '366,278 votes']);
  assert.equal(S.elected.partyResult(5, '4.10', '200,000', true).length, 3);
});
