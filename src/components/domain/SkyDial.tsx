/**
 * 岁时 · 天象盘（夜观）
 *
 * 首页的全部内容：把一年压成一个圆。
 *
 * ── 空间语法 ────────────────────────────────────────────────
 *   圆心    焦点条目的倒计时（不随盘旋转，永远正面朝上）
 *   指针    固定在 12 点。**谁转到指针底下，谁就是焦点**
 *   光点    每个条目一枚，按「距今天数 ÷ 366 × 360°」定位，顺时针推进
 *   金弧    从「今天」那道刻度扫到焦点，扫的时长即是「还有多远」的视觉隐喻
 *   光带    外环本身切成十二段，越远越暗 —— 时间第一次有了方向
 *   月轮    十二段的段中各一枚月号。位置随盘转，字面反向自转、永远朝上
 *   分至    春分 / 夏至 / 秋分 / 冬至四道金刻，标的是天地的时间
 *
 * ── 两层：转的是刻度，不是天 ─────────────────────────────────
 *   静止层  盘面纵深（三层同心圆）+ 星野。**这一层永远不转**
 *   旋转层  光带、月轮、刻度、金弧、光点、焦点光晕
 *
 * 拆两层不只为好画：星野是背景，让它跟着盘转，观感就变成「整个天在转」，
 * 而真实的观星体验是天不动、盘在动。这层错觉一建立，
 * 「拖动圆盘换个日子看」这个操作就失去了隐喻。
 *
 * ── 两条通道，互不干扰 ──────────────────────────────────────
 *   色相（光点颜色）= 用户自己标的分类（生日 / 纪念 / 节日…）
 *   亮度（光点辉光）= 还有多久。今天的满亮并带光晕，一年外的只剩一点影子
 * 分开的理由：用户把生日标成朱红之后，「快到了」必须还有地方可表达。
 *
 * ── 拖动 ────────────────────────────────────────────────────
 *   绕圆心拖 → 盘跟着转 → 松手吸附到最近的光点。指尖转多少盘就转多少，
 *   不做「拖一下跳一格」，因为一年里有三十个日子时，跳格会让人永远够不到中间那些。
 *   点一下圆环任意位置 → 最近的那枚直接转到指针底下（远程条目的捷径）。
 *
 *   触感分两级：越过一枚光点时 selection（轻），落定时 Light（稍重）。
 *   见下方 onFocusChange / replaySweep 的注释。
 *
 * 动画全部在 UI 线程：旋转、扫弧、光点显影、焦点呼吸都是 worklet 驱动的共享值，
 * JS 线程只负责「焦点换人了」这一件事。
 *
 * 几何、视觉参数、星野散布都在 `lib/dial.ts` —— 那边是纯函数，
 * 可以脱离手机屏幕被 `scripts/dial-preview.cjs` 直接跑出来看图。
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type TextStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Motion, Palette, StatusTones, Type, type TokenName } from '@/constants/theme';
import { nextSolarTerms } from '@/lib/calendar/lunar';
import { DIAL_HORIZON_DAYS } from '@/lib/calendar/resolve';
import { describeDays, formatMDWeek, formatLunar } from '@/lib/date';
import {
  BED_RATIOS,
  BREATH_DURATION,
  BREATH_MIN,
  BREATH_RANGE,
  DOT_GROW_MS,
  HALO_MAX,
  HALO_MIN,
  HALO_SCALE,
  MONTH_LABEL_INSET,
  arcPath,
  bandSegments,
  makeStars,
  monthMarks,
  monthTicks as dialMonthTicks,
  polar,
  tickPath,
} from '@/lib/dial';
import { makeStyles } from '@/lib/theme';
import { countToneOf, dialBrightness } from '@/lib/tone';
import type { Anniversary, DateParts, EventTone, Occurrence } from '@/lib/types';
import { ItemText, Label, Meta } from '../ui/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** 分类色 → 令牌名。存语义键而非色值，换肤时才不会花 */
const TONE_TOKEN: Record<EventTone, TokenName> = {
  brand: 'brand',
  sage: 'sage',
  amber: 'amber',
  clay: 'clay',
};

