// Money hub "Pay & import" tab: pay schedule, statement import and review.
// Also exports the Settings section for pay and income settings.
import { payContext, paydays, getPaySettings, savePaySettings, setOverride } from '../../core/payschedule.js';
import { importStatement, listTransactions, updateTransaction, addRule, suggestPattern,
  getMoneySettings, saveMoneySettings, lastImport } from '../../core/statement.js';
import { listCategories, money } from '../../core/money.js';
import { formatKey } from '../../core/keydates.js';
import { todayKey } from '../../core/date.js';
import { esc } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';

// Kinds for incoming money. Outgoings use a category, or Transfer.
const CREDIT_KINDS = [['income', 'Other income'], ['salary', 'Salary'], ['expenses_repaid', 'Expenses repaid'], ['transfer', 'Transfer (ignored)']];

export async function renderPayImport(pane) {
  pane.innerHTML = `
    <div class="card" id="mi-pay"></div>
    <div class="card" id="mi-import"></div>
    <div class="card" id="mi-review"></div>`;
  await Promise.all([
    renderPay(pane.querySelector('#mi-pay')),
    renderImport(pane.querySelector('#mi-import'), () => renderReview(pane.querySelector('#mi-review'))),
    renderReview(pane.querySelector('#mi-review')),
  ]);
}

// ---------- Pay schedule ----------

async function renderPay(card) {
  const ctx = await payContext();
  const today = todayKey();
  const list = paydays(ctx, today, 7).filter((p) => p.actual >= today).slice(0, 6);
  const rule = (await getPaySettings()).holidayRule;
  card.innerHTML = `
    <h2 class="card-title">Paydays</h2>
    <ul class="row-list">${list.map((p) => `
      <li class="cat-row" data-s="${p.scheduled}">
        <span>${formatKey(p.actual)}${p.actual !== p.scheduled ? ` <span class="muted small">(moved from ${formatKey(p.scheduled)})</span>` : ''}</span>
        <button class="link-btn" data-change>Change</button>
      </li>`).join('')}</ul>
    <p class="muted small">Every 4 weeks on a Friday. If payday is a bank holiday, pay moves to ${rule === 'before' ? 'the working day before' : 'the next working day'} (change this in Settings).</p>`;
  card.querySelector('.row-list').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-change]')) return;
    const s = e.target.closest('[data-s]').dataset.s;
    const input = window.prompt(`Actual pay date for the payday scheduled ${formatKey(s)} (DD/MM/YYYY). Leave empty to undo a change.`, '');
    if (input === null) return;
    const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (input.trim() && !m) { window.alert('Please use DD/MM/YYYY.'); return; }
    const actual = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
    try { await setOverride(s, actual); renderPay(card); } catch (err) { console.error(err); window.alert('That did not save. Please try again.'); }
  });
}

// ---------- Import ----------

async function renderImport(card, onImported) {
  const last = await lastImport().catch(() => null);
  card.innerHTML = `
    <h2 class="card-title">Import statement</h2>
    <p class="muted small">${last ? `Last import ${formatKey(last.imported_at.slice(0, 10))}, covering ${formatKey(last.period_start)} to ${formatKey(last.period_end)}.` : 'No statements imported yet.'}
      Download a statement PDF from the Lloyds app (or a CSV from the Lloyds website), then choose it here. Importing the same period twice is safe.</p>
    <div class="btn-row">
      <label class="primary-btn file-btn">Import statement<input type="file" data-import accept=".pdf,application/pdf,.csv,text/csv" hidden></label>
      <label class="pill-btn file-btn">Check statement<input type="file" data-check accept=".pdf,application/pdf" hidden></label>
    </div>
    <p class="muted small">Check statement reads a PDF and shows what the app would import. Nothing is saved.</p>
    <p class="form-msg" aria-live="polite"></p>`;
  card.querySelector('[data-check]').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) openCheck(file);
  });
  const msg = card.querySelector('.form-msg');
  card.querySelector('[data-import]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    msg.classList.remove('error');
    msg.textContent = 'Importing...';
    try {
      const r = await importStatement(file);
      msg.textContent = `Imported ${formatKey(r.start)} to ${formatKey(r.end)}: ${r.added} new, ${r.skipped} already imported.`
        + (r.review ? ` ${r.review} to review below.` : '');
      await onImported();
    } catch (err) {
      console.error(err);
      msg.classList.add('error');
      msg.textContent = err.message && !/fetch|network|PGRST|JWT/i.test(err.message) ? err.message : 'The import did not complete. Please try again.';
    }
  });
}

