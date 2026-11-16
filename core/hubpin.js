// Hub PIN for the wall display (brief 14.4).
// - 4 to 6 digits, set and changed only on a non-wall device.
// - Stored only as a salted PBKDF2 hash in the database (settings.data.hubPin).
// - On wall devices it guards Settings, and Wellbeing if chosen. (Money is not
//   available on the wall at all.)
// - After unlocking, the hub relocks after 2 minutes with no interaction, or
//   straight away when you leave it.
// - 5 wrong attempts pause PIN entry for 5 minutes on that device.
import { getSettings, updateSettings, esc } from './wellbeing.js';
import { isWall } from './device.js';

const IDLE_MS = 2 * 60 * 1000;
const MAX_FAILS = 5;
const PAUSE_MS = 5 * 60 * 1000;
const FAILS_KEY = 'sf-hubpin-fails';
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPin(pin, saltB64) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: 150000, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}

export async function getHubPinSettings() {
  const s = await getSettings();
  return { salt: null, hash: null, protectWellbeing: false, ...(s.hubPin || {}) };
}

// Only from a non-wall device.
export async function setHubPin(pin) {
  if (isWall()) throw new Error('The hub PIN can only be set from your phone or PC.');
  if (!/^\d{4,6}$/.test(pin)) throw new Error('The PIN must be 4 to 6 digits.');
  const current = await getHubPinSettings();
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  await updateSettings({ hubPin: { ...current, salt, hash: await hashPin(pin, salt) } });
}
export async function setProtectWellbeing(on) {
  if (isWall()) throw new Error('This can only be changed from your phone or PC.');
  const current = await getHubPinSettings();
  await updateSettings({ hubPin: { ...current, protectWellbeing: !!on } });
}

// Which hubs need the PIN on this device.
export async function needsPin(hubId) {
  if (!isWall()) return false;
  if (hubId === 'settings') return true;
  if (hubId === 'wellbeing') return (await getHubPinSettings()).protectWellbeing;
  return false;
}

// ---------- Unlocked state (one hub at a time) ----------

let unlocked = null;
let idleTimer = null;
let onRelock = () => {};

function resetIdle() {
  clearTimeout(idleTimer);
  if (unlocked) idleTimer = setTimeout(() => { unlocked = null; onRelock(); }, IDLE_MS);
}
['pointerdown', 'keydown', 'scroll', 'wheel'].forEach((ev) =>
  document.addEventListener(ev, () => { if (unlocked) resetIdle(); }, { passive: true, capture: true }));

export const isUnlocked = (hubId) => unlocked === hubId;
// Called on every route change: leaving the unlocked hub locks it again.
export function noteRoute(hubId) {
  if (unlocked && unlocked !== hubId) { unlocked = null; clearTimeout(idleTimer); }
}
export function setRelockHandler(fn) { onRelock = fn; }

// ---------- Pause after wrong attempts (per device) ----------

function readFails() { try { return JSON.parse(localStorage.getItem(FAILS_KEY)) || { fails: 0, pausedUntil: 0 }; } catch { return { fails: 0, pausedUntil: 0 }; } }
function writeFails(v) { localStorage.setItem(FAILS_KEY, JSON.stringify(v)); }
const pausedLeft = () => Math.max(0, (readFails().pausedUntil || 0) - Date.now());

// ---------- PIN screen inside the hub area ----------

// Shows the PIN pad in `container`. Calls onUnlock() once the PIN is right.
export async function renderPinGate(container, hubId, title, onUnlock) {
  const cfg = await getHubPinSettings();
  if (!cfg.hash) {
    container.innerHTML = `<div class="card pin-gate"><h2 class="card-title">${esc(title)} is protected</h2>
      <p class="muted">Set a hub PIN in Settings, Wall display, on your phone or PC first.</p></div>`;
    return;
  }
  container.innerHTML = `
    <div class="card pin-gate">
      <h2 class="card-title">${esc(title)}</h2>
      <p class="muted small">Enter the PIN to open ${esc(title)}.</p>
      <div class="pin-dots hub-dots"></div>
      <p class="lock-msg" aria-live="polite"></p>
      <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
        <button type="button" data-k="del" aria-label="Delete">&#9003;</button><button type="button" data-k="0">0</button>
        <button type="button" data-k="ok" aria-label="Open">OK</button></div>
    </div>`;
  const dots = container.querySelector('.hub-dots');
  const msg = container.querySelector('.lock-msg');
  let pin = '';
  let timer = null;
  const draw = () => { dots.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join(''); };
  const showPause = () => {
    clearInterval(timer);
    const tick = () => {
      const left = pausedLeft();
      if (!left || !container.isConnected) { clearInterval(timer); if (container.isConnected) msg.textContent = ''; return; }
      msg.textContent = `Too many wrong PINs. Try again in ${Math.floor(left / 60000) ? `${Math.floor(left / 60000)} min ` : ''}${Math.ceil((left % 60000) / 1000)} s.`;
    };
    tick();
    timer = setInterval(tick, 1000);
  };
  if (pausedLeft()) showPause();

  const submit = async () => {
    if (pausedLeft()) { showPause(); pin = ''; draw(); return; }
    if (pin.length < 4) { msg.textContent = 'Enter 4 to 6 digits.'; return; }
    const ok = (await hashPin(pin, cfg.salt)) === cfg.hash;
    pin = '';
    if (ok) {
      clearInterval(timer);
      writeFails({ fails: 0, pausedUntil: 0 });
      unlocked = hubId;
      resetIdle();
      onUnlock();
      return;
    }
    const f = readFails();
    const fails = (f.fails || 0) + 1;
    if (fails >= MAX_FAILS) { writeFails({ fails: 0, pausedUntil: Date.now() + PAUSE_MS }); showPause(); }
    else { writeFails({ fails, pausedUntil: 0 }); msg.textContent = `Wrong PIN. ${MAX_FAILS - fails} ${MAX_FAILS - fails === 1 ? 'try' : 'tries'} left before a 5 minute pause.`; }
    dots.classList.add('shake');
    setTimeout(() => { dots.classList.remove('shake'); draw(); }, 400);
  };

  container.querySelector('.pin-pad').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (k === 'ok') { submit(); return; }
    else if (pin.length < 6) pin += k;
    draw();
  });
  draw();
}
