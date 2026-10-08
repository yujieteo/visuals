/* Synthesis track: the Connes view, the computational atlas, dictionaries, the three geometries,
   anomaly and spectral flow, cyclic cohomology, prerequisites, the grand synthesis, the final
   animation and the acceptance chains. */

/* ---------- §119 Connes master view ---------- */
function connesMap(W = 640, H = 400) {
  const cv = DATA.connesView;
  const box = (x, y, w, label, scene, cls, sub = false) => `<g data-scene="${scene}" role="button" tabindex="0" style="cursor:pointer"><rect x="${r1(x - w / 2)}" y="${y - 13}" width="${w}" height="26" rx="${sub ? 5 : 13}" class="${cls}" stroke-width="${sub ? 1 : 1.6}"/><text x="${x}" y="${y + 4}" text-anchor="middle" class="${sub ? "sm" : "sm mono"}" style="font-weight:${sub ? 500 : 650}">${esc(label)}</text></g>`;
  let s = "";
  const L = W * 0.27, R = W * 0.73, C = W / 2;
  s += box(C, 24, 190, cv.top, "synthesis", "bgsynth axis");
  s += path(`M${C} 37V52H${L}V70M${C} 52H${R}V70`, "axis", 'fill="none"');
  const leftScenes = ["matrices", "types", "modflow"], rightScenes = ["builder", "coproduct", "birkhoff"];
  cv.left.forEach((t, i) => { s += box(L, 84 + i * 52, i ? 170 : 200, t, leftScenes[i], i ? "bgaqft aqft" : "bgaqft aqft", i > 0); if (i < 2) s += arrow(L, 97 + i * 52, L, 123 + i * 52, "aqft"); });
  cv.right.forEach((t, i) => { s += box(R, 84 + i * 52, i ? 170 : 200, t, rightScenes[i], "bgck ck", i > 0); if (i < 2) s += arrow(R, 97 + i * 52, R, 123 + i * 52, "ck"); });
  s += path(`M${L} 201V222H${R}V201M${C} 222V238`, "axis", 'fill="none"');
  const bottomScenes = ["ncg-enter", "triple", "specaction", "sm"];
  cv.bottom.forEach((t, i) => { s += box(C, 252 + i * 40, i ? 180 : 250, t, bottomScenes[i], "bgncg ncg", i > 0); if (i < 3) s += arrow(C, 265 + i * 40, C, 279 + i * 40, "ncg"); });
  s += txt(C, H - 4, esc(cv.note), "xs ink2", 'text-anchor="middle"');
  return svg(W, H, s, "Connes view: conceptual map");
}
scene({
  id: "connes", track: "synth", title: "Connes view", sections: [119, 92],
  summary: "The laboratory as one conceptual map: operator algebras and Feynman graphs both flow into noncommutative geometry. Every box opens its view; the arrows relate, they do not equate.",
  refs: ["cm2008", "connes1994", "ck2000", "yngvason2005"],
  onEnter() { G.maxPanel = "space"; },
  panels: {
    space: () => ({ title: "CONNES VIEW", sub: "click a box", body: connesMap() }),
    field: () => ({ title: "SPECTRAL NCG", body: `<ul class="small">${DATA.comparison.ncg.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` }),
    diagram: () => ({ title: "ALGEBRAIC QFT", body: `<ul class="small">${DATA.comparison.aqft.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` }),
    algebra: () => ({ title: "COMMON LANGUAGE", body: `<ul class="small">${DATA.comparison.common.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="small muted">Shared tools, different questions: spectral geometry asks what the spectrum of D encodes; AQFT asks what the net of local algebras encodes.</p>` }),
  },
  notes: () => `<p>${esc(DATA.connesView.note)} Connes and Kreimer's Hopf algebra organizes perturbative subdivergences; the Chamseddine–Connes spectral action extracts actions from spectral triples; the type III₁ property of local algebras is a theorem of algebraic QFT that uses Connes' classification of factors. These are three results with a common author and common tools, not one formalism.</p><p>Press ⤢ on the map to see the comparison panels.</p>`,
});

