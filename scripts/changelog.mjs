// The data changelog (site/data/changelog.json, #19). With no flag: says whether the data changed since the list was
// last reviewed. With --ack: records that the current data has been reviewed (after adding any entry a visitor would
// notice; a change with no visible effect, such as a typo fix, needs no entry).
import { join } from 'node:path';
import { DATA, CHANGELOG_FILE, readJson, writeJson, dataFingerprint } from './lib.mjs';

const file = join(DATA, CHANGELOG_FILE);
const log = readJson(file);
const now = dataFingerprint();
if (process.argv.includes('--ack')) {
  writeJson(file, { reviewed: now, entries: log.entries });
  console.log(`✓ changelog reviewed for the current data (${log.entries.length} entries, newest ${log.entries[0]?.date})`);
} else if (log.reviewed === now) {
  console.log('✓ the changelog is up to date with the data');
} else {
  console.log('✗ the data changed since the changelog was last reviewed: add an entry if a visitor would notice it, then run with --ack');
  process.exit(1);
}
