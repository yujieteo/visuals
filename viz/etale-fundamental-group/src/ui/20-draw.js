
/* ================= renderers, part 1: spheres, planes, cylinders, sheets, graphs ================= */

/* The Riemann sphere. points: [{P, label, kind: "point" | "puncture" | "branch", fill (0..1, compactified)}];
   loops: [{P, beta, cls, name, dir}]. */
function sphereFig(o) {
  const w = o.w ?? 300, h = o.h ?? 280, R = o.R ?? 105, c = cam(w / 2, (o.cy ?? h / 2), R, o.e ?? 0.3, o.az ?? 0);
  const g = nextId("sg"), vis = (P) => c.depth(P) > 0;
  let b = `<defs><radialGradient id="${g}" cx="38%" cy="30%" r="75%"><stop offset="0" style="stop-color:var(--panel)"/><stop offset=".55" style="stop-color:var(--surf)"/><stop offset="1" style="stop-color:var(--surf2)"/></radialGradient></defs>`;
  const ctr = c.p([0, 0, 0]);
  b += circ(ctr[0], ctr[1], R, "sv-surf", `style="fill:url(#${g})"`);
  if (o.equator !== false) b += draw3(Array.from({ length: 97 }, (_, k) => sph((k * 360) / 96, 0)), c, vis, "sv-edge", "sv-back");
  if (o.meridian) b += draw3(Array.from({ length: 97 }, (_, k) => { const t = (k * TAU) / 96; return [Math.sin(t), 0, Math.cos(t)]; }), c, vis, "sv-edge", "sv-back");
  for (const L of o.loops || []) {
    const pts = sphereCircle(L.P, L.beta ?? 0.35, 64);
    if (L.dir === -1) pts.reverse();
    b += `<g data-loop="${esc(L.name || "")}">` + draw3(pts, c, vis, `loop ${L.cls}${L.hl ? " hl" : ""}`, `loop back ${L.cls}`) + `</g>`;
    const front = pts.filter(vis).map((P) => c.p(P));
    if (front.length > 4) b += arrowOn(front, 0.5, loopVar(L.cls), 8);
    if (L.label && front.length) { const q = front[Math.floor(front.length * 0.15)]; b += txt(q[0] + 6, q[1] + 16, L.label, "sv-label"); }
  }
  for (const pt of o.points || []) {
    const q = c.p(pt.P), front = vis(pt.P), f = pt.fill ?? 0;
    if (pt.kind === "puncture" && f < 1) {
      const rim = sphereCircle(pt.P, 0.12 * (1 - f) + 0.001, 28);
      if (front) b += pgon(rim.map((P) => c.p(P)), "sv-hole");
      else b += pline(rim.map((P) => c.p(P)), "sv-back");
    }
    if (pt.kind === "branch") b += circ(q[0], q[1], 6, "sv-red", 'opacity=".9"');
    if (pt.kind === "point" || f > 0) b += circ(q[0], q[1], 4.5, "sv-pt", `style="fill:var(--fg)" opacity="${pt.kind === "point" ? (front ? 1 : 0.4) : f}"`);
    if (pt.label) b += txt(q[0] + (pt.dx ?? 10), q[1] + (pt.dy ?? -8), pt.label, "sv-big", front ? "" : 'opacity=".6"');
  }
  if (o.extra) b += o.extra(c);
  return svg(w, h, b, o.label || "Riemann sphere");
}

/* Stereographic projection: plane points w ↦ the sphere point on the line from the north pole N.
   The plane is tangent at the south pole; t = 0 shows the plane, t = 1 the sphere. */
