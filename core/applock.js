// App lock: 4-digit PIN, plus fingerprint where the device supports it
// (WebAuthn platform authenticator: the fingerprint never leaves the phone).
// Per device. Asked when the app opens and when it comes back after more
// than a minute away. 5 wrong PINs pause entry for 5 minutes.
// The PIN is stored only as a salted PBKDF2 hash in this device's storage.

const KEY = 'sf-lock';
const AWAY_KEY = 'sf-away-at';
const AWAY_LIMIT_MS = 60 * 1000;
const MAX_FAILS = 5;
const PAUSE_MS = 5 * 60 * 1000;
const PIN_LENGTH = 4;

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function write(v) { localStorage.setItem(KEY, JSON.stringify(v)); }

export const lockConfigured = () => !!(read() && read().hash);
export function clearLock() { localStorage.removeItem(KEY); localStorage.removeItem(AWAY_KEY); }

async function hashPin(pin, saltB64) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: 150000, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}

export async function setPin(pin) {
  const cfg = read() || {};
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  write({ ...cfg, salt, hash: await hashPin(pin, salt), fails: 0, pausedUntil: 0 });
}

async function checkPin(pin) {
  const cfg = read();
  return !!cfg && (await hashPin(pin, cfg.salt)) === cfg.hash;
}

// ---------- Fingerprint (WebAuthn) ----------

export async function biometricAvailable() {
  try {
    return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}
export const biometricOn = () => !!(read() && read().credId);

export async function enableBiometric() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Scott Hub' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'scott-free-lock', displayName: 'Scott Hub app lock' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000,
  } });
  write({ ...read(), credId: b64(cred.rawId) });
}
export function disableBiometric() { const c = read(); if (c) { delete c.credId; write(c); } }

async function checkBiometric() {
  const cfg = read();
  await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: 'public-key', id: unb64(cfg.credId), transports: ['internal'] }],
    userVerification: 'required',
    timeout: 60000,
  } });
  return true; // the browser only resolves after the fingerprint (or device lock) is verified
}

// ---------- Screens ----------

function keypad() {
  return `<div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
    <span></span><button type="button" data-k="0">0</button><button type="button" data-k="del" aria-label="Delete">&#9003;</button></div>`;
}

function screen(html) {
  // A fresh element each time, so old keypad listeners end with the old screen.
  const old = document.getElementById('app-lock');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'app-lock';
  document.body.appendChild(el);
  el.innerHTML = `<div class="lock-inner">${html}</div>`;
  document.body.classList.add('app-locked');
  return el;
}
function closeScreen() {
  const el = document.getElementById('app-lock');
  if (el) el.remove();
  document.body.classList.remove('app-locked');
}

