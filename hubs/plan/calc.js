// Tools page: Calculator sheet (Scott, 26/11/2026). Standard keypad with AC,
// backspace, %, +/- and a live result while typing. No eval: the sum is split
// into numbers and operators and worked out with the usual order (x and / before
// + and -). "200 + 10%" adds 10% of 200 (220); "50 x 10%" is 50 x 0.1.
// The last answer is kept on this device for the tile status.
const KEY = 'sf-calc-last';
const OPS = { '+': 1, '-': 1, '*': 2, '/': 2 };
const SHOW = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export function lastAnswer() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

// Tokens: numbers (strings while typing) and operator characters; a number may
// end with '%'.
function tokenize(expr) {
  return expr.match(/(\d*\.?\d+(?:e[+-]?\d+)?%?|\d+\.%?|[-+*/])/gi) || [];
}

function evaluate(tokens) {
  const t = [...tokens];
  while (t.length && OPS[t[t.length - 1]]) t.pop(); // ignore a trailing operator
  if (!t.length) return null;
  const nums = [];
  const ops = [];
  const apply = () => {
    const b = nums.pop(); const a = nums.pop(); const op = ops.pop();
    nums.push(op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : a / b);
  };
  let neg = false;
  for (let i = 0; i < t.length; i += 1) {
    const tok = t[i];
    if (OPS[tok]) {
      if (tok === '-' && (i === 0 || OPS[t[i - 1]])) { neg = true; continue; } // minus sign on a number
      while (ops.length && OPS[ops[ops.length - 1]] >= OPS[tok]) apply();
      ops.push(tok);
      continue;
    }
    let n = parseFloat(tok);
    if (Number.isNaN(n)) return null;
    if (neg) { n = -n; neg = false; }
    if (tok.endsWith('%')) {
      const prev = ops[ops.length - 1];
      if ((prev === '+' || prev === '-') && nums.length) {
        // Percentage of everything so far: 200 + 10% = 220.
        const saved = ops.pop();
        while (ops.length) apply();
        ops.push(saved);
        n = (nums[nums.length - 1] * n) / 100;
      } else n /= 100;
    }
    nums.push(n);
  }
  while (ops.length) apply();
  const r = nums[0];
  return Number.isFinite(r) ? r : NaN;
}

const tidy = (n) => (Object.is(n, -0) ? 0 : parseFloat(n.toPrecision(12)));
const fmt = (n) => {
  if (Number.isNaN(n)) return 'Cannot divide by 0';
  const v = tidy(n);
  if (Math.abs(v) >= 1e15 || (v !== 0 && Math.abs(v) < 1e-9)) return v.toExponential(6);
  return v.toLocaleString('en-GB', { maximumFractionDigits: 10 });
};
const showExpr = (expr) => tokenize(expr).map((t) => (OPS[t] ? ` ${SHOW[t]} ` : t)).join('');

const KEYS = [
  ['AC', 'clear', 'fn'], ['⌫', 'back', 'fn'], ['%', '%', 'fn'], ['÷', '/', 'op'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['×', '*', 'op'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['−', '-', 'op'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'],
  ['+/−', 'sign', 'fn'], ['0', '0'], ['.', '.'], ['=', '=', 'eq'],
];

export function renderCalc(card) {
  card.innerHTML = `
    <div class="card-row"><h2 class="card-title">Calculator</h2></div>
    <div class="calc-screen" aria-live="polite">
      <div class="calc-expr"></div>
      <div class="calc-result">0</div>
    </div>
    <div class="calc-keys">${KEYS.map(([label, key, kind = 'num']) =>
      `<button type="button" class="calc-key ${kind}" data-key="${key}" aria-label="${key === 'back' ? 'Delete' : key === 'sign' ? 'Plus or minus' : key === 'clear' ? 'Clear' : label}">${label}</button>`).join('')}</div>`;
  const exprEl = card.querySelector('.calc-expr');
  const resEl = card.querySelector('.calc-result');
  let expr = '';
  let done = false; // just pressed =

  const draw = () => {
    exprEl.textContent = showExpr(expr) || ' ';
    const r = evaluate(tokenize(expr));
    resEl.textContent = r === null ? '0' : fmt(r);
    resEl.classList.toggle('preview', !done);
  };

  // Start of the number being typed (after the last operator; a leading minus belongs to it).
  const lastNumStart = () => {
    for (let i = expr.length - 1; i >= 0; i -= 1) {
      if ('+-*/'.includes(expr[i]) && i > 0 && !'+-*/e'.includes(expr[i - 1])) return i + 1;
    }
    return 0;
  };

  const press = (key) => {
    if (key === 'clear') { expr = ''; done = false; return draw(); }
    if (key === 'back') { expr = done ? '' : expr.slice(0, -1); done = false; return draw(); }
    if (key === '=') {
      const r = evaluate(tokenize(expr));
      if (r === null || Number.isNaN(r)) return draw();
      expr = String(tidy(r)); done = true;
      try { localStorage.setItem(KEY, fmt(r)); } catch { /* ignore */ }
      draw();
      exprEl.textContent = ' ';
      return undefined;
    }
    if (OPS[key]) {
      done = false;
      if (!expr) { if (key === '-') expr = '-'; return draw(); }
      while (expr && OPS[expr.slice(-1)]) expr = expr.slice(0, -1);
      if (expr === '' || expr === '-') return draw();
      expr += key;
      return draw();
    }
    if (done) { expr = ''; done = false; }
    const start = lastNumStart();
    const num = expr.slice(start);
    if (key === 'sign') {
      if (!num) return draw();
      expr = expr.slice(0, start) + (num.startsWith('-') ? num.slice(1) : `-${num}`);
      // "5 + -3" reads oddly, so swap the operator instead where possible.
      expr = expr.replace(/\+-(?=[\d.]+%?$)/, '-').replace(/--(?=[\d.]+%?$)/, '+');
      return draw();
    }
    if (key === '%') { if (/\d$/.test(num)) expr += '%'; return draw(); }
    if (num.endsWith('%')) return draw();
    if (key === '.') {
      if (num.includes('.')) return draw();
      expr += /\d$/.test(num) ? '.' : '0.';
      return draw();
    }
    if (num.replace(/[-.]/g, '').length >= 15) return draw();
    if (num === '0' || num === '-0') expr = expr.slice(0, -1);
    expr += key;
    return draw();
  };

  card.querySelector('.calc-keys').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (b) press(b.dataset.key);
  });
  // Keyboard on a computer.
  const onKey = (e) => {
    if (!card.isConnected) { document.removeEventListener('keydown', onKey); return; }
    const map = { Enter: '=', '=': '=', Backspace: 'back', Escape: null, Delete: 'clear', x: '*', X: '*' };
    const k = e.key in map ? map[e.key] : e.key;
    if (k && (/^[0-9.%]$/.test(k) || OPS[k] || ['=', 'back', 'clear'].includes(k))) { e.preventDefault(); press(k); }
  };
  document.addEventListener('keydown', onKey);
  draw();
}

export { evaluate as _evaluate, tokenize as _tokenize };
