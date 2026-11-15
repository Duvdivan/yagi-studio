"""
Yagi Studio's bee: a fierce mascot bee in an attack pose, its abdomen curled forward so that its sting, a Yagi, points
the way the bee faces (beam forward, the driven element in the app's blue). One drawing for the app's icons and for the
emboss on the DuvYagi node pod's nose (cad/node_pod.py reads relief()). An original drawing (2026-11-14), bold flat shapes in
the sports-mascot manner, not traced from anything.

How it is drawn: in a 100-unit frame, y up, facing left, from smooth closed curves (Catmull-Rom through a few points),
tapered strokes (the hulls of circles along a curve) and a half-plane for the scowling brow, with manifold3d's CrossSection
for the booleans and offsets (robust on polygons). relief() splits it into what is raised (head, thorax, the abdomen in
three bands, the Yagi) and the wings, with GROOVE-wide gaps between the parts and the eye a hole: the "blue version" is
that same split, painted.

Run (with numpy, manifold3d, matplotlib and Pillow installed):
    python studio/bee.py logo OUT.png      the logo, blue on white
    python studio/bee.py icons             every icon: src/icons/*.png, Android's ic_launcher_foreground.xml and the
                                           page header's src/bee.svg
"""
import math
import sys

import numpy as np
import manifold3d as mf

N = 96                     # sides per circle
UNIT_MM = 0.268            # the emboss's scale on the pod: 100 units -> 26.8 mm (node_pod.py fits it to the nose's flat)
GROOVE = 0.6 / UNIT_MM     # the gaps between the parts, units (0.6 mm on the pod: a 0.4 mm nozzle keeps them open)
NAVY_INK, SKY, BRIGHT = "#1F3A5C", "#A9C3E0", "#5B9FF0"   # the body, the wings, the driven element


def circ(c, r):
    return mf.CrossSection.circle(r, N).translate([float(c[0]), float(c[1])])


def poly(pts):
    return mf.CrossSection([[[float(p[0]), float(p[1])] for p in pts]], mf.FillRule.NonZero)


def _catmull(P, closed, n):
    m = len(P)
    rng = range(m) if closed else range(1, m - 2)
    out = []
    for i in rng:
        p0, p1, p2, p3 = (P[(i - 1) % m], P[i], P[(i + 1) % m], P[(i + 2) % m]) if closed else (P[i - 1], P[i], P[i + 1], P[i + 2])
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


def blob(pts, n=10):
    """A smooth closed shape through the points."""
    return poly(_catmull(np.array(pts, float), True, n))


def smooth(pts, n=8):
    """A smooth open curve through the points, n steps per span."""
    P = np.array(pts, float)
    P = np.vstack([P[0] * 2 - P[1], P, P[-1] * 2 - P[-2]])
    return [tuple(p) for p in _catmull(P, False, n)] + [tuple(P[-2])]


def hull(*parts):
    acc = parts[0]
    for p in parts[1:]:
        acc = acc + p
    return acc.hull()


def chain(pts, radii):
    """A stroke along a polyline, its radius going from point to point: the hulls of consecutive circles."""
    out = mf.CrossSection()
    for (p, r), (q, s) in zip(zip(pts, radii), zip(pts[1:], radii[1:])):
        out = out + hull(circ(p, r), circ(q, s))
    return out


def taper(pts, r0, r1, n=8):
    s = smooth(pts, n)
    return chain(s, list(np.linspace(r0, r1, len(s))))


def below(p, q):
    """Everything on the right of the line p -> q."""
    d = np.array(q, float) - np.array(p, float)
    d /= np.linalg.norm(d)
    nrm = np.array([d[1], -d[0]])
    a, b = np.array(p) - d * 500, np.array(p) + d * 500
    return poly([a, a + nrm * 500, b + nrm * 500, b])


