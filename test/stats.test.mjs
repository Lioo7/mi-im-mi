import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beaconUrl, shouldCount } from '../site/js/stats.js';

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

test('local and deploy-preview hosts are not counted unless allowed', () => {
  assert.equal(shouldCount('localhost'), false);
  assert.equal(shouldCount('127.0.0.1'), false);
  assert.equal(shouldCount('192.168.1.5'), false);
  assert.equal(shouldCount('6ade56d9--mi-im-mi-2026.netlify.app'), false);
  assert.equal(shouldCount('6ade56d9--mi-im-mi-2026.netlify.app', true), true);
  assert.equal(shouldCount('mi-im-mi-2026.netlify.app'), true);
});
