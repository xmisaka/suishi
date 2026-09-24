#!/usr/bin/env node
/**
 * gen-keystore.cjs —— 生成 release 签名密钥，并写 key.properties 与凭据记录
 *
 * 只在**首次**发版时运行。密钥一旦用于发布过，就不能再换 ——
 * 换了之后新包无法覆盖安装旧包，用户只能卸载重装（数据会丢）。
 *
 * 用法：node scripts/gen-keystore.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const APP = path.join(ANDROID, 'app');

const KEYSTORE_NAME = 'suishi-release.keystore';
const KEYSTORE_PATH = path.join(APP, KEYSTORE_NAME);
const ALIAS = 'suishi';
const KEYTOOL = 'D:/Android/jdk-17/bin/keytool.exe';
const VALIDITY_DAYS = 10950; // ~30 年
const DNAME = 'CN=Suishi, OU=Personal, O=Suishi, C=CN';

if (fs.existsSync(KEYSTORE_PATH)) {
  console.error(`✘ 密钥已存在，拒绝覆盖：${KEYSTORE_PATH}`);
  console.error('  换密钥会导致新包无法覆盖安装已发布的版本。若确有需要，请手工删除后重跑。');
  process.exit(1);
}
if (!fs.existsSync(KEYTOOL)) {
  console.error(`✘ 找不到 keytool：${KEYTOOL}`);
  process.exit(1);
}
if (!fs.existsSync(APP)) {
  console.error('✘ android/app 不存在，请先跑 prebuild + patch-android');
  process.exit(1);
}

// 生成口令：大小写字母 + 数字，24 位，避开 shell/Properties 特殊字符
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
let pwd = '';
while (pwd.length < 24) {
  for (const b of crypto.randomBytes(24)) {
    if (pwd.length >= 24) break;
    if (b < 248) pwd += ALPHABET[b % ALPHABET.length];
  }
}

console.log('[1] 生成密钥库');
execFileSync(
  KEYTOOL,
  [
    '-genkeypair', '-v',
    '-storetype', 'PKCS12',
    '-keystore', KEYSTORE_PATH,
    '-alias', ALIAS,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', String(VALIDITY_DAYS),
    '-storepass', pwd,
    '-keypass', pwd,
    '-dname', DNAME,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);
console.log(`  ✔ ${KEYSTORE_PATH}`);
console.log(`  ✔ 大小 ${fs.statSync(KEYSTORE_PATH).size} 字节`);

console.log('[2] 写 android/key.properties');
fs.writeFileSync(
  path.join(ANDROID, 'key.properties'),
  `# 岁时 release 签名凭据 —— 已被 .gitignore 忽略，切勿提交\n` +
    `# 由 scripts/gen-keystore.cjs 生成\n` +
    `storeFile=${KEYSTORE_NAME}\n` +
    `storePassword=${pwd}\n` +
    `keyAlias=${ALIAS}\n` +
    `keyPassword=${pwd}\n`,
  'utf8'
);
console.log('  ✔ android/key.properties');

const record =
  '岁时 · Android release 签名密钥信息\n' +
  '============================================================\n\n' +
  '⚠️ 这份信息请务必另行备份（网盘 / 密码管理器 / 纸质记录）。\n' +
  '   密钥或口令丢失 = 以后再也无法覆盖安装已发布的版本，\n' +
  '   用户只能卸载重装，本地数据会清空。\n\n' +
  `生成时间      ：${new Date().toISOString()}\n` +
  `密钥库文件    ：${KEYSTORE_PATH}\n` +
  `               （相对 android/ 为 app/${KEYSTORE_NAME}）\n` +
  `密钥库口令    ：${pwd}\n` +
  `密钥别名      ：${ALIAS}\n` +
  `密钥口令      ：${pwd}\n` +
  `算法 / 长度   ：RSA 2048\n` +
  `有效期        ：${VALIDITY_DAYS} 天（约 30 年）\n` +
  `Distinguished Name：${DNAME}\n` +
  `包名          ：com.suishi.app\n\n` +
  '------------------------------------------------------------\n' +
  '校验签名（构建产物）：\n' +
  '  D:/Android/Sdk/build-tools/36.0.0/apksigner.bat verify --verbose --print-certs <apk>\n' +
  '------------------------------------------------------------\n';

console.log('[3] 写凭据记录');
const recordInProject = path.join(ROOT, '岁时-签名密钥信息.txt');
fs.writeFileSync(recordInProject, record, 'utf8');
console.log(`  ✔ ${recordInProject}`);

// 仓库外再存一份
const outside = path.join(path.dirname(ROOT), '岁时-签名密钥信息.txt');
try {
  fs.writeFileSync(outside, record, 'utf8');
  console.log(`  ✔ ${outside}（仓库外备份）`);
} catch (e) {
  console.log(`  ⚠ 仓库外备份失败（不影响构建）：${e.message}`);
}

// 记录文件本身也不该入库
const rootIgnore = path.join(ROOT, '.gitignore');
const cur = fs.existsSync(rootIgnore) ? fs.readFileSync(rootIgnore, 'utf8') : '';
if (!cur.includes('签名密钥信息')) {
  fs.writeFileSync(
    rootIgnore,
    cur.replace(/\s*$/, '\n') + '\n# 签名凭据记录，绝不可入库\n*签名密钥信息.txt\n',
    'utf8'
  );
  console.log('  ✔ 已把记录文件加入根 .gitignore');
}
