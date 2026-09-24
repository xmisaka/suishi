# -*- coding: utf-8 -*-
"""
岁时 · App 图标生成器 —— 四版方案

工艺沿用「格物」的 scripts/build-icons.py：华文中宋 + 4× 超采样 +
按像素边界定位墨迹（不依赖字体度量，避免不同字号下位置漂移）。
配色与图形按「天象」方案重配：墨底暖金。

四版：
    jia   圆相   把 App 里的星盘直接搬上桌面（外环 + 分至点刻 + 指针 + 焦点）
    yi    岁字   延续格物「字即标」的家族感，但反色（浅底棕字 → 墨底金字）
                 ★ 2026-09-23：去掉原先那道细环，并把字收小一档
                   （cap 0.300 → 0.220，字高占可见圆直径 66.6% → 48.8%）
    bing  晷影   日晷去掉一切多余：盘、针、心
    ding  时环   环以细密弧段渐隐 —— 一年走过、光渐弱

★ 两条必须遵守的实现约束（踩过坑，别改回去）：

  1. **颜色一律先预混合成不透明色再画。**
     PIL 的 ImageDraw 在 RGBA 上是**替换像素**而不是 alpha 混合。直接画半透明色
     会挖穿下层：实测一圈 alpha 0.06 的辉光把整条指针抹掉了，而它只是"背景光"。
     所以用 over(bg, fg, a) 把颜色算成不透明的等价色，全程 opaque 绘制 ——
     画布底色是已知的（BED），预混合的结果与设计值完全一致，
     而且前景层里 opaque 的像素直接盖住底色，安卓合成后不会偏色。

  2. **不画内盘。**
     内盘（比底色亮一档的实心圆）在深色壁纸上看不出边界、在浅色壁纸上被
     圆形遮罩裁成一个黑洞，小尺寸下更是一团灰把标记糊住。标记直接落在墨底上，
     与乙版的构成统一，也与 App 里星盘的构成一致（墨底 + 暖金刻度）。

产出的五个文件（与格物一致）：
    icon.png                     1024  主图标（满幅方形，不烤圆角）
    android-icon-foreground.png  1024  自适应前景（透明底）
    android-icon-monochrome.png  1024  自适应单色（透明底、纯黑，供主题图标染色）
    splash-icon.png              1024  启动图（透明底，底色由 app.json 提供）
    favicon.png                    64  web 图标（简化：撤掉细装饰）

额外产出（只给方案页看，不进 App）：
    icon@48 / @72 / @96 / @144       各档真实像素，用来判断小尺寸存活性
    composed/{key}-{round,square}@192  前景 + 底色 + 真机遮罩的合成效果

用法：
    python scripts/suishi-icons.py                  # → .workbuddy/tmp/icons/
    python scripts/suishi-icons.py --out <目录>
"""

import argparse
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_PATH = r"C:\Windows\Fonts\STZHONGS.TTF"
GLYPH = "岁"

BASE = 1024
SS = 4                      # 超采样倍数：细线与圆角靠它保平滑

# ---------------------------------------------------------------- 色（玄夜档）
BED = (22, 20, 15)          # #16140F  paper，与 App 主背景一致
GOLD = (201, 152, 92)       # #C9985C  brand
GOLD_LIT = (224, 180, 124)  # #E0B47C  brandDeep

PLAN_BG = "#16140F"

# 标记的外接圆半径的**安全上限**（占画布的比）。
# 自适应图标的规格：画布 108dp，**遮罩只显示中央 72dp**（66.7%，半径 0.333），
# 外围 18dp 是视差动画的余量、永远不显示。所以标记必须收在 0.328 以内。
#
# ★ 这是「不许越过」的约束，不是「应该撑到」的目标 ——
#   四版标记目前都刻意收在它以内留出呼吸感（乙版 0.2184）。
#   2026-09-23 之前乙版的 mono 档曾用它当字号上限，现已与色版统一到
#   `yi_ink_max`，这个常量只作为规格依据留在代码里。
R_LIMIT = 0.328

# 四道分至点刻的角度 —— 不是 0/90/180/270。这是 App 内
# nextSolarTerms() 在 2026-09-23 实算出来的：公转不均匀，
# 固定 90° 分画的其实只是「今天 + 90n 天」。
SOLAR_TICKS = [0.0, 88.5, 176.1, 266.6]

