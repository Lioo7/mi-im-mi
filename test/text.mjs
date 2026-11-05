// Text helpers shared by the tests (not a test file: node --test runs *.test.mjs only).

// Quoted spans: "…", “…”, ״…״ and '…'. Gershayim come before the last 1–3 letters of an abbreviation (ש״ס, צה״ל,
// יועמ״שית); a ״ followed by a longer word opens a quote, also right after a prefix letter (ל״סיפוח…״).
const HEB = '\\u05D0-\\u05EA';
const GERSHAYIM = new RegExp(`(?<=[${HEB}])״(?=[${HEB}]{1,3}(?![${HEB}]))`, 'g');
const QUOTED = /[״"“][^״"”]*[״"”]|(^|[\s(])'[^']+'(?=[\s,.;:)]|$)/g;
export const unquoted = (s) => s.replace(GERSHAYIM, '\u0001').replace(QUOTED, ' ');

// The literal text of every string literal in a JS source ('…', "…" and template literals, with each ${…} part
// replaced by "${…}" and the literals inside it read too). Comments are skipped. Returns [{ text, line }].
export function stringLiterals(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const read = (q) => {
    const start = line;
    let s = '';
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { s += src[i + 1]; i += 2; continue; }
      if (c === '\n') line++;
      if (c === q) { i++; break; }
      if (q === '`' && c === '$' && src[i + 1] === '{') {
        s += '${…}';
        i += 2;
        for (let depth = 1; i < src.length && depth;) {
          const d = src[i];
          if (d === "'" || d === '"' || d === '`') { read(d); continue; }
          if (d === '{') depth++;
          else if (d === '}') depth--;
          else if (d === '\n') line++;
          i++;
        }
        continue;
      }
      s += c;
      i++;
    }
    out.push({ text: s, line: start });
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); line += src.slice(i, end).split('\n').length - 1; i = end + 2; continue; }
    if (c === "'" || c === '"' || c === '`') { read(c); continue; }
    if (c === '\n') line++;
    i++;
  }
  return out;
}
