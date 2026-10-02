
/* ================= shell: status bar, palette, presentation, export, tools, wiring ================= */

/* The engine's view of the lab state. */
function engineState() {
  const n = S.obj === "spec-fq" ? S.nq : S.obj === "spec-c" ? S.specN : S.obj === "abelian" ? S.ab : S.obj === "p1" ? S.attempt : S.obj === "arith" ? S.arN : S.n;
  const [ellA, ellB] = S.ellCurve.split(",").map(Number);
  return { obj: S.obj, n, q: S.q, g: S.g, r: S.r, p: S.p, t: 1, dim: S.dim, a: S.a, ellA, ellB, ellP: S.ellP };
}
const computeMemo = new Map();
function computeNow() {
  const st = engineState(), key = JSON.stringify(st);
  if (!computeMemo.has(key)) { if (computeMemo.size > 200) computeMemo.clear(); computeMemo.set(key, E.compute(st)); }
  return computeMemo.get(key);
}
const MODEL_OF = () => ({
  "spec-c": "algebraic point", "spec-r": "point + conjugate fibre", "spec-fq": "tower + necklaces", p1: S.p1Model === "sphere" ? "sphere" : "complex plane + ∞",
  a1: "sphere − ∞ → plane", gm: S.ram ? "sphere with branch points" : { cylinder: "cylinder", plane: "punctured plane", sphere: "punctured sphere" }[S.gmModel],
  "p1-3": { pants: "pair of pants", sphere: "punctured sphere", plane: "ℂ − {0, 1}" }[S.pantsModel], curve: `genus ${S.g}, ${S.r} punctures`, elliptic: S.ellModel,
  abelian: "product of tori", "a1-p": "algebraic line + sheets", "ell-p": "torsion towers", arith: "two layers",
})[S.obj];
function statusData() {
  const r = computeNow(), rows = [["Object", r.object], ["Model", MODEL_OF()], ["Field", r.field], ["Char", r.char], ["Punctures", S.compact >= 1 ? "filled in" : r.punctures]];
  let cover = r.cover, degree = r.degree, fibre = r.fibreSize, mono = r.monodromy;
  if (S.obj === "p1-3") { const C3 = pantsCover(); cover = S.cover3 === "cheb" ? "Chebyshev, degree 3" : "S₃ Galois cover"; degree = C3.n; fibre = C3.n; mono = `a ${E.cycleString(C3.a)}, b ${E.cycleString(C3.b)}`; rows.push(["Generators", "a, b"]); }
  if (S.obj === "curve") rows.push(["Generators", r.generators || "none"]);
  if (S.obj === "spec-fq") cover = `Spec 𝔽${E.sub(S.q)}${E.sup(S.nq)}`;
  rows.push(["Current cover", cover], ["Degree", String(degree)], ["Fibre size", String(fibre)], ["Monodromy", mono]);
  let top = r.top, et = r.et;
  if (S.compact >= 1 && ["gm", "p1-3"].includes(S.obj)) { top = "1"; et = "1 (now ℙ¹)"; }
  rows.push(["π₁ top", top], ["π₁ ét", et]);
  return rows;
}
function renderStatus() {
  $("status-dl").innerHTML = statusData().map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
}

