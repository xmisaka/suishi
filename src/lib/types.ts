/**
 * 岁时 · 领域类型
 *
 * 一条纪念日的「原始事实」与「解析结果」是两种东西，这里刻意分开：
 *   - `Anniversary` 是存进库的原始事实（用哪个历法、锚在哪天、怎么重复）
 *   - `Occurrence` 是运行时算出来的「下一次是哪一天、距今几天」
 *
 * 后者永不落库。原因见 db/schema.ts 的文件头：农历一旦公历化就逐年失真。
 */

/** 历法 */
export type CalendarSystem = 'solar' | 'lunar';

/** 周期规则 */
export type RepeatRule = 'once' | 'yearly' | 'monthly' | 'weekly';

/** 标记色。存语义键而非色值 —— 存色值换肤后会花 */
export type EventTone = 'brand' | 'sage' | 'amber' | 'clay';

/**
 * 公历日期片段。刻意不用 `Date`：
 * 它带时区、带本地化，还是可变对象；跨月跨年的加减容易踩到夏令时。
 * 这里用纯数字三元组，配合 date.ts 的序数换算做运算。
 */
export interface DateParts {
  y: number;
  /** 1–12 */
  m: number;
  /** 1–31 */
  d: number;
}

/** 农历日期片段。`leap` 只在闰月时为 true */
export interface LunarParts {
  y: number;
  m: number;
  d: number;
  leap: boolean;
}

/** 库里的一行纪念日 */
export interface Anniversary {
  id: string;
  name: string;
  calendar: CalendarSystem;
  repeat: RepeatRule;
  /**
   * 锚点的年。`once` 必填；周期条目可空（用户往往只记得月日）。
   * 有值时用来算「第几周年」。
   */
  year: number | null;
  /** 公历为 1–12；农历为 1–12（闰月由 leap 标） */
  month: number;
  day: number;
  /** 农历专用：是否闰月 */
  leap: boolean;
  /** 仅 `weekly` 用：1=周一 … 7=周日 */
  weekday: number | null;
  tone: EventTone;
  pinned: boolean;
  note: string | null;
  /** 提前几天提醒。功能未启用，先留位 */
  remindDays: number | null;
  sortOrder: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** 新建/编辑时的草稿，字段与 Anniversary 对齐但无 id 与时间戳 */
export type AnniversaryDraft = Omit<
  Anniversary,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'sortOrder'
>;

/**
 * 解析结果：这条纪念日「下一次」落在哪一天。
 *
 * `days` 为负表示这次已经过去（一次性条目过完了，或周期条目在往回看），
 * 由调用方决定要不要展示 —— 圆盘只画 0 到 366 的，列表可以全画。
 */
export interface Occurrence {
  /** 对应 Anniversary.id */
  id: string;
  /** 这一次的公历日期 */
  date: DateParts;
  /** 这次对应的农历日期；公历条目也有值（反查出来的），供展示「农历八月十五」 */
  lunar: LunarParts | null;
  /** 距今天数。0 = 今天，正 = 未来，负 = 已过去 */
  days: number;
  /** 周年数。`once` 或锚点无年时为 null */
  ordinal: number | null;
  /** 一次性条目且已过完 —— 圆盘应当跳过它 */
  expired: boolean;
}
