/* The page: laboratory, modules, palette, notation, theme, export and WebMCP tools. All mathematics comes
   from self.RiemannRoch (the engine block); this file only draws it and wires the controls. */
(function () {
"use strict";
const RR = self.RiemannRoch;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = RR.fmt, sup = RR.sup;
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } } };
const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
const TITLES = {};
function draw(id, html) {
  const s = $(id);
  if (!(id in TITLES)) { const t = s.querySelector("title"); TITLES[id] = (t && typeof t.textContent === "string" && t.textContent) || ""; }
  s.innerHTML = (TITLES[id] ? `<title>${esc(TITLES[id])}</title>` : "") + html;
}
/* Affine frame: data box → SVG box. */
function frame(x0, x1, y0, y1, W, H, pad = 16) {
  const sx = (W - 2 * pad) / (x1 - x0), sy = (H - 2 * pad) / (y1 - y0);
  return { X: (x) => pad + (x - x0) * sx, Y: (y) => H - pad - (y - y0) * sy, ix: (px) => x0 + (px - pad) / sx, iy: (py) => y0 + (H - pad - py) / sy, W, H, x0, x1, y0, y1 };
}
const path = (pts, F) => pts.length ? "M" + pts.map(([x, y]) => `${F.X(x).toFixed(1)} ${F.Y(y).toFixed(1)}`).join("L") : "";
function svgXY(svg, ev) {
  const r = svg.getBoundingClientRect(), vb = (svg.getAttribute("viewBox") || "0 0 640 420").split(" ").map(Number);
  return [((ev.clientX - r.left) / (r.width || 1)) * vb[2], ((ev.clientY - r.top) / (r.height || 1)) * vb[3]];
}
/* Marching squares for the real locus of F(x, y) = 0. */
function contour(fn, x0, x1, y0, y1, nx = 120, ny = 120) {
  const segs = [], dx = (x1 - x0) / nx, dy = (y1 - y0) / ny, v = [];
  for (let i = 0; i <= nx; i++) { v.push([]); for (let j = 0; j <= ny; j++) v[i].push(fn(x0 + i * dx, y0 + j * dy)); }
  const lerp = (a, b, fa, fb) => a + ((b - a) * fa) / (fa - fb);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const xa = x0 + i * dx, ya = y0 + j * dy, f = [v[i][j], v[i + 1][j], v[i + 1][j + 1], v[i][j + 1]];
    const P = [[xa, ya], [xa + dx, ya], [xa + dx, ya + dy], [xa, ya + dy]], cut = [];
    for (let k = 0; k < 4; k++) { const a = P[k], b = P[(k + 1) % 4], fa = f[k], fb = f[(k + 1) % 4]; if ((fa < 0) !== (fb < 0)) cut.push([lerp(a[0], b[0], fa, fb), lerp(a[1], b[1], fa, fb)]); }
    if (cut.length === 2) segs.push(cut); else if (cut.length === 4) segs.push([cut[0], cut[1]], [cut[2], cut[3]]);
  }
  return segs;
}
const segPath = (segs, F) => segs.map(([a, b]) => `M${F.X(a[0]).toFixed(1)} ${F.Y(a[1]).toFixed(1)}L${F.X(b[0]).toFixed(1)} ${F.Y(b[1]).toFixed(1)}`).join("");
/* Projection of 3D points with a rotation (yaw, pitch). */
function proj3(p, rot) {
  const [x, y, z] = p, cy = Math.cos(rot.yaw), sy = Math.sin(rot.yaw), cp = Math.cos(rot.pitch), sp = Math.sin(rot.pitch);
  const x1 = cy * x + sy * z, z1 = -sy * x + cy * z, y1 = cp * y - sp * z1, z2 = sp * y + cp * z1;
  return [x1, y1, z2];
}
const ROT = { "map-svg": { yaw: 0.6, pitch: 0.35 }, "ver-svg": { yaw: 0.6, pitch: 0.35 } };
function rotatable(id, redraw) {
  const s = $(id); let drag = null;
  s.addEventListener("pointerdown", (e) => { drag = [e.clientX, e.clientY]; try { s.setPointerCapture(e.pointerId); } catch { /* not capturable */ } });
  s.addEventListener("pointermove", (e) => { if (!drag) return; const r = ROT[id]; r.yaw += (e.clientX - drag[0]) * 0.01; r.pitch = Math.max(-1.4, Math.min(1.4, r.pitch + (e.clientY - drag[1]) * 0.01)); drag = [e.clientX, e.clientY]; redraw(); });
  s.addEventListener("pointerup", () => { drag = null; });
  s.addEventListener("keydown", (e) => { const r = ROT[id], k = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key]; if (!k) return; e.preventDefault(); r.yaw += k[0]; r.pitch = Math.max(-1.4, Math.min(1.4, r.pitch + k[1])); redraw(); });
}
/* Draw a 3D polyline set (already centred and scaled to about [−1, 1]³) with axes. */
function draw3(id, lines, rot, opts = {}) {
  const W = 360, H = opts.H || 300, s = opts.scale || 100, cx = W / 2, cy = H / 2;
  const P = (p) => { const q = proj3(p, rot); return [cx + s * q[0], cy - s * q[1], q[2]]; };
  let out = "";
  for (const [ax, lab] of [[[1.2, 0, 0], opts.labels?.[0] || "X₁"], [[0, 1.2, 0], opts.labels?.[1] || "X₂"], [[0, 0, 1.2], opts.labels?.[2] || "X₃"]]) {
    const a = P([0, 0, 0]), b = P(ax); out += `<line class="axis" x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}"/><text class="lblm" x="${b[0].toFixed(1)}" y="${b[1].toFixed(1)}">${esc(lab)}</text>`;
  }
  for (const L of lines) {
    const pts = L.pts.map(P).filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]));
    if (L.dots) for (const q of pts) out += `<circle class="${L.cls || "imgpt"}" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${L.r || 4}"/>`;
    else out += `<path class="${L.cls || "img"}" d="M${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join("L")}"/>`;
  }
  return out;
}

/* ================= state ================= */
const LETTERS = "PQRSTUVWABCDEFGHJKLMN";
const ST = {
  curve: "P1", p1view: "sphere", E: { a: -1, b: 1 }, hyper: { g: 2, even: false, f: [0, 4, 0, -5, 0, 1] }, plane: { d: 4, n: 1, c: 0.3 }, abs: { g: 2, kind: "points", deg: 3 },
  div: { P1: [{ p: RR.INF, n: 3, label: "∞" }], elliptic: [{ p: RR.O, n: 3, label: "O" }], hyperelliptic: [{ p: { inf: true }, n: 3, label: "∞" }], abstract: [{ p: { u: 0.3, v: 0.5 }, n: 2, label: "P" }, { p: { u: 0.62, v: 0.4 }, n: 1, label: "Q" }] },
  sign: 1, sel: 0, layers: { curve: true, divisor: true, functions: true, linsys: true, map: true }, fnSel: null, rrFocus: null, preset: "p1-3inf",
};
const hyperRoots = (n) => Array.from({ length: n }, (_, i) => Math.round((i - (n - 1) / 2) * (n > 6 ? 0.55 : 0.8) * 100) / 100);
const fromRoots = (rs) => rs.reduce((p, r) => { const q = new Array(p.length + 1).fill(0); p.forEach((c, i) => { q[i + 1] += c; q[i] -= r * c; }); return q; }, [1]);
function setHyperGenus(g, even) { ST.hyper = { g, even, f: fromRoots(hyperRoots(even ? 2 * g + 2 : 2 * g + 1)).map((c) => Math.round(c * 1e6) / 1e6) }; ST.div.hyperelliptic = even ? [{ p: { inf: "+" }, n: g, label: "∞₊" }, { p: { inf: "-" }, n: g, label: "∞₋" }] : [{ p: { inf: true }, n: 2 * g + 1, label: "∞" }]; }
const hyperOdd = () => (ST.hyper.f.length - 1) % 2 === 1;
const keyOf = () => ({ P1: RR.p1key, elliptic: RR.eckey, hyperelliptic: RR.hkey }[ST.curve] || ((p) => `${p.u},${p.v}`));
function labState() {
  const c = ST.curve;
  if (c === "P1") return { curve: { type: "P1" }, divisor: ST.div.P1.map(({ p, n }) => ({ p, n })) };
  if (c === "elliptic") return { curve: { type: "elliptic", a: ST.E.a, b: ST.E.b }, divisor: ST.div.elliptic.map(({ p, n }) => ({ p, n })) };
  if (c === "hyperelliptic") return { curve: { type: "hyperelliptic", f: ST.hyper.f.slice() }, divisor: ST.div.hyperelliptic.map(({ p, n }) => ({ p, n })) };
  if (c === "plane") return { curve: { type: "plane", d: ST.plane.d }, divisor: { hyper: ST.plane.n } };
  return { curve: { type: "abstract", g: ST.abs.g }, divisor: ST.abs.kind === "points" ? { kind: "points", points: ST.div.abstract.map(({ p, n, label }) => ({ p, n, label })) } : { kind: ST.abs.kind, deg: ST.abs.deg } };
}
let A = null; // the current analysis
function nextLabel(list) { const used = new Set(list.map((t) => t.label)); return [...LETTERS].find((l) => !used.has(l)) || "P"; }
function currentList() { return ST.div[ST.curve]; }
function addPoint(p, n, label) {
  const list = currentList(); if (!list) return;
  const k = keyOf()(p), hit = list.findIndex((t) => keyOf()(t.p) === k);
  if (hit >= 0) { list[hit].n += n; ST.sel = hit; if (!list[hit].n) { list.splice(hit, 1); ST.sel = 0; } }
  else { list.push({ p, n, label: label || nextLabel(list) }); ST.sel = list.length - 1; }
  ST.preset = null; update();
}

/* ================= curve geometry in the laboratory ================= */
const GH = 420;
/* P¹ as a sphere: rotation about the x-axis by TILT so ∞ (north pole) leans towards the viewer. */
const TILT = 0.42, YAW = 0.55, SC = [320, 215], SR = 170;
function sph2scr([X0, Y0, Z]) { const X = Math.cos(YAW) * X0 - Math.sin(YAW) * Y0, Y = Math.sin(YAW) * X0 + Math.cos(YAW) * Y0; const y = Math.cos(TILT) * Y - Math.sin(TILT) * Z, z = Math.sin(TILT) * Y + Math.cos(TILT) * Z; return [SC[0] + SR * X, SC[1] - SR * z, -y]; }
function scr2sph(px, py) {
  const X = (px - SC[0]) / SR, zz = -(py - SC[1]) / SR, r2 = X * X + zz * zz;
  if (r2 > 1) return null;
  const y = -Math.sqrt(1 - r2); // front hemisphere faces the viewer (negative y in the rotated frame)
  const Y = Math.cos(TILT) * y + Math.sin(TILT) * zz, Z = -Math.sin(TILT) * y + Math.cos(TILT) * zz;
  return [Math.cos(YAW) * X + Math.sin(YAW) * Y, -Math.sin(YAW) * X + Math.cos(YAW) * Y, Z];
}
const PF = frame(-4, 4, -2.4, 2.4, 560, GH, 24); // complex-plane chart; ∞ sits outside at the right
const INF_XY = [600, 60];
function p1pos(p) {
  if (ST.p1view === "sphere") { const s = sph2scr(RR.toSphere(p)); return { x: s[0], y: s[1], back: s[2] < 0 }; }
  if (p.inf) return { x: INF_XY[0], y: INF_XY[1] };
  const x = PF.X(p.re), y = PF.Y(p.im || 0);
  return { x: Math.max(8, Math.min(552, x)), y: Math.max(8, Math.min(GH - 8, y)), clipped: x < 8 || x > 552 || y < 8 || y > GH - 8 };
}
function ecFrame() { const r = RR.ecCubicRoots(ST.E), lo = Math.min(-2, r[0] - 0.6), hi = Math.max(3, r.at(-1) + 2.2); const ym = Math.sqrt(Math.max(1, RR.ecf(ST.E, hi))) * 1.05; return frame(lo, hi, -Math.min(ym, 6), Math.min(ym, 6), 560, GH, 24); }
const OXY = [600, 40];
function hyperFrame() { const rs = RR.realRoots(ST.hyper.f); const lo = (rs[0] ?? -2) - 0.7, hi = (rs.at(-1) ?? 2) + (hyperOdd() ? 0.9 : 0.7); let ym = 0.5; for (let i = 0; i <= 200; i++) { const x = lo + ((hi - lo) * i) / 200, v = RR.peval(ST.hyper.f, x); if (v > 0) ym = Math.max(ym, Math.sqrt(v)); } ym = Math.min(ym * 1.1, 6); return frame(lo, hi, -ym, ym, 560, GH, 24); }
function hyperLocus(F) {
  const f = ST.hyper.f, N = 500, br = [[], []]; let cur = null; const parts = [];
  for (let i = 0; i <= N; i++) {
    const x = F.x0 + ((F.x1 - F.x0) * i) / N, v = RR.peval(f, x);
    if (v >= 0) { if (!cur) { cur = []; parts.push(cur); } cur.push([x, Math.sqrt(v)]); } else cur = null;
  }
  void br;
  return parts;
}
function planeF(d) { return { 1: (x, y) => y - 0, 2: (x, y) => x * x + y * y - 1, 3: (x, y) => y * y - x * x * x + x, 4: (x, y) => x ** 4 + y ** 4 - 1 }[d] || ((x, y) => x ** 4 + y ** 4 - 1); }
const PLANE_NAME = { 1: "line y = 0", 2: "conic x² + y² = 1", 3: "cubic y² = x³ − x", 4: "quartic x⁴ + y⁴ = 1" };
const PLANE_FORM = { 1: "line", 2: "conic", 3: "cubic", 4: "quartic" };
const planeFrame = () => frame(-2, 2, -1.6, 1.6, 640, GH, 24);
/* Abstract genus-g surface: a long rounded body with g holes. */
function surfaceSvg(g, cx, cy, w, h, cls = "surf") {
  let out = `<rect class="${cls}" x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}"/>`;
  for (let k = 0; k < g; k++) {
    const hx = cx - w / 2 + (w * (k + 1)) / (g + 1), hw = Math.min(46, w / (g + 1) / 2.4);
    out += `<path class="hole" d="M${hx - hw} ${cy - 2} Q ${hx} ${cy + 14} ${hx + hw} ${cy - 2} Q ${hx} ${cy - 12} ${hx - hw} ${cy - 2}Z"/><path fill="none" stroke="var(--curve)" stroke-width="1.6" d="M${hx - hw - 6} ${cy + 3} Q ${hx} ${cy + 22} ${hx + hw + 6} ${cy + 3}"/>`;
  }
  return out;
}
const ABS = { cx: 320, cy: 210, w: 560, h: 220 };

