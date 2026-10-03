/* The page: drawings, the laboratory, the shell and the WebMCP tools. Every number shown comes from
   self.Etale; this script only draws it. Parts are concatenated in file-name order by build.mjs. */
(function () {
"use strict";
const E = self.Etale, BD = self.Beamdswitch;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const store = {
  get(k) { try { return localStorage.getItem(`etale:${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`etale:${k}`, v); } catch { /* storage blocked */ } },
};
const n1 = (x) => (Math.round(x * 10) / 10).toString();
const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
let uid = 0;
const nextId = (p) => `${p}${++uid}`;

/* ---------- SVG primitives ---------- */
const svg = (w, h, body, label, extra = "") => `<svg class="fig" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" ${extra}><title>${esc(label)}</title>${body}</svg>`;
const txt = (x, y, s, cls = "sv-label", extra = "") => `<text x="${n1(x)}" y="${n1(y)}" class="${cls}" ${extra}>${esc(s)}</text>`;
const ptsAttr = (pts) => pts.map((p) => `${n1(p[0])},${n1(p[1])}`).join(" ");
const pline = (pts, cls, extra = "") => (pts.length > 1 ? `<polyline points="${ptsAttr(pts)}" class="${cls}" ${extra}/>` : "");
const pgon = (pts, cls, extra = "") => `<polygon points="${ptsAttr(pts)}" class="${cls}" ${extra}/>`;
const circ = (x, y, r, cls, extra = "") => `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" class="${cls}" ${extra}/>`;
const ell = (x, y, rx, ry, cls, extra = "") => `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(rx)}" ry="${n1(ry)}" class="${cls}" ${extra}/>`;
const line = (a, b, cls, extra = "") => `<line x1="${n1(a[0])}" y1="${n1(a[1])}" x2="${n1(b[0])}" y2="${n1(b[1])}" class="${cls}" ${extra}/>`;
const pathD = (d, cls, extra = "") => `<path d="${d}" class="${cls}" ${extra}/>`;
/* A filled arrowhead at p pointing along angle a. */
function arrowHead(p, a, col = "var(--fg)", size = 7) {
  const l = [p[0] - size * Math.cos(a - 0.45), p[1] - size * Math.sin(a - 0.45)], r = [p[0] - size * Math.cos(a + 0.45), p[1] - size * Math.sin(a + 0.45)];
  return pgon([p, l, r], "", `style="fill:${col}"`);
}
/* An arrowhead placed at fraction f along a polyline. */
function arrowOn(pts, f, col, size = 7) {
  if (pts.length < 3) return "";
  const k = clamp(Math.floor(f * (pts.length - 1)), 1, pts.length - 1), a = pts[k - 1], b = pts[k];
  return arrowHead(b, Math.atan2(b[1] - a[1], b[0] - a[0]), col, size);
}
const sheetCls = (i) => `sheet-${(i % 8) + 1}`;
const sheetVar = (i) => `var(--s${(i % 8) + 1})`;
const loopVar = (cls) => (cls === "loop-a" ? "var(--ga)" : cls === "loop-b" ? "var(--gb)" : "var(--gc)");
const badge = (kind) => {
  const t = { literal: "Literal ℂ picture", schematic: "Algebraic schematic", analogy: "Topological model (analogy)" }[kind];
  return `<span class="badge ${kind}">${t}</span>`;
};

const curveName = (a, b) => `y² = x³${a ? ` ${a < 0 ? "−" : "+"} ${Math.abs(a) === 1 ? "" : Math.abs(a)}x` : ""}${b ? ` ${b < 0 ? "−" : "+"} ${Math.abs(b)}` : ""}`;

/* ---------- 3D: orthographic camera with elevation e (radians) and azimuth az ----------
   World z is up; the viewer looks along +y, tilted down by e. depth > 0 faces the viewer. */
function cam(cx, cy, s, e = 0.35, az = 0) {
  const ce = Math.cos(e), se = Math.sin(e), ca = Math.cos(az), sa = Math.sin(az);
  return {
    cx, cy, s, e,
    p(P) { const X = P[0] * ca - P[1] * sa, Y = P[0] * sa + P[1] * ca, Z = P[2]; return [cx + s * X, cy - s * (Y * se + Z * ce)]; },
    depth(P) { const Y = P[0] * sa + P[1] * ca; return -Y * ce + P[2] * se; },
    view() { return [sa * ce, -ca * ce, se]; }, // unit vector toward the viewer, in world coordinates
  };
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm3 = (a) => sc3(a, 1 / Math.hypot(a[0], a[1], a[2]));
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/* Split a 3D polyline into runs that face the viewer (vis(P) true) or not; draw front solid, back dashed. */
function visRuns(P3, vis) {
  const runs = []; let cur = null;
  for (const P of P3) {
    const v = vis(P);
    if (!cur || cur.front !== v) { const last = cur && cur.pts[cur.pts.length - 1]; cur = { front: v, pts: last ? [last] : [] }; runs.push(cur); }
    cur.pts.push(P);
  }
  return runs;
}
function draw3(P3, c, vis, frontCls, backCls, extra = "") {
  return visRuns(P3, vis).map((r) => pline(r.pts.map((P) => c.p(P)), r.front ? frontCls : backCls, extra)).join("");
}
/* Sphere point from longitude and latitude (degrees); lon 0 faces the viewer, lat 90 is the north pole. */
const sph = (lon, lat) => { const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180; return [Math.cos(b) * Math.sin(a), -Math.cos(b) * Math.cos(a), Math.sin(b)]; };
/* A circle of angular radius beta (radians) on the unit sphere round the unit vector P. */
function sphereCircle(P, beta, n = 48) {
  const helper = Math.abs(P[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = norm3(cross3(P, helper)), v = cross3(P, u);
  return Array.from({ length: n + 1 }, (_, k) => { const t = (TAU * k) / n; return add3(sc3(P, Math.cos(beta)), add3(sc3(u, Math.sin(beta) * Math.cos(t)), sc3(v, Math.sin(beta) * Math.sin(t)))); });
}

/* ---------- shared animation clock ---------- */
const anims = new Map();
let rafOn = false;
function tick(now) {
  rafOn = false;
  for (const [k, a] of anims) {
    const t = clamp((now - a.t0) / a.dur, 0, 1);
    a.step(a.from + (a.to - a.from) * (a.ease ? ease(t) : t));
    if (t >= 1) { anims.delete(k); a.done && a.done(); }
  }
  if (anims.size) { rafOn = true; requestAnimationFrame(tick); }
}
/* Animate a value from..to over dur ms; under reduced motion jump straight to the end. */
function animate(key, from, to, dur, step, done, easeIt = false) {
  anims.delete(key);
  if (reducedMotion() || typeof requestAnimationFrame !== "function") { step(to); done && done(); return; }
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  anims.set(key, { from, to, dur, step, done, t0, ease: easeIt });
  if (!rafOn) { rafOn = true; requestAnimationFrame(tick); }
}
const stopAnim = (key) => anims.delete(key);
