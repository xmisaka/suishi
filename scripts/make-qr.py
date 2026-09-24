# -*- coding: utf-8 -*-
"""
格物 · 生成开发服务器扫码页

为什么需要它：
    本机 PowerShell 工具不渲染终端二维码，`expo start` 打印的 QR 看不到。
    这个脚本读本机局域网 IP，生成一张自包含 HTML（二维码内联 SVG），
    在电脑上打开后即可用手机 Expo Go 扫码。

用法：
    python scripts/make-qr.py                 # 自动探测 IP，端口 8081
    python scripts/make-qr.py --port 8082
    python scripts/make-qr.py --ip 192.168.1.7
    python scripts/make-qr.py --out D:\\scan.html

依赖：
    pip install qrcode
"""

from __future__ import annotations

import argparse
import io
import os
import re
import socket
import sys


def detect_lan_ip() -> str:
    """取默认路由所用网卡的 IPv4。不会真的发包。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()


def make_svg(url: str) -> str:
    import qrcode
    import qrcode.image.svg

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_Q,
        box_size=10,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    svg = buf.getvalue().decode("utf-8")

    # 内联用：剥掉 XML 声明与固定宽高，保留 viewBox 以便自适应缩放
    svg = re.sub(r"<\?xml[^>]*\?>", "", svg).strip()
    svg = re.sub(r'\swidth="[^"]*"', "", svg, count=1)
    svg = re.sub(r'\sheight="[^"]*"', "", svg, count=1)
    svg = svg.replace("<path ", '<path fill="#2B241F" ', 1)
    return svg


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>格物 · 扫码运行</title>
<style>
  :root {{
    --paper: #F7F4EF; --canvas: #FBF9F6; --brand: #8C5A34; --brand-bg: #F3E9DE;
    --ink: #2B241F; --ink2: #5C5248; --ink3: #8A7E72; --line: #E5DCD0;
  }}
  * {{ box-sizing: border-box; }}
  html, body {{
    margin: 0; padding: 0; background: var(--canvas); color: var(--ink);
    font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }}
  .wrap {{ max-width: 640px; margin: 0 auto; padding: 56px 24px 72px; }}
  .eyebrow {{
    font-size: 12px; letter-spacing: .22em; text-transform: uppercase;
    color: var(--brand); font-weight: 600; margin-bottom: 14px;
  }}
  h1 {{
    font-family: "Noto Serif SC", "Songti SC", Georgia, serif;
    font-size: 34px; font-weight: 600; margin: 0 0 10px; letter-spacing: .04em;
  }}
  .sub {{ color: var(--ink2); font-size: 15px; line-height: 1.9; margin: 0 0 36px; }}
  .card {{
    background: #fff; border: 1px solid var(--line); border-radius: 20px;
    padding: 32px; text-align: center;
    box-shadow: 0 12px 32px rgba(43,36,31,.07), 0 2px 6px rgba(43,36,31,.04);
  }}
  .qr {{ width: 100%; max-width: 268px; height: auto; display: block; margin: 0 auto; }}
  .urlbox {{
    margin-top: 24px; background: var(--paper); border: 1px solid var(--line);
    border-radius: 12px; padding: 14px 16px;
    font-family: ui-monospace, "SF Mono", Consolas, monospace;
    font-size: 15px; color: var(--ink); user-select: all;
  }}
  .hint {{ margin-top: 12px; font-size: 12.5px; color: var(--ink3); }}
  h2 {{
    font-family: "Noto Serif SC", "Songti SC", Georgia, serif;
    font-size: 17px; font-weight: 600; margin: 44px 0 16px; letter-spacing: .03em;
  }}
  ol {{ margin: 0; padding-left: 0; list-style: none; counter-reset: s; }}
  ol li {{
    position: relative; counter-increment: s; padding: 12px 0 12px 42px;
    border-bottom: 1px dashed var(--line); font-size: 14.5px; line-height: 1.75;
    color: var(--ink2);
  }}
  ol li:last-child {{ border-bottom: none; }}
  ol li::before {{
    content: counter(s); position: absolute; left: 0; top: 12px;
    width: 26px; height: 26px; border-radius: 50%; background: var(--brand-bg);
    color: var(--brand); font-size: 13px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }}
  code {{
    background: var(--paper); border: 1px solid var(--line); border-radius: 5px;
    padding: 1px 6px; font-family: ui-monospace, Consolas, monospace;
    font-size: 13px; color: var(--brand);
  }}
  .warn {{
    margin-top: 32px; background: #FCF6EC; border-left: 3px solid #B8802A;
    border-radius: 8px; padding: 14px 18px; font-size: 13.5px; line-height: 1.8;
    color: #7A5A20;
  }}
  .warn b {{ color: #6B4A12; }}
  footer {{
    margin-top: 48px; font-size: 12px; color: var(--ink3);
    text-align: center; letter-spacing: .06em;
  }}
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">格物 · Gewu</div>
  <h1>用手机扫码运行</h1>
  <p class="sub">手机装上 <b>Expo Go</b>，扫下方二维码，即可在局域网里直接打开「格物」。改代码自动热更新，不用重新打包。</p>

  <div class="card">
    {qr}
    <div class="urlbox">{url}</div>
    <div class="hint">扫码不通时，可在 Expo Go 里选「Enter URL manually」手动粘贴上面的地址</div>
  </div>

  <h2>操作步骤</h2>
  <ol>
    <li>手机应用商店搜索并安装 <code>Expo Go</code></li>
    <li>确认<b>手机与这台电脑连的是同一个 WiFi</b>（同网段）</li>
    <li>打开 Expo Go，点 <code>Scan QR code</code>，对着上面的二维码扫</li>
    <li>首次加载会编译打包，约 30–60 秒；之后改代码几乎秒级刷新</li>
  </ol>

  <div class="warn">
    <b>连不上怎么办？</b><br>
    先确认手机与电脑同网段（本机探测到的地址：<b>{ip}</b>）。<br>
    若公司或校园网做了客户端隔离（设备之间互相看不见），局域网方案会失败，
    改用隧道模式：停掉服务后执行 <code>npm start -- --tunnel</code>。
  </div>

  <footer>格物 V1 · 本地开发环境</footer>
</div>
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="生成格物开发服务器扫码页")
    ap.add_argument("--ip", default=None, help="局域网 IP，默认自动探测")
    ap.add_argument("--port", default="8081", help="Metro 端口，默认 8081")
    ap.add_argument("--out", default=None, help="输出 HTML 路径")
    args = ap.parse_args()

    try:
        import qrcode  # noqa: F401
    except ImportError:
        print("缺少依赖，请先执行:  pip install qrcode", file=sys.stderr)
        return 1

    ip = args.ip or detect_lan_ip()
    url = f"exp://{ip}:{args.port}"

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = args.out or os.path.join(os.path.dirname(root), "格物-扫码运行.html")

    html = HTML_TEMPLATE.format(qr=make_svg(url), url=url, ip=ip)
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"URL   {url}")
    print(f"OUT   {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
