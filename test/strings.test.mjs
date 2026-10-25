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
