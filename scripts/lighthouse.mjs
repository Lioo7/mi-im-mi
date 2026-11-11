// Performance check with Lighthouse (pinned, through npx) on the shared results link, the page most visitors land on:
// a mobile run (Lighthouse's default: a mid-range phone on a slow 4G, simulated) and a desktop run. Fails when layout
// shift (CLS) reaches 0.1 (the same bound as smoke's load section), and, against a URL (a draft or production), when the
// performance score falls below 0.9. Locally the score is only reported: the local server sends files uncompressed
// (Netlify compresses them), which alone costs the mobile run about 10 points.
// Usage: node scripts/lighthouse.mjs [baseUrl]   (default: serves ./site in meta.json's mode, with netlify.toml's headers)
// When npx can't provide Lighthouse (offline on a first run, no npm), it skips with the reason and exits 0.
// Output: a line per run (score, CLS, LCP, TBT), and the full reports in smoke/lighthouse/<run>.json.
// GoatCounter is blocked, so a run against production sends no page view.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';
import { serve, CHROME, npxModules } from './browser.mjs';

const LIGHTHOUSE = 'lighthouse@13.5.0';
// The link smoke's load section measures: a results page with five members.
const LINK = '#results?m=likud,yashar,together,democrats,yisrael-beiteinu';
const MAX_CLS = 0.1;
const MIN_SCORE = 0.9;
const RUNS = [['mobile', []], ['desktop', ['--preset=desktop']]];

const args = process.argv.slice(2);
if (args.some((a) => a.startsWith('--')) || args.length > 1) { console.error('✗ usage: node scripts/lighthouse.mjs [baseUrl]'); process.exit(2); }
const base = args[0];

const found = npxModules([LIGHTHOUSE]);
if (found.skip) { console.log(`⚠ lighthouse skipped: ${found.skip}. Run it once online.`); process.exit(0); }
const CLI = join(found.dir, 'lighthouse', 'cli', 'index.js');
if (!existsSync(CLI)) { console.log(`⚠ lighthouse skipped: ${CLI} not found in npx's cache`); process.exit(0); }

const OUT = join(ROOT, 'smoke', 'lighthouse');
mkdirSync(OUT, { recursive: true });
const server = base ? null : await serve();
process.on('exit', () => { try { server?.stop(); } catch { /* ignore */ } });
const url = `${(base ?? server.url).replace(/\/?$/, '/')}${LINK}`;

const t0 = Date.now();
const failures = [];
for (const [name, extra] of RUNS) {
  const file = join(OUT, `${name}.json`);
  const t = Date.now();
  const code = await new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, url, '--only-categories=performance', '--output=json', `--output-path=${file}`, '--quiet',
      '--chrome-flags=--headless=new', '--blocked-url-patterns=*goatcounter.com*', ...extra],
    { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, CHROME_PATH: CHROME } });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => { if (c) console.error(err.trim().split('\n').slice(-5).join('\n')); resolve(c); });
  });
  if (code !== 0 || !existsSync(file)) { failures.push(`${name}: Lighthouse exited with ${code}`); continue; }
  const r = JSON.parse(readFileSync(file, 'utf8'));
  if (r.runtimeError) { failures.push(`${name}: ${r.runtimeError.code} ${r.runtimeError.message}`); continue; }
  const score = r.categories.performance.score;
  const num = (id) => r.audits[id]?.numericValue;
  const cls = num('cumulative-layout-shift');
  const line = `${name}: performance ${Math.round(score * 100)}, CLS ${cls.toFixed(3)}, LCP ${(num('largest-contentful-paint') / 1000).toFixed(1)}s, TBT ${Math.round(num('total-blocking-time'))}ms (${Math.round((Date.now() - t) / 1000)}s)`;
  const bad = [cls >= MAX_CLS ? `CLS ${cls.toFixed(3)} (want < ${MAX_CLS})` : null, base && score < MIN_SCORE ? `performance ${Math.round(score * 100)} (want ≥ ${MIN_SCORE * 100})` : null].filter(Boolean);
  console.log(`  ${bad.length ? '✗' : '✓'} ${line}`);
  if (bad.length) failures.push(`${name}: ${bad.join(', ')}`);
}
for (const f of failures) console.error(`✗ ${f}`);
console.log(`${failures.length ? '✗' : '✓'} lighthouse (${LIGHTHOUSE}) on ${base ? url : `the local server ${LINK} (CLS only: the score counts against a URL)`}: ${Math.round((Date.now() - t0) / 1000)}s (reports: smoke/lighthouse/)`);
process.exit(failures.length ? 1 : 0);
