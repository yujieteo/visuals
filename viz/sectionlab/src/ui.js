/* Sectionlab page: editor, panels, results, exports and WebMCP tools.
 * Everything edits one model (the parts list); the engine recomputes from it. */
(() => {
"use strict";
const L = SectionLab;
const G = L.geometry, SHAPES = L.shapes.SHAPES, R = L.report;
const $ = (id) => document.getElementById(id);
const SVGNS = "http://www.w3.org/2000/svg";
const clone = (x) => JSON.parse(JSON.stringify(x));
const fmt = R.fmt;

/* ---------- state ---------- */
let draft = null;        // the model being edited (may be invalid while typing)
let sel = null;          // selected part id
let corner = null;       // selected corner index of the selected part
let result = null;       // last successful elastic result
let failure = null;      // last ModelError
let plasticResult = null, plasticStale = true, plasticTimer = 0;
let view = { s: 1, ox: 0, oy: 0, W: 600, H: 420 };
let drag = null;         // active pointer gesture on the canvas
let guides = [];         // snap guides to draw
const past = [], future = [];
let editing = false;     // a field has been changed during its current focus

/* ---------- helpers ---------- */
function el(tag, attrs = {}, parent, ns = SVGNS) {
  const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  if (parent) parent.appendChild(e);
  return e;
}
const h = (tag, attrs, parent) => el(tag, attrs, parent, null);
const partIndex = (id) => draft.parts.findIndex((p) => p.id === id);
const selPart = () => (sel === null ? null : draft.parts.find((p) => p.id === sel) || null);
const matIndex = (id) => Math.max(0, draft.materials.findIndex((m) => m.id === id));

function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[/^\d+$/.test(k) ? +k : k]), obj); }
function setPath(obj, path, value) {
  const ks = path.split(".");
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[/^\d+$/.test(ks[i]) ? +ks[i] : ks[i]];
  o[/^\d+$/.test(ks.at(-1)) ? +ks.at(-1) : ks.at(-1)] = value;
}
const errPath = (p) => (p || "").replace(/\[(\d+)\]/g, ".$1");
const tidy = (x) => (Number.isFinite(x) ? +x.toPrecision(10) : "");

function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/* Part contours for drawing, or null when its dims are invalid. */
function partGeom(p) {
  try {
    const dims = L.shapes.checkDims(p.shape, p.dims);
    const q = { ...p, dims };
    return { contours: L.section.partContours(q), corners: L.section.partCorners(q) };
  } catch (e) { return null; }
}
const boxOf = (contours) => G.bbox(contours);

/* ---------- history ---------- */
function record() {
  past.push(JSON.stringify({ draft, sel }));
  if (past.length > 200) past.shift();
  future.length = 0;
  syncHistory();
}
function restore(stack, other) {
  if (!stack.length) return;
  other.push(JSON.stringify({ draft, sel }));
  const s = JSON.parse(stack.pop());
  draft = s.draft; sel = s.sel; corner = null;
  renderPanel(); update();
  syncHistory();
}
function syncHistory() { $("undo").disabled = !past.length; $("redo").disabled = !future.length; }

/* ---------- compute ---------- */
function update({ plastic = "defer" } = {}) {
  failure = null;
  try {
    result = L.compute(draft, { accuracy: ACCURACY, plastic: false });
  } catch (e) {
    if (!(e instanceof L.section.ModelError)) throw e;
    failure = e;
  }
  plasticStale = true;
  renderError();
  renderCanvas();
  renderResults();
  clearTimeout(plasticTimer);
  if (failure) { renderPlastic(); return; }
  if (plastic === "now") runPlastic();
  else if (plastic === "defer" && !drag) plasticTimer = setTimeout(runPlastic, 180);
  else renderPlastic();
}

function runPlastic() {
  if (failure || !result) return;
  try {
    plasticResult = L.compute(draft, { accuracy: ACCURACY, plastic: true });
  } catch (e) {
    plasticResult = null;
  }
  plasticStale = false;
  renderPlastic();
}

function renderError() {
  document.querySelectorAll("[aria-invalid]").forEach((x) => x.removeAttribute("aria-invalid"));
  const box = $("error");
  if (!failure) { box.hidden = true; box.textContent = ""; return; }
  box.hidden = false;
  box.replaceChildren(h("b", { text: "Can't compute: " }), document.createTextNode(failure.message));
  const path = errPath(failure.path);
  if (path) {
    const input = document.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (input) input.setAttribute("aria-invalid", "true");
  }
}

/* ---------- canvas ---------- */
const canvas = $("canvas");
function sizeCanvas() {
  const W = Math.max(280, $("stage").clientWidth);
  const H = Math.round(Math.min(620, Math.max(300, W * 0.7)));
  if (W !== view.W || H !== view.H) { view.W = W; view.H = H; return true; }
  return false;
}
function fit() {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of draft.parts) {
    const g = partGeom(p);
    if (!g) continue;
    const b = boxOf(g.contours);
    x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
  }
  if (!Number.isFinite(x0)) { x0 = -100; x1 = 100; y0 = -100; y1 = 100; }
  const w = Math.max(x1 - x0, 1), hh = Math.max(y1 - y0, 1);
  const pad = 0.14;
  const s = Math.min(view.W / (w * (1 + 2 * pad)), view.H / (hh * (1 + 2 * pad)));
  view.s = s;
  view.ox = view.W / 2 - s * (x0 + x1) / 2;
  view.oy = view.H / 2 + s * (y0 + y1) / 2;
}
const toPx = (x, y) => [view.ox + view.s * x, view.oy - view.s * y];
const toMm = (px, py) => [(px - view.ox) / view.s, (view.oy - py) / view.s];
function gridStep() {
  for (const e of [-2, -1, 0, 1, 2, 3, 4]) for (const m of [1, 2, 5]) { const st = m * 10 ** e; if (st * view.s >= 14) return st; }
  return 1e4;
}
function snapStep() {
  const v = $("snap").value;
  if (v === "off") return 0;
  if (v === "auto") return gridStep();
  return +v;
}
const snapTo = (x, st) => (st ? Math.round(x / st) * st : x);

