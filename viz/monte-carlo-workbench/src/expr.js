/* Monte Carlo Probability Workbench: the expression language. A Pratt parser reads an expression into a tree of
 * numbers, names, operators, vectors and calls of a fixed list of functions; compile() turns the tree into nested
 * closures that read an array of slots. Nothing here calls eval, Function or a property of a JavaScript object by
 * name: a name that is not a model name, a constant or a listed function is an error, so an expression cannot run
 * JavaScript. Values are numbers or arrays of numbers; arithmetic and comparisons act element by element.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCExpr = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const MAX_LENGTH = 1000, MAX_DEPTH = 64;

  /** @typedef {number | number[]} Value */
  /** @typedef {{ t: "num", v: number } | { t: "id", name: string } | { t: "un", op: string, a: Node } | { t: "bin", op: string, a: Node, b: Node }
   *   | { t: "call", fn: string, args: Node[] } | { t: "idx", a: Node, i: Node } | { t: "arr", items: Node[] }} Node */

  class ExprError extends Error {}

  /** True when the table itself, not Object.prototype, holds the key. @param {object} table @param {string} key */
  const own = (table, key) => Object.prototype.hasOwnProperty.call(table, key);
  const CONSTANTS = /** @type {Record<string, number>} */ ({ pi: Math.PI, e: Math.E, inf: Infinity });
  const KEYWORDS = /** @type {Record<string, string>} */ ({ and: "&&", or: "||", not: "!" });
  /** Each function's least and greatest number of arguments. */
  const FUNCTIONS = /** @type {Record<string, [number, number]>} */ ({
    abs: [1, 1], sqrt: [1, 1], exp: [1, 1], log: [1, 1], log1p: [1, 1], floor: [1, 1], ceil: [1, 1], round: [1, 1],
    pow: [2, 2], min: [1, 32], max: [1, 32], pmin: [2, 2], pmax: [2, 2], if: [3, 3], sum: [1, 1], mean: [1, 1],
    prod: [1, 1], len: [1, 1], count: [2, 2], distinct: [1, 1], maxcount: [1, 1], any: [1, 1], all: [1, 1], normalize: [1, 1],
    median: [1, 1], quantile: [2, 2], hill: [2, 2], km: [3, 3],
    sin: [1, 1], cos: [1, 1], tan: [1, 1], atan: [1, 1], lgamma: [1, 1],
  });
  const BINARY = /** @type {Record<string, [number, boolean]>} */ ({
    "||": [1, false], "&&": [2, false], "<": [4, false], "<=": [4, false], ">": [4, false], ">=": [4, false], "==": [4, false],
    "!=": [4, false], "+": [5, false], "-": [5, false], "*": [6, false], "/": [6, false], "^": [8, true],
  });

  /** @param {string} src @returns {{ k: string, v: string, at: number }[]} */
  function tokens(src) {
    if (typeof src !== "string") throw new ExprError("An expression is text.");
    if (src.length > MAX_LENGTH) throw new ExprError(`An expression has at most ${MAX_LENGTH} characters.`);
    const out = [];
    const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/^()[\],<>!]))/y;
    let at = 0;
    while (at < src.length) {
      if (/^\s*$/.test(src.slice(at))) break;
      re.lastIndex = at;
      const m = re.exec(src);
      if (!m) throw new ExprError(`The character "${src[at + (src.slice(at).length - src.slice(at).trimStart().length)]}" at position ${at + 1} is not part of the expression language.`);
      if (m[1] !== undefined) out.push({ k: "num", v: m[1], at });
      else if (m[2] !== undefined) out.push(own(KEYWORDS, m[2]) ? { k: "op", v: KEYWORDS[m[2]], at } : { k: "id", v: m[2], at });
      else out.push({ k: "op", v: m[3], at });
      at = re.lastIndex;
    }
    return out;
  }

  /** Read an expression into a tree. @param {string} src @returns {Node} */
  function parse(src) {
    const toks = tokens(src);
    let pos = 0;
    const peek = () => toks[pos];
    /** @param {string} v */
    const expect = (v) => {
      const t = toks[pos];
      if (!t || t.v !== v) throw new ExprError(t ? `Expected "${v}" at position ${t.at + 1}, found "${t.v}".` : `Expected "${v}" at the end.`);
      pos++;
    };
    /** @param {number} depth @returns {Node} */
    function prefix(depth) {
      if (depth > MAX_DEPTH) throw new ExprError(`An expression nests at most ${MAX_DEPTH} levels.`);
      const t = toks[pos++];
      if (!t) throw new ExprError("The expression ends too early.");
      if (t.k === "num") {
        const v = Number(t.v);
        if (!Number.isFinite(v)) throw new ExprError(`The number ${t.v} is too large.`);
        return { t: "num", v };
      }
      if (t.k === "id") {
        if (peek()?.v === "(") {
          if (!own(FUNCTIONS, t.v)) throw new ExprError(`"${t.v}" is not a function of the expression language.`);
          pos++;
          /** @type {Node[]} */
          const args = [];
          if (peek()?.v !== ")") {
            for (;;) {
              args.push(expr(0, depth + 1));
              if (peek()?.v === ",") pos++;
              else break;
            }
          }
          expect(")");
          const [lo, hi] = FUNCTIONS[t.v];
          if (args.length < lo || args.length > hi) throw new ExprError(`${t.v}() takes ${lo === hi ? lo : `${lo} to ${hi}`} argument${hi === 1 ? "" : "s"}, not ${args.length}.`);
          return { t: "call", fn: t.v, args };
        }
        return { t: "id", name: t.v };
      }
      if (t.v === "(") {
        const inner = expr(0, depth + 1);
        expect(")");
        return inner;
      }
      if (t.v === "[") {
        /** @type {Node[]} */
        const items = [];
        if (peek()?.v !== "]") {
          for (;;) {
            items.push(expr(0, depth + 1));
            if (peek()?.v === ",") pos++;
            else break;
          }
        }
        expect("]");
        if (!items.length) throw new ExprError("A vector has at least one entry.");
        return { t: "arr", items };
      }
      if (t.v === "-" || t.v === "+") return { t: "un", op: t.v, a: expr(7, depth + 1) };
      if (t.v === "!") return { t: "un", op: "!", a: expr(3, depth + 1) };
      throw new ExprError(`"${t.v}" at position ${t.at + 1} cannot start an expression.`);
    }
    /** @param {number} min @param {number} depth @returns {Node} */
    function expr(min, depth) {
      let left = prefix(depth), compared = false;
      for (;;) {
        const t = peek();
        if (!t) break;
        if (t.v === "[") {
          pos++;
          const i = expr(0, depth + 1);
          expect("]");
          left = { t: "idx", a: left, i };
          continue;
        }
        const info = t.k === "op" && own(BINARY, t.v) ? BINARY[t.v] : undefined;
        if (!info || info[0] < min) break;
        if (info[0] === 4 && compared) throw new ExprError(`Comparisons do not chain: use "and" at position ${t.at + 1}.`);
        compared = info[0] === 4;
        pos++;
        const right = expr(info[1] ? info[0] : info[0] + 1, depth + 1);
        left = { t: "bin", op: t.v, a: left, b: right };
      }
      return left;
    }
    const tree = expr(0, 0);
    if (pos < toks.length) throw new ExprError(`Unexpected "${toks[pos].v}" at position ${toks[pos].at + 1}.`);
    return tree;
  }

  /** The model names an expression reads. @param {Node} node @param {Set<string>} [out] */
  function names(node, out = new Set()) {
    if (node.t === "id") { if (!own(CONSTANTS, node.name)) out.add(node.name); }
    else if (node.t === "un") names(node.a, out);
    else if (node.t === "bin") { names(node.a, out); names(node.b, out); }
    else if (node.t === "call") for (const a of node.args) names(a, out);
    else if (node.t === "idx") { names(node.a, out); names(node.i, out); }
    else if (node.t === "arr") for (const a of node.items) names(a, out);
    return out;
  }

  /* ---------- evaluation ---------- */

  /** @param {(x: number) => number} f @param {Value} a @returns {Value} */
  const map1 = (f, a) => (typeof a === "number" ? f(a) : a.map(f));
  /** @param {(x: number, y: number) => number} f @param {Value} a @param {Value} b @returns {Value} */
  function map2(f, a, b) {
    if (typeof a === "number" && typeof b === "number") return f(a, b);
    if (typeof a === "number") return /** @type {number[]} */ (b).map((y) => f(a, y));
    if (typeof b === "number") return a.map((x) => f(x, b));
    if (a.length !== b.length) throw new ExprError(`Vectors of length ${a.length} and ${b.length} do not combine.`);
    return a.map((x, i) => f(x, /** @type {number[]} */ (b)[i]));
  }
  /** @param {Value} v @returns {number[]} */
  const vec = (v) => (typeof v === "number" ? [v] : v);
  /** @param {Value} v @param {string} what */
  function num(v, what) {
    if (typeof v !== "number") throw new ExprError(`${what} needs a number, not a vector.`);
    return v;
  }

  const OPS = /** @type {Record<string, (x: number, y: number) => number>} */ ({
    "+": (x, y) => x + y, "-": (x, y) => x - y, "*": (x, y) => x * y, "/": (x, y) => x / y, "^": (x, y) => Math.pow(x, y),
    "<": (x, y) => +(x < y), "<=": (x, y) => +(x <= y), ">": (x, y) => +(x > y), ">=": (x, y) => +(x >= y),
    "==": (x, y) => +(x === y), "!=": (x, y) => +(x !== y), "&&": (x, y) => +(x !== 0 && y !== 0), "||": (x, y) => +(x !== 0 || y !== 0),
  });
  /** log Γ(x) for x > 0 (Lanczos, g = 7, 9 terms), and NaN outside its domain, as Math.log gives for x < 0. @param {number} x @returns {number} */
  function lgamma(x) {
    if (!(x > 0)) return NaN;
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    const L = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let a = L[0];
    const t = x + 6.5;
    for (let i = 1; i < 9; i++) a += L[i] / (x - 1 + i);
    return 0.9189385332046728 + (x - 0.5) * Math.log(t) - t + Math.log(a);
  }
  const UNARY = /** @type {Record<string, (x: number) => number>} */ ({ "-": (x) => -x, "+": (x) => x, "!": (x) => +(x === 0) });
  const MATH1 = /** @type {Record<string, (x: number) => number>} */ ({
    abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, log: Math.log, log1p: Math.log1p, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, lgamma,
  });

  /** @param {string} fn @param {Value[]} v @returns {Value} */
  function call(fn, v) {
    if (own(MATH1, fn)) return map1(MATH1[fn], v[0]);
    switch (fn) {
      case "pow": return map2(Math.pow, v[0], v[1]);
      case "pmin": return map2(Math.min, v[0], v[1]);
      case "pmax": return map2(Math.max, v[0], v[1]);
      case "min": return Math.min(...v.flatMap(vec));
      case "max": return Math.max(...v.flatMap(vec));
      case "sum": return vec(v[0]).reduce((s, x) => s + x, 0);
      case "mean": { const a = vec(v[0]); return a.reduce((s, x) => s + x, 0) / a.length; }
      case "prod": return vec(v[0]).reduce((s, x) => s * x, 1);
      case "len": return vec(v[0]).length;
      case "count": { const x = num(v[1], "count()"); return vec(v[0]).reduce((s, y) => s + +(y === x), 0); }
      case "distinct": return new Set(vec(v[0])).size;
      case "maxcount": {
        /** @type {Map<number, number>} */
        const seen = new Map();
        let best = 0;
        for (const x of vec(v[0])) { const c = (seen.get(x) ?? 0) + 1; seen.set(x, c); if (c > best) best = c; }
        return best;
      }
      case "any": return +vec(v[0]).some((x) => x !== 0);
      case "all": return +vec(v[0]).every((x) => x !== 0);
      case "normalize": {
        const a = vec(v[0]), s = a.reduce((t, x) => t + x, 0);
        if (!(s > 0) || a.some((x) => !(x >= 0))) throw new ExprError("normalize() needs weights that are not negative, with a positive sum.");
        return a.map((x) => x / s);
      }
      case "median": return sampleQuantile(vec(v[0]), 0.5);
      case "quantile": {
        const p = num(v[1], "quantile()");
        if (!(p >= 0 && p <= 1)) throw new ExprError(`quantile() needs a level in [0, 1], not ${p}.`);
        return sampleQuantile(vec(v[0]), p);
      }
      case "hill": return hill(vec(v[0]), num(v[1], "hill()"));
      case "km": return kaplanMeier(vec(v[0]), vec(v[1]), num(v[2], "km()"));
      case "if": {
        const c = v[0];
        if (typeof c === "number") return c !== 0 ? v[1] : v[2];
        return c.map((x, i) => {
          const a = v[1], b = v[2];
          const pick = x !== 0 ? a : b;
          if (typeof pick === "number") return pick;
          if (pick.length !== c.length) throw new ExprError(`if() has a condition of length ${c.length} and a branch of length ${pick.length}.`);
          return pick[i];
        });
      }
      default: throw new ExprError(`"${fn}" is not a function of the expression language.`);
    }
  }

  /** The sample quantile of level p with linear interpolation between order statistics (type 7). @param {number[]} x @param {number} p */
  function sampleQuantile(x, p) {
    const s = x.slice().sort((a, b) => a - b), h = (s.length - 1) * p, lo = Math.floor(h);
    return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo];
  }

  /**
   * Hill's estimator of the extreme-value index γ = 1/α from the k largest values: the mean of log(X_(n−i+1)/X_(n−k))
   * for i = 1 … k. It needs 1 ≤ k < n and a positive X_(n−k).
   * @param {number[]} x @param {number} k
   */
  function hill(x, k) {
    const s = x.slice().sort((a, b) => b - a);
    if (!Number.isInteger(k) || k < 1 || k >= s.length) throw new ExprError(`hill() needs an integer k from 1 to ${s.length - 1}, not ${k}.`);
    if (!(s[k] > 0)) throw new ExprError("hill() needs positive values above its threshold X_(n−k).");
    let sum = 0;
    for (let i = 0; i < k; i++) sum += Math.log(s[i] / s[k]);
    return sum / k;
  }

  /**
   * The Kaplan–Meier estimate of P(T > t) from observed times y and event indicators d (1: the event, 0: censored).
   * At a tie, events come before censorings, so a value censored at an event time is still at risk then.
   * @param {number[]} y @param {number[]} d @param {number} t
   */
  function kaplanMeier(y, d, t) {
    if (y.length !== d.length) throw new ExprError(`km() needs times and event indicators of the same length, not ${y.length} and ${d.length}.`);
    const order = y.map((_, i) => i).sort((a, b) => y[a] - y[b] || d[b] - d[a]);
    let atRisk = y.length, S = 1;
    for (let j = 0; j < order.length;) {
      const time = y[order[j]];
      if (time > t) break;
      let events = 0, all = 0;
      while (j < order.length && y[order[j]] === time) { events += +(d[order[j]] !== 0); all++; j++; }
      if (events) S *= 1 - events / atRisk;
      atRisk -= all;
    }
    return S;
  }

  /**
   * Compile a tree to a function of the slot array. `slots` maps each model name to its slot index; a name that is
   * not in it, and not a constant, is an error here, before any run.
   * @param {Node} node @param {Map<string, number>} slots @returns {(env: Value[]) => Value}
   */
  function compile(node, slots) {
    switch (node.t) {
      case "num": { const v = node.v; return () => v; }
      case "id": {
        if (own(CONSTANTS, node.name)) { const v = CONSTANTS[node.name]; return () => v; }
        const i = slots.get(node.name);
        if (i === undefined) throw new ExprError(`"${node.name}" is not defined before this expression.`);
        return (env) => env[i];
      }
      case "un": { const f = UNARY[node.op], a = compile(node.a, slots); return (env) => map1(f, a(env)); }
      case "bin": {
        const f = OPS[node.op], a = compile(node.a, slots), b = compile(node.b, slots);
        return (env) => map2(f, a(env), b(env));
      }
      case "call": { const fn = node.fn, args = node.args.map((x) => compile(x, slots)); return (env) => call(fn, args.map((g) => g(env))); }
      case "idx": {
        const a = compile(node.a, slots), i = compile(node.i, slots);
        return (env) => {
          const v = a(env), k = i(env);
          if (typeof v === "number") throw new ExprError("Only a vector takes an index.");
          if (typeof k !== "number" || !Number.isInteger(k) || k < 1 || k > v.length) throw new ExprError(`The index ${typeof k === "number" ? k : "vector"} is outside 1..${v.length}.`);
          return v[k - 1];
        };
      }
      case "arr": {
        const items = node.items.map((x) => compile(x, slots));
        return (env) => items.map((g) => num(g(env), "A vector entry"));
      }
    }
  }

  /** Parse and compile in one step, with the names the expression reads. @param {string} src @param {Map<string, number>} slots */
  function build(src, slots) {
    const tree = parse(src);
    return { tree, fn: compile(tree, slots), reads: names(tree) };
  }

  /** A constant expression's value (no model names). @param {string} src */
  function value(src) {
    return compile(parse(src), new Map())([]);
  }

  /* ---------- TeX ---------- */

  const TEX_OP = /** @type {Record<string, string>} */ ({ "<": "<", "<=": "\\le", ">": ">", ">=": "\\ge", "==": "=", "!=": "\\ne", "&&": "\\wedge", "||": "\\vee", "+": "+", "-": "-", "*": "\\cdot" });
  const TEX_FN = /** @type {Record<string, string>} */ ({ exp: "\\exp", log: "\\log", min: "\\min", max: "\\max", sin: "\\sin", cos: "\\cos", tan: "\\tan", atan: "\\arctan", lgamma: "\\ln\\Gamma" });

  /** A model name in TeX: one letter in italic, a longer name upright, a part after "_" as a subscript. @param {string} name */
  function texName(name) {
    if (own(CONSTANTS, name)) return name === "pi" ? "\\pi" : name === "inf" ? "\\infty" : "e";
    const [head, ...rest] = name.split("_");
    const h = head.length === 1 ? head : `\\mathrm{${head}}`;
    return rest.length ? `${h}_{\\mathrm{${rest.join("\\_")}}}` : h;
  }

  /** @param {Node} node @returns {number} */
  const prec = (node) => (node.t === "bin" ? BINARY[node.op][0] : node.t === "un" ? 7 : 10);

  /** An expression tree as TeX. @param {Node} node @returns {string} */
  function tex(node) {
    /** @param {Node} n @param {number} p */
    const wrap = (n, p) => (prec(n) < p ? `\\left(${tex(n)}\\right)` : tex(n));
    switch (node.t) {
      case "num": return Number.isInteger(node.v) || Math.abs(node.v) >= 1e-4 ? String(node.v).replace(/e\+?(-?\d+)$/, "\\times 10^{$1}") : node.v.toExponential().replace(/e\+?(-?\d+)$/, "\\times 10^{$1}");
      case "id": return texName(node.name);
      case "un": return node.op === "!" ? `\\neg ${wrap(node.a, 7)}` : `${node.op}${wrap(node.a, 7)}`;
      case "bin": {
        const p = BINARY[node.op][0];
        if (node.op === "/") return `\\frac{${tex(node.a)}}{${tex(node.b)}}`;
        if (node.op === "^") return `{${wrap(node.a, 9)}}^{${tex(node.b)}}`;
        return `${wrap(node.a, p)} ${TEX_OP[node.op]} ${wrap(node.b, p + 1)}`;
      }
      case "call": {
        const a = node.args.map(tex);
        switch (node.fn) {
          case "abs": return `\\left|${a[0]}\\right|`;
          case "sqrt": return `\\sqrt{${a[0]}}`;
          case "floor": return `\\left\\lfloor ${a[0]} \\right\\rfloor`;
          case "ceil": return `\\left\\lceil ${a[0]} \\right\\rceil`;
          case "pow": return `{${a[0]}}^{${a[1]}}`;
          case "if": return `\\begin{cases} ${a[1]} & \\text{if } ${a[0]} \\\\ ${a[2]} & \\text{otherwise} \\end{cases}`;
          case "sum": return `\\textstyle\\sum ${node.args[0].t === "id" ? a[0] : `\\left(${a[0]}\\right)`}`;
          default: return `${own(TEX_FN, node.fn) ? TEX_FN[node.fn] : `\\operatorname{${node.fn}}`}\\left(${a.join(", ")}\\right)`;
        }
      }
      case "idx": return `${wrap(node.a, 10)}_{${tex(node.i)}}`;
      case "arr": return `\\left(${node.items.map(tex).join(", ")}\\right)`;
    }
  }

  return { ExprError, CONSTANTS, FUNCTIONS, parse, names, compile, build, value, tex, texName };
});
