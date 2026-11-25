// Calm Home (phone only). Home style is "calm" (default) or "tiles"; the
// choice lives in settings.data.homeStyle with a copy on this device for a
// fast start. The wall display and computers always keep the tile grid.
// Phase 1: greeting, date, phrase, "Checked in" mark and the photo card.
import { CONFIG } from '../config.js';
import { greeting, friendlyDate } from './date.js';
import { isWall, isPhoneDevice } from './device.js';
import { getSettings, updateSettings } from './wellbeing.js';
import { liveDotHtml } from './livedot.js';

const KEY = 'sf-home-style';
export const HOME_STYLES = [['calm', 'Calm'], ['tiles', 'Tiles']];

const clean = (v) => (v === 'tiles' ? 'tiles' : 'calm');

export function homeStyle() {
  try { return clean(localStorage.getItem(KEY)); } catch { return 'calm'; }
}

// Called by Settings after a change.
export async function setHomeStyle(style) {
  const v = clean(style);
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
  await updateSettings({ homeStyle: v });
}

// Calm Home is for phones only (including a fold's inner screen).
// Hubs drawn in the calm style (25/11/2026). Added one at a time as each page is
// restyled; the Home style switch (Calm / Tiles) covers them all.
export const CALM_PAGES = new Set(['morning', 'wellbeing', 'plan', 'settings']);
// Muted line under each calm page title; pages not listed show today's date.
export const CALM_SUB = { wellbeing: 'How the days have felt', settings: 'Make it yours' };
export const useCalmPage = (id) => useCalm() && CALM_PAGES.has(id);
export const useCalm = () => !isWall() && isPhoneDevice() && homeStyle() === 'calm';

// Picks up a change made on another device. Returns true if the device copy changed.
export async function syncHomeStyle() {
  try {
    const d = await getSettings();
    const v = clean(d.homeStyle);
    if (v === homeStyle()) return false;
    try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
    return true;
  } catch { return false; }
}

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

export function calmHomeHtml(now = new Date()) {
  return `
    <section class="home calm">
      <header class="calm-head">
        ${liveDotHtml()}
        <h1 class="greeting calm-greeting">${greeting(now)}, ${CONFIG.ownerName}</h1>
        <p class="today calm-date">${friendlyDate(now)}</p>
        <p class="phrase calm-phrase" id="phrase-slot"></p>
        <p class="calm-checked" id="calm-checked" hidden>${CHECK}<span>Checked in</span></p>
      </header>
      <div id="checkin-slot"></div>
      <div id="music-slot"></div>
      <div class="calm-photo" id="calm-photo" hidden></div>
      <div id="weekly-slot"></div>
      <div class="calm-gap"></div>
      <div id="calm-upnext" hidden></div>
      <div id="calm-cards" hidden></div>
    </section>`;
}

let photoStarted = false;

// Runs once today's check-in is done: shows the "Checked in" mark and starts
// the photo card. If the photos cannot load the card stays hidden and the art shows.
export async function revealCalm() {
  const mark = document.getElementById('calm-checked');
  if (mark) mark.hidden = false;
  const card = document.getElementById('calm-photo');
  if (!card || photoStarted) return;
  photoStarted = true;
  // Up next: key dates due today or tomorrow (card stays hidden when none).
  import('./calm-upnext.js').then((m) => m.renderUpNext(document.getElementById('calm-upnext')))
    .catch((err) => console.warn('Up next not shown', err));
  // Card row (Weather, Music, Lights, Calendar) starts at once, alongside the photo.
  import('./calm-cards.js').then((m) => m.renderCardRow(document.getElementById('calm-cards')))
    .catch((err) => console.warn('Card row not shown', err));
  try {
    const mod = await import(new URL('../tiles/photos/index.js', import.meta.url).href);
    await mod.default.renderInline(card);
    card.hidden = !card.querySelector('.photo-view');
  } catch (err) {
    console.warn('Photo card not shown', err);
    card.hidden = true;
  }
}

// Called each time Home is drawn, so the photo card can start again.
export function resetCalm() { photoStarted = false; }
