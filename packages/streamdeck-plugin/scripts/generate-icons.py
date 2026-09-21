#!/usr/bin/env python3
"""Generate Stream Deck action artwork for RØDE Control."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "com.felixgeelhaar.rode-control.sdPlugin"

# Visual system: charcoal stage + warm amber / teal accents (not purple/cream defaults)
BG = (14, 16, 18, 255)
PANEL = (26, 30, 34, 255)
AMBER = (245, 166, 35, 255)
TEAL = (61, 220, 151, 255)
CORAL = (255, 92, 92, 255)
ICE = (230, 236, 240, 255)
MUTED = (120, 132, 142, 255)


def canvas(size: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = max(2, size // 18)
    draw.rounded_rectangle(
        [pad, pad, size - pad - 1, size - pad - 1],
        radius=size // 5,
        fill=PANEL,
    )
    # subtle top sheen
    draw.ellipse(
        [size * 0.15, size * 0.08, size * 0.85, size * 0.42],
        fill=(255, 255, 255, 18),
    )
    return img, draw


def save(img: Image.Image, relative: str) -> None:
    path = ROOT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")


def dial_ring(draw: ImageDraw.ImageDraw, size: int, color: tuple[int, ...], progress: float = 0.72) -> None:
    m = size * 0.22
    bbox = [m, m, size - m, size - m]
    draw.arc(bbox, start=135, end=135 + int(270 * progress), fill=color, width=max(3, size // 12))
    draw.ellipse(
        [size * 0.42, size * 0.42, size * 0.58, size * 0.58],
        fill=color,
    )


def mic_body(draw: ImageDraw.ImageDraw, size: int, color: tuple[int, ...]) -> None:
    cx, cy = size // 2, size // 2 - size // 18
    w, h = size // 5, size // 3
    draw.rounded_rectangle(
        [cx - w, cy - h // 2, cx + w, cy + h // 2],
        radius=w,
        outline=color,
        width=max(2, size // 22),
    )
    for i in range(-2, 3):
        y = cy + i * (h // 7)
        draw.line([cx - w + 4, y, cx + w - 4, y], fill=(*color[:3], 140), width=1)
    stand_y = cy + h // 2
    draw.line([cx, stand_y, cx, stand_y + size // 10], fill=color, width=max(2, size // 28))
    draw.arc(
        [cx - size // 8, stand_y - size // 14, cx + size // 8, stand_y + size // 8],
        start=0,
        end=180,
        fill=color,
        width=max(2, size // 28),
    )


def wave(draw: ImageDraw.ImageDraw, size: int, color: tuple[int, ...], y: float = 0.62) -> None:
    pts = []
    for i in range(0, 21):
        x = size * (0.2 + 0.6 * i / 20)
        amp = size * 0.08 * math.sin(i * 0.9)
        pts.append((x, size * y + amp))
    if len(pts) > 1:
        draw.line(pts, fill=color, width=max(2, size // 24), joint="curve")


def icon_mic_gain(size: int) -> Image.Image:
    img, draw = canvas(size)
    dial_ring(draw, size, AMBER, 0.7)
    mic_body(draw, size, ICE)
    return img


def icon_mic_monitor(size: int) -> Image.Image:
    img, draw = canvas(size)
    # headphones
    cx, cy = size // 2, size // 2
    r = size // 3
    draw.arc([cx - r, cy - r, cx + r, cy + r // 3], start=200, end=340, fill=TEAL, width=max(3, size // 14))
    for dx in (-1, 1):
        draw.rounded_rectangle(
            [cx + dx * r - size // 14, cy - size // 18, cx + dx * r + size // 14, cy + size // 5],
            radius=size // 20,
            fill=TEAL,
        )
    return img


def icon_channel_level(size: int) -> Image.Image:
    img, draw = canvas(size)
    bars = [0.35, 0.7, 0.5, 0.85, 0.45]
    gap = size * 0.1
    bw = (size - gap * 2) / len(bars) * 0.55
    for i, h in enumerate(bars):
        x0 = gap + i * ((size - gap * 2) / len(bars)) + bw * 0.35
        y1 = size * 0.78
        y0 = y1 - size * 0.45 * h
        color = TEAL if i != 3 else AMBER
        draw.rounded_rectangle([x0, y0, x0 + bw, y1], radius=bw / 3, fill=color)
    return img


def icon_mute(size: int) -> Image.Image:
    img, draw = canvas(size)
    mic_body(draw, size, ICE)
    # slash
    draw.line(
        [size * 0.22, size * 0.78, size * 0.78, size * 0.22],
        fill=CORAL,
        width=max(3, size // 14),
    )
    return img


def icon_listen(size: int) -> Image.Image:
    img, draw = canvas(size)
    cx, cy = size // 2, size // 2
    for i, alpha in enumerate((255, 160, 80)):
        r = size * (0.18 + i * 0.12)
        draw.arc(
            [cx - r, cy - r, cx + r, cy + r],
            start=300,
            end=60,
            fill=(*TEAL[:3], alpha),
            width=max(2, size // 22),
        )
    draw.ellipse([cx - size // 16, cy - size // 16, cx + size // 16, cy + size // 16], fill=AMBER)
    return img


def icon_hpf(size: int) -> Image.Image:
    img, draw = canvas(size)
    # high-pass curve
    pts = []
    for i in range(0, 25):
        t = i / 24
        x = size * (0.18 + 0.64 * t)
        y = size * (0.72 - 0.42 * max(0, (t - 0.35) / 0.65))
        pts.append((x, y))
    draw.line(pts, fill=AMBER, width=max(3, size // 16), joint="curve")
    draw.line([size * 0.18, size * 0.72, size * 0.82, size * 0.72], fill=MUTED, width=1)
    return img


def icon_comp(size: int) -> Image.Image:
    img, draw = canvas(size)
    # compressor knee
    draw.line(
        [
            (size * 0.2, size * 0.75),
            (size * 0.45, size * 0.55),
            (size * 0.8, size * 0.42),
        ],
        fill=TEAL,
        width=max(3, size // 16),
        joint="curve",
    )
    draw.line(
        [(size * 0.2, size * 0.75), (size * 0.8, size * 0.28)],
        fill=MUTED,
        width=1,
    )
    return img


def icon_pad(size: int) -> Image.Image:
    img, draw = canvas(size)
    m = size * 0.28
    draw.rounded_rectangle([m, m, size - m, size - m], radius=size // 10, outline=AMBER, width=max(3, size // 16))
    draw.ellipse(
        [size * 0.42, size * 0.42, size * 0.58, size * 0.58],
        fill=AMBER,
    )
    return img


def icon_pad_bank(size: int) -> Image.Image:
    img, draw = canvas(size)
    gap = size * 0.06
    cell = size * 0.22
    origin = size * 0.28
    for row in range(2):
        for col in range(2):
            x = origin + col * (cell + gap)
            y = origin + row * (cell + gap)
            fill = AMBER if (row, col) == (0, 1) else MUTED
            draw.rounded_rectangle(
                [x, y, x + cell, y + cell],
                radius=size // 18,
                fill=fill,
            )
    return img


def icon_record(size: int) -> Image.Image:
    img, draw = canvas(size)
    cx, cy = size // 2, size // 2
    r = size // 4
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=CORAL, width=max(3, size // 16))
    rr = size // 7
    draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=CORAL)
    return img


def icon_apply_workflow(size: int) -> Image.Image:
    img, draw = canvas(size)
    # stacked preset cards + play
    for i, color in enumerate((MUTED, TEAL, AMBER)):
        x = size * (0.22 + i * 0.08)
        y = size * (0.28 + i * 0.06)
        draw.rounded_rectangle(
            [x, y, x + size * 0.42, y + size * 0.28],
            radius=size // 16,
            outline=color,
            width=max(2, size // 28),
        )
    play = [
        (size * 0.62, size * 0.55),
        (size * 0.62, size * 0.78),
        (size * 0.8, size * 0.665),
    ]
    draw.polygon(play, fill=AMBER)
    return img


def icon_capture_workflow(size: int) -> Image.Image:
    img, draw = canvas(size)
    # camera shutter / snapshot
    cx, cy = size // 2, size // 2
    draw.rounded_rectangle(
        [size * 0.22, size * 0.32, size * 0.78, size * 0.72],
        radius=size // 14,
        outline=TEAL,
        width=max(3, size // 18),
    )
    draw.ellipse(
        [cx - size // 8, cy - size // 14, cx + size // 8, cy + size // 7],
        outline=ICE,
        width=max(2, size // 22),
    )
    draw.ellipse(
        [size * 0.62, size * 0.36, size * 0.7, size * 0.44],
        fill=AMBER,
    )
    return img


def icon_brand(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = 1
    draw.rounded_rectangle([pad, pad, size - pad - 1, size - pad - 1], radius=size // 5, fill=BG)
    dial_ring(draw, size, AMBER, 0.8)
    mic_body(draw, size, ICE)
    return img


ACTIONS = {
    "mic-gain": icon_mic_gain,
    "mic-monitor": icon_mic_monitor,
    "channel-level": icon_channel_level,
    "mute-toggle": icon_mute,
    "listen-toggle": icon_listen,
    "hpf-toggle": icon_hpf,
    "compressor-toggle": icon_comp,
    "pad-trigger": icon_pad,
    "pad-bank": icon_pad_bank,
    "record-toggle": icon_record,
    "apply-workflow": icon_apply_workflow,
    "capture-workflow": icon_capture_workflow,
}


def main() -> None:
    count = 0
    brand = icon_brand(144)
    save(brand, "imgs/plugin-icon.png")
    save(brand.resize((72, 72), Image.Resampling.LANCZOS), "imgs/category-icon.png")
    count += 2

    for name, fn in ACTIONS.items():
        key = fn(144)
        icon = fn(72)
        save(key, f"imgs/actions/{name}/key.png")
        save(icon, f"imgs/actions/{name}/icon.png")
        count += 2

    print(f"Wrote {count} artwork PNGs under {ROOT}")


if __name__ == "__main__":
    main()