function renderCanvas() {
  sizeCanvas();
  if (!drag) fit();
  canvas.setAttribute("viewBox", `0 0 ${view.W} ${view.H}`);
  canvas.setAttribute("height", view.H);
  canvas.replaceChildren();
  // Grid.
  const st = gridStep();
  const [mx0, my1] = toMm(0, 0), [mx1, my0] = toMm(view.W, view.H);
  const g = el("g", {}, canvas);
  for (let x = Math.ceil(mx0 / st) * st; x <= mx1; x += st) {
    const k = Math.round(x / st), px = toPx(x, 0)[0];
    el("line", { x1: px, x2: px, y1: 0, y2: view.H, class: Math.abs(x) < st / 2 ? "g-origin" : k % 5 === 0 ? "g-major" : "g-minor" }, g);
  }
  for (let y = Math.ceil(my0 / st) * st; y <= my1; y += st) {
    const k = Math.round(y / st), py = toPx(0, y)[1];
    el("line", { y1: py, y2: py, x1: 0, x2: view.W, class: Math.abs(y) < st / 2 ? "g-origin" : k % 5 === 0 ? "g-major" : "g-minor" }, g);
  }
  el("text", { x: 8, y: view.H - 8, class: "scale", text: `grid ${st} mm${snapStep() ? ` · snap ${fmt(snapStep())} mm` : " · snap off"}` }, canvas);
  // Parts: solids first, voids on top.
  const badIndex = failure && /^parts\[(\d+)\]/.exec(failure.path || "") ? +/^parts\[(\d+)\]/.exec(failure.path)[1] : -1;
  const order = draft.parts.map((p, i) => [p, i]).sort((a, b) => (a[0].void ? 1 : 0) - (b[0].void ? 1 : 0));
  for (const [p, i] of order) {
    const geo = partGeom(p);
    if (!geo) {
      const [px, py] = toPx(p.x, p.y);
      el("text", { x: px, y: py, class: "plabel", "text-anchor": "middle", text: `${p.id}: invalid size` }, canvas);
      continue;
    }
    const path = el("path", {
      d: G.svgPath(geo.contours, toPx, view.s),
      class: `part${p.void ? " void" : ""}${p.id === sel ? " selected" : ""}${i === badIndex ? " bad" : ""}`,
      "data-kind": "part", "data-id": p.id,
    }, canvas);
    if (!p.void) path.style.fill = `var(--m${matIndex(p.material) % 6})`;
    el("title", { text: `${p.name || p.id} (${SHAPES[p.shape] ? SHAPES[p.shape].label : p.shape}${p.void ? ", void" : ""})` }, path);
  }
  // Centroid and principal axes.
  if (result) {
    const pr = result.props;
    const [px, py] = toPx(pr.cx, pr.cy);
    const Lx = view.W + view.H;
    for (const [a, cls] of [[pr.theta, "caxis"], [pr.theta + Math.PI / 2, "caxis minor"]]) {
      el("line", { x1: px - Lx * Math.cos(a), y1: py + Lx * Math.sin(a), x2: px + Lx * Math.cos(a), y2: py - Lx * Math.sin(a), class: cls }, canvas);
    }
    el("circle", { cx: px, cy: py, r: 5, class: "centroid" }, canvas);
  }
  // Selection: label, resize handles and corners.
  const p = selPart();
  const geo = p && partGeom(p);
  if (geo) {
    const b = boxOf(geo.contours);
    const [bx0, by1] = toPx(b.x0, b.y1), [bx1, by0] = toPx(b.x1, b.y0);
    el("text", { x: (bx0 + bx1) / 2, y: by1 - 8, "text-anchor": "middle", class: "plabel", text: p.name || p.id }, canvas);
    const coarse = matchMedia("(pointer: coarse)").matches;
    const hs = coarse ? 14 : 10, hit = coarse ? 36 : 24;
    const handles = [["e", bx1, (by0 + by1) / 2, "ew"], ["w", bx0, (by0 + by1) / 2, "ew"], ["n", (bx0 + bx1) / 2, by1, "ns"], ["s", (bx0 + bx1) / 2, by0, "ns"]];
    for (const [edge, x, y, cls] of handles) {
      const gg = el("g", { "data-kind": "handle", "data-edge": edge }, canvas);
      el("rect", { x: x - hit / 2, y: y - hit / 2, width: hit, height: hit, class: "hit" }, gg);
      el("rect", { x: x - hs / 2, y: y - hs / 2, width: hs, height: hs, rx: 2, class: `handle ${cls}` }, gg);
      el("title", { text: `Resize from the ${{ e: "right", w: "left", n: "top", s: "bottom" }[edge]} edge` }, gg);
    }
    geo.corners.forEach((c, k) => {
      const [x, y] = toPx(...c.at);
      const gg = el("g", { "data-kind": "corner", "data-index": k }, canvas);
      el("circle", { cx: x, cy: y, r: coarse ? 18 : 11, class: "hit" }, gg);
      el("circle", { cx: x, cy: y, r: 5, class: `corner${k === corner ? " on" : ""}` }, gg);
      el("title", { text: `${c.name}: radius ${fmt(p.radii[k] || 0)} mm` }, gg);
    });
  }
  for (const gd of guides) {
    if (gd.axis === "x") { const px = toPx(gd.at, 0)[0]; el("line", { x1: px, x2: px, y1: 0, y2: view.H, class: "guide" }, canvas); }
    else { const py = toPx(0, gd.at)[1]; el("line", { y1: py, y2: py, x1: 0, x2: view.W, class: "guide" }, canvas); }
  }
  renderReadout();
}

function renderReadout() {
  const p = selPart();
  const out = $("readout");
  if (!p) { out.textContent = draft.parts.length ? "Select a part to edit it." : "Add a shape from the palette."; return; }
  const dims = Object.entries(p.dims).map(([k, v]) => `${k} = ${fmt(v)}`).join(", ");
  out.textContent = `${p.name || p.id}: ${SHAPES[p.shape] ? SHAPES[p.shape].label.toLowerCase() : p.shape}${p.void ? " (void)" : ""}, ${dims} mm, at (${fmt(p.x)}, ${fmt(p.y)}), turned ${p.orientation}°${corner !== null && p.radii ? `; ${SHAPES[p.shape].corners(p.dims)[corner]} radius ${fmt(p.radii[corner])} mm` : ""}.`;
}

/* ---------- snapping ---------- */
function otherEdges(excludeId) {
  const xs = [], ys = [];
  for (const q of draft.parts) {
    if (q.id === excludeId) continue;
    const g = partGeom(q);
    if (!g) continue;
    const b = boxOf(g.contours);
    xs.push(b.x0, b.x1, (b.x0 + b.x1) / 2); ys.push(b.y0, b.y1, (b.y0 + b.y1) / 2);
  }
  return { xs, ys };
}
/* Offset that brings one of `mine` onto one of `theirs` within the pixel threshold, else null. */
function objectSnap(mine, theirs) {
  const tol = 8 / view.s;
  let best = null;
  for (const m of mine) for (const t of theirs) { const d = t - m; if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, at: t }; }
  return best;
}

