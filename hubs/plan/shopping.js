// Plan hub: Shopping section. Multiple named lists, items with quantity and
// notes, ticked items grouped at the bottom, and staples per list.
// Works offline: see core/shopping.js.
import * as shop from '../../core/shopping.js';
import { esc } from '../../core/wellbeing.js';
import { openOverlay } from '../../core/overlay.js';


function nameForm(title, value, onSave) {
  const close = openOverlay(title, (body) => {
    body.innerHTML = `
      <form novalidate>
        <label class="field"><span>List name</span>
          <input name="name" maxlength="40" required value="${esc(value)}"></label>
        <p class="form-msg" aria-live="polite"></p>
        <button class="primary-btn" type="submit">Save</button>
      </form>`;
    const f = body.querySelector('form');
    f.elements.name.focus();
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.elements.name.value.trim();
      if (!name) { const m = f.querySelector('.form-msg'); m.classList.add('error'); m.textContent = 'Please enter a name.'; return; }
      onSave(name);
      close();
    });
  });
}

function itemForm(item, listId) {
  const close = openOverlay('Edit item', (body) => {
    const staple = shop.isStaple(listId, item.name);
    body.innerHTML = `
      <form novalidate>
        <label class="field"><span>Item</span>
          <input name="name" maxlength="80" required value="${esc(item.name)}"></label>
        <label class="field"><span>Quantity (optional)</span>
          <input name="qty" maxlength="20" value="${esc(item.qty || '')}" placeholder="e.g. 2 or 500g"></label>
        <label class="field"><span>Notes (optional)</span>
          <input name="notes" maxlength="200" value="${esc(item.notes || '')}" placeholder="e.g. brand or size"></label>
        <p class="form-msg" aria-live="polite"></p>
        <button class="primary-btn" type="submit">Save changes</button>
        <div class="shop-form-extra">
          ${staple ? '<span class="muted small">Saved as a staple</span>' : '<button type="button" class="link-btn" data-staple>Save as staple</button>'}
          <button type="button" class="link-btn" data-delete>Delete item</button>
        </div>
      </form>`;
    const f = body.querySelector('form');
    const el = f.elements;
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = el.name.value.trim();
      if (!name) { const m = f.querySelector('.form-msg'); m.classList.add('error'); m.textContent = 'Please enter the item name.'; return; }
      shop.updateItem(item.id, { name, qty: el.qty.value, notes: el.notes.value });
      close();
    });
    const st = f.querySelector('[data-staple]');
    if (st) st.addEventListener('click', () => {
      shop.addStaple(listId, { name: el.name.value.trim() || item.name, qty: el.qty.value });
      st.replaceWith(Object.assign(document.createElement('span'), { className: 'muted small', textContent: 'Saved as a staple' }));
    });
    f.querySelector('[data-delete]').addEventListener('click', () => { shop.deleteItem(item.id); close(); });
  });
}

function itemRow(item, staple) {
  return `
    <li class="shop-item${item.done ? ' done' : ''}" data-id="${item.id}">
      <button class="shop-tick" data-act="toggle" aria-pressed="${item.done}" aria-label="${item.done ? 'Untick' : 'Tick'} ${esc(item.name)}"></button>
      <div class="shop-main" data-act="toggle">
        <span class="shop-name">${esc(item.name)}${item.qty ? ` <span class="shop-qty">${esc(item.qty)}</span>` : ''}</span>
        ${item.notes ? `<span class="muted small">${esc(item.notes)}</span>` : ''}
      </div>
      ${item.done && !staple ? '<button class="link-btn" data-act="staple">Staple</button>' : ''}
      <button class="link-btn" data-act="edit">Edit</button>
    </li>`;
}

