// Small status dot above the Home greeting.
// Green: online and the server answers. Red: no internet, or the server
// cannot be reached. Checks on load, when the app comes back into view,
// on connection changes and every 60 seconds while visible.
import { supabase } from './supabase.js';

const EVERY_MS = 60 * 1000;
let state = navigator.onLine ? 'ok' : 'down';

let started = false;

function paint() {
  const dot = document.getElementById('live-dot');
  if (!dot) return;
  const ok = state === 'ok';
  dot.classList.toggle('down', !ok);
  const label = ok ? 'Live: connected' : (navigator.onLine ? 'Not connected to the server' : 'No internet connection');
  dot.title = label;
  dot.setAttribute('aria-label', label);
}

async function check() {
  if (!navigator.onLine || !supabase) { state = 'down'; paint(); return; }
  try {
    const { error } = await supabase.rpc('ping');
    state = error ? 'down' : 'ok';
  } catch {
    state = 'down';
  }
  paint();
}

// Called after Home renders, so a fresh dot shows the last known state.
export function startLiveDot() {
  paint();
  if (started) return;
  started = true;
  check();
  window.addEventListener('online', check);
  window.addEventListener('offline', () => { state = 'down'; paint(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(() => { if (!document.hidden) check(); }, EVERY_MS);
}

export const liveDotHtml = () => '<span class="live-dot" id="live-dot" role="img" aria-label="Live: connected"></span>';