def parts():
    """The bee's shapes, in units, each a CrossSection."""
    P = {}
    # the abdomen: round behind and below, sweeping forward under the thorax to a tip below the head
    P["abdomen"] = blob([(52, 54), (66, 55), (78, 48), (83, 36), (80, 23), (70, 14), (56, 10), (43, 12), (33, 18), (36, 24),
                         (45, 27), (49, 36), (48, 46)])
    P["thorax"] = circ((42, 54), 10.5)
    P["head"] = blob([(13, 60), (11, 67), (15, 75), (23, 81), (32, 81), (39, 75), (39, 65), (33, 58), (22, 56)])
    # the eye: an almond under a brow slanting down to the front, a scowl
    P["eye"] = hull(circ((20, 66.5), 2.9), circ((28.5, 69.5), 4.4)) ^ below((10, 68.0), (38, 76.5))
    P["antennae"] = taper([(29, 80), (32, 89), (39, 95), (46, 93)], 2.7, 1.8) + taper([(22, 80), (20, 90), (25, 97), (33, 98)], 2.6, 1.8)
    # the wings: rounded blades swept up and back off the thorax, the far one showing under the near one
    near = blob([(45, 62), (54, 74), (68, 84), (84, 89), (94, 86), (94, 78), (84, 70), (66, 62), (51, 58)], 8)
    far = blob([(52, 59), (65, 67), (80, 72), (90, 70), (89, 63), (76, 57), (57, 54)], 8)
    P["wings"] = near + (far - near.offset(GROOVE, mf.JoinType.Round))
    # the sting: a Yagi off the abdomen's tip, pointing straight ahead, five elements shortening to its tip
    tip = np.array([35.5, 20.5])
    d, n = np.array([-1.0, 0.0]), np.array([0.0, -1.0])
    P["boom"] = chain([tuple(tip - d * 5), tuple(tip + d * 27)], [1.8, 1.8]) + poly([tip + d * 27 + n * 1.8, tip + d * 31.5, tip + d * 27 - n * 1.8])
    els = [chain([tuple(tip + d * t - n * h), tuple(tip + d * t + n * h)], [1.8, 1.8])
           for t, h in zip((5, 10.8, 16.4, 21.4, 26.0), (7.5, 6.4, 5.4, 4.5, 3.6))]
    P["elements"] = els[0] + els[2] + els[3] + els[4]
    P["driven"] = els[1]
    return P


def relief():
    """(body, wings), in units: the body raised (the head with the eye a hole, the thorax, the abdomen in three bands by two
    grooves ringing out from the waist, the Yagi), GROOVE-wide gaps between its parts; the wings a gap off the body."""
    P = parts()
    gap = lambda a: a.offset(GROOVE, mf.JoinType.Round)
    head = P["head"] + P["antennae"] - P["eye"]
    thorax = P["thorax"] - gap(P["head"])
    abdomen = P["abdomen"] - gap(P["thorax"]) - gap(P["head"])
    waist = (47.0, 48.0)
    for r in (18.0, 25.0):            # (at 25 the outer groove runs into the abdomen's inner curve, not across its tip)
        abdomen = abdomen - (circ(waist, r + GROOVE / 2) - circ(waist, r - GROOVE / 2))
    body = head + thorax + abdomen + P["boom"] + P["elements"] + P["driven"]
    return body, P["wings"] - gap(body)


def layers():
    """The blue version: [(CrossSection, colour)], painted in order."""
    body, wings = relief()
    return [(wings, SKY), (body, NAVY_INK), (parts()["driven"], BRIGHT)]


