/**
 * 岁时 · UUID 生成
 *
 * 主键必须 UUID，不能自增：将来若要做导入合并，自增必然撞车。
 * 单机场景不需要密码学强度，手写 v4 足够 —— 也省掉一个运行时依赖。
 */

const HEX = '0123456789abcdef';

function fallbackUUID(): string {
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      // 变体位：8 ~ b
      out += HEX[((Math.random() * 4) | 0) + 8];
    } else {
      out += HEX[(Math.random() * 16) | 0];
    }
  }
  return out;
}

export function uuid(): string {
  // 有的运行时（新版本 Hermes / Web 预览）自带 randomUUID，用上它更好；
  // 没有就退回手写实现。断言成宽松形状，避免在 RN 类型里找不到 crypto 定义。
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const impl = g.crypto?.randomUUID;
  if (typeof impl === 'function') return impl.call(g.crypto);
  return fallbackUUID();
}

/** 短 ID，仅用于日志与调试，不作主键 */
export function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8);
}
