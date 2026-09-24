#!/usr/bin/env node
/**
 * prebuild-android.cjs —— 在本机（项目路径含中文）可靠地跑 expo prebuild
 *
 * 直接把 `npx expo prebuild` 跑在中文路径下会失败：
 *   AssertionError: Project file "MainApplication" does not exist in android project
 * 原因见 scripts/win-cpsync-shim.cjs 头部注释（Node 递归拷贝在非 ASCII 路径上静默失效）。
 *
 * 本脚本先挂上 shim，再把参数透传给 expo CLI。
 *
 * 用法：
 *   node scripts/prebuild-android.cjs                       # 默认 android, --no-install
 *   node scripts/prebuild-android.cjs prebuild --platform android --clean
 *
 * 注意：**只有首次建原生工程才该跑 prebuild**。之后 android/ 里会有手工改过的
 * 签名配置、arm64-v8a 单架构、权限收敛，重跑会被覆盖。
 */
'use strict';

const path = require('path');

require(path.join(__dirname, 'win-cpsync-shim.cjs'));

const passthrough = process.argv.slice(2);
const args = passthrough.length ? passthrough : ['prebuild', '--platform', 'android', '--no-install'];

// expo CLI 用的 arg 库在模块加载时就读取 process.argv.slice(2)
process.argv = [process.argv[0], 'expo', ...args];

const projectRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');

console.error(`[prebuild-android] projectRoot = ${projectRoot}`);
console.error(`[prebuild-android] argv        = ${args.join(' ')}`);

require(cliEntry);
