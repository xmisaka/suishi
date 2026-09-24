#!/usr/bin/env node
/**
 * build-apk.cjs —— 本地构建 Android release APK（不经 EAS 云构建、不需要 Expo 账号）
 *
 * 本机（Windows）要点：
 *   · RN gradle-plugin 要求 JDK 17（本机在 D:\Android\jdk-17）
 *   · GRADLE_USER_HOME 指向 D:\Android\gradle-home，复用已缓存的 gradle 发行包与依赖
 *   · 串行构建（--no-parallel / workers.max=1）规避企业 EDR 偶发拦截 Gradle 缓存文件锁
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ★★ 本机坑位：spawnSync 用默认的 stdio:'pipe' 会 EBUSY ★★
 * ════════════════════════════════════════════════════════════════════════════
 * 症状：同步镜像一步直接报 `robocopy 退出码 = null`，且**没有任何输出**，
 *       `r.error.code` 是 EBUSY —— 进程压根没被创建出来。
 *
 * 实测矩阵（两个 node 版本 22.15.0 / 22.22.2 行为一致，故与 node 版本无关）：
 *
 *   spawnSync  stdio:'pipe'（默认）           ✗ EBUSY
 *   spawnSync  stdio:'ignore'                 ✓ 正常
 *   spawnSync  stdio:'inherit'                ✓ 正常
 *   spawnSync  stdio:[ignore, fd, fd]         ✓ 正常（fd 直接给文件）
 *   spawn() 异步 任何 stdio（含 pipe）         ✓ 正常
 *
 * 即：只有 **同步 spawn 走管道** 这条路径在本机不可用（异步管道不受影响，
 * 所以这不是沙箱禁子进程，也不是 robocopy 的问题 —— `cmd.exe` 同样 EBUSY）。
 *
 * 对策：凡是「同步起子进程 + 要读它的输出」，一律**把输出写进临时文件再读回**，
 *       不要用默认管道。见下面的 runSyncCaptured()。
 *       gradle 那步用的是 stdio:'inherit'，本来就安全，不用动。
 *
 * ⚠️ 另：spawnSync 失败时**务必把 r.error.code 打出来**。
 *    它和「子进程正常退出但返回非零」在只看 r.status 时长得一模一样
 *    （都是 null/数字），不打印 error 会白查很久。
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ★★ 为什么必须在纯 ASCII 的镜像目录里构建 ★★
 * ════════════════════════════════════════════════════════════════════════════
 * 项目根是 E:\WorkBuddy\纪念日（含中文），整条原生工具链都吃不下：
 *
 *   1. AGP 直接拒收非 ASCII 项目路径（b.android.com/95744）。
 *      android.overridePathCheck=true 只是关掉那道护栏，不解决底层。
 *   2. CMake 生成的 cmake_pch.hxx 里，绝对路径按 **GBK** 落盘
 *      （字节 \xbc\xcd\xc4\xee\xc8\xd5），而 clang 按 UTF-8 读源码，于是：
 *      fatal error: cannot open file '...WorkletsPCH.h'
 *   3. Gradle 回读 node stdout 时按 GBK 解码 UTF-8 → 内存里的路径已损坏。
 *      日志里中文看着正常，是因为打印时又用同一 GBK 编回去、误差自我抵消
 *      —— **日志会骗人**，别拿日志里看着正常的中文当证据。
 *
 * 试过并**证伪**的两条捷径（别再走一遍）：
 *
 *   · 目录 junction 别名（E:\WorkBuddy\suishi -> 纪念日）
 *       ✗  process.cwd() / fs.realpathSync 都会解析回中文真名
 *   · subst 盘符（subst T: "E:\WorkBuddy\纪念日"）
 *       ✓  cwd / fs.realpathSync 这一半是对的，确实保持 T:\…
 *       ✗  但 expo-modules-autolinking/utils.js:81 有一次**显式**的
 *          fs.promises.realpath，会把 subst 盘符还原成中文真名，
 *          中文路径照样喂进 C++ 编译
 *       ✗  且 expo-modules-autolinking 的「向上找 package.json」在
 *          「项目根 == 盘符根」时有个 off-by-one，必然抛
 *          Couldn't find "package.json" up from path "T:\android"
 *       这两点都无法用 Node 启动开关绕开（--preserve-symlinks 也无效）
 *
 * 结论：**真身必须是物理上的 ASCII 路径**。本脚本的做法是
 * 「源工程原地不动 + 增量镜像到 ASCII 目录 + 在镜像里构建」：
 *   · 你在 E:\WorkBuddy\纪念日 里照常改代码（工作区路径不变）
 *   · 每次构建前自动把源同步到镜像（robocopy /MIR，增量，通常几十秒）
 *   · 构建产物从镜像拷回源目录的 dist/
 *   · 镜像里的构建缓存（build/ 与 .cxx/）不在同步范围内，热构建依然快
 *
 * 若日后想把镜像转正（源整体搬到 ASCII 路径），把 ROOT 换成镜像路径、
 * 去掉 syncMirror 即可 —— 详见 .workbuddy/memory。
 *
 * 用法：
 *   node scripts/build-apk.cjs                    # assembleRelease
 *   node scripts/build-apk.cjs assembleDebug      # 换任务
 *   node scripts/build-apk.cjs --clean            # 先清镜像里的构建缓存
 *   SUISHI_BUILD_DIR=E:\some\ascii\dir node scripts/build-apk.cjs
 *
 * ⚠️ 前台跑会被约 2 分钟的超时砍掉，请用后台任务运行并重定向日志。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHIM = path.join(__dirname, 'win-cpsync-shim.cjs');
const ROBOCOPY = 'C:\\Windows\\System32\\Robocopy.exe';

const CLEAN = process.argv.includes('--clean');
const TASK =
  process.argv.slice(2).find((a) => !a.startsWith('-')) || 'assembleRelease';

/* ------------------------------------------------------------------ 镜像目录 */

