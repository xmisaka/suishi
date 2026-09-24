/**
 * 岁时 · README 界面截图页（唯一真相）
 *
 * 产出两样东西：
 *   1. `docs/screens.html` —— 六屏的源文件，入库。**图是它的渲染产物**
 *   2. 供 `readme-product-screens` 技能的无头 Chrome 导出脚本截取
 *      `docs/screenshots/NN-<slug>.png`
 *
 * ── 为什么要自己搭这一页，而不是拿现成的设计稿去渲染 ──────────────
 * 根目录那份 `纪念日App-需求与设计方案.html` 是**早期的 A/B/C 方案对比稿**，
 * 画的是「A-1 首页·年轮 / B-1 首页·天象 / C-1 首页·刻度」这些候选，
 * 与 v1.2.0 的实际实现（星盘 = 方案丙「夜观」、列表按「还有多久」分六段、
 * 四套主题…）已经对不上。拿它出图会得到一套「从没上过线」的界面。
 * 所以这一页是**照源码重建**的：文案逐条来自各屏源码，尺寸逐条来自令牌表。
 *
 * ── 三条纪律 ────────────────────────────────────────────────
 *   - **令牌不手抄**：颜色经 `scripts/lib/dial-svg.cjs` 的 readThemes()
 *     从 `src/constants/theme.ts` 解析；字号 / 间距 / 圆角照 `Type` / `Space` /
 *     `Radius` 的真值写（见下方常量表）。
 *   - **样本数据不是编的**：14 个条目先按真实规则定义，再交给
 *     `src/lib/calendar/resolve.js`（编译产物，与 App 同一个模块）算出落点与
 *     天数，然后排序。所以「房租 8 天后」「中秋落在 9 月 25 日」这些都是算出来的。
 *   - **盘是同一张**：盘面 SVG 走 `scripts/lib/dial-svg.cjs`，
 *     与 `docs/星盘-夜观-实现预览.html` 共用一份装配代码。
 *
 * 跑法（幂等）：
 *   node_modules/.bin/tsc -p scripts/tsconfig.caltest.json
 *   node scripts/screens-page.cjs
 *
 * 出图（路径含中文，Chrome 打不开 —— 脚本会把无中文名的副本写到 ASCII 侧）：
 *   python ~/.workbuddy/skills/readme-product-screens/scripts/export_screens.py \
 *     E:/WorkBuddy/suishi-screens/screens.html E:/WorkBuddy/suishi-screens/out
 */

const fs = require('fs');
const path = require('path');

const { ROOT, CALTEST, THEMES, buildDial } = require('./lib/dial-svg.cjs');

const OUT_HTML = path.join(ROOT, 'docs', 'screens.html');
/** 无中文名的渲染副本 —— Chrome 打不开含非 ASCII 的 file:// 路径 */
const RENDER_DIR = 'E:/WorkBuddy/suishi-screens';

const D = require(path.join(CALTEST, 'date.js'));
const { resolveAll, sortByDays, dialWorthy, DIAL_HORIZON_DAYS } = require(
  path.join(CALTEST, 'calendar', 'resolve.js'),
);
const { solarToLunar, lunarYearGanZhi } = require(path.join(CALTEST, 'calendar', 'lunar.js'));
const { describeDateShort, describeDateValue } = require(path.join(CALTEST, 'calendar', 'describe.js'));

/* ------------------------------------------------------------ 真值表（照源码写） */

/** 帧宽取 412 —— 与常见 Android 机型同宽，于是盘正好取到设计基准 340 */
const FRAME_W = 412;
const FRAME_H = 915;

/** `Space` */
const SP = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
/** `GUTTER` / `Radius` */
const GUTTER = 17;
const R = { tag: 6, thumb: 9, chip: 999, input: 11, button: 12, card: 14, sheet: 20, phone: 32 };
/** `SOON_WINDOW_DAYS`（lib/tone.ts） */
const SOON = 30;

/** `UPCOMING_COUNT`（src/app/(tabs)/index.tsx）：圆盘下方列几个日子 */
const UPCOMING_COUNT = 5;

/** `ScreenScroll bottomInset`（components/ui/layout.tsx 默认 96；详情页传 Space.xxxl） */
const BOTTOM_INSET_DETAIL = 32;

/**
 * ★ 让各屏在 412×915 的框内**收口**的一组微调 —— 全部有据可查，不是随手改的。
 *
 * 为什么需要：星盘 / 全部 / 详情这三屏在真机上内容本来就长过一屏（都是
 * `ScrollView` / `SectionList`）。框是死高的，于是「折叠线」会落在某张卡片
 * 或某个按钮的中间 —— 截出来像被裁坏了。把纵向节奏按技能给的量级
 * （组间距 −2、行高 −2）收紧 2~4px，目的只是**让折叠线落在元素边界上**：
 * 图上最后一件东西是完整的，下面还有内容这件事由「全部 N 个 / N 天后」
 * 这些文案自然表达，不必靠半张卡片。
 *
 * 结构、文案、色值一律照源码，**只有这几个纵向间距值**与真机差 2~4px。
 */
const FIT = {
  headerBottom: 10, // layout.tsx: header paddingBottom（源码 Space.md = 12）
  sectionTop: 22, // layout.tsx: section marginTop（源码 Space.xxl = 24）
  dialTop: 0, // index.tsx: dialWrap paddingTop（源码 Space.xs = 4）
  heroBottom: 22, // detail: hero paddingBottom（源码 Space.xxl = 24）
  actionsTop: 22, // detail: actions marginTop（源码 Space.xxl = 24）
  listHeadTop: 20, // list.tsx: sectionHead paddingTop（源码 Space.xxl = 24）
};

const TODAY = { y: 2026, m: 9, d: 23 };

/* ------------------------------------------------------------ 样本数据 */

/**
 * 14 个条目。字段与库里的 `Anniversary` 对齐，只有历法 / 周期 / 锚点是「事实」，
 * 落点与天数一律交给 resolve.js 算 —— 不在这里手写「几天后」。
 */
