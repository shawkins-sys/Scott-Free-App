// Tile grid built on GridStack. Static by default, movable in Edit mode.
// Each device type keeps its own saved layout.
import { tiles as tileRegistry } from '../registry.js';
import { loadLayout, saveLayout, readLocalLayout } from './layout-store.js';
import { icons } from './icons.js';
import { openOverlay } from './overlay.js';
import { isWall, isPhoneDevice } from './device.js';
import { getTodayCheckin, checkinDoneToday, checkinSavedToday } from './wellbeing.js';

// Standing rule (Scott, 21/11/2026): every tile waits for the day's check-in.
// Enforced here for all tiles, current and future, so no tile can skip it.
// Today's check-in confirmed by the database earlier on this device counts
// straight away (no wait); otherwise ask the database.
async function checkinDone() {
  if (checkinSavedToday()) { getTodayCheckin().catch(() => {}); return true; }
  try { await getTodayCheckin(); } catch { /* treated as not done */ }
  return checkinDoneToday();
}

async function renderTile(tile, body) {
  if (!(await checkinDone())) {
    body.innerHTML = `<p class="muted">${tile.title} will appear after this morning's check-in.</p>`;
    window.addEventListener('sf:checkin-done', () => { if (body.isConnected) renderTile(tile, body); }, { once: true });
    return;
  }
  try {
    await tile.render(body);
  } catch (err) {
    console.error(`Tile "${tile.id}" failed to render`, err);
    body.innerHTML = '<p class="muted">Not available right now.</p>';
  }
}

const GS = window.GridStack && (window.GridStack.GridStack || window.GridStack);
const COLUMNS = { phone: 4, desktop: 12, wall: 12 };

// Wall display defaults: same order as the phone, tiles side by side across
// the width (12 columns, in 72px height blocks like other defaults).
const WALL_DEFAULTS = { photos: { w: 4, h: 6 }, calendar: { w: 4, h: 6 }, weather: { w: 4, h: 6 }, music: { w: 4, h: 3 }, lights: { w: 4, h: 3 } };

export function currentDevice() {
  if (isWall()) return 'wall';
  return isPhoneDevice() ? 'phone' : 'desktop';
}

async function loadTileModules() {
  const loaded = await Promise.all(
    tileRegistry.map(async (entry) => {
      try {
        const mod = await import(new URL(entry.path, document.baseURI).href);
        return mod.default;
      } catch (err) {
        console.error(`Tile "${entry.id}" failed to load`, err);
        return null;
      }
    })
  );
  return loaded.filter(Boolean);
}

function tileShell(tile) {
  const el = document.createElement('div');
  el.className = 'grid-stack-item';
  el.setAttribute('gs-id', tile.id);
  el.innerHTML = `
    <div class="grid-stack-item-content tile">
      <header class="tile-head">
        <h2 class="tile-title">${tile.title}</h2>
        <button class="icon-btn tile-expand" aria-label="Open ${tile.title}">${icons.expand}</button>
      </header>
      <div class="tile-body"></div>
    </div>`;
  el.querySelector('.tile-expand').addEventListener('click', async () => {
    if (!(await checkinDone())) return;
    openOverlay(tile.title, (container) => tile.renderExpanded(container));
  });
  return el;
}

// Builds the grid inside `container`. Returns a controller with setEditing().
export async function mountGrid(container) {
  const device = currentDevice();
  const tiles = await loadTileModules();
  // This device's saved layout shows at once; Supabase is checked in the
  // background and wins only if it holds a newer layout (another device).
  const local = readLocalLayout(device);
  const fromServer = loadLayout(device);
  const saved = (local || (await fromServer)) || [];
  const savedById = new Map(saved.map((s) => [s.id, s]));

  container.innerHTML = '';
  const gridEl = document.createElement('div');
  gridEl.className = 'grid-stack';
  container.appendChild(gridEl);

  if (!GS) {
    container.innerHTML = '<p class="muted">The tile grid could not load. Check your connection.</p>';
    return { setEditing() {}, device };
  }

  // Fine height steps: each row is 18px. Tile default sizes are written in
  // 72px blocks, and layouts saved before this change used 72px rows, so
  // both are scaled up by ROW_SCALE. Saved items record their scale in `s`.
  const ROW_PX = 18;
  const ROW_SCALE = 4;
  const MIN_ROWS = 3;

  const grid = GS.init(
    {
      column: COLUMNS[device],
      cellHeight: ROW_PX,
      margin: 8,
      staticGrid: true,
      float: false,
      animate: true,
      alwaysShowResizeHandle: true,
      resizable: { handles: 'se,s' },
    },
    gridEl
  );

  // Saved tiles first (in saved order), then any new tiles from the registry.
  const ordered = [
    ...saved.map((s) => tiles.find((t) => t.id === s.id)).filter(Boolean),
    ...tiles.filter((t) => !savedById.has(t.id)),
  ];

  grid.batchUpdate();
  for (const tile of ordered) {
    const pos = savedById.get(tile.id);
    const size = (tile.defaultSize && tile.defaultSize[device])
      || (device === 'wall' && (WALL_DEFAULTS[tile.id] || { w: 4, h: 6 }))
      || { w: COLUMNS[device], h: 4 };
    const el = tileShell(tile);
    gridEl.appendChild(el);
    const k = pos ? ROW_SCALE / (pos.s || 1) : ROW_SCALE;
    grid.makeWidget(el, pos
      ? { id: tile.id, x: pos.x, y: Math.round(pos.y * k), w: pos.w, h: Math.round(pos.h * k), minH: MIN_ROWS }
      : { id: tile.id, w: size.w, h: size.h * ROW_SCALE, minH: MIN_ROWS });
  }
  grid.batchUpdate(false);
  // All tiles load at the same time, so a slow one (weather location,
  // calendar feed) no longer holds up the others or the layout.
  for (const tile of ordered) {
    const body = gridEl.querySelector(`[gs-id="${tile.id}"] .tile-body`);
    if (body) renderTile(tile, body);
  }

  // A newer layout from another device: move the tiles to match.
  if (local) {
    fromServer.then((items) => {
      if (!items || !gridEl.isConnected || JSON.stringify(items) === JSON.stringify(local)) return;
      grid.batchUpdate();
      for (const pos of items) {
        const el = gridEl.querySelector(`[gs-id="${pos.id}"]`);
        const k = ROW_SCALE / (pos.s || 1);
        if (el) grid.update(el, { x: pos.x, y: Math.round(pos.y * k), w: pos.w, h: Math.round(pos.h * k) });
      }
      grid.batchUpdate(false);
    }).catch(() => {});
  }

  // Saves straight after a move or resize (and any knock-on changes), and
  // again if the app is left while a save is waiting, so nothing is lost.
  let saveTimer = null;
  const saveNow = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    const items = grid.save(false).map(({ id, x, y, w, h }) => ({ id, x, y, w, h, s: ROW_SCALE }));
    saveLayout(device, items);
  };
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 150); };
  const flush = () => { if (saveTimer) saveNow(); };
  grid.on('change', saveSoon);
  grid.on('resizestop dragstop', saveSoon);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);

  return {
    device,
    setEditing(on) {
      if (!on) flush();
      grid.setStatic(!on);
      gridEl.classList.toggle('editing', on);
    },
  };
}
