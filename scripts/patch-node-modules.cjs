#!/usr/bin/env node
/**
 * patch-node-modules.cjs —— 修补 node_modules 里的上游 bug（幂等，可反复跑）
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 【补丁 1】expo-modules-autolinking 的「向上找 package.json」少查一层
 * ────────────────────────────────────────────────────────────────────────────
 * 上游代码（build/commands/autolinkingOptions.js 与 build/exports.js）：
 *
 *     for (let dir = root; path.dirname(dir) !== dir; dir = path.dirname(dir)) {
 *       const file = path.resolve(dir, 'package.json');
 *       if (fs.existsSync(file)) return file;
 *     }
 *
 * 循环条件是「父目录 !== 自己」，于是走到盘符根（C:\ / T:\）时**先退出、再没查过它**
 * —— 盘符根那一层永远被跳过。
 *
 * 平时不会暴露：项目在 E:\WorkBuddy\纪念日 时，从 ...\android 往上走，
 * 会在碰到 E:\ 之前就命中 E:\WorkBuddy\纪念日\package.json。
 * 只有「项目根正好落在盘符根」时才会踩到 —— 例如用 subst 把项目挂成 T: 盘。
 * 本项目最终改用 ASCII 镜像目录（E:\WorkBuddy\suishi-build）构建，
 * 已不依赖这个补丁；保留它是为了防住 substit 一类「项目根 == 盘符根」的场景。
 *
 * 修法（保持语义、只补上被跳过的那一层）：
 *
 *     for (let dir = root; ; dir = path.dirname(dir)) {
 *       const file = path.resolve(dir, 'package.json');
 *       if (fs.existsSync(file)) return file;
 *       if (path.dirname(dir) === dir) break;   // ← 查完根目录再退出
 *     }
 *
 * ⚠️ 这是改 node_modules，`npm install` / 换版本后会失效 —— 需要时重新跑一次本脚本。
 *
 * 用法：
 *   node scripts/patch-node-modules.cjs            # 打补丁
 *   node scripts/patch-node-modules.cjs --check    # 只报告状态，不改文件
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHECK_ONLY = process.argv.includes('--check');

/** 只在这些位置找 —— 全量扫 node_modules 太慢 */
const TARGETS = [
  'node_modules/expo-modules-autolinking/build/commands/autolinkingOptions.js',
  'node_modules/expo-modules-autolinking/build/exports.js',
];

/** 循环头：把「父目录 !== 自己」的条件去掉，改为无条件进入 + 末尾自行 break */
const HEADER_RE =
  /for \(let dir = (\w+); path_1\.default\.dirname\(dir\) !== dir; dir = path_1\.default\.dirname\(dir\)\) \{/;

/** 循环体末尾：在 for 的收尾大括号之前插入根目录判定 */
const TAIL_FROM =
  '        }\n' +
  '    }\n' +
  '    throw new Error(`Couldn\'t find "package.json" up from path "';
const TAIL_TO =
  '        }\n' +
  '        if (path_1.default.dirname(dir) === dir) {\n' +
  '            break;\n' +
  '        }\n' +
  '    }\n' +
  '    throw new Error(`Couldn\'t find "package.json" up from path "';

const MARKER = 'if (path_1.default.dirname(dir) === dir) {';

let changed = 0;
let already = 0;
let missing = 0;
let failed = 0;

for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  const label = rel.replace(/^node_modules\//, '');

  if (!fs.existsSync(file)) {
    console.log(`  ! ${label}（不存在，跳过）`);
    missing += 1;
    continue;
  }

  let src = fs.readFileSync(file, 'utf8');

  if (src.includes(MARKER)) {
    console.log(`  = ${label}（已打过补丁）`);
    already += 1;
    continue;
  }

  if (!HEADER_RE.test(src) || !src.includes(TAIL_FROM)) {
    console.log(`  ! ${label}（未找到预期代码，可能上游已改版 —— 需人工确认）`);
    missing += 1;
    continue;
  }

  if (CHECK_ONLY) {
    console.log(`  ✘ ${label}（未打补丁）`);
    failed += 1;
    continue;
  }

  let out = src.replace(HEADER_RE, 'for (let dir = $1; ; dir = path_1.default.dirname(dir)) {');
  out = out.replace(TAIL_FROM, TAIL_TO);

  // 语法自检：补丁把 for 头改成无限循环，写坏了就是死循环或语法错误，必须先验
  const tmp = file + '.patchcheck.tmp.js';
  fs.writeFileSync(tmp, out, 'utf8');
  const chk = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  if (chk.status !== 0) {
    console.log(`  ! ${label}（补丁后语法校验失败，已放弃）`);
    console.log((chk.stderr || '').trim().split('\n').slice(0, 3).join('\n'));
    failed += 1;
    continue;
  }

  fs.writeFileSync(file, out, 'utf8');
  console.log(`  ✔ ${label}`);
  changed += 1;
}

console.log('');
if (CHECK_ONLY) {
  console.log(failed ? `有 ${failed} 个文件尚未打补丁。` : '全部已就绪。');
  process.exit(failed ? 1 : 0);
}
const bits = [];
if (changed) bits.push(`改动 ${changed} 处`);
if (already) bits.push(`${already} 处已是最新`);
if (missing) bits.push(`${missing} 处跳过`);
console.log(bits.length ? bits.join('，') + '。' : '无需改动。');
process.exit(failed ? 1 : 0);
