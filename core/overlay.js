// Full-screen panel used for expanded tiles and detail views.
import { icons } from './icons.js';

export function openOverlay(title, renderFn) {
  const root = document.getElementById('overlay');
  root.innerHTML = `
    <div class="overlay-panel" role="dialog" aria-modal="true" aria-label="${title}">
      <header class="overlay-head">
        <h2>${title}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icons.close}</button>
      </header>
      <div class="overlay-body"></div>
    </div>`;
  root.hidden = false;
  document.body.classList.add('no-scroll');

  const close = () => {
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('[data-close]').addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); }, { once: true });

  Promise.resolve(renderFn(root.querySelector('.overlay-body'))).catch((err) => {
    console.error(err);
    root.querySelector('.overlay-body').innerHTML = '<p class="muted">Not available right now.</p>';
  });
  return close;
}
