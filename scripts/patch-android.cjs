#!/usr/bin/env node
/**
 * patch-android.cjs —— prebuild 之后必须手工套用的几项原生工程改动（幂等）
 *
 * 为什么要有这个脚本：`expo prebuild` 会把 android/ 覆盖回模板状态，
 * 而下面这些改动是**必须存在、漏了不一定报错**的：
 *   1. local.properties 的 sdk.dir      —— 缺了 gradle 找不到 SDK
 *   2. gradle.properties 单架构 arm64   —— 不改会打四架构，包体与耗时翻倍
 *   3. app/build.gradle 自有签名        —— 不改会用 debug 签名，无法覆盖安装已发布版本
 *   4. AndroidManifest 权限收敛         —— 去掉 SYSTEM_ALERT_WINDOW（开发菜单悬浮窗权限）
 *   5. android/.gitignore 忽略密钥      —— 防止 keystore / key.properties 进版本库
 *
 * 用法：node scripts/patch-android.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const A = path.join(ROOT, 'android');

const log = (...a) => console.log(...a);
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s, 'utf8');
let changed = 0;
function apply(label, file, fn) {
  const before = read(file);
  const after = fn(before);
  if (after === before) {
    log(`  = ${label}（已是目标状态）`);
    return;
  }
  write(file, after);
  changed += 1;
  log(`  ✔ ${label}`);
}

if (!fs.existsSync(A)) {
  console.error('✘ android/ 不存在，请先跑 scripts/prebuild-android.cjs');
  process.exit(1);
}

/* ---------- 1. local.properties：SDK 路径 ---------- */
log('[1] local.properties');
{
  const f = path.join(A, 'local.properties');
  const body =
    '## 本地 Android SDK 路径（本文件已被 .gitignore 忽略，不应提交）\n' +
    '## 由 WorkBuddy 生成：Android SDK 安装在 D:\\Android\\Sdk\n' +
    'sdk.dir=D:/Android/Sdk\n';
  const cur = fs.existsSync(f) ? read(f) : '';
  if (cur.trim() === body.trim()) {
    log('  = sdk.dir（已存在）');
  } else {
    write(f, body);
    changed += 1;
    log('  ✔ sdk.dir=D:/Android/Sdk');
  }
}
{
  const f = path.join(A, 'local.properties.example');
  if (!fs.existsSync(f)) {
    write(
      f,
      '# ============================================================\n' +
        '#  岁时 · 本地 Android SDK 路径模板\n' +
        '#\n' +
        '#  用法：复制本文件为同目录下的 local.properties，填入本机 SDK 路径。\n' +
        '#  真正的 local.properties 已被忽略，不会进入版本库。\n' +
        '# ============================================================\n\n' +
        '# Windows 示例：sdk.dir=D:/Android/Sdk\n' +
        '# macOS  示例：sdk.dir=/Users/yourname/Library/Android/sdk\n' +
        'sdk.dir=\n'
    );
    changed += 1;
    log('  ✔ local.properties.example');
  } else {
    log('  = local.properties.example');
  }
}

/* ---------- 2. gradle.properties：单架构 + 内存 ---------- */
log('[2] gradle.properties');
{
  const f = path.join(A, 'gradle.properties');
  apply('reactNativeArchitectures=arm64-v8a', f, (s) =>
    s.replace(/^reactNativeArchitectures=.*$/m, 'reactNativeArchitectures=arm64-v8a')
  );
  apply('org.gradle.jvmargs 提到 4096m + 强制 UTF-8', f, (s) =>
    s.replace(
      /^org\.gradle\.jvmargs=.*$/m,
      'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8'
    )
  );
}

/* ---------- 2b. 放行非 ASCII 项目路径 ---------- */
log('[2b] android.overridePathCheck');
{
  const f = path.join(A, 'gradle.properties');
  apply('android.overridePathCheck=true', f, (s) => {
    if (/^android\.overridePathCheck=/m.test(s)) return s;
    return (
      s.replace(/\s*$/, '\n') +
      '\n# 项目根 E:\\WorkBuddy\\纪念日 含中文字符，AGP 默认会直接拒绝构建。\n' +
      '# 本开关只是关掉那道「路径检查」护栏，并不解决 aapt2 在非 ASCII 路径上的\n' +
      '# 底层问题 —— 真出问题时请把工程挪到纯 ASCII 路径（详见 .workbuddy/memory）。\n' +
      'android.overridePathCheck=true\n'
    );
  });
}

