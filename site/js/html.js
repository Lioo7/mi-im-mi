// Pure text and HTML helpers (#53): escaping, bidi isolation, no-break spans, {party:…}/{topic:…} tokens. Plain text in,
// HTML out, no DOM and no app state, so they are unit-tested (test/html.test.mjs). app.js binds `lang` and the name
// lookups.

/**
 * HTML-escaped text: & < > " ' (null and undefined become '').
 * @param {unknown} v
 * @returns {string}
 */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Escaped text with runs of the other script isolated in <bdi>: Latin (names, standards) in Hebrew, Hebrew (ballot
// letters, names) in English.
// Latin runs in Hebrew text are isolated whole, across spaces and hyphens ("Shapley-Shubik" must not flip to "Shubik-Shapley").
const OTHER_SCRIPT = { he: /[A-Za-z][A-Za-z0-9.]*(?:[ -][A-Za-z0-9.]+)*/g, en: /[\u0590-\u05FF](?:[\u0590-\u05FF׳״"' -]*[\u0590-\u05FF׳״])?/g };

/**
 * Escaped text with each run of the other script in <bdi> (`<bdi lang="he">` in English). The runs are found in the raw
 * text and each piece is escaped on its own: matching after escaping would take the "quot" of &quot; for a Latin run and
 * break the entity (683eb7a).
 * @param {unknown} v
 * @param {'he' | 'en'} lang the reader's language
 * @returns {string}
 */
export function bidi(v, lang) {
  const s = String(v ?? '');
  let out = '';
  let i = 0;
  for (const m of s.matchAll(OTHER_SCRIPT[lang])) {
    out += esc(s.slice(i, m.index)) + (lang === 'he' ? `<bdi>${esc(m[0])}</bdi>` : `<bdi lang="he">${esc(m[0])}</bdi>`);
    i = /** @type {number} */ (m.index) + m[0].length;
  }
  return out + esc(s.slice(i));
}

// A party name, an outlet name or a number pair never breaks inside (#30, #31, #34): plain text in, HTML out, with each
// of the given names and every "53 מול 67" / "53 מתוך 61" / "59 vs 61" / "53 of 61" in a nowrap span. One pass, so a
// name inside another name is not wrapped twice; longer names win.
/** @param {string} s */
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUM_PAIR = '≈?\\d[\\d,.]*(?: (?:מול|מתוך|vs|of) ≈?\\d[\\d,.]*)';
// A seat count with its noun ("40 מנדטים", "1 seat") stays whole too (#H1, the seats card's rows).
const SEATS_N = '≈?\\d+ (?:מנדטים|seats?)';

/**
 * Escaped text with the given names, number pairs and seat counts each in `<span class="nw">`.
 * @param {string} text
 * @param {(string | null | undefined)[]} [names]
 * @returns {string}
 */
export function keepWhole(text, names = []) {
  const alts = [...new Set(names.filter(Boolean).map(esc))].sort((a, b) => b.length - a.length).map(reEscape);
  return esc(text).replace(new RegExp([...alts, NUM_PAIR, SEATS_N].join('|'), 'g'), (m) => `<span class="nw">${m}</span>`);
}

/**
 * Plain text with each {party:<id>} and {topic:<id>} token replaced by `resolve(kind, id)` (the changelog's entries).
 * @param {string} text
 * @param {(kind: 'party' | 'topic', id: string) => string} resolve
 * @returns {string}
 */
export const fillTokens = (text, resolve) => text.replace(/\{(party|topic):([^}]*)\}/g, (_, k, id) => resolve(k, id));

// Segments joined by " · ", each one kept whole, so a line breaks only between them (#35: larger text, polls' ≈).
/**
 * Escaped parts, each in a nowrap span, joined with " · ".
 * @param {unknown[]} parts
 * @returns {string}
 */
export const segments = (parts) => parts.map((x) => `<span class="nw">${esc(x)}</span>`).join(' · ');

/**
 * An external link in a new tab, with an aria-label when one is given.
 * @param {string} url
 * @param {unknown} text
 * @param {string} [label]
 * @returns {string}
 */
export const extLink = (url, text, label = '') => `<a href="${esc(url)}" rel="noopener" target="_blank"${label ? ` aria-label="${esc(label)}"` : ''}>${esc(text)}</a>`;

/**
 * A number with thousands separators, the same in both languages ("1,234,567").
 * @param {number} n
 * @returns {string}
 */
export const fmtNum = (n) => n.toLocaleString('en-US');
