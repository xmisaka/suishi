/**
 * 岁时 · 数据库结构
 *
 * 一张主表 `events`，加一张 `meta`。主键 TEXT UUID，时间戳统一 INTEGER（毫秒）。
 *
 * 历法与周期的存储约定（**本项目最容易出错的地方，改动前先读完**）：
 *
 *   calendar = 'solar' 时
 *     once    : anchor_year/month/day 记具体那一天
 *     yearly  : anchor_month/day      记月日（2 月 29 日在非闰年由解析层钳到 28）
 *     monthly : anchor_day            记日（31 日在小月由解析层钳到月末）
 *     weekly  : anchor_weekday        记星期（1=周一 … 7=周日）
 *
 *   calendar = 'lunar' 时
 *     同上，但数值是**农历的月与日**，另用 is_leap_month 标记闰月。
 *
 * 为什么不把农历换算成公历存下来：农历八月十五对应哪一天每隔几年就会变。
 * 一旦只存公历，等于把「农历八月十五」这个事实降级成某一年的一次快照，
 * 明年就错了。所以这里存的是原始农历值，换算结果只在运行时算。
 */

export const DB_NAME = 'suishi.db';

/** schema 版本号；递增时需在 db/index.ts 的 MIGRATIONS 里补对应步骤 */
export const SCHEMA_VERSION = 1;

export const PRAGMAS = [
  'PRAGMA journal_mode = WAL;',
  'PRAGMA foreign_keys = ON;',
  'PRAGMA synchronous = NORMAL;',
];

export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS events (
  id             TEXT    PRIMARY KEY NOT NULL,
  name           TEXT    NOT NULL,
  -- 'solar' | 'lunar'
  calendar       TEXT    NOT NULL DEFAULT 'solar',
  -- 'once' | 'yearly' | 'monthly' | 'weekly'
  repeat_rule    TEXT    NOT NULL DEFAULT 'yearly',
  -- 锚点。语义随 repeat_rule 变化，见文件头注释
  anchor_year    INTEGER,
  anchor_month   INTEGER,
  anchor_day     INTEGER,
  anchor_weekday INTEGER,
  -- 农历专用：是否为闰月。公历条目恒为 0
  is_leap_month  INTEGER NOT NULL DEFAULT 0,
  -- 展示用标记色，存语义键而非色值，换肤时才不会花
  tone           TEXT    NOT NULL DEFAULT 'brand',
  pinned         INTEGER NOT NULL DEFAULT 0,
  note           TEXT,
  -- 提前几天提醒。功能未启用，先留列，避免以后加功能要迁移
  remind_days    INTEGER,
  sort_order     INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER
);
`;

/**
 * 索引单独一段，**必须在迁移之后执行**。
 * 原因：老库升级时 `CREATE TABLE IF NOT EXISTS` 什么都不做，
 * 若索引写在上面的脚本里、引用了本版本才新增的列，整个建表脚本会当场报
 * "no such column" 而打不开数据库。
 */
export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_events_deleted ON events (deleted_at);
CREATE INDEX IF NOT EXISTS idx_events_pinned  ON events (pinned, sort_order);
CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);
`;

/** 元信息表：记录 schema 版本与用户偏好，供后续迁移判断 */
export const CREATE_META = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;
