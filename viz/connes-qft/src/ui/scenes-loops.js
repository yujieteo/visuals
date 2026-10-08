/* Perturbative-QFT track, part 2: loops, divergences, regularization, renormalization and the
   flagship vacuum-polarization computation (spec §27–§42, §101–§106, §109–§111, §120, §131). */

function graphGrid(ids, W = 400, cell = [130, 92], opts = {}) {
  const cols = Math.max(1, Math.floor(W / cell[0])), rows = Math.ceil(ids.length / cols);
  let s = "";
  ids.forEach((id, i) => {
    const g = GR.byId(id), x = (i % cols) * cell[0], y = Math.floor(i / cols) * cell[1];
    s += `<g data-scene="${opts.scene ? opts.scene(id) : "builder"}" data-preset='${JSON.stringify({ graph: id })}' style="cursor:pointer"><rect x="${x + 2}" y="${y + 2}" width="${cell[0] - 4}" height="${cell[1] - 4}" rx="6" fill="var(--panel)" stroke="var(--rule)"/>${feynman(g, [x + 6, y + 4, cell[0] - 12, cell[1] - 26], { arrows: true })}<text x="${x + cell[0] / 2}" y="${y + cell[1] - 8}" text-anchor="middle" class="xs ink2">${esc(g.name.length > 30 ? `${g.name.slice(0, 29)}…` : g.name)}</text></g>`;
  });
  return svg(cols * cell[0], rows * cell[1], s, "graphs");
}

/* ---------- §27 loop expansion ---------- */
const ORDER_GRAPHS = [["tree_emu"], ["sigma1", "pi1", "lambda1"], ["sigma2_rainbow", "sigma2_crossed", "sigma2_vp", "pi2_se", "pi2_crossed", "lambda2_ladder"], ["sigma3_rainbow", "sigma3_double"]];
scene({
  id: "loops", track: "qft", title: "Loop expansion", sections: [27],
  summary: "Slide the loop order (status strip). Tree graphs at order zero; at one loop the electron self-energy, vacuum polarization and vertex correction; higher orders multiply the graphs quickly.",
  refs: ["ps", "kinoshita2012"],
  graphs: true,
  onEnter: () => {},
  panels: {
    diagram: () => ({ title: "GRAPHS AT THIS ORDER", sub: `loop order ${G.order}${G.order === 3 ? " (examples)" : ""}`, body: graphGrid(ORDER_GRAPHS[G.order], 400), foot: "Click a graph to open it in the graph builder." }),
    algebra: () => ({ title: "GROWTH OF COMPLEXITY", sub: "QED vertex graphs for g − 2 (literature)", body: barChart({ W: 400, H: 200, items: GR.G2_GRAPH_COUNTS.map((c) => ({ label: `${c.loops} loop${c.loops > 1 ? "s" : ""}`, value: Math.log10(c.count), cls: c.loops <= G.order ? "qft" : "ck", tip: `${c.count} graphs (Aoyama, Hayakawa, Kinoshita & Nio 2012)` })), ylabel: "log₁₀(number of graphs)", showValues: true, vfmt: (v) => String(Math.round(Math.pow(10, v))) }), foot: "Counts of vertex graphs contributing to the electron's g − 2: 1, 7, 72, 891, 12 672 (sourced, not computed here)." }),
    field: () => {
      const ids = ORDER_GRAPHS[G.order];
      return { title: "LOOP NUMBER", sub: "L = I − V + 1", body: table(["graph", "I", "V", "L"], ids.map((id) => { const a = GR.analyse(GR.byId(id)); return [esc(a.name), a.I, a.V, a.L]; }), [1, 2, 3]) };
    },
    space: () => ({ title: "WHAT A LOOP IS", body: `<p class="small">Each independent loop leaves one momentum k unfixed by conservation at the vertices, so the amplitude carries ${tex("\\int d^4k/(2\\pi)^4")}. Order by order in α the expansion is asymptotic, not convergent in general — and QFT is more than this expansion.</p>` }),
  },
  notes: () => `<p>At loop order L the amplitude is suppressed by ${tex("\\alpha^L")} relative to tree level, but the number of graphs grows factorially. Perturbation theory is one approximation scheme for QFT, not its definition.</p>`,
});

/* ---------- §28 electron self-energy ---------- */
scene({
  id: "selfenergy", track: "qft", title: "Electron self-energy", sections: [28],
  summary: "The electron emits and reabsorbs a photon. The loop momentum k is integrated over all values; with a cutoff Λ the integral keeps growing like log Λ, and the growth comes from large |k|.",
  refs: ["ps"],
  graphs: true,
  init: () => ({ logL: 3 }),
  controls: (c) => slider("logL", "cutoff Λ", 0, 8, 0.05, c.s.logL, (v) => `${fmt(Math.pow(10, v), 2)} m`),
  panels: {
    diagram: () => { const g = GR.byId("sigma1"); return { title: "Σ₁", sub: "loop momentum k", body: svg(400, 200, feynman(g, [10, 10, 380, 180], { glow: ["k", "e1"], glowLink: "loopk", labels: { k: "k", e1: "p − k" }, link: (e) => (e.id === "k" || e.id === "e1" ? "loopk" : "") }), "self-energy") }; },
    algebra: () => ({ title: "THE INTEGRAL", sub: "schematic", body: formula("-i\\Sigma(p) = (-ie)^2\\int\\frac{d^4k}{(2\\pi)^4}\\gamma^\\mu\\frac{i(\\not{p}-\\not{k}+m)}{(p-k)^2-m^2}\\gamma_\\mu\\frac{-i}{k^2}") + `<p class="small">Power counting: four powers of k from d⁴k, minus one from the fermion and two from the photon propagator: superficially linear, reduced to logarithmic by the γ-matrix structure.</p>${kv([["δm (Pauli–Villars, leading log)", `${fmt(QED.deltaMass(Math.pow(10, sceneState("selfenergy").logL) * ME), 4)} MeV`], ["formula", "(3α/4π) m log(Λ²/m²)"]])}` }),
    field: (c) => {
      const Ls = Q.linspace(0, 8, 81);
      return { title: "CUMULATIVE INTEGRAL", sub: "∫_{|k|<Λ} d⁴k/(k²+m²)², m = 1", body: lineChart({ W: 400, H: 210, xr: [0, 8], yr: [0, 0.13], series: [{ pts: Ls.map((l) => [l, QED.cutoffIntegralExact(Math.pow(10, l), 1)]), cls: "qft", label: "I(Λ)" }], points: [{ x: c.s.logL, y: QED.cutoffIntegralExact(Math.pow(10, c.s.logL), 1), cls: "fck", label: fmt(QED.cutoffIntegralExact(Math.pow(10, c.s.logL), 1), 4) }], xlabel: "log₁₀ Λ", yfmt: (v) => v.toFixed(2) }), foot: "Each decade of Λ adds the same amount, (ln 10)/(8π²) ≈ 0.029: a logarithmic divergence." };
    },
    space: (c) => {
      const h = QED.shellHistogram(1, 0.01, Math.pow(10, c.s.logL), 24);
      return { title: "WHERE IT COMES FROM", sub: "contribution per shell in |k|", body: barChart({ W: 400, H: 190, items: h.map((b) => ({ label: b.a < 1 ? "" : "", value: b.value, cls: b.a > 1 ? "ck" : "qft", tip: `|k| ∈ [${fmt(b.a, 3)}, ${fmt(b.b, 3)}]: ${fmt(b.value, 3)}` })), xlabel: "IR ← log |k| → UV", ylabel: "shell contribution" }), foot: "UV contribution ↑ comes from large |k|: every log shell above the mass contributes equally." };
    },
  },
  notes: () => `<p>The self-energy shifts the electron's mass and normalization. Its integral is ${tex("\\int d^4k\\,\\frac{\\cdots}{[(p-k)^2-m^2]\\,k^2}")}; raising the cutoff raises the result without bound, logarithmically. Regularization (next views) makes this finite at fixed Λ or ε; renormalization then absorbs the Λ-dependence into ${tex("m_0")} and ${tex("Z_2")}.</p>`,
});

