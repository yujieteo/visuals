/* Perturbative-QFT track, part 1: classical fields, gauge symmetry, quantization, propagators,
   path integrals, Wick contractions and tree-level scattering (spec §1–§26, §107–§108). */

/* ---------- small shared pieces ---------- */
const LAGR_TERMS = [
  { id: "F2", tex: "-\\frac{1}{4}F_{\\mu\\nu}F^{\\mu\\nu}", name: "electromagnetic field energy", link: "termF" },
  { id: "free", tex: "\\bar\\psi(i\\gamma^\\mu\\partial_\\mu - m)\\psi", name: "free electron / positron field", link: "termFree" },
  { id: "int", tex: "-e\\bar\\psi\\gamma^\\mu A_\\mu\\psi", name: "electron–photon interaction", link: "termInt" },
];
const VERTEX_GRAPH = { id: "vertex0", name: "QED vertex", vertices: [{ id: "q", x: 100, y: 10, kind: "ext" }, { id: "v", x: 100, y: 62, kind: "v" }, { id: "i", x: 30, y: 110, kind: "ext" }, { id: "o", x: 170, y: 110, kind: "ext" }], edges: [{ id: "A", a: "q", b: "v", type: "g", bend: 0 }, { id: "in", a: "i", b: "v", type: "e", bend: 0 }, { id: "out", a: "v", b: "o", type: "e", bend: 0 }] };
const LINE_GRAPH = (type) => ({ id: `line-${type}`, name: type === "g" ? "photon propagator" : "electron propagator", vertices: [{ id: "a", x: 20, y: 60, kind: "v" }, { id: "b", x: 180, y: 60, kind: "v" }], edges: [{ id: "p", a: "a", b: "b", type, bend: 0 }] });
/* Spinor rotation exp(−iθσ_z/2) on the upper two components: at θ = 2π it is −1. */
function spinorRotation(theta) { return LA.funm(LA.from([[1, 0], [0, -1]]), (x) => LA.C.polar(1, -theta * x / 2)); }
const phaseColor = (th) => `hsl(${Math.round(((th % (2 * PI)) + 2 * PI) % (2 * PI) * 180 / PI)},70%,50%)`;

/* ---------- §1 QED Lagrangian ---------- */
scene({
  id: "lagrangian", track: "qft", title: "QED Lagrangian", sections: [1],
  summary: "ℒ = −¼F<sub>μν</sub>F<sup>μν</sup> + ψ̄(iγ<sup>μ</sup>D<sub>μ</sub> − m)ψ with D<sub>μ</sub> = ∂<sub>μ</sub> + ieA<sub>μ</sub>. Click a term: the four panels switch to what that term describes.",
  refs: ["ps", "schwartz"],
  init: () => ({ term: "int" }),
  anim: ["field"],
  controls: (c) => seg("term", LAGR_TERMS.map((t) => [t.id, t.name]), c.s.term, "Term"),
  panels: {
    space: (c) => ({ title: "THE LAGRANGIAN", sub: "click a term", body: `<div class="formula" style="font-size:1.25rem;white-space:normal;line-height:2.2">ℒ<sub>QED</sub> = ${LAGR_TERMS.map((t) => `<button type="button" class="btn${c.s.term === t.id ? " primary" : ""}" style="font-family:var(--serif);font-size:1rem" data-set="s.term" data-val="${t.id}" data-link="${t.link}" aria-pressed="${c.s.term === t.id}">${tex(t.tex)}</button>`).join(" + ")}</div><p class="small">with ${tex("D_\\mu = \\partial_\\mu + ieA_\\mu,\\quad F_{\\mu\\nu} = \\partial_\\mu A_\\nu - \\partial_\\nu A_\\mu")}; the interaction term is the −e part of ψ̄iγ<sup>μ</sup>D<sub>μ</sub>ψ.</p><p class="small muted">${esc(LAGR_TERMS.find((t) => t.id === c.s.term).name)}</p>` }),
    field: (c) => {
      let s = "";
      if (c.s.term === "F2") {
        for (let i = 0; i <= 36; i++) { const x = 20 + i * 10, ph = 0.45 * i - 2 * c.t, E = Math.cos(ph); s += arrow(x, 80, x, 80 - 40 * E, "qft", "", 4) + ln(x, 80, x - 18 * E, 92 + 10 * E, "aqft", 'stroke-width="1.5" opacity="0.8"'); }
        s += txt(20, 150, "E (blue, up) and B (violet, into the page, drawn obliquely): energy density ½(E² + B²)", "xs ink2");
        return { title: "FIELD CONFIGURATION", sub: "plane wave", body: svg(400, 160, s, "electromagnetic wave") };
      }
      if (c.s.term === "free") {
        for (let i = 0; i <= 80; i++) { const x = 20 + i * 4.5, ph = 0.25 * i - 3 * c.t; s += circ(x, 70 - 30 * Math.cos(ph), 1.4, "fqft") + circ(x, 70 - 30 * Math.sin(ph), 1.4, "fck"); }
        s += txt(20, 130, "Re and Im of one spinor component of ψ = u(p)e^{−ip·x}: a complex wave, not a vector field", "xs ink2");
        return { title: "FIELD CONFIGURATION", sub: "Dirac plane wave (one component)", body: svg(400, 140, s, "Dirac wave") };
      }
      for (let i = 0; i <= 36; i++) { const x = 20 + i * 10; s += ln(x, 60, x, 60 - 22 * Math.cos(0.4 * i - 2 * c.t), "qft", 'stroke-width="2"'); }
      for (let i = 0; i <= 36; i++) { const x = 20 + i * 10; s += circ(x, 110, 4 + 3 * Math.cos(0.4 * i - 2 * c.t) ** 2, "fck", 'opacity="0.7"'); }
      s += txt(20, 140, "the current j^μ = ψ̄γ^μψ (orange) couples to A_μ (blue) at every point", "xs ink2");
      return { title: "FIELD CONFIGURATION", sub: "j·A", body: svg(400, 150, s, "current coupled to potential") };
    },
    diagram: (c) => {
      const g = c.s.term === "int" ? VERTEX_GRAPH : LINE_GRAPH(c.s.term === "F2" ? "g" : "e");
      const label = c.s.term === "int" ? "vertex factor −ieγ^μ" : c.s.term === "F2" ? "photon propagator −ig_μν/(q² + iε)" : "electron propagator i(p̸ + m)/(p² − m² + iε)";
      return { title: "FEYNMAN RULE", sub: esc(label), body: svg(400, 200, feynman(g, [20, 10, 360, 180], { link: () => LAGR_TERMS.find((t) => t.id === c.s.term).link })) };
    },
    algebra: (c) => {
      const rows = {
        F2: ["photon modes a_k, a_k†", "H = ∑ ω_k (a_k†a_k + ½)", "[a_k, a_q†] = δ_kq"],
        free: ["electrons b_p, b_p†; positrons d_p, d_p†", "H = ∑ E_p (b†b + d†d)", "{b_p, b_q†} = δ_pq (anticommute)"],
        int: ["H_int = e∫ψ̄γ^μψA_μ d³x", "creates/annihilates e⁻, e⁺ and γ at one point", "moves amplitude between Fock sectors"],
      }[c.s.term];
      return { title: "OPERATORS", sub: "after quantization", body: `<ul class="small">${rows.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${sceneLink(c.s.term === "int" ? "fock" : "ladder", c.s.term === "int" ? "see Fock sectors" : "see ladder operators")}` };
    },
  },
  notes: () => `<p>The three terms are the whole theory: the Maxwell term gives photons, the Dirac term gives electrons and positrons, and the interaction ${tex("-e\\bar\\psi\\gamma^\\mu A_\\mu\\psi")} is the only coupling. Gauge invariance (next views) forces the interaction to appear exactly through ${tex("D_\\mu = \\partial_\\mu + ieA_\\mu")}.</p>`,
  md: (c) => ({ sections: [{ heading: "The QED Lagrangian", body: "\\[\n\\mathcal L_{\\rm QED} = -\\tfrac14 F_{\\mu\\nu}F^{\\mu\\nu} + \\bar\\psi(i\\gamma^\\mu D_\\mu - m)\\psi,\\qquad D_\\mu = \\partial_\\mu + ieA_\\mu\n\\]" }, { heading: "Selected term", body: LAGR_TERMS.find((t) => t.id === c.s.term).name }] }),
});

/* ---------- §4 What is a field? ---------- */
const FIELD_STAGES = ["x ↦ f(x)", "x ↦ φ(x)", "x ↦ A_μ(x)", "x ↦ ψ(x)"];
scene({
  id: "field", track: "qft", title: "What is a field?", sections: [4],
  summary: "A field assigns a value to every point. Step from an ordinary function to a scalar field on spacetime, to the electromagnetic potential (drawn as E and B), to the Dirac field, which needs a different picture because ψ is not a classical vector field.",
  refs: ["ps", "weinberg"],
  init: () => ({ stage: 0, px: 0.2 }),
  anim: ["field"],
  controls: (c) => stepper("stage", FIELD_STAGES, c.s.stage),
  panels: {
    space: (c) => {
      const M = minkowski({ W: 400, H: 220, scale: 45, cone: { t: 0, x: c.s.px } });
      const [x, y] = M.P(0.6, c.s.px);
      return { title: "SPACETIME POINT", sub: "drag x", body: svg(400, 220, M.s + circ(x, y, 6, "fck", 'data-drag="pt" data-link="point" data-tip="spacetime point x"') + txt(x + 9, y - 6, "x", "lbl serif"), "spacetime point"), foot: `The field's value is read at this point: ${FIELD_STAGES[c.s.stage]}.` };
    },
    field: (c) => {
      let s = "";
      const st = c.s.stage;
      if (st === 0) { const pts = Q.linspace(0, 1, 120).map((u) => [20 + 360 * u, 90 - 50 * Math.sin(6 * u) * Math.exp(-u)]); s += path(pathD(pts), "qft", 'fill="none" stroke-width="2"') + ln(20, 90, 380, 90, "axis") + txt(24, 20, "f: ℝ → ℝ, an ordinary function", "xs ink2"); }
      if (st === 1) { for (let i = 0; i < 30; i++) for (let j = 0; j < 12; j++) { const v = Math.sin(0.35 * i - 1.5 * c.t) * Math.cos(0.4 * j); s += rect(20 + i * 12, 20 + j * 10, 11, 9, "fqft", `fill-opacity="${(0.5 + 0.5 * v).toFixed(2)}"`); } s += txt(20, 150, "φ(t, x): one real number at every spacetime point (shade)", "xs ink2"); }
      if (st === 2) { const ch = [{ x: -0.6, y: 0, q: 1 }, { x: 0.6, y: 0, q: -1 }]; for (let i = 0; i < 16; i++) for (let j = 0; j < 7; j++) { const X = -1.9 + i * 0.25, Y = -0.75 + j * 0.25; const [ex, ey] = QED.efield(ch, X, Y); const n = Math.hypot(ex, ey) || 1, L = 9 * Math.min(1, 0.4 + 0.1 * Math.log10(1 + 50 * n)); const cx = 200 + X * 95, cy = 80 - Y * 95; s += arrow(cx - (ex / n) * L / 2, cy + (ey / n) * L / 2, cx + (ex / n) * L / 2, cy - (ey / n) * L / 2, "qft", "", 3.5); } for (const q of ch) s += circ(200 + q.x * 95, 80, 7, q.q > 0 ? "fck" : "faqft") + txt(200 + q.x * 95, 84, q.q > 0 ? "+" : "−", "lbl", 'text-anchor="middle" style="fill:var(--bg)"'); s += txt(20, 158, "A_μ(x) is a 4-vector; its derivatives give E (arrows) and B fields", "xs ink2"); }
      if (st === 3) {
        for (let i = 0; i < 9; i++) {
          const x0 = 30 + i * 40, ph = 0.8 * i - 2 * c.t;
          const comps = [Math.cos(ph), 0.6 * Math.sin(ph + 1), 0.4 * Math.cos(2 * ph), 0.3];
          comps.forEach((a, k) => { s += rect(x0 + k * 6, 100 - 40 * Math.abs(a), 5, 40 * Math.abs(a), k < 2 ? "fqft" : "fck", 'opacity="0.85"'); });
          s += circ(x0 + 11, 128, 9, "", 'fill="none" stroke="var(--axis)"') + ln(x0 + 11, 128, x0 + 11 + 8 * Math.cos(ph), 128 - 8 * Math.sin(ph), "ck", 'stroke-width="1.6"');
        }
        s += txt(20, 22, "schematic: ψ(x) ∈ ℂ⁴ — four complex amplitudes (bars = modulus, dial = phase)", "xs ink2") + txt(20, 156, "not an arrow in space: a 2π rotation multiplies ψ by −1", "xs ink2");
      }
      return { title: "FIELD VALUE", sub: esc(FIELD_STAGES[st]), body: svg(400, 165, s, "field value") };
    },
    diagram: (c) => {
      const kinds = [["f(x)", "ℝ → ℝ", "a function of one variable"], ["φ(x)", "ℝ^{1,3} → ℝ", "scalar: φ′(Λx) = φ(x)"], ["A_μ(x)", "ℝ^{1,3} → ℝ⁴", "vector: A′_μ(Λx) = Λ_μ^ν A_ν(x)"], ["ψ(x)", "ℝ^{1,3} → ℂ⁴", "spinor: ψ′(Λx) = S(Λ)ψ(x)"]];
      return { title: "WHAT IS ASSIGNED", sub: "value spaces", body: table(["field", "map", "transformation"], kinds.map((k, i) => [i === c.s.stage ? `<b>${k[0]}</b>` : k[0], k[1], k[2]])) };
    },
    algebra: () => {
      const R = spinorRotation(2 * PI);
      return { title: "SPINORS ARE NOT VECTORS", sub: "computed", body: `<p class="small">Rotation by θ about z acts on a spinor by ${tex("e^{-i\\theta\\sigma_z/2}")}. At θ = 2π the engine gets</p><p class="formula">diag(${fmt(LA.get(R, 0, 0)[0], 3)}, ${fmt(LA.get(R, 1, 1)[0], 3)})</p><p class="small">so ψ ↦ −ψ under a full turn, while every vector returns to itself. That is why the Dirac field gets its own encoding.</p>` };
    },
  },
  drag: { pt: (c, p) => { c.s.px = clamp((p.x - 200) / 45, -3.5, 3.5); } },
  notes: () => `<p>A classical field is a function on spacetime. The electromagnetic field is a 4-vector potential ${tex("A_\\mu(x)")} whose derivatives are ${tex("E")} and ${tex("B")}. The Dirac field ${tex("\\psi(x)")} takes values in ${tex("\\mathbb{C}^4")} and transforms by the spin representation; the page draws it as four complex amplitudes, never as an arrow.</p>`,
});

