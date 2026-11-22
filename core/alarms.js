// Alarms (wall display only, kept on this device). Each alarm has a name, a
// time and repeat days (none = once). Checked every 15 seconds against
// London time; a due alarm rings with the timer chime and panel. Alarms ring
// even before the day's check-in (Scott, 22/11/2026). A one-off alarm turns
// itself off after ringing.
import { CONFIG } from '../config.js';
import { ring } from './timers.js';

const KEY = 'sf-alarms';
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LATE_MS = 2 * 60 * 1000; // still rings if the check comes up to 2 minutes late

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: CONFIG.timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// London date ("2026-11-22"), time ("07:05") and weekday index (0 = Mon).
function london(date = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, dow: DAYS.indexOf(p.weekday) };
}

let alarms = load();
let timer = null;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(alarms)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('sf:alarms'));
}

export const listAlarms = () => alarms.slice().sort((a, b) => a.time.localeCompare(b.time));

export function daysText(days) {
  if (!days.length) return 'Once';
  if (days.length === 7) return 'Every day';
  const s = [...days].sort().join();
  if (s === '0,1,2,3,4') return 'Weekdays';
  if (s === '5,6') return 'Weekends';
  return [...days].sort().map((d) => DAYS[d]).join(', ');
}

export function saveAlarm({ id, name, time, days }) {
  const clean = {
    name: (name || '').trim().slice(0, 40) || 'Alarm',
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '07:00',
    days: [...new Set((days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort(),
  };
  const existing = id && alarms.find((a) => a.id === id);
  if (existing) Object.assign(existing, clean, { on: true, lastFired: null });
  else alarms.push({ id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()), ...clean, on: true, lastFired: null });
  save();
}

export function setAlarmOn(id, on) {
  const a = alarms.find((x) => x.id === id);
  if (!a) return;
  a.on = on;
  a.lastFired = null;
  save();
}

export function deleteAlarm(id) {
  alarms = alarms.filter((a) => a.id !== id);
  save();
}

// Due if switched on, today is one of its days (or it is a one-off), its time
// was reached in the last 2 minutes and it has not rung for this time today.
function check() {
  const now = Date.now();
  const due = [];
  for (const a of alarms) {
    if (!a.on) continue;
    for (const back of [0, 60000, LATE_MS]) {
      const t = london(new Date(now - back));
      if (t.time !== a.time) continue;
      if (a.days.length && !a.days.includes(t.dow)) continue;
      const stamp = `${t.day} ${a.time}`;
      if (a.lastFired === stamp) continue;
      a.lastFired = stamp;
      if (!a.days.length) a.on = false; // one-off
      due.push(a);
      break;
    }
  }
  if (due.length) {
    save();
    ring([], due.map((a) => `${a.name} (${a.time})`));
  }
}

// The next alarm to ring, for the hint about sound.
export function nextAlarm() {
  return listAlarms().find((a) => a.on) || null;
}

export function startAlarms() {
  if (timer) return;
  check();
  timer = setInterval(check, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
