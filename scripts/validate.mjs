// Validates site/data before a deploy. Exit code 1 on any error.
// Usage: node scripts/validate.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MERGED, exists, readJson, loadData, validateParties, validateTopics, validatePositions, validateResults, validateScenarios, validateRecommendations, validateEnglish, validateEvidence, validateDownload, DOWNLOAD_DIR, DOWNLOAD_FILES, DATA, CHANGELOG_FILE, validateChangelog, dataFingerprint, README_FILE, readmeFigures, validateReadme } from './lib.mjs';

const { parties, topics, meta, positions, results, scenarios, recommendations } = loadData();

const errors = [
  ...validateParties(parties),
  ...validateTopics(topics),
  ...validatePositions(positions, parties, topics),
  ...validateResults(meta, results, parties),
  ...validateScenarios(meta, scenarios, parties, results),
  ...validateRecommendations(meta, recommendations, parties, results),
  ...validateEnglish({ parties, meta, results, scenarios, recommendations }),
  ...(() => {
    // The public evidence files, and research/merged.json where it exists, must match the live positions (#40).
    const ev = join(ROOT, 'docs', 'research', 'evidence');
    if (!exists(`${ev}.json`) || !exists(`${ev}.csv`)) return ['docs/research/evidence.{json,csv}: missing (run node scripts/export-evidence.mjs)'];
    return validateEvidence({
      positions, parties, topics,
      evidenceJson: readJson(`${ev}.json`), evidenceCsv: readFileSync(`${ev}.csv`, 'utf8'),
      merged: exists(MERGED) ? readJson(MERGED) : null,
    });
  })(),
  // The download files must be exactly what the live data builds (#18).
  ...validateDownload({ meta, parties, topics, positions, results }, Object.fromEntries(Object.entries(DOWNLOAD_FILES)
    .map(([k, f]) => [k, exists(join(DOWNLOAD_DIR, f)) ? readFileSync(join(DOWNLOAD_DIR, f), 'utf8') : null]))),
  // The data changelog: well-formed, in step with positions.json, and reviewed since the last data change (#19).
  ...validateChangelog(exists(join(DATA, CHANGELOG_FILE)) ? readJson(join(DATA, CHANGELOG_FILE)) : null,
    { parties, topics, positions, fingerprint: dataFingerprint() }),
  // The README's data figures, in both languages, must be what site/data has now.
  ...validateReadme(readFileSync(README_FILE, 'utf8'), readmeFigures({ parties, topics, positions, scenarios })),
];
if (typeof meta.showSeats !== 'boolean') errors.push('meta: showSeats must be true/false');
// make-stub.mjs is gone (#47). The key stays false in meta.json until #51 removes it, and true is never deployed.
if (meta.stub) errors.push('meta: stub must not be true');
const expected = parties.length * topics.length;
if (positions.length !== expected) errors.push(`positions: expected ${expected} rows, got ${positions.length}`);

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
const nulls = positions.filter((p) => p.position === null).length;
const red = positions.filter((p) => p.redLine).length;
console.log(`✓ ${parties.length} parties, ${topics.length} topics, ${positions.length} positions (${nulls} null, ${red} red lines); mode=${meta.mode}; showSeats=${meta.showSeats}`);
