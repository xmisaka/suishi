# -*- coding: utf-8 -*-
"""
生成 docs/岁时-图标方案.html

四版的图全部由 suishi-icons.py 现算（真素材，不是示意图），
以 base64 内嵌 —— 单文件自包含，可以直接发给别人看。

★ 输出到 docs/ 而不是仓库根：设计稿与方案页集中一处，仓库根只留工程文件。
   搬过一次，别改回去 —— 改了根目录会重新长出一份，与 docs/ 里的分叉。

用法：
    python scripts/icon-plan-page.py
"""

import base64
import importlib.util
import io
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "岁时-图标方案.html")

_spec = importlib.util.spec_from_file_location(
    "si", os.path.join(ROOT, "scripts", "suishi-icons.py"))
si = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(si)


# ---------------------------------------------------------------- 图
def b64(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def hero(key, px=600):
    base = si.on_bed(si.render(key, 1024), 1024)
    return b64(si.masked(base, "round").resize((px, px), Image.LANCZOS))


def squarish(key, shape, px=176):
    base = si.on_bed(si.render(key, 1024), 1024)
    return b64(si.masked(base, shape).resize((px, px), Image.LANCZOS))


def real(key, px):
    """真实像素，1:1 —— 不缩放，用来判断小尺寸存活"""
    im = si.on_bed(si.render(key, px), px)
    im.putalpha(si._mask_squircle(px))
    return b64(im)


def gewu_icon(px=200):
    p = os.path.join(ROOT, "assets", "images", "icon.png")
    im = Image.open(p).convert("RGBA").resize((px, px), Image.LANCZOS)
    return b64(im)


# ---------------------------------------------------------------- 文案
PLANS = [
    dict(
        key="jia", ord="甲", name="圆相", tag="与 App 同构",
        sub="把 App 里的星盘直接搬上桌面",
        lede="打开 App 是一枚星盘，桌面上的图标也是它。用户不用学。",
        points=[
            "外环 + 四道分至点刻。刻的角度是<b>实算的</b>（0 / 88.5 / 176.1 / 266.6°），"
            "不是四等分 —— 公转不均匀，固定 90° 分画出来的其实只是「今天 + 90n 天」。"
            "四道刻间距不等，是这版最耐看的地方。",
            "焦点用「光点 + 两圈涟漪」表达，<b>没有指针</b>。App 的星盘本来就没有指针；"
            "而且指针从中心指到 12 点时会和 0° 那道刻连成一条竖线，整枚读着像瞄准镜。",
            "元素最多、信息量最大，也最依赖尺寸 —— 这是它的代价。",
        ],
        small="48px 下环与刻开始糊，但「圆 + 光心」的骨架还在；96px 以上完全清晰。",
        fit="想让图标和 App 内部长得一模一样。",
    ),
    dict(
        key="yi", ord="乙", name="岁字", tag="最稳、最像历书",
        sub="延续格物「字即标」的做法，但反色",
        lede="格物是浅米底棕「格」字，岁时是深墨底金「岁」字 —— 一眼看得出是一家，又不会认错。",
        points=[
            "华文中宋「岁」，与格物<b>同一个字体、同一套工艺</b>：按像素边界定位墨迹，"
            "不依赖字体度量，所以换字号、换尺寸时字的位置不会漂。",
            "细环给出「盘」的暗示，让它与另外三版同源，不至于变成孤零零一个汉字。",
            "是四版里<b>唯一靠实心填充</b>的（其余三版都靠线条）—— 这正是它小尺寸最稳的原因。",
        ],
        small="48px 下字形结构完整可辨，四版最佳。",
        fit="最看重「一眼认出 + 桌面可读」。",
    ),
    dict(
        key="bing", ord="丙", name="晷影", tag="最克制",
        sub="日晷去掉一切多余，只剩盘、针、心",
        lede="三笔，没有第四笔。",
        points=[
            "粗环 + 一根针 + 一个光心。针从轴心发出、心点压在起点上 —— 标准钟表的读法；"
            "若让针从心点边缘起，两者会糊成一根棒棒糖。",
            "四版里最「现代 App」的一版，也最不依赖文化符号 —— 不认识「岁时」两个字的人"
            "也能读成「时间」。",
            "环宽 0.032 倍画布是刻意的：再粗显笨重，再细小尺寸就丢。",
        ],
        small="48px 下可辨，四版里第二稳。",
        fit="想要克制、现代、不啰嗦。",
    ),
    dict(
        key="ding", ord="丁", name="时环", tag="最疏朗",
        sub="十二颗星绕一圈，从亮到隐",
        lede="一年走过，光渐弱。",
        points=[
            "12 颗实心星点，从 12 点最亮、顺时针渐隐 —— 与 App 里星盘外环的「时间光带」"
            "是<b>同一套语言</b>。",
            "一开始做的是「环切 60 段细密弧」，大图上有光带感，但 48px 下整圈糊成一根灰环。"
            "<b>细长条在小尺寸上必然丢失</b>，换成实心点之后活了 —— 语言没变，存活率完全不同。",
            "留白最多，夜色感最强，也是四版里最「不着急」的一版。",
        ],
        small="48px 下能数出是「一圈点，有的亮有的暗」。",
        fit="想要疏朗、有夜色感。",
    ),
]

ROWS = [
    ("主元素", "外环 · 四刻 · 涟漪 · 光心", "华文中宋「岁」· 细环", "粗环 · 针 · 光心", "十二星点 · 光心"),
    ("笔数", "最多（6 类）", "1 类 + 1 辅助", "3 笔", "1 类 + 1 辅助"),
    ("48px 可辨", "骨架可辨", "完整可辨&nbsp;★", "可辨", "点阵可辨"),
    ("与格物的关系", "无", "同字体同工艺，反色&nbsp;★", "无", "无"),
    ("与 App 内的关系", "同构&nbsp;★", "呼应（细环）", "简化", "同语言（光带）&nbsp;★"),
    ("气质", "精确 · 工具感", "有文化重量", "现代 · 克制", "诗意 · 疏朗"),
]


# ---------------------------------------------------------------- 页面
CSS = """
:root{
  --paper:#F4F0E7; --card:#FBF8F2; --ink:#2B2620; --ink2:#5C5347; --ink3:#8B8071;
  --line:#E3DACA; --line2:#D6C9B4; --brown:#8C5A34; --brown2:#A9764A; --gold:#C9985C;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--paper); color:var(--ink);
  font-family:"Songti SC","SimSun",Georgia,"Noto Serif SC",serif;
  font-size:17px; line-height:2.0; letter-spacing:.01em;
}
.wrap{max-width:860px;margin:0 auto;padding:0 28px 96px}
.kicker{
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
  font-size:12.5px;letter-spacing:.34em;color:var(--brown);margin:0 0 14px;
  text-transform:uppercase;
}
h1{font-size:42px;line-height:1.35;margin:0 0 18px;letter-spacing:.04em}
h2{font-size:25px;margin:0;letter-spacing:.06em}
h3{
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
  font-size:12.5px;letter-spacing:.2em;color:var(--brown);margin:26px 0 10px;font-weight:600;
}
p{margin:0 0 16px}
.lede{font-size:18.5px;color:var(--ink2);line-height:2.05}
header{padding:64px 0 8px;border-bottom:1px solid var(--line);margin-bottom:40px}
header .lede{max-width:660px}

/* 现状 */
.now{
  display:flex;gap:26px;align-items:center;background:var(--card);
  border:1px solid var(--line);border-radius:5px;padding:22px 26px;margin:0 0 52px;
}
.now img{width:92px;height:92px;border-radius:20.6px;flex:0 0 auto;
  box-shadow:0 2px 10px rgba(60,45,25,.14)}
.now h3{margin:0 0 6px}
.now p{margin:0;font-size:15.5px;color:var(--ink2);line-height:1.85}
.mono{font-family:Consolas,"SF Mono",Menlo,monospace;font-size:13.5px;
  background:#EFE9DC;border:1px solid var(--line2);border-radius:3px;padding:1px 5px}

/* 方案卡 */
.plan{
  background:var(--card);border:1px solid var(--line);border-radius:5px;
  padding:30px 32px 34px;margin:0 0 30px;
}
.plan-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;
  border-bottom:1px solid var(--line);padding-bottom:16px}
.ord{
  font-size:26px;color:var(--brown);line-height:1;
  font-family:"Songti SC","SimSun",serif;
}
.plan-head .sub{
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
  font-size:13.5px;color:var(--ink3);margin:0;
}
.tag{
  margin-left:auto;font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
  font-size:11.5px;letter-spacing:.08em;color:var(--brown);
  border:1px solid var(--brown2);border-radius:100px;padding:3px 11px;line-height:1.5;
}
.plan-body{display:grid;grid-template-columns:236px 1fr;gap:34px;margin-top:24px}
.shots{display:flex;flex-direction:column;gap:16px}
.hero{width:100%;display:block}
.masks{display:flex;gap:14px;align-items:flex-end}
.masks img{width:74px;height:74px;display:block}
.sizes{display:flex;gap:16px;align-items:flex-end;padding-top:2px}
.sizes img{display:block;image-rendering:auto}
.sizes .cap{
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
  font-size:10.5px;color:var(--ink3);text-align:center;margin-top:5px;line-height:1.4;
}
.sz{display:flex;flex-direction:column}
.plan ul{margin:12px 0 0;padding:0 0 0 20px}
.plan li{margin-bottom:11px;font-size:16px;line-height:1.95}
.plan li b{color:var(--brown);font-weight:600}
.verdict{
  margin-top:22px;padding:14px 18px;background:#F2EDE1;
  border-left:3px solid var(--gold);border-radius:0 4px 4px 0;
  font-size:15.5px;line-height:1.9;color:var(--ink2);
}
.verdict b{color:var(--ink)}

/* 壁纸 */
.wallpapers{display:flex;gap:12px;margin-top:20px}
.wp{
  flex:1;border-radius:5px;padding:16px 12px 12px;display:flex;gap:12px;align-items:center;
  justify-content:center;border:1px solid var(--line2);
}
.wp.dark{background:#0E0D0A;border-color:#0E0D0A}
.wp.light{background:#EAE4D8}
.wp img{width:46px;height:46px;border-radius:10.3px;display:block}
.wp .lbl{
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
  font-size:10.5px;letter-spacing:.1em;
}
.wp.dark .lbl{color:#6E6555}
.wp.light .lbl{color:#9A9082}
.wp .col{display:flex;flex-direction:column;gap:6px}

/* 表 */
table{width:100%;border-collapse:collapse;font-size:15px;margin-top:8px}
th,td{padding:12px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;
  line-height:1.8}
th{font-weight:600;color:var(--brown);font-size:13px;letter-spacing:.06em;
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
td:first-child{color:var(--ink3);font-size:14px;white-space:nowrap}
td .star{color:var(--gold)}

/* 落地 */
ol.steps{padding-left:22px;margin:10px 0 0}
ol.steps li{margin-bottom:14px;font-size:16px;line-height:1.95}
.warn{
  background:#FBF3E4;border:1px solid #E7D5B4;border-radius:5px;
  padding:18px 22px;margin:24px 0 0;font-size:15.5px;line-height:1.9;
}
.warn h3{margin-top:0;color:#8A5A1E}

/* 我的建议 */
.pick{
  background:#F1EADC;border:1px solid var(--line2);border-left:4px solid var(--brown);
  border-radius:0 5px 5px 0;padding:24px 28px;margin:34px 0 0;
}
.pick h2{margin:0 0 6px;font-size:23px}
.pick .whom{
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
  font-size:13px;letter-spacing:.16em;color:var(--brown);margin:0 0 14px;
}
.pick ol{margin:0;padding-left:22px}
.pick li{margin-bottom:12px;font-size:16px;line-height:1.95}
.pick li b{color:var(--brown)}
.pick .alt{
  margin:20px 0 0;padding-top:16px;border-top:1px dashed var(--line2);
  font-size:15.5px;color:var(--ink2);line-height:1.9;
}
.foot{margin-top:64px;padding-top:22px;border-top:1px solid var(--line);
  font-size:14px;color:var(--ink3);line-height:1.9;
  font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
@media (max-width:720px){
  .plan-body{grid-template-columns:1fr;gap:22px}
  .shots{flex-direction:row;align-items:flex-start;flex-wrap:wrap;gap:20px}
  .hero{width:170px}
  h1{font-size:32px}
  header{padding-top:40px}
  .wrap{padding:0 18px 64px}
  .now{flex-direction:column;text-align:center;gap:14px}
  .wallpapers{flex-direction:column}
}
"""


def build_html():
    def plan_html(p):
        pts = "\n".join("<li>%s</li>" % t for t in p["points"])
        sizes = "".join(
            '<div class="sz"><img src="%s" width="%d" height="%d">'
            '<div class="cap">%dpx</div></div>' % (real(p["key"], px), px, px, px)
            for px in (48, 72, 96))
        return f"""
<article class="plan">
  <div class="plan-head">
    <span class="ord">{p['ord']}</span>
    <h2>{p['name']}</h2>
    <p class="sub">{p['sub']}</p>
    <span class="tag">{p['tag']}</span>
  </div>
  <div class="plan-body">
    <div class="shots">
      <img class="hero" src="{hero(p['key'])}" alt="{p['ord']} {p['name']}">
      <div class="masks">
        <img src="{squarish(p['key'], 'round', 90)}" alt="圆形遮罩">
        <img src="{squarish(p['key'], 'square', 90)}" alt="圆角方形遮罩">
      </div>
      <div class="sizes">{sizes}</div>
    </div>
    <div class="spec">
      <p class="lede" style="font-size:17px;margin-bottom:4px">{p['lede']}</p>
      <h3>设计要点</h3>
      <ul>{pts}</ul>
      <div class="verdict"><b>小尺寸：</b>{p['small']}<br><b>适合：</b>{p['fit']}</div>
    </div>
  </div>
  <div class="wallpapers">
    <div class="wp light"><div class="col"><img src="{squarish(p['key'], 'square', 92)}"></div>
      <span class="lbl">浅色壁纸</span></div>
    <div class="wp dark"><div class="col"><img src="{squarish(p['key'], 'square', 92)}"></div>
      <span class="lbl">深色壁纸</span></div>
  </div>
</article>"""

    body = "\n".join(plan_html(p) for p in PLANS)

    rows = "\n".join(
        "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % r
        for r in ROWS)

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>岁时 · App 图标方案</title>
<style>{CSS}</style>
</head>
<body>
<div class="wrap">

<header>
  <p class="kicker">岁时 · 图标</p>
  <h1>四版方案</h1>
  <p class="lede">这四版都是<b>可落地的真素材</b>，不是示意图 —— 图由生成脚本现算，
  直接就是 <code class="mono">assets/images/</code> 里那五个文件的尺寸与格式。
  选定一版，当天就能装到手机上。</p>
</header>

<div class="now">
  <img src="{gewu_icon()}" alt="当前图标">
  <div>
    <h3>现状：这其实是格物的图标</h3>
    <p>岁时 <code class="mono">assets/images/</code> 下的六个文件，与格物项目的
    <b>字节数一一相同</b>（9414 / 35062 / 17552 / 2683 / 51451 / 41892）——
    建项目时原样拷过来的，所以桌面上显示的是一枚米白底的「格」字。</p>
  </div>
</div>

{body}

<h2 style="margin-top:56px">横向对比</h2>
<table>
  <thead><tr><th>维度</th><th>甲 圆相</th><th>乙 岁字</th><th>丙 晷影</th><th>丁 时环</th></tr></thead>
  <tbody>{rows}</tbody>
</table>

<div class="pick">
  <p class="whom">如果让我选</p>
  <h2>乙 · 岁字</h2>
  <ol>
    <li>图标的第一职责是<b>在四五十像素的桌面上被认出来</b>。乙是四版里唯一靠实心填充的，
      48px 下字形结构完整 —— 其余三版在那一档都开始靠「骨架」撑着。</li>
    <li>它和格物是<b>一套东西</b>：同一个字体（华文中宋）、同一套定位工艺、
      同一个「字即标」的逻辑，只是反了色。两个 App 并排放在桌面上，像同一个作者的作品 ——
      这是一眼就能拿到的品牌资产，不用额外解释。</li>
    <li>另外三版更像是「界面元素的延伸」，乙更像是「一个名字」。</li>
  </ol>
  <p class="alt">如果你更看重<b>「图标和 App 内部长得一模一样」</b>，那就选甲 · 圆相 ——
  它是唯一把星盘直接搬上去的一版，代价是小尺寸下环与刻开始糊。</p>
</div>

<h2 style="margin-top:56px">选定之后要做的五件事</h2>
<ol class="steps">
  <li>把选中的那版<b>五个文件</b>写进 <code class="mono">assets/images/</code>：
    <code class="mono">icon.png</code>、<code class="mono">android-icon-foreground.png</code>、
    <code class="mono">android-icon-monochrome.png</code>、<code class="mono">splash-icon.png</code>、
    <code class="mono">favicon.png</code>。主图标是满幅方形、<b>不烤圆角</b>，圆角交给系统裁。</li>
  <li>改 <code class="mono">app.json</code> 里
    <code class="mono">android.adaptiveIcon.backgroundColor</code>：
    现在的 <code class="mono">#242118</code> 比图标底色亮一档，自适应图标外围会浮出一圈偏灰的底。
    改成 <code class="mono">#16140F</code>，与图标底色一致。</li>
  <li>同步改 <code class="mono">android/app/src/main/res/values/colors.xml</code> 的
    <code class="mono">iconBackground</code> —— 这两处必须一致，否则真机底色和预览不符。</li>
  <li>重生成原生资源：<code class="mono">android/app/src/main/res/mipmap-*/</code> 下的
    <code class="mono">ic_launcher*.webp</code> 是 prebuild 的产物，<b>不会随 assets 自动更新</b>。
    只跑图标同步脚本，不动 android/ 下其它内容。</li>
  <li>重装 APK（<code class="mono">versionCode</code> +1）。启动器有图标缓存，
    热更新改不动它 —— 必须重装才生效。</li>
</ol>

<div class="warn">
  <h3>两个要知道的取舍</h3>
  <p><b>深色壁纸上是会「融」进去的。</b>四版都是墨底，在深色壁纸上只剩暖金部分可见 ——
  这是深色图标的固有代价，也是方案 B（墨底暖金、深色优先）的取向。上面每版都放了
  深浅两种壁纸的对照，可以在选定前先看一眼自己能不能接受。</p>
  <p><b>单色（主题图标）那一层单独画过。</b>安卓 13+ 的「主题图标」会把图标染成壁纸色，
  用的是 <code class="mono">monochrome</code> 那层。它不能直接用彩色版去色 ——
  内盘那样的实心大块在单色下会糊成一团。所以四版的单色层都是重新排过的，
  只留标记本身。</p>
  <p><b>图标不跟随主题。</b>App 里有四套主题（玄夜／苍青／墨玉／素笺），但图标只有一套 ——
  固定用默认主题「玄夜」的墨底。图标是品牌，不是界面：它会出现在别人的截图里、
  应用商店里、和你手机桌面的壁纸上，这些场合都不知道你选了哪套主题。</p>
</div>

<div class="foot">
  生成脚本 <code class="mono">scripts/suishi-icons.py</code>（素材）+
  <code class="mono">scripts/icon-plan-page.py</code>（本页）<br>
  字体 华文中宋 STZhongsong · 工艺沿用格物 <code class="mono">build-icons.py</code>：
  4× 超采样 + 按像素边界定位墨迹<br>
  分至点刻的角度由 <code class="mono">nextSolarTerms()</code> 实算，非四等分
</div>

</div>
</body>
</html>
"""


def main():
    if not os.path.isfile(si.FONT_PATH):
        print("找不到字体：" + si.FONT_PATH)
        return 1
    html = build_html()
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print("输出 → %s  (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
