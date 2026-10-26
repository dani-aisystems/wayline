"""Generate every brand asset from the master logo (brand-src/wayline-logo.png).

The master is the mark + wordmark on a near-black background. This script:
  - separates the mark and wordmark from the background (colour-to-alpha against the background),
  - writes transparent PNGs for use on light and dark surfaces,
  - writes app icons (mark on the logo's dark background), maskable icon, apple-touch icon and favicons.

Usage: python3 scripts/build-brand.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand-src" / "wayline-logo.png"
OUT = ROOT / "public" / "brand"
OUT.mkdir(parents=True, exist_ok=True)

ICON_BG = (10, 15, 26)  # matches --c-paper (dark) #0a0f1a

master = Image.open(SRC).convert("RGB")
bg = master.getpixel((10, 10))


def to_alpha(img: Image.Image) -> Image.Image:
    """Remove the dark background so anti-aliased edges keep their colour."""
    src = img.convert("RGB")
    out = Image.new("RGBA", src.size)
    sp, op = src.load(), out.load()
    for y in range(src.height):
        for x in range(src.width):
            c = sp[x, y]
            a = max((c[i] - bg[i]) / (255 - bg[i]) if c[i] > bg[i] else 0 for i in range(3))
            if a <= 0.08:
                op[x, y] = (0, 0, 0, 0)
                continue
            a = min(a, 1.0)
            rgb = tuple(max(0, min(255, round(bg[i] + (c[i] - bg[i]) / a))) for i in range(3))
            op[x, y] = (*rgb, round(a * 255))
    return out


def trim(img: Image.Image, pad: int = 0) -> Image.Image:
    box = img.getbbox()
    img = img.crop(box)
    if pad:
        canvas = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
        canvas.paste(img, (pad, pad), img)
        img = canvas
    return img


def square(img: Image.Image) -> Image.Image:
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return canvas


def recolor(img: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Single-colour version (keeps alpha) — for the wordmark on light backgrounds and mono."""
    solid = Image.new("RGBA", img.size, (*rgb, 0))
    solid.putalpha(img.getchannel("A"))
    return solid


def recolor_neutral(img: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Recolour only the white letterforms; keep coloured accents (the blue dot on the i)."""
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) - min(r, g, b) < 60:
                px[x, y] = (*rgb, a)
    return out


def icon(mark_sq: Image.Image, size: int, inset: float, radius: float = 0.0) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (*ICON_BG, 255))
    inner = round(size * (1 - 2 * inset))
    m = mark_sq.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(m, (off, off), m)
    if radius:
        mask = Image.new("L", (size, size), 0)
        from PIL import ImageDraw

        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=round(size * radius), fill=255)
        canvas.putalpha(mask)
    return canvas


# Regions of the master (found by scanning for non-background pixels): mark above y=740, wordmark below.
mark = trim(to_alpha(master.crop((0, 200, master.width, 745))))
word = trim(to_alpha(master.crop((0, 745, master.width, 1010))))

mark.save(OUT / "mark.png")
mark.resize((round(mark.width * 128 / mark.height), 128), Image.LANCZOS).save(OUT / "mark-128h.png")
recolor(mark, (0, 0, 0)).save(OUT / "mark-mono.png")
word.save(OUT / "wordmark-text-white.png")
recolor_neutral(word, (19, 35, 58)).save(OUT / "wordmark-text-ink.png")  # --c-ink

# Full lockups.
full_dark = trim(to_alpha(master), pad=40)
full_dark.save(OUT / "logo-transparent.png")
gap = 44  # vertical gap between mark and wordmark in the master
ink_word = recolor_neutral(word, (19, 35, 58))
w = max(mark.width, ink_word.width) + 80
lockup = Image.new("RGBA", (w, mark.height + gap + ink_word.height + 80), (0, 0, 0, 0))
lockup.paste(mark, ((w - mark.width) // 2, 40), mark)
lockup.paste(ink_word, ((w - ink_word.width) // 2, 40 + mark.height + gap), ink_word)
lockup.save(OUT / "logo-on-light.png")
master.save(OUT / "logo-on-dark.png")

mark_sq = square(trim(mark, pad=0))
icon(mark_sq, 512, 0.14).save(OUT / "icon-512.png")
icon(mark_sq, 192, 0.14).save(OUT / "icon-192.png")
icon(mark_sq, 512, 0.24).save(OUT / "icon-maskable-512.png")
icon(mark_sq, 180, 0.14).convert("RGB").save(OUT / "apple-touch-icon.png")
icon(mark_sq, 32, 0.08, radius=0.22).save(OUT / "favicon-32.png")
icon(mark_sq, 48, 0.08, radius=0.22).save(ROOT / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

print("Wrote:", ", ".join(sorted(p.name for p in OUT.iterdir())))

# Copies imported by the app (so single-file builds can inline them).
import shutil
APP_ASSETS = ROOT / "src" / "assets" / "brand"
APP_ASSETS.mkdir(parents=True, exist_ok=True)
for name in ["mark-128h.png", "wordmark-text-ink.png", "wordmark-text-white.png"]:
    shutil.copy(OUT / name, APP_ASSETS / name)
