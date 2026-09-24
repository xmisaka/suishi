/**
 * 岁时 · 备份与恢复
 *
 * 备份文件是一份**领域事实的快照**，不是数据库的转储：
 * 字段名与 `Anniversary` 对齐（camelCase），与「底层存成什么样」解耦 ——
 * 将来换掉 SQLite 或改列名，备份格式不必跟着变。
 * 回收站里的条目也在内（带 `deletedAt`），所以备份是一份完整快照，
 * 换机还原后连「误删待找回」的状态都还在。
 *
 * 本文件**全部是纯函数**：不碰数据库、不碰 React、不读系统时钟
 * （`now` 一律由调用方传入，与 calendar/resolve.ts 同一条纪律）。
 *
 * 导入的是不可信输入，所以逐字段收敛（见 coerce.ts），并且：
 *   - 认 `kind` 才当备份吃，避免把别人的 JSON 灌进来
 *   - 认 `format`，比当前新的直接拒绝 —— 装作读得懂比拒读更危险
 *
 * ── 合并规则 ─────────────────────────────────────────────────
 *
 * 同一条记录（id 相同）比「最后一次被改动的时刻」，留新的那条。
 * 这个时刻取 `updatedAt` 与 `deletedAt` 的较大者 —— 软删只写 `deleted_at`、
 * 不动 `updated_at`，只看 updatedAt 的话，一条刚被删掉的记录
 * 会被一份更旧的备份「复活」。这是本项目最容易踩的一个边界。
 */

import {
  asBool,
  asInt,
  asOptionalInt,
  asRecord,
  asString,
  normalizeCalendar,
  normalizeRepeat,
  normalizeTone,
} from './coerce';
import { pad2 } from './date';
import type { Anniversary } from './types';

/** 备份文件的身份证。导入时先认它 */
export const BACKUP_KIND = 'suishi.backup';

/**
 * 备份格式版本。**与 `SCHEMA_VERSION` 分开**：
 * 一个是「文件长什么样」，一个是「库里长什么样」，演进节奏未必同步
 * （比如只改列名不改备份格式）。
 */
export const BACKUP_FORMAT = 1;

/**
 * 「这份备份是谁导出的」读不出来时的占位。
 *
 * 单独做成常量而不是散在代码里的字面量：页面要拿它判断「该不该加 v 前缀」，
 * 两处各写一个中文串，改一处就会漏一处。
 */
export const UNKNOWN_APP = '未知版本';

/** `Date` 能表示的最大毫秒值。时间戳超出它就是个无效日期，一律当没有 */
const MS_LIMIT = 8.64e15;

/** 锚点年份的合理区间。超出这个范围的年份必是坏数据 */
const YEAR_MIN = 1900;
const YEAR_MAX = 2200;

/* ------------------------------------------------------------ 形状 */

export interface BackupFile {
  kind: string;
  /** 备份格式版本 */
  format: number;
  /** 导出它的 App 版本，仅作展示 */
  app: string;
  /** 导出时刻（毫秒） */
  exportedAt: number;
  /** 条数小计。冗余字段，但让「打开文件先看一眼」不必遍历 events */
  counts: { active: number; deleted: number };
  events: Anniversary[];
}

export interface MergePlan {
  /** 本地没有的，新增 */
  insert: Anniversary[];
  /** 本地有、但备份里的更新，覆盖 */
  update: Anniversary[];
  /** 本地有且不比备份旧，不动 */
  skip: Anniversary[];
}

/* ------------------------------------------------------------ 导出 */

/**
 * 打包。
 *
 * `exportedAt` 与 `counts` 都冗余存进文件里 —— 备份文件是要被人打开看的，
 * 一个只有 events 数组的 JSON，用户得数半天才知道这是哪天的、有多少条。
 */
export function buildBackup(events: Anniversary[], appVersion: string, now: number): BackupFile {
  const active = events.filter((e) => e.deletedAt === null).length;
  return {
    kind: BACKUP_KIND,
    format: BACKUP_FORMAT,
    app: appVersion,
    exportedAt: now,
    counts: { active, deleted: events.length - active },
    events,
  };
}

/** 缩进两格 —— 备份要能被打开看、能被 diff，压成一行省下的那点体积不值 */
export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

/**
 * 备份文件名。
 *
 * 刻意**用纯 ASCII**：这个文件要靠系统分享面板递出去（存文件管理器、发微信），
 * 而中文文件名经 Android FileProvider 到部分接收方会变乱码。
 * 可读性由分享面板的标题和「我的」页里的时间行承担。
 */
export function backupFileName(at: number): string {
  const d = new Date(at);
  return `suishi-${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}.json`;
}

