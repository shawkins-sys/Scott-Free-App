// Weather tile. Open-Meteo (free, no key). Uses the phone's location,
// falling back to Cheltenham if location is denied, slow or unavailable.
import { CONFIG } from '../../config.js';
import { londonParts } from '../../core/date.js';

const FALLBACK = { lat: 51.8994, lon: -2.0783, label: 'Cheltenham' };
const CACHE_KEY = 'sf-weather';
const CACHE_MINUTES = 15;
const GEO_TIMEOUT_MS = 8000;

// ---------- Icons and descriptions (WMO weather codes) ----------
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MOON = '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>';
const CLOUD = '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z"/>';
const W_ICONS = {
  clear: (day) => svg(day ? SUN : MOON),
  partly: (day) => svg(`${day ? '<path d="M8 3v1.5M3 8h1.5M4.6 4.6l1 1M11.4 4.6l-1 1"/><path d="M5.3 10.5A3.5 3.5 0 0 1 11.5 7"/>' : '<path d="M11 4.5A4.5 4.5 0 0 0 5 10"/>'}<path d="M9 19h8a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8 13a3 3 0 0 0 1 6z"/>`),
  cloud: () => svg(CLOUD),
  fog: () => svg('<path d="M4 9h16M4 13h16M6 17h12"/>'),
  drizzle: () => svg(`${'<path d="M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7z"/>'}<path d="M9 18v1M13 18v1M17 18v1"/>`),
  rain: () => svg('<path d="M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7z"/><path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3"/>'),
  snow: () => svg('<path d="M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7z"/><path d="M9 18h.01M13 18h.01M17 18h.01M11 21h.01M15 21h.01"/>'),
  storm: () => svg('<path d="M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7z"/><path d="M13 14l-2 4h3l-2 4"/>'),
};

function describe(code) {
  if (code === 0) return ['Clear', 'clear'];
  if (code === 1) return ['Mostly clear', 'partly'];
  if (code === 2) return ['Partly cloudy', 'partly'];
  if (code === 3) return ['Cloudy', 'cloud'];
  if (code === 45 || code === 48) return ['Fog', 'fog'];
  if (code >= 51 && code <= 57) return ['Drizzle', 'drizzle'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    if (code === 61 || code === 80) return ['Light rain', 'rain'];
    if (code === 65 || code === 67 || code === 82) return ['Heavy rain', 'rain'];
    return ['Rain', 'rain'];
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['Snow', 'snow'];
  if (code >= 95) return ['Thunderstorms', 'storm'];
  return ['Mixed', 'cloud'];
}
const icon = (code, day = 1) => W_ICONS[describe(code)[1]](day);
const deg = (t) => `${Math.round(t)}°`;

// ---------- Location ----------
function getPlace() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(FALLBACK);
    const timer = setTimeout(() => resolve(FALLBACK), GEO_TIMEOUT_MS + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Your location' }); },
      () => { clearTimeout(timer); resolve(FALLBACK); },
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 30 * 60 * 1000 }
    );
  });
}

// ---------- Data ----------
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

let pending = null; // shares one request between the tile and the expanded view

async function getWeather() {
  const cached = readCache();
  if (cached && Date.now() - cached.at < CACHE_MINUTES * 60 * 1000) return cached;
  if (pending) return pending;
  pending = (async () => {
    const place = await getPlace();
    const params = new URLSearchParams({
      latitude: place.lat.toFixed(3),
      longitude: place.lon.toFixed(3),
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      timezone: CONFIG.timezone,
      wind_speed_unit: 'mph',
      forecast_days: '7',
    });
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const data = { at: Date.now(), label: place.label, ...(await res.json()) };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage full */ }
      return data;
    } catch (err) {
      if (cached) return { ...cached, stale: true }; // offline: show the last forecast
      throw err;
    }
  })();
  try { return await pending; } finally { pending = null; }
}

// Index of the current hour in the hourly arrays (times are London local).
function nowIndex(hourly) {
  const p = londonParts();
  const pad = (n) => String(n).padStart(2, '0');
  const key = `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:00`;
  const i = hourly.time.indexOf(key);
  return i >= 0 ? i : 0;
}

function hourCells(d, count) {
  const start = nowIndex(d.hourly) + 1;
  const out = [];
  for (let i = start; i < Math.min(start + count, d.hourly.time.length); i++) {
    const rain = d.hourly.precipitation_probability[i];
    out.push(`
      <li>
        <span class="w-time">${d.hourly.time[i].slice(11, 16)}</span>
        <span class="w-icon">${icon(d.hourly.weather_code[i], d.hourly.is_day[i])}</span>
        <span class="w-temp">${deg(d.hourly.temperature_2m[i])}</span>
        <span class="w-rain">${rain >= 20 ? `${rain}%` : ''}</span>
      </li>`);
  }
  return out.join('');
}

function currentBlock(d) {
  const c = d.current;
  return `
    <div class="w-now">
      <span class="w-icon w-icon-lg">${icon(c.weather_code, c.is_day)}</span>
      <div>
        <div class="w-big">${deg(c.temperature_2m)}</div>
        <div class="w-desc">${describe(c.weather_code)[0]}</div>
      </div>
      <div class="w-meta">
        <div>H ${deg(d.daily.temperature_2m_max[0])} &middot; L ${deg(d.daily.temperature_2m_min[0])}</div>
        <div class="muted">Feels ${deg(c.apparent_temperature)} &middot; Wind ${Math.round(c.wind_speed_10m)} mph</div>
        <div class="muted small">${d.label}${d.stale ? ' &middot; last saved forecast' : ''}</div>
      </div>
    </div>`;
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });

function dailyRows(d) {
  return d.daily.time.map((t, i) => {
    const name = i === 0 ? 'Today' : DAY_FMT.format(new Date(`${t}T12:00:00Z`));
    const rain = d.daily.precipitation_probability_max[i];
    return `
      <li>
        <span class="w-day">${name}</span>
        <span class="w-icon">${icon(d.daily.weather_code[i])}</span>
        <span class="w-rain">${rain >= 20 ? `${rain}%` : ''}</span>
        <span class="w-range">${deg(d.daily.temperature_2m_min[i])} / ${deg(d.daily.temperature_2m_max[i])}</span>
      </li>`;
  }).join('');
}

const UNAVAILABLE = '<p class="muted">Weather is not available right now.</p>';

export default {
  id: 'weather',
  title: 'Weather',
  defaultSize: { phone: { w: 4, h: 3 }, desktop: { w: 12, h: 3 } },
  async render(container) {
    container.innerHTML = '<p class="muted">Loading weather...</p>';
    try {
      const d = await getWeather();
      container.innerHTML = `<div class="weather">${currentBlock(d)}<ul class="w-hours">${hourCells(d, 6)}</ul></div>`;
    } catch (err) {
      console.warn('Weather failed', err);
      container.innerHTML = UNAVAILABLE;
    }
  },
  async renderExpanded(container) {
    container.innerHTML = '<p class="muted">Loading weather...</p>';
    try {
      const d = await getWeather();
      container.innerHTML = `
        <div class="weather weather-full">
          ${currentBlock(d)}
          <h3 class="w-head">Next 24 hours</h3>
          <ul class="w-hours w-scroll">${hourCells(d, 24)}</ul>
          <h3 class="w-head">Next 7 days</h3>
          <ul class="w-days">${dailyRows(d)}</ul>
        </div>`;
    } catch (err) {
      console.warn('Weather failed', err);
      container.innerHTML = UNAVAILABLE;
    }
  },
};
