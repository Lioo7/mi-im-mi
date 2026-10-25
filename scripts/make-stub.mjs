// Writes clearly fake positions so the UI can be built before research lands.
// Sets meta.stub = true, which shows a red banner and makes validate.mjs refuse to deploy.
import { join } from 'node:path';
import { DATA, loadData, writeJson } from './lib.mjs';

const { parties, topics, meta } = loadData();

// Deterministic pseudo-random, so screenshots are stable between runs.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const positions = [];
for (const t of topics) {
  for (const p of parties) {
    const r = rand();
    const position = r < 0.12 ? null : Math.round(rand() * 4) - 2;
    positions.push({
      partyId: p.id,
      topicId: t.id,
      position,
      redLine: position !== null && Math.abs(position) === 2 && rand() < 0.3,
      summary: 'נתון דמה לפיתוח בלבד, אינו עמדה אמיתית של המפלגה.',
      quote: null,
      sourceUrl: position === null ? null : 'https://example.invalid/stub',
      sourceType: position === null ? null : 'statement',
      sourceDate: position === null ? null : '2026-01-01',
      viaUrl: null,
      confidence: 'low',
    });
  }
}

writeJson(join(DATA, 'positions.json'), positions);
writeJson(join(DATA, 'meta.json'), { ...meta, stub: true });
console.log(`✓ wrote ${positions.length} STUB positions; meta.stub = true`);