/** `2026年9月23日 15:40`。手写，不用 Intl —— 与 date.ts 同一条纪律 */
export function formatStamp(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '从未备份';
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `2026.09.23`。给「我的」页那种一行放不下几个字的场合 */
export function formatStampShort(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '还没备份过';
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

/* ------------------------------------------------------------ 导入 · 解析 */

export type BackupError = 'empty' | 'not-json' | 'not-suishi' | 'format-too-new' | 'no-events';

/** 给用户看的话。讲清楚「这份文件怎么了」，而不是「解析失败」 */
export const BACKUP_ERROR_TEXT: Record<BackupError, string> = {
  empty: '文件是空的，里面什么都没有。',
  'not-json': '这不是一个 JSON 文件，或者内容被改坏了。请确认选中的是岁时导出的备份。',
  'not-suishi': '这是一份 JSON，但不是岁时导出的备份。',
  'format-too-new': '这份备份来自更新版本的岁时，当前版本读不了。请先把 App 更新一下。',
  'no-events': '文件格式是对的，但里面一条完整的日子都没有。',
};

export type ParseResult =
  | {
      ok: true;
      backup: BackupFile;
      events: Anniversary[];
      /** 被丢掉的条目数 —— 有坏数据时要如实告诉用户，不能悄悄吞掉 */
      malformed: number;
    }
  | { ok: false; error: BackupError };

/**
 * 解析一份备份文本。
 *
 * `now` 是「时间戳缺失时的兜底」，由调用方传入 —— 保持本函数纯粹。
 */
export function parseBackup(text: string, now: number): ParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'not-json' };
  }

  const root = asRecord(raw);
  if (!root) return { ok: false, error: 'not-json' };
  if (root.kind !== BACKUP_KIND) return { ok: false, error: 'not-suishi' };

  const format = asInt(root.format, 0, 9999, BACKUP_FORMAT);
  if (format > BACKUP_FORMAT) return { ok: false, error: 'format-too-new' };

  const list = Array.isArray(root.events) ? root.events : [];
  const byId = new Map<string, Anniversary>();
  let malformed = 0;

  for (const item of list) {
    const event = toEvent(item, now);
    if (!event) {
      malformed += 1;
      continue;
    }
    // 同一份文件里出现重复 id：留改动较新的那条，只算一条
    const prev = byId.get(event.id);
    if (!prev || lastTouched(event) > lastTouched(prev)) byId.set(event.id, event);
  }

  const events = [...byId.values()];
  if (events.length === 0) return { ok: false, error: 'no-events' };

  const active = events.filter((e) => e.deletedAt === null).length;
  return {
    ok: true,
    events,
    malformed,
    backup: {
      kind: BACKUP_KIND,
      format,
      app: asString(root.app) ?? UNKNOWN_APP,
      exportedAt: asInt(root.exportedAt, 0, MS_LIMIT, 0),
      counts: { active, deleted: events.length - active },
      // 与上面 `events` 是同一份（已经过收敛与去重），
      // 放在这里是为了让 BackupFile 这个类型在「读」与「写」两侧都成立
      events,
    },
  };
}

/**
 * 一条记录 → 领域对象；立不住就返回 null。
 *
 * 只有 **id 与名字**缺任何一个才丢整条 —— 没有 id 就无法与本地去重，
 * 没有名字在列表里就是一行空白，这两样立不住的记录留着也是垃圾。
 * 其余字段一律收敛成安全默认值。
 */
function toEvent(raw: unknown, now: number): Anniversary | null {
  const row = asRecord(raw);
  if (!row) return null;

  const id = asString(row.id);
  const name = asString(row.name);
  if (!id || !name) return null;

  const createdAt = asInt(row.createdAt, 0, MS_LIMIT, now);
  // 更新时间缺失时退化成创建时间，而不是「现在」——
  // 退成「现在」会让一份老备份在合并时无条件压过本地数据
  const updatedAt = asInt(row.updatedAt, 0, MS_LIMIT, createdAt);

  return {
    id,
    name,
    calendar: normalizeCalendar(row.calendar),
    repeat: normalizeRepeat(row.repeat),
    year: asOptionalInt(row.year, YEAR_MIN, YEAR_MAX),
    month: asInt(row.month, 1, 12, 1),
    day: asInt(row.day, 1, 31, 1),
    leap: asBool(row.leap),
    weekday: asOptionalInt(row.weekday, 1, 7),
    tone: normalizeTone(row.tone),
    pinned: asBool(row.pinned),
    note: asString(row.note),
    remindDays: asOptionalInt(row.remindDays, -3650, 3650),
    sortOrder: asOptionalInt(row.sortOrder, -100000, 100000),
    createdAt,
    updatedAt,
    deletedAt: asOptionalInt(row.deletedAt, 0, MS_LIMIT),
  };
}

/* ------------------------------------------------------------ 导入 · 合并 */

/**
 * 「这条记录最后一次被改动的时刻」。
 *
 * 取 `updatedAt` 与 `deletedAt` 的较大者。软删只写 `deleted_at`、不动
 * `updated_at`（见 db/events.ts 的 deleteEvent），所以只看 updatedAt 时，
 * 「刚删掉」比「三天前编辑过」还旧 —— 一份更老的备份就能把它复活。
 */
function lastTouched(e: Anniversary): number {
  return Math.max(e.updatedAt, e.deletedAt ?? 0);
}

/**
 * 合并计划。**纯函数**：只算出「该做什么」，不动数据库 ——
 * 这样「重复导入同一份文件是幂等的」这件事可以直接断言，
 * 而不必真的开一个库跑两遍。
 */
export function planMerge(incoming: Anniversary[], existing: Anniversary[]): MergePlan {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const plan: MergePlan = { insert: [], update: [], skip: [] };

  for (const item of incoming) {
    const current = byId.get(item.id);
    if (!current) {
      plan.insert.push(item);
    } else if (lastTouched(item) > lastTouched(current)) {
      plan.update.push(item);
    } else {
      plan.skip.push(item);
    }
  }

  return plan;
}
