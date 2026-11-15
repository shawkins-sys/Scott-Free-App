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
