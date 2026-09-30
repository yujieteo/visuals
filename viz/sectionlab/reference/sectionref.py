"""Independent Python reference for Sectionlab area properties.

This module does not share code or method with the browser engine. The engine
integrates the exact boundary with Green's theorem; this reference decomposes
each part into primitives with closed-form moments instead:

  polygon            shoelace formulas
  circular segment   sector minus triangle (the region between a chord and its arc)
  disk               full circle

A filleted polygon is the polygon through its tangent points plus (convex
corner) or minus (concave corner) one circular segment per rounded corner; a
hollow shape is its outer region minus its inner region. First moments Q need
the part of the section on one side of a line: polygons are clipped exactly
(Sutherland–Hodgman), and a circular segment or disk is intersected with the
half-planes exactly (disk ∩ convex polygon: the clipped polygon plus the
circular segments cut off by its arcs).

Only the standard library is used, so the page's properties can be checked
without numpy.
"""

from __future__ import annotations

import math

TAU = 2 * math.pi

# ----------------------------------------------------------------------------
# Moments. A moment record is (A, ∫x, ∫y, ∫x², ∫y², ∫xy).
# ----------------------------------------------------------------------------


def zero():
    return [0.0] * 6


def add(acc, m, w=1.0):
    for k in range(6):
        acc[k] += w * m[k]
    return acc


def polygon_moments(pts):
    """Signed moments of a polygon (positive when counter-clockwise)."""
    A = Sx = Sy = Ixx = Iyy = Ixy = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        c = x0 * y1 - x1 * y0
        A += c
        Sy += (x0 + x1) * c
        Sx += (y0 + y1) * c
        Iyy += (x0 * x0 + x0 * x1 + x1 * x1) * c
        Ixx += (y0 * y0 + y0 * y1 + y1 * y1) * c
        Ixy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c
    return [A / 2, Sy / 6, Sx / 6, Iyy / 12, Ixx / 12, Ixy / 24]


def sector_moments(c, r, a, b):
    """Moments of the circular sector from angle a to b (b > a) about the origin."""
    cx, cy = c
    d = b - a
    A = r * r * d / 2
    sx = r ** 3 / 3 * (math.sin(b) - math.sin(a))           # ∫ξ
    sy = r ** 3 / 3 * (math.cos(a) - math.cos(b))           # ∫η
    s2 = (math.sin(2 * b) - math.sin(2 * a)) / 4
    ixx = r ** 4 / 4 * (d / 2 + s2)                          # ∫ξ²
    iyy = r ** 4 / 4 * (d / 2 - s2)                          # ∫η²
    ixy = r ** 4 / 4 * (math.sin(b) ** 2 - math.sin(a) ** 2) / 2
    return [
        A,
        cx * A + sx,
        cy * A + sy,
        cx * cx * A + 2 * cx * sx + ixx,
        cy * cy * A + 2 * cy * sy + iyy,
        cx * cy * A + cx * sy + cy * sx + ixy,
    ]


def circular_segment_moments(c, r, a, b):
    """Region between the chord and the arc from angle a to b (counter-clockwise, b > a)."""
    pa = (c[0] + r * math.cos(a), c[1] + r * math.sin(a))
    pb = (c[0] + r * math.cos(b), c[1] + r * math.sin(b))
    return add(sector_moments(c, r, a, b), polygon_moments([c, pa, pb]), -1.0)


# ----------------------------------------------------------------------------
# Clipping
# ----------------------------------------------------------------------------


def clip_polygon(pts, hp):
    """Keep the part of a polygon where n·p ≥ k, for half-plane hp = (nx, ny, k)."""
    nx, ny, k = hp
    out = []
    n = len(pts)
    for i in range(n):
        cur, prv = pts[i], pts[i - 1]
        sc = nx * cur[0] + ny * cur[1] - k
        sp = nx * prv[0] + ny * prv[1] - k
        if sc >= 0:
            if sp < 0:
                t = sp / (sp - sc)
                out.append((prv[0] + (cur[0] - prv[0]) * t, prv[1] + (cur[1] - prv[1]) * t))
            out.append(cur)
        elif sp >= 0:
            t = sp / (sp - sc)
            out.append((prv[0] + (cur[0] - prv[0]) * t, prv[1] + (cur[1] - prv[1]) * t))
    return out