/* ---------- pointer gestures ---------- */
function pointerMm(e) {
  const r = canvas.getBoundingClientRect();
  return toMm(((e.clientX - r.left) * view.W) / r.width, ((e.clientY - r.top) * view.H) / r.height);
}
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const t = e.target.closest("[data-kind]");
  const at = pointerMm(e);
  canvas.focus({ preventScroll: true });
  if (!t) { if (sel !== null) { sel = null; corner = null; renderPanel(); renderCanvas(); } return; }
  const kind = t.dataset.kind;
  if (kind === "part") {
    const id = t.dataset.id;
    if (sel !== id) { sel = id; corner = null; renderPanel(); }
    const p = selPart();
    drag = { kind: "move", id, start: at, x0: p.x, y0: p.y, before: JSON.stringify({ draft, sel }), moved: false };
  } else if (kind === "handle") {
    const p = selPart(), g = p && partGeom(p);
    if (!g) return;
    drag = { kind: "resize", edge: t.dataset.edge, id: p.id, start: at, box: boxOf(g.contours), dims: { ...p.dims }, radii: [...p.radii], x0: p.x, y0: p.y, before: JSON.stringify({ draft, sel }), moved: false };
  } else if (kind === "corner") {
    corner = +t.dataset.index;
    renderPanel(); renderCanvas();
    const input = document.querySelector(`[data-corner="${corner}"]`);
    if (input) input.focus();
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  renderCanvas();
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const at = pointerMm(e);
  const dx = at[0] - drag.start[0], dy = at[1] - drag.start[1];
  if (!drag.moved && Math.hypot(dx, dy) * view.s < 3) return;
  if (!drag.moved) { drag.moved = true; past.push(drag.before); future.length = 0; syncHistory(); }
  const p = draft.parts[partIndex(drag.id)];
  const free = e.altKey, st = free ? 0 : snapStep();
  guides = [];
  if (drag.kind === "move") {
    let x = snapTo(drag.x0 + dx, st), y = snapTo(drag.y0 + dy, st);
    if (!free) {
      const g = partGeom({ ...p, x, y });
      if (g) {
        const b = boxOf(g.contours), o = otherEdges(p.id);
        const sx = objectSnap([b.x0, b.x1, (b.x0 + b.x1) / 2], o.xs), sy = objectSnap([b.y0, b.y1, (b.y0 + b.y1) / 2], o.ys);
        if (sx) { x += sx.d; guides.push({ axis: "x", at: sx.at }); }
        if (sy) { y += sy.d; guides.push({ axis: "y", at: sy.at }); }
      }
    }
    p.x = tidy(x); p.y = tidy(y);
  } else {
    resizeFromEdge(p, drag, at, st, free);
  }
  update({ plastic: "skip" });
  syncFieldValues();
});
function endDrag() {
  if (!drag) return;
  const moved = drag.moved;
  drag = null; guides = [];
  if (moved) update(); else renderCanvas();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("lostpointercapture", endDrag);

function resizeFromEdge(p, d, at, st, free) {
  const shape = SHAPES[p.shape];
  const b = d.box;
  const horizontal = d.edge === "e" || d.edge === "w";
  const fixed = { e: b.x0, w: b.x1, n: b.y0, s: b.y1 }[d.edge];
  let edge = snapTo(horizontal ? at[0] : at[1], st);
  if (!free) {
    const o = otherEdges(p.id), sn = objectSnap([edge], horizontal ? o.xs : o.ys);
    if (sn) { edge += sn.d; guides.push({ axis: horizontal ? "x" : "y", at: sn.at }); }
  }
  const minSize = Math.max(st || 0, 0.5);
  let size = d.edge === "e" || d.edge === "n" ? edge - fixed : fixed - edge;
  size = Math.max(minSize, size);
  const old = horizontal ? b.x1 - b.x0 : b.y1 - b.y0;
  const f = size / old;
  let sx = horizontal ? f : 1, sy = horizontal ? 1 : f;
  if (shape.locked) sx = sy = f;
  const turned = p.orientation === 90;
  const dims = shape.resize(d.dims, turned ? sy : sx, turned ? sx : sy);
  for (const k of Object.keys(dims)) dims[k] = SHAPES[p.shape].dims.find((f2) => f2.key === k).integer ? dims[k] : tidy(dims[k]);
  p.dims = dims;
  // Keep radii valid: shrink them with the part when they no longer fit.
  p.radii = [...d.radii];
  try { shape.build(dims, p.radii); } catch (e) {
    const k = Math.min(sx, sy);
    p.radii = d.radii.map((r) => tidy(r * k));
  }
  // Keep the opposite edge where it was.
  const g = partGeom(p);
  if (!g) return;
  const nb = boxOf(g.contours);
  if (horizontal) {
    p.x = tidy(p.x + fixed - (d.edge === "e" ? nb.x0 : nb.x1));
    if (shape.locked) p.y = tidy(p.y + (b.y0 + b.y1 - nb.y0 - nb.y1) / 2);
  } else {
    p.y = tidy(p.y + fixed - (d.edge === "n" ? nb.y0 : nb.y1));
    if (shape.locked) p.x = tidy(p.x + (b.x0 + b.x1 - nb.x0 - nb.x1) / 2);
  }
}

/* ---------- keyboard on the canvas ---------- */
canvas.addEventListener("keydown", (e) => {
  const p = selPart();
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) restore(future, past); else restore(past, future); return; }
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "y") { e.preventDefault(); restore(future, past); return; }
  if (k === "[" || k === "]") {
    e.preventDefault();
    if (!draft.parts.length) return;
    const i = partIndex(sel), n = draft.parts.length;
    sel = draft.parts[(i < 0 ? 0 : (i + (k === "]" ? 1 : n - 1)) % n)].id;
    corner = null; renderPanel(); renderCanvas();
    return;
  }
  if (!p) return;
  const st = snapStep() || 1;
  const step = e.shiftKey ? st * 10 : e.altKey ? st / 10 : st;
  const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  if (moves[k]) {
    e.preventDefault(); record();
    p.x = tidy(p.x + moves[k][0] * step); p.y = tidy(p.y + moves[k][1] * step);
    update(); syncFieldValues();
  } else if (k === "Delete" || k === "Backspace") { e.preventDefault(); removePart(p.id); }
  else if (k === "r" || k === "R") { e.preventDefault(); turnPart(p); }
  else if (k === "d" || k === "D") { e.preventDefault(); duplicatePart(p); }
  else if (k === "c" || k === "C") {
    e.preventDefault();
    const n = p.radii.length;
    if (!n) return;
    corner = corner === null ? 0 : (corner + (e.shiftKey ? n - 1 : 1)) % n;
    renderPanel(); renderCanvas();
  } else if (k === "Escape") { sel = null; corner = null; renderPanel(); renderCanvas(); }
});

/* ---------- part operations ---------- */
function newPart(shapeId, isVoid, at) {
  const shape = SHAPES[shapeId];
  const taken = new Set(draft.parts.map((q) => q.id));
  const dims = L.shapes.defaults(shapeId);
  const host = isVoid ? (selPart() && !selPart().void ? selPart() : draft.parts.find((q) => !q.void)) : null;
  if (isVoid && host) {
    // A hole sized to fit well inside its host.
    const hb = partGeom(host) ? boxOf(partGeom(host).contours) : { x0: -50, x1: 50, y0: -50, y1: 50 };
    const room = 0.3 * Math.min(hb.x1 - hb.x0, hb.y1 - hb.y0);
    const f = room / Math.max(...shape.dims.filter((d) => !d.integer && d.key !== "t" && d.key !== "a" && d.key !== "s").map((d) => dims[d.key]));
    for (const d of shape.dims) if (!d.integer && d.key !== "t") dims[d.key] = tidy(dims[d.key] * f);
  }
  const p = {
    id: uniqueId(isVoid ? "hole" : shapeId, taken), shape: shapeId, dims, radii: shape.defaultRadii(dims),
    x: 0, y: 0, orientation: 0, material: isVoid ? null : (selPart() && selPart().material) || (draft.materials[0] && draft.materials[0].id) || null, void: !!isVoid,
  };
  p.name = p.id;
  const st = snapStep();
  const g = partGeom(p), b = boxOf(g.contours);
  if (at) { p.x = tidy(snapTo(at[0], st)); p.y = tidy(snapTo(at[1], st)); }
  else if (isVoid && host) { p.x = host.x; p.y = host.y; }
  else {
    // Beside the section: touching its right side, bottoms aligned.
    let x1 = -Infinity, y0 = Infinity;
    for (const q of draft.parts) { const gq = partGeom(q); if (!gq || q.void) continue; const bq = boxOf(gq.contours); x1 = Math.max(x1, bq.x1); y0 = Math.min(y0, bq.y0); }
    if (Number.isFinite(x1)) { p.x = tidy(x1 + (b.x1 - b.x0) / 2); p.y = tidy(y0 + (b.y1 - b.y0) / 2); }
  }
  record();
  draft.parts.push(p);
  sel = p.id; corner = null;
  renderPanel(); update();
}
function removePart(id) {
  record();
  draft.parts.splice(partIndex(id), 1);
  if (sel === id) { sel = null; corner = null; }
  renderPanel(); update();
}
function duplicatePart(p) {
  record();
  const q = clone(p);
  q.id = uniqueId(p.id, new Set(draft.parts.map((x) => x.id)));
  q.name = q.id;
  const g = partGeom(p);
  if (g) { const b = boxOf(g.contours); q.x = tidy(p.x + (b.x1 - b.x0)); }
  draft.parts.push(q);
  sel = q.id; corner = null;
  renderPanel(); update();
}
function turnPart(p) {
  record();
  p.orientation = p.orientation === 90 ? 0 : 90;
  renderPanel(); update();
}

