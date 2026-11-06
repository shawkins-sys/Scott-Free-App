// App bootstrap: routing between Home and hubs, hub bar, service worker.
import { CONFIG } from '../config.js';
import { hubs } from '../registry.js';
import { icons } from './icons.js';
import { greeting, friendlyDate } from './date.js';
import { mountGrid, currentDevice } from './grid.js';
import { requireAuth, signOut } from './auth.js';

const view = document.getElementById('view');
const hubbar = document.getElementById('hubbar');
let gridCtl = null;

document.title = CONFIG.appName;

// Hubs unlock after the morning check-in (added in Phase 2).
export function hubsLocked() {
  return false;
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
      <p class="edit-hint" id="edit-hint" hidden>Press and hold a tile to move it, or hold the blue handle to resize. Tap Done to save.</p>
      <div id="checkin-slot"></div>
      <div id="grid-slot"></div>
      <div id="quiet-lines"></div>
      <div id="weekly-slot"></div>
      <p class="signout"><button class="link-btn" id="signout-btn">Sign out</button></p>
    </section>`;
  document.getElementById('signout-btn').addEventListener('click', signOut);

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
    route();
  })
  .catch((err) => {
    console.error(err);
    view.innerHTML = '<section class="auth"><div class="card">Sign-in could not start. Please reload the app.</div></section>';
  });
