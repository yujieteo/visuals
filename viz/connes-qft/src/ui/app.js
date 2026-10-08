/* The application shell: layout, navigation, palette, presentation, exports, WebMCP and start-up. */
const PANELS = [["space", "SPACETIME"], ["field", "FIELD CONFIGURATION"], ["diagram", "MOMENTUM / DIAGRAM"], ["algebra", "ALGEBRA / SPECTRUM"]];
const LENS_TABS = [["spacetime", "SPACETIME", "space"], ["momentum", "MOMENTUM", "diagram"], ["graph", "FEYNMAN GRAPH", "diagram"], ["hopf", "HOPF ALGEBRA", "diagram"], ["spectral", "SPECTRAL/OPERATOR", "algebra"]];
const TRACK_LENSES = { qft: ["qft"], ck: ["qft", "ncg"], ncg: ["ncg"], aqft: ["aqft"], synth: ["qft", "ncg", "aqft"] };
const STAGES = ["BARE INPUT", "REGULARIZED", "RENORMALIZED", "OBSERVABLE"];
const PRESENT = { open: false, i: 0 };
let PALETTE = { items: [], sel: 0 };

/* ---------- default panels: the shared context when a scene does not draw a panel ---------- */
const DEFAULT_PANELS = {
  space(ctx) {
    const tr = ctx.def.track;
    if (tr === "ncg") return { title: "SPACE AS SPECTRAL DATA", sub: "the manifold fades", body: svg(400, 200, `<g opacity="0.35">${circ(200, 100, 70, "", 'fill="none" stroke="var(--ncg)" stroke-width="3"')}</g>` + txt(200, 104, "(𝒜, ℋ, D)", "lbl", 'text-anchor="middle"'), "space as spectral data"), foot: "In this lens points are replaced by characters of 𝒜 and distances by ‖[D, f]‖ ≤ 1." };
    if (tr === "aqft") { const M = minkowski({ W: 400, H: 220, scale: 40, cone: false }); return { title: "SPACETIME REGION", sub: "𝒪 ↦ 𝒜(𝒪)", body: svg(400, 220, M.s + poly([M.P(1.2, 0), M.P(0, 1.2), M.P(-1.2, 0), M.P(0, -1.2)], "bgaqft", 'stroke="var(--aqft)" stroke-width="1.6"'), "region"), foot: "A double cone 𝒪: its observables form the local algebra 𝒜(𝒪)." }; }
    const M = minkowski({ W: 400, H: 240, scale: 38, mode: G.stMode });
    const mu = muNow(), r = Q.CONST.hbarc.value / Math.max(mu, 1e-30);
    let s = M.s;
    s += path(pathD([M.P(-2.6, -1.2), M.P(2.6, 0.9)]), "fermion", 'data-link="worldline"') + txt(M.P(2.4, 0.9)[0] + 4, M.P(2.4, 0.9)[1], "electron worldline (timelike)", "xs ink2");
    return { title: "SPACETIME", sub: G.stMode === "euclid" ? "Euclidean (τ = it)" : "Minkowski", body: svg(400, 240, s, "Minkowski diagram"), foot: `Resolution at the current scale: r ≈ ħc/μ = ${fmt(r, 3)} fm.` };
  },
  field(ctx) {
    const tr = ctx.def.track;
    if (tr === "ck") { const v = ENG.vacuumPolarization({ mu: muNow() }); return { title: "LAURENT SERIES", sub: "φ(Π₁)(ε) at the current μ", body: svg(400, 180, laurentLayers(v.series, { x: 10, y: 6, w: 380, h: 168 }), "Laurent series"), foot: lseries(v.series, 4) }; }
    if (tr === "ncg") return { title: "SPECTRAL TRIPLE", sub: "(𝒜, ℋ, D)", body: svg(400, 170, poly([[200, 18], [80, 150], [320, 150]], "bgncg", 'stroke="var(--ncg)"') + txt(200, 14, "𝒜", "lbl", 'text-anchor="middle"') + txt(70, 166, "ℋ", "lbl") + txt(322, 166, "D", "lbl"), "spectral triple") };
    if (tr === "aqft") { const rho = AQ.qubitState(0.75); return { title: "STATE AND MODULAR ORBIT", sub: "ρ = diag(0.75, 0.25)", body: svg(400, 190, bloch(200, 95, 75, Q.linspace(0, 1.5 + 0.5 * Math.sin(ctx.t), 40).map((x) => AQ.blochVector(AQ.modularFlow(rho, AQ.PAULI.X, x))), { head: AQ.blochVector(AQ.modularFlow(rho, AQ.PAULI.X, 1.5 + 0.5 * Math.sin(ctx.t))) }), "modular orbit") }; }
    let s = "";
    for (let i = 0; i < 40; i++) { const x = 20 + i * 9, y = 70 - 30 * Math.sin(i * 0.5 - ctx.t * 2); s += ln(x, 70, x, y, "qft", 'stroke-width="2"'); }
    s += txt(20, 125, "A_μ(x): a classical wave mode of the photon field", "xs ink2");
    return { title: "FIELD CONFIGURATION", sub: "A_μ(x)", body: svg(400, 140, s, "field") };
  },
  diagram(ctx) {
    const tr = ctx.def.track;
    if (tr === "ncg") return { title: "SPECTRUM OF D", sub: "circle: −i d/dθ", body: svg(400, 110, spectrumStrip(Q.range(21).map((i) => i - 10), { x: 10, y: 10, w: 380, h: 70, lim: 11 }), "spectrum") };
    if (tr === "aqft") return { title: "ALGEBRA AND COMMUTANT", sub: "M₂ ⊗ 1 on ℂ² ⊗ ℂ²", body: svg(400, 160, `<circle cx="165" cy="80" r="60" class="bgaqft" stroke="var(--aqft)"/><circle cx="235" cy="80" r="60" class="bgncg" stroke="var(--ncg)"/>` + txt(130, 84, "𝓜", "lbl", 'text-anchor="middle"') + txt(270, 84, "𝓜′", "lbl", 'text-anchor="middle"') + txt(200, 84, "ℂ1", "sm", 'text-anchor="middle"'), "algebra and commutant") };
    const g = GR.byId(ctx.s.graph && GR.CATALOGUE.some((c) => c.id === ctx.s.graph) ? ctx.s.graph : "pi1");
    return { title: "MOMENTUM / DIAGRAM", sub: esc(g.name), body: svg(400, 220, feynman(g, [10, 10, 380, 200]), g.name) };
  },
  algebra(ctx) {
    const tr = ctx.def.track;
    if (tr === "ck") return { title: "HOPF ALGEBRA", sub: "primitive Π₁", body: formula("\\Delta\\Pi_1 = \\Pi_1\\otimes 1 + 1\\otimes\\Pi_1,\\quad S(\\Pi_1) = -\\Pi_1") };
    if (tr === "ncg") return { title: "FINITE DIRAC OPERATOR", sub: "two-point space, m = 1", body: svg(200, 90, heatmap(LA.toArray(SP.twoPoint(1).D), { x: 10, y: 10, size: 34, cls: "ncg", name: "D_F" }), "D_F") };
    if (tr === "aqft") { const T = AQ.tomita(AQ.qubitState(0.75)); return { title: "MODULAR SPECTRUM", sub: "Spec Δ", body: kv([["eigenvalues", T.deltaEigenvalues.map((x) => fmt(x, 3)).join(", ")]]) }; }
    const a = alphaNow();
    return { title: "COUPLING AT THE CURRENT SCALE", sub: "one-loop QED, MS-bar", body: kv([["μ", muLabel(muNow())], ["α(μ)", `1/${fmt(1 / a, 7)}`], ["e(μ)", fmt(Math.sqrt(4 * PI * a), 6)], ["β(e)", fmt(QED.betaOneLoop(Math.sqrt(4 * PI * a)), 4)]]) };
  },
};