// ---------- Check statement (reads a PDF, saves nothing) ----------

function openCheck(file) {
  openOverlay('Check statement', async (body) => {
    body.innerHTML = '<p class="muted">Reading the PDF on this device...</p>';
    let res;
    try {
      const { checkPdfStatement } = await import('../../core/statement-pdf.js');
      res = await checkPdfStatement(file);
    } catch (err) {
      console.error(err);
      body.innerHTML = '<p class="form-msg error">This PDF could not be read.</p>';
      return;
    }
    const { lines, rows } = res;
    const totalIn = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const totalOut = rows.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);
    const withBal = rows.filter((r) => r.balance != null);
    // Running balance check: each balance should equal the previous balance plus the amount.
    let breaks = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1].balance;
      const b = rows[i].balance;
      if (a != null && b != null && Math.abs(a + rows[i].amount - b) > 0.005) breaks++;
    }
    body.innerHTML = `
      <p>${rows.length ? `Found <strong>${rows.length}</strong> transactions from ${formatKey(rows[0].tx_date)} to ${formatKey(rows[rows.length - 1].tx_date)}.` : '<strong>No transactions found.</strong>'}</p>
      ${rows.length ? `<dl class="pl">
        <div><dt>Money in</dt><dd>${money(totalIn)}</dd></div>
        <div><dt>Money out</dt><dd>${money(totalOut)}</dd></div>
        <div><dt>Rows with a balance</dt><dd>${withBal.length} of ${rows.length}</dd></div>
        <div class="pl-total"><dt>Balance check</dt><dd>${breaks ? `${breaks} gap${breaks === 1 ? '' : 's'}` : 'All add up'}</dd></div>
      </dl>
      <p class="muted small">Compare these with your statement. Anything wrong? Use Copy layout below and paste it to Claude.</p>
      <ul class="row-list check-list">${rows.map((r) => `
        <li class="check-row"><span>${formatKey(r.tx_date)}<span class="muted small block">${esc(r.description)}</span></span>
          <span class="amt${r.amount > 0 ? ' in' : ''}">${r.amount > 0 ? '+' : ''}${money(r.amount)}<span class="muted small block">${r.balance != null ? money(r.balance) : 'no balance'}</span></span></li>`).join('')}</ul>` : '<p class="muted small">Use Copy layout below and paste it to Claude so the reader can be adjusted.</p>'}
      <div class="btn-row"><button class="primary-btn" data-copy>Copy layout</button></div>
      <p class="muted small">Copy layout copies the page structure with every letter changed to x and every number to 9 (headings like Date and Balance are kept). No names, amounts or account details are included.</p>
      <p class="form-msg" aria-live="polite"></p>`;
    const msg = body.querySelector('.form-msg');
    body.querySelector('[data-copy]').addEventListener('click', async () => {
      const { maskedLayout } = await import('../../core/statement-pdf.js');
      const text = `Scott Free statement layout (masked)\n${maskedLayout(lines)}`;
      try {
        await navigator.clipboard.writeText(text);
        msg.textContent = 'Copied. Paste it into your chat with Claude.';
      } catch {
        // Clipboard blocked: show it to copy by hand.
        msg.innerHTML = '<textarea class="layout-box" readonly></textarea>';
        msg.querySelector('textarea').value = text;
        msg.querySelector('textarea').select();
      }
    });
  });
}

// ---------- Review ----------

