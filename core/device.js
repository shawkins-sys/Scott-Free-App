import { CONFIG } from '../config.js';
// This device: a generated ID and the "wall display" switch (brief 14.1).
// Stored only on this device, so the phone and PC are unaffected.

const ID_KEY = 'sf-device-id';
const WALL_KEY = 'sf-wall';

export function deviceId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export const isWall = () => localStorage.getItem(WALL_KEY) === '1';

export function setWall(on) {
  if (on) localStorage.setItem(WALL_KEY, '1');
  else localStorage.removeItem(WALL_KEY);
  deviceId();
}

// Phones count as phone whichever screen is in use, so a foldable's unfolded
// inner screen shares the phone layout (Scott, 22/11/2026). Mobile browsers
// say "Mobi" in the user agent; tablets and computers do not, so they go by
// width (under phoneBreakpoint is phone).
export function isPhoneDevice() {
  if (/Mobi/i.test(navigator.userAgent)) return true;
  return window.innerWidth < CONFIG.phoneBreakpoint;
}
