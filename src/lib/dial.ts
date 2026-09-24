/**
 * 岁时 · 天象盘的几何与视觉参数
 *
 * 从 `components/domain/SkyDial.tsx` 抽出来的东西，只有一类：
 * **纯函数与纯常量** —— 不碰 React、不碰手势、不碰动画。
 *
 * 抽出来的理由不是「组件太长」，而是**可验证**：盘上到底画成什么样，
 * 原先只能把 App 装到手机上看。现在 `scripts/dial-preview.cjs` 直接编译本文件、
 * 用同一套函数出图，调星野密度或光带梯度时先看图再改组件。
 *
 * ★ **`norm360` 刻意留在了 SkyDial.tsx 里。**
 * 它带 `'worklet'` 指令、被 UI 线程同步调用，搬出组件文件会掉进
 * worklets 的 remote function 陷阱（见那边的长注释）。这一条不是洁癖。
 */

import { diffDays } from './date';
import type { DateParts } from './types';

/* ------------------------------------------------------------ 常量 */

/** 设计基准边长。实际盘面在 326~340 之间浮动，星点半径按它等比缩放 */
export const BASE_SIZE = 340;

/**
 * 盘面纵深三层同心圆的半径，按 ringR 的比例给。
 *
 * 用三层实心圆而不是 `RadialGradient`：react-native-svg 的原生渐变比实心圆贵得多，
 * 而这里只有三档明度，实心圆完全够用、且在任何尺寸下都不会出现色带。
 */
export const BED_RATIOS = [1, 0.767, 0.507] as const;

/** 辉光的视觉倍数（本体仍是那颗 3.4px 的星，不放大） */
export const HALO_SCALE = 2.7;

/** 辉光透明度的下限与上限。下限是留给远景条目的余地，不是随手取的 */
export const HALO_MIN = 0.06;
export const HALO_MAX = 0.17;

/**
 * 时间光带的亮度梯度，按角度由近及远。
 *
 * 一张手调的表，不是线性衰减：前四段掉得快要立刻建立「越远越沉」的直觉，
 * 后四段几乎持平，让一年的尽头安静地融进夜色，而不是断在半空。
 */
export const BAND_OPS = [0.5, 0.42, 0.34, 0.27, 0.21, 0.16, 0.12, 0.1, 0.08, 0.06, 0.05, 0.04] as const;

/**
 * 月轮数字距外环的径向内收量（px，与刻度一样是固定像素，不随盘缩放）。
 *
 * 收到 ringR − 21：外面留给光带（挂在 ringR）与分至刻（ringR−13 以内），
 * 里面落在第一层与第二层盘面的分界（0.767·ringR ≈ ringR−34）之外 ——
 * 数字整个待在「最外那圈安静的环面」上，不越过分界、也不挤进光点的辉光。
 */
export const MONTH_LABEL_INSET = 21;

/**
 * 月轮数字相对本段起点的角度偏移上限 —— **半个月**（31 天 ÷ 2 ÷ 366 天 × 360°）。
 *
 * 取中点是为了让数字落在它标的那一个月里。但最后一段是被视界切过的那一个月：
 * 它可能比一个月更长（含下个月的头几天），照取中点会把数字漂到下个月的地界上去。
 * 封顶在半个月，两种情形都落回「这个月自己的中点」。
 */
export const MONTH_LABEL_MAX_OFFSET = 15.25;

/**
 * 月轮数字的透明度，按段中角度由近及远。
 *
 * ★ 刻意**不照抄 BAND_OPS**：那条曲线末端压到 0.04，对于一段弧还剩位置感，
 * 对于一个 11.5px 的数字就是彻底消失 —— 数字是用来读的，不是用来发光的。
 * 这条下限抬到 0.46，只做「远月更静」的暗示，不做消失。
 * 起点也没有到 1：月轮是环上的第二信息层，不该与光点、金弧争亮度。
 */
export const MONTH_LABEL_OPS = [
  0.86, 0.8, 0.74, 0.69, 0.65, 0.61, 0.58, 0.55, 0.52, 0.5, 0.48, 0.46,
] as const;

