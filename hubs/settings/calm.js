// Settings in the calm style (phone, Calm chosen): a list of sections, each
// opening its own page at #/hub/settings/<id>. The back gesture and the
// "Settings" link both go back one step. Drawn by hubs/settings/index.js.

const DESC = {
  music: 'Playlists and where it plays',
  phrases: 'Your own daily lines',
  habits: 'Check-in questions',
  timers: 'Quick start times',
  morning: 'Topics and sections',
  breathing: 'Gentle vibration',
  homestyle: 'Calm or tiles',
  background: 'Scenes and rotation',
  photos: 'Slideshow and import',
  framing: 'Choose what each photo shows',
  lock: 'PIN and fingerprint',
  wall: 'Wall display and hub PIN',
  backup: 'Download or restore your data',
};

const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
const subId = () => (location.hash.match(/^#\/hub\/settings\/([\w-]+)/) || [])[1] || null;

export function renderCalmSettings(container, { groups, sections, onSignOut }) {
  const hub = container.closest('.calm-page');
  const head = hub.querySelector('.hub-head');
  const id = subId();
  const sec = id && sections.find((s) => s.id === id);

  if (!sec) {
    // Coming back from Spotify or Google: go straight to that section's page.
    const auto = sections.find((s) => s.autoOpen && s.autoOpen());
    if (auto) { location.replace(`#/hub/settings/${auto.id}`); return; }
    container.innerHTML = groups.map((g) => {
      const inGroup = sections.filter((s) => s.group === g.id);
      if (!inGroup.length) return '';
      return `<h2 class="set-gt">${g.title}</h2>
        <div class="card set-list">${inGroup.map((s) => `
          <a class="set-row" href="#/hub/settings/${s.id}">
            <span><span class="set-row-title">${s.title}</span><small>${DESC[s.id] || ''}</small></span>${CHEV}
          </a>`).join('')}</div>`;
    }).join('') + '<p class="signout"><button class="link-btn" id="signout-btn">Sign out</button></p>';
    container.querySelector('#signout-btn').addEventListener('click', onSignOut);
    return;
  }

  // One section's own page.
  head.querySelector('h1').textContent = sec.title;
  head.querySelector('.calm-page-sub').textContent = (groups.find((g) => g.id === sec.group) || {}).title || '';
  const back = document.createElement('a');
  back.className = 'set-back';
  back.href = '#/hub/settings';
  back.innerHTML = `${CHEV}Settings`;
  hub.insertBefore(back, head);
  container.innerHTML = '<div class="card set-page"><div class="set-body"><p class="muted small">Loading...</p></div></div>';
  const body = container.querySelector('.set-body');
  Promise.resolve(sec.render(body)).catch((err) => {
    console.error(`Settings section ${sec.id} failed`, err);
    body.innerHTML = '<p class="muted small">Not available right now. Go back and try again.</p>';
  });
}
