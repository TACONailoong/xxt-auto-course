#!/usr/bin/env python3
"""生成插件 PNG 图标（Chrome 的 manifest 图标不支持 SVG）。

用法: python3 scripts/generate_icons.py
"""
import os

from PIL import Image, ImageDraw

SIZES = [16, 48, 128]
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

# 与弹窗 UI 一致的青绿渐变
COLOR_TOP = (47, 155, 130)    # #2f9b82
COLOR_BOTTOM = (20, 86, 71)   # #145647


def make_icon(size: int) -> Image.Image:
    # 4 倍超采样，缩小后边缘平滑
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 垂直渐变背景
    gradient = Image.new("RGBA", (s, s))
    gdraw = ImageDraw.Draw(gradient)
    for y in range(s):
        t = y / max(s - 1, 1)
        color = tuple(
            round(COLOR_TOP[i] + (COLOR_BOTTOM[i] - COLOR_TOP[i]) * t) for i in range(3)
        )
        gdraw.line([(0, y), (s, y)], fill=color + (255,))

    # 圆角矩形蒙版
    mask = Image.new("L", (s, s), 0)
    mdraw = ImageDraw.Draw(mask)
    radius = round(s * 0.22)
    mdraw.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=255)
    img.paste(gradient, (0, 0), mask)

    # 白色播放三角形
    cx, cy = s / 2, s / 2
    r = s * 0.28
    triangle = [
        (cx - r * 0.7, cy - r),
        (cx - r * 0.7, cy + r),
        (cx + r * 1.1, cy),
    ]
    draw = ImageDraw.Draw(img)
    draw.polygon(triangle, fill=(255, 255, 255, 255))

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        make_icon(size).save(path, "PNG")
        print(f"generated {path}")


if __name__ == "__main__":
    main()
