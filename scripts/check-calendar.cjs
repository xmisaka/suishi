/**
 * 岁时 · 历法与周期规则的边界校验
 *
 * 为什么要有这么一份东西：农历换算与「下一次是哪天」这两件事，
 * 出错时**不会报错**，只会安静地算出一个错误的日子。用户在若干年后
 * 才发现某条纪念日偏了一天 —— 那时候已经无从追查。
 *
 * 所以这里把八种「历法 × 周期」组合的边界逐条断言。
 * 用法（先编译成 commonjs 再跑，TS 不能直接被 node 执行）：
 *
 *   node_modules/.bin/tsc -p scripts/tsconfig.caltest.json
 *   node scripts/check-calendar.cjs
 *
 * 事实基准（可独立核对）：
 *   2024 春节 2024-02-10 ｜ 2025 春节 2025-01-29 ｜ 2026 春节 2026-02-17 ｜ 2027 春节 2027-02-06
 *   2026 中秋（八月十五）2026-09-25
 *   2025 年闰六月
 *   2026-09-23 是星期三
 */

const path = require('path');

const OUT = path.join(__dirname, '..', '.workbuddy', 'tmp', 'caltest');

const calendar = require(path.join(OUT, 'calendar', 'lunar.js'));
const { resolveOccurrence, dialWorthy } = require(path.join(OUT, 'calendar', 'resolve.js'));
const D = require(path.join(OUT, 'date.js'));

/* ------------------------------------------------------------ 断言框架 */

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
  } else {
    failures.push(`${label}\n      期望 ${e}\n      实际 ${a}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 46 - title.length))}`);
}

/* ------------------------------------------------------------ 夹具 */

function ev(over) {
  return Object.assign(
    {
      id: 't',
      name: '测试',
      calendar: 'solar',
      repeat: 'yearly',
      year: null,
      month: 1,
      day: 1,
      leap: false,
      weekday: null,
      tone: 'brand',
      pinned: false,
      note: null,
      remindDays: null,
      sortOrder: null,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    },
    over,
  );
}

const P = (y, m, d) => ({ y, m, d });
const iso = (p) => (p ? D.formatISO(p) : null);

/** 跑一条解析并压成便于断言的三元组 */
function run(e, today) {
  const o = resolveOccurrence(e, today);
  if (!o) return null;
  return { date: iso(o.date), days: o.days, ordinal: o.ordinal, expired: o.expired, lunar: o.lunar };
}

/* ============================================================ 一 · 基础历法 */

section('公历基础');
check('2026 是平年', D.isLeapYear(2026), false);
check('2024 是闰年', D.isLeapYear(2024), true);
check('2000 是闰年（百年例外）', D.isLeapYear(2000), true);
check('1900 不是闰年', D.isLeapYear(1900), false);
check('2026-02 有 28 天', D.daysInMonth(2026, 2), 28);
check('2024-02 有 29 天', D.daysInMonth(2024, 2), 29);
check('2026-09-23 是周三', D.weekdayOf(P(2026, 9, 23)), 3);
check('跨年天数 2026-12-31 → 2027-01-01', D.diffDays(P(2026, 12, 31), P(2027, 1, 1)), 1);
check('序数往返', iso(D.fromSerial(D.toSerial(P(2027, 3, 1)))), '2027-03-01');

section('农历换算（对照已知事实）');
check('2026 正月初一 = 2026-02-17', iso(calendar.lunarToSolar({ y: 2026, m: 1, d: 1, leap: false }).date), '2026-02-17');
check('2026 八月十五 = 2026-09-25', iso(calendar.lunarToSolar({ y: 2026, m: 8, d: 15, leap: false }).date), '2026-09-25');
check('2027 正月初一 = 2027-02-06', iso(calendar.lunarToSolar({ y: 2027, m: 1, d: 1, leap: false }).date), '2027-02-06');
check('2026-09-25 反查为八月十五', calendar.solarToLunar(P(2026, 9, 25)), { y: 2026, m: 8, d: 15, leap: false });
check('2026-02-17 反查为正月初一', calendar.solarToLunar(P(2026, 2, 17)), { y: 2026, m: 1, d: 1, leap: false });
check('2025 年闰六月', calendar.leapMonthOf(2025), 6);
check('2026 年无闰月', calendar.leapMonthOf(2026), 0);
check('干支年可读', typeof calendar.lunarYearGanZhi(2026), 'string');
check('生肖可读', typeof calendar.lunarZodiac(2026), 'string');

