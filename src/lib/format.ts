/**
 * 格物 · 格式化工具
 */

/** 金额：`8999` → `¥8,999`；`8999.5` → `¥8,999.50` */
export function formatMoney(value: number | null, opts?: { decimals?: 'auto' | 'always' }): string {
  if (value == null) return '未设置';
  const decimals = opts?.decimals ?? 'auto';
  const hasCents = Math.abs(value % 1) > 0.0001;
  const digits = decimals === 'always' || hasCents ? 2 : 0;
  return `¥${group(value.toFixed(digits))}`;
}

/** 日均成本：小额时给到分，避免「¥0.00」观感 */
export function formatDailyCost(value: number | null): string {
  if (value == null) return '';
  if (value >= 1) return `¥${group(value.toFixed(2))}`;
  if (value >= 0.01) return `¥${group(value.toFixed(2))}`;
  return `¥${value.toFixed(4)}`;
}

/** 千分位分组，保留符号与小数 */
function group(s: string): string {
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [int, frac] = body.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

/** 纯数字千分位，用于概览格 */
export function formatCount(n: number): string {
  return group(String(n));
}

/** 大额金额的紧凑写法，用于概览三格：`¥12,480` → `¥1.2万` */
export function formatMoneyCompact(value: number): string {
  if (value >= 100_000_000) return `¥${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `¥${(value / 10_000).toFixed(1)}万`;
  // 不用 toLocaleString：Hermes 上 locale 支持不稳定
  return `¥${group(String(Math.round(value)))}`;
}

/** 解析用户输入的金额，容忍全角与多余字符 */
export function parseMoneyInput(raw: string): number | null {
  if (!raw) return null;
  const normalized = raw
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[¥￥,\s]/g, '');
  if (!normalized) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** 文件体积 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 时间戳 → `2026.09.17 14:30` */
export function formatStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 取名称首字，用于无图时的占位方块 */
export function initialOf(name: string): string {
  const t = name.trim();
  if (!t) return '·';
  return /[a-zA-Z]/.test(t[0]) ? t[0].toUpperCase() : t[0];
}