async function renderReview(card) {
  const [items, cats] = await Promise.all([listTransactions({ reviewOnly: true }), listCategories()]);
  if (!items.length) {
    card.innerHTML = '<h2 class="card-title">Review</h2><p class="muted small">Nothing to review.</p>';
    return;
  }
  const catOpts = (sel) => `<option value="">Choose category</option>
    ${cats.map((c) => `<option value="${c.id}"${sel === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
    <option value="transfer">Transfer (ignored)</option>`;
  card.innerHTML = `
    <h2 class="card-title">Review (${items.length})</h2>
    <p class="muted small">Transactions the app was unsure about. Tick "Claimable" for work expenses.</p>
    <ul class="row-list review-list">${items.map((t) => `
      <li class="review-item" data-id="${t.id}">
        <div class="review-head"><span>${formatKey(t.tx_date)} &middot; ${esc(t.description)}</span>
          <span class="amt${t.amount > 0 ? ' in' : ''}">${t.amount > 0 ? '+' : ''}${money(t.amount)}</span></div>
        ${t.amount > 0 ? `
          <select name="kind">${CREDIT_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>` : `
          <select name="category">${catOpts(t.category_id)}</select>
          <label class="check"><input type="checkbox" name="claimable"> Claimable (work expense)</label>
          <input name="claim_ref" placeholder="Claim reference (optional)" maxlength="40" hidden>
          <label class="check"><input type="checkbox" name="remember" checked> Remember for
            <input name="pattern" value="${esc(suggestPattern(t.description))}" maxlength="40" class="inline-input"></label>`}
        <button class="pill-btn" data-confirm>Confirm</button>
      </li>`).join('')}</ul>
    <p class="form-msg" aria-live="polite"></p>`;
  const msg = card.querySelector('.form-msg');

  card.addEventListener('change', (e) => {
    if (e.target.name === 'claimable') e.target.closest('li').querySelector('[name=claim_ref]').hidden = !e.target.checked;
  });
  card.querySelector('.review-list').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-confirm]')) return;
    const li = e.target.closest('[data-id]');
    const t = items.find((x) => x.id === li.dataset.id);
    const q = (n) => li.querySelector(`[name=${n}]`);
    msg.classList.remove('error');
    msg.textContent = '';
    try {
      if (t.amount > 0) {
        const kind = q('kind').value;
        await updateTransaction(t.id, { kind, needs_review: false });
        if (kind === 'salary') await saveMoneySettings({ lastSalary: t.amount });
      } else {
        const cat = q('category').value;
        if (!cat) { msg.classList.add('error'); msg.textContent = 'Please choose a category.'; return; }
        const transfer = cat === 'transfer';
        const claimable = q('claimable').checked;
        await updateTransaction(t.id, {
          category_id: transfer ? null : cat, kind: transfer ? 'transfer' : null, claimable,
          claim_ref: claimable ? (q('claim_ref').value.trim() || null) : null, needs_review: false,
        });
        if (!transfer && q('remember').checked && q('pattern').value.trim()) {
          const n = await addRule(q('pattern').value, cat);
          if (n) msg.textContent = `Also applied to ${n} similar transaction${n === 1 ? '' : 's'}.`;
        }
      }
      await renderReview(card);
    } catch (err) {
      console.error(err);
      msg.classList.add('error');
      msg.textContent = 'That did not save. Please try again.';
    }
  });
}

// ---------- Settings page section: Pay and income ----------

export async function renderPayIncomeSettings(card) {
  const [m, pay] = await Promise.all([getMoneySettings(), getPaySettings()]);
  card.innerHTML = `
    <label class="field"><span>If payday is a bank holiday, pay on</span>
      <select name="rule">
        <option value="after"${pay.holidayRule === 'after' ? ' selected' : ''}>The next working day</option>
        <option value="before"${pay.holidayRule === 'before' ? ' selected' : ''}>The working day before</option>
      </select></label>
    <p class="muted small">Paid every 4 weeks on a Friday. Individual paydays can be changed in Money, Pay &amp; import.</p>
    <form class="pay-form">
      <label class="field"><span>Employer payer description (as it appears on the statement)</span>
        <input name="employer" maxlength="60" value="${esc(m.employerPattern)}" placeholder="To confirm from your sample statement"></label>
      <label class="field"><span>Usual salary (£). Updated automatically from each salary payment</span>
        <input name="salary" type="number" inputmode="decimal" step="0.01" min="0" value="${m.lastSalary ?? ''}"></label>
      <p class="muted small">An employer payment on a payday within 15% of your usual salary counts as Salary. Any other employer payment counts as Expenses repaid.</p>
      <button class="primary-btn" type="submit">Save</button>
      <p class="form-msg" aria-live="polite"></p>
    </form>`;
  card.querySelector('[name=rule]').addEventListener('change', async (e) => {
    try { await savePaySettings({ holidayRule: e.target.value }); } catch (err) { console.error(err); window.alert('That did not save. Please try again.'); }
  });
  const f = card.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = f.querySelector('.form-msg');
    try {
      await saveMoneySettings({
        employerPattern: f.elements.employer.value.trim(),
        lastSalary: parseFloat(f.elements.salary.value) || null,
      });
      msg.classList.remove('error');
      msg.textContent = 'Saved.';
    } catch (err) { console.error(err); msg.classList.add('error'); msg.textContent = 'That did not save. Please try again.'; }
  });
}
