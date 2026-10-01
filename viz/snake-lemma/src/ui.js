/* Snake Lemma: the page. Everything mathematical comes from self.SnakeLemma (the engine); this file only
   renders states, routes the URL hash, and wires controls. One renderer serves the page and presentation mode. */
(function () {
"use strict";
const SL = self.SnakeLemma, BD = self.Beamdswitch;
const $ = (id) => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
document.documentElement.classList.remove("nojs");

let st = SL.decodeHash(location.hash);
const ui = { brk: false, expert: false, preset: "standard", exportKind: "preset", hint: false, visited: new Set(), answers: {}, kbd: false, openFact: null, concept: null, present: null, labMsg: "" };

/* ---------- geometry: fixed for the whole visit ---------- */
const X = { 0: 34, 1: 180, 2: 360, 3: 540, 4: 692 };
const Y = { ker: 32, top: 132, bottom: 300, coker: 414 };
const W = 112, H = 88;
function at(id) {
  if (id.startsWith("coker")) { const o = SL.obj(id.slice(5)); return { x: X[o.col], y: Y.coker, coker: true }; }
  if (id.startsWith("ker")) { const o = SL.obj(id.slice(3)); return { x: X[o.col], y: Y.ker }; }
  const o = SL.obj(id); return { x: X[o.col], y: o.row ? Y.bottom : Y.top };
}
const REGIONS = {
  "ker-gamma": { at: "Cp", label: "ker γ" }, "ker-beta": { at: "Bp", label: "ker β" }, "ker-alpha": { at: "Ap", label: "ker α" },
  "ker-p": { at: "B", label: "ker p = im i" }, "im-alpha": { at: "A", label: "im α", im: true }, "im-beta": { at: "B", label: "im β", im: true }, "im-gamma": { at: "C", label: "im γ", im: true },
};
const TERM_AT = { "ker-alpha": "kerAp", "ker-beta": "kerBp", "ker-gamma": "kerCp", "coker-alpha": "cokerA", "coker-beta": "cokerB", "coker-gamma": "cokerC" };
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};
const textW = (s) => 18 + [...String(s)].length * 8.6;

/* The static layer: objects, arrows, squares, zeros. Built once per svg; state only toggles classes. */
function drawBase(svg) {
  svg.replaceChildren(...[...svg.childNodes].filter((n) => n.nodeName === "title" || n.nodeName === "desc"));
  const defs = el("defs");
  for (const [name, color] of [["neutral", "var(--neutral)"], ["cyan", "var(--cyan)"], ["orange", "var(--orange)"], ["yellow", "var(--yellow)"], ["green", "var(--green)"], ["magenta", "var(--magenta)"]]) {
    const m = el("marker", { id: `arrow-${name}`, viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "11", markerHeight: "11", markerUnits: "userSpaceOnUse", orient: "auto-start-reverse" });
    m.append(el("path", { d: "M0,0 L10,5 L0,10 z", style: `fill:${color}` }));
    defs.append(m);
  }
  svg.append(defs);
  const gSq = el("g"), gMor = el("g"), gObj = el("g");
  for (const sq of SL.SQUARES) {
    const [a, , , d] = sq.objects.map(at), g = el("g", { class: "d-sq", "data-sq": sq.id, "data-refs": `s:${sq.id}` });
    g.append(el("rect", { x: a.x, y: a.y, width: d.x - a.x, height: d.y - a.y, rx: 10 }));
    g.append(el("text", { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2 + 7, "text-anchor": "middle", class: "sqsym" }, "↻"));
    g.append(el("text", { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2 + 30, "text-anchor": "middle", class: "sqlab" }, ""));
    gSq.append(g);
  }
  const arrow = (id, x1, y1, x2, y2, label, lx, ly, cls, marker) => {
    const g = el("g", { class: `d-mor ${cls}`, "data-mor": id, "data-refs": `m:${id}` });
    g.append(el("line", { x1, y1, x2, y2, class: "hit" }));
    g.append(el("line", { x1, y1, x2, y2, "marker-end": `url(#arrow-${marker})` }));
    if (label) g.append(el("text", { x: lx, y: ly, "text-anchor": "middle" }, label));
    gMor.append(g);
  };
  for (const m of SL.MORPHISMS) {
    const a = at(m.from), b = at(m.to);
    if (m.dir === "h") arrow(m.id, a.x + W / 2 + 4, a.y, b.x - W / 2 - 8, b.y, m.label, (a.x + b.x) / 2, a.y - 10, "h", "neutral");
    else arrow(m.id, a.x, a.y + H / 2 + 4, b.x, b.y - H / 2 - 8, m.label, a.x + 14, (a.y + b.y) / 2 + 5, "v", "cyan");
  }
  for (const [row, y] of [[0, Y.top], [1, Y.bottom]]) {
    gObj.append(el("text", { x: X[0] - 6, y: y + 6, class: "d-zero", "text-anchor": "middle" }, "0"), el("text", { x: X[4] + 6, y: y + 6, class: "d-zero", "text-anchor": "middle" }, "0"));
    arrow(row ? "zeroA" : "zeroAp", X[0] + 8, y, X[1] - W / 2 - 8, y, "", 0, 0, "h", "neutral");
    arrow(row ? "zeroC" : "zeroCp", X[3] + W / 2 + 4, y, X[4] - 6, y, "", 0, 0, "h", "neutral");
  }
  for (const o of SL.OBJECTS) {
    const p = at(o.id), g = el("g", { class: "d-obj", "data-obj": o.id, "data-refs": `o:${o.id}` });
    g.append(el("rect", { x: p.x - W / 2, y: p.y - H / 2, width: W, height: H, rx: 14 }));
    g.append(el("text", { x: p.x - W / 2 + 12, y: p.y - H / 2 + 24, class: "lab" }, o.label));
    g.append(el("text", { x: p.x + W / 2 - 10, y: p.y - H / 2 + 22, "text-anchor": "end", class: "sub d-zero", style: "font-size:14px" }, ""));
    gObj.append(g);
  }
  const dynUnder = el("g", { class: "dyn-under" }), dyn = el("g", { class: "dyn" }), tok = el("g", { class: "toks" });
  svg.append(gSq, gMor, gObj, dynUnder, dyn, tok);
  svg._layers = { dynUnder, dyn, tok };
}

/* The view of the current state: what to place where, and what to highlight. */
function viewOf(state, extra = {}) {
  const used = SL.directHypotheses(state.uses || []);
  const dep = { objects: [], morphisms: [], squares: [] };
  for (const h of used) {
    const f = SL.hyp(h).flash;
    for (const k of Object.keys(dep)) dep[k].push(...(f[k] || []));
    if (h === "p-prime-surjective") dep.morphisms.push("zeroCp");
    if (h === "i-injective") dep.morphisms.push("zeroA");
  }
  return { state, tokens: state.tokens || [], trail: state.trail || [], regions: state.regions || [], focus: state.focus || {}, dep, used, snake: !!state.snake, sequence: !!state.sequence, example: !!state.example, ...extra };
}

function renderDiagram(svg, view, opts = {}) {
  if (!svg._layers) drawBase(svg);
  const off = new Set(opts.off || []);
  const { dynUnder, dyn, tok } = svg._layers;
  const on = (sel, attr, list, cls) => svg.querySelectorAll(sel).forEach((n) => n.classList.toggle(cls, (list || []).includes(n.getAttribute(attr))));
  on(".d-obj", "data-obj", view.focus.objects, "focus");
  on(".d-mor", "data-mor", view.focus.morphisms, "focus");
  on(".d-sq", "data-sq", view.focus.squares, "focus");
  on(".d-obj", "data-obj", view.dep.objects, "dep");
  on(".d-mor", "data-mor", view.dep.morphisms, "dep");
  on(".d-sq", "data-sq", view.dep.squares, "dep");
  // Broken hypotheses are marked on the structure they describe (not by colour alone: dashes and ✕).
  const brokenMor = [], brokenSq = [];
  if (off.has("p-prime-surjective")) brokenMor.push("zeroCp");
  if (off.has("i-injective")) brokenMor.push("zeroA");
  if (off.has("exact-at-B-prime")) brokenMor.push("ip");
  if (off.has("exact-at-B")) brokenMor.push("i");
  if (off.has("left-square-commutes")) brokenSq.push("left");
  if (off.has("right-square-commutes")) brokenSq.push("right");
  on(".d-mor", "data-mor", brokenMor, "broken");
  on(".d-sq", "data-sq", brokenSq, "broken");
  svg.querySelectorAll(".d-sq").forEach((g) => {
    const id = g.getAttribute("data-sq"), sq = SL.SQUARES.find((s) => s.id === id), broken = brokenSq.includes(id);
    g.querySelector(".sqsym").textContent = broken ? "✕" : "↻";
    g.querySelector(".sqlab").textContent = broken ? "does not commute" : (view.focus.squares || []).includes(id) || view.dep.squares.includes(id) ? sq.label : "";
  });
  svg.querySelectorAll(".d-obj").forEach((g) => { g.querySelector(".sub").textContent = view.example ? { Ap: "ℤ", Bp: "ℤ²", Cp: "ℤ", A: "ℤ", B: "ℤ²", C: "ℤ" }[g.getAttribute("data-obj")] : ""; });
  svg.querySelectorAll(".d-mor").forEach((g) => {
    const t = g.querySelector("text"), id = g.getAttribute("data-mor");
    if (t && SL.mor(id)) t.textContent = view.example ? ({ alpha: "α = 2", beta: "β", gamma: "γ = 0" }[id] || SL.mor(id).label) : SL.mor(id).label;
  });

  dynUnder.replaceChildren();
  dyn.replaceChildren();
  // regions inside objects: conceptual, not literal geometry
  for (const r of view.regions) {
    const R = REGIONS[r];
    if (!R) continue;
    const p = at(R.at), g = el("g", { class: `d-region${R.im ? " im" : ""}`, "data-refs": `o:${R.at}` });
    g.append(el("rect", { x: p.x - W / 2 + 6, y: p.y - 10, width: W - 12, height: 52, rx: 9 }));
    g.append(el("text", { x: p.x - W / 2 + 13, y: p.y + 4 }, R.label));
    dynUnder.append(g);
  }
  // kernel and cokernel terms (the snake's ends) appear only when the chase reaches them
  const showKer = view.snake || view.sequence, cokers = new Set();
  if (view.snake || view.sequence || view.regions.includes("coker-alpha")) cokers.add("coker-alpha");
  if (view.sequence) { cokers.add("coker-beta"); cokers.add("coker-gamma"); }
  for (const t of view.tokens) if (t.at.startsWith("coker")) cokers.add(SL.TERMS.find((x) => x.object === t.at.slice(5) && x.kind === "coker").id);
  const terms = SL.TERMS.filter((t) => (t.kind === "ker" ? showKer : cokers.has(t.id)));
  for (const t of terms) {
    const p = at(TERM_AT[t.id]), w = textW(t.label) + 8, g = el("g", { class: `d-term ${t.kind}`, "data-refs": `t:${t.id} o:${t.object}` });
    g.append(el("rect", { x: p.x - w / 2, y: p.y - 16, width: w, height: 32, rx: 16 }));
    g.append(el("text", { x: p.x, y: p.y + 5, "text-anchor": "middle" }, t.label));
    dynUnder.append(g);
  }
  if (view.sequence) for (const m of SL.SEQ_MAPS.filter((m) => !m.delta)) {
    const a = at(TERM_AT[m.from]), b = at(TERM_AT[m.to]);
    dyn.append(el("line", { x1: a.x + 44, y1: a.y, x2: b.x - 48, y2: b.y, stroke: "var(--muted)", "stroke-width": 1.5, "marker-end": "url(#arrow-neutral)" }));
  }
  // the snake: ker γ → C′ ← B′ ↓ B ← A → coker α, drawn only after the chase
  if (view.snake) {
    const pts = [[X[3], Y.ker + 17], [X[3], Y.top], [X[2], Y.top], [X[2], Y.bottom], [X[1], Y.bottom], [X[1], Y.coker - 18]];
    const path = el("path", { d: rounded(pts, 38), "marker-end": "url(#arrow-magenta)", class: "d-snake" + (opts.animate && !reduced() ? " draw" : "") });
    dyn.append(path);
    dyn.append(el("text", { x: X[2] - 22, y: (Y.top + Y.bottom) / 2 + 8, "text-anchor": "end", style: "font-size:26px;fill:var(--ink-magenta);font-style:italic;font-weight:700" }, "δ"));
    if (opts.animate && !reduced()) { try { path.style.setProperty("--len", String(Math.ceil(path.getTotalLength()))); } catch { path.classList.remove("draw"); } }
  }
  // trails: the arrows the last move travelled, styled by kind
  for (const tr of view.trail) dyn.append(...trailEls(tr));
  // tokens
  const placed = {}, nodes = [];
  view.tokens.forEach((t, n) => {
    const key = t.at, k = (placed[key] = (placed[key] ?? -1) + 1);
    const p = at(t.at), r = t.region && REGIONS[t.region] && REGIONS[t.region].at === t.at;
    const off = view.tokens.filter((u) => u.at === t.at).length;
    let x = p.x, y = r ? p.y + 24 : p.y + 6;
    if (t.at.startsWith("coker")) y = p.y;
    const live = view.tokens.filter((u) => u.at === t.at && !u.ghost).length;
    if (t.ghost && off > 1 && live) { x = p.x + 30; y = p.y - 26; }
    else if (live > 1) { x += [-24, 24][view.tokens.filter((u) => u.at === t.at && !u.ghost).indexOf(t)] ?? 0; y += t.second ? -22 : 6; }
    nodes.push({ t, x, y, main: n === view.tokens.findIndex((u) => !u.ghost) });
  });
  const keep = svg._mainTok;
  const tokNodes = [];
  for (const { t, x, y, main } of nodes) {
    let g;
    if (main && opts.persistent && keep) { g = keep; g.replaceChildren(); }
    else g = el("g");
    g.setAttribute("class", `d-tok${t.choice ? " choice" : ""}${t.quotient ? " quotient" : ""}${t.ghost ? " ghost" : ""}`);
    const w = textW(t.label) + 6;
    g.append(el("rect", { x: -w / 2, y: -14, width: w, height: 28, rx: 14 }));
    g.append(el("circle", { cx: -w / 2 + 12, cy: 0, r: 5 }));
    g.append(el("text", { x: 7, y: 5, "text-anchor": "middle" }, t.label));
    if (t.choice && !t.ghost && !t.region) g.append(el("text", { x: 0, y: 29, "text-anchor": "middle", class: "d-tag" }, "CHOICE"));
    if (!t.ghost) {
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `Element ${t.label}, in ${placeName(t.at)}. Show what is known about it.`);
      g.setAttribute("data-token", t.label);
      g.setAttribute("data-refs", `o:${t.at}`);
    }
    g.style.transform = `translate(${x}px, ${y}px)`;
    g.setAttribute("transform", `translate(${x} ${y})`);
    if (main && opts.persistent) svg._mainTok = g;
    tokNodes.push(g);
  }
  if (opts.persistent && keep && !tokNodes.includes(keep)) keep.remove();
  tok.replaceChildren(...tokNodes);
  const main = nodes.find((n) => n.main);
  if (opts.persistent && main) keepInView(svg, main.x);
}
/* On a narrow screen the diagram keeps its size and pans; bring the moving element into view. */
function keepInView(svg, x) {
  const box = svg.parentElement;
  try {
    if (!box || box.scrollWidth <= box.clientWidth + 1) return;
    const px = (x / 720) * svg.getBoundingClientRect().width, left = box.scrollLeft, w = box.clientWidth;
    if (px < left + 60 || px > left + w - 60) box.scrollTo({ left: Math.max(0, px - w / 2), behavior: reduced() ? "auto" : "smooth" });
  } catch { /* no layout */ }
}
function rounded(pts, r) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const a = Math.min(r, Math.hypot(x - px, y - py) / 2), b = Math.min(r, Math.hypot(nx - x, ny - y) / 2);
    const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(nx - x), vy = Math.sign(ny - y);
    d += ` L${x - ux * a},${y - uy * a} Q${x},${y} ${x + vx * b},${y + vy * b}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last[0]},${last[1]}`;
}
function trailEls(tr) {
  const a = at(tr.from), b = at(tr.to), out = [];
  const m = tr.via && SL.mor(tr.via);
  let x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y;
  const horiz = Math.abs(a.y - b.y) < 1;
  const sh = tr.kind === "lift" || tr.kind === "exact" || tr.kind === "correct" ? 12 : 0; // backwards moves run beside the arrow
  if (horiz) { const s = Math.sign(x2 - x1); x1 += s * (W / 2 + 6); x2 -= s * (W / 2 + 10); y1 += sh; y2 += sh; }
  else { const s = Math.sign(y2 - y1); y1 += s * (H / 2 + 6); y2 -= s * ((b.coker ? 18 : H / 2) + 10); x1 -= sh; x2 -= sh; }
  out.push(el("line", { x1, y1, x2, y2, class: `d-trail ${tr.kind}`, "marker-end": `url(#arrow-${{ lift: "yellow", correct: "yellow", exact: "green", quotient: "magenta" }[tr.kind] || "orange"})` }));
  const label = { lift: "lift", exact: "exactness", quotient: "quotient", correct: "correct", commute: "", apply: m ? `apply ${m.label}` : "" }[tr.kind];
  if (label) out.push(el("text", { x: (x1 + x2) / 2 + (horiz ? 0 : -10), y: (y1 + y2) / 2 + (horiz ? 18 : 4), "text-anchor": horiz ? "middle" : "end", class: "d-trail-lab", style: `fill:var(--ink-${{ lift: "yellow", exact: "green", quotient: "magenta", correct: "yellow", apply: "orange" }[tr.kind]})` }, label));
  return out;
}
const placeName = (id) => (id.startsWith("coker") ? `coker ${SL.mor({ A: "alpha", B: "beta", C: "gamma" }[id.slice(5)]).label}` : SL.obj(id).label);

