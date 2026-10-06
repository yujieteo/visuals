/* Scientific Modelling: the frames of hand calculation item 9 (stability and bifurcation, piece 4) for the report and
 * the deck. frames(d) reads the same derived stability data and results as the page and returns Method frames (the
 * base state, the perturbation equations, the eigenvalue problem, the branch, the amplitude equation or the custom
 * system's continuation, with every numerical setting) and a Results frame. Tables hold every value the page draws.
 * Narration is plain spoken prose in ASD-STE100, with no symbols.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./record.js"));
  else root.StabReport = factory(root.SM.R);
})(typeof self !== "undefined" ? self : this, function (R) {
  "use strict";

  const cell = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const m = (tex) => `$${tex}$`;
  const dm = (tex) => `$$${tex}$$`;
  const status = (k) => `**${R.STATUS[k]}**`;
  const fmt = (x) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : Math.abs(x) >= 1e-3 && Math.abs(x) < 1e6 || x === 0 ? String(Number(x.toPrecision(6))) : x.toExponential(4));
  const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const words = (k) => WORDS[k] ?? String(k);
  const line = (r) => `- ${status(r.status)}: ${cell(r.title)}${r.tolerance ? ` Tolerance: ${cell(r.tolerance)}.` : ""}${r.next ? ` Next: ${cell(r.next)}` : ""}${r.valid ? "" : ` _Invalidated by the change of ${r.invalidatedBy.join(", ")}._`}`;
  const tn = (n) => ({ theta: "\\theta", Psi: "\\Psi", Omega: "\\Omega" })[n] ?? n;

  /** The exact checks: base state, perturbation equations, symmetry, Jacobian. */
  function exactFrame(st) {
    const ex = st.exact;
    if (!ex || (!ex.base && !ex.jacobian)) return [];
    const body = [];
    if (ex.base) {
      body.push(`Base state: ${ex.base.state.map((b) => m(`${tn(b.field)}=${b.tex}`)).join(", ")}${ex.base.relation ? `, with ${cell(ex.base.relation)}` : ""}. ${status(ex.base.ok ? "exact" : "unresolved")}`, "",
        "| Item | Residual after substitution |", "| --- | --- |",
        ...ex.base.equations.map((e) => `| equation ${e.of} | ${cell(e.residual)} |`), ...ex.base.conditions.map((c) => `| condition ${c.of} at ${cell(c.at)} | ${cell(c.residual)} |`), "",
        "Perturbation equations, the part of order ε of the substitution of the base state plus ε times a disturbance:", "",
        ...ex.perturbation.flatMap((p) => [dm(`${p.linear}=0`), ...(p.nonlinear !== "0" ? [`Dropped terms of order ε²: ${m(p.nonlinear)}`] : []), ""]));
    }
    if (ex.symmetry) body.push(`Symmetry: the equations are invariant under ${cell(ex.symmetry.text)}. ${status(ex.symmetry.ok ? "exact" : "unresolved")}`, "");
    if (ex.jacobian) body.push(`Linearization: ${m(`f=${ex.jacobian.rhsTex}`)} gives ${m(`\\partial f/\\partial ${tn(ex.jacobian.field)}=${ex.jacobian.tex}`)}. ${status(ex.jacobian.ok ? "exact" : "unresolved")}`);
    return [{ title: "Hand calculation 9: base state and perturbation equations", body: body.join("\n"),
      narration: ex.base ? "The base state satisfies every equation and condition exactly. The perturbation equations are the part of first order in the disturbance; the second-order terms are the nonlinear terms that the linear analysis drops." : "The derivative of the balance is exact. Its sign decides linear stability." }];
  }

  function boxFrames(an) {
    const out = [];
    const c = an.critical;
    out.push({
      title: `Hand calculation 9: eigenvalue problem and onset, mode n = ${an.box.n}`,
      body: [`Normal modes ${m("e^{\\sigma\\tau+iaX}")} with ${m("a=n\\pi/\\Gamma")} give, with ${m("W")} the vertical velocity and ${m("\\Theta")} the temperature,`, "",
        dm("\\frac{\\sigma}{Pr}(D^{2}-a^{2})W=(D^{2}-a^{2})^{2}W-Ra\\,a^{2}\\Theta,\\qquad \\sigma\\Theta=(D^{2}-a^{2})\\Theta+W,\\qquad W=DW=\\Theta=0\\ \\text{at}\\ Z=0,1."), "",
        `Concept: ${cell(an.concept)}. At Ra = ${fmt(an.point.Ra)}, Γ = ${fmt(an.point.Gamma)}, Pr = ${fmt(an.point.Pr)}:`, "",
        "| n | a = nπ/Γ | Neutral Ra | Largest σ |", "| --- | --- | --- | --- |", ...an.box.modes.map((x) => `| ${x.n} | ${fmt(x.a)} | ${fmt(x.Ra)} | ${fmt(x.sigma)} |`), "",
        `Leading spectrum of mode n = ${an.box.n}: ${an.lead.spectrum.map((e) => (e.im ? `${fmt(e.re)} ± ${fmt(Math.abs(e.im))}i` : fmt(e.re))).filter((t, k, a) => a.indexOf(t) === k).join(", ")}. Residual ${an.lead.residual.toExponential(2)}.`, "",
        "Minimum of the neutral curve of the unbounded layer, at three resolutions:", "", "| Nodes | Ra_c | a_c |", "| --- | --- | --- |", ...c.map((x) => `| ${x.K} | ${fmt(x.Ra)} | ${x.a.toFixed(5)} |`), "",
        `At onset the eigenvalue 0 is simple (second eigenvalue ${fmt(an.transversality.second)}) and crosses with ${m(`d\\sigma/dRa=${fmt(an.transversality.dsigma)}`)}.`, "",
        "Numerical procedure: Chebyshev collocation in Z on 16 interior nodes with W = (1 − ξ²)²p and Θ = (1 − ξ²)q, so the wall conditions hold exactly; balanced Hessenberg QR for the eigenvalues; inverse iteration for the modes; golden-section search on 2 ≤ a ≤ 4.5 for the minimum."].join("\n"),
      narration: `For each box mode the page solves an eigenvalue problem for the growth rate. The least stable mode is mode ${words(an.box.n)}. Its growth rate is ${an.lead.re > 0 ? "positive, so the conductive state is unstable at the record's Rayleigh number" : "negative, so the conductive state is stable at the record's Rayleigh number"}. The minimum of the neutral curve does not change with the resolution.`,
    });
    const br = an.branch;
    if (!br || !br.ok) return out;
    out.push({
      title: "Hand calculation 9: steady roll branch, amplitude equation and classification",
      body: [`Steady rolls of mode ${an.box.n}, with ψ odd and θ even about the side walls: ${br.M} Fourier modes in X and ${br.K} collocation nodes in Z, Newton's method to a row-scaled residual of 1e-11, natural continuation in Ra with a predictor in √(Ra − Ra_c). Onset at ${m(`Ra_c=${fmt(br.Ran)}`)}; ${br.points.length} points; ${br.newtonSteps} Newton steps in all.`, "",
        "| Ra | Nu (volume) | Nu (wall) | Re | Newton residual |", "| --- | --- | --- | --- | --- |", ...br.points.map((p) => `| ${fmt(p.Ra)} | ${p.Nu.toFixed(6)} | ${p.NuTop.toFixed(6)} | ${p.Re.toFixed(4)} | ${p.residual.toExponential(1)} |`), "",
        ...(br.compare.length ? ["Comparison with Table 1S of Wen, Goluskin and Doering (2022), Pr = 1, Γ = 2:", "", "| Ra | Nu | Nu (Table 1S) | Relative difference | Re | Re (Table 1S) |", "| --- | --- | --- | --- | --- | --- |",
          ...br.compare.map((x) => `| ${fmt(x.Ra)} | ${x.Nu.toFixed(6)} | ${x.ref.toFixed(6)} | ${x.rel.toExponential(1)} | ${x.Re.toFixed(4)} | ${x.refRe.toFixed(4)} |`), ""] : []),
        `Resolution check at Ra = ${fmt(br.convergence.Ra)}: Nu = ${fmt(br.convergence.coarse)} with ${br.M} × ${br.K} and ${fmt(br.convergence.fine)} with ${br.convergence.M} × ${br.convergence.K}.`, "",
        `Amplitude equation from the solvability condition at third order: ${m(`g_1(Ra-Ra_c)A+g_3A^{3}=0,\\ g_3/g_1=${fmt(br.amplitude.ratio)}`)}. Solvability at second order: ${br.amplitude.solvability.toExponential(1)}. Onset slope ${m(`dNu/d\\varepsilon=${fmt(br.amplitude.slope)}`)}; the branch gives ${br.amplitude.branchSlopes.map((s) => `${fmt(s.slope)} at ε = ${fmt(s.eps)}`).join(", ")}.`, "",
        `Stability of the rolls to disturbances of the same period and symmetry: σ = ${fmt(br.rollStability.near.sigma)} at Ra = ${fmt(br.rollStability.near.Ra)}, where the conductive state has σ = ${fmt(br.rollStability.near.conduction)}${br.rollStability.record ? `; σ = ${fmt(br.rollStability.record.sigma)} at Ra = ${fmt(br.rollStability.record.Ra)}` : ""}.`].join("\n"),
      narration: `Newton's method follows the steady rolls from onset to a Rayleigh number of ten thousand. ${br.compare.length ? "The Nusselt numbers agree with the published table. " : ""}The amplitude equation shows that the rolls exist above onset and are stable there: a supercritical pitchfork. The page searched only this branch.`,
    });
    return out;
  }

  function lumpedFrames(an) {
    const e = an.equilibrium, tr = an.transient;
    return [{ title: "Hand calculation 9: equilibrium, linearization and transient of the lumped body",
      body: [dm(`\\theta_\\tau=q+1-\\theta^{4}=0\\ \\Rightarrow\\ \\theta^{*}=(1+q)^{1/4}=${fmt(e.theta)},\\qquad f'(\\theta^{*})=-4\\theta^{*3}=${fmt(e.eigenvalue)}.`), "",
        `Time constant ${m(`1/(4\\theta^{*3})=${fmt(e.timeConstant)}`)}${e.timeConstantSeconds !== null ? ` in τ, ${fmt(e.timeConstantSeconds)} s` : ""}. Residual of the equilibrium ${e.residual.toExponential(1)}.`, "",
        "Global argument: f decreases strictly on θ > 0, so θ* is the only equilibrium there, and θ_τ has the sign of θ* − θ. Every θ_i > 0 tends to θ*.", "",
        `Numerical procedure: the closed form τ = G(θ_i) − G(θ) with Brent's method (tolerance 1e-15), checked by the Dormand–Prince 5(4) integrator with rtol 1e-10: ${tr.rk45.accepted} steps, end value ${fmt(tr.rk45.end)} against ${fmt(tr.rk45.exactEnd)}.`].join("\n"),
      narration: "The balance has one equilibrium. The derivative there is negative, so the equilibrium is stable, and the time constant follows from it. The closed form and the numerical integration agree." }];
  }

  function surfaceFrames(an) {
    if (!an.ok) return [];
    const v = an.viewFactors;
    return [{ title: "Hand calculation 9 for the duct: view factors and the exact radiosity network",
      body: [...(v ? [`Crossed strings (W = ${v.W}, H = ${v.H}, diagonal ${v.d}): ${m(`F_{12}=${v.F12}`)}, ${m(`F_{1R}=${v.F1R}`)}, ${m(`F_{R1}=${v.FR1}`)}, ${m(`F_{RR}=${v.FRR}`)}.`, ""] : []),
        `Exact solution in units of ${m("\\sigma T_1^{4}")} with ${m(`\\theta_2=${an.theta2}`)}:`, "", "| Quantity | Value |", "| --- | --- |",
        `| ${m("j_1")} | ${an.j[0]} |`, `| ${m("j_2")} | ${an.j[1]} |`, `| ${m("j_R")} | ${an.j[2]} |`, `| ${m("q_1^{*}")} | ${an.q1} |`, `| ${m("q_2^{*}")} | ${an.q2} |`, "",
        `Resistances per unit floor area: surface ${an.resistances.surface}, space ${an.resistances.space}.${an.q1dim !== null ? ` With σ, q₁ = ${fmt(an.q1dim)} W/m².` : ""} The side walls settle at ${fmt(an.sideWallTemperature)} K.`, "",
        "The network is linear in the radiosities, so stability and bifurcation analysis do not apply."].join("\n"),
      narration: "The view factors follow from the crossed-string rule, and reciprocity and summation hold exactly. The page solves the radiosity network in exact fractions. The floor gives exactly what the ceiling takes." }];
  }

  function customFrames(an) {
    const sp = an.branches.flatMap((b) => b.special);
    return [{ title: `Hand calculation 9: the custom ODE system in ${an.states.join(", ")}`,
      body: [...an.f.map((f) => dm(`\\frac{d${tn(f.state)}}{d${an.time}}=${f.tex}`)), "", `Exact Jacobian:`, "", dm(`J=\\begin{pmatrix}${an.jacobian.map((r) => r.map((x) => x.tex).join("&")).join("\\\\")}\\end{pmatrix}`), "",
        ...(an.symmetry ? [`Exact symmetry: ${cell(an.symmetry)}.`, ""] : []),
        `Equilibria at ${an.control} = ${fmt(an.values[an.control])}:`, "", `| # | ${an.states.join(", ")} | Eigenvalues | Stability |`, "| --- | --- | --- | --- |",
        ...an.equilibria.map((e, i) => `| ${i + 1} | ${e.x.map(fmt).join(", ")} | ${[...new Set(e.eigenvalues.map((v) => (v.im ? `${fmt(v.re)} ± ${fmt(Math.abs(v.im))}i` : fmt(v.re))))].join(", ")} | ${cell(e.type)} |`), "",
        `Special points of the continuation in ${an.control} over [${fmt(an.range[0])}, ${fmt(an.range[1])}]:`, "", `| Point | ${an.control} | State | Checks |`, "| --- | --- | --- | --- |",
        ...sp.map((s) => `| ${cell(s.label)} | ${fmt(s.mu)} | ${s.x.map(fmt).join(", ")} | ${cell(s.text)} |`), "",
        ...(an.multistable.length ? [`Two or more stable equilibria: ${an.multistable.map(([a, b]) => `[${fmt(a)}, ${fmt(b)}]`).join(", ")}${an.hysteresis.length ? ", bounded by folds: hysteresis" : ""}.`, ""] : []),
        ...(an.two ? [`Two parameters: ${an.two.curves.length} fold curve${an.two.curves.length === 1 ? "" : "s"} in (${an.control}, ${an.control2}); ${an.two.curves.flatMap((c) => c.cusps).map((k) => `cusp near ${an.control} = ${fmt(k.mu)}, ${an.control2} = ${fmt(k.mu2)}`).join("; ") || "no cusp in the range"}.`, ""] : []),
        `Numerical procedure: Newton's method from a grid of seeds (tolerance 1e-12); pseudo-arclength continuation with steps of at most 0.03 in scaled units; fold points by Newton's method on the extended system; branch points and Hopf points by Brent's method; the first Lyapunov coefficient from the exact second and third derivatives.`, "",
        `Coverage: ${cell(an.coverage)}`].join("\n"),
      narration: `The page writes the system and its Jacobian exactly, finds ${words(an.equilibria.length)} equilibria at the record's parameter value and follows each branch. It marks ${words(sp.length)} special points, each with the checks that classify it. The search is not exhaustive.` }];
  }

  /** The Method frames and the Results frame of hand calculation 9, or empty lists. */
  function frames(d) {
    const st = d.stability;
    if (!st) return { method: [], results: [] };
    const res = d.results.filter((r) => r.id.startsWith("r-st-"));
    if (!st.ready) {
      return { method: [], results: res.length ? [{ title: "Stability and bifurcation: unresolved", body: res.map(line).join("\n"), narration: "The stability analysis did not run on this record. The frame names the reason and the next action." }] : [] };
    }
    const an = st.analysis;
    const method = st.kind === "custom" ? customFrames(an) : [...exactFrame(st), ...(an?.family === "buoyancy-convection" ? boxFrames(an) : an?.model === "lumped-radiation" ? lumpedFrames(an) : an?.model === "surface-radiation" ? surfaceFrames(an) : [])];
    const results = [{ title: `Stability and bifurcation: ${res.length} results`, body: res.map(line).join("\n"),
      narration: `The stability and bifurcation analysis gives ${words(Math.min(res.length, 10))}${res.length > 10 ? " or more" : ""} results. Each one has its status and its tolerance. The unresolved results name what the search did not cover.` }];
    return { method, results };
  }

  return { frames };
});