def disk_convex_moments(c, r, halfplanes):
    """Exact moments of disk(c, r) ∩ {every half-plane}."""
    cx, cy = c
    box = [(cx - 2 * r, cy - 2 * r), (cx + 2 * r, cy - 2 * r), (cx + 2 * r, cy + 2 * r), (cx - 2 * r, cy + 2 * r)]
    P = box
    for hp in halfplanes:
        P = clip_polygon(P, hp)
        if len(P) < 3:
            return zero()
    inside = lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= r * r
    # Walk the polygon, collecting the boundary of P ∩ disk: points on P plus arcs between exits and entries.
    pts = []      # boundary points in order
    arcs = []     # (exit angle, entry angle) pairs
    exit_angle = None
    first_entry = None
    n = len(P)
    crossings = 0
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        if inside(a):
            pts.append(a)
        dx, dy = b[0] - a[0], b[1] - a[1]
        fx, fy = a[0] - cx, a[1] - cy
        qa = dx * dx + dy * dy
        qb = 2 * (fx * dx + fy * dy)
        qc = fx * fx + fy * fy - r * r
        disc = qb * qb - 4 * qa * qc
        if disc <= 0:
            continue
        sq = math.sqrt(disc)
        for t in sorted(((-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa))):
            if 0 < t < 1:
                p = (a[0] + dx * t, a[1] + dy * t)
                ang = math.atan2(p[1] - cy, p[0] - cx)
                entering = (qb + 2 * qa * t) < 0  # distance decreasing → entering the disk
                crossings += 1
                if entering:
                    if exit_angle is None:
                        first_entry = (len(pts), ang)
                    else:
                        arcs.append((exit_angle, ang))
                    pts.append(p)
                    exit_angle = None
                else:
                    pts.append(p)
                    exit_angle = ang
    if crossings == 0:
        if all(inside(p) for p in P):
            return polygon_moments(P)
        # Disk entirely inside P, or disjoint.
        if all(hp[0] * cx + hp[1] * cy - hp[2] >= r * math.hypot(hp[0], hp[1]) for hp in halfplanes):
            return sector_moments(c, r, 0.0, TAU)
        return zero()
    if exit_angle is not None and first_entry is not None:
        arcs.append((exit_angle, first_entry[1]))
    m = polygon_moments(pts)
    for ea, na in arcs:
        sweep = (na - ea) % TAU
        add(m, circular_segment_moments(c, r, ea, ea + sweep))
    return m


# ----------------------------------------------------------------------------
# Regions: a list of (weight, piece). Pieces:
#   ("poly", [(x, y), ...])            counter-clockwise polygon
#   ("seg", (cx, cy), r, a, b)         circular segment, arc a → b counter-clockwise
#   ("disk", (cx, cy), r)
# Contours for meshing and drawing: lists of ("line", p, q) / ("arc", c, r, t0, t1).
# ----------------------------------------------------------------------------


def piece_moments(piece, halfplanes=()):
    kind = piece[0]
    if kind == "poly":
        pts = list(piece[1])
        for hp in halfplanes:
            pts = clip_polygon(pts, hp)
            if len(pts) < 3:
                return zero()
        return polygon_moments(pts)
    if kind == "disk":
        if not halfplanes:
            return sector_moments(piece[1], piece[2], 0.0, TAU)
        return disk_convex_moments(piece[1], piece[2], list(halfplanes))
    _, c, r, a, b = piece
    if not halfplanes:
        return circular_segment_moments(c, r, a, b)
    pa = (c[0] + r * math.cos(a), c[1] + r * math.sin(a))
    pb = (c[0] + r * math.cos(b), c[1] + r * math.sin(b))
    # The segment lies to the right of the directed chord a → b.
    nx, ny = (pb[1] - pa[1]), -(pb[0] - pa[0])
    chord = (nx, ny, nx * pa[0] + ny * pa[1])
    return disk_convex_moments(c, r, [chord, *halfplanes])


def region_moments(region, halfplanes=()):
    acc = zero()
    for w, piece in region:
        add(acc, piece_moments(piece, halfplanes), w)
    return acc


