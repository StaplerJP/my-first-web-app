/* app.js — 画面まわり。データはブラウザのlocalStorageにのみ保存する。 */
'use strict';

const KEY = 'aoiro-choubo-v1';
const F = n => (Math.round(n || 0)).toLocaleString('ja-JP');
const el = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------------- 状態 ---------------- */
const BLANK = {
  year: 2026,
  settings: { name:'', yago:'', job:'', aoiroKubun:'65' },
  tax: { kyuyo:0, gensen:0, shakai:0, ideco:0, seimei:0, iryo:0, kifu:0, other:0, yotei:0 },
  opening: {},
  journal: [],
  seq: 1,
  assets: [],
  assetSeq: 1,
};
let S = load();
let editingId = null;
let lines = [];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(BLANK);
    const o = JSON.parse(raw);
    return Object.assign(structuredClone(BLANK), o,
      { settings: Object.assign({}, BLANK.settings, o.settings),
        tax: Object.assign({}, BLANK.tax, o.tax) });
  } catch (e) { return structuredClone(BLANK); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { msg('dataMsg', 'bad', '保存できませんでした：' + e.message); }
}
function msg(box, kind, html) {
  const b = el(box); if (!b) return;
  b.innerHTML = html ? `<div class="msg ${kind}">${html}</div>` : '';
}

/* ---------------- タブ ---------------- */
const PANES = ['input','journal','ledger','assets','trial','stmt','tax','setup'];
document.querySelectorAll('nav.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav.tabs button').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    PANES.forEach(p => el('pane-' + p).hidden = (p !== btn.dataset.pane));
    renderAll();
  });
});

/* ---------------- 仕訳明細エディタ ---------------- */
const acOptions = () => ACCOUNTS.map(a => `<option value="${a.code}">${a.code} ${esc(a.name)}</option>`).join('');

function blankLines() { return [ {ac:'', side:'D', amount:''}, {ac:'', side:'C', amount:''} ]; }

function renderLines() {
  el('lineBox').innerHTML = lines.map((l, i) => `
    <div class="lineRow">
      <button type="button" class="sideBtn" data-side="${l.side}" data-i="${i}">${l.side === 'D' ? '借方' : '貸方'}</button>
      <select data-f="ac" data-i="${i}"><option value="">科目を選ぶ…</option>${acOptions()}</select>
      <input type="number" class="num" data-f="amount" data-i="${i}" value="${l.amount}" placeholder="0">
      <button type="button" class="x" data-del="${i}" title="この行を削除">×</button>
    </div>`).join('');
  lines.forEach((l, i) => { el('lineBox').querySelector(`select[data-i="${i}"]`).value = l.ac || ''; });

  el('lineBox').querySelectorAll('.sideBtn').forEach(b => b.onclick = () => {
    const i = +b.dataset.i; lines[i].side = lines[i].side === 'D' ? 'C' : 'D'; renderLines();
  });
  el('lineBox').querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => {
    const i = +inp.dataset.i;
    lines[i][inp.dataset.f] = inp.dataset.f === 'amount' ? inp.value : inp.value;
    sumLines();
  });
  el('lineBox').querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (lines.length <= 1) return;
    lines.splice(+b.dataset.del, 1); renderLines();
  });
  sumLines();
}
function sumLines() {
  const d = lines.filter(l => l.side === 'D').reduce((s, l) => s + (+l.amount || 0), 0);
  const c = lines.filter(l => l.side === 'C').reduce((s, l) => s + (+l.amount || 0), 0);
  el('lineSum').innerHTML = `借方 <b>${F(d)}</b> / 貸方 <b>${F(c)}</b>` +
    (d === c ? (d ? ' <span class="pill">一致</span>' : '') : ' <span class="pill w">差額 ' + F(Math.abs(d - c)) + '</span>');
}
el('addLine').onclick = () => { lines.push({ac:'', side:'D', amount:''}); renderLines(); };

/* よく使う仕訳のテンプレート */
const TEMPLATES = [
  { t:'売上（掛け）',     l:[['104','D'],['401','C']], memo:'制作費' },
  { t:'売上（即入金）',   l:[['102','D'],['401','C']], memo:'売上' },
  { t:'売掛金の入金',     l:[['102','D'],['104','C']], memo:'入金' },
  { t:'源泉徴収された売上', l:[['102','D'],['601','D'],['401','C']], memo:'報酬（源泉徴収あり）' },
  { t:'経費をカード払い', l:[['610','D'],['202','C']], memo:'' },
  { t:'経費を事業用口座から', l:[['605','D'],['102','C']], memo:'' },
  { t:'経費を自分の財布から', l:[['604','D'],['290','C']], memo:'立替' },
  { t:'家賃（按分後）',   l:[['616','D'],['290','C']], memo:'家賃 按分' },
  { t:'生活費を引き出す', l:[['190','D'],['102','C']], memo:'生活費' },
  { t:'減価償却費',       l:[['611','D'],['112','C']], memo:'減価償却費（年末計上）' },
];
el('tmplBox').innerHTML = TEMPLATES.map((t, i) => `<button type="button" data-t="${i}">${esc(t.t)}</button>`).join('');
el('tmplBox').querySelectorAll('button').forEach(b => b.onclick = () => {
  const t = TEMPLATES[+b.dataset.t];
  lines = t.l.map(([ac, side]) => ({ ac, side, amount:'' }));
  if (t.memo && !el('inMemo').value) el('inMemo').value = t.memo;
  renderLines();
});

