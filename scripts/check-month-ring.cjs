/**
 * 岁时 · 月轮的几何边界校验
 *
 * 为什么要有这么一份东西：月轮的数字是**按段序号推月份**的
 * （第 j 段 = 第 (当月 + j) 个月），这条等式只在「本月 1 号被 days >= 0 滤掉、
 * 而 bandSegments 补的 0° 端点顶上本月起点」时才成立。
 * 一旦哪天有人动了 monthTicks 的循环上界、或给 bandSegments 换一套端点补齐规则，
 * 月轮**不会报错**，只会安静地整体错一个月 —— 或者少画一枚、多画一枚。
 *
 * 所以这里把「任何一个起始日都不许出错」逐条断言，而不是只看今天。
 *
 * 用法（先编译成 commonjs 再跑，TS 不能直接被 node 执行）：
 *
 *   node_modules/.bin/tsc -p scripts/tsconfig.caltest.json
 *   node scripts/check-month-ring.cjs
 *
 * 事实基准：公历一年 12 个月；2026-09-23 是星期三。
 */

const path = require('path');

const OUT = path.join(__dirname, '..', '.workbuddy', 'tmp', 'caltest');
const dial = require(path.join(OUT, 'dial.js'));

const HORIZON = 366;
/** 盘面最小边长（index.tsx 里 dialSize = min(屏宽 − 2·GUTTER, 340)，
 *  最窄的机型大约落在 326）—— 相邻月号的弦距按它算，最保守 */
const MIN_SIZE = 326;
/** 最窄盘面上月轮的半径，与组件同式：size/2 − 24（外环内收）− MONTH_LABEL_INSET */
const MARK_R = MIN_SIZE / 2 - 24 - dial.MONTH_LABEL_INSET;

/* ------------------------------------------------------------ 断言框架 */

