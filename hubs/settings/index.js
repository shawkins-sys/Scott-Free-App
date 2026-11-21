// Settings hub, on the hub bar on every page.
// Phase 3: choose slideshow photos from Google Photos.
// Later phases add home location, pay settings and so on.
import { supabase } from '../../core/supabase.js';
import { getSettings, updateSettings, esc } from '../../core/wellbeing.js';
import { formatDate } from '../../core/date.js';
import { googleConfigured, startGoogleSignIn, googleToken, clearGoogleToken, takeGoogleError } from '../../core/google.js';
import { resetPhotos } from '../../tiles/photos/index.js';
import { renderMusicSettings } from './music.js';
import { renderPhraseSettings } from './phrases.js';
import { renderHabitSettings } from './habits.js';
import { renderBackgroundSettings } from './background.js';
import { renderWallSettings } from './wall.js';
import { isWall } from '../../core/device.js';
import { getBreathingSettings, saveBreathingSettings } from '../../core/breathing.js';
import { biometricAvailable, biometricOn, enableBiometric, disableBiometric, changePin, lockNow, clearLock } from '../../core/applock.js';
import { signOut } from '../../core/auth.js';

const onSignOut = () => { clearLock(); signOut(); };

// App lock section: change PIN, fingerprint on/off, lock now. Per device.
async function renderLockSettings(body) {
  const canBio = await biometricAvailable();
  const draw = () => {
    body.innerHTML = `
      <p class="muted small">The app asks for your PIN${canBio ? ' or fingerprint' : ''} when it opens, and when you come back after more than a minute. This applies to this device only.</p>
      <div class="btn-row"><button class="pill-btn" data-act="change">Change PIN</button><button class="pill-btn" data-act="lock">Lock now</button></div>
      ${canBio ? `<label class="check lock-check"><input type="checkbox" name="bio"${biometricOn() ? ' checked' : ''}> Unlock with fingerprint</label>` : '<p class="muted small">Fingerprint unlock is not available on this device.</p>'}
      <p class="form-msg" aria-live="polite"></p>`;
  };
  draw();
  body.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'change') { await changePin({ onSignOut }); draw(); body.querySelector('.form-msg').textContent = 'PIN changed.'; }
    if (act.dataset.act === 'lock') await lockNow({ onSignOut });
  });
  body.addEventListener('change', async (e) => {
    if (e.target.name !== 'bio') return;
    const msg = body.querySelector('.form-msg');
    if (e.target.checked) {
      try { await enableBiometric(); msg.textContent = 'Fingerprint unlock is on.'; }
      catch { e.target.checked = false; msg.textContent = 'Fingerprint was not set up.'; }
    } else { disableBiometric(); msg.textContent = 'Fingerprint unlock is off. Your PIN still works.'; }
  });
}
import { renderPayIncomeSettings } from '../money/import.js';

const PICKER = 'https://photospicker.googleapis.com/v1';
const SESSION_KEY = 'sf-g-session';
const RESUME_KEY = 'sf-g-resume';
const BATCH = 5;
const RETURN_HASH = '#/hub/settings';

const safeId = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
const seconds = (d, fallback) => (parseFloat(d) || fallback);