/**
 * 角度归一到 [0, 360)。
 *
 * ★ 这个 `'worklet'` 指令不能删。
 *
 * 它被 `useAnimatedReaction` 的 react 函数与 tap 手势的 onEnd 两个 worklet
 * **同步调用**（不是经 runOnJS 绕回 JS 线程）。worklets 0.10 会把 worklet 闭包里的
 * 普通 JS 函数包成「remote function」——在 UI 线程上同步调用它必然抛：
 *
 *     [Worklets] Tried to synchronously call a Remote Function.
 *     Called "anonymous" on the UI Runtime.
 *
 * 表现是：手指一碰圆盘（点环或拖动），App 立刻闪退。
 * release 包里没有红屏，只剩一句「岁时 已停止运行」——很容易被误判成原生崩溃。
 *
 * 判据：只要某个函数出现在某条报错栈的 `SkyDialTsx*` 帧里被直接调用，
 * 就必须带上这个指令。
 *
 * ★ 这一条也是它**没有**被搬去 `lib/dial.ts` 的原因 —— 那边全是渲染期纯函数，
 * 混进一个 worklet 会让「哪些函数能跨文件搬」这件事失去边界。
 */
function norm360(deg: number): number {
  'worklet';
  return ((deg % 360) + 360) % 360;
}

/* ------------------------------------------------------------ 光点 */

/**
 * 单枚光点。显影动画由它自己持有 —— 每个点一个共享值，
 * 而不是让父组件在 worklet 里算 30 个透明度（那样每帧都要跑 30 次插值）。
 *
 * 「辉光」是这一版的核心：本体仍是 3.4px 的星，**不放大**（放大就失去了星的形态），
 * 外面裹一层 2.7 倍半径的同色圆，视觉直径一下到了 18px。
 * 于是「光点太小看不清」与「远的光点该淡」两个要求同时满足：
 * 本体给精度，辉光给体量，两者共用同一个亮度系数 —— 亮度通道由此从
 * 「透明度」升级成了「发光」。
 */
function DialDot({
  cx,
  cy,
  r,
  fill,
  opacity,
  delay,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity: number;
  delay: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withTiming(1, { duration: DOT_GROW_MS, easing: Easing.out(Easing.quad) }),
    );
  }, [delay, t]);

  const coreProps = useAnimatedProps(() => ({
    // 从 40% 长到满，像星星亮起来
    r: r * (0.4 + 0.6 * t.value),
    opacity: opacity * t.value,
  }));

  /*
   * 辉光的透明度下限压在 0.06 而不是随亮度归零：一年外的条目本体已淡到 0.42，
   * 辉光再等比衰减就彻底没了，「盘上还有这么个日子」这件事就读不出来。
   * 留一线灰影，是给远景留的余地。
   */
  const haloProps = useAnimatedProps(() => ({
    r: r * HALO_SCALE * (0.4 + 0.6 * t.value),
    opacity: (HALO_MIN + (HALO_MAX - HALO_MIN) * opacity) * t.value,
  }));

  return (
    <>
      <AnimatedCircle cx={cx} cy={cy} fill={fill} animatedProps={haloProps} />
      <AnimatedCircle cx={cx} cy={cy} fill={fill} animatedProps={coreProps} />
    </>
  );
}

/* ------------------------------------------------------------ 月轮 */

/** 月号格子的尺寸。宽按两位月号留（11.5px 的 '12' 约 13px），高对齐 Type.label 的行高 */
const MONTH_CELL_W = 24;
const MONTH_CELL_H = 17;

/**
 * 月号的字。
 *
 * 字重 500 而不是 600：11.5px 的字在半透明的墨底上再压粗，笔画会糊成一团。
 * 等宽数字是为此处专门开的 —— 环上一圈数字里混着个位与两位，
 * 宽度一跳，「12 → 1 → 2」的节奏就散了，等宽之后每个月的角距看起来才均匀。
 *
 * 显式标 `TextStyle` 而不是 `as const`：`as const` 会把 fontVariant 收成
 * `readonly ['tabular-nums']`，而 RN 的 TextStyle 要的是可变的 `FontVariant[]`。
 */
const MONTH_TEXT: TextStyle = { fontWeight: '500', fontVariant: ['tabular-nums'] };

