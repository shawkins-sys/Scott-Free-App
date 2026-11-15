// Settings: Wall display (brief section 14). The switch is per device.
// Hub PIN controls are added in part B.
import { isWall, setWall } from '../../core/device.js';

export async function renderWallSettings(body) {
  const on = isWall();
  body.innerHTML = `
    <p class="muted small">Turn this on for a tablet or screen on the wall at home. It uses its own layout, larger text, a clock, keeps the screen awake, always plays morning music on the speaker, and hides money figures. Only this device is affected.</p>
    <label class="check"><input type="checkbox" name="wall"${on ? ' checked' : ''}> This device is a wall display</label>
    <p class="form-msg" aria-live="polite"></p>`;
  body.querySelector('[name=wall]').addEventListener('change', (e) => {
    const turnOn = e.target.checked;
    const msg = turnOn
      ? 'Make this device a wall display? The app will reload with the wall layout. It will not ask for the app lock PIN on this device.'
      : 'Turn off wall display on this device? The app will reload as a normal device and ask you to set an app lock PIN.';
    if (!window.confirm(msg)) { e.target.checked = !turnOn; return; }
    setWall(turnOn);
    location.hash = '#/';
    location.reload();
  });
}
