/**
 * 岁时 · 设计令牌
 *
 * 结构继承自「格物」，主题集合按「天象」方案重配：
 * **三套深色是主场，一套浅色留给白天。** 星盘只有在墨底上才亮得起来 ——
 * 浅色主题下圆盘会退化成一张统计图，方案 B 的气质就没了。
 *
 * 四条准入规则（改任何一套前先读）：
 *   1. 语义三色是红线 —— sage / amber / clay 永远锁在绿黄红三系，
 *      主题只许微调明度，不许改色相。用户靠色相分辨状态，
 *      一旦品牌色侵占语义区，状态提示就失效了。
 *   2. brand 只管「可点」与「需注意」，不承担状态含义。
 *   3. 对比度是准入条件，不是事后优化。正文 ≥ 4.5，大字 ≥ 3.0。
 *   4. 深色不是浅色取反 —— 卡片要比背景亮才浮得起来，
 *      分隔线要比背景亮才看得见，语义色要整体提亮。
 */

import { Platform } from 'react-native';

/* ------------------------------------------------------------------ 色彩 · 主题名录 */

export type ThemeKey = 'xuanye' | 'cangqing' | 'moyu' | 'sujian';

export type TokenName =
  /* 面 */
  | 'paper'
  | 'canvas'
  | 'surface'
  | 'surface2'
  | 'inset'
  /* 盘面纵深：由外向内递亮的三层。星盘不画渐变（见 SkyDial 注释），
     用三层实心圆近似，这三个就是那三层的色 */
  | 'dialBed1'
  | 'dialBed2'
  | 'dialBed3'
  /* 字 */
  | 'ink'
  | 'ink2'
  | 'ink3'
  | 'ink4'
  /* 线 */
  | 'line'
  | 'line2'
  | 'line3'
  /* 品牌 */
  | 'brand'
  | 'brandDeep'
  | 'brandBg'
  /* 语义 */
  | 'sage'
  | 'sageBg'
  | 'amber'
  | 'amberBg'
  | 'clay'
  | 'clayBg'
  /* 中立 */
  | 'pure'
  | 'onAccent'
  /* 交互态 */
  | 'ripple'
  | 'rippleOnAccent'
  | 'scrim'
  | 'shadow';

export type Tokens = Record<TokenName, string>;

export interface ThemeDef {
  name: string;
  /** 设置页里的一句话说明，讲这套主题的取向 */
  note: string;
  mode: 'light' | 'dark';
  tokens: Tokens;
}

/** 展示顺序即设置页里的顺序 */
export const THEME_KEYS = ['xuanye', 'cangqing', 'moyu', 'sujian'] as const;

/**
 * 缺省主题：玄夜。
 *
 * 这里刻意**不跟随系统深色**（格物是跟随的）。原因：本应用的主界面是一枚星盘，
 * 浅色档下它只是一张统计图；跟随系统会让同一个应用在白天与夜里变成两个东西。
 * 把选择权交给用户，默认停在深色。
 */
export const DEFAULT_THEME_KEY: ThemeKey = 'xuanye';

