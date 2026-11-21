// Links that open a phone app from a tile.
// Android: an intent that opens the app, or `fallback` if it is not installed.
// iPhone: no public way to open these apps from a web page, so `ios` (usually
// the App Store page). Computer: `fallback` (the website or store page).
export function appLink({ android, ios, fallback }) {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) {
    return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${android};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return ios || fallback;
  return fallback;
}

export const APPS = {
  hue: {
    android: 'com.philips.lighting.hue2',
    ios: 'https://apps.apple.com/gb/app/philips-hue/id1055281310',
    fallback: 'https://play.google.com/store/apps/details?id=com.philips.lighting.hue2',
  },
  spotify: {
    android: 'com.spotify.music',
    ios: 'https://open.spotify.com',
    fallback: 'https://open.spotify.com',
  },
  calendar: {
    android: 'com.google.android.calendar',
    ios: 'https://calendar.google.com',
    fallback: 'https://calendar.google.com',
  },
};

// Same look in every tile: a small underlined link at the bottom.
// Android intents open in place; web pages open in a new tab.
export function appLinkHtml(app, label) {
  const href = appLink(APPS[app]);
  const target = href.startsWith('intent:') ? '' : ' target="_blank"';
  return `<a class="link-btn tile-applink" href="${href}"${target} rel="noopener">${label}</a>`;
}
