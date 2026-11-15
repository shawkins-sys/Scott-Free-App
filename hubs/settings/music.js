// Settings: Morning music. Spotify connection, speaker choice and home location.
import { spotifyConfigured, startSpotifyConnect, finishSpotifyConnect, spotifyStatus, spotifyDevices,
  spotifyDisconnect, getMusicSettings, saveMusicSettings, currentPosition } from '../../core/spotify.js';
import { formatDate } from '../../core/date.js';
import { esc } from '../../core/wellbeing.js';
import { listPlaylists, savePlaylist, deletePlaylist, playlistId, MAX_PLAYLISTS } from '../../core/music.js';

// ---------- Playlists (up to 10, each tagged with the moods it suits) ----------

async function renderPlaylists(el) {
  let items = [];
  let editing = null; // playlist being edited, or 'new'

  const moodChips = (sel) => [1, 2, 3, 4, 5].map((n) => `
    <button type="button" class="dot dot-${n} mood-chip${sel.includes(n) ? ' selected' : ''}" data-mood="${n}" aria-pressed="${sel.includes(n)}" aria-label="Mood ${n}"><span>${n}</span></button>`).join('');

  const formHtml = (p) => `
    <form class="pl-form">
      <label class="field"><span>Name</span><input name="name" maxlength="40" required value="${esc(p ? p.name : '')}" placeholder="e.g. Calm start"></label>
      <label class="field"><span>Spotify playlist link</span><input name="link" maxlength="300" required value="${esc(p ? p.spotify_url : '')}" placeholder="Share, Copy link in Spotify, then paste"></label>
      <div class="field"><span>Moods it suits (tap all that apply)</span><div class="dots mood-row">${moodChips(p ? p.moods || [] : [])}</div></div>
      <p class="form-msg" aria-live="polite"></p>
      <div class="btn-row"><button class="primary-btn" type="submit">${p ? 'Save' : 'Add playlist'}</button><button class="link-btn" type="button" data-cancel>Cancel</button></div>
    </form>`;

  const draw = () => {
    el.innerHTML = `
      <h3 class="w-head">Playlists (${items.length} of ${MAX_PLAYLISTS})</h3>
      <p class="muted small">After the check-in, one playlist tagged with today's mood is picked at random. If none match, the nearest mood is used.</p>
      <ul class="row-list">${items.map((p) => editing && editing.id === p.id ? `<li>${formHtml(p)}</li>` : `
        <li class="cat-row" data-id="${p.id}"><span>${esc(p.name)}<span class="block mood-mini">${(p.moods || []).sort().map((m) => `<span class="dot dot-${m} mini"><span>${m}</span></span>`).join('') || '<span class="muted small">No moods tagged</span>'}</span></span>
          <span class="phrase-actions"><button class="link-btn" data-act="edit">Edit</button><button class="link-btn" data-act="delete">Delete</button></span></li>`).join('')}</ul>
      ${editing === 'new' ? formHtml(null) : items.length < MAX_PLAYLISTS ? '<button class="pill-btn" data-act="add">Add playlist</button>' : ''}`;
    const f = el.querySelector('form');
    if (!f) return;
    f.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-mood]');
      if (chip) { chip.classList.toggle('selected'); chip.setAttribute('aria-pressed', chip.classList.contains('selected')); }
      if (e.target.closest('[data-cancel]')) { editing = null; draw(); }
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = f.querySelector('.form-msg');
      msg.classList.add('error');
      const name = f.elements.name.value.trim();
      const link = f.elements.link.value.trim();
      const moods = [...f.querySelectorAll('[data-mood].selected')].map((b) => Number(b.dataset.mood));
      if (!name) { msg.textContent = 'Please give it a name.'; return; }
      if (!playlistId(link)) { msg.textContent = 'That does not look like a Spotify playlist link.'; return; }
      if (!moods.length) { msg.textContent = 'Please tap at least one mood.'; return; }
      try {
        await savePlaylist({ name, spotify_url: link, moods }, editing === 'new' ? null : editing.id);
        editing = null;
        await load();
      } catch (err) { console.error(err); msg.textContent = 'That did not save. Please try again.'; }
    });
  };

  const load = async () => { items = await listPlaylists(); draw(); };

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'add') { editing = 'new'; draw(); return; }
    const p = items.find((x) => x.id === act.closest('[data-id]').dataset.id);
    if (act.dataset.act === 'edit') { editing = p; draw(); return; }
    if (act.dataset.act === 'delete' && window.confirm(`Delete ${p.name}?`)) {
      try { await deletePlaylist(p.id); await load(); } catch (err) { console.error(err); window.alert('That did not delete. Please try again.'); }
    }
  });
  await load();
}

export async function renderMusicSettings(card) {
  card.innerHTML = `
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
  renderPlaylists(card.querySelector('#mu-playlists')).catch((err) => console.error('Playlists failed', err));
  await drawSpotify();
}
