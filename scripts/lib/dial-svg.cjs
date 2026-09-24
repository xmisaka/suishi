/**
 * 岁时 · 盘面 SVG 装配（脚本侧唯一一份）
 *
 * 为什么要把这段抽出来：现在有两个脚本都要画同一张盘 ——
 *   `scripts/dial-preview.cjs`  看针脚（主题四套、分层拆解、参数表）
 *   `scripts/screens-page.cjs`  README 截图（盘嵌在手机框里，与其它屏并排）
 * 各自复制一份装配代码，迟早会分叉；而「图与真机不符」恰恰是这类图最不能犯的错。
 *
 * ★ 分工要说清楚：
 *   - **几何**在 `src/lib/dial.ts`（编译产物直接 require，与组件同一个模块）
 *   - **装配**在本文件（把数字拼成 SVG 字符串）
 *   - 所以本文件里**不该出现任何自己算的几何**。一旦发现图与真机不符，
 *     那是装配写错了，不是几何 —— 这正是这套东西值得存在的前提。
 *
 * 颜色同样不手抄：`readThemes()` 直接正则解析 `src/constants/theme.ts`。
 * 解析器对格式敏感，所以下面有一道自检：四套主题必须解出全部必需令牌，
 * 缺一个就当场报错退出，绝不静默出一张颜色不对的图。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CALTEST = path.join(ROOT, '.workbuddy', 'tmp', 'caltest');

/** 与 RN 侧一致的无衬线字栈；盘上的数字用它，免得各页字体不一 */
const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif";

/* ------------------------------------------------------------ 依赖 */

function need(p, hint) {
  if (!fs.existsSync(p)) {
    console.error(`缺少编译产物：${p}\n先跑：${hint}`);
    process.exit(1);
  }
  return require(p);
}

const HINT = 'node_modules/.bin/tsc -p scripts/tsconfig.caltest.json';
const dial = need(path.join(CALTEST, 'dial.js'), HINT);
const { nextSolarTerms } = need(path.join(CALTEST, 'calendar', 'lunar.js'), HINT);

/* ------------------------------------------------------------ 令牌 */

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

  const required = [
    'name', 'note', 'mode',
    'paper', 'canvas', 'surface', 'surface2', 'inset',
    'ink', 'ink2', 'ink3', 'ink4',
    'line', 'line2', 'line3',
    'brand', 'brandDeep', 'brandBg',
    'sage', 'sageBg', 'amber', 'amberBg', 'clay', 'clayBg',
    'pure', 'onAccent', 'scrim',
    'dialBed1', 'dialBed2', 'dialBed3',
  ];
  for (const key of ['xuanye', 'cangqing', 'moyu', 'sujian']) {
    if (!out[key]) throw new Error(`theme.ts 里没解析出主题「${key}」，正则与源码格式脱节了`);
    for (const t of required) {
      if (!out[key][t]) throw new Error(`主题「${key}」缺令牌 ${t}`);
    }
  }
  return out;
}

const THEMES = readThemes();

/**
 * 主题名与一句话说明**也从 theme.ts 取**，不在这里另写一份。
 *
 * 曾经这里手抄过一版（「玄夜 = 墨底暖金（默认）」），结果是设计稿里的说明
 * 与 App 里的说明不一致 —— 而「图与真机不符」正是这类图最不能犯的错。
 * `name` / `note` 与色值同源，改 theme.ts 一处即全站生效。
 */
const THEME_KEYS = ['xuanye', 'cangqing', 'moyu', 'sujian'];
const pick = (field) => Object.fromEntries(THEME_KEYS.map((k) => [k, THEMES[k][field]]));
const THEME_LABEL = pick('name');
const THEME_NOTE = pick('note');

/* ------------------------------------------------------------ 小工具 */

const n = (v) => Number(v).toFixed(2);
const escd = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * 与 `lib/tone.ts` 的 dialBrightness 同源。5 行，不值得为它把 react-native 拖进脚本。
 * ★ 改了那边就要改这里 —— 它是本文件唯一一处「复刻」，写在最显眼的地方。
 */
function brightness(days) {
  if (days < 0) return 0.35;
  if (days <= 7) return 1;
  if (days <= 30) return 0.85;
  if (days <= 120) return 0.6;
  return 0.42;
}

/* ------------------------------------------------------------ 盘 */

