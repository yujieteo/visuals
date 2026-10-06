/* Monte Carlo Probability Workbench: custom laws. One line of model text defines a law by one of nine inputs,
 *
 *   law Sev(a) pdf(x) = a*x^(-a - 1) on [1, inf] where a > 1 obs [1.3, 2.2, 5.1] grid 4096
 *
 * a PDF, a log-PDF, an unnormalised density, a PMF, a finite table, a CDF, a quantile function, an MGF or a
 * characteristic function (CF), with its parameters, support, constraints and observations. compile() reads each
 * expression with the parser of expr.js, so an input cannot run JavaScript. A law object tabulates its input once
 * for each parameter value and keeps the table: the checks of the input (normalisation, non-negativity,
 * monotonicity, boundaries, parameter constraints and consistency, each checked, failed or unverified), the
 * samplers with the label exact, approximate or unavailable, the approximation controls and the numerical error
 * sources. A check on a grid is evidence, not proof, and a failed check stops the law from use in a run.
 */
/** @param {any} root the global object @param {(S: any, E: any, L: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCSpecial ?? require("./special.js"), root.MCExpr ?? require("./expr.js"), root.MCLaws ?? require("./laws.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCCustom = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./special.js")} */ S, /** @type {typeof import("./expr.js")} */ E, /** @type {typeof import("./laws.js")} */ L) {
  "use strict";

  /** @typedef {{ uniform(): number, u32(): number, below(m: number): number, normal(): number }} Rng */
  /** @typedef {"checked" | "failed" | "unverified"} Status */
  /** @typedef {{ id: string, label: string, status: Status, how: string }} Check */
  /** @typedef {{ label: string, exactness: string, sampling: "exact" | "approximate", draw(rng: Rng, stats?: any): number, acceptance?: number, envelope?: number }} Sampler */
  /** @typedef {{ unavailable: string }} NoSampler */
  /**
   * @typedef {object} LawDef the record of one law line
   * @property {string} name @property {string[]} params @property {string} kind @property {string} arg @property {string} expr
   * @property {[string, string] | null} [on] @property {string} [where] @property {string} [obs] @property {string} [probs]
   * @property {number | null} [grid] @property {string} [unit] @property {string} [note]
   */

  const KINDS = /** @type {Record<string, string>} */ ({
    pdf: "PDF", logpdf: "log-PDF", density: "unnormalised density", pmf: "PMF", table: "finite table",
    cdf: "CDF", quantile: "quantile function", mgf: "MGF", cf: "characteristic function",
  });
  const CLAUSES = ["on", "where", "obs", "grid", "probs"];
  const GRID = 4096, GRID_MIN = 256, GRID_MAX = 65536, PMF_MAX = 65536, TABLE_MAX = 10000, OBS_MAX = 5000;
  const NAME = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
  const ALERTS = [
    "An MGF need not exist. A finite numerical integral does not prove that a moment exists.",
    "Numerical checks do not prove that an arbitrary expression defines a probability law.",
  ];
  const STATUS_TEXT = /** @type {Record<Status, string>} */ ({ checked: "checked", failed: "failed", unverified: "unverified" });

  /** A number for a message: at most 6 significant digits, never NaN. @param {number} v */
  function show(v) {
    if (typeof v !== "number") return "a vector";
    if (Number.isNaN(v)) return "not a number";
    if (!Number.isFinite(v)) return v > 0 ? "∞" : "−∞";
    const a = Math.abs(v);
    return (a !== 0 && (a < 1e-4 || a >= 1e7) ? v.toExponential(2) : String(+v.toPrecision(6))).replace("-", "−");
  }
  /** @param {number} n */
  const count = (n) => n.toLocaleString("en-US");

  /* ---------- complex arithmetic for the transforms ---------- */

  /** @typedef {[number, number]} C */
  /** @param {C} a @param {C} b @returns {C} */
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  /** @param {C} a @param {C} b @returns {C} */
  function cdiv(a, b) {
    const d = b[0] * b[0] + b[1] * b[1];
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  }
  /** @param {C} a @returns {C} */
  const cexp = (a) => { const r = Math.exp(a[0]); return [r * Math.cos(a[1]), r * Math.sin(a[1])]; };
  /** The principal logarithm. @param {C} a @returns {C} */
  const clog = (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
  /** a^b: repeated products for a small integer b, so no branch cut enters; the principal branch otherwise. @param {C} a @param {C} b @returns {C} */
  function cpow(a, b) {
    if (b[1] === 0 && Number.isInteger(b[0]) && Math.abs(b[0]) <= 64) {
      let r = /** @type {C} */ ([1, 0]), base = a, n = Math.abs(b[0]);
      while (n) { if (n & 1) r = cmul(r, base); base = cmul(base, base); n >>= 1; }
      return b[0] < 0 ? cdiv([1, 0], r) : r;
    }
    if (a[0] === 0 && a[1] === 0) return b[0] > 0 ? [0, 0] : [NaN, NaN];
    return cexp(cmul(b, clog(a)));
  }
  const REAL_ONLY = /** @type {Record<string, (x: number) => number>} */ ({ log1p: Math.log1p, floor: Math.floor, ceil: Math.ceil, round: Math.round, tan: Math.tan, atan: Math.atan });

  /**
   * Compile an expression tree to a complex function of the slots: + − × ÷ ^ and exp, log, sqrt, pow, sin, cos and
   * abs (the modulus) on complex values, the other functions of one argument on real values only. With `imaginary`,
   * the name i is the imaginary unit.
   * @param {any} node @param {Map<string, number>} slots @param {boolean} imaginary @returns {(env: any[]) => C}
   */
  function ccompile(node, slots, imaginary) {
    switch (node.t) {
      case "num": { const v = node.v; return () => [v, 0]; }
      case "id": {
        if (imaginary && node.name === "i") return () => [0, 1];
        if (node.name in E.CONSTANTS && Object.prototype.hasOwnProperty.call(E.CONSTANTS, node.name)) { const v = E.CONSTANTS[node.name]; return () => [v, 0]; }
        const k = slots.get(node.name);
        if (k === undefined) throw new E.ExprError(`"${node.name}" is not a parameter of the law or its argument.`);
        return (env) => { const v = env[k]; return typeof v === "number" ? [v, 0] : v; };
      }
      case "un": {
        if (node.op === "!") throw new E.ExprError("A transform uses no logical operator.");
        const a = ccompile(node.a, slots, imaginary);
        return node.op === "-" ? (env) => { const v = a(env); return [-v[0], -v[1]]; } : a;
      }
      case "bin": {
        const a = ccompile(node.a, slots, imaginary), b = ccompile(node.b, slots, imaginary);
        switch (node.op) {
          case "+": return (env) => { const x = a(env), y = b(env); return [x[0] + y[0], x[1] + y[1]]; };
          case "-": return (env) => { const x = a(env), y = b(env); return [x[0] - y[0], x[1] - y[1]]; };
          case "*": return (env) => cmul(a(env), b(env));
          case "/": return (env) => cdiv(a(env), b(env));
          case "^": return (env) => cpow(a(env), b(env));
          default: throw new E.ExprError(`A transform uses no comparison or logical operator ("${node.op}").`);
        }
      }
      case "call": {
        const args = node.args.map((/** @type {any} */ x) => ccompile(x, slots, imaginary)), fn = node.fn;
        const one = args[0];
        switch (fn) {
          case "exp": return (env) => cexp(one(env));
          case "log": return (env) => clog(one(env));
          case "sqrt": return (env) => cpow(one(env), [0.5, 0]);
          case "pow": return (env) => cpow(one(env), args[1](env));
          case "sin": return (env) => { const z = one(env); return [Math.sin(z[0]) * Math.cosh(z[1]), Math.cos(z[0]) * Math.sinh(z[1])]; };
          case "cos": return (env) => { const z = one(env); return [Math.cos(z[0]) * Math.cosh(z[1]), -Math.sin(z[0]) * Math.sinh(z[1])]; };
          case "abs": return (env) => { const z = one(env); return [Math.hypot(z[0], z[1]), 0]; };
          default:
            if (fn in REAL_ONLY) {
              const f = REAL_ONLY[fn];
              return (env) => { const z = one(env); if (z[1] !== 0) throw new E.ExprError(`${fn}() takes a real argument in a transform.`); return [f(z[0]), 0]; };
            }
            throw new E.ExprError(`${fn}() is not available in a transform: use exp, log, sqrt, pow, sin, cos, abs and + − * / ^.`);
        }
      }
      default: throw new E.ExprError("A transform is a scalar expression: it uses no vector or index.");
    }
  }

  /* ---------- the maps of an infinite support to [0, 1] ---------- */

  /**
   * A monotone map from u in [0, 1] to the support: linear on a bounded interval, x = lo + s·u/(1 − u) on [lo, ∞),
   * x = hi − s·(1 − u)/u on (−∞, hi], and x = c + s·(2u − 1)/(u(1 − u)) on the real line. x'(u) is its derivative,
   * u(x) its inverse.
   * @param {number} lo @param {number} hi @param {number} c @param {number} s
   */
  function makeMap(lo, hi, c, s) {
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      const w = hi - lo;
      return { text: `x = ${show(lo)} + ${show(w)}·u`, x: (/** @type {number} */ u) => lo + w * u, dx: () => w, u: (/** @type {number} */ x) => (x - lo) / w };
    }
    if (Number.isFinite(lo)) return { text: `x = ${show(lo)} + ${show(s)}·u/(1 − u)`, x: (/** @type {number} */ u) => (u >= 1 ? Infinity : lo + (s * u) / (1 - u)), dx: (/** @type {number} */ u) => s / ((1 - u) * (1 - u)), u: (/** @type {number} */ x) => { const t = (x - lo) / s; return t === Infinity ? 1 : t / (1 + t); } };
    if (Number.isFinite(hi)) return { text: `x = ${show(hi)} − ${show(s)}·(1 − u)/u`, x: (/** @type {number} */ u) => (u <= 0 ? -Infinity : hi - (s * (1 - u)) / u), dx: (/** @type {number} */ u) => s / (u * u), u: (/** @type {number} */ x) => { const t = (hi - x) / s; return t === Infinity ? 0 : 1 / (1 + t); } };
    return {
      text: `x = ${show(c)} + ${show(s)}·(2u − 1)/(u(1 − u))`,
      x: (/** @type {number} */ u) => (u <= 0 ? -Infinity : u >= 1 ? Infinity : c + (s * (2 * u - 1)) / (u * (1 - u))),
      dx: (/** @type {number} */ u) => (s * (2 * u * u - 2 * u + 1)) / ((u * (1 - u)) ** 2),
      u: (/** @type {number} */ x) => {
        const y = (x - c) / s;
        if (y === Infinity) return 1;
        if (y === -Infinity) return 0;
        return y >= 0 ? 2 / (2 + 4 / (Math.sqrt(4 + y * y) + y)) : 2 / (2 - y + Math.sqrt(4 + y * y));
      },
    };
  }

  /** The smallest index i with cum[i] >= t in a non-decreasing array. @param {Float64Array | number[]} cum @param {number} t */
  function search(cum, t) {
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cum[mid] >= t) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  /** Vose's alias table for weights that add to 1. @param {ArrayLike<number>} w */
  function alias(w) {
    return L.alias(Array.from(w));
  }

  /** The asymptotic Kolmogorov p-value of the statistic D for n observations, with Stephens' correction. @param {number} D @param {number} n */
  function kolmogorov(D, n) {
    const x = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * D;
    if (x < 0.27) return 1;
    let p = 0;
    for (let k = 1; k <= 100; k++) {
      const term = 2 * (k % 2 ? 1 : -1) * Math.exp(-2 * k * k * x * x);
      p += term;
      if (Math.abs(term) < 1e-16) break;
    }
    return Math.min(1, Math.max(0, p));
  }

  /* ---------- compiling a law line ---------- */

  /** The names a law line may not use for its law, its parameters or its argument. */
  const RESERVED = new Set([...Object.keys(E.FUNCTIONS), ...Object.keys(E.CONSTANTS), ...CLAUSES, "and", "or", "not", "P", "E"]);

  /**
   * Compile one law line. Returns { law } or { errors }.
   * @param {LawDef} def @param {(id: string) => boolean} taken true for the id of a law of the catalogue
   */
  function compile(def, taken) {
    const at = `Law ${String(def?.name ?? "").slice(0, 24)}`;
    /** @type {string[]} */
    const errors = [];
    if (!def || typeof def !== "object") return { errors: ["A law definition is not an object."] };
    if (!NAME.test(String(def.name)) || RESERVED.has(def.name)) errors.push(`${at}: "${String(def.name).slice(0, 30)}" is not a law name (a letter, then letters, digits or _, at most 24 characters, not a reserved word).`);
    else if (taken(def.name) || /^(mixture|truncated|compound)_/.test(def.name)) errors.push(`${at}: "${def.name}" is the name of a law of the catalogue. Choose another name.`);
    if (!Object.prototype.hasOwnProperty.call(KINDS, def.kind)) errors.push(`${at}: "${String(def.kind).slice(0, 20)}" is not an input kind (${Object.keys(KINDS).join(", ")}).`);
    const params = Array.isArray(def.params) ? def.params.map(String) : [];
    if (params.length > 8) errors.push(`${at}: a law has at most 8 parameters.`);
    const arg = String(def.arg ?? "x");
    for (const n of [...params, arg]) {
      if (!NAME.test(n) || RESERVED.has(n)) errors.push(`${at}: "${n.slice(0, 30)}" is not a parameter name.`);
      if (def.kind === "cf" && n === "i") errors.push(`${at}: in a characteristic function, i is the imaginary unit, so it is not a parameter name.`);
    }
    if (new Set([...params, arg]).size !== params.length + 1) errors.push(`${at}: the parameters and the argument need different names.`);
    if (errors.length) return { errors };
    const pslots = new Map(params.map((n, i) => [n, i]));
    const slots = new Map([...pslots, [arg, params.length]]);
    /** @param {string | undefined} src @param {string} what @param {Map<string, number>} sl */
    const real = (src, what, sl) => {
      if (src === undefined || src === null || String(src).trim() === "") return null;
      try {
        return E.build(String(src), sl).fn;
      } catch (e) {
        errors.push(`${at}, ${what}: ${e instanceof Error ? e.message.replace("is not defined before this expression", "is not a parameter of the law") : String(e)}`);
        return null;
      }
    };
    /** @type {any} */
    const fns = {};
    if (def.kind === "cf" || def.kind === "mgf") {
      try {
        fns.complex = ccompile(E.parse(String(def.expr)), slots, def.kind === "cf");
      } catch (e) {
        errors.push(`${at}, ${KINDS[def.kind]}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (def.kind === "mgf") fns.f = real(def.expr, "MGF", slots);
    } else if (def.kind === "table") {
      fns.values = real(def.expr, "values", pslots);
      fns.probs = real(def.probs, "probabilities", pslots);
      if (!def.probs) errors.push(`${at}: a finite table states its probabilities: table(x) = [values] probs [probabilities].`);
    } else fns.f = real(def.expr, KINDS[def.kind], slots);
    if (def.probs && def.kind !== "table") errors.push(`${at}: only a finite table takes probs.`);
    fns.lo = def.on ? real(def.on[0], "least value of the support", pslots) : null;
    fns.hi = def.on ? real(def.on[1], "greatest value of the support", pslots) : null;
    if (def.kind === "pmf" && !def.on) errors.push(`${at}: a PMF states its support of integers: on [lo, hi], with hi = inf for no upper bound.`);
    fns.where = real(def.where, "constraint", pslots);
    fns.obs = real(def.obs, "observations", pslots);
    const grid = def.grid ?? GRID;
    if (!Number.isInteger(grid) || grid < GRID_MIN || grid > GRID_MAX || grid % 2) errors.push(`${at}: grid ${grid} is not an even integer in [${GRID_MIN}, ${GRID_MAX}].`);
    if (errors.length) return { errors };
    return { law: makeLaw(def, params, fns, grid) };
  }

  /* ---------- the law object ---------- */

  /** The tables of each (definition, parameter value), at most 64 at a time, shared by every model of the page. @type {Map<string, any>} */
  const TABLES = new Map();

  /** @param {LawDef} def @param {string[]} params @param {any} fns @param {number} grid */
  function makeLaw(def, params, fns, grid) {
    const kind = def.kind, key = JSON.stringify([def.name, kind, def.arg, def.expr, def.on, def.where, def.obs, def.probs, grid, params]);
    const discrete = kind === "pmf" || kind === "table";
    /** @param {Record<string, any>} p */
    function state(p) {
      const k = `${key}|${JSON.stringify(params.map((n) => p[n]))}`;
      let st = TABLES.get(k);
      if (!st) {
        st = build(def, params, fns, grid, p);
        if (TABLES.size >= 64) TABLES.delete(/** @type {string} */ (TABLES.keys().next().value));
        TABLES.set(k, st);
      }
      return st;
    }
    return {
      id: def.name, name: `${def.name} (custom ${KINDS[kind]})`, custom: true, generic: true, numeric: true, constantArgs: true,
      continuous: !discrete, integer: kind === "pmf" ? true : kind === "table" ? undefined : false, catalogue: "custom", kind, def,
      isInteger: kind === "table" ? (/** @type {any} */ p) => state(p).integer === true : undefined,
      params: params.map((n) => ({ name: n, kind: "real", text: `parameter ${n} of the custom law ${def.name}` })),
      check: (/** @type {any} */ p) => state(p).errors,
      support: (/** @type {any} */ p) => ({ lo: state(p).lo, hi: state(p).hi }),
      supportText: (/** @type {any} */ p) => state(p).supportText,
      pmf: (/** @type {number} */ x, /** @type {any} */ p) => state(p).pmf(x),
      // Every continuous input has a density for the plots: the input's own for a PDF, else a difference quotient of the CDF.
      pdf: discrete ? undefined : (/** @type {number} */ x, /** @type {any} */ p) => state(p).pdf(x),
      cdf: (/** @type {number} */ x, /** @type {any} */ p) => state(p).cdf(x),
      sf: (/** @type {number} */ x, /** @type {any} */ p) => state(p).sf(x),
      quantile: (/** @type {number} */ u, /** @type {any} */ p) => state(p).quantile(u),
      isf: (/** @type {number} */ v, /** @type {any} */ p) => state(p).quantile(1 - v),
      atoms: kind === "table" ? (/** @type {any} */ p) => state(p).atoms : undefined,
      moments: (/** @type {any} */ p) => state(p).moments,
      reference: (/** @type {any} */ p) => state(p).samplers.reference,
      inverse: (/** @type {any} */ p, /** @type {number | undefined} */ cut) => withCut(state(p).samplers.inverse, cut, (u) => state(p).quantile(u)),
      rejection: (/** @type {any} */ p, /** @type {number} */ factor) => state(p).samplers.rejection(factor),
      report: (/** @type {any} */ p) => { const st = state(p); return { checks: st.checks, controls: st.controls, sources: st.sources, sampling: st.sampling, observations: st.observations, numeric: st.numericMoments, errors: st.errors }; },
    };
  }

  /** A sampler cut at the u quantile, for the assumption-failure experiment. @param {Sampler | NoSampler} s @param {number | undefined} cut @param {(u: number) => number} q @returns {Sampler | NoSampler} */
  function withCut(s, cut, q) {
    if (cut === undefined || "unavailable" in s) return s;
    const top = q(cut);
    return { label: `${s.label}, cut at the ${cut} quantile ${show(top)}`, exactness: "not exact: the tail is cut", sampling: "approximate", draw: (rng) => Math.min(top, s.draw(rng)) };
  }

  /** @param {string} label @param {(rng: Rng) => number} draw @param {"exact" | "approximate"} sampling @param {string} exactness @returns {Sampler} */
  const sampler = (label, draw, sampling, exactness) => ({ label, draw, sampling, exactness });
  /** @param {string} why @returns {NoSampler} */
  const none = (why) => ({ unavailable: why });

  /**
   * Tabulate one law for one parameter value, and check it.
   * @param {LawDef} def @param {string[]} params @param {any} fns @param {number} grid @param {Record<string, any>} p
   */
  function build(def, params, fns, grid, p) {
    /** @type {Check[]} */
    const checks = [];
    /** @param {string} id @param {string} label @param {Status} status @param {string} how */
    const add = (id, label, status, how) => checks.push({ id, label, status, how });
    const env = /** @type {any[]} */ (params.map((n) => p[n]));
    const bad = params.find((n) => typeof p[n] !== "number" || Number.isNaN(p[n]));
    const fail = (/** @type {string} */ why) => finish(def, checks, why, null);
    if (bad !== undefined) return fail(`Parameter ${bad} = ${show(p[bad])} is not a number.`);
    // Parameter constraints.
    if (fns.where) {
      let ok = 0;
      try { ok = /** @type {number} */ (fns.where(env)); } catch (e) { return fail(`The constraint cannot be evaluated: ${e instanceof Error ? e.message : String(e)}`); }
      add("constraints", "Parameter constraints", ok !== 0 ? "checked" : "failed", ok !== 0 ? `${def.where} holds for ${params.map((n) => `${n} = ${show(p[n])}`).join(", ") || "the law"}.` : `${def.where} does not hold for ${params.map((n) => `${n} = ${show(p[n])}`).join(", ")}.`);
    } else add("constraints", "Parameter constraints", "unverified", "The law states no constraint on its parameters. Add where … to state one.");
    /** @param {any} fn @param {number} dflt */
    const end = (fn, dflt) => { if (!fn) return dflt; const v = fn(env); if (typeof v !== "number" || Number.isNaN(v)) throw new E.ExprError("an end of the support is not a number"); return v; };
    let lo, hi;
    try { lo = end(fns.lo, -Infinity); hi = end(fns.hi, Infinity); } catch (e) { return fail(`The support cannot be evaluated: ${e instanceof Error ? e.message : String(e)}`); }
    /** @type {number[] | null} */
    let obs = null;
    if (fns.obs) {
      try {
        const v = fns.obs(env);
        obs = typeof v === "number" ? [v] : v;
      } catch (e) { return fail(`The observations cannot be evaluated: ${e instanceof Error ? e.message : String(e)}`); }
      if (/** @type {number[]} */ (obs).length > OBS_MAX) return fail(`A law takes at most ${OBS_MAX} observations.`);
    }
    const ctx = { def, fns, env, slot: params.length, lo, hi, grid, add, checks, obs };
    try {
      switch (def.kind) {
        case "pdf": case "logpdf": case "density": return density(ctx);
        case "pmf": return pmfLaw(ctx);
        case "table": return tableLaw(ctx);
        case "cdf": return cdfLaw(ctx);
        case "quantile": return quantileLaw(ctx);
        default: return transformLaw(ctx);
      }
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * The common end of a tabulation: the errors that stop the law (failed checks and the reason of a law with no
   * table), the observation check, and the sampling label of each method.
   * @param {LawDef} def @param {Check[]} checks @param {string} why the reason the law has no table, or "" @param {any} t the tabulated law
   */
  function finish(def, checks, why, t) {
    const errors = checks.filter((c) => c.status === "failed").map((c) => `${c.label}: ${c.how}`);
    if (why) errors.push(why);
    const base = { errors, checks, controls: t?.controls ?? [], sources: t?.sources ?? [], numericMoments: t?.numeric ?? null, observations: t?.observations ?? null };
    if (!t || errors.length) {
      const no = none(errors.length ? `the law failed a check: ${errors[0]}` : why);
      const nan = () => NaN;
      return { ...base, lo: NaN, hi: NaN, supportText: "not available", pmf: nan, pdf: nan, cdf: nan, sf: nan, quantile: nan, atoms: { x: [], p: [] }, moments: { mean: null, variance: null, order: null },
        samplers: { reference: no, inverse: no, rejection: () => no }, sampling: { independent: "unavailable", inverse: "unavailable", rejection: "unavailable" } };
    }
    const grade = (/** @type {Sampler | NoSampler} */ s) => ("unavailable" in s ? "unavailable" : s.sampling);
    return { ...t, ...base, sampling: { independent: grade(t.samplers.reference), inverse: grade(t.samplers.inverse), rejection: grade(t.samplers.rejection(1)) } };
  }

  /** The check of the observations against the support, and the Kolmogorov–Smirnov distance to the law. @param {any} ctx @param {(x: number) => boolean} inside @param {(x: number) => number} cdf @param {string} supportText */
  function observe(ctx, inside, cdf, supportText) {
    if (!ctx.obs) return null;
    const xs = /** @type {number[]} */ (ctx.obs);
    const out = xs.find((x) => !inside(x));
    ctx.add("observations", "Observations", out === undefined ? "checked" : "failed", out === undefined ? `All ${count(xs.length)} observations lie in the support ${supportText}.` : `The observation ${show(out)} lies outside the support ${supportText}: the law cannot give it.`);
    if (out !== undefined || xs.length < 2) return { n: xs.length, D: null, p: null };
    const s = xs.slice().sort((a, b) => a - b), n = s.length;
    let D = 0;
    for (let i = 0; i < n; i++) {
      const F = cdf(s[i]);
      D = Math.max(D, Math.abs((i + 1) / n - F), Math.abs(F - i / n));
    }
    return { n, D, p: kolmogorov(D, n) };
  }

  /** The density of a CDF by a central difference quotient, for the plots of an input with no density. @param {(x: number) => number} cdf */
  const slope = (cdf) => (/** @type {number} */ x) => { const e = 1e-6 * Math.max(1, Math.abs(x)); return Math.max(0, (cdf(x + e) - cdf(x - e)) / (2 * e)); };
  /** The largest entry of a long array, with no spread of its entries as arguments. @param {ArrayLike<number>} a */
  const largest = (a) => { let m = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; };

  /** @param {number} lo @param {number} hi */
  const interval = (lo, hi) => `${Number.isFinite(lo) ? "[" : "("}${show(lo)}, ${show(hi)}${Number.isFinite(hi) ? "]" : ")"}`;

  /* ---------- a PDF, a log-PDF or an unnormalised density ---------- */

  /**
   * Tabulate a density on N cells of the mapped variable u: Simpson's rule in each cell gives the CDF at the cell
   * ends, and the CDF is linear in u inside a cell. The map's centre and scale come from the quartiles of an earlier
   * pass, at most 3 passes. Simpson's rule on N/2 cells gives the error estimate.
   * @param {any} ctx
   */
  function density(ctx) {
    const { def, fns, env, slot, lo, hi, grid: N, add } = ctx;
    if (!(lo < hi)) { add("boundaries", "Boundaries", "failed", `The support needs lo < hi, not lo = ${show(lo)} and hi = ${show(hi)}.`); return finish(def, ctx.checks, "", null); }
    const kind = def.kind;
    /** @param {number} x */
    const f = (x) => {
      env[slot] = x;
      const v = fns.f(env);
      if (typeof v !== "number") throw new E.ExprError(`the ${KINDS[kind]} gives a vector at x = ${show(x)}`);
      return kind === "logpdf" ? Math.exp(v) : v;
    };
    /** @param {number} x */
    const raw = (x) => { env[slot] = x; return /** @type {number} */ (fns.f(env)); };
    // A first centre and scale: the distance r from the end (or from the largest density) where f(x)·r is largest,
    // which is where a geometric shell of radius r holds the most mass.
    let c = Number.isFinite(lo) ? lo : Number.isFinite(hi) ? hi : 0, s = 1;
    if (!(Number.isFinite(lo) && Number.isFinite(hi))) {
      /** @param {number} x */
      const safeF = (x) => { try { const v = f(x); return Number.isFinite(v) && v > 0 ? v : 0; } catch { return 0; } };
      if (!Number.isFinite(lo) && !Number.isFinite(hi)) {
        let best = 0;
        for (let e = -6; e <= 12; e += 0.25) for (const x of [10 ** e, -(10 ** e)]) { const v = safeF(x); if (v > best) { best = v; c = x; } }
        if (safeF(0) >= best) c = 0;
      }
      let best = 0;
      for (let e = -8; e <= 12; e += 0.25) {
        const r = 10 ** e;
        const v = Number.isFinite(lo) ? safeF(lo + r) * r : Number.isFinite(hi) ? safeF(hi - r) * r : Math.max(safeF(c + r), safeF(c - r)) * r;
        if (v > best) { best = v; s = r; }
      }
    }
    /** @type {any} */
    let t = null;
    for (let pass = 0; pass < 5; pass++) {
      t = tabulate(f, raw, makeMap(lo, hi, c, s), N, kind);
      if (t.bad || !(t.Z > 0) || !Number.isFinite(t.Z) || (Number.isFinite(lo) && Number.isFinite(hi))) break;
      const q = (/** @type {number} */ u) => t.quantile(u);
      const q25 = q(0.25), q50 = q(0.5), q75 = q(0.75);
      const s2 = Number.isFinite(lo) ? q50 - lo : Number.isFinite(hi) ? hi - q50 : (q75 - q25) / 5.33;
      const c2 = Number.isFinite(lo) || Number.isFinite(hi) ? c : q50;
      if (!(s2 > 0) || !Number.isFinite(s2)) break;
      const changed = Math.abs(Math.log(s2 / s)) > Math.log(2) || Math.abs(c2 - c) > s2;
      c = c2;
      s = s2;
      if (!changed) break;
    }
    t = /** @type {any} */ (t);
    if (t.bad) {
      add("nonnegative", "Non-negativity", "failed", t.bad);
      return finish(def, ctx.checks, "", null);
    }
    add("nonnegative", "Non-negativity", "checked", `${kind === "logpdf" ? "exp of the log-PDF" : "f(x)"} is a finite number ≥ 0 at ${count(2 * N + 1)} points of the grid.`);
    const Z = t.Z, err = Math.abs(t.Z - t.Zhalf);
    const settled = Number.isFinite(Z) && Z > 0 && err <= 1e-6 * Z;
    if (kind === "density") {
      add("normalisation", "Normalisation", settled ? "checked" : "unverified", settled ? `The normalising constant is Z = ∫f = ${show(Z)}. Simpson's rule on ${count(N)} and ${count(N / 2)} cells differs by ${show(err)}.`
        : `The integral did not settle: ${count(N)} cells give ${show(Z)} and ${count(N / 2)} cells give ${show(t.Zhalf)}. The density may not have a finite integral.`);
    } else {
      const off = Math.abs(Z - 1);
      const status = settled && off <= 1e-6 ? "checked" : settled && off > 1e-6 ? "failed" : "unverified";
      add("normalisation", "Normalisation", status, status === "checked" ? `∫f = ${show(Z)} (Simpson's rule on ${count(N)} cells; ${count(N / 2)} cells differ by ${show(err)}).`
        : status === "failed" ? `∫f = ${show(Z)}, not 1. Simpson's rule on ${count(N / 2)} cells gives ${show(t.Zhalf)}, so the difference is not a quadrature error. Use density(x) for an unnormalised input.`
          : `The integral did not settle: ${count(N)} cells give ${show(Z)} and ${count(N / 2)} cells give ${show(t.Zhalf)}.`);
    }
    // Boundaries: lo < hi, the value at a finite end, and the decay of the integrand at an infinite end.
    const ends = [];
    if (t.endSingular.length) ends.push(`f is not finite at ${t.endSingular.map(show).join(" and ")}: an integrable singularity at an end is possible, but Simpson's rule then converges slowly`);
    if (t.tail > 1e-6) ends.push(`the outermost cell, which reaches to infinity, holds a mass of ${show(t.tail)}, so the table does not resolve the tail`);
    add("boundaries", "Boundaries", ends.length ? "unverified" : "checked", ends.length ? `${ends.join("; ")}.` : `The support ${interval(lo, hi)} has lo < hi${Number.isFinite(lo) && Number.isFinite(hi) ? "" : `, and the outermost cell at each infinite end holds a mass of at most ${show(t.tail)}`}.`);
    add("consistency", "Consistency", t.interp <= 1e-6 && t.cdfErr <= 1e-6 ? "checked" : "unverified", `The CDF table and the density agree to ${show(Math.max(t.interp, t.cdfErr))}: the largest change of the CDF from ${count(N)} to ${count(N / 2)} cells is ${show(t.cdfErr)}, and the largest error of the linear interpolation at a cell midpoint is ${show(t.interp)}.`);
    const unsettled = !settled ? `the normalising integral did not settle, so the page has no table of the law` : "";
    const bounded = Number.isFinite(lo) && Number.isFinite(hi);
    const law = tableLawOf(t, lo, hi, N);
    const supportText = interval(lo, hi);
    const observations = observe(ctx, (x) => x >= lo && x <= hi, law.cdf, supportText);
    const draw = (/** @type {Rng} */ rng) => t.quantile(rng.uniform());
    const label = `Inverse transform with the tabulated CDF: ${count(N)} cells, linear inside a cell`;
    const fmax = t.fmax;
    const rejection = (/** @type {number} */ factor) => {
      if (!bounded) return none("The support is not bounded, so the uniform proposal does not exist.");
      if (!(fmax > 0 && Number.isFinite(fmax))) return none("The density has no finite largest value on the grid.");
      const M = 1.1 * (fmax / Z) * (hi - lo), Mf = M * factor;
      if (1 / M < 1e-3) return none(`The acceptance probability 1/M = ${show(1 / M)} is below 0.001.`);
      return {
        label: `Proposal: the uniform law on ${supportText}, envelope constant M = 1.1 × the largest density on the grid × (hi − lo) = ${show(M)}${factor === 1 ? "" : ` multiplied by ${factor}`}`,
        exactness: factor === 1 ? "approximate: the envelope comes from a grid maximum, and the page counts each proposal above it" : "not exact: the envelope is too small",
        sampling: /** @type {"approximate"} */ ("approximate"), acceptance: 1 / M, envelope: Mf,
        /** @param {Rng} rng @param {any} [stats] */
        draw(rng, stats) {
          for (;;) {
            const x = lo + (hi - lo) * rng.uniform(), ratio = f(x) / Z / (Mf / (hi - lo));
            if (stats) { stats.proposals++; if (ratio > 1 + 1e-12) stats.violations++; }
            if (rng.uniform() <= ratio) { if (stats) stats.accepts++; return x; }
          }
        },
      };
    };
    const moments = bounded ? { mean: t.mean, variance: Math.max(0, t.m2 - t.mean * t.mean), order: Infinity } : { mean: null, variance: null, order: null };
    const controls = [
      `${count(N)} cells of u in [0, 1] (grid ${N}), with the map ${t.mapText}.`,
      "Simpson's rule in each cell, with the density at the cell ends and midpoint.",
      "The CDF is linear in u inside a cell; the samplers invert this table.",
    ];
    const sources = [
      `Quadrature: ${count(N)} and ${count(N / 2)} cells give Z = ${show(Z)} and ${show(t.Zhalf)}.`,
      `Interpolation: the largest CDF error at a cell midpoint is about ${show(t.interp)}.`,
      bounded ? "Tail: none, the support is bounded." : `Tail: the outermost cell holds a mass of ${show(t.tail)}; inside it, the linear interpolation in u gives the shape of the tail only roughly.`,
      kind === "density" ? `Normalisation: the page divides by the numerical Z = ${show(Z)}.` : "Normalisation: the page divides by the numerical integral, so a small error of the input's own constant does not show in the samples.",
    ];
    return finish(def, ctx.checks, unsettled, {
      lo, hi, supportText, pmf: () => 0, pdf: (/** @type {number} */ x) => (x < lo || x > hi ? 0 : f(x) / Z), cdf: law.cdf, sf: law.sf, quantile: t.quantile,
      moments, numeric: { mean: t.mean, variance: Math.max(0, t.m2 - t.mean * t.mean), bounded },
      samplers: { reference: sampler(label, draw, "approximate", "approximate: numerical inversion of a tabulated CDF"), inverse: sampler(label, draw, "approximate", "approximate: numerical inversion of a tabulated CDF"), rejection },
      controls, sources, observations,
    });
  }

  /**
   * The table of a density f under a map: the integrand h(u) = f(x(u))·x'(u) at the N + 1 cell ends and the N
   * midpoints, the cumulative Simpson integrals, and the estimates of the quadrature and interpolation errors.
   * @param {(x: number) => number} f @param {(x: number) => number} raw @param {any} map @param {number} N @param {string} kind
   */
  function tabulate(f, raw, map, N, kind) {
    const du = 1 / N, h = new Float64Array(N + 1), m = new Float64Array(N), C = new Float64Array(N + 1);
    let bad = "", fmax = 0, hmax = 0;
    /** @type {number[]} */
    const endSingular = [];
    /** @param {number} u @param {boolean} isEnd */
    const at = (u, isEnd) => {
      const x = map.x(u);
      if (!Number.isFinite(x)) return 0;
      const v = f(x);
      if (!Number.isFinite(v) || Number.isNaN(v)) {
        if (isEnd) { endSingular.push(x); return 0; }
        if (!bad) bad = `${kind === "logpdf" ? "The log-PDF" : "f"}(${show(x)}) is ${Number.isNaN(v) ? "not a number" : show(kind === "logpdf" ? raw(x) : v)}: the input is not a finite number there.`;
        return 0;
      }
      if (v < 0) { if (!bad) bad = `f(${show(x)}) = ${show(v)} < 0.`; return 0; }
      if (v > fmax) fmax = v;
      return v * map.dx(u);
    };
    for (let j = 0; j <= N; j++) h[j] = at(j * du, j === 0 || j === N);
    for (let j = 0; j < N; j++) m[j] = at((j + 0.5) * du, false);
    let interp = 0;
    for (let j = 0; j < N; j++) {
      const I = (du / 6) * (h[j] + 4 * m[j] + h[j + 1]);
      C[j + 1] = C[j] + I;
      hmax = Math.max(hmax, h[j], m[j]);
      const left = (du * (5 * h[j] + 8 * m[j] - h[j + 1])) / 24;
      interp = Math.max(interp, Math.abs(left - I / 2));
    }
    const Z = C[N];
    let Zhalf = 0, cdfErr = 0;
    for (let k = 0; k < N / 2; k++) {
      Zhalf += ((2 * du) / 6) * (h[2 * k] + 4 * h[2 * k + 1] + h[2 * k + 2]);
      cdfErr = Math.max(cdfErr, Math.abs(Zhalf - C[2 * k + 2]));
    }
    // The decay at an infinite end: the mass of the outermost cell, which reaches to infinity.
    const lowInf = !Number.isFinite(map.x(0)), highInf = !Number.isFinite(map.x(1));
    const tail = Z > 0 ? Math.max(lowInf ? C[1] : 0, highInf ? C[N] - C[N - 1] : 0) / Z : 0;
    // The moments of the tabulated law, by Simpson's rule on x·h and x²·h.
    let m1 = 0, m2 = 0;
    for (let j = 0; j < N; j++) {
      const x0 = map.x(j * du), xm = map.x((j + 0.5) * du), x1 = map.x((j + 1) * du);
      const g = (/** @type {number} */ x, /** @type {number} */ v) => (Number.isFinite(x) ? x * v : 0), g2 = (/** @type {number} */ x, /** @type {number} */ v) => (Number.isFinite(x) ? x * x * v : 0);
      m1 += (du / 6) * (g(x0, h[j]) + 4 * g(xm, m[j]) + g(x1, h[j + 1]));
      m2 += (du / 6) * (g2(x0, h[j]) + 4 * g2(xm, m[j]) + g2(x1, h[j + 1]));
    }
    /** @param {number} u */
    const quantile = (u) => {
      const T = u * Z;
      const j = Math.max(1, search(C, T)) - 1, I = C[j + 1] - C[j];
      const t = I > 0 ? Math.min(1, Math.max(0, (T - C[j]) / I)) : 0;
      return map.x((j + t) * du);
    };
    return { bad, Z, Zhalf, cdfErr: Z > 0 ? cdfErr / Z : Infinity, interp: Z > 0 ? interp / Z : Infinity, tail, C, N, map, mapText: map.text, quantile, fmax, endSingular, mean: Z > 0 ? m1 / Z : NaN, m2: Z > 0 ? m2 / Z : NaN };
  }

  /** The CDF and survival function of a density table: linear in u inside a cell. @param {any} t @param {number} lo @param {number} hi @param {number} N */
  function tableLawOf(t, lo, hi, N) {
    /** @param {number} x */
    const cum = (x) => {
      if (x <= lo) return 0;
      if (x >= hi) return t.Z;
      const v = Math.min(1, Math.max(0, t.map.u(x))) * N, j = Math.min(N - 1, Math.floor(v));
      return t.C[j] + (v - j) * (t.C[j + 1] - t.C[j]);
    };
    return { cdf: (/** @type {number} */ x) => cum(x) / t.Z, sf: (/** @type {number} */ x) => Math.max(0, t.Z - cum(x)) / t.Z };
  }

  /* ---------- a PMF and a finite table ---------- */

  /**
   * A PMF on the integers of [lo, hi]: summed term by term up to 65,536 terms, or to the first k where the sum is
   * within 10^-12 of 1 for an infinite support.
   * @param {any} ctx
   */
  function pmfLaw(ctx) {
    const { def, fns, env, slot, lo, hi, add } = ctx;
    if (!Number.isInteger(lo) || !(Number.isInteger(hi) || hi === Infinity) || lo > hi) {
      add("boundaries", "Boundaries", "failed", `A PMF needs integer ends lo ≤ hi (hi may be inf), not ${show(lo)} and ${show(hi)}.`);
      return finish(def, ctx.checks, "", null);
    }
    if (Number.isFinite(hi) && hi - lo + 1 > PMF_MAX) {
      add("boundaries", "Boundaries", "failed", `The support has ${count(hi - lo + 1)} points. The page tabulates at most ${count(PMF_MAX)}.`);
      return finish(def, ctx.checks, "", null);
    }
    add("boundaries", "Boundaries", "checked", `The support is the integers of ${interval(lo, hi)}.`);
    /** @type {number[]} */
    const P = [];
    let sum = 0, k = lo, bad = "";
    for (; k <= hi && P.length < PMF_MAX; k++) {
      env[slot] = k;
      const v = fns.f(env);
      if (typeof v !== "number" || !Number.isFinite(v)) { bad = `p(${k}) is ${typeof v !== "number" ? "a vector" : show(v)}, not a finite number.`; break; }
      if (v < 0) { bad = `p(${k}) = ${show(v)} < 0.`; break; }
      P.push(v);
      sum += v;
      if (hi === Infinity && sum >= 1 - 1e-12) { k++; break; }
      if (sum > 1 + 1e-9) { k++; break; }
    }
    if (bad) { add("nonnegative", "Non-negativity", "failed", bad); return finish(def, ctx.checks, "", null); }
    const K = lo + P.length - 1, complete = K >= hi;
    add("nonnegative", "Non-negativity", "checked", `p(k) is a finite number ≥ 0 for the ${count(P.length)} integers ${lo} to ${K}.`);
    const status = sum > 1 + 1e-9 ? "failed" : complete ? (Math.abs(sum - 1) <= 1e-9 ? "checked" : "failed") : sum >= 1 - 1e-12 ? "checked" : "unverified";
    add("normalisation", "Normalisation", status, status === "failed" ? `The sum of p(k) for k = ${lo} to ${K} is ${show(sum)}, not 1.`
      : complete ? `The sum over the whole support is ${show(sum)}.`
        : status === "checked" ? `The sum for k = ${lo} to ${K} is ${show(sum)}, within 10^-12 of 1. The page does not sum the terms after k = ${K}; as they are not negative, the total is at least this sum.`
          : `The sum for the first ${count(PMF_MAX)} terms is ${show(sum)}. The rest of the series is not known, so the page cannot check that the total is 1.`);
    const cum = new Float64Array(P.length);
    let F = 0;
    P.forEach((v, i) => { cum[i] = F += v; });
    const exact = complete && status === "checked";
    const supportText = Number.isFinite(hi) ? `{${lo}, …, ${hi}}` : `{${lo}, ${lo + 1}, …}`;
    const pm = (/** @type {number} */ x) => {
      if (!Number.isInteger(x) || x < lo || x > hi) return 0;
      if (x <= K) return P[x - lo];
      env[slot] = x;
      const v = fns.f(env);
      return typeof v === "number" && v > 0 ? v : 0;
    };
    const cdf = (/** @type {number} */ x) => (x < lo ? 0 : x >= K ? Math.min(1, sum) : Math.min(1, cum[Math.floor(x) - lo]));
    const quantile = (/** @type {number} */ u) => lo + search(cum, u * F);
    const observations = observe(ctx, (x) => Number.isInteger(x) && x >= lo && x <= hi, cdf, supportText);
    const draw = (/** @type {Rng} */ rng) => quantile(rng.uniform());
    const how = exact ? "exact" : "approximate";
    const cutText = exact ? "" : `, renormalised over k = ${lo} to ${K}; the mass after ${K}, ${show(Math.max(0, 1 - sum))} if the PMF adds to 1, is not sampled`;
    const { prob, al } = alias(P.map((v) => v / F));
    const reference = sampler(`Alias method over the ${count(P.length)} tabulated values${cutText}`, (rng) => { const i = rng.below(prob.length); return lo + (rng.uniform() < prob[i] ? i : al[i]); }, how, exact ? "exact" : "approximate: the table stops before the end of the support");
    const inverse = sampler(`Inverse transform with a CDF table of ${count(P.length)} values and binary search${cutText}`, draw, how, exact ? "exact" : "approximate: the table stops before the end of the support");
    const pmax = largest(P) / F, m = P.length;
    const rejection = (/** @type {number} */ factor) => {
      if (!complete) return none("The support is infinite, so the uniform proposal does not exist.");
      const M = m * pmax, Mf = M * factor;
      if (1 / M < 1e-3) return none(`The acceptance probability 1/M = ${show(1 / M)} is below 0.001.`);
      return {
        label: `Proposal: the uniform law on the support, envelope constant M = ${show(M)}${factor === 1 ? "" : ` multiplied by ${factor}`}`,
        exactness: factor === 1 ? "exact" : "not exact: the envelope is too small", sampling: /** @type {"exact" | "approximate"} */ (factor === 1 ? "exact" : "approximate"), acceptance: 1 / M, envelope: Mf,
        /** @param {Rng} rng @param {any} [stats] */
        draw(rng, stats) {
          for (;;) {
            const i = rng.below(m), ratio = P[i] / F / (Mf / m);
            if (stats) { stats.proposals++; if (ratio > 1 + 1e-12) stats.violations++; }
            if (rng.uniform() <= ratio) { if (stats) stats.accepts++; return lo + i; }
          }
        },
      };
    };
    let m1 = 0, m2 = 0;
    P.forEach((v, i) => { m1 += (v / F) * (lo + i); m2 += (v / F) * (lo + i) ** 2; });
    return finish(def, ctx.checks, "", {
      lo, hi, supportText, pmf: pm, cdf, sf: (/** @type {number} */ x) => Math.max(0, 1 - cdf(x)), quantile,
      moments: complete ? { mean: m1, variance: Math.max(0, m2 - m1 * m1), order: Infinity } : { mean: null, variance: null, order: null },
      numeric: { mean: m1, variance: Math.max(0, m2 - m1 * m1), bounded: complete },
      samplers: { reference, inverse, rejection },
      controls: [`The page sums p(k) term by term: up to ${count(PMF_MAX)} terms, or to the first k where the sum is within 10^-12 of 1.`],
      sources: [exact ? "Round-off of the sum only." : `Cut: the table holds k = ${lo} to ${K}, with mass ${show(sum)}. The rest is not sampled.`],
      observations,
    });
  }

  /** A finite table of values and probabilities. @param {any} ctx */
  function tableLaw(ctx) {
    const { def, fns, env, add } = ctx;
    const xv = fns.values(env), pv = fns.probs(env);
    const xs = typeof xv === "number" ? [xv] : xv, ps = typeof pv === "number" ? [pv] : pv;
    if (xs.length !== ps.length || xs.length > TABLE_MAX) {
      add("boundaries", "Boundaries", "failed", xs.length !== ps.length ? `The table has ${xs.length} values and ${ps.length} probabilities.` : `A table has at most ${count(TABLE_MAX)} values.`);
      return finish(def, ctx.checks, "", null);
    }
    const nonfinite = xs.find((/** @type {number} */ x) => !Number.isFinite(x));
    const distinct = new Set(xs).size === xs.length;
    add("boundaries", "Boundaries", nonfinite === undefined && distinct ? "checked" : "failed", nonfinite !== undefined ? `The value ${show(nonfinite)} is not a finite number.` : distinct ? `${count(xs.length)} distinct finite values from ${show(Math.min(...xs))} to ${show(Math.max(...xs))}.` : "Two entries of the table have the same value. Add their probabilities in one entry.");
    const neg = ps.findIndex((/** @type {number} */ q) => !(q >= 0) || !Number.isFinite(q));
    add("nonnegative", "Non-negativity", neg < 0 ? "checked" : "failed", neg < 0 ? `All ${count(ps.length)} probabilities are ≥ 0.` : `The probability of ${show(xs[neg])} is ${show(ps[neg])}.`);
    const sum = ps.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
    add("normalisation", "Normalisation", Math.abs(sum - 1) <= 1e-9 ? "checked" : "failed", Math.abs(sum - 1) <= 1e-9 ? `The probabilities add to ${show(sum)}.` : `The probabilities add to ${show(sum)}, not 1. Use normalize() to scale weights.`);
    if (ctx.checks.some((/** @type {Check} */ c) => c.status === "failed")) return finish(def, ctx.checks, "", null);
    const law = atomsLaw(xs, ps);
    const observations = observe(ctx, (x) => law.pmf(x) > 0, law.cdf, `{${xs.length <= 6 ? xs.map(show).join(", ") : `${count(xs.length)} values`}}`);
    return finish(def, ctx.checks, "", { ...law, controls: ["None: a finite table needs no approximation."], sources: ["Round-off of the sums only."], observations, numeric: { ...law.moments, bounded: true } });
  }

  /**
   * The law with mass p_i at x_i, for distinct finite x_i and p_i that add to 1 (or weights, which it scales): its
   * functions, its moments, and three exact samplers.
   * @param {number[]} xs @param {number[]} ps
   */
  function atomsLaw(xs, ps) {
    const W = ps.reduce((a, b) => a + b, 0);
    const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    const x = order.map((i) => xs[i]), p = order.map((i) => ps[i] / W);
    const cum = new Float64Array(x.length), top = new Float64Array(x.length);
    let F = 0;
    p.forEach((v, i) => { cum[i] = F += v; });
    let T = 0;
    for (let i = x.length - 1; i >= 0; i--) { top[i] = T; T += p[i]; }
    /** @type {Map<number, number>} */
    const mass = new Map(x.map((v, i) => [v, p[i]]));
    /** The index of the last atom ≤ v, or −1. @param {number} v */
    const below = (v) => { let lo = 0, hi = x.length; while (lo < hi) { const mid = (lo + hi) >>> 1; if (x[mid] <= v) lo = mid + 1; else hi = mid; } return lo - 1; };
    const cdf = (/** @type {number} */ v) => { const i = below(v); return i < 0 ? 0 : Math.min(1, cum[i]); };
    const sf = (/** @type {number} */ v) => { const i = below(v); return i < 0 ? 1 : Math.max(0, top[i]); };
    const quantile = (/** @type {number} */ u) => x[Math.min(x.length - 1, search(cum, u))];
    let m1 = 0, m2 = 0;
    p.forEach((v, i) => { m1 += v * x[i]; });
    p.forEach((v, i) => { m2 += v * (x[i] - m1) ** 2; });
    const { prob, al } = alias(p);
    const pmax = largest(p), k = x.length;
    const integer = x.every(Number.isInteger);
    return {
      lo: x[0], hi: x[k - 1], supportText: k <= 6 ? `{${x.map(show).join(", ")}}` : `${count(k)} values in [${show(x[0])}, ${show(x[k - 1])}]`, integer,
      atoms: { x, p }, pmf: (/** @type {number} */ v) => mass.get(v) ?? 0, cdf, sf, quantile,
      moments: { mean: m1, variance: m2, order: Infinity },
      samplers: {
        reference: sampler("Alias method (Walker 1977, Vose 1991): one integer and one uniform for each draw", (rng) => { const i = rng.below(k); return x[rng.uniform() < prob[i] ? i : al[i]]; }, "exact", "exact"),
        inverse: sampler("Inverse transform with the CDF table of the sorted values and binary search", (rng) => quantile(rng.uniform()), "exact", "exact"),
        rejection: (/** @type {number} */ factor) => {
          const M = k * pmax, Mf = M * factor;
          if (1 / M < 1e-3) return none(`The acceptance probability 1/M = ${show(1 / M)} is below 0.001.`);
          return {
            label: `Proposal: one of the ${count(k)} values with equal probability, envelope constant M = ${show(M)}${factor === 1 ? "" : ` multiplied by ${factor}`}`,
            exactness: factor === 1 ? "exact" : "not exact: the envelope is too small", sampling: /** @type {"exact" | "approximate"} */ (factor === 1 ? "exact" : "approximate"), acceptance: 1 / M, envelope: Mf,
            /** @param {Rng} rng @param {any} [stats] */
            draw(rng, stats) {
              for (;;) {
                const i = rng.below(k), ratio = p[i] / (Mf / k);
                if (stats) { stats.proposals++; if (ratio > 1 + 1e-12) stats.violations++; }
                if (rng.uniform() <= ratio) { if (stats) stats.accepts++; return x[i]; }
              }
            },
          };
        },
      },
    };
  }

  /* ---------- a CDF and a quantile function ---------- */

  /**
   * Bracket and solve F(x) = u by bisection for a non-decreasing F: from [lo, hi] when they are finite, else by
   * doubling out from `start`. Returns the smallest x with F(x) ≥ u, to a relative width of 10^-12.
   * @param {(x: number) => number} F @param {number} u @param {number} lo @param {number} hi @param {number} start @param {number} scale
   */
  function solve(F, u, lo, hi, start, scale) {
    let a = lo, b = hi;
    if (!Number.isFinite(a)) { let step = scale; a = Math.min(start, Number.isFinite(b) ? b - scale : start) - step; while (F(a) >= u && step < 1e300) { step *= 2; a -= step; } }
    if (!Number.isFinite(b)) { let step = scale; b = Math.max(start, a + scale) + step; while (F(b) < u && step < 1e300) { step *= 2; b += step; } }
    for (let i = 0; i < 200 && b - a > 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)); i++) {
      const mid = a + (b - a) / 2;
      if (F(mid) >= u) b = mid;
      else a = mid;
    }
    return b;
  }

  /** A CDF: checked on a grid of the mapped variable, sampled by bisection. @param {any} ctx */
  function cdfLaw(ctx) {
    const { def, fns, env, slot, lo, hi, grid: N, add } = ctx;
    if (!(lo < hi)) { add("boundaries", "Boundaries", "failed", `The support needs lo < hi, not lo = ${show(lo)} and hi = ${show(hi)}.`); return finish(def, ctx.checks, "", null); }
    /** @param {number} x */
    const F = (x) => { env[slot] = x; const v = fns.f(env); if (typeof v !== "number") throw new E.ExprError(`F gives a vector at x = ${show(x)}`); return v; };
    // A centre and scale from the quartiles of F, found by bisection on a raw bracket.
    let c = 0, s = 1;
    if (!(Number.isFinite(lo) && Number.isFinite(hi))) {
      const start = Number.isFinite(lo) ? lo : Number.isFinite(hi) ? hi : 0;
      const q = (/** @type {number} */ u) => solve((x) => { const v = F(x); return Number.isNaN(v) ? 0 : v; }, u, lo, hi, start, 1);
      const q25 = q(0.25), q50 = q(0.5), q75 = q(0.75);
      c = Number.isFinite(lo) ? lo : Number.isFinite(hi) ? hi : q50;
      s = Number.isFinite(lo) ? q50 - lo : Number.isFinite(hi) ? hi - q50 : (q75 - q25) / 5.33;
      if (!(s > 0) || !Number.isFinite(s)) s = 1;
    }
    const map = makeMap(lo, hi, c, s);
    const xs = [], Fs = [];
    let bad = "", range = "", down = "";
    for (let j = 0; j <= N; j++) {
      const x = map.x(j / N);
      if (!Number.isFinite(x)) continue;
      const v = F(x);
      if (!Number.isFinite(v)) { if (!bad) bad = `F(${show(x)}) is ${show(v)}, not a finite number.`; continue; }
      if (v < -1e-12 || v > 1 + 1e-12) { if (!range) range = `F(${show(x)}) = ${show(v)} is outside [0, 1].`; }
      if (Fs.length && v < Fs[Fs.length - 1] - 1e-12 && !down) down = `F decreases by ${show(Fs[Fs.length - 1] - v)} between x = ${show(xs[xs.length - 1])} and x = ${show(x)}.`;
      xs.push(x);
      Fs.push(v);
    }
    const pts = count(xs.length);
    add("nonnegative", "Non-negativity", bad || range ? "failed" : "checked", bad || range || `0 ≤ F(x) ≤ 1 at ${pts} points of the grid.`);
    add("monotonicity", "Monotonicity", down ? "failed" : "checked", down || `F does not decrease between the ${pts} points of the grid.`);
    const Flo = Number.isFinite(lo) ? F(lo) : Fs[0], Fhi = Number.isFinite(hi) ? F(hi) : Fs[Fs.length - 1];
    const loAt = Number.isFinite(lo) ? lo : xs[0], hiAt = Number.isFinite(hi) ? hi : xs[xs.length - 1];
    const tolLo = Number.isFinite(lo) ? 1e-9 : 1e-6, tolHi = Number.isFinite(hi) ? 1e-9 : 1e-6;
    add("boundaries", "Boundaries", Math.abs(Flo) <= tolLo ? "checked" : Number.isFinite(lo) ? "failed" : "unverified", `F(${show(loAt)}) = ${show(Flo)}${Number.isFinite(lo) ? " at the least value of the support" : ", the smallest grid point"}; a CDF starts at 0.`);
    add("normalisation", "Normalisation", Math.abs(Fhi - 1) <= tolHi ? "checked" : Number.isFinite(hi) ? "failed" : "unverified", `F(${show(hiAt)}) = ${show(Fhi)}${Number.isFinite(hi) ? " at the greatest value of the support" : ", the largest grid point"}; a CDF ends at 1.`);
    if (ctx.checks.some((/** @type {Check} */ k) => k.status === "failed")) return finish(def, ctx.checks, "", null);
    const start = Number.isFinite(lo) ? lo : Number.isFinite(hi) ? hi : c;
    const clamp = (/** @type {number} */ x) => (x <= lo ? 0 : x >= hi ? 1 : Math.min(1, Math.max(0, F(x))));
    const quantile = (/** @type {number} */ u) => solve(clamp, u, lo, hi, start, s);
    // Consistency: F(Q(u)) = u on a grid of u. A jump of F gives F(Q(u)) > u: an atom, which this input does not take.
    let worst = 0, where = 0;
    for (let j = 1; j < 64; j++) { const u = j / 64, x = quantile(u), d = clamp(x) - u; if (Math.abs(d) > worst) { worst = Math.abs(d); where = x; } }
    add("consistency", "Consistency", worst <= 1e-6 ? "checked" : "failed", worst <= 1e-6 ? `F(Q(u)) = u to ${show(worst)} at 63 values of u: the bisection inverts F, and F has no jump there.` : `F(Q(u)) differs from u by ${show(worst)} near x = ${show(where)}: F jumps there. The page reads a CDF input as a law with no atoms.`);
    const supportText = interval(lo, hi);
    const observations = observe(ctx, (x) => x >= lo && x <= hi, clamp, supportText);
    const bounded = Number.isFinite(lo) && Number.isFinite(hi);
    let m1 = NaN, m2 = NaN;
    if (bounded) {
      // E[X] = lo + ∫(1 − F) and E[(X − lo)²] = ∫ 2(x − lo)(1 − F) by Simpson's rule.
      const du = (hi - lo) / N;
      let a = 0, b = 0;
      for (let j = 0; j < N; j++) {
        const x0 = lo + j * du, xm = x0 + du / 2, x1 = x0 + du;
        a += (du / 6) * ((1 - clamp(x0)) + 4 * (1 - clamp(xm)) + (1 - clamp(x1)));
        b += (du / 6) * (2 * (x0 - lo) * (1 - clamp(x0)) + 8 * (xm - lo) * (1 - clamp(xm)) + 2 * (x1 - lo) * (1 - clamp(x1)));
      }
      m1 = lo + a;
      m2 = b + 2 * lo * m1 - lo * lo;
    }
    const label = "Inverse transform by bisection on F, to a relative width of 10^-12";
    const draw = (/** @type {Rng} */ rng) => quantile(rng.uniform());
    return finish(def, ctx.checks, "", {
      lo, hi, supportText, pmf: () => 0, pdf: slope(clamp), cdf: clamp, sf: (/** @type {number} */ x) => 1 - clamp(x), quantile,
      moments: bounded ? { mean: m1, variance: Math.max(0, m2 - m1 * m1), order: Infinity } : { mean: null, variance: null, order: null },
      numeric: bounded ? { mean: m1, variance: Math.max(0, m2 - m1 * m1), bounded } : null,
      samplers: { reference: sampler(label, draw, "approximate", "approximate: bisection to a tolerance"), inverse: sampler(label, draw, "approximate", "approximate: bisection to a tolerance"), rejection: () => none("Rejection needs a density, and this input is a CDF.") },
      controls: [`Checks on ${pts} points of the grid ${map.text}.`, "Bisection on F: at most 200 halvings, to a relative width of 10^-12."],
      sources: ["Bisection: a relative error of 10^-12 in each sample.", "The checks look at the grid points only: F between them is not checked."],
      observations,
    });
  }

  /** A quantile function: X = Q(U) is exact. @param {any} ctx */
  function quantileLaw(ctx) {
    const { def, fns, env, slot, grid: N, add } = ctx;
    /** @param {number} u */
    const Q = (u) => { env[slot] = u; const v = fns.f(env); if (typeof v !== "number") throw new E.ExprError(`Q gives a vector at u = ${show(u)}`); return v; };
    let bad = "", down = "", prev = -Infinity, prevU = 0;
    let lo = ctx.lo, hi = ctx.hi;
    const q0 = Q(0), q1 = Q(1);
    if (!fns.lo) lo = Number.isNaN(q0) ? -Infinity : q0;
    if (!fns.hi) hi = Number.isNaN(q1) ? Infinity : q1;
    let outside = "", qmin = Infinity, qmax = -Infinity;
    for (let j = 0; j < N; j++) {
      const u = (j + 0.5) / N, v = Q(u);
      if (!Number.isFinite(v)) { if (!bad) bad = `Q(${show(u)}) is ${show(v)}, not a finite number.`; continue; }
      if (v < prev - 1e-12 * Math.max(1, Math.abs(prev)) && !down) down = `Q decreases by ${show(prev - v)} between u = ${show(prevU)} and u = ${show(u)}.`;
      if ((v < lo || v > hi) && !outside) outside = `Q(${show(u)}) = ${show(v)} lies outside the stated support ${interval(lo, hi)}.`;
      prev = v;
      prevU = u;
      qmin = Math.min(qmin, v);
      qmax = Math.max(qmax, v);
    }
    add("boundaries", "Boundaries", bad || outside ? "failed" : "checked", bad || outside || `Q(u) is finite at the ${count(N)} grid points u = (j − 1/2)/${count(N)}, with values from ${show(qmin)} to ${show(qmax)} inside the support ${interval(lo, hi)}.`);
    add("monotonicity", "Monotonicity", down ? "failed" : "checked", down || `Q does not decrease between the ${count(N)} grid points.`);
    add("consistency", "Consistency", "unverified", "A quantile function is left-continuous. The page does not test continuity between grid points.");
    if (ctx.checks.some((/** @type {Check} */ k) => k.status === "failed")) return finish(def, ctx.checks, "", null);
    /** @param {number} x */
    const cdf = (x) => {
      if (x < lo) return 0;
      if (x >= hi) return 1;
      let a = 0, b = 1;
      for (let i = 0; i < 60; i++) { const mid = (a + b) / 2; if (Q(mid) <= x) a = mid; else b = mid; }
      return a;
    };
    const supportText = interval(lo, hi);
    const observations = observe(ctx, (x) => x >= lo && x <= hi, cdf, supportText);
    const bounded = Number.isFinite(lo) && Number.isFinite(hi);
    let m1 = 0, m2 = 0;
    for (let j = 0; j < N; j++) { const v = Q((j + 0.5) / N); m1 += v / N; m2 += (v * v) / N; }
    const exact = sampler("Inverse transform with the stated quantile function: X = Q(U)", (rng) => Q(rng.uniform()), "exact", "exact");
    return finish(def, ctx.checks, "", {
      lo, hi, supportText, pmf: () => 0, pdf: slope(cdf), cdf, sf: (/** @type {number} */ x) => 1 - cdf(x), quantile: Q,
      moments: bounded ? { mean: m1, variance: Math.max(0, m2 - m1 * m1), order: Infinity } : { mean: null, variance: null, order: null },
      numeric: { mean: m1, variance: Math.max(0, m2 - m1 * m1), bounded },
      samplers: { reference: exact, inverse: exact, rejection: () => none("Rejection needs a density, and this input is a quantile function.") },
      controls: [`Checks on ${count(N)} grid points of u.`, "The CDF for the plots comes from 60 halvings of u."],
      sources: ["Sampling: none beyond round-off, X = Q(U) is exact.", "Plots and reference values: the CDF by bisection, to 2^-60 in u."],
      observations,
    });
  }

  /* ---------- an MGF and a characteristic function ---------- */

  /**
   * A transform: the CF φ(t), or φ(t) = M(it) for an MGF M finite near 0, inverted by the Gil-Pelaez formula
   * F(x) = 1/2 − (1/π) ∫_0^∞ Im[e^{−itx} φ(t)]/t dt with the midpoint rule, on a grid of x. The CDF table then gives
   * the samplers.
   * @param {any} ctx
   */
  function transformLaw(ctx) {
    const { def, fns, env, slot, grid, add } = ctx;
    const mgf = def.kind === "mgf";
    /** @param {number} t @returns {C} */
    const phi = (t) => { env[slot] = mgf ? [0, t] : t; const v = fns.complex(env); env[slot] = 0; return v; };
    /** @param {number} t */
    const M = (t) => { env[slot] = t; const v = fns.f(env); if (typeof v !== "number") throw new E.ExprError("M gives a vector"); return v; };
    let mean = NaN, variance = NaN;
    if (mgf) {
      const m0 = (M(1e-9) + M(-1e-9)) / 2;
      add("normalisation", "Normalisation", Math.abs(m0 - 1) <= 1e-6 ? "checked" : "failed", `M(0) = ${show(m0)}${Math.abs(m0 - 1) <= 1e-6 ? "" : ", not 1"}: an MGF has M(0) = E[e^0] = 1.`);
      let delta = 0;
      for (const d of [1, 0.1, 0.01, 0.001]) {
        let ok = true;
        for (let j = -20; j <= 20 && ok; j++) { const v = M((d * j) / 20); if (!Number.isFinite(v) && j !== 0) ok = false; }
        if (ok) { delta = d; break; }
      }
      add("existence", "Existence near 0", delta ? "checked" : "failed", delta ? `M(t) is finite at 41 points of [−${delta}, ${delta}]. An MGF that is finite on an open interval around 0 determines the law.` : "M(t) is not finite at points of [−0.001, 0.001]: the MGF does not exist near 0, so it does not define a law here.");
      if (!delta) return finish(def, ctx.checks, "", null);
      let neg = "", convex = "";
      const d = delta / 20;
      // M at 0 is the limit m0, so an expression such as (e^t − 1)/t, which is 0/0 at t = 0, still checks.
      const Ms = (/** @type {number} */ t) => (t === 0 ? m0 : M(t));
      for (let j = -19; j <= 19; j++) {
        const t = j * d, v = Ms(t);
        if (!(v > 0) && !neg) neg = `M(${show(t)}) = ${show(v)}, not > 0.`;
        const second = (Ms((j + 1) * d) - 2 * v + Ms((j - 1) * d)) / (d * d);
        if (second < -(1e-12 * Math.max(1, Math.abs(v))) / (d * d) - 1e-9 && !convex) convex = `M″(${show(t)}) ≈ ${show(second)} < 0, but an MGF is convex: M″(t) = E[X² e^{tX}] ≥ 0.`;
      }
      add("nonnegative", "Non-negativity", neg ? "failed" : "checked", neg || `M(t) > 0 at 39 points of [−${delta}, ${delta}].`);
      add("monotonicity", "Monotonicity", convex ? "failed" : "checked", convex || `M′ does not decrease (M is convex) at 39 points of [−${delta}, ${delta}].`);
      // Moments by central differences with Richardson's extrapolation.
      const h = Math.min(1e-3, delta / 10);
      const d1 = (/** @type {number} */ e) => (M(e) - M(-e)) / (2 * e), d2 = (/** @type {number} */ e) => (M(e) - 2 * m0 + M(-e)) / (e * e);
      mean = (4 * d1(h / 2) - d1(h)) / 3;
      const second = (4 * d2(h / 2) - d2(h)) / 3;
      variance = second - mean * mean;
      if (ctx.checks.some((/** @type {Check} */ c) => c.status === "failed")) return finish(def, ctx.checks, "", null);
    } else {
      const p0 = phi(1e-9);
      add("normalisation", "Normalisation", Math.hypot(p0[0] - 1, p0[1]) <= 1e-6 ? "checked" : "failed", `φ(0) = ${show(p0[0])}${Math.abs(p0[1]) > 1e-12 ? ` + ${show(p0[1])}i` : ""}: a CF has φ(0) = E[e^0] = 1.`);
      let worst = 0, at = 0;
      for (let j = 1; j <= 200; j++) {
        const t = 0.05 * j * j, a = phi(t), b = phi(-t), dd = Math.hypot(a[0] - b[0], a[1] + b[1]);
        if (dd > worst) { worst = dd; at = t; }
      }
      add("consistency", "Consistency", worst <= 1e-9 ? "checked" : "failed", worst <= 1e-9 ? "φ(−t) is the complex conjugate of φ(t) at 200 points: the law is on the real line." : `|φ(−t) − conj φ(t)| = ${show(worst)} at t = ${show(at)}: the CF of a real random variable has φ(−t) = conj φ(t).`);
      if (ctx.checks.some((/** @type {Check} */ c) => c.status === "failed")) return finish(def, ctx.checks, "", null);
    }
    // Location and scale from φ: the first t with |φ(t)| ≤ 1/2, and arg φ near 0.
    let tHalf = 0, bigger = 0, bigAt = 0;
    for (let e = -4; e <= 4; e += 0.05) {
      const t = 10 ** e, v = phi(t), r = Math.hypot(v[0], v[1]);
      if (!Number.isFinite(r)) throw new E.ExprError(`φ(${show(t)}) is not a finite number`);
      if (r > 1 + 1e-9 && r > bigger) { bigger = r; bigAt = t; }
      if (!tHalf && r <= 0.5) tHalf = t;
    }
    if (bigger) {
      add("boundaries", "Boundaries", "failed", `|φ(${show(bigAt)})| = ${show(bigger)} > 1, but |φ(t)| = |E[e^{itX}]| ≤ 1.`);
      return finish(def, ctx.checks, "", null);
    }
    if (!tHalf) {
      add("boundaries", "Boundaries", "unverified", "|φ(t)| stays above 1/2 for t up to 10^4: the law is close to a point mass or is a lattice law, and this inversion needs a law with a density.");
      return finish(def, ctx.checks, "the page cannot invert a transform whose modulus does not fall", null);
    }
    const scale = 1 / tHalf, small = phi(tHalf / 100), loc = Math.atan2(small[1], small[0]) / (tHalf / 100);
    const centre = mgf && Number.isFinite(mean) ? mean : loc;
    const spread = mgf && variance > 0 ? 12 * Math.sqrt(variance) : 100 * scale;
    let a = centre - spread, b = centre + spread;
    if (Number.isFinite(ctx.lo)) a = Math.max(a, ctx.lo);
    if (Number.isFinite(ctx.hi)) b = Math.min(b, ctx.hi);
    if (!(b > a)) throw new E.ExprError("the support and the scale of the transform do not overlap");
    // The midpoint rule in t with step h = π/(b − a): the periodised law repeats every 2(b − a), outside the table.
    const W = b - a, h = Math.PI / W;
    const ts = [], ph = [];
    for (let k = 0; k < 8192; k++) {
      const t = (k + 0.5) * h, v = phi(t);
      ts.push(t);
      ph.push(v);
      if (Math.hypot(v[0], v[1]) / t < 1e-13 && k > 16) break;
    }
    const nt = ts.length, last = Math.hypot(ph[nt - 1][0], ph[nt - 1][1]) / ts[nt - 1];
    const Nx = Math.min(grid / 2, 2048);
    const xs = new Float64Array(Nx + 1), Fs = new Float64Array(Nx + 1);
    for (let j = 0; j <= Nx; j++) {
      const x = a + (W * j) / Nx;
      // e^{−i t_k x} by rotation: one complex product for each term.
      const rot = [Math.cos(h * x), -Math.sin(h * x)];
      let e = [Math.cos(h * x / 2), -Math.sin(h * x / 2)], sum = 0;
      for (let k = 0; k < nt; k++) {
        const v = ph[k];
        sum += (e[0] * v[1] + e[1] * v[0]) / ts[k];
        e = [e[0] * rot[0] - e[1] * rot[1], e[0] * rot[1] + e[1] * rot[0]];
      }
      xs[j] = x;
      Fs[j] = 0.5 - (h * sum) / Math.PI;
    }
    let down = 0, downAt = 0;
    for (let j = 1; j <= Nx; j++) if (Fs[j - 1] - Fs[j] > down) { down = Fs[j - 1] - Fs[j]; downAt = xs[j]; }
    add("inversion", "Monotonicity of the inverted CDF", down <= 1e-6 ? "checked" : "failed", down <= 1e-6 ? `The inverted CDF does not decrease by more than ${show(down)} between the ${count(Nx + 1)} grid points.` : `The inverted CDF decreases by ${show(down)} near x = ${show(downAt)}: the expression is not the transform of a law, or the inversion does not resolve it.`);
    const outside = Math.max(0, Fs[0]) + Math.max(0, 1 - Fs[Nx]);
    add("boundaries", "Boundaries", outside <= 1e-4 ? "checked" : "unverified", `The inverted CDF is ${show(Fs[0])} at x = ${show(a)} and ${show(Fs[Nx])} at x = ${show(b)}: the mass outside the table is about ${show(outside)}${outside <= 1e-4 ? "" : ", more than 10^-4"}.`);
    add("definite", mgf ? "An MGF of a law" : "Positive definiteness (Bochner)", "unverified", mgf ? "No finite test decides that a function is the MGF of a law. The page tests the inverted CDF on a grid only." : "φ is a CF if and only if it is continuous, positive definite and φ(0) = 1. The page tests the inverted CDF on a grid only.");
    if (ctx.checks.some((/** @type {Check} */ c) => c.status === "failed")) return finish(def, ctx.checks, "", null);
    // The CDF table: a running maximum, scaled to [0, 1] over the table.
    const C = new Float64Array(Nx + 1);
    let run = 0;
    for (let j = 0; j <= Nx; j++) { run = Math.max(run, Fs[j]); C[j] = run; }
    const F0 = C[0], F1 = C[Nx];
    for (let j = 0; j <= Nx; j++) C[j] = (C[j] - F0) / (F1 - F0);
    /** @param {number} x */
    const cdf = (x) => {
      if (x <= a) return 0;
      if (x >= b) return 1;
      const v = ((x - a) / W) * Nx, j = Math.min(Nx - 1, Math.floor(v));
      return C[j] + (v - j) * (C[j + 1] - C[j]);
    };
    /** @param {number} u */
    const quantile = (u) => {
      const j = Math.max(1, search(C, u)) - 1, d = C[j + 1] - C[j];
      return a + ((j + (d > 0 ? Math.min(1, Math.max(0, (u - C[j]) / d)) : 0)) * W) / Nx;
    };
    let m1 = 0, m2 = 0;
    for (let j = 0; j < Nx; j++) { const x = a + ((j + 0.5) * W) / Nx, w = C[j + 1] - C[j]; m1 += w * x; m2 += w * x * x; }
    const tableVar = Math.max(0, m2 - m1 * m1);
    if (mgf) {
      const sd = Math.sqrt(Math.max(variance, 0));
      const ok = Math.abs(m1 - mean) <= 1e-3 * Math.max(sd, 1e-12) + 1e-9 && Math.abs(tableVar - variance) <= 1e-2 * Math.max(variance, 1e-12);
      add("consistency", "Consistency", ok ? "checked" : "failed", `M′(0) = ${show(mean)} and M″(0) − M′(0)² = ${show(variance)} by finite differences; the inverted law has mean ${show(m1)} and variance ${show(tableVar)}.`);
      if (!ok) return finish(def, ctx.checks, "", null);
    }
    const supportText = Number.isFinite(ctx.lo) || Number.isFinite(ctx.hi) ? interval(ctx.lo, ctx.hi) : "(−∞, ∞)";
    const observations = observe(ctx, (x) => x >= ctx.lo && x <= ctx.hi, cdf, supportText);
    const label = `Inverse transform with the CDF from the Gil-Pelaez inversion: ${count(Nx)} cells of [${show(a)}, ${show(b)}], linear inside a cell`;
    const draw = (/** @type {Rng} */ rng) => quantile(rng.uniform());
    const bounded = Number.isFinite(ctx.lo) && Number.isFinite(ctx.hi);
    return finish(def, ctx.checks, "", {
      lo: ctx.lo, hi: ctx.hi, supportText, pmf: () => 0, pdf: slope(cdf), cdf, sf: (/** @type {number} */ x) => 1 - cdf(x), quantile,
      moments: bounded ? { mean: m1, variance: tableVar, order: Infinity } : { mean: null, variance: null, order: null },
      numeric: { mean: m1, variance: tableVar, bounded },
      samplers: { reference: sampler(label, draw, "approximate", "approximate: numerical inversion of the transform"), inverse: sampler(label, draw, "approximate", "approximate: numerical inversion of the transform"), rejection: () => none(`Rejection needs a density, and this input is ${mgf ? "an MGF" : "a CF"}.`) },
      controls: [
        `The table covers [${show(a)}, ${show(b)}] with ${count(Nx)} cells: ${mgf ? "the mean ± 12 standard deviations from M" : "the location ± 100 scales, with the scale 1/t where |φ(t)| = 1/2"}.`,
        `The midpoint rule in t with step h = π/(b − a) = ${show(h)} and ${count(nt)} terms${mgf ? ", with φ(t) = M(it)" : ""}.`,
      ],
      sources: [
        `Aliasing: the step h repeats the law every ${show(2 * W)}; mass outside the table, about ${show(outside)}, folds back.`,
        `Truncation of the t integral: |φ(t)|/t = ${show(last)} at the last term.`,
        "Interpolation: the CDF is linear inside a cell; the page takes a running maximum, so the table never decreases.",
        ...(mgf ? ["The page evaluates M at imaginary arguments. This follows the principal branch of each function of the expression, which must agree with the analytic continuation of M."] : []),
      ],
      observations,
    });
  }

  /* ---------- the law lines of a model ---------- */

  /**
   * Compile the law lines of a model record. Returns a map from name to law and the errors.
   * @param {LawDef[]} defs @param {(id: string) => boolean} taken
   */
  function compileAll(defs, taken) {
    /** @type {Map<string, any>} */
    const laws = new Map();
    /** @type {string[]} */
    const errors = [];
    if (!Array.isArray(defs)) return { laws, errors: defs === undefined ? [] : ["The laws of a model record are a list."] };
    if (defs.length > 8) errors.push("A model has at most 8 custom laws.");
    for (const def of defs.slice(0, 8)) {
      if (laws.has(def?.name)) { errors.push(`Law ${String(def.name).slice(0, 24)} has two definitions.`); continue; }
      const r = compile(def, taken);
      if (r.law) laws.set(def.name, r.law);
      else errors.push(...(r.errors ?? []));
    }
    return { laws, errors };
  }

  return { KINDS, CLAUSES, GRID, ALERTS, STATUS_TEXT, compile, compileAll, ccompile, makeMap, kolmogorov, atomsLaw, solve, search };
});