const RAW = [
  { name: '中秋节', calendar: 'lunar', repeat: 'yearly', m: 8, d: 15, tone: 'clay', year: null },
  { name: '妈妈的生日', calendar: 'solar', repeat: 'yearly', m: 9, d: 27, tone: 'clay', year: null },
  { name: '房租', calendar: 'solar', repeat: 'monthly', m: 10, d: 1, tone: 'brand', year: null },
  { name: '结婚纪念日', calendar: 'solar', repeat: 'yearly', m: 10, d: 5, tone: 'brand', year: 2023 },
  { name: '交水电费', calendar: 'solar', repeat: 'monthly', m: 10, d: 10, tone: 'sage', year: null },
  { name: '体检预约', calendar: 'solar', repeat: 'once', m: 10, d: 16, tone: 'sage', year: 2026 },
  { name: '结婚登记日', calendar: 'solar', repeat: 'yearly', m: 11, d: 11, tone: 'amber', year: 2019 },
  { name: '公司年会', calendar: 'solar', repeat: 'once', m: 12, d: 20, tone: 'amber', year: 2026 },
  { name: '冬至', calendar: 'solar', repeat: 'yearly', m: 12, d: 22, tone: 'sage', year: null },
  { name: '项目上线', calendar: 'solar', repeat: 'once', m: 1, d: 20, tone: 'brand', year: 2027 },
  { name: '爸爸的生日', calendar: 'lunar', repeat: 'yearly', m: 1, d: 6, tone: 'clay', year: null },
  { name: '春节', calendar: 'lunar', repeat: 'yearly', m: 1, d: 1, tone: 'amber', year: null },
  { name: '驾照到期', calendar: 'solar', repeat: 'once', m: 3, d: 8, tone: 'amber', year: 2027 },
  { name: '搬进这个家', calendar: 'solar', repeat: 'yearly', m: 8, d: 15, tone: 'sage', year: 2021 },
];

const EVENTS = RAW.map((e, i) => ({
  id: `e${String(i + 1).padStart(2, '0')}`,
  name: e.name,
  calendar: e.calendar,
  repeat: e.repeat,
  year: e.year,
  month: e.m,
  day: e.d,
  leap: false,
  weekday: null,
  tone: e.tone,
  pinned: e.name === '结婚纪念日' || e.name === '中秋节',
  note: e.name === '结婚纪念日' ? '今年想去海边过。已经订好了民宿，提前一天出发。' : null,
  remindDays: null,
  sortOrder: null,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
}));

const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

const OCCURRENCES = sortByDays(resolveAll(EVENTS, TODAY));
const ON_DIAL = dialWorthy(OCCURRENCES);

const FOCUS_NAME = '结婚纪念日';
const FOCUS_I = Math.max(0, ON_DIAL.findIndex((o) => EVENT_BY_ID.get(o.id).name === FOCUS_NAME));

/** `countToneOf` —— lib/tone.ts，阈值同源 */
function toneOf(days) {
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days <= SOON) return 'soon';
  return 'future';
}

/* ------------------------------------------------------------ 文本小工具 */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------ 图标 */

/**
 * 行内 SVG 图标，对齐 App 里用的 Ionicons 线稿风格（2px 圆头线、外接 24×24）。
 * 为什么不用文字符号：`☺` `⌕` 这类字形在不同系统上字形差异极大，
 * 而且粗细与真机的 Ionicons 对不上 —— 标签栏在四张截图上都露脸，值得画准。
 */
const ico = (paths, size = 20, stroke = 1.9) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ` +
  `style="display:block;flex:none">${paths}</svg>`;

const ICON = {
  planet: `<circle cx="12" cy="12" r="5.4"/><ellipse cx="12" cy="12" rx="10.4" ry="4.1" transform="rotate(-24 12 12)"/>`,
  list: `<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.4" cy="6" r="1.25" fill="currentColor" stroke="none"/><circle cx="4.4" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="4.4" cy="18" r="1.25" fill="currentColor" stroke="none"/>`,
  person: `<circle cx="12" cy="7.6" r="4.1"/><path d="M4.6 20.6a7.4 7.4 0 0 1 14.8 0"/>`,
  search: `<circle cx="10.6" cy="10.6" r="6.4"/><path d="M15.4 15.4 21 21"/>`,
  back: `<path d="M15 4.5 7.5 12 15 19.5"/>`,
  next: `<path d="M9 4.5 16.5 12 9 19.5"/>`,
  down: `<path d="M4.5 9 12 16.5 19.5 9"/>`,
  star: `<path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z" fill="currentColor" stroke="none"/>`,
  pencil: `<path d="M4.2 19.8h4l10.6-10.6-4-4L4.2 15.8z"/><path d="M13.6 6.4l4 4"/>`,
  trash: `<path d="M4.6 7h14.8M9.8 7V4.4h4.4V7M6.6 7l1 13h8.8l1-13"/>`,
  clock: `<circle cx="12" cy="12" r="8.4"/><path d="M12 6.8v5.6l3.4 2"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  check: `<path d="M5 12.6l4.6 4.6L19 7.4"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  sun: `<circle cx="12" cy="12" r="4.1"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/>`,
  moon: `<path d="M20.2 14.6A8.6 8.6 0 1 1 9.4 3.8a6.9 6.9 0 0 0 10.8 10.8z"/>`,
};

/* ------------------------------------------------------------ 共用样式 */