const MIRROR = path.resolve(process.env.SUISHI_BUILD_DIR || 'E:\\WorkBuddy\\suishi-build');

if (!/^[\x00-\x7F]+$/.test(MIRROR)) {
  console.error('✘ 镜像目录必须是纯 ASCII 路径，当前：', MIRROR);
  process.exit(1);
}
if (MIRROR === ROOT) {
  console.error('✘ 镜像目录不能等于源目录（那等于没解决中文路径问题）。');
  process.exit(1);
}
if (!fs.existsSync(ROBOCOPY)) {
  console.error('✘ 找不到 robocopy：', ROBOCOPY);
  process.exit(1);
}

/**
 * 相对源根，不参加同步的目录：全是可再生产物，同步过来只会拖慢构建。
 *
 * ★ /XD 必须给**绝对路径**（源侧 + 镜像侧各一份）。
 *   给裸目录名（如 `dist`）时 robocopy 会在**任意层级**匹配同名目录，
 *   于是 node_modules 里每个包的 `dist/` 全被排除 —— 镜像的 node_modules 会静默残缺，
 *   构建时报 `Cannot find module '...\@jridgewell\gen-mapping\dist\gen-mapping.umd.js'`，
 *   离病因十万八千里。已用夹具实测确认过这个语义差异。
 */
const SYNC_EXCLUDE_REL = [
  'android\\build',
  'android\\app\\build',
  'android\\.gradle',
  'android\\build-log',
  '.expo',
  '.workbuddy',
  'dist',
];

/**
 * Windows 命令行的输出在中文系统上多为 GBK（OEM 936），
 * 但也不保证 —— 先按 UTF-8 严格解，抛错再退回 GBK。
 */
function decodeBuf(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  }
}

/**
 * 同步起子进程并捕获它的输出。
 *
 * 不用 spawnSync 默认的 stdio:'pipe' —— 本机该路径返回 EBUSY（见文件头说明）。
 * 改成「把 stdout/stderr 都写进同一个临时文件，退出后读回字符串」，语义等价。
 */
function runSyncCaptured(exe, args) {
  const fout = path.join(os.tmpdir(), `suishi-spawn-${process.pid}-${Date.now()}.log`);
  const fd = fs.openSync(fout, 'w');
  try {
    const r = spawnSync(exe, args, { stdio: ['ignore', fd, fd] });
    let text = '';
    try {
      text = decodeBuf(fs.readFileSync(fout));
    } catch {
      /* 读不到就当空串 */
    }
    return { ...r, stdout: text, stderr: text };
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(fout);
    } catch {
      /* 临时文件残留不影响构建 */
    }
  }
}

/** 统计某目录下的文件数，用于同步后的完整性自检 */
function countFiles(dir) {
  let n = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === '.cxx') continue; // 镜像侧的原生缓存，源里本就没有
        walk(p);
      } else {
        n += 1;
      }
    }
  };
  walk(dir);
  return n;
}