def transform_piece(piece, turn, dx, dy):
    """Rotate by a multiple of 90° (turn = 0..3) then translate."""
    def p(q):
        x, y = q
        for _ in range(turn % 4):
            x, y = -y, x
        return (x + dx, y + dy)
    da = (turn % 4) * math.pi / 2
    kind = piece[0]
    if kind == "poly":
        return ("poly", [p(q) for q in piece[1]])
    if kind == "disk":
        return ("disk", p(piece[1]), piece[2])
    if kind == "seg":
        return ("seg", p(piece[1]), piece[2], piece[3] + da, piece[4] + da)
    if kind == "line":
        return ("line", p(piece[1]), p(piece[2]))
    return ("arc", p(piece[1]), piece[2], piece[3] + da, piece[4] + da)


# ----------------------------------------------------------------------------
# Shapes (written independently of src/shapes.js from the same definitions)
# ----------------------------------------------------------------------------


def fillet(verts, radii):
    """Pieces and contour of a counter-clockwise polygon with a fillet radius per vertex."""
    n = len(verts)
    corners = []
    for i in range(n):
        px, py = verts[i]
        ax, ay = verts[i - 1]
        bx, by = verts[(i + 1) % n]
        e1 = (px - ax, py - ay)
        e2 = (bx - px, by - py)
        l1, l2 = math.hypot(*e1), math.hypot(*e2)
        u1 = (e1[0] / l1, e1[1] / l1)
        u2 = (e2[0] / l2, e2[1] / l2)
        cross = u1[0] * u2[1] - u1[1] * u2[0]
        r = radii[i] if radii else 0.0
        if r == 0:
            corners.append(((px, py), (px, py), None))
            continue
        # Interior angle between the edges; tangent distance r / tan(interior/2).
        interior = math.acos(max(-1.0, min(1.0, -(u1[0] * u2[0] + u1[1] * u2[1]))))
        L = r / math.tan(interior / 2)
        t1 = (px - u1[0] * L, py - u1[1] * L)
        t2 = (px + u2[0] * L, py + u2[1] * L)
        # Centre along the bisector at distance r / sin(interior/2) from the vertex.
        bis = (u2[0] - u1[0], u2[1] - u1[1])
        bl = math.hypot(*bis)
        dist = r / math.sin(interior / 2)
        convex = cross > 0
        # u2 − u1 points to the fillet centre for convex and concave corners alike.
        centre = (px + bis[0] / bl * dist, py + bis[1] / bl * dist)
        corners.append((t1, t2, (centre, r, convex)))
    tangent_points = []
    pieces = []
    contour = []
    for i, (t1, t2, f) in enumerate(corners):
        tangent_points.append(t1)
        if f is not None:
            tangent_points.append(t2)
            centre, r, convex = f
            a1 = math.atan2(t1[1] - centre[1], t1[0] - centre[0])
            a2 = math.atan2(t2[1] - centre[1], t2[0] - centre[0])
            if convex:
                a2 = a1 + (a2 - a1) % TAU
                pieces.append((1.0, ("seg", centre, r, a1, a2)))
                contour.append(("arc", centre, r, a1, a2))
            else:
                a1c = a2 + (a1 - a2) % TAU  # counter-clockwise from t2 to t1
                pieces.append((-1.0, ("seg", centre, r, a2, a1c)))
                contour.append(("arc", centre, r, a1c, a2))
        nxt = corners[(i + 1) % n][0]
        if math.hypot(nxt[0] - t2[0], nxt[1] - t2[1]) > 0:
            contour.append(("line", t2, nxt))
    pieces.insert(0, (1.0, ("poly", tangent_points)))
    return pieces, contour


