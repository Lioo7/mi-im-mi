// The glossary (CLAUDE.md) in both languages: loaded terms appear only inside attributed quotes, and the dual terms
// always come in pairs. Checks the UI strings and every text field of the data, with quoted spans removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../scripts/lib.mjs';
import { S as HE } from '../site/js/strings.js';
import { S as EN } from '../site/js/strings.en.js';

const { parties, topics, meta, positions, results } = loadData();

import { unquoted } from './text.mjs';

const HEB = '\\u05D0-\\u05EA';

const RULES = {
  he: [
    [/השתמט/, 'השתמטות: use "פטור/דחיית שירות"'],
    [/רפורמה|הפיכה/, 'רפורמה/הפיכה: use "השינויים המוצעים במערכת המשפט"'],
    [(s) => /סיפוח/.test(s) && !/ריבונות/.test(s), 'סיפוח without החלת ריבונות'],
    [(s) => new RegExp(`(^|[^${HEB}])[בוהמל]?גדה(?![${HEB}])`).test(s) && !/יהודה ושומרון/.test(s), 'הגדה המערבית without יהודה ושומרון'],
  ],
  en: [
    [/draft[- ]dodg|\bevasion\b|\bevaders?\b/i, 'draft dodging/evasion: use "exemption / deferral of service"'],
    [/judicial (reform|overhaul)|\bcoup\b/i, 'reform/overhaul/coup: use "the proposed changes to the judicial system"'],
    [(s) => /annex/i.test(s) && !/sovereignty/i.test(s), 'annexation without applying sovereignty'],
    [(s) => /West Bank/.test(s) && !/Judea and Samaria/.test(s), 'West Bank without Judea and Samaria'],
    [(s) => /ultra-Orthodox/.test(s.replace(/Haredi \(ultra-Orthodox\)/g, '')), '"ultra-Orthodox" alone: use "Haredi (ultra-Orthodox)"'],
    [(s) => /Haredi/.test(s) && !/^[^]*?Haredi \(ultra-Orthodox\)/.test(s.slice(s.search(/Haredi/))), 'first "Haredi" without "(ultra-Orthodox)"'],
  ],
};

export function violations(lang, text) {
  const s = unquoted(text);
  return RULES[lang].filter(([rule]) => (typeof rule === 'function' ? rule(s) : rule.test(s))).map(([, why]) => why);
}

// Every string in an object (function sources included, so templates are checked too).
function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (typeof v === 'function') out.push(v.toString());
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

const topicTexts = (t) => [t.name, t.short, t.axisNote, ...Object.values(t.axis)];
const partyTexts = (p) => [p.name, p.officialName, p.leader, p.seatNote, ...(p.components ?? [])].filter(Boolean);
const TEXTS = {
  he: [
    ...strings(HE).map((s) => ['strings.js', s]),
    ...topics.flatMap((t) => topicTexts(t).map((s) => [`topic ${t.id}`, s])),
    ...positions.map((p) => [`${p.partyId}|${p.topicId} summary`, p.summary]),
    ...parties.flatMap((p) => partyTexts(p).map((s) => [`party ${p.id}`, s])),
    ['meta', meta.resultsStatus],
    ...(results?.lists ?? []).filter((l) => l.splitNote).map((l) => ['results', l.splitNote]),
  ],
  en: [
    ...strings(EN).map((s) => ['strings.en.js', s]),
    ...topics.flatMap((t) => topicTexts(t.en).map((s) => [`topic ${t.id} en`, s])),
    ...positions.map((p) => [`${p.partyId}|${p.topicId} summaryEn`, p.summaryEn]),
    ...parties.flatMap((p) => partyTexts(p.en).map((s) => [`party ${p.id} en`, s])),
    ['meta en', meta.en.resultsStatus],
    ...(results?.lists ?? []).filter((l) => l.en?.splitNote).map((l) => ['results en', l.en.splitNote]),
  ],
};

for (const lang of ['he', 'en']) {
  test(`glossary (${lang}): no loaded term outside a quote, dual terms in pairs`, () => {
    const bad = TEXTS[lang].flatMap(([where, s]) => violations(lang, s).map((why) => `${where}: ${why}`));
    assert.deepEqual(bad, []);
  });
}

test('the glossary rules catch what they should, and leave quotes alone', () => {
  // The two Hebrew topic labels fixed on 2.11 would fail.
  assert.deepEqual(violations('he', 'בלי מדינה פלסטינית בטווח הנראה וגם בלי סיפוח: ניהול הסכסוך'), ['סיפוח without החלת ריבונות']);
  assert.deepEqual(violations('he', 'הציר מודד ריבונות ושליטה בגדה (הסדר הקבע).'), ['הגדה המערבית without יהודה ושומרון']);
  assert.deepEqual(violations('he', 'ריבונות ושליטה ביהודה ושומרון / הגדה המערבית'), []);
  assert.deepEqual(violations('he', 'פטור מגיוס, ולא השתמטות'), ['השתמטות: use "פטור/דחיית שירות"']);
  // Inside an attributed quote a loaded term is allowed; gershayim inside words are not quote marks.
  assert.deepEqual(violations('he', 'בנט התחייב לבטל את החוקים (״חוקי ההפיכה המשפטית״, בלשונו).'), []);
  assert.deepEqual(violations('he', 'ש״ס וצה״ל: רפורמה'), ['רפורמה/הפיכה: use "השינויים המוצעים במערכת המשפט"']);
  assert.deepEqual(violations('he', 'מתנגדת ל״סיפוח, ההתנחלות והעקירה״ של יועמ״שית'), []);
  assert.deepEqual(violations('en', 'Opposes "annexation, settlement" and settler violence.'), []);
  assert.deepEqual(violations('en', 'Stop the annexation.'), ['annexation without applying sovereignty']);
  assert.deepEqual(violations('en', 'Control in the West Bank.'), ['West Bank without Judea and Samaria']);
  assert.deepEqual(violations('en', "Ra'am's 'judicial coup' remark"), []);
  assert.deepEqual(violations('en', 'the judicial overhaul'), ['reform/overhaul/coup: use "the proposed changes to the judicial system"']);
  assert.deepEqual(violations('en', 'Haredi (ultra-Orthodox) service, then Haredi enlistment'), []);
  assert.deepEqual(violations('en', 'Haredi enlistment'), ['first "Haredi" without "(ultra-Orthodox)"']);
  assert.deepEqual(violations('en', 'ultra-Orthodox enlistment'), ['"ultra-Orthodox" alone: use "Haredi (ultra-Orthodox)"']);
});