# 各版元素半径（占画布比）。1.0 = 整个画布。
G = {
    # 甲 · 圆相
    "jia_ring": 0.288, "jia_ring_w": 0.024,
    "jia_tick": 0.028, "jia_tick_w": 0.022,
    "jia_ripple": (0.170, 0.108), "jia_ripple_w": 0.008,
    "jia_core": 0.052,
    # 乙 · 岁字（2026-09-23：细环已去掉、字收小一档，见 mark_yi 的说明）
    #   原先还有 `yi_ring` 0.316 / `yi_ring_w` 0.011 那道金 28% 的细环 ——
    #   它是整个标记的最外沿（外接 0.3233），比字本身还大一圈，已删除。
    #   0.220 是**墨迹外接半径**的反推值，换算关系（实测）：
    #       墨迹外接 r = cap × 0.9928 ≈ 0.2184 画布
    #       字高      = cap ÷ 0.6762 ≈ 0.3253 画布
    #       占可见圆直径（72/108 = 0.6667）的 48.8%
    "yi_ink_max": 0.220,
    # 丙 · 晷影
    "bing_ring": 0.286, "bing_ring_w": 0.032,
    "bing_hand": 0.240, "bing_hand_w": 0.032, "bing_core": 0.050,
    # 丁 · 时环
    "ding_ring": 0.280, "ding_dot": 0.030, "ding_core": 0.048,
}


# ---------------------------------------------------------------- 色 · 预混合
def over(bg, fg, a):
    """把 fg 按 a 叠在 bg 上，返回等价的不透明色（见文件头约束 1）"""
    a = max(0.0, min(1.0, a))
    return tuple(round(bg[i] + (fg[i] - bg[i]) * a) for i in range(3))


def gold(a, bg=BED, lit=False):
    return over(bg, GOLD_LIT if lit else GOLD, a)


# ---------------------------------------------------------------- 字形
def load_ink(ch=GLYPH, ref=600):
    """渲染单字并裁出真实墨迹（按像素边界定位，不依赖字体度量）"""
    font = ImageFont.truetype(FONT_PATH, ref)
    cv = Image.new("L", (ref * 4, ref * 4), 0)
    ImageDraw.Draw(cv).text((ref * 2, ref * 2), ch, font=font, fill=255, anchor="mm")
    bb = cv.getbbox()
    if bb is None:
        raise RuntimeError("字形渲染为空：检查字体文件是否可用")
    return cv.crop(bb)


INK = load_ink()
INK_AR = INK.width / INK.height


def fit_ink_h(max_r):
    """给定外接圆半径上限，反推允许的墨迹高度。

    字的墨迹不是正方形，外接圆半径 = ½·h·√(宽高比² + 1)，
    只按高度卡会在对角上撞到圆环（实测「岁」宽高比 0.911）。
    """
    return 2 * max_r / math.sqrt(INK_AR ** 2 + 1)


# ---------------------------------------------------------------- 绘制工具
def pt(cx, cy, r, deg):
    """deg：0 = 12 点方向，顺时针增加（钟面直觉）"""
    a = math.radians(deg - 90)
    return (cx + r * math.cos(a), cy + r * math.sin(a))


def ring(d, cx, cy, r, w, fill):
    """圆环：中心线落在 r 上"""
    w = max(1, round(w))
    d.ellipse([cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2],
              outline=fill, width=w)


def dot(d, cx, cy, r, fill):
    r = max(0.5, r)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def spoke(d, cx, cy, deg, r0, r1, w, fill):
    """径向线段，圆头"""
    x0, y0 = pt(cx, cy, r0, deg)
    x1, y1 = pt(cx, cy, r1, deg)
    w = max(1, round(w))
    d.line([x0, y0, x1, y1], fill=fill, width=w)
    dot(d, x0, y0, w / 2, fill)
    dot(d, x1, y1, w / 2, fill)


def arc(d, cx, cy, r, w, a0, a1, fill):
    """钟面角度的弧（PIL 原生是 0 = 3 点方向）"""
    w = max(1, round(w))
    d.arc([cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2],
          a0 - 90, a1 - 90, fill=fill, width=w)


def focal(d, cx, cy, S, core, halos):
    """焦点光心：辉光由外向内叠 + 实心星（全用预混合色，直接画即可）"""
    for hr, ha in halos:
        dot(d, cx, cy, hr * S, gold(ha, lit=True))
    dot(d, cx, cy, core * S, GOLD_LIT)


