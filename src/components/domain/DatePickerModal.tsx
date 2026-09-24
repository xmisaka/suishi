/**
 * 岁时 · 日期选择器
 *
 * 一个面板同时管公历与农历，并且**按周期规则决定显示哪几段**：
 *   仅此一次  年（必填）+ 月 + 日
 *   每年      年（可选）+ 月 + 日
 *   每月      年（可选）+ 日
 *   每周      只选星期
 *
 * 为什么「年」可以留空：用户往往只记得「妈妈的生日是八月十五」，
 * 不记得她哪一年生的。逼着填年份会让人干脆放弃记录 ——
 * 而年份的唯一作用是算「第几周年」，缺了它这条日子照样成立。
 *
 * 农历的月份列表由农历年决定，闰月是**列表里独立的一项**（闰四月 ≠ 四月），
 * 日的上限也跟着那个月实际是 29 还是 30 天走。
 */

import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Palette, Space } from '@/constants/theme';
import { describeDateValue, type DateSelection } from '@/lib/calendar/describe';
import { lunarMonthsOf, solarToLunar } from '@/lib/calendar/lunar';
import { daysInMonth, lunarMonthName, weekdayLabel } from '@/lib/date';
import { makeStyles } from '@/lib/theme';
import type { CalendarSystem, DateParts, RepeatRule } from '@/lib/types';
import { Button } from '../ui/controls';
import { ChipGroup, SheetModal, StepButton } from '../ui/sheet';
import { Body, Label, Meta } from '../ui/typography';

/** 可选的年份范围。农历换算表在这个区间外不可靠，界面上也要拦住 */
const MIN_YEAR = 1930;
const MAX_YEAR = 2099;

/** 不设年份时用来枚举月份与天数，取闰年：让 2 月 29 日也能选到 */
const REF_YEAR = 2000;

export type DateValue = DateSelection;

export interface DatePickerProps {
  visible: boolean;
  calendar: CalendarSystem;
  repeat: RepeatRule;
  value: DateValue;
  /** 今天，用于算「下一个」预览 */
  today: DateParts;
  onChange: (next: DateValue) => void;
  onClose: () => void;
}

const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((v) => ({ value: v, label: weekdayLabel(v) }));