/* ---------- §5 spacetime, §103 toggles ---------- */
scene({
  id: "spacetime", track: "qft", title: "Spacetime and light cones", sections: [5],
  summary: "A Minkowski diagram with a light cone, a timelike worldline, a null photon line and two draggable events whose separation is classified as timelike, null or spacelike. Toggle spatial slice and Euclidean continuation in the bar above the panels.",
  refs: ["ps", "haag"],
  init: () => ({ A: [0, 0], B: [1.4, 0.8], eta: 0 }),
  controls: (c) => slider("eta", "boost rapidity η", -1.5, 1.5, 0.05, c.s.eta, (v) => v.toFixed(2)),
  panels: {
    space: (c) => {
      if (G.stMode === "slice") {
        // the spatial plane at t = t_B: light from A fills a disc of radius |t_B − t_A|
        const r = Math.abs(c.s.B[0] - c.s.A[0]), X = (x) => 200 + x * 46, Y = (y) => 130 - y * 46;
        let s = ln(10, 130, 390, 130, "axis") + ln(200, 10, 200, 250, "axis") + txt(384, 124, "x", "sm serif", 'text-anchor="end"') + txt(206, 18, "y", "sm serif");
        s += circ(X(c.s.A[1]), Y(0), r * 46, "cone", 'data-link="lightcone"') + circ(X(c.s.A[1]), Y(0), 5, "fck") + txt(X(c.s.A[1]) + 8, Y(0) - 6, "A (t_A)", "xs ink2");
        s += circ(X(c.s.B[1]), Y(0), 6.5, "faqft", 'data-drag="Bslice" data-tip="event B on the slice"') + txt(X(c.s.B[1]) + 8, Y(0) + 14, "B", "lbl");
        const iv = QED.interval(c.s.B, c.s.A);
        return { title: "SPATIAL SLICE", sub: `t = t_B = ${fmt(c.s.B[0], 3)}`, body: svg(400, 260, s, "spatial slice"), foot: `The light sphere of A has radius ${fmt(r, 3)} at this time; B is ${iv.kind === "timelike" ? "inside it (timelike)" : iv.kind === "null" ? "on it (null)" : "outside it (spacelike)"}.` };
      }
      const M = minkowski({ W: 400, H: 260, scale: 46, mode: G.stMode, cone: { t: c.s.A[0], x: c.s.A[1] } });
      const b = (p) => QED.boost2(-c.s.eta, p);
      const A = b(c.s.A), B = b(c.s.B);
      let s = M.s;
      if (G.stMode !== "euclid") {
        s += path(pathD(Q.linspace(-2.6, 2.6, 30).map((t) => M.P(...b([t, 0.35 * t - 1.6])))), "fermion", 'data-link="timelike" data-tip="massive particle: timelike worldline"');
        s += path(pathD([M.P(...b([-2.6, 0.6 - 2.6])), M.P(...b([2.6, 0.6 + 2.6]))]), "photon", 'data-link="null" data-tip="photon: null worldline"');
      }
      const iv = QED.interval(c.s.B, c.s.A);
      s += ln(...M.P(...A), ...M.P(...B), iv.kind === "timelike" ? "ok" : iv.kind === "spacelike" ? "bad" : "qft", 'stroke-width="2" stroke-dasharray="4 3"');
      for (const [k, P] of [["A", A], ["B", B]]) { const [x, y] = M.P(...P); s += circ(x, y, 6.5, k === "A" ? "fck" : "faqft", `data-drag="${k}" data-tip="event ${k}"`) + txt(x + 9, y - 6, k, "lbl"); }
      if (G.stMode === "euclid") s += txt(14, 252, "Euclidean: τ = it; the light cone is gone and every separation is a distance", "xs ink2");
      return { title: G.stMode === "euclid" ? "EUCLIDEAN CONTINUATION" : "MINKOWSKI DIAGRAM", sub: G.stMode === "euclid" ? "τ, x" : "t, x (c = 1)", body: svg(400, 260, s, "spacetime diagram"), foot: `Separation of B from A: <b>${iv.kind}</b>, s² = ${fmt(iv.s2, 4)}${c.s.eta ? ` (shown in a frame boosted by η = ${c.s.eta.toFixed(2)}: coordinates change, s² does not)` : ""}.` };
    },
    field: (c) => {
      const dt = c.s.B[0] - c.s.A[0], r = Math.abs(dt);
      let s = ln(20, 120, 380, 120, "axis") + txt(372, 114, "x", "sm serif");
      const X = (x) => 200 + x * 55;
      s += rect(X(c.s.A[1] - r), 105, 110 * r / 2 * 1, 30, "bgqft", 'stroke="var(--qft)"');
      s += circ(X(c.s.A[1]), 120, 5, "fck") + txt(X(c.s.A[1]), 100, "A (at t_A)", "xs ink2", 'text-anchor="middle"') + circ(X(c.s.B[1]), 120, 5, "faqft") + txt(X(c.s.B[1]), 152, "B", "xs ink2", 'text-anchor="middle"');
      s += txt(20, 30, `Spatial slice at t_B: light from A has reached |x − x_A| ≤ |t_B − t_A| = ${fmt(r, 3)}`, "xs ink2");
      const inside = Math.abs(c.s.B[1] - c.s.A[1]) < r;
      s += txt(20, 46, inside ? "B is inside: a signal from A can reach it (timelike)" : "B is outside: no signal connects them (spacelike)", "xs", `style="fill:${inside ? "var(--ok)" : "var(--bad)"}"`);
      return { title: "SPATIAL SLICE", sub: "t = t_B", body: svg(400, 170, s, "spatial slice") };
    },
    diagram: (c) => {
      const iv = QED.interval(c.s.B, c.s.A);
      const etas = Q.linspace(-1.5, 1.5, 31);
      const pts = etas.map((e) => { const A = QED.boost2(e, c.s.A), B = QED.boost2(e, c.s.B); return [e, (B[0] - A[0]) ** 2 - (B[1] - A[1]) ** 2]; });
      const dts = etas.map((e) => { const A = QED.boost2(e, c.s.A), B = QED.boost2(e, c.s.B); return [e, B[0] - A[0]]; });
      return { title: "INVARIANCE UNDER BOOSTS", sub: "computed in every frame", body: lineChart({ W: 400, H: 200, xr: [-1.5, 1.5], yr: [Math.min(-1, ...dts.map((p) => p[1]), iv.s2) - 0.2, Math.max(1, ...dts.map((p) => p[1]), iv.s2) + 0.2], series: [{ pts, cls: "ck", label: "s² (invariant)" }, { pts: dts, cls: "qft", label: "Δt (frame dependent)", dash: "5 3" }], xlabel: "boost rapidity η", vlines: [{ x: c.s.eta, label: "current" }] }) };
    },
    algebra: (c) => {
      const iv = QED.interval(c.s.B, c.s.A);
      return { title: "CAUSALITY AND OBSERVABLES", sub: "", body: `<p class="small">In algebraic QFT, observables localized at spacelike separation commute: ${tex("[A, B] = 0")}. These two events are <b>${iv.kind}</b>-separated, so ${iv.kind === "spacelike" ? "their local observables commute." : "a measurement at one can influence the other."}</p>${sceneLink("net", "see the net of local algebras")}` };
    },
  },
  drag: {
    A: (c, p) => { const t = clamp(-(p.y - 140) / 46, -2.5, 2.5), x = clamp((p.x - 200) / 46, -4, 4); c.s.A = QED.boost2(c.s.eta, [t, x]); },
    B: (c, p) => { const t = clamp(-(p.y - 140) / 46, -2.5, 2.5), x = clamp((p.x - 200) / 46, -4, 4); c.s.B = QED.boost2(c.s.eta, [t, x]); },
    Bslice: (c, p) => { c.s.B = [c.s.B[0], clamp((p.x - 200) / 46, -4, 4)]; },
  },
  notes: () => `<p>With c = 1 the light cone is the set ${tex("t^2 - x^2 = 0")}. A massive particle's worldline stays inside the cone (timelike), a photon's runs along it (null), and points outside one another's cones are spacelike. The interval ${tex("s^2 = \\Delta t^2 - \\Delta x^2")} is the same in every inertial frame, which the boost chart computes frame by frame.</p><p>The Euclidean continuation ${tex("t \\mapsto -i\\tau")} turns ${tex("s^2")} into minus a Euclidean distance squared; it is the setting of path integrals, dimensional regularization and spectral triples (see ${sceneLink("wickrot", "Wick rotation")}).</p>`,
});

