// The data download (#18): built from the live site/data only, and the files on disk are exactly what it builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadData, buildDownload, downloadRows, validateDownload, parseCsv, DOWNLOAD_DIR, DOWNLOAD_FILES, RED_LINE_COLUMNS } from '../scripts/lib.mjs';
import { S } from '../site/js/strings.js';
import { S as EN } from '../site/js/strings.en.js';

const data = loadData();
const onDisk = Object.fromEntries(Object.entries(DOWNLOAD_FILES).map(([k, f]) => [k, readFileSync(join(DOWNLOAD_DIR, f), 'utf8')]));

test('the files in site/download/ are what the live data builds', () => {
  assert.deepEqual(validateDownload(data, onDisk), []);
  assert.match(validateDownload(data, { ...onDisk, csv: onDisk.csv + 'x' })[0], /mi-im-mi-positions\.csv: out of date/);
  assert.match(validateDownload(data, { ...onDisk, json: null })[0], /mi-im-mi-positions\.json: missing/);
});

test('a data change makes the committed files stale', () => {
  const changed = structuredClone(data);
  changed.positions[0].summary += ' x';
  assert.equal(validateDownload(changed, onDisk).length, 2);
});

test('one row per position, live fields only, numeric positions on the topic axis', () => {
  const rows = downloadRows(data);
  assert.equal(rows.length, data.positions.length);
  assert.equal(new Set(rows.map((r) => `${r.party_id}|${r.topic_id}`)).size, rows.length);
  for (const r of rows) {
    assert.ok(r.position === null || [-2, -1, 0, 1, 2].includes(r.position), `${r.party_id}|${r.topic_id}`);
    // Research notes stay out of the download. The red-line evidence is public (#49): its six columns are filled exactly
    // on the red-line rows.
    assert.ok(!('evidence_note' in r) && !('evidenceNote' in r) && !('red_line_evidence' in r));
    for (const c of RED_LINE_COLUMNS) assert.ok(c in r, `${r.party_id}|${r.topic_id} has ${c}`);
    assert.equal(r.red_line_quote != null && r.red_line_url != null && r.red_line_date != null, r.red_line, `${r.party_id}|${r.topic_id} red-line evidence`);
    const t = data.topics.find((x) => x.id === r.topic_id);
    assert.equal(r.position_label, r.position === null ? S.levels.NONE.label : t.axis[String(r.position)]);
    assert.equal(r.position_label_en, r.position === null ? EN.levels.NONE.label : t.en.axis[String(r.position)]);
  }
  assert.equal(parseCsv(onDisk.csv).length, rows.length);
});

test('the JSON carries the position note and the CC BY 4.0 notice in both languages', () => {
  const j = JSON.parse(buildDownload(data).json);
  assert.deepEqual(j.positionNote, { he: S.method.download.positionNote, en: EN.method.download.positionNote });
  assert.deepEqual(j.license, { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', he: S.method.download.license, en: EN.method.download.license });
  assert.equal(j.dataUpdated, data.meta.dataUpdated);
});
