"""
A reference for one rod: the full surface solved as a body of revolution, with flat end caps.

This is deliberately a different method from the app's solver (src/solver.js), so that it can
check it. It meshes the rod's real surface along its generator (axis, across the end cap, down the
side, across the other cap), and needs no thin-wire or tube assumption.

Method: mixed-potential EFIE, Galerkin with triangle functions in the total ring current I(t)
(Glisson and Wilton, IEEE Trans. AP 28, 1980, for bodies of revolution, in the axisymmetric TM
case that a centre-fed rod excites):

    Z_mn = j w mu * integral integral L_m L_n (t.t') G dt dt'
         + 1 / (j w eps) * integral integral L_m' L_n' G0 dt dt'

where G0 and G1 are the free-space Green's function averaged round a ring. The static parts of
the ring averages are complete elliptic integrals; the dynamic remainder is smooth.

    python bor_reference.py          -> a printed table
    python bor_reference.py --json   -> the numbers tests/validate.js compares against
"""
import json
import sys

import numpy as np
from scipy.optimize import brentq
from scipy.special import ellipe, ellipk

C0 = 299792458.0
MU0 = 4e-7 * np.pi
EPS0 = 1 / (MU0 * C0 ** 2)
PHI_POINTS = 16          # midpoint rule round the ring, for the smooth dynamic remainder
Q_FAR = 4                # Gauss points per panel, far pairs
Q_NEAR = 10              # Gauss points per panel, touching or same-panel pairs
NEAR_PANELS = 2          # panels apart that still count as near


def gauss01(n):
    x, w = np.polynomial.legendre.leggauss(n)
    return (x + 1) / 2, w / 2


def clustered01(n):
    """Gauss rule crowded at both ends of [0, 1], for log singularities at the ends."""
    x, w = gauss01(n)
    return x ** 3 * (10 + x * (-15 + 6 * x)), w * 30 * x ** 2 * (1 - x) ** 2


_phi = (np.arange(PHI_POINTS) + 0.5) * np.pi / PHI_POINTS
_cphi = np.cos(_phi)


def kernels(rho, z, rho2, z2, k):
    """Ring averages of e^{-jkR}/(4 pi R): G0, and G1 with the cos(phi) weight."""
    dz2 = (z - z2) ** 2
    c2 = (rho + rho2) ** 2 + dz2
    d2 = rho ** 2 + rho2 ** 2 + dz2
    pp = rho * rho2
    m = np.where(c2 > 0, 4 * pp / np.where(c2 > 0, c2, 1), 0.0)
    m = np.clip(m, 0, 1 - 1e-15)
    cc = np.sqrt(np.where(c2 > 0, c2, 1e-30))
    K = ellipk(m)
    E = ellipe(m)
    s0 = 2 / np.pi * K / cc
    small = m < 1e-5
    mm = np.where(small, 1.0, m)
    s1 = np.where(small, pp / (2 * np.maximum(d2, 1e-30) ** 1.5),
                  2 / (np.pi * cc) * ((2 - mm) / mm * K - 2 / mm * E))
    # the dynamic remainder (e^{-jkR} - 1) / R is smooth: midpoint rule over half the ring
    shape = np.broadcast(rho, rho2, z, z2).shape
    r2 = d2[..., None] - 2 * pp[..., None] * _cphi if np.ndim(d2) else d2 - 2 * pp * _cphi
    r = np.sqrt(np.maximum(r2, 1e-30))
    h = (np.cos(k * r) - 1 - 1j * np.sin(k * r)) / r
    d0 = h.mean(axis=-1)
    d1 = (h * _cphi).mean(axis=-1)
    assert shape == d0.shape
    return (s0 + d0) / (4 * np.pi), (s1 + d1) / (4 * np.pi)


def graded(length, d0, growth, dmax, both=True):
    """Panel edges on [0, length], fine at the ends (or only at 0)."""
    def run():
        out, d, s = [], d0, 0.0
        while s < length and d < dmax:
            out.append(d)
            s += d
            d *= growth
        return out
    a = run()
    b = run() if both else []
    used = sum(a) + sum(b)
    if used > length:
        scale = length / used
        a, b = [x * scale for x in a], [x * scale for x in b]
        mid = []
    else:
        rest = length - used
        n = max(1, int(np.ceil(rest / dmax))) if rest > 1e-9 else 0
        mid = [rest / n] * n if n else []
    return np.concatenate([[0.0], np.cumsum(a + mid + b[::-1])])


