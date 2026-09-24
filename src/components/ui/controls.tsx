/**
 * 格物 · 交互控件
 */

import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { GUTTER, Palette, Radius, Space, Type, type Tokens } from '@/constants/theme';
import { makeStyles, useTheme } from '@/lib/theme';
import { Body, Label } from './typography';

/* ------------------------------------------------------------ 按钮 */

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  /** 撑满整行；默认 true */
  block?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  icon,
  disabled,
  loading,
  block = true,
  size = 'md',
  style,
}: ButtonProps) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const inert = disabled || loading;
  const palette = buttonTone(tokens, tone);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert }}
      disabled={inert}
      onPress={onPress}
      android_ripple={{ color: palette.ripple, borderless: false }}
      style={({ pressed }) => [
        styles.button,
        size === 'lg' && styles.buttonLg,
        block && styles.buttonBlock,
        { backgroundColor: palette.bg, borderColor: palette.border },
        inert && styles.buttonInert,
        pressed && !inert && styles.buttonPressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Ionicons name={icon} size={size === 'lg' ? 19 : 17} color={palette.fg} /> : null}
          <Label style={[styles.buttonLabel, { color: palette.fg }]}>{label}</Label>
        </View>
      )}
    </Pressable>
  );
}

interface ButtonToneStyle {
  bg: string;
  fg: string;
  border: string;
  ripple: string;
}

/**
 * 按钮色组。
 *
 * 写成按令牌解析的函数，而不是一张模块级常量表 ——
 * 常量表在模块加载那一刻就把品牌色求死了，换肤时不会跟着变。
 */
function buttonTone(t: Tokens, tone: ButtonTone): ButtonToneStyle {
  switch (tone) {
    case 'primary':
      return { bg: t.brand, fg: t.onAccent, border: t.brand, ripple: t.rippleOnAccent };
    case 'secondary':
      return { bg: t.surface, fg: t.ink, border: t.line, ripple: t.ripple };
    case 'ghost':
      return { bg: 'transparent', fg: t.brand, border: 'transparent', ripple: t.ripple };
    case 'danger':
      return { bg: t.surface, fg: t.clay, border: t.line, ripple: t.ripple };
  }
}

/** 方角图标按钮，用于页头右侧 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'ink',
  size = 22,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accessibilityLabel: string;
  tone?: 'ink' | 'brand' | 'ink3';
  size?: number;
}) {
  const styles = useStyles();
  const color = tone === 'brand' ? Palette.brand : tone === 'ink3' ? Palette.ink3 : Palette.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

/* ------------------------------------------------------------ Chip */

export function Chip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      android_ripple={{ color: Palette.ripple, borderless: false }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}>
      <Label style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
        {label}
        {count != null ? ` ${count}` : ''}
      </Label>
    </Pressable>
  );
}

/** 横向滚动的 chip 行 */
export function ChipRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.chipRowWrap}>
      <View style={styles.chipRow}>{children}</View>
    </View>
  );
}

/* ------------------------------------------------------------ 分段控件 */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, active && styles.segmentActive]}>
            {opt.icon ? (
              <Ionicons
                name={opt.icon}
                size={14}
                color={active ? Palette.ink : Palette.ink3}
              />
            ) : null}
            <Label style={[styles.segmentLabel, { color: active ? Palette.ink : Palette.ink3 }]}>
              {opt.label}
            </Label>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------ 搜索框 */

export function SearchField({
  value,
  onChange,
  placeholder = '搜索物品 / 品牌 / 备注',
  onClear,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  onClear?: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={15} color={Palette.ink3} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Palette.ink4}
        style={styles.searchInput}
        returnKeyType="search"
        autoCorrect={false}
        allowFontScaling={false}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="清空搜索"
          hitSlop={8}
          onPress={() => {
            onChange('');
            onClear?.();
          }}>
          <Ionicons name="close-circle" size={16} color={Palette.ink4} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ 表单行 */

/** 表单字段容器：左标签、右内容、下分隔线 */
export function FormRow({
  label,
  required,
  children,
  last,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  last?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.formRow, !last && styles.formRowBorder]}>
      <Body style={styles.formLabel}>
        {label}
        {required ? <Body color={Palette.clay}> *</Body> : null}
      </Body>
      <View style={styles.formContent}>{children}</View>
    </View>
  );
}

/* ------------------------------------------------------------ 设置行 */

