// Quiet lines at the bottom of Home. Each provider returns
// { text, href } or null. Shown only after the morning check-in.
import { listKeyDates, quietLineText } from './keydates.js';
import { listPayments, quietFinanceText } from './money.js';
import { esc } from './wellbeing.js';

const providers = [
  // Finance: payments due in 7 days, renewals or cancel-by dates in 30. No amounts.
  async () => {
    const text = quietFinanceText(await listPayments());
    return text ? { text, href: '#/hub/money' } : null;
  },
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
