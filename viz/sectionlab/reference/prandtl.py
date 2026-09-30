"""Numerical Prandtl torsion reference (numpy and scipy; used by the tests only).

Solves the Prandtl stress-function problem on a section

    ∇²φ = −2 in the section,  φ = 0 on the outer boundary,  φ = K_i on hole i,

where each K_i is free and set by the circulation condition. In weak form every
hole's boundary nodes share one unknown K_i loaded by 2·A_i (A_i the hole's
area), and the torsion constant is J = 2∫φ dA + 2 Σ K_i A_i = fᵀφ.

Discretisation: linear triangles. A coarse mesh (boundary points spaced h,
interior points on a triangular lattice, Delaunay, triangles outside the section
dropped) is refined uniformly; each refinement splits every triangle into four and
moves new boundary midpoints onto the true arcs. J from the finest levels is
extrapolated with the observed convergence order (Richardson), and the
difference from the plain extrapolation is kept as the error estimate.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve
from scipy.spatial import Delaunay

import sectionref as R


def _discretise(contours, h):
    """Boundary points and edges; each edge remembers its arc (centre, r) or None."""
    pts, edges, owners = [], [], []
    for ci, contour in enumerate(contours):
        start = len(pts)
        for s in contour:
            if s[0] == "line":
                p, q = s[1], s[2]
                n = max(1, math.ceil(math.hypot(q[0] - p[0], q[1] - p[1]) / h))
                for k in range(n):
                    pts.append((p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n))
                    owners.append((ci, None))
            else:
                _, c, r, t0, t1 = s
                n = max(2, math.ceil(r * abs(t1 - t0) / h))
                for k in range(n):
                    t = t0 + (t1 - t0) * k / n
                    pts.append((c[0] + r * math.cos(t), c[1] + r * math.sin(t)))
                    owners.append((ci, (c, r)))
        count = len(pts) - start
        for k in range(count):
            i, j = start + k, start + (k + 1) % count
            edges.append((i, j, ci, owners[i][1]))
    return pts, edges


def _inside(points, polys):
    """Even–odd point-in-polygon for many points against polygon loops."""
    x, y = points[:, 0], points[:, 1]
    inside = np.zeros(len(points), dtype=bool)
    for poly in polys:
        p = np.asarray(poly)
        q = np.roll(p, -1, axis=0)
        for (x0, y0), (x1, y1) in zip(p, q):
            cond = (y0 > y) != (y1 > y)
            with np.errstate(divide="ignore", invalid="ignore"):
                xc = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
            inside ^= cond & (x < xc)
    return inside


def _dist_to_polys(points, polys):
    best = np.full(len(points), np.inf)
    for poly in polys:
        p = np.asarray(poly)
        q = np.roll(p, -1, axis=0)
        for a, b in zip(p, q):
            ab = b - a
            t = np.clip(((points - a) @ ab) / (ab @ ab), 0, 1)
            d = np.hypot(*(points - (a + t[:, None] * ab)).T)
            best = np.minimum(best, d)
    return best


def coarse_mesh(contours, h):
    bpts, bedges = _discretise(contours, h)
    loops = {}
    for i, j, ci, _ in bedges:
        loops.setdefault(ci, []).append(bpts[i])
    polys = list(loops.values())
    xs = [p[0] for p in bpts]
    ys = [p[1] for p in bpts]
    dy = h * math.sqrt(3) / 2
    lattice = []
    row = 0
    y = min(ys) + dy / 2
    while y < max(ys):
        x = min(xs) + (h / 2 if row % 2 else 0) + h / 4
        while x < max(xs):
            lattice.append((x, y))
            x += h
        y += dy
        row += 1
    lattice = np.array(lattice) if lattice else np.zeros((0, 2))
    if len(lattice):
        keep = _inside(lattice, polys) & (_dist_to_polys(lattice, polys) > 0.55 * h)
        lattice = lattice[keep]
    P = np.vstack([np.array(bpts), lattice])
    tri = Delaunay(P).simplices
    cent = P[tri].mean(axis=1)
    tri = tri[_inside(cent, polys)]
    # Every boundary edge must be an edge of the triangulation.
    have = set()
    for a, b, c in tri:
        for u, v in ((a, b), (b, c), (c, a)):
            have.add((min(u, v), max(u, v)))
    missing = [e for e in bedges if (min(e[0], e[1]), max(e[0], e[1])) not in have]
    if missing:
        raise RuntimeError(f"coarse mesh lost {len(missing)} boundary edges; use a smaller h")
    tri = _orient(P, tri)
    return {"P": P, "T": tri, "B": [(i, j, ci, arc) for i, j, ci, arc in bedges]}


def _orient(P, T):
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    area = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    T = T.copy()
    flip = area < 0
    T[flip] = T[flip][:, [0, 2, 1]]
    return T


def refine(mesh):
    P, T, B = mesh["P"], mesh["T"], mesh["B"]
    edge_mid = {}
    newP = [tuple(p) for p in P]
    arc_of = {(min(i, j), max(i, j)): arc for i, j, _, arc in B}

    def mid(i, j):
        key = (min(i, j), max(i, j))
        if key in edge_mid:
            return edge_mid[key]
        m = ((P[i][0] + P[j][0]) / 2, (P[i][1] + P[j][1]) / 2)
        arc = arc_of.get(key)
        if arc is not None:
            (cx, cy), r = arc
            d = math.hypot(m[0] - cx, m[1] - cy)
            m = (cx + (m[0] - cx) * r / d, cy + (m[1] - cy) * r / d)
        newP.append(m)
        edge_mid[key] = len(newP) - 1
        return edge_mid[key]

    newT = []
    for a, b, c in T:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        newT += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
    newB = []
    for i, j, ci, arc in B:
        m = edge_mid[(min(i, j), max(i, j))]
        newB += [(i, m, ci, arc), (m, j, ci, arc)]
    return {"P": np.array(newP), "T": _orient(np.array(newP), np.array(newT)), "B": newB}


def solve(mesh, outer):
    """J on one mesh. outer: the contour indices that form outer boundaries (φ = 0)."""
    P, T, B = mesh["P"], mesh["T"], mesh["B"]
    n = len(P)
    # Map every hole's boundary nodes onto one shared unknown.
    dof = np.arange(n)
    fixed = np.zeros(n, dtype=bool)
    holes = {}
    for i, j, ci, _ in B:
        if ci in outer:
            fixed[i] = fixed[j] = True
        else:
            holes.setdefault(ci, set()).update((i, j))
    for ci, nodes in holes.items():
        nodes = sorted(nodes)
        dof[nodes] = nodes[0]
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    area = 0.5 * ((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]))
    bx = np.stack([b[:, 1] - c[:, 1], c[:, 1] - a[:, 1], a[:, 1] - b[:, 1]], axis=1)
    cy = np.stack([c[:, 0] - b[:, 0], a[:, 0] - c[:, 0], b[:, 0] - a[:, 0]], axis=1)
    Ke = (bx[:, :, None] * bx[:, None, :] + cy[:, :, None] * cy[:, None, :]) / (4 * area[:, None, None])
    D = dof[T]
    rows = np.repeat(D, 3, axis=1).ravel()
    cols = np.tile(D, (1, 3)).ravel()
    K = coo_matrix((Ke.ravel(), (rows, cols)), shape=(n, n)).tocsr()
    f = np.zeros(n)
    np.add.at(f, D.ravel(), np.repeat(2 * area / 3, 3))
    # Hole load 2·A_hole, with the hole area enclosed by its discretised boundary.
    for ci, nodes in holes.items():
        loop = [(i, j) for i, j, cc, _ in B if cc == ci]
        ah = 0.5 * sum(P[i][0] * P[j][1] - P[j][0] * P[i][1] for i, j in loop)
        f[dof[loop[0][0]]] += 2 * abs(ah)
    active = np.unique(dof[~fixed])
    phi = np.zeros(n)
    phi[active] = spsolve(K[active][:, active].tocsc(), f[active])
    return float(f[active] @ phi[active]), int(len(active))


def torsion_constant(contours, h, levels=3):
    """Extrapolated J with an error estimate, from a coarse mesh and `levels` refinements."""
    outer = {ci for ci, k in enumerate(contours) if _signed_area(k) > 0}
    mesh = coarse_mesh(contours, h)
    Js, sizes = [], []
    for level in range(levels + 1):
        if level:
            mesh = refine(mesh)
        J, ndof = solve(mesh, outer)
        Js.append(J)
        sizes.append(ndof)
    # Richardson with the observed order where it is sensible, else order 2.
    J0, J1, J2 = Js[-3], Js[-2], Js[-1]
    p = 2.0
    if (J1 - J0) != 0 and (J2 - J1) != 0 and (J1 - J0) / (J2 - J1) > 1:
        p = min(4.0, max(1.0, math.log2((J1 - J0) / (J2 - J1))))
    Jx = J2 + (J2 - J1) / (2 ** p - 1)
    J2x = J2 + (J2 - J1) / 3
    err = max(abs(Jx - J2x), abs(Jx - J2) * 0.05)
    return {"J": Jx, "error": err, "order": p, "levels": Js, "dofs": sizes}


def _signed_area(contour):
    pts = []
    for s in contour:
        if s[0] == "line":
            pts.append(s[1])
        else:
            _, c, r, t0, t1 = s
            n = max(8, int(abs(t1 - t0) / 0.05))
            pts += [(c[0] + r * math.cos(t0 + (t1 - t0) * i / n), c[1] + r * math.sin(t0 + (t1 - t0) * i / n)) for i in range(n)]
    return 0.5 * sum(pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1] for i in range(len(pts)))


def shape_torsion(shape, dims, radii, h=None, levels=3):
    _, contours = R.shape_geometry(shape, dims, radii)
    if h is None:
        x0, x1, y0, y1 = R.extents(contours)
        h = min(max(x1 - x0, y1 - y0) / 24, min(x1 - x0, y1 - y0) / 8)
        # At least 2.5 coarse elements through the thinnest wall, plate or flange.
        walls = [dims[k] for k in ("t", "tf", "tw", "tb", "th") if k in dims]
        if walls:
            h = min(h, min(walls) / 2.5)
    return torsion_constant(contours, h, levels)