/* ---------- command palette ---------- */
const go = (id) => { const el = $(id); if (el) el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" }); };
const COMMANDS = [
  ["draw P1", () => setObj("p1")], ["draw A1", () => setObj("a1")], ["draw Gm", () => setObj("gm")], ["draw elliptic curve", () => setObj("elliptic")],
  ["draw genus-g curve", () => setObj("curve")], ["draw abelian variety", () => setObj("abelian")],
  ["show punctures", () => setObj("gm", { gmModel: "sphere", ram: false })], ["show pair of pants", () => setObj("p1-3", { pantsModel: "pants" })],
  ["show degree 5 cover", () => setObj("gm", { n: 5, gmModel: "cylinder", ram: false })], ["show fibre", () => { setView("fibre"); go("lab"); }],
  ["animate monodromy", () => { go("lab"); playMonodromy(); }], ["compactify", () => { if (!["gm", "p1-3"].includes(S.obj)) setObj("gm", { gmModel: "sphere" }); doAct("compactify"); go("lab"); }],
  ["switch characteristic p", () => setObj("a1-p")], ["show Artin–Schreier", () => setObj("a1-p")], ["show Tate module", () => setObj("ell-p")],
  ["compare topology", () => go("charp")], ["show ramification", () => setObj("gm", { ram: true, rho: 0.6, removed: false })],
  ["show profinite tower", () => go("profinite")], ["show surface relation", () => go("surfaces")], ["fold the 4g-gon", () => { go("surfaces"); foldPolygon(); }],
  ["show Spec C", () => setObj("spec-c")], ["show Spec R", () => setObj("spec-r")], ["show Spec Fq", () => setObj("spec-fq")],
  ["show arithmetic fundamental group", () => setObj("arith")], ["show roots of unity over Q", () => go("arith")], ["show dessin", () => go("dessin")],
  ["open puzzles", () => go("puzzles")], ["open Szamuely concept map", () => go("concepts")], ["show geometric summary", () => go("summary")], ["show results table", () => go("results")],
  ["presentation mode", () => openPresent(0)], ["toggle theme", () => cycleTheme()],
];
const PAL = { q: "", i: 0 };
function paletteMatches() {
  const q = PAL.q.trim().toLowerCase().replace(/[¹]/g, "1");
  return COMMANDS.filter(([name]) => !q || q.split(/\s+/).every((w) => name.toLowerCase().includes(w)));
}
function renderPalette() {
  const list = paletteMatches();
  PAL.i = clamp(PAL.i, 0, Math.max(0, list.length - 1));
  $("palette-list").innerHTML = list.map(([name], i) => `<li><button type="button" role="option" data-cmd="${esc(name)}" aria-selected="${i === PAL.i}">${esc(name)}</button></li>`).join("") || '<li class="small muted" style="padding:.6rem">No command matches.</li>';
}
function openPalette() { $("palette").hidden = false; PAL.q = ""; PAL.i = 0; $("palette-input").value = ""; renderPalette(); $("palette-input").focus(); }
function closePalette() { $("palette").hidden = true; }
function runCommand(name) { const c = COMMANDS.find(([n]) => n === name); closePalette(); if (c) c[1](); }

/* ---------- presentation mode ---------- */
const SLIDES = [
  { fig: () => specRFig(1), text: "<p>A field K has a fundamental group: its absolute Galois group. Spec ℝ has one geometric cover, Spec ℂ, whose two points i, −i are swapped by conjugation.</p><p class=\"boxed\">π₁ᵉᵗ(Spec K) = G_K</p>", lab: "spec-r" },
  { fig: () => coverSheets({ perm: [1, 2, 0], s: 0.55, w: 340, h: 340 }), text: "<p>A finite cover floats above the base as sheets. Pick x̄; the points above it are the fibre. A loop carries the fibre back to itself, permuted.</p><p class=\"boxed\">ρ : π₁(X, x̄) → Sₙ</p>", lab: "gm" },
  { fig: () => stereoFig(1), text: "<p>ℙ¹(ℂ) is a sphere. Stereographic projection from the north pole ∞ identifies the sphere minus ∞ with the plane.</p>", lab: "p1" },
  { fig: () => stereoFig(0.55, { removeInf: 1 }), text: "<p>Delete ∞ and the sphere unwraps into the plane 𝔸¹(ℂ), which contracts to a point: no nontrivial covers in characteristic 0.</p>", lab: "a1" },
  { fig: () => sphereFig({ e: 0.12, points: [{ P: [0, 0, 1], kind: "puncture", label: "∞" }, { P: sph(0, -78), kind: "puncture", label: "0" }], loops: [{ P: [0, 0, 1], beta: Math.PI / 2, cls: "loop-a", label: "γ" }] }), text: "<p>Remove 0 and ∞: 𝔾ₘ is a twice-punctured sphere, a punctured plane, a cylinder. One loop γ goes round.</p>", lab: "gm" },
  { fig: () => coverSheets({ perm: E.rotation(5), s: 0.45, w: 340, h: 360, labels: E.labelsMu(5) }), text: "<p>z ↦ z⁵ winds the source cylinder five times round the target. One loop cycles the five sheets: (1 2 3 4 5). The fibre over 1 is μ₅.</p>", lab: "gm" },
  { fig: () => profiniteFig(6), text: "<p>Every connected finite cover of 𝔾ₘ is z ↦ zⁿ, and they map to each other by divisibility. Keeping all finite quotients of ℤ at once gives ℤ̂.</p><p class=\"boxed\">π₁ᵉᵗ(𝔾ₘ) = ℤ̂</p>", lab: "gm" },
  { fig: () => sphereFig({ az: 0.2, e: 0.22, points: [{ P: sph(-40, -10), kind: "puncture", label: "0" }, { P: sph(40, -10), kind: "puncture", label: "1" }, { P: sph(0, 62), kind: "puncture", label: "∞" }] }), text: "<p>Remove three points: ℙ¹ − {0, 1, ∞}.</p>", lab: "p1-3" },
  { fig: () => pantsFig({ stage: 2 }), text: "<p>Deform it into a pair of pants. γ₀γ₁γ∞ = 1, so γ∞ is redundant and two free loops remain: F₂. Its finite quotients assemble into F̂₂.</p>", lab: "p1-3" },
  { fig: () => surfaceFig(2, 2, { probe: false }), text: "<p>Handles give pairs aᵢ, bᵢ; punctures give cⱼ; one relation ∏[aᵢ,bᵢ]∏cⱼ = 1. With a puncture, the group is free of rank 2g + r − 1.</p>", lab: "curve" },
  { fig: () => `<div class="grid2">${cubicFig(-1, 0)}${torusFig({ stage: 2, n: 0 })}</div>`, text: "<p>An elliptic curve is a cubic with a point at infinity, and over ℂ a lattice quotient ℂ/Λ: a torus with π₁ = ℤ².</p>", lab: "elliptic" },
  { fig: () => latticeFig(3), text: "<p>[3] : E → E has the 3-torsion as fibre over 0: nine points, (ℤ/3)². All n together: π₁ᵉᵗ(E) = ℤ̂².</p>", lab: "elliptic" },
  { fig: () => layersFig(8, 0, "gal"), text: "<p>Over ℚ there are two motions: loops in the geometric cover world over ℚ̄, and Galois moving coefficients.</p><p class=\"boxed\">1 → π₁ᵉᵗ(X_k̄) → π₁ᵉᵗ(X) → G_k → 1</p>", lab: "arith" },
  { fig: () => `<div class="banner">Characteristic p · algebraic geometry view</div>${asChar0Fig(3)}`, text: "<p>In characteristic p the pictures stop being complex topology: lines are algebraic lines, and the over-ℂ intuition can fail.</p>", lab: "a1-p" },
  { fig: () => asFig(3, 0.4, 0), text: "<p>y³ − y = t has derivative −1: three sheets over the whole affine line, never meeting. 𝔸¹ in characteristic 3 has a ℤ/3 cover.</p>", lab: "a1-p" },
  { fig: () => `<div class="grid2">${coverSheets({ perm: [1, 2, 0], s: 1, w: 300, h: 300 })}${fibreFig({ n: 3, perm: [1, 2, 0], title: "F_x̄(Y)" })}</div>`, text: "<p>Field extensions, covering spaces and étale covers: finite sets with compatible symmetry.</p><p class=\"boxed\">π₁ᵉᵗ(X, x̄) = Aut(F_x̄)</p><p>To compute π₁ᵉᵗ(X), understand the finite étale covers of X.</p>", lab: "p1-3" },
];
const PRES = { i: 0, back: null };
function renderPresent() {
  const sl = SLIDES[PRES.i];
  $("present-num").textContent = `${String(PRES.i + 1).padStart(2, "0")} / ${SLIDES.length}`;
  $("present-title").textContent = E.PROGRESSION[PRES.i];
  $("present-fig").innerHTML = sl.fig();
  $("present-text").innerHTML = `${sl.text}<p><button type="button" class="btn" data-present-lab="${sl.lab}">Open this in the laboratory</button></p>`;
  $("present-dots").innerHTML = SLIDES.map((_, i) => `<button type="button" data-slide="${i}" aria-current="${i === PRES.i}" aria-label="Slide ${i + 1}">${i + 1}</button>`).join("");
  $("present-prev").disabled = PRES.i === 0; $("present-next").disabled = PRES.i === SLIDES.length - 1;
}
function openPresent(i = 0) { PRES.back = document.activeElement; PRES.i = i; $("present").hidden = false; renderPresent(); $("present-next").focus(); }
function closePresent() { $("present").hidden = true; if (PRES.back && PRES.back.focus) PRES.back.focus(); }

/* ---------- theme ---------- */
function applyTheme(t) {
  const d = document.documentElement;
  if (t === "light" || t === "dark") d.setAttribute("data-theme", t); else d.removeAttribute("data-theme");
  $("theme-toggle").textContent = `Theme: ${t || "auto"}`;
}
// The theme is the site's shared choice (localStorage "theme"), so one setting holds across the site and every visual.
function siteTheme() { try { const t = localStorage.getItem("theme"); return t === "light" || t === "dark" ? t : ""; } catch { return ""; } }
function cycleTheme() { const next = { "": "light", light: "dark", dark: "" }[siteTheme()]; try { if (next) localStorage.setItem("theme", next); else localStorage.removeItem("theme"); } catch { /* storage blocked */ } applyTheme(next); }

/* ---------- view toggle ---------- */
function setView(v) {
  S.view = v;
  $("lab-panels").setAttribute("data-view", v);
  for (const b of document.querySelectorAll("#view-seg [data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === v));
  S.done.add({ geometry: 0, cover: 1, fibre: 2, group: 4 }[v] ?? 0);
}

/* ---------- lab actions ---------- */
function doAct(act) {
  switch (act) {
    case "stereo": S.p1Model = "sphere"; animate("p1m", 0, 1, 2400, (v) => { S.morph = v; renderLabPanels(); }, () => { S.morph = null; renderLab(); }, true); break;
    case "a1-play": animate("a1", 0, 1, 5000, (v) => { S.stage = v; renderLabPanels(); }, () => renderLab()); break;
    case "ram": S.ram = !S.ram; S.rho = 0.7; S.removed = false; renderLab(); if (S.ram) animate("ram", 0.7, 0, 2500, (v) => { S.rho = v; renderLabPanels(); }); break;
    case "remove": S.removed = !S.removed; renderLab(); break;
    case "compactify": { const to = S.compact >= 1 ? 0 : 1; animate("cpt", S.compact, to, 1400, (v) => { S.compact = v; renderLabPanels(); }, () => renderLab()); break; }
    case "relation": S.relStage = 0; animate("rel", 0, 1, 2400, (v) => { S.merge = v; renderLabPanels(); }, () => renderLab(), true); break;
    case "eliminate": S.merge = 0; S.relStage = 2; renderLab(); break;
    case "to-charp": setObj("a1-p"); break;
  }
}
function foldPolygon() { animate("fold", 0, 0.999, 6000, (v) => { SURF.ps = v; renderSurfaces(); }); }

/* ---------- beamdswitch export ---------- */
const deck = () => BD.deck(E.report(engineState()));
function saveFile(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function showFallback(text) {
  $("fallback").hidden = false;
  $("fallback-label").textContent = "Clipboard access is blocked; the deck is selected below. Press Ctrl+C or ⌘C.";
  $("fallback-text").value = text;
  $("fallback-text").focus(); $("fallback-text").select();
}

/* ---------- WebMCP (read-only) ---------- */
const result = (o) => ({ content: [{ type: "text", text: JSON.stringify(o) }] });
const ro = { readOnlyHint: true };
const tools = [
  { name: "get_metadata", description: "Describe the Étale Fundamental Group laboratory: its objects, the computations with their assumptions and answers, the presentation progression and the Szamuely chapters it follows.", inputSchema: { type: "object", properties: {} }, annotations: ro,
    async execute() { return result({ title: "Étale Fundamental Group — From Loops to Covers to Galois Symmetry", url: "https://teoyujie.org/visuals/etale-fundamental-group", objects: E.OBJECTS, results: E.RESULTS, progression: E.PROGRESSION, reference: { book: "Tamás Szamuely, Galois Groups and Fundamental Groups, Cambridge Studies in Advanced Mathematics 117", chapters: E.SZAMUELY.map((c) => ({ chapter: c.chapter, title: c.title })) } }); } },
  { name: "get_current_state", description: "Return what the laboratory currently shows: the object, its model, the cover, its degree and fibre, the monodromy and the fundamental groups, exactly as the status bar reads.", inputSchema: { type: "object", properties: {} }, annotations: ro,
    async execute() { return result({ state: engineState(), view: S.view, status: Object.fromEntries(statusData()), loop: currentLoop().name, loop_progress: S.s }); } },
  { name: "get_results_table", description: "Return the table of computations (X, assumptions, π₁ᵉᵗ, required picture) with the result of each check the page recomputed on load.", inputSchema: { type: "object", properties: {} }, annotations: ro,
    async execute() { const ok = runChecks(); return result(E.RESULTS.map((r) => ({ ...r, checked: ok[r.id] }))); } },
  { name: "analyse_cover", description: "Analyse a finite cover given by the monodromy of loops a and b (cycle notation on degree points, e.g. a='(1 2)', b='(1 2 3)'): connectedness, monodromy group order, deck group, Schreier graph edges, and the dessin genus for a cover of P1 minus 0, 1, infinity. Does not change the page.",
    inputSchema: { type: "object", properties: { degree: { type: "integer", minimum: 1, maximum: 8 }, a: { type: "string" }, b: { type: "string" } }, required: ["degree", "a", "b"] }, annotations: ro,
    async execute({ degree, a, b }) {
      try {
        const n = Math.trunc(degree); if (!(n >= 1 && n <= 8)) throw new Error("degree must be 1 to 8");
        const pa = E.parseCycles(a, n), pb = E.parseCycles(b, n), conn = E.isTransitive([pa, pb], n), D = E.dessin(pa, pb);
        return result({ connected: conn, orbits: E.orbits([pa, pb], n).map((o) => o.map((i) => i + 1)), group_order: E.generate([pa, pb], n, 40320).length, deck_group_order: conn ? E.centralizer([pa, pb], n).length : null, galois: conn ? E.centralizer([pa, pb], n).length === n : null, gamma_infinity: E.cycleString(D.sinf), dessin_genus: conn ? D.genus : null, edges: E.schreierEdges([pa, pb], ["a", "b"]).map((e) => ({ from: e.from + 1, to: e.to + 1, gen: e.gen })) });
      } catch (err) { return result({ error: String(err.message || err) }); }
    } },
];
self.EtaleTools = tools;

/* ---------- wiring ---------- */
function onInput(id, fn) { const el = $(id); el.addEventListener("input", fn); el.addEventListener("change", fn); }
function wire() {
  document.addEventListener("click", (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    const hit = (sel) => t.closest(sel);
    let el;
    if ((el = hit("[data-obj]"))) return setObj(el.dataset.obj, { scroll: false });
    if ((el = hit("[data-view]")) && el.closest("#view-seg")) return setView(el.dataset.view);
    if ((el = hit("[data-step]"))) { const k = +el.dataset.step; S.done.add(k); if (k === 3) playMonodromy(); else if (k === 5) go("profinite"); else setView(["geometry", "cover", "fibre", "", "group"][k] || "all"); return renderLab(); }
    if ((el = hit("[data-act]"))) return doAct(el.dataset.act);
    if ((el = hit("#lab-controls [data-ctl][data-v]"))) { S[el.dataset.ctl] = el.dataset.v; if (el.dataset.ctl === "gmModel") S.ram = false; S.s = 0; S.compact = 0; return renderLab(); }
    if ((el = hit("[data-open]"))) { const id = el.dataset.open; return id === "machine" ? go("machine") : setObj(id); }
    if ((el = hit("[data-anchor]"))) { const id = el.dataset.anchor; return id === "fibre" || id === "monodromy" ? go("machine") : setObj(id); }
    if ((el = hit("[data-loopname]"))) { SURF.hl = SURF.hl === el.dataset.loopname ? null : el.dataset.loopname; return renderSurfaces(); }
    if ((el = hit("#surf-fig [data-loop]"))) { SURF.hl = SURF.hl === el.dataset.loop ? null : el.dataset.loop; return renderSurfaces(); }
    if ((el = hit("#pane-geometry [data-loop]"))) {
      const L = el.dataset.loop;
      if (S.obj === "p1-3") { S.gen = L === "g0" ? "a" : L === "g1" ? "b" : "ab"; S.s = 0; return renderLab(); }
      if (S.obj === "curve") { S.hlLoop = S.hlLoop === L ? null : L; return renderLab(); }
    }
    if ((el = hit("[data-q]"))) { PROF.sel = +el.dataset.q; return renderProfinite(); }
    if ((el = hit("[data-pz1]"))) { PZ.choice = el.dataset.pz1; PZ.s = 0; PZ.stacked = false; return renderPuzzles(); }
    if ((el = hit("[data-pz2]"))) { PZ.gamma = el.dataset.pz2; return renderPuzzles(); }
    if ((el = hit("#pz-stack"))) { PZ.stacked = true; return renderPuzzles(); }
    if ((el = hit("#pz-tors-go"))) { PZ.tors = $("pz-tors").value; PZ.tors3 = Number(PZ.tors) === E.torsionCount(3); return renderPuzzles(); }
    if ((el = hit("#pz-rank-go"))) { PZ.rank = $("pz-rank").value; PZ.rankOk = Number(PZ.rank) === E.surface(1, 2).rank; return renderPuzzles(); }
    if ((el = hit("[data-open-model]"))) { OPEN.model = el.dataset.openModel; for (const b of document.querySelectorAll("[data-open-model]")) b.setAttribute("aria-pressed", String(b === el)); return renderOpening(); }
    if ((el = hit("[data-cmd]"))) return runCommand(el.dataset.cmd);
    if ((el = hit("[data-slide]"))) { PRES.i = +el.dataset.slide; return renderPresent(); }
    if ((el = hit("[data-present-lab]"))) { closePresent(); return setObj(el.dataset.presentLab); }
    if (t === $("palette")) return closePalette();
  });
  $("lab-controls").addEventListener("input", (e) => {
    const el = e.target, k = el && el.dataset && el.dataset.ctl;
    if (!k || el.dataset.v) return;
    const num = ["n", "arN", "q", "nq", "g", "r", "p", "a", "dim", "ab", "ellP", "specN", "attempt"].includes(k);
    S[k] = ["stage", "rho", "tpos"].includes(k) ? Number(el.value) / 1000 : num ? Number(el.value) : el.value;
    if (k === "arN" && !E.units(S.arN).includes(S.a)) S.a = E.units(S.arN)[1] ?? 1;
    if (k !== "stage" && k !== "rho" && k !== "tpos") S.s = 0;
    if (el.tagName === "SELECT" || el.type === "range" && !["stage", "rho", "tpos"].includes(k)) renderLab(); else renderLabPanels();
    const out = el.nextElementSibling; if (out && out.tagName === "OUTPUT") out.textContent = el.value;
  });
  $("lab-controls").addEventListener("change", (e) => { if (e.target && e.target.tagName === "SELECT") $("lab-controls").dispatchEvent(new Event("input")); });
  $("mono-play").addEventListener("click", playMonodromy);
  onInput("mono-s", () => { stopAnim("mono"); S.s = Number($("mono-s").value) / 1000; if (S.s >= 0.999) S.done.add(4); S.done.add(3); renderLabPanels(); });
  // Hover: a fibre point lights up in every panel; the base point lights the whole fibre.
  $("lab-panels").addEventListener("pointerover", (e) => {
    const t = e.target, pt = t && t.getAttribute && t.getAttribute("data-pt"), base = t && t.getAttribute && t.getAttribute("data-base");
    $("lab-panels").classList.toggle("hl-all", !!base);
    for (const el of document.querySelectorAll("#lab-panels .ptsel")) el.classList.remove("ptsel");
    if (pt != null) for (const el of document.querySelectorAll(`#lab-panels [data-pt="${pt}"]`)) el.classList.add("ptsel");
  });
  $("lab-panels").addEventListener("pointerleave", () => { $("lab-panels").classList.remove("hl-all"); for (const el of document.querySelectorAll("#lab-panels .ptsel")) el.classList.remove("ptsel"); });
  // Drag: the pants loops slide along the legs; elsewhere a horizontal drag moves x̄ round the loop.
  let drag = null;
  $("lab-panels").addEventListener("pointerdown", (e) => {
    const svgEl = e.target && e.target.closest && e.target.closest("svg");
    if (!svgEl) return;
    const d = e.target.closest("[data-drag]"), rect = svgEl.getBoundingClientRect();
    drag = { which: d ? d.getAttribute("data-drag") : "probe", rect, x: e.clientX, s0: S.s, vb: svgEl.viewBox && svgEl.viewBox.baseVal };
    if (svgEl.setPointerCapture && e.pointerId != null) try { svgEl.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  });
  $("lab-panels").addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (drag.which === "g0" || drag.which === "g1") {
      const h = drag.vb ? drag.vb.height : 280, y = ((e.clientY - drag.rect.top) / drag.rect.height) * h;
      S[drag.which === "g0" ? "y0" : "y1"] = clamp(y, 178, 222); renderLabPanels();
    } else if (["gm", "p1-3", "spec-r", "spec-fq", "elliptic", "a1-p", "arith", "curve"].includes(S.obj)) {
      stopAnim("mono"); S.s = clamp(drag.s0 + (e.clientX - drag.x) / drag.rect.width, 0, 1); S.done.add(3); renderLabPanels();
    }
  });
  for (const ev of ["pointerup", "pointercancel"]) $("lab-panels").addEventListener(ev, () => { if (drag && S.s >= 0.999) S.done.add(4); drag = null; });

  $("opening-play").addEventListener("click", () => animate("open", OPEN.s >= 0.999 ? 0 : OPEN.s, 1, 2600, (v) => { OPEN.s = v; renderOpening(); }));
  onInput("opening-s", () => { stopAnim("open"); OPEN.s = Number($("opening-s").value) / 1000; renderOpening(); });
  onInput("machine-perm", () => { MACH.perm = $("machine-perm").value; MACH.s = 0; renderMachine(); });
  $("machine-play").addEventListener("click", () => animate("mach", MACH.s >= 0.999 ? 0 : MACH.s, 1, 2600, (v) => { MACH.s = v; renderMachine(); }));
  onInput("machine-s", () => { stopAnim("mach"); MACH.s = Number($("machine-s").value) / 1000; renderMachine(); });
  onInput("surf-g", () => { SURF.g = Number($("surf-g").value); SURF.hl = null; SURF.elim = false; renderSurfaces(); });
  onInput("surf-r", () => { SURF.r = Number($("surf-r").value); SURF.hl = null; SURF.elim = false; renderSurfaces(); });
  $("surf-elim").addEventListener("click", () => { SURF.elim = !SURF.elim; renderSurfaces(); });
  onInput("poly-g", () => { SURF.pg = Number($("poly-g").value); renderSurfaces(); });
  onInput("poly-s", () => { stopAnim("fold"); SURF.ps = Number($("poly-s").value) / 1000; renderSurfaces(); });
  $("poly-play").addEventListener("click", foldPolygon);
  onInput("ell-s", () => { stopAnim("ell"); ELL.s = Number($("ell-s").value) / 1000; renderElliptic(); });
  $("ell-play").addEventListener("click", () => animate("ell", ELL.s >= 0.999 ? 0 : ELL.s, 1, 4000, (v) => { ELL.s = v; renderElliptic(); }, null, true));
  onInput("ell-n", () => { ELL.n = Number($("ell-n").value); renderElliptic(); });
  onInput("ell-a", () => { ELL.a = Number($("ell-a").value) / 10; renderElliptic(); });
  onInput("ell-b", () => { ELL.b = Number($("ell-b").value) / 10; renderElliptic(); });
  onInput("ab-g", () => { ELL.g = Number($("ab-g").value); renderElliptic(); });
  onInput("ab-n", () => { ELL.an = Number($("ab-n").value); renderElliptic(); });
  onInput("as-p", () => { CP.p = Number($("as-p").value); CP.shift = 0; renderCharp(); });
  onInput("as-t", () => { CP.t = Number($("as-t").value) / 1000; renderCharp(); });
  $("as-deck").addEventListener("click", () => { const from = CP.shift; animate("as", from, from + 1, 900, (v) => { CP.shift = v; renderCharp(); }, () => { CP.shift = Math.round(CP.shift) % CP.p; renderCharp(); }); });
  onInput("ss-curve", () => { CP.curve = $("ss-curve").value; renderCharp(); });
  onInput("ss-p", () => { CP.ep = Number($("ss-p").value); renderCharp(); });
  onInput("ar-n", () => { AR.n = Number($("ar-n").value); if (!E.units(AR.n).includes(AR.a)) AR.a = E.units(AR.n)[1] ?? 1; AR.s = 0; renderArith(); });
  onInput("ar-a", () => { AR.a = Number($("ar-a").value); AR.s = 0; renderArith(); });
  $("ar-loop").addEventListener("click", () => { AR.mode = "loop"; animate("ar", 0, 1, 1800, (v) => { AR.s = v; renderArith(); }); });
  $("ar-gal").addEventListener("click", () => { AR.mode = "gal"; animate("ar", 0, 1, 1800, (v) => { AR.s = v; renderArith(); }); });
  onInput("prof-x", renderProfinite);
  onInput("sum-s", () => { stopAnim("sum"); SUM.i = Number($("sum-s").value); renderSummary(); });
  $("sum-play").addEventListener("click", () => animate("sum", 0, SUMS.length - 0.001, 14000, (v) => { const i = Math.floor(v); if (i !== SUM.i) { SUM.i = i; renderSummary(); } }));
  $("puzzle-list").addEventListener("input", (e) => {
    const id = e.target && e.target.id;
    if (id === "pz-n") { PZ.n = Number(e.target.value); PZ.s = 0; PZ.stacked = false; renderPuzzles(); }
    if (id === "pz-s") { PZ.s = Number(e.target.value) / 1000; renderPuzzles(); const el = $("pz-s"); if (el && el.focus) el.focus(); }
  });
  $("open-palette").addEventListener("click", openPalette);
  $("palette-input").addEventListener("input", () => { PAL.q = $("palette-input").value; PAL.i = 0; renderPalette(); });
  $("palette-input").addEventListener("keydown", (e) => {
    const list = paletteMatches();
    if (e.key === "ArrowDown") { PAL.i = Math.min(PAL.i + 1, list.length - 1); renderPalette(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { PAL.i = Math.max(PAL.i - 1, 0); renderPalette(); e.preventDefault(); }
    else if (e.key === "Enter") { if (list[PAL.i]) runCommand(list[PAL.i][0]); e.preventDefault(); }
    else if (e.key === "Escape") closePalette();
  });
  $("open-present").addEventListener("click", () => openPresent(0));
  $("present-prev").addEventListener("click", () => { PRES.i = Math.max(0, PRES.i - 1); renderPresent(); });
  $("present-next").addEventListener("click", () => { PRES.i = Math.min(SLIDES.length - 1, PRES.i + 1); renderPresent(); });
  $("present-close").addEventListener("click", closePresent);
  $("theme-toggle").addEventListener("click", cycleTheme);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); return $("palette").hidden ? openPalette() : closePalette(); }
    if (!$("palette").hidden) { if (e.key === "Escape") closePalette(); return; }
    if (!$("present").hidden) {
      if (e.key === "Escape") closePresent();
      else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { PRES.i = Math.min(SLIDES.length - 1, PRES.i + 1); renderPresent(); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { PRES.i = Math.max(0, PRES.i - 1); renderPresent(); e.preventDefault(); }
      return;
    }
    const tag = (e.target && e.target.tagName) || "";
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(tag)) return;
    const v = { g: "geometry", c: "cover", f: "fibre", a: "all" }[String(e.key).toLowerCase()];
    if (v) setView(v);
  });
  $("save-beamdswitch").addEventListener("click", async () => {
    const msg = $("io-msg"), name = "etale-fundamental-group-beamdswitch.md";
    let text;
    try { text = deck(); } catch (err) { msg.textContent = `Could not build the deck: ${err.message}`; return; }
    try { saveFile(new Blob([text], { type: "text/markdown" }), name); msg.textContent = `Saved ${name}: open it in beamdswitch.`; }
    catch { msg.textContent = "Could not save: downloads are blocked. Use Copy deck instead."; }
  });
  $("copy-beamdswitch").addEventListener("click", async () => {
    const msg = $("io-msg");
    let text;
    try { text = deck(); } catch (err) { msg.textContent = `Could not build the deck: ${err.message}`; return; }
    try { await navigator.clipboard.writeText(text); msg.textContent = "Copied the beamdswitch deck: paste it into beamdswitch."; }
    catch { showFallback(text); msg.textContent = "Clipboard access is blocked: copy the deck from the box below."; }
  });
}

/* ---------- start ---------- */
function init() {
  $("machine-perm").innerHTML = MACH_OPTIONS.map((o) => `<option ${o === MACH.perm ? "selected" : ""}>${o}</option>`).join("");
  $("ss-p").innerHTML = [5, 7, 11, 13, 17, 19, 23, 29, 31].map((p) => `<option ${p === CP.ep ? "selected" : ""}>${p}</option>`).join("");
  applyTheme(siteTheme());
  wire();
  renderOpening(); renderGallery(); renderLab(); renderMachine(); renderSurfaces(); renderElliptic(); renderCharp(); renderArith(); renderProfinite(); renderDessin(); renderPuzzles(); renderSummary();
  for (const d of document.querySelectorAll("details.gal")) d.addEventListener("toggle", () => { const f = d.querySelector("[data-galfig]"); if (d.open && f && !f.innerHTML) f.innerHTML = GALLERY.find((g) => g.id === d.dataset.gal).pic(); });
  runChecks();
  const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
  if (mc && typeof mc.registerTool === "function") for (const t of tools) { try { mc.registerTool(t); } catch { /* already registered */ } }
}
init();
})();