/* ---------- what the current app state shows ---------- */
function seqInfo() {
  if (st.mode === "proof" || st.mode === "exact") {
    const seqId = SL.sequenceOf(st.id), steps = SL.SEQUENCES[seqId];
    let idx = steps.findIndex((s) => s.id === st.id);
    const blocked = SL.blockedAt(steps, st.off);
    if (blocked && idx >= blocked.index) idx = Math.max(0, blocked.index - 1);
    return { seqId, steps, idx, state: steps[idx], blocked };
  }
  return null;
}
function labView(lab) {
  const t = lab.token, last = lab.history.at(-1);
  const tokens = [{ at: t.obj, label: SL.show(t.x), choice: !!(last && last.choice), quotient: !!lab.quotient }];
  const trail = [];
  if (last) {
    const [kind, via] = last.op.split(".");
    if (kind === "apply") trail.push({ from: last.before.obj, to: last.after.obj, via, kind: "apply" });
    if (kind === "lift" || kind === "solve") trail.push({ from: last.before.obj, to: last.after.obj, via, kind: last.choice ? "lift" : "exact" });
    if (kind === "quotient") trail.push({ from: last.before.obj, to: last.after.obj, kind: "quotient" });
    if (last.before.obj !== last.after.obj) tokens.push({ at: last.before.obj, label: last.before.x, ghost: true });
  }
  const regions = [];
  for (const f of lab.facts) if (f.t === "in" && SL.show(f.x) === SL.show(t.x)) {
    const id = { "ker γ": "ker-gamma", "ker β": "ker-beta", "ker α": "ker-alpha", "ker p": "ker-p", "im i": "ker-p", "im β": "im-beta" }[f.set];
    if (id && REGIONS[id].at === t.obj && !regions.includes(id)) { regions.push(id); tokens[0].region = id; }
  }
  if (lab.quotient) regions.push("coker-alpha");
  const focus = { morphisms: last && last.op.includes(".") ? [last.op.split(".")[1]].filter((m) => SL.mor(m)) : [], squares: last && last.kind === "commute" ? SL.SQUARES.filter((s) => last.uses.includes(s.hyp)).map((s) => s.id) : [] };
  return { tokens, trail, regions, focus, uses: [], move: "lab", labUses: last ? last.uses : [] };
}

