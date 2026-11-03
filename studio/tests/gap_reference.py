"""
What the gap between the driven element's two rods really does, from a model of the real shape.

src/solver.js treats the fed rod as one continuous tube with the feed's field spread over the gap, so
the gap hardly matters to it. The real thing has two flat faces and a thin wire across: the coax's
core, or a twisted shield. This solves that shape as a body of revolution, using the same mixed-potential
method as bor_reference.py: tip, side, inner face, a thin lead on the axis, the other face, side, tip.
The current must squeeze through the lead (series inductance), and the faces are a small capacitor.

The answer is a lumped reactance in series with the feed, so it can be added to the array's impedance
from the solver. In theory it is about w * mu0 / (2 pi) * gap * ln(a / r), which is printed alongside.

    python gap_reference.py          -> a printed table
    python gap_reference.py --json   -> the numbers tests/validate.js compares against
"""
import json
import sys

import numpy as np

from bor_reference import C0, MU0, assemble, generator, graded

ROD_L, ROD_D = 149.0, 3.175       # the driven element, tip to tip, mm
F_MHZ = 910.525
SOURCE_SHARE = 0.5                # the feed's field covers this share of the lead's length


def with_lead(h, a, gap, r_lead, d_edge, growth, d_max):
    """Points (rho, z) from the lower tip to the upper, through two inner faces and the lead. Metres."""
    cap = graded(a, d_edge, growth, d_max, both=False)              # distance in from the rim
    side = graded(h - gap / 2, d_edge, growth, d_max)               # from the inner face to the tip
    face = graded(a - r_lead, d_edge, growth, d_max)                # from the rim to the lead
    lead = graded(gap, min(d_edge, gap / 6), growth, d_max)         # up the lead
    upper = [(a, gap / 2 + z) for z in side[1:]] + [(a - s, h) for s in cap[1:]]
    lower = [(r, -z) for r, z in upper[::-1]]
    rim_lower = [(a - s, -gap / 2) for s in face]                   # the rim, inward to the lead
    wire = [(r_lead, -gap / 2 + z) for z in lead[1:]]               # along the lead, ending at the upper face
    rim_upper = [(r_lead + s, gap / 2) for s in face[1:]]           # outward to the rim
    return np.array(lower + rim_lower + wire + rim_upper + upper)


def z_lead(gap_mm, r_lead_mm, length_mm=ROD_L, dia_mm=ROD_D, f_mhz=F_MHZ, refine=1.0):
    """Input impedance of two flat-faced rods joined by a thin lead on the axis, fed along the lead."""
    a, h, gap, r = dia_mm / 2000, length_mm / 2000, gap_mm / 1000, r_lead_mm / 1000
    lam = C0 / (f_mhz * 1e6)
    pts = with_lead(h, a, gap, r, a / (5 * refine), 1 + 0.4 / refine ** 0.5, lam / (30 * refine))
    Z, V = assemble(pts, f_mhz * 1e6, gap * SOURCE_SHARE)
    return 1 / (V @ np.linalg.solve(Z, V))


def z_solid(length_mm=ROD_L, dia_mm=ROD_D, f_mhz=F_MHZ, gap_mm=1.0, refine=1.0):
    """The same rod with no break in it: what the app's solver assumes."""
    a, h, lam = dia_mm / 2000, length_mm / 2000, C0 / (f_mhz * 1e6)
    pts = generator(h, a, True, gap_mm / 1000, a / (5 * refine), 1 + 0.4 / refine ** 0.5, lam / (30 * refine))
    Z, V = assemble(pts, f_mhz * 1e6, gap_mm / 1000)
    return 1 / (V @ np.linalg.solve(Z, V))


def theory(gap_mm, r_lead_mm, dia_mm=ROD_D, f_mhz=F_MHZ):
    """The extra series reactance of a lead thinner than the rod it replaces, in ohms."""
    w = 2 * np.pi * f_mhz * 1e6
    return w * MU0 / (2 * np.pi) * gap_mm / 1000 * np.log(dia_mm / 2 / r_lead_mm)


def table(refine=1.5):
    solid = z_solid(refine=refine)
    rows = []
    for r in (0.15, 0.25, 0.5, 1.0):
        for g in (1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 10.0):
            z = z_lead(g, r, refine=refine)
            rows.append(dict(gap=g, r=r, z=[z.real, z.imag], dr=z.real - solid.real, dx=z.imag - solid.imag, theory=theory(g, r)))
    return dict(solid=[solid.real, solid.imag], rows=rows)


if __name__ == "__main__":
    t = table()
    if "--json" in sys.argv:
        # for the checks: the same lead on a finer mesh, and one nearly as wide as the rod
        fine = z_lead(3.0, 0.15, refine=3.0) - z_solid(refine=3.0)
        wide = z_lead(3.0, 1.55, refine=1.5) - z_solid(refine=1.5)
        print(json.dumps(dict(t, fine=fine.imag, wide=wide.imag)))
        sys.exit(0)
    print(f"One rod, {ROD_L} mm x {ROD_D} mm, {F_MHZ} MHz, lossless. No break: {t['solid'][0]:.2f} {t['solid'][1]:+.2f}j ohm")
    print("  lead radius  gap     R        X      change in R  change in X  theory")
    for q in t["rows"]:
        print(f"  {q['r']:6.2f} mm {q['gap']:5.1f} {q['z'][0]:8.2f} {q['z'][1]:8.2f} {q['dr']:10.2f} {q['dx']:12.2f} {q['theory']:9.2f}")
