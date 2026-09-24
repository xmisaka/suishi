/**
 * 岁时 · 农历换算
 *
 * 对 `lunar-javascript` 的唯一包装层。**算法库只在这一个文件里出现** ——
 * 换库、加缓存、将来想改成自研查表法，都只动这里，上层不受影响。
 *
 * 三条约定：
 *   1. 对外一律收发 `DateParts` / `LunarParts` 纯对象，不把库的 Solar/Lunar
 *      实例漏出去 —— 否则整个 App 都会长在它的 API 上。
 *   2. 遇到「不存在的农历月」返回 null，**不抛异常**。闰四月在平年不存在，
 *      这是正常的数据状态而非错误，由调用方决定退回哪个月。
 *   3. 闰月一律用 `leap` 布尔表示，不采用「负数月份」这种库内部约定。
 *
 * ── 一个必须记住的坑（踩过一次）─────────────────────────────────
 *
 * 库的 `LunarYear.fromYear(y).getMonths()` 返回的是 **15 个月**，不是 12 个：
 *
 *     月号  [11, 12, 1, 2, 3, 4, 5, 6, -6, 7, 8, 9, 10, 11, 12, 1]
 *            └─ 上一年 ─┘                                   └ 次年 ┘
 *
 * 它按古法「建子」把农历年铺成「上一年冬月起 → 本年腊月 → 次年正月」。
 * 直接拿它当月历用，`find(m => m.month === 11)` 会命中**上一年**的冬月，
 * 于是「农历十一月/十二月」的条目会算错一整年，月长度也会取到错的那一份
 * （2025 年腊月真实 30 天，序列里第一个月号 12 是 2024 年的 29 天）。
 *
 * 所以本文件一律用 `LunarMonth.fromYm(y, m)` 取「y 年自己的第 m 个月」，
 * 用 `LunarYear.getLeapMonth()` 判闰月 —— 这两个才是无歧义的。
 */

import { Lunar, LunarMonth, LunarYear, Solar, type SolarInstance } from 'lunar-javascript';

import { daysInMonth, diffDays } from '../date';
import type { DateParts, LunarParts } from '../types';

/* ------------------------------------------------------------ 月份表 */

interface LunarMonthInfo {
  /** 1–12 */
  month: number;
  leap: boolean;
  /** 该月实际天数，29 或 30 */
  days: number;
}

/**
 * 某个农历年的全部月份，含闰月，按时间顺序。
 *
 * 平年 12 项，闰年 13 项；闰月紧跟在同月号的平月之后
 * （2025 年即 `… 六月、闰六月、七月 …`），与历书一致。
 */
export function lunarMonthsOf(lunarYear: number): LunarMonthInfo[] {
  const leapMonth = LunarYear.fromYear(lunarYear).getLeapMonth();
  const out: LunarMonthInfo[] = [];
  for (let m = 1; m <= 12; m += 1) {
    out.push({ month: m, leap: false, days: LunarMonth.fromYm(lunarYear, m).getDayCount() });
    if (leapMonth === m) {
      out.push({ month: m, leap: true, days: LunarMonth.fromYm(lunarYear, -m).getDayCount() });
    }
  }
  return out;
}

/** 该农历年的闰月月号；无闰月返回 0 */
export function leapMonthOf(lunarYear: number): number {
  return LunarYear.fromYear(lunarYear).getLeapMonth();
}

/**
 * 查某个农历月的实际天数。
 * 该月不存在（闰月落在没有闰月的年份、或月号越界）返回 null。
 *
 * 这里**必须先判闰月是否存在**再问库要长度：对一个不存在的闰月，
 * `LunarMonth.fromYm` 不是返回 null 而是抛异常，不能靠 try/catch 当常规控制流。
 */
