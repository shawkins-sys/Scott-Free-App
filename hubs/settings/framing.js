// Settings, Photo framing: the slideshow photos as a grid. Tap one, then tap
// the part of the photo that matters; the photo card keeps that part in view.
// "Reset to automatic" goes back to face finding (core/face-focus.js).
import { listPhotos, photoObjectUrl, reframePhotos } from '../../tiles/photos/index.js';
import { getFocus, setFocus, resetFocus, positionFor, applyFocusFromSettings, DEFAULT_FOCUS } from '../../core/photo-focus.js';
import { getSettings } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';

const CARD_RATIO = 4 / 3; // shape of the Home photo card

export async function renderFramingSettings(container) {
  container.innerHTML = '<p class="muted">Loading photos...</p>';
  let photos;
  try {
    const [list, saved] = await Promise.all([listPhotos(), getSettings().catch(() => ({}))]);
    applyFocusFromSettings(saved.photoFocus);
    photos = list;
  } catch (err) {
    console.warn(err);
    container.innerHTML = '<p class="muted">Photos are not available right now.</p>';
    return;
  }
  if (!photos.length) {
    container.innerHTML = '<p class="muted">No photos yet. Choose some in Photos first.</p>';
    return;
  }

  container.innerHTML = `
    <p class="muted small">Faces are found automatically. If a photo is cropped badly on Home, tap it and choose the part to keep in view.</p>
    <div class="fr-grid">
      ${photos.map((p, i) => `
        <button type="button" class="fr-cell" data-i="${i}" aria-label="Frame photo ${i + 1}">
          <img alt="" draggable="false"><span class="fr-badge" hidden>Set by you</span>
        </button>`).join('')}
    </div>`;

  const cells = [...container.querySelectorAll('.fr-cell')];
  const urls = new Map(); // index -> object URL (revoked when the page goes)

  const paint = (i) => {
    const cell = cells[i]; const img = cell.querySelector('img');
    const f = getFocus(photos[i].name);
    cell.querySelector('.fr-badge').hidden = !(f && f.m);
    if (img.naturalWidth) {
      const box = cell.getBoundingClientRect();
      img.style.objectPosition = positionFor(f, img.naturalWidth, img.naturalHeight, box.width, box.height);
    }
  };

  // Thumbnails load as they scroll into view (each photo is downloaded once, then cached).
  const load = async (i) => {
    if (urls.has(i)) return;
    urls.set(i, null);
    try {
      const url = await photoObjectUrl(photos[i]);
      if (!container.isConnected) { URL.revokeObjectURL(url); return; }
      urls.set(i, url);
      const img = cells[i].querySelector('img');
      img.src = url;
      await img.decode().catch(() => {});
      paint(i);
    } catch { cells[i].classList.add('fr-failed'); }
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); load(+e.target.dataset.i); }
  }, { rootMargin: '200px' });
  cells.forEach((c) => io.observe(c));

  // Frees the thumbnails once this page is left.
  const gone = new MutationObserver(() => {
    if (container.isConnected) return;
    gone.disconnect(); io.disconnect();
    for (const u of urls.values()) if (u) URL.revokeObjectURL(u);
  });
  gone.observe(document.body, { childList: true, subtree: true });

  container.querySelector('.fr-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.fr-cell');
    if (!cell) return;
    const i = +cell.dataset.i;
    const url = urls.get(i);
    if (!url) { load(i); return; }
    openEditor(photos[i], url, () => paint(i), !!container.closest('.calm-page'));
  });
}

function openEditor(photo, url, onChange, glass) {
  openOverlay('Photo framing', (body) => {
    body.innerHTML = `
      <p class="muted small">Tap the part of the photo to keep in view.</p>
      <div class="fr-edit"><img alt="" draggable="false" src="${url}"><span class="fr-dot"></span></div>
      <p class="fr-label">How it looks on Home</p>
      <div class="fr-preview" style="aspect-ratio:${CARD_RATIO}"><img alt="" draggable="false" src="${url}"></div>
      <p class="fr-status muted small" aria-live="polite"></p>
      <div class="fr-actions">
        <button type="button" class="pill-btn" data-reset>Reset to automatic</button>
      </div>`;
    const wrap = body.querySelector('.fr-edit');
    const big = wrap.querySelector('img');
    const dot = wrap.querySelector('.fr-dot');
    const prev = body.querySelector('.fr-preview img');
    const status = body.querySelector('.fr-status');

    const show = () => {
      const f = getFocus(photo.name);
      const p = f || DEFAULT_FOCUS;
      dot.style.left = `${p.x * 100}%`;
      dot.style.top = `${p.y * 100}%`;
      const box = prev.parentElement.getBoundingClientRect();
      prev.style.objectPosition = positionFor(f, prev.naturalWidth, prev.naturalHeight, box.width, box.height);
      status.textContent = f && f.m ? 'Set by you.' : (f ? 'Automatic.' : 'Automatic (not checked yet).');
      body.querySelector('[data-reset]').hidden = !(f && f.m);
      onChange();
      reframePhotos();
    };
    Promise.all([big.decode(), prev.decode()]).catch(() => {}).then(show);

    wrap.addEventListener('click', (e) => {
      const r = big.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      setFocus(photo.name, x, y, true);
      show();
    });

    body.querySelector('[data-reset]').addEventListener('click', async () => {
      resetFocus(photo.name);
      status.textContent = 'Checking for faces...';
      try {
        const { findFocus } = await import('../../core/face-focus.js');
        const f = (await findFocus(big)) || DEFAULT_FOCUS;
        setFocus(photo.name, f.x, f.y);
      } catch { /* checked again when it next shows on Home */ }
      show();
    });
  }, { glass });
}
