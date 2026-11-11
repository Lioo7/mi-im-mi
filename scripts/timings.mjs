// Step timings (smoke/timings.log, gitignored): /deploy and milestone work log each step's start and end, and the final
// report includes the table this prints. A step logs itself with the shell (the step's name last, spaces allowed):
//   mkdir -p smoke && echo "$(date +%s) start <step>" >> smoke/timings.log
//   … the step …
//   echo "$(date +%s) end <step>" >> smoke/timings.log
// A milestone starts a fresh log (node scripts/timings.mjs --reset); /deploy only appends to it.
// Usage: node scripts/timings.mjs [--reset]   (prints a Markdown table: step, start, end, duration, and the total)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const FILE = join(ROOT, 'smoke', 'timings.log');
if (process.argv.includes('--reset')) {
  mkdirSync(join(ROOT, 'smoke'), { recursive: true });
  writeFileSync(FILE, '');
  console.log('smoke/timings.log reset');
  process.exit(0);
}
if (!existsSync(FILE)) { console.log('no smoke/timings.log yet'); process.exit(0); }

/** @type {{ step: string, start: number, end: number | null }[]} */
const steps = [];
const bad = [];
for (const [i, line] of readFileSync(FILE, 'utf8').split('\n').entries()) {
  if (!line.trim()) continue;
  const m = line.match(/^(\d+) (start|end) (.+)$/);
  if (!m) { bad.push(`line ${i + 1}: ${line}`); continue; }
  const [, t, kind, step] = m;
  if (kind === 'start') steps.push({ step: step.trim(), start: Number(t), end: null });
  else {
    const open = steps.findLast((s) => s.step === step.trim() && s.end === null);
    if (open) open.end = Number(t); else bad.push(`line ${i + 1}: an end without its start (${step})`);
  }
}
const clock = (/** @type {number} */ t) => new Date(t * 1000).toTimeString().slice(0, 8);
const dur = (/** @type {number} */ s) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`);
const rows = steps.map((s) => `| ${s.step} | ${clock(s.start)} | ${s.end === null ? '(running)' : clock(s.end)} | ${s.end === null ? '' : dur(s.end - s.start)} |`);
const done = steps.filter((s) => s.end !== null);
const total = done.reduce((a, s) => a + /** @type {number} */ (s.end) - s.start, 0);
const wall = done.length ? Math.max(...done.map((s) => /** @type {number} */ (s.end))) - Math.min(...steps.map((s) => s.start)) : 0;
console.log(['| Step | Start | End | Duration |', '|---|---|---|---|', ...rows, `| **Total** (steps / first start to last end) | | | ${dur(total)} / ${dur(wall)} |`].join('\n'));
for (const b of bad) console.error(`⚠ ${b}`);