/* ---------- §6 classical electromagnetism ---------- */
scene({
  id: "em", track: "qft", title: "Classical electromagnetism", sections: [6],
  summary: "Place and drag charges: field lines, Gauss's law ∇·E = ρ checked by an actual flux integral, a uniformly moving charge's contracted field, and a free electromagnetic wave. Particles and fields already coexist classically.",
  refs: ["jackson"],
  init: () => ({ mode: "static", charges: [{ x: -0.7, y: 0, q: 1 }, { x: 0.7, y: 0.1, q: -1 }], v: 0.6, gauss: 0 }),
  anim: ["field", "space"],
  controls: (c) => `${seg("mode", [["static", "static charges"], ["moving", "moving charge"], ["wave", "EM wave"]], c.s.mode)} ${c.s.mode === "moving" ? slider("v", "speed v/c", 0, 0.95, 0.01, c.s.v, (v) => v.toFixed(2)) : ""} ${c.s.mode === "static" ? actBtn("addcharge", "+ charge", "1") + actBtn("addcharge", "− charge", "-1") + actBtn("resetcharges", "reset") : ""}`,
  actions: {
    addcharge: (c, arg) => { if (c.s.charges.length < 5) c.s.charges.push({ x: 0.2 * c.s.charges.length - 0.4, y: -0.5, q: Number(arg) }); },
    resetcharges: (c) => { c.s.charges = [{ x: -0.7, y: 0, q: 1 }, { x: 0.7, y: 0.1, q: -1 }]; },
  },
  panels: {
    field: (c) => {
      const W = 400, H = 280, sc = 95, X = (x) => W / 2 + x * sc, Y = (y) => H / 2 - y * sc;
      let s = "";
      if (c.s.mode === "wave") {
        for (let i = 0; i <= 44; i++) { const z = -2 + i * 0.09, w = QED.planeWave(z, c.t * 0.3, 2 * PI); s += ln(X(z), Y(0), X(z), Y(0.9 * w.E[0]), "qft", 'stroke-width="1.6"') + ln(X(z), Y(0), X(z) + 0.5 * sc * w.B[1], Y(0) + 0.3 * sc * w.B[1], "aqft", 'stroke-width="1.3" opacity="0.8"'); }
        s += arrow(X(-2), Y(0), X(2), Y(0), "axis") + txt(X(2) - 4, Y(0) - 6, "k (z)", "sm") + txt(14, 18, "E (blue) ⊥ B (violet, oblique) ⊥ k; |E| = |B|; both oscillate in phase", "xs ink2");
        return { title: "ELECTROMAGNETIC WAVE", sub: "E = E₀cos(kz − ωt)", body: svg(W, H, s, "wave") };
      }
      if (c.s.mode === "moving") {
        const xq = ((c.t * c.s.v * 0.6) % 4) - 2;
        for (let k = 0; k < 24; k++) { const th = (2 * PI * k) / 24; let px = 0, py = 0; const pts = []; for (let i = 0; i < 40; i++) { const r = 0.05 + i * 0.05; const f = QED.movingChargeField(1, c.s.v, Math.cos(th), Math.sin(th)); px = r * f.E[0] / Math.hypot(...f.E); py = r * f.E[1] / Math.hypot(...f.E); pts.push([X(xq + px), Y(py)]); } s += path(pathD(pts), "qft", 'fill="none" stroke-width="1.1"'); }
        s += circ(X(xq), Y(0), 7, "fck") + arrow(X(xq) + 10, Y(0), X(xq) + 10 + 40 * c.s.v, Y(0), "ck");
        s += txt(14, 18, `Heaviside field of a charge moving at v = ${c.s.v.toFixed(2)}c: lines crowd towards the transverse plane`, "xs ink2");
        return { title: "MOVING CHARGE", sub: "uniform motion", body: svg(W, H, s, "moving charge") };
      }
      const ch = c.s.charges;
      for (let i = -9; i <= 9; i++) for (let j = -6; j <= 6; j++) { const x = i * 0.2, y = j * 0.2; const [ex, ey] = QED.efield(ch, x, y); const n = Math.hypot(ex, ey); if (n > 3) continue; const L = 7; s += ln(X(x), Y(y), X(x) + (ex / n) * L, Y(y) - (ey / n) * L, "axis", 'opacity="0.6"'); }
      for (const q of ch) if (q.q > 0) for (let k = 0; k < 12; k++) { const th = (2 * PI * (k + 0.5)) / 12; s += path(pathD(QED.fieldLine(ch, q.x + 0.06 * Math.cos(th), q.y + 0.06 * Math.sin(th), { box: [-2.1, -1.5, 2.1, 1.5] }).map(([x, y]) => [X(x), Y(y)])), "qft", 'fill="none" stroke-width="1.2"'); }
      if (!ch.some((q) => q.q > 0)) for (const q of ch) for (let k = 0; k < 12; k++) { const th = (2 * PI * (k + 0.5)) / 12; s += path(pathD(QED.fieldLine(ch, q.x + 0.06 * Math.cos(th), q.y + 0.06 * Math.sin(th), { dir: -1, box: [-2.1, -1.5, 2.1, 1.5] }).map(([x, y]) => [X(x), Y(y)])), "qft", 'fill="none" stroke-width="1.2"'); }
      const gq = ch[c.s.gauss] || ch[0];
      s += circ(X(gq.x), Y(gq.y), 0.35 * sc, "", 'fill="none" stroke="var(--ck)" stroke-dasharray="4 3" data-link="gauss"');
      ch.forEach((q, i) => { s += circ(X(q.x), Y(q.y), 9, q.q > 0 ? "fck" : "faqft", `data-drag="q" data-arg="${i}" data-tip="charge ${q.q > 0 ? "+" : "−"}; drag me"`) + txt(X(q.x), Y(q.y) + 4, q.q > 0 ? "+" : "−", "lbl", 'text-anchor="middle" style="fill:var(--bg);pointer-events:none"'); });
      return { title: "FIELD LINES", sub: "drag the charges", body: svg(W, H, s, "electric field lines") };
    },
    space: (c) => {
      const M = minkowski({ W: 400, H: 220, scale: 40, cone: false });
      let s = M.s;
      if (c.s.mode === "moving") { s += path(pathD([M.P(-2.5, -2.5 * c.s.v), M.P(2.5, 2.5 * c.s.v)]), "fermion", 'data-tip="worldline of the moving charge"'); }
      else if (c.s.mode === "static") c.s.charges.forEach((q) => { s += path(pathD([M.P(-2.5, q.x * 2), M.P(2.5, q.x * 2)]), q.q > 0 ? "ck" : "aqft", 'fill="none" stroke-width="2"'); });
      else for (let k = -6; k <= 6; k++) s += ln(...M.P(-2.5, k * 0.6 - 2.5), ...M.P(2.5, k * 0.6 + 2.5), "photon", 'opacity="0.5"');
      return { title: "WORLDLINES", sub: "particles in spacetime", body: svg(400, 220, s, "worldlines"), foot: c.s.mode === "wave" ? "Wavefronts of constant phase travel along null lines." : "Charges are particles with worldlines; the field fills spacetime around them." };
    },
    diagram: (c) => {
      if (c.s.mode !== "static") return { title: "GAUSS'S LAW", body: `<p class="small">${tex("\\nabla\\cdot E = \\rho")} holds for every configuration; switch to static charges to integrate the flux.</p>` };
      const gq = c.s.charges[c.s.gauss] || c.s.charges[0];
      const flux = QED.gaussFlux(c.s.charges, gq.x, gq.y, 0.35);
      const enclosed = c.s.charges.filter((q) => Math.hypot(q.x - gq.x, q.y - gq.y) < 0.35).reduce((s2, q) => s2 + q.q, 0);
      return { title: "GAUSS'S LAW, COMPUTED", sub: "sphere of radius 0.35", body: barChart({ W: 400, H: 170, items: [{ label: "∮ E·dA (numerical)", value: flux, cls: "qft", tip: `flux = ${fmt(flux, 8)}` }, { label: "enclosed charge", value: enclosed, cls: "ck" }], showValues: true, vfmt: (v) => fmt(v, 6) }), foot: `${seg("gauss", c.s.charges.map((q, i) => [i, `around charge ${i + 1}`]), c.s.gauss)}` };
    },
    algebra: (c) => ({ title: "TWO ONTOLOGIES", sub: "already classical", body: table(["particles", "field"], [["point charges with worldlines", "E(x), B(x) at every point"], [`${c.s.charges.length} charges, total ${c.s.charges.reduce((s2, q) => s2 + q.q, 0)}`, "energy ½∫(E² + B²) d³x"], ["move under the Lorentz force", "obeys Maxwell's equations"]]) }),
  },
  drag: { q: (c, p, ph, arg) => { const q = c.s.charges[Number(arg)]; if (q) { q.x = clamp((p.x - 200) / 95, -2, 2); q.y = clamp(-(p.y - 140) / 95, -1.4, 1.4); } } },
  notes: () => `<p>The field lines are traced from the Coulomb field ${tex("E = \\sum q\\,\\hat r/4\\pi r^2")} (Heaviside–Lorentz units). Gauss's law is checked by integrating ${tex("E\\cdot dA")} over a sphere around the chosen charge: the integral returns the enclosed charge. A uniformly moving charge has the Heaviside field ${tex("E = q(1-v^2)\\hat R/(4\\pi R^2(1-v^2\\sin^2\\theta)^{3/2})")}; a free wave has ${tex("E \\perp B \\perp k")}.</p>`,
});

/* ---------- §7 potential versus field strength ---------- */
function gaugeGrid(N = 8, seed = 0.6) {
  const Ax = Q.range(N).map((i) => Q.range(N).map((j) => 0.35 * Math.sin(0.9 * i + 0.4 * j + seed)));
  const Ay = Q.range(N).map((i) => Q.range(N).map((j) => 0.35 * Math.cos(0.5 * i - 0.8 * j)));
  const chi = Q.range(N).map((i) => Q.range(N).map((j) => Math.sin((2 * PI * i) / N) * Math.cos((2 * PI * j) / N)));
  return { Ax, Ay, chi, N };
}
/* The potential shifted by the gauge function at the chosen (or animated) amplitude. */
function gaugeShift(c) {
  const g = gaugeGrid(), amp = c.s.auto ? 2 * Math.sin(c.t * 0.8) : c.s.s;
  return { g, amp, T: QED.gaugeTransform(g.Ax, g.Ay, g.chi, amp) };
}
scene({
  id: "potential", track: "qft", title: "Potential versus field strength", sections: [7],
  summary: "Two layers: the potential A<sub>μ</sub> and the physical field F<sub>μν</sub>. Perform A ↦ A + ∂χ: the arrows of A move, the plaquettes of F do not change at all.",
  refs: ["jackson", "nakahara"],
  init: () => ({ s: 0, auto: true }),
  anim: ["field", "diagram", "algebra"],
  warnings: ["<b>Different potentials can encode the same electromagnetic field.</b>"],
  controls: (c) => `${slider("s", "gauge function amplitude", -2, 2, 0.05, c.s.s, (v) => v.toFixed(2))} ${toggle("auto", "animate χ", c.s.auto)}`,
  panels: {
    space: () => {
      const g = gaugeGrid();
      return { title: "GAUGE FUNCTION χ(x)", sub: "on the lattice", body: svg(220, 220, heatmap(g.chi, { size: 26, x: 6, y: 6, cls: "ck", name: "χ" }), "gauge function") };
    },
    field: (c) => {
      const { g, amp, T } = gaugeShift(c);
      let s = "";
      const sc = 44;
      for (let i = 0; i < g.N; i++) for (let j = 0; j < g.N; j++) {
        const x = 24 + i * sc, y = 24 + j * sc;
        s += arrow(x, y, x + 34 * clamp(T.Ax[i][j], -1, 1), y, "qft", "", 3.5) + arrow(x, y, x, y + 34 * clamp(T.Ay[i][j], -1, 1), "aqft", "", 3.5) + circ(x, y, 1.6, "vtx");
      }
      return { title: "POTENTIAL A", sub: `χ amplitude ${amp.toFixed(2)}`, body: svg(370, 370, s, "potential arrows"), foot: "Link arrows: A_x (blue), A_y (violet). They change with χ." };
    },
    diagram: (c) => {
      const { T } = gaugeShift(c);
      const F = QED.latticeCurl(T.Ax, T.Ay);
      const s = heatmap(F.map((r) => r.map((v) => v)), { size: 26, x: 6, y: 6, cls: "qft", name: "F_xy" });
      return { title: "FIELD STRENGTH F", sub: "plaquettes", body: svg(220, 220, s, "field strength"), foot: "F_xy = ∂_xA_y − ∂_yA_x on each plaquette: identical for every χ." };
    },
    algebra: (c) => {
      const { g, T } = gaugeShift(c);
      const F0 = QED.latticeCurl(g.Ax, g.Ay).flat(), F1 = QED.latticeCurl(T.Ax, T.Ay).flat();
      const dA = Math.max(...g.Ax.flat().map((a, k) => Math.abs(a - T.Ax.flat()[k])));
      const dF = Math.max(...F0.map((f, k) => Math.abs(f - F1[k])));
      return { title: "CHECK", sub: "computed", body: kv([["max |ΔA|", fmt(dA, 4)], ["max |ΔF|", dF === 0 ? "0 (exactly)" : fmt(dF, 3)]]) + `<p class="small">The discrete curl of a discrete gradient vanishes identically, so ${tex("F = dA")} cannot see ${tex("\\partial\\chi")}.</p>` };
    },
  },
  notes: () => `<p>${tex("A_\\mu \\mapsto A_\\mu + \\partial_\\mu\\chi")} changes the potential everywhere χ varies, yet ${tex("F_{\\mu\\nu} = \\partial_\\mu A_\\nu - \\partial_\\nu A_\\mu")} is unchanged because mixed partial derivatives commute. On the lattice the same statement is exact: the plaquette sum of a gradient is zero, which the CHECK panel shows to the last digit.</p>`,
});

/* ---------- §8 local U(1) gauge symmetry ---------- */
/* A fixed phase pattern θ₀ for ψ and its gauge-rotated copy θ at the chosen strength. */
function phaseFrame(c) {
  const N = 8, g = gaugeGrid(N);
  const th0 = Q.range(N).map((i) => Q.range(N).map((j) => 0.4 * i + 0.25 * j));
  return { N, g, th0, th: QED.transformPhase(th0, g.chi, 1.5, c.s.chi) };
}
scene({
  id: "gauge", track: "qft", title: "Local U(1) gauge symmetry", sections: [8],
  summary: "Rotate the phase of ψ(x) by e<sup>−ieχ(x)</sup> at every point and shift A by ∂χ. Neighbouring phases compared naively change; compared through the connection, they do not.",
  refs: ["ps", "nakahara"],
  init: () => ({ chi: 0.8 }),
  controls: (c) => slider("chi", "transformation strength", 0, 1, 0.01, c.s.chi, (v) => v.toFixed(2)),
  panels: {
    field: (c) => {
      const { N, th } = phaseFrame(c);
      let s = "";
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = 26 + i * 44, y = 26 + j * 44; s += circ(x, y, 14, "", 'fill="none" stroke="var(--rule)"') + arrow(x, y, x + 13 * Math.cos(th[i][j]), y - 13 * Math.sin(th[i][j]), "ck", "", 4); }
      return { title: "PHASE OF ψ(x)", sub: "small arrows on circles", body: svg(370, 370, s, "phases"), foot: `ψ(x) ↦ e^{−ieχ(x)}ψ(x) at strength ${c.s.chi.toFixed(2)}.` };
    },
    diagram: (c) => {
      const { g, th0, th } = phaseFrame(c);
      const T = QED.gaugeTransform(g.Ax, g.Ay, g.chi, c.s.chi);
      const naive0 = QED.naiveComparison(th0).flat(), naive1 = QED.naiveComparison(th).flat();
      const cov0 = QED.linkComparison(th0, g.Ax, 1.5).flat(), cov1 = QED.linkComparison(th, T.Ax, 1.5).flat();
      const pts = (a) => a.slice(0, 24).map((v, k) => [k, v]);
      return { title: "COMPARING NEIGHBOURS", sub: "x → x + 1 along a row", body: lineChart({ W: 400, H: 200, xr: [0, 23], yr: [-PI, PI], series: [{ pts: pts(naive0), cls: "qft", label: "naive, before", dash: "4 3" }, { pts: pts(naive1), cls: "qft", label: "naive, after" }, { pts: pts(cov0), cls: "ck", label: "covariant, before", dash: "4 3", width: 3 }, { pts: pts(cov1), cls: "ck", label: "covariant, after" }], xlabel: "link index", yfmt: (v) => v.toFixed(1) }), foot: `max change: naive ${fmt(Math.max(...naive0.map((v, k) => Math.abs(Math.atan2(Math.sin(v - naive1[k]), Math.cos(v - naive1[k]))))), 3)}, covariant ${fmt(Math.max(...cov0.map((v, k) => Math.abs(Math.atan2(Math.sin(v - cov1[k]), Math.cos(v - cov1[k]))))), 3)}` };
    },
    space: () => ({ title: "LOCAL PHASE FRAMES", sub: "", body: svg(400, 170, (() => { let s = ""; for (let i = 0; i < 6; i++) { const x = 40 + i * 64; s += circ(x, 60, 18, "", 'fill="none" stroke="var(--axis)"') + arrow(x, 60, x + 16 * Math.cos(0.7 * i), 60 - 16 * Math.sin(0.7 * i), "ck", "", 4); if (i < 5) s += path(`M${x + 20} 60Q${x + 32} 30 ${x + 44} 60`, "photon", 'fill="none" data-link="connection"'); } return s + txt(20, 120, "local phase frames ↓ the connection A tells us how to compare them", "xs ink2") + txt(20, 140, "U(x, x+1) = e^{ieA}: the parallel transporter between neighbouring frames", "xs ink2"); })(), "phase frames") }),
    algebra: () => ({ title: "COVARIANT DERIVATIVE", body: formula("D_\\mu\\psi = (\\partial_\\mu + ieA_\\mu)\\psi \\;\\mapsto\\; e^{-ie\\chi}D_\\mu\\psi") + `<p class="small">Without A there is no invariant way to compare ψ at neighbouring points: the naive difference ψ(x+1) − ψ(x) mixes two different local frames.</p>` }),
  },
  notes: () => `<p>Under ${tex("\\psi \\mapsto e^{-ie\\chi}\\psi")} and ${tex("A_\\mu \\mapsto A_\\mu + \\partial_\\mu\\chi")} the combination ${tex("\\psi^*(x)\\,e^{ieA}\\,\\psi(x+1)")} is invariant (orange curves coincide) while ${tex("\\psi^*(x)\\psi(x+1)")} is not (blue curves differ). This is the whole reason the interaction appears through ${tex("D_\\mu")}.</p>`,
});

