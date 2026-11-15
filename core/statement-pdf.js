// Statement import from a Lloyds PDF (the format the Lloyds app downloads).
// The PDF is read on this device with pdf.js; nothing is uploaded.
// PROVISIONAL: tuned to the usual Lloyds layout (Date, Description, Type,
// Money In, Money Out, Balance). To be confirmed against Scott's redacted
// sample. Amounts are checked against the running balance, so the sign of
// each transaction comes from the balance change wherever possible.

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs';

let pdfjsPromise = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS).then((lib) => {
      // A module worker started from a local blob can load the cross-origin worker script.
      const blob = new Blob([`import "${PDFJS_WORKER}";`], { type: 'text/javascript' });
      lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob), { type: 'module' });
      return lib;
    });
  }
  return pdfjsPromise;
}

// Reads every page and returns text lines: [{ page, y, items: [{ str, x, w }] }], top to bottom.
export async function extractLines(file) {
  const lib = await loadPdfjs();
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = [];
    for (const it of content.items) {
      const str = (it.str || '').trim();
      if (!str) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) { row = { page: p, y, items: [] }; rows.push(row); }
      row.items.push({ str, x, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
    lines.push(...rows);
  }
  await task.destroy();
  return lines;
}

// ---------- Parsing (pure, testable) ----------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const TYPE_CODES = new Set(['BGC', 'BP', 'CHG', 'CHQ', 'COR', 'CPT', 'CSH', 'DD', 'DEB', 'DEP', 'FEE', 'FPI', 'FPO', 'IB', 'INT', 'MPI', 'MPO', 'PAY', 'SO', 'TFR']);
const AMOUNT = /^-?£?\d{1,3}(?:,\d{3})*\.\d{2}(?:\s?(CR|DR))?$/i;
const pad = (n) => String(n).padStart(2, '0');

const num = (s) => {
  const neg = /^-/.test(s) || /DR$/i.test(s);
  const v = parseFloat(s.replace(/[£,\s]|CR|DR/gi, '').replace(/^-/, ''));
  return neg ? -v : v;
};

// Finds a date at the start of the text: "01 Nov 26", "1 November 2026", "01/11/2026", "01 Nov".
function leadingDate(text, fallbackYear) {
  let m = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?(?:\s+(\d{2,4}))?\b/);
  const mon = m ? MONTHS[m[2].slice(0, 3).toLowerCase()] : null;
  if (mon) {
    let y = m[3] ? Number(m[3]) : fallbackYear;
    if (y && y < 100) y += 2000;
    if (!y) return null;
    return { key: `${y}-${pad(mon)}-${pad(Number(m[1]))}`, len: m[0].length, hasYear: !!m[3] };
  }
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return { key: `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`, len: m[0].length, hasYear: true };
  }
  return null;
}

