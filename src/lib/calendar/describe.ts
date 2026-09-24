/**
 * 岁时 · 日期选择的文案
 *
 * 同一段「这个选择对应哪一天」，三处要用：
 *   - 选择器里的预览行
 *   - 录入表单的日期行
 *   - 保存前的校验提示
 *
 * 写三遍就会三处不一致（用户最常看到的正是这种细节上的自相矛盾），
 * 所以统一在这里，只此一份。
 */

import { clampDay, daysInMonth, formatFull, lunarDayName, lunarMonthName, weekdayLabel, weekdayName } from '../date';
import type { CalendarSystem, DateParts, RepeatRule } from '../types';
import { lunarToSolar } from './lunar';

export interface DateSelection {
  year: number | null;
  month: number;
  day: number;
  leap: boolean;
  weekday: number | null;
}

/** 不设年份时用来枚举月份与天数，取闰年：让 2 月 29 日也能算出来 */
const REF_YEAR = 2000;

export function describeDateValue(
  calendar: CalendarSystem,
  repeat: RepeatRule,
  value: DateSelection,
  today: DateParts,
  todayLunarYear: number,
): string {
  if (repeat === 'weekly') {
    return `每${weekdayLabel(value.weekday ?? 1)}`;
  }

  if (repeat === 'monthly') {
    return calendar === 'lunar'
      ? `每个农历${lunarMonthName(value.month, value.leap)}的${lunarDayName(value.day)}`
      : `每月 ${value.day} 日`;
  }

  if (calendar === 'solar') {
    const y = value.year ?? REF_YEAR;
    const d = clampDay(y, value.month, value.day);
    const date: DateParts = { y, m: value.month, d };
    if (value.year != null) return `${formatFull(date)} · ${weekdayName(date)}`;
    return `每年 ${value.month} 月 ${d} 日`;
  }

  const lunarLabel = `农历${lunarMonthName(value.month, value.leap)}${lunarDayName(value.day)}`;

  if (value.year != null) {
    const hit = lunarToSolar({ y: value.year, m: value.month, d: value.day, leap: value.leap });
    if (!hit) return lunarLabel;
    // 闰月缺失或遇小月时 hit.lunar 与用户选的不同，这里要如实说出来
    const actual =
      hit.lunar.m !== value.month || hit.lunar.leap !== value.leap || hit.lunar.d !== value.day
        ? `（${lunarMonthName(hit.lunar.m, hit.lunar.leap)}${lunarDayName(hit.lunar.d)}）`
        : '';
    return `${lunarLabel}${actual} → ${formatFull(hit.date)} · ${weekdayName(hit.date)}`;
  }

  // 不限年份：找出今年或往后最近的一次落在公历哪天
  for (let i = 0; i <= 2; i += 1) {
    const hit = lunarToSolar({
      y: todayLunarYear + i,
      m: value.month,
      d: value.day,
      leap: value.leap,
    });
    if (hit && hit.date.y >= today.y) {
      return `${lunarLabel} → 下一个：${formatFull(hit.date)} · ${weekdayName(hit.date)}`;
    }
  }
  return lunarLabel;
}

/** 日期行上显示的短文案（不带「下一个」这类解释，行里放不下） */
export function describeDateShort(
  calendar: CalendarSystem,
  repeat: RepeatRule,
  value: DateSelection,
  today: DateParts,
): string {
  if (repeat === 'weekly') return `每${weekdayLabel(value.weekday ?? 1)}`;

  if (repeat === 'monthly') {
    return calendar === 'lunar'
      ? `农历${lunarMonthName(value.month, value.leap)}${lunarDayName(value.day)}`
      : `${value.day} 日`;
  }

  if (calendar === 'lunar') {
    const base = `农历${lunarMonthName(value.month, value.leap)}${lunarDayName(value.day)}`;
    return value.year != null ? `${value.year}年 ${base}` : base;
  }

  const y = value.year ?? REF_YEAR;
  const d = clampDay(y, value.month, value.day);
  return value.year != null ? `${value.year}年${value.month}月${d}日` : `${value.month}月${d}日`;
}

/** 校验：返回第一条不通过的原因，全部通过返回 null */
export function validateSelection(
  name: string,
  calendar: CalendarSystem,
  repeat: RepeatRule,
  value: DateSelection,
): string | null {
  if (name.trim().length === 0) return '给这个日子起个名字';
  if (repeat === 'once' && value.year == null) return '仅此一次的日子需要选一个年份';
  if (repeat === 'weekly' && calendar === 'lunar') return '农历不与星期绑定，换公历或改周期';
  if (calendar === 'solar') {
    const y = value.year ?? REF_YEAR;
    if (value.month < 1 || value.month > 12) return '月份不对';
    if (value.day < 1 || value.day > daysInMonth(y, value.month)) {
      // 2 月 29 日在平年会被解析层钳到 28，不算错误，只有超界才算
      return `${value.month} 月没有 ${value.day} 日`;
    }
  }
  return null;
}
