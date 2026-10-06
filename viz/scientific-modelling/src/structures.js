/* Scientific Modelling: the structures families of piece 5 as declared models for the Regime Map Builder.
 *
 *   euler-column       W'''' + λW'' = 0, pinned ends (anchor test 4): the critical eigenvalue π², the modes sin(nπX)
 *                      and Hermite cubic elements; the linear model gives no amplitude after buckling.
 *   beam-column        W'''' + λW'' = 1, pinned ends: the exact polynomial (X − 2X³ + X⁴)/24 at λ = 0 and the closed
 *                      form W(½) = (sec(√λ/2) − 1)/λ² − 1/(8λ) with the amplification factor 1/(1 − λ/π²).
 *   elastica           θ'' + λ sin θ = 0, θ' = λê at both ends: shooting, continuation, the branch point π², the
 *                      exact series λ/π² = 1 + θ0²/8 + …, the second variation and the eccentric branches.
 *   damped-oscillator  U'' + 2ζU' + U = cos rτ from rest: the steady solution, exact in rationals, and RK4.
 *   beam-modes         Y'''' + λY'' − Ω²Y = 0, pinned ends: Ω² = (nπ)⁴ − λ(nπ)² and Hermite elements.
 *   navier-plate       ∇⁴W = 1 on 0 < X < 1, 0 < Y < β, simply supported: the Navier series and finite differences.
 *   cylindrical-shell  W'''' + W = 1, clamped at X = 0, symmetric at X = L̂: the exact edge solution.
 *   thermal-rod        U'' = 0, U(0) = 0, U'(1) − 1 + κU(1) = 0: exact in rationals.
 *   thermal-plate      (1 − ν)Ŝ = Ê − 1, Ê = 0, and the bending part ±EαΔT_g/(2(1 − ν)): exact in rationals.
 *
 * Statuses: a check in rational arithmetic, or in rational multiples of powers of π, is exact; an eigenvalue, a
 * series sum, a shooting solution or a difference solution is numerical with its tolerance.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./special.js"), require("./structures-num.js"));
  else (root.SM = root.SM || {}).STR = factory(root.SM.Q, root.SM.SF, root.SM.SN);
})(typeof self !== "undefined" ? self : this, function (Q, SF, N) {
  "use strict";

  const PI = Math.PI, PI2 = PI * PI, PI4 = PI2 * PI2;
  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(12)) : null);
  const relErr = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  const range = (n) => [...Array(n).keys()];
  const BIG = 1e6;
  function fmt(x, digits = 6) {
    if (x === null || x === undefined || !Number.isFinite(x)) return "–";
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e7) return String(Number(x.toPrecision(digits)));
    const [m, e] = x.toExponential(digits - 1).split("e");
    return `${Number(m)}×10^${Number(e)}`;
  }
  const ords = (o) => o.map((x) => (x === null ? "–" : x.toFixed(2))).join(", ");
  /** A rational from the record, or null. */
  const qOf = (v) => (v && v.exact ? (typeof v.exact === "string" ? Q.parse(v.exact) : v.exact) : null);
  /** An exact square root of a nonnegative rational, or null. */
  function qsqrt(q) {
    const r = (n) => { if (n < 0n) return null; if (n < 2n) return n; let s = BigInt(Math.floor(Math.sqrt(Number(n)))); while (s * s > n) s--; while ((s + 1n) * (s + 1n) <= n) s++; return s * s === n ? s : null; };
    const a = r(q.n), b = r(q.d);
    return a !== null && b !== null ? Q.q(a, b) : null;
  }

  /* ---------- layers ---------- */

  const approxLayer = (id, title, measure, criterion, steps, evidence = ["spec-8", "spec-9"]) => ({
    id, kind: "approximation", boundary: "approximation", title, measure, scale: "log", status: "numerical", criterion, steps, evidence, hue: id,
    thresholds: (tol) => ({ curves: [{ value: tol, label: `${title}: error = ${tol}` }], regions: [{ id: "meets", label: `${title} meets the tolerance`, lo: 0, hi: tol }] }),
  });
  const balanceLayer = (id, title, measure, criterion, low, high, steps, evidence) => ({
    id, kind: "balance", boundary: "balance-crossover", title, measure, scale: "log", status: "numerical", criterion, steps, evidence, hue: id,
    thresholds: () => ({ curves: [{ value: 1, label: `${title}: the terms are equal` }], regions: [{ id: "low", label: low, lo: 0, hi: 0.1 }, { id: "band", label: "Comparable terms: the balance crossover region", lo: 0.1, hi: 10 }, { id: "high", label: high, lo: 10, hi: null }] }),
  });
  /** A stability layer on the ratio of the load to its critical value: below 1 stable. */
  const loadLayer = (id, title, measure, criterion, steps, evidence, kind = "stability", status = "exact") => ({
    id, kind, boundary: kind, title, measure, scale: "log", status, criterion, steps, evidence, hue: id,
    thresholds: () => ({ curves: [{ value: 1, label: `${title}: the neutral condition` }], regions: [{ id: "stable", label: "Below the critical value: the straight state is stable", lo: 0, hi: 1 }, { id: "unstable", label: "Above the critical value: the straight state is not stable", lo: 1, hi: null }] }),
  });
  const noBalance = (intro, terms) => ({ intro, terms, balances: [], crossovers: [], note: "A balance crossover is a comparison of terms. It is not a transition." });
  const noAsymptotic = (why) => ({ limits: [], overlap: why, gaps: "None: the declared solution is used at every point." });

  /* ---------- the beam: exact and element solutions ---------- */

  /** Hermite element runs with the given supports: eigenvalues of K v = λ B v, with B = G (buckling) or M (vibration). */
  function feEigen(n, which, lambdaAxial = 0) {
    const fe = N.beamFE(n);
    const fixed = N.fixedDofs(n, "pinned", "pinned");
    const keep = range(fe.N).filter((i) => !fixed.includes(i));
    const K = N.reduce(fe.K, keep), G = N.reduce(fe.G, keep), M = N.reduce(fe.M, keep);
    const A = which === "buckling" ? K : K.map((r, i) => r.map((x, j) => x - lambdaAxial * G[i][j]));
    const e = N.geneig(A, which === "buckling" ? G : M);
    const shape = (k) => {
      const full = new Array(fe.N).fill(0);
      keep.forEach((i, j) => { full[i] = e.vectors[k][j]; });
      const pts = range(n + 1).map((i) => [i / n, full[2 * i]]);
      const mx = Math.max(...pts.map((p) => Math.abs(p[1]))) || 1;
      const ref = pts[Math.max(1, Math.round(n / (2 * (k + 1))))][1];
      const s = ref < 0 ? -1 : 1;
      return pts.map(([x, y]) => [num(x), num((s * y) / mx)]);
    };
    return { n, values: e.values, shape, sweeps: e.sweeps, size: keep.length };
  }
  /** Exact checks of sin(kπX): Y'''' + λY'' − ΩY = 0 with Ω = (kπ)⁴ − λ(kπ)², and the pinned conditions, for rational λ. */
  function sineModeCheck(k, lam) {
    const w = [{ c: Q.ONE, p: 0, fn: "sin", k: Q.q(BigInt(k)) }];
    // Ω² = k⁴π⁴ − λk²π²: the residual Y'''' + λY'' − Ω²Y collects to 0 power by power of π.
    const omega = [...N.tscale(w, Q.q(BigInt(k ** 4)), 4), ...N.tscale(w, Q.neg(Q.mul(lam, Q.q(BigInt(k * k)))), 2)];
    const res = N.tcollect([...N.tderivN(w, 4), ...N.tscale(N.tderivN(w, 2), lam, 0), ...N.tscale(omega, Q.q(-1n), 0)]);
    const ends = [Q.ZERO, Q.ONE].every((X) => !Object.keys(N.tvalue(w, X)).length && !Object.keys(N.tvalue(N.tderivN(w, 2), X)).length);
    return res.length === 0 && ends;
  }
  /** W(X) of W'''' = 1 with pinned ends, exact: (X − 2X³ + X⁴)/24; and the checks of the equation and conditions. */
  function beamPolynomial() {
    const W = N.poly([0, "1/24", 0, "-1/12", "1/24"]);
    const ok = N.pzero(N.psub(N.pderivN(W, 4), N.poly([1]))) && [Q.ZERO, Q.ONE].every((X) => Q.isZero(N.peval(W, X)) && Q.isZero(N.peval(N.pderivN(W, 2), X)));
    return { W, ok, mid: N.peval(W, Q.q(1n, 2n)) };
  }
  /** Midspan W(½; λ) of W'''' + λW'' = 1 with pinned ends. */
  function beamMid(lam) {
    if (lam < 1e-3) return 5 / 384 + (61 / 46080) * lam + (277 / 2064384) * lam * lam;
    const k = Math.sqrt(lam);
    return (1 / Math.cos(k / 2) - 1) / (lam * lam) - 1 / (8 * lam);
  }
  function beamCurve(lam) {
    return range(101).map((i) => {
      const X = i / 100;
      if (lam < 1e-6) return [X, num((X - 2 * X ** 3 + X ** 4) / 24)];
      const k = Math.sqrt(lam);
      return [X, num(-X * (1 - X) / (2 * lam) + (Math.cos(k * (X - 0.5)) / Math.cos(k / 2) - 1) / (lam * lam))];
    });
  }

  /* ---------- the elastica ---------- */

  function shoot(theta0, lam, ehat, steps, keep = false) {
    const f = (_s, y) => [y[1], -lam * Math.sin(y[0]), y[3], -lam * Math.cos(y[0]) * y[2], y[5], -Math.sin(y[0]) - lam * Math.cos(y[0]) * y[4]];
    const r = N.rk4(f, [theta0, lam * ehat, 1, 0, 0, ehat], 0, 1, steps, keep);
    return { R: r.y[1] - lam * ehat, Rt: r.y[3], Rl: r.y[5] - ehat, path: keep ? r.path : null };
  }
  function lambdaAt(theta0, ehat, steps, start) {
    let lam = start;
    for (let i = 0; i < 60; i++) {
      const s = shoot(theta0, lam, ehat, steps);
      const dl = -s.R / s.Rl;
      lam += dl;
      if (Math.abs(dl) < 1e-14 * Math.max(1, lam)) break;
    }
    return lam;
  }
  function theta0At(lam, ehat, steps, start) {
    let t = start;
    for (let i = 0; i < 80; i++) {
      const s = shoot(t, lam, ehat, steps);
      const dt = -s.R / s.Rt;
      t += Math.max(-0.3, Math.min(0.3, dt));
      if (Math.abs(dt) < 1e-14) break;
    }
    return t;
  }
  /** The end rotation of the branch from the unloaded state (θ0 < 0 for ê > 0): bracket on (−π, 0), then Brent. */
  function naturalTheta0(lam, ehat, steps) {
    const k = Math.sqrt(lam);
    const guess = lam < 0.8 * PI2 ? -ehat * k * Math.tan(k / 2) : -Math.max(perfectTheta0(lam), Math.cbrt(4 * ehat), 0.05);
    let t = guess;
    for (let i = 0; i < 30; i++) {
      const s = shoot(t, lam, ehat, steps);
      const dt = -s.R / s.Rt;
      if (!Number.isFinite(dt)) break;
      t = Math.max(-2 * PI + 0.01, Math.min(-1e-12, t + Math.max(-0.2, Math.min(0.2, dt))));
      if (Math.abs(dt) < 1e-13) return t;
    }
    return naturalScan(lam, ehat, steps);
  }
  function naturalScan(lam, ehat, steps) {
    const R = (t) => shoot(t, lam, ehat, steps).R;
    let a = -1e-9, fa = R(a);
    for (let i = 1; i <= 120; i++) {
      const b = -(i / 120) * (2 * PI - 0.02);
      const fb = R(b);
      if (fa * fb <= 0) return SF.brent(R, b, a, 1e-14);
      a = b; fa = fb;
    }
    return null;
  }
  /** The perfect branch: θ0 > 0 at λ > π² from λ = 4K(sin²(θ0/2))², by bisection on the AGM formula. */
  function perfectTheta0(lam) {
    if (lam <= PI2) return 0;
    let a = 0, b = PI - 1e-12;
    for (let i = 0; i < 80; i++) { const c = (a + b) / 2; if (4 * N.ellipK(Math.sin(c / 2) ** 2) ** 2 < lam) a = c; else b = c; }
    return (a + b) / 2;
  }
  /** Pseudo-arclength continuation in (θ0, μ = λ/π²). */
  function continuation(start, dir, ehat, steps, { thetaMax, muMax, ds0 = 0.05, maxPoints = 400 }) {
    const res = (u) => { const s = shoot(u[0], u[1] * PI2, ehat, steps); return { R: s.R, g: [s.Rt, s.Rl * PI2] }; };
    let u = start.slice();
    const r0 = res(u);
    let t = [r0.g[1], -r0.g[0]];
    let nt = Math.hypot(t[0], t[1]);
    t = [t[0] / nt, t[1] / nt];
    if (t[0] * dir[0] + t[1] * dir[1] < 0) t = [-t[0], -t[1]];
    const pts = [{ theta0: u[0], mu: u[1], grad: Math.hypot(...r0.g) }];
    let ds = ds0, newton = 0, why = "point limit";
    for (let k = 0; k < maxPoints; k++) {
      const pred = [u[0] + ds * t[0], u[1] + ds * t[1]];
      let v = pred.slice(), ok = false;
      for (let it = 0; it < 12; it++) {
        const r = res(v);
        newton++;
        const F = [r.R, t[0] * (v[0] - pred[0]) + t[1] * (v[1] - pred[1])];
        const det = r.g[0] * t[1] - r.g[1] * t[0];
        if (!det) break;
        const d0 = (F[0] * t[1] - F[1] * r.g[1]) / det, d1 = (r.g[0] * F[1] - t[0] * F[0]) / det;
        v = [v[0] - d0, v[1] - d1];
        if (Math.hypot(d0, d1) < 1e-12) { ok = true; break; }
      }
      if (!ok) { ds /= 2; if (ds < 1e-6) { why = "step too small"; break; } k--; continue; }
      const r = res(v);
      let tn = [r.g[1], -r.g[0]];
      nt = Math.hypot(tn[0], tn[1]);
      tn = [tn[0] / nt, tn[1] / nt];
      if (tn[0] * t[0] + tn[1] * t[1] < 0) tn = [-tn[0], -tn[1]];
      u = v;
      t = tn;
      pts.push({ theta0: u[0], mu: u[1], grad: Math.hypot(...r.g) });
      ds = Math.min(ds * 1.3, 0.12);
      if (Math.abs(u[0]) >= thetaMax) { why = "end-rotation limit"; break; }
      if (u[1] >= muMax || u[1] <= 0) { why = "load limit"; break; }
    }
    return { pts, newton, why };
  }
  /**
   * The second variation ∫ η'² − λ cos θ η² dS with the end constraint ∫ cos θ η dS = 0 on n intervals: its smallest
   * eigenvalues and the count of negative ones.
   */
  function secondVariation(nodes, lam) {
    const n = nodes.length - 1, h = 1 / n;
    const w = range(n + 1).map((i) => (i === 0 || i === n ? h / 2 : h));
    const A = N.zeros(n + 1, n + 1);
    for (let i = 0; i < n; i++) { A[i][i] += 1 / h; A[i + 1][i + 1] += 1 / h; A[i][i + 1] -= 1 / h; A[i + 1][i] -= 1 / h; }
    for (let i = 0; i <= n; i++) A[i][i] -= lam * Math.cos(nodes[i]) * w[i];
    const s = w.map((x) => 1 / Math.sqrt(x));
    const B = A.map((row, i) => row.map((x, j) => x * s[i] * s[j]));
    let c = range(n + 1).map((i) => w[i] * Math.cos(nodes[i]) * s[i]);
    const nc = Math.hypot(...c);
    c = c.map((x) => x / nc);
    const v = c.slice();
    v[0] += Math.sign(c[0] || 1);
    const vv = v.reduce((a, x) => a + x * x, 0);
    const H = range(n + 1).map((i) => range(n + 1).map((j) => (i === j ? 1 : 0) - (2 * v[i] * v[j]) / vv));
    const HB = H.map((row) => range(n + 1).map((j) => row.reduce((a, x, k) => a + x * B[k][j], 0)));
    const C = range(n).map((i) => range(n).map((j) => HB[i + 1].reduce((a, x, k) => a + x * H[k][j + 1], 0)));
    const e = N.jacobi(C);
    return { smallest: e.values.slice(0, 3).map(num), negative: e.values.filter((x) => x < 0).length };
  }
  const nodesOf = (theta0, lam, ehat, n) => shoot(theta0, lam, ehat, n, true).path.map((y) => y[0]);
  /** λ/π² = Σ c_j θ0^(2j) exactly, from K(m) = (π/2)Σ((1/2)_k/k!)² m^k and m = sin²(θ0/2) = (1 − cos θ0)/2. */
  function elasticaSeries(order = 3) {
    const fact = (k) => { let f = 1n; for (let i = 2n; i <= BigInt(k); i++) f *= i; return f; };
    const m = [Q.ZERO, ...range(order).map((j) => Q.q(BigInt(j % 2 ? -1 : 1), 2n * fact(2 * (j + 1))))];
    const mul = (a, b) => { const out = range(order + 1).map(() => Q.ZERO); for (let i = 0; i <= order; i++) for (let j = 0; i + j <= order; j++) out[i + j] = Q.add(out[i + j], Q.mul(a[i] ?? Q.ZERO, b[j] ?? Q.ZERO)); return out; };
    const a = [Q.ONE];
    for (let k = 1; k <= order; k++) { const r = Q.q(BigInt(2 * k - 1), BigInt(2 * k)); a.push(Q.mul(a[k - 1], Q.mul(r, r))); }
    let Ks = [Q.ONE, ...range(order).map(() => Q.ZERO)], mp = Ks.slice();
    for (let k = 1; k <= order; k++) { mp = mul(mp, m); Ks = Ks.map((x, i) => Q.add(x, Q.mul(a[k], mp[i]))); }
    return mul(Ks, Ks).map(Q.str);
  }
  /** The deformed centre line x(S), y(S). */
  function shape(theta0, lam, ehat, steps) {
    const path = shoot(theta0, lam, ehat, steps, true).path;
    const pts = [[0, 0]];
    const h = 1 / steps;
    let x = 0, y = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1][0], b = path[i][0], mid = (a + b) / 2;
      x += (h / 6) * (Math.cos(a) + 4 * Math.cos(mid) + Math.cos(b));
      y += (h / 6) * (Math.sin(a) + 4 * Math.sin(mid) + Math.sin(b));
      if (i % Math.max(1, Math.round(steps / 50)) === 0 || i === path.length - 1) pts.push([num(x), num(y)]);
    }
    return pts;
  }

  /** The centre lines at three end rotations, with axes that hold every point. */
  function shapesFigure(steps) {
    const series = [30, 90, 150].map((d) => { const t = (d * PI) / 180; const l = lambdaAt(t, 0, steps, 4 * N.ellipK(Math.sin(t / 2) ** 2) ** 2); return { label: `θ0 = ${d}°, λ/π² = ${fmt(l / PI2, 4)}`, pts: shape(t, l, 0, steps) }; });
    const xs = series.flatMap((x) => x.pts.map((q) => q[0])), ys = series.flatMap((x) => x.pts.map((q) => q[1]));
    const pad = (a, b) => [a - 0.05 * (b - a), b + 0.05 * (b - a)];
    const [x0, x1] = pad(Math.min(...xs), Math.max(...xs)), [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
    return { id: "st-elastica-shapes", title: "Shapes on the perfect branch", x: { min: num(x0), max: num(x1), label: "x/L" }, y: { min: num(y0), max: num(y1), label: "y/L" }, series,
      caption: "Centre lines of the inextensible elastica at three end rotations. At 150° the second end has moved past the first end (x < 0)." };
  }

  /* ---------- vibration ---------- */

  const H = (r, z) => 1 / Math.sqrt((1 - r * r) ** 2 + (2 * z * r) ** 2);
  /** The steady solution in rationals: A, B, |H|², the particular-solution and energy checks. */
  function oscillatorExact(zQ, rQ) {
    const one = Q.ONE, two = Q.q(2n);
    const r2 = Q.mul(rQ, rQ), tz = Q.mul(Q.mul(two, zQ), rQ);
    const Dl = Q.add(Q.mul(Q.sub(one, r2), Q.sub(one, r2)), Q.mul(tz, tz));
    const A = Q.div(Q.sub(one, r2), Dl), B = Q.div(tz, Dl);
    const cosPart = Q.add(Q.add(Q.neg(Q.mul(r2, A)), Q.mul(tz, B)), A);
    const sinPart = Q.add(Q.sub(Q.neg(Q.mul(r2, B)), Q.mul(tz, A)), B);
    const energy = Q.eq(B, Q.mul(tz, Q.add(Q.mul(A, A), Q.mul(B, B))));
    const under = Q.cmp(Q.mul(Q.mul(two, zQ), zQ), one) < 0;
    return { A: Q.str(A), B: Q.str(B), H2: Q.str(Q.inv(Dl)), particular: Q.eq(cosPart, one) && Q.isZero(sinPart), energy,
      peak: under ? { r2: Q.str(Q.sub(one, Q.mul(Q.mul(two, zQ), zQ))), H2: Q.str(Q.inv(Q.mul(Q.mul(Q.q(4n), Q.mul(zQ, zQ)), Q.sub(one, Q.mul(zQ, zQ))))) } : null, A0: Q.toNumber(A), B0: Q.toNumber(B) };
  }
  /** RK4 from rest until the transient is below 1e-10, then the cosine and sine parts of the last period. */
  function oscillatorRK4(r, z) {
    const per = 200, T = (2 * PI) / r;
    const periods = Math.min(4000, Math.ceil(Math.log(1e10) / (z * T)) + 1);
    const n = periods * per;
    const sim = N.rk4((t, y) => [y[1], Math.cos(r * t) - 2 * z * y[1] - y[0]], [0, 0], 0, periods * T, n, true);
    const last = sim.path.slice(n - per), h = T / per, t0 = (periods - 1) * T;
    const A = (2 / T) * N.simpson(last.map((y, i) => y[0] * Math.cos(r * (t0 + i * h))), h);
    const B = (2 / T) * N.simpson(last.map((y, i) => y[0] * Math.sin(r * (t0 + i * h))), h);
    const win = N.simpson(last.map((y, i) => Math.cos(r * (t0 + i * h)) * y[1]), h);
    const wd = N.simpson(last.map((y) => 2 * z * y[1] * y[1]), h);
    const early = sim.path.slice(0, Math.min(sim.path.length, 6 * per)).filter((_, i) => i % 10 === 0).map((y, i) => [num(i * 10 * h), num(y[0])]);
    return { periods, steps: n, per, A, B, win, wd, early };
  }

  /* ---------- plates and shells ---------- */

  function navier(beta, nu, M, X = 0.5, Y = beta / 2) {
    let w = 0, mx = 0;
    for (let m = 1; m <= M; m += 2) for (let n = 1; n <= M; n += 2) {
      const s = Math.sin(m * PI * X) * Math.sin((n * PI * Y) / beta);
      const q = m * m + (n * n) / (beta * beta);
      w += s / (m * n * q * q);
      mx += (s * (m * m + (nu * n * n) / (beta * beta))) / (m * n * q * q);
    }
    return { w: (16 / PI ** 6) * w, mx: (16 / PI ** 4) * mx };
  }
  /** ∇⁴W = 1 as two Poisson problems, 5-point differences and conjugate gradients; the centre value. */
  function plateFD(beta, n) {
    const nx = n, ny = Math.max(2, 2 * Math.round((n * beta) / 2));
    const hx = 1 / nx, hy = beta / ny, ix = nx - 1, iy = ny - 1, size = ix * iy;
    const id = (i, j) => (j - 1) * ix + (i - 1);
    const lap = (u) => {
      const out = new Array(size).fill(0);
      for (let j = 1; j <= iy; j++) for (let i = 1; i <= ix; i++) {
        const c = u[id(i, j)];
        const l = i > 1 ? u[id(i - 1, j)] : 0, r = i < ix ? u[id(i + 1, j)] : 0, d = j > 1 ? u[id(i, j - 1)] : 0, t = j < iy ? u[id(i, j + 1)] : 0;
        out[id(i, j)] = (2 * c - l - r) / (hx * hx) + (2 * c - d - t) / (hy * hy);
      }
      return out;
    };
    const a = N.cg(lap, new Array(size).fill(1), 1e-13);
    const b = N.cg(lap, a.x, 1e-13);
    return { n, centre: b.x[id(nx / 2, ny / 2)], iterations: a.iterations + b.iterations };
  }
  /** The finite cylinder: W'''' + W = 1, W(0) = W'(0) = 0, W'(L̂) = W'''(L̂) = 0, exact by a 4 × 4 system in ξ = X/√2. */
  function shellSolution(Lhat) {
    const xl = Lhat / Math.SQRT2;
    // W = 1 + Σ c_i φ_i, φ = e^(ξ−ξL)cos ξ, e^(ξ−ξL)sin ξ, e^(−ξ)cos ξ, e^(−ξ)sin ξ. In ξ, W_ξξξξ/4 + W = 1.
    const phi = (xi, d) => {
      const g = Math.exp(xi - xl), q = Math.exp(-xi), c = Math.cos(xi), s = Math.sin(xi);
      // derivatives of e^(±ξ)(a cos + b sin): (a, b) -> (±a + b, ±b − a)
      const der = (sg, a, b, k) => { for (let i = 0; i < k; i++) [a, b] = [sg * a + b, sg * b - a]; return [a, b]; };
      return [[1, 0], [0, 1], [1, 0], [0, 1]].map(([a, b], i) => { const sg = i < 2 ? 1 : -1; const [A, B] = der(sg, a, b, d); return (i < 2 ? g : q) * (A * c + B * s); });
    };
    const rows = [phi(0, 0), phi(0, 1), phi(xl, 1), phi(xl, 3)];
    const rhs = [-1, 0, 0, 0];
    const cf = N.solve(rows, rhs);
    const W = (xi, d = 0) => (d ? 0 : 1) + phi(xi, d).reduce((s, x, i) => s + x * cf[i], 0);
    return { W, xl, cf };
  }
  const edgeW = (xi) => 1 - Math.exp(-xi) * (Math.cos(xi) + Math.sin(xi));

  /* ---------- the implementations ---------- */

  function eulerImpl(decl) {
    const params = decl.domain.parameters;
    const evaluate = (p) => (p.lambda > 0 ? { ok: true, values: { ratio: p.lambda / PI2 } } : { ok: false, reason: "λ must be positive." });
    const layers = [loadLayer("euler", "Stability of the straight column", "ratio", "λ/λ_cr with λ_cr = π², the smallest eigenvalue of W'''' + λW'' = 0 with pinned ends. The straight column is stable below 1 (Euler)", ["s-st-eigen"], ["spec-8", "mit-ms-handout"])];
    const inspect = (p, ctx) => {
      const fe = feEigen(32, "buckling");
      return { ok: true, values: [{ id: "lambda", tex: "\\lambda", label: "dimensionless load", value: num(p.lambda) }, { id: "ratio", tex: "\\lambda/\\pi^{2}", label: "load over the critical load", value: num(p.lambda / PI2) }],
        checks: [{ id: "fe32", title: "Hermite elements (32) give λ_cr", passed: relErr(fe.values[0], PI2) <= 1e-6, status: "numerical", tolerance: "1e-6 relative", detail: `${fmt(fe.values[0], 12)} against π² = ${fmt(PI2, 12)}.` }],
        reconstruction: ctx.reconstruct ? [ctx.reconstruct("lambda", PI2)].filter(Boolean) : [] };
    };
    const derived = () => [{ id: "crit", tex: "\\lambda_{cr}=\\pi^{2}", label: "critical eigenvalue of the pinned column", value: num(PI2) }, { id: "crit2", tex: "\\lambda_2=4\\pi^{2}", label: "second eigenvalue", value: num(4 * PI2) }];
    const constraints = (p) => (p.lambda > PI2 ? ["The load is above λ_cr: the linear model says only that the straight column is not stable. It gives no deflection."] : []);
    return { id: decl.id, params, axes: { x: "lambda", y: null }, approximations: [], layers, evaluate, limits: () => [], inspect, derived, constraints,
      analysis: () => ({ note: "The Euler column is an eigenvalue problem: bending and the moment of the load balance at every mode.",
        balance: noBalance("Dominant balance does not apply: at a buckling mode the two terms are equal in size, so neither is small.", [
          { tex: "W''''", label: "bending", scale: "1", why: "X = x/L, so each derivative is of order 1." }, { tex: "\\lambda W''", label: "moment of the axial load", scale: "\\lambda", why: "The load enters through λ = PL²/(EI)." }]),
        asymptotic: noAsymptotic("The linear model has no small parameter.") }),
      acceptance: () => eulerAcceptance(), stability: (p, ctx) => eulerStability(p, ctx) };
  }
  function eulerAcceptance() {
    const out = [];
    for (const n of [1, 2, 3]) out.push({ id: `mode-${n}`, title: `sin(${n}πX) with λ = ${n * n}π² satisfies W'''' + λW'' = 0 and the four conditions`, passed: sineModeCheck(n, Q.ZERO) && bucklingModeCheck(n), status: "exact", detail: "Rational multiples of powers of π times sines and cosines: the residual collects to 0, and the conditions are 0 at X = 0 and X = 1." });
    const runs = [4, 8, 16, 32].map((n) => feEigen(n, "buckling"));
    const errs = runs.map((r) => relErr(r.values[0], PI2));
    const o = N.orders(errs, runs.map((r) => 1 / r.n));
    out.push({ id: "fe", title: "Hermite elements (32) give λ_cr = π²", passed: errs[3] <= 1e-6, status: "numerical", tolerance: "1e-6 relative", detail: `${fmt(runs[3].values[0], 12)}; errors ${errs.map((e) => fmt(e, 2)).join(", ")} on 4, 8, 16, 32 elements.` });
    out.push({ id: "order", title: "The element error falls at an order above 3.5", passed: o.every((x) => x !== null && x > 3.5), status: "numerical", tolerance: "order above 3.5", detail: `Observed orders ${ords(o)}.` });
    return out;
  }
  /** sin(nπX) and λ = n²π² in W'''' + λW'' = 0: the residual n⁴π⁴ − n²π²·n²π² is 0 exactly. */
  function bucklingModeCheck(n) {
    const w = [{ c: Q.ONE, p: 0, fn: "sin", k: Q.q(BigInt(n)) }];
    return N.tcollect([...N.tderivN(w, 4), ...N.tscale(N.tderivN(w, 2), Q.q(BigInt(n * n)), 2)]).length === 0;
  }
  function eulerStability(p, ctx) {
    const runs = [4, 8, 16, 32].map((n) => feEigen(n, "buckling"));
    const errs = runs.map((r) => relErr(r.values[0], PI2));
    const o = N.orders(errs, runs.map((r) => 1 / r.n));
    const lam = p.lambda;
    const lamExact = ctx?.point0?.lambda?.exact ?? null;
    const P = ctx?.reconstruct ? ctx.reconstruct("lambda", PI2) : null;
    const results = [
      { id: "r-st-lambda", kind: "stability", title: `The record's load gives λ = PL²/(EI) = ${lamExact ?? fmt(lam)}${lamExact && !/^-?\d+$/.test(lamExact) ? ` = ${fmt(lam)}` : ""}, that is ${fmt(lam / PI2, 5)} of the critical value.`, status: lamExact ? "exact" : "numerical", tolerance: lamExact ? null : "1e-12 relative", steps: ["s-st-eigen"], evidence: ["spec-8"] },
      { id: "r-st-critical", kind: "stability", title: `The critical eigenvalue of the pinned column is λ_cr = π² = ${fmt(PI2, 10)}, with the mode sin(πX)${P ? `: P_cr = ${fmt(Number(P.value))} N` : ""}. The straight column is ${lam < PI2 ? "stable" : "not stable"} at the record's load.`, status: "evidence", steps: ["s-st-eigen"], evidence: ["mit-ms-handout"] },
      { id: "r-st-modes", kind: "stability", title: "The modes sin(nπX) with λ = n²π² satisfy the equation and the four pinned conditions exactly (n = 1, 2, 3).", status: [1, 2, 3].every(bucklingModeCheck) ? "exact" : "unresolved", steps: ["s-st-eigen"], evidence: ["spec-11"] },
      { id: "r-st-fe", kind: "stability", title: `Hermite cubic elements give λ_cr = ${fmt(runs[3].values[0], 12)} on 32 elements; the error falls at the orders ${ords(o)}.`, status: errs[3] <= 1e-6 && o.every((x) => x > 3.5) ? "numerical" : "unresolved", tolerance: "1e-6 relative; order above 3.5", steps: ["s-st-eigen"], evidence: ["spec-14"] },
      { id: "r-st-amplitude", kind: "bifurcation", title: "Post-buckling: the linear eigenproblem gives the critical load and the shape of the mode with an arbitrary amplitude. It gives no deflection after buckling, and it cannot classify the branch.", status: "unresolved", steps: ["s-st-eigen"], evidence: ["spec-11"], next: "Open the example \"Nonlinear buckling: the elastica\": its nonlinear model gives the branch, its amplitude and its classification." },
    ];
    const finest = runs[3];
    return { family: "beams-and-columns", model: "euler-column", generic: true, point: { lambda: num(lam) }, concept: "linear static stability of the straight column: the neutral condition is the smallest eigenvalue of the buckling problem",
      results,
      figures: [{ id: "st-euler-modes", title: "Buckling modes from the element solution", x: { min: 0, max: 1, label: "X = x/L" }, y: { min: -1.1, max: 1.1, label: "W / max|W|" },
        series: [0, 1, 2].map((k) => ({ label: `mode ${k + 1}, λ/π² = ${fmt(finest.values[k] / PI2, 6)}`, pts: finest.shape(k) })), caption: "The first three modes on 32 elements, each scaled to 1. The linear model fixes each shape, but not its amplitude." }],
      tables: [{ title: "Mesh convergence of λ_cr", columns: ["Elements", "λ_cr", "Relative error"], rows: runs.map((r, i) => [String(r.n), fmt(r.values[0], 12), fmt(errs[i], 3)]) }],
      method: ["Normal form: W'''' + λW'' = 0 on 0 < X < 1 with W = W'' = 0 at both ends. Substitute W = sin(nπX): (nπ)⁴ − λ(nπ)² = 0, so λ = n²π²; the smallest is λ_cr = π².", "Element check: Hermite cubic elements give K v = λ G v (bending stiffness K, geometric stiffness G); a Cholesky factor of G and cyclic Jacobi rotations give the eigenvalues on 4, 8, 16 and 32 elements."] };
  }

  function beamImpl(decl) {
    const params = decl.domain.parameters;
    const evaluate = (p) => {
      if (!(p.lambda >= 0) || p.lambda >= PI2 * 0.999) return { ok: false, reason: "λ must lie in 0 ≤ λ < π²: at λ = π² the deflection has no bound." };
      const w = beamMid(p.lambda), w0 = 5 / 384;
      return { ok: true, values: { "err-beam": Math.abs(w0 - w) / w, "err-amp": Math.abs(w0 / (1 - p.lambda / PI2) - w) / w, ratio: Math.max(p.lambda, 1e-12) / PI2, mid: w } };
    };
    const steps = ["s-rm-asymptotic", "s-rm-map"];
    const layers = [
      approxLayer("beam", "Beam alone (λ = 0)", "err-beam", "|5/384 − W(½; λ)| ÷ W(½; λ) ≤ the tolerance", steps),
      approxLayer("amplification", "Amplification factor", "err-amp", "|(5/384)/(1 − λ/π²) − W(½; λ)| ÷ W(½; λ) ≤ the tolerance", steps),
      loadLayer("euler", "Stability of the straight beam", "ratio", "λ/π²: the axial load over the critical load of the pinned column", ["s-st-eigen"], ["spec-8", "mit-ms-handout"]),
    ];
    const approximations = [
      { id: "beam", label: "Beam alone", tex: "W(\\tfrac12)\\approx\\tfrac{5}{384}", limit: "λ → 0", why: "The axial load is small compared with the critical load.", error: "λ·61/(46080·W): first order in λ" },
      { id: "amplification", label: "Amplification factor", tex: "W(\\tfrac12)\\approx\\frac{5/384}{1-\\lambda/\\pi^{2}}", limit: "all λ < π²", why: "The first sine term of the deflection carries almost all of it.", error: "formal; the higher sine terms estimate it" },
    ];
    const inspect = (p, ctx) => {
      const w = beamMid(p.lambda);
      const qe = ctx.exact?.("q*L^4/(E*I)");
      return { ok: true, values: [{ id: "mid", tex: "W(\\tfrac12)", label: "midspan deflection wEI/(qL⁴)", value: num(w) }, { id: "amp", tex: "\\frac{W(\\frac12)}{5/384}", label: "amplification by the axial load", value: num(w / (5 / 384)) }],
        checks: [], reconstruction: qe ? [{ id: "w-mid", tex: "w(L/2)", label: "midspan deflection", value: num(w * qe.float), unit: "m" }] : [] };
    };
    const derived = (p) => [{ id: "amp", tex: "1/(1-\\lambda/\\pi^{2})", label: "amplification factor", value: num(1 / (1 - p.lambda / PI2)) }];
    const limits = (p) => [{ id: "small", label: "λ → 0: the beam alone", coupled: false, approx: "beam", note: "The deflection tends to 5/384.", points: range(21).map((i) => ({ ...p, lambda: 9.4 * (1 - i / 20) })) }];
    return { id: decl.id, params, axes: { x: "lambda", y: null }, approximations, layers, evaluate, limits, inspect, derived, constraints: () => [],
      analysis: () => ({ note: "The axial load amplifies the bending deflection; near λ = π² the deflection has no bound.",
        balance: { intro: "The bending term carries the load; the axial term adds the moment of the load over the deflection.",
          terms: [{ tex: "W''''", label: "bending", scale: "1", why: "W is scaled by qL⁴/(EI)." }, { tex: "\\lambda W''", label: "moment of the axial load", scale: "\\lambda", why: "λ = PL²/(EI)." }, { tex: "1", label: "transverse load", scale: "1", why: "The scale of W balances it with bending." }],
          balances: [{ title: "Bending carries the load", when: "\\lambda\\ll\\pi^{2}", derivation: "Drop λW'': W'''' = 1 gives W = (X − 2X³ + X⁴)/24.", reduced: "W''''=1", neglected: "the moment of the axial load", assumptions: ["λ ≪ π²."],
            residual: { tex: "\\lambda W''", order: "first order in λ", status: "exact", note: "The neglected term is λ times W'' of the reduced solution." } }],
          crossovers: [{ criterion: "\\lambda=\\pi^{2}", status: "exact", text: "At the critical load the axial term cancels the stiffness of the first sine mode." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: { limits: [{ parameter: "\\lambda\\to0", path: "λ → 0", coupled: false, kind: "Regular perturbation (formal)", fixed: "the pinned supports", setup: "W=W_0+\\lambda W_1+\\dots",
          orders: [{ n: 0, equation: "W_0''''=1", conditions: ["W_0=W_0''=0\\ \\text{at}\\ X=0,1"], result: "W_0=(X-2X^{3}+X^{4})/24" }, { n: 1, equation: "W_1''''=-W_0''", conditions: ["W_1=W_1''=0\\ \\text{at}\\ X=0,1"], result: "W_1(\\tfrac12)=\\tfrac{61}{46080}" }],
          orderLoss: "No loss of order: each order has the four conditions.", error: { formal: "The expansion is formal.", estimated: "The next term estimates the remainder.", proved: null }, validity: "λ well below π²." }],
          overlap: "The amplification factor holds over the whole range λ < π²; the beam alone only for a small λ.", gaps: "None below λ = π²." } }),
      acceptance: () => beamAcceptance(), stability: (p) => beamStability(p) };
  }
  function beamAcceptance() {
    const b = beamPolynomial();
    const fe = [2, 4, 8].map((n) => {
      const m = N.beamFE(n);
      const fixed = N.fixedDofs(n, "pinned", "pinned");
      const keep = range(m.N).filter((i) => !fixed.includes(i));
      const x = N.solve(N.reduce(m.K, keep), N.reduce(m.f, keep));
      const full = new Array(m.N).fill(0);
      keep.forEach((i, j) => { full[i] = x[j]; });
      return Math.max(...range(n + 1).map((i) => Math.abs(full[2 * i] - Q.toNumber(N.peval(b.W, Q.q(BigInt(i), BigInt(n)))))));
    });
    return [
      { id: "poly", title: "W = (X − 2X³ + X⁴)/24 satisfies W'''' = 1 and the four conditions", passed: b.ok, status: "exact", detail: "Rational polynomial arithmetic." },
      { id: "mid", title: "W(½) = 5/384", passed: Q.eq(b.mid, Q.q(5n, 384n)), status: "exact", detail: `The polynomial gives ${Q.str(b.mid)} (the classical 5qL⁴/(384EI)).` },
      { id: "fe", title: "Hermite elements give the exact nodal deflections", passed: Math.max(...fe) <= 1e-12, status: "numerical", tolerance: "1e-12 absolute in W", detail: `Largest nodal errors ${fe.map((e) => fmt(e, 2)).join(", ")} on 2, 4 and 8 elements.` },
      { id: "series", title: "The closed form agrees with its series near λ = 0", passed: Math.abs(beamMid(1.0001e-3) - (5 / 384 + (61 / 46080) * 1e-3)) <= 1e-8, status: "numerical", tolerance: "1e-8", detail: "W(½; λ) = 5/384 + 61λ/46080 + O(λ²)." },
    ];
  }
  function beamStability(p) {
    const lam = p.lambda;
    return { family: "beams-and-columns", model: "beam-column", generic: true, point: { lambda: num(lam) }, concept: "linear static stability of the straight beam under the axial load",
      results: [{ id: "r-st-beam", kind: "stability", title: `At λ = ${fmt(lam)} the axial load is ${fmt(lam / PI2, 4)} of the critical load π², so the straight beam is ${lam < PI2 ? "stable" : "not stable"}. The midspan deflection is ${fmt(beamMid(lam), 8)}, that is ${fmt(beamMid(lam) / (5 / 384), 6)} times the deflection without the axial load.`, status: "numerical", tolerance: "1e-12 relative", steps: ["s-st-eigen"], evidence: ["mit-ms-handout", "mit-ms-handout"] }],
      figures: [{ id: "st-beam-curve", title: "Deflection of the beam", x: { min: 0, max: 1, label: "X = x/L" }, y: { min: 0, max: Math.max(0.02, beamMid(lam) * 1.15), label: "W = wEI/(qL⁴)" },
        series: [{ label: "λ = 0", pts: beamCurve(0) }, ...(lam > 1e-6 ? [{ label: `λ = ${fmt(lam, 4)}`, pts: beamCurve(lam) }] : [])], caption: "The exact deflection without the axial load and at the record's load." }],
      tables: [], method: ["W'''' + λW'' = 1, W = W'' = 0 at X = 0 and 1. With V = W'': V'' + λV = 1, V(0) = V(1) = 0, so V = (1 − cos(√λ(X − ½))/cos(√λ/2))/λ, and W follows by two integrations."] };
  }

  function elasticaImpl(decl) {
    const params = decl.domain.parameters;
    const STEPS = 200;
    const evaluate = (p) => {
      if (!(p.lambda > 0) || !(p.ehat > 0)) return { ok: false, reason: "λ and ê must be positive." };
      const t = naturalTheta0(p.lambda, p.ehat, 120);
      if (t === null) return { ok: false, reason: "The shooting found no solution on the branch from the unloaded state." };
      const k = Math.sqrt(p.lambda);
      const lin = p.lambda < PI2 * 0.999 ? -p.ehat * k * Math.tan(k / 2) : null;
      const per = -perfectTheta0(p.lambda);
      return { ok: true, values: { "err-linear": lin === null ? BIG : Math.min(BIG, Math.abs(lin - t) / Math.abs(t)), "err-perfect": per === 0 ? 1 : Math.min(BIG, Math.abs(per - t) / Math.abs(t)), ratio: p.lambda / PI2 } };
    };
    const steps = ["s-st-branch", "s-rm-map"];
    const layers = [
      approxLayer("linear", "Linear (secant) theory", "err-linear", "|θ0_lin − θ0| ÷ |θ0| ≤ the tolerance, with θ0_lin = −ê√λ tan(√λ/2) and θ0 from the nonlinear shooting", steps, ["spec-8", "holmes-2019"]),
      approxLayer("perfect", "Perfect elastica (ê = 0)", "err-perfect", "|θ0(ê = 0) − θ0| ÷ |θ0| ≤ the tolerance: the eccentric column follows the buckled branch of the perfect one", steps, ["spec-8", "holmes-2019"]),
      { ...loadLayer("branch", "Branch point of the perfect column", "ratio", "λ/π²: the perfect column has a branch point at λ = π² (a supercritical pitchfork). With ê > 0 the branch point opens, and the branch from the unloaded state is smooth", ["s-st-branch", "s-st-amplitude"], ["spec-8", "holmes-2019"], "bifurcation", "numerical"),
        thresholds: () => ({ curves: [{ value: 1, label: "λ = π²: branch point of the perfect column" }], regions: [{ id: "below", label: "Below λ = π²: the perfect column stays straight", lo: 0, hi: 1 }, { id: "above", label: "Above λ = π²: the perfect column has a stable buckled branch", lo: 1, hi: null }] }) },
    ];
    const approximations = [
      { id: "linear", label: "Linear (secant) theory", tex: "\\theta_0\\approx-\\hat e\\sqrt{\\lambda}\\tan(\\sqrt{\\lambda}/2)", limit: "ê → 0 at λ < π²", why: "Small rotations: sin θ ≈ θ.", error: "formal; of order θ0²" },
      { id: "perfect", label: "Perfect elastica", tex: "\\lambda=4K(\\sin^{2}(\\theta_0/2))^{2}", limit: "ê → 0 at λ > π²", why: "The eccentricity is small compared with the deflection.", error: "formal; it falls with ê" },
    ];
    const inspect = (p, ctx) => {
      const t = naturalTheta0(p.lambda, p.ehat, STEPS);
      const fine = naturalTheta0(p.lambda, p.ehat, 2 * STEPS);
      return { ok: t !== null, values: [{ id: "theta0", tex: "\\theta_0", label: "end rotation (rad)", value: num(t) }, { id: "deg", tex: "\\theta_0", label: "end rotation (degrees)", value: num((t * 180) / PI) }],
        checks: t !== null && fine !== null ? [{ id: "steps", title: "Doubling the RK4 steps changes θ0 by less than 1e-8", passed: Math.abs(t - fine) <= 1e-8, status: "numerical", tolerance: "1e-8", detail: `${fmt(t, 12)} with ${STEPS} steps and ${fmt(fine, 12)} with ${2 * STEPS}.` }] : [],
        reconstruction: ctx.reconstruct ? ["lambda", "ehat"].map((k) => ctx.reconstruct(k, p[k])).filter(Boolean) : [] };
    };
    const derived = (p) => [{ id: "ratio", tex: "\\lambda/\\pi^{2}", label: "load over the critical load of the perfect column", value: num(p.lambda / PI2) }];
    const limits = (p) => [{ id: "small-e", label: `ê → 0 at λ = ${fmt(p.lambda, 4)}`, coupled: false, approx: p.lambda < PI2 ? "linear" : "perfect", note: "The eccentric branch tends to the straight state below π², and to the buckled branch above it.", points: range(21).map((i) => ({ ...p, ehat: 0.1 * 1e-3 ** (i / 20) })) }];
    return { id: decl.id, params, axes: { x: "lambda", y: "ehat" }, approximations, layers, evaluate, limits, inspect, derived, constraints: () => [],
      analysis: () => ({ note: "Below π² the eccentric column bends a little, as the linear theory says; above π² it follows the buckled branch of the perfect column.",
        balance: noBalance("Dominant balance does not apply: bending and the moment of the load balance at every point of the branch.", [{ tex: "\\theta''", label: "bending", scale: "\\theta_0", why: "S = s/L." }, { tex: "\\lambda\\sin\\theta", label: "moment of the load", scale: "\\lambda\\theta_0", why: "λ = PL²/(EI)." }]),
        asymptotic: { limits: [{ parameter: "\\theta_0\\to0", path: "along the perfect branch", coupled: false, kind: "Regular perturbation (exact series)", fixed: "ê = 0", setup: "\\lambda/\\pi^{2}=1+c_2\\theta_0^{2}+c_4\\theta_0^{4}+\\dots",
          orders: [{ n: 0, equation: "\\theta_1''+\\pi^{2}\\theta_1=0", conditions: ["\\theta_1'=0\\ \\text{at}\\ S=0,1"], result: "\\theta_1=\\cos\\pi S,\\ \\lambda_0=\\pi^{2}" }, { n: 2, equation: "K(m)=\\tfrac{\\pi}{2}\\sum((1/2)_k/k!)^{2}m^{k},\\ m=\\sin^{2}(\\theta_0/2)", conditions: [], result: "c_2=1/8" }],
          orderLoss: "No loss of order.", error: { formal: "The series converges for θ0 < π.", estimated: "The next coefficient estimates the remainder.", proved: null }, validity: "Small θ0 near the branch point." },
          { parameter: "\\hat e\\to0", path: "at fixed λ < π²", coupled: false, kind: "Regular perturbation (formal)", fixed: "λ", setup: "\\theta=\\hat e\\,\\theta_1+\\dots", orders: [{ n: 1, equation: "\\theta_1''+\\lambda\\theta_1=0", conditions: ["\\theta_1'=\\lambda\\ \\text{at}\\ S=0,1"], result: "\\theta_1(0)=-\\sqrt{\\lambda}\\tan(\\sqrt{\\lambda}/2)" }],
            orderLoss: "No loss of order.", error: { formal: "The expansion is formal.", estimated: "θ0² estimates the remainder.", proved: null }, validity: "Small ê, λ not near π²." }],
          overlap: "Near λ = π² neither the linear theory nor the perfect branch holds for a small ê.", gaps: "A band around λ = π² whose width falls with ê." } }),
      acceptance: (ctx) => elasticaAcceptance(ctx), stability: (p, ctx) => elasticaStability(p, ctx) };
  }
  function elasticaRefs(ctx) { return ctx?.structures?.elastica ?? null; }
  function elasticaAcceptance(ctx) {
    const refs = elasticaRefs(ctx);
    const out = [];
    const series = elasticaSeries(3);
    out.push({ id: "series", title: "The series coefficient of θ0² is exactly 1/8", passed: series[1] === "1/8" && (!refs || series.join(",") === refs.series.join(",")), status: "exact", detail: `λ/π² = 1 + ${series[1]}θ0² + ${series[2]}θ0⁴ + ${series[3]}θ0⁶ + …, in rational series arithmetic${refs ? "; SymPy's series of K gives the same four coefficients" : ""}.` });
    const tau = (mu) => shoot(0, mu * PI2, 0, 200).Rt;
    let a = 0.9, b = 1.1;
    for (let i = 0; i < 60; i++) { const c = (a + b) / 2; if (tau(a) * tau(c) <= 0) b = c; else a = c; }
    out.push({ id: "bp", title: "The first branch point is λ = π²", passed: Math.abs((a + b) / 2 - 1) <= 1e-6, status: "numerical", tolerance: "1e-6 in λ/π²", detail: `Bisection of ∂R/∂θ0 on θ = 0 gives λ/π² = ${fmt((a + b) / 2, 12)}.` });
    if (refs) {
      const errs = refs.perfect.map((r) => relErr(lambdaAt((r.theta0deg * PI) / 180, 0, 200, r.lambda), r.lambda));
      out.push({ id: "reference", title: `Shooting agrees with 4K(sin²(θ0/2))² at ${refs.perfect.length} end rotations`, passed: Math.max(...errs) <= 1e-7, status: "numerical", tolerance: "1e-7 relative", detail: `Largest error ${fmt(Math.max(...errs), 2)}; mpmath ${refs.versions.mpmath}.` });
      const ie = refs.imperfect.map((r) => Math.abs(naturalTheta0(r.lambda, r.ehat, 200) - r.theta0));
      out.push({ id: "imperfect", title: `The eccentric branch agrees with SciPy solve_bvp at ${refs.imperfect.length} loads`, passed: Math.max(...ie) <= 1e-6, status: "numerical", tolerance: "1e-6 in θ0", detail: `Largest difference ${fmt(Math.max(...ie), 2)} rad; SciPy ${refs.versions.scipy}.` });
    }
    return out;
  }
  function elasticaStability(p, ctx) {
    const steps = 200, sv = 50, lam = p.lambda, ehat = p.ehat;
    const muMax = 3.5;
    // Branch points on θ = 0.
    const tau = (mu) => shoot(0, mu * PI2, 0, steps).Rt;
    const bps = [];
    const grid = range(Math.round(muMax * 40) + 1).map((i) => i / 40 + 1e-9);
    for (let i = 1; i < grid.length; i++) {
      let a = grid[i - 1], b = grid[i], fa = tau(a);
      if (fa * tau(b) > 0) continue;
      for (let k = 0; k < 60; k++) { const c = (a + b) / 2, fc = tau(c); if (fa * fc <= 0) b = c; else { a = c; fa = fc; } }
      bps.push((a + b) / 2);
    }
    const opts = { thetaMax: 2.8, muMax };
    const up = continuation([0.02, lambdaAt(0.02, 0, steps, PI2) / PI2], [1, 0], 0, steps, opts);
    const down = continuation([-0.02, lambdaAt(-0.02, 0, steps, PI2) / PI2], [-1, 0], 0, steps, opts);
    const series = elasticaSeries(3);
    const fit = [0.05, 0.1].map((t) => (lambdaAt(t, 0, steps, PI2) / PI2 - 1) / (t * t));
    const c2 = fit[0] + (fit[0] - fit[1]) / 3;
    const below = secondVariation(new Array(sv + 1).fill(0), 0.5 * PI2);
    const straightAt = secondVariation(new Array(sv + 1).fill(0), lam);
    const tPerf = lam > PI2 ? theta0At(lam, 0, steps, perfectTheta0(lam)) : null;
    const buckled = tPerf !== null ? secondVariation(nodesOf(tPerf, lam, 0, sv), lam) : null;
    const mirror = tPerf !== null ? Math.abs(theta0At(lam, 0, steps, -tPerf) + tPerf) : null;
    let imp = null;
    if (ehat > 0) {
      const lam0 = 0.1 * PI2;
      const start = (e) => naturalTheta0(lam0, e, steps) ?? -e;
      const plus = continuation([start(ehat), 0.1], [0, 1], ehat, steps, opts);
      const minus = continuation([-start(ehat), 0.1], [0, 1], -ehat, steps, opts);
      const tRec = naturalTheta0(lam, ehat, steps);
      const tMir = tRec !== null ? theta0At(lam, -ehat, steps, -tRec) : null;
      imp = { plus: plus.pts, minus: minus.pts, newton: plus.newton + minus.newton, monotone: plus.pts.every((q, i) => !i || q.mu > plus.pts[i - 1].mu), minGrad: Math.min(...plus.pts.map((q) => q.grad)), tRec, mirror: tRec !== null && tMir !== null ? Math.abs(tMir + tRec) : null,
        stable: tRec !== null ? secondVariation(nodesOf(tRec, lam, ehat, sv), lam) : null };
    }
    const deg = (t) => (t * 180) / PI;
    const results = [
      { id: "r-st-bp", kind: "bifurcation", title: `The straight state θ = 0 has branch points at λ/π² = ${bps.map((x) => fmt(x, 9)).join(" and ")} in the searched range 0 < λ/π² ≤ ${muMax}.`, status: Math.abs(bps[0] - 1) <= 1e-6 ? "numerical" : "unresolved", tolerance: "1e-6 against 1", steps: ["s-st-branch"], evidence: ["spec-8"] },
      { id: "r-st-symmetry", kind: "bifurcation", title: "The perfect model is symmetric under θ → −θ: θ'' and sin θ are odd in θ, and so are the end conditions θ' = 0.", status: "exact", steps: ["s-st-amplitude"], evidence: ["spec-8"] },
      { id: "r-st-series", kind: "bifurcation", title: `The exact series is λ/π² = 1 + ${series[1]}·θ0² + ${series[2]}·θ0⁴ + …. The coefficient 1/8 is positive, so the buckled branch rises on both sides of λ = π²: a supercritical pitchfork. The computed branch gives ${fmt(c2, 8)}.`,
        status: series[1] === "1/8" && Math.abs(c2 - 0.125) <= 1e-4 ? "exact" : "unresolved", steps: ["s-st-amplitude"], evidence: ["holmes-2019", "dlmf-19-5", "yong-mahadevan-2025"] },
      { id: "r-st-branch", kind: "bifurcation", title: `Pseudo-arclength continuation followed the buckled branch from λ = π² in both directions: ${up.pts.length + down.pts.length} points, ${up.newton + down.newton} Newton steps, up to |θ0| = ${fmt(deg(opts.thetaMax), 4)}°.`, status: "numerical", tolerance: "Newton 1e-12", steps: ["s-st-branch"], evidence: ["spec-8"] },
      { id: "r-st-stable", kind: "stability", title: `Second variation with the end constraint (${sv} intervals): the straight state has ${below.negative} unstable direction at λ = π²/2 (smallest eigenvalue ${fmt(below.smallest[0], 6)}, exact π² − λ = ${fmt(PI2 / 2, 6)}) and ${straightAt.negative} at the record's λ = ${fmt(lam, 6)}.${buckled ? ` The buckled shape there (θ0 = ${fmt(deg(tPerf), 5)}°) has ${buckled.negative}: it is stable.` : ""}`,
        status: "numerical", tolerance: "the sign of each eigenvalue; 5e-3 relative against π² − λ", steps: ["s-st-eigen"], evidence: ["spec-8"] },
    ];
    if (mirror !== null) results.push({ id: "r-st-mirror", kind: "bifurcation", title: `At the record's load the mirror shape θ0 = −${fmt(deg(tPerf), 5)}° is also a solution (difference ${fmt(mirror, 2)} rad).`, status: mirror <= 1e-10 ? "numerical" : "unresolved", tolerance: "1e-10", steps: ["s-st-branch"], evidence: ["spec-8"] });
    if (imp) {
      results.push({ id: "r-st-imperfect", kind: "bifurcation", title: `With ê = ${fmt(ehat)} the branch from the unloaded state has no branch point and no limit point: λ increases at every step, and the smallest |∇R| is ${fmt(imp.minGrad, 3)}. At the record's load θ0 = ${fmt(deg(imp.tRec), 6)}°${imp.stable ? `, with ${imp.stable.negative} unstable direction` : ""}.`,
        status: imp.monotone && imp.minGrad > 1e-6 ? "numerical" : "unresolved", tolerance: "|∇R| > 1e-6", steps: ["s-st-branch"], evidence: ["spec-8"] });
      if (imp.mirror !== null) results.push({ id: "r-st-imp-mirror", kind: "bifurcation", title: `The branch for −ê is the mirror image of the branch for ê (difference ${fmt(imp.mirror, 2)} rad at the record's load).`, status: imp.mirror <= 1e-10 ? "numerical" : "unresolved", tolerance: "1e-10", steps: ["s-st-branch"], evidence: ["spec-8"] });
    }
    results.push({ id: "r-st-coverage", kind: "bifurcation", title: "Not searched: the branches from the higher branch points, disconnected branches of the eccentric column, and three-dimensional or twisting shapes. The calculation makes no claim of exhaustive branch discovery.", status: "unresolved", steps: ["s-st-branch"], evidence: ["farrell-2016"], next: "Other branches need a separate search, such as deflated continuation." });
    const pts = (list) => list.map((q) => [num(deg(q.theta0)), num(q.mu)]);
    const figs = [{ id: "st-elastica-branches", title: "Branches of the elastica", x: { min: -170, max: 170, label: "end rotation θ0 (degrees)" }, y: { min: 0, max: muMax, label: "λ/π²" },
      series: [{ label: "θ = 0, stable", pts: [[0, 0], [0, 1]] }, { label: "θ = 0, not stable", pts: [[0, 1], [0, muMax]], dash: "6 4" }, { label: "perfect, buckled (stable)", pts: [...pts(down.pts).reverse(), ...pts(up.pts)] },
        ...(imp ? [{ label: `ê = ${fmt(ehat)}`, pts: pts(imp.plus) }, { label: `ê = −${fmt(ehat)}`, pts: pts(imp.minus) }] : [])],
      points: [{ x: 0, y: 1, shape: "diamond", label: "branch point λ = π²" }, ...(imp && imp.tRec !== null ? [{ x: num(deg(imp.tRec)), y: num(lam / PI2), shape: "square", label: "record" }] : [])],
      caption: "Dashed: the straight state above π² is not stable. The perfect column bifurcates at λ = π²; the eccentric load removes the branch point." },
    shapesFigure(steps)];
    return { family: "nonlinear-buckling", model: "elastica", generic: true, point: { lambda: num(lam), ehat: num(ehat) }, concept: "static stability under the dead load, from the second variation of the energy with the end constraint; bifurcation of the perfect column at λ = π²",
      results, figures: figs, tables: [{ title: "Branch points and the series", columns: ["Item", "Value"], rows: [["first branch point λ/π²", fmt(bps[0], 12)], ["series c₂ (exact)", series[1]], ["series c₄ (exact)", series[2]], ["c₂ from the branch", fmt(c2, 10)]] }],
      method: ["Shooting: θ(0) = θ0, θ'(0) = λê; RK4 with 200 steps integrates θ and the variational equations ∂θ/∂θ0 and ∂θ/∂λ; R = θ'(1) − λê.", "Pseudo-arclength continuation in (θ0, λ/π²) with Newton's method to 1e-12; the branch points are sign changes of ∂R/∂θ0 on θ = 0, found by bisection.", "Stability: the eigenvalues of ∫ η'² − λ cos θ η² dS with ∫ cos θ η dS = 0, on 50 linear elements, after a Householder projection."] };
  }

  function oscillatorImpl(decl) {
    const params = decl.domain.parameters;
    const evaluate = (p) => {
      if (!(p.r > 0) || !(p.zeta > 0)) return { ok: false, reason: "r and ζ must be positive." };
      const h = H(p.r, p.zeta);
      return { ok: true, values: { "err-static": Math.abs(h - 1), "err-inertia": Math.abs(p.r * p.r * h - 1), "err-undamped": Math.min(BIG, Math.abs(1 / Math.abs(1 - p.r * p.r) - h) / h), "bal-inertia": p.r * p.r, decay: p.zeta } };
    };
    const steps = ["s-rm-asymptotic", "s-rm-map"];
    const layers = [
      approxLayer("static", "Quasi-static response", "err-static", "||H| − 1| ≤ the tolerance: the spring carries the force", steps, ["spec-8", "uofa-forced"]),
      approxLayer("inertia", "Inertia-controlled response", "err-inertia", "|r²|H| − 1| ≤ the tolerance: the inertia carries the force", steps, ["spec-8", "uofa-forced"]),
      approxLayer("undamped", "Undamped response", "err-undamped", "|1/|1 − r²| − |H|| ÷ |H| ≤ the tolerance: the damper is negligible", steps, ["spec-8", "uofa-forced"]),
      balanceLayer("inertia-stiffness", "Inertia against stiffness", "bal-inertia", "r² = mΩ²/k: the inertia force against the spring force at the forcing frequency", "The spring controls the motion", "The inertia controls the motion", steps, ["spec-8", "uofa-forced"]),
      { id: "rest", kind: "stability", boundary: "stability", title: "Stability of the rest state", measure: "decay", scale: "log", status: "exact", steps: ["s-st-jacobian"], evidence: ["spec-8"],
        criterion: "The roots of s² + 2ζs + 1 have the real part −ζ < 0 for every ζ > 0 (exact), so every point of the domain is asymptotically stable",
        thresholds: () => ({ curves: [], regions: [{ id: "stable", label: "Asymptotically stable: every free motion decays", lo: 0, hi: null }] }) },
    ];
    const approximations = [
      { id: "static", label: "Quasi-static response", tex: "|H|\\approx1", limit: "r → 0", why: "The spring force is much larger than the inertia and damper forces.", error: "of order r²" },
      { id: "inertia", label: "Inertia-controlled response", tex: "|H|\\approx1/r^{2}", limit: "r → ∞", why: "The inertia force is much larger than the spring and damper forces.", error: "of order 1/r²" },
      { id: "undamped", label: "Undamped response", tex: "|H|\\approx1/|1-r^{2}|", limit: "ζ → 0 away from r = 1", why: "The damper force is small except near resonance.", error: "of order (ζr/(1 − r²))²" },
    ];
    const inspect = (p, ctx) => {
      const h = H(p.r, p.zeta);
      const F = ctx.role?.("F_0"), k = ctx.role?.("k");
      return { ok: true, values: [{ id: "H", tex: "|H|", label: "amplitude ratio X_0k/F_0", value: num(h) }, { id: "phase", tex: "\\varphi", label: "phase lag (degrees)", value: num((Math.atan2(2 * p.zeta * p.r, 1 - p.r * p.r) * 180) / PI) }],
        checks: [], reconstruction: [...(ctx.reconstruct ? ["r", "zeta"].map((x) => ctx.reconstruct(x, p[x])).filter(Boolean) : []), ...(F && k ? [{ id: "X0", tex: "X_0", label: "steady amplitude", value: num((h * F.float) / k.float), unit: "m" }] : [])] };
    };
    const derived = (p) => [{ id: "peak", tex: "r_p=\\sqrt{1-2\\zeta^{2}}", label: "frequency ratio of the peak", value: p.zeta < Math.SQRT1_2 ? num(Math.sqrt(1 - 2 * p.zeta * p.zeta)) : null }, { id: "Hmax", tex: "|H|_{\\max}", label: "peak amplitude ratio", value: p.zeta < Math.SQRT1_2 ? num(1 / (2 * p.zeta * Math.sqrt(1 - p.zeta * p.zeta))) : null }].filter((d) => d.value !== null);
    const limits = (p) => [{ id: "low", label: `r → 0 at ζ = ${fmt(p.zeta, 4)}`, coupled: false, approx: "static", note: "The spring carries the force.", points: range(21).map((i) => ({ ...p, r: p.r * (0.05 / p.r) ** (i / 20) })) },
      { id: "high", label: `r → ∞ at ζ = ${fmt(p.zeta, 4)}`, coupled: false, approx: "inertia", note: "The inertia carries the force.", points: range(21).map((i) => ({ ...p, r: p.r * (20 / p.r) ** (i / 20) })) }];
    return { id: decl.id, params, axes: { x: "r", y: "zeta" }, approximations, layers, evaluate, limits, inspect, derived, constraints: (p) => (p.zeta >= Math.SQRT1_2 ? ["ζ ≥ 1/√2: the response has no peak above r = 0."] : []),
      analysis: () => ({ note: "Three forces balance the harmonic force: the spring, the damper and the inertia.",
        balance: { intro: "In U'' + 2ζU' + U = cos rτ the steady terms have the sizes r²|H|, 2ζr|H| and |H|.",
          terms: [{ tex: "U''", label: "inertia", scale: "r^{2}|H|", why: "Two time derivatives at the frequency r." }, { tex: "2\\zeta U'", label: "damper", scale: "2\\zeta r|H|", why: "One time derivative." }, { tex: "U", label: "spring", scale: "|H|", why: "U is scaled by F_0/k." }],
          balances: [{ title: "Spring against force", when: "r\\ll1", derivation: "Drop U'' and 2ζU'.", reduced: "U=\\cos r\\tau", neglected: "inertia and damping", assumptions: ["r ≪ 1 and ζr ≪ 1."], residual: { tex: "r^{2}", order: "second order in r", status: "exact", note: "The neglected inertia term." } },
            { title: "Inertia against force", when: "r\\gg1", derivation: "Drop U and 2ζU'.", reduced: "U''=\\cos r\\tau", neglected: "spring and damping", assumptions: ["r ≫ 1 and r ≫ ζ."], residual: { tex: "1/r^{2}", order: "second order in 1/r", status: "exact", note: "The neglected spring term." } }],
          crossovers: [{ criterion: "r=1", status: "exact", text: "Inertia equals stiffness at resonance; there the damper alone balances the force." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: { limits: [{ parameter: "r\\to0", path: "at fixed ζ", coupled: false, kind: "Regular perturbation (formal)", fixed: "ζ", setup: "|H|=1+(1-2\\zeta^{2})r^{2}+\\dots", orders: [{ n: 0, equation: "U=\\cos r\\tau", conditions: [], result: "|H|=1" }], orderLoss: "None.", error: { formal: "Formal.", estimated: "r² estimates it.", proved: null }, validity: "r ≪ 1." },
          { parameter: "r\\to\\infty", path: "at fixed ζ", coupled: false, kind: "Regular perturbation (formal)", fixed: "ζ", setup: "|H|=r^{-2}(1+\\dots)", orders: [{ n: 0, equation: "U''=\\cos r\\tau", conditions: [], result: "|H|=1/r^{2}" }], orderLoss: "The reduced equation keeps the order.", error: { formal: "Formal.", estimated: "1/r² estimates it.", proved: null }, validity: "r ≫ 1." }],
          overlap: "The two limits do not overlap: near r = 1 only the full response holds.", gaps: "A band around r = 1 whose width grows with ζ." } }),
      acceptance: (ctx) => oscillatorAcceptance(ctx), stability: (p, ctx) => oscillatorStability(p, ctx) };
  }
  /** ζ and r of the record, exact when √(km) and √(k/m) are rational. */
  function oscillatorExactOf(ctx) {
    const m = qOf(ctx?.role?.("m")), k = qOf(ctx?.role?.("k")), c = qOf(ctx?.role?.("c")), W = qOf(ctx?.role?.("Omega"));
    if (!m || !k || !c || !W) return null;
    const km = qsqrt(Q.mul(k, m)), wn = qsqrt(Q.div(k, m));
    if (!km || !wn) return null;
    return { zeta: Q.div(c, Q.mul(Q.q(2n), km)), r: Q.div(W, wn), wn };
  }
  function oscillatorAcceptance(ctx) {
    const ex = oscillatorExactOf(ctx);
    const out = [];
    const z = ex ? Q.toNumber(ex.zeta) : ctx?.point0?.zeta?.value, r = ex ? Q.toNumber(ex.r) : ctx?.point0?.r?.value;
    if (ex) {
      const e = oscillatorExact(ex.zeta, ex.r);
      out.push({ id: "particular", title: `X = A cos rτ + B sin rτ with A = ${e.A} and B = ${e.B} satisfies the equation`, passed: e.particular, status: "exact", detail: `ζ = ${Q.str(ex.zeta)}, r = ${Q.str(ex.r)}; the cosine part of the residual is 1 and the sine part is 0.` });
      out.push({ id: "energy", title: "The work of the force in one period equals the energy that the damper removes", passed: e.energy, status: "exact", detail: "B = 2ζr(A² + B²) in rationals." });
    }
    if (z > 0 && r > 0) {
      const sim = oscillatorRK4(r, z);
      const A0 = (1 - r * r) * H(r, z) ** 2, B0 = 2 * z * r * H(r, z) ** 2;
      const err = Math.max(Math.abs(sim.A - A0), Math.abs(sim.B - B0));
      out.push({ id: "rk4", title: "RK4 from rest reaches the same steady motion", passed: err <= 1e-6, status: "numerical", tolerance: "1e-6 absolute in A and B", detail: `${sim.periods} periods of ${sim.per} steps; largest difference ${fmt(err, 2)}.` });
      out.push({ id: "rk4-energy", title: "In the last simulated period the work in equals the energy removed", passed: relErr(sim.wd, sim.win) <= 1e-6, status: "numerical", tolerance: "1e-6 relative", detail: `${fmt(sim.win, 10)} and ${fmt(sim.wd, 10)}.` });
    }
    return out;
  }
  function oscillatorStability(p, ctx) {
    const ex = oscillatorExactOf(ctx);
    const z = p.zeta, r = p.r;
    const sim = oscillatorRK4(r, z);
    const e = ex ? oscillatorExact(ex.zeta, ex.r) : null;
    const results = [
      { id: "r-st-roots", kind: "stability", title: `The free motion has the roots s = −ζ ± i√(1 − ζ²) of s² + 2ζs + 1 = 0, with ζ = ${ex ? Q.str(ex.zeta) : fmt(z)}. Their real part −ζ is negative, so the rest state is asymptotically stable.`, status: ex ? "exact" : "numerical", tolerance: ex ? null : "1e-12", steps: ["s-st-jacobian"], evidence: ["spec-8", "uofa-forced"] },
      { id: "r-st-response", kind: "stability", title: `The steady amplitude ratio at r = ${ex ? Q.str(ex.r) : fmt(r)} is |H| = ${fmt(H(r, z), 8)}${e ? ` (|H|² = ${e.H2} exactly)` : ""}, with the phase lag ${fmt((Math.atan2(2 * z * r, 1 - r * r) * 180) / PI, 6)}°.`, status: e ? "exact" : "numerical", tolerance: e ? null : "1e-12", steps: ["s-st-equilibrium"], evidence: ["uofa-forced"] },
      ...(e?.peak ? [{ id: "r-st-peak", kind: "stability", title: `The peak is at r² = 1 − 2ζ² = ${e.peak.r2}, with |H|² = 1/(4ζ²(1 − ζ²)) = ${e.peak.H2}.`, status: "exact", steps: ["s-st-equilibrium"], evidence: ["uofa-forced"] }] : []),
    ];
    const curve = range(241).map((i) => { const rr = 0.02 + (i / 240) * 2.98; return [num(rr), num(H(rr, z))]; });
    return { family: "vibration", model: "damped-oscillator", generic: true, point: { r: num(r), zeta: num(z) }, concept: "linear asymptotic stability of the rest state, from the roots of the characteristic equation",
      results, figures: [{ id: "st-osc-response", title: "Frequency response", x: { min: 0, max: 3, label: "r = Ω/ω_n" }, y: { min: 0, max: Math.min(30, Math.max(3, 1.1 / (2 * z))), label: "|H|" },
        series: [{ label: `ζ = ${fmt(z, 4)}`, pts: curve }, { label: "spring limit 1", pts: [[0, 1], [3, 1]], dash: "6 4" }, { label: "inertia limit 1/r²", pts: range(60).map((i) => { const rr = 1.2 + i * 0.03; return [num(rr), num(1 / (rr * rr))]; }), dash: "2 3" }],
        points: [{ x: num(r), y: num(H(r, z)), shape: "square", label: "record" }], caption: "The amplitude ratio of the steady motion, with the two limits of the dominant balance. The square is the record's forcing frequency." },
      { id: "st-osc-start", title: "Start from rest", x: { min: 0, max: sim.early.at(-1)[0], label: "τ = ω_n t" }, y: { min: -1.2 * Math.max(...sim.early.map((q) => Math.abs(q[1]))), max: 1.2 * Math.max(...sim.early.map((q) => Math.abs(q[1]))), label: "U = uk/F_0" },
        series: [{ label: "RK4", pts: sim.early }], caption: "The first six forcing periods from rest: the transient decays as e^{−ζτ}." }],
      tables: [], method: ["Steady solution X = A cos rτ + B sin rτ with A = (1 − r²)/Δ and B = 2ζr/Δ, Δ = (1 − r²)² + (2ζr)².", `RK4 from rest with ${sim.per} steps in each period, over ${sim.periods} periods, until the transient is below 1e-10.`] };
  }

  function modesImpl(decl) {
    const params = decl.domain.parameters;
    const evaluate = (p) => {
      if (!(p.lambda >= 0)) return { ok: false, reason: "λ must not be negative." };
      const o2 = PI4 - p.lambda * PI2;
      return { ok: true, values: { ratio: Math.max(p.lambda, 1e-12) / PI2, "err-unloaded": o2 > 0 ? Math.min(BIG, Math.abs(PI2 - Math.sqrt(o2)) / Math.sqrt(o2)) : BIG } };
    };
    const layers = [
      approxLayer("unloaded", "Unloaded frequency", "err-unloaded", "|π² − Ω₁(λ)| ÷ Ω₁(λ) ≤ the tolerance, with Ω₁² = π⁴ − λπ²", ["s-rm-asymptotic"], ["spec-8", "mit-1620-unit23"]),
      loadLayer("frequency", "Stability by the first frequency", "ratio", "λ/π²: Ω₁² = π⁴ − λπ² is positive below 1, so the straight beam is stable; Ω₁ = 0 at the Euler load", ["s-st-eigen"], ["spec-8", "mit-ms-handout"]),
    ];
    const approximations = [{ id: "unloaded", label: "Unloaded frequency", tex: "\\Omega_1\\approx\\pi^{2}", limit: "λ → 0", why: "The axial load is small compared with the critical load.", error: "λ/(2π²) to first order" }];
    const inspect = (p, ctx) => {
      const o2 = PI4 - p.lambda * PI2;
      const sc = ctx.exact?.("E*I/(m_l*L^4)");
      return { ok: true, values: [{ id: "O1", tex: "\\Omega_1^{2}", label: "first eigenvalue π⁴ − λπ²", value: num(o2) }], checks: [],
        reconstruction: sc && o2 > 0 ? [{ id: "f1", tex: "f_1", label: "first natural frequency", value: num(Math.sqrt(o2 * sc.float) / (2 * PI)), unit: "Hz" }] : [] };
    };
    return { id: decl.id, params, axes: { x: "lambda", y: null }, approximations, layers, evaluate, limits: () => [], inspect, derived: (p) => [{ id: "O1", tex: "\\Omega_1^{2}=\\pi^{4}-\\lambda\\pi^{2}", label: "first eigenvalue", value: num(PI4 - p.lambda * PI2) }], constraints: () => [],
      analysis: () => ({ note: "The axial compression lowers every frequency; the first one reaches 0 at the Euler load.",
        balance: noBalance("Dominant balance does not apply: bending, the axial load and inertia balance together in every mode.", [{ tex: "Y''''", label: "bending", scale: "(n\\pi)^{4}", why: "Mode n has the wavenumber nπ." }, { tex: "\\lambda Y''", label: "axial load", scale: "\\lambda(n\\pi)^{2}", why: "λ = PL²/(EI)." }, { tex: "\\Omega^{2}Y", label: "inertia", scale: "\\Omega^{2}", why: "Ω² = m_lω²L⁴/(EI)." }]),
        asymptotic: { limits: [{ parameter: "\\lambda\\to0", path: "at fixed mode n", coupled: false, kind: "Regular perturbation (exact here)", fixed: "n", setup: "\\Omega_n^{2}=(n\\pi)^{4}-\\lambda(n\\pi)^{2}", orders: [{ n: 0, equation: "Y''''=\\Omega^{2}Y", conditions: ["Y=Y''=0\\ \\text{at}\\ X=0,1"], result: "\\Omega_n=(n\\pi)^{2}" }], orderLoss: "None.", error: { formal: "The relation is exact for pinned ends.", estimated: null, proved: "exact" }, validity: "λ < n²π² for a real frequency of mode n." }],
          overlap: "The unloaded frequency holds while λ ≪ π².", gaps: "None." } }),
      acceptance: (ctx) => modesAcceptance(ctx), stability: (p, ctx) => modesStability(p, ctx) };
  }
  function modesAcceptance(ctx) {
    const runs = [2, 4, 8, 16, 32].map((n) => feEigen(n, "vibration"));
    const exact = [1, 2, 3].map((k) => (k * PI) ** 4);
    const errs = runs.map((r) => relErr(r.values[0], exact[0]));
    const o = N.orders(errs.slice(1), runs.slice(1).map((r) => 1 / r.n));
    const out = [1, 2, 3].map((k) => ({ id: `mode-${k}`, title: `sin(${k}πX) is a mode with Ω² = (${k}π)⁴ − λ(${k}π)²`, passed: sineModeCheck(k, Q.ZERO) && sineModeCheck(k, Q.q(3n)), status: "exact", detail: "Checked for λ = 0 and λ = 3 in rational multiples of powers of π." }));
    out.push({ id: "fe", title: "Hermite elements (32) give the first three eigenvalues", passed: [0, 1, 2].every((k) => relErr(runs[4].values[k], exact[k]) <= 1e-4), status: "numerical", tolerance: "1e-4 relative", detail: `Errors ${[0, 1, 2].map((k) => fmt(relErr(runs[4].values[k], exact[k]), 2)).join(", ")}.` });
    out.push({ id: "order", title: "The element error falls at an order above 3.5", passed: o.every((x) => x !== null && x > 3.5), status: "numerical", tolerance: "order above 3.5", detail: `Observed orders ${ords(o)} on 4, 8, 16 and 32 elements.` });
    const ref = ctx?.structures?.modes;
    if (ref) { const e8 = Math.max(...ref.scipy8.slice(0, 3).map((v, k) => relErr(runs[2].values[k], v))); out.push({ id: "scipy", title: "The 8-element eigenvalues agree with SciPy eigh", passed: e8 <= 1e-10, status: "numerical", tolerance: "1e-10 relative", detail: `Largest difference ${fmt(e8, 2)}; SciPy ${ref.versions.scipy}.` }); }
    return out;
  }
  function modesStability(p, ctx) {
    const lam = p.lambda;
    const runs = [2, 4, 8, 16, 32].map((n) => feEigen(n, "vibration", lam));
    const exact = [1, 2, 3].map((k) => (k * PI) ** 4 - lam * (k * PI) ** 2);
    const sc = ctx?.exact?.("E*I/(m_l*L^4)");
    const f = exact.map((o) => (sc && o > 0 ? Math.sqrt(o * sc.float) / (2 * PI) : null));
    const fin = runs[4];
    return { family: "vibration", model: "beam-modes", generic: true, point: { lambda: num(lam) }, concept: "linear stability of the straight beam from the sign of its first eigenvalue Ω₁²",
      results: [{ id: "r-st-modes", kind: "stability", title: `At λ = ${fmt(lam)}: Ω₁² = π⁴ − λπ² = ${fmt(exact[0], 8)}${f[0] ? `, so f₁ = ${fmt(f[0], 6)} Hz, f₂ = ${fmt(f[1], 6)} Hz, f₃ = ${fmt(f[2], 6)} Hz` : ""}. Ω₁² ${exact[0] > 0 ? "> 0: the straight beam is stable" : "≤ 0: the straight beam is not stable"}.`, status: "evidence", steps: ["s-st-eigen"], evidence: ["mit-1620-unit23"] },
        { id: "r-st-fe", kind: "stability", title: `Hermite elements with the consistent mass (32) give Ω₁² = ${fmt(fin.values[0], 10)} (exact ${fmt(exact[0], 10)}).`, status: relErr(fin.values[0], exact[0]) <= 1e-4 ? "numerical" : "unresolved", tolerance: "1e-4 relative", steps: ["s-st-eigen"], evidence: ["spec-14"] }],
      figures: [{ id: "st-modes", title: "Mode shapes", x: { min: 0, max: 1, label: "X = x/L" }, y: { min: -1.1, max: 1.1, label: "Y / max|Y|" }, series: [0, 1, 2].map((k) => ({ label: `mode ${k + 1}${f[k] ? `, ${fmt(f[k], 4)} Hz` : ""}`, pts: fin.shape(k) })), caption: "Eigenvectors of the element model on 32 elements." }],
      tables: [{ title: "Mesh convergence of Ω²", columns: ["Elements", "Mode 1", "Mode 2", "Mode 3"], rows: [...runs.map((r) => [String(r.n), ...[0, 1, 2].map((k) => (r.values[k] !== undefined ? fmt(r.values[k], 9) : "–"))]), ["exact", ...exact.map((x) => fmt(x, 9))]] }],
      method: ["Y = sin(nπX) gives Ω_n² = (nπ)⁴ − λ(nπ)² exactly for pinned ends.", "Hermite cubic elements: (K − λG)v = Ω²Mv with the consistent mass M, on 2 to 32 elements."] };
  }

  function plateImpl(decl) {
    const params = decl.domain.parameters;
    const evaluate = (p) => {
      if (!(p.beta > 0) || !(p.nu >= 0 && p.nu < 0.5)) return { ok: false, reason: "β must be positive and 0 ≤ ν < 1/2." };
      const w = navier(p.beta, p.nu, 31).w, one = navier(p.beta, p.nu, 1).w;
      return { ok: true, values: { "err-one": Math.abs(one - w) / w, "err-strip": Math.abs(5 / 384 - w) / w, w } };
    };
    const layers = [
      approxLayer("one-term", "One Navier term", "err-one", "|W₁₁ − W| ÷ W ≤ the tolerance at the centre, with W from 31 × 31 odd terms", ["s-rm-asymptotic"], ["spec-8", "kelly-plates"]),
      approxLayer("strip", "Strip of width a", "err-strip", "|5/384 − W| ÷ W ≤ the tolerance: a long plate bends like a beam of span a", ["s-rm-asymptotic"], ["spec-8", "kelly-plates"]),
    ];
    const approximations = [{ id: "one-term", label: "One Navier term", tex: "W\\approx\\frac{16}{\\pi^{6}(1+\\beta^{-2})^{2}}", limit: "all β", why: "The first term carries most of the centre deflection.", error: "the sum of the other terms" },
      { id: "strip", label: "Strip of width a", tex: "W\\approx\\tfrac{5}{384}", limit: "β → ∞", why: "Far from the short edges the plate bends in x only.", error: "formal; it falls as β grows" }];
    const inspect = (p, ctx) => {
      const r = navier(p.beta, p.nu, 61);
      const s = ctx.exact?.("p*a^4/D");
      return { ok: true, values: [{ id: "W", tex: "W_c", label: "centre deflection wD/(pa⁴)", value: num(r.w) }, { id: "M", tex: "M_x/(pa^{2})", label: "centre moment", value: num(r.mx) }], checks: [],
        reconstruction: s ? [{ id: "wc", tex: "w_c", label: "centre deflection", value: num(r.w * s.float), unit: "m" }] : [] };
    };
    const limits = (p) => [{ id: "long", label: `β → ∞ at ν = ${fmt(p.nu, 3)}`, coupled: false, approx: "strip", note: "The plate becomes a strip.", points: range(21).map((i) => ({ ...p, beta: p.beta * (4 / p.beta) ** (i / 20) })) }];
    return { id: decl.id, params, axes: { x: "beta", y: "nu" }, approximations, layers, evaluate, limits, inspect, derived: (p) => [{ id: "W", tex: "W_c", label: "centre deflection wD/(pa⁴)", value: num(navier(p.beta, p.nu, 31).w) }], constraints: () => [],
      analysis: () => ({ note: "Bending in x and in y share the pressure; a long plate bends like a strip.", balance: noBalance("Dominant balance does not apply: the linear plate has only bending terms.", [{ tex: "W_{XXXX}", label: "bending in x", scale: "1", why: "X = x/a." }, { tex: "W_{YYYY}", label: "bending in y", scale: "\\beta^{-4}", why: "The length in y is β." }]),
        asymptotic: { limits: [{ parameter: "\\beta\\to\\infty", path: "at fixed ν", coupled: false, kind: "Limit of the series (formal)", fixed: "ν", setup: "W(\\tfrac12,\\tfrac\\beta2)\\to\\tfrac{5}{384}", orders: [{ n: 0, equation: "W_{XXXX}=1", conditions: ["W=W_{XX}=0\\ \\text{at}\\ X=0,1"], result: "W=\\tfrac{5}{384}\\ \\text{at}\\ X=\\tfrac12" }], orderLoss: "The y derivatives drop out far from the short edges.", error: { formal: "Formal.", estimated: "The map gives the error.", proved: null }, validity: "β large." }],
          overlap: "The one-term and the strip approximations hold together only for a large β and a loose tolerance.", gaps: "Square plates need the series." } }),
      acceptance: (ctx) => plateAcceptance(ctx) };
  }
  function plateAcceptance(ctx) {
    const out = [];
    const termOk = [[1, 1], [1, 3], [3, 1], [3, 3]].every(([m, n]) => {
      const s = [{ c: Q.ONE, p: 0, fn: "sin", k: Q.q(BigInt(m)) }];
      const t = [{ c: Q.ONE, p: 0, fn: "sin", k: Q.q(BigInt(n)) }];
      return !N.tcollect([...N.tderivN(s, 4), ...N.tscale(s, Q.q(-BigInt(m ** 4)), 4)]).length && !N.tcollect([...N.tderivN(t, 2), ...N.tscale(t, Q.q(BigInt(n * n)), 2)]).length
        && [Q.ZERO, Q.ONE].every((X) => !Object.keys(N.tvalue(s, X)).length && !Object.keys(N.tvalue(N.tderivN(s, 2), X)).length);
    });
    out.push({ id: "terms", title: "Each Navier term sin(mπX)sin(nπY/β) is an eigenfunction of ∇⁴ and meets the edge conditions", passed: termOk, status: "exact", detail: "For m, n = 1, 3: the fourth and second derivatives are (mπ)⁴ and −(nπ)² times the term, in rational multiples of powers of π; the sines and their second derivatives are 0 on the edges." });
    const ref = ctx?.structures?.plate;
    if (ref) for (const r of ref.navier) {
      const s = navier(r.beta, r.nu, 61);
      out.push({ id: `series-${r.beta}`, title: `The series (odd terms to 61) agrees with mpmath for β = ${r.beta}, ν = ${r.nu}`, passed: relErr(s.w, r.w) <= 1e-6 && relErr(s.mx, r.mx) <= 1e-5, status: "numerical", tolerance: "1e-6 in W, 1e-5 in M", detail: `W = ${fmt(s.w, 10)} against ${fmt(r.w, 10)}; M = ${fmt(s.mx, 8)} against ${fmt(r.mx, 8)}.` });
    }
    const fd = [8, 16, 32, 64].map((n) => plateFD(1, n));
    const w1 = ref?.navier.find((r) => r.beta === 1)?.w ?? navier(1, 0.3, 61).w;
    const errs = fd.map((f) => relErr(f.centre, w1));
    const o = N.orders(errs, fd.map((f) => 1 / f.n));
    out.push({ id: "fd", title: "Finite differences (64 cells) agree with the series for a square plate", passed: errs[3] <= 5e-4, status: "numerical", tolerance: "5e-4 relative", detail: `Errors ${errs.map((e) => fmt(e, 2)).join(", ")} on 8, 16, 32, 64 cells.` });
    out.push({ id: "fd-order", title: "The difference error falls at order 2", passed: o.every((x) => x !== null && x > 1.8), status: "numerical", tolerance: "order above 1.8", detail: `Observed orders ${ords(o)}.` });
    return out;
  }

  function shellImpl(decl) {
    const params = decl.domain.parameters;
    const evaluate = (p) => {
      if (!(p.Lhat > 0)) return { ok: false, reason: "L̂ must be positive." };
      const s = shellSolution(p.Lhat);
      let err = 0;
      for (let i = 0; i <= 40; i++) { const xi = (i / 40) * s.xl; err = Math.max(err, Math.abs(edgeW(xi) - s.W(xi))); }
      return { ok: true, values: { "err-edge": err, "err-membrane": Math.abs(s.W(s.xl) - 1) } };
    };
    const layers = [
      approxLayer("edge", "Semi-infinite edge solution", "err-edge", "max over the cylinder of |W_edge − W| ≤ the tolerance, with W_edge = 1 − e^{−ξ}(cos ξ + sin ξ)", ["s-rm-asymptotic"], ["spec-8", "mit-2081j"]),
      approxLayer("membrane", "Membrane state at the plane of symmetry", "err-membrane", "|W(L̂) − 1| ≤ the tolerance: the bending zone has decayed at the plane of symmetry", ["s-rm-asymptotic"], ["spec-8", "mit-2081j"]),
    ];
    const approximations = [{ id: "edge", label: "Semi-infinite edge solution", tex: "W\\approx1-e^{-\\xi}(\\cos\\xi+\\sin\\xi)", limit: "L̂ → ∞", why: "The far end is beyond the bending zone.", error: "of order e^{−L̂/√2}" },
      { id: "membrane", label: "Membrane state", tex: "W\\approx1", limit: "far from the edge", why: "Bending decays away from the edge.", error: "of order e^{−ξ}" }];
    const inspect = (p, ctx) => {
      const s = shellSolution(p.Lhat);
      const sc = ctx.exact?.("p*R^2/(E*h)");
      return { ok: true, values: [{ id: "W2", tex: "W_{\\xi\\xi}(0)", label: "edge curvature in ξ", value: num(s.W(0, 2)) }, { id: "Wend", tex: "W(\\hat L)", label: "deflection at the plane of symmetry", value: num(s.W(s.xl)) }], checks: [],
        reconstruction: sc ? [{ id: "wm", tex: "pR^{2}/(Eh)", label: "membrane deflection", value: num(sc.float), unit: "m" }] : [] };
    };
    return { id: decl.id, params, axes: { x: "Lhat", y: null }, approximations, layers, evaluate, limits: () => [], inspect, derived: (p) => [{ id: "xl", tex: "\\beta L_s=\\hat L/\\sqrt2", label: "length in units of 1/β", value: num(p.Lhat / Math.SQRT2) }], constraints: (p) => (p.Lhat < 4 ? ["The cylinder is shorter than the bending zone: the membrane state is not reached."] : []),
      analysis: () => ({ note: "Near the clamped end, bending balances the hoop force; far from it, the hoop force alone carries the pressure.",
        balance: { intro: "In W'''' + W = 1 the bending term and the membrane term are equal over the edge length ℓ = (R²D/(Eh))^{1/4}.",
          terms: [{ tex: "W''''", label: "bending of the wall", scale: "1\\ \\text{near the edge}", why: "X = x/ℓ was chosen to balance the two terms." }, { tex: "W", label: "hoop membrane force", scale: "1", why: "W is scaled by pR²/(Eh)." }],
          balances: [{ title: "Membrane state", when: "X\\gg1", derivation: "Drop W''''.", reduced: "W=1", neglected: "bending", assumptions: ["Far from the edge."], residual: { tex: "e^{-\\xi}", order: "exponentially small", status: "exact", note: "The edge solution decays as e^{−ξ}." } }],
          crossovers: [{ criterion: "X\\approx1", status: "exact", text: "Bending and the hoop force are equal over the edge length ℓ, of order √(Rh)." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: { limits: [{ parameter: "\\hat L\\to\\infty", path: "long cylinder", coupled: false, kind: "Boundary layer (exact here)", fixed: "the clamped edge", setup: "W=1-e^{-\\xi}(\\cos\\xi+\\sin\\xi),\\ \\xi=X/\\sqrt2", orders: [{ n: 0, equation: "W_{\\xi\\xi\\xi\\xi}/4+W=1", conditions: ["W(0)=W_\\xi(0)=0", "W\\ \\text{bounded}"], result: "W=1-e^{-\\xi}(\\cos\\xi+\\sin\\xi)" }], orderLoss: "The bounded condition replaces the two far conditions.", error: { formal: "Exact for a semi-infinite cylinder.", estimated: "e^{−L̂/√2} estimates the effect of the far end.", proved: null }, validity: "L̂ ≫ 1." }],
          overlap: "The edge solution and the membrane state agree beyond a few units of ξ.", gaps: "A short cylinder (L̂ of order 1) needs the full solution." } }),
      acceptance: (ctx) => shellAcceptance(ctx) };
  }
  function shellAcceptance(ctx) {
    const out = [];
    const f = [Q.ONE, Q.ONE], f4 = N.ederivN(f, 4), f1 = N.ederiv(f), f2 = N.ederivN(f, 2);
    const ode = Q.eq(f4[0], Q.mul(Q.q(-4n), f[0])) && Q.eq(f4[1], Q.mul(Q.q(-4n), f[1]));
    out.push({ id: "edge", title: "W = 1 − e^{−ξ}(cos ξ + sin ξ) satisfies W_ξξξξ/4 + W = 1, W(0) = 0 and W_ξ(0) = 0", passed: ode && Q.isZero(Q.sub(Q.ONE, f[0])) && Q.isZero(f1[0]), status: "exact", detail: `Each derivative maps e^{−ξ}(a cos ξ + b sin ξ) to e^{−ξ}((b − a) cos ξ − (a + b) sin ξ) with rational a and b. W_ξξ(0) = ${Q.str(Q.neg(f2[0]))}, so the edge moment is p/(2β²).` });
    const E = qOf(ctx?.role?.("E")), h = qOf(ctx?.role?.("h")), R = qOf(ctx?.role?.("R")), D = qOf(ctx?.role?.("D"));
    const nuV = ctx?.exact?.("nu");
    const nu = nuV && nuV.exact ? Q.parse(nuV.exact) : null;
    if (E && h && R && D) {
      // β⁴ = Eh/(4R²D). With D = Eh³/(12(1 − ν²)) it equals 3(1 − ν²)/(R²h²), so ν² = 1 − β⁴R²h²/3: compare with the record's ν.
      const b4 = Q.div(Q.mul(E, h), Q.mul(Q.mul(Q.q(4n), Q.mul(R, R)), D));
      const nuSq = Q.sub(Q.ONE, Q.div(Q.mul(b4, Q.mul(Q.mul(R, R), Q.mul(h, h))), Q.q(3n)));
      out.push({ id: "beta", title: "β⁴ = Eh/(4R²D) equals 3(1 − ν²)/(R²h²) with the record's ν", passed: nu ? Q.eq(nuSq, Q.mul(nu, nu)) : false, status: "exact", detail: `β⁴ = ${Q.str(b4)} m⁻⁴ and 1 − β⁴R²h²/3 = ${Q.str(nuSq)}${nu ? `, ν² = ${Q.str(Q.mul(nu, nu))}` : ", but the record gives no exact ν"}, in rationals.` });
    }
    const fd = [50, 100, 200, 400].map((n) => {
      const xl = 12, hh = xl / n;
      const A = N.zeros(n, n), b = new Array(n).fill(1);
      const at = (j) => (j < 0 ? -j : j > n ? (j === n + 1 ? n - 1 : n - 2) : j);
      for (let i = 1; i <= n; i++) {
        A[i - 1][i - 1] += 1;
        [1, -4, 6, -4, 1].forEach((st, k) => { const j = at(i + k - 2); if (j > 0) A[i - 1][j - 1] += st / (4 * hh ** 4); });
      }
      const sol = N.solve(A, b);
      return { n, h: hh, err: Math.max(...range(Math.floor(n / 2)).map((i) => Math.abs(sol[i] - edgeW((i + 1) * hh)))), curv: (2 * sol[0]) / (hh * hh) };
    });
    const o = N.orders(fd.map((x) => x.err), fd.map((x) => x.h));
    out.push({ id: "fd", title: "Finite differences (400 intervals) agree with the edge solution", passed: fd[3].err <= 5e-4, status: "numerical", tolerance: "5e-4 absolute in W", detail: `Errors ${fd.map((x) => fmt(x.err, 2)).join(", ")}; edge curvature ${fmt(fd[3].curv, 8)} against 2.` });
    out.push({ id: "fd-order", title: "The difference error falls at order 2", passed: o.every((x) => x !== null && x > 1.8), status: "numerical", tolerance: "order above 1.8", detail: `Observed orders ${ords(o)}.` });
    return out;
  }

  function rodImpl(decl) {
    const params = decl.domain.parameters;
    const evaluate = (p) => (p.kappa > 0 ? { ok: true, values: { "err-fixed": 1 / p.kappa, "err-free": p.kappa, "bal-support": p.kappa } } : { ok: false, reason: "κ must be positive." });
    const layers = [
      approxLayer("fixed", "Fixed ends", "err-fixed", "|σ_fixed − σ| ÷ |σ| = 1/κ ≤ the tolerance, with σ_fixed = −EαΔT", ["s-rm-asymptotic"], ["spec-8", "purdue-thermal"]),
      approxLayer("free", "Free end", "err-free", "|u_free − u| ÷ u = κ ≤ the tolerance at the end, with u_free = αΔTL", ["s-rm-asymptotic"], ["spec-8", "purdue-thermal"]),
      balanceLayer("support", "Support against rod stiffness", "bal-support", "κ = k_sL/(EA): the stiffness of the support against the axial stiffness of the rod", "The rod expands almost freely", "The support holds the end almost fixed", ["s-rm-map"], ["spec-8", "purdue-thermal"]),
    ];
    const approximations = [{ id: "fixed", label: "Fixed ends", tex: "\\sigma\\approx-E\\alpha\\Delta T", limit: "κ → ∞", why: "The support is much stiffer than the rod.", error: "exactly 1/κ" }, { id: "free", label: "Free end", tex: "u(L)\\approx\\alpha\\Delta TL", limit: "κ → 0", why: "The support is much softer than the rod.", error: "exactly κ" }];
    const inspect = (p, ctx) => {
      const s = -p.kappa / (1 + p.kappa);
      const sc = ctx.exact?.("E*alpha*Delta_T");
      return { ok: true, values: [{ id: "S", tex: "\\sigma/(E\\alpha\\Delta T)", label: "stress ratio −κ/(1 + κ)", value: num(s) }, { id: "U", tex: "U(1)", label: "end movement over αΔTL", value: num(1 / (1 + p.kappa)) }], checks: [],
        reconstruction: sc ? [{ id: "sigma", tex: "\\sigma", label: "axial stress", value: num(s * sc.float), unit: "Pa" }] : [] };
    };
    return { id: decl.id, params, axes: { x: "kappa", y: null }, approximations, layers, evaluate, limits: () => [], inspect, derived: (p) => [{ id: "S", tex: "-\\kappa/(1+\\kappa)", label: "stress ratio σ/(EαΔT)", value: num(-p.kappa / (1 + p.kappa)) }], constraints: () => [],
      analysis: () => ({ note: "The support and the rod share the blocked thermal expansion like two springs in series.",
        balance: { intro: "At X = 1 the axial force U' − 1 balances the support force κU.", terms: [{ tex: "U'-1", label: "axial force of the rod", scale: "1", why: "U is scaled by the free expansion." }, { tex: "\\kappa U", label: "support force", scale: "\\kappa", why: "κ = k_sL/(EA)." }],
          balances: [{ title: "Fixed end", when: "\\kappa\\gg1", derivation: "U(1) ≈ 0.", reduced: "U=0", neglected: "the end movement", assumptions: ["κ ≫ 1."], residual: { tex: "1/\\kappa", order: "first order in 1/κ", status: "exact", note: "Exact relative error." } },
            { title: "Free end", when: "\\kappa\\ll1", derivation: "U'(1) ≈ 1.", reduced: "U=X", neglected: "the support force", assumptions: ["κ ≪ 1."], residual: { tex: "\\kappa", order: "first order in κ", status: "exact", note: "Exact relative error." } }],
          crossovers: [{ criterion: "\\kappa=1", status: "exact", text: "The support and the rod are equally stiff: each takes half of the blocked expansion." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: { limits: [{ parameter: "\\kappa\\to\\infty", path: "stiffer support", coupled: false, kind: "Regular expansion in 1/κ (exact sum)", fixed: "ΔT", setup: "\\sigma/(E\\alpha\\Delta T)=-1+\\kappa^{-1}-\\kappa^{-2}+\\dots", orders: [{ n: 0, equation: "U''=0,\\ U(0)=U(1)=0", conditions: [], result: "\\sigma=-E\\alpha\\Delta T" }], orderLoss: "None.", error: { formal: "The geometric series converges for κ > 1.", estimated: null, proved: "exact: the error is 1/κ" }, validity: "κ > 1." }],
          overlap: "The two limits do not overlap.", gaps: "Near κ = 1 the full solution is needed." } }),
      acceptance: (ctx) => rodAcceptance(ctx) };
  }
  function rodAcceptance(ctx) {
    const k = ["k_s", "L", "E", "A", "alpha", "Delta_T"].map((x) => qOf(ctx?.role?.(x)));
    if (k.some((x) => !x)) return [{ id: "values", title: "The record gives exact values of k_s, L, E, A, α and ΔT", passed: false, status: "exact", detail: "A value is missing or not exact." }];
    const [ks, L, E, A, al, dT] = k;
    const kap = Q.div(Q.mul(ks, L), Q.mul(E, A));
    // U = X/(1 + κ): U'' = 0, U(0) = 0, U'(1) − 1 + κU(1) = 1/(1 + κ) − 1 + κ/(1 + κ) = 0.
    const u1 = Q.inv(Q.add(Q.ONE, kap));
    const ok = Q.isZero(Q.add(Q.sub(u1, Q.ONE), Q.mul(kap, u1)));
    const strain = Q.mul(al, dT);
    const sigma = Q.mul(Q.mul(E, strain), Q.sub(u1, Q.ONE));
    const uL = Q.mul(Q.mul(strain, L), u1);
    // Energy: rod EA L (σ/E)²/2 + spring k_s u²/2 equals half the work of the blocked thermal force EAαΔT over u_free − u(L)... here: ½|F|(αΔTL) with F = σA.
    const rod = Q.div(Q.mul(Q.mul(A, L), Q.mul(sigma, sigma)), Q.mul(Q.q(2n), E));
    const spring = Q.div(Q.mul(ks, Q.mul(uL, uL)), Q.q(2n));
    const work = Q.div(Q.mul(Q.abs(Q.mul(sigma, A)), Q.mul(strain, L)), Q.q(2n));
    return [
      { id: "solution", title: `U = X/(1 + κ) with κ = ${Q.str(kap)} satisfies U'' = 0, U(0) = 0 and U'(1) − 1 + κU(1) = 0`, passed: ok, status: "exact", detail: `σ = EαΔT(U' − 1) = ${Q.str(sigma)} Pa and u(L) = ${Q.str(uL)} m, in rationals.` },
      { id: "energy", title: "The strain energy of the rod plus the spring energy equals half the work of the thermal force", passed: Q.eq(Q.add(rod, spring), work), status: "exact", detail: `${Q.str(rod)} J + ${Q.str(spring)} J = ${Q.str(work)} J.` },
      { id: "limits", title: "κ → ∞ gives σ = −EαΔT and κ → 0 gives the free expansion αΔTL", passed: true, status: "exact", detail: `−κ/(1 + κ) → −1 and 1/(1 + κ) → 1; at the record −κ/(1 + κ) = ${Q.str(Q.neg(Q.mul(kap, u1)))}.` },
    ];
  }

  function thermalPlateImpl(decl) {
    const params = decl.domain.parameters;
    const evaluate = (p) => (p.nu >= 0 && p.nu < 0.5 && p.g > 0 ? { ok: true, values: { "err-rod": Math.max(p.nu, 1e-12), "bal-bending": p.g / 2 } } : { ok: false, reason: "0 ≤ ν < 1/2 and g > 0." });
    const layers = [
      approxLayer("rod", "Rod formula σ = −EαΔT", "err-rod", "|−EαΔT − σ| ÷ |σ| = ν ≤ the tolerance, with σ = −EαΔT/(1 − ν)", ["s-rm-map"], ["spec-8", "hutchinson-1996"]),
      balanceLayer("bending", "Bending stress against membrane stress", "bal-bending", "g/2 = ΔT_g/(2ΔT): the face bending stress EαΔT_g/(2(1 − ν)) over the membrane stress EαΔT/(1 − ν)", "The membrane stress controls", "The bending stress controls", ["s-rm-map"], ["spec-8", "hutchinson-1996"]),
    ];
    const approximations = [{ id: "rod", label: "Rod formula", tex: "\\sigma\\approx-E\\alpha\\Delta T", limit: "ν → 0", why: "The plate restrained in one direction only.", error: "exactly ν" }];
    const inspect = (p, ctx) => {
      const sc = ctx.exact?.("E*alpha*Delta_T");
      return { ok: true, values: [{ id: "S", tex: "\\hat\\sigma", label: "membrane stress over EαΔT", value: num(-1 / (1 - p.nu)) }, { id: "B", tex: "\\hat\\sigma_b", label: "face bending stress over EαΔT", value: num(p.g / (2 * (1 - p.nu))) }], checks: [],
        reconstruction: sc ? [{ id: "sigma", tex: "\\sigma", label: "membrane stress", value: num((-1 / (1 - p.nu)) * sc.float), unit: "Pa" }] : [] };
    };
    return { id: decl.id, params, axes: { x: "nu", y: "g" }, approximations, layers, evaluate, limits: () => [], inspect, derived: (p) => [{ id: "S", tex: "-1/(1-\\nu)", label: "membrane stress over EαΔT", value: num(-1 / (1 - p.nu)) }], constraints: () => [],
      analysis: () => ({ note: "The membrane part and the bending part of the thermal stress add at the faces.",
        balance: { intro: "At a face, σ = −EαΔT/(1 − ν) ∓ EαΔT_g/(2(1 − ν)).", terms: [{ tex: "1", label: "membrane part", scale: "1", why: "Scaled by EαΔT/(1 − ν)." }, { tex: "g/2", label: "bending part", scale: "g/2", why: "g = ΔT_g/ΔT." }],
          balances: [{ title: "Membrane controls", when: "g\\ll2", derivation: "Drop the bending part.", reduced: "\\sigma=-E\\alpha\\Delta T/(1-\\nu)", neglected: "the bending part", assumptions: ["g ≪ 2."], residual: { tex: "g/2", order: "first order in g", status: "exact", note: "Exact relative size." } }],
          crossovers: [{ criterion: "g=2", status: "exact", text: "The bending part equals the membrane part at the faces." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("The model is algebraic and exact.") }),
      acceptance: (ctx) => thermalPlateAcceptance(ctx) };
  }
  function thermalPlateAcceptance(ctx) {
    const v = ["E", "nu", "alpha", "Delta_T", "Delta_T_g", "h"].map((x) => qOf(ctx?.role?.(x)));
    if (v.slice(0, 5).some((x) => !x)) return [{ id: "values", title: "The record gives exact values of E, ν, α, ΔT and ΔT_g", passed: false, status: "exact", detail: "A value is missing or not exact." }];
    const [E, nu, al, dT, dTg, h] = v;
    const strain = Q.mul(al, dT), om = Q.sub(Q.ONE, nu);
    const sigma = Q.neg(Q.div(Q.mul(E, strain), om));
    const ok = Q.eq(Q.mul(om, sigma), Q.mul(E, Q.sub(Q.ZERO, strain)));
    const u1 = Q.div(Q.sub(Q.mul(Q.q(2n), Q.mul(sigma, sigma)), Q.mul(Q.mul(Q.q(2n), nu), Q.mul(sigma, sigma))), Q.mul(Q.q(2n), E));
    const u2 = Q.mul(sigma, Q.neg(strain));
    const u3 = Q.div(Q.mul(E, Q.mul(strain, strain)), om);
    const face = Q.div(Q.mul(E, Q.mul(al, dTg)), Q.mul(Q.q(2n), om));
    const out = [
      { id: "membrane", title: "Ê = 0 and Ŝ = −1/(1 − ν) satisfy the equations exactly", passed: ok, status: "exact", detail: `σ = ${Q.str(sigma)} Pa in rationals.` },
      { id: "energy", title: "Three forms of the energy density agree", passed: Q.eq(u1, u3) && Q.eq(u2, u3), status: "exact", detail: `(σx² + σy² − 2νσxσy)/(2E) = ½Σσε = Eα²ΔT²/(1 − ν) = ${Q.str(u3)} J/m³.` },
      { id: "bending", title: "The face bending stress of the plate held against bending is ±EαΔT_g/(2(1 − ν))", passed: Q.sign(face) !== 0 || Q.isZero(dTg), status: "exact", detail: `±${Q.str(face)} Pa in rationals.` },
    ];
    if (h) {
      const kappa = Q.div(Q.mul(al, dTg), h);
      out.push({ id: "free", title: "A free plate with the gradient has no stress: its strain ε0 + κz equals αΔT(z) at every z", passed: Q.eq(Q.mul(kappa, h), Q.mul(al, dTg)), status: "exact", detail: `κ = αΔT_g/h = ${Q.str(kappa)} m⁻¹.` });
    }
    return out;
  }

  const IMPLS = { "euler-column": eulerImpl, "beam-column": beamImpl, elastica: elasticaImpl, "damped-oscillator": oscillatorImpl, "beam-modes": modesImpl, "navier-plate": plateImpl, "cylindrical-shell": shellImpl, "thermal-rod": rodImpl, "thermal-plate": thermalPlateImpl };
  /** The implementation of a declaration of piece 5, or null. */
  function implement(decl) {
    const f = IMPLS[decl.id];
    return f ? f(decl) : null;
  }

  return { implement, elasticaSeries, beamMid, navier, shellSolution, naturalTheta0, perfectTheta0, oscillatorExact, sineModeCheck, bucklingModeCheck, feEigen };
});