# ---------------------------------------------------------------- 四版
def mark_jia(S, mono=False, detail=True):
    """圆相：外环 + 四道分至点刻 + 焦点涟漪 + 光心。

    没有指针。App 的星盘本来就没有指针 —— 焦点是用「光点 + 几圈涟漪」
    表达的；而且指针从中心指到 12 点，会和 0° 那道刻连成一条竖线，
    整枚读着像瞄准镜。
    """
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = S / 2
    c = (0, 0, 0) if mono else gold(0.80)
    ring(d, cx, cy, G["jia_ring"] * S, G["jia_ring_w"] * S, c)
    r_out = G["jia_ring"] * S
    half, tw = G["jia_tick"] * S, G["jia_tick_w"] * S
    for deg in SOLAR_TICKS:
        spoke(d, cx, cy, deg, r_out - half, r_out + half, tw,
              (0, 0, 0) if mono else gold(0.95))
    if detail:
        for i, rr in enumerate(G["jia_ripple"]):
            ring(d, cx, cy, rr * S, G["jia_ripple_w"] * S * (1.0 - 0.2 * i),
                 (0, 0, 0) if mono else gold(0.30 - 0.10 * i))
    focal(d, cx, cy, S, G["jia_core"] if detail else 0.075,
          ((0.115, 0.13), (0.185, 0.055)) if detail else ((0.135, 0.16),))
    return img


def mark_yi(S, mono=False, detail=True):
    """岁字：华文中宋「岁」，一笔不加。

    2026-09-23 两处改动，都是同一个起因 —— 用户看着桌面上的图标说
    「字可以像格物那样，稍微小一点」。

    一、**去掉了细环**（原 `yi_ring` 0.316 / 线宽 0.011 / 金 28%）。
        它不是刻度、不是边界，只是一道装饰；而它偏偏是整个标记的最外沿
        （外接 0.3233），比字本身还大一圈，等于把标记的体量让给了一根发丝线。
        去掉后最外沿改由「夕」的长撇尖构成，「框」让位给「字」。

    二、**字收小一档**：cap 0.300 → 0.220（字高占可见圆直径 66.6% → 48.8%）。
        格物那枚图标是标尺：它的自适应层字高只占可见圆的 39.8%
        （legacy 层 64.0%，格物自己两层就不一致）。但金色细笔画在墨底上
        比格物的棕字在浅底上更吃尺寸 —— 照搬 40% 会显得单薄，
        所以取了 48.8% 这一档，与格物的呼吸感接近而分量不减。

    ★ 顺带修掉一处既存不一致：`mono` 档原先单独把 cap 提到 R_LIMIT(0.328)，
      而色版停在 0.300，于是主题图标里的字比普通图标**大 9%**。
      现在色版与单色版共用一个 cap，两个图层逐像素同形。

    `detail` 如今对本版没有作用（环已去掉，字号也不再按尺寸分档）；
    保留该参数只是为了与 `MARKS` 里其余三版保持同一个签名。
    """
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cx = cy = S / 2
    cap = G["yi_ink_max"] * S
    h = min(fit_ink_h(cap), 0.78 * S)
    w = h * INK_AR
    mask = INK.resize((max(1, round(w)), max(1, round(h))), Image.LANCZOS)
    solid = Image.new("RGBA", (mask.width, mask.height),
                      (0, 0, 0, 255) if mono else GOLD_LIT + (255,))
    img.paste(solid, (round(cx - w / 2), round(cy - h / 2)), mask)
    return img


def mark_bing(S, mono=False, detail=True):
    """晷影：一环、一针、一心。三笔，没有第四笔"""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = S / 2
    ring(d, cx, cy, G["bing_ring"] * S, G["bing_ring_w"] * S,
         (0, 0, 0) if mono else gold(0.72))
    # 针从轴心发出，心点压在起点上 —— 标准钟表的读法；
    # 若让针从心点边缘起，两者会糊成一根棒棒糖
    spoke(d, cx, cy, 30, 0, G["bing_hand"] * S,
          G["bing_hand_w"] * S, (0, 0, 0) if mono else GOLD_LIT)
    focal(d, cx, cy, S, G["bing_core"] if detail else 0.078,
          ((0.135, 0.14),) if detail else ())
    return img


def mark_ding(S, mono=False, detail=True):
    """时环：十二颗星绕一圈，从亮到隐 —— 一年走过，光渐弱。

    早先做的是「环切成 60 段细密弧」，大图上有光带感，但 48px 下整圈
    糊成一根灰环 —— 细长条在小尺寸上必然丢失（`_small.png` 里一眼可见）。
    换成实心星点：语言没变，48px 下仍能读出「一圈点，有的亮有的暗」。
    """
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = S / 2
    n = 12 if detail else 8
    r = G["ding_ring"] * S
    for i in range(n):
        deg = i * 360.0 / n
        t = i / (n - 1)
        fade = 1.0 - 0.60 * t
        col = (0, 0, 0) if mono else over(BED, GOLD_LIT if t < 0.5 else GOLD, fade)
        x, y = pt(cx, cy, r, deg)
        dot(d, x, y, G["ding_dot"] * S, col)
    focal(d, cx, cy, S, G["ding_core"] if detail else 0.060,
          ((0.125, 0.12),) if detail else ())
    return img


