/* Sectionlab geometry: exact boundaries made of straight lines and circular arcs.
 *
 * A region is a list of closed contours. Each contour is a list of segments with
 * the region on its left, so outer boundaries run counter-clockwise and holes
 * clockwise. Segments are
 *   { type: "line", a: [x, y], b: [x, y] }
 *   { type: "arc", c: [x, y], r, t0, t1 }   (angle t runs from t0 to t1; t1 > t0 is counter-clockwise)
 *
 * Area integrals use Green's theorem in the form
 *   ∫∫ u^i v^j dA = ∮ u^(i+1)/(i+1) · v^j dv,
 * so a boundary piece contributes only through dv. Restricting the boundary to
 * the pieces with vmin ≤ v ≤ vmax therefore integrates exactly over the part of
 * the region inside that slab: the cut lines v = const would add nothing.
 * Every piece is integrated by 16-point Gauss–Legendre, which is exact for the
 * polynomial integrands on lines and, on arcs split to at most π/8, accurate to
 * far below double-precision rounding (the integrands are entire functions).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.SectionLab = root.SectionLab || {}).geometry = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TAU = 2 * Math.PI;

  // 16-point Gauss–Legendre nodes and weights on [-1, 1].
  const GL_X = [-0.9894009349916499, -0.9445750230732326, -0.8656312023878318, -0.7554044083550030,
    -0.6178762444026438, -0.4580167776572274, -0.2816035507792589, -0.0950125098376374,
    0.0950125098376374, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438,
    0.7554044083550030, 0.8656312023878318, 0.9445750230732326, 0.9894009349916499];
  const GL_W = [0.0271524594117541, 0.0622535239386479, 0.0951585116824928, 0.1246289712555339,
    0.1495959888165767, 0.1691565193950025, 0.1826034150449236, 0.1894506104550685,
    0.1894506104550685, 0.1826034150449236, 0.1691565193950025, 0.1495959888165767,
    0.1246289712555339, 0.0951585116824928, 0.0622535239386479, 0.0271524594117541];

  const line = (a, b) => ({ type: "line", a: [a[0], a[1]], b: [b[0], b[1]] });
  const arc = (c, r, t0, t1) => ({ type: "arc", c: [c[0], c[1]], r, t0, t1 });

  const segStart = (s) => (s.type === "line" ? s.a : [s.c[0] + s.r * Math.cos(s.t0), s.c[1] + s.r * Math.sin(s.t0)]);
  const segEnd = (s) => (s.type === "line" ? s.b : [s.c[0] + s.r * Math.cos(s.t1), s.c[1] + s.r * Math.sin(s.t1)]);

  function reverseContour(segments) {
    return segments.slice().reverse().map((s) => (s.type === "line" ? line(s.b, s.a) : arc(s.c, s.r, s.t1, s.t0)));
  }

  /* Rotate by angle θ (counter-clockwise) about the origin, then translate by (dx, dy). */
  function transformSegment(s, theta, dx, dy) {
    const c = Math.cos(theta), sn = Math.sin(theta);
    const p = (q) => [q[0] * c - q[1] * sn + dx, q[0] * sn + q[1] * c + dy];
    return s.type === "line" ? line(p(s.a), p(s.b)) : arc(p(s.c), s.r, s.t0 + theta, s.t1 + theta);
  }
  const transformContours = (contours, theta, dx, dy) => contours.map((k) => k.map((s) => transformSegment(s, theta, dx, dy)));

  /* Express contours in a frame whose u axis points at angle θ from x: u = x cosθ + y sinθ, v = −x sinθ + y cosθ. */
  const toFrame = (contours, theta, ox = 0, oy = 0) => transformContours(transformContours(contours, 0, -ox, -oy), -theta, 0, 0);

  /* Exact 90° turns keep the axis-aligned inputs free of cos(π/2) rounding. */
  function quarterTurn(contours, turns) {
    const k = ((turns % 4) + 4) % 4;
    if (k === 0) return contours;
    const p = (q) => (k === 1 ? [-q[1], q[0]] : k === 2 ? [-q[0], -q[1]] : [q[1], -q[0]]);
    const dt = (k * Math.PI) / 2;
    return contours.map((kk) => kk.map((s) => (s.type === "line" ? line(p(s.a), p(s.b)) : arc(p(s.c), s.r, s.t0 + dt, s.t1 + dt))));
  }

  /* Parameter intervals of a segment on which lo ≤ v ≤ hi (v is the y coordinate). */
  function lineIntervals(s, lo, hi) {
    const va = s.a[1], vb = s.b[1];
    const dv = vb - va;
    if (dv === 0) return [];
    let t0 = (lo - va) / dv, t1 = (hi - va) / dv;
    if (t0 > t1) [t0, t1] = [t1, t0];
    t0 = Math.max(0, t0); t1 = Math.min(1, t1);
    return t1 > t0 ? [[t0, t1]] : [];
  }

  function arcIntervals(s, lo, hi) {
    const a = Math.min(s.t0, s.t1), b = Math.max(s.t0, s.t1);
    const cuts = [a, b];
    for (const level of [lo, hi]) {
      if (!Number.isFinite(level)) continue;
      const q = (level - s.c[1]) / s.r;
      if (q <= -1 || q >= 1) continue;
      const base = Math.asin(q);
      for (const t of [base, Math.PI - base]) {
        const k0 = Math.ceil((a - t) / TAU), k1 = Math.floor((b - t) / TAU);
        for (let k = k0; k <= k1; k++) { const x = t + k * TAU; if (x > a && x < b) cuts.push(x); }
      }
    }
    cuts.sort((p, q) => p - q);
    const out = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const p = cuts[i], q = cuts[i + 1];
      if (!(q > p)) continue;
      const v = s.c[1] + s.r * Math.sin((p + q) / 2);
      if (v >= lo && v <= hi) out.push([p, q]);
    }
    return out;
  }

  /* Add ∮ u^(i+1)/(i+1) (v − shift)^j dv over one segment's pieces inside the slab to acc[i][j]. */
  function accumulate(acc, s, lo, hi, shift, ni, nj) {
    const pieces = s.type === "line" ? lineIntervals(s, lo, hi) : arcIntervals(s, lo, hi);
    const reversed = s.type === "arc" && s.t1 < s.t0;
    for (const [p0, p1] of pieces) {
      let parts = 1;
      if (s.type === "arc") parts = Math.max(1, Math.ceil((p1 - p0) / (Math.PI / 8)));
      const h = (p1 - p0) / parts;
      for (let k = 0; k < parts; k++) {
        const m = p0 + (k + 0.5) * h, half = h / 2;
        for (let g = 0; g < 16; g++) {
          const t = m + half * GL_X[g];
          let u, v, dv;
          if (s.type === "line") {
            u = s.a[0] + t * (s.b[0] - s.a[0]);
            v = s.a[1] + t * (s.b[1] - s.a[1]);
            dv = s.b[1] - s.a[1];
          } else {
            const ct = Math.cos(t), st = Math.sin(t);
            u = s.c[0] + s.r * ct;
            v = s.c[1] + s.r * st;
            dv = s.r * ct * (reversed ? -1 : 1);
          }
          const w = GL_W[g] * half * dv;
          const vv = v - shift;
          let up = u;
          for (let i = 0; i < ni; i++) {
            let vp = 1;
            const base = (up / (i + 1)) * w;
            for (let j = 0; j < nj; j++) { acc[i][j] += base * vp; vp *= vv; }
            up *= u;
          }
        }
      }
    }
  }

  /* m[i][j] = ∫∫ u^i (v − shift)^j dA over the region ∩ {lo ≤ v ≤ hi}, for i < ni, j < nj.
     The contours must already be in the (u, v) frame. */
  function moments(contours, { lo = -Infinity, hi = Infinity, shift = 0, ni = 3, nj = 3 } = {}) {
    const acc = Array.from({ length: ni }, () => new Array(nj).fill(0));
    for (const k of contours) for (const s of k) accumulate(acc, s, lo, hi, shift, ni, nj);
    return acc;
  }

  const area = (contours) => moments(contours, { ni: 1, nj: 1 })[0][0];

  /* Extent of the region along direction (dx, dy): max and min of x·dx + y·dy over the boundary. */
  function extent(contours, dx = 0, dy = 1) {
    let lo = Infinity, hi = -Infinity;
    const take = (p) => { const z = p[0] * dx + p[1] * dy; if (z < lo) lo = z; if (z > hi) hi = z; };
    const len = Math.hypot(dx, dy);
    const dir = Math.atan2(dy, dx);
    for (const k of contours) for (const s of k) {
      take(segStart(s)); take(segEnd(s));
      if (s.type === "arc") {
        const a = Math.min(s.t0, s.t1), b = Math.max(s.t0, s.t1);
        for (const t0 of [dir, dir + Math.PI]) {
          for (let k2 = Math.ceil((a - t0) / TAU); t0 + k2 * TAU <= b; k2++) {
            const t = t0 + k2 * TAU;
            take([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]);
          }
        }
      }
    }
    return { lo: lo / len, hi: hi / len };
  }

  function bbox(contours) {
    const x = extent(contours, 1, 0), y = extent(contours, 0, 1);
    return { x0: x.lo, x1: x.hi, y0: y.lo, y1: y.hi };
  }

  /* Values of v at which the boundary has a vertex or a turning point: natural strip breaks. */
  function breakLevels(contours) {
    const out = [];
    for (const k of contours) for (const s of k) {
      out.push(segStart(s)[1], segEnd(s)[1]);
      if (s.type === "arc") {
        const a = Math.min(s.t0, s.t1), b = Math.max(s.t0, s.t1);
        for (const t0 of [Math.PI / 2, -Math.PI / 2]) {
          for (let k2 = Math.ceil((a - t0) / TAU); t0 + k2 * TAU <= b; k2++) out.push(s.c[1] + s.r * Math.sin(t0 + k2 * TAU));
        }
      }
    }
    return out;
  }

  /* A polygon with an optional fillet radius at every vertex (vertices counter-clockwise).
     Convex corners get arcs turning left, concave corners arcs turning right. Returns the
     contour and, per corner, the vertex and a point on the fillet for picking. */
  function filletedPolygon(vertices, radii, label = "Corner") {
    const n = vertices.length;
    const info = [];
    for (let i = 0; i < n; i++) {
      const p = vertices[i], prev = vertices[(i + n - 1) % n], next = vertices[(i + 1) % n];
      const l1 = Math.hypot(p[0] - prev[0], p[1] - prev[1]), l2 = Math.hypot(next[0] - p[0], next[1] - p[1]);
      if (!(l1 > 0) || !(l2 > 0)) throw new RangeError(`${label} ${i + 1}: two corners coincide.`);
      const d1 = [(p[0] - prev[0]) / l1, (p[1] - prev[1]) / l1], d2 = [(next[0] - p[0]) / l2, (next[1] - p[1]) / l2];
      const cross = d1[0] * d2[1] - d1[1] * d2[0], dot = d1[0] * d2[0] + d1[1] * d2[1];
      const turn = Math.atan2(cross, dot); // exterior angle, + for a convex (left) turn
      const r = radii ? radii[i] || 0 : 0;
      if (r > 0 && Math.abs(turn) < 1e-12) throw new RangeError(`${label} ${i + 1} is straight and cannot be rounded.`);
      const L = r > 0 ? r * Math.tan(Math.abs(turn) / 2) : 0;
      info.push({ p, d1, d2, turn, r, L, l2 });
    }
    for (let i = 0; i < n; i++) {
      const a = info[i], b = info[(i + 1) % n];
      if (a.L + b.L > a.l2 * (1 + 1e-12)) {
        throw new RangeError(`${label} radii ${i + 1} and ${((i + 1) % n) + 1} are too large for the edge between them.`);
      }
    }
    const segs = [];
    const corners = [];
    const starts = info.map((c) => [c.p[0] + c.d2[0] * c.L, c.p[1] + c.d2[1] * c.L]);
    const ends = info.map((c) => [c.p[0] - c.d1[0] * c.L, c.p[1] - c.d1[1] * c.L]);
    for (let i = 0; i < n; i++) {
      const c = info[i];
      if (c.r > 0) {
        const left = [-c.d1[1], c.d1[0]];
        const sgn = c.turn > 0 ? 1 : -1;
        const centre = [ends[i][0] + sgn * c.r * left[0], ends[i][1] + sgn * c.r * left[1]];
        const t0 = Math.atan2(ends[i][1] - centre[1], ends[i][0] - centre[0]);
        const t1 = t0 + c.turn;
        segs.push(arc(centre, c.r, t0, t1));
        const tm = (t0 + t1) / 2;
        corners.push({ vertex: c.p, at: [centre[0] + c.r * Math.cos(tm), centre[1] + c.r * Math.sin(tm)] });
      } else {
        corners.push({ vertex: c.p, at: c.p });
      }
      const j = (i + 1) % n;
      const a = starts[i], b = ends[j];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-12 * c.l2) segs.push(line(a, b));
    }
    return { contour: segs, corners };
  }

  const circle = (c, r, ccw = true) => [ccw ? arc(c, r, 0, TAU) : arc(c, r, TAU, 0)];

  /* Chord polygon of a contour: arcs are split so no chord deviates more than tol from the arc. */
  function polygonize(contour, tol) {
    const pts = [];
    for (const s of contour) {
      if (s.type === "line") { pts.push(s.a); continue; }
      const sweep = Math.abs(s.t1 - s.t0);
      const step = 2 * Math.acos(Math.max(-1, 1 - Math.min(tol / s.r, 1)));
      const n = Math.max(2, Math.ceil(sweep / Math.max(step, 1e-3)));
      for (let k = 0; k < n; k++) {
        const t = s.t0 + ((s.t1 - s.t0) * k) / n;
        pts.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]);
      }
    }
    // Drop repeated points.
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-12) out.push(p);
    }
    if (out.length > 1) {
      const a = out[0], b = out[out.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-12) out.pop();
    }
    return out;
  }

  const signedArea = (pts) => {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  };

  /* Ear-clip a simple polygon into triangles (orientation is normalised to counter-clockwise). */
  function triangulate(poly) {
    let pts = signedArea(poly) < 0 ? poly.slice().reverse() : poly.slice();
    const tris = [];
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const scale = pts.reduce((m, p) => Math.max(m, Math.abs(p[0]), Math.abs(p[1])), 1);
    const eps = 1e-14 * scale * scale;
    // Remove collinear vertices first.
    let changed = true;
    while (changed && pts.length > 3) {
      changed = false;
      for (let i = 0; i < pts.length && pts.length > 3; i++) {
        const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        if (Math.abs(cross(a, b, c)) <= eps) { pts.splice(i, 1); changed = true; i--; }
      }
    }
    const inside = (p, a, b, c) => cross(a, b, p) >= -eps && cross(b, c, p) >= -eps && cross(c, a, p) >= -eps;
    let guard = 0;
    while (pts.length > 3 && guard++ < 100000) {
      let clipped = false;
      for (let i = 0; i < pts.length; i++) {
        const ia = (i + pts.length - 1) % pts.length, ic = (i + 1) % pts.length;
        const a = pts[ia], b = pts[i], c = pts[ic];
        if (cross(a, b, c) <= eps) continue;
        let ok = true;
        for (let k = 0; k < pts.length && ok; k++) {
          if (k === ia || k === i || k === ic) continue;
          const p = pts[k];
          if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === c[0] && p[1] === c[1])) continue;
          if (inside(p, a, b, c)) ok = false;
        }
        if (!ok) continue;
        tris.push([a, b, c]);
        pts.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) {
        // Degenerate remainder: fan it (only reached for nearly collinear leftovers).
        for (let i = 1; i + 1 < pts.length; i++) tris.push([pts[0], pts[i], pts[i + 1]]);
        return tris;
      }
    }
    if (pts.length === 3) tris.push(pts);
    return tris;
  }

  /* Area of the intersection of two convex counter-clockwise polygons (Sutherland–Hodgman). */
  function convexIntersectionArea(p, q) {
    let out = p;
    for (let i = 0; i < q.length && out.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      const side = (x) => (b[0] - a[0]) * (x[1] - a[1]) - (b[1] - a[1]) * (x[0] - a[0]);
      const input = out;
      out = [];
      for (let k = 0; k < input.length; k++) {
        const cur = input[k], prv = input[(k + input.length - 1) % input.length];
        const sc = side(cur), sp = side(prv);
        if (sc >= 0) {
          if (sp < 0) out.push(lerp(prv, cur, sp / (sp - sc)));
          out.push(cur);
        } else if (sp >= 0) out.push(lerp(prv, cur, sp / (sp - sc)));
      }
    }
    return out.length >= 3 ? Math.abs(signedArea(out)) : 0;
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  const triBox = (t) => ({ x0: Math.min(t[0][0], t[1][0], t[2][0]), x1: Math.max(t[0][0], t[1][0], t[2][0]), y0: Math.min(t[0][1], t[1][1], t[2][1]), y1: Math.max(t[0][1], t[1][1], t[2][1]) });

  /* Area shared by two simple polygons, via their triangulations. */
  function polygonIntersectionArea(ta, tb) {
    let s = 0;
    for (const a of ta) {
      const ba = a.box || (a.box = triBox(a));
      for (const b of tb) {
        const bb = b.box || (b.box = triBox(b));
        if (ba.x1 <= bb.x0 || bb.x1 <= ba.x0 || ba.y1 <= bb.y0 || bb.y1 <= ba.y0) continue;
        s += convexIntersectionArea(a, b);
      }
    }
    return s;
  }

  /* Polygonal model of a region for overlap tests: outer and hole polygons with their triangles.
     Holes are assumed to lie inside the outer boundary and not to overlap one another. */
  function polyRegion(contours, tol) {
    const outers = [], holes = [];
    for (const k of contours) {
      const pts = polygonize(k, tol);
      if (pts.length < 3) continue;
      const a = signedArea(pts);
      const entry = { pts, area: Math.abs(a), tris: triangulate(pts) };
      (a >= 0 ? outers : holes).push(entry);
    }
    return { outers, holes };
  }

  /* Shared area of two polygonal regions by inclusion–exclusion over outers and holes. */
  function regionIntersectionArea(A, B) {
    let s = 0;
    for (const a of A.outers) for (const b of B.outers) s += polygonIntersectionArea(a.tris, b.tris);
    for (const a of A.outers) for (const h of B.holes) s -= polygonIntersectionArea(a.tris, h.tris);
    for (const h of A.holes) for (const b of B.outers) s -= polygonIntersectionArea(h.tris, b.tris);
    for (const h of A.holes) for (const g of B.holes) s += polygonIntersectionArea(h.tris, g.tris);
    return s;
  }
  const regionArea = (R) => R.outers.reduce((s, o) => s + o.area, 0) - R.holes.reduce((s, h) => s + h.area, 0);

  /* SVG path data for contours given a point mapper (x, y) → [px, py] with a uniform scale. */
  function svgPath(contours, map, scale, digits = 2) {
    const f = (x) => (Math.abs(x) < 1e-9 ? "0" : x.toFixed(digits));
    let d = "";
    for (const k of contours) {
      if (!k.length) continue;
      const p0 = map(...segStart(k[0]));
      d += `M${f(p0[0])} ${f(p0[1])}`;
      for (const s of k) {
        if (s.type === "line") { const p = map(...s.b); d += `L${f(p[0])} ${f(p[1])}`; continue; }
        // Split into ≤ 180° pieces; the screen y axis points down, so sweep flags flip.
        const sweep = s.t1 - s.t0;
        const n = Math.max(1, Math.ceil(Math.abs(sweep) / Math.PI - 1e-9));
        const probe = map(0, 0), probeY = map(0, 1);
        const flipped = probeY[1] < probe[1]; // y up in model → y down on screen
        for (let i = 1; i <= n; i++) {
          const t = s.t0 + (sweep * i) / n;
          const p = map(s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t));
          const ccw = sweep > 0;
          const flag = flipped ? (ccw ? 0 : 1) : (ccw ? 1 : 0);
          d += `A${f(s.r * scale)} ${f(s.r * scale)} 0 0 ${flag} ${f(p[0])} ${f(p[1])}`;
        }
      }
      d += "Z";
    }
    return d;
  }

  return {
    line, arc, circle, segStart, segEnd, reverseContour, transformSegment, transformContours, toFrame, quarterTurn,
    moments, area, extent, bbox, breakLevels, filletedPolygon, polygonize, signedArea, triangulate,
    convexIntersectionArea, polyRegion, regionIntersectionArea, regionArea, svgPath,
  };
});