/* ---------- §97 QED computational atlas ---------- */
const ATLAS = [
  ["free electromagnetic wave", "em", { mode: "wave" }, () => "E ⊥ B ⊥ k, |E| = |B|"],
  ["Dirac plane wave", "dirac", null, () => `‖(p̸ − m)u‖ = ${QED.diracResidual(QED.onShell(1, [0.3, 0, 0.6]), 1, 0).toExponential(1)}`],
  ["tree-level eμ scattering", "tree", null, () => { const r = ENG.treeAmplitude(); return `⟨|𝓜|²⟩ = ${fmt(r.amp.avg, 4)}`; }],
  ["electron propagator", "propagators", { which: "electron" }, () => "i(p̸ + m)/(p² − m² + iε)"],
  ["photon propagator", "propagators", { which: "photon" }, () => "−ig_μν/(q² + iε)"],
  ["electron self-energy", "selfenergy", null, () => `δm ≈ ${fmt(QED.deltaMass(1e3), 3)} MeV at Λ = 1 GeV`],
  ["vacuum polarization", "flagship-vp", null, () => `pole ${fmt(-2 * Q.ALPHA / (3 * PI), 4)}/ε`],
  ["vertex correction", "vertex", null, () => `a_e = α/2π = ${fmt(QED.F2(0), 5)}`],
  ["one-loop running charge", "running", null, () => `1/α(m_Z) = ${fmt(1 / QED.alphaRun(Q.CONST.mZ.value), 5)} (e⁻ only)`],
  ["Ward identity", "ward", null, () => "Z₁ = Z₂"],
  ["dimensional regularization Laurent series", "dimreg", null, () => "a₋₁/ε + a₀ + a₁ε"],
  ["minimal subtraction", "dimreg", { split: true }, () => "γ₋ = −T φ"],
  ["Hopf coproduct of a graph", "coproduct", null, () => `${HO.coproduct(GR.byId("sigma3_rainbow")).length} terms (3-loop rainbow)`],
  ["Birkhoff decomposition", "birkhoff", null, () => `γ₊(0) = ${fmt(ENG.birkhoffGraph("sigma2_rainbow", 0.5).renormalized, 4)}`],
  ["spectral triple distance", "twopoint", null, () => `d = 1/|m| = ${fmt(SP.twoPoint(2).distance, 4)}`],
  ["inner fluctuation producing U(1) field", "fluctuation", null, () => `flux ${fmt(ENG.spectralToGauge().flux, 4)}`],
  ["spectral action cutoff", "specaction", null, () => `Tr f(D/Λ) = ${fmt(ENG.spectralToGauge().spectralAction.fluctuated, 4)}`],
  ["local von Neumann algebra", "commutant", null, () => "M″ = M"],
  ["modular flow", "modflow", null, () => "σ_t(A) = Δ^{it}AΔ^{−it}"],
];
scene({
  id: "atlas", track: "synth", title: "QED computational atlas", sections: [97],
  summary: "Nineteen one-click computations. Each card shows a number the engine has just computed and opens the view that works it out.",
  refs: ["ps", "ck2000", "vdDvS2013", "takesaki1970"],
  onEnter() { G.maxPanel = "space"; },
  panels: {
    space: () => {
      const cards = ATLAS.map(([label, sc, preset, f]) => {
        let v = "";
        try { v = f(); } catch (e) { v = "—"; }
        const tr = SCENE[sc] ? TRACKS[SCENE[sc].track] : TRACKS.synth;
        return `<button type="button" class="btn" style="display:flex;flex-direction:column;align-items:flex-start;white-space:normal;border-radius:.5rem;border-left:4px solid ${tr.color};min-height:3.6rem;text-align:left" data-scene="${sc}"${preset ? ` data-preset="${esc(JSON.stringify(preset))}"` : ""}><b class="small">${esc(label)}</b><span class="tiny muted">${esc(v)}</span></button>`;
      }).join("");
      return { title: "ONE-CLICK COMPUTATIONS", sub: `${ATLAS.length} entries`, body: `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));gap:.4rem">${cards}</div>` };
    },
  },
  notes: () => "<p>Every entry is computed when this view opens: nothing on the cards is typed in by hand. The colour bar on each card is the lens it belongs to.</p>",
});

/* ---------- §91–92 three notions of geometry ---------- */
scene({
  id: "geometries", track: "synth", title: "Three notions of geometry", sections: [91, 92],
  summary: "Classical geometry M (points and distances), noncommutative spectral geometry (𝒜, ℋ, D) (spectral data), and local quantum geometry 𝒪 ↦ 𝒜(𝒪) (causal regions and local observables), side by side. No one picture is claimed to subsume the others.",
  refs: ["connes1994", "haag", "cm2008"],
  init: () => ({ x: 0.4, y: 2.2 }),
  panels: {
    space: (c) => {
      let s = circ(200, 105, 80, "", 'fill="none" stroke="var(--qft)" stroke-width="2.4"');
      const P = (a) => [200 + 80 * Math.cos(a), 105 - 80 * Math.sin(a)];
      s += circ(...P(c.s.x), 6, "fqft") + circ(...P(c.s.y), 6, "fqft") + path(pathD(Q.linspace(c.s.x, c.s.y, 30).map(P)), "ck", 'fill="none" stroke-width="3" opacity="0.6"');
      return { title: "CLASSICAL GEOMETRY M", sub: "points / distances", body: svg(400, 210, s + txt(200, 205, `geodesic distance ${fmt(SP.circleDistance(c.s.x, c.s.y), 4)}`, "xs ink2", 'text-anchor="middle"'), "classical") };
    },
    field: () => ({ title: "SPECTRAL GEOMETRY (𝒜, ℋ, D)", sub: "spectral data", body: svg(400, 110, spectrumStrip(Q.range(21).map((i) => i - 10), { x: 10, y: 10, w: 380, h: 70, lim: 11 }), "spectrum") + `<p class="small">The same circle as C^∞(S¹) on L²(S¹) with D = −i d/dθ: spectrum ℤ; distances from ‖[D, f]‖ ≤ 1.</p>` }),
    diagram: () => { const M = minkowski({ W: 400, H: 200, scale: 40, cone: false }); return { title: "LOCAL QUANTUM GEOMETRY 𝒪 ↦ 𝒜(𝒪)", sub: "causal regions / local observables", body: svg(400, 200, M.s + poly([M.P(1, -1.4), M.P(0, -0.4), M.P(-1, -1.4), M.P(0, -2.4)], "bgaqft", 'stroke="var(--aqft)"') + poly([M.P(1, 1.6), M.P(0, 2.6), M.P(-1, 1.6), M.P(0, 0.6)], "bgaqft", 'stroke="var(--aqft)"') + txt(...M.P(1.2, -1.4), "𝒜(𝒪₁)", "xs", 'text-anchor="middle"') + txt(...M.P(1.2, 1.6), "𝒜(𝒪₂)", "xs", 'text-anchor="middle"') + txt(...M.P(-1.6, 0.1), "[𝒜(𝒪₁), 𝒜(𝒪₂)] = 0", "xs ink2", 'text-anchor="middle"'), "local") }; },
    algebra: () => ({ title: "SPECTRAL NCG vs ALGEBRAIC QFT", body: table(["SPECTRAL NCG", "ALGEBRAIC QFT"], Q.range(5).map((i) => [esc(DATA.comparison.ncg[i] || ""), esc(DATA.comparison.aqft[i] || "")])) + `<p class="small">Common language: ${DATA.comparison.common.map(esc).join(", ")}.</p>` }),
  },
  notes: () => `<p>Classical geometry, spectral geometry and local quantum geometry answer different questions with overlapping tools. The page keeps them in separate panels on purpose.</p>`,
});