def paint(lyrs, out, size_px=660, bg="#FFFFFF", margin=8.0, box=(0, 0, 100, 100)):
    """The layers as a square PNG, the drawing's box plus a margin (units) filling it."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.path import Path
    from matplotlib.patches import PathPatch
    fig = plt.figure(figsize=(size_px / 100, size_px / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.axis("off")
    cx, cy, half = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, max(box[2] - box[0], box[3] - box[1]) / 2 + margin
    ax.set_xlim(cx - half, cx + half)
    ax.set_ylim(cy - half, cy + half)
    fig.patch.set_facecolor(bg)
    for cs, col in lyrs:
        verts, codes = [], []
        for loop in cs.to_polygons():
            loop = np.asarray(loop)
            verts += list(loop) + [loop[0]]
            codes += [Path.MOVETO] + [Path.LINETO] * (len(loop) - 1) + [Path.CLOSEPOLY]
        if verts:
            ax.add_patch(PathPatch(Path(verts, codes), facecolor=col, edgecolor="none"))
    fig.savefig(out, facecolor=bg)
    plt.close(fig)


ICON_BACK = "#FFFFFF"      # the icons' background: the logo as drawn, navy on white


def _extent():
    """The drawing's middle (its bounding box's) and its farthest point from there, units."""
    every = relief()[0] + relief()[1]
    b = every.bounds()
    c = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    r = max(float(np.max(np.hypot(np.asarray(lp)[:, 0] - c[0], np.asarray(lp)[:, 1] - c[1]))) for lp in every.to_polygons())
    return b, c, r


def icon_png(path, px, maskable=False):
    """A square icon: the bee on ICON_BACK, drawn at four times the size and scaled down (crisper edges). An ordinary icon
    has the bee's box 84% of the side; a maskable one keeps every point of the bee inside the middle 78% circle (the safe
    zone is 80%), as launchers may cut it to a circle."""
    from PIL import Image
    import tempfile, os
    b, c, r = _extent()
    side = max(b[2] - b[0], b[3] - b[1])
    half = r / 0.78 if maskable else side / 0.84 / 2          # half the icon's side, in units (0.39 of the side = 0.78 of half)
    big = os.path.join(tempfile.mkdtemp(), "big.png")
    paint(layers(), big, size_px=px * 4, bg=ICON_BACK, margin=half - side / 2, box=(c[0] - side / 2, c[1] - side / 2, c[0] + side / 2, c[1] + side / 2))
    Image.open(big).convert("RGB").resize((px, px), Image.LANCZOS).save(path)


def android_vector(path):
    """Android's adaptive icon foreground (a 108 dp vector, the background a colour): the bee inside the 66 dp safe circle,
    each part a path (even-odd fill for the eye and the gaps). It is the monochrome icon too, which keeps the gaps."""
    b, c, r = _extent()
    k = 32.0 / r                                          # dp per unit: the farthest point 32 dp from the middle
    def path_data(cs):
        out = []
        for lp in cs.to_polygons():
            pts = [(54 + (x - c[0]) * k, 54 - (y - c[1]) * k) for x, y in np.asarray(lp)]
            out.append("M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + "Z")
        return "".join(out)
    body, wings = relief()
    paths = [(wings, SKY), (body, NAVY_INK), (parts()["driven"], BRIGHT)]
    xml = ['<?xml version="1.0" encoding="utf-8"?>',
           "<!-- Yagi Studio's bee: made by studio/bee.py (python studio/bee.py icons); edit the drawing there, not this file -->",
           '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
           '    android:width="108dp"', '    android:height="108dp"', '    android:viewportWidth="108"', '    android:viewportHeight="108">']
    for cs, col in paths:
        xml.append(f'    <path android:fillColor="{col}" android:fillType="evenOdd" android:pathData="{path_data(cs)}" />')
    xml.append("</vector>")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(xml) + "\n")


MARK_H = 32               # the page header's mark, CSS px tall (the name beside it is 21 px type)
MARK_TOL = 0.15           # how far the header's outline may stray from the drawing, units (0.05 px at MARK_H)


def mark_svg(path):
    """The page header's mark (src/bee.svg, which build.py puts in the header): the bee as three paths, its colours from
    classes so the page's light and dark themes can set them (style.css); the fills written here are for the file alone.
    The outline is simplified within MARK_TOL, which keeps it to a few kilobytes."""
    body, wings = relief()
    b = (body + wings).bounds()
    pad = 1.0
    x0, top = b[0] - pad, b[3] + pad
    w, h = b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad
    def d(cs):
        out = []
        for lp in cs.simplify(MARK_TOL).to_polygons():
            out.append("M" + " ".join(f"{x - x0:.1f},{top - y:.1f}" for x, y in np.asarray(lp)) + "Z")
        return "".join(out)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" class="bee" width="{MARK_H * w / h:.1f}" height="{MARK_H}" '
           f'viewBox="0 0 {w:.1f} {h:.1f}" aria-hidden="true">'
           f'<path class="bee-wing" fill="{SKY}" fill-rule="evenodd" d="{d(wings)}"/>'
           f'<path class="bee-ink" fill="{NAVY_INK}" fill-rule="evenodd" d="{d(body)}"/>'
           f'<path class="bee-bright" fill="{BRIGHT}" fill-rule="evenodd" d="{d(parts()["driven"])}"/></svg>')
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(svg + "\n")


def icons(root):
    """Every icon from the drawing: the web app's four PNGs, Android's adaptive icon foreground, and the header's mark."""
    import os
    mark_svg(os.path.join(root, "src", "bee.svg"))
    web = os.path.join(root, "src", "icons")
    icon_png(os.path.join(web, "icon-192.png"), 192)
    icon_png(os.path.join(web, "icon-512.png"), 512)
    icon_png(os.path.join(web, "icon-maskable-512.png"), 512, maskable=True)
    icon_png(os.path.join(web, "apple-touch-icon.png"), 180)
    android_vector(os.path.join(root, "android", "app", "src", "main", "res", "drawable", "ic_launcher_foreground.xml"))


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "logo":
        paint(layers(), sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "icons":
        import os
        icons(os.path.dirname(os.path.abspath(__file__)))
    else:
        print(__doc__)
