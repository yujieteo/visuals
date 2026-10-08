/* Page base: global state, the scene registry, control helpers and event delegation.
 *
 * The page is one function scope (build.py wraps every src/ui file in it). A scene registers
 * { id, track, title, sections, summary, init, controls, panels: { space, field, diagram, algebra },
 *   notes, side, md, deck, actions, drag, anim }; each panel renderer returns { title, sub, body, foot }
 * as HTML strings. State changes go through set() and re-render; elements carry data-* hooks:
 *   data-set="s.key" data-val="…"   set a scene ("s.") or global ("g.") key on click
 *   data-bind="s.key"                range/select input bound to a key
 *   data-act="name" data-arg="…"     run a scene action, else a global one
 *   data-scene="id" data-preset="{}" open a scene
 *   data-link="key"                  hover-highlights every element with the same key, in every panel
 *   data-drag="name" data-arg="…"    drag handler of the scene (points in the panel's SVG coordinates)
 *   data-tip="text"                  tooltip
 */
const Q = self.ConnesQFT;
const ENG = Q.engine, QED = Q.qed, GR = Q.graphs, HO = Q.hopf, LS = Q.laurent, SP = Q.spectral, AQ = Q.aqft, LA = Q.linalg, REP = Q.report;
const DATA = self.CQFT_DATA;
const BEAM = self.Beamdswitch;
const PI = Math.PI;
const ME = Q.CONST.me.value;
const fmt = Q.fmt;
const $ = (id) => (typeof document !== "undefined" ? document.getElementById(id) : null);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tex = (s) => Q.tex.render(s);
const clamp = Q.clamp;
const REDUCED = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- global state ---------- */
const G = {
  scene: "flagship-vp",
  logMu: Math.log10(ME),      // CURRENT SCALE μ in MeV, log10
  order: 1,                   // LOOP ORDER 0–3
  reg: "dimreg",              // REGULATOR: cutoff | dimreg | pv
  eps: 0.2,                   // ε in d = 4 − ε
  logLambda: 3,               // cutoff Λ (MeV, log10) for hard cutoff and Pauli–Villars
  stage: 2,                   // RENORMALIZATION STATE: 0 bare, 1 regularized, 2 renormalized, 3 observable
  ontology: "graphs",
  lens: "graph",
  stMode: "spacetime",        // spacetime | slice | euclid
  advanced: false,
  maxPanel: null,
  connes: false,
  playing: !REDUCED,
  t: 0,
  hl: null,
};
const muNow = () => Math.pow(10, G.logMu);
const alphaNow = () => QED.alphaRun(Math.max(muNow(), 1e-30));
const SS = {};           // per-scene state
const SCENES = [];
const SCENE = {};
const TRACKS = {
  qft: { name: "Perturbative QFT", color: "var(--qft)", bg: "var(--qft-bg)" },
  ck: { name: "Connes–Kreimer", color: "var(--ck)", bg: "var(--ck-bg)" },
  ncg: { name: "Spectral geometry", color: "var(--ncg)", bg: "var(--ncg-bg)" },
  aqft: { name: "Operator algebras", color: "var(--aqft)", bg: "var(--aqft-bg)" },
  synth: { name: "Synthesis", color: "var(--synth)", bg: "var(--synth-bg)" },
};
function scene(def) {
  if (SCENE[def.id]) throw new Error(`duplicate scene ${def.id}`);
  def.sections = def.sections || [];
  def.refs = def.refs || [];
  SCENES.push(def);
  SCENE[def.id] = def;
  return def;
}
function sceneState(id) {
  if (!SS[id]) SS[id] = { ...(SCENE[id].init ? SCENE[id].init() : {}) };
  return SS[id];
}
const ctxOf = (id = G.scene) => ({ s: sceneState(id), g: G, t: G.t, id, def: SCENE[id] });

