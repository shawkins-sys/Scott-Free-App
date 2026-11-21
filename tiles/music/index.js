// Music tile: control Spotify from Home.
// Playing or paused: artwork, song, artist, previous / play-pause / next, and
// the device (tap to switch). Nothing active: your playlists, tap to start
// (random track, shuffle, 20%). Waits for the morning check-in, like Photos.
// Refreshes every 10 seconds while on screen and the app is visible.
import {
  spotifyConfigured, spotifyNow, spotifyControl, spotifyTransfer, spotifyDevices, spotifyPlay,
} from '../../core/spotify.js';
import { listPlaylists, playlistId, openUrl } from '../../core/music.js';
import { getTodayCheckin, checkinDoneToday, esc } from '../../core/wellbeing.js';

const REFRESH_MS = 10 * 1000;
const ICON = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6v12M18 6l-8 6 8 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 6v12M6 6l8 6-8 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
};

let playlistsCache = null;
const getPlaylists = async () => {
  if (!playlistsCache) playlistsCache = listPlaylists().catch(() => { playlistsCache = null; return []; });
  return playlistsCache;
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
    <p class="muted small mu-msg" aria-live="polite"></p>${full ? '<div class="mu-devs"></div>' : ''}</div>`;
  const main = container.querySelector('.mu-main');
  const msgEl = container.querySelector('.mu-msg');
  let now = null;
  let busy = false;
  let drawn = false;
  let timer = null;
  const say = (t) => { msgEl.textContent = t || ''; };

  const drawNow = () => {
    main.innerHTML = `
      <div class="mu-now">
        ${now.art ? `<img class="mu-art" src="${esc(now.art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="mu-art mu-art-empty"></div>'}
        <div class="mu-meta">
          <span class="mu-track">${esc(now.track || 'Unknown')}</span>
          <span class="muted small mu-artist">${esc(now.artist || '')}</span>
          ${now.device ? `<button class="link-btn mu-device" data-act="devices">On ${esc(now.device.name)}</button>` : ''}
        </div>
      </div>
      <div class="mu-controls">
        <button class="mu-btn" data-cmd="previous" aria-label="Previous">${ICON.prev}</button>
        <button class="mu-btn mu-main-btn" data-cmd="${now.playing ? 'pause' : 'play'}" aria-label="${now.playing ? 'Pause' : 'Play'}">${now.playing ? ICON.pause : ICON.play}</button>
        <button class="mu-btn" data-cmd="next" aria-label="Next">${ICON.next}</button>
      </div>
      <ul class="row-list mu-devlist" hidden></ul>`;
  };

  const drawIdle = async () => {
    const lists = await getPlaylists();
    if (!container.isConnected) return;
    main.innerHTML = lists.length
      ? `<p class="muted small">Nothing playing. Start a playlist:</p>
         <div class="mu-chips">${lists.map((p) => `<button class="chip" data-pl="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>`
      : '<p class="muted">Nothing playing. Add playlists in Settings, Morning music.</p>';
  };

  const drawDevicesInto = async (ul) => {
    ul.hidden = false;
    ul.innerHTML = '<li class="muted small">Looking for devices...</li>';
    const r = await spotifyDevices();
    const devs = (r.devices || []).filter((d) => !d.restricted);
    ul.innerHTML = devs.length
      ? devs.map((d) => `<li><button class="row-btn" data-dev="${esc(d.id)}" data-name="${esc(d.name)}">
          <span>${esc(d.name)} <span class="muted small">${esc(d.type)}</span></span>
          <span class="muted small">${d.active ? 'Playing here' : 'Switch'}</span></button></li>`).join('')
      : '<li class="muted small">No devices found. Open Spotify on a device first.</li>';
  };

  const refresh = async () => {
    if (busy || !container.isConnected) return;
    const r = await spotifyNow();
    if (!container.isConnected) return;
    if (r.result === 'reconnect') { main.innerHTML = '<p class="muted">Connect Spotify in Settings, Morning music.</p>'; return; }
    if (r.result !== 'ok') { if (!now) main.innerHTML = '<p class="muted">Music is not available right now.</p>'; return; }
    const was = JSON.stringify(now);
    now = r.now && r.now.track ? r.now : null;
    if (drawn && JSON.stringify(now) === was) return;
    drawn = true;
    if (now) drawNow(); else await drawIdle();
    const devs = container.querySelector('.mu-devs');
    if (devs && !devs.dataset.drawn) {
      devs.dataset.drawn = '1';
      devs.innerHTML = '<h3 class="w-head">Devices</h3><ul class="row-list"></ul>';
      drawDevicesInto(devs.querySelector('ul'));
    }
  };

  const soon = (ms = 800) => setTimeout(refresh, ms);

  container.addEventListener('click', async (e) => {
    const cmd = e.target.closest('[data-cmd]');
    const pl = e.target.closest('[data-pl]');
    const dev = e.target.closest('[data-dev]');
    const showDevs = e.target.closest('[data-act=devices]');
    if (cmd) {
      say('');
      if (now && (cmd.dataset.cmd === 'play' || cmd.dataset.cmd === 'pause')) { now.playing = cmd.dataset.cmd === 'play'; drawNow(); }
      const r = await spotifyControl(cmd.dataset.cmd);
      if (r.result === 'nodevice') say('Spotify is not open on any device. Open it, then try again.');
      else if (r.result !== 'ok') say('That did not work. Please try again.');
      soon();
      return;
    }
    if (showDevs) { await drawDevicesInto(container.querySelector('.mu-devlist')); return; }
    if (dev) {
      say(`Switching to ${dev.dataset.name}...`);
      const r = await spotifyTransfer(dev.dataset.dev);
      say(r.result === 'ok' ? '' : 'Could not switch. Please try again.');
      const ul = dev.closest('ul');
      if (ul && ul.classList.contains('mu-devlist')) ul.hidden = true;
      soon(1200);
      if (full) setTimeout(() => drawDevicesInto(container.querySelector('.mu-devs ul')), 1500);
      return;
    }
    if (pl) {
      const p = (await getPlaylists()).find((x) => x.id === pl.dataset.pl);
      if (!p) return;
      busy = true;
      say(`Starting ${p.name}...`);
      const r = await spotifyPlay({ playlistUri: `spotify:playlist:${playlistId(p.spotify_url)}`, target: 'phone' });
      busy = false;
      if (r.result === 'playing') { say(''); soon(1500); }
      else if (r.result === 'open') {
        say('');
        main.insertAdjacentHTML('beforeend', `<p class="small">Spotify is not open on your phone. <a href="${openUrl(p)}" target="_blank" rel="noopener">Open in Spotify</a></p>`);
      } else if (r.result === 'reconnect') say('Connect Spotify in Settings, Morning music.');
      else say('That did not work. Please try again.');
    }
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
  defaultSize: { phone: { w: 4, h: 3 }, desktop: { w: 6, h: 3 } },
  render(container) { return startView(container, false); },
  renderExpanded(container) { return startView(container, true); },
};
