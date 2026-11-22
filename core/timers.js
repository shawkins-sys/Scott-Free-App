// Timers (this device only). Several named countdowns at once, kept in
// localStorage so they survive closing the app. A timer that ends while the
// app is open chimes softly (repeating until Stop, at most 5 minutes) and
// vibrates; one that ended while the app was closed shows "Finished at HH:MM".
// The screen is kept awake while a timer runs.
// Presets (minutes) are account-wide in settings.data.timerPresets.
import { CONFIG } from '../config.js';
import { getSettings, updateSettings, esc } from './wellbeing.js';

const KEY = 'sf-timers';
const PRESET_KEY = 'sf-timer-presets';
export const DEFAULT_PRESETS = [1, 5, 10, 15, 30];
const RING_MAX_MS = 5 * 60 * 1000;
const LATE_RING_MS = 2 * 60 * 1000; // caught up after the app was in the background

const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

let timers = load();
let tick = null;
let ringing = null; // { ids, stopAt, loop }
let audio = null;
let wake = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('sf:timers'));
}

export const listTimers = () => timers.slice();
export const remainingMs = (t, now = Date.now()) => (t.endsAt ? Math.max(0, t.endsAt - now) : t.remaining);
export const isRunning = (t) => !!t.endsAt && !t.finishedAt;
export const finishedText = (t) => `Finished at ${timeFmt.format(new Date(t.finishedAt))}`;

