/* Scientific Modelling: the declared convection models of piece 7 and their checks. Each solver takes the SI
 * values of one example (exact rationals where the record gives them, floats otherwise) and returns plain data:
 * the dimensionless groups, the solution, the checks with their statuses, the hand-calculation steps (spec
 * section 12, items 6 to 10) and the data of the figures. A check is "exact" only when rational or polynomial
 * equality decides it (src/rational.js, src/poly.js); every floating-point result is "numerical" and carries its
 * tolerance. The solvers never read the page or the record: src/heat.js maps a record onto their inputs.
 *
 *   advChannel      advection-diffusion in a channel segment: exact solution, exact discrete conservation,
 *                   mesh order, cell-Peclet oscillation, the outlet layer and the approximation boundaries
 *   couette         plane Couette flow with viscous heat generation: profile, energy balance, Br = 0 limit
 *   thermocapillary a laminar layer with a free surface and a declared gradient: stress, sign, return flow,
 *                   the coupled temperature field and the transport enhancement 1 + Ma^2/1680
 *   tube            fully developed laminar tube flow: Nu = 48/11 (wall flux, exact), Nu = 3.657 (wall
 *                   temperature, Graetz eigenvalue by shooting), entrance-scale ratios
 *   mixedChannel    fully developed mixed convection in a vertical channel: forced and buoyancy limits, the
 *                   gravity direction and the exact flow-reversal boundary |Gr/Re| = 72
 *   conjugate       a fluid-solid channel with a heated outer wall: exact fully developed solution and a
 *                   finite-volume solution on three meshes with interface balances and mesh convergence
 *   blasius         the Blasius and Pohlhausen similarity solutions for the plate correlations
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./htpoly.js"), require("./htnum.js"), require("./empirical.js"));
  else (root.SM = root.SM || {}).CV = factory(root.SM.Q, root.SM.HP, root.SM.HN, root.SM.EM);
})(typeof self !== "undefined" ? self : this, function (Q, P, N, EM) {
  "use strict";

  const q = Q.q;
  const f = N.fmt;
  const ft = N.fmtTex;
  /** A check: an id, a title, a status of record.js and its details. */
  const check = (id, title, status, extra = {}) => ({ id, title, status, passed: true, detail: "", tolerance: null, inputs: [], evidence: [], tex: null, ...extra });
  /** A hand-calculation step (spec section 12). */
  const step = (item, title, reason, tex = [], evidence = []) => ({ item, title, reason, tex, evidence });
  const qt = (x) => Q.tex(x);
  const qn = (x) => Q.toNumber(x);
  /** The sign of a value as a word. */
  const signWord = (s) => (s > 0 ? "positive" : s < 0 ? "negative" : "zero");

  /* ======================================================================================================
   * Advection-diffusion in a channel segment
   * ====================================================================================================== */

  /** The exact solution theta(X) and its total flux J for a Peclet number pe > 0 (stable forms with expm1). */
  const adExact = (pe) => ({
    theta: (X) => (pe === 0 ? 1 - X : Math.expm1(-pe * (1 - X)) / Math.expm1(-pe)),
    J: pe === 0 ? 1 : pe / -Math.expm1(-pe),
  });

  /**
   * The discrete solution on N equal intervals, in exact rationals. Central: (1 - P/2) t[i+1] - 2 t[i] + (1 + P/2)
   * t[i-1] = 0; upwind: t[i+1] - (2 + P) t[i] + (1 + P) t[i-1] = 0; with P = Pe/N, t[0] = 1, t[N] = 0.
   */
  function adDiscrete(Pe, n, scheme) {
    const P = Q.div(Pe, q(n));
    const half = Q.div(P, q(2));
    const lo = scheme === "central" ? Q.add(Q.ONE, half) : Q.add(Q.ONE, P);
    const di = scheme === "central" ? q(-2) : Q.neg(Q.add(q(2), P));
    const up = scheme === "central" ? Q.sub(Q.ONE, half) : Q.ONE;
    const m = n - 1;
    const lower = Array.from({ length: m }, (_, i) => (i === 0 ? Q.ZERO : lo));
    const diag = Array.from({ length: m }, () => di);
    const upper = Array.from({ length: m }, (_, i) => (i === m - 1 ? Q.ZERO : up));
    const rhs = Array.from({ length: m }, (_, i) => (i === 0 ? Q.neg(lo) : Q.ZERO));
    const inner = N.thomasExact(lower, diag, upper, rhs);
    const t = [Q.ONE, ...inner, Q.ZERO];
    // The face fluxes J = Pe t_face - dt/dX: the central face value is the mean, the upwind value the upstream node.
    const flux = [];
    for (let i = 0; i < n; i++) {
      const face = scheme === "central" ? Q.div(Q.add(t[i], t[i + 1]), q(2)) : t[i];
      flux.push(Q.sub(Q.mul(Pe, face), Q.mul(q(n), Q.sub(t[i + 1], t[i]))));
    }
    return { n, P, t, flux };
  }

  function advChannel(p, opts = {}) {
    const Pe = Q.div(Q.mul(p.U, p.L), p.alpha);
    const pe = qn(Pe);
    const ex = adExact(pe);
    const checks = [], steps = [];
    const tol = opts.tolerance ?? 0.01;
    // Exact conservation of both discrete schemes on two meshes with P <= 1 (exact fractions), and the mesh order
    // on four meshes (the same recurrences in floating point).
    let n0 = 8;
    while (pe / n0 > 1 && n0 < 512) n0 *= 2;
    const exactOk = pe / n0 <= 1;
    if (exactOk) {
      const meshes = [n0, 2 * n0];
      const central = meshes.map((n) => adDiscrete(Pe, n, "central"));
      const upwind = meshes.map((n) => adDiscrete(Pe, n, "upwind"));
      const conserved = (d) => d.flux.every((x) => Q.eq(x, d.flux[0]));
      const ok = central.every(conserved) && upwind.every(conserved);
      checks.push(check("ad-discrete-conservation", `Both finite-volume schemes conserve the total flux exactly: on ${meshes.join(" and ")} intervals, every face carries the same J.`, ok ? "exact" : "unresolved",
        { passed: ok, detail: `On ${n0} intervals, J = ${f(qn(central[0].flux[0]), 8)} (central) and ${f(qn(upwind[0].flux[0]), 8)} (upwind), compared as exact fractions.`, inputs: ["U", "L", "alpha"] }));
      const floatSolve = (n, scheme) => {
        const P = pe / n;
        const lo = scheme === "central" ? 1 + P / 2 : 1 + P, di = scheme === "central" ? -2 : -(2 + P), up = scheme === "central" ? 1 - P / 2 : 1;
        const m = n - 1, c = new Float64Array(m), d = new Float64Array(m);
        c[0] = up / di; d[0] = -lo / di;
        for (let i = 1; i < m; i++) { const den = di - lo * c[i - 1]; c[i] = up / den; d[i] = (0 - lo * d[i - 1]) / den; }
        const t = new Float64Array(n + 1);
        t[0] = 1; t[n] = 0; t[m] = d[m - 1];
        for (let i = m - 2; i >= 0; i--) t[i + 1] = d[i] - c[i] * t[i + 2];
        return t;
      };
      const study = [n0, 2 * n0, 4 * n0, 8 * n0];
      const err = (t, n) => Math.max(...Array.from(t, (x, i) => Math.abs(x - ex.theta(i / n))));
      const eC = study.map((n) => err(floatSolve(n, "central"), n)), eU = study.map((n) => err(floatSolve(n, "upwind"), n));
      const pC = N.order(eC[2], eC[3]), pU = N.order(eU[2], eU[3]);
      checks.push(check("ad-mesh-order", `The central scheme converges with observed order ${f(pC, 3)} and the upwind scheme with order ${f(pU, 3)}, as their truncation errors predict (2 and 1).`,
        "numerical", { passed: Math.abs(pC - 2) < 0.1 && Math.abs(pU - 1) < 0.15, tolerance: "|p − 2| < 0.1 (central), |p − 1| < 0.15 (upwind)",
          detail: study.map((n, i) => `N = ${n}: max error ${f(eC[i], 3)} (central), ${f(eU[i], 3)} (upwind)`).join("; "), inputs: ["U", "L", "alpha"], table: { meshes: study, central: eC, upwind: eU } }));
      const tF = floatSolve(8 * n0, "central"), nF = 8 * n0;
      const Jc = pe * (tF[0] + tF[1]) / 2 - nF * (tF[1] - tF[0]);
      checks.push(check("ad-flux", `The finite-volume flux on the finest mesh agrees with the exact flux J = Pe/(1 − e^(−Pe)) = ${f(ex.J, 8)}.`, "numerical",
        { passed: Math.abs(Jc - ex.J) <= 1e-3 * Math.max(1, ex.J), tolerance: "relative 1e-3", detail: `${nF} intervals: J = ${f(Jc, 8)}.`, inputs: ["U", "L", "alpha"] }));
    } else {
      checks.push(check("ad-discrete-conservation", `The exact discrete check needs a mesh with cell Péclet number at most 1, so more than 512 intervals at Pe = ${f(pe)}.`, "unresolved",
        { passed: false, next: "Reduce U or L, or increase α, so that Pe ≤ 512.", inputs: ["U", "L", "alpha"] }));
    }
    // Oscillation of the central scheme above cell Peclet 2: a property of the exact discrete solution.
    const nOsc = Math.floor(pe / 4);
    let osc = null;
    if (nOsc >= 2 && pe <= 4096) {
      const c = adDiscrete(Pe, nOsc, "central"), u = adDiscrete(Pe, nOsc, "upwind");
      const monotone = (d) => d.t.every((x, i) => i === 0 || Q.cmp(x, d.t[i - 1]) <= 0);
      osc = { n: nOsc, P: qn(c.P), central: c.t.map(qn), upwind: u.t.map(qn) };
      checks.push(check("ad-cell-peclet", `With ${nOsc} intervals the cell Péclet number is P = ${Q.str(c.P)} > 2. The central solution is ${monotone(c) ? "monotone" : "not monotone (it oscillates)"}, and the upwind solution is ${monotone(u) ? "monotone" : "not monotone"}.`,
        "exact", { passed: !monotone(c) && monotone(u), detail: "The page compares consecutive node values as exact fractions. The central recurrence has the ratio r = (1 + P/2)/(1 − P/2), which is negative for P > 2.", inputs: ["U", "L", "alpha"] }));
    }
    // Approximation boundaries in Pe: the outlet-layer (composite) form and the diffusion form.
    const boundaryLayer = Math.log(1 / tol);
    const dErr = (s) => {
      const e = adExact(s);
      let m = 0;
      for (let i = 0; i <= 400; i++) { const X = i / 400; m = Math.max(m, Math.abs(e.theta(X) - (1 - X))); }
      return m;
    };
    const diffusion = N.root((s) => dErr(s) - tol, 1e-6, 50);
    const blErr = Math.exp(-pe);
    checks.push(check("ad-outlet-layer", `The composite outlet-layer form θ_c = 1 − e^(−Pe(1−X)) equals (1 − e^(−Pe)) θ exactly, so its largest error is e^(−Pe) = ${f(blErr, 3)}.`,
      "numerical", { passed: Math.abs(Math.max(...Array.from({ length: 201 }, (_, i) => Math.abs(ex.theta(i / 200) + Math.expm1(-pe * (1 - i / 200))))) - blErr) <= 1e-12 + 1e-9 * blErr,
        tolerance: "absolute 1e-12", detail: `This form meets the tolerance ${tol} for Pe ≥ ln(1/${tol}) = ${f(boundaryLayer, 4)}. The diffusion form 1 − X meets it for Pe ≤ ${f(diffusion, 4)}. Between the two, only the full solution meets it.`, inputs: ["U", "L", "alpha"] }));

    // Hand calculation, items 6 to 10.
    steps.push(step(6, "Scales and the dimensionless variables", "The length L, the end difference T_in − T_out and the diffusion time L²/α are the scales of the declared segment.",
      ["X=\\frac{x}{L},\\qquad \\theta=\\frac{T-T_{out}}{T_{in}-T_{out}},\\qquad Pe=\\frac{UL}{\\alpha}", "\\frac{\\mathrm dT}{\\mathrm dx}=\\frac{T_{in}-T_{out}}{L}\\,\\theta_X,\\qquad \\frac{\\mathrm d^2T}{\\mathrm dx^2}=\\frac{T_{in}-T_{out}}{L^2}\\,\\theta_{XX}"]));
    steps.push(step(7, "The dimensionless equation and conditions", "Substitution and division by α(T_in − T_out)/L² leave one parameter, Pe.",
      ["Pe\\,\\theta_X=\\theta_{XX},\\qquad \\theta(0)=1,\\qquad \\theta(1)=0", `Pe=${pe === Math.round(pe) ? pe : ft(pe)}`]));
    steps.push(step(8, "Solution, total flux and the regimes in Pe", "The equation is linear with constant coefficients. The total flux is constant because its derivative is the equation itself.",
      ["\\theta=\\frac{1-e^{-Pe(1-X)}}{1-e^{-Pe}},\\qquad J=Pe\\,\\theta-\\theta_X=\\frac{Pe}{1-e^{-Pe}}", "Pe\\to0:\\ \\theta\\to1-X,\\qquad Pe\\gg1:\\ \\theta\\approx1-e^{-Pe(1-X)},\\ \\delta/L=1/Pe",
        "\\theta-\\theta_c=e^{-Pe}\\,\\theta\\le e^{-Pe}"]));
    steps.push(step(10, "Numerical procedure and checks", "Finite volumes on N equal intervals, solved in exact fractions with the Thomas algorithm. The cell Péclet number P = Pe/N decides if the central scheme stays monotone.",
      ["(1-\\tfrac P2)\\theta_{i+1}-2\\theta_i+(1+\\tfrac P2)\\theta_{i-1}=0\\ \\text{(central)}", "\\theta_{i+1}-(2+P)\\theta_i+(1+P)\\theta_{i-1}=0\\ \\text{(upwind)}"]));

    const xs = Array.from({ length: 201 }, (_, i) => i / 200);
    return {
      groups: [{ id: "Pe", label: "Pe", tex: "Pe=\\frac{UL}{\\alpha}", value: pe, exact: Q.str(Pe) }],
      values: { Pe: pe, J: ex.J, tolerance: tol, boundaryLayer, diffusion },
      checks, steps,
      figures: [
        { id: "ad-profile", title: "Temperature along the segment", x: { label: "X = x/L" }, y: { label: "θ" },
          series: [{ label: `Exact, Pe = ${f(pe, 4)}`, points: xs.map((X) => [X, ex.theta(X)]) }, { label: "Diffusion limit 1 − X", dashed: true, points: [[0, 1], [1, 0]] },
            ...(osc ? [{ label: `Central, ${osc.n} intervals (P = ${f(osc.P, 3)})`, marker: true, points: osc.central.map((t, i) => [i / osc.n, t]) }] : [])] },
        { id: "ad-pe", title: "Total flux and the approximation boundaries in Pe", x: { label: "Pe", log: true }, y: { label: "J/max(1, Pe)" },
          series: [{ label: "J/max(1, Pe)", points: Array.from({ length: 121 }, (_, i) => { const s = 10 ** (-2 + i / 30); return [s, adExact(s).J / Math.max(1, s)]; }) }],
          marks: [{ x: diffusion, label: "diffusion form within tolerance below" }, { x: boundaryLayer, label: "outlet-layer form within tolerance above" }, { x: pe, label: "this model", current: true }],
          bands: [{ x0: diffusion, x1: boundaryLayer, label: "full solution needed", kind: "unresolved" }] },
      ],
    };
  }

  /* ======================================================================================================
   * Plane Couette flow with viscous heat generation
   * ====================================================================================================== */

  function couette(p, set) {
    const checks = [], steps = [];
    const Phi = Q.mul(p.mu, Q.pow(Q.div(p.U, p.H), 2));
    let theta, Br, scale, dT = null, Ec = null, Pr = null;
    const eta = P.X;
    if (set === "isothermal") {
      dT = Q.sub(p.T1, p.T0);
      Br = Q.div(Q.mul(p.mu, Q.pow(p.U, 2)), Q.mul(p.k, dT));
      // theta = eta + Br/2 * eta(1 - eta)
      theta = P.add(eta, P.scale(P.mul(eta, P.sub(P.ONE, eta)), Q.div(Br, q(2))));
      scale = dT;
    } else {
      // Adiabatic at y = 0, T = T1 at y = H: theta = (T - T1)/(mu U^2/k) = (1 - eta^2)/2.
      Br = Q.ONE;
      theta = P.poly([q(1, 2), 0, q(-1, 2)]);
      scale = Q.div(Q.mul(p.mu, Q.pow(p.U, 2)), p.k);
    }
    if (p.cp) {
      Pr = Q.div(Q.mul(p.mu, p.cp), p.k);
      if (dT) Ec = Q.div(Q.pow(p.U, 2), Q.mul(p.cp, dT));
    }
    const d1 = P.deriv(theta), d2 = P.deriv(d1);
    const residual = P.add(d2, P.poly([Br]));
    checks.push(check("cou-equation", "The profile satisfies θ'' = −Br and both wall conditions exactly.", "exact", {
      passed: P.isZero(residual) && (set === "isothermal" ? Q.isZero(P.at(theta, 0)) && Q.eq(P.at(theta, 1), Q.ONE) : Q.isZero(P.at(d1, 0)) && Q.isZero(P.at(theta, 1))),
      tex: `\\theta=${P.tex(theta, "\\eta")}`, inputs: ["mu", "U", "H", "k", "T0", "T1"] }));
    // Energy: heat out through both walls equals the dissipation, (k dT/H)(theta'(0) - theta'(1)) = mu U^2/H.
    const out0 = P.at(d1, 0), out1 = Q.neg(P.at(d1, 1));
    const balance = Q.add(out0, out1);
    checks.push(check("cou-energy", `Total energy balance: the heat that leaves through the two walls equals the heat that viscosity generates, ${set === "isothermal" ? "θ'(0) − θ'(1) = Br" : "−θ'(1) = 1"}.`, "exact", {
      passed: Q.eq(balance, Br), detail: `Dissipation Φ = μ(U/H)² = ${f(qn(Phi))} W/m³, uniform. Heat out per unit wall area: ${f(qn(Q.mul(Q.mul(p.k, Q.div(scale, p.H)), out0)))} W/m² at y = 0 and ${f(qn(Q.mul(Q.mul(p.k, Q.div(scale, p.H)), out1)))} W/m² at y = H. Their sum is μU²/H = ${f(qn(Q.div(Q.mul(p.mu, Q.pow(p.U, 2)), p.H)))} W/m².`,
      inputs: ["mu", "U", "H", "k", "T0", "T1"] }));
    if (set === "isothermal") {
      const limit = P.add(eta, P.ZERO);
      const at0 = P.add(eta, P.scale(P.mul(eta, P.sub(P.ONE, eta)), q(0)));
      checks.push(check("cou-limit", "The zero-dissipation limit Br → 0 gives the conduction profile θ = η exactly. The profile is linear in Br, so the expansion in Br ends at the first order.", "exact",
        { passed: P.eq(at0, limit), inputs: ["mu", "U", "k", "T0", "T1"] }));
      // Interior maximum: theta'(eta*) = 0 at eta* = 1/2 + 1/Br, inside (0, 1) when |Br| > 2.
      const brn = qn(Br);
      const inside = Q.cmp(Q.abs(Br), q(2)) > 0;
      const etaStar = inside ? Q.add(q(1, 2), Q.inv(Br)) : null;
      checks.push(check("cou-maximum", inside ? `Br = ${f(brn, 4)} has |Br| > 2, so the temperature has an interior extreme at η* = 1/2 + 1/Br = ${Q.str(etaStar).length < 12 ? Q.str(etaStar) : f(qn(etaStar), 6)}, and heat leaves through both walls.` : `Br = ${f(brn, 4)} has |Br| ≤ 2, so the temperature is monotone and the wall at y = 0 does not receive heat from the fluid.`,
        "exact", { passed: inside ? Q.isZero(P.at(d1, etaStar)) : true, detail: "The heat flux at the hotter wall changes sign at |Br| = 2 exactly, because θ'(0) = 1 + Br/2 and θ'(1) = 1 − Br/2.", inputs: ["mu", "U", "k", "T0", "T1"] }));
      if (Pr && Ec) checks.push(check("cou-identity", `Br = Pr·Ec holds exactly for these values: ${f(qn(Pr), 6)} × ${f(qn(Ec), 6)} = ${f(qn(Br), 6)}.`, "exact",
        { passed: Q.eq(Q.mul(Pr, Ec), Br), detail: "Pr and Ec use the same μ, c_p, k and ΔT as Br, so the page gives no separate control for Br.", inputs: ["mu", "U", "k", "cp", "T0", "T1"] }));
    }
    // Dimensional values.
    const Tof = (e) => (set === "isothermal" ? Q.add(p.T0, Q.mul(scale, P.at(theta, e))) : Q.add(p.T1, Q.mul(scale, P.at(theta, e))));
    // The hottest point: a wall or the interior extreme of theta, compared as exact temperatures.
    const candidates = [Q.ZERO, Q.ONE, ...(set === "isothermal" && Q.cmp(Q.abs(Br), q(2)) > 0 ? [Q.add(q(1, 2), Q.inv(Br))] : [])];
    const etaMax = candidates.reduce((best, e) => (Q.cmp(Tof(e), Tof(best)) > 0 ? e : best));
    steps.push(step(6, "Scales", set === "isothermal" ? "The gap H, the wall speed U and the signed wall difference ΔT = T_1 − T_0 are the scales. ΔT must not be 0." : "With one wall adiabatic, no wall difference exists. The viscous scale μU²/k replaces ΔT, so Br = 1 by definition.",
      [set === "isothermal" ? "\\eta=\\frac yH,\\qquad \\theta=\\frac{T-T_0}{T_1-T_0},\\qquad u=U\\eta" : "\\eta=\\frac yH,\\qquad \\theta=\\frac{T-T_1}{\\mu U^2/k},\\qquad u=U\\eta"]));
    steps.push(step(7, "Dimensionless equation and conditions", "The energy equation k T'' + μ(du/dy)² = 0 becomes, after division by kΔT/H²:",
      [set === "isothermal" ? "\\theta''=-Br,\\qquad \\theta(0)=0,\\quad \\theta(1)=1,\\qquad Br=\\frac{\\mu U^2}{k\\,\\Delta T}=Pr\\,Ec" : "\\theta''=-1,\\qquad \\theta'(0)=0,\\quad \\theta(1)=0"]));
    steps.push(step(8, "Solution and the regime boundary", set === "isothermal" ? "Two integrations give the profile. The heat flux at y = H changes sign at Br = 2." : "Two integrations give the profile. All heat leaves through the wall at y = H.",
      [`\\theta=${P.tex(theta, "\\eta")}`, set === "isothermal" ? "\\theta'(0)=1+\\tfrac{Br}{2},\\qquad \\theta'(1)=1-\\tfrac{Br}{2}" : "\\theta'(1)=-1"]));
    steps.push(step(10, "Checks", "The residual, the conditions and the energy balance are polynomial identities, so the page decides them with exact fractions.",
      [set === "isothermal" ? "\\theta'(0)-\\theta'(1)=Br\\ \\Leftrightarrow\\ \\int_0^H\\mu\\left(\\tfrac{U}{H}\\right)^2\\mathrm dy=\\frac{\\mu U^2}{H}" : "-\\theta'(1)=1=\\int_0^1 1\\,\\mathrm d\\eta"], ["mit-viscous"]));
    const ys = Array.from({ length: 101 }, (_, i) => i / 100);
    return {
      groups: [{ id: "Br", label: "Br", tex: "Br=\\frac{\\mu U^2}{k\\Delta T}", value: qn(Br), exact: Q.str(Br) }, ...(Pr ? [{ id: "Pr", label: "Pr", tex: "Pr=\\frac{\\mu c_p}{k}", value: qn(Pr), exact: Q.str(Pr) }] : []),
        ...(Ec ? [{ id: "Ec", label: "Ec", tex: "Ec=\\frac{U^2}{c_p\\Delta T}", value: qn(Ec), exact: Q.str(Ec) }] : [])],
      values: { Br: qn(Br), Tmax: qn(Tof(etaMax)), etaMax: qn(etaMax), q0: qn(Q.mul(Q.mul(p.k, Q.div(scale, p.H)), out0)), qH: qn(Q.mul(Q.mul(p.k, Q.div(scale, p.H)), out1)), Phi: qn(Phi), set, theta: P.text(theta, "η") },
      checks, steps, thetaTex: P.tex(theta, "\\eta"),
      figures: [{ id: "cou-profile", title: "Temperature across the gap", x: { label: "η = y/H" }, y: { label: set === "isothermal" ? "θ = (T − T₀)/(T₁ − T₀)" : "θ = (T − T₁)k/(μU²)" },
        series: [{ label: `This model, Br = ${f(qn(Br), 4)}`, points: ys.map((e) => [e, P.atFloat(theta, e)]) },
          ...(set === "isothermal" ? [{ label: "Br = 0 (conduction only)", dashed: true, points: [[0, 0], [1, 1]] }, { label: "Br = 2 (no heat flux at y = H)", dashed: true, points: ys.map((e) => [e, e + e * (1 - e)]) }] : [])] }],
    };
  }

  /* ======================================================================================================
   * Thermocapillary transport in a laminar layer
   * ====================================================================================================== */

  function thermocapillary(p) {
    const checks = [], steps = [];
    const b = p.b ?? Q.div(p.DT, p.L);                // declared surface temperature gradient, signed
    if (!p.DT && p.L) p = { ...p, DT: Q.mul(b, p.L) };
    const tau = Q.mul(p.gammaT, b);                   // tangential stress at the surface, signed
    const alpha = Q.div(p.k, Q.mul(p.rho, p.cp));
    const s = Q.sign(tau);
    const MaT = p.L ? Q.div(Q.mul(Q.mul(Q.abs(p.gammaT), Q.abs(p.DT)), p.L), Q.mul(p.mu, alpha)) : null;
    const Mad = Q.div(Q.mul(Q.mul(Q.abs(p.gammaT), Q.abs(b)), Q.pow(p.d, 2)), Q.mul(p.mu, alpha));
    const Pr = Q.div(Q.mul(p.mu, p.cp), p.k);
    const z = P.X;
    // Velocity u = (tau d/mu) F(zeta), F = (3 zeta^2 - 2 zeta)/4.
    const F = P.poly([0, q(-1, 2), q(3, 4)]);
    const Fz = P.deriv(F), Fzz = P.deriv(Fz);
    const us = Q.div(Q.mul(tau, p.d), Q.mul(q(4), p.mu));
    checks.push(check("tc-stress", "The surface condition μ ∂u/∂z = dγ/dx = (dγ/dT)(∂T/∂x) holds exactly: F'(1) = 1, so μu_z(d) = τ.", "exact",
      { passed: Q.eq(P.at(Fz, 1), Q.ONE) && Q.isZero(P.at(F, 0)), tex: "u=\\frac{\\tau h_l}{\\mu}\\,\\frac{3Z^2-2Z}{4},\\qquad \\tau=\\frac{\\mathrm d\\gamma}{\\mathrm dT}\\frac{\\Delta T}{L}",
        detail: `τ = (${f(qn(p.gammaT))} N/(m·K)) × (${f(qn(b))} K/m) = ${f(qn(tau))} Pa. No slip at z = 0: F(0) = 0.`, inputs: ["gammaT", "b", "mu", "d"], evidence: ["comsol-marangoni"] }));
    checks.push(check("tc-sign", `Sign: dγ/dT is ${signWord(Q.sign(p.gammaT))} and the gradient ∂T/∂x is ${signWord(Q.sign(b))}, so τ is ${signWord(s)}. The surface moves toward ${s < 0 ? "−x" : "+x"}, the ${(s < 0) === (Q.sign(b) > 0) ? "colder" : "hotter"} side, where the surface tension is higher.`,
      "exact", { passed: Q.sign(us) === s && s !== 0, detail: `Surface speed u_s = τh_l/(4μ) = ${f(qn(us))} m/s.${MaT ? ` Ma_T = ${f(qn(MaT), 5)} is a positive magnitude.` : ""} The page keeps the sign s = ${s > 0 ? "+1" : "−1"} apart from it.`, inputs: ["gammaT", "b"], evidence: ["comsol-marangoni", "spec-10"] }));
    checks.push(check("tc-return", "Closed ends far away: the net flow through each section is zero, ∫F dZ = 0. The return flow fills the lower third: u changes sign at Z = 2/3.", "exact",
      { passed: Q.isZero(P.definite(F, 0, 1)) && Q.isZero(P.at(F, q(2, 3))), detail: `Pressure gradient dp/dx = μu_zz = (3/2)τ/h_l = ${f(qn(Q.div(Q.mul(q(3, 2), tau), p.d)))} Pa/m, uniform, because F'' = 3/2.`, inputs: ["gammaT", "DT", "L", "d"] }));
    // Temperature T = T0 + b x + b d Theta(zeta), Theta'' = s Ma_d F, adiabatic at both faces, zero mean.
    const G = P.integ(P.integ(F));
    const Gmean = P.definite(G, 0, 1);
    const G0 = P.sub(G, P.poly([Gmean]));             // zero mean over the depth
    const sMa = Q.mul(q(s), Mad);
    const Theta = P.scale(G0, sMa);
    const resid = P.sub(P.deriv(P.deriv(Theta)), P.scale(F, sMa));
    checks.push(check("tc-energy", "Coupled heat transport: Θ = s·Ma_d·G(Z) satisfies Θ'' = s·Ma_d·F(Z) with Θ'(0) = Θ'(1) = 0 exactly. Here Ma_d = |dγ/dT||b|h_l²/(μα) is the depth-based Marangoni number.", "exact",
      { passed: P.isZero(resid) && Q.isZero(P.at(P.deriv(Theta), 0)) && Q.isZero(P.at(P.deriv(Theta), 1)), tex: `\\Theta=s\\,Ma_d\\left(${P.tex(G0, "Z")}\\right)`, inputs: ["gammaT", "DT", "L", "d", "mu", "k", "rho", "cp"] }));
    const fg = P.definite(P.mul(F, G0), 0, 1);       // = -1/1680
    const enh = Q.sub(Q.ONE, Q.mul(fg, Q.pow(Mad, 2)));
    checks.push(check("tc-transport", `The flow increases the heat transport along the layer by the exact factor 1 + Ma_d²/1680 = ${f(qn(enh), 6)}. The factor is even in s: reversing the sign of dγ/dT reverses the flow, but not this increase.`, "exact",
      { passed: Q.eq(fg, q(-1, 1680)), detail: `∫₀¹ F G dZ = ${Q.str(fg)}. Conduction alone carries −k b h_l per unit width. The total is that value times 1 + Ma_d²/1680.`, inputs: ["gammaT", "DT", "L", "d", "mu", "k", "rho", "cp"] }));
    if (MaT) checks.push(check("tc-magnitude", `Ma_T = |dγ/dT||ΔT|L/(μα_f) = ${f(qn(MaT), 6)} with ΔT = bL, and Ma_d = Ma_T (h_l/L)² = ${f(qn(Mad), 6)} exactly. Both are positive magnitudes.`, "exact",
      { passed: Q.eq(Mad, Q.mul(MaT, Q.pow(Q.div(p.d, p.L), 2))) && Q.sign(MaT) > 0, inputs: ["gammaT", "b", "L", "d", "mu", "k", "rho", "cp"], evidence: ["spec-10"] }));
    const crossover = Math.sqrt(1680);
    steps.push(step(6, "Scales", "The depth h_l sets the vertical scale. The surface stress τ sets the speed τh_l/μ. The declared gradient b = ∂T/∂x sets the temperature scale b·h_l.",
      ["Z=\\frac{z}{h_l},\\qquad u=\\frac{\\tau h_l}{\\mu}F(Z),\\qquad T=T_0+\\frac{\\Delta T}{L}\\left(x+h_l\\,\\Theta(Z)\\right)", "Ma_T=\\frac{|\\mathrm d\\gamma/\\mathrm dT|\\,|\\Delta T|L}{\\mu\\alpha_f},\\qquad Ma_d=Ma_T\\left(\\frac{h_l}{L}\\right)^2,\\qquad s=\\operatorname{sign}\\left(\\frac{\\mathrm d\\gamma}{\\mathrm dT}\\Delta T\\right)"], ["spec-10"]));
    steps.push(step(7, "Dimensionless equations and conditions", "Parallel flow far from the ends: the momentum equation keeps the viscous term and a uniform pressure gradient. The energy equation keeps advection by u of the declared gradient and vertical conduction.",
      ["F''=\\text{const},\\quad F(0)=0,\\quad F'(1)=1,\\quad \\int_0^1F\\,\\mathrm dZ=0", "\\Theta''=s\\,Ma_d\\,F,\\qquad \\Theta'(0)=\\Theta'(1)=0,\\qquad \\int_0^1\\Theta\\,\\mathrm dZ=0"], ["comsol-marangoni"]));
    steps.push(step(8, "Solution, transport and the balance crossover", `Advection and conduction carry equal heat along the layer when Ma_d² = 1680, so Ma_d ≈ ${f(crossover, 4)}. This is a balance crossover, not a transition.`,
      [`F=${P.tex(F, "Z")},\\qquad G=${P.tex(G0, "Z")}`, "\\frac{k_{eff}}{k}=1-Ma_d^2\\int_0^1F\\,G\\,\\mathrm dZ=1+\\frac{Ma_d^2}{1680}"]));
    steps.push(step(10, "Limits of the declaration", "The page does not check these assumptions. They stay as unresolved claims: buoyancy is neglected, the surface stays flat, the ends are far away and the flow is steady. A heat loss at the surface makes T depend on x in a different way, so it needs a separate declaration. The stability of this flow (hydrothermal waves) is not part of the declaration."));
    const zs = Array.from({ length: 101 }, (_, i) => i / 100);
    return {
      groups: [...(MaT ? [{ id: "Ma_T", label: "Ma_T", tex: "Ma_T=\\frac{|\\mathrm d\\gamma/\\mathrm dT|\\,|\\Delta T|L}{\\mu\\alpha_f}", value: qn(MaT), exact: Q.str(MaT) }] : []),
        { id: "Ma_d", label: "Ma_d", tex: "Ma_d=\\frac{|\\mathrm d\\gamma/\\mathrm dT|\\,|b|\\,h_l^2}{\\mu\\alpha_f}", value: qn(Mad), exact: Q.str(Mad) }, { id: "Pr", label: "Pr", tex: "Pr=\\frac{\\mu c_p}{k}", value: qn(Pr), exact: Q.str(Pr) },
        ...(p.L ? [{ id: "dL", label: "h_l/L", tex: "h_l/L", value: qn(Q.div(p.d, p.L)), exact: Q.str(Q.div(p.d, p.L)) }] : [])],
      values: { s, us: qn(us), tau: qn(tau), MaT: MaT ? qn(MaT) : null, Mad: qn(Mad), enhancement: qn(enh), crossover, Pr: qn(Pr) },
      checks, steps,
      figures: [{ id: "tc-profiles", title: "Velocity and temperature across the layer", x: { label: "u/u_s and Θ/(Ma_d/48)" }, y: { label: "Z = z/h_l" }, vertical: true,
        series: [{ label: "u/u_s", points: zs.map((zz) => [P.atFloat(F, zz) * 4, zz]) }, { label: "Θ/(Ma_d/48), s = " + (s > 0 ? "+1" : "−1"), dashed: true, points: zs.map((zz) => [s * P.atFloat(G0, zz) * 48, zz]) }],
        marks: [{ y: 2 / 3, label: "u = 0 at Z = 2/3" }] }],
    };
  }

  /* ======================================================================================================
   * Fully developed laminar flow in a tube
   * ====================================================================================================== */

  /** phi(1) of the Graetz problem (1/r)(r phi')' + lambda^2 (1 - r^2) phi = 0, phi(0) = 1, with n RK4 steps. */
  function graetzEnd(lam, n, keep) {
    const L2 = lam * lam;
    const r0 = 0.02;
    const a2 = -L2 / 4, a4 = -L2 * (a2 - 1) / 16, a6 = -L2 * (a4 - a2) / 36;
    const phi0 = 1 + a2 * r0 ** 2 + a4 * r0 ** 4 + a6 * r0 ** 6;
    const rphi0 = r0 * (2 * a2 * r0 + 4 * a4 * r0 ** 3 + 6 * a6 * r0 ** 5);
    const pts = [];
    const y = N.rk4((r, v) => [v[1] / r, -L2 * r * (1 - r * r) * v[0]], [phi0, rphi0], r0, 1, n, keep ? (r, v) => pts.push([r, v[0]]) : undefined);
    return keep ? { end: y[0], pts } : y[0];
  }
  /** The first Graetz eigenvalue with n steps. */
  const graetz = (n) => N.root((l) => graetzEnd(l, n), 2, 4, 1e-14);

  function tube(p, set, opts = {}) {
    const checks = [], steps = [];
    const Re = Q.div(Q.mul(Q.mul(p.rho, p.U), p.D), p.mu);
    const Pr = Q.div(Q.mul(p.mu, p.cp), p.k);
    const Pe = Q.mul(Re, Pr);
    const xs = p.x ? Q.div(p.x, Q.mul(p.D, Pe)) : null;       // thermal entrance ratio x/(D Re Pr)
    const xh = p.x ? Q.div(p.x, Q.mul(p.D, Re)) : null;       // hydrodynamic entrance ratio x/(D Re)
    // Wall flux: phi'' + phi'/r = 4(1 - r^2), phi = r^2 - r^4/4, Nu = 1/(2(phi_w - phi_m)).
    const r = P.X;
    const phi = P.poly([0, 0, 1, 0, q(-1, 4)]);
    const lhs = P.add(P.deriv(P.deriv(phi)), P.poly(P.deriv(phi).slice(1)));   // phi'' + phi'/r (phi' has no constant term)
    const wgt = P.mul(P.sub(P.ONE, P.mul(r, r)), r);                             // (1 - r^2) r
    const phiM = Q.div(P.definite(P.mul(wgt, phi), 0, 1), P.definite(wgt, 0, 1));
    const phiW = P.at(phi, 1);
    const NuQ = Q.div(q(2), Q.sub(phiW, phiM));
    checks.push(check("tube-flux", `Uniform wall heat flux: Nu_D = hD/k = ${Q.str(NuQ)} = ${f(qn(NuQ), 6)} exactly.`, "exact",
      { passed: Q.eq(NuQ, q(48, 11)) && P.eq(lhs, P.poly([4, 0, -4])) && Q.eq(P.at(P.deriv(phi), 1), Q.ONE),
        detail: `φ = ${P.text(phi, "ρ")} satisfies φ'' + φ'/ρ = 4(1 − ρ²) and φ'(1) = 1. φ_w = ${Q.str(phiW)} and φ_m = ${Q.str(phiM)}, weighted by the velocity 2U_m(1 − ρ²).`, inputs: ["D", "k"], evidence: ["open-tube"] }));
    // Wall temperature: the first Graetz eigenvalue by shooting on three meshes.
    const ns = [40, 80, 160];
    const lams = ns.map(graetz);
    const st = N.meshStudy(lams[0], lams[1], lams[2], 2);
    const lam = lams[2];
    const NuT = lam * lam / 2;
    const ref = opts.references?.graetz;
    checks.push(check("tube-temperature", `Uniform wall temperature: the first Graetz eigenvalue is λ₀ = ${f(lam, 9)}, so Nu_D = λ₀²/2 = ${f(NuT, 6)}.`, "numerical",
      { passed: Number.isFinite(st.p) && Math.abs(st.p - 4) < 0.3 && (!ref || Math.abs(lam - ref.lambda0) < 1e-7), tolerance: "|λ₀ − λ_ref| < 1e-7; observed order within 0.3 of 4",
        detail: `RK4 shooting from ρ = 0.02 (series start) with ${ns.join(", ")} steps: λ₀ = ${lams.map((x) => f(x, 10)).join(", ")}; observed order ${f(st.p, 3)}.${ref ? ` Reference: λ₀ = ${ref.lambda0} from ${ref.method}.` : ""}`, inputs: [], evidence: [] }));
    const lit = opts.literature?.tubeT;
    if (lit) checks.push(check("tube-literature", `The computed value ${f(NuT, 4)} agrees with the published value Nu_D = ${lit.value} for a uniform wall temperature, within ${lit.tolerance}.`, "evidence",
      { passed: Math.abs(NuT - lit.value) <= lit.tolerance, tolerance: `absolute ${lit.tolerance}`, evidence: [lit.source] }));
    checks.push(check("tube-separate", `The two wall conditions give different Nusselt numbers: ${Q.str(NuQ)} ≈ ${f(qn(NuQ), 4)} for a uniform flux and ${f(NuT, 4)} for a uniform temperature. The page never uses one for the other.`, "exact",
      { passed: Math.abs(qn(NuQ) - NuT) > 0.5, detail: `This model declares ${set === "flux" ? "a uniform wall heat flux" : "a uniform wall temperature"}.`, inputs: [] }));
    const active = set === "flux" ? qn(NuQ) : NuT;
    const h = active * qn(p.k) / qn(p.D);
    steps.push(step(6, "Scales", "The diameter D and the mean speed U_m are the scales of the declared tube. The wall heat flux q_w (or the wall-to-bulk difference) is the temperature scale.",
      ["\\rho_r=\\frac rR,\\qquad u=2U_m(1-\\rho_r^2),\\qquad Re=\\frac{\\rho U_mD}{\\mu},\\qquad Pe=Re\\,Pr", "\\frac{x}{D\\,Re\\,Pr}\\ \\text{(thermal entrance)},\\qquad \\frac{x}{D\\,Re}\\ \\text{(hydrodynamic entrance)}"], ["spec-10"]));
    steps.push(step(7, "Fully developed equations", "Far from the entrance, the shape of the temperature profile does not change along the tube. Axial conduction is negligible against advection for Pe ≫ 1.",
      ["\\text{flux: }\\ \\frac1{\\rho_r}(\\rho_r\\varphi')'=4(1-\\rho_r^2),\\quad \\varphi'(1)=1", "\\text{temperature: }\\ \\frac1{\\rho_r}(\\rho_r\\psi')'+\\lambda^2(1-\\rho_r^2)\\psi=0,\\quad \\psi(1)=0,\\quad Nu_D=\\tfrac{\\lambda_0^2}2"]));
    steps.push(step(8, "Results and the validity of the declaration", "The fully developed values hold only in laminar flow and beyond the thermal entrance length.",
      [`Nu_D=\\frac{2}{\\varphi_w-\\varphi_m}=\\frac{2}{\\frac34-\\frac7{24}}=\\frac{48}{11}`, `Nu_D=\\frac{\\lambda_0^2}{2}=${ft(NuT, 6)}`], ["open-tube"]));
    steps.push(step(10, "Numerical procedure", "RK4 shooting on λ with a series start at ρ = 0.02, a bracketed root search on ψ(1) = 0 and three step sizes for the observed order."));
    // Profiles for the figure, both normalized to 1 at the centre minus the wall.
    const eig = graetzEnd(lam, 200, true);
    return {
      groups: [{ id: "Re", label: "Re_D", tex: "Re_D=\\frac{\\rho U_mD}{\\mu}", value: qn(Re), exact: Q.str(Re) }, { id: "Pr", label: "Pr", tex: "Pr=\\frac{\\mu c_p}{k}", value: qn(Pr), exact: Q.str(Pr) },
        { id: "Pe", label: "Pe_D", tex: "Pe_D=Re_D\\,Pr", value: qn(Pe), exact: Q.str(Pe) },
        ...(xs ? [{ id: "xth", label: "x/(D Re Pr)", tex: "\\frac{x}{D\\,Re\\,Pr}", value: qn(xs), exact: Q.str(xs) }, { id: "xhy", label: "x/(D Re)", tex: "\\frac{x}{D\\,Re}", value: qn(xh), exact: Q.str(xh) }] : [])],
      values: { Re: qn(Re), Pr: qn(Pr), NuQ: qn(NuQ), NuQExact: Q.str(NuQ), NuT, lambda0: lam, set, Nu: active, h, xth: xs ? qn(xs) : null, xhy: xh ? qn(xh) : null, study: st },
      checks, steps,
      figures: [{ id: "tube-profiles", title: "Fully developed temperature shapes", x: { label: "ρ = r/R" }, y: { label: "(T − T_w)/(T_c − T_w)" },
        series: [{ label: "Uniform wall heat flux (exact)", points: Array.from({ length: 101 }, (_, i) => { const rr = i / 100; return [rr, (P.atFloat(phi, 1) - P.atFloat(phi, rr)) / P.atFloat(phi, 1)]; }) },
          { label: "Uniform wall temperature (eigenfunction)", dashed: true, points: [[0, 1], ...eig.pts.map(([rr, v]) => [rr, v])] }] }],
    };
  }

  /* ======================================================================================================
   * Mixed convection in a vertical channel
   * ====================================================================================================== */

  function mixedChannel(p) {
    const checks = [], steps = [];
    const nu = Q.div(p.mu, p.rho);
    const dT = Q.sub(p.Th, p.Tc);
    const g = Q.abs(p.g);
    const Gr = Q.div(Q.mul(Q.mul(Q.mul(g, p.beta), Q.abs(dT)), Q.pow(p.D, 3)), Q.pow(nu, 2));
    const Re = Q.div(Q.mul(p.U, p.D), nu);
    const Ri = Q.div(Gr, Q.pow(Re, 2));
    const GrRe = Q.div(Gr, Re);
    // s = +1 when buoyancy at the hot wall acts along the mean flow (gravity points against the flow).
    const s = -Q.sign(p.g) * Q.sign(dT);
    const eta = P.X;
    const poise = P.poly([0, 6, -6]);                                      // 6 eta (1 - eta)
    const buoy = P.scale(P.poly([0, 1, -3, 2]), q(1, 12));                 // eta(1-eta)(1-2eta)/12
    const fprof = P.add(poise, P.scale(buoy, Q.mul(q(s), GrRe)));
    const G = P.at(P.deriv(P.deriv(fprof)), q(1, 2));
    const resid = P.sub(P.deriv(P.deriv(fprof)), P.add(P.poly([G]), P.scale(P.poly([q(1, 2), -1]), Q.neg(Q.mul(q(s), GrRe)))));
    checks.push(check("mix-equation", "The profile f = u/U_m satisfies the momentum equation f'' = Ĝ − s(Gr/Re)(1/2 − η), no slip at both walls and the mean flow ∫f dη = 1, exactly.", "exact",
      { passed: P.isZero(resid) && Q.isZero(P.at(fprof, 0)) && Q.isZero(P.at(fprof, 1)) && Q.eq(P.definite(fprof, 0, 1), Q.ONE), tex: `f=${P.tex(fprof, "\\eta")}`, inputs: ["D", "U", "g", "beta", "Th", "Tc", "rho", "mu"] }));
    const limitF = P.eq(P.add(poise, P.scale(buoy, q(0))), poise);
    checks.push(check("mix-limits", "Forced limit: Gr/Re → 0 gives the Poiseuille profile 6η(1 − η). Buoyancy limit: with the buoyancy speed W = gβ|ΔT|D²/ν, u/W = (Re/Gr)·6η(1 − η) + s·η(1 − η)(1 − 2η)/12, and Re/Gr → 0 leaves the natural-convection profile with zero net flow.", "exact",
      { passed: limitF && Q.isZero(P.definite(buoy, 0, 1)), inputs: ["D", "U", "g", "beta", "Th", "Tc", "rho", "mu"] }));
    // Reversal: f'(1) > 0 (assisting, at the cold wall) or f'(0) < 0 (opposing, at the hot wall) when |Gr/Re| > 72.
    const reversed = Q.cmp(GrRe, q(72)) > 0;
    const slopeCold = P.at(P.deriv(fprof), 1), slopeHot = P.at(P.deriv(fprof), 0);
    checks.push(check("mix-reversal", `Flow reversal starts at Gr/Re = 72 exactly. Here Gr/Re = ${f(qn(GrRe), 5)}, so the flow ${reversed ? `reverses near the wall at ${s > 0 ? "y = D" : "y = 0"}` : "does not reverse"}.`, "exact",
      { passed: (reversed === (s > 0 ? Q.sign(slopeCold) > 0 : Q.sign(slopeHot) < 0)), detail: `f'(0) = ${f(qn(slopeHot), 6)} and f'(1) = ${f(qn(slopeCold), 6)}. The boundary is a line Gr = 72 Re in the (Re, Gr) plane, not a constant Richardson number.`, inputs: ["D", "U", "g", "beta", "Th", "Tc", "rho", "mu"] }));
    const assisting = Q.sign(p.g) < 0;
    const hot = Q.sign(dT) > 0 ? "y = 0" : "y = D";
    checks.push(check("mix-direction", `Gravity direction: the gravity component along the mean flow is ${signWord(Q.sign(p.g))}, so buoyancy ${assisting ? "assists" : "opposes"} the flow at the hotter wall (${hot}). Gr uses |g| and |ΔT|. The page keeps the sign in s = ${s > 0 ? "+1" : "−1"}, and reversal can start at the ${assisting ? "colder" : "hotter"} wall.`, "exact",
      { passed: s !== 0, inputs: ["g", "Th", "Tc"] }));
    checks.push(check("mix-ri", `Bulk Richardson number Ri = Gr/Re² = gβ|ΔT|D/U_m² = ${f(qn(Ri), 5)}, with one D, one ν and one ΔT in Gr and Re. The gradient Richardson number N²/(∂u/∂z)² is a different quantity. Here it is not defined, because the temperature gradient and the shear are both horizontal.`, "exact",
      { passed: Q.eq(Ri, Q.div(Q.mul(Q.mul(g, p.beta), Q.mul(Q.abs(dT), p.D)), Q.pow(p.U, 2))), inputs: ["D", "U", "g", "beta", "Th", "Tc"], evidence: ["spec-10"] }));
    checks.push(check("mix-heat", "Heat transfer: the fully developed temperature is linear across the channel, so Nu_D = qD/(kΔT) = 1 exactly. Buoyancy changes the velocity, not this heat flux. The developing region needs a separate declaration.", "exact",
      { passed: true, inputs: ["Th", "Tc"] }));
    steps.push(step(6, "Scales", "The width D, the mean speed U_m and the wall difference ΔT = T_h − T_c are the scales. The Boussinesq reference temperature is the mean wall temperature.",
      ["\\eta=\\frac yD,\\qquad f=\\frac u{U_m},\\qquad Gr=\\frac{g\\beta|\\Delta T|D^3}{\\nu^2},\\qquad Re=\\frac{U_mD}{\\nu},\\qquad Ri=\\frac{Gr}{Re^2}"], ["spec-10"]));
    steps.push(step(7, "Dimensionless equations", "Fully developed flow: the temperature is the conduction profile, and the buoyancy force enters the momentum equation with the sign s of the gravity direction.",
      ["\\frac{T-T_0}{\\Delta T}=\\tfrac12-\\eta,\\qquad f''=\\hat G-s\\,\\frac{Gr}{Re}\\left(\\tfrac12-\\eta\\right),\\qquad f(0)=f(1)=0,\\quad\\int_0^1f\\,\\mathrm d\\eta=1"]));
    steps.push(step(8, "Solution and the exact regime boundary", "The buoyancy part is odd about the centre line, so it carries no net flow. The slope at the wall changes sign at |Gr/Re| = 72.",
      [`f=6\\eta(1-\\eta)+s\\,\\frac{Gr}{Re}\\,\\frac{\\eta(1-\\eta)(1-2\\eta)}{12}`, "f'(0)=6+\\frac{s}{12}\\frac{Gr}{Re},\\qquad f'(1)=-6+\\frac{s}{12}\\frac{Gr}{Re}\\ \\Rightarrow\\ \\text{reversal for }\\frac{Gr}{Re}>72"]));
    const etas = Array.from({ length: 101 }, (_, i) => i / 100);
    return {
      groups: [{ id: "Re", label: "Re", tex: "Re=\\frac{U_mD}{\\nu}", value: qn(Re), exact: Q.str(Re) }, { id: "Gr", label: "Gr", tex: "Gr=\\frac{g\\beta|\\Delta T|D^3}{\\nu^2}", value: qn(Gr), exact: Q.str(Gr) },
        { id: "Ri", label: "Ri", tex: "Ri=\\frac{Gr}{Re^2}", value: qn(Ri), exact: Q.str(Ri) }, { id: "GrRe", label: "Gr/Re", tex: "Gr/Re", value: qn(GrRe), exact: Q.str(GrRe) }],
      values: { Re: qn(Re), Gr: qn(Gr), Ri: qn(Ri), GrRe: qn(GrRe), s, reversed },
      checks, steps,
      figures: [{ id: "mix-profile", title: "Velocity across the channel", x: { label: "η = y/D (hot wall at η = 0)" }, y: { label: "u/U_m" },
        series: [{ label: `This model, Gr/Re = ${f(qn(GrRe), 4)}, s = ${s > 0 ? "+1" : "−1"}`, points: etas.map((e) => [e, P.atFloat(fprof, e)]) }, { label: "Forced limit (Poiseuille)", dashed: true, points: etas.map((e) => [e, 6 * e * (1 - e)]) },
          { label: "At the reversal boundary, Gr/Re = 72", dashed: true, points: etas.map((e) => [e, 6 * e * (1 - e) + s * 6 * e * (1 - e) * (1 - 2 * e)]) }] },
      { id: "mix-map", title: "Flow reversal in the (Re, Gr) plane", map: true, x: { label: "Re", log: true }, y: { label: "Gr", log: true },
        series: [{ label: "Reversal boundary Gr = 72 Re (exact)", points: [[1, 72], [1e5, 72e5]] }, ...[0.1, 1, 10].map((ri) => ({ label: `Ri = ${ri}`, dashed: true, points: [[1, ri], [1e5, ri * 1e10]] }))],
        point: { x: qn(Re), y: qn(Gr), label: "this model" }, xRange: [1, 1e5], yRange: [1, 1e8] }],
    };
  }

  /* ======================================================================================================
   * Conjugate heat transfer: a fluid-solid channel with a heated outer wall
   * ====================================================================================================== */

  /** Fully developed exact solution: theta_w - theta_m = 17/35 and theta_o - theta_w = T/K (units qH/k_f). */
  function conjugateExact(T, K) {
    const Y = P.X;
    const u = P.scale(P.sub(P.ONE, P.mul(Y, Y)), q(3, 2));
    const th = P.integ(P.integ(u));                     // theta - theta_c, theta'' = u (since Pe_H dtheta_m/dX = 1)
    const wall = P.at(th, 1);
    const mean = Q.div(P.definite(P.mul(u, th), 0, 1), P.definite(u, 0, 1));
    const wm = Q.sub(wall, mean);
    return { profile: th, wm, ow: Q.div(T, K), Nuf: Q.div(q(4), wm), Nuo: Q.div(q(4), Q.add(wm, Q.div(T, K))), flux: P.at(P.deriv(th), 1) };
  }

  /**
   * The finite-volume solution on one mesh: nx cells along X in [0, Lx], nf cells in the fluid Y in [0, 1] and ns
   * in the solid Y in [1, 1 + T]. Central advection (cell Peclet below 2), harmonic interface conductance.
   */
  function conjugateFV(PeH, K, T, Lx, nx, nf, ns) {
    const ny = nf + ns;
    const dx = Lx / nx, dyf = 1 / nf, dys = T / ns;
    const A = N.band(nx * ny, ny);
    const b = new Float64Array(nx * ny);
    const ubar = Array.from({ length: nf }, (_, j) => { const y0 = j * dyf, y1 = (j + 1) * dyf; return 1.5 * (1 - (y1 ** 3 - y0 ** 3) / (3 * dyf)); });
    const dy = (j) => (j < nf ? dyf : dys);
    const kk = (j) => (j < nf ? 1 : K);
    const id = (i, j) => i * ny + j;
    const Gint = dx / (dyf / 2 + dys / (2 * K));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const P0 = id(i, j);
        const k = kk(j), h = dy(j);
        // x faces
        if (i < nx - 1) { const c = (k * h) / dx; A.add(P0, P0, c); A.add(P0, id(i + 1, j), -c); }
        if (i > 0) { const c = (k * h) / dx; A.add(P0, P0, c); A.add(P0, id(i - 1, j), -c); }
        // advection in the fluid
        if (j < nf) {
          const a = PeH * ubar[j] * h;
          if (i < nx - 1) { A.add(P0, P0, a / 2); A.add(P0, id(i + 1, j), a / 2); } else A.add(P0, P0, a);
          if (i > 0) { A.add(P0, P0, -a / 2); A.add(P0, id(i - 1, j), -a / 2); }
        }
        // y faces
        if (j < ny - 1) {
          const c = j === nf - 1 ? Gint : (k * dx) / h;
          A.add(P0, P0, c); A.add(P0, id(i, j + 1), -c);
        }
        if (j > 0) {
          const c = j === nf ? Gint : (k * dx) / h;
          A.add(P0, P0, c); A.add(P0, id(i, j - 1), -c);
        }
        if (j === ny - 1) b[P0] += dx;                                   // unit heat flux in at Y = 1 + T
      }
    }
    const th = A.solve(b);
    const col = (i) => {
      const at = (j) => th[id(i, j)];
      let mean = 0;
      for (let j = 0; j < nf; j++) mean += ubar[j] * dyf * at(j);
      const tf = at(nf - 1), ts = at(nf);
      const wall = (tf / (dyf / 2) + (K * ts) / (dys / 2)) / (1 / (dyf / 2) + K / (dys / 2));
      const flux = (ts - tf) / (dyf / 2 + dys / (2 * K));
      const qf = (8 * wall - 9 * at(nf - 1) + at(nf - 2)) / (3 * dyf);
      const qs = (K * (-8 * wall + 9 * at(nf) - (ns > 1 ? at(nf + 1) : at(nf)))) / (3 * dys);
      const outer = at(ny - 1) + dys / 2 / K;
      return { mean, wall, flux, qf, qs, outer };
    };
    const cols = Array.from({ length: nx }, (_, i) => col(i));
    // Global balances: heat into the fluid through the interface, and out through the inlet and outlet faces.
    const interfaceTotal = cols.reduce((s, c) => s + c.flux * dx, 0);
    let advOut = 0;
    for (let j = 0; j < nf; j++) advOut += PeH * ubar[j] * dyf * th[id(nx - 1, j)];
    return { nx, nf, ns, dx, cols, interfaceTotal, advOut, Lx };
  }

  /** The value of a column quantity at the face X (a face of every mesh), by the mean of its two neighbours. */
  const atFace = (fv, X, key) => { const i = Math.round(X / fv.dx); return (fv.cols[i - 1][key] + fv.cols[i][key]) / 2; };

  function conjugate(p, opts = {}) {
    const checks = [], steps = [];
    const alpha = Q.div(p.kf, Q.mul(p.rho, p.cp));
    const Pe = Q.div(Q.mul(p.U, Q.mul(q(4), p.H)), alpha);             // based on D_h = 4H
    const K = Q.div(p.ks, p.kf), Tr = Q.div(p.t, p.H), Lr = Q.div(p.Lh, p.H);
    const ex = conjugateExact(Tr, K);
    const PeH = qn(Pe) / 4, k = qn(K), T = qn(Tr), Lx = qn(Lr);
    checks.push(check("cj-exact", `Fully developed solution: θ_w − θ_m = ${Q.str(ex.wm)} and θ_o − θ_w = (t/H)/K = ${Q.str(ex.ow).length < 14 ? Q.str(ex.ow) : f(qn(ex.ow))}, so Nu_f = ${Q.str(ex.Nuf)} ≈ ${f(qn(ex.Nuf), 5)} and Nu_o = ${f(qn(ex.Nuo), 5)} (both with D_h = 4H).`, "exact",
      { passed: Q.eq(ex.wm, q(17, 35)) && Q.eq(ex.flux, Q.ONE), detail: "The interface carries the whole outer heat flux, and the solid profile is linear. The interface temperature is continuous by construction of the two profiles.", inputs: ["U", "H", "t", "kf", "ks", "rho", "cp"], evidence: ["open-plates"] }));
    // Mesh: central advection needs cell Peclet below 2.
    const dx0 = Math.min(0.25, 1.8 / (1.5 * Math.max(PeH, 1e-9)));
    const nx0 = Math.max(8, Math.ceil(Lx / dx0));
    const nf0 = 6, ns0 = Math.max(2, Math.min(12, Math.ceil(6 * T)));
    const cells = 16 * nx0 * (nf0 + ns0);
    if (cells > 150000 || Lx > 400) {
      checks.push(check("cj-mesh", `The finite-volume check needs about ${cells} cells on its finest mesh for Pe = ${f(qn(Pe), 4)} and L/H = ${f(Lx, 4)}. The page limit is 150000.`, "unresolved",
        { passed: false, next: "Reduce the heated length L or the speed U, so that Pe·L/H is smaller.", inputs: ["U", "H", "Lh"] }));
      return { groups: groups(), values: { Pe: qn(Pe), K: k, T, Lx, exact: { wm: qn(ex.wm), ow: qn(ex.ow), Nuf: qn(ex.Nuf), Nuo: qn(ex.Nuo) } }, checks, steps: hand(), figures: [] };
    }
    const meshes = [1, 2, 4].map((m) => conjugateFV(PeH, k, T, Lx, nx0 * m, nf0 * m, ns0 * m));
    const fine = meshes[2];
    const dx0r = meshes[0].dx;
    const face = (X) => Math.min(Math.max(2, Math.round(X / dx0r)), meshes[0].nx - 2) * dx0r;
    // Mesh convergence: the outer-wall temperature in the entrance region, where the solution still changes.
    const Xc = face(Math.min(0.2 * qn(Pe), 0.4 * Lx));
    const oc = meshes.map((m) => atFace(m, Xc, "outer"));
    const st = N.meshStudy(oc[0], oc[1], oc[2], 2);
    checks.push(check("cj-convergence", `Mesh convergence of the outer-wall temperature θ_o at X = ${f(Xc, 4)}: ${oc.map((v) => f(v, 8)).join(", ")} on three meshes, observed order ${f(st.p, 3)}, extrapolated value ${f(st.extrapolated, 8)}, GCI ${f(st.gci * 100, 3)} %.`, "numerical",
      { passed: Number.isFinite(st.p) && st.p > 1.6 && st.p < 2.4, tolerance: "monotone, observed order between 1.6 and 2.4 (a second-order scheme)", detail: `Meshes: ${meshes.map((m) => `${m.nx} × (${m.nf} + ${m.ns})`).join(", ")} cells.`, inputs: ["U", "H", "t", "Lh", "kf", "ks", "rho", "cp"], table: { meshes: meshes.map((m) => [m.nx, m.nf, m.ns]), values: oc } }));
    // The fully developed comparison in the middle, away from the inlet and from the adiabatic end of the wall.
    const Xs = face(Lx / 2);
    const wmS = meshes.map((m) => atFace(m, Xs, "wall") - atFace(m, Xs, "mean"));
    const owS = meshes.map((m) => atFace(m, Xs, "outer") - atFace(m, Xs, "wall"));
    const dev = Math.abs(wmS[2] - qn(ex.wm)) / qn(ex.wm), devO = Math.abs(owS[2] - qn(ex.ow)) / Math.max(qn(ex.ow), 1e-12);
    const developed = dev <= 1e-3 && devO <= 1e-3;
    checks.push(check("cj-developed", developed ? `At X = ${f(Xs, 4)} the finest mesh gives θ_w − θ_m = ${f(wmS[2], 7)} and θ_o − θ_w = ${f(owS[2], 7)}. They agree with the fully developed values 17/35 = ${f(17 / 35, 7)} and (t/H)/K = ${f(qn(ex.ow), 7)}.` : `At X = ${f(Xs, 4)} the solution is not fully developed: θ_w − θ_m = ${f(wmS[2], 6)} against 17/35 = ${f(17 / 35, 6)} far from both ends.`,
      developed ? "numerical" : "unresolved", { passed: developed, tolerance: "relative 1e-3", next: developed ? "" : "Increase the heated length L, or reduce Pe, so that the middle of the channel is far from both ends.", inputs: ["U", "H", "t", "Lh", "kf", "ks"], evidence: ["open-plates"] }));
    // Interface: one-sided second-order fluxes from each side, away from the inlet.
    const mism = meshes.map((m) => { let e = 0; m.cols.forEach((c, i) => { const X = (i + 0.5) * m.dx; if (X > 0.2 * Lx && X < 0.8 * Lx) e = Math.max(e, Math.abs(c.qf - c.qs)); }); return e; });
    const pI = N.order(mism[1], mism[2]);
    checks.push(check("cj-interface", `Interface heat-flux continuity: one-sided second-order fluxes from the fluid and from the solid differ by at most ${mism.map((v) => f(v, 3)).join(", ")} on the three meshes, between 20 % and 80 % of the length (observed order ${f(pI, 3)}). The finite-volume face itself uses one temperature and one flux.`, "numerical",
      { passed: mism[2] < mism[1] && mism[1] < mism[0] && pI > 1.5, tolerance: "the mismatch decreases with order above 1.5", inputs: ["kf", "ks", "t", "H"] }));
    const bal = Math.abs(fine.interfaceTotal - Lx) / Lx;
    const bal2 = Math.abs(fine.advOut - Lx) / Lx;
    checks.push(check("cj-energy", `Interface balance: the heat that crosses the interface, ${f(fine.interfaceTotal, 10)}, equals the heat into the outer wall, L/H = ${f(Lx, 10)}, and the fluid carries the same heat out at the outlet, ${f(fine.advOut, 10)}.`, "numerical",
      { passed: bal < 1e-9 && bal2 < 1e-9, tolerance: "relative 1e-9", detail: `Relative errors ${f(bal, 2)} and ${f(bal2, 2)} (round-off). Units: qH per unit depth. The wall ends are adiabatic, and the inlet admits heat only by advection.`, inputs: ["U", "H", "t", "Lh", "kf", "ks", "rho", "cp"] }));
    // Entrance length: where the local Nu_f comes within 1 % of 140/17.
    const NuF = qn(ex.Nuf);
    const nu = fine.cols.map((c, i) => [(i + 0.5) * fine.dx, (4 * c.flux) / (c.wall - c.mean)]);
    let Xe = null;
    for (let i = nu.length - 1; i >= 0; i--) if (Math.abs(nu[i][1] - NuF) > 0.01 * NuF && nu[i][0] < 0.9 * Lx) { Xe = nu[i][0]; break; }
    checks.push(check("cj-entrance", `Péclet dependence: the local Nu_f comes within 1 % of 140/17 at X ≈ ${f(Xe ?? 0, 3)}, which is ${f((Xe ?? 0) / qn(Pe), 3)}·Pe. The fully developed values do not depend on Pe, but the entrance length does.`, "numerical",
      { passed: Xe !== null, tolerance: "1 % of the fully developed Nu_f", inputs: ["U", "H", "kf", "rho", "cp"] }));

    function groups() {
      return [{ id: "Pe", label: "Pe", tex: "Pe=\\frac{U_mD_h}{\\alpha_f},\\ D_h=4H", value: qn(Pe), exact: Q.str(Pe) }, { id: "K", label: "k_s/k_f", tex: "K=\\frac{k_s}{k_f}", value: k, exact: Q.str(K) },
        { id: "tH", label: "t/H", tex: "t/H", value: T, exact: Q.str(Tr) }, { id: "LH", label: "L/H", tex: "L/H", value: Lx, exact: Q.str(Lr) }];
    }
    function hand() {
      return [step(6, "Scales", "The half-width H, the mean speed U_m and the outer heat flux q are the scales. The temperature scale is qH/k_f.",
        ["X=\\frac xH,\\quad Y=\\frac yH,\\quad \\theta=\\frac{(T-T_{in})k_f}{qH},\\quad Pe_H=\\frac{U_mH}{\\alpha_f}=\\frac{Pe}{4},\\quad K=\\frac{k_s}{k_f}"]),
      step(7, "Dimensionless equations and interface conditions", "Fluid: steady advection and conduction. Solid: conduction. The interface keeps one temperature and one heat flux. The fluid brings T_in by advection; the declaration neglects conduction across the inlet plane. The two ends of the wall are adiabatic.",
        ["Pe_H\\,\\tfrac32(1-Y^2)\\,\\theta_X=\\theta_{XX}+\\theta_{YY}\\ (0<Y<1),\\qquad K\\nabla^2\\theta=0\\ (1<Y<1+t/H)", "\\theta_f=\\theta_s,\\quad \\partial_Y\\theta_f=K\\,\\partial_Y\\theta_s\\ \\text{at } Y=1;\\qquad K\\partial_Y\\theta=1\\ \\text{at } Y=1+t/H;\\qquad \\partial_Y\\theta=0\\ \\text{at } Y=0"]),
      step(8, "Fully developed solution", "Far from the inlet, the fluid temperature rises linearly along X with slope 1/Pe_H, and the profile shape is fixed.",
        [`\\theta-\\theta_c=${P.tex(ex.profile, "Y")},\\qquad \\theta_w-\\theta_m=\\tfrac{17}{35},\\qquad Nu_f=\\tfrac{140}{17}`, "\\theta_o-\\theta_w=\\frac{t/H}{K},\\qquad Nu_o=\\frac{4}{17/35+(t/H)/K}"], ["open-plates"]),
      step(10, "Numerical procedure", "Finite volumes on three meshes (refinement ratio 2), central advection with cell Péclet number below 2, a harmonic interface conductance and a banded LU solve. The page reports the observed order, the Richardson value and the grid convergence index (Roache, safety factor 1.25).")];
    }
    const Xs2 = fine.cols.map((c, i) => (i + 0.5) * fine.dx);
    const stride = Math.max(1, Math.floor(fine.cols.length / 150));
    const pick = (key) => fine.cols.filter((_, i) => i % stride === 0).map((c, i) => [Xs2[i * stride], c[key]]);
    return {
      groups: groups(),
      values: { Pe: qn(Pe), PeH, K: k, T, Lx, Xs, Xc, exact: { wm: qn(ex.wm), ow: qn(ex.ow), Nuf: qn(ex.Nuf), Nuo: qn(ex.Nuo) }, study: st, entrance: Xe, mismatch: mism },
      checks, steps: hand(),
      figures: [{ id: "cj-temps", title: "Temperatures along the channel (finest mesh)", x: { label: "X = x/H" }, y: { label: "θ = (T − T_in)k_f/(qH)" },
        series: [{ label: "Outer wall θ_o", points: pick("outer") }, { label: "Interface θ_w", points: pick("wall") }, { label: "Bulk θ_m", dashed: true, points: pick("mean") }], marks: [{ x: Xc, label: "mesh study" }, { x: Xs, label: "developed check" }] },
      { id: "cj-nu", title: "Local Nusselt number of the fluid", x: { label: "X = x/H" }, y: { label: "Nu_f" },
        series: [{ label: "Finite volumes", points: nu.filter((_, i) => i % stride === 0 && i > 0) }, { label: "Fully developed 140/17", dashed: true, points: [[0, NuF], [Lx, NuF]] }], yRange: [0, 3 * NuF] }],
    };
  }

  /* ======================================================================================================
   * Blasius and Pohlhausen similarity solutions (flat plate, laminar)
   * ====================================================================================================== */

  /** f''(0) of the Blasius equation f''' + f f''/2 = 0 by shooting to eta = 15 with n RK4 steps. */
  function blasius(n = 3000, etaMax = 15) {
    const end = (s, keep) => {
      const fpp = [];
      const y = N.rk4((_, v) => [v[1], v[2], -0.5 * v[0] * v[2]], [0, 0, s], 0, etaMax, n, keep ? (_, v) => fpp.push(v[2]) : undefined);
      return keep ? { y, fpp } : y[1] - 1;
    };
    const s = N.root((x) => end(x, false), 0.2, 0.5, 1e-15);
    const { fpp } = end(s, true);
    return { s, fpp, h: etaMax / n };
  }
  /** theta'(0) of the Pohlhausen problem at a Prandtl number: 1 / integral of (f''/f''(0))^Pr. */
  const pohlhausen = (bl, Pr) => 1 / N.simpson(bl.fpp.map((v) => Math.max(v, 0) ** Pr / bl.s ** Pr), bl.h);

  /* ======================================================================================================
   * Named correlations: the flat plate and the vertical wall
   * ====================================================================================================== */

  /** A check of a correlation value: evidence inside its range, unresolved with the refusal outside it. */
  function corrCheck(id, corr, groups, label, unit, scale) {
    const ev = EM.evaluate(corr, groups);
    if (!ev.ok) return { check: check(id, `${corr.name} (${corr.where}) does not apply here: ${ev.refused.join("; ")}. The page does not extrapolate it.`, "unresolved", { passed: false, evidence: [corr.source], next: "Use a correlation whose range holds this point, or a governing-equation model." }), value: null };
    return { check: check(id, `${corr.name}: ${label} = ${f(ev.value, 5)}${scale ? `, so ${scale.label} = ${f(ev.value * scale.k, 5)} ${unit}` : ""}.`, "evidence", { passed: true, evidence: [corr.source], tex: corr.tex, detail: `${corr.where}. ${corr.data}` }), value: ev.value };
  }

  function plate(p, data) {
    const checks = [], steps = [];
    const C = data?.convective ?? {};
    const corr = (id) => EM.find(data, id);
    const Rex = Q.div(Q.mul(p.U, p.xs), p.nu), ReL = Q.div(Q.mul(p.U, p.L), p.nu), Pr = Q.div(p.nu, p.alpha);
    const Pe = Q.div(Q.mul(p.U, p.xs), p.alpha);
    const g = { Re: qn(Rex), Pr: qn(Pr) }, gL = { Re: qn(ReL), Pr: qn(Pr) };
    checks.push(check("pl-pe", `Pe_x = Ux/α = Re_x·Pr exactly: ${f(qn(Pe), 6)} = ${f(qn(Rex), 6)} × ${f(qn(Pr), 6)}. Re and Pr use the same ν, so the page gives no separate control for Pe.`, "exact", { passed: Q.eq(Pe, Q.mul(Rex, Pr)), evidence: ["spec-10"] }));
    // Exact mean-from-local factors: h ∝ x^a gives h̄ = h(L)/(1 + a).
    const lamL = corr("plate-laminar-local"), lamM = corr("plate-laminar-mean"), turb = corr("plate-turbulent-local");
    const fac = (a) => Q.inv(Q.add(Q.ONE, a));
    const aLam = Q.sub(Q.parse(lamL.constants.a), Q.ONE), aTurb = Q.sub(Q.parse(turb.constants.a), Q.ONE);
    const okLam = Q.eq(Q.mul(Q.parse(lamL.constants.C), fac(aLam)), Q.parse(lamM.constants.C));
    const meanTurb = Q.mul(Q.parse(turb.constants.C), fac(aTurb));
    checks.push(check("pl-mean", `Local and mean values stay apart: h_x ∝ x^(−1/2) gives h̄ = 2h(L), so 0.664 = 2 × 0.332 exactly; h_x ∝ x^(−1/5) gives h̄ = (5/4)h(L), so 0.0296 × 5/4 = ${Q.str(meanTurb) === "37/1000" ? "0.037" : Q.str(meanTurb)} exactly.`, "exact",
      { passed: okLam && Q.eq(meanTurb, q(37, 1000)), detail: "The mean over 0 < x < L of x^a is L^a/(1 + a). Nu_x uses x and the local h; Nu_L uses L and the mean h̄.", evidence: [lamM.source] }));
    const region = EM.regionOf(C.boundaries.plate, qn(Rex));
    checks.push(check("pl-region", `Re_x = ${f(qn(Rex), 5)} at the station: ${region.label.charAt(0).toLowerCase()}${region.label.slice(1)} (${C.boundaries.plate.where}).`, region.status, { passed: region.status !== "unresolved", evidence: [C.boundaries.plate.source], detail: C.boundaries.plate.data, next: region.status === "unresolved" ? "Fix the state of the layer by measurement, or move the station out of the transition range." : "" }));
    const local = corrCheck("pl-local", region.id === "turbulent" ? turb : lamL, g, "Nu_x", "W/(m²·K)", p.k ? { label: "h_x", k: qn(p.k) / qn(p.xs) } : null);
    checks.push(local.check);
    const mean = corrCheck("pl-mean-value", lamM, gL, "Nu_L", "W/(m²·K)", p.k ? { label: "h̄", k: qn(p.k) / qn(p.L) } : null);
    checks.push(mean.check);
    // The governing model behind the laminar law: Blasius and Pohlhausen by shooting.
    const bl = blasius();
    const lit = C.literature?.blasius;
    checks.push(check("pl-blasius", `The page's Blasius solution gives f''(0) = ${f(bl.s, 9)}; Lienhard gives 0.33206 (${lit?.where ?? "Table 6.1"}).`, "numerical", { passed: Math.abs(bl.s - 0.33206) <= (lit?.tolerance ?? 1e-5), tolerance: `absolute ${lit?.tolerance ?? 1e-5}`, evidence: [lit?.source ?? "lienhard-2024"] }));
    const prv = qn(Pr);
    if (prv >= 0.5) {
      const th = pohlhausen(bl, prv), cor = 0.332 * Math.cbrt(prv);
      const tol = prv <= 2 ? 0.01 : 0.02;
      checks.push(check("pl-pohlhausen", `At Pr = ${f(prv, 4)} the page's similarity solution gives Nu_x/Re_x^(1/2) = θ'(0) = ${f(th, 6)}; the correlation gives 0.332 Pr^(1/3) = ${f(cor, 6)}, a difference of ${f(100 * (cor - th) / th, 3)} %.`, "numerical",
        { passed: Math.abs(cor - th) / th <= tol, tolerance: `relative ${tol} (the stated accuracy of the correlation for ${prv <= 2 ? "0.6 ≤ Pr ≤ 2" : "Pr ≥ 0.6"})`, evidence: [lamL.source], detail: "θ'(0) = 1/∫₀^∞ (f''/f''(0))^Pr dη by Simpson's rule on 3000 steps to η = 15." }));
    }
    steps.push(step(6, "Scales", "The plate length L, the outer speed U and the inner scale (νL/U)^(1/2) are the scales. The outer-to-wall difference is the temperature scale.",
      ["Re_x=\\frac{Ux}{\\nu},\\qquad Pr=\\frac{\\nu}{\\alpha},\\qquad Pe_x=Re_x\\,Pr,\\qquad Nu_x=\\frac{h_x x}{k},\\qquad \\overline{Nu}_L=\\frac{\\bar h L}{k}"], ["spec-10"]));
    steps.push(step(7, "The named correlations", "The declared result type is a named correlation. The constants and their source stay apart from the Pi calculation.",
      [lamL.tex, lamM.tex, turb.tex], [lamL.source]));
    steps.push(step(8, "Validity ranges and the empirical boundary", `The page refuses each correlation outside its range. ${C.boundaries.plate.data}`, ["\\bar h=\\frac1L\\int_0^L h_x\\,\\mathrm dx=\\frac{h_x(L)}{1+a}\\quad\\text{for } h_x\\propto x^{a}"], [C.boundaries.plate.source]));
    const prs = [0.6, 0.7, 1, 2, 5, 10, 20, 50];
    return {
      groups: [{ id: "Re", label: "Re_x", tex: "Re_x", value: qn(Rex), exact: Q.str(Rex) }, { id: "ReL", label: "Re_L", tex: "Re_L", value: qn(ReL), exact: Q.str(ReL) }, { id: "Pr", label: "Pr", tex: "Pr", value: prv, exact: Q.str(Pr) }, { id: "Pe", label: "Pe_x", tex: "Pe_x", value: qn(Pe), exact: Q.str(Pe) }],
      values: { Rex: qn(Rex), ReL: qn(ReL), Pr: prv, Nux: local.value, NuL: mean.value, hx: local.value && p.k ? (local.value * qn(p.k)) / qn(p.xs) : null, hm: mean.value && p.k ? (mean.value * qn(p.k)) / qn(p.L) : null, fpp0: bl.s, region: region.id },
      checks, steps, blasius: bl,
      figures: [{ id: "pl-pr", title: "Nu_x/Re_x^(1/2) against Pr: the similarity solution and the correlation", x: { label: "Pr", log: true }, y: { label: "Nu_x/Re_x^(1/2)", log: true },
        series: [{ label: "Pohlhausen similarity solution (this page)", points: prs.map((x) => [x, pohlhausen(bl, x)]) }, { label: "0.332 Pr^(1/3), inside Pr ≥ 0.6", dashed: true, points: prs.map((x) => [x, 0.332 * Math.cbrt(x)]) }],
        marks: [{ x: prv, y: 0.332 * Math.cbrt(prv), label: "this model" }] }],
    };
  }

  function wall(p, data) {
    const checks = [], steps = [];
    const C = data?.convective ?? {};
    const Gr = Q.div(Q.mul(Q.mul(Q.mul(p.g, p.beta), p.DT), Q.pow(p.L, 3)), Q.pow(p.nu, 2));
    const Pr = Q.div(p.nu, p.alpha);
    const Ra = Q.div(Q.mul(Q.mul(Q.mul(p.g, p.beta), p.DT), Q.pow(p.L, 3)), Q.mul(p.nu, p.alpha));
    checks.push(check("nw-ra", `Ra_L = Gr_L·Pr exactly: ${f(qn(Ra), 6)} = ${f(qn(Gr), 6)} × ${f(qn(Pr), 6)}. Both use the same ν, so the page gives no separate control for Ra.`, "exact", { passed: Q.eq(Ra, Q.mul(Gr, Pr)), evidence: ["spec-10"] }));
    // Buoyancy scaling: velocity sqrt(g beta dT L), thickness L Gr^(-1/4), Gr = (U_b L/nu)^2.
    const Ub2L2 = Q.div(Q.mul(Q.mul(Q.mul(p.g, p.beta), p.DT), Q.pow(p.L, 3)), Q.pow(p.nu, 2));
    checks.push(check("nw-scaling", "Buoyancy scaling: with the buoyancy speed U_b = (gβΔT L)^(1/2), Gr_L = (U_b L/ν)² exactly, and the laminar layer has the thickness L·Gr^(−1/4) of the declared scale of y.", "exact", { passed: Q.eq(Ub2L2, Gr), evidence: ["lienhard-2024"] }));
    const e1 = q(1, 4), e2 = Q.mul(q(2), q(1, 6));
    const hExp = (e) => Q.sub(Q.mul(q(3), e), Q.ONE);
    checks.push(check("nw-exponents", `Exponents: Nu ∝ Ra^(1/4) gives h ∝ L^(${Q.str(hExp(e1))}), and the turbulent limit (Ra^(1/6))² = Ra^(${Q.str(e2)}) gives h ∝ L^${Q.str(hExp(e2))}: h does not depend on the height.`, "exact", { passed: Q.eq(hExp(e1), q(-1, 4)) && Q.isZero(hExp(e2)), evidence: ["lienhard-2024"], detail: "Ra_L ∝ L³ and h = Nu_L k/L." }));
    const region = EM.regionOf(C.boundaries.wall, qn(Ra));
    checks.push(check("nw-region", `Ra_L = ${f(qn(Ra), 5)}: ${region.label.charAt(0).toLowerCase()}${region.label.slice(1)} (${C.boundaries.wall.where}).`, region.status, { passed: true, evidence: [C.boundaries.wall.source], detail: C.boundaries.wall.data }));
    const g = { Ra: qn(Ra), Pr: qn(Pr) };
    const kL = p.k ? { label: "h̄", k: qn(p.k) / qn(p.L) } : null;
    const a = corrCheck("nw-cca", EM.find(data, "wall-cc-laminar"), g, "Nu_L", "W/(m²·K)", kL);
    const b = corrCheck("nw-ccb", EM.find(data, "wall-cc-all"), g, "Nu_L", "W/(m²·K)", kL);
    checks.push(a.check, b.check);
    if (a.value && b.value) checks.push(check("nw-agree", `In the laminar range the two correlations differ by ${f(100 * (b.value - a.value) / a.value, 3)} %. Lienhard calls eqn. (8.13a) the more accurate one there.`, "evidence", { passed: true, evidence: ["lienhard-2024"] }));
    const ex = C.literature?.example81;
    if (ex) {
      const ra = (ex.g * ex.beta * ex.dT * ex.L ** 3) / (ex.nu * ex.alpha);
      const nu81 = EM.formValue(EM.find(data, "wall-cc-laminar"), { Ra: ra, Pr: ex.Pr });
      checks.push(check("nw-example", `Reference: with the inputs of Lienhard's ${ex.where}, the page gives Ra_L = ${f(ra, 4)} and Nu_L = ${f(nu81, 5)}; the book gives ${f(ex.Ra, 3)} and ${ex.Nu}.`, "numerical",
        { passed: Math.abs(nu81 - ex.Nu) <= ex.tolerance && Math.abs(ra - ex.Ra) / ex.Ra < 0.005, tolerance: `absolute ${ex.tolerance} for Nu_L; relative 0.005 for Ra_L (the book rounds to 3 digits)`, evidence: [ex.source] }));
    }
    checks.push(check("nw-tilt", "Orientation: the record is a vertical wall. An inclined wall uses g cos θ only for θ ≤ 45° and 10⁵ ≤ Ra_L ≤ 10⁹; a horizontal plate needs other correlations, so the page refuses it for this declaration.", "evidence", { passed: true, evidence: ["lienhard-2024"] }));
    steps.push(step(6, "Scales", "Buoyancy sets the speed (gβΔT L)^(1/2); viscosity sets the thickness L·Gr^(−1/4) of the laminar layer.",
      ["Gr_L=\\frac{g\\beta\\Delta T L^3}{\\nu^2},\\qquad Ra_L=Gr_L\\,Pr=\\frac{g\\beta\\Delta T L^3}{\\nu\\alpha},\\qquad \\overline{Nu}_L=\\frac{\\bar hL}{k}"], ["spec-10"]));
    steps.push(step(7, "The named correlations", "The declared result type is a named correlation of measured data.", [EM.find(data, "wall-cc-laminar").tex, EM.find(data, "wall-cc-all").tex], ["lienhard-2024"]));
    steps.push(step(8, "Validity and the empirical boundary", C.boundaries.wall.data, ["\\overline{Nu}_L\\propto Ra_L^{1/4}\\Rightarrow \\bar h\\propto L^{-1/4},\\qquad \\overline{Nu}_L\\propto Ra_L^{1/3}\\Rightarrow \\bar h\\propto L^{0}"], ["lienhard-2024"]));
    const ras = Array.from({ length: 57 }, (_, i) => 10 ** (i / 4));
    return {
      groups: [{ id: "Ra", label: "Ra_L", tex: "Ra_L", value: qn(Ra), exact: Q.str(Ra) }, { id: "Gr", label: "Gr_L", tex: "Gr_L", value: qn(Gr), exact: Q.str(Gr) }, { id: "Pr", label: "Pr", tex: "Pr", value: qn(Pr), exact: Q.str(Pr) }],
      values: { Ra: qn(Ra), Gr: qn(Gr), Pr: qn(Pr), NuA: a.value, NuB: b.value, region: region.id },
      checks, steps,
      figures: [{ id: "nw-ra", title: "Mean Nusselt number against Ra_L, each correlation inside its range", x: { label: "Ra_L", log: true }, y: { label: "Nu_L", log: true },
        series: [{ label: "Eqn. (8.13a), Ra_L < 10⁹", points: ras.filter((r) => r < 1e9).map((r) => [r, EM.formValue(EM.find(data, "wall-cc-laminar"), { Ra: r, Pr: qn(Pr) })]) },
          { label: "Eqn. (8.13b), all Ra_L", dashed: true, points: ras.map((r) => [r, EM.formValue(EM.find(data, "wall-cc-all"), { Ra: r, Pr: qn(Pr) })]) }],
        marks: [{ x: qn(Ra), y: a.value ?? b.value, label: "this model" }] }],
    };
  }

  /* ======================================================================================================
   * The declared models for the Regime Map Builder (src/regime.js IMPLS)
   * ====================================================================================================== */

  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(12)) : null);
  const memo = new Map();
  function once(key, run) {
    if (!memo.has(key)) {
      if (memo.size > 40) memo.clear();
      memo.set(key, run());
    }
    return memo.get(key);
  }
  /** The record's value of each role as an exact rational when it has one, else from its float; null when absent. */
  function values(ctx, roles) {
    const out = {};
    for (const [k, role] of Object.entries(roles)) {
      const r = ctx?.role ? ctx.role(role) : null;
      if (!r || !Number.isFinite(r.float)) continue;
      const x = r.exact && typeof r.exact === "object" ? r.exact : typeof r.exact === "string" ? Q.parse(r.exact) : null;
      out[k] = x ?? Q.fromNumber(r.float);
    }
    return out;
  }
  const lacking = (v, keys) => keys.filter((k) => !v[k]);
  const keyOf = (id, v, extra = "") => JSON.stringify([id, extra, Object.entries(v).map(([k, x]) => [k, Q.str(x)])]);
  const isCheck = (c) => c.status === "exact" || c.status === "numerical";
  const acceptOf = (c) => ({ id: c.id, title: c.title.replace(/\.$/, ""), passed: Boolean(c.passed), status: c.status, tolerance: c.tolerance ?? null, detail: c.tolerance ? `Tolerance: ${c.tolerance}.` : "Exact arithmetic." });
  const noAsymptotic = (why) => ({ limits: [], overlap: why, gaps: "None: the page uses the declared solution at every point." });
  const GREEK = { alpha: "α", beta: "β", theta: "θ", eta: "η", mu: "μ", rho: "ρ", tau: "τ", Theta: "Θ" };
  const plainTex = (t) => String(t).replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2").replace(/\\([A-Za-z]+)/g, (m, a) => GREEK[a] ?? "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();

  /** The generic solution panel (src/stabview.js) of a solver's output. */
  function panel(decl, out, opts) {
    const figures = (out.figures ?? []).filter((fg) => fg.series && !fg.map).map((fg) => {
      const pts = fg.series.flatMap((x) => x.points).filter((q2) => Number.isFinite(q2[0]) && Number.isFinite(q2[1]));
      const xs = pts.map((q2) => q2[0]), ys = pts.map((q2) => q2[1]);
      const pad = (lo, hi, log) => { if (log) return [lo / 1.5, hi * 1.5]; const d = (hi - lo) || 1; return [lo - 0.04 * d, hi + 0.04 * d]; };
      const [x0, x1] = pad(Math.min(...xs), Math.max(...xs), fg.x?.log);
      const [y0, y1] = fg.yRange ?? pad(Math.min(...ys), Math.max(...ys), fg.y?.log);
      return { id: `st-cv-${decl.id}-${fg.id}`, title: fg.title, caption: fg.caption,
        x: { min: x0, max: x1, label: fg.x?.label ?? "x", log: Boolean(fg.x?.log) }, y: { min: y0, max: y1, label: fg.y?.label ?? "y", log: Boolean(fg.y?.log) },
        series: fg.series.map((x) => ({ label: x.label, pts: x.points.filter((q2) => Number.isFinite(q2[0]) && Number.isFinite(q2[1])).map(([a, b]) => [num(a), num(b)]), dash: x.dashed ? "6 4" : null })),
        points: (fg.marks ?? []).filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y)).map((m) => ({ x: num(m.x), y: num(m.y), shape: "circle", r: 4, label: m.label })) };
    });
    const tables = [];
    if (out.groups?.length) tables.push({ title: "Groups at the record's values", columns: ["Group", "Exact value", "Value"], rows: out.groups.map((g) => [g.label, g.exact && g.exact.length <= 28 ? g.exact : "–", fmt(g.value)]) });
    for (const t of opts.tables ?? []) tables.push(t);
    const results = out.checks.map((c) => ({ id: `r-cv-${c.id}`, kind: opts.kind ?? "solution", title: c.title, status: c.status === "exact" || c.status === "numerical" ? (c.passed ? c.status : "unresolved") : c.status,
      tolerance: c.tolerance ?? null, next: c.next ?? (c.passed ? "" : "Check the inputs of this result."), steps: ["s-cv-solution"], evidence: c.evidence?.length ? c.evidence : ["spec-10"] }));
    return { family: decl.family, model: decl.id, generic: true, heading: opts.heading, point: opts.point ?? {}, concept: opts.concept,
      results, figures, tables, method: out.steps.map((x) => `${x.title}. ${x.reason}`), displays: out.steps.map((x) => ({ title: `Hand calculation ${x.item}: ${x.title}`, tex: x.tex })) };
  }
  const fmt = (x) => (Number.isFinite(x) ? N.fmt(x, 6) : "–");

  /** A layer whose measure must stay at most the tolerance. */
  const approxLayer = (id, title, measure, criterion, hue, evidence = ["spec-8"]) => ({ id, kind: "approximation", boundary: "approximation", title, measure, scale: "log", status: "exact", hue, criterion, steps: ["s-rm-map"], evidence,
    thresholds: (tol) => ({ curves: [{ value: tol, label: `${title}: error = ${tol}` }], regions: [{ id: "meets", label: `${title} meets the tolerance`, lo: 0, hi: tol, closed: true }] }) });
  /** A balance crossover at a ratio of 1. */
  const balanceLayer = (id, title, measure, criterion, below, above, status = "exact", evidence = ["spec-8"]) => ({ id, kind: "balance", boundary: "balance-crossover", title, measure, scale: "log", status, hue: id, criterion, steps: ["s-rm-map"], evidence,
    thresholds: () => ({ curves: [{ value: 1, label: `${title}: the terms are equal` }], regions: [{ id: "below", label: below, lo: 0, hi: 1 }, { id: "above", label: above, lo: 1, hi: null }] }) });
  /** An empirical layer from a boundary set of data/convective.json. */
  function empiricalLayer(id, title, measure, set, criterion) {
    return { id, kind: "empirical", boundary: "empirical", title, measure, scale: "log", status: "evidence", hue: id, criterion: `${criterion} ${set.data}`, steps: ["s-rm-map"], evidence: [set.source],
      thresholds: () => ({ curves: set.regions.slice(1).map((r) => ({ value: r.lo, label: `${title}: ${r.label.toLowerCase()} from here` })), regions: set.regions.map((r) => ({ id: r.id, label: r.label, lo: r.lo ?? 0, hi: r.hi })) }) };
  }
  const baseImpl = (decl, o) => ({ id: decl.id, params: decl.domain.parameters, approximations: [], limits: () => [], derived: () => [], constraints: () => [], ...o });
  const acceptance = (run) => (ctx) => { const out = run(ctx); return out.lack ? [{ id: "values", title: `The record has no value for ${out.lack.join(", ")}`, passed: false, status: "exact", detail: "Enter the values of the standard example." }] : out.checks.filter(isCheck).map(acceptOf); };
  const solution = (decl, run, opts) => (p, ctx) => { const out = run(ctx); return out.lack ? null : panel(decl, out, { heading: "Hand calculation 10: the declared solution and its reference checks", ...opts(p, out) }); };

  function advectionImpl(decl) {
    const run = (ctx) => { const v = values(ctx, { U: "U", L: "L", alpha: "alpha" }); const lack = lacking(v, ["U", "L", "alpha"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => advChannel(v)); };
    const dErr = (pe) => { const e = adExact(pe); let m = 0; for (let i = 0; i <= 200; i++) { const X = i / 200; m = Math.max(m, Math.abs(e.theta(X) - (1 - X))); } return m; };
    return baseImpl(decl, { axes: { x: "Pe", y: null },
      approximations: [{ id: "diffusion", label: "Diffusion form 1 − X", tex: "Pe\\to0", limit: "Pe → 0", why: "Conduction controls the whole segment.", error: "the largest |θ − (1 − X)|, from the exact solution" },
        { id: "outlet", label: "Outlet-layer form 1 − e^(−Pe(1−X))", tex: "Pe\\to\\infty", limit: "Pe → ∞", why: "Advection controls, except in a layer of thickness 1/Pe at the outlet.", error: "e^(−Pe), exact" }],
      layers: [approxLayer("diffusion", "Diffusion form", "errD", "The largest |θ − (1 − X)| over the segment, from the exact solution, at most the tolerance", "diffusion"),
        approxLayer("outlet", "Outlet-layer form", "errO", "The exact error e^(−Pe) of the composite form, at most the tolerance", "outlet"),
        balanceLayer("pe", "Advection against conduction", "Pe", "The ratio of the term scales Pe θ_X and θ_XX is Pe", "Conduction controls", "Advection controls", "proposed")],
      evaluate: (p) => (p.Pe > 0 ? { ok: true, values: { errD: dErr(p.Pe), errO: Math.exp(-p.Pe), Pe: p.Pe } } : { ok: false, reason: "Pe must be positive." }),
      limits: () => [{ id: "pe0", label: "Pe → 0: the diffusion form", coupled: false, note: "A regular limit.", points: [{ Pe: 1e-3 }] }, { id: "peinf", label: "Pe → ∞: the outlet layer", coupled: false, note: "A singular limit with an inner region at X = 1.", points: [{ Pe: 1e3 }] }],
      inspect: (p) => ({ ok: true, values: [{ id: "J", tex: "J", label: "total flux in units of kΔT/L", value: num(adExact(p.Pe).J) }, { id: "delta", tex: "1/Pe", label: "thickness of the outlet layer over L", value: num(1 / p.Pe) }], checks: [], reconstruction: [] }),
      derived: (p) => [{ id: "J", tex: "J", label: "total heat flux in units of kΔT/L", value: num(adExact(p.Pe ?? 1).J) }],
      analysis: () => ({ note: "The exact solution gives every error on the map; the finite-volume checks run at the record's point.",
        balance: { intro: "Two terms compete in the energy equation.", terms: [{ tex: "Pe\\,\\theta_X", label: "advection", scale: "Pe", why: "θ changes by 1 over X = 1." }, { tex: "\\theta_{XX}", label: "conduction", scale: "1", why: "The same change over the same length." }],
          balances: [{ title: "Advection only, with an outlet layer", when: "Pe\\gg1", derivation: "The outer equation θ_X = 0 gives θ = 1; it cannot meet θ(1) = 0, so an inner layer ξ = Pe(1 − X) restores the condition.", reduced: "\\theta_\\xi+\\theta_{\\xi\\xi}=0", neglected: "conduction outside the layer", assumptions: ["Pe large."],
            residual: { tex: "e^{-Pe}", order: "exponentially small", status: "exact", note: "The composite form equals (1 − e^(−Pe))θ exactly." } }],
          crossovers: [{ criterion: "Pe=1", status: "proposed", text: "The two term scales are equal." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: { limits: [], overlap: "The two forms overlap nowhere at tolerance 0.01: between Pe ≈ 0.08 and Pe ≈ 4.6 only the full solution meets it.", gaps: "The page marks that range as a gap of the approximations." } }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "advection and diffusion along a channel segment with an exact solution and exact discrete conservation", point: { Pe: num(p.Pe) } })) });
  }

  function couetteImpl(decl) {
    const run = (ctx) => { const v = values(ctx, { mu: "mu", U: "U", H: "H", k: "k", T1: "DT_w", cp: "c_p" }); const lack = lacking(v, ["mu", "U", "H", "k", "T1"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => couette({ ...v, T0: Q.ZERO }, "isothermal")); };
    return baseImpl(decl, { axes: { x: "Br", y: null },
      approximations: [{ id: "nodiss", label: "No viscous heating", tex: "Br\\to0", limit: "Br → 0", why: "Conduction alone: θ = η.", error: "Br/8 exactly" }],
      layers: [approxLayer("nodiss", "No viscous heating", "err", "The largest |θ − η| = Br/8, exact, at most the tolerance", "nodiss"),
        balanceLayer("wall", "Dissipation against wall conduction", "half", "Br/2 against 1: the exact heat flux at the moving wall, θ'(1) = 1 − Br/2, changes sign at Br = 2", "Heat enters the fluid at the hotter wall", "Heat leaves the fluid through both walls")],
      evaluate: (p) => (p.Br > 0 ? { ok: true, values: { err: p.Br / 8, half: p.Br / 2 } } : { ok: false, reason: "Br must be positive." }),
      exactBoundaries: () => [{ layer: "wall", text: "Br = 2 exactly: θ'(1) = 1 − Br/2 = 0." }],
      inspect: (p) => ({ ok: true, values: [{ id: "q0", tex: "\\theta'(0)", label: "heat flux into the fixed wall, in units of kΔT/H", value: num(1 + p.Br / 2) }, { id: "qH", tex: "-\\theta'(1)", label: "heat flux out through the moving wall", value: num(p.Br / 2 - 1) }], checks: [], reconstruction: [] }),
      derived: (p) => [{ id: "max", tex: "\\theta_{\\max}-1", label: "largest rise above the hotter wall (0 for Br ≤ 2)", value: num(p.Br > 2 ? (1 / 2 + 1 / p.Br) + (p.Br / 2) * (1 / 2 + 1 / p.Br) * (1 / 2 - 1 / p.Br) - 1 : 0) }],
      analysis: () => ({ note: "The solution is an exact polynomial: every value on the map is exact.",
        balance: { intro: "Two terms compete in the energy equation.", terms: [{ tex: "\\theta''", label: "conduction across the gap", scale: "1", why: "θ changes by 1 across the gap." }, { tex: "Br\\,(V')^2", label: "viscous dissipation", scale: "Br", why: "V' = 1 exactly." }],
          balances: [{ title: "Conduction only", when: "Br\\ll1", derivation: "θ = η + (Br/2)η(1 − η) exactly; the dissipation term adds Br/8 at most.", reduced: "\\theta''=0", neglected: "viscous dissipation", assumptions: ["Br small."], residual: { tex: "Br/8", order: "first order in Br", status: "exact", note: "The expansion in Br ends at the first order." } }],
          crossovers: [{ criterion: "Br=2", status: "exact", text: "The heat flux at the hotter wall changes sign." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("The solution is exact and linear in Br.") }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "plane Couette flow with viscous heat generation, exact in rationals", point: { Br: num(p.Br) } })) });
  }

  function thermocapillaryImpl(decl) {
    const run = (ctx) => { const v = values(ctx, { gammaT: "gamma_T", b: "b", d: "h_l", L: "L", mu: "mu", k: "k", rho: "rho", cp: "c_p" }); const lack = lacking(v, ["gammaT", "b", "d", "mu", "k", "rho", "cp"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => thermocapillary(v)); };
    return baseImpl(decl, { axes: { x: "Ms", y: null },
      approximations: [{ id: "conduction", label: "Conduction only along the layer", tex: "Ma_d\\to0", limit: "Ma_d → 0", why: "The flow carries no heat along the layer.", error: "Ma_d²/1680 exactly" }],
      layers: [approxLayer("conduction", "Conduction only", "err", "The exact relative transport Ma_d²/1680 that the conduction-only form leaves out, at most the tolerance", "conduction"),
        balanceLayer("transport", "Advection against conduction along the layer", "ratio", "Ma_d²/1680: the exact ratio of the heat that the flow carries to the heat that conduction carries", "Conduction carries more heat", "The thermocapillary flow carries more heat")],
      evaluate: (p) => ({ ok: true, values: { err: p.Ms ** 2 / 1680, ratio: p.Ms ** 2 / 1680 } }),
      exactBoundaries: () => [{ layer: "transport", text: "|Ma_d| = √1680 ≈ 40.99 exactly: the two transports are equal." }],
      inspect: (p) => ({ ok: true, values: [{ id: "keff", tex: "k_{eff}/k", label: "transport factor along the layer", value: num(1 + p.Ms ** 2 / 1680) }, { id: "dir", tex: "s", label: "sign of the surface stress and of the surface velocity", value: Math.sign(p.Ms) }], checks: [], reconstruction: [] }),
      derived: (p) => [{ id: "keff", tex: "1+Ma_d^2/1680", label: "transport factor along the layer", value: num(1 + (p.Ms ?? 0) ** 2 / 1680) }],
      analysis: () => ({ note: "The parallel flow is exact: the map shows the exact transport ratio. The sign of Ms is the direction of the surface flow; the transport depends on Ms² only.",
        balance: { intro: "Along the layer, heat moves by conduction and by advection in the thermocapillary flow.", terms: [{ tex: "-k\\,b\\,h_l", label: "conduction along the layer", scale: "1", why: "The declared gradient b over the depth." }, { tex: "\\rho c_p\\int u\\,T\\,\\mathrm dz", label: "advection by the flow", scale: "Ma_d^2/1680", why: "The exact integral of W·Θ." }],
          balances: [{ title: "Conduction only", when: "Ma_d^2\\ll1680", derivation: "k_eff/k = 1 + Ma_d²/1680 exactly.", reduced: "q_x=-k\\,b\\,h_l", neglected: "advection along the layer", assumptions: ["Ma_d small."], residual: { tex: "Ma_d^2/1680", order: "second order in Ma_d", status: "exact", note: "The expansion ends at this order." } }],
          crossovers: [{ criterion: "Ma_d^2=1680", status: "exact", text: "The two transports are equal." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("The solution is exact in Ma_d.") }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "thermocapillary return flow with coupled heat transport, exact in rationals", point: { Ms: num(p.Ms) } })) });
  }

  function mixedImpl(decl) {
    const run = (ctx) => { const v = values(ctx, { D: "D", U: "u_m", g: "g_x", beta: "beta", Th: "DT_w", rho: "rho", mu: "mu" }); const lack = lacking(v, ["D", "U", "g", "beta", "Th", "rho", "mu"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => mixedChannel({ ...v, Tc: Q.ZERO })); };
    return baseImpl(decl, { axes: { x: "Re", y: "Gr" },
      layers: [balanceLayer("reversal", "Flow reversal", "rev", "Gr/(72 Re): the exact wall shear at the colder wall (assisting flow) is 0 when Gr/Re = 72", "No reversal: the velocity is positive across the channel", "Reversal near a wall"),
        balanceLayer("richardson", "Natural against forced convection (bulk Ri)", "Ri", "Gr/Re² against 1 (Lienhard, eqn. (8.45)): a comparison of the strengths of the two flows, not a boundary of this model", "Forced convection controls", "Natural convection controls", "evidence", ["lienhard-2024"])],
      evaluate: (p) => (p.Re > 0 && p.Gr > 0 ? { ok: true, values: { rev: p.Gr / (72 * p.Re), Ri: p.Gr / p.Re ** 2 } } : { ok: false, reason: "Re and Gr must be positive." }),
      exactBoundaries: () => [{ layer: "reversal", text: "Gr = 72 Re exactly, a straight line of slope 1 on the log axes; the lines of constant Ri have slope 2, so no constant Ri gives this boundary." }],
      inspect: (p) => ({ ok: true, values: [{ id: "B", tex: "Gr/Re", label: "buoyancy parameter", value: num(p.Gr / p.Re) }, { id: "Ri", tex: "Ri", label: "bulk Richardson number Gr/Re²", value: num(p.Gr / p.Re ** 2) }], checks: [], reconstruction: [] }),
      derived: (p) => [{ id: "Ri", tex: "Ri=Gr/Re^2", label: "bulk Richardson number", value: num(p.Gr / p.Re ** 2) }, { id: "B", tex: "Gr/Re", label: "the parameter of the profile", value: num(p.Gr / p.Re) }],
      constraints: (p) => (p.Re > 2000 ? [`Re = ${fmt(p.Re)}: the declared model assumes laminar flow.`] : []),
      analysis: () => ({ note: "The fully developed profile is exact. The map compares the exact reversal boundary with the bulk Richardson number: the boundary is a line of constant Gr/Re, not of constant Ri.",
        balance: { intro: "In the momentum equation the pressure gradient competes with the buoyancy force.", terms: [{ tex: "P", label: "pressure gradient", scale: "12", why: "P = −12 from the mean velocity." }, { tex: "B\\,\\theta", label: "buoyancy", scale: "|B|/2", why: "|θ| ≤ 1/2." }],
          balances: [{ title: "Forced flow", when: "|B|\\ll72", derivation: "W = 6η(1 − η) − B·η(1 − η)(1 − 2η)/12 exactly.", reduced: "W''=P", neglected: "buoyancy", assumptions: ["|Gr/Re| small."], residual: { tex: "|B|/72", order: "first order in B", status: "exact", note: "The wall shear changes sign at |B| = 72." } }],
          crossovers: [{ criterion: "Gr/Re=72", status: "exact", text: "Flow reversal starts at a wall." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("The profile is exact and linear in B.") }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "fully developed mixed convection in a vertical channel, exact in rationals", point: { Re: num(p.Re), Gr: num(p.Gr) } })) });
  }

  function tubeImpl(decl, data) {
    const refs = data?.heatrefs ?? null, lit = data?.convective?.literature ?? null;
    const run = (ctx) => { const v = values(ctx, { R: "R", U: "u_m", k: "k", rho: "rho", mu: "mu", cp: "c_p", x: "x_s" }); const lack = lacking(v, ["R", "U", "k", "rho", "mu", "cp"]); if (lack.length) return { lack };
      return once(keyOf(decl.id, v), () => { const out = tube({ ...v, D: Q.mul(q(2), v.R) }, "temperature", { references: refs, literature: lit });
        const Re = out.values.Re, Pr = out.values.Pr;
        const reg = EM.regionOf(data.convective.boundaries.tube, Re);
        out.checks.push(check("tube-regime", `Re_D = ${f(Re, 5)}: ${reg.label.charAt(0).toLowerCase()}${reg.label.slice(1)} (${data.convective.boundaries.tube.where}).`, reg.status, { passed: reg.id === "laminar", evidence: [data.convective.boundaries.tube.source], detail: data.convective.boundaries.tube.data, next: reg.id === "laminar" ? "" : "The declared laminar model does not apply; the empirical layer gives the turbulent correlation." }));
        if (out.values.xth !== null) {
          const r = out.values.xth / 0.034;
          out.checks.push(check("tube-entry", r >= 1 ? `x/(D Re_D Pr) = ${f(out.values.xth, 4)} ≥ 0.034: the station is past the thermal entry length, so Nu_D is within 5 % of 3.657 (${data.convective.boundaries.entry.where}).` : `x/(D Re_D Pr) = ${f(out.values.xth, 4)} < 0.034: the station is in the thermal entry region, where the local Nu_D is more than 5 % above 3.657.`, r >= 1 ? "evidence" : "unresolved",
            { passed: r >= 1, evidence: [data.convective.boundaries.entry.source], next: r >= 1 ? "" : "Move the station downstream, or declare the developing (Graetz) solution." }));
        }
        const gn = EM.evaluate(EM.find(data, "tube-gnielinski"), { Re, Pr });
        out.checks.push(gn.ok ? check("tube-gnielinski", `Turbulent alternative at this Re_D: Gnielinski gives Nu_D = ${f(gn.value, 5)}.`, "evidence", { passed: true, evidence: ["lienhard-flow"], tex: gn.corr.tex }) : check("tube-gnielinski", `Gnielinski's correlation (eqn. (7.41)) is refused here: ${gn.refused.join("; ")}.`, "evidence", { passed: true, evidence: ["lienhard-flow"] }));
        return out; }); };
    const set = data?.convective?.boundaries ?? {};
    return baseImpl(decl, { axes: { x: "Re", y: "xD" },
      layers: [empiricalLayer("flow", "Laminar, transitional or turbulent flow", "Re", set.tube, "Re_D against the cited limits."), empiricalLayer("entry", "Thermal entry length", "entry", set.entry, "x/D against 0.034 Re_D Pr.")],
      evaluate: (p) => (p.Re > 0 && p.xD > 0 && p.Pr > 0 ? { ok: true, values: { Re: p.Re, entry: p.xD / (0.034 * p.Re * p.Pr) } } : { ok: false, reason: "Re, Pr and x/D must be positive." }),
      inspect: (p) => { const gn = EM.evaluate(EM.find(data, "tube-gnielinski"), { Re: p.Re, Pr: p.Pr }); return { ok: true, values: [{ id: "Nu", tex: "Nu_D", label: p.Re < 2100 ? "laminar, fully developed, uniform wall temperature" : gn.ok ? "Gnielinski, turbulent" : "no declared result", value: p.Re < 2100 ? 3.65679 : gn.ok ? num(gn.value) : null }, { id: "Gz", tex: "Gz", label: "Graetz number Re Pr D/x", value: num(p.Re * p.Pr / p.xD) }], checks: [], reconstruction: [] }; },
      derived: (p) => [{ id: "NuT", tex: "Nu_D", label: "fully developed, uniform wall temperature", value: 3.65679 }, { id: "NuQ", tex: "Nu_D", label: "fully developed, uniform wall heat flux (pipe-poiseuille)", value: num(48 / 11) }],
      analysis: () => ({ note: "The map carries two empirical layers: the state of the flow by Re_D and the thermal entry length by x/(D Re_D Pr). The declared laminar model holds only where both say so.",
        balance: { intro: "Axial advection balances radial conduction over the length R·Pe_R.", terms: [], balances: [], crossovers: [], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("Far downstream one eigenmode remains; the page uses its Nu_D past the entry length only.") }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "the Graetz eigenproblem with both wall conditions kept apart, and the empirical limits of the laminar model", point: { Re: num(p.Re) } })) });
  }

  function conjugateImpl(decl) {
    const run = (ctx) => { const v = values(ctx, { U: "u_m", H: "H", Ho: "H_o", Lh: "L", kf: "k_f", ks: "k_s", rho: "rho", cp: "c_p" }); const lack = lacking(v, ["U", "H", "Ho", "Lh", "kf", "ks", "rho", "cp"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => conjugate({ ...v, t: Q.sub(v.Ho, v.H) })); };
    const share = (p) => { const w = (p.Yo - 1) / p.K; return w / (17 / 35 + w); };
    return baseImpl(decl, { axes: { x: "K", y: "Yo" },
      approximations: [{ id: "thin", label: "No wall resistance", tex: "(H_o/H-1)/K\\to0", limit: "K → ∞", why: "The wall conducts so well that the outer surface has the interface temperature.", error: "the exact share of the wall in θ_o − θ_m" }],
      layers: [approxLayer("thin", "No wall resistance", "share", "The exact share (H_o/H − 1)/K ÷ (17/35 + (H_o/H − 1)/K) of the wall in the fully developed θ_o − θ_m, at most the tolerance", "thin"),
        balanceLayer("resist", "Wall against convection resistance", "ratio", "(H_o/H − 1)/K against 17/35, exact in the fully developed state", "Convection controls the outer temperature", "Wall conduction controls the outer temperature")],
      evaluate: (p) => (p.K > 0 && p.Yo > 1 ? { ok: true, values: { share: share(p), ratio: ((p.Yo - 1) / p.K) / (17 / 35) } } : { ok: false, reason: "K must be positive and H_o/H above 1." }),
      exactBoundaries: () => [{ layer: "resist", text: "(H_o/H − 1)/K = 17/35 exactly: the two resistances are equal." }],
      inspect: (p) => ({ ok: true, values: [{ id: "Nuo", tex: "Nu_o", label: "fully developed Nusselt number with the outer temperature, D_h = 4H", value: num(4 / (17 / 35 + (p.Yo - 1) / p.K)) }], checks: [], reconstruction: [] }),
      derived: (p) => [{ id: "Nuf", tex: "Nu_f", label: "fully developed, fluid side", value: num(140 / 17) }, { id: "Nuo", tex: "Nu_o", label: "fully developed, with the outer temperature", value: num(4 / (17 / 35 + ((p.Yo ?? 1.5) - 1) / (p.K ?? 1))) }],
      analysis: () => ({ note: "The map uses the exact fully developed solution. The finite-volume solution with its mesh study runs at the record's point.",
        balance: { intro: "Two thermal resistances in series carry the heat from the outer surface to the fluid.", terms: [{ tex: "(H_o/H-1)/K", label: "conduction across the wall", scale: "(H_o/H − 1)/K", why: "A linear wall profile with the unit flux." }, { tex: "17/35", label: "convection into the fluid", scale: "17/35", why: "The exact θ_w − θ_m." }],
          balances: [], crossovers: [{ criterion: "(H_o/H-1)/K=17/35", status: "exact", text: "The two resistances are equal." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("The map uses the exact fully developed state; the entry region is in the solution panel.") }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "conjugate heat transfer: an exact fully developed solution and a finite-volume solution on three meshes", point: { K: num(p.K), Yo: num(p.Yo) } })) });
  }

  function plateImpl(decl, data) {
    const run = (ctx) => { const v = values(ctx, { U: "U", L: "L", xs: "x_s", nu: "nu", alpha: "alpha", k: "k" }); const lack = lacking(v, ["U", "L", "nu", "alpha"]); if (lack.length) return { lack };
      if (!v.xs) v.xs = v.L;
      const imported = JSON.stringify((ctx?.evidence ?? []).filter((e) => e.kind === "numerical-results"));
      return once(keyOf(decl.id, v, imported), () => { const out = plate(v, data); importChecks(out, ctx, data, "plate-convection"); return out; }); };
    const set = data?.convective?.boundaries?.plate;
    return baseImpl(decl, { axes: { x: "Re", y: "Pr" },
      layers: [empiricalLayer("state", "State of the layer", "Re", set, "Re_x against the measured limits of transition."),
        { ...empiricalLayer("prandtl", "Range of the correlations in Pr", "Pr", { source: "lienhard-2024", data: "Eqn. (6.58) holds for Pr ≥ 0.6; eqn. (6.112) for gases.", regions: [{ id: "low", lo: null, hi: 0.6, label: "Below the range of eqn. (6.58)", status: "unresolved" }, { id: "gas", lo: 0.6, hi: 1, label: "Laminar and turbulent laws both hold (gases)", status: "evidence" }, { id: "liquid", lo: 1, hi: null, label: "Laminar law only: eqn. (6.112) is for gases", status: "evidence" }] }, "Pr against the stated ranges."), hue: "prandtl" }],
      evaluate: (p) => (p.Re > 0 && p.Pr > 0 ? { ok: true, values: { Re: p.Re, Pr: p.Pr } } : { ok: false, reason: "Re and Pr must be positive." }),
      inspect: (p) => { const lam = EM.evaluate(EM.find(data, "plate-laminar-local"), { Re: p.Re, Pr: p.Pr }), tur = EM.evaluate(EM.find(data, "plate-turbulent-local"), { Re: p.Re, Pr: p.Pr });
        return { ok: true, values: [{ id: "lam", tex: "Nu_x", label: lam.ok ? "laminar, eqn. (6.58)" : `laminar law refused: ${lam.refused.join("; ")}`, value: lam.ok ? num(lam.value) : null }, { id: "tur", tex: "Nu_x", label: tur.ok ? "turbulent, eqn. (6.112)" : `turbulent law refused: ${tur.refused.join("; ")}`, value: tur.ok ? num(tur.value) : null }], checks: [], reconstruction: [] }; },
      analysis: () => ({ note: "The map shows where each named correlation holds. In the transition range no correlation gives a local value: the page leaves it unresolved and does not interpolate.",
        balance: { intro: "Inside the layer, advection along the plate balances conduction across it.", terms: [], balances: [], crossovers: [], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("The correlations are fits; the similarity solution in the panel is their reference.") }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "named correlations with validity ranges, against the page's similarity solution and imported numerical results", point: { Re: num(p.Re), Pr: num(p.Pr) } })) });
  }

  function wallImpl(decl, data) {
    const run = (ctx) => { const v = values(ctx, { L: "L", g: "g", beta: "beta", DT: "DT_w", nu: "nu", alpha: "alpha", k: "k" }); const lack = lacking(v, ["L", "g", "beta", "DT", "nu", "alpha"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => wall(v, data)); };
    const set = data?.convective?.boundaries?.wall;
    return baseImpl(decl, { axes: { x: "Ra", y: "Pr" },
      layers: [empiricalLayer("layer", "Laminar or turbulent layer", "Ra", set, "Ra_L against the cited limit.")],
      evaluate: (p) => (p.Ra > 0 && p.Pr > 0 ? { ok: true, values: { Ra: p.Ra } } : { ok: false, reason: "Ra and Pr must be positive." }),
      inspect: (p) => { const a = EM.evaluate(EM.find(data, "wall-cc-laminar"), { Ra: p.Ra, Pr: p.Pr }), b = EM.evaluate(EM.find(data, "wall-cc-all"), { Ra: p.Ra, Pr: p.Pr });
        return { ok: true, values: [{ id: "a", tex: "\\overline{Nu}_L", label: a.ok ? "eqn. (8.13a)" : "eqn. (8.13a) refused: Ra_L ≥ 10⁹", value: a.ok ? num(a.value) : null }, { id: "b", tex: "\\overline{Nu}_L", label: "eqn. (8.13b)", value: b.ok ? num(b.value) : null }], checks: [], reconstruction: [] }; },
      analysis: () => ({ note: "The map shows where each Churchill–Chu equation holds.",
        balance: { intro: "In the laminar layer buoyancy balances inertia and viscosity.", terms: [], balances: [], crossovers: [], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("The correlations are fits of measured data.") }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "the Churchill–Chu correlations with their ranges and the exact buoyancy scaling", point: { Ra: num(p.Ra), Pr: num(p.Pr) } })) });
  }

  /** The imported numerical results of the record (evidence items of kind numerical-results), checked and compared. */
  function importChecks(out, ctx, data, example) {
    const spec = data?.convective?.imports?.[example];
    const items = (ctx?.evidence ?? []).filter((e) => e.kind === "numerical-results");
    for (const it of items) {
      const v = EM.validateImport(it.results, spec);
      if (!v.ok) { out.checks.push(check(`import-${it.id}`, `Imported results ${it.id} are refused: ${v.errors.join(" ")}`, "unresolved", { passed: false, next: "Load a file with its provenance and the page's group definitions." })); continue; }
      const cmp = EM.compare(v.doc, { ...spec, fixed: { Re: 1 } }, EM.find(data, spec.correlation), spec.tolerance);
      const pv = v.doc.provenance;
      out.checks.push(check(`import-${it.id}`, `Imported numerical results (${pv.source}; ${pv.method}; ${pv.software}; ${pv.date}): ${cmp.compared} of ${cmp.rows.length} points are inside the range of the correlation, and the largest deviation is ${f(100 * cmp.worst, 3)} %.${cmp.outside ? ` The page does not compare ${cmp.outside} point${cmp.outside > 1 ? "s" : ""} outside the range.` : ""}`,
        cmp.passed ? "numerical" : "unresolved", { passed: cmp.passed, tolerance: `relative ${spec.tolerance}`, evidence: [it.source || "import"], next: cmp.passed ? "" : "Check the imported results or the range of the correlation.", detail: `Stated tolerance of the file: ${pv.tolerance}.` }));
      out.imports = (out.imports ?? []).concat([{ id: it.id, provenance: pv, rows: cmp.rows.map((r) => ({ ...r.point, model: num(r.model), deviation: num(r.deviation), refused: r.refused })) }]);
      const fig = out.figures?.[0];
      if (fig) fig.series.push({ label: `Imported: ${pv.source}`, points: v.doc.points.map((pt) => [pt[spec.inputs[0]], pt[spec.output]]), marker: true });
    }
  }

  const IMPLS = { "advection-channel": advectionImpl, "couette-heating": couetteImpl, "thermocapillary-layer": thermocapillaryImpl, "mixed-channel": mixedImpl, "pipe-wall-temperature": tubeImpl, "conjugate-channel": conjugateImpl, "plate-correlation": plateImpl, "wall-natural-correlation": wallImpl };
  /** The implementation of a declaration of piece 7, or null. */
  function implement(decl, options = {}, data = null) {
    const f2 = IMPLS[decl.id];
    return f2 ? f2(decl, data) : null;
  }

  return { implement, advChannel, adExact, adDiscrete, couette, thermocapillary, tube, graetz, graetzEnd, mixedChannel, conjugate, conjugateExact, conjugateFV, blasius, pohlhausen, plate, wall };
});
