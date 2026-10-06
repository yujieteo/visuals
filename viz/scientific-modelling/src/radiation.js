/* Scientific Modelling: the radiation family of piece 4 as declared models for the Regime Map Builder.
 *
 *   lumped-radiation      a body of uniform temperature with grey exchange against an enclosure at T_e:
 *                         θ_τ = q + 1 − θ⁴, θ(0) = θ_i, with θ = T/T_e. The closed-form transient
 *                         τ = G(θ_i) − G(θ), G(θ) = ln|(θ − a)/(θ + a)|/(4a³) − arctan(θ/a)/(2a³), a = (1 + q)^{1/4},
 *                         is the reference of the linearized decay and of emission-only cooling.
 *   surface-radiation     a long duct with a grey floor, a grey ceiling and reradiating side walls: the radiosity
 *                         network in j = J/(σT₁⁴), solved exactly in rationals, with the crossed-string view factors,
 *                         reciprocity, summation and the energy balance as exact checks.
 *   convection-radiation  a surface with a supplied heat flux, convection and radiation to surroundings at T_∞:
 *                         Q = (θ − 1) + N_r(θ⁴ − 1), with the linearization about T_∞ and the mean-temperature
 *                         coefficient h_rad = 4εσT_m³ as approximations.
 *
 * Statuses: a rational result (view factors, radiosities, the energy balance) is exact; a root of a nonlinear balance
 * or an error against the closed form is numerical with its tolerance.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./linalg.js"), require("./special.js"), require("./numerics.js"));
  else (root.SM = root.SM || {}).RAD = factory(root.SM.Q, root.SM.LA, root.SM.SF, root.SM.NUM);
})(typeof self !== "undefined" ? self : this, function (Q, LA, SF, N) {
  "use strict";

  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(12)) : null);
  const BAND = 10;
  const approxLayer = (id, title, measure, criterion, steps, hue = id) => ({
    id, kind: "approximation", boundary: "approximation", title, measure, scale: "log", status: "numerical", criterion, steps, evidence: ["spec-8", "spec-9"], hue,
    thresholds: (tol) => ({ curves: [{ value: tol, label: `${title}: error = ${tol}` }], regions: [{ id: "meets", label: `${title} meets the tolerance`, lo: 0, hi: tol }] }),
  });
  const balanceLayer = (id, title, measure, criterion, low, high, steps, evidence) => ({
    id, kind: "balance", boundary: "balance-crossover", title, measure, scale: "log", status: "numerical", criterion, steps, evidence,
    thresholds: () => ({ curves: [{ value: 1, label: `${title}: the terms are equal` }], regions: [{ id: "low", label: low, lo: 0, hi: 1 / BAND }, { id: "band", label: "Comparable terms: the balance crossover region", lo: 1 / BAND, hi: BAND }, { id: "high", label: high, lo: BAND, hi: null }] }),
  });

  /* ---------- the lumped grey body ---------- */

  const equilibrium = (q) => (1 + q) ** 0.25;
  /** The antiderivative G(θ) of 1/(θ⁴ − a⁴), for θ ≠ a. */
  const G = (theta, a) => Math.log(Math.abs((theta - a) / (theta + a))) / (4 * a ** 3) - Math.atan(theta / a) / (2 * a ** 3);
  /** θ(τ) of θ_τ = a⁴ − θ⁴, θ(0) = θ_i: the root of G(θ) = G(θ_i) − τ between θ_i and a. */
  function lumpedTheta(thetaI, q, tau) {
    const a = equilibrium(q);
    if (Math.abs(thetaI - a) <= 1e-14 * a || tau === 0) return thetaI;
    const target = G(thetaI, a) - tau;
    const f = (th) => G(th, a) - target;
    // G decreases from θ_i towards a from either side, so f changes sign between θ_i and a (exclusive).
    const eps = 1e-15 * a;
    const near = thetaI > a ? a + eps : a - eps;
    // Past the time where θ is within 10⁻¹⁵ of a, double precision cannot separate θ from a.
    if (f(near) * f(thetaI) > 0) return a;
    const r = SF.brent(f, Math.min(near, thetaI), Math.max(near, thetaI), 1e-15);
    return r === null ? a : r;
  }
  const linearDecay = (thetaI, q, tau) => { const a = equilibrium(q); return a + (thetaI - a) * Math.exp(-4 * a ** 3 * tau); };
  /** Emission only (θ⁴ ≫ 1 + q): θ_τ = −θ⁴ gives θ = θ_i (1 + 3θ_i³τ)^{−1/3}. */
  const emissionOnly = (thetaI, tau) => thetaI * (1 + 3 * thetaI ** 3 * tau) ** (-1 / 3);

  function lumpedImpl(decl) {
    const params = decl.domain.parameters;
    function evaluate(p) {
      if (!(p.theta_i > 0) || !(p.tau_r > 0) || !(p.q >= 0)) return { ok: false, reason: "θ_i and τ must be positive, and q must not be negative." };
      const a = equilibrium(p.q);
      if (Math.abs(p.theta_i - a) <= 1e-9 * a) return { ok: false, reason: "θ_i equals the equilibrium temperature, so the body has no transient." };
      const th = lumpedTheta(p.theta_i, p.q, p.tau_r);
      const scale = Math.abs(p.theta_i - a);
      return { ok: true, values: { "err-linear": Math.abs(linearDecay(p.theta_i, p.q, p.tau_r) - th) / scale, "err-emission": Math.abs(emissionOnly(p.theta_i, p.tau_r) - th) / scale, decay: 4 * a ** 3,
        "bal-emission": th ** 4 / (1 + p.q) } };
    }
    const steps = ["s-st-equilibrium", "s-st-jacobian", "s-rm-map"];
    const layers = [
      approxLayer("linear", "Linearized decay", "err-linear", "|θ_lin(τ) − θ(τ)| ÷ |θ_i − θ*|, with θ_lin = θ* + (θ_i − θ*)e^{−4θ*³τ} and θ from the closed form, ≤ the tolerance", steps),
      approxLayer("emission", "Emission only", "err-emission", "|θ_i(1 + 3θ_i³τ)^{−1/3} − θ(τ)| ÷ |θ_i − θ*| ≤ the tolerance: the enclosure and the supplied heat are neglected", steps),
      { ...balanceLayer("emission-balance", "Emission against the enclosure and the supply", "bal-emission", "θ⁴ ÷ (1 + q): the emitted flux against the absorbed and supplied flux, at the time τ. The ratio 1 is the equilibrium itself, so the map draws the edges of the crossover band, 1/10 and 10",
        "Absorption and supply control: the body is far below the equilibrium", "Emission controls: the body cools as θ_τ ≈ −θ⁴", steps, ["spec-8", "lienhard-2024"]),
      thresholds: () => ({ curves: [{ value: 10, label: "Emission is ten times absorption and supply" }, { value: 0.1, label: "Emission is a tenth of absorption and supply" }],
        regions: [{ id: "low", label: "Absorption and supply control: the body is far below the equilibrium", lo: 0, hi: 0.1 }, { id: "band", label: "Comparable terms: the balance crossover region", lo: 0.1, hi: 10 }, { id: "high", label: "Emission controls: the body cools as θ_τ ≈ −θ⁴", lo: 10, hi: null }] }) },
      { id: "equilibrium", kind: "stability", boundary: "stability", title: "Stability of the equilibrium", measure: "decay", scale: "log", status: "exact", steps: ["s-st-equilibrium", "s-st-jacobian"], evidence: ["spec-8"],
        criterion: "Linear temporal stability of θ* = (1 + q)^{1/4}: the eigenvalue f′(θ*) = −4θ*³ must be negative. f′(θ) = −4θ³ < 0 for every θ > 0 (exact), so no point of the domain has a neutral equilibrium",
        thresholds: () => ({ curves: [], regions: [{ id: "stable", label: "One equilibrium, linearly stable, and it attracts every θ_i > 0", lo: 0, hi: null }] }) },
    ];
    const approximations = [
      { id: "linear", label: "Linearized decay", tex: "\\theta\\approx\\theta^{*}+(\\theta_i-\\theta^{*})e^{-4\\theta^{*3}\\tau}", limit: "θ_i → θ* or τ → ∞", why: "The linearization of θ⁴ at the equilibrium, with h_rad = 4εσT_e³θ*³.", error: "formal; the order-2 term (θ − θ*)² estimates it" },
      { id: "emission", label: "Emission only", tex: "\\theta\\approx\\theta_i(1+3\\theta_i^{3}\\tau)^{-1/3}", limit: "θ⁴ ≫ 1 + q", why: "The body emits much more than it absorbs or receives.", error: "formal; (1 + q)/θ⁴ estimates it" },
    ];
    const limits = (p) => {
      const a = equilibrium(p.q);
      const tmax = params.find((x) => x.id === "tau_r").max;
      return [{ id: "late", label: `τ → ∞ at θ_i = ${num(p.theta_i)}: θ → θ* = ${num(a)}`, coupled: false, approx: "linear", note: "The linearized decay holds on this path once the departure from θ* is small.",
        points: Array.from({ length: 21 }, (_, i) => ({ ...p, tau: p.tau_r * (tmax / p.tau_r) ** (i / 20) })) }];
    };
    const inspect = (p, ctx) => {
      const a = equilibrium(p.q);
      const th = lumpedTheta(p.theta_i, p.q, p.tau_r);
      const sol = N.rk45((t, y) => [p.q + 1 - y[0] ** 4], 0, [p.theta_i], p.tau_r, { rtol: 1e-11, atol: 1e-13 });
      const rk = sol.ys.at(-1)[0];
      const loss = SF.gauss((t) => lumpedTheta(p.theta_i, p.q, t) ** 4 - 1 - p.q, 0, p.tau_r, 16);
      const recon = ctx.reconstruct ? ["q", "theta_i", "tau_r"].map((k) => ctx.reconstruct(k, p[k])).filter(Boolean) : [];
      return { ok: true,
        values: [{ id: "theta", tex: "\\theta(\\tau)", label: "temperature ratio from the closed form", value: num(th) }, { id: "eq", tex: "\\theta^{*}", label: "equilibrium (1 + q)^{1/4}", value: num(a) },
          { id: "lin", tex: "\\theta_{\\text{lin}}(\\tau)", label: "linearized decay", value: num(linearDecay(p.theta_i, p.q, p.tau_r)) }, { id: "em", tex: "\\theta_{\\text{em}}(\\tau)", label: "emission only", value: num(emissionOnly(p.theta_i, p.tau_r)) }],
        checks: [
          { id: "rk45", title: "The Dormand–Prince integration agrees with the closed form", passed: Math.abs(rk - th) <= 1e-8 * Math.max(1, Math.abs(th)), status: "numerical", tolerance: "1e-8 relative", detail: `θ = ${num(th)} (closed form) and ${num(rk)} (${sol.accepted} steps, rtol 1e-11).` },
          { id: "energy", title: "Energy balance: θ_i − θ(τ) equals the integral of θ⁴ − 1 − q", passed: Math.abs(p.theta_i - th - loss) <= 1e-9 * Math.max(1, Math.abs(p.theta_i - th)), status: "numerical", tolerance: "1e-9", detail: `${num(p.theta_i - th)} and ${num(loss)} (Gauss–Legendre, 16 panels).` },
        ],
        reconstruction: [...recon, ...(ctx.temperature ? [{ id: "T", tex: "T(t)", label: "body temperature", value: ctx.temperature(th), unit: "K" }, { id: "Teq", tex: "T^{*}", label: "equilibrium temperature", value: ctx.temperature(a), unit: "K" }] : [])] };
    };
    const derived = (p) => {
      const a = equilibrium(p.q);
      return [{ id: "eq", tex: "\\theta^{*}=(1+q)^{1/4}", label: "equilibrium temperature ratio", value: num(a) }, { id: "rate", tex: "4\\theta^{*3}", label: "decay rate of the linearized model", value: num(4 * a ** 3) },
        ...(p.Bi_r > 0 ? [{ id: "Bi_rad", tex: "Bi_{\\text{rad}}=Bi_r\\max(\\theta_i,\\theta^{*})^{3}", label: "radiation Biot number at the hottest temperature", value: num(p.Bi_r * Math.max(p.theta_i, a) ** 3) }] : [])];
    };
    const constraints = (p) => {
      const out = [];
      if (!(p.theta_i > 0)) out.push("θ_i must be positive: radiation uses absolute temperatures.");
      if (p.Bi_r > 0 && p.Bi_r * Math.max(p.theta_i, equilibrium(p.q)) ** 3 >= 0.1) out.push("The radiation Biot number reaches 0.1, so the uniform-temperature assumption is not accurate within about 3 % (Lienhard, section 1.3).");
      return out;
    };
    return { id: decl.id, params, axes: { x: "tau_r", y: "theta_i" }, approximations, layers, evaluate, limits, inspect, derived, constraints,
      analysis: () => lumpedAnalysis(), acceptance: (ctx) => lumpedAcceptance(ctx), stability: (p, ctx) => lumpedStability(p, ctx) };
  }

  function lumpedAnalysis() {
    return {
      note: "The nonlinear balance has one equilibrium. Near it the linearized decay holds; far above the enclosure temperature the body cools by emission only.",
      balance: {
        terms: [
          { tex: "\\theta^{4}", label: "emission of the body", scale: "\\theta^{4}", why: "Absolute temperature to the fourth power." },
          { tex: "1", label: "absorption from the enclosure", scale: "1", why: "θ = T/T_e, so the enclosure gives 1." },
          { tex: "q", label: "supplied heat", scale: "q", why: "Q ÷ (εσA_sT_e⁴)." },
        ],
        balances: [
          { title: "Emission-controlled cooling", when: "\\theta^{4}\\gg1+q", derivation: "The emission term is much larger than the absorbed and supplied heat.", reduced: "\\theta_\\tau=-\\theta^{4}", neglected: "absorption from the enclosure and the supplied heat", assumptions: ["θ_i⁴ ≫ 1 + q."],
            residual: { tex: "(1+q)/\\theta^{4}", order: "relative size of the neglected terms", status: "numerical", note: "The emission-only layer of the map measures the error against the closed form." } },
          { title: "Near-equilibrium decay", when: "|\\theta-\\theta^{*}|\\ll\\theta^{*}", derivation: "θ⁴ = θ*⁴ + 4θ*³(θ − θ*) + O((θ − θ*)²), and θ*⁴ = 1 + q.", reduced: "\\theta_\\tau=-4\\theta^{*3}(\\theta-\\theta^{*})", neglected: "the terms of order (θ − θ*)²", assumptions: ["The departure from equilibrium is small."],
            residual: { tex: "6\\theta^{*2}(\\theta-\\theta^{*})^{2}", order: "second order in the departure", status: "exact", note: "The Taylor coefficient is exact." } },
        ],
        crossovers: [{ criterion: "\\theta^{4}=1+q", status: "numerical", text: "Emission equals absorption plus supply: this is the equilibrium itself, so the crossover band of the map surrounds θ*." }],
        note: "A balance crossover is a comparison of terms. It is not a transition.",
      },
      asymptotic: {
        limits: [{ parameter: "\\delta=\\theta_i-\\theta^{*}\\to0", path: "δ → 0 at fixed q", coupled: false, kind: "Regular perturbation (formal)", fixed: "q", setup: "\\theta=\\theta^{*}+\\delta\\,\\theta_{1}(\\tau)+\\delta^{2}\\theta_{2}(\\tau)+\\dots",
          orders: [{ n: 1, equation: "\\theta_{1,\\tau}=-4\\theta^{*3}\\theta_{1}", conditions: ["\\theta_{1}(0)=1"], result: "\\theta_{1}=e^{-4\\theta^{*3}\\tau}" },
            { n: 2, equation: "\\theta_{2,\\tau}=-4\\theta^{*3}\\theta_{2}-6\\theta^{*2}\\theta_{1}^{2}", conditions: ["\\theta_{2}(0)=0"], result: "\\theta_{2}=\\frac{3}{2\\theta^{*}}\\left(e^{-8\\theta^{*3}\\tau}-e^{-4\\theta^{*3}\\tau}\\right)" }],
          orderLoss: "No loss of order: each order is a first-order equation with its initial condition.",
          error: { formal: "The expansion is formal.", estimated: "The order-2 term estimates the remainder of the linearized decay.", proved: null },
          validity: "Small |θ_i − θ*| ÷ θ*, at all τ." }],
        overlap: "Both reduced models hold together only for a short time when θ_i is close to θ* and θ* is large.",
        gaps: "Between them, for a large departure at intermediate times, only the closed form is accurate.",
      },
    };
  }

  function lumpedAcceptance(ctx) {
    const out = [];
    const q = ctx.exact?.("Q/(eps*sigma*A_s*T_e^4)"), ti = ctx.exact?.("T_i/T_e");
    if (q && ti) {
      const a = equilibrium(q.float);
      const th = lumpedTheta(ti.float, q.float, 1);
      const sol = N.rk45((t, y) => [q.float + 1 - y[0] ** 4], 0, [ti.float], 1, { rtol: 1e-11, atol: 1e-13 });
      out.push({ id: "equilibrium", title: "The equilibrium θ* = (1 + q)^{1/4} satisfies the balance", passed: Math.abs(q.float + 1 - a ** 4) <= 1e-12 * (1 + q.float), status: "numerical", tolerance: "1e-12", detail: `q = ${num(q.float)}, θ* = ${num(a)}.` });
      out.push({ id: "closed-form", title: "The closed form θ(τ = 1) agrees with the Dormand–Prince integration", passed: Math.abs(sol.ys.at(-1)[0] - th) <= 1e-8, status: "numerical", tolerance: "1e-8", detail: `${num(th)} and ${num(sol.ys.at(-1)[0])}.` });
    }
    out.push({ id: "stable", title: "The eigenvalue −4θ*³ is negative for every θ* > 0", passed: true, status: "exact", detail: "f(θ) = q + 1 − θ⁴ gives f′(θ) = −4θ³ exactly (hand calculation 9)." });
    return out;
  }

  /** Hand calculation 9 for the lumped body: the equilibrium, its eigenvalue, the global argument and the transient. */
  function lumpedStability(p, ctx) {
    const a = equilibrium(p.q);
    const lam = -4 * a ** 3;
    const ts = ctx?.exact?.("C*V/(eps*sigma*A_s*T_e^3)") ?? null;
    const taus = Array.from({ length: 41 }, (_, i) => 3 * (i / 40) / Math.abs(lam) + 0);
    const sol = N.rk45((t, y) => [p.q + 1 - y[0] ** 4], 0, [p.theta_i], taus.at(-1), { rtol: 1e-10, atol: 1e-12 });
    return {
      family: "radiation", model: "lumped-radiation", point: { q: p.q, theta_i: p.theta_i }, concept: "linear temporal stability of the equilibrium, and global attraction because the balance decreases strictly",
      equilibrium: { theta: num(a), residual: Math.abs(p.q + 1 - a ** 4), eigenvalue: num(lam), timeConstant: num(1 / Math.abs(lam)), timeConstantSeconds: ts ? num(ts.float / Math.abs(lam)) : null },
      transient: { tau: taus.map(num), exact: taus.map((t) => num(lumpedTheta(p.theta_i, p.q, t))), linear: taus.map((t) => num(linearDecay(p.theta_i, p.q, t))), rk45: { accepted: sol.accepted, rejected: sol.rejected, end: num(sol.ys.at(-1)[0]), exactEnd: num(lumpedTheta(p.theta_i, p.q, taus.at(-1))) } },
      coverage: "A scalar balance with f′ < 0 has exactly one equilibrium on θ > 0, so the search is complete for this model.",
    };
  }

  /* ---------- the duct with a grey floor, a grey ceiling and reradiating side walls ---------- */

  /**
   * The radiosity network in j = J/(σT₁⁴) for floor 1 and ceiling 2 of width W and reradiating side walls R of
   * height H: exact in rationals. Returns j₁, j₂, j_R, the net fluxes q₁* = q₁/(σT₁⁴), q₂*, and the closed form.
   */
  function network({ e1, e2, t2, F12 }) {
    const F1R = Q.sub(Q.ONE, F12);
    const g1 = Q.div(e1, Q.sub(Q.ONE, e1)), g2 = Q.div(e2, Q.sub(Q.ONE, e2));
    const t4 = Q.pow(t2, 4);
    // g1(1 − j1) = F12(j1 − j2) + F1R(j1 − jR); g2(t⁴ − j2) = F12(j2 − j1) + F1R(j2 − jR); 0 = 2jR − j1 − j2.
    const A = [[Q.add(g1, Q.add(F12, F1R)), Q.neg(F12), Q.neg(F1R)], [Q.neg(F12), Q.add(g2, Q.add(F12, F1R)), Q.neg(F1R)], [Q.q(-1), Q.q(-1), Q.q(2)]];
    const b = [g1, Q.mul(g2, t4), Q.ZERO];
    const j = LA.solve(A, b);
    if (!j) return null;
    const q1 = Q.mul(g1, Q.sub(Q.ONE, j[0])), q2 = Q.mul(g2, Q.sub(t4, j[1]));
    const space = Q.inv(Q.add(F12, Q.div(F1R, Q.q(2))));
    const resist = Q.add(Q.add(Q.inv(g1), space), Q.inv(g2));
    const closed = Q.div(Q.sub(Q.ONE, t4), resist);
    return { j, q1, q2, closed, space, surface: Q.add(Q.inv(g1), Q.inv(g2)), F1R };
  }
  const fl = (x) => Q.toNumber(x);
  /** A rational square root when it exists exactly. */
  function ratSqrt(x) {
    const r = (n) => { if (n < 0n) return null; let s = BigInt(Math.floor(Math.sqrt(Number(n)))); while (s * s > n) s--; while ((s + 1n) * (s + 1n) <= n) s++; return s * s === n ? s : null; };
    const a = r(x.n), b = r(x.d);
    return a !== null && b !== null ? Q.q(a, b) : null;
  }
  /** The crossed-string view factors of the duct of width W and height H (Lienhard, problem 10.14). */
  function viewFactors(W, H) {
    const d2 = Q.add(Q.mul(W, W), Q.mul(H, H));
    const d = ratSqrt(d2);
    if (!d) {
      const df = Math.sqrt(fl(d2));
      return { exact: false, F12: (df - fl(H)) / fl(W), d: df };
    }
    const F12 = Q.div(Q.sub(d, H), W);
    const F1R = Q.sub(Q.ONE, F12);
    const FR1 = Q.div(Q.mul(W, F1R), Q.mul(Q.q(2), H));
    const FRR = Q.sub(Q.ONE, Q.mul(Q.q(2), FR1));
    const F34 = Q.div(Q.sub(Q.mul(Q.q(2), d), Q.mul(Q.q(2), W)), Q.mul(Q.q(2), H));
    return { exact: true, d, F12, F1R, FR1, FRR, F34 };
  }

  function surfaceImpl(decl, geometry) {
    const params = decl.domain.parameters;
    const flt = (p) => {
      const g1 = p.eps_1 / (1 - p.eps_1), g2 = p.eps_2 / (1 - p.eps_2), F1R = 1 - p.F_12;
      const space = 1 / (p.F_12 + F1R / 2), surf = 1 / g1 + 1 / g2;
      const q = (1 - p.theta_2 ** 4) / (surf + space), qb = (1 - p.theta_2 ** 4) / space;
      return { q, qb, surf, space };
    };
    const evaluate = (p) => {
      if (!(p.eps_1 > 0 && p.eps_1 < 1) || !(p.eps_2 > 0 && p.eps_2 < 1) || !(p.F_12 > 0 && p.F_12 < 1) || !(p.theta_2 >= 0 && p.theta_2 < 1)) return { ok: false, reason: "The emissivities and F₁₂ must lie between 0 and 1, and 0 ≤ θ₂ < 1." };
      const r = flt(p);
      return { ok: true, values: { "err-black": Math.abs(r.qb - r.q) / r.q, "bal-surface": r.surf / r.space, flux: r.q } };
    };
    const steps = ["s-st-network", "s-rm-map"];
    const layers = [
      approxLayer("black", "Black surfaces", "err-black", "|q₁*(ε = 1) − q₁*| ÷ q₁* ≤ the tolerance, from the exact network", steps),
      balanceLayer("surface-space", "Surface resistance against space resistance", "bal-surface", "[(1 − ε₁)/ε₁ + (1 − ε₂)/ε₂] ÷ [1/(F₁₂ + F₁R/2)]: the surface resistances against the space resistance of the network",
        "The geometry (space resistance) controls the exchange", "The emissivities (surface resistances) control the exchange", steps, ["spec-8", "lienhard-2024"]),
    ];
    const approximations = [{ id: "black", label: "Black surfaces", tex: "q_1^{*}\\approx(1-\\theta_2^{4})(F_{12}+F_{1R}/2)", limit: "ε₁, ε₂ → 1", why: "The surface resistances (1 − ε)/ε vanish.", error: "exact: the error is the ratio of the surface resistances to the total" }];
    const limits = () => [];
    const inspect = (p, ctx) => {
      const r = flt(p);
      const recon = ctx.reconstruct ? ["eps_1", "theta_2"].map((k) => ctx.reconstruct(k, p[k])).filter(Boolean) : [];
      const T1 = ctx.role?.("T_1"), sigma = ctx.role?.("sigma");
      return { ok: true, values: [{ id: "q1", tex: "q_1^{*}=q_1/(\\sigma T_1^{4})", label: "net flux of the floor", value: num(r.q) }, { id: "qb", tex: "q_{1,\\text{black}}^{*}", label: "net flux with black surfaces", value: num(r.qb) }],
        checks: [], reconstruction: [...recon, ...(T1 && sigma ? [{ id: "q1-dim", tex: "q_1", label: "net radiative flux of the floor", value: num(r.q * sigma.float * T1.float ** 4), unit: "W/m^2" }] : [])] };
    };
    const derived = (p) => [{ id: "F1R", tex: "F_{1R}=1-F_{12}", label: "view factor floor to side walls (summation rule)", value: num(1 - p.F_12) }, { id: "q1", tex: "q_1^{*}", label: "net flux of the floor", value: num(flt(p).q) }];
    const constraints = (p) => (p.F_12 > 0 && p.F_12 < 1 ? [] : ["F₁₂ must lie between 0 and 1."]);
    return { id: decl.id, params, axes: { x: "eps_1", y: "eps_2" }, approximations, layers, evaluate, limits, inspect, derived, constraints,
      analysis: () => surfaceAnalysis(), acceptance: (ctx) => surfaceExchange(ctx, geometry).checks, stability: (p, ctx) => surfaceExchange(ctx, geometry) };
  }

  function surfaceAnalysis() {
    return {
      note: "The network is linear in the radiosities. The balance compares its resistances; the black-surface model is its limit as both emissivities go to 1.",
      balance: {
        terms: [
          { tex: "\\frac{1-\\varepsilon_1}{\\varepsilon_1}+\\frac{1-\\varepsilon_2}{\\varepsilon_2}", label: "surface resistances of floor and ceiling", scale: "\\frac{1-\\varepsilon}{\\varepsilon}", why: "Lienhard, section 10.4: the surface resistance of a grey surface per unit area." },
          { tex: "\\left(F_{12}+F_{1R}/2\\right)^{-1}", label: "space resistance with the walls that reradiate", scale: "1/F", why: "The direct path in parallel with the path through the side walls." },
        ],
        balances: [{ title: "Geometry-controlled exchange", when: "\\text{surface}\\ll\\text{space}", derivation: "The surfaces are nearly black.", reduced: "q_1^{*}=(1-\\theta_2^{4})(F_{12}+F_{1R}/2)", neglected: "the surface resistances", assumptions: [],
          residual: { tex: "\\text{surface}/(\\text{surface}+\\text{space})", order: "the exact relative error", status: "exact", note: "" } }],
        crossovers: [{ criterion: "\\text{surface}=\\text{space}", status: "numerical", text: "The emissivities and the geometry control the exchange equally." }],
        note: "A balance crossover is a comparison of terms. It is not a transition.",
      },
      asymptotic: { limits: [], overlap: "The network has a closed-form solution, so no expansion is needed.", gaps: "None." },
    };
  }

  /**
   * The exchange analysis of the duct at the record's values: crossed-string view factors, reciprocity and summation,
   * the exact radiosity solution, the closed form of the three-surface network and the energy balance.
   */
  function surfaceExchange(ctx, geometry) {
    const get = (id) => { const v = ctx?.role?.(id); return v ? (v.exact ?? null) : null; };
    const e1 = get("eps_1"), e2 = get("eps_2"), F12 = get("F_12"), T1 = get("T_1"), T2 = get("T_2");
    const checks = [];
    if (!e1 || !e2 || !F12 || !T1 || !T2) return { family: "radiation", model: "surface-radiation", ok: false, reason: "The record needs exact values of ε₁, ε₂, F₁₂, T₁ and T₂.", checks };
    const t2 = Q.div(T2, T1);
    const W = geometry?.width !== undefined ? Q.parse(String(geometry.width)) : null, H = geometry?.height !== undefined ? Q.parse(String(geometry.height)) : null;
    const vf = W && H ? viewFactors(W, H) : null;
    if (vf && vf.exact) {
      checks.push({ id: "crossed-strings", title: "F₁₂ of the record equals the crossed-string value (√(W² + H²) − H)/W", passed: Q.eq(vf.F12, F12), status: "exact", detail: `W = ${Q.str(W)}, H = ${Q.str(H)}: F₁₂ = ${Q.str(vf.F12)}. The record has ${Q.str(F12)}.` });
      const A1 = W, AR = Q.mul(Q.q(2), H);
      checks.push({ id: "reciprocity", title: "Reciprocity A₁F₁R = A_R F_R1", passed: Q.eq(Q.mul(A1, vf.F1R), Q.mul(AR, vf.FR1)), status: "exact", detail: `${Q.str(Q.mul(A1, vf.F1R))} = ${Q.str(Q.mul(AR, vf.FR1))} per unit length of the duct.` });
      checks.push({ id: "summation", title: "Summation: F₁₂ + F₁R = 1 and 2F_R1 + F_RR = 1", passed: Q.eq(Q.add(vf.F12, vf.F1R), Q.ONE) && Q.eq(Q.add(Q.mul(Q.q(2), vf.FR1), vf.FRR), Q.ONE), status: "exact",
        detail: `F₁R = ${Q.str(vf.F1R)}, F_R1 = ${Q.str(vf.FR1)}, F_RR = ${Q.str(vf.FRR)}.` });
      checks.push({ id: "side-walls", title: "The side walls see each other with the crossed-string value F₃₄ = (2d − 2W)/(2H), which equals F_RR", passed: Q.eq(vf.F34, vf.FRR), status: "exact", detail: `F₃₄ = ${Q.str(vf.F34)}.` });
    } else if (vf) checks.push({ id: "crossed-strings", title: "F₁₂ against the crossed-string value", passed: Math.abs(vf.F12 - fl(F12)) <= 1e-12, status: "numerical", tolerance: "1e-12", detail: `√(W² + H²) is not rational, so the comparison is numerical: ${num(vf.F12)}.` });
    const net = network({ e1, e2, t2, F12 });
    if (!net) return { family: "radiation", model: "surface-radiation", ok: false, reason: "The network matrix is singular.", checks };
    checks.push({ id: "energy", title: "Energy balance: the floor gives what the ceiling takes (the side walls are adiabatic)", passed: Q.isZero(Q.add(net.q1, net.q2)), status: "exact", detail: `q₁* = ${Q.str(net.q1)}, q₂* = ${Q.str(net.q2)}.` });
    checks.push({ id: "closed-form", title: "The radiosity solution equals the closed form of the three-surface network", passed: Q.eq(net.q1, net.closed), status: "exact", detail: `(1 − θ₂⁴) ÷ [(1 − ε₁)/ε₁ + 1/(F₁₂ + F₁R/2) + (1 − ε₂)/ε₂] = ${Q.str(net.closed)}.` });
    checks.push({ id: "reradiating", title: "The side walls reradiate: j_R = (j₁ + j₂)/2", passed: Q.eq(Q.mul(Q.q(2), net.j[2]), Q.add(net.j[0], net.j[1])), status: "exact", detail: `j_R = ${Q.str(net.j[2])}.` });
    const sigma = ctx.role?.("sigma");
    const q1dim = sigma ? fl(net.q1) * sigma.float * fl(T1) ** 4 : null;
    return { family: "radiation", model: "surface-radiation", ok: true, concept: "the steady exchange between grey diffuse surfaces. The network is linear in the radiosities, so stability and bifurcation do not apply",
      viewFactors: vf && vf.exact ? { W: Q.str(W), H: Q.str(H), d: Q.str(vf.d), F12: Q.str(vf.F12), F1R: Q.str(vf.F1R), FR1: Q.str(vf.FR1), FRR: Q.str(vf.FRR) } : null,
      theta2: Q.str(t2), theta2pow4: Q.str(Q.pow(t2, 4)), j: net.j.map(Q.str), q1: Q.str(net.q1), q2: Q.str(net.q2), q1float: num(fl(net.q1)), q1dim: num(q1dim), resistances: { surface: Q.str(net.surface), space: Q.str(net.space) },
      sideWallTemperature: num(fl(T1) * fl(net.j[2]) ** 0.25), checks };
  }

  /* ---------- convection and radiation from a surface with a supplied flux ---------- */

  /** θ of Q = (θ − 1) + N_r(θ⁴ − 1), the one root θ > 1 for Q > 0 (the right side increases in θ). */
  function crTheta(Nr, Qs) {
    const f = (t) => t - 1 + Nr * (t ** 4 - 1) - Qs;
    let hi = 1 + Qs;
    while (f(hi) < 0) hi *= 2;
    return SF.brent(f, 1, hi, 1e-15) ?? NaN;
  }
  /** The mean-temperature model: Q = (θ − 1)[1 + 4N_r((θ + 1)/2)³]. */
  function crMean(Nr, Qs) {
    const f = (t) => (t - 1) * (1 + 4 * Nr * ((t + 1) / 2) ** 3) - Qs;
    let hi = 1 + Qs;
    while (f(hi) < 0) hi *= 2;
    return SF.brent(f, 1, hi, 1e-15) ?? NaN;
  }
  function crImpl(decl) {
    const params = decl.domain.parameters;
    const evaluate = (p) => {
      if (!(p.N_r > 0) || !(p.Q > 0)) return { ok: false, reason: "N_r and Q must be positive." };
      const th = crTheta(p.N_r, p.Q), lin = 1 + p.Q / (1 + 4 * p.N_r), mean = crMean(p.N_r, p.Q);
      return { ok: true, values: { "err-linear": Math.abs(lin - th) / (th - 1), "err-mean": Math.abs(mean - th) / (th - 1), "bal-radiation": (p.N_r * (th ** 4 - 1)) / (th - 1), theta: th } };
    };
    const steps = ["s-rm-balance", "s-rm-asymptotic", "s-rm-map"];
    const layers = [
      approxLayer("linear", "Linearized at T_∞", "err-linear", "|θ_lin − θ| ÷ (θ − 1) with θ_lin = 1 + Q/(1 + 4N_r), ≤ the tolerance", steps),
      approxLayer("mean", "h_rad at the mean temperature", "err-mean", "|θ_m − θ| ÷ (θ − 1) with Q = (θ_m − 1)[1 + 4N_r((θ_m + 1)/2)³] (Lienhard, equation 2.29), ≤ the tolerance", steps, "linear"),
      balanceLayer("radiation", "Radiation against convection", "bal-radiation", "N_r(θ⁴ − 1) ÷ (θ − 1): the radiative flux against the convective flux at the solution",
        "Convection controls: radiation is a small correction", "Radiation controls: convection is a small correction", steps, ["spec-8", "lienhard-2024"]),
    ];
    const approximations = [
      { id: "linear", label: "Linearized at T_∞", tex: "\\theta\\approx1+\\frac{Q}{1+4N_r}", limit: "Q → 0", why: "The linearization limit: θ⁴ − 1 = 4(θ − 1) + O((θ − 1)²).", error: "formal; the order-2 term estimates it" },
      { id: "mean", label: "h_rad at the mean temperature", tex: "Q=(\\theta-1)\\left[1+4N_r\\left(\\tfrac{\\theta+1}{2}\\right)^{3}\\right]", limit: "(θ − 1)²/(θ + 1)² → 0", why: "T⁴ − T_∞⁴ = 4T_m³ΔT[1 + (ΔT/2T_m)²] exactly; the model drops the bracket.", error: "exact for the radiative flux: the relative error is (ΔT/2T_m)²" },
    ];
    const limits = (p) => [{ id: "small", label: `Q → 0 at N_r = ${num(p.N_r)}: the linearization limit`, coupled: false, approx: "linear", note: "θ − 1 → Q/(1 + 4N_r).", points: Array.from({ length: 21 }, (_, i) => ({ ...p, Q: p.Q * (params.find((x) => x.id === "Q").min / p.Q) ** (i / 20) })) }];
    const inspect = (p, ctx) => {
      const th = crTheta(p.N_r, p.Q);
      const recon = ctx.reconstruct ? ["Q", "N_r"].map((k) => ctx.reconstruct(k, p[k])).filter(Boolean) : [];
      return { ok: true, values: [{ id: "theta", tex: "\\theta=T/T_\\infty", label: "surface temperature ratio", value: num(th) }, { id: "lin", tex: "\\theta_{\\text{lin}}", label: "linearized at T_∞", value: num(1 + p.Q / (1 + 4 * p.N_r)) }, { id: "mean", tex: "\\theta_{m}", label: "h_rad at the mean temperature", value: num(crMean(p.N_r, p.Q)) }],
        checks: [{ id: "balance", title: "The root satisfies the full nonlinear balance", passed: Math.abs(th - 1 + p.N_r * (th ** 4 - 1) - p.Q) <= 1e-12 * Math.max(1, p.Q), status: "numerical", tolerance: "1e-12", detail: `Residual ${Math.abs(th - 1 + p.N_r * (th ** 4 - 1) - p.Q).toExponential(2)}.` }],
        reconstruction: [...recon, ...(ctx.temperature ? [{ id: "T", tex: "T_s", label: "surface temperature", value: ctx.temperature(th), unit: "K" }] : [])] };
    };
    const derived = (p) => { const th = crTheta(p.N_r, p.Q); return [{ id: "theta", tex: "\\theta", label: "surface temperature ratio", value: num(th) }, { id: "hr", tex: "h_{r}/h=N_r(\\theta+1)(\\theta^{2}+1)", label: "exact radiation coefficient ÷ h", value: num(p.N_r * (th + 1) * (th * th + 1)) }]; };
    const constraints = (p) => [...(p.N_r > 0 ? [] : ["N_r must be positive."]), ...(p.Q > 0 ? [] : ["Q must be positive."])];
    return { id: decl.id, params, axes: { x: "N_r", y: "Q" }, approximations, layers, evaluate, limits, inspect, derived, constraints,
      analysis: () => crAnalysis(), acceptance: (ctx) => crAcceptance(ctx), stability: (p) => crStability(p) };
  }
  function crAnalysis() {
    return {
      note: "The balance has one root θ > 1. Radiation and convection compete through N_r and the temperature ratio.",
      balance: {
        terms: [{ tex: "\\theta-1", label: "convection", scale: "\\theta-1", why: "h(T − T_∞) ÷ (hT_∞)." }, { tex: "N_r(\\theta^{4}-1)", label: "radiation", scale: "4N_r(\\theta-1)\\ \\text{for small}\\ \\theta-1", why: "εσ(T⁴ − T_∞⁴) ÷ (hT_∞)." }],
        balances: [
          { title: "Convection controls", when: "4N_r\\ll1", derivation: "Radiation is a small correction to the convective loss.", reduced: "\\theta=1+Q", neglected: "radiation", assumptions: [], residual: { tex: "N_r(\\theta^{4}-1)", order: "the neglected term", status: "numerical", note: "" } },
          { title: "Radiation controls", when: "4N_r\\theta^{3}\\gg1", derivation: "Convection is a small correction.", reduced: "\\theta=(1+Q/N_r)^{1/4}", neglected: "convection", assumptions: [], residual: { tex: "\\theta-1", order: "the neglected term", status: "numerical", note: "" } },
        ],
        crossovers: [{ criterion: "N_r(\\theta^{4}-1)=\\theta-1", status: "numerical", text: "Radiation and convection carry the same flux." }],
        note: "A balance crossover is a comparison of terms. It is not a transition.",
      },
      asymptotic: {
        limits: [{ parameter: "Q\\to0", path: "Q → 0 at fixed N_r", coupled: false, kind: "Regular perturbation (formal)", fixed: "N_r", setup: "\\theta=1+Q\\,\\theta_{1}+Q^{2}\\theta_{2}+\\dots",
          orders: [{ n: 1, equation: "(1+4N_r)\\,\\theta_{1}=1", conditions: [], result: "\\theta_{1}=\\frac{1}{1+4N_r}" }, { n: 2, equation: "(1+4N_r)\\,\\theta_{2}+6N_r\\theta_{1}^{2}=0", conditions: [], result: "\\theta_{2}=-\\frac{6N_r}{(1+4N_r)^{3}}" }],
          orderLoss: "No loss of order: the balance is algebraic.", error: { formal: "The expansion is formal.", estimated: "The order-2 term estimates the error of the linearization.", proved: null }, validity: "Q ≪ (1 + 4N_r)²/(6N_r)." }],
        overlap: "The linearized and mean-temperature models agree to order Q.", gaps: "At large Q and large N_r only the full balance is accurate.",
      },
    };
  }
  function crAcceptance(ctx) {
    const out = [];
    const Nr = ctx.exact?.("eps*sigma*T_inf^3/h"), Qs = ctx.exact?.("q_s/(h*T_inf)");
    if (Nr && Qs) {
      const th = crTheta(Nr.float, Qs.float);
      out.push({ id: "root", title: "The surface temperature satisfies the full nonlinear balance", passed: Math.abs(th - 1 + Nr.float * (th ** 4 - 1) - Qs.float) <= 1e-12, status: "numerical", tolerance: "1e-12", detail: `N_r = ${num(Nr.float)}, Q = ${num(Qs.float)}, θ = ${num(th)}.` });
    }
    const errs = [1e-2, 1e-3, 1e-4].map((q) => Math.abs(1 + q / (1 + 4) - crTheta(1, q)) / (crTheta(1, q) - 1));
    out.push({ id: "limit", title: "The linearization error goes to 0 like Q as Q → 0 (N_r = 1)", passed: errs[0] > errs[1] && errs[1] > errs[2] && Math.abs(errs[1] / errs[2] - 10) < 0.1, status: "numerical", tolerance: "ratio 10 ± 0.1 per decade", detail: `Errors ${errs.map((e) => e.toExponential(3)).join(", ")}.` });
    return out;
  }
  function crStability(p) {
    const th = crTheta(p.N_r, p.Q);
    return { family: "radiation", model: "convection-radiation", point: { N_r: p.N_r, Q: p.Q }, concept: "a steady algebraic balance: one root, because the loss increases monotonically with θ",
      root: { theta: num(th), slope: num(1 + 4 * p.N_r * th ** 3), linear: num(1 + p.Q / (1 + 4 * p.N_r)), mean: num(crMean(p.N_r, p.Q)) } };
  }

  /** The family module interface of src/regime.js. */
  function implement(decl, options = {}) {
    switch (decl.id) {
      case "lumped-radiation": return lumpedImpl(decl);
      case "surface-radiation": return surfaceImpl(decl, options.geometry ?? null);
      case "convection-radiation": return crImpl(decl);
      default: return null;
    }
  }

  return { equilibrium, G, lumpedTheta, linearDecay, emissionOnly, network, viewFactors, ratSqrt, crTheta, crMean, implement, DECLARATIONS: ["lumped-radiation", "surface-radiation", "convection-radiation"] };
});