/* Where a divisor point sits on screen (null if it cannot be drawn on this picture). */
function pointXY(p) {
  const c = ST.curve;
  if (c === "P1") return p1pos(p);
  if (c === "elliptic") { if (p.inf) return { x: OXY[0], y: OXY[1] }; const F = ecFrame(); return { x: F.X(p.x), y: F.Y(p.y) }; }
  if (c === "hyperelliptic") { if (p.inf) return { x: OXY[0] - (p.inf === "-" ? 0 : 0), y: p.inf === "-" ? OXY[1] + 50 : OXY[1] }; const F = hyperFrame(); return { x: F.X(p.x), y: F.Y(p.y) }; }
  if (c === "abstract") return { x: ABS.cx - ABS.w / 2 + p.u * ABS.w, y: ABS.cy - ABS.h / 2 + p.v * ABS.h };
  return null;
}
/* Stacked markers: filled dots for positive coefficients, rings for poles, a label with the multiplicity. */
function marker(x, y, n, label, opts = {}) {
  const k = Math.abs(n), cls = n > 0 ? "pos" : "neg", out = [], shown = Math.min(k, 5);
  for (let i = 0; i < shown; i++) out.push(`<circle class="${cls}" cx="${(x + (i - (shown - 1) / 2) * 9).toFixed(1)}" cy="${(y - (opts.up ? 12 : 0)).toFixed(1)}" r="${n > 0 ? 5.5 : 5}" ${opts.back ? 'opacity=".45"' : ""}/>`);
  if (opts.sel) out.push(`<circle class="sel" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${12 + shown * 3}"/>`);
  out.push(`<text class="lbl" x="${(x + 10 + shown * 4.5).toFixed(1)}" y="${(y - 8).toFixed(1)}">${esc((n > 0 ? "+" : "−") + (k > 1 ? k : "") + label)}</text>`);
  return out.join("");
}
function drawGeo() {
  const c = ST.curve, L = ST.layers; let g = "";
  let caption = "";
  if (c === "P1") {
    if (ST.p1view === "sphere") {
      if (L.curve) {
        g += `<circle cx="${SC[0]}" cy="${SC[1]}" r="${SR}" fill="var(--panel)" stroke="var(--curve)" stroke-width="1.8"/>`;
        for (const lat of [-0.66, -0.33, 0, 0.33, 0.66]) { const pts = []; for (let k = 0; k <= 72; k++) { const t = (2 * Math.PI * k) / 72, r = Math.sqrt(1 - lat * lat); pts.push(sph2scr([r * Math.cos(t), r * Math.sin(t), lat])); } g += `<path class="grid" d="M${pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L")}"/>`; }
        const real = []; for (let k = 0; k <= 120; k++) { const t = (2 * Math.PI * k) / 120; real.push(sph2scr([Math.sin(t), 0, Math.cos(t)])); }
        g += `<path class="curve" d="M${real.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L")}" stroke-dasharray="none" opacity=".75"/>`;
        for (const [p, lab] of [[RR.cx(0), "0"], [RR.cx(1), "1"], [RR.cx(-1), "−1"], [RR.INF, "∞"], [RR.cx(0, 1), "i"]]) { const s = sph2scr(RR.toSphere(p)); g += `<text class="lblm" x="${(s[0] + 6).toFixed(1)}" y="${(s[1] + 14).toFixed(1)}" opacity="${s[2] < 0 ? 0.5 : 1}">${lab}</text>`; }
      }
      caption = "The Riemann sphere P¹(ℂ): ∞ is the north pole, 0 the south pole; the dark great circle is ℝ ∪ {∞}. Click the front of the sphere to place a point.";
    } else {
      if (L.curve) {
        g += `<rect x="0" y="0" width="560" height="${GH}" fill="none"/><line class="axis" x1="${PF.X(-4)}" y1="${PF.Y(0)}" x2="${PF.X(4)}" y2="${PF.Y(0)}"/><line class="axis" x1="${PF.X(0)}" y1="${PF.Y(-2.4)}" x2="${PF.X(0)}" y2="${PF.Y(2.4)}"/>`;
        g += `<line class="curve" x1="${PF.X(-4)}" y1="${PF.Y(0)}" x2="${PF.X(4)}" y2="${PF.Y(0)}"/>`;
        for (let k = -4; k <= 4; k++) g += `<text class="lblm" x="${PF.X(k) - 4}" y="${PF.Y(0) + 16}">${k}</text>`;
        g += `<circle cx="${INF_XY[0]}" cy="${INF_XY[1]}" r="16" fill="var(--panel)" stroke="var(--curve)" stroke-width="1.6"/><text x="${INF_XY[0] - 5}" y="${INF_XY[1] + 5}" font-size="16">∞</text>`;
      }
      caption = "The affine line ℂ (real axis dark) plus the point ∞ (circle). Click the plane to add a point, the circle to add ∞.";
    }
  } else if (c === "elliptic") {
    const F = ecFrame();
    if (L.curve) {
      g += `<line class="axis" x1="${F.X(F.x0)}" y1="${F.Y(0)}" x2="${F.X(F.x1)}" y2="${F.Y(0)}"/><line class="axis" x1="${F.X(0)}" y1="${F.Y(F.y0)}" x2="${F.X(0)}" y2="${F.Y(F.y1)}"/>`;
      for (const comp of RR.ecRealLocus(ST.E, F.x0, F.x1)) { const pts = [...comp.upper.slice().reverse(), ...comp.lower]; g += `<path class="curve" d="${path(pts.filter(([, y]) => Math.abs(y) <= F.y1 * 1.2), F)}${comp.closed ? "Z" : ""}"/>`; }
      g += `<circle cx="${OXY[0]}" cy="${OXY[1]}" r="16" fill="var(--panel)" stroke="var(--curve)" stroke-width="1.6"/><text x="${OXY[0] - 6}" y="${OXY[1] + 5}" font-size="15">O</text><text class="lblm" x="${OXY[0] - 32}" y="${OXY[1] + 34}">at ∞ = [0:1:0]</text>`;
    }
    caption = `E: y² = ${RR.pstr([ST.E.b, ST.E.a, 0, 1])}, real locus (the complex curve is a torus). Click near the curve to place a point; the circle is O.`;
  } else if (c === "hyperelliptic") {
    const F = hyperFrame();
    if (L.curve) {
      g += `<line class="axis" x1="${F.X(F.x0)}" y1="${F.Y(0)}" x2="${F.X(F.x1)}" y2="${F.Y(0)}"/>`;
      for (const part of hyperLocus(F)) { const pts = [...part.slice().reverse(), ...part.map(([x, y]) => [x, -y])]; g += `<path class="curve" d="${path(pts, F)}"/>`; }
      for (const r of RR.realRoots(ST.hyper.f)) g += `<circle class="branch" cx="${F.X(r).toFixed(1)}" cy="${F.Y(0).toFixed(1)}" r="4.5"/>`;
      if (hyperOdd()) g += `<circle cx="${OXY[0]}" cy="${OXY[1]}" r="16" fill="var(--panel)" stroke="var(--curve)" stroke-width="1.6"/><text x="${OXY[0] - 6}" y="${OXY[1] + 5}" font-size="15">∞</text>`;
      else g += `<circle cx="${OXY[0]}" cy="${OXY[1]}" r="15" fill="var(--panel)" stroke="var(--curve)"/><text x="${OXY[0] - 9}" y="${OXY[1] + 5}" font-size="13">∞₊</text><circle cx="${OXY[0]}" cy="${OXY[1] + 50}" r="15" fill="var(--panel)" stroke="var(--curve)"/><text x="${OXY[0] - 9}" y="${OXY[1] + 55}" font-size="13">∞₋</text>`;
    }
    const nb = RR.hyperBranchCount(ST.hyper.f.length - 1);
    caption = `y² = ${RR.pstr(ST.hyper.f)}, genus ${RR.hyperGenus(ST.hyper.f.length - 1)}: real locus with the ${RR.realRoots(ST.hyper.f).length} real branch points (orange) of x : C → P¹${hyperOdd() ? " (∞ is the remaining branch point)" : ""}; ${nb} in all.`;
  } else if (c === "plane") {
    const F = planeFrame(), d = ST.plane.d;
    if (L.curve) {
      g += `<line class="axis" x1="${F.X(-2)}" y1="${F.Y(0)}" x2="${F.X(2)}" y2="${F.Y(0)}"/><line class="axis" x1="${F.X(0)}" y1="${F.Y(-1.6)}" x2="${F.X(0)}" y2="${F.Y(1.6)}"/>`;
      g += `<path class="curve" d="${segPath(contour(planeF(d), -2, 2, -1.6, 1.6, 140, 110), F)}"/>`;
    }
    const lc = ST.plane.c;
    if (L.divisor) {
      g += `<line class="curve2" x1="${F.X(-2)}" y1="${F.Y(lc)}" x2="${F.X(2)}" y2="${F.Y(lc)}" stroke-dasharray="6 4"/><text class="lblm" x="${F.X(-1.95)}" y="${F.Y(lc) - 6}">H: y = ${fmt(lc, 3)}</text>`;
      const ix = RR.intersect(RR.PLANE[PLANE_FORM[d]].F, RR.lineForm(0, 100, -Math.round(lc * 100)));
      for (const p of ix.points) if (p.real && p.affine) g += marker(F.X(p.x.re), F.Y(p.y.re), ST.plane.n * p.m, "");
      const nreal = ix.points.filter((p) => p.real && p.affine).reduce((s, p) => s + p.m, 0);
      caption = `${PLANE_NAME[d]} (real locus). D = ${ST.plane.n}H, drawn as ${ST.plane.n}·(C ∩ H) with H the dashed line: ${nreal} of the ${d} intersection points are real here, the rest complex. Click to move the line.`;
    }
  } else {
    g += L.curve ? surfaceSvg(ST.abs.g, ABS.cx, ABS.cy, ABS.w, ABS.h) : "";
    caption = `A smooth projective curve of genus ${ST.abs.g}, drawn as a surface with ${ST.abs.g} handle${ST.abs.g === 1 ? "" : "s"} (schematic). Click it to place points; positions are not coordinates.`;
  }
  /* divisor */
  const list = currentList();
  if (L.divisor && list && !(c === "abstract" && ST.abs.kind !== "points")) list.forEach((t, i) => { const q = pointXY(t.p); if (q) g += marker(q.x, q.y, t.n, t.label, { sel: i === ST.sel, back: q.back }); });
  if (c === "abstract" && ST.abs.kind !== "points") g += `<text class="lbl" x="${ABS.cx - 160}" y="${ABS.cy + ABS.h / 2 + 30}">${esc(A.divisor)} — a class, not a set of drawn points</text>`;
  /* functions layer: zeros and poles of the selected basis function */
  if (L.functions && c === "P1" && ST.fnSel !== null && A.basisF && A.basisF[ST.fnSel]) {
    for (const t of RR.p1div(A.basisF[ST.fnSel])) { const q = p1pos(t.p); g += `<circle class="${t.n > 0 ? "zero" : "pole"}" cx="${q.x.toFixed(1)}" cy="${(q.y + 16).toFixed(1)}" r="6"/><text class="lblm" x="${(q.x + 9).toFixed(1)}" y="${(q.y + 30).toFixed(1)}">ord ${t.n > 0 ? "" : "−"}${Math.abs(t.n)}</text>`; }
  }
  /* canonical divisor on demand */
  if (ST.rrFocus === "K") g += kOverlay();
  /* base points */
  if (L.linsys) for (const bp of basePointsXY()) g += `<circle class="bp" cx="${bp.x.toFixed(1)}" cy="${bp.y.toFixed(1)}" r="20"/><text class="lbl" x="${(bp.x - 34).toFixed(1)}" y="${(bp.y + 36).toFixed(1)}" fill="var(--bad)" style="fill:var(--bad);font-weight:700">BASE POINT</text>`;
  draw("geo-svg", g);
  $("geo-caption").textContent = caption + (ST.rrFocus === "K" ? `  Showing K (deg K = ${A.degK}).` : "");
}
function kOverlay() {
  const c = ST.curve;
  const ring = (x, y, txt) => `<circle cx="${x}" cy="${y}" r="24" fill="none" stroke="var(--fn)" stroke-width="3" stroke-dasharray="4 3"/><text class="lbl" x="${x - 30}" y="${y + 42}" style="fill:var(--fn);font-weight:700">${esc(txt)}</text>`;
  if (c === "P1") { const q = p1pos(RR.INF); return ring(q.x, q.y, "K = div(dx) = −2∞"); }
  if (c === "elliptic") return `<text class="lbl" x="40" y="40" style="fill:var(--fn);font-weight:700">K = div(dx/y) = 0: dx/y has no zeros or poles</text>`;
  if (c === "hyperelliptic") return hyperOdd() ? ring(OXY[0], OXY[1], `K = ${A.K}`) : ring(OXY[0], OXY[1] + 25, `K = ${A.K}`);
  if (c === "plane") return `<text class="lbl" x="40" y="40" style="fill:var(--fn);font-weight:700">K = (d − 3)H = ${esc(A.K)}: cut by ${ST.plane.d - 3 >= 0 ? ST.plane.d - 3 : "minus 1 times"} line${ST.plane.d - 3 === 1 ? "" : "s"}</text>`;
  return `<text class="lbl" x="40" y="40" style="fill:var(--fn);font-weight:700">K: ${2 * ST.abs.g - 2} points (zeros of a holomorphic differential)</text>`;
}
function basePointsXY() {
  const c = ST.curve, out = [];
  if (c === "elliptic" && A.stages && A.stages.basePoint) { const q = pointXY(A.stages.basePoint); if (q) out.push(q); }
  if (c === "hyperelliptic" && A.basePoints && A.basePoints.length) out.push({ x: OXY[0], y: OXY[1] });
  return out;
}

/* ================= geometry interaction ================= */
let dragging = null, downAt = null;
function hitPoint(px, py) {
  const list = currentList(); if (!list || (ST.curve === "abstract" && ST.abs.kind !== "points")) return -1;
  let best = -1, bd = 18;
  list.forEach((t, i) => { const q = pointXY(t.p); if (q) { const d = Math.hypot(q.x - px, q.y - py); if (d < bd) { bd = d; best = i; } } });
  return best;
}
/* The curve point under (px, py), or null. */
function snap(px, py) {
  const c = ST.curve;
  if (c === "P1") {
    if (ST.p1view === "sphere") {
      const s = scr2sph(px, py); if (!s) return null;
      const p = RR.fromSphere(s); return p.inf || Math.hypot(p.re, p.im) > 60 ? RR.INF : RR.cx(Math.round(p.re * 100) / 100, Math.round(p.im * 100) / 100);
    }
    if (Math.hypot(px - INF_XY[0], py - INF_XY[1]) < 22) return RR.INF;
    if (px > 560) return null;
    let re = PF.ix(px), im = PF.iy(py);
    if (Math.abs(im) < 0.15) im = 0;
    return RR.cx(Math.round(re * 10) / 10, Math.round(im * 10) / 10);
  }
  if (c === "elliptic") {
    if (Math.hypot(px - OXY[0], py - OXY[1]) < 22) return RR.O;
    const F = ecFrame(), q = RR.ecNearest(ST.E, F.ix(px), F.iy(py));
    if (!q || Math.hypot(F.X(q.x) - px, F.Y(q.y) - py) > 30) return null;
    return { x: q.x, y: q.y };
  }
  if (c === "hyperelliptic") {
    if (Math.hypot(px - OXY[0], py - OXY[1]) < 22) return hyperOdd() ? { inf: true } : { inf: "+" };
    if (!hyperOdd() && Math.hypot(px - OXY[0], py - OXY[1] - 50) < 22) return { inf: "-" };
    const F = hyperFrame(); let best = null, bd = 30;
    for (const part of hyperLocus(F)) for (const [x, y] of part) for (const s of [1, -1]) { const d = Math.hypot(F.X(x) - px, F.Y(s * y) - py); if (d < bd) { bd = d; best = { x, y: s * y }; } }
    return best;
  }
  if (c === "abstract") {
    const u = (px - (ABS.cx - ABS.w / 2)) / ABS.w, v = (py - (ABS.cy - ABS.h / 2)) / ABS.h;
    if (u < 0.03 || u > 0.97 || v < 0.05 || v > 0.95) return null;
    return { u: Math.round(u * 1000) / 1000, v: Math.round(v * 1000) / 1000 };
  }
  return null;
}
function geoDown(ev) {
  const [px, py] = svgXY($("geo-svg"), ev);
  if (ST.curve === "plane") { ST.plane.c = Math.round(planeFrame().iy(py) * 100) / 100; update(); return; }
  const hit = hitPoint(px, py);
  downAt = [px, py];
  if (hit >= 0) { ST.sel = hit; dragging = hit; try { $("geo-svg").setPointerCapture(ev.pointerId); } catch { /* not capturable */ } update(); return; }
  if (ST.curve === "abstract" && ST.abs.kind !== "points") { ST.abs.kind = "points"; }
  const p = snap(px, py); if (!p) return;
  addPoint(p, ev.shiftKey ? -1 : ST.sign);
}
function geoMove(ev) {
  if (dragging === null) return;
  const [px, py] = svgXY($("geo-svg"), ev), p = snap(px, py), list = currentList();
  if (!p || !list[dragging]) return;
  if (downAt && Math.hypot(px - downAt[0], py - downAt[1]) < 4) return;
  list[dragging].p = p; ST.preset = null; update();
}
function geoUp() {
  if (dragging !== null) { const list = currentList(); ST.div[ST.curve] = RR.normalize(list, keyOf()).map((t) => ({ ...t, label: t.label || nextLabel(list) })); }
  dragging = null; downAt = null;
}
function geoWheel(ev) {
  const [px, py] = svgXY($("geo-svg"), ev), hit = hitPoint(px, py); if (hit < 0) return;
  ev.preventDefault(); changeMult(hit, ev.deltaY < 0 ? 1 : -1);
}
function changeMult(i, by) {
  const list = currentList(); if (!list || !list[i]) return;
  list[i].n += by; ST.sel = i;
  if (!list[i].n) { list.splice(i, 1); ST.sel = Math.max(0, i - 1); }
  ST.preset = null; update();
}
function nudge(dx, dy) {
  const list = currentList(), t = list && list[ST.sel]; if (!t) return;
  const c = ST.curve;
  if (c === "P1") { if (t.p.inf) return; t.p = RR.cx(Math.round((t.p.re + dx * 0.1) * 100) / 100, Math.round(((t.p.im || 0) + dy * 0.1) * 100) / 100); }
  else if (c === "elliptic") { if (t.p.inf) return; const a = RR.ecAbel(ST.E, t.p); t.p = RR.ecFromAbel(ST.E, a.u + (dx || dy) * 0.01, a.component); if (t.p.inf) t.p = RR.ecFromAbel(ST.E, a.u + (dx || dy) * 0.02, a.component); }
  else if (c === "hyperelliptic") { if (t.p.inf) return; const x = t.p.x + (dx || dy) * 0.03, v = RR.peval(ST.hyper.f, x); if (v >= 0) t.p = { x, y: Math.sign(t.p.y || 1) * Math.sqrt(v) }; }
  else if (c === "abstract") t.p = { u: Math.min(0.95, Math.max(0.05, t.p.u + dx * 0.02)), v: Math.min(0.9, Math.max(0.1, t.p.v - dy * 0.03)) };
  ST.preset = null; update();
}
function geoKey(ev) {
  const list = currentList();
  const k = ev.key;
  if (k === "ArrowLeft") nudge(-1, 0); else if (k === "ArrowRight") nudge(1, 0); else if (k === "ArrowUp") nudge(0, 1); else if (k === "ArrowDown") nudge(0, -1);
  else if (k === "+" || k === "=") changeMult(ST.sel, 1); else if (k === "-" || k === "_") changeMult(ST.sel, -1);
  else if (k === "Delete" || k === "Backspace") { if (list && list[ST.sel]) { list.splice(ST.sel, 1); ST.sel = 0; ST.preset = null; update(); } }
  else if (k === "]" && list && list.length) { ST.sel = (ST.sel + 1) % list.length; update(); }
  else if (k === "[" && list && list.length) { ST.sel = (ST.sel - 1 + list.length) % list.length; update(); }
  else return;
  ev.preventDefault();
}

