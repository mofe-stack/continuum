"""Generates Continuum's extension icons (16/48/128) from one vector definition.

A ROUNDED-SQUARE white tile with the bookmark drawn as an OUTLINE (stroke, not a
solid fill) and two filled charcoal sparkles inside it — the single icon set used
everywhere (toolbar + extensions menu). Rendered once at high resolution and
downsampled (LANCZOS) for clean anti-aliasing at every size.

Run:  python icons/generate_icons.py
"""

import os
from PIL import Image, ImageDraw

CHARCOAL = (31, 41, 55, 255)   # #1F2937 — glyph
WHITE = (255, 255, 255, 255)   # tile

MASTER = 1024                  # render size, downsampled afterwards
G = int(MASTER * 0.58)         # glyph box (24-unit viewBox maps into this) — larger glyph
OFFSET = (MASTER - G) // 2
RADIUS = int(MASTER * 0.22)    # rounded-square corner radius
STROKE = max(2, int(G / 24 * 2))  # bookmark outline weight (~2 units in the viewBox)

HERE = os.path.dirname(os.path.abspath(__file__))


def p(x, y):
    """Map a point from the 24x24 viewBox into the centred glyph box."""
    return (OFFSET + x / 24 * G, OFFSET + y / 24 * G)


# Bookmark silhouette (Lucide bookmark, corners lightly squared off).
BOOKMARK = [(5, 5), (7, 3), (17, 3), (19, 5), (19, 21), (12, 16), (5, 21)]

# Two 4-point sparkles, filled charcoal.
BIG_STAR = [(10, 5.5), (11, 7.55), (13, 8.5), (11, 9.45),
            (10, 11.5), (9, 9.45), (7, 8.5), (9, 7.55)]
SMALL_STAR = [(13, 9.4), (13.52, 10.48), (14.6, 11), (13.52, 11.52),
              (13, 12.6), (12.48, 11.52), (11.4, 11), (12.48, 10.48)]


def render_master():
    """White rounded-square tile; bookmark outline + sparkles in charcoal."""
    img = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, MASTER - 1, MASTER - 1], radius=RADIUS, fill=WHITE)
    # Bookmark as a stroked outline (closed loop), rounded joins.
    pts = [p(x, y) for x, y in BOOKMARK]
    d.line(pts + [pts[0]], fill=CHARCOAL, width=STROKE, joint="curve")
    # Round off the outer corners the line joints miss.
    r = STROKE / 2
    for pt in pts:
        d.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=CHARCOAL)
    # Filled sparkles.
    d.polygon([p(x, y) for x, y in BIG_STAR], fill=CHARCOAL)
    d.polygon([p(x, y) for x, y in SMALL_STAR], fill=CHARCOAL)
    return img


def main():
    master = render_master()
    for size in (16, 48, 128):
        out = master.resize((size, size), Image.LANCZOS)
        path = os.path.join(HERE, f"icon{size}.png")
        out.save(path)
        print("wrote", path)


if __name__ == "__main__":
    main()
