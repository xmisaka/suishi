/**
 * 岁时 · 公历运算与格式化
 *
 * 全部建立在 `DateParts`（{y, m, d} 纯数字三元组）上，**不用 `Date` 做运算**。
 * 理由：`Date` 带时区、带本地化，还是可变对象；跨月跨年的加减容易踩到夏令时。
 * 这里只借 `Date.UTC` 做一次「日期 → 连续天数序数」的换算 ——
 * 它只认年月日、按 UTC 算，不受本地时区影响，是安全的。
 *
 * 格式化一律手写，**不用 Intl / toLocaleDateString** ——
 * Hermes 上时区与中文 locale 表现不稳定，手写更可控。
 */

import type { DateParts, LunarParts } from './types';

const MS_PER_DAY = 86_400_000;

/** 一个月的最大天数上限，用于「距今天数 → 档位」的粗略换算 */
export const DAYS_PER_YEAR = 365;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/* ------------------------------------------------------------ 历法基础 */

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(y: number, m: number): number {
  if (m === 2 && isLeapYear(y)) return 29;
  return MONTH_DAYS[m - 1] ?? 30;
}

/**
 * 把「日」钳进某个月的实际范围。
 *
 * 这条规则承担了项目里最多的边界：
 *   - 每月 31 日的条目落在 4 月 → 4 月 30 日
 *   - 公历 2 月 29 日的条目落在平年 → 2 月 28 日
 * 钳法是**向下**（取月末），不是向上取到 3 月 1 日 ——
 * 后者会让「2 月 29 日」的纪念日在平年跑到 3 月去，用户会觉得算错了。
 */
export function clampDay(y: number, m: number, d: number): number {
  return Math.min(Math.max(1, d), daysInMonth(y, m));
}

/* ------------------------------------------------------------ 序数换算 */

/**
 * 日期 → 连续天数序数（1970-01-01 为 0，之前为负）。
 * 两个序数相减就是整天数，跨月跨年跨闰年都不需要特判。
 */
export function toSerial(p: DateParts): number {
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / MS_PER_DAY);
}

export function fromSerial(n: number): DateParts {
  const dt = new Date(n * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addDays(p: DateParts, n: number): DateParts {
  return fromSerial(toSerial(p) + n);
}

/** to − from，单位天 */
export function diffDays(from: DateParts, to: DateParts): number {
  return toSerial(to) - toSerial(from);
}

/** 比较：a 早于 b 返回负，相等返回 0 */
export function compareParts(a: DateParts, b: DateParts): number {
  return toSerial(a) - toSerial(b);
}

export function sameParts(a: DateParts, b: DateParts): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

/* ------------------------------------------------------------ 星期 */

/** 1=周一 … 7=周日（ISO 口径，与库里的 anchor_weekday 一致） */
export function weekdayOf(p: DateParts): number {
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0=周日
  return ((dow + 6) % 7) + 1;
}

const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日'] as const;

/** 1=周一 … 7=周日 → `周三`。库里存的是数字，展示时走它 */
export function weekdayLabel(n: number): string {
  return `周${WEEKDAY_CN[Math.min(Math.max(1, Math.round(n)), 7) - 1]}`;
}

/** `周三` */
export function weekdayName(p: DateParts): string {
  return weekdayLabel(weekdayOf(p));
}

/* ------------------------------------------------------------ 今天 */

/**
 * 今天。**这是整个工程唯一读系统时钟的地方。**
 *
 * 所有历法与周期规则的解析都接受「今天」作为入参，不自己去取 ——
 * 这样边界（闰年、腊月三十、跨年）才能用固定日期逐条断言。
 */
export function todayParts(): DateParts {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

/* ------------------------------------------------------------ 格式化 */

/** `2026年9月23日` */
export function formatFull(p: DateParts): string {
  return `${p.y}年${p.m}月${p.d}日`;
}

/** `9月23日` */
export function formatMD(p: DateParts): string {
  return `${p.m}月${p.d}日`;
}

/** `9月23日 周三` */
export function formatMDWeek(p: DateParts): string {
  return `${formatMD(p)} ${weekdayName(p)}`;
}

/** `2026.09.23` */
export function formatDot(p: DateParts): string {
  return `${p.y}.${pad2(p.m)}.${pad2(p.d)}`;
}

/** `2026-09-23`，仅用于键与调试 */
export function formatISO(p: DateParts): string {
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/**
 * 距今天数的自然语言表述。
 * 0 不说「0 天后」，说「就在今天」—— 这是首页最重要的一行字，不能是数字。
 */
export function describeDays(days: number): string {
  if (days === 0) return '就在今天';
  if (days === 1) return '明天';
  if (days === 2) return '后天';
  if (days > 0) return `${days} 天后`;
  if (days === -1) return '昨天';
  if (days === -2) return '前天';
  return `${Math.abs(days)} 天前`;
}

/**
 * 大倒计时的数字与单位拆开，供圆盘中心排大字用。
 * 「就在今天」不给数字，由调用方走另一条分支。
 */
export function splitCountdown(days: number): { value: string; unit: string } {
  if (days === 0) return { value: '今天', unit: '' };
  if (days > 0) return { value: String(days), unit: '天后' };
  return { value: String(Math.abs(days)), unit: '天前' };
}

/* ------------------------------------------------------------ 农历展示 */

const LUNAR_DAY_CN = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
] as const;

const LUNAR_MONTH_CN = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月',
] as const;

/**
 * 农历「日」的中文写法。
 * 手写这张表而不是问 lunar-javascript 要 —— 格式化是展示层的事，
 * 让算法库只负责算，职责更干净，也方便单测。
 */
export function lunarDayName(d: number): string {
  return LUNAR_DAY_CN[d - 1] ?? String(d);
}

/** 农历「月」的中文写法，闰月带「闰」字 */
export function lunarMonthName(m: number, leap: boolean): string {
  const base = LUNAR_MONTH_CN[m - 1] ?? `${m}月`;
  return leap ? `闰${base}` : base;
}

/** `八月十五` / `闰四月廿一` */
export function formatLunar(p: LunarParts): string {
  return `${lunarMonthName(p.m, p.leap)}${lunarDayName(p.d)}`;
}
