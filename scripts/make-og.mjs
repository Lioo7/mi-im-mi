// Renders scripts/og.html to site/og.png (1200×630) with headless Chrome; --lang=en renders scripts/og.en.html to
// site/og-en.png, the English link preview (#21).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib.mjs';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'og-chrome-'));
const en = process.argv.includes('--lang=en');
const out = join(ROOT, 'site', en ? 'og-en.png' : 'og.png');
const r = spawnSync(CHROME, [
  '--headless=new', `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,630', `--screenshot=${out}`, pathToFileURL(join(ROOT, 'scripts', en ? 'og.en.html' : 'og.html')).href,
], { stdio: 'ignore', timeout: 60000 });
rmSync(profile, { recursive: true, force: true });
if (r.status !== 0) { console.error(`✗ Chrome failed to render ${out}`); process.exit(1); }
console.log(`✓ wrote ${out}`);
