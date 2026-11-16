// Settings: Wall display (brief section 14). The switch is per device.
// The hub PIN (and "Also protect Wellbeing") can only be set from a
// non-wall device, i.e. the phone or PC.
import { isWall, setWall } from '../../core/device.js';
import { getHubPinSettings, setHubPin, setProtectWellbeing } from '../../core/hubpin.js';

async function renderPinControls(el) {
  const cfg = await getHubPinSettings();
  if (isWall()) {
    el.innerHTML = `<h3 class="w-head">Hub PIN</h3><p class="muted small">${cfg.hash ? 'A PIN is set.' : 'No PIN set yet.'} It can only be set or changed from your phone or PC.</p>`;
    return;
  }
  el.innerHTML = `
    <h3 class="w-head">Hub PIN for the wall display</h3>
    <p class="muted small">On wall displays, Money and Settings need this PIN. ${cfg.hash ? 'A PIN is set.' : '<strong>No PIN set yet.</strong>'} Your phone and PC never ask for it.</p>
    <form class="pay-form hubpin-form" autocomplete="off">
      <div class="field-pair">
        <label class="field"><span>${cfg.hash ? 'New PIN' : 'PIN'} (4 to 6 digits)</span><input name="pin1" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"></label>
        <label class="field"><span>Enter it again</span><input name="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password"></label>
      </div>
      <button class="primary-btn" type="submit">${cfg.hash ? 'Change PIN' : 'Set PIN'}</button>
    </form>
    <label class="check lock-check"><input type="checkbox" name="protectWb"${cfg.protectWellbeing ? ' checked' : ''}> Also protect Wellbeing on the wall display</label>
    <p class="form-msg" aria-live="polite"></p>`;
  const msg = el.querySelector('.form-msg');
  const say = (t, err = false) => { msg.textContent = t; msg.classList.toggle('error', err); };
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements;
    if (!/^\d{4,6}$/.test(f.pin1.value)) { say('The PIN must be 4 to 6 digits.', true); return; }
    if (f.pin1.value !== f.pin2.value) { say('Those PINs do not match.', true); return; }
    try { await setHubPin(f.pin1.value); await renderPinControls(el); el.querySelector('.form-msg').textContent = 'Hub PIN saved.'; }
    catch (err) { console.error(err); say('That did not save. Please try again.', true); }
  });
  el.querySelector('[name=protectWb]').addEventListener('change', async (e) => {
    try { await setProtectWellbeing(e.target.checked); say(e.target.checked ? 'Wellbeing now needs the PIN on the wall display.' : 'Wellbeing no longer needs the PIN on the wall display.'); }
    catch { e.target.checked = !e.target.checked; say('That did not save. Please try again.', true); }
  });
}

export async function renderWallSettings(body) {
  const on = isWall();
  body.innerHTML = `
    <p class="muted small">Turn this on for a tablet or screen on the wall at home. It uses its own layout, larger text, a clock, keeps the screen awake, always plays morning music on the speaker, and hides money figures. Only this device is affected.</p>
    <label class="check"><input type="checkbox" name="wall"${on ? ' checked' : ''}> This device is a wall display</label>
    <p class="form-msg" aria-live="polite"></p>
    <div class="wall-pin"></div>`;
  renderPinControls(body.querySelector('.wall-pin')).catch((err) => console.error('Hub PIN settings failed', err));
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
