// Every seat-bearing string is gated (#12, N18). A code scan, not a render: each place app.js uses a string that
// shows a seat count must sit behind showSeats() or isResults() (results mode always shows seats; polls mode only
// while meta.showSeats is on). Smoke checks the rendered pages in the hidden mode; this catches a new use early.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S } from '../site/js/strings.js';

const SEATS = /מנדט|מנ׳/;
const GATE = /showSeats\(\)|isResults\(\)/;
// Functions reached only through a control that is itself rendered behind a gate, so their callers gate them.
const GATED_BY_CALLER = {
  pollsVsResults: 'the method page calls it inside isResults()',
  pollInfoSheet: 'opened by the ⓘ button of pollNoteBtn(), which seatSourceLine() renders only where seats show',
  closestHtml: 'the closest sheet: its button and picker render only with isResults()',
  closestRow: 'a row of closestHtml()',
};

// The string keys whose text names seats, found by calling each one with numbers: [parent path, leaf].
function seatKeys(obj, path = []) {
  return Object.entries(obj).flatMap(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return seatKeys(v, [...path, k]);
    let text = v;
    if (typeof v === 'function') { try { text = String(v(7, 7, 7, 7, 7)); } catch { text = ''; } }
    if (Array.isArray(v)) text = v.join(' ');
    return typeof text === 'string' && SEATS.test(text) ? [[path.join('.'), k]] : [];
  });
}

// app.js split into its top-level functions, each with its first line number.
function topLevelBlocks(src) {
  const lines = src.split('\n');
  const blocks = [];
  lines.forEach((line, i) => {
    if (/^(async )?function |^const \w+ = (async )?\(/.test(line) || !blocks.length) blocks.push({ start: i, lines: [] });
    blocks.at(-1).lines.push(line);
    blocks.at(-1).name ??= line.match(/^(?:async )?function (\w+)|^const (\w+) =/)?.slice(1).find(Boolean);
  });
  return blocks;
}

test('every use of a seat-bearing string in app.js is gated by showSeats() or isResults()', () => {
  const keys = seatKeys(S);
  assert.ok(keys.length >= 10, `expected the seat-bearing strings to be found, got ${keys.length}`);
  const src = readFileSync(new URL('../site/js/app.js', import.meta.url), 'utf8');
  const problems = [];
  let uses = 0;
  for (const block of topLevelBlocks(src)) {
    const body = block.lines.join('\n');
    // Aliases such as `const R = S.results;`, so `R.withoutPreview` counts as `S.results.withoutPreview`.
    const alias = new Map([...body.matchAll(/const ([A-Z]\w*) = S\.([\w.]+);/g)].map((m) => [m[2], m[1]]));
    // A function that returns early unless seats show, or that only gated controls reach, is gated as a whole.
    const guarded = /if \(!(showSeats|isResults)\(\)[^)]*\) return/.test(body) || block.name in GATED_BY_CALLER;
    for (const [parent, leaf] of keys) {
      const names = [`S\\.${parent.replace(/\./g, '\\.')}`, alias.get(parent)].filter(Boolean);
      const re = new RegExp(`(?:${names.join('|')})\\.${leaf}\\b`);
      block.lines.forEach((line, i) => {
        if (!re.test(line)) return;
        uses++;
        // Gated: on this line, or by a condition earlier in the same function (a template's condition, an if block).
        if (!guarded && !block.lines.slice(0, i + 1).some((l) => GATE.test(l))) problems.push(`app.js:${block.start + i + 1} uses S.${parent}.${leaf} without showSeats() or isResults(): ${line.trim().slice(0, 120)}`);
      });
    }
  }
  assert.ok(uses > 0, 'no use of a seat-bearing string was found: the scan is broken');
  assert.deepEqual(problems, []);
});