/* ---------- §93 axial anomaly ---------- */
const TRIANGLE = { id: "triangle", name: "axial triangle", vertices: [{ id: "a", x: 100, y: 22, kind: "v" }, { id: "b", x: 55, y: 92, kind: "v" }, { id: "c", x: 145, y: 92, kind: "v" }, { id: "J", x: 100, y: 2, kind: "ext" }, { id: "g1", x: 15, y: 115, kind: "ext" }, { id: "g2", x: 185, y: 115, kind: "ext" }], edges: [{ id: "l1", a: "a", b: "b", type: "e", bend: 0 }, { id: "l2", a: "b", b: "c", type: "e", bend: 0 }, { id: "l3", a: "c", b: "a", type: "e", bend: 0 }, { id: "p1", a: "g1", b: "b", type: "g", bend: 0 }, { id: "p2", a: "g2", b: "c", type: "g", bend: 0 }] };
scene({
  id: "anomaly", track: "synth", title: "QED axial anomaly", sections: [93],
  summary: "Classically, for a massless Dirac fermion ∂<sub>μ</sub>J<sub>5</sub><sup>μ</sup> = 0. Quantum mechanically ∂<sub>μ</sub>J<sub>5</sub><sup>μ</sup> ∝ F<sub>μν</sub>F̃<sup>μν</sup>, from the triangle graph. A bridge between regularization, topology, index theory and spectral flow.",
  refs: ["abj1969", "fujikawa1979", "nn1983", "ps"],
  init: () => ({ E: 1, B: 1 }),
  controls: (c) => `${slider("E", "E (parallel to B)", -2, 2, 0.01, c.s.E, (v) => v.toFixed(2))} ${slider("B", "B", -2, 2, 0.01, c.s.B, (v) => v.toFixed(2))}`,
  panels: {
    diagram: () => ({ title: "THE TRIANGLE", sub: "axial current ↔ two photons", body: svg(400, 210, feynman(TRIANGLE, [40, 20, 320, 180]) + txt(200, 16, "axial current J₅^μ (γ^μγ⁵ vertex)", "xs ink2", 'text-anchor="middle"') + txt(200, 205, "fermion loop with two photons", "xs ink2", 'text-anchor="middle"'), "triangle") }),
    field: (c) => {
      const r = QED.anomalyRate(c.s.E, c.s.B);
      return { title: "CHIRALITY PRODUCTION", sub: "parallel E and B", body: kv([["E·B", fmt(c.s.E * c.s.B, 4)], ["d(N_R − N_L)/dt dV = e²E·B/2π²", fmt(r, 5)], ["classical ∂J₅", "0 (massless)"]]) + `<p class="small">Nielsen–Ninomiya: in a magnetic field the lowest Landau level is one-dimensional, right movers have E = +p, left movers E = −p, and the electric field shifts p at rate eE: levels flow through zero.</p>` };
    },
    algebra: () => ({ title: "THE ANOMALY EQUATION", body: formula("\\partial_\\mu J_5^\\mu = \\frac{e^2}{8\\pi^2}F_{\\mu\\nu}\\tilde F^{\\mu\\nu}\\ \\ (\\text{one Dirac fermion; sign depends on the } \\epsilon^{0123} \\text{ convention})") + `<p class="small">No regulator preserves both vector and axial current conservation; keeping the vector current (gauge invariance) forces the axial anomaly (Adler; Bell–Jackiw; Fujikawa's path-integral Jacobian).</p>` }),
    space: () => ({ title: "THE BRIDGE", body: `<ul class="small"><li>regularization: the triangle is linearly divergent and shift-dependent</li><li>topology: ∫FF̃ is a topological density (the instanton number in non-abelian theories)</li><li>index theory: the anomaly equals an index of the Dirac operator</li><li>spectral flow: eigenvalues crossing zero ${sceneLink("specflow", "→")}</li></ul>` }),
  },
  notes: () => `<p>An advanced but visual view: the anomaly is where perturbation theory, topology and the spectrum of the Dirac operator meet.</p>`,
});