export async function renderShopping(card) {
  card.innerHTML = `
    <div class="card-row"><h2 class="card-title">Shopping</h2><button class="pill-btn" data-new-list>New list</button></div>
    <div class="shop-body"></div>`;
  const bodyEl = card.querySelector('.shop-body');
  // Lists show as collapsed rows; tap one to open it (one at a time, all
  // closed on arrival; Scott, 21/11/2026).
  let listId = null; // the open list, or null when all are closed
  let manageStaples = false;
  let shownKey; // open list plus list names the shell was last drawn for

  const lists = () => shop.listsSorted();
  const current = () => lists().find((l) => l.id === listId) || null;

  const pickList = () => {
    if (listId && !lists().some((l) => l.id === listId)) listId = null; // open list was deleted
  };
  const shellKey = () => `${listId}|${lists().map((l) => `${l.id}:${l.name}`).join(',')}`;
  const countText = (id) => {
    const { todo, done } = shop.itemsFor(id);
    if (todo.length) return `${todo.length} item${todo.length === 1 ? '' : 's'}`;
    return done.length ? 'All done' : 'Empty';
  };

  // Shell: rebuilt only when the open list or the lists change, so the add box keeps focus.
  const drawShell = () => {
    pickList();
    shownKey = shellKey();
    if (!lists().length) {
      bodyEl.innerHTML = `
        <p class="muted">No shopping lists yet.</p>
        <form class="shop-add" data-first-list novalidate>
          <input name="name" maxlength="40" value="Weekly shop" aria-label="List name">
          <button class="pill-btn active" type="submit">Create list</button>
        </form>`;
      bodyEl.querySelector('[data-first-list]').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.target.elements.name.value.trim();
        if (!name) return;
        listId = shop.addList(name).id;
        drawShell();
      });
      return;
    }
    const panel = `
      <div class="shop-panel">
      <div class="shop-list-actions">
        <button class="link-btn" data-rename>Rename list</button>
        <button class="link-btn" data-delete-list>Delete list</button>
      </div>
      <form class="shop-add" novalidate>
        <input name="name" maxlength="80" placeholder="Add an item" aria-label="Item" autocomplete="off" enterkeyhint="done">
        <input name="qty" maxlength="20" placeholder="Qty" aria-label="Quantity" autocomplete="off" class="shop-qty-in">
        <button class="pill-btn active" type="submit">Add</button>
      </form>
      <div class="shop-staples"></div>
      <p class="form-msg" aria-live="polite"></p>
      <ul class="shop-list shop-todo"></ul>
      <div class="shop-done-wrap"></div>
      </div>`;
    bodyEl.innerHTML = `
      <ul class="shop-lists">${lists().map((l) => `
        <li class="shop-list-row${l.id === listId ? ' open' : ''}">
          <button class="shop-list-head" data-list="${l.id}" aria-expanded="${l.id === listId}">
            <span class="shop-list-name">${esc(l.name)}</span>
            <span class="muted small" data-count="${l.id}"></span>
            <span class="shop-chev" aria-hidden="true"></span>
          </button>
          ${l.id === listId ? panel : ''}
        </li>`).join('')}
      </ul>
      <p class="muted small shop-sync"></p>`;

    if (!listId) { drawDynamic(); return; }
    const f = bodyEl.querySelector('.shop-add');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.elements.name.value.trim();
      if (!name) return;
      shop.addItem(listId, { name, qty: f.elements.qty.value, notes: null });
      f.reset();
      f.elements.name.focus();
    });
    bodyEl.querySelector('[data-rename]').addEventListener('click', () =>
      nameForm('Rename list', current().name, (name) => shop.renameList(listId, name)));
    bodyEl.querySelector('[data-delete-list]').addEventListener('click', () => {
      if (!window.confirm(`Delete the list "${current().name}" and everything on it?`)) return;
      shop.deleteList(listId);
      listId = null;
      drawShell();
    });
    drawDynamic();
  };

  // Counts, staples, items and sync status: redrawn on every change.
  const drawDynamic = () => {
    if (!card.isConnected) return;
    pickList();
    if (shellKey() !== shownKey) { drawShell(); return; }
    bodyEl.querySelectorAll('[data-count]').forEach((el) => { el.textContent = countText(el.dataset.count); });
    const sync = bodyEl.querySelector('.shop-sync');
    const n = shop.pendingCount();
    if (sync) sync.textContent = n ? `${n} change${n === 1 ? '' : 's'} waiting to sync${navigator.onLine ? '' : ' (offline)'}.` : '';
    if (!listId || !bodyEl.querySelector('.shop-panel')) return;

    const staples = shop.staplesFor(listId);
    bodyEl.querySelector('.shop-staples').innerHTML = staples.length
      ? `<div class="shop-staples-head"><span class="muted small">Staples</span>
           <button class="link-btn" data-manage>${manageStaples ? 'Done' : 'Manage'}</button></div>
         <div class="shop-chips">${staples.map((s) => `
           <button class="chip shop-chip${manageStaples ? ' removing' : ''}" data-staple="${s.id}"
             aria-label="${manageStaples ? 'Remove staple' : 'Add'} ${esc(s.name)}">${manageStaples ? '&times; ' : '+ '}${esc(s.name)}${s.qty ? ` <span class="shop-qty">${esc(s.qty)}</span>` : ''}</button>`).join('')}</div>`
      : '';

    const { todo, done } = shop.itemsFor(listId);
    const isStaple = (i) => shop.isStaple(listId, i.name);
    bodyEl.querySelector('.shop-todo').innerHTML = todo.length
      ? todo.map((i) => itemRow(i, isStaple(i))).join('')
      : `<li class="muted shop-empty">${done.length ? 'All done.' : 'Nothing on this list yet.'}</li>`;
    bodyEl.querySelector('.shop-done-wrap').innerHTML = done.length
      ? `<div class="shop-done-head"><span class="muted small">Done (${done.length})</span>
           <button class="pill-btn" data-clear>Clear ticked</button></div>
         <ul class="shop-list shop-done">${done.map((i) => itemRow(i, isStaple(i))).join('')}</ul>`
      : '';
  };

  const say = (text) => { const m = bodyEl.querySelector('.form-msg'); if (m) { m.classList.remove('error'); m.textContent = text; } };

  bodyEl.addEventListener('click', (e) => {
    const t = e.target;
    const tab = t.closest('[data-list]');
    if (tab) { listId = listId === tab.dataset.list ? null : tab.dataset.list; manageStaples = false; drawShell(); return; }
    if (t.closest('[data-manage]')) { manageStaples = !manageStaples; drawDynamic(); return; }
    const chip = t.closest('[data-staple]');
    if (chip) {
      say('');
      if (manageStaples) { shop.deleteStaple(chip.dataset.staple); return; }
      const res = shop.addFromStaple(chip.dataset.staple);
      if (res === 'already') say('That is already on the list.');
      return;
    }
    if (t.closest('[data-clear]')) { shop.clearDone(listId); return; }
    const act = t.closest('[data-act]');
    if (!act) return;
    const item = shop.getState().items.find((r) => r.id === act.closest('[data-id]').dataset.id);
    if (!item) return;
    if (act.dataset.act === 'toggle') shop.toggleItem(item.id);
    if (act.dataset.act === 'edit') itemForm(item, listId);
    if (act.dataset.act === 'staple') { shop.addStaple(listId, { name: item.name, qty: item.qty }); say(`${item.name} saved as a staple.`); }
  });
  card.querySelector('[data-new-list]').addEventListener('click', () =>
    nameForm('New list', '', (name) => { listId = shop.addList(name).id; drawShell(); }));

  const off = shop.onChange(() => { if (!card.isConnected) { off(); return; } drawDynamic(); });
  shop.startAutoSync();
  drawShell();      // instant, from the copy on this device
  await shop.refresh(); // redraws through onChange if anything changed
}
