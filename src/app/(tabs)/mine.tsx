/**
 * 岁时 · 我的
 *
 * 一屏装完所有「关于这台设备上怎么看」与「关于这份数据」的事，分四组：
 *   概览   三个数字，用来核对数据还在
 *   外观   主题（四套，深色三套是主场）
 *   数据   回收站、清空全部
 *   关于   版本、来由
 *
 * 主题选择刻意做成带色块的长列表而不是一行 chips：四套主题的差别主要在
 * 「底色有多暗、金是暖还是冷」，用两个色块把它摊开，比只写名字选得准得多。
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, PageHeader, Screen, ScreenScroll, SectionCard } from '@/components/ui/layout';
import { Button, SettingRow } from '@/components/ui/controls';
import { MetricStrip } from '@/components/ui/feedback';
import { SheetModal } from '@/components/ui/sheet';
import { Body, Label, Meta } from '@/components/ui/typography';
import { APP_VERSION } from '@/constants/app';
import { GUTTER, Palette, Radius, Space, THEME_KEYS, THEMES, type ThemeKey } from '@/constants/theme';
import { formatStampShort } from '@/lib/backup';
import { listDeleted } from '@/lib/db/events';
import { PREF_BACKUP_AT, readPref } from '@/lib/db/prefs';
import { makeStyles, useTheme } from '@/lib/theme';
import { useAppState } from '@/lib/store/app-state';

export default function MineScreen() {
  const styles = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { events, occurrences } = useAppState();
  const { key: themeKey, def, setKey } = useTheme();

  const [themeOpen, setThemeOpen] = useState(false);
  const [trashCount, setTrashCount] = useState<number | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);

  /**
   * 回收站计数与上次备份时间都在**每次回到这一屏**时重读。
   *
   * 之前回收站计数挂在 `[events.length]` 上 —— 那样有个漏网的场景：
   * 在回收站里「彻底删除」之后返回，在册条数没变，计数就不会刷新。
   * 「离开这一屏时发生过什么」只有 focus 事件知道，长度变化推不出来。
   */
  useFocusEffect(
    useCallback(() => {
      void listDeleted()
        .then((rows) => setTrashCount(rows.length))
        .catch(() => setTrashCount(0));
      void readPref(PREF_BACKUP_AT)
        .then((v) => setLastBackupAt(v ? Number(v) : null))
        .catch(() => setLastBackupAt(null));
    }, []),
  );

  const metrics = useMemo(() => {
    const lunarCount = events.filter((e) => e.calendar === 'lunar').length;
    const pinnedCount = events.filter((e) => e.pinned).length;
    return [
      { label: '日子', value: String(events.length) },
      { label: '农历', value: String(lunarCount) },
      { label: '盘上', value: String(occurrences.filter((o) => !o.expired).length) },
      { label: '置顶', value: String(pinnedCount), tone: 'brand' as const },
    ];
  }, [events, occurrences]);

  return (
    <Screen>
      <ScreenScroll bottomInset={110 + insets.bottom}>
        <PageHeader title="我的" subtitle="外观、数据与关于" />

        <Card padded={false} style={styles.metricsCard}>
          <MetricStrip metrics={metrics} framed={false} />
        </Card>

        <SectionCard title="外观">
          <Card padded={false} style={styles.groupCard}>
            <SettingRow
              label="主题"
              value={`${def.name} · ${def.note}`}
              onPress={() => setThemeOpen(true)}
              last
            />
          </Card>
        </SectionCard>

        <SectionCard title="数据">
          <Card padded={false} style={styles.groupCard}>
            <SettingRow
              label="回收站"
              value={trashCount == null ? '—' : trashCount > 0 ? `${trashCount} 个` : '空'}
              valueTone={trashCount ? 'brand' : 'ink3'}
              onPress={() => router.push('/trash')}
            />
            <SettingRow
              label="备份与恢复"
              value={formatStampShort(lastBackupAt)}
              valueTone={lastBackupAt ? 'ink3' : 'brand'}
              onPress={() => router.push('/backup')}
              last
            />
          </Card>
        </SectionCard>

        <SectionCard title="关于">
          <Card padded={false} style={styles.groupCard}>
            <SettingRow label="岁时" value={`v${APP_VERSION}`} valueTone="ink3" onPress={() => router.push('/about')} last />
          </Card>
        </SectionCard>

        <Meta tone="ink4" style={styles.footer}>
          数据全部存在这台设备上，不上传、不需要账号。
        </Meta>
      </ScreenScroll>

      <ThemeSheet
        visible={themeOpen}
        current={themeKey}
        onPick={(k) => {
          setKey(k);
          setThemeOpen(false);
        }}
        onClose={() => setThemeOpen(false)}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------ 主题选择 */

function ThemeSheet({
  visible,
  current,
  onPick,
  onClose,
}: {
  visible: boolean;
  current: ThemeKey;
  onPick: (key: ThemeKey) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  return (
    <SheetModal visible={visible} title="主题" onClose={onClose}>
      <View style={styles.themeList}>
        {THEME_KEYS.map((k) => {
          const def = THEMES[k];
          const active = k === current;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onPick(k)}
              style={({ pressed }) => [
                styles.themeRow,
                active && styles.themeRowActive,
                pressed && styles.themeRowPressed,
              ]}>
              {/* 三个色块：底 / 面 / 品牌 —— 主题的差别就藏在这三块的关系里 */}
              <View style={styles.swatch}>
                <View style={[styles.swatchBand, { backgroundColor: def.tokens.paper, flex: 1.4 }]} />
                <View style={[styles.swatchBand, { backgroundColor: def.tokens.surface, flex: 1 }]} />
                <View style={[styles.swatchBand, { backgroundColor: def.tokens.brand, flex: 0.8 }]} />
              </View>

              <View style={styles.themeMain}>
                <Body tone={active ? 'brand' : 'ink'} style={styles.themeName}>
                  {def.name}
                </Body>
                <Label tone="ink3" style={styles.themeNote}>
                  {def.note}
                </Label>
              </View>

              {active ? <Ionicons name="checkmark" size={18} color={Palette.brand} /> : null}
            </Pressable>
          );
        })}
      </View>

      <Meta tone="ink3" style={styles.themeHint}>
        岁时不跟随系统深色。星盘只有在墨底上才亮得起来 —— 白天想用浅色，手动切到素笺即可。
      </Meta>

      <Button label="完成" tone="secondary" onPress={onClose} style={styles.themeDone} />
    </SheetModal>
  );
}

