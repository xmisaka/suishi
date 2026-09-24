/**
 * 岁时 · 条目详情
 *
 * 从星盘或列表点进来。这一屏只回答「这个日子到底是什么」——
 * 大号倒计时占住上半屏（用户点进来最先想知道的就是「还有几天」），
 * 下面才是公历、农历、周期、备注这些事实。
 *
 * 公历与农历**两个都列出来**，不管当初是用哪个历法建的：
 * 农历条目要能看到它今年落在公历哪天，公历条目也要能看到对应农历几月几。
 * 这正是岁时存在的理由 —— 两套历法在同一件事上并存。
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Card, Gutter, Screen, ScreenScroll, SectionCard } from '@/components/ui/layout';
import { Button, IconButton } from '@/components/ui/controls';
import { EmptyState, PlainTag } from '@/components/ui/feedback';
import { Body, Label, Meta, Title } from '@/components/ui/typography';
import { GUTTER, Palette, Space, StatusTones, Type, type TokenName } from '@/constants/theme';
import { describeDays, formatFull, formatLunar, weekdayName } from '@/lib/date';
import { makeStyles } from '@/lib/theme';
import { useAppState } from '@/lib/store/app-state';
import { countToneOf } from '@/lib/tone';
import type { EventTone } from '@/lib/types';

const TONE_TOKEN: Record<EventTone, TokenName> = {
  brand: 'brand',
  sage: 'sage',
  amber: 'amber',
  clay: 'clay',
};

const REPEAT_TEXT: Record<string, string> = {
  once: '仅此一次',
  yearly: '每年一次',
  monthly: '每月一次',
  weekly: '每周一次',
};


export default function EventDetailScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { eventById, occurrenceById, togglePin, remove } = useAppState();

  const event = id ? eventById.get(id) : undefined;
  const occurrence = id ? occurrenceById.get(id) : undefined;

  if (!event) {
    return (
      <Screen>
        <ScreenScroll>
          <EmptyState
            icon="help-circle-outline"
            title="这条日子不见了"
            description="它可能已经被删掉了。"
            actionLabel="返回"
            onAction={() => router.back()}
          />
        </ScreenScroll>
      </Screen>
    );
  }

  const tone = occurrence ? countToneOf(occurrence.days) : 'future';
  const toneColor = StatusTones[tone].fg;

  const confirmDelete = () => {
    Alert.alert('删除这个日子？', `「${event.name}」会被移进回收站，之后还能找回。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void remove(event.id).then(() => router.back());
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" accessibilityLabel="返回" onPress={() => router.back()} />
        <View style={styles.spacer} />
        <IconButton
          icon={event.pinned ? 'star' : 'star-outline'}
          tone={event.pinned ? 'brand' : 'ink3'}
          accessibilityLabel={event.pinned ? '取消置顶' : '置顶'}
          onPress={() => void togglePin(event.id)}
        />
        <IconButton
          icon="create-outline"
          accessibilityLabel="编辑"
          onPress={() => router.push({ pathname: '/event/[id]/edit', params: { id: event.id } })}
        />
      </View>

      <ScreenScroll bottomInset={Space.xxxl}>
        {/* 倒计时 */}
        <View style={styles.hero}>
          {occurrence ? (
            occurrence.days === 0 ? (
              <Label color={toneColor} style={styles.heroToday}>
                就是今天
              </Label>
            ) : (
              <View style={styles.heroCount}>
                <Label color={toneColor} style={styles.heroNum}>
                  {Math.abs(occurrence.days)}
                </Label>
                <Label color={toneColor} style={styles.heroUnit}>
                  {occurrence.days > 0 ? '天后' : '天前'}
                </Label>
              </View>
            )
          ) : (
            <Label tone="ink3" style={styles.heroToday}>
              日期不完整
            </Label>
          )}

          <Title style={styles.heroName}>{event.name}</Title>

          {occurrence?.ordinal != null && occurrence.ordinal > 0 ? (
            <Label color={Palette.brand} style={styles.heroOrdinal}>
              第 {occurrence.ordinal} 周年
            </Label>
          ) : null}
        </View>

        {/* 事实 */}
        <SectionCard title="日期">
          <Card padded={false} style={styles.infoCard}>
            <InfoRow
              label="公历"
              value={
                occurrence
                  ? `${formatFull(occurrence.date)} · ${weekdayName(occurrence.date)}`
                  : '—'
              }
            />
            <InfoRow
              label="农历"
              value={occurrence?.lunar ? formatLunar(occurrence.lunar) : '—'}
            />
            <InfoRow label="周期" value={REPEAT_TEXT[event.repeat] ?? event.repeat} />
            <InfoRow
              label="起算"
              value={event.year != null ? `${event.year} 年` : '不限年份'}
              last
            />
          </Card>
        </SectionCard>

        <SectionCard title="标记">
          <Card padded={false} style={styles.infoCard}>
            <View style={styles.markRow}>
              <View style={styles.markLeft}>
                <View
                  style={[styles.markDot, { backgroundColor: Palette[TONE_TOKEN[event.tone]] }]}
                />
                <Body tone="ink2">标记色</Body>
              </View>
              <Meta tone="ink3">这决定了它在圆盘上与列表里的颜色</Meta>
            </View>
            <View style={styles.markRow}>
              <View style={styles.markLeft}>
                <Ionicons name="star" size={14} color={event.pinned ? Palette.brand : Palette.ink4} />
                <Body tone="ink2">置顶</Body>
              </View>
              <Meta tone="ink3">{event.pinned ? '已置顶' : '未置顶'}</Meta>
            </View>
            <View style={[styles.markRow, styles.markRowLast]}>
              <View style={styles.markLeft}>
                <Ionicons
                  name={event.calendar === 'lunar' ? 'moon' : 'sunny'}
                  size={14}
                  color={Palette[TONE_TOKEN[event.tone]]}
                />
                <Body tone="ink2">历法</Body>
              </View>
              <Meta tone="ink3">{event.calendar === 'lunar' ? '农历' : '公历'}</Meta>
            </View>
          </Card>
        </SectionCard>

        {event.note ? (
          <SectionCard title="备注">
            {/* 与上面两张卡同样的左右让步 —— SectionCard 的内容区是裸露的，不写就贴边 */}
            <Card style={styles.infoCard}>
              <Body tone="ink2" style={styles.note}>
                {event.note}
              </Body>
            </Card>
          </SectionCard>
        ) : null}

        {occurrence && occurrence.days > 0 && occurrence.days <= 30 ? (
          <Gutter style={styles.soon}>
            <PlainTag
              tone="brand"
              icon="time-outline"
              text={`${describeDays(occurrence.days)}，可以准备起来了`}
            />
          </Gutter>
        ) : null}

        <Gutter style={styles.actions}>
          <Button
            label="编辑"
            tone="secondary"
            icon="create-outline"
            onPress={() => router.push({ pathname: '/event/[id]/edit', params: { id: event.id } })}
          />
          <Button label="删除" tone="danger" icon="trash-outline" onPress={confirmDelete} />
        </Gutter>
      </ScreenScroll>
    </Screen>
  );
}