/* ============================================================ 二 · 八种组合 */

section('公历 · 一次性');
const xmas = run(ev({ repeat: 'once', year: 2026, month: 12, day: 25 }), P(2026, 9, 23));
check('未到的日子 · 落在哪天', xmas.date, '2026-12-25');
check('未到的日子 · 距今 93 天', xmas.days, 93);
check('未到的日子 · 未过期', xmas.expired, false);
check('未到的日子 · 反查出农历年', xmas.lunar.y, 2026);
check(
  '已过的日子标记过期',
  run(ev({ repeat: 'once', year: 2026, month: 1, day: 1 }), P(2026, 9, 23)).expired,
  true,
);
check('缺年份则无解', run(ev({ repeat: 'once', year: null }), P(2026, 9, 23)), null);

section('公历 · 每年');
const todayItself = run(ev({ repeat: 'yearly', month: 9, day: 23 }), P(2026, 9, 23));
check('今天就是它', todayItself.date, '2026-09-23');
check('今天就是它 · 差距为 0', todayItself.days, 0);
check('今天就是它 · 反查八月十三', todayItself.lunar, { y: 2026, m: 8, d: 13, leap: false });
check('已过今年的 → 明年', run(ev({ repeat: 'yearly', month: 1, day: 1 }), P(2026, 9, 23)).date, '2027-01-01');
check('跨年只差一天', run(ev({ repeat: 'yearly', month: 1, day: 1 }), P(2026, 12, 31)).days, 1);
check(
  '★ 2/29 在平年钳到 2/28',
  run(ev({ repeat: 'yearly', month: 2, day: 29 }), P(2027, 1, 1)).date,
  '2027-02-28',
);
check(
  '★ 2/29 在闰年仍是 2/29',
  run(ev({ repeat: 'yearly', month: 2, day: 29 }), P(2028, 1, 1)).date,
  '2028-02-29',
);
// 今天 2026-09-23 时，2015-05-01 的今年落点已过 → 下一次是 2027-05-01，
// 周年数按**落点年份**减起始年份：2027 − 2015 = 12。
// 这一条特意不取 11：11 是「去年那次」的编号，与界面上并排显示的日期对不上。
check('周年数按落点年份算', run(ev({ repeat: 'yearly', year: 2015, month: 5, day: 1 }), P(2026, 9, 23)).ordinal, 12);
check('不限年份则无周年数', run(ev({ repeat: 'yearly', year: null, month: 5, day: 1 }), P(2026, 9, 23)).ordinal, null);

section('公历 · 每月');
check(
  '★ 31 日在 9 月钳到 30 日',
  run(ev({ repeat: 'monthly', day: 31 }), P(2026, 9, 1)).date,
  '2026-09-30',
);
check('当天即今天', run(ev({ repeat: 'monthly', day: 30 }), P(2026, 9, 30)).days, 0);
check('过了这个月 → 下个月', run(ev({ repeat: 'monthly', day: 31 }), P(2026, 10, 1)).date, '2026-10-31');
check(
  '★ 31 日在 2 月钳到月末',
  run(ev({ repeat: 'monthly', day: 31 }), P(2027, 2, 1)).date,
  '2027-02-28',
);
check('跨年推进', run(ev({ repeat: 'monthly', day: 5 }), P(2026, 12, 20)).date, '2027-01-05');

