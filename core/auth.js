// Sign-in gate: email and password, then a 6-digit authenticator code.
// The first sign-in sets up the authenticator by QR code.
// Resolves only once the session is at MFA level (aal2).
import { CONFIG } from '../config.js';
import { supabase } from './supabase.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function screen(root, title, inner) {
  root.innerHTML = `
    <section class="auth">
      <h1>${esc(CONFIG.appName)}</h1>
      <p class="muted">${title}</p>
      <div class="card">${inner}</div>
    </section>`;
  return root.querySelector('.card');
}

function friendlyError(err) {
  const msg = (err && err.message) || '';
  if (/invalid login/i.test(msg)) return 'Email or password not recognised.';
  if (/invalid totp|code/i.test(msg)) return 'That code did not work. Try the latest one.';
  if (/network|fetch/i.test(msg)) return 'No connection. Check your signal and try again.';
  return 'Something went wrong. Please try again.';
}

function passwordStep(root) {
  return new Promise((resolve) => {
    const card = screen(root, 'Sign in to continue', `
      <form>
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <p class="form-msg" role="status"></p>
        <button class="primary-btn" type="submit">Sign in</button>
      </form>`);
    const form = card.querySelector('form');
    const msg = card.querySelector('.form-msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Signing in...';
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.value.trim(), password: form.password.value,
      });
      btn.disabled = false;
      if (error) { msg.className = 'form-msg error'; msg.textContent = friendlyError(error); return; }
      resolve();
    });
  });
}

function codeForm(intro) {
  return `
    ${intro}
    <form>
      <label class="field"><span>6-digit code</span>
        <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required>
      </label>
      <p class="form-msg" role="status"></p>
      <button class="primary-btn" type="submit">Verify</button>
    </form>`;
}

function wireCode(card, factorId, resolve) {
  const form = card.querySelector('form');
  const msg = card.querySelector('.form-msg');
  form.code.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Checking...';
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: form.code.value.trim() });
    btn.disabled = false;
    if (error) { msg.className = 'form-msg error'; msg.textContent = friendlyError(error); form.code.select(); return; }
    resolve();
  });
}

async function verifyStep(root, factorId) {
  return new Promise((resolve) => {
    const card = screen(root, 'Enter the code from your authenticator app', codeForm(''));
    wireCode(card, factorId, resolve);
  });
}

async function enrolStep(root) {
  // Clear any half-finished setup from an earlier attempt.
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of (list && list.all) || []) {
    if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: CONFIG.appName });
  if (error) throw error;
  const secret = String(data.totp.secret).replace(/[^A-Z2-7]/gi, '').toUpperCase();
  const grouped = secret.match(/.{1,4}/g).join(' ');
  return new Promise((resolve) => {
    const card = screen(root, 'Set up your authenticator', codeForm(`
      <p>On this phone: tap the button to add ${esc(CONFIG.appName)} to your authenticator app. On a computer: scan the QR code with your phone.</p>
      <a class="primary-btn center" href="${esc(data.totp.uri)}">Add to authenticator app</a>
      <div class="qr"><img alt="Authenticator QR code"></div>
      <p class="muted">Or enter this key manually (time based):</p>
      <p class="secret-key">${esc(grouped)}</p>
      <button type="button" class="pill-btn" data-copy>Copy key</button>
      <p class="muted">Then enter the 6-digit code it shows.</p>`));
    card.querySelector('.qr img').src = qrSrc(data.totp.qr_code);
    card.querySelector('[data-copy]').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(secret); e.target.textContent = 'Copied'; }
      catch { e.target.textContent = 'Copy failed, type it instead'; }
    });
    wireCode(card, data.id, resolve);
  });
}

// Supabase returns the QR as a raw (unencoded) SVG data URL, which browsers
// can refuse to show. Turn it into a safe image source.
function qrSrc(qr) {
  const s = String(qr || '');
  if (!s.startsWith('data:image/svg+xml') || s.includes(';base64,')) return s;
  let svg = s.slice(s.indexOf(',') + 1);
  try { svg = decodeURIComponent(svg); } catch { /* already raw */ }
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

// Main entry: resolves when fully signed in with MFA.
export async function requireAuth(root) {
  if (!supabase) {
    screen(root, 'Setup needed', `<p>Supabase is not connected yet. Add the project URL and anon key to <code>config.js</code> (see <code>docs/SUPABASE-SETUP.md</code>).</p>`);
    return new Promise(() => {}); // stay on this screen
  }

  for (;;) {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) { await passwordStep(root); continue; }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.currentLevel === 'aal2') return s.session;

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors && factors.totp && factors.totp[0];
    if (totp) await verifyStep(root, totp.id);
    else await enrolStep(root);
  }
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  location.reload();
}
