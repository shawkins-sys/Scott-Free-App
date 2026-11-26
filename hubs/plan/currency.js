// Tools page: Currency converter sheet (Scott, 26/11/2026). Rates from
// Frankfurter (European Central Bank reference rates, free, no key, updated
// once each working day). Rates are kept on this device so the converter works
// offline, and fetched again when older than 6 hours. Default pound to euro;
// last pair and amount remembered on this device.
const RATES_KEY = 'sf-fx';
const PAIR_KEY = 'sf-fx-pair';
const MAX_AGE = 6 * 3600 * 1000;

const NAMES = {
  GBP: 'British pound', EUR: 'Euro', USD: 'US dollar', AUD: 'Australian dollar', CAD: 'Canadian dollar',
  CHF: 'Swiss franc', CNY: 'Chinese yuan', CZK: 'Czech koruna', DKK: 'Danish krone', HKD: 'Hong Kong dollar',
  HUF: 'Hungarian forint', ISK: 'Icelandic krona', JPY: 'Japanese yen', KRW: 'South Korean won', MXN: 'Mexican peso',
  NOK: 'Norwegian krone', NZD: 'New Zealand dollar', PLN: 'Polish zloty', SEK: 'Swedish krona', SGD: 'Singapore dollar',
  THB: 'Thai baht', TRY: 'Turkish lira', ZAR: 'South African rand', INR: 'Indian rupee', BRL: 'Brazilian real',
  BGN: 'Bulgarian lev', RON: 'Romanian leu', IDR: 'Indonesian rupiah', ILS: 'Israeli shekel', MYR: 'Malaysian ringgit',
  PHP: 'Philippine peso',
};
// Shown first in the lists.
const TOP = ['GBP', 'EUR', 'USD'];

function cached() {
  try { return JSON.parse(localStorage.getItem(RATES_KEY)); } catch { return null; }
}

// Accepts the v1 shape { base, date, rates: { EUR: 1.17 } } or a v2 list of rows.
function parse(json) {
  if (json && json.rates && !Array.isArray(json.rates)) return { date: json.date, rates: json.rates };
  const rows = Array.isArray(json) ? json : (json && Array.isArray(json.rates) ? json.rates : null);
  if (!rows) return null;
  const rates = {};
  let date = '';
  rows.forEach((r) => { const q = r.quote || r.currency || r.symbol; if (q && Number(r.rate) > 0) { rates[q.toUpperCase()] = Number(r.rate); date = r.date || date; } });
  return Object.keys(rates).length ? { date, rates } : null;
}

async function fetchRates() {
  const urls = ['https://api.frankfurter.dev/v1/latest?base=GBP', 'https://api.frankfurter.dev/v2/rates?base=GBP'];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const p = parse(await res.json());
      if (p) {
        const data = { date: p.date, at: Date.now(), rates: { ...p.rates, GBP: 1 } };
        try { localStorage.setItem(RATES_KEY, JSON.stringify(data)); } catch { /* ignore */ }
        return data;
      }
    } catch (err) { console.warn('Rates not loaded from', url, err); }
  }
  return null;
}

export async function getRates({ force = false } = {}) {
  const c = cached();
  if (!force && c && Date.now() - c.at < MAX_AGE) return c;
  return (await fetchRates()) || c;
}

function pair() {
  try { return { from: 'GBP', to: 'EUR', amount: '1', ...JSON.parse(localStorage.getItem(PAIR_KEY)) }; } catch { return { from: 'GBP', to: 'EUR', amount: '1' }; }
}

const money = (n, code, digits) => {
  try { return n.toLocaleString('en-GB', { style: 'currency', currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits ?? (n !== 0 && Math.abs(n) < 1 ? 4 : 2) }); } catch { return `${n.toFixed(2)} ${code}`; }
};
const ukDate = (k) => (k && /^\d{4}-\d{2}-\d{2}/.test(k) ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : '');