/* ---------- palette ---------- */
function shapeIcon(shapeId, isVoid) {
  const svg = el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
  const s = SHAPES[shapeId];
  const d = L.shapes.defaults(shapeId);
  const built = s.build(d, s.defaultRadii(d).map((r) => (shapeId === "rhs" ? r : 0)));
  const b = G.bbox(built.contours);
  const k = 18 / Math.max(b.x1 - b.x0, b.y1 - b.y0);
  el("path", { d: G.svgPath(built.contours, (x, y) => [12 + k * x, 12 - k * y], k), "fill-rule": "evenodd" }, svg);
  return svg;
}
function renderPalette() {
  const pal = $("palette");
  const items = Object.keys(SHAPES).map((id) => [id, false, SHAPES[id].label]).concat([["circle", true, "Circular hole"], ["rect", true, "Rectangular hole"]]);
  for (const [id, isVoid, label] of items) {
    const b = h("button", { type: "button", class: `item${isVoid ? " void" : ""}`, "data-shape": id, "data-void": isVoid ? "1" : "", title: `Add ${label.toLowerCase()}: drag onto the section, or press to add` }, pal);
    b.appendChild(shapeIcon(id, isVoid));
    h("span", { text: label }, b);
    b.addEventListener("pointerdown", (e) => startPaletteDrag(e, id, isVoid, label));
    b.addEventListener("click", (e) => { if (b.dataset.dragged === "1") { b.dataset.dragged = ""; return; } newPart(id, isVoid); });
  }
}
function startPaletteDrag(e, id, isVoid, label) {
  if (e.button !== 0) return;
  const btn = e.currentTarget;
  const start = [e.clientX, e.clientY];
  let ghost = null;
  const move = (ev) => {
    if (!ghost && Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) > 6) {
      ghost = h("div", { class: "ghost", text: label }, document.body);
      btn.dataset.dragged = "1";
    }
    if (ghost) { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; }
  };
  const up = (ev) => {
    btn.removeEventListener("pointermove", move);
    btn.removeEventListener("pointerup", up);
    btn.removeEventListener("pointercancel", up);
    if (!ghost) return;
    ghost.remove();
    const r = canvas.getBoundingClientRect();
    if (ev.type === "pointerup" && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) newPart(id, isVoid, pointerMm(ev));
    setTimeout(() => { btn.dataset.dragged = ""; }, 0);
  };
  btn.setPointerCapture(e.pointerId);
  btn.addEventListener("pointermove", move);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
}

/* ---------- panel ---------- */
function renderPartList() {
  const list = $("partlist");
  list.replaceChildren();
  if (!draft.parts.length) { h("li", { class: "small muted", text: "No parts yet." }, list); return; }
  for (const p of draft.parts) {
    const li = h("li", {}, list);
    const b = h("button", { type: "button", "aria-current": p.id === sel ? "true" : "false" }, li);
    const sw = h("i", {}, b);
    sw.style.background = p.void ? "var(--bg)" : `var(--m${matIndex(p.material) % 6})`;
    if (p.void) sw.style.borderStyle = "dashed";
    h("span", { text: p.name || p.id }, b);
    h("span", { class: "kind", text: `${SHAPES[p.shape] ? SHAPES[p.shape].label : p.shape}${p.void ? " · void" : ""}` }, b);
    b.addEventListener("click", () => { sel = p.id; corner = null; renderPanel(); renderCanvas(); });
  }
}

function field(parent, label, path, value, { type = "number", step = "any", min, cornerIndex } = {}) {
  const l = h("label", { class: "f" }, parent);
  h("span", { text: label }, l);
  const input = h("input", { type, step: type === "number" ? step : undefined, min, "data-path": path, value: type === "number" ? tidy(value) : value ?? "", autocomplete: "off", spellcheck: "false", "data-corner": cornerIndex }, l);
  return input;
}

