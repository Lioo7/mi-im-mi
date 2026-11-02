// Small link builders (pure, testable). Each takes the reader's strings (`S`, Hebrew by default).
import { S as HE } from './strings.js';

export const CONTACT_EMAIL = 'lioz.akirav@gmail.com';

// mailto: link for reporting a wrong position. The body carries the page URL the reader was on.
export function correctionMailto({ party, topic, url, email = CONTACT_EMAIL }, S = HE) {
  const subject = S.sheet.correctionSubject(party, topic);
  const body = `${S.sheet.correctionBody} ${url}\n\n`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Where a quote was published, for the attribution line under it.
export function quoteChannel({ sourceUrl, sourceType }, S = HE) {
  let host = '';
  try { host = new URL(sourceUrl).hostname; } catch { /* no usable url */ }
  if (S.links.media[host]) return S.links.media[host];
  return sourceType === 'platform' ? S.links.platform : S.links.partySite;
}

// "<speaker or party>, <channel>, <date>" (the date is left out when the source is undated).
export const SITE_TRANSLATOR = 'האתר';

// A translated quote says so: "<speaker>, <original channel>, <date> (תרגום: <translator>)".
export function quoteAttribution({ quoteBy, quoteChannel: channel, quoteTranslatedBy, sourceUrl, sourceType, sourceDate }, partyName, S = HE) {
  const line = [quoteBy || partyName, channel || quoteChannel({ sourceUrl, sourceType }, S), S.fmtDate(sourceDate)].filter(Boolean).join(', ');
  return quoteTranslatedBy && quoteTranslatedBy !== SITE_TRANSLATOR ? `${line} ${S.links.translatedBy(quoteTranslatedBy)}` : line;
}