/* ---------- §94–95 spectral flow and the index bridge ---------- */
scene({
  id: "specflow", track: "synth", title: "Spectral flow and index", sections: [94, 95],
  summary: "Eigenvalues of a Dirac operator move as a gauge field varies: for D(s) = −i d/dθ + s on a circle threaded by flux s, each eigenvalue n + s crosses zero once per unit of flux. Count the crossings: spectral flow ↔ index.",
  refs: ["aps1976", "nn1983", "connes1994"],
  init: () => ({ s0: -0.5, s1: 1.5, chiral: true }),
  anim: ["field"],
  controls: (c) => `${slider("s0", "from s₀", -2, 2, 0.05, c.s.s0, (v) => v.toFixed(2))} ${slider("s1", "to s₁", -2, 3, 0.05, c.s.s1, (v) => v.toFixed(2))} ${toggle("chiral", "show left movers (chiral pair)", c.s.chiral)}`,
  present: ["field", "algebra"],
  panels: {
    field: (c) => {
      const fam = SP.circleFamily(4), sf = SP.spectralFlow(fam, c.s.s0, c.s.s1, 200);
      const ss = sf.grid;
      const series = Q.range(9).map((i) => ({ pts: ss.map((s, k) => [s, sf.spectra[k][i]]), cls: "ncg", label: i === 0 ? "right movers n + s" : "", nolegend: i > 0 }));
      if (c.s.chiral) Q.range(9).forEach((i) => series.push({ pts: ss.map((s, k) => [s, -sf.spectra[k][i]]), cls: "aqft", dash: "4 3", label: i === 0 ? "left movers −(n + s)" : "", nolegend: i > 0 }));
      return { title: "EIGENVALUES vs FLUX", sub: "D(s) = −i d/dθ + s", body: lineChart({ label: "spectral flow chart", W: 400, H: 230, xr: [c.s.s0, c.s.s1], yr: [-3, 3], series, hlines: [{ y: 0, cls: "ck", label: "zero" }], points: sf.crossings.map((x) => ({ x: x.s, y: 0, cls: "fck", r: 4, tip: `crossing at s = ${fmt(x.s, 3)} (${x.dir > 0 ? "upward" : "downward"})` })), xlabel: "flux parameter s" }) };
    },
    algebra: (c) => {
      const sf = SP.spectralFlow(SP.circleFamily(4), c.s.s0, c.s.s1, 200);
      return { title: "COUNT THE CROSSINGS", sub: "computed", body: kv([["upward", String(sf.up)], ["downward", String(sf.down)], ["spectral flow", `<b>${sf.flow}</b>`], ["chiral charge change", c.s.chiral ? `ΔQ₅ = 2 × ${sf.flow} = ${2 * sf.flow}` : "—"]]) + `<p class="small">spectral flow ↔ index: for a loop of operators the net number of crossings is the index of an associated Fredholm operator (Atiyah–Patodi–Singer).</p>` };
    },
    diagram: () => ({ title: "INDEX-THEORETIC BRIDGE", body: `<pre class="small" style="font-family:var(--mono)">DIRAC OPERATOR\n      │\n      ├── spectrum\n      ├── index\n      ├── anomaly\n      └── K-theory / cyclic cohomology</pre><p class="small">This is where Connes' broader noncommutative geometry enters most naturally: index pairings between K-theory and cyclic cohomology. ${sceneLink("cyclic", "cyclic cohomology")}</p>` }),
    space: () => ({ title: "SPECTRUM, NOT ONLY EIGENVALUES", body: `<p class="small">Here D(s) has compact resolvent, so its spectrum is a discrete set of eigenvalues. For general operators the spectrum can also be continuous; spectral flow is defined through spectral projections, not eigenvalue lists.</p>` }),
  },
  notes: () => `<p>As the gauge field (here the flux s through the circle) varies, the Dirac spectrum flows. Right movers cross zero upward, left movers downward: the axial charge changes by two per unit of flux while the vector charge is conserved — the spectral-flow picture of the anomaly.</p>`,
});

/* ---------- §96 cyclic cohomology preview ---------- */
scene({
  id: "cyclic", track: "synth", title: "Cyclic cohomology (preview)", sections: [96],
  summary: "Start classically: ∫_M f₀ df₁ ∧ ⋯ ∧ df_n. On the circle, φ(f₀, f₁) = ∫ f₀ df₁ is computed and its cyclic symmetry checked. Replace functions by algebra elements: de Rham integration generalizes to cyclic cocycles, which pair with K-theory (here: the winding number).",
  refs: ["connes1985", "connes1994"],
  init: () => ({ w: 2 }),
  controls: (c) => slider("w", "winding of u = e^{iwθ}", -3, 3, 1, c.s.w, (v) => String(v)),
  panels: {
    field: (c) => {
      const f0 = Math.cos, f1 = Math.sin, d = (f) => (z) => (f(z + 1e-5) - f(z - 1e-5)) / 2e-5;
      const phi01 = Q.integrate((z) => f0(z) * d(f1)(z), 0, 2 * PI, { order: 20, panels: 8 });
      const phi10 = Q.integrate((z) => f1(z) * d(f0)(z), 0, 2 * PI, { order: 20, panels: 8 });
      return { title: "THE CLASSICAL INTEGRAL", sub: "φ(f₀, f₁) = ∫ f₀ df₁ on S¹", body: kv([["φ(cos, sin)", fmt(phi01, 8)], ["φ(sin, cos)", fmt(phi10, 8)], ["cyclic: φ(f₁, f₀) = −φ(f₀, f₁)", Math.abs(phi01 + phi10) < 1e-8 ? '<span class="pass">holds</span>' : '<span class="fail">fails</span>']]) + `<p class="small">Integration by parts gives the cyclic symmetry; the Hochschild boundary of φ vanishes because d(f₀f₁) = f₀df₁ + f₁df₀.</p>` };
    },
    algebra: (c) => {
      const N = 64, w = c.s.w;
      const u = Q.range(N).map((x) => (2 * PI * w * x) / N);
      const wind = Q.sum(Q.range(N).map((x) => { const d0 = u[(x + 1) % N] - u[x] + (x === N - 1 ? 2 * PI * w : 0); return Math.atan2(Math.sin(d0), Math.cos(d0)); })) / (2 * PI);
      const cont = (1 / (2 * PI)) * Q.integrate(() => w, 0, 2 * PI);
      return { title: "PAIRING WITH K-THEORY", sub: "the winding number", body: kv([["(1/2πi)∫ u⁻¹du (continuum)", fmt(cont, 6)], ["discrete sum of phase steps on 64 sites", fmt(wind, 6)]]) + `<p class="small">The cocycle φ(a₀, a₁) = (1/2πi)∫ a₀ da₁ evaluated on (u⁻¹, u) is an integer: a topological invariant. In NCG the same pairing makes sense for noncommutative algebras and computes Fredholm indices.</p>` };
    },
    diagram: () => ({ title: "THE GENERALIZATION", body: `<pre class="small" style="font-family:var(--mono)">de Rham integration\n        ↓ generalizes\ncyclic cocycles</pre><p class="small">Connect cyclic cocycles to geometric pairings in NCG: the Chern character of a spectral triple is a cyclic cocycle, and its pairing with K-theory gives the index.</p>` }),
  },
  notes: () => `<p>Do not start abstractly: ∫ f₀ df₁ ∧ ⋯ ∧ df_n is multilinear in functions and cyclically symmetric. Those two properties, not commutativity, are what cyclic cohomology keeps (Connes 1985).</p>`,
});