function stereoFig(t, o = {}) {
  const w = o.w ?? 320, h = o.h ?? 300, c = cam(w / 2, h * 0.47, 78, 0.38);
  const toS = (x, y) => { const r2 = x * x + y * y, s = 4 / (r2 + 4); return [s * x, s * y, 1 - 2 * s]; };
  const disp = (rho) => (4.2 * rho) / (rho + 1.6);
  const toP = (x, y) => { const r = Math.hypot(x, y) || 1e-9, d = disp(r); return [(x / r) * d, (y / r) * d, -1]; };
  const at = (x, y) => lerp3(toP(x, y), toS(x, y), t);
  const vis = (P) => t < 0.5 || c.depth(P) > -0.05 * 0;
  let b = "";
  const g = nextId("sg");
  b += `<defs><radialGradient id="${g}" cx="38%" cy="30%" r="75%"><stop offset="0" style="stop-color:var(--panel)"/><stop offset=".55" style="stop-color:var(--surf)"/><stop offset="1" style="stop-color:var(--surf2)"/></radialGradient></defs>`;
  if (t > 0.02) { const ctr = c.p([0, 0, 0]); b += circ(ctr[0], ctr[1], 78, "sv-surf", `style="fill:url(#${g})" opacity="${n1(ease(t))}"`); }
  const rings = [0.35, 0.8, 1.4, 2.3, 4, 8, 20], rays = 12;
  for (const r of rings) {
    const P3 = Array.from({ length: 73 }, (_, k) => at(r * Math.cos((k * TAU) / 72), r * Math.sin((k * TAU) / 72)));
    b += t > 0.5 ? draw3(P3, c, (P) => c.depth(P) > 0, "sv-grid", "sv-faint") : pline(P3.map((P) => c.p(P)), "sv-grid");
  }
  for (let k = 0; k < rays; k++) {
    const a = (k * TAU) / rays, P3 = Array.from({ length: 60 }, (_, j) => { const r = 0.02 * Math.exp(j * 0.12); return at(r * Math.cos(a), r * Math.sin(a)); });
    b += t > 0.5 ? draw3(P3, c, (P) => c.depth(P) > 0, "sv-grid", "sv-faint") : pline(P3.map((P) => c.p(P)), "sv-grid");
  }
  // One projection ray, from N through a sample point.
  const wq = o.sample ?? [1.6, -1.2], S = toS(...wq), Pq = toP(...wq), N = [0, 0, 1];
  if (o.ray !== false) {
    b += line(c.p(N), c.p(lerp3(Pq, S, t)), "sv-dash");
    b += circ(...c.p(lerp3(Pq, S, t)), 4.5, "sv-probe");
    b += txt(...c.p(lerp3(Pq, S, t)).map((v, i) => v + (i ? 18 : 6)), "z", "sv-label");
  }
  // ∞: the north pole, which the whole circle at infinity of the plane collapses to.
  const inf = c.p(N), f = o.removeInf ?? 0;
  if (f > 0) b += ell(inf[0], inf[1], 9 * f, 4 * f, "sv-hole");
  else b += circ(inf[0], inf[1], 5, "sv-pt", 'style="fill:var(--fg)"');
  b += txt(inf[0] + 9, inf[1] - 8, f > 0 ? "∞ removed" : "∞", "sv-big", `opacity="${n1(clamp(t * 1.5, 0, 1))}"`);
  if (t < 0.6) b += txt(w - 120, h - 14, "ℂ  (→ ∞ at the rim)", "sv-small ui-t", `opacity="${n1(1 - t)}"`);
  return svg(w, h, b, o.label || "Stereographic projection between the complex plane and the Riemann sphere");
}

/* The plane ℂ in perspective with marked or removed points; scale k shrinks it toward a point. */
function planeFig(o = {}) {
  const w = o.w ?? 300, h = o.h ?? 240, c = cam(w / 2, h * 0.55, o.s ?? 52, 0.55), k = o.k ?? 1;
  let b = "";
  const R = 2.4 * k;
  b += pgon([[-R, -R], [R, -R], [R, R], [-R, R]].map(([x, y]) => c.p([x, y, 0])), "sv-surf", 'opacity=".75"');
  for (let i = -2; i <= 2; i++) {
    b += line(c.p([i * k, -R, 0]), c.p([i * k, R, 0]), "sv-grid");
    b += line(c.p([-R, i * k, 0]), c.p([R, i * k, 0]), "sv-grid");
  }
  for (const pt of o.points || []) {
    const P = [pt.z[0] * k, pt.z[1] * k, 0], q = c.p(P), f = pt.fill ?? 0;
    if (pt.kind === "puncture" && f < 1) b += ell(q[0], q[1], 9 * (1 - f) + 0.5, 4.5 * (1 - f) + 0.3, "sv-hole");
    if (pt.kind === "point" || f > 0) b += circ(q[0], q[1], 4, "sv-pt", `style="fill:var(--fg)" opacity="${pt.kind === "point" ? 1 : f}"`);
    if (pt.label) b += txt(q[0] + 10, q[1] - 6, pt.label, "sv-big");
  }
  for (const L of o.loops || []) {
    const pts = Array.from({ length: 65 }, (_, j) => { const a = (j * TAU) / 64 * (L.dir ?? 1); return c.p([(L.z[0] + L.r * Math.cos(a)) * k, (L.z[1] + L.r * Math.sin(a)) * k, 0]); });
    b += `<g data-loop="${esc(L.name || "")}">${pline(pts, `loop ${L.cls}${L.hl ? " hl" : ""}`)}</g>` + arrowHead(pts[16], Math.atan2(pts[17][1] - pts[15][1], pts[17][0] - pts[15][0]), loopVar(L.cls), 8);
    if (L.label) b += txt(pts[40][0] - 4, pts[40][1] + 16, L.label, "sv-label");
  }
  if (o.probe) { const q = c.p([o.probe[0] * k, o.probe[1] * k, 0]); b += circ(q[0], q[1], 6, "sv-probe"); }
  if (o.extra) b += o.extra(c, k);
  if (o.caption) b += txt(10, h - 10, o.caption, "sv-small ui-t");
  return svg(w, h, b, o.label || "The complex plane");
}

