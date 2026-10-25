// Renders scripts/og.html to site/og.png (1200×630) with headless Chrome.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './lib.mjs';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'og-chrome-'));
const out = join(ROOT, 'site', 'og.png');
const r = spawnSync(CHROME, [
  '--headless=new', `--user-data-dir=${profile}`, '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,630', `--screenshot=${out}`, pathToFileURL(join(ROOT, 'scripts', 'og.html')).href,
], { stdio: 'ignore', timeout: 60000 });
rmSync(profile, { recursive: true, force: true });
if (r.status !== 0) { console.error('✗ Chrome failed to render og.png'); process.exit(1); }
console.log(`✓ wrote ${out}`);
