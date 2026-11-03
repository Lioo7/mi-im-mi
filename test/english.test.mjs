import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, validateEnglish, validatePositions } from '../scripts/lib.mjs';
import { S as EN, NAMES } from '../site/js/strings.en.js';
import { quoteAttribution, correctionMailto, SITE_TRANSLATOR } from '../site/js/links.js';

const data = loadData();

// Pinned from the approved name list (docs/research/decisions.md): GPO English list, the party's own English, or a
// transliteration. A Hebrew name is transliterated unless it has an established English one.
const NAMES_EN = {
  likud: ['Likud', 'Benjamin Netanyahu'],
  yashar: ['Yashar!', 'Gadi Eisenkot'],
  together: ['Beyachad', 'Naftali Bennett'],
  democrats: ['The Democrats', 'Yair Golan'],
  'joint-list': ['The Joint List', 'Yousef Jabareen'],
  'otzma-yehudit': ['Otzma Yehudit', 'Itamar Ben-Gvir'],
  shas: ['Shas', 'Aryeh Deri'],
  utj: ['United Torah Judaism', 'Yaakov Asher'],
  'yisrael-beiteinu': ['Yisrael Beytenu', 'Avigdor Liberman'],
  'religious-zionism': ['Religious Zionism', 'Bezalel Smotrich'],
  raam: ["Ra'am", 'Mansour Abbas'],
  kalkalit: ['The Reservists and the Economic Party', 'Yoaz Hendel and Yaron Zelekha'],
  zehut: ['Zehut', 'Moshe Feiglin'],
  'amcha-yisrael': ['Amcha Yisrael', 'Ofer Winter'],
};

test('every party has its approved English name and leader', () => {
  assert.deepEqual(Object.keys(NAMES_EN).sort(), data.parties.map((p) => p.id).sort());
  for (const p of data.parties) assert.deepEqual([p.en.name, p.en.leader], NAMES_EN[p.id], p.id);
});

test('the English data is complete: validateEnglish passes on the live files', () => {
  assert.deepEqual(validateEnglish(data), []);
});

test('validateEnglish flags a missing or Hebrew en field, and allows a ballot letter in parentheses', () => {
  const party = (en) => ({ id: 'x', name: 'א', officialName: 'א', leader: 'ב', components: ['ג', 'ד'], en });
  const meta = { pollNote: 'א', resultsStatus: 'ב', en: { pollNote: 'a', resultsStatus: 'b' } };
  const run = (p, m = meta) => validateEnglish({ parties: [p], meta: m, results: null, scenarios: null });
  assert.deepEqual(run(party({ name: 'X', officialName: 'X (ט)', leader: 'Y', components: ['A', 'B'] })), []);
  assert.match(run(party({ name: 'X', officialName: 'X', leader: 'Y' })).join(), /en\.components/);
  assert.match(run(party({ name: 'X', officialName: 'X', leader: 'יוסי', components: ['A', 'B'] })).join(), /en\.leader/);
  assert.match(run(party({ name: 'X', officialName: 'X', leader: 'Y', components: ['A'] })).join(), /en\.components/);
  assert.match(run(party({ name: 'X', officialName: 'X', leader: 'Y', components: ['A', 'B'] }), { ...meta, en: { pollNote: 'a' } }).join(), /meta: missing or non-English en\.resultsStatus/);
});

test('every person and channel named in the positions has an English name', () => {
  const named = new Set(data.positions.flatMap((p) => [p.quoteBy, p.quoteChannel, p.quoteTranslatedBy]).filter((v) => v && v !== SITE_TRANSLATOR));
  assert.deepEqual([...named].filter((n) => !NAMES[n]), []);
  assert.ok(Object.values(NAMES).every((n) => !/[֐-׿]/.test(n)));
});

test('English quote attribution and correction mail', () => {
  assert.equal(
    quoteAttribution({ quoteBy: 'מנסור עבאס', quoteChannel: 'פייסבוק', quoteTranslatedBy: 'כיפה', sourceUrl: 'https://www.kipa.co.il/x', sourceType: 'statement', sourceDate: '2026-08-26' }, "Ra'am", EN),
    'Mansour Abbas, Facebook, 26 Aug 2026 (Hebrew translation: Kipa)');
  assert.equal(quoteAttribution({ sourceUrl: 'https://www.mako.co.il/news-politics/x', sourceType: 'statement', sourceDate: null }, 'Shas', EN), 'Shas, N12 (Mako)');
  assert.equal(quoteAttribution({ sourceUrl: 'https://www.hakalkalit.org/x', sourceType: 'platform', sourceDate: null }, 'The Reservists and the Economic Party', EN),
    'The Reservists and the Economic Party, The New Economic Party');
  const q = new URL(correctionMailto({ party: 'Shas', topic: 'Draft', url: 'https://x.example/#results?l=en' }, EN)).searchParams;
  assert.equal(q.get('subject'), 'Correction: Shas · Draft');
  assert.ok(q.get('body').startsWith('Link to the page: https://x.example/'));
});