section('公历 · 每周');
check('今天就是这一天', run(ev({ repeat: 'weekly', weekday: 3 }), P(2026, 9, 23)).days, 0);
const friday = run(ev({ repeat: 'weekly', weekday: 5 }), P(2026, 9, 23));
check('本周内往后 · 日期', friday.date, '2026-09-25');
check('本周内往后 · 两天后', friday.days, 2);
check('刚过的 → 下周同一天', run(ev({ repeat: 'weekly', weekday: 2 }), P(2026, 9, 23)).days, 6);
check('周日（7）也能算', run(ev({ repeat: 'weekly', weekday: 7 }), P(2026, 9, 23)).date, '2026-09-27');

section('农历 · 一次性');
const midAutumnOnce = run(
  ev({ calendar: 'lunar', repeat: 'once', year: 2026, month: 8, day: 15 }),
  P(2026, 9, 23),
);
check('未到的农历日 · 落在中秋', midAutumnOnce.date, '2026-09-25');
check('未到的农历日 · 两天后', midAutumnOnce.days, 2);
check('未到的农历日 · 农历值如实', midAutumnOnce.lunar, { y: 2026, m: 8, d: 15, leap: false });
check(
  '已过的农历日',
  run(ev({ calendar: 'lunar', repeat: 'once', year: 2026, month: 1, day: 1 }), P(2026, 9, 23)).expired,
  true,
);

section('农历 · 每年');
check(
  '★ 今年中秋还没到',
  run(ev({ calendar: 'lunar', repeat: 'yearly', month: 8, day: 15 }), P(2026, 9, 23)).date,
  '2026-09-25',
);
check(
  '★ 今年中秋已过 → 明年',
  run(ev({ calendar: 'lunar', repeat: 'yearly', month: 8, day: 15 }), P(2026, 9, 26)).date,
  '2027-09-15',
);
check(
  '★ 腊月中的条目跨农历年找正月初一',
  run(ev({ calendar: 'lunar', repeat: 'yearly', month: 1, day: 1 }), P(2026, 12, 31)).date,
  '2027-02-06',
);
check(
  '★ 闰月缺失时退回平月，且 lunar 如实回传',
  run(ev({ calendar: 'lunar', repeat: 'yearly', month: 6, day: 15, leap: true }), P(2026, 1, 1)).lunar,
  { y: 2026, m: 6, d: 15, leap: false },
);
check(
  '★ 有闰月的那年走闰月',
  run(ev({ calendar: 'lunar', repeat: 'yearly', month: 6, day: 15, leap: true }), P(2025, 1, 1)).lunar.leap,
  true,
);
check(
  '★ 腊月三十遇小月落廿九',
  run(ev({ calendar: 'lunar', repeat: 'yearly', month: 12, day: 30 }), P(2026, 1, 1)).lunar.d <= 30,
  true,
);
check(
  '农历每年的周年数按农历年算',
  run(ev({ calendar: 'lunar', repeat: 'yearly', year: 2015, month: 8, day: 15 }), P(2026, 9, 23)).ordinal,
  11,
);

section('农历 · 每月');
const lunarMonthly = ev({ calendar: 'lunar', repeat: 'monthly', day: 1 });
check('农历每月能算出下一次', run(lunarMonthly, P(2026, 9, 23)) !== null, true);
check('农历每月落点就是农历初一', run(lunarMonthly, P(2026, 9, 23)).lunar.d, 1);

// 逐月往前推一年，看月份序列里有没有闰六月。
// 这是验证「农历按月」实现得对不对的唯一硬办法：闰月不是月号 +1 能推出来的，
// 只有真的走了真实月份序列，闰六月才会出现在这串结果里。
let cursor = P(2025, 1, 1);
const seenMonths = new Set();
for (let i = 0; i < 16; i += 1) {
  const o = resolveOccurrence(lunarMonthly, cursor);
  if (!o) break;
  seenMonths.add(`${o.lunar.m}${o.lunar.leap ? 'L' : ''}`);
  cursor = D.addDays(o.date, 1);
}
check('★ 逐月推进能走到闰六月（2025）', seenMonths.has('6L'), true);
check('★ 一年里走过 12 个平月 + 1 个闰月', seenMonths.size, 13);

