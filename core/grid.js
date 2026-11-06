// Tile grid built on GridStack. Static by default, movable in Edit mode.
// Each device type keeps its own saved layout.
import { CONFIG } from '../config.js';
import { tiles as tileRegistry } from '../registry.js';
import { loadLayout, saveLayout } from './layout-store.js';
import { icons } from './icons.js';
import { openOverlay } from './overlay.js';

const GS = window.GridStack && (window.GridStack.GridStack || window.GridStack);
const COLUMNS = { phone: 4, desktop: 12 };

export function currentDevice() {
  return window.innerWidth < CONFIG.phoneBreakpoint ? 'phone' : 'desktop';
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
  el.querySelector('.tile-expand').addEventListener('click', () => {
    openOverlay(tile.title, (container) => tile.renderExpanded(container));
  });
  return el;
}

// Builds the grid inside `container`. Returns a controller with setEditing().
export async function mountGrid(container) {
  const device = currentDevice();
  const tiles = await loadTileModules();
  const saved = (await loadLayout(device)) || [];
  const savedById = new Map(saved.map((s) => [s.id, s]));

  container.innerHTML = '';
  const gridEl = document.createElement('div');
  gridEl.className = 'grid-stack';
  container.appendChild(gridEl);

  if (!GS) {
    container.innerHTML = '<p class="muted">The tile grid could not load. Check your connection.</p>';
    return { setEditing() {}, device };
  }

  const grid = GS.init(
    {
      column: COLUMNS[device],
      cellHeight: 72,
      margin: 8,
      staticGrid: true,
      float: false,
      animate: true,
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
    const size = (tile.defaultSize && tile.defaultSize[device]) || { w: COLUMNS[device], h: 4 };
    const el = tileShell(tile);
    gridEl.appendChild(el);
    grid.makeWidget(el, pos ? { x: pos.x, y: pos.y, w: pos.w, h: pos.h } : { w: size.w, h: size.h });
    try {
      await tile.render(el.querySelector('.tile-body'));
    } catch (err) {
      console.error(`Tile "${tile.id}" failed to render`, err);
      el.querySelector('.tile-body').innerHTML = '<p class="muted">Not available right now.</p>';
    }
  }
  grid.batchUpdate(false);

  let saveTimer;
  grid.on('change', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const items = grid.save(false).map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
      saveLayout(device, items);
    }, 400);
  });

  return {
    device,
    setEditing(on) {
      grid.setStatic(!on);
      gridEl.classList.toggle('editing', on);
    },
  };
}