MARKS = {"jia": mark_jia, "yi": mark_yi, "bing": mark_bing, "ding": mark_ding}


# ---------------------------------------------------------------- 合成
def render(key, size, mono=False, detail=True, ss=SS):
    """按目标像素出图（内部超采样，最后降采样）"""
    if size <= 64:
        detail = False
    S = size * ss
    return MARKS[key](S, mono=mono, detail=detail).resize((size, size), Image.LANCZOS)


def on_bed(mark, size, bg=BED):
    out = Image.new("RGBA", (size, size), tuple(bg) + (255,))
    return Image.alpha_composite(out, mark)


def _mask_circle(size):
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
    return m.resize((size, size), Image.LANCZOS)


def _mask_squircle(size, p=0.2246):
    s = size * 4
    m = Image.new("L", (s, s), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, s - 1, s - 1], radius=round(s * p), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def masked(img, shape):
    """真机遮罩模拟。

    自适应图标的实际规格：画布 108dp，**遮罩只显示中央 72dp**（72/108 = 66.7%），
    外围 18dp 是视差动画的余量、永远不出现在屏幕上。
    所以模拟的正确做法是：crop 中央 66.7% → 放大到满幅 → 套遮罩。

    （早先写成「把整幅缩到 66.7% 再贴回透明画布」是错的：贴回的边缘保留了
     Image.new 的默认色值 0，再被 putalpha 覆盖掉透明度，于是看起来像
    图标外面套了一个黑方框 —— 而那不是真机会出现的东西。）
    """
    size = img.size[0]
    inner = max(1, round(size * 72 / 108))
    off = (size - inner) // 2
    vis = img.crop((off, off, off + inner, off + inner)).resize((size, size), Image.LANCZOS)
    vis.putalpha(_mask_circle(size) if shape == "round" else _mask_squircle(size))
    return vis


# ---------------------------------------------------------------- 主流程
def build(out_root):
    os.makedirs(out_root, exist_ok=True)
    meta = {"glyph": GLYPH, "font": os.path.basename(FONT_PATH), "bed": PLAN_BG,
            "inkAR": round(INK_AR, 4), "solarTicks": SOLAR_TICKS, "plans": {}}

    for key in MARKS:
        d = os.path.join(out_root, key)
        os.makedirs(d, exist_ok=True)

        # 主图标：满幅方形，不烤圆角（交给系统裁）
        on_bed(render(key, BASE), BASE).convert("RGB").save(os.path.join(d, "icon.png"))

        # 自适应前景 / 单色
        render(key, BASE).save(os.path.join(d, "android-icon-foreground.png"))
        render(key, BASE, mono=True).save(os.path.join(d, "android-icon-monochrome.png"))

        # 启动图：底色由 app.json 提供（#16140F），这里只出标记
        render(key, BASE).save(os.path.join(d, "splash-icon.png"))

        # favicon：小尺寸，撤掉细装饰 + 22.46% 圆角
        fav = on_bed(render(key, 64), 64)
        fav.putalpha(_mask_squircle(64))
        fav.save(os.path.join(d, "favicon.png"))

        # 各档真实像素（判断小尺寸存活）
        for px in (48, 72, 96, 144):
            on_bed(render(key, px), px).save(os.path.join(d, "icon@%d.png" % px))

        meta["plans"][key] = {"icon": "../%s/icon.png" % key}
        print("  %-5s → %s" % (key, d))

    # 真机遮罩合成图
    comp = os.path.join(out_root, "composed")
    os.makedirs(comp, exist_ok=True)
    for key in MARKS:
        base = on_bed(render(key, BASE), BASE)
        for shape in ("round", "square"):
            masked(base, shape).resize((192, 192), Image.LANCZOS).save(
                os.path.join(comp, "%s-%s@192.png" % (key, shape)))

    with open(os.path.join(out_root, "plans.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("\n元数据 →", os.path.join(out_root, "plans.json"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, ".workbuddy", "tmp", "icons"))
    args = ap.parse_args()

    if not os.path.isfile(FONT_PATH):
        print("找不到字体：" + FONT_PATH)
        return 1
    print("字体 %s · 字形「%s」墨迹 %sx%s (宽高比 %.3f)"
          % (os.path.basename(FONT_PATH), GLYPH, INK.width, INK.height, INK_AR))
    print("输出 →", args.out, "\n")
    build(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
