// Google sign-in for the Photos Picker only. Uses a full-page redirect
// (more reliable than a popup in an installed Android app). The access
// token lasts about an hour and is kept in this tab's sessionStorage only.
import { CONFIG } from '../config.js';

const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const STATE_KEY = 'sf-g-state';
const TOKEN_KEY = 'sf-g-token';

let lastError = null;

const redirectUri = () => new URL('./', document.baseURI).href.split('#')[0];

export function googleConfigured() {
  return !!CONFIG.googleClientId;
}

// Sends the browser to Google. `returnHash` is where to land afterwards.
export function startGoogleSignIn(returnHash) {
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  sessionStorage.setItem(STATE_KEY, JSON.stringify({ state, returnHash }));
  const params = new URLSearchParams({
    client_id: CONFIG.googleClientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'false',
    prompt: 'select_account',
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Returns (once) the message from a failed Google sign-in, or null.
export function takeGoogleError() {
  const e = lastError;
  lastError = null;
  return e;
}

// Call once at start-up, before routing. Picks up the token Google returns
// in the address, then restores the page the sign-in started from.
export function captureGoogleReturn() {
  lastError = readReturn();
}

function readReturn() {
  const hash = location.hash;
  if (!hash.startsWith('#access_token=') && !hash.startsWith('#error=') && !hash.startsWith('#state=')) return null;
  const p = new URLSearchParams(hash.slice(1));
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(STATE_KEY)); } catch { /* ignore */ }
  sessionStorage.removeItem(STATE_KEY);
  const back = (saved && saved.returnHash) || '#/';
  history.replaceState(null, '', location.pathname + location.search + back);

  if (!saved || p.get('state') !== saved.state) return 'Google sign-in could not be confirmed. Please try again.';
  if (p.get('error')) return p.get('error') === 'access_denied'
    ? 'Google Photos access was not allowed.'
    : 'Google sign-in did not complete. Please try again.';
  const expiresIn = Number(p.get('expires_in')) || 3600;
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
    token: p.get('access_token'),
    exp: Date.now() + expiresIn * 1000,
  }));
  return null;
}

// Returns a token with at least 10 minutes left, or null.
export function googleToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    return t && t.exp - Date.now() > 10 * 60 * 1000 ? t.token : null;
  } catch { return null; }
}

export function clearGoogleToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}
