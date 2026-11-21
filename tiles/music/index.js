// Music tile: control Spotify from Home.
// One row: small artwork, song and artist, previous / play-pause / next, plus
// "Open Spotify". Nothing playing: shows the last played track. Play resumes
// it on any open Spotify device; if none is open, opens the Spotify app and
// starts the track on the phone when Scott comes back. Expanded view is the
// same at a larger size. Waits for the morning check-in, like Photos.
// Refreshes every 10 seconds while on screen and the app is visible.
import { spotifyConfigured, spotifyNow, spotifyControl, spotifyRecent, spotifyResume } from '../../core/spotify.js';
import { getTodayCheckin, checkinDoneToday, esc } from '../../core/wellbeing.js';
import { appLinkHtml, appLink } from '../../core/applink.js';

const REFRESH_MS = 10 * 1000;
const PENDING_KEY = 'sf-music-resume'; // sessionStorage: track to start on return from Spotify
const PENDING_MAX_MS = 5 * 60 * 1000;
const ICON = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6v12M18 6l-8 6 8 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 6v12M6 6l8 6-8 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
};

async function startView(container, full) {
  if (!spotifyConfigured()) { container.innerHTML = '<p class="muted">Spotify is not set up yet.</p>'; return; }
  try { await getTodayCheckin(); } catch { /* treated as not done */ }
  if (!checkinDoneToday()) {
    container.innerHTML = '<p class="muted">Music will appear after this morning\'s check-in.</p>';
    window.addEventListener('sf:checkin-done', () => { if (container.isConnected) startView(container, full); }, { once: true });
    return;
  }

  container.innerHTML = `<div class="mu-tile${full ? ' full' : ''}"><div class="mu-main"><p class="muted">Loading music...</p></div>
    ${appLinkHtml('spotify', 'Open Spotify')}<p class="muted small mu-msg" aria-live="polite"></p></div>`;
  const main = container.querySelector('.mu-main');
  const msgEl = container.querySelector('.mu-msg');
  let now = null;
  let recent = null;
  let recentLoaded = false;
  let drawn = false;
  let timer = null;
  const say = (t) => { msgEl.textContent = t || ''; };

  const draw = () => {
    const playing = !!(now && now.playing);
    const show = now || recent;
    main.innerHTML = `
      <div class="mu-row">
        ${show && show.art ? `<img class="mu-art" src="${esc(show.art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="mu-art mu-art-empty"></div>'}
        <div class="mu-meta">
          ${!now && recent ? '<span class="muted small">Last played</span>' : ''}
          <span class="mu-track">${show ? esc(show.track || 'Unknown') : 'Nothing playing'}</span>
          ${show && show.artist ? `<span class="muted small mu-artist">${esc(show.artist)}</span>` : ''}
        </div>
        <div class="mu-controls">
          <button class="mu-btn" data-cmd="previous" aria-label="Previous">${ICON.prev}</button>
          <button class="mu-btn mu-main-btn" data-cmd="${playing ? 'pause' : 'play'}" aria-label="${playing ? 'Pause' : 'Play'}">${playing ? ICON.pause : ICON.play}</button>
          <button class="mu-btn" data-cmd="next" aria-label="Next">${ICON.next}</button>
        </div>
      </div>`;
  };

  const refresh = async () => {
    if (!container.isConnected) return;
    const r = await spotifyNow();
    if (!container.isConnected) return;
    if (r.result === 'reconnect') { main.innerHTML = '<p class="muted">Connect Spotify in Settings, Morning music.</p>'; drawn = false; return; }
    if (r.result !== 'ok') { if (!drawn) main.innerHTML = '<p class="muted">Music is not available right now.</p>'; return; }
    const was = JSON.stringify(now);
    now = r.now && r.now.track ? r.now : null;
    if (!now && !recentLoaded) {
      recentLoaded = true;
      const rr = await spotifyRecent();
      if (rr.result === 'ok') recent = rr.recent;
      else if (rr.result === 'scope') say('Reconnect Spotify in Settings, Morning music, to show your last played track.');
      if (!container.isConnected) return;
      drawn = false;
    }
    if (drawn && JSON.stringify(now) === was) return;
    drawn = true;
    draw();
  };

  // Start a track; if no Spotify device is open, open the app and finish on return.
  const resume = async (t) => {
    say('Starting...');
    const r = await spotifyResume(t);
    if (r.result === 'playing') { say(''); setTimeout(refresh, 1200); return; }
    if (r.result === 'open') {
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ t, at: Date.now() })); } catch { /* ignore */ }
      say('Opening Spotify. Come back here and it will start playing.');
      window.location.href = appLink('spotify');
      return;
    }
    say('That did not work. Please try again.');
  };

  // Back from Spotify: start the saved track. The phone can take a few seconds
  // to appear as a Spotify device, so try up to three times.
  const finishPending = async () => {
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch { /* ignore */ }
    if (!pending) return;
    sessionStorage.removeItem(PENDING_KEY);
    if (Date.now() - pending.at > PENDING_MAX_MS) { say(''); return; }
    say('Starting...');
    for (let i = 0; i < 3; i += 1) {
      const r = await spotifyResume(pending.t);
      if (!container.isConnected) return;
      if (r.result === 'playing') { say(''); setTimeout(refresh, 1200); return; }
      await new Promise((res) => setTimeout(res, 2000));
    }
    say('Spotify did not start. Tap Play to try again.');
  };

  container.addEventListener('click', async (e) => {
    const cmd = e.target.closest('[data-cmd]');
    if (!cmd) return;
    say('');
    if (cmd.dataset.cmd === 'play' && !now && recent && recent.uri) { await resume(recent); return; }
    if (now && (cmd.dataset.cmd === 'play' || cmd.dataset.cmd === 'pause')) { now.playing = cmd.dataset.cmd === 'play'; draw(); }
    const r = await spotifyControl(cmd.dataset.cmd);
    if (r.result === 'nodevice') {
      const t = (now && now.uri) ? now : recent;
      if (cmd.dataset.cmd === 'play' && t && t.uri) { await resume(t); return; }
      say('Spotify is not open on any device. Open it, then try again.');
    } else if (r.result !== 'ok') say('That did not work. Please try again.');
    setTimeout(refresh, 800);
  });

  const tick = () => {
    if (!container.isConnected) { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); return; }
    if (!document.hidden) refresh();
  };
  const onVis = () => { if (!document.hidden) { finishPending(); tick(); } };
  timer = setInterval(tick, REFRESH_MS);
  document.addEventListener('visibilitychange', onVis);
  await refresh();
  finishPending(); // in case the app was reloaded on the way back from Spotify
}

export default {
  id: 'music',
  title: 'Music',
  defaultSize: { phone: { w: 4, h: 2 }, desktop: { w: 6, h: 2 } },
  render(container) { return startView(container, false); },
  renderExpanded(container) { return startView(container, true); },
};
