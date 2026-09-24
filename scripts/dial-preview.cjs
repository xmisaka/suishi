/**
 * 岁时 · 夜观盘实现预览
 *
 * 为什么要有这个脚本：方案丙的全部价值在「看起来怎么样」，而这恰恰是
 * 单元测试断言不了的东西。装到手机上看一次要一分多钟，改一次星野密度
 * 就要再看一次 —— 图上先看，比上机看快两个数量级。
 *
 * ★ 这里的几何**不是复刻**。`lib/dial.ts` 就是组件用的那个模块，
 *   编译后直接 require 进来；分至点刻的角度来自 `lib/calendar/lunar.ts`
 *   的 nextSolarTerms；颜色直接读 `constants/theme.ts` 的源码。
 *   所以这张图上的每个坐标、每个透明度，上机之后都一模一样。
 *   一旦发现图与真机不符，那说明预览脚本的**装配**写错了，
 *   而不是几何 —— 这正是这个脚本值得存在的前提。
 *
 * 跑法（幂等）：
 *   node_modules/.bin/tsc -p scripts/tsconfig.caltest.json
 *   node scripts/dial-preview.cjs
 *
 * 产出：星盘-夜观-实现预览.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_HTML = path.join(ROOT, '星盘-夜观-实现预览.html');

const CALTEST = path.join(ROOT, '.workbuddy', 'tmp', 'caltest');

/* ------------------------------------------------------------ 依赖 */

function need(p, hint) {
  if (!fs.existsSync(p)) {
    console.error(`缺少编译产物：${p}\n先跑：${hint}`);
    process.exit(1);
  }
  return require(p);
}

const dial = need(path.join(CALTEST, 'dial.js'), 'node_modules/.bin/tsc -p scripts/tsconfig.caltest.json');
const { nextSolarTerms } = need(
  path.join(CALTEST, 'calendar', 'lunar.js'),
  'node_modules/.bin/tsc -p scripts/tsconfig.caltest.json',
);

/* ------------------------------------------------------------ 令牌（读源码） */

/**
 * 直接正则解析 theme.ts，而不是编译它 —— 那个文件 import 了 react-native，
 * 为了拿几个色值把 RN 的类型体系拖进一个 node 脚本不值当。
 *
 * 代价是解析器对格式敏感。所以下面有一道自检：四套主题都必须解出
 * 三个 dialBed，缺一个就当场报错退出，绝不静默出一张颜色不对的图。
 */
function readThemes() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'constants', 'theme.ts'), 'utf8');
  const out = {};
  const block = /^ {2}(xuanye|cangqing|moyu|sujian):\s*\{([\s\S]*?)\n {2}\},/gm;

  let m;
  while ((m = block.exec(src))) {
    const tokens = {};
    const pair = /(\w+):\s*'([^']+)'/g;
    let p;
    while ((p = pair.exec(m[2]))) tokens[p[1]] = p[2];
    out[m[1]] = tokens;
  }

  const required = ['paper', 'ink', 'ink2', 'ink3', 'brand', 'dialBed1', 'dialBed2', 'dialBed3', 'sage', 'amber', 'clay'];
  for (const key of ['xuanye', 'cangqing', 'moyu', 'sujian']) {
    if (!out[key]) throw new Error(`theme.ts 里没解析出主题「${key}」，正则与源码格式脱节了`);
    for (const t of required) {
      if (!out[key][t]) throw new Error(`主题「${key}」缺令牌 ${t}`);
    }
  }
  return out;
}

const THEMES = readThemes();
const THEME_LABEL = { xuanye: '玄夜', cangqing: '苍青', moyu: '墨玉', sujian: '素笺' };
const THEME_NOTE = {
  xuanye: '墨底暖金（默认）',
  cangqing: '墨蓝月白',
  moyu: '墨绿玉色',
  sujian: '暖米白 —— 唯一需要单独确认的一套',
};

/* ------------------------------------------------------------ 夹具 */

const SIZE = 340;
const C = SIZE / 2;
const RING = C - 24;
const HORIZON = 366;

/** 今天 = 2026 秋分。选它是因为「今天恰好落在一道分至刻上」是最难看的边界 */
const TODAY = { y: 2026, m: 9, d: 23 };