export interface SettingRowProps {
  label: string;
  /** 右侧的值。不传就是纯入口，只显示箭头 */
  value?: string;
  /**
   * 右值的语气。brand = 有引导意味（当前选择、待处理数），
   * ink3 = 纯说明性的次要信息。默认 brand。
   */
  valueTone?: 'brand' | 'ink' | 'ink3';
  /** 右侧箭头；默认跟着「能不能点」走 */
  chevron?: boolean;
  /** 本组最后一行，不画分隔线 */
  last?: boolean;
  onPress?: () => void;
}

/**
 * 设置行：左标签、右值、可选箭头。
 *
 * 「我的」页一律用它，不再区分带图标的入口行和纯信息行 ——
 * 图标在这里只增加噪声，一屏十几行时反而更难扫读。
 */
export function SettingRow({
  label,
  value,
  valueTone = 'brand',
  chevron,
  last,
  onPress,
}: SettingRowProps) {
  const styles = useStyles();
  const clickable = !!onPress;
  const showChevron = chevron ?? clickable;
  const valueColor =
    valueTone === 'brand' ? Palette.brand : valueTone === 'ink3' ? Palette.ink3 : Palette.ink;

  const inner = (
    <>
      <Body tone="ink2">{label}</Body>
      <View style={styles.settingRight}>
        {value ? (
          <Body color={valueColor} style={styles.settingValue} numberOfLines={1}>
            {value}
          </Body>
        ) : null}
        {showChevron ? (
          <Ionicons
            name="chevron-forward"
            size={16}
            color={clickable ? Palette.brand : Palette.ink4}
          />
        ) : null}
      </View>
    </>
  );

  if (!clickable) {
    return <View style={[styles.settingRow, !last && styles.settingRowBorder]}>{inner}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}，${value}` : label}
      onPress={onPress}
      android_ripple={{ color: Palette.ripple }}
      style={({ pressed }) => [
        styles.settingRow,
        !last && styles.settingRowBorder,
        pressed && styles.settingPressed,
      ]}>
      {inner}
    </Pressable>
  );
}

/* ------------------------------------------------------------ 空态用占位块 */

export function SkeletonBlock({ width, height }: { width: number | `${number}%`; height: number }) {
  const { tokens } = useTheme();
  return <View style={{ width, height, backgroundColor: tokens.line3, borderRadius: Radius.thumb }} />;
}

const useStyles = makeStyles((Palette) => ({
  /* button */
  button: {
    height: 44,
    borderRadius: Radius.button,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    overflow: 'hidden',
  },
  buttonLg: { height: 52 },
  buttonBlock: { alignSelf: 'stretch' },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  buttonInert: { opacity: 0.42 },
  buttonPressed: { opacity: 0.86 },

  /* icon button */
  iconButton: { padding: Space.xs },
  iconButtonPressed: { opacity: 0.5 },

  /* chip */
  chipRowWrap: { marginTop: Space.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, paddingHorizontal: GUTTER },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Palette.line,
    backgroundColor: Palette.surface,
    overflow: 'hidden',
  },
  chipSelected: { backgroundColor: Palette.brand, borderColor: Palette.brand },
  chipPressed: { opacity: 0.85 },
  chipLabel: { fontSize: 12.5, color: Palette.ink2 },
  chipLabelSelected: { color: Palette.onAccent, fontWeight: '600' },

  /* segmented */
  segmented: {
    flexDirection: 'row',
    backgroundColor: Palette.inset,
    borderRadius: Radius.thumb + 2,
    padding: 2,
    gap: 2,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.md,
    paddingVertical: 5,
    borderRadius: Radius.tag + 1,
  },
  segmentActive: { backgroundColor: Palette.surface },
  segmentLabel: { fontSize: 12.5, fontWeight: '500' },

  /* search */
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    height: 38,
    marginHorizontal: GUTTER,
    marginTop: Space.md,
    paddingHorizontal: Space.md,
    backgroundColor: Palette.inset,
    borderRadius: Radius.input,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    ...(Type.body as TextStyle),
    fontSize: 14,
    color: Palette.ink,
  },

  /* form */
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: Space.sm,
  },
  formRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Palette.line3 },
  formLabel: { width: 84, color: Palette.ink2 },
  formContent: { flex: 1 },

  /* 设置行 */
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
    minHeight: 46,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
  },
  settingRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.line3,
  },
  settingPressed: { backgroundColor: Palette.surface2 },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  settingValue: { fontWeight: '500', textAlign: 'right' },
}));
