/**
 * 岁时 · 界面偏好
 *
 * 借 meta 表存 UI 偏好，键统一加 `ui.` 前缀，与 schema_version 这类系统键分开。
 * 纯本地应用，没有账号也没有云端配置，偏好跟着数据库一起走：
 * 导出备份不会带上它们，恢复出厂会连偏好一起清掉 —— 这是刻意的，
 * 偏好属于「这台设备上怎么看」，不属于「我的数据」。
 */

import { getDatabase, readMeta, writeMeta } from './index';

const PREFIX = 'ui.';

/** 主题，值为 ThemeKey（四套平权，用户选哪套就是哪套，不跟随系统） */
export const PREF_THEME = 'theme';

/** 首页圆盘的聚焦条目 id；重启后还能停在上次看的那天 */
export const PREF_DIAL_FOCUS = 'dial.focus';

/**
 * 上次导出备份的时刻（毫秒）。没有这个键 = 从未备份过。
 *
 * 它属于偏好而不是数据：备份文件本身不携带它（那是「这台设备上什么时候做过一次备份」，
 * 不是「我的日子」）。所以换机还原后这个值会是空的 —— 正确，
 * 因为新设备确实还没备份过。
 */
export const PREF_BACKUP_AT = 'backup.lastExportAt';

export async function readPref(key: string): Promise<string | null> {
  const db = await getDatabase();
  return readMeta(db, PREFIX + key);
}

export async function writePref(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await writeMeta(db, PREFIX + key, value);
}

export async function clearPref(key: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM meta WHERE key = ?', PREFIX + key);
}
