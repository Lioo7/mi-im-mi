import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTopics, AXIS_NUMBER } from '../scripts/lib.mjs';

const topics = JSON.parse(readFileSync(new URL('../site/data/topics.json', import.meta.url), 'utf8'));

test('the topics validate, with no axis number in any axisNote', () => {
  assert.deepEqual(validateTopics(topics), []);
});

test('an axis number in an axisNote fails validation, in either language', () => {
  for (const n of ['ו-+2 רק למפלגה', 'ממוקמת ב-−2.', 'לבדה = −1,', 'ממוקם ב-0', 'placed at -2.', 'is 1 step']) assert.match(n, AXIS_NUMBER, n);
  for (const n of ['אירועי 7 באוקטובר', 'the events of October 7', 'קווי 1967', '1.5 points', '120 seats']) assert.doesNotMatch(n, AXIS_NUMBER, n);
  const he = structuredClone(topics);
  he[0].axisNote += ' ממוקמת ב-−2.';
  assert.match(validateTopics(he).join('\n'), /axisNote \(he\) shows the axis number "−2"/);
  const en = structuredClone(topics);
  en[0].en.axisNote += ' It goes to +2.';
  assert.match(validateTopics(en).join('\n'), /axisNote \(en\) shows the axis number "\+2"/);
});