/* ---------- §29, §39 vacuum polarization ---------- */
scene({
  id: "vacpol", track: "qft", title: "Vacuum polarization", sections: [29, 39],
  summary: "A fermion loop inserted into the photon line modifies photon propagation. Summed, it screens charge at large distances; probing at short distances sees closer to the bare charge, so the effective coupling grows. The picture is heuristic; the curve is the computed one-loop Π̂(q²).",
  refs: ["ps", "uehling1935"],
  graphs: true,
  anim: ["space"],
  panels: {
    diagram: () => ({ title: "Π₁ IN THE PHOTON LINE", sub: "", body: svg(400, 160, feynman(GR.byId("pi1"), [20, 10, 360, 140], { labels: { k1: "k", k2: "k + q" } }), "vacuum polarization") + formula("\\frac{-ig_{\\mu\\nu}}{q^2} \\to \\frac{-ig_{\\mu\\nu}}{q^2(1 - \\hat\\Pi(q^2))}") }),
    field: () => {
      const xs = Q.linspace(-2, 8, 80);
      return { title: "EFFECTIVE COUPLING", sub: "α_eff(Q²)/α, one loop, on-shell scheme", body: lineChart({ W: 400, H: 210, xr: [-2, 8], yr: [0.998, 1.03], series: [{ pts: xs.map((x) => [x, QED.alphaEff(-Math.pow(10, 2 * x) * ME * ME) / Q.ALPHA]), cls: "qft", label: "α/(1 − Π̂₂(−Q²))", tip: (x, y) => `Q = 10^${x.toFixed(1)} m_e: ${fmt(y, 7)}` }], xlabel: "log₁₀(Q / m_e)", vlines: [{ x: Math.log10(muNow() / ME), label: "Q = μ", link: "coupling" }], yfmt: (v) => v.toFixed(3) }), foot: `At Q = μ = ${muLabel(muNow())}: α_eff = 1/${fmt(1 / QED.alphaEff(-(muNow() ** 2)), 7)}.` };
    },
    space: (c) => {
      let s = circ(200, 110, 9, "fck") + txt(200, 114, "+", "lbl", 'text-anchor="middle" style="fill:var(--bg)"');
      for (let k = 0; k < 36; k++) { const th = (2 * PI * k) / 36 + 0.05 * Math.sin(c.t + k), r0 = 30 + (k % 4) * 20; const x = 200 + r0 * Math.cos(th), y = 110 + r0 * Math.sin(th); s += circ(x - 3 * Math.cos(th), y - 3 * Math.sin(th), 2.6, "faqft", 'opacity="0.7"') + circ(x + 3 * Math.cos(th), y + 3 * Math.sin(th), 2.6, "fck", 'opacity="0.45"'); }
      const r = 30 + 60 * (0.5 + 0.5 * Math.sin(c.t * 0.6));
      s += circ(200, 110, r, "", 'fill="none" stroke="var(--qft)" stroke-dasharray="4 3"') + txt(200 + r + 4, 110, "probe radius", "xs ink2");
      s += txt(14, 210, "heuristic picture of Π: more screening outside the probe radius (schematic)", "xs ink2");
      return { title: "SCREENING (HEURISTIC)", sub: "large r: more screening", body: svg(400, 220, s, "screening") };
    },
    algebra: () => ({ title: "THE COMPUTATION", body: `<p class="small">The heuristic is backed by the integral: ${tex("\\hat\\Pi_2(q^2) = -\\frac{2\\alpha}{\\pi}\\int_0^1 dx\\,x(1-x)\\log\\frac{m^2}{m^2 - x(1-x)q^2}")}, evaluated numerically for the curve. The full step-by-step calculation, from loop to Birkhoff factor, is the flagship.</p>${sceneLink("flagship-vp", "open the flagship computation")}` }),
  },
  notes: () => `<p>Vacuum polarization modifies photon propagation: the photon two-point function gains ${tex("\\Pi(q^2)")}. For spacelike momentum transfer ${tex("Q^2 = -q^2 \\gg m^2")} the one-loop result is ${tex("\\alpha_{\\rm eff} = \\alpha/(1 - \\frac{\\alpha}{3\\pi}\\log\\frac{Q^2}{Am^2})")}, ${tex("A = e^{5/3}")}. The charge cloud drawing is a heuristic for this formula, not a picture of particles.</p>`,
});

/* ---------- §30, §109 vertex correction and g − 2 ---------- */
scene({
  id: "vertex", track: "qft", title: "Vertex correction and g − 2", sections: [30, 109],
  summary: "The bare vertex −ieγ<sup>μ</sup> beside its one-loop correction. The correction contains Z₁ (tied to Z₂ by the Ward identity) and a magnetic form factor F₂ whose value at zero momentum is the anomalous moment a<sub>e</sub> = α/2π: a measurable loop effect.",
  refs: ["ps", "schwinger1948", "fan2023", "codata2022"],
  graphs: true,
  panels: {
    diagram: () => ({ title: "BARE AND CORRECTED", sub: "side by side", body: svg(400, 170, feynman(VERTEX_GRAPH, [0, 10, 190, 150]) + feynman(GR.byId("lambda1"), [205, 10, 190, 150]) + txt(95, 166, "−ieγ^μ", "sm", 'text-anchor="middle"') + txt(300, 166, "−ieΓ^μ = −ie[γ^μF₁ + (iσ^{μν}q_ν/2m)F₂]", "xs", 'text-anchor="middle"'), "vertex") }),
    field: () => {
      const xs = Q.linspace(0, 3, 40);
      return { title: "MAGNETIC FORM FACTOR", sub: "F₂(q²), q² = −Q² ≤ 0", body: lineChart({ W: 400, H: 200, xr: [0, 3], yr: [0, 0.0013], series: [{ pts: xs.map((x) => [x, QED.F2(-Math.pow(x * ME, 2))]), cls: "qft", label: "F₂" }], points: [{ x: 0, y: QED.F2(0), cls: "fck", label: "α/2π" }], xlabel: "Q / m_e", yfmt: (v) => v.toExponential(1) }) };
    },
    algebra: () => {
      const a1 = QED.F2(0), ex = Q.CONST.aeExp.value;
      return { title: "g − 2", sub: "one loop vs measurement", body: kv([["tree level", "g = 2"], ["a_e = F₂(0), one loop", fmt(a1, 8)], ["α/2π", fmt(Q.ALPHA / (2 * PI), 8)], ["measured a_e (Fan et al. 2023)", fmt(ex, 12)], ["one loop / measured", fmt(a1 / ex, 6)]]) + `<p class="small">The remaining 0.15 % comes from higher loops (computed to five loops in the literature), muon and hadronic loops.</p>` };
    },
    space: () => ({ title: "WHERE IT LEADS", body: `<ul class="small"><li>${sceneLink("ward", "Z₁ and the Ward identity")}</li><li>${sceneLink("bare", "renormalization constants")}</li><li>bare Dirac vertex ↓ loop correction ↓ magnetic form factor</li></ul>` }),
  },
  notes: () => `<p>${formula("F_2(q^2) = \\frac{\\alpha}{2\\pi}\\int dx\\,dy\\,dz\\,\\delta(x+y+z-1)\\frac{2m^2z(1-z)}{m^2(1-z)^2 - q^2xy}")} The page integrates this over the simplex. At ${tex("q^2 = 0")} it gives Schwinger's ${tex("a_e = \\alpha/2\\pi")}: loop effects are experimentally measurable, not only renormalization bookkeeping.</p>`,
});

/* ---------- §31, §101 UV divergence microscope ---------- */
scene({
  id: "uv", track: "qft", title: "UV divergence microscope", sections: [31, 101],
  summary: "Take one loop, look at its radial momentum |k| and plot the contribution of each momentum shell from IR to UV. Raise the maximum loop momentum Λ: the cumulative integral keeps growing (UV divergence). Set the mass to zero and the small-|k| end diverges instead (IR divergence).",
  refs: ["ps", "schwartz"],
  init: () => ({ logL: 3, massless: false, logIR: -2 }),
  controls: (c) => `${slider("logL", "maximum loop momentum Λ", -1, 8, 0.05, c.s.logL, (v) => `${fmt(Math.pow(10, v), 2)} m`)} ${toggle("massless", "massless propagators (IR)", c.s.massless)} ${c.s.massless ? slider("logIR", "IR cutoff λ", -6, 0, 0.05, c.s.logIR, (v) => `${fmt(Math.pow(10, v), 2)} m`) : ""}`,
  panels: {
    field: (c) => {
      const h = QED.shellHistogram(1, c.s.massless ? Math.pow(10, c.s.logIR) : 1e-3, Math.pow(10, c.s.logL), 30, { ir: c.s.massless, irCut: Math.pow(10, c.s.logIR) });
      return { title: "CONTRIBUTION BY MOMENTUM SHELL", sub: "IR ───────── UV", body: barChart({ W: 400, H: 200, items: h.map((b) => ({ label: "", value: b.value, cls: b.a >= 1 ? "ck" : "qft", tip: `|k| ∈ [${fmt(b.a, 3)}, ${fmt(b.b, 3)}]` })), xlabel: "log |k|  (blue: |k| < m, orange: |k| > m)" }) };
    },
    diagram: (c) => {
      const Ls = Q.linspace(-1, 8, 60);
      const f = (l) => (c.s.massless ? Math.log(Math.pow(10, l) / Math.pow(10, c.s.logIR)) / (8 * PI * PI) : QED.cutoffIntegralExact(Math.pow(10, l), 1));
      return { title: "CUMULATIVE INTEGRAL", sub: "∫^Λ d⁴k/(2π)⁴ (k² + m²)⁻²", body: lineChart({ W: 400, H: 200, xr: [-1, 8], yr: [0, Math.max(0.15, f(8))], series: [{ pts: Ls.map((l) => [l, f(l)]), cls: "qft", label: "I(Λ)" }], points: [{ x: c.s.logL, y: f(c.s.logL), cls: "fck" }], xlabel: "log₁₀ Λ" }), foot: c.s.massless ? "Massless: log(Λ/λ)/8π² — divergent at both ends." : "Massive: finite at small k, logarithmic at large k." };
    },
    space: () => ({ title: "THE LOOP", sub: "radial |k|", body: svg(400, 170, feynman(GR.byId("sigma1"), [10, 0, 380, 150], { glow: ["k", "e1"], labels: { k: "k" } }), "loop") }),
    algebra: () => ({ title: "UV VERSUS IR", body: table(["", "UV divergence", "IR divergence"], [["where", "large |k|", "small |k|"], ["cause", "too few propagator powers", "massless propagators"], ["cure", "renormalization", "physical observables summing soft emissions (Bloch–Nordsieck)"]]) }),
  },
  notes: () => `<p>In Euclidean momentum, ${tex("\\int d^4k = 2\\pi^2\\int k^3\\,dk")}, so the integrand ${tex("k^3/(k^2+m^2)^2 \\sim 1/k")} gives equal contributions per logarithmic shell at large k. That uniform orange plateau is the UV divergence. With massless lines the same happens at small k: an IR divergence, which has a different physical resolution.</p>`,
});