def centred(verts):
    xs = [p[0] for p in verts]
    ys = [p[1] for p in verts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return [(x - cx, y - cy) for x, y in verts]


def reverse_contour(contour):
    out = []
    for seg in reversed(contour):
        if seg[0] == "line":
            out.append(("line", seg[2], seg[1]))
        else:
            out.append(("arc", seg[1], seg[2], seg[4], seg[3]))
    return out


def shape_geometry(shape, d, radii):
    """(region pieces, contours) of a shape in local coordinates with its bounding box centred."""
    if shape == "rect":
        b, h = d["b"] / 2, d["h"] / 2
        pieces, contour = fillet([(-b, -h), (b, -h), (b, h), (-b, h)], radii)
        return pieces, [contour]
    if shape == "circle":
        r = d["d"] / 2
        return [(1.0, ("disk", (0.0, 0.0), r))], [[("arc", (0.0, 0.0), r, 0.0, TAU)]]
    if shape == "semicircle":
        r = d["d"] / 2
        c = (0.0, -r / 2)
        return [(1.0, ("seg", c, r, 0.0, math.pi))], [[("line", (-r, c[1]), (r, c[1])), ("arc", c, r, 0.0, math.pi)]]
    if shape == "triangle":
        v = centred([(0.0, 0.0), (d["b"], 0.0), (d["a"], d["h"])])
        pieces, contour = fillet(v, radii)
        return pieces, [contour]
    if shape == "trapezoid":
        v = centred([(-d["b"] / 2, 0.0), (d["b"] / 2, 0.0), (d["s"] + d["bt"] / 2, d["h"]), (d["s"] - d["bt"] / 2, d["h"])])
        pieces, contour = fillet(v, radii)
        return pieces, [contour]
    if shape == "polygon":
        n, R = int(d["n"]), d["d"] / 2
        raw = [(R * math.cos(-math.pi / 2 - math.pi / n + TAU * k / n), R * math.sin(-math.pi / 2 - math.pi / n + TAU * k / n)) for k in range(n)]
        pieces, contour = fillet(centred(raw), radii)
        return pieces, [contour]
    if shape == "rhs":
        b, h, t = d["b"] / 2, d["h"] / 2, d["t"]
        po, co = fillet([(-b, -h), (b, -h), (b, h), (-b, h)], radii[:4])
        pi_, ci = fillet([(-b + t, -h + t), (b - t, -h + t), (b - t, h - t), (-b + t, h - t)], radii[4:])
        return po + [(-w, p) for w, p in pi_], [co, reverse_contour(ci)]
    if shape == "chs":
        r, ri = d["d"] / 2, d["d"] / 2 - d["t"]
        return ([(1.0, ("disk", (0.0, 0.0), r)), (-1.0, ("disk", (0.0, 0.0), ri))],
                [[("arc", (0.0, 0.0), r, 0.0, TAU)], [("arc", (0.0, 0.0), ri, TAU, 0.0)]])
    # Phase 2: parallel-flange rolled and built-up shapes, outlines listed counter-clockwise.
    if shape == "ishape":
        b, h, tf, tw = d["b"], d["h"], d["tf"], d["tw"]
        outline = [(0, 0), (b, 0), (b, tf), ((b + tw) / 2, tf), ((b + tw) / 2, h - tf), (b, h - tf), (b, h), (0, h),
                   (0, h - tf), ((b - tw) / 2, h - tf), ((b - tw) / 2, tf), (0, tf)]
    elif shape == "channel":
        b, h, tf, tw = d["b"], d["h"], d["tf"], d["tw"]
        outline = [(0, 0), (b, 0), (b, tf), (tw, tf), (tw, h - tf), (b, h - tf), (b, h), (0, h)]
    elif shape == "angle":
        b, h, t = d["b"], d["h"], d["t"]
        outline = [(0, 0), (b, 0), (b, t), (t, t), (t, h), (0, h)]
    elif shape == "tee":
        b, h, tf, tw = d["b"], d["h"], d["tf"], d["tw"]
        x0 = (b - tw) / 2
        outline = [(x0, 0), (x0 + tw, 0), (x0 + tw, h - tf), (b, h - tf), (b, h), (0, h), (0, h - tf), (x0, h - tf)]
    elif shape == "zed":
        b, h, tf, tw = d["b"], d["h"], d["tf"], d["tw"]
        s = b - tw  # the top flange overhangs the web to the left by b − tw
        outline = [(s, 0), (s + b, 0), (s + b, tf), (s + tw, tf), (s + tw, h), (0, h), (0, h - tf), (s, h - tf)]
    elif shape == "cross":
        b, h, tb, th = d["b"], d["h"], d["tb"], d["th"]
        xl, xr, yb, yt = (b - th) / 2, (b + th) / 2, (h - tb) / 2, (h + tb) / 2
        outline = [(b, yb), (b, yt), (xr, yt), (xr, h), (xl, h), (xl, yt), (0, yt), (0, yb), (xl, yb), (xl, 0), (xr, 0), (xr, yb)]
    else:
        raise ValueError(f"reference has no geometry for shape {shape!r}")
    pieces, contour = fillet(centred([(float(x), float(y)) for x, y in outline]), radii)
    return pieces, [contour]


def part_geometry(part):
    pieces, contours = shape_geometry(part["shape"], part["dims"], part.get("radii") or [])
    turn = part.get("orientation", 0) // 90
    dx, dy = part.get("x", 0.0), part.get("y", 0.0)
    return ([(w, transform_piece(p, turn, dx, dy)) for w, p in pieces],
            [[transform_piece(s, turn, dx, dy) for s in k] for k in contours])


# ----------------------------------------------------------------------------
# Section properties
# ----------------------------------------------------------------------------


def point_in_contours(contours, point, tol=1e-6):
    """Even-odd test of a point against contours, arcs replaced by fine chords."""
    x, y = point
    inside = False
    for k in contours:
        pts = []
        for s in k:
            if s[0] == "line":
                pts.append(s[1])
            else:
                _, c, r, t0, t1 = s
                n = max(8, int(abs(t1 - t0) / 0.01))
                pts += [(c[0] + r * math.cos(t0 + (t1 - t0) * i / n), c[1] + r * math.sin(t0 + (t1 - t0) * i / n)) for i in range(n)]
        for i in range(len(pts)):
            (x0, y0), (x1, y1) = pts[i - 1], pts[i]
            if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
                inside = not inside
    return inside


def properties(model):
    """Transformed-section properties of a normalised model, about the centroid."""
    mats = {m["id"]: m for m in model["materials"]}
    E_base = model.get("E_base") or model["materials"][0]["E"]
    parts = model["parts"]
    geo = {p["id"]: part_geometry(p) for p in parts}
    weights = {}
    for p in parts:
        if p.get("void"):
            # The host is the solid containing the void's centroid.
            vm = region_moments(geo[p["id"]][0])
            point = (vm[1] / vm[0], vm[2] / vm[0])
            host = next(q for q in parts if not q.get("void") and point_in_contours(geo[q["id"]][1], point))
            weights[p["id"]] = -mats[host["material"]]["E"] / E_base
        else:
            weights[p["id"]] = mats[p["material"]]["E"] / E_base
    total = zero()
    for p in parts:
        add(total, region_moments(geo[p["id"]][0]), weights[p["id"]])
    A, Sy, Sx = total[0], total[1], total[2]
    cx, cy = Sy / A, Sx / A
    Ix = total[4] - cy * cy * A
    Iy = total[3] - cx * cx * A
    Ixy = total[5] - cx * cy * A
    Qx = 0.0
    Qy = 0.0
    for p in parts:
        above = region_moments(geo[p["id"]][0], [(0.0, 1.0, cy)])
        left = region_moments(geo[p["id"]][0], [(-1.0, 0.0, -cx)])
        Qx += weights[p["id"]] * (above[2] - cy * above[0])
        Qy += weights[p["id"]] * (cx * left[0] - left[1])
    avg, dif = (Ix + Iy) / 2, (Ix - Iy) / 2
    rad = math.hypot(dif, Ixy)
    ext = extents([k for p in parts if not p.get("void") for k in geo[p["id"]][1]])
    x0, x1, y0, y1 = ext
    return {
        "A": A, "cx": cx, "cy": cy, "Ix": Ix, "Iy": Iy, "Ixy": Ixy,
        "I1": avg + rad, "I2": avg - rad,
        "Sx_top": Ix / (y1 - cy), "Sx_bottom": Ix / (cy - y0), "Sy_right": Iy / (x1 - cx), "Sy_left": Iy / (cx - x0),
        "rx": math.sqrt(Ix / A), "ry": math.sqrt(Iy / A), "Ip": Ix + Iy, "rp": math.sqrt((Ix + Iy) / A),
        "Qx": Qx, "Qy": Qy,
    }


def extents(contours):
    xs, ys = [], []
    for k in contours:
        for s in k:
            if s[0] == "line":
                xs += [s[1][0], s[2][0]]
                ys += [s[1][1], s[2][1]]
            else:
                _, c, r, t0, t1 = s
                a, b = min(t0, t1), max(t0, t1)
                for t in (t0, t1):
                    xs.append(c[0] + r * math.cos(t))
                    ys.append(c[1] + r * math.sin(t))
                for q in range(-8, 9):
                    t = q * math.pi / 2
                    if a <= t <= b:
                        xs.append(c[0] + r * math.cos(t))
                        ys.append(c[1] + r * math.sin(t))
    return min(xs), max(xs), min(ys), max(ys)