/* ---------- §116–118 dictionaries ---------- */
scene({
  id: "dictionaries", track: "synth", title: "Dictionaries", sections: [116, 117, 118],
  summary: "Gauge / geometry / algebra, conventional renormalization / Connes–Kreimer, and physics / operator algebra: the three translation tables of the laboratory, each row linked to the view that computes it.",
  refs: ["connes1994", "ck2000", "haag"],
  init: () => ({ which: "gauge" }),
  controls: (c) => seg("which", Object.entries(DATA.dictionaries).map(([k, d]) => [k, d.title]), c.s.which),
  panels: {
    space: (c) => {
      const d = DATA.dictionaries[c.s.which];
      return { title: d.title.toUpperCase(), sub: `${d.rows.length} rows`, body: table(d.columns, d.rows.map((r) => r.map(esc))) };
    },
  },
  onEnter: () => { G.maxPanel = "space"; },
  notes: () => `<p>Each dictionary is a translation, not an identity: the rows match roles, and the views linked from the concept graph compute both sides.</p>`,
});

/* ---------- §113–115 four ontologies and "what is real?" ---------- */
scene({
  id: "ontology", track: "synth", title: "Four ontologies of one process", sections: [113, 114, 115],
  summary: "Electron–muon scattering rendered four ways at once — fields, particles, graphs, operators — one per panel; the ontology switch above highlights one. Then the 'What is real?' toggles explain the status of each kind of object.",
  refs: ["ps", "haag", "weinberg"],
  init: () => ({ real: "graph" }),
  controls: (c) => seg("real", DATA.real.map((r) => [r.id, r.name]), c.s.real, "What is real?"),
  onEnter: () => {},
  panels: {
    space: (c) => {
      let s = "";
      for (let i = 0; i < 30; i++) { const x = 20 + i * 12.5; s += ln(x, 110, x, 110 - 30 * Math.cos(0.45 * i - 2 * c.t), "qft", 'stroke-width="2"'); }
      s += path(pathD(Q.linspace(0, 1, 40).map((u) => [20 + 360 * u, 50 + 8 * Math.sin(10 * u)])), "fermion", 'fill="none"') + path(pathD(Q.linspace(0, 1, 40).map((u) => [20 + 360 * u, 170 + 8 * Math.sin(10 * u + 1)])), "fermion-mu", 'fill="none"');
      return { title: G.ontology === "fields" ? "▶ FIELDS" : "FIELDS", sub: "currents and the EM field", body: svg(400, 190, s + txt(20, 186, "j^μ_e and j^μ_μ coupled through A_μ", "xs ink2"), "fields") };
    },
    field: () => {
      const M = minkowski({ W: 400, H: 190, scale: 36, cone: false });
      const s = M.s + arrow(...M.P(-2.2, -1.6), ...M.P(-0.5, -0.4), "fermion") + arrow(...M.P(-2.2, 1.6), ...M.P(-0.5, 0.4), "fermion-mu") + arrow(...M.P(0.5, -0.3), ...M.P(2.2, -1.8), "fermion") + arrow(...M.P(0.5, 0.3), ...M.P(2.2, 1.8), "fermion-mu") + circ(M.cx, M.cy, 18, "", 'fill="var(--soft)" stroke="var(--axis)" stroke-dasharray="3 3"');
      return { title: G.ontology === "particles" ? "▶ PARTICLES" : "PARTICLES", sub: "asymptotic states", body: svg(400, 190, s, "particles") };
    },
    diagram: () => ({ title: G.ontology === "graphs" ? "▶ GRAPHS" : "GRAPHS", sub: "photon exchange", body: svg(400, 190, feynman(GR.byId("tree_emu"), [20, 10, 360, 170]), "graph") }),
    algebra: () => { const r = ENG.treeAmplitude(); return { title: G.ontology === "operators" ? "▶ OPERATORS" : "OPERATORS", sub: "S-matrix element", body: formula("\\langle p_3p_4|S|p_1p_2\\rangle = (2\\pi)^4\\delta^4(\\textstyle\\sum p)\\,i\\mathcal{M}") + kv([["¼∑|𝓜|² at √s = 300 MeV, θ = 60°", fmt(r.amp.avg, 6)], ["from", "time-ordered correlation functions (LSZ)"]]) }; },
  },
  side: (c) => { const r = DATA.real.find((x) => x.id === c.s.real); return `<h3>What is real? ${esc(r.name)}</h3><p class="small">${esc(r.status)}</p>`; },
  notes: () => `<p>The same scattering process is a field configuration, a pair of asymptotic particle states, a term in a perturbative expansion and a matrix element of an operator. The five lens tabs above the panels (SPACETIME, MOMENTUM, FEYNMAN GRAPH, HOPF ALGEBRA, SPECTRAL/OPERATOR) focus the matching panel; hovering any labelled object highlights its analogue in the other panels.</p>`,
});

