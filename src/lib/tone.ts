/**
 * 岁时 · 色调判定
 *
 * 「距今天数」到四档色调（today / soon / future / past）的映射，
 * 全应用只此一处。列表、圆盘、详情页读的都是它 ——
 * 三处各写一遍阈值，迟早会出现「列表说还早、圆盘说将到」这种自相矛盾。
 */

import type { CountTone } from '@/constants/theme';

/** 多久之内算「就要到了」。30 天是一个月，也是人开始做准备的心理阈值 */
export const SOON_WINDOW_DAYS = 30;

export function countToneOf(days: number): CountTone {
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days <= SOON_WINDOW_DAYS) return 'soon';
  return 'future';
}

/**
 * 圆盘上光点的亮度档。
 *
 * 刻意与 event.tone（用户自己标的分类色）分开：色相说「是哪一类」，
 * 亮度说「还有多久」。两个信息走两条通道，互不干扰 ——
 * 否则用户把生日标成红色之后，「快到了」就没法再表达了。
 */
export function dialBrightness(days: number): number {
  if (days < 0) return 0.35;
  if (days === 0) return 1;
  if (days <= 7) return 1;
  if (days <= SOON_WINDOW_DAYS) return 0.85;
  if (days <= 120) return 0.6;
  return 0.42;
}
