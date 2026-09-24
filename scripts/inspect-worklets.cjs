#!/usr/bin/env node
/**
 * 诊断 react-native-worklets / Reanimated 的
 * 「Tried to synchronously call a Remote Function」类崩溃。
 *
 * ── 为什么需要它 ─────────────────────────────────────────────
 * worklets 0.10 起，worklet 闭包里捕获的**普通 JS 函数**不再被自动 worklet 化，
 * 而是被包成「remote function」：只能经 runOnJS / scheduleOnRN 异步调度回
 * JS 线程。若在 UI 线程上**同步**调用它，直接抛错：
 *
 *   [Worklets] Tried to synchronously call a Remote Function.
 *   Called "anonymous" on the UI Runtime.
 *
 * release 包里没有红屏 —— 进程直接终止，看起来像原生崩溃。
 * 于是极容易被误诊为导航、触感、SVG 或数据库的问题。
 *
 * ── 用法 ─────────────────────────────────────────────────────
 *   node inspect-worklets.cjs <文件或目录> [更多路径...]
 *
 * 默认扫 src/ 下所有 .ts/.tsx/.js/.jsx（目录会递归）。
 * 产物写到 <工件目录>/worklets-inspect/<文件名>.compiled.js，便于人工核对。
 *
 * ── 判据 ─────────────────────────────────────────────────────
 * 逐个 worklet 看它的 __closure：
 *   某个名字**在函数体里被当作函数调用**（`name(`），
 *   却**没有 __workletHash**，也不在已知的 worklets/Reanimated 内置表里
 *   → 就是它。加 `'worklet'` 指令，或改成 runOnJS(fn) 调用。
 *
 * 脚本会把这个判断自动跑一遍并打印 ⚠。退出码 1 表示有可疑项。
 */

const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------ 参数 */

const args = process.argv.slice(2);
if (args.length === 0) args.push('src');

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function collect(target) {
  const out = [];
  const st = fs.statSync(target);
  if (st.isFile()) {
    if (CODE_EXT.has(path.extname(target))) out.push(target);
    return out;
  }
  for (const name of fs.readdirSync(target)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    out.push(...collect(path.join(target, name)));
  }
  return out;
}

/* ------------------------------------------------------------ 已知安全的名字 */

/**
 * worklets / Reanimated 自己导出的、可以在 UI 线程上同步调用的东西。
 * 这些不需要 __workletHash（它们是库的 host function 或本身就是 worklet）。
 */
const SAFE_CALLS = new Set([
  // 动画
  'withTiming', 'withDelay', 'withSpring', 'withDecay', 'withSequence',
  'withRepeat', 'withClamp', 'cancelAnimation', 'defineAnimation',
  // 跨线程
  'runOnJS', 'runOnUI', 'scheduleOnRN', 'scheduleOnUI',
  // 工具
  'interpolate', 'interpolateColor', 'clamp', 'defined', 'isSharedValue',
  'makeMutable', 'createWorkletRuntime', 'runOnRuntime', 'measure',
  'dispatchCommand', 'setGestureState', 'getAnimatedStyle',
  // 缓动
  'Easing', 'LinearTransition', 'FadeIn', 'FadeOut', 'SlideInDown',
  // 杂项内置
  'require', 'Math', 'Number', 'Object', 'Array', 'String', 'JSON',
  'Boolean', 'Date', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
]);

/* ------------------------------------------------------------ 编译 */

const workletDir = path.resolve('.workbuddy/tmp/worklets-inspect');
fs.mkdirSync(workletDir, { recursive: true });

const plugin = require('react-native-worklets/plugin');

let totalWorklets = 0;
let totalSuspects = 0;

for (const file of args.flatMap(collect)) {
  let code;
  try {
    const res = babel.transformFileSync(path.resolve(file), {
      babelrc: false,
      configFile: false,
      filename: path.resolve(file),
      parserOpts: { plugins: ['jsx', 'typescript'] },
      plugins: [[plugin, {}]],
      generatorOpts: { compact: false, comments: false },
    });
    code = res.code;
  } catch (err) {
    console.log(`✗ ${file} —— 编译失败：${err.message}`);
    continue;
  }

  const dest = path.join(
    workletDir,
    path.basename(file).replace(/\.(tsx?|jsx?|mjs|cjs)$/, '') + '.compiled.js'
  );
  fs.writeFileSync(dest, code, 'utf8');

  // 所有带 hash 的 worklet 名字
  const hashed = new Set();
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\.__workletHash\s*=/g)) {
    hashed.add(m[1]);
  }

  // 每个 worklet 的闭包
  const closures = [];
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\.__closure\s*=\s*\{([^}]*)\}/g)) {
    const keys = m[2]
      .split(',')
      .map((s) => s.trim().split(':')[0].trim())
      .filter(Boolean);
    closures.push({ name: m[1], keys });
  }

  // 每个 worklet 压缩后的函数体（init data 里的 code 字段）
  const bodies = new Map();
  for (const m of code.matchAll(/code:\s*"((?:[^"\\]|\\.)*)"/g)) {
    let body;
    try {
      body = JSON.parse(`"${m[1]}"`);
    } catch {
      continue;
    }
    const fn = body.match(/^function\s+([A-Za-z_$][\w$]*)/);
    if (fn) bodies.set(fn[1], body);
  }

  const local = [];
  for (const c of closures) {
    const body = bodies.get(c.name) ?? '';
    const called = new Set();
    for (const k of c.keys) {
      // 被当函数调用：name( —— 注意排除 name) 这种「只当引用传走」的用法
      if (new RegExp(`(^|[^\\w$.])${k}\\s*\\(`).test(body)) called.add(k);
    }
    const suspects = [...called].filter((k) => !hashed.has(k) && !SAFE_CALLS.has(k));
    totalWorklets += 1;
    if (suspects.length) totalSuspects += suspects.length;
    local.push({ ...c, called: [...called], suspects });
  }

  const bad = local.filter((c) => c.suspects.length);
  if (!local.length) continue;

  console.log(`\n━━ ${file}`);
  console.log(`   worklet ${local.length} 个，产物 ${path.relative(process.cwd(), dest)}`);
  if (!bad.length) {
    console.log('   ✓ 闭包内没有「被同步调用但又不是 worklet」的函数');
    continue;
  }
  for (const c of bad) {
    console.log(`   ⚠ ${c.name}`);
    for (const s of c.suspects) console.log(`       ${s}()  ← 不是 worklet，被同步调用`);
  }
}

console.log(
  `\n合计 worklet ${totalWorklets} 个，可疑点 ${totalSuspects} 处。` +
    (totalSuspects ? '\n给这些函数加 \'worklet\' 指令，或改用 runOnJS(fn) 调度。' : '')
);

process.exit(totalSuspects ? 1 : 0);