const SANS = `-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
const SERIF = `"Songti SC","Source Han Serif SC","Noto Serif CJK SC",SimSun,serif`;

function themeVars(t) {
  return [
    `--paper:${t.paper}`, `--canvas:${t.canvas}`, `--surface:${t.surface}`,
    `--surface2:${t.surface2}`, `--inset:${t.inset}`,
    `--ink:${t.ink}`, `--ink2:${t.ink2}`, `--ink3:${t.ink3}`, `--ink4:${t.ink4}`,
    `--line:${t.line}`, `--line2:${t.line2}`, `--line3:${t.line3}`,
    `--brand:${t.brand}`, `--brand-deep:${t.brandDeep}`, `--brand-bg:${t.brandBg}`,
    `--sage:${t.sage}`, `--sage-bg:${t.sageBg}`,
    `--amber:${t.amber}`, `--amber-bg:${t.amberBg}`,
    `--clay:${t.clay}`, `--clay-bg:${t.clayBg}`,
    `--on-accent:${t.onAccent}`, `--pure:${t.pure}`, `--scrim:${t.scrim}`,
  ].join(';');
}

const APP_CSS = `
  /* ---- 手机框 ---- */
  .ph{position:relative;width:${FRAME_W}px;height:${FRAME_H}px;overflow:hidden;
    background:var(--canvas);color:var(--ink);font-family:${SANS};
    font-size:14px;line-height:22px;display:flex;flex-direction:column;
    -webkit-font-smoothing:antialiased}
  .safe{padding-top:26px;display:flex;flex-direction:column;min-height:0;flex:1}
  .scroll{flex:1;min-height:0;overflow:hidden}

  /* ---- 页头 ---- */
  .hdr{padding:${SP.md}px ${GUTTER}px ${FIT.headerBottom}px}
  .hdr-row{display:flex;align-items:flex-start;gap:${SP.md}px}
  .display{font-family:${SERIF};font-size:23px;line-height:32px;letter-spacing:2px;color:var(--ink);flex:1}
  .hdr-sub{margin-top:${SP.xs}px;font-size:13px;line-height:19px;color:var(--ink3)}

  /* ---- 通用排版 ---- */
  .meta{font-size:13px;line-height:19px}
  .body{font-size:14px;line-height:22px}
  .label{font-size:11.5px;line-height:16px}
  .item{font-size:16px;line-height:22px;font-weight:500}
  .title{font-family:${SERIF};font-size:20px;line-height:28px;letter-spacing:.5px}
  .ink{color:var(--ink)} .ink2{color:var(--ink2)} .ink3{color:var(--ink3)} .ink4{color:var(--ink4)}
  .brand{color:var(--brand)} .clay{color:var(--clay)} .sage{color:var(--sage)} .amber{color:var(--amber)}
  .tnum{font-variant-numeric:tabular-nums}

  /* ---- 卡片 ---- */
  .card{background:var(--surface);border:1px solid var(--line2);border-radius:${R.card}px;overflow:hidden}
  .card-pad{padding:${SP.lg}px}
  .gutter{padding:0 ${GUTTER}px}
  .section{margin-top:${FIT.sectionTop}px}
  .sec-head{display:flex;align-items:center;justify-content:space-between;
    padding:0 ${GUTTER}px ${SP.sm}px}
  /* 列表分段头：源码里 sectionHead 是 paddingTop Space.xxl */
  .list-head{padding-top:${FIT.listHeadTop}px}
  .sec-title{font-size:12.5px;line-height:16px;letter-spacing:.6px;color:var(--ink2)}
  .sec-link{font-size:12px;line-height:16px;font-weight:600;color:var(--brand)}

  /* ---- 条目行 ---- */
  .row{display:flex;align-items:center;gap:${SP.md}px;padding:11px ${GUTTER}px}
  .row-sep{border-bottom:1px solid var(--line3)}
  .stripe{width:3px;height:30px;border-radius:2px;opacity:.9;flex:none}
  .row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
  .row-name{display:flex;align-items:center;gap:4px;min-width:0}
  .row-name .item{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .star{color:var(--brand);font-size:11px;line-height:1}
  .row-sub{font-size:12.5px;line-height:17px;color:var(--ink3);white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis}
  .row-right{display:flex;flex-direction:column;align-items:flex-end;gap:1px;flex:none}
  .count-line{display:flex;align-items:baseline;gap:2px}
  .count-num{font-size:19px;line-height:26px;font-weight:600;font-variant-numeric:tabular-nums}
  .count-unit{font-size:11px;line-height:16px;color:var(--ink3)}
  .today-text{font-size:15px;line-height:22px;font-weight:700;color:var(--brand)}
  .ordinal{font-size:10.5px;line-height:15px;color:var(--ink4)}

  /* ---- 计数条 ---- */
  .legend{display:flex;flex-wrap:wrap;gap:${SP.sm}px;margin:${SP.md}px ${GUTTER}px 0}
  .pill{padding:3px 10px;border-radius:${R.chip}px;font-size:12px;line-height:16px;font-weight:600}
  .pill.today{background:var(--brand-bg);color:var(--brand)}
  .pill.soon{background:var(--amber-bg);color:var(--amber)}
  .pill.future{background:var(--sage-bg);color:var(--sage)}
  .pill.past{background:var(--inset);color:var(--ink3)}

  /* ---- 搜索框 ---- */
  .search{display:flex;align-items:center;gap:${SP.sm}px;height:38px;
    margin:${SP.md}px ${GUTTER}px 0;padding:0 ${SP.md}px;
    background:var(--inset);border-radius:${R.input}px;color:var(--ink3)}
  .search span{font-size:14px;color:var(--ink4)}

  /* ---- chip ---- */
  .chips{display:flex;gap:${SP.sm}px;padding:${SP.md}px ${GUTTER}px 0;flex-wrap:wrap}
  .chip{padding:6px ${SP.md}px;border-radius:${R.chip}px;border:1px solid var(--line);
    background:var(--surface);font-size:12.5px;line-height:17px;color:var(--ink2)}
  .chip.on{background:var(--brand);border-color:var(--brand);color:var(--on-accent);font-weight:600}

  /* ---- 指标条（裸壳） ---- */
  .strip{display:flex}
  .strip-cell{flex:1;padding:${SP.md}px ${SP.sm}px;display:flex;flex-direction:column;
    align-items:center;gap:2px}
  .strip-cell + .strip-cell{border-left:1px solid var(--line2)}
  .strip-val{font-size:17px;line-height:22px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink)}
  .strip-lab{font-size:11.5px;line-height:16px;color:var(--ink3)}

  /* ---- 设置行 ---- */
  .set-row{display:flex;align-items:center;justify-content:space-between;gap:${SP.sm}px;
    min-height:46px;padding:${SP.sm}px ${SP.lg}px}
  .set-row + .set-row{border-top:1px solid var(--line3)}
  /* 右值语气：默认 brand（有引导意味），.ink3 = 陈述事实。
     写成 .set-val.ink3 两类的选择器 —— 单靠 .ink3 会被 .set-val 的 color 盖掉。 */
  .set-val{font-weight:500;text-align:right;flex:none;color:var(--brand)}
  .set-val.ink3{color:var(--ink3)}
  .chev{color:var(--brand);font-size:13px;line-height:1}

  /* ---- 详情页 ---- */
  .topbar{display:flex;align-items:center;gap:${SP.xs}px;padding:${SP.sm}px ${SP.md}px}
  .icon-btn{padding:${SP.xs}px;font-size:18px;line-height:1;color:var(--ink)}
  .spacer{flex:1}
  .hero{display:flex;flex-direction:column;align-items:center;
    padding:${SP.md}px 0 ${FIT.heroBottom}px;gap:${SP.xs}px}
  .hero-count{display:flex;align-items:baseline;gap:4px}
  .hero-num{font-size:62px;line-height:68px;font-weight:500;letter-spacing:-1.2px;
    font-variant-numeric:tabular-nums}
  .hero-unit{font-size:17px;line-height:22px;font-weight:600}
  .hero-name{margin-top:${SP.sm}px;text-align:center}
  .hero-ord{font-size:12px;line-height:16px;font-weight:600;color:var(--brand)}
  .info-row{display:flex;align-items:flex-start;gap:${SP.md}px;
    padding:${SP.md}px ${SP.lg}px;min-height:44px}
  .info-row + .info-row{border-top:1px solid var(--line3)}
  .info-lab{width:52px;padding-top:2px;flex:none;color:var(--ink3)}
  .info-val{flex:1;color:var(--ink)}
  .mark-row{display:flex;align-items:center;justify-content:space-between;gap:${SP.md}px;
    padding:${SP.md}px ${SP.lg}px}
  .mark-row + .mark-row{border-top:1px solid var(--line3)}
  .mark-left{display:flex;align-items:center;gap:${SP.sm}px}
  .mark-dot{width:14px;height:14px;border-radius:7px}
  .tag{display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:${R.tag}px;
    font-size:11px;line-height:15px;align-self:flex-start}
  .tag-brand{background:var(--brand-bg);color:var(--brand)}

  /* ---- 按钮 ---- */
  .btn{height:44px;border-radius:${R.button}px;border:1px solid var(--line);
    display:flex;align-items:center;justify-content:center;gap:${SP.sm}px;
    font-size:15px;font-weight:600;background:var(--surface);color:var(--ink)}
  .btn-lg{height:52px}
  .btn-primary{background:var(--brand);border-color:var(--brand);color:var(--on-accent)}
  .btn-danger{color:var(--clay)}
  .btn-col{display:flex;flex-direction:column;gap:${SP.md}px;margin-top:${FIT.actionsTop}px;padding:0 ${GUTTER}px}

  /* ---- 表单 ---- */
  .form-row{display:flex;align-items:center;min-height:48px;padding:${SP.sm}px 0;
    border-bottom:1px solid var(--line3)}
  .form-row.last{border-bottom:0}
  .form-lab{width:84px;flex:none;color:var(--ink2)}
  .form-content{flex:1;display:flex;justify-content:flex-end;align-items:center}
  .form-input{color:var(--ink4)}
  .seg{display:flex;background:var(--inset);border-radius:${R.thumb + 2}px;padding:2px;gap:2px}
  .seg span{padding:5px ${SP.md}px;border-radius:${R.tag + 1}px;font-size:12.5px;line-height:17px;
    font-weight:500;color:var(--ink3)}
  .seg span.on{background:var(--surface);color:var(--ink)}
  .date-row{display:flex;align-items:center;gap:${SP.xs}px;justify-content:flex-end}
  .tone-row{display:flex;justify-content:space-between}
  .tone-cell{flex:1;display:flex;flex-direction:column;align-items:center;gap:${SP.sm}px}
  .tone-dot{width:38px;height:38px;border-radius:19px;display:flex;align-items:center;
    justify-content:center;color:var(--on-accent);font-size:14px;line-height:1;
    border:2px solid transparent}
  /* 选中环走真边框而不是 box-shadow：RN 里是 borderWidth:2，
     边框吃在 38px 之内；用外阴影会连直径一起放大 4px */
  .tone-dot.on{border-color:var(--ink)}
  .tone-lab{font-size:11.5px;line-height:16px;color:var(--ink3)}
  .tone-lab.on{color:var(--brand)}
  .divider{height:1px;background:var(--line3);margin:${SP.lg}px 0}
  .switch-row{display:flex;align-items:center;justify-content:space-between;gap:${SP.md}px}
  .switch-txt{flex:1;display:flex;flex-direction:column;gap:2px}
  .knob{width:44px;height:24px;border-radius:12px;background:var(--brand);flex:none;
    display:flex;align-items:center;justify-content:flex-end;padding:2px}
  .knob i{width:20px;height:20px;border-radius:10px;background:var(--pure);display:block}
  .note-box{min-height:68px;color:var(--ink4)}

  /* ---- 标签栏 ---- *
   * 在流内（不是 absolute）：RN 里 TabBar 是 ScrollView 的兄弟节点，
   * 内容在标签栏上沿被裁掉，而不是从它下面穿过去。 */
  .tabbar{display:flex;flex:none;
    background:var(--surface);border-top:1px solid var(--line2);padding-top:${SP.sm}px;
    padding-bottom:${SP.sm}px}
  .tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:2px 0;
    font-size:10.5px;line-height:15px;color:var(--ink3)}
  .tab.on{color:var(--brand)}
  .tab-ico{font-size:19px;line-height:1}
  .tab-plus{width:48px;height:48px;border-radius:${R.chip}px;background:var(--brand);
    color:var(--on-accent);display:flex;align-items:center;justify-content:center;
    font-size:26px;line-height:1;margin-top:-14px;
    box-shadow:0 6px 14px -6px var(--brand)}

  /* ---- 面板 ---- */
  .scrim{position:absolute;inset:0;background:var(--scrim)}
  .sheet{position:absolute;left:0;right:0;bottom:0;background:var(--surface);
    border-top-left-radius:${R.sheet}px;border-top-right-radius:${R.sheet}px;
    border-top:1px solid var(--line2);overflow:hidden;
    padding-bottom:${SP.lg}px}
  .sheet-head{display:flex;align-items:center;justify-content:space-between;
    padding:${SP.lg}px ${GUTTER}px ${SP.md}px;border-bottom:1px solid var(--line3)}
  .sheet-head .title{font-size:18px}
  .sheet-close{color:var(--ink2);font-size:18px;line-height:1}
  .sheet-body{padding:${SP.md}px ${GUTTER}px ${SP.md}px}
  .theme-row{display:flex;align-items:center;gap:${SP.md}px;padding:${SP.md}px;
    border-radius:${R.card}px;border:1px solid var(--line3);margin-bottom:${SP.sm}px}
  .theme-row.on{border-color:var(--brand);background:var(--brand-bg)}
  .swatch{display:flex;width:54px;height:38px;border-radius:${R.thumb}px;overflow:hidden;
    border:1px solid var(--line);flex:none}
  .theme-main{flex:1;display:flex;flex-direction:column;gap:2px}
  .theme-name{font-weight:600}
  .theme-note{font-size:11.5px;line-height:16px;color:var(--ink3)}
  .sheet-hint{margin-top:${SP.lg}px;font-size:11.5px;line-height:18px;color:var(--ink3)}
  .sheet-done{margin-top:${SP.lg}px}
