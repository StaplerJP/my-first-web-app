/* depreciation.js — 減価償却の計算
 *
 * 出典（国税庁・令和8年4月1日現在法令等）
 *   No.2100 減価償却のあらまし      https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2100.htm
 *   No.2106 定額法と定率法による減価償却 https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2106.htm
 *   No.5404 中古資産の耐用年数       https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5404.htm
 *   主な減価償却資産の耐用年数表 / 減価償却資産の償却率等表
 */
'use strict';

/* ---- 定額法の償却率（平成19年4月1日以後取得） ---- */
const TEIGAKU = {
  2:0.500, 3:0.334, 4:0.250, 5:0.200, 6:0.167, 7:0.143, 8:0.125, 9:0.112, 10:0.100,
  11:0.091, 12:0.084, 13:0.077, 14:0.072, 15:0.067, 16:0.063, 17:0.059, 18:0.056, 19:0.053, 20:0.050,
  21:0.048, 22:0.046, 23:0.044, 24:0.042, 25:0.040, 26:0.039, 27:0.038, 28:0.036, 29:0.035, 30:0.034,
  31:0.033, 32:0.032, 33:0.031, 34:0.030, 35:0.029, 36:0.028, 37:0.028, 38:0.027, 39:0.026, 40:0.025,
  41:0.025, 42:0.024, 43:0.024, 44:0.023, 45:0.023, 46:0.022, 47:0.022, 48:0.021, 49:0.021, 50:0.020,
};

/* ---- 200%定率法（平成24年4月1日以後取得）: 償却率 / 改定償却率 / 保証率 ---- */
const TEIRITSU = {
  2:{r:1.000, rr:null,  g:null},
  3:{r:0.667, rr:1.000, g:0.11089},  4:{r:0.500, rr:1.000, g:0.12499},
  5:{r:0.400, rr:0.500, g:0.10800},  6:{r:0.333, rr:0.334, g:0.09911},
  7:{r:0.286, rr:0.334, g:0.08680},  8:{r:0.250, rr:0.334, g:0.07909},
  9:{r:0.222, rr:0.250, g:0.07126}, 10:{r:0.200, rr:0.250, g:0.06552},
 11:{r:0.182, rr:0.200, g:0.05992}, 12:{r:0.167, rr:0.200, g:0.05566},
 13:{r:0.154, rr:0.167, g:0.05180}, 14:{r:0.143, rr:0.167, g:0.04854},
 15:{r:0.133, rr:0.143, g:0.04565}, 16:{r:0.125, rr:0.143, g:0.04294},
 17:{r:0.118, rr:0.125, g:0.04038}, 18:{r:0.111, rr:0.112, g:0.03884},
 19:{r:0.105, rr:0.112, g:0.03693}, 20:{r:0.100, rr:0.112, g:0.03486},
 21:{r:0.095, rr:0.100, g:0.03335}, 22:{r:0.091, rr:0.100, g:0.03182},
 23:{r:0.087, rr:0.091, g:0.03052}, 24:{r:0.083, rr:0.084, g:0.02969},
 25:{r:0.080, rr:0.084, g:0.02841}, 26:{r:0.077, rr:0.084, g:0.02716},
 27:{r:0.074, rr:0.077, g:0.02624}, 28:{r:0.071, rr:0.072, g:0.02568},
 29:{r:0.069, rr:0.072, g:0.02463}, 30:{r:0.067, rr:0.072, g:0.02366},
 31:{r:0.065, rr:0.067, g:0.02286}, 32:{r:0.063, rr:0.067, g:0.02216},
 33:{r:0.061, rr:0.063, g:0.02161}, 34:{r:0.059, rr:0.063, g:0.02097},
 35:{r:0.057, rr:0.059, g:0.02051}, 36:{r:0.056, rr:0.059, g:0.01974},
 37:{r:0.054, rr:0.056, g:0.01950}, 38:{r:0.053, rr:0.056, g:0.01882},
 39:{r:0.051, rr:0.053, g:0.01860}, 40:{r:0.050, rr:0.053, g:0.01791},
 41:{r:0.049, rr:0.050, g:0.01741}, 42:{r:0.048, rr:0.050, g:0.01694},
 43:{r:0.047, rr:0.048, g:0.01664}, 44:{r:0.045, rr:0.046, g:0.01664},
 45:{r:0.044, rr:0.046, g:0.01634}, 46:{r:0.043, rr:0.044, g:0.01601},
 47:{r:0.043, rr:0.044, g:0.01532}, 48:{r:0.042, rr:0.044, g:0.01499},
 49:{r:0.041, rr:0.042, g:0.01475}, 50:{r:0.040, rr:0.042, g:0.01440},
};