export function formatMs(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function presetName(mins) {
  return mins >= 60 && mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? '' : 's'}` : `${mins} min`;
}

// ---------- Presets ----------
export function cleanPresets(list) {
  const out = [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 600))];
  return out.sort((a, b) => a - b).slice(0, 8);
}
export function cachedPresets() {
  try { const p = JSON.parse(localStorage.getItem(PRESET_KEY)); if (Array.isArray(p) && p.length) return cleanPresets(p); } catch { /* ignore */ }
  return DEFAULT_PRESETS.slice();
}
export async function loadPresets() {
  try {
    const p = (await getSettings()).timerPresets;
    const clean = Array.isArray(p) && p.length ? cleanPresets(p) : DEFAULT_PRESETS.slice();
    localStorage.setItem(PRESET_KEY, JSON.stringify(clean));
    return clean;
  } catch { return cachedPresets(); }
}
export async function savePresets(list) {
  const clean = cleanPresets(list);
  await updateSettings({ timerPresets: clean });
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(clean)); } catch { /* ignore */ }
  return clean;
}

// ---------- Actions ----------
export function startTimer(ms, name) {
  unlockAudio();
  const total = Math.max(1000, Math.min(ms, 24 * 3600 * 1000));
  const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random());
  timers.push({ id, name: (name || '').trim().slice(0, 40) || `${formatMs(total)} timer`, total, endsAt: Date.now() + total, remaining: total, finishedAt: null });
  save();
  run();
}

export function pauseTimer(id) {
  const t = timers.find((x) => x.id === id);
  if (!t || !isRunning(t)) return;
  t.remaining = remainingMs(t);
  t.endsAt = null;
  save();
  run();
}

export function resumeTimer(id) {
  unlockAudio();
  const t = timers.find((x) => x.id === id);
  if (!t || t.endsAt || t.finishedAt) return;
  t.endsAt = Date.now() + t.remaining;
  save();
  run();
}

export function addMinute(id) {
  const t = timers.find((x) => x.id === id);
  if (!t || t.finishedAt) return;
  if (t.endsAt) t.endsAt += 60000; else t.remaining += 60000;
  t.total += 60000;
  save();
}

// Cancel a running or paused timer, or clear a finished one.
export function removeTimer(id) {
  timers = timers.filter((x) => x.id !== id);
  if (ringing) { ringing.ids = ringing.ids.filter((x) => x !== id); if (!ringing.ids.length) stopRing(); }
  save();
  run();
}

// ---------- Ticking ----------
function check() {
  const now = Date.now();
  const due = [];
  let changed = false;
  for (const t of timers) {
    if (isRunning(t) && t.endsAt <= now) {
      // Chime only if it ended moments ago with the app on screen.
      if (now - t.endsAt <= LATE_RING_MS && !document.hidden) due.push(t.id);
      t.finishedAt = t.endsAt;
      t.endsAt = null;
      t.remaining = 0;
      changed = true;
    }
  }
  if (changed) save();
  if (due.length) ring(due);
  if (ringing && now > ringing.stopAt) stopRing();
  run();
  window.dispatchEvent(new Event('sf:timers-tick'));
}

function run() {
  const any = timers.some(isRunning);
  if (any && !tick) tick = setInterval(check, 1000);
  if (!any && tick && !ringing) { clearInterval(tick); tick = null; }
  if (any) keepAwake(); else releaseAwake();
}

async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { if (!wake || wake.released) wake = await navigator.wakeLock.request('screen'); } catch { /* not allowed now */ }
}
function releaseAwake() {
  if (wake && !wake.released) wake.release().catch(() => {});
  wake = null;
}

// ---------- Chime ----------
// Browsers only allow sound after a tap, so the audio is unlocked on any tap.
export function unlockAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio */ }
}

function chime() {
  if (!audio || audio.state !== 'running') return;
  const t0 = audio.currentTime;
  [[659.25, 0], [523.25, 0.45]].forEach(([freq, at]) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.3);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 1.4);
  });
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
}

function ringPanel() {
  let el = document.getElementById('timer-ring');
  if (!el) {
    el = document.createElement('div');
    el.id = 'timer-ring';
    el.className = 'timer-ring';
    el.setAttribute('role', 'alertdialog');
    document.body.appendChild(el);
  }
  const names = timers.filter((t) => ringing.ids.includes(t.id)).map((t) => esc(t.name));
  el.innerHTML = `
    <div class="timer-ring-card">
      <p class="timer-ring-title">${names.length ? names.join(', ') : 'Timer'}</p>
      <p class="muted">${names.length > 1 ? 'have' : 'has'} finished</p>
      <button type="button" class="primary-btn timer-stop">Stop</button>
    </div>`;
  el.querySelector('.timer-stop').addEventListener('click', stopRing);
}

export function ring(ids) {
  unlockAudio();
  if (ringing) { ringing.ids = [...new Set([...ringing.ids, ...ids])]; ringing.stopAt = Date.now() + RING_MAX_MS; }
  else {
    ringing = { ids: [...ids], stopAt: Date.now() + RING_MAX_MS, loop: setInterval(chime, 2600) };
    chime();
    if (!tick) tick = setInterval(check, 1000);
  }
  ringPanel();
}

export function stopRing() {
  if (!ringing) return;
  clearInterval(ringing.loop);
  ringing = null;
  if (navigator.vibrate) navigator.vibrate(0);
  document.getElementById('timer-ring')?.remove();
  run();
}

// ---------- Home line ----------
// A slim line on Home while a timer runs or has just finished. Tap opens Plan.
export function renderTimerLine(el) {
  if (!el) return;
  const draw = () => {
    if (!document.contains(el)) { window.removeEventListener('sf:timers-tick', draw); window.removeEventListener('sf:timers', draw); return; }
    const active = timers.filter((t) => !t.finishedAt).sort((a, b) => remainingMs(a) - remainingMs(b));
    const done = timers.filter((t) => t.finishedAt);
    if (!active.length && !done.length) { el.innerHTML = ''; return; }
    const parts = active.slice(0, 2).map((t) => `${esc(t.name)} <b>${formatMs(remainingMs(t))}</b>${t.endsAt ? '' : ' (paused)'}`);
    if (active.length > 2) parts.push(`${active.length - 2} more`);
    if (done.length) parts.push(`${done.length} finished`);
    el.innerHTML = `<a class="timer-line" href="#/hub/plan">${timerIcon()}<span>${parts.join(' &middot; ')}</span></a>`;
  };
  window.addEventListener('sf:timers-tick', draw);
  window.addEventListener('sf:timers', draw);
  draw();
}

export function timerIcon() {
  return '<svg class="timer-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>';
}

// ---------- Start-up ----------
export function startTimers() {
  check();
  run();
  document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); run(); } });
}