function renderPartEditor() {
  const box = $("part-editor");
  box.replaceChildren();
  const p = selPart();
  $("part-title").textContent = p ? `Part: ${p.name || p.id}` : "Selected part";
  if (!p) { h("p", { class: "small muted", text: "Select a part on the section or in the list, or add one from the palette." }, box); return; }
  const i = partIndex(p.id);
  const base = `parts.${i}`;
  const shape = SHAPES[p.shape];
  const r1 = h("div", { class: "row" }, box);
  field(r1, "Name", `${base}.name`, p.name, { type: "text" });
  const ls = h("label", { class: "f" }, r1);
  h("span", { text: "Shape" }, ls);
  const sSel = h("select", { "data-action": "shape" }, ls);
  for (const [id, s] of Object.entries(SHAPES)) h("option", { value: id, text: s.label, selected: id === p.shape }, sSel);
  sSel.addEventListener("change", () => {
    record();
    p.shape = sSel.value; p.dims = L.shapes.defaults(p.shape); p.radii = SHAPES[p.shape].defaultRadii(p.dims); corner = null;
    renderPanel(); update();
  });
  const dimsRow = h("div", { class: "row three" }, box);
  for (const d of shape.dims) field(dimsRow, `${d.label} (${d.integer ? "count" : "mm"})`, `${base}.dims.${d.key}`, p.dims[d.key], { step: d.integer ? "1" : "any", min: d.min === undefined ? "0" : d.min === -Infinity ? undefined : String(d.min) });
  const r2 = h("div", { class: "row three" }, box);
  field(r2, "x (mm)", `${base}.x`, p.x);
  field(r2, "y (mm)", `${base}.y`, p.y);
  const turn = h("div", {}, r2);
  h("span", { class: "label", text: "Turn", style: { display: "block", marginBottom: ".15rem" } }, turn);
  const seg = h("div", { class: "seg", role: "group", "aria-label": "Orientation" }, turn);
  for (const a of [0, 90]) {
    const b = h("button", { type: "button", "aria-pressed": String(p.orientation === a), text: `${a}°` }, seg);
    b.addEventListener("click", () => { if (p.orientation !== a) turnPart(p); });
  }
  const r3 = h("div", { class: "row" }, box);
  const lm = h("label", { class: "f" }, r3);
  h("span", { text: p.void ? "Material (from host)" : "Material" }, lm);
  const mSel = h("select", { "data-path": `${base}.material`, disabled: p.void }, lm);
  if (p.void) h("option", { value: "", text: "host part's material" }, mSel);
  for (const m of draft.materials) h("option", { value: m.id, text: m.name || m.id, selected: m.id === p.material }, mSel);
  const lv = h("label", { class: "check" }, r3);
  const cv = h("input", { type: "checkbox", checked: p.void }, lv);
  lv.appendChild(document.createTextNode("Void (hole)"));
  cv.addEventListener("change", () => {
    record();
    p.void = cv.checked;
    p.material = p.void ? null : (draft.materials[0] && draft.materials[0].id) || null;
    renderPanel(); update();
  });
  // Corners.
  const names = shape.corners(p.dims);
  if (names.length) {
    h("h3", { text: "Corner radii (mm, 0 = sharp)", style: { marginTop: ".9rem" } }, box);
    const ul = h("ul", { class: "corners" }, box);
    names.forEach((n, k) => {
      const li = h("li", { class: k === corner ? "on" : "" }, ul);
      const input = field(li, n, `${base}.radii.${k}`, p.radii[k], { min: "0", cornerIndex: k });
      input.addEventListener("focus", () => { if (corner !== k) { corner = k; ul.querySelectorAll("li").forEach((x, j) => x.classList.toggle("on", j === k)); renderCanvas(); } });
    });
    const all = h("div", { class: "row", style: { marginTop: ".5rem" } }, box);
    const allIn = field(all, "All corners", "", "", {});
    allIn.removeAttribute("data-path");
    const setAll = h("button", { type: "button", class: "btn", text: "Set all" }, all);
    setAll.addEventListener("click", () => {
      const v = Number(allIn.value);
      if (allIn.value === "" || !(v >= 0)) { allIn.setAttribute("aria-invalid", "true"); return; }
      record(); p.radii = p.radii.map(() => v); renderPanel(); update();
    });
  }
  const act = h("div", { class: "actions" }, box);
  h("button", { type: "button", class: "btn", text: "Duplicate" }, act).addEventListener("click", () => duplicatePart(p));
  h("button", { type: "button", class: "btn", text: "Turn 90°" }, act).addEventListener("click", () => turnPart(p));
  h("button", { type: "button", class: "btn danger", text: "Delete" }, act).addEventListener("click", () => removePart(p.id));
}

function renderMaterials() {
  const box = $("materials");
  box.replaceChildren();
  draft.materials.forEach((m, i) => {
    const d = h("details", { class: "mat" }, box);
    const s = h("summary", {}, d);
    const sw = h("i", {}, s); sw.style.background = `var(--m${i % 6})`;
    h("span", { text: m.name || m.id }, s);
    const base = `materials.${i}`;
    const r0 = h("div", { class: "row" }, d);
    const idIn = field(r0, "Id", "", m.id, { type: "text" });
    idIn.removeAttribute("data-path");
    idIn.addEventListener("change", () => {
      const v = idIn.value.trim();
      if (!v || draft.materials.some((x, j) => j !== i && x.id === v)) { idIn.setAttribute("aria-invalid", "true"); return; }
      record();
      for (const p of draft.parts) if (p.material === m.id) p.material = v;
      m.id = v; renderPanel(); update();
    });
    field(r0, "Name", `${base}.name`, m.name, { type: "text" });
    const r1 = h("div", { class: "row" }, d);
    field(r1, "E (MPa)", `${base}.E`, m.E, { min: "0" });
    field(r1, "σ0.2 (MPa)", `${base}.sigma02`, m.sigma02, { min: "0" });
    const r2 = h("div", { class: "row" }, d);
    field(r2, "Ramberg–Osgood n", `${base}.n`, m.n, { min: "1" });
    field(r2, "ε_lim", `${base}.eps_lim`, m.eps_lim, { min: "0", step: "0.001" });
    const lc = h("label", { class: "check" }, d);
    const cc = h("input", { type: "checkbox", checked: !!m.compression }, lc);
    lc.appendChild(document.createTextNode("Separate compression law"));
    cc.addEventListener("change", () => {
      record();
      if (cc.checked) m.compression = { E: m.E, sigma02: m.sigma02, n: m.n, eps_lim: m.eps_lim }; else delete m.compression;
      renderMaterials(); update();
      box.querySelectorAll("details")[i].open = true;
    });
    if (m.compression) {
      const c1 = h("div", { class: "row" }, d);
      field(c1, "Compression E", `${base}.compression.E`, m.compression.E, { min: "0" });
      field(c1, "Compression σ0.2", `${base}.compression.sigma02`, m.compression.sigma02, { min: "0" });
      const c2 = h("div", { class: "row" }, d);
      field(c2, "Compression n", `${base}.compression.n`, m.compression.n, { min: "1" });
      field(c2, "Compression ε_lim", `${base}.compression.eps_lim`, m.compression.eps_lim, { min: "0", step: "0.001" });
    }
    const used = draft.parts.some((p) => p.material === m.id);
    const del = h("button", { type: "button", class: "btn danger", text: "Remove material", disabled: used || draft.materials.length < 2, title: used ? "Used by a part" : "" }, h("div", { class: "actions" }, d));
    del.addEventListener("click", () => { record(); draft.materials.splice(i, 1); renderPanel(); update(); });
  });
  const add = $("add-material");
  add.replaceChildren();
  for (const m of D.materials) h("option", { value: m.id, text: m.name }, add);
}

function renderSettings() {
  const from = $("ebase-from");
  from.replaceChildren();
  let matched = false;
  for (const m of draft.materials) {
    const on = m.E === draft.E_base && !matched;
    if (on) matched = true;
    h("option", { value: m.id, text: `${m.name || m.id} (${fmt(m.E)} MPa)`, selected: on }, from);
  }
  h("option", { value: "", text: "custom value", selected: !matched }, from);
  if (document.activeElement !== $("ebase")) $("ebase").value = tidy(draft.E_base);
  if (document.activeElement !== $("title")) $("title").value = draft.title || "";
  if (document.activeElement !== $("axial")) $("axial").value = tidy(draft.plastic.N);
  $("axis").value = draft.plastic.axis;
  document.querySelectorAll("[data-solve]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.solve === draft.plastic.solve)));
}

function renderPanel() {
  renderPartList();
  renderPartEditor();
  renderMaterials();
  renderSettings();
  renderError();
}

/* Update number fields from the model without rebuilding the panel (during drags). */
function syncFieldValues() {
  document.querySelectorAll("input[data-path]").forEach((input) => {
    if (input === document.activeElement) return;
    const v = getPath(draft, input.dataset.path);
    if (input.type === "number") input.value = tidy(v);
  });
  renderPartList();
}

/* Field edits (delegated). */
document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t.matches || !t.matches("[data-path]")) return;
  if (!editing) { record(); editing = true; }
  const path = t.dataset.path;
  let v;
  if (t.type === "number") v = t.value.trim() === "" ? NaN : Number(t.value);
  else v = t.value;
  if (t.tagName === "SELECT" && path.endsWith(".material")) v = t.value || null;
  setPath(draft, path, v);
  if (path === "E_base") renderSettings();
  if (/^materials\.\d+\.(E|name)$/.test(path)) { renderSettings(); renderPartList(); }
  if (/\.name$/.test(path)) { renderPartList(); $("part-title").textContent = selPart() ? `Part: ${selPart().name || selPart().id}` : "Selected part"; }
  update();
});
document.addEventListener("change", (e) => { if (e.target.matches && e.target.matches("[data-path]")) editing = false; });
document.addEventListener("focusout", () => { editing = false; });

