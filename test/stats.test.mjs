import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beaconUrl, shouldCount, countPageview } from '../site/js/stats.js';

test('beacon never carries the query string or any coalition data', () => {
  const url = decodeURIComponent(beaconUrl({
    pathname: '/', title: 'מי עם מי', width: 360,
    referrer: 'https://l.wl.co/l?u=https://x.example/?b=likud&m=shas,utj',
  }));
  assert.ok(url.startsWith('https://miimmi.goatcounter.com/count?'));
  assert.ok(!/[?&](b|m|o|q)=/.test(url.slice(url.indexOf('?') + 1)), url);
  assert.ok(!/likud|shas|utj/.test(url), url);
  assert.ok(url.includes('p=/'));
  assert.ok(url.includes('r=https://l.wl.co'), 'referrer is reduced to its origin');
});

test('only pathname, title, width, referrer origin and a cache-buster are sent', () => {
  const keys = [...new URL(beaconUrl({ pathname: '/', title: 't', width: 360, referrer: 'https://a.example/x' })).searchParams.keys()].sort();
  assert.deepEqual(keys, ['p', 'r', 'rnd', 's', 't']);
});

test('only https on the production host is counted', () => {
  assert.equal(shouldCount({ protocol: 'https:', hostname: 'mi-im-mi-2026.netlify.app' }), true);
  assert.equal(shouldCount({ protocol: 'file:', hostname: '' }), false);
  assert.equal(shouldCount({ protocol: 'http:', hostname: 'mi-im-mi-2026.netlify.app' }), false);
  assert.equal(shouldCount({ protocol: 'http:', hostname: 'localhost' }), false);
  assert.equal(shouldCount({ protocol: 'http:', hostname: '127.0.0.1' }), false);
  assert.equal(shouldCount({ protocol: 'https:', hostname: '6ade56d9--mi-im-mi-2026.netlify.app' }), false);
  assert.equal(shouldCount({ protocol: 'https:', hostname: 'mi-im-mi-2026.netlify.app.evil.example' }), false);
});

test('countPageview sends nothing from a file:// preview', () => {
  const sent = [];
  const win = {
    location: { protocol: 'file:', hostname: '', pathname: '/Users/someone/site/index.html' },
    document: { title: 't', referrer: '' }, screen: { width: 390 },
    navigator: { sendBeacon: (u) => { sent.push(u); return true; } },
    Image: function Image() { sent.push('img'); },
  };
  countPageview(win);
  assert.deepEqual(sent, []);
  countPageview({ ...win, location: { protocol: 'https:', hostname: 'mi-im-mi-2026.netlify.app', pathname: '/' } });
  assert.equal(sent.length, 1);
  assert.ok(sent[0].includes('p=%2F'), sent[0]);
});