/* G_m as a cylinder: the circle |z| = 1 times the radial direction (log |z|). */
function cylinderFig(o = {}) {
  const w = o.w ?? 300, h = o.h ?? 260, c = cam(w / 2, h * 0.52, 70, 0.4), H = 1.1;
  const vis = (P) => -Math.sin(Math.atan2(P[1], P[0])) > -1e-9 && P[1] <= 0;
  const circleAt = (z) => Array.from({ length: 97 }, (_, k) => { const a = (k * TAU) / 96; return [Math.cos(a), Math.sin(a), z]; });
  let b = "";
  const top = circleAt(H).map((P) => c.p(P));
  b += pgon([...circleAt(-H).filter((P) => P[1] <= 0).map((P) => c.p(P)).sort((a, z) => a[0] - z[0]), ...circleAt(H).filter((P) => P[1] <= 0).map((P) => c.p(P)).sort((a, z) => z[0] - a[0])], "sv-surf");
  b += pline(top, "sv-edge") + draw3(circleAt(-H), c, (P) => P[1] <= 0, "sv-edge", "sv-back");
  b += line(c.p([-1, 0, -H]), c.p([-1, 0, H]), "sv-edge") + line(c.p([1, 0, -H]), c.p([1, 0, H]), "sv-edge");
  b += txt(c.p([0, 0, H])[0] - 30, c.p([0, 0, H])[1] - 30, "|z| → ∞", "sv-small ui-t") + txt(c.p([0, 0, -H])[0] - 30, c.p([0, 0, -H])[1] + 34, "|z| → 0", "sv-small ui-t");
  const loop = circleAt(0);
  b += `<g data-loop="g">${draw3(loop, c, (P) => P[1] <= 0, "loop loop-a", "loop back loop-a")}</g>`;
  const fr = loop.filter((P) => P[1] <= 0).map((P) => c.p(P));
  b += arrowOn(fr.sort((a, z) => a[0] - z[0]), 0.7, "var(--ga)", 8);
  if (o.s != null) { const a = -Math.PI / 2 + TAU * o.s, P = [Math.cos(a), Math.sin(a), 0]; b += circ(...c.p(P), 6, "sv-probe", P[1] > 0 ? 'opacity=".5"' : ""); }
  b += txt(c.p([1, 0, 0])[0] + 8, c.p([1, 0, 0])[1] + 4, "γ", "sv-big");
  return svg(w, h, b, o.label || "The multiplicative group as a cylinder");
}

/* ----- the cover-sheet renderer -----
   d sheets stacked over a circle in the base; a lift starting on sheet i crosses the cut (the left
   side) onto sheet perm[i], so after one turn the fibre is permuted by perm. Returns null when there
   are too many sheets to draw honestly; the caller then shows the monodromy graph. */