/* ---- 法定耐用年数のよく使う区分（主な減価償却資産の耐用年数表より） ---- */
const TAIYO_PRESETS = [
  { group:'車両運搬具', acct:'111', items:[
    ['普通自動車（その他のもの）', 6], ['軽自動車（総排気量0.66L以下）', 4],
    ['貨物自動車（ダンプ式以外）', 5], ['貨物自動車（ダンプ式）', 4],
    ['二輪・三輪自動車', 3], ['自転車', 2],
  ]},
  { group:'工具器具備品', acct:'112', items:[
    ['パソコン（サーバー用を除く）', 4], ['サーバー用コンピュータ', 5],
    ['複写機・その他の事務機器', 5], ['ファクシミリ', 5],
    ['カメラ・撮影機器', 5], ['看板・ネオンサイン', 3],
    ['事務机・いす・キャビネット（金属製）', 15], ['事務机・いす・キャビネット（その他）', 8],
    ['応接セット（接客業用以外）', 8], ['電話設備その他の通信機器（その他）', 10],
  ]},
  { group:'建物附属設備', acct:'109', items:[
    ['電気設備（照明設備を含む）', 15], ['蓄電池電源設備', 6], ['店用簡易装備', 3],
  ]},
  { group:'無形固定資産', acct:'116', items:[
    ['ソフトウエア（自社利用）', 5],
  ]},
];

const METHODS = {
  teigaku:  '定額法',
  teiritsu: '定率法（届出が必要）',
  ikkatsu:  '一括償却資産（3年均等）',
  tokurei:  '少額減価償却資産の特例（全額）',
};

