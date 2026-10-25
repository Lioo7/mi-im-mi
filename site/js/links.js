// Small link builders (pure, testable).
export const CONTACT_EMAIL = 'lioz.akirav@gmail.com';

// mailto: link for reporting a wrong position. The body carries the page URL the reader was on.
export function correctionMailto({ party, topic, url, bodyIntro = 'הקישור לעמוד:', email = CONTACT_EMAIL }) {
  const subject = `תיקון: ${party} · ${topic}`;
  const body = `${bodyIntro} ${url}\n\n`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Where a quote was published, in Hebrew, for the attribution line under it.
const MEDIA = {
  'x.com': 'X', 'www.ynet.co.il': 'ynet', 'www.mako.co.il': 'מאקו', 'www.maariv.co.il': 'מעריב', 'www.walla.co.il': 'וואלה',
  'www.i24news.tv': 'i24NEWS', 'www.inn.co.il': 'ערוץ 7', 'www.israelnationalnews.com': 'ערוץ 7', 'www.kipa.co.il': 'כיפה',
  '13tv.co.il': 'חדשות 13', 'www.arab48.com': 'Arab48', 'bokra.net': 'בוקרא', 'www.hakalkalit.org': 'הכלכלית',
  'main.knesset.gov.il': 'הצעת חוק בכנסת',
};

export function quoteChannel({ sourceUrl, sourceType }) {
  let host = '';
  try { host = new URL(sourceUrl).hostname; } catch { /* no usable url */ }
  if (MEDIA[host]) return MEDIA[host];
  return sourceType === 'platform' ? 'מצע המפלגה' : 'אתר המפלגה';
}

// "<speaker or party>, <channel>, <date>" (the date is left out when the source is undated).
export function quoteAttribution({ quoteBy, sourceUrl, sourceType, sourceDate }, partyName) {
  const date = sourceDate ? sourceDate.split('-').reverse().join('.') : '';
  return [quoteBy || partyName, quoteChannel({ sourceUrl, sourceType }), date].filter(Boolean).join(', ');
}
