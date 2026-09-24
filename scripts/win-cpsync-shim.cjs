/**
 * win-cpsync-shim.cjs —— 修补 Node 递归拷贝在非 ASCII 路径上的静默失效
 *
 * 【根因】本机实测（node v22.22.2 / Windows）：
 *   fs.cpSync(src, dest, { recursive: true, force: true })
 *   当 dest 路径**含任何非 ASCII 字符**时（中文、拉丁重音字母都算），
 *   会「不抛异常、也不落地」—— 目标目录压根没被创建。
 *   同一路径下 fs.mkdirSync / fs.copyFileSync 完全正常。
 *   纯 ASCII 路径（含 C: 盘、E:\WorkBuddy\xxx）则正常。
 *   判据见 .workbuddy/tmp/probe2..probe4.cjs 的实验矩阵。
 *
 * 【为什么需要】`expo prebuild` 生成原生工程的最后一步就是
 *   @expo/cli/build/src/utils/dir.js 的 copySync() -> fs.cpSync()，
 *   于是模板文件全部「拷了个寂寞」，随后 config-plugins 报
 *   `Project file "MainApplication" does not exist in android project`。
 *
 * 【做法】给 cpSync / cp / promises.cp 套一层：
 *   先走原生实现；**再校验是否真的落地**（存在性 + 目录第一层条目抽查）；
 *   没落地就退回手写递归拷贝（全用 mkdirSync/copyFileSync，实测可用）。
 *
 * 【用法】
 *   - prebuild:  node scripts/prebuild-android.cjs
 *   - 其他 CLI:  NODE_OPTIONS="--require <本文件绝对路径>" <命令>
 *   - 详细日志:  置 CP_SHIM_VERBOSE=1
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TAG = '[cp-shim]';

function manualCopySync(src, dest, opts) {
  opts = opts || {};
  if (typeof opts.filter === 'function' && !opts.filter(src, dest)) return;

  const st = fs.lstatSync(src);

  if (st.isSymbolicLink()) {
    try {
      fs.symlinkSync(fs.readlinkSync(src), dest);
    } catch {
      /* 目标已存在等情况，best effort */
    }
    return;
  }

  if (st.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      manualCopySync(path.join(src, ent.name), path.join(dest, ent.name), opts);
    }
    if (opts.preserveTimestamps) {
      try {
        fs.utimesSync(dest, st.atime, st.mtime);
      } catch {
        /* ignore */
      }
    }
    return;
  }

  fs.copyFileSync(src, dest);
  if (opts.preserveTimestamps) {
    try {
      fs.utimesSync(dest, st.atime, st.mtime);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 原生拷贝是否真的落地。
 * 注意不能只看 dest 是否存在 —— 复现过「dest 是我预先建好的空目录、
 * 里面一条子项都没拷进去」的形态，所以目录还要抽查第一层条目。
 */
function landed(src, dest) {
  if (!fs.existsSync(dest)) return false;

  let st;
  try {
    st = fs.statSync(src);
  } catch {
    return true;
  }
  if (!st.isDirectory()) return true;

  let entries;
  try {
    entries = fs.readdirSync(src);
  } catch {
    return true;
  }
  for (const name of entries) {
    if (!fs.existsSync(path.join(dest, name))) return false;
  }
  return true;
}

function fallback(label, src, dest, opts) {
  console.error(`${TAG} ${label} 在非 ASCII 目标上静默失效，退回手写递归拷贝: ${dest}`);
  manualCopySync(String(src), String(dest), opts);
}

const origCpSync = fs.cpSync;
fs.cpSync = function cpSync(src, dest, opts) {
  const ret = origCpSync.call(fs, src, dest, opts);
  if (!landed(src, dest)) fallback('fs.cpSync', src, dest, opts);
  return ret;
};

const origCp = fs.cp;
fs.cp = function cp(src, dest, opts, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = undefined;
  }
  return origCp.call(fs, src, dest, opts, (err) => {
    if (!err && !landed(src, dest)) {
      try {
        fallback('fs.cp', src, dest, opts);
      } catch (e) {
        return cb(e);
      }
    }
    return cb(err);
  });
};

const origPromiseCp = fs.promises.cp;
fs.promises.cp = async function cp(src, dest, opts) {
  const ret = await origPromiseCp.call(fs.promises, src, dest, opts);
  if (!landed(src, dest)) fallback('fs.promises.cp', src, dest, opts);
  return ret;
};

if (process.env.CP_SHIM_VERBOSE) {
  console.error(`${TAG} 已挂载：fs.cpSync / fs.cp / fs.promises.cp`);
}
