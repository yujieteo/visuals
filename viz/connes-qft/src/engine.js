/* Connes QFT laboratory: the engine's public face.
 *
 * Gathers the modules and computes the three flagship pipelines the page steps through:
 *   vacuumPolarization  — graph → momentum → integral → d = 4 − ε → Laurent → pole → counterterm →
 *                         finite amplitude → vary μ → running e(μ) → β(e) → Hopf element → Birkhoff;
 *   spectralToGauge     — (A, H, D) → [D, a] → one-form → D + A + JAJ⁻¹ → U(1) link field →
 *                         curvature → spectral action → comparison with electrodynamics;
 *   regionToModular     — region O → finite local algebra → Ω cyclic and separating → S → S = JΔ^{1/2}
 *                         → Δ^{it} → modular orbit (and the wedge's Bisognano–Wichmann boosts).
 * Each returns plain data (numbers already computed) for the page, the exports and the WebMCP tools.
 */
(function (factory) {
  if (typeof module === "object" && module.exports) {
    const Q = require("./core.js");
    for (const m of ["./linalg.js", "./laurent.js", "./tex.js", "./qed.js", "./graphs.js", "./hopf.js", "./spectral.js", "./aqft.js", "./report.js"]) require(m);
    module.exports = factory(Q);
  } else factory(self.ConnesQFT);
})(function (Q) {
  "use strict";
  const { qed: E, graphs: G, hopf: H, laurent: LS, spectral: SP, aqft: AQ, linalg: LA } = Q;
  const PI = Math.PI;
  const me = Q.CONST.me.value;

  const META = {
    title: "Quantum Electrodynamics: a visual laboratory",
    slug: "connes-qft",
    url: "https://teoyujie.org/visuals/connes-qft/",
    version: 1,
    scope: "QED as a running example read through three related but distinct lenses: perturbative QFT (fields, propagators, Feynman graphs, loops, regularization, renormalization), Connes–Kreimer renormalization and Connes' noncommutative spectral geometry, and local operator algebras with Tomita–Takesaki modular theory.",
    conventions: [
      "Natural units ħ = c = 1; Heaviside–Lorentz charge, e² = 4πα; metric signature (+, −, −, −).",
      "Dimensional regularization in d = 4 − ε with e₀ = μ^{ε/2} Z_e e; Laurent series are in ε.",
      "Every running coupling shown is one-loop QED with one charged Dirac fermion (the electron) in the MS-bar scheme unless labelled otherwise.",
      "Finite matrix and lattice models stand in for infinite-dimensional objects and are labelled as such; type III appears only through modular data, never as a finite matrix algebra.",
    ],
  };

  /* ---------- flagship 1: vacuum polarization ---------- */
  function vacuumPolarization({ Q2 = 4 * me * me, mu = me, alpha = Q.ALPHA, hi = 2 } = {}) {
    const q2 = -Q2; // spacelike momentum transfer, q² = −Q² < 0
    const g = G.byId("pi1");
    const graph = G.analyse(g);
    const series = LS.clean(E.vacuumPolarizationSeries(q2, mu, { alpha, hi }));
    const pole = LS.pole(series), regular = LS.regular(series);
    const residue = LS.coef(series, -1);
    const finiteMS = LS.coef(series, 0);
    const msbar = E.vpMSbar(q2, mu, { alpha });
    const onShell = E.vpOnShell(q2, { alpha });
    const e = Math.sqrt(4 * PI * alpha);
    // vary μ: Π̂_MS-bar(q²; μ) and its log-derivative −2α/(3π)
    const muGrid = Q.linspace(Math.log(mu) - 3, Math.log(mu) + 3, 25).map(Math.exp);
    const muScan = muGrid.map((m) => ({ mu: m, pi: E.vpMSbar(q2, m, { alpha }) }));
    const h = 1e-3;
    const dPi = (E.vpMSbar(q2, mu * Math.exp(h), { alpha }) - E.vpMSbar(q2, mu * Math.exp(-h), { alpha })) / (2 * h);
    // Hopf algebra: Π₁ is primitive, and the Birkhoff factors of its character are the MS counterterm and finite part.
    const key = H.keyOf(g);
    const cop = H.coproduct(g);
    const S = H.antipode(g);
    const B = H.birkhoff(H.character((gr) => { if (H.keyOf(gr) !== key) throw new Error("the QED character is given on Π₁ only"); return series; }, hi));
    const gammaMinus = B.minus.onKey(key), gammaPlus = B.plus.onKey(key), renormalized = B.renormalized(key);
    const agreesWithMS = Math.abs(renormalized - finiteMS) < 1e-14 && LS.add(gammaMinus, pole).c.every((x) => Math.abs(x) < 1e-14);
    return {
      Q2, q2, mu, alpha, e, graph,
      momentum: { loop: "k", lines: [{ edge: "k1", momentum: "k" }, { edge: "k2", momentum: "k + q" }], external: "q", conservation: "at each vertex the incoming q plus the loop line's k equals the outgoing line's k + q" },
      integralTeX: "i\\Pi_2^{\\mu\\nu}(q) = -(-ie)^2 \\int \\frac{d^4k}{(2\\pi)^4} \\operatorname{tr}\\left[\\gamma^\\mu \\frac{i(\\not{k}+m)}{k^2-m^2} \\gamma^\\nu \\frac{i(\\not{k}+\\not{q}+m)}{(k+q)^2-m^2}\\right]",
      scalarTeX: "\\Pi_2(q^2) = -\\frac{8e^2}{(4\\pi)^{d/2}} \\mu^{\\varepsilon} \\int_0^1 dx\\, x(1-x) \\frac{\\Gamma(2-\\frac{d}{2})}{\\Delta^{2-d/2}},\\quad \\Delta = m^2 - x(1-x)q^2",
      series, pole, regular, residue, residueExpected: (-2 * alpha) / (3 * PI),
      counterterm: { delta3MS: pole, delta3MSbar: "pole + (−γ + log 4π) × residue/2 (the MS-bar shift)" },
      finite: { MS: finiteMS, MSbar: msbar, onShell },
      muScan, dPiDlogMu: dPi, dPiExpected: (-2 * alpha) / (3 * PI),
      running: { alphaAtMu: E.alphaRun(Math.max(mu, 1e-30)), betaE: E.betaFromCounterterm(e), betaExpected: E.betaOneLoop(e) },
      hopf: { key, coproduct: cop.map((t) => t.kind), primitive: cop.length === 2, antipode: [...S].map(([k, c]) => ({ coef: c, mono: k === key ? "Π₁" : k })) },
      birkhoff: { gammaMinus, gammaPlus, renormalized, agreesWithMS },
    };
  }

  /* ---------- Birkhoff on a nested graph with the toy character ---------- */
  function birkhoffGraph(id, L = 0.5, hi = 6) {
    const g = G.byId(id);
    const key = H.keyOf(g);
    const phi = H.toyCharacter(L, hi);
    const B = H.birkhoff(phi);
    const steps = B.steps(key);
    const conv = H.convolve(H.inverseCharacter(B.minus), B.plus, g).total;
    return {
      id, name: g.name, L, key,
      trees: [...H.graphToTrees(g)].map(([t, c]) => ({ tree: t, coef: c })),
      phi: LS.clean(phi.onKey(key)),
      coproduct: H.coproduct(g).map((t) => ({ kind: t.kind, left: t.left === "" ? "1" : H.factors(t.left).map((k) => H.graphOf(k).name), right: t.right === "" ? "1" : H.graphOf(t.right).name, rightKey: t.right })),
      antipode: [...H.antipode(g)].map(([m, c]) => ({ coef: c, factors: H.factors(m).map((k) => H.graphOf(k).name) })),
      steps: steps.parts.map((p) => ({ sub: p.term.left.map((x) => x.name), quotient: p.term.right.name, counterterm: LS.clean(p.counterterm), value: LS.clean(p.value) })),
      bar: LS.clean(steps.bar),
      minus: LS.clean(B.minus.onKey(key)),
      plus: LS.clean(B.plus.onKey(key)),
      renormalized: B.renormalized(key),
      reconstruction: LS.clean(LS.sub(conv, phi.onKey(key))),
      forests: H.forests(g),
    };
  }

  /* ---------- flagship 2: spectral triple to gauge field ---------- */
  function spectralToGauge({ N = 8, t = 1, amplitude = 0.6, Lambda = 1.5, cutoff = "gauss", torusN = 5, torusFlux = 1 } = {}) {
    const theta = Q.range(N).map((x) => amplitude * Math.sin((2 * PI * (x + 0.5)) / N) + amplitude * 0.5);
    const a = (x) => Math.cos((2 * PI * x) / N);
    const comm = SP.ringCommutator(N, (z) => Math.cos(z));
    const fl = SP.doubledRingFluctuation(N, t, theta);
    const flux = fl.particleFlux;
    const bare = SP.doubledRingFluctuation(N, t, new Array(N).fill(0));
    const saBare = SP.spectralAction(bare.spectrum, Lambda, cutoff), saFl = SP.spectralAction(fl.spectrum, Lambda, cutoff);
    const lg = SP.landauGauge(torusN, torusFlux);
    const tor = SP.torusFluctuation(torusN, lg.thx, lg.thy, t);
    const gauged = SP.gaugeTransformRing(fl.DA, N, Q.range(N).map((x) => 0.7 * Math.cos(x)));
    return {
      N, t, theta, a: Q.range(N).map(a), commutatorNorm: comm.norm, supDerivative: comm.supDerivative,
      oneFormTerms: fl.terms.length, particlePhases: fl.particlePhases, antiparticlePhases: fl.antiparticlePhases, singleCopyPhases: fl.singleCopyPhases,
      flux, antiFlux: fl.antiparticleFlux, spectrum: fl.spectrum, bareSpectrum: bare.spectrum, exactSpectrum: [...SP.ringSpectrumExact(N, t, flux), ...SP.ringSpectrumExact(N, t, -flux)].sort((x, y) => x - y),
      gaugeInvariance: LA.maxAbsDiff(LA.diag(LA.eigvalsh(gauged)), LA.diag(fl.spectrum)),
      spectralAction: { Lambda, cutoff, bare: saBare.total, fluctuated: saFl.total, rows: saFl.rows },
      torus: { N: torusN, flux: torusFlux, B: lg.B, F: tor.F, spectrum: tor.spectrum },
    };
  }

  /* ---------- flagship 3: region to modular flow ---------- */
  function regionToModular({ p = [0.7, 0.3], t = 0.25, observable = "X" } = {}) {
    const n = p.length;
    const rho = LA.diag(p);
    const T = AQ.tomita(rho);
    const A = n === 2 ? AQ.PAULI[observable] : LA.from(Q.range(n).map((i) => Q.range(n).map((j) => (Math.abs(i - j) === 1 ? 1 : 0))));
    const orbit = Q.linspace(0, 2, 81).map((s) => { const B = AQ.modularFlow(rho, A, s); return { t: s, bloch: n === 2 ? AQ.blochVector(B) : null, entry: LA.get(B, 0, 1) }; });
    const At = AQ.modularFlow(rho, A, t);
    const cs = AQ.cyclicSeparating(p);
    const wedgePoint = [0.2, 1];
    return {
      p, n, t, cyclic: cs, deltaEigenvalues: T.deltaEigenvalues, ratios: T.ratios, K: T.K, check: T.check,
      observable, flowed: LA.toArray(At), orbit,
      kms: AQ.kmsCheck(rho, A, LA.from(Q.range(n).map((i) => Q.range(n).map((j) => (i === j ? i + 1 : 0))))).diff,
      wedge: { point: wedgePoint, image: AQ.modularBoost(t, wedgePoint), rapidity: -2 * PI * t },
    };
  }

  /* ---------- tree-level photon exchange ---------- */
  function treeAmplitude({ sqrtS = 300, theta = PI / 3 } = {}) {
    const kin = E.emuKinematics(sqrtS, theta);
    const amp = E.emuAmplitude(kin);
    const closed = E.emuClosedForm(kin);
    return { kin, amp, closed, dsdo: E.dsigmaDOmega(amp.avg, kin.s), relErr: Math.abs(amp.avg - closed) / closed };
  }

  /* ---------- graph analysis for a user-built or catalogue graph ---------- */
  function analyseGraph(g) {
    const a = G.analyse(g);
    let coproduct = null, forestCount = null, antipodeSize = null;
    if (a.valid && a.onePI && a.L >= 1 && a.residue.divergent) {
      try {
        coproduct = H.coproduct(g).map((t) => ({ kind: t.kind, left: t.left === "" ? "1" : H.factors(t.left).map((k) => H.graphOf(k).name).join(" · "), right: t.right === "" ? "1" : H.graphOf(t.right).name }));
        forestCount = H.forests(g).forests.length;
        antipodeSize = H.antipode(g).size;
      } catch (e) { /* graph too large */ }
    }
    return { ...a, coproduct, forestCount, antipodeSize };
  }

  /* ---------- self-test ---------- */
  function selfTests() {
    const T = [];
    const check = (name, fn) => { try { const r = fn(); T.push({ name, pass: !!r.pass, detail: r.detail || "" }); } catch (e) { T.push({ name, pass: false, detail: String(e && e.message) }); } };
    check("Dirac equation (p̸ − m)u = 0", () => { const r = E.diracResidual(E.onShell(1, [0.3, -0.4, 0.5]), 1, 0); return { pass: r < 1e-12, detail: `residual ${r.toExponential(1)}` }; });
    check("e⁻μ⁻ spin sum equals the closed form", () => { const r = treeAmplitude(); return { pass: r.relErr < 1e-10, detail: `relative difference ${r.relErr.toExponential(1)}` }; });
    check("vacuum-polarization pole residue −2α/3π", () => { const v = vacuumPolarization(); return { pass: Math.abs(v.residue - v.residueExpected) < 1e-12, detail: `${Q.fmt(v.residue, 8)} vs ${Q.fmt(v.residueExpected, 8)}` }; });
    check("β(e) from the counterterm equals e³/12π²", () => { const e = 0.3, b = E.betaFromCounterterm(e), x = E.betaOneLoop(e); return { pass: Math.abs(b - x) / x < 1e-6, detail: `${Q.fmt(b, 7)} vs ${Q.fmt(x, 7)}` }; });
    check("μ dΠ̂/dμ = −2α/3π", () => { const v = vacuumPolarization(); return { pass: Math.abs(v.dPiDlogMu - v.dPiExpected) < 1e-9, detail: Q.fmt(v.dPiDlogMu, 6) }; });
    check("Birkhoff γ₊(0) equals the MS finite part", () => ({ pass: vacuumPolarization().birkhoff.agreesWithMS }));
    check("F₂(0) = α/2π (Schwinger)", () => { const v = E.F2(0), x = Q.ALPHA / (2 * PI); return { pass: Math.abs(v - x) / x < 1e-10, detail: Q.fmt(v, 8) }; });
    check("Feynman parameter identity", () => { const r = E.feynmanParameter(2, 5); return { pass: Math.abs(r.lhs - r.rhs) < 1e-12 }; });
    check("Wick: (2n−1)!! pairings", () => ({ pass: E.matchings([0, 1, 2, 3, 4, 5]).length === 15 && E.matchings([0, 1, 2, 3]).length === 3 }));
    check("loop numbers L = I − V + C", () => ({ pass: ["tree_emu", "sigma1", "pi1", "lambda1", "sigma2_rainbow", "sigma3_rainbow"].map((id) => G.loopNumber(G.byId(id))).join() === "0,1,1,1,2,3" }));
    check("1PI detector", () => ({ pass: G.is1PI(G.byId("pi2_crossed")) && !G.is1PI(G.byId("pi1_chain")) && !G.is1PI(G.byId("tree_emu")) }));
    check("divergent subgraphs: nested vs overlapping", () => ({ pass: G.divergentSubgraphs(G.byId("sigma2_rainbow")).length === 1 && G.analyse(G.byId("sigma2_crossed")).overlapping && !G.analyse(G.byId("sigma3_rainbow")).overlapping }));
    check("antipode: m(S ⊗ id)Δ = 0", () => ({ pass: ["sigma2_rainbow", "sigma2_crossed", "sigma3_double"].every((id) => H.antipodeCheck(G.byId(id)).size === 0) }));
    check("ladder renormalized values (−L)ⁿ/n!", () => { const L = 0.7; const r = [["sigma1", -L], ["sigma2_rainbow", (L * L) / 2], ["sigma3_rainbow", -(L ** 3) / 6]].every(([id, x]) => Math.abs(birkhoffGraph(id, L).renormalized - x) < 1e-12); return { pass: r }; });
    check("counterterms γ₋ do not depend on μ", () => { const a = birkhoffGraph("sigma3_double", 0.3).minus, b = birkhoffGraph("sigma3_double", 1.7).minus; return { pass: LS.toText(a) === LS.toText(b), detail: LS.toText(a) }; });
    check("γ = γ₋^{⋆−1} ⋆ γ₊", () => ({ pass: birkhoffGraph("sigma3_double", 0.9).reconstruction.c.every((x) => Math.abs(x) < 1e-12) }));
    check("two-point Connes distance 1/|m|", () => { const r = SP.twoPoint([0.6, 0.8]); return { pass: Math.abs(r.distance - 1) < 1e-9, detail: Q.fmt(r.distance, 9) }; });
    check("product spectrum ±√(μ² + |m|²)", () => { const r = SP.productGeometry(6, 0.7); return { pass: LA.maxAbsDiff(LA.diag(r.spectrum), LA.diag(r.predicted)) < 1e-9 }; });
    check("fluctuation: antiparticle sees the opposite flux", () => { const r = spectralToGauge(); return { pass: Math.abs(r.flux + r.antiFlux) < 1e-12 && r.gaugeInvariance < 1e-9 }; });
    check("spectrum of D_A depends only on the flux", () => { const r = spectralToGauge(); return { pass: LA.maxAbsDiff(LA.diag(r.spectrum), LA.diag(r.exactSpectrum)) < 1e-9 }; });
    check("Poisson summation of the circle's spectral action", () => { const r = SP.circleSpectralAction(2.5, 0.3); return { pass: Math.abs(r.direct - r.poisson) < 1e-10 }; });
    check("commutant and bicommutant of M₂ ⊗ 1", () => { const a = AQ.analyseAlgebra([AQ.pauliString("XI"), AQ.pauliString("ZI")], 4); return { pass: a.dimM === 4 && a.dimMprime === 4 && a.bicommutantEqual && a.factor }; });
    check("abelian algebra is not a factor", () => { const a = AQ.analyseAlgebra([AQ.pauliString("ZI")], 4); return { pass: !a.factor && a.dimCentre === 2 && a.bicommutantEqual }; });
    check("Tomita: S = JΔ^{1/2}, Δ = ρ·ρ⁻¹, J = *", () => { const c = regionToModular().check; const worst = Math.max(...Object.values(c)); return { pass: worst < 1e-10, detail: `worst ${worst.toExponential(1)}` }; });
    check("KMS condition for the modular flow", () => ({ pass: regionToModular().kms < 1e-12 }));
    check("spectral flow of −i d/dθ + s over one period is 1", () => ({ pass: SP.spectralFlow(SP.circleFamily(4), -0.5, 0.5).flow === 1 }));
    return T;
  }

  const api = { META, vacuumPolarization, birkhoffGraph, spectralToGauge, regionToModular, treeAmplitude, analyseGraph, selfTests };
  Q.engine = api;
  return Q;
});