/* ---------------- 登録・編集・削除 ---------------- */
el('saveEntry').onclick = () => {
  const e = {
    id: editingId ?? S.seq,
    date: el('inDate').value,
    memo: el('inMemo').value.trim(),
    partner: el('inPartner').value.trim(),
    lines: lines.filter(l => l.ac && (+l.amount || 0) !== 0)
                .map(l => ({ ac:l.ac, side:l.side, amount:Math.round(+l.amount) })),
  };
  const v = validateEntry(e, S.year, BY_CODE);
  if (!v.ok) { msg('entryMsg', 'bad', '登録できません：<ul>' + v.errs.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>'); return; }
  if (editingId != null) {
    S.journal = S.journal.map(x => x.id === editingId ? e : x);
    msg('entryMsg', 'ok', `仕訳 #${e.id} を更新しました。`);
  } else {
    S.journal.push(e); S.seq++;
    msg('entryMsg', 'ok', `登録しました（借方・貸方 ${F(v.debit)} 円）。`);
  }
  save(); resetEntry(false); renderAll();
};
function resetEntry(clearMsg = true) {
  editingId = null; lines = blankLines();
  el('inMemo').value = ''; el('inPartner').value = '';
  el('editingNote').textContent = '';
  if (clearMsg) msg('entryMsg', '', '');
  renderLines();
}
el('clearEntry').onclick = () => resetEntry();

function editEntry(id) {
  const e = S.journal.find(x => x.id === id); if (!e) return;
  editingId = id;
  el('inDate').value = e.date; el('inMemo').value = e.memo || ''; el('inPartner').value = e.partner || '';
  lines = e.lines.map(l => ({ ...l, amount:String(l.amount) }));
  el('editingNote').textContent = `仕訳 #${id} を編集中`;
  document.querySelector('nav.tabs button[data-pane="input"]').click();
  window.scrollTo({ top:0, behavior:'smooth' });
  renderLines();
}
function delEntry(id) {
  if (!confirm(`仕訳 #${id} を削除します。よろしいですか？`)) return;
  S.journal = S.journal.filter(x => x.id !== id); save(); renderAll();
}

/* ---------------- 家事按分 ---------------- */
function anbun() {
  const t = +el('abTotal').value || 0, r = +el('abRate').value || 0;
  const biz = Math.floor(t * r / 100);
  el('abBiz').value = t ? F(biz) : ''; el('abHome').value = t ? F(t - biz) : '';
}
['abTotal','abRate'].forEach(id => el(id).oninput = anbun);

/* ---------------- 描画 ---------------- */
function calc() { return buildAll(S.journal, S.opening, S.settings, ACCOUNTS, BY_CODE); }

function renderHealth(r) {
  const out = [];
  if (!r.tb.balanced) out.push(`試算表の借方合計と貸方合計が一致していません（差額 ${F(Math.abs(r.tb.totalD - r.tb.totalC))} 円）。`);
  if (r.bs.diffClose !== 0) out.push(`貸借対照表が ${F(Math.abs(r.bs.diffClose))} 円ずれています。期首残高の入力漏れがよくある原因です。`);
  const bad = S.journal.filter(e => !validateEntry(e, S.year, BY_CODE).ok);
  if (bad.length) out.push(`${bad.length} 件の仕訳に問題があります（仕訳帳で赤く表示されます）。`);
  if (!S.journal.length) {
    msg('healthBox', 'warn', 'まだ仕訳がありません。上のテンプレートから選ぶと科目が埋まります。「設定・期首残高」でサンプルデータを入れて動きを見ることもできます。');
    return;
  }
  if (out.length) msg('healthBox', 'warn', '確認してください：<ul>' + out.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>');
  else msg('healthBox', 'ok', `仕訳 ${S.journal.length} 件。貸借は一致しています。青色申告特別控除前の所得金額は ${F(r.pl.beforeAoiro)} 円です。`);
}

function rowsTable(head, body, cls = '') {
  return `<thead><tr>${head}</tr></thead><tbody class="${cls}">${body}</tbody>`;
}

function renderRecent() {
  const js = [...S.journal].sort((a, b) => (b.date + String(b.id)).localeCompare(a.date + String(a.id))).slice(0, 20);
  el('recentTbl').innerHTML = rowsTable(
    '<th>日付</th><th>借方</th><th class="n">金額</th><th>貸方</th><th>摘要</th><th></th>',
    js.map(e => entryRow(e)).join('') || '<tr><td colspan="6" class="hint">まだありません</td></tr>');
  bindRowButtons('recentTbl');
}

function entryRow(e) {
  const v = validateEntry(e, S.year, BY_CODE);
  const nm = c => BY_CODE[c] ? BY_CODE[c].name : c;
  const d = e.lines.filter(l => l.side === 'D'), c = e.lines.filter(l => l.side === 'C');
  const amt = d.reduce((s, l) => s + l.amount, 0);
  return `<tr${v.ok ? '' : ' style="background:var(--bad-soft)"'}>
    <td style="white-space:nowrap">${esc(e.date)}${v.ok ? '' : ' ⚠'}</td>
    <td>${d.map(l => esc(nm(l.ac)) + (d.length > 1 ? ' ' + F(l.amount) : '')).join('<br>')}</td>
    <td class="n">${F(amt)}</td>
    <td>${c.map(l => esc(nm(l.ac)) + (c.length > 1 ? ' ' + F(l.amount) : '')).join('<br>')}</td>
    <td>${esc(e.memo)}${e.partner ? ` <span class="hint">/ ${esc(e.partner)}</span>` : ''}</td>
    <td style="white-space:nowrap"><button class="btn sm ghost" data-edit="${e.id}">編集</button>
        <button class="x" data-rm="${e.id}" title="削除">×</button></td></tr>`;
}
function bindRowButtons(id) {
  el(id).querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editEntry(+b.dataset.edit));
  el(id).querySelectorAll('[data-rm]').forEach(b => b.onclick = () => delEntry(+b.dataset.rm));
}

function renderJournal() {
  const q = (el('jSearch').value || '').trim();
  const mo = el('jMonth').value;
  const nm = c => BY_CODE[c] ? BY_CODE[c].name : c;
  let js = [...S.journal].sort((a, b) => (a.date + String(a.id)).localeCompare(b.date + String(b.id)));
  if (mo) js = js.filter(e => e.date.slice(0, 7) === mo);
  if (q) js = js.filter(e => (e.memo + ' ' + e.partner + ' ' + e.lines.map(l => nm(l.ac)).join(' ')).includes(q));
  el('jCount').textContent = `${js.length} 件 / 全 ${S.journal.length} 件`;
  el('journalTbl').innerHTML = rowsTable(
    '<th>日付</th><th>借方</th><th class="n">金額</th><th>貸方</th><th>摘要</th><th></th>',
    js.map(e => entryRow(e)).join('') || '<tr><td colspan="6" class="hint">該当なし</td></tr>');
  bindRowButtons('journalTbl');
}
el('jSearch').oninput = renderJournal;

function renderMonthFilter() {
  const cur = el('jMonth').value;
  const ms = [...new Set(S.journal.map(e => e.date.slice(0, 7)))].sort();
  el('jMonth').innerHTML = '<option value="">すべての月</option>' +
    ms.map(m => `<option value="${m}">${m.replace('-', '年')}月</option>`).join('');
  el('jMonth').value = cur;
  el('jMonth').onchange = renderJournal;
}

function renderLedger() {
  const sel = el('ledgerAc');
  if (!sel.dataset.filled) {
    sel.innerHTML = ACCOUNTS.map(a => `<option value="${a.code}">${a.code} ${esc(a.name)}</option>`).join('');
    sel.value = '102'; sel.dataset.filled = '1'; sel.onchange = renderLedger;
  }
  const g = generalLedger(S.journal, S.opening, sel.value, BY_CODE);
  if (!g) return;
  const body = [`<tr class="sub"><td colspan="5">期首残高</td><td class="n">${F(g.opening)}</td></tr>`]
    .concat(g.rows.map(r => `<tr><td style="white-space:nowrap">${esc(r.date)}</td><td>${esc(r.counter)}</td>
      <td>${esc(r.memo)}${r.partner ? ` <span class="hint">/ ${esc(r.partner)}</span>` : ''}</td>
      <td class="n">${r.debit ? F(r.debit) : ''}</td><td class="n">${r.credit ? F(r.credit) : ''}</td>
      <td class="n">${F(r.balance)}</td></tr>`))
    .concat([`<tr class="total"><td colspan="5">期末残高</td><td class="n">${F(g.closing)}</td></tr>`]);
  el('ledgerTbl').innerHTML = rowsTable(
    '<th>日付</th><th>相手科目</th><th>摘要</th><th class="n">借方</th><th class="n">貸方</th><th class="n">残高</th>',
    body.join(''));
}

function renderTrial(r) {
  const body = r.tb.rows.map(x => `<tr><td>${x.code}</td><td>${esc(x.name)}</td>
    <td class="n">${x.opening ? F(x.opening) : ''}</td>
    <td class="n">${x.debit ? F(x.debit) : ''}</td><td class="n">${x.credit ? F(x.credit) : ''}</td>
    <td class="n">${F(x.balance)}</td></tr>`).join('');
  el('trialTbl').innerHTML = rowsTable(
    '<th>コード</th><th>勘定科目</th><th class="n">期首</th><th class="n">借方合計</th><th class="n">貸方合計</th><th class="n">残高</th>',
    body + `<tr class="total"><td colspan="3">合計</td><td class="n">${F(r.tb.totalD)}</td><td class="n">${F(r.tb.totalC)}</td><td class="n"></td></tr>`);
  msg('trialMsg', r.tb.balanced ? 'ok' : 'bad',
    r.tb.balanced ? '借方合計と貸方合計が一致しています。' : `差額 ${F(Math.abs(r.tb.totalD - r.tb.totalC))} 円。仕訳のどこかで借方・貸方が揃っていません。`);
}

function renderStmt(r) {
  const p = r.pl;
  const line = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="n">${F(v)}</td></tr>`;
  let b = '';
  b += line('売上（収入）金額　※雑収入を含む', p.sales, 'sub');
  if (p.cogsOpen || p.cogsBuy || p.cogsClose) {
    b += line('　期首商品棚卸高', p.cogsOpen) + line('　仕入金額', p.cogsBuy) +
         line('　期末商品棚卸高（控除）', -p.cogsClose) + line('差引原価', p.cogs, 'sub');
  }
  b += line('差引金額', p.grossProfit, 'sub');
  b += p.expenses.map(e => line('　' + esc(e.name), e.amount)).join('');
  b += line('経費計', p.expenseTotal, 'sub');
  b += line('差引金額', p.afterExpenses, 'sub');
  if (p.senju) b += line('専従者給与', -p.senju);
  if (p.hikiateOut) b += line('貸倒引当金 戻入額', p.hikiateOut);
  if (p.hikiateIn) b += line('貸倒引当金 繰入額', -p.hikiateIn);
  b += line('<b>青色申告特別控除前の所得金額</b>', p.beforeAoiro, 'total');
  b += line(`青色申告特別控除額（上限 ${F(p.aoiroWant)} 円）`, -p.aoiro);
  b += line('<b>所得金額</b>', p.shotoku, 'total');
  el('plTbl').innerHTML = rowsTable('<th>科目</th><th class="n">金額（円）</th>', b);

  const bs = r.bs;
  const n = Math.max(bs.assets.length, bs.liabilities.length + bs.equity.length + 1);
  const rightRows = bs.liabilities.concat(bs.equity)
    .concat([{ name:'青色申告特別控除前の所得金額', opening:'', closing:bs.profit }]);
  let rows = '';
  for (let i = 0; i < n; i++) {
    const a = bs.assets[i], d = rightRows[i];
    rows += `<tr>
      <td>${a ? esc(a.name) : ''}</td><td class="n">${a ? F(a.opening) : ''}</td><td class="n">${a ? F(a.closing) : ''}</td>
      <td>${d ? esc(d.name) : ''}</td><td class="n">${d && d.opening !== '' ? F(d.opening) : ''}</td><td class="n">${d ? F(d.closing) : ''}</td></tr>`;
  }
  rows += `<tr class="total"><td>資産合計</td><td class="n">${F(bs.assetOpen)}</td><td class="n">${F(bs.assetClose)}</td>
    <td>負債・資本合計</td><td class="n">${F(bs.rightOpen)}</td><td class="n">${F(bs.rightClose)}</td></tr>`;
  el('bsTbl').innerHTML = rowsTable(
    '<th>資産</th><th class="n">期首</th><th class="n">期末</th><th>負債・資本</th><th class="n">期首</th><th class="n">期末</th>', rows);
  msg('bsMsg', bs.diffClose === 0 ? 'ok' : 'warn',
    bs.diffClose === 0 ? '期末の資産と負債・資本が一致しています。' :
    `期末が ${F(Math.abs(bs.diffClose))} 円ずれています。期首残高（特に元入金）の入力漏れ、または事業用と私用の口座の混在が原因になりやすいところです。`);
}

/* ---------------- 税額 ---------------- */
const TAXF = [['txKyuyo','kyuyo'],['txGensen','gensen'],['txShakai','shakai'],['txIdeco','ideco'],
              ['txSeimei','seimei'],['txIryo','iryo'],['txKifu','kifu'],['txOther','other'],['txYotei','yotei']];
TAXF.forEach(([id, k]) => el(id).oninput = () => { S.tax[k] = +el(id).value || 0; save(); renderTax(calc()); });

function renderTax(r) {
  const t = calcTax({
    kyuyoShunyu: S.tax.kyuyo, gensenZeigaku: S.tax.gensen,
    jigyoShotokuBeforeAoiro: r.pl.beforeAoiro, aoiroKubun: S.settings.aoiroKubun,
    shakaiHoken: S.tax.shakai, iDeCo: S.tax.ideco, seimeiHoken: S.tax.seimei,
    iryohi: S.tax.iryo, kifukin: S.tax.kifu, otherKojo: S.tax.other, yoteiNozei: S.tax.yotei,
  });
  const k = [];
  k.push(`<div class="k"><div class="lab">合計所得金額</div><div class="val">${F(t.goukei)}</div><div class="note">給与 ${F(t.kyuyo)} ＋ 事業 ${F(t.jigyo)}</div></div>`);
  k.push(`<div class="k"><div class="lab">課税される所得金額</div><div class="val">${F(t.kazei)}</div><div class="note">税率 ${(t.rate*100).toFixed(0)}％</div></div>`);
  k.push(`<div class="k"><div class="lab">所得税＋復興特別所得税</div><div class="val">${F(t.goukeiZei)}</div><div class="note">うち復興特別 ${F(t.fukko)}</div></div>`);
  k.push(t.nofu >= 0
    ? `<div class="k bad"><div class="lab">納付する税額</div><div class="val">${F(t.nofu)}</div><div class="note">源泉徴収 ${F(t.gensen)} を差引後</div></div>`
    : `<div class="k good"><div class="lab">還付される税額</div><div class="val">${F(t.kampu)}</div><div class="note">源泉徴収 ${F(t.gensen)} を差引後</div></div>`);
  k.push(`<div class="k"><div class="lab">住民税（概算）</div><div class="val">${F(t.jumin)}</div><div class="note">所得割10％＋均等割5,000円の目安</div></div>`);
  el('taxKpi').innerHTML = k.join('');

  const L = (a, b, cls = '') => `<tr class="${cls}"><td>${a}</td><td class="n">${F(b)}</td></tr>`;
  let b = '';
  b += L('給与の収入金額', t.kyuyoShunyu);
  b += L(`　給与所得控除（令和8年分）`, -t.kyuyoKojo);
  b += L('給与所得', t.kyuyo, 'sub');
  b += L('青色申告特別控除前の事業所得', t.jigyoBefore);
  b += L('　青色申告特別控除', -t.aoiro);
  b += L('事業所得', t.jigyo, 'sub');
  b += L('<b>合計所得金額</b>', t.goukei, 'total');
  b += t.kojoList.filter(x => x.value).map(x => L('　' + esc(x.label), x.value)).join('');
  b += L('所得控除の合計', t.kojoGoukei, 'sub');
  b += L('<b>課税される所得金額</b>（1,000円未満切捨て）', t.kazei, 'total');
  b += L(`所得税額（税率 ${(t.rate*100).toFixed(0)}％ − 控除 ${F(t.sokusanDeduct)}）`, t.kijun);
  b += L('復興特別所得税（2.1％）', t.fukko);
  b += L('所得税及び復興特別所得税の額（100円未満切捨て）', t.goukeiZei, 'sub');
  b += L('　源泉徴収税額', -t.gensen);
  if (t.yotei) b += L('　予定納税額', -t.yotei);
  b += L(t.nofu >= 0 ? '<b>納付する税額</b>' : '<b>還付される税額</b>', t.nofu >= 0 ? t.nofu : t.kampu, 'total');
  el('taxTbl').innerHTML = rowsTable('<th>項目</th><th class="n">金額（円）</th>', b);

  const notes = [];
  if (t.kyuyoApprox) notes.push('給与の収入が220万円以上660万円未満のときは、本来「所得税法別表第五」で給与所得を求めます。ここでは速算表で計算しているため数千円ずれることがあります。');
  if (S.settings.aoiroKubun === '65') notes.push('65万円控除には、複式簿記に加えて <b>e-Taxでの申告書・決算書の送信</b>（または優良な電子帳簿保存＋届出書）が必要です。書面提出だと55万円になります。');
  if (t.jigyoBefore < 0) notes.push('事業所得が赤字です。事業所得なら給与所得と損益通算できます（青色申告なら赤字は翌年以降3年間繰越しも可）。赤字のときは青色申告特別控除は0円です。');
  if (t.jigyoBefore > 0 && t.jigyoBefore < 200001) notes.push('給与1か所＋給与以外の所得が20万円以下なら所得税の確定申告は不要とされています（国税庁No.1900）。ただし住民税の申告は別途必要で、還付を受けたい場合や青色申告特別控除を使いたい場合は申告します。');
  notes.push('住民税は所得税と控除額が違うため、上の住民税はあくまで目安です。正確な額は翌年6月の通知で確定します。');
  msg('taxMsg', 'warn', notes.map(x => `<p style="margin:4px 0">${x}</p>`).join(''));
}

/* ---------------- 設定 ---------------- */
function renderSetup() {
  el('stName').value = S.settings.name; el('stYago').value = S.settings.yago;
  el('stJob').value = S.settings.job;   el('stAoiro').value = S.settings.aoiroKubun;
  el('stYear').value = S.year;
  const note = { '65':'ok', '55':'warn', '10':'warn' }[S.settings.aoiroKubun];
  const text = {
    '65':'複式簿記＋期限内申告＋（e-Tax送信 または 優良な電子帳簿保存と届出書）が条件です。このツールの帳簿は複式簿記なので、あとはe-Taxで送信すれば要件を満たします。',
    '55':'複式簿記＋期限内申告が条件です。e-Taxで送信すれば65万円になります。',
    '10':'簡易簿記などの場合です。このツールは複式簿記なので、55万円か65万円を選べる可能性があります。',
  }[S.settings.aoiroKubun];
  msg('aoiroNote', note, text + '<br>いずれも期限（2027年3月15日）までの申告が条件で、控除額は黒字の事業所得等が上限です。（国税庁 No.2072）');

  const rows = ACCOUNTS.filter(a => a.stmt === 'BS').map(a =>
    `<tr><td>${a.code}</td><td>${esc(a.name)}</td><td class="n">${a.side === 'D' ? '資産' : (a.row === 'equity' ? '資本' : '負債')}</td>
     <td><input type="number" class="num" data-open="${a.code}" value="${S.opening[a.code] || ''}" placeholder="0"></td></tr>`).join('');
  el('openTbl').innerHTML = rowsTable('<th>コード</th><th>勘定科目</th><th class="n">区分</th><th class="n">期首残高</th>', rows);
  el('openTbl').querySelectorAll('[data-open]').forEach(i => i.oninput = () => {
    const v = +i.value || 0; const c = i.dataset.open;
    if (v) S.opening[c] = v; else delete S.opening[c];
    save(); checkOpening(); renderAll();
  });
  checkOpening();
}
function checkOpening() {
  let d = 0, c = 0;
  for (const [code, v] of Object.entries(S.opening)) {
    const a = BY_CODE[code]; if (!a) continue;
    if (a.side === 'D') d += v; else c += v;
  }
  msg('openMsg', d === c ? 'ok' : 'warn',
    d === c ? `期首の資産 ${F(d)} 円 ＝ 負債・資本 ${F(c)} 円。一致しています。`
            : `期首の資産 ${F(d)} 円 と 負債・資本 ${F(c)} 円 が ${F(Math.abs(d - c))} 円ずれています。差額は「元入金」で調整するのが一般的です。`);
}
['stName','stYago','stJob'].forEach(id => el(id).oninput = () => {
  S.settings[{stName:'name',stYago:'yago',stJob:'job'}[id]] = el(id).value; save();
});
el('stAoiro').onchange = () => { S.settings.aoiroKubun = el('stAoiro').value; save(); renderSetup(); renderAll(); };
el('stYear').oninput = () => { S.year = +el('stYear').value || 2026; save(); renderAll(); };

/* ---------------- CSV ---------------- */
el('exportCsv').onclick = () => {
  const nm = c => BY_CODE[c] ? BY_CODE[c].name : c;
  const rows = [['日付','借方科目','借方金額','貸方科目','貸方金額','摘要','相手先','仕訳番号']];
  for (const e of [...S.journal].sort((a,b)=>(a.date+a.id).localeCompare(b.date+b.id))) {
    const d = e.lines.filter(l => l.side === 'D'), c = e.lines.filter(l => l.side === 'C');
    const n = Math.max(d.length, c.length);
    for (let i = 0; i < n; i++) {
      rows.push([e.date, d[i] ? nm(d[i].ac) : '', d[i] ? d[i].amount : '',
                 c[i] ? nm(c[i].ac) : '', c[i] ? c[i].amount : '',
                 i === 0 ? (e.memo||'') : '', i === 0 ? (e.partner||'') : '', e.id]);
    }
  }
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g,'""') + '"' : String(v)).join(',')).join('\r\n');
  download('﻿' + csv, `仕訳帳_${S.year}.csv`, 'text/csv;charset=utf-8');
};

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
const findAc = s => {
  s = String(s || '').trim(); if (!s) return null;
  if (BY_CODE[s]) return s;
  if (BY_NAME[s]) return BY_NAME[s].code;
  const hit = ACCOUNTS.find(a => a.name.replace(/[ 　]/g,'') === s.replace(/[ 　]/g,''));
  return hit ? hit.code : null;
};
el('importCsv').onchange = ev => {
  const f = ev.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const rows = parseCsv(String(rd.result));
      if (!rows.length) { msg('csvMsg','bad','空のファイルです。'); return; }
      const head = rows[0].map(h => h.trim());
      const start = /日付|date/i.test(head[0]) ? 1 : 0;
      const groups = new Map(); const warn = [];
      rows.slice(start).forEach((r, idx) => {
        const [date, dAc, dAmt, cAc, cAmt, memo, partner, no] = r.map(x => (x||'').trim());
        const key = no || `row${idx}`;
        if (!groups.has(key)) groups.set(key, { date, memo, partner, lines: [] });
        const g = groups.get(key);
        if (date && !g.date) g.date = date;
        if (memo && !g.memo) g.memo = memo;
        if (partner && !g.partner) g.partner = partner;
        const push = (ac, amt, side) => {
          const n = Math.round(Number(String(amt).replace(/[,，\s円]/g,'')) || 0);
          if (!ac || !n) return;
          const code = findAc(ac);
          if (!code) { warn.push(`${g.date||''} 「${ac}」は勘定科目に見つかりません`); return; }
          g.lines.push({ ac: code, side, amount: n });
        };
        push(dAc, dAmt, 'D'); push(cAc, cAmt, 'C');
      });
      let ok = 0; const bad = [];
      for (const g of groups.values()) {
        const e = { id: S.seq, date: normDate(g.date), memo: g.memo || '', partner: g.partner || '', lines: g.lines };
        const v = validateEntry(e, S.year, BY_CODE);
        if (v.ok) { S.journal.push(e); S.seq++; ok++; }
        else bad.push(`${e.date || '日付なし'}：${v.errs[0]}`);
      }
      save(); renderAll();
      let m = `${ok} 件を取り込みました。`;
      if (bad.length) m += `<br>取り込めなかったもの ${bad.length} 件：<ul>${bad.slice(0,8).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
      if (warn.length) m += `<br>科目が見つからなかった行 ${warn.length} 件：<ul>${[...new Set(warn)].slice(0,8).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
      msg('csvMsg', bad.length || warn.length ? 'warn' : 'ok', m);
    } catch (e) { msg('csvMsg', 'bad', '読み込みに失敗しました：' + esc(e.message)); }
    ev.target.value = '';
  };
  rd.readAsText(f);
};
function normDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})[-/月.](\d{1,2})/);
  if (m) return `${S.year}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  return s;
}

/* ---------------- バックアップ ---------------- */
function download(content, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
el('expJson').onclick = () => download(JSON.stringify(S, null, 2), `青色申告帳簿_${S.year}.json`, 'application/json');
el('impJson').onchange = ev => {
  const f = ev.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(String(rd.result));
      if (!o || !Array.isArray(o.journal)) throw new Error('このツールのバックアップではないようです');
      if (!confirm('いまのデータを置き換えます。よろしいですか？')) return;
      S = Object.assign(structuredClone(BLANK), o,
        { settings: Object.assign({}, BLANK.settings, o.settings), tax: Object.assign({}, BLANK.tax, o.tax) });
      save(); boot(); msg('dataMsg', 'ok', `読み込みました（仕訳 ${S.journal.length} 件）。`);
    } catch (e) { msg('dataMsg', 'bad', '読み込めませんでした：' + esc(e.message)); }
    ev.target.value = '';
  };
  rd.readAsText(f);
};
el('wipe').onclick = () => {
  if (!confirm('すべての仕訳・設定を削除します。元に戻せません。よろしいですか？')) return;
  localStorage.removeItem(KEY); S = structuredClone(BLANK); boot();
  msg('dataMsg', 'ok', '削除しました。');
};
el('loadDemo').onclick = () => {
  if (S.journal.length && !confirm('いまの仕訳にサンプルを追加します。よろしいですか？')) return;
  const y = S.year;
  const add = (date, memo, partner, ls) => { S.journal.push({ id:S.seq++, date:`${y}-${date}`, memo, partner, lines:ls }); };
  S.opening = { '102': 300000, '301': 300000 };
  add('01-31','Webサイト保守 1月分','A社',[{ac:'104',side:'D',amount:88000},{ac:'401',side:'C',amount:88000}]);
  add('02-25','1月分入金','A社',[{ac:'102',side:'D',amount:88000},{ac:'104',side:'C',amount:88000}]);
  add('03-15','ランディングページ制作','B商店',[{ac:'102',side:'D',amount:220000},{ac:'601',side:'D',amount:0},{ac:'401',side:'C',amount:220000}]);
  add('04-10','ノートPC','量販店',[{ac:'112',side:'D',amount:148000},{ac:'202',side:'C',amount:148000}]);
  add('04-20','中古車（2021年5月初度登録）','中古車店',[{ac:'111',side:'D',amount:450000},{ac:'290',side:'C',amount:450000}]);
  add('04-22','スタッドレスタイヤ4本','タイヤ店',[{ac:'621',side:'D',amount:62000},{ac:'290',side:'C',amount:62000}]);
  add('04-30','カード引落','カード',[{ac:'202',side:'D',amount:148000},{ac:'102',side:'C',amount:148000}]);
  add('05-01','自宅家賃 按分30%','大家',[{ac:'616',side:'D',amount:36000},{ac:'290',side:'C',amount:36000}]);
  add('05-20','サーバー・ドメイン','ホスティング',[{ac:'605',side:'D',amount:14300},{ac:'102',side:'C',amount:14300}]);
  add('06-30','技術書','書店',[{ac:'620',side:'D',amount:8800},{ac:'290',side:'C',amount:8800}]);
  add('07-15','生活費引出','',[{ac:'190',side:'D',amount:100000},{ac:'102',side:'C',amount:100000}]);
  add('09-30','コンサル料','C社',[{ac:'104',side:'D',amount:330000},{ac:'401',side:'C',amount:330000}]);
  add('10-25','9月分入金','C社',[{ac:'102',side:'D',amount:330000},{ac:'104',side:'C',amount:330000}]);
  add('11-30','打合せ交通費','',[{ac:'604',side:'D',amount:12400},{ac:'290',side:'C',amount:12400}]);
  S.journal = S.journal.map(e => ({ ...e, lines: e.lines.filter(l => l.amount !== 0) }));
  S.assets = [
    { id:1, name:'中古車（普通自動車）', acct:'111', acquireDate:`${y}-04-20`, startDate:`${y}-04-20`,
      cost:450000, used:true, firstRegYM:'2021-05', legalYears:6, yearsManual:0,
      method:'teigaku', bizRatio:70, memo:'週3日 営業訪問。走行距離ベースで70%' },
    { id:2, name:'ノートPC', acct:'112', acquireDate:`${y}-04-10`, startDate:`${y}-04-10`,
      cost:148000, used:false, firstRegYM:'', legalYears:4, yearsManual:0,
      method:'tokurei', bizRatio:90, memo:'開発用。私用1割' },
  ];
  S.assetSeq = 3;
  S.tax = { kyuyo:5200000, gensen:138000, shakai:790000, ideco:0, seimei:40000, iryo:0, kifu:0, other:0, yotei:0 };
  S.settings.job = S.settings.job || 'Web制作';
  save(); postDepreciation(); boot();
  msg('dataMsg','ok','サンプルを入れました。固定資産タブに中古車とPCが入っていて、減価償却仕訳も作成済みです。');
};

/* ================= 固定資産台帳 ================= */
let editingAsset = null, schedFor = null;

function assetYears(a) { return resolveYears(a); }

function initAssetForm() {
  const pre = el('asPreset');
  pre.innerHTML = '<option value="">選ばない（法定耐用年数を自分で入れる）</option>' +
    TAIYO_PRESETS.map(g => `<optgroup label="${esc(g.group)}">` +
      g.items.map(([n, y]) => `<option value="${esc(g.acct)}|${y}|${esc(n)}">${esc(n)}（${y}年）</option>`).join('') +
      '</optgroup>').join('');
  el('asAcct').innerHTML = ACCOUNTS.filter(a => a.row === 'asset' && a.code !== '190')
    .map(a => `<option value="${a.code}">${a.code} ${esc(a.name)}</option>`).join('');
  el('asMethod').innerHTML = Object.entries(METHODS)
    .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

  pre.onchange = () => {
    const v = pre.value; if (!v) return;
    const [acct, years, name] = v.split('|');
    el('asAcct').value = acct; el('asLegal').value = years;
    if (!el('asName').value) el('asName').value = name;
    refreshSuggest();
  };
  el('asUsed').onchange = () => { el('asRegWrap').style.display = el('asUsed').value === '1' ? '' : 'none'; refreshSuggest(); };
  ['asDate','asStart','asCost','asReg','asLegal','asYears','asMethod','asRatio'].forEach(id => {
    el(id).oninput = refreshSuggest; el(id).onchange = refreshSuggest;
  });
  el('asDate').onchange = () => { if (!el('asStart').value) el('asStart').value = el('asDate').value; refreshSuggest(); };
  el('asSave').onclick = saveAsset;
  el('asClear').onclick = () => resetAssetForm();
  el('asPost').onclick = postDepreciation;
  resetAssetForm();
}

function formAsset() {
  return {
    id: editingAsset ?? S.assetSeq,
    name: el('asName').value.trim(),
    acct: el('asAcct').value,
    acquireDate: el('asDate').value,
    startDate: el('asStart').value || el('asDate').value,
    cost: Math.round(+el('asCost').value || 0),
    used: el('asUsed').value === '1',
    firstRegYM: el('asReg').value,
    legalYears: +el('asLegal').value || 0,
    yearsManual: +el('asYears').value || 0,
    method: el('asMethod').value,
    bizRatio: Math.min(100, Math.max(0, +el('asRatio').value || 0)),
    memo: el('asMemo').value.trim(),
  };
}

function refreshSuggest() {
  const a = formAsset();
  if (!a.cost || !a.acquireDate) { msg('asSuggest', '', ''); return; }
  const sg = suggest(a.cost, a.acquireDate, true);
  const y = a.method === 'teigaku' || a.method === 'teiritsu' ? assetYears(a) : null;
  let extra = '';
  if (y) {
    const rate = a.method === 'teiritsu' ? TEIRITSU[y].r : TEIGAKU[y];
    extra = `<br>耐用年数 <b>${y}年</b>（償却率 ${rate.toFixed(3)}）`;
    if (a.used && a.firstRegYM) {
      const em = monthsElapsed(a.firstRegYM, String(a.acquireDate).slice(0, 7));
      extra += `　中古・経過 ${em}か月なので簡便法で短縮しています。`;
    }
    const r0 = schedule({ ...a, years: y }).find(r => r.year === S.year);
    if (r0) extra += `<br>${S.year}年分の償却費 <b>${F(r0.dep)}</b> 円（${r0.months}か月）、うち必要経費 <b>${F(r0.biz)}</b> 円`;
  } else {
    const r0 = schedule(a).find(r => r.year === S.year);
    if (r0) extra += `<br>${S.year}年分の償却費 <b>${F(r0.dep)}</b> 円、うち必要経費 <b>${F(r0.biz)}</b> 円`;
  }
  msg('asSuggest', sg.method === a.method ? 'ok' : 'warn',
    `<b>${esc(sg.label)}</b>：${esc(sg.note)}${extra}`);
}

function saveAsset() {
  const a = formAsset();
  const errs = [];
  if (!a.name) errs.push('資産の名前を入れてください');
  if (!a.acquireDate) errs.push('取得日を入れてください');
  if (!a.cost) errs.push('取得価額を入れてください');
  if ((a.method === 'teigaku' || a.method === 'teiritsu')) {
    if (!a.legalYears && !a.yearsManual) errs.push('法定耐用年数を入れるか、用途を選んでください');
    if (a.used && !a.firstRegYM) errs.push('中古なら初度登録・製造年月を入れてください');
  }
  if (errs.length) { msg('asMsg', 'bad', '<ul>' + errs.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>'); return; }
  a.years = assetYears(a);
  if (editingAsset != null) {
    S.assets = S.assets.map(x => x.id === editingAsset ? a : x);
    msg('asMsg', 'ok', `${esc(a.name)} を更新しました。`);
  } else {
    S.assets.push(a); S.assetSeq++;
    msg('asMsg', 'ok', `${esc(a.name)} を台帳に登録しました。減価償却仕訳は下のボタンで作れます。`);
  }
  save(); resetAssetForm(false); renderAll();
}

function resetAssetForm(clear = true) {
  editingAsset = null;
  ['asName','asCost','asReg','asLegal','asYears','asMemo'].forEach(id => el(id).value = '');
  el('asPreset').value = ''; el('asUsed').value = '1'; el('asRatio').value = '100';
  el('asMethod').value = 'teigaku';
  el('asRegWrap').style.display = '';
  el('asDate').value = `${S.year}-12-31`; el('asStart').value = '';
  el('asEditing').textContent = '';
  if (clear) msg('asMsg', '', '');
  msg('asSuggest', '', '');
}

function editAsset(id) {
  const a = S.assets.find(x => x.id === id); if (!a) return;
  editingAsset = id;
  el('asName').value = a.name; el('asAcct').value = a.acct;
  el('asDate').value = a.acquireDate; el('asStart').value = a.startDate;
  el('asCost').value = a.cost; el('asUsed').value = a.used ? '1' : '0';
  el('asReg').value = a.firstRegYM || ''; el('asLegal').value = a.legalYears || '';
  el('asYears').value = a.yearsManual || ''; el('asMethod').value = a.method;
  el('asRatio').value = a.bizRatio; el('asMemo').value = a.memo || '';
  el('asRegWrap').style.display = a.used ? '' : 'none';
  el('asEditing').textContent = `${a.name} を編集中`;
  refreshSuggest();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function delAsset(id) {
  const a = S.assets.find(x => x.id === id); if (!a) return;
  if (!confirm(`「${a.name}」を台帳から削除します。よろしいですか？\n（作成済みの減価償却仕訳は残るので、必要なら仕訳帳で消してください）`)) return;
  S.assets = S.assets.filter(x => x.id !== id);
  if (schedFor === id) schedFor = null;
  save(); renderAll();
}

function assetRow(a) { return yearRow({ ...a, years: assetYears(a) }, S.year); }

function renderAssets() {
  el('asYearLabel').textContent = `${S.year}年分`;
  const rows = S.assets.map(a => {
    const r = assetRow(a);
    const y = (a.method === 'teigaku' || a.method === 'teiritsu') ? assetYears(a) : null;
    const rate = y ? (a.method === 'teiritsu' ? TEIRITSU[y].r : TEIGAKU[y]) : null;
    return `<tr>
      <td>${esc(a.name)}${a.used ? ' <span class="pill">中古</span>' : ''}<div class="hint">${esc(BY_CODE[a.acct] ? BY_CODE[a.acct].name : a.acct)}${a.memo ? ' / ' + esc(a.memo) : ''}</div></td>
      <td style="white-space:nowrap">${esc(a.acquireDate)}</td>
      <td class="n">${F(a.cost)}</td>
      <td style="white-space:nowrap">${esc(METHODS[a.method].replace('（届出が必要）','').replace('（3年均等）','').replace('（全額）',''))}</td>
      <td class="n">${y ? y + '年' : '—'}</td>
      <td class="n">${rate ? rate.toFixed(3) : '—'}</td>
      <td class="n">${r ? F(r.dep) : '0'}</td>
      <td class="n">${a.bizRatio}%</td>
      <td class="n"><b>${r ? F(r.biz) : '0'}</b></td>
      <td class="n">${r ? F(r.close) : '—'}</td>
      <td style="white-space:nowrap">
        <button class="btn sm ghost" data-sched="${a.id}">内訳</button>
        <button class="btn sm ghost" data-aedit="${a.id}">編集</button>
        <button class="x" data-adel="${a.id}" title="削除">×</button></td></tr>`;
  }).join('');
  el('asTbl').innerHTML = rowsTable(
    '<th>資産</th><th>取得日</th><th class="n">取得価額</th><th>償却方法</th><th class="n">耐用年数</th><th class="n">償却率</th><th class="n">本年の償却費</th><th class="n">事業割合</th><th class="n">必要経費</th><th class="n">期末残高</th><th></th>',
    rows || '<tr><td colspan="11" class="hint">まだ登録がありません。中古車やパソコンを登録すると、耐用年数と月割りを自動で計算します。</td></tr>');
  el('asTbl').querySelectorAll('[data-aedit]').forEach(b => b.onclick = () => editAsset(+b.dataset.aedit));
  el('asTbl').querySelectorAll('[data-adel]').forEach(b => b.onclick = () => delAsset(+b.dataset.adel));
  el('asTbl').querySelectorAll('[data-sched]').forEach(b => b.onclick = () => { schedFor = +b.dataset.sched; renderSchedule(); });

  const tot = S.assets.reduce((s, a) => { const r = assetRow(a); return s + (r ? r.biz : 0); }, 0);
  const totAll = S.assets.reduce((s, a) => { const r = assetRow(a); return s + (r ? r.dep : 0); }, 0);
  const tokurei = S.assets.filter(a => a.method === 'tokurei' && assetRow(a))
                          .reduce((s, a) => s + a.cost, 0);
  let warn = '';
  if (tokurei > 3000000) warn = `<br><b>少額減価償却資産の特例の合計が ${F(tokurei)} 円で、年300万円の上限を超えています。</b>超える分は通常の減価償却にしてください。`;
  msg('asTotal', warn ? 'warn' : 'ok',
    S.assets.length
      ? `${S.year}年分の償却費は合計 ${F(totAll)} 円、うち必要経費に入るのは <b>${F(tot)}</b> 円です。${warn}`
      : '');
  renderSchedule();
  renderDepDetail();
}

function renderSchedule() {
  const a = S.assets.find(x => x.id === schedFor);
  el('asSchedWrap').hidden = !a;
  if (!a) return;
  el('asSchedName').textContent = a.name;
  const rows = schedule({ ...a, years: assetYears(a) }).map(r => `
    <tr${r.year === S.year ? ' class="sub"' : ''}>
      <td class="n">${r.year}年</td><td class="n">${r.months}か月</td>
      <td class="n">${F(r.open)}</td><td class="n">${F(r.dep)}</td>
      <td class="n">${F(r.biz)}</td><td class="n">${F(r.close)}</td>
      <td class="hint">${esc(r.note || '')}</td></tr>`).join('');
  el('asSchedTbl').innerHTML = rowsTable(
    '<th class="n">年</th><th class="n">使用月数</th><th class="n">期首残高</th><th class="n">償却費</th><th class="n">うち必要経費</th><th class="n">期末残高</th><th>摘要</th>',
    rows);
}

/* 決算書の「減価償却費の計算」 */
function renderDepDetail() {
  const live = S.assets.filter(a => assetRow(a));
  el('depCard').hidden = !live.length;
  if (!live.length) return;
  const rows = live.map(a => {
    const r = assetRow(a);
    const y = (a.method === 'teigaku' || a.method === 'teiritsu') ? assetYears(a) : null;
    const rate = y ? (a.method === 'teiritsu' ? TEIRITSU[y].r : TEIGAKU[y]) : null;
    const note = a.method === 'tokurei' ? '措法28の2'
               : a.method === 'ikkatsu' ? '一括償却'
               : (a.used ? '中古・簡便法' : '');
    return `<tr>
      <td>${esc(a.name)}</td><td style="white-space:nowrap">${esc(String(a.acquireDate).slice(0,7))}</td>
      <td class="n">${F(a.cost)}</td><td class="n">${F(r.open)}</td>
      <td>${esc(METHODS[a.method].split('（')[0])}</td>
      <td class="n">${y || '—'}</td><td class="n">${rate ? rate.toFixed(3) : '—'}</td>
      <td class="n">${r.months}/12</td><td class="n">${F(r.dep)}</td>
      <td class="n">${a.bizRatio}%</td><td class="n"><b>${F(r.biz)}</b></td>
      <td class="n">${F(r.close)}</td><td class="hint">${esc(note)}</td></tr>`;
  }).join('');
  const sum = live.reduce((s, a) => s + assetRow(a).biz, 0);
  el('depTbl').innerHTML = rowsTable(
    '<th>資産</th><th>取得年月</th><th class="n">取得価額</th><th class="n">償却の基礎になる金額</th><th>方法</th><th class="n">年数</th><th class="n">償却率</th><th class="n">本年中の月数</th><th class="n">償却費</th><th class="n">事業割合</th><th class="n">必要経費算入額</th><th class="n">期末残高</th><th>摘要</th>',
    rows + `<tr class="total"><td colspan="10">必要経費算入額 合計</td><td class="n">${F(sum)}</td><td colspan="2"></td></tr>`);
}

/* 当年の減価償却仕訳を作る（既存の自動仕訳は作り直す） */
function postDepreciation() {
  const before = S.journal.length;
  S.journal = S.journal.filter(e => !(e.auto && e.auto.startsWith('dep:') && e.date.slice(0, 4) === String(S.year)));
  const removed = before - S.journal.length;
  let made = 0, skipped = [];
  for (const a of S.assets) {
    const r = assetRow(a);
    if (!r || r.dep <= 0) { skipped.push(`${a.name}：${S.year}年分の償却はありません`); continue; }
    const home = r.dep - r.biz;
    const lines = [{ ac: '611', side: 'D', amount: r.biz }];
    if (home > 0) lines.push({ ac: '190', side: 'D', amount: home });
    lines.push({ ac: a.acct, side: 'C', amount: r.dep });
    const e = {
      id: S.seq++, date: `${S.year}-12-31`,
      memo: `減価償却費 ${a.name}` + (a.method === 'tokurei' ? '（措法28の2）' : ''),
      partner: '', lines: lines.filter(l => l.amount > 0), auto: `dep:${a.id}`,
    };
    const v = validateEntry(e, S.year, BY_CODE);
    if (!v.ok) { skipped.push(`${a.name}：${v.errs[0]}`); continue; }
    S.journal.push(e); made++;
  }
  save(); renderAll();
  let m = `${made} 件の減価償却仕訳を12月31日付で作りました。`;
  if (removed) m += `（前に作った ${removed} 件は作り直しています）`;
  if (skipped.length) m += `<ul>${skipped.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  msg('asPostMsg', skipped.length ? 'warn' : 'ok', m);
}

/* ---------------- 起動 ---------------- */
function renderAll() {
  const r = calc();
  renderHealth(r); renderRecent(); renderMonthFilter(); renderJournal();
  renderLedger(); renderAssets(); renderTrial(r); renderStmt(r); renderTax(r);
}
function boot() {
  if (!el('inDate').value) {
    const t = new Date();
    el('inDate').value = (t.getFullYear() === S.year ? t : new Date(S.year, 11, 31)).toISOString().slice(0, 10);
  }
  TAXF.forEach(([id, k]) => el(id).value = S.tax[k] || '');
  lines = blankLines(); renderLines(); renderSetup(); initAssetForm(); renderAll();
}
boot();
