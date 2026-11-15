// Wall display behaviour (brief 14.1 and 14.3). Only started on wall devices.
// - Large clock in the Home header (#wall-clock).
// - Keeps the screen awake (Screen Wake Lock), re-requested when visible again.
// - No long-press menus or text selection (CSS does the rest).
// - Re-checks today's check-in on load, when visible and every 5 minutes, so
//   finishing it on the phone unlocks the wall (the lock comes from the database).
import { CONFIG } from '../config.js';
import { getTodayCheckin, checkinDoneToday } from './wellbeing.js';

const RECHECK_MS = 5 * 60 * 1000;
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

let wakeLock = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    if (wakeLock && !wakeLock.released) return;
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (err) { console.warn('Screen could not be kept awake', err); }
}

function tickClock() {
  const el = document.getElementById('wall-clock');
  if (el) el.textContent = clockFmt.format(new Date());
}

// onChange() is called when today's check-in status differs from what is shown.
export function startWallMode({ onChange }) {
  document.body.classList.add('wall');
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('input, textarea')) e.preventDefault();
  });

  const recheck = async () => {
    const before = checkinDoneToday();
    try { await getTodayCheckin({ refresh: true }); } catch { return; }
    if (checkinDoneToday() !== before) onChange();
  };

  tickClock();
  setInterval(tickClock, 1000);
  keepAwake();
  setInterval(recheck, RECHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { keepAwake(); recheck(); tickClock(); }
  });
}

export { tickClock };