/* ---------- shell rendering ---------- */
function renderLenses() {
  const def = SCENE[G.scene], on = TRACK_LENSES[def.track] || [];
  const col = { qft: ["var(--qft)", "var(--qft-bg)"], ncg: ["var(--ncg)", "var(--ncg-bg)"], aqft: ["var(--aqft)", "var(--aqft-bg)"] };
  $("lenses").innerHTML = DATA.lenses.map((l) => `<div class="lens${on.includes(l.id) ? " on" : ""}" style="--c:${col[l.id][0]};--cb:${col[l.id][1]}"><b>${esc(l.name)}</b><span>${esc(l.chain)}</span></div>`).join("");
  $("lens-note").textContent = DATA.lensWarning;
}
function muLabel(mu) {
  const ev = mu * 1e6;
  if (ev < 1e3) return `${fmt(ev, 3)} eV`;
  if (ev < 1e6) return `${fmt(ev / 1e3, 3)} keV`;
  if (ev < 1e9) return `${fmt(ev / 1e6, 3)} MeV`;
  if (ev < 1e12) return `${fmt(ev / 1e9, 3)} GeV`;
  return `${fmt(ev / 1e9, 3)} GeV`;
}
function renderStatus() {
  const mu = muNow();
  const aMS = QED.alphaRun(mu), aEff = QED.alphaEff(-(mu * mu));
  const regCtl = G.reg === "dimreg" ? slider("g.eps", "ε", 0, 0.5, 0.01, G.eps, (v) => v.toFixed(2)) : slider("g.logLambda", G.reg === "pv" ? "M" : "Λ", 0, 8, 0.1, G.logLambda, (v) => muLabel(Math.pow(10, v)));
  const stageNote = [
    "e₀, m₀: formal parameters of the regularized Lagrangian; never observable, and divergent as the regulator is removed.",
    G.reg === "dimreg" ? `Amplitudes are finite for ε = ${G.eps.toFixed(2)} > 0 and carry 1/ε poles.` : G.reg === "cutoff" ? `Amplitudes are finite for Λ = ${muLabel(Math.pow(10, G.logLambda))} and grow like log Λ.` : "Amplitudes are finite with the Pauli–Villars mass M (conceptual).",
    `Renormalized e(μ), m(μ) at μ = ${muLabel(mu)} (MS-bar).`,
    "Observables: cross-sections, a_e, the Uehling potential — independent of μ and the regulator.",
  ][G.stage];
  $("status").innerHTML = `
    <div><h2>Current scale <span class="nc">μ</span></h2><div class="val">${muLabel(mu)} <span class="lab">· ħc/μ = ${fmt(Q.CONST.hbarc.value / mu, 3)} fm</span></div>${slider("g.logMu", "", -6, 19, 0.05, G.logMu, (v) => muLabel(Math.pow(10, v)))}</div>
    <div><h2>Current coupling <span class="nc">e(μ)</span></h2><div class="val" data-link="coupling">α(μ) = 1/${fmt(1 / aMS, 6)} · e = ${fmt(Math.sqrt(4 * PI * aMS), 5)}</div><div class="lab">one-loop QED, MS-bar, electron loop only; α_eff(Q² = μ²) = 1/${fmt(1 / aEff, 6)} (on-shell)</div></div>
    <div><h2>Loop order</h2>${seg("g.order", [[0, "0"], [1, "1"], [2, "2"], [3, "3"]], G.order)}<div class="lab">${["tree graphs", "one loop", "two loops", "three loops"][G.order]}</div></div>
    <div><h2>Regulator</h2>${seg("g.reg", [["cutoff", "cutoff"], ["dimreg", "dim reg"], ["pv", "Pauli–Villars"]], G.reg)}${regCtl}</div>
    <div><h2>Renormalization state</h2><div class="pipe">${STAGES.map((s, i) => `<button type="button" data-set="g.stage" data-val="${i}" aria-pressed="${i === G.stage}">${s}</button>${i < 3 ? "<i>→</i>" : ""}`).join("")}</div><div class="lab">${esc(stageNote)}</div></div>`;
}
function renderMap() {
  const def = SCENE[G.scene];
  const nodes = DATA.concept.nodes, byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const col = { qft: "var(--qft)", ck: "var(--ck)", ncg: "var(--ncg)", aqft: "var(--aqft)", synth: "var(--synth)" };
  let s = "";
  const wOf = (n) => Math.max(40, n.label.length * 4.6 + 10);
  for (const [a, b] of DATA.concept.edges) { const p = byId[a], q = byId[b]; s += path(`M${p.x} ${p.y + 6}L${q.x} ${q.y - 6}`, "edge"); }
  for (const [a, b] of DATA.concept.related) { const p = byId[a], q = byId[b]; s += path(`M${p.x} ${p.y}Q${(p.x + q.x) / 2 + 40} ${(p.y + q.y) / 2} ${q.x} ${q.y}`, "rel"); }
  s += txt(8, 330, "NCG TRACK", "xs mono mut") + txt(252, 330, "AQFT TRACK", "xs mono mut", 'text-anchor="end"');
  for (const n of nodes) {
    const on = n.scenes.includes(G.scene), w = wOf(n);
    s += `<g class="node${on ? " on" : ""}" data-scene="${n.scenes[0]}" role="button" tabindex="0" aria-label="${esc(n.label)}"><rect x="${r1(n.x - w / 2)}" y="${n.y - 8}" width="${r1(w)}" height="16" rx="8" style="stroke:${col[n.track]};${on ? `fill:${col[n.track]};` : ""}"/><text x="${n.x}" y="${n.y + 2.6}" text-anchor="middle" style="${on ? "fill:var(--bg)" : ""}">${esc(n.label)}</text></g>`;
  }
  $("cmap").innerHTML = svg(260, 556, s, "Concept graph of QFT");
  const groups = Object.keys(TRACKS).map((t) => {
    const items = SCENES.filter((sc) => sc.track === t);
    const open = def.track === t;
    return `<details${open ? " open" : ""}><summary style="color:${TRACKS[t].color}">${esc(TRACKS[t].name)} (${items.length})</summary><ul>${items.map((sc) => `<li><button type="button" data-scene="${sc.id}" aria-current="${sc.id === G.scene}">${esc(sc.title)}<span class="sec">§${sc.sections.join(", ")}</span></button></li>`).join("")}</ul></details>`;
  }).join("");
  $("scenelist").innerHTML = groups;
}
function renderHead() {
  const def = SCENE[G.scene], tr = TRACKS[def.track];
  const chip = $("s-track");
  chip.textContent = tr.name;
  chip.setAttribute("style", `--c:${tr.color};--cb:${tr.bg}`);
  $("s-secs").textContent = `spec §${def.sections.join(", §")}`;
  $("s-title").textContent = def.title;
  $("s-summary").innerHTML = def.summary || "";
  $("switches").innerHTML = `<span class="lab">Ontology</span>${seg("g.ontology", DATA.ontologies.map((o) => [o.id, o.name]), G.ontology)}
    <span class="lab">Lens</span>${seg("g.lens", LENS_TABS.map(([id, label]) => [id, label]), G.lens)}
    <span class="lab">Spacetime</span>${seg("g.stMode", [["spacetime", "spacetime"], ["slice", "spatial slice"], ["euclid", "Euclidean"]], G.stMode)}
    ${toggle("g.advanced", "advanced", G.advanced)} ${toggle("g.playing", G.playing ? "❚❚ animation" : "▶ animation", G.playing)}`;
  const warns = [];
  if (def.track === "ncg") warns.push("<b>Noncommutative geometry</b> does not simply mean [x<sup>μ</sup>, x<sup>ν</sup>] ≠ 0 for physical coordinates. Connes' framework is broader: geometry is encoded by a (possibly noncommutative) algebra and spectral/operator data. Moyal-type spacetimes are a separate example.");
  if (def.track === "ck") warns.push("<b>Ordinary story:</b> ∞ appears → subtract a counterterm. <b>Connes–Kreimer story:</b> subdivergences form a Hopf algebra, regularized amplitudes form a loop of characters, and renormalization is a canonical factorization problem.");
  if (def.track === "aqft") warns.push("<b>Finite models are type I.</b> The matrix algebras here illustrate commutants, vacua and modular theory; the local algebras of relativistic QFT are type III, which appears only through modular data, never as a finite matrix.");
  if (def.graphs) warns.push("<b>Feynman diagrams</b> are terms in a perturbative expansion, not literal microscopic movies; internal lines are propagators, not particles that briefly exist.");
  for (const w of def.warnings || []) warns.push(w);
  $("warnings").innerHTML = warns.map(warn).join("");
}
function renderControls() {
  const def = SCENE[G.scene];
  let html = "";
  try { html = def.controls ? def.controls(ctxOf()) : ""; } catch (e) { html = `<span class="fail small">controls failed: ${esc(e.message)}</span>`; }
  $("controls").innerHTML = html;
}
function panelOut(def, key, ctx) {
  try {
    const r = (def.panels && def.panels[key]) ? def.panels[key](ctx) : DEFAULT_PANELS[key](ctx);
    return r || DEFAULT_PANELS[key](ctx);
  } catch (e) {
    if (typeof console !== "undefined") console.error(e);
    return { title: key.toUpperCase(), body: `<p class="fail small">This panel failed to draw: ${esc(e.message)}</p>` };
  }
}
function renderPanels(only) {
  const def = SCENE[G.scene], ctx = ctxOf();
  const focusPanel = (LENS_TABS.find((l) => l[0] === G.lens) || [])[2];
  for (const [key, defTitle] of PANELS) {
    if (only && !only.includes(key)) continue;
    const r = panelOut(def, key, ctx);
    $(`pt-${key}`).textContent = supify(r.title || defTitle, "plain");
    $(`ps-${key}`).innerHTML = supify(r.sub || "");
    $(`pb-${key}`).innerHTML = r.body || "";
    $(`pf-${key}`).innerHTML = supify(r.foot || "");
    const p = $(`panel-${key}`);
    p.className = `panel${key === focusPanel ? " focus" : ""}${G.maxPanel === key ? " maxed" : ""}`;
    p.setAttribute("style", `--c:${TRACKS[def.track].color}`);
  }
  $("quad").className = `quad${G.maxPanel ? " max" : ""}`;
  if (G.hl) { const k = G.hl; G.hl = null; setHighlight(k); }
  if (PRESENT.open) renderPresentPanels();
}
function renderNotes() {
  const def = SCENE[G.scene], ctx = ctxOf();
  let text = "", side = "";
  try {
    text = def.notes ? def.notes(ctx) : "";
    const ont = DATA.ontologies.find((o) => o.id === G.ontology);
    const ontText = def.ontology ? def.ontology(ctx, G.ontology) : null;
    side = (def.side ? def.side(ctx) : "")
      + `<h3>Same process, ${esc(ont.name.toLowerCase())} view</h3><p class="small">${ontText || esc(ont.emu)}</p>`
      + (def.graphs && def.id !== "tree" ? `<h3>QED Feynman rules</h3><table class="t"><tbody><tr><td>electron line</td><td>${tex("i(\\not{p}+m)/(p^2-m^2)")}</td></tr><tr><td>photon line</td><td>${tex("-ig_{\\mu\\nu}/q^2")}</td></tr><tr><td>vertex</td><td>${tex("-ie\\gamma^\\mu")}</td></tr><tr><td>closed fermion loop</td><td>extra −1</td></tr><tr><td>internal momentum</td><td>${tex("\\int d^4k/(2\\pi)^4")}</td></tr></tbody></table>` : "")
      + (def.refs.length ? `<h3>Sources</h3><ol class="sources">${def.refs.map((r) => `<li>${esc(DATA.references[r] ? DATA.references[r].cite : r)}${DATA.references[r] && DATA.references[r].url ? ` <a href="${esc(DATA.references[r].url)}">arXiv</a>` : ""}</li>`).join("")}</ol>` : "");
    if (def.details) text += `<details class="rig"${G.advanced ? " open" : ""}><summary>Rigorous details</summary>${def.details(ctx)}</details>`;
  } catch (e) { text = `<p class="fail small">Notes failed: ${esc(e.message)}</p>`; }
  $("n-text").innerHTML = text;
  $("n-side").innerHTML = side;
}
function renderAll() {
  renderLenses();
  renderStatus();
  renderMap();
  renderHead();
  renderControls();
  renderPanels();
  renderNotes();
  if ($("btn-connes")) $("btn-connes").setAttribute("aria-pressed", String(G.scene === "connes"));
}