/** 与方案页同一组示例数据：14 个条目，焦点 = 第 3 条（12 天，置顶） */
const ITEMS = [
  { days: 0, tone: 'brand', pinned: false },
  { days: 3, tone: 'clay', pinned: false },
  { days: 12, tone: 'brand', pinned: true },
  { days: 21, tone: 'amber', pinned: false },
  { days: 34, tone: 'sage', pinned: false },
  { days: 48, tone: 'clay', pinned: false },
  { days: 75, tone: 'brand', pinned: false },
  { days: 90, tone: 'amber', pinned: true },
  { days: 120, tone: 'sage', pinned: false },
  { days: 180, tone: 'clay', pinned: false },
  { days: 225, tone: 'brand', pinned: false },
  { days: 266, tone: 'amber', pinned: false },
  { days: 300, tone: 'sage', pinned: false },
  { days: 350, tone: 'clay', pinned: false },
];
const FOCUS_I = 2;

const degOf = (days) => (days / HORIZON) * 360;

/** 与 lib/tone.ts 的 dialBrightness 同源。5 行，不值得为它把 RN 拖进来 */
function brightness(days) {
  if (days < 0) return 0.35;
  if (days <= 7) return 1;
  if (days <= 30) return 0.85;
  if (days <= 120) return 0.6;
  return 0.42;
}

/*
 * 月首角度与光带分段**不再复刻** —— 直接调 lib/dial.ts 的 monthTicks()。
 *
 * 这一段以前是本文件自己算的（还顺手另写了一次日期差），与组件同源只靠一句
 * 注释撑着：组件哪天改了算法，这张图会安静地画成另一个样子 ——
 * 而「图与真机不符」恰恰是这张图最不能犯的错。已收进 dial.ts。
 */
const MONTH_TICKS = dial.monthTicks(TODAY, HORIZON);
const BANDS = dial.bandSegments(MONTH_TICKS);
const STARS = dial.makeStars(RING, SIZE);
const TERMS = nextSolarTerms(TODAY, HORIZON).map((t) => ({
  name: t.name,
  days: t.days,
  deg: degOf(t.days),
}));
const FOCUS_DEG = degOf(ITEMS[FOCUS_I].days);

/* ------------------------------------------------------------ 画 */

const n = (v) => Number(v).toFixed(2);
const escd = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** 静止层：盘面纵深 + 星野。**永远不转** */
function stillLayer(t) {
  const s = [];
  for (let i = 0; i < 3; i += 1) {
    const r = dial.BED_RATIOS[i] * RING;
    s.push(`<circle cx="${C}" cy="${C}" r="${n(r)}" fill="${t['dialBed' + (i + 1)]}"/>`);
  }
  for (const st of STARS) {
    s.push(
      `<circle cx="${n(st.x)}" cy="${n(st.y)}" r="${n(st.r)}" fill="${t.ink}" opacity="${st.o.toFixed(3)}"/>`,
    );
  }
  return s.join('\n');
}

/**
 * 月轮：十二个月号。与组件同源 —— 就是 dial.monthMarks(BANDS, TODAY.m)。
 *
 * `rot` 是这一层在屏幕上被转过的角度。数字的**位置**随盘走（角度 + rot），
 * **字面**用 rotate(-rot) 绕自身中心转回来 —— 这正是组件里 MonthLabel 的反向自转。
 * 合成图里 rot = −焦点角度，于是数字既跟着盘走、又永远正立。
 *
 * `y + 4` 是 SVG 的基线修正：text 的 y 指基线，11.5px 的字要下沉约 4px 才是视觉居中。
 */
function monthLabels(t, rot) {
  return dial
    .monthMarks(BANDS, TODAY.m)
    .map((m) => {
      const p = dial.polar(C, C, RING - dial.MONTH_LABEL_INSET, m.deg);
      return (
        `<text x="${n(p.x)}" y="${n(p.y + 4)}" text-anchor="middle" font-size="11.5" ` +
        `font-weight="500" fill="${t.ink2}" opacity="${m.opacity.toFixed(3)}" ` +
        `font-family="${SANS}" font-variant-numeric="tabular-nums" ` +
        `transform="rotate(${n(-rot)} ${n(p.x)} ${n(p.y)})">${m.label}</text>`
      );
    })
    .join('\n');
}

