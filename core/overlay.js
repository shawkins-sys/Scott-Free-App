// Full-screen panel used for expanded tiles and detail views.
import { icons } from './icons.js';

let active = null; // teardown of the overlay currently open (its history entry is reused)

export function openOverlay(title, renderFn, opts = {}) {
  // A second overlay replaces the first and reuses its history entry.
  const replacing = active ? active(false) : false;
  const root = document.getElementById('overlay');
  root.innerHTML = `
    <div class="overlay-panel" role="dialog" aria-modal="true" aria-label="${title}">
      <header class="overlay-head">
        <h2>${title}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icons.close}</button>
      </header>
      <div class="overlay-body"></div>
    </div>`;
  // Glass on calm pages (Scott, 26/11/2026): any pop-up opened while a calm
  // page or calm Home is showing uses the floating glass panel, unless the
  // caller passes { glass: false } (full-screen photos). Tiles style, the wall
  // and computers never show calm pages, so they keep the plain panel.
  const glass = opts.glass ?? !!document.querySelector('#app .calm-page, #app .home.calm');
  root.classList.toggle('glass', glass);
  root.querySelector('.overlay-body').classList.toggle('calm-page', glass);
  root.hidden = false;
  document.body.classList.add('no-scroll');

  // Back gesture / back button closes the overlay instead of leaving the page.
  const mark = { sfOverlay: Date.now() };
  if (replacing) history.replaceState(mark, ''); else history.pushState(mark, '');
  let closed = false;
  const onPop = () => close(false);

  // fromUi true: user closed it, so drop our history entry. false: back already did.
  function close(fromUi = true) {
    if (closed) return false;
    closed = true;
    active = null;
    window.removeEventListener('popstate', onPop);
    root.hidden = true;
    root.classList.remove('glass');
    root.innerHTML = '';
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
    if (opts.onClose) { try { opts.onClose(); } catch (err) { console.error(err); } }
    const own = history.state && history.state.sfOverlay === mark.sfOverlay;
    if (fromUi === true && own) history.back();
    return own;
  }
  active = close;
  window.addEventListener('popstate', onPop);
  const onKey = (e) => { if (e.key === 'Escape') close(true); };
  document.addEventListener('keydown', onKey);
  root.querySelector('[data-close]').addEventListener('click', () => close(true));
  root.addEventListener('click', (e) => { if (e.target === root) close(true); }, { once: true });

  Promise.resolve(renderFn(root.querySelector('.overlay-body'))).catch((err) => {
    console.error(err);
    root.querySelector('.overlay-body').innerHTML = '<p class="muted">Not available right now.</p>';
  });
  return close;
}
