# -*- coding: utf-8 -*-
"""
星盘强化方案的方案页生成器。

为什么要脚本生成而不是手写 SVG：盘上 24 节气刻、12 条径向分界、月份数字
这类径向元素都要精确坐标，手算必错。这里统一按**真实实现参数**出图
（size=340 / c=170 / ringR=146，与 SkyDial.tsx 一致），
所以页面里看到的比例就是上机后的比例。

三张盘共用同一套光点数据（唯一变量 = 该方案新增的元素），
节气角度用 lunar-javascript 实算，不是凑的。
"""
import math
import os
import subprocess

OUT_HTML = r"E:\WorkBuddy\纪念日\星盘-强化方案.html"

SIZE = 340.0
C = SIZE / 2          # 170
RING = C - 24         # 146，与 SkyDial 的 ringR 一致

TONE = {
    'brand': '#C9985C',
    'sage': '#8FA87C',
    'amber': '#D9A94E',
    'clay': '#D57C61',
}
T = {
    'paper': '#16140F', 'canvas': '#1C1A15', 'surface': '#242118', 'inset': '#302C23',
    'ink': '#F2EBDF', 'ink2': '#B5AA99', 'ink3': '#8A7F6E', 'ink4': '#5E5648',
    'line': '#3A352B', 'line2': '#332F26', 'line3': '#2C2821',
    'brand': '#C9985C', 'brandDeep': '#E0B47C',
}

# 示例数据：今天是秋分。焦点 = 第 3 条（12 天，置顶）
ITEMS = [
    (0, 'brand', False), (3, 'clay', False), (12, 'brand', True),
    (21, 'amber', False), (34, 'sage', False), (48, 'clay', False),
    (75, 'brand', False), (90, 'amber', True), (120, 'sage', False),
    (180, 'clay', False), (225, 'brand', False), (266, 'amber', False),
    (300, 'sage', False), (350, 'clay', False),
]
FOCUS_I = 2

SERIF = 'Georgia,\'Songti SC\',SimSun,serif'
SANS = '-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif'


def polar(r, deg, cx=C, cy=C):
    rad = math.radians(deg - 90)
    return cx + r * math.cos(rad), cy + r * math.sin(rad)


def arc(r, a1, a2, sweep=1, cx=C, cy=C):
    x1, y1 = polar(r, a1, cx, cy)
    x2, y2 = polar(r, a2, cx, cy)
    large = 1 if abs(a2 - a1) > 180 else 0
    return f"M {x1:.2f} {y1:.2f} A {r:.2f} {r:.2f} 0 {large} {sweep} {x2:.2f} {y2:.2f}"


def sector(r_in, r_out, a1, a2, cx=C, cy=C):
    x1, y1 = polar(r_out, a1, cx, cy)
    x2, y2 = polar(r_out, a2, cx, cy)
    x3, y3 = polar(r_in, a2, cx, cy)
    x4, y4 = polar(r_in, a1, cx, cy)
    large = 1 if abs(a2 - a1) > 180 else 0
    return (f"M {x1:.2f} {y1:.2f} A {r_out:.2f} {r_out:.2f} 0 {large} 1 {x2:.2f} {y2:.2f} "
            f"L {x3:.2f} {y3:.2f} A {r_in:.2f} {r_in:.2f} 0 {large} 0 {x4:.2f} {y4:.2f} Z")


def deg_of(days):
    return days / 366.0 * 360.0


def brightness(days):
    if days <= 7:
        return 1.0
    if days <= 30:
        return 0.85
    if days <= 120:
        return 0.6
    return 0.42


# ---------------------------------------------------------------- 节气（实算）
JIEQI_PY = r"""
const { Solar } = require('lunar-javascript');
const o = { y: 2026, m: 9, d: 23 };
const ord = (p) => { const a=Math.floor((14-p.m)/12), y=p.y+4800-a, m=p.m+12*a-3;
  return p.d+Math.floor((153*m+2)/5)+365*y+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400)-32045; };
const o0 = ord(o); const out = {};
for (const ty of [2026, 2027]) {
  const t = Solar.fromYmd(ty, 6, 1).getLunar().getJieQiTable();
  for (const [n, d] of Object.entries(t)) {
    if (!/[\u4e00-\u9fa5]/.test(n)) continue;
    const p = { y: d.getYear(), m: d.getMonth(), d: d.getDay() };
    const dd = ord(p) - o0;
    // 同名节气会跨年出现两次，必须保留**更早**的那一次：
    // 今天是秋分，2026 的秋分是 0d、2027 的是 365d，后者覆盖前者会把
    // 扇区起点推到 359°（与「今天」那道刻几乎重合，图就错了）
    if (dd >= 0 && dd <= 366 && (!(n in out) || dd < out[n])) out[n] = dd;
  }
}
console.log(JSON.stringify(out));
"""

probe_path = r"E:\WorkBuddy\纪念日\.workbuddy\tmp\_jq.cjs"
with open(probe_path, 'w', encoding='utf-8') as f:
    f.write(JIEQI_PY)
raw = subprocess.run(
    [r"C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-3\node.exe", probe_path],
    capture_output=True, text=True, encoding='utf-8')
import json
JQ = json.loads(raw.stdout.strip())
# 八节 = 四立 + 二分二至，正好每 45° 一个
BAJIE = ['秋分', '立冬', '冬至', '立春', '春分', '立夏', '夏至', '立秋']