/* ---------- navigation ---------- */
let PREV_SCENE = null;
function goScene(id, preset, { focus = false } = {}) {
  if (!SCENE[id]) return;
  if (G.scene !== id) PREV_SCENE = G.scene;
  G.scene = id;
  G.maxPanel = null;
  const st = sceneState(id);
  if (preset) for (const [k, v] of Object.entries(preset)) { if (k.startsWith("g.")) G[k.slice(2)] = v; else st[k] = v; }
  if (SCENE[id].onEnter) SCENE[id].onEnter(ctxOf(id));
  try { if (typeof history !== "undefined" && history.replaceState && typeof location !== "undefined" && location.protocol !== "file:") history.replaceState(null, "", `#${id}`); } catch (e) { /* sandboxed */ }
  renderAll();
  if (focus) { const t = $("s-title"); if (t && t.focus) t.focus(); if (t && t.scrollIntoView) t.scrollIntoView({ block: "start", behavior: "smooth" }); }
}
ACTIONS.maxpanel = (arg) => { G.maxPanel = G.maxPanel === arg ? null : arg; renderPanels(); };
ACTIONS.refs = () => openDrawer();
GLOBAL_ON_SET.lens = () => {};

/* ---------- palette ---------- */
function paletteItems() {
  const items = DATA.commands.map((c) => ({ label: c.label, hint: SCENE[c.scene] ? SCENE[c.scene].title : "", run: () => goScene(c.scene, c.preset, { focus: true }) }));
  for (const sc of SCENES) items.push({ label: sc.title, hint: `§${sc.sections.join(", ")} · ${TRACKS[sc.track].name}`, run: () => goScene(sc.id, null, { focus: true }) });
  items.push({ label: "presentation mode", hint: "27 steps", run: () => openPresent(0) });
  items.push({ label: "Connes view", hint: "conceptual map", run: () => goScene("connes", null, { focus: true }) });
  items.push({ label: "export Markdown", hint: "download", run: () => saveMarkdown() });
  items.push({ label: "beamdswitch deck", hint: "narrated report", run: () => saveDeck() });
  items.push({ label: "references", hint: "drawer", run: () => openDrawer() });
  return items;
}
function openPalette() {
  $("palette").hidden = false;
  const inp = $("palette-input");
  inp.value = "";
  PALETTE.sel = 0;
  drawPalette();
  if (inp.focus) inp.focus();
}
function closePalette() { $("palette").hidden = true; }
function drawPalette() {
  const q = String($("palette-input").value || "").toLowerCase().split(/\s+/).filter(Boolean);
  PALETTE.items = paletteItems().filter((it) => q.every((w) => `${it.label} ${it.hint}`.toLowerCase().includes(w))).slice(0, 40);
  PALETTE.sel = Math.min(PALETTE.sel, Math.max(0, PALETTE.items.length - 1));
  $("palette-list").innerHTML = PALETTE.items.map((it, i) => `<li role="option" data-pi="${i}" aria-selected="${i === PALETTE.sel}"><span>${esc(it.label)}</span><span class="k">${esc(it.hint)}</span></li>`).join("") || `<li class="muted">No command matches.</li>`;
}
function runPalette(i) { const it = PALETTE.items[i]; closePalette(); if (it) it.run(); }