test('every position has an English summary, and every non-English quote an English translation', () => {
  const parties = [{ id: 'p' }];
  const topics = [{ id: 't' }];
  // A null row with a source (a quote needs one).
  const row = (extra) => ({ partyId: 'p', topicId: 't', position: null, redLine: false, summary: 'תקציר', summaryEn: 'Summary', quote: null,
    sourceUrl: 'https://a.example/', ...extra });
  const run = (extra) => validatePositions([row(extra)], parties, topics).join();
  assert.equal(run({}), '');
  assert.match(run({ summaryEn: null }), /summaryEn/);
  assert.match(run({ summaryEn: 'תקציר' }), /summaryEn/);
  assert.match(run({ quote: 'ציטוט', quoteTranslationEn: null }), /quoteTranslationEn/);
  assert.equal(run({ quote: 'ציטוט', quoteTranslationEn: 'A quote' }), '');
  assert.equal(run({ quote: 'دولة فلسطين', quoteTranslationEn: 'The State of Palestine' }), '');
  // A quote already in English needs no translation, and must not get one.
  assert.equal(run({ quote: 'We are staying', quoteTranslationEn: null }), '');
  assert.match(run({ quote: 'We are staying', quoteTranslationEn: 'We are staying' }), /quoteTranslationEn/);
});

test('an additional source is a URL, and only on a row with a position', () => {
  const parties = [{ id: 'p' }];
  const topics = [{ id: 't' }];
  const row = (extra) => ({ partyId: 'p', topicId: 't', position: -2, redLine: false, summary: 'תקציר', summaryEn: 'Summary', quote: null,
    sourceUrl: 'https://a.example/', sourceType: 'platform', ...extra });
  const run = (extra) => validatePositions([row(extra)], parties, topics).join();
  assert.equal(run({ extraSourceUrl: 'https://b.example/plan' }), '');
  assert.equal(run({ extraSourceUrl: null }), '');
  assert.match(run({ extraSourceUrl: 'not a url' }), /extraSourceUrl/);
  assert.match(run({ position: null, sourceUrl: null, sourceType: null, extraSourceUrl: 'https://b.example/' }), /extraSourceUrl/);
});

test('a null row may carry what was found: a valid source and date, a quote only with a source, and no source type', () => {
  const parties = [{ id: 'p' }];
  const topics = [{ id: 't' }];
  const row = (extra) => ({ partyId: 'p', topicId: 't', position: null, redLine: false, summary: 'תקציר', summaryEn: 'Summary', quote: null, ...extra });
  const run = (extra) => validatePositions([row(extra)], parties, topics).join();
  assert.equal(run({ sourceUrl: 'https://a.example/', sourceDate: '2026-07-02', quote: 'ציטוט', quoteTranslationEn: 'A quote' }), '');
  assert.equal(run({ sourceUrl: 'https://a.example/', sourceDate: null }), '');
  assert.match(run({ sourceUrl: 'not a url' }), /sourceUrl/);
  assert.match(run({ sourceUrl: 'https://a.example/', sourceDate: '25.10.2026' }), /sourceDate/);
  assert.match(run({ sourceUrl: 'https://a.example/', sourceType: 'statement' }), /sourceType/);
  assert.match(run({ quote: 'ציטוט', quoteTranslationEn: 'A quote' }), /quote without a sourceUrl/);
});

test('null rows shown with their source: the speaker, outlet and date in both languages', () => {
  const pos = (k) => data.positions.find((p) => `${p.partyId}|${p.topicId}` === k);
  const zehut = pos('zehut|inquiry');
  assert.equal(zehut.position, null);
  assert.equal(quoteAttribution(zehut, 'זהות'), 'משה פייגלין, ערוץ 7, 02.07.2026');
  assert.equal(quoteAttribution(zehut, 'Zehut', EN), 'Moshe Feiglin, Arutz Sheva (Israel National News), 2 Jul 2026');
  assert.equal(quoteAttribution(pos('raam|draft'), 'רע״ם'), 'מנסור עבאס, ynet, 27.07.2026');
  // Undated party pages: no date in the line (25.10 was the check date).
  assert.equal(quoteAttribution(pos('otzma-yehudit|religion'), 'עוצמה יהודית'), 'עוצמה יהודית, אתר המפלגה');
  assert.equal(quoteAttribution(pos('amcha-yisrael|religion'), 'Amcha Yisrael', EN), 'Amcha Yisrael, Party website');
});