/* ------------------------------------------------------------ 信息行 */

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Meta tone="ink3" style={styles.infoLabel}>
        {label}
      </Meta>
      <Body tone="ink" style={styles.infoValue} numberOfLines={2}>
        {value}
      </Body>
    </View>
  );
}

const useStyles = makeStyles((Palette) => ({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  spacer: { flex: 1 },

  hero: { alignItems: 'center', paddingTop: Space.md, paddingBottom: Space.xxl, gap: Space.xs },
  heroCount: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  heroNum: { ...(Type.countdown as object), fontSize: 62, lineHeight: 68 },
  heroUnit: { fontSize: 17, fontWeight: '600' },
  heroToday: { ...(Type.countdown as object), fontSize: 44, lineHeight: 52 },
  heroName: { textAlign: 'center', marginTop: Space.sm },
  heroOrdinal: { fontSize: 12, fontWeight: '600' },

  /* 分组卡的左右让步：SectionCard 的内容区裸露，卡片自己不让就贴边 */
  infoCard: { marginHorizontal: GUTTER },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 44,
  },
  infoRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Palette.line3 },
  infoLabel: { width: 52, paddingTop: 2 },
  infoValue: { flex: 1 },

  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.line3,
  },
  markRowLast: { borderBottomWidth: 0 },
  markLeft: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  markDot: { width: 14, height: 14, borderRadius: 7 },

  note: { lineHeight: 23 },

  soon: { marginTop: Space.xl },
  actions: { marginTop: Space.xxl, gap: Space.md },
}));
