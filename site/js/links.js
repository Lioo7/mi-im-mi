// Small link builders (pure, testable).
export const CONTACT_EMAIL = 'lioz.akirav@gmail.com';

// mailto: link for reporting a wrong position. The body carries the page URL the reader was on.
export function correctionMailto({ party, topic, url, bodyIntro = 'הקישור לעמוד:', email = CONTACT_EMAIL }) {
  const subject = `תיקון: ${party} · ${topic}`;
  const body = `${bodyIntro} ${url}\n\n`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