def side_nodes(h, gap, d_edge, growth, d_max, d_gap):
    """Upper half of the side, z from 0 to h: fine at the gap and at the rim, a node at gap / 2."""
    # from the gap outward
    zs = [0.0, gap / 4, gap / 2]
    d = d_gap
    while zs[-1] < h:
        zs.append(zs[-1] + d)
        d = min(d * growth, d_max)
    zs = [z for z in zs if z < h - d_edge]
    # from the rim inward, keeping what the gap's run has not yet covered
    tip = [h]
    d = d_edge
    while tip[-1] - d > zs[-1] + 0.5 * d:
        tip.append(tip[-1] - d)
        d = min(d * growth, d_max)
    # thin the gap's run where the rim's run has taken over, so sizes stay graded
    edge = tip[-1]
    zs = [z for z in zs if z < edge - 0.6 * d or z <= gap / 2]
    return np.array(sorted(zs + tip))


def generator(h, a, caps, gap, d_edge, growth, d_max):
    """Points (rho, z) of the generator, from the lower end to the upper end. Metres."""
    upper = side_nodes(h, gap, d_edge, growth, d_max, gap / 2)
    side = np.concatenate([-upper[:0:-1], upper])
    pts = []
    if caps:
        cap = graded(a, d_edge, growth, d_max, both=False)    # distance in from the rim
        for s in cap[:0:-1]:
            pts.append((a - s, -h))
    for z in side:
        pts.append((a, z))
    if caps:
        for s in cap[1:]:
            pts.append((a - s, h))
    return np.array(pts)


def assemble(pts, f, gap):
    w = 2 * np.pi * f
    k = w / C0
    p0, p1 = pts[:-1], pts[1:]
    seg = p1 - p0
    ln = np.hypot(seg[:, 0], seg[:, 1])
    tan = seg / ln[:, None]
    np_ = len(ln)

    # far pairs: one Gauss grid for everything
    xq, wq = gauss01(Q_FAR)
    rq = p0[:, 0, None] + seg[:, 0, None] * xq
    zq = p0[:, 1, None] + seg[:, 1, None] * xq
    rho = rq.ravel()
    zz = zq.ravel()
    R1, R2 = np.meshgrid(rho, rho, indexing="ij")
    Z1, Z2 = np.meshgrid(zz, zz, indexing="ij")
    G0, G1 = kernels(R1, Z1, R2, Z2, k)
    G0 = G0.reshape(np_, Q_FAR, np_, Q_FAR)
    G1 = G1.reshape(np_, Q_FAR, np_, Q_FAR)
    # shapes on a panel: 0 = falling from its first node, 1 = rising to its last
    sh = np.stack([1 - xq, xq])
    Wq = wq
    M0 = np.einsum("a,c,iajc->ij", Wq, Wq, G0) * ln[:, None] * ln[None, :]
    S0 = np.einsum("sa,a,tc,c,iajc->istj", sh, Wq, sh, Wq, G0) * ln[:, None, None, None] * ln[None, None, None, :]
    S1 = np.einsum("sa,a,tc,c,iajc->istj", sh, Wq, sh, Wq, G1) * ln[:, None, None, None] * ln[None, None, None, :]

    # near pairs again, with the singularity handled
    xo, wo = clustered01(Q_NEAR)
    for i in range(np_):
        for j in range(np_):
            if abs(i - j) > NEAR_PANELS:
                continue
            ro = p0[i, 0] + seg[i, 0] * xo
            zo = p0[i, 1] + seg[i, 1] * xo
            if i == j:
                # inner integral split at the outer point
                xa = xo[:, None] * xo[None, :]                  # from 0 to the outer point
                wa = xo[:, None] * wo[None, :]
                xb = xo[:, None] + (1 - xo[:, None]) * xo[None, :]
                wb = (1 - xo[:, None]) * wo[None, :]
                xi = np.concatenate([xa, xb], axis=1)
                wi = np.concatenate([wa, wb], axis=1)
            else:
                xi = np.broadcast_to(xo, (Q_NEAR, Q_NEAR))
                wi = np.broadcast_to(wo, (Q_NEAR, Q_NEAR))
            ri = p0[j, 0] + seg[j, 0] * xi
            zi = p0[j, 1] + seg[j, 1] * xi
            g0, g1 = kernels(np.broadcast_to(ro[:, None], ri.shape), np.broadcast_to(zo[:, None], ri.shape), ri, zi, k)
            weight = wo[:, None] * wi * ln[i] * ln[j]
            M0[i, j] = (weight * g0).sum()
            sho = np.stack([1 - xo, xo])
            shi = np.stack([1 - xi, xi])
            for s in range(2):
                for t in range(2):
                    S0[i, s, t, j] = (weight * sho[s][:, None] * shi[t] * g0).sum()
                    S1[i, s, t, j] = (weight * sho[s][:, None] * shi[t] * g1).sum()

    # triangle functions on the interior nodes: node n + 1 joins panels n and n + 1
    N = np_ - 1
    Z = np.zeros((N, N), complex)
    for mt in range(N):
        for nt in range(N):
            total = 0j
            # test: panel mt (rising, shape 1, slope +1/l), panel mt + 1 (falling, shape 0, slope -1/l)
            for pi, si, di in ((mt, 1, 1 / ln[mt]), (mt + 1, 0, -1 / ln[mt + 1])):
                for pj, sj, dj in ((nt, 1, 1 / ln[nt]), (nt + 1, 0, -1 / ln[nt + 1])):
                    tr = tan[pi, 0] * tan[pj, 0]
                    tz = tan[pi, 1] * tan[pj, 1]
                    vec = tr * S1[pi, si, sj, pj] + tz * S0[pi, si, sj, pj]
                    total += 1j * w * MU0 * vec + di * dj * M0[pi, pj] / (1j * w * EPS0)
            Z[mt, nt] = total

    # the gap: a uniform field V / gap on the side of the rod around z = 0
    V = np.zeros(N)
    gs = np.linspace(-gap / 2, gap / 2, 401)
    zn = pts[:, 1]
    for n in range(N):
        # only the side panels carry the gap; a triangle in z
        zm, zc, zp = zn[n], zn[n + 1], zn[n + 2]
        if pts[n + 1, 0] != pts[0, 0] and not (zm < zc < zp):
            continue
        if not (zm < zc < zp):
            continue
        v = np.where(gs < zc, (gs - zm) / (zc - zm), (zp - gs) / (zp - zc))
        V[n] = np.trapezoid(np.clip(v, 0, 1), gs) / gap
    return Z, V


