// Spotify (client side). The browser only starts the sign-in (PKCE) and
// passes the returned code to the `spotify` Edge Function, which keeps the
// tokens and makes every Spotify call.
import { supabase } from './supabase.js';
import { CONFIG } from '../config.js';
import { getSettings, updateSettings } from './wellbeing.js';

const SCOPES = 'user-read-playback-state user-modify-playback-state';
const PKCE_KEY = 'sf-spotify-pkce'; // localStorage, so it survives the trip to the Spotify app
const RESULT_KEY = 'sf-spotify-return';

const redirectUri = () => new URL('./', document.baseURI).href.split(/[?#]/)[0];

export const spotifyConfigured = () => !!CONFIG.spotifyClientId;

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Sends the browser to Spotify to connect (or reconnect).
export async function startSpotifyConnect() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, at: Date.now() }));
  const params = new URLSearchParams({
    client_id: CONFIG.spotifyClientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  });
  location.href = `https://accounts.spotify.com/authorize?${params}`;
}

// Call once at start-up, before routing. Spotify returns ?code=...&state=...
// in the address. Keeps the code for Settings to finish the connection and
// sends the app to Settings.
export function captureSpotifyReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.has('state') || !(q.has('code') || q.has('error'))) return;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(PKCE_KEY)); } catch { /* ignore */ }
  localStorage.removeItem(PKCE_KEY);
  const ok = saved && saved.state === q.get('state') && Date.now() - saved.at < 15 * 60 * 1000;
  sessionStorage.setItem(RESULT_KEY, JSON.stringify(
    !ok ? { error: 'Spotify sign-in could not be confirmed. Please try again.' }
      : q.get('error') ? { error: q.get('error') === 'access_denied' ? 'Spotify access was not allowed.' : 'Spotify sign-in did not complete.' }
        : { code: q.get('code'), verifier: saved.verifier }));
  history.replaceState(null, '', `${location.pathname}#/hub/settings`);
}

// Finishes a connection started before the redirect. Returns a message or null.
export async function finishSpotifyConnect() {
  const raw = sessionStorage.getItem(RESULT_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(RESULT_KEY);
  const r = JSON.parse(raw);
  if (r.error) return { error: r.error };
  const data = await call({ action: 'connect', code: r.code, verifier: r.verifier, redirectUri: redirectUri() });
  return data.result === 'connected' ? { ok: 'Spotify connected.' } : { error: data.message || 'Spotify did not connect. Please try again.' };
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke('spotify', { body });
  if (error) { console.warn('Spotify function failed', error); return { result: 'error' }; }
  return data || { result: 'error' };
}

export const spotifyStatus = () => call({ action: 'status' });
export const spotifyDevices = () => call({ action: 'devices' });
export const spotifyDisconnect = () => call({ action: 'disconnect' });
export const spotifyPlay = (opts) => call({ action: 'play', ...opts });

// ---------- Music settings (settings.data.music) ----------

export async function getMusicSettings() {
  const s = await getSettings();
  return { speakerId: null, speakerName: null, home: null, ...(s.music || {}) };
}
export async function saveMusicSettings(patch) {
  const current = await getMusicSettings();
  await updateSettings({ music: { ...current, ...patch } });
}

// Current position, or null if unavailable or refused.
export function currentPosition(timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 2 * 60 * 1000 }
    );
  });
}

// Distance in metres between two { lat, lon } points.
export function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