/* ---------- reference drawer ---------- */
function openDrawer() {
  const def = SCENE[G.scene], d = $("drawer");
  const cur = new Set(def.refs);
  const all = Object.entries(DATA.references);
  const item = ([id, r]) => `<li class="${cur.has(id) ? "cur" : ""}">${esc(r.cite)}${r.url ? ` <a href="${esc(r.url)}">arXiv</a>` : ""}${(() => { const used = SCENES.filter((s) => s.refs.includes(id)).map((s) => s.title); return used.length ? `<br><span class="tiny muted">used in: ${esc(used.slice(0, 6).join(", "))}${used.length > 6 ? "…" : ""}</span>` : ""; })()}</li>`;
  d.innerHTML = `<button class="btn small" type="button" data-act="closedrawer">Close</button><h2>This view: ${esc(def.title)}</h2><ol>${all.filter(([id]) => cur.has(id)).map(item).join("") || "<li>No references attached.</li>"}</ol><h2>Every reference</h2><ol>${all.map(item).join("")}</ol><p class="tiny muted">Local relativistic QFT algebras being hyperfinite type III₁ is an operator-algebraic result (Buchholz, D'Antoni & Fredenhagen 1987; Yngvason 2005) that uses Connes' classification of factors; it is not the spectral-action construction.</p>`;
  d.hidden = false;
}
ACTIONS.closedrawer = () => { $("drawer").hidden = true; };