export function lunarMonthDays(lunarYear: number, month: number, leap: boolean): number | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (leap && leapMonthOf(lunarYear) !== month) return null;
  try {
    return LunarMonth.fromYm(lunarYear, leap ? -month : month).getDayCount();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ 换算 */

/**
 * 换算结果。
 *
 * 刻意把「实际生效的农历月日」一并带出来，而不是只回公历日期：
 * 闰月缺失时月号退回了平月、腊月三十遇小月落到了廿九，
 * 如果调用方还拿着用户输入的原始值去展示，界面上就会出现
 * 一个这一年根本不存在的「闰六月初一」。展示必须用这里回传的值。
 */
export interface LunarToSolarResult {
  date: DateParts;
  /** 实际生效的农历月日：闰月已按需退回，日已钳到该月长度 */
  lunar: LunarParts;
}

/**
 * 农历 → 公历。
 *
 * 两处钳制，都是真实存在的边界：
 *   - 闰月不存在 → 退回同月号的平月（用户设「闰四月初一」，遇上无闰月的年份，
 *     过的是四月初一，而不是干脆不算这条纪念日）
 *   - 腊月三十遇上只有 29 天的小月 → 落到廿九（大年三十不是年年都有）
 *
 * 两条都只作用于**这一次的解析结果**，库里存的原始值不动 ——
 * 明年闰四月回来了，它又会自己走回闰四月。
 */
export function lunarToSolar(l: LunarParts): LunarToSolarResult | null {
  let month = l.m;
  let leap = l.leap;
  let days = lunarMonthDays(l.y, month, leap);

  // 闰月不存在 → 退回同月号的平月。只改这一次的解析结果，库里存的原始值不动
  if (days === null && leap) {
    leap = false;
    days = lunarMonthDays(l.y, month, false);
  }
  if (days === null) return null;

  const day = Math.min(Math.max(1, l.d), days);
  try {
    const solar = Lunar.fromYmd(l.y, leap ? -month : month, day).getSolar();
    return {
      date: { y: solar.getYear(), m: solar.getMonth(), d: solar.getDay() },
      lunar: { y: l.y, m: month, d: day, leap },
    };
  } catch {
    // 理论上到不了这里（前面已经验过月存在、日已钳进月长）。
    // 真到了也不能崩：一条坏数据不该让整个星盘白屏。
    return null;
  }
}

/** 公历 → 农历。输入必须是有效的公历日期 */
export function solarToLunar(p: DateParts): LunarParts {
  const day = Math.min(Math.max(1, p.d), daysInMonth(p.y, p.m));
  const lunar = Solar.fromYmd(p.y, p.m, day).getLunar();
  const raw = lunar.getMonth();
  return {
    y: lunar.getYear(),
    m: raw < 0 ? -raw : raw,
    d: lunar.getDay(),
    leap: raw < 0,
  };
}

/* ------------------------------------------------------------ 干支与生肖 */

/**
 * 农历年的干支，如「丙午」。圆盘的圆心用它做年份小标 ——
 * 这是本应用唯一一处「不精确但好看」的信息，取的是农历年而非公历年，
 * 春节前后两者不一致，所以只在农历语境下展示。
 */
export function lunarYearGanZhi(lunarYear: number): string {
  try {
    return LunarYear.fromYear(lunarYear).getGanZhi();
  } catch {
    return '';
  }
}

/**
 * 生肖，如「马」。
 *
 * 注意取法与干支不同：`LunarYear` 上**没有**生肖方法，
 * 生肖挂在 `Lunar` 实例上（`getYearShengXiao`）。别再写混。
 */
export function lunarZodiac(lunarYear: number): string {
  try {
    return Lunar.fromYmd(lunarYear, 1, 1).getYearShengXiao();
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------ 二分二至 */

/**
 * 四个分至点。
 *
 * 星盘上除了「我的日子」还需要「天地的时间」——二十四节气全铺上太密，
 * 而二至二分正好落在四个方位上，是天然的骨架。选这四个还有个实际理由：
 * 它们的间隔（92~94 天）足够大，四道刻不会挤在环的一侧。
 */
export const SOLAR_TERMS = ['春分', '夏至', '秋分', '冬至'] as const;

export type SolarTermName = (typeof SOLAR_TERMS)[number];

export interface SolarTermHit {
  name: SolarTermName;
  /** 距今天数。恒 ≥ 0，今天正好是分至点时取 0 */
  days: number;
}

/**
 * 「今天」（含）之后 366 天内，每个分至点最早的那一次还有几天。
 *
 * ── 为什么要翻三张表 ──────────────────────────────────────────
 * 节气表以**冬至**为年头，一张表覆盖「anchorYear−1 的冬至 → anchorYear 的大雪」。
 * 取 anchorYear = today.y + 1 看似够用，但今天落在 12 月下旬（当年冬至已过）时，
 * 当年冬至只在再往后一张表里。三张表才能把窗口完全罩住，
 * 区间外的由 days 的上下界滤掉 —— 多取一张表的代价是 0.1ms 级的算术。
 *
 * ── 为什么读中文键、不用拼音键 ────────────────────────────────
 * 表里同一个节气名出现两次：中文键是本轮的，大写拼音键是下一轮的。
 * 拼音键到中文名没有现成映射，维护一张 24 项对照表又是个新的出错面。
 * 相邻年份的同一节气日期天然不同，所以**同年份重叠**就能补全，
 * 按「窗口内取最早」挑一次即可。
 *
 * 纯函数：只读 today，不碰系统时间。
 */
export function nextSolarTerms(today: DateParts, windowDays: number): SolarTermHit[] {
  const best = new Map<SolarTermName, number>();

  for (const anchorYear of [today.y, today.y + 1, today.y + 2]) {
    let table: Record<string, SolarInstance>;
    try {
      table = Solar.fromYmd(anchorYear, 6, 1).getLunar().getJieQiTable();
    } catch {
      // 超出库支持的年份范围时跳过。一个节气算不出来不该让整张盘白屏
      continue;
    }

    for (const name of SOLAR_TERMS) {
      const solar = table[name];
      if (!solar) continue;
      const days = diffDays(today, { y: solar.getYear(), m: solar.getMonth(), d: solar.getDay() });
      if (days < 0 || days > windowDays) continue;
      const prev = best.get(name);
      if (prev === undefined || days < prev) best.set(name, days);
    }
  }

  return SOLAR_TERMS.filter((n) => best.has(n))
    .map((n) => ({ name: n, days: best.get(n) as number }))
    .sort((a, b) => a.days - b.days);
}
