/**
 * 岁时 · 录入表单
 *
 * 「记一笔」与「编辑」共用同一份。区别只在初始值与按钮文案 ——
 * 两套表单迟早会分叉（一处加了校验另一处没加），而它们本该永远一样。
 *
 * 三处联动是刻意做的，不是顺手：
 *   - 历法切到农历时，若周期是「每周」→ 自动改成「每年」。
 *     农历日期与星期没有固定关系，这个组合在解析层就是无解的，
 *     与其让用户保存完发现它从列表里消失，不如在选择时就收掉。
 *   - 周期切到「仅一次」而年份为空 → 补上今年。一次性条目必须锚在某一年。
 *   - 周期切到「每周」而星期为空 → 补上今天星期几。
 *
 * 校验的错误信息只在**点过保存之后**才显示：边打字边报错是在打断用户，
 * 而不是在帮他。
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { Palette, Radius, Space, Type, type TokenName } from '@/constants/theme';
import { describeDateShort, describeDateValue, validateSelection, type DateSelection } from '@/lib/calendar/describe';
import { solarToLunar } from '@/lib/calendar/lunar';
import { weekdayOf } from '@/lib/date';
import { makeStyles } from '@/lib/theme';
import type {
  Anniversary,
  AnniversaryDraft,
  CalendarSystem,
  EventTone,
  RepeatRule,
} from '@/lib/types';
import DatePickerModal from './DatePickerModal';
import { Button, FormRow, Segmented } from '../ui/controls';
import { Card, Gutter as GutterBox, ScreenScroll, SectionCard } from '../ui/layout';
import { Body, Label, Meta } from '../ui/typography';

/* ------------------------------------------------------------ 选项表 */

const CALENDAR_OPTIONS: { value: CalendarSystem; label: string }[] = [
  { value: 'solar', label: '公历' },
  { value: 'lunar', label: '农历' },
];

const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: 'once', label: '一次' },
  { value: 'yearly', label: '每年' },
  { value: 'monthly', label: '每月' },
  { value: 'weekly', label: '每周' },
];

const TONE_OPTIONS: { value: EventTone; label: string; token: TokenName }[] = [
  { value: 'brand', label: '金', token: 'brand' },
  { value: 'sage', label: '青', token: 'sage' },
  { value: 'amber', label: '黄', token: 'amber' },
  { value: 'clay', label: '朱', token: 'clay' },
];

/* ------------------------------------------------------------ 组件 */

export interface EventFormProps {
  initial?: Anniversary;
  submitLabel?: string;
  onSubmit: (draft: AnniversaryDraft) => Promise<void>;
}

