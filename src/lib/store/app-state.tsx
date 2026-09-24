/**
 * 岁时 · 应用状态
 *
 * 一张星盘要同时被首页（圆盘）、列表页、我的页读到，所以数据放在这里统一持有。
 * 刻意不上 redux/zustand：这个应用的状态就是「一列纪念日 + 今天」，
 * 派生出来的落点全是纯函数算的，多一层库只是多一层要读的代码。
 *
 * 「今天」单独提出来做成 state 而不是每次现取 ——
 * 应用常年挂后台，跨过零点再回到前台时，星盘必须跟着翻页。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { resolveAll, sortByDays } from '../calendar/resolve';
import type { MergePlan } from '../backup';
import {
  applyImport,
  createEvent,
  deleteEvent,
  listEvents,
  purgeEvent,
  replaceAllEvents,
  restoreEvent,
  setPinned,
  updateEvent,
} from '../db/events';
import { todayParts } from '../date';
import type { Anniversary, AnniversaryDraft, DateParts, Occurrence } from '../types';

/** 一次导入的结果。三个数之和 = 备份里的条目数 */
export interface ImportSummary {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface AppStateValue {
  /** 在册条目，顺序即列表展示顺序 */
  events: Anniversary[];
  /** 与 events 一一对应的解析结果（可能少于 events，无解的会被丢掉），按天数升序 */
  occurrences: Occurrence[];
  eventById: Map<string, Anniversary>;
  occurrenceById: Map<string, Occurrence>;
  /** 今天。跨零点回到前台会自动更新 */
  today: DateParts;
  loading: boolean;
  error: Error | null;

  refresh: () => Promise<void>;
  create: (draft: AnniversaryDraft) => Promise<Anniversary>;
  update: (id: string, draft: AnniversaryDraft) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  /**
   * 合并导入。计划由 `planMerge`（纯函数）算好再传进来 ——
   * 这里只负责落盘与刷新，不参与「谁该覆盖谁」的判断。
   */
  importBackup: (plan: MergePlan) => Promise<ImportSummary>;
  /** 替换导入：清空后整体写入。不可撤销，调用方必须先拿到确认 */
  replaceAll: (next: Anniversary[]) => Promise<number>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<Anniversary[]>([]);
  const [today, setToday] = useState<DateParts>(todayParts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const rows = await listEvents();
      if (aliveRef.current) {
        setEvents(rows);
        setError(null);
      }
    } catch (err: unknown) {
      if (aliveRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    // `load` 是 async 函数，它内部所有 setState 都在 await 之后；
    // react-hooks 的 set-state-in-effect 不穿透 async 边界，这条是误报。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  // 回到前台时对齐「今天」。跨零点是最容易被忽略的边界：
  // 用户在 23:59 锁屏、次日 8:00 打开，星盘上的「今天」还停在昨天。
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const now = todayParts();
      setToday((prev) =>
        prev.y === now.y && prev.m === now.m && prev.d === now.d ? prev : now,
      );
    });
    return () => sub.remove();
  }, []);

  /** 落点全部在这里算一次，各页面拿现成的 —— 圆盘与列表不会算出两个答案 */
  const occurrences = useMemo(() => sortByDays(resolveAll(events, today)), [events, today]);

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const occurrenceById = useMemo(() => new Map(occurrences.map((o) => [o.id, o])), [occurrences]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const create = useCallback(
    async (draft: AnniversaryDraft) => {
      const created = await createEvent(draft);
      await load();
      return created;
    },
    [load],
  );

  const update = useCallback(
    async (id: string, draft: AnniversaryDraft) => {
      await updateEvent(id, draft);
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteEvent(id);
      await load();
    },
    [load],
  );

  const restore = useCallback(
    async (id: string) => {
      await restoreEvent(id);
      await load();
    },
    [load],
  );

  const purge = useCallback(
    async (id: string) => {
      await purgeEvent(id);
      await load();
    },
    [load],
  );

  const togglePin = useCallback(
    async (id: string) => {
      const target = events.find((e) => e.id === id);
      if (!target) return;
      // 先改本地再落盘：置顶是个手感操作，等 IO 回来才动会有明显延迟
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e)),
      );
      try {
        await setPinned(id, !target.pinned);
      } finally {
        await load();
      }
    },
    [events, load],
  );

  const importBackup = useCallback(
    async (plan: MergePlan): Promise<ImportSummary> => {
      await applyImport(plan);
      await load();
      return {
        inserted: plan.insert.length,
        updated: plan.update.length,
        skipped: plan.skip.length,
      };
    },
    [load],
  );

  const replaceAll = useCallback(
    async (next: Anniversary[]): Promise<number> => {
      await replaceAllEvents(next);
      await load();
      return next.length;
    },
    [load],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      events,
      occurrences,
      eventById,
      occurrenceById,
      today,
      loading,
      error,
      refresh,
      create,
      update,
      remove,
      restore,
      purge,
      togglePin,
      importBackup,
      replaceAll,
    }),
    [
      events,
      occurrences,
      eventById,
      occurrenceById,
      today,
      loading,
      error,
      refresh,
      create,
      update,
      remove,
      restore,
      purge,
      togglePin,
      importBackup,
      replaceAll,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error('useAppState 必须在 AppStateProvider 内使用');
  }
  return ctx;
}
