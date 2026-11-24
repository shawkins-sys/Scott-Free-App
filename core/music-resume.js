// Start or resume a track from the calm Home Music card. Same rule as the
// Music tile (same sessionStorage key): if no Spotify device is open, open the
// Spotify app and finish playing when Scott comes back to the hub.
import { spotifyResume } from './spotify.js';
import { appLink } from './applink.js';

const PENDING_KEY = 'sf-music-resume';
const PENDING_MAX_MS = 5 * 60 * 1000;

// Returns 'playing', 'opened' or 'failed'.
export async function resumeTrack(t) {
  const r = await spotifyResume(t);
  if (r.result === 'playing') return 'playing';
  if (r.result === 'open') {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ t, at: Date.now() })); } catch { /* ignore */ }
    window.location.href = appLink('spotify');
    return 'opened';
  }
  return 'failed';
}

// Back from Spotify: start the saved track (the phone can take a few seconds to
// appear as a device, so up to three tries). Returns true if it started.
export async function finishPending(alive = () => true) {
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null'); } catch { /* ignore */ }
  if (!pending) return false;
  sessionStorage.removeItem(PENDING_KEY);
  if (Date.now() - pending.at > PENDING_MAX_MS) return false;
  for (let i = 0; i < 3; i += 1) {
    const r = await spotifyResume(pending.t);
    if (!alive()) return false;
    if (r.result === 'playing') return true;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return false;
}