`;

/* ------------------------------------------------------------ 盘（HTML 版） */

/**
 * 首页的盘。SVG 只画两层的图形（still + spin，含月轮），
 * **圆心与指针另用 HTML 画** —— 组件里它们本来就是 RN 的 View / Text，
 * 用真 HTML 排反而比手写 SVG text 更接近真机。
 */
function dialBlock(t, focusIndex) {
  const { svg, ringR } = buildDial({
    t,
    size: 340,
    today: TODAY,
    items: ON_DIAL.map((o) => ({
      days: o.days,
      tone: EVENT_BY_ID.get(o.id).tone,
      pinned: EVENT_BY_ID.get(o.id).pinned,
    })),
    focusIndex,
    horizonDays: DIAL_HORIZON_DAYS,
    layer: 'both',
    withCore: false,
  });

  const o = ON_DIAL[focusIndex];
  const ev = EVENT_BY_ID.get(o.id);
  const label = D.describeDays(o.days).replace(/(\d+) 天后/, '$1').replace(/(\d+) 天前/, '$1');
  const tone = toneOf(o.days);

  const unit = o.days !== 0 ? `<span class="label ink3" style="font-size:13px">天后</span>` : '';
  const lunar = o.lunar ? `<span class="label ink3" style="letter-spacing:.6px">农历${esc(D.formatLunar(o.lunar))}</span>` : '';
  const ord =
    o.ordinal != null && o.ordinal > 0
      ? `<span class="label brand" style="font-weight:600;margin-top:1px">第 ${o.ordinal} 周年</span>`
      : '';

  return `
      <div style="display:flex;justify-content:center;padding-top:${FIT.dialTop}px">
        <div style="position:relative;width:340px;height:340px">
          ${svg}
          <div style="position:absolute;top:2px;left:50%;margin-left:-5px;width:0;height:0;
            border-left:5px solid transparent;border-right:5px solid transparent;
            border-top:7px solid var(--brand)"></div>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:1px;
            width:${(ringR - 22) * 2}px;height:${(ringR - 22) * 2}px;margin:auto">
            <span class="item ink" style="font-size:17px">${esc(ev.name)}</span>
            <span style="display:flex;align-items:baseline;gap:2px">
              <span class="tnum" style="font-size:46px;line-height:52px;font-weight:500;
                letter-spacing:-1px;color:var(--${tone === 'today' ? 'brand' : tone === 'soon' ? 'amber' : 'sage'})">${esc(label)}</span>
              ${unit}
            </span>
            <span class="meta ink3">${esc(D.formatMDWeek(o.date))}</span>
            ${lunar}
            ${ord}
          </div>
        </div>
      </div>`;
}

/* ------------------------------------------------------------ 条目行 */

const REPEAT_LABEL = { once: '仅此一次', yearly: '每年', monthly: '每月', weekly: '每周' };

function describeLine(ev, o) {
  const date =
    ev.calendar === 'lunar' && o.lunar ? `农历${D.formatLunar(o.lunar)}` : D.formatMD(o.date);
  if (ev.repeat === 'weekly') return `${date} · 每${D.weekdayName(o.date)}`;
  const repeat = ev.repeat === 'monthly' ? `每月 ${ev.day} 日` : REPEAT_LABEL[ev.repeat];
  return `${date} · ${repeat}`;
}

const TONE_VAR = { brand: 'brand', sage: 'sage', amber: 'amber', clay: 'clay' };

function eventRow(o, last) {
  const ev = EVENT_BY_ID.get(o.id);
  const tone = toneOf(o.days);
  const isToday = o.days === 0;
  const pin = ev.pinned ? `<span class="star">${ico(ICON.star, 11)}</span>` : '';

  const right = isToday
    ? `<span class="today-text">今天</span>`
    : `<span class="count-line"><span class="count-num" style="color:var(--${tone === 'soon' ? 'amber' : tone === 'future' ? 'sage' : 'brand'})">${Math.abs(o.days)}</span><span class="count-unit">${o.days > 0 ? '天后' : '天前'}</span></span>`;

  const ord =
    o.ordinal != null && o.ordinal > 0
      ? `<span class="ordinal">${o.ordinal} 周年</span>`
      : '';

  return `
          <div class="row${last ? '' : ' row-sep'}">
            <span class="stripe" style="background:var(--${TONE_VAR[ev.tone]})"></span>
            <div class="row-main">
              <div class="row-name">${pin}<span class="item ink">${esc(ev.name)}</span></div>
              <span class="row-sub">${esc(describeLine(ev, o))}</span>
            </div>
            <div class="row-right">${right}${ord}</div>
          </div>`;
}

/* ------------------------------------------------------------ 标签栏 */

function tabBar(active) {
  const tab = (label, glyph, key) =>
    `<div class="tab${active === key ? ' on' : ''}">${ico(glyph, 21)}<span>${label}</span></div>`;
  const plus = ico(ICON.plus, 26, 2.1).replace('style="display:block', 'style="color:var(--on-accent);display:block');
  return `
    <div class="tabbar">
      ${tab('星盘', ICON.planet, 'index')}
      ${tab('全部', ICON.list, 'list')}
      <div class="tab"><span class="tab-plus">${plus}</span></div>
      ${tab('我的', ICON.person, 'mine')}
    </div>`;
}

/* ------------------------------------------------------------ 六屏 */

const THEME = THEMES.xuanye;

/* ---- 01 星盘 ---- */
function screenDial() {
  const todayLunar = solarToLunar(TODAY);
  const legend = [
    { tone: 'today', label: '今天', count: ON_DIAL.filter((o) => toneOf(o.days) === 'today').length },
    { tone: 'soon', label: '将到', count: ON_DIAL.filter((o) => toneOf(o.days) === 'soon').length },
    { tone: 'future', label: '还早', count: ON_DIAL.filter((o) => toneOf(o.days) === 'future').length },
  ];
  const upcomingAll = OCCURRENCES.filter((o) => !o.expired);
  const upcoming = upcomingAll.slice(0, UPCOMING_COUNT);
  const moreCount = upcomingAll.length - UPCOMING_COUNT;

  return `
      <div class="safe">
        <div class="scroll">
          <div class="hdr">
            <div class="hdr-row"><div class="display">岁时</div></div>
            <div class="hdr-sub">农历${esc(D.formatLunar(todayLunar))} · ${esc(lunarYearGanZhi(todayLunar.y))}年</div>
          </div>

          ${dialBlock(THEME, FOCUS_I)}

          <div class="legend">
            ${legend.map((l) => `<span class="pill ${l.tone}">${l.label} ${l.count}</span>`).join('')}
          </div>

          <div class="section">
            <div class="sec-head">
              <span class="sec-title">接下来的日子</span>
              <span class="sec-link">全部 ${OCCURRENCES.length} 个</span>
            </div>
            <div class="card" style="margin:0 ${GUTTER}px">
              ${upcoming.map((o, i) => eventRow(o, i === upcoming.length - 1)).join('')}
            </div>
            ${
              moreCount > 0
                ? `<div class="gutter" style="margin-top:${SP.md}px">
              <div class="btn">${ico(ICON.down, 17)}还有 ${moreCount} 个日子</div>
            </div>`
                : ''
            }
          </div>

          <div style="text-align:center;margin-top:${SP.xl}px;font-size:11.5px;line-height:16px;color:var(--ink4)">
            拖动圆盘可换个日子看，点盘上的光点会转到它。
          </div>
        </div>
        ${tabBar('index')}
      </div>`;
}

/* ---- 02 全部 ---- */
function screenList() {
  /**
   * 分段表照抄 `src/app/(tabs)/list.tsx` 的 BUCKETS —— 六段 + 「已经过去」。
   * 页面只看得见前三段（框就这么高），但 HTML 是图的唯一真相，缺段就等于
   * 把「列表长什么样」这件事说过头了。
   */
  const BUCKETS = [
    { label: '今天', test: (d) => d === 0 },
    { label: '一周之内', test: (d) => d >= 1 && d <= 7 },
    { label: '一个月内', test: (d) => d >= 8 && d <= 30 },
    { label: '三个月内', test: (d) => d >= 31 && d <= 100 },
    { label: '一年之内', test: (d) => d >= 101 && d <= 366 },
    { label: '一年之后', test: (d) => d >= 367 },
  ];

  const groups = BUCKETS.map((b) => ({ ...b, rows: OCCURRENCES.filter((o) => !o.expired && b.test(o.days)) })).filter(
    (g) => g.rows.length > 0,
  );

  const past = OCCURRENCES.filter((o) => o.expired).sort((a, b) => b.days - a.days);
  if (past.length > 0) groups.push({ label: '已经过去', test: null, rows: past });

  /**
   * ★ 页头、搜索框、筛选 chip **不滚动** —— 在 list.tsx 里它们是 SectionList 的
   * 兄弟节点（`<Screen><PageHeader/><SearchField/><filters/><SectionList/></Screen>`），
   * 只有分段列表本身滚。摆进 `.scroll` 里就画成了「整页一起滚」，与真机不符。
   */
  return `
      <div class="safe">
        <div class="hdr">
          <div class="hdr-row"><div class="display">全部</div></div>
          <div class="hdr-sub">共 ${OCCURRENCES.length} 个日子</div>
        </div>

        <div class="search"><span style="color:var(--ink3)">${ico(ICON.search, 15, 2)}</span><span>搜索名字、备注、农历日期</span></div>

        <div class="chips">
          <span class="chip on">全部</span>
          <span class="chip">公历</span>
          <span class="chip">农历</span>
        </div>

        <div class="scroll">
          ${groups
            .map(
              (g) => `
          <div class="sec-head list-head">
            <span class="sec-title">${g.label}</span>
            <span class="meta ink4">${g.rows.length}</span>
          </div>
          ${g.rows
            .map(
              (o) =>
                `<div class="card" style="margin:0 ${GUTTER}px ${SP.sm}px;border-color:var(--line3)">` +
                eventRow(o, true) +
                `</div>`,
            )
            .join('')}`,
            )
            .join('')}
        </div>
        ${tabBar('list')}
      </div>`;
}

/* ---- 03 详情 ---- */
function screenDetail() {
  const o = ON_DIAL[FOCUS_I];
  const ev = EVENT_BY_ID.get(o.id);
  const tone = toneOf(o.days);

  const REPEAT_TEXT = { once: '仅此一次', yearly: '每年一次', monthly: '每月一次', weekly: '每周一次' };

  const hero =
    o.days === 0
      ? `<span class="hero-num" style="color:var(--brand)">就是今天</span>`
      : `<span class="hero-count">
              <span class="hero-num" style="color:var(--${tone === 'soon' ? 'amber' : tone === 'future' ? 'sage' : 'brand'})">${Math.abs(o.days)}</span>
              <span class="hero-unit" style="color:var(--${tone === 'soon' ? 'amber' : tone === 'future' ? 'sage' : 'brand'})">${o.days > 0 ? '天后' : '天前'}</span>
            </span>`;

  const info = (label, value, last) =>
    `<div class="info-row${last ? '' : ''}"><span class="meta info-lab">${label}</span><span class="body info-val">${esc(value)}</span></div>`;

  const mark = (left, right) =>
    `<div class="mark-row"><div class="mark-left">${left}</div><span class="meta ink3">${right}</span></div>`;

  return `
      <div class="topbar">
        <span class="icon-btn">${ico(ICON.back, 22)}</span>
        <span class="spacer"></span>
        <span class="icon-btn brand">${ico(ICON.star, 20)}</span>
        <span class="icon-btn">${ico(ICON.pencil, 20)}</span>
      </div>
      <div class="safe" style="padding-top:0">
        <div class="scroll" style="padding-bottom:${BOTTOM_INSET_DETAIL}px">
          <div class="hero">
            ${hero}
            <div class="title hero-name">${esc(ev.name)}</div>
            ${o.ordinal != null && o.ordinal > 0 ? `<span class="hero-ord">第 ${o.ordinal} 周年</span>` : ''}
          </div>

          <div class="section" style="margin-top:0">
            <div class="sec-head"><span class="sec-title">日期</span></div>
            <div class="card" style="margin:0 ${GUTTER}px">
              ${info('公历', `${D.formatFull(o.date)} · ${D.weekdayName(o.date)}`)}
              ${info('农历', o.lunar ? D.formatLunar(o.lunar) : '—')}
              ${info('周期', REPEAT_TEXT[ev.repeat] ?? ev.repeat)}
              ${info('起算', ev.year != null ? `${ev.year} 年` : '不限年份')}
            </div>
          </div>

          <div class="section">
            <div class="sec-head"><span class="sec-title">标记</span></div>
            <div class="card" style="margin:0 ${GUTTER}px">
              ${mark(
                `<span class="mark-dot" style="background:var(--${TONE_VAR[ev.tone]})"></span><span class="body ink2">标记色</span>`,
                '这决定了它在圆盘上与列表里的颜色',
              )}
              ${mark(
                `<span class="brand">${ico(ICON.star, 14)}</span><span class="body ink2">置顶</span>`,
                ev.pinned ? '已置顶' : '未置顶',
              )}
              ${mark(
                `<span class="brand">${ico(ICON.sun, 14)}</span><span class="body ink2">历法</span>`,
                ev.calendar === 'lunar' ? '农历' : '公历',
              )}
            </div>
          </div>

          ${
            ev.note
              ? `<div class="section">
            <div class="sec-head"><span class="sec-title">备注</span></div>
            <div class="card card-pad" style="margin:0 ${GUTTER}px">
              <span class="body ink2" style="line-height:23px">${esc(ev.note)}</span>
            </div>
          </div>`
              : ''
          }

          <div class="gutter" style="margin-top:${SP.xl}px">
            <span class="tag tag-brand">${ico(ICON.clock, 12, 2.2)}${esc(D.describeDays(o.days))}，可以准备起来了</span>
          </div>

          <div class="btn-col">
            <div class="btn">${ico(ICON.pencil, 17)}编辑</div>
            <div class="btn btn-danger">${ico(ICON.trash, 17)}删除</div>
          </div>
        </div>
      </div>`;
}

/* ---- 04 记一笔 ---- */
function screenCompose() {
  /**
   * 表单的空档默认值：`calendar='solar'`、`repeat='yearly'`、
   * 月日取今天（EventForm 的 `useState` 初值），年份为空 —— 于是两行日期文案
   * 交给 `calendar/describe.js` 现算，不手写。
   */
  const SEL = { year: null, month: TODAY.m, day: TODAY.d, leap: false, weekday: null };
  const dateText = describeDateShort('solar', 'yearly', SEL, TODAY);
  const dateDetail = describeDateValue('solar', 'yearly', SEL, TODAY, TODAY.y);

  const toneCells = [
    { label: '金', token: 'brand', on: true },
    { label: '青', token: 'sage', on: false },
    { label: '黄', token: 'amber', on: false },
    { label: '朱', token: 'clay', on: false },
  ];

  /* ★ 页头同样不滚动：compose.tsx 是 `<Screen><PageHeader/><EventForm/></Screen>`，
     EventForm 自己那层才是 ScreenScroll。 */
  return `
      <div class="safe">
        <div class="hdr">
          <div class="hdr-row"><div class="display">记一笔</div></div>
          <div class="hdr-sub">公历、农历，按年、按月、按周，都可以</div>
        </div>

        <div class="scroll">
          <div class="gutter">
            <div class="card card-pad">
              <div class="form-row">
                <span class="body form-lab">名字<span class="clay"> *</span></span>
                <div class="form-content"><span class="form-input">比如：妈妈的生日</span></div>
              </div>
              <div class="form-row">
                <span class="body form-lab">历法</span>
                <div class="form-content">
                  <div class="seg"><span class="on">公历</span><span>农历</span></div>
                </div>
              </div>
              <div class="form-row">
                <span class="body form-lab">周期</span>
                <div class="form-content">
                  <div class="seg"><span>一次</span><span class="on">每年</span><span>每月</span><span>每周</span></div>
                </div>
              </div>
              <div class="form-row last">
                <span class="body form-lab">日期</span>
                <div class="form-content">
                  <div class="date-row"><span class="body ink" style="font-weight:500">${dateText}</span><span class="chev">${ico(ICON.next, 15, 2.2)}</span></div>
                </div>
              </div>
            </div>
            <div style="margin:${SP.sm}px ${SP.xs}px 0;font-size:11.5px;line-height:17px;color:var(--ink3)">${dateDetail}</div>
          </div>

          <div class="section">
            <div class="sec-head"><span class="sec-title">标记</span></div>
            <div class="card card-pad" style="margin:0 ${GUTTER}px">
              <div class="tone-row">
                ${toneCells
                  .map(
                    (c) => `<div class="tone-cell">
                  <span class="tone-dot${c.on ? ' on' : ''}" style="background:var(--${c.token})">${c.on ? ico(ICON.check, 15, 2.4) : ''}</span>
                  <span class="tone-lab${c.on ? ' on' : ''}">${c.label}</span>
                </div>`,
                  )
                  .join('')}
              </div>
              <div class="divider"></div>
              <div class="switch-row">
                <div class="switch-txt">
                  <span class="body ink2">置顶</span>
                  <span class="label ink4">常看的日子放上面，圆盘上的点也更大</span>
                </div>
                <span class="knob"><i></i></span>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="sec-head"><span class="sec-title">备注</span></div>
            <div class="card card-pad" style="margin:0 ${GUTTER}px">
              <div class="note-box">想记的话、礼物清单、该提前准备什么…</div>
            </div>
          </div>

          <div class="gutter" style="margin-top:${SP.xl}px">
            <div class="btn btn-lg btn-primary">记下来</div>
          </div>
        </div>
        ${tabBar('compose')}
      </div>`;
}

/* ---- 05 我的 ---- */

/** 「我的」页的本体（不含 `.ph` 外壳）。主题面板要把它当背景用，所以单独拆出来。 */
function mineBody() {
  const lunarCount = EVENTS.filter((e) => e.calendar === 'lunar').length;
  const pinnedCount = EVENTS.filter((e) => e.pinned).length;
  const metrics = [
    { label: '日子', value: String(EVENTS.length) },
    { label: '农历', value: String(lunarCount) },
    { label: '盘上', value: String(ON_DIAL.length) },
    { label: '置顶', value: String(pinnedCount), tone: 'brand' },
  ];

  /** 右值语气：brand = 有引导意味（当前选择 / 待处理），ink3 = 陈述事实（controls.tsx SettingRow） */
  const setRow = (label, value, tone = 'brand') =>
    `<div class="set-row"><span class="body ink2">${esc(label)}</span>
      <span style="display:flex;align-items:center;gap:2px;min-width:0">
        <span class="body set-val ${tone}">${esc(value)}</span><span class="chev">${ico(ICON.next, 15, 2.2)}</span>
      </span></div>`;

  return `
      <div class="safe">
        <div class="scroll">
          <div class="hdr">
            <div class="hdr-row"><div class="display">我的</div></div>
            <div class="hdr-sub">外观、数据与关于</div>
          </div>

          <div class="card" style="margin:${SP.xs}px ${GUTTER}px 0">
            <div class="strip">
              ${metrics
                .map(
                  (m) => `<div class="strip-cell">
                <span class="strip-val" style="color:var(--${m.tone === 'brand' ? 'brand' : 'ink'})">${m.value}</span>
                <span class="strip-lab">${m.label}</span>
              </div>`,
                )
                .join('')}
            </div>
          </div>

          <div class="section">
            <div class="sec-head"><span class="sec-title">外观</span></div>
            <div class="card" style="margin:0 ${GUTTER}px">
              ${setRow('主题', `${THEMES.xuanye.name} · ${THEMES.xuanye.note}`)}
            </div>
          </div>

          <div class="section">
            <div class="sec-head"><span class="sec-title">数据</span></div>
            <div class="card" style="margin:0 ${GUTTER}px">
              ${setRow('回收站', '空', 'ink3')}
              ${setRow('备份与恢复', '还没备份过')}
            </div>
          </div>

          <div class="section">
            <div class="sec-head"><span class="sec-title">关于</span></div>
            <div class="card" style="margin:0 ${GUTTER}px">
              ${setRow('岁时', `v${APP_VERSION}`, 'ink3')}
            </div>
          </div>

          <div style="text-align:center;margin-top:${FIT.sectionTop}px;padding:0 40px;
            font-size:11.5px;line-height:18px;color:var(--ink4)">
            数据全部存在这台设备上，不上传、不需要账号。
          </div>
        </div>
      </div>
      ${tabBar('mine')}`;
}

function screenMine() {
  return mineBody();
}

/* ---- 06 主题面板 ---- */
/**
 * 主题面板是 `SheetModal`，用的是 RN 的 `<Modal transparent>` ——
 * 它**盖在整个屏幕上**（连标签栏一起），下面压着的是「我的」页。
 * 所以这一屏要先把「我的」页放进去，再叠遮罩与面板；
 * 只铺一层空底色就画成了「App 背后什么都没有」。
 */
function screenTheme() {
  const rows = ['xuanye', 'cangqing', 'moyu', 'sujian']
    .map((k) => {
      const t = THEMES[k];
      const on = k === 'xuanye';
      return `
          <div class="theme-row${on ? ' on' : ''}">
            <div class="swatch">
              <span style="background:${t.paper};flex:1.4"></span>
              <span style="background:${t.surface};flex:1"></span>
              <span style="background:${t.brand};flex:.8"></span>
            </div>
            <div class="theme-main">
              <span class="body theme-name" style="color:var(--${on ? 'brand' : 'ink'})">${esc(t.name)}</span>
              <span class="theme-note">${esc(t.note)}</span>
            </div>
            ${on ? `<span class="brand">${ico(ICON.check, 17, 2.2)}</span>` : ''}
          </div>`;
    })
    .join('');

  return `
      ${mineBody()}
      <div class="scrim"></div>
      <div class="sheet">
        <div class="sheet-head">
          <span class="title">主题</span>
          <span class="sheet-close">${ico(ICON.close, 19, 2.1)}</span>
        </div>
        <div class="sheet-body">
          ${rows}
          <div class="sheet-hint">岁时不跟随系统深色。星盘只有在墨底上才亮得起来 —— 白天想用浅色，手动切到素笺即可。</div>
          <div class="btn sheet-done">完成</div>
        </div>
      </div>`;
}

/* ------------------------------------------------------------ 组装 */

const APP_VERSION = (() => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  return raw?.expo?.version ?? '0.0.0';
})();

const SCREENS = [
  {
    slug: 'dial',
    title: '星盘 · 首页',
    note: '把一年摊成一张盘。光点按「距今天数 ÷ 366 × 360°」落下，金弧从今天那道刻扫到焦点；拖动可换个日子看。',
    build: screenDial,
  },
  {
    slug: 'list',
    title: '全部 · 按「还有多久」分段',
    note: '不按创建时间排，按时间距离分段 —— 一眼知道该往下翻多远。已过去的另起一段压到最后：它们不再是提醒，是存档。',
    build: screenList,
  },
  {
    slug: 'detail',
    title: '详情',
    note: '大号倒计时占住上半屏，下面才是事实。公历与农历两个都列出来，不管当初用哪个历法建的。',
    build: screenDetail,
  },
  {
    slug: 'compose',
    title: '记一笔',
    note: '只问三件事：叫什么、哪天、怎么重复。保存后回星盘而不是停在表单上 —— 看见它亮在盘上，才是这个应用的价值。',
    build: screenCompose,
  },
  {
    slug: 'mine',
    title: '我的',
    note: '一屏装完「关于这台设备上怎么看」与「关于这份数据」。主题做成带色块的长列表，因为四套的差别主要在底色与金味。',
    build: screenMine,
  },
  {
    slug: 'theme',
    title: '主题面板',
    note: '三套深色是主场，素笺留给白天。岁时不跟随系统深色 —— 跟随会让同一个应用在白天与夜里变成两个东西。',
    build: screenTheme,
  },
];

const figures = SCREENS.map(
  (s) => `