async function picker(path, token, options = {}) {
  const res = await fetch(`${PICKER}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 401) { clearGoogleToken(); throw Object.assign(new Error('Google sign-in expired'), { code: 'auth' }); }
  if (!res.ok) throw new Error(`Picker ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function bucketNames() {
  const { data, error } = await supabase.storage.from('photos').list('', { limit: 500 });
  if (error) throw error;
  return (data || []).filter((f) => f.id).map((f) => f.name);
}

// Photos section: choose slideshow photos from Google Photos.
async function renderPhotosSettings(container) {
    container.innerHTML = `
      <div>
        <p class="muted small" id="ph-status">Loading...</p>
        <p class="muted small">Choose photos (or a whole album) from Google Photos. The app saves resized copies for the slideshow. Choosing again replaces the current set.</p>
        <div id="ph-action"></div>
        <p class="form-msg" id="ph-msg" aria-live="polite"></p>
      </div>`;

    const statusEl = container.querySelector('#ph-status');
    const actionEl = container.querySelector('#ph-action');
    const msg = container.querySelector('#ph-msg');
    let pollTimer = null;

    const say = (text, error = false) => {
      msg.textContent = text;
      msg.classList.toggle('error', error);
    };

    const showStatus = async () => {
      try {
        const [names, settings] = await Promise.all([bucketNames(), getSettings()]);
        const last = settings.photosImport;
        statusEl.textContent = `${names.length} photo${names.length === 1 ? '' : 's'} in the slideshow`
          + (last ? `. Last chosen ${formatDate(new Date(last.at))}.` : '.');
      } catch { statusEl.textContent = ''; }
    };

    const button = (label, onClick) => {
      actionEl.innerHTML = `<button class="primary-btn" type="button">${esc(label)}</button>`;
      actionEl.querySelector('button').addEventListener('click', onClick);
    };

    const fail = (err) => {
      console.error(err);
      clearTimeout(pollTimer);
      sessionStorage.removeItem(SESSION_KEY);
      say(err && err.code === 'auth'
        ? 'Google sign-in has expired. Please choose photos again.'
        : 'Something went wrong talking to Google Photos. Please try again.', true);
      button('Choose photos from Google Photos', begin);
    };

    // Step 1: make sure we have a Google token, then create a picker session.
    async function begin() {
      say('');
      const token = googleToken();
      if (!token) {
        sessionStorage.setItem(RESUME_KEY, '1');
        startGoogleSignIn(RETURN_HASH);
        return;
      }
      try {
        actionEl.innerHTML = '';
        say('Preparing Google Photos...');
        const s = await picker('/sessions', token, {
          method: 'POST',
          body: JSON.stringify({ pickingConfig: { maxItemCount: '200' } }),
        });
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: s.id, pickerUri: s.pickerUri }));
        offerOpen();
      } catch (err) { fail(err); }
    }

    // Step 2: opening Google Photos needs a tap, so the browser allows it.
    function offerOpen() {
      say('');
      button('Open Google Photos', () => {
        const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
        window.open(`${s.pickerUri}/autoclose`, '_blank');
        say('Select your photos in Google Photos, tap Done, then come back here.');
        actionEl.innerHTML = '';
        poll();
      });
    }

    // Step 3: wait until the selection is finished.
    async function poll() {
      clearTimeout(pollTimer);
      if (!container.isConnected) return;
      const token = googleToken();
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!token || !s) { fail(Object.assign(new Error('No token'), { code: 'auth' })); return; }
      try {
        const info = await picker(`/sessions/${s.id}`, token);
        if (info.mediaItemsSet) { await importSelection(token, s.id); return; }
        const wait = seconds(info.pollingConfig && info.pollingConfig.pollInterval, 5);
        pollTimer = setTimeout(poll, wait * 1000);
      } catch (err) { fail(err); }
    }
    const onVisible = () => {
      if (!container.isConnected) { document.removeEventListener('visibilitychange', onVisible); return; }
      if (document.visibilityState === 'visible' && sessionStorage.getItem(SESSION_KEY) && !actionEl.querySelector('button')) poll(); };
    document.addEventListener('visibilitychange', onVisible);

    // Step 4: copy the chosen photos into the bucket and remove the old set.
    async function importSelection(token, sessionId) {
      say('Reading your selection...');
      const items = [];
      let pageToken = '';
      do {
        const q = new URLSearchParams({ sessionId, pageSize: '100' });
        if (pageToken) q.set('pageToken', pageToken);
        const page = await picker(`/mediaItems?${q}`, token);
        items.push(...(page.mediaItems || []));
        pageToken = page.nextPageToken || '';
      } while (pageToken);

      const photos = items.filter((m) => m.type === 'PHOTO' && m.mediaFile && m.mediaFile.baseUrl);
      if (!photos.length) {
        say('No photos were selected (videos are skipped). Nothing has changed.');
        sessionStorage.removeItem(SESSION_KEY);
        button('Choose photos from Google Photos', begin);
        return;
      }

      const existing = await bucketNames();
      const keep = [];
      const todo = [];
      for (const p of photos) {
        const prefix = `gp-${safeId(p.id)}.`;
        const found = existing.find((n) => n.startsWith(prefix));
        if (found) keep.push(found); else todo.push({ id: p.id, baseUrl: p.mediaFile.baseUrl });
      }

      let failed = 0;
      for (let i = 0; i < todo.length; i += BATCH) {
        say(`Saving photos: ${Math.min(i + BATCH, todo.length)} of ${todo.length}...`);
        const { data, error } = await supabase.functions.invoke('photos-import', {
          body: { action: 'import', googleToken: token, items: todo.slice(i, i + BATCH) },
        });
        if (error) throw error;
        keep.push(...data.saved);
        failed += data.failed.length;
      }

      if (keep.length) {
        const remove = existing.filter((n) => !keep.includes(n));
        if (remove.length) {
          say('Removing the previous set...');
          const { error } = await supabase.functions.invoke('photos-import', { body: { action: 'remove', names: remove } });
          if (error) throw error;
        }
        await updateSettings({ photosImport: { at: new Date().toISOString(), count: keep.length } });
      }

      try { await picker(`/sessions/${sessionId}`, token, { method: 'DELETE' }); } catch { /* expires anyway */ }
      sessionStorage.removeItem(SESSION_KEY);
      resetPhotos();
      await showStatus();
      say(failed
        ? `Done. ${keep.length} saved, ${failed} could not be copied.`
        : `Done. ${keep.length} photo${keep.length === 1 ? '' : 's'} ready for the slideshow.`, failed > 0 && !keep.length);
      button('Choose photos from Google Photos', begin);
    }

    await showStatus();

    if (!googleConfigured()) {
      actionEl.innerHTML = '<p class="muted small">Google Photos is not connected yet. Follow docs/GOOGLE-PHOTOS-SETUP.md, then add the client ID to config.js.</p>';
      return;
    }

    const err = takeGoogleError();
    if (err) { say(err, true); sessionStorage.removeItem(RESUME_KEY); }

    // Pick up where we left off after the Google sign-in redirect or a reload.
    if (sessionStorage.getItem(SESSION_KEY) && googleToken()) {
      offerOpen();
      poll();
    } else if (sessionStorage.getItem(RESUME_KEY) && googleToken()) {
      sessionStorage.removeItem(RESUME_KEY);
      begin();
    } else {
      sessionStorage.removeItem(RESUME_KEY);
      button('Choose photos from Google Photos', begin);
    }
}

