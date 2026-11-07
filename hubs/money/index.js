// Money hub, part 1: overview alerts and recurring payments.
// Part 2 (Phase 6) adds pay schedule, statement import, review, P&L and expenses.
import { listCategories, addCategory, renameCategory, deleteCategory, listPayments, savePayment,
  deletePayment, nextDue, cancelBy, dueSoon, renewalsSoon, alertText, money, whenText,
  sensitiveNumberWarning, FREQUENCIES, TYPES, WEEKDAYS, label } from '../../core/money.js';
import { daysBetween, formatKey } from '../../core/keydates.js';
import { todayKey } from '../../core/date.js';
import { esc } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';
import { renderPayImport } from './import.js';
import { lastImport } from '../../core/statement.js';

const FIELD_LABELS = {
  provider: 'Provider', plan_name: 'Plan name', bank_name: 'Bank', contract_length: 'Contract length',
  notice_period: 'Notice period', customer_ref: 'Customer reference', contact: 'Contact or website',
  plan_details: 'Plan details', notes: 'Notes',
};

let cats = [];
let pays = [];
let filter = 'all';
const catName = (id) => (cats.find((c) => c.id === id) || {}).name || 'Uncategorised';

function dayText(p) {
  if (p.frequency === 'weekly' && p.payment_day) return `Every ${WEEKDAYS[p.payment_day - 1]}`;
  if (p.frequency === 'monthly' && p.payment_day) return `Day ${p.payment_day} each month`;
  if ((p.frequency === 'quarterly' || p.frequency === 'annual') && p.start_date) return `From ${formatKey(p.start_date)}`;
  return '';
}

// ---------- Overview ----------

function overviewHtml() {
  const today = todayKey();
  const due = dueSoon(pays, today);
  const ren = renewalsSoon(pays, today);
  const dueRows = due.map(({ p, date, days }) => `
    <li><button class="row-btn" data-open="${p.id}">
      <span>${esc(p.provider)}<span class="muted small"> ${formatKey(date)}, ${whenText(days)}</span></span>
      <span class="amt">${money(p.amount)}</span></button></li>`).join('');
  const renRows = ren.map((a) => `
    <li class="alert-row"><button class="row-btn" data-open="${a.p.id}"><span>${esc(alertText(a))}</span></button></li>`).join('');
  return `
    <h2 class="card-title">Next 7 days</h2>
    ${dueRows ? `<ul class="row-list">${dueRows}</ul>` : '<p class="muted small">No payments due in the next 7 days.</p>'}
    <h2 class="card-title sub">Renewing or ending in the next 30 days</h2>
    ${renRows ? `<ul class="row-list">${renRows}</ul>` : '<p class="muted small">Nothing renewing or ending soon.</p>'}`;
}

// ---------- Payments list ----------

function listHtml() {
  const counts = new Map();
  pays.forEach((p) => counts.set(p.category_id, (counts.get(p.category_id) || 0) + 1));
  const chips = [['all', `All (${pays.length})`], ...cats.filter((c) => counts.get(c.id)).map((c) => [c.id, `${c.name} (${counts.get(c.id)})`])];
  if (counts.get(null)) chips.push(['none', `Uncategorised (${counts.get(null)})`]);
  const shown = pays.filter((p) => filter === 'all' || (filter === 'none' ? !p.category_id : p.category_id === filter));
  const today = todayKey();
  const rows = shown.map((p) => {
    const nd = nextDue(p, today);
    return `
      <li><button class="row-btn" data-open="${p.id}">
        <span>${esc(p.provider)}${p.plan_name ? ` <span class="muted">${esc(p.plan_name)}</span>` : ''}
          <span class="muted small block">${esc(catName(p.category_id))} &middot; ${label(FREQUENCIES, p.frequency)}${nd ? ` &middot; next ${formatKey(nd)}` : ''}</span></span>
        <span class="amt">${money(p.amount)}</span></button></li>`;
  }).join('');
  return `
    <div class="card-row"><h2 class="card-title">Payments</h2><button class="pill-btn" data-add>Add</button></div>
    <div class="chips">${chips.map(([id, t]) => `<button class="chip${filter === id ? ' active' : ''}" data-filter="${id}">${esc(t)}</button>`).join('')}</div>
    ${rows ? `<ul class="row-list">${rows}</ul>` : '<p class="muted small">No payments yet. Tap Add to enter your direct debits, standing orders and subscriptions.</p>'}
    <p><button class="link-btn" data-cats>Manage categories</button></p>`;
}