/* ---------- presentation ---------- */
function openPresent(i) {
  PRESENT.open = true;
  PRESENT.i = clamp(i, 0, DATA.presentation.length - 1);
  const sl = DATA.presentation[PRESENT.i];
  if (SCENE[sl.scene]) goScene(sl.scene, sl.preset);
  $("present").hidden = false;
  renderPresent();
}
function closePresent() { PRESENT.open = false; $("present").hidden = true; }
function presentPanelsFor(def) {
  if (def.present) return def.present;
  const own = ["field", "diagram", "space", "algebra"].filter((k) => def.panels && def.panels[k]);
  return (own.length ? own : ["diagram", "algebra"]).slice(0, 2);
}
function renderPresent() {
  const sl = DATA.presentation[PRESENT.i], def = SCENE[sl.scene] || SCENE[G.scene];
  const n = DATA.presentation.length;
  $("present").innerHTML = `<div class="ph"><div><span class="n">${String(sl.n).padStart(2, "0")} / ${n}</span><h2>${esc(sl.title)}</h2></div><div class="toolbar"><button class="btn small" type="button" data-act="pprev">← Previous</button><button class="btn small" type="button" data-act="pnext">Next →</button><button class="btn small" type="button" data-act="pclose">Close (Esc)</button></div></div>
    <div class="pstage" id="pstage"></div>
    <div><p class="pcap">${supify(esc(sl.caption))}</p><div class="pnav"><div class="dots">${DATA.presentation.map((p, i) => `<button type="button" data-act="pgo" data-arg="${i}" aria-current="${i === PRESENT.i}" title="${esc(p.title)}">${p.n}</button>`).join("")}</div><span class="small muted">${esc(TRACKS[def.track].name)} · ${esc(def.title)}</span></div></div>`;
  renderPresentPanels();
}
function renderPresentPanels() {
  const host = $("pstage");
  if (!host) return;
  const def = SCENE[G.scene], ctx = ctxOf();
  host.innerHTML = presentPanelsFor(def).map((key) => { const r = panelOut(def, key, ctx); return `<div class="panel"><header><span class="ptitle">${esc(supify(r.title || key, "plain"))}</span><span class="psub">${supify(r.sub || "")}</span></header><div class="pbody">${r.body || ""}</div><div class="pfoot">${supify(r.foot || "")}</div></div>`; }).join("");
}
ACTIONS.pprev = () => openPresent(PRESENT.i - 1);
ACTIONS.pnext = () => openPresent(PRESENT.i + 1);
ACTIONS.pgo = (arg) => openPresent(Number(arg));
ACTIONS.pclose = () => closePresent();

/* ---------- exports ---------- */
const jsonSafe = (o) => { const out = {}; for (const [k, v] of Object.entries(o || {})) if (["number", "string", "boolean"].includes(typeof v) || (Array.isArray(v) && v.every((x) => typeof x === "number"))) out[k] = v; return out; };
function globalParams() {
  return { scale_mu_MeV: Number(muNow().toPrecision(6)), alpha_inverse_MSbar_one_loop: Number((1 / alphaNow()).toPrecision(9)), loop_order: G.order, regulator: G.reg, epsilon: G.reg === "dimreg" ? G.eps : null, cutoff_MeV: G.reg === "dimreg" ? null : Number(Math.pow(10, G.logLambda).toPrecision(4)), renormalization_state: STAGES[G.stage] };
}
function currentMarkdown() {
  const def = SCENE[G.scene], ctx = ctxOf();
  let doc = def.md ? def.md(ctx) : null;
  if (!doc) doc = { sections: [{ heading: def.title, body: stripHtml(def.notes ? def.notes(ctx) : def.summary || "") }] };
  return REP.markdown({
    title: doc.title || def.title,
    meta: { tool: "connes-qft", url: DATA.url, scene: def.id, spec_sections: def.sections.join(", "), track: TRACKS[def.track].name, parameters: { ...globalParams(), ...jsonSafe(ctx.s), ...(doc.params || {}) } },
    intro: doc.intro || stripHtml(def.summary || ""),
    sections: doc.sections,
    sources: def.refs.map((r) => (DATA.references[r] ? DATA.references[r].cite : r)),
  });
}
function stripHtml(h) { return String(h).replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|li|h3|div)>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim(); }
function deckKindFor(def) { return def.deckKind || { qft: "vp", ck: "birkhoff", ncg: "spectral", aqft: "modular", synth: "vp" }[def.track]; }
function deckData(kind) {
  const s = sceneState(G.scene);
  if (kind === "vp") return ENG.vacuumPolarization({ Q2: s.Q2 || (s.logQ2 != null ? Math.pow(10, s.logQ2) * ME * ME : 4 * ME * ME), mu: muNow() });
  if (kind === "birkhoff") return ENG.birkhoffGraph(BIRKHOFF_GRAPHS.includes(s.graph) ? s.graph : "sigma2_rainbow", s.L ?? 0.5);
  if (kind === "spectral") return ENG.spectralToGauge({ N: s.N || 8, amplitude: s.amp ?? 0.6, Lambda: s.Lambda || 1.5, cutoff: s.cutoff || "gauss" });
  return ENG.regionToModular({ p: Array.isArray(s.p) ? s.p : typeof s.p === "number" ? [s.p, 1 - s.p] : [0.7, 0.3], t: s.t ?? 0.25 });
}
const today = () => { try { return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } };
function currentDeck() { const kind = deckKindFor(SCENE[G.scene]); return BEAM.deck(REP.deckReport(kind, deckData(kind), { date: today() })); }
function ioMsg(text, kind) { const el = $("io-msg"); el.textContent = text; el.className = `msg ${kind || ""}`; }
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function copyText(text, what) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("no clipboard API");
    await navigator.clipboard.writeText(text);
    ioMsg(`Copied the ${what}.`, "ok");
  } catch (err) {
    $("fallback").hidden = false;
    $("fallback-label").textContent = `Clipboard access is blocked; the ${what} is selected below. Press Ctrl+C or ⌘C.`;
    const ta = $("fallback-text"); ta.value = text; if (ta.focus) ta.focus(); if (ta.select) ta.select();
  }
}
const BIRKHOFF_GRAPHS = ["sigma1", "pi1", "lambda1", "sigma2_rainbow", "sigma2_crossed", "sigma2_vp", "pi2_se", "pi2_crossed", "lambda2_ladder", "sigma3_rainbow", "sigma3_double"];
const DECK_NAME = "connes-qft-beamdswitch.md";
function saveDeck() {
  try { download(DECK_NAME, currentDeck(), "text/markdown"); ioMsg(`Saved ${DECK_NAME}: open it in beamdswitch.`, "ok"); }
  catch (err) { ioMsg(`Could not save: ${err.message}. Use Copy deck instead.`, "bad"); }
}
function saveMarkdown() {
  const name = `connes-qft-${G.scene}.md`;
  try { download(name, currentMarkdown(), "text/markdown"); ioMsg(`Saved ${name}.`, "ok"); }
  catch (err) { ioMsg(`Could not save: ${err.message}. Use Copy Markdown instead.`, "bad"); }
}

/* ---------- self-test ---------- */
let SELF = [];
function runSelfTests() {
  try { SELF = ENG.selfTests(); } catch (e) { SELF = [{ name: "Self-test crashed", pass: false, detail: String(e && e.message) }]; }
  const failed = SELF.filter((x) => !x.pass), b = $("selftest-badge");
  b.className = `badge ${failed.length ? "fail" : "pass"}`;
  b.textContent = failed.length ? `✗ Self-test: ${failed.length} of ${SELF.length} fail` : `✓ Self-test ${SELF.length}/${SELF.length}`;
  b.title = SELF.map((x) => `${x.pass ? "PASS" : "FAIL"} ${x.name}${x.detail ? ` (${x.detail})` : ""}`).join("\n");
  return SELF;
}

