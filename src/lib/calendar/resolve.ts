/**
 * 岁时 · 周期解析
 *
 * 回答唯一一个问题：**这条纪念日下一次落在哪一天。**
 *
 * 硬性约束（改这个文件前先读完）：
 *   - 全部是**纯函数**：不碰数据库、不碰 React、不读系统时间。
 *     「今天」由调用方以 `DateParts` 传入 —— 只有这样，八种历法×周期组合的
 *     边界（2/29、腊月三十、闰四月、跨年）才能用固定日期逐条断言。
 *   - 只返回「下一次」或「那一次」，不返回历史序列。往回看由 UI 从 `days` 判断。
 *
 * ── 八种组合的落点规则 ──────────────────────────────────────────
 *
 *   公历 · 一次性   锚定那一天，过了就是过了（expired = true）
 *   公历 · 每年     月日重复；2/29 在平年钳到 2/28
 *   公历 · 每月     日重复；31 日在小月钳到月末
 *   公历 · 每周     星期几重复；与月日无关
 *
 *   农历 · 一次性   锚定那个农历日，过了就是过了
 *   农历 · 每年     月日重复；闰月缺失年份退回平月，腊月三十遇小月落廿九
 *   农历 · 每月     农历月内重复，**跨闰月**（闰四月会被当成独立的一个月）
 *   农历 · 每周     不存在 —— 农历日期与星期无固定关系，置灰
 */

import { addDays, clampDay, compareParts, diffDays, weekdayOf } from '../date';
import type { Anniversary, DateParts, LunarParts, Occurrence } from '../types';
import { lunarMonthsOf, lunarToSolar, solarToLunar } from './lunar';

/** 圆盘能画出的最远天数。超过这个数的条目只能进列表，上不了盘 */
export const DIAL_HORIZON_DAYS = 366;

/** 搜索时最多往后翻几年。农历条目偶尔要跨一年才找到落点，留 3 年很宽裕 */
const SEARCH_YEARS = 3;

interface Candidate {
  date: DateParts;
  lunar: LunarParts | null;
  /** 周年数；按月/按周/一次性为 null */
  ordinal: number | null;
}

/* ------------------------------------------------------------ 公历 */