<figure class="fig" data-slug="${s.slug}">
  <div class="shot"><div class="ph" style="${themeVars(THEME)}">${s.build()}</div></div>
  <figcaption><b>${s.title}</b><span>${s.note}</span></figcaption>
</figure>`,
).join('\n');

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>岁时 · 界面（与 v${APP_VERSION} 实现逐屏核对）</title>
<style>
  :root{${themeVars({ ...THEMES.sujian, paper: '#F7F4EF', surface: '#FFFFFF', ink: '#2B241F', ink2: '#6B6055', ink3: '#9A8D80', line: '#E3DCD1', line2: '#EBE5DB', brand: '#8C5A34', brandDeep: '#6B4224', brandBg: '#F3E9DE', inset: '#F2EDE5', canvas: '#FBF9F6' })};
    --serif:${SERIF};--sans:${SANS};
  }
  *{box-sizing:border-box}
  body{margin:0;background:#F7F4EF;color:#2B241F;font-family:var(--serif);
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:1180px;margin:0 auto;padding:64px 32px 100px}
  header{border-bottom:1px solid #E3DCD1;padding-bottom:32px;margin-bottom:8px}
  .eyebrow{font-family:${SANS};font-size:11px;letter-spacing:.22em;text-transform:uppercase;
    color:#9A8D80;margin:0 0 16px}
  h1{font-size:32px;line-height:1.5;font-weight:400;margin:0 0 18px}
  h1 b{font-weight:400;color:#8C5A34}
  .lede{font-family:${SANS};font-size:14px;line-height:1.95;color:#6B6055;margin:0;max-width:74ch}
  .lede code{font-family:${SANS};font-size:12.5px;background:#F3E9DE;color:#6B4224;
    padding:1px 6px;border-radius:5px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(412px,1fr));
    gap:56px 40px;justify-items:center;margin-top:52px}
  figure.fig{margin:0;display:flex;flex-direction:column;align-items:center}
  .shot{border-radius:${R.phone}px;overflow:hidden;
    box-shadow:0 2px 4px rgba(43,36,31,.08),0 24px 48px -20px rgba(43,36,31,.34)}
  figcaption{font-family:${SANS};font-size:12.5px;line-height:1.85;color:#6B6055;
    margin-top:16px;max-width:${FRAME_W}px}
  figcaption b{display:block;font-size:13.5px;color:#2B241F;margin-bottom:3px}
  footer{border-top:1px solid #E3DCD1;margin-top:72px;padding-top:24px;
    font-family:${SANS};font-size:12.5px;line-height:1.9;color:#9A8D80}
${APP_CSS}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">岁时 v${APP_VERSION} · 界面</p>
    <h1>六屏<br><b>照源码重建，不是设计稿</b></h1>
    <p class="lede">
      这里的每一屏都是从 <code>src/</code> 的源码逐条重建的：界面文案照抄各屏组件，色值经
      <code>theme.ts</code> 解析，字号 / 间距 / 圆角照 <code>Type</code> / <code>Space</code> / <code>Radius</code> 的真值写。
      盘面 SVG 走 <code>scripts/lib/dial-svg.cjs</code>，与<code>docs/星盘-夜观-实现预览.html</code> 共用同一份装配代码；
      样本条目先按真实规则定义，再交给 <code>src/lib/calendar/resolve.js</code> 算出落点与天数。
      —— 也就是说，图上的「12 天后」「农历八月廿五」都是算出来的，不是写的。
    </p>
  </header>
  <div class="grid">
${figures}
  </div>
  <footer>
    帧宽 ${FRAME_W} × ${FRAME_H}（与常见 Android 机型同宽，于是圆盘取到设计基准 340px）。<br>
    星盘 / 全部 / 详情三屏在真机上本来就长过一屏（都是可滚动区），为使折叠线落在元素边界上，
    这几屏的纵向间距比真机收紧 2~4px（见 <code>scripts/screens-page.cjs</code> 的 <code>FIT</code>）；结构、文案、色值不受影响。<br>
    重新生成：<code>node_modules/.bin/tsc -p scripts/tsconfig.caltest.json &amp;&amp; node scripts/screens-page.cjs</code>，再用 readme-product-screens 的导出脚本出图。
  </footer>
</div>
</body>
</html>
`;

fs.writeFileSync(OUT_HTML, HTML, 'utf8');
console.log(`已写出 ${OUT_HTML}`);

fs.mkdirSync(RENDER_DIR, { recursive: true });
const RENDER_HTML = path.join(RENDER_DIR, 'screens.html');
fs.writeFileSync(RENDER_HTML, HTML, 'utf8');
console.log(`无中文名副本 ${RENDER_HTML}（供无头 Chrome，file:// 打不开含非 ASCII 的路径）`);

console.log(`  条目 ${EVENTS.length} 个 ｜ 上盘 ${ON_DIAL.length} 个 ｜ 焦点 = ${EVENT_BY_ID.get(ON_DIAL[FOCUS_I].id).name}（${ON_DIAL[FOCUS_I].days} 天后）`);
console.log(
  `  ${OCCURRENCES.map((o) => `${EVENT_BY_ID.get(o.id).name} ${o.days}d`).join(' ｜ ')}`,
);
