// The pure text and HTML helpers (#53): site/js/html.js.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, bidi, keepWhole, fillTokens, segments, extLink, fmtNum } from '../site/js/html.js';

describe('esc', () => {
  test('escapes the five HTML characters', () => {
    assert.equal(esc(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  });
  test('null and undefined become empty, numbers become text', () => {
    assert.equal(esc(null), '');
    assert.equal(esc(undefined), '');
    assert.equal(esc(0), '0');
    assert.equal(esc(61), '61');
  });
  test('an escaped entity is escaped again (text in, HTML out)', () => {
    assert.equal(esc('&quot;'), '&amp;quot;');
  });
});

describe('bidi in Hebrew', () => {
  test('quotes around Hebrew stay whole entities (683eb7a: "quot" was taken for a Latin run)', () => {
    const out = bidi('"טכני"', 'he');
    assert.equal(out, '&quot;טכני&quot;');
    assert.doesNotMatch(out, /<bdi>quot<\/bdi>/);
  });
  test('quotes, < and & next to a Latin run stay outside it, each escaped', () => {
    assert.equal(bidi('"CSV" & <JSON>', 'he'), '&quot;<bdi>CSV</bdi>&quot; &amp; &lt;<bdi>JSON</bdi>&gt;');
  });
  test('"Shapley-Shubik" is one run, so it cannot flip to "Shubik-Shapley"', () => {
    assert.equal(bidi('מדד Shapley-Shubik', 'he'), 'מדד <bdi>Shapley-Shubik</bdi>');
  });
  test('each Latin run gets its own <bdi>, and a run across spaces stays whole', () => {
    assert.equal(bidi('Banzhaf ו-Shapley-Shubik', 'he'), '<bdi>Banzhaf</bdi> ו-<bdi>Shapley-Shubik</bdi>');
    assert.equal(bidi('לפי Times of Israel', 'he'), 'לפי <bdi>Times of Israel</bdi>');
  });
  test('text with no Latin is only escaped, and null is empty', () => {
    assert.equal(bidi('ש״ס', 'he'), 'ש״ס');
    assert.equal(bidi(null, 'he'), '');
  });
});

describe('bidi in English', () => {
  test('a Hebrew run, with gershayim and spaces, is isolated with lang="he"', () => {
    assert.equal(bidi('Ballot letters: שס, ש״ס', 'en'), 'Ballot letters: <bdi lang="he">שס</bdi>, <bdi lang="he">ש״ס</bdi>');
    assert.equal(bidi('the list יש עתיד today', 'en'), 'the list <bdi lang="he">יש עתיד</bdi> today');
  });
  test('an English quote is escaped and not wrapped', () => {
    assert.equal(bidi('the "technical" bloc', 'en'), 'the &quot;technical&quot; bloc');
  });
});

describe('keepWhole', () => {
  test('wraps each given name, and escapes the rest', () => {
    assert.equal(keepWhole('הליכוד & ש״ס', ['ש״ס']), 'הליכוד &amp; <span class="nw">ש״ס</span>');
  });
  test('the longer name wins, and nothing is wrapped twice', () => {
    const out = keepWhole('הציונות הדתית והציונות', ['הציונות', 'הציונות הדתית']);
    assert.equal(out, '<span class="nw">הציונות הדתית</span> ו<span class="nw">הציונות</span>');
  });
  test('a name with regex characters and & matches literally', () => {
    assert.equal(keepWhole('A&B (x.y) and AxB', ['A&B (x.y)']), '<span class="nw">A&amp;B (x.y)</span> and AxB');
  });
  test('empty and missing names are ignored', () => {
    assert.equal(keepWhole('a b', ['', null, undefined]), 'a b');
  });
  test('number pairs and seat counts stay whole, in both languages', () => {
    for (const s of ['53 מול 67', '53 מתוך 61', '59 vs 61', '53 of 61', '≈40 מנדטים', '1 seat', '12 seats', '1,234 vs 5,678']) {
      assert.equal(keepWhole(`x ${s} y`), `x <span class="nw">${s}</span> y`, s);
    }
  });
});

describe('fillTokens', () => {
  const resolve = (k, id) => `${k}=${id.toUpperCase()}`;
  test('replaces {party:…} and {topic:…} through the resolver', () => {
    assert.equal(fillTokens('{party:likud} on {topic:draft}.', resolve), 'party=LIKUD on topic=DRAFT.');
  });
  test('text with no tokens, and other braces, are unchanged', () => {
    assert.equal(fillTokens('plain {other:x}', resolve), 'plain {other:x}');
  });
});

describe('small helpers', () => {
test('segments keeps each part whole, joined with " · "', () => {
    assert.equal(segments(['67 מנדטים', 'a&b']), '<span class="nw">67 מנדטים</span> · <span class="nw">a&amp;b</span>');
  });
  test('extLink opens in a new tab, escapes, and adds aria-label only when given', () => {
    assert.equal(extLink('https://x.example/?a=1&b="2"', 'X & Y'), '<a href="https://x.example/?a=1&amp;b=&quot;2&quot;" rel="noopener" target="_blank">X &amp; Y</a>');
    assert.equal(extLink('https://x.example/', 'X', 'X (new tab)'), '<a href="https://x.example/" rel="noopener" target="_blank" aria-label="X (new tab)">X</a>');
  });
  test('fmtNum uses comma thousands separators', () => {
    assert.equal(fmtNum(1234567), '1,234,567');
    assert.equal(fmtNum(61), '61');
  });
});