// Reads a PIN from the keypad. onFull(pin) returns true to finish, or a message to show.
function pinEntry(el, onFull) {
  let pin = '';
  const dots = el.querySelector('.pin-dots');
  const msg = el.querySelector('.lock-msg');
  const draw = () => { dots.innerHTML = Array.from({ length: PIN_LENGTH }, (_, i) => `<span class="${i < pin.length ? 'on' : ''}"></span>`).join(''); };
  const press = async (k) => {
    if (k === 'del') pin = pin.slice(0, -1);
    else if (pin.length < PIN_LENGTH) pin += k;
    draw();
    if (pin.length === PIN_LENGTH) {
      const entered = pin;
      pin = '';
      const r = await onFull(entered);
      if (r !== true) { msg.textContent = r || ''; dots.classList.add('shake'); setTimeout(() => { dots.classList.remove('shake'); draw(); }, 400); }
    }
  };
  el.querySelector('.pin-pad').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  const onKey = (e) => { if (!el.isConnected) { document.removeEventListener('keydown', onKey); return; } if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') press('del'); };
  document.addEventListener('keydown', onKey);
  draw();
}

// First run on this device: choose a PIN (twice), then offer fingerprint.
function setupLock() {
  return new Promise((resolve) => {
    let first = null;
    const ask = (title) => {
      const el = screen(`<h1 class="lock-title">${title}</h1><p class="muted small">This PIN unlocks Scott Hub on this device.</p>
        <div class="pin-dots"></div><p class="lock-msg" aria-live="polite"></p>${keypad()}`);
      pinEntry(el, async (pin) => {
        if (!first) { first = pin; ask('Enter it again'); return true; }
        if (pin !== first) { first = null; setTimeout(() => ask('Choose a 4-digit PIN'), 600); return 'Those did not match. Please start again.'; }
        await setPin(pin);
        if (!biometricOn() && await biometricAvailable()) offerBiometric(); else { closeScreen(); resolve(); }
        return true;
      });
    };
    const offerBiometric = () => {
      const el = screen(`<h1 class="lock-title">Use your fingerprint?</h1><p class="muted small">Unlock with your fingerprint, with the PIN as a backup.</p>
        <div class="btn-row lock-btns"><button class="primary-btn" data-yes>Use fingerprint</button><button class="link-btn" data-no>Not now</button></div>
        <p class="lock-msg" aria-live="polite"></p>`);
      el.querySelector('[data-yes]').addEventListener('click', async () => {
        try { await enableBiometric(); closeScreen(); resolve(); }
        catch { el.querySelector('.lock-msg').textContent = 'Fingerprint was not set up. You can turn it on later in Settings.'; }
      });
      el.querySelector('[data-no]').addEventListener('click', () => { closeScreen(); resolve(); });
    };
    ask('Choose a 4-digit PIN');
  });
}

// Lock screen: fingerprint (if on) and PIN. Resolves when unlocked.
function unlock({ onSignOut }) {
  return new Promise((resolve) => {
    const el = screen(`<h1 class="lock-title">Scott Hub</h1><p class="muted small">Enter your PIN${biometricOn() ? ' or use your fingerprint' : ''}</p>
      <div class="pin-dots"></div><p class="lock-msg" aria-live="polite"></p>${keypad()}
      ${biometricOn() ? '<button class="pill-btn lock-bio" type="button">Use fingerprint</button>' : ''}
      <button class="link-btn lock-forgot" type="button">Forgot PIN? Sign out</button>`);
    const msg = el.querySelector('.lock-msg');
    const done = () => { const c = read(); write({ ...c, fails: 0, pausedUntil: 0 }); closeScreen(); resolve(); };

    const pausedLeft = () => Math.max(0, (read().pausedUntil || 0) - Date.now());
    let timer = null;
    const showPause = () => {
      clearInterval(timer);
      const tick = () => {
        const left = pausedLeft();
        if (!left) { clearInterval(timer); msg.textContent = ''; return; }
        const m = Math.floor(left / 60000);
        const s = Math.ceil((left % 60000) / 1000);
        msg.textContent = `Too many wrong PINs. Try again in ${m ? `${m} min ` : ''}${s} s.`;
      };
      tick();
      timer = setInterval(tick, 1000);
    };
    if (pausedLeft()) showPause();

    pinEntry(el, async (pin) => {
      if (pausedLeft()) { showPause(); return msg.textContent; }
      if (await checkPin(pin)) { clearInterval(timer); done(); return true; }
      const c = read();
      const fails = (c.fails || 0) + 1;
      if (fails >= MAX_FAILS) { write({ ...c, fails: 0, pausedUntil: Date.now() + PAUSE_MS }); showPause(); return msg.textContent; }
      write({ ...c, fails });
      return `Wrong PIN. ${MAX_FAILS - fails} ${MAX_FAILS - fails === 1 ? 'try' : 'tries'} left before a 5 minute pause.`;
    });

    const tryBio = async () => { try { if (await checkBiometric()) { clearInterval(timer); done(); } } catch { /* cancelled: use the PIN */ } };
    const bio = el.querySelector('.lock-bio');
    if (bio) { bio.addEventListener('click', tryBio); tryBio(); }
    el.querySelector('.lock-forgot').addEventListener('click', () => {
      if (window.confirm('Sign out? You will sign in again with your password and authenticator code, then choose a new PIN.')) { clearLock(); onSignOut(); }
    });
  });
}

// ---------- Wiring ----------

let unlocking = null;

// Call after sign-in, before showing anything: sets up or asks for the lock.
export async function ensureUnlocked({ onSignOut }) {
  if (unlocking) return unlocking;
  unlocking = (lockConfigured() ? unlock({ onSignOut }) : setupLock()).finally(() => { unlocking = null; });
  return unlocking;
}

// Locks again when the app comes back after more than a minute away.
export function watchAway({ onSignOut }) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { localStorage.setItem(AWAY_KEY, String(Date.now())); return; }
    const away = Date.now() - Number(localStorage.getItem(AWAY_KEY) || Date.now());
    if (lockConfigured() && away > AWAY_LIMIT_MS) ensureUnlocked({ onSignOut });
  });
}

export function lockNow({ onSignOut }) { return ensureUnlocked({ onSignOut }); }

// Change PIN: confirm the current PIN (or fingerprint) first, then choose a new one.
export async function changePin({ onSignOut }) {
  await unlock({ onSignOut });
  await setupLock();
}
