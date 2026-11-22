// Photo frame mode (wall display only, brief 14.6). After 5 minutes with no
// touches, and only once today's check-in is done, the slideshow fills the
// screen with a small clock and date. A tap returns to the app. Between the
// night hours the photos keep going, dimmed.
// Settings: settings.data.frame = { on, dimOn, dimFrom, dimTo } (account-wide),
// read fresh each time the frame is about to open.
import { CONFIG } from '../config.js';
import { getSettings, updateSettings, checkinDoneToday } from './wellbeing.js';

const IDLE_MS = 5 * 60 * 1000;
const DIM = 0.3; // brightness overnight
const CACHE_KEY = 'sf-frame';
export const FRAME_DEFAULTS = { on: true, dimOn: true, dimFrom: '22:00', dimTo: '07:00' };

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timezone, weekday: 'short', day: '2-digit', month: '2-digit' });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function frameFrom(saved) {
  const s = saved || {};
  return {
    on: typeof s.on === 'boolean' ? s.on : FRAME_DEFAULTS.on,
    dimOn: typeof s.dimOn === 'boolean' ? s.dimOn : FRAME_DEFAULTS.dimOn,
    dimFrom: HHMM.test(s.dimFrom) ? s.dimFrom : FRAME_DEFAULTS.dimFrom,
    dimTo: HHMM.test(s.dimTo) ? s.dimTo : FRAME_DEFAULTS.dimTo,
  };
}

function readCache() {
  try { return frameFrom(JSON.parse(localStorage.getItem(CACHE_KEY))); } catch { return frameFrom(null); }
}
function writeCache(cfg) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

export async function loadFrameSettings() {
  try { const cfg = frameFrom((await getSettings()).frame); writeCache(cfg); return cfg; } catch { return readCache(); }
}
export async function saveFrameSettings(cfg) {
  const clean = frameFrom(cfg);
  await updateSettings({ frame: clean });
  writeCache(clean);
  return clean;
}

// True when the London time is inside the night hours (which may cross midnight).
export function isNight(cfg, date = new Date()) {
  if (!cfg.dimOn || cfg.dimFrom === cfg.dimTo) return false;
  const now = timeFmt.format(date);
  return cfg.dimFrom < cfg.dimTo ? now >= cfg.dimFrom && now < cfg.dimTo : now >= cfg.dimFrom || now < cfg.dimTo;
}

let idleTimer = null;
let frameEl = null;
let tick = null;
let cfg = readCache();

function blocked() {
  // Not over the breathing exercise (the wall has no app lock).
  return document.hidden || !checkinDoneToday() || !!document.querySelector('.breathe');
}

function update() {
  if (!frameEl) return;
  if (!checkinDoneToday()) { closeFrame(); return; } // a new day started
  const now = new Date();
  frameEl.querySelector('.frame-time').textContent = timeFmt.format(now);
  frameEl.querySelector('.frame-date').textContent = dayFmt.format(now).replace(',', '');
  frameEl.style.setProperty('--frame-dim', isNight(cfg, now) ? DIM : 1);
}

async function openFrame() {
  if (frameEl || blocked()) return;
  cfg = await loadFrameSettings();
  if (!cfg.on || blocked() || frameEl) return;

  frameEl = document.createElement('div');
  frameEl.className = 'photo-frame';
  frameEl.innerHTML = `
    <div class="frame-photos"></div>
    <div class="frame-clock" aria-hidden="true"><span class="frame-time"></span><span class="frame-date"></span></div>`;
  // Any tap closes the frame; the tap does not reach the page underneath.
  frameEl.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeFrame(); });
  document.body.appendChild(frameEl);
  update();
  tick = setInterval(update, 1000);

  const photosEl = frameEl.querySelector('.frame-photos');
  try {
    const tile = (await import('../tiles/photos/index.js')).default;
    await tile.renderExpanded(photosEl);
  } catch (err) {
    console.warn('Photo frame could not load photos', err);
  }
  if (frameEl && !photosEl.querySelector('.photo-view')) closeFrame(); // no photos, stay on Home
}

export function closeFrame() {
  clearInterval(tick);
  tick = null;
  if (frameEl) { frameEl.remove(); frameEl = null; }
  resetIdle();
}

function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(openFrame, IDLE_MS);
}

export function startFrame() {
  for (const type of ['pointerdown', 'keydown', 'wheel']) {
    document.addEventListener(type, () => { if (!frameEl) resetIdle(); }, { capture: true, passive: true });
  }
  document.addEventListener('scroll', () => { if (!frameEl) resetIdle(); }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !frameEl) resetIdle(); });
  resetIdle();
}
