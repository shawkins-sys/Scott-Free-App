// Morning music: runs once after the check-in is first saved.
// Phone only, before 12:00 London time. Picks a playlist for today's mood,
// works out speaker (at home) or phone (away), and plays via the spotify
// Edge Function. Problems become a calm card on Home, never a raw error.
import { supabase } from './supabase.js';
import { CONFIG } from '../config.js';
import { londonParts } from './date.js';
import { esc } from './wellbeing.js';
import { spotifyConfigured, spotifyStatus, spotifyPlay, startSpotifyConnect,
  getMusicSettings, currentPosition, distanceM } from './spotify.js';

const HOME_RADIUS_M = 150;
const MUSIC_BEFORE_HOUR = 12;
export const MAX_PLAYLISTS = 10;
const PROMPT_KEY = 'sf-spotify-prompt'; // day the reconnect prompt was last checked

// ---------- Playlists ----------

export async function listPlaylists() {
  const { data, error } = await supabase.from('playlists').select('*').order('created_at');
  if (error) throw error;
  return data || [];
}
export async function savePlaylist(fields, id) {
  const q = id ? supabase.from('playlists').update(fields).eq('id', id) : supabase.from('playlists').insert(fields);
  const { error } = await q;
  if (error) throw error;
}
export async function deletePlaylist(id) {
  const { error } = await supabase.from('playlists').delete().eq('id', id);
  if (error) throw error;
}

// Playlist id from a Spotify link or URI, or null.
export function playlistId(link) {
  const m = String(link || '').match(/playlist[/:]([A-Za-z0-9]{10,40})/);
  return m ? m[1] : null;
}
export const openUrl = (p) => `https://open.spotify.com/playlist/${playlistId(p.spotify_url)}`;

// Random playlist tagged with the mood; if none, the nearest tagged mood level.
export function pickPlaylist(playlists, mood) {
  const usable = playlists.filter((p) => playlistId(p.spotify_url) && (p.moods || []).length);
  if (!usable.length) return null;
  const dist = (p) => Math.min(...p.moods.map((m) => Math.abs(m - mood)));
  const best = Math.min(...usable.map(dist));
  const pool = usable.filter((p) => dist(p) === best);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- Home card ----------

function card(slot, html) {
  if (!slot) return;
  slot.innerHTML = html ? `<div class="card music-card">${html}</div>` : '';
}

function openCard(slot, p, note) {
  card(slot, `
    <p class="music-line">${note ? `${esc(note)} ` : ''}Today's music: <strong>${esc(p.name)}</strong></p>
    <div class="btn-row"><a class="primary-btn" href="${openUrl(p)}" target="_blank" rel="noopener">Open in Spotify</a>
      <button class="link-btn" data-dismiss>Not now</button></div>`);
  slot.querySelector('[data-dismiss]').addEventListener('click', () => card(slot, ''));
}

function reconnectCard(slot, text) {
  card(slot, `
    <p class="music-line">${esc(text)}</p>
    <div class="btn-row"><button class="primary-btn" data-reconnect>Reconnect Spotify</button>
      <button class="link-btn" data-dismiss>Not now</button></div>`);
  slot.querySelector('[data-reconnect]').addEventListener('click', () => startSpotifyConnect());
  slot.querySelector('[data-dismiss]').addEventListener('click', () => card(slot, ''));
}

// Asks "Speaker or phone?" and resolves with 'speaker' or 'phone'.
function askTarget(slot) {
  return new Promise((resolve) => {
    card(slot, `
      <p class="music-line">Where should this morning's music play?</p>
      <div class="btn-row"><button class="primary-btn" data-t="speaker">Speaker</button>
        <button class="pill-btn" data-t="phone">Phone</button></div>`);
    slot.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => resolve(b.dataset.t)));
  });
}

// ---------- Flow ----------

const isPhone = () => window.innerWidth < CONFIG.phoneBreakpoint;

export async function startMorningMusic(entry, slot) {
  try {
    if (!spotifyConfigured() || !isPhone() || londonParts().hour >= MUSIC_BEFORE_HOUR) return;
    const mood = entry && entry.metrics && entry.metrics.mood;
    if (!mood) return;
    const playlists = await listPlaylists();
    const p = pickPlaylist(playlists, mood);
    if (!p) return; // no playlists set up yet

    const status = await spotifyStatus();
    if (!status.connected) {
      if (status.expired) reconnectCard(slot, 'Spotify needs reconnecting before morning music can play.');
      else openCard(slot, p);
      return;
    }

    // At home within 150m of the saved home location: speaker. Otherwise phone.
    const settings = await getMusicSettings();
    let target;
    if (!settings.speakerId) target = 'phone';
    else {
      card(slot, '<p class="music-line muted">Starting your music...</p>');
      const pos = settings.home ? await currentPosition(8000) : null;
      target = pos ? (distanceM(pos, settings.home) <= HOME_RADIUS_M ? 'speaker' : 'phone') : await askTarget(slot);
    }

    card(slot, '<p class="music-line muted">Starting your music...</p>');
    const r = await spotifyPlay({ playlistUri: `spotify:playlist:${playlistId(p.spotify_url)}`, target, speakerId: settings.speakerId, speakerName: settings.speakerName });
    if (r.result === 'playing') {
      card(slot, `<p class="music-line">Playing <strong>${esc(p.name)}</strong> on ${esc(r.deviceName || (r.target === 'speaker' ? 'the speaker' : 'your phone'))}${r.fellBack ? ' (the speaker was not available)' : ''}.</p>`);
      setTimeout(() => { if (slot && slot.isConnected) card(slot, ''); }, 15000);
    } else if (r.result === 'reconnect') {
      reconnectCard(slot, 'Spotify needs reconnecting before morning music can play.');
    } else {
      openCard(slot, p, r.fellBack ? 'The speaker was not available.' : '');
    }
  } catch (err) {
    console.warn('Morning music did not start', err);
    card(slot, '');
  }
}

// On Home after the check-in: a reconnect prompt when Spotify has expired or
// expires within two weeks. Checked at most once a day per device.
export async function maybeReconnectPrompt(slot, day) {
  try {
    if (!spotifyConfigured() || localStorage.getItem(PROMPT_KEY) === day) return;
    const s = await spotifyStatus();
    if (s.connected === undefined) return; // function not reachable
    localStorage.setItem(PROMPT_KEY, day);
    if (s.expired && s.authorisedAt) reconnectCard(slot, 'Spotify needs reconnecting (it asks every six months).');
    else if (s.reconnectSoon) reconnectCard(slot, 'Spotify will need reconnecting soon (it asks every six months).');
  } catch { /* quiet */ }
}
