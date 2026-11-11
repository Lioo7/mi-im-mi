// import-csv diffs against the live data (#8): a CSV made from site/data/positions.json imports with no changes,
// and one edited cell shows as exactly one change. Dry runs only: nothing is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATA, ROOT } from '../scripts/lib.mjs';

const node = (...args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

test('a CSV of the live data imports with no changes, and one edited summary is one change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'import-csv-'));
  try {
    const csv = join(dir, 'live.csv');
    node('scripts/export-csv.mjs', join(DATA, 'positions.json'), csv);
    assert.match(node('scripts/import-csv.mjs', csv, '--dry-run'), /No changes vs the live data\./);

    const live = JSON.parse(readFileSync(join(DATA, 'positions.json'), 'utf8'));
    const target = live.find((p) => p.summary);
    const text = readFileSync(csv, 'utf8');
    assert.ok(text.includes(target.summary), 'the exported CSV carries the summary verbatim');
    writeFileSync(csv, text.replace(target.summary, `${target.summary} (בדיקה)`));
    const out = node('scripts/import-csv.mjs', csv, '--dry-run');
    assert.match(out, /^1 change\(s\) vs the live data:/m);
    assert.match(out, new RegExp(`~ ${target.partyId}\\|${target.topicId} summary:`));

    // The red-line evidence (#49) travels through the CSV too: an edited red-line quote is one change on that row.
    // (one with no " in it, which the CSV would escape, and not shared with another row)
    const red = live.find((p) => p.redLine && p.redLineQuote && !p.redLineQuote.includes('"') && live.filter((x) => x.redLineQuote === p.redLineQuote).length === 1);
    assert.ok(red, 'a red-line row with its own quote');
    {
      writeFileSync(csv, text.replace(red.redLineQuote, `${red.redLineQuote} (בדיקה)`));
      const out2 = node('scripts/import-csv.mjs', csv, '--dry-run');
      assert.match(out2, /^1 change\(s\) vs the live data:/m);
      assert.match(out2, new RegExp(`~ ${red.partyId}\\|${red.topicId} redLineQuote:`));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
