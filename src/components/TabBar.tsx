/**
 * 岁时 · 底部标签栏
 *
 * 四格：星盘（首页）/ 全部 / ＋（中央突起）/ 我的。
 *
 * 决策记录：只留四格。格物是五格，因为它有「相册」「提醒」两个独立语境；
 * 岁时没有图片、V1 也不做通知，硬凑五格只会让中央按钮被稀释。
 * 首页叫「星盘」而不是「首页」—— 这一屏就是它的全部内容，名字该说清这件事。
 *
 * 中央的「＋」做成品牌色圆钮并抬升：记一件日子是这个应用唯一的核心动作，
 * 界面要一直把它递到手边。
 *
 * 实现注记：不接 React Navigation 的 tabPress 拦截，直接 navigate，
 * 少一层类型耦合。
 */

import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette, Radius, Shadow, Space } from '@/constants/theme';
import { Label } from './ui/typography';
import { makeStyles } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface TabMeta {
  name: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}

export const TAB_ORDER: TabMeta[] = [
  { name: 'index', label: '星盘', icon: 'planet-outline', iconActive: 'planet' },
  { name: 'list', label: '全部', icon: 'list-outline', iconActive: 'list' },
  { name: 'compose', label: '记一笔', icon: 'add', iconActive: 'add' },
  { name: 'mine', label: '我的', icon: 'person-outline', iconActive: 'person' },
];

/** 只声明本组件真正用到的能力，避免复刻 React Navigation 的重载签名 */
export interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

export default function TabBar({ state, navigation }: TabBarProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Space.sm) }]}>
      {TAB_ORDER.map((tab) => {
        const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
        const focused = routeIndex === state.index;

        const onPress = () => {
          if (!focused && routeIndex >= 0) {
            navigation.navigate(tab.name);
          }
        };

        if (tab.name === 'compose') {
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="button"
              accessibilityLabel="记一个新日子"
              onPress={onPress}
              style={styles.cell}>
              <View style={[styles.centerButton, focused && styles.centerButtonActive]}>
                <Ionicons name="add" size={26} color={Palette.onAccent} />
              </View>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={tab.name}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            onPress={onPress}
            style={styles.cell}>
            <Ionicons
              name={focused ? tab.iconActive : tab.icon}
              size={21}
              color={focused ? Palette.brand : Palette.ink3}
            />
            <Label style={[styles.label, { color: focused ? Palette.brand : Palette.ink3 }]}>
              {tab.label}
            </Label>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((Palette) => ({
  bar: {
    flexDirection: 'row',
    backgroundColor: Palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.line2,
    paddingTop: Space.sm,
    ...Platform.select({ android: { elevation: 8 }, default: {} }),
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 3, paddingVertical: 2 },
  label: { fontSize: 10.5 },
  centerButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.chip,
    backgroundColor: Palette.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
    ...Shadow.raised,
  },
  /* 停在录入页时按下一点，像被按住了；比换色更含蓄 */
  centerButtonActive: { transform: [{ scale: 0.94 }], backgroundColor: Palette.brandDeep },
}));