export default function EventForm({ initial, submitLabel = '保存', onSubmit }: EventFormProps) {
  const styles = useStyles();

  const today = useMemo(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }, []);
  const todayLunar = useMemo(() => solarToLunar(today), [today]);

  const [name, setName] = useState(initial?.name ?? '');
  const [calendar, setCalendar] = useState<CalendarSystem>(initial?.calendar ?? 'solar');
  const [repeat, setRepeat] = useState<RepeatRule>(initial?.repeat ?? 'yearly');
  const [tone, setTone] = useState<EventTone>(initial?.tone ?? 'brand');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [note, setNote] = useState(initial?.note ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [selection, setSelection] = useState<DateSelection>(() => ({
    year: initial?.year ?? null,
    month: initial?.month ?? today.m,
    day: initial?.day ?? today.d,
    leap: initial?.leap ?? false,
    weekday: initial?.weekday ?? weekdayOf(today),
  }));

  /* ---------------------------------------------------------- 联动 */

  const changeCalendar = (next: CalendarSystem) => {
    setCalendar(next);
    // 农历 + 每周是无解组合，切历法时顺手把周期收回来
    if (next === 'lunar' && repeat === 'weekly') setRepeat('yearly');
  };

  const changeRepeat = (next: RepeatRule) => {
    setRepeat(next);
    if (next === 'once' && selection.year == null) {
      setSelection((s) => ({ ...s, year: today.y }));
    }
    if (next === 'weekly' && selection.weekday == null) {
      setSelection((s) => ({ ...s, weekday: weekdayOf(today) }));
    }
  };

  /* ---------------------------------------------------------- 提交 */

  const submit = async () => {
    const problem = validateSelection(name, calendar, repeat, selection);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);

    const draft: AnniversaryDraft = {
      name: name.trim(),
      calendar,
      repeat,
      year: repeat === 'weekly' ? null : selection.year,
      month: selection.month,
      day: selection.day,
      leap: calendar === 'lunar' ? selection.leap : false,
      weekday: repeat === 'weekly' ? (selection.weekday ?? weekdayOf(today)) : null,
      tone,
      pinned,
      note: note.trim() ? note.trim() : null,
      remindDays: null,
    };

    try {
      await onSubmit(draft);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败，再试一次');
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------- 渲染 */

  /* 日期行与行下那行解释：行里放短版（放得下），行下放完整版 ——
     农历条目选完能立刻看到「落在公历哪一天」，不必等保存后回列表找 */
  const dateText = describeDateShort(calendar, repeat, selection, today);
  const dateDetail = describeDateValue(
    calendar,
    repeat,
    selection,
    today,
    todayLunar.y,
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenScroll bottomInset={140}>
        <GutterBox>
          <Card>
            <FormRow label="名字" required>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="比如：妈妈的生日"
                placeholderTextColor={Palette.ink4}
                style={styles.input}
                maxLength={40}
                returnKeyType="done"
                allowFontScaling={false}
              />
            </FormRow>

            <FormRow label="历法">
              <Segmented options={CALENDAR_OPTIONS} value={calendar} onChange={changeCalendar} />
            </FormRow>

            <FormRow label="周期">
              <Segmented options={REPEAT_OPTIONS} value={repeat} onChange={changeRepeat} />
            </FormRow>

            <FormRow label="日期" last>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`选择日期，当前 ${dateText}`}
                onPress={() => setPickerOpen(true)}
                style={styles.dateRow}>
                <Body tone="ink" numberOfLines={1} style={styles.dateText}>
                  {dateText}
                </Body>
                <Ionicons name="chevron-forward" size={16} color={Palette.brand} />
              </Pressable>
            </FormRow>
          </Card>

          {/* 日期行的即时解释：农历条目改完月日，立刻能看到落在公历哪天 */}
          <Meta tone="ink3" style={styles.dateHint}>
            {dateDetail}
          </Meta>

          <SectionCard title="标记">
            <Card padded>
              <View style={styles.toneRow}>
                {TONE_OPTIONS.map((opt) => {
                  const active = opt.value === tone;
                  return (
                    <Pressable
                      key={opt.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`标记色 ${opt.label}`}
                      onPress={() => setTone(opt.value)}
                      style={styles.toneCell}>
                      <View
                        style={[
                          styles.toneDot,
                          { backgroundColor: Palette[opt.token] },
                          active && styles.toneDotActive,
                        ]}>
                        {active ? (
                          <Ionicons name="checkmark" size={15} color={Palette.onAccent} />
                        ) : null}
                      </View>
                      <Label tone={active ? 'brand' : 'ink3'} style={styles.toneLabel}>
                        {opt.label}
                      </Label>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.divider} />

              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Body tone="ink2">置顶</Body>
                  <Label tone="ink4" style={styles.switchHint}>
                    常看的日子放上面，圆盘上的点也更大
                  </Label>
                </View>
                <Switch
                  value={pinned}
                  onValueChange={setPinned}
                  trackColor={{ false: Palette.inset, true: Palette.brand }}
                  thumbColor={Palette.pure}
                />
              </View>
            </Card>
          </SectionCard>

          <SectionCard title="备注">
            <Card padded>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="想记的话、礼物清单、该提前准备什么…"
                placeholderTextColor={Palette.ink4}
                style={styles.noteInput}
                multiline
                maxLength={500}
                allowFontScaling={false}
              />
            </Card>
          </SectionCard>

          {error ? (
            <View style={styles.error}>
              <Ionicons name="alert-circle" size={15} color={Palette.clay} />
              <Body color={Palette.clay} style={styles.errorText}>
                {error}
              </Body>
            </View>
          ) : null}

          <Button
            label={saving ? '保存中…' : submitLabel}
            onPress={submit}
            loading={saving}
            size="lg"
            style={styles.submit}
          />
        </GutterBox>
      </ScreenScroll>

      <DatePickerModal
        visible={pickerOpen}
        calendar={calendar}
        repeat={repeat}
        value={selection}
        today={today}
        onChange={setSelection}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles((Palette) => ({
  flex: { flex: 1 },
  input: {
    ...(Type.body as object),
    color: Palette.ink,
    padding: 0,
    minHeight: 26,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Space.xs,
    minHeight: 26,
  },
  dateText: { fontWeight: '500' },
  dateHint: {
    marginTop: Space.sm,
    marginHorizontal: Space.xs,
    fontSize: 11.5,
    lineHeight: 17,
  },

  toneRow: { flexDirection: 'row', justifyContent: 'space-between' },
  toneCell: { alignItems: 'center', gap: Space.sm, flex: 1 },
  toneDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toneDotActive: {
    borderWidth: 2,
    borderColor: Palette.ink,
  },
  toneLabel: { fontSize: 11.5 },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Palette.line3, marginVertical: Space.lg },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.md },
  switchText: { flex: 1, gap: 2 },
  switchHint: { fontSize: 11.5 },

  noteInput: {
    ...(Type.body as object),
    color: Palette.ink,
    padding: 0,
    minHeight: 68,
    textAlignVertical: 'top',
  },

  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xl,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.input,
    backgroundColor: Palette.clayBg,
  },
  errorText: { flex: 1, lineHeight: 19 },
  submit: { marginTop: Space.xl },
}));