/* ---------- §9 fibre bundle ---------- */
scene({
  id: "bundle", track: "qft", title: "Geometry of gauge theory", sections: [9],
  summary: "A U(1) circle bundle over spacetime: a phase circle at every point, the gauge field as the connection between neighbouring fibres, and curvature F = dA as the holonomy around a small loop (computed both as ∮A and as ∫F).",
  refs: ["nakahara", "jackson"],
  init: () => ({ B: 0.8, R: 1.2 }),
  controls: (c) => `${slider("B", "field B", -2, 2, 0.05, c.s.B, (v) => v.toFixed(2))} ${slider("R", "loop radius", 0.2, 2, 0.05, c.s.R, (v) => v.toFixed(2))}`,
  panels: {
    field: (c) => {
      let s = ln(20, 200, 380, 200, "axis") + txt(372, 214, "spacetime", "xs ink2", 'text-anchor="end"');
      const n = 9;
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const x = 40 + i * 40, cy = 110;
        s += `<ellipse cx="${x}" cy="${cy}" rx="12" ry="40" fill="none" stroke="var(--axis)"/>` + ln(x, 150, x, 200, "grid");
        const A = c.s.B * (i - 4) * 0.12;
        const y = cy - 40 * Math.sin(ph), dx = 12 * Math.cos(ph);
        s += circ(x + dx, y, 3.5, "fck", `data-tip="section value at point ${i + 1}"`);
        if (i < n - 1) { const ph2 = ph + A; s += path(`M${x + dx} ${y}Q${x + 20} ${cy - 40 * Math.sin((ph + ph2) / 2) - 8} ${x + 40 + 12 * Math.cos(ph2)} ${cy - 40 * Math.sin(ph2)}`, "photon", 'fill="none" data-link="connection" data-tip="parallel transport by e^{ieA}"'); ph = ph2; }
      }
      s += txt(20, 30, "U(1) fibres (circles) over spacetime; the connection carries a phase from fibre to fibre", "xs ink2");
      return { title: "CIRCLE BUNDLE", sub: "horizontal transport", body: svg(400, 220, s, "fibre bundle") };
    },
    space: (c) => {
      // vector potential of a uniform field in symmetric gauge: A = (B/2)(−y, x); holonomy ∮A·dl = B π R²
      const sc = 60, X = (x) => 200 + x * sc, Y = (y) => 120 - y * sc;
      let s = "";
      for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) { const x = i * 0.6, y = j * 0.6, ax = -c.s.B * y / 2, ay = c.s.B * x / 2; s += arrow(X(x), Y(y), X(x + 0.3 * ax), Y(y + 0.3 * ay), "qft", "", 3); }
      s += circ(X(0), Y(0), c.s.R * sc, "", 'fill="var(--ck-bg)" stroke="var(--ck)" stroke-width="1.6" data-link="loop"');
      return { title: "BASE: A AND A LOOP", sub: "symmetric gauge", body: svg(400, 240, s, "connection on the base") };
    },
    diagram: (c) => {
      const n = 400, R = c.s.R;
      let line = 0;
      for (let k = 0; k < n; k++) { const th = (2 * PI * (k + 0.5)) / n, x = R * Math.cos(th), y = R * Math.sin(th); line += (-c.s.B * y / 2) * (-R * Math.sin(th)) * (2 * PI / n) + (c.s.B * x / 2) * (R * Math.cos(th)) * (2 * PI / n); }
      const area = c.s.B * PI * R * R;
      let s = circ(110, 100, 60, "", 'fill="none" stroke="var(--axis)"') + arrow(110, 100, 110 + 58, 100, "axis") + arrow(110, 100, 110 + 58 * Math.cos(line), 100 - 58 * Math.sin(line), "ck") + txt(110, 180, `holonomy angle = ${fmt(line, 4)} rad`, "sm", 'text-anchor="middle"');
      s += txt(220, 70, "∮ A·dl (line integral)", "sm") + txt(220, 88, fmt(line, 6), "lbl mono") + txt(220, 120, "∫∫ F dS (flux, Stokes)", "sm") + txt(220, 138, fmt(area, 6), "lbl mono");
      return { title: "CURVATURE AS HOLONOMY", sub: "F = dA", body: svg(400, 200, s, "holonomy") };
    },
    algebra: () => ({ title: "DICTIONARY", body: table(DATA.dictionaries.gauge.columns, DATA.dictionaries.gauge.rows.slice(0, 4)) + sceneLink("dictionaries", "full dictionary") }),
  },
  notes: () => `<p>At each point the gauge group U(1) is a circle of phases. The gauge field is the connection telling how to carry a phase to the neighbouring fibre; its failure to close around a loop is the curvature ${tex("F = dA")}. The holonomy angle computed as ${tex("\\oint A\\cdot dl")} equals the flux ${tex("\\int\\!\\!\\int F\\,dS")} (Stokes). This is the geometry that noncommutative geometry later rebuilds from operators.</p>`,
});

/* ---------- §10 Dirac equation ---------- */
scene({
  id: "dirac", track: "qft", title: "The Dirac equation", sections: [10],
  summary: "(iγ<sup>μ</sup>D<sub>μ</sub> − m)ψ = 0 with plane waves ψ = u(p)e<sup>−ip·x</sup>: momentum, spin, the positive- and negative-frequency branches, and minimal coupling to A<sub>μ</sub>. Spinors are drawn as component bars, labelled schematic.",
  refs: ["ps", "weinberg"],
  init: () => ({ p: 0.8, m: 1, spin: 0, A: 0 }),
  anim: ["field", "space"],
  controls: (c) => `${slider("p", "momentum p_z", -2, 2, 0.01, c.s.p, (v) => v.toFixed(2))} ${slider("m", "mass m", 0.1, 2, 0.01, c.s.m, (v) => v.toFixed(2))} ${seg("spin", [[0, "spin ↑"], [1, "spin ↓"]], c.s.spin)} ${slider("A", "eA_z (minimal coupling)", -1, 1, 0.01, c.s.A, (v) => v.toFixed(2))}`,
  panels: {
    diagram: (c) => {
      const m = c.s.m, ps = Q.linspace(-2.5, 2.5, 101);
      const pos = ps.map((p) => [p, Math.sqrt(p * p + m * m)]), neg = ps.map((p) => [p, -Math.sqrt(p * p + m * m)]);
      const shifted = ps.map((p) => [p, Math.sqrt((p - c.s.A) ** 2 + m * m)]);
      const E = Math.sqrt((c.s.p - c.s.A) ** 2 + m * m);
      return { title: "ENERGY BRANCHES", sub: "E = ±√(p² + m²)", body: lineChart({ W: 400, H: 230, xr: [-2.5, 2.5], yr: [-3, 3], series: [{ pts: pos, cls: "qft", label: "positive frequency u(p)" }, { pts: neg, cls: "aqft", label: "negative frequency v(p)" }, ...(c.s.A ? [{ pts: shifted, cls: "ck", label: "with eA_z", dash: "4 3" }] : [])], points: [{ x: c.s.p, y: E, cls: "fck", label: `E = ${fmt(E, 3)}` }], xlabel: "p_z", hlines: [{ y: 0 }] }) };
    },
    algebra: (c) => {
      const p = QED.onShell(c.s.m, [0, 0, c.s.p - c.s.A]);
      const u = QED.spinorU(p, c.s.m, c.s.spin);
      const res = QED.diracResidual(p, c.s.m, c.s.spin);
      let s = "";
      u.forEach((z, k) => { const mag = Math.hypot(z[0], z[1]); s += rect(40 + k * 80, 120 - 50 * mag, 40, 50 * mag, k < 2 ? "fqft" : "fck", `data-tip="u_${k + 1} = ${fmt(z[0], 4)} + ${fmt(z[1], 4)}i"`) + txt(60 + k * 80, 138, `u${["₁", "₂", "₃", "₄"][k]}`, "sm", 'text-anchor="middle"'); });
      s += txt(20, 18, "schematic: |components| of u(p, s) in the Dirac representation", "xs ink2") + txt(20, 160, `‖(p̸ − m)u‖ = ${res.toExponential(1)} · ū u = 2m = ${fmt(2 * c.s.m, 3)}`, "xs mono");
      return { title: "SPINOR u(p, s)", sub: "four complex numbers", body: svg(380, 170, s, "spinor components") };
    },
    field: (c) => {
      const p = QED.onShell(c.s.m, [0, 0, c.s.p - c.s.A]), E = p[0];
      const u = QED.spinorU(p, c.s.m, c.s.spin);
      let s = ln(20, 80, 380, 80, "axis");
      const pts1 = [], pts3 = [];
      for (let i = 0; i <= 120; i++) { const z = -3 + i * 0.05, ph = p[3] * z * 3 - E * c.t * 2; const c1 = LA.C.mul(u[0], LA.C.polar(1, ph)), c3 = LA.C.mul(u[2], LA.C.polar(1, ph)); pts1.push([20 + i * 3, 80 - 22 * c1[0]]); pts3.push([20 + i * 3, 80 - 22 * c3[0]]); }
      s += path(pathD(pts1), "qft", 'fill="none" stroke-width="2"') + path(pathD(pts3), "ck", 'fill="none" stroke-width="2"');
      s += txt(20, 150, "Re of u₁ e^{−ip·x} (blue) and u₃ e^{−ip·x} (orange) along z", "xs ink2");
      return { title: "PLANE WAVE", sub: "ψ = u(p)e^{−ip·x}", body: svg(400, 160, s, "plane wave") };
    },
    space: (c) => {
      const M = minkowski({ W: 400, H: 200, scale: 40, cone: false });
      const E = Math.sqrt((c.s.p - c.s.A) ** 2 + c.s.m ** 2), k = c.s.p - c.s.A;
      let s = M.s;
      for (let n = -8; n <= 8; n++) { const c0 = n * 0.8 + (c.t % 0.8); const pts = Q.linspace(-4.5, 4.5, 2).map((x) => M.P((k * x + c0) / E, x)); s += path(pathD(pts), "qft", 'fill="none" opacity="0.5"'); }
      return { title: "PHASE FRONTS", sub: "Et − p·x = const", body: svg(400, 200, s, "phase fronts"), foot: `Phase velocity E/p = ${fmt(E / (Math.abs(k) || 1e-9), 3)} (≥ 1); group velocity p/E = ${fmt(k / E, 3)} (< 1).` };
    },
  },
  notes: () => `<p>${formula("(i\\gamma^\\mu D_\\mu - m)\\psi = 0,\\qquad \\psi(x) = u(p)e^{-ip\\cdot x}")} The positive-frequency solutions ${tex("u(p)")} describe electrons; the negative-frequency branch, reinterpreted through ${tex("v(p)")}, describes positrons. Minimal coupling replaces ${tex("p \\to p - eA")}, which shifts the branch (dashed). The bars are component moduli in one basis, not arrows in space.</p>`,
});

