/* Scientific Modelling: the bounded symbolic engine. An expression is a canonical sum of products: a map from a
 * product of atoms with rational exponents to an exact rational coefficient (src/rational.js). Atoms are names,
 * partial derivatives of fields, known functions of a canonical argument, a sum raised to a power that the engine
 * does not expand, and a positive rational raised to a fractional power. Two expressions are equal when their
 * canonical forms are equal: this is the exact check of the page, never a floating-point comparison.
 *
 * The engine expands products and positive integer powers of sums, substitutes names and derivatives, and
 * differentiates with the product and chain rules. A sum under a negative or fractional power becomes one atom,
 * divided by its pivot term so that the atom starts with 1: (T_w + S θ)^-1 = T_w^-1 (1 + (S/T_w) θ)^-1. What the
 * engine cannot do (a variable exponent, the derivative of abs or erf, an expansion that is too large) throws an
 * Unsupported error with the reason, and the caller shows the calculation as unsupported.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./expr.js"));
  else (root.SM = root.SM || {}).S = factory(root.SM.Q, root.SM.E);
})(typeof self !== "undefined" ? self : this, function (Q, E) {
  "use strict";

  /** A calculation outside the engine's bounded set, with the failed condition as its message. */
  class Unsupported extends Error {}

  const MAX_POWER = 8;
  const MAX_TERMS = 4000;
  /** The default context: no fields, no coordinates, no variables. */
  const PLAIN = { isField: () => false, isCoordinate: () => false, depends: () => false, isVar: () => false };

  /* ---------- atoms ---------- */

  const symAtom = (name) => ({ t: "sym", name, key: `s:${name}` });
  const dAtom = (f, vars) => {
    const v = vars.slice().sort();
    return { t: "d", f, vars: v, key: `d:${f}|${v.join(",")}` };
  };
  const fnAtom = (name, arg) => ({ t: "fn", name, arg, key: `f:${name}(${key(arg)})` });
  const sumAtom = (base) => ({ t: "sum", base, key: `p:(${key(base)})` });
  const numAtom = (v) => ({ t: "num", v, key: `n:${Q.str(v)}` });

  /* ---------- products and sums ---------- */

  const monoKey = (mono) => mono.map(([a, e]) => (Q.eq(e, Q.ONE) ? a.key : `${a.key}^${Q.str(e)}`)).join("*");
  /** The text key of a sum: equal sums have equal keys. */
  const key = (p) => [...p.keys()].sort().map((k) => `${Q.str(/** @type {any} */ (p.get(k)).coef)}·${k}`).join(" + ");

  /** The product of two monomials: { coef, mono }, with a rational atom to an integer power moved into coef. */
  function monoMul(m1, m2) {
    const byKey = new Map();
    for (const [a, e] of [...m1, ...m2]) {
      const cur = byKey.get(a.key);
      byKey.set(a.key, cur ? [cur[0], Q.add(cur[1], e)] : [a, e]);
    }
    let coef = Q.ONE;
    const mono = [];
    for (const [a, e] of byKey.values()) {
      if (Q.isZero(e)) continue;
      if (a.t === "num" && Q.isInteger(e)) { coef = Q.mul(coef, Q.pow(a.v, e.n)); continue; }
      mono.push([a, e]);
    }
    mono.sort((x, y) => (x[0].key < y[0].key ? -1 : x[0].key > y[0].key ? 1 : 0));
    return { coef, mono };
  }

  function addInto(map, coef, mono) {
    if (Q.isZero(coef)) return;
    const k = monoKey(mono);
    const cur = map.get(k);
    const c = cur ? Q.add(cur.coef, coef) : coef;
    if (Q.isZero(c)) map.delete(k);
    else map.set(k, { coef: c, mono });
    if (map.size > MAX_TERMS) throw new Unsupported(`the expansion has more than ${MAX_TERMS} terms`);
  }

  const zero = () => new Map();
  /** @param {any} q */
  const constant = (q) => { const m = new Map(); addInto(m, Q.of(q), []); return m; };
  const one = () => constant(Q.ONE);
  const single = (coef, mono) => { const m = new Map(); addInto(m, coef, mono); return m; };
  const atomPoly = (atom, e = Q.ONE) => single(Q.ONE, [[atom, e]]);
  const symbol = (name) => atomPoly(symAtom(name));
  /** ∂^n f / ∂vars as one atom. */
  const derivative = (f, vars) => atomPoly(dAtom(f, vars));

  function add(...ps) {
    const out = new Map();
    for (const p of ps) for (const t of p.values()) addInto(out, t.coef, t.mono);
    return out;
  }
  const scale = (p, q) => { const out = new Map(); for (const t of p.values()) addInto(out, Q.mul(t.coef, q), t.mono); return out; };
  const neg = (p) => scale(p, Q.q(-1));
  const sub = (a, b) => add(a, neg(b));
  /**
   * A sum written as pivot × its sum atom when the other factor holds that atom, so (a + b)/(a + b) = 1. Each term
   * is tried as the pivot, because the context that made the atom chose its pivot.
   */
  function folded(p, other) {
    if (p.size < 2) return p;
    const atoms = new Set();
    for (const t of other.values()) for (const [a] of t.mono) if (a.t === "sum") atoms.add(a.key);
    if (!atoms.size) return p;
    for (const pivot of p.values()) {
      const rest = divideBy(p, pivot);
      const atom = sumAtom(rest);
      if (atoms.has(atom.key)) return single(pivot.coef, monoMul(pivot.mono, [[atom, Q.ONE]]).mono);
    }
    return p;
  }
  function mul(...ps) {
    let acc = one();
    for (const p0 of ps) {
      const p = folded(p0, acc);
      acc = folded(acc, p);
      const out = new Map();
      for (const a of acc.values()) for (const b of p.values()) {
        const m = monoMul(a.mono, b.mono);
        addInto(out, Q.mul(Q.mul(a.coef, b.coef), m.coef), m.mono);
      }
      acc = out;
    }
    return acc;
  }

  /** The exact q-th root of a nonnegative BigInt, or null. */
  function root(a, q) {
    if (a < 0n) return null;
    if (a < 2n) return a;
    let r = BigInt(Math.round(Number(a) ** (1 / Number(q))));
    for (const c of [r - 1n, r, r + 1n]) if (c >= 0n && c ** q === a) return c;
    return null;
  }

  /** A rational to a rational power, exact when it can be: { coef, mono } (mono holds a rational atom otherwise). */
  function numPow(c, e) {
    if (Q.isInteger(e)) return { coef: Q.pow(c, e.n), mono: [] };
    if (Q.eq(c, Q.ONE)) return { coef: Q.ONE, mono: [] };
    if (Q.sign(c) < 0) throw new Unsupported(`a negative number (${Q.str(c)}) has no real power ${Q.str(e)}`);
    const n = root(c.n, e.d), d = root(c.d, e.d);
    if (n !== null && d !== null) return { coef: Q.pow(Q.q(n, d), e.n), mono: [] };
    return { coef: Q.ONE, mono: [[numAtom(c), e]] };
  }

  /** Is an atom a variable of the context (a field, a coordinate, a derivative, or anything that holds one)? */
  function isVarAtom(a, ctx) {
    if (a.t === "sym") return ctx.isVar(a.name);
    if (a.t === "d") return true;
    if (a.t === "fn") return hasVar(a.arg, ctx);
    if (a.t === "sum") return hasVar(a.base, ctx);
    return false;
  }
  const hasVar = (p, ctx) => [...p.values()].some((t) => t.mono.some(([a]) => isVarAtom(a, ctx)));

  /**
   * A sum as pivot × (1 + the other terms over the pivot). The pivot is the first term in key order that holds no
   * variable of the context, else the first term: (T_w + S θ) = T_w (1 + (S/T_w) θ).
   */
  function normalizeSum(p, ctx) {
    const terms = [...p.keys()].sort().map((k) => /** @type {any} */ (p.get(k)));
    const pivot = terms.find((t) => !t.mono.some(([a]) => isVarAtom(a, ctx))) ?? terms[0];
    return { pivot, rest: divideBy(p, pivot) };
  }
  /** Each term of p divided by one term { coef, mono }. */
  function divideBy(p, pivot) {
    const inv = pivot.mono.map(([a, e]) => [a, Q.neg(e)]);
    const rest = new Map();
    for (const t of p.values()) {
      const m = monoMul(t.mono, inv);
      addInto(rest, Q.mul(Q.div(t.coef, pivot.coef), m.coef), m.mono);
    }
    return rest;
  }

  /** p to a rational power. A sum expands for a positive integer power up to 8; otherwise it becomes one atom. */
  function pow(p, e, ctx = PLAIN) {
    const E_ = Q.of(e);
    if (Q.isZero(E_)) return one();
    if (p.size === 0) {
      if (Q.sign(E_) > 0) return zero();
      throw new Unsupported("a division by 0");
    }
    if (p.size === 1) {
      const t = /** @type {any} */ ([...p.values()][0]);
      const c = numPow(t.coef, E_);
      const m = monoMul(t.mono.map(([a, x]) => [a, Q.mul(x, E_)]), c.mono);
      return single(Q.mul(c.coef, m.coef), m.mono);
    }
    if (Q.isInteger(E_) && Q.sign(E_) > 0) {
      if (E_.n > BigInt(MAX_POWER)) throw new Unsupported(`a sum to the power ${Q.str(E_)} is beyond the expansion limit of ${MAX_POWER}`);
      let acc = one();
      for (let i = 0n; i < E_.n; i++) acc = mul(acc, p);
      return acc;
    }
    const { pivot, rest } = normalizeSum(p, ctx);
    return mul(pow(single(pivot.coef, pivot.mono), E_, ctx), atomPoly(sumAtom(rest), E_));
  }
  /** A sum as one term, pivot × its sum atom: the form that pow(p, -1) inverts, so p·p^-1 = 1 after any product. */
  function factor(p, ctx = PLAIN) {
    if (p.size < 2) return p;
    const { pivot, rest } = normalizeSum(p, ctx);
    return mul(single(pivot.coef, pivot.mono), atomPoly(sumAtom(rest)));
  }

  const FNS = new Set(["exp", "log", "log10", "sin", "cos", "tan", "sinh", "cosh", "tanh", "erf", "erfc", "abs"]);
  /** f(arg) with the values at 0 that need no approximation: exp(0) = 1, sin(0) = 0, log(1) = 0, ... */
  function fn(name, arg, ctx = PLAIN) {
    if (name === "sqrt") return pow(arg, Q.q(1, 2), ctx);
    if (!FNS.has(name)) throw new Unsupported(`the function ${name} is not in the supported set`);
    if (arg.size === 0) {
      const at0 = { exp: 1, cos: 1, cosh: 1, erfc: 1, sin: 0, tan: 0, sinh: 0, tanh: 0, erf: 0, abs: 0 }[name];
      if (at0 === undefined) throw new Unsupported(`${name}(0) is not defined`);
      return constant(at0);
    }
    const c = constantOf(arg);
    if (c && Q.eq(c, Q.ONE) && (name === "log" || name === "log10")) return zero();
    return atomPoly(fnAtom(name, arg));
  }

  /** The value of a constant expression, else null. */
  function constantOf(p) {
    if (p.size === 0) return Q.ZERO;
    if (p.size !== 1) return null;
    const t = /** @type {any} */ ([...p.values()][0]);
    return t.mono.length ? null : t.coef;
  }

  /* ---------- from a syntax tree (src/expr.js) ---------- */

  /**
   * The canonical form of a syntax tree without a relation. `ctx.isField(name)` marks the fields, so d(T, x) is a
   * derivative atom; a derivative of another expression is differentiated with the product and chain rules.
   */
  function fromAst(n, ctx = PLAIN) {
    switch (n.k) {
      case "num": return constant(n.v);
      case "sym": return symbol(n.name);
      case "neg": return neg(fromAst(n.a, ctx));
      case "add": return add(...n.terms.map((x) => fromAst(x, ctx)));
      case "mul": return mul(...n.num.map((x) => fromAst(x, ctx)), ...n.den.map((x) => pow(fromAst(x, ctx), Q.q(-1), ctx)));
      case "pow": {
        const e = constantOf(fromAst(n.e, ctx));
        if (!e) throw new Unsupported(`the exponent of ${E.show(n)} is not a number`);
        return pow(fromAst(n.b, ctx), e, ctx);
      }
      case "call": return fn(n.f, fromAst(n.a, ctx), ctx);
      case "d": {
        for (const v of n.vars) if (!ctx.isCoordinate(v)) throw new Unsupported(`${v} is not a coordinate, so d(${E.show(n.f)}, ${v}) is not a supported derivative`);
        if (n.f.k === "sym" && ctx.isField(n.f.name)) return n.vars.every((v) => ctx.depends(n.f.name, v)) ? derivative(n.f.name, n.vars) : zero();
        let p = fromAst(n.f, ctx);
        for (const v of n.vars) p = diff(p, v, ctx);
        return p;
      }
      default: throw new Unsupported("a relation inside an expression");
    }
  }

  /* ---------- differentiation ---------- */

  /** ∂p/∂x with the product and chain rules. */
  function diff(p, x, ctx = PLAIN) {
    const out = [];
    for (const t of p.values()) {
      t.mono.forEach(([a, e], i) => {
        const da = diffAtom(a, x, ctx);
        if (da.size === 0) return;
        const rest = t.mono.map((m, j) => (j === i ? [m[0], Q.sub(m[1], Q.ONE)] : m)).filter(([, ex]) => !Q.isZero(ex));
        out.push(mul(single(Q.mul(t.coef, e), rest), da));
      });
    }
    return add(...out);
  }
  function diffAtom(a, x, ctx) {
    if (a.t === "sym") {
      if (a.name === x) return one();
      return ctx.isField(a.name) && ctx.depends(a.name, x) ? derivative(a.name, [x]) : zero();
    }
    if (a.t === "d") return ctx.depends(a.f, x) ? derivative(a.f, [...a.vars, x]) : zero();
    if (a.t === "sum") return diff(a.base, x, ctx);
    if (a.t === "num") return zero();
    const du = diff(a.arg, x, ctx);
    if (du.size === 0) return zero();
    const f = (name) => fn(name, a.arg, ctx);
    const outer = { exp: () => f("exp"), log: () => pow(a.arg, Q.q(-1), ctx), sin: () => f("cos"), cos: () => neg(f("sin")), sinh: () => f("cosh"),
      cosh: () => f("sinh"), tanh: () => sub(one(), pow(f("tanh"), Q.q(2), ctx)) }[a.name];
    if (!outer) throw new Unsupported(`the derivative of ${a.name} is not in the supported set`);
    return mul(outer(), du);
  }

  /* ---------- substitution ---------- */

  /**
   * Replace names and derivatives: `map.sym(name)` and `map.d(field, vars)` return the replacement or null. Function
   * arguments and sums under a power are rebuilt, so the result is canonical again.
   */
  function subst(p, map, ctx = PLAIN) {
    const out = [];
    for (const t of p.values()) {
      let acc = constant(t.coef);
      for (const [a, e] of t.mono) acc = mul(acc, pow(substAtom(a, map, ctx), e, ctx));
      out.push(acc);
    }
    return add(...out);
  }
  function substAtom(a, map, ctx) {
    if (a.t === "sym") return map.sym?.(a.name) ?? atomPoly(a);
    if (a.t === "d") return map.d?.(a.f, a.vars) ?? atomPoly(a);
    if (a.t === "fn") return fn(a.name, subst(a.arg, map, ctx), ctx);
    if (a.t === "sum") return subst(a.base, map, ctx);
    return atomPoly(a);
  }

  /** Is a equal to b? Exact: equal canonical forms. */
  function equal(a, b) {
    if (a.size !== b.size) return false;
    for (const [k, t] of a) {
      const u = b.get(k);
      if (!u || !Q.eq(u.coef, t.coef)) return false;
    }
    return true;
  }
  /**
   * Is a equal to b once each sum under a negative integer power is multiplied out of a − b? Exact: a sum atom
   * spread across terms, a·(1 + c)^-1 + a·c·(1 + c)^-1, is a and not a different canonical form.
   */
  function equalCleared(a, b, ctx = PLAIN) {
    let d = sub(a, b);
    for (;;) {
      let atom = null, n = Q.ZERO;
      for (const t of d.values()) for (const [x, e] of t.mono) if (x.t === "sum" && Q.isInteger(e) && Q.sign(e) < 0 && (!atom || atom.key === x.key)) { atom = x; if (Q.sign(Q.add(e, n)) < 0) n = Q.neg(e); }
      if (!atom) return d.size === 0;
      d = subst(mul(d, atomPoly(atom, n)), {}, ctx);
    }
  }
  /** The terms in key order. */
  const terms = (p) => [...p.keys()].sort().map((k) => /** @type {any} */ (p.get(k)));
  /** Every name in an expression, also inside function arguments and sums. */
  function names(p, out = new Set()) {
    for (const t of p.values()) for (const [a] of t.mono) {
      if (a.t === "sym") out.add(a.name);
      else if (a.t === "d") out.add(a.f);
      else if (a.t === "fn") names(a.arg, out);
      else if (a.t === "sum") names(a.base, out);
    }
    return out;
  }

  /* ---------- output ---------- */

  const TEX_FN = { exp: "\\exp", log: "\\ln", log10: "\\operatorname{log_{10}}", sin: "\\sin", cos: "\\cos", tan: "\\tan", sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh",
    erf: "\\operatorname{erf}", erfc: "\\operatorname{erfc}" };
  const RANK = { sym: 0, num: 1, sum: 2, fn: 3, d: 4 };
  /** Atoms in reading order: names first, then sums, functions and derivatives. */
  const readingOrder = (mono, ctx) => mono.slice().sort((x, y) => (isVarAtom(x[0], ctx) ? 1 : 0) - (isVarAtom(y[0], ctx) ? 1 : 0) || RANK[x[0].t] - RANK[y[0].t]);

  /**
   * TeX of an expression. `opts.texOf(name)` gives a name's TeX; `opts.ctx` marks the variables, which follow the
   * coefficient; `opts.constantFirst` puts a constant term first, as in 1 + Sθ/T_w.
   */
  function tex(p, opts = {}) {
    const ts = terms(p);
    if (!ts.length) return "0";
    const texOf = opts.texOf ?? E.nameTex;
    const ctx = opts.ctx ?? PLAIN;
    const rank = (t) => (t.mono.length ? 0 : opts.constantFirst ? -1 : 1);
    const ordered = opts.order ? ts.slice().sort(opts.order) : ts.slice().sort((a, b) => rank(a) - rank(b));
    return ordered.map((t, i) => {
      const s = termTex(t.coef, t.mono, texOf, ctx);
      return i === 0 ? s : s.startsWith("-") ? s : `+${s}`;
    }).join("");
  }
  function atomTex(a, texOf, ctx) {
    if (a.t === "sym") return texOf(a.name);
    if (a.t === "num") return Q.tex(a.v);
    if (a.t === "sum") return `\\left(${tex(a.base, { texOf, ctx, constantFirst: true })}\\right)`;
    if (a.t === "fn") return a.name === "abs" ? `\\left|${tex(a.arg, { texOf, ctx })}\\right|` : `${TEX_FN[a.name]}\\left(${tex(a.arg, { texOf, ctx })}\\right)`;
    return E.tex({ k: "d", f: { k: "sym", name: a.f }, vars: a.vars }, texOf);
  }
  function factorTex(a, e, texOf, ctx) {
    const base = atomTex(a, texOf, ctx);
    if (Q.eq(e, Q.ONE)) return base;
    const wrap = a.t === "d" || a.t === "num" || a.t === "fn" ? `\\left(${base}\\right)` : base;
    return `${wrap}^{${Q.str(e)}}`;
  }
  /** A fraction of factor lists: \frac{top}{bottom}, or top alone. */
  const frac = (top, bottom) => (bottom.length ? `\\frac{${top.join("\\,") || "1"}}{${bottom.join("\\,")}}` : top.join("\\,"));
  /**
   * TeX of one term: the coefficient (the number and the parameters, as a fraction), then the variables, such as
   * -\frac{k}{L}\,\frac{\partial T}{\partial x}.
   */
  function termTex(coef, mono, texOf = E.nameTex, ctx = PLAIN) {
    const ctop = [], cbot = [], vtop = [], vbot = [];
    for (const [a, e] of readingOrder(mono, ctx)) {
      const v = isVarAtom(a, ctx);
      (Q.sign(e) > 0 ? (v ? vtop : ctop) : (v ? vbot : cbot)).push(factorTex(a, Q.abs(e), texOf, ctx));
    }
    const n = coef.n < 0n ? -coef.n : coef.n;
    if (n !== 1n || (!ctop.length && !cbot.length && !vtop.length && !vbot.length) || (cbot.length && !ctop.length) || (coef.d !== 1n && !ctop.length)) ctop.unshift(String(n));
    if (coef.d !== 1n) cbot.unshift(String(coef.d));
    if (!ctop.length && cbot.length) ctop.push("1");
    const c = frac(ctop, cbot);
    const v = vtop.length || vbot.length ? frac(vtop.length ? vtop : ["1"], vbot) : "";
    return `${coef.n < 0n ? "-" : ""}${[c, v].filter(Boolean).join("\\,")}`;
  }

  /** Plain text that the parser of src/expr.js reads back to the same canonical form. */
  function plain(p) {
    const ts = terms(p);
    if (!ts.length) return "0";
    return ts.map((t, i) => {
      const s = termPlain(t.coef, t.mono);
      return i === 0 ? s : s.startsWith("-") ? ` - ${s.slice(1)}` : ` + ${s}`;
    }).join("");
  }
  function atomPlain(a) {
    if (a.t === "sym") return a.name;
    if (a.t === "num") return `(${Q.str(a.v)})`;
    if (a.t === "sum") return `(${plain(a.base)})`;
    if (a.t === "fn") return `${a.name}(${plain(a.arg)})`;
    return `d(${a.f},${a.vars.join(",")})`;
  }
  function termPlain(coef, mono) {
    const parts = mono.map(([a, e]) => (Q.eq(e, Q.ONE) ? atomPlain(a) : `${atomPlain(a)}^(${Q.str(e)})`));
    const c = Q.abs(coef);
    const head = Q.eq(c, Q.ONE) && parts.length ? "" : c.d === 1n ? `${c.n}` : `(${Q.str(c)})`;
    return `${Q.sign(coef) < 0 ? "-" : ""}${[head, ...parts].filter(Boolean).join("*")}`;
  }

  /** The canonical form of plain text or the LaTeX subset (no relation): the parser of src/expr.js, then fromAst. */
  function read(text, ctx = PLAIN) {
    const r = E.read(text);
    if (r.error) throw new Unsupported(r.error);
    return fromAst(r.ast, ctx);
  }

  return { Unsupported, PLAIN, MAX_POWER, zero, one, constant, single, symbol, derivative, atomPoly, symAtom, add, sub, neg, scale, mul, pow, factor, fn,
    fromAst, diff, subst, equal, equalCleared, constantOf, terms, names, key, monoKey, monoMul, isVarAtom, hasVar, normalizeSum, tex, termTex, plain, read };
});