function currentState() {
  if (st.mode === "example") return SL.exampleState(st.c, st.k);
  if (st.mode === "lab") { const lab = SL.labReplay(st.start, st.ops, st.off); return { id: "lab", title: "Chase Lab", lab, ...labView(lab) }; }
  return seqInfo().state;
}

/* ---------- the main render ---------- */
let lastRendered = "";
function render(o = {}) {
  const info = seqInfo(), state = currentState();
  document.querySelectorAll("#modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === st.mode)));
  $("btn-break").setAttribute("aria-pressed", String(ui.brk || st.off.length > 0));
  $("break-panel").hidden = !(ui.brk || st.off.length > 0);
  $("btn-expert").setAttribute("aria-pressed", String(ui.expert));
  // diagram
  let view = viewOf(state, state.lab ? { dep: depOf(state.labUses) } : {});
  const key = SL.encodeHash(st);
  renderDiagram($("diagram"), view, { off: st.off, persistent: true, animate: key !== lastRendered && (state.id === "proof/delta") });
  lastRendered = key;
  $("diagram-desc").textContent = describe(view);
  $("diagram-text").textContent = describe(view);
  // step card
  renderModeControls();
  const kicker = { proof: "Guided proof", exact: info && SL.EXACT[info.seqId] ? SL.EXACT[info.seqId].title : "Exactness", example: "Worked example over ℤ", lab: "Chase Lab" }[st.mode];
  $("step-kicker").textContent = info ? `${kicker} · step ${info.idx + 1} of ${info.steps.length}` : kicker;
  $("step-title").textContent = state.title;
  $("objective").hidden = !(st.mode === "proof" && ["proof/start", "proof/lift", "proof/down", "proof/ask", "proof/commutativity", "proof/exactness"].includes(state.id));
  $("step-lead").textContent = state.lab ? "Click the element (or Tab to it) and choose a move. Only moves the hypotheses justify are offered; every new fact keeps its justification." : state.lead;
  $("step-badges").innerHTML = badges(state, view);
  $("algebra").innerHTML = (state.lab ? labAlgebra(state.lab) : state.tex.map((t) => SL.uni(t))).map((t) => `<div data-refs="${refsOf(t)}">${esc(t)}</div>`).join("") || `<div class="muted">—</div>`;
  const blocked = info && info.blocked && info.idx >= info.blocked.index - 1 ? info.blocked : null;
  $("blocked").hidden = !blocked;
  if (blocked) $("blocked").innerHTML = `<strong>${esc(blocked.message.split(".")[0])}.</strong> ${esc(blocked.message.slice(blocked.message.indexOf(".") + 1).trim())} <span class="small muted">Tick “${esc(SL.hyp(blocked.hypothesis).label)}” again to continue.</span>`;
  $("stepnav").hidden = !info;
  if (info) {
    $("btn-back").disabled = info.idx === 0;
    $("btn-next").disabled = info.idx >= info.steps.length - 1 || (blocked && info.idx >= blocked.index - 1);
    $("step-count").textContent = `${info.idx + 1} / ${info.steps.length}`;
    const next = info.steps[info.idx + 1];
    $("btn-next").textContent = next ? `Next: ${shortTitle(next)} →` : "End of this chase";
  }
  $("hint-text").hidden = !(ui.hint || ui.concept);
  if (ui.concept) $("hint-text").innerHTML = `<strong>${esc(ui.concept.label)}:</strong> ${esc(ui.concept.text)}`;
  else if (ui.hint && info) $("hint-text").textContent = hintFor(info);
  $("experiment").hidden = !(st.mode === "example" || ["proof/another-lift", "proof/well-defined"].includes(state.id));
  if (!$("experiment").hidden) renderExperiment();
  $("lab").hidden = st.mode !== "lab";
  if (st.mode === "lab") renderLab(state.lab);
  $("chase-list").innerHTML = chaseList(info, state);
  $("why-text").innerHTML = `<p>${esc(state.lab ? "Every move is generated from the diagram and the facts you have: a map can always be applied; going backwards needs surjectivity or a known image; exactness and commutativity add facts; a quotient forgets." : state.why || "")}</p>`;
  $("algebra-all").innerHTML = algebraSoFar(info, state).map((t) => `<div data-refs="${refsOf(t)}">${esc(t)}</div>`).join("") || "<div>—</div>";
  $("hyp-text").innerHTML = hypText(view);
  $("cat-text").innerHTML = `<p>${esc(SL.ABELIAN_NOTE)}</p><p class="small muted">In an abelian category the same argument runs with generalised elements, or by the Freyd–Mitchell embedding theorem for small abelian categories; the animation does not claim objects have points.</p>`;
  if (ui.expert) document.querySelectorAll("details.layer").forEach((d) => (d.open = true));
  $("trace").innerHTML = traceHtml(info, state);
  renderHyps();
  renderSequence(info);
  document.title = `${state.title} — Snake Lemma`;
  if (o.say !== false) announce(o.say || (blocked && info.idx === blocked.index - 1 && o.tried ? blocked.message : state.say || ""));
  if (o.focus && ui.kbd) $("step-title").focus();
}
const shortTitle = (s) => s.title.replace(/^Exactness at /, "").replace(/^Start with /, "start ").slice(0, 34);
function depOf(uses) {
  const dep = { objects: [], morphisms: [], squares: [] };
  for (const h of uses || []) { const f = SL.hyp(h).flash; for (const k of Object.keys(dep)) dep[k].push(...(f[k] || [])); }
  return dep;
}
function badges(state, view) {
  const b = [];
  const moveName = { given: "given", lift: "lift", apply: "apply a map", commute: "commutativity rewrite", exact: "exactness step", kernel: "kernel inference", quotient: "quotient", define: "definition", question: "question", setting: "setting", correct: "correct a lift", lab: "free chase" }[state.move];
  if (moveName) b.push(`<span class="badge">${esc(moveName)}</span>`);
  if (state.choice) b.push(`<span class="badge choice" title="This element is chosen, not computed">◆ CHOICE</span>`);
  if (state.move === "quotient") b.push(`<span class="badge quot" title="Information is deliberately being forgotten">▽ forgetting im α</span>`);
  if (state.move === "kernel" || state.move === "exact") b.push(`<span class="badge ker">✓ kernel condition</span>`);
  const used = state.lab ? state.labUses : view.used;
  for (const h of used || []) b.push(`<span class="badge uses" title="${esc(SL.hyp(h).statement)}">uses: ${esc(SL.hyp(h).label)}</span>`);
  return b.join(" ");
}
function hintFor(info) {
  const next = info.steps[info.idx + 1];
  if (!next) return "This chase is complete. Try the derived sequence below, or the Chase Lab.";
  const hs = SL.directHypotheses(next.uses);
  return `Next move: ${next.title}. ${hs.length ? `It is paid for by: ${hs.map((h) => `${SL.hyp(h).label} (${SL.hyp(h).statement})`).join("; ")}.` : "It needs no new hypothesis."}`;
}
function hypText(view) {
  const used = view.state.lab ? view.state.labUses : view.used;
  if (!used || !used.length) return `<p>No hypothesis is used by this move${view.state.move === "apply" ? ": applying a map is always allowed" : ""}.</p>`;
  return `<ul>${used.map((h) => { const H = SL.hyp(h); return `<li><strong>${esc(H.label)}</strong> (${esc(H.statement)}): without it, ${esc(H.need.replace(/^the /, "the "))} would fail.</li>`; }).join("")}</ul>`;
}
function chaseList(info, state) {
  if (state.lab) {
    const lab = state.lab, s = SL.LAB_STARTS[lab.start];
    return [`<li><span class="math">${esc(s.label)}</span></li>`, ...lab.history.map((h) => `<li><span class="mv">${esc({ apply: "→", lift: "←", exact: "⇒", kernel: "ⓘ", commute: "↻", quotient: "↓", inject: "⇒" }[h.kind] || "")} ${esc(h.label)}${h.choice ? " · CHOICE" : ""}</span><span class="math">${esc(h.after.x)} ∈ ${esc(placeName(h.after.obj))}</span></li>`)].join("");
  }
  if (!info) {
    const r = SL.Z.chase(st.c, st.k);
    return [["start", `c′ = ${SL.fmtInt(st.c)} ∈ ker γ = ℤ`], ["← choose lift · CHOICE", `b′ = ${SL.fmtPair(r.lift)}`], ["↓ β", `β(b′) = ${SL.fmtPair(r.image)} ∈ ker p`], ["← exactness", `a = ${SL.fmtInt(r.a)}`], ["↓ quotient", `[a] = [${r.coset}] ∈ ℤ/2ℤ`]]
      .map(([m, t]) => `<li><span class="mv">${esc(m)}</span><span class="math">${esc(t)}</span></li>`).join("");
  }
  const from = info.seqId === "proof" ? Math.min(2, info.idx) : 0;
  return info.steps.slice(from).map((s, j) => {
    const i = j + from, cls = i === info.idx ? "cur" : i > info.idx ? "future" : "";
    const tok = s.tokens.find((t) => !t.ghost), facts = s.facts.map(SL.uni);
    const what = facts.filter((f) => f.includes("∈")).at(-1) || (tok ? `${tok.label} ∈ ${placeName(tok.at)}${facts[0] ? ` · ${facts[0]}` : ""}` : s.title);
    return `<li class="${cls}"${i === info.idx ? ' aria-current="step"' : ""}><span class="mv">${esc(arrowOf(s.move))}</span><button type="button" data-goto="${esc(s.id)}"${i > info.idx ? ' tabindex="-1"' : ""}>${esc(i > info.idx ? s.title : what)}</button></li>`;
  }).join("");
}
const arrowOf = (k) => ({ given: "start", lift: "← choose lift · CHOICE", apply: "↓ apply", commute: "↻ commutativity", exact: "← exactness", kernel: "⇒ kernel inference", quotient: "↓ quotient", define: "≔ define", question: "?", setting: "setting", correct: "↺ correct the lift", inject: "⇒ injectivity" })[k] || k;
function algebraSoFar(info, state) {
  if (state.lab) return state.lab.facts.map((f) => SL.factText(f));
  if (!info) return state.tex.map(SL.uni);
  return info.steps.slice(0, info.idx + 1).flatMap((s) => s.tex.map(SL.uni));
}
function labAlgebra(lab) {
  const last = lab.history.at(-1);
  if (!last) return lab.facts.map((f) => SL.factText(f));
  return last.chain ? [last.chain.join(" = ")] : last.facts.map((id) => SL.factText(lab.facts.find((f) => f.id === id)));
}
function traceHtml(info, state) {
  if (state.lab) {
    const lab = state.lab, lines = ["INPUT", `  ${SL.LAB_STARTS[lab.start].label}`];
    lab.history.forEach((h, i) => {
      lines.push(`${i + 1}. ${h.choice ? "<span class=choice>CHOICE</span> " : ""}${esc(h.text)}`);
      lines.push(`<span class="reason">      reason: ${esc(h.uses.length ? h.uses.map((u) => SL.hyp(u).label).join(" + ") : ({ apply: "apply a map", kernel: "kernel inference", quotient: "quotient", lift: "a known image" }[h.kind] || h.kind))}</span>`);
    });
    const out = SL.labOutcome(lab);
    lines.push(out.done ? `RETURN\n  ${esc(out.text)}` : `GOAL\n  ${esc(out.text)}`);
    return lines.join("\n");
  }
  if (!info) {
    const r = SL.Z.chase(st.c, st.k);
    return esc([`INPUT\n  c′ = ${SL.fmtInt(st.c)}`, `1. choose b′ = ${SL.fmtPair(r.lift)} with p′(b′) = c′`, `      reason: p′ surjective (k = ${SL.fmtInt(st.k)} is the choice)`, `2. compute β(b′) = ${SL.fmtPair(r.image)}`, `3. p(β(b′)) = 0 = γ(c′)`, `      reason: commutativity + γ = 0`, `4. solve i(a) = β(b′): a = ${SL.fmtInt(r.a)}`, `      reason: exactness`, `5. return [${SL.fmtInt(r.a)}] = [${r.coset}] ∈ ℤ/2ℤ`].join("\n"));
  }
  const t = SL.trace(info.steps, info.idx), first = info.steps[0];
  const lines = ["INPUT", ...(first.facts.length ? first.facts.map((f) => `  ${esc(SL.uni(f))}`) : [`  ${esc(first.title)}`])];
  t.forEach((x, i) => {
    lines.push(`${i + 1}. ${x.choice ? "<span class=choice>CHOICE</span> " : ""}${esc(x.text)}`);
    lines.push(`<span class="reason">      reason: ${esc(x.reason)}${x.hypotheses.length ? ` [${esc(x.hypotheses.join(", "))}]` : ""}</span>`);
  });
  const next = info.steps[info.idx + 1];
  if (next) lines.push(`<span class="reason">… next: ${esc(next.title)}</span>`);
  else if (info.seqId === "proof") lines.push("RETURN\n  δ : ker γ → coker α, well defined");
  return lines.join("\n");
}
function refsOf(text) {
  const t = String(text), r = new Set();
  const rules = [[/γ/, "m:gamma"], [/β/, "m:beta"], [/α/, "m:alpha"], [/p′/, "m:pp"], [/i′/, "m:ip"], [/(^|[^a-z])p\(/, "m:p"], [/(^|[^a-z])i\(/, "m:i"], [/c′/, "o:Cp"], [/b′/, "o:Bp"], [/a′/, "o:Ap"], [/(^|[^′])\ba[₁₂]?\b(?!′)/, "o:A"],
    [/ker γ/, "t:ker-gamma"], [/ker β/, "t:ker-beta"], [/ker α/, "t:ker-alpha"], [/coker α/, "t:coker-alpha"], [/coker β/, "t:coker-beta"], [/coker γ/, "t:coker-gamma"]];
  for (const [re, ref] of rules) if (re.test(t)) r.add(ref);
  return [...r].join(" ");
}
function describe(view) {
  const parts = ["Fixed diagram: top row 0 → A′ → B′ → C′ → 0 (maps i′, p′), bottom row 0 → A → B → C → 0 (maps i, p), vertical maps α, β, γ."];
  const main = view.tokens.find((t) => !t.ghost);
  if (main) parts.push(`Element ${main.label} sits in ${placeName(main.at)}${main.region ? `, inside ${REGIONS[main.region].label}` : ""}${main.choice ? " (a chosen lift)" : ""}.`);
  const ghosts = view.tokens.filter((t) => t.ghost);
  if (ghosts.length) parts.push(`Earlier: ${ghosts.map((g) => `${g.label} in ${placeName(g.at)}`).join(", ")}.`);
  for (const tr of view.trail) parts.push(`Move: ${{ lift: "lifted backwards", exact: "moved backwards by exactness", apply: "applied", quotient: "passed to the quotient", commute: "rewrote around the square", correct: "corrected" }[tr.kind]} from ${placeName(tr.from)} to ${placeName(tr.to)}${tr.via ? ` along ${SL.mor(tr.via).label}` : ""}.`);
  if (view.focus.squares && view.focus.squares.length) parts.push(`Highlighted: the ${view.focus.squares.join(" and ")} square.`);
  if (view.snake) parts.push("The snake path from ker γ through C′, B′, B and A to coker α is drawn: it is δ.");
  if (st.off.length) parts.push(`Switched off: ${st.off.map((h) => SL.hyp(h).label).join(", ")}.`);
  return parts.join(" ");
}
function announce(text) { const l = $("live"); l.textContent = ""; if (text) setTimeout(() => { l.textContent = text; }, 30); }

/* ---------- mode controls ---------- */
function renderModeControls() {
  const box = $("mode-controls");
  if (st.mode === "exact") {
    const seq = SL.sequenceOf(st.id), E = SL.EXACT[seq];
    box.innerHTML = `<div class="seg" role="group" aria-label="Exact at">${SL.JUNCTIONS.map((j) => `<button type="button" data-seq="${j.seq}" aria-pressed="${j.seq === seq}">${esc(j.label)}</button>`).join("")}</div>
      <p class="small"><strong>Claim:</strong> <span class="math">${esc(SL.uni(E.claim))}</span></p>
      <details class="layer"><summary>The easy inclusion</summary><div><p>${esc(E.easy)}</p></div></details>`;
  } else if (st.mode === "example") {
    box.innerHTML = `<p class="small">Rows <span class="math">0 → ℤ → ℤ² → ℤ → 0</span>, <span class="math">i(a) = (a, 0)</span>, <span class="math">p(a, c) = c</span>; <span class="math">α(a) = 2a</span>, <span class="math">γ(c) = 0</span>, <span class="math">β(a, c) = (2a + c, 0)</span>.</p>
      <p class="small" id="z-check"></p>
      <div class="row"><label for="c-input"><strong>c′</strong></label><select id="c-input">${range(SL.Z.C).map((c) => `<option value="${c}"${c === st.c ? " selected" : ""}>${SL.fmtInt(c)}</option>`).join("")}</select>
      <label for="k-input"><strong>lift parameter k</strong> <span class="math" id="k-read">${SL.fmtInt(st.k)}</span></label></div>
      <input type="range" id="k-input" min="${SL.Z.K[0]}" max="${SL.Z.K[1]}" step="1" value="${st.k}" aria-describedby="k-help">
      <div class="ticks" aria-hidden="true">${range(SL.Z.K).map((k) => `<span>${SL.fmtInt(k)}</span>`).join("")}</div>
      <p class="tiny muted" id="k-help">Arrow keys change k by one; the lift is (k, c′). No dragging needed.</p>
      <table><thead><tr><th>lift</th><th>endpoint</th><th>coset</th></tr></thead><tbody><tr><td class="math" id="z-lift"></td><td class="math" id="z-end"></td><td class="math" id="z-coset"></td></tr></tbody></table>`;
    const r = SL.Z.chase(st.c, st.k);
    $("z-lift").textContent = SL.fmtPair(r.lift); $("z-end").textContent = SL.fmtInt(r.a); $("z-coset").textContent = `[${r.coset}]`;
    $("z-check").textContent = zCheck();
  } else if (st.mode === "proof") {
    box.innerHTML = "";
  } else box.innerHTML = "";
}
const range = ([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
let zCheckText = "";
function zCheck() {
  if (zCheckText) return zCheckText;
  const Z = SL.Z; let n = 0, ok = true;
  for (const a of range([-6, 6])) for (const c of range([-6, 6])) {
    n++;
    if (Z.p(Z.beta([a, c])) !== Z.gamma(Z.p([a, c]))) ok = false;
  }
  for (const a of range([-6, 6])) { const l = Z.beta(Z.i(a)), r = Z.i(Z.alpha(a)); if (l[0] !== r[0] || l[1] !== r[1]) ok = false; }
  return (zCheckText = ok ? `Checked here on ${n} pairs: p∘β = γ∘p′ and β∘i′ = i∘α. Both squares commute.` : "A square fails to commute.");
}

/* ---------- the lift experiment: Raw A vs mod out by im α ---------- */
function renderExperiment() {
  const ks = SL.LIFT_ORDER.slice(0, st.lifts), c = st.c, mod = st.view === "mod";
  const cur = st.mode === "example" ? st.k : null;
  const all = [...new Set([...ks, ...(cur !== null ? [cur] : [])])];
  const done = st.lifts >= 2 && mod;
  const xs = (n) => 20 + (n + 13) * 26.15;
  const dots = all.map((k, i) => {
    const a = 2 * k + c, odd = Math.abs(a) % 2 === 1, tx = mod ? (odd ? 470 : 250) + ((i % 6) - 2.5) * 2 : xs(a), ty = mod ? 122 : 40;
    return `<g class="nl-dot ${odd ? "odd" : "even"}" style="transform:translate(${tx}px,${ty}px)" transform="translate(${tx} ${ty})"><circle r="${k === cur ? 8 : 6}"/>${mod ? "" : `<text y="-12" text-anchor="middle" class="nl-num" style="fill:var(--text)">a${sub(i + 1)}</text>`}</g>`;
  }).join("");
  const ticks = range([-13, 13]).map((n) => `<line class="nl-tick" x1="${xs(n)}" x2="${xs(n)}" y1="52" y2="${n % 2 ? 62 : 58}" style="stroke:${Math.abs(n) % 2 ? "var(--magenta)" : "var(--cyan)"}"/><text class="nl-num" x="${xs(n)}" y="76" text-anchor="middle">${n < 0 ? "−" + -n : n}</text>`).join("");
  const svg = `<svg viewBox="0 0 720 ${mod ? 156 : 104}" role="img" aria-label="${esc(mod ? `Mod out by im α: all ${all.length} endpoints collapse onto the class [${SL.Z.mod2(c)}] in ℤ/2ℤ.` : `Raw A: endpoints ${all.map((k) => 2 * k + c).join(", ")} are different integers.`)}">
    <line x1="14" x2="706" y1="52" y2="52" stroke="var(--rule)"/>${ticks}
    <text x="14" y="96" class="nl-num">A = ℤ · odd integers ┆ magenta, even ┆ cyan · im α = 2ℤ (the even integers)</text>
    ${mod ? `<g><circle cx="250" cy="122" r="18" fill="none" stroke="var(--cyan)" stroke-width="2"/><text x="250" y="148" text-anchor="middle" class="nl-cls">[0]</text><circle cx="470" cy="122" r="18" fill="none" stroke="var(--magenta)" stroke-width="2"/><text x="470" y="148" text-anchor="middle" class="nl-cls">[1]</text><text x="600" y="126" class="nl-num">coker α = ℤ/2ℤ</text></g>` : ""}
    ${dots}</svg>`;
  const rows = all.map((k, i) => `<tr><td>a${sub(i + 1)}</td><td class="math">${SL.fmtInt(k)}</td><td class="math">${SL.fmtPair([k, c])}</td><td class="math">${SL.fmtInt(2 * k + c)}</td><td class="math">[${SL.Z.mod2(2 * k + c)}]</td></tr>`).join("");
  $("experiment").innerHTML = `<div class="exp"><h3>Try another lift</h3>
    <p class="small">${st.mode === "example" ? "" : "Modelled in the ℤ example (A = ℤ, im α = 2ℤ, c′ = " + SL.fmtInt(c) + "). "}Each lift (k, c′) of c′ gives the endpoint a = 2k + c′.</p>
    <div class="row"><div class="seg" role="group" aria-label="Endpoint view"><button type="button" data-view="raw" aria-pressed="${!mod}">Raw A</button><button type="button" data-view="mod" aria-pressed="${mod}">Mod out by im α</button></div>
    <button type="button" id="btn-more" ${st.lifts >= SL.LIFT_ORDER.length ? "disabled" : ""}>Try another lift</button><button type="button" id="btn-fewer" ${st.lifts <= 1 ? "disabled" : ""}>Reset lifts</button></div>
    <div class="numline">${svg}</div>
    <p class="small"><strong>${mod ? "Mod out by im α:" : "Raw A:"}</strong> ${mod ? `all ${all.length} endpoint${all.length > 1 ? "s" : ""} represent the same coset [${SL.Z.mod2(c)}].` : `different choices give different endpoints: ${all.map((k) => SL.fmtInt(2 * k + c)).join(", ")}.`} Different lifts differ by exactly the information killed by the cokernel.</p>
    <details class="layer"><summary>Table of lifts tried</summary><div><table><thead><tr><th></th><th>k</th><th>lift</th><th>endpoint</th><th>coset</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    ${done ? `<p class="lesson" role="status">noncanonical choice\n+\nquotient by its ambiguity\n=\ncanonical morphism</p>` : `<p class="tiny muted">Try at least two lifts, then switch to “Mod out by im α”.</p>`}</div>`;
}
const sub = (n) => String(n).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[d]).join("");

/* ---------- the Chase Lab ---------- */
function renderLab(lab) {
  const { moves, blocked } = SL.labMoves(lab, st.off), out = SL.labOutcome(lab), t = lab.token, E = SL.show(t.x);
  const about = lab.facts.filter((f) => SL.factText(f).includes(E));
  const others = lab.facts.filter((f) => !about.includes(f));
  const factLi = (f) => {
    const open = ui.openFact === f.id;
    const chain = open ? SL.justification(lab, f.id) : [];
    return `<li><button type="button" data-fact="${f.id}" aria-expanded="${open}">${esc(SL.factText(f))}</button>${open ? `<ol class="just">${chain.map((c) => `<li><span class="math">${esc(c.text)}</span> <span class="muted">— ${esc(c.why)}${c.uses.length ? ` [${esc(c.uses.join(", "))}]` : ""}</span></li>`).join("")}</ol>` : ""}</li>`;
  };
  $("lab").innerHTML = `<div class="row"><label for="lab-start"><strong>Start from</strong></label><select id="lab-start">${SL.LAB_START_IDS.map((id) => `<option value="${id}"${id === lab.start ? " selected" : ""}>${esc(SL.LAB_STARTS[id].label)}</option>`).join("")}</select>
      <button type="button" id="lab-undo" ${lab.ops.length ? "" : "disabled"}>Undo</button><button type="button" id="lab-reset" ${lab.ops.length ? "" : "disabled"}>Reset chase</button><button type="button" id="lab-export">Export this chase</button></div>
    <p class="tiny muted">${esc(SL.LAB_STARTS[lab.start].text)}. Goal: ${esc(SL.LAB_STARTS[lab.start].goal)}</p>
    <div class="exp" style="border-color:var(--orange)"><h3 id="lab-token-h" tabindex="-1">Element: <span class="math">${esc(E)}</span></h3>
      <p class="small"><strong>Lives in:</strong> ${esc(placeName(t.obj))}</p>
      <p class="small"><strong>Known</strong> (select a fact to see its justification):</p><ul class="facts">${about.map(factLi).join("") || "<li class=muted>nothing yet</li>"}</ul>
      ${others.length ? `<details class="layer"><summary>Other facts (${others.length})</summary><div><ul class="facts">${others.map(factLi).join("")}</ul></div></details>` : ""}
      <p class="small"><strong>${out.done ? "Done:" : "Goal:"}</strong> ${esc(out.text)}</p></div>
    <p class="status" id="lab-status" role="status">${ui.labMsg ? `Last move: ${esc(ui.labMsg)}` : ""}</p>
    <h3>Possible moves</h3>
    <div class="moves" role="group" aria-label="Legal moves">${moves.map((m) => `<button type="button" data-move="${esc(m.id)}"><span class="glyph" aria-hidden="true">${esc(m.arrow)}</span><span>${esc(m.label)}${m.choice ? " · CHOICE" : ""}<span class="why">${esc(m.uses.length ? `uses ${m.uses.map((u) => SL.hyp(u).label).join(", ")}` : { apply: "always allowed", kernel: "from a known zero", quotient: "forgets im of the vertical map", lift: "from a known image", exact: "from a known image" }[m.kind] || "")}</span></span></button>`).join("") || `<p class="muted small">No move leaves here.</p>`}</div>
    ${blocked.length ? `<details class="layer"><summary>Moves not available yet (${blocked.length})</summary><div><ul class="small">${blocked.map((b) => `<li><strong>${esc(b.label)}</strong>: ${esc(b.reason)}</li>`).join("")}</ul></div></details>` : ""}
    <details class="layer" id="challenges"><summary>Challenges</summary><div>${challengesHtml(lab)}</div></details>`;
}
function challengesHtml(lab) {
  return SL.CHALLENGES.map((c) => {
    let body = "";
    if (c.kind === "choose") {
      const ans = ui.answers[c.id], resp = ans ? SL.challengeResponse(c.id, ans) : null;
      body = `<div class="row" role="group" aria-label="${esc(c.title)}">${c.options.map((o) => `<button type="button" data-ch="${c.id}" data-ans="${esc(o)}" aria-pressed="${ans === o}">${esc(SL.HYP_IDS.includes(o) ? SL.hyp(o).label : SL.uni(o))}</button>`).join("")}</div>${resp ? `<p class="resp${resp.justified ? " yes" : ""}" role="status">${esc(resp.text)}</p>` : ""}`;
    } else if (c.kind === "lab") {
      const done = lab.start === c.start && SL.labOutcome(lab).done;
      body = `<p class="small">${done ? "Reached: " + esc(SL.labOutcome(lab).text) : esc(c.hint)}</p>${lab.start !== c.start || lab.ops.length ? `<button type="button" data-ch-lab="${c.start}">Set up in the lab</button>` : ""}`;
    } else {
      const done = ui.visited.has(c.state);
      body = `<p class="small">${done ? "You have followed this chase." : esc(c.hint)}</p><button type="button" data-ch-go="${esc(c.state)}">Go there</button>`;
    }
    return `<div class="challenge"><strong>${esc(c.title)}</strong>${body}</div>`;
  }).join("");
}

/* ---------- hypotheses and the derived sequence ---------- */
function renderHyps() {
  const off = new Set(st.off);
  $("hyps").innerHTML = SL.HYPOTHESES.map((h) => `<label><input type="checkbox" data-hyp="${h.id}"${off.has(h.id) ? "" : " checked"}><span class="${off.has(h.id) ? "off" : ""}">${esc(h.label)}<small>${esc(h.statement)}</small></span></label>`).join("");
}
function renderSequence(info) {
  const constructed = st.mode !== "proof" || (info && info.idx >= SL.PROOF.findIndex((s) => s.id === "proof/delta"));
  const activeSeq = st.mode === "exact" ? SL.sequenceOf(st.id) : null;
  const z = st.mode === "example";
  const parts = [];
  SL.TERMS.forEach((t, i) => {
    const j = SL.JUNCTIONS.find((x) => x.term === t.id);
    const zz = z ? SL.Z_SEQUENCE.find((x) => x.term === t.id) : null;
    parts.push(`<button type="button" class="term ${t.kind}${j ? " junction" : ""}${j && j.seq === activeSeq ? " active" : ""}" data-term="${t.id}" data-refs="t:${t.id} o:${t.object}" aria-label="${esc(t.label)}${j ? `: prove exactness here (${j.question})` : ""}">${esc(t.label)}${zz ? `<small>${esc(zz.value)}</small>` : j ? "<small>exact?</small>" : ""}</button>`);
    const m = SL.SEQ_MAPS[i];
    if (m) parts.push(m.delta ? `<span class="arr delta${constructed ? "" : " pending"}" aria-label="${constructed ? "delta" : "delta, not constructed yet"}" data-refs="t:ker-gamma t:coker-alpha">${constructed ? "—δ→" : "—?→"}</span>` : `<span class="arr" aria-hidden="true">→</span>`);
  });
  $("seqstrip").innerHTML = parts.join("");
  const note = activeSeq ? SL.JUNCTIONS.find((j) => j.seq === activeSeq).question : constructed ? "Select a junction (ker β, ker γ, coker α, coker β) to start its exactness chase." : "δ appears here once the chase constructs it.";
  $("seq-note").textContent = ui.seqNote || note;
  ui.seqNote = "";
}

/* ---------- navigation ---------- */
function go(next, o = {}) {
  if (ui.present) endPresent();
  st = SL.normalize(next);
  if (st.id && st.mode !== "lab") ui.visited.add(st.id);
  const h = SL.encodeHash(st);
  try {
    if (location.hash !== h) { if (o.replace) history.replaceState(null, "", h); else history.pushState(null, "", h); }
  } catch { try { if (location.hash !== h) location.hash = h; } catch { /* sandboxed: state still renders */ } }
  ui.hint = false;
  if (!o.keepConcept) ui.concept = null;
  render(o);
}
function step(d) {
  const info = seqInfo();
  if (!info) return;
  const i = info.idx + d;
  if (i < 0 || i >= info.steps.length) return;
  if (d > 0 && info.blocked && i >= info.blocked.index) { announce(info.blocked.message); render({ say: info.blocked.message }); return; }
  go({ ...st, id: info.steps[i].id }, { focus: false });
}
function setMode(mode) {
  if (mode === st.mode) return;
  const target = { proof: { mode: "proof", id: "proof/start" }, exact: { mode: "exact", id: "exact/ker-gamma/start" }, example: { mode: "example" }, lab: { mode: "lab", ops: [] } }[mode];
  go({ ...st, ...target }, { focus: true });
}

/* ---------- events ---------- */
document.addEventListener("keydown", (e) => { if (!e.metaKey && !e.ctrlKey) ui.kbd = true; }, true);
document.addEventListener("pointerdown", () => { ui.kbd = false; }, true);
$("modes").addEventListener("click", (e) => { const b = e.target.closest("button[data-mode]"); if (b) setMode(b.dataset.mode); });
$("btn-back").addEventListener("click", () => step(-1));
$("btn-next").addEventListener("click", () => step(1));
$("btn-hint").addEventListener("click", () => { ui.hint = !ui.hint; ui.concept = null; render({ say: false }); if (ui.hint) announce($("hint-text").textContent); });
$("btn-break").addEventListener("click", () => { ui.brk = !(ui.brk || st.off.length); if (!ui.brk && st.off.length) { go({ ...st, off: [] }, { replace: true }); return; } render({ say: false }); if (ui.brk) $("hyps").querySelector("input").focus(); });
$("btn-expert").addEventListener("click", () => { ui.expert = !ui.expert; if (!ui.expert) document.querySelectorAll("details.layer").forEach((d) => (d.open = false)); render({ say: false }); });
$("btn-full").addEventListener("click", () => { $("full-proof").scrollIntoView({ behavior: reduced() ? "auto" : "smooth" }); $("doc-h").setAttribute("tabindex", "-1"); $("doc-h").focus(); });
$("hyps").addEventListener("change", (e) => {
  const h = e.target.dataset.hyp; if (!h) return;
  const off = new Set(st.off); e.target.checked ? off.delete(h) : off.add(h);
  ui.brk = true;
  go({ ...st, off: [...off] }, { replace: true });
  const info = seqInfo();
  if (info && info.blocked) announce(info.blocked.message);
});
$("chase-list").addEventListener("click", (e) => { const b = e.target.closest("button[data-goto]"); if (b) go({ ...st, id: b.dataset.goto }); });
$("mode-controls").addEventListener("click", (e) => { const b = e.target.closest("button[data-seq]"); if (b) go({ ...st, mode: "exact", id: SL.EXACT[b.dataset.seq].steps[0].id }, { focus: true }); });
$("mode-controls").addEventListener("input", (e) => {
  if (e.target.id === "k-input") { st = SL.normalize({ ...st, k: e.target.value }); updateExample(); }
});
$("mode-controls").addEventListener("change", (e) => {
  if (e.target.id === "k-input") go({ ...st, k: e.target.value }, { replace: true, say: `Lift parameter ${e.target.value}.` });
  if (e.target.id === "c-input") go({ ...st, c: e.target.value }, { replace: true });
});
/* The slider updates only what changes (lift and endpoint), so focus and the thumb stay put. */
function updateExample() {
  const r = SL.Z.chase(st.c, st.k);
  $("k-read").textContent = SL.fmtInt(st.k);
  $("z-lift").textContent = SL.fmtPair(r.lift); $("z-end").textContent = SL.fmtInt(r.a); $("z-coset").textContent = `[${r.coset}]`;
  const state = SL.exampleState(st.c, st.k);
  renderDiagram($("diagram"), viewOf(state), { off: st.off, persistent: true });
  $("algebra").innerHTML = state.tex.map((t) => `<div data-refs="${refsOf(SL.uni(t))}">${esc(SL.uni(t))}</div>`).join("");
  $("chase-list").innerHTML = chaseList(null, state);
  $("trace").innerHTML = traceHtml(null, state);
  renderExperiment();
  try { history.replaceState(null, "", SL.encodeHash(st)); } catch { /* sandboxed */ }
  announce(`Lift (${st.k}, ${st.c}). Endpoint ${2 * st.k + st.c}. Class ${r.coset}.`);
}
$("experiment").addEventListener("click", (e) => {
  const v = e.target.closest("button[data-view]");
  if (v) { go({ ...st, view: v.dataset.view }, { replace: true, say: v.dataset.view === "mod" ? `Mod out by im alpha: every endpoint is the class ${SL.Z.mod2(st.c)}.` : "Raw A: different lifts give different endpoints." }); $("experiment").querySelector(`button[data-view="${v.dataset.view}"]`).focus(); return; }
  if (e.target.id === "btn-more") { go({ ...st, lifts: st.lifts + 1 }, { replace: true, say: `Lift ${st.lifts + 1}: endpoint ${2 * SL.LIFT_ORDER[st.lifts] + st.c}.` }); const b = $("btn-more"); if (b && !b.disabled) b.focus(); return; }
  if (e.target.id === "btn-fewer") { go({ ...st, lifts: 1 }, { replace: true }); $("btn-more").focus(); }
});
$("lab").addEventListener("click", (e) => {
  const m = e.target.closest("button[data-move]");
  if (m) {
    const next = SL.labApply(SL.labReplay(st.start, st.ops, st.off), m.dataset.move, st.off);
    if (!next) return;
    ui.labMsg = next.history.at(-1).text;
    go({ ...st, ops: next.ops }, { say: `${next.history.at(-1).label}. ${next.history.at(-1).text}` });
    if (ui.kbd) { const h = $("lab-token-h"); if (h) h.focus(); }
    return;
  }
  const f = e.target.closest("button[data-fact]");
  if (f) { ui.openFact = ui.openFact === f.dataset.fact ? null : f.dataset.fact; render({ say: false }); const again = $("lab").querySelector(`button[data-fact="${f.dataset.fact}"]`); if (again) again.focus(); return; }
  if (e.target.id === "lab-undo") { ui.labMsg = "Undid the last move."; go({ ...st, ops: st.ops.slice(0, -1) }); $("lab-undo").focus(); return; }
  if (e.target.id === "lab-reset") { ui.labMsg = "Chase reset."; go({ ...st, ops: [] }); return; }
  if (e.target.id === "lab-export") { openExport("lab"); return; }
  const ch = e.target.closest("button[data-ch]");
  if (ch) { ui.answers[ch.dataset.ch] = ch.dataset.ans; render({ say: SL.challengeResponse(ch.dataset.ch, ch.dataset.ans).text }); const again = $("lab").querySelector(`button[data-ch="${ch.dataset.ch}"][data-ans="${CSS.escape(ch.dataset.ans)}"]`); if (again) again.focus(); return; }
  const cl = e.target.closest("button[data-ch-lab]");
  if (cl) { go({ ...st, mode: "lab", start: cl.dataset.chLab, ops: [] }, { focus: true }); return; }
  const cg = e.target.closest("button[data-ch-go]");
  if (cg) { const s = cg.dataset.chGo; go({ ...st, mode: s.startsWith("exact/") ? "exact" : "proof", id: s, view: s === "proof/well-defined" ? st.view : st.view }, { focus: true }); }
});
$("lab").addEventListener("change", (e) => { if (e.target.id === "lab-start") go({ ...st, start: e.target.value, ops: [] }, { focus: true }); });
$("seqstrip").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-term]"); if (!b) return;
  const j = SL.JUNCTIONS.find((x) => x.term === b.dataset.term);
  if (j) { go({ ...st, mode: "exact", id: SL.EXACT[j.seq].steps[0].id }, { focus: true }); return; }
  ui.seqNote = b.dataset.term === "ker-alpha" ? "At ker α the sequence starts: ker α → ker β is injective because i′ is. No chase is needed." : "At coker γ the sequence ends: coker β → coker γ is onto because p is. No chase is needed.";
  render({ say: ui.seqNote });
});

/* token tooltip: where the element lives, and what is known about it */
function tokenFacts(label) {
  const info = seqInfo();
  if (st.mode === "lab") { const lab = SL.labReplay(st.start, st.ops, st.off); return lab.facts.filter((f) => SL.factText(f).includes(label)).map((f) => SL.factText(f)); }
  if (!info) return SL.exampleState(st.c, st.k).facts.map(SL.uni);
  return info.steps.slice(0, info.idx + 1).flatMap((s) => s.facts.map(SL.uni)).filter((f) => f.includes(label.replace(/[₁₂]/g, "")) || f.includes(label));
}
function showTip(g) {
  const label = g.getAttribute("data-token"), tok = currentState().tokens.find((t) => t.label === label && !t.ghost) || { at: "Cp" };
  const facts = tokenFacts(label);
  const therefore = facts.filter((f) => /∈/.test(f)).slice(-1)[0];
  const tip = $("tip");
  tip.innerHTML = `<dl><dt>Element</dt><dd class="math">${esc(label)}</dd><dt>Lives in</dt><dd>${esc(placeName(tok.at))}</dd><dt>Known</dt><dd class="math">${facts.filter((f) => f !== therefore).map(esc).join("<br>") || "—"}</dd>${therefore ? `<dt>Therefore</dt><dd class="math">${esc(therefore)}</dd>` : ""}</dl>`;
  tip.hidden = false;
  const r = g.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(window.innerWidth - 320, r.left + window.scrollX))}px`;
  tip.style.top = `${r.bottom + window.scrollY + 8}px`;
}
const hideTip = () => { $("tip").hidden = true; };
$("diagram").addEventListener("pointerover", (e) => { const g = e.target.closest(".d-tok[data-token]"); if (g) showTip(g); });
$("diagram").addEventListener("pointerout", (e) => { if (e.target.closest(".d-tok[data-token]")) hideTip(); });
$("diagram").addEventListener("focusin", (e) => { const g = e.target.closest(".d-tok[data-token]"); if (g) showTip(g); });
$("diagram").addEventListener("focusout", hideTip);
$("diagram").addEventListener("click", (e) => {
  const g = e.target.closest(".d-tok[data-token]");
  if (g && st.mode === "lab") { const b = $("lab").querySelector("button[data-move]"); if (b) b.focus(); announce("Moves for this element are listed under Possible moves."); }
});
$("diagram").addEventListener("keydown", (e) => {
  const g = e.target.closest(".d-tok[data-token]");
  if (!g || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  if (st.mode === "lab") { const b = $("lab").querySelector("button[data-move]"); if (b) b.focus(); } else { showTip(g); announce($("tip").textContent); }
});

/* hovering one representation highlights the matching parts of the other two */
function linkFrom(node) {
  document.querySelectorAll(".linked").forEach((n) => n.classList.remove("linked"));
  const src = node && node.closest && node.closest("[data-refs]");
  if (!src) return;
  const refs = new Set(src.getAttribute("data-refs").split(" ").filter(Boolean));
  if (!refs.size) return;
  document.querySelectorAll("[data-refs]").forEach((n) => { if (n !== src && n.getAttribute("data-refs").split(" ").some((r) => refs.has(r))) n.classList.add("linked"); });
}
document.addEventListener("pointerover", (e) => linkFrom(e.target));
document.addEventListener("focusin", (e) => linkFrom(e.target));

/* ---------- command palette (⌘K / Ctrl+K) ---------- */
let palItems = [], palSel = 0, palReturn = null;
function openPalette() {
  palReturn = document.activeElement;
  $("palette-input").value = "";
  $("palette-concept").hidden = true;
  filterPalette();
  try { $("palette").showModal(); } catch { $("palette").setAttribute("open", ""); }
  $("palette-input").focus();
}
function closePalette() { try { $("palette").close(); } catch { $("palette").removeAttribute("open"); } }
function filterPalette() {
  const q = $("palette-input").value.trim().toLowerCase();
  const all = [...SL.COMMANDS.map((c) => ({ ...c, type: "command" })), ...SL.CONCEPTS.map((c) => ({ ...c, type: "concept" }))];
  palItems = all.filter((c) => !q || c.label.toLowerCase().includes(q) || (c.text || "").toLowerCase().includes(q));
  palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
  $("palette-list").innerHTML = palItems.map((c, i) => `<li role="option" id="pal-${i}" aria-selected="${i === palSel}" data-i="${i}"><span>${esc(c.label)}</span><small>${c.type}</small></li>`).join("") || `<li role="option" aria-disabled="true">No match. Try “lift”, “cokernel”, “exactness”.</li>`;
  $("palette-input").setAttribute("aria-activedescendant", palItems.length ? `pal-${palSel}` : "");
}
function runItem(c) {
  closePalette();
  if (c.type === "concept") {
    ui.concept = c;
    if (c.action === "abelian") { $("abelian-note").open = true; render({ say: c.text }); return; }
    go(SL.decodeHash(c.hash), { focus: true, keepConcept: true, say: `${c.label}: ${c.text}` });
    return;
  }
  if (c.hash) { go(SL.decodeHash(c.hash), { focus: true }); return; }
  if (c.action === "another-lift") { const base = st.id === "proof/well-defined" || st.id === "proof/another-lift" || st.mode === "example" ? st : { ...st, mode: "proof", id: "proof/another-lift" }; go({ ...base, lifts: Math.min(SL.LIFT_ORDER.length, base.lifts + 1) }, { focus: true }); return; }
  if (c.action === "hypotheses") { ui.brk = true; render({ say: "Hypotheses: " + SL.HYPOTHESES.map((h) => h.label).join(", ") }); $("break-panel").scrollIntoView({ block: "nearest" }); $("hyps").querySelector("input").focus(); return; }
  if (c.action === "break-commutativity") { ui.brk = true; go({ ...st, mode: "proof", id: "proof/commutativity", off: [...new Set([...st.off, "right-square-commutes"])] }, { focus: true }); return; }
  if (c.action === "reset") { ui.brk = false; ui.labMsg = ""; go(st.mode === "lab" ? { ...st, ops: [] } : SL.defaultState(), { focus: true }); return; }
  if (c.action === "present") { startPresent(); return; }
  if (c.action === "export") { openExport(st.mode === "lab" ? "lab" : "preset"); return; }
  if (c.action === "trace") { $("trace-panel").scrollIntoView({ block: "nearest" }); $("trace-h").setAttribute("tabindex", "-1"); $("trace-h").focus(); return; }
  if (c.action === "theme") toggleTheme();
}
$("btn-palette").addEventListener("click", openPalette);
$("palette-input").addEventListener("input", () => { palSel = 0; filterPalette(); });
$("palette-input").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); filterPalette(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(0, palSel - 1); filterPalette(); }
  else if (e.key === "Enter") { e.preventDefault(); if (palItems[palSel]) runItem(palItems[palSel]); }
});
$("palette-list").addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) runItem(palItems[+li.dataset.i]); });
$("palette").addEventListener("close", () => { if (palReturn && document.contains(palReturn) && !document.querySelector("#present:not([hidden])")) try { palReturn.focus(); } catch { /* gone */ } });

/* ---------- export: Beam MD Switch ---------- */
function deckText() {
  return ui.exportKind === "lab" ? BD.deck(SL.labReport(st.start, st.ops, st.off)) : BD.deck(SL.report(ui.preset));
}
function sequenceText() {
  if (ui.exportKind === "lab") {
    const lab = SL.labReplay(st.start, st.ops, st.off);
    return ["Initial fact: " + SL.LAB_STARTS[lab.start].label, ...lab.history.map((h, i) => `${i + 1}. ${h.label} — ${h.text}`)].join("\n");
  }
  return SL.presentation(ui.preset).map((p, i) => `${String(i + 1).padStart(2, "0")}  ${p.title}${p.reveals > 1 ? ` (${p.reveal}/${p.reveals})` : ""}  #${p.ref}`).join("\n");
}
function openExport(kind) {
  ui.exportKind = kind === "lab" ? "lab" : "preset";
  $("export-presets").innerHTML = `<legend class="sr">Preset</legend>${SL.PRESET_IDS.map((id) => `<label><input type="radio" name="preset" value="${id}"${ui.exportKind === "preset" && ui.preset === id ? " checked" : ""}> ${esc(SL.PRESETS[id].label)} <span class="tiny muted">${esc(SL.PRESETS[id].about)}</span></label>`).join("")}<label><input type="radio" name="preset" value="lab"${ui.exportKind === "lab" ? " checked" : ""}${st.mode === "lab" ? "" : " disabled"}> This chase <span class="tiny muted">${st.mode === "lab" ? "the moves you made in the Chase Lab" : "(open the Chase Lab first)"}</span></label>`;
  refreshExport();
  $("export-status").textContent = "";
  try { $("export").showModal(); } catch { $("export").setAttribute("open", ""); }
  $("btn-copy-md").focus();
}
function refreshExport() { $("export-text").value = deckText(); }
$("export-presets").addEventListener("change", (e) => { if (e.target.value === "lab") ui.exportKind = "lab"; else { ui.exportKind = "preset"; ui.preset = e.target.value; } refreshExport(); });
$("btn-export").addEventListener("click", () => openExport(st.mode === "lab" ? "lab" : "preset"));
$("btn-export-close").addEventListener("click", () => { try { $("export").close(); } catch { $("export").removeAttribute("open"); } });
function save(blob, name) {
  const a = document.createElement("a"), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy(text, what) {
  const status = $("export-status");
  try { await navigator.clipboard.writeText(text); status.textContent = `Copied the ${what}.`; }
  catch { $("export-text").value = text; $("export-text").select(); status.textContent = `Copying is blocked here: the ${what} is selected in the box, press ${/Mac/.test(navigator.platform || "") ? "⌘" : "Ctrl"}+C.`; }
}
$("btn-copy-md").addEventListener("click", () => copy(deckText(), "beamdswitch Markdown"));
$("btn-copy-seq").addEventListener("click", () => copy(sequenceText(), "deck sequence"));
$("btn-download-md").addEventListener("click", async () => {
  const name = ui.exportKind === "lab" ? "snake-lemma-chase.md" : `snake-lemma-${ui.preset}.md`;
  try { save(new Blob([deckText()], { type: "text/markdown" }), name); $("export-status").textContent = `Saved ${name}: open it in beamdswitch.`; }
  catch { await copy(deckText(), "beamdswitch Markdown (saving is blocked here)"); }
});

/* ---------- presentation mode: the same states, a clean 16:9 surface ---------- */
function startPresent() {
  const seq = SL.presentation(ui.preset), here = SL.encodeHash(st);
  let i = seq.findIndex((p) => SL.encodeHash(SL.decodeHash(p.ref)) === here);
  ui.present = { seq, i: Math.max(0, i), ret: document.activeElement, st };
  $("present").hidden = false;
  document.body.classList.add("presenting");
  showSlide();
  $("present").setAttribute("tabindex", "-1");
  $("present").focus();
}
function endPresent(next) {
  if (!ui.present) return;
  const { ret, st: saved } = ui.present;
  ui.present = null;
  st = next || saved;
  $("present").hidden = true;
  $("overview").hidden = true;
  document.body.classList.remove("presenting");
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* not fullscreen */ }
  render({ say: "Left presentation mode." });
  if (ret && document.contains(ret)) try { ret.focus(); } catch { /* gone */ }
}
function showSlide() {
  const P = ui.present, cur = P.seq[P.i];
  const { st: s } = SL.resolveState(cur.ref);
  st = SL.normalize({ ...s, off: [] });
  render({ say: false });
  const state = currentState();
  renderDiagram($("slide-diagram"), viewOf(state), { off: [], animate: state.id === "proof/delta" && cur.reveal === cur.reveals });
  const sl = SL.SLIDES[cur.slide];
  $("slide-title").textContent = sl.title;
  $("slide-sec").textContent = { setup: "Set-up", method: "Method", results: "Results", checks: "Checks and takeaway" }[cur.section];
  const sameSlide = P.seq.filter((p, j) => p.slide === cur.slide && j <= P.i && j > P.i - cur.reveal);
  let html = sameSlide.map((p, j) => {
    const r = SL.resolveState(p.ref).state, old = j < sameSlide.length - 1 ? " class=\"old\"" : "";
    if (sl.zsequence) return `<table>${SL.Z_SEQUENCE.map((z) => `<tr><td class="math">${esc(SL.TERMS.find((t) => t.id === z.term).label)}</td><td class="math">${esc(z.value)}</td></tr>`).join("")}</table>`;
    if (sl.hypotheses) return `<ul>${SL.HYPOTHESES.map((h) => `<li><strong>${esc(h.label)}</strong>: ${esc(h.statement)}</li>`).join("")}</ul>`;
    const parts = SL.revealParts(cur.slide, r, cur.reveals > 1), tex = r.deckTex && !(cur.reveals > 1) ? r.tex : parts.tex;
    return `<p${old}>${esc(parts.lead)}</p>${tex.length ? `<div class="alg">${tex.map((t) => `<div>${esc(SL.uni(t))}</div>`).join("")}</div>` : ""}`;
  }).join("");
  if (sl.key) html += `<p class="lesson">${esc(SL.KEY)}</p>`;
  $("slide-text").innerHTML = html;
  $("slide-count").textContent = `${P.i + 1} / ${P.seq.length} · slide ${new Set(P.seq.slice(0, P.i + 1).map((p) => p.slide)).size} · #${cur.ref}`;
  $("overview").innerHTML = [...new Map(P.seq.map((p, j) => [p.slide, j])).entries()].map(([id]) => { const j = P.seq.findIndex((p) => p.slide === id); return `<button type="button" data-j="${j}"${P.seq[P.i].slide === id ? ' aria-current="true"' : ""}>${esc(SL.SLIDES[id].title)}</button>`; }).join("");
}
function presentKey(e) {
  const P = ui.present; if (!P) return false;
  const k = e.key;
  if (k === "Escape") { if (!$("overview").hidden) { $("overview").hidden = true; $("present").focus(); } else endPresent(); }
  else if (k === "ArrowRight" || k === "PageDown" || (k === " " && !e.shiftKey)) { P.i = Math.min(P.seq.length - 1, P.i + 1); showSlide(); }
  else if (k === "ArrowLeft" || k === "PageUp" || (k === " " && e.shiftKey)) { P.i = Math.max(0, P.i - 1); showSlide(); }
  else if (k === "Home") { P.i = 0; showSlide(); }
  else if (k === "End") { P.i = P.seq.length - 1; showSlide(); }
  else if (k === "f" || k === "F") { try { document.fullscreenElement ? document.exitFullscreen() : $("present").requestFullscreen(); } catch { /* not allowed in this frame */ } }
  else if (k === "o" || k === "O") { $("overview").hidden = !$("overview").hidden; if (!$("overview").hidden) { const b = $("overview").querySelector('[aria-current="true"]') || $("overview").querySelector("button"); if (b) b.focus(); } else $("present").focus(); }
  else return true;
  e.preventDefault();
  return true;
}
$("overview").addEventListener("click", (e) => { const b = e.target.closest("button[data-j]"); if (!b) return; ui.present.i = +b.dataset.j; $("overview").hidden = true; showSlide(); $("present").focus(); });
$("btn-present").addEventListener("click", startPresent);