/** 旋转层：光带、月轮、刻度、金弧、光点、焦点。整层绕圆心转 `rot` = 焦点停在指针下 */
function spinLayer(t, rot) {
  const s = [];

  // 时间光带：外环本身就是分段弧，越远越暗
  BANDS.forEach((b, i) => {
    s.push(
      `<path d="${dial.arcPath(C, C, RING, b.from, b.to)}" fill="none" stroke="${t.brand}" ` +
        `stroke-width="2.4" stroke-linecap="round" opacity="${b.opacity}"/>`,
    );
  });

  // 分至点刻
  for (const term of TERMS) {
    s.push(
      `<path d="${dial.tickPath(C, C, RING, RING - 13, term.deg)}" stroke="${t.brand}" ` +
        `stroke-width="1.2" opacity="0.55"/>`,
    );
  }

  // 今天那道刻（0°）
  const tip = dial.polar(C, C, RING + 7, 0);
  s.push(
    `<path d="${dial.tickPath(C, C, RING + 4, RING - 11, 0)}" stroke="${t.brand}" ` +
      `stroke-width="1.5" stroke-linecap="round"/>`,
    `<circle cx="${n(tip.x)}" cy="${n(tip.y)}" r="2.2" fill="${t.brand}"/>`,
  );

  // 金弧：今天 → 焦点
  const arcLen = RING * Math.abs(FOCUS_DEG) * (Math.PI / 180);
  s.push(
    `<path d="${dial.arcPath(C, C, RING, 0, FOCUS_DEG)}" fill="none" stroke="${t.brand}" ` +
      `stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${n(arcLen)} ${n(arcLen)}"/>`,
  );

  // 光点：辉光在下，本体在上
  for (const it of ITEMS) {
    const p = dial.polar(C, C, RING, degOf(it.days));
    const r = it.pinned ? 5 : 3.4;
    const op = brightness(it.days);
    const halo = dial.HALO_MIN + (dial.HALO_MAX - dial.HALO_MIN) * op;
    s.push(
      `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r * dial.HALO_SCALE)}" fill="${t[it.tone]}" opacity="${halo.toFixed(3)}"/>`,
      `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${r}" fill="${t[it.tone]}" opacity="${op}"/>`,
    );
  }

  // 焦点：双环定形 + 最外一环呼吸（静态图取呼吸的中点）
  const fp = dial.polar(C, C, RING, FOCUS_DEG);
  const breathMid = dial.BREATH_MIN + dial.BREATH_RANGE * 0.5;
  s.push(
    `<circle cx="${n(fp.x)}" cy="${n(fp.y)}" r="10" fill="none" stroke="${t.brand}" stroke-width="1.4" opacity="0.9"/>`,
    `<circle cx="${n(fp.x)}" cy="${n(fp.y)}" r="16" fill="none" stroke="${t.brand}" stroke-width="1" opacity="0.26"/>`,
    `<circle cx="${n(fp.x)}" cy="${n(fp.y)}" r="22" fill="none" stroke="${t.brand}" stroke-width="0.8" opacity="${breathMid.toFixed(3)}"/>`,
  );

  // 月轮**最后画**：组件里它是一层压在 Svg 之上的 View，
  // 而焦点最外那环（r=22）径向够到 r≈124，正好擦过数字带 —— 顺序要跟组件一致
  s.push(monthLabels(t, rot));

  return s.join('\n');
}

/** 圆心：不随盘转，永远正面朝上。这里手排 5 行，对应组件的 flex 顺序 */
function core(t) {
  const rows = [
    `<text x="${C}" y="132" text-anchor="middle" font-size="17" fill="${t.ink}" font-family="${SANS}">结婚纪念日</text>`,
    `<text x="${C}" y="178" text-anchor="middle" font-size="46" font-weight="500" fill="${t.brand}" font-family="${SANS}">12</text>`,
    `<text x="${C + 40}" y="167" text-anchor="start" font-size="13" fill="${t.ink2}" font-family="${SANS}">天后</text>`,
    `<text x="${C}" y="204" text-anchor="middle" font-size="13" fill="${t.ink3}" font-family="${SANS}">2026 年 10 月 5 日 · 星期一</text>`,
    `<text x="${C}" y="221" text-anchor="middle" font-size="11.5" letter-spacing="0.6" fill="${t.ink3}" font-family="${SANS}">农历八月廿五</text>`,
    `<text x="${C}" y="236" text-anchor="middle" font-size="11.5" font-weight="600" fill="${t.brand}" font-family="${SANS}">第 3 周年</text>`,
  ];
  return rows.join('\n');
}