/**
 * 画一张盘。
 *
 * @param {object} o
 * @param {object} o.t            主题令牌
 * @param {number} [o.size=340]   正方形边长（与组件同一个量：`Math.min(width - 34, 340)`）
 * @param {{y:number,m:number,d:number}} o.today
 * @param {{days:number,tone:string,pinned:boolean}[]} o.items
 * @param {number} [o.focusIndex=0]
 * @param {number} [o.horizonDays=366]
 * @param {'still'|'spin'|'both'} [o.layer='both']
 * @param {boolean} [o.withCore=true]  是否把圆心与指针也画进 SVG（'both' 时才有效）
 * @param {object} [o.core]       圆心的文案；不传用占位
 * @returns {{svg:string, C:number, ringR:number, bands:any[], stars:any[], terms:any[], marks:any[], focusDeg:number, bandCount:number}}
 */
function buildDial({
  t,
  size = 340,
  today,
  items,
  focusIndex = 0,
  horizonDays = 366,
  layer = 'both',
  withCore = true,
  core,
}) {
  const C = size / 2;
  const ringR = C - 24;
  const degOf = (days) => (days / horizonDays) * 360;

  /* ——— 几何：全部来自 lib/dial.ts，本文件不算 ——— */
  const monthTicks = dial.monthTicks(today, horizonDays);
  const bands = dial.bandSegments(monthTicks);
  const stars = dial.makeStars(ringR, size);
  const marks = dial.monthMarks(bands, today.m);
  const terms = nextSolarTerms(today, horizonDays).map((x) => ({
    name: x.name,
    days: x.days,
    deg: degOf(x.days),
  }));
  const focusDeg = degOf(items[focusIndex].days);
  const focusItem = items[focusIndex];

  /* ——— 静止层：盘面纵深 + 星野。**永远不转** ——— */
  function stillLayer() {
    const s = [];
    for (let i = 0; i < 3; i += 1) {
      s.push(
        `<circle cx="${C}" cy="${C}" r="${n(dial.BED_RATIOS[i] * ringR)}" fill="${t['dialBed' + (i + 1)]}"/>`,
      );
    }
    for (const st of stars) {
      s.push(`<circle cx="${n(st.x)}" cy="${n(st.y)}" r="${n(st.r)}" fill="${t.ink}" opacity="${st.o.toFixed(3)}"/>`);
    }
    return s.join('\n');
  }

  /**
   * 月轮：十二个月号。
   *
   * `rot` 是这一层在屏幕上被转过的角度。数字的**位置**随盘走（角度 + rot），
   * **字面**用 rotate(-rot) 绕自身中心转回来 —— 这正是组件里 MonthLabel 的反向自转。
   * `y + 4` 是 SVG 的基线修正：text 的 y 指基线，11.5px 的字要下沉约 4px 才是视觉居中。
   */
  function monthLabels(rot) {
    return marks
      .map((m) => {
        const p = dial.polar(C, C, ringR - dial.MONTH_LABEL_INSET, m.deg);
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
  function spinLayer(rot) {
    const s = [];

    // 时间光带：外环本身就是分段弧，越远越暗
    for (const b of bands) {
      s.push(
        `<path d="${dial.arcPath(C, C, ringR, b.from, b.to)}" fill="none" stroke="${t.brand}" ` +
          `stroke-width="2.4" stroke-linecap="round" opacity="${b.opacity}"/>`,
      );
    }

    // 分至点刻
    for (const term of terms) {
      s.push(
        `<path d="${dial.tickPath(C, C, ringR, ringR - 13, term.deg)}" stroke="${t.brand}" ` +
          `stroke-width="1.2" opacity="0.55"/>`,
      );
    }

    // 今天那道刻（0°）
    const tip = dial.polar(C, C, ringR + 7, 0);
    s.push(
      `<path d="${dial.tickPath(C, C, ringR + 4, ringR - 11, 0)}" stroke="${t.brand}" ` +
        `stroke-width="1.5" stroke-linecap="round"/>`,
      `<circle cx="${n(tip.x)}" cy="${n(tip.y)}" r="2.2" fill="${t.brand}"/>`,
    );

    // 金弧：今天 → 焦点
    const arcLen = ringR * Math.abs(focusDeg) * (Math.PI / 180);
    s.push(
      `<path d="${dial.arcPath(C, C, ringR, 0, focusDeg)}" fill="none" stroke="${t.brand}" ` +
        `stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${n(arcLen)} ${n(arcLen)}"/>`,
    );

    // 光点：辉光在下，本体在上
    for (const it of items) {
      const p = dial.polar(C, C, ringR, degOf(it.days));
      const r = it.pinned ? 5 : 3.4;
      const op = brightness(it.days);
      const halo = dial.HALO_MIN + (dial.HALO_MAX - dial.HALO_MIN) * op;
      s.push(
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(r * dial.HALO_SCALE)}" fill="${t[it.tone]}" opacity="${halo.toFixed(3)}"/>`,
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${r}" fill="${t[it.tone]}" opacity="${op}"/>`,
      );
    }

    // 焦点：双环定形 + 最外一环呼吸（静态图取呼吸的中点）
    const fp = dial.polar(C, C, ringR, focusDeg);
    const breathMid = dial.BREATH_MIN + dial.BREATH_RANGE * 0.5;
    s.push(
      `<circle cx="${n(fp.x)}" cy="${n(fp.y)}" r="10" fill="none" stroke="${t.brand}" stroke-width="1.4" opacity="0.9"/>`,
      `<circle cx="${n(fp.x)}" cy="${n(fp.y)}" r="16" fill="none" stroke="${t.brand}" stroke-width="1" opacity="0.26"/>`,
      `<circle cx="${n(fp.x)}" cy="${n(fp.y)}" r="22" fill="none" stroke="${t.brand}" stroke-width="0.8" opacity="${breathMid.toFixed(3)}"/>`,
    );

    // 月轮**最后画**：组件里它是一层压在 Svg 之上的 View，
    // 而焦点最外那环（r=22）径向够到 r≈124，正好擦过数字带 —— 顺序要跟组件一致
    s.push(monthLabels(rot));

    return s.join('\n');
  }

  /**
   * 圆心。组件里是 flex 排的 5 行（不随盘转），这里按同一顺序手排。
   * 偏移量相对 C 给，换 size 不用重排。
   */
  function coreRows() {
    const c = core ?? {
      name: '结婚纪念日',
      value: '12',
      unit: '天后',
      date: '2026 年 10 月 5 日 · 星期一',
      lunar: '农历八月廿五',
      ordinal: '第 3 周年',
    };
    const rows = [
      `<text x="${C}" y="${n(C - 38)}" text-anchor="middle" font-size="17" fill="${t.ink}" font-family="${SANS}">${escd(c.name)}</text>`,
      `<text x="${C}" y="${n(C + 8)}" text-anchor="middle" font-size="46" font-weight="500" fill="${t.brand}" font-family="${SANS}">${escd(c.value)}</text>`,
    ];
    if (c.unit) {
      rows.push(
        `<text x="${n(C + 40)}" y="${n(C - 3)}" text-anchor="start" font-size="13" fill="${t.ink2}" font-family="${SANS}">${escd(c.unit)}</text>`,
      );
    }
    if (c.date) {
      rows.push(
        `<text x="${C}" y="${n(C + 34)}" text-anchor="middle" font-size="13" fill="${t.ink3}" font-family="${SANS}">${escd(c.date)}</text>`,
      );
    }
    if (c.lunar) {
      rows.push(
        `<text x="${C}" y="${n(C + 51)}" text-anchor="middle" font-size="11.5" letter-spacing="0.6" fill="${t.ink3}" font-family="${SANS}">${escd(c.lunar)}</text>`,
      );
    }
    if (c.ordinal) {
      rows.push(
        `<text x="${C}" y="${n(C + 66)}" text-anchor="middle" font-size="11.5" font-weight="600" fill="${t.brand}" font-family="${SANS}">${escd(c.ordinal)}</text>`,
      );
    }
    return rows.join('\n');
  }

  /** 指针：固定在 12 点，**不随盘转**。尺寸与 SkyDial 的 styles.pointer 对齐（宽 10、高 7、top 2） */
  function pointer() {
    return `<path d="M ${C - 5} 2 L ${C + 5} 2 L ${C} 9 Z" fill="${t.brand}"/>`;
  }

  function svgBody() {
    const parts = [];
    if (layer !== 'spin') parts.push(stillLayer());
    if (layer === 'still') {
      return `<svg viewBox="0 0 ${size} ${size}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
    }

    // 旋转层整层绕圆心转，焦点停在 12 点 —— 与组件 rotation 的终态等价。
    // 单看旋转层时不转（rot = 0），月轮的数字因此仍以盘坐标摆着，便于核对角度。
    const rot = layer === 'spin' ? 0 : -focusDeg;
    const spin = spinLayer(rot);
    parts.push(layer === 'spin' ? spin : `<g transform="rotate(${n(rot)} ${C} ${C})">${spin}</g>`);
    if (layer === 'both' && withCore) parts.push(coreRows(), pointer());
    return `<svg viewBox="0 0 ${size} ${size}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  }

  return {
    svg: svgBody(),
    C,
    ringR,
    bands,
    stars,
    terms,
    marks,
    focusDeg,
    focusItem,
    today,
    horizonDays,
    size,
  };
}

module.exports = {
  ROOT,
  CALTEST,
  SANS,
  dial,
  nextSolarTerms,
  THEMES,
  THEME_LABEL,
  THEME_NOTE,
  readThemes,
  n,
  escd,
  brightness,
  buildDial,
};