def rod_impedance(length_mm, dia_mm, f_mhz, caps, gap_mm=3.0, refine=1.0):
    """Input impedance in ohms of a lossless rod at f, fed by a gap at its centre."""
    a = dia_mm / 2000
    h = length_mm / 2000
    lam = C0 / (f_mhz * 1e6)
    pts = generator(h, a, caps, gap_mm / 1000, d_edge=a / (5 * refine), growth=1 + 0.4 / refine ** 0.5, d_max=lam / (30 * refine))
    Z, V = assemble(pts, f_mhz * 1e6, gap_mm / 1000)
    Y = V @ np.linalg.solve(Z, V)
    return 1 / Y


def end_correction(length_mm, dia_mm, f_mhz, refine=1.0):
    """How much longer per end an open tube must be to behave like the flat-ended rod, in radii."""
    target = rod_impedance(length_mm, dia_mm, f_mhz, True, refine=refine).imag
    def miss(extra):
        return rod_impedance(length_mm + 2 * extra, dia_mm, f_mhz, False, refine=refine).imag - target
    return brentq(miss, 0.0, dia_mm, xtol=1e-3) / (dia_mm / 2)


if __name__ == "__main__":
    if "--json" in sys.argv:
        # the numbers tests/validate.js compares against, at the finest mesh used here
        t = rod_impedance(149, 3.175, 910.525, False, refine=3.0)
        c = rod_impedance(149, 3.175, 910.525, True, refine=3.0)
        print(json.dumps(dict(tube=[t.real, t.imag], caps=[c.real, c.imag], correction=end_correction(149, 3.175, 910.525, 4.5))))
        sys.exit(0)
    print("One rod, 149 mm x 3.175 mm, 910.525 MHz, 3 mm gap, lossless")
    for r in (0.5, 1.0, 1.5, 2.0, 3.0):
        t = rod_impedance(149, 3.175, 910.525, False, refine=r)
        c = rod_impedance(149, 3.175, 910.525, True, refine=r)
        print(f"  refine {r}: tube {t:.2f}   flat ends {c:.2f}")
    print("End correction per end, in radii (a flat-ended rod acts like a tube this much longer)")
    for L, d, f in ((149, 3.175, 910.525), (140, 3.0, 910.525), (160, 3.0, 910.525), (149, 1.5, 910.525),
                    (149, 6.0, 910.525), (1000, 10.0, 142.0), (1000, 4.0, 142.0)):
        print(f"  L {L} mm, d {d} mm, {f} MHz: {end_correction(L, d, f, 1.5):.3f}")
