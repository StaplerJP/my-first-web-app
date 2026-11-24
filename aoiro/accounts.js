/* accounts.js — 勘定科目マスタ（青色申告決算書の様式に対応）
 * side: 'D' = 借方が増加（資産・費用）, 'C' = 貸方が増加（負債・資本・収益）
 * stmt: 'BS'（貸借対照表）または 'PL'（損益計算書）
 * row : 青色申告決算書上の区分
 */
'use strict';

const ACCOUNTS = [
  // ---- 資産 ----
  { code:'101', name:'現金',            side:'D', stmt:'BS', row:'asset' },
  { code:'102', name:'普通預金',        side:'D', stmt:'BS', row:'asset' },
  { code:'103', name:'定期預金',        side:'D', stmt:'BS', row:'asset' },
  { code:'104', name:'売掛金',          side:'D', stmt:'BS', row:'asset' },
  { code:'105', name:'棚卸資産',        side:'D', stmt:'BS', row:'asset' },
  { code:'106', name:'前払金',          side:'D', stmt:'BS', row:'asset' },
  { code:'107', name:'貸付金',          side:'D', stmt:'BS', row:'asset' },
  { code:'108', name:'建物',            side:'D', stmt:'BS', row:'asset' },
  { code:'109', name:'建物附属設備',    side:'D', stmt:'BS', row:'asset' },
  { code:'110', name:'機械装置',        side:'D', stmt:'BS', row:'asset' },
  { code:'111', name:'車両運搬具',      side:'D', stmt:'BS', row:'asset' },
  { code:'112', name:'工具器具備品',    side:'D', stmt:'BS', row:'asset' },
  { code:'113', name:'一括償却資産',    side:'D', stmt:'BS', row:'asset' },
  { code:'114', name:'土地',            side:'D', stmt:'BS', row:'asset' },
  { code:'115', name:'敷金・保証金',    side:'D', stmt:'BS', row:'asset' },
  { code:'116', name:'ソフトウエア',    side:'D', stmt:'BS', row:'asset' },
  { code:'190', name:'事業主貸',        side:'D', stmt:'BS', row:'asset' },

  // ---- 負債 ----
  { code:'201', name:'買掛金',          side:'C', stmt:'BS', row:'liability' },
  { code:'202', name:'未払金',          side:'C', stmt:'BS', row:'liability' },
  { code:'203', name:'未払費用',        side:'C', stmt:'BS', row:'liability' },
  { code:'204', name:'前受金',          side:'C', stmt:'BS', row:'liability' },
  { code:'205', name:'預り金',          side:'C', stmt:'BS', row:'liability' },
  { code:'206', name:'借入金',          side:'C', stmt:'BS', row:'liability' },
  { code:'207', name:'未払消費税等',    side:'C', stmt:'BS', row:'liability' },
  { code:'208', name:'貸倒引当金',      side:'C', stmt:'BS', row:'liability' },
  { code:'290', name:'事業主借',        side:'C', stmt:'BS', row:'liability' },

  // ---- 資本 ----
  { code:'301', name:'元入金',          side:'C', stmt:'BS', row:'equity' },

  // ---- 収益 ----
  { code:'401', name:'売上',            side:'C', stmt:'PL', row:'sales' },
  { code:'402', name:'家事消費等',      side:'C', stmt:'PL', row:'sales' },
  { code:'403', name:'雑収入',          side:'C', stmt:'PL', row:'other_income' },

  // ---- 売上原価 ----
  { code:'501', name:'期首商品棚卸高',  side:'D', stmt:'PL', row:'cogs_open' },
  { code:'502', name:'仕入',            side:'D', stmt:'PL', row:'cogs_purchase' },
  { code:'503', name:'期末商品棚卸高',  side:'C', stmt:'PL', row:'cogs_close' },

  // ---- 経費（決算書の経費欄の順） ----
  { code:'601', name:'租税公課',        side:'D', stmt:'PL', row:'expense' },
  { code:'602', name:'荷造運賃',        side:'D', stmt:'PL', row:'expense' },
  { code:'603', name:'水道光熱費',      side:'D', stmt:'PL', row:'expense' },
  { code:'604', name:'旅費交通費',      side:'D', stmt:'PL', row:'expense' },
  { code:'605', name:'通信費',          side:'D', stmt:'PL', row:'expense' },
  { code:'606', name:'広告宣伝費',      side:'D', stmt:'PL', row:'expense' },
  { code:'607', name:'接待交際費',      side:'D', stmt:'PL', row:'expense' },
  { code:'608', name:'損害保険料',      side:'D', stmt:'PL', row:'expense' },
  { code:'609', name:'修繕費',          side:'D', stmt:'PL', row:'expense' },
  { code:'610', name:'消耗品費',        side:'D', stmt:'PL', row:'expense' },
  { code:'611', name:'減価償却費',      side:'D', stmt:'PL', row:'expense' },
  { code:'612', name:'福利厚生費',      side:'D', stmt:'PL', row:'expense' },
  { code:'613', name:'給料賃金',        side:'D', stmt:'PL', row:'expense' },
  { code:'614', name:'外注工賃',        side:'D', stmt:'PL', row:'expense' },
  { code:'615', name:'利子割引料',      side:'D', stmt:'PL', row:'expense' },
  { code:'616', name:'地代家賃',        side:'D', stmt:'PL', row:'expense' },
  { code:'617', name:'貸倒金',          side:'D', stmt:'PL', row:'expense' },
  { code:'618', name:'支払手数料',      side:'D', stmt:'PL', row:'expense' },
  { code:'619', name:'研修費',          side:'D', stmt:'PL', row:'expense' },
  { code:'620', name:'新聞図書費',      side:'D', stmt:'PL', row:'expense' },
  { code:'621', name:'車両費',          side:'D', stmt:'PL', row:'expense' },
  { code:'631', name:'雑費',            side:'D', stmt:'PL', row:'expense' },

  // ---- 専従者給与・引当金 ----
  { code:'701', name:'専従者給与',      side:'D', stmt:'PL', row:'senju' },
  { code:'702', name:'貸倒引当金繰入',  side:'D', stmt:'PL', row:'hikiate_in' },
  { code:'703', name:'貸倒引当金戻入',  side:'C', stmt:'PL', row:'hikiate_out' },
];

const BY_CODE = Object.fromEntries(ACCOUNTS.map(a => [a.code, a]));
const BY_NAME = Object.fromEntries(ACCOUNTS.map(a => [a.name, a]));

/* 家事按分でよく使う科目（UIでヒントを出す用） */
const ANBUN_HINTS = ['603','605','616','621','608'];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ACCOUNTS, BY_CODE, BY_NAME, ANBUN_HINTS };
}
