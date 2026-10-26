// Cookieless page-view counting for GoatCounter (https://miimmi.goatcounter.com).
// We send our own beacon instead of GoatCounter's count.js, because count.js always attaches the full
// query string (q=location.search), which here holds the coalition a person built. Only the pathname,
// page title, screen width and the referrer's origin are sent. No events, no cookies, no per-user data.
export const ENDPOINT = 'https://miimmi.goatcounter.com/count';

export const PROD_HOST = 'mi-im-mi-2026.netlify.app';

// Allow-list: only the production site over https is counted. Everything else (file:// previews, which would send
// a local file path, localhost, Netlify drafts and previews) sends nothing.
export function shouldCount({ protocol, hostname }) {
  return protocol === 'https:' && hostname === PROD_HOST;
}

export function beaconUrl({ pathname, title, referrer, width }) {
  let origin = '';
  try { origin = referrer ? new URL(referrer).origin : ''; } catch { /* ignore a malformed referrer */ }
  const q = new URLSearchParams({ p: pathname || '/', t: title || '', s: String(width || ''), r: origin });
  for (const [k, v] of [...q]) if (v === '') q.delete(k);
  q.set('rnd', Math.random().toString(36).slice(2, 7));
  return `${ENDPOINT}?${q}`;
}

export function countPageview(win = window) {
  try {
    if (!shouldCount(win.location)) return;
    if (win.localStorage?.getItem('skipgc') === 't') return;
    const url = beaconUrl({
      pathname: win.location.pathname,
      title: win.document.title,
      referrer: win.document.referrer,
      width: win.screen.width,
    });
    if (!win.navigator.sendBeacon?.(url)) new win.Image().src = url;
  } catch { /* counting must never break the page */ }
}
