// Calm Home card row (phone): small glass squares that swipe sideways.
// Weather (tap: full forecast), Music (tap: play or pause), Lights (tap: sheet
// with the rooms), Calendar (tap: opens Google Calendar). Calendar events are
// not loaded here. Only drawn after today's check-in (see revealCalm).
import { openOverlay } from './overlay.js';
import { esc } from './wellbeing.js';
import { londonParts } from './date.js';
import { appLinkAttrs } from './applink.js';
import { spotifyConfigured, spotifyNow, spotifyControl, spotifyRecent } from './spotify.js';
import { resumeTrack, finishPending } from './music-resume.js';

const REFRESH_MS = 15 * 1000;
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  music: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  play: svg('<path d="M8 5l11 7-11 7z" fill="currentColor"/>'),
  pause: svg('<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'),
  cal: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
};

const card = (id, icon, big, small, extra = '') => `
  <${id === 'calendar' ? 'a' : 'button type="button"'} class="calm-card" data-card="${id}" ${extra}>
    <span class="calm-card-icon">${icon}</span>
    <span class="calm-card-text"><span class="calm-card-big">${big}</span><span class="calm-card-small">${small}</span></span>
  </${id === 'calendar' ? 'a' : 'button'}>`;

const hour12 = (t) => { // "2026-11-24T15:00" -> "3pm"
  const h = Number(t.slice(11, 13));
  return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
};

// ---------- Weather ----------
async function weatherCard(root) {
  const el = root.querySelector('[data-card="weather"]');
  try {
    const w = await import(new URL('../tiles/weather/index.js', import.meta.url).href);
    const d = await w.getWeather();
    const c = d.current;
    const [desc, kind] = w.describe(c.weather_code);
    let line = desc;
    const wet = (k) => ['drizzle', 'rain', 'snow', 'storm'].includes(k);
    if (!wet(kind)) {
      const start = w.nowIndex(d.hourly) + 1;
      for (let i = start; i < Math.min(start + 12, d.hourly.time.length); i += 1) {
        const k = w.describe(d.hourly.weather_code[i])[1];
        if (wet(k) && (d.hourly.precipitation_probability[i] || 0) >= 40) {
          line = `${k === 'snow' ? 'Snow' : k === 'storm' ? 'Storm' : 'Rain'} ${hour12(d.hourly.time[i])}`;
          break;
        }
      }
    }
    el.querySelector('.calm-card-icon').innerHTML = w.icon(c.weather_code, c.is_day);
    el.querySelector('.calm-card-big').textContent = w.deg(c.temperature_2m);
    el.querySelector('.calm-card-small').textContent = line;
    el.addEventListener('click', () => openOverlay('Weather', (c2) => w.default.renderExpanded(c2)));
  } catch (err) {
    console.warn('Weather card failed', err);
    el.querySelector('.calm-card-big').textContent = 'Weather';
    el.querySelector('.calm-card-small').textContent = 'Not available';
  }
}

// ---------- Music ----------
function musicCard(root) {
  const el = root.querySelector('[data-card="music"]');
  if (!spotifyConfigured()) { el.remove(); return; }
  let now = null;
  let recent = null;
  let recentLoaded = false;
  let needsConnect = false;
  let busy = false;
  const big = el.querySelector('.calm-card-big');
  const small = el.querySelector('.calm-card-small');
  const iconEl = el.querySelector('.calm-card-icon');

  const draw = () => {
    if (needsConnect) { iconEl.innerHTML = ICON.music; big.textContent = 'Music'; small.textContent = 'Reconnect'; return; }
    const show = now || recent;
    const playing = !!(now && now.playing);
    big.textContent = show ? show.track || 'Music' : 'Music';
    small.textContent = playing ? 'Playing' : show ? 'Tap to play' : 'Nothing playing';
    iconEl.innerHTML = show && show.art
      ? `<img src="${esc(show.art)}" alt="" referrerpolicy="no-referrer"><span class="calm-card-badge">${playing ? ICON.pause : ICON.play}</span>`
      : (playing ? ICON.pause : ICON.music);
  };

  const refresh = async () => {
    if (!el.isConnected) return;
    const r = await spotifyNow();
    if (!el.isConnected) return;
    if (r.result === 'reconnect') { needsConnect = true; draw(); return; }
    if (r.result !== 'ok') return;
    needsConnect = false;
    now = r.now && r.now.track ? r.now : null;
    if (!now && !recentLoaded) {
      recentLoaded = true;
      const rr = await spotifyRecent();
      if (rr.result === 'ok') recent = rr.recent;
    }
    draw();
  };

  el.addEventListener('click', async () => {
    if (needsConnect) { location.hash = '#/hub/settings'; return; }
    if (busy) return;
    busy = true;
    try {
      const t = (now && now.uri) ? now : recent;
      if (!now && t && t.uri) {
        small.textContent = 'Starting...';
        const r = await resumeTrack(t);
        if (r === 'failed') small.textContent = 'Did not start, try again';
        else setTimeout(refresh, 1200);
        return;
      }
      if (now) {
        const cmd = now.playing ? 'pause' : 'play';
        now.playing = cmd === 'play';
        draw();
        const r = await spotifyControl(cmd);
        if (r.result === 'nodevice' && cmd === 'play' && t && t.uri) {
          const rr = await resumeTrack(t);
          if (rr === 'failed') small.textContent = 'Did not start, try again';
        } else if (r.result !== 'ok' && r.result !== 'nodevice') small.textContent = 'Did not work, try again';
        setTimeout(refresh, 800);
      }
    } finally { busy = false; }
  });

  const tick = () => { if (!el.isConnected) { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); return; } if (!document.hidden) refresh(); };
  const onVis = () => { if (!document.hidden) { finishPending(() => el.isConnected).then((ok) => { if (ok) setTimeout(refresh, 1200); }); tick(); } };
  const timer = setInterval(tick, REFRESH_MS);
  document.addEventListener('visibilitychange', onVis);
  refresh();
  finishPending(() => el.isConnected).then((ok) => { if (ok) setTimeout(refresh, 1200); });
}

// ---------- Row ----------
export function renderCardRow(slot) {
  if (!slot) return;
  slot.innerHTML = `
    <div class="calm-cards" role="list" aria-label="Quick cards">
      ${card('weather', '', '', 'Loading')}
      ${card('music', ICON.music, 'Music', 'Loading')}
      ${card('lights', ICON.bulb, 'Lights', 'Tap for rooms')}
      ${card('calendar', ICON.cal, 'Calendar', 'Open app', appLinkAttrs('calendar'))}
    </div>`;
  slot.hidden = false;
  weatherCard(slot);
  musicCard(slot);
  slot.querySelector('[data-card="lights"]').addEventListener('click', async () => {
    const mod = await import(new URL('../tiles/lights/index.js', import.meta.url).href);
    openOverlay('Lights', (c) => mod.default.renderExpanded(c));
  });
}
