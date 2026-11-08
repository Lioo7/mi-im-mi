// Writes the data download to site/download/ (#18): every position as CSV and JSON, from the live site/data.
// validate.mjs fails when these files differ from what the data builds, so run this after any data change.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadData, buildDownload, DOWNLOAD_DIR, DOWNLOAD_FILES } from './lib.mjs';

const out = buildDownload(loadData());
mkdirSync(DOWNLOAD_DIR, { recursive: true });
for (const [k, f] of Object.entries(DOWNLOAD_FILES)) writeFileSync(join(DOWNLOAD_DIR, f), out[k]);
console.log(`✓ wrote site/download/{${Object.values(DOWNLOAD_FILES).join(',')}}`);