function coverSheets(o) {
  const perm = o.perm, d = perm.length;
  if (d > (o.max ?? 8)) return null;
  const w = o.w ?? 320, h = o.h ?? 320, s = o.s ?? 0, e = 0.42, S = Math.min(w * 0.34, 105);
  const c = cam(w / 2, h - 22 - S * Math.sin(e), S, e), ce = Math.cos(e), se = Math.sin(e);
  const yTop = 22 + S * se + 8, yBase = h - 22 - S * se, baseGap = Math.max(46, 2 * S * se + 16);
  const zOf = (k) => (yBase - baseGap - (k * (yBase - baseGap - yTop)) / Math.max(1, d - 1)) - yBase;
  const Z = (k) => -zOf(k) / (S * ce);
  const th0 = -Math.PI / 2, thc = Math.PI, del = 0.28;
  const P = (th, z) => [Math.cos(th), Math.sin(th), z];
  const vis = (Q) => Q[1] <= 0;
  let b = "";
  // Sheets: arcs from the cut round to the cut, then connectors across it.
  for (let k = 0; k < d; k++) {
    const arc = Array.from({ length: 81 }, (_, j) => P(thc + del + ((TAU - 2 * del) * j) / 80, Z(k)));
    b += draw3(arc, c, vis, "sv-edge", "sv-back");
  }
  for (let k = 0; k < d; k++) b += line(c.p(P(thc - del, Z(k))), c.p(P(thc + del, Z(perm[k]))), "sv-edge", 'stroke-width="1.6"');
  // Base circle X with the loop orientation.
  const base = Array.from({ length: 97 }, (_, j) => P((j * TAU) / 96, 0));
  b += draw3(base, c, vis, "loop loop-a", "loop back loop-a");
  const fb = base.filter(vis).map((Q) => c.p(Q)).sort((a, z) => a[0] - z[0]);
  b += arrowOn(fb, 0.8, "var(--ga)", 8);
  b += txt(c.p(P(0, 0))[0] + 10, c.p(P(0, 0))[1] + 4, o.baseLabel ?? "X", "sv-big");
  b += txt(c.p(P(0, Z(d - 1)))[0] + 10, c.p(P(0, Z(d - 1)))[1] - 6, o.coverLabel ?? "Y", "sv-big");
  const arrX = c.p(P(0, 0))[0] + 34;
  b += line([arrX, yBase - baseGap + 6], [arrX, yBase - 14], "sv-line") + arrowHead([arrX, yBase - 12], Math.PI / 2, "var(--fg)", 7);
  // Where each lift is at parameter s.
  const th = th0 + TAU * s, cutS = (thc - del - th0) / TAU, cutE = (thc + del - th0) / TAU;
  const zAt = (i, ss) => (ss <= cutS ? Z(i) : ss >= cutE ? Z(perm[i]) : lerp(Z(i), Z(perm[i]), (ss - cutS) / (cutE - cutS)));
  if (o.showFibre !== false) b += line(c.p(P(th, 0)), c.p(P(th, Z(d - 1) + 0.15)), "sv-dash");
  for (let i = 0; i < d; i++) {
    if (s > 0) {
      const trail = Array.from({ length: 61 }, (_, j) => { const ss = (s * j) / 60; return P(th0 + TAU * ss, zAt(i, ss)); });
      b += pline(trail.map((Q) => c.p(Q)), "", `style="fill:none;stroke:${sheetVar(i)}" stroke-width="2.2" opacity=".75"`);
    }
    const Q = P(th, zAt(i, s)), q = c.p(Q), front = vis(Q);
    b += circ(q[0], q[1], o.hl === i ? 8 : 6, `${sheetCls(i)} sv-pt${o.hl === i ? " ptsel" : ""}`, `data-pt="${i}" opacity="${front ? 1 : 0.55}"`);
  }
  for (let k = 0; k < d; k++) { const q = c.p(P(th0, Z(k))); b += txt(q[0] - 26, q[1] + 4, (o.labels || [])[k] ?? String(k + 1), "sv-small ui-t"); }
  const pb = c.p(P(th, 0));
  b += circ(pb[0], pb[1], 7, "sv-probe", 'data-base="1"') + txt(pb[0] - 6, pb[1] + 22, "x̄", "sv-big");
  return svg(w, h, b, o.label || `A ${d}-sheeted cover drawn sheet by sheet`);
}

