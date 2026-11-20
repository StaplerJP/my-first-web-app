/* tax.js — 令和8年分（2026年分）所得税の計算ロジック
 *
 * 数値の出典（すべて国税庁タックスアンサー・令和8年4月1日現在法令等）
 *   基礎控除            No.1199  https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm
 *   給与所得控除        No.1410  https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm
 *   青色申告特別控除    No.2072  https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm
 *   所得税の税率        No.2260  https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm
 *
 * 注意: 令和8年分の基礎控除・給与所得控除は令和8年度税制改正によるもので、
 *       令和8年12月1日に施行されます（No.1199 注1 / No.1410 注1）。
 */
'use strict';

const TAX_YEAR = 2026;          // 令和8年分
const TAX_YEAR_JP = '令和8年分';
const FILING_OPEN  = '2027-02-16';
const FILING_DUE   = '2027-03-15';

/* ---------- 給与所得控除（令和8年分・令和9年分） ---------- */
/* No.1410 の表。収入金額に応じた控除額。 */
function kyuyoShotokuKojo(income) {
  const i = Math.floor(income);
  if (i <= 2200000) return 740000;
  if (i <= 3600000) return Math.floor(i * 0.30) + 80000;
  if (i <= 6600000) return Math.floor(i * 0.20) + 440000;
  if (i <= 8500000) return Math.floor(i * 0.10) + 1100000;
  return 1950000;
}

/* 給与所得の金額。
 * No.1410 注2: 収入が69万1,000円以上220万円未満のときは専用の表で求める。
 * No.1410 注3: 収入が660万円未満のときは本来「所得税法別表第五」で求めるため、
 *              下の計算は概算（最大数千円のずれが出ることがある）。
 */
function kyuyoShotoku(income) {
  const i = Math.floor(income);
  if (i < 691000) return 0;
  if (i < 741000) return 0;
  if (i < 2191000) return i - 740000;
  if (i < 2193000) return 1451000;
  if (i < 2196000) return 1453000;
  if (i < 2200000) return 1456000;
  return Math.max(0, i - kyuyoShotokuKojo(i));
}

/* 660万円未満は別表第五によるため概算であることを示すフラグ */
function kyuyoShotokuIsApprox(income) {
  const i = Math.floor(income);
  return i >= 2200000 && i < 6600000;
}

/* ---------- 基礎控除（令和8年分） ---------- */
/* No.1199 の「令和8年分・令和9年分以後」列。合計所得金額に応じる。 */
function kisoKojo(goukeiShotoku) {
  const t = Math.floor(goukeiShotoku);
  if (t <=  4890000) return 1040000;
  if (t <=  6550000) return  670000;
  if (t <= 23500000) return  620000;
  if (t <= 24000000) return  480000;
  if (t <= 24500000) return  320000;
  if (t <= 25000000) return  160000;
  return 0;
}

/* ---------- 所得税の速算表 ---------- */
/* No.2260。課税される所得金額（1,000円未満切捨て後）に適用。 */
const SOKUSAN = [
  { upTo:  1949000, rate: 0.05, deduct:       0 },
  { upTo:  3299000, rate: 0.10, deduct:   97500 },
  { upTo:  6949000, rate: 0.20, deduct:  427500 },
  { upTo:  8999000, rate: 0.23, deduct:  636000 },
  { upTo: 17999000, rate: 0.33, deduct: 1536000 },
  { upTo: 39999000, rate: 0.40, deduct: 2796000 },
  { upTo: Infinity, rate: 0.45, deduct: 4796000 },
];

function shotokuzei(kazeiShotoku) {
  const base = Math.floor(Math.max(0, kazeiShotoku) / 1000) * 1000; // 1,000円未満切捨て
  if (base < 1000) return { base, rate: 0, deduct: 0, tax: 0 };
  const b = SOKUSAN.find(r => base <= r.upTo);
  return { base, rate: b.rate, deduct: b.deduct, tax: Math.floor(base * b.rate - b.deduct) };
}

/* ---------- 青色申告特別控除（No.2072） ---------- */
/* 65万円: 複式簿記 + (e-Tax送信 または 優良な電子帳簿保存+届出書) + 期限内申告
 * 55万円: 複式簿記 + 期限内申告（書面提出）
 * 10万円: 上記要件を満たさない青色申告者
 * いずれも控除額は「損益通算前の黒字の事業所得等の合計額」が上限。 */