// Breathing section: vibration on or off.
async function renderBreathingSettings(body) {
  const s = await getBreathingSettings();
  body.innerHTML = `
    <p class="muted small">Box breathing runs after the check-in when emotional or work stress is 5, and any time from the Wellbeing hub.</p>
    <label class="check"><input type="checkbox" name="vibrate"${s.vibrate ? ' checked' : ''}> Gentle vibration at each step</label>
    <p class="form-msg" aria-live="polite"></p>`;
  body.querySelector('[name=vibrate]').addEventListener('change', async (e) => {
    const msg = body.querySelector('.form-msg');
    try { await saveBreathingSettings({ vibrate: e.target.checked }); msg.classList.remove('error'); msg.textContent = 'Saved.'; }
    catch { msg.classList.add('error'); msg.textContent = 'That did not save. Please try again.'; }
  });
}

// ---------- Settings page: collapsible sections, each loaded when first opened ----------

const SECTIONS = [
  { id: 'music', title: 'Morning music', render: renderMusicSettings,
    // Open automatically when coming back from Spotify.
    autoOpen: () => !!sessionStorage.getItem('sf-spotify-return') },
  { id: 'phrases', title: 'Daily phrases', render: renderPhraseSettings },
  { id: 'habits', title: 'Habits', render: renderHabitSettings },
  { id: 'background', title: 'Background', render: renderBackgroundSettings },
  { id: 'lock', title: 'App lock', render: renderLockSettings },
  { id: 'wall', title: 'Wall display', render: renderWallSettings },
  { id: 'breathing', title: 'Breathing', render: renderBreathingSettings },
  { id: 'pay', title: 'Pay and income', render: renderPayIncomeSettings },
  { id: 'photos', title: 'Photos', render: renderPhotosSettings,
    // Open automatically during the Google Photos flow.
    autoOpen: () => !!(sessionStorage.getItem('sf-g-resume') || sessionStorage.getItem('sf-g-session')) },
];

export default {
  id: 'settings',
  title: 'Settings',
  async render(container) {
    // A wall display has no money settings and no app lock.
    const sections = SECTIONS.filter((sec) => !(isWall() && (sec.id === 'pay' || sec.id === 'lock')));
    container.innerHTML = sections.map((sec) => `
      <details class="card set-sec" data-sec="${sec.id}">
        <summary class="set-head">${sec.title}</summary>
        <div class="set-body"></div>
      </details>`).join('') + `
      <p class="signout"><button class="link-btn" id="signout-btn">Sign out</button></p>`;
    // Sign out lives here (moved from Home, Scott 21/11/2026). Clears this device's app lock too.
    container.querySelector('#signout-btn').addEventListener('click', () => {
      if (!confirm('Sign out of Scott Hub on this device?')) return;
      clearLock();
      signOut();
    });

    for (const sec of sections) {
      const el = container.querySelector(`[data-sec="${sec.id}"]`);
      const body = el.querySelector('.set-body');
      let loaded = false;
      const load = () => {
        if (loaded) return;
        loaded = true;
        body.innerHTML = '<p class="muted small">Loading...</p>';
        Promise.resolve(sec.render(body)).catch((err) => {
          console.error(`Settings section ${sec.id} failed`, err);
          loaded = false;
          body.innerHTML = '<p class="muted small">Not available right now. Close and reopen to try again.</p>';
        });
      };
      el.addEventListener('toggle', () => { if (el.open) load(); });
      if (sec.autoOpen && sec.autoOpen()) el.open = true; // fires toggle, which loads it
    }
  },
};