/* ================= side panel ================= */
const CURVE_BUTTONS = [["P1", "P¹ — sphere / line + ∞"], ["elliptic", "Elliptic y² = x³ + ax + b"], ["hyperelliptic", "Hyperelliptic y² = f(x)"], ["plane", "Smooth plane curve"], ["abstract", "Abstract genus g"]];
function setCurve(c) { ST.curve = c; ST.sel = 0; ST.fnSel = null; ST.rrFocus = null; ST.preset = null; renderSide(); update(); }
function renderSide() {
  $("curve-pick").innerHTML = CURVE_BUTTONS.map(([k, t]) => `<button type="button" data-curve="${k}" aria-pressed="${ST.curve === k}">${esc(t)}</button>`).join("");
  const c = ST.curve; let h = "";
  if (c === "P1") h = `<div class="seg" role="group" aria-label="P¹ picture" style="margin-top:.4rem"><button type="button" data-p1view="sphere" aria-pressed="${ST.p1view === "sphere"}">Riemann sphere</button><button type="button" data-p1view="line" aria-pressed="${ST.p1view === "line"}">Affine line + ∞</button></div>`;
  if (c === "elliptic") h = `<label class="row">a = <input type="number" id="ec-a" step="0.5" value="${ST.E.a}" style="width:5rem"></label><label class="row">b = <input type="number" id="ec-b" step="0.5" value="${ST.E.b}" style="width:5rem"></label><p class="tiny muted" id="ec-msg">Δ = ${fmt(RR.ecDisc(ST.E))}${RR.ecSmooth(ST.E) ? "" : " — singular!"}</p>`;
  if (c === "hyperelliptic") h = `<label class="row">genus g = <output>${ST.hyper.g}</output><input type="range" id="hy-g" min="1" max="4" value="${ST.hyper.g}"></label><label class="row"><input type="checkbox" id="hy-even" ${ST.hyper.even ? "checked" : ""}> deg f = 2g + 2 (two points at ∞)</label><p class="tiny muted">f(x) = ${esc(RR.pstr(ST.hyper.f))}</p>`;
  if (c === "plane") h = `<label class="row">degree d <select id="pl-d">${[1, 2, 3, 4].map((d) => `<option value="${d}" ${ST.plane.d === d ? "selected" : ""}>${d}: ${PLANE_NAME[d]}</option>`).join("")}</select></label>`;
  if (c === "abstract") h = `<label class="row">genus g = <output>${ST.abs.g}</output><input type="range" id="ab-g" min="0" max="4" value="${ST.abs.g}"></label>`;
  $("curve-params").innerHTML = h;
  renderDivControls();
  $("presets").innerHTML = RR.PRESETS.map((p, i) => `<button type="button" data-preset="${p.id}" aria-pressed="${ST.preset === p.id}">${i + 1}. ${esc(p.title)}</button>`).join("");
}
function renderDivControls() {
  const c = ST.curve; let h = "";
  if (c === "plane") h = `<label class="row">D = n·H, n = <output>${ST.plane.n}</output><input type="range" id="pl-n" min="0" max="5" value="${ST.plane.n}"></label>`;
  else {
    if (c === "abstract") h += `<label class="row">kind <select id="ab-kind">${[["points", "drawn points"], ["generic", "general class of degree d"], ["canonical", "canonical class K"], ["zero", "zero divisor"]].map(([k, t]) => `<option value="${k}" ${ST.abs.kind === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>${ST.abs.kind === "generic" ? `<label class="row">d = <output>${ST.abs.deg}</output><input type="range" id="ab-deg" min="-2" max="12" value="${ST.abs.deg}"></label>` : ""}`;
    if (c !== "abstract" || ST.abs.kind === "points") {
      h += `<div class="seg" role="group" aria-label="Click adds" style="margin:.2rem 0"><button type="button" data-sign="1" aria-pressed="${ST.sign === 1}">click: +P ●</button><button type="button" data-sign="-1" aria-pressed="${ST.sign === -1}">click: −P ○</button></div>`;
      const list = currentList();
      h += `<div class="stack" role="list">${list.map((t, i) => `<div role="listitem" style="display:flex;gap:.25rem;align-items:center"><button type="button" class="btn sm" data-selpt="${i}" aria-pressed="${i === ST.sel}" style="flex:1;justify-content:flex-start">${esc(t.label)} ${t.n > 0 ? "●" : "○"}×${Math.abs(t.n)}</button><button type="button" class="btn sm" data-mult="${i}:1" aria-label="Increase multiplicity of ${esc(t.label)}">+</button><button type="button" class="btn sm" data-mult="${i}:-1" aria-label="Decrease multiplicity of ${esc(t.label)}">−</button></div>`).join("")}</div>`;
      const quick = { P1: [["∞", "+∞"], ["0", "+[0]"], ["1", "+[1]"]], elliptic: [["O", "+O"]], hyperelliptic: hyperOdd() ? [["inf", "+∞"]] : [["pm", "+(∞₊ + ∞₋)"]], abstract: [] }[c];
      h += `<div class="seg" style="margin-top:.35rem">${quick.map(([k, t]) => `<button type="button" data-quick="${k}">${t}</button>`).join("")}<button type="button" data-clear="1">clear</button></div>`;
      if (c === "P1") h += `<label class="row">add point <input type="text" id="p1-add" placeholder="e.g. 2, -1.5, inf" style="max-width:8rem"><button type="button" class="btn sm" id="p1-add-go">add</button></label>`;
      if (c === "elliptic" || c === "hyperelliptic") h += `<label class="row">add point at x = <input type="number" id="xy-add" step="0.1" style="width:5rem"><button type="button" class="btn sm" id="xy-add-go">add</button></label>`;
    }
  }
  $("div-controls").innerHTML = h;
}
function sideClick(ev) {
  const b = ev.target.closest ? ev.target.closest("button") : null; if (!b) return;
  const d = b.dataset || {};
  if (d.curve) setCurve(d.curve);
  else if (d.p1view) { ST.p1view = d.p1view; renderSide(); update(); }
  else if (d.preset) loadPreset(d.preset);
  else if (d.sign) { ST.sign = Number(d.sign); renderDivControls(); }
  else if (d.selpt) { ST.sel = Number(d.selpt); update(); }
  else if (d.mult) { const [i, by] = d.mult.split(":").map(Number); changeMult(i, by); }
  else if (d.clear) { ST.div[ST.curve] = []; ST.sel = 0; ST.preset = null; update(); }
  else if (d.quick) {
    const q = d.quick, c = ST.curve;
    if (c === "P1") addPoint(q === "∞" ? RR.INF : RR.cx(Number(q)), ST.sign, q === "∞" ? "∞" : undefined);
    else if (c === "elliptic") addPoint(RR.O, ST.sign, "O");
    else if (q === "inf") addPoint({ inf: true }, ST.sign, "∞");
    else if (q === "pm") { addPoint({ inf: "+" }, ST.sign, "∞₊"); addPoint({ inf: "-" }, ST.sign, "∞₋"); }
  } else if (b.id === "p1-add-go") {
    const s = $("p1-add").value.trim(); if (/^inf|∞$/i.test(s)) addPoint(RR.INF, ST.sign, "∞"); else { const m = /^(-?[\d.]+)?\s*(?:([+-])\s*([\d.]*)i)?$/.exec(s.replace(/−/g, "-").replace(/\s/g, "")); if (m && (m[1] || m[2])) addPoint(RR.cx(Number(m[1] || 0), m[2] ? (m[2] === "-" ? -1 : 1) * Number(m[3] || 1) : 0), ST.sign); }
  } else if (b.id === "xy-add-go") {
    const x = Number($("xy-add").value), v = ST.curve === "elliptic" ? RR.ecf(ST.E, x) : RR.peval(ST.hyper.f, x);
    if (Number.isFinite(x) && v >= 0) addPoint({ x, y: Math.sqrt(v) }, ST.sign); else $("geo-caption").textContent = `No real point at x = ${fmt(x)}: the curve's point there is complex (y² = ${fmt(v)} < 0).`;
  }
}
function sideInput(ev) {
  const t = ev.target, id = t.id;
  if (id === "ec-a" || id === "ec-b") {
    const a = Number($("ec-a").value), b = Number($("ec-b").value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    if (!RR.ecSmooth({ a, b })) { $("ec-msg").textContent = "4a³ + 27b² = 0: singular cubic, not an elliptic curve. Keeping the last smooth one."; return; }
    ST.E = { a, b }; ST.div.elliptic = ST.div.elliptic.filter((t) => t.p.inf); ST.preset = null; $("ec-msg").textContent = `Δ = ${fmt(RR.ecDisc(ST.E))}`; update(); return;
  }
  if (id === "hy-g" || id === "hy-even") { setHyperGenus(Number($("hy-g").value), $("hy-even").checked); ST.preset = null; renderSide(); update(); return; }
  if (id === "pl-d") { ST.plane.d = Number(t.value); ST.preset = null; update(); return; }
  if (id === "pl-n") { ST.plane.n = Number(t.value); t.previousElementSibling.textContent = t.value; ST.preset = null; update(); return; }
  if (id === "ab-g") { ST.abs.g = Number(t.value); ST.preset = null; renderSide(); update(); return; }
  if (id === "ab-kind") { ST.abs.kind = t.value; ST.preset = null; renderDivControls(); update(); return; }
  if (id === "ab-deg") { ST.abs.deg = Number(t.value); t.previousElementSibling.textContent = t.value; ST.preset = null; update(); }
}
function loadPreset(id) {
  const p = RR.PRESETS.find((x) => x.id === id); if (!p) return;
  const s = p.state, c = s.curve.type;
  ST.curve = c; ST.preset = id; ST.sel = 0; ST.fnSel = null; ST.rrFocus = id === "k2" || id === "k3" ? "K" : null;
  if (c === "P1") ST.div.P1 = s.divisor.map((t) => ({ p: t.p, n: t.n, label: t.p.inf ? "∞" : RR.fmt(t.p.re) }));
  if (c === "elliptic") { ST.E = { a: s.curve.a, b: s.curve.b }; ST.div.elliptic = s.divisor.map((t) => ({ p: t.p, n: t.n, label: "O" })); }
  if (c === "hyperelliptic") {
    const f = s.curve.f, odd = (f.length - 1) % 2 === 1, n = s.divisor.atInfinity;
    ST.hyper = { g: RR.hyperGenus(f.length - 1), even: !odd, f: f.slice() };
    ST.div.hyperelliptic = odd ? [{ p: { inf: true }, n, label: "∞" }] : [{ p: { inf: "+" }, n, label: "∞₊" }, { p: { inf: "-" }, n, label: "∞₋" }];
  }
  if (c === "plane") { ST.plane.d = s.curve.d; ST.plane.n = s.divisor.hyper; }
  if (c === "abstract") { ST.abs.g = s.curve.g; ST.abs.kind = s.divisor.kind; ST.abs.deg = s.divisor.deg; }
  renderSide(); update();
  const lab = $("lab"); if (lab.scrollIntoView) lab.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
}

/* ================= algebra panels ================= */
function exprHtml() {
  const c = ST.curve;
  if (c === "plane" || (c === "abstract" && ST.abs.kind !== "points")) return `D = ${esc(A.divisor)}`;
  const list = RR.normalize(currentList(), keyOf());
  if (!list.length) return "D = 0";
  const nm = (t) => (t.label || "P");
  return "D = " + list.map((t, i) => { const a = Math.abs(t.n), s = t.n < 0 ? "−" : "+"; return `${i === 0 ? (t.n < 0 ? "−" : "") : ` ${s} `}<span class="${t.n > 0 ? "pos" : "neg"}">${a > 1 ? a : ""}${esc(nm(t))}</span>`; }).join("");
}
function pointsText() {
  const c = ST.curve, list = currentList();
  if (!list || c === "plane" || c === "abstract") return "";
  return RR.normalize(list, keyOf()).map((t) => {
    const p = t.p, where = c === "P1" ? (p.inf ? "∞" : RR.p1name(p).slice(1, -1)) : c === "elliptic" ? RR.ecname(p) : c === "hyperelliptic" ? RR.hname(p) : "a point of C";
    return t.label === where ? "" : `${t.label} = ${where}`;
  }).filter(Boolean).join(" · ");
}
function renderDivisorPanel() {
  $("d-expr").innerHTML = exprHtml() + `<div class="small muted" style="font-family:var(--sans);font-size:.8rem">${esc(pointsText())}</div>`;
  let cnt;
  if (ST.curve === "plane") cnt = `deg D = n·d = ${ST.plane.n}·${ST.plane.d} = ${A.deg}`;
  else if (ST.curve === "abstract" && ST.abs.kind !== "points") cnt = `deg D = ${A.deg}`;
  else { const pc = RR.pointCount(RR.normalize(currentList(), keyOf())); cnt = `${pc.text}\n\ndeg D = Σ n_P = ${pc.degree}`; }
  $("d-count").textContent = cnt;
}
function sectionsHtml() {
  const c = ST.curve; let h = "";
  const big = (v) => `<p class="rr"><span class="dv">ℓ(D)</span><span class="lb">h⁰(𝒪(D))</span> = <b style="font-family:var(--sans);font-size:1.6rem">${v}</b></p>`;
  if (c === "P1") {
    const D = RR.normalize(currentList(), RR.p1key), atInf = D.length === 1 && D[0].p.inf && D[0].n >= 0;
    h += `<p class="small">Condition: <span class="math">${esc(A.condition)}</span></p>`;
    if (atInf || !D.length) {
      const d = A.deg, srch = RR.p1Search(d, Math.min(d + 1, 9));
      h += `<p class="small">Search 1, x, x², …: a polynomial of degree i has a pole of order i at ∞ and nowhere else.</p><ul class="search">${srch.map((s) => `<li class="${s.accepted ? "ok" : "no"}">${esc(s.f)} ${s.accepted ? "✓" : "✗"}</li>`).join("")}</ul>`;
    }
  }
  if (c === "elliptic" && A.basis) {
    const n = A.deg, cand = []; for (let p = 0; p <= Math.max(n + 1, 3); p++) for (let j = 0; j <= 1; j++) { const r = p - 3 * j; if (r >= 0 && r % 2 === 0) cand.push({ label: (r / 2 ? "x" + (r / 2 > 1 ? sup(r / 2) : "") : "") + (j ? "y" : "") || "1", pole: p }); }
    h += `<p class="small">Candidates xⁱyʲ (j ≤ 1, as y² = x³ + ax + b) by pole order at O: ord<sub>O</sub>x = −2, ord<sub>O</sub>y = −3.</p><ul class="search">${cand.map((s) => `<li class="${s.pole <= n ? "ok" : "no"}">${esc(s.label)} <span class="tiny">(${s.pole})</span> ${s.pole <= n ? "✓" : "✗"}</li>`).join("")}</ul>`;
  }
  if (c === "hyperelliptic" && A.basis && A.poles) h += `<p class="small">${hyperOdd() ? `ord∞ x = −2, ord∞ y = −${2 * A.g + 1}` : `x has a simple pole at each of ∞₊, ∞₋; y a pole of order ${A.g + 1} at each`}. Pole orders of the basis: ${A.poles.join(", ") || "—"}.</p>`;
  if (A.exact) h += big(A.ell); else h += big(`${A.range.min} … ${A.range.max}`);
  if (A.basis && A.basis.length) h += `<p class="small" style="margin-bottom:0">Basis${c === "P1" ? " (click one to see its zeros and poles)" : ""}:</p><div class="basis">${A.basis.map((b, i) => c === "P1" ? `<button type="button" data-fn="${i}" aria-pressed="${ST.fnSel === i}">${esc(b)}</button>` : `<span class="chip">${esc(b)}</span>`).join("")}</div>`;
  else if (A.exact && A.ell === 0) h += `<p class="small">L(D) = 0: no nonzero function has poles bounded by D.</p>`;
  if (A.basisNote) h += `<p class="note">${esc(A.basisNote)}</p>`;
  if (c === "plane") h += `<p class="small">ℓ(nH) = C(n+2, 2) − C(n−d+2, 2): forms of degree n modulo multiples of F (exact, since H¹(P², 𝒪(n − d)) = 0).</p><div class="basis">${A.basis.map((b) => `<span class="chip">${esc(b)}</span>`).join("")}</div>`;
  return h;
}
function renderSections() { $("sections").innerHTML = sectionsHtml(); }
function renderRR() {
  const g = A.g, d = A.deg, f = ST.rrFocus;
  const term = (k, dv, lb, val) => `<button type="button" data-rr="${k}" aria-pressed="${f === k}"><span class="dv">${dv}</span><span class="lb">${lb}</span></button>`;
  let h = `<div class="rr">${term("ell", "ℓ(D)", "h⁰(𝒪(D))")} − ${term("ellKD", "ℓ(K − D)", "h¹(𝒪(D))")} = ${term("deg", "deg D", "deg 𝒪(D)")} + 1 − ${term("g", "g", "g")}  <span class="small muted">with</span> ${term("K", "K", "ω<sub>C</sub>")}</div>`;
  if (A.rr) {
    const r = A.rr;
    h += `<div class="balance" style="margin:.5rem 0"><div>sections<b>${r.ell}</b>ℓ(D)</div><div>obstruction<b>${r.ellKD}</b>ℓ(K − D)</div><div>degree + topology<b>${r.chi}</b>${d} + 1 − ${g}</div></div>`;
    h += `<p>${r.nonspecial ? `<span class="badge ok">Nonspecial divisor</span>` : `<span class="badge warn">Special divisor</span>`} ${d > 2 * g - 2 ? `<span class="small">deg D = ${fmt(d)} > 2g − 2 = ${fmt(2 * g - 2)}, so deg(K − D) < 0 and K − D has no sections.</span>` : r.ellKD > 0 ? `<span class="small">ℓ(K − D) = ${r.ellKD} > 0: holomorphic differentials vanish on D.</span>` : ""}</p>`;
  } else h += `<p class="small"><span class="badge warn">Special range</span> ${esc(A.range.why)}</p>`;
  const why = {
    ell: `ℓ(D): ${A.exact ? `${A.ell} independent functions` : "bounded, not forced"} — see the sections panel.`,
    ellKD: `ℓ(K − D): differentials ω with div(ω) ≥ D, the obstruction (Serre dual to h¹(𝒪(D))). ${A.rr ? `Here ${A.rr.ellKD}.` : ""}`,
    deg: `deg D = ${d}: the signed point count in the divisor panel.`,
    g: `g = ${g}: the number of handles of the complex curve${ST.curve === "P1" ? " (P¹ is a sphere: none)" : ST.curve === "elliptic" ? " (a torus: one)" : ""}.`,
    K: `K = ${A.K}, deg K = 2g − 2 = ${A.degK}. Drawn on the curve now.`,
  };
  if (f && why[f]) h += `<p class="note">${esc(why[f])}</p>`;
  $("rr").innerHTML = h;
}
function renderLinsys() {
  let h = "";
  const t = A.map?.target;
  if (A.exact && A.ell >= 1) h += `<p><span class="dv">|D| ≅ P(L(D))</span><span class="lb">|D| ≅ P(H⁰(C, 𝒪(D)))</span> = P<sup>${A.ell - 1}</sup></p>`;
  if (A.basis && A.basis.length >= 1 && A.exact) h += `<p class="math">φ<sub>D</sub> : P ↦ [${A.basis.map(esc).join(" : ")}]</p>`;
  h += `<p class="small">${esc(A.map?.description || "")}</p>`;
  const st = A.stages;
  if (ST.curve === "elliptic" && st) h += `<ul class="ladder">${[["base-point free", st.basePointFree], ["separates points", st.separatesPoints], ["separates tangents", st.separatesTangents], ["very ample → embedding", st.veryAmple]].map(([k, v]) => `<li class="${v ? "ok" : "no"}">${k}</li>`).join("")}</ul><p class="small">${esc(st.why)}</p>`;
  else if (st && st.text) h += `<p class="small">${esc(st.text)}</p>`;
  if (ST.curve === "P1" && A.deg >= 0) h += `<ul class="ladder">${[["base-point free", A.deg >= 0], ["separates points", A.deg >= 1], ["very ample → embedding", A.deg >= 1]].map(([k, v]) => `<li class="${v ? "ok" : "no"}">${k}</li>`).join("")}</ul>`;
  if (A.basePoints && A.basePoints.length) h += `<p class="small"><span class="badge bad">Base point</span> ∞: ${A.deg} is a gap, so every section of L(${A.deg}∞) already lies in L(${A.deg - 1}∞). Increase D to remove it.</p>`;
  void t;
  $("linsys").innerHTML = h;
}
/* ================= the map φ_D ================= */
function drawMap() {
  const c = ST.curve, rot = ROT["map-svg"]; let g = "", cap = "";
  const twoD = (pts, F, cls = "img") => `<path class="${cls}" d="${path(pts, F)}"/>`;
  if (!ST.layers.map) { draw("map-svg", `<text class="lblm" x="20" y="40">Map layer hidden</text>`); $("map-caption").textContent = ""; return; }
  if (c === "P1") {
    const d = A.deg;
    if (d < 1) { g = `<text class="lbl" x="20" y="40">${d === 0 ? "φ_D is constant: a single point" : "L(D) = 0: no map"}</text>`; cap = ""; }
    else if (d === 1) { const F = frame(-3, 3, -1, 1, 360, 300, 20); g = `<line class="img" x1="${F.X(-3)}" y1="${F.Y(0)}" x2="${F.X(3)}" y2="${F.Y(0)}"/><text class="lbl" x="20" y="40">P¹ → P¹, an isomorphism</text>`; cap = "Degree 1: the line itself."; }
    else if (d === 2) { const F = frame(-2.2, 2.2, -0.5, 4.8, 360, 300, 20), pts = []; for (let i = 0; i <= 100; i++) { const x = -2.2 + (4.4 * i) / 100; pts.push([x, x * x]); } g = twoD(pts, F) + `<text class="lbl" x="16" y="24">XZ = Y² in the chart X = 1: Z = Y²</text>`; g += imagePointsP1(F, (x) => [x, x * x]); cap = "Degree 2: the conic, image of [1 : x : x²]."; }
    else { const pts = []; for (let i = 0; i <= 160; i++) { const x = -1.6 + (3.2 * i) / 160; pts.push([x / 1.6, x * x / 2.56 - 0.5, (x ** 3) / 4.1]); } g = draw3("map-svg", [{ pts }], rot, { labels: ["x", "x²", "x³"] }); cap = `Degree ${d}: ${d === 3 ? "the twisted cubic" : `the rational normal curve, projected to the coordinates x, x², x³`} (drag or use arrow keys to rotate).`; }
  } else if (c === "elliptic") {
    const n = A.deg, E = ST.E, F0 = ecFrame();
    if (n <= 0 || !A.ell) g = `<text class="lbl" x="20" y="40">${A.ell ? "constant map" : "L(D) = 0: no map"}</text>`;
    else if (n === 1) g = `<circle class="imgpt" cx="180" cy="150" r="6"/><text class="lbl" x="120" y="185">φ_D(E) = a point</text>`;
    else if (n === 2) {
      const F = frame(F0.x0, F0.x1, -1.4, F0.y1 * 0.9, 360, 300, 20);
      for (const comp of RR.ecRealLocus(E, F0.x0, F0.x1)) g += `<path class="curve" opacity=".35" d="${path([...comp.upper.slice().reverse(), ...comp.lower].map(([x, y]) => [x, y * 0.4 + F0.y1 * 0.35]).filter(([, y]) => y < F0.y1), F)}"/>`;
      g += `<line class="img" x1="${F.X(F0.x0)}" y1="${F.Y(-0.9)}" x2="${F.X(F0.x1)}" y2="${F.Y(-0.9)}"/><text class="lbl" x="12" y="${F.Y(-0.9) + 18}">P¹ (the x-line)</text>`;
      for (const r of RR.ecCubicRoots(E)) g += `<circle class="branch" cx="${F.X(r)}" cy="${F.Y(-0.9)}" r="5"/>`;
      for (const x of [F0.x0 * 0.2 + F0.x1 * 0.8]) { const y = Math.sqrt(RR.ecf(E, x)); for (const s of [1, -1]) g += `<line stroke="var(--map)" stroke-dasharray="3 3" x1="${F.X(x)}" y1="${F.Y(s * y * 0.4 + F0.y1 * 0.35)}" x2="${F.X(x)}" y2="${F.Y(-0.9)}"/><circle class="pos" cx="${F.X(x)}" cy="${F.Y(s * y * 0.4 + F0.y1 * 0.35)}" r="4"/>`; g += `<circle class="imgpt" cx="${F.X(x)}" cy="${F.Y(-0.9)}" r="5"/><text class="lblm" x="${F.X(x) + 6}" y="${F.Y(-0.9) - 8}">P, −P ↦ x</text>`; }
      cap = "|2O|: [1 : x] — P and −P have the same image; branched over the roots of the cubic (orange, real ones) and ∞.";
    } else if (n === 3) {
      const cub = RR.recoverCubic(E), F = frame(F0.x0, F0.x1, F0.y0, F0.y1, 360, 300, 20);
      for (const comp of RR.ecRealLocus(E, F0.x0, F0.x1)) g += `<path class="img" d="${path([...comp.upper.slice().reverse(), ...comp.lower].filter(([, y]) => Math.abs(y) <= F0.y1 * 1.2), F)}${comp.closed ? "Z" : ""}"/>`;
      g += `<text class="lbl" x="12" y="22">image in the chart z = 1:</text><text class="lbl" x="12" y="40" style="fill:var(--map);font-weight:700">${esc(cub.equation)}</text>`;
      cap = "|3O|: P ↦ [1 : x : y]. The equation is recovered from the image by finding the cubic form vanishing on sampled image points (a null-space computation), not typed in.";
    } else { const pts = []; const r = RR.ecCubicRoots(E).at(-1); for (let i = -80; i <= 80; i++) { const x = r + (i / 80) ** 2 * 2.2, y = Math.sign(i) * Math.sqrt(Math.max(0, RR.ecf(E, x))); pts.push([x / 3 - 0.3, y / 6, (x * x) / 12 - 0.4]); } g = draw3("map-svg", [{ pts }], rot, { labels: ["x", "y", "x²"] }); cap = `E ↪ P${sup(n - 1)}: degree-${n} elliptic normal curve, projected to (x, y, x²); real branch through O only (drag to rotate).`; }
    if (A.basisNote && n >= 2) cap += " " + "D is not supported at O: the picture is φ_{nO}, which differs from φ_D by a translation of E.";
  } else if (c === "hyperelliptic") {
    if (!A.exact || !A.basis || A.ell < 2) g = `<text class="lbl" x="20" y="40">${A.exact ? (A.ell === 1 ? "constant map" : "no sections") : "sections not written for this divisor"}</text>`;
    else {
      const b = RR.hyperBasis(ST.hyper.f.length - 1, A.n), coordsOf = (x, y) => b.basis.slice(1).map((t) => (t.kind === "x" ? x ** t.i : x ** t.j * y));
      const F0 = hyperFrame(), parts = hyperLocus(F0), lines = [];
      for (const part of parts) for (const s of [1, -1]) lines.push(part.map(([x, y]) => coordsOf(x, s * y)));
      const flat = lines.flat(), k = flat[0]?.length || 0;
      if (k === 1) { const xs = flat.map((p) => p[0]), F = frame(Math.min(...xs) - 0.3, Math.max(...xs) + 0.3, -1, 1, 360, 300, 20); g = `<line class="img" x1="${F.X(F.x0)}" y1="${F.Y(0)}" x2="${F.X(F.x1)}" y2="${F.Y(0)}"/>` + RR.realRoots(ST.hyper.f).map((r) => `<circle class="branch" cx="${F.X(r)}" cy="${F.Y(0)}" r="5"/>`).join("") + `<text class="lbl" x="16" y="40">C → P¹, 2 : 1 (x)</text>`; cap = "Two sheets fold onto the x-line, branched at the roots of f (orange)."; }
      else {
        const lo = [0, 1, 2].map((i) => Math.min(...flat.map((p) => p[i] ?? 0))), hi = [0, 1, 2].map((i) => Math.max(...flat.map((p) => p[i] ?? 0)));
        const norm = (p) => [0, 1, 2].map((i) => (hi[i] > lo[i] ? (2 * ((p[i] ?? 0) - lo[i])) / (hi[i] - lo[i]) - 1 : 0) * 0.9);
        g = k === 2 ? (() => { const F = frame(-1, 1, -1, 1, 360, 300, 22); return lines.map((L) => `<path class="img" d="${path(L.map(norm).map(([x, y]) => [x, y]), F)}"/>`).join(""); })() : draw3("map-svg", lines.map((L) => ({ pts: L.map(norm) })), rot, { labels: b.basis.slice(1, 4).map((t) => t.label) });
        cap = `Image of the real points under [${b.basis.map((t) => t.label).join(" : ")}]${k > 3 ? ", projected to the first three affine coordinates" : ""}${b.basis.some((t) => t.kind === "y") ? "" : " — powers of x only: both sheets land on the same curve, 2 : 1"}${k >= 3 ? " (drag to rotate)" : ""}.`;
      }
    }
  } else if (c === "plane") {
    const F = frame(-2, 2, -1.6, 1.6, 360, 300, 16);
    if (ST.plane.n === 1) { g = `<path class="img" d="${segPath(contour(planeF(ST.plane.d), -2, 2, -1.6, 1.6, 120, 100), F)}"/>`; cap = `|H|: [x : y : z] — the plane embedding itself${ST.plane.d === 4 ? "; for the quartic K = H, so this is the canonical embedding" : ""}.`; }
    else if (ST.plane.n === 0) { g = `<text class="lbl" x="20" y="40">constant map</text>`; }
    else { const segs = contour(planeF(ST.plane.d), -2, 2, -1.6, 1.6, 90, 80); const lines = segs.map(([a, b]) => ({ pts: [a, b].map(([x, y]) => [x / 1.6, y / 1.4, (x * x - y * y) / 3]) })); g = draw3("map-svg", lines, rot, { labels: ["x", "y", "x² − y²"] }); cap = `|${ST.plane.n}H|: the degree-${ST.plane.n} Veronese map restricted to C, into P${sup(A.ell - 1)}; projected to (x, y, x² − y²) (drag to rotate).`; }
  } else { g = `<text class="lbl" x="20" y="40">${esc(A.map?.description || "")}</text>`; cap = A.exact ? `|D| ≅ P${sup(Math.max(0, A.ell - 1))}` : ""; }
  draw("map-svg", g); $("map-caption").textContent = cap;
}
function imagePointsP1(F, fn) {
  let g = "";
  for (const t of RR.normalize(currentList(), RR.p1key)) if (!t.p.inf && !t.p.im) { const [X, Y] = fn(t.p.re); if (X >= F.x0 && X <= F.x1 && Y <= F.y1) g += `<circle class="${t.n > 0 ? "pos" : "neg"}" cx="${F.X(X)}" cy="${F.Y(Y)}" r="5"/>`; }
  return g;
}
/* ================= pipeline strip ================= */
function renderPipe() {
  const short = (s, n = 26) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const items = [
    ["lab", "CURVE", `${({ P1: "P¹", elliptic: "E", hyperelliptic: "y² = f(x)", plane: `plane, d = ${ST.plane.d}`, abstract: "abstract" })[ST.curve]}, g = ${A.g}`],
    ["panel-divisor", "DIVISOR", short(A.divisor)],
    ["panel-sections", "L(D)", A.basis && A.basis.length ? short(`⟨${A.basis.join(", ")}⟩`) : A.exact ? (A.ell ? "dimension only" : "0") : "bounded"],
    ["panel-sections", "ℓ(D)", A.exact ? String(A.ell) : `${A.range.min}…${A.range.max}`],
    ["panel-rr", "RIEMANN–ROCH", A.rr ? `${A.rr.ell} − ${A.rr.ellKD} = ${A.rr.chi}` : "special range"],
    ["panel-map", "|D|", A.exact && A.ell >= 1 ? `P${sup(A.ell - 1)}` : "—"],
    ["panel-map", "φ_D", short((A.map?.description || "").split(":")[0], 30)],
  ];
  $("pipe").innerHTML = items.map(([id, k, v]) => `<li><a href="#${id}">${k}<span>${esc(v)}</span></a></li>`).join("");
}
function renderLayers() {
  const names = [["curve", "Curve"], ["divisor", "Divisor"], ["functions", "Functions"], ["linsys", "Linear system"], ["map", "Map"]];
  const all = names.every(([k]) => ST.layers[k]);
  $("layers").innerHTML = names.map(([k, t]) => `<button type="button" class="btn sm" data-layer="${k}" aria-pressed="${ST.layers[k]}">${t}</button>`).join("") + `<button type="button" class="btn sm" data-layer="all" aria-pressed="${all}">All</button>`;
  $("map-box").hidden = !ST.layers.map;
  const howto = { P1: "Click: +P (shift-click or the −P mode: a pole) · drag to move · scroll on a point: multiplicity · keyboard: arrows move, +/− multiplicity, [ ] select, Delete removes.", plane: "Click to move the hyperplane H; set n in the side panel.", abstract: "Click the surface to add points; scroll or +/− for multiplicity." };
  $("howto").textContent = howto[ST.curve] || howto.P1;
}
/* ================= update ================= */
function update() {
  A = RR.analyse(labState());
  if (ST.curve === "P1") A.basisF = RR.p1Basis(labState().divisor).basis.map((b) => b.f);
  if (ST.fnSel !== null && (!A.basis || ST.fnSel >= A.basis.length)) ST.fnSel = null;
  renderLayers(); renderDivisorPanel(); renderSections(); renderRR(); renderLinsys(); drawGeo(); drawMap(); renderPipe();
  renderDivList();
  renderModulesFromLab();
  renderSynthText();
}
function renderDivList() {
  const list = currentList(); if (!list || ST.curve === "plane") return;
  const btns = $("div-controls");
  if (ST.curve === "abstract" && ST.abs.kind !== "points") return;
  renderDivControls(); void btns;
}

/* ================= modules ================= */
/* --- rational functions --- */
const FN = { a: 0, m: 2, b: 1, n: 3 };
function fnObj() { const fs = []; if (FN.m) fs.push({ a: RR.cx(FN.a), m: FN.m }); if (FN.n) fs.push({ a: RR.cx(FN.b), m: -FN.n }); return { c: 1, factors: fs }; }
function renderFn() {
  $("fn-controls").innerHTML = `<label class="row">zero a = <output>${FN.a}</output><input type="range" id="fn-a" min="-3" max="3" step="0.5" value="${FN.a}"></label><label class="row">order m = <output>${FN.m}</output><input type="range" id="fn-m" min="0" max="4" value="${FN.m}"></label><label class="row">pole b = <output>${FN.b}</output><input type="range" id="fn-b" min="-3" max="3" step="0.5" value="${FN.b}"></label><label class="row">order n = <output>${FN.n}</output><input type="range" id="fn-n" min="0" max="4" value="${FN.n}"></label><div class="seg"><button type="button" data-fnex="1">x − a</button><button type="button" data-fnex="2">(x − a)/(x − b)</button><button type="button" data-fnex="3">(x − a)²/(x − b)³</button></div>`;
  drawFn();
}
function drawFn() {
  const f = fnObj(), D = RR.p1div(f), F = frame(-3.5, 3.5, -1, 1, 470, 170, 18);
  let g = `<line class="curve" x1="${F.X(-3.5)}" y1="${F.Y(0)}" x2="${F.X(3.5)}" y2="${F.Y(0)}"/>`;
  for (let k = -3; k <= 3; k++) g += `<text class="lblm" x="${F.X(k) - 3}" y="${F.Y(0) + 18}">${k}</text>`;
  g += `<circle cx="495" cy="${F.Y(0)}" r="15" fill="var(--panel)" stroke="var(--curve)"/><text x="489" y="${F.Y(0) + 5}" font-size="14">∞</text>`;
  for (const t of D) { const x = t.p.inf ? 495 : F.X(t.p.re), k = Math.abs(t.n); for (let i = 0; i < k; i++) g += `<circle class="${t.n > 0 ? "zero" : "pole"}" cx="${x}" cy="${F.Y(0) - 26 - i * 13}" r="5.5"/>`; g += `<text class="lblm" x="${x - 18}" y="${F.Y(0) - 32 - k * 13}">${t.n > 0 ? "zero" : "pole"} ${k}</text>`; }
  draw("fn-svg", g);
  const deg = RR.degree(D);
  $("fn-out").innerHTML = `<p class="expr">f = ${esc(RR.p1fstr(f))}</p><p class="math">div(f) = ${esc(RR.p1str(D))}</p><p class="small">deg div(f) = ${deg} <span class="badge ${deg === 0 ? "ok" : "bad"}">${deg === 0 ? "principal: degree 0" : "error"}</span> — ord<sub>∞</sub> f = deg(denominator) − deg(numerator) = ${RR.p1ord(f, RR.INF)} compensates.</p>`;
  renderEligibility();
}
function renderLocalOrder() {
  const m = Number($("lo-m").value); $("lo-m-out").textContent = m;
  const F = frame(-1, 1, -3, 3, 360, 180, 14), pts = [];
  for (let i = 0; i <= 200; i++) { const t = -1 + (2 * i) / 200; if (Math.abs(t) < 1e-9 && m < 0) { pts.push(null); continue; } const v = Math.max(-3.2, Math.min(3.2, t ** m * (1 + 0.3 * t))); pts.push([t, v]); }
  const segs = []; let cur = []; for (const p of pts) { if (!p) { if (cur.length) segs.push(cur); cur = []; } else cur.push(p); } if (cur.length) segs.push(cur);
  draw("lo-svg", `<line class="axis" x1="${F.X(-1)}" y1="${F.Y(0)}" x2="${F.X(1)}" y2="${F.Y(0)}"/><line class="axis" x1="${F.X(0)}" y1="${F.Y(-3)}" x2="${F.X(0)}" y2="${F.Y(3)}"/>${segs.map((s) => `<path class="curve2" d="${path(s, F)}"/>`).join("")}<text class="lblm" x="${F.X(0) + 4}" y="${F.Y(-3) - 2}">t = 0 (P)</text>`);
  $("lo-out").textContent = m > 0 ? `m = ${m} > 0: f = t${sup(m)}u(t) vanishes at P — a zero of order ${m}.` : m === 0 ? "m = 0: f = u(t) with u(0) ≠ 0 — a unit at P, neither zero nor pole." : `m = ${m} < 0: f = t${sup(m)}u(t) blows up at P — a pole of order ${-m}.`;
}
function renderEligibility() {
  let D; try { D = RR.parseDivisor($("el-d").value, { type: "P1" }); } catch (e) { $("el-out").innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p>`; return; }
  const Dv = D.divisor || (D.atInfinity !== undefined ? [{ p: RR.INF, n: D.atInfinity }] : [{ p: RR.INF, n: -2 }]);
  const f = fnObj(), el = RR.p1Eligibility(f, Dv);
  $("el-out").innerHTML = `<table><thead><tr><th scope="col">P</th><th scope="col">ord<sub>P</sub>(f)</th><th scope="col">D(P)</th><th scope="col">total</th><th scope="col"></th></tr></thead><tbody>${el.rows.map((r) => `<tr><td>${esc(r.point)}</td><td class="num">${r.ord}</td><td class="num">${r.D}</td><td class="num">${r.total}</td><td>${r.ok ? "✓" : "✗"}</td></tr>`).join("")}</tbody></table><p class="expr">f ${el.member ? "∈" : "∉"} L(D) <span class="badge ${el.member ? "ok" : "bad"}">${el.member ? "allowed" : "not allowed"}</span></p>`;
}
/* --- linear equivalence --- */
function renderEquiv() {
  let D1, D2;
  try { D1 = RR.parseDivisor($("eq-d").value, { type: "P1" }).divisor; D2 = RR.parseDivisor($("eq-d2").value, { type: "P1" }).divisor; } catch (e) { $("eq-out").innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)} (write points in brackets, e.g. 2[0] + [inf])</p>`; return; }
  if (!D1 || !D2) { $("eq-out").innerHTML = `<p class="small">Write both as sums of points, e.g. 2[0] + [inf].</p>`; return; }
  const d1 = RR.degree(D1), d2 = RR.degree(D2), diff = RR.normalize([...D1, ...RR.dneg(D2)], RR.p1key);
  let h = `<p class="small">deg D = ${d1}, deg D′ = ${d2}.</p>`;
  if (d1 !== d2) h += `<p><span class="badge bad">Not equivalent</span> Principal divisors have degree 0, so the degree is an invariant of the class.</p>`;
  else {
    const f = { c: 1, factors: diff.filter((t) => !t.p.inf).map((t) => ({ a: t.p, m: t.n })) }, check = RR.p1str(RR.p1div(f)) === RR.p1str(diff);
    h += `<pre class="flow">D  = ${esc(RR.p1str(D1))}\n│  add div(f), f = ${esc(RR.p1fstr(f))}\n▼\nD′ = ${esc(RR.p1str(D2))}</pre><p class="small">D − D′ = ${esc(RR.p1str(diff) || "0")} = div(f) ${check ? "✓" : "✗"} — on P¹ the factor at ∞ is free, so every degree-0 divisor is principal.</p><p><span class="badge ok">D ∼ D′</span></p>`;
  }
  $("eq-out").innerHTML = h;
  const F = { X: (d) => 40 + (d + 1) * 62 }; let g = `<line class="axis" x1="20" y1="170" x2="350" y2="170"/>`;
  const ex = { "-1": ["−[∞]", "−[0]", "[1] − 2[3]"], 0: ["0", "[0] − [∞]", "[2] − [1]"], 1: ["[∞]", "[0]", "2[1] − [3]"], 2: ["2[∞]", "[0] + [1]", "3[2] − [∞]"], 3: ["3[∞]", "[0]+[1]+[2]", "4[1] − [0]"], 4: ["4[∞]", "2[0]+2[1]", "…"] };
  for (let d = -1; d <= 4; d++) { g += `<circle class="pos" cx="${F.X(d)}" cy="170" r="6"/><text class="lbl" x="${F.X(d) - 5}" y="192">${d}</text>`; ex[d].forEach((s, i) => { g += `<text class="lblm" x="${F.X(d) - 24}" y="${40 + i * 30}">${esc(s)}</text><line stroke="var(--rule)" x1="${F.X(d)}" y1="${46 + i * 30}" x2="${F.X(d)}" y2="162"/>`; }); }
  for (const [D, lab] of [[D1, "D"], [D2, "D′"]]) { const d = RR.degree(D); if (d >= -1 && d <= 4) g += `<text class="lbl" x="${F.X(d) - 8}" y="150" style="fill:var(--accent);font-weight:700">${lab}</text>`; }
  draw("pic-svg", g);
}
/* --- Riemann–Roch balance --- */
function renderBalance() {
  const g = Number($("bal-g").value), d = Number($("bal-d").value); $("bal-g-out").textContent = g; $("bal-d-out").textContent = d;
  const r = RR.rrRange(d, g);
  $("bal-out").innerHTML = `<div class="balance"><div>sections ℓ(D)<b>${r.exact ? r.min : `${r.min}…${r.max}`}</b></div><div>obstruction ℓ(K − D)<b>${r.exact ? r.min - (d + 1 - g) : `${r.min - (d + 1 - g)}…${r.max - (d + 1 - g)}`}</b></div><div>deg D + 1 − g<b>${d + 1 - g}</b></div></div><p>${r.regime === "nonspecial" ? `<span class="badge ok">Nonspecial divisor</span>` : r.regime === "negative" ? `<span class="badge info">No sections</span>` : `<span class="badge warn">Special range: 0 ≤ deg D ≤ 2g − 2</span>`} <span class="small">${esc(r.why)}</span></p>`;
  const F = frame(-3, 14, -1, 12, 560, 220, 28); let s = `<line class="axis" x1="${F.X(-3)}" y1="${F.Y(0)}" x2="${F.X(14)}" y2="${F.Y(0)}"/><line class="axis" x1="${F.X(0)}" y1="${F.Y(-1)}" x2="${F.X(0)}" y2="${F.Y(12)}"/>`;
  if (g > 0) s += `<rect x="${F.X(0)}" y="${F.Y(12)}" width="${F.X(2 * g - 2) - F.X(0)}" height="${F.Y(-1) - F.Y(12)}" fill="var(--soft2)"/><text class="lblm" x="${F.X(0) + 3}" y="${F.Y(11.3)}">special range</text>`;
  s += `<path class="curve2" stroke-dasharray="5 4" d="${path([[-3, -2 - g], [14, 15 - g]].map(([x, y]) => [x, y]).map(([x, y]) => [x, Math.max(-1, Math.min(12, y))]), F)}"/><text class="lblm" x="${F.X(11)}" y="${F.Y(Math.min(11.5, 12 - g))}">deg + 1 − g</text>`;
  for (let x = -3; x <= 14; x++) { const q = RR.rrRange(x, g); if (q.exact) s += `<circle class="${x === d ? "pos" : "imgpt"}" cx="${F.X(x)}" cy="${F.Y(q.min)}" r="${x === d ? 6 : 3.5}"/>`; else s += `<line stroke="var(--warn)" stroke-width="5" stroke-linecap="round" x1="${F.X(x)}" y1="${F.Y(q.min)}" x2="${F.X(x)}" y2="${F.Y(q.max)}" opacity="${x === d ? 1 : 0.5}"/>`; }
  for (let k = 0; k <= 12; k += 4) s += `<text class="lblm" x="${F.X(-3)}" y="${F.Y(k) + 4}">${k}</text>`;
  s += `<text class="lblm" x="${F.X(13)}" y="${F.Y(0) + 16}">deg D</text><text class="lblm" x="${F.X(-3)}" y="${F.Y(12) - 4}">ℓ(D)</text>`;
  draw("bal-svg", s);
  $("k-table").innerHTML = `<table><thead><tr><th scope="col">g</th>${[0, 1, 2, 3, 4, 5, 6].map((k) => `<th scope="col">${k}</th>`).join("")}</tr></thead><tbody><tr><th scope="row">deg K</th>${[0, 1, 2, 3, 4, 5, 6].map((k) => `<td class="num" ${k === g ? 'style="background:var(--soft);font-weight:700"' : ""}>${RR.degK(k)}</td>`).join("")}</tr><tr><th scope="row">ℓ(K)</th>${[0, 1, 2, 3, 4, 5, 6].map((k) => `<td class="num">${k}</td>`).join("")}</tr></tbody></table>`;
  $("serre").textContent = `sections              h⁰(C, 𝒪(D)) = ℓ(D)\n   ↕  minus\nobstructions          h¹(C, 𝒪(D))\n   ↕  Serre duality: H¹(C, 𝒪(D))^∨ ≅ H⁰(C, 𝒪(K − D))\nsections of K − D     ℓ(K − D)\n\nh⁰(D) − h¹(D) = χ(𝒪(D)) = deg D + 1 − g     (here g = ${g}, deg D = ${d}: ${d + 1 - g})`;
}
/* --- elliptic flagship --- */
function renderElliptic() {
  const E = ST.E, F0 = ecFrame(), roots = RR.ecCubicRoots(E);
  { const F = frame(F0.x0, F0.x1, -1.6, F0.y1, 330, 260, 16); let g = "";
    for (const comp of RR.ecRealLocus(E, F0.x0, F0.x1)) g += `<path class="curve" d="${path([...comp.upper.slice().reverse(), ...comp.lower].map(([x, y]) => [x, y * 0.5 + F0.y1 * 0.45]).filter(([, y]) => y < F0.y1), F)}"/>`;
    g += `<line class="img" x1="${F.X(F0.x0)}" y1="${F.Y(-1.1)}" x2="${F.X(F0.x1)}" y2="${F.Y(-1.1)}"/>`;
    for (const r of roots) g += `<circle class="branch" cx="${F.X(r)}" cy="${F.Y(-1.1)}" r="5"/><line stroke="var(--warn)" stroke-dasharray="2 3" x1="${F.X(r)}" y1="${F.Y(F0.y1 * 0.45)}" x2="${F.X(r)}" y2="${F.Y(-1.1)}"/>`;
    const x = roots.at(-1) + 0.9, y = Math.sqrt(RR.ecf(E, x)); for (const s of [1, -1]) g += `<circle class="pos" cx="${F.X(x)}" cy="${F.Y(s * y * 0.5 + F0.y1 * 0.45)}" r="4"/><line stroke="var(--map)" stroke-dasharray="3 3" x1="${F.X(x)}" y1="${F.Y(s * y * 0.5 + F0.y1 * 0.45)}" x2="${F.X(x)}" y2="${F.Y(-1.1)}"/>`;
    g += `<text class="lblm" x="8" y="${F.Y(-1.1) + 18}">P¹: x</text><text class="lblm" x="${F.X(x) + 6}" y="${F.Y(-1.1) - 6}">P, −P</text>`;
    draw("e2-svg", g);
    const m2 = RR.ecMap(E, 2), rh = RR.riemannHurwitz({ degree: 2, gTarget: 0, ramification: [2, 2, 2, 2] });
    $("e2-out").innerHTML = `ℓ(2O) = 2, basis ${m2.basis.map((b) => b.label).join(", ")}: P ↦ [1 : x(P)], degree 2. Branch points: ${esc(m2.branchPoints.join(", "))}. Riemann–Hurwitz: ${esc(rh.text)} ✓.`;
  }
  { const F = frame(F0.x0, F0.x1, F0.y0, F0.y1, 330, 260, 16); let g = "";
    for (const comp of RR.ecRealLocus(E, F0.x0, F0.x1)) g += `<path class="img" d="${path([...comp.upper.slice().reverse(), ...comp.lower].filter(([, y]) => Math.abs(y) <= F0.y1 * 1.2), F)}${comp.closed ? "Z" : ""}"/>`;
    const cub = RR.recoverCubic(E); g += `<text class="lbl" x="10" y="20" style="fill:var(--map);font-weight:700">${esc(cub.equation)}</text>`;
    draw("e3-svg", g);
    $("e3-out").innerHTML = `ℓ(3O) = 3, basis 1, x, y with pole orders 0, 2, 3 at O. P ↦ [1 : x : y]; the ten cubic monomials in the image coordinates have a one-dimensional space of relations (computed: ${cub.dimension}), which is the Weierstrass cubic ${esc(cub.equation)}.`;
  }
  renderGroupLaw();
}
function glPoints() {
  const E = ST.E; let up = Number($("gl-p").value), uq = Number($("gl-q").value);
  if (up < 0.004 || up > 0.996) up = 0.004; if (uq < 0.004 || uq > 0.996) uq = 0.996 - 0.002;
  const P = RR.ecFromAbel(E, up, 0); let Q = RR.ecFromAbel(E, uq, 0);
  if (Math.abs(up - uq) < 0.002) Q = P; else if (Math.abs(up + uq - 1) < 0.003) Q = RR.ecNeg(P);
  return { P, Q, up, uq };
}
function renderGroupLaw() {
  const E = ST.E, { P, Q, up, uq } = glPoints(), L = RR.ecLine(E, P, Q), S = RR.ecAdd(E, P, Q), F0 = ecFrame(), F = frame(F0.x0, F0.x1, F0.y0, F0.y1, 360, 300, 14);
  let g = "";
  for (const comp of RR.ecRealLocus(E, F0.x0, F0.x1)) g += `<path class="curve" d="${path([...comp.upper.slice().reverse(), ...comp.lower].filter(([, y]) => Math.abs(y) <= F0.y1 * 1.2), F)}${comp.closed ? "Z" : ""}"/>`;
  if (L.vertical) g += `<line class="curve2" x1="${F.X(P.x)}" y1="${F.Y(F0.y0)}" x2="${F.X(P.x)}" y2="${F.Y(F0.y1)}"/>`;
  else { g += `<line class="curve2" x1="${F.X(F0.x0)}" y1="${F.Y(L.nu + L.lambda * F0.x0)}" x2="${F.X(F0.x1)}" y2="${F.Y(L.nu + L.lambda * F0.x1)}"/>`; if (!L.R.inf && !S.inf) g += `<line stroke="var(--muted)" stroke-dasharray="4 3" x1="${F.X(L.R.x)}" y1="${F.Y(L.R.y)}" x2="${F.X(S.x)}" y2="${F.Y(S.y)}"/>`; }
  const pt = (X, lab, cls = "pos") => (X.inf ? "" : `<circle class="${cls}" cx="${F.X(X.x)}" cy="${F.Y(X.y)}" r="5.5"/><text class="lbl" x="${F.X(X.x) + 7}" y="${F.Y(X.y) - 7}">${lab}</text>`);
  g += pt(P, "P") + pt(Q, RR.ecEq(P, Q) ? "" : "Q") + (L.R.inf ? "" : pt(L.R, "R", "neg")) + (S.inf ? "" : pt(S, "P ⊕ Q = −R", "zero"));
  draw("gl-svg", `<g clip-path="none">${g}</g>`);
  /* torus with the Abel–Jacobi images */
  const Tc = [180, 105], Rb = 120, rb = 42, tilt = 0.42, roots = RR.ecCubicRoots(E);
  const tp = (th, ph) => [Tc[0] + (Rb + rb * Math.cos(ph)) * Math.cos(th), Tc[1] + (Rb + rb * Math.cos(ph)) * Math.sin(th) * Math.sin(tilt) - rb * Math.sin(ph) * Math.cos(tilt)];
  let t = "";
  const ring = (ph, cls, w = 1) => { const pts = []; for (let k = 0; k <= 96; k++) pts.push(tp((2 * Math.PI * k) / 96, ph)); return `<path class="${cls}" stroke-width="${w}" d="M${pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L")}"/>`; };
  t += `<ellipse cx="${Tc[0]}" cy="${Tc[1]}" rx="${Rb + rb}" ry="${(Rb + rb) * Math.sin(tilt) + rb * Math.cos(tilt)}" fill="var(--soft)" stroke="var(--curve)" stroke-width="1.4"/><ellipse cx="${Tc[0]}" cy="${Tc[1]}" rx="${Rb - rb}" ry="${Math.max(4, (Rb - rb) * Math.sin(tilt) - rb * Math.cos(tilt) * 0.2)}" fill="var(--base)" stroke="var(--curve)" stroke-width="1.2"/>`;
  t += ring(0, "curve", 2.2); if (roots.length === 3) t += ring(Math.PI, "curve", 1.4);
  const mk = (u, lab, cls) => { const q = tp(2 * Math.PI * u + Math.PI / 2, 0); return `<circle class="${cls}" cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="5.5"/><text class="lbl" x="${(q[0] + 7).toFixed(1)}" y="${(q[1] - 6).toFixed(1)}">${lab}</text>`; };
  const uS = S.inf ? 0 : RR.ecAbel(E, S).u, uP = RR.ecAbel(E, P).u, uQ = RR.ecAbel(E, Q).u;
  t += mk(0, "O", "imgpt") + mk(uP, "P", "pos") + mk(uQ, "Q", "pos") + mk(uS, "P ⊕ Q", "zero");
  t += `<text class="lblm" x="8" y="214">real circle(s) of C/Λ, u = ∫ dx/y from O</text>`;
  draw("torus-svg", t);
  const sum = (((uP + uQ) % 1) + 1) % 1, err = Math.min(Math.abs(sum - uS), 1 - Math.abs(sum - uS));
  $("gl-out").innerHTML = `<p class="math">div(chord) = ${esc(RR.ecstr(L.divisor))}</p><p>${esc(L.relation)}; P ⊕ Q = −R = ${esc(RR.ecname(S))}.</p><p>Abel–Jacobi: u(P) + u(Q) = ${fmt(uP, 4)} + ${fmt(uQ, 4)} ≡ ${fmt(sum, 4)} and u(P ⊕ Q) = ${fmt(uS, 4)} (difference ${err < 1e-6 ? "< 10⁻⁶" : fmt(err, 2)}): the group law on E is addition on the torus — <b>E ≅ Pic⁰(E)</b>, P ↦ [P − O].</p><p class="tiny muted">Slider positions ${fmt(up, 3)}, ${fmt(uq, 3)} are the points' Abel coordinates on the real component through O. <span class="schematic">Real locus</span></p>`;
}
/* --- hyperelliptic and Riemann–Hurwitz --- */
function renderBranch() {
  const b = Number($("br").value), t = Number($("morph").value); $("br-out").textContent = b;
  const dc = RR.doubleCover(b); let g = "";
  const sheet = (cy, op) => { let s = `<ellipse class="sheet" cx="200" cy="${cy}" rx="170" ry="34" opacity="${op}"/>`; for (let k = 0; k < b; k++) s += `<circle class="branch" cx="${60 + (k * 280) / Math.max(1, b - 1)}" cy="${cy}" r="5" opacity="${op}"/>`; for (let k = 0; k + 1 < b; k += 2) s += `<line stroke="var(--warn)" stroke-width="3" x1="${60 + (k * 280) / Math.max(1, b - 1)}" y1="${cy}" x2="${60 + ((k + 1) * 280) / Math.max(1, b - 1)}" y2="${cy}" opacity="${op}"/>`; return s; };
  g += sheet(70, 1 - t) + sheet(150, 1 - t);
  g += `<text class="lblm" x="20" y="22" opacity="${1 - t}">two copies of P¹, cut between pairs of branch points and glued crosswise</text><ellipse class="sheet" cx="200" cy="230" rx="150" ry="14"/><text class="lblm" x="30" y="252">P¹ (base)</text>`;
  if (dc.ok) g += `<g opacity="${t}">${surfaceSvg(dc.g, 200, 110, 360, 120)}</g><text class="lbl" x="420" y="110" opacity="${t}">genus ${dc.g}</text>`;
  else g += `<text class="lbl" x="400" y="110" style="fill:var(--bad)">odd b: no smooth</text><text class="lbl" x="400" y="128" style="fill:var(--bad)">compact double cover</text>`;
  draw("br-svg", g + `<text class="schematic" x="440" y="245" style="fill:var(--warn)">SCHEMATIC</text>`);
  $("br-calc").innerHTML = dc.ok ? `<table><tbody><tr><td>two sheets of the sphere</td><td class="num">2·(2·0 − 2) = −4</td></tr><tr><td>branching contribution Σ(e − 1)</td><td class="num">+${b}</td></tr><tr><th scope="row">Euler / genus result 2g − 2</th><td class="num">${dc.terms.euler}</td></tr></tbody></table><p class="expr">g(C) = ${dc.g}</p><p class="small">${[2, 4, 6, 8, 10].map((k) => `${k} branch points → genus ${k / 2 - 1}`).join(" · ")}</p>` : `<p class="small">${esc(dc.why)}</p>`;
  const n = Number($("rh-n").value) || 1, gt = Number($("rh-g").value) || 0, es = $("rh-e").value.split(/[,\s]+/).filter(Boolean).map(Number).filter((x) => Number.isFinite(x));
  const rh = RR.riemannHurwitz({ degree: n, gTarget: gt, ramification: es });
  $("rh-out").innerHTML = `<p class="math">R = Σ(e<sub>P</sub> − 1)P, deg R = ${rh.degR}</p><p class="expr">${esc(rh.text)}</p><p>${rh.valid ? `<span class="badge ok">consistent</span>` : `<span class="badge bad">impossible</span> <span class="small">${es.some((e) => e > n) ? "an index e_P exceeds the degree" : "the Euler characteristic must be even and g ≥ 0"}</span>`}</p>`;
}
/* --- linear systems --- */
function renderVeronese() {
  const d = Number($("ver-d").value); $("ver-d-out").textContent = d;
  const v = RR.veronese(d); let g;
  if (d === 1) { g = `<line class="img" x1="30" y1="150" x2="310" y2="150"/><text class="lbl" x="30" y="40">P¹ → P¹: the line</text>`; }
  else if (d === 2) { const F = frame(-2, 2, -0.4, 4.2, 340, 260, 18), pts = []; for (let i = 0; i <= 100; i++) { const x = -2 + (4 * i) / 100; pts.push([x, x * x]); } g = `<path class="img" d="${path(pts, F)}"/><text class="lbl" x="14" y="22">XZ = Y² (chart X = 1)</text>`; }
  else { const pts = []; for (let i = 0; i <= 160; i++) { const x = -1.5 + (3 * i) / 160; pts.push([x / 1.5, (d === 3 ? x * x : x ** 4 / 2.5) / 2.25 - 0.5, (x ** 3) / 3.4]); } g = draw3("ver-svg", [{ pts }], ROT["ver-svg"], { labels: ["x", d === 3 ? "x²" : "x⁴", "x³"], H: 260 }); }
  draw("ver-svg", g);
  const form = Array.from({ length: d + 1 }, (_, i) => `s${d - i > 0 ? (d - i > 1 ? sup(d - i) : "") : ""}${i ? "t" + (i > 1 ? sup(i) : "") : ""}`.replace(/^s⁰|^$/, "") || "1").map((s) => (s.startsWith("t") || s.startsWith("s") ? s : s));
  $("ver-out").innerHTML = `L(${d}∞) = ⟨${v.basis.join(", ")}⟩, ℓ = ${d + 1}: [s : t] ↦ [${form.join(" : ")}], image ${esc(v.name)}. Quadrics through the image: ${v.quadrics} (expected ${v.expectedQuadrics})${v.quadricEquations.length ? ": " + esc(v.quadricEquations.join(", ")) : ""}.`;
}
function renderStages() {
  const E = ST.E, n = Number($("st-n").value); $("st-n-out").textContent = n;
  let up = Number($("st-p").value), uq = Number($("st-q").value);
  if (up < 0.004 || up > 0.996) up = 0.004; if (uq < 0.004 || uq > 0.996) uq = 0.992;
  const P = RR.ecFromAbel(E, up, 0); let Q = RR.ecFromAbel(E, uq, 0);
  if (Math.abs(up + uq - 1) < 0.004) Q = RR.ecNeg(P);
  const D = [{ p: RR.O, n }], st = RR.ecStages(E, D, P, Q);
  const rows = [["base-point free", st.basePointFree, st.basePoint ? `base point at ${RR.ecname(st.basePoint)}` : "ℓ(D − P) = ℓ(D) − 1 for every P"], ["separates points", st.separatesPoints, n === 2 ? "fails exactly for pairs with P + Q ∼ 2O, i.e. Q = −P" : ""], [`separates this P, Q`, st.pair.separated, st.pair.why], ["separates tangent directions", st.separatesTangents, n === 2 ? "fails at the four 2-torsion points (O and the roots of the cubic): ramification" : ""], ["very ample → embedding", st.veryAmple, n >= 3 ? `deg ${n} ≥ 2g + 1 = 3` : ""]];
  $("st-ladder").innerHTML = rows.map(([k, v, why]) => `<li class="${v ? "ok" : "no"}">${esc(k)}${why ? ` <span class="tiny muted">— ${esc(why)}</span>` : ""}</li>`).join("");
  $("st-out").innerHTML = `ℓ(${n}O) = ${st.ell}; P = ${esc(RR.ecname(P))}, Q = ${esc(RR.ecname(Q))}. Set Q to the mirror position of P (sliders summing to 1) to see |2O| collapse P and −P.`;
}
/* --- plane curves --- */
function renderPlane() {
  $("pg-table").innerHTML = `<table><thead><tr><th scope="col">d</th><th scope="col">g</th><th scope="col">deg K = d(d − 3)</th><th scope="col">2g − 2</th></tr></thead><tbody>${[1, 2, 3, 4, 5, 6].map((d) => `<tr ${ST.curve === "plane" && ST.plane.d === d ? 'style="background:var(--soft)"' : ""}><td class="num">${d}</td><td class="num">${RR.planeGenus(d)}</td><td class="num">${d * (d - 3)}</td><td class="num">${2 * RR.planeGenus(d) - 2}</td></tr>`).join("")}</tbody></table>`;
  const d = Number($("adj-d").value); $("adj-d-out").textContent = d;
  const a = RR.adjunction(d);
  $("adj").textContent = `K_C = (K_P² + C)|_C,   K_P² = −3H,   C ∼ ${d}H\n    = (−3H + ${d}H)|_C = ${d - 3}H|_C\ndeg K_C = ${d - 3} · deg(H|_C) = ${d - 3} · ${d} = ${a.degK}\n2g − 2 = ${a.degK}  ⇒  g = ${a.g} = (${d} − 1)(${d} − 2)/2${d === 4 ? "\nd = 4: K_C = H|_C — the plane embedding is the canonical map" : ""}\nholomorphic differentials: ${RR.planeDifferentials(d).join(", ") || "none"}`;
  renderIntersect();
}
function renderIntersect() {
  const A_ = RR.PLANE[$("ix-a").value] ? $("ix-a").value : "cubic", B_ = RR.PLANE[$("ix-b").value] ? $("ix-b").value : "line", isLine = B_ === "line";
  $("ix-m-row").hidden = !isLine; $("ix-c-row").hidden = !isLine;
  const m = Number($("ix-m").value), c = Number($("ix-c").value); $("ix-m-out").textContent = m; $("ix-c-out").textContent = c;
  const FA = RR.PLANE[A_].F, FB = isLine ? RR.lineForm(-Math.round(m * 10), 10, -Math.round(c * 10)) : RR.PLANE[B_].F;
  const fa = planeF(RR.PLANE[A_].d), fb = isLine ? (x, y) => y - m * x - c : planeF(RR.PLANE[B_].d);
  const F = frame(-2.2, 2.2, -1.8, 1.8, 360, 300, 12);
  let g = `<line class="axis" x1="${F.X(-2.2)}" y1="${F.Y(0)}" x2="${F.X(2.2)}" y2="${F.Y(0)}"/><line class="axis" x1="${F.X(0)}" y1="${F.Y(-1.8)}" x2="${F.X(0)}" y2="${F.Y(1.8)}"/><path class="curve" d="${segPath(contour(fa, -2.2, 2.2, -1.8, 1.8, 130, 110), F)}"/><path class="curve2" d="${segPath(contour(fb, -2.2, 2.2, -1.8, 1.8, 130, 110), F)}"/>`;
  if (A_ === B_) { draw("ix-svg", g); $("ix-out").innerHTML = `<p><span class="badge bad">Common component</span> Bézout needs curves with no common component.</p>`; draw("ix-zoom", ""); return; }
  const ix = RR.intersect(FA, FB);
  let zoomPt = null;
  for (const p of ix.points) if (p.real && p.affine) { g += `<circle class="${p.m > 1 ? "neg" : "pos"}" cx="${F.X(p.x.re)}" cy="${F.Y(p.y.re)}" r="${4 + 2 * p.m}"/><text class="lbl" x="${F.X(p.x.re) + 8}" y="${F.Y(p.y.re) - 8}">${p.m}</text>`; if (!zoomPt || p.m > zoomPt.m) zoomPt = p; }
  draw("ix-svg", g);
  const desc = (p) => (p.affine ? `(${RR.fmt(p.x.re, 3)}${Math.abs(p.x.im) > 1e-9 ? (p.x.im < 0 ? " − " : " + ") + RR.fmt(Math.abs(p.x.im), 3) + "i" : ""}, ${RR.fmt(p.y.re, 3)}${Math.abs(p.y.im) > 1e-9 ? (p.y.im < 0 ? " − " : " + ") + RR.fmt(Math.abs(p.y.im), 3) + "i" : ""})` : "at infinity");
  $("ix-out").innerHTML = `<div class="tablewrap"><table><thead><tr><th scope="col">point</th><th scope="col">kind</th><th scope="col">I<sub>P</sub></th></tr></thead><tbody>${ix.points.map((p) => `<tr><td class="num">${esc(desc(p))}</td><td>${p.affine ? (p.real ? "real" : "complex") : "on the line at ∞"}${p.m > 1 ? " · tangent" : ""}</td><td class="num">${p.m}</td></tr>`).join("")}</tbody></table></div><p class="expr">Σ I<sub>P</sub> = ${ix.total} = ${ix.d} · ${ix.e} <span class="badge ${ix.total === ix.bezout ? "ok" : "bad"}">Bézout</span></p>`;
  if (zoomPt) { const r = 0.22, Z = frame(zoomPt.x.re - r * 2.4, zoomPt.x.re + r * 2.4, zoomPt.y.re - r, zoomPt.y.re + r, 360, 140, 6); draw("ix-zoom", `<path class="curve" d="${segPath(contour(fa, Z.x0, Z.x1, Z.y0, Z.y1, 120, 60), Z)}"/><path class="curve2" d="${segPath(contour(fb, Z.x0, Z.x1, Z.y0, Z.y1, 120, 60), Z)}"/><circle class="${zoomPt.m > 1 ? "neg" : "pos"}" cx="${Z.X(zoomPt.x.re)}" cy="${Z.Y(zoomPt.y.re)}" r="5"/><text class="lbl" x="8" y="16">zoom ×10: I = ${zoomPt.m} ${zoomPt.m > 1 ? "(tangency)" : "(transverse)"}</text>`); }
  else draw("ix-zoom", `<text class="lblm" x="10" y="20">No real affine intersection to zoom on.</text>`);
}
/* --- canonical maps --- */
const CM = { g: 3, h: false };
function renderCanonical() {
  $("cm-g").innerHTML = [2, 3, 4].map((g) => `<button type="button" data-cmg="${g}" aria-pressed="${CM.g === g}">genus ${g}</button>`).join("");
  $("cm-h").innerHTML = `<button type="button" data-cmh="1" aria-pressed="${CM.h || CM.g === 2}">hyperelliptic</button><button type="button" data-cmh="0" aria-pressed="${!CM.h && CM.g !== 2}" ${CM.g === 2 ? "disabled" : ""}>nonhyperelliptic</button>`;
  const h = CM.h || CM.g === 2, cm = RR.canonicalMap(CM.g, h);
  const diffs = h ? RR.hyperCanonical(CM.g).basis.map((b) => b.differential) : CM.g === 3 ? RR.planeDifferentials(4) : ["four differentials (no plane model: the canonical curve lies on a quadric in P³)"];
  $("cm-out").innerHTML = `<p class="expr">φ<sub>K</sub> : C → P${sup(CM.g - 1)}</p><p>${esc(cm.description)}</p><p class="small">ℓ(K) = g = ${CM.g}; deg K = ${2 * CM.g - 2}. ${esc(cm.check || "")}</p><p class="small">Basis of holomorphic differentials: ${esc(diffs.join(", "))}</p>${CM.g === 2 ? `<p class="note">Every genus-2 curve is hyperelliptic: ℓ(K) = 2 gives a map to P¹ of degree deg K = 2.</p>` : ""}`;
  let g = "";
  if (h) {
    if (CM.g === 2) { g = `<line class="img" x1="30" y1="190" x2="330" y2="190"/>${[0, 1, 2, 3, 4, 5].map((k) => `<circle class="branch" cx="${50 + k * 52}" cy="190" r="5"/>`).join("")}<ellipse class="sheet" cx="180" cy="70" rx="150" ry="22"/><ellipse class="sheet" cx="180" cy="120" rx="150" ry="22"/><text class="lbl" x="20" y="225">P¹, six branch points</text><text class="lbl" x="250" y="160">2 : 1 ↓</text>`; }
    else { const F = frame(-1.8, 1.8, -0.4, 3.4, 360, 240, 18), pts = []; for (let i = 0; i <= 80; i++) { const x = -1.8 + (3.6 * i) / 80; pts.push([x, x * x]); } g = CM.g === 3 ? `<path class="img" d="${path(pts, F)}"/><text class="lbl" x="12" y="22">image: the conic XZ = Y², covered twice</text>` : (() => { const p3 = []; for (let i = 0; i <= 120; i++) { const x = -1.5 + (3 * i) / 120; p3.push([x / 1.5, (x * x) / 2.25 - 0.5, (x ** 3) / 3.4]); } return draw3("cm-svg", [{ pts: p3 }], { yaw: 0.6, pitch: 0.35 }, { labels: ["x", "x²", "x³"], H: 240, scale: 85 }) + `<text class="lbl" x="12" y="22">image: a twisted cubic, covered twice</text>`; })(); }
  } else if (CM.g === 3) { const F = frame(-1.6, 1.6, -1.3, 1.3, 360, 240, 16); g = `<path class="img" d="${segPath(contour(planeF(4), -1.6, 1.6, -1.3, 1.3, 110, 90), F)}"/><text class="lbl" x="12" y="22">the plane quartic x⁴ + y⁴ = 1 itself (real locus)</text>`; }
  else { const p3 = []; for (let i = 0; i <= 240; i++) { const t = (2 * Math.PI * i) / 240; p3.push([0.85 * Math.cos(2 * t) * (1 + 0.25 * Math.cos(3 * t)), 0.85 * Math.sin(2 * t) * (1 + 0.25 * Math.cos(3 * t)), 0.45 * Math.sin(3 * t)]); } g = draw3("cm-svg", [{ pts: p3 }], { yaw: 0.5, pitch: 0.5 }, { labels: ["X", "Y", "Z"], H: 240, scale: 90 }) + `<text class="lbl" x="12" y="22">a sextic on a quadric in P³</text><text class="schematic" x="250" y="232" style="fill:var(--warn)">SCHEMATIC</text>`; }
  draw("cm-svg", g);
}
/* --- computation mode --- */
let CP = null;
function runCompute() {
  try { CP = RR.compute($("cp-curve").value, $("cp-div").value); }
  catch (e) { CP = null; $("cp-out").innerHTML = `<p class="small" style="color:var(--bad)">${esc(e.message)}</p><p class="tiny muted">Unsupported requests are not guessed: write P1 or y^2 = f(x) with f square-free of degree ≥ 3, and a divisor n∞, nO, K, or (on P¹) a sum like 2[0] + [1] − [inf].</p>`; return; }
  const r = CP;
  $("cp-out").innerHTML = `<dl class="kv"><dt>curve</dt><dd>${esc(r.curve.label)}${r.curve.weierstrass ? " (Weierstrass form)" : ""}</dd><dt>genus</dt><dd>${r.g}</dd><dt>divisor</dt><dd>${esc(r.divisor)}, degree ${r.deg}</dd><dt>basis of L(D)</dt><dd><div class="basis">${r.basis.length ? r.basis.map((b) => `<span class="chip">${esc(b)}</span>`).join("") : "—"}</div></dd>${r.poles ? `<dt>pole orders</dt><dd>${r.poles.join(", ") || "—"}</dd>` : ""}${r.differentials ? `<dt>differentials</dt><dd>${esc(r.differentials.join(", "))}</dd>` : ""}<dt>ℓ(D)</dt><dd><b>${r.ell}</b></dd><dt>Riemann–Roch</dt><dd>${esc(r.rr.text)}${r.rr.nonspecial ? " · nonspecial" : " · special"}</dd></dl><p class="note">${esc(r.note)}</p>${r.curve.type !== "P1" || r.divisor ? `<button type="button" class="btn sm" id="cp-load">Load into the laboratory</button>` : ""}`;
}
function loadCompute() {
  if (!CP) return;
  const c = CP.curve, D = (() => { try { return RR.parseDivisor($("cp-div").value, c); } catch { return null; } })();
  if (!D) return;
  if (c.type === "P1") { ST.curve = "P1"; ST.div.P1 = D.canonical ? [{ p: RR.INF, n: -2, label: "∞" }] : D.atInfinity !== undefined ? [{ p: RR.INF, n: D.atInfinity, label: "∞" }] : D.divisor.map((t) => ({ ...t, label: t.p.inf ? "∞" : RR.fmt(t.p.re) })); }
  else if (c.weierstrass) { ST.curve = "elliptic"; ST.E = { a: c.a, b: c.b }; ST.div.elliptic = [{ p: RR.O, n: D.canonical ? 0 : D.atInfinity, label: "O" }].filter((t) => t.n); }
  else { ST.curve = "hyperelliptic"; const odd = c.degf % 2 === 1, n = D.canonical ? (odd ? 2 * c.g - 2 : c.g - 1) : D.atInfinity; ST.hyper = { g: c.g, even: !odd, f: c.f.slice() }; ST.div.hyperelliptic = odd ? [{ p: { inf: true }, n, label: "∞" }] : [{ p: { inf: "+" }, n, label: "∞₊" }, { p: { inf: "-" }, n, label: "∞₋" }]; }
  ST.preset = null; ST.sel = 0; renderSide(); update(); const lab = $("lab"); if (lab.scrollIntoView) lab.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
}
const SG = [["O on an elliptic curve", [2, 3], 1], ["∞ on y² = f₅(x), genus 2", [2, 5], 2], ["∞ on y² = f₇(x), genus 3", [2, 7], 3], ["a general point, genus 3", [4, 5, 6, 7], 3], ["a general point, genus 4", [5, 6, 7, 8, 9], 4]];
let SGi = 0;
function renderSemigroup() {
  $("sg-pick").innerHTML = SG.map(([t], i) => `<button type="button" data-sg="${i}" aria-pressed="${SGi === i}">${esc(t)}</button>`).join("");
  const [name, gens, g] = SG[SGi], s = RR.semigroup(gens, 15), gp = RR.gaps(gens);
  const derived = SGi <= 2 ? RR.poleOrders(RR.hyperBasis(2 * g + 1, 15).basis) : null;
  $("sg-out").innerHTML = `<div class="tablewrap"><table><tbody><tr>${s.map((x) => `<td class="num" style="text-align:center">${x.n}</td>`).join("")}<td>…</td></tr><tr>${s.map((x) => `<td style="text-align:center;color:var(${x.allowed ? "--ok" : "--bad"});font-weight:700">${x.allowed ? "✓" : "×"}</td>`).join("")}<td>…</td></tr></tbody></table></div><p>Gaps at ${esc(name)}: <b>${gp.join(", ")}</b> — ${gp.length} = g = ${g} gaps${SGi >= 3 ? " (the generic pattern 1, …, g)" : ""}. Weierstrass weight ${RR.weierstrassWeight(gp)}${RR.weierstrassWeight(gp) ? ": a Weierstrass point" : ": not a Weierstrass point"}.</p>${derived ? `<p class="small">Derived from the symbolic basis of L(15·${SGi === 0 ? "O" : "∞"}): pole orders ${derived.join(", ")} — generated by ${gens.join(" and ")} (ord x = −2, ord y = −${gens[1]}).</p>` : `<p class="small">At a general point ℓ(nP) = 1 for n ≤ g (Riemann–Roch with h⁰(K − nP) = g − n), so 1, …, g are gaps and every n ≥ g + 1 is a pole order.</p>`}`;
}
/* --- function field --- */
function renderValuation() {
  const n0 = Number($("vv-0").value), n1 = Number($("vv-1").value), ni = Number($("vv-i").value);
  $("vv-0-out").textContent = n0; $("vv-1-out").textContent = n1; $("vv-i-out").textContent = ni;
  const R = 6, lat = RR.valuationLattice(n0, n1, ni, R), F = frame(-R - 0.5, R + 0.5, -R - 0.5, R + 0.5, 320, 320, 14), deg = n0 + n1 + ni;
  let g = "";
  const poly = []; for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) void 0;
  void poly;
  g += `<rect class="halfplane" x="${F.X(-n0)}" y="${F.Y(R + 0.5)}" width="${F.X(R + 0.5) - F.X(-n0)}" height="${F.Y(-R - 0.5) - F.Y(R + 0.5)}" opacity=".6"/><rect class="halfplane" x="${F.X(-R - 0.5)}" y="${F.Y(R + 0.5)}" width="${F.X(R + 0.5) - F.X(-R - 0.5)}" height="${F.Y(-n1) - F.Y(R + 0.5)}" opacity=".6"/>`;
  g += `<line class="axis" x1="${F.X(-R - 0.5)}" y1="${F.Y(0)}" x2="${F.X(R + 0.5)}" y2="${F.Y(0)}"/><line class="axis" x1="${F.X(0)}" y1="${F.Y(-R - 0.5)}" x2="${F.X(0)}" y2="${F.Y(R + 0.5)}"/>`;
  g += `<line stroke="var(--neg)" stroke-width="2" x1="${F.X(-R - 0.5)}" y1="${F.Y(ni + R + 0.5)}" x2="${F.X(R + 0.5)}" y2="${F.Y(ni - R - 0.5)}"/><text class="lblm" x="${F.X(R - 3)}" y="${F.Y(ni - R + 2.5)}">a + b = ${fmt(ni)}</text>`;
  for (const p of lat.points) g += `<circle cx="${F.X(p.a)}" cy="${F.Y(p.b)}" r="${p.inside ? 4 : 2}" class="${p.inside ? "pos" : "imgpt"}" opacity="${p.inside ? 1 : 0.35}"/>`;
  g += `<text class="lblm" x="${F.X(R) - 6}" y="${F.Y(0) - 4}">v₀ = a</text><text class="lblm" x="${F.X(0) + 4}" y="${F.Y(R)}">v₁ = b</text>`;
  draw("vv-svg", g);
  const f = fnObj(), vec = RR.valuationVector(f, [RR.cx(0), RR.cx(1), RR.INF]);
  $("vv-out").innerHTML = `<p>Inequalities: ${lat.inequalities.join(", ")} (the shaded half-planes and the side of the red line).</p><p>${lat.count} lattice points: functions x<sup>a</sup>(x − 1)<sup>b</sup> in L(D). They span L(D) but are not independent — ℓ(D) = deg D + 1 = ${Math.max(0, deg + 1)}.</p><p>The microscope's f = ${esc(RR.p1fstr(f))} has valuation vector (v₀, v₁, v∞) = (${vec.map((v) => fmt(v)).join(", ")}).</p>`;
}
/* --- advanced --- */
function renderClifford() {
  const g = Number($("cl-g").value), h = $("cl-h").checked; $("cl-g-out").textContent = g;
  const data = RR.cliffordData(g, h), F = frame(0, 2 * g + 2, 0, g + 3.5, 340, 240, 24);
  let s = `<line class="axis" x1="${F.X(0)}" y1="${F.Y(0)}" x2="${F.X(2 * g + 2)}" y2="${F.Y(0)}"/><line class="axis" x1="${F.X(0)}" y1="${F.Y(0)}" x2="${F.X(0)}" y2="${F.Y(g + 3.5)}"/>`;
  s += `<rect x="${F.X(0)}" y="${F.Y(g + 3.5)}" width="${F.X(2 * g - 2) - F.X(0)}" height="${F.Y(0) - F.Y(g + 3.5)}" fill="var(--soft2)"/>`;
  s += `<path class="curve2" stroke-dasharray="5 4" d="${path([[g - 1, 0], [2 * g + 2, g + 3]], F)}"/><path stroke="var(--warn)" stroke-width="2" fill="none" d="${path([[0, 1], [2 * g - 2, g]], F)}"/>`;
  for (const p of data.points) { const sat = p.d <= 2 * g - 2 && Math.abs(p.ell - (p.d / 2 + 1)) < 1e-9; s += `<circle class="${sat ? "neg" : "pos"}" cx="${F.X(p.d)}" cy="${F.Y(p.ell)}" r="5"/>`; }
  s += `<text class="lblm" x="${F.X(0) + 4}" y="${F.Y(g + 3.2)}">Clifford: ℓ ≤ d/2 + 1 (orange) · RR line ℓ = d + 1 − g (dashed)</text><text class="lblm" x="${F.X(2 * g + 2) - 30}" y="${F.Y(0) + 16}">deg D</text>`;
  draw("cl-svg", s);
}
function renderJacobian() {
  const g = Number($("jac-g").value), u = Number($("jac-p").value); $("jac-g-out").textContent = g;
  let s = "";
  if (g === 1) {
    const E = ST.E, P = RR.ecFromAbel(E, Math.min(0.996, Math.max(0.004, u)), 0), a = RR.ecAbel(E, P).u, F0 = ecFrame(), F = frame(F0.x0, F0.x1, F0.y0, F0.y1, 170, 200, 8);
    for (const comp of RR.ecRealLocus(E, F0.x0, F0.x1)) s += `<path class="curve" d="${path([...comp.upper.slice().reverse(), ...comp.lower].filter(([, y]) => Math.abs(y) <= F0.y1 * 1.2), F)}${comp.closed ? "Z" : ""}"/>`;
    s += `<circle class="pos" cx="${F.X(P.x)}" cy="${F.Y(P.y)}" r="5"/><circle cx="255" cy="100" r="70" fill="none" stroke="var(--map)" stroke-width="2"/><circle class="imgpt" cx="${255 + 70 * Math.cos(2 * Math.PI * a - Math.PI / 2)}" cy="${100 + 70 * Math.sin(2 * Math.PI * a - Math.PI / 2)}" r="6"/><text class="lblm" x="210" y="190">J(E): real circle</text><text class="lbl" x="150" y="105">↦</text>`;
    $("jac-out").textContent = `P ↦ [P − O] ↦ u(P) = ${fmt(a, 4)} of the real period: a bijection — in genus one the Jacobian is the curve.`;
  } else {
    for (let k = 0; k < g; k++) { const cx = 45 + k * (250 / Math.max(1, g - 1 || 1)) + (g === 1 ? 125 : 0), th = 2 * Math.PI * ((k + 1) * u + 0.17 * k) - Math.PI / 2; s += `<circle cx="${cx}" cy="100" r="34" fill="none" stroke="var(--map)" stroke-width="2"/><circle class="imgpt" cx="${cx + 34 * Math.cos(th)}" cy="${100 + 34 * Math.sin(th)}" r="5"/><text class="lblm" x="${cx - 14}" y="155">factor ${k + 1}</text>`; }
    s += `<text class="schematic" x="10" y="190" style="fill:var(--warn)">SCHEMATIC COORDINATES</text>`;
    $("jac-out").textContent = `For g = ${g}, P ↦ [P − P₀] embeds C in the ${g}-dimensional torus J(C) = ℂ${sup(g)}/Λ as a curve (Abel–Jacobi). Dragging P moves all ${g} coordinates at once; the picture shows one real direction per factor and is schematic.`;
  }
  draw("jac-svg", s);
}
function renderSym() {
  const g = Number($("sym-g").value), d = Number($("sym-d").value); $("sym-g-out").textContent = g; $("sym-d-out").textContent = d;
  const big = d > 2 * g - 2, fib = big ? d - g : null;
  $("sym-out").innerHTML = `<p class="math">Sym${sup(d)}(C) → Pic${sup(d)}(C), D ↦ [D]: fibre over [D] = |D| = P${big ? sup(fib) : "^{ℓ(D) − 1}"}</p><p>dim Sym${sup(d)} C = ${d}, dim Pic${sup(d)} C = g = ${g}.</p><p>${big ? `deg ${d} > 2g − 2 = ${2 * g - 2}: ℓ(D) = d + 1 − g = ${d + 1 - g} for every D, so the Abel map is a projective bundle with fibres P${sup(fib)} (dimension d − g = ${fib}) — ${d} = ${g} + ${fib}.` : d < g ? `d < g: the image W${RR.sub(d)} ⊂ Pic${sup(d)} has dimension ${d}; a general fibre is a single divisor.` : `special range: fibres jump; generically ℓ(D) = ${Math.max(1, d + 1 - g)} on the image, larger over special classes (e.g. K).`}</p>`;
  let s = `<rect x="40" y="20" width="260" height="110" rx="12" fill="var(--soft)" stroke="var(--curve)"/><text class="lbl" x="50" y="40">Sym${sup(d)}(C)</text><line class="curve" x1="40" y1="190" x2="300" y2="190"/><text class="lbl" x="50" y="210">Pic${sup(d)}(C) (dim ${g})</text>`;
  for (let k = 0; k < 6; k++) { const x = 70 + k * 42, h = big ? 20 + 12 * Math.min(fib, 6) : k === 2 ? 70 : 12; s += `<line stroke="var(--map)" stroke-width="3" x1="${x}" y1="${120 - h}" x2="${x}" y2="120"/><line stroke="var(--muted)" stroke-dasharray="2 3" x1="${x}" y1="122" x2="${x}" y2="188"/><circle class="imgpt" cx="${x}" cy="190" r="3.5"/>`; }
  s += `<text class="lblm" x="230" y="160">fibre |D|</text>`;
  draw("sym-svg", s);
}
function renderBundles() {
  const d = ST.curve === "P1" && A.deg >= 0 ? A.deg : 3;
  $("lb-flow").textContent = `D  ⇝  𝒪_C(D)        (divisor → line bundle)\nL(D) = H⁰(C, 𝒪_C(D))\nℓ(D) = h⁰(C, 𝒪_C(D))\n\nCURVE → DIVISOR → LINE BUNDLE → SECTIONS → PROJECTIVE MAP`;
  $("sheaf").innerHTML = `<p><b>Sheaf picture of 𝒪(${d}∞) on P¹.</b> Cover P¹ by U₀ = {x ≠ ∞} and U₁ = {x ≠ 0} (coordinate w = 1/x on U₁). A section is a pair of local functions s₀ ∈ k[x], s₁ ∈ k[w] with</p><p class="math">s₀ = g₀₁ · s₁,  g₀₁ = x${sup(d)} on U₀ ∩ U₁.</p><p>So s₀ is a polynomial whose quotient by x${sup(d)} is a polynomial in 1/x: deg s₀ ≤ ${d}. Collapsing back: H⁰(P¹, 𝒪(${d}∞)) = ⟨1, x, …, x${sup(d)}⟩, dimension ${d + 1} — the same space L(${d}∞) the laboratory found by searching.</p><p class="tiny muted">Advanced preview; the divisor story above never needs it.</p>`;
}
/* --- concept map and synthesis --- */
const NODES = [["points", 320, 24, "m-functions"], ["divisors", 320, 82, "lab"], ["rational functions", 170, 140, "m-functions"], ["line bundles", 470, 140, "m-advanced"], ["principal divisors", 170, 200, "m-pic"], ["H⁰(C, L)", 470, 200, "m-advanced"], ["Riemann–Roch", 320, 258, "m-rr"], ["linear systems", 320, 312, "m-linsys"], ["maps to Pⁿ", 320, 366, "panel-map"], ["embeddings", 190, 410, "m-elliptic"], ["covers", 450, 410, "m-hyper"], ["adjunction", 110, 452, "m-plane"], ["Riemann–Hurwitz", 530, 452, "m-hyper"], ["curves", 320, 452, "lab"]];
const EDGES = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 6], [6, 7], [7, 8], [8, 9], [8, 10], [9, 11], [10, 12], [11, 13], [12, 13]];
function renderConcept() {
  let s = "";
  for (const [a, b] of EDGES) { const A_ = NODES[a], B_ = NODES[b]; s += `<line class="edge" data-go="${B_[3]}" x1="${A_[1]}" y1="${A_[2] + 12}" x2="${B_[1]}" y2="${B_[2] - 12}"><title>${esc(A_[0])} → ${esc(B_[0])}</title></line>`; }
  for (const [t, x, y, go] of NODES) { const w = t.length * 7.4 + 18; s += `<g class="node" data-go="${go}" tabindex="0" role="button" aria-label="${esc(t)}: replay"><rect x="${x - w / 2}" y="${y - 13}" width="${w}" height="26" rx="13"/><text x="${x - w / 2 + 9}" y="${y + 4}">${esc(t)}</text></g>`; }
  draw("concept-svg", s);
}
const SYN = ["CURVE", "DIVISOR", "𝒪(D)", "H⁰(C, 𝒪(D))", "BASIS s₀…sₙ", "P ↦ [s₀(P) : … : sₙ(P)]", "PROJECTIVE IMAGE", "NEW GEOMETRY"];
let synStep = 0, synTimer = null;
function renderSynthText() {
  $("synth").innerHTML = SYN.map((s, i) => `<span class="${i <= synStep ? "on" : ""}">${esc(s)}</span>`).join("");
  const texts = [
    `Begin with the curve: ${({ P1: "P¹", elliptic: "the elliptic curve E", hyperelliptic: "a hyperelliptic curve", plane: "a smooth plane curve", abstract: "an abstract curve" })[ST.curve]}, genus ${A.g}.`,
    `Place a divisor: D = ${A.divisor}, degree ${A.deg}.`,
    `D opens into the line bundle 𝒪(D).`,
    `Its global sections H⁰(C, 𝒪(D)) = L(D) have dimension ${A.exact ? A.ell : `${A.range.min}…${A.range.max}`}.`,
    A.basis && A.basis.length ? `Choose a basis: ${A.basis.join(", ")}.` : "Choose a basis (here fixed by Riemann–Roch, not written).",
    A.basis && A.basis.length ? `Construct P ↦ [${A.basis.join(" : ")}].` : "Construct P ↦ [s₀(P) : … : sₙ(P)].",
    `A projective image appears: ${A.map?.description || ""}.`,
    "Divisors control functions, and functions construct geometry.",
  ];
  $("synth-text").innerHTML = synStep === SYN.length - 1 ? `<span class="boxed">${esc(texts[synStep])}</span>` : esc(texts[synStep]);
}
function synthPlay() {
  if (synTimer) { clearInterval(synTimer); synTimer = null; $("synth-play").textContent = "Play"; return; }
  if (reduced()) { synStep = SYN.length - 1; renderSynthText(); return; }
  synStep = 0; renderSynthText(); $("synth-play").textContent = "Pause";
  synTimer = setInterval(() => { synStep++; if (synStep >= SYN.length - 1) { synStep = SYN.length - 1; clearInterval(synTimer); synTimer = null; $("synth-play").textContent = "Play"; } renderSynthText(); }, 1400);
}
/* --- §65 checklist --- */
const CHECK_PRESET = { "p1-L": "p1-3inf", "e-ell": "e-2o", "e-2o": "e-2o", "e-3o": "e-3o", cubic: "e-3o", rh: "six", plane: "quartic", k2: "k2", quartic: "quartic", pic0: null };
function renderChecklist() {
  $("checklist").innerHTML = RR.minimumComputations().map((c) => `<li><span class="${c.ok ? "tick" : "cross"}">${c.ok ? "✓" : "✗"}</span><span><b>${esc(c.claim)}</b><br><span class="small muted">${esc(c.value)}</span></span><button type="button" class="btn sm" data-check="${c.id}">${CHECK_PRESET[c.id] ? "Load" : "Show"}</button></li>`).join("");
  $("refs").innerHTML = RR.REFERENCES.map((r) => `<li><b>${esc(r.text)}</b> — ${esc(r.where)}</li>`).join("");
}
function renderModulesFromLab() { renderElliptic(); renderStages(); renderBundles(); if ($("jac-g").value === "1") renderJacobian(); }
function goTo(id) { const e = $(id); if (e && e.scrollIntoView) e.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" }); }

/* ================= palette ================= */
const COMMANDS = [
  ["draw P1", () => setCurve("P1")], ["draw elliptic curve", () => setCurve("elliptic")], ["draw genus 2 curve", () => loadPreset("g2")], ["draw hyperelliptic curve", () => setCurve("hyperelliptic")], ["draw plane curve", () => setCurve("plane")], ["draw abstract genus g curve", () => setCurve("abstract")],
  ["add divisor", () => { goTo("lab"); try { $("geo-svg").focus(); } catch { /* not focusable */ } }], ["compute degree", () => goTo("panel-divisor")], ["compute div(f)", () => goTo("m-functions")], ["compute L(D)", () => goTo("panel-sections")], ["compute ℓ(D)", () => goTo("panel-sections")],
  ["apply Riemann Roch", () => goTo("panel-rr")], ["show canonical divisor", () => { ST.rrFocus = "K"; update(); goTo("lab"); }], ["construct φ_D", () => { ST.layers.map = true; update(); goTo("panel-map"); }], ["show linear system", () => goTo("m-linsys")], ["show Picard group", () => goTo("m-pic")],
  ["show Jacobian", () => goTo("m-advanced")], ["show Abel Jacobi", () => goTo("m-advanced")], ["show branch points", () => goTo("m-hyper")], ["apply Riemann Hurwitz", () => goTo("m-hyper")], ["show Bezout", () => goTo("m-plane")], ["show intersection multiplicity", () => goTo("m-plane")],
  ["show group law", () => goTo("m-elliptic")], ["canonical map laboratory", () => goTo("m-canonical")], ["computation mode", () => goTo("m-compute")], ["Weierstrass gaps", () => goTo("m-compute")], ["valuation vectors", () => goTo("m-field")], ["Clifford explorer", () => goTo("m-advanced")], ["symmetric powers / master diagram", () => goTo("m-advanced")], ["concept map", () => goTo("m-concept")], ["final synthesis", () => { goTo("m-concept"); synthPlay(); }], ["minimum computations checklist", () => goTo("m-check")], ["references", () => goTo("m-refs")],
  ["toggle line-bundle notation", () => setNotation(!document.body.classList.contains("bundle"))],
  ...RR.PRESETS.map((p) => [`preset: ${p.title}`, () => loadPreset(p.id)]),
];
let palSel = 0;
function palItems() { const q = $("pal-q").value.toLowerCase().replace(/[^a-z0-9ℓφ¹ ]/g, " ").split(/\s+/).filter(Boolean); return COMMANDS.filter(([t]) => q.every((w) => t.toLowerCase().includes(w))); }
function renderPal() { const it = palItems(); palSel = Math.min(palSel, Math.max(0, it.length - 1)); $("pal-list").innerHTML = it.map(([t], i) => `<li role="option" data-cmd="${esc(t)}" aria-selected="${i === palSel}">${esc(t)}</li>`).join("") || `<li>No command</li>`; }
function openPal() { const d = $("palette"); $("pal-q").value = ""; palSel = 0; renderPal(); try { d.showModal(); } catch { d.setAttribute("open", ""); } try { $("pal-q").focus(); } catch { /* focus blocked */ } }
function runCmd(t) { const c = COMMANDS.find(([x]) => x === t); try { $("palette").close(); } catch { /* not open */ } if (c) c[1](); }

/* ================= notation and theme ================= */
function setNotation(bundle) { document.body.classList.toggle("bundle", bundle); $("nt-div").setAttribute("aria-pressed", String(!bundle)); $("nt-lb").setAttribute("aria-pressed", String(bundle)); store.set("rr-notation", bundle ? "bundle" : "divisor"); }
const THEMES = ["auto", "light", "dark"];
function setTheme(t) { if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); $("theme").textContent = `Theme: ${t}`; store.set("rr-theme", t); }

