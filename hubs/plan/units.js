// Tools page: Unit converter sheet (Scott, 26/11/2026). Length, weight, volume,
// temperature and speed. Type a value, pick from and to, swap with one tap; the
// answer updates as you type. UK gallons are the default gallon (US gallons
// listed separately). Last choice kept on this device.
const KEY = 'sf-units';

// factor = how many base units in one of this unit (base: metre, kilogram, litre, metre per second).
const GROUPS = {
  length: { name: 'Length', units: [
    ['mm', 'Millimetres', 0.001], ['cm', 'Centimetres', 0.01], ['m', 'Metres', 1], ['km', 'Kilometres', 1000],
    ['in', 'Inches', 0.0254], ['ft', 'Feet', 0.3048], ['yd', 'Yards', 0.9144], ['mi', 'Miles', 1609.344],
  ], from: 'cm', to: 'in' },
  weight: { name: 'Weight', units: [
    ['g', 'Grams', 0.001], ['kg', 'Kilograms', 1], ['oz', 'Ounces', 0.028349523125], ['lb', 'Pounds', 0.45359237],
    ['st', 'Stone', 6.35029318],
  ], from: 'kg', to: 'st' },
  volume: { name: 'Volume', units: [
    ['ml', 'Millilitres', 0.001], ['l', 'Litres', 1], ['tsp', 'Teaspoons', 0.005], ['tbsp', 'Tablespoons', 0.015],
    ['cup', 'Cups', 0.25], ['floz', 'Fluid ounces (UK)', 0.0284130625], ['pt', 'Pints (UK)', 0.56826125],
    ['gal', 'Gallons (UK)', 4.54609], ['usgal', 'Gallons (US)', 3.785411784],
  ], from: 'l', to: 'gal' },
  temp: { name: 'Temperature', units: [['c', 'Celsius'], ['f', 'Fahrenheit'], ['k', 'Kelvin']], from: 'c', to: 'f' },
  speed: { name: 'Speed', units: [
    ['kmh', 'Kilometres per hour', 1 / 3.6], ['mph', 'Miles per hour', 0.44704], ['ms', 'Metres per second', 1],
    ['kn', 'Knots', 0.514444],
  ], from: 'mph', to: 'kmh' },
};

const toC = { c: (v) => v, f: (v) => (v - 32) * 5 / 9, k: (v) => v - 273.15 };
const fromC = { c: (v) => v, f: (v) => v * 9 / 5 + 32, k: (v) => v + 273.15 };

export function convert(group, from, to, v) {
  if (group === 'temp') return fromC[to](toC[from](v));
  const u = Object.fromEntries(GROUPS[group].units.map(([id, , f]) => [id, f]));
  return (v * u[from]) / u[to];
}

const fmt = (n) => (Number.isFinite(n) ? parseFloat(n.toPrecision(8)).toLocaleString('en-GB', { maximumFractionDigits: 6 }) : '');

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export function unitsStatus() {
  const s = load();
  const g = GROUPS[s.group] ? s.group : 'length';
  const name = (id) => (GROUPS[g].units.find((u) => u[0] === id) || [])[1];
  const from = name(s.from) || name(GROUPS[g].from);
  const to = name(s.to) || name(GROUPS[g].to);
  return `${from} to ${to.charAt(0).toLowerCase()}${to.slice(1)}`;
}

export function renderUnits(card) {
  const saved = load();
  let group = GROUPS[saved.group] ? saved.group : 'length';
  card.innerHTML = `
    <div class="card-row"><h2 class="card-title">Unit converter</h2></div>
    <div class="chip-row conv-groups" role="tablist">${Object.entries(GROUPS).map(([id, g]) =>
      `<button type="button" class="chip" data-group="${id}" role="tab">${g.name}</button>`).join('')}</div>
    <div class="conv-box">
      <label class="field"><span>From</span><select name="from"></select></label>
      <input class="conv-value" name="value" type="text" inputmode="decimal" autocomplete="off" aria-label="Value to convert" placeholder="0">
      <button type="button" class="conv-swap" aria-label="Swap units"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/></svg></button>
      <label class="field"><span>To</span><select name="to"></select></label>
      <div class="conv-result" aria-live="polite">0</div>
    </div>`;
  const fromEl = card.querySelector('[name=from]');
  const toEl = card.querySelector('[name=to]');
  const valEl = card.querySelector('[name=value]');
  const resEl = card.querySelector('.conv-result');

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ group, from: fromEl.value, to: toEl.value, value: valEl.value })); } catch { /* ignore */ }
  };
  const calc = () => {
    const v = parseFloat(valEl.value.replace(/,/g, ''));
    resEl.textContent = Number.isNaN(v) ? '0' : fmt(convert(group, fromEl.value, toEl.value, v));
    save();
  };
  const setGroup = (g, from, to) => {
    group = g;
    const opts = GROUPS[g].units.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
    fromEl.innerHTML = opts; toEl.innerHTML = opts;
    fromEl.value = GROUPS[g].units.some((u) => u[0] === from) ? from : GROUPS[g].from;
    toEl.value = GROUPS[g].units.some((u) => u[0] === to) ? to : GROUPS[g].to;
    card.querySelectorAll('[data-group]').forEach((b) => {
      b.classList.toggle('active', b.dataset.group === g);
      b.setAttribute('aria-selected', String(b.dataset.group === g));
    });
    calc();
  };

  card.querySelector('.conv-groups').addEventListener('click', (e) => {
    const b = e.target.closest('[data-group]');
    if (b && b.dataset.group !== group) setGroup(b.dataset.group);
  });
  card.querySelector('.conv-swap').addEventListener('click', () => {
    const f = fromEl.value; fromEl.value = toEl.value; toEl.value = f; calc();
  });
  fromEl.addEventListener('change', calc);
  toEl.addEventListener('change', calc);
  valEl.addEventListener('input', () => {
    valEl.value = valEl.value.replace(/[^0-9.,-]/g, '');
    calc();
  });

  valEl.value = saved.value || '1';
  setGroup(group, saved.from, saved.to);
}
