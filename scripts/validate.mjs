// Validates site/data before a deploy. Exit code 1 on any error.
// Usage: node scripts/validate.mjs [--allow-stub]
import { loadData, validateParties, validateTopics, validatePositions } from './lib.mjs';

const allowStub = process.argv.includes('--allow-stub');
const { parties, topics, meta, positions } = loadData();

const errors = [
  ...validateParties(parties),
  ...validateTopics(topics),
  ...validatePositions(positions, parties, topics),
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
console.log(`✓ ${parties.length} parties, ${topics.length} topics, ${positions.length} positions (${nulls} null, ${red} red lines)${meta.stub ? ' [STUB]' : ''}; showSeats=${meta.showSeats}`);