/* ---------- 3. app/build.gradle：自有签名 ---------- */
log('[3] app/build.gradle');
{
  const f = path.join(A, 'app', 'build.gradle');

  apply('signingConfigs.release', f, (s) => {
    if (s.includes('signingConfigs.release')) return s;
    const anchor =
      "        debug {\n" +
      "            storeFile file('debug.keystore')\n" +
      "            storePassword 'android'\n" +
      "            keyAlias 'androiddebugkey'\n" +
      "            keyPassword 'android'\n" +
      "        }\n" +
      "    }\n";
    if (!s.includes(anchor)) {
      log('  ⚠ 未找到 signingConfigs.debug 锚点，跳过 release 配置');
      return s;
    }
    const insert =
      "        debug {\n" +
      "            storeFile file('debug.keystore')\n" +
      "            storePassword 'android'\n" +
      "            keyAlias 'androiddebugkey'\n" +
      "            keyPassword 'android'\n" +
      "        }\n" +
      "        release {\n" +
      "            // 自有签名密钥，凭据从 android/key.properties 读取。\n" +
      "            // 重跑 expo prebuild 会覆盖本文件，需重新执行 scripts/patch-android.cjs。\n" +
      "            if (rootProject.file(\"key.properties\").exists()) {\n" +
      "                def keyProps = new Properties()\n" +
      "                keyProps.load(new FileInputStream(rootProject.file(\"key.properties\")))\n" +
      "                storeFile file(keyProps['storeFile'])\n" +
      "                storePassword keyProps['storePassword']\n" +
      "                keyAlias keyProps['keyAlias']\n" +
      "                keyPassword keyProps['keyPassword']\n" +
      "            }\n" +
      "        }\n" +
      "    }\n";
    return s.replace(anchor, insert);
  });

  apply('release 使用自有签名', f, (s) =>
    s.replace(
      "        release {\n" +
        "            // Caution! In production, you need to generate your own keystore file.\n" +
        "            // see https://reactnative.dev/docs/signed-apk-android.\n" +
        "            signingConfig signingConfigs.debug\n",
      "        release {\n" +
        "            // 自有密钥签名；若 key.properties 缺失则回落 debug（仅供本地调试，\n" +
        "            // 这种包无法覆盖安装已发布版本）。\n" +
        "            signingConfig rootProject.file(\"key.properties\").exists() ? signingConfigs.release : signingConfigs.debug\n"
    )
  );
}

/* ---------- 4. AndroidManifest：权限收敛 ---------- */
log('[4] AndroidManifest.xml');
{
  const f = path.join(A, 'app', 'src', 'main', 'AndroidManifest.xml');
  apply('移除 SYSTEM_ALERT_WINDOW', f, (s) =>
    s.replace(
      '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>',
      '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"/>'
    )
  );
}

/* ---------- 5. android/.gitignore：忽略密钥 ---------- */
log('[5] android/.gitignore');
{
  const f = path.join(A, '.gitignore');
  apply('忽略 keystore / key.properties', f, (s) => {
    if (s.includes('key.properties')) return s;
    return (
      s.replace(/\s*$/, '\n') +
      '\n# 签名密钥与凭据 —— 绝不入库\n' +
      'key.properties\n' +
      '*.keystore\n' +
      '*.jks\n'
    );
  });
}

/* ---------- 6. key.properties 模板 ---------- */
log('[6] key.properties.example');
{
  const f = path.join(A, 'key.properties.example');
  if (!fs.existsSync(f)) {
    write(
      f,
      '# ============================================================\n' +
        '#  岁时 · release 签名配置模板\n' +
        '#\n' +
        '#  用法：把本文件复制为同目录下的 key.properties，填入真实口令。\n' +
        '#  真正的 key.properties 已被 .gitignore 排除，不会进入版本库。\n' +
        '#\n' +
        '#  ⚠️ 缺失本文件时构建不会中断，会静默回落到 debug 签名 ——\n' +
        '#     打出来的包无法覆盖安装已发布的版本，务必确认签名生效。\n' +
        '# ============================================================\n\n' +
        '# 密钥文件名（相对于 android/app/）\n' +
        'storeFile=suishi-release.keystore\n\n' +
        '# 密钥库口令\n' +
        'storePassword=\n\n' +
        '# 密钥别名\n' +
        'keyAlias=suishi\n\n' +
        '# 密钥口令\n' +
        'keyPassword=\n'
    );
    changed += 1;
    log('  ✔ key.properties.example');
  } else {
    log('  = key.properties.example');
  }
}

log('');
log(changed === 0 ? '全部已是目标状态，未做改动。' : `完成，共改动 ${changed} 处。`);
