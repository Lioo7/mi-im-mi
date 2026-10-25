// Saves every source URL of a non-null position to the Wayback Machine and records the snapshot URL.
// Resumable: results are cached in research/archive-map.json (gitignored). Failures are logged and never block anything.
// Usage: node scripts/archive-sources.mjs [--concurrency 3] [--timeout 120]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, MERGED, readJson } from './lib.mjs';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? Number(process.argv[i + 1]) : dflt; };
const CONCURRENCY = arg('concurrency', 1);
const TIMEOUT_MS = arg('timeout', 120) * 1000;
const GAP_MS = arg('gap', 12) * 1000;
const MAP = join(ROOT, 'research', 'archive-map.json');
const SNAPSHOT = /^https:\/\/web\.archive\.org\/web\/\d{14}\//;

const map = existsSync(MAP) ? JSON.parse(readFileSync(MAP, 'utf8')) : {};
const urls = [...new Set(readJson(MERGED).filter((p) => p.position !== null && p.sourceUrl).map((p) => p.sourceUrl))];
const todo = urls.filter((u) => !map[u]?.snapshot);
console.log(`${urls.length} source URLs, ${urls.length - todo.length} already archived, ${todo.length} to do`);

const save = () => writeFileSync(MAP, JSON.stringify(map, null, 2));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Transient failures (rate limit, resets, timeouts) back off and retry; permanent ones (e.g. 4xx other than 429) give up.
async function archive(url) {
  let last = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    let transient = true;
    try {
      const res = await fetch(`https://web.archive.org/save/${url}`, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'mi-im-mi source archiver (lioz.akirav@gmail.com)' } });
      const final = res.url;
      if (res.ok && SNAPSHOT.test(final)) return { snapshot: final, status: res.status };
      last = `HTTP ${res.status}, final URL ${final}`;
      transient = res.status === 429 || res.status >= 500;
    } catch (e) {
      last = String(e.cause?.code ?? e.message ?? e);
    }
    if (!transient || attempt === 4) return { error: last };
    await sleep(90000);
  }
  return { error: last };
}

let next = 0;
let done = 0;
async function worker() {
  while (next < todo.length) {
    const url = todo[next++];
    const r = await archive(url);
    map[url] = { ...r, at: new Date().toISOString() };
    save();
    if (r.snapshot) await sleep(GAP_MS); // stay well under the rate limit
    done++;
    console.log(`${r.snapshot ? '✓' : '✗'} [${done}/${todo.length}] ${url}${r.error ? `  (${r.error})` : ''}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const ok = urls.filter((u) => map[u]?.snapshot).length;
console.log(`\n${ok}/${urls.length} archived; ${urls.length - ok} failed (see research/archive-map.json)`);
