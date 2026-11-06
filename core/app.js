// App bootstrap: routing between Home and hubs, hub bar, service worker.
import { CONFIG } from '../config.js';
import { hubs } from '../registry.js';
import { icons } from './icons.js';
import { greeting, friendlyDate, todayKey } from './date.js';
import { mountGrid, currentDevice } from './grid.js';
import { requireAuth, signOut } from './auth.js';
import { getTodayCheckin, checkinDoneToday, pickDailyPhrase, getDisplayPhrase } from './wellbeing.js';
import { renderCheckinForm } from './checkin.js';

const view = document.getElementById('view');
const hubbar = document.getElementById('hubbar');
let gridCtl = null;

document.title = CONFIG.appName;

// Hubs stay locked until today's check-in is saved (brief 4.3).
export function hubsLocked() {
  return !checkinDoneToday();
}

async function showPhrase() {
  const slot = document.getElementById('phrase-slot');
  if (!slot) return;
  try { slot.textContent = await getDisplayPhrase(); }
  catch (err) { console.warn('Phrase not loaded', err); }
}

// Runs after the check-in is first saved today. Breathing (Phase 8) and
// morning music (Phase 7) will be added here, in that order.
async function afterCheckin(entry) {
  try { await pickDailyPhrase(entry.metrics); }
  catch (err) { console.warn('Daily phrase not picked', err); }
}

async function setupCheckin() {
  const slot = document.getElementById('checkin-slot');
  let entry;
  try {
    entry = await getTodayCheckin({ refresh: true });
  } catch (err) {
    console.error('Check-in status not loaded', err);
    slot.innerHTML = `<div class="card muted">Could not load this morning's check-in.
      <button class="link-btn" id="checkin-retry">Try again</button></div>`;
    slot.querySelector('#checkin-retry').addEventListener('click', setupCheckin);
    return;
  }
  if (!document.contains(slot)) return; // moved away from Home meanwhile
  renderHubBar('home');
  if (entry) {
    slot.innerHTML = '';
    // Safety net in case the phrase was not picked when the check-in was saved.
    try { await pickDailyPhrase(entry.metrics); } catch { /* shown as empty */ }
    showPhrase();
    return;
  }
  await renderCheckinForm(slot, {
    title: 'Morning check-in',
    onSaved: async (saved) => {
      slot.innerHTML = '';
      renderHubBar('home');
      await afterCheckin(saved);
      showPhrase();
    },
  });
}

function renderHubBar(activeId) {
  const locked = hubsLocked();
  const btn = (id, title, icon, href) => `
    <a class="hub-btn${activeId === id ? ' active' : ''}${locked && id !== 'home' ? ' locked' : ''}"
       href="${href}" aria-label="${title}"${activeId === id ? ' aria-current="page"' : ''}>
      ${icons[icon] || ''}<span>${title}</span>
    </a>`;
  hubbar.innerHTML =
    btn('home', 'Home', 'home', '#/') +
    hubs.map((h) => btn(h.id, h.title, h.icon, `#/hub/${h.id}`)).join('');
}

async function renderHome() {
  const now = new Date();
  view.innerHTML = `
    <section class="home">
      <header class="home-head">
        <div>
          <h1 class="greeting">${greeting(now)}, ${CONFIG.ownerName}</h1>
          <p class="today">${friendlyDate(now)}</p>
          <p class="phrase" id="phrase-slot"></p>
        </div>
        <button class="pill-btn" id="edit-btn" aria-pressed="false">Edit</button>
      </header>
      <p class="edit-hint" id="edit-hint" hidden>Press and hold a tile to move it, or hold a blue edge to resize. Changes save automatically.</p>
      <div id="checkin-slot"></div>
      <div id="grid-slot"></div>
      <div id="quiet-lines"></div>
      <div id="weekly-slot"></div>
      <p class="signout"><button class="link-btn" id="signout-btn">Sign out</button></p>
    </section>`;
  document.getElementById('signout-btn').addEventListener('click', signOut);

  setupCheckin();
  gridCtl = await mountGrid(document.getElementById('grid-slot'));

  const editBtn = document.getElementById('edit-btn');
  let editing = false;
  editBtn.addEventListener('click', () => {
    editing = !editing;
    gridCtl.setEditing(editing);
    editBtn.textContent = editing ? 'Done' : 'Edit';
    editBtn.setAttribute('aria-pressed', String(editing));
    editBtn.classList.toggle('active', editing);
    document.getElementById('edit-hint').hidden = !editing;
  });
}

async function renderHub(id) {
  const entry = hubs.find((h) => h.id === id);
  if (!entry) { location.hash = '#/'; return; }
  gridCtl = null;
  view.innerHTML = `
    <section class="hub">
      <header class="hub-head">
        <a class="icon-btn" href="#/" aria-label="Back to Home">${icons.back}</a>
        <h1>${entry.title}</h1>
      </header>
      <div class="hub-body"></div>
    </section>`;
  const body = view.querySelector('.hub-body');
  if (hubsLocked()) {
    body.innerHTML = `<div class="card muted">${icons.lock} Complete this morning's check-in to open ${entry.title}.</div>`;
    return;
  }
  try {
    const mod = await import(new URL(entry.path, document.baseURI).href);
    await mod.default.render(body);
  } catch (err) {
    console.error(`Hub "${id}" failed to load`, err);
    body.innerHTML = '<p class="muted">This hub could not load right now.</p>';
  }
}

async function route() {
  const hash = location.hash || '#/';
  const match = hash.match(/^#\/hub\/([\w-]+)/);
  if (match) {
    try { await getTodayCheckin(); } catch { /* treated as locked */ }
  }
  renderHubBar(match ? match[1] : 'home');
  window.scrollTo(0, 0);
  if (match) await renderHub(match[1]);
  else await renderHome();
}

// Rebuild Home when the screen crosses the phone/desktop breakpoint,
// so the correct saved layout is used.
let lastDevice = currentDevice();
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const d = currentDevice();
    if (d !== lastDevice) {
      lastDevice = d;
      if (gridCtl) renderHome();
    }
  }, 250);
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker not registered', err));
}

// Nothing loads until sign-in with MFA is complete.
requireAuth(view)
  .then(() => {
    window.addEventListener('hashchange', route);
    // If the app is left open past midnight, start the new day fresh.
    let openDay = todayKey();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && todayKey() !== openDay) {
        openDay = todayKey();
        route();
      }
    });
    route();
  })
  .catch((err) => {
    console.error(err);
    view.innerHTML = '<section class="auth"><div class="card">Sign-in could not start. Please reload the app.</div></section>';
  });
