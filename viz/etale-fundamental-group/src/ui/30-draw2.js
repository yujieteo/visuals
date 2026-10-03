
/* ================= renderers, part 2: surfaces, polygons, tori, cubics, characteristic p ================= */
const nest = (s, x, y, w, h) => s.replace('<svg class="fig"', `<svg x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}"`);
/* A closed Catmull–Rom spline through pts, as an SVG path. */
function closedSpline(pts) {
  const n = pts.length, P = (i) => pts[(i + n) % n];
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    d += ` C${n1(p1[0] + (p2[0] - p0[0]) / 6)} ${n1(p1[1] + (p2[1] - p0[1]) / 6)} ${n1(p2[0] - (p3[0] - p1[0]) / 6)} ${n1(p2[1] - (p3[1] - p1[1]) / 6)} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return d + " Z";
}
function ellLoop(cx, cy, rx, ry, cls, name, hl, o = {}) {
  const pts = Array.from({ length: 65 }, (_, k) => { const a = (o.dir ?? 1) * (TAU * k) / 64 + (o.a0 ?? 0); return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
  return `<g data-loop="${name}" ${o.faded ? 'opacity=".3"' : ""}>${pline(pts, `loop ${cls}${hl ? " hl" : ""}`, o.dash ? 'stroke-dasharray="5 4"' : "")}${pline(pts, "", 'stroke="transparent" stroke-width="12" fill="none"')}${arrowOn(pts, 0.25, loopVar(cls), 8)}</g>`;
}

/* The genus-g surface with r punctures and the canonical loops aᵢ, bᵢ, cⱼ. */
function surfaceFig(g, r, o = {}) {
  const hl = o.hl, elim = o.elim;
  if (g === 0) {
    const spots = [[-38, 22], [34, 28], [2, -30], [-52, -20], [50, -16], [8, 60]];
    return sphereFig({
      w: 320, h: 270, R: 110, e: 0.25, label: o.label || `A sphere with ${r} punctures`,
      points: spots.slice(0, r).map(([lon, lat], j) => ({ P: sph(lon, lat), kind: "puncture", label: `c${E.sub(j + 1)}`, dx: 14, dy: 4 })),
      loops: spots.slice(0, r).map(([lon, lat], j) => ({ P: sph(lon, lat), beta: 0.3, cls: "loop-c", name: `c${j + 1}`, hl: hl === `c${j + 1}` })),
    });
  }
  const sp = 150, w = Math.max(320, sp * (g - 1) + 260), h = 230, cy = 112, x0 = (w - sp * (g - 1)) / 2;
  const xs = Array.from({ length: g }, (_, i) => x0 + i * sp);
  const top = [[x0 - 100, cy], [x0 - 78, cy - 52]];
  xs.forEach((x, i) => { top.push([x, cy - 76]); if (i < g - 1) top.push([x + sp / 2, cy - 54]); });
  top.push([xs[g - 1] + 78, cy - 52], [xs[g - 1] + 100, cy]);
  const bottom = top.slice(1, -1).reverse().map(([x, y]) => [x, 2 * cy - y]);
  let b = pathD(closedSpline([...top, ...bottom]), "sv-surf");
  xs.forEach((x, i) => {
    b += pathD(`M${x - 26} ${cy + 3} Q${x} ${cy + 14} ${x + 26} ${cy + 3} Q${x} ${cy - 9} ${x - 26} ${cy + 3} Z`, "sv-hole");
    b += pathD(`M${x - 36} ${cy - 5} Q${x} ${cy + 20} ${x + 36} ${cy - 5}`, "sv-edge");
    const ai = `a${i + 1}`, bi = `b${i + 1}`;
    b += ellLoop(x, cy + 2, 50, 31, "loop-a", ai, hl === ai, { a0: Math.PI / 2 });
    b += txt(x - 58, cy - 28, `a${E.sub(i + 1)}`, "sv-label", `data-loop="${ai}"`);
    const fr = `M${x + 6} ${cy + 11} C${x + 22} ${cy + 30} ${x + 22} ${cy + 54} ${x + 6} ${cy + 74}`, bk = `M${x + 6} ${cy + 74} C${x - 8} ${cy + 54} ${x - 8} ${cy + 30} ${x + 6} ${cy + 11}`;
    const frPts = Array.from({ length: 21 }, (_, k) => { const t = k / 20, u = 1 - t; return [u * u * u * (x + 6) + 3 * u * u * t * (x + 22) + 3 * u * t * t * (x + 22) + t * t * t * (x + 6), u * u * u * (cy + 11) + 3 * u * u * t * (cy + 30) + 3 * u * t * t * (cy + 54) + t * t * t * (cy + 74)]; });
    b += `<g data-loop="${bi}">${pathD(bk, "loop back loop-b")}${pathD(fr, `loop loop-b${hl === bi ? " hl" : ""}`)}${pathD(fr, "", 'stroke="transparent" stroke-width="12" fill="none"')}${arrowOn(frPts, 0.6, "var(--gb)", 8)}</g>`;
    b += txt(x + 24, cy + 66, `b${E.sub(i + 1)}`, "sv-label", `data-loop="${bi}"`);
  });
  const spots = [[x0 - 76, cy + 2]];
  spots.push([xs[g - 1] + 76, cy + 2]);
  xs.forEach((x) => spots.push([x - 34, cy - 52], [x + 38, cy + 52]));
  xs.forEach((x) => spots.push([x + 34, cy - 52], [x - 40, cy + 52]));
  spots.slice(0, r).forEach(([px, py], j) => {
    const cj = `c${j + 1}`, last = elim && j === r - 1;
    b += ell(px, py, 6.5, 3.8, "sv-hole");
    b += ellLoop(px, py, 15, 9, "loop-c", cj, hl === cj, { dash: last, faded: last });
    b += txt(px + 16, py - 9, last ? `c${E.sub(j + 1)} = (…)⁻¹` : `c${E.sub(j + 1)}`, "sv-small ui-t", `data-loop="${cj}"`);
  });
  if (o.probe !== false) b += circ(x0, cy - 56, 5, "sv-probe");
  return svg(w, h, b, o.label || `A genus-${g} surface with ${r} punctures`);
}

/* The 4g-gon a₁b₁a₁⁻¹b₁⁻¹⋯ with its edge pairing, folding toward the surface as s goes 0 → 1. */
function polygonFig(g, s, o = {}) {
  if (g === 1) return torusFig({ stage: clamp(s * 2, 0, 2), n: 0, label: "The square with opposite sides identified folds into a torus", polygonEdges: true });
  const P = E.polygon(g), N = 4 * g, w = 340, h = 300, cx = w / 2, cy = h / 2, R = 110;
  const V = (k) => { const a = Math.PI / 2 + Math.PI / N + (TAU * k) / N; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
  const colOf = (lab) => { const i = Number(lab.slice(1)) - 1; return sheetVar(2 * i + (lab[0] === "b" ? 1 : 0)); };
  let b = "";
  const st = s < 0.25 ? 0 : s < 0.5 ? 1 : s < 0.75 ? 2 : 3, f = (s % 0.25) / 0.25;
  if (st <= 1) {
    const sep = st === 1 ? f * 22 : 0;
    for (let piece = 0; piece < g; piece++) {
      const mid = (TAU * (piece * 4 + 2)) / N + Math.PI / 2 + Math.PI / N, off = [sep * Math.cos(mid), sep * Math.sin(mid)];
      for (let k = piece * 4; k < piece * 4 + 4; k++) {
        const A = V(k).map((v, i) => v + off[i]), B2 = V(k + 1).map((v, i) => v + off[i]), [lab, ex] = P.edges[k], col = colOf(lab);
        b += line(A, B2, "", `style="stroke:${col}" stroke-width="3"`);
        const M = [(A[0] + B2[0]) / 2, (A[1] + B2[1]) / 2], ang = Math.atan2(B2[1] - A[1], B2[0] - A[0]) + (ex < 0 ? Math.PI : 0);
        b += arrowHead(M, ang, col, 9);
        const outv = [M[0] - cx, M[1] - cy], L = Math.hypot(...outv);
        b += txt(M[0] + (outv[0] / L) * 16 - 8, M[1] + (outv[1] / L) * 16 + 5, `${lab[0]}${E.sub(lab.slice(1))}${ex < 0 ? "⁻¹" : ""}`, "sv-label");
      }
      if (st === 1) b += line(V(piece * 4).map((v, i) => v + off[i]), V(piece * 4 + 4).map((v, i) => v + off[i]), "sv-dash");
    }
    if (st === 0) {
      const byLab = {};
      P.edges.forEach(([lab], k) => (byLab[lab] ??= []).push(k));
      for (const [lab, [k1, k2]] of Object.entries(byLab)) {
        const M1 = V(k1).map((v, i) => (v + V(k1 + 1)[i]) / 2), M2 = V(k2).map((v, i) => (v + V(k2 + 1)[i]) / 2);
        b += pathD(`M${n1(M1[0])} ${n1(M1[1])} Q${cx} ${cy} ${n1(M2[0])} ${n1(M2[1])}`, "", `fill="none" style="stroke:${colOf(lab)}" stroke-dasharray="3 4" opacity="${n1(0.25 + 0.75 * f)}"`);
      }
      for (let k = 0; k < N; k++) b += circ(...V(k), 4.5, "", 'style="fill:var(--glow)"');
    }
  } else if (st === 2) {
    for (let i = 0; i < g; i++) {
      const x = w / 2 + (i - (g - 1) / 2) * 120, y = cy;
      b += `<g opacity="${n1(0.4 + 0.6 * f)}">` + nest(surfaceFig(1, 1, { probe: false, label: "punctured torus" }), x - 60, y - 45, 120, 90) + "</g>";
      b += txt(x, y + 62, `[a${E.sub(i + 1)}, b${E.sub(i + 1)}]`, "sv-small ui-t", 'text-anchor="middle"');
    }
  } else {
    b += nest(surfaceFig(g, 0, { probe: false }), 10, 40, w - 20, (w - 20) * 230 / Math.max(320, 150 * (g - 1) + 260));
  }
  const cap = ["Edges with the same label are glued, arrows matching", "Cut along chords into g pieces, each bounded by one commutator", "Each piece is a torus with one hole", "Glue the holes: the genus-g surface"][st];
  b += txt(w / 2, h - 8, cap, "sv-small ui-t", 'text-anchor="middle"');
  return svg(w, h, b, o.label || `The ${N}-gon with edge identifications for genus ${g}`);
}

/* Lattice parallelogram → cylinder → torus (stage 0 → 1 → 2), with the cycles a, b and E[n]. */
const TAU_LAT = E.C(0.3, 0.95);
function torusFig(o = {}) {
  const w = o.w ?? 320, h = o.h ?? 260, t = clamp(o.stage ?? 2, 0, 2), n = o.n ?? 0, tau = o.tau ?? TAU_LAT;
  const Wd = 4.4, Hd = 2.0, r = Hd / TAU, Rb = Wd / TAU, skew = Hd * (tau.re / tau.im);
  const c = cam(w / 2, h / 2 + 4, (o.scale ?? 0.2) * w, lerp(0.12, 0.62, t / 2));
  const at = (u, v) => {
    const th = TAU * (u - 0.5), ph = TAU * (v - 0.5);
    const F = [(u - 0.5) * Wd + (v - 0.5) * skew, 0, (v - 0.5) * Hd], Cy = [(u - 0.5) * Wd, -r * Math.cos(ph), r * Math.sin(ph)];
    const rho = Rb + r * Math.cos(ph), T = [rho * Math.sin(th), -rho * Math.cos(th), r * Math.sin(ph)];
    const nF = [0, -1, 0], nC = [0, -Math.cos(ph), Math.sin(ph)], nT = [Math.cos(ph) * Math.sin(th), -Math.cos(ph) * Math.cos(th), Math.sin(ph)];
    return t <= 1 ? { P: lerp3(F, Cy, t), N: lerp3(nF, nC, t) } : { P: lerp3(Cy, T, t - 1), N: lerp3(nC, nT, t - 1) };
  };
  const view = c.view(), vis = (q) => dot3(q.N, view) > -0.02;
  const run = (qs, cls, back) => visRuns(qs, vis).map((R) => pline(R.pts.map((q) => c.p(q.P)), R.front ? cls : back)).join("");
  let b = "";
  // A filled underlay: the flat parallelogram, or a soft torus silhouette.
  if (t < 0.2) b += pgon([[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => c.p(at(u, v).P)), "sv-surf", `opacity="${n1(1 - t * 5)}"`);
  for (let j = 0; j <= 12; j++) b += run(Array.from({ length: 49 }, (_, k) => at(k / 48, j / 12)), "sv-grid", "sv-faint");
  for (let j = 0; j < 24; j++) b += run(Array.from({ length: 25 }, (_, k) => at(j / 24, k / 24)), "sv-grid", "sv-faint");
  const aC = Array.from({ length: 97 }, (_, k) => at(k / 96, 0.5)), bC = Array.from({ length: 49 }, (_, k) => at(0.5, k / 48));
  b += `<g data-loop="a">${run(aC, `loop loop-a${o.hl === "a" ? " hl" : ""}`, "loop back loop-a")}</g><g data-loop="b">${run(bC, `loop loop-b${o.hl === "b" ? " hl" : ""}`, "loop back loop-b")}</g>`;
  const aF = aC.filter(vis).map((q) => c.p(q.P)), bF = bC.filter(vis).map((q) => c.p(q.P));
  if (aF.length > 4) { b += arrowOn(aF, 0.3, "var(--ga)", 8); b += txt(aF[Math.floor(aF.length * 0.3)][0], aF[Math.floor(aF.length * 0.3)][1] + 18, "a", "sv-big"); }
  if (bF.length > 4) { b += arrowOn(bF, 0.75, "var(--gb)", 8); b += txt(bF[Math.floor(bF.length * 0.75)][0] + 8, bF[Math.floor(bF.length * 0.75)][1], "b", "sv-big"); }
  if (t < 0.35 && o.polygonEdges !== false) {
    const al = n1(1 - t / 0.35), edge = (u0, v0, u1, v1, col, dbl) => {
      const A = c.p(at(u0, v0).P), B2 = c.p(at(u1, v1).P), M = [(A[0] + B2[0]) / 2, (A[1] + B2[1]) / 2], ang = Math.atan2(B2[1] - A[1], B2[0] - A[0]);
      return `<g opacity="${al}">${line(A, B2, "", `style="stroke:${col}" stroke-width="3"`)}${arrowHead(M, ang, col, 9)}${dbl ? arrowHead([M[0] - 9 * Math.cos(ang), M[1] - 9 * Math.sin(ang)], ang, col, 9) : ""}</g>`;
    };
    b += edge(0, 0, 1, 0, "var(--s5)", false) + edge(0, 1, 1, 1, "var(--s5)", false) + edge(0, 0, 0, 1, "var(--s6)", true) + edge(1, 0, 1, 1, "var(--s6)", true);
  }
  if (n > 0) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const u = (0.5 + i / n) % 1, v = (0.5 + j / n) % 1, q = at(u, v), p = c.p(q.P), front = vis(q), k = i * n + j;
      b += circ(p[0], p[1], i === 0 && j === 0 ? 6.5 : 4.8, `sv-pt${o.hlPt === k ? " ptsel" : ""}`, `data-pt="${k}" style="fill:${i === 0 && j === 0 ? "var(--fg)" : "var(--s2)"}" opacity="${front ? 1 : 0.35}"`);
    }
  }
  if (o.probe != null) { const q = at((0.5 + o.probe) % 1, 0.5); b += circ(...c.p(q.P), 7, "sv-probe"); }
  const cap = t < 0.5 ? "ℂ/Λ: opposite sides identified" : t < 1.5 ? "glue one pair of sides: a cylinder" : "glue the ends: a torus";
  if (o.caption !== false) b += txt(10, h - 8, cap, "sv-small ui-t");
  return svg(w, h, b, o.label || "The lattice quotient folding into a torus");
}

/* The real points of y² = x³ + ax + b, with the point at infinity O. */
function cubicFig(a, bb, o = {}) {
  const w = o.w ?? 300, h = o.h ?? 260, xr = [-2.3, 2.5], yr = [-3.1, 3.1];
  const X = (x) => 30 + ((x - xr[0]) / (xr[1] - xr[0])) * (w - 50), Y = (y) => 30 + ((yr[1] - y) / (yr[1] - yr[0])) * (h - 60);
  const f = (x) => x * x * x + a * x + bb;
  let b = line([X(xr[0]), Y(0)], [X(xr[1]), Y(0)], "sv-faint") + line([X(0), Y(yr[0])], [X(0), Y(yr[1])], "sv-faint");
  const disc = 4 * a * a * a + 27 * bb * bb;
  const runs = []; let cur = null;
  for (let k = 0; k <= 2400; k++) {
    const x = xr[0] + ((xr[1] - xr[0]) * k) / 2400, v = f(x);
    if (v >= 0) { if (!cur) { cur = []; runs.push(cur); } cur.push([x, Math.sqrt(v)]); } else cur = null;
  }
  for (const R of runs) {
    const up = R.filter(([, y]) => y <= yr[1]).map(([x, y]) => [X(x), Y(y)]), dn = R.filter(([, y]) => y <= yr[1]).map(([x, y]) => [X(x), Y(-y)]);
    b += pline([...dn.slice().reverse(), ...up], "sv-alg", 'stroke="var(--s1)" style="stroke:var(--s1)"');
  }
  const roots = E.croots([E.C(bb), E.C(a), E.C(0), E.C(1)]).filter((z) => Math.abs(z.im) < 1e-7).map((z) => z.re);
  for (const x0 of roots) b += circ(X(x0), Y(0), 5, "", 'style="fill:var(--s2)"');
  b += circ(w / 2 + 40, 16, 6, "", 'style="fill:var(--fg)"') + txt(w / 2 + 52, 21, "O = ∞", "sv-label");
  b += line([X(xr[1]) - 6, Y(yr[1]) + 30], [w / 2 + 46, 20], "sv-dash");
  b += txt(10, h - 8, Math.abs(disc) < 1e-9 ? "singular: 4a³ + 27b² = 0" : `${curveName(+n1(a), +n1(bb))}   ·   real 2-torsion: ${roots.length} + O`, "sv-small ui-t");
  return svg(w, h, b, o.label || "The real points of the Weierstrass cubic with the point at infinity");
}

/* E[n] in the fundamental parallelogram: (i + jτ)/n, sides identified. */
function latticeFig(n, o = {}) {
  const w = o.w ?? 300, h = o.h ?? 250, tau = o.tau ?? TAU_LAT, S = 170, ox = 40, oy = h - 40;
  const P = (x, y) => [ox + S * (x + y * tau.re), oy - S * y * tau.im];
  let b = pgon([P(0, 0), P(1, 0), P(1, 1), P(0, 1)], "sv-surf", 'opacity=".6"');
  for (let k = 1; k < n; k++) b += line(P(k / n, 0), P(k / n, 1), "sv-grid") + line(P(0, k / n), P(1, k / n), "sv-grid");
  const edge = (A, B2, col, dbl) => { const M = [(A[0] + B2[0]) / 2, (A[1] + B2[1]) / 2], ang = Math.atan2(B2[1] - A[1], B2[0] - A[0]); return line(A, B2, "", `style="stroke:${col}" stroke-width="2.5"`) + arrowHead(M, ang, col, 9) + (dbl ? arrowHead([M[0] - 9 * Math.cos(ang), M[1] - 9 * Math.sin(ang)], ang, col, 9) : ""); };
  b += edge(P(0, 0), P(1, 0), "var(--s5)") + edge(P(0, 1), P(1, 1), "var(--s5)") + edge(P(0, 0), P(0, 1), "var(--s6)", true) + edge(P(1, 0), P(1, 1), "var(--s6)", true);
  for (const p of E.torsion(n, tau)) {
    const q = P(p.i / n, p.j / n), k = p.i * n + p.j;
    b += circ(q[0], q[1], p.i === 0 && p.j === 0 ? 6.5 : 5, `sv-pt${o.hlPt === k ? " ptsel" : ""}`, `data-pt="${k}" style="fill:${p.i === 0 && p.j === 0 ? "var(--fg)" : "var(--s2)"}"`);
  }
  b += txt(P(0, 0)[0] - 10, P(0, 0)[1] + 18, "0", "sv-label") + txt(P(1, 0)[0], P(1, 0)[1] + 18, "1", "sv-label") + txt(P(0, 1)[0] - 6, P(0, 1)[1] - 8, "τ", "sv-label");
  b += txt(10, 18, `E[${n}] = (1/${n})Λ/Λ ≅ (ℤ/${n})²: ${E.torsionCount(n)} points`, "sv-small ui-t");
  return svg(w, h, b, o.label || `The ${n}-torsion grid in the fundamental parallelogram`);
}

/* Abelian varieties: T² × ⋯ × T² (g factors), and the n^{2g} torsion points as an abstract grid. */
function abelianFig(g, n) {
  const w = 340, tw = Math.min(150, (w - 20 * (g - 1)) / g), h = 300;
  let b = "";
  for (let i = 0; i < g; i++) {
    const x = 10 + i * (tw + 20);
    b += nest(torusFig({ stage: 2, n, w: 200, h: 150, scale: 0.3, caption: false, label: `torus factor ${i + 1}` }), x, 10, tw, tw * 0.75);
    if (i < g - 1) b += txt(x + tw + 4, 10 + tw * 0.4, "×", "sv-big");
  }
  const side = Math.pow(n, g), cell = Math.min(10, 150 / side), gx = w / 2 - (side * cell) / 2, gy = 40 + tw * 0.75;
  for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) b += circ(gx + (i + 0.5) * cell, gy + (j + 0.5) * cell, Math.max(1.4, cell * 0.32), "", `style="fill:${i === 0 && j === 0 ? "var(--fg)" : "var(--s2)"}"`);
  b += txt(w / 2, gy + side * cell + 18, `A[${n}] ≅ (ℤ/${n})${E.sup(2 * g)}: ${E.torsionCount(n, g)} points`, "sv-small ui-t", 'text-anchor="middle"');
  return svg(w, Math.max(h, gy + side * cell + 30), b, `A ${g}-dimensional abelian variety as a product of ${g} tori, with its ${n}-torsion`);
}

/* Artin–Schreier yᵖ − y = t: p algebraic sheets over the affine line, never meeting. */
function asFig(p, tpos, shift, o = {}) {
  const w = o.w ?? 330, h = o.h ?? Math.max(220, 46 * p + 90), x0 = 60, x1 = w - 20, yb = h - 34;
  let b = line([x0, yb], [x1, yb], "sv-alg") + txt(10, yb + 5, "𝔸¹ₜ", "sv-big");
  for (let k = 0; k < p; k++) { const x = lerp(x0 + 20, x1 - 20, k / Math.max(1, p - 1)); b += circ(x, yb, 3, "", 'style="fill:var(--alg)"') + txt(x - 4, yb + 18, String(k), "sv-small ui-t"); }
  const yS = (k) => yb - 46 - k * ((yb - 70) / Math.max(1, p));
  for (let k = 0; k < p; k++) {
    const y = yS(k);
    b += line([x0, y - 2], [x1, y - 2], "sv-alg2") + line([x0, y + 2], [x1, y + 2], "sv-alg2");
    b += txt(8, y + 4, k === 0 ? "y" : `y+${k}`, "sv-small ui-t");
  }
  const xp = lerp(x0 + 10, x1 - 10, tpos);
  b += line([xp, yb], [xp, yS(p - 1) - 14], "sv-dash");
  for (let i = 0; i < p; i++) {
    const fl = shift % 1, k0 = (i + Math.floor(shift)) % p, k1 = (k0 + 1) % p;
    const y = fl === 0 ? yS(k0) : k1 === 0 ? lerp(yS(k0), yS(p - 1) - 30, fl) : lerp(yS(k0), yS(k1), fl);
    b += circ(xp, y, 6.5, `${sheetCls(i)} sv-pt${o.hl === i ? " ptsel" : ""}`, `data-pt="${i}"`);
  }
  b += circ(xp, yb, 7, "sv-probe");
  b += txt(x1 - 120, 18, "∂/∂y = −1 ≠ 0: étale", "sv-small ui-t");
  return svg(w, h, b, o.label || `The Artin–Schreier cover with ${p} algebraic sheets`);
}
/* The same equation over ℂ: branched over p − 1 finite values of t (and over ∞). */
function asChar0Fig(p) {
  const B = E.artinSchreierChar0(p).branch, R = Math.max(1, ...B.map((z) => E.cabs(z))) * 1.4;
  return `<div class="geom-dim-wrap">${planeFig({
    w: 300, h: 220, s: 40 / R * 1.2,
    points: [], probe: null, label: `The same equation over the complex numbers is branched at ${p - 1} points`,
    extra: (c, k) => B.map((z) => { const q = c.p([(z.re / R) * 2.2, (z.im / R) * 2.2, 0]); return circ(q[0], q[1], 6, "sv-red"); }).join("") + txt(10, 18, `char 0: yᵖ − y = t branches over ${p - 1} points`, "sv-small ui-t"),
  })}</div>`;
}

/* Torsion towers in characteristic p: rows ℓ ≠ p keep ℓ²ᵏ points; the p row is pᵏ (ordinary) or 1 (supersingular). */
function towersFig(Ec, o = {}) {
  const p = Ec.p, ells = [2, 3, 5, 7, 11].filter((l) => l !== p).slice(0, 3), rows = [...ells, p], w = 340, h = 40 + rows.length * 46;
  let b = "";
  rows.forEach((l, i) => {
    const y = 34 + i * 46, isP = l === p;
    b += txt(10, y + 5, isP ? `p = ${p}` : `ℓ = ${l}`, "sv-label", isP ? 'style="font-weight:700"' : "");
    for (let k = 1; k <= 4; k++) {
      const x = 70 + (k - 1) * 66, size = isP ? Ec.pTorsion(k) : Ec.lTorsion(l, k), dead = isP && Ec.supersingular;
      b += `<rect x="${x}" y="${y - 12}" width="58" height="22" rx="4" style="fill:${dead ? "none" : isP ? "var(--s2)" : "var(--s1)"};stroke:${dead ? "var(--muted)" : "none"}" ${dead ? 'stroke-dasharray="4 3"' : ""} opacity="${dead ? 0.7 : 0.25 + 0.18 * k}"/>`;
      b += txt(x + 29, y + 4, dead ? "—" : `${size}`, "sv-small ui-t", 'text-anchor="middle"');
      if (k < 4) b += txt(x + 60, y + 4, "←", "sv-small ui-t");
    }
  });
  b += txt(70, 16, "#E[ℓᵏ](𝔽̄ₚ) for k = 1, 2, 3, 4", "sv-small ui-t");
  return svg(w, h, b, o.label || "Torsion towers in characteristic p");
}

/* μ_n on the unit circle; mode "loop" rotates by s steps, mode "gal" moves k toward a·k along chords. */
function rootsFig(n, o = {}) {
  const w = o.w ?? 300, h = o.h ?? 280, cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) * 0.36, s = o.s ?? 0, a = o.a ?? 1;
  const at = (k) => [cx + R * Math.cos((TAU * k) / n), cy - R * Math.sin((TAU * k) / n)];
  let b = circ(cx, cy, R, "sv-faint") + line([cx - R - 14, cy], [cx + R + 14, cy], "sv-faint") + line([cx, cy - R - 14], [cx, cy + R + 14], "sv-faint");
  for (let k = 0; k < n; k++) {
    let q;
    if (o.mode === "gal") { const A = at(k), Bq = at(E.mod(a * k, n)); q = [lerp(A[0], Bq[0], s), lerp(A[1], Bq[1], s)]; if (s > 0 && s < 1 && E.mod(a * k, n) !== k) b += line(A, Bq, "sv-dash"); }
    else q = at(k + s * (o.step ?? 1));
    b += circ(q[0], q[1], o.hl === k ? 9 : 7, `${sheetCls(k)} sv-pt${o.hl === k ? " ptsel" : ""}`, `data-pt="${k}"`);
  }
  for (let k = 0; k < n; k++) { const q = at(k), d = [(q[0] - cx) / R, (q[1] - cy) / R]; b += txt(q[0] + d[0] * 20 - 7, q[1] + d[1] * 20 + 5, E.labelsMu(n)[k], "sv-label"); }
  if (o.caption) b += txt(10, h - 8, o.caption, "sv-small ui-t");
  return svg(w, h, b, o.label || `The ${n}th roots of unity`);
}

/* The arithmetic π₁: the geometric cover world over k̄, descent to X over k, and Spec k below. */
function layersFig(n, s, mode) {
  const w = 320, h = 360;
  let b = `<rect x="6" y="6" width="${w - 12}" height="200" rx="10" style="fill:none;stroke:var(--s1)" stroke-dasharray="5 4"/>`;
  b += txt(16, 24, "X over k̄ : geometric cover world", "sv-small ui-t");
  b += nest(coverSheets({ perm: E.rotation(Math.min(n, 8)), s: mode === "loop" ? s : 0, w: 300, h: 280, baseLabel: "𝔾ₘ,ℚ̄", coverLabel: "Y", labels: E.labelsMu(Math.min(n, 8)) }), 40, 28, 240, 172);
  b += line([w / 2, 212], [w / 2, 250], "sv-line") + arrowHead([w / 2, 252], Math.PI / 2, "var(--fg)", 8) + txt(w / 2 + 8, 236, "descent", "sv-small ui-t");
  b += line([60, 268], [w - 60, 268], "sv-alg") + txt(w - 56, 272, "𝔾ₘ over ℚ", "sv-small ui-t");
  b += line([w / 2, 278], [w / 2, 318], "sv-line") + arrowHead([w / 2, 320], Math.PI / 2, "var(--fg)", 8);
  b += circ(w / 2, 334, 7, "", 'style="fill:var(--alg)"') + txt(w / 2 + 12, 339, "Spec ℚ", "sv-label");
  b += pathD(`M${w - 30} 330 C ${w - 6} 250, ${w - 6} 120, ${w - 30} 60`, "", `fill="none" style="stroke:var(--s2)" stroke-width="${mode === "gal" ? 3 : 1.5}" stroke-dasharray="6 4"`);
  b += txt(w - 120, 300, "G_ℚ moves coefficients", "sv-small ui-t", 'style="fill:var(--s2)"');
  return svg(w, h, b, "Two layers: the geometric cover world over Q-bar above the arithmetic curve over Q");
}

/* ℤ → ℤ̂ as covers of the cylinder: the divisors of 12 with z ↦ z^(m/n) between them. */
function profiniteFig(sel) {
  const w = 360, h = 340, nodes = { 12: [180, 40], 4: [90, 130], 6: [270, 130], 2: [130, 220], 3: [270, 220], 1: [200, 300] };
  let b = "";
  for (const [m, A] of Object.entries(nodes)) for (const [d, Bq] of Object.entries(nodes)) {
    const M = +m, D = +d;
    if (M !== D && M % D === 0 && !Object.keys(nodes).some((k) => +k !== M && +k !== D && M % +k === 0 && +k % D === 0)) {
      b += line([A[0], A[1] + 26], [Bq[0], Bq[1] - 26], "sv-line") + arrowHead([Bq[0], Bq[1] - 26], Math.atan2(Bq[1] - A[1], Bq[0] - A[0]), "var(--fg)", 7);
      b += txt((A[0] + Bq[0]) / 2 + 6, (A[1] + Bq[1]) / 2, `z${E.sup(M / D)}`, "sv-small ui-t", 'style="fill:var(--muted)"');
    }
  }
  for (const [m, A] of Object.entries(nodes)) {
    const M = +m, on = sel === M;
    b += `<g data-q="${M}" style="cursor:pointer">${circ(A[0], A[1], 26, "", `style="fill:${on ? "var(--fg)" : "var(--panel)"};stroke:var(--fg)" stroke-width="1.2"`)}`;
    const rr = 15;
    for (let k = 0; k < M; k++) { const a = -Math.PI / 2 + (TAU * k) / M; b += circ(A[0] + rr * Math.cos(a), A[1] + rr * Math.sin(a), 2.4, "", `style="fill:${on ? "var(--bg)" : sheetVar(k)}"`); }
    b += txt(A[0] + 30, A[1] + 5, `ℤ/${M}`, "sv-label") + "</g>";
  }
  b += txt(10, h - 8, "degree-n covers of the cylinder, n | 12", "sv-small ui-t");
  return svg(w, h, b, "The finite cyclic covers of the multiplicative group, ordered by divisibility");
}

/* The dessin of x ↦ (1 − T₃(x))/2: preimages of [0, 1], black over 0, white over 1. */
function dessinFig() {
  const w = 320, h = 220, X = (x) => w / 2 + x * 120, Y = (y) => h / 2 - y * 120;
  let b = line([X(-1.3), Y(0)], [X(1.3), Y(0)], "sv-faint") + txt(8, 18, "x-plane (the cover)", "sv-small ui-t");
  const fib = (t) => E.croots(E.chebyshev.coeffs(E.C(t)));
  for (let k = 1; k < 200; k++) for (const z of fib(k / 200)) b += circ(X(z.re), Y(z.im), 1.6, "", 'style="fill:var(--fg)"');
  const merge = (zs) => zs.filter((z, i) => zs.findIndex((y) => E.cabs(E.csub(y, z)) < 1e-4) === i);
  for (const z of merge(fib(0))) b += circ(X(z.re), Y(z.im), 7, "", 'style="fill:var(--fg)"');
  for (const z of merge(fib(1))) b += circ(X(z.re), Y(z.im), 7, "", 'style="fill:var(--panel);stroke:var(--fg)" stroke-width="2"');
  b += txt(10, h - 10, "● over 0   ○ over 1   the one face is over ∞", "sv-small ui-t");
  return svg(w, h, b, "The dessin of the Chebyshev cover: a path with two black and two white vertices");
}