const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif";

/** 指针：固定在 12 点，**不随盘转**。尺寸与 SkyDial 的 styles.pointer 对齐（宽 10、高 7、top 2） */
function pointer(t) {
  return `<path d="M ${C - 5} 2 L ${C + 5} 2 L ${C} 9 Z" fill="${t.brand}"/>`;
}

function svgBody(t, layer) {
  const parts = [];
  if (layer !== 'spin') parts.push(stillLayer(t));
  if (layer === 'still') return `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;

  // 旋转层整层绕圆心转，焦点停在 12 点 —— 与组件 rotation 的终态等价。
  // 单看旋转层时不转（rot = 0），月轮的数字因此仍以盘坐标摆着，便于核对角度。
  const rot = layer === 'spin' ? 0 : -FOCUS_DEG;
  const spin = spinLayer(t, rot);
  if (layer === 'spin') {
    parts.push(spin);
  } else {
    parts.push(`<g transform="rotate(${n(rot)} ${C} ${C})">${spin}</g>`);
  }
  if (layer === 'both') parts.push(core(t), pointer(t));
  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

/* ------------------------------------------------------------ 特写模式 */

/*
 * `--plate <theme>` 只输出一张盘，铺满整个视口 —— 供无头 Chrome 截图后
 * 放大看细节。整页那张图在看结构，这张在看针脚：辉光的边界、
 * 星野会不会与光点混作一团、素笺的盘面纵深到底读不读得出来。
 */
const plateArg = process.argv.indexOf('--plate');
if (plateArg >= 0) {
  const key = process.argv[plateArg + 1] || 'xuanye';
  const t = THEMES[key];
  if (!t) {
    console.error(`未知主题「${key}」，可选：${Object.keys(THEMES).join(' / ')}`);
    process.exit(1);
  }
  const plate = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>plate · ${key}</title><style>
  html,body{margin:0;height:100%;background:${t.paper};display:flex;align-items:center;justify-content:center}
  .plate{width:900px;height:900px}
  .plate svg{display:block;width:100%;height:auto}
</style></head><body><div class="plate">${svgBody(t, 'both')}</div></body></html>`;
  const platePath = path.join(ROOT, '.workbuddy', 'tmp', `plate-${key}.html`);
  fs.writeFileSync(platePath, plate, 'utf8');
  console.log(platePath);
  process.exit(0);
}

/* ------------------------------------------------------------ 页面 */

const dialCard = (key, layer, note) => {
  const t = THEMES[key];
  return `
<figure class="dial">
  <div class="screen" style="background:${t.paper}">${svgBody(t, layer)}</div>
  <figcaption>${note}</figcaption>
</figure>`;
};

