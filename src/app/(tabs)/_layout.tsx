/**
 * 岁时 · 标签页布局
 *
 * 用 expo-router 的经典 Tabs + 完全自定义的 TabBar。
 * 不用 NativeTabs：它承载不了星盘的墨底语言与中央突起按钮，且仍是 unstable API。
 */

import { Tabs } from 'expo-router';

import TabBar from '@/components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="list" />
      <Tabs.Screen name="compose" />
      <Tabs.Screen name="mine" />
    </Tabs>
  );
}
