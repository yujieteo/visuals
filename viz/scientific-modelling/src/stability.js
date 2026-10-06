/* Scientific Modelling: stability and bifurcation analysis (spec section 8, hand calculation item 9), piece 4. For a
 * record of a declared model of piece 4 it takes the family module's numerical analysis from the regime map
 * (src/convection.js, src/radiation.js) and adds the exact symbolic checks on the declared dimensionless model:
 * the base state satisfies every equation and condition, the perturbation equations are the O(ε) part of the
 * substitution, an exact symmetry of the equations, and the exact Jacobian of a lumped balance. For a custom finite
 * ODE system it runs src/ode.js. It returns the results with their statuses, the derivation steps of item 9 and the
 * search coverage, as plain data that the view, the Markdown report and the deck read.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./sym.js"), require("./declare.js"), require("./ode.js"));
  else (root.SM = root.SM || {}).ST = factory(root.SM.Q, root.SM.S, root.SM.D, root.SM.ODE);
})(typeof self !== "undefined" ? self : this, function (Q, S, D, ODE) {
  "use strict";

  const FAMILIES = ["buoyancy-convection", "radiation"];
  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(12)) : null);
  const short = (x) => (x === null || x === undefined || !Number.isFinite(x) ? "–" : Math.abs(x) >= 1e-3 && Math.abs(x) < 1e6 || x === 0 ? String(Number(x.toPrecision(6))) : x.toExponential(4));

  /** The derivation steps of hand calculation 9, each with its reason and evidence. */
  const STEPS = {
    "s-st-base": { item: 9, title: "Base state", reason: "A stability analysis starts from a steady state. The page substitutes the declared base state into every dimensionless equation and condition and checks that each residual is 0 exactly.", evidence: ["spec-8"] },
    "s-st-perturb": { item: 9, title: "Perturbation equations", reason: "The page substitutes the base state plus ε times a disturbance, expands, and keeps the part of order ε. The terms of order ε² are the nonlinear terms that the linear analysis drops.", evidence: ["spec-8"] },
    "s-st-eigen": { item: 9, title: "Eigenvalue problem", reason: "Normal modes exp(σt + iaX) turn the perturbation equations into an eigenvalue problem for the growth rate σ. The neutral condition is Re σ = 0.", evidence: ["spec-8"] },
    "s-st-branch": { item: 9, title: "Branch continuation", reason: "Newton's method solves the steady nonlinear equations on the branch, and continuation follows the branch in the control parameter. The page reports the branches it found and the coverage of the search.", evidence: ["spec-8", "farrell-2016"] },
    "s-st-amplitude": { item: 9, title: "Amplitude equation", reason: "The solvability condition at third order of the weakly nonlinear expansion gives the amplitude equation. The sign of its cubic coefficient classifies the pitchfork.", evidence: ["spec-8"] },
    "s-st-equilibrium": { item: 9, title: "Equilibrium", reason: "The equilibrium is the root of the balance with the time derivative set to 0.", evidence: ["spec-8"] },
    "s-st-jacobian": { item: 9, title: "Linearization", reason: "The derivative of the right side at the equilibrium is the eigenvalue of the linearized model. A negative value means linear stability.", evidence: ["spec-8"] },
    "s-st-network": { item: 9, title: "Radiation network", reason: "The radiosity balance of each surface is linear in the radiosities. The page solves it exactly in rationals and checks reciprocity, summation and the energy balance.", evidence: ["lienhard-2024"] },
    "s-st-ode": { item: 9, title: "Equilibria and continuation of the ODE system", reason: "Newton's method from a grid of seeds finds equilibria; the eigenvalues of the exact Jacobian classify them; pseudo-arclength continuation follows each branch and marks folds, branch points and Hopf points.", evidence: ["spec-8", "farrell-2016"] },
  };

  /* ---------- exact symbolic checks on a declared dimensionless model ---------- */

  /** The names of the declared dimensionless model: fields and coordinates by the kinds of their roles. */
  function names(decl) {
    const roles = Object.fromEntries(decl.model.roles.map((r) => [r.id, r]));
    const fields = new Set(), coords = new Set();
    for (const v of decl.model.dimensionless.variables) (roles[v.of]?.kind === "coordinate" ? coords : fields).add(v.symbol);
    return { fields, coords };
  }
  const ctxOf = (fields, coords) => ({ isField: (n) => fields.has(n), isCoordinate: (n) => coords.has(n), depends: () => true, isVar: (n) => fields.has(n) || coords.has(n) });
  const relation = (text, ctx) => { const [l, r] = String(text).split(/\s=\s/); return S.sub(S.read(l, ctx), S.read(r, ctx)); };
  /** Substitute fields: `field -> expression` (an expression of coordinates and parameters) and its derivatives. */
  function substituteFields(p, map, ctx) {
    return S.subst(p, {
      sym: (n) => map.get(n) ?? null,
      d: (f, vars) => { if (!map.has(f)) return null; let q = /** @type {any} */ (map.get(f)); for (const v of vars) q = S.diff(q, v, ctx); return q; },
    }, ctx);
  }
  /** The part of p of degree k in the symbol `eps`, divided by eps^k. */
  function degree(p, k) {
    let out = S.zero();
    for (const t of S.terms(p)) {
      const i = t.mono.findIndex(([a]) => a.t === "sym" && a.name === "eps");
      const e = i < 0 ? 0 : Q.toNumber(t.mono[i][1]);
      if (e === k) out = S.add(out, S.single(t.coef, t.mono.filter((_, j) => j !== i)));
    }
    return out;
  }

  /**
   * The exact checks of the declared stability set-up (data/catalogue.json model.stability): the base state in
   * every equation and condition, the perturbation equations, a reflection symmetry, and the Jacobian of a lumped
   * balance. Each check carries its canonical forms as TeX.
   */
  function exactChecks(decl) {
    const st = decl.model.stability;
    if (!st) return null;
    const { fields, coords } = names(decl);
    const ctx = ctxOf(fields, coords);
    const dl = decl.model.dimensionless;
    const out = { base: null, perturbation: [], symmetry: null, jacobian: null };
    try {
      if (st.base) {
        const relSub = st.relation ? (() => { const [l, r] = st.relation.split(/\s=\s/); return new Map([[l.trim(), S.read(r, ctx)]]); })() : new Map();
        const base = new Map(Object.entries(st.base).map(([f, t]) => [f, S.read(t, ctx)]));
        const eqs = dl.equations.map((e) => {
          const res = S.subst(substituteFields(relation(e.text, ctx), base, ctx), { sym: (n) => relSub.get(n) ?? null }, ctx);
          return { of: e.of, text: e.text, residual: S.plain(res) || "0", ok: res.size === 0 };
        });
        const conds = dl.conditions.filter((c) => !st.skipConditions?.includes(c.of)).map((c) => {
          const [atSym, atVal] = String(c.at).split(/\s=\s/);
          let res = substituteFields(relation(c.text, ctx), base, ctx);
          res = S.subst(res, { sym: (n) => (n === atSym.trim() ? S.read(atVal, ctx) : relSub.get(n) ?? null) }, ctx);
          return { of: c.of, text: c.text, at: c.at, residual: S.plain(res) || "0", ok: res.size === 0 };
        });
        out.base = { state: Object.entries(st.base).map(([f, t]) => ({ field: f, text: t, tex: S.tex(S.read(t, ctx)) })), relation: st.relation ?? null, equations: eqs, conditions: conds, ok: eqs.every((e) => e.ok) && conds.every((c) => c.ok) };
        // Perturbation: f = base + eps*f_p for each perturbed field.
        const pf = new Set([...fields, ...(st.perturb ?? []).map((f) => `${f}_p`)]);
        const pctx = ctxOf(pf, coords);
        const pert = new Map([...base].map(([f, b]) => [f, (st.perturb ?? []).includes(f) ? S.add(b, S.mul(S.symbol("eps"), S.symbol(`${f}_p`))) : b]));
        const subPert = (p) => S.subst(p, {
          sym: (n) => pert.get(n) ?? relSub.get(n) ?? null,
          d: (f, vars) => {
            if (!pert.has(f)) return null;
            let q = /** @type {any} */ (base.get(f));
            for (const v of vars) q = S.diff(q, v, pctx);
            return (st.perturb ?? []).includes(f) ? S.add(q, S.mul(S.symbol("eps"), S.derivative(`${f}_p`, vars))) : q;
          },
        }, pctx);
        out.perturbation = dl.equations.map((e) => {
          const full = subPert(relation(e.text, pctx));
          const lin = degree(full, 1), quad = degree(full, 2), zero = degree(full, 0);
          return { of: e.of, linear: S.tex(lin) || "0", linearPlain: S.plain(lin) || "0", nonlinear: S.tex(quad) || "0", zeroOrder: zero.size === 0 };
        });
      }
      if (st.symmetry) {
        const { coordinate, image, signs } = st.symmetry;
        const img = S.read(image, ctx);
        const flips = (vars) => vars.filter((v) => v === coordinate).length;
        const map = { sym: (n) => (n === coordinate ? img : fields.has(n) && signs[n] === -1 ? S.neg(S.symbol(n)) : null), d: (f, vars) => (fields.has(f) ? S.scale(S.derivative(f, vars), Q.q((signs[f] ?? 1) * (flips(vars) % 2 ? -1 : 1))) : null) };
        const eqs = dl.equations.map((e) => { const p = relation(e.text, ctx); const q = S.subst(p, map, ctx); return { of: e.of, ok: S.equal(q, p) || S.equal(q, S.neg(p)) }; });
        out.symmetry = { text: st.symmetry.text, equations: eqs, ok: eqs.every((e) => e.ok) };
      }
      if (st.jacobian) {
        const { field, rhs } = st.jacobian;
        const d = S.diff(S.read(rhs, ctx), field, S.PLAIN);
        out.jacobian = { field, rhs, rhsTex: S.tex(S.read(rhs, ctx)), derivative: S.plain(d), tex: S.tex(d), expected: st.jacobian.expected ?? null, ok: st.jacobian.expected ? S.equal(d, S.read(st.jacobian.expected, ctx)) : true };
      }
    } catch (e) {
      out.error = e instanceof Error ? e.message : String(e);
    }
    return out;
  }

  /* ---------- derive ---------- */

  const odeCache = new Map();
  /**
   * The stability and bifurcation analysis of the confirmed record. ctx: { interp, base, regime, data }.
   * Returns { ready: false, reason, message, next } or { ready: true, kind: "declared" | "custom", ... }.
   */
  function derive(state, data, ctx) {
    const { interp, base, regime } = ctx;
    if (!interp || !base) return { ready: false, reason: "unconfirmed", message: "The stability analysis runs on a confirmed interpretation.", next: "Confirm the interpretation." };
    const intended = base.purpose?.calculation ?? "";
    const wanted = intended === "stability" || intended === "bifurcation";
    const declId = base.purpose?.declaration ?? "";
    if (declId) {
      const decl = D.find(data, declId);
      if (!decl) return { ready: false, reason: "unknown-declaration", message: `The declared model "${String(declId).slice(0, 60)}" is not in the catalogue.`, next: "Choose a declared model of the catalogue." };
      const methods = { stability: decl.methods.stability, bifurcation: decl.methods.bifurcation };
      if (!FAMILIES.includes(decl.family)) {
        return { ready: false, reason: "not-applicable", declaration: { id: decl.id, title: decl.title, family: decl.family }, methods,
          message: `For ${decl.title}, stability analysis does not apply: ${decl.methods.stability.reason} Bifurcation analysis: ${decl.methods.bifurcation.reason}`, next: "" };
      }
      if (!regime || !regime.ready) return { ready: false, reason: "regime", declaration: { id: decl.id, title: decl.title, family: decl.family }, methods, message: regime?.message ?? "The regime map did not run.", next: regime?.next ?? "" };
      const analysis = regime.stability ?? null;
      return { ready: true, kind: "declared", wanted, declaration: { id: decl.id, title: decl.title, family: decl.family, summary: decl.model.summary }, methods, exact: exactChecks(decl), analysis,
        steps: stepsFor(decl.id), inputs: regime.inputs };
    }
    if (interp.model.type === "ODE" && wanted) {
      const key = JSON.stringify([interp.equations.map((e) => [e.id, e.kind, e.plain]), interp.variables.map((v) => [v.symbol, v.kind, v.value?.text ?? null]), base.purpose?.analysis ?? null]);
      if (!odeCache.has(key)) { if (odeCache.size > 30) odeCache.clear(); odeCache.set(key, ODE.analyse(interp, base.purpose?.analysis ?? {})); }
      const an = odeCache.get(key);
      if (!an.ok) return { ready: false, reason: "custom-unsupported", message: `Custom ODE system: ${an.reason}`, next: an.next ?? "" };
      return { ready: true, kind: "custom", wanted, analysis: an, steps: ["s-st-ode"], inputs: ["purpose", ...interp.equations.map((e) => e.id), ...interp.variables.map((v) => v.id)] };
    }
    if (wanted) return { ready: false, reason: "custom-pde", message: "The record names no declared model, and it is not a finite ODE system. Stability and bifurcation of a custom PDE are outside the supported set.", next: "Choose a declared model of piece 4, such as boussinesq-box, or write the model as a finite ODE system." };
    return { ready: false, reason: "none", message: "The record does not ask for a stability or bifurcation analysis, and its declared model has none.", next: "" };
  }
  const stepsFor = (id) => (id === "boussinesq-box" ? ["s-st-base", "s-st-perturb", "s-st-eigen", "s-st-branch", "s-st-amplitude"] : id === "surface-radiation" ? ["s-st-network"] : id === "convection-radiation" ? ["s-st-equilibrium", "s-st-jacobian"] : ["s-st-base", "s-st-perturb", "s-st-equilibrium", "s-st-jacobian"]);

  /* ---------- results ---------- */

  /** The results of the analysis, each with its status, inputs, steps and evidence. */
  function results(st) {
    if (!st) return [];
    if (!st.ready) {
      if (st.reason === "not-applicable" || st.reason === "none" || st.reason === "unconfirmed") return [];
      return [{ id: "r-st-unresolved", kind: "stability", title: `Stability and bifurcation: ${st.message}`, status: "unresolved", inputs: ["purpose"], steps: [], evidence: ["spec-8"], next: st.next }];
    }
    const out = [];
    const inputs = st.inputs ?? [];
    const add = (r) => out.push({ inputs, evidence: [], steps: [], ...r });
    if (st.kind === "custom") { customResults(st.analysis, add); return out; }
    const ex = st.exact;
    if (ex?.base) add({ id: "r-st-base", kind: "stability", title: `The base state ${ex.base.state.map((b) => `${b.field} = ${b.text}`).join(", ")} satisfies ${ex.base.equations.length} equation${ex.base.equations.length > 1 ? "s" : ""} and ${ex.base.conditions.length} condition${ex.base.conditions.length === 1 ? "" : "s"} exactly${ex.base.ok ? "" : ": NOT for every item"}.`, status: ex.base.ok ? "exact" : "unresolved", steps: ["s-st-base"], evidence: ["spec-8"] });
    if (ex?.perturbation?.length) add({ id: "r-st-perturb", kind: "stability", title: `The perturbation equations are the order-ε part of the substitution: ${ex.perturbation.length} linear equation${ex.perturbation.length > 1 ? "s" : ""}, and the order-1 part is 0.`, status: ex.perturbation.every((p) => p.zeroOrder) ? "exact" : "unresolved", steps: ["s-st-perturb"], evidence: ["spec-8"] });
    if (ex?.symmetry) add({ id: "r-st-symmetry", kind: "bifurcation", title: `The equations are invariant under ${ex.symmetry.text}.`, status: ex.symmetry.ok ? "exact" : "unresolved", steps: ["s-st-amplitude"], evidence: ["spec-8"] });
    if (ex?.jacobian) add({ id: "r-st-jacobian", kind: "stability", title: `∂f/∂${ex.jacobian.field} = ${ex.jacobian.derivative} exactly.`, status: ex.jacobian.ok ? "exact" : "unresolved", steps: ["s-st-jacobian"], evidence: ["spec-8"] });
    if (ex?.error) add({ id: "r-st-exact-error", kind: "stability", title: `The exact checks cannot run: ${ex.error}`, status: "unresolved", next: "Check the declared stability set-up." });
    const an = st.analysis;
    if (!an) return out;
    if (an.family === "buoyancy-convection") boxResults(an, add);
    else if (an.model === "lumped-radiation") lumpedResults(an, add);
    else if (an.model === "surface-radiation") for (const c of an.checks ?? []) add({ id: `r-st-net-${c.id}`, kind: "exchange", title: `${c.title}: ${c.passed ? "passed" : "failed"}. ${c.detail}`, status: c.passed ? c.status : "unresolved", tolerance: c.tolerance ?? null, steps: ["s-st-network"], evidence: ["lienhard-2024"] });
    else if (an.model === "convection-radiation") add({ id: "r-st-root", kind: "stability", title: `The balance has one root θ = ${short(an.root.theta)}: dQ/dθ = 1 + 4N_rθ³ = ${short(an.root.slope)} > 0. The linearized model gives ${short(an.root.linear)}, the mean-temperature model ${short(an.root.mean)}.`, status: "numerical", tolerance: "1e-15 (Brent)", steps: ["s-st-equilibrium"], evidence: ["lienhard-2024"] });
    return out;
  }

  function boxResults(an, add) {
    const b = an.box;
    add({ id: "r-st-onset", kind: "stability", title: `Onset in the box: Ra_c(Γ = ${short(an.point.Gamma)}) = ${short(b.Ra)}, mode n = ${b.n} (a = ${short(b.a)}). At Ra = ${short(an.point.Ra)} the conductive state is linearly ${an.lead.re > 0 ? "unstable" : "stable"}: σ₁ = ${short(an.lead.re)} (linear temporal stability to two-dimensional normal modes).`,
      status: "numerical", tolerance: "1e-8 residual", steps: ["s-st-eigen"], evidence: ["spec-8"] });
    const c = an.critical;
    add({ id: "r-st-critical", kind: "stability", title: `Unbounded layer: Ra_c = ${short(c.at(-1).Ra)} at a_c = ${c.at(-1).a.toFixed(4)}, the same to 1e-9 with ${c.map((x) => x.K).join(", ")} nodes.`, status: "numerical", tolerance: "1e-9 relative", steps: ["s-st-eigen"], evidence: ["wgd-2022"] });
    add({ id: "r-st-transversal", kind: "bifurcation", title: `At onset the eigenvalue 0 is simple (σ₂ = ${short(an.transversality.second)}) and crosses with dσ/dRa = ${short(an.transversality.dsigma)} ≠ 0.`, status: "numerical", tolerance: "central difference, ΔRa = 10⁻³Ra_c", steps: ["s-st-eigen"], evidence: ["spec-8"] });
    const br = an.branch;
    if (!br || !br.ok) { add({ id: "r-st-branch", kind: "bifurcation", title: `The roll branch did not compute: ${br?.reason ?? "no result"}`, status: "unresolved", steps: ["s-st-branch"], next: "Check the resolution or the parameter values." }); return; }
    add({ id: "r-st-branch", kind: "bifurcation", title: `Roll branch of mode ${b.n}: ${br.points.length} points from Ra = ${short(br.points[0].Ra)} to ${short(br.points.at(-1).Ra)}, Newton residual ≤ ${Math.max(...br.points.map((p) => p.residual)).toExponential(1)}.${br.record ? ` At the record's Ra = ${short(br.record.Ra)}: Nu = ${short(br.record.Nu)}.` : ""}`,
      status: "numerical", tolerance: "1e-11 (row-scaled residual)", steps: ["s-st-branch"], evidence: ["spec-8"] });
    if (br.compare.length) {
      const worst = Math.max(...br.compare.map((x) => x.rel));
      add({ id: "r-st-wgd", kind: "bifurcation", title: `Nu agrees with Wen, Goluskin and Doering (2022, Table 1S) at ${br.compare.length} values of Ra within ${worst.toExponential(1)} relative.`, status: worst <= 1e-4 ? "evidence" : "unresolved", tolerance: "1e-4 relative", steps: ["s-st-branch"], evidence: ["wgd-2022"] });
      const reOff = br.compare.filter((x) => x.relRe > 1e-4);
      if (reOff.length) add({ id: "r-st-wgd-re", kind: "bifurcation", title: `Re differs from Table 1S by more than 1e-4 at Ra = ${reOff.map((x) => short(x.Ra)).join(", ")} (${reOff.map((x) => `${(100 * x.relRe).toFixed(2)} %`).join(", ")}), while Nu agrees there and Re agrees at the other ${br.compare.length - reOff.length} values. The cause is not resolved.`,
        status: "unresolved", steps: ["s-st-branch"], evidence: ["wgd-2022"], next: "Compare with the authors' data files, or with a third computation." });
    }
    add({ id: "r-st-convergence", kind: "bifurcation", title: `Resolution check at Ra = ${short(br.convergence.Ra)}: Nu = ${short(br.convergence.coarse)} with ${br.M} × ${br.K} and ${short(br.convergence.fine)} with ${br.convergence.M} × ${br.convergence.K}.`, status: br.convergence.rel <= 1e-5 ? "numerical" : "unresolved", tolerance: "1e-5 relative", steps: ["s-st-branch"], evidence: ["spec-14"] });
    const am = br.amplitude;
    add({ id: "r-st-amplitude", kind: "bifurcation", title: `Amplitude equation: g₃/g₁ = ${short(am.ratio)} ${am.supercritical ? "< 0, so rolls exist above onset" : "> 0, so rolls exist below onset"}. Onset slope dNu/dε = ${short(am.slope)}; the branch gives ${am.branchSlopes.map((s) => short(s.slope)).join(", ")} at ε = ${am.branchSlopes.map((s) => short(s.eps)).join(", ")}.`,
      status: "numerical", tolerance: "solvability residual ≤ 1e-12", steps: ["s-st-amplitude"], evidence: ["spec-8"] });
    const rs = br.rollStability;
    add({ id: "r-st-classify", kind: "bifurcation", title: `Classification: ${am.supercritical && rs.near.sigma < 0 ? "supercritical pitchfork" : "not classified"}. Checked: the mirror symmetry (exact), a simple zero eigenvalue with nonzero crossing speed, g₃/g₁ < 0, and stable rolls near onset (σ = ${short(rs.near.sigma)} ≈ −2σ_cond = ${short(-2 * rs.near.conduction)}).`,
      status: am.supercritical && rs.near.sigma < 0 ? "numerical" : "unresolved", steps: ["s-st-amplitude", "s-st-branch"], evidence: ["spec-8", "wgd-2022"] });
    if (rs.record) add({ id: "r-st-rolls", kind: "stability", title: `At Ra = ${short(rs.record.Ra)} the rolls are linearly ${rs.record.stable ? "stable" : "unstable"} (σ = ${short(rs.record.sigma)}) to disturbances of the same period and mirror symmetry. This is not a statement about three-dimensional or asymmetric disturbances.`,
      status: "numerical", steps: ["s-st-branch"], evidence: ["spec-8"] });
    add({ id: "r-st-coverage", kind: "bifurcation", title: "Not searched: three-dimensional states, other periods, asymmetric rolls and secondary bifurcations. The calculation found one roll branch; it makes no claim of exhaustive branch discovery.", status: "unresolved", steps: ["s-st-branch"], evidence: ["farrell-2016"], next: "A separate search, such as deflated continuation, is needed for other branches." });
  }

  function lumpedResults(an, add) {
    const e = an.equilibrium;
    add({ id: "r-st-equilibrium", kind: "stability", title: `Equilibrium θ* = (1 + q)^{1/4} = ${short(e.theta)} (residual ${e.residual.toExponential(1)}); eigenvalue f′(θ*) = −4θ*³ = ${short(e.eigenvalue)} < 0: linearly stable, with the time constant ${short(e.timeConstant)} in τ${e.timeConstantSeconds !== null ? ` (${short(e.timeConstantSeconds)} s)` : ""}.`,
      status: "numerical", tolerance: "1e-12", steps: ["s-st-equilibrium", "s-st-jacobian"], evidence: ["spec-8"] });
    add({ id: "r-st-global", kind: "stability", title: "f(θ) = q + 1 − θ⁴ decreases strictly for θ > 0, so θ* is the only equilibrium and every θ_i > 0 tends to it. No branch can split: bifurcation analysis does not apply.", status: "exact", steps: ["s-st-jacobian"], evidence: ["spec-8"] });
    const r = an.transient.rk45;
    add({ id: "r-st-transient", kind: "stability", title: `The Dormand–Prince integration (${r.accepted} steps) ends at θ = ${short(r.end)}; the closed form gives ${short(r.exactEnd)}.`, status: Math.abs(r.end - r.exactEnd) <= 1e-8 ? "numerical" : "unresolved", tolerance: "1e-8", steps: ["s-st-equilibrium"], evidence: ["spec-8"] });
  }

  function customResults(an, add) {
    add({ id: "r-st-ode-system", kind: "stability", title: `Custom ODE system in ${an.states.join(", ")} with the control parameter ${an.control}: the right sides and the Jacobian are exact canonical forms.`, status: "exact", steps: ["s-st-ode"], evidence: ["spec-8"] });
    if (an.symmetry) add({ id: "r-st-ode-symmetry", kind: "bifurcation", title: `The system is equivariant under ${an.symmetry}: f(Sx) = S f(x) exactly.`, status: "exact", steps: ["s-st-ode"], evidence: ["spec-8"] });
    an.equilibria.forEach((e, i) => add({ id: `r-st-ode-eq-${i + 1}`, kind: "stability", title: `Equilibrium ${i + 1} at ${an.control} = ${short(an.values[an.control])}: (${e.x.map(short).join(", ")}), ${e.text}. Eigenvalues ${e.eigenvalues.map((v) => (v.im ? `${short(v.re)} ± ${short(Math.abs(v.im))}i` : short(v.re))).filter((t, k, a) => a.indexOf(t) === k).join(", ")}.`,
      status: "numerical", tolerance: `residual ${e.residual.toExponential(1)}`, steps: ["s-st-ode"], evidence: ["spec-8"] }));
    const sp = an.branches.flatMap((b) => b.special.map((s) => ({ ...s, branch: b.id })));
    sp.forEach((s, i) => add({ id: `r-st-ode-sp-${i + 1}`, kind: "bifurcation", title: `${s.label} at ${an.control} = ${short(s.mu)}, (${s.x.map(short).join(", ")}). ${s.text}`, status: s.classified ? "numerical" : "unresolved", tolerance: s.kind === "hopf" ? "Brent 1e-14 on Re λ" : "Newton 1e-12", steps: ["s-st-ode"], evidence: ["spec-8"],
      next: s.classified ? "" : "Supply the normal form or a symmetry, or refine the continuation near the point." }));
    for (const [a, b] of an.multistable) add({ id: `r-st-ode-multi-${a}`, kind: "bifurcation", title: `Two or more stable equilibria coexist for ${an.control} in [${short(a)}, ${short(b)}]${an.hysteresis.some((h) => h[0] === a && h[1] === b) ? ", bounded by two folds: hysteresis" : ""}.`, status: "numerical", steps: ["s-st-ode"], evidence: ["spec-8"] });
    if (an.two) for (const c of an.two.curves) for (const k of c.cusps) add({ id: `r-st-ode-cusp-${c.id}`, kind: "bifurcation", title: `The fold curves meet at a cusp near ${an.control} = ${short(k.mu)}, ${an.control2} = ${short(k.mu2)}: the coefficient a of the fold changes sign there.`, status: "numerical", tolerance: "linear interpolation between continuation steps", steps: ["s-st-ode"], evidence: ["spec-8"] });
    add({ id: "r-st-ode-coverage", kind: "bifurcation", title: an.coverage, status: "unresolved", steps: ["s-st-ode"], evidence: ["farrell-2016"], next: "Widen the box or the seeds, or add a completeness argument, before you claim that no other branch exists." });
  }

  return { FAMILIES, STEPS, exactChecks, derive, results, num };
});
