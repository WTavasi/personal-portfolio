# Run: python3 scripts/ornaments.py src/assets/ornaments
"""Draws the site's ornaments as SVG files (used as masks, so the strokes are plain black).

ornament-tile.svg: a seamless tile of fine looping curls, damask-like, with a G clef and an
F clef hidden among them. flourish.svg: a symmetric looping flourish for the top and bottom of a
page. flourish-band.svg: a looping band that repeats down the sides of a page.
"""
import math
import random
import sys

OUT = sys.argv[1]
random.seed(7)
W = H = 420


def fmt(v):
    return str(round(v))


def path_from(points):
    """A smooth path through points (Catmull-Rom turned into cubic Béziers)."""
    d = [f"M{fmt(points[0][0])} {fmt(points[0][1])}"]
    for i in range(len(points) - 1):
        p0 = points[i - 1] if i > 0 else points[i]
        p1, p2 = points[i], points[i + 1]
        p3 = points[i + 2] if i + 2 < len(points) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}")
    return "".join(d)


def curl(cx, cy, size, turns, start, sign, tail):
    """A spiral curl that winds in to its centre, with a long S-shaped tendril sweeping out of it,
    like the vines of a damask."""
    pts = []
    steps = int(turns * 9)
    for k in range(steps + 1):
        t = k / steps
        a = start + sign * t * turns * 2 * math.pi
        r = size * (1 - t) ** 1.1 + 1.0
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    # The tendril: two arcs bending opposite ways, carrying on from the spiral's outer end.
    ox, oy = pts[0]
    head = start - sign * math.pi / 2  # the direction the spiral was travelling as it began
    tendril = []
    x, y, a = ox, oy, head + math.pi
    for bend, length in ((-sign * 0.05, tail * 0.6), (sign * 0.045, tail * 0.7)):
        n = 4
        for _ in range(n):
            a += bend * (length / n) * 2.2 / max(size, 8) * 8
            x += math.cos(a) * length / n
            y += math.sin(a) * length / n
            tendril.append((x, y))
    return list(reversed(tendril)) + pts


# A treble (G) clef and a bass (F) clef as single strokes, in their own little boxes.
G_CLEF = [
    (26, 128), (18, 132), (14, 124), (20, 118), (28, 122), (30, 134), (24, 142),
    (22, 120), (24, 90), (28, 62), (34, 34), (36, 16), (30, 8), (22, 14), (20, 34),
    (26, 52), (38, 64), (44, 80), (38, 96), (24, 100), (12, 92), (12, 78), (22, 70),
    (32, 74), (34, 84), (26, 90),
]
F_CLEF = [(10, 24), (8, 14), (16, 6), (30, 6), (38, 16), (36, 32), (24, 46), (6, 56)]


def place(points, x, y, scale, angle=0.0):
    c, s = math.cos(angle), math.sin(angle)
    return [(x + scale * (px * c - py * s), y + scale * (px * s + py * c)) for px, py in points]


g_at = (70, 150, 0.95, -0.12)
f_at = (300, 300, 1.05, 0.18)
g_box = (60, 140, 120, 300)
f_box = (290, 290, 350, 360)


def clear_of_clefs(x, y, r):
    for (x0, y0, x1, y1) in (g_box, f_box):
        if x0 - r + 4 < x < x1 + r - 4 and y0 - r + 4 < y < y1 + r - 4:
            return False
    return True


curls = []
tries = 0
while len(curls) < 70 and tries < 20000:
    tries += 1
    size = random.uniform(7, 30)
    x, y = random.uniform(0, W), random.uniform(0, H)
    if not clear_of_clefs(x, y, size):
        continue
    if any(math.hypot((x - cx + W / 2) % W - W / 2, (y - cy + H / 2) % H - H / 2) < (size + cs) * 0.92 + 2 for cx, cy, cs, *_ in curls):
        continue
    curls.append((x, y, size, random.uniform(1.5, 2.6), random.uniform(0, 2 * math.pi), random.choice([-1, 1]), size * random.uniform(1.8, 3.2)))

paths = []
for cx, cy, size, turns, start, sign, tail in curls:
    for ox in (-W, 0, W):
        for oy in (-H, 0, H):
            pts = curl(cx + ox, cy + oy, size, turns, start, sign, tail)
            if all(p[0] < -40 or p[0] > W + 40 or p[1] < -40 or p[1] > H + 40 for p in pts):
                continue
            paths.append(path_from(pts))

g = place(G_CLEF, *g_at)
f = place(F_CLEF, *f_at)
fx, fy, fs, fa = f_at
dots = [place([(46, 14)], fx, fy, fs, fa)[0], place([(46, 30)], fx, fy, fs, fa)[0], place([(10, 24)], fx, fy, fs, fa)[0]]

tile = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
    '<g fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
    *[f'<path d="{d}"/>' for d in paths],
    f'<path d="{path_from(g)}"/>',
    f'<path d="{path_from(f)}"/>',
    "</g>",
    *[f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{2.4 if i < 2 else 3}"/>' for i, (x, y) in enumerate(dots)],
    "</svg>",
]
open(f"{OUT}/ornament-tile.svg", "w").write("\n".join(tile))


# The flourish: one half drawn, mirrored to the other side, curling into scrolls at each end.
def half_flourish():
    main = [(150, 30), (128, 22), (110, 30), (96, 42), (80, 40), (74, 30), (82, 22), (92, 28), (88, 36)]
    sweep = [(150, 30), (132, 40), (104, 46), (70, 44), (46, 34), (30, 24), (16, 24), (8, 32), (14, 40), (22, 36)]
    loop = [(118, 24), (110, 12), (98, 10), (92, 18), (100, 24)]
    return [main, sweep, loop]


fl = []
for part in half_flourish():
    fl.append(path_from(part))
    fl.append(path_from([(300 - x, y) for x, y in part]))
flourish = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="56" viewBox="0 0 300 56">',
    '<g fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">',
    *[f'<path d="{d}"/>' for d in fl],
    "</g>",
    '<circle cx="150" cy="30" r="3.5"/>',
    "</svg>",
]
open(f"{OUT}/flourish.svg", "w").write("\n".join(flourish))

# The band: a loop repeated down the page, each joining the next, so it tiles seamlessly.
band_pts = [(20, 0), (30, 18), (32, 34), (22, 46), (12, 40), (14, 30), (24, 30), (28, 44), (20, 62), (10, 80), (20, 100)]
band = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="100" viewBox="0 0 40 100">',
    '<g fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">',
    f'<path d="{path_from(band_pts)}"/>',
    f'<path d="{path_from([(40 - x, y + 50) for x, y in band_pts[:6]])}"/>',
    "</g>",
    "</svg>",
]
open(f"{OUT}/flourish-band.svg", "w").write("\n".join(band))
print("curls:", len(curls), "paths:", len(paths))
