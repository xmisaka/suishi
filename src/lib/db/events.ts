/**
 * 岁时 · 纪念日仓储
 *
 * 页面层唯一的出口。**SQL 不出现在本文件之外** —— 页面拿到的永远是
 * `Anniversary` 这个领域对象，不是数据库行。
 *
 * 删除一律软删（写 deleted_at），因为「误删一条重要的日子」这个后果
 * 比多存几行数据的代价大得多。回收站在「我的」页里。
 */

import type { MergePlan } from '../backup';
import { asBool, normalizeCalendar, normalizeRepeat, normalizeTone } from '../coerce';
import { uuid } from '../id';
import type { Anniversary, AnniversaryDraft } from '../types';
import { getDatabase, type Database } from './index';

/* ------------------------------------------------------------ 行映射 */

interface EventRow {
  id: string;
  name: string;
  calendar: string;
  repeat_rule: string;
  anchor_year: number | null;
  anchor_month: number | null;
  anchor_day: number | null;
  anchor_weekday: number | null;
  is_leap_month: number;
  tone: string;
  pinned: number;
  note: string | null;
  remind_days: number | null;
  sort_order: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

const COLUMNS = `id, name, calendar, repeat_rule, anchor_year, anchor_month, anchor_day,
                 anchor_weekday, is_leap_month, tone, pinned, note, remind_days,
                 sort_order, created_at, updated_at, deleted_at`;

/**
 * 数据库行 → 领域对象。
 *
 * 字符串字段一律走白名单收敛，不直接 `as`：库里的值只有本应用写得进去，
 * 但迁移脚本或手改过的库可能带着意外值，与其让它在解析层炸掉，
 * 不如在这里退化成安全默认值。
 *
 * 白名单的**定义**在 lib/coerce.ts，与备份导入共用同一份 ——
 * 两边各写一份的话，迟早会分叉出「库里认、导入不认」这种谁也说不清的 bug。
 */
function toAnniversary(row: EventRow): Anniversary {
  return {
    id: row.id,
    name: row.name,
    calendar: normalizeCalendar(row.calendar),
    repeat: normalizeRepeat(row.repeat_rule),
    year: row.anchor_year,
    month: row.anchor_month ?? 1,
    day: row.anchor_day ?? 1,
    leap: asBool(row.is_leap_month),
    weekday: row.anchor_weekday,
    tone: normalizeTone(row.tone),
    pinned: asBool(row.pinned),
    note: row.note,
    remindDays: row.remind_days,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/* ------------------------------------------------------------ 读 */

/** 全部在册条目。置顶靠前、其次手动序、最后按创建时间 —— 与列表展示顺序一致 */
export async function listEvents(db?: Database): Promise<Anniversary[]> {
  const conn = db ?? (await getDatabase());
  const rows = await conn.getAllAsync<EventRow>(
    `SELECT ${COLUMNS} FROM events
      WHERE deleted_at IS NULL
      ORDER BY pinned DESC, COALESCE(sort_order, 999999) ASC, created_at ASC`,
  );
  return rows.map(toAnniversary);
}

export async function getEvent(id: string, db?: Database): Promise<Anniversary | null> {
  const conn = db ?? (await getDatabase());
  const row = await conn.getFirstAsync<EventRow>(
    `SELECT ${COLUMNS} FROM events WHERE id = ? AND deleted_at IS NULL`,
    id,
  );
  return row ? toAnniversary(row) : null;
}

export async function countEvents(db?: Database): Promise<number> {
  const conn = db ?? (await getDatabase());
  const row = await conn.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM events WHERE deleted_at IS NULL',
  );
  return row?.n ?? 0;
}

/**
 * 含回收站的全部条目 —— **只给备份用**。
 *
 * 备份要的是一份完整快照，所以软删的也在内（带 deletedAt）：
 * 换机还原后，「误删待找回」的状态也应当在。
 * 列表页绝不能用它，否则删掉的东西会原地复活。
 */
export async function listAllEvents(db?: Database): Promise<Anniversary[]> {
  const conn = db ?? (await getDatabase());
  const rows = await conn.getAllAsync<EventRow>(
    `SELECT ${COLUMNS} FROM events
      ORDER BY pinned DESC, COALESCE(sort_order, 999999) ASC, created_at ASC`,
  );
  return rows.map(toAnniversary);
}

/* ------------------------------------------------------------ 写 */

export async function createEvent(draft: AnniversaryDraft, db?: Database): Promise<Anniversary> {
  const conn = db ?? (await getDatabase());
  const now = Date.now();
  const id = uuid();

  await conn.runAsync(
    `INSERT INTO events (id, name, calendar, repeat_rule, anchor_year, anchor_month, anchor_day,
                         anchor_weekday, is_leap_month, tone, pinned, note, remind_days, sort_order,
                         created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
    id,
    draft.name.trim(),
    draft.calendar,
    draft.repeat,
    draft.year,
    draft.month,
    draft.day,
    draft.weekday,
    draft.leap ? 1 : 0,
    draft.tone,
    draft.pinned ? 1 : 0,
    draft.note,
    draft.remindDays,
    now,
    now,
  );

  return { ...draft, id, sortOrder: null, createdAt: now, updatedAt: now, deletedAt: null };
}

export async function updateEvent(
  id: string,
  draft: AnniversaryDraft,
  db?: Database,
): Promise<void> {
  const conn = db ?? (await getDatabase());
  await conn.runAsync(
    `UPDATE events
        SET name = ?, calendar = ?, repeat_rule = ?, anchor_year = ?, anchor_month = ?,
            anchor_day = ?, anchor_weekday = ?, is_leap_month = ?, tone = ?, pinned = ?,
            note = ?, remind_days = ?, updated_at = ?
      WHERE id = ?`,
    draft.name.trim(),
    draft.calendar,
    draft.repeat,
    draft.year,
    draft.month,
    draft.day,
    draft.weekday,
    draft.leap ? 1 : 0,
    draft.tone,
    draft.pinned ? 1 : 0,
    draft.note,
    draft.remindDays,
    Date.now(),
    id,
  );
}

/** 只切置顶，不动其它字段 —— 列表长按菜单用，避免整条回写 */
export async function setPinned(id: string, pinned: boolean, db?: Database): Promise<void> {
  const conn = db ?? (await getDatabase());
  await conn.runAsync(
    'UPDATE events SET pinned = ?, updated_at = ? WHERE id = ?',
    pinned ? 1 : 0,
    Date.now(),
    id,
  );
}

/** 批量写入排序值，用于拖拽排序后一次性落盘 */
export async function saveOrder(ids: string[], db?: Database): Promise<void> {
  const conn = db ?? (await getDatabase());
  const now = Date.now();
  await conn.withTransactionAsync(async () => {
    for (let i = 0; i < ids.length; i += 1) {
      await conn.runAsync(
        'UPDATE events SET sort_order = ?, updated_at = ? WHERE id = ?',
        i,
        now,
        ids[i],
      );
    }
  });
}

/* ------------------------------------------------------------ 删除 */

export async function deleteEvent(id: string, db?: Database): Promise<void> {
  const conn = db ?? (await getDatabase());
  await conn.runAsync('UPDATE events SET deleted_at = ? WHERE id = ?', Date.now(), id);
}

export async function restoreEvent(id: string, db?: Database): Promise<void> {
  const conn = db ?? (await getDatabase());
  await conn.runAsync('UPDATE events SET deleted_at = NULL WHERE id = ?', id);
}

/** 回收站列表，最近删的在前 */
export async function listDeleted(db?: Database): Promise<Anniversary[]> {
  const conn = db ?? (await getDatabase());
  const rows = await conn.getAllAsync<EventRow>(
    `SELECT ${COLUMNS} FROM events WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
  );
  return rows.map(toAnniversary);
}

/** 真删。回收站里「彻底删除」用 */
export async function purgeEvent(id: string, db?: Database): Promise<void> {
  const conn = db ?? (await getDatabase());
  await conn.runAsync('DELETE FROM events WHERE id = ?', id);
}

export async function emptyTrash(db?: Database): Promise<void> {
  const conn = db ?? (await getDatabase());
  await conn.execAsync('DELETE FROM events WHERE deleted_at IS NOT NULL');
}

/* ------------------------------------------------------------ 备份与恢复 */

/**
 * 导入用的写入语句。
 *
 * 走 `ON CONFLICT(id) DO UPDATE` 而不是「先查再决定 insert / update」：
 * 计划（planMerge）已经把该做的算清楚了，但落盘时再查一遍会让
 * 「算出计划」与「执行计划」之间多出一个可以不一致的窗口。
 * 一条语句覆盖两种情况，写进去的就是计划里那份数据。
 *
 * 注意 `created_at` 也在覆盖列里 —— 导入要保留备份里的原始创建时间，
 * 否则还原出来的条目「创建于今天」，按创建时间排的序就全乱了。
 */
const UPSERT_SQL = `
INSERT INTO events (id, name, calendar, repeat_rule, anchor_year, anchor_month, anchor_day,
                    anchor_weekday, is_leap_month, tone, pinned, note, remind_days, sort_order,
                    created_at, updated_at, deleted_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  name           = excluded.name,
  calendar       = excluded.calendar,
  repeat_rule    = excluded.repeat_rule,
  anchor_year    = excluded.anchor_year,
  anchor_month   = excluded.anchor_month,
  anchor_day     = excluded.anchor_day,
  anchor_weekday = excluded.anchor_weekday,
  is_leap_month  = excluded.is_leap_month,
  tone           = excluded.tone,
  pinned         = excluded.pinned,
  note           = excluded.note,
  remind_days    = excluded.remind_days,
  sort_order     = excluded.sort_order,
  created_at     = excluded.created_at,
  updated_at     = excluded.updated_at,
  deleted_at     = excluded.deleted_at`;

/** 领域对象 → 绑定参数。顺序必须与 UPSERT_SQL 的列序严格一致 */
function eventParams(e: Anniversary): (string | number | null)[] {
  return [
    e.id,
    e.name,
    e.calendar,
    e.repeat,
    e.year,
    e.month,
    e.day,
    e.weekday,
    e.leap ? 1 : 0,
    e.tone,
    e.pinned ? 1 : 0,
    e.note,
    e.remindDays,
    e.sortOrder,
    e.createdAt,
    e.updatedAt,
    e.deletedAt,
  ];
}

/**
 * 执行合并计划。
 *
 * **整个导入在一个事务里**：中途失败要么全成、要么全不成。
 * 「一半数据进去了」比「一条都没进去」更糟 —— 后者用户知道重来一遍就行，
 * 前者他无从判断该不该重试。
 */
export async function applyImport(plan: MergePlan, db?: Database): Promise<void> {
  const writes = [...plan.insert, ...plan.update];
  if (writes.length === 0) return;

  const conn = db ?? (await getDatabase());
  await conn.withTransactionAsync(async () => {
    for (const e of writes) {
      await conn.runAsync(UPSERT_SQL, ...eventParams(e));
    }
  });
}

/**
 * 替换模式：清空后整体写入。**不可撤销** —— 调用方必须先拿到用户确认。
 *
 * 不调 `wipeAll`：那个是独立事务，清完再写如果中途炸了，
 * 用户剩下的就是一个空库。这里连清带写一起放进同一个事务。
 */
export async function replaceAllEvents(next: Anniversary[], db?: Database): Promise<void> {
  const conn = db ?? (await getDatabase());
  await conn.withTransactionAsync(async () => {
    await conn.execAsync('DELETE FROM events');
    for (const e of next) {
      await conn.runAsync(UPSERT_SQL, ...eventParams(e));
    }
  });
}
