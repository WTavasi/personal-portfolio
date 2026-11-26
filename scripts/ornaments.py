# Run: python3 scripts/ornaments.py src/assets/ornaments
"""Draws the site's ornaments as SVG files (used as masks, so the strokes are plain black).

ornament-tile.svg: a seamless tile of acanthus scrolls: two waving vines, and in the hollow of each
bend a branch that winds into a scroll, with lobed leaves following the curl. Leaves are drawn at
partial opacity, so in the mask they come out a shade lighter than the vines. flourish.svg: a symmetric looping flourish for the top and bottom of a
page. flourish-band.svg: a looping band that repeats down the sides of a page.
"""
import math
import random
import sys

OUT = sys.argv[1]
random.seed(7)


def fmt(v):
    return str(round(v))


def fine(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def path_from(points, fmt=fmt):
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


def smooth_closed(points):
    """A smooth closed outline through points."""
    return path_from(points + [points[0], points[1]], fine) + "Z"


T = 600  # the tile: large, so the pattern repeats rarely
AMP = 70  # how far the vines wave either side


def vine(k):
    """One of two vines across the tile, 300 apart and half a wave out of step, so the scrolls
    stagger diagonally. Its period is the tile's width, so it joins itself at the edges."""
    y0 = T * (0.25 + 0.5 * k)
    sh = k * T / 2

    def at(x):
        u = 2 * math.pi * (x - sh) / T
        return x, y0 - AMP * math.sin(u), math.atan2(-AMP * 2 * math.pi / T * math.cos(u), 1)

    return [at(x)[:2] for x in range(-60, T + 61, 25)], at, sh


def scroll(ax, ay, leave, r0, turns, way):
    """A branch that leaves a vine at (ax, ay) heading in direction `leave`, sweeps round a circle
    of radius r0 and winds in to its centre; and its direction at each point. Leaving at an angle,
    it parts from the vine at once instead of running alongside it."""
    t0 = math.atan2(-way * math.cos(leave), way * math.sin(leave))
    cx, cy = ax - r0 * math.cos(t0), ay - r0 * math.sin(t0)
    n = int(turns * 18)
    pts = []
    for i in range(n + 1):
        u = i / n
        r = r0 * (1 - u) ** 1.25 + 5
        th = t0 + way * u * turns * 2 * math.pi
        pts.append((cx + r * math.cos(th), cy + r * math.sin(th)))
    angs = [math.atan2(pts[min(i + 1, n)][1] - pts[max(i - 1, 0)][1], pts[min(i + 1, n)][0] - pts[max(i - 1, 0)][0]) for i in range(n + 1)]
    return pts, angs


def leaf(x, y, a, length, bend, side, lobes=4):
    """An acanthus leaf: a broad blade curving with the scroll, its edge cut into pointed lobes,
    fuller on the outer side, the tip turned over. Returns its outline and its midrib."""
    mid = []
    n = 16
    for i in range(n + 1):
        t = i / n
        mid.append((x, y, a, t))
        a += bend * (0.3 + 2.2 * t * t) / n
        x += math.cos(a) * length / n
        y += math.sin(a) * length / n
    left, right = [], []
    for mx, my, ang, t in mid:
        body = length * 0.34 * math.sin(math.pi * min(1, t ** 0.7)) ** 0.8
        tooth = 0.55 + 0.45 * ((lobes * t) % 1) ** 1.6  # each lobe swells, then drops back to a point
        nx, ny = -math.sin(ang), math.cos(ang)
        outer, inner = body * tooth, body * (0.35 + 0.25 * tooth)
        wl, wr = (outer, inner) if side > 0 else (inner, outer)
        left.append((mx + nx * wl, my + ny * wl))
        right.append((mx - nx * wr, my - ny * wr))
    outline = left + list(reversed(right))
    return smooth_closed(outline), path_from([(m[0], m[1]) for m in mid[: int(n * 0.85)]], fine)


stems, leaves, ribs, knots = [], [], [], []
for k in (0, 1):
    pts, at, sh = vine(k)
    stems.append(pts)
    # small leaves along the vine itself, alternating sides
    side = 1
    for x in range(40, T, 100):
        vx, vy, va = at(x)
        o, r = leaf(vx, vy, va + side * 0.9, 32 * random.uniform(0.85, 1.1), -side * 1.2, side, 3)
        leaves.append(o)
        ribs.append(r)
        side = -side
    # a scroll in the hollow of each bend: under the crest, over the trough
    for xc, way in ((T * 0.25 + sh, 1), (T * 0.75 + sh, -1)):
        ax, ay, va = at(xc - T * 0.13)
        spts, sangs = scroll(ax, ay, va + way * 0.75, 112, 1.55, way)
        stems.append(spts)
        knots.append((ax, ay, va))
        # a sheath leaf over the fork, leaves along the outside of the curl, one curled in its eye
        o, r = leaf(ax, ay, va + math.pi - way * 0.5, 78, way * 1.2, way, 4)
        leaves.append(o)
        ribs.append(r)
        n = len(spts)
        for frac, size, bend in ((0.12, 80, 2.0), (0.3, 70, 2.0), (0.47, 58, 2.0), (0.62, 44, 2.0), (0.8, 30, 2.6)):
            j = int(n * frac)
            o, r = leaf(spts[j][0], spts[j][1], sangs[j] + way * (0.35 if frac < 0.8 else 0), size * random.uniform(0.92, 1.08), way * bend, way, 4 if size > 40 else 3)
            leaves.append(o)
            ribs.append(r)


def everywhere(svg):
    """The drawing once, then reused at each neighbouring tile position, so anything crossing an
    edge reappears on the opposite side and the tile repeats without seams."""
    return [f'<defs><g id="a">{svg}</g></defs>'] + [f'<use href="#a" x="{ox}" y="{oy}"/>' for ox in (-T, 0, T) for oy in (-T, 0, T)]


def knot(q):
    x, y, a = q
    return f'<ellipse rx="6.8" ry="4.2" transform="translate({fmt(x)} {fmt(y)}) rotate({fmt(math.degrees(a) + 90)})"/>'


art = "".join(
    [f'<path d="{d}" fill-opacity="0.45" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/>' for d in leaves]
    + [f'<path d="{d}" fill="none" stroke="#000" stroke-width="1" stroke-linecap="round"/>' for d in ribs]
    + [f'<path d="{path_from(p, fine)}" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round"/>' for p in stems]
    + [knot(q) for q in knots]
)
tile = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{T}" height="{T}" viewBox="0 0 {T} {T}">',
    *everywhere(art),
    "</svg>",
]
open(f"{OUT}/ornament-tile.svg", "w").write("".join(tile))


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
print("scrolls:", len(knots), "leaves:", len(leaves))
