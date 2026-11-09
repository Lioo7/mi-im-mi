// Type-check (#20): tsc --noEmit over the JSDoc-annotated plain ES modules (no build step), in both configs.
// The compiler and Node's types are pinned and run through npx, so every machine checks with the same versions: the
// first run downloads them (about 25 MB) into npx's cache, later runs use the cache. When npx can't provide them
// (offline on a first run, no npm), the tsc tests are skipped with the reason, never passed silently.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPESCRIPT = 'typescript@5.9.3';
const NODE_TYPES = '@types/node@22.20.5';
// jsconfig.json: strict. jsconfig.browser.json: the browser-driving scripts (implicit any and null checks relaxed).
const CONFIGS = ['jsconfig.json', 'jsconfig.browser.json'];
const SITE_MODULES = ['site/js/compat.js', 'site/js/links.js', 'site/js/stats.js'];

const readConfig = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));

// The pinned tsc and its @types folder, from npx's cache (fetched there on first use), or the reason it isn't available.
function locateTsc() {
  const r = spawnSync('npx', ['--yes', '--prefer-offline', '-p', TYPESCRIPT, '-p', NODE_TYPES, '-c', 'command -v tsc'], {
    cwd: ROOT, encoding: 'utf8', timeout: 180_000,
  });
  const bin = r.status === 0 ? r.stdout.trim().split('\n').pop() : '';
  if (!bin) {
    const why = (r.error?.message ?? r.stderr ?? '').trim().split('\n').pop() || `exit ${r.status}`;
    return { skip: `type-check skipped: npx could not provide ${TYPESCRIPT} + ${NODE_TYPES} (${why}). Run node --test once online.` };
  }
  return { tsc: realpathSync(bin), typeRoots: join(dirname(bin), '..', '@types') };
}

test('the type-check covers every script and the three site modules, each in exactly one config', () => {
  const main = readConfig('jsconfig.json');
  const browser = readConfig('jsconfig.browser.json');
  for (const [k, v] of [['strict', true], ['checkJs', true], ['noEmit', true]]) assert.equal(main.compilerOptions[k], v, `jsconfig.json: ${k}`);
  const inMain = (f) => (main.include.includes(f) || (f.startsWith('scripts/') && main.include.includes('scripts/*.mjs')))
    && !main.exclude.includes(f);
  const scripts = readdirSync(join(ROOT, 'scripts')).filter((f) => f.endsWith('.mjs')).map((f) => `scripts/${f}`);
  for (const f of [...SITE_MODULES, ...scripts]) {
    assert.equal(Number(inMain(f)) + Number(browser.files.includes(f)), 1, `${f} must be in exactly one jsconfig`);
  }
  for (const f of SITE_MODULES) assert.ok(inMain(f), `${f} is checked strictly`);
});

describe('tsc --noEmit', { concurrency: true }, () => {
  const found = locateTsc();
  if (found.skip) console.log(found.skip);
  for (const cfg of CONFIGS) {
    test(cfg, { skip: found.skip ?? false }, async () => {
      const args = [found.tsc, '-p', cfg, '--pretty', 'false', '--typeRoots', found.typeRoots];
      const r = await promisify(execFile)(process.execPath, args, { cwd: ROOT, timeout: 300_000, maxBuffer: 1 << 24 })
        .then(() => null, (e) => e);
      assert.equal(r, null, `tsc -p ${cfg} found type errors:\n${r?.stdout ?? ''}${r?.stderr ?? r?.message ?? ''}`);
    });
  }
});
