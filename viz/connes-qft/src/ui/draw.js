/* SVG drawing vocabulary shared by every scene. Everything returns markup strings. */
const r1 = (x) => Math.round(x * 10) / 10;
function svg(w, h, body, label = "", extra = "") {
  // small figures are not blown up past about 1.8 times their drawn size
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet" style="max-width:${Math.round(Math.max(1.8 * w, 360))}px" ${extra}>${body}</svg>`;
}
const ln = (x1, y1, x2, y2, cls = "axis", extra = "") => `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" class="${cls}" ${extra}/>`;
const txt = (x, y, s, cls = "lbl", extra = "") => `<text x="${r1(x)}" y="${r1(y)}" class="${cls}" ${extra}>${supify(s, "svg")}</text>`;
const circ = (x, y, r, cls = "", extra = "") => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" class="${cls}" ${!cls && !/\bfill=|style="fill/.test(extra) ? 'fill="none" ' : ""}${extra}/>`;
const rect = (x, y, w, h, cls = "", extra = "") => `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(Math.max(0, w))}" height="${r1(Math.max(0, h))}" class="${cls}" ${!cls && !/\bfill=|style="fill/.test(extra) ? 'fill="none" ' : ""}${extra}/>`;
const pathD = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${r1(p[0])} ${r1(p[1])}`).join("");
const path = (d, cls = "", extra = "") => `<path d="${d}" class="${cls}" ${extra}/>`;
const poly = (pts, cls = "", extra = "") => `<polygon points="${pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join(" ")}" class="${cls}" ${extra}/>`;
function arrowHead(x, y, ang, size = 6, cls = "arrowh", extra = "") {
  const a = [x + size * Math.cos(ang), y + size * Math.sin(ang)];
  const b = [x + (size * 0.8) * Math.cos(ang + 2.5), y + (size * 0.8) * Math.sin(ang + 2.5)];
  const c = [x + (size * 0.8) * Math.cos(ang - 2.5), y + (size * 0.8) * Math.sin(ang - 2.5)];
  return poly([a, b, c], cls, extra);
}
/* An arrow line (for vectors and maps). */
function arrow(x1, y1, x2, y2, cls = "axis", extra = "", size = 5) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const fillCls = cls.split(" ").map((c) => (["qft", "ck", "ncg", "aqft"].includes(c) ? `f${c}` : c === "bad" ? "fbad" : c === "ok" ? "fok" : "")).join(" ") || "vtx";
  return ln(x1, y1, x2 - size * 0.6 * Math.cos(ang), y2 - size * 0.6 * Math.sin(ang), cls, extra) + arrowHead(x2 - size * Math.cos(ang), y2 - size * Math.sin(ang), ang, size, fillCls);
}
/* Quadratic curve from a to b whose apex sits `bend` units to the left of the direction a → b. */
function curve(a, b, bend = 0) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L; // with y down, a negative bend bows a left-to-right line upward
  const c = [mx + 2 * bend * nx, my + 2 * bend * ny];
  const at = (t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  const tan = (t) => [2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1])];
  return { c, at, tan, d: `M${r1(a[0])} ${r1(a[1])}Q${r1(c[0])} ${r1(c[1])} ${r1(b[0])} ${r1(b[1])}` };
}
/* A photon: a sine wiggle along the curve. */
function wavy(a, b, bend = 0, amp = 3.2, wl = 9) {
  const cv = curve(a, b, bend);
  const N = 80;
  let len = 0, prev = cv.at(0);
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = cv.at(t), tg = cv.tan(t), tl = Math.hypot(tg[0], tg[1]) || 1;
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
    const off = amp * Math.sin((2 * PI * len) / wl) * Math.min(1, i / 6, (N - i) / 6);
    pts.push([p[0] - (tg[1] / tl) * off, p[1] + (tg[0] / tl) * off]);
  }
  return pathD(pts);
}