/* ---------- superscripts in plain labels ---------- */
/* Labels written as e^{−ip·x} or ψ_{in}: rendered as <sup>/<sub> in HTML, tspans in SVG, Unicode in plain text. */
const SUPMAP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "i": "ⁱ", "n": "ⁿ", "t": "ᵗ", "k": "ᵏ", "x": "ˣ", "μ": "ᵘ", "ν": "ᵛ", "a": "ᵃ", "b": "ᵇ", "d": "ᵈ", "e": "ᵉ", "m": "ᵐ", "p": "ᵖ", "s": "ˢ", "⋆": "*", "/": "ᐟ" };
const SUBMAP = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "−": "₋", "a": "ₐ", "e": "ₑ", "i": "ᵢ", "k": "ₖ", "m": "ₘ", "n": "ₙ", "p": "ₚ", "s": "ₛ", "t": "ₜ", "x": "ₓ", "μ": "μ", "ν": "ν" };
function supify(text, mode = "html") {
  const str = String(text ?? "");
  if (!/[_^]\{|\^[μνρσαβλκτγεδ0-9*†∞]|_[μνρσαβλκγεδ]|[₋₊]/.test(str)) return str;
  if (/[₋₊]/.test(str) && mode !== "plain") return supify(str.replace(/₋/g, "_{−}").replace(/₊/g, "_{+}"), mode);
  const conv = (body, map, tag, shift) => {
    if (mode === "html") return `<${tag}>${body}</${tag}>`;
    if (mode === "svg") return `<tspan baseline-shift="${shift}" font-size="72%">${body}</tspan>`;
    const chars = [...body.replace(/\s+/g, "")];
    return chars.every((ch) => map[ch]) ? chars.map((ch) => map[ch]).join("") : `${tag === "sup" ? "^" : "_"}(${body})`;
  };
  return str.replace(/\^\{([^{}]*)\}/g, (_, b) => conv(b, SUPMAP, "sup", "super")).replace(/_\{([^{}]*)\}/g, (_, b) => conv(b, SUBMAP, "sub", "sub"))
    .replace(/(\S)\^([μνρσαβλκτγεδ]{1,2}|[0-9*†∞])/g, (_, a, b) => a + conv(b, SUPMAP, "sup", "super")).replace(/(\S)_([μνρσαβλκγεδ]{1,2})/g, (_, a, b) => a + conv(b, SUBMAP, "sub", "sub"));
}

/* ---------- control helpers (HTML strings) ---------- */
const keyAttr = (key) => (key.includes(".") ? key : `s.${key}`);
function slider(key, label, min, max, step, value, show = (v) => fmt(v, 3), extra = "") {
  return `<label class="ctl">${supify(label)}<input type="range" data-bind="${keyAttr(key)}" min="${min}" max="${max}" step="${step}" value="${value}" ${extra} aria-label="${esc(label.replace(/<[^>]+>/g, ""))}"><output>${show(value)}</output></label>`;
}
function seg(key, options, value, label = "") {
  const btns = options.map(([v, text, tip]) => `<button type="button" data-set="${keyAttr(key)}" data-val="${esc(String(v))}" aria-pressed="${String(v) === String(value)}"${tip ? ` title="${esc(tip)}"` : ""}>${supify(text)}</button>`).join("");
  return `${label ? `<span class="small muted">${label}</span>` : ""}<span class="seg" role="group">${btns}</span>`;
}
const toggle = (key, label, value) => `<button class="btn small" type="button" data-set="${keyAttr(key)}" data-val="${!value}" aria-pressed="${!!value}">${label}</button>`;
const actBtn = (act, label, arg = "", cls = "btn small") => `<button class="${cls}" type="button" data-act="${act}" data-arg="${esc(arg)}">${label}</button>`;
const sceneLink = (id, label, preset) => `<button class="btn small" type="button" data-scene="${id}"${preset ? ` data-preset="${esc(JSON.stringify(preset))}"` : ""}>${label}</button>`;
/* Step list for guided computations: active step and completed ones. */
function stepper(key, titles, current) {
  return `<div class="steps" role="list">${titles.map((t, i) => `<button type="button" role="listitem" data-set="${keyAttr(key)}" data-val="${i}" aria-current="${i === current}" class="${i < current ? "done" : ""}">${i + 1}. ${supify(t)}</button>`).join("")}</div>`;
}
const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${supify(k)}</dt><dd>${supify(v)}</dd>`).join("")}</dl>`;
const table = (head, rows, numCols = []) => `<table class="t"><thead><tr>${head.map((h) => `<th>${supify(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${numCols.includes(i) ? ' class="num"' : ""}>${supify(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const formula = (s, link) => `<div class="formula"${link ? ` data-link="${link}"` : ""}>${tex(s)}</div>`;
const warn = (html) => `<div class="warning">${html}</div>`;
const lseries = (s, sig = 5) => esc(LS.toText(s, { sig }));

/* ---------- state updates ---------- */
function parseVal(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (v !== "" && !Number.isNaN(Number(v)) && /^-?[\d.]+(e-?\d+)?$/.test(v)) return Number(v);
  return v;
}
function setKey(path, value) {
  const [scope, ...rest] = path.split(".");
  const key = rest.join(".");
  const obj = scope === "g" ? G : sceneState(G.scene);
  obj[key] = value;
  const def = SCENE[G.scene];
  if (scope === "s" && def.onSet) def.onSet(ctxOf(), key, value);
  if (scope === "g" && GLOBAL_ON_SET[key]) GLOBAL_ON_SET[key](value);
}
const GLOBAL_ON_SET = {};
const ACTIONS = {};

/* ---------- highlighting across panels ---------- */
function setHighlight(key) {
  if (G.hl === key) return;
  G.hl = key;
  if (typeof document === "undefined" || !document.querySelectorAll) return;
  for (const el of document.querySelectorAll(".lit")) el.classList.remove("lit");
  if (key) for (const el of document.querySelectorAll(`[data-link~="${CSS_ESC(key)}"]`)) el.classList.add("lit");
}
const CSS_ESC = (s) => String(s).replace(/["\\]/g, "\\$&");

/* ---------- SVG coordinates for drags ---------- */
function svgPoint(svgEl, clientX, clientY) {
  const r = svgEl.getBoundingClientRect();
  const vb = (svgEl.getAttribute("viewBox") || `0 0 ${r.width} ${r.height}`).split(/[\s,]+/).map(Number);
  const sx = vb[2] / r.width, sy = vb[3] / r.height, s = Math.max(sx, sy);
  // preserveAspectRatio xMidYMid meet: content is centred
  const ox = (r.width * s - vb[2]) / 2, oy = (r.height * s - vb[3]) / 2;
  return { x: vb[0] + (clientX - r.left) * s - ox, y: vb[1] + (clientY - r.top) * s - oy };
}
let DRAG = null;

/* ---------- tooltip ---------- */
function showTip(text, x, y) {
  const t = $("tip");
  if (!t) return;
  if (!text) { t.hidden = true; return; }
  t.textContent = supify(text, "plain");
  t.hidden = false;
  t.style.left = `${Math.min(x + 12, (typeof innerWidth === "number" ? innerWidth : 1200) - 260)}px`;
  t.style.top = `${y + 14}px`;
}