/** 镜像里可能存在的原生构建缓存（源里没有，绝不能被 /MIR 清掉，否则每次都全量重编） */
function mirrorOnlyCacheDirs() {
  const out = [];
  const nm = path.join(MIRROR, 'node_modules');
  const probe = (dir) => {
    const cxx = path.join(dir, 'android', '.cxx');
    if (fs.existsSync(cxx)) out.push(cxx);
  };
  let entries = [];
  try {
    entries = fs.readdirSync(nm, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('@')) {
      let scoped = [];
      try {
        scoped = fs.readdirSync(path.join(nm, e.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const s of scoped) probe(path.join(nm, e.name, s.name));
    } else {
      probe(path.join(nm, e.name));
    }
  }
  return out;
}

function syncMirror() {
  const relExcludes = [...SYNC_EXCLUDE_REL];
  const absExcludes = [];

  if (CLEAN) {
    for (const d of [
      path.join(MIRROR, 'android', 'build'),
      path.join(MIRROR, 'android', 'app', 'build'),
      path.join(MIRROR, 'android', '.gradle'),
      ...mirrorOnlyCacheDirs(),
    ]) {
      if (fs.existsSync(d)) {
        console.log('[build-apk] --clean 删除   ', path.relative(MIRROR, d) || d);
        fs.rmSync(d, { recursive: true, force: true });
      }
    }
  } else {
    // 不清缓存时，要把镜像侧的 .cxx 也排除掉，否则 /MIR 会当成「源里没有的目录」删掉
    absExcludes.push(...mirrorOnlyCacheDirs());
  }

  const args = [ROOT, MIRROR, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1', '/MT:16', '/XD'];
  // 源侧 + 镜像侧各给一份绝对路径，避免裸名在任意层级误伤（见上面的说明）
  for (const rel of relExcludes) {
    args.push(path.join(ROOT, rel), path.join(MIRROR, rel));
  }
  for (const abs of absExcludes) {
    args.push(abs);
  }

  console.log(
    '[build-apk] 同步镜像       ',
    path.basename(MIRROR),
    `(排除 ${relExcludes.length} 个固定目录 + ${absExcludes.length} 个镜像缓存)`
  );
  const t0 = Date.now();
  const r = runSyncCaptured(ROBOCOPY, args);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  // robocopy 退出码是位标志：0-7 都算成功，>=8 才是真失败
  const code = r.status;
  if (code === null || code >= 8) {
    console.error('[build-apk] ✘ 镜像同步失败，robocopy 退出码 =', code);
    // ★ 务必打 r.error —— 只看 status 的话，「进程没起来」和「起来了但返回非零」
    //   长得一模一样（都是 null），不打印会白查很久
    if (r.error) console.error('[build-apk]   spawn 错误：', r.error.code, r.error.message);
    if (r.signal) console.error('[build-apk]   被信号终止：', r.signal);
    const tail = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-15).join('\n');
    if (tail) console.error(tail);
    process.exit(1);
  }
  console.log(`[build-apk] 同步完成       ${secs}s（robocopy 码 ${code}）`);

  // 完整性自检：node_modules 的文件数只可能「镜像 ≥ 源」（镜像还多出 .cxx 缓存，
  // 已在上面的统计里跳过）。一旦镜像更少，说明排除规则又误伤了，早报比晚报好。
  const srcNm = path.join(ROOT, 'node_modules');
  const dstNm = path.join(MIRROR, 'node_modules');
  if (fs.existsSync(srcNm) && fs.existsSync(dstNm)) {
    const a = countFiles(srcNm);
    const b = countFiles(dstNm);
    console.log(`[build-apk] 自检           node_modules 源 ${a} 个文件 / 镜像 ${b} 个`);
    if (b < a) {
      console.error(`[build-apk] ✘ 镜像的 node_modules 少了 ${a - b} 个文件，排除规则可能误伤；`);
      console.error('[build-apk]   删掉镜像目录后重跑：rm -rf ' + MIRROR);
      process.exit(1);
    }
  }
}

/* -------------------------------------------------------------------- 构建 */

if (!fs.existsSync(path.join(ROOT, 'android'))) {
  console.error('✘ android/ 不存在，请先跑 scripts/prebuild-android.cjs');
  process.exit(1);
}

syncMirror();

const ANDROID = path.join(MIRROR, 'android');
const SHIM_FOR_NODE = path.join(MIRROR, 'scripts', 'win-cpsync-shim.cjs');

const env = {
  ...process.env,
  JAVA_HOME: 'D:\\Android\\jdk-17',
  ANDROID_HOME: 'D:\\Android\\Sdk',
  ANDROID_SDK_ROOT: 'D:\\Android\\Sdk',
  GRADLE_USER_HOME: 'D:\\Android\\gradle-home',
  // 兜底：万一还有哪条支路把路径解析回中文，递归拷贝 shim 仍能防住
  NODE_OPTIONS: `--require ${fs.existsSync(SHIM_FOR_NODE) ? SHIM_FOR_NODE : SHIM}`,
};

const args = [
  TASK,
  '--no-daemon',
  '--console=plain',
  '--stacktrace',
  '--no-parallel',
  '-Dorg.gradle.vfs.watch=false',
  '-Dorg.gradle.daemon=false',
  '-Dorg.gradle.workers.max=1',
];

console.log('[build-apk] task           =', TASK);
console.log('[build-apk] 源（真身）     =', ROOT);
console.log('[build-apk] 构建根（ASCII） =', MIRROR);
console.log('[build-apk] JAVA_HOME      =', env.JAVA_HOME);
console.log('[build-apk] GRADLE_USER_HOME=', env.GRADLE_USER_HOME);
console.log('[build-apk] NODE_OPTIONS   =', env.NODE_OPTIONS);
console.log('[build-apk] cwd            =', ANDROID);
console.log('[build-apk] args           =', args.join(' '));

/**
 * 不直接 spawn gradlew.bat —— Node 20+ 受 CVE-2024-27980 修复影响，
 * shell:false 下执行 .bat/.cmd 会直接 EINVAL（表现为退出码 null、无任何 gradle 输出）。
 * 这里改用 gradle wrapper 的 JAR 直接起，等价于 gradlew.bat 的行为，
 * 既不需要 shell，也绕开了 cmd.exe。
 */
const wrapperJar = path.join(ANDROID, 'gradle', 'wrapper', 'gradle-wrapper.jar');
const javaExe = path.join(env.JAVA_HOME, 'bin', 'java.exe');

if (!fs.existsSync(wrapperJar)) {
  console.error('✘ 找不到 gradle-wrapper.jar：', wrapperJar);
  process.exit(1);
}
if (!fs.existsSync(javaExe)) {
  console.error('✘ 找不到 java：', javaExe);
  process.exit(1);
}

const gradleArgv = [
  '-Dorg.gradle.appname=gradlew',
  '-classpath',
  wrapperJar,
  'org.gradle.wrapper.GradleWrapperMain',
  ...args,
];

/**
 * ★ Gradle 启动阶段有个**偶发**失败，必须自动重试。
 *
 * 症状：整个构建在全局配置阶段就死掉，日志里是
 *   Could not create service of type FileLockContentionHandler …
 *     > java.net.BindException: Address already in use: bind
 * Gradle 的 FileLockCommunicator 要 reserve 一个 UDP 端口，抢不到就抛这个。
 *
 * 实测是**环境抖动不是配置问题**：同一条命令、同一个镜像目录，
 * 两分钟后原样重跑就正常了。可它偏偏发生在最开头 —— 几秒就退出，
 * 白赔一次镜像同步 + 一整轮构建。所以这里自动重试。
 *
 * 若三次都失败，说明端口被**持续**占用（常见于同时开着 Android Studio / 别的 JVM），
 * 那就不该再空转：日志里会明说，处置办法是关掉那些程序再跑。
 *
 * ★ 2026-09-23 补第二类：**GRADLE_USER_HOME 的 journal 锁争用**。
 *
 * 症状：同样死在最开头，但报的是
 *   Could not create service of type FileAccessTimeJournal using
 *   GradleUserHomeScopeServices.createFileAccessTimeJournal().
 *     > java.io.FileNotFoundException: <G>:\...\caches\journal-1\journal-1.lock (拒绝访问。)
 *
 * 起因：Gradle 的 file-access 日志是**每个 GRADLE_USER_HOME 一份**，同一时刻只允许
 * 一个构建持有。本机 `D:\Android\gradle-home` 是共享的 —— 格物项目（在
 * `E:\WorkBuddy\Storage\gewu`）的构建一旦与岁时并发，先到者持锁，后者当场死在
 * 配置阶段。实测 19:00 那次就是撞上了格物 18:43 起的那个守护进程。
 *
 * 与端口抢占是**两种**病：端口那种两分钟自愈，锁这种要等**对家构建跑完**，
 * 而且它不抛 BindException —— 老的 FLAKY_RE 完全不认，脚本会直接退出不重试。
 * 所以单列一条，并且等得更久（锁要等的是分钟级的构建，不是秒级的抖动）。
 */
const MAX_GRADLE_ATTEMPTS = 3;
const FLAKY_RE = /BindException|FileLockContentionHandler|Address already in use/;
/** GRADLE_USER_HOME 的 journal 锁被别的构建占着（要等对家跑完，故等待更久） */
const LOCK_RE = /journal-1\.lock|FileAccessTimeJournal/;
const RETRY_WAIT_MS = 5000;
const RETRY_WAIT_LOCK_MS = 30000;

/** 起子进程并把 stdout/stderr **边转发边留尾部**（异步 spawn + 管道在本机是安全的） */
function spawnStreaming(exe, argv, opts) {
  return new Promise((resolve) => {
    const child = spawn(exe, argv, {
      cwd: opts.cwd,
      env: opts.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let tail = '';
    const absorb = (out) => (chunk) => {
      out.write(chunk); // 保持原有的「实时可见」行为
      tail = (tail + chunk.toString('utf8')).slice(-65536);
    };
    child.stdout.on('data', absorb(process.stdout));
    child.stderr.on('data', absorb(process.stderr));
    child.on('error', (error) => resolve({ status: null, signal: null, error, tail }));
    child.on('close', (status, signal) => resolve({ status, signal, error: null, tail }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let res;
  let waitNext = RETRY_WAIT_MS;
  let lastReason = '端口抢占';
  for (let attempt = 1; attempt <= MAX_GRADLE_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      console.warn(
        `[build-apk] ⚠ 上一次卡在 Gradle 启动阶段（${lastReason}），` +
          `${attempt}/${MAX_GRADLE_ATTEMPTS} 次尝试，等 ${waitNext / 1000}s 再起…`
      );
      await sleep(waitNext);
    }
    res = await spawnStreaming(javaExe, gradleArgv, { cwd: ANDROID, env });
    if (res.status === 0) break;

    const lockHit = LOCK_RE.test(res.tail);
    if (!lockHit && !FLAKY_RE.test(res.tail)) break; // 真失败，别重试

    waitNext = lockHit ? RETRY_WAIT_LOCK_MS : RETRY_WAIT_MS;
    lastReason = lockHit ? 'GRADLE_USER_HOME 的 journal 锁被别的构建占着' : '端口抢占';

    if (attempt === MAX_GRADLE_ATTEMPTS) {
      console.error(`[build-apk] ✘ ${lastReason}，重试 ${MAX_GRADLE_ATTEMPTS} 次仍未起得来。`);
      if (lockHit) {
        console.error('[build-apk]   处置：本机 D:\\Android\\gradle-home 被多个项目共用，');
        console.error('[build-apk]   同时只允许一个构建持锁 —— 等对家（如格物）构建跑完再重跑，');
        console.error('[build-apk]   或给本次构建单独指定一个 GRADLE_USER_HOME。');
      } else {
        console.error('[build-apk]   处置：关掉 Android Studio / 其他 Gradle 或 Java 程序后重跑。');
      }
    }
  }

  const status = res.status === null || res.status === undefined ? 1 : res.status;
  if (res.error) console.error('[build-apk] 启动失败：', res.error.code, res.error.message);
  console.log('[build-apk] gradle 退出码 =', res.status, res.signal ? `(signal ${res.signal})` : '');

  /* ------------------------------------------------------ 产物拷回源目录 */

  const apkInMirror = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (status === 0 && fs.existsSync(apkInMirror)) {
    const dist = path.join(ROOT, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    const apkOut = path.join(dist, 'app-release.apk');
    fs.copyFileSync(apkInMirror, apkOut);
    const mb = (fs.statSync(apkOut).size / 1024 / 1024).toFixed(2);
    console.log(`[build-apk] ✔ 产物已拷回    ${apkOut}  (${mb} MB)`);
  } else if (status === 0) {
    console.warn('[build-apk] ⚠ gradle 成功但没找到 APK：', apkInMirror);
  }

  process.exit(status);
})();