/* ---------- Feynman graphs ---------- */
/* Draw graph g (layout in a 200 × 120 box) into a box [x, y, w, h]. Options:
     edgeCls(e) extra classes, link(e) data-link key, act: data-act for clicking an edge (data-arg = edge id),
     labels { edgeId: text }, boxes [{ vertices, edges, cls, label, depth }], hideExt, faded Set of edge ids,
     arrows (true), vertexAct, momenta { edgeId: text }. */
function feynman(g, box = [0, 0, 200, 120], o = {}) {
  const [bx, by, bw, bh] = box;
  let gx0 = 0, gy0 = 0, gw = 200, gh = 120;
  if (o.fit !== false && g.vertices.length) {
    // fit the drawing to its own extent: vertices plus the apex of every bent line
    const Vm = new Map(g.vertices.map((v) => [v.id, v]));
    const pts = g.vertices.map((v) => [v.x, v.y]);
    for (const e of g.edges) if (e.bend && Vm.has(e.a) && Vm.has(e.b)) pts.push(curve([Vm.get(e.a).x, Vm.get(e.a).y], [Vm.get(e.b).x, Vm.get(e.b).y], e.bend).at(0.5));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), pad = 8;
    gx0 = Math.min(...xs) - pad; gy0 = Math.min(...ys) - pad; gw = Math.max(40, Math.max(...xs) - Math.min(...xs) + 2 * pad); gh = Math.max(24, Math.max(...ys) - Math.min(...ys) + 2 * pad);
  }
  const s = Math.min(bw / gw, bh / gh, o.maxScale || 3);
  const ox = bx + (bw - gw * s) / 2 - gx0 * s, oy = by + (bh - gh * s) / 2 - gy0 * s;
  const P = (v) => [ox + v.x * s, oy + v.y * s];
  const V = new Map(g.vertices.map((v) => [v.id, v]));
  let out = "";
  // subgraph boxes first (behind)
  for (const bxs of o.boxes || []) {
    const pts = [];
    for (const vid of bxs.vertices) if (V.has(vid)) pts.push(P(V.get(vid)));
    for (const eid of bxs.edges || []) {
      const e = g.edges.find((q) => q.id === eid);
      if (e && e.bend) { const cv = curve(P(V.get(e.a)), P(V.get(e.b)), e.bend * s); pts.push(cv.at(0.5)); }
    }
    if (!pts.length) continue;
    const pad = (9 + 7 * (bxs.depth || 0)) * Math.max(0.7, s);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad;
    out += `<rect x="${r1(x0)}" y="${r1(y0)}" width="${r1(x1 - x0)}" height="${r1(y1 - y0)}" rx="6" class="sub ${bxs.cls || ""}" ${bxs.link ? `data-link="${bxs.link}"` : ""} ${bxs.act ? `data-act="${bxs.act}" data-arg="${esc(bxs.arg ?? "")}"` : ""}/>`;
    if (bxs.label) out += txt(x0 + 3, y0 - 3, esc(bxs.label), "xs mono ink2");
  }
  const glow = o.glow ? new Set(o.glow) : null;
  if (glow) for (const e of g.edges) if (glow.has(e.id)) out += path(curve(P(V.get(e.a)), P(V.get(e.b)), (e.bend || 0) * s).d, "loopk", o.glowLink ? `data-link="${o.glowLink}"` : "");
  for (const e of g.edges) {
    const a = P(V.get(e.a)), b = P(V.get(e.b));
    const bend = (e.bend || 0) * s;
    const faded = o.faded && o.faded.has(e.id);
    const extra = `${o.link ? `data-link="${esc(o.link(e) || "")}"` : ""} ${faded ? 'opacity="0.18"' : ""}`;
    const cls = o.edgeCls ? o.edgeCls(e) : "";
    if (e.type === "g") out += path(wavy(a, b, bend, 3.2 * Math.max(0.6, s), 9 * Math.max(0.6, s)), `photon ${cls}`, extra);
    else {
      const cv = curve(a, b, bend);
      const mu = e.flavor === "mu";
      out += path(cv.d, `${mu ? "fermion-mu" : "fermion"} ${cls}`, extra);
      if (o.arrows !== false) {
        const m = cv.at(0.5), tg = cv.tan(0.5);
        out += arrowHead(m[0] - 3 * Math.cos(Math.atan2(tg[1], tg[0])), m[1] - 3 * Math.sin(Math.atan2(tg[1], tg[0])), Math.atan2(tg[1], tg[0]), 5.5 * Math.max(0.7, s), mu ? "arrowh-mu" : "arrowh", faded ? 'opacity="0.18"' : "");
      }
    }
    if (o.labels && o.labels[e.id]) {
      const cv = curve(a, b, bend), m = cv.at(0.5), tg = cv.tan(0.5), tl = Math.hypot(tg[0], tg[1]) || 1;
      const side = e.labelSide || 1;
      out += txt(m[0] + (tg[1] / tl) * 11 * side, m[1] - (tg[0] / tl) * 11 * side + 3, o.labels[e.id], "sm serif", `text-anchor="middle" ${o.link ? `data-link="${esc(o.link(e) || "")}"` : ""}`);
    }
    // hit area
    if (o.act || o.link) {
      const cv = curve(a, b, bend);
      out += path(cv.d, "hit", `stroke-width="10" ${o.act ? `data-act="${o.act}" data-arg="${e.id}"` : ""} ${o.link ? `data-link="${esc(o.link(e) || "")}"` : ""} data-tip="${esc(o.tip ? o.tip(e) : e.type === "g" ? "photon line" : "fermion line")}"`);
    }
  }
  for (const v of g.vertices) {
    const [x, y] = P(v);
    const vl = o.vlink ? `data-link="${esc(o.vlink(v) || "")}"` : "";
    if (v.kind === "v") out += circ(x, y, 3.2 * Math.max(0.75, s), "vtx", `${vl} ${o.vertexAct ? `data-act="${o.vertexAct}" data-arg="${v.id}"` : ""} ${o.vtip ? `data-tip="${esc(o.vtip(v))}"` : ""}`);
    else if (v.kind === "ct") out += circ(x, y, 5, "ct", vl) + ln(x - 3.4, y - 3.4, x + 3.4, y + 3.4, "fermion", 'stroke-width="1.2"') + ln(x - 3.4, y + 3.4, x + 3.4, y - 3.4, "fermion", 'stroke-width="1.2"');
    else if (!o.hideExt) out += circ(x, y, 1.8, "ext");
    if (o.vlabels && o.vlabels[v.id]) out += txt(x, y - 7, o.vlabels[v.id], "xs mono ink2", 'text-anchor="middle"');
  }
  return out;
}