/* ---------- §32 regularization laboratory ---------- */
scene({
  id: "regularization", track: "qft", title: "Regularization laboratory", sections: [32],
  summary: "One integral, three regulators: hard cutoff, dimensional regularization, Pauli–Villars (conceptual). Each is bookkeeping that makes the divergence manipulable; none is physical truth. The coefficient of log m² — the part that survives renormalization — is the same in all three.",
  refs: ["ps", "thooftveltman1972"],
  warnings: ["<b>Regularization is not renormalization.</b> Regularizing makes integrals finite at an unphysical parameter (Λ, ε, M); renormalizing then expresses predictions through measured quantities so the parameter can be removed."],
  panels: {
    field: () => {
      const r = QED.regulatorComparison({ Lambda: Math.pow(10, G.logLambda) / ME, M: Math.pow(10, G.logLambda) / ME, hi: 1 });
      const rows = [["hard cutoff", `${fmt(r.cutoff, 5)} at Λ = ${muLabel(Math.pow(10, G.logLambda))}`, fmt(r.logSlope.cutoff, 6)], ["dimensional", esc(LS.toText(r.dimreg, { sig: 4 })), fmt(r.logSlope.dimreg, 6)], ["Pauli–Villars", `${fmt(r.pv, 5)} at M = ${muLabel(Math.pow(10, G.logLambda))}`, fmt(r.logSlope.pv, 6)]];
      return { title: "THE SAME INTEGRAL", sub: "∫d⁴k_E/(2π)⁴ (k² + m²)⁻², m = m_e", body: table(["regulator", "regularized value", "d/d log m²"], rows.map((x, i) => [(["cutoff", "dimreg", "pv"][i] === G.reg ? "<b>" : "") + x[0], x[1], x[2]]), [2]) + `<p class="small">Expected log m² coefficient: −1/16π² = ${fmt(-1 / (16 * PI * PI), 6)}. The regulator-dependent constants differ; that difference is a scheme choice.</p>` };
    },
    diagram: () => ({ title: "CHOOSE A REGULATOR", sub: "status strip", body: `<p class="small">${seg("g.reg", [["cutoff", "hard cutoff"], ["dimreg", "dimensional regularization"], ["pv", "Pauli–Villars (conceptual)"]], G.reg)}</p><ul class="small"><li><b>Cutoff</b> |k| &lt; Λ: simple, breaks gauge invariance in QED if used naively.</li><li><b>Dimensional</b> d = 4 − ε: keeps gauge invariance; divergences become 1/ε poles.</li><li><b>Pauli–Villars</b>: subtract a heavy copy of mass M; conceptual here.</li></ul>` }),
    algebra: () => {
      const ms = Q.linspace(-1, 1, 30);
      const dr = (lm) => LS.coef(LS.scale(LS.mul(LS.gammaHalfEps(1), LS.powHalfEps((4 * PI) / Math.exp(2 * lm), 1)), 1 / (16 * PI * PI)), 0);
      return { title: "THE PHYSICAL PART AGREES", sub: "dependence on log m", body: lineChart({ W: 400, H: 200, xr: [-1, 1], yr: [-0.02, 0.1], series: [{ pts: ms.map((lm) => [lm, QED.cutoffIntegralExact(1e3, Math.exp(lm))]), cls: "qft", label: "cutoff" }, { pts: ms.map((lm) => [lm, dr(lm)]), cls: "ck", label: "dim reg (finite part)" }, { pts: ms.map((lm) => [lm, Math.log(1e6 / Math.exp(2 * lm)) / (16 * PI * PI)]), cls: "aqft", label: "Pauli–Villars", dash: "4 3" }], xlabel: "log m (arbitrary units)" }), foot: "Parallel lines: the same slope, different constant offsets." };
    },
    space: () => ({ title: "WHY IT MATTERS", body: `<p class="small">Because only the slope survives in predictions, the choice of regulator is bookkeeping. Symmetry decides which regulators are convenient: dimensional regularization keeps the Ward identity manifest in QED.</p>` }),
  },
  notes: () => `<p>Every regularization introduces a parameter that is not physical: a momentum cutoff, a non-integer dimension, or a fictitious heavy particle. Regularized amplitudes depend on it; renormalized predictions do not. ${sceneLink("dimreg", "next: dimensional regularization in detail")}</p>`,
});

/* ---------- §33–34 dimensional regularization, pole extractor, minimal subtraction ---------- */
/* The Laurent series on show: QED vacuum polarization at the current μ, or the spec's 3/ε + 7 + 2ε. */
const dimregSeries = (c) => (c.s.example === "qed" ? ENG.vacuumPolarization({ mu: muNow(), hi: 2 }).series : LS.exact(-1, [3, 7, 2]));
scene({
  id: "dimreg", track: "qft", title: "Dimensional regularization and the pole extractor", sections: [33, 34],
  summary: "In d = 4 − ε the divergent integral becomes a Laurent series a₋₁/ε + a₀ + a₁ε + …, drawn as vertical layers around ε = 0. The pole extractor separates POLE PART, FINITE PART and VANISHING PART; minimal subtraction removes the pole.",
  refs: ["thooftveltman1972", "ps", "ck2000"],
  init: () => ({ example: "qed", split: false }),
  controls: (c) => `${seg("example", [["qed", "QED vacuum polarization"], ["spec", "I(ε) = 3/ε + 7 + 2ε"]], c.s.example)} ${toggle("split", "extract the pole", c.s.split)} ${slider("g.eps", "ε", 0, 0.5, 0.01, G.eps, (v) => v.toFixed(2))}`,
  panels: {
    field: (c) => {
      const S = dimregSeries(c);
      return { title: "LAURENT LAYERS", sub: "around ε = 0", body: svg(400, 200, laurentLayers(S, { x: 10, y: 10, w: 380, h: 180, split: c.s.split }), "Laurent layers"), foot: `I(ε) = ${lseries(S)}` };
    },
    diagram: (c) => {
      const S = dimregSeries(c);
      const es = Q.linspace(0.02, 0.5, 60);
      const ser = [{ pts: es.map((e) => [e, LS.evalAt(S, e)]), cls: "qft", label: "I(ε)" }];
      if (c.s.split) ser.push({ pts: es.map((e) => [e, LS.evalAt(LS.regular(S), e)]), cls: "ck", label: "I(ε) − pole (MS)" });
      const ys = ser.flatMap((x) => x.pts.map((p) => p[1]));
      return { title: "I(ε) AS ε → 0", sub: "the pole blows up", body: lineChart({ W: 400, H: 200, xr: [0, 0.5], yr: [Math.min(...ys), Math.max(...ys)], series: ser, vlines: [{ x: G.eps, label: `ε = ${G.eps.toFixed(2)}` }], xlabel: "ε", yfmt: (v) => fmt(v, 2) }) };
    },
    algebra: (c) => {
      const S = dimregSeries(c);
      const P = LS.pole(S), R = LS.regular(S);
      return { title: "POLE EXTRACTOR", sub: "T and 1 − T", body: table(["part", "terms", "fate"], [[`<span data-link="laurent-pole">POLE PART</span>`, esc(LS.toText(P)), "removed by the counterterm (MS)"], [`<span data-link="laurent-finite">FINITE PART</span>`, fmt(LS.coef(S, 0), 6), "the renormalized value at ε = 0"], [`<span data-link="laurent-vanish">VANISHING PART</span>`, esc(LS.toText(LS.make(1, R.c.slice(1), R.hi))), "→ 0 as ε → 0"]]) + `<p class="small">Minimal subtraction: counterterm = −T[I]; renormalized = (1 − T)[I] evaluated at ε = 0. In Connes–Kreimer language T is the projection onto the pole part and these are the Birkhoff factors of a primitive graph.</p>` };
    },
    space: (c) => ({ title: "DIMENSION AS A DIAL", sub: `d = ${(4 - G.eps).toFixed(2)}`, body: `<p class="small">${tex("\\int\\frac{d^dk}{(2\\pi)^d}\\frac{1}{(k^2+\\Delta)^2} = \\frac{\\Gamma(2-d/2)}{(4\\pi)^{d/2}}\\Delta^{d/2-2}")}: finite for every d &lt; 4. Γ(ε/2) = 2/ε − γ + … carries the divergence as a pole.</p>${kv([["Γ(ε/2) at this ε", G.eps > 0 ? fmt(Q.gamma(G.eps / 2), 6) : "pole"], ["series 2/ε − γ + …", G.eps > 0 ? fmt(LS.evalAt(LS.gammaHalfEps(3), G.eps), 6) : "pole"]])}` }),
  },
  notes: () => `<p>${formula("I(\\varepsilon) = \\frac{a_{-1}}{\\varepsilon} + a_0 + a_1\\varepsilon + \\cdots")} For the QED vacuum polarization every coefficient is computed by expanding ${tex("\\Gamma(\\varepsilon/2)(4\\pi\\mu^2/\\Delta)^{\\varepsilon/2}")} and integrating over the Feynman parameter. With the specification's example ${tex("3/\\varepsilon + 7 + 2\\varepsilon")} the pole part is 3/ε, the finite part 7, and 2ε vanishes.</p>`,
  md: (c) => { const S = dimregSeries(c); return { sections: [{ heading: "Laurent series", body: `\\[ I(\\varepsilon) = ${LS.toTeX(S)} \\]` }, { heading: "Pole extraction", body: `- POLE PART: ${LS.toText(LS.pole(S))}\n- FINITE PART: ${fmt(LS.coef(S, 0), 8)}\n- VANISHING PART: the remaining positive powers` }] }; },
});

