/* Scientific Modelling: the declared models of piece 8 (heat exchangers, phase change, condensation, boiling
 * correlations and radiation in a medium) and their checks. Each solver takes the SI values of one example (exact
 * rationals where the record gives them) and returns plain data: the dimensionless groups, the solution, the checks
 * with their statuses, the hand-calculation steps (spec section 12, items 6 to 10) and the data of the figures. A
 * check is "exact" only when rational arithmetic decides it; every floating-point result is "numerical" and states
 * its tolerance; a named correlation is evaluated only inside its declared domain and is refused outside it.
 *
 *   exchanger   single-pass parallel-flow and counterflow exchangers: effectiveness-NTU, the conserved enthalpy
 *               flux, Runge-Kutta profiles with the heat balance, the balanced limit and its exact series
 *   stefan      melting of a half-space (two-phase Neumann solution): the root λ, the similarity profiles, the
 *               latent-energy balance and an independent front-fixing transient solution on three meshes
 *   film        Nusselt's laminar film on a vertical wall: exact δ(L)⁴ and latent-energy balance, the film state
 *   boiling     Rohsenow's correlation and the peak heat flux for water, with the strict domain checks
 *   slab        a grey absorbing and emitting slab at a uniform temperature between black walls: exact ray
 *               solutions, E_3 closed forms, quadrature checks and the thin, thick and Rosseland limits
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./special.js"), require("./htnum.js"), require("./empirical.js"));
  else (root.SM = root.SM || {}).TR = factory(root.SM.Q, root.SM.SF, root.SM.HN, root.SM.EM);
})(typeof self !== "undefined" ? self : this, function (Q, SF, N, EM) {
  "use strict";

  const q = Q.q;
  const f = N.fmt;
  const qn = (x) => Q.toNumber(x);
  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(12)) : null);
  const SQRT_PI = Math.sqrt(Math.PI);
  /** A check: an id, a title, a status of record.js and its details. */
  const check = (id, title, status, extra = {}) => ({ id, title, status, passed: true, detail: "", tolerance: null, inputs: [], evidence: [], tex: null, ...extra });
  /** A hand-calculation step (spec section 12). */
  const step = (item, title, reason, tex = [], evidence = []) => ({ item, title, reason, tex, evidence });
  /** Relative difference. */
  const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  /** A short exact fraction, or its decimal. */
  const exactText = (x) => (Q.str(x).length <= 14 ? Q.str(x) : f(qn(x), 6));

  /* ======================================================================================================
   * Heat exchangers
   * ====================================================================================================== */

  /**
   * ε(NTU, C_r) (Lienhard and Lienhard, eqs. 3.20, 3.21, 3.23). The counterflow form is written as
   * −expm1(−x)/((1 − C_r) − C_r·expm1(−x)), x = (1 − C_r)NTU, which has no cancellation near C_r = 1.
   * @param {"parallel" | "counterflow"} arr @param {number} n @param {number} cr
   */
  function effectiveness(arr, n, cr) {
    if (arr === "parallel") return -Math.expm1(-(1 + cr) * n) / (1 + cr);
    if (cr === 1) return n / (1 + n);
    const em = Math.expm1(-(1 - cr) * n);
    return -em / ((1 - cr) - cr * em);
  }
  /** The textbook form of eq. (3.21) as written; it loses digits near C_r = 1. */
  const effectivenessNaive = (n, cr) => { const e = Math.exp(-(1 - cr) * n); return (1 - e) / (1 - cr * e); };

  /** The coefficients of the counterflow ε in r = 1 − C_r about r = 0, exact for a rational NTU. */
  function counterflowSeries(NTU, K = 4) {
    const e = [Q.ONE];
    for (let k = 1; k <= K + 2; k++) e.push(Q.div(Q.mul(e[k - 1], Q.neg(NTU)), q(k)));
    const nume = e.map((c, k) => (k === 0 ? Q.ZERO : Q.neg(c))); // 1 − e^{−NTU r}
    const den = nume.map((c, k) => (k === 0 ? c : Q.add(c, e[k - 1]))); // + r e^{−NTU r}
    const a = nume.slice(1), b = den.slice(1), out = [];
    for (let k = 0; k < K; k++) {
      let s = a[k] ?? Q.ZERO;
      for (let j = 1; j <= k; j++) s = Q.sub(s, Q.mul(b[j] ?? Q.ZERO, out[k - j]));
      out.push(Q.div(s, b[0]));
    }
    return out;
  }

  /** RK4 for the dimensionless profiles; counterflow by superposition of two initial-value solutions. */
  function hxProfiles(arr, Nh, Nc, steps) {
    const M = arr === "parallel" ? [[-Nh, Nh], [Nc, -Nc]] : [[-Nh, Nh], [-Nc, Nc]];
    const run = (y0) => {
      const ys = [];
      N.rk4((_, y) => [M[0][0] * y[0] + M[0][1] * y[1], M[1][0] * y[0] + M[1][1] * y[1]], y0, 0, 1, steps, (_, y) => ys.push(y.slice()));
      return ys;
    };
    if (arr === "parallel") return run([1, 0]);
    const a = run([1, 0]), b = run([1, 1]);
    const s = -a[steps][1] / (b[steps][1] - a[steps][1]);
    return a.map((ya, i) => [ya[0] + s * (b[i][0] - ya[0]), ya[1] + s * (b[i][1] - ya[1])]);
  }

  /**
   * An exchanger at the record's values. p: U, A, Ch, Cc, Thin, Tcin (exact rationals, SI; temperatures in K).
   * @param {any} p @param {"parallel" | "counterflow"} arr @param {any} lit the literature values (data/transfer.json)
   */
  function exchanger(p, arr, lit = null) {
    const checks = [], steps = [];
    const par = arr === "parallel";
    const UA = Q.mul(p.U, p.A);
    const NTU = Q.div(UA, p.Ch), Cr = Q.div(p.Ch, p.Cc), dT = Q.sub(p.Thin, p.Tcin);
    const hotMin = Q.cmp(p.Ch, p.Cc) <= 0;
    const n = qn(NTU), cr = qn(Cr);
    checks.push(check("hx-groups", `NTU = U_HX A/C_h = ${exactText(NTU)} and C_r = C_h/C_c = ${exactText(Cr)}, exact fractions of the record's values.`, "exact", { passed: true, evidence: ["lienhard-2024"] }));
    checks.push(check("hx-min", hotMin ? `The hot stream has the smaller capacity rate (C_h = ${f(qn(p.Ch))} W/K ≤ C_c = ${f(qn(p.Cc))} W/K), as the declaration requires, so 0 < C_r ≤ 1.` : `The hot stream has the larger capacity rate (C_h > C_c), but the declaration takes it as the stream of C_min. Exchange the names of the streams.`,
      "exact", { passed: hotMin, next: hotMin ? "" : "Exchange the names of the two streams in the record." }));
    // The conserved enthalpy flux: C_h·(right side of the hot equation) ± C_c·(right side of the cold equation) = 0.
    const sgn = par ? Q.ONE : Q.neg(Q.ONE);
    const hot = [Q.neg(Q.div(p.U, p.Ch)), Q.div(p.U, p.Ch)];
    const cold = [Q.mul(sgn, Q.div(p.U, p.Cc)), Q.neg(Q.mul(sgn, Q.div(p.U, p.Cc)))];
    const sum = hot.map((h, i) => Q.add(Q.mul(p.Ch, h), Q.mul(Q.mul(sgn, p.Cc), cold[i])));
    checks.push(check("hx-conservation", `Energy conservation of the two equations: d/da (C_hT_h ${par ? "+" : "−"} C_cT_c) = 0 identically. The coefficients of T_h and T_c in the sum are ${sum.map(Q.str).join(" and ")}.`, "exact",
      { passed: sum.every(Q.isZero), detail: par ? "Both streams flow toward a = A, so the heat that the hot stream loses over any length is the heat that the cold stream gains." : "The cold stream flows toward a = 0, so C_hT_h − C_cT_c is the same at every a.", evidence: ["lienhard-2024"] }));
    // Effectiveness: exact where rational arithmetic gives it.
    const exact = !par && Q.eq(Cr, Q.ONE) ? Q.div(NTU, Q.add(Q.ONE, NTU)) : null;
    const eps = exact ? qn(exact) : effectiveness(arr, n, cr);
    const Qmax = Q.mul(Q.cmp(p.Ch, p.Cc) <= 0 ? p.Ch : p.Cc, dT);
    const heat = eps * qn(Qmax);
    const ThoutF = qn(p.Thin) - heat / qn(p.Ch), TcoutF = qn(p.Tcin) + heat / qn(p.Cc);
    if (exact) {
      const H = Q.mul(exact, Qmax), Tho = Q.sub(p.Thin, Q.div(H, p.Ch)), Tco = Q.add(p.Tcin, Q.div(H, p.Cc));
      const gap1 = Q.sub(p.Thin, Tco), gap2 = Q.sub(Tho, p.Tcin);
      checks.push(check("hx-balanced", `Balanced counterflow (C_r = 1): ε = NTU/(1 + NTU) = ${Q.str(exact)} exactly, so Q = ${f(qn(H))} W, T_h,out = ${f(qn(Tho) - 273.15)} °C and T_c,out = ${f(qn(Tco) - 273.15)} °C, exactly. The temperature difference is ${f(qn(gap1))} K at both ends.`,
        "exact", { passed: Q.eq(gap1, gap2), detail: "With C_h = C_c the difference T_h − T_c is the same at every a (Lienhard and Lienhard, Example 3.2 and eq. 3.23).", evidence: ["lienhard-2024"] }));
    }
    // Profiles by RK4 on 25, 50, 100 and 200 steps.
    const Nh = qn(Q.div(UA, p.Ch)), Nc = qn(Q.div(UA, p.Cc));
    const ch = qn(Q.div(p.Ch, hotMin ? p.Ch : p.Cc)), cc = qn(Q.div(p.Cc, hotMin ? p.Ch : p.Cc));
    const out = (ys) => { const last = ys[ys.length - 1]; const tcOut = par ? last[1] : ys[0][1]; return { epsH: ch * (1 - last[0]), epsC: cc * tcOut }; };
    const runs = [25, 50, 100, 200].map((s) => ({ steps: s, ...out(hxProfiles(arr, Nh, Nc, s)) }));
    const errs = runs.map((r) => Math.abs(r.epsH - eps));
    const fine = runs[3];
    const balance = rel(fine.epsH, fine.epsC);
    checks.push(check("hx-balance", `Equal heat loss and gain in the Runge–Kutta solution: the hot stream loses ${f(fine.epsH * qn(Qmax))} W and the cold stream gains ${f(fine.epsC * qn(Qmax))} W, a relative difference of ${balance.toExponential(1)}.`, "numerical",
      { passed: balance <= 1e-12, tolerance: "relative 1e-12", detail: "Runge–Kutta methods keep a linear invariant to rounding, so the two streams balance at every step size.", evidence: ["lienhard-2024"] }));
    const linear = errs.every((e) => e < 1e-13);
    const study = linear ? null : N.meshStudy(runs[1].epsH, runs[2].epsH, runs[3].epsH, 2);
    checks.push(check("hx-rk4", linear ? `With C_r = 1 the profiles are straight lines, so Runge–Kutta gives ε = ${f(fine.epsH, 10)} on every mesh: the error is at rounding (${Math.max(...errs).toExponential(1)}).`
      : `Runge–Kutta on 25, 50, 100 and 200 steps gives ε = ${f(fine.epsH, 10)} against the closed form ${f(eps, 10)}: errors ${errs.map((e) => e.toExponential(1)).join(", ")}, observed order ${f(study.p, 3)}.`, "numerical",
      { passed: errs[3] <= 1e-10 * eps && (linear || Math.abs(study.p - 4) < 0.5), tolerance: "relative 1e-10 at 200 steps; observed order 4 ± 0.5", evidence: ["spec-14"] }));
    const ys = hxProfiles(arr, Nh, Nc, 200);
    const gap = Math.min(...ys.map((y) => y[0] - y[1]));
    const epsMax = par ? 1 / (1 + cr) : 1;
    checks.push(check("hx-second-law", `The hot stream stays hotter than the cold stream at every point (smallest θ_h − θ_c = ${f(gap, 4)}), and ε = ${f(eps, 6)} is below its limit ${par ? `1/(1 + C_r) = ${f(epsMax, 6)} for NTU → ∞` : "1"}.`, "numerical",
      { passed: gap > 0 && eps < epsMax, tolerance: "strict inequalities in IEEE double", evidence: ["lienhard-2024"] }));
    // The single-stream limit C_r → 0 is the same for both arrangements.
    const single = -Math.expm1(-n);
    checks.push(check("hx-single", `Single-stream limit C_r → 0: ${par ? "parallel flow" : "counterflow"} gives ε = 1 − e^(−NTU) = ${f(single, 8)}, the same for every arrangement (eq. 3.22).`, "numerical",
      { passed: rel(effectiveness(arr, n, 0), single) <= 1e-15, tolerance: "relative 1e-15", evidence: ["lienhard-2024"] }));
    if (!par) {
      const ser = counterflowSeries(NTU, 4);
      const c0 = Q.div(NTU, Q.add(Q.ONE, NTU)), c1 = Q.div(Q.mul(NTU, NTU), Q.mul(q(2), Q.pow(Q.add(Q.ONE, NTU), 2)));
      checks.push(check("hx-series", `The equal-capacity-rate limit: ε = ${Q.str(ser[0])} + ${Q.str(ser[1])}(1 − C_r) + ${Q.str(ser[2])}(1 − C_r)² + …, exact. The first two coefficients equal NTU/(1 + NTU) and NTU²/(2(1 + NTU)²).`, "exact",
        { passed: Q.eq(ser[0], c0) && Q.eq(ser[1], c1), tex: `\\varepsilon=${ser.slice(0, 3).map((c, k) => `${Q.tex(c)}${k ? (k === 1 ? "(1-C_r)" : `(1-C_r)^{${k}}`) : ""}`).join("+").replace(/\+-/g, "-")}+\\dots`, evidence: ["lienhard-2024"] }));
      const r = 1e-4, crr = 1 - r;
      const viaSeries = ser.reduce((s, c, k) => s + qn(c) * r ** k, 0);
      const general = effectiveness("counterflow", n, crr);
      checks.push(check("hx-limit", `The general relation tends to the balanced limit: at C_r = 1 − 10⁻⁴ it gives ${f(general, 12)}, and the exact series gives ${f(viaSeries, 12)}.`, "numerical",
        { passed: rel(general, viaSeries) <= 1e-12, tolerance: "relative 1e-12 (the series error is of order r⁴ = 10⁻¹⁶)", evidence: ["lienhard-2024"] }));
      const naive = effectivenessNaive(n, 1 - 1e-12), stable = effectiveness("counterflow", n, 1 - 1e-12);
      checks.push(check("hx-cancel", `Eq. (3.21) as printed is 0/0 at C_r = 1 and loses digits near it: at C_r = 1 − 10⁻¹² it gives ${f(naive, 10)}, and the form with expm1 gives ${f(stable, 10)}. The page uses the second form and, at C_r = 1, the exact limit.`, "numerical",
        { passed: rel(stable, qn(c0)) <= 1e-11, tolerance: "relative 1e-11 for the stable form", evidence: ["lienhard-2024"] }));
    }
    if (lit && par) {
      const L = lit;
      const nL = (L.U * L.A) / L.Ch, crL = L.Ch / L.Cc, eL = effectiveness("parallel", nL, crL);
      const QL = eL * L.Ch * (L.Thin - L.Tcin);
      const ok = rel(eL, L.eps) <= L.tolerance && rel(QL, L.Q) <= L.tolerance && Math.abs(L.Thin - QL / L.Ch - L.Thout) <= L.tolerance * (L.Thin - L.Tcin) && Math.abs(L.Tcin + QL / L.Cc - L.Tcout) <= L.tolerance * (L.Thin - L.Tcin);
      checks.push(check("hx-reference", `Reference: with the inputs of Lienhard and Lienhard, ${L.where}, the page gives NTU = ${f(nL)}, C_r = ${f(crL)}, ε = ${f(eL, 6)}, Q = ${f(QL / 1000, 5)} kW, T_h,out = ${f(L.Thin - QL / L.Ch, 5)} °C and T_c,out = ${f(L.Tcin + QL / L.Cc, 5)} °C. The book gives ε = ${L.eps}, ${L.Q / 1000} kW, ${L.Thout} °C and ${L.Tcout} °C.`, "numerical",
        { passed: ok, tolerance: `relative ${L.tolerance} (${L.note})`, evidence: [L.source] }));
    }
    steps.push(step(6, "Scales", "The total area A scales the coordinate. The inlet difference ΔT_in = T_h,in − T_c,in, from the cold inlet, scales both temperatures, so θ_h − θ_c is the local difference over ΔT_in.",
      ["\\xi=\\frac aA,\\qquad \\theta=\\frac{T-T_{c,in}}{T_{h,in}-T_{c,in}},\\qquad NTU=\\frac{U_{HX}A}{C_{\\min}},\\qquad C_r=\\frac{C_{\\min}}{C_{\\max}},\\qquad \\varepsilon=\\frac{\\dot Q}{C_{\\min}(T_{h,in}-T_{c,in})}"], ["bannerman-hx", "lienhard-2024"]));
    steps.push(step(7, "Dimensionless equations and conditions", "Division of each equation by C ΔT_in/A gives two linear equations with the parameters NTU and NTU·C_r.",
      [par ? "\\theta_h'=-NTU(\\theta_h-\\theta_c),\\quad \\theta_c'=NTU\\,C_r(\\theta_h-\\theta_c),\\quad \\theta_h(0)=1,\\ \\theta_c(0)=0" : "\\theta_h'=-NTU(\\theta_h-\\theta_c),\\quad \\theta_c'=-NTU\\,C_r(\\theta_h-\\theta_c),\\quad \\theta_h(0)=1,\\ \\theta_c(1)=0"]));
    steps.push(step(8, "Solution", par ? "The difference θ_h − θ_c decays as e^(−(1 + C_r)NTU ξ). Integration gives the effectiveness." : "The difference decays as e^(−(1 − C_r)NTU ξ); with C_r = 1 it is constant, and ε = NTU/(1 + NTU).",
      [par ? "\\varepsilon=\\frac{1-e^{-(1+C_r)NTU}}{1+C_r}" : "\\varepsilon=\\frac{1-e^{-(1-C_r)NTU}}{1-C_re^{-(1-C_r)NTU}},\\qquad \\lim_{C_r\\to1}\\varepsilon=\\frac{NTU}{1+NTU}"], ["lienhard-2024"]));
    steps.push(step(10, "Checks", "The groups, the conservation identity and the balanced limit are exact. The Runge–Kutta profiles check the closed form and the heat balance with stated tolerances.",
      [`\\frac{\\mathrm d}{\\mathrm d\\xi}\\left(C_h\\theta_h${par ? "+" : "-"}C_c\\theta_c\\right)=0`]));
    const crs = [0, 0.25, 0.5, 0.75, 1];
    const nmax = Math.max(5, 1.3 * n);
    const ns = Array.from({ length: 61 }, (_, i) => (nmax * i) / 60);
    return {
      groups: [{ id: "NTU", label: "NTU", tex: "NTU", value: n, exact: Q.str(NTU) }, { id: "Cr", label: "C_r", tex: "C_r", value: cr, exact: Q.str(Cr) }, { id: "eps", label: "ε", tex: "\\varepsilon", value: eps, exact: exact ? Q.str(exact) : null }],
      values: { NTU: n, Cr: cr, eps, Q: heat, Thout: ThoutF, Tcout: TcoutF, epsMax },
      checks, steps,
      figures: [
        { id: "hx-profiles", title: `Temperatures along the exchanger, ${par ? "parallel flow" : "counterflow"}`, x: { label: "ξ = a/A" }, y: { label: "θ = (T − T_c,in)/(T_h,in − T_c,in)" }, yRange: [-0.04, 1.04],
          series: [{ label: "Hot stream θ_h", points: ys.filter((_, i) => i % 4 === 0).map((y, i) => [i / 50, y[0]]) }, { label: "Cold stream θ_c", dashed: true, points: ys.filter((_, i) => i % 4 === 0).map((y, i) => [i / 50, y[1]]) }] },
        { id: "hx-eps", title: `Effectiveness against NTU, ${par ? "parallel flow" : "counterflow"}`, x: { label: "NTU" }, y: { label: "ε" }, yRange: [0, 1.02],
          series: crs.map((c) => ({ label: `C_r = ${c}`, dashed: c !== cr, points: ns.map((x) => [x, effectiveness(arr, x, c)]) })), marks: [{ x: n, y: eps, label: "this exchanger" }] },
      ],
    };
  }

  /* ======================================================================================================
   * Phase change: melting of a half-space
   * ====================================================================================================== */

  /** F(λ) = Ste_l/(e^{λ²} erf λ) − (Ste_s/ν)/erfcx(νλ) − λ√π, which decreases from +∞. */
  const neumannF = (lam, steL, steS, nu) => steL / (Math.exp(lam * lam) * SF.erf(lam)) - (steS > 0 ? steS / (nu * SF.erfcx(nu * lam)) : 0) - lam * SQRT_PI;
  /** The root λ of F (Brent in a bracket that doubles until F changes sign). */
  function lambda(steL, steS = 0, nu = 1) {
    if (!(steL > 0)) return NaN;
    let hi = 1;
    while (neumannF(hi, steL, steS, nu) > 0 && hi < 64) hi *= 2;
    return SF.brent((x) => neumannF(x, steL, steS, nu), 1e-12, hi, 1e-16) ?? NaN;
  }
  /** erfc(x) through erfcx, which keeps relative accuracy for large x. */
  const erfc = (x) => SF.erfc(x);
  /** ∫_x^∞ erfc(u) du = e^{−x²}/√π − x erfc(x). */
  const ierfc = (x) => Math.exp(-x * x) / SQRT_PI - x * erfc(x);

  /** Composite Simpson rule with n (even) intervals. */
  function simpson(fn, a, b, n = 400) {
    const h = (b - a) / n;
    let s = fn(a) + fn(b);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * fn(a + i * h);
    return (s * h) / 3;
  }

  /**
   * The latent-energy balance per unit area, in units of ρℓ·2(α_l t)^{1/2}: energy in through the wall (closed form)
   * against the latent heat of the melted layer and the sensible heat of the liquid, the melted solid and the solid.
   */
  function energyBalance(lam, steL, steS, nu) {
    const input = steL / (SQRT_PI * SF.erf(lam));
    const liquid = steL * simpson((e) => 1 - SF.erf(e) / SF.erf(lam), 0, lam, 400);
    const melted = steS * lam;
    const solid = steS > 0 ? (steS / nu) * simpson((u) => erfc(u) / erfc(nu * lam), nu * lam, nu * lam + 8, 2000) : 0;
    const stored = lam + liquid + melted + solid;
    return { input, latent: lam, liquid, melted, solid, stored, residual: Math.abs(input - stored) / input, closedSolid: steS > 0 ? ((steS / nu) * ierfc(nu * lam)) / erfc(nu * lam) : 0 };
  }

  /** Thomas algorithm (a below, b on, c above the diagonal). */
  function thomas(a, b, c, d) {
    const n = d.length, cp = new Array(n), dp = new Array(n), x = new Array(n);
    cp[0] = c[0] / b[0];
    dp[0] = d[0] / b[0];
    for (let i = 1; i < n; i++) {
      const m = b[i] - a[i] * cp[i - 1];
      cp[i] = c[i] / m;
      dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
    }
    x[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
    return x;
  }
  /** One backward-Euler step of u_τ = D u_zz + (A + Bz) u_z on z ∈ [0, 1], Dirichlet ends, central differences. */
  function implicitStep(u, dt, D, A, B, left, right) {
    const n = u.length - 1, h = 1 / n;
    const a = new Array(n + 1).fill(0), b = new Array(n + 1).fill(1), c = new Array(n + 1).fill(0), d = u.slice();
    d[0] = left;
    d[n] = right;
    for (let i = 1; i < n; i++) {
      const adv = A + B * i * h;
      a[i] = -dt * (D / (h * h) - adv / (2 * h));
      c[i] = -dt * (D / (h * h) + adv / (2 * h));
      b[i] = 1 + (2 * dt * D) / (h * h);
    }
    return thomas(a, b, c, d);
  }
  const slope0 = (u) => { const n = u.length - 1; return ((-3 * u[0] + 4 * u[1] - u[2]) * n) / 2; };
  const slope1 = (u) => { const n = u.length - 1; return ((3 * u[n] - 4 * u[n - 1] + u[n - 2]) * n) / 2; };

  /**
   * The transient problem in front-fixing coordinates, lengths in units of 2(α_l t_end)^{1/2} and τ = α_l t/(that)²,
   * so τ_end = 1/4 and the similarity front there is λ. Liquid ξ = x̂/ŝ; solid ζ = (x̂ − ŝ)/L_s with L_s = 8(κτ)^{1/2}.
   * The start at τ_0 = τ_end/10⁴ is not the similarity profile: θ linear, the solid undisturbed, ŝ_0 = (2Ste_l τ_0)^{1/2}.
   */
  function transient(steL, steS, kappa, nl, ns, steps) {
    const t0 = 0.25e-4, t1 = 0.25;
    let s = Math.sqrt(2 * steL * t0);
    let th = Array.from({ length: nl + 1 }, (_, i) => 1 - i / nl);
    let ps = Array.from({ length: ns + 1 }, (_, i) => (i === 0 ? 0 : -1));
    let tau = t0;
    const r = (t1 / t0) ** (1 / steps);
    const track = [[tau, s]];
    for (let k = 0; k < steps; k++) {
      const next = tau * r, dt = next - tau;
      const Ls = 8 * Math.sqrt(kappa * tau), Lsn = 8 * Math.sqrt(kappa * next);
      const sdot = (steS > 0 ? (steS * kappa * slope0(ps)) / Ls : 0) - (steL * slope1(th)) / s;
      s += dt * sdot;
      th = implicitStep(th, dt, 1 / (s * s), 0, sdot / s, 1, 0);
      ps = implicitStep(ps, dt, kappa / (Lsn * Lsn), sdot / Lsn, (Lsn - Ls) / dt / Lsn, 0, -1);
      tau = next;
      if ((k + 1) % Math.max(1, Math.floor(steps / 40)) === 0) track.push([tau, s]);
    }
    return { s, track };
  }

  /**
   * Melting of a half-space at the record's values. p: rho, cl, cs, kl, ks, ell, DTl, DTs, tr (exact rationals, SI).
   * @param {any} p @param {any} refs the mpmath references (data/transferrefs.json)
   */
  function stefan(p, refs = null) {
    const checks = [], steps = [];
    const SteL = Q.div(Q.mul(p.cl, p.DTl), p.ell), SteS = Q.div(Q.mul(p.cs, p.DTs), p.ell);
    const kappa = Q.div(Q.mul(p.ks, p.cl), Q.mul(p.kl, p.cs));
    const kRatio = Q.div(p.ks, p.kl);
    const sl = qn(SteL), ss = qn(SteS), ka = qn(kappa), nu = 1 / Math.sqrt(ka);
    checks.push(check("st-groups", `Ste_l = c_l(T_w − T_m)/ℓ = ${exactText(SteL)}, Ste_s = c_s(T_m − T_i)/ℓ = ${exactText(SteS)}, κ = α_s/α_l = k_sc_l/(k_lc_s) = ${exactText(kappa)} and k_s/k_l = ${exactText(kRatio)}, exact fractions.`, "exact", { passed: true, evidence: ["spec-10"] }));
    const lam = lambda(sl, ss, nu), lam1 = lambda(sl, 0, 1);
    const resid = Math.abs(neumannF(lam, sl, ss, nu)) / (lam * SQRT_PI);
    const ref = refs?.stefan && refs.stefan.SteL === Q.str(SteL) && refs.stefan.SteS === Q.str(SteS) && refs.stefan.kappa === Q.str(kappa) ? refs.stefan : null;
    checks.push(check("st-root", `λ = ${f(lam, 12)} is the root of the transcendental equation: the residual is ${resid.toExponential(1)}.${ref ? ` mpmath ${refs.versions.mpmath} gives ${f(Number(ref.lambda), 12)} with 30 digits.` : " No mpmath reference covers these values; the residual still applies."}`, "numerical",
      { passed: resid <= 1e-12 && (!ref || rel(lam, Number(ref.lambda)) <= 1e-12), tolerance: "relative 1e-12", tex: "\\frac{Ste_l}{e^{\\lambda^2}\\operatorname{erf}\\lambda}-\\frac{Ste_s}{\\nu e^{\\nu^2\\lambda^2}\\operatorname{erfc}(\\nu\\lambda)}=\\lambda\\sqrt\\pi", evidence: ["roscani-tarzia"] }));
    const font = (1 / sl) * SQRT_PI * lam1 * SF.erf(lam1) * Math.exp(lam1 * lam1);
    checks.push(check("st-font", `One-phase model (T_i = T_m): λ₁ = ${f(lam1, 10)}. Font writes the Stefan number as β = ℓ/(c_l(T_w − T_m)) = 1/Ste_l = ${f(1 / sl, 6)}; his eq. (8), βπ^(1/2)λ erf(λ)e^(λ²) = 1, gives ${f(font, 15)} at λ₁. The subcooled solid slows the front by ${f(100 * (1 - lam / lam1), 3)} %.`, "numerical",
      { passed: Math.abs(font - 1) <= 1e-12, tolerance: "absolute 1e-12", detail: "Font's β and this page's Ste are reciprocals: the page records both conventions.", evidence: ["font-stefan"] }));
    // The similarity profiles satisfy the heat equation and the front conditions.
    const thL = (e) => 1 - SF.erf(e) / SF.erf(lam), psS = (e) => -1 + erfc(nu * e) / erfc(nu * lam);
    // In η = x/(2√(α_l t)), each phase satisfies θ'' + 2c²ηθ' = 0 with c = 1 (liquid) and c = ν (solid).
    let worst = 0;
    for (let i = 1; i < 20; i++) {
      const hgt = 1e-4;
      const e1 = (lam * i) / 20, e2 = lam + i * 0.2;
      const r1 = (thL(e1 + hgt) - 2 * thL(e1) + thL(e1 - hgt)) / (hgt * hgt) + 2 * e1 * (thL(e1 + hgt) - thL(e1 - hgt)) / (2 * hgt);
      const r2 = (psS(e2 + hgt) - 2 * psS(e2) + psS(e2 - hgt)) / (hgt * hgt) + 2 * nu * nu * e2 * (psS(e2 + hgt) - psS(e2 - hgt)) / (2 * hgt);
      worst = Math.max(worst, Math.abs(r1), Math.abs(r2));
    }
    const frontOk = Math.abs(thL(lam)) < 1e-14 && Math.abs(psS(lam)) < 1e-14 && Math.abs(thL(0) - 1) < 1e-15;
    checks.push(check("st-similarity", `The similarity profiles θ_l = 1 − erf η/erf λ and θ_s = −1 + erfc(νη)/erfc(νλ) satisfy θ'' + 2c²ηθ' = 0 in each phase (largest finite-difference residual ${worst.toExponential(1)}), θ_l = 1 at the wall, and θ = 0 on both sides of the front.`, "numerical",
      { passed: worst <= 1e-6 && frontOk, tolerance: "absolute 1e-6 (central differences with step 1e-4)", evidence: ["roscani-tarzia"] }));
    const eb = energyBalance(lam, sl, ss, nu);
    checks.push(check("st-energy", `Latent-energy balance: the energy that enters through the wall, ${f(eb.input, 8)}, equals the latent heat ${f(eb.latent, 6)} plus the sensible heat of the liquid ${f(eb.liquid, 6)}, of the melted solid ${f(eb.melted, 6)} and of the solid ${f(eb.solid, 6)} (units of ρℓ·2(α_lt)^(1/2) per unit area). The relative difference is ${eb.residual.toExponential(1)}.`, "numerical",
      { passed: eb.residual <= 1e-9, tolerance: "relative 1e-9 (Simpson's rule on 400 and 2000 intervals)", detail: `The solid term by quadrature also equals its closed form (Ste_s/ν)·ierfc(νλ)/erfc(νλ) = ${f(eb.closedSolid, 10)}.`, evidence: ["roscani-tarzia"] }));
    // Interface motion: an independent transient solution on three meshes.
    const meshes = [[20, 40, 2000], [40, 80, 4000], [80, 160, 8000]];
    const tr = meshes.map(([a, b, c]) => transient(sl, ss, ka, a, b, c));
    const errs = tr.map((r) => r.s / lam - 1);
    const order = Math.log2(Math.abs(errs[1] / errs[2]));
    checks.push(check("st-transient", `Interface motion: a front-fixing finite-difference solution, started from a profile that is not the similarity profile, moves the front to ${tr.map((r) => f(r.s, 7)).join(", ")} on three meshes, against λ = ${f(lam, 7)} (relative errors ${errs.map((e) => e.toExponential(1)).join(", ")}, observed order ${f(order, 3)}).`, "numerical",
      { passed: Math.abs(errs[2]) <= 1e-3 && order > 1.5, tolerance: "relative 1e-3 on the finest mesh; observed order above 1.5", detail: "Liquid 20, 40 and 80 intervals, solid twice as many, with 2 000, 4 000 and 8 000 backward-Euler steps geometric in time. The start is a linear liquid profile and an undisturbed solid at τ = 2.5 × 10⁻⁵.", evidence: ["font-stefan", "spec-14"] }));
    const small = Math.abs(lam1 * lam1 - (sl / 2 - (sl * sl) / 6));
    checks.push(check("st-small", `Small-Stefan limit of the one-phase model: λ² = Ste/2 − Ste²/6 + O(Ste³) gives ${f(sl / 2 - (sl * sl) / 6, 8)}, against λ₁² = ${f(lam1 * lam1, 8)}. The difference ${small.toExponential(1)} is below Ste³ = ${(sl ** 3).toExponential(1)}. The first term is the quasi-steady front s² = 2Ste α_l t.`, "numerical",
      { passed: small <= sl ** 3, tolerance: "the next order, Ste³", evidence: ["font-stefan"] }));
    // Dimensional values at the time of the question.
    const alphaL = qn(p.kl) / (qn(p.rho) * qn(p.cl)), alphaS = qn(p.ks) / (qn(p.rho) * qn(p.cs)), tr0 = qn(p.tr);
    const front = 2 * lam * Math.sqrt(alphaL * tr0);
    const melted = qn(p.rho) * front;
    steps.push(step(6, "Scales", "The diffusion length (α_l t_r)^(1/2) of the liquid at the time of the question scales x and s; the wall superheat and the subcooling scale the two temperatures.",
      ["X=\\frac{x}{\\sqrt{\\alpha_lt_r}},\\quad \\tau=\\frac{t}{t_r},\\quad \\theta_l=\\frac{T_l-T_m}{T_w-T_m},\\quad \\theta_s=\\frac{T_s-T_m}{T_m-T_i},\\quad Ste_l=\\frac{c_l(T_w-T_m)}{\\ell},\\quad Ste_s=\\frac{c_s(T_m-T_i)}{\\ell},\\quad \\kappa=\\frac{\\alpha_s}{\\alpha_l}"], ["spec-10"]));
    steps.push(step(7, "Dimensionless equations and conditions", "The Stefan condition, divided by k_l(T_w − T_m)/(α_lt_r)^(1/2), keeps Ste_l as the ratio of sensible to latent heat.",
      ["\\theta_{l,\\tau}=\\theta_{l,XX},\\quad \\theta_{s,\\tau}=\\kappa\\theta_{s,XX},\\quad \\dot S=Ste_s\\kappa\\,\\theta_{s,X}-Ste_l\\,\\theta_{l,X}\\ \\text{at } X=S,\\quad \\theta_l(0)=1,\\ \\theta_l(S)=\\theta_s(S)=0,\\ \\theta_s(\\infty)=-1"], ["roscani-tarzia"]));
    steps.push(step(8, "Similarity solution", "With η = x/(2(α_lt)^(1/2)) both heat equations become ordinary equations. Their erf solutions meet the front conditions when s = 2λ(α_lt)^(1/2), and the Stefan condition gives the equation for λ.",
      ["\\theta_l=1-\\frac{\\operatorname{erf}\\eta}{\\operatorname{erf}\\lambda},\\qquad \\theta_s=-1+\\frac{\\operatorname{erfc}(\\nu\\eta)}{\\operatorname{erfc}(\\nu\\lambda)},\\qquad \\nu=\\sqrt{\\alpha_l/\\alpha_s},\\qquad s=2\\lambda\\sqrt{\\alpha_lt}"], ["roscani-tarzia", "font-stefan"]));
    steps.push(step(10, "Checks", "The groups are exact. The root, the profiles, the latent-energy balance and the transient front are numerical checks with stated tolerances.",
      ["\\frac{Ste_l}{\\sqrt\\pi\\operatorname{erf}\\lambda}=\\lambda+Ste_l\\!\\int_0^\\lambda\\!\\theta_l\\,\\mathrm d\\eta+Ste_s\\lambda+\\frac{Ste_s}{\\nu}\\frac{\\operatorname{ierfc}(\\nu\\lambda)}{\\operatorname{erfc}(\\nu\\lambda)}"]));
    // Figures: the temperature profile at t_r, the front against time, and λ against Ste_l.
    const Tm = qn(p.Tm ?? Q.parse("273.15")), dTl = qn(p.DTl), dTs = qn(p.DTs);
    const xMax = Math.max(4 * front, 6 * Math.sqrt(alphaS * tr0));
    const xs = Array.from({ length: 121 }, (_, i) => (xMax * i) / 120);
    const prof = xs.map((x) => { const eta = x / (2 * Math.sqrt(alphaL * tr0)); return [1000 * x, eta < lam ? dTl * thL(eta) : dTs * psS(eta)]; });
    const fineTr = tr[2].track;
    const stes = Array.from({ length: 41 }, (_, i) => 10 ** (-3 + (4 * i) / 40));
    return {
      groups: [{ id: "SteL", label: "Ste_l", tex: "Ste_l", value: sl, exact: Q.str(SteL) }, { id: "SteS", label: "Ste_s", tex: "Ste_s", value: ss, exact: Q.str(SteS) }, { id: "kappa", label: "κ = α_s/α_l", tex: "\\kappa", value: ka, exact: Q.str(kappa) }, { id: "lambda", label: "λ", tex: "\\lambda", value: lam, exact: null }],
      values: { lambda: lam, lambda1: lam1, front, frontMm: 1000 * front, meltedKg: melted, alphaL, alphaS, balance: eb },
      checks, steps,
      figures: [
        { id: "st-profile", title: `Temperature at t = t_r: the front is at ${f(1000 * front, 4)} mm`, x: { label: "x (mm)" }, y: { label: "T − T_m (K)" },
          series: [{ label: "Liquid and solid, similarity solution", points: prof }], marks: [{ x: 1000 * front, y: 0, label: "front" }] },
        { id: "st-front", title: "Front position against time: the transient solution and s = 2λ(α_lt)^(1/2)", x: { label: "τ = t/t_end" }, y: { label: "s / (2λ(α_l t_end)^(1/2))" }, yRange: [0, 1.05],
          series: [{ label: "Similarity: (t/t_end)^(1/2)", dashed: true, points: Array.from({ length: 41 }, (_, i) => [i / 40, Math.sqrt(i / 40)]) },
            { label: "Front-fixing transient solution, finest mesh", points: fineTr.map(([t, s]) => [4 * t, s / lam]) }] },
        { id: "st-lambda", title: "λ against Ste_l: one-phase model and the record's Ste_s/Ste_l and κ", x: { label: "Ste_l", log: true }, y: { label: "λ", log: true },
          series: [{ label: "One-phase (Font, eq. 8)", points: stes.map((x) => [x, lambda(x, 0, 1)]) }, { label: "Two-phase, record's Ste_s/Ste_l and κ", dashed: true, points: stes.map((x) => [x, lambda(x, (x * ss) / sl, nu)]) },
            { label: "Quasi-steady (Ste/2)^(1/2)", dashed: true, points: stes.map((x) => [x, Math.sqrt(x / 2)]) }],
          marks: [{ x: sl, y: lam, label: "this model" }] },
      ],
    };
  }

  /* ======================================================================================================
   * Condensation: Nusselt's laminar film on a vertical wall
   * ====================================================================================================== */

  /**
   * The film at the record's values. p: g, rhoF, Drho, nu, k, cp, hfg, hfgc, DT, L (exact rationals, SI).
   * @param {any} p @param {any} data data/transfer.json
   */
  function film(p, data) {
    const checks = [], steps = [];
    const T = data?.film ?? {};
    const Pr = Q.div(Q.mul(Q.mul(p.nu, p.rhoF), p.cp), p.k);
    const Ja = Q.div(Q.mul(p.cp, p.DT), p.hfg);
    const Pi4 = Q.div(Q.mul(Q.mul(Q.mul(p.g, p.Drho), p.hfgc), Q.pow(p.L, 3)), Q.mul(Q.mul(p.nu, p.k), p.DT));
    const Ga = Q.div(Q.mul(Q.mul(p.g, p.Drho), Q.pow(p.L, 3)), Q.mul(p.rhoF, Q.pow(p.nu, 2)));
    checks.push(check("fc-groups", `Π₄ = g(ρ_f − ρ_g)h′_fg L³/(νkΔT) = ${f(qn(Pi4), 6)}, Ja = c_pΔT/h_fg = ${exactText(Ja)}, Pr = νρ_fc_p/k = ${f(qn(Pr), 6)} and Ga = g(ρ_f − ρ_g)L³/(ρ_fν²) = ${f(qn(Ga), 6)}, exact fractions of the record's values.`, "exact", { passed: true, evidence: ["lienhard-2024"] }));
    // Sadasivan and Lienhard's correction against the record's h′_fg.
    const C1 = Q.parse(T.correction?.C1 ?? "0.683"), C2 = Q.parse(T.correction?.C2 ?? "0.228");
    const corr = Q.mul(p.hfg, Q.add(Q.ONE, Q.mul(Q.sub(C1, Q.div(C2, Pr)), Ja)));
    const dCorr = rel(qn(p.hfgc), qn(corr));
    const prOk = Q.cmp(Pr, Q.parse(T.correction?.prandtlMin ?? "0.6")) >= 0;
    checks.push(check("fc-correction", `Eq. (8.61) gives h′_fg = h_fg[1 + (0.683 − 0.228/Pr)Ja] = ${f(qn(corr) / 1000, 6)} kJ/kg; the record uses ${f(qn(p.hfgc) / 1000, 6)} kJ/kg, a difference of ${f(100 * dCorr, 3)} %. ${prOk ? "Pr ≥ 0.6, inside the range of the correction." : "Pr < 0.6 is outside the range of the correction."}`, "numerical",
      { passed: dCorr <= 5e-4 && prOk, tolerance: "relative 5e-4 (the book rounds h′_fg to four digits)", evidence: ["lienhard-2024"] }));
    const d4 = Q.div(Q.mul(Q.mul(q(4), p.nu), Q.mul(Q.mul(p.k, p.DT), p.L)), Q.mul(Q.mul(p.g, p.Drho), p.hfgc));
    const dL = qn(d4) ** 0.25;
    // Exact latent-energy balance: Q_w/(h′_fg ṁ(L)) = 4kΔTLν/(h′_fg g Δρ δ⁴) = 1.
    const ratio = Q.div(Q.mul(Q.mul(q(4), Q.mul(p.k, p.DT)), Q.mul(p.L, p.nu)), Q.mul(Q.mul(p.hfgc, Q.mul(p.g, p.Drho)), d4));
    checks.push(check("fc-balance", "Latent-energy balance at the bottom of the wall: the heat through the wall, (4/3)kΔT L/δ(L), equals h′_fg times the condensate flow g(ρ_f − ρ_g)δ(L)³/(3ν). With δ(L)⁴ as an exact fraction, their ratio 4kΔTLν/(h′_fg g(ρ_f − ρ_g)δ(L)⁴) is 1 exactly.", "exact",
      { passed: Q.eq(ratio, Q.ONE), tex: `\\delta(L)^4=\\frac{4\\nu k\\Delta T L}{g(\\rho_f-\\rho_g)h'_{fg}}=${f(qn(d4), 6)}\\ \\mathrm{m^4}`, evidence: ["lienhard-2024"] }));
    // The constant of Nu_L: (4/3)·4^(−1/4) = 2√2/3, checked through fourth powers.
    const lhs = Q.mul(Q.pow(q(4, 3), 4), q(1, 4)), rhs = q(64, 81);
    checks.push(check("fc-constant", `Nu_L = (4/3)L/δ(L) = (2√2/3)Π₄^(1/4): the fourth powers (4/3)⁴/4 and (2√2/3)⁴ are both ${Q.str(rhs)}, exactly. The book's constant 0.9428 is 2√2/3 = ${f((2 * Math.SQRT2) / 3, 7)} rounded.`, "exact",
      { passed: Q.eq(lhs, rhs) && Math.abs(0.9428 - (2 * Math.SQRT2) / 3) < 5e-5, evidence: ["lienhard-2024"] }));
    const kf = qn(p.k), dT = qn(p.DT), Lf = qn(p.L), nuf = qn(p.nu);
    const hL = kf / dL, hm = (4 / 3) * hL, NuL = (hm * Lf) / kf, qm = hm * dT, Qw = qm * Lf;
    const mdot = (qn(p.g) * qn(p.Drho) * dL ** 3) / (3 * nuf);
    const mu = nuf * qn(p.rhoF);
    const Rec = mdot / mu;
    const lit = data?.literature?.ex86;
    if (lit) {
      const d4l = (4 * lit.nu * lit.k * lit.dT * lit.L) / (lit.g * (lit.rhoF - lit.rhoG) * lit.hfgc);
      const dl = d4l ** 0.25, nul = (4 * lit.L) / (3 * dl), ql = (nul * lit.k * lit.dT) / lit.L, Ql = ql * lit.L, ml = Ql / lit.hfgc;
      const ok = rel(dl, lit.delta) <= lit.tolerance && rel(nul, lit.Nu) <= lit.tolerance && rel(ql, lit.q) <= lit.tolerance && rel(Ql, lit.Qw) <= lit.tolerance && rel(ml, lit.mdot) <= lit.tolerance;
      checks.push(check("fc-reference", `Reference film and heat flux: with the inputs of Lienhard and Lienhard, ${lit.where}, the page gives δ(L) = ${f(dl * 1000, 4)} mm, Nu_L = ${f(nul, 5)}, q = ${f(ql, 4)} W/m², Q = ${f(Ql / 1000, 4)} kW/m and ṁ = ${f(ml, 4)} kg/(m·s). The book gives ${lit.delta * 1000} mm, ${lit.Nu}, ${lit.q} W/m², ${lit.Qw / 1000} kW/m and ${lit.mdot} kg/(m·s).`, "numerical",
        { passed: ok, tolerance: `relative ${lit.tolerance} (${lit.note})`, evidence: [lit.source] }));
    }
    const set = T.boundaries?.state;
    const region = set ? EM.regionOf(set, Rec) : null;
    if (region) checks.push(check("fc-state", `Film Reynolds number Re_c = Γ_c/μ = ${f(Rec, 4)} at the bottom: ${region.label.charAt(0).toLowerCase()}${region.label.slice(1)} (${set.where}).${region.id === "turbulent" ? " The page refuses the laminar result." : ""}`, region.status,
      { passed: region.status !== "unresolved", evidence: [set.source], detail: set.data, next: region.status === "unresolved" ? "Use a turbulent-film correlation in a separate declaration, or a shorter wall." : "" }));
    checks.push(check("fc-jakob", `Ja = ${f(qn(Ja), 4)}: the sensible heat of the film is ${f(100 * qn(Ja), 3)} % of the latent heat, so the linear temperature profile across the film is sound (Lienhard and Lienhard, section 8.5: Ja ≈ 0.02 is about as large as laminar condensation gives).`, "evidence", { passed: true, evidence: ["lienhard-2024"] }));
    steps.push(step(6, "Scales", "The height L scales x. The balance of conduction across the film and condensation along it scales δ, so the film equation has no parameter.",
      ["X=\\frac xL,\\qquad D=\\frac{\\delta}{\\delta_r},\\qquad \\delta_r=\\left(\\frac{\\nu k\\Delta T L}{g(\\rho_f-\\rho_g)h'_{fg}}\\right)^{1/4},\\qquad \\Pi_4=\\frac{g(\\rho_f-\\rho_g)h'_{fg}L^3}{\\nu k\\Delta T},\\qquad Ja=\\frac{c_p\\Delta T}{h_{fg}}"], ["lienhard-2024"]));
    steps.push(step(7, "Dimensionless equation and condition", "Mass flow ṁ = g(ρ_f − ρ_g)δ³/(3ν) and the latent-energy balance kΔT/δ = h′_fg dṁ/dx combine into one equation.", ["D^3\\frac{\\mathrm dD}{\\mathrm dX}=1,\\qquad D(0)=0"], ["lienhard-2024"]));
    steps.push(step(8, "Solution", "Integration gives D⁴ = 4X. Then h = k/δ and the mean over the height is (4/3)h(L).",
      ["D=(4X)^{1/4},\\qquad Nu_x=\\frac{x}{\\delta}=0.707\\left(\\frac{g(\\rho_f-\\rho_g)h'_{fg}x^3}{\\nu k\\Delta T}\\right)^{1/4},\\qquad \\overline{Nu}_L=\\frac{2\\sqrt2}{3}\\Pi_4^{1/4}"], ["lienhard-2024"]));
    steps.push(step(10, "Checks", "The groups, δ(L)⁴, the latent-energy balance and the constant 2√2/3 are exact. The comparison with Example 8.6 and the film state use the cited values.", ["\\frac{\\tfrac43k\\Delta TL/\\delta_L}{h'_{fg}\\,g(\\rho_f-\\rho_g)\\delta_L^3/(3\\nu)}=1"]));
    const xs = Array.from({ length: 51 }, (_, i) => (Lf * i) / 50);
    return {
      groups: [{ id: "Pi4", label: "Π₄", tex: "\\Pi_4", value: qn(Pi4), exact: Q.str(Pi4) }, { id: "Ja", label: "Ja", tex: "Ja", value: qn(Ja), exact: Q.str(Ja) }, { id: "Pr", label: "Pr", tex: "Pr", value: qn(Pr), exact: Q.str(Pr) }, { id: "Ga", label: "Ga", tex: "Ga", value: qn(Ga), exact: Q.str(Ga) }],
      values: { deltaL: dL, hL, hm, NuL, qm, Qw, mdot, Rec, region: region?.id ?? null, hfgCorrected: qn(corr) },
      checks, steps,
      figures: [
        { id: "fc-delta", title: "Film thickness down the wall", x: { label: "x (cm)" }, y: { label: "δ (mm)" }, series: [{ label: "δ = δ_r(4x/L)^(1/4)", points: xs.map((x) => [100 * x, 1000 * dL * (x / Lf) ** 0.25]) }] },
        { id: "fc-h", title: "Local heat-transfer coefficient h = k/δ and its mean", x: { label: "x (cm)" }, y: { label: "h (kW/(m²·K))" }, yRange: [0, 4 * hm / 1000],
          series: [{ label: "Local h = k/δ", points: xs.slice(1).map((x) => [100 * x, kf / (dL * (x / Lf) ** 0.25) / 1000]) }, { label: "Mean h̄ = (4/3)h(L)", dashed: true, points: [[0, hm / 1000], [100 * Lf, hm / 1000]] }] },
      ],
    };
  }

  /* ======================================================================================================
   * Boiling correlations: Rohsenow and the peak heat flux, water
   * ====================================================================================================== */

  /**
   * Pool boiling at the record's values with the strict domain checks. p: mu, hfg, g, Drho, rhoG, sigma, k, Csf, DTe,
   * pressure, W (exact rationals, SI) and cp (optional); geometry: the record's fluid, surface, orientation, heater, pool.
   * @param {any} p @param {any} geometry @param {any} data data/transfer.json
   */
  function boiling(p, geometry, data) {
    const checks = [], steps = [];
    const B = data?.boiling ?? {};
    const Xb = Q.div(Q.mul(p.k, p.DTe), Q.mul(p.mu, p.hfg));
    const xb = qn(Xb), cs = qn(p.Csf);
    const qs = qn(p.mu) * qn(p.hfg) * Math.sqrt((qn(p.g) * qn(p.Drho)) / qn(p.sigma));
    const Mb = Math.sqrt(qn(p.rhoG)) * qn(p.sigma) ** 0.75 / (qn(p.mu) * (qn(p.g) * qn(p.Drho)) ** 0.25);
    const C = Number(B.peak?.C ?? 0.149);
    checks.push(check("bo-groups", `X_b = c_pΔT_e/(h_fg Pr) = kΔT_e/(μh_fg) = ${exactText(Xb)} and C_sf = ${Q.str(p.Csf)}, exact; the peak-flux group M_b = ${f(Mb, 6)}.${p.cp ? ` With Pr = μc_p/k, c_pΔT_e/(h_fg Pr) equals kΔT_e/(μh_fg) exactly for s = 1, so c_p cancels.` : ""}`, "exact",
      { passed: p.cp ? Q.eq(Q.div(Q.mul(p.cp, p.DTe), Q.mul(p.hfg, Q.div(Q.mul(p.mu, p.cp), p.k))), Xb) : true, evidence: ["lienhard-2024"] }));
    // Strict domain: fluid, surface, pressure, orientation and heater, data range, regime.
    const refused = [];
    const fluid = String(geometry?.fluid ?? "").toLowerCase(), surface = String(geometry?.surface ?? "").toLowerCase();
    const okFluid = fluid === "water";
    checks.push(check("bo-fluid", okFluid ? "Fluid: water, with the Prandtl exponent s = 1.0 of Table 9.2." : `Fluid: "${fluid || "not stated"}" is outside the declaration, which holds for water only. ${B.otherFluids ?? ""}`, okFluid ? "evidence" : "unresolved",
      { passed: okFluid, evidence: ["lienhard-2024"], next: okFluid ? "" : "Choose water, or a declaration for the other fluid." }));
    if (!okFluid) refused.push("the fluid");
    const pair = (B.surfaces ?? []).find((x) => x.fluid === fluid && x.surface === surface);
    const sameC = pair ? Q.eq(Q.parse(pair.Csf), p.Csf) : false;
    checks.push(check("bo-surface", pair ? (sameC ? `Surface: water on ${surface}, C_sf = ${pair.Csf} in Table 9.2, and the record uses the same value.` : `Surface: water on ${surface} has C_sf = ${pair.Csf} in Table 9.2, but the record uses ${Q.str(p.Csf)}.`)
      : `Surface: "${surface || "not stated"}" has no value of C_sf for water in Table 9.2 (nickel, platinum, copper and brass have one). The page refuses the correlation and does not guess a constant.`, pair && sameC ? "evidence" : "unresolved",
      { passed: Boolean(pair && sameC), evidence: ["lienhard-2024"], next: pair ? "Use the C_sf of Table 9.2." : "Choose a surface of Table 9.2, or measure C_sf for this surface." }));
    if (!(pair && sameC)) refused.push("the surface");
    const P = B.pressure;
    const pr = qn(p.pressure);
    const okP = P ? pr >= P.min && pr <= P.max : false;
    checks.push(check("bo-pressure", `Pressure: ${f(pr / 101325, 4)} atm ${okP ? "is inside" : "is outside"} the data of Rohsenow's comparison for water, 1 atm to 167.7 atm (${P?.where ?? "Fig. 9.7"}).`, okP ? "evidence" : "unresolved",
      { passed: okP, evidence: ["lienhard-2024"], next: okP ? "" : "The page does not extrapolate to other pressures." }));
    if (!okP) refused.push("the pressure");
    const orient = String(geometry?.orientation ?? ""), heater = String(geometry?.heater ?? ""), pool = String(geometry?.pool ?? "");
    const okGeo = /horizontal, facing up/.test(orient) && /flat plate/.test(heater) && pool === "saturated";
    checks.push(check("bo-geometry", okGeo ? "Orientation and pool: an upward-facing horizontal flat plate in a saturated pool." : `Orientation and pool: "${orient}", "${heater}", "${pool}" is not the declared upward-facing flat plate in a saturated pool.`, okGeo ? "evidence" : "unresolved",
      { passed: okGeo, evidence: ["lienhard-2024"], next: okGeo ? "" : "Other orientations and subcooled pools need separate declarations." }));
    if (!okGeo) refused.push("the orientation or the pool");
    const R = B.range;
    const inData = R ? xb >= R.lo && xb <= R.hi : false;
    checks.push(check("bo-range", `Superheat group X_b = ${f(xb, 4)} (ΔT_e = ${f(qn(p.DTe))} K) ${inData ? "is inside" : "is outside"} the data of Fig. 9.7, ${R?.lo} ≤ X_b ≤ ${R?.hi} (read from the figure).`, inData ? "evidence" : "unresolved",
      { passed: inData, evidence: ["lienhard-2024"], next: inData ? "" : "The page does not extrapolate the correlation outside its data." }));
    if (!inData) refused.push("the superheat");
    const lambdaD1 = 2 * Math.PI * Math.sqrt(3) * Math.sqrt(qn(p.sigma) / (qn(p.g) * qn(p.Drho)));
    const okW = qn(p.W) >= 3 * lambdaD1;
    checks.push(check("bo-heater", `Heater size: W = ${f(qn(p.W) * 100, 4)} cm against 3λ_d1 = ${f(3 * lambdaD1 * 100, 4)} cm (λ_d1 = 2π√3[σ/(g(ρ_f − ρ_g))]^(1/2)). ${okW ? "The heater is large enough for eqn. (9.11)." : "The heater is too small for eqn. (9.11): its peak flux is not the large-plate value."}`, okW ? "evidence" : "unresolved",
      { passed: okW, evidence: ["lienhard-2024"], next: okW ? "" : "Use a peak-flux declaration for small heaters." }));
    if (!okW) refused.push("the heater size");
    const qmax = C * Math.sqrt(qn(p.rhoG)) * qn(p.hfg) * (qn(p.g) * qn(p.Drho) * qn(p.sigma)) ** 0.25;
    const phi = (xb / cs) ** 3, qv = phi * qs;
    const below = qv < qmax;
    checks.push(check("bo-regime", `Phase regime: ${okW ? `the peak heat flux is q_max = ${f(qmax / 1e6, 4)} MW/m² (eqn. 9.11). ` : ""}Rohsenow's form gives ${f(qv / 1000, 4)} kW/m², ${below ? "below" : "above"} q_max: ${below ? "nucleate boiling" : "beyond the peak heat flux, where transition or film boiling needs a separate declaration"}.`, below && okW ? "evidence" : "unresolved",
      { passed: below && okW, evidence: ["lienhard-2024"], next: below ? "" : "Lower the wall superheat, or use a declaration for transition or film boiling." }));
    if (!below) refused.push("the regime");
    const ok = !refused.length;
    const unc = B.uncertainty ?? { q: 1, dT: 0.25 };
    checks.push(ok ? check("bo-q", `Rohsenow's correlation: q = μh_fg[g(ρ_f − ρ_g)/σ]^(1/2)(X_b/C_sf)³ = ${f(qv / 1000, 5)} kW/m², so h = q/ΔT_e = ${f(qv / qn(p.DTe) / 1000, 4)} kW/(m²·K). Typical errors: ${f(100 * unc.q)} % in q and ${f(100 * unc.dT)} % in ΔT_e.`, "evidence",
      { passed: true, tex: B.correlation?.tex ?? null, detail: `${B.correlation?.where}. ${B.correlation?.data}`, evidence: ["lienhard-2024"] })
      : check("bo-q", `The page refuses Rohsenow's correlation here: ${refused.join(", ")} ${refused.length > 1 ? "are" : "is"} outside its declared domain. It gives no heat flux and does not extrapolate.`, "unresolved",
        { passed: false, evidence: ["lienhard-2024"], next: "Bring the point inside the declared fluid, surface, pressure, data range and regime, or use another declaration." }));
    checks.push(check("bo-zuber", `The Zuber–Kutateladze constant 0.131 gives ${f((0.131 / C) * qmax / 1e6, 4)} MW/m², ${f(100 * (1 - 0.131 / C), 3)} % lower. ${B.peak?.zuber?.text ?? ""}`, "evidence", { passed: true, evidence: ["lienhard-2024"] }));
    const lit2 = data?.literature?.ex92, lit5 = data?.literature?.ex95;
    if (lit2 && lit5) {
      const grp = (lit2.mu * lit2.cp ** 3 * Math.sqrt((lit2.g * lit2.drho) / lit2.sigma)) / (lit2.hfg ** 2 * lit2.Pr ** 3);
      const qm5 = C * Math.sqrt(lit5.rhoG) * lit5.hfg * (lit5.g * (lit5.rhoF - lit5.rhoG4) * lit5.sigma) ** 0.25;
      checks.push(check("bo-reference", `Reference data: with the inputs of ${lit2.where}, the page gives μc_p³[g(ρ_f − ρ_g)/σ]^(1/2)/(h_fg²Pr³) = ${f(grp * 1e4, 4)} × 10⁻⁷ kW/(m²·K³) (book: 3.10); with those of ${lit5.where}, q_max = ${f(qm5 / 1e6, 5)} MW/m² (book: 1.260).`, "numerical",
        { passed: rel(grp, lit2.group) <= lit2.tolerance && rel(qm5, lit5.qmax) <= lit5.tolerance, tolerance: `relative ${lit2.tolerance} and ${lit5.tolerance}`, detail: `${lit2.note} ${lit5.note}`, evidence: [lit2.source] }));
    }
    steps.push(step(6, "Scales", "Rohsenow's heat-flux scale is the latent heat that viscous bubble flow carries over the capillary length; the superheat enters through X_b. The empirical constants C_sf, s = 1 and 0.149 keep their source and are not Pi variables.",
      ["\\phi=\\frac{q}{\\mu h_{fg}\\sqrt{g(\\rho_f-\\rho_g)/\\sigma}},\\qquad X_b=\\frac{c_p\\Delta T_e}{h_{fg}Pr}=\\frac{k\\Delta T_e}{\\mu h_{fg}},\\qquad M_b=\\frac{\\rho_g^{1/2}\\sigma^{3/4}}{\\mu\\,[g(\\rho_f-\\rho_g)]^{1/4}}"], ["lienhard-2024"]));
    steps.push(step(7, "The named correlations", "The declared result type is a named correlation of measured data.", [B.correlation?.tex ?? "", "\\phi=\\left(\\frac{X_b}{C_{sf}}\\right)^3,\\qquad \\phi_{max}=0.149\\,M_b"], ["lienhard-2024"]));
    steps.push(step(8, "Domain and the empirical boundaries", `${B.correlation?.data ?? ""} ${B.peak?.conditions ?? ""}`, ["0.006\\le X_b\\le0.06,\\qquad 1\\ \\mathrm{atm}\\le p\\le167.7\\ \\mathrm{atm},\\qquad q<q_{max},\\qquad W\\ge3\\lambda_{d1}"], ["lienhard-2024"]));
    // The boiling curve inside the data, with the uncertainty band and the peak heat flux.
    const dts = Array.from({ length: 41 }, (_, i) => { const x = (R?.lo ?? 0.006) * ((R?.hi ?? 0.06) / (R?.lo ?? 0.006)) ** (i / 40); return x * qn(p.mu) * qn(p.hfg) / qn(p.k); });
    const curve = dts.map((dt) => [dt, (((qn(p.k) * dt) / (qn(p.mu) * qn(p.hfg)) / cs) ** 3 * qs) / 1000]);
    return {
      groups: [{ id: "Xb", label: "X_b", tex: "X_b", value: xb, exact: Q.str(Xb) }, { id: "Cs", label: "C_sf", tex: "C_{sf}", value: cs, exact: Q.str(p.Csf) }, { id: "Mb", label: "M_b", tex: "M_b", value: Mb, exact: null }],
      values: { q: ok ? qv : null, h: ok ? qv / qn(p.DTe) : null, qmax, lambdaD1, refused, phi, Mb },
      checks, steps,
      figures: [{ id: "bo-curve", title: "Nucleate boiling curve inside the data of Fig. 9.7, with the typical error and the peak heat flux", x: { label: "ΔT_e = T_w − T_sat (K)", log: true }, y: { label: "q (kW/m²)", log: true },
        series: [{ label: `Rohsenow, C_sf = ${Q.str(p.Csf)}`, points: curve }, { label: "Typical error band, ×2 and ×1/2 in q", dashed: true, points: curve.map(([x, y]) => [x, 2 * y]) }, { label: " ", dashed: true, points: curve.map(([x, y]) => [x, y / 2]) },
          { label: `Peak heat flux ${f(qmax / 1e6, 3)} MW/m² (eqn. 9.11)`, dashed: true, points: [[curve[0][0], qmax / 1000], [curve[curve.length - 1][0], qmax / 1000]] }],
        marks: [{ x: qn(p.DTe), y: qv / 1000, label: ok ? "this point" : "refused point" }] }],
    };
  }

  /* ======================================================================================================
   * Radiation in a medium: a grey slab at a uniform temperature between black walls
   * ====================================================================================================== */

  const EULER = 0.5772156649015329;
  /** The exponential integral E_n(x), x ≥ 0: series for x ≤ 1, continued fraction (modified Lentz) above. */
  function En(n, x) {
    if (x === 0) return n === 1 ? Infinity : 1 / (n - 1);
    const nm1 = n - 1;
    if (x > 1) {
      let b = x + n, c = 1e300, d = 1 / b, h = d;
      for (let i = 1; i < 500; i++) {
        const an = -i * (nm1 + i);
        b += 2;
        d = 1 / (an * d + b);
        c = b + an / c;
        const del = c * d;
        h *= del;
        if (Math.abs(del - 1) < 1e-16) break;
      }
      return h * Math.exp(-x);
    }
    let ans = nm1 !== 0 ? 1 / nm1 : -Math.log(x) - EULER, fact = 1;
    for (let i = 1; i < 500; i++) {
      fact *= -x / i;
      let del;
      if (i !== nm1) del = -fact / (i - nm1);
      else { let psi = -EULER; for (let k = 1; k <= nm1; k++) psi += 1 / k; del = fact * (-Math.log(x) + psi); }
      ans += del;
      if (Math.abs(del) < Math.abs(ans) * 1e-16) break;
    }
    return ans;
  }
  /** Slab emissivity and transmissivity for diffuse radiation. */
  const slabEm = (tau) => 1 - 2 * En(3, tau);
  /** Thin, thick and Rosseland error measures at τ_L (see the declaration). */
  const slabErrors = (tau) => { const e = slabEm(tau); return { thin: Math.abs((2 * tau) / e - 1), thick: (2 * En(3, tau)) / e, rosseland: 2 * En(3, tau / 2) }; };

  /**
   * The slab at the record's values. p: kappa, L, sigma, Tg, T1, T2 (exact rationals, SI).
   * @param {any} p @param {any} data data/transfer.json @param {any} refs data/transferrefs.json
   */
  function slab(p, data, refs = null) {
    const checks = [], steps = [];
    const tauQ = Q.mul(p.kappa, p.L), r1 = Q.div(p.T1, p.Tg), r2 = Q.div(p.T2, p.Tg);
    const tau = qn(tauQ);
    checks.push(check("sl-groups", `τ_L = κ_aL = ${exactText(tauQ)}, r_1 = T_1/T_g = ${exactText(r1)} and r_2 = T_2/T_g = ${exactText(r2)}, exact fractions of absolute temperatures.`, "exact", { passed: true, evidence: ["spec-10"] }));
    const sg = qn(p.sigma), Eg = sg * qn(p.Tg) ** 4, E1 = sg * qn(p.T1) ** 4, E2 = sg * qn(p.T2) ** 4;
    const tr = 2 * En(3, tau), em = 1 - tr;
    const q1 = E1 - em * Eg - tr * E2, q2 = E2 - em * Eg - tr * E1;
    const lit = data?.literature?.beach;
    if (lit) {
      const rows = lit.rows.map((r) => ({ ...r, em: slabEm(r.tau), tr: 2 * En(3, r.tau) }));
      const ok = rows.every((r) => Math.abs(r.em - r.emission) <= lit.tolerance && Math.abs(r.tr - r.transmission) <= lit.tolerance);
      checks.push(check("sl-reference", `Radiative-transfer reference: the page's slab emissivity 1 − 2E₃(τ) is ${rows.map((r) => `${f(r.em, 5)} at τ = ${r.tau}`).join(", ")}, and the transmissivity 2E₃(τ) is ${rows.map((r) => f(r.tr, 5)).join(", ")}. Beach, Özişik and Siewert (${lit.where}) give ${rows.map((r) => r.emission.toFixed(4)).join(", ")} and ${rows.map((r) => r.transmission.toFixed(4)).join(", ")}.`, "numerical",
        { passed: ok, tolerance: `absolute ${lit.tolerance}, half a unit in the last printed digit`, detail: lit.note, evidence: [lit.source] }));
    }
    if (refs?.slab?.E3) {
      const worst = Math.max(...refs.slab.E3.map((r) => rel(En(3, r.x), Number(r.E3))));
      checks.push(check("sl-en", `E₃ against mpmath ${refs.versions.mpmath} at ${refs.slab.E3.length} arguments from ${refs.slab.E3[0].x} to ${refs.slab.E3.at(-1).x}: largest relative difference ${worst.toExponential(1)}.`, "numerical",
        { passed: worst <= 1e-13, tolerance: "relative 1e-13", evidence: ["spec-14"] }));
    }
    // Independent check: Gauss–Legendre quadrature in μ of the exact ray solutions.
    const qQuad = (pieces) => {
      const inc = SF.gauss((mu) => (Eg * (1 - Math.exp(-tau / mu)) + E2 * Math.exp(-tau / mu)) * mu, 1e-300, 1, pieces);
      return E1 - 2 * inc;
    };
    const qs = [1, 2, 4].map(qQuad);
    checks.push(check("sl-quadrature", `The net flux into the gas at wall 1 from 20-point Gauss–Legendre quadrature of the exact ray solutions on 1, 2 and 4 panels is ${qs.map((x) => f(x, 10)).join(", ")} W/m²; the closed form σT_1⁴ − ε_sσT_g⁴ − 2E₃(τ_L)σT_2⁴ gives ${f(q1, 10)} W/m².`, "numerical",
      { passed: rel(qs[2], q1) <= 1e-10, tolerance: "relative 1e-10 on 4 panels", evidence: ["beach-1971"] }));
    // Energy: the power that the gas absorbs equals the sum of the net fluxes into it at both walls.
    // G − 4σT_g⁴ = 2(σT_1⁴ − σT_g⁴)E_2(τx) + 2(σT_2⁴ − σT_g⁴)E_2(τ(1 − x)), by quadrature in μ; E_2 has a z ln z term at
    // each wall, so x = t²/2 on each half makes the integrand smooth for the Gauss–Legendre rule in x.
    const G = (x) => 2 * SF.gauss((mu) => (E1 - Eg) * Math.exp(-(tau * x) / mu) + (E2 - Eg) * Math.exp(-(tau * (1 - x)) / mu), 1e-300, 1, 4);
    const half = (side) => SF.gauss((t) => G(side ? 1 - (t * t) / 2 : (t * t) / 2) * t, 0, 1, 4);
    const absorbed = tau * (half(0) + half(1));
    checks.push(check("sl-energy", `Energy balance of the gas: ∫κ_a(G − 4σT_g⁴)dx = ${f(absorbed, 8)} W/m² by quadrature, and the net fluxes into the gas at the two walls add to ${f(q1 + q2, 8)} W/m² = ε_s(σT_1⁴ + σT_2⁴ − 2σT_g⁴). ${q1 + q2 < 0 ? "The gas loses this power: the prescribed temperature needs a heat source of the same size." : "The gas gains this power."}`, "numerical",
      { passed: rel(absorbed, q1 + q2) <= 1e-9, tolerance: "relative 1e-9 (20-point Gauss–Legendre on 4 panels in x and in μ)", evidence: ["beach-1971"] }));
    const er = slabErrors(tau);
    const bnd = refs?.slab?.boundaries?.["1e-2"] ?? null;
    checks.push(check("sl-limits", `Optical-thickness limits at τ_L = ${f(tau)}: the thin form ε_s ≈ 2τ_L has the relative error ${f(er.thin, 4)}, and the opaque form ε_s ≈ 1 has ${f(er.thick, 4)}.${bnd ? ` At the tolerance 0.01 the thin form holds for τ_L ≤ ${f(bnd.thin, 4)} and the opaque form for τ_L ≥ ${f(bnd.thick, 4)} (mpmath, tools/transfer_references.py).` : ""}`, "numerical",
      { passed: true, tolerance: "the map's tolerance", evidence: ["spec-8"] }));
    checks.push(check("sl-rosseland", `Rosseland diffusion, q = −(16σT³/(3κ_a)) dT/dx, gives no net flux inside a medium at a uniform temperature. The exact flux at the mid-plane is 2E₃(τ_L/2)σ(T_1⁴ − T_2⁴) = ${f(er.rosseland, 4)}σ(T_1⁴ − T_2⁴). ${er.rosseland <= 0.01 ? "Inside the tolerance 0.01: the approximation holds here." : `This is more than the tolerance 0.01, so τ_L = ${f(tau)} is outside the assumption τ ≫ 1 and the page does not use the Rosseland result.`}${bnd ? ` It holds for τ_L ≥ ${f(bnd.rosseland, 4)}.` : ""}`, "numerical",
      { passed: true, tolerance: "0.01 of σ(T_1⁴ − T_2⁴)", evidence: ["comsol-rosseland"] }));
    steps.push(step(6, "Scales", "The thickness L scales x, and the blackbody emissive power σT_g⁴ of the gas scales the intensities. Radiation needs absolute temperatures, so the wall temperatures enter as the ratios r_1 and r_2 to the fourth power.",
      ["X=\\frac xL,\\qquad j_\\pm=\\frac{\\pi I_\\pm}{\\sigma T_g^4},\\qquad \\tau_L=\\kappa_aL,\\qquad r_1=\\frac{T_1}{T_g},\\qquad r_2=\\frac{T_2}{T_g}"], ["spec-10"]));
    steps.push(step(7, "Dimensionless equations and conditions", "Each ray loses intensity by absorption and gains it by emission of the gas.", ["\\mu\\frac{\\mathrm dj_+}{\\mathrm dX}=\\tau_L(1-j_+),\\quad -\\mu\\frac{\\mathrm dj_-}{\\mathrm dX}=\\tau_L(1-j_-),\\quad j_+(0)=r_1^4,\\quad j_-(1)=r_2^4"], ["beach-1971"]));
    steps.push(step(8, "Solution and the optical-thickness limits", "The ray solutions decay as e^(−τ/μ). Their angular integrals give E₃, so the gas emits ε_s = 1 − 2E₃(τ_L) and transmits 2E₃(τ_L) of the wall radiation.",
      ["j_+=1+(r_1^4-1)e^{-\\tau_LX/\\mu},\\qquad \\frac{q(X)}{\\sigma T_g^4}=2(r_1^4-1)E_3(\\tau_LX)-2(r_2^4-1)E_3(\\tau_L(1-X))", "\\varepsilon_s=1-2E_3(\\tau_L)\\ \\to\\ 2\\tau_L\\ (\\tau_L\\to0),\\qquad \\to1\\ (\\tau_L\\to\\infty)"], ["beach-1971", "comsol-rosseland"]));
    steps.push(step(10, "Checks", "The groups are exact. The E_n values, the table of Beach, Özişik and Siewert, the quadrature of the ray solutions and the energy balance are numerical checks with stated tolerances.", ["q_1+q_2=\\int_0^L\\kappa_a\\left(G-4\\sigma T_g^4\\right)\\mathrm dx"]));
    const taus = Array.from({ length: 61 }, (_, i) => 10 ** (-3 + (5 * i) / 60));
    const xs = Array.from({ length: 51 }, (_, i) => i / 50);
    const qx = (x) => (2 * (E1 - Eg) * En(3, tau * x) - 2 * (E2 - Eg) * En(3, tau * (1 - x))) / Eg;
    return {
      groups: [{ id: "tau", label: "τ_L", tex: "\\tau_L", value: tau, exact: Q.str(tauQ) }, { id: "r1", label: "r_1", tex: "r_1", value: qn(r1), exact: Q.str(r1) }, { id: "r2", label: "r_2", tex: "r_2", value: qn(r2), exact: Q.str(r2) }, { id: "eps", label: "ε_s", tex: "\\varepsilon_s", value: em, exact: null }],
      values: { tau, emissivity: em, transmissivity: tr, q1, q2, absorbed, errors: er },
      checks, steps,
      figures: [
        { id: "sl-emissivity", title: "Slab emissivity against optical thickness, with the thin and opaque limits", x: { label: "τ_L = κ_aL", log: true }, y: { label: "ε_s = 1 − 2E₃(τ_L)", log: true },
          series: [{ label: "Exact 1 − 2E₃(τ_L)", points: taus.map((t) => [t, slabEm(t)]) }, { label: "Thin limit 2τ_L", dashed: true, points: taus.filter((t) => t <= 0.5).map((t) => [t, 2 * t]) }, { label: "Opaque limit 1", dashed: true, points: [[0.3, 1], [100, 1]] }],
          marks: [{ x: tau, y: em, label: "this slab" }] },
        { id: "sl-flux", title: "Net radiative flux across the slab; Rosseland diffusion gives 0 inside a uniform medium", x: { label: "X = x/L" }, y: { label: "q/(σT_g⁴)" },
          series: [{ label: "Exact, from the ray solutions", points: xs.map((x) => [x, qx(x)]) }, { label: "Rosseland: 0", dashed: true, points: [[0, 0], [1, 0]] }] },
      ],
    };
  }

  /* ======================================================================================================
   * The declared models for the Regime Map Builder (src/regime.js IMPLS)
   * ====================================================================================================== */

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
  const fmt = (x) => (Number.isFinite(x) ? N.fmt(x, 6) : "–");

  /** The generic solution panel (src/stabview.js) of a solver's output. */
  function panel(decl, out, opts) {
    const figures = (out.figures ?? []).filter((fg) => fg.series).map((fg) => {
      const pts = fg.series.flatMap((x) => x.points).filter((q2) => Number.isFinite(q2[0]) && Number.isFinite(q2[1]) && (!fg.y?.log || q2[1] > 0) && (!fg.x?.log || q2[0] > 0));
      const xs = pts.map((q2) => q2[0]), ys = pts.map((q2) => q2[1]);
      const pad = (lo, hi, log) => { if (log) return [lo / 1.5, hi * 1.5]; const d = (hi - lo) || 1; return [lo - 0.04 * d, hi + 0.04 * d]; };
      const [x0, x1] = pad(Math.min(...xs), Math.max(...xs), fg.x?.log);
      const [y0, y1] = fg.yRange ?? pad(Math.min(...ys), Math.max(...ys), fg.y?.log);
      return { id: `st-tr-${decl.id}-${fg.id}`, title: fg.title, caption: fg.caption,
        x: { min: x0, max: x1, label: fg.x?.label ?? "x", log: Boolean(fg.x?.log) }, y: { min: y0, max: y1, label: fg.y?.label ?? "y", log: Boolean(fg.y?.log) },
        series: fg.series.map((x) => ({ label: x.label, pts: x.points.filter((q2) => Number.isFinite(q2[0]) && Number.isFinite(q2[1]) && (!fg.y?.log || q2[1] > 0)).map(([a, b]) => [num(a), num(b)]), dash: x.dashed ? "6 4" : null })),
        points: (fg.marks ?? []).filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y)).map((m) => ({ x: num(m.x), y: num(m.y), shape: "circle", r: 4, label: m.label })) };
    });
    const tables = [];
    if (out.groups?.length) tables.push({ title: "Groups at the record's values", columns: ["Group", "Exact value", "Value"], rows: out.groups.map((g) => [g.label, g.exact && g.exact.length <= 28 ? g.exact : "–", fmt(g.value)]) });
    for (const t of opts.tables ?? []) tables.push(t);
    const results = out.checks.map((c) => ({ id: `r-tr-${c.id}`, kind: opts.kind ?? "solution", title: c.title, status: c.status === "exact" || c.status === "numerical" ? (c.passed ? c.status : "unresolved") : c.status,
      tolerance: c.tolerance ?? null, next: c.next ?? (c.passed ? "" : "Check the inputs of this result."), steps: ["s-tr-solution"], evidence: c.evidence?.length ? c.evidence : ["spec-10"] }));
    return { family: decl.family, model: decl.id, generic: true, heading: opts.heading, point: opts.point ?? {}, concept: opts.concept,
      results, figures, tables, method: out.steps.map((x) => `${x.title}. ${x.reason}`), displays: out.steps.map((x) => ({ title: `Hand calculation ${x.item}: ${x.title}`, tex: x.tex.filter(Boolean) })) };
  }
  const approxLayer = (id, title, measure, criterion, hue, evidence = ["spec-8"]) => ({ id, kind: "approximation", boundary: "approximation", title, measure, scale: "log", status: "exact", hue, criterion, steps: ["s-rm-map"], evidence,
    thresholds: (tol) => ({ curves: [{ value: tol, label: `${title}: error = ${tol}` }], regions: [{ id: "meets", label: `${title} meets the tolerance`, lo: 0, hi: tol, closed: true }] }) });
  const balanceLayer = (id, title, measure, criterion, below, above, status = "proposed", evidence = ["spec-8"]) => ({ id, kind: "balance", boundary: "balance-crossover", title, measure, scale: "log", status, hue: id, criterion, steps: ["s-rm-map"], evidence,
    thresholds: () => ({ curves: [{ value: 1, label: `${title}: the terms are equal` }], regions: [{ id: "below", label: below, lo: 0, hi: 1 }, { id: "above", label: above, lo: 1, hi: null }] }) });
  function empiricalLayer(id, title, measure, set, criterion) {
    return { id, kind: "empirical", boundary: "empirical", title, measure, scale: "log", status: "evidence", hue: id, criterion: `${criterion} ${set.data}`, steps: ["s-rm-map"], evidence: [set.source],
      thresholds: () => ({ curves: set.regions.slice(1).map((r) => ({ value: r.lo, label: `${title}: ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)} from here` })), regions: set.regions.map((r) => ({ id: r.id, label: r.label, lo: r.lo ?? 0, hi: r.hi })) }) };
  }
  const baseImpl = (decl, o) => ({ id: decl.id, params: decl.domain.parameters, approximations: [], limits: () => [], derived: () => [], constraints: () => [], ...o });
  const acceptance = (run) => (ctx) => { const out = run(ctx); return out.lack ? [{ id: "values", title: `The record has no value for ${out.lack.join(", ")}`, passed: false, status: "exact", detail: "Enter the values of the standard example." }] : out.checks.filter(isCheck).map(acceptOf); };
  const solution = (decl, run, opts) => (p, ctx) => { const out = run(ctx); return out.lack ? null : panel(decl, out, { heading: "Hand calculation 10: the declared solution and its reference checks", ...opts(p, out) }); };
  const noAsymptotic = (why) => ({ limits: [], overlap: why, gaps: "None: the page uses the declared solution at every point." });

  function exchangerImpl(decl, data) {
    const arr = decl.id === "hx-parallel" ? "parallel" : "counterflow";
    const par = arr === "parallel";
    const run = (ctx) => { const v = values(ctx, { U: "U", A: "A", Ch: "C_h", Cc: "C_c", Thin: "T_h_in", Tcin: "T_c_in" }); const lack = lacking(v, ["U", "A", "Ch", "Cc", "Thin", "Tcin"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => exchanger(v, arr, data?.transfer?.literature?.ex35)); };
    const err = (p) => { const e = effectiveness(arr, p.NTU, p.Cr); return { single: Math.abs(-Math.expm1(-p.NTU) - e) / e, small: Math.abs(p.NTU - e) / e, balanced: Math.abs(p.NTU / (1 + p.NTU) - e) / e }; };
    return baseImpl(decl, { axes: { x: "NTU", y: "Cr" },
      approximations: [{ id: "single", label: "Single-stream form 1 − e^(−NTU)", tex: "C_r\\to0", limit: "C_r → 0", why: "One stream barely changes its temperature: every arrangement gives the same ε.", error: "relative error against the exact ε" },
        { id: "small", label: "Small-NTU form ε ≈ NTU", tex: "NTU\\to0", limit: "NTU → 0", why: "Neither stream changes its temperature much: the local difference stays near ΔT_in.", error: "relative error against the exact ε" },
        ...(par ? [] : [{ id: "balanced", label: "Balanced form NTU/(1 + NTU)", tex: "C_r\\to1", limit: "C_r → 1", why: "Equal capacity rates: the temperature difference is constant along the exchanger.", error: "relative error against the exact ε" }])],
      layers: [approxLayer("single", "Single-stream form", "single", "The relative error |1 − e^(−NTU) − ε|/ε, from the closed forms, at most the tolerance", "single"),
        approxLayer("small", "Small-NTU form", "small", "The relative error |NTU − ε|/ε, at most the tolerance", "small"),
        ...(par ? [] : [approxLayer("balanced", "Balanced form", "balanced", "The relative error |NTU/(1 + NTU) − ε|/ε, at most the tolerance", "balanced")]),
        balanceLayer("ntu", "Heat exchanged against stream heating", "NTU", "NTU compares the exchanger's conductance U_HX A with the capacity rate C_min", "The streams change their temperature little", "The temperature difference decays along the exchanger")],
      evaluate: (p) => (p.NTU > 0 && p.Cr >= 0 && p.Cr <= 1 ? { ok: true, values: { ...err(p), NTU: p.NTU } } : { ok: false, reason: "NTU must be positive and 0 ≤ C_r ≤ 1." }),
      limits: () => [{ id: "cr0", label: "C_r → 0: single stream", coupled: false, note: "A regular limit, the same for every arrangement.", points: [{ Cr: 0 }] }, { id: "ntuinf", label: `NTU → ∞: ε → ${par ? "1/(1 + C_r)" : "1"}`, coupled: false, note: par ? "Parallel flow cannot reach the cold inlet temperature." : "Counterflow can approach complete exchange.", points: [{ NTU: 10 }] }],
      inspect: (p) => ({ ok: true, values: [{ id: "eps", tex: "\\varepsilon", label: "effectiveness", value: num(effectiveness(arr, p.NTU, p.Cr)) }, { id: "max", tex: "\\varepsilon_{\\infty}", label: "limit for NTU → ∞", value: num(par ? 1 / (1 + p.Cr) : 1) }], checks: [], reconstruction: [] }),
      derived: (p) => [{ id: "eps", tex: "\\varepsilon", label: "effectiveness at the point", value: num(effectiveness(arr, p.NTU ?? 1, p.Cr ?? 0.5)) }],
      analysis: () => ({ note: "The closed-form effectiveness gives every value on the map exactly up to rounding.",
        balance: { intro: "Two terms compete in each stream's equation.", terms: [{ tex: "\\theta'", label: "change of the stream temperature", scale: "1", why: "θ changes by at most 1 over ξ = 1." }, { tex: "NTU(\\theta_h-\\theta_c)", label: "heat exchanged with the other stream", scale: "NTU", why: "The local difference is of order 1 at the inlet." }],
          balances: [{ title: "Small exchanger", when: "NTU\\ll1", derivation: "The local difference stays near its inlet value 1, so ε ≈ NTU.", reduced: "\\theta_h\\approx1-NTU\\,\\xi", neglected: "the change of the local difference", assumptions: ["NTU small."], residual: { tex: "NTU^2", order: "second order in NTU", status: "exact", note: "ε = NTU − (1 + C_r)NTU²/2 + … for parallel flow." } }],
          crossovers: [{ criterion: "NTU=1", status: "proposed", text: "The exchanger's conductance equals the capacity rate C_min." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: { limits: [], overlap: par ? "The single-stream and small-NTU forms overlap for small NTU and small C_r." : "The single-stream, small-NTU and balanced forms each hold near their own edge of the map.", gaps: "Between them, only the closed form meets a small tolerance." } }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: `a single-pass ${par ? "parallel-flow" : "counterflow"} exchanger: effectiveness-NTU, the conserved enthalpy flux and Runge–Kutta profiles`, point: { NTU: num(p.NTU), Cr: num(p.Cr) } })) });
  }

  function stefanImpl(decl, data) {
    const run = (ctx) => { const v = values(ctx, { rho: "rho", cl: "c_l", cs: "c_s", kl: "k_l", ks: "k_s", ell: "ell", DTl: "DT_l", DTs: "DT_s", tr: "t_r", Tm: "T_m" }); const lack = lacking(v, ["rho", "cl", "cs", "kl", "ks", "ell", "DTl", "DTs", "tr"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => stefan(v, data?.transferrefs)); };
    const errs = (p) => { const nu = 1 / Math.sqrt(p.kappa), l = lambda(p.Ste_l, p.Ste_s, nu), l1 = lambda(p.Ste_l, 0, 1); return { qs: Math.abs(Math.sqrt(p.Ste_l / 2) - l) / l, one: Math.abs(l1 - l) / l, ratio: p.Ste_l, lambda: l }; };
    return baseImpl(decl, { axes: { x: "Ste_l", y: "Ste_s" },
      approximations: [{ id: "qs", label: "Quasi-steady one-phase front λ = (Ste_l/2)^(1/2)", tex: "Ste_l\\to0", limit: "Ste_l → 0, Ste_s → 0", why: "The latent heat controls: the liquid profile is linear and the solid takes no heat.", error: "relative error of λ against the two-phase root" },
        { id: "one", label: "One-phase model (subcooling neglected)", tex: "Ste_s\\to0", limit: "Ste_s → 0", why: "The solid is at the melting temperature and takes no heat.", error: "relative error of λ against the two-phase root" }],
      layers: [approxLayer("qs", "Quasi-steady front", "qs", "The relative error of λ = (Ste_l/2)^(1/2) against the two-phase root, at most the tolerance", "qs"),
        approxLayer("one", "One-phase model", "one", "The relative error of the one-phase λ against the two-phase root, at most the tolerance", "one"),
        balanceLayer("latent", "Sensible heat against latent heat", "ratio", "Ste_l compares the sensible heat c_l(T_w − T_m) of the liquid with the latent heat ℓ", "The latent heat controls", "The sensible heat controls")],
      evaluate: (p) => (p.Ste_l > 0 && p.Ste_s >= 0 && p.kappa > 0 ? { ok: true, values: errs(p) } : { ok: false, reason: "Ste_l and κ must be positive and Ste_s ≥ 0." }),
      limits: () => [{ id: "ste0", label: "Ste_l → 0: quasi-steady front", coupled: true, note: "Ste_s must go to 0 as well for the one-phase form; the limit couples the two parameters.", points: [{ Ste_l: 0.001, Ste_s: 0 }] }],
      inspect: (p) => { const e = errs(p); return { ok: true, values: [{ id: "lambda", tex: "\\lambda", label: "front coefficient, s = 2λ(α_lt)^(1/2)", value: num(e.lambda) }, { id: "lambda1", tex: "\\lambda_1", label: "one-phase coefficient", value: num(lambda(p.Ste_l, 0, 1)) }], checks: [], reconstruction: [] }; },
      derived: (p) => [{ id: "lambda", tex: "\\lambda", label: "front coefficient at the point", value: num(lambda(p.Ste_l ?? 0.1, p.Ste_s ?? 0, 1 / Math.sqrt(p.kappa ?? 1))) }],
      analysis: () => ({ note: "Each point of the map solves the transcendental equation for λ (Brent, 1e-16).",
        balance: { intro: "The Stefan condition balances the latent heat of the moving front against the heat conducted in each phase.", terms: [{ tex: "\\dot S/Ste_l", label: "latent heat of the front", scale: "1/Ste_l", why: "S grows like τ^(1/2)." }, { tex: "\\theta_{l,X}", label: "conduction in the liquid", scale: "1", why: "θ_l falls by 1 across the liquid layer." }],
          balances: [{ title: "Latent heat controls", when: "Ste_l\\ll1", derivation: "The liquid profile is quasi-steady and linear, θ_l = 1 − X/S, so S Ṡ = Ste_l.", reduced: "s^2=2Ste_l\\alpha_lt", neglected: "the sensible heat of the liquid and the heat taken by the solid", assumptions: ["Ste_l small.", "Ste_s small."], residual: { tex: "Ste_l^2", order: "the next order of λ²", status: "numerical", note: "λ² = Ste/2 − Ste²/6 + … for the one-phase model." } }],
          crossovers: [{ criterion: "Ste_l=1", status: "proposed", text: "The sensible heat of the liquid equals the latent heat." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: { limits: [], overlap: "The quasi-steady front holds for small Ste_l and Ste_s; the one-phase model holds for small Ste_s at any Ste_l.", gaps: "For large Ste_s only the two-phase root meets a small tolerance." } }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "the two-phase Neumann solution of melting, with the latent-energy balance and an independent transient solution", point: { Ste_l: num(p.Ste_l), Ste_s: num(p.Ste_s), kappa: num(p.kappa) } })) });
  }

  function filmImpl(decl, data) {
    const run = (ctx) => { const v = values(ctx, { g: "g", rhoF: "rho_f", Drho: "Drho", nu: "nu", k: "k", cp: "c_p", hfg: "h_fg", hfgc: "h_fgc", DT: "DT_w", L: "L" }); const lack = lacking(v, ["g", "rhoF", "Drho", "nu", "k", "cp", "hfg", "hfgc", "DT", "L"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => film(v, data?.transfer)); };
    const set = data?.transfer?.film?.boundaries?.state;
    const rec = (p) => (p.Ga * (4 / p.Pi4) ** 0.75) / 3;
    return baseImpl(decl, { axes: { x: "Pi4", y: "Ga" },
      layers: set ? [empiricalLayer("state", "State of the film", "Rec", set, "The film Reynolds number Re_c = Ga(4/Π₄)^(3/4)/3 at the bottom of the wall, against the cited limits.")] : [],
      evaluate: (p) => (p.Pi4 > 0 && p.Ga > 0 ? { ok: true, values: { Rec: rec(p) } } : { ok: false, reason: "Π₄ and Ga must be positive." }),
      inspect: (p) => ({ ok: true, values: [{ id: "Nu", tex: "\\overline{Nu}_L", label: "mean Nusselt number (2√2/3)Π₄^(1/4)", value: num(((2 * Math.SQRT2) / 3) * p.Pi4 ** 0.25) }, { id: "Rec", tex: "Re_c", label: "film Reynolds number Γ_c/μ at the bottom", value: num(rec(p)) }], checks: [], reconstruction: [] }),
      derived: (p) => [{ id: "Rec", tex: "Re_c", label: "film Reynolds number at the bottom", value: num(rec({ Pi4: p.Pi4 ?? 1e12, Ga: p.Ga ?? 1e10 })) }],
      analysis: () => ({ note: "The film has an exact solution; the map shows where the cited data support Nusselt's laminar result.",
        balance: { intro: "In the film, gravity balances viscosity, and conduction across the film carries the latent heat of condensation.", terms: [], balances: [], crossovers: [], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("Nusselt's film is the leading order for Ja → 0; the correction h′_fg carries the first order in Ja.") }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "Nusselt's laminar film on a vertical wall, with an exact latent-energy balance and the cited film states", point: { Pi4: num(p.Pi4), Ga: num(p.Ga) } })) });
  }

  function boilingImpl(decl, data, options) {
    const geometry = options?.geometry ?? {};
    const run = (ctx) => { const v = values(ctx, { mu: "mu", hfg: "h_fg", g: "g", Drho: "Drho", rhoG: "rho_g", sigma: "sigma", k: "k", Csf: "C_sf", DTe: "DT_e", pressure: "p", W: "W", cp: "c_p" }); const lack = lacking(v, ["mu", "hfg", "g", "Drho", "rhoG", "sigma", "k", "Csf", "DTe", "pressure", "W"]); return lack.length ? { lack } : once(keyOf(decl.id, v, JSON.stringify(geometry)), () => boiling(v, geometry, data?.transfer)); };
    const B = data?.transfer?.boiling?.boundaries ?? null;
    return baseImpl(decl, { axes: { x: "Xb", y: "Cs" },
      layers: B ? [empiricalLayer("range", "Data of Rohsenow's comparison", "Xb", B.range, "The superheat group X_b against the data range of Fig. 9.7."),
        { ...empiricalLayer("regime", "Nucleate regime", "ratio", B.regime, "q/q_max = (X_b/C_sf)³/(0.149 M_b) against 1."), scale: "log" }] : [],
      evaluate: (p) => (p.Xb > 0 && p.Cs > 0 && p.Mb > 0 ? { ok: true, values: { Xb: p.Xb, ratio: (p.Xb / p.Cs) ** 3 / (0.149 * p.Mb) } } : { ok: false, reason: "X_b, C_sf and M_b must be positive." }),
      inspect: (p) => { const ratio = (p.Xb / p.Cs) ** 3 / (0.149 * p.Mb); const inside = p.Xb >= 0.006 && p.Xb <= 0.06 && ratio < 1;
        return { ok: true, values: [{ id: "phi", tex: "\\phi", label: inside ? "dimensionless heat flux (X_b/C_sf)³" : "refused: outside the data or beyond the peak flux", value: inside ? num((p.Xb / p.Cs) ** 3) : null }, { id: "ratio", tex: "q/q_{max}", label: "fraction of the peak heat flux", value: num(ratio) }], checks: [], reconstruction: [] }; },
      analysis: () => ({ note: "The map shows where the correlation's data and the nucleate regime hold. Outside them the page gives no heat flux.",
        balance: { intro: "The correlation is a fit of measured data; the page does not derive a balance of terms.", terms: [], balances: [], crossovers: [], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("A correlation has no declared small parameter.") }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "named boiling correlations with a strict domain: fluid, surface, pressure, data range, heater and phase regime", point: { Xb: num(p.Xb), Cs: num(p.Cs) } })) });
  }

  function slabImpl(decl, data) {
    const run = (ctx) => { const v = values(ctx, { kappa: "kappa_a", L: "L", sigma: "sigma", Tg: "T_g", T1: "T_1", T2: "T_2" }); const lack = lacking(v, ["kappa", "L", "sigma", "Tg", "T1", "T2"]); return lack.length ? { lack } : once(keyOf(decl.id, v), () => slab(v, data?.transfer, data?.transferrefs)); };
    return baseImpl(decl, { axes: { x: "tau_L", y: null },
      approximations: [{ id: "thin", label: "Optically thin form ε_s ≈ 2τ_L", tex: "\\tau_L\\to0", limit: "τ_L → 0", why: "Every ray crosses the slab with little absorption.", error: "relative error |2τ_L/ε_s − 1|" },
        { id: "thick", label: "Opaque form ε_s ≈ 1", tex: "\\tau_L\\to\\infty", limit: "τ_L → ∞", why: "The slab absorbs the wall radiation and emits as a black body.", error: "2E₃(τ_L)/ε_s" },
        { id: "rosseland", label: "Rosseland diffusion (no interior flux)", tex: "\\tau_L\\gg1", limit: "τ_L → ∞", why: "Deep inside an optically thick medium the radiation is local diffusion.", error: "mid-plane flux 2E₃(τ_L/2) over σ(T_1⁴ − T_2⁴)" }],
      layers: [approxLayer("thin", "Optically thin form", "thin", "|2τ_L/ε_s − 1| from the exact emissivity, at most the tolerance", "thin", ["spec-8", "beach-1971"]),
        approxLayer("thick", "Opaque form", "thick", "2E₃(τ_L)/ε_s, at most the tolerance", "thick", ["spec-8", "beach-1971"]),
        approxLayer("rosseland", "Rosseland diffusion", "rosseland", "The exact mid-plane flux 2E₃(τ_L/2) in units of σ(T_1⁴ − T_2⁴), at most the tolerance", "rosseland", ["comsol-rosseland"]),
        balanceLayer("mfp", "Thickness against the mean free path", "tau", "τ_L = κ_aL compares the thickness with the mean free path 1/κ_a", "Optically thin", "Optically thick")],
      evaluate: (p) => (p.tau_L > 0 ? { ok: true, values: { ...slabErrors(p.tau_L), tau: p.tau_L } } : { ok: false, reason: "τ_L must be positive." }),
      limits: () => [{ id: "thin", label: "τ_L → 0: optically thin", coupled: false, note: "A regular limit: ε_s = 2τ_L + O(τ_L² ln τ_L).", points: [{ tau_L: 0.001 }] }, { id: "thick", label: "τ_L → ∞: opaque, Rosseland inside", coupled: false, note: "The walls keep layers of a few mean free paths where diffusion does not hold.", points: [{ tau_L: 100 }] }],
      inspect: (p) => ({ ok: true, values: [{ id: "em", tex: "\\varepsilon_s", label: "slab emissivity 1 − 2E₃(τ_L)", value: num(slabEm(p.tau_L)) }, { id: "tr", tex: "2E_3", label: "transmissivity", value: num(2 * En(3, p.tau_L)) }], checks: [], reconstruction: [] }),
      derived: (p) => [{ id: "em", tex: "\\varepsilon_s", label: "slab emissivity at the point", value: num(slabEm(p.tau_L ?? 1)) }],
      analysis: () => ({ note: "The exact E₃ forms give every value on the map.",
        balance: { intro: "Along a ray, emission and absorption of the gas compete with the radiation that arrives from the wall.", terms: [{ tex: "\\mu j'", label: "change along the ray", scale: "1", why: "j changes by order 1 across the slab." }, { tex: "\\tau_L(1-j)", label: "emission minus absorption", scale: "τ_L", why: "The gas acts over the optical path." }],
          balances: [], crossovers: [{ criterion: "\\tau_L=1", status: "proposed", text: "The thickness equals one mean free path." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: { limits: [], overlap: "The thin form holds for small τ_L and the opaque and Rosseland forms for large τ_L.", gaps: "Around τ_L ≈ 1 only the exact solution meets a small tolerance." } }),
      acceptance: acceptance(run), stability: solution(decl, run, (p) => ({ concept: "a grey absorbing and emitting slab at a uniform temperature: exact ray solutions, E₃ and the optical-thickness limits", point: { tau_L: num(p.tau_L) } })) });
  }

  const IMPLS = { "hx-parallel": exchangerImpl, "hx-counterflow": exchangerImpl, "stefan-melting": stefanImpl, "nusselt-film": filmImpl, "rohsenow-water": boilingImpl, "absorbing-slab": slabImpl };
  /** The implementation of a declaration of piece 8, or null. */
  function implement(decl, options = {}, data = null) {
    const f2 = IMPLS[decl.id];
    return f2 ? f2(decl, data, options) : null;
  }

  return { implement, effectiveness, effectivenessNaive, counterflowSeries, hxProfiles, exchanger, neumannF, lambda, energyBalance, transient, stefan, film, boiling, En, slabEm, slabErrors, slab };
});