/* ---------- WebMCP: read-only tools ---------- */
const out = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
const empty = { type: "object", properties: {}, additionalProperties: false };
const laurentJSON = (s) => ({ lowest_power: s.lo, coefficients: s.c, known_to_order: Number.isFinite(s.hi) ? s.hi : null, text: LS.toText(s) });
const TOOLS = [
  { name: "get_metadata", description: "Return the scope, conventions, the three lenses, the list of views (scenes) with their specification sections, the presentation sequence and the references of this QED laboratory.", inputSchema: empty, annotations: { readOnlyHint: true },
    async execute() { return out({ ...ENG.META, lenses: DATA.lenses, scenes: SCENES.map((s) => ({ id: s.id, title: s.title, track: s.track, sections: s.sections })), presentation: DATA.presentation.map((p) => ({ n: p.n, title: p.title, scene: p.scene })), references: DATA.references }); } },
  { name: "get_current_state", description: "Return the page's current view, global state (scale μ, one-loop MS-bar coupling, loop order, regulator, renormalization state, ontology and lens) and the view's own parameters.", inputSchema: empty, annotations: { readOnlyHint: true },
    async execute() { const def = SCENE[G.scene]; return out({ scene: def.id, title: def.title, track: def.track, sections: def.sections, global: globalParams(), ontology: G.ontology, lens: G.lens, spacetime_mode: G.stMode, scene_state: jsonSafe(sceneState(G.scene)), presentation: PRESENT.open ? DATA.presentation[PRESENT.i].n : null }); } },
  { name: "compute_vacuum_polarization", description: "Compute the one-loop QED vacuum polarization Π₂(q²; ε) in d = 4 − ε for spacelike q² = −Q²: its Laurent series, 1/ε pole, MS and MS-bar finite parts, the β-function from the counterterm, and the Connes–Kreimer Birkhoff factors. Does not change the page.", inputSchema: { type: "object", properties: { Q2_MeV2: { type: "number", description: "Q² = −q² > 0 in MeV² (default 4m_e²)" }, mu_MeV: { type: "number", description: "renormalization scale μ in MeV (default m_e)" } }, additionalProperties: false }, annotations: { readOnlyHint: true },
    async execute(input = {}) {
      const Q2 = input.Q2_MeV2 ?? 4 * ME * ME, mu = input.mu_MeV ?? ME;
      if (!(Q2 > 0) || !(mu > 0)) return out({ error: "Q2_MeV2 and mu_MeV must be positive" });
      const v = ENG.vacuumPolarization({ Q2, mu });
      return out({ Q2_MeV2: Q2, mu_MeV: mu, series: laurentJSON(v.series), pole_residue: v.residue, pole_residue_expected: v.residueExpected, finite: v.finite, mu_derivative: v.dPiDlogMu, beta_e: v.running.betaE, beta_expected: v.running.betaExpected, hopf: v.hopf, birkhoff: { gamma_minus: laurentJSON(v.birkhoff.gammaMinus), gamma_plus_at_0: v.birkhoff.renormalized, agrees_with_MS: v.birkhoff.agreesWithMS }, scheme: "one loop, MS and MS-bar, one Dirac fermion" });
    } },
  { name: "analyse_feynman_graph", description: "Analyse a QED Feynman graph: valence and charge flow, loop number L = I − V + C, connectedness, one-particle irreducibility, superficial degree of divergence, divergent subgraphs, and (for divergent 1PI graphs) the Connes–Kreimer coproduct. Give a catalogue id or a graph {vertices: [{id, kind: v|ct|ext}], edges: [{id, a, b, type: e|g}]}.", inputSchema: { type: "object", properties: { graph: { description: "catalogue id (e.g. pi1, sigma2_rainbow) or a graph object" } }, required: ["graph"], additionalProperties: false }, annotations: { readOnlyHint: true },
    async execute(input = {}) {
      try {
        const g = typeof input.graph === "string" ? GR.byId(input.graph) : { id: "custom", name: "custom graph", ...input.graph, vertices: (input.graph.vertices || []).map((v) => ({ x: 0, y: 0, ...v })), edges: (input.graph.edges || []).map((e) => ({ bend: 0, ...e })) };
        const a = ENG.analyseGraph(g);
        return out({ id: a.id, valid: a.valid, issues: a.issues, L: a.L, loop_formula: a.loopFormula, connected: a.connected, onePI: a.onePI, bridges: a.bridges, external: a.external, residue: a.residue, omega: a.omega, verdict: a.verdict, divergent_subgraphs: a.divergentSubgraphs.map((s) => ({ edges: s.edges, residue: s.residue.name, L: s.L, omega: s.omega })), overlapping: a.overlapping, coproduct: a.coproduct, forests: a.forestCount });
      } catch (e) { return out({ error: e.message, catalogue: GR.CATALOGUE.map((c) => c.id) }); }
    } },
  { name: "birkhoff_decomposition", description: "Renormalize a catalogue graph with nested or overlapping subdivergences by the Connes–Kreimer Birkhoff recursion, using the iterated-integral toy Feynman rules φ(T) = e^{−|T|εL}/(T! ε^{|T|}) at L = log μ. Returns the coproduct, antipode, counterterm γ₋ and renormalized value γ₊(0).", inputSchema: { type: "object", properties: { graph: { type: "string", enum: ["sigma1", "pi1", "lambda1", "sigma2_rainbow", "sigma2_crossed", "sigma2_vp", "pi2_se", "pi2_crossed", "lambda2_ladder", "sigma3_rainbow", "sigma3_double"] }, L: { type: "number", description: "log μ (default 0.5)" } }, required: ["graph"], additionalProperties: false }, annotations: { readOnlyHint: true },
    async execute(input = {}) {
      try { const b = ENG.birkhoffGraph(input.graph, input.L ?? 0.5); return out({ graph: b.id, name: b.name, L: b.L, trees: b.trees, coproduct: b.coproduct, antipode: b.antipode, character: laurentJSON(b.phi), counterterm: laurentJSON(b.minus), renormalized: b.renormalized, reconstruction_error: Math.max(0, ...b.reconstruction.c.map(Math.abs)), model: "toy Feynman rules (Connes–Kreimer / Kreimer iterated integrals), not QED values" }); }
      catch (e) { return out({ error: e.message }); }
    } },
  { name: "finite_spectral_triple", description: "Compute with finite spectral triples: the two-point space's Connes distance 1/|m|, and the doubled lattice ring whose inner fluctuation D ↦ D + A + JAJ⁻¹ carries a U(1) link field (flux, opposite antiparticle flux, spectrum, gauge invariance) and its spectral action Tr f(D_A/Λ).", inputSchema: { type: "object", properties: { m: { type: "number", description: "two-point Dirac entry (default 1)" }, N: { type: "integer", minimum: 3, maximum: 24 }, amplitude: { type: "number" }, Lambda: { type: "number" }, cutoff: { type: "string", enum: ["sharp", "gauss", "smooth"] } }, additionalProperties: false }, annotations: { readOnlyHint: true },
    async execute(input = {}) {
      const m = input.m ?? 1, N = input.N ?? 8, amplitude = input.amplitude ?? 0.6, Lambda = input.Lambda ?? 1.5, cutoff = input.cutoff ?? "gauss";
      if (!Number.isInteger(N) || N < 3 || N > 24) return out({ error: "N must be an integer from 3 to 24" });
      if (typeof cutoff !== "string" || !Object.hasOwn(SP.CUTOFFS, cutoff)) return out({ error: `cutoff must be one of ${Object.keys(SP.CUTOFFS).join(", ")}` });
      if (!(Number.isFinite(Lambda) && Lambda > 0)) return out({ error: "Lambda must be a positive finite number" });
      if (!(Number.isFinite(m) && m !== 0) || !Number.isFinite(amplitude)) return out({ error: "m must be finite and nonzero, and amplitude finite" });
      try {
        const tp = SP.twoPoint(m);
        const r = ENG.spectralToGauge({ N, amplitude, Lambda, cutoff });
        return out({ two_point: { m, distance: tp.distance, exact: tp.exact }, ring: { N: r.N, particle_phases: r.particlePhases, antiparticle_phases: r.antiparticlePhases, flux: r.flux, antiparticle_flux: r.antiFlux, spectrum: r.spectrum, gauge_invariance_error: r.gaugeInvariance, single_copy_phases_with_J: r.singleCopyPhases }, spectral_action: { Lambda: r.spectralAction.Lambda, cutoff: r.spectralAction.cutoff, fluctuated: r.spectralAction.fluctuated, unfluctuated: r.spectralAction.bare }, torus_curvature: r.torus.B, note: "lattice stand-ins for continuum Dirac operators" });
      } catch (e) { return out({ error: e.message }); }
    } },
  { name: "modular_theory", description: "Tomita–Takesaki theory on the matrix surrogate M_n with a faithful state ρ = diag(p): cyclic/separating test, S(AΩ) = A*Ω, the polar decomposition S = JΔ^{1/2}, the spectrum of Δ, the modular Hamiltonian K = −log Δ and the flowed observable σ_t(A) = Δ^{it}AΔ^{−it}.", inputSchema: { type: "object", properties: { p: { type: "array", items: { type: "number" }, description: "positive weights summing to 1 (default [0.7, 0.3])" }, t: { type: "number", description: "modular time (default 0.25)" } }, additionalProperties: false }, annotations: { readOnlyHint: true },
    async execute(input = {}) {
      const p = input.p ?? [0.7, 0.3];
      if (!Array.isArray(p) || p.length < 2 || p.length > 4 || p.some((x) => !(x > 0)) || Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 1e-9) return out({ error: "p must be 2 to 4 positive weights summing to 1" });
      const r = ENG.regionToModular({ p, t: input.t ?? 0.25 });
      return out({ p, cyclic_separating: r.cyclic, delta_spectrum: r.deltaEigenvalues, modular_hamiltonian_spectrum: r.K, checks: r.check, kms_error: r.kms, t: r.t, flowed_observable: r.flowed, wedge: r.wedge, note: "finite (type I) surrogate; local algebras in relativistic QFT are type III" });
    } },
  { name: "run_self_tests", description: "Run the engine's self-test: Dirac spinors, the e⁻μ⁻ spin sum, the vacuum-polarization pole, β from the counterterm, F₂(0), Feynman parameters, Wick pairings, graph analysis, the antipode, Birkhoff values and μ-independent counterterms, Connes distance, product spectra, inner fluctuations, Poisson summation, commutants, Tomita and KMS, spectral flow.", inputSchema: empty, annotations: { readOnlyHint: true },
    async execute() { const t = ENG.selfTests(); return out({ passed: t.filter((x) => x.pass).length, total: t.length, results: t }); } },
];
self.ConnesQFTTools = TOOLS;