/* ---------- §11 from classical to quantum field ---------- */
const STRING_SHAPE = (x0) => (x) => (x < x0 ? x / x0 : (1 - x) / (1 - x0)) * 0.6;
/* The first 12 Fourier coefficients of the string plucked at the chosen position. */
const pluckModes = (c) => QED.stringModes(STRING_SHAPE(c.s.pluck), 12);
scene({
  id: "modes", track: "qft", title: "From classical field to quantum field", sections: [11],
  summary: "A vibrating string, Fourier-expanded: each coefficient q<sub>k</sub> is an oscillator of frequency ω<sub>k</sub>. Quantize each one, q<sub>k</sub>, p<sub>k</sub> ⇝ a<sub>k</sub>, a<sub>k</sub><sup>†</sup>: the field becomes a quantum field.",
  refs: ["ps", "schwartz"],
  init: () => ({ stage: 0, pluck: 0.3 }),
  anim: ["field", "space"],
  controls: (c) => `${stepper("stage", ["FIELD", "INFINITELY MANY OSCILLATORS", "QUANTUM FIELD"], c.s.stage)} ${slider("pluck", "pluck position", 0.1, 0.9, 0.01, c.s.pluck, (v) => v.toFixed(2))}`,
  panels: {
    field: (c) => {
      const q = pluckModes(c);
      const y = (x, t) => q.reduce((s2, qk, i) => s2 + qk * Math.sin((i + 1) * PI * x) * Math.cos((i + 1) * PI * t * 0.5), 0);
      let s = ln(20, 90, 380, 90, "grid");
      s += path(pathD(Q.linspace(0, 1, 120).map((x) => [20 + 360 * x, 90 - 110 * y(x, c.t)])), "qft", 'fill="none" stroke-width="2.2"');
      if (c.s.stage >= 1) q.slice(0, 4).forEach((qk, i) => { s += path(pathD(Q.linspace(0, 1, 60).map((x) => [20 + 360 * x, 160 + i * 0 - 60 * qk * Math.sin((i + 1) * PI * x) * Math.cos((i + 1) * PI * c.t * 0.5)])), ["ck", "ncg", "aqft", "qft"][i], 'fill="none" opacity="0.7"'); });
      return { title: "STRING", sub: "φ(x) = ∑ q_k sin(kπx)", body: svg(400, 200, s, "vibrating string"), foot: c.s.stage >= 1 ? "Below: the first four normal modes, each oscillating at its own frequency." : "" };
    },
    diagram: (c) => {
      const q = pluckModes(c);
      return { title: "FOURIER COEFFICIENTS", sub: "computed", body: barChart({ W: 400, H: 190, items: q.map((v, i) => ({ label: `${i + 1}`, value: Math.abs(v), cls: i < 4 ? ["ck", "ncg", "aqft", "qft"][i] : "qft", tip: `q_${i + 1} = ${fmt(v, 4)}` })), xlabel: "mode k", ylabel: "|q_k|" }) };
    },
    algebra: (c) => {
      let s = "";
      for (let k = 0; k < 5; k++) {
        const w = k + 1, x = 30 + k * 72;
        for (let n = 0; n < 5; n++) { const y = 170 - (n + 0.5) * w * 6; if (y < 10) break; s += ln(x, y, x + 50, y, c.s.stage === 2 ? "qft" : "axis", 'stroke-width="1.6"'); }
        s += path(pathD(Q.linspace(-1, 1, 30).map((u) => [x + 25 + 25 * u, 170 - 0.5 * w * 6 * 0 - 60 * u * u])), "", 'fill="none" stroke="var(--rule)"');
        s += txt(x + 25, 186, `ω${"₁₂₃₄₅"[k]} = ${w}`, "xs mono ink2", 'text-anchor="middle"');
      }
      s += txt(20, 14, c.s.stage === 2 ? "quantized: levels (n + ½)ω_k, a_k|n⟩ = √n|n−1⟩" : "each mode is a harmonic oscillator (classical energy continuous)", "xs ink2");
      return { title: "OSCILLATORS", sub: c.s.stage === 2 ? "quantized" : "classical", body: svg(400, 195, s, "oscillator ladders") };
    },
    space: (c) => {
      const q = pluckModes(c);
      let s = "";
      for (let i = 0; i < 40; i++) for (let j = 0; j < 20; j++) { const x = i / 39, t = j * 0.15 + c.t; const v = q.reduce((s2, qk, k) => s2 + qk * Math.sin((k + 1) * PI * x) * Math.cos((k + 1) * PI * t * 0.5), 0); s += rect(20 + i * 9, 180 - j * 8.5, 9, 8.5, v > 0 ? "fqft" : "fck", `fill-opacity="${Math.min(1, Math.abs(v) * 3).toFixed(2)}"`); }
      return { title: "SPACETIME HISTORY", sub: "displacement over (x, t)", body: svg(400, 195, s + txt(20, 14, "a classical field history: one configuration", "xs ink2"), "string history") };
    },
  },
  notes: () => `<p>${formula("\\phi(x) = \\sum_k q_k\\,e^{ikx},\\qquad q_k,\\,p_k \\rightsquigarrow a_k,\\,a_k^\\dagger")} The coefficients are computed by projecting the plucked shape on the normal modes. Each obeys ${tex("\\ddot q_k = -\\omega_k^2 q_k")}; canonical quantization replaces every one by a quantum oscillator. FIELD ↓ Fourier decomposition ↓ INFINITELY MANY OSCILLATORS ↓ quantize each ↓ QUANTUM FIELD.</p>`,
});

/* ---------- §12 creation and annihilation ---------- */
scene({
  id: "ladder", track: "qft", title: "Creation and annihilation operators", sections: [12],
  summary: "A photon mode climbs its ladder with amplitude √(n+1); a fermion mode has only n = 0, 1, and a second creation gives zero: Pauli exclusion, computed.",
  refs: ["ps", "weinberg"],
  init: () => ({ n: 0, f: 0, msg: "" }),
  controls: (c) => `${actBtn("bcreate", "a† (add photon)")} ${actBtn("bannih", "a (remove photon)")} <span class="sep"></span> ${actBtn("fcreate", "c† (add electron)")} ${actBtn("fannih", "c (remove electron)")} ${actBtn("lreset", "reset")}`,
  actions: {
    bcreate: (c) => { const r = QED.createBoson(c.s.n); c.s.msg = `a†|${c.s.n}⟩ = √${c.s.n + 1}|${r.n}⟩ = ${fmt(r.amp, 4)}|${r.n}⟩`; c.s.n = Math.min(6, r.n); },
    bannih: (c) => { c.s.msg = c.s.n ? `a|${c.s.n}⟩ = √${c.s.n}|${c.s.n - 1}⟩` : "a|0⟩ = 0: the vacuum is annihilated"; c.s.n = Math.max(0, c.s.n - 1); },
    fcreate: (c) => { const r = QED.createFermion(c.s.f); c.s.msg = r.amp ? "c†|0⟩ = |1⟩" : "c†|1⟩ = 0: Pauli exclusion — a mode holds at most one fermion"; if (r.amp) c.s.f = 1; },
    fannih: (c) => { c.s.msg = c.s.f ? "c|1⟩ = |0⟩" : "c|0⟩ = 0"; c.s.f = 0; },
    lreset: (c) => { c.s.n = 0; c.s.f = 0; c.s.msg = ""; },
  },
  panels: {
    field: (c) => {
      let s = "";
      for (let n = 0; n <= 6; n++) { const y = 190 - n * 26; s += ln(60, y, 200, y, n === c.s.n ? "qft" : "axis", `stroke-width="${n === c.s.n ? 3 : 1}"`) + txt(40, y + 4, `|${n}⟩`, "sm mono", 'text-anchor="end"'); if (n < 6) s += arrow(220, y, 220, y - 24, "ck", "", 4) + txt(230, y - 9, `√${n + 1} = ${fmt(Math.sqrt(n + 1), 3)}`, "xs mono ink2"); }
      for (let k = 0; k < c.s.n; k++) s += circ(80 + k * 18, 190 - c.s.n * 26 - 10, 5, "fqft");
      return { title: "PHOTON MODE", sub: "bosonic ladder", body: svg(360, 210, s, "photon ladder"), foot: "vacuum + photon → one-photon state + photon → two-photon state …" };
    },
    diagram: (c) => {
      let s = ln(60, 150, 200, 150, c.s.f === 0 ? "qft" : "axis", `stroke-width="${c.s.f === 0 ? 3 : 1}"`) + ln(60, 80, 200, 80, c.s.f === 1 ? "qft" : "axis", `stroke-width="${c.s.f === 1 ? 3 : 1}"`) + txt(40, 154, "|0⟩", "sm mono", 'text-anchor="end"') + txt(40, 84, "|1⟩", "sm mono", 'text-anchor="end"');
      s += ln(60, 20, 200, 20, "bad", 'stroke-dasharray="4 4"') + txt(40, 24, "|2⟩", "sm mono mut", 'text-anchor="end"') + txt(210, 24, "forbidden: (c†)² = 0", "xs", 'style="fill:var(--bad)"');
      if (c.s.f) s += circ(130, 70, 6, "fck");
      return { title: "ELECTRON MODE", sub: "n = 0, 1 only", body: svg(360, 170, s, "fermion mode") };
    },
    algebra: () => {
      const { a, adag } = QED.bosonLadder(4), cm = LA.comm(a, adag), { c: cf, cdag } = QED.fermionLadder();
      const ac = LA.add(LA.mul(cf, cdag), LA.mul(cdag, cf));
      return { title: "THE OPERATORS AS MATRICES", sub: "truncated at n = 4", body: svg(400, 150, heatmap(LA.toArray(adag), { x: 10, y: 20, size: 18, cls: "qft", name: "a†", title: "a† (5×5)" }) + heatmap(LA.toArray(cm), { x: 130, y: 20, size: 18, cls: "ck", name: "[a, a†]", title: "[a, a†]" }) + heatmap(LA.toArray(ac), { x: 260, y: 20, size: 30, cls: "aqft", name: "{c, c†}", title: "{c, c†}" }) + txt(10, 140, "[a, a†] = 1 except the truncation corner; {c, c†} = 1 and c² = 0 exactly", "xs ink2"), "ladder matrices") };
    },
    space: (c) => ({ title: "WHAT HAPPENED", sub: "", body: `<p class="formula">${esc(c.s.msg || "Press a button.")}</p><p class="small">${tex("a_k^\\dagger|n_k\\rangle = \\sqrt{n_k+1}\\,|n_k+1\\rangle")}; fermion modes obey ${tex("\\{c, c^\\dagger\\} = 1")}, ${tex("c^2 = 0")}.</p>` }),
  },
  notes: () => `<p>Bosonic creation adds a quantum and multiplies by ${tex("\\sqrt{n+1}")}, which is why stimulated emission is enhanced. Fermionic operators anticommute, so the same mode cannot be filled twice: the second ${tex("c^\\dagger")} returns the zero vector, not a state.</p>`,
});

/* ---------- §13 Fock space ---------- */
scene({
  id: "fock", track: "qft", title: "Fock-space visualizer", sections: [13],
  summary: "Sectors with 0, 1, 2, 3 particles. Switch on a toy interaction and watch amplitude move between the one-photon sector and the electron–positron sector.",
  refs: ["ps", "weinberg"],
  init: () => ({ g: 0.6, K: 3 }),
  anim: ["field"],
  controls: (c) => `${slider("g", "toy coupling", 0, 1.5, 0.01, c.s.g, (v) => v.toFixed(2))} ${slider("K", "modes per species", 1, 6, 1, c.s.K, (v) => String(v))}`,
  panels: {
    field: (c) => {
      // toy two-sector mixing: |γ⟩ ↔ |e⁻e⁺⟩ with matrix element g (schematic)
      const amp1 = Math.cos(c.s.g * c.t), amp2 = Math.sin(c.s.g * c.t);
      const sectors = [["|0⟩", 0, 0], ["e⁻", 1, 0], ["e⁺", 1, 0], ["γ", 1, amp1 * amp1], ["e⁻e⁺", 2, amp2 * amp2], ["e⁻γ", 2, 0], ["γγ", 2, 0], ["e⁻e⁺γ", 3, 0]];
      let s = "";
      sectors.forEach(([lab, n, p], i) => { const x = 30 + i * 46, y = 30 + n * 50; s += rect(x - 18, y - 12, 36, 24, p > 0.01 ? "bgqft" : "", `stroke="var(--axis)" rx="5"`) + txt(x, y + 4, lab, "xs mono", 'text-anchor="middle"') + rect(x - 18, 200 - 50 * p, 36, 50 * p, "fqft", `data-tip="probability ${fmt(p, 3)}"`); });
      s += txt(12, 222, "bars: probability in each sector (toy two-level mixing, schematic)", "xs ink2");
      return { title: "SECTORS", sub: "0, 1, 2, 3 particles", body: svg(400, 230, s, "Fock sectors") };
    },
    diagram: () => ({ title: "WHAT MOVES THE AMPLITUDE", sub: "the QED vertex", body: svg(400, 200, feynman(VERTEX_GRAPH, [40, 10, 320, 180]) + txt(10, 196, "γ → e⁻e⁺ is the same vertex read with a different time ordering", "xs ink2"), "vertex") }),
    algebra: (c) => ({ title: "HOW BIG IS EACH SECTOR?", sub: `${c.s.K} modes per species`, body: table(["particles N", "states (e⁻, e⁺, γ)"], [0, 1, 2, 3, 4].map((N) => [String(N), String(QED.fockSectorCount(N, c.s.K))]), [1]) + `<p class="small">Fermions: at most one per mode; photons: any number. The count is computed from the generating function (1 + x)<sup>2K</sup>/(1 − x)<sup>K</sup>.</p>` }),
    space: () => ({ title: "TREE OF SECTORS", body: `<pre class="small" style="font-family:var(--mono)">|0⟩\n│\n├─ one particle\n│    ├ e⁻\n│    ├ e⁺\n│    └ γ\n├─ two particles\n├─ three particles\n└─ …</pre>` }),
  },
  notes: () => `<p>The Fock space is the direct sum ${tex("\\mathcal{F} = \\bigoplus_N \\mathcal{H}_N")} of particle-number sectors. ${tex("H_{\\rm int} = e\\int\\bar\\psi\\gamma^\\mu\\psi A_\\mu")} has nonzero matrix elements only between sectors that differ by the particles one vertex creates or destroys. The animation is a two-level toy with one matrix element g, labelled schematic: it shows amplitude flowing, not a computed QED rate.</p>`,
});