// ---------- Detail ----------

function openDetail(p, refresh) {
  const today = todayKey();
  const nd = nextDue(p, today);
  const cb = cancelBy(p);
  const line = (k, v) => (v ? `<div class="dl-row"><dt>${k}</dt><dd>${v}</dd></div>` : '');
  const link = (v) => (/^https?:\/\//i.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v));
  const close = openOverlay(p.provider, (body) => {
    body.innerHTML = `
      <dl class="dl">
        ${line('Plan', esc(p.plan_name))}
        ${line('Amount', `${money(p.amount)} ${label(FREQUENCIES, p.frequency).toLowerCase()}`)}
        ${line('Next payment', nd ? `${formatKey(nd)} (${whenText(daysBetween(today, nd))})` : '')}
        ${line('Payment day', dayText(p))}
        ${line('Category', esc(catName(p.category_id)))}
        ${line('Payment type', label(TYPES, p.payment_type))}
        ${line('Bank', esc(p.bank_name))}
        ${line('Start date', p.start_date && formatKey(p.start_date))}
        ${line('End or renewal date', p.end_date && formatKey(p.end_date))}
        ${line('Contract length', esc(p.contract_length))}
        ${line('Notice period', esc(p.notice_period))}
        ${line('Cancel by', cb && formatKey(cb))}
        ${line('Customer reference', esc(p.customer_ref))}
        ${line('Contact', p.contact && link(p.contact))}
        ${line('Plan details', p.plan_details && esc(p.plan_details).replace(/\n/g, '<br>'))}
        ${line('Notes', p.notes && esc(p.notes).replace(/\n/g, '<br>'))}
      </dl>
      <div class="btn-row">
        <button class="primary-btn" data-edit>Edit</button>
        <button class="link-btn" data-delete>Delete</button>
      </div>`;
    body.querySelector('[data-edit]').addEventListener('click', () => { close(); openForm(p, refresh); });
    body.querySelector('[data-delete]').addEventListener('click', async () => {
      if (!window.confirm(`Delete ${p.provider}?`)) return;
      try { await deletePayment(p.id); close(); await refresh(); } catch (err) { console.error(err); window.alert('That did not delete. Please try again.'); }
    });
  });
}

// ---------- Form ----------

function formHtml(p) {
  const v = (k) => esc(p && p[k] != null ? p[k] : '');
  const opt = (list, cur) => list.map(([k, t]) => `<option value="${k}"${cur === k ? ' selected' : ''}>${t}</option>`).join('');
  const field = (name, text, extra = '') => `<label class="field"><span>${text}</span><input name="${name}" value="${v(name)}" ${extra}></label>`;
  return `
    <form class="pay-form" novalidate>
      ${field('provider', 'Provider *', 'maxlength="80" required')}
      ${field('plan_name', 'Plan name', 'maxlength="80"')}
      <label class="field"><span>Category</span><select name="category_id"><option value="">Uncategorised</option>
        ${cats.map((c) => `<option value="${c.id}"${p && p.category_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div class="field-pair">
        ${field('amount', 'Amount (£) *', 'type="number" inputmode="decimal" step="0.01" min="0" required')}
        <label class="field"><span>Frequency *</span><select name="frequency">${opt(FREQUENCIES, p ? p.frequency : 'monthly')}</select></label>
      </div>
      <label class="field" data-day="weekly"><span>Payment day</span><select name="weekday"><option value="">Not set</option>
        ${WEEKDAYS.map((d, i) => `<option value="${i + 1}"${p && p.frequency === 'weekly' && p.payment_day === i + 1 ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="field" data-day="monthly"><span>Payment day of month (1 to 31, 31 means last day)</span>
        <input name="monthday" type="number" inputmode="numeric" min="1" max="31" value="${p && p.frequency !== 'weekly' && p.payment_day ? p.payment_day : ''}"></label>
      <p class="muted small" data-day="periodic">Quarterly and annual payments repeat every 3 or 12 months from the start date, so please set a start date.</p>
      <label class="field"><span>Payment type</span><select name="payment_type"><option value="">Not set</option>${opt(TYPES, p && p.payment_type)}</select></label>
      ${field('bank_name', 'Bank it leaves (bank name only, no numbers)', 'maxlength="40"')}
      <div class="field-pair">
        ${field('start_date', 'Start date', 'type="date"')}
        ${field('end_date', 'End or renewal date', 'type="date"')}
      </div>
      <div class="field-pair">
        ${field('contract_length', 'Contract length', 'maxlength="40" placeholder="e.g. 24 months"')}
        ${field('notice_period', 'Cancellation notice', 'maxlength="40" placeholder="e.g. 30 days"')}
      </div>
      ${field('customer_ref', 'Customer reference', 'maxlength="60"')}
      ${field('contact', 'Provider contact or website', 'maxlength="200"')}
      <label class="field"><span>Plan details</span><textarea name="plan_details" rows="3" maxlength="1000">${v('plan_details')}</textarea></label>
      <label class="field"><span>Notes</span><textarea name="notes" rows="3" maxlength="1000">${v('notes')}</textarea></label>
      <p class="form-msg" aria-live="polite"></p>
      <button class="primary-btn" type="submit">${p ? 'Save changes' : 'Add payment'}</button>
    </form>`;
}

function openForm(p, refresh) {
  const close = openOverlay(p ? `Edit ${p.provider}` : 'Add payment', (body) => {
    body.innerHTML = formHtml(p);
    const f = body.querySelector('form');
    const el = f.elements;
    const msg = f.querySelector('.form-msg');
    const sync = () => {
      const fr = el.frequency.value;
      f.querySelector('[data-day="weekly"]').hidden = fr !== 'weekly';
      f.querySelector('[data-day="monthly"]').hidden = fr === 'weekly';
      f.querySelector('[data-day="periodic"]').hidden = fr === 'weekly' || fr === 'monthly';
    };
    el.frequency.addEventListener('change', sync);
    sync();

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.classList.add('error');
      const txt = (n) => el[n].value.trim() || null;
      const fr = el.frequency.value;
      const amount = parseFloat(el.amount.value);
      if (!txt('provider') || !(amount >= 0)) { msg.textContent = 'Please enter the provider and amount.'; return; }
      if ((fr === 'quarterly' || fr === 'annual') && !el.start_date.value) { msg.textContent = 'Quarterly and annual payments need a start date.'; return; }
      const day = fr === 'weekly' ? parseInt(el.weekday.value, 10) : parseInt(el.monthday.value, 10);
      const fields = {
        provider: txt('provider'), plan_name: txt('plan_name'), category_id: el.category_id.value || null,
        amount: Math.round(amount * 100) / 100, frequency: fr,
        payment_day: Number.isFinite(day) ? Math.min(fr === 'weekly' ? 7 : 31, Math.max(1, day)) : null,
        payment_type: el.payment_type.value || null, bank_name: txt('bank_name'),
        start_date: el.start_date.value || null, end_date: el.end_date.value || null,
        contract_length: txt('contract_length'), notice_period: txt('notice_period'),
        customer_ref: txt('customer_ref'), contact: txt('contact'),
        plan_details: txt('plan_details'), notes: txt('notes'),
      };
      const textFields = Object.fromEntries(Object.keys(FIELD_LABELS).map((k) => [k, fields[k]]));
      const warning = sensitiveNumberWarning(textFields, FIELD_LABELS);
      if (warning) { msg.textContent = `${warning} Bank account numbers, sort codes and card numbers must not be stored. Please remove it.`; return; }
      msg.classList.remove('error');
      msg.textContent = 'Saving...';
      try { await savePayment(fields, p && p.id); close(); await refresh(); } catch (err) {
        console.error(err);
        msg.classList.add('error');
        msg.textContent = 'That did not save. Please try again.';
      }
    });
  });
}

// ---------- Categories ----------

function openCategories(refresh) {
  openOverlay('Categories', (body) => {
    const draw = () => {
      body.innerHTML = `
        <ul class="row-list">${cats.map((c) => `
          <li class="cat-row" data-id="${c.id}"><span>${esc(c.name)}</span>
            <span class="phrase-actions"><button class="link-btn" data-act="rename">Rename</button>
            <button class="link-btn" data-act="delete">Delete</button></span></li>`).join('')}</ul>
        <form class="phrase-add"><label class="field"><span>New category</span><input name="name" maxlength="40" required></label>
          <button class="primary-btn" type="submit">Add category</button></form>
        <p class="form-msg" aria-live="polite"></p>`;
      const msg = body.querySelector('.form-msg');
      const run = async (fn) => {
        try { await fn(); cats = await listCategories(); draw(); await refresh(); } catch (err) {
          console.error(err); msg.classList.add('error'); msg.textContent = 'That did not save. Names must be unique.';
        }
      };
      body.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.currentTarget.elements.name.value.trim();
        if (name) run(() => addCategory(name, cats.length));
      });
      body.querySelector('.row-list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const c = cats.find((x) => x.id === b.closest('[data-id]').dataset.id);
        if (b.dataset.act === 'rename') {
          const name = (window.prompt('New name', c.name) || '').trim();
          if (name && name !== c.name) run(() => renameCategory(c.id, name));
        } else if (window.confirm(`Delete ${c.name}? Payments in it become Uncategorised.`)) {
          run(() => deleteCategory(c.id));
        }
      });
    };
    draw();
  });
}