$("ebase-from").addEventListener("change", (e) => {
  const m = draft.materials.find((x) => x.id === e.target.value);
  if (!m) { $("ebase").focus(); return; }
  record(); draft.E_base = m.E; renderSettings(); update();
});
$("add-material-btn").addEventListener("click", () => {
  const src = D.materials.find((m) => m.id === $("add-material").value);
  record();
  const m = clone(src);
  m.id = uniqueId(m.id, new Set(draft.materials.map((x) => x.id)));
  draft.materials.push(m);
  renderPanel(); update();
  const ds = $("materials").querySelectorAll("details");
  ds[ds.length - 1].open = true;
});
document.querySelectorAll("[data-solve]").forEach((b) => b.addEventListener("click", () => {
  if (draft.plastic.solve === b.dataset.solve) return;
  record(); draft.plastic.solve = b.dataset.solve; renderSettings(); update({ plastic: "now" });
}));
$("axis").addEventListener("change", () => { renderSettings(); });

/* ---------- results ---------- */
function tableFrom(table, section) {
  table.replaceChildren();
  const thead = h("thead", {}, table), tr = h("tr", {}, thead);
  section.columns.forEach((c, i) => h("th", { scope: "col", class: section.align[i] === "r" ? "num" : "", text: c }, tr));
  const tb = h("tbody", {}, table);
  for (const r of section.rows) { const row = h("tr", {}, tb); r.forEach((c, i) => h("td", { class: section.align[i] === "r" ? "num" : "", text: c }, row)); }
}
function stat(ul, value, label) { const li = h("li", {}, ul); h("b", { text: value }, li); h("span", { text: label }, li); }

function renderResults() {
  const stale = !!failure;
  for (const id of ["stats", "props-table", "parts-table", "torsion"]) $(id).classList.toggle("stale", stale);
  if (!result) return;
  const pr = result.props;
  const ul = $("stats");
  ul.replaceChildren();
  stat(ul, `${fmt(pr.A, 5)} mm²`, "Area A");
  stat(ul, `${fmt(pr.cx, 4)}, ${fmt(pr.cy, 4)} mm`, "Centroid x_c, y_c");
  stat(ul, `${fmt(pr.Ix, 4)} mm⁴`, "I_x");
  stat(ul, `${fmt(pr.Iy, 4)} mm⁴`, "I_y");
  stat(ul, `${fmt(pr.thetaDeg, 4)}°`, `Principal angle; I_1 ${fmt(pr.I1, 4)}, I_2 ${fmt(pr.I2, 4)} mm⁴`);
  stat(ul, result.torsion.available ? `${fmt(result.torsion.J, 4)} mm⁴` : "n/a", "Torsion constant J");
  const rep = L.buildReport(result);
  tableFrom($("props-table"), rep.sections.find((s) => s.title === "Section properties"));
  const t = result.torsion, tb = $("torsion");
  tb.replaceChildren();
  if (t.available) {
    h("p", {}, tb).append(h("b", { text: `J = ${fmt(t.J)} mm⁴` }), document.createTextNode(` by ${t.method}: ${t.text}.`));
    h("p", { class: "small muted", text: `Checked against the numerical Prandtl reference on ${t.cases} case${t.cases === 1 ? "" : "s"}: stated accuracy within ${pctTxt(t.stated)}, largest error measured ${pctTxt(t.measured)}.${t.note ? " " + t.note : ""}` }, tb);
  } else {
    h("p", {}, tb).append(h("b", { text: "n/a" }), document.createTextNode(` ${t.reason}`));
  }
  tableFrom($("parts-table"), {
    columns: ["Part", "Material", "n", "Area (mm²)", "Centroid (mm)"], align: "llrrr",
    rows: pr.parts.map((q) => [q.id + (q.void ? ` (void in ${q.host})` : ""), q.material, fmt(q.n, 4), fmt(q.void ? -q.area : q.area, 5), `${fmt(q.cx, 4)}, ${fmt(q.cy, 4)}`]),
  });
}
const pctTxt = (x) => `${+(x * 100).toPrecision(2)}%`;