export default function DatePickerModal({
  visible,
  calendar,
  repeat,
  value,
  today,
  onChange,
  onClose,
}: DatePickerProps) {
  const styles = useStyles();

  const todayLunar = useMemo(() => solarToLunar(today), [today]);
  const refLunarYear = value.year ?? todayLunar.y;

  /* 农历月份清单。闰月编码成负数，因为同一个月号会出现两次（四月 / 闰四月） */
  const lunarMonthOptions = useMemo(
    () =>
      lunarMonthsOf(refLunarYear).map((info) => ({
        value: info.leap ? -info.month : info.month,
        label: lunarMonthName(info.month, info.leap),
      })),
    [refLunarYear],
  );

  const solarMonthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}月` })),
    [],
  );

  /** 这个月实际有多少天 —— 日的选项数量由它决定 */
  const dayCount = useMemo(() => {
    if (calendar === 'solar') {
      return daysInMonth(value.year ?? REF_YEAR, value.month);
    }
    const hit = lunarMonthsOf(refLunarYear).find(
      (m) => m.month === value.month && m.leap === value.leap,
    );
    // 该闰月在这年不存在（例如无闰月的年份选了闰四月）→ 先按 30 天给，
    // 真正的钳制交给解析层，选择器不替用户做决定
    return hit ? hit.days : 30;
  }, [calendar, value.year, value.month, value.leap, refLunarYear]);

  const dayOptions = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
    [dayCount],
  );

  const lunarMonthChipValue = value.leap ? -value.month : value.month;
  const patch = (next: Partial<DateValue>) => onChange({ ...value, ...next });

  const preview = useMemo(
    () => describeDateValue(calendar, repeat, value, today, todayLunar.y),
    [calendar, repeat, value, today, todayLunar.y],
  );

  const showYear = repeat !== 'weekly';
  const showMonth = repeat === 'once' || repeat === 'yearly';
  const showDay = repeat !== 'weekly';

  return (
    <SheetModal
      visible={visible}
      title={calendar === 'lunar' ? '选择农历日期' : '选择公历日期'}
      onClose={onClose}
      maxHeightRatio={0.86}
      footer={<Button label="完成" onPress={onClose} size="lg" />}>
      {/* ---------------------------------------------------- 星期 */}
      {repeat === 'weekly' ? (
        <Section label="星期">
          <ChipGroup
            options={WEEKDAY_OPTIONS}
            value={value.weekday ?? 1}
            onPick={(v) => patch({ weekday: v })}
          />
          <Meta tone="ink3" style={styles.hint}>
            每周固定一天，与月日无关。
          </Meta>
        </Section>
      ) : null}

      {/* ---------------------------------------------------- 年 */}
      {showYear ? (
        <Section label="年">
          <View style={styles.yearRow}>
            <StepButton
              label="−10"
              disabled={value.year == null}
              onPress={() => patch({ year: Math.max(MIN_YEAR, (value.year ?? MIN_YEAR) - 10) })}
            />
            <StepButton
              label="−1"
              disabled={value.year == null}
              onPress={() => patch({ year: Math.max(MIN_YEAR, (value.year ?? MIN_YEAR) - 1) })}
            />
            <View style={styles.yearValue}>
              <Label color={value.year == null ? Palette.ink3 : Palette.brand} style={styles.yearText}>
                {value.year ?? '不限'}
              </Label>
            </View>
            <StepButton
              label="+1"
              disabled={value.year != null && value.year >= MAX_YEAR}
              onPress={() => patch({ year: Math.min(MAX_YEAR, (value.year ?? today.y) + 1) })}
            />
            <StepButton
              label="+10"
              disabled={value.year != null && value.year >= MAX_YEAR}
              onPress={() => patch({ year: Math.min(MAX_YEAR, (value.year ?? today.y) + 10) })}
            />
          </View>

          {repeat !== 'once' ? (
            <>
              <View style={styles.yearActions}>
                <StepButton label="从今年起算" onPress={() => patch({ year: today.y })} />
                <StepButton
                  label="不限年份"
                  disabled={value.year == null}
                  onPress={() => patch({ year: null })}
                />
              </View>
              <Meta tone="ink3" style={styles.hint}>
                {value.year == null
                  ? '不限年份：这条日子每年都算数，只是不显示「第几周年」。'
                  : `从 ${value.year} 年起算，会显示为「第几周年」。`}
              </Meta>
            </>
          ) : (
            <Meta tone="ink3" style={styles.hint}>
              仅此一次的日子必须有年份。
            </Meta>
          )}
        </Section>
      ) : null}

      {/* ---------------------------------------------------- 月 */}
      {showMonth ? (
        <Section label="月">
          {calendar === 'lunar' ? (
            <ChipGroup
              options={lunarMonthOptions}
              value={lunarMonthChipValue}
              onPick={(encoded) =>
                patch({
                  month: Math.abs(encoded),
                  leap: encoded < 0,
                  // 换月后日可能超界，顺手收一下，免得出现「四月三十一」
                  day: Math.min(value.day, 30),
                })
              }
            />
          ) : (
            <ChipGroup
              options={solarMonthOptions}
              value={value.month}
              onPick={(m) =>
                patch({ month: m, day: Math.min(value.day, daysInMonth(value.year ?? REF_YEAR, m)) })
              }
            />
          )}
        </Section>
      ) : null}

      {/* ---------------------------------------------------- 日 */}
      {showDay ? (
        <Section label="日">
          <ChipGroup
            options={dayOptions}
            value={Math.min(value.day, dayCount)}
            onPick={(d) => patch({ day: d })}
          />
          {calendar === 'lunar' && dayCount < 30 ? (
            <Meta tone="ink3" style={styles.hint}>
              这个农历月只有 {dayCount} 天。
            </Meta>
          ) : null}
        </Section>
      ) : null}

      {/* ---------------------------------------------------- 预览 */}
      <View style={styles.preview}>
        <Label tone="ink3" style={styles.previewLabel}>
          预览
        </Label>
        <Body tone="ink2" style={styles.previewText}>
          {preview}
        </Body>
      </View>
    </SheetModal>
  );
}

/* ------------------------------------------------------------ 子件 */

function Section({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Label tone="ink2" style={styles.sectionLabel}>
        {label}
      </Label>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------ 样式 */

const useStyles = makeStyles((Palette) => ({
  section: { marginBottom: Space.xl },
  sectionLabel: { fontSize: 12, letterSpacing: 1, marginBottom: Space.sm },
  hint: { marginTop: Space.sm, fontSize: 11.5, lineHeight: 17 },

  yearRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  yearValue: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    backgroundColor: Palette.brandBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  yearActions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.sm },

  preview: {
    paddingTop: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.line3,
    gap: Space.xs,
  },
  previewLabel: { fontSize: 11, letterSpacing: 1 },
  previewText: { lineHeight: 21 },
}));