def head(svg_id, defs=""):
    return (f'<svg viewBox="0 0 {SIZE:.0f} {SIZE:.0f}" width="100%" role="img" '
            f'xmlns="http://www.w3.org/2000/svg">{defs}')


def core(group_font_serif=False, extra_top=None):
    """圆心：倒计时不随盘转，永远正面朝上。三版共用，甲版多一行月相 + 农历。"""
    s = []
    if extra_top:
        s.append(extra_top)
        name_y, num_y = 152, 198
    else:
        name_y, num_y = 146, 196
    s.append(f'<text x="{C:.0f}" y="{name_y}" text-anchor="middle" font-size="17" '
             f'fill="{T["ink"]}" font-family="{SANS}">结婚纪念日</text>')
    s.append(f'<text x="{C:.0f}" y="{num_y}" text-anchor="middle" font-size="46" '
             f'font-weight="500" fill="{T["brand"]}" font-family="{SANS}">12</text>')
    s.append(f'<text x="{C+42:.0f}" y="{num_y-14}" text-anchor="start" font-size="13" '
             f'fill="{T["ink2"]}" font-family="{SANS}">天后</text>')
    s.append(f'<text x="{C:.0f}" y="{num_y+18}" text-anchor="middle" font-size="13" '
             f'fill="{T["ink3"]}" font-family="{SANS}">2026 年 10 月 5 日 · 星期一</text>')
    return '\n'.join(s)


def dots(with_glow=False, glow_op=0.14):
    s = []
    if with_glow:
        for days, tone, pin in ITEMS:
            x, y = polar(RING, deg_of(days))
            r = 5 if pin else 3.4
            s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r*2.7:.1f}" '
                     f'fill="{TONE[tone]}" opacity="{glow_op:.2f}"/>')
    for days, tone, pin in ITEMS:
        x, y = polar(RING, deg_of(days))
        r = 5 if pin else 3.4
        s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{TONE[tone]}" '
                 f'opacity="{brightness(days):.2f}"/>')
    return '\n'.join(s)


def focus_group():
    x, y = polar(RING, deg_of(ITEMS[FOCUS_I][0]))
    return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="10" fill="none" stroke="{T["brand"]}" '
            f'stroke-width="1.4" opacity="0.9"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="16" fill="none" stroke="{T["brand"]}" '
            f'stroke-width="1" opacity="0.26"/>')


def gold_arc():
    a = deg_of(ITEMS[FOCUS_I][0])
    return (f'<path d="{arc(RING, 0, a)}" fill="none" stroke="{T["brand"]}" '
            f'stroke-width="2.5" stroke-linecap="round"/>')


def pointer():
    return f'<path d="M {C-5:.0f} 8 L {C+5:.0f} 8 L {C:.0f} 18 Z" fill="{T["brand"]}"/>'


def ticks_12():
    """现状的 12 道月份刻度（对照用）"""
    s = []
    for i in range(12):
        deg = deg_of((i + 1) * 30.4)
        x1, y1 = polar(RING, deg)
        x2, y2 = polar(RING - 7, deg)
        s.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{T["line"]}" stroke-width="1"/>')
    return '\n'.join(s)


