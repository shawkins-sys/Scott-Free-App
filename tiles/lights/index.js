// Lights tile: Hue rooms on and off from Home, through the `lights` Edge
// Function (Voice Monkey, then Alexa, then Hue). Commands only, so there is
// no live on/off state. Three commands (free plan limit): each room on, all off. "Open Hue" opens the Hue app for anything more.
// Waits for the morning check-in, like Photos and Music. Shown on the wall too.
import { supabase } from '../../core/supabase.js';
import { getTodayCheckin, checkinDoneToday } from '../../core/wellbeing.js';

const ROOMS = [
  { name: 'Living room', cmd: 'living-room-on' },
  { name: 'Bedroom', cmd: 'bedroom-on' },
];
const HUE_PACKAGE = 'com.philips.lighting.hue2';
const PLAY_URL = `https://play.google.com/store/apps/details?id=${HUE_PACKAGE}`;
const APP_STORE_URL = 'https://apps.apple.com/gb/app/philips-hue/id1055281310';

// Android: open the Hue app, or the Play Store if it is not installed.
// iPhone: no public link into the Hue app, so the App Store page for now.
function hueLink() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) {
    return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${HUE_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`;
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return APP_STORE_URL;
  return PLAY_URL;
}

async function send(cmd) {
  try {
    const { data, error } = await supabase.functions.invoke('lights', { body: { cmd } });
    if (error) { console.warn('Lights function failed', error); return 'error'; }
    return (data && data.result) || 'error';
  } catch (e) {
    console.warn('Lights function failed', e);
    return 'error';
  }
}

const MESSAGES = {
  notset: 'Lights are not set up yet. See docs/LIGHTS-SETUP.md.',
  busy: 'Too many presses. Please wait a moment and try again.',
  error: 'That did not work. Please try again.',
};

async function startView(container) {
  try { await getTodayCheckin(); } catch { /* treated as not done */ }
  if (!checkinDoneToday()) {
    container.innerHTML = '<p class="muted">Lights will appear after this morning\'s check-in.</p>';
    window.addEventListener('sf:checkin-done', () => { if (container.isConnected) startView(container); }, { once: true });
    return;
  }

  container.innerHTML = `<div class="li-tile">
    ${ROOMS.map((r) => `<div class="li-row">
      <span class="li-name">${r.name}</span>
      <button class="pill-btn li-btn" data-cmd="${r.cmd}">On</button>
    </div>`).join('')}
    <button class="pill-btn li-btn li-alloff" data-cmd="all-off">All off</button>
    <p class="muted small li-msg" aria-live="polite"></p>
    <a class="link-btn li-hue" href="${hueLink()}" rel="noopener">Open Hue</a>
  </div>`;

  const msgEl = container.querySelector('.li-msg');
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.li-btn');
    if (!btn || btn.disabled) return;
    const label = btn.textContent;
    const pair = container.querySelectorAll('.li-btn');
    pair.forEach((b) => { b.disabled = true; });
    btn.textContent = 'Sending...';
    msgEl.textContent = '';
    const result = await send(btn.dataset.cmd);
    if (!container.isConnected) return;
    if (result === 'ok') {
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = label; pair.forEach((b) => { b.disabled = false; }); }, 1500);
    } else {
      btn.textContent = label;
      pair.forEach((b) => { b.disabled = false; });
      msgEl.textContent = MESSAGES[result] || MESSAGES.error;
    }
  });
}

export default {
  id: 'lights',
  title: 'Lights',
  defaultSize: { phone: { w: 4, h: 3 }, desktop: { w: 4, h: 3 } },
  render(container) { return startView(container); },
  renderExpanded(container) { return startView(container); },
};