/* ---------- plastic ---------- */
let chartState = null;
function colors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return { bg: v("--bg"), fg: v("--fg"), muted: v("--muted"), grid: v("--grid"), fill: v("--m0"), stroke: v("--part-stroke"), void: v("--bg"), axis: v("--axis"), curve: v("--series"), ref: v("--muted"), mark: v("--fg") };
}
function renderPlastic() {
  const chart = $("chart"), ps = $("pstats");
  const stale = plasticStale || !!failure;
  chart.classList.toggle("stale", stale); ps.classList.toggle("stale", stale);
  if (!plasticResult) { if (!failure && plasticStale) return; }
  if (!plasticResult || !plasticResult.plastic) return;
  const pl = plasticResult.plastic;
  ps.replaceChildren();
  $("tip").hidden = true;
  if (pl.error) {
    chart.replaceChildren(h("p", { class: "error", text: `Moment–curvature n/a: ${pl.error}` }));
    $("chart-readout").textContent = "";
    $("curve-table").replaceChildren();
    chartState = null;
    return;
  }
  const rep = L.buildReport(plasticResult);
  const W = Math.max(320, Math.min(640, chart.clientWidth || 560)), H = Math.round(W * 0.62);
  chart.innerHTML = R.curveSvg(rep, { width: W, height: H, colors: colors(), title: false, font: getComputedStyle(document.body).fontFamily.replace(/"/g, "'") });
  const svg = chart.querySelector("svg");
  const geo = JSON.parse(svg.dataset.plot);
  const overlay = el("rect", { x: geo.left, y: geo.top, width: geo.width, height: geo.height, class: "overlay" }, svg);
  const xh = el("line", { class: "xhair", y1: geo.top, y2: geo.top + geo.height, visibility: "hidden" }, svg);
  const dot = el("circle", { r: 5, class: "dot", visibility: "hidden" }, svg);
  chartState = { pl, geo, svg, xh, dot, idx: pl.curve.length - 1, W, H };
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) * W) / r.width;
    const k = ((x - geo.left) / geo.width) * geo.kmax;
    let best = 0;
    pl.curve.forEach((p, i) => { if (Math.abs(p.kappa - k) < Math.abs(pl.curve[best].kappa - k)) best = i; });
    showPoint(best);
  };
  overlay.addEventListener("pointermove", move);
  overlay.addEventListener("pointerdown", move);
  overlay.addEventListener("pointerleave", () => { xh.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); $("tip").hidden = true; });
  const L0 = pl.limit;
  stat(ps, `${fmt(L0.M, 4)} N·mm`, "Allowable moment M_lim at ε_lim");
  stat(ps, `${fmt(L0.kappa, 4)} 1/mm`, "Curvature κ_lim");
  stat(ps, `${L0.governing.part}, ${L0.governing.fibre}`, `Governing fibre, ε = ${fmt(L0.governing.strain, 3)}`);
  stat(ps, pl.Mel === null ? "n/a" : `${fmt(pl.Mel, 4)} N·mm`, "First-yield moment M_el at N = 0");
  stat(ps, pl.Mp === null ? "n/a" : `${fmt(pl.Mp, 4)} N·mm`, "Fully plastic moment M_p at N = 0");
  stat(ps, pl.Zp === null ? "n/a" : `${fmt(pl.Zp, 4)} mm³`, pl.Zp === null ? `Z_p: ${pl.ZpNote}` : "Plastic modulus Z_p = M_p / σ0.2");
  stat(ps, pl.shapeFactor === null ? "n/a" : fmt(pl.shapeFactor, 4), "Shape factor M_p / M_el");
  if (pl.N !== 0) {
    stat(ps, pl.MelN === null ? "n/a" : `${fmt(pl.MelN, 4)} N·mm`, "First-yield moment M_el(N) at the applied axial force N");
    stat(ps, pl.MpN === null ? "n/a" : `${fmt(pl.MpN, 4)} N·mm`, "Fully plastic moment M_p(N) at the applied axial force N");
  }
  stat(ps, pl.solve === "zero-cross" ? `${fmt((L0.phi * 180) / Math.PI, 3)}°` : `${fmt(L0.Mcross, 4)} N·mm`, pl.solve === "zero-cross" ? "Neutral-axis rotation φ at ε_lim" : "Cross moment at ε_lim (mode a)");
  tableFrom($("curve-table"), rep.sections.find((s) => s.title === "M–κ curve"));
  $("chart-readout").textContent = `Bending about the ${{ x: "x axis", y: "y axis", major: "major principal axis", minor: "minor principal axis" }[pl.axis]} (${fmt(pl.alphaDeg, 4)}° from x), N = ${fmt(pl.N)} N. Move over the chart, or focus it and use the arrow keys, to read the curve.`;
  chart.setAttribute("aria-label", `Moment–curvature curve: M rises to ${fmt(L0.M, 4)} N·mm at κ = ${fmt(L0.kappa, 4)} per mm, where ${L0.governing.part} reaches ε_lim.`);
}
function showPoint(i) {
  const c = chartState;
  if (!c) return;
  c.idx = i;
  const p = c.pl.curve[i];
  const x = c.geo.left + (p.kappa / c.geo.kmax) * c.geo.width, y = c.geo.top + c.geo.height - (p.M / c.geo.mmax) * c.geo.height;
  c.xh.setAttribute("x1", x); c.xh.setAttribute("x2", x); c.xh.setAttribute("visibility", "visible");
  c.dot.setAttribute("cx", x); c.dot.setAttribute("cy", y); c.dot.setAttribute("visibility", "visible");
  const tip = $("tip");
  tip.replaceChildren();
  const l1 = h("div", {}, tip); h("i", {}, l1); h("b", { text: `${fmt(p.M, 5)} N·mm` }, l1);
  h("div", { class: "muted", text: `κ ${fmt(p.kappa, 4)} 1/mm · ε ${fmt(p.epsMin, 3)} to ${fmt(p.epsMax, 3)}${c.pl.solve === "zero-cross" ? ` · φ ${fmt((p.phi * 180) / Math.PI, 3)}°` : ` · cross ${fmt(p.Mcross, 3)}`}` }, tip);
  tip.hidden = false;
  const r = c.svg.getBoundingClientRect(), host = $("chart").getBoundingClientRect();
  const sx = r.width / c.W;
  const left = r.left - host.left + x * sx, top = r.top - host.top + y * sx;
  tip.style.left = `${Math.min(left + 12, host.width - tip.offsetWidth - 4)}px`;
  tip.style.top = `${Math.max(0, top - tip.offsetHeight - 10) + $("chart").offsetTop}px`;
}
$("chart").addEventListener("keydown", (e) => {
  if (!chartState) return;
  const n = chartState.pl.curve.length;
  const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
  if (map[e.key]) { e.preventDefault(); showPoint(Math.max(0, Math.min(n - 1, chartState.idx + map[e.key]))); }
  else if (e.key === "Home") { e.preventDefault(); showPoint(0); }
  else if (e.key === "End") { e.preventDefault(); showPoint(n - 1); }
});
$("chart").addEventListener("blur", () => { $("tip").hidden = true; });

/* ---------- exports ---------- */
function status(msg) { $("export-status").textContent = msg; }
function download(name, blob) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name }, document.body);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const slug = () => (draft.title || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
function fullResult() {
  if (failure) throw new Error(`Fix the model first: ${failure.message}`);
  if (!plasticResult || plasticStale) runPlastic();
  return plasticResult || L.compute(draft, { accuracy: ACCURACY });
}
function guarded(fn) { return () => { try { fn(); } catch (e) { status(e.message); } }; }

$("dl-md").addEventListener("click", guarded(() => {
  const r = fullResult();
  download(`${slug()}.md`, new Blob([R.markdown(L.buildReport(r), r.model)], { type: "text/markdown" }));
  status("Markdown downloaded.");
}));
$("dl-pdf").addEventListener("click", guarded(() => {
  const r = fullResult();
  const s = R.pdf(L.buildReport(r));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  download(`${slug()}.pdf`, new Blob([bytes], { type: "application/pdf" }));
  status("PDF downloaded.");
}));
function png(svgText, name, w, h2) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = w * 2; c.height = h2 * 2;
    const ctx = c.getContext("2d");
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, w, h2);
    c.toBlob((b) => { download(name, b); status("PNG downloaded."); }, "image/png");
  };
  img.onerror = () => status("Could not draw the PNG in this browser.");
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
}
$("dl-png-section").addEventListener("click", guarded(() => {
  const r = fullResult();
  png(R.sectionSvg(L.buildReport(r), { width: 800, height: 640 }), `${slug()}-section.png`, 800, 640);
}));
$("dl-png-curve").addEventListener("click", guarded(() => {
  const r = fullResult();
  if (!r.plastic || r.plastic.error) throw new Error("No moment–curvature curve to export.");
  png(R.curveSvg(L.buildReport(r), { width: 800, height: 500 }), `${slug()}-m-kappa.png`, 800, 500);
}));
function renderPrint() {
  const r = fullResult(), rep = L.buildReport(r);
  const figs = `<div class="figs">${R.sectionSvg(rep, { width: 480, height: 380 })}${r.plastic && !r.plastic.error ? R.curveSvg(rep, { width: 480, height: 380 }) : ""}</div>`;
  $("print-report").innerHTML = R.html(rep, figs);
}
$("print").addEventListener("click", guarded(() => { renderPrint(); window.print(); }));
addEventListener("beforeprint", () => { try { renderPrint(); } catch (e) { $("print-report").textContent = e.message; } });

$("import-file").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const text = await f.text();
    const model = L.section.normalize(R.modelFromText(text));
    record();
    loadModel(model);
    ownSection();
    status(`Imported ${f.name}.`);
  } catch (err) { status(`Import failed: ${err.message}`); }
});