/* ---------- §102 Feynman parameters ---------- */
scene({
  id: "feynpar", track: "qft", title: "Feynman parameters", sections: [102],
  summary: "1/(AB) = ∫₀¹ dx / [xA + (1 − x)B]²: two denominators merge into one interpolated denominator. Slide x across [0, 1] and watch the area add up to 1/(AB).",
  refs: ["ps"],
  init: () => ({ A: 1, B: 3, x: 0.4 }),
  controls: (c) => `${slider("A", "A", 0.2, 5, 0.05, c.s.A, (v) => v.toFixed(2))} ${slider("B", "B", 0.2, 5, 0.05, c.s.B, (v) => v.toFixed(2))} ${slider("x", "x", 0, 1, 0.01, c.s.x, (v) => v.toFixed(2))}`,
  panels: {
    field: (c) => {
      const xs = Q.linspace(0, 1, 101), f = (x) => 1 / (x * c.s.A + (1 - x) * c.s.B) ** 2;
      const part = Q.integrate(f, 0, c.s.x, { order: 20, panels: 4 });
      return { title: "THE PARAMETER INTEGRAL", sub: "1/[xA + (1−x)B]²", body: lineChart({ W: 400, H: 210, xr: [0, 1], yr: [0, Math.max(f(0), f(1)) * 1.05], series: [{ pts: xs.map((x) => [x, f(x)]), cls: "qft", label: "integrand", area: true }], vlines: [{ x: c.s.x, label: "x" }], xlabel: "x" }), foot: `∫₀^x = ${fmt(part, 5)}; ∫₀¹ = ${fmt(QED.feynmanParameter(c.s.A, c.s.B).rhs, 8)}; 1/(AB) = ${fmt(1 / (c.s.A * c.s.B), 8)}.` };
    },
    diagram: (c) => {
      const D = c.s.x * c.s.A + (1 - c.s.x) * c.s.B, mx = Math.max(c.s.A, c.s.B, 1);
      let s = rect(40, 160 - 120 * c.s.A / mx, 50, 120 * c.s.A / mx, "fqft") + txt(65, 178, "A", "lbl", 'text-anchor="middle"');
      s += rect(130, 160 - 120 * c.s.B / mx, 50, 120 * c.s.B / mx, "fck") + txt(155, 178, "B", "lbl", 'text-anchor="middle"');
      s += arrow(195, 100, 245, 100, "axis") + rect(260, 160 - 120 * D / mx, 50, 120 * D / mx, "faqft") + txt(285, 178, "xA + (1−x)B", "sm", 'text-anchor="middle"');
      return { title: "TWO DENOMINATORS MERGE", sub: `x = ${c.s.x.toFixed(2)}`, body: svg(400, 190, s, "merging denominators") };
    },
    algebra: () => ({ title: "USE IN A LOOP", body: `<p class="small">For the vacuum polarization, A = (k+q)² − m², B = k² − m²; after the merge and the shift l = k + xq the denominator is ${tex("(l^2 - \\Delta)^2")} with ${tex("\\Delta = m^2 - x(1-x)q^2")} — the Δ in the flagship's Laurent series.</p>` }),
    space: () => ({ title: "GENERAL FORM", body: formula("\\frac{1}{A_1\\cdots A_n} = \\int_0^1 dx_1\\cdots dx_n\\,\\delta(\\textstyle\\sum x_i - 1)\\frac{(n-1)!}{[\\sum x_iA_i]^n}") }),
  },
  notes: () => `<p>Feynman parameters turn a product of propagator denominators into a single power, so the loop momentum integral becomes a standard ${tex("\\int d^dl/(l^2-\\Delta)^n")}. The identity is checked numerically for the chosen A and B.</p>`,
});

/* ---------- §103–104 Wick rotation and Euclidean QED ---------- */
scene({
  id: "wickrot", track: "qft", title: "Wick rotation and Euclidean QED", sections: [103, 104],
  summary: "Rotate t ↦ −iτ by an angle θ from 0 to π/2: the Minkowski axes turn toward Euclidean signature and the oscillatory weight e<sup>iS</sup> becomes the damped e<sup>−S<sub>E</sub></sup>. The continuation needs analyticity conditions, stated in the panel.",
  refs: ["osterwalder1973", "ps", "connes2013"],
  init: () => ({ th: 0.6 }),
  anim: [],
  controls: (c) => slider("th", "rotation angle θ", 0, PI / 2, 0.01, c.s.th, (v) => `${(v * 180 / PI).toFixed(0)}°`),
  panels: {
    space: (c) => {
      const th = c.s.th;
      let s = arrow(20, 120, 380, 120, "axis") + txt(372, 112, "x", "sm serif");
      s += arrow(200, 230, 200 - 100 * Math.sin(0), 10, "axis") + txt(206, 18, th > 1.4 ? "τ" : "t", "sm serif");
      const op = Math.cos(th);
      s += poly([[200, 120], [80, 0], [320, 0]], "cone", `opacity="${(0.55 * op).toFixed(2)}"`) + poly([[200, 120], [80, 240], [320, 240]], "cone", `opacity="${(0.55 * op).toFixed(2)}"`);
      for (let r = 1; r <= 3; r++) s += `<ellipse cx="200" cy="120" rx="${r * 32}" ry="${r * 32 * Math.sin(th) + 0.1}" fill="none" stroke="var(--ncg)" opacity="${Math.sin(th).toFixed(2)}"/>`;
      s += txt(14, 238, th < 0.05 ? "Minkowski: light cone, hyperbolae of constant s²" : th > 1.55 ? "Euclidean: circles of constant distance, no light cone" : "in between: a complexified time direction", "xs ink2");
      return { title: "AXES TURNING", sub: `t = e^{−iθ}τ, θ = ${(th * 180 / PI).toFixed(0)}°`, body: svg(400, 245, s, "Wick rotation") };
    },
    field: (c) => {
      const th = c.s.th, xs = Q.linspace(-4, 4, 161);
      // weight exp(i e^{iθ} S) for S = φ²/2: real part and modulus
      const w = (x) => { const S = 0.5 * x * x; const z = LA.C.mul([0, 1], LA.C.polar(S, th)); return LA.C.exp(z); };
      return { title: "THE WEIGHT", sub: "e^{i e^{iθ} S}, S = φ²/2", body: lineChart({ W: 400, H: 200, xr: [-4, 4], yr: [-1.05, 1.05], series: [{ pts: xs.map((x) => [x, w(x)[0]]), cls: "qft", label: "real part" }, { pts: xs.map((x) => [x, Math.hypot(...w(x))]), cls: "ck", label: "modulus" }], xlabel: "field value φ" }), foot: th > 1.55 ? "θ = π/2: e^{−S_E}, a positive, damped weight." : "Oscillating with constant modulus at θ = 0: interference, not probability." };
    },
    diagram: () => ({ title: "EUCLIDEAN QED MODE", body: `<pre class="small" style="font-family:var(--mono)">Minkowski QFT\n      ↓ Wick rotation\nEuclidean field theory\n      ↓\nspectral / elliptic operators become natural</pre>${sceneLink("triple", "toward Riemannian spectral triples")}` }),
    algebra: () => ({ title: "CONDITIONS", sub: "when the rotation is allowed", body: `<ul class="small"><li>the Green functions must be analytic in the swept region of complex time (no poles crossed: the iε prescription places them correctly);</li><li>Osterwalder–Schrader: reflection-positive Euclidean correlators reconstruct a Wightman theory;</li><li>gauge fixing, fermions (Grassmann variables) and γ-matrices need their own Euclidean conventions.</li></ul>` }),
  },
  notes: () => `<p>${tex("t \\mapsto -i\\tau")} turns ${tex("e^{iS}")} into ${tex("e^{-S_E}")} and the wave operator into an elliptic one: the Dirac operator becomes self-adjoint with discrete spectrum on a compact Euclidean space, which is where Connes' Riemannian spectral triples live.</p>`,
});

