// Links that open a phone app from a tile.
// Chrome on Android only opens app screens marked as safe for the browser, so
// each app uses a link its own app answers to (a deep link), sent to that app's
// package. If the app does not take it, Chrome goes to the Play Store page
// (which has an Open button when the app is installed).
// iPhone: the app's own link scheme; if nothing opens within 1.5 seconds, the
// App Store page. Computer: the website.
export const APPS = {
  // Hue: no link opens the app from a browser on Android (6 tried 21/11/2026),
  // so it lands on the Play Store page; Scott taps Open (his choice).
  hue: {
    android: 'intent://#Intent;scheme=hue2;package=com.philips.lighting.hue2',
    play: 'https://play.google.com/store/apps/details?id=com.philips.lighting.hue2',
    ios: 'hue2://',
    appStore: 'https://apps.apple.com/gb/app/philips-hue/id1055281310',
    web: 'https://www.philips-hue.com',
  },
  spotify: {
    android: 'intent://#Intent;scheme=spotify;package=com.spotify.music',
    play: 'https://play.google.com/store/apps/details?id=com.spotify.music',
    ios: 'spotify://',
    appStore: 'https://apps.apple.com/gb/app/spotify-music-and-podcasts/id324684580',
    web: 'https://open.spotify.com',
  },
  calendar: {
    android: 'intent://calendar.google.com/calendar/r#Intent;scheme=https;package=com.google.android.calendar',
    play: 'https://play.google.com/store/apps/details?id=com.google.android.calendar',
    ios: 'googlecalendar://',
    appStore: 'https://apps.apple.com/gb/app/google-calendar-get-organised/id909319292',
    web: 'https://calendar.google.com',
  },
};

const platform = () => {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'web';
};

export function appLink(app) {
  const a = APPS[app];
  const p = platform();
  if (p === 'android') return `${a.android};S.browser_fallback_url=${encodeURIComponent(a.play)};end`;
  if (p === 'ios') return a.ios;
  return a.web;
}

// iPhone: if the app link did nothing (app not installed), go to the App Store.
let iosWatch = false;
function watchIosLinks() {
  if (iosWatch || platform() !== 'ios') return;
  iosWatch = true;
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-app-store]');
    if (!link) return;
    const store = link.dataset.appStore;
    const timer = setTimeout(() => { if (!document.hidden) window.location.href = store; }, 1500);
    const cancel = () => { clearTimeout(timer); document.removeEventListener('visibilitychange', cancel); };
    document.addEventListener('visibilitychange', cancel);
  });
}

// Same look in every tile: a small underlined link at the bottom.
// Attributes for any element that should open the app (href, target or the
// iPhone App Store fallback), for links that wrap something other than text.
export function appLinkAttrs(app) {
  watchIosLinks();
  const p = platform();
  const extra = p === 'web' ? ' target="_blank"' : p === 'ios' ? ` data-app-store="${APPS[app].appStore}"` : '';
  return `href="${appLink(app)}"${extra} rel="noopener"`;
}

export function appLinkHtml(app, label) {
  return `<a class="link-btn tile-applink" ${appLinkAttrs(app)}>${label}</a>`;
}