/* ---------- §123 mathematical prerequisite tree ---------- */
function prereqVisual(kind, t) {
  const v = {
    matrix: () => heatmap([[1, 2, 0], [0, 1, 1], [1, 0, 2]], { x: 10, y: 10, size: 24, cls: "aqft", name: "A" }) + arrow(100, 46, 150, 46, "axis") + heatmap([[1], [0.5], [2]], { x: 160, y: 10, size: 24, cls: "qft", name: "v" }),
    vector: () => arrow(40, 90, 140, 30, "qft") + arrow(40, 90, 160, 90, "ck") + txt(60, 110, "⟨u, v⟩ = |u||v| cos θ", "xs ink2"),
    spectrum: () => spectrumStrip([-2, -1, -0.4, 0.4, 1, 2], { x: 10, y: 10, w: 180, h: 60 }) + rect(10, 85, 180, 8, "bgqft", 'stroke="var(--qft)"') + txt(10, 110, "discrete eigenvalues · continuous band", "xs ink2"),
    circle: () => circ(100, 60, 40, "", 'fill="none" stroke="var(--axis)"') + arrow(100, 60, 100 + 38 * Math.cos(t), 60 - 38 * Math.sin(t), "ck"),
    fibres: () => Q.range(6).map((i) => `<ellipse cx="${20 + i * 32}" cy="55" rx="8" ry="26" fill="none" stroke="var(--axis)"/>`).join("") + ln(5, 95, 195, 95, "axis"),
    plane: () => ln(10, 60, 190, 60, "axis") + ln(100, 5, 100, 115, "axis") + circ(100, 60, 30, "", 'fill="none" stroke="var(--qft)"') + circ(100, 60, 3, "fck"),
    laurent: () => laurentLayers(LS.exact(-1, [3, 7, 2]), { x: 10, y: 5, w: 180, h: 110 }),
    sphere: () => riemannSphere({ cx: 100, cy: 60, R: 50, contour: 0.4 }).s,
    commutant: () => `<circle cx="80" cy="60" r="38" class="bgaqft" stroke="var(--aqft)"/><circle cx="120" cy="60" r="38" class="bgncg" stroke="var(--ncg)"/>` + txt(100, 64, "Z", "sm", 'text-anchor="middle"'),
    flow: () => bloch(100, 60, 45, Q.linspace(0, 2, 30).map((s) => AQ.blochVector(AQ.modularFlow(AQ.qubitState(0.8), AQ.PAULI.X, s))), { axes: false }),
    tree: () => feynman(GR.byId("sigma2_rainbow"), [5, 5, 190, 110]),
    triangle: () => poly([[100, 10], [30, 105], [170, 105]], "bgncg", 'stroke="var(--ncg)"') + txt(100, 8, "𝒜", "sm", 'text-anchor="middle"') + txt(20, 116, "ℋ", "sm") + txt(172, 116, "D", "sm"),
  }[kind];
  return svg(200, 120, v ? v() : "", kind);
}
scene({
  id: "prereq", track: "synth", title: "Mathematical prerequisite tree", sections: [123],
  summary: "Six chains of prerequisites, exposed rather than hidden. Every node has a thirty-second visual explainer: click one.",
  refs: ["connes1994", "br1987", "manchon2008"],
  init: () => ({ node: "laurent" }),
  anim: ["field"],
  actions: { pnode: (c, arg) => { c.s.node = arg; } },
  panels: {
    space: (c) => {
      const chains = Q.range(6).map((k) => DATA.prereqs.filter((p) => p.chain === k));
      let s = "";
      chains.forEach((ch, k) => ch.forEach((p, i) => { const x = 8 + i * 98, y = 14 + k * 36, w = 92; s += `<g data-act="pnode" data-arg="${p.id}" style="cursor:pointer"><rect x="${x}" y="${y}" width="${w}" height="24" rx="12" fill="${p.id === c.s.node ? "var(--fg)" : "var(--panel)"}" stroke="var(--axis)"/><text x="${x + w / 2}" y="${y + 15.5}" text-anchor="middle" class="xs" style="${p.id === c.s.node ? "fill:var(--bg)" : ""}">${esc(p.label)}</text></g>` + (i < ch.length - 1 ? arrow(x + w, y + 12, x + w + 6, y + 12, "axis", "", 3) : ""); }));
      return { title: "PREREQUISITES", sub: "click a node", body: svg(400, 226, s, "prerequisite tree") };
    },
    field: (c) => { const p = DATA.prereqs.find((x) => x.id === c.s.node); return { title: `30-SECOND EXPLAINER`, sub: esc(p.label), body: prereqVisual(p.visual, c.t) + `<p class="small">${esc(p.explainer)}</p>` }; },
  },
  notes: () => `<p>${DATA.prereqChains.map(esc).join("<br>")}</p>`,
});

/* ---------- §134 grand synthesis ---------- */
scene({
  id: "synthesis", track: "synth", title: "Grand synthesis", sections: [134],
  summary: "Four columns — spacetime, perturbation, NCG, local algebras — with QFT at the centre. Lines connect related concepts without declaring them identical; hover a line to read the relation.",
  refs: ["cm2008", "ck2000", "cc1997", "haag"],
  onEnter: () => { G.maxPanel = "space"; },
  present: ["space"],
  panels: {
    space: () => {
      const cols = DATA.synthesis.columns, W = 640, H = 330, cw = W / 4;
      const pos = (cid, i) => { const ci = cols.findIndex((c) => c.id === cid); return [ci * cw + cw / 2, 70 + i * 62]; };
      const clsOf = { spacetime: "qft", perturbation: "ck", ncg: "ncg", local: "aqft" };
      let s = "";
      for (const [[c1, i1], [c2, i2], label] of DATA.synthesis.links) { const a = pos(c1, i1), b = pos(c2, i2); const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 24; s += path(`M${a[0]} ${a[1]}Q${mx} ${my} ${b[0]} ${b[1]}`, "", `fill="none" stroke="var(--axis)" stroke-dasharray="4 3" stroke-width="1.4" data-tip="${esc(label)} (related, not identical)"`); }
      cols.forEach((c, ci) => { s += txt(ci * cw + cw / 2, 26, c.name, "sm mono", 'text-anchor="middle" style="font-weight:650"'); c.items.forEach((it, i) => { const [x, y] = pos(c.id, i); s += `<rect x="${x - 70}" y="${y - 14}" width="140" height="28" rx="14" class="bg${clsOf[c.id]}" stroke="var(--${clsOf[c.id]})"/>` + txt(x, y + 4, esc(it), "sm", 'text-anchor="middle"'); }); });
      s += `<rect x="${W / 2 - 34}" y="${H - 34}" width="68" height="28" rx="6" class="tx-box" fill="var(--panel)" stroke="var(--fg)" stroke-width="2"/>` + txt(W / 2, H - 15, "QFT", "lbl", 'text-anchor="middle" style="font-weight:700"');
      return { title: "GRAND SYNTHESIS", sub: "hover a dashed line", body: svg(W, H, s, "grand synthesis"), foot: "Lines relate concepts; none declares two of them identical." };
    },
  },
  notes: () => `<p>${DATA.questions.map((q) => `<b>${esc(q)}</b>`).join("<br>")}</p><p>QED makes all four questions concrete.</p>`,
});