const BAND_LIST = dial.BAND_OPS.map((v) => v.toFixed(2)).join(' → ');
const MONTH_LIST = dial.MONTH_LABEL_OPS.map((v) => v.toFixed(2)).join(' → ');
const MONTH_MARKS = dial.monthMarks(BANDS, TODAY.m);
const STAR_PREVIEW = STARS.slice(0, 3)
  .map((s) => `(${s.x.toFixed(1)}, ${s.y.toFixed(1)}) r=${s.r.toFixed(2)} o=${s.o.toFixed(3)}`)
  .join(' ｜ ');

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>岁时 · 夜观盘实现预览</title>
<style>
  :root{
    --paper:#F7F4EF; --card:#FFFFFF; --ink:#2B241F; --ink2:#6B6055; --ink3:#9A8D80;
    --line:#E3DCD1; --line2:#EBE5DB; --brand:#8C5A34; --brand-d:#6B4224; --brand-bg:#F3E9DE;
    --serif:Georgia,"Songti SC","Source Han Serif SC",SimSun,serif;
    --sans:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--serif);
    font-size:16px;line-height:2.0;-webkit-font-smoothing:antialiased}
  .wrap{max-width:880px;margin:0 auto;padding:72px 32px 120px}
  header{border-bottom:1px solid var(--line);padding-bottom:36px;margin-bottom:48px}
  .eyebrow{font-family:var(--sans);font-size:11px;letter-spacing:.22em;text-transform:uppercase;
    color:var(--ink3);margin:0 0 18px}
  h1{font-size:34px;line-height:1.5;font-weight:400;margin:0 0 20px}
  h1 b{font-weight:400;color:var(--brand)}
  .lede{font-size:16.5px;color:var(--ink2);margin:0;max-width:66ch}
  h2{font-size:23px;font-weight:400;margin:72px 0 6px;padding-top:28px;border-top:1px solid var(--line2)}
  h2 .no{font-family:var(--sans);font-size:12px;color:var(--brand);letter-spacing:.16em;
    display:block;margin-bottom:10px}
  h3{font-size:19px;font-weight:400;margin:40px 0 10px}
  p{margin:0 0 20px}
  .muted{color:var(--ink2)}
  .sans{font-family:var(--sans);font-size:14.5px;line-height:1.95}
  em{font-style:normal;color:var(--brand-d);border-bottom:1px solid var(--brand-bg)}
  strong{font-weight:600}
  code{font-family:var(--sans);font-size:13px;background:var(--brand-bg);color:var(--brand-d);
    padding:1px 6px;border-radius:5px}
  figure.dial{margin:0;text-align:center}
  .screen{display:block;border-radius:20px;padding:20px;
    box-shadow:0 1px 2px rgba(43,36,31,.06),0 12px 32px -12px rgba(43,36,31,.28)}
  .screen svg{display:block;width:100%;height:auto}
  figcaption{font-family:var(--sans);font-size:12.5px;color:var(--ink3);margin-top:12px;line-height:1.7}
  .grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:36px 28px;margin:34px 0}
  .grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:30px 24px;margin:30px 0}
  .grid3 .screen{border-radius:18px;padding:16px}
  .tname{font-family:var(--sans);font-size:13px;font-weight:600;color:var(--ink);margin:0 0 2px}
  table{width:100%;border-collapse:collapse;margin:22px 0 26px;font-family:var(--sans);
    font-size:13.5px;line-height:1.75}
  th{text-align:left;font-weight:600;color:var(--ink2);font-size:12.5px;
    border-bottom:1px solid var(--line);padding:10px 12px 10px 0}
  td{border-bottom:1px solid var(--line2);padding:11px 12px 11px 0;vertical-align:top}
  td:first-child{white-space:nowrap;color:var(--brand-d);font-weight:600}
  tr:last-child td{border-bottom:none}
  .box{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:20px 22px;margin:26px 0;font-family:var(--sans);font-size:13.5px;line-height:1.9;
    color:var(--ink2)}
  .box b{color:var(--ink)}
  footer{border-top:1px solid var(--line);margin-top:80px;padding-top:28px;
    font-family:var(--sans);font-size:12.5px;color:var(--ink3);line-height:1.9}
  @media (max-width:640px){ .wrap{padding:44px 20px 80px} h1{font-size:26px} h2{font-size:20px} }
</style>
</head>
<body>
<div class="wrap">

<header>
  <p class="eyebrow">岁时 · 首页星盘 · 方案丙</p>
  <h1>夜观<br><b>用真几何渲染的实现预览</b></h1>
  <p class="lede">下面每一张盘都是 <code>src/lib/dial.ts</code> 编译后直接跑出来的 —— 与手机上是同一套函数、同一组常量，只是省掉了会动的部分（光点逐个显影、焦点呼吸、盘面旋转）。今天取 2026 年秋分，因为「今天恰好落在一道分至刻上」是最难看的边界，先把它过掉。</p>
</header>

<h2><span class="no">一 · 四套主题</span>深色三套是主场，素笺是唯一需要单独确认的</h2>
<p class="muted sans">方案丙往「光影」要丰富，方向本身就是偏深色的。所以真正要盯的是素笺：盘面纵深在浅底上必须读成<em>纸上一处浅浮雕</em>，而不是一块脏灰。如果素笺这一张撑不住，可选的做法是让星野在浅色档下再淡一档 —— 但先看，别提前优化。</p>

<div class="grid4">
${['xuanye', 'cangqing', 'moyu', 'sujian']
  .map((k) => dialCard(k, 'both', `<p class="tname">${THEME_LABEL[k]}</p>${THEME_NOTE[k]}`))
  .join('\n')}
