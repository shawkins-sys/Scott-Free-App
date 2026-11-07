// Money hub "Spending" tab: profit and loss by pay period or calendar month,
// spending by category chart, expenses tracker and the transaction list.
import { Chart } from 'https://cdn.jsdelivr.net/npm/chart.js@4.6.1/auto/+esm';
import { payContext, payPeriod, addDays } from '../../core/payschedule.js';
import { listTransactions, updateTransaction, summarise, expensesTotals } from '../../core/statement.js';
import { listCategories, money } from '../../core/money.js';
import { formatKey } from '../../core/keydates.js';
import { todayKey } from '../../core/date.js';
import { esc } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';

const KIND_LABEL = { salary: 'Salary', expenses_repaid: 'Expenses repaid', income: 'Income', transfer: 'Transfer' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const view = { mode: 'pay', day: null }; // remembered while the app is open
let chart = null;

function monthRange(day) {
  const [y, m] = day.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { start, end, label: `${MONTHS[m - 1]} ${y}` };
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export async function renderSpending(pane) {
  if (!view.day) view.day = todayKey();
  const [ctx, cats] = await Promise.all([payContext(), listCategories()]);
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || 'Uncategorised';

  let range;
  if (view.mode === 'pay') {
    const p = payPeriod(ctx, view.day);
    range = { start: p.start, end: p.end, label: `${formatKey(p.start)} to ${formatKey(addDays(p.end, -1))}` };
  } else {
    range = monthRange(view.day);
  }

  const [txs, exp] = await Promise.all([
    listTransactions({ from: range.start, to: range.end }),
    expensesTotals().catch(() => null),
  ]);
  const s = summarise(txs, cats);
  const isCurrent = range.start <= todayKey() && todayKey() < range.end;

  pane.innerHTML = `
    <div class="card">
      <div class="seg">
        <button class="seg-btn${view.mode === 'pay' ? ' active' : ''}" data-mode="pay">Pay period</button>
        <button class="seg-btn${view.mode === 'month' ? ' active' : ''}" data-mode="month">Calendar month</button>
      </div>
      <div class="period-nav">
        <button class="icon-btn" data-step="-1" aria-label="Previous">&lsaquo;</button>
        <span>${range.label}${isCurrent ? ' <span class="muted small">(so far)</span>' : ''}</span>
        <button class="icon-btn" data-step="1" aria-label="Next">&rsaquo;</button>
      </div>
      <dl class="pl">
        <div><dt>Income</dt><dd>${money(s.income)}</dd></div>
        <div><dt>Spending</dt><dd>${money(s.spending)}</dd></div>
        <div><dt>Saved</dt><dd>${money(s.saved)}</dd></div>
        <div class="pl-total"><dt>Left over</dt><dd>${money(s.left)}</dd></div>
      </dl>
      <p class="muted small">Income excludes expenses repaid. Spending excludes claimable items, transfers and savings.
        ${s.review ? `${s.review} transaction${s.review === 1 ? '' : 's'} still to review.` : ''}</p>
    </div>
    <div class="card">
      <h2 class="card-title">Spending by category</h2>
      ${s.categories.length ? '<div class="chart-wrap"><canvas aria-label="Spending by category"></canvas></div>' : '<p class="muted small">No spending in this period.</p>'}
    </div>
    <div class="card">
      <h2 class="card-title">Expenses tracker</h2>
      ${exp ? `<dl class="pl">
        <div><dt>Claimed</dt><dd>${money(exp.claimed)}</dd></div>
        <div><dt>Repaid</dt><dd>${money(exp.repaid)}</dd></div>
        <div class="pl-total"><dt>Owed to you</dt><dd>${money(exp.outstanding)}</dd></div>
      </dl><p class="muted small">Running totals across all imports.</p>` : '<p class="muted small">Not available right now.</p>'}
    </div>
    <div class="card">
      <h2 class="card-title">Transactions</h2>
      ${txs.length ? `<ul class="row-list">${txs.map((t) => `
        <li><button class="row-btn" data-tx="${t.id}">
          <span>${esc(t.description)}<span class="muted small block">${formatKey(t.tx_date)} &middot; ${
            t.amount > 0 ? (KIND_LABEL[t.kind] || 'Income') : t.kind === 'transfer' ? 'Transfer' : esc(catName(t.category_id))}${
            t.claimable ? ' &middot; Claimable' : ''}${t.needs_review ? ' &middot; To review' : ''}</span></span>
          <span class="amt${t.amount > 0 ? ' in' : ''}">${t.amount > 0 ? '+' : ''}${money(t.amount)}</span>
        </button></li>`).join('')}</ul>` : '<p class="muted small">No transactions in this period. Import a statement in Pay &amp; import.</p>'}
    </div>`;

  // Chart
  if (chart) { chart.destroy(); chart = null; }
  const canvas = pane.querySelector('canvas');
  if (canvas) {
    const text = cssVar('--text') || '#333';
    const grid = cssVar('--border') || '#ddd';
    canvas.parentElement.style.height = `${Math.max(160, s.categories.length * 34 + 40)}px`;
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: s.categories.map((c) => c.name),
        datasets: [{ data: s.categories.map((c) => c.total), backgroundColor: cssVar('--accent') || '#3f7fd9', borderRadius: 6, maxBarThickness: 22 }],
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.x) } } },
        scales: {
          x: { ticks: { color: text, callback: (v) => `£${v}` }, grid: { color: grid } },
          y: { ticks: { color: text }, grid: { display: false } },
        },
      },
    });
  }

  // Controls
  pane.onclick = (e) => {
    const mode = e.target.closest('[data-mode]');
    if (mode) { view.mode = mode.dataset.mode; renderSpending(pane); return; }
    const step = e.target.closest('[data-step]');
    if (step) {
      const n = Number(step.dataset.step);
      view.day = n < 0 ? addDays(range.start, -1) : range.end;
      renderSpending(pane);
      return;
    }
    const row = e.target.closest('[data-tx]');
    if (row) {
      const t = txs.find((x) => x.id === row.dataset.tx);
      if (t) openTx(t, cats, () => renderSpending(pane));
    }
  };
}