/**
 * 月轮上的一枚月号。
 *
 * ★ 它必须**反向自转**，这是这一层唯一的技术要点。
 *
 * 数字的位置必须跟着盘走 —— 不然盘转到哪儿，读到的都是错月。
 * 但位置一跟着转，字面就跟着转：转到下半圈就成了倒立的字，
 * 而这正是硬性约定「正立文字不能放旋转层」要挡住的事。
 *
 * 解法是让每枚数字绕**自己的中心**转 −rotation：位置随盘、字面永远朝上，
 * 像罗盘刻度圈上的数字。
 *
 * 十二枚各持一份 animated style 是刻意的：这份样式只含一个 rotate，
 * 全程在 UI 线程求值，JS 线程一次都不参与。
 * 换成「把 12 个角度算好再 setState」会在拖动时退化成 60fps 的 setState 洪水 ——
 * 而拖动恰恰是这个盘最需要顺畅的交互。
 */
function MonthLabel({
  x,
  y,
  text,
  opacity,
  spin,
}: {
  /** 数字中心在盘坐标里的位置（父层未旋转时） */
  x: number;
  y: number;
  text: string;
  opacity: number;
  spin: SharedValue<number>;
}) {
  const upright = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-spin.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x - MONTH_CELL_W / 2,
          top: y - MONTH_CELL_H / 2,
          width: MONTH_CELL_W,
          height: MONTH_CELL_H,
          alignItems: 'center',
          justifyContent: 'center',
        },
        upright,
      ]}>
      <Label tone="ink2" style={[MONTH_TEXT, { opacity }]}>
        {text}
      </Label>
    </Animated.View>
  );
}

/* ------------------------------------------------------------ 盘 */

export interface SkyDialProps {
  /** 上得了盘的条目（已滤掉过期与一年之外的），按天数升序 */
  occurrences: Occurrence[];
  eventById: Map<string, Anniversary>;
  today: DateParts;
  /** 正方形边长 */
  size: number;
  /** 点圆心看详情 */
  onOpen?: (id: string) => void;
}