# ================================================================ 甲 · 时宪
def svg_a():
    s = [head('a')]
    s.append(f'<circle cx="{C:.0f}" cy="{C:.0f}" r="{RING:.0f}" fill="#1C1A15"/>')
    # 八个节气扇区：按八节真实角度切，交替极淡金。
    # 5.5% 在墨底上实测几乎看不见（渲染后不可辨），提到 7.5% 才读得出「格子」
    angs = [deg_of(JQ[n]) for n in BAJIE] + [deg_of(JQ[BAJIE[0]]) + 360]
    for i in range(8):
        if i % 2 == 0:
            s.append(f'<path d="{sector(114, RING, angs[i], angs[i+1])}" '
                     f'fill="{T["brand"]}" opacity="0.075"/>')
    s.append(f'<circle cx="{C:.0f}" cy="{C:.0f}" r="{RING:.0f}" fill="none" '
             f'stroke="{T["line"]}" stroke-width="0.8"/>')
    # 内圈虚线轨道
    s.append(f'<circle cx="{C:.0f}" cy="{C:.0f}" r="104" fill="none" '
             f'stroke="{T["line3"]}" stroke-width="0.8" stroke-dasharray="2 5"/>')
    # 24 节气：非八节 = 短刻 + 一道贯到内圈的极淡格线；八节 = 加长金刻。
    # 格线才是「盘内不再是空的」的关键 —— 只有刻，环内仍是一片黑
    minor, major, spokes = [], [], []
    for n, dd in JQ.items():
        deg = deg_of(dd)
        if n in BAJIE:
            x1, y1 = polar(RING, deg); x2, y2 = polar(RING - 18, deg)
            major.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
        else:
            x1, y1 = polar(RING, deg); x2, y2 = polar(RING - 8, deg)
            minor.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
            x3, y3 = polar(RING - 8, deg); x4, y4 = polar(104, deg)
            spokes.append(f'<line x1="{x3:.1f}" y1="{y3:.1f}" x2="{x4:.1f}" y2="{y4:.1f}"/>')
    s.append(f'<g stroke="{T["line"]}" stroke-width="0.9" opacity="0.4">{"".join(spokes)}</g>')
    s.append(f'<g stroke="{T["line"]}" stroke-width="1.1" opacity="0.95">{"".join(minor)}</g>')
    s.append(f'<g stroke="{T["brand"]}" stroke-width="2" >{"".join(major)}</g>')
    # 八节名（r=122，衬线小字，落在扇区内、不被格线穿过）
    for n in BAJIE:
        deg = deg_of(JQ[n])
        x, y = polar(122, deg)
        s.append(f'<text x="{x:.1f}" y="{y+4.5:.1f}" text-anchor="middle" font-size="13" '
                 f'fill="{T["ink2"]}" font-family="{SERIF}">{n}</text>')
    s.append(gold_arc())
    s.append(dots())
    s.append(focus_group())
    # 圆心：多一行「月相 + 农历」——甲版把历书感带到圆心。
    # 图标与文字作为一组整体居中（cx 左移，文字右接），否则会明显偏右。
    # mask 的暗椭圆必须**偏心**：居中挖会得到「中间暗、左右各一道月牙」，
    # 那是日食不是月相。偏心放到左缘，剩下的才是渐盈凸月（约六成亮）
    my = 122
    moon = (f'<g><circle cx="{C-56:.0f}" cy="{my}" r="9" fill="{T["paper"]}" '
            f'stroke="{T["line"]}" stroke-width="0.8"/>'
            f'<mask id="a-wax"><circle cx="{C-56:.0f}" cy="{my}" r="9" fill="white"/>'
            f'<ellipse cx="{C-61.4:.1f}" cy="{my}" rx="3.6" ry="9" fill="black"/></mask>'
            f'<circle cx="{C-56:.0f}" cy="{my}" r="9" fill="{T["ink2"]}" mask="url(#a-wax)"/>'
            f'<text x="{C-40:.0f}" y="{my+5}" text-anchor="start" font-size="13" '
            f'fill="{T["ink2"]}" font-family="{SERIF}">八月十三 · 秋分</text></g>')
    s.append(core(extra_top=moon))
    s.append(pointer())
    s.append('</svg>')
    return '\n'.join(s)


# ================================================================ 乙 · 星图
def svg_b():
    s = [head('b')]
    s.append(f'<circle cx="{C:.0f}" cy="{C:.0f}" r="{RING:.0f}" fill="#1C1A15"/>')
    # 十二个月扇区：30° 一格，交替底色（3.5% 实测太淡，提到 5%）
    for i in range(12):
        if i % 2 == 0:
            s.append(f'<path d="{sector(124, RING, i*30, (i+1)*30)}" '
                     f'fill="{T["ink"]}" opacity="0.05"/>')
    # 月份分界径向虚线
    for i in range(12):
        deg = i * 30
        x1, y1 = polar(124, deg); x2, y2 = polar(RING, deg)
        s.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{T["line"]}" stroke-width="0.8" stroke-dasharray="2 4"/>')
    # 月份汉字：r=120 而非 131 —— 131 会被焦点簇的圆圈（r=11.5，中心在环上）
    # 从外侧压住「十二」「一」；同时用 ink3 而非 ink4，ink4 在墨底上读不出
    CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
    for i, n in enumerate(CN):
        x, y = polar(120, i * 30 + 15)
        s.append(f'<text x="{x:.1f}" y="{y+4.5:.1f}" text-anchor="middle" font-size="13" '
                 f'fill="{T["ink3"]}" font-family="{SERIF}">{n}</text>')
    s.append(f'<circle cx="{C:.0f}" cy="{C:.0f}" r="{RING:.0f}" fill="none" '
             f'stroke="{T["line"]}" stroke-width="1.4"/>')
    # 内层月弧环：12 段，段间留 4° 缝（2° 时缝只有 3.7px，看不出是分段）
    for i in range(12):
        a1, a2 = i * 30 + 2, (i + 1) * 30 - 2
        s.append(f'<path d="{arc(106, a1, a2)}" fill="none" stroke="{T["line"]}" '
                 f'stroke-width="6"/>')
    # 星座连线：相邻光点间的环上短弧
    pts = sorted(ITEMS, key=lambda t: t[0])
    for i in range(len(pts) - 1):
        a1, a2 = deg_of(pts[i][0]), deg_of(pts[i + 1][0])
        if a2 - a1 < 1:
            continue
        s.append(f'<path d="{arc(RING, a1, a2)}" fill="none" stroke="{T["brand"]}" '
                 f'stroke-width="1.1" opacity="0.16"/>')
    s.append(gold_arc())
    s.append(dots())
    # 密集簇：0 天与 3 天相距 3°，合并成一簇。
    # 半径压到 9：焦点光晕 r=16 与它只隔 10.3°（弧长 26px），
    # 11.5 时两圈会叠在一起，看着像一团乱线
    mx, my = polar(RING, deg_of(1.5))
    s.append(f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="9" fill="none" '
             f'stroke="{T["brand"]}" stroke-width="0.9" opacity="0.75"/>')
    s.append(f'<text x="{mx:.1f}" y="{my+4:.1f}" text-anchor="middle" font-size="11" '
             f'fill="{T["brand"]}" font-family="{SANS}">2</text>')
    s.append(focus_group())
    s.append(core())
    s.append(pointer())
    s.append('</svg>')
    return '\n'.join(s)