/* Share: the model's YAML, base64url-encoded, in the address fragment. */
function encodeModel(model) {
  const bytes = new TextEncoder().encode(L.yaml.stringify(model));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeModel(text) {
  const b = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(b, (c) => c.charCodeAt(0));
  return L.section.normalize(L.yaml.parse(new TextDecoder().decode(bytes)));
}
$("share").addEventListener("click", guarded(() => {
  if (failure) throw new Error(`Fix the model first: ${failure.message}`);
  const url = `${location.href.split("#")[0]}#model=${encodeModel(L.section.normalize(draft))}`;
  history.replaceState(null, "", url);
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => status("Share link copied."), () => status("Share link is in the address bar."));
  else status("Share link is in the address bar.");
}));
function fromHash() {
  const m = /[#&]model=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return false;
  try { loadModel(decodeModel(m[1])); ownSection(); return true; } catch (e) { status(`The link's model could not be read: ${e.message}`); return false; }
}
addEventListener("hashchange", () => { if (fromHash()) status("Loaded the model from the link."); });

/* ---------- presets and loading ---------- */
function ownSection() { $("preset").value = ""; $("preset-note").textContent = ""; }
function loadModel(model) {
  draft = clone(model);
  if (draft.E_base === undefined && draft.materials[0]) draft.E_base = draft.materials[0].E;
  for (const p of draft.parts) {
    if (p.name === undefined) p.name = p.id;
    if (p.radii === undefined) p.radii = SHAPES[p.shape].defaultRadii(p.dims);
    if (p.orientation === undefined) p.orientation = 0;
    if (p.void === undefined) p.void = false;
    if (p.material === undefined) p.material = null;
  }
  draft.plastic = { axis: "x", N: 0, solve: "zero-cross", ...(draft.plastic || {}) };
  sel = null; corner = null;
  plasticResult = null;
  renderPanel();
  update({ plastic: "now" });
}
function staticText() {
  const pre = $("preset");
  for (const p of D.presets) h("option", { value: p.id, text: p.label }, pre);
  h("option", { value: "", text: "(your section)", hidden: true }, pre);
  pre.addEventListener("change", () => {
    const p = D.presets.find((x) => x.id === pre.value);
    if (!p) return;
    record();
    loadModel(p.model);
    $("preset-note").textContent = p.note;
  });
  const list = (id, items) => { for (const t of items) h("li", { text: t }, $(id)); };
  list("method-text", D.method);
  list("conventions", D.conventions);
  list("assumptions", D.assumptions);
  for (const s of D.sources) h("li", { text: s.label }, $("sources"));
  $("version").textContent = D.version;
  tableFrom($("accuracy-table"), {
    columns: ["Formula", "Method", "Cases", "Stated", "Largest measured", "Status"], align: "llrrrl",
    rows: Object.entries(ACCURACY.formulas).map(([id, a]) => [id, a.method, String(a.cases), pctTxt(a.stated), pctTxt(a.measured), a.pass ? "in use" : "withdrawn"]),
  });
  renderPalette();
}

/* ---------- wiring ---------- */
$("undo").addEventListener("click", () => restore(past, future));
$("redo").addEventListener("click", () => restore(future, past));
$("fit").addEventListener("click", () => renderCanvas());
$("snap").addEventListener("change", () => renderCanvas());
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input,select,textarea,#canvas")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) restore(future, past); else restore(past, future); }
});
if (typeof ResizeObserver === "function") {
  let lastW = 0;
  new ResizeObserver(() => { const w = $("stage").clientWidth; if (w !== lastW) { lastW = w; renderCanvas(); renderPlastic(); } }).observe($("stage"));
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderPlastic());
// A page-level theme switch (data-theme on <html>) also recolours the chart.
if (typeof MutationObserver === "function") new MutationObserver(() => renderPlastic()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

/* ---------- WebMCP ---------- */
function registerTools() {
  const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
  if (!mc) return;
  const out = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
  const summary = (r) => ({
    units: D.units,
    properties: (({ parts, extent, ...rest }) => rest)(r.props),
    torsion: r.torsion,
    plastic: r.plastic && !r.plastic.error ? {
      axis: r.plastic.axis, solve: r.plastic.solve, N: r.plastic.N, M_lim: r.plastic.limit.M, kappa_lim: r.plastic.limit.kappa,
      governing: r.plastic.limit.governing, M_el: r.plastic.Mel, M_p: r.plastic.Mp, Z_p: r.plastic.Zp, shape_factor: r.plastic.shapeFactor,
      M_el_at_N: r.plastic.MelN, M_p_at_N: r.plastic.MpN,
      curve: r.plastic.curve.map((p) => ({ kappa: p.kappa, M: p.M, M_cross: p.Mcross, phi: p.phi })),
    } : r.plastic,
  });
  const modelOf = (i) => (i && typeof i.yaml === "string" ? R.modelFromText(i.yaml) : i && i.model ? i.model : null);
  const modelSchema = { type: "object", description: "A Sectionlab model: { sectionlab: 1, title, E_base, materials: [{id, E, sigma02, n, eps_lim, compression?}], parts: [{id, shape, dims, radii, x, y, orientation (0|90), material, void}], plastic: {axis, N, solve} }. Units mm, MPa, N." };
  mc.registerTool({ name: "get_metadata", description: "Return Sectionlab's units, method, sign conventions, assumptions, shape catalogue (dimension and corner names), torsion accuracy table, material presets and example sections.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute() {
    return out({ title: D.title, version: D.version, units: D.units, notice: D.notice, method: D.method, conventions: D.conventions, assumptions: D.assumptions,
      shapes: Object.fromEntries(Object.entries(SHAPES).map(([id, s]) => [id, { label: s.label, family: s.family, dims: s.dims.map((d) => d.key), corners: s.corners(L.shapes.defaults(id)) }])),
      torsion_accuracy: ACCURACY.formulas, materials: D.materials, presets: D.presets.map((p) => ({ id: p.id, label: p.label, note: p.note, model: p.model })) });
  } });
  mc.registerTool({ name: "get_current_section", description: "Return the section on the page (its model) with its properties, torsion constant and moment–curvature results.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute() {
    try { return out({ model: L.section.normalize(draft), ...summary(L.compute(draft, { accuracy: ACCURACY })) }); } catch (e) { return out({ error: e.message, path: e.path || null }); }
  } });
  mc.registerTool({ name: "compute_section", description: "Compute a section given as a model object or as YAML/Markdown text, without changing the page. Returns properties, torsion and moment–curvature results.", inputSchema: { type: "object", properties: { model: modelSchema, yaml: { type: "string", description: "YAML model text or a Sectionlab Markdown export" } }, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute(i) {
    try { const m = modelOf(i); if (!m) return out({ error: "Give model or yaml." }); return out(summary(L.compute(m, { accuracy: ACCURACY }))); } catch (e) { return out({ error: e.message, path: e.path || null }); }
  } });
  mc.registerTool({ name: "export_markdown", description: "Return the Markdown report (tables plus a fenced YAML block of the whole model) for a given model, or for the page's section when none is given.", inputSchema: { type: "object", properties: { model: modelSchema, yaml: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute(i) {
    try { const r = L.compute(modelOf(i) || draft, { accuracy: ACCURACY }); return out({ markdown: R.markdown(L.buildReport(r), r.model) }); } catch (e) { return out({ error: e.message, path: e.path || null }); }
  } });
}

/* ---------- start ---------- */
staticText();
syncHistory();
if (!fromHash()) { loadModel(D.presets[0].model); $("preset-note").textContent = D.presets[0].note; }
registerTools();
})();
