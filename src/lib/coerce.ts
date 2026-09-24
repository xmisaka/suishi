/**
 * 岁时 · 值收敛
 *
 * 把**不可信的值**收敛成领域值。三个来源都从这里过：
 *   - 数据库行（手改过的库、迁移中途的库、更老版本写的库）
 *   - 备份文件（用户可能编辑过，也可能是别的版本导出的）
 *   - 将来任何外部导入源
 *
 * 原则是**坏字段退化成安全默认值，而不是抛错**：
 * 一条纪念日里某个字段坏了，该丢掉的是那个字段，不是整条记录 ——
 * 用户在乎的是「八月十五」这件事还在，而不是它的标记色是不是原样。
 *
 * 枚举白名单也收在这里，保证 **一份白名单只有一处定义**。
 * 数据库层与备份层各自维护一份，迟早会分叉出「库里认、备份不认」这种
 * 谁也说不清的 bug。
 */

import type { CalendarSystem, EventTone, RepeatRule } from './types';

/* ------------------------------------------------------------ 通用 */

/** 只认纯对象。数组与 null 都不算 —— JSON 顶层是数组是最常见的误传文件 */
export function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** 非空字符串（首尾空白去掉）。空串与纯空白一律当「没有」 */
export function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

/** 落在 [lo, hi] 内的整数；越界或不是数就退化成 fallback */
export function asInt(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const n = Math.round(v);
  return n < lo || n > hi ? fallback : n;
}

/** 同上，但越界退化成「没有值」而不是某个数字 —— 用于本可缺省的字段 */
export function asOptionalInt(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n < lo || n > hi ? null : n;
}

/** 库里的 0/1 与备份里的 true/false 都吃 —— 两处的表示不同，语义相同 */
export function asBool(v: unknown): boolean {
  return v === true || v === 1;
}

/* ------------------------------------------------------------ 枚举白名单 */

export function normalizeRepeat(v: unknown): RepeatRule {
  return v === 'once' || v === 'monthly' || v === 'weekly' ? v : 'yearly';
}

export function normalizeTone(v: unknown): EventTone {
  return v === 'sage' || v === 'amber' || v === 'clay' ? v : 'brand';
}

/** 历法只有两套，非 lunar 即 solar。不做白名单，用二选一 */
export function normalizeCalendar(v: unknown): CalendarSystem {
  return v === 'lunar' ? 'lunar' : 'solar';
}
