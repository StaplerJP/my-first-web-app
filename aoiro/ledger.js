/* ledger.js — 複式簿記の集計エンジン
 * 仕訳（journal）と期首残高（opening）から、試算表・総勘定元帳・
 * 青色申告決算書（損益計算書・貸借対照表）を組み立てる。
 */
'use strict';

/* 仕訳の形:
 * { id, date:'2026-04-01', memo:'', partner:'',
 *   lines:[ {ac:'604', side:'D', amount:1200}, {ac:'101', side:'C', amount:1200} ] }
 */

function yen(n) { return Math.round(n || 0); }

/* ---- 1件の仕訳の検証 ---- */
function validateEntry(e, year, BY_CODE) {
  const errs = [];
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errs.push('日付が不正です');
  else if (year && Number(e.date.slice(0, 4)) !== Number(year)) errs.push(`${year}年分の日付ではありません`);
  const lines = (e.lines || []).filter(l => l.ac && yen(l.amount) !== 0);
  if (!lines.length) errs.push('金額のある行がありません');
  for (const l of lines) {
    if (!BY_CODE[l.ac]) errs.push(`不明な勘定科目: ${l.ac}`);
    if (yen(l.amount) < 0) errs.push('金額にマイナスは使えません（借方・貸方を入れ替えてください）');
  }
  const d = lines.filter(l => l.side === 'D').reduce((s, l) => s + yen(l.amount), 0);
  const c = lines.filter(l => l.side === 'C').reduce((s, l) => s + yen(l.amount), 0);
  if (d !== c) errs.push(`借方 ${d.toLocaleString()} と貸方 ${c.toLocaleString()} が一致しません`);
  return { ok: errs.length === 0, errs, debit: d, credit: c };
}

/* ---- 試算表 ---- */
function trialBalance(journal, opening, ACCOUNTS, BY_CODE) {
  const m = new Map();
  const get = code => {
    if (!m.has(code)) {
      const a = BY_CODE[code];
      m.set(code, { code, name: a ? a.name : `?${code}`, side: a ? a.side : 'D',
                    stmt: a ? a.stmt : 'BS', row: a ? a.row : 'asset',
                    opening: yen(opening[code]), debit: 0, credit: 0 });
    }
    return m.get(code);
  };
  for (const code of Object.keys(opening || {})) if (yen(opening[code]) !== 0) get(code);
  for (const e of journal) {
    for (const l of (e.lines || [])) {
      if (!l.ac || yen(l.amount) === 0) continue;
      const r = get(l.ac);
      if (l.side === 'D') r.debit += yen(l.amount); else r.credit += yen(l.amount);
    }
  }
  const rows = [...m.values()].map(r => {
    const move = r.side === 'D' ? r.debit - r.credit : r.credit - r.debit;
    return { ...r, move, balance: r.opening + move };
  });
  rows.sort((a, b) => a.code.localeCompare(b.code));
  const totalD = rows.reduce((s, r) => s + r.debit, 0);
  const totalC = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, totalD, totalC, balanced: totalD === totalC };
}

function balOf(tb, code) { const r = tb.rows.find(x => x.code === code); return r ? r.balance : 0; }
function sumRow(tb, row) { return tb.rows.filter(r => r.row === row).reduce((s, r) => s + r.balance, 0); }

/* ---- 総勘定元帳 ---- */
function generalLedger(journal, opening, code, BY_CODE) {
  const a = BY_CODE[code];
  if (!a) return null;
  const items = [];
  for (const e of journal) {
    for (const l of (e.lines || [])) {
      if (l.ac !== code || yen(l.amount) === 0) continue;
      const counter = (e.lines || [])
        .filter(x => x.ac && x.ac !== code && x.side !== l.side && yen(x.amount) !== 0)
        .map(x => (BY_CODE[x.ac] ? BY_CODE[x.ac].name : x.ac));
      items.push({ date: e.date, memo: e.memo || '', partner: e.partner || '',
                   counter: counter.join('・') || '—',
                   debit: l.side === 'D' ? yen(l.amount) : 0,
                   credit: l.side === 'C' ? yen(l.amount) : 0,
                   entryId: e.id });
    }
  }
  items.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  let bal = yen(opening[code]);
  const rows = items.map(it => {
    bal += a.side === 'D' ? (it.debit - it.credit) : (it.credit - it.debit);
    return { ...it, balance: bal };
  });
  return { account: a, opening: yen(opening[code]), rows, closing: bal };
}