/* ---------- §14–15 vacuum and correlations ---------- */
scene({
  id: "vacuum", track: "qft", title: "Vacuum fluctuations and correlations", sections: [14, 15],
  summary: "The vacuum is not emptiness: every mode sits in its oscillator ground state, a<sub>k</sub>|0⟩ = 0, yet ⟨0|φ(x)φ(y)|0⟩ ≠ 0. Drag two probes and watch the correlation fall with distance.",
  refs: ["ps", "witten2018"],
  init: () => ({ x: -0.5, y: 0.7, m: 1 }),
  controls: (c) => slider("m", "mass m", 0.05, 3, 0.01, c.s.m, (v) => v.toFixed(2)),
  panels: {
    field: (c) => {
      const modes = QED.ringModes(24, c.s.m).slice(0, 12);
      let s = "";
      const wmax = Math.max(...modes.map((md) => Math.sqrt(md.fluct)));
      modes.forEach((md, i) => { const x0 = 20 + i * 31, w = Math.sqrt(md.fluct) / wmax; s += path(pathD(Q.linspace(-1, 1, 40).map((u) => [x0 + 14 + 14 * u, 150 - 90 * Math.exp(-(u * u) / (2 * (0.42 * w) ** 2))])), "qft", 'fill="var(--qft-bg)" stroke-width="1.4"') + txt(x0 + 14, 166, `k${i}`, "xs mono mut", 'text-anchor="middle"'); });
      s += txt(16, 18, "ground-state wavefunctions |ψ₀(q_k)|², width ∝ 1/√ω_k (spectral, not particles appearing)", "xs ink2");
      return { title: "MODE GROUND STATES", sub: "a_k|0⟩ = 0", body: svg(400, 175, s, "ground states") };
    },
    space: (c) => {
      let s = ln(20, 80, 380, 80, "axis");
      const X = (x) => 200 + x * 80;
      s += circ(X(c.s.x), 80, 8, "fck", 'data-drag="px" data-tip="probe x"') + txt(X(c.s.x), 64, "x", "lbl serif", 'text-anchor="middle"');
      s += circ(X(c.s.y), 80, 8, "faqft", 'data-drag="py" data-tip="probe y"') + txt(X(c.s.y), 64, "y", "lbl serif", 'text-anchor="middle"');
      s += ln(X(c.s.x), 100, X(c.s.y), 100, "ck", 'stroke-width="2"') + txt((X(c.s.x) + X(c.s.y)) / 2, 116, `r = ${fmt(Math.abs(c.s.x - c.s.y), 3)}`, "sm", 'text-anchor="middle"');
      return { title: "TWO PROBES", sub: "equal time, drag them", body: svg(400, 130, s, "probes") };
    },
    diagram: (c) => {
      const r = Math.max(0.02, Math.abs(c.s.x - c.s.y));
      const rs = Q.linspace(0.05, 4, 80);
      const pts = rs.map((x) => [x, Math.log10(QED.scalarCorrelator(x, c.s.m))]);
      const pts0 = rs.map((x) => [x, Math.log10(QED.scalarCorrelator(x, 0))]);
      return { title: "⟨0|φ(x)φ(y)|0⟩", sub: "free scalar, 3+1, log scale", body: lineChart({ W: 400, H: 220, xr: [0, 4], yr: [-6, 2], series: [{ pts, cls: "qft", label: `mass ${c.s.m.toFixed(2)}`, tip: (x, y) => `r = ${fmt(x, 3)}: ${fmt(Math.pow(10, y), 4)}` }, { pts: pts0, cls: "axis", label: "massless 1/4π²r²", dash: "4 3" }], points: [{ x: r, y: Math.log10(QED.scalarCorrelator(r, c.s.m)), cls: "fck" }], xlabel: "distance r", yfmt: (v) => `10${Q.sup(v)}` }), foot: `At r = ${fmt(r, 3)}: ${fmt(QED.scalarCorrelator(r, c.s.m), 4)} = m K₁(mr)/(4π²r); the correlation length is 1/m.` };
    },
    algebra: (c) => {
      const L = 24, rr = Math.round(Math.abs(c.s.x - c.s.y) * 4);
      const modes = QED.ringModes(L, c.s.m);
      const items = modes.slice(0, 13).map((md, i) => ({ label: `${i}`, value: (Math.cos(md.k * rr) * md.fluct) / L, cls: "qft" }));
      return { title: "WHO CONTRIBUTES", sub: `lattice ring L = ${L}, separation ${rr} sites`, body: barChart({ W: 400, H: 180, items, xlabel: "mode k", ylabel: "cos(kr)/(2Lω_k)" }), foot: `Sum over all modes: ${fmt(QED.ringCorrelator(L, c.s.m, rr), 4)}. Every mode is in its ground state, and still the sum is nonzero.` };
    },
  },
  drag: { px: (c, p) => { c.s.x = clamp((p.x - 200) / 80, -2.2, 2.2); }, py: (c, p) => { c.s.y = clamp((p.x - 200) / 80, -2.2, 2.2); } },
  notes: () => `<p>${tex("a_k|0\\rangle = 0")} for every k, but ${tex("\\langle 0|\\phi(x)\\phi(y)|0\\rangle = \\sum_k \\cos k(x-y)/(2L\\omega_k) \\neq 0")}: each oscillator has zero-point spread ${tex("\\langle q_k^2\\rangle = 1/2\\omega_k")}, and the modes add coherently at nearby points. In the continuum the equal-time correlator of a free scalar is ${tex("mK_1(mr)/(4\\pi^2 r)")}, falling like ${tex("e^{-mr}")} beyond the correlation length 1/m. The time-ordered version ${tex("\\langle 0|T\\{\\phi(x)\\phi(y)\\}|0\\rangle")} is the propagator.</p>${sceneLink("propagators", "next: the propagator")}`,
});

/* ---------- §16–18 propagators, virtual versus real ---------- */
scene({
  id: "propagators", track: "qft", title: "Propagators, on and off shell", sections: [16, 17, 18],
  summary: "D<sub>μν</sub>(q) = −ig<sub>μν</sub>/(q² + iε) and S<sub>F</sub>(p) = i(p̸ + m)/(p² − m² + iε). Drag the momentum on the energy–momentum plane: the denominator vanishes on the mass shell p² = m², where external lines must sit; internal lines need not.",
  refs: ["ps", "schwartz"],
  init: () => ({ which: "electron", E: 1.6, k: 0.9 }),
  graphs: true,
  controls: (c) => seg("which", [["electron", "electron S_F(p)"], ["photon", "photon D_μν(q)"]], c.s.which),
  panels: {
    field: (c) => {
      const m = c.s.which === "electron" ? 1 : 0, W = 400, H = 260, sc = 60, X = (k) => 40 + k * sc, Y = (E) => 230 - E * sc;
      let s = "";
      for (let i = 0; i < 56; i++) for (let j = 0; j < 25; j++) { const k = i * 0.1, E = j * 0.15; const d = Math.abs(E * E - k * k - m * m); s += rect(X(k), Y(E) - 9, 6, 9, "fck", `fill-opacity="${Math.max(0, 0.5 - 0.25 * Math.log10(1e-3 + d)).toFixed(2) * 0.6}"`); }
      s += path(pathD(Q.linspace(0, 5.5, 60).map((k) => [X(k), Y(Math.sqrt(k * k + m * m))])), "qft", 'fill="none" stroke-width="2.4" data-link="shell"') + txt(X(3.2), Y(Math.sqrt(3.2 * 3.2 + m * m)) - 8, m ? "mass shell p² = m²" : "light cone q² = 0", "sm", 'data-link="shell"');
      s += arrow(X(0), Y(0), X(5.6), Y(0), "axis") + txt(X(5.5), Y(0) + 14, "|p|", "sm serif") + arrow(X(0), Y(0), X(0), Y(3.7), "axis") + txt(X(0) + 6, Y(3.6), "p⁰", "sm serif");
      s += circ(X(c.s.k), Y(c.s.E), 7, "faqft", 'data-drag="p" data-tip="drag the momentum"');
      return { title: "ENERGY-SHELL DIAGRAM", sub: "shade ∝ |1/(p² − m²)|", body: svg(W, H, s, "energy shell") };
    },
    diagram: (c) => {
      const m = c.s.which === "electron" ? 1 : 0, p2 = c.s.E ** 2 - c.s.k ** 2, den = p2 - m * m;
      const on = Math.abs(den) < 0.05;
      const g = LINE_GRAPH(c.s.which === "electron" ? "e" : "g");
      const factor = c.s.which === "electron" ? `S_F(p) = i(p̸ + m)/(p² − m² + iε) = i(p̸ + m)/(${fmt(den, 4)})` : `D_μν(q) = −ig_μν/(q² + iε) = −ig_μν/(${fmt(p2, 4)})`;
      return { title: "SOURCE → TARGET", sub: "click the line", body: svg(400, 160, feynman(g, [20, 0, 360, 120], { link: () => "propagator", act: "showfactor", tip: () => "click: show the propagator factor" }) + txt(200, 140, c.s.which === "electron" ? "momentum p" : "momentum q", "sm", 'text-anchor="middle" data-link="propagator"'), "propagator line") + (c.s.shown ? `<div class="formula" data-link="propagator" style="font-size:1.1rem;white-space:normal">${esc(factor)}</div>` : '<p class="small muted">Click the line to display its propagator factor.</p>'), foot: `p² = ${fmt(p2, 4)}, p² − m² = ${fmt(den, 4)}: ${on ? "<b>on shell</b> — allowed for an external (asymptotic) particle" : "<b>off shell</b> — allowed only for an internal line inside an amplitude"}` };
    },
    algebra: (c) => {
      if (c.s.which === "photon") { const q2 = c.s.E ** 2 - c.s.k ** 2; return { title: "PHOTON FACTOR", sub: "−i g_μν / q²", body: kv([["q²", fmt(q2, 4)], ["−i/q²", Math.abs(q2) < 1e-9 ? "pole" : `${fmt(-1 / q2, 4)} i`], ["g_μν", "diag(1, −1, −1, −1)"]]) + `<p class="small">In a general covariant gauge D_μν = −i[g_μν − (1 − ξ)q_μq_ν/q²]/q²; the q_μq_ν part drops out of physical amplitudes (Ward identity).</p>` }; }
      const S = QED.electronPropagator([c.s.E, 0, 0, c.s.k], 1);
      if (!S.matrix) return { title: "S_F(p)", body: "<p class='small'>On the mass shell the propagator has a pole: this is where it describes a real particle.</p>" };
      return { title: "S_F(p) AS A 4×4 MATRIX", sub: "computed", body: svg(220, 150, heatmap(LA.toArray(S.matrix), { x: 10, y: 20, size: 30, cls: "aqft", name: "S_F" }) + txt(10, 12, `|entries| at p² − m² = ${fmt(S.den, 3)}`, "xs ink2"), "propagator matrix") };
    },
    space: () => ({ title: "EXTERNAL VS INTERNAL", sub: "what a line means", body: table(["line", "meaning", "on shell?"], [["external", "asymptotic particle state", "yes: p² = m²"], ["internal", "propagator inside a perturbative amplitude", "no constraint"]]) + `<p class="small">Energy and momentum are conserved at every vertex; an internal line is not a particle that briefly exists or borrows energy. It is a factor of the amplitude.</p>` }),
  },
  actions: { showfactor: (c) => { c.s.shown = !c.s.shown; } },
  drag: { p: (c, p) => { c.s.k = clamp((p.x - 40) / 60, 0, 5.5); c.s.E = clamp((230 - p.y) / 60, 0, 3.7); } },
  notes: () => `<p>${formula("S_F(p) = \\frac{i(\\not{p} + m)}{p^2 - m^2 + i\\epsilon},\\qquad D_{\\mu\\nu}(q) = \\frac{-ig_{\\mu\\nu}}{q^2 + i\\epsilon}")} The denominators vanish exactly on the mass shell, drawn in blue. An external line represents an asymptotic particle and must lie on the shell; an internal line is integrated over all four-momenta, almost all of them off the shell.</p>`,
});

