/**
 * 岁时 · 条目行
 *
 * 列表与检索结果的唯一行样式。两行结构：
 *   上：名字（左）、倒计时（右）
 *   下：日期与周期（左）
 *
 * 倒计时的数字用**等宽数字**并且右对齐 —— 一列行排下来，
 * 「3 天后 / 12 天后 / 128 天后」的数位对齐后，一屏扫过去就能比出远近。
 * 不等宽的话这一列会参差不齐，扫读速度掉一半。
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { GUTTER, Palette, Space, StatusTones, Type, type TokenName } from '@/constants/theme';
import { describeDays, formatMD, formatLunar, weekdayName } from '@/lib/date';
import { makeStyles } from '@/lib/theme';
import { countToneOf } from '@/lib/tone';
import type { Anniversary, EventTone, Occurrence } from '@/lib/types';
import { ItemText, Label, Meta } from '../ui/typography';

const TONE_TOKEN: Record<EventTone, TokenName> = {
  brand: 'brand',
  sage: 'sage',
  amber: 'amber',
  clay: 'clay',
};

const REPEAT_LABEL: Record<Anniversary['repeat'], string> = {
  once: '仅此一次',
  yearly: '每年',
  monthly: '每月',
  weekly: '每周',
};

/** 行下方那行小字：日期本体 + 周期 */
function describeLine(event: Anniversary, occurrence: Occurrence): string {
  const date =
    event.calendar === 'lunar' && occurrence.lunar
      ? `农历${formatLunar(occurrence.lunar)}`
      : formatMD(occurrence.date);

  if (event.repeat === 'weekly') {
    return `${date} · 每${weekdayName(occurrence.date)}`;
  }

  const repeat =
    event.repeat === 'monthly'
      ? `每月 ${event.day} 日`
      : REPEAT_LABEL[event.repeat];

  return `${date} · ${repeat}`;
}

export interface EventRowProps {
  event: Anniversary;
  occurrence: Occurrence;
  onPress?: () => void;
  /** 本组最后一行，不画分隔线 */
  last?: boolean;
}

export default function EventRow({ event, occurrence, onPress, last }: EventRowProps) {
  const styles = useStyles();
  const tone = countToneOf(occurrence.days);
  const isToday = occurrence.days === 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.name}，${describeDays(occurrence.days)}`}
      onPress={onPress}
      android_ripple={{ color: Palette.ripple }}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]}>
      {/* 分类色条：用户标的红/橄榄/琥珀/金，一眼分出这是哪一类日子 */}
      <View style={[styles.stripe, { backgroundColor: Palette[TONE_TOKEN[event.tone]] }]} />

      <View style={styles.main}>
        <View style={styles.nameLine}>
          {event.pinned ? (
            <Ionicons name="star" size={11} color={Palette.brand} style={styles.pin} />
          ) : null}
          <ItemText numberOfLines={1} style={styles.name}>
            {event.name}
          </ItemText>
        </View>
        <Meta tone="ink3" numberOfLines={1} style={styles.sub}>
          {describeLine(event, occurrence)}
        </Meta>
      </View>

      <View style={styles.right}>
        {isToday ? (
          <Label color={StatusTones.today.fg} style={styles.todayText}>
            今天
          </Label>
        ) : (
          <View style={styles.countLine}>
            <Label style={[styles.countNum, { color: StatusTones[tone].fg }]}>
              {Math.abs(occurrence.days)}
            </Label>
            <Label tone="ink3" style={styles.countUnit}>
              {occurrence.days > 0 ? '天后' : '天前'}
            </Label>
          </View>
        )}
        {occurrence.ordinal != null && occurrence.ordinal > 0 ? (
          <Label tone="ink4" style={styles.ordinal}>
            {occurrence.ordinal} 周年
          </Label>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((Palette) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: GUTTER,
    paddingVertical: 11,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Palette.line3 },
  rowPressed: { backgroundColor: Palette.surface2 },
  stripe: { width: 3, height: 30, borderRadius: 2, opacity: 0.9 },
  main: { flex: 1, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pin: { marginTop: 1 },
  name: { flexShrink: 1 },
  sub: { fontSize: 12.5 },
  right: { alignItems: 'flex-end', gap: 1 },
  countLine: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  countNum: { ...(Type.numSm as object), fontSize: 19, fontWeight: '600' },
  countUnit: { fontSize: 11 },
  todayText: { ...(Type.numSm as object), fontSize: 15, fontWeight: '700' },
  ordinal: { fontSize: 10.5 },
}));