section('农历 · 每周（不存在）');
check('无解，返回 null', run(ev({ calendar: 'lunar', repeat: 'weekly', weekday: 3 }), P(2026, 9, 23)), null);

/* ============================================================ 三 · 盘上过滤 */

section('圆盘过滤');
const today = P(2026, 9, 23);
const list = [
  resolveOccurrence(ev({ repeat: 'once', year: 2025, month: 1, day: 1 }), today),
  resolveOccurrence(ev({ repeat: 'once', year: 2028, month: 1, day: 1 }), today),
  resolveOccurrence(ev({ repeat: 'yearly', month: 9, day: 23 }), today),
].filter(Boolean);
check('过期的不上盘', dialWorthy(list).length, 1);
check('一年之外的不上盘', dialWorthy(list).some((o) => o.days > 366), false);

/* ============================================================ 四 · 二分二至 */

/*
 * 星盘上那四道分至点刻靠 nextSolarTerms 定位。这个函数有两个容易静默错的地方：
 *
 *   1. 节气表以**冬至**为年头，只翻一张表会漏掉冬至
 *      （今天在 9 月时，当年的冬至落在下一张表里；今天在 12 月下旬时，
 *        当年的冬至已过去、而它压根不在任何一张「今年」的表里）
 *   2. 表里同名节气出现两次，拼音键那次很容易被误当成中文键那次
 *
 * 都是「不报错、只是位置偏几十度」的错误，肉眼在盘上分辨不出来，所以逐条断言。
 *
 * 事实基准（可独立核对，均为北京时间）：
 *   2026 春分 03-20 ｜ 夏至 06-21 ｜ 秋分 09-23 ｜ 冬至 12-22
 *   2027 春分 03-21 ｜ 夏至 06-21 ｜ 秋分 09-23 ｜ 冬至 12-22
 */
section('二分二至');

const terms = (d, win) =>
  calendar.nextSolarTerms(d, win === undefined ? 366 : win).map((t) => `${t.name}:${t.days}`);

check('秋分当天 · 四个分至点', terms(P(2026, 9, 23)), [
  '秋分:0',
  '冬至:90',
  '春分:179',
  '夏至:271',
]);

// 这条是第 1 个坑的守门断言：12-22 的冬至已过去，答案必须是次年 12-22（300 天）
check('冬至刚过 · 不能取回当年那个', terms(P(2026, 12, 25)), [
  '春分:86',
  '夏至:178',
  '秋分:272',
  '冬至:362',
]);

check('年初 · 四个都在今年', terms(P(2026, 1, 15)), ['春分:64', '夏至:157', '秋分:251', '冬至:341']);

check('春分当天 · days 取 0 而非负', terms(P(2026, 3, 20)), [
  '春分:0',
  '夏至:93',
  '秋分:187',
  '冬至:277',
]);

check('窗口收窄到 80 天 · 只剩秋分', terms(P(2026, 9, 23), 80), ['秋分:0']);

const midsummer = calendar.nextSolarTerms(P(2026, 6, 30), 366);
check('任意一天恒得四个（366 天窗口必含一轮分至）', midsummer.length, 4);
check(
  '按天数升序',
  midsummer.map((t) => t.days),
  [...midsummer.map((t) => t.days)].sort((a, b) => a - b),
);

/* ============================================================ 汇总 */

console.log(`\n${'='.repeat(54)}`);
if (failures.length === 0) {
  console.log(`全部通过：${passed} 项断言`);
  process.exit(0);
} else {
  console.log(`通过 ${passed} 项，失败 ${failures.length} 项：\n`);
  for (const f of failures) console.log(`  ✗ ${f}\n`);
  process.exit(1);
}