/* ---------- §19–20 path integral and stationary phase ---------- */
scene({
  id: "pathint", track: "qft", title: "Path integral and stationary phase", sections: [19, 20],
  summary: "Z = ∫𝒟φ e<sup>iS/ħ</sup>: each configuration contributes a unit phasor. As ħ shrinks, wildly varying phases cancel and only configurations near δS = 0 survive. A complex interference sum, never a probability integral.",
  refs: ["feynman1949", "ps"],
  init: () => ({ logh: -1 }),
  controls: (c) => slider("logh", "ħ (large → small)", -2.3, 0.3, 0.01, c.s.logh, (v) => `ħ = ${fmt(Math.pow(10, v), 3)}`, 'style="direction:rtl"'),
  panels: {
    space: (c) => {
      const r = QED.pathFamily({ hbar: Math.pow(10, c.s.logh), n: 41, amax: 1.2 });
      let s = "";
      r.paths.forEach((p) => { const pts = Q.linspace(0, 1, 30).map((t) => [30 + 340 * t, 190 - 140 * (t + p.a * Math.sin(PI * t) * 0.5)]); s += path(pathD(pts), "", `fill="none" stroke="${phaseColor(p.phase)}" stroke-width="1.2" opacity="0.8" data-tip="a = ${fmt(p.a, 3)}, S/ħ = ${fmt(p.phase, 4)}"`); });
      s += circ(30, 190, 4, "vtx") + circ(370, 50, 4, "vtx") + txt(30, 205, "x(0) = 0", "xs mono") + txt(370, 40, "x(T) = 1", "xs mono", 'text-anchor="end"');
      return { title: "CONFIGURATION PATHS", sub: "colour = phase S/ħ", body: svg(400, 215, s, "paths"), foot: "Each curve is one configuration of the field (here a particle path), not a Feynman diagram." };
    },
    field: (c) => {
      const r = QED.pathFamily({ hbar: Math.pow(10, c.s.logh), n: 241, amax: 1.2 });
      return { title: "PHASE ALONG THE FAMILY", sub: "cos(S(a)/ħ)", body: lineChart({ W: 400, H: 190, xr: [-1.2, 1.2], yr: [-1.1, 1.1], series: [{ pts: r.paths.map((p) => [p.a, Math.cos(p.phase)]), cls: "qft", label: "Re e^{iS/ħ}" }], bands: [{ x0: -r.width, x1: r.width, cls: "bgck", label: "stationary region" }], xlabel: "deformation a (a = 0 is the classical path)" }) };
    },
    diagram: (c) => {
      const r = QED.pathFamily({ hbar: Math.pow(10, c.s.logh), n: 241, amax: 1.2 });
      const all = r.paths.map((p) => p.partial), sc = 140 / Math.max(0.05, ...all.map((z) => Math.hypot(z[0], z[1])), Math.hypot(...r.exact));
      let s = "", prev = [200, 110];
      r.paths.forEach((p) => { const q = [200 + p.partial[0] * sc, 110 - p.partial[1] * sc]; s += ln(prev[0], prev[1], q[0], q[1], "", `stroke="${phaseColor(p.phase)}" stroke-width="1.6"`); prev = q; });
      s += arrow(200, 110, prev[0], prev[1], "ck", 'stroke-width="2"') + arrow(200, 110, 200 + r.exact[0] * sc, 110 - r.exact[1] * sc, "aqft", 'stroke-dasharray="4 3"');
      s += txt(10, 214, "phasors added head to tail: the curling ends cancel, the middle survives", "xs ink2");
      return { title: "COMPLEX INTERFERENCE", sub: "running sum ∑ e^{iS/ħ}Δa", body: svg(400, 220, s, "phasor sum"), foot: `sum ${fmt(Math.hypot(...r.total), 4)}; whole-line Fresnel value ${fmt(Math.hypot(...r.exact), 4)} (violet).` };
    },
    algebra: (c) => {
      const r = QED.pathFamily({ hbar: Math.pow(10, c.s.logh), n: 41, amax: 1.2 });
      return { title: "δS = 0 EMERGES", sub: "", body: kv([["ħ", fmt(Math.pow(10, c.s.logh), 3)], ["width of surviving region", fmt(r.width, 3)], ["S(a)", "S_cl + mπ²a²/(4T)"], ["stationary point", "a = 0, the classical path"]]) + `<p class="small">The width √(4Tħ/(mπ²)) shrinks to zero with ħ: the classical solution of δS = 0 is what survives.</p>` };
    },
  },
  notes: () => `<p>${formula("Z = \\int\\mathcal{D}\\phi\\; e^{iS[\\phi]/\\hbar}")} Here the infinite-dimensional integral is cut down to a one-parameter family ${tex("x_a(t) = x_{\\rm cl}(t) + a\\sin(\\pi t/T)")} of a free particle, for which ${tex("S(a) = S_{\\rm cl} + m\\pi^2a^2/4T")} exactly. Many configurations ↓ phases ↓ complex interference ↓ quantum amplitude. The weights are complex numbers of modulus one, not probabilities.</p>`,
});

/* ---------- §21–22 generating functional and Wick contractions ---------- */
scene({
  id: "genfunc", track: "qft", title: "Generating functional and Wick contractions", sections: [21, 22],
  summary: "Z[J] with sources: each δ/δJ inserts a field. For a Gaussian theory the 2n-point function is a sum over pairings, each pairing a set of propagator lines: Wick's theorem as combinatorics, computed on a lattice.",
  refs: ["wick1950", "ps"],
  init: () => ({ mode: "wick", n: 4, pts: [1, 3, 6, 9, 12, 14], m: 0.6 }),
  controls: (c) => `${seg("mode", [["insert", "insert fields"], ["wick", "Wick pairings"]], c.s.mode)} ${seg("n", [[2, "2-point"], [4, "4-point"], [6, "6-point"]], c.s.n)} ${slider("m", "mass", 0.1, 2, 0.01, c.s.m, (v) => v.toFixed(2))}`,
  panels: {
    space: (c) => {
      const L = 16, pts = c.s.pts.slice(0, c.s.n);
      let s = circ(200, 110, 80, "", 'fill="none" stroke="var(--axis)"');
      for (let i = 0; i < L; i++) { const th = (2 * PI * i) / L; s += circ(200 + 80 * Math.cos(th), 110 + 80 * Math.sin(th), 3, "ext"); }
      pts.forEach((p, k) => { const th = (2 * PI * p) / L; s += circ(200 + 80 * Math.cos(th), 110 + 80 * Math.sin(th), 7, "fck", `data-link="pt${k}"`) + txt(200 + 98 * Math.cos(th), 114 + 98 * Math.sin(th), `φ${k + 1}`, "sm", 'text-anchor="middle"'); });
      return { title: "INSERTION POINTS", sub: "Euclidean lattice ring, L = 16", body: svg(400, 220, s, "insertion points") };
    },
    field: (c) => {
      const Gm = QED.latticePropagator(16, c.s.m);
      return { title: "PROPAGATOR G = K⁻¹", sub: "K = −Δ + m²", body: svg(320, 320, heatmap(Gm, { x: 10, y: 10, size: 18, cls: "qft", name: "G" }), "propagator matrix") };
    },
    diagram: (c) => {
      const L = 16, pts = c.s.pts.slice(0, c.s.n), Gm = QED.latticePropagator(L, c.s.m);
      if (c.s.mode === "insert") {
        const steps = ["Z[J] = e^{½J·G·J}", "δZ/δJ_1 = (G J)_1 Z", "δ²Z/δJ_1δJ_2 = (G_12 + …) Z", "set J = 0: ⟨φ₁φ₂⟩ = G_12"];
        return { title: "DIFFERENTIATE Z[J]", sub: "each δ/δJ inserts a field", body: `<ol class="small">${steps.map((t) => `<li>${supify(esc(t))}</li>`).join("")}</ol><p class="small">vacuum functional ↓ differentiate ↓ one insertion ↓ two insertions ↓ correlation function = ${fmt(Gm[pts[0]][pts[1]], 5)}</p>` };
      }
      const w = QED.wickMoment(pts, Gm);
      const cols = Math.min(w.terms.length, 5), cw = 400 / cols, rows = Math.ceil(w.terms.length / cols), rh = 76;
      let s = "";
      w.terms.forEach((t, i) => {
        const cx = (i % cols) * cw + cw / 2, cy = Math.floor(i / cols) * rh + 36, R = Math.min(26, cw / 3);
        const P = (k) => { const th = (2 * PI * pts[k]) / L; return [cx + R * Math.cos(th), cy + R * Math.sin(th)]; };
        s += circ(cx, cy, R, "", 'fill="none" stroke="var(--rule)"');
        t.pairs.forEach(([a, b]) => { const pa = P(a), pb = P(b); s += path(`M${r1(pa[0])} ${r1(pa[1])}Q${cx} ${cy} ${r1(pb[0])} ${r1(pb[1])}`, "qft", 'fill="none" stroke-width="1.6"'); });
        pts.forEach((_, k) => { const p = P(k); s += circ(p[0], p[1], 2.6, "fck"); });
        s += txt(cx, cy + R + 12, fmt(t.value, 3), "xs mono ink2", `text-anchor="middle" data-tip="${t.pairs.map(([a, b]) => `G${a + 1}${b + 1}`).join("·")}"`);
      });
      return { title: "PAIRINGS → DIAGRAMS", sub: `${w.terms.length} = (${c.s.n} − 1)!!`, body: svg(400, rows * rh + 10, s, "Wick pairings"), foot: `Sum of the ${w.terms.length} products = ${fmt(w.total, 6)} = ⟨${pts.map((_, k) => `φ${k + 1}`).join("")}⟩.` };
    },
    algebra: (c) => {
      const L = 16, pts = c.s.pts.slice(0, c.s.n), Gm = QED.latticePropagator(L, c.s.m);
      const w = QED.wickMoment(pts, Gm);
      return { title: "TERMS", sub: "each pairing is a product of propagators", body: table(["pairing", "value"], w.terms.slice(0, 15).map((t) => [t.pairs.map(([a, b]) => `(${a + 1}${b + 1})`).join(""), fmt(t.value, 5)]), [1]) };
    },
  },
  notes: () => `<p>${formula("\\langle T\\phi_1\\phi_2\\phi_3\\phi_4\\rangle = G_{12}G_{34} + G_{13}G_{24} + G_{14}G_{23}")} For a free (Gaussian) theory every correlation function is the sum over the ${tex("(2n-1)!!")} ways to pair the fields, each pairing a product of propagators. Drawing each pair as a line gives the diagrams: Wick's theorem is the bridge from path integrals to Feynman graphs.</p>`,
});