/* ---------- §35–36, §106 bare and renormalized parameters ---------- */
scene({
  id: "bare", track: "qft", title: "Bare and renormalized parameters", sections: [35, 36, 106],
  summary: "e₀, m₀ versus e(μ), m(μ): change μ (status strip) and the renormalized parameters run while the bare ones are formally μ-independent — and never observable. Each Z has its own diagrammatic source.",
  refs: ["ps", "thooftveltman1972"],
  panels: {
    space: () => {
      const mu = muNow(), a = QED.alphaRun(mu), m = ME * Math.pow(a / Q.ALPHA, -9 / 4);
      return { title: "THE PIPELINE", sub: "status strip: renormalization state", body: `<div class="pipe" style="font-size:.8rem;gap:.4rem">${STAGES.map((s, i) => `<button type="button" data-set="g.stage" data-val="${i}" aria-pressed="${i === G.stage}">${s}</button>${i < 3 ? `<i>${["↓ regularization", "↓ renormalization", "↓ compute"][i]}</i>` : ""}`).join("")}</div>${table(["quantity", "status at this stage"], [["e₀, m₀", G.stage === 0 ? "<b>inputs</b> of the regularized Lagrangian: formal, divergent as ε → 0, not measurable" : "absorbed into Z factors"], ["e(μ), m(μ)", G.stage >= 2 ? `<b>α(μ) = 1/${fmt(1 / a, 6)}, m(μ) = ${fmt(m, 5)} MeV</b> (one loop, MS-bar)` : "not yet defined"], ["observables", G.stage === 3 ? "<b>independent of μ and of the regulator</b>" : "—"]])}` };
    },
    field: () => {
      const ls = Q.linspace(Math.log10(ME), 15, 60);
      return { title: "RENORMALIZED PARAMETERS RUN", sub: "one loop, MS-bar, e⁻ only", body: lineChart({ W: 400, H: 200, xr: [Math.log10(ME), 15], yr: [0.4, 1.05], series: [{ pts: ls.map((l) => [l, Q.ALPHA / QED.alphaRun(Math.pow(10, l))]), cls: "qft", label: "α(m_e)/α(μ)" }, { pts: ls.map((l) => [l, Math.pow(QED.alphaRun(Math.pow(10, l)) / Q.ALPHA, -9 / 4)]), cls: "ck", label: "m(μ)/m(m_e)" }], vlines: [{ x: G.logMu, label: "μ", link: "coupling" }], xlabel: "log₁₀(μ / MeV)" }), foot: "The bare e₀, m₀ do not appear on this chart: they are not numbers one can measure." };
    },
    diagram: () => {
      const z = [["Z₂", "ψ₀ = Z₂^{1/2}ψ", "sigma1", "δ₂ = −(α/4π)(2/ε) (Feynman gauge, literature)"], ["Z₃", "A₀ = Z₃^{1/2}A", "pi1", `δ₃ = −(α/3π)(2/ε) = ${fmt(-2 * Q.ALPHA / (3 * PI), 5)}/ε (computed)`], ["Z_m", "m₀ = Z_m m", "sigma1", "Z_m = 1 − (3α/4π)(2/ε) (literature)"], ["Z₁", "vertex", "lambda1", "δ₁ = δ₂ (Ward identity)"]];
      return { title: "EACH Z AND ITS GRAPH", sub: "one loop, MS", body: `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.3rem">${z.map(([n, rel, gid, val]) => `<div style="border:1px solid var(--rule);border-radius:.4rem;padding:.2rem .3rem"><b class="small">${n}</b> <span class="tiny">${esc(rel)}</span>${svg(200, 80, feynman(GR.byId(gid), [4, 2, 192, 74]), gid)}<div class="tiny">${esc(val)}</div></div>`).join("")}</div>` };
    },
    algebra: () => ({ title: "THE RELATIONS", body: formula("\\psi_0 = Z_2^{1/2}\\psi,\\quad A_0 = Z_3^{1/2}A,\\quad m_0 = Z_m m,\\quad e_0 = \\mu^{\\varepsilon/2}Z_e e") + `<p class="small">With ${tex("Z_e = Z_1Z_2^{-1}Z_3^{-1/2}")} and Z₁ = Z₂, ${tex("e_0 = \\mu^{\\varepsilon/2}Z_3^{-1/2}e")}: the charge renormalizes only through the photon.</p>` }),
  },
  notes: () => `<p>Bare quantities are parameters of the regularized Lagrangian. They are scale independent by construction, ${tex("\\mu\\,de_0/d\\mu = 0")}, and divergent as the regulator is removed — so they are never shown as measurable. The renormalized ${tex("e(\\mu), m(\\mu)")} run with μ; physical predictions computed from them do not depend on μ.</p>`,
});

/* ---------- §37 Ward–Takahashi identity ---------- */
scene({
  id: "ward", track: "qft", title: "Ward–Takahashi identity", sections: [37],
  summary: "Gauge invariance links the vertex correction to the electron self-energy: q<sub>μ</sub>Γ<sup>μ</sup>(p + q, p) = S⁻¹(p + q) − S⁻¹(p), so Z₁ = Z₂. Symmetry constrains counterterms; they are not arbitrary cancellations.",
  refs: ["ward1950", "ps"],
  graphs: true,
  init: () => ({ q: 0.5 }),
  controls: (c) => slider("q", "photon momentum q_z", -2, 2, 0.01, c.s.q, (v) => v.toFixed(2)),
  panels: {
    diagram: () => ({ title: "VERTEX AND SELF-ENERGY", sub: "side by side", body: svg(400, 150, feynman(GR.byId("lambda1"), [0, 6, 195, 130], { link: () => "ward" }) + feynman(GR.byId("sigma1"), [205, 20, 195, 110], { link: () => "ward" }) + txt(100, 146, "Λ^μ → Z₁", "sm", 'text-anchor="middle"') + txt(300, 146, "Σ → Z₂", "sm", 'text-anchor="middle"'), "ward pair") }),
    algebra: (c) => {
      // tree level: q̸ = (p̸ + q̸ − m) − (p̸ − m), checked with explicit matrices
      const p = [1.3, 0.2, -0.1, 0.4], q = [0.3, 0, 0, c.s.q], m = 1;
      const lhs = QED.slash(q);
      const rhs = LA.sub(LA.sub(QED.slash(QED.vadd(p, q)), LA.scale(LA.eye(4), m)), LA.sub(QED.slash(p), LA.scale(LA.eye(4), m)));
      return { title: "THE IDENTITY, CHECKED AT TREE LEVEL", sub: "4×4 matrices", body: formula("q_\\mu\\Gamma^\\mu(p+q,p) = S^{-1}(p+q) - S^{-1}(p)") + kv([["tree: Γ^μ = γ^μ, S⁻¹(p) = p̸ − m", ""], ["max |q̸ − [S⁻¹(p+q) − S⁻¹(p)]|", LA.maxAbsDiff(lhs, rhs).toExponential(1)]]) + `<p class="small">At one loop the q → 0 limit gives ${tex("\\Lambda^\\mu(p,p) = -\\partial\\Sigma/\\partial p_\\mu")}, so the divergent parts satisfy ${tex("\\delta_1 = \\delta_2")}, i.e. Z₁ = Z₂.</p>` };
    },
    field: () => ({ title: "THE LOGIC", body: `<pre class="small" style="font-family:var(--mono)">GAUGE SYMMETRY\n     ↓\nWARD IDENTITY\n     ↓\nconstraint among counterterms: Z₁ = Z₂</pre><p class="small">Consequence: ${tex("e_0 = \\mu^{\\varepsilon/2}Z_3^{-1/2}e")}. Electron and muon, with different Z₂, get the same renormalized charge: charge universality.</p>` }),
    space: () => ({ title: "IN THE HOPF ALGEBRA", body: `<p class="small">In Connes–Kreimer language the Ward identity says the counterterm character respects relations between residues; for gauge theories these generate Hopf ideals (van Suijlekom 2007). Symmetry constrains which counterterms can appear.</p>` }),
  },
  notes: () => `<p>The identity follows from current conservation ${tex("\\partial_\\mu j^\\mu = 0")}. Because it relates the divergent parts of two different graphs, the counterterms ${tex("\\delta_1")} and ${tex("\\delta_2")} cannot be chosen independently: renormalization is constrained by symmetry.</p>`,
});