/* ---------- global keys ---------- */
const typing = (t) => t && (t.closest("input, textarea, select, [contenteditable]") || (t.getAttribute && t.getAttribute("role") === "slider"));
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); $("palette").open ? closePalette() : openPalette(); return; }
  if (ui.present) { presentKey(e); return; }
  if (e.target.closest && e.target.closest("dialog")) return;
  if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "p" || e.key === "P") { e.preventDefault(); startPresent(); }
  else if (e.key === "ArrowRight" && !e.target.closest("button, [role=button], .seg")) { if (seqInfo()) { e.preventDefault(); step(1); } }
  else if (e.key === "ArrowLeft" && !e.target.closest("button, [role=button], .seg")) { if (seqInfo()) { e.preventDefault(); step(-1); } }
  else if (e.key === "Escape") { hideTip(); if (ui.hint || ui.concept) { ui.hint = false; ui.concept = null; render({ say: false }); } }
});
window.addEventListener("popstate", () => { if (ui.present) { endPresent(SL.decodeHash(location.hash)); return; } st = SL.decodeHash(location.hash); render(); });
window.addEventListener("hashchange", () => { const s = SL.decodeHash(location.hash); if (ui.present) endPresent(s); else if (SL.encodeHash(s) !== SL.encodeHash(st)) { st = s; render(); } });