/* ---------- §135 final animation ---------- */
function finaleStage(i, t) {
  const st = DATA.finale[i];
  let s = "";
  const W = 400, H = 210;
  switch (st.id) {
    case "electron": { const M = minkowski({ W, H, scale: 36, cone: false }); s = M.s + path(pathD(Q.linspace(-2.5, 2.5, 30).map((tt) => M.P(tt, 0.4 * tt + 0.2 * Math.sin(tt)))), "fermion", 'fill="none" stroke-width="2.4"') + circ(...M.P(t % 5 - 2.5, 0.4 * (t % 5 - 2.5)), 6, "fck"); break; }
    case "dirac": for (let k = 0; k < 9; k++) { const x0 = 30 + k * 40, ph = 0.8 * k - 2 * t; [Math.cos(ph), 0.6 * Math.sin(ph + 1), 0.4 * Math.cos(2 * ph), 0.3].forEach((a, j) => { s += rect(x0 + j * 6, 120 - 50 * Math.abs(a), 5, 50 * Math.abs(a), j < 2 ? "fqft" : "fck"); }); } break;
    case "fock": [["|0⟩", 0], ["e⁻", 1], ["e⁺", 1], ["γ", 1], ["e⁻e⁺", 2], ["e⁻γ", 2]].forEach(([l, n], k) => { s += rect(30 + k * 58, 40 + n * 50, 46, 26, "bgqft", 'stroke="var(--axis)" rx="5"') + txt(53 + k * 58, 57 + n * 50, l, "xs mono", 'text-anchor="middle"'); }); break;
    case "interaction": s = feynman(VERTEX_GRAPH, [80, 10, 240, 190]); break;
    case "graph": s = feynman(GR.byId("tree_emu"), [40, 10, 320, 190]); break;
    case "loop": s = feynman(GR.byId("pi1"), [40, 10, 320, 190], { glow: ["k1", "k2"] }); break;
    case "subgraphs": { const g = GR.byId("sigma3_rainbow"); s = feynman(g, [20, 10, 360, 190], { boxes: subgraphBoxes(g, GR.divergentSubgraphs(g), { labels: true }) }); break; }
    case "coproduct": { const tm = HO.coproductTerms(GR.byId("sigma2_rainbow"))[0]; s = feynman(tm.left[0], [10, 40, 160, 110]) + txt(195, 100, "⊗", "lbl", 'style="font-size:22px"') + feynman(tm.right, [220, 40, 170, 110]); break; }
    case "character": s = laurentLayers(ENG.birkhoffGraph("sigma2_rainbow", 0.5).phi, { x: 10, y: 10, w: 380, h: 190 }); break;
    case "winding": case "split": { const ser = ENG.vacuumPolarization().series, loop = HO.loopOnCircle(ser, 0.3, 120); const sc = 85 / Math.max(...loop.map((p) => Math.hypot(...p.gamma))); s = path(pathD(loop.map((p) => [200 + p.gamma[0] * sc, 105 - p.gamma[1] * sc])), "qft", 'fill="none" stroke-width="2"'); if (st.id === "split") s += path(pathD(loop.map((p) => [200 - p.minus[0] * sc, 105 + p.minus[1] * sc])), "ck", 'fill="none" stroke-dasharray="4 3"') + path(pathD(loop.map((p) => [200 + p.plus[0] * sc, 105 - p.plus[1] * sc])), "ncg", 'fill="none" stroke-width="2"'); const k = Math.floor((t * 30) % 120); s += circ(200 + loop[k].gamma[0] * sc, 105 - loop[k].gamma[1] * sc, 5, "fqft"); break; }
    case "renormalized": s = txt(200, 110, `γ₊(0) = ${fmt(ENG.vacuumPolarization().birkhoff.renormalized, 8)}`, "lbl mono", 'text-anchor="middle" style="font-size:20px"'); break;
    case "dissolve": s = `<g opacity="${(0.5 + 0.5 * Math.cos(t)).toFixed(2)}">${minkowski({ W, H, scale: 36, cone: true }).s}</g>` + poly([[200, 30], [110, 170], [290, 170]], "bgncg", 'stroke="var(--ncg)"') + txt(200, 26, "𝒜", "lbl", 'text-anchor="middle"') + txt(100, 186, "ℋ", "lbl") + txt(292, 186, "D", "lbl"); break;
    case "fluctuate": { const r = SP.doubledRingFluctuation(8, 1, ENG.spectralToGauge({ amplitude: 0.6 * (0.5 + 0.5 * Math.sin(t)) }).theta); s = heatmap(LA.toArray(r.DA), { x: 110, y: 10, size: 11.5, cls: "ck", name: "D_A", phase: true }); break; }
    case "potential": s = ringDiagram(8, ENG.spectralToGauge({ amplitude: 0.6 }).particlePhases, { cx: 200, cy: 105, R: 80, cls: "ncg", label: "A_μ as link phases" }); break;
    case "region": { const M = minkowski({ W, H, scale: 40, cone: false }); s = M.s + poly([M.P(1.2, 0), M.P(0, 1.2), M.P(-1.2, 0), M.P(0, -1.2)], "bgaqft", 'stroke="var(--aqft)" stroke-width="2"'); break; }
    case "algebra": s = rect(80, 40, 240, 130, "bgaqft", 'stroke="var(--aqft)" rx="10"') + txt(200, 110, "𝒜(𝒪)", "lbl", 'text-anchor="middle" style="font-size:22px"'); break;
    case "type3": { const draw = (x, w, d) => { s += rect(x, 40 + d * 22, w, 18, "fck", `fill-opacity="${(0.25 + 0.12 * d).toFixed(2)}"`); if (d < 5) { draw(x, w / 2 - 1, d + 1); draw(x + w / 2 + 1, w / 2 - 1, d + 1); } }; draw(20, 360, 0); break; }
    case "tomita": s = txt(200, 100, "S = JΔ^{1/2}", "lbl", 'text-anchor="middle" style="font-size:24px"') + txt(200, 130, `‖S − JΔ^{1/2}‖ = ${ENG.regionToModular().check.polar.toExponential(1)}`, "sm mono", 'text-anchor="middle"'); break;
    case "flow": { const rho = AQ.qubitState(0.8); s = bloch(200, 105, 80, Q.linspace(0, (t % 6) + 0.1, 50).map((x) => AQ.blochVector(AQ.modularFlow(rho, AQ.PAULI.X, x))), { head: AQ.blochVector(AQ.modularFlow(rho, AQ.PAULI.X, (t % 6) + 0.1)) }); break; }
    default: break;
  }
  return svg(W, H, s, st.text);
}
scene({
  id: "finale", track: "synth", title: "Final animation", sections: [135],
  summary: "From an electron moving through spacetime to modular flow, in twenty computed frames: field, Fock space, interaction, graph, loop, divergent subgraphs, coproduct, character, the loop around ε = 0, its split, the renormalized amplitude, spectral data, the fluctuating Dirac operator, the potential, a region, its algebra, type III, Tomita, and modular flow.",
  refs: ["ck2000", "cc1997", "takesaki1970"],
  init: () => ({ stage: 0, auto: true, lastT: 0 }),
  anim: ["field", "space"],
  controls: (c) => `${slider("stage", "frame", 0, DATA.finale.length + 1, 1, c.s.stage, (v) => `${Math.min(DATA.finale.length, v + 1)}/${DATA.finale.length + 1}`)} ${toggle("auto", "auto-advance", c.s.auto)}`,
  present: ["field", "space"],
  panels: {
    field: (c) => {
      if (c.s.auto && G.playing && c.t - c.s.lastT > 3.2) { c.s.lastT = c.t; c.s.stage = (c.s.stage + 1) % (DATA.finale.length + 2); }
      if (c.s.stage >= DATA.finale.length) return { title: "THE END", sub: "", body: `<div style="padding:.6rem 0">${DATA.finaleWords.map((w, i) => `<p class="${i < 2 ? "formula" : i === 2 ? "formula" : "small"}" style="${i < 3 ? "white-space:normal;text-align:center" : ""}">${i < 3 ? `<span class="tx-box" style="font-family:var(--sans)">${esc(w)}</span>` : esc(w)}</p>`).join("")}</div>` };
      const st = DATA.finale[c.s.stage];
      return { title: `FRAME ${c.s.stage + 1} OF ${DATA.finale.length}`, sub: esc(st.text), body: finaleStage(c.s.stage, c.t), foot: tex(st.tex) };
    },
    space: (c) => ({ title: "THE ROUTE", sub: "", body: `<ol class="small">${DATA.finale.map((f, i) => `<li${i === c.s.stage ? ' style="font-weight:650"' : i > c.s.stage ? ' class="muted"' : ""}>${esc(f.text)}</li>`).join("")}</ol>` }),
  },
  notes: () => `<p>${DATA.finaleWords.slice(3).map(esc).join("<br>")}</p>`,
});