/* ---------- §38, §105 running coupling and the scale microscope ---------- */
scene({
  id: "running", track: "qft", title: "Running coupling and the scale microscope", sections: [38, 105],
  summary: "e = e(μ) from the infrared to the ultraviolet. At one loop for one charged Dirac fermion β(e) = μ de/dμ = e³/12π²: the coupling increases slowly toward high energy. Always one-loop perturbative QED in MS-bar.",
  refs: ["ps", "jostluttinger1950", "pdg2024", "codata2022"],
  anim: ["field"],
  controls: () => QED.SCALES.map((s) => `<button class="btn small" type="button" data-set="g.logMu" data-val="${Math.log10(s.mu).toFixed(3)}" aria-pressed="${Math.abs(G.logMu - Math.log10(s.mu)) < 0.01}">${esc(s.label)}</button>`).join(" "),
  panels: {
    field: (c) => {
      const ls = Q.linspace(-6, 19, 120);
      const sweep = Math.log10(ME) + ((c.t * 1.2) % 17);
      return { title: "α(μ), ONE-LOOP QED, MS-BAR", sub: "electron loop only", body: lineChart({ label: "running coupling", W: 400, H: 220, xr: [-6, 19], yr: [127, 138.5], series: [{ pts: ls.map((l) => [l, l < Math.log10(ME) ? 1 / Q.ALPHA : 1 / QED.alphaRun(Math.pow(10, l))]), cls: "qft", label: "1/α (frozen below m_e: decoupling)", tip: (x, y) => `μ = 10^${x.toFixed(1)} MeV: 1/α = ${fmt(y, 7)}` }, { pts: ls.map((l) => [l, 1 / QED.alphaRun(Math.pow(10, l))]), cls: "axis", label: "MS-bar formula below m_e", dash: "3 3" }], points: [{ x: G.logMu, y: 1 / QED.alphaRun(muNow()), cls: "fck", label: "μ" }, { x: sweep, y: 1 / QED.alphaRun(Math.pow(10, sweep)), cls: "fqft", r: 3 }], xlabel: "log₁₀(μ / MeV)", ylabel: "1/α(μ)", yfmt: (v) => v.toFixed(1) }), foot: `1/α(m_Z) here: ${fmt(1 / QED.alphaRun(Q.CONST.mZ.value), 6)}. The measured 1/α(m_Z) ≈ 128 includes all charged fermions and hadronic loops, which this electron-only formula omits.` };
    },
    diagram: () => {
      const es = Q.linspace(0, 1.5, 40), e = Math.sqrt(4 * PI * QED.alphaRun(muNow()));
      return { title: "β(e) = e³/12π²", sub: "computed from the counterterm", body: lineChart({ W: 400, H: 200, xr: [0, 1.5], yr: [0, 0.03], series: [{ pts: es.map((x) => [x, x ** 3 / (12 * PI * PI)]), cls: "qft", label: "e³/12π²" }, { pts: es.filter((_, i) => i % 6 === 3).map((x) => [x, QED.betaFromCounterterm(x)]), cls: "ck", label: "from Z₃'s pole (engine)", dash: "1 6", width: 4 }], points: [{ x: e, y: QED.betaFromCounterterm(e), cls: "fck", label: `e(μ) = ${fmt(e, 4)}` }], xlabel: "e" }) };
    },
    space: () => {
      const sc = QED.SCALES.reduce((best, s) => (Math.abs(Math.log10(s.mu) - G.logMu) < Math.abs(Math.log10(best.mu) - G.logMu) ? s : best));
      const desc = { macro: "classical electrodynamics; α = 1/137.036", atomic: "Coulomb binding, tree level dominant; loops give the Lamb shift", me: "pair creation threshold; vacuum polarization switches on", collider: "running visible; more charged particles join the loops", uv: "the one-loop formula keeps running toward its Landau pole — a sign of the approximation's limits, not a prediction" }[sc.id];
      return { title: "SCALE MICROSCOPE", sub: esc(sc.label), body: kv([["scale", `${muLabel(muNow())} (${esc(sc.note)})`], ["effective coupling", `1/α = ${fmt(1 / QED.alphaRun(muNow()), 7)}`], ["relevant diagrams", G.logMu < Math.log10(ME) ? "tree graphs" : "tree + vacuum polarization"], ["effective description", esc(desc)]]) };
    },
    algebra: () => ({ title: "LANDAU POLE (ONE LOOP)", body: `<p class="small">The one-loop formula diverges at ${tex("\\mu_L = m_e e^{3\\pi/2\\alpha}")} ≈ 10<sup>${fmt(QED.landauPole().log10, 4)}</sup> MeV, far beyond any physical scale and beyond the validity of perturbation theory. It is a statement about the approximation.</p>` }),
  },
  notes: () => `<p>${formula("\\beta(e) = \\mu\\frac{de}{d\\mu} = \\frac{e^3}{12\\pi^2} + \\cdots\\qquad \\frac{1}{\\alpha(\\mu)} = \\frac{1}{\\alpha(\\mu_0)} - \\frac{2}{3\\pi}\\log\\frac{\\mu}{\\mu_0}")} Labels on every number: one-loop perturbative QED, MS-bar scheme, one Dirac fermion (the electron), matched to α = 1/137.036 at μ = m_e at leading-log accuracy.</p>`,
});

/* ---------- §40 RG flow in coupling space ---------- */
scene({
  id: "rgflow", track: "qft", title: "Renormalization-group flow", sections: [40],
  summary: "Coupling space (α, m). The RG transformation μ ↦ e<sup>t</sup>μ moves a theory along a trajectory; the β-functions form the vector field tangent to it. One loop, MS-bar.",
  refs: ["ps", "wilson1974"],
  init: () => ({ a0: 0.1, m0: 1.6 }),
  controls: (c) => `${slider("a0", "α at t = 0", 0.01, 0.3, 0.005, c.s.a0, (v) => v.toFixed(3))} ${slider("m0", "m at t = 0", 0.2, 2, 0.01, c.s.m0, (v) => v.toFixed(2))}`,
  panels: {
    field: (c) => {
      const W = 400, H = 260, X = (a) => 40 + (a / 0.4) * 340, Y = (m) => 230 - (m / 2.2) * 210;
      let s = ln(40, 230, 380, 230, "axis") + ln(40, 20, 40, 230, "axis") + txt(380, 246, "α", "sm serif", 'text-anchor="end"') + txt(28, 24, "m", "sm serif");
      for (let i = 1; i <= 8; i++) for (let j = 1; j <= 8; j++) { const a = (i / 9) * 0.4, m = (j / 9) * 2.2; const [da, dm] = QED.rgField(a, m); const n = Math.hypot(da / 0.4, dm / 2.2) || 1; s += arrow(X(a), Y(m), X(a) + (da / 0.4 / n) * 18, Y(m) - (dm / 2.2 / n) * 18 * 0.6, "axis", "", 3.2); }
      const tr = QED.rgTrajectory(c.s.a0, c.s.m0, 60, 600).filter((p) => p.alpha < 0.4);
      s += path(pathD(tr.map((p) => [X(p.alpha), Y(p.m)])), "qft", 'fill="none" stroke-width="2.2"');
      const tNow = clamp(Math.log(muNow() / ME), 0, 60);
      const cur = tr.reduce((b, p) => (Math.abs(p.t - tNow) < Math.abs(b.t - tNow) ? p : b), tr[0]);
      const [da, dm] = QED.rgField(cur.alpha, cur.m);
      s += circ(X(cur.alpha), Y(cur.m), 5, "fck", `data-tip="t = log(μ/m_e) = ${fmt(cur.t, 3)}"`) + arrow(X(cur.alpha), Y(cur.m), X(cur.alpha) + da * 340 / 0.4 * 4, Y(cur.m) - dm * 210 / 2.2 * 4, "ck");
      return { title: "COUPLING SPACE (α, m)", sub: "β as a vector field", body: svg(W, H, s, "RG flow"), foot: `Marker at t = log(μ/m_e) = ${fmt(tNow, 3)} from the status strip; the orange arrow is (β_α, β_m) there, tangent to the trajectory.` };
    },
    algebra: () => ({ title: "THE VECTOR FIELD", body: formula("\\beta^i(g) = \\mu\\frac{dg^i}{d\\mu}:\\quad \\beta_\\alpha = \\frac{2\\alpha^2}{3\\pi},\\quad \\beta_m = -\\frac{3\\alpha}{2\\pi}m") + `<p class="small">So ${tex("m(\\mu) \\propto \\alpha(\\mu)^{-9/4}")} along every trajectory (checked in the tests). One loop, MS-bar.</p>` }),
    diagram: () => ({ title: "μ ↦ e^t μ", body: `<p class="small">The RG is a one-parameter flow on the space of couplings. In the Connes–Kreimer picture the same flow acts on characters of the Hopf algebra, generated by the residue of the counterterm.</p>${sceneLink("ckrg", "RG from factorization")}` }),
    space: () => ({ title: "TWO-LOOP CORRECTION (LITERATURE)", body: kv([["β_α at α = 1/137", `${fmt(2 * Q.ALPHA ** 2 / (3 * PI), 4)} (one loop)`], ["with two loops", `${fmt(QED.betaAlphaTwoLoop(Q.ALPHA), 4)} (Jost & Luttinger 1950)`]]) }),
  },
  notes: () => `<p>The RG transformation ${tex("\\mu \\mapsto e^t\\mu")} changes the renormalized couplings so that physical predictions stay fixed. The flow lines are integrated with RK4 from the one-loop β-functions.</p>`,
});

/* ---------- §41–42 Wilsonian shells ---------- */
scene({
  id: "wilson", track: "qft", title: "Wilsonian shell integration", sections: [41, 42],
  summary: "Integrate out the momentum annulus Λ/b < |p| < Λ, fade those modes, rescale, and watch the coupling move. Physical coarse-graining before the Connes–Kreimer abstraction.",
  refs: ["wilson1974", "ck2001"],
  init: () => ({ b: 2, step: 0 }),
  controls: (c) => `${slider("b", "shell ratio b", 1.1, 4, 0.05, c.s.b, (v) => v.toFixed(2))} ${stepper("step", ["all modes", "integrate out the shell", "rescale p → bp", "couplings moved"], c.s.step)}`,
  panels: {
    field: (c) => {
      let s = "";
      const R = 100, cx = 200, cy = 120, inner = R / c.s.b;
      for (let i = -12; i <= 12; i++) for (let j = -12; j <= 12; j++) {
        const px = (i / 12) * R, py = (j / 12) * R, r = Math.hypot(px, py);
        if (r > R) continue;
        const inShell = r > inner;
        let x = px, y = py;
        if (c.s.step >= 2) { if (inShell) continue; x = px * c.s.b; y = py * c.s.b; if (Math.hypot(x, y) > R) continue; }
        const op = c.s.step === 1 && inShell ? 0.15 : 0.9;
        s += circ(cx + x, cy + y, 2.2, inShell ? "fck" : "fqft", `opacity="${op}"`);
      }
      s += circ(cx, cy, R, "", 'fill="none" stroke="var(--axis)"') + (c.s.step < 2 ? circ(cx, cy, inner, "", 'fill="none" stroke="var(--ck)" stroke-dasharray="4 3"') : "");
      s += txt(14, 236, ["modes with |p| < Λ", "shell Λ/b < |p| < Λ integrated out (faded)", "remaining modes rescaled to fill |p| < Λ", "same picture, new couplings"][c.s.step], "xs ink2");
      return { title: "MOMENTUM SPACE", sub: "modes as dots", body: svg(400, 245, s, "Wilsonian shell") };
    },
    algebra: (c) => {
      const a0 = QED.alphaRun(muNow()), steps = Q.range(6).map((k) => ({ k, a: k === 0 ? a0 : null }));
      let a = a0;
      const rows = steps.map((st) => { const r = [st.k, `Λ/${fmt(Math.pow(c.s.b, st.k), 3)}`, `1/α = ${fmt(1 / a, 7)}`]; a = QED.wilsonStep(a, c.s.b); return r; });
      return { title: "COUPLINGS MOVE", sub: "leading log, one loop", body: table(["shells", "scale", "coupling"], rows) + `<p class="small">${tex("\\alpha(\\Lambda/b) = \\alpha(\\Lambda)/(1 + \\frac{2\\alpha}{3\\pi}\\log b)")}: the one-loop coefficient is scheme independent, so Wilson's coarse-graining and MS-bar running agree at leading log.</p>` };
    },
    diagram: () => ({ title: "SIDE BY SIDE", body: table(["WILSON", "CONNES–KREIMER"], [["integrate out momentum shells", "organize subdivergences algebraically"], ["↓", "↓"], ["effective action changes", "character decomposes into counterterm + finite part"]]) + `<p class="small">Both describe renormalization; they answer it in different languages.</p>` }),
    space: () => ({ title: "WHAT IS INTEGRATED", body: `<p class="small">The fast modes in the shell are integrated in the path integral at fixed slow modes; their effect is a change of the couplings of the slow modes. Repeating the step generates the flow.</p>` }),
  },
  notes: () => `<p>Wilson's renormalization group is coarse-graining: integrate out ${tex("\\Lambda/b < |p| < \\Lambda")}, rescale ${tex("p \\to bp")} so the cutoff returns to Λ, and read off the new couplings. Here the coupling update uses the one-loop leading logarithm, labelled as such.</p>`,
});

