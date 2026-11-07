// Statement import (Lloyds CSV), classification and transactions.
// PROVISIONAL: column names follow Lloyds' usual export
//   Transaction Date, Transaction Type, Sort Code, Account Number,
//   Transaction Description, Debit Amount, Credit Amount, Balance
// To be confirmed against Scott's redacted sample. Sort code and account
// number columns are never read or stored.
import Papa from 'https://cdn.jsdelivr.net/npm/papaparse@5.7.0/+esm';
import { supabase } from './supabase.js';
import { getSettings, updateSettings } from './wellbeing.js';
import { payContext, isPayday } from './payschedule.js';

export const SALARY_TOLERANCE = 0.15; // within 15% of the last salary
export const MATCH_TOLERANCE = 0.10;  // within 10% of a recurring payment

// ---------- Settings (settings.data.money) ----------

export async function getMoneySettings() {
  const s = await getSettings();
  return { employerPattern: '', lastSalary: null, ...(s.money || {}) };
}
export async function saveMoneySettings(patch) {
  const current = await getMoneySettings();
  await updateSettings({ money: { ...current, ...patch } });
}

// ---------- Parsing ----------

export const normalise = (s) => String(s || '').toUpperCase().replace(/[^A-Z&' ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Suggested merchant rule: the first two words, e.g. "TESCO STORES".
export const suggestPattern = (desc) => normalise(desc).split(' ').slice(0, 2).join(' ');

const toKey = (d) => {
  const m = String(d).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(String(d).trim()) ? String(d).trim() : null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Returns { rows, start, end } or throws with a readable message.
export function parseStatement(text) {
  const res = Papa.parse(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const fields = res.meta.fields || [];
  const find = (...words) => fields.find((f) => words.every((w) => f.includes(w)));
  const col = {
    date: find('date'),
    desc: find('description') || find('details') || find('narrative'),
    debit: find('debit'),
    credit: find('credit'),
    amount: find('amount') && !find('debit') ? find('amount') : null,
    balance: find('balance'),
  };
  if (!col.date || !col.desc || !(col.amount || col.debit || col.credit)) {
    throw new Error('This does not look like a Lloyds statement CSV (date, description and amount columns not found).');
  }
  const rows = [];
  for (const r of res.data) {
    const tx_date = toKey(r[col.date]);
    const description = String(r[col.desc] || '').trim();
    let amount = col.amount ? num(r[col.amount]) : (num(r[col.credit]) || 0) - (num(r[col.debit]) || 0);
    if (!tx_date || !description || amount == null) continue;
    amount = Math.round(amount * 100) / 100;
    const balance = col.balance ? num(r[col.balance]) : null;
    rows.push({ tx_date, description, amount, balance });
  }
  if (!rows.length) throw new Error('No transactions were found in this file.');
  rows.sort((a, b) => a.tx_date.localeCompare(b.tx_date));
  return { rows, start: rows[0].tx_date, end: rows[rows.length - 1].tx_date };
}

// Same transaction imported twice gives the same key.
export const dedupeKey = (r) =>
  `${r.tx_date}|${r.amount.toFixed(2)}|${r.balance == null ? '' : r.balance.toFixed(2)}|${normalise(r.description)}`;

// ---------- Classification ----------

// Adds kind, category_id, payment_id and needs_review to each row.
// kind: salary | expenses_repaid | income | transfer | null (ordinary spending)
export function classify(rows, { payments, rules, money, payCtx }) {
  let lastSalary = money.lastSalary ? Number(money.lastSalary) : null;
  const employer = normalise(money.employerPattern);
  const providerWords = payments.map((p) => ({ p, words: normalise(p.provider).split(' ').filter((w) => w.length > 2) }));

  const out = rows.map((r) => {
    const t = { ...r, kind: null, category_id: null, payment_id: null, needs_review: false, claimable: false };
    const desc = normalise(r.description);

    // Income from the employer: salary on a payday near the usual amount, else expenses repaid.
    if (r.amount > 0 && employer && desc.includes(employer)) {
      const nearSalary = lastSalary && Math.abs(r.amount - lastSalary) <= lastSalary * SALARY_TOLERANCE;
      if (!lastSalary) t.needs_review = true;
      else if (isPayday(payCtx, r.tx_date) && nearSalary) { t.kind = 'salary'; lastSalary = r.amount; }
      else t.kind = 'expenses_repaid';
      return t;
    }

    // Saved merchant rules.
    const rule = rules.find((ru) => ru.pattern && desc.includes(normalise(ru.pattern)));
    if (rule) {
      t.category_id = rule.category_id;
      t.payment_id = rule.payment_id;
      if (r.amount > 0) t.kind = 'income';
      return t;
    }

    // Recurring payment: provider name in the description and amount within 10%.
    if (r.amount < 0) {
      const spend = -r.amount;
      const hit = providerWords.find(({ p, words }) => words.length && words.every((w) => desc.includes(w))
        && Math.abs(spend - Number(p.amount)) <= Number(p.amount) * MATCH_TOLERANCE);
      if (hit) { t.payment_id = hit.p.id; t.category_id = hit.p.category_id; return t; }
    }

    t.needs_review = true;
    return t;
  });
  return { rows: out, lastSalary };
}

// ---------- Import ----------

// Parses, classifies and saves. Returns { added, skipped, review, start, end }.
export async function importStatement(file) {
  const text = await file.text();
  const { rows, start, end } = parseStatement(text);
  const [payRes, ruleRes, money, payCtx] = await Promise.all([
    supabase.from('payments').select('*'),
    supabase.from('merchant_rules').select('*'),
    getMoneySettings(),
    payContext(),
  ]);
  if (payRes.error) throw payRes.error;
  if (ruleRes.error) throw ruleRes.error;
  const { rows: classified, lastSalary } = classify(rows, { payments: payRes.data, rules: ruleRes.data, money, payCtx });

  const { data: imp, error: impErr } = await supabase.from('imports')
    .insert({ file_name: file.name.slice(0, 120), period_start: start, period_end: end, row_count: rows.length })
    .select().single();
  if (impErr) throw impErr;

  let added = 0;
  let review = 0;
  for (let i = 0; i < classified.length; i += 500) {
    const chunk = classified.slice(i, i + 500).map((r) => ({ ...r, import_id: imp.id, dedupe_key: dedupeKey(r) }));
    const { data, error } = await supabase.from('transactions')
      .upsert(chunk, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }).select('id, needs_review');
    if (error) throw error;
    added += data.length;
    review += data.filter((d) => d.needs_review).length;
  }
  if (lastSalary && lastSalary !== money.lastSalary) await saveMoneySettings({ lastSalary });
  return { added, skipped: rows.length - added, review, start, end };
}

// ---------- Transactions ----------

export async function listTransactions({ from, to, reviewOnly = false } = {}) {
  let q = supabase.from('transactions').select('*').order('tx_date', { ascending: false });
  if (from) q = q.gte('tx_date', from);
  if (to) q = q.lt('tx_date', to);
  if (reviewOnly) q = q.eq('needs_review', true);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return data || [];
}

export async function updateTransaction(id, fields) {
  const { error } = await supabase.from('transactions').update(fields).eq('id', id);
  if (error) throw error;
}

// Saves a merchant rule and applies it to other transactions still waiting for review.
export async function addRule(pattern, category_id, payment_id = null) {
  const { error } = await supabase.from('merchant_rules').insert({ pattern: normalise(pattern), category_id, payment_id });
  if (error) throw error;
  const waiting = await listTransactions({ reviewOnly: true });
  const p = normalise(pattern);
  const hits = waiting.filter((t) => t.amount < 0 && normalise(t.description).includes(p));
  await Promise.all(hits.map((t) => updateTransaction(t.id, { category_id, payment_id, needs_review: false })));
  return hits.length;
}

export async function lastImport() {
  const { data, error } = await supabase.from('imports').select('*').order('imported_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- Profit and loss ----------

// Income excludes expenses repaid and transfers. Spending excludes items ticked
// Claimable, transfers and the Savings category (shown separately as Saved).
export function summarise(txs, cats) {
  const savingsIds = new Set(cats.filter((c) => c.name.trim().toLowerCase() === 'savings').map((c) => c.id));
  const byCat = new Map();
  let income = 0;
  let spending = 0;
  let saved = 0;
  let review = 0;
  for (const t of txs) {
    const a = Number(t.amount);
    if (t.needs_review) review++;
    if (t.kind === 'transfer') continue;
    if (a > 0) {
      if (t.kind !== 'expenses_repaid') income += a;
      continue;
    }
    if (t.claimable) continue;
    if (t.category_id && savingsIds.has(t.category_id)) { saved += -a; continue; }
    spending += -a;
    byCat.set(t.category_id || null, (byCat.get(t.category_id || null) || 0) + -a);
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const categories = [...byCat.entries()]
    .map(([id, total]) => ({ id, name: (cats.find((c) => c.id === id) || {}).name || 'Uncategorised', total: r2(total) }))
    .sort((a, b) => b.total - a.total);
  return { income: r2(income), spending: r2(spending), saved: r2(saved), left: r2(income - spending - saved), categories, review };
}

// Running expenses totals across all time: claimed, repaid, outstanding.
export async function expensesTotals() {
  const { data, error } = await supabase.from('transactions')
    .select('amount, claimable, kind').or('claimable.eq.true,kind.eq.expenses_repaid').limit(10000);
  if (error) throw error;
  let claimed = 0;
  let repaid = 0;
  for (const t of data || []) {
    if (t.claimable && t.amount < 0) claimed += -Number(t.amount);
    if (t.kind === 'expenses_repaid' && t.amount > 0) repaid += Number(t.amount);
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return { claimed: r2(claimed), repaid: r2(repaid), outstanding: r2(claimed - repaid) };
}
