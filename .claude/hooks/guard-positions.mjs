// PreToolUse hook (#38): blocks Edit/Write on site/data/positions.json. Positions change only through the CSV import,
// which runs through Bash and so isn't blocked. A shell write (sed -i, >) isn't covered: the CLAUDE.md rule still applies.
import { readFileSync } from 'node:fs';
import path from 'node:path';

let input;
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
const file = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (typeof file !== 'string' || !file) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const norm = (p) => (process.platform === 'darwin' || process.platform === 'win32' ? p.toLowerCase() : p); // case-insensitive file systems
if (norm(path.resolve(input.cwd || root, file)) === norm(path.resolve(root, 'site/data/positions.json'))) {
  process.stderr.write('Blocked: site/data/positions.json is never edited by hand. Change positions only via '
    + '`node scripts/import-csv.mjs review/positions_review.csv` (see CLAUDE.md, .claude/rules/data.md).\n');
  process.exit(2);
}