/* ----- the monodromy graph: i —g→ g(i) for each generator ----- */
function monoGraph(o) {
  const n = o.n, w = o.w ?? 300, h = o.h ?? 280, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
  const pos = (i) => [cx + R * Math.cos(-Math.PI / 2 + (TAU * i) / n), cy + R * Math.sin(-Math.PI / 2 + (TAU * i) / n)];
  let b = "";
  o.gens.forEach((g, k) => {
    const col = g.color, bend = (k === 0 ? 0.18 : -0.18) * (o.gens.length > 1 ? 1 : 0.6);
    g.perm.forEach((j, i) => {
      const A = pos(i), Bp = pos(j);
      if (i === j) {
        const out = [(A[0] - cx) / R, (A[1] - cy) / R], r = 11 + 5 * k, C0 = [A[0] + out[0] * (r + 6), A[1] + out[1] * (r + 6)];
        b += circ(C0[0], C0[1], r, "", `fill="none" style="stroke:${col}" stroke-width="1.8" opacity=".85"`);
        return;
      }
      const M = [(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2], dx = Bp[0] - A[0], dy = Bp[1] - A[1], Cq = [M[0] - dy * bend, M[1] + dx * bend];
      const pts = Array.from({ length: 21 }, (_, t) => { const u = t / 20; return [(1 - u) * (1 - u) * A[0] + 2 * u * (1 - u) * Cq[0] + u * u * Bp[0], (1 - u) * (1 - u) * A[1] + 2 * u * (1 - u) * Cq[1] + u * u * Bp[1]]; });
      b += pline(pts, "", `fill="none" style="stroke:${col}" stroke-width="2"`);
      b += arrowOn(pts.slice(0, 17), 1, `${col}`, 8);
    });
  });
  for (let i = 0; i < n; i++) {
    const q = pos(i);
    b += circ(q[0], q[1], o.hl === i ? 13 : 11, `sv-pt${o.hl === i ? " ptsel" : ""}`, `data-pt="${i}" style="fill:${sheetVar(i)}"`);
    b += txt(q[0], q[1] + 4, (o.labels || [])[i] ?? String(i + 1), "sv-small ui-t", 'text-anchor="middle" style="fill:var(--panel);font-weight:700"');
  }
  let ly = 16;
  for (const g of o.gens) { b += line([10, ly - 4], [30, ly - 4], "", `style="stroke:${g.color}" stroke-width="3"`) + txt(36, ly, g.name, "sv-label"); ly += 18; }
  return svg(w, h, b, o.label || `Monodromy graph on ${n} points`);
}

/* ----- a fibre, pulled out: n points with labels; optional arrows i → perm(i) ----- */
function fibreFig(o) {
  const n = o.n, w = o.w ?? 260, h = o.h ?? 240;
  const layout = o.layout ?? (n <= 6 ? "column" : "circle");
  const pos = layout === "column"
    ? (i) => [w * 0.6, h - 30 - (i * (h - 60)) / Math.max(1, n - 1)]
    : (i) => [w / 2 + Math.min(w, h) * 0.34 * Math.cos(-Math.PI / 2 + (TAU * i) / n), h / 2 + Math.min(w, h) * 0.34 * Math.sin(-Math.PI / 2 + (TAU * i) / n)];
  let b = "";
  if (o.perm) o.perm.forEach((j, i) => {
    if (i === j) return;
    const A = pos(i), Bp = pos(j);
    if (layout === "column") {
      const xr = w * 0.6 + 26 + 10 * Math.abs(j - i), pts = Array.from({ length: 21 }, (_, t) => { const u = t / 20; return [lerp(A[0] + 10, Bp[0] + 10, u) + Math.sin(Math.PI * u) * (xr - A[0]), lerp(A[1], Bp[1], u)]; });
      b += pline(pts, "", `fill="none" style="stroke:${sheetVar(i)}" stroke-width="1.6"`) + arrowOn(pts, 1, `${sheetVar(i)}`, 7);
    } else {
      const pts = Array.from({ length: 21 }, (_, t) => { const u = t / 20; return [lerp(A[0], Bp[0], u), lerp(A[1], Bp[1], u)]; }).slice(2, 18);
      b += pline(pts, "", `fill="none" style="stroke:${sheetVar(i)}" stroke-width="1.6"`) + arrowOn(pts, 1, `${sheetVar(i)}`, 7);
    }
  });
  for (let i = 0; i < n; i++) {
    const q = pos(i);
    b += circ(q[0], q[1], o.hl === i ? 10 : 8, `${sheetCls(i)} sv-pt${o.hl === i ? " ptsel" : ""}`, `data-pt="${i}"`);
    b += txt(layout === "column" ? q[0] - 16 : q[0] + 12, q[1] + 4, (o.labels || [])[i] ?? String(i + 1), "sv-label", layout === "column" ? 'text-anchor="end"' : "");
  }
  if (o.title) b += txt(w / 2, 16, o.title, "sv-label", 'text-anchor="middle"');
  return svg(w, h, b, o.label || `The fibre: ${n} points`);
}

/* ----- the pair of pants, with cuffs 0, 1, ∞ and loops round them ----- */
const PANTS = {
  outline: "M70 40 C70 100 50 150 55 230 L135 230 C137 196 146 170 150 170 C154 170 163 196 165 230 L245 230 C250 150 230 100 230 40 Z",
  leg(y, side) { const t = clamp((y - 170) / 60, 0, 1), inner = lerp(150, 135, t), outer = 55 + (1 - t) * 4; const cx = (inner + outer) / 2, rx = (inner - outer) / 2; return side < 0 ? { cx, rx } : { cx: 300 - cx, rx }; },
  waist(y) { const lx = 70 - (y - 40) * 0.14; return { cx: 150, rx: 150 - lx }; },
};
function pantsLoop(cx, cy, rx, ry, cls, name, hl, dir = 1) {
  const front = Array.from({ length: 41 }, (_, k) => [cx + rx * Math.cos((Math.PI * k) / 40), cy + ry * Math.sin((Math.PI * k) / 40)]);
  const back = Array.from({ length: 41 }, (_, k) => [cx + rx * Math.cos(Math.PI + (Math.PI * k) / 40), cy + ry * Math.sin(Math.PI + (Math.PI * k) / 40)]);
  const fr = dir > 0 ? front.slice().reverse() : front;
  const col = cls === "loop-a" ? "--ga" : cls === "loop-b" ? "--gb" : "--gc";
  return `<g data-loop="${name}" data-drag="${name}">${pline(back, `loop back ${cls}`)}${pline(front, `loop ${cls}${hl ? " hl" : ""}`)}${pline(front, "", 'stroke="transparent" stroke-width="14" fill="none"')}${arrowOn(fr, 0.55, `var(${col})`, 8)}</g>`;
}
/* stage: 0 loops; 1 merge γ₀γ₁ into the waist; 2 γ∞ eliminated. y0, y1 are the leg loops' heights (draggable). */
function pantsFig(o = {}) {
  const w = 300, h = 280, st = o.stage ?? 0, y0 = o.y0 ?? 200, y1 = o.y1 ?? 200, m = clamp(o.merge ?? 0, 0, 1);
  let b = pathD(PANTS.outline, "sv-surf");
  b += ell(150, 40, 80, 14, "sv-hole");
  for (const cx of [95, 205]) b += pathD(`M${cx - 40} 230 A40 10 0 0 0 ${cx + 40} 230`, "sv-edge") + pathD(`M${cx - 40} 230 A40 10 0 0 1 ${cx + 40} 230`, "sv-back");
  const wy = 78, W = PANTS.waist(wy);
  const L0 = PANTS.leg(y0, -1), L1 = PANTS.leg(y1, 1);
  const mix = (L, y) => ({ cx: lerp(L.cx, W.cx, m), rx: lerp(L.rx, W.rx, m), cy: lerp(y, wy, m) });
  const a = mix(L0, y0), bb = mix(L1, y1);
  if (st < 2 || o.showAll) {
    b += pantsLoop(W.cx, wy - 2, W.rx, 12, "loop-c", "ginf", o.hl === "ginf", -1);
    b += txt(242, 74, "γ∞", "sv-big", st === 2 ? 'opacity=".3"' : "");
  }
  b += pantsLoop(a.cx, a.cy, a.rx, 7, "loop-a", "g0", o.hl === "g0") + pantsLoop(bb.cx, bb.cy, bb.rx, 7, "loop-b", "g1", o.hl === "g1");
  b += txt(a.cx - a.rx - 26, a.cy + 6, st === 2 ? "a" : "γ₀", "sv-big") + txt(bb.cx + bb.rx + 6, bb.cy + 6, st === 2 ? "b" : "γ₁", "sv-big");
  b += txt(150, 22, "∞", "sv-big", 'text-anchor="middle"') + txt(95, 258, "0", "sv-big", 'text-anchor="middle"') + txt(205, 258, "1", "sv-big", 'text-anchor="middle"');
  if (m > 0.05) b += txt(150, 120, "γ₀γ₁ ≃ γ∞⁻¹", "sv-label", `text-anchor="middle" opacity="${n1(m)}"`);
  if (st === 2) b += txt(150, 120, "π₁ = F₂ = ⟨a, b⟩", "sv-label", 'text-anchor="middle"');
  if (o.probe) b += circ(150, 150, 6, "sv-probe");
  return svg(w, h, b, o.label || "The thrice-punctured sphere as a pair of pants");
}

/* ----- Spec scenes (algebraic schematic grammar) ----- */
function specCFig(n, o = {}) {
  const w = 300, h = 240;
  let b = circ(150, 200, 8, "", 'style="fill:var(--alg)"') + txt(166, 205, "Spec ℂ", "sv-label");
  for (let i = 0; i < n; i++) {
    const x = 150 + (i - (n - 1) / 2) * 40;
    b += circ(x, 70, 7, `${sheetCls(i)} sv-pt`, `data-pt="${i}"`) + line([x, 80], [150, 188], "sv-dash");
  }
  b += txt(150, 36, n > 1 ? `Spec ℂ[x]/(f), deg f = ${n}: ${n} separate points` : "Spec ℂ: itself", "sv-small ui-t", 'text-anchor="middle"');
  b += txt(150, 128, n > 1 ? "disconnected: no connected cover of degree > 1" : "", "sv-small ui-t", 'text-anchor="middle" style="fill:var(--bad)"');
  return svg(w, h, b, o.label || "Spec C: a single algebraic point");
}
function specRFig(s, o = {}) {
  const w = 300, h = 240, ph = clamp(s, 0, 1) * Math.PI;
  let b = circ(150, 205, 8, "", 'style="fill:var(--alg)"') + txt(166, 210, "Spec ℝ", "sv-label");
  b += line([150, 195], [150, 130], "sv-line") + arrowHead([150, 195], Math.PI / 2, "var(--fg)", 7);
  b += txt(158, 165, "Spec ℂ → Spec ℝ", "sv-small ui-t");
  const p = (k) => { const a = Math.PI + ph + k * Math.PI; return [150 + 70 * Math.cos(a), 90 + 26 * Math.sin(a)]; };
  b += ell(150, 90, 70, 26, "sv-dash");
  const lab = ["i", "−i"];
  for (let k = 0; k < 2; k++) { const q = p(k); b += circ(q[0], q[1], 8, `${sheetCls(k)} sv-pt${o.hl === k ? " ptsel" : ""}`, `data-pt="${k}"`) + txt(q[0] - 6, q[1] - 14, lab[k], "sv-big"); }
  b += txt(150, 30, "z ⟷ z̄ : complex conjugation", "sv-small ui-t", 'text-anchor="middle"');
  return svg(w, h, b, o.label || "Spec R with its conjugate geometric fibre");
}
/* The tower F_q ⊂ F_{q²} ⊂ … with a necklace of n embeddings at level n, Frobenius rotating level sel by s. */
function towerFig(q, N, sel, s, labels, o = {}) {
  const w = o.w ?? 320, h = o.h ?? Math.max(260, 56 * N + 40);
  let b = "";
  const yAt = (n) => h - 30 - ((n - 1) * (h - 70)) / Math.max(1, N - 1);
  for (let n = 1; n <= N; n++) {
    const y = yAt(n), cx = 210, r = n === 1 ? 0 : 14 + 2.4 * n, on = n === sel;
    b += txt(20, y + 5, `𝔽${E.sub(q)}${n > 1 ? E.sup(n) : ""}`, on ? "sv-big" : "sv-label", on ? 'style="font-weight:700"' : "");
    if (n < N) b += line([42, y - 10], [42, yAt(n + 1) + 10], "sv-alg2");
    if (n === 1) { b += circ(cx, y, 6, "", 'style="fill:var(--alg)"'); continue; }
    b += circ(cx, y, r, "sv-faint");
    const rot = on ? s : 0;
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (TAU * (k + rot)) / n, p = [cx + r * Math.cos(a), y + r * 0.62 * Math.sin(a)];
      b += circ(p[0], p[1], on ? 6 : 4, `${sheetCls(k)} sv-pt${on && o.hl === k ? " ptsel" : ""}`, on ? `data-pt="${k}"` : "");
    }
    if (on) b += txt(cx + r + 12, y + 4, "Frob: x ↦ x^q", "sv-small ui-t");
  }
  b += txt(20, 18, `… ⊂ 𝔽̄${E.sub(q)}`, "sv-label");
  return svg(w, h, b, o.label || "The tower of finite fields with Frobenius necklaces");
}