// Edit one transaction: category or kind, claimable and claim reference.
function openTx(t, cats, onSaved) {
  const close = openOverlay('Transaction', (body) => {
    const credit = t.amount > 0;
    body.innerHTML = `
      <p><strong>${esc(t.description)}</strong><br>${formatKey(t.tx_date)} &middot; ${credit ? '+' : ''}${money(t.amount)}</p>
      <form class="pay-form">
        ${credit ? `
          <label class="field"><span>Type</span><select name="kind">
            ${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}"${(t.kind || 'income') === k ? ' selected' : ''}>${l}</option>`).join('')}
          </select></label>` : `
          <label class="field"><span>Category</span><select name="category">
            <option value="">Uncategorised</option>
            ${cats.map((c) => `<option value="${c.id}"${t.category_id === c.id && t.kind !== 'transfer' ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
            <option value="transfer"${t.kind === 'transfer' ? ' selected' : ''}>Transfer (ignored)</option>
          </select></label>
          <label class="check"><input type="checkbox" name="claimable"${t.claimable ? ' checked' : ''}> Claimable (work expense)</label>
          <label class="field"><span>Claim reference (optional, to match Xero)</span>
            <input name="claim_ref" maxlength="40" value="${esc(t.claim_ref || '')}"></label>`}
        <p class="form-msg" aria-live="polite"></p>
        <button class="primary-btn" type="submit">Save</button>
      </form>`;
    const f = body.querySelector('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const el = f.elements;
      let fields;
      if (credit) fields = { kind: el.kind.value, needs_review: false };
      else {
        const cat = el.category.value;
        const claimable = el.claimable.checked;
        fields = {
          category_id: cat && cat !== 'transfer' ? cat : null,
          kind: cat === 'transfer' ? 'transfer' : null,
          claimable,
          claim_ref: claimable ? (el.claim_ref.value.trim() || null) : null,
          needs_review: !cat,
        };
      }
      try { await updateTransaction(t.id, fields); close(); await onSaved(); } catch (err) {
        console.error(err);
        const msg = f.querySelector('.form-msg');
        msg.classList.add('error');
        msg.textContent = 'That did not save. Please try again.';
      }
    });
  });
}