export default function SkyDial({ occurrences, eventById, today, size, onOpen }: SkyDialProps) {
  const styles = useStyles();

  const c = size / 2;
  const ringR = c - 24;

  /** 每个条目的环上角度。今天 = 0°，一年 = 360° */
  const angles = useMemo(
    () => occurrences.map((o) => (o.days / DIAL_HORIZON_DAYS) * 360),
    [occurrences],
  );

  /*
   * 十二个月首落在环上的角度。它有两个用处：
   *
   *   一、切时间光带 —— 段与段的接缝就落在这一十二条边上，
   *       圆心换月与环上的明暗台阶因此同步；
   *   二、给月轮定位 —— 每段的段中各落一个公历月号，见下面的 monthLabels。
   *
   * 这里曾经还画过十二道月份刻度，后来撤了：光带已经画出十二段，
   * 再压一层灰线是把同一件事说两遍。但撤掉之后环上读不出「这是几月」——
   * 分段的**边界**在，**归属**没了。所以这一版把月号补回来：
   * 补的是一个数（信息），不是又一层刻线，与「不说两遍」并不冲突。
   * 环上真正稀缺的仍然是分至 —— 那是天地的时间，不随用户的日子走。
   */
  const monthTicks = useMemo(() => dialMonthTicks(today, DIAL_HORIZON_DAYS), [today]);

  const bands = useMemo(() => bandSegments(monthTicks), [monthTicks]);

  /* 月轮：光带十二段的段中，各落一个公历月号 */
  const monthLabels = useMemo(() => monthMarks(bands, today.m), [bands, today.m]);

  /* 盘面纵深。三层实心圆近似径向渐变 —— react-native-svg 的原生渐变比实心圆贵，不值 */
  const stars = useMemo(() => makeStars(ringR, size), [ringR, size]);

  /* 分至点刻。天地的时间，不随用户的日子走 */
  const termMarks = useMemo(
    () =>
      nextSolarTerms(today, DIAL_HORIZON_DAYS).map((t) => ({
        name: t.name,
        days: t.days,
        deg: (t.days / DIAL_HORIZON_DAYS) * 360,
      })),
    [today],
  );

  /* ---------------------------------------------------------- 共享值 */

  const rotation = useSharedValue(0);
  const prevAngle = useSharedValue(0);
  const anglesSV = useSharedValue<number[]>([]);
  const lastIdx = useSharedValue(-1);
  const sweep = useSharedValue(0);
  const breath = useSharedValue(0);
  const [focusIndex, setFocusIndex] = useState(0);
  /** 每次「落定」（松手吸附、点击跳转）自增一次，用来重放扫弧动画 */
  const [sweepTick, setSweepTick] = useState(0);

  /*
   * 触感是转盘好不好用的分水岭：没有它，快速拖动时手感是「虚」的，
   * 用户不知道自己是不是已经越过了某枚光点。这里给两种，强度分开：
   *
   *   selection —— 焦点换人。轻到几乎察觉不到，但连续拖过几枚就成了一条节奏
   *   Light     —— 落定（松手吸附 / 点击跳转）。稍重一点，标记「这一次转完了」
   *
   * 都带 catch：桌面/Web 上无触感硬件，不能让一条 haptic 失败把交互带崩。
   */
  const onFocusChange = useCallback((i: number) => {
    setFocusIndex(i);
    void Haptics.selectionAsync().catch(() => {});
  }, []);

  const replaySweep = useCallback(() => {
    setSweepTick((t) => t + 1);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  useEffect(() => {
    anglesSV.value = angles;
    lastIdx.value = -1;
  }, [angles, anglesSV, lastIdx]);

  // 焦点跟着盘走：转到谁底下谁就是焦点。
  // 用 lastIdx 拦一道 —— 拖动时每帧都会跑这段，不判重的话
  // runOnJS 会以 60fps 往 JS 线程扔 setState。
  useAnimatedReaction(
    () => rotation.value,
    (r) => {
      const list = anglesSV.value;
      if (list.length === 0) return;
      let bestI = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < list.length; i += 1) {
        const rendered = norm360(list[i] + r);
        const d = rendered < 180 ? rendered : 360 - rendered;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      if (bestI !== lastIdx.value) {
        lastIdx.value = bestI;
        runOnJS(onFocusChange)(bestI);
      }
    },
    // onFocusChange 是空依赖的 useCallback，引用稳定；显式声明是为了
    // 让「worklet 里跨线程调的是哪个函数」有据可查，而不是靠读闭包猜
    [onFocusChange],
  );

  /*
   * 焦点索引要防越界：条目被删掉后 occurrences 会变短，
   * 而 focusIndex 还停在旧位置上，不夹一下圆心会显示成「盘是空的」。
   */
  const safeIndex = occurrences.length === 0 ? -1 : Math.min(focusIndex, occurrences.length - 1);
  const focused = safeIndex >= 0 ? occurrences[safeIndex] : null;
  const focusedAngle = safeIndex >= 0 ? angles[safeIndex] : 0;
  const focusedEvent = focused ? eventById.get(focused.id) : undefined;
  const hasFocus = safeIndex >= 0;

  /* 金弧：从「今天」（环上 0°）扫到焦点 */
  const arcLen = ringR * Math.abs(focusedAngle) * (Math.PI / 180);

  /*
   * 扫弧只在「落定」时重放，不在拖动的每一帧重放。
   *
   * 之前把 arcLen 放进依赖里，结果是拖动时每换一次焦点就重启一次 800ms 扫弧，
   * 整条弧一直在闪。现在拖动期间 sweep 恒为 1（弧直接跟着指尖长），
   * 只有松手吸附与点击跳转才把它归零重扫。
   */
  useEffect(() => {
    sweep.value = 0;
    if (arcLen < 1) return;
    sweep.value = withTiming(1, { duration: Motion.dial, easing: Easing.out(Easing.cubic) });
    // 刻意不依赖 arcLen：见上
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweepTick, sweep]);

  const arcProps = useAnimatedProps(
    () => ({ strokeDashoffset: arcLen * (1 - sweep.value) }),
    [arcLen],
  );

  /*
   * 焦点呼吸。依赖刻意用 `hasFocus` 布尔而不是 `focused` 对象：
   * 拖动经过一枚枚光点时焦点会连续换人，若跟着重启，呼吸会变成抽搐。
   * 只在「有焦点 ↔ 没焦点」这一件事上开关。
   */
  useEffect(() => {
    if (!hasFocus) {
      cancelAnimation(breath);
      breath.value = 0;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_DURATION, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [hasFocus, breath]);

  const breathProps = useAnimatedProps(() => ({
    opacity: BREATH_MIN + BREATH_RANGE * breath.value,
  }));

  /* ---------------------------------------------------------- 手势 */

  const pan = Gesture.Pan()
    .onStart((e) => {
      prevAngle.value = Math.atan2(e.y - c, e.x - c);
    })
    .onUpdate((e) => {
      const a = Math.atan2(e.y - c, e.x - c);
      // 逐帧累加增量，而不是拿「当前 − 起点」：后者在拖过 180° 时会翻符号，
      // 转一整圈就变成了来回抽搐。增量式连转三圈也顺。
      let delta = ((a - prevAngle.value) * 180) / Math.PI;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      prevAngle.value = a;
      rotation.value += delta;
    })
    .onEnd(() => {
      const list = anglesSV.value;
      if (list.length === 0) return;
      let bestT = rotation.value;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < list.length; i += 1) {
        // 要把第 i 个点转到指针下，需要 -angle；再选「离当前最近的那一圈」
        let t = -list[i];
        t += 360 * Math.round((rotation.value - t) / 360);
        const d = Math.abs(t - rotation.value);
        if (d < bestD) {
          bestD = d;
          bestT = t;
        }
      }
      rotation.value = withTiming(bestT, {
        duration: Motion.base,
        easing: Easing.out(Easing.cubic),
      });
      runOnJS(replaySweep)();
    });

  const tap = Gesture.Tap().onEnd((e) => {
    const list = anglesSV.value;
    if (list.length === 0) return;
    const hit = norm360((Math.atan2(e.y - c, e.x - c) * 180) / Math.PI + 90);
    let bestI = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < list.length; i += 1) {
      const rendered = norm360(list[i] + rotation.value);
      const raw = Math.abs(rendered - hit);
      const d = raw < 180 ? raw : 360 - raw;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    let t = -list[bestI];
    t += 360 * Math.round((rotation.value - t) / 360);
    rotation.value = withTiming(t, { duration: Motion.base, easing: Easing.out(Easing.cubic) });
    runOnJS(replaySweep)();
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  /* ---------------------------------------------------------- 圆心 */

  const centerTone = focused ? countToneOf(focused.days) : 'future';
  const centerLabel = focused
    ? focused.days === 0
      ? '今天'
      : describeDays(focused.days).replace(/(\d+) 天后/, '$1').replace(/(\d+) 天前/, '$1')
    : '';

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={StyleSheet.absoluteFill}>
          {/* 静止层：盘面纵深 + 星野。转的是刻度，不是天 */}
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            {[Palette.dialBed1, Palette.dialBed2, Palette.dialBed3].map((fill, i) => (
              <Circle key={`bed-${i}`} cx={c} cy={c} r={BED_RATIOS[i] * ringR} fill={fill} />
            ))}
            {stars.map((s, i) => (
              <Circle
                key={`star-${i}`}
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill={Palette.ink}
                opacity={s.o}
              />
            ))}
          </Svg>

          <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
            <Svg width={size} height={size}>
              {/* 时间光带：外环本身就是十二段弧，越远越暗 */}
              {bands.map((b, i) => (
                <Path
                  key={`band-${i}`}
                  d={arcPath(c, c, ringR, b.from, b.to)}
                  stroke={Palette.brand}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  fill="none"
                  opacity={b.opacity}
                />
              ))}

              {/* 分至点刻：四道金刻，标的是天地的时间 */}
              {termMarks.map((t) => (
                <Path
                  key={`term-${t.name}`}
                  d={tickPath(c, c, ringR, ringR - 13, t.deg)}
                  stroke={Palette.brand}
                  strokeWidth={1.2}
                  opacity={0.55}
                />
              ))}
              {/* 今天那道刻度：它随盘转走，告诉你盘转了多少 */}
              {(() => {
                const dot = polar(c, c, ringR + 7, 0);
                return (
                  <>
                    <Path
                      d={tickPath(c, c, ringR + 4, ringR - 11, 0)}
                      stroke={Palette.brand}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                    <Circle cx={dot.x} cy={dot.y} r={2.2} fill={Palette.brand} />
                  </>
                );
              })()}

              {/* 金弧 */}
              {arcLen >= 1 ? (
                <AnimatedPath
                  d={arcPath(c, c, ringR, 0, focusedAngle)}
                  stroke={Palette.brand}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={[arcLen, arcLen]}
                  animatedProps={arcProps}
                />
              ) : null}

              {/* 光点：辉光在下，本体的星在上 */}
              {occurrences.map((o, i) => {
                const p = polar(c, c, ringR, angles[i]);
                const ev = eventById.get(o.id);
                const pinned = ev?.pinned ?? false;
                return (
                  <DialDot
                    key={o.id}
                    cx={p.x}
                    cy={p.y}
                    r={pinned ? 5 : 3.4}
                    fill={Palette[TONE_TOKEN[ev?.tone ?? 'brand']]}
                    opacity={dialBrightness(o.days)}
                    // 30 枚以上就不再逐个错开，否则要等一秒多才亮完
                    delay={occurrences.length <= 30 ? i * Motion.stagger : 0}
                  />
                );
              })}

              {/* 焦点：双环定形 + 最外一环缓慢呼吸 */}
              {focused ? (
                (() => {
                  const p = polar(c, c, ringR, focusedAngle);
                  return (
                    <>
                      <Circle
                        cx={p.x}
                        cy={p.y}
                        r={10}
                        stroke={Palette.brand}
                        strokeWidth={1.4}
                        fill="none"
                        opacity={0.9}
                      />
                      <Circle
                        cx={p.x}
                        cy={p.y}
                        r={16}
                        stroke={Palette.brand}
                        strokeWidth={1}
                        fill="none"
                        opacity={0.26}
                      />
                      <AnimatedCircle
                        cx={p.x}
                        cy={p.y}
                        r={22}
                        stroke={Palette.brand}
                        strokeWidth={0.8}
                        fill="none"
                        animatedProps={breathProps}
                      />
                    </>
                  );
                })()
              ) : null}
            </Svg>

            {/*
              月轮：十二个月号。
              它**必须在旋转层内部** —— 月号标的是盘上的位置，盘转它就得跟着转，
              否则读到的永远是错月。能不能读得出来，交给 MonthLabel 的反向自转。
              pointerEvents="none"：这一层只负责显示，手势照旧归下面那个 Svg。
            */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {monthLabels.map((m) => {
                const p = polar(c, c, ringR - MONTH_LABEL_INSET, m.deg);
                return (
                  <MonthLabel
                    key={m.label}
                    x={p.x}
                    y={p.y}
                    text={m.label}
                    opacity={m.opacity}
                    spin={rotation}
                  />
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* 指针：固定 12 点，不随盘转 */}
      <View style={styles.pointer} pointerEvents="none" />

      {/* 圆心：倒计时不旋转，永远正面朝上 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={focused ? `查看「${focusedEvent?.name ?? ''}」详情` : '星盘'}
        disabled={!focused || !onOpen}
        onPress={() => focused && onOpen?.(focused.id)}
        style={[styles.center, { width: (ringR - 22) * 2, height: (ringR - 22) * 2 }]}>
        {focused ? (
          <>
            <ItemText numberOfLines={1} style={styles.centerName}>
              {focusedEvent?.name ?? ''}
            </ItemText>

            <View style={styles.centerCount}>
              <Meta color={StatusTones[centerTone].fg} style={styles.centerValue}>
                {centerLabel}
              </Meta>
              {focused.days !== 0 ? (
                <Label tone="ink3" style={styles.centerUnit}>
                  天后
                </Label>
              ) : null}
            </View>

            <Meta tone="ink3" style={styles.centerMeta} numberOfLines={1}>
              {formatMDWeek(focused.date)}
            </Meta>
            {focused.lunar ? (
              <Label tone="ink3" style={styles.centerLunar} numberOfLines={1}>
                农历{formatLunar(focused.lunar)}
              </Label>
            ) : null}
            {focused.ordinal != null && focused.ordinal > 0 ? (
              <Label color={Palette.brand} style={styles.centerOrdinal}>
                第 {focused.ordinal} 周年
              </Label>
            ) : null}
          </>
        ) : (
          <View style={styles.centerEmpty}>
            <Ionicons name="moon-outline" size={22} color={Palette.ink4} />
            <Meta tone="ink3" style={styles.centerEmptyText}>
              还没有记下任何日子
            </Meta>
            <Label tone="ink4">点下方 ＋ 记一笔</Label>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((Palette) => ({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  pointer: {
    position: 'absolute',
    top: 2,
    left: '50%',
    marginLeft: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Palette.brand,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  centerName: { textAlign: 'center', fontSize: 17 },
  centerCount: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  centerValue: { ...(Type.countdown as object), fontSize: 46, lineHeight: 52 },
  centerUnit: { fontSize: 13 },
  centerMeta: { textAlign: 'center' },
  centerLunar: { textAlign: 'center', fontSize: 11.5, letterSpacing: 0.6 },
  centerOrdinal: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
  centerEmpty: { alignItems: 'center', gap: 6 },
  centerEmptyText: { textAlign: 'center' },
}));
