import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctionMailto, CONTACT_EMAIL } from '../site/js/links.js';

test('correction mailto has the right recipient, a prefilled subject, and the page URL in the body', () => {
  const url = 'https://mi-im-mi-2026.netlify.app/?m=likud,shas#results';
  const href = correctionMailto({ party: 'ש״ס', topic: 'גיוס ושוויון בנטל', url });
  assert.ok(href.startsWith(`mailto:${CONTACT_EMAIL}?`));
  const q = new URL(href).searchParams;
  assert.equal(q.get('subject'), 'תיקון: ש״ס · גיוס ושוויון בנטל');
  assert.ok(q.get('body').includes(url));
});

test('subject and body are percent-encoded so special characters survive', () => {
  const href = correctionMailto({ party: 'א&ב', topic: 'נושא?=', url: 'https://x.example/?a=1&b=2' });
  const q = new URL(href).searchParams;
  assert.equal(q.get('subject'), 'תיקון: א&ב · נושא?=');
  assert.ok(q.get('body').includes('https://x.example/?a=1&b=2'));
});
