/**
 * 岁时 · 根布局
 *
 * 结构：Stack
 *   ├─ (tabs)           四格底部标签页（星盘 / 全部 / 记一笔 / 我的）
 *   ├─ event/[id]       条目详情
 *   ├─ event/[id]/edit  编辑（复用录入表单，modal 呈现）
 *   ├─ trash            回收站
 *   ├─ backup           备份与恢复
 *   └─ about            关于
 *
 * 历法与日期选择器刻意不做成路由，而是录入页内的 Modal ——
 * 它们不承载独立语境，做成路由会让返回栈与表单状态纠缠。
 *
 * 启动时预热数据库（建表 + 写 schema 版本）。失败不阻塞界面：
 * 各页面自行展示空态或错误，比白屏更可诊断。
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getDatabase } from '@/lib/db';
import { AppStateProvider } from '@/lib/store/app-state';
import { ThemeProvider, useTheme } from '@/lib/theme';

export default function RootLayout() {
  useEffect(() => {
    void getDatabase().catch(() => {
      // 初始化错误留给具体页面处理，这里只保证不崩
    });
  }, []);

  // 外层不取主题：它包着 Provider，读不到当前主题。
  // 背景色交给内层 AppShell 与各屏的 contentStyle。
  return (
    <GestureHandlerRootView style={shell.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStateProvider>
            <AppShell />
          </AppStateProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * 导航壳。放在 ThemeProvider 内层，才能按当前主题决定状态栏明暗与屏幕底色 ——
 * 玄夜主题下状态栏图标必须转白，否则在墨底上看不见。
 */
function AppShell() {
  const { isDark, tokens } = useTheme();

  // 直接依赖 tokens（每套主题一个稳定对象），比依赖 isDark 更准确 ——
  // 它既被真实引用，引用变化也恰好等于主题变化
  const screenOptions = useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: tokens.canvas } }),
    [tokens],
  );

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]/index" />
        <Stack.Screen
          name="event/[id]/edit"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="trash" />
        <Stack.Screen name="backup" />
        <Stack.Screen name="about" />
      </Stack>
    </>
  );
}

const shell = StyleSheet.create({
  root: { flex: 1 },
});
