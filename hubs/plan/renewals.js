// One-off card (22/11/2026): the Money tab was removed, so renewal and end
// dates from the old payments can be copied into Key dates as life admin,
// without amounts. Shown at the top of Plan until done or dismissed
// (settings.data.renewalsCopied). Payments themselves stay in the database.
import { getSettings, updateSettings, esc } from '../../core/wellbeing.js';
import { listPayments, cancelBy } from '../../core/money.js';
import { saveKeyDate, formatKey } from '../../core/keydates.js';

export async function renderRenewalCopy(card, { onDone } = {}) {
  let settings;
  let pays;
  try {
    settings = await getSettings();
    if (settings.renewalsCopied) { card.remove(); return; }
    pays = (await listPayments()).filter((p) => p.end_date);
  } catch { card.remove(); return; }
  if (!pays.length) { card.remove(); return; }

  card.innerHTML = `
    <h2 class="card-title">Copy renewal dates</h2>
    <p class="muted small">Money has been removed. Tick any renewal or end dates you want kept as reminders in Key dates (no amounts are copied).</p>
    <ul class="rn-list">
      ${pays.map((p) => `<li><label class="check"><input type="checkbox" value="${p.id}" checked>
        <span><strong>${esc(p.provider)}</strong>${p.plan_name ? ` ${esc(p.plan_name)}` : ''}
        <span class="muted small">${formatKey(p.end_date)}</span></span></label></li>`).join('')}
    </ul>
    <div class="btn-row" style="flex-wrap: wrap">
      <button class="primary-btn" type="button" data-copy>Copy ticked to Key dates</button>
      <button class="pill-btn" type="button" data-skip>No thanks</button>
    </div>
    <p class="form-msg" aria-live="polite"></p>`;

  const msg = card.querySelector('.form-msg');
  const finish = async () => {
    await updateSettings({ renewalsCopied: true });
    card.remove();
    if (onDone) onDone();
  };

  card.querySelector('[data-skip]').addEventListener('click', () => finish().catch(() => { msg.textContent = 'That did not save. Please try again.'; }));
  card.querySelector('[data-copy]').addEventListener('click', async (e) => {
    const ids = [...card.querySelectorAll('input:checked')].map((i) => i.value);
    e.target.disabled = true;
    msg.textContent = 'Copying...';
    try {
      for (const p of pays.filter((x) => ids.includes(x.id))) {
        const cb = cancelBy(p);
        const notes = [p.plan_name, p.notice_period && `Notice: ${p.notice_period}`, cb && `cancel by ${formatKey(cb)}`]
          .filter(Boolean).join(', ');
        await saveKeyDate({
          kind: 'life_admin',
          title: `${p.provider} renewal`,
          due_date: p.end_date,
          repeat_rule: p.frequency === 'annual' ? 'yearly' : 'none',
          repeat_every: 1,
          notes: notes || null,
          lead_days: [30, 0],
        });
      }
      await finish();
    } catch (err) {
      console.error(err);
      e.target.disabled = false;
      msg.textContent = 'Some dates did not copy. Please try again.';
    }
  });
}