/* ---------- §110–111 effective action ---------- */
scene({
  id: "effaction", track: "qft", title: "Effective action", sections: [110, 111],
  summary: "Z[J] → W[J] = −i log Z[J] → Γ[φ]: all diagrams, then connected ones, then one-particle-irreducible ones — the 1PI graphs that generate the Connes–Kreimer Hopf algebra. A scalar toy shows the one-loop effective potential.",
  refs: ["cw1973", "ps", "ck2000"],
  init: () => ({ m2: 1, lambda: 1.2, mu: 1 }),
  controls: (c) => `${slider("m2", "m² (toy scalar)", -1, 1, 0.01, c.s.m2, (v) => v.toFixed(2))} ${slider("lambda", "λ", 0.1, 3, 0.01, c.s.lambda, (v) => v.toFixed(2))} ${slider("mu", "μ", 0.3, 3, 0.01, c.s.mu, (v) => v.toFixed(2))}`,
  panels: {
    diagram: () => ({ title: "ALL → CONNECTED → 1PI", sub: "", body: svg(400, 220, feynman(GR.byId("pi1_chain"), [0, 10, 195, 90]) + feynman(GR.byId("pi1"), [205, 10, 195, 90]) + txt(97, 112, "connected, not 1PI", "xs ink2", 'text-anchor="middle"') + txt(302, 112, "1PI", "xs ink2", 'text-anchor="middle"') + txt(10, 150, "Z[J]: all diagrams (disconnected too)", "sm") + txt(10, 172, "↓ log:  W[J] = −i log Z[J]: connected diagrams", "sm") + txt(10, 194, "↓ Legendre transform:  Γ[φ]: 1PI diagrams", "sm"), "effective action") }),
    field: (c) => {
      const xs = Q.linspace(-3, 3, 121), V = (x) => QED.effectivePotential(x, c.s);
      return { title: "EFFECTIVE POTENTIAL (TOY SCALAR)", sub: "pedagogical, not QED", body: lineChart({ W: 400, H: 210, xr: [-3, 3], yr: [-1, 4], series: [{ pts: xs.map((x) => [x, V(x).V0]), cls: "qft", label: "classical V₀" }, { pts: xs.map((x) => [x, V(x).V]), cls: "ck", label: "one loop V_eff (MS-bar)" }], xlabel: "φ" }), foot: "One-loop Coleman–Weinberg term (M⁴/64π²)(log M²/μ² − 3/2), M² = m² + λφ²/2; undefined where M² < 0." };
    },
    algebra: () => ({ title: "WHY 1PI", body: `<p class="small">Γ[φ] is generated by 1PI graphs; every connected graph is a tree of 1PI pieces joined by propagators. That is why Connes and Kreimer take 1PI graphs as the generators of their Hopf algebra.</p>${sceneLink("ck-enter", "enter Connes–Kreimer")}` }),
    space: () => ({ title: "THE TRANSFORMS", body: formula("W[J] = -i\\log Z[J],\\qquad \\Gamma[\\phi] = W[J] - \\int J\\phi,\\quad \\phi = \\frac{\\delta W}{\\delta J}") }),
  },
  notes: () => `<p>Taking the logarithm keeps only connected diagrams; the Legendre transform keeps only 1PI ones. QED stays the main theory; the scalar toy is used only because its effective potential is a curve one can draw.</p>`,
});

