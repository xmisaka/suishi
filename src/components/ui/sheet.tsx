/**
 * 岁时 · 底部面板
 *
 * 录入页里所有的「选一个」都走这里：周期、历法、标记色、日期、年份。
 * 不做成路由的理由见 app/_layout.tsx —— 它们不承载独立语境，
 * 做成页面只会让返回栈和表单状态纠缠在一起。
 *
 * 两个组件，一个壳一个选单：
 *   SheetModal  —— 壳：遮罩、面板、页头、安全区
 *   ChoiceSheet —— 单选列表（周期 / 标记色这类枚举）
 */

import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER, Palette, Radius, Space } from '@/constants/theme';
import { makeStyles } from '@/lib/theme';
import { Body, Label, Title } from './typography';

export interface SheetModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 面板下方的固定操作区，例如「确定」 */
  footer?: ReactNode;
  /** 面板最高占屏比；选日期这类内容多的用 0.86 */
  maxHeightRatio?: number;
}

export function SheetModal({
  visible,
  title,
  onClose,
  children,
  footer,
  maxHeightRatio = 0.72,
}: SheetModalProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* 遮罩可点关闭。用 Pressable 而不是 TouchableWithoutFeedback，
            后者在 Android 上会和下面的滚动区抢手势 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭"
          style={styles.scrim}
          onPress={onClose}
        />

        <View
          style={[
            styles.panel,
            {
              maxHeight: `${Math.round(maxHeightRatio * 100)}%` as DimensionValue,
              paddingBottom: Math.max(insets.bottom, Space.lg),
            },
          ]}>
          <View style={styles.head}>
            <Title style={styles.headTitle}>{title}</Title>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="收起"
              hitSlop={10}
              onPress={onClose}
              style={styles.close}>
              <Ionicons name="close" size={20} color={Palette.ink2} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------ 单选列表 */

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** 右侧说明 */
  note?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** 不可选时的原因，例如「农历不与星期绑定」 */
  disabledReason?: string;
}

export function ChoiceSheet<T extends string>({
  options,
  value,
  onPick,
}: {
  options: ChoiceOption<T>[];
  value: T;
  onPick: (next: T) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.choices}>
      {options.map((opt) => {
        const active = opt.value === value;
        const disabled = !!opt.disabledReason;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onPick(opt.value)}
            android_ripple={{ color: Palette.ripple }}
            style={({ pressed }) => [
              styles.choice,
              active && styles.choiceActive,
              disabled && styles.choiceDisabled,
              pressed && !disabled && styles.choicePressed,
            ]}>
            {opt.icon ? (
              <Ionicons
                name={opt.icon}
                size={17}
                color={active ? Palette.brand : Palette.ink3}
              />
            ) : null}
            <View style={styles.choiceMain}>
              <Body tone={active ? 'brand' : 'ink'} style={styles.choiceLabel}>
                {opt.label}
              </Body>
              {disabled ? (
                <Label tone="ink4" style={styles.choiceNote}>
                  {opt.disabledReason}
                </Label>
              ) : opt.note ? (
                <Label tone="ink3" style={styles.choiceNote}>
                  {opt.note}
                </Label>
              ) : null}
            </View>
            {active ? <Ionicons name="checkmark" size={18} color={Palette.brand} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------ chip 组 */

/**
 * 可换行的 chip 选择组，用于月份、日、星期这类短选项。
 * 与 ChoiceSheet 的分工：选项短且多（12 个月、31 天）用 chip，
 * 选项长且带说明（周期规则）用列表。
 */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onPick,
  disabled,
}: {
  options: { value: T; label: string; disabledReason?: string }[];
  value: T;
  onPick: (next: T) => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.chips}>
      {options.map((opt) => {
        const active = opt.value === value;
        const off = disabled || !!opt.disabledReason;
        return (
          <Pressable
            key={String(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: off }}
            disabled={off}
            onPress={() => onPick(opt.value)}
            style={[styles.chip, active && styles.chipActive, off && styles.chipOff]}>
            <Label style={[styles.chipLabel, active && styles.chipLabelActive]}>{opt.label}</Label>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 小号方形步进按钮，用于年份的 ± */
export function StepButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        disabled && styles.chipOff,
        pressed && !disabled && styles.choicePressed,
      ]}>
      <Label tone={disabled ? 'ink4' : 'ink2'} style={styles.stepLabel}>
        {label}
      </Label>
    </Pressable>
  );
}

const useStyles = makeStyles((Palette) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: Palette.scrim },
  panel: {
    backgroundColor: Palette.surface,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.line2,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    paddingTop: Space.lg,
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.line3,
  },
  headTitle: { fontSize: 18 },
  close: { padding: Space.xs },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: GUTTER, paddingTop: Space.md, paddingBottom: Space.md },
  footer: {
    paddingHorizontal: GUTTER,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.line3,
  },

  choices: { gap: Space.xs },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.button,
    overflow: 'hidden',
  },
  choiceActive: { backgroundColor: Palette.brandBg },
  choiceDisabled: { opacity: 0.5 },
  choicePressed: { backgroundColor: Palette.surface2 },
  choiceMain: { flex: 1, gap: 2 },
  choiceLabel: { fontWeight: '500' },
  choiceNote: { fontSize: 11.5 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: {
    minWidth: 46,
    paddingHorizontal: Space.md,
    paddingVertical: 7,
    borderRadius: Radius.tag + 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.line,
    backgroundColor: Palette.canvas,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: Palette.brand, borderColor: Palette.brand },
  chipOff: { opacity: 0.34 },
  chipLabel: { fontSize: 12.5, color: Palette.ink2 },
  chipLabelActive: { color: Palette.onAccent, fontWeight: '600' },

  step: {
    minWidth: 40,
    paddingHorizontal: Space.sm,
    paddingVertical: 7,
    borderRadius: Radius.tag + 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.line,
    backgroundColor: Palette.canvas,
    alignItems: 'center',
  },
  stepLabel: { fontSize: 12.5, fontWeight: '600' },
}));
