// Small link builders (pure, testable). Each takes the reader's strings (`S`, Hebrew by default).
import { S as HE } from './strings.js';

/** The reader's UI strings: strings.js, or strings.en.js (same shape, test/strings.test.mjs). @typedef {typeof HE} Strings */
/** @typedef {{ sourceUrl?: string | null, sourceType?: string | null }} Source */

export const CONTACT_EMAIL = 'lioz.akirav@gmail.com';

// mailto: link for reporting a wrong position. The body carries the page URL the reader was on.
/** @param {{ party: string, topic: string, url: string, email?: string }} where @param {Strings} [S] */
export function correctionMailto({ party, topic, url, email = CONTACT_EMAIL }, S = HE) {
  const subject = S.sheet.correctionSubject(party, topic);
  const body = `${S.sheet.correctionBody} ${url}\n\n`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Where a quote was published, for the attribution line under it.
/** @param {Source} source @param {Strings} [S] @returns {string} */
export function quoteChannel({ sourceUrl, sourceType }, S = HE) {
  let host = '';
  try { host = new URL(sourceUrl ?? '').hostname; } catch { /* no usable url */ }
  /** @type {Record<string, string>} */
  const media = S.links.media;
  if (media[host]) return media[host];
  return sourceType === 'platform' ? S.links.platform : S.links.partySite;
}

// "<speaker or party>, <channel>, <date>" (the date is left out when the source is undated).
export const SITE_TRANSLATOR = 'האתר';

// A translated quote says so: "<speaker>, <original channel>, <date> (תרגום: <translator>)".
/**
 * @param {Source & { quoteBy?: string | null, quoteChannel?: string | null, quoteTranslatedBy?: string | null,
 *   sourceDate?: string | null }} pos
 * @param {string} partyName @param {Strings} [S]
 */
export function quoteAttribution({ quoteBy, quoteChannel: channel, quoteTranslatedBy, sourceUrl, sourceType, sourceDate }, partyName, S = HE) {
  const line = [quoteBy ? S.nameOf(quoteBy) : partyName, channel ? S.nameOf(channel) : quoteChannel({ sourceUrl, sourceType }, S), S.fmtDate(sourceDate)].filter(Boolean).join(', ');
  return quoteTranslatedBy && quoteTranslatedBy !== SITE_TRANSLATOR ? `${line} ${S.links.translatedBy(S.nameOf(quoteTranslatedBy))}` : line;
}