</div>

<h2><span class="no">二 · 元素分层</span>转的是刻度，不是天</h2>
<p class="muted sans">这一版把盘拆成了两层。下面把玄夜那一张拆开给你看：左边是<strong>静止层</strong>（盘面纵深＋星野），中间是<strong>旋转层</strong>（光带、月轮、四道分至刻、今天刻、金弧、光点、焦点），右边是合成后的终态。拖动时只有中间那一层在转 —— 星野必须钉死，否则「天在转」的错觉一建立，拖动这个操作就失去了隐喻。<em>月轮是这一层里唯一带字的元素</em>，也是唯一需要反向自转的元素。</p>

<div class="grid3">
${dialCard('xuanye', 'still', '<p class="tname">静止层</p>三层同心圆 + 26 枚星点')}
${dialCard('xuanye', 'spin', '<p class="tname">旋转层</p>光带 / 月轮 / 刻度 / 光点 / 焦点')}
${dialCard('xuanye', 'both', '<p class="tname">合成</p>旋转层已转到焦点停在指针下')}
</div>

<h2><span class="no">三 · 参数</span>图上的每个数字都来自源码</h2>

<table>
  <tr><th style="width:34%">参数</th><th>值</th></tr>
  <tr><td>盘面纵深</td><td>三层同心圆，半径 <code>ringR × [1, 0.767, 0.507]</code>。用实心圆近似径向渐变，不用 <code>RadialGradient</code> —— 原生渐变比实心圆贵，而这里只有三档明度</td></tr>
  <tr><td>四套 bed 色</td><td>${['xuanye', 'cangqing', 'moyu', 'sujian']
    .map((k) => `${THEME_LABEL[k]} <code>${THEMES[k].dialBed1} → ${THEMES[k].dialBed3}</code>`)
    .join('　')}<br><strong>三层之间的色差刻意收在 2~4 级</strong>：同等的色差落在半径小的圈上更容易读成硬边（弧长短、两侧面积都小）。素笺尤其 —— 它在浅底上稍一拉开就变成「洋葱圈」</td></tr>
  <tr><td>星野</td><td>${dial.STAR_COUNT} 枚，半径落在 <code>ringR × [${dial.STAR_R_MIN}, ${dial.STAR_R_MAX}]</code>，透明度 6%–19%。<code>mulberry32</code> 固定种子 <code>0x${dial.STAR_SEED.toString(16)}</code> —— 用 <code>Math.random</code> 的话每次重渲染星星会跳。前三个：${escd(STAR_PREVIEW)}</td></tr>
  <tr><td>时间光带</td><td>按真实月份边界切段，端点补 0° 与 360°，${BANDS.length} 段。透明度在 <code>${BAND_LIST}</code> 上按段中角度线性插值，而不是按序号查表 —— 段数会随当月位置浮动</td></tr>
  <tr><td>分至点刻</td><td>四道，角度由 <code>nextSolarTerms()</code> 实算：${TERMS.map((x) => `${escd(x.name)} ${x.days}天`).join(' ｜ ')}。<strong>不是 0/90/180/270</strong> —— 那只是「今天 + 90n 天」，不是真正的节气</td></tr>
  <tr><td>光点辉光</td><td>本体仍是 3.4px（置顶 5px）的星，外裹 <code>${dial.HALO_SCALE}</code> 倍半径同色圆。辉光透明度 <code>${dial.HALO_MIN} → ${dial.HALO_MAX}</code> 随亮度升，下限不归零</td></tr>
  <tr><td>焦点呼吸</td><td>第三环 <code>r=22</code>，透明度在 <code>${dial.BREATH_MIN} ↔ ${(dial.BREATH_MIN + dial.BREATH_RANGE).toFixed(2)}</code> 之间来回，周期 ${dial.BREATH_DURATION}ms。静态图取中点，上机才看得到</td></tr>
  <tr><td>月轮</td><td>十二段各配一个公历月号，落在<strong>本段中点</strong>；末段（被视界切过的那一个月，可能长于一个月）封顶在半个月 <code>${dial.MONTH_LABEL_MAX_OFFSET}°</code>，免得数字漂到下个月的地界上。半径 <code>ringR − ${dial.MONTH_LABEL_INSET}</code>，透明度在 <code>${MONTH_LIST}</code> 上按角度插值。<br>今天取 9/23，本月那段只剩 8 天 → ${MONTH_MARKS[0].deg.toFixed(1)}° 起标「${MONTH_MARKS[0].label}」；十二枚落点：${MONTH_MARKS.map((m) => `${m.label}@${m.deg.toFixed(0)}°`).join(' ')}</td></tr>
  <tr><td>月轮为什么是数字</td><td><strong>不是刻度，是信息。</strong>光带已经把一年切成十二段，段与段的接缝就是月份边界 —— 再压一层灰线只是把同一件事说两遍。但接缝里没有归属：站在环上任意一处，读不出「这是几月」。数字补的正是这一格</td></tr>
  <tr><td>月轮为什么能正立</td><td>数字的位置必须跟着盘转（否则读到的是错月），但位置一转字面就跟着转，转到下半圈成了倒立的字 —— 这正是硬性约定「正立文字不能放旋转层」要挡的事。解法是每枚数字绕<strong>自己的中心</strong>转 <code>−rotation</code>：位置随盘、字面永远朝上，像罗盘刻度圈上的数字。组件里是 12 份只含一个 rotate 的 animated style，全程在 UI 线程求值</td></tr>
  <tr><td>已撤掉</td><td>十二道月份刻度。光带已经画出十二段，再压一层灰线是把同一件事说两遍；环上真正稀缺的是分至</td></tr>
