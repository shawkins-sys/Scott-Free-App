// Settings: Morning music. Spotify connection, speaker choice and home location.
// Playlists are added in Phase 7 part B.
import { spotifyConfigured, startSpotifyConnect, finishSpotifyConnect, spotifyStatus, spotifyDevices,
  spotifyDisconnect, getMusicSettings, saveMusicSettings, currentPosition } from '../../core/spotify.js';
import { formatDate } from '../../core/date.js';
import { esc } from '../../core/wellbeing.js';

export async function renderMusicSettings(card) {
  card.innerHTML = `
    <h2 class="card-title">Morning music</h2>
    <div id="mu-spotify"><p class="muted small">Loading...</p></div>
    <div id="mu-speaker"></div>
    <div id="mu-home"></div>
    <div id="mu-playlists"></div>
    <p class="form-msg" id="mu-msg" aria-live="polite"></p>`;
  const msg = card.querySelector('#mu-msg');
  const say = (t, err = false) => { msg.textContent = t; msg.classList.toggle('error', err); };

  if (!spotifyConfigured()) {
    card.querySelector('#mu-spotify').innerHTML = '<p class="muted small">Spotify is not set up yet. Follow docs/SPOTIFY-SETUP.md, then add the client ID to config.js.</p>';
    return;
  }

  // Finish a connection if we have just come back from Spotify.
  const back = await finishSpotifyConnect().catch(() => ({ error: 'Spotify did not connect. Please try again.' }));
  if (back) say(back.ok || back.error, !!back.error);

  const settings = await getMusicSettings();

  // ---------- Spotify connection ----------
  const spotifyEl = card.querySelector('#mu-spotify');
  const drawSpotify = async () => {
    const s = await spotifyStatus();
    if (s.connected) {
      spotifyEl.innerHTML = `
        <p class="small">Spotify connected on ${formatDate(new Date(s.authorisedAt))}.
          ${s.reconnectSoon ? `<strong>Reconnect before ${formatDate(new Date(s.expiresAt))}</strong> (Spotify asks every six months).` : `Reconnect by ${formatDate(new Date(s.expiresAt))}.`}</p>
        <div class="btn-row"><button class="pill-btn" data-act="reconnect">Reconnect Spotify</button>
          <button class="link-btn" data-act="disconnect">Disconnect</button></div>`;
    } else if (s.expired) {
      spotifyEl.innerHTML = `
        <p class="small">Spotify needs reconnecting (it asks every six months).</p>
        <button class="primary-btn" data-act="reconnect">Reconnect Spotify</button>`;
    } else {
      spotifyEl.innerHTML = `
        <p class="small muted">Connect your Spotify Premium account so music can start after your check-in.</p>
        <button class="primary-btn" data-act="reconnect">Connect Spotify</button>`;
    }
  };
  spotifyEl.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'reconnect') { await startSpotifyConnect(); return; }
    if (act.dataset.act === 'disconnect' && window.confirm('Disconnect Spotify? Morning music will stop until you connect again.')) {
      await spotifyDisconnect();
      say('Spotify disconnected.');
      drawSpotify();
    }
  });

  // ---------- Speaker ----------
  const speakerEl = card.querySelector('#mu-speaker');
  const drawSpeaker = () => {
    speakerEl.innerHTML = `
      <h3 class="w-head">Home speaker</h3>
      <p class="small">${settings.speakerName ? `Sonos: <strong>${esc(settings.speakerName)}</strong>` : '<span class="muted">No speaker chosen yet.</span>'}</p>
      <button class="pill-btn" data-act="find">${settings.speakerName ? 'Change speaker' : 'Choose speaker'}</button>
      <ul class="row-list" id="mu-devices"></ul>`;
  };
  speakerEl.addEventListener('click', async (e) => {
    const find = e.target.closest('[data-act=find]');
    const pick = e.target.closest('[data-device]');
    const list = speakerEl.querySelector('#mu-devices');
    if (find) {
      list.innerHTML = '<li class="muted small">Looking for devices...</li>';
      const r = await spotifyDevices();
      if (r.result === 'reconnect') { list.innerHTML = '<li class="muted small">Connect Spotify first.</li>'; return; }
      const devices = r.devices || [];
      list.innerHTML = devices.length
        ? devices.map((d) => `<li><button class="row-btn" data-device="${esc(d.id)}" data-name="${esc(d.name)}">
            <span>${esc(d.name)} <span class="muted small">${esc(d.type)}</span></span><span class="muted small">Choose</span></button></li>`).join('')
        : '<li class="muted small">No devices found. Open Spotify and play something on the Sonos once, then try again.</li>';
      return;
    }
    if (pick) {
      settings.speakerId = pick.dataset.device;
      settings.speakerName = pick.dataset.name;
      try { await saveMusicSettings({ speakerId: settings.speakerId, speakerName: settings.speakerName }); say(`Speaker set to ${settings.speakerName}.`); }
      catch { say('That did not save. Please try again.', true); }
      drawSpeaker();
    }
  });

  // ---------- Home location ----------
  const homeEl = card.querySelector('#mu-home');
  const drawHome = () => {
    homeEl.innerHTML = `
      <h3 class="w-head">Home location</h3>
      <p class="small">${settings.home ? `Set on ${formatDate(new Date(settings.home.at))}. Music plays on the speaker within about 150m of it.` : '<span class="muted">Not set. Music will ask "Speaker or phone?" until it is.</span>'}</p>
      <button class="pill-btn" data-act="home">Use my current location as home</button>`;
  };
  homeEl.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-act=home]')) return;
    say('Finding your location...');
    const p = await currentPosition(15000);
    if (!p) { say('Location is not available. Check that location is allowed for this app.', true); return; }
    settings.home = { lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5, at: new Date().toISOString() };
    try {
      await saveMusicSettings({ home: settings.home });
      say(p.accuracy > 100 ? `Home saved (accuracy about ${Math.round(p.accuracy)}m, so try again outdoors or with Wi-Fi on if it seems off).` : 'Home location saved.');
    } catch { say('That did not save. Please try again.', true); }
    drawHome();
  });

  drawSpeaker();
  drawHome();
  await drawSpotify();
}