export const THEMES: Record<ThemeKey, ThemeDef> = {
  xuanye: {
    name: '玄夜',
    note: '墨底暖金，最像旧历书',
    mode: 'dark',
    tokens: {
      paper: '#16140F',
      canvas: '#1C1A15',
      surface: '#242118',
      surface2: '#2A2620',
      inset: '#302C23',
      dialBed1: '#131109',
      dialBed2: '#171410',
      dialBed3: '#1A1711',

      ink: '#F2EBDF',
      ink2: '#B5AA99',
      ink3: '#8A7F6E',
      ink4: '#5E5648',

      line: '#3A352B',
      line2: '#332F26',
      line3: '#2C2821',

      brand: '#C9985C',
      brandDeep: '#E0B47C',
      brandBg: '#3A2F20',

      sage: '#8FA87C',
      sageBg: '#2A3326',
      amber: '#D9A94E',
      amberBg: '#3A3020',
      clay: '#D57C61',
      clayBg: '#3B2822',

      pure: '#FFFFFF',
      /* 暖金品牌色偏亮，上面压白字只有 2.6 —— 必须用深墨，不能沿用浅色档的白 */
      onAccent: '#1C1A15',

      ripple: 'rgba(242,235,223,0.07)',
      rippleOnAccent: 'rgba(28,26,21,0.16)',
      scrim: 'rgba(0,0,0,0.60)',
      shadow: '#000000',
    },
  },

  cangqing: {
    name: '苍青',
    note: '墨蓝月白，夜最浓的一套',
    mode: 'dark',
    tokens: {
      paper: '#0F1419',
      canvas: '#141A20',
      surface: '#1C232B',
      surface2: '#222A33',
      inset: '#28323C',
      dialBed1: '#0C1014',
      dialBed2: '#0F1419',
      dialBed3: '#11171C',

      ink: '#E8EEF4',
      ink2: '#A6B4C2',
      ink3: '#75838F',
      ink4: '#4C5763',

      line: '#2C3742',
      line2: '#27313B',
      line3: '#212A33',

      brand: '#8FB8D8',
      brandDeep: '#B4D2EA',
      brandBg: '#1E2A36',

      sage: '#8FAE9C',
      sageBg: '#1B2A25',
      amber: '#D6B36A',
      amberBg: '#2E2718',
      clay: '#D98A7A',
      clayBg: '#33211E',

      pure: '#FFFFFF',
      onAccent: '#0F1419',

      ripple: 'rgba(232,238,244,0.07)',
      rippleOnAccent: 'rgba(15,20,25,0.18)',
      scrim: 'rgba(0,0,0,0.62)',
      shadow: '#000000',
    },
  },

  moyu: {
    name: '墨玉',
    note: '墨绿玉色，安静得最彻底',
    mode: 'dark',
    tokens: {
      paper: '#0F1512',
      canvas: '#141B17',
      surface: '#1B241F',
      surface2: '#212B26',
      inset: '#27322C',
      dialBed1: '#0C110E',
      dialBed2: '#0F1511',
      dialBed3: '#111813',

      ink: '#E6EFE9',
      ink2: '#A3B5AB',
      ink3: '#728478',
      ink4: '#4A594F',

      line: '#2B3830',
      line2: '#26322B',
      line3: '#202A24',

      brand: '#C8A96B',
      brandDeep: '#DEC28A',
      brandBg: '#2A2A1E',

      sage: '#93B083',
      sageBg: '#1F2A20',
      amber: '#D8B25A',
      amberBg: '#2C2716',
      clay: '#D68A6E',
      clayBg: '#31211C',

      pure: '#FFFFFF',
      onAccent: '#0F1512',

      ripple: 'rgba(230,239,233,0.07)',
      rippleOnAccent: 'rgba(15,21,18,0.18)',
      scrim: 'rgba(0,0,0,0.62)',
      shadow: '#000000',
    },
  },

  sujian: {
    name: '素笺',
    note: '暖米白配赭石棕，给白天的备选',
    mode: 'light',
    tokens: {
      paper: '#F7F4EF',
      canvas: '#FBF9F6',
      surface: '#FFFFFF',
      surface2: '#FDFCFA',
      inset: '#F2EDE5',
      /* 浅色档下盘面是一枚印在纸上的淡色圆，不是一块会发光的盘子：
         最外圈与纸差 8 级、往内收窄到 4 级。三层之间刻意只差 2~4 级 ——
         同等的色差在半径小的圈上更容易读成硬边（弧长短、相邻面积都小），
         所以「外圈敢拉开、内圈必须收住」是这一档的唯一原则。 */
      dialBed1: '#EFE8DD',
      dialBed2: '#F1EBE1',
      dialBed3: '#F3EEE5',

      ink: '#2B241F',
      ink2: '#6B6055',
      ink3: '#9A8D80',
      ink4: '#C9BEB0',

      line: '#E3DCD1',
      line2: '#EBE5DB',
      line3: '#F1ECE4',

      brand: '#8C5A34',
      brandDeep: '#6B4224',
      brandBg: '#F3E9DE',

      sage: '#5F7355',
      sageBg: '#EDF1E9',
      amber: '#926521',
      amberBg: '#FBF1DF',
      clay: '#AA523D',
      clayBg: '#F9EAE5',

      pure: '#FFFFFF',
      onAccent: '#FFFFFF',

      ripple: 'rgba(43,36,31,0.05)',
      rippleOnAccent: 'rgba(255,255,255,0.22)',
      scrim: 'rgba(43,36,31,0.32)',
      shadow: '#2B241F',
    },
  },
};