export function currencyStatus() {
  const r = cached();
  const p = pair();
  if (!r || !r.rates[p.from] || !r.rates[p.to]) return 'Pounds, euros, dollars and more';
  return `${money(1, p.from, 0)} = ${money(r.rates[p.to] / r.rates[p.from], p.to, 4)}`;
}

export async function renderCurrency(card) {
  const p = pair();
  card.innerHTML = `
    <div class="card-row"><h2 class="card-title">Currency</h2></div>
    <div class="conv-box">
      <label class="field"><span>From</span><select name="from"></select></label>
      <input class="conv-value" name="value" type="text" inputmode="decimal" autocomplete="off" aria-label="Amount" placeholder="0">
      <button type="button" class="conv-swap" aria-label="Swap currencies"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/></svg></button>
      <label class="field"><span>To</span><select name="to"></select></label>
      <div class="conv-result" aria-live="polite">&nbsp;</div>
      <p class="muted small conv-rate">&nbsp;</p>
    </div>
    <p class="muted small fx-note">Loading rates...</p>`;
  const fromEl = card.querySelector('[name=from]');
  const toEl = card.querySelector('[name=to]');
  const valEl = card.querySelector('[name=value]');
  const resEl = card.querySelector('.conv-result');
  const rateEl = card.querySelector('.conv-rate');
  const note = card.querySelector('.fx-note');
  let rates = null;

  const fill = (codes) => {
    const sorted = [...TOP.filter((c) => codes.includes(c)), ...codes.filter((c) => !TOP.includes(c)).sort()];
    const opts = sorted.map((c) => `<option value="${c}">${c} ${NAMES[c] || ''}</option>`).join('');
    fromEl.innerHTML = opts; toEl.innerHTML = opts;
    fromEl.value = codes.includes(p.from) ? p.from : 'GBP';
    toEl.value = codes.includes(p.to) ? p.to : 'EUR';
  };
  const calc = () => {
    if (!rates) return;
    const v = parseFloat(valEl.value.replace(/,/g, ''));
    const rate = rates.rates[toEl.value] / rates.rates[fromEl.value];
    resEl.textContent = Number.isNaN(v) ? money(0, toEl.value) : money(v * rate, toEl.value);
    rateEl.textContent = `${money(1, fromEl.value, 0)} = ${money(rate, toEl.value, 4)}`;
    try { localStorage.setItem(PAIR_KEY, JSON.stringify({ from: fromEl.value, to: toEl.value, amount: valEl.value })); } catch { /* ignore */ }
  };
  const show = (r) => {
    if (!r) {
      note.textContent = 'Rates could not be loaded. Please check your connection and try again.';
      return;
    }
    rates = r;
    const keepFrom = fromEl.value || p.from; const keepTo = toEl.value || p.to;
    p.from = keepFrom; p.to = keepTo;
    fill(Object.keys(r.rates));
    calc();
    const old = Date.now() - r.at > MAX_AGE;
    note.innerHTML = `European Central Bank rates from ${ukDate(r.date)}${old ? ' (saved copy, offline)' : ''}. Banks and card providers add their own fees. <button type="button" class="link-btn fx-refresh">Refresh</button>`;
  };

  valEl.value = p.amount || '1';
  [fromEl, toEl].forEach((el) => el.addEventListener('change', calc));
  valEl.addEventListener('input', () => { valEl.value = valEl.value.replace(/[^0-9.,]/g, ''); calc(); });
  card.querySelector('.conv-swap').addEventListener('click', () => {
    const f = fromEl.value; fromEl.value = toEl.value; toEl.value = f; calc();
  });
  card.addEventListener('click', async (e) => {
    if (!e.target.closest('.fx-refresh')) return;
    note.textContent = 'Refreshing rates...';
    show((await fetchRates()) || cached());
  });

  const c = cached();
  if (c) show(c);
  show(await getRates());
}