/* ---------- §120, §131 the flagship: vacuum polarization from graph to Birkhoff ---------- */
const VP_STEPS = ["draw graph", "assign momentum", "write integral", "d = 4 − ε", "Laurent pole", "counterterm", "finite expression", "vary μ", "running e(μ)", "β(e)", "Hopf algebra", "Birkhoff"];
function vpData(c) { return ENG.vacuumPolarization({ Q2: Math.pow(10, c.s.logQ2) * ME * ME, mu: muNow(), hi: 2 }); }
scene({
  id: "flagship-vp", track: "qft", title: "From diagram to renormalized number: vacuum polarization", sections: [120, 131],
  summary: "The canonical worked example. One graph is carried through momentum integral, d = 4 − ε, Laurent series, 1/ε pole, counterterm, finite amplitude, μ-dependence, running e(μ) and β(e), then encoded as a Hopf-algebra element and Birkhoff-factored. The conventional and Connes–Kreimer columns stay synchronized at every step.",
  refs: ["ps", "ck2000", "ck2001", "thooftveltman1972"],
  graphs: true,
  init: () => ({ step: 0, logQ2: 0.6, auto: false }),
  anim: ["space"],
  rerenderControls: false,
  controls: (c) => `${stepper("step", VP_STEPS, c.s.step)} ${actBtn("vpprev", "← step")} ${actBtn("vpnext", "step →")} ${slider("logQ2", "Q² = −q²", -2, 4, 0.05, c.s.logQ2, (v) => `${fmt(Math.pow(10, v), 3)} m²`)}`,
  actions: { vpnext: (c) => { c.s.step = Math.min(VP_STEPS.length - 1, c.s.step + 1); }, vpprev: (c) => { c.s.step = Math.max(0, c.s.step - 1); } },
  present: ["diagram", "field"],
  panels: {
    diagram: (c) => {
      const g = GR.byId("pi1"), st = c.s.step;
      if (st >= 10) {
        const v = vpData(c);
        let s = feynman(g, [130, 0, 140, 80]) + txt(200, 96, "Δ(Π₁) = Π₁ ⊗ 1 + 1 ⊗ Π₁", "lbl", 'text-anchor="middle" data-link="hopf"') + txt(200, 116, "primitive: no divergent subgraph", "xs ink2", 'text-anchor="middle"') + txt(200, 140, "S(Π₁) = −Π₁", "sm", 'text-anchor="middle"');
        s += txt(200, 166, "φ(Π₁) ∈ 𝒜, the algebra of Laurent series in ε:", "xs ink2", 'text-anchor="middle"') + txt(200, 182, esc(LS.toText(LS.truncate(v.series, 0), { sig: 3 })), "xs mono", 'text-anchor="middle"');
        return { title: "THE GRAPH AS A HOPF ELEMENT", sub: "generator of 𝓗", body: svg(400, 190, s, "Hopf element") };
      }
      const labels = st >= 1 ? { k1: "k", k2: "k + q", qin: "q", qout: "q" } : {};
      let s = feynman(g, [20, 5, 360, 216], { labels, glow: st >= 1 ? ["k1", "k2"] : null, glowLink: "loopk", link: (e) => (e.type === "e" ? "loopk" : "photon") });
      if (st >= 1) s += txt(10, 222, "momentum conserved at both vertices: q + k = k + q", "xs ink2");
      return { title: "THE GRAPH", sub: st >= 1 ? "loop momentum k" : "fermion loop in the photon line", body: svg(400, 228, s, "vacuum polarization graph") };
    },
    field: (c) => {
      const v = vpData(c), st = c.s.step;
      if (st <= 2) return { title: "THE INTEGRAND", sub: "Euclidean, after Feynman parameters", body: lineChart({ W: 400, H: 210, xr: [-2, 4], yr: [0, 0.035], series: [{ pts: Q.linspace(-2, 4, 80).map((l) => { const k = Math.pow(10, l); return [l, (k ** 4 * 2 * PI * PI) / (Math.pow(2 * PI, 4) * (k * k + 1) ** 2) / 1]; }), cls: "qft", label: "k⁴/(k² + Δ)² per log k" }], xlabel: "log₁₀ |k| / m", yfmt: (x) => x.toFixed(3) }), foot: "Per logarithmic shell the integrand tends to a constant: the integral diverges logarithmically (ω = 2 reduced by gauge invariance)." };
      if (st === 3) { const es = Q.linspace(0.03, 0.5, 60); return { title: "REGULARIZED IN d = 4 − ε", sub: "finite for every ε > 0", body: lineChart({ W: 400, H: 210, xr: [0, 0.5], yr: [-0.12, 0.01], series: [{ pts: es.map((e) => [e, LS.evalAt(v.series, e)]), cls: "qft", label: "Π₂(q²; ε)" }], vlines: [{ x: G.eps, label: `ε = ${G.eps.toFixed(2)}` }], xlabel: "ε", yfmt: (x) => x.toFixed(2) }) }; }
      if (st <= 6) return { title: st === 4 ? "LAURENT EXPANSION" : st === 5 ? "THE POLE IS REMOVED" : "FINITE RENORMALIZED AMPLITUDE", sub: "layers around ε = 0", body: svg(400, 200, laurentLayers(v.series, { x: 10, y: 10, w: 380, h: 180, split: st >= 5 }), "Laurent layers"), foot: `Π₂ = ${lseries(v.series)}` };
      if (st === 7) return { title: "VARY μ", sub: "MS-bar Π̂(q²; μ)", body: lineChart({ W: 400, H: 210, xr: [Math.log(v.mu) - 3, Math.log(v.mu) + 3], yr: [Math.min(...v.muScan.map((p) => p.pi)), Math.max(...v.muScan.map((p) => p.pi))], series: [{ pts: v.muScan.map((p) => [Math.log(p.mu), p.pi]), cls: "qft", label: "Π̂(q²; μ)" }], vlines: [{ x: Math.log(v.mu), label: "current μ", link: "coupling" }], xlabel: "log μ", yfmt: (x) => x.toFixed(4) }), foot: `slope μ dΠ̂/dμ = ${fmt(v.dPiDlogMu, 6)} = −2α/3π` };
      if (st === 8) { const ls = Q.linspace(Math.log10(ME), 16, 80); return { title: "RUNNING e(μ)", sub: "one-loop QED, MS-bar, e⁻ only", body: lineChart({ W: 400, H: 210, xr: [Math.log10(ME), 16], yr: [0.3027, 0.312], series: [{ pts: ls.map((l) => [l, Math.sqrt(4 * PI * QED.alphaRun(Math.pow(10, l)))]), cls: "qft", label: "e(μ)" }], points: [{ x: G.logMu, y: v.e ? Math.sqrt(4 * PI * QED.alphaRun(muNow())) : 0, cls: "fck", label: "μ" }], xlabel: "log₁₀(μ / MeV)", yfmt: (x) => x.toFixed(4) }) }; }
      if (st === 9) { const es = Q.linspace(0, 1.2, 40); const e = Math.sqrt(4 * PI * QED.alphaRun(muNow())); return { title: "β(e) FROM THE POLE", sub: "β = −(e²/4) dz/de", body: lineChart({ W: 400, H: 200, xr: [0, 1.2], yr: [0, 0.016], series: [{ pts: es.map((x) => [x, x ** 3 / (12 * PI * PI)]), cls: "qft", label: "e³/12π²" }], points: [{ x: e, y: QED.betaFromCounterterm(e), cls: "fck", label: `β = ${fmt(QED.betaFromCounterterm(e), 4)}` }], xlabel: "e" }) }; }
      // Birkhoff
      const loop = HO.loopOnCircle(v.series, 0.3, 120), sc = 95 / Math.max(1e-300, ...loop.flatMap((p) => [Math.hypot(...p.gamma), Math.hypot(...p.minus), Math.hypot(...p.plus)]));
      let s = ln(200, 10, 200, 210, "grid") + ln(10, 110, 390, 110, "grid");
      s += path(pathD(loop.map((p) => [200 + p.gamma[0] * sc, 110 - p.gamma[1] * sc])), "qft", 'fill="none" stroke-width="2" data-link="gamma"') + path(pathD(loop.map((p) => [200 - p.minus[0] * sc, 110 + p.minus[1] * sc])), "ck", 'fill="none" stroke-width="1.6" stroke-dasharray="4 3" data-link="gminus"') + path(pathD(loop.map((p) => [200 + p.plus[0] * sc, 110 - p.plus[1] * sc])), "ncg", 'fill="none" stroke-width="2" data-link="gplus"');
      s += txt(12, 22, "γ(ε) on |ε| = 0.3 (blue) = −γ₋ (orange, the pole part) + γ₊ (green, holomorphic)", "xs ink2") + txt(394, 106, "Re", "xs mut", 'text-anchor="end"') + txt(204, 20, "Im", "xs mut");
      return { title: "BIRKHOFF FACTORIZATION", sub: "additive for a primitive graph", body: svg(400, 220, s, "Birkhoff loop"), foot: `γ₊(Π₁)(0) = ${fmt(v.birkhoff.renormalized, 8)} — equal to the MS finite part: ${v.birkhoff.agreesWithMS ? "yes" : "no"}.` };
    },
    algebra: (c) => {
      const v = vpData(c), st = c.s.step;
      const rows = [
        ["Feynman graph Π₁; L = 1, ω = 2", "generator Π₁ of 𝓗 (1PI, divergent residue)"],
        ["loop momentum k, k + q", "—"],
        [tex("i\\Pi_2^{\\mu\\nu}(q) = (g^{\\mu\\nu}q^2 - q^\\mu q^\\nu)\\,i\\Pi_2(q^2)"), "the Feynman rule φ evaluated on Π₁"],
        ["d = 4 − ε: Γ(ε/2)(4πμ²/Δ)^{ε/2}", "regularized character φ: 𝓗 → 𝒜 (Laurent series)"],
        [`Π₂ = ${esc(LS.toText(v.series, { sig: 4 }))}`, `φ(Π₁)(ε), residue ${fmt(v.residue, 5)}`],
        [`counterterm δ₃ = ${esc(LS.toText(v.pole, { sig: 4 }))}`, `γ₋(Π₁) = −Tφ(Π₁) = ${esc(LS.toText(v.birkhoff.gammaMinus, { sig: 4 }))}`],
        [`Π̂ = Π₂ − δ₃ → ${fmt(v.finite.MS, 6)} (MS), ${fmt(v.finite.MSbar, 6)} (MS-bar)`, `γ₊(Π₁) = (1 − T)φ(Π₁), γ₊(0) = ${fmt(v.birkhoff.renormalized, 6)}`],
        [`μ dΠ̂/dμ = ${fmt(v.dPiDlogMu, 5)}`, "μ ↦ μe^t moves the character; γ₋ is μ-independent"],
        [`α(μ) = 1/${fmt(1 / QED.alphaRun(muNow()), 7)}`, "renormalized coupling from the counterterm character"],
        [`β(e) = ${fmt(v.running.betaE, 5)} = e³/12π²`, "β = infinitesimal generator, from the residue of γ₋"],
        ["Π₁ is primitive", "ΔΠ₁ = Π₁⊗1 + 1⊗Π₁, S(Π₁) = −Π₁"],
        [`renormalized value ${fmt(v.finite.MS, 6)}`, `γ = γ₋⁻¹γ₊ with γ₊(0) = ${fmt(v.birkhoff.renormalized, 6)}`],
      ];
      return { title: "CONVENTIONAL | CONNES–KREIMER", sub: `step ${st + 1} of ${VP_STEPS.length}`, body: table(["conventional", "Connes–Kreimer"], rows.map((r, i) => (i === st ? [`<b>${r[0]}</b>`, `<b>${r[1]}</b>`] : i < st ? r : [`<span class="muted">${r[0]}</span>`, `<span class="muted">${r[1]}</span>`])).slice(0, Math.max(st + 1, 1))) };
    },
    space: (c) => {
      const st = c.s.step;
      if (st === 2 || st === 3) {
        let s = "";
        for (let i = 0; i < 6; i++) { const r = 18 + i * 17; s += circ(200, 105, r, "", `fill="none" stroke="var(--${i > 2 ? "ck" : "qft"})" opacity="${(0.25 + 0.12 * i).toFixed(2)}" stroke-width="${i > 2 ? 2 : 1}"`); }
        s += arrow(200, 105, 200 + 100 * Math.cos(c.t * 0.7), 105 - 100 * Math.sin(c.t * 0.7), "ck") + txt(14, 214, "Euclidean loop momentum k: shells out to |k| → ∞", "xs ink2");
        return { title: "THE INTEGRATION REGION", sub: "d⁴k over all of ℝ⁴", body: svg(400, 220, s, "integration region") };
      }
      return { title: "THE PIPELINE", sub: "", body: `<ol class="small">${VP_STEPS.map((t, i) => `<li${i === st ? ' style="font-weight:650"' : i > st ? ' class="muted"' : ""}>${supify(esc(t))}</li>`).join("")}</ol>` };
    },
  },
  notes: (c) => {
    const v = vpData(c);
    return `<p>${formula(v.integralTeX)} ${formula(v.scalarTeX)} Each Laurent coefficient is integrated numerically over the Feynman parameter x. The pole residue ${fmt(v.residue, 6)} equals ${tex("-2\\alpha/3\\pi")}; its μ-independence of e₀ = μ<sup>ε/2</sup>Z₃<sup>−1/2</sup>e gives ${tex("\\beta(e) = e^3/12\\pi^2")}. The same pole is the Birkhoff factor γ₋ of the primitive generator Π₁, and the renormalized value is γ₊(0). Q² = ${fmt(v.Q2, 4)} MeV², μ = ${muLabel(v.mu)}.</p>`;
  },
  md: (c) => ({ title: "QED vacuum polarization: from diagram to renormalized number", sections: REP.vpMarkdown(vpData(c)), params: { Q2_MeV2: Number(vpData(c).Q2.toPrecision(6)), step: c.s.step + 1 } }),
  deckKind: "vp",
});