# ================================================================ 丙 · 夜观
def svg_c():
    s = [head('c')]
    # 盘面纵深：三层同心圆近似径向渐变
    s.append(f'<circle cx="{C:.0f}" cy="{C:.0f}" r="{RING:.0f}" fill="#131109"/>')
    s.append(f'<circle cx="{C:.0f}" cy="{C:.0f}" r="112" fill="#181510"/>')
    s.append(f'<circle cx="{C:.0f}" cy="{C:.0f}" r="74" fill="#1E1A13"/>')
    # 星野（静态，不随盘转）
    star_angs = [23, 71, 118, 166, 214, 261, 309, 356]
    star_rs = [40, 62, 88, 116, 134]
    k = 0
    for a in star_angs:
        for r in star_rs:
            if (k * 7) % 3 == 0:
                x, y = polar(r + (k % 5) * 2, a + (k % 7) * 1.7)
                s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="0.9" '
                         f'fill="{T["ink"]}" opacity="{0.1 + (k % 5) * 0.028:.3f}"/>')
            k += 1
    # 时间光带：12 段弧，越远越暗
    ops = [0.50, 0.42, 0.34, 0.27, 0.21, 0.16, 0.12, 0.10, 0.08, 0.06, 0.05, 0.04]
    for i in range(12):
        s.append(f'<path d="{arc(RING, i*30, (i+1)*30)}" fill="none" stroke="{T["brand"]}" '
                 f'stroke-width="2.4" stroke-linecap="round" opacity="{ops[i]:.2f}"/>')
    # 四个分至点刻
    for deg in (0, 90, 180, 270):
        x1, y1 = polar(RING, deg); x2, y2 = polar(RING - 13, deg)
        s.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                 f'stroke="{T["brand"]}" stroke-width="1.2" opacity="0.55"/>')
    s.append(dots(with_glow=True, glow_op=0.17))
    s.append(focus_group())
    x, y = polar(RING, deg_of(ITEMS[FOCUS_I][0]))
    s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="22" fill="none" stroke="{T["brand"]}" '
             f'stroke-width="0.8" opacity="0.12"/>')
    s.append(core())
    s.append(pointer())
    s.append('</svg>')
    return '\n'.join(s)


SVG_A, SVG_B, SVG_C = svg_a(), svg_b(), svg_c()