/* ---------- charts ---------- */
function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * step; v += step) out.push(Math.abs(v) < 1e-12 * step ? 0 : v);
  return out;
}
/* Line chart. series: [{ pts: [[x, y]], cls: "qft"|"ck"|…, label, dash, width, area, tip(x, y) }]. */
function lineChart(o) {
  const W = o.W || 400, H = o.H || 230, m = { l: o.ml ?? (o.ylabel ? 52 : 46), r: o.mr ?? 14, t: o.mt ?? 14, b: o.mb ?? 34 };
  const [x0, x1] = o.xr, [y0, y1] = o.yr;
  const X = (x) => m.l + ((x - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const Y = (y) => H - m.b - ((y - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  let s = "";
  const xt = o.xticks || niceTicks(x0, x1, 5), yt = o.yticks || niceTicks(y0, y1, 4);
  for (const v of yt) s += ln(m.l, Y(v), W - m.r, Y(v), "grid") + txt(m.l - 5, Y(v) + 3, esc(o.yfmt ? o.yfmt(v) : fmt(v, 3)), "xs mut", 'text-anchor="end"');
  for (const v of xt) s += ln(X(v), H - m.b, X(v), H - m.b + 3, "axis") + txt(X(v), H - m.b + 13, esc(o.xfmt ? o.xfmt(v) : fmt(v, 3)), "xs mut", 'text-anchor="middle"');
  s += ln(m.l, H - m.b, W - m.r, H - m.b, "axis") + ln(m.l, m.t, m.l, H - m.b, "axis");
  if (o.xlabel) s += txt((m.l + W - m.r) / 2, H - 4, o.xlabel, "sm ink2", 'text-anchor="middle"');
  if (o.ylabel) s += txt(11, (m.t + H - m.b) / 2, o.ylabel, "sm ink2", `text-anchor="middle" transform="rotate(-90 11 ${r1((m.t + H - m.b) / 2)})"`);
  for (const b of o.bands || []) s += rect(X(b.x0), m.t, X(b.x1) - X(b.x0), H - m.t - m.b, b.cls || "bgck", b.link ? `data-link="${b.link}"` : "") + (b.label ? txt(X(b.x0) + 3, m.t + 10, esc(b.label), "xs ink2") : "");
  for (const h of o.hlines || []) s += ln(m.l, Y(h.y), W - m.r, Y(h.y), h.cls || "axis", `stroke-dasharray="4 3"`) + (h.label ? txt(W - m.r - 2, Y(h.y) - 3, esc(h.label), "xs ink2", 'text-anchor="end"') : "");
  for (const v of o.vlines || []) s += ln(X(v.x), m.t, X(v.x), H - m.b, v.cls || "axis", `stroke-dasharray="4 3" ${v.link ? `data-link="${v.link}"` : ""}`) + (v.label ? txt(X(v.x) + 3, m.t + 9, esc(v.label), "xs ink2") : "");
  const clipY = (y) => Math.max(m.t - 4, Math.min(H - m.b + 4, y));
  for (const se of o.series) {
    const pts = se.pts.filter((p) => Number.isFinite(p[1]) && Number.isFinite(p[0])).map(([x, y]) => [X(x), clipY(Y(y))]);
    if (!pts.length) continue;
    if (se.area) s += path(`${pathD(pts)}L${r1(pts[pts.length - 1][0])} ${r1(Y(Math.max(y0, 0)))}L${r1(pts[0][0])} ${r1(Y(Math.max(y0, 0)))}Z`, `bg${se.cls}`, 'stroke="none"');
    s += path(pathD(pts), `${se.cls}`, `fill="none" stroke-width="${se.width || 2}" stroke-linejoin="round" stroke-linecap="round" ${se.dash ? `stroke-dasharray="${se.dash}"` : ""} ${se.link ? `data-link="${se.link}"` : ""}`);
    // hover layer: invisible hit circles on a subsample of points
    const every = Math.max(1, Math.floor(se.pts.length / 40));
    se.pts.forEach(([x, y], i) => {
      if (i % every || !Number.isFinite(y)) return;
      const tip = se.tip ? se.tip(x, y) : `${se.label ? `${se.label}: ` : ""}${fmt(y, 4)} at ${fmt(x, 4)}`;
      s += circ(X(x), clipY(Y(y)), 6, "hit", `data-tip="${esc(tip)}"`);
    });
  }
  for (const p of o.points || []) s += circ(X(p.x), clipY(Y(p.y)), p.r || 4, p.cls || "fqft", `stroke="var(--panel)" stroke-width="2" ${p.tip ? `data-tip="${esc(p.tip)}"` : ""} ${p.link ? `data-link="${p.link}"` : ""} ${p.drag ? `data-drag="${p.drag}"` : ""}`) + (p.label ? txt(X(p.x) + 6, clipY(Y(p.y)) - 6, esc(p.label), "xs ink2") : "");
  // legend (two or more series)
  const named = o.series.filter((se) => se.label && !se.nolegend);
  if (named.length >= 2 && o.legend !== false) {
    let lx = m.l + 6, ly = m.t + 4;
    named.forEach((se) => {
      const w = 26 + 5.2 * se.label.length;
      if (lx + w > W - m.r && lx > m.l + 6) { lx = m.l + 6; ly += 12; }
      s += ln(lx, ly, lx + 14, ly, se.cls, `stroke-width="2" ${se.dash ? `stroke-dasharray="${se.dash}"` : ""}`) + txt(lx + 18, ly + 3, esc(se.label), "xs ink2");
      lx += w;
    });
  }
  return svg(W, H, s, o.label || "chart");
}
/* Vertical bar chart: items [{ label, value, cls, tip, link }]. */
function barChart(o) {
  const W = o.W || 400, H = o.H || 200, m = { l: o.ml ?? (o.ylabel ? 50 : 42), r: 10, t: 14, b: o.mb ?? 30 };
  const vals = o.items.map((i) => i.value);
  const lo = Math.min(0, ...vals), hi = Math.max(o.yMax ?? -Infinity, ...vals, 1e-300);
  const Y = (y) => H - m.b - ((y - lo) / (hi - lo || 1)) * (H - m.t - m.b);
  const n = o.items.length, slot = (W - m.l - m.r) / n, bw = Math.min(24, slot * 0.7);
  let s = "";
  for (const v of niceTicks(lo, hi, 4)) s += ln(m.l, Y(v), W - m.r, Y(v), "grid") + txt(m.l - 5, Y(v) + 3, esc(o.yfmt ? o.yfmt(v) : fmt(v, 3)), "xs mut", 'text-anchor="end"');
  o.items.forEach((it, i) => {
    const x = m.l + slot * i + (slot - bw) / 2, y = Y(Math.max(0, it.value)), h = Math.abs(Y(it.value) - Y(0));
    s += `<rect x="${r1(x)}" y="${r1(it.value >= 0 ? y : Y(0))}" width="${r1(bw)}" height="${r1(Math.max(0.5, h))}" rx="2" class="f${it.cls || "qft"}" ${it.tip ? `data-tip="${esc(it.tip)}"` : ""} ${it.link ? `data-link="${it.link}"` : ""} ${it.act ? `data-act="${it.act}" data-arg="${esc(it.arg ?? "")}"` : ""}/>`;
    if (o.showValues) s += txt(x + bw / 2, (it.value >= 0 ? y : Y(it.value) + 10) - 3, esc(o.vfmt ? o.vfmt(it.value) : fmt(it.value, 3)), "xs ink2", 'text-anchor="middle"');
    s += txt(x + bw / 2, H - m.b + 12, esc(it.label), "xs mut", 'text-anchor="middle"');
  });
  s += ln(m.l, Y(0), W - m.r, Y(0), "axis");
  if (o.ylabel) s += txt(10, (m.t + H - m.b) / 2, o.ylabel, "sm ink2", `text-anchor="middle" transform="rotate(-90 10 ${r1((m.t + H - m.b) / 2)})"`);
  if (o.xlabel) s += txt((m.l + W - m.r) / 2, H - 4, o.xlabel, "sm ink2", 'text-anchor="middle"');
  return svg(W, H, s, o.label || "bar chart");
}
/* Heatmap of a complex or real matrix: |entry| as opacity of the given colour class. */
function heatmap(M, o = {}) {
  const n = M.length, m = M[0].length, size = o.size || Math.min(18, 200 / Math.max(n, m));
  const x0 = o.x || 0, y0 = o.y || 0;
  const mag = (v) => (Array.isArray(v) ? Math.hypot(v[0], v[1]) : Math.abs(v));
  let mx = 1e-300;
  M.forEach((row) => row.forEach((v) => { mx = Math.max(mx, mag(v)); }));
  let s = "";
  M.forEach((row, i) => row.forEach((v, j) => {
    const a = mag(v) / mx;
    const label = Array.isArray(v) ? `${fmt(v[0], 3)}${v[1] >= 0 ? " + " : " − "}${fmt(Math.abs(v[1]), 3)}i` : fmt(v, 3);
 const fill = o.phase && Array.isArray(v) && a > 1e-9 ? `style="fill:${phaseColor(Math.atan2(v[1], v[0]))}"` : `class="f${o.cls || "ncg"}"`;
    s += `<rect x="${r1(x0 + j * size)}" y="${r1(y0 + i * size)}" width="${r1(size - 1)}" height="${r1(size - 1)}" ${fill} fill-opacity="${a < 1e-9 ? 0.04 : (0.12 + 0.88 * a).toFixed(3)}" data-tip="${esc(`${o.name || "M"}[${i + 1},${j + 1}] = ${label}`)}" ${o.link ? `data-link="${o.link(i, j) || ""}"` : ""}/>`;
  }));
  if (o.title) s += txt(x0, y0 - 4, esc(o.title), "xs mono ink2");
  return s;
}
/* Laurent coefficients as vertical layers around ε = 0. */
function laurentLayers(series, o = {}) {
  const x0 = o.x || 0, y0 = o.y || 0, w = o.w || 300, h = o.h || 150;
  const lo = Math.min(series.lo, -1), hi = Math.max(1, Math.min(3, LS.top(series)));
  const ks = [];
  for (let k = lo; k <= hi; k++) ks.push(k);
  const vals = ks.map((k) => LS.coef(series, k));
  const mx = Math.max(1e-300, ...vals.map(Math.abs));
  const slot = w / ks.length, mid = y0 + h / 2;
  let s = ln(x0, mid, x0 + w, mid, "axis");
  ks.forEach((k, i) => {
    const v = vals[i], bh = (Math.abs(v) / mx) * (h / 2 - 14);
    const cls = k < 0 ? "ck" : k === 0 ? "qft" : "aqft";
    const part = k < 0 ? "POLE PART" : k === 0 ? "FINITE PART" : "VANISHING PART";
    const x = x0 + slot * i + slot * 0.2, bw = slot * 0.6;
    const faded = o.split && k > 0 ? 'opacity="0.45"' : "";
    s += `<rect x="${r1(x)}" y="${r1(v >= 0 ? mid - bh : mid)}" width="${r1(bw)}" height="${r1(Math.max(0.6, bh))}" rx="2" class="f${cls}" ${faded} data-link="laurent-${k < 0 ? "pole" : k === 0 ? "finite" : "vanish"}" data-tip="${esc(`${part}: coefficient of ε^${k} = ${fmt(v, 5)}`)}"/>`;
    s += txt(x + bw / 2, y0 + h - 2, k === 0 ? "ε⁰" : `ε${Q.sup(k)}`, "xs mono ink2", 'text-anchor="middle"');
  });
  // the ε = 0 divider
  const zi = ks.indexOf(0);
  s += ln(x0 + slot * zi, y0 + 4, x0 + slot * zi, y0 + h - 12, "ck", 'stroke-dasharray="3 3"') + txt(x0 + slot * zi - 3, y0 + 10, "pole | regular", "xs ink2", 'text-anchor="middle"');
  return s;
}
/* Eigenvalues on a line with weights f(λ/Λ) as stems. */
function spectrumStrip(eigs, o = {}) {
  const x0 = o.x || 0, y0 = o.y || 0, w = o.w || 360, h = o.h || 80;
  const lim = o.lim || Math.max(1e-9, ...eigs.map(Math.abs)) * 1.08;
  const X = (l) => x0 + w / 2 + (l / lim) * (w / 2);
  let s = ln(x0, y0 + h, x0 + w, y0 + h, "axis") + ln(X(0), y0 + h - 4, X(0), y0 + h + 4, "axis") + txt(X(0), y0 + h + 13, "0", "xs mut", 'text-anchor="middle"');
  eigs.forEach((l, i) => {
    const wgt = o.weights ? o.weights[i] : 1;
    s += ln(X(l), y0 + h, X(l), y0 + h - wgt * (h - 6), o.cls || "ncg", `stroke-width="2.4" data-tip="${esc(`λ = ${fmt(l, 4)}${o.weights ? `, f(λ/Λ) = ${fmt(wgt, 3)}` : ""}`)}"`) + circ(X(l), y0 + h - wgt * (h - 6), 2.4, `f${o.cls || "ncg"}`);
  });
  if (o.Lambda) for (const sg of [-1, 1]) s += ln(X(sg * o.Lambda), y0, X(sg * o.Lambda), y0 + h, "ck", 'stroke-dasharray="3 3"') + txt(X(sg * o.Lambda), y0 - 2, sg > 0 ? "+Λ" : "−Λ", "xs ink2", 'text-anchor="middle"');
  return s;
}
/* Minkowski diagram in a box: t up, x right, units → pixels by `scale`. */
function minkowski(o = {}) {
  const W = o.W || 400, H = o.H || 250, cx = o.cx ?? W / 2, cy = o.cy ?? H / 2 + 10, sc = o.scale || 40;
  const P = (t, x) => [cx + x * sc, cy - t * sc];
  let s = "";
  const euclid = o.mode === "euclid";
  s += arrow(10, cy, W - 10, cy, "axis") + txt(W - 14, cy - 5, "x", "sm serif", 'text-anchor="end"');
  s += arrow(cx, H - 6, cx, 8, "axis") + txt(cx + 6, 16, euclid ? "τ" : "t", "sm serif");
  if (!euclid && o.cone !== false) {
    const c = o.cone || { t: 0, x: 0 }, [px, py] = P(c.t, c.x), L = Math.max(W, H);
    s += poly([[px, py], [px - L, py - L], [px + L, py - L]], "cone", 'opacity="0.55" data-link="lightcone"') + poly([[px, py], [px - L, py + L], [px + L, py + L]], "cone", 'opacity="0.55" data-link="lightcone"');
    s += ln(px - L, py + L, px + L, py - L, "qft", 'stroke-dasharray="5 4"') + ln(px - L, py - L, px + L, py + L, "qft", 'stroke-dasharray="5 4"');
  }
  if (euclid) for (let r = 1; r <= 4; r++) s += circ(cx, cy, r * sc, "", 'fill="none" stroke="var(--rule)"');
  return { s, P, W, H, sc, cx, cy };
}
/* Riemann sphere with the contour around ε = 0. */
function riemannSphere(o = {}) {
  const cx = o.cx || 110, cy = o.cy || 110, R = o.R || 80;
  let s = circ(cx, cy, R, "", 'fill="var(--soft)" stroke="var(--axis)"');
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${R}" ry="${R * 0.28}" fill="none" stroke="var(--axis)" stroke-dasharray="3 3"/>`;
  // ε = 0 at the south pole region (front), ∞ at the north pole
  const south = [cx, cy + R * 0.62], north = [cx, cy - R * 0.92];
  const cr = (o.contour || 0.35) * R;
  s += `<ellipse cx="${south[0]}" cy="${south[1]}" rx="${r1(cr)}" ry="${r1(cr * 0.34)}" class="bgqft" stroke="var(--qft)" stroke-width="1.6" data-link="contour"/>`;
  s += circ(south[0], south[1], 3, "fck", 'data-link="eps0"') + txt(south[0] + 6, south[1] + 4, "ε = 0", "xs mono ink2");
  s += circ(north[0], north[1], 3, "faqft") + txt(north[0] + 6, north[1] + 3, "ε = ∞", "xs mono ink2");
  s += txt(cx - R + 4, cy - R * 0.55, "C₋ (outside): γ₋ holomorphic, γ₋(∞) = 1", "xs ink2", 'data-link="gminus"');
  s += txt(south[0] - cr - 2, south[1] + cr * 0.34 + 13, "C₊ (inside): γ₊ holomorphic", "xs ink2", 'data-link="gplus"');
  return { s, south, cr };
}