/* ---------- events ---------- */
function onClick(ev) {
  const t = ev.target && ev.target.closest ? ev.target : null;
  if (!t) return;
  const sc = t.closest("[data-scene]");
  if (sc && !t.closest("[data-act]")) { let preset = null; try { preset = sc.getAttribute("data-preset") ? JSON.parse(sc.getAttribute("data-preset")) : null; } catch (e) { preset = null; } if (PRESENT.open) closePresent(); goScene(sc.getAttribute("data-scene"), preset, { focus: true }); return; }
  const st = t.closest("[data-set]");
  if (st) { setKey(st.getAttribute("data-set"), parseVal(st.getAttribute("data-val"))); renderAll(); return; }
  const ac = t.closest("[data-act]");
  if (ac) {
    const name = ac.getAttribute("data-act"), arg = ac.getAttribute("data-arg");
    const def = SCENE[G.scene];
    if (def.actions && def.actions[name]) { def.actions[name](ctxOf(), arg, ev); renderAll(); }
    else if (ACTIONS[name]) ACTIONS[name](arg, ev);
    return;
  }
  const pi = t.closest("[data-pi]");
  if (pi) runPalette(Number(pi.getAttribute("data-pi")));
}
function onInput(ev) {
  const t = ev.target;
  const key = t && t.getAttribute && t.getAttribute("data-bind");
  if (!key) return;
  const v = parseVal(String(t.value));
  setKey(key, v);
  const o = t.parentElement && t.parentElement.querySelector ? t.parentElement.querySelector("output") : null;
  if (key.startsWith("g.")) { renderStatus(); renderPanels(); renderNotes(); renderHead(); return; }
  if (o) o.textContent = t.value;
  renderPanels();
  renderNotes();
  const def = SCENE[G.scene];
  if (def.rerenderControls) { const ae = document.activeElement; renderControls(); const again = document.querySelector && document.querySelector(`[data-bind="${key}"]`); if (again && ae && ae.getAttribute && ae.getAttribute("data-bind") === key && again.focus) again.focus(); }
}
function onOver(ev) {
  const t = ev.target && ev.target.closest ? ev.target : null;
  if (!t) return;
  const l = t.closest("[data-link]");
  setHighlight(l ? l.getAttribute("data-link") : null);
  const tip = t.closest("[data-tip]");
  showTip(tip ? tip.getAttribute("data-tip") : null, ev.clientX || 0, ev.clientY || 0);
}
function onDown(ev) {
  const t = ev.target && ev.target.closest ? ev.target.closest("[data-drag]") : null;
  if (!t) return;
  const svgEl = t.closest("svg"), panel = t.closest(".pbody");
  if (!svgEl || !panel) return;
  ev.preventDefault();
  DRAG = { name: t.getAttribute("data-drag"), arg: t.getAttribute("data-arg"), panel: panel.id };
  dragAt(ev, "start");
}
function dragAt(ev, phase) {
  if (!DRAG) return;
  const def = SCENE[G.scene];
  const host = $(DRAG.panel);
  const svgEl = host && host.querySelector ? host.querySelector("svg") : null;
  if (!svgEl || !def.drag || !def.drag[DRAG.name]) return;
  const p = svgPoint(svgEl, ev.clientX, ev.clientY);
  def.drag[DRAG.name](ctxOf(), p, phase, DRAG.arg);
  renderPanels();
  renderNotes();
}
function onKey(ev) {
  const k = ev.key;
  if ((ev.metaKey || ev.ctrlKey) && (k === "k" || k === "K")) { ev.preventDefault(); if ($("palette").hidden) openPalette(); else closePalette(); return; }
  if (!$("palette").hidden) {
    if (k === "Escape") closePalette();
    else if (k === "ArrowDown") { PALETTE.sel = Math.min(PALETTE.items.length - 1, PALETTE.sel + 1); drawPalette(); ev.preventDefault(); }
    else if (k === "ArrowUp") { PALETTE.sel = Math.max(0, PALETTE.sel - 1); drawPalette(); ev.preventDefault(); }
    else if (k === "Enter") runPalette(PALETTE.sel);
    return;
  }
  if (PRESENT.open) {
    if (k === "Escape") closePresent();
    else if (k === "ArrowRight" || k === "PageDown" || k === " ") { ev.preventDefault(); openPresent(PRESENT.i + 1); }
    else if (k === "ArrowLeft" || k === "PageUp") { ev.preventDefault(); openPresent(PRESENT.i - 1); }
    return;
  }
  if (k === "Escape") { if (!$("drawer").hidden) $("drawer").hidden = true; else if (G.maxPanel) { G.maxPanel = null; renderPanels(); } }
  if (k === "Enter" && ev.target && ev.target.getAttribute && ev.target.getAttribute("data-scene") && ev.target.tagName === "g") goScene(ev.target.getAttribute("data-scene"), null, { focus: true });
}

