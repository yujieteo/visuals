/* Monte Carlo Probability Workbench: the process library of group 5. Each process is a law on paths: a draw is the
 * vector of the values at the grid times t_k = k T / steps, k = 0..steps (X[1] is the initial value). Brownian
 * motion, geometric Brownian motion, the Ornstein-Uhlenbeck process, the Poisson process, the compound Poisson
 * process, the finite-state Markov chain, the Galton-Watson branching process, the Hawkes process with an
 * exponential kernel and the variance-gamma Lévy process. Each gives an exact sampler where one exists, an
 * inverse-transform sampler, a thinning (rejection) sampler for the point processes, and the Euler time
 * discretisation; each states its stationarity, stability, explosion, boundary and discretisation conditions at its
 * parameters. coarsen = c draws c fine Brownian increments for each step and adds them, so the paths with
 * (steps, 1) and (steps / 2, 2) share their Brownian motion: the coupled pair of multilevel Monte Carlo. closed()
 * gives reference values of path quantities, and the band functions collect the ensemble of paths in mergeable
 * counts. Tests load this file with require().
 */
/** @param {any} root the global object @param {(S: any, L: any, C: any, E: any, Cn: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCSpecial ?? require("./special.js"), root.MCLaws ?? require("./laws.js"), root.MCCopulas ?? require("./copulas.js"), root.MCExpr ?? require("./expr.js"), root.MCContinuous ?? require("./continuous.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCProcesses = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./special.js")} */ S, /** @type {typeof import("./laws.js")} */ L,
  /** @type {typeof import("./copulas.js")} */ C, /** @type {typeof import("./expr.js")} */ E, /** @type {typeof import("./continuous.js")} */ Cn) {
  "use strict";

  /** @typedef {{ uniform(): number, u32(): number, below(m: number): number, normal(): number }} Rng */
  /** @typedef {{ proposals: number, accepts: number, violations: number }} RejectStats */
  /** @typedef {{ unavailable: string }} NoSampler */
  /** @typedef {Record<string, any>} Params */
  /** @typedef {{ kind: "stationarity" | "stability" | "explosion" | "boundary" | "discretisation", holds: boolean | null, text: string }} Condition */
  /** @typedef {{ mean: number | null, sd: number | null, discrete: boolean, cdf: ((x: number) => number) | null }} Marginal */

  const MAX_STEPS = 4096, MAX_COARSEN = 16, MAX_EVENTS = 100000;
  /** @param {unknown} x */
  const show = (x) => (typeof x === "number" ? (x === Infinity ? "∞" : String(x)) : "a vector");
  /** @param {unknown} x @param {number} lo @param {number} hi */
  const inside = (x, lo, hi) => typeof x === "number" && x >= lo && x <= hi;
  /** @param {number} x */
  const g4 = (x) => (Number.isFinite(x) ? String(+x.toPrecision(4)) : x > 0 ? "∞" : "−∞");
  /** @param {string} why @returns {NoSampler} */
  const none = (why) => ({ unavailable: why });
  const qnorm = C.qnorm;

  /** The grid arguments every continuous-time process takes. @param {Params} p @param {boolean} [coarse] */
  function checkGrid(p, coarse = true) {
    const e = [];
    if (!inside(p.T, 1e-9, 1e6)) e.push(`T = ${show(p.T)} is outside (0, 10^6].`);
    if (!(Number.isInteger(p.steps) && p.steps >= 1 && p.steps <= MAX_STEPS)) e.push(`steps = ${show(p.steps)} is not an integer in [1, ${MAX_STEPS}].`);
    if (coarse && !(Number.isInteger(p.coarsen) && p.coarsen >= 1 && p.coarsen <= MAX_COARSEN)) e.push(`coarsen = ${show(p.coarsen)} is not an integer in [1, ${MAX_COARSEN}].`);
    return e;
  }
  /** @param {string} name @param {string} text @param {string} [def] */
  const param = (name, text, def) => ({ name, kind: "real", text, ...(def === undefined ? {} : { default: def }) });
  const GRID = [param("T", "time horizon, 0 < T ≤ 10^6"), { name: "steps", kind: "integer", text: "number of grid steps, 1 to 4,096; the path has steps + 1 values" }];
  const COARSEN = { name: "coarsen", kind: "integer", text: "fine Brownian increments added for each step, 1 to 16 (default 1); 2 gives the coarse path of a coupled pair", default: "1" };

  /** The grid times of a process. @param {Params} p */
  const times = (p) => Array.from({ length: p.steps + 1 }, (_, k) => (p.T === undefined ? k : (k * p.T) / p.steps));

  /** A Brownian increment over one step of length h, from c fine normals. @param {() => number} z @param {number} h @param {number} c */
  function dW(z, h, c) {
    if (c === 1) return Math.sqrt(h) * z();
    let s = 0;
    for (let j = 0; j < c; j++) s += z();
    return Math.sqrt(h / c) * s;
  }

  /** The normal source of a method: Box-Muller for the reference sampler, the inverse transform for the inverse one. @param {Rng} rng @param {boolean} inv */
  const normals = (rng, inv) => (inv ? () => qnorm(rng.uniform()) : () => rng.normal());

  /** Φ for the closed forms. */
  const Phi = S.normalCdf;

  /** A normal marginal. @param {number} m @param {number} v @returns {Marginal} */
  const normalMarginal = (m, v) => ({ mean: m, sd: Math.sqrt(v), discrete: false, cdf: v > 0 ? (x) => Phi((x - m) / Math.sqrt(v)) : (x) => +(x >= m) });

  /* ---------- Brownian motion with drift ---------- */

  const brownian = {
    id: "brownian", name: "Brownian motion", kind: "process", family: "diffusion",
    params: [param("x0", "initial value X_0 (default 0)", "0"), param("mu", "drift μ for each unit of time (default 0)", "0"), param("sigma", "volatility σ ≥ 0 (default 1)", "1"), ...GRID, COARSEN],
    check: (/** @type {Params} */ p) => [...(inside(p.x0, -1e12, 1e12) ? [] : [`x0 = ${show(p.x0)} is outside [−10^12, 10^12].`]), ...(inside(p.mu, -1e9, 1e9) ? [] : [`mu = ${show(p.mu)} is outside [−10^9, 10^9].`]),
      ...(inside(p.sigma, 0, 1e9) ? [] : [`sigma = ${show(p.sigma)} is outside [0, 10^9].`]), ...checkGrid(p)],
    marginal: (/** @type {Params} */ p, /** @type {number} */ t) => normalMarginal(p.x0 + p.mu * t, p.sigma * p.sigma * t),
    sampler(/** @type {Params} */ p, /** @type {boolean} */ inv, /** @type {string} */ label) {
      const h = p.T / p.steps;
      return { label, exactness: "exact at the grid times", draw: (/** @type {Rng} */ rng) => {
        const z = normals(rng, inv), x = new Array(p.steps + 1);
        x[0] = p.x0;
        for (let k = 0; k < p.steps; k++) x[k + 1] = x[k] + p.mu * h + p.sigma * dW(z, h, p.coarsen);
        return x;
      } };
    },
    reference(/** @type {Params} */ p) { return this.sampler(p, false, "Exact on the grid: X_{k+1} = X_k + μh + σ ΔW_k with ΔW_k ~ N(0, h) (Box–Muller normals)"); },
    inverse(/** @type {Params} */ p) { return this.sampler(p, true, "Exact on the grid, with each normal by the inverse transform Φ⁻¹(V) (AS 241)"); },
    rejection: () => none("A Brownian increment is a normal draw, so the page has no rejection sampler for it."),
    euler(/** @type {Params} */ p) { return this.sampler(p, false, "Euler–Maruyama: X_{k+1} = X_k + μh + σ ΔW_k. With constant coefficients the scheme is exact at the grid times"); },
    conditions: (/** @type {Params} */ p) => /** @type {Condition[]} */ ([
      { kind: "stationarity", holds: p.sigma === 0 && p.mu === 0, text: p.sigma === 0 && p.mu === 0 ? "σ = 0 and μ = 0: the path is constant." : `Not stationary: Var X_t = σ²t grows without bound, and E X_t = X_0 + μt. The increments are stationary and independent.` },
      { kind: "stability", holds: null, text: "No mean reversion: the law spreads as √t, so no stable level exists." },
      { kind: "explosion", holds: false, text: "No explosion: X_t is finite for every t, almost surely." },
      { kind: "boundary", holds: null, text: "No boundary: the state space is the real line. A first-passage level is part of the quantity, not of the process." },
      { kind: "discretisation", holds: true, text: `The grid values are exact (h = ${g4(p.T / p.steps)}). The page does not draw the path between grid times. Thus the largest grid value is below the largest path value. A probability to reach a level is then low by a monitoring bias of order √h.` },
    ]),
  };

  /* ---------- geometric Brownian motion ---------- */

  const gbm = {
    id: "gbm", name: "Geometric Brownian motion", kind: "process", family: "diffusion",
    params: [param("s0", "initial value S_0 > 0"), param("mu", "drift μ: E S_t = S_0 e^(μt)"), param("sigma", "volatility σ ≥ 0"), ...GRID, COARSEN],
    check: (/** @type {Params} */ p) => [...(inside(p.s0, 1e-12, 1e12) ? [] : [`s0 = ${show(p.s0)} is outside (0, 10^12].`]), ...(inside(p.mu, -100, 100) ? [] : [`mu = ${show(p.mu)} is outside [−100, 100].`]),
      ...(inside(p.sigma, 0, 20) ? [] : [`sigma = ${show(p.sigma)} is outside [0, 20].`]), ...checkGrid(p), ...(inside(Math.abs(p.mu) * p.T + p.sigma * p.sigma * p.T, 0, 600) ? [] : ["|μ|T + σ²T is above 600: the values overflow."])],
    marginal: (/** @type {Params} */ p, /** @type {number} */ t) => {
      const m = Math.log(p.s0) + (p.mu - (p.sigma * p.sigma) / 2) * t, v = p.sigma * p.sigma * t;
      return { mean: p.s0 * Math.exp(p.mu * t), sd: p.s0 * Math.exp(p.mu * t) * Math.sqrt(Math.expm1(v)), discrete: false, cdf: v > 0 ? (/** @type {number} */ x) => (x <= 0 ? 0 : Phi((Math.log(x) - m) / Math.sqrt(v))) : (/** @type {number} */ x) => +(x >= Math.exp(m)) };
    },
    exact(/** @type {Params} */ p, /** @type {boolean} */ inv, /** @type {string} */ label) {
      const h = p.T / p.steps, a = (p.mu - (p.sigma * p.sigma) / 2) * h;
      return { label, exactness: "exact at the grid times", draw: (/** @type {Rng} */ rng) => {
        const z = normals(rng, inv), x = new Array(p.steps + 1);
        x[0] = p.s0;
        for (let k = 0; k < p.steps; k++) x[k + 1] = x[k] * Math.exp(a + p.sigma * dW(z, h, p.coarsen));
        return x;
      } };
    },
    reference(/** @type {Params} */ p) { return this.exact(p, false, "Exact on the grid: S_{k+1} = S_k exp((μ − σ²/2)h + σ ΔW_k) (Box–Muller normals)"); },
    inverse(/** @type {Params} */ p) { return this.exact(p, true, "Exact on the grid, with each normal by the inverse transform Φ⁻¹(V)"); },
    rejection: () => none("A lognormal step is a transformed normal draw, so the page has no rejection sampler for it."),
    euler(/** @type {Params} */ p) {
      const h = p.T / p.steps;
      return { label: "Euler–Maruyama: S_{k+1} = S_k (1 + μh + σ ΔW_k). Weak order 1 and strong order 1/2. The scheme can leave (0, ∞)", exactness: "not exact: time discretisation bias of order h", draw: (/** @type {Rng} */ rng) => {
        const z = () => rng.normal(), x = new Array(p.steps + 1);
        x[0] = p.s0;
        for (let k = 0; k < p.steps; k++) x[k + 1] = x[k] * (1 + p.mu * h + p.sigma * dW(z, h, p.coarsen));
        return x;
      } };
    },
    conditions: (/** @type {Params} */ p) => {
      const h = p.T / p.steps, g = p.mu - (p.sigma * p.sigma) / 2, cross = p.sigma > 0 ? Phi(-(1 + p.mu * h) / (p.sigma * Math.sqrt(h))) : +(1 + p.mu * h <= 0);
      return /** @type {Condition[]} */ ([
        { kind: "stationarity", holds: false, text: "Not stationary: log S_t is a Brownian motion with drift μ − σ²/2, so its variance σ²t grows." },
        { kind: "stability", holds: null, text: `The growth rate of a typical path is μ − σ²/2 = ${g4(g)}: S_t → ${g < 0 ? "0" : g > 0 ? "∞" : "no limit (it oscillates)"} almost surely, while E S_t = S_0 e^(μt) ${p.mu > 0 ? "grows" : p.mu < 0 ? "decays" : "stays at S_0"}. The time average and the ensemble average differ.` },
        { kind: "explosion", holds: false, text: "No explosion: S_t is finite for every t, almost surely." },
        { kind: "boundary", holds: true, text: `The exact process stays in (0, ∞): 0 is not attainable. One Euler step crosses 0 with probability Φ(−(1 + μh)/(σ√h)) = ${g4(cross)}, which breaks the boundary.` },
        { kind: "discretisation", holds: true, text: `Exact transitions at the grid times (h = ${g4(h)}). The Euler scheme has a weak bias of order h and a strong error of order √h.` },
      ]);
    },
  };

  /* ---------- Ornstein-Uhlenbeck ---------- */

  /** The variance factor (1 − e^(−2κh)) / (2κ), with its limit h at κ = 0. @param {number} kappa @param {number} h */
  const ouVar = (kappa, h) => (Math.abs(kappa * h) < 1e-12 ? h : -Math.expm1(-2 * kappa * h) / (2 * kappa));

  const ou = {
    id: "ou", name: "Ornstein–Uhlenbeck process", kind: "process", family: "diffusion",
    params: [param("x0", "initial value X_0"), param("kappa", "rate of mean reversion κ"), param("theta", "long-run mean θ"), param("sigma", "volatility σ ≥ 0"), ...GRID, COARSEN],
    check: (/** @type {Params} */ p) => [...(inside(p.x0, -1e12, 1e12) ? [] : [`x0 = ${show(p.x0)} is outside [−10^12, 10^12].`]), ...(inside(p.theta, -1e12, 1e12) ? [] : [`theta = ${show(p.theta)} is outside [−10^12, 10^12].`]),
      ...(inside(p.sigma, 0, 1e9) ? [] : [`sigma = ${show(p.sigma)} is outside [0, 10^9].`]), ...(inside(p.kappa, -1e6, 1e6) ? [] : [`kappa = ${show(p.kappa)} is outside [−10^6, 10^6].`]), ...checkGrid(p),
      ...(p.kappa * p.T >= -50 ? [] : [`κT = ${g4(p.kappa * p.T)} is below −50: the values overflow.`])],
    marginal: (/** @type {Params} */ p, /** @type {number} */ t) => normalMarginal(p.theta + (p.x0 - p.theta) * Math.exp(-p.kappa * t), p.sigma * p.sigma * ouVar(p.kappa, t)),
    exact(/** @type {Params} */ p, /** @type {boolean} */ inv, /** @type {string} */ label) {
      const h = p.T / p.steps, c = p.coarsen, d = h / c, a = Math.exp(-p.kappa * d), sd = p.sigma * Math.sqrt(ouVar(p.kappa, d)), ah = Math.exp(-p.kappa * h);
      return { label, exactness: "exact at the grid times", draw: (/** @type {Rng} */ rng) => {
        const z = normals(rng, inv), x = new Array(p.steps + 1);
        x[0] = p.x0;
        for (let k = 0; k < p.steps; k++) {
          // c exact sub-steps of length h/c: the noise of sub-step j decays by a^(c − 1 − j) to the end of the step.
          let noise = 0;
          for (let j = 0; j < c; j++) noise = noise * a + sd * z();
          x[k + 1] = p.theta + (x[k] - p.theta) * ah + noise;
        }
        return x;
      } };
    },
    reference(/** @type {Params} */ p) { return this.exact(p, false, "Exact transition: X_{k+1} = θ + (X_k − θ)e^(−κh) + σ √((1 − e^(−2κh))/(2κ)) Z_k (Box–Muller normals)"); },
    inverse(/** @type {Params} */ p) { return this.exact(p, true, "Exact transition, with each normal by the inverse transform Φ⁻¹(V)"); },
    rejection: () => none("A Gaussian transition needs no rejection, so the page has no rejection sampler for it."),
    euler(/** @type {Params} */ p) {
      const h = p.T / p.steps;
      return { label: "Euler–Maruyama: X_{k+1} = X_k + κ(θ − X_k)h + σ ΔW_k. Stable only for 0 < κh < 2", exactness: "not exact: time discretisation bias of order h", draw: (/** @type {Rng} */ rng) => {
        const z = () => rng.normal(), x = new Array(p.steps + 1);
        x[0] = p.x0;
        for (let k = 0; k < p.steps; k++) x[k + 1] = x[k] + p.kappa * (p.theta - x[k]) * h + p.sigma * dW(z, h, p.coarsen);
        return x;
      } };
    },
    conditions: (/** @type {Params} */ p) => {
      const h = p.T / p.steps, kh = p.kappa * h;
      return /** @type {Condition[]} */ ([
        { kind: "stationarity", holds: p.kappa > 0, text: p.kappa > 0 ? `κ > 0: the stationary law is N(θ, σ²/(2κ)) = N(${g4(p.theta)}, ${g4((p.sigma * p.sigma) / (2 * p.kappa))}). This path starts at X_0 = ${g4(p.x0)}. Its law approaches the stationary law at the rate e^(−κt). At t = ${g4(Math.log(100) / p.kappa)}, 1 % of the initial distance to θ remains.` : "κ ≤ 0: no stationary law. With κ = 0 the process is a Brownian motion; with κ < 0 it moves away from θ at the rate e^(|κ|t)." },
        { kind: "stability", holds: kh > 0 && kh < 2, text: `In each step, the Euler scheme multiplies the distance to θ by 1 − κh = ${g4(1 - kh)}. ${kh > 0 && kh < 2 ? "Thus |1 − κh| < 1, and the scheme is stable." : "Thus |1 − κh| ≥ 1: the Euler scheme is not stable, and its paths grow or oscillate. The exact process is stable."} The exact transition is stable for every h when κ > 0.` },
        { kind: "explosion", holds: false, text: "No explosion: X_t is finite for every t, almost surely." },
        { kind: "boundary", holds: null, text: "No boundary: the state space is the real line, so X_t can be negative (for example a negative interest rate)." },
        { kind: "discretisation", holds: true, text: `The exact transition has no time discretisation error (h = ${g4(h)}). The Euler scheme has the stationary variance σ²/(κ(2 − κh)) = ${kh > 0 && kh < 2 ? g4((p.sigma * p.sigma) / (p.kappa * (2 - kh))) : "none"} instead of σ²/(2κ).` },
      ]);
    },
  };

  /* ---------- Poisson process ---------- */

  /** The integrated intensity Λ(t) of λ(t) = λ(1 + a sin(2πt/P)). @param {Params} p @param {number} t */
  const Lambda = (p, t) => p.lambda * (t + (p.amp * p.period * (1 - Math.cos((2 * Math.PI * t) / p.period))) / (2 * Math.PI));
  /** @param {Params} p @param {number} t */
  const rate = (p, t) => p.lambda * (1 + p.amp * Math.sin((2 * Math.PI * t) / p.period));

  /** The time t with Λ(t) = y, by bisection on a non-decreasing Λ. @param {Params} p @param {number} y @param {number} lo @param {number} hi */
  function invLambda(p, y, lo, hi) {
    if (p.amp === 0) return y / p.lambda;
    for (let i = 0; i < 80 && hi - lo > 1e-14 * Math.max(1, hi); i++) { const m = (lo + hi) / 2; if (Lambda(p, m) < y) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  /** Counts on the grid from sorted or unsorted event times. @param {number[]} ts @param {Params} p */
  function binCounts(ts, p) {
    const n = new Array(p.steps + 1).fill(0), h = p.T / p.steps;
    for (const t of ts) if (t <= p.T) n[Math.max(1, Math.min(p.steps, Math.ceil(t / h - 1e-12)))]++;
    for (let k = 1; k <= p.steps; k++) n[k] += n[k - 1];
    n[0] = 0;
    return n;
  }

  const poissonprocess = {
    id: "poissonprocess", name: "Poisson process", kind: "process", family: "jump",
    params: [param("lambda", "rate λ > 0: the mean number of events for each unit of time"), param("amp", "relative amplitude a of a periodic rate λ(t) = λ(1 + a sin(2πt/P)), 0 ≤ a ≤ 1 (default 0)", "0"), param("period", "period P > 0 of the rate (default 1)", "1"), ...GRID],
    check: (/** @type {Params} */ p) => [...(inside(p.lambda, 1e-12, 1e7) ? [] : [`lambda = ${show(p.lambda)} is outside (0, 10^7].`]), ...(inside(p.amp, 0, 1) ? [] : [`amp = ${show(p.amp)} is outside [0, 1].`]),
      ...(inside(p.period, 1e-9, 1e9) ? [] : [`period = ${show(p.period)} is outside (0, 10^9].`]), ...checkGrid(p, false), ...(p.lambda * (1 + p.amp) * p.T <= 20000 ? [] : [`The mean number of events λ(1 + a)T = ${g4(p.lambda * (1 + p.amp) * p.T)} is above 20,000.`])],
    marginal: (/** @type {Params} */ p, /** @type {number} */ t) => { const m = Lambda(p, t); return { mean: m, sd: Math.sqrt(m), discrete: true, cdf: (/** @type {number} */ x) => (x < 0 ? 0 : L.BY_ID.poisson.cdf(Math.floor(x), { lambda: m })) }; },
    reference: (/** @type {Params} */ p) => ({ label: "Exact on the grid: independent increments N_{k+1} − N_k ~ Poisson(Λ(t_{k+1}) − Λ(t_k))", exactness: "exact at the grid times", draw: (/** @type {Rng} */ rng) => {
      const n = new Array(p.steps + 1);
      n[0] = 0;
      for (let k = 0; k < p.steps; k++) n[k + 1] = n[k] + L.poissonDraw(rng, Lambda(p, ((k + 1) * p.T) / p.steps) - Lambda(p, (k * p.T) / p.steps));
      return n;
    } }),
    inverse: (/** @type {Params} */ p) => ({ label: "Event times by the inverse transform: Γ_i = Γ_{i−1} − log V_i, then t_i = Λ⁻¹(Γ_i)", exactness: "exact", draw: (/** @type {Rng} */ rng) => {
      const ts = [], top = Lambda(p, p.T);
      let g = 0, last = 0;
      for (;;) {
        g -= Math.log(rng.uniform());
        if (g > top) break;
        last = invLambda(p, g, last, p.T);
        ts.push(last);
      }
      return binCounts(ts, p);
    } }),
    rejection: (/** @type {Params} */ p, /** @type {number} */ factor) => {
      const bar = p.lambda * (1 + p.amp) * factor;
      return { label: `Thinning (Lewis and Shedler, 1979): candidates at the rate λ̄ = ${g4(bar)}${factor === 1 ? " = max λ(t)" : `, ${factor} × max λ(t)`}, each kept with probability λ(t)/λ̄`, exactness: factor === 1 ? "exact" : "not exact: λ̄ is below the rate, so some candidates need a probability above 1",
        draw: (/** @type {Rng} */ rng, /** @type {RejectStats | undefined} */ stats) => {
          const ts = [];
          let t = 0;
          for (;;) {
            t -= Math.log(rng.uniform()) / bar;
            if (t > p.T) break;
            const ratio = rate(p, t) / bar;
            if (stats) { stats.proposals++; if (ratio > 1 + 1e-12) stats.violations++; }
            if (rng.uniform() <= ratio) { if (stats) stats.accepts++; ts.push(t); }
          }
          return binCounts(ts, p);
        } };
    },
    euler: (/** @type {Params} */ p) => {
      const h = p.T / p.steps;
      return { label: "Time discretisation: in each step, one event with probability λ(t_k)h and none otherwise", exactness: "not exact: at most one event in each step, bias of order λh", draw: (/** @type {Rng} */ rng) => {
        const n = new Array(p.steps + 1);
        n[0] = 0;
        for (let k = 0; k < p.steps; k++) n[k + 1] = n[k] + +(rng.uniform() < Math.min(1, rate(p, k * h) * h));
        return n;
      } };
    },
    conditions: (/** @type {Params} */ p) => {
      const h = p.T / p.steps;
      return /** @type {Condition[]} */ ([
        { kind: "stationarity", holds: p.amp === 0, text: p.amp === 0 ? "The increments are stationary and independent: N(t + s) − N(t) ~ Poisson(λs). The count itself grows, so its law is not stationary." : "The rate is periodic, so the increments are not stationary. They are still independent." },
        { kind: "stability", holds: null, text: `The count grows at the mean rate λ = ${g4(p.lambda)}. N(t)/t → λ almost surely.` },
        { kind: "explosion", holds: false, text: "No explosion: a bounded rate gives finitely many events in a finite time." },
        { kind: "boundary", holds: true, text: "N(t) is an integer, 0 at t = 0, and it never decreases." },
        { kind: "discretisation", holds: true, text: `The exact methods count every event. The time discretisation allows at most one event in each step: with λh = ${g4(p.lambda * (1 + p.amp) * h)}, it loses about (λh)²/2 events in each step.` },
      ]);
    },
  };

  /* ---------- compound Poisson process ---------- */

  const compoundprocess = {
    id: "compoundprocess", name: "Compound Poisson process", kind: "process", family: "jump",
    params: [param("x0", "initial value X_0 (default 0)", "0"), param("drift", "deterministic drift c for each unit of time (default 0)", "0"), param("lambda", "jump rate λ > 0"), param("jump", "mean jump size m ≠ 0: jumps are exponential with mean |m|, upward when m > 0 and downward when m < 0"), ...GRID],
    check: (/** @type {Params} */ p) => [...(inside(p.x0, -1e12, 1e12) ? [] : [`x0 = ${show(p.x0)} is outside [−10^12, 10^12].`]), ...(inside(p.drift, -1e9, 1e9) ? [] : [`drift = ${show(p.drift)} is outside [−10^9, 10^9].`]),
      ...(inside(p.lambda, 1e-12, 1e7) ? [] : [`lambda = ${show(p.lambda)} is outside (0, 10^7].`]), ...(inside(Math.abs(p.jump), 1e-12, 1e12) ? [] : [`jump = ${show(p.jump)}: |m| is outside (0, 10^12].`]),
      ...checkGrid(p, false), ...(p.lambda * p.T <= 20000 ? [] : [`The mean number of jumps λT = ${g4(p.lambda * p.T)} is above 20,000.`])],
    marginal: (/** @type {Params} */ p, /** @type {number} */ t) => ({ mean: p.x0 + p.drift * t + p.lambda * t * p.jump, sd: Math.sqrt(2 * p.lambda * t) * Math.abs(p.jump), discrete: false, cdf: null }),
    reference: (/** @type {Params} */ p) => {
      const h = p.T / p.steps, m = Math.abs(p.jump), sign = Math.sign(p.jump);
      return { label: "Exact on the grid: N_k ~ Poisson(λh) jumps in step k, and their sum ~ Gamma(N_k, |m|) (Marsaglia–Tsang)", exactness: "exact at the grid times", draw: (/** @type {Rng} */ rng) => {
        const x = new Array(p.steps + 1);
        x[0] = p.x0;
        for (let k = 0; k < p.steps; k++) { const n = L.poissonDraw(rng, p.lambda * h); x[k + 1] = x[k] + p.drift * h + (n ? sign * m * Cn.gamma(rng, n) : 0); }
        return x;
      } };
    },
    inverse: (/** @type {Params} */ p) => {
      const m = Math.abs(p.jump), sign = Math.sign(p.jump), h = p.T / p.steps;
      return { label: "Jump times from exponential gaps −log(V)/λ and jump sizes −|m| log(V), both by the inverse transform", exactness: "exact", draw: (/** @type {Rng} */ rng) => {
        const x = new Array(p.steps + 1).fill(0);
        let t = 0;
        for (;;) { t -= Math.log(rng.uniform()) / p.lambda; if (t > p.T) break; x[Math.max(1, Math.min(p.steps, Math.ceil(t / h - 1e-12)))] += -sign * m * Math.log(rng.uniform()); }
        x[0] = p.x0;
        for (let k = 1; k <= p.steps; k++) x[k] += x[k - 1] + p.drift * h;
        return x;
      } };
    },
    rejection: () => none("Exponential gaps and exponential jumps need no rejection, so the page has no rejection sampler for this process."),
    euler: (/** @type {Params} */ p) => {
      const h = p.T / p.steps, m = Math.abs(p.jump), sign = Math.sign(p.jump);
      return { label: "Time discretisation: in each step, one jump with probability λh and none otherwise", exactness: "not exact: at most one jump in each step, bias of order λh", draw: (/** @type {Rng} */ rng) => {
        const x = new Array(p.steps + 1);
        x[0] = p.x0;
        for (let k = 0; k < p.steps; k++) x[k + 1] = x[k] + p.drift * h + (rng.uniform() < Math.min(1, p.lambda * h) ? -sign * m * Math.log(rng.uniform()) : 0);
        return x;
      } };
    },
    conditions: (/** @type {Params} */ p) => {
      const net = p.drift + p.lambda * p.jump, h = p.T / p.steps;
      return /** @type {Condition[]} */ ([
        { kind: "stationarity", holds: false, text: "A Lévy process: the increments are stationary and independent, but the level is not stationary, because Var X_t = 2λ m² t grows." },
        { kind: "stability", holds: null, text: `The mean drift c + λm = ${g4(net)}: X_t/t → ${g4(net)} almost surely. ${p.jump < 0 && p.drift > 0 ? `Take X as a surplus with the premium rate c and claims of mean |m|. Its safety loading is c/(λ|m|) − 1 = ${g4(p.drift / (p.lambda * Math.abs(p.jump)) - 1)}. ${net > 0 ? "It is positive, so ruin in infinite time has a probability below 1." : "It is not positive, so ruin in infinite time is certain."}` : ""}` },
        { kind: "explosion", holds: false, text: "No explosion: finitely many jumps in a finite time." },
        { kind: "boundary", holds: null, text: "No boundary: a ruin level is part of the quantity, not of the process." },
        { kind: "discretisation", holds: true, text: `The exact methods add every jump at its step. A quantity of the grid values, such as min(X), does not see the path inside a step. The path is lowest just after a downward jump. Thus a grid of step h = ${g4(h)} can miss a short drop below a level.` },
      ]);
    },
  };

  /* ---------- finite-state Markov chain ---------- */

  /** The transition matrix of a chain, from a vector of k² entries row by row. @param {Params} p */
  function matrix(p) {
    const v = /** @type {number[]} */ (p.P), k = Math.round(Math.sqrt(v.length));
    return Array.from({ length: k }, (_, i) => v.slice(i * k, (i + 1) * k));
  }

  /** The distribution after n steps from state x0: e_{x0} Pⁿ, for n = 0..steps. @param {number[][]} Pm @param {number} x0 @param {number} steps */
  function distributions(Pm, x0, steps) {
    const k = Pm.length, out = [];
    let d = new Array(k).fill(0);
    d[x0 - 1] = 1;
    out.push(d);
    for (let n = 0; n < steps; n++) {
      const e = new Array(k).fill(0);
      for (let i = 0; i < k; i++) if (d[i]) for (let j = 0; j < k; j++) e[j] += d[i] * Pm[i][j];
      out.push((d = e));
    }
    return out;
  }

  /**
   * The structure of a chain: its closed communicating classes, the period of each, and the stationary law when
   * exactly one closed class exists (by Gaussian elimination of π(P − I) = 0 with Σπ = 1).
   * @param {number[][]} Pm
   */
  function chainStructure(Pm) {
    const k = Pm.length, reach = Pm.map((row, i) => row.map((x, j) => x > 0 || i === j));
    for (let m = 0; m < k; m++) for (let i = 0; i < k; i++) if (reach[i][m]) for (let j = 0; j < k; j++) if (reach[m][j]) reach[i][j] = true;
    /** @type {number[][]} */
    const classes = [];
    const seen = new Array(k).fill(false);
    for (let i = 0; i < k; i++) {
      if (seen[i]) continue;
      const cls = [];
      for (let j = 0; j < k; j++) if (reach[i][j] && reach[j][i]) { cls.push(j); seen[j] = true; }
      classes.push(cls);
    }
    const closed = classes.filter((cls) => cls.every((i) => Pm[i].every((x, j) => x === 0 || cls.includes(j))));
    /** The period of a class: the gcd of the differences of BFS levels across its edges. @param {number[]} cls */
    const period = (cls) => {
      const lvl = new Map([[cls[0], 0]]), queue = [cls[0]];
      let g = 0;
      /** @param {number} a @param {number} b @returns {number} */
      const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
      while (queue.length) {
        const i = /** @type {number} */ (queue.shift());
        for (const j of cls) if (Pm[i][j] > 0) {
          if (!lvl.has(j)) { lvl.set(j, /** @type {number} */ (lvl.get(i)) + 1); queue.push(j); }
          else g = gcd(g, /** @type {number} */ (lvl.get(i)) + 1 - /** @type {number} */ (lvl.get(j)));
        }
      }
      return g || 1;
    };
    let pi = null;
    if (closed.length === 1) {
      const A = Array.from({ length: k }, (_, i) => Array.from({ length: k + 1 }, (_, j) => (j === k ? 0 : Pm[j][i] - (i === j ? 1 : 0))));
      A[k - 1] = new Array(k + 1).fill(1);
      for (let col = 0; col < k; col++) {
        let piv = col;
        for (let r = col + 1; r < k; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
        [A[col], A[piv]] = [A[piv], A[col]];
        for (let r = 0; r < k; r++) if (r !== col && A[col][col] !== 0) { const f = A[r][col] / A[col][col]; for (let c2 = col; c2 <= k; c2++) A[r][c2] -= f * A[col][c2]; }
      }
      pi = A.map((row, i) => Math.max(0, row[k] / row[i]));
      const s = pi.reduce((a, b) => a + b, 0);
      pi = pi.map((x) => x / s);
    }
    return { classes, closed, periods: closed.map(period), pi, irreducible: classes.length === 1 };
  }

  /** The total variation distance of each start from π after n steps, the largest over the starts, for n up to cap. @param {number[][]} Pm @param {number[]} pi @param {number} cap */
  function mixing(Pm, pi, cap) {
    const k = Pm.length;
    let M = Pm.map((row) => row.slice());
    for (let n = 1; n <= cap; n++) {
      const d = Math.max(...M.map((row) => row.reduce((s, x, j) => s + Math.abs(x - pi[j]), 0) / 2));
      if (d <= 0.25) return n;
      const N = M.map((row) => { const e = new Array(k).fill(0); row.forEach((x, i) => { if (x) for (let j = 0; j < k; j++) e[j] += x * Pm[i][j]; }); return e; });
      M = N;
    }
    return null;
  }

  const markovchain = {
    id: "markovchain", name: "Finite-state Markov chain", kind: "process", family: "chain",
    params: [{ name: "P", kind: "vector", text: "transition matrix of k states, 2 ≤ k ≤ 20, as k² entries row by row; each row is a probability vector" }, { name: "x0", kind: "integer", text: "initial state, 1 to k" }, { name: "steps", kind: "integer", text: "number of steps, 1 to 4,096; the path has steps + 1 states" }],
    check: (/** @type {Params} */ p) => {
      if (!Array.isArray(p.P)) return ["P is a vector of k² transition probabilities, row by row."];
      const k = Math.round(Math.sqrt(p.P.length));
      if (k * k !== p.P.length || k < 2 || k > 20) return [`P has ${p.P.length} entries, which is not k² for a k in [2, 20].`];
      const e = [];
      for (let i = 0; i < k; i++) {
        const row = p.P.slice(i * k, (i + 1) * k);
        if (row.some((/** @type {number} */ x) => !(x >= 0))) e.push(`Row ${i + 1} of P has a negative entry.`);
        const s = row.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
        if (Math.abs(s - 1) > 1e-9) e.push(`Row ${i + 1} of P adds to ${g4(s)}, not 1.`);
      }
      if (!(Number.isInteger(p.x0) && p.x0 >= 1 && p.x0 <= k)) e.push(`x0 = ${show(p.x0)} is not a state in 1..${k}.`);
      if (!(Number.isInteger(p.steps) && p.steps >= 1 && p.steps <= MAX_STEPS)) e.push(`steps = ${show(p.steps)} is not an integer in [1, ${MAX_STEPS}].`);
      return e;
    },
    marginal: (/** @type {Params} */ p, /** @type {number} */ t) => {
      const d = distributions(matrix(p), p.x0, t)[t];
      const mean = d.reduce((s, x, i) => s + x * (i + 1), 0);
      return { mean, sd: Math.sqrt(Math.max(0, d.reduce((s, x, i) => s + x * (i + 1) * (i + 1), 0) - mean * mean)), discrete: true, cdf: (/** @type {number} */ x) => d.reduce((s, q, i) => s + (i + 1 <= x ? q : 0), 0), dist: d };
    },
    reference: (/** @type {Params} */ p) => {
      const rows = matrix(p).map((row) => L.alias(row));
      return { label: "Alias table for each row (Walker, Vose): one integer and one uniform for each step", exactness: "exact", draw: (/** @type {Rng} */ rng) => {
        const x = new Array(p.steps + 1);
        x[0] = p.x0;
        for (let k = 0; k < p.steps; k++) { const t = rows[x[k] - 1], i = rng.below(t.prob.length); x[k + 1] = 1 + (rng.uniform() < t.prob[i] ? i : t.al[i]); }
        return x;
      } };
    },
    inverse: (/** @type {Params} */ p) => {
      const cdfs = matrix(p).map((row) => { let F = 0; return row.map((x) => (F += x)); });
      return { label: "Inverse transform of each row: the first state j with F_i(j) ≥ V", exactness: "exact", draw: (/** @type {Rng} */ rng) => {
        const x = new Array(p.steps + 1);
        x[0] = p.x0;
        for (let k = 0; k < p.steps; k++) { const F = cdfs[x[k] - 1], u = rng.uniform(); let j = 0; while (j < F.length - 1 && F[j] < u) j++; x[k + 1] = j + 1; }
        return x;
      } };
    },
    rejection: () => none("A row of a finite chain is a categorical law. The alias table and the inverse transform are exact and cheap, so the page offers no rejection sampler."),
    euler(/** @type {Params} */ p) { return { ...this.reference(p), label: "The chain moves in discrete time, so no time discretisation applies: the method uses the exact alias sampler" }; },
    conditions: (/** @type {Params} */ p) => {
      const Pm = matrix(p), st = chainStructure(Pm);
      const ergodic = st.closed.length === 1 && st.periods[0] === 1;
      const tmix = ergodic && st.pi ? mixing(Pm, st.pi, 2000) : null;
      return /** @type {Condition[]} */ ([
        { kind: "stationarity", holds: st.closed.length === 1, text: st.closed.length === 1 ? `One closed class {${st.closed[0].map((i) => i + 1).join(", ")}}: the stationary law π = (${(st.pi ?? []).map(g4).join(", ")}) is unique.${st.irreducible ? " The chain is irreducible." : " The other states are transient."}` : `${st.closed.length} closed classes: each has its own stationary law, so the stationary law is not unique, and the long-run law depends on X_0.` },
        { kind: "stability", holds: ergodic, text: ergodic ? `Aperiodic: Pⁿ(x, ·) → π for every x. The mixing time t_mix(1/4), the first n with max over x of ‖Pⁿ(x, ·) − π‖_TV ≤ 1/4, is ${tmix ?? "above 2,000"}.` : st.closed.length === 1 ? `The closed class has period ${st.periods[0]}: Pⁿ(x, ·) does not converge, but the time averages still converge to π.` : "The chain is not ergodic: its long-run behaviour depends on the closed class it enters." },
        { kind: "explosion", holds: false, text: "No explosion: a finite chain in discrete time makes one step for each unit of time." },
        { kind: "boundary", holds: null, text: (() => { const abs = Pm.map((row, i) => row[i] === 1 ? i + 1 : 0).filter(Boolean); return abs.length ? `Absorbing states: ${abs.join(", ")}.` : "No absorbing state."; })() },
        { kind: "discretisation", holds: true, text: "None: the chain is in discrete time, and each method draws the exact transitions." },
      ]);
    },
  };

  /* ---------- Galton-Watson branching ---------- */

  /** The offspring PGF f(s) for Poisson (k = ∞) or negative binomial offspring of mean m and dispersion k. @param {Params} p @param {number} s */
  const pgf = (p, s) => (p.k === Infinity ? Math.exp(p.m * (s - 1)) : Math.pow(1 + (p.m * (1 - s)) / p.k, -p.k));

  /** P(Z_n = 0) for one ancestor: f iterated n times at 0. @param {Params} p @param {number} n */
  function extinctBy(p, n) {
    let s = 0;
    for (let i = 0; i < n; i++) s = pgf(p, s);
    return s;
  }

  /** The extinction probability q of one ancestor: the smallest root of f(s) = s, by iteration from 0. @param {Params} p */
  function extinction(p) {
    if (p.m <= 1) return 1;
    let s = 0;
    for (let i = 0; i < 100000; i++) { const t = pgf(p, s); if (Math.abs(t - s) < 1e-16) return t; s = t; }
    return s;
  }

  const branching = {
    id: "branching", name: "Galton–Watson branching process", kind: "process", family: "branching",
    params: [{ name: "z0", kind: "integer", text: "number of ancestors Z_0, 0 to 10^6 (default 1)", default: "1" }, param("m", "mean number of offspring m > 0"), param("k", "dispersion k > 0 of negative binomial offspring; k = inf gives Poisson offspring (default inf)", "inf"), { name: "steps", kind: "integer", text: "number of generations, 1 to 200" }],
    check: (/** @type {Params} */ p) => [...(Number.isInteger(p.z0) && p.z0 >= 0 && p.z0 <= 1e6 ? [] : [`z0 = ${show(p.z0)} is not an integer in [0, 10^6].`]), ...(inside(p.m, 1e-9, 100) ? [] : [`m = ${show(p.m)} is outside (0, 100].`]),
      ...(p.k === Infinity || inside(p.k, 1e-6, 1e9) ? [] : [`k = ${show(p.k)} is not inf or a number in [10^−6, 10^9].`]), ...(Number.isInteger(p.steps) && p.steps >= 1 && p.steps <= 200 ? [] : [`steps = ${show(p.steps)} is not an integer in [1, 200].`]),
      ...(p.z0 * Math.pow(p.m, p.steps) <= 1e12 ? [] : [`The mean size of the last generation, z0 m^steps = ${g4(p.z0 * Math.pow(p.m, p.steps))}, is above 10^12.`])],
    marginal: (/** @type {Params} */ p, /** @type {number} */ n) => ({ mean: p.z0 * Math.pow(p.m, n), sd: null, discrete: true, cdf: null, p0: Math.pow(extinctBy(p, n), p.z0) }),
    gen(/** @type {Params} */ p, /** @type {(rng: Rng, z: number) => number} */ next, /** @type {string} */ label) {
      return { label, exactness: "exact", draw: (/** @type {Rng} */ rng) => {
        const z = new Array(p.steps + 1);
        z[0] = p.z0;
        for (let n = 0; n < p.steps; n++) z[n + 1] = z[n] === 0 ? 0 : next(rng, z[n]);
        return z;
      } };
    },
    reference(/** @type {Params} */ p) {
      return this.gen(p, p.k === Infinity ? (rng, z) => L.poissonDraw(rng, z * p.m) : (rng, z) => L.poissonDraw(rng, Cn.gamma(rng, z * p.k) * (p.m / p.k)),
        p.k === Infinity ? "Generation by generation: the offspring of Z_n individuals add to Z_{n+1} ~ Poisson(m Z_n)" : "Generation by generation: Z_{n+1} ~ negative binomial(k Z_n, k/(k + m)), as Poisson(Λ) with Λ ~ Gamma(k Z_n, m/k)");
    },
    inverse(/** @type {Params} */ p) {
      if (p.z0 * Math.pow(Math.max(1, p.m), p.steps) > 1e6) return none("The inverse transform searches the support step by step, so its cost grows with the generation size. The page offers it when z0 · max(1, m)^steps ≤ 10^6.");
      const law = p.k === Infinity ? L.BY_ID.poisson : L.BY_ID.negbin;
      return this.gen(p, (rng, z) => /** @type {any} */ (law.inverse(p.k === Infinity ? { lambda: z * p.m } : { r: z * p.k, p: p.k / (p.k + p.m) })).draw(rng),
        `Generation by generation: Z_{n+1} by the inverse transform of the ${p.k === Infinity ? "Poisson" : "negative binomial"} law of the total offspring, by sequential search from the mode`);
    },
    rejection: () => none("The total offspring of a generation has an exact sampler, so the page has no rejection sampler for it."),
    euler(/** @type {Params} */ p) { return { ...this.reference(p), label: "The process moves in generations, so no time discretisation applies: the method uses the exact sampler" }; },
    conditions: (/** @type {Params} */ p) => {
      const q = extinction(p), crit = p.m < 1 ? "subcritical" : p.m === 1 ? "critical" : "supercritical";
      return /** @type {Condition[]} */ ([
        { kind: "stationarity", holds: false, text: "The only stationary law is the point mass at 0: 0 is absorbing." },
        { kind: "stability", holds: p.m <= 1, text: `m = ${g4(p.m)}: the process is ${crit}. ${p.m <= 1 ? "Extinction is certain (m = 1 needs offspring that are not always exactly 1)." : `The extinction probability of one line is q = ${g4(q)}, the smallest root of f(s) = s. With ${p.z0} ancestors it is q^z0 = ${g4(Math.pow(q, p.z0))}. On survival, Z_n grows like mⁿ.`}` },
        { kind: "explosion", holds: false, text: "No explosion: with a finite mean m, each generation is finite almost surely." },
        { kind: "boundary", holds: true, text: "0 is absorbing: once Z_n = 0, all later generations are 0." },
        { kind: "discretisation", holds: true, text: "None: the process moves in generations, and each method draws the exact law of the next generation." },
      ]);
    },
  };

  /* ---------- Hawkes process with an exponential kernel ---------- */

  /** E N(t) for the Hawkes process that starts with no history. @param {Params} p @param {number} t */
  function hawkesMean(p, t) {
    const d = p.beta - p.alpha;
    if (Math.abs(d * t) < 1e-9) return p.mu * t + (p.alpha * p.mu * t * t) / 2;
    return (p.beta * p.mu * t) / d + (p.alpha * p.mu * Math.expm1(-d * t)) / (d * d);
  }

  /** Count events and check the event cap. @param {number[]} ts @param {Params} p */
  function capped(ts, p) {
    if (ts.length > MAX_EVENTS) throw new Error(`A Hawkes path has more than ${MAX_EVENTS} events: the branching ratio α/β = ${g4(p.alpha / p.beta)} makes the count grow too fast for this horizon.`);
    return binCounts(ts, p);
  }

  const hawkes = {
    id: "hawkes", name: "Hawkes process", kind: "process", family: "hawkes",
    params: [param("mu", "baseline rate μ > 0"), param("alpha", "jump α ≥ 0 of the intensity at each event"), param("beta", "decay rate β > 0 of the excitation"), ...GRID],
    check: (/** @type {Params} */ p) => [...(inside(p.mu, 1e-12, 1e6) ? [] : [`mu = ${show(p.mu)} is outside (0, 10^6].`]), ...(inside(p.alpha, 0, 1e6) ? [] : [`alpha = ${show(p.alpha)} is outside [0, 10^6].`]),
      ...(inside(p.beta, 1e-9, 1e6) ? [] : [`beta = ${show(p.beta)} is outside (0, 10^6].`]), ...checkGrid(p, false),
      ...(hawkesMean(p, p.T) <= 20000 ? [] : [`The expected number of events E N(T) = ${g4(hawkesMean(p, p.T))} is above 20,000. With the branching ratio α/β = ${g4(p.alpha / p.beta)}${p.alpha >= p.beta ? " ≥ 1" : ""}, lower T or α.`])],
    marginal: (/** @type {Params} */ p, /** @type {number} */ t) => ({ mean: hawkesMean(p, t), sd: null, discrete: true, cdf: null }),
    reference: (/** @type {Params} */ p) => ({ label: "Cluster representation (Hawkes and Oakes, 1974): immigrants at the rate μ, and each event has Poisson(α/β) children after Exp(β) delays", exactness: "exact", draw: (/** @type {Rng} */ rng) => {
      /** @type {number[]} */
      const ts = [], n = p.alpha / p.beta;
      let t = 0;
      for (;;) { t -= Math.log(rng.uniform()) / p.mu; if (t > p.T) break; ts.push(t); }
      for (let i = 0; i < ts.length; i++) {
        const kids = L.poissonDraw(rng, n);
        for (let c = 0; c < kids; c++) { const at = ts[i] - Math.log(rng.uniform()) / p.beta; if (at <= p.T) ts.push(at); }
        if (ts.length > MAX_EVENTS) break;
      }
      return capped(ts, p);
    } }),
    inverse: (/** @type {Params} */ p) => ({ label: "Exact inter-event times by the inverse transform (Dassios and Zhao, 2013). Each gap is the smaller of −log(V_1)/μ and −log(1 + β log(V_2)/y)/β, with the excitation y", exactness: "exact", draw: (/** @type {Rng} */ rng) => {
      const ts = [];
      let t = 0, y = 0;
      for (;;) {
        const s1 = -Math.log(rng.uniform()) / p.mu, D = y > 0 ? 1 + (p.beta * Math.log(rng.uniform())) / y : 0;
        const tau = Math.min(s1, D > 0 ? -Math.log(D) / p.beta : Infinity);
        t += tau;
        if (t > p.T || ts.length > MAX_EVENTS) break;
        y = y * Math.exp(-p.beta * tau) + p.alpha;
        ts.push(t);
      }
      return capped(ts, p);
    } }),
    rejection: (/** @type {Params} */ p, /** @type {number} */ factor) => ({ label: `Ogata's thinning (1981). Candidates come at the rate λ̄ = ${factor === 1 ? "λ(t+)" : `${factor} × λ(t+)`}, the intensity after the last point, which bounds λ until the next event. The method keeps each with probability λ(t)/λ̄`,
      exactness: factor === 1 ? "exact" : "not exact: λ̄ is below the intensity, so some candidates need a probability above 1", draw: (/** @type {Rng} */ rng, /** @type {RejectStats | undefined} */ stats) => {
        const ts = [];
        let t = 0, y = 0;
        for (;;) {
          const bar = (p.mu + y) * factor, w = -Math.log(rng.uniform()) / bar;
          t += w;
          if (t > p.T || ts.length > MAX_EVENTS) break;
          y *= Math.exp(-p.beta * w);
          const ratio = (p.mu + y) / bar;
          if (stats) { stats.proposals++; if (ratio > 1 + 1e-12) stats.violations++; }
          if (rng.uniform() <= ratio) { if (stats) stats.accepts++; ts.push(t); y += p.alpha; }
        }
        return capped(ts, p);
      } }),
    euler: (/** @type {Params} */ p) => {
      const h = p.T / p.steps, decay = Math.exp(-p.beta * h);
      return { label: "Time discretisation: in each step, Poisson((μ + y_k)h) events with the excitation y_k frozen, then y_{k+1} = y_k e^(−βh) + α × (events)", exactness: "not exact: the intensity is frozen in each step, bias of order h", draw: (/** @type {Rng} */ rng) => {
        const n = new Array(p.steps + 1);
        n[0] = 0;
        let y = 0;
        for (let k = 0; k < p.steps; k++) {
          const e = L.poissonDraw(rng, (p.mu + y) * h);
          n[k + 1] = n[k] + e;
          if (n[k + 1] > MAX_EVENTS) throw new Error(`A Hawkes path has more than ${MAX_EVENTS} events.`);
          y = y * decay + p.alpha * e;
        }
        return n;
      } };
    },
    conditions: (/** @type {Params} */ p) => {
      const br = p.alpha / p.beta, h = p.T / p.steps;
      return /** @type {Condition[]} */ ([
        { kind: "stationarity", holds: br < 1, text: br < 1 ? `The branching ratio n = α/β = ${g4(br)} < 1: a stationary version exists with the mean rate μ/(1 − n) = ${g4(p.mu / (1 - br))}. This path starts with no history, so its rate rises toward that level at the rate e^(−(β − α)t).` : `The branching ratio n = α/β = ${g4(br)} ≥ 1: no stationary version exists, and E N(t) grows ${br > 1 ? "exponentially" : "as t²"}.` },
        { kind: "stability", holds: br < 1, text: `Each event has on average n = ${g4(br)} direct children, so a cluster has ${br < 1 ? `on average 1/(1 − n) = ${g4(1 / (1 - br))} events` : "no finite mean size"}.` },
        { kind: "explosion", holds: false, text: "No explosion in finite time with the exponential kernel: the number of events on [0, T] is finite almost surely, for every n." },
        { kind: "boundary", holds: true, text: "N(t) is an integer, 0 at t = 0, and it never decreases." },
        { kind: "discretisation", holds: true, text: `The exact methods simulate the event times. The time discretisation freezes the intensity in each step of length h = ${g4(h)}: its bias is of order (α + β)h = ${g4((p.alpha + p.beta) * h)} relative to the count.` },
      ]);
    },
  };

  /* ---------- variance gamma ---------- */

  const variancegamma = {
    id: "variancegamma", name: "Variance-gamma Lévy process", kind: "process", family: "levy",
    params: [param("x0", "initial value X_0 (default 0)", "0"), param("theta", "drift θ of the subordinated Brownian motion"), param("sigma", "volatility σ ≥ 0"), param("nu", "variance rate ν > 0 of the gamma time change"), ...GRID],
    check: (/** @type {Params} */ p) => [...(inside(p.x0, -1e12, 1e12) ? [] : [`x0 = ${show(p.x0)} is outside [−10^12, 10^12].`]), ...(inside(p.theta, -1e6, 1e6) ? [] : [`theta = ${show(p.theta)} is outside [−10^6, 10^6].`]),
      ...(inside(p.sigma, 0, 1e6) ? [] : [`sigma = ${show(p.sigma)} is outside [0, 10^6].`]), ...(inside(p.nu, 1e-6, 1e3) ? [] : [`nu = ${show(p.nu)} is outside [10^−6, 1000].`]), ...checkGrid(p, false)],
    marginal: (/** @type {Params} */ p, /** @type {number} */ t) => ({ mean: p.x0 + p.theta * t, sd: Math.sqrt((p.sigma * p.sigma + p.theta * p.theta * p.nu) * t), discrete: false, cdf: null }),
    vg(/** @type {Params} */ p, /** @type {boolean} */ inv, /** @type {string} */ label) {
      const h = p.T / p.steps;
      return { label, exactness: "exact at the grid times", draw: (/** @type {Rng} */ rng) => {
        const z = normals(rng, inv), x = new Array(p.steps + 1);
        x[0] = p.x0;
        for (let k = 0; k < p.steps; k++) { const g = Cn.gamma(rng, h / p.nu) * p.nu; x[k + 1] = x[k] + p.theta * g + p.sigma * Math.sqrt(g) * z(); }
        return x;
      } };
    },
    reference(/** @type {Params} */ p) { return this.vg(p, false, "Exact on the grid: gamma time steps ΔG ~ Gamma(h/ν, ν), then ΔX = θ ΔG + σ √ΔG Z (Madan, Carr and Chang, 1998)"); },
    inverse(/** @type {Params} */ p) { return this.vg(p, true, "Exact on the grid. The normals come from the inverse transform, and the gamma steps from Marsaglia–Tsang"); },
    rejection: () => none("The gamma steps come from Marsaglia–Tsang, which is itself a rejection method. The page offers no other rejection sampler."),
    euler(/** @type {Params} */ p) { return { ...this.reference(p), label: "The increments are exact on any grid, so no time discretisation applies: the method uses the exact sampler" }; },
    conditions: (/** @type {Params} */ p) => /** @type {Condition[]} */ ([
      { kind: "stationarity", holds: false, text: `A Lévy process: stationary and independent increments. The level is not stationary: Var X_t = (σ² + θ²ν)t grows.` },
      { kind: "stability", holds: null, text: `X_t/t → θ = ${g4(p.theta)} almost surely. The increments have all moments, with skewness from θ and excess kurtosis from ν.` },
      { kind: "explosion", holds: false, text: "No explosion: infinitely many small jumps, but X_t is finite for every t." },
      { kind: "boundary", holds: null, text: "No boundary: the state space is the real line." },
      { kind: "discretisation", holds: true, text: "The grid values are exact. The path has infinitely many jumps in each step, and the grid does not show them. Thus the largest grid value is below the largest path value." },
    ]),
  };

  const PROCESSES = [brownian, gbm, ou, poissonprocess, compoundprocess, markovchain, branching, hawkes, variancegamma];
  /** @type {Record<string, any>} */
  const BY_ID = Object.fromEntries(PROCESSES.map((x) => [x.id, x]));
  for (const x of PROCESSES) {
    Object.assign(x, {
      dim: (/** @type {Params} */ p) => p.steps + 1,
      cost: (/** @type {Params} */ p) => (p.steps ?? 1) * (p.coarsen ?? 1) + 1,
      support: (/** @type {Params} */ p) => (x.id === "markovchain" ? { lo: 1, hi: Math.round(Math.sqrt(p.P.length)) } : ["poissonprocess", "branching", "hawkes"].includes(x.id) ? { lo: 0, hi: Infinity } : x.id === "gbm" ? { lo: 0, hi: Infinity } : { lo: -Infinity, hi: Infinity }),
      moments: () => ({ mean: null, variance: null, order: Infinity }),
      supportText: (/** @type {Params} */ p) => `a path of ${p.steps + 1} values at t = ${x.id === "markovchain" || x.id === "branching" ? "0, 1, …" : "0, h, …, T"}, h = ${x.id === "markovchain" || x.id === "branching" ? 1 : g4(p.T / p.steps)}`,
      times,
    });
  }

  /* ---------- reference values of path quantities ---------- */

  /** True when a tree reads no random variable or definition. @param {any} tree @param {any} c */
  const fixed = (tree, c) => [...E.names(tree)].every((n) => c.kinds.get(n) === "param");

  /**
   * P(max of X on [0, T] ≥ b) in continuous time for X_t = x0 + μt + σW_t and b > x0, by the reflection principle
   * with drift (Borodin and Salminen, 2002, 1.2.4).
   * @param {number} x0 @param {number} mu @param {number} sigma @param {number} T @param {number} b
   */
  function passUp(x0, mu, sigma, T, b) {
    if (b <= x0) return 1;
    if (sigma === 0) return +(x0 + mu * T >= b);
    const a = b - x0, s = sigma * Math.sqrt(T);
    return Math.min(1, 1 - Phi((a - mu * T) / s) + Math.exp((2 * mu * a) / (sigma * sigma)) * Phi((-a - mu * T) / s));
  }

  /**
   * Reference values of path quantities of one process variable X with parameters free of random variables: E[X[k]],
   * E[last(X)], E[mean(X)], affine combinations of these, E[(X_T − K)⁺] and E[(K − X_T)⁺] for normal and lognormal
   * marginals, P(X[k] op c) from the marginal law, P(X[k] = 0) for branching, the occupation of a chain state,
   * and P(max X ≥ b) or P(min X ≤ b) in continuous time for Brownian motion and geometric Brownian motion. Returns,
   * for each quantity, { value, exact, how } or null.
   * @param {any} c a compiled model @param {number} a @param {(node: any, env: any[]) => { params: any, error: string }} argsAt
   */
  function closed(c, a, argsAt) {
    const env = c.alternatives[a].values;
    const procs = c.nodes.filter((/** @type {any} */ n) => n.type === "var" && n.law.kind === "process" && n.constant && n.repeat === 1);
    if (!procs.length) return c.quantities.map(() => null);
    /** @param {any} t @returns {number | null} */
    const val = (t) => { const v = E.compile(t, c.slots)(env); return typeof v === "number" && Number.isFinite(v) ? v : null; };
    /** The process node, its parameters and the grid index of a reference to its value: X[k], last(X). @param {any} t */
    const point = (t) => {
      let name = null, k = null;
      if (t.t === "idx" && t.a.t === "id" && fixed(t.i, c)) { name = t.a.name; const i = val(t.i); k = i === null ? null : i - 1; }
      else if (t.t === "call" && t.fn === "last" && t.args[0].t === "id") { name = t.args[0].name; k = -1; }
      const node = procs.find((/** @type {any} */ n) => n.name === name);
      if (!node || k === null) return null;
      const p = argsAt(node, env).params;
      if (node.law.check(p).length) return null;
      const kk = k === -1 ? p.steps : k;
      if (!(Number.isInteger(kk) && kk >= 0 && kk <= p.steps)) return null;
      const t0 = node.law.times(p)[kk];
      return { node, p, k: kk, t: t0, m: node.law.marginal(p, node.law.id === "markovchain" || node.law.id === "branching" ? kk : t0) };
    };
    /** The process node of a whole-path reference X. @param {any} t */
    const whole = (t) => {
      if (t.t !== "id") return null;
      const node = procs.find((/** @type {any} */ n) => n.name === t.name);
      if (!node) return null;
      const p = argsAt(node, env).params;
      return node.law.check(p).length ? null : { node, p };
    };
    let exact = true;
    /** @type {string[]} */
    const how = [];
    /** E[t] for an affine combination of path values. @param {any} t @returns {number | null} */
    const expect = (t) => {
      if (fixed(t, c)) return val(t);
      if (t.t === "un" && t.op === "-") { const x = expect(t.a); return x === null ? null : -x; }
      if (t.t === "bin" && (t.op === "+" || t.op === "-")) { const x = expect(t.a), y = expect(t.b); return x === null || y === null ? null : t.op === "+" ? x + y : x - y; }
      if (t.t === "bin" && t.op === "*") { if (fixed(t.a, c)) { const x = val(t.a), y = expect(t.b); return x === null || y === null ? null : x * y; } if (fixed(t.b, c)) { const x = expect(t.a), y = val(t.b); return x === null || y === null ? null : x * y; } return null; }
      if (t.t === "bin" && t.op === "/" && fixed(t.b, c)) { const x = expect(t.a), y = val(t.b); return x === null || y === null || y === 0 ? null : x / y; }
      const pt = point(t);
      if (pt) { if (pt.m.mean === null) return null; how.push(`the mean of the ${pt.node.law.name} at t = ${g4(pt.t)}`); return pt.m.mean; }
      if (t.t === "call" && t.fn === "mean" && t.args.length === 1) {
        const w = whole(t.args[0]);
        if (w) {
          const ts = w.node.law.times(w.p), d = w.node.law.id === "markovchain" || w.node.law.id === "branching";
          let s = 0;
          for (let k = 0; k <= w.p.steps; k++) { const m = w.node.law.marginal(w.p, d ? k : ts[k]).mean; if (m === null) return null; s += m; }
          how.push("the average of the means at the grid times");
          return s / (w.p.steps + 1);
        }
        const inner = t.args[0];
        if (inner.t === "bin" && inner.op === "==" && fixed(inner.b, c)) {
          const w2 = whole(inner.a);
          if (w2 && w2.node.law.id === "markovchain") {
            const j = val(inner.b), ds = distributions(matrix(w2.p), w2.p.x0, w2.p.steps);
            if (j === null) return null;
            how.push("the average of the state probabilities e_{x0} Pⁿ");
            return ds.reduce((s, d) => s + (d[j - 1] ?? 0), 0) / ds.length;
          }
        }
        return null;
      }
      if (t.t === "call" && (t.fn === "max" || t.fn === "pmax") && t.args.length === 2) {
        const [x, y] = t.args, zero = (/** @type {any} */ z) => fixed(z, c) && val(z) === 0;
        const inner = zero(y) ? x : zero(x) ? y : null;
        if (!inner || inner.t !== "bin" || inner.op !== "-") return null;
        const up = point(inner.a), down = point(inner.b);
        const pt = up && fixed(inner.b, c) ? up : down && fixed(inner.a, c) ? down : null;
        if (!pt || pt.m.mean === null) return null;
        const K = val(up && pt === up ? inner.b : inner.a);
        if (K === null) return null;
        const call = pt === up;
        if (pt.node.law.id === "gbm") {
          const p = pt.p, F = p.s0 * Math.exp(p.mu * pt.t), s = p.sigma * Math.sqrt(pt.t);
          if (s === 0) return call ? Math.max(F - K, 0) : Math.max(K - F, 0);
          if (K <= 0) return call ? F - K : 0;
          const d1 = (Math.log(F / K) + (s * s) / 2) / s, d2 = d1 - s;
          how.push("the Black–Scholes formula for the lognormal law");
          return call ? F * Phi(d1) - K * Phi(d2) : K * Phi(-d2) - F * Phi(-d1);
        }
        if (["brownian", "ou"].includes(pt.node.law.id)) {
          const m = pt.m.mean, s = /** @type {number} */ (pt.m.sd), z = call ? (m - K) / s : (K - m) / s;
          if (s === 0) return Math.max(call ? m - K : K - m, 0);
          how.push("the normal law: E[(X − K)⁺] = (m − K)Φ(z) + s φ(z)");
          return s * (z * Phi(z) + Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI));
        }
        return null;
      }
      return null;
    };
    /** P(t ≠ 0) for comparisons of path values. @param {any} t @returns {number | null} */
    const prob = (t) => {
      if (t.t === "call" && (t.fn === "any" || t.fn === "all") && t.args[0].t === "bin") {
        const b = t.args[0], ops = t.fn === "any" ? { ">=": "max>=", ">": "max>", "<=": "min<=", "<": "min<" } : { ">": "min>", ">=": "min>=", "<": "max<", "<=": "max<=" };
        const key = /** @type {Record<string, string>} */ (ops)[b.op];
        if (!key || !fixed(b.b, c)) return null;
        return extreme(key.slice(0, 3), key.slice(3), b.a, b.b);
      }
      if (t.t !== "bin" || !["<", "<=", ">", ">=", "==", "!="].includes(t.op)) return null;
      let lhs = t.a, rhs = t.b, op = t.op;
      if (!fixed(rhs, c)) { [lhs, rhs] = [rhs, lhs]; op = /** @type {Record<string, string>} */ ({ "<": ">", "<=": ">=", ">": "<", ">=": "<=", "==": "==", "!=": "!=" })[op]; }
      if (!fixed(rhs, c)) return null;
      if (lhs.t === "call" && (lhs.fn === "max" || lhs.fn === "min") && lhs.args.length === 1) return extreme(lhs.fn, op, lhs.args[0], rhs);
      const pt = point(lhs), v = val(rhs);
      if (!pt || v === null) return null;
      if (pt.node.law.id === "branching") {
        const p0 = pt.m.p0;
        how.push("the offspring PGF iterated n times at 0");
        if ((op === "==" || op === "<=") && v === 0) return p0;
        if ((op === ">" && v === 0) || (op === ">=" && v === 1) || (op === "!=" && v === 0)) return 1 - p0;
        return null;
      }
      const F = pt.m.cdf;
      if (!F) return null;
      how.push(`the law of the ${pt.node.law.name} at t = ${g4(pt.t)}`);
      if (pt.m.discrete) {
        const le = (/** @type {number} */ x) => F(Math.floor(x)), lt = (/** @type {number} */ x) => F(Math.ceil(x) - 1);
        switch (op) {
          case "<=": return le(v);
          case "<": return lt(v);
          case ">": return 1 - le(v);
          case ">=": return 1 - lt(v);
          case "==": return Number.isInteger(v) ? F(v) - F(v - 1) : 0;
          default: return Number.isInteger(v) ? 1 - (F(v) - F(v - 1)) : 1;
        }
      }
      if (op === "==" ) return 0;
      if (op === "!=") return 1;
      return op === "<" || op === "<=" ? F(v) : 1 - F(v);
    };
    /** P(max X op b) or P(min X op b) in continuous time. @param {string} fn @param {string} op @param {any} x @param {any} bt */
    const extreme = (fn, op, x, bt) => {
      const w = whole(x), b = val(bt);
      if (!w || b === null || !["brownian", "gbm"].includes(w.node.law.id)) return null;
      const p = w.p, gbmLaw = w.node.law.id === "gbm";
      if (gbmLaw && b <= 0) return fn === "max" ? (op.startsWith(">") ? 1 : 0) : op.startsWith("<") ? 0 : 1;
      const x0 = gbmLaw ? Math.log(p.s0) : p.x0, mu = gbmLaw ? p.mu - (p.sigma * p.sigma) / 2 : p.mu, lb = gbmLaw ? Math.log(b) : b;
      // P(max ≥ b), or P(min ≤ b) = P(max of −X ≥ −b).
      const hit = fn === "max" ? passUp(x0, mu, p.sigma, p.T, lb) : passUp(-x0, -mu, p.sigma, p.T, -lb);
      exact = false;
      how.push(`the reflection principle in continuous time; the run sees the path at ${p.steps + 1} grid times only, so its estimate differs by the monitoring bias`);
      const reached = fn === "max" ? op === ">=" || op === ">" : op === "<=" || op === "<";
      return reached ? hit : 1 - hit;
    };
    return c.quantities.map((/** @type {any} */ q) => {
      exact = true;
      how.length = 0;
      try {
        const tree = C.inline(q.trees[0], c);
        const v = q.kind === "expectation" ? expect(tree) : q.kind === "probability" ? prob(tree) : null;
        if (v === null || !Number.isFinite(v)) return null;
        return { value: v, exact, continuous: !exact, how: `${exact ? "closed form" : "continuous-time closed form"}: ${[...new Set(how)].join("; ")}` };
      } catch {
        return null;
      }
    });
  }

  /** The level of a first-passage quantity of each process variable, from the trees of the model: max(X) ≥ b, any(X ≥ b), first(X ≥ b), and the same with min and ≤. @param {any} c @param {any} node @param {any} env */
  function passageLevel(c, node, env) {
    /** @type {{ value: number, up: boolean }[]} */
    const found = [];
    /** @param {any} t @param {boolean} up */
    const take = (t, up) => { const v = E.compile(t, c.slots)(env); if (typeof v === "number") found.push({ value: v, up }); };
    const fixed = (/** @type {any} */ t) => [...E.names(t)].every((n) => c.kinds.get(n) === "param");
    /** @param {any} t @param {number} depth */
    const visit = (t, depth) => {
      if (!t || found.length || depth > 16) return;
      if (t.t === "id" && c.kinds.get(t.name) === "def") { visit(c.nodes.find((/** @type {any} */ n) => n.name === t.name).tree, depth + 1); return; }
      const cmp = (/** @type {any} */ b) => b && b.t === "bin" && ["<", "<=", ">", ">="].includes(b.op);
      const isX = (/** @type {any} */ x) => x?.t === "id" && x.name === node.name;
      if (t.t === "call" && ["any", "all", "first"].includes(t.fn) && cmp(t.args[0]) && isX(t.args[0].a) && fixed(t.args[0].b)) take(t.args[0].b, t.args[0].op[0] === ">");
      else if (cmp(t) && t.a.t === "call" && (t.a.fn === "max" || t.a.fn === "min") && t.a.args.length === 1 && isX(t.a.args[0]) && fixed(t.b)) take(t.b, t.a.fn === "max");
      for (const k of ["a", "b", "i"]) if (t[k]) visit(t[k], depth);
      for (const x of t.args ?? []) visit(x, depth);
    };
    for (const q of c.quantities) for (const t of q.trees) visit(C.inline(t, c), 0);
    return found.length && Number.isFinite(found[0].value) ? found[0] : null;
  }


  /* ---------- ensemble bands ---------- */

  /**
   * The grid points and the window of an ensemble band: at most 65 grid indices of a path of length len, and a
   * window [lo, hi] cut into bins.
   * @param {number} len @param {number} lo @param {number} hi @param {number} [bins]
   */
  function bandSpec(len, lo, hi, bins = 48) {
    const n = Math.min(len, 65), idx = Array.from({ length: n }, (_, i) => Math.round((i * (len - 1)) / Math.max(1, n - 1)));
    return { idx, lo, hi: hi > lo ? hi : lo + 1, bins };
  }

  /** An empty band. @param {{ idx: number[], bins: number }} spec */
  const bandNew = (spec) => ({ n: 0, counts: new Array(spec.idx.length * spec.bins).fill(0), under: new Array(spec.idx.length).fill(0), over: new Array(spec.idx.length).fill(0), mean: new Array(spec.idx.length).fill(0), m2: new Array(spec.idx.length).fill(0) });

  /** Add one path to a band. @param {any} b @param {{ idx: number[], lo: number, hi: number, bins: number }} spec @param {number[] | number} path */
  function bandAdd(b, spec, path) {
    if (typeof path === "number") return;
    const n = ++b.n, w = (spec.hi - spec.lo) / spec.bins;
    spec.idx.forEach((k, i) => {
      const x = path[Math.min(k, path.length - 1)];
      const d = x - b.mean[i];
      b.mean[i] += d / n;
      b.m2[i] += d * (x - b.mean[i]);
      const j = Math.floor((x - spec.lo) / w);
      if (j < 0) b.under[i]++;
      else if (j >= spec.bins) b.over[i]++;
      else b.counts[i * spec.bins + j]++;
    });
  }

  /** Two bands as one, in the order given (Chan, Golub and LeVeque for the means). @param {any} x @param {any} y */
  function bandMerge(x, y) {
    if (!x.n) return { ...y, counts: y.counts.slice(), under: y.under.slice(), over: y.over.slice(), mean: y.mean.slice(), m2: y.m2.slice() };
    if (!y.n) return { ...x, counts: x.counts.slice(), under: x.under.slice(), over: x.over.slice(), mean: x.mean.slice(), m2: x.m2.slice() };
    const n = x.n + y.n;
    return {
      n, counts: x.counts.map((/** @type {number} */ v, /** @type {number} */ i) => v + y.counts[i]), under: x.under.map((/** @type {number} */ v, /** @type {number} */ i) => v + y.under[i]), over: x.over.map((/** @type {number} */ v, /** @type {number} */ i) => v + y.over[i]),
      mean: x.mean.map((/** @type {number} */ m, /** @type {number} */ i) => m + ((y.mean[i] - m) * y.n) / n),
      m2: x.m2.map((/** @type {number} */ m, /** @type {number} */ i) => m + y.m2[i] + (y.mean[i] - x.mean[i]) ** 2 * ((x.n * y.n) / n)),
    };
  }

  /**
   * The pointwise quantiles of a band at the levels qs, interpolated inside a bin, or null where the quantile falls
   * outside the window; with the pointwise mean and standard deviation.
   * @param {any} b @param {{ idx: number[], lo: number, hi: number, bins: number }} spec @param {number[]} qs
   */
  function bandRead(b, spec, qs) {
    const w = (spec.hi - spec.lo) / spec.bins;
    const q = qs.map((level) => spec.idx.map((_, i) => {
      const target = level * b.n;
      let cum = b.under[i];
      if (cum >= target && target > 0) return null;
      for (let j = 0; j < spec.bins; j++) {
        const c = b.counts[i * spec.bins + j];
        if (cum + c >= target && c > 0) return spec.lo + (j + (target - cum) / c) * w;
        cum += c;
      }
      return null;
    }));
    return { n: b.n, mean: b.mean.slice(), sd: b.m2.map((/** @type {number} */ m) => (b.n > 1 ? Math.sqrt(m / (b.n - 1)) : 0)), q, outside: spec.idx.map((_, i) => (b.under[i] + b.over[i]) / Math.max(1, b.n)) };
  }

  return { PROCESSES, BY_ID, MAX_STEPS, times, closed, passageLevel, passUp, chainStructure, distributions, matrix, mixing, extinction, extinctBy, hawkesMean, bandSpec, bandNew, bandAdd, bandMerge, bandRead };
});
