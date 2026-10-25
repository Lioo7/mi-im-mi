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

import { quoteAttribution, quoteChannel } from '../site/js/links.js';

test('quote attribution: speaker or party, channel, date', () => {
  assert.equal(
    quoteAttribution({ quoteBy: 'נפתלי בנט', sourceUrl: 'https://x.com/a/status/1', sourceType: 'statement', sourceDate: '2026-10-21' }, 'ביחד'),
    'נפתלי בנט, X, 21.10.2026');
  assert.equal(
    quoteAttribution({ quoteBy: null, sourceUrl: 'https://be-yahad.org.il/plans/', sourceType: 'platform', sourceDate: '2026-06-23' }, 'ביחד'),
    'ביחד, מצע המפלגה, 23.06.2026');
  assert.equal(quoteAttribution({ sourceUrl: 'https://beytenu.org.il/x', sourceType: 'platform', sourceDate: null }, 'ישראל ביתנו'), 'ישראל ביתנו, מצע המפלגה');
  assert.equal(quoteChannel({ sourceUrl: 'https://main.knesset.gov.il/a', sourceType: 'record' }), 'הצעת חוק בכנסת');
});
