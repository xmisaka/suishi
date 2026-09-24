/**
 * 格物 · 排版原子件
 *
 * 内容双轨：衬线管叙述（页面标题），无衬线管数据（条目名、金额、天数），
 * 数字一律开等宽对齐 —— 列表里金额纵向排齐后可信度完全不同。
 */

import { Text, type TextProps, type TextStyle } from 'react-native';

import { Type, type TokenName } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

type Tone = 'ink' | 'ink2' | 'ink3' | 'ink4' | 'brand' | 'sage' | 'amber' | 'clay' | 'inverse';

/**
 * tone → 令牌名。
 *
 * 刻意存令牌名而不是色值：色值必须在渲染那一刻才解析，
 * 写成模块级常量会把颜色固化在模块加载时，换肤就失效了。
 */
const TONE_TOKEN: Record<Tone, TokenName> = {
  ink: 'ink',
  ink2: 'ink2',
  ink3: 'ink3',
  ink4: 'ink4',
  brand: 'brand',
  sage: 'sage',
  amber: 'amber',
  clay: 'clay',
  /* 反色文字：压在品牌色 / 强调色上的前景。深色档不能是白色 */
  inverse: 'onAccent',
};

export interface BaseTextProps extends TextProps {
  tone?: Tone;
  /** 直接指定颜色，优先级高于 tone */
  color?: string;
}

function make(variant: keyof typeof Type) {
  const base = Type[variant] as TextStyle;
  return function VariantText({ tone = 'ink', color, style, ...rest }: BaseTextProps) {
    // 取 tokens 这个动作同时建立主题订阅：换肤时本组件才会重渲染
    const { tokens } = useTheme();
    return (
      <Text
        allowFontScaling={false}
        {...rest}
        style={[base, { color: color ?? tokens[TONE_TOKEN[tone]] }, style]}
      />
    );
  };
}

/** 页面主标题（衬线） */
export const Display = make('display');
/** 区块标题（衬线） */
export const Title = make('title');
/** 小标题（无衬线半粗） */
export const Heading = make('heading');
/** 条目名 */
export const ItemText = make('item');
/** 正文 */
export const Body = make('body');
/** 次级信息 */
export const Meta = make('meta');
/** 标签 */
export const Label = make('label');
/** 全大写小标 */
export const Eyebrow = make('eyebrow');
/** 大号数字 */
export const Num = make('num');
/** 中号数字 */
export const NumSm = make('numSm');
