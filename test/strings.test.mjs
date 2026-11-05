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
  assert.equal(EN.share.text('A + B', 0, 0, [['C', 'abstains']]), 'The coalition I built: A + B · Outside the coalition: C (abstains) · 0 topics in a head-on clash between the coalition members · no head-on clashes with the parties outside the coalition');
  assert.equal(EN.share.text('A + B', 2, 1, [['C', 'supports from outside']]), 'The coalition I built: A + B · Outside the coalition: C (supports from outside) · 2 topics in a head-on clash between the coalition members · 1 head-on clash with the parties outside the coalition');
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

test('pivotal rows (#13): numbers only, an abstainer as voting against, in both languages', () => {
  assert.equal(S.seats.pivotalIntro(true), 'מפלגות שבלעדיהן אין לחברות הקואליציה 61, או שאין רוב בהצבעת האמון (בעד מול נגד):');
  assert.equal(S.seats.pivotalIntro(false), 'מפלגות שבלעדיהן אין רוב בהצבעת האמון (בעד מול נגד):');
  assert.equal(EN.seats.pivotalIntro(true), 'Parties without which the members no longer have 61, or the confidence vote has no majority (for vs against):');
  assert.equal(EN.seats.pivotalIntro(false), 'Parties without which the confidence vote has no majority (for vs against):');
  assert.equal(S.seats.pivotalRow('ישר!', 'member', 40, 40, 80), 'בלי ישר!: חברות הקואליציה 40 מתוך 61 · 40 מול 80');
  assert.equal(S.seats.pivotalRow('ביחד', 'member', null, 47, 65), 'בלי ביחד: 47 מול 65');
  assert.equal(S.seats.pivotalRow('הרשימה המשותפת', 'supporter', null, 48, 64), 'בלי הרשימה המשותפת (תומכת מבחוץ): 48 מול 64');
  assert.equal(S.seats.pivotalRow('רע״ם', 'abstainer', null, 59, 61), 'אם רע״ם תצביע נגד: 59 מול 61');
  assert.equal(S.seats.pivotalRow('ביחד', 'member', null, '≈47', '≈65'), 'בלי ביחד: ≈47 מול ≈65');
  assert.equal(EN.seats.pivotalRow('Yashar!', 'member', 40, 40, 80), 'Without Yashar!: coalition members 40 of 61 · 40 vs 80');
  assert.equal(EN.seats.pivotalRow('Beyachad', 'member', null, 47, 65), 'Without Beyachad: 47 vs 65');
  assert.equal(EN.seats.pivotalRow('The Joint List', 'supporter', null, 48, 64), 'Without The Joint List (supports from outside): 48 vs 64');
  assert.equal(EN.seats.pivotalRow("Ra'am", 'abstainer', null, 59, 61), "If Ra'am votes against: 59 vs 61");
});

test('#1, #13, #14: no verdict words (best, recommended, kingmaker, risk…) in the new strings, in both languages', () => {
  const VERDICT = /הטוב|מומלצ|מועדפ|סיכון|מסוכנ|מכריע|לשון מאזניים|קריטי|מפתח|\bbest\b|\brecommended\b|\bkingmaker\b|\brisk|\bcritical\b|\bkey\b|\bdecisive\b/i;
  for (const T of [S, EN]) {
    const texts = [
      T.seats.pivotalIntro(true), T.seats.pivotalIntro(false), T.seats.pivotalNone, ...['member', 'supporter', 'abstainer'].map((r) => T.seats.pivotalRow('X', r, 60, 60, 60)),
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
