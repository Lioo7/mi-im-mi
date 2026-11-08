// The factions' recommendations to the President (#4): the data matches the seats and the office's totals, rows come in
// party order, and the validator refuses anything unconfirmed (a TODO placeholder) or not from president.gov.il.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData, validateRecommendations } from '../scripts/lib.mjs';
import { contextFor, recommendationRows, recommendationOf, recommendationTotals } from '../site/js/compat.js';
import { S } from '../site/js/strings.js';
import { S as EN } from '../site/js/strings.en.js';

const { parties, topics, meta, results, recommendations: recs } = loadData();
const ctx = contextFor({ meta: { ...meta, mode: 'results' }, parties, topics, positions: [], results });
const seated = ctx.parties.filter((p) => ctx.passed(p.id)).map((p) => p.id);

test('every list in the Knesset has exactly one record, and no other list has one', () => {
  assert.deepEqual(recs.factions.map((f) => f.partyId).sort(), [...seated].sort());
});

test('rows come in party order (seats, then votes), lists under the threshold left out', () => {
  assert.deepEqual(recommendationRows(ctx, recs).map((f) => f.partyId), seated);
  assert.equal(recommendationOf(recs, 'kalkalit'), null);
});

test("the seats behind each candidate match the President's office's totals (67 / 46 / 7)", () => {
  assert.deepEqual(recommendationTotals(ctx, recs), recs.mandate.counts);
  assert.equal(Object.values(recs.mandate.counts).reduce((a, b) => a + b, 0), 120);
});

test('ט met the President as two factions, each with its own record', () => {
  assert.ok(recommendationOf(recs, 'religious-zionism'));
  assert.ok(recommendationOf(recs, 'zehut'));
});

// A copy with every placeholder filled in, to test the validator apart from the live data's state.
const HE_URL = 'https://www.president.gov.il/%D7%A1%D7%99%D7%A2%D7%94/';
const EN_URL = 'https://www.president.gov.il/en/faction/';
const filled = () => {
  const d = structuredClone(recs);
  d.mandate.quote = 'סיעות שמנו 67 חברי כנסת המליצו';
  d.mandate.sourceUrl = HE_URL;
  d.mandate.en = { quote: 'factions totaling 67 members recommended', sourceUrl: EN_URL };
  for (const f of d.factions) Object.assign(f, { sourceUrl: HE_URL, en: { sourceUrl: EN_URL } });
  return d;
};
const check = (d, m = meta) => validateRecommendations({ ...m, mode: m.mode ?? 'results' }, d, parties, results);

test('a filled-in file passes, and polls mode does not need one', () => {
  assert.deepEqual(check(filled()), []);
  assert.deepEqual(validateRecommendations({ ...meta, mode: 'polls' }, null, parties, results), []);
});

test('the validator refuses a TODO placeholder anywhere, naming where', () => {
  const d = filled();
  d.factions[3].en.sourceUrl = 'TODO';
  const errs = check(d);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /unconfirmed placeholder.*factions\.joint-list\.en\.sourceUrl/);
});

test('the validator refuses sources other than the Hebrew and English president.gov.il pages', () => {
  const news = filled();
  news.factions[0].sourceUrl = 'https://t.me/gpoupdate/14927';
  assert.match(check(news).join('\n'), /likud: sourceUrl must be a Hebrew president\.gov\.il page/);
  const swapped = filled();
  swapped.mandate.sourceUrl = EN_URL;
  swapped.mandate.en.sourceUrl = HE_URL;
  assert.equal(check(swapped).length, 2);
});

test('the validator refuses totals that differ from the office\'s, a missing list and a date outside the consultations', () => {
  const counts = filled();
  counts.mandate.counts.likud = 45;
  assert.match(check(counts).join('\n'), /likud has 46 seats in the data, 45 in the President's totals/);
  const missing = filled();
  missing.factions = missing.factions.filter((f) => f.partyId !== 'zehut');
  assert.match(check(missing).join('\n'), /zehut must appear exactly once/);
  const late = filled();
  late.factions[0].date = '2026-11-06';
  assert.match(check(late).join('\n'), /likud: date must be within the consultations/);
});

test('date range strings in both languages', () => {
  assert.equal(S.recs.open(S.recs.range('2026-11-04', '2026-11-05')), 'המלצות הסיעות לנשיא (4–5.11.2026)');
  assert.equal(EN.recs.open(EN.recs.range('2026-11-04', '2026-11-05')), "The factions' recommendations to the President (4–5 Nov 2026)");
  assert.equal(S.recs.range('2026-10-30', '2026-11-02'), '30.10.2026–2.11.2026');
  assert.equal(S.recs.partyLine('5.11.2026', null), 'בסבב ההתייעצויות אצל הנשיא (5.11.2026): לא המליצה על אף מועמד.');
});