export function isDarkTheme(key: ThemeKey): boolean {
  return THEMES[key].mode === 'dark';
}

/* ------------------------------------------------------------------ 色彩 · 运行时 */

/**
 * 当前生效的主题。只有 ThemeProvider 有权改它 —— 其它地方一律只读。
 *
 * 为什么用模块级变量而不是 Context：样式的构建发生在 React 渲染之外
 * （`StyleSheet.create` 在 `makeStyles` 里被调用），拿不到 Context。
 * 这个值与 Provider 的 state 在同一个渲染周期内同步推进，
 * 由 Provider 在渲染阶段写入，保证子组件读到的永远是本次渲染对应的主题。
 */
let activeKey: ThemeKey = DEFAULT_THEME_KEY;

/** @internal 仅供 ThemeProvider 调用 */
export function setActiveThemeKey(key: ThemeKey): void {
  activeKey = key;
}

export function getActiveThemeKey(): ThemeKey {
  return activeKey;
}

export function activeTokens(): Tokens {
  return THEMES[activeKey].tokens;
}

/**
 * 渲染期读取当前主题令牌。
 *
 * 这是代理对象：每次属性访问都实时解析当前主题，所以写在 JSX 里的
 * `Palette.brand` 不需要任何改造就能跟随换肤。
 *
 * **但它不建立订阅** —— 组件仍然需要从 `useTheme()` / `useStyles()` 里
 * 拿到订阅关系，否则主题变化时它不会重渲染，读到的新值也没机会上屏。
 *
 * 另注：模块加载期读取（如 `const C = Palette.brand` 这种顶层常量）
 * 会固化成当时的主题，务必避免 —— 这类值应写进 `makeStyles` 回调里。
 */
