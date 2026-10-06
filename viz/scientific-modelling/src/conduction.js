/* Scientific Modelling: the conduction families of piece 3 as declared models for the Regime Map Builder. For each
 * declaration of data/catalogue.json it gives the parameter space, the evaluation of one point of a map (the error of
 * each approximation against the reference solution, and the term ratios of each balance), the layers that the map
 * draws, the limit paths, the inspection of a point, the dominant-balance and asymptotic derivations (spec section 8,
 * hand calculation item 8), and the acceptance checks of the declaration's standard example.
 *
 * Statuses: an error against the reference series is a numerical result with its tolerance; an expansion coefficient,
 * a rational solution and a crossover of an exact ratio are exact; a balance from scale estimates is a stated
 * comparison of terms, labelled a balance crossover and never a transition.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./special.js"), require("./heat.js"), require("./asymptotic.js"));
  else (root.SM = root.SM || {}).CD = factory(root.SM.Q, root.SM.SF, root.SM.H, root.SM.A);
})(typeof self !== "undefined" ? self : this, function (Q, SF, H, A) {
  "use strict";

  /** The points of the error measure: X = 0, 0.05, …, 1. */
  const XS = Array.from({ length: 21 }, (_, i) => i / 20);
  /** The points of an inspected profile. */
  const XP = Array.from({ length: 41 }, (_, i) => i / 40);
  /** A number for derived data: 12 significant digits, and null for a value that is not finite. */
  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(12)) : null);
  const maxAbs = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const EXCESS_FLOOR = 1e-12;
  /** The term ratios of a balance: below 1/10 one term controls, above 10 the other, between them the crossover region. */
  const BAND = 10;

  /** "Bi·Fo" for the slab, "2Bi·Fo" for the cylinder, "3Bi·Fo" for the sphere: the slow time T = (j + 1)Bi·Fo. */
  const jBiFo = (j) => `${j ? j + 1 : ""}Bi·Fo`;
  const jTex = (j) => (j ? `${j + 1}\\,` : "");
  const SUPERS = { 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸" };
  /** A power series as text from rational coefficients: "1 + Bi/6 − 7Bi²/120 + …". `pow(k)` is the power of term k. */
  function seriesText(coeffs, v, pow = (k) => k) {
    const parts = [];
    coeffs.forEach((c, k) => {
      const q = Q.parse(c);
      if (!q || Q.isZero(q)) return;
      const n = pow(k), a = Q.abs(q);
      const vp = n === 0 ? "" : n === 1 ? v : `${v}${SUPERS[n] ?? `^${n}`}`;
      const num0 = a.n === 1n && vp ? "" : String(a.n);
      const body = !vp ? Q.str(a) : a.d === 1n ? `${num0}${vp}` : `${num0}${vp}/${a.d}`;
      parts.push({ neg: Q.sign(q) < 0, body });
    });
    return parts.map((t, i) => (i ? `${t.neg ? " − " : " + "}${t.body}` : `${t.neg ? "−" : ""}${t.body}`)).join("") + " + …";
  }

  const balanceRegions = (low, high) => [
    { id: "low", label: low, lo: 0, hi: 1 / BAND },
    { id: "band", label: "Comparable terms: the balance crossover region", lo: 1 / BAND, hi: BAND },
    { id: "high", label: high, lo: BAND, hi: null },
  ];
  /** An approximation layer. `hue` groups the approximations of one limit, which the view draws in one colour. */
  const approxLayer = (id, title, measure, criterion, steps, hue = id, evidence = ["spec-8", "spec-9"]) => ({
    id, kind: "approximation", boundary: "approximation", title, measure, scale: "log", status: "numerical", criterion, steps, evidence, hue,
    thresholds: (tol) => ({ curves: [{ value: tol, label: `${title}: error = ${tol}` }], regions: [{ id: "meets", label: `${title} meets the tolerance`, lo: 0, hi: tol }] }),
  });
  const balanceLayer = (id, title, measure, criterion, low, high, steps, status = "exact") => ({
    id, kind: "balance", boundary: "balance-crossover", title, measure, scale: "log", status, criterion, steps, evidence: ["spec-8"],
    thresholds: () => ({ curves: [{ value: 1, label: `${title}: the terms are equal` }], regions: balanceRegions(low, high) }),
  });

  /* ---------- transient conduction: slab, long cylinder, sphere ---------- */

  const GEOM_TEX = {
    slab: { L: "\\frac{\\partial^{2}\\theta}{\\partial X^{2}}", op: "\\frac{\\partial^{2}}{\\partial X^{2}}", f: "\\cos(\\lambda X)", length: "L", name: "slab" },
    cylinder: { L: "\\frac{1}{X}\\frac{\\partial}{\\partial X}\\left(X\\frac{\\partial\\theta}{\\partial X}\\right)", op: "\\frac{1}{X}\\frac{\\partial}{\\partial X}X\\frac{\\partial}{\\partial X}", f: "J_0(\\lambda X)", length: "R", name: "long cylinder" },
    sphere: { L: "\\frac{1}{X^{2}}\\frac{\\partial}{\\partial X}\\left(X^{2}\\frac{\\partial\\theta}{\\partial X}\\right)", op: "\\frac{1}{X^{2}}\\frac{\\partial}{\\partial X}X^{2}\\frac{\\partial}{\\partial X}", f: "\\frac{\\sin(\\lambda X)}{\\lambda X}", length: "R", name: "sphere" },
  };

  /** The approximations of the transient models, each with its reduced model and the nature of its error. */
  function transientApprox(geom) {
    const j = H.J[geom];
    const { c, r } = H.outerFirst(geom);
    return [
      { id: "one-mode", label: "One mode", tex: `\\theta\\approx C_1 ${GEOM_TEX[geom].f.replace(/\\lambda/g, "\\lambda_1")}\\,e^{-\\lambda_1^{2}Fo}`, limit: "Fo → ∞ at fixed Bi",
        why: "The first mode decays slowest, so the others become small at late times.", error: geom === "cylinder" ? "measured against the series; no proved bound here" : "proved bound from the series tail (see the asymptotic analysis)" },
      { id: "lumped", label: "Lumped", tex: `\\theta\\approx e^{-${jTex(j)}Bi\\,Fo}`, limit: "Bi → 0 at fixed Bi·Fo",
        why: "Order 0 of the outer expansion: the temperature is uniform and decays at the rate of the surface exchange.", error: "formal expansion; the order-1 term estimates the remainder" },
      { id: "outer", label: "Outer, order 1", tex: `\\theta\\approx e^{-T}\\left[1+Bi\\left(${Q.tex(c)}+${Q.tex(r)}\\,T-\\frac{X^{2}}{2}\\right)\\right],\\quad T=${jTex(j)}Bi\\,Fo`, limit: "Bi → 0 at fixed Bi·Fo",
        why: "Orders 0 and 1 of the outer expansion. It does not hold in the initial layer, at Fo of order 1 or less.", error: "formal expansion; the order-2 term estimates the remainder" },
      { id: "surface-temperature", label: "Surface temperature", tex: `\\theta(1,Fo)=0:\\ \\lambda_n=${geom === "slab" ? "(n-\\tfrac{1}{2})\\pi" : geom === "cylinder" ? "j_{0,n}" : "n\\pi"}`, limit: "Bi → ∞ at fixed Fo",
        why: "The surface condition becomes a prescribed temperature: λ_n = λ_n^∞(1 − 1/Bi) + O(Bi⁻²).", error: "regular expansion in 1/Bi; measured against the series" },
      { id: "short-time", label: "Short time", tex: "\\theta\\approx\\operatorname{erf}\\eta+e^{-\\eta^{2}}\\operatorname{erfcx}\\left(\\eta+Bi\\sqrt{Fo}\\right),\\quad\\eta=\\frac{1-X}{2\\sqrt{Fo}}", limit: "Fo → 0 with Bi√Fo fixed",
        why: "The inner solution of a semi-infinite solid at the surface. It does not see the centre" + (geom === "slab" ? "." : " or the curvature of the surface."), error: geom === "slab" ? "the effect of the centre is exponentially small, of order e^{−1/(4Fo)}" : "the curvature adds an error that falls with Fo; measured against the series" },
    ];
  }

  function transient(decl, geom) {
    const j = H.J[geom];
    const approx = transientApprox(geom);
    const dom = Object.fromEntries(decl.domain.parameters.map((p) => [p.id, p]));
    function evaluate(p) {
      const Bi = p.Bi, Fo = p.Fo;
      if (!(Bi > 0) || !(Fo > 0)) return { ok: false, reason: "Bi and Fo must be positive." };
      const ref = H.series(geom, Bi, Fo, XS);
      if (!ref.ok) return { ok: false, reason: ref.reason };
      const mx = maxAbs(ref.values);
      if (mx < EXCESS_FLOOR) return { ok: false, reason: "The temperature excess is below 10⁻¹² of its initial value, so the page cannot resolve the relative error." };
      const err = (vals) => vals.reduce((m, v, i) => Math.max(m, Math.abs(v - ref.values[i])), 0) / mx;
      const one = H.series(geom, Bi, Fo, XS, 1).values;
      const lump = H.lumped(geom, Bi, Fo);
      const dir = H.series(geom, Infinity, Fo, XS);
      return { ok: true, values: {
        "err-one-mode": err(one), "err-lumped": err(XS.map(() => lump)), "err-outer": err(XS.map((X) => H.outerFirstValue(geom, Bi, Fo, X))),
        "err-surface-temperature": dir.ok ? err(dir.values) : 1, "err-short-time": err(XS.map((X) => H.semiInfinite(Bi, Fo, X))),
        "bal-surface": Bi * Math.min(1, 2 * Math.sqrt(Fo)), "bal-penetration": 4 * Fo,
      } };
    }
    const steps = ["s-rm-balance", "s-rm-asymptotic", "s-rm-map"];
    const layers = [
      ...approx.map((a) => approxLayer(a.id, a.label, `err-${a.id}`, `max over X of |θ_approx − θ| ÷ max over X of θ, against the series at 21 points, ≤ the tolerance`, steps, a.id === "outer" ? "lumped" : a.id)),
      balanceLayer("surface", "Surface balance", "bal-surface", "internal drop ÷ surface excess ≈ Bi·min(1, 2√Fo), an estimate. The surface condition −θ_X(1) = Bi θ(1) gives it, with the gradient length min(1, 2√Fo)",
        "Surface exchange controls: the internal drop is small (lumped)", "Internal conduction controls: the surface is near the fluid temperature", steps, "proposed"),
      balanceLayer("penetration", "Penetration balance", "bal-penetration", "(2√Fo ÷ 1)² = 4Fo, an estimate: the penetration depth over the size, squared. It compares storage with diffusion over the whole size",
        "Short time: the change has not reached the centre (inner region)", "Whole body: the change has reached the centre (outer region)", steps, "proposed"),
    ];
    function limits(p) {
      const T = (j + 1) * p.Bi * p.Fo, beta = p.Bi * Math.sqrt(p.Fo);
      const along = (from, to, f) => Array.from({ length: 25 }, (_, i) => { const x = from * (to / from) ** (i / 24); return f(x); });
      return [
        { id: "lumped-limit", label: `Bi → 0 with ${jBiFo(j)} = ${num(T)} fixed`, coupled: true, approx: "lumped",
          note: "The lumped limit needs a coupled change: Fo grows like 1/Bi. Along this path the outer expansion holds.", points: along(p.Bi, dom.Bi.min, (b) => ({ Bi: b, Fo: T / ((j + 1) * b) })) },
        { id: "fixed-fo", label: `Bi → 0 at Fo = ${num(p.Fo)}`, coupled: false, approx: null,
          note: "θ → 1 everywhere: the solid does not cool. The lumped model also tends to 1 on this path, so this limit tells nothing about the cooling.", points: along(p.Bi, dom.Bi.min, (b) => ({ Bi: b, Fo: p.Fo })) },
        { id: "surface-limit", label: `Bi → ∞ at Fo = ${num(p.Fo)}`, coupled: false, approx: "surface-temperature",
          note: "The surface takes the fluid temperature. The reduced model keeps the number of modes and of conditions.", points: along(p.Bi, dom.Bi.max, (b) => ({ Bi: b, Fo: p.Fo })) },
        { id: "short-limit", label: `Fo → 0 with Bi√Fo = ${num(beta)} fixed`, coupled: true, approx: "short-time",
          note: "The inner region keeps the surface condition only when Bi grows like Fo^{−1/2}: a coupled change. At fixed Bi the surface stays near θ = 1 as Fo → 0.",
          points: along(p.Fo, dom.Fo.min, (f) => ({ Bi: beta / Math.sqrt(f), Fo: f })) },
        { id: "late-limit", label: `Fo → ∞ at Bi = ${num(p.Bi)}`, coupled: false, approx: "one-mode",
          note: "The first mode remains. Its shape and its rate λ₁² depend on Bi only.", points: along(p.Fo, dom.Fo.max, (f) => ({ Bi: p.Bi, Fo: f })) },
      ];
    }
    function inspect(p, ctx) {
      const Bi = p.Bi, Fo = p.Fo;
      const ref = H.series(geom, Bi, Fo, XP);
      if (!ref.ok) return { ok: false, reason: ref.reason };
      const list = H.modes(geom, Bi, H.modeCount(Fo));
      const theta0 = ref.values[0], theta1 = ref.values[XP.length - 1];
      // The energy balance: d(mean θ)/dτ = −(j + 1) Bi θ(1, τ), with both sides from the modes.
      const dmean = -list.reduce((s, m) => s + m.C * H.modeMean(geom, m.lambda) * m.lambda * m.lambda * Math.exp(-m.lambda * m.lambda * Fo), 0);
      const flux = -(j + 1) * Bi * theta1;
      const energyErr = Math.abs(dmean - flux) / Math.max(Math.abs(flux), 1e-300);
      const curves = {
        exact: ref.values, "one-mode": H.series(geom, Bi, Fo, XP, 1).values, lumped: XP.map(() => H.lumped(geom, Bi, Fo)),
        outer: XP.map((X) => H.outerFirstValue(geom, Bi, Fo, X)), "surface-temperature": H.series(geom, Infinity, Fo, XP).values, "short-time": XP.map((X) => H.semiInfinite(Bi, Fo, X)),
      };
      const recon = ctx.reconstruct ? [ctx.reconstruct("Bi", Bi), ctx.reconstruct("Fo", Fo)].filter(Boolean) : [];
      const temps = ctx.temperature ? [
        { id: "T-centre", tex: "T(0,t)", label: "temperature at the centre", value: ctx.temperature(theta0), unit: "K" },
        { id: "T-surface", tex: `T(${GEOM_TEX[geom].length},t)`, label: "temperature at the surface", value: ctx.temperature(theta1), unit: "K" },
      ] : [];
      return {
        ok: true, modes: list.length,
        profile: { xs: XP, curves: Object.fromEntries(Object.entries(curves).map(([k, v]) => [k, v.map(num)])) },
        values: [
          { id: "centre", tex: "\\theta(0,Fo)", label: "θ at the centre", value: num(theta0) },
          { id: "surface", tex: "\\theta(1,Fo)", label: "θ at the surface", value: num(theta1) },
          { id: "mean", tex: "\\bar\\theta", label: "mean θ, the fraction of the initial excess energy that remains", value: num(ref.mean) },
          { id: "ratio", tex: "\\frac{\\theta(0)-\\theta(1)}{\\theta(1)}", label: "internal drop ÷ surface excess, from the series", value: num((theta0 - theta1) / theta1) },
          { id: "T", tex: "T", label: `slow time ${jBiFo(j)}`, value: num((j + 1) * Bi * Fo) },
        ],
        checks: [{ id: "energy", title: "Energy balance d(mean θ)/dFo = −(j + 1) Bi θ(1, Fo)", passed: energyErr < 1e-9, status: "numerical", tolerance: "1e-9", detail: `The two sides are ${num(dmean)} and ${num(flux)}. Their relative difference is ${energyErr.toExponential(2)}.` }],
        reconstruction: [...recon, ...temps],
      };
    }
    return { id: decl.id, geom, params: decl.domain.parameters, axes: { x: "Bi", y: "Fo" }, approximations: approx, layers, evaluate, limits, inspect,
      derived: (p) => [
        { id: "T", tex: `T=${jTex(j)}Bi\\,Fo`, label: "slow time of the lumped limit", value: num((j + 1) * p.Bi * p.Fo) },
        { id: "Bi_c", tex: j ? `Bi_c=\\frac{Bi}{${j + 1}}` : "Bi_c=Bi", label: `Biot number with ${decl.acceptance.lumpedLength}`, value: num(p.Bi / (j + 1)) },
        { id: "beta", tex: "Bi\\sqrt{Fo}", label: "the parameter of the short-time inner region", value: num(p.Bi * Math.sqrt(p.Fo)) },
      ],
      constraints: (p) => [...(p.Bi > 0 ? [] : ["Bi must be positive."]), ...(p.Fo > 0 ? [] : ["Fo must be positive."])],
      analysis: () => transientAnalysis(geom, decl), acceptance: (ctx) => transientAcceptance(geom, decl, ctx) };
  }

  /** The dominant balances and the asymptotic analysis of the transient models (hand calculation item 8). */
  function transientAnalysis(geom, decl) {
    const j = H.J[geom];
    const g = GEOM_TEX[geom];
    const sb = A.smallBi(j, 2);
    const tauOf = `T = ${jBiFo(j)}`;
    const proved = geom === "slab" ? "|θ − θ₁| ≤ Σ_{m≥1} 4/(2mπ − 1) e^{−m²π²Fo}. The reason: λ_n ≥ (n − 1)π and |C_n| ≤ 4/(2λ_n − 1). The bound holds for every Bi."
      : geom === "sphere" ? "|θ − θ₁| ≤ Σ_{m≥1} 4(1 + λ)/(2λ − 1) e^{−λ²Fo} with λ = mπ. The reason: λ_n ≥ (n − 1)π, |f_n| ≤ 1 and |C_n| ≤ 4(1 + λ_n)/(2λ_n − 1). The bound holds for every Bi."
        : null;
    return {
      balance: {
        estimated: true, intro: "Each balance compares complete terms with their estimated field and derivative scales, not coefficients alone.",
        terms: [
          { id: "conduction", tex: "-\\left.\\frac{\\partial\\theta}{\\partial X}\\right|_{X=1}", label: "conduction to the surface", scale: "\\frac{\\Delta_i}{\\ell}", why: "Δ_i is the internal drop θ(0) − θ(1). ℓ = min(1, 2√Fo) is the length over which the temperature changes." },
          { id: "exchange", tex: "Bi\\,\\theta(1)", label: "exchange at the surface", scale: "Bi\\,\\theta_s", why: "θ_s is the surface excess θ(1)." },
          { id: "storage", tex: "\\frac{\\partial\\theta}{\\partial Fo}", label: "storage", scale: "\\frac{\\Delta}{Fo}", why: "The temperature changes by Δ in the time Fo." },
          { id: "diffusion", tex: g.L, label: "diffusion", scale: "\\frac{\\Delta}{\\ell^{2}}", why: "The temperature changes by Δ over the length ℓ." },
        ],
        balances: [
          { id: "surface-controls", region: "surface:low", title: "Surface exchange controls", when: "Bi\\,\\min(1,2\\sqrt{Fo})\\ll 1",
            derivation: "The surface condition makes the two terms equal: Δ_i/ℓ ~ Bi θ_s, so Δ_i/θ_s ~ Bi ℓ. When Bi ℓ ≪ 1 the internal drop is small, so θ is nearly uniform.",
            reduced: `\\frac{d\\bar\\theta}{dFo}=-${jTex(j)}Bi\\,\\bar\\theta`, neglected: "the internal drop Δ_i against θ_s", assumptions: ["The temperature is uniform at leading order."],
            residual: { tex: `${jTex(j)}Bi\\,\\partial_T\\theta_0-\\mathcal{L}\\theta_0=-${jTex(j)}Bi\\,e^{-T}`, order: "O(Bi)", status: "exact",
              note: `Put θ₀ = e^{−T} in the full equation ${j ? j + 1 : ""}Bi ∂_Tθ = 𝓛θ, with ${tauOf}. The residual is −${j ? j + 1 : ""}Bi e^{−T}, of order Bi. The order-1 solution reduces it to order Bi².` } },
          { id: "conduction-controls", region: "surface:high", title: "Internal conduction controls", when: "Bi\\,\\min(1,2\\sqrt{Fo})\\gg 1",
            derivation: "Then θ_s ≪ Δ_i: the surface is near the fluid temperature, and conduction inside sets the rate.",
            reduced: "\\theta(1,Fo)=0", neglected: "the surface excess θ_s against Δ_i", assumptions: ["The surface condition becomes a prescribed temperature."],
            residual: { tex: "\\frac{1}{Bi}\\left(-\\frac{\\partial\\theta}{\\partial X}\\right)-\\theta=-\\frac{1}{Bi}\\frac{\\partial\\theta}{\\partial X}\\ \\text{at}\\ X=1", order: "O(1/Bi)", status: "exact",
              note: "Write the surface condition as (1/Bi)(−θ_X) = θ. The reduced solution has θ(1) = 0, so the residual is −(1/Bi)θ_X(1), of order 1/Bi." } },
          { id: "short-time", region: "penetration:low", title: "Short time: an inner region at the surface", when: "4\\,Fo\\ll 1",
            derivation: "Storage Δ/Fo and diffusion Δ/ℓ² balance when ℓ ~ √Fo. The page uses ℓ = 2√Fo, the length in η. When 2√Fo ≪ 1 the change stays in a thin layer, and the centre condition is not active.",
            reduced: "\\frac{\\partial\\theta}{\\partial Fo}=\\frac{\\partial^{2}\\theta}{\\partial s^{2}},\\ s=1-X,\\quad \\theta\\to 1\\ (s\\to\\infty)", neglected: geom === "slab" ? "the centre condition" : "the centre condition and the curvature terms", assumptions: ["The solid is semi-infinite as seen from the surface."],
            residual: { tex: geom === "slab" ? "O\\left(e^{-1/(4Fo)}\\right)" : `\\frac{${j}}{X}\\frac{\\partial\\theta}{\\partial X}\\Big/\\frac{\\partial^{2}\\theta}{\\partial X^{2}}\\sim 2\\sqrt{Fo}`, order: geom === "slab" ? "exponentially small" : "O(√Fo) relative", status: geom === "slab" ? "exact" : "proposed",
              note: geom === "slab" ? "The semi-infinite solution satisfies the equation and the surface condition exactly. It misses only the reflection from the centre, which is of order e^{−1/(4Fo)}." : "Near X = 1, (j/X)θ_X is of order Δ/ℓ and θ_XX is of order Δ/ℓ². Their ratio is of order ℓ ~ √Fo." } },
        ],
        crossovers: [
          { id: "surface", criterion: "Bi\\,\\min(1,2\\sqrt{Fo})=1", text: "Bi = 1 for Fo ≥ 1/4, and Bi = 1/(2√Fo) for Fo < 1/4. The region 0.1 < Bi·min(1, 2√Fo) < 10 has comparable terms. The terms are estimates.", status: "proposed" },
          { id: "penetration", criterion: "4\\,Fo=1", text: "Fo = 1/4. The region 0.025 < Fo < 2.5 has comparable terms. The terms are estimates.", status: "proposed" },
        ],
        note: "These are balance crossovers: they mark where the estimated terms are equal. They are not transitions: the solution changes smoothly across them.",
      },
      asymptotic: {
        limits: [
          {
            id: "small-bi", parameter: "Bi\\to 0", path: `Bi → 0 with the slow time ${tauOf} fixed`, fixed: `${tauOf} and X`, coupled: true, kind: "An outer expansion in powers of Bi, with an initial layer (a singular perturbation in time)",
            setup: `${jTex(j)}Bi\\,\\frac{\\partial\\theta}{\\partial T}=${g.L},\\quad \\frac{\\partial\\theta}{\\partial X}(0,T)=0,\\quad -\\frac{\\partial\\theta}{\\partial X}(1,T)=Bi\\,\\theta(1,T),\\quad \\theta=\\sum_{n}Bi^{n}\\theta_n(X,T)`,
            orders: sb.orders.map((o) => ({
              n: o.n,
              equation: o.n === 0 ? "\\mathcal{L}\\theta_0=0" : `\\mathcal{L}\\theta_{${o.n}}=${j + 1}\\,\\partial_T\\theta_{${o.n - 1}}=${o.rhsTex}`,
              conditions: [`\\partial_X\\theta_{${o.n}}(0,T)=0`, o.n === 0 ? "-\\partial_X\\theta_0(1,T)=0" : `-\\partial_X\\theta_{${o.n}}(1,T)=\\theta_{${o.n - 1}}(1,T)=${o.bcTex}`],
              particular: o.n === 0 ? "0" : o.particularTex,
              solvability: `A_{${o.n}}'+A_{${o.n}}=${o.solvabilityTex}`,
              solvabilityWhy: `Integrate the order-${o.n + 1} equation with the weight X^${j} over 0 < X < 1: the surface condition fixes ∂_T of the mean. This fixes the free function A_${o.n}(T).`,
              matching: o.n === 0 ? "c_0=1\\ \\text{(the initial condition }\\theta=1\\text{)}" : `c_{${o.n}}=${o.constantTex}`,
              result: `\\theta_{${o.n}}=${o.thetaTex}`,
              checks: sb.checks[o.n],
            })),
            orderLoss: "The outer problem keeps the second derivative in X and both conditions in X, so it loses no differential order in space. It loses the initial condition: θ_n(X, 0) is not the initial data, so an initial layer at Fo of order 1 forms.",
            inner: {
              variable: "Fo=O(1)",
              equation: "\\frac{\\partial\\varphi}{\\partial Fo}=\\mathcal{L}\\varphi,\\quad -\\frac{\\partial\\varphi}{\\partial X}(1,Fo)=Bi\\,\\varphi(1,Fo),\\quad \\varphi(X,0)=1",
              solution: `\\varphi_0=1,\\quad \\varphi_1=-${j + 1}\\,Fo-\\frac{X^{2}}{2}+${Q.tex(Q.q(j + 1, 2 * (j + 3)))}+\\text{(decaying modes)}`,
              matching: `\\int_0^1 X^{${j}}\\,\\theta(X,0)\\left[\\theta(X,0)-1\\right]dX=0\\ \\text{at each order}`,
              why: "The initial layer keeps the projection of the initial data θ = 1 on the slow mode. At order 1 this is the energy balance of the inner problem. It gives c₁ = (j + 1)/(2(j + 3)).",
            },
            residual: { tex: `\\text{equation: }${jTex(j)}Bi^{3}\\,\\partial_T\\theta_2=Bi^{3}\\,${A.tex(sb.residual.equation)};\\quad \\text{surface: }-Bi^{3}\\,\\theta_2(1,T)`, order: "O(Bi³)", status: "exact" },
            crossCheck: { C1: sb.C1, decay: sb.decay, text: `The constants c_n are the coefficients of C₁ = ${seriesText(sb.C1, "Bi")}. The T-terms give λ₁²/${j ? `(${j + 1}Bi)` : "Bi"} = ${seriesText(["1", ...sb.decay.map((m) => Q.str(Q.neg(Q.parse(m))))], "Bi")}.` },
            error: { formal: "The outer expansion is formal: each order satisfies its equations exactly, but the series in Bi has no proved remainder here.", estimated: "The next order estimates the remainder: the order-1 term for the lumped model, and the order-2 term for the order-1 model.", proved: null },
            validity: "Bi ≪ 1. Order 0 holds for all Fo, with an error of order Bi. Order 1 and higher hold only outside the initial layer, when Fo is of order 1 or more. The T-polynomials grow, so the relative error also grows like Bi·T at late times: the map shows where.",
          },
          {
            id: "large-bi", parameter: "Bi\\to\\infty", path: "Bi → ∞ at fixed Fo", fixed: "Fo and X", coupled: false, kind: "A regular expansion in 1/Bi",
            setup: "\\frac{1}{Bi}\\left(-\\frac{\\partial\\theta}{\\partial X}(1,Fo)\\right)=\\theta(1,Fo)",
            orders: [
              { n: 0, equation: "\\theta(1,Fo)=0", conditions: [], result: `\\lambda_n^{\\infty}=${geom === "slab" ? "(n-\\tfrac{1}{2})\\pi" : geom === "cylinder" ? "j_{0,n}" : "n\\pi"}`, checks: null },
              { n: 1, equation: "\\lambda_n=\\lambda_n^{\\infty}+\\frac{1}{Bi}\\lambda_n^{(1)}", conditions: [], result: "\\lambda_n=\\lambda_n^{\\infty}\\left(1-\\frac{1}{Bi}\\right)+O\\left(Bi^{-2}\\right)", checks: null,
                why: "Expand the eigenvalue equation about λ_n^∞: the first-order term is −λ_n^∞/Bi for the three shapes." },
            ],
            orderLoss: "The reduced problem keeps the differential order and the number of conditions. Only the type of the surface condition changes, from Robin to Dirichlet. At Fo = 0 the surface value 0 and the initial value 1 disagree, so a short-time inner region forms at the surface.",
            inner: null,
            error: { formal: "The eigenvalues have a regular expansion in 1/Bi.", estimated: "The first neglected term is of order λ_n^∞/Bi². The map measures the error against the series.", proved: null },
            validity: "Bi ≫ 1 and Bi√Fo ≫ 1. Then the surface excess, about 1/(Bi√(πFo)), is small. The eigenvalue expansion holds for each mode with λ_n^∞ ≪ Bi.",
          },
          {
            id: "short-fo", parameter: "Fo\\to 0", path: "Fo → 0 with β = Bi√Fo fixed", fixed: "β = Bi√Fo and the similarity variable η = (1 − X)/(2√Fo)", coupled: true, kind: "An inner region: a thin layer at the surface at short times",
            setup: "\\theta=\\Theta(\\eta,\\beta),\\quad \\eta=\\frac{1-X}{2\\sqrt{Fo}},\\quad \\beta=Bi\\sqrt{Fo}",
            orders: [{ n: 0, equation: "\\Theta_{\\eta\\eta}+2\\eta\\Theta_{\\eta}=2\\beta\\frac{\\partial\\Theta}{\\partial\\beta}", conditions: ["\\Theta_{\\eta}(0,\\beta)=2\\beta\\,\\Theta(0,\\beta)", "\\Theta\\to 1\\ (\\eta\\to\\infty)"],
              result: "\\Theta=\\operatorname{erf}\\eta+e^{-\\eta^{2}}\\operatorname{erfcx}(\\eta+\\beta)", checks: null }],
            orderLoss: geom === "slab" ? "The inner problem drops the centre condition and replaces it with the matching condition Θ → 1. It keeps the order of the equation." : "The inner problem drops the centre condition and the curvature term (j/X)θ_X, and replaces the centre condition with the matching condition Θ → 1.",
            inner: { variable: "\\eta=\\frac{1-X}{2\\sqrt{Fo}}", equation: "\\text{semi-infinite solid with surface convection}", solution: "\\Theta=\\operatorname{erf}\\eta+e^{-\\eta^{2}}\\operatorname{erfcx}(\\eta+\\beta)", matching: "\\Theta(\\eta\\to\\infty)=1=\\theta_{\\text{core}}", why: "The core of the solid keeps its initial temperature to all orders in Fo while the layer is thin." },
            error: { formal: "The inner solution is exact for the semi-infinite solid.", estimated: geom === "slab" ? "The effect of the centre is of order e^{−1/(4Fo)}." : "The curvature correction is of order √Fo relative.", proved: null },
            validity: "Fo ≪ 1/4: the penetration depth 2√Fo is small compared with the size.",
          },
          {
            id: "large-fo", parameter: "Fo\\to\\infty", path: "Fo → ∞ at fixed Bi", fixed: "Bi", coupled: false, kind: "A mode expansion at late times",
            setup: `\\theta=\\sum_{n\\ge1}C_n f_n(\\lambda_nX)\\,e^{-\\lambda_n^{2}Fo},\\quad ${decl.acceptance.modes}`,
            orders: [{ n: 1, equation: "\\theta\\approx C_1 f_1(\\lambda_1 X)e^{-\\lambda_1^{2}Fo}", conditions: [], result: "\\text{relative error}\\sim\\frac{|C_2|}{C_1}e^{-(\\lambda_2^{2}-\\lambda_1^{2})Fo}", checks: null }],
            orderLoss: "The reduction keeps the order and both conditions: the one-mode solution satisfies the equation and both conditions exactly. It does not satisfy the initial condition.",
            inner: null,
            error: { formal: "The series converges for Fo > 0.", estimated: "The second mode estimates the error: |C₂/C₁| e^{−(λ₂² − λ₁²)Fo}.", proved },
            validity: "Fo large enough that the second mode has decayed: the map draws the boundary at the chosen tolerance.",
          },
        ],
        overlap: "Where two approximations both meet the tolerance, they differ by at most twice the tolerance (the triangle inequality). The inspection compares them at the point.",
        gaps: "Where no approximation meets the tolerance, only the full series is accurate: the map shades these points.",
      },
    };
  }

  /** The declaration's acceptance checks on its standard example: the mpmath references (tools/references.py). */
  function transientAcceptance(geom, decl, ctx) {
    const refs = (ctx.references?.conduction?.modes ?? []).filter((r) => r.geometry === geom);
    const out = [];
    let worstL = 0, worstC = 0, n = 0;
    for (const r of refs) {
      const list = H.modes(geom, r.Bi === "inf" ? Infinity : r.Bi, r.lambda.length);
      r.lambda.forEach((l, k) => { worstL = Math.max(worstL, Math.abs(list[k].lambda - l) / l); worstC = Math.max(worstC, Math.abs(list[k].C - r.C[k]) / Math.abs(r.C[k])); n++; });
    }
    if (refs.length) out.push({ id: "eigen", title: `Eigenvalues and coefficients against mpmath (${n} modes)`, passed: worstL < 1e-9 && worstC < 1e-9, status: "numerical", tolerance: "1e-9", detail: `Largest relative differences: ${worstL.toExponential(2)} for λ_n and ${worstC.toExponential(2)} for C_n.` });
    const temps = (ctx.references?.conduction?.temperatures ?? []).filter((r) => r.geometry === geom);
    let worstT = 0;
    for (const r of temps) {
      const s = H.series(geom, r.Bi, r.Fo, r.X);
      s.values.forEach((v, k) => { worstT = Math.max(worstT, Math.abs(v - r.theta[k])); });
    }
    if (temps.length) out.push({ id: "temperature", title: `Temperatures against mpmath (${temps.length} cases)`, passed: worstT < 1e-9, status: "numerical", tolerance: "1e-9", detail: `Largest absolute difference: ${worstT.toExponential(2)}.` });
    const early = H.series(geom, 1, 0.001, XS.filter((X) => X <= 0.5));
    const eErr = maxAbs(early.values.map((v) => v - 1));
    out.push({ id: "initial", title: "The series gives θ = 1 inside the solid at Fo = 0.001", passed: eErr < 1e-9, status: "numerical", tolerance: "1e-9", detail: `Largest difference from 1 at X ≤ 0.5: ${eErr.toExponential(2)}.` });
    const series = ctx.references?.conduction?.smallBi?.find((r) => r.geometry === geom);
    if (series) {
      const sb = A.smallBi(H.J[geom], 3);
      const same = series.C1.every((c, k) => c === sb.C1[k]) && series.mu.every((c, k) => c === sb.decay[k]);
      out.push({ id: "series", title: "The small-Bi expansion gives C₁ and λ₁² as SymPy's series of the eigenvalue equation", passed: same, status: "exact",
        detail: `C₁ = ${seriesText(sb.C1, "Bi")}. And λ₁²/${H.J[geom] ? `(${H.J[geom] + 1}Bi)` : "Bi"} = ${seriesText(["1", ...sb.decay.map((m) => Q.str(Q.neg(Q.parse(m))))], "Bi")}.` });
    }
    return out;
  }

  /* ---------- the lumped body against a spatial model ---------- */

  /** The comparison shape: Bi and Fo of the spatial model from Bi_c and Fo_c, and the spatial solution's range. */
  const SHAPES = {
    slab: { geom: "slab", n: 1, Lc: 1, label: "slab (L_c = L)" },
    cylinder: { geom: "cylinder", n: 1, Lc: 2, label: "long cylinder (L_c = R/2)" },
    sphere: { geom: "sphere", n: 1, Lc: 3, label: "sphere (L_c = R/3)" },
    cube: { geom: "slab", n: 3, Lc: 3, label: "cube (L_c = L/3 with L the half-side, as three slab solutions)" },
  };
  function lumped(decl, shapeName) {
    const shape = SHAPES[shapeName] ?? SHAPES.sphere;
    const spatial = (p) => ({ Bi: shape.Lc * p.Bi_c, Fo: p.Fo_c / (shape.Lc * shape.Lc) });
    /** The extreme values of the spatial θ over the solid: the cube is the product of three slab profiles. */
    function extremes(vals) {
      const lo = Math.min(...vals), hi = Math.max(...vals);
      return { lo: lo ** shape.n, hi: hi ** shape.n };
    }
    function evaluate(p) {
      if (!(p.Bi_c > 0) || !(p.Fo_c > 0)) return { ok: false, reason: "Bi_c and Fo_c must be positive." };
      const { Bi, Fo } = spatial(p);
      const ref = H.series(shape.geom, Bi, Fo, XS);
      if (!ref.ok) return { ok: false, reason: ref.reason };
      const ex = extremes(ref.values);
      if (ex.hi < EXCESS_FLOOR) return { ok: false, reason: "The temperature excess is below 10⁻¹² of its initial value, so the page cannot resolve the relative error." };
      const lump = Math.exp(-p.Bi_c * p.Fo_c);
      const outer = XS.map((X) => H.outerFirstValue(shape.geom, Bi, Fo, X));
      // Every θ between the extremes occurs somewhere in the solid, so the largest error is at an extreme.
      const errL = Math.max(Math.abs(lump - ex.lo), Math.abs(lump - ex.hi)) / ex.hi;
      let errO = 0;
      if (shape.n === 1) errO = outer.reduce((m, v, i) => Math.max(m, Math.abs(v - ref.values[i])), 0) / ex.hi;
      else {
        // The cube: the products of three slab values at every point of the 21 × 21 × 21 grid.
        const o = outer, sv = ref.values;
        for (let i = 0; i < o.length; i++) for (let k = 0; k < o.length; k++) {
          const a = o[i] * o[k], b = sv[i] * sv[k];
          for (let l = 0; l < o.length; l++) errO = Math.max(errO, Math.abs(a * o[l] - b * sv[l]));
        }
        errO /= ex.hi;
      }
      return { ok: true, values: { "err-lumped": errL, "err-outer": errO, "bal-surface": Bi * Math.min(1, 2 * Math.sqrt(Fo)) } };
    }
    const steps = ["s-rm-balance", "s-rm-asymptotic", "s-rm-map"];
    const layers = [
      approxLayer("lumped", "Lumped", "err-lumped", `the largest |e^{−Bi_c·Fo_c} − θ| in the solid ÷ the largest θ, ≤ the tolerance. The solid is a ${shape.label}`, steps),
      approxLayer("outer", "Outer, order 1", "err-outer", "the same measure for the order-1 outer expansion, ≤ the tolerance", steps, "lumped"),
      balanceLayer("surface", "Surface balance", "bal-surface", "internal drop ÷ surface excess ≈ Bi·min(1, 2√Fo) of the spatial model, an estimate",
        "Surface exchange controls: the internal drop is small (lumped)", "Internal conduction controls: the lumped assumption fails", steps, "proposed"),
    ];
    const approximations = [
      { id: "lumped", label: "Lumped", tex: "\\theta\\approx e^{-Bi_c\\,Fo_c}=e^{-t/\\tau_c}", limit: "Bi_c → 0 at fixed Bi_c·Fo_c", why: "The declared model itself.", error: "formal; the order-1 term estimates it" },
      { id: "outer", label: "Outer, order 1", tex: "\\theta\\approx e^{-T}\\left[1+Bi\\left(c+rT-\\frac{X^{2}}{2}\\right)\\right]", limit: "Bi_c → 0 at fixed Bi_c·Fo_c", why: "The first correction of the lumped model, from the spatial model.", error: "formal; the order-2 term estimates it" },
    ];
    return {
      id: decl.id, shape: shapeName in SHAPES ? shapeName : "sphere", params: decl.domain.parameters, axes: { x: "Bi_c", y: "Fo_c" }, approximations, layers, evaluate,
      limits: (p) => {
        const tau = p.Bi_c * p.Fo_c;
        const lo = decl.domain.parameters.find((x) => x.id === "Bi_c").min;
        return [{ id: "lumped-limit", label: `Bi_c → 0 with Bi_c·Fo_c = t/τ_c = ${num(tau)} fixed`, coupled: true, approx: "lumped", note: "Along this coupled path the spatial model tends to the lumped model while the body still cools. At fixed Fo_c both tend to θ = 1.",
          points: Array.from({ length: 25 }, (_, i) => { const b = p.Bi_c * (lo / p.Bi_c) ** (i / 24); return { Bi_c: b, Fo_c: tau / b }; }) }];
      },
      inspect: (p, ctx) => {
        const { Bi, Fo } = spatial(p);
        const ref = H.series(shape.geom, Bi, Fo, XP);
        if (!ref.ok) return { ok: false, reason: ref.reason };
        const tau = p.Bi_c * p.Fo_c;
        const lump = Math.exp(-tau);
        const recon = ctx.reconstruct ? [ctx.reconstruct("Bi_c", p.Bi_c), ctx.reconstruct("Fo_c", p.Fo_c)].filter(Boolean) : [];
        return {
          ok: true,
          profile: (() => {
            // The cube: along the line from its centre to the centre of a face, θ = θ_s(X) θ_s(0)².
            const along = (vals) => (shape.n === 3 ? vals.map((v) => v * vals[0] * vals[0]) : vals);
            const outer = XP.map((X) => H.outerFirstValue(shape.geom, Bi, Fo, X));
            return { xs: XP, curves: { exact: along(ref.values).map(num), lumped: XP.map(() => num(lump)), outer: along(outer).map(num) },
              note: shape.n === 3 ? "The profile runs from the centre of the cube to the centre of a face. On that line θ is the slab profile times the square of its centre value." : "" };
          })(),
          values: [
            { id: "tau", tex: "t/\\tau_c=Bi_c\\,Fo_c", label: "time in decay times", value: num(tau) },
            { id: "lumped", tex: "e^{-t/\\tau_c}", label: "θ of the lumped model", value: num(lump) },
            { id: "centre", tex: "\\theta_{\\text{spatial}}(0)", label: `θ at the centre of the ${shape.label}`, value: num(ref.values[0] ** shape.n) },
            { id: "Bi", tex: "Bi", label: shape.n === 3 ? "Biot number hL/k of each slab, with L the half-side" : "Biot number of the spatial model, with its half-thickness or radius", value: num(Bi) },
          ],
          checks: [],
          reconstruction: [...recon, ...(ctx.temperature ? [{ id: "T-lumped", tex: "T(t)", label: "temperature of the lumped model", value: ctx.temperature(lump), unit: "K" }] : [])],
        };
      },
      derived: (p) => [
        { id: "tau", tex: "t/\\tau_c=Bi_c\\,Fo_c", label: "time in decay times", value: num(p.Bi_c * p.Fo_c) },
        { id: "Bi", tex: "Bi", label: shape.n === 3 ? "Biot number hL/k of each slab, with L the half-side" : `Biot number of the ${shape.geom === "slab" ? "slab, with its half-thickness" : `${shape.geom === "cylinder" ? "long cylinder" : "sphere"}, with its radius`}`, value: num(spatial(p).Bi) },
        { id: "Fo", tex: "Fo", label: shape.n === 3 ? "Fourier number αt/L² of each slab" : "Fourier number of the spatial model", value: num(spatial(p).Fo) },
      ],
      constraints: (p) => [...(p.Bi_c > 0 ? [] : ["Bi_c must be positive."]), ...(p.Fo_c > 0 ? [] : ["Fo_c must be positive."])],
      analysis: () => {
        const base = transientAnalysis(SHAPES[shapeName]?.geom ?? "sphere", decl);
        return { ...base, note: `The lumped model is order 0 of the small-Bi expansion of the ${shape.label}. The derivation is the same as for the transient declarations, with Bi = ${shape.Lc}Bi_c and Fo = Fo_c/${shape.Lc * shape.Lc}.` };
      },
      acceptance: (ctx) => lumpedAcceptance(decl, ctx),
    };
  }
  function lumpedAcceptance(decl, ctx) {
    const out = [];
    const tc = ctx.exact?.("C*V/(h*A_s)");
    if (tc) out.push({ id: "decay-time", title: "The decay time ρc_pV/(hA_s) from the record's values", passed: Boolean(tc.exact), status: tc.exact ? "exact" : "numerical", detail: `τ_c = ${tc.exact ?? num(tc.float)} s.` });
    // θ = e^{−τ} solves θ_τ = −θ with θ(0) = 1: ∂_τ e^{−τ} + e^{−τ} = 0, in the canonical forms of src/asymptotic.js.
    const one = A.poly([[0, 0, Q.ONE]]);
    out.push({ id: "decay", title: "θ = e^{−τ} solves θ_τ = −θ with θ(0) = 1", passed: A.add(A.dT(one), one).size === 0, status: "exact", detail: "∂_τ e^{−τ} + e^{−τ} = 0 in canonical form, and e^{0} = 1." });
    const errs = [0.01, 0.001, 0.0001].map((b) => {
      const s = H.series("slab", b, 1 / b, XS);
      return Math.max(...s.values.map((v) => Math.abs(v - Math.exp(-1)))) / Math.max(...s.values);
    });
    out.push({ id: "limit", title: "The lumped error against the slab goes to 0 as Bi → 0 with Bi·Fo = 1", passed: errs[0] > errs[1] && errs[1] > errs[2] && errs[2] < 1e-3, status: "numerical", tolerance: "1e-3 at Bi = 10⁻⁴",
      detail: `Errors ${errs.map((e) => e.toExponential(2)).join(", ")} at Bi = 0.01, 0.001 and 0.0001.` });
    return out;
  }

  /* ---------- the slab with a uniform source ---------- */

  function slabSource(decl) {
    const evaluate = (p) => (p.Bi > 0 && p.Gamma > 0 ? { ok: true, values: { "err-uniform": p.Bi / (p.Bi + 2), "err-surface-temperature": 2 / (p.Bi + 2), "bal-source": p.Bi / 2 } } : { ok: false, reason: "Bi and Γ must be positive." });
    const steps = ["s-rm-balance", "s-rm-asymptotic", "s-rm-map"];
    const layers = [
      { ...approxLayer("uniform", "Uniform temperature", "err-uniform", "|θ_max − Γ/Bi| ÷ θ_max = Bi/(Bi + 2), exact, ≤ the tolerance", steps), status: "exact" },
      { ...approxLayer("surface-temperature", "Surface temperature", "err-surface-temperature", "|θ_max − Γ/2| ÷ θ_max = 2/(Bi + 2), exact, ≤ the tolerance", steps), status: "exact" },
      balanceLayer("source", "Source balance", "bal-source", "internal drop ÷ surface excess = (Γ/2) ÷ (Γ/Bi) = Bi/2, exact", "The surface film controls: the temperature is nearly uniform", "Conduction controls: the surface is near the fluid temperature", steps),
    ];
    const approximations = [
      { id: "uniform", label: "Uniform temperature", tex: "\\theta\\approx\\frac{\\Gamma}{Bi}", limit: "Bi → 0", why: "The surface film takes all of the temperature rise.", error: "exact error Bi/(Bi + 2): the expansion stops after two terms" },
      { id: "surface-temperature", label: "Surface temperature", tex: "\\theta\\approx\\frac{\\Gamma}{2}(1-X^{2})", limit: "Bi → ∞", why: "The surface takes the fluid temperature.", error: "exact error 2/(Bi + 2)" },
    ];
    return {
      id: decl.id, params: decl.domain.parameters, axes: { x: "Bi", y: null }, approximations, layers, evaluate,
      limits: (p) => [
        { id: "small-bi", label: "Bi → 0 at fixed Γ", coupled: false, approx: "uniform", note: "θ_max ≈ Γ/Bi grows without bound: the uniform temperature holds, and θ_max can become more than 1, the allowed rise.", points: [p, { ...p, Bi: decl.domain.parameters[0].min }] },
        { id: "large-bi", label: "Bi → ∞ at fixed Γ", coupled: false, approx: "surface-temperature", note: "θ_max → Γ/2.", points: [p, { ...p, Bi: decl.domain.parameters[0].max }] },
      ],
      inspect: (p, ctx) => {
        const exact = ctx.exactPoint && ctx.exactPoint.Bi && ctx.exactPoint.Gamma && Math.abs(Q.toNumber(Q.parse(ctx.exactPoint.Bi)) - p.Bi) < 1e-15 * p.Bi && Math.abs(Q.toNumber(Q.parse(ctx.exactPoint.Gamma)) - p.Gamma) < 1e-15 * p.Gamma;
        const values = [];
        const checks = [];
        if (exact) {
          const s = H.source(Q.parse(ctx.exactPoint.Gamma), Q.parse(ctx.exactPoint.Bi));
          values.push({ id: "max", tex: "\\theta_{\\max}=\\theta(0)", label: "the largest θ, at the centre (exact)", value: num(Q.toNumber(s.centre)), exact: Q.str(s.centre) });
          values.push({ id: "surface", tex: "\\theta(1)=\\Gamma/Bi", label: "θ at the surface (exact)", value: num(Q.toNumber(s.surface)), exact: Q.str(s.surface) });
          values.push({ id: "ratio", tex: "\\frac{\\Gamma/2}{\\Gamma/Bi}", label: "internal drop ÷ surface excess (exact)", value: num(Q.toNumber(s.ratio)), exact: Q.str(s.ratio) });
          checks.push({ id: "balance", title: "Heat balance: the source Γ leaves through the surface as Bi θ(1)", passed: Q.eq(s.flux, s.exchange), status: "exact", detail: `Γ = ${Q.str(s.flux)} and Bi θ(1) = ${Q.str(s.exchange)}.` });
          checks.push({ id: "allowance", title: "θ_max ≤ 1: the plate stays inside the reference rise", passed: Q.cmp(s.centre, Q.ONE) <= 0, status: "exact", detail: `θ_max = ${Q.str(s.centre)}.` });
        } else {
          const tmax = p.Gamma * (0.5 + 1 / p.Bi);
          values.push({ id: "max", tex: "\\theta_{\\max}", label: "the largest θ, at the centre", value: num(tmax) });
          values.push({ id: "ratio", tex: "Bi/2", label: "internal drop ÷ surface excess", value: num(p.Bi / 2) });
        }
        const recon = ctx.reconstruct ? [ctx.reconstruct("Bi", p.Bi), ctx.reconstruct("Gamma", p.Gamma)].filter(Boolean) : [];
        const tmax = p.Gamma * (0.5 + 1 / p.Bi);
        return { ok: true, profile: { xs: XP, curves: { exact: XP.map((X) => num(p.Gamma * ((1 - X * X) / 2 + 1 / p.Bi))), uniform: XP.map(() => num(p.Gamma / p.Bi)), "surface-temperature": XP.map((X) => num(p.Gamma * (1 - X * X) / 2)) } },
          values, checks, reconstruction: [...recon, ...(ctx.temperature ? [{ id: "T-max", tex: "T_{\\max}", label: "largest temperature", value: ctx.temperature(tmax), unit: "K" }] : [])] };
      },
      derived: (p) => [{ id: "theta-max", tex: "\\theta_{\\max}=\\Gamma\\left(\\frac{1}{2}+\\frac{1}{Bi}\\right)", label: "largest θ", value: num(p.Gamma * (0.5 + 1 / p.Bi)) }],
      constraints: (p) => [...(p.Bi > 0 ? [] : ["Bi must be positive."]), ...(p.Gamma > 0 ? [] : ["Γ must be positive."])],
      analysis: () => sourceAnalysis(), acceptance: (ctx) => sourceAcceptance(ctx),
      exactBoundaries: (tol) => { const t = Q.parse(String(tol)); return { uniform: Q.str(Q.div(Q.mul(Q.q(2), t), Q.sub(Q.ONE, t))), "surface-temperature": Q.str(Q.div(Q.mul(Q.q(2), Q.sub(Q.ONE, t)), t)), source: "2" }; },
    };
  }
  function sourceAnalysis() {
    return {
      balance: {
        estimated: false, intro: "The balance compares two exact terms: the internal drop and the surface excess.",
        terms: [
          { id: "drop", tex: "\\theta(0)-\\theta(1)=\\frac{\\Gamma}{2}", label: "internal drop", scale: "\\frac{\\Gamma}{2}", why: "Integrate θ_XX = −Γ twice with θ_X(0) = 0: exact." },
          { id: "excess", tex: "\\theta(1)=\\frac{\\Gamma}{Bi}", label: "surface excess", scale: "\\frac{\\Gamma}{Bi}", why: "The surface condition with −θ_X(1) = Γ: exact." },
        ],
        balances: [
          { id: "film", region: "source:low", title: "The surface film controls", when: "Bi\\ll 2", derivation: "The ratio of the drop to the excess is Bi/2 exactly.", reduced: "\\theta=\\frac{\\Gamma}{Bi}", neglected: "the internal drop Γ/2", assumptions: [],
            residual: { tex: "\\vartheta=\\frac{Bi\\,\\theta}{\\Gamma}:\\ \\vartheta''+Bi=Bi", order: "O(Bi)", status: "exact", note: "In the scaled variable ϑ = Bi θ/Γ the uniform solution ϑ = 1 leaves the residual Bi in the equation." } },
          { id: "conduction", region: "source:high", title: "Conduction controls", when: "Bi\\gg 2", derivation: "Then the excess is small and the surface is near the fluid temperature.", reduced: "\\theta=\\frac{\\Gamma}{2}(1-X^{2})", neglected: "the surface excess Γ/Bi", assumptions: [],
            residual: { tex: "-\\theta'(1)-Bi\\,\\theta(1)=\\Gamma", order: "O(1/Bi) relative", status: "exact", note: "The reduced solution has θ(1) = 0, so the surface condition (1/Bi)(−θ') = θ leaves the residual Γ/Bi." } },
        ],
        crossovers: [{ id: "source", criterion: "\\frac{Bi}{2}=1", text: "Bi = 2 exactly. The region 0.2 < Bi < 20 has comparable terms.", status: "exact" }],
        note: "The crossover at Bi = 2 is exact, because both terms are exact. It is still a balance crossover, not a transition.",
      },
      asymptotic: {
        limits: [
          { id: "small-bi", parameter: "Bi\\to 0", path: "Bi → 0 at fixed Γ", fixed: "Γ", coupled: false, kind: "A regular expansion that stops after two terms",
            setup: "\\theta=\\frac{\\Gamma}{Bi}\\vartheta,\\quad \\vartheta''=-Bi,\\quad -\\vartheta'(1)=Bi\\,\\vartheta(1)",
            orders: [{ n: 0, equation: "\\vartheta_0''=0", conditions: ["\\vartheta_0'(0)=0", "-\\vartheta_0'(1)=0"], result: "\\vartheta_0=1", checks: null },
              { n: 1, equation: "\\vartheta_1''=-1", conditions: ["\\vartheta_1'(0)=0", "-\\vartheta_1'(1)=\\vartheta_0(1)=1"], result: "\\vartheta_1=\\frac{1-X^{2}}{2}", checks: null }],
            orderLoss: "The reduction keeps the order of the equation and both conditions.", inner: null,
            error: { formal: "The expansion stops after order 1.", estimated: "None needed.", proved: "θ = Γ/Bi + Γ(1 − X²)/2 exactly, so the uniform model's relative error is Bi/(Bi + 2) at the centre." },
            validity: "Every Bi > 0: the two-term result is exact." },
          { id: "large-bi", parameter: "Bi\\to\\infty", path: "Bi → ∞ at fixed Γ", fixed: "Γ", coupled: false, kind: "A regular expansion that stops after two terms",
            setup: "\\frac{1}{Bi}(-\\theta'(1))=\\theta(1)",
            orders: [{ n: 0, equation: "\\theta_0''=-\\Gamma", conditions: ["\\theta_0'(0)=0", "\\theta_0(1)=0"], result: "\\theta_0=\\frac{\\Gamma}{2}(1-X^{2})", checks: null },
              { n: 1, equation: "\\theta_1''=0", conditions: ["\\theta_1'(0)=0", "\\theta_1(1)=-\\theta_0'(1)=\\Gamma"], result: "\\theta_1=\\Gamma", checks: null }],
            orderLoss: "The reduction keeps the order of the equation and both conditions. Only the surface condition changes, from Robin to Dirichlet.", inner: null,
            error: { formal: "The expansion stops after order 1.", estimated: "None needed.", proved: "The relative error of the surface-temperature model is 2/(Bi + 2) exactly." },
            validity: "Every Bi > 0." },
        ],
        overlap: "Both approximations meet a tolerance t only when Bi/(Bi + 2) ≤ t and 2/(Bi + 2) ≤ t. That needs t ≥ 1/2, so at a smaller tolerance they never overlap.",
        gaps: "Between the two exact boundaries, no approximation meets the tolerance: only the exact solution is accurate there.",
      },
    };
  }
  function sourceAcceptance(ctx) {
    const out = [];
    const ref = ctx.references?.conduction?.source;
    if (ref) {
      const s = H.source(Q.parse(ref.Gamma), Q.parse(ref.Bi));
      const same = ref.values.every(([X, v]) => Q.eq(s.at(Q.parse(X)), Q.parse(v)));
      out.push({ id: "sympy", title: `SymPy's solution at Γ = ${ref.Gamma}, Bi = ${ref.Bi}`, passed: same, status: "exact", detail: `θ at X = ${ref.values.map((x) => x[0]).join(", ")} agrees exactly.` });
    }
    const s = H.source(Q.q(1, 5), Q.q(1, 2));
    out.push({ id: "balance", title: "Heat balance Γ = Bi θ(1)", passed: Q.eq(s.flux, s.exchange), status: "exact", detail: `At Γ = 1/5 and Bi = 1/2: Γ = ${Q.str(s.flux)}, Bi θ(1) = ${Q.str(s.exchange)}.` });
    out.push({ id: "crossover", title: "The balance crossover is at Bi = 2 exactly", passed: Q.eq(H.source(Q.ONE, Q.q(2)).ratio, Q.ONE), status: "exact", detail: "(Γ/2)/(Γ/Bi) = Bi/2 = 1 at Bi = 2." });
    return out;
  }

  /* ---------- the two-layer wall ---------- */

  function multilayer(decl) {
    const parts = (p) => [1 / p.Bi_1, 1, p.r_c, p.ell / p.kappa, 1 / p.Bi_2];
    function evaluate(p) {
      if (!["r_c", "kappa", "ell", "Bi_1", "Bi_2"].every((k) => p[k] > 0)) return { ok: false, reason: "Every parameter must be positive." };
      const R = parts(p), tot = R.reduce((a, b) => a + b, 0);
      const others = Math.max(R[0], R[1], R[3], R[4]);
      const films = R[0] + R[4];
      return { ok: true, values: {
        "err-perfect-contact": p.r_c / (tot - p.r_c), "err-contact-only": (tot - p.r_c) / p.r_c, "err-no-films": films / (tot - films),
        "bal-contact": p.r_c / others, "bal-films": films / (tot - films),
      } };
    }
    const steps = ["s-rm-balance", "s-rm-asymptotic", "s-rm-map"];
    const layers = [
      { ...approxLayer("perfect-contact", "Perfect contact", "err-perfect-contact", "|q(r_c = 0) − q| ÷ q = r_c/(R_tot − r_c), exact, ≤ the tolerance", steps), status: "exact" },
      { ...approxLayer("contact-only", "Contact only", "err-contact-only", "|q(only R_c) − q| ÷ q = (R_tot − r_c)/r_c, exact, ≤ the tolerance", steps), status: "exact" },
      { ...approxLayer("no-films", "No surface films", "err-no-films", "|q(no films) − q| ÷ q = (1/Bi₁ + 1/Bi₂)/(R_tot − 1/Bi₁ − 1/Bi₂), exact, ≤ the tolerance", steps), status: "exact" },
      balanceLayer("contact", "Contact balance", "bal-contact", "contact resistance ÷ the largest other resistance = r_c ÷ max(1/Bi₁, 1, ℓ/κ, 1/Bi₂), exact", "Another resistance controls the heat flow", "The contact controls the heat flow", steps),
      balanceLayer("films", "Film balance", "bal-films", "film resistances ÷ solid resistances = (1/Bi₁ + 1/Bi₂) ÷ (1 + r_c + ℓ/κ), exact", "The solid parts control the heat flow", "The surface films control the heat flow", steps),
    ];
    const approximations = [
      { id: "perfect-contact", label: "Perfect contact", tex: "q^{*}\\approx\\frac{1}{R^{*}-r_c}", limit: "r_c → 0", why: "The contact resistance is neglected: T_1 = T_2 at the interface.", error: "exact error r_c/(R* − r_c)" },
      { id: "contact-only", label: "Contact only", tex: "q^{*}\\approx\\frac{1}{r_c}", limit: "r_c → ∞", why: "The contact takes all of the temperature difference.", error: "exact error (R* − r_c)/r_c" },
      { id: "no-films", label: "No surface films", tex: "q^{*}\\approx\\frac{1}{1+r_c+\\ell/\\kappa}", limit: "Bi₁, Bi₂ → ∞", why: "The faces take the fluid temperatures.", error: "exact error (1/Bi₁ + 1/Bi₂)/(1 + r_c + ℓ/κ)" },
    ];
    return {
      id: decl.id, params: decl.domain.parameters, axes: { x: "r_c", y: "kappa" }, approximations, layers, evaluate,
      limits: (p) => [
        { id: "perfect", label: "r_c → 0 at fixed κ, ℓ, Bi₁, Bi₂", coupled: false, approx: "perfect-contact", note: "The temperature jump q R_c goes to 0, and the heat flux tends to its perfect-contact value.", points: [p, { ...p, r_c: decl.domain.parameters[0].min }] },
        { id: "insulating", label: "r_c → ∞ at fixed κ, ℓ, Bi₁, Bi₂", coupled: false, approx: "contact-only", note: "The heat flux falls like 1/r_c, and almost all of the temperature difference is across the contact.", points: [p, { ...p, r_c: decl.domain.parameters[0].max }] },
      ],
      inspect: (p, ctx) => {
        const R = parts(p), tot = R.reduce((a, b) => a + b, 0);
        const labels = ["the film at face 1", "layer 1", "the contact", "layer 2", "the film at face 2"];
        let th = 1;
        const nodes = [{ at: "fluid 1", theta: 1 }];
        R.forEach((r, i) => { th -= r / tot; nodes.push({ at: `after ${labels[i]}`, theta: num(th) }); });
        const out = { ok: true, values: [
          { id: "q", tex: "q^{*}=\\frac{qL_1}{k_1\\,\\Delta T}=\\frac{1}{R^{*}}", label: "dimensionless heat flux", value: num(1 / tot) },
          { id: "jump", tex: "\\theta_1-\\theta_2=r_c\\,q^{*}", label: "temperature jump across the contact", value: num(p.r_c / tot) },
          ...R.map((r, i) => ({ id: `R-${i}`, tex: ["R^{*}_{f1}=\\frac{1}{Bi_1}", "R^{*}_{1}=1", "R^{*}_{c}=r_c", "R^{*}_{2}=\\frac{\\ell}{\\kappa}", "R^{*}_{f2}=\\frac{1}{Bi_2}"][i],
            label: `resistance of ${labels[i]} in units of L₁/k₁: ${Number((100 * r / tot).toPrecision(3))} % of the total`, value: num(r) })),
        ], nodes, checks: [], reconstruction: [] };
        const w = wallOf(ctx);
        if (w && ctx.atRecord) {
          const m = H.multilayer(w);
          const same = m.fluxes.every((f) => Q.eq(f.q, m.q));
          out.checks.push({ id: "continuity", title: "The heat flux is the same in each layer and through the contact", passed: same && Q.eq(Q.div(m.parts[2].drop, m.parts[2].R), m.q), status: "exact", detail: `q = ${Q.str(m.q)} W/m² in each layer and across the contact.` });
          out.checks.push({ id: "jump", title: "The temperature jump across the contact is q R_c", passed: Q.eq(m.parts[2].drop, Q.mul(m.q, w.contacts[0])), status: "exact", detail: `ΔT_c = ${Q.str(m.parts[2].drop)} K.` });
          out.checks.push({ id: "closure", title: "The temperatures close at fluid 2", passed: m.closes, status: "exact", detail: `The sum of the drops is ${Q.str(m.parts.reduce((s, x) => Q.add(s, x.drop), Q.ZERO))} K = T_∞1 − T_∞2.` });
          out.reconstruction.push({ id: "q", tex: "q", label: "heat flux (exact)", value: Q.toNumber(m.q), exact: Q.str(m.q), unit: "W/m^2" });
          out.reconstruction.push({ id: "jump", tex: "\\Delta T_c", label: "temperature jump at the contact (exact)", value: Q.toNumber(m.parts[2].drop), exact: Q.str(m.parts[2].drop), unit: "K" });
        }
        if (ctx.reconstruct) out.reconstruction.unshift(...["r_c", "kappa"].map((k) => ctx.reconstruct(k, p[k])).filter(Boolean));
        return out;
      },
      derived: (p) => { const R = parts(p), tot = R.reduce((a, b) => a + b, 0); return [
        { id: "R", tex: "R^{*}=\\frac{1}{Bi_1}+1+r_c+\\frac{\\ell}{\\kappa}+\\frac{1}{Bi_2}", label: "total resistance in units of L₁/k₁", value: num(tot) },
        { id: "share", tex: "r_c/R^{*}", label: "share of the contact", value: num(p.r_c / tot) },
      ]; },
      constraints: (p) => ["r_c", "kappa", "ell", "Bi_1", "Bi_2"].filter((k) => !(p[k] > 0)).map((k) => `${k} must be positive.`),
      analysis: () => multilayerAnalysis(), acceptance: (ctx) => multilayerAcceptance(ctx),
    };
  }
  /** The record's wall in exact SI rationals for src/heat.js, or null when a value is missing or not exact. */
  function wallOf(ctx) {
    const v = (id) => ctx.role?.(id)?.exact ?? null;
    const ids = ["k_1", "k_2", "L_1", "L_2", "R_c", "h_1", "h_2", "T_inf1", "T_inf2"];
    if (ids.some((id) => !v(id))) return null;
    return { h1: v("h_1"), Tinf1: v("T_inf1"), layers: [{ L: v("L_1"), k: v("k_1") }, { L: v("L_2"), k: v("k_2") }], contacts: [v("R_c")], h2: v("h_2"), Tinf2: v("T_inf2") };
  }
  function multilayerAnalysis() {
    return {
      balance: {
        estimated: false, intro: "The balance compares the exact temperature drops across the five elements of the wall.",
        terms: [
          { id: "drops", tex: "\\Delta\\theta_i=q^{*}R^{*}_i", label: "temperature drop across element i", scale: "R^{*}_i/R^{*}", why: "Each element carries the same heat flux, so its share of the temperature difference is its share of the resistance: exact." },
        ],
        balances: [
          { id: "contact-controls", region: "contact:high", title: "The contact controls", when: "r_c\\gg\\max(1/Bi_1,1,\\ell/\\kappa,1/Bi_2)", derivation: "The largest drop is across the contact.", reduced: "q^{*}\\approx\\frac{1}{r_c}", neglected: "every other resistance", assumptions: [],
            residual: { tex: "\\frac{q^{*}_{\\text{red}}-q^{*}}{q^{*}}=\\frac{R^{*}-r_c}{r_c}", order: "O(1/r_c)", status: "exact", note: "The relative error is (R* − r_c)/r_c exactly." } },
          { id: "others-control", region: "contact:low", title: "Another resistance controls", when: "r_c\\ll\\max(1/Bi_1,1,\\ell/\\kappa,1/Bi_2)", derivation: "The contact drop is small.", reduced: "q^{*}\\approx\\frac{1}{R^{*}-r_c}", neglected: "the contact resistance", assumptions: ["Perfect contact: T_1 = T_2 at the interface."],
            residual: { tex: "\\frac{q^{*}_{\\text{red}}-q^{*}}{q^{*}}=\\frac{r_c}{R^{*}-r_c}", order: "O(r_c)", status: "exact", note: "The relative error is r_c/(R* − r_c) exactly." } },
        ],
        crossovers: [
          { id: "contact", criterion: "r_c=\\max(1/Bi_1,1,\\ell/\\kappa,1/Bi_2)", text: "The contact equals the largest other resistance. Each resistance ratio is exact.", status: "exact" },
          { id: "films", criterion: "1/Bi_1+1/Bi_2=1+r_c+\\ell/\\kappa", text: "The films equal the solid parts.", status: "exact" },
        ],
        note: "These crossovers compare exact drops. They mark comparable terms, not a transition.",
      },
      asymptotic: {
        limits: [
          { id: "small-rc", parameter: "r_c\\to 0", path: "r_c → 0 at fixed κ, ℓ, Bi₁, Bi₂", fixed: "κ, ℓ, Bi₁ and Bi₂", coupled: false, kind: "A convergent series in r_c/R₀, with R₀ = R* − r_c",
            setup: "q^{*}=\\frac{1}{R_0+r_c},\\quad R_0=R^{*}-r_c", orders: [{ n: 0, equation: "q^{*}_0=\\frac{1}{R_0}", conditions: [], result: "q^{*}=\\frac{1}{R_0}\\sum_{n\\ge0}\\left(-\\frac{r_c}{R_0}\\right)^{n}", checks: null }],
            orderLoss: "The interface condition θ₁ − θ₂ = r_c q* becomes continuity of temperature. The reduction keeps the order of each equation.", inner: null,
            error: { formal: "A geometric series.", estimated: "The first neglected term.", proved: "|q*_0 − q*|/q* = r_c/R₀ exactly." }, validity: "The series converges for r_c < R₀. The exact formula holds for every r_c." },
          { id: "large-rc", parameter: "r_c\\to\\infty", path: "r_c → ∞ at fixed κ, ℓ, Bi₁, Bi₂", fixed: "κ, ℓ, Bi₁ and Bi₂", coupled: false, kind: "A convergent series in R₀/r_c",
            setup: "q^{*}=\\frac{1}{r_c}\\frac{1}{1+R_0/r_c}", orders: [{ n: 0, equation: "q^{*}_0=\\frac{1}{r_c}", conditions: [], result: "q^{*}=\\frac{1}{r_c}\\sum_{n\\ge0}\\left(-\\frac{R_0}{r_c}\\right)^{n}", checks: null }],
            orderLoss: "The contact takes all of the temperature difference. Layer 1 takes the temperature of fluid 1 and layer 2 that of fluid 2, and q* = 1/r_c. The reduction keeps the order of each equation.", inner: null,
            error: { formal: "A geometric series.", estimated: "The first neglected term.", proved: "|q*_0 − q*|/q* = R₀/r_c exactly." }, validity: "Any r_c > 0 for the exact formula." },
        ],
        overlap: "Perfect contact and contact only cannot both meet a tolerance below 1: the product of their errors is 1.",
        gaps: "Where no approximation meets the tolerance, use the full resistance sum: it is exact everywhere.",
      },
    };
  }
  function multilayerAcceptance(ctx) {
    const out = [];
    const ref = ctx.references?.conduction?.multilayer;
    const w = wallOf(ctx);
    if (w) {
      const m = H.multilayer(w);
      out.push({ id: "continuity", title: "The heat flux is the same in each layer and through the contact", passed: m.fluxes.every((f) => Q.eq(f.q, m.q)), status: "exact", detail: `q = ${Q.str(m.q)} W/m².` });
      out.push({ id: "jump", title: "The jump across the contact is q R_c and the temperatures close", passed: Q.eq(m.parts[2].drop, Q.mul(m.q, w.contacts[0])) && m.closes, status: "exact", detail: `ΔT_c = ${Q.str(m.parts[2].drop)} K.` });
      if (ref) {
        const same = Q.eq(m.q, Q.parse(ref.q)) && ref.nodes.every((t, i) => Q.eq(m.nodes[i + 1].T, Q.parse(t)));
        out.push({ id: "sympy", title: "SymPy's solution of the linear system", passed: same, status: "exact", detail: `q = ${ref.q} W/m² and the ${ref.nodes.length} node temperatures agree exactly.` });
      }
    }
    return out;
  }

  /* ---------- the straight fin ---------- */

  function fin(decl, tip) {
    const convective = tip === "convective";
    const betaOf = (p) => (convective ? p.lambda / p.aspect : 0);
    function evaluate(p) {
      if (!(p.lambda > 0) || !(p.aspect > 0)) return { ok: false, reason: "λ and PL/A_c must be positive." };
      const beta = betaOf(p);
      const f = H.fin(p.lambda, beta);
      const short = p.lambda * p.lambda + beta * p.lambda;
      const values = { "err-short": Math.abs(short - f.Q) / f.Q, "err-long": Math.abs(p.lambda - f.Q) / f.Q, "bal-axial": p.lambda * p.lambda, "bal-transverse": (p.lambda / p.aspect) ** 2 / 2 };
      if (convective) values["err-insulated"] = Math.abs(H.fin(p.lambda, 0).Q - f.Q) / f.Q;
      return { ok: true, values };
    }
    const steps = ["s-rm-balance", "s-rm-asymptotic", "s-rm-map"];
    const layers = [
      approxLayer("short", "Short fin", "err-short", "|Q*(θ = 1) − Q*| ÷ Q*: the whole fin at the base temperature, ≤ the tolerance", steps),
      approxLayer("long", "Long fin", "err-long", "|λ − Q*| ÷ Q*: a fin of infinite length, ≤ the tolerance", steps),
      ...(convective ? [approxLayer("insulated", "Insulated tip", "err-insulated", "|Q*(β = 0) − Q*| ÷ Q*, ≤ the tolerance", steps)] : []),
      balanceLayer("axial", "Axial balance", "bal-axial", "surface loss ÷ axial conduction ≈ λ² = hPL²/(kA_c), an estimate: the loss term λ²θ against θ_XX over the fin length", "Axial conduction controls: the fin is nearly at the base temperature", "Loss and conduction balance in a layer of length 1/λ at the base", steps, "proposed"),
      { id: "transverse", kind: "balance", boundary: "balance-crossover", title: "Transverse balance", measure: "bal-transverse", scale: "log", status: "proposed", steps, evidence: ["spec-8", "spec-10"],
        criterion: "Bi_⊥/2 with Bi_⊥ = hA_c/(kP) = (λ/(PL/A_c))²: the temperature drop across the fin over its surface excess, for a plate fin",
        thresholds: (tol) => ({ curves: [{ value: tol, label: `transverse estimate = ${tol}` }, { value: 1, label: "transverse drop = surface excess" }],
          regions: [{ id: "low", label: "The 1D model holds within the tolerance (estimate)", lo: 0, hi: tol }, { id: "band", label: "The transverse drop is not negligible", lo: tol, hi: 1 }, { id: "high", label: "Transverse conduction controls: the 1D model fails", lo: 1, hi: null }] }) },
    ];
    const approximations = [
      { id: "short", label: "Short fin", tex: "Q^{*}\\approx\\lambda^{2}" + (convective ? "+\\beta\\lambda" : "") + ",\\ \\eta_f\\approx 1", limit: "λ → 0", why: "Order 0 of the small-λ expansion: the fin stays at the base temperature.", error: "proved: λ² − λ⁴/3 ≤ λ tanh λ ≤ λ² for the insulated tip" },
      { id: "long", label: "Long fin", tex: "Q^{*}\\approx\\lambda,\\ \\theta\\approx e^{-\\lambda X}", limit: "λ → ∞", why: "The boundary layer at the base: the tip does not matter.", error: "proved: |λ tanh λ − λ| ≤ 2λe^{−2λ} for the insulated tip" },
      ...(convective ? [{ id: "insulated", label: "Insulated tip", tex: "Q^{*}\\approx\\lambda\\tanh\\lambda", limit: "β → 0", why: "The tip loss is neglected.", error: "measured" }] : []),
    ];
    return {
      id: decl.id, tip, params: decl.domain.parameters, axes: { x: "lambda", y: null }, approximations, layers, evaluate,
      limits: (p) => [
        { id: "short", label: `λ → 0 at PL/A_c = ${num(p.aspect)}`, coupled: false, approx: "short", note: "A regular limit: the fin efficiency tends to 1.", points: [p, { ...p, lambda: decl.domain.parameters[0].min }] },
        { id: "long", label: `λ → ∞ at PL/A_c = ${num(p.aspect)}`, coupled: false, approx: "long",
          note: "The transverse estimate (λ/(PL/A_c))²/2 grows like λ², so at fixed geometry the long-fin limit leaves the 1D model. The 1D model holds only while PL/A_c ≥ λ/√(2 × tolerance), a validity condition that couples λ and PL/A_c.",
          points: [p, { ...p, lambda: decl.domain.parameters[0].max }] },
      ],
      inspect: (p, ctx) => {
        const f = H.fin(p.lambda, betaOf(p));
        // The base heat flow against the total surface loss: ∫ λ²θ dX + βλ θ(1), by Gauss–Legendre.
        const loss = SF.gauss((X) => p.lambda * p.lambda * f.at(X), 0, 1) + betaOf(p) * p.lambda * f.tip;
        const balErr = Math.abs(loss - f.Q) / f.Q;
        const recon = ctx.reconstruct ? [ctx.reconstruct("lambda", p.lambda), ctx.reconstruct("aspect", p.aspect)].filter(Boolean) : [];
        const r = (id) => ctx.role?.(id)?.float;
        const heat = [r("k"), r("A_c"), r("T_b"), r("T_inf"), r("L")].every(Number.isFinite)
          ? { id: "Q-dot", tex: "\\dot Q", label: "heat flow at the base", value: f.Q * r("k") * r("A_c") * (r("T_b") - r("T_inf")) / r("L"), unit: "W" } : null;
        return {
          ok: true,
          profile: { xs: XP, curves: { exact: XP.map((X) => num(f.at(X))), short: XP.map(() => 1), long: XP.map((X) => num(Math.exp(-p.lambda * X))) } },
          values: [
            { id: "Q", tex: "Q^{*}=\\frac{\\dot QL}{kA_c\\Delta T}", label: "dimensionless base heat flow", value: num(f.Q) },
            { id: "eta", tex: "\\eta_f", label: "fin efficiency", value: num(f.efficiency) },
            { id: "tip", tex: "\\theta(1)", label: "θ at the tip", value: num(f.tip) },
            { id: "Bi-perp", tex: "Bi_{\\perp}=\\frac{hA_c}{kP}", label: "transverse Biot number", value: num((p.lambda / p.aspect) ** 2) },
          ],
          checks: [{ id: "heat-balance", title: "The base heat flow equals the total heat loss of the surface", passed: balErr < 1e-12, status: "numerical", tolerance: "1e-12", detail: `Q* = ${num(f.Q)}. The integral of the loss gives ${num(loss)} (8 panels of 20-point Gauss–Legendre).` }],
          reconstruction: [...recon, ...(heat ? [heat] : []), ...(ctx.temperature ? [{ id: "T-tip", tex: "T(L)", label: "temperature at the tip", value: ctx.temperature(f.tip), unit: "K" }] : [])],
        };
      },
      derived: (p) => [
        { id: "Bi-perp", tex: "Bi_{\\perp}=\\left(\\frac{\\lambda}{PL/A_c}\\right)^{2}", label: "transverse Biot number hA_c/(kP)", value: num((p.lambda / p.aspect) ** 2) },
        { id: "beta", tex: "\\beta=\\frac{h}{mk}", label: convective ? "tip parameter: a convective tip" : "tip parameter: 0 for the insulated tip", value: num(betaOf(p)) },
        { id: "eta", tex: "\\eta_f", label: "fin efficiency", value: num(H.fin(p.lambda, betaOf(p)).efficiency) },
      ],
      constraints: (p) => [...(p.lambda > 0 ? [] : ["λ must be positive."]), ...(p.aspect > 0 ? [] : ["PL/A_c must be positive."])],
      analysis: () => finAnalysis(), acceptance: (ctx) => finAcceptance(ctx),
    };
  }
  function finAnalysis() {
    const fs = A.finSmall(4);
    return {
      balance: {
        estimated: true, intro: "Each balance compares complete terms with their estimated field and derivative scales, not coefficients alone.",
        terms: [
          { id: "conduction", tex: "\\frac{d^{2}\\theta}{dX^{2}}", label: "axial conduction", scale: "\\frac{\\Delta\\theta}{\\ell^{2}}", why: "θ changes by Δθ over the length ℓ." },
          { id: "loss", tex: "\\lambda^{2}\\theta", label: "loss through the surface", scale: "\\lambda^{2}\\theta_b", why: "θ is of order its base value 1." },
          { id: "transverse", tex: "Bi_{\\perp}=\\frac{hA_c}{kP}", label: "twice the transverse drop ÷ surface excess, for a plate fin", scale: "\\frac{h\\,t}{2k}", why: "For a plate fin of thickness t, A_c/P ≈ t/2. Across the half-thickness, the drop over the surface excess is about Bi_⊥/2, as for the steady slab with a source." },
        ],
        balances: [
          { id: "short", region: "axial:low", title: "Axial conduction controls", when: "\\lambda^{2}\\ll 1", derivation: "With ℓ = 1, the conduction term Δθ balances the loss term λ². So Δθ ~ λ² ≪ 1, and θ stays near 1.", reduced: "\\frac{d^{2}\\theta}{dX^{2}}=0\\Rightarrow\\theta=1", neglected: "the loss term λ²θ in the profile", assumptions: [],
            residual: { tex: "\\theta_{XX}-\\lambda^{2}\\theta=-\\lambda^{2}", order: "O(λ²)", status: "exact", note: "θ = 1 leaves the residual −λ² in the equation." } },
          { id: "long", region: "axial:high", title: "Loss and conduction balance near the base", when: "\\lambda^{2}\\gg 1", derivation: "The terms balance when ℓ = 1/λ, so the temperature falls to the fluid value in a layer of length 1/λ.", reduced: "\\theta=e^{-\\lambda X}", neglected: "the tip condition", assumptions: [],
            residual: { tex: "\\theta_X(1)=-\\lambda e^{-\\lambda}", order: "O(λe^{−λ})", status: "exact", note: "e^{−λX} satisfies the equation and the base condition exactly. It misses only the tip condition, by λe^{−λ}." } },
          { id: "one-d", region: "transverse:low", title: "The 1D assumption", when: "\\frac{Bi_{\\perp}}{2}\\ll 1", derivation: "A separate balance, across the fin: the 1D solution itself does not establish it.", reduced: "T=T(x)", neglected: "the temperature change across the section", assumptions: ["A plate fin of thickness t with A_c/P ≈ t/2."],
            residual: { tex: "\\frac{\\Delta T_{\\perp}}{T_s-T_\\infty}\\approx\\frac{Bi_{\\perp}}{2}", order: "O(Bi_⊥)", status: "proposed", note: "An estimate: for the steady slab with a uniform source the drop over the excess is Bi/2 exactly, and the axial conduction acts on the section like such a source." } },
        ],
        crossovers: [
          { id: "axial", criterion: "\\lambda^{2}=1", text: "λ = 1. The region 0.32 < λ < 3.2 has comparable terms. The terms are estimates.", status: "proposed" },
          { id: "transverse", criterion: "\\frac{Bi_{\\perp}}{2}=1", text: "PL/A_c = λ/√2. The 1D model needs Bi_⊥/2 below the tolerance. The terms are estimates.", status: "proposed" },
        ],
        note: "These are balance crossovers. The transverse one bounds the validity of the declared 1D model.",
      },
      asymptotic: {
        limits: [
          { id: "small-lambda", parameter: "\\lambda\\to 0", path: "λ → 0 at fixed PL/A_c", fixed: "PL/A_c and X", coupled: false, kind: "A regular expansion in λ²",
            setup: "\\theta=\\sum_{n}\\lambda^{2n}\\varphi_n(X),\\quad \\varphi_n''=\\varphi_{n-1},\\ \\varphi_n(0)=0,\\ \\varphi_n'(1)=0",
            orders: fs.orders.map((o, k) => ({ n: o.n, equation: o.n === 0 ? "\\varphi_0''=0,\\ \\varphi_0(0)=1" : `\\varphi_{${o.n}}''=\\varphi_{${o.n - 1}}`, conditions: o.n === 0 ? ["\\varphi_0'(1)=0"] : [`\\varphi_{${o.n}}(0)=0`, `\\varphi_{${o.n}}'(1)=0`],
              result: `\\varphi_{${o.n}}=${o.tex}`, checks: k ? { equation: fs.checks[k - 1].equation, surface: fs.checks[k - 1].base && fs.checks[k - 1].tip, solvability: true } : null })),
            orderLoss: "The expansion keeps the order and both conditions: each order has θ'' and both conditions.", inner: null,
            heatFlow: `Q^{*}=${fs.QstarTex.map((c, n) => (n === 0 ? "" : `${n > 1 && !c.startsWith("-") ? "+" : ""}${c === "1" ? "" : c === "-1" ? "-" : `${c}\\,`}\\lambda^{${2 * n}}`)).join("")}+\\dots`,
            error: { formal: "A convergent series for λ < π/2.", estimated: "The first neglected term.", proved: "λ² − λ⁴/3 ≤ λ tanh λ ≤ λ² for λ ≥ 0, because tanh x ≤ x and d/dx(tanh x − x + x³/3) = x² − tanh² x ≥ 0." },
            validity: "The series converges for λ < π/2. The proved bound holds for all λ." },
          { id: "large-lambda", parameter: "\\lambda\\to\\infty", path: "λ → ∞ at fixed PL/A_c", fixed: "PL/A_c, with ξ = λX in the inner region", coupled: false, kind: "A singular expansion: a boundary layer at the base",
            setup: "\\frac{1}{\\lambda^{2}}\\theta''-\\theta=0",
            orders: [{ n: 0, equation: "\\theta_{\\text{outer}}=0", conditions: ["\\text{the base condition }\\theta(0)=1\\text{ is lost}"], result: "\\theta_{\\text{outer}}=0", checks: null }],
            orderLoss: "The outer problem drops the second derivative, so it loses its differential order and both conditions. The tip condition θ'(1) = 0 holds for θ = 0 by itself. The base condition needs an inner region.",
            inner: { variable: "\\xi=\\lambda X", equation: "\\Theta''-\\Theta=0,\\quad \\Theta(0)=1", solution: "\\Theta=e^{-\\xi}", matching: "\\Theta(\\xi\\to\\infty)=0=\\theta_{\\text{outer}}(0)", why: "The inner solution decays to the outer value." },
            error: { formal: "Composite θ ≈ e^{−λX}, Q* ≈ λ.", estimated: "The error is exponentially small, beyond all orders in 1/λ.", proved: "|λ tanh λ − λ| = 2λ/(e^{2λ} + 1) ≤ 2λe^{−2λ}." },
            validity: "λ ≫ 1. At fixed PL/A_c the transverse estimate grows like λ², so the 1D model holds only while PL/A_c ≥ λ/√(2 × tolerance)." },
        ],
        overlap: "The short-fin and long-fin approximations both meet a tolerance only near λ = 1, and only when the tolerance is more than coth 1 − 1 ≈ 0.31.",
        gaps: "Near λ = 1, where conduction and loss balance over the whole length, only the exact solution λ tanh λ is accurate.",
      },
    };
  }
  function finAcceptance(ctx) {
    const out = [];
    const ref = ctx.references?.conduction?.fin;
    if (ref) {
      const f = H.fin(ref.lambda, 0);
      const e1 = Math.abs(f.Q - ref.Q) / ref.Q, e2 = Math.abs(f.efficiency - ref.efficiency) / ref.efficiency;
      const e3 = Math.max(...ref.profile.map(([X, v]) => Math.abs(f.at(X) - v)));
      out.push({ id: "mpmath", title: `Heat flow, efficiency and profile at λ = ${Number(ref.lambda.toPrecision(6))} against mpmath`, passed: e1 < 1e-12 && e2 < 1e-12 && e3 < 1e-12, status: "numerical", tolerance: "1e-12", detail: `Relative differences ${e1.toExponential(2)} and ${e2.toExponential(2)}. Largest profile difference ${e3.toExponential(2)}.` });
      const fs = A.finSmall(4);
      out.push({ id: "series", title: "The small-λ expansion gives the Taylor coefficients of λ tanh λ", passed: ref.series.every((c, k) => c === fs.Qstar[k]), status: "exact", detail: `Q* = ${seriesText(fs.Qstar, "λ", (k) => 2 * k)}` });
      const loss = SF.gauss((X) => ref.lambda * ref.lambda * f.at(X), 0, 1);
      out.push({ id: "heat-balance", title: "The base heat flow equals the total surface loss", passed: Math.abs(loss - f.Q) / f.Q < 1e-12, status: "numerical", tolerance: "1e-12", detail: `${num(f.Q)} and ${num(loss)}.` });
    }
    return out;
  }

  /* ---------- the implementations by declaration ---------- */

  /**
   * The implementation of a declaration for a matched record: `options.shape` (lumped body) and `options.tip`
   * (fin) come from the record. Returns null for a declaration of another family module.
   */
  function implement(decl, options = {}) {
    switch (decl.id) {
      case "slab-convection": return transient(decl, "slab");
      case "cylinder-convection": return transient(decl, "cylinder");
      case "sphere-convection": return transient(decl, "sphere");
      case "lumped-convection": return lumped(decl, options.shape ?? "sphere");
      case "slab-source": return slabSource(decl);
      case "multilayer-wall": return multilayer(decl);
      case "fin": return fin(decl, options.tip ?? "insulated");
      default: return null;
    }
  }
  const DECLARATIONS = ["lumped-convection", "slab-convection", "cylinder-convection", "sphere-convection", "slab-source", "multilayer-wall", "fin"];

  return { XS, XP, DECLARATIONS, SHAPES, implement, transientApprox };
});