let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${label}\n      ${detail}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 46 - title.length))}`);
}

/* ------------------------------------------------------------ 遍历日期 */

const MS = 86_400_000;
const FROM = Date.UTC(2026, 0, 1);
const DAYS = 730; // 跨两个整年，闰年与月末都盖到

let minGap = Number.POSITIVE_INFINITY;
let minGapAt = '';
let maxGap = 0;
let maxGapAt = '';
let minChord = Number.POSITIVE_INFINITY;

let badCount = 0;
let badLabel = 0;
let badOrder = 0;
let badRange = 0;

/** 把序号（1970-01-01 起的第 n 天）拆回 {y, m, d}，只借 UTC 做一次换算 */
function partsOf(ordinal) {
  const dt = new Date(ordinal * MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

for (let k = 0; k < DAYS; k += 1) {
  const today = partsOf(FROM / MS + k);
  const ticks = dial.monthTicks(today, HORIZON);
  const bands = dial.bandSegments(ticks);
  const marks = dial.monthMarks(bands, today.m);
  const stamp = `${today.y}-${String(today.m).padStart(2, '0')}-${String(today.d).padStart(2, '0')}`;

  // 一、段数恒为 12 —— 月轮也就恒为 12 枚（不含当月那半段时曾出现过 11 段）
  if (bands.length !== 12 || marks.length !== 12) {
    badCount += 1;
    if (badCount <= 3) failures.push(`${stamp}：段 ${bands.length} / 月号 ${marks.length}，应为 12 / 12`);
    continue;
  }

  // 二、月号就是「当月 + 段序号」，绕回 1
  const want = [];
  for (let i = 0; i < 12; i += 1) want.push(String(((today.m - 1 + i) % 12) + 1));
  if (marks.map((m) => m.label).join(',') !== want.join(',')) {
    badLabel += 1;
    if (badLabel <= 3) {
      failures.push(
        `${stamp}：月号 ${marks.map((m) => m.label).join(',')}，应为 ${want.join(',')}`,
      );
    }
  }

  // 三、角度严格递增、且都落在 [0, 360)。不递增 = 有数字叠在一起或绕过了头
  for (let i = 0; i < marks.length; i += 1) {
    const lo = bands[i].from;
    const hi = bands[i].to;
    if (!(marks[i].deg >= lo && marks[i].deg < hi)) {
      badRange += 1;
      if (badRange <= 3) {
        failures.push(
          `${stamp}：月号 ${marks[i].label} 落在 ${marks[i].deg.toFixed(1)}°，不在本段 [${lo.toFixed(1)}, ${hi.toFixed(1)}) 内`,
        );
      }
    }
    if (i > 0 && marks[i].deg <= marks[i - 1].deg) {
      badOrder += 1;
      if (badOrder <= 3) {
        failures.push(
          `${stamp}：月号 ${marks[i - 1].label}@${marks[i - 1].deg.toFixed(1)}° 之后是 ` +
            `${marks[i].label}@${marks[i].deg.toFixed(1)}°，没有递增`,
        );
      }
    }
  }

  // 四、相邻弦距：数字之间不许撞上（换算成最窄盘面上的像素）
  for (let i = 1; i < marks.length; i += 1) {
    const gap = marks[i].deg - marks[i - 1].deg;
    if (gap < minGap) {
      minGap = gap;
      minGapAt = `${stamp} ${marks[i - 1].label}→${marks[i].label}`;
    }
    if (gap > maxGap) {
      maxGap = gap;
      maxGapAt = `${stamp} ${marks[i - 1].label}→${marks[i].label}`;
    }
    const chord = 2 * MARK_R * Math.sin((gap * Math.PI) / 360);
    if (chord < minChord) minChord = chord;
  }
}

/* ------------------------------------------------------------ 结果 */

check('段数 / 月号数恒为 12', badCount === 0, `${badCount} 天不符`);
check('月号序列恒等于「当月起十二个月」', badLabel === 0, `${badLabel} 天不符`);
check('月号角度严格递增', badOrder === 0, `${badOrder} 处逆序`);
check('月号落在自己那一段内', badRange === 0, `${badRange} 处越段`);
check(
  '相邻月号不碰撞（最窄盘面上弦距 ≥ 24px）',
  minChord >= 24,
  `最小弦距 ${minChord.toFixed(1)}px`,
);
/*
 * 13° 这条线是量出来的，不是拍的：两年七百三十天里最挤的一次是 2026-01-31 ——
 * 本月只剩当天一天（首段 0.98°），于是「1」落在 0.49°、「2」落在 14.75°，
 * 相距 14.26°。再挤也挤不过「本月只剩一天」这个上限，所以 13 是安全的下界。
 */
check('相邻角距 ≥ 13°', minGap >= 13, `最小 ${minGap.toFixed(2)}°（${minGapAt}）`);

/* ------------------------------------------------------------ 抽样表 */

section('抽样');
for (const stamp of [
  { y: 2026, m: 9, d: 23 },
  { y: 2026, m: 9, d: 1 },
  { y: 2026, m: 9, d: 30 },
  { y: 2026, m: 2, d: 28 },
  { y: 2028, m: 2, d: 29 },
  { y: 2026, m: 12, d: 31 },
]) {
  const ticks = dial.monthTicks(stamp, HORIZON);
  const bands = dial.bandSegments(ticks);
  const marks = dial.monthMarks(bands, stamp.m);
  const first = marks[0];
  console.log(
    `  ${stamp.y}-${String(stamp.m).padStart(2, '0')}-${String(stamp.d).padStart(2, '0')}  ` +
      `首段宽 ${(bands[0].to - bands[0].from).toFixed(2)}°  首枚「${first.label}」@ ${first.deg.toFixed(2)}°  ` +
      `落点 ${marks.map((m) => `${m.label}@${m.deg.toFixed(0)}`).join(' ')}`,
  );
}

section('结论');
console.log(`  遍历 ${DAYS} 个起始日（2026-01-01 起）`);
console.log(
  `  相邻角距 ${minGap.toFixed(2)}° ~ ${maxGap.toFixed(2)}°` +
    `（最小 ${minGapAt}｜最大 ${maxGapAt}）`,
);
console.log(`  最窄盘面（${MIN_SIZE}px，月轮半径 ${MARK_R.toFixed(1)}px）上的最小弦距 ${minChord.toFixed(1)}px`);
console.log(
  `  月号透明度 ${dial.MONTH_LABEL_OPS[0].toFixed(2)} → ${dial.MONTH_LABEL_OPS[dial.MONTH_LABEL_OPS.length - 1].toFixed(2)}`,
);
console.log(`  ${passed} 项通过，${failures.length} 项失败`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  ✘ ${f}`);
  process.exit(1);
}