/* ---- 日付ユーティリティ ---- */
const yOf = d => Number(String(d).slice(0, 4));
const mOf = d => Number(String(d).slice(5, 7));
function monthsElapsed(fromYM, toYM) {
  if (!fromYM || !toYM) return 0;
  const [fy, fm] = [yOf(fromYM), mOf(fromYM)];
  const [ty, tm] = [yOf(toYM), mOf(toYM)];
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

/* ---- 中古資産の耐用年数（簡便法・No.5404） ----
 * 全部経過: 法定耐用年数 × 20%
 * 一部経過: (法定 − 経過) + 経過 × 20%
 * 1年未満切捨て、2年未満は2年。経過年数は月数で計算する。 */
function chukoYears(legalYears, elapsedMonths) {
  const legalM = legalYears * 12;
  const used = Math.max(0, Math.min(elapsedMonths, legalM * 10));
  const m = used >= legalM ? legalM * 0.2 : (legalM - used) + used * 0.2;
  const y = Math.floor(m / 12);
  return Math.max(2, y);
}

/* ---- 取得価額からの区分の提案 ----
 * 少額減価償却資産の特例の上限は、令和8年4月1日以後の取得で40万円未満
 * （令和8年3月31日までの取得は30万円未満）。青色申告者・年300万円まで。No.2100 注3 */
function tokureiLimit(acquireDate) {
  return String(acquireDate) >= '2026-04-01' ? 400000 : 300000;
}
function suggest(cost, acquireDate, aoiro) {
  const lim = tokureiLimit(acquireDate);
  if (cost < 100000) {
    return { method:'tokurei', label:'10万円未満',
      note:'取得価額が10万円未満なので、全額その年の必要経費です。台帳に載せず消耗品費で処理して構いません。' };
  }
  if (aoiro && cost < lim) {
    const alt = cost < 200000 ? '一括償却資産（3年均等）も選べます。' : '';
    return { method:'tokurei', label:`少額減価償却資産の特例（${lim/10000}万円未満）`,
      note:`青色申告者なので、取得価額の全額をこの年の必要経費にできます（年300万円まで）。月割はありません。${alt}` };
  }
  if (cost < 200000) {
    return { method:'ikkatsu', label:'一括償却資産',
      note:'取得価額が20万円未満なので、3年間で均等に必要経費にできます。月割はありません。' };
  }
  return { method:'teigaku', label:'通常の減価償却',
    note:`取得価額が${(lim/10000)}万円以上なので、耐用年数にわたって償却します。個人の法定償却方法は定額法です。` };
}

/* ---- 償却スケジュール ----
 * a = { startDate, cost, method, years, bizRatio }
 * 年の中途で業務供用した場合は、計算した償却費に 月数/12 を乗じる（所令132）。 */
function schedule(a) {
  const cost = Math.max(0, Math.round(a.cost || 0));
  const pct = Math.min(100, Math.max(0, Number(a.bizRatio ?? 100)));
  const sy = yOf(a.startDate), sm = mOf(a.startDate);
  const rows = [];
  // 先に掛けてから割る。割合を先に小数にすると 168750*0.7 が 118124.999… になり1円ずれる。
  const biz = d => Math.floor(d * pct / 100);
  if (!cost || !sy) return rows;

  if (a.method === 'tokurei') {
    rows.push({ year:sy, open:cost, dep:cost, close:0, biz:biz(cost), months:12, note:'措法28の2（全額）' });
    return rows;
  }
  if (a.method === 'ikkatsu') {
    const each = Math.floor(cost / 3);
    let open = cost;
    for (let i = 0; i < 3; i++) {
      const dep = i < 2 ? each : open;
      rows.push({ year:sy + i, open, dep, close:open - dep, biz:biz(dep), months:12, note:'一括償却（3年均等）' });
      open -= dep;
    }
    return rows;
  }

  const n = Math.max(2, Math.min(50, Math.round(a.years || 2)));
  const isTR = a.method === 'teiritsu';
  const t = TEIRITSU[n];
  const guarantee = isTR && t.g ? Math.floor(cost * t.g) : 0;
  let open = cost, switched = false, revisedBase = 0;

  for (let y = sy; y < sy + n + 3 && open > 1; y++) {
    const months = y === sy ? (13 - sm) : 12;
    let full, note = '';
    if (isTR) {
      const adjusted = Math.floor(open * t.r);
      if (!switched && t.rr && adjusted < guarantee) { switched = true; revisedBase = open; }
      full = switched ? Math.floor(revisedBase * t.rr) : adjusted;
      if (switched) note = '改定償却率';
    } else {
      full = Math.floor(cost * TEIGAKU[n]);
    }
    let dep = Math.floor(full * months / 12);
    if (dep < 0) dep = 0;
    if (open - dep < 1) { dep = open - 1; note = note ? note + '・1円まで' : '1円を残して終了'; }
    rows.push({ year:y, open, dep, close:open - dep, biz:biz(dep), months, note });
    open -= dep;
  }
  return rows;
}

function yearRow(a, year) {
  return schedule(a).find(r => r.year === year) || null;
}

/* 資産の耐用年数を決める（中古なら簡便法） */
function resolveYears(a) {
  if (a.yearsManual) return Math.max(2, Math.round(a.yearsManual));
  const legal = Math.max(2, Math.round(a.legalYears || 6));
  if (!a.used) return legal;
  const em = monthsElapsed(a.firstRegYM, String(a.acquireDate).slice(0, 7));
  return chukoYears(legal, em);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TEIGAKU, TEIRITSU, TAIYO_PRESETS, METHODS,
    chukoYears, monthsElapsed, suggest, tokureiLimit, schedule, yearRow, resolveYears };
}