function aoiroKojo(kubun, jigyoShotokuBeforeKojo) {
  const cap = Math.max(0, Math.floor(jigyoShotokuBeforeKojo));
  const want = ({ '65': 650000, '55': 550000, '10': 100000 })[String(kubun)] ?? 650000;
  return Math.min(want, cap);
}

/* ---------- 全体の税額計算 ---------- */
/* p = {
 *   kyuyoShunyu, gensenZeigaku,            // 給与の収入金額・源泉徴収税額
 *   jigyoShotokuBeforeAoiro,               // 青色申告特別控除前の事業所得
 *   aoiroKubun,                            // '65' | '55' | '10'
 *   shakaiHoken, seimeiHoken, iDeCo,       // 所得控除（社会保険料など）
 *   iryohi, kifukin, otherKojo,
 *   yoteiNozei                             // 予定納税額
 * } */
function calcTax(p) {
  const kyuyoShunyu = Math.max(0, Math.floor(p.kyuyoShunyu || 0));
  const kyuyo = kyuyoShotoku(kyuyoShunyu);

  const jigyoBefore = Math.floor(p.jigyoShotokuBeforeAoiro || 0);
  const aoiro = jigyoBefore > 0 ? aoiroKojo(p.aoiroKubun, jigyoBefore) : 0;
  const jigyo = jigyoBefore - aoiro;

  const goukei = kyuyo + jigyo;                  // 合計所得金額（損益通算後）
  const kiso = kisoKojo(goukei);

  const kojoList = [
    { label: '社会保険料控除',   value: Math.max(0, Math.floor(p.shakaiHoken || 0)) },
    { label: '小規模企業共済等掛金控除（iDeCo等）', value: Math.max(0, Math.floor(p.iDeCo || 0)) },
    { label: '生命保険料控除',   value: Math.max(0, Math.floor(p.seimeiHoken || 0)) },
    { label: '医療費控除',       value: Math.max(0, Math.floor(p.iryohi || 0)) },
    { label: '寄附金控除',       value: Math.max(0, Math.floor(p.kifukin || 0)) },
    { label: 'その他の所得控除', value: Math.max(0, Math.floor(p.otherKojo || 0)) },
    { label: '基礎控除',         value: kiso },
  ];
  const kojoGoukei = kojoList.reduce((s, k) => s + k.value, 0);

  const kazei = Math.max(0, goukei - kojoGoukei);
  const z = shotokuzei(kazei);
  const kijun = z.tax;                                       // 基準所得税額（税額控除なし前提）
  const fukko = Math.floor(kijun * 0.021);                   // 復興特別所得税 2.1%
  const goukeiZei = Math.floor((kijun + fukko) / 100) * 100;  // 100円未満切捨て

  const gensen = Math.max(0, Math.floor(p.gensenZeigaku || 0));
  const yotei  = Math.max(0, Math.floor(p.yoteiNozei || 0));
  const nofu   = goukeiZei - gensen - yotei;

  /* 住民税の概算（所得割10% + 均等割5,000円）。
     住民税の基礎控除・各控除は所得税と異なるため、あくまで目安。 */
  const juminKazei = Math.max(0, goukei - (kojoGoukei - kiso) - 430000);
  const jumin = juminKazei > 0 ? Math.floor(juminKazei * 0.10) + 5000 : 0;

  return {
    kyuyoShunyu, kyuyo, kyuyoKojo: kyuyoShotokuKojo(kyuyoShunyu),
    kyuyoApprox: kyuyoShotokuIsApprox(kyuyoShunyu),
    jigyoBefore, aoiro, jigyo,
    goukei, kiso, kojoList, kojoGoukei,
    kazei: z.base, rate: z.rate, sokusanDeduct: z.deduct,
    kijun, fukko, goukeiZei, gensen, yotei,
    nofu, kampu: nofu < 0 ? -nofu : 0,
    jumin,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TAX_YEAR, TAX_YEAR_JP, FILING_OPEN, FILING_DUE,
    kyuyoShotokuKojo, kyuyoShotoku, kyuyoShotokuIsApprox, kisoKojo,
    shotokuzei, aoiroKojo, calcTax, SOKUSAN };
}