/* ================= beamdswitch deck ================= */
const deck = () => self.Beamdswitch.deck(RR.report(labState()));
function save(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

/* ================= wiring ================= */
$("nojs").hidden = true; $("app").hidden = false;
on("curve-pick", "click", sideClick); on("curve-params", "click", sideClick); on("div-controls", "click", sideClick); on("presets", "click", sideClick);
on("curve-params", "change", sideInput); on("curve-params", "input", (e) => { if (e.target.id === "hy-g" || e.target.id === "ab-g") { const o = e.target.previousElementSibling; if (o) o.textContent = e.target.value; } });
on("div-controls", "change", sideInput); on("div-controls", "input", (e) => { if (e.target.id === "pl-n" || e.target.id === "ab-deg") sideInput(e); });
on("layers", "click", (e) => { const b = e.target.closest && e.target.closest("button"); if (!b) return; const k = b.dataset.layer; if (k === "all") { const all = Object.values(ST.layers).every(Boolean); for (const x in ST.layers) ST.layers[x] = !all || x === "curve"; } else ST.layers[k] = !ST.layers[k]; update(); });
const geo = $("geo-svg"); geo.setAttribute("tabindex", "0");
geo.addEventListener("pointerdown", geoDown); geo.addEventListener("pointermove", geoMove); geo.addEventListener("pointerup", geoUp); geo.addEventListener("pointercancel", geoUp);
geo.addEventListener("wheel", geoWheel, { passive: false }); geo.addEventListener("keydown", geoKey);
on("sections", "click", (e) => { const b = e.target.closest && e.target.closest("button"); if (!b || b.dataset.fn === undefined) return; const i = Number(b.dataset.fn); ST.fnSel = ST.fnSel === i ? null : i; update(); });
on("rr", "click", (e) => { const b = e.target.closest && e.target.closest("button"); if (!b) return; const k = b.dataset.rr; ST.rrFocus = ST.rrFocus === k ? null : k; if (k === "ell") goTo("panel-sections"); if (k === "deg") goTo("panel-divisor"); update(); });
rotatable("map-svg", drawMap); rotatable("ver-svg", renderVeronese);
on("fn-controls", "input", (e) => { const id = e.target.id; if (!id) return; FN[id.slice(3)] = Number(e.target.value); const o = e.target.previousElementSibling; if (o) o.textContent = e.target.value; drawFn(); renderValuation(); });
on("fn-controls", "click", (e) => { const b = e.target.closest && e.target.closest("button"); if (!b || !b.dataset.fnex) return; Object.assign(FN, { 1: { a: 1, m: 1, b: 0, n: 0 }, 2: { a: 1, m: 1, b: -1, n: 1 }, 3: { a: 0, m: 2, b: 1, n: 3 } }[b.dataset.fnex]); renderFn(); renderValuation(); });
on("lo-m", "input", renderLocalOrder); on("el-d", "input", renderEligibility);
on("eq-d", "input", renderEquiv); on("eq-d2", "input", renderEquiv);
on("bal-g", "input", renderBalance); on("bal-d", "input", renderBalance);
on("gl-p", "input", renderGroupLaw); on("gl-q", "input", renderGroupLaw);
for (const id of ["br", "morph", "rh-n", "rh-g", "rh-e"]) on(id, "input", renderBranch);
on("ver-d", "input", renderVeronese); for (const id of ["st-n", "st-p", "st-q"]) on(id, "input", renderStages);
on("adj-d", "input", renderPlane); for (const id of ["ix-a", "ix-b", "ix-m", "ix-c"]) on(id, "input", renderIntersect);
on("cm-g", "click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b) { CM.g = Number(b.dataset.cmg); renderCanonical(); } });
on("cm-h", "click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && !b.disabled) { CM.h = b.dataset.cmh === "1"; renderCanonical(); } });
on("cp-go", "click", runCompute); on("cp-out", "click", (e) => { if (e.target.id === "cp-load") loadCompute(); });
for (const id of ["cp-curve", "cp-div"]) on(id, "keydown", (e) => { if (e.key === "Enter") runCompute(); });
on("sg-pick", "click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b) { SGi = Number(b.dataset.sg); renderSemigroup(); } });
for (const id of ["vv-0", "vv-1", "vv-i"]) on(id, "input", renderValuation);
on("cl-g", "input", renderClifford); on("cl-h", "change", renderClifford);
for (const id of ["jac-g", "jac-p"]) on(id, "input", renderJacobian); for (const id of ["sym-g", "sym-d"]) on(id, "input", renderSym);
const conceptGo = (e) => { const n = e.target.closest && e.target.closest("[data-go]"); if (n) goTo(n.getAttribute("data-go")); };
on("concept-svg", "click", conceptGo); on("concept-svg", "keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); conceptGo(e); } });
on("synth-play", "click", synthPlay); on("synth-step", "click", () => { synStep = (synStep + 1) % SYN.length; renderSynthText(); });
on("open-synthesis", "click", () => { goTo("m-concept"); synthPlay(); });
on("checklist", "click", (e) => { const b = e.target.closest && e.target.closest("button"); if (!b) return; const p = CHECK_PRESET[b.dataset.check]; if (p) loadPreset(p); else goTo("m-elliptic"); });
on("nt-div", "click", () => setNotation(false)); on("nt-lb", "click", () => setNotation(true));
on("theme", "click", () => { const cur = document.documentElement.getAttribute("data-theme") || "auto"; setTheme(THEMES[(THEMES.indexOf(cur) + 1) % 3]); });
on("open-palette", "click", openPal);
document.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); openPal(); } });
on("pal-q", "input", () => { palSel = 0; renderPal(); });
on("pal-q", "keydown", (e) => { const it = palItems(); if (e.key === "ArrowDown") { palSel = Math.min(it.length - 1, palSel + 1); renderPal(); e.preventDefault(); } else if (e.key === "ArrowUp") { palSel = Math.max(0, palSel - 1); renderPal(); e.preventDefault(); } else if (e.key === "Enter" && it[palSel]) { e.preventDefault(); runCmd(it[palSel][0]); } });
on("pal-list", "click", (e) => { const li = e.target.closest && e.target.closest("li"); if (li && li.dataset.cmd) runCmd(li.dataset.cmd); });
on("save-beamdswitch", "click", async () => {
  const status = $("deck-status"), text = deck(), name = "riemann-roch-beamdswitch.md";
  try { save(new Blob([text], { type: "text/markdown" }), name); status.textContent = `Saved ${name}: open it in beamdswitch.`; }
  catch { try { await navigator.clipboard.writeText(text); status.textContent = "Copied the beamdswitch deck, as saving is blocked here: paste it into beamdswitch."; } catch { status.textContent = "Could not save or copy the beamdswitch deck here."; } }
});
on("copy-beamdswitch", "click", async () => {
  const status = $("deck-status");
  try { await navigator.clipboard.writeText(deck()); status.textContent = "Copied the beamdswitch deck: paste it into beamdswitch."; }
  catch { status.textContent = "Could not copy the beamdswitch deck here: use the beamdswitch button to save it."; }
});
$("modnav").innerHTML = [["m-functions", "Functions"], ["m-pic", "Pic"], ["m-rr", "Riemann–Roch"], ["m-elliptic", "Elliptic"], ["m-hyper", "Hyperelliptic & RH"], ["m-linsys", "Linear systems"], ["m-plane", "Plane curves"], ["m-canonical", "Canonical maps"], ["m-compute", "Compute"], ["m-field", "Function field"], ["m-advanced", "Advanced"], ["m-concept", "Concept map"], ["m-check", "§65 checklist"], ["m-refs", "References"]].map(([id, t]) => `<a href="#${id}">${t}</a>`).join("");

/* ================= WebMCP: read-only tools for agents ================= */
const result = (v) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });
const ro = { readOnlyHint: true }, none = { type: "object", properties: {}, additionalProperties: false };
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === "basisF" || k === "D" ? undefined : x)));
const tools = [
  { name: "get_metadata", description: "Return what the Riemann–Roch laboratory supports: curve types, the symbolic cases, worked presets, the minimum computations and references.", inputSchema: none, annotations: ro,
    async execute() { return result({ title: document.title, url: "https://teoyujie.org/visuals/riemann-roch", curves: Object.keys(RR.CURVES), symbolic: ["P¹: any divisor", "Weierstrass elliptic curves: D = nO", "y² = f(x): D = n∞ or n(∞₊ + ∞₋)", "smooth plane curves: D = nH"], presets: RR.PRESETS.map((p) => ({ id: p.id, title: p.title })), references: RR.REFERENCES }); } },
  { name: "get_current_state", description: "Return the laboratory's current curve, divisor, degree, L(D) basis (when written), ℓ(D) (or its Riemann–Roch bounds), the Riemann–Roch terms and the map φ_D.", inputSchema: none, annotations: ro,
    async execute() { const a = plain(A); return result({ curve: labState().curve, divisor: a.divisor, degree: a.deg, genus: a.g, ell: a.ell, exact: a.exact, range: a.range ?? null, basis: a.basis ?? null, pole_orders: a.poles ?? null, riemann_roch: a.rr ?? null, canonical: { K: a.K, degree: a.degK }, map: a.map ?? null, note: a.basisNote ?? null }); } },
  { name: "compute_linear_system", description: "Compute L(D), ℓ(D) and the Riemann–Roch check symbolically for P1 or y^2 = f(x) (Weierstrass cubics included) and a divisor such as 3inf, 3O, K or (on P1) 2[0] + [1] - [inf]. Unsupported input is refused, never guessed. Does not change the page.", annotations: ro,
    inputSchema: { type: "object", properties: { curve: { type: "string", maxLength: 200 }, divisor: { type: "string", maxLength: 200 } }, required: ["curve", "divisor"], additionalProperties: false },
    async execute(i) { try { const r = RR.compute(String(i.curve || "").slice(0, 200), String(i.divisor || "").slice(0, 200)); return result({ ok: true, curve: r.curve.label, genus: r.g, divisor: r.divisor, degree: r.deg, basis: r.basis, pole_orders: r.poles ?? null, ell: r.ell, riemann_roch: r.rr.text, nonspecial: r.rr.nonspecial, note: r.note }); } catch (e) { return result({ ok: false, error: e.message }); } } },
  { name: "apply_riemann_hurwitz", description: "Apply Riemann–Hurwitz 2g_C − 2 = n(2g_D − 2) + Σ(e_P − 1) to a cover of degree n of a genus-g_D curve with the given ramification indices. Does not change the page.", annotations: ro,
    inputSchema: { type: "object", properties: { degree: { type: "integer", minimum: 1, maximum: 50 }, target_genus: { type: "integer", minimum: 0, maximum: 50 }, ramification: { type: "array", items: { type: "integer", minimum: 1 }, maxItems: 200 } }, required: ["degree"], additionalProperties: false },
    async execute(i) { return result(RR.riemannHurwitz({ degree: i.degree, gTarget: i.target_genus || 0, ramification: i.ramification || [] })); } },
  { name: "run_minimum_computations", description: "Run the page's required computations (L(d∞) on P¹, ℓ(D) = deg D on E, |2O|, |3O|, the recovered cubic, hyperelliptic genus, plane-curve genus, the genus-2 canonical map, the plane quartic, E ≅ Pic⁰E) and report each result.", inputSchema: none, annotations: ro,
    async execute() { return result(RR.minimumComputations()); } },
];
self.RiemannRochTools = tools;
self.RiemannRochPage = { state: ST, labState, loadPreset, setCurve, deck, analysis: () => A };
const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
if (mc && typeof mc.registerTool === "function") for (const t of tools) mc.registerTool(t);

/* ================= boot ================= */
setNotation(store.get("rr-notation") === "bundle");
setTheme(THEMES.includes(store.get("rr-theme")) ? store.get("rr-theme") : "auto");
renderSide(); update();
renderFn(); renderLocalOrder(); renderEquiv(); renderBalance(); renderBranch(); renderVeronese(); renderPlane(); renderCanonical(); runCompute(); renderSemigroup(); renderValuation(); renderClifford(); renderJacobian(); renderSym(); renderConcept(); renderChecklist();
})();
