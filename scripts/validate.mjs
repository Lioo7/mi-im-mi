// Validates site/data before a deploy. Exit code 1 on any error.
// Usage: node scripts/validate.mjs [--allow-stub]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MERGED, exists, readJson, loadData, validateParties, validateTopics, validatePositions, validateResults, validateScenarios, validateRecommendations, validateEnglish, validateEvidence, validateDownload, DOWNLOAD_DIR, DOWNLOAD_FILES } from './lib.mjs';

const allowStub = process.argv.includes('--allow-stub');
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
];
if (typeof meta.showSeats !== 'boolean') errors.push('meta: showSeats must be true/false');
if (meta.stub && !allowStub) errors.push('meta: stub data is active (run the real import before deploying)');
const expected = parties.length * topics.length;
if (positions.length !== expected) errors.push(`positions: expected ${expected} rows, got ${positions.length}`);

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
const nulls = positions.filter((p) => p.position === null).length;
const red = positions.filter((p) => p.redLine).length;
console.log(`✓ ${parties.length} parties, ${topics.length} topics, ${positions.length} positions (${nulls} null, ${red} red lines)${meta.stub ? ' [STUB]' : ''}; mode=${meta.mode}; showSeats=${meta.showSeats}`);
