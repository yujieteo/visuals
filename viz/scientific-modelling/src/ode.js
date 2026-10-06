/* Scientific Modelling: stability and continuation of custom finite ODE systems (piece 4). A record whose governing
 * equations are first-order in one time coordinate, each linear in the time derivative of one field, is a system
 * x' = f(x; p). The engine writes f, its Jacobian and the higher derivatives exactly (src/sym.js), and evaluates them
 * in floating point. It finds equilibria from a grid of seeds, classifies each by the eigenvalues of the Jacobian,
 * follows each branch in a control parameter by pseudo-arclength continuation, and marks folds (tangent turns in the
 * parameter), branch points (the augmented determinant changes sign) and Hopf points (a complex pair crosses the
 * imaginary axis). A fold is classified only when its two normal-form coefficients are nonzero; a branch point is a
 * pitchfork only when an exact symmetry of f fixes the equilibrium and reverses the null vector; a Hopf point is
 * supercritical or subcritical only from a nonzero first Lyapunov coefficient. With a second control parameter the
 * engine continues the folds in two parameters, finds the cusp and counts the stable equilibria on a grid. The search
 * is never claimed to be exhaustive: the result states the seeds, the ranges and the step limits.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./expr.js"), require("./sym.js"), require("./special.js"), require("./numerics.js"));
  else (root.SM = root.SM || {}).ODE = factory(root.SM.Q, root.SM.E, root.SM.S, root.SM.SF, root.SM.NUM);
})(typeof self !== "undefined" ? self : this, function (Q, E, S, SF, N) {
  "use strict";

  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(12)) : null);
  const FN = { exp: Math.exp, log: Math.log, log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, abs: Math.abs, erf: (x) => SF.erf(x), erfc: (x) => SF.erfc(x) };

  /* ---------- numerical evaluation of canonical forms ---------- */

  /** A function of a values object from a canonical expression. */
  function compile(p) {
    const terms = S.terms(p).map((t) => ({ c: Q.toNumber(t.coef), f: t.mono.map(([a, e]) => [atomFn(a), Q.toNumber(e)]) }));
    return (v) => {
      let s = 0;
      for (const t of terms) { let x = t.c; for (const [g, e] of t.f) x *= e === 1 ? g(v) : g(v) ** e; s += x; }
      return s;
    };
  }
  function atomFn(a) {
    if (a.t === "sym") return (v) => (a.name in v ? v[a.name] : NaN);
    if (a.t === "num") { const x = Q.toNumber(a.v); return () => x; }
    if (a.t === "sum") return compile(a.base);
    if (a.t === "fn") { const g = compile(a.arg), F = FN[a.name]; return (v) => F(g(v)); }
    return () => NaN;
  }

  /* ---------- the system from a record ---------- */

  /**
   * The ODE system of a confirmed interpretation: { ok, states, params, time, f (canonical forms), values } or
   * { ok: false, reason, next }.
   */
  function system(interp) {
    const fail = (reason, next) => ({ ok: false, reason, next });
    if (interp.model.type !== "ODE") return fail(`The model is ${interp.model.type === "PDE" ? "a PDE" : interp.model.type === "algebraic" ? "algebraic" : "a variable list"}, not a finite ODE system.`, "Write the model as first-order ODEs in time, such as d(x,t) = f(x).");
    const vars = interp.variables;
    const fields = new Set(vars.filter((v) => v.kind === "field").map((v) => v.symbol));
    const coords = new Set(vars.filter((v) => v.kind === "coordinate").map((v) => v.symbol));
    const ctx = { isField: (n) => fields.has(n), isCoordinate: (n) => coords.has(n), depends: () => true, isVar: (n) => fields.has(n) || coords.has(n) };
    const governing = interp.equations.filter((e) => e.kind === "governing" && e.ast && e.ast.k === "rel" && e.ast.op === "=");
    if (!governing.length) return fail("The model has no governing equation.", "Add the equations d(x,t) = f(x).");
    // Laws of other fields (y = g(x)) are substituted into f.
    const laws = new Map();
    for (const e of interp.equations) {
      if (!["constitutive", "closure", "definition"].includes(e.kind) || !e.ast || e.ast.k !== "rel" || e.ast.l.k !== "sym" || !fields.has(e.ast.l.name) || E.derivatives(e.ast.r).length) continue;
      try { laws.set(e.ast.l.name, S.fromAst(e.ast.r, ctx)); } catch { /* a law outside the engine is not used */ }
    }
    const states = [], f = [];
    let time = null;
    try {
      for (const e of governing) {
        const F = S.sub(S.fromAst(e.ast.l, ctx), S.fromAst(e.ast.r, ctx));
        const ds = new Map();
        for (const t of S.terms(F)) for (const [a] of t.mono) if (a.t === "d") ds.set(a.key, a);
        if (ds.size !== 1) return fail(`Equation ${e.id} must hold exactly one time derivative; it holds ${ds.size}.`, "Write one equation d(x,t) = f(x) for each state variable.");
        const atom = [...ds.values()][0];
        if (atom.vars.length !== 1) return fail(`Equation ${e.id}: the derivative of ${atom.f} is of order ${atom.vars.length}. The engine needs first-order equations.`, "Write a second-order equation as two first-order equations, such as d(x,t) = v and d(v,t) = ...");
        if (time && atom.vars[0] !== time) return fail("The equations use two different time coordinates.", "Use one time coordinate.");
        time = atom.vars[0];
        if (states.includes(atom.f)) return fail(`Two equations give the time derivative of ${atom.f}.`, "Keep one equation for each state variable.");
        let c = S.zero(), g = S.zero();
        for (const t of S.terms(F)) {
          const k = t.mono.findIndex(([a]) => a.key === atom.key);
          if (k < 0) { g = S.add(g, S.single(t.coef, t.mono)); continue; }
          if (!Q.eq(t.mono[k][1], Q.ONE)) return fail(`Equation ${e.id} is not linear in d(${atom.f},${time}).`, "Write the equation as a d(x,t) = f(x) form.");
          c = S.add(c, S.single(t.coef, t.mono.filter((_, j) => j !== k)));
        }
        if (c.size === 0) return fail(`Equation ${e.id}: the coefficient of d(${atom.f},${time}) is 0.`, "Check the equation.");
        states.push(atom.f);
        f.push(S.mul(S.neg(g), S.pow(c, Q.q(-1), ctx)));
      }
      // Substitute the laws, so f holds only states and parameters.
      for (let i = 0; i < f.length; i++) for (let k = 0; k < 4; k++) f[i] = S.subst(f[i], { sym: (n) => (laws.has(n) && !states.includes(n) ? laws.get(n) : null) }, ctx);
    } catch (err) {
      return fail(`The engine cannot write the system: ${err instanceof Error ? err.message : String(err)}.`, "Write each right side as a sum of products of states, parameters and known functions.");
    }
    const names = new Set(f.flatMap((p) => [...S.names(p)]));
    const extraFields = [...names].filter((n) => fields.has(n) && !states.includes(n));
    if (extraFields.length) return fail(`No equation gives the field${extraFields.length > 1 ? "s" : ""} ${extraFields.join(", ")}.`, "Add an equation or a law for each field.");
    const params = [...names].filter((n) => !states.includes(n) && n !== time).sort();
    const values = {}, ranges = {}, missing = [];
    for (const v of vars) {
      if (!v.value) continue;
      const lo = Q.toNumber(v.value.lo), hi = Q.toNumber(v.value.hi);
      if (v.value.exact && Q.eq(v.value.lo, v.value.hi)) values[v.symbol] = lo;
      else if (!v.value.exact && Number.isFinite(v.value.float)) values[v.symbol] = v.value.float;
      else ranges[v.symbol] = [lo, hi];
    }
    for (const p of params) if (!(p in values)) missing.push(p);
    return { ok: true, states, params, time, f, values, ranges, missing, ids: Object.fromEntries(vars.map((v) => [v.symbol, v.id])), ctx };
  }

  /* ---------- the numerical model of a system ---------- */

  /** Compiled f, Jacobian, parameter derivatives and (lazily) the second and third derivative tensors. */
  function model(sys) {
    const n = sys.states.length;
    const fx = sys.f.map(compile);
    const Jp = sys.f.map((fi) => sys.states.map((x) => S.diff(fi, x)));
    const Jx = Jp.map((row) => row.map(compile));
    const dmu = new Map(), d2 = new Map(), d3 = new Map(), dJmu = new Map();
    const at = (x, p) => { const v = { ...p }; sys.states.forEach((s, i) => { v[s] = x[i]; }); return v; };
    const F = (x, p) => { const v = at(x, p); return Float64Array.from(fx, (g) => g(v)); };
    const J = (x, p) => { const v = at(x, p); return Jx.map((row) => Float64Array.from(row, (g) => g(v))); };
    const Fmu = (x, p, mu) => {
      if (!dmu.has(mu)) dmu.set(mu, sys.f.map((fi) => compile(S.diff(fi, mu))));
      const v = at(x, p);
      return Float64Array.from(dmu.get(mu), (g) => g(v));
    };
    const Jmu = (x, p, mu) => {
      if (!dJmu.has(mu)) dJmu.set(mu, Jp.map((row) => row.map((q) => compile(S.diff(q, mu)))));
      const v = at(x, p);
      return dJmu.get(mu).map((row) => Float64Array.from(row, (g) => g(v)));
    };
    /** H[i][j][k] = ∂²f_i/∂x_j∂x_k. */
    const H = (x, p) => {
      if (!d2.size) Jp.forEach((row, i) => row.forEach((q, j) => sys.states.forEach((s, k) => d2.set(`${i},${j},${k}`, compile(S.diff(q, s))))));
      const v = at(x, p);
      return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Float64Array.from({ length: n }, (_, k) => d2.get(`${i},${j},${k}`)(v))));
    };
    /** T[i][j][k][l] = ∂³f_i/∂x_j∂x_k∂x_l. */
    const T3 = (x, p) => {
      if (!d3.size) Jp.forEach((row, i) => row.forEach((q, j) => sys.states.forEach((s, k) => { const qk = S.diff(q, s); sys.states.forEach((r, l) => d3.set(`${i},${j},${k},${l}`, compile(S.diff(qk, r)))); })));
      const v = at(x, p);
      return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, k) => Float64Array.from({ length: n }, (_, l) => d3.get(`${i},${j},${k},${l}`)(v)))));
    };
    return { n, F, J, Fmu, Jmu, H, T3, Jp };
  }

  /* ---------- equilibria and their stability ---------- */

  /** Classify an equilibrium by its eigenvalues. */
  function classify(ev) {
    const scale = Math.max(1, ...ev.map((e) => Math.hypot(e.re, e.im)));
    const tol = 1e-9 * scale;
    const pos = ev.filter((e) => e.re > tol).length, neg = ev.filter((e) => e.re < -tol).length, zero = ev.length - pos - neg;
    const complex = ev.some((e) => Math.abs(e.im) > tol);
    if (zero) return { stable: false, type: "non-hyperbolic", text: "non-hyperbolic: an eigenvalue has zero real part, so the linearization does not decide stability" };
    if (!pos) return { stable: true, type: complex ? "stable focus" : "stable node", text: `linearly stable (${complex ? "focus" : "node"})` };
    if (!neg) return { stable: false, type: complex ? "unstable focus" : "unstable node", text: `linearly unstable (${complex ? "focus" : "node"})` };
    return { stable: false, type: "saddle", text: `linearly unstable (saddle: ${pos} unstable and ${neg} stable directions)` };
  }

  /**
   * Equilibria at fixed parameters. In one dimension every sign change of f on 2001 points of the box, refined by
   * Brent's method; in more dimensions Newton's method from a grid of seeds in the box.
   */
  function equilibria(M, sys, p, box, perDim) {
    const n = M.n;
    if (n === 1) return equilibria1(M, p, box[0]);
    const grid = sys.states.map((s, i) => { const [a, b] = box[i]; const m = perDim; return Array.from({ length: m }, (_, k) => a + ((b - a) * (k + 0.5)) / m); });
    const seeds = [];
    const rec = (i, cur) => { if (i === n) { seeds.push(cur.slice()); return; } for (const g of grid[i]) { cur[i] = g; rec(i + 1, cur); } };
    rec(0, new Array(n).fill(0));
    const found = [];
    const span = box.map(([a, b]) => Math.max(Math.abs(b - a), 1e-12));
    for (const s0 of seeds) {
      const r = N.newton((x) => M.F(x, p), (x) => M.J(x, p), s0, { tol: 1e-12, maxIter: 40, stepTol: 1e-13 });
      if (!r.converged || !Array.from(r.x).every(Number.isFinite)) continue;
      const x = Array.from(r.x);
      const inside = x.every((v, i) => v >= box[i][0] - 0.05 * span[i] && v <= box[i][1] + 0.05 * span[i]);
      if (!inside) continue;
      if (found.some((y) => y.x.every((v, i) => Math.abs(v - x[i]) <= 1e-7 * (1 + Math.abs(v))))) continue;
      const ev = N.eig(M.J(x, p)) ?? [];
      found.push({ x, residual: N.normInf(M.F(x, p)), eigenvalues: ev, ...classify(ev) });
    }
    found.sort((a, b) => a.x[0] - b.x[0]);
    return { list: found, seeds: seeds.length };
  }

  function equilibria1(M, p, [a, b]) {
    const f = (x) => M.F([x], p)[0];
    const xs = Array.from({ length: 2001 }, (_, i) => a + ((b - a) * i) / 2000);
    const found = [];
    let fa = f(xs[0]);
    for (let i = 1; i < xs.length; i++) {
      const fb = f(xs[i]);
      const end = i === xs.length - 1 && fb === 0;
      if (Number.isFinite(fa) && Number.isFinite(fb) && (fa === 0 || end || fa * fb < 0)) {
        const x = fa === 0 ? xs[i - 1] : end ? xs[i] : SF.brent(f, xs[i - 1], xs[i], 1e-15);
        if (x !== null && !found.some((e) => Math.abs(e.x[0] - x) <= 1e-9 * (1 + Math.abs(x)))) {
          const ev = N.eig(M.J([x], p)) ?? [];
          found.push({ x: [x], residual: Math.abs(f(x)), eigenvalues: ev, ...classify(ev) });
        }
      }
      fa = fb;
    }
    return { list: found, seeds: xs.length };
  }

  /* ---------- continuation in one parameter ---------- */

  /**
   * Follow the branches through the equilibria at the record's value of `mu` over [lo, hi]. Each branch has its
   * points (μ, x, stability) and its special points: folds, branch points and Hopf points with their checks.
   */
  function branches(M, sys, p, mu, range, box, eqs) {
    const n = M.n;
    const [lo, hi] = range;
    const sx = box.map(([a, b]) => Math.max(Math.abs(b - a), 1e-9)), smu = hi - lo;
    const toY = (x, m) => Float64Array.from([...x.map((v, i) => v / sx[i]), (m - lo) / smu]);
    const fromY = (y) => ({ x: Array.from(y.subarray(0, n), (v, i) => v * sx[i]), m: lo + y[n] * smu });
    const Fy = (y) => { const { x, m } = fromY(y); return M.F(x, { ...p, [mu]: m }); };
    const Jy = (y) => {
      const { x, m } = fromY(y);
      const q = { ...p, [mu]: m };
      const J = M.J(x, q), Fm = M.Fmu(x, q, mu);
      return J.map((row, i) => { const r = new Float64Array(n + 1); for (let j = 0; j < n; j++) r[j] = row[j] * sx[j]; r[n] = Fm[i] * smu; return r; });
    };
    const out = [];
    const onBranch = (x, b) => b.points.some((pt, k) => k > 0 && segDist(b.points[k - 1], pt, x, p[mu]) < 2e-3);
    const segDist = (a, b, x, m) => {
      const ya = toY(a.x, a.mu), yb = toY(b.x, b.mu), yx = toY(x, m);
      const d = yb.map((v, i) => v - ya[i]);
      const L = d.reduce((s, v) => s + v * v, 0) || 1e-30;
      const t = Math.max(0, Math.min(1, d.reduce((s, v, i) => s + v * (yx[i] - ya[i]), 0) / L));
      return Math.sqrt(yx.reduce((s, v, i) => s + (v - ya[i] - t * d[i]) ** 2, 0));
    };
    for (const e of eqs) {
      if (out.some((b) => onBranch(e.x, b))) continue;
      const parts = [-1, 1].map((dir) => N.continuation({ Fy, Jy, y0: toY(e.x, p[mu]), range: [0, 1], h: 0.01, hmin: 1e-7, hmax: 0.03, maxSteps: 600, direction: dir, tol: 1e-11 }));
      // The backward part runs the other way: flip its tangent, and so the sign of its augmented determinant.
      const pts = [...parts[0].points.slice(1).reverse().map((pt) => ({ ...pt, flip: -1 })), ...parts[1].points.map((pt) => ({ ...pt, flip: 1 }))].map((pt) => {
        const { x, m } = fromY(pt.y);
        const ev = N.eig(M.J(x, { ...p, [mu]: m })) ?? [];
        return { mu: m, x, tmu: pt.flip * pt.t[n], det: pt.flip * pt.det, eigenvalues: ev, ...classify(ev) };
      });
      out.push({ id: `b${out.length + 1}`, from: e.x, points: pts, stops: parts.map((c) => c.stop) });
    }
    for (const b of out) b.special = specials(M, sys, p, mu, b);
    // A branch that bifurcates at a branch point turns there in μ: that turning point is the pitchfork's own, not a fold.
    const bps = out.flatMap((b) => b.special.filter((sp) => sp.kind === "branch-point").map((sp) => ({ b, sp })));
    for (const b of out) {
      b.special = b.special.filter((sp) => {
        if (sp.kind !== "fold") return true;
        const hit = bps.find(({ b: ob, sp: bp }) => ob !== b && Math.abs(bp.mu - sp.mu) <= 1e-6 * Math.max(1, Math.abs(bp.mu)) && bp.x.every((v, i) => Math.abs(v - sp.x[i]) <= 1e-5 * (1 + Math.abs(v))));
        if (!hit) return true;
        const near = b.points.filter((pt) => Math.hypot(...pt.x.map((v, i) => v - sp.x[i])) > 0 && Math.abs(pt.mu - sp.mu) < 0.05 * (hi - lo)).slice(0, 6);
        const side = near.length ? Math.sign(near.reduce((t, pt) => t + (pt.mu - sp.mu), 0)) : 0;
        const stable = near.length > 0 && near.every((pt) => pt.stable);
        hit.sp.direction = side;
        hit.sp.newStable = stable;
        if (hit.sp.classified) {
          hit.sp.label = `Branch point: ${stable ? "supercritical" : "subcritical"} pitchfork`;
          hit.sp.text += ` The new pair of branches exists for ${mu} ${side > 0 ? ">" : "<"} ${num(hit.sp.mu)}. Near the branch point it is ${stable ? "linearly stable" : "unstable"}, so the pitchfork is ${stable ? "supercritical" : "subcritical"}.`;
        }
        return false;
      });
    }
    return out;
  }

  /** Folds, branch points and Hopf points along one branch, each refined and checked. */
  function specials(M, sys, p, mu, b) {
    const out = [];
    const pts = b.points;
    const unstableCount = (pt) => pt.eigenvalues.filter((e) => e.re > 1e-9 * Math.max(1, Math.hypot(e.re, e.im))).length;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], c = pts[k];
      if (Math.sign(a.tmu) !== Math.sign(c.tmu) && a.tmu !== 0 && c.tmu !== 0) out.push(fold(M, p, mu, a, c));
      else if (a.det !== c.det && a.det !== 0 && c.det !== 0) out.push(branchPoint(M, sys, p, mu, a, c));
      const ua = unstableCount(a), uc = unstableCount(c);
      if (Math.abs(ua - uc) === 2) {
        const pair = (pt) => pt.eigenvalues.filter((e) => Math.abs(e.im) > 1e-7 * Math.max(1, Math.abs(e.re)));
        if (pair(a).length && pair(c).length) out.push(hopf(M, p, mu, a, c));
      }
    }
    return out.filter(Boolean);
  }

  /** Solve f = 0 at a fixed parameter value from a guess. */
  const settle = (M, p, mu, m, x0) => N.newton((x) => M.F(x, { ...p, [mu]: m }), (x) => M.J(x, { ...p, [mu]: m }), x0, { tol: 1e-12, maxIter: 30, stepTol: 1e-14 });
  const lerp = (a, c, t) => ({ mu: a.mu + t * (c.mu - a.mu), x: a.x.map((v, i) => v + t * (c.x[i] - v)) });
  const transpose = (A) => Array.from({ length: A[0].length }, (_, j) => Float64Array.from(A, (r) => r[j]));
  const dotv = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  /** B(u, w)_i = Σ H_ijk u_j w_k for real vectors. */
  const bil = (H, u, w) => H.map((Hi) => Hi.reduce((s, row, j) => s + u[j] * row.reduce((t, h, k) => t + h * w[k], 0), 0));

  /** A fold: Newton on f = 0, J v = 0, v₀·v = 1, then the normal-form coefficients a = w·B(v,v)/2 and b = w·f_μ. */
  function fold(M, p, mu, a, c) {
    const n = M.n;
    const g = lerp(a, c, Math.abs(a.tmu) / (Math.abs(a.tmu) + Math.abs(c.tmu)));
    const q0 = { ...p, [mu]: g.mu };
    const v0 = N.eigvec(M.J(g.x, q0), smallest(M.J(g.x, q0))).re;
    const nv = Math.sqrt(dotv(v0, v0));
    const v0n = v0.map((x) => x / nv);
    const G = (z) => {
      const x = Array.from(z.subarray(0, n)), m = z[n], v = z.subarray(n + 1);
      const q = { ...p, [mu]: m };
      const f = M.F(x, q), Jv = N.matvec(M.J(x, q), v);
      return Float64Array.from([...f, ...Jv, dotv(v0n, v) - 1]);
    };
    const GJ = (z) => {
      const x = Array.from(z.subarray(0, n)), m = z[n], v = z.subarray(n + 1);
      const q = { ...p, [mu]: m };
      const J = M.J(x, q), H = M.H(x, q), Fm = M.Fmu(x, q, mu), Jm = M.Jmu(x, q, mu);
      const rows = [];
      for (let i = 0; i < n; i++) rows.push(Float64Array.from([...J[i], Fm[i], ...new Array(n).fill(0)]));
      for (let i = 0; i < n; i++) rows.push(Float64Array.from([...Array.from({ length: n }, (_, k) => H[i].reduce((s, row, j) => s + row[k] * v[j], 0)), dotv(Jm[i], v), ...J[i]]));
      rows.push(Float64Array.from([...new Array(n + 1).fill(0), ...v0n]));
      return rows;
    };
    const res = N.newton(G, GJ, Float64Array.from([...g.x, g.mu, ...v0n]), { tol: 1e-12, maxIter: 30, stepTol: 1e-13 });
    const x = Array.from(res.x.subarray(0, n)), m = res.x[n], v = Array.from(res.x.subarray(n + 1));
    const q = { ...p, [mu]: m };
    const Jt = transpose(M.J(x, q));
    const w = N.eigvec(Jt, smallest(Jt)).re;
    const wv = dotv(w, v);
    const A = 0.5 * dotv(w, bil(M.H(x, q), v, v)) / wv, Bc = dotv(w, M.Fmu(x, q, mu)) / wv;
    const ok = res.converged && Math.abs(A) > 1e-8 && Math.abs(Bc) > 1e-8;
    return { kind: "fold", mu: m, x, converged: res.converged, residual: res.residual, a: A, b: Bc, classified: ok,
      label: ok ? "Fold (saddle-node bifurcation)" : "Fold candidate", text: ok ? `Two equilibria meet and vanish. Checked: a = ½w·f_xx[v,v] = ${num(A)} ≠ 0 and b = w·f_μ = ${num(Bc)} ≠ 0.` : "A turning point of the branch. A normal-form coefficient is too small to classify it." };
  }
  const smallest = (A) => { const ev = N.eig(A) ?? [{ re: 0, im: 0 }]; const z = ev.reduce((b, e) => (Math.hypot(e.re, e.im) < Math.hypot(b.re, b.im) ? e : b), ev[0]); return { re: z.re, im: 0 }; };

  /** A branch point: refined by Brent's method on det J along the branch, then the symmetry test of a pitchfork. */
  function branchPoint(M, sys, p, mu, a, c) {
    const det = (m, x0) => { const r = settle(M, p, mu, m, x0); return { det: N.logDet(M.J(Array.from(r.x), { ...p, [mu]: m })).sign * Math.exp(N.logDet(M.J(Array.from(r.x), { ...p, [mu]: m })).log), x: Array.from(r.x), ok: r.converged }; };
    const guess = (m) => lerp(a, c, (m - a.mu) / (c.mu - a.mu || 1)).x;
    const m = SF.brent((mm) => det(mm, guess(mm)).det, Math.min(a.mu, c.mu), Math.max(a.mu, c.mu), 1e-14) ?? (a.mu + c.mu) / 2;
    const at = det(m, guess(m));
    const q = { ...p, [mu]: m };
    const J = M.J(at.x, q);
    const v = N.eigvec(J, smallest(J)).re;
    const sym = symmetry(sys, p);
    const fixes = sym && at.x.every((xi, i) => Math.abs(sym.signs[i] * xi - xi) <= 1e-8 * (1 + Math.abs(xi)));
    const flips = sym && v.every((vi, i) => Math.abs(sym.signs[i] * vi + vi) <= 1e-6 * (1 + Math.abs(vi)));
    const pitch = Boolean(sym && fixes && flips);
    return { kind: "branch-point", mu: m, x: at.x, converged: at.ok, det: at.det, symmetry: sym ? sym.text : null, classified: pitch,
      label: pitch ? "Branch point: pitchfork (symmetry-breaking)" : "Branch point candidate",
      text: pitch ? `Another branch crosses here. The exact symmetry ${sym.text} fixes the equilibrium and reverses the null vector. Thus the new branch is a symmetric pair: a pitchfork. Its direction comes from the continued branch.`
        : "Another branch crosses here (the augmented determinant changes sign). The page did not find a symmetry or a normal form that classifies it." };
  }

  /** A sign-change symmetry x → Sx with S = diag(±1) that leaves f equivariant, f(Sx) = S f(x), exactly. */
  function symmetry(sys) {
    const n = sys.states.length;
    if (n > 5) return null;
    for (let mask = 1; mask < 1 << n; mask++) {
      const signs = sys.states.map((_, i) => ((mask >> i) & 1 ? -1 : 1));
      const sub = { sym: (name) => { const i = sys.states.indexOf(name); return i >= 0 && signs[i] < 0 ? S.neg(S.symbol(name)) : null; } };
      let ok = true;
      for (let i = 0; i < n && ok; i++) {
        let lhs;
        try { lhs = S.subst(sys.f[i], sub); } catch { ok = false; break; }
        const rhs = signs[i] < 0 ? S.neg(sys.f[i]) : sys.f[i];
        ok = S.equalCleared(lhs, rhs);
      }
      if (ok) return { signs, text: `(${sys.states.join(", ")}) → (${sys.states.map((s, i) => (signs[i] < 0 ? `−${s}` : s)).join(", ")})` };
    }
    return null;
  }

  /** A Hopf point: Brent's method on the real part of the crossing pair, then the first Lyapunov coefficient. */
  function hopf(M, p, mu, a, c) {
    const pairRe = (m) => {
      const r = settle(M, p, mu, m, lerp(a, c, (m - a.mu) / (c.mu - a.mu || 1)).x);
      const ev = N.eig(M.J(Array.from(r.x), { ...p, [mu]: m })) ?? [];
      const pr = ev.filter((e) => Math.abs(e.im) > 1e-9);
      return pr.length ? pr.reduce((b, e) => (e.re > b.re ? e : b), pr[0]) : { re: NaN, im: 0 };
    };
    const m = SF.brent((mm) => pairRe(mm).re, Math.min(a.mu, c.mu), Math.max(a.mu, c.mu), 1e-14) ?? (a.mu + c.mu) / 2;
    const r = settle(M, p, mu, m, lerp(a, c, (m - a.mu) / (c.mu - a.mu || 1)).x);
    const x = Array.from(r.x), q = { ...p, [mu]: m };
    const lam = pairRe(m);
    const omega = Math.abs(lam.im);
    const dm = 1e-6 * Math.max(1, Math.abs(m));
    const speed = (pairRe(m + dm).re - pairRe(m - dm).re) / (2 * dm);
    const l1 = lyapunov(M, x, q, omega);
    const ok = r.converged && Number.isFinite(l1) && Math.abs(l1) > 1e-10 && Math.abs(speed) > 1e-10;
    return { kind: "hopf", mu: m, x, converged: r.converged, omega, speed, l1, classified: ok, label: ok ? (l1 < 0 ? "Hopf point: supercritical" : "Hopf point: subcritical") : "Hopf candidate",
      text: ok ? `A complex pair λ = ±${num(omega)}i crosses the imaginary axis with the speed d(Re λ)/dμ = ${num(speed)} ≠ 0. The first Lyapunov coefficient is ℓ₁ = ${num(l1)}. ${l1 < 0 ? "A stable periodic orbit grows from the point on the side where the equilibrium is unstable." : "An unstable periodic orbit exists on the side where the equilibrium is stable. The equilibrium loses stability with no small stable orbit near it."}`
        : "A complex pair crosses the imaginary axis. The crossing speed or the first Lyapunov coefficient is too small to classify the point." };
  }

  /**
   * The first Lyapunov coefficient at a Hopf point (Kuznetsov, Elements of Applied Bifurcation Theory, eq. 3.20, for
   * an n-dimensional system): ℓ₁ = Re[⟨p, C(q,q,q̄)⟩ − 2⟨p, B(q, A⁻¹B(q,q̄))⟩ + ⟨p, B(q̄, (2iωI − A)⁻¹B(q,q))⟩]/(2ω).
   */
  function lyapunov(M, x, q, omega) {
    const n = M.n;
    const A = M.J(x, q);
    const H = M.H(x, q), T = M.T3(x, q);
    const cv = (re, im) => ({ re: Float64Array.from(re), im: Float64Array.from(im) });
    const vec = (A2, lam) => { const v = N.eigvec(A2, lam); return cv(v.re, v.im); };
    let qv = vec(A, { re: 0, im: omega });
    const At = transpose(A);
    let pv = vec(At, { re: 0, im: -omega });
    // Normalize ⟨q, q⟩ = 1 and ⟨p, q⟩ = 1 with ⟨a, b⟩ = conj(a)·b.
    const inner = (a, b) => { let re = 0, im = 0; for (let i = 0; i < n; i++) { re += a.re[i] * b.re[i] + a.im[i] * b.im[i]; im += a.re[i] * b.im[i] - a.im[i] * b.re[i]; } return { re, im }; };
    const scale = (a, s) => cv(a.re.map((v, i) => v * s.re - a.im[i] * s.im), a.im.map((v, i) => v * s.re + a.re[i] * s.im));
    const nq = Math.sqrt(inner(qv, qv).re);
    qv = scale(qv, { re: 1 / nq, im: 0 });
    const pq = inner(pv, qv);
    const d = pq.re * pq.re + pq.im * pq.im;
    pv = scale(pv, { re: pq.re / d, im: pq.im / d });
    const conj = (a) => cv(a.re, a.im.map((v) => -v));
    const Bc = (u, w) => {
      const re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) { const h = H[i][j][k]; re[i] += h * (u.re[j] * w.re[k] - u.im[j] * w.im[k]); im[i] += h * (u.re[j] * w.im[k] + u.im[j] * w.re[k]); }
      return cv(re, im);
    };
    const Cc = (u, w, z) => {
      const re = new Float64Array(n), im = new Float64Array(n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        const ar = u.re[j] * w.re[k] - u.im[j] * w.im[k], ai = u.re[j] * w.im[k] + u.im[j] * w.re[k];
        for (let l = 0; l < n; l++) { const t = T[i][j][k][l]; re[i] += t * (ar * z.re[l] - ai * z.im[l]); im[i] += t * (ar * z.im[l] + ai * z.re[l]); }
      }
      return cv(re, im);
    };
    const solveC = (Re, Im, b) => { const F = N.luComplex(Re, Im); const s = N.luSolveComplex(F, b.re, b.im); return cv(s.re, s.im); };
    const qb = conj(qv);
    const Bqqb = Bc(qv, qb);
    const s1 = solveC(A, N.zeros(n), Bqqb); // A⁻¹ B(q, q̄)
    const Bqq = Bc(qv, qv);
    const Re2 = A.map((r) => Float64Array.from(r, (v) => -v));
    const Im2 = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 2 * omega : 0)));
    const s2 = solveC(Re2, Im2, Bqq); // (2iωI − A)⁻¹ B(q, q)
    const t1 = inner(pv, Cc(qv, qv, qb)), t2 = inner(pv, Bc(qv, s1)), t3 = inner(pv, Bc(qb, s2));
    return (t1.re - 2 * t2.re + t3.re) / (2 * omega);
  }

  /* ---------- two parameters: fold curves, the cusp and the count of stable states ---------- */

  function foldCurves(M, p, mu, mu2, range, range2, folds, box) {
    const n = M.n;
    const s1 = range[1] - range[0], s2 = range2[1] - range2[0];
    // The state is scaled by the box, so a step of the continuation has the same size in every direction.
    const sx = box.map(([a, b]) => Math.max(Math.abs(b - a), 1e-9));
    const curves = [];
    for (const fp of folds) {
      const near = (a, b) => {
        const ax = (a.mu - fp.mu) / s1, ay = (a.mu2 - p[mu2]) / s2, dx = (b.mu - a.mu) / s1, dy = (b.mu2 - a.mu2) / s2;
        const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1e-30)));
        return Math.hypot(ax + t * dx, ay + t * dy) < 2e-3;
      };
      if (curves.some((cv) => cv.points.some((pt, k) => k > 0 && near(cv.points[k - 1], pt)))) continue;
      const q0 = { ...p, [mu]: fp.mu };
      const v0 = N.eigvec(M.J(fp.x, q0), smallest(M.J(fp.x, q0))).re;
      const nv = Math.sqrt(dotv(v0, v0));
      const v0n = v0.map((x) => x / nv);
      // y = (x, v, μ₁ scaled, μ₂ scaled); equations f = 0, J v = 0, v₀·v = 1.
      const unpack = (y) => ({ x: Array.from(y.subarray(0, n), (v, i) => v * sx[i]), v: y.subarray(n, 2 * n), m1: range[0] + y[2 * n] * s1, m2: range2[0] + y[2 * n + 1] * s2 });
      const Fy = (y) => { const u = unpack(y); const q = { ...p, [mu]: u.m1, [mu2]: u.m2 }; return Float64Array.from([...M.F(u.x, q), ...N.matvec(M.J(u.x, q), u.v), dotv(v0n, u.v) - 1]); };
      const Jy = (y) => {
        const u = unpack(y); const q = { ...p, [mu]: u.m1, [mu2]: u.m2 };
        const J = M.J(u.x, q), H = M.H(u.x, q), F1 = M.Fmu(u.x, q, mu), F2 = M.Fmu(u.x, q, mu2), J1 = M.Jmu(u.x, q, mu), J2 = M.Jmu(u.x, q, mu2);
        const rows = [];
        for (let i = 0; i < n; i++) rows.push(Float64Array.from([...J[i].map((x, k) => x * sx[k]), ...new Array(n).fill(0), F1[i] * s1, F2[i] * s2]));
        for (let i = 0; i < n; i++) rows.push(Float64Array.from([...Array.from({ length: n }, (_, k) => H[i].reduce((s, row, j) => s + row[k] * u.v[j], 0) * sx[k]), ...J[i], dotv(J1[i], u.v) * s1, dotv(J2[i], u.v) * s2]));
        rows.push(Float64Array.from([...new Array(n).fill(0), ...v0n, 0, 0]));
        return rows;
      };
      const y0 = Float64Array.from([...fp.x.map((v, i) => v / sx[i]), ...v0n, (fp.mu - range[0]) / s1, (p[mu2] - range2[0]) / s2]);
      const parts = [-1, 1].map((dir) => N.continuation({ Fy, Jy, y0, range: [0, 1], h: 0.01, hmin: 1e-7, hmax: 0.03, maxSteps: 500, direction: dir, tol: 1e-10 }));
      const pts = [...parts[0].points.slice(1).reverse(), ...parts[1].points].map((pt) => {
        const u = unpack(pt.y);
        const q = { ...p, [mu]: u.m1, [mu2]: u.m2 };
        const Jt = transpose(M.J(u.x, q));
        const w = N.eigvec(Jt, smallest(Jt)).re;
        const a = 0.5 * dotv(w, bil(M.H(u.x, q), u.v, u.v)) / dotv(w, u.v);
        return { mu: u.m1, mu2: u.m2, x: u.x, a };
      }).filter((pt) => pt.mu >= range[0] && pt.mu <= range[1] && pt.mu2 >= range2[0] && pt.mu2 <= range2[1]);
      const cusps = [];
      for (let k = 1; k < pts.length; k++) if (Math.sign(pts[k - 1].a) !== Math.sign(pts[k].a)) {
        const t = pts[k - 1].a / (pts[k - 1].a - pts[k].a);
        cusps.push({ mu: pts[k - 1].mu + t * (pts[k].mu - pts[k - 1].mu), mu2: pts[k - 1].mu2 + t * (pts[k].mu2 - pts[k - 1].mu2), x: pts[k - 1].x.map((v, i) => v + t * (pts[k].x[i] - v)) });
      }
      curves.push({ id: `fold${curves.length + 1}`, points: pts, cusps });
    }
    return curves;
  }

  /** The number of linearly stable equilibria at each node of a grid in (μ₁, μ₂). */
  function stableCount(M, sys, p, mu, mu2, range, range2, box, nx = 31, ny = 21) {
    const xs = Array.from({ length: nx }, (_, i) => range[0] + ((range[1] - range[0]) * i) / (nx - 1));
    const ys = Array.from({ length: ny }, (_, j) => range2[0] + ((range2[1] - range2[0]) * j) / (ny - 1));
    const counts = [];
    for (const y of ys) for (const x of xs) {
      const eq = equilibria(M, sys, { ...p, [mu]: x, [mu2]: y }, box, sys.states.length === 1 ? 25 : sys.states.length === 2 ? 7 : 4).list;
      counts.push(eq.filter((e) => e.stable).length);
    }
    return { xs, ys, counts };
  }

  /* ---------- the analysis of a record ---------- */

  /** Read "lo..hi" or "lo to hi" as two numbers. */
  function readRange(text) {
    const m = /^\s*(.+?)\s*(?:\.\.|\bto\b)\s*(.+?)\s*$/.exec(String(text ?? ""));
    if (!m) return null;
    const a = Q.parse(m[1]), b = Q.parse(m[2]);
    return a && b && Q.cmp(a, b) < 0 ? [Q.toNumber(a), Q.toNumber(b)] : null;
  }

  /**
   * Stability and continuation of the record's ODE system. `analysis` is the record's purpose.analysis:
   * { control (variable id), range ("lo..hi"), control2?, range2?, box? { state variable id: "lo..hi" } }.
   */
  function analyse(interp, analysis = {}) {
    const sys = system(interp);
    if (!sys.ok) return { ok: false, reason: sys.reason, next: sys.next };
    const bySym = Object.fromEntries(interp.variables.map((v) => [v.symbol, v]));
    const symOf = (id) => interp.variables.find((v) => v.id === id)?.symbol ?? null;
    const mu = symOf(analysis.control), mu2 = analysis.control2 ? symOf(analysis.control2) : null;
    const range = readRange(analysis.range), range2 = mu2 ? readRange(analysis.range2) : null;
    if (!mu || !sys.params.includes(mu)) return { ok: false, reason: "The record names no control parameter of the system for the continuation.", next: `Choose a control parameter in the purpose: one of ${sys.params.join(", ")}.`, states: sys.states, params: sys.params };
    if (!range) return { ok: false, reason: `The range of the control parameter ${mu} is missing or not of the form lo..hi.`, next: "Enter the range, such as 0.05..0.6." };
    if (analysis.control2 && (!mu2 || !sys.params.includes(mu2) || mu2 === mu)) return { ok: false, reason: "The second control parameter is not a parameter of the system, or it is the same as the first.", next: `Choose a second control parameter in the purpose: one of ${sys.params.filter((s) => s !== mu).join(", ")}.`, states: sys.states, params: sys.params };
    if (mu2 && !range2) return { ok: false, reason: `The range of the second control parameter ${mu2} is missing or not of the form lo..hi.`, next: "Enter the second range, such as 0.05..0.6." };
    const missing = sys.missing.filter((s) => s !== mu && s !== mu2);
    if (missing.length) return { ok: false, reason: `The parameter${missing.length > 1 ? "s" : ""} ${missing.join(", ")} ${missing.length > 1 ? "have" : "has"} no value.`, next: "Give each parameter a single value." };
    const p = { ...sys.values };
    if (!(mu in p)) p[mu] = (range[0] + range[1]) / 2;
    if (mu2 && !(mu2 in p)) p[mu2] = (range2[0] + range2[1]) / 2;
    const box = sys.states.map((s) => readRange(analysis.box?.[bySym[s]?.id]) ?? sys.ranges[s] ?? [-10, 10]);
    const M = model(sys);
    const perDim = sys.states.length === 1 ? 25 : sys.states.length === 2 ? 9 : 5;
    const eq = equilibria(M, sys, p, box, perDim);
    const br = branches(M, sys, p, mu, range, box, eq.list);
    const folds = br.flatMap((b) => b.special.filter((s) => s.kind === "fold"));
    const two = mu2 && range2 ? { curves: foldCurves(M, p, mu, mu2, range, range2, folds, box), grid: stableCount(M, sys, p, mu, mu2, range, range2, box) } : null;
    // The stable pieces of each branch (stable and monotone in μ), with each end moved to the special point there.
    const sxs = box.map(([u, w]) => Math.max(Math.abs(w - u), 1e-9)), smu = range[1] - range[0];
    const dist = (u, w) => Math.hypot((u.mu - w.mu) / smu, ...u.x.map((v, q) => (v - w.x[q]) / sxs[q]));
    const allSpecial = br.flatMap((b) => b.special);
    const runs = [];
    for (const b of br) {
      const P = b.points;
      let k = 0;
      while (k < P.length) {
        if (!P[k].stable) { k++; continue; }
        let j = k;
        while (j + 1 < P.length && P[j + 1].stable && Math.sign(P[j + 1].tmu) === Math.sign(P[k].tmu)) j++;
        const end = (i, out) => {
          const o = P[out];
          if (!o) return { mu: P[i].mu, at: null };
          const d = dist(P[i], o);
          const sp = allSpecial.filter((x) => dist(x, P[i]) <= 1.5 * d + 1e-9).sort((u, w) => dist(u, P[i]) - dist(w, P[i]))[0];
          return sp ? { mu: sp.mu, at: sp.kind } : { mu: (P[i].mu + o.mu) / 2, at: null };
        };
        const e1 = end(k, k - 1), e2 = end(j, j + 1);
        runs.push({ branch: b.id, lo: Math.min(e1.mu, e2.mu), hi: Math.max(e1.mu, e2.mu), ends: [e1.at, e2.at] });
        k = j + 1;
      }
    }
    const cuts = [...new Set(runs.flatMap((r) => [r.lo, r.hi]))].sort((a, b) => a - b);
    const multi = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const mid = (cuts[i] + cuts[i + 1]) / 2;
      if (runs.filter((r) => r.lo < mid && r.hi > mid).length >= 2) {
        if (multi.length && Math.abs(multi.at(-1)[1] - cuts[i]) < 1e-12) multi.at(-1)[1] = cuts[i + 1];
        else multi.push([cuts[i], cuts[i + 1]]);
      }
    }
    const isFold = (m) => folds.some((f) => Math.abs(f.mu - m) <= 1e-9 * Math.max(1, Math.abs(m)));
    const hysteresis = multi.filter(([a, c]) => isFold(a) && isFold(c)).map(([a, c]) => [num(a), num(c)]);
    const sym = symmetry(sys);
    const pl = (q) => S.plain(q);
    return {
      ok: true, states: sys.states, params: sys.params, time: sys.time, control: mu, range, control2: mu2, range2, values: p, box,
      f: sys.f.map((fi, i) => ({ state: sys.states[i], plain: pl(fi), tex: S.tex(fi) })),
      jacobian: M.Jp.map((row) => row.map((q) => ({ plain: pl(q), tex: S.tex(q) }))),
      symmetry: sym ? sym.text : null,
      equilibria: eq.list.map((e) => ({ x: e.x.map(num), residual: e.residual, eigenvalues: e.eigenvalues.map((v) => ({ re: num(v.re), im: num(v.im) })), stable: e.stable, type: e.type, text: e.text })),
      seeds: eq.seeds,
      branches: br.map((b) => ({ id: b.id, from: b.from.map(num), stops: b.stops, points: b.points.map((pt) => ({ mu: num(pt.mu), x: pt.x.map(num), stable: pt.stable, type: pt.type })),
        special: b.special.map((s) => ({ ...s, mu: num(s.mu), x: s.x.map(num) })) })),
      multistable: multi.map(([a, c]) => [num(a), num(c)]), hysteresis, runs: runs.map((r) => ({ ...r, lo: num(r.lo), hi: num(r.hi) })),
      two: two ? { curves: two.curves.map((c) => ({ id: c.id, points: c.points.map((pt) => [num(pt.mu), num(pt.mu2)]), cusps: c.cusps.map((k) => ({ mu: num(k.mu), mu2: num(k.mu2), x: k.x.map(num) })) })), grid: { xs: two.grid.xs.map(num), ys: two.grid.ys.map(num), counts: two.grid.counts } } : null,
      coverage: `At ${mu} = ${num(p[mu])}, the search ${sys.states.length === 1 ? `looked for every sign change of f at ${eq.seeds} points` : `started Newton's method from ${eq.seeds} seeds`}. The box was ${sys.states.map((s, i) => `${s} in [${num(box[i][0])}, ${num(box[i][1])}]`).join(", ")}. It followed each branch through those equilibria over ${mu} in [${num(range[0])}, ${num(range[1])}], with at most 600 steps each way. The result does not hold a branch that misses every equilibrium of the start, or an equilibrium outside the box. The search is not exhaustive.`,
    };
  }

  return { compile, system, model, classify, equilibria, branches, symmetry, lyapunov, foldCurves, stableCount, readRange, analyse };
});