/* ---------- §136 acceptance ---------- */
scene({
  id: "acceptance", track: "synth", title: "Acceptance: three chains, four questions", sections: [136],
  summary: "The tool succeeds if one can see, not merely recite: classical field → quantum field → propagator → Feynman graph → loop → divergence → renormalization; space → algebra → Hilbert space → Dirac operator → spectrum → gauge field; spacetime region → observable algebra → type III factor → modular structure. Each step opens its view.",
  refs: ["ck2000", "cc1997", "haag"],
  onEnter: () => { G.maxPanel = "space"; },
  panels: {
    space: () => ({ title: "THE THREE CHAINS", sub: "click a step", body: DATA.acceptance.map((ch) => `<div style="margin:.4rem 0"><span class="chip" style="--c:${TRACKS[ch.id === "qft" ? "qft" : ch.id].color};--cb:${TRACKS[ch.id === "qft" ? "qft" : ch.id].bg}">${esc(TRACKS[ch.id === "qft" ? "qft" : ch.id].name)}</span> ${ch.chain.map((step, i) => sceneLink(ch.scenes[i], esc(step))).join(" → ")}</div>`).join("") + `<h3>The final reflex: four questions</h3><ol class="small">${DATA.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ol>` }),
  },
  notes: () => `<p>The especially important visual centrepiece is the same one-loop QED graph transformed successively into a momentum integral, a Laurent series, a counterterm forest, an element of the Connes–Kreimer Hopf algebra and a Birkhoff factorization: ${sceneLink("flagship-vp", "open it")}.</p>`,
});