function monthShift(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

function resolveSolar(event: Anniversary, today: DateParts): Candidate | null {
  switch (event.repeat) {
    case 'once': {
      if (event.year == null) return null;
      const date = { y: event.year, m: event.month, d: clampDay(event.year, event.month, event.day) };
      return { date, lunar: solarToLunar(date), ordinal: null };
    }

    case 'yearly': {
      // 从今年起往后找第一个不早于今天的落点
      for (let i = 0; i <= SEARCH_YEARS; i += 1) {
        const y = today.y + i;
        const date = { y, m: event.month, d: clampDay(y, event.month, event.day) };
        if (compareParts(date, today) >= 0) {
          return {
            date,
            lunar: solarToLunar(date),
            ordinal: event.year != null ? y - event.year : null,
          };
        }
      }
      return null;
    }

    case 'monthly': {
      for (let i = 0; i <= SEARCH_YEARS * 12; i += 1) {
        const { y, m } = monthShift(today.y, today.m, i);
        const date = { y, m, d: clampDay(y, m, event.day) };
        if (compareParts(date, today) >= 0) {
          return { date, lunar: solarToLunar(date), ordinal: null };
        }
      }
      return null;
    }

    case 'weekly': {
      const target = event.weekday ?? weekdayOf({ y: event.year ?? today.y, m: event.month, d: event.day });
      const delta = (target - weekdayOf(today) + 7) % 7;
      const date = addDays(today, delta);
      return { date, lunar: solarToLunar(date), ordinal: null };
    }
  }
}

/* ------------------------------------------------------------ 农历 */

/** 农历「每年」：逐年找第一个不早于今天的落点 */
function resolveLunarYearly(event: Anniversary, today: DateParts): Candidate | null {
  const startLunarYear = solarToLunar(today).y;
  for (let i = 0; i <= SEARCH_YEARS; i += 1) {
    const ly = startLunarYear + i;
    const anchor: LunarParts = { y: ly, m: event.month, d: event.day, leap: event.leap };
    // lunarToSolar 内部已处理「闰月不存在 → 退回平月」「三十 → 廿九」，
    // 并回传实际生效的月日 —— 展示一律用它，不用 anchor
    const hit = lunarToSolar(anchor);
    if (!hit) continue;
    if (compareParts(hit.date, today) >= 0) {
      return {
        date: hit.date,
        lunar: hit.lunar,
        ordinal: event.year != null ? ly - event.year : null,
      };
    }
  }
  return null;
}

/**
 * 农历「每月」：把连续三年的农历月摊平成一维序列，取第一个落点。
 *
 * 为什么摊平而不是按月号加减：农历月有大小月、有闰月插入，
 * 「月号 + 1」根本不是「下一个月」。闰四月与四月是两个不同的月份，
 * 但月号相同 —— 只有拿真实月份序列才能正确推进。
 */
function resolveLunarMonthly(event: Anniversary, today: DateParts): Candidate | null {
  const todayLunar = solarToLunar(today);
  const startYear = todayLunar.y;

  for (let i = 0; i <= SEARCH_YEARS; i += 1) {
    const ly = startYear + i;
    for (const info of lunarMonthsOf(ly)) {
      const anchor: LunarParts = { y: ly, m: info.month, d: event.day, leap: info.leap };
      const hit = lunarToSolar(anchor);
      if (!hit) continue;
      if (compareParts(hit.date, today) >= 0) {
        return { date: hit.date, lunar: hit.lunar, ordinal: null };
      }
    }
  }
  return null;
}

function resolveLunarOnce(event: Anniversary): Candidate | null {
  if (event.year == null) return null;
  const anchor: LunarParts = { y: event.year, m: event.month, d: event.day, leap: event.leap };
  const hit = lunarToSolar(anchor);
  if (!hit) return null;
  return { date: hit.date, lunar: hit.lunar, ordinal: null };
}

function resolveLunar(event: Anniversary, today: DateParts): Candidate | null {
  switch (event.repeat) {
    case 'once':
      return resolveLunarOnce(event);
    case 'yearly':
      return resolveLunarYearly(event, today);
    case 'monthly':
      return resolveLunarMonthly(event, today);
    case 'weekly':
      // 农历与星期无固定关系，无法定义「每周的农历某日」。设计上置灰，这里返回 null。
      return null;
  }
}

/* ------------------------------------------------------------ 对外 */

/**
 * 解析一条纪念日的下一次落点。
 *
 * 返回 null 的三种情况：数据不完整（一次性条目缺年份）、
 * 农历组合不存在（农历+每周）、搜索窗内无解（理论上不会发生）。
 * 调用方应当把 null 当成「跳过这条」而不是报错。
 */
export function resolveOccurrence(event: Anniversary, today: DateParts): Occurrence | null {
  const hit = event.calendar === 'lunar' ? resolveLunar(event, today) : resolveSolar(event, today);
  if (!hit) return null;

  const days = diffDays(today, hit.date);
  return {
    id: event.id,
    date: hit.date,
    lunar: hit.lunar,
    days,
    ordinal: hit.ordinal,
    // 只有一次性条目会「过期」；周期条目永远有下一次
    expired: event.repeat === 'once' && days < 0,
  };
}

/** 批量解析，丢掉无解的条目 */
export function resolveAll(events: Anniversary[], today: DateParts): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    const occ = resolveOccurrence(e, today);
    if (occ) out.push(occ);
  }
  return out;
}

/**
 * 列表排序：天数升序。
 *
 * 刻意**不**把置顶的排在最前 —— 置顶条目的优先级表现在它的视觉重量上
 * （圆盘上更大的光点、列表里更亮的底色），而不是打乱时间顺序。
 * 一张按时间排的星盘被打乱，用户就数不出「下一个是谁」了。
 */
export function sortByDays(occurrences: Occurrence[]): Occurrence[] {
  return [...occurrences].sort((a, b) => a.days - b.days || a.id.localeCompare(b.id));
}

/** 圆盘能承载的部分：已过去的、以及一年之外的，都不上盘 */
export function dialWorthy(occurrences: Occurrence[]): Occurrence[] {
  return occurrences.filter((o) => !o.expired && o.days <= DIAL_HORIZON_DAYS);
}