</table>

<div class="box">
<b>月份读不出来的那个缺口，补上了。</b>撤掉月份刻度之后，环上的分段边界还在，但归属没了。这一版补的<em>不是刻度</em>（那才是「说两遍」），而是<strong>信息</strong>：每段段中一个公历月号。位置跟着盘转、字面反向自转保持正立，所以拖动时十二个数一圈走、永远可读。<br><br>月轮的透明度曲线<strong>刻意没有照抄光带</strong>：光带末端压到 0.04，对一段弧还剩位置感，对 11.5px 的数字就是彻底消失 —— 数字是用来读的，不是用来发光的，所以下限抬到 ${dial.MONTH_LABEL_OPS[dial.MONTH_LABEL_OPS.length - 1].toFixed(2)}，只做「远月更静」的暗示。起点也没有到 1：月轮是环上的第二信息层，不该与光点、金弧争亮度。
</div>

<h2><span class="no">四 · 静态图看不到的部分</span>上机才能验的四件事</h2>
<ul class="sans muted">
  <li><strong>月轮的反向自转</strong> —— 静态图里十二个数字只是正立着摆在那儿；上机拖动时才会看到它们一边绕环走、一边始终正立，像罗盘刻度圈。这一层有没有跟错方向、有没有抖，只有手指能验</li>
  <li><strong>焦点呼吸</strong> —— 最外一环 2.8 秒一个来回，只在这张图里取了个中点</li>
  <li><strong>光点逐个显影</strong> —— 每个点延迟 <code>i × 40ms</code> 亮起，30 枚以上取消错开（否则要等一秒多）</li>
  <li><strong>拖动的手感</strong> —— 辉光让光点的视觉直径从 3.4px 变成约 18px，逻辑命中范围没变，但视觉上「够得着」了。这一条需要手指验</li>
</ul>

<footer>
几何与视觉参数：<code>src/lib/dial.ts</code>　｜　组件：<code>src/components/domain/SkyDial.tsx</code><br>
分至点：<code>src/lib/calendar/lunar.ts · nextSolarTerms()</code>　｜　令牌：<code>src/constants/theme.ts</code><br>
重新生成：<code>node_modules/.bin/tsc -p scripts/tsconfig.caltest.json &amp;&amp; node scripts/dial-preview.cjs</code>
</footer>

</div>
</body>
</html>
`;

fs.writeFileSync(OUT_HTML, HTML, 'utf8');
console.log(`已写出 ${OUT_HTML}`);
console.log(`  光带 ${BANDS.length} 段 ｜ 星野 ${STARS.length} 枚 ｜ 分至刻 ${TERMS.length} 道`);
console.log(`  ${TERMS.map((x) => `${x.name} ${x.days}d @ ${x.deg.toFixed(1)}°`).join(' ｜ ')}`);
