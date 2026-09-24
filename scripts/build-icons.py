# -*- coding: utf-8 -*-
"""
格物 App 图标生成器 —— 「朱印」方案

设计基准取自 格物-图标方案.html（200px 画布）：
    底色 #8C5A34，反白 #F7F4EF 的「格」字（华文中宋 STZhongsong）
    内框  inset 16/200 = 8%    线宽 1.5/200    圆角 30/200    透明度 32%
    印章圆角 44/200 = 22%

产出（assets/images/）：
    icon.png                     1024  主图标（满幅方形，不烤圆角，交给系统裁）
    android-icon-foreground.png  1024  自适应前景（透明底，安全区内的「格」）
    android-icon-monochrome.png  1024  自适应单色（主题图标用，纯黑 + alpha）
    splash-icon.png              1024  启动图（圆角印章，四周透明）
    favicon.png                    64  web favicon（去掉内框，小尺寸更干净）

用法：
    python scripts/build-icons.py
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "images")

FONT_PATH = r"C:\Windows\Fonts\STZHONGS.TTF"
GLYPH = "格"

BRAND = (140, 90, 52)      # #8C5A34
PAPER = (247, 244, 239)    # #F7F4EF

BASE = 1024
SS = 4                     # 超采样倍数：细线与圆角靠它保平滑

# 各尺寸下「格」字墨迹高度占画布的比例
# 基准页里印章内是 63% 的 em，而「格」的墨迹约占 em 的 92%，故 0.63 × 0.92 ≈ 0.58
INK_SEAL = 0.580           # 印章内（有内框约束）
INK_ADAPTIVE = 0.500       # 自适应前景 / 单色（无内框，安全区内的观感）
INK_FAVICON = 0.620        # favicon（无内框且尺寸极小，字再大一点）

FRAME_INSET = 16 / 200
FRAME_WIDTH = 1.5 / 200
FRAME_RADIUS = 30 / 200
FRAME_ALPHA = 82           # 0.32 × 255
SEAL_RADIUS = 44 / 200


def load_ink(ch, ref_px=600):
    """渲染单字并裁出真实墨迹（不依赖字体度量，按像素边界定位）"""
    font = ImageFont.truetype(FONT_PATH, ref_px)
    canvas = Image.new("L", (ref_px * 4, ref_px * 4), 0)
    ImageDraw.Draw(canvas).text(
        (ref_px * 2, ref_px * 2), ch, font=font, fill=255, anchor="mm"
    )
    bbox = canvas.getbbox()
    if bbox is None:
        raise RuntimeError("字形渲染为空：检查字体文件是否可用")
    return canvas.crop(bbox)


INK = load_ink(GLYPH)


def ink_layer(canvas_px, ink_ratio, color, dy_ratio=0.0, ss=SS, supersample=None):
    """生成 canvas_px×ss 的 RGBA 图层：墨迹高 = canvas_px × ink_ratio × ss，居中"""
    s = ss if supersample is None else supersample
    C = canvas_px * s
    h = max(1, round(canvas_px * ink_ratio * s))
    w = max(1, round(INK.width * h / INK.height))
    mask = INK.resize((w, h), Image.LANCZOS)
    layer = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    solid = Image.new("RGBA", (w, h), tuple(color) + (255,))
    layer.paste(
        solid,
        ((C - w) // 2, (C - h) // 2 + round(canvas_px * dy_ratio * s)),
        mask,
    )
    return layer


def draw_frame(size_px, ss=SS):
    """按基准比例画内框（半透明，必须单独成层再合成，否则会挖穿底色）"""
    C = size_px * ss
    layer = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    inset = C * FRAME_INSET
    ImageDraw.Draw(layer).rounded_rectangle(
        [inset, inset, C - 1 - inset, C - 1 - inset],
        radius=C * FRAME_RADIUS,
        outline=PAPER + (FRAME_ALPHA,),
        width=max(1, round(C * FRAME_WIDTH)),
    )
    return layer


def make_seal(size_px, radius_ratio=SEAL_RADIUS, frame=True, ink_ratio=INK_SEAL, ss=SS):
    """朱印本体：圆角棕底 +（可选）内框 + 反白「格」，四周按需透明"""
    C = size_px * ss
    img = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle(
        [0, 0, C - 1, C - 1], radius=round(C * radius_ratio), fill=BRAND + (255,)
    )
    if frame:
        img = Image.alpha_composite(img, draw_frame(size_px, ss))
    img = Image.alpha_composite(img, ink_layer(size_px, ink_ratio, PAPER, ss=ss))
    return img.resize((size_px, size_px), Image.LANCZOS)


def make_flat_icon(size_px, ink_ratio, ss=SS):
    """满幅方形（不烤圆角）+ 内框 + 反白字 —— 主图标用"""
    C = size_px * ss
    img = Image.new("RGBA", (C, C), BRAND + (255,))
    img = Image.alpha_composite(img, draw_frame(size_px, ss))
    img = Image.alpha_composite(img, ink_layer(size_px, ink_ratio, PAPER, ss=ss))
    return img.resize((size_px, size_px), Image.LANCZOS)


def make_glyph_layer(size_px, ink_ratio, color, ss=SS):
    """透明底 + 单色字 —— 自适应前景与单色层共用"""
    return ink_layer(size_px, ink_ratio, color, ss=ss).resize(
        (size_px, size_px), Image.LANCZOS
    )


def save(img, name, opaque=False):
    path = os.path.join(OUT, name)
    if opaque:
        img = img.convert("RGB")
    img.save(path)
    print("  %-34s %sx%s  %.1fKB" % (name, img.width, img.height, os.path.getsize(path) / 1024))
    return path


def main():
    if not os.path.isdir(OUT):
        print("找不到输出目录：" + OUT)
        return 1
    if not os.path.isfile(FONT_PATH):
        print("找不到字体：" + FONT_PATH)
        return 1

    print("墨迹原始尺寸 %sx%s  (宽高比 %.3f)" % (INK.width, INK.height, INK.width / INK.height))
    print("输出 →", OUT)

    save(make_flat_icon(BASE, INK_SEAL), "icon.png", opaque=True)
    save(make_glyph_layer(BASE, INK_ADAPTIVE, PAPER), "android-icon-foreground.png")
    save(make_glyph_layer(BASE, INK_ADAPTIVE, (0, 0, 0)), "android-icon-monochrome.png")
    save(make_seal(BASE), "splash-icon.png")
    save(make_seal(64, frame=False, ink_ratio=INK_FAVICON), "favicon.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