/* ---------- animation ---------- */
let LAST = 0;
function tick(ts) {
  const dt = LAST ? Math.min(0.1, (ts - LAST) / 1000) : 0;
  LAST = ts;
  const def = SCENE[G.scene];
  if (G.playing && def.anim && !DRAG && !(typeof document !== "undefined" && document.hidden)) {
    G.t += dt;
    renderPanels(def.anim === true ? null : def.anim);
  }
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(tick);
}

/* ---------- start ---------- */
function readHash() {
  const h = String((typeof location !== "undefined" && location.hash) || "").replace(/^#/, "");
  if (SCENE[h]) G.scene = h;
}
function cycleTheme() {
  const root = document.documentElement, cur = root.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : cur === "light" ? null : "dark";
  if (next) root.setAttribute("data-theme", next); else root.removeAttribute("data-theme");
  ioMsg(`Theme: ${next || "follows the system"}.`, "ok");
}
function start() {
  $("nojs").hidden = true;
  $("app").hidden = false;
  readHash();
  if (!SCENE[G.scene]) G.scene = SCENES[0].id;
  if (SCENE[G.scene].onEnter) SCENE[G.scene].onEnter(ctxOf());
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onInput);
  document.addEventListener("pointerover", onOver);
  document.addEventListener("focusin", onOver);
  document.addEventListener("pointerdown", onDown);
  document.addEventListener("pointermove", (ev) => { if (DRAG) dragAt(ev, "move"); else if (ev.target && ev.target.closest && ev.target.closest("[data-tip]")) showTip(ev.target.closest("[data-tip]").getAttribute("data-tip"), ev.clientX, ev.clientY); });
  document.addEventListener("pointerup", (ev) => { if (DRAG) { dragAt(ev, "end"); DRAG = null; } });
  document.addEventListener("keydown", onKey);
  $("palette-input").addEventListener("input", () => { PALETTE.sel = 0; drawPalette(); });
  $("palette").addEventListener("click", (ev) => { if (ev.target === $("palette")) closePalette(); });
  $("btn-palette").addEventListener("click", openPalette);
  $("btn-present").addEventListener("click", () => openPresent(0));
  $("btn-connes").addEventListener("click", () => (G.scene === "connes" ? goScene(PREV_SCENE && PREV_SCENE !== "connes" ? PREV_SCENE : "flagship-vp") : goScene("connes", null, { focus: true })));
  $("btn-md").addEventListener("click", saveMarkdown);
  $("btn-md-copy").addEventListener("click", () => copyText(currentMarkdown(), "Markdown"));
  $("save-beamdswitch").addEventListener("click", saveDeck);
  $("copy-beamdswitch").addEventListener("click", () => copyText(currentDeck(), "beamdswitch deck: paste it into beamdswitch"));
  $("btn-refs").addEventListener("click", openDrawer);
  $("btn-theme").addEventListener("click", cycleTheme);
  $("selftest-badge").addEventListener("click", () => { runSelfTests(); ioMsg(`${SELF.filter((x) => x.pass).length} of ${SELF.length} self-tests pass; hover the badge for the list.`, SELF.every((x) => x.pass) ? "ok" : "bad"); });
  renderAll();
  runSelfTests();
  const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
  if (mc && typeof mc.registerTool === "function") for (const t of TOOLS) mc.registerTool(t);
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(tick);
}
/* A small read-only handle for the end-to-end check and debugging. */
self.ConnesQFTApp = { goScene, openPresent, closePresent, scenes: () => SCENES.map((x) => x.id), sceneMeta: () => SCENES.map((x) => ({ id: x.id, track: x.track, title: x.title, sections: [...x.sections], refs: [...(x.refs || [])] })), state: () => ({ ...G, scene_state: sceneState(G.scene) }), present: () => ({ ...PRESENT }), markdown: () => currentMarkdown(), deck: () => currentDeck() };
start();
