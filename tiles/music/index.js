// Music tile: control Spotify from Home.
// One row: small artwork, song and artist, previous / play-pause / next, plus
// "Open Spotify". Nothing playing: the same controls, where Play resumes the
// last Spotify session if Spotify is open on a device. Expanded view is the
// same at a larger size. Waits for the morning check-in, like Photos.
// Refreshes every 10 seconds while on screen and the app is visible.
import { spotifyConfigured, spotifyNow, spotifyControl } from '../../core/spotify.js';
import { getTodayCheckin, checkinDoneToday, esc } from '../../core/wellbeing.js';
import { appLinkHtml } from '../../core/applink.js';

const REFRESH_MS = 10 * 1000;
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
    <p class="muted small mu-msg" aria-live="polite"></p>${appLinkHtml('spotify', 'Open Spotify')}</div>`;
  const main = container.querySelector('.mu-main');
  const msgEl = container.querySelector('.mu-msg');
  let now = null;
  let drawn = false;
  let timer = null;
  const say = (t) => { msgEl.textContent = t || ''; };

  const draw = () => {
    const playing = !!(now && now.playing);
    main.innerHTML = `
      <div class="mu-row">
        ${now && now.art ? `<img class="mu-art" src="${esc(now.art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="mu-art mu-art-empty"></div>'}
        <div class="mu-meta">
          <span class="mu-track">${now ? esc(now.track || 'Unknown') : 'Nothing playing'}</span>
          ${now && now.artist ? `<span class="muted small mu-artist">${esc(now.artist)}</span>` : ''}
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
    if (drawn && JSON.stringify(now) === was) return;
    drawn = true;
    draw();
  };

  container.addEventListener('click', async (e) => {
    const cmd = e.target.closest('[data-cmd]');
    if (!cmd) return;
    say('');
    if (now && (cmd.dataset.cmd === 'play' || cmd.dataset.cmd === 'pause')) { now.playing = cmd.dataset.cmd === 'play'; draw(); }
    const r = await spotifyControl(cmd.dataset.cmd);
    if (r.result === 'nodevice') say('Spotify is not open on any device. Open it, then try again.');
    else if (r.result !== 'ok') say('That did not work. Please try again.');
    setTimeout(refresh, 800);
  });

  const tick = () => {
    if (!container.isConnected) { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); return; }
    if (!document.hidden) refresh();
  };
  const onVis = () => { if (!document.hidden) tick(); };
  timer = setInterval(tick, REFRESH_MS);
  document.addEventListener('visibilitychange', onVis);
  await refresh();
}

export default {
  id: 'music',
  title: 'Music',
  defaultSize: { phone: { w: 4, h: 2 }, desktop: { w: 6, h: 2 } },
  render(container) { return startView(container, false); },
  renderExpanded(container) { return startView(container, true); },
};