/* ---- 損益計算書（青色申告決算書 1ページ目相当） ---- */
function incomeStatement(tb, settings) {
  const sales = sumRow(tb, 'sales') + sumRow(tb, 'other_income'); // 売上(収入)金額（雑収入を含む）
  const cogsOpen  = sumRow(tb, 'cogs_open');
  const cogsBuy   = sumRow(tb, 'cogs_purchase');
  const cogsClose = sumRow(tb, 'cogs_close');
  const cogs = cogsOpen + cogsBuy - cogsClose;
  const grossProfit = sales - cogs;

  const expenses = tb.rows.filter(r => r.row === 'expense' && r.balance !== 0)
                          .map(r => ({ code: r.code, name: r.name, amount: r.balance }));
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const afterExpenses = grossProfit - expenseTotal;

  const senju      = sumRow(tb, 'senju');
  const hikiateIn  = sumRow(tb, 'hikiate_in');
  const hikiateOut = sumRow(tb, 'hikiate_out');

  const beforeAoiro = afterExpenses + hikiateOut - hikiateIn - senju;

  const kubun = String(settings.aoiroKubun || '65');
  const want = ({ '65': 650000, '55': 550000, '10': 100000 })[kubun] ?? 650000;
  const aoiro = beforeAoiro > 0 ? Math.min(want, beforeAoiro) : 0;

  return { sales, cogsOpen, cogsBuy, cogsClose, cogs, grossProfit,
           expenses, expenseTotal, afterExpenses,
           senju, hikiateIn, hikiateOut,
           beforeAoiro, aoiroWant: want, aoiro, shotoku: beforeAoiro - aoiro };
}

/* ---- 貸借対照表 ---- */
function balanceSheet(tb, pl) {
  const pick = row => tb.rows.filter(r => r.row === row && (r.balance !== 0 || r.opening !== 0))
                             .map(r => ({ code: r.code, name: r.name, opening: r.opening, closing: r.balance }));
  const assets = pick('asset');
  const liabilities = pick('liability');
  const equity = pick('equity');

  const assetOpen  = assets.reduce((s, r) => s + r.opening, 0);
  const assetClose = assets.reduce((s, r) => s + r.closing, 0);
  const liabOpen   = liabilities.reduce((s, r) => s + r.opening, 0);
  const liabClose  = liabilities.reduce((s, r) => s + r.closing, 0);
  const eqOpen     = equity.reduce((s, r) => s + r.opening, 0);
  const eqClose    = equity.reduce((s, r) => s + r.closing, 0);

  // 期末の負債・資本側には当期の「青色申告特別控除前の所得金額」が載る
  const rightClose = liabClose + eqClose + pl.beforeAoiro;
  return { assets, liabilities, equity,
           assetOpen, assetClose, liabOpen, liabClose, eqOpen, eqClose,
           profit: pl.beforeAoiro,
           rightOpen: liabOpen + eqOpen, rightClose,
           diffOpen: assetOpen - (liabOpen + eqOpen),
           diffClose: assetClose - rightClose };
}

/* ---- まとめて計算 ---- */
function buildAll(journal, opening, settings, ACCOUNTS, BY_CODE) {
  const tb = trialBalance(journal, opening, ACCOUNTS, BY_CODE);
  const pl = incomeStatement(tb, settings);
  const bs = balanceSheet(tb, pl);
  return { tb, pl, bs };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateEntry, trialBalance, generalLedger, incomeStatement,
                     balanceSheet, buildAll, balOf, sumRow };
}