# ================================================================ HTML
TPL = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>岁时 · 星盘强化三版方案</title>
<style>
  :root{
    --paper:#F7F4EF; --paper2:#FBF9F6; --card:#FFFFFF;
    --ink:#2B241F; --ink2:#6B6055; --ink3:#9A8D80; --ink4:#C9BEB0;
    --line:#E3DCD1; --line2:#EBE5DB;
    --brand:#8C5A34; --brand-d:#6B4224; --brand-bg:#F3E9DE;
    --sage:#5F7355; --amber:#926521; --clay:#AA523D;
    --night:#16140F;
    --serif:Georgia,"Songti SC","Source Han Serif SC",SimSun,serif;
    --sans:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--paper); color:var(--ink);
    font-family:var(--serif); font-size:16px; line-height:2.0;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:880px; margin:0 auto; padding:72px 32px 120px}
  header{border-bottom:1px solid var(--line); padding-bottom:36px; margin-bottom:56px}
  .eyebrow{font-family:var(--sans); font-size:11px; letter-spacing:.22em;
    text-transform:uppercase; color:var(--ink3); margin:0 0 18px}
  h1{font-size:34px; line-height:1.5; font-weight:400; margin:0 0 20px; letter-spacing:.02em}
  h1 b{font-weight:400; color:var(--brand)}
  .lede{font-size:16.5px; color:var(--ink2); margin:0; max-width:66ch}
  h2{font-size:24px; font-weight:400; margin:76px 0 8px; letter-spacing:.02em;
    padding-top:28px; border-top:1px solid var(--line2)}
  h2 .no{font-family:var(--sans); font-size:12px; color:var(--brand);
    letter-spacing:.16em; display:block; margin-bottom:10px; font-weight:500}
  h3{font-size:19px; font-weight:400; margin:44px 0 12px}
  h4{font-family:var(--sans); font-size:13px; font-weight:600; margin:34px 0 10px;
    color:var(--brand-d); letter-spacing:.04em}
  p{margin:0 0 20px}
  .muted{color:var(--ink2)}
  .sans{font-family:var(--sans); font-size:14.5px; line-height:1.95}
  em{font-style:normal; color:var(--brand-d); border-bottom:1px solid var(--brand-bg)}
  strong{font-weight:600}
  .dial-note{font-family:var(--sans); font-size:12.5px; color:var(--ink3);
    text-align:center; margin:14px 0 0; line-height:1.7}

  figure.dial{margin:32px 0 12px; text-align:center}
  .screen{display:inline-block; width:100%; max-width:400px; border-radius:20px;
    background:var(--night); padding:22px 22px 26px;
    box-shadow:0 1px 2px rgba(43,36,31,.06), 0 12px 32px -12px rgba(43,36,31,.28)}
  .screen svg{display:block; width:100%; height:auto}

  table{width:100%; border-collapse:collapse; margin:22px 0 26px;
    font-family:var(--sans); font-size:13.5px; line-height:1.75}
  th{text-align:left; font-weight:600; color:var(--ink2); font-size:12.5px;
    border-bottom:1px solid var(--line); padding:10px 12px 10px 0}
  td{border-bottom:1px solid var(--line2); padding:11px 12px 11px 0; vertical-align:top}
  td.n{font-variant-numeric:tabular-nums; white-space:nowrap}
  tr:last-child td{border-bottom:none}
  .tag{display:inline-block; font-family:var(--sans); font-size:11px; line-height:1.6;
    padding:1px 8px; border-radius:99px; background:var(--brand-bg); color:var(--brand-d)}
  .tag.s{background:#EDF1E9; color:var(--sage)}
  .tag.a{background:#FBF1DF; color:var(--amber)}
  .tag.c{background:#F9EAE5; color:var(--clay)}
  .tag.n{background:#F2EDE5; color:var(--ink2)}

  .cols{display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr));
    gap:14px; margin:24px 0 8px}
  .box{background:var(--card); border:1px solid var(--line); border-radius:12px;
    padding:18px 20px}
  .box h5{font-family:var(--sans); font-size:13px; font-weight:600; margin:0 0 8px;
    color:var(--brand-d)}
  .box p{font-family:var(--sans); font-size:13.5px; line-height:1.85; margin:0; color:var(--ink2)}

  ul,ol{margin:0 0 20px; padding-left:22px}
  li{margin-bottom:9px}
  li::marker{color:var(--ink4)}

  .verdict{background:var(--card); border:1px solid var(--line);
    border-left:3px solid var(--brand); border-radius:0 12px 12px 0;
    padding:24px 28px; margin:30px 0}
  .verdict p:last-child{margin-bottom:0}
  .verdict .vh{font-family:var(--sans); font-size:12px; letter-spacing:.14em;
    color:var(--brand); text-transform:uppercase; margin:0 0 12px; font-weight:600}

  .pick{display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px;
    margin:26px 0}
  .pick .p{background:var(--card); border:1px solid var(--line); border-radius:14px;
    padding:22px 24px}
  .pick .p.hot{border:2px solid var(--brand)}
  .pick h5{font-family:var(--sans); font-size:14px; font-weight:600; margin:0 0 4px}
  .pick .sub{font-family:var(--sans); font-size:12px; color:var(--ink3); margin:0 0 14px}
  .pick ul{font-family:var(--sans); font-size:13.5px; line-height:1.9; padding-left:18px;
    margin:0}
  footer{border-top:1px solid var(--line); margin-top:80px; padding-top:28px;
    font-family:var(--sans); font-size:12.5px; color:var(--ink3); line-height:1.9}
  code{font-family:var(--sans); font-size:13px; background:var(--brand-bg);
    color:var(--brand-d); padding:1px 6px; border-radius:5px}
  @media (max-width:640px){
    .wrap{padding:44px 20px 80px}
    h1{font-size:26px} h2{font-size:20px}
  }
</style>
</head>
<body>
<div class="wrap">

<header>
  <p class="eyebrow">岁时 · 首页星盘</p>
  <h1>把盘做得更厚<br><b>三版强化方案</b></h1>
  <p class="lede">现在的星盘是一道细环、十二道刻度、若干光点。结构没错，但盘内是空的，而且整张盘上只有「我的日子」，没有「天地的时间」——而后者才是「天象」这个母题的立足点。下面三版各自往一个方向加厚，可以单选，也可以拆开重组。</p>
</header>

<h2><span class="no">现状盘点</span>这张盘现在有八类元素</h2>

<table>
  <tr><th style="width:26%">元素</th><th style="width:34%">现状</th><th>作用</th></tr>
  <tr><td>外轨道</td><td>一道 1.5px 细圆</td><td>界定「一年」的边界</td></tr>
  <tr><td>月份刻度</td><td>12 道 1px 短线，等分在环上</td><td>读得出月份</td></tr>
  <tr><td>今天刻度</td><td>一道金色长刻 + 端点小圆，随盘转走</td><td>盘的零位，也告诉你转了多少</td></tr>
  <tr><td>金弧</td><td>从今天扫到焦点，800ms 显影</td><td>「还有多远」</td></tr>
  <tr><td>光点</td><td>按分类上色、按远近调亮度，置顶的更大</td><td>全部日子</td></tr>
  <tr><td>焦点光晕</td><td>双环 10 / 16</td><td>谁在指针底下</td></tr>
  <tr><td>指针</td><td>12 点三角</td><td>焦点指针</td></tr>
  <tr><td>圆心</td><td>名字 + 倒计时 + 公历 + 农历 + 周年</td><td>焦点详情</td></tr>
</table>

<h4>四处缺口</h4>
<ol>
  <li><strong>盘内是空的。</strong>直径 292px 的圆里没有任何内容，一年只有 12 道刻度，中段一大片留白。</li>
  <li><strong>只有「我的日子」。</strong>没有节气、月相、四季——盘是纯粹的数据可视化，不是一个「天象」。</li>
  <li><strong>光点会挤成一团。</strong>同一天或相邻几天的条目，在 340px 的盘上只差 1–2px，直接糊在一起。示例里「今天」和「3 天后」两枚中心只差 <code>3.5px</code>。</li>
  <li><strong>其余光点没有身份。</strong>三十枚小圆里，除了焦点那一枚，其余都只是「有个日子」，看不出是谁、哪一类还叠了几条。</li>
</ol>

<div class="verdict">
  <p class="vh">一个前提</p>
  <p>方案里所有「历书层」元素都不是画饼——我已经拿项目里现成的 <code>lunar-javascript@1.7.7</code> 实测过：<strong>二十四节气可以精确到日并算出环上角度</strong>（秋分 +0d、寒露 +15d、霜降 +30d、立冬 +45d…），<strong>月相有 23 档古称</strong>（朔、上弦、望、下弦、既望…），另有干支纪年月日、二十八宿、五行可取。数据侧零成本，加的都是渲染与排版。</p>
  <p>另外有个意外的顺带发现：<strong>八节——四立加二分二至——正好每 45° 一个</strong>（秋分 0°、立冬 45°、冬至 90°、立春 135°、春分 180°、立夏 225°、夏至 270°、立秋 315°）。这不是巧合，是节气的天文定义决定的。它意味着方案甲的主骨架天然规整，不需要人为凑角度。</p>
</div>

<h2><span class="no">方案甲</span>时宪</h2>
<p class="muted sans">向<strong>历法深度</strong>要丰富。把星盘变成一页真正的时宪书——盘上不只是我的日子，还有天地的时间。</p>

<figure class="dial">
  <div class="screen">__DIAL_A__</div>
  <figcaption class="dial-note">按真实参数绘制：size 340 / ringR 146 / 焦点为「12 天后」。节气角度由 lunar-javascript 实算。</figcaption>
</figure>

<h4>新增元素</h4>
<table>
  <tr><th style="width:30%">元素</th><th>做法与作用</th></tr>
  <tr><td>二十四节气</td><td>环内一圈短刻：八节（四立 + 二分二至）用暖金加长到 18px，其余十六个用暗线 8px；<strong>每个节气再向圆心拉一道极淡的径向格线</strong>（<code>r=138 → 104</code>）。格线才是「盘内不再是空的」的关键——只加刻度的话，环内仍是一片黑。一年从此有二十四格，而不只是十二格。</td></tr>
  <tr><td>八节名</td><td>八个方位各一个衬线小字（秋分 / 立冬 / 冬至 / 立春 / 春分 / 立夏 / 夏至 / 立秋）。恰好每 45° 一个，八个方位全占满——这是盘上第一次出现「与用户无关的字」。</td></tr>
  <tr><td>节气扇区</td><td>相邻两个节气之间的扇区（约 15 天），交替铺一层 <code>brand 7.5%</code> 的极淡底。让「半个月一格」的节律在盘面铺开，像历书的格子。<em>初稿用了 5.5%，渲染出来在墨底上几乎不可见，已提亮。</em></td></tr>
  <tr><td>盘面</td><td>环内填实为 <code>canvas</code> 色。现在是全透明，圆只是一道线；填实之后它才成为一个「面」，节气扇区也才有地方落。</td></tr>
  <tr><td>内圈虚线轨道</td><td><code>r = 104</code> 一圈虚线。给节气名与圆心之间留一道呼吸带，同时呼应设计稿里原本就有的那圈虚线。</td></tr>
  <tr><td>圆心月相</td><td>名字上方加一枚 <code>r=9</code> 的月相图标（按农历日算盈亏）+「八月十三 · 秋分」。这是圆心第一次承载「今天」而非「焦点」。</td></tr>
</table>

<div class="cols">
  <div class="box"><h5>最值的一点</h5><p>空盘不再难看。现在一个纪念日都没记时，圆心写着「还没有记下任何日子」，盘上空白一片。有了节气骨架，空盘也是一张完整的时宪书——它先成立，然后等用户往上添日子。</p></div>
  <div class="box"><h5>要付的代价</h5><p>环内多了八个字和二十四道刻，视觉密度明显上升，光点不再那么「跳」。节气名在浅色主题（素笺）下对比度要单独调——<code>ink3</code> 在暖米白上偏弱。</p></div>
  <div class="box"><h5>实现成本</h5><p>中。节气要算并缓存（按年，一天一次足够）；刻与扇区都是静态 SVG，不参与手势；只有八节名要跟着盘转——它们本来就在随盘旋转的那一层里。</p></div>
</div>

<h2><span class="no">方案乙</span>星图</h2>
<p class="muted sans">向<strong>结构与信息密度</strong>要丰富。让「一年有多满」一眼可读——哪几个月拥挤，哪几个月空着。</p>

<figure class="dial">
  <div class="screen">__DIAL_B__</div>
  <figcaption class="dial-note">同样的日期数据，同样的光点。新增的是它周围的结构。</figcaption>
</figure>

<h4>新增元素</h4>
<table>
  <tr><th style="width:30%">元素</th><th>做法与作用</th></tr>
  <tr><td>月份扇区</td><td>环内按 30° 切十二格，交替铺一层 <code>ink 3.5%</code> 的底。月份在盘上第一次成为可见的实体，而不只是环上的一道刻。</td></tr>
  <tr><td>径向分界虚线</td><td>十二道从 <code>r=118</code> 到环的虚线，把扇区切开。视觉上明确「这是格子」，强化可读性。</td></tr>
  <tr><td>月份汉字</td><td>每个扇区中点一枚「一二三…十二」，衬线小字，落在 <code>r=120</code>。中文数字比阿拉伯数字更有历书气，而且单字不会撑破 30° 的格子。<em>位置有讲究：初稿放在 r=131，会被环上焦点簇的圆圈从外侧压住「十二」和「一」。</em></td></tr>
  <tr><td>内层月弧环</td><td><code>r=106</code> 一圈粗描边（5px），切成十二段、段间留 2° 缝。双层同心结构——外环是「日子」，内环是「月份」。</td></tr>
  <tr><td>星座连线</td><td>相邻光点之间沿环画一道极淡短弧（16% 透明度）。疏密一眼可见，而且形态真的像星座连线——母题上站得住。</td></tr>
  <tr><td>密集簇</td><td>角度相差不到 4° 的光点合并成一簇：一个圈 + 一个数字。示例里「今天」和「3 天后」就合成了一枚写着 <code>2</code> 的圈。这条直接解决缺口 3。</td></tr>
</table>

<div class="cols">
  <div class="box"><h5>最值的一点</h5><p>密集簇。这是三版里唯一一个<strong>真正修复了缺陷</strong>而非只是加装饰的元素——三十个日子挤在年底时，现在是无解的，合簇之后每一枚都还在。</p></div>
  <div class="box"><h5>要付的代价</h5><p>最像图表的一版。扇区 + 分界 + 数字 + 双层环，信息密度最高，但气质会往「数据看板」偏，离「观星」远了。浅色主题下尤其像甘特图。</p></div>
  <div class="box"><h5>实现成本</h5><p>中。几何全部静态、好画；真正要写代码的是<strong>合簇算法</strong>（按角度聚类 + 定簇心 + 数字）+ 一个「点簇展开」的交互，否则用户点不到簇里的条目。</p></div>
</div>

<h2><span class="no">方案丙</span>夜观</h2>
<p class="muted sans">向<strong>光影与氛围</strong>要丰富。元素最少，但把它做成一件会发光的器物。</p>

<figure class="dial">
  <div class="screen">__DIAL_C__</div>
  <figcaption class="dial-note">盘面用三层同心圆模拟纵深，外环由亮渐暗——越远的月份越沉。</figcaption>
</figure>

<h4>新增元素</h4>
<table>
  <tr><th style="width:30%">元素</th><th>做法与作用</th></tr>
  <tr><td>盘面纵深</td><td>环内用三层同心圆由外向内微微提亮（<code>#131109 → #181510 → #1E1A13</code>）。现在盘是全平的；有纵深之后，光点才像是浮在盘面上而不是贴在上面。</td></tr>
  <tr><td>星野</td><td>约三十枚 <code>r=0.8</code> 的极暗星点（透明度 6%–13%）铺在盘内。<strong>不随盘转</strong>——它是背景，转的是刻度。</td></tr>
  <tr><td>时间光带</td><td>外环本身就是十二段弧，透明度从 <code>0.50</code> 递减到 <code>0.04</code>。时间的方向感第一次有了着落：越远越沉，一年的尽头几乎融进夜色。</td></tr>
  <tr><td>光点辉光</td><td>每枚光点外裹一层 2.7 倍半径的同色圆（17% 透明度）。远光点只剩一点影子，近的会「亮」起来——这是把现有的亮度通道从「透明度」升级成「发光」。<strong>顺带解决了「光点太小看不清」</strong>：光点本体仍是 3.4px 的星，但视觉直径变成了 18px。</td></tr>
  <tr><td>焦点呼吸</td><td>焦点光晕加到三环（10 / 16 / 22），最外一圈做缓慢呼吸。<em>静态图看不出，上机才有。</em></td></tr>
  <tr><td>分至点刻</td><td>只保留春分 / 秋分 / 夏至 / 冬至四道金刻。是方案甲的极简版——不铺满，只留四个方位。</td></tr>
</table>

<div class="cols">
  <div class="box"><h5>最值的一点</h5><p>这是三版里唯一直击「深色是主场」这个前提的。方案 B 当初选深色，理由就是「星盘只有在墨底上才亮得起来」——丙把这句理由真的做了出来。</p></div>
  <div class="box"><h5>要付的代价</h5><p>信息增益最低。除了时间光带，其余都是氛围。如果目标是「看起来更丰富」，它满足；如果目标是「能用出更多东西」，它不满足。</p></div>
  <div class="box"><h5>实现成本</h5><p>表面最低，但要小心两处：<strong>辉光会让 SVG 节点翻倍</strong>（每枚光点两个圆），三十个条目就是六十个节点；<strong>渐变在 react-native-svg 上比普通填色贵</strong>，所以盘面纵深建议用三层实心圆近似而不是 <code>RadialGradient</code>（上图就是这么画的）。</p></div>
</div>

<h2><span class="no">横向对比</span>三版放在一起看</h2>

<table>
  <tr>
    <th style="width:20%"></th>
    <th style="width:26.6%">甲 · 时宪</th>
    <th style="width:26.6%">乙 · 星图</th>
    <th style="width:26.6%">丙 · 夜观</th>
  </tr>
  <tr><td>加厚方向</td><td>历法深度</td><td>结构与密度</td><td>光影与氛围</td></tr>
  <tr><td>新增元素</td><td class="n">6 类</td><td class="n">6 类</td><td class="n">6 类</td></tr>
  <tr><td>盘内是否填实</td><td>是（纯色）</td><td>是（扇区）</td><td>是（三层纵深）</td></tr>
  <tr><td>信息增益</td><td><span class="tag s">中</span> 多了一层与用户无关的时间</td><td><span class="tag">高</span> 密度可读、簇可数</td><td><span class="tag n">低</span> 主要是氛围</td></tr>
  <tr><td>修复既有缺陷</td><td>空盘难看</td><td>密集处糊成一团</td><td>无</td></tr>
  <tr><td>视觉气质</td><td>旧历书、有分量</td><td>星图、偏工具</td><td>观星、最耐看</td></tr>
  <tr><td>浅色主题下</td><td><span class="tag a">需单独调</span> 节气名对比度</td><td><span class="tag c">风险最高</span> 像甘特图</td><td><span class="tag c">退化明显</span> 墨底才是主场</td></tr>
  <tr><td>实现成本</td><td><span class="tag a">中</span></td><td><span class="tag a">中</span> 合簇要写算法</td><td><span class="tag s">低</span> 注意节点数</td></tr>
  <tr><td>性能影响</td><td>小（静态 SVG）</td><td>小</td><td>中（节点翻倍）</td></tr>
  <tr><td>动效负担</td><td>无新增</td><td>无新增</td><td>焦点呼吸 +1 条</td></tr>
</table>

<h2><span class="no">我的建议</span>甲 + 丙，分两步</h2>

<div class="pick">
  <div class="p hot">
    <h5>第一步 · 甲 + 丙<span class="tag">推荐</span></h5>
    <p class="sub">节气骨架 + 盘面纵深</p>
    <ul>
      <li>太阳系骨架：盘面填实、三层纵深、廿四节气刻、八节名、节气扇区、内圈虚线</li>
      <li>光影：时间光带、光点辉光、分至点刻</li>
      <li>先不做：圆心月相（挤，收益小）</li>
      <li>理由：一个给「骨」，一个给「肉」。甲让盘有资格叫天象，丙让它真的亮得起来。两者都在「深色主场」这个前提内，不打架</li>
    </ul>
  </div>
  <div class="p">
    <h5>第二步 · 从乙取一样</h5>
    <p class="sub">只取密集簇</p>
    <ul>
      <li>乙整版气质偏工具，不建议全上</li>
      <li>但<strong>密集簇是唯一的真修复</strong>：条目一多，现在的盘无解</li>
      <li>可独立实现，不依赖扇区与双层环</li>
      <li>建议与第一步一起做，因为都是「光点层」的改动</li>
    </ul>
  </div>
</div>

<div class="verdict">
  <p class="vh">我不推荐什么</p>
  <p><strong>不建议十二月份扇区 + 月份汉字那一路。</strong>它在浅色主题下最像甘特图，而且「一年十二个月」这件事用户本来就知道，盘上多出来的是结构而非信息。真正值得加的是它旁边那个密集簇——那是解决真问题，不是加装饰。</p>
</div>

<h2><span class="no">技术前提</span>要先动一次结构</h2>
<p>现在的实现是<strong>整整一层 SVG 一起旋转</strong>：</p>
<pre style="font-family:var(--sans);font-size:13px;line-height:1.9;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 20px;overflow-x:auto;margin:0 0 22px"><code style="background:none;color:var(--ink);padding:0">&lt;Animated.View style={ringStyle}&gt;      // 这一层整体转
  &lt;Svg&gt; 轨道 + 刻度 + 光点 + 金弧 &lt;/Svg&gt;
&lt;/Animated.View&gt;</code></pre>
<p>三版里都有<strong>不该跟着转</strong>的东西：丙的星野（背景）、乙的月份汉字（转起来会倒立——正立文字不能放在旋转层里）、甲的节气扇区（如果希望它像印在盘上的底纹）。所以需要把它拆成两层：</p>
<ul>
  <li><strong>静止层</strong>——盘面、星野、月份汉字，只用普通 <code>&lt;Svg&gt;</code>，不动</li>
  <li><strong>旋转层</strong>——刻度、节气刻、八节名、光点、金弧，包在原来那层里</li>
</ul>
<p>两层叠放，尺寸一致。这是个干净的重构，改完之后上面三版的任何一个元素都只是往对应层里加一段静态 SVG，不再动结构。</p>

<footer>
  岁时 · 首页星盘强化方案 · 2026-09-23<br>
  图中节气角度由 lunar-javascript 实算（以秋分为 0°，366 天映射 360°）；<br>
  三张盘共用同一套示例数据（14 个日子，焦点为「12 天后」），唯一变量是该方案新增的元素。
</footer>

</div>
</body>
</html>
"""

html = TPL.replace('__DIAL_A__', SVG_A).replace('__DIAL_B__', SVG_B).replace('__DIAL_C__', SVG_C)
with open(OUT_HTML, 'w', encoding='utf-8') as f:
    f.write(html)

print('written :', OUT_HTML)
print('size    :', f'{os.path.getsize(OUT_HTML):,}', 'bytes')
print('节气数  :', len(JQ), ' 八节:', ' '.join(f'{n}={JQ[n]}d' for n in BAJIE))
print('svg a/b/c chars:', len(SVG_A), len(SVG_B), len(SVG_C))
