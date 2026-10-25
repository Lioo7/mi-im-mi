import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateParties } from '../scripts/lib.mjs';

const parties = JSON.parse(readFileSync(new URL('../site/data/parties.json', import.meta.url), 'utf8'));

// Pinned from the CEC list "רשימות המועמדים לכנסת" (approved 27.9.2026, page updated 22.10.2026),
// verified against research/cec-candidate-lists-26.pdf. Gershayim normalized to ״.
const CEC = {
  likud: ['מחל', 'הליכוד', 'הליכוד בהנהגת בנימין נתניהו לראשות הממשלה'],
  yashar: ['דרך', 'ישר!', 'ישר! עם איזנקוט לראשות הממשלה מאחדים את ישראל'],
  together: ['רק', 'ביחד', 'ביחד בראשות נפתלי בנט'],
  democrats: ['אמת', 'הדמוקרטים', 'הדמוקרטים בראשות יאיר גולן'],
  'joint-list': ['ודם', 'הרשימה המשותפת', 'הרשימה המשותפת'],
  shas: ['שס', 'ש״ס', 'התאחדות הספרדים שומרי תורה תנועתו של מרן הרב עובדיה יוסף זצ״ל'],
  'otzma-yehudit': ['ב', 'עוצמה יהודית', 'עוצמה יהודית בראשות איתמר בן גביר'],
  utj: ['ג', 'יהדות התורה', 'יהדות התורה והשבת אגודת ישראל – דגל התורה'],
  'yisrael-beiteinu': ['ל', 'ישראל ביתנו', 'ישראל ביתנו בראשות אביגדור ליברמן'],
  'religious-zionism': ['ט', 'הציונות הדתית וזהות', "הציונות הדתית בראשות בצלאל סמוטריץ' וזהות בראשות משה פייגלין"],
  raam: ['עם', 'רע״ם', 'רע״ם – הרשימה הערבית המאוחדת'],
  kalkalit: ['די', 'המילואימניקים והכלכלית', 'המילואימניקים והכלכלית בראשות יועז הנדל וירון זליכה'],
  'amcha-yisrael': ['ך', 'עמך ישראל', 'עמך ישראל בראשות עופר וינטר'],
};

test('party names and ballot letters match the pinned CEC list', () => {
  assert.equal(parties.length, Object.keys(CEC).length);
  for (const p of parties) {
    const [letters, name, official] = CEC[p.id] ?? [];
    assert.equal(p.ballotLetters, letters, `${p.id} ballotLetters`);
    assert.equal(p.name, name, `${p.id} name`);
    assert.equal(p.officialName, official, `${p.id} officialName`);
  }
});

test('parties.json passes schema validation', () => {
  assert.deepEqual(validateParties(parties), []);
});

test('parties are ordered by poll average, ties alphabetical', () => {
  const avg = (p) => p.pollAvg ?? 0;
  for (let i = 1; i < parties.length; i++) {
    const a = parties[i - 1], b = parties[i];
    assert.ok(avg(a) > avg(b) || (avg(a) === avg(b) && a.name.localeCompare(b.name, 'he') <= 0), `${a.id} before ${b.id}`);
  }
});