/** 焦点呼吸：最外一环的透明度在 0.05 ↔ 0.18 之间来回。周期长到不该被注意到 */
export const BREATH_MIN = 0.05;
export const BREATH_RANGE = 0.13;
export const BREATH_DURATION = 2800;

/** 光点显影的时长与「从 40% 长到满」的起始比例 */
export const DOT_GROW_MS = 260;

/** 星野的颗数。再多开始像噪点，再少就撑不起「野」字 */
export const STAR_COUNT = 26;

/** 固定种子。星野必须每次落在同一处，否则视口一变整片星星会「跳」一下 */
export const STAR_SEED = 0x5e17e5;

/** 星点到圆心的半径区间（相对 ringR）。两端都是被别的元素挤出来的，见 makeStars */
export const STAR_R_MIN = 0.28;
export const STAR_R_MAX = 0.82;

/* ------------------------------------------------------------ 几何 */

/** 把「0° 在正上方、顺时针为正」的角度转成直角坐标 */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** 圆环上的一段弧。`from` / `to` 同为角度，顺时针增量 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
): string {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const sweepDeg = to - from;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${Math.abs(sweepDeg) > 180 ? 1 : 0} ${sweepDeg >= 0 ? 1 : 0} ${b.x} ${b.y}`;
}

/** 圆环上一条径向短线（刻度） */
export function tickPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  deg: number,
): string {
  const a = polar(cx, cy, rOuter, deg);
  const b = polar(cx, cy, rInner, deg);
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

/**
 * 在一张「按角度铺开的取值表」上线性插值。
 *
 * 光带与月轮各有一张表，插值方式必须一致 —— 都是按**角度**取值而不是按段序号查表，
 * 理由见 bandOpacity 的注释（段数会浮动）。抽成一处，两张表才不会哪天悄悄走偏。
 */
function lerpByDeg(stops: readonly number[], deg: number): number {
  const t = Math.min(Math.max(deg / 360, 0), 1) * (stops.length - 1);
  const i = Math.floor(t);
  const a = stops[i] ?? stops[stops.length - 1];
  const b = stops[Math.min(i + 1, stops.length - 1)] ?? a;
  return a + (b - a) * (t - i);
}

/**
 * 段中角度 → 光带透明度。
 *
 * 在 BAND_OPS 上线性插值，而不是按段序号查表：光带是按**真实月份边界**切的，
 * 段数随当月位置在 11~12 之间浮动，按序号查表会错位。按角度取值则任意段数都对得上。
 */
export function bandOpacity(midDeg: number): number {
  return lerpByDeg(BAND_OPS, midDeg);
}

/** 段中角度 → 月轮数字透明度。同样的插值，另一张表 */
export function monthLabelOpacity(midDeg: number): number {
  return lerpByDeg(MONTH_LABEL_OPS, midDeg);
}

/**
 * 「本月起十二个月」的 1 号落在环上的角度。
 *
 * ★ 这一段原先是写在组件里的。搬过来，是因为 `scripts/dial-preview.cjs`
 *   不得不把同一段算法抄一遍 —— 而预览的全部价值就建立在「与真机同源」上，
 *   复刻一旦走偏，图就不再是证据。几何就该待在几何这一侧。
 *
 * 本月的 1 号若已过去（days < 0）不会入列，但它并不缺席：
 * `bandSegments` 补的那个 0° 端点正好顶上本月的起点。
 * 于是「第 j 段 = 第 (当月 + j) 个月」这条等式永远成立 ——
 * 这正是 `monthMarks` 可以只按段序号推月号的依据，不必回传月号。
 */
export function monthTicks(today: DateParts, horizonDays: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const idx = today.y * 12 + (today.m - 1) + i;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const days = diffDays(today, { y, m, d: 1 });
    if (days >= 0 && days <= horizonDays) out.push((days / horizonDays) * 360);
  }
  return out;
}

/**
 * 把一串「月首角度」切成光带分段。
 *
 * 端点补齐 0 与 360，于是段数恒等于「月首数 + 1」——
 * 今天通常在月中，第一个月首还在身后，所以实际是 11 个端点 → 12 段，正好一年。
 */
export function bandSegments(monthTicks: number[]): { from: number; to: number; opacity: number }[] {
  const inner = monthTicks.filter((d) => d > 0 && d < 360).sort((a, b) => a - b);
  const out: { from: number; to: number; opacity: number }[] = [];
  let from = 0;
  for (const to of [...inner, 360]) {
    out.push({ from, to, opacity: bandOpacity((from + to) / 2) });
    from = to;
  }
  return out;
}

/**
 * 月轮的一枚数字。
 *
 * 为什么是「数字」而不是「刻度线」：光带本身已经把一年切成十二段，
 * 段与段的接缝就是月份边界 —— 再压一层灰线只是把同一件事说两遍。
 * 但接缝里没有**信息**：站在环上任意一处，读不出这是几月。
 * 数字补的正是这一格，所以它不能退化成刻度，只能是一个数。
 */
export interface MonthMark {
  /** 公历月号，'1' ~ '12' */
  label: string;
  /** 数字在盘坐标里的角度。盘坐标：0° = 今天，顺时针推进 */
  deg: number;
  opacity: number;
}

/**
 * 月轮：给光带的十二段各配一个月号，落在**本段中点**。
 *
 * `segments` 就是 `bandSegments(monthTicks)` 的输出，`firstMonth` 是今天的公历月。
 * 段的归属可以直接按序号推：`monthTicks` 从「本月」起连取十二个月，
 * 本月的那个 1 号若已过去会被 `days >= 0` 滤掉 —— 于是 `bandSegments` 补的 0° 端点
 * 正好顶上了本月的起点。所以第 j 段恒等于第 (firstMonth + j) 个月，
 * 一年十二段正好十二个数，**不需要去重、也不会漏月**（含今天正是 1 号那种边界）。
 *
 * 今天是月末时，第 0 段会短到不足半度（只剩今天这一天）——
 * 这时数字就贴在「今天」那道刻的旁边，读起来反而正好：
 * 今天在这里，这里是这个月。
 */
export function monthMarks(
  segments: { from: number; to: number }[],
  firstMonth: number,
): MonthMark[] {
  return segments.map((seg, i) => {
    const deg = seg.from + Math.min((seg.to - seg.from) / 2, MONTH_LABEL_MAX_OFFSET);
    return {
      label: String(((firstMonth - 1 + i) % 12) + 1),
      deg,
      opacity: monthLabelOpacity(deg),
    };
  });
}

/* ------------------------------------------------------------ 星野 */

export interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
}

/**
 * mulberry32：小、快、够用。
 *
 * 刻意不用 `Math.random` —— 星野的位置必须是**确定的**。用随机数的话，
 * 每次重渲染都换一批坐标，主题切换、键盘弹出这类会引发重渲染的操作
 * 都会让整片星空「跳」一下，非常出戏。
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 盘内的极暗星点。
 *
 * 两个半径约束，都是被别的元素挤出来的：
 *   下限 0.28·ringR —— 再往里就压到圆心的名字与倒计时上了
 *   上限 0.82·ringR —— 再往外就撞进光点的辉光（直径约 0.18·ringR），
 *                     星与光点混作一团，两条通道就分不清了
 *
 * 角度按等分加抖动铺开，不是纯随机：纯随机会结块，盘上会留出大片空白，
 * 那种「空」读起来像渲染失败而不像夜空。
 */
export function makeStars(ringR: number, size: number): Star[] {
  const rnd = mulberry32(STAR_SEED);
  const c = size / 2;
  const scale = size / BASE_SIZE;
  const step = 360 / STAR_COUNT;
  const out: Star[] = [];

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const deg = step * i + (rnd() - 0.5) * step * 0.9;
    const p = polar(c, c, ringR * (STAR_R_MIN + rnd() * (STAR_R_MAX - STAR_R_MIN)), deg);
    out.push({
      x: p.x,
      y: p.y,
      r: (0.7 + rnd() * 0.5) * scale,
      o: 0.06 + rnd() * 0.13,
    });
  }
  return out;
}
