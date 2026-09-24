/**
 * 格物 · 布局原子件
 */

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GUTTER, Palette, Space } from '@/constants/theme';
import { Display, Meta } from './typography';
import { makeStyles } from '@/lib/theme';

/* ------------------------------------------------------------ 页面壳 */

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <View style={[styles.screen, style]}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

/** 可滚动内容区，底部预留 Tab 栏高度 */
export function ScreenScroll({
  children,
  bottomInset = 96,
  contentStyle,
}: {
  children: ReactNode;
  bottomInset?: number;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[{ paddingBottom: bottomInset }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

export function VStack({
  children,
  gap = Space.md,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return <View style={[styles.flex, { gap }, style]}>{children}</View>;
}

export function HStack({
  children,
  gap = Space.sm,
  align = 'center',
  justify = 'flex-start',
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.row, { gap, alignItems: align, justifyContent: justify }, style]}>{children}</View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.divider, style]} />;
}

/** 页面统一左右边距容器 */
export function Gutter({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.gutter, style]}>{children}</View>;
}

/* ------------------------------------------------------------ 页头 */

export interface PageHeaderProps {
  title: string;
  /** 标题下方的一行小字 */
  subtitle?: string;
  /** 右侧动作区 */
  right?: ReactNode;
}

/**
 * 衬线大标题 + 可选副标题。所有主页面共用，保证标题基线一致。
 */
export function PageHeader({ title, subtitle, right }: PageHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Display style={styles.headerTitle}>{title}</Display>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
      {subtitle ? (
        <Meta tone="ink3" style={styles.headerSub}>
          {subtitle}
        </Meta>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ 卡片 */

export function Card({
  children,
  style,
  padded = true,
  tone = 'surface',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  tone?: 'surface' | 'brandBg' | 'inset';
}) {
  const styles = useStyles();
  const bg =
    tone === 'brandBg' ? Palette.brandBg : tone === 'inset' ? Palette.inset : Palette.surface;
  return <View style={[styles.card, { backgroundColor: bg }, padded && styles.cardPadded, style]}>{children}</View>;
}

/** 分组卡片：标题 + 内容，用于详情页字段区 */
export function SectionCard({
  title,
  children,
  right,
  style,
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <View style={styles.sectionHead}>
          <Meta tone="ink3" style={styles.sectionTitle}>
            {title}
          </Meta>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const useStyles = makeStyles((Palette) => ({
  screen: { flex: 1, backgroundColor: Palette.canvas },
  safe: { flex: 1 },
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Palette.line2 },
  gutter: { paddingHorizontal: GUTTER },
  header: { paddingHorizontal: GUTTER, paddingTop: Space.md, paddingBottom: Space.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  headerTitle: { flex: 1 },
  headerRight: { paddingTop: Space.xs },
  headerSub: { marginTop: Space.xs },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.line2,
    overflow: 'hidden',
  },
  cardPadded: { padding: Space.lg },
  section: { marginTop: Space.xxl },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingBottom: Space.sm,
  },
  sectionTitle: { letterSpacing: 0.4 },
}));
