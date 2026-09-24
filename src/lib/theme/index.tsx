/**
 * 岁时 · 主题运行时
 *
 * 三件事：
 *   1. 解析「该用哪套主题」：用户选的那套直接生效，**不跟随系统深色**
 *   2. 把选择持久化进 meta 表（键加 ui. 前缀，跟其它界面偏好同一套约定）
 *   3. 提供订阅 —— 组件靠 `useTheme()` / `useStyles()` 建立订阅关系
 *
 * 为什么不跟随系统：本应用的主界面是一枚星盘，浅色档下它只是张统计图。
 * 跟随系统会让同一个应用在白天和夜里变成两个东西，方案 B 的气质会被系统设置左右。
 * 把选择权交给用户，默认停在玄夜（见 constants/theme.ts 的 DEFAULT_THEME_KEY）。
 *
 * 为什么组件必须显式订阅：React 的 Context 只会通知「读过它」的组件。
 * 光把 Provider 换掉值，被 `React.memo` 挡住的组件和列表项不会重渲染，
 * 于是新主题到不了屏上。所以取样式这件事必须走 hook。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet } from 'react-native';

import {
  DEFAULT_THEME_KEY,
  THEMES,
  setActiveThemeKey,
  type ThemeDef,
  type ThemeKey,
  type Tokens,
} from '@/constants/theme';
import { PREF_THEME, readPref, writePref } from '@/lib/db/prefs';

export interface ThemeValue {
  /** 当前生效的主题 */
  key: ThemeKey;
  def: ThemeDef;
  tokens: Tokens;
  isDark: boolean;
  /** 切换到另一套主题，并落盘 */
  setKey: (key: ThemeKey) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function isThemeKey(value: string): value is ThemeKey {
  return value in THEMES;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [key, setKeyState] = useState<ThemeKey>(DEFAULT_THEME_KEY);

  // 读回上次的选择。首次启动或读取失败都退回默认，不阻塞渲染。
  useEffect(() => {
    let alive = true;
    void readPref(PREF_THEME)
      .then((saved) => {
        if (alive && saved && isThemeKey(saved)) setKeyState(saved);
      })
      .catch(() => {
        // 数据库还没热起来时静默用默认主题，下一次启动就正常了
      });
    return () => {
      alive = false;
    };
  }, []);

  // 在渲染阶段同步推进全局主题值：样式表是在 React 渲染之外构建的，
  // 必须保证子组件渲染那一刻，模块级 activeKey 已经是本次的主题。
  setActiveThemeKey(key);

  const setKey = useCallback((next: ThemeKey) => {
    setKeyState(next);
    void writePref(PREF_THEME, next).catch(() => {
      // 写失败只影响下次启动的默认值，本次换肤照常生效
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      key,
      def: THEMES[key],
      tokens: THEMES[key].tokens,
      isDark: THEMES[key].mode === 'dark',
      setKey,
    }),
    [key, setKey],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用');
  }
  return ctx;
}

/** 只取令牌，不关心主题元信息时用它 */
export function usePalette(): Tokens {
  return useTheme().tokens;
}

export function useIsDark(): boolean {
  return useTheme().isDark;
}

/**
 * 样式工厂。
 *
 *   const useStyles = makeStyles((Palette) => ({ card: { backgroundColor: Palette.surface } }));
 *   function Row() { const styles = useStyles(); ... }
 *
 * 回调参数刻意命名为 `Palette` —— 样式体内的写法与直接引用令牌完全一致，
 * 迁移时不用改一行样式代码。但它拿到的是「构建那一刻的主题」，
 * 所以必须经 `useStyles()` 建立订阅，换肤才会重算。
 *
 * 每套主题的样式表只构建一次并缓存：换肤是低频操作，
 * 但同一主题内反复重建会让 React 每次都拿到新对象引用，白白触发 diff。
 *
 * 类型上刻意对齐 `StyleSheet.create` 的签名：对象字面量必须落在
 * `NamedStyles` 的上下文里，`fontWeight: '600'` 这类字面量才会被收窄成
 * RN 期望的联合类型，而不是退化成 `string`。
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  build: (tokens: Tokens) => T & StyleSheet.NamedStyles<unknown>,
) {
  const cache = new Map<ThemeKey, T>();
  return function useStyles(): T {
    const { key } = useTheme();
    let sheet = cache.get(key);
    if (!sheet) {
      sheet = StyleSheet.create<T>(build(THEMES[key].tokens));
      cache.set(key, sheet);
    }
    return sheet;
  };
}
