/**
 * 岁时 · 数据库连接与初始化
 *
 * 单例；首次打开时建表、写 meta。没有 seed —— 岁时不预置任何纪念日，
 * 一张空白星盘就是它的初始状态。
 * 所有 SQL 只在本文件与各 repository 内出现，页面层不得直接访问 db。
 */

import * as SQLite from 'expo-sqlite';

import { CREATE_INDEXES, CREATE_META, CREATE_TABLES, DB_NAME, PRAGMAS, SCHEMA_VERSION } from './schema';

export type Database = SQLite.SQLiteDatabase;

let dbPromise: Promise<Database> | null = null;

/** 获取数据库单例；并发调用只会打开一次 */
export function getDatabase(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = open();
  }
  return dbPromise;
}

async function open(): Promise<Database> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);

  for (const pragma of PRAGMAS) {
    await db.execAsync(pragma);
  }

  await db.execAsync(CREATE_META);
  await db.execAsync(CREATE_TABLES);

  const version = await readMeta(db, 'schema_version');
  if (version === null) {
    // 新库：建表脚本已是最新结构，无需迁移，直接打上当前版本号
    await writeMeta(db, 'schema_version', String(SCHEMA_VERSION));
  } else {
    const from = Number(version);
    if (Number.isFinite(from) && from < SCHEMA_VERSION) {
      await migrate(db, from);
    }
  }

  // 索引必须在迁移之后建 —— 新索引可能引用本版本才补上的列
  await db.execAsync(CREATE_INDEXES);

  return db;
}

/* ------------------------------------------------------------ 迁移 */

interface Migration {
  /** 目标版本；执行成功后把 meta.schema_version 写成它 */
  to: number;
  run: (db: Database) => Promise<void>;
}

/**
 * 逐版本迁移，从 meta 里记的版本往上一档一档跑。
 *
 * 约定：**每一步都必须幂等**。中断后下次重开要能接着跑而不报错，
 * 所以判列先于加列，不用 try/catch 兜。
 *
 * 目前为空 —— v1 是初版结构。
 */
const MIGRATIONS: Migration[] = [];

async function hasColumn(db: Database, table: string, column: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

async function migrate(db: Database, from: number): Promise<void> {
  for (const step of MIGRATIONS) {
    if (step.to <= from) continue;
    await step.run(db);
    await writeMeta(db, 'schema_version', String(step.to));
  }
}

/* ------------------------------------------------------------ meta */

export async function readMeta(db: Database, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function writeMeta(db: Database, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

/* ------------------------------------------------------------ 生命周期 */

/**
 * 擦除所有纪念日（软删除记录一并清掉）。
 * 「清空全部」用它是**硬删**：用户点了确认，就该真的空。
 */
export async function wipeAll(db: Database): Promise<void> {
  await db.execAsync('DELETE FROM events');
}

/** 仅供测试/调试：关闭连接 */
export async function closeDatabase(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.closeAsync();
  dbPromise = null;
}