// Turns extracted lines into rows: [{ tx_date, description, amount, balance }].
export function parseLines(lines) {
  const all = lines.map((l) => l.items.map((i) => i.str).join(' ')).join('\n');
  const yearMatch = all.match(/\b(20\d{2})\b/);
  let year = yearMatch ? Number(yearMatch[1]) : null;

  let cols = null;        // x centres of Money In, Money Out and Balance, from the header row
  let inTable = false;
  let date = null;
  let prevBalance = null;
  let lastMonth = null;
  const rows = [];

  for (const line of lines) {
    const text = line.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    const lower = text.toLowerCase();

    // Header row: remember where the money columns are.
    if (/balance/.test(lower) && /(money in|paid in|in \(£\)|credits?)/.test(lower) && /(money out|paid out|out \(£\)|withdrawn|debits?)/.test(lower)) {
      const centre = (re) => { const it = line.items.find((i) => re.test(i.str.toLowerCase())); return it ? it.x + it.w / 2 : null; };
      cols = { in: centre(/in\b|credit/), out: centre(/out\b|withdrawn|debit/), bal: centre(/balance/) };
      inTable = true;
      continue;
    }
    if (!inTable) {
      const ob = text.match(/(opening|previous) balance.*?(-?£?[\d,]+\.\d{2}(?:\s?(?:CR|DR))?)/i);
      if (ob) prevBalance = num(ob[2]);
      continue;
    }

    // Balance brought or carried forward lines set the running balance only.
    if (/balance (brought|carried) forward|opening balance|closing balance/i.test(text)) {
      const amts = line.items.filter((i) => AMOUNT.test(i.str));
      if (amts.length) prevBalance = num(amts[amts.length - 1].str);
      if (/carried forward|closing balance/i.test(text)) inTable = false; // table ends; next page header restarts it
      continue;
    }

    const d = leadingDate(text, year);
    if (d) {
      const mon = Number(d.key.slice(5, 7));
      if (!d.hasYear && lastMonth === 12 && mon === 1) { year += 1; d.key = `${year}${d.key.slice(4)}`; }
      lastMonth = mon;
      date = d.key;
    }

    const amountItems = line.items.filter((i) => AMOUNT.test(i.str));
    const textItems = line.items.filter((i) => !AMOUNT.test(i.str));
    let desc = textItems.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (d) desc = desc.slice(Math.min(desc.length, d.len)).trim();
    desc = desc.split(' ').filter((w) => !TYPE_CODES.has(w)).join(' ').trim();

    if (!amountItems.length) {
      // Continuation of the previous description.
      if (desc && rows.length && !/^page \d|statement|sort code|account number/i.test(desc)) {
        rows[rows.length - 1].description = `${rows[rows.length - 1].description} ${desc}`.trim();
      }
      continue;
    }
    if (!date) continue;

    // Work out money in, money out and balance from column positions.
    let moneyIn = null;
    let moneyOut = null;
    let balance = null;
    if (cols) {
      for (const it of amountItems) {
        const c = it.x + it.w / 2;
        const dist = (k) => (cols[k] == null ? Infinity : Math.abs(cols[k] - c));
        const k = ['in', 'out', 'bal'].sort((a, b) => dist(a) - dist(b))[0];
        if (k === 'in') moneyIn = num(it.str);
        else if (k === 'out') moneyOut = num(it.str);
        else balance = num(it.str);
      }
    } else {
      balance = amountItems.length > 1 ? num(amountItems[amountItems.length - 1].str) : null;
      moneyOut = num(amountItems[0].str); // sign corrected from the balance below
    }

    // A line with only a balance finishes the transaction above it (amount and balance on separate lines).
    const last = rows[rows.length - 1];
    if (moneyIn == null && moneyOut == null && balance != null && last && last.balance == null) {
      if (desc) last.description = `${last.description} ${desc}`.trim();
      if (prevBalance != null) {
        const diff = Math.round((balance - prevBalance) * 100) / 100;
        if (Math.abs(Math.abs(diff) - Math.abs(last.amount)) < 0.005) last.amount = diff;
      }
      last.balance = balance;
      prevBalance = balance;
      continue;
    }

    let amount = moneyIn != null ? Math.abs(moneyIn) : moneyOut != null ? -Math.abs(moneyOut) : null;
    // The running balance is the most reliable guide to the sign.
    if (balance != null && prevBalance != null) {
      const diff = Math.round((balance - prevBalance) * 100) / 100;
      if (amount == null || Math.abs(Math.abs(diff) - Math.abs(amount)) < 0.005) amount = diff;
    }
    if (balance != null) prevBalance = balance;
    if (amount == null || !Number.isFinite(amount)) continue;

    rows.push({ tx_date: date, description: desc || '(No description)', amount: Math.round(amount * 100) / 100, balance });
  }
  return rows;
}

// Same result shape as parseStatement() for CSV: { rows, start, end }.
export async function parsePdfStatement(file) {
  let lines;
  try { lines = await extractLines(file); } catch (err) {
    console.error('PDF read failed', err);
    throw new Error('This PDF could not be read. Please try downloading the statement again.');
  }
  if (!lines.length) throw new Error('This PDF has no readable text (it may be a scanned image).');
  const rows = parseLines(lines).sort((a, b) => a.tx_date.localeCompare(b.tx_date));
  if (!rows.length) throw new Error('No transactions were found in this PDF. The statement layout may differ from what the app expects.');
  return { rows, start: rows[0].tx_date, end: rows[rows.length - 1].tx_date };
}

// ---------- Statement check (nothing is saved) ----------

// Words that describe the layout and are safe to keep when sharing the layout.
const SAFE_WORDS = new Set(['date', 'description', 'type', 'money', 'in', 'out', 'paid', 'balance', 'brought', 'carried',
  'forward', 'opening', 'closing', 'page', 'of', 'to', 'from', 'statement', 'account', 'transactions', 'credit', 'credits',
  'debit', 'debits', 'withdrawn', 'details', 'payments', 'receipts', 'total', 'totals', 'sort', 'code', 'number', 'your',
  'the', 'and', '(£)', '£', 'cr', 'dr', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', ...Object.keys(MONTHS), ...[...TYPE_CODES].map((t) => t.toLowerCase())]);

function mask(str) {
  return str.split(/(\s+)/).map((w) => {
    if (/^\s+$/.test(w) || SAFE_WORDS.has(w.toLowerCase().replace(/[.,:]$/, ''))) return w;
    return w.replace(/[A-Za-z]/g, 'x').replace(/\d/g, '9');
  }).join('');
}

// Layout with all personal text masked: one line per text row with x positions.
export function maskedLayout(lines) {
  return lines.map((l) => `p${l.page} y${Math.round(l.y)}: ${l.items.map((i) => `[${Math.round(i.x)}+${Math.round(i.w)}] ${mask(i.str)}`).join('  ')}`).join('\n');
}

// Reads a PDF and returns { lines, rows } without saving anything.
export async function checkPdfStatement(file) {
  const lines = await extractLines(file);
  const rows = parseLines(lines).sort((a, b) => a.tx_date.localeCompare(b.tx_date));
  return { lines, rows };
}
