// Quiet lines at the bottom of Home. Each provider returns
// { text, href } or null. Shown only after the morning check-in.
import { listKeyDates, quietLineText } from './keydates.js';
import { esc } from './wellbeing.js';

const providers = [
  // (The finance line was removed with the Money tab on 22/11/2026.)
  // Key dates: birthdays and life admin inside their reminder window.
  async () => {
    const text = quietLineText(await listKeyDates());
    return text ? { text, href: '#/hub/plan' } : null;
  },
];

export async function renderQuietLines(slot) {
  if (!slot) return;
  const lines = await Promise.all(providers.map((p) => p().catch((err) => { console.warn('Quiet line failed', err); return null; })));
  if (!slot.isConnected) return;
  slot.innerHTML = lines.filter(Boolean)
    .map((l) => `<a class="quiet-line" href="${l.href}">${esc(l.text)}</a>`).join('');
}