/* ---------- theme ---------- */
function toggleTheme() {
  const root = document.documentElement, cur = root.getAttribute("data-theme");
  const dark = cur ? cur === "dark" : (() => { try { return matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; } })();
  root.setAttribute("data-theme", dark ? "light" : "dark");
  try { localStorage.setItem("snake-lemma-theme", dark ? "light" : "dark"); } catch { /* storage blocked */ }
}
try { const t = localStorage.getItem("snake-lemma-theme"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch { /* storage blocked */ }
$("btn-theme").addEventListener("click", toggleTheme);
$("abelian-text").textContent = SL.ABELIAN_NOTE;

/* ---------- WebMCP: read-only tools for agents ---------- */
const result = (v) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });
const ro = { readOnlyHint: true }, none = { type: "object", properties: {}, additionalProperties: false };
const tools = [
  { name: "get_metadata", description: "Return what this Snake Lemma visual models: the diagram, the six hypotheses, the proof-dependency graph, the derived sequence, the integer example, the stable state ids and the beamdswitch export presets.", inputSchema: none, annotations: ro,
    async execute() { return result({ url: "https://teoyujie.org/visuals/snake-lemma", ...SL.catalogue() }); } },
  { name: "get_current_state", description: "Return the page's current state: its stable URL hash, mode, the element token (where it lives and what is known), switched-off hypotheses, where Break mode stops the proof, and the live proof trace.", inputSchema: none, annotations: ro,
    async execute() {
      const info = seqInfo(), state = currentState();
      const lab = state.lab;
      return result({ hash: SL.encodeHash(st), mode: st.mode, state: state.id, title: state.title, lead: lab ? null : state.lead,
        tokens: state.tokens.filter((t) => !t.ghost).map((t) => ({ label: t.label, lives_in: placeName(t.at), choice: !!t.choice })),
        known: lab ? lab.facts.map(SL.factText) : info ? info.steps.slice(0, info.idx + 1).flatMap((s) => s.facts.map(SL.uni)) : state.facts.map(SL.uni),
        hypotheses_off: st.off, blocked: info && info.blocked ? info.blocked.message : null,
        trace: lab ? lab.history.map((h) => ({ move: h.label, result: h.text, uses: h.uses })) : info ? SL.trace(info.steps, info.idx) : null,
        example: st.mode === "example" ? SL.Z.chase(st.c, st.k) : null });
    } },
  { name: "get_proof_state", description: "Return any state by its stable id (for example proof/lift, exact/ker-gamma?step=3, example/integer?k=2, lab?ops=lift.pp,apply.beta): its title, statement, algebra, the hypotheses it uses and the speaker note. Does not change the page.", annotations: ro,
    inputSchema: { type: "object", properties: { state: { type: "string", maxLength: 300 } }, required: ["state"], additionalProperties: false },
    async execute(i) {
      const { st: s, state } = SL.resolveState(String(i.state || "").slice(0, 300));
      if (s.mode === "lab") { const lab = SL.labReplay(s.start, s.ops, s.off); return result({ state: SL.encodeHash(s), lab: { token: SL.show(lab.token.x), lives_in: placeName(lab.token.obj), facts: lab.facts.map(SL.factText), moves: SL.labMoves(lab, s.off).moves.map((m) => m.label), outcome: SL.labOutcome(lab) } }); }
      return result({ state: SL.encodeHash(s), title: state.title, lead: state.lead, algebra: state.tex.map(SL.uni), uses: SL.directHypotheses(state.uses).map((h) => SL.hyp(h).label), note: state.note });
    } },
  { name: "get_beamdswitch_deck", description: "Return the deterministic beamdswitch Markdown deck for a preset (short, standard or full) or for a Chase Lab chase given by its start and move ids. Does not change the page.", annotations: ro,
    inputSchema: { type: "object", properties: { preset: { type: "string", enum: ["short", "standard", "full", "chase"] }, start: { type: "string", enum: SL.LAB_START_IDS }, ops: { type: "array", items: { type: "string" }, maxItems: 40 } }, additionalProperties: false },
    async execute(i) { return result({ markdown: i.preset === "chase" ? BD.deck(SL.labReport(i.start || "c", i.ops || [], [])) : BD.deck(SL.report(i.preset || "standard")) }); } },
];
self.SnakeLemmaTools = tools;
const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
if (mc && typeof mc.registerTool === "function") for (const t of tools) { try { mc.registerTool(t); } catch { /* already registered */ } }

if (st.id) ui.visited.add(st.id);
render({ say: false });
})();