export default {
  id: 'money',
  title: 'Money',
  async render(container) {
    container.innerHTML = `
      <div class="tabs" role="tablist">
        <button class="tab active" data-tab="overview" role="tab">Overview</button>
        <button class="tab" data-tab="payments" role="tab">Payments</button>
        <button class="tab" data-tab="spending" role="tab">Spending</button>
        <button class="tab" data-tab="import" role="tab">Pay &amp; import</button>
      </div>
      <div data-pane="overview"><div class="card" id="m-overview"><p class="muted">Loading...</p></div></div>
      <div data-pane="payments" hidden><div class="card" id="m-payments"></div></div>
      <div data-pane="spending" hidden></div>
      <div data-pane="import" hidden></div>`;
    const ov = container.querySelector('#m-overview');
    const pl = container.querySelector('#m-payments');
    const loaded = new Set();
    const showTab = async (name) => {
      container.querySelectorAll('[data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
      container.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
      if (name === 'spending') {
        // Loaded on demand, so the chart library does not slow the hub.
        const pane = container.querySelector('[data-pane=spending]');
        if (!pane.innerHTML) pane.innerHTML = '<div class="card muted">Loading...</div>';
        try { const { renderSpending } = await import('./spending.js'); await renderSpending(pane); } catch (err) {
          console.error(err);
          pane.innerHTML = '<div class="card muted">Spending could not load just now. Please try again.</div>';
        }
      }
      if (name === 'import' && !loaded.has(name)) {
        loaded.add(name);
        const pane = container.querySelector('[data-pane=import]');
        pane.innerHTML = '<div class="card muted">Loading...</div>';
        try { await renderPayImport(pane); } catch (err) {
          console.error(err); loaded.delete(name);
          pane.innerHTML = '<div class="card muted">This could not load just now. Please try again.</div>';
        }
      }
    };

    const refresh = async () => {
      let last;
      [cats, pays, last] = await Promise.all([listCategories(), listPayments(), lastImport().catch(() => undefined)]);
      const stale = last !== undefined && (!last || daysBetween(last.imported_at.slice(0, 10), todayKey()) > 30);
      ov.innerHTML = (stale ? `<div class="banner"><span>${last ? 'No statement imported in the last 30 days.' : 'No statement imported yet.'}</span>
        <button class="pill-btn" data-tab="import">Import statement</button></div>` : '') + overviewHtml();
      pl.innerHTML = listHtml();
    };
    container.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) { showTab(tab.dataset.tab); return; }
      const open = e.target.closest('[data-open]');
      if (open) { const p = pays.find((x) => x.id === open.dataset.open); if (p) openDetail(p, refresh); return; }
      const chip = e.target.closest('[data-filter]');
      if (chip) { filter = chip.dataset.filter; pl.innerHTML = listHtml(); return; }
      if (e.target.closest('[data-add]')) { openForm(null, refresh); return; }
      if (e.target.closest('[data-cats]')) openCategories(refresh);
    });
    await refresh();
  },
};