/* ---------- §23–26 Feynman rules, tree-level eμ scattering ---------- */
const EMU_LINK = { p1: "eline", p3: "eline", p2: "muline", p4: "muline", q: "photon" };
scene({
  id: "tree", track: "qft", title: "Tree-level e⁻μ⁻ → e⁻μ⁻", sections: [23, 24, 25, 26],
  summary: "One-photon exchange between an electron and a muon (no identical-particle complications). The diagram and the formula are linked both ways: hover a factor to light up its piece of the graph. Drag the outgoing momenta: when momentum is not conserved at a vertex the assignment turns red.",
  refs: ["ps", "halzenmartin"],
  graphs: true,
  init: () => ({ sqrtS: 300, theta: 1.0, p3: null, p4: null, rules: { vertex: true, photon: true, spinors: true } }),
  controls: (c) => `${slider("sqrtS", "√s (MeV)", 120, 1000, 1, c.s.sqrtS, (v) => `${v} MeV`)} ${slider("theta", "scattering angle θ", 0.05, 3.1, 0.01, c.s.theta, (v) => `${(v * 180 / PI).toFixed(0)}°`)} ${actBtn("resetp", "conserve momentum again")}`,
  actions: { resetp: (c) => { c.s.p3 = null; c.s.p4 = null; }, rule: (c, arg) => { c.s.rules[arg] = !c.s.rules[arg]; } },
  onSet: (c, key) => { if (key === "theta" || key === "sqrtS") { c.s.p3 = null; c.s.p4 = null; } },
  panels: {
    diagram: (c) => {
      const g = GR.byId("tree_emu");
      return { title: "THE DIAGRAM", sub: "hover a line", body: svg(400, 240, feynman(g, [10, 10, 380, 220], { link: (e) => EMU_LINK[e.id], vlink: () => "vertex", labels: { p1: "p₁", p3: "p₃", p2: "p₂", p4: "p₄", q: "q = p₁ − p₃" }, tip: (e) => ({ p1: "incoming electron u(p₁)", p3: "outgoing electron ū(p₃)", p2: "incoming muon u(p₂)", p4: "outgoing muon ū(p₄)", q: "internal photon: propagator D_μν(q)" }[e.id]), vtip: () => "vertex −ieγ^μ" }), "e mu scattering"), foot: "A term in the perturbative expansion of the S-matrix, not a picture of what happens in spacetime." };
    },
    algebra: (c) => {
      const r = ENG.treeAmplitude({ sqrtS: c.s.sqrtS, theta: c.s.theta });
      const f = `\\link{vertex}{(-ie)^2}\\,\\link{eline}{[\\bar u(p_3)\\gamma^\\mu u(p_1)]}\\,\\link{photon}{D_{\\mu\\nu}(q)}\\,\\link{muline}{[\\bar u(p_4)\\gamma^\\nu u(p_2)]}`;
      return { title: "DIAGRAM → FORMULA", sub: "bidirectional links", body: `<div class="formula" style="font-size:1.05rem">${tex(`\\mathcal{M} = ${f}`)}</div>${kv([["t = q²", `${fmt(r.kin.t, 5)} MeV²`], ["¼∑|𝓜|² (spin sum)", fmt(r.amp.avg, 6)], ["trace formula", fmt(r.closed, 6)], ["dσ/dΩ (CM)", `${fmt(r.dsdo, 4)} MeV⁻² = ${fmt(r.dsdo * (Q.CONST.hbarc.value ** 2) * 1e4, 4)} μb/sr`]])}<p class="small">The 16 spin amplitudes are computed from explicit spinors and γ matrices; their average agrees with the trace formula to ${r.relErr.toExponential(0)}.</p>` };
    },
    field: (c) => {
      const r = ENG.treeAmplitude({ sqrtS: c.s.sqrtS, theta: c.s.theta });
      const P = r.kin.pAbs, sc = 120 / P, X = (z) => 200 + z * sc, Y = (x) => 120 - x * sc;
      const p3 = c.s.p3 || [r.kin.p3[3], r.kin.p3[1]], p4 = c.s.p4 || [r.kin.p4[3], r.kin.p4[1]];
      const q = [P - p3[0], 0 - p3[1]]; // spatial q = p1 − p3 (z, x)
      const res = [-P + q[0] - p4[0], q[1] - p4[1]]; // p2 + q − p4
      const Ein = Math.hypot(P, Q.CONST.me.value) + Math.hypot(P, Q.CONST.mmu.value);
      const Eout = Math.hypot(...p3, Q.CONST.me.value) + Math.hypot(...p4, Q.CONST.mmu.value);
      const bad = Math.hypot(...res) > 1e-6 * P || Math.abs(Ein - Eout) > 1e-6 * Ein;
      let s = circ(X(0), Y(0), P * sc, "", 'fill="none" stroke="var(--rule)" stroke-dasharray="3 3"');
      s += arrow(X(-P), Y(0), X(0), Y(0), "fermion", 'data-link="eline"') + txt(X(-P), Y(0) - 6, "p₁", "sm serif");
      s += arrow(X(P), Y(0), X(0), Y(0), "fermion-mu", 'data-link="muline"') + txt(X(P) - 10, Y(0) + 14, "p₂", "sm serif");
      s += arrow(X(0), Y(0), X(p3[0]), Y(p3[1]), "fermion", 'data-link="eline"') + circ(X(p3[0]), Y(p3[1]), 7, "fck", 'data-drag="p3" data-tip="drag p₃"') + txt(X(p3[0]) + 8, Y(p3[1]) - 8, "p₃", "sm serif");
      s += arrow(X(0), Y(0), X(p4[0]), Y(p4[1]), "fermion-mu", 'data-link="muline"') + circ(X(p4[0]), Y(p4[1]), 7, "faqft", 'data-drag="p4" data-tip="drag p₄"') + txt(X(p4[0]) + 8, Y(p4[1]) + 14, "p₄", "sm serif");
      s += arrow(X(0), Y(0), X(q[0]), Y(q[1]), bad ? "bad" : "qft", 'data-link="photon" stroke-dasharray="5 3"') + txt(X(q[0]) + 6, Y(q[1]), "q", "sm serif");
      return { title: "MOMENTA (CM FRAME)", sub: "drag p₃ and p₄", body: svg(400, 240, s, "momentum assignment"), foot: bad ? `<span class="fail">Inconsistent:</span> at the muon vertex p₂ + q − p₄ = (${fmt(res[0], 3)}, ${fmt(res[1], 3)}) MeV, energy mismatch ${fmt(Eout - Ein, 3)} MeV.` : `<span class="pass">Consistent:</span> ∑p_in = ∑p_out at both vertices; q = p₁ − p₃ = p₄ − p₂.` };
    },
    space: (c) => {
      const M = minkowski({ W: 400, H: 220, scale: 40, cone: false });
      let s = M.s + circ(M.cx, M.cy, 26, "", 'fill="var(--soft)" stroke="var(--axis)" stroke-dasharray="3 3"') + txt(M.cx, M.cy + 4, "?", "lbl", 'text-anchor="middle"');
      const th = c.s.theta;
      s += arrow(...M.P(-2.4, -1.8), ...M.P(-0.75, -0.55), "fermion", 'data-link="eline"') + arrow(...M.P(-2.4, 1.6), ...M.P(-0.75, 0.5), "fermion-mu", 'data-link="muline"');
      s += arrow(...M.P(0.75, -0.6 * Math.cos(th)), ...M.P(2.4, -1.9 * Math.cos(th)), "fermion", 'data-link="eline"') + arrow(...M.P(0.75, 0.6 * Math.cos(th)), ...M.P(2.4, 1.9 * Math.cos(th)), "fermion-mu", 'data-link="muline"');
      return { title: "ASYMPTOTIC STATES", sub: "particles in, particles out", body: svg(400, 220, s, "asymptotic states"), foot: "Spacetime shows incoming and outgoing wave packets; the interaction region carries no diagram — the exchange is a term in an amplitude." };
    },
  },
  drag: {
    p3: (c, p) => { const r = ENG.treeAmplitude({ sqrtS: c.s.sqrtS, theta: c.s.theta }), sc = 120 / r.kin.pAbs; c.s.p3 = [(p.x - 200) / sc, -(p.y - 120) / sc]; },
    p4: (c, p) => { const r = ENG.treeAmplitude({ sqrtS: c.s.sqrtS, theta: c.s.theta }), sc = 120 / r.kin.pAbs; c.s.p4 = [(p.x - 200) / sc, -(p.y - 120) / sc]; },
  },
  side: (c) => {
    const rule = (k, label, f) => `<li><button class="btn small" type="button" data-act="rule" data-arg="${k}" aria-pressed="${c.s.rules[k]}">${label}</button> ${tex(f)}</li>`;
    const on = c.s.rules;
    const pieces = [on.vertex ? "(-ie)^2" : "", on.spinors ? "[\\bar u_3\\gamma^\\mu u_1]" : "", on.photon ? "D_{\\mu\\nu}(q)" : "", on.spinors ? "[\\bar u_4\\gamma^\\nu u_2]" : ""].filter(Boolean).join("\\,");
    return `<h3>QED Feynman rules</h3><ul class="small" style="list-style:none;padding:0">${rule("spinors", "electron line", "\\to\\ \\text{fermion propagator / spinors}")}${rule("photon", "photon line", "\\to\\ -ig_{\\mu\\nu}/q^2")}${rule("vertex", "vertex", "\\to\\ -ie\\gamma^\\mu")}<li>closed fermion loop → extra −1</li><li>internal momentum → ${tex("\\int d^4k/(2\\pi)^4")}</li></ul><p class="small">Toggle a rule to insert or remove its factor: ${tex(`\\mathcal{M} \\propto ${pieces || "1"}`)}</p>`;
  },
  notes: () => `<p>${formula("\\mathcal{M} = (-ie)^2[\\bar u(p_3)\\gamma^\\mu u(p_1)]\\,D_{\\mu\\nu}(q)\\,[\\bar u(p_4)\\gamma^\\nu u(p_2)],\\qquad q = p_1 - p_3")} The page builds ${tex("u(p,s)")} explicitly, forms both currents for all 16 spin choices and averages ${tex("|\\mathcal{M}|^2")}; the result agrees with ${tex("\\tfrac{2e^4}{t^2}[(s-\\Sigma)^2 + (u-\\Sigma)^2 + 2t\\Sigma]")}, Σ = m² + M².</p>`,
  md: (c) => { const r = ENG.treeAmplitude({ sqrtS: c.s.sqrtS, theta: c.s.theta }); return { sections: [{ heading: "Amplitude", body: "\\[\\mathcal M = (-ie)^2[\\bar u(p_3)\\gamma^\\mu u(p_1)]D_{\\mu\\nu}(q)[\\bar u(p_4)\\gamma^\\nu u(p_2)]\\]" }, { heading: "Numbers", body: `- √s = ${c.s.sqrtS} MeV, θ = ${(c.s.theta * 180 / PI).toFixed(1)}°\n- t = ${fmt(r.kin.t, 6)} MeV²\n- spin-averaged |M|² = ${fmt(r.amp.avg, 8)} (trace formula ${fmt(r.closed, 8)})\n- dσ/dΩ = ${fmt(r.dsdo, 5)} MeV⁻²` }] }; },
});

/* ---------- §107–108 Coulomb potential and its vacuum-polarization correction ---------- */
scene({
  id: "coulomb", track: "qft", title: "From photon exchange to Coulomb's law", sections: [107, 108],
  summary: "The static limit of the photon propagator, Fourier transformed, is the 1/r Coulomb potential (watch the partial transforms converge). Switch on one-loop vacuum polarization: the Uehling correction makes the effective charge grow at short distance, and r ↔ 1/μ ties it to the running coupling.",
  refs: ["ps", "uehling1935", "blp"],
  init: () => ({ logQ: 0.6, vp: true }),
  controls: (c) => `${slider("logQ", "Fourier cutoff Q", -0.5, 1.6, 0.01, c.s.logQ, (v) => fmt(Math.pow(10, v), 3))} ${toggle("vp", "one-loop vacuum polarization", c.s.vp)}`,
  panels: {
    diagram: () => ({ title: "PHOTON EXCHANGE", sub: "static limit q⁰ → 0", body: svg(400, 200, feynman(GR.byId("tree_emu"), [20, 10, 360, 170], { link: (e) => (e.id === "q" ? "photon" : "") }) + txt(200, 194, "−ig_μν/q² → e²/|q|² in the static limit", "sm", 'text-anchor="middle" data-link="photon"'), "exchange") }),
    algebra: (c) => {
      const Qc = Math.pow(10, c.s.logQ), rs = Q.linspace(0.3, 4, 30);
      return { title: "FOURIER TRANSFORM", sub: `∫ d³q e^{iq·r}/q², cutoff Q = ${fmt(Qc, 3)}`, body: lineChart({ W: 400, H: 210, xr: [0, 4], yr: [-0.1, 0.4], series: [{ pts: rs.map((r) => [r, QED.fourierPotential(r, Qc, 0)]), cls: "qft", label: "partial transform" }, { pts: rs.map((r) => [r, QED.yukawa(r, 0)]), cls: "ck", label: "1/(4πr)", dash: "4 3" }], xlabel: "r" }) };
    },
    field: (c) => {
      const me = ME, rs = Q.linspace(Math.log10(0.003), Math.log10(3), 60).map((x) => Math.pow(10, x) / me);
      const series = [{ pts: rs.map((r) => [Math.log10(r * me), 1]), cls: "axis", label: "tree level", dash: "4 3" }];
      if (c.s.vp) series.push({ pts: rs.map((r) => [Math.log10(r * me), QED.alphaAtDistance(r) / Q.ALPHA]), cls: "qft", label: "one-loop Uehling", tip: (x, y) => `m r = ${fmt(Math.pow(10, x), 3)}: α_eff/α = ${fmt(y, 6)}` });
      const mu = muNow(), rmu = 1 / mu;
      return { title: "EFFECTIVE CHARGE AT DISTANCE r", sub: "α_eff(r)/α, one loop, electron loop", body: lineChart({ W: 400, H: 220, xr: [Math.log10(0.003), Math.log10(3)], yr: [0.998, 1.012], series, xlabel: "log₁₀(m_e r)", vlines: [{ x: Math.log10(rmu * me), label: "r = 1/μ", link: "coupling" }], yfmt: (v) => v.toFixed(3) }), foot: `At the current scale μ = ${muLabel(mu)}, r = 1/μ: α_eff/α = ${fmt(QED.alphaAtDistance(rmu) / Q.ALPHA, 7)}.` };
    },
    space: (c) => {
      let s = circ(200, 110, 10, "fck") + txt(200, 114, "+", "lbl", 'text-anchor="middle" style="fill:var(--bg)"');
      if (c.s.vp) for (let k = 0; k < 28; k++) { const th = (2 * PI * k) / 28, r0 = 40 + (k % 3) * 22; const x = 200 + r0 * Math.cos(th), y = 110 + r0 * Math.sin(th); s += circ(x - 3 * Math.cos(th), y - 3 * Math.sin(th), 3, "faqft", 'opacity="0.7"') + circ(x + 3 * Math.cos(th), y + 3 * Math.sin(th), 3, "fck", 'opacity="0.5"'); }
      s += txt(20, 210, "heuristic: virtual pairs orient to screen the charge (a picture of Π, not of particles)", "xs ink2");
      return { title: "SCREENING (HEURISTIC)", sub: "explicitly schematic", body: svg(400, 220, s, "screening") };
    },
  },
  notes: () => `<p>${formula("\\int\\frac{d^3q}{(2\\pi)^3}\\frac{e^2\\,e^{iq\\cdot r}}{|q|^2} = \\frac{e^2}{4\\pi r} = \\frac{\\alpha}{r}")} With one-loop vacuum polarization the potential becomes ${tex("V(r) = -\\frac{\\alpha}{r}\\left[1 + \\frac{2\\alpha}{3\\pi}\\int_1^\\infty du\\,e^{-2m_e ru}\\left(1+\\frac{1}{2u^2}\\right)\\frac{\\sqrt{u^2-1}}{u^2}\\right]")} (Uehling), integrated numerically here. The correction grows logarithmically below the electron's Compton wavelength — the spatial form of the running coupling, with ${tex("r \\leftrightarrow 1/\\mu")}.</p>`,
});