const useStyles = makeStyles((Palette) => ({
  metricsCard: { marginHorizontal: GUTTER, marginTop: Space.xs },
  /**
   * 分组卡：左右各让出 GUTTER，与首页 / 列表 / 详情页的卡片取齐。
   *
   * SectionCard **只给标题加左右边距，内容区是裸露的** —— 内容要不要内缩全看调用方，
   * 漏了不报错，只在视觉上差一截（标题缩进 17，卡片却贴着屏幕边）。
   * 所以这里必须显式让步距，别删。
   */
  groupCard: { marginHorizontal: GUTTER },
  footer: {
    textAlign: 'center',
    marginTop: Space.xxl,
    paddingHorizontal: 40,
    fontSize: 11.5,
    lineHeight: 18,
  },

  themeList: { gap: Space.sm },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.line3,
  },
  themeRowActive: { borderColor: Palette.brand, backgroundColor: Palette.brandBg },
  themeRowPressed: { backgroundColor: Palette.surface2 },
  swatch: {
    flexDirection: 'row',
    width: 54,
    height: 38,
    borderRadius: Radius.thumb,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.line,
  },
  swatchBand: { height: '100%' },
  themeMain: { flex: 1, gap: 2 },
  themeName: { fontWeight: '600' },
  themeNote: { fontSize: 11.5 },
  themeHint: { marginTop: Space.lg, fontSize: 11.5, lineHeight: 18 },
  themeDone: { marginTop: Space.lg },
}));
