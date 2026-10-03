"""Independent Python reference for Sectionlab's plastic bending (numpy; tests only).

The browser engine integrates stress over strips whose exact moments come from its
boundary integration. This reference instead writes each force resultant as a
one-dimensional integral across the depth,

    N = Σ_parts w ∫ σ(ε0 − κ v) b(v) dv,     M = −Σ_parts w ∫ σ(ε0 − κ v) v b(v) dv,

where b(v) is the exact width of the part's primitives (polygons, circular segments,
disks from sectionref.py) along the line at depth v, and integrates it by high-order
Gauss–Legendre between breakpoints (vertices, arc ends and extremes, and the neutral
axis). Only the neutral axis parallel to the bending axis (mode a) is solved here;
for sections symmetric about the bending axis that is also mode (b).

Ramberg–Osgood: ε = σ/E + 0.002 (σ/σ0.2)^n, inverted by vectorised Newton.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.optimize import brentq

import sectionref as R

NODES, WEIGHTS = np.polynomial.legendre.leggauss(400)


def rotate_piece(piece, theta):
    """Express a primitive in the frame whose u axis is at angle θ: rotate by −θ."""
    c, s = math.cos(-theta), math.sin(-theta)
    rot = lambda p: (p[0] * c - p[1] * s, p[0] * s + p[1] * c)
    if piece[0] == "poly":
        return ("poly", [rot(p) for p in piece[1]])
    if piece[0] == "disk":
        return ("disk", rot(piece[1]), piece[2])
    return ("seg", rot(piece[1]), piece[2], piece[3] - theta, piece[4] - theta)


def width(piece, v):
    """Exact width of a primitive along the horizontal line at height v (array v)."""
    v = np.asarray(v, dtype=float)
    kind = piece[0]
    if kind == "poly":
        pts = piece[1]
        xs = []
        for i in range(len(pts)):
            (x0, y0), (x1, y1) = pts[i - 1], pts[i]
            if y0 == y1:
                continue
            lo, hi = min(y0, y1), max(y0, y1)
            t = (v - y0) / (y1 - y0)
            x = np.where((v >= lo) & (v < hi), x0 + t * (x1 - x0), np.nan)
            xs.append(x)
        X = np.sort(np.array(xs), axis=0)  # NaNs sort last
        total = np.zeros_like(v)
        for k in range(0, X.shape[0] - 1, 2):
            seg = X[k + 1] - X[k]
            total += np.where(np.isnan(seg), 0.0, seg)
        return total
    (cx, cy), r = piece[1], piece[2]
    s = np.sqrt(np.clip(r * r - (v - cy) ** 2, 0.0, None))
    a0, a1 = cx - s, cx + s
    if kind == "disk":
        return a1 - a0
    a, b = piece[3], piece[4]
    pa = (cx + r * math.cos(a), cy + r * math.sin(a))
    pb = (cx + r * math.cos(b), cy + r * math.sin(b))
    nx, ny = pb[1] - pa[1], -(pb[0] - pa[0])
    k = nx * pa[0] + ny * pa[1]
    if abs(nx) < 1e-300:
        keep = (ny * v) >= k
        return np.where(keep, a1 - a0, 0.0)
    bound = (k - ny * v) / nx
    if nx > 0:
        lo, hi = np.maximum(a0, bound), a1
    else:
        lo, hi = a0, np.minimum(a1, bound)
    return np.clip(hi - lo, 0.0, None)


def breaks(piece):
    kind = piece[0]
    if kind == "poly":
        return [p[1] for p in piece[1]]
    (cx, cy), r = piece[1], piece[2]
    out = [cy - r, cy + r]
    if kind == "seg":
        out += [cy + r * math.sin(piece[3]), cy + r * math.sin(piece[4])]
    return out


def ro_stress(eps, E, s02, n):
    """Vectorised inverse of ε = σ/E + 0.002 (σ/σ0.2)^n for ε ≥ 0."""
    eps = np.asarray(eps, dtype=float)
    s = np.minimum(E * eps, s02 * np.power(np.maximum(eps, 0) / 0.002, 1 / n))
    for _ in range(100):
        p = 0.002 * np.power(np.maximum(s, 0) / s02, n)
        g = s / E + p - eps
        dg = 1 / E + np.where(s > 0, n * p / np.where(s > 0, s, 1), 0)
        ds = g / dg
        s = np.maximum(s - ds, 0)
        if np.all(np.abs(ds) <= 1e-15 * np.maximum(s, 1e-300)):
            break
    return np.where(eps > 0, s, 0.0)


class Law:
    def __init__(self, m):
        c = m.get("compression") or m
        self.t = (m["E"], m["sigma02"], m["n"], m["eps_lim"])
        self.c = (c["E"], c["sigma02"], c["n"], c["eps_lim"])

    def stress(self, eps):
        eps = np.asarray(eps, dtype=float)
        return np.where(eps >= 0, ro_stress(np.maximum(eps, 0), *self.t[:3]), -ro_stress(np.maximum(-eps, 0), *self.c[:3]))


class Section:
    """A model's parts in the frame of the bending axis, measured from the elastic centroid."""

    def __init__(self, model, angle):
        props = R.properties(model)
        mats = {m["id"]: m for m in model["materials"]}
        self.parts = []
        solids = [p for p in model["parts"] if not p.get("void")]
        for p in model["parts"]:
            pieces, contours = R.part_geometry(p)
            if p.get("void"):
                vm = R.region_moments(pieces)
                pt = (vm[1] / vm[0], vm[2] / vm[0])
                host = next(q for q in solids if R.point_in_contours(R.part_geometry(q)[1], pt))
                law, sign = Law(mats[host["material"]]), -1.0
            else:
                law, sign = Law(mats[p["material"]]), 1.0
            shifted = [(w, R.transform_piece(pc, 0, -props["cx"], -props["cy"])) for w, pc in pieces]
            framed = [(w, rotate_piece(pc, angle)) for w, pc in shifted]
            bks = sorted({b for _, pc in framed for b in breaks(pc)})
            self.parts.append({"id": p["id"], "sign": sign, "law": law, "pieces": framed, "breaks": bks, "lo": bks[0], "hi": bks[-1]})
        self.lo = min(q["lo"] for q in self.parts)
        self.hi = max(q["hi"] for q in self.parts)

    def resultants(self, e0, k):
        N = M = 0.0
        for q in self.parts:
            pts = list(q["breaks"])
            if k != 0:
                na = e0 / k
                if q["lo"] < na < q["hi"]:
                    pts = sorted(set(pts + [na]))
            for a, b in zip(pts[:-1], pts[1:]):
                if b - a <= 0:
                    continue
                v = 0.5 * (a + b) + 0.5 * (b - a) * NODES
                wts = 0.5 * (b - a) * WEIGHTS
                bw = sum(w * width(pc, v) for w, pc in q["pieces"])
                sig = q["law"].stress(e0 - k * v)
                N += q["sign"] * np.sum(wts * sig * bw)
                M -= q["sign"] * np.sum(wts * sig * bw * v)
        return N, M

    def solve_e0(self, k, N):
        f = lambda e: self.resultants(e, k)[0] - N
        a, b = -1e-3, 1e-3
        while f(a) > 0:
            a *= 2
        while f(b) < 0:
            b *= 2
        return brentq(f, a, b, xtol=1e-16, rtol=1e-14, maxiter=200)

    def util(self, e0, k):
        u = 0.0
        for q in self.parts:
            if q["sign"] < 0:
                continue
            for v in (q["lo"], q["hi"]):
                e = e0 - k * v
                u = max(u, e / q["law"].t[3] if e >= 0 else -e / q["law"].c[3])
        return u

    def curve(self, N=0.0, points=9):
        def util_at(k):
            return self.util(self.solve_e0(k, N), k)
        depth = self.hi - self.lo
        lim = min(min(q["law"].t[3], q["law"].c[3]) for q in self.parts if q["sign"] > 0)
        k_hi = 2 * lim / depth
        while util_at(k_hi) < 1:
            k_hi *= 2
        k_lim = brentq(lambda k: util_at(k) - 1, 0.0, k_hi, xtol=1e-18, rtol=1e-13)
        out = []
        for j in range(points):
            k = k_lim * j / (points - 1)
            e0 = self.solve_e0(k, N)
            out.append({"kappa": k, "M": self.resultants(e0, k)[1], "e0": e0})
        return {"kappa_lim": k_lim, "M_lim": out[-1]["M"], "points": out}

    def plastic_moment(self, N=0.0):
        """σ0.2 stress block with the plastic neutral axis parallel to the bending axis."""
        def sums(c):
            F = M = 0.0
            for q in self.parts:
                st, sc = q["law"].t[1], q["law"].c[1]
                for lo, hi, s in ((q["lo"], min(c, q["hi"]), st), (max(c, q["lo"]), q["hi"], -sc)):
                    if hi <= lo:
                        continue
                    pts = [lo] + [b for b in q["breaks"] if lo < b < hi] + [hi]
                    for a, b in zip(pts[:-1], pts[1:]):
                        v = 0.5 * (a + b) + 0.5 * (b - a) * NODES
                        wts = 0.5 * (b - a) * WEIGHTS
                        bw = sum(w * width(pc, v) for w, pc in q["pieces"])
                        F += q["sign"] * s * np.sum(wts * bw)
                        M -= q["sign"] * s * np.sum(wts * bw * v)
            return F, M
        c = brentq(lambda c: sums(c)[0] - N, self.lo, self.hi, xtol=1e-14, rtol=1e-14)
        return {"v": c, "M": sums(c)[1]}


def axis_angle(model, axis):
    if axis == "x":
        return 0.0
    if axis == "y":
        return math.pi / 2
    p = R.properties(model)
    scale = max(abs(p["Ix"]), abs(p["Iy"]))
    if abs(p["Ixy"]) <= 1e-13 * scale:
        theta = 0.0 if p["Ix"] >= p["Iy"] else math.pi / 2
    else:
        theta = 0.5 * math.atan2(-2 * p["Ixy"], p["Ix"] - p["Iy"])
    # Same range as the engine, (−π/2, π/2], so both bend about the same directed axis.
    if theta > math.pi / 2:
        theta -= math.pi
    if theta <= -math.pi / 2:
        theta += math.pi
    return theta if axis == "major" else theta + math.pi / 2  # the engine's minor axis is θ + π/2 too