export const Palette: Tokens = new Proxy({} as Tokens, {
  get: (_target, prop) => (activeTokens() as Record<string | symbol, unknown>)[prop],
  has: (_target, prop) => prop in activeTokens(),
  ownKeys: () => Reflect.ownKeys(activeTokens()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/* ------------------------------------------------------------------ 色彩 · 语义色 */

/**
 * 「距今天数」的四档色调。
 *
 * 注意 today 借的是 brand 而不是语义色 —— 「今天」是焦点不是状态，
 * 语义三色要留给真正的状态判断，不被装饰性使用污染。
 */
export type CountTone = 'today' | 'soon' | 'future' | 'past';

export type StatusTone = {
  fg: string;
  bg: string;
  label: string;
};

const STATUS_LABELS: Record<CountTone, string> = {
  today: '就在今天',
  soon: '就要到了',
  future: '还早',
  past: '已过去',
};

function buildStatusTones(t: Tokens): Record<CountTone, StatusTone> {
  return {
    today: { fg: t.brand, bg: t.brandBg, label: STATUS_LABELS.today },
    soon: { fg: t.amber, bg: t.amberBg, label: STATUS_LABELS.soon },
    future: { fg: t.sage, bg: t.sageBg, label: STATUS_LABELS.future },
    past: { fg: t.ink3, bg: t.inset, label: STATUS_LABELS.past },
  };
}

/* ------------------------------------------------------------------ 色彩 · 阴影 */

export interface ShadowTokens {
  card: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
  raised: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
}

function buildShadow(t: Tokens): ShadowTokens {
  return {
    card: {
      shadowColor: t.shadow,
      shadowOpacity: 0.28,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    raised: {
      shadowColor: t.shadow,
      shadowOpacity: 0.45,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  };
}

/**
 * 按当前主题解析的派生值缓存。
 * 同一个主题内引用保持稳定，换肤时整体替换 —— 这样
 * `...Shadow.card` 展开进样式表时既拿到新主题，又不会每次生成新对象。
 */
function memoByTheme<T>(build: (t: Tokens) => T): () => T {
  let cachedKey: ThemeKey | null = null;
  let cached: T;
  return () => {
    if (cachedKey !== activeKey) {
      cached = build(activeTokens());
      cachedKey = activeKey;
    }
    return cached;
  };
}

const shadowOf = memoByTheme(buildShadow);
const statusTonesOf = memoByTheme(buildStatusTones);

export const Shadow = {
  get card() {
    return shadowOf().card;
  },
  get raised() {
    return shadowOf().raised;
  },
};

export const StatusTones: Record<CountTone, StatusTone> = {
  get today() {
    return statusTonesOf().today;
  },
  get soon() {
    return statusTonesOf().soon;
  },
  get future() {
    return statusTonesOf().future;
  },
  get past() {
    return statusTonesOf().past;
  },
} as Record<CountTone, StatusTone>;

/* ------------------------------------------------------------------ 字体 */

export const Fonts = Platform.select({
  ios: { serif: 'ui-serif', sans: 'system-ui', mono: 'ui-monospace' },
  android: { serif: 'serif', sans: 'sans-serif', mono: 'monospace' },
  default: { serif: 'serif', sans: 'normal', mono: 'monospace' },
})!;

/* ------------------------------------------------------------------ 字级 */

export const Type = {
  /** 页面主标题，衬线。字号收小、字距拉开 —— 标题大多是 2～4 个字，撑不满一行反而空 */
  display: { fontFamily: Fonts.serif, fontSize: 23, lineHeight: 32, letterSpacing: 2 },
  /** 区块标题，衬线 */
  title: { fontFamily: Fonts.serif, fontSize: 20, lineHeight: 28, letterSpacing: 0.5 },
  /** 小标题，无衬线中等 */
  heading: { fontFamily: Fonts.sans, fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  /** 条目名 */
  item: { fontFamily: Fonts.sans, fontSize: 16, fontWeight: '500' as const, lineHeight: 22 },
  /** 正文说明 */
  body: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 22 },
  /** 次级信息 */
  meta: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
  /** 标签 / 角标 */
  label: { fontFamily: Fonts.sans, fontSize: 11.5, lineHeight: 16 },
  /** 全大写小标 */
  eyebrow: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  /** 大号数字，等宽对齐 */
  num: {
    fontFamily: Fonts.sans,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '500' as const,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  /** 中号数字 */
  numSm: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500' as const,
    fontVariant: ['tabular-nums'],
  },
  /** 详情页的大倒计时 */
  countdown: {
    fontFamily: Fonts.sans,
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '500' as const,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  /** 圆盘上的农历日期，衬线 —— 它是圆心唯一用衬线的字，仪式感靠它 */
  lunar: { fontFamily: Fonts.serif, fontSize: 19, lineHeight: 26, letterSpacing: 1.5 },
} as const;

/* ------------------------------------------------------------------ 间距 */

export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** 页面左右统一边距 */
export const GUTTER = 17;

/* ------------------------------------------------------------------ 圆角 */

export const Radius = {
  tag: 6,
  thumb: 9,
  chip: 999,
  input: 11,
  button: 12,
  card: 14,
  sheet: 20,
  phone: 32,
} as const;

/* ------------------------------------------------------------------ 动效 */

export const Motion = {
  fast: 150,
  base: 240,
  /** 圆盘扫弧的时长 —— 比常规慢，进场要有「显影」的仪式感 */
  dial: 800,
  /** 圆点逐个亮起的间隔 */
  stagger: 40,
} as const;

/* ------------------------------------------------------------------ 兼容旧模板 */

/** @deprecated 模板遗留，新代码请使用 Palette */
export const Colors = {
  light: {
    text: '#2B241F',
    background: '#FBF9F6',
    backgroundElement: '#F2EDE5',
    backgroundSelected: '#EBE5DB',
    textSecondary: '#6B6055',
  },
  dark: {
    text: '#F2EBDF',
    background: '#1C1A15',
    backgroundElement: '#302C23',
    backgroundSelected: '#332F26',
    textSecondary: '#B5AA99',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Spacing = Space;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
