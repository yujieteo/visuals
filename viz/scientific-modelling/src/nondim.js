/* Scientific Modelling: the Model Nondimensionalizer (spec sections 6 and 7). From a confirmed interpretation
 * (src/check.js) it finds candidate scales for each coordinate and field, with the mechanism or equation balance of
 * each, the competing scales and their ratio, and a refusal with an alternative when a scale can be 0. Then it
 * defines each dimensionless variable and its inverse, transforms every derivative, substitutes into every
 * equation and condition, removes the common factor of each, lists the remaining parameters, fields, coordinates,
 * geometry ratios and prescribed data, shows where each physical parameter enters, compares the groups with the
 * Pi basis of the Finder, and recovers each dimensional equation by the reverse substitution. All algebra is exact
 * (src/sym.js): every check compares canonical forms.
 *
 * Supported: equations that are sums of products of parameters, fields, derivatives and known functions of
 * dimensionless arguments, under affine scalings x = x0 + S x̂ of the coordinates and fields. Anything else is an
 * unsupported calculation with its reason.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./rational.js"), require("./linalg.js"), require("./units.js"), require("./expr.js"), require("./sym.js"), require("./finder.js"));
  } else (root.SM = root.SM || {}).N = factory(root.SM.Q, root.SM.LA, root.SM.U, root.SM.E, root.SM.S, root.SM.F);
})(typeof self !== "undefined" ? self : this, function (Q, LA, U, E, S, F) {
  "use strict";

  const MODEL_KINDS = ["governing", "constitutive", "closure", "source"];
  const SUPPLIED = 0, NATURAL = 1, BALANCE = 2;

  /**
   * Run the Nondimensionalizer on a confirmed interpretation. `opts.scales` are the record's supplied scales,
   * `opts.finder` the Finder's result on the same version, `opts.groups` the familiar groups of data/groups.json and
   * `opts.confirmed` the researcher's confirmed group names.
   */
  function nondimensionalize(interp, opts = {}) {
    const calc = interp.calcs.find((c) => c.id === "nondimensionalize");
    if (!calc || !calc.ready) return { ready: false, reason: "blocked", blockedBy: calc ? calc.blockedBy : [] };
    const modelEqs = interp.equations.filter((e) => e.ast && MODEL_KINDS.includes(e.kind));
    if (!modelEqs.length) {
      return { ready: false, reason: "no-equations", blockedBy: [], message: "The model has no governing equation, constitutive law, closure or source. Nondimensionalization needs the equations of the model.",
        next: "Add the governing equation in the editor, or use the Finder for a variable list." };
    }
    try {
      return run(interp, modelEqs, opts);
    } catch (e) {
      if (e instanceof S.Unsupported) {
        return { ready: false, reason: "unsupported", blockedBy: [], message: `The Nondimensionalizer cannot transform this model: ${e.message}.`,
          next: "Write each equation as a sum of products of parameters, fields, derivatives and known functions of dimensionless arguments." };
      }
      throw e;
    }
  }

  function run(interp, modelEqs, opts) {
    const catalogue = opts.groups ?? [];
    const confirmedNames = opts.confirmed ?? {};
    const vars = interp.variables.slice();
    const bySym = new Map(vars.map((v) => [v.symbol, v]));
    const isTimeVar = (v) => v.quantity === "time" || (v.dim && U.deq(v.dim, U.dim({ T: 1 })));
    const isTemp = (v) => Boolean(v.temperature) || (v.dim && U.deq(v.dim, U.dim({ Θ: 1 })));
    const isParam = (name) => ["parameter", "constant"].includes(bySym.get(name)?.kind ?? "");
    const fieldNames = new Set(vars.filter((v) => v.kind === "field").map((v) => v.symbol));
    const coordNames = new Set(vars.filter((v) => v.kind === "coordinate").map((v) => v.symbol));

    /* ---------- definitions: outputs, parameter definitions, relations ---------- */
    const outputs = [], paramDefs = [], relations = [];
    for (const e of interp.equations) {
      if (!e.ast || !["definition", "constraint"].includes(e.kind)) continue;
      const rel = e.ast;
      if (rel.k !== "rel" || rel.op !== "=" || rel.l.k !== "sym" || !bySym.has(rel.l.name)) { relations.push(e); continue; }
      const rhsVars = E.symbols(rel.r).some((s) => fieldNames.has(s) || coordNames.has(s)) || E.derivatives(rel.r).length > 0;
      if (rhsVars) outputs.push({ id: e.id, symbol: rel.l.name, eq: e });
      else if (isParam(rel.l.name) && e.kind === "definition") paramDefs.push({ id: e.id, symbol: rel.l.name, eq: e });
      else relations.push(e);
    }
    const outputSyms = new Set(outputs.map((o) => o.symbol));

    /* ---------- what to scale ---------- */
    const conds = interp.conditions.filter((c) => c.ast);
    const items = [...modelEqs, ...conds];
    const scaledFields = [...new Set(items.flatMap((e) => e.symbols.filter((s) => fieldNames.has(s) && !outputSyms.has(s))))];
    const scaledCoords = [...new Set([...items.flatMap((e) => e.symbols.filter((s) => coordNames.has(s))), ...conds.map((c) => c.atVar).filter((s) => s && coordNames.has(s)),
      ...outputs.flatMap((o) => o.eq.symbols.filter((s) => coordNames.has(s)))])];
    const scaled = [...scaledCoords.filter((x) => !isTimeVar(bySym.get(x))), ...scaledFields, ...scaledCoords.filter((x) => isTimeVar(bySym.get(x)))];

    /* ---------- dimensionless names ---------- */
    const taken = new Set(vars.map((v) => v.symbol));
    const supplied = new Map();
    for (const s of opts.scales ?? []) {
      const v = vars.find((x) => x.id === s.for);
      if (v && scaled.includes(v.symbol)) supplied.set(v.symbol, s);
    }
    const hat = new Map(), hatTex = new Map(), unhat = new Map();
    for (const name of scaled) {
      const v = /** @type {any} */ (bySym.get(name));
      const own = supplied.get(name)?.symbol;
      let h = own && /^[A-Za-z][A-Za-z0-9_]*$/.test(own) && !taken.has(own) ? own
        : v.kind === "coordinate" ? (isTimeVar(v) ? "tau" : /^[a-z]$/.test(name) ? name.toUpperCase() : `${name}_hat`) : isTemp(v) ? "theta" : `${name}_hat`;
      if (taken.has(h)) h = `${h}_${name}`;
      taken.add(h);
      hat.set(name, h);
      unhat.set(h, name);
      hatTex.set(h, h.endsWith("_hat") ? `\\hat{${v.tex}}` : E.nameTex(h));
    }
    const hatFields = new Set(scaledFields.map((f) => hat.get(f)));
    const hatCoords = new Set(scaledCoords.map((x) => hat.get(x)));
    // A defined field (DT = T − T_inf) is an output: a coefficient of the dimensionless form, not a variable.
    for (const o of outputSyms) fieldNames.delete(o);
    const ctx = {
      isField: (n) => fieldNames.has(n) || hatFields.has(n),
      isCoordinate: (n) => coordNames.has(n) || hatCoords.has(n),
      depends: () => true,
      isVar: (n) => fieldNames.has(n) || coordNames.has(n) || hatFields.has(n) || hatCoords.has(n),
    };

    /* ---------- texts ---------- */
    const synth = new Map();
    const texOfName = (n) => hatTex.get(n) ?? synth.get(n)?.tex ?? bySym.get(n)?.tex ?? E.nameTex(n);
    const texOf = (n) => { const t = texOfName(n); return /[-+]/.test(t) ? `\\left(${t}\\right)` : t; };
    const labelOf = (n) => F.uni(texOfName(n));
    const tex = (p) => S.tex(p, { texOf, ctx });
    const read = (ast) => S.fromAst(ast, ctx);

    /* ---------- offsets of the fields: the reference value in (f − p), else the prescribed value ---------- */
    const offsets = new Map();
    const prescribed = new Map();
    for (const f of scaledFields) {
      const counts = new Map();
      for (const e of [...items, ...outputs.map((o) => o.eq)]) {
        E.walk(e.ast, (n) => {
          if (n.k !== "add") return;
          const ts = n.terms.map((t) => (t.k === "neg" ? { s: -1, n: t.a } : { s: 1, n: t }));
          const mine = ts.find((t) => t.n.k === "sym" && t.n.name === f);
          if (!mine) return;
          for (const t of ts) if (t.n.k === "sym" && t.s === -mine.s && isParam(t.n.name)) counts.set(t.n.name, (counts.get(t.n.name) ?? 0) + 1);
        });
      }
      const values = [];
      for (const c of conds) {
        const r = c.ast;
        if (r.k !== "rel" || r.op !== "=") continue;
        const [a, b] = r.l.k === "sym" && r.l.name === f ? [r.l, r.r] : r.r.k === "sym" && r.r.name === f ? [r.r, r.l] : [null, null];
        if (a && b && b.k === "sym" && isParam(b.name)) values.push({ symbol: b.name, condition: c.id, kind: c.kind, at: c.at });
      }
      prescribed.set(f, values);
      const best = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
      const sup = supplied.get(f)?.offset;
      let off = null, why = "";
      if (sup && sup.trim()) {
        try { off = S.read(sup); why = "the offset you supplied"; } catch { off = null; }
      }
      if (!off && best) { off = S.symbol(best[0]); why = `${labelOf(best[0])} is the reference value in ${labelOf(f)} − ${labelOf(best[0])}`; }
      if (!off && values.length && values.every((x) => x.symbol === values[0].symbol)) { off = S.symbol(values[0].symbol); why = `each condition that prescribes a value of ${labelOf(f)} gives ${labelOf(values[0].symbol)}`; }
      if (!off) { off = S.zero(); why = "no reference value occurs, so the offset is 0"; }
      offsets.set(f, { poly: off, why });
    }

    /* ---------- the coordinates: their offsets and the domain from the condition locations ---------- */
    const locations = new Map();
    for (const x of scaledCoords) {
      const at = [];
      for (const c of conds) {
        if (c.atVar !== x) continue;
        const r = E.read(c.at);
        if (r.error || r.ast.k !== "rel") continue;
        try { const p = S.fromAst(r.ast.r); if (!at.some((a) => S.equal(a.poly, p))) at.push({ poly: p, condition: c.id }); } catch { /* a location outside the engine stays unused */ }
      }
      locations.set(x, at);
      const hasZero = at.some((a) => a.poly.size === 0);
      const sup = supplied.get(x)?.offset;
      let off = S.zero(), why = hasZero || !at.length ? (at.length ? `a condition holds at ${labelOf(x)} = 0` : "the offset is 0") : "";
      if (sup && sup.trim()) { try { off = S.read(sup); why = "the offset you supplied"; } catch { /* keep 0 */ } }
      else if (!hasZero && at.length >= 2) { off = at[0].poly; why = `the first condition holds at ${labelOf(x)} = ${S.plain(at[0].poly)}`; }
      offsets.set(x, { poly: off, why });
    }

    /* ---------- the normal form: monomial definitions expand, sum definitions eliminate one symbol ---------- */
    const expansions = new Map(), eliminations = new Map(), ruleOf = new Map();
    const offsetSyms = new Set([...offsets.values()].flatMap((o) => [...S.names(o.poly)]));
    const definedSyms = new Set(paramDefs.map((d) => d.symbol));
    const prescribedSyms = new Set([...prescribed.values()].flat().map((p) => p.symbol));
    for (const d of paramDefs) {
      let rhs;
      try { rhs = read(d.eq.ast.r); } catch { continue; }
      if (rhs.size === 1) { expansions.set(d.symbol, rhs); ruleOf.set(d.symbol, { kind: "expand", id: d.id, symbol: d.symbol, rhs }); continue; }
      const choices = S.terms(rhs).filter((t) => t.mono.length === 1 && t.mono[0][0].t === "sym" && Q.eq(t.mono[0][1], Q.ONE))
        .map((t) => ({ name: t.mono[0][0].name, coef: t.coef }))
        .filter((c) => isParam(c.name) && !offsetSyms.has(c.name) && !definedSyms.has(c.name) && !eliminations.has(c.name) && S.terms(rhs).filter((t) => S.names(S.single(Q.ONE, t.mono)).has(c.name)).length === 1);
      choices.sort((a, b) => Number(prescribedSyms.has(b.name)) - Number(prescribedSyms.has(a.name)));
      const pick = choices[0];
      if (!pick) continue;
      // S = c·E + rest  ->  E = (S − rest)/c
      const rest = S.sub(rhs, S.scale(S.symbol(pick.name), pick.coef));
      eliminations.set(pick.name, S.scale(S.sub(S.symbol(d.symbol), rest), Q.inv(pick.coef)));
      ruleOf.set(pick.name, { kind: "eliminate", id: d.id, symbol: d.symbol, eliminated: pick.name, rhs });
    }
    // A prescribed value with no declared difference gets one: Delta_T_i = T_i − T_inf.
    for (const f of scaledFields) {
      const off = offsets.get(f).poly;
      const offName = off.size === 1 ? [...S.names(off)][0] : null;
      for (const p of prescribed.get(f)) {
        if (eliminations.has(p.symbol) || p.symbol === offName || !offName) continue;
        let name = `Delta_${p.symbol}`;
        while (taken.has(name)) name += "_c";
        taken.add(name);
        const v = /** @type {any} */ (bySym.get(p.symbol));
        synth.set(name, { symbol: name, tex: `\\Delta ${v.tex}`, dim: v.dim, meaning: `${labelOf(p.symbol)} − ${labelOf(offName)}`, from: [p.symbol, offName] });
        eliminations.set(p.symbol, S.add(S.symbol(name), S.symbol(offName)));
        ruleOf.set(p.symbol, { kind: "eliminate", id: null, symbol: name, eliminated: p.symbol, rhs: S.sub(S.symbol(p.symbol), S.symbol(offName)), synthesized: true });
      }
    }
    function normal(p) {
      let cur = p;
      for (let i = 0; i < 8; i++) {
        const next = S.subst(cur, { sym: (n) => eliminations.get(n) ?? expansions.get(n) ?? null }, ctx);
        if (S.equal(next, cur)) return next;
        cur = next;
      }
      return cur;
    }

    /* ---------- values, signs and dimensions of the primitive names ---------- */
    const relationsDeclared = new Map();
    for (const a of interp.assumptions ?? []) {
      if (!a.relation) continue;
      const r = E.read(a.relation);
      if (r.error || r.ast.k !== "rel" || r.ast.r.k !== "num" || !Q.isZero(r.ast.r.v) || !["!=", ">", "<"].includes(r.ast.op)) continue;
      try { relationsDeclared.set(S.key(normal(read(r.ast.l))), a.id); } catch { /* not in the engine */ }
    }
    const dimOf = (name) => synth.get(name)?.dim ?? bySym.get(name)?.dim ?? (hat.has(name) || unhat.has(name) ? U.NONE : null);
    function exactValue(name) {
      const v = bySym.get(name);
      if (v?.value && v.value.exact && Q.eq(v.value.lo, v.value.hi)) return v.value.lo;
      const sy = synth.get(name);
      if (sy) { const a = exactValue(sy.from[0]), b = exactValue(sy.from[1]); return a && b ? Q.sub(a, b) : null; }
      const def = paramDefs.find((d) => d.symbol === name);
      if (def && !v?.value) { try { return evalExact(read(def.eq.ast.r)); } catch { return null; } }
      return null;
    }
    function evalExact(p) {
      let s = Q.ZERO;
      for (const t of p.values()) {
        let x = t.coef;
        for (const [a, e] of t.mono) {
          if (a.t !== "sym" || !Q.isInteger(e)) return null;
          const v = exactValue(a.name);
          if (!v || (Q.isZero(v) && Q.sign(e) < 0)) return null;
          x = Q.mul(x, Q.pow(v, e.n));
        }
        s = Q.add(s, x);
      }
      return s;
    }
    function dimOfMono(mono) {
      let d = U.NONE.slice();
      for (const [a, e] of mono) {
        if (a.t === "num") continue;
        if (a.t === "sum" && S.terms(a.base).every((t) => { const b = dimOfMono(t.mono); return b && U.isNone(b); })) continue;
        if (a.t !== "sym") return null;
        const x = dimOf(a.name);
        if (!x) return null;
        d = U.dadd(d, U.dscale(x, e));
      }
      return d;
    }
    /** Is a name known to be nonzero? "nonzero", "zero" or "unknown", with the reason. */
    function nameSign(name) {
      const v = bySym.get(name);
      const val = v?.value && v.value.exact ? v.value : null;
      if (val) {
        if (Q.isZero(val.lo) && Q.isZero(val.hi)) return { s: "zero", why: `${labelOf(name)} = 0` };
        if (Q.sign(val.lo) <= 0 && Q.sign(val.hi) >= 0) return { s: "unknown", why: `the range of ${labelOf(name)} includes 0` };
        return { s: "nonzero", why: "" };
      }
      const x = exactValue(name);
      if (x) {
        if (!Q.isZero(x)) return { s: "nonzero", why: "" };
        const from = synth.get(name)?.from ?? [...S.names(read(/** @type {any} */ (paramDefs.find((d) => d.symbol === name)).eq.ast.r))];
        return { s: "zero", why: `the values of ${from.map(labelOf).join(" and ")} give ${labelOf(name)} = 0` };
      }
      if (relationsDeclared.has(S.key(S.symbol(name)))) return { s: "nonzero", why: "" };
      const sy = synth.get(name);
      if (sy && relationsDeclared.has(S.key(normal(S.sub(S.symbol(sy.from[0]), S.symbol(sy.from[1])))))) return { s: "nonzero", why: "" };
      if (v && ["positive", "negative", "nonzero"].includes(v.domain)) return { s: "nonzero", why: "" };
      return { s: "unknown", why: `the domain of ${labelOf(name)} (${v?.domain ?? "real"}) allows 0` };
    }
    /** A scale must not be 0: "nonzero", "zero" or "unknown", with the reason. */
    function scaleSign(p) {
      if (p.size === 0) return { s: "zero", why: "the scale is 0" };
      const c = S.constantOf(p);
      if (c) return { s: "nonzero", why: "" };
      if (p.size > 1) {
        const x = evalExact(p);
        if (x) return Q.isZero(x) ? { s: "zero", why: `the values make ${S.plain(p)} = 0` } : { s: "nonzero", why: "" };
        if (relationsDeclared.has(S.key(p))) return { s: "nonzero", why: "" };
      }
      // A sum is its pivot times (1 + the rest): each factor must be nonzero.
      const t = S.terms(S.factor(p, ctx))[0];
      let worst = { s: "nonzero", why: "" };
      for (const [a] of t.mono) {
        if (a.t === "num") continue;
        let s;
        if (a.t === "sym") s = nameSign(a.name);
        else if (a.t === "sum") {
          const x = evalExact(a.base);
          s = !x ? { s: "unknown", why: `the model does not declare ${S.plain(p)} nonzero` } : Q.isZero(x) ? { s: "zero", why: `the values make ${S.plain(p)} = 0` } : { s: "nonzero", why: "" };
        } else return { s: "unknown", why: "the scale holds a function or a field" };
        if (s.s === "zero") return s;
        if (s.s === "unknown") worst = s;
      }
      return worst;
    }

    /** Monomial helpers on exponent maps (name -> rational). */
    const monoOf = (p) => { const t = S.terms(p)[0]; return { coef: t.coef, mono: t.mono }; };
    const expMap = (mono) => new Map(mono.filter(([a]) => a.t === "sym").map(([a, e]) => [a.name, e]));

    /* ---------- compact display of monomials: definitions where they shorten the text ---------- */
    const piSyms = new Set(vars.filter((v) => v.pi).map((v) => v.symbol));
    const expandList = [...expansions.entries()].map(([sym, poly]) => ({ sym, m: expMap(monoOf(poly).mono), coef: monoOf(poly).coef }));
    /** Rewrite an exponent map with the defined names, preferring Pi variables: k/(ρ c_p) -> α. */
    function compact(map0, preferPi = true) {
      let map = new Map(map0);
      const nnz = (m) => [...m.values()].filter((e) => !Q.isZero(e)).length;
      for (let round = 0; round < 4; round++) {
        let best = null;
        for (const d of expandList) {
          if (preferPi && !piSyms.has(d.sym) && !items.some((e) => e.symbols.includes(d.sym))) continue;
          if (!Q.eq(d.coef, Q.ONE)) continue;
          for (const [s, ms] of d.m) {
            const k = Q.div(map.get(s) ?? Q.ZERO, ms);
            if (Q.isZero(k)) continue;
            const next = new Map(map);
            for (const [s2, m2] of d.m) next.set(s2, Q.sub(next.get(s2) ?? Q.ZERO, Q.mul(k, m2)));
            next.set(d.sym, Q.add(next.get(d.sym) ?? Q.ZERO, k));
            if (nnz(next) < nnz(map) && (!best || nnz(next) < nnz(best))) best = next;
          }
        }
        if (!best) break;
        map = best;
      }
      for (const [k, e] of [...map]) if (Q.isZero(e)) map.delete(k);
      return map;
    }
    const allVars = [...vars, ...[...synth.values()].map((s) => ({ id: `syn-${s.symbol}`, symbol: s.symbol, tex: s.tex, meaning: s.meaning, kind: "parameter", quantity: "", phase: "", role: "", dim: s.dim, value: null })),
      ...[...hat.entries()].map(([orig, h]) => ({ id: `hat-${h}`, symbol: h, tex: /** @type {string} */ (hatTex.get(h)), meaning: `dimensionless ${bySym.get(orig)?.meaning ?? orig}`, kind: bySym.get(orig)?.kind, quantity: "", phase: "", role: "", dim: U.NONE, value: null }))];
    /** TeX and label of a monomial (coefficient and names), with the Finder's layout. */
    function monoDisplay(coef, map) {
      const exps = allVars.map((v) => map.get(v.symbol) ?? Q.ZERO);
      const m = F.monomial(allVars.map((v) => ({ ...v, tex: /** @type {string} */ (v.tex) })), exps);
      const one = Q.eq(Q.abs(coef), Q.ONE);
      const c = one ? "" : Q.tex(Q.abs(coef));
      const sign = Q.sign(coef) < 0 ? "-" : "";
      const texs = m.tex === "1" ? (c || "1") : c ? `${c}\\,${m.tex}` : m.tex;
      return { tex: `${sign}${texs}`, label: `${sign ? "−" : ""}${one ? "" : `${Q.str(Q.abs(coef))}·`}${m.label}`, exps };
    }
    /** Display of any expression whose coefficients are monomials: each term's coefficient compacted, or named
     * by `nameOf(exponents)` when that returns the TeX of a familiar group. */
    function show(p, nameOf = null) {
      const ts = S.terms(p);
      if (!ts.length) return "0";
      const ordered = ts.slice().sort((a, b) => (a.mono.length ? 0 : 1) - (b.mono.length ? 0 : 1));
      return ordered.map((t, i) => {
        const { vmono } = splitTerm(t);
        const cmono = t.mono.filter(([a]) => !S.isVarAtom(a, ctx));
        const nonSym = cmono.filter(([a]) => a.t !== "sym");
        let head = nonSym.length ? S.termTex(t.coef, cmono, texOf, ctx) : monoDisplay(t.coef, compact(expMap(cmono))).tex;
        if (nameOf && !nonSym.length && cmono.length) {
          const named = nameOf(monoDisplay(Q.ONE, compact(expMap(cmono))).exps);
          if (named) head = `${Q.sign(t.coef) < 0 ? "-" : ""}${Q.eq(Q.abs(t.coef), Q.ONE) ? "" : `${Q.tex(Q.abs(t.coef))}\\,`}${named}`;
        }
        const vt = vmono.length ? S.termTex(Q.ONE, vmono, texOf, ctx) : "";
        if (vt && topLevelSum(head)) head = head.startsWith("-") ? `-\\left(${head.slice(1)}\\right)` : `\\left(${head}\\right)`;
        let s = vt ? (head === "1" ? vt : head === "-1" ? `-${vt}` : `${head}\\,${vt}`) : head;
        if (i > 0 && !s.startsWith("-")) s = `+${s}`;
        return s;
      }).join("");
    }

    /* ---------- the transformation, with unknown scales where a scale is still open ---------- */
    const unknown = (n) => `__scale_${n}`;
    /** Forward substitution: v = offset + scale·v̂, ∂f/∂x = (S_f/S_x) ∂f̂/∂x̂. */
    function forwardMap(choice) {
      const sc = (n) => (choice.has(n) ? S.factor(choice.get(n), ctx) : S.symbol(unknown(n)));
      return {
        sym: (n) => (hat.has(n) ? S.add(offsets.get(n).poly, S.mul(sc(n), S.symbol(/** @type {string} */ (hat.get(n))))) : null),
        d: (f, xs) => {
          if (!hat.has(f) || xs.some((x) => !hat.has(x))) throw new S.Unsupported(`the derivative of ${f} in ${xs.join(", ")} has no scale`);
          return S.mul(sc(f), ...xs.map((x) => S.pow(sc(x), Q.q(-1), ctx)), S.derivative(/** @type {string} */ (hat.get(f)), xs.map((x) => /** @type {string} */ (hat.get(x)))));
        },
      };
    }
    /** Reverse substitution: v̂ = (v − offset)/scale, ∂f̂/∂x̂ = (S_x/S_f) ∂f/∂x. */
    function inverseMap(choice) {
      const sc = (n) => S.factor(choice.get(n), ctx);
      return {
        sym: (n) => {
          const v = unhat.get(n);
          return v ? S.mul(S.sub(S.symbol(v), offsets.get(v).poly), S.pow(sc(v), Q.q(-1), ctx)) : null;
        },
        d: (h, xs) => {
          const f = unhat.get(h);
          if (!f) return null;
          const orig = xs.map((x) => /** @type {string} */ (unhat.get(x)));
          return S.mul(...orig.map(sc), S.pow(sc(f), Q.q(-1), ctx), S.derivative(f, orig));
        },
      };
    }

    /** The variable part and the coefficient of a term: atoms that hold a variable, and the rest. */
    const splitTerm = (t) => ({ coef: S.single(t.coef, t.mono.filter(([a]) => !S.isVarAtom(a, ctx))), vmono: t.mono.filter(([a]) => S.isVarAtom(a, ctx)) });
    function groupsOf(p) {
      const by = new Map();
      for (const t of S.terms(p)) {
        const { coef, vmono } = splitTerm(t);
        const k = S.monoKey(vmono);
        const g = by.get(k);
        if (g) g.coef = S.add(g.coef, coef);
        else by.set(k, { key: k, vmono, coef });
      }
      return [...by.values()].filter((g) => g.coef.size);
    }
    /** Derivative orders of a variable part: { time, space, field }. */
    function orders(vmono) {
      let time = 0, space = 0, field = false, fn = false;
      for (const [a, e] of vmono) {
        if (a.t === "d") {
          field = true;
          for (const x of a.vars) { const orig = bySym.get(unhat.get(x) ?? x); if (orig && isTimeVar(orig)) time++; else space++; }
        } else if (a.t === "sym" && (hatFields.has(a.name) || fieldNames.has(a.name))) field = true;
        else if (a.t !== "sym") fn = true;
        void e;
      }
      return { time, space, field, fn };
    }
    /** The physical mechanism of a term, from its derivatives and coefficient. */
    function mechanism(vmono, coef, isCondition, temperature) {
      const o = orders(vmono);
      const has = (q) => [...S.names(coef)].some((n) => bySym.get(n)?.quantity === q);
      if (o.fn) return "the nonlinear term";
      if (o.time) return temperature ? "heat storage" : "the rate of change";
      if (o.space >= 2) return temperature ? "conduction" : "diffusion";
      if (o.space === 1) return has("speed") ? "advection" : isCondition ? (temperature ? "the conduction flux" : "the gradient flux") : "the first-derivative term";
      if (o.field) return has("heat-transfer-coefficient") ? (isCondition ? "surface convection" : "convection to the surroundings") : isCondition ? "the boundary value" : "the term proportional to the field";
      return isCondition ? "the prescribed value" : temperature ? "the heat source" : "the source";
    }


    /** Balance candidates for one variable, with the other chosen scales in place. */
    function balances(target, choice) {
      const out = [];
      const sources = [...modelEqs.map((e) => ({ item: e, cond: false })), ...conds.map((c) => ({ item: c, cond: true }))];
      const fmap = forwardMap(choice);
      const temperature = scaledFields.some((f) => isTemp(/** @type {any} */ (bySym.get(f))));
      for (const { item, cond } of sources) {
        let D;
        try { D = normal(S.subst(S.sub(read(item.ast.l), read(item.ast.r)), fmap, ctx)); } catch { continue; }
        const terms = S.terms(D).map((t) => ({ t, ...splitTerm(t) }));
        for (let i = 0; i < terms.length; i++) for (let j = i + 1; j < terms.length; j++) {
          const a = monoOf(terms[i].coef), b = monoOf(terms[j].coef);
          const ratio = S.monoMul(a.mono, b.mono.map(([x, e]) => [x, Q.neg(e)])).mono;
          const unk = ratio.filter(([x]) => x.t === "sym" && x.name.startsWith("__scale_"));
          if (unk.length !== 1 || unk[0][0].name !== unknown(target)) continue;
          const e = unk[0][1];
          const rest = ratio.filter(([x]) => !(x.t === "sym" && x.name.startsWith("__scale_")));
          const known = ([x]) => x.t === "sym" || (x.t === "sum" && ![...S.names(x.base)].some((n) => n.startsWith("__scale_")));
          if (rest.some((x) => x[0].t !== "num" && !known(x))) continue;
          const scale = normal(S.pow(S.single(Q.ONE, rest.filter(known)), Q.div(Q.q(-1), e), ctx));
          const oi = orders(terms[i].vmono), oj = orders(terms[j].vmono);
          // A prescribed value against the field's value is the prescribed difference, not a balance.
          if (cond && !oi.space && !oj.space && !oi.time && !oj.time) continue;
          const mi = mechanism(terms[i].vmono, terms[i].coef, cond, temperature), mj = mechanism(terms[j].vmono, terms[j].coef, cond, temperature);
          out.push({ poly: scale, source: BALANCE, rank: (cond ? 1 : 0) * 100 - (oi.space + oj.space + oi.time + oj.time),
            reason: `In ${item.id}, ${mi} and ${mj} have the same size.`, mechanism: `${mi} and ${mj}`, items: [item.id] });
        }
      }
      return out;
    }

    /** Candidate scales of one variable, in priority order, without duplicates. */
    function candidates(name, choice) {
      const v = /** @type {any} */ (bySym.get(name));
      const out = [];
      const sup = supplied.get(name);
      if (sup) {
        let poly = null, error = "";
        try { poly = normal(S.read(sup.scale ?? "")); } catch (e) { error = `the supplied scale "${sup.scale}" cannot be read: ${e instanceof Error ? e.message : String(e)}`; }
        out.push({ poly, source: SUPPLIED, rank: -1000, reason: sup.reason ? `You supplied this scale: ${sup.reason}` : "You supplied this scale in the model's scales.", mechanism: "your choice", items: [sup.id], supplied: sup.id, error });
      }
      if (v.kind === "coordinate" && !isTimeVar(v)) {
        const off = offsets.get(name).poly;
        for (const a of locations.get(name) ?? []) {
          const d = normal(S.sub(a.poly, off));
          if (d.size === 0) continue;
          out.push({ poly: d, source: NATURAL, rank: -100, reason: `The length of the domain: the conditions hold at ${labelOf(name)} = ${S.plain(off) === "0" ? "0" : labelOf(S.plain(off))} and ${labelOf(name)} = ${labelP(a.poly)}.`, mechanism: "the length of the domain", items: [a.condition] });
        }
        for (const id of interp.geometry?.lengths ?? []) {
          const g = vars.find((x) => x.id === id);
          if (g && g.dim && v.dim && U.deq(g.dim, v.dim)) out.push({ poly: normal(S.symbol(g.symbol)), source: NATURAL, rank: -90, reason: `A length of the declared geometry: ${g.meaning || g.symbol}.`, mechanism: "a length of the geometry", items: [g.id] });
        }
      }
      if (v.kind === "field") {
        const off = offsets.get(name).poly;
        for (const p of prescribed.get(name)) {
          const d = normal(S.sub(S.symbol(p.symbol), off));
          if (d.size === 0) continue;
          const initial = p.kind === "initial";
          out.push({ poly: d, source: NATURAL, rank: initial ? -100 : -95,
            reason: initial ? `The initial difference from ${p.condition}: ${labelOf(name)} = ${labelOf(p.symbol)} at ${p.at}.` : `The prescribed difference from ${p.condition}: ${labelOf(name)} = ${labelOf(p.symbol)} at ${p.at}.`,
            mechanism: initial ? "the initial difference" : "the prescribed boundary difference", items: [p.condition] });
        }
      }
      out.push(...balances(name, choice));
      const merged = [];
      for (const c of out) {
        const same = c.poly && merged.find((m) => m.poly && S.equal(m.poly, c.poly));
        if (same) { same.also.push(c.reason); same.items = [...new Set([...same.items, ...c.items])]; continue; }
        merged.push({ ...c, also: [] });
      }
      merged.sort((a, b) => a.rank - b.rank);
      return merged.map((c, i) => {
        const sign = c.poly ? scaleSign(c.poly) : { s: "unknown", why: c.error };
        const termDims = c.poly ? S.terms(c.poly).map((t) => ({ t, d: dimOfMono(t.mono) })) : [];
        const wrong = termDims.find((x) => !x.d || !v.dim || !U.deq(x.d, v.dim));
        const dim = termDims.length && !wrong ? termDims[0].d : wrong?.d ?? null;
        const dimOk = Boolean(termDims.length && !wrong);
        const dimWhy = wrong ? `${termDims.length > 1 ? `its term ${labelP(S.single(wrong.t.coef, wrong.t.mono))} has` : "it has"} the dimension ${wrong.d ? U.text(wrong.d) : "?"}, not that of ${labelOf(name)}` : "";
        const val = c.poly ? evalExact(c.poly) : null;
        return { ...c, n: i + 1, sign: sign.s, signWhy: sign.why, dimOk, dim: dim ? U.text(dim) : null, value: val ? C_num(val) : null, dimWhy, valid: Boolean(c.poly) && sign.s === "nonzero" && dimOk };
      });
    }
    const hatLabel = (name) => labelOf(/** @type {string} */ (hat.get(name)));
    /** Readable text of an expression: a monomial with the Finder's layout, else its plain text with labels. */
    function labelP(p) {
      if (p.size === 1) {
        const t = monoOf(p);
        if (t.mono.every(([a]) => a.t === "sym")) return monoDisplay(t.coef, compact(expMap(t.mono))).label;
      }
      return F.plainLabel(S.plain(p), allVars);
    }

    /* ---------- choose the scales: supplied first, then the natural scales, then the balances ---------- */
    const choice = new Map();
    const chosenFrom = new Map();
    const sequence = [];
    for (let round = 0; round < 4; round++) {
      let changed = false;
      for (const name of scaled) {
        if (choice.has(name)) continue;
        const list = candidates(name, choice).filter((c) => round > 0 || c.source !== BALANCE);
        const pick = list.find((c) => c.valid);
        if (pick) { choice.set(name, /** @type {any} */ (pick.poly)); chosenFrom.set(name, pick); sequence.push(name); changed = true; }
      }
      if (!changed && round > 0) break;
    }
    // The final lists: each variable's candidates with the scales chosen before it in place, so a balance never
    // returns a scale through another scale that was derived from it.
    const scales = scaled.map((name) => {
      const v = /** @type {any} */ (bySym.get(name));
      const k = sequence.indexOf(name);
      const others = new Map(sequence.slice(0, k < 0 ? sequence.length : k).map((n) => [n, choice.get(n)]));
      const list = candidates(name, others);
      const chosen = choice.has(name) ? list.find((c) => c.poly && S.equal(c.poly, /** @type {any} */ (choice.get(name)))) ?? chosenFrom.get(name) : null;
      const first = list[0];
      const refused = list.filter((c) => !c.valid);
      const changedFrom = chosen && first && first !== chosen && !first.valid ? first : null;
      return { name, v, list, chosen, refused, changedFrom };
    });
    const missing = scales.filter((s) => !s.chosen);
    if (missing.length) {
      return { ready: false, reason: "no-scale", blockedBy: [],
        message: `No nonzero scale is available for ${missing.map((s) => labelOf(s.name)).join(", ")}. ${missing.map((s) => s.refused.map((c) => `${labelP(c.poly ?? S.zero())} is refused: ${c.signWhy || c.dimWhy}.`).join(" ")).join(" ")}`.trim(),
        next: "Supply a nonzero scale in the model's scales, or declare a domain that excludes 0 for the variables of a candidate scale." };
    }

    /* ---------- dimensionless variables, inverses and derivative transformations ---------- */
    const varRows = scales.map((s) => {
      const h = /** @type {string} */ (hat.get(s.name));
      const off = offsets.get(s.name).poly;
      const scale = /** @type {any} */ (choice.get(s.name));
      const sc = S.factor(scale, ctx);
      const forward = S.mul(S.sub(S.symbol(s.name), off), S.pow(sc, Q.q(-1), ctx));
      const inverse = S.add(off, S.mul(sc, S.symbol(h)));
      // The inverse in the forward definition gives v̂ again, and the forward one in the inverse gives v.
      const back = S.subst(forward, { sym: (n) => (n === s.name ? inverse : null) }, ctx);
      const there = S.subst(inverse, { sym: (n) => (n === h ? forward : null) }, ctx);
      const ok = S.equal(back, S.symbol(h)) && S.equal(there, S.symbol(s.name));
      const scaleShow = show(scale);
      const fwdMono = off.size === 0 ? normal(forward) : null;
      return { name: s.name, id: s.v.id, hat: h, hatTex: hatTex.get(h), kind: s.v.kind, time: isTimeVar(s.v), meaning: s.v.meaning,
        scaleTex: scaleShow, scalePlain: S.plain(scale), offsetTex: off.size ? show(off) : "0", offsetPlain: S.plain(off), offsetWhy: offsets.get(s.name).why,
        defTex: `${hatTex.get(h)}=${off.size ? (scale.size === 1 && /\\frac/.test(scaleShow) ? `${show(normal(S.pow(scale, Q.q(-1), ctx)))}\\,\\left(${texOf(s.name)}-${show(off)}\\right)` : `\\frac{${texOf(s.name)}-${show(off)}}{${scaleShow}}`) : monoDisplay(monoOf(/** @type {any} */ (fwdMono)).coef, compact(expMap(monoOf(/** @type {any} */ (fwdMono)).mono))).tex}`,
        invTex: `${texOf(s.name)}=${off.size ? `${show(off)}+${wrapSum(scaleShow)}\\,${hatTex.get(h)}` : `${wrapSum(scaleShow)}\\,${hatTex.get(h)}`}`,
        inverseOk: ok };
    });
    function wrapSum(t) { return /^[^+-]*$/.test(t.replace(/^-/, "")) ? t : `\\left(${t}\\right)`; }

    const fmap = forwardMap(choice), imap = inverseMap(choice);
    const derivAtoms = new Map();
    for (const e of [...items, ...outputs.map((o) => o.eq)]) {
      for (const d of E.derivatives(e.ast)) {
        if (!d.field || !hat.has(d.field)) continue;
        const xs = Object.entries(d.order).flatMap(([x, k]) => Array(k).fill(x));
        const k = `${d.field}|${xs.slice().sort().join(",")}`;
        if (!derivAtoms.has(k)) derivAtoms.set(k, { f: d.field, xs });
      }
    }
    const derivRows = [...derivAtoms.values()].map(({ f, xs }) => {
      const lhs = S.derivative(f, xs);
      const rhs = normal(S.subst(lhs, fmap, ctx));
      const factorLabel = (p) => { const l = labelP(p); return /[ /+−-]/.test(l) ? `(${l})` : l; };
      const maps = [...new Set(xs)].map((x) => `${labelOf(x)} = ${offsets.get(x).poly.size ? `${labelP(offsets.get(x).poly)} + ` : ""}${factorLabel(/** @type {any} */ (choice.get(x)))}${hatLabel(x)}`);
      return { tex: `${tex(lhs)}=${show(rhs)}`, plain: `${S.plain(lhs)} = ${S.plain(rhs)}`, field: f, vars: xs, reason: `Chain rule for the affine map${maps.length > 1 ? "s" : ""} ${maps.join(" and ")}. The derivative takes the scale of ${labelOf(f)} and divides by ${[...new Set(xs)].map((x) => { const k = xs.filter((y) => y === x).length; return `the scale of ${labelOf(x)}${k === 2 ? " twice" : k > 2 ? ` ${k} times` : ""}`; }).join(" and ")}. The offset of ${labelOf(f)} does not appear.` };
    });

    /** TeX of an equation with each field, coordinate and derivative replaced by its transformation, before any
     * cancellation: the hand calculation's substitution step. */
    const subTex = new Map();
    for (const r of varRows) {
      const off = offsets.get(r.name).poly;
      subTex.set(r.name, off.size ? `\\left(${show(off)}+${wrapSum(r.scaleTex)}\\,${r.hatTex}\\right)` : `${wrapSum(r.scaleTex)}\\,${r.hatTex}`);
    }
    function texSub(n) {
      const t = texSub;
      const P = { add: 1, neg: 2, mul: 3, pow: 4 };
      // A transformed derivative is a product, so it takes parentheses only inside another product.
      const prec = (x) => (x.k === "d" && x.f.k === "sym" && hat.has(x.f.name) ? 2.5 : P[x.k] ?? 5);
      const wrap = (x, p) => (prec(x) < p ? `\\left(${t(x)}\\right)` : t(x));
      switch (n.k) {
        case "sym": return subTex.get(n.name) ?? texOf(n.name);
        case "num": return n.src ?? Q.str(n.v);
        case "neg": return `-${wrap(n.a, 3)}`;
        case "add": return n.terms.map((x, j) => (x.k === "neg" ? `-${wrap(x.a, 3)}` : j ? `+${wrap(x, 2)}` : wrap(x, 2))).join("");
        case "mul": {
          const top = n.num.map((x) => wrap(x, 3)).join("\\,");
          return n.den.length ? `\\frac{${top}}{${n.den.map((x) => wrap(x, 3)).join("\\,")}}` : top;
        }
        case "pow": return `${n.b.k === "sym" && !subTex.has(n.b.name) ? t(n.b) : `\\left(${t(n.b)}\\right)`}^{${t(n.e)}}`;
        case "call": return `${E.tex({ k: "call", f: n.f, a: { k: "sym", name: "@" } }).replace(/@/, () => t(n.a))}`;
        case "d": {
          if (n.f.k !== "sym" || !hat.has(n.f.name) || n.vars.some((x) => !hat.has(x))) return E.tex(n, texOf);
          return show(normal(S.subst(S.derivative(n.f.name, n.vars), fmap, ctx)));
        }
        case "rel": return `${t(n.l)} ${{ "=": "=", "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge", "!=": "\\ne" }[n.op]} ${t(n.r)}`;
        default: return E.tex(n, texOf);
      }
    }

    /* ---------- every equation and condition ---------- */
    const transformed = [];
    const all = [...modelEqs.map((e) => ({ item: e, cond: false })), ...outputs.map((o) => ({ item: o.eq, cond: false, output: o.symbol })), ...conds.map((c) => ({ item: c, cond: true }))];
    for (const { item, cond, output } of all) {
      const raw = { l: S.subst(read(item.ast.l), fmap, ctx), r: S.subst(read(item.ast.r), fmap, ctx) };
      const Lp = normal(raw.l), Rp = normal(raw.r);
      const D = S.sub(Lp, Rp);
      const lkeys = new Set(Lp.keys());
      let left = S.zero(), right = S.zero();
      for (const t of S.terms(D)) {
        const one = S.single(t.coef, t.mono);
        if (lkeys.has(S.monoKey(t.mono))) left = S.add(left, one); else right = S.sub(right, one);
      }
      const groups = groupsOf(D);
      const usable = groups.filter((g) => !(output && S.names(g.coef).has(output)));
      const score = (g) => { const o = orders(g.vmono); return (o.field ? 1000 : 0) + o.space * 10 + o.time; };
      const ref = usable.slice().sort((a, b) => score(b) - score(a))[0] ?? groups[0];
      const refTerm = ref ? monoOf(ref.coef) : { coef: Q.ONE, mono: [] };
      const factor = S.single(Q.abs(refTerm.coef), refTerm.mono);
      const inv = S.pow(factor, Q.q(-1), ctx);
      const dl = normal(S.mul(left, inv)), dr = normal(S.mul(right, inv));
      // Every coefficient, also inside function arguments, must be dimensionless.
      const coefMonos = [];
      const collect = (p) => {
        for (const t of S.terms(p)) {
          const cm = t.mono.filter(([a]) => !S.isVarAtom(a, ctx));
          coefMonos.push({ coef: t.coef, mono: cm });
          for (const [a] of t.mono) if (S.isVarAtom(a, ctx)) { if (a.t === "fn") collect(a.arg); else if (a.t === "sum") collect(a.base); }
        }
      };
      collect(dl); collect(dr);
      const dimless = coefMonos.every((c) => { const d = dimOfMono(c.mono); return d && U.isNone(d); });
      // The reverse substitution: multiply by the factor, put back the dimensional variables, compare exactly.
      const back = normal(S.subst(S.mul(S.sub(dl, dr), factor), imap, ctx));
      const orig = normal(S.sub(read(item.ast.l), read(item.ast.r)));
      const reverseOk = S.equalCleared(back, orig, ctx);
      let at = null;
      // A condition's location, or the "at x = 0" of a definition such as the base heat flow.
      const atText = cond ? item.at : /^\s*at\s+/i.test(item.domainText ?? "") ? item.domainText.replace(/^\s*at\s+/i, "") : null;
      const atParsed = atText ? E.read(atText) : null;
      const atVar = cond ? item.atVar : atParsed && !atParsed.error && atParsed.ast.k === "rel" && atParsed.ast.l.k === "sym" ? atParsed.ast.l.name : null;
      if (atText && atVar && hat.has(atVar)) {
        const r = E.read(atText);
        const locPoly = !r.error && r.ast.k === "rel" ? S.fromAst(r.ast.r) : null;
        if (locPoly) {
          const x = /** @type {string} */ (atVar);
          const sx = S.factor(/** @type {any} */ (choice.get(x)), ctx);
          const hx = normal(S.mul(S.sub(locPoly, offsets.get(x).poly), S.pow(sx, Q.q(-1), ctx)));
          const backLoc = normal(S.add(offsets.get(x).poly, S.mul(sx, hx)));
          at = { tex: `${hatTex.get(/** @type {string} */ (hat.get(x)))}=${show(hx)}`, plain: S.plain(hx), poly: hx, ok: S.equal(backLoc, normal(locPoly)) };
        }
      }
      transformed.push({
        id: item.id, kind: item.kind, cond, output: output ?? null,
        originalTex: item.tex, at, domainTex: item.domainText && !at ? domainTex(item.domainText) : null, domainText: item.domainText ?? "",
        substitutedTex: texSub(item.ast), simplifiedTex: `${show(raw.l)}=${show(raw.r)}`,
        factorTex: show(factor), factor, reference: ref ? mechanism(ref.vmono, ref.coef, cond, isTempModel()) : "",
        dimensionlessTex: `${show(dl)}=${show(dr)}`, dimensionlessPlain: `${S.plain(dl)} = ${S.plain(dr)}`, left: dl, right: dr,
        dimensionless: dimless, reverseOk, coefMonos,
      });
    }
    function isTempModel() { return scaledFields.some((f) => isTemp(/** @type {any} */ (bySym.get(f)))); }
    /** The where-it-holds text in dimensionless variables: "0 < x < L, t > 0" -> 0 < X < 1, τ > 0. */
    function domainTex(text) {
      const parts = String(text).replace(/^\s*at\s+/i, "").split(",").map((s) => s.trim()).filter(Boolean);
      const out = [];
      for (const part of parts) {
        const ops = part.split(/(<=|>=|!=|=|<|>|≤|≥)/).map((s) => s.trim());
        const operands = ops.filter((_, i) => i % 2 === 0), rels = ops.filter((_, i) => i % 2 === 1);
        const asts = operands.map((o) => E.read(o));
        const coord = asts.find((r) => !r.error && r.ast.k === "sym" && hat.has(r.ast.name));
        if (!coord || asts.some((r) => r.error)) return null;
        const x = coord.ast.name;
        const texs = asts.map((r) => {
          if (r.ast.k === "sym" && r.ast.name === x) return /** @type {string} */ (hatTex.get(/** @type {string} */ (hat.get(x))));
          const p = normal(S.mul(S.sub(S.fromAst(r.ast), offsets.get(x).poly), S.pow(S.factor(/** @type {any} */ (choice.get(x)), ctx), Q.q(-1), ctx)));
          return show(p);
        });
        const relTex = { "<": "<", ">": ">", "<=": "\\le", ">=": "\\ge", "≤": "\\le", "≥": "\\ge", "=": "=", "!=": "\\ne" };
        out.push(texs.map((t, i) => (i ? `${relTex[rels[i - 1]]}${t}` : t)).join(""));
      }
      return out.join(",\\quad ");
    }

    /* ---------- parameters, outputs, geometry ratios and prescribed data ---------- */
    const groupsFound = [];
    const addGroup = (coef, mono, role, where) => {
      const map = expMap(mono);
      if (!map.size) return;
      const v = allVars.map((x) => map.get(x.symbol) ?? Q.ZERO);
      const found = groupsFound.find((g) => {
        // The same parameter: a rational multiple of the exponent vector (Bi and Bi² are one parameter).
        const nz = v.findIndex((x) => !Q.isZero(x));
        if (nz < 0 || Q.isZero(g.vec[nz])) return false;
        const k = Q.div(g.vec[nz], v[nz]);
        return v.every((x, i) => Q.eq(Q.mul(x, k), g.vec[i]));
      });
      if (found) { if (!found.where.includes(where)) found.where.push(where); return; }
      groupsFound.push({ vec: v, map, role, where: [where] });
    };
    for (const t of transformed) {
      for (const c of t.coefMonos) {
        if (!c.mono.length) continue;
        const names = new Set(c.mono.filter(([a]) => a.t === "sym").map(([a]) => a.name));
        const role = t.output && names.has(t.output) ? "output" : "parameter";
        addGroup(c.coef, c.mono, role, t.id);
      }
      if (t.at && t.at.poly.size) for (const tt of S.terms(t.at.poly)) if (tt.mono.length) addGroup(tt.coef, tt.mono, "geometry", t.id);
    }
    const geometryQuantities = new Set(["length", "area", "perimeter", "volume"]);
    const parameters = groupsFound.map((g, i) => {
      const map = compact(g.map);
      const disp = monoDisplay(Q.ONE, map);
      const isGeo = [...map.keys()].every((n) => geometryQuantities.has(bySym.get(n)?.quantity ?? "") || (bySym.get(n)?.dim && /^L/.test(U.text(/** @type {any} */ (bySym.get(n)).dim)) && U.text(/** @type {any} */ (bySym.get(n)).dim).split(" ").length === 1));
      const role = g.role === "output" ? "output" : g.role === "geometry" || isGeo ? "geometry" : "parameter";
      const names = F.recognize(allVars, disp.exps, catalogue);
      const key = F.groupKey(allVars, disp.exps);
      const value = F.value(allVars.map((v) => {
        if (v.value) return v;
        const x = exactValue(v.symbol);
        return { ...v, value: x ? { lo: x, hi: x, exact: true, text: C_num(x) } : null };
      }), disp.exps);
      return { id: `p${i + 1}`, role, tex: disp.tex, label: disp.label, plain: [...map.entries()].map(([n, e]) => (Q.eq(e, Q.ONE) ? n : `${n}^(${Q.str(e)})`)).join("*"),
        map, vec: allVars.map((v) => map.get(v.symbol) ?? Q.ZERO), names, key, confirmed: confirmedNames[key] ?? null, where: g.where, value,
        contains: [...map.keys()].map((n) => allVars.find((v) => v.symbol === n)?.id).filter(Boolean) };
    });
    // Independence: the exponent vectors of the parameters (outputs and geometry ratios apart).
    const params = parameters.filter((p) => p.role !== "output");
    const indep = [];
    for (const p of params) {
      const vecs = indep.map((x) => x.vec);
      const combo = vecs.length ? LA.express(vecs, p.vec) : null;
      if (combo) { p.dependent = indep.map((x, k) => [combo[k], x]).filter(([c]) => !Q.isZero(c)).map(([c, x]) => `${x.label}${Q.eq(c, Q.ONE) ? "" : `^${Q.str(c)}`}`).join("·"); }
      else indep.push(p);
    }
    // The dimensionless model with familiar names in place of their formulas: -θ_X = Bi θ. A name is a proposed
    // interpretation until the researcher confirms it; the formula stays beside it.
    const nameOf = (exps) => {
      const p = parameters.find((x) => x.role !== "output" && x.names.length && x.vec.every((e, i) => Q.eq(e, exps[i])));
      if (!p) return null;
      const nm = (p.confirmed && p.names.find((n) => n.id === p.confirmed)) || p.names[0];
      return /^\\frac|[+-]/.test(nm.tex) ? null : nm.tex;
    };
    for (const t of transformed) t.namedTex = `${show(t.left, nameOf)}=${show(t.right, nameOf)}`;
    const prescribedData = [];
    for (const t of transformed) {
      for (const side of [t.left, t.right]) for (const tt of S.terms(side)) {
        if (tt.mono.some(([a]) => S.isVarAtom(a, ctx) || (t.output && a.t === "sym" && a.name === t.output))) continue;
        prescribedData.push({ id: t.id, cond: t.cond, kind: t.kind, tex: show(S.single(tt.coef, tt.mono)), at: t.at ? t.at.tex : null });
      }
    }
    const fields = varRows.filter((r) => r.kind === "field").map((r) => ({ hat: r.hat, tex: r.hatTex, of: scaled.filter((x) => scaledCoords.includes(x)).map((x) => hatTex.get(/** @type {string} */ (hat.get(x)))), defTex: r.defTex }));
    const coords = varRows.filter((r) => r.kind === "coordinate").map((r) => ({ hat: r.hat, tex: r.hatTex, defTex: r.defTex }));

    /* ---------- the Pi basis of the Finder ---------- */
    const finder = opts.finder && opts.finder.ready ? opts.finder : null;
    let pi = null;
    if (finder) {
      const piVars = finder.vars.map((v) => v.symbol);
      const fam = finder.familiar ? finder.familiar.groups : finder.groups;
      const famVecs = fam.map((g) => finder.vars.map((v) => Q.parse(g.exps[v.id] ?? "0") ?? Q.ZERO));
      const famLabel = (g) => { const nm = (g.confirmed && g.names.find((x) => x.id === g.confirmed)) || g.names[0]; return nm ? nm.label : g.label; };
      const famTex = (g) => { const nm = (g.confirmed && g.names.find((x) => x.id === g.confirmed)) || g.names[0]; return nm ? nm.tex : g.tex; };
      const quantities = [];
      // The dimensionless variables: (v − offset)/scale as a monomial of declared variables.
      for (const r of varRows) {
        const off = offsets.get(r.name).poly;
        let base = null;
        if (off.size === 0) base = S.symbol(r.name);
        else {
          const target = normal(S.sub(S.symbol(r.name), off));
          const o = outputs.find((x) => { try { return S.equal(normal(read(x.eq.ast.r)), target); } catch { return false; } });
          if (o) base = S.symbol(o.symbol);
        }
        const sc = /** @type {any} */ (choice.get(r.name));
        if (!base) { quantities.push({ what: r.kind === "field" ? "field" : "coordinate", tex: r.hatTex, label: labelOf(r.hat), outside: [labelOf(r.name)], note: `The Pi set has no variable for ${labelOf(r.name)} − ${labelP((off))}. To compare ${labelOf(r.hat)} with a Pi group, add a variable for ${labelOf(r.name)} − ${labelP((off))}, with its definition, to the Pi set.` }); continue; }
        const m = S.mul(base, S.pow(sc, Q.q(-1), ctx));
        quantities.push({ what: r.kind === "field" ? "field" : "coordinate", tex: r.hatTex, label: labelOf(r.hat), map: compact(expMap(monoOf(m).mono)) });
      }
      for (const p of parameters) quantities.push({ what: p.role, tex: p.tex, label: p.label, map: p.map });
      const rows = quantities.map((q) => {
        if (!q.map) return { ...q, inPi: false };
        const outside = [...q.map.keys()].filter((n) => !piSyms.has(n) || !piVars.includes(n));
        if (outside.length) return { what: q.what, tex: q.tex, label: q.label, inPi: false, outside: outside.map(labelOf), note: `The Pi set does not contain ${outside.map(labelOf).join(", ")}. ${outside.length > 1 ? "These variables add" : "This variable adds"} a group that the Pi basis does not have.` };
        const vec = finder.vars.map((v) => q.map.get(v.symbol) ?? Q.ZERO);
        const c = famVecs.length ? LA.express(famVecs, vec) : null;
        const combo = c ? fam.map((g, k) => [c[k], g]).filter(([x]) => !Q.isZero(x)) : null;
        return { what: q.what, tex: q.tex, label: q.label, inPi: Boolean(c), vec,
          comboTex: combo ? combo.map(([x, g]) => (Q.eq(x, Q.ONE) ? famTex(g) : `\\left(${famTex(g)}\\right)^{${Q.str(x)}}`)).join("\\,") || "1" : null,
          comboLabel: combo ? combo.map(([x, g]) => (Q.eq(x, Q.ONE) ? famLabel(g) : `(${famLabel(g)})^${Q.str(x)}`)).join("·") || "1" : null };
      });
      const span = rows.filter((r) => r.inPi).map((r) => r.vec);
      const absent = fam.filter((g, k) => !span.length || !LA.express(span, famVecs[k])).map((g) => ({ tex: famTex(g), label: famLabel(g), contains: g.contains }));
      const rankModel = span.length ? LA.rank(LA.transpose(span)) : 0;
      // Why a Pi group is absent: a variable of it does not occur in the equations, or occurs only in combinations.
      const used = new Set([...items, ...outputs.map((o) => o.eq)].flatMap((e) => e.symbols));
      for (const c of conds) { const r = E.read(c.at ?? ""); if (!r.error) for (const x of E.symbols(r.ast)) used.add(x); }
      // A defined parameter (L_c = V/A_s) is in the model when its definition's names are.
      for (const d of paramDefs) if (d.eq.symbols.some((x) => x !== d.symbol && used.has(x))) used.add(d.symbol);
      for (const g of absent) {
        const missing = g.contains.map((id) => vars.find((v) => v.id === id)).filter((v) => v && !used.has(v.symbol));
        const qoi = missing.find((v) => v.id === interp.observable);
        g.why = qoi ? `${g.label} contains the quantity of interest ${labelOf(qoi.symbol)}. The model does not define ${labelOf(qoi.symbol)}, so this group cannot appear.`
          : missing.length ? `The equations and conditions do not contain ${missing.map((v) => labelOf(v.symbol)).join(", ")}, so ${g.label} cannot appear.`
          : `The equations contain the variables of ${g.label} only in the combinations above.`;
      }
      const absentWhy = absent.length ? "The Pi basis is complete for the supplied variables. The declared model needs fewer groups." : "";
      pi = { m: finder.m, rank: rankModel, rows, absent: absent.map(({ tex: t, label, why }) => ({ tex: t, label, why })), absentWhy, basis: finder.familiar ? "familiar" : "direct" };
    }

    /* ---------- where each physical parameter enters ---------- */
    // The parameters of the model: in its equations and definitions, the condition locations and where each equation holds.
    const located = [...conds.map((c) => c.at ?? ""), ...items.map((e) => e.domainText ?? "")].flatMap((t) => String(t).replace(/^\s*at\s+/i, "").split(/,|<=|>=|!=|=|<|>|≤|≥/))
      .flatMap((t) => { const r = E.read(t.trim()); return r.error ? [] : E.symbols(r.ast); });
    const physical = [...new Set([...[...items, ...outputs.map((o) => o.eq), ...paramDefs.map((d) => d.eq)].flatMap((e) => e.symbols), ...located].filter((s) => isParam(s) && !outputSyms.has(s)))];
    const placeNames = (p) => new Set([...S.names(p)]);
    const places = [];
    for (const r of varRows) {
      const sc = /** @type {any} */ (choice.get(r.name));
      places.push({ where: `the scale of ${labelOf(r.name)}`, names: new Set([...placeNames(sc), ...compact(expMap(sc.size === 1 ? monoOf(sc).mono : [])).keys()]) });
      if (r.offsetPlain !== "0") places.push({ where: `the offset of ${labelOf(r.name)}`, names: placeNames(offsets.get(r.name).poly) });
    }
    for (const p of parameters) places.push({ where: p.role === "output" ? `the output ${p.label}` : p.role === "geometry" ? `the geometry ratio ${p.label}` : `the parameter ${p.label}`, names: new Set([...p.map.keys(), ...groupsFound[parameters.indexOf(p)].map.keys()]) });
    const enters = physical.map((name) => {
      const where = places.filter((pl) => pl.names.has(name)).map((pl) => pl.where);
      for (const rule of ruleOf.values()) {
        if (rule.kind !== "eliminate" || rule.symbol === name || !S.names(rule.rhs).has(name)) continue;
        const viaPlaces = places.filter((pl) => pl.names.has(rule.symbol)).map((pl) => pl.where);
        where.push(...viaPlaces.map((w) => `${w}, as part of ${labelOf(rule.symbol)}${rule.id ? ` (definition ${rule.id})` : ` = ${labelP(rule.rhs)}`}`));
      }
      if (expansions.has(name) && !where.length) {
        const inner = [...S.names(/** @type {any} */ (expansions.get(name)))];
        const via = places.filter((pl) => inner.some((n) => pl.names.has(n))).map((pl) => pl.where);
        where.push(...via.map((w) => `${w}, through its definition`));
      }
      const onlyScales = where.length > 0 && where.every((w) => /^the (scale|offset)/.test(w));
      return { name, label: labelOf(name), id: bySym.get(name)?.id, where: [...new Set(where)], hidden: !where.length, onlyScales };
    });

    /* ---------- checks, steps and the summary ---------- */
    const checks = [];
    const check = (id, title, passed, detail) => checks.push({ id, title, status: "exact", passed, detail });
    check("x-nd-dims", "Each scale has the dimension of its variable", scales.every((s) => s.chosen.dimOk), scales.map((s) => `${labelOf(s.name)}: ${s.chosen.dim ?? "?"}`).join(", ") + ".");
    check("x-nd-nonzero", "No chosen scale can be 0", scales.every((s) => s.chosen.sign === "nonzero"), scales.map((s) => `${labelOf(s.name)}: ${labelP((/** @type {any} */ (choice.get(s.name))))}`).join(", ") + ".");
    check("x-nd-inverse", "Each dimensionless variable and its inverse compose to the identity", varRows.every((r) => r.inverseOk), "The inverse in the forward definition gives the dimensionless variable. The forward definition in the inverse gives the variable.");
    check("x-nd-coefficients", "Every coefficient of the dimensionless model is dimensionless", transformed.every((t) => t.dimensionless), "The exponents of each base dimension sum to 0 in every coefficient, also inside function arguments.");
    const defIds = [...new Set([...ruleOf.values()].map((r) => r.id).filter(Boolean))];
    const okCount = transformed.filter((t) => t.reverseOk).length;
    check("x-nd-reverse", "The reverse substitution recovers every equation and condition", transformed.every((t) => t.reverseOk && (!t.at || t.at.ok)), `${okCount === transformed.length ? `The original form of all ${transformed.length} equations and conditions comes back exactly` : `The original form of ${okCount} of the ${transformed.length} equations and conditions comes back exactly`}${defIds.length ? `, under the definition${defIds.length > 1 ? "s" : ""} ${defIds.join(", ")}` : ""}.`);
    check("x-nd-hidden", "Every physical parameter enters a scale, an offset, a coefficient or a condition", enters.every((e) => !e.hidden), enters.filter((e) => e.hidden).map((e) => `${e.label} does not enter the dimensionless model.`).join(" ") || `All ${enters.length} parameters enter a scale, an offset, a coefficient or a condition.`);
    if (pi) check("x-nd-pi", "Each dimensionless quantity that uses only Pi variables is a product of powers of the Pi groups", pi.rows.filter((r) => !r.outside && r.vec).every((r) => r.inPi), `${pi.rows.filter((r) => r.inPi).length} quantities are products of powers of the ${pi.basis} basis.`);

    const steps = [
      { id: "s-nd-scales", item: 6, title: "Scales", reason: "Each scale comes from your entry, the domain or the geometry, a prescribed value, or a balance of two terms. A scale must not be 0. A scale must not hide a parameter.", evidence: ["spec-6"] },
      { id: "s-nd-variables", item: 6, title: "Dimensionless variables and their inverses", reason: "Each variable becomes offset + scale × dimensionless variable. Each map is the inverse of the other.", evidence: ["spec-6", "spec-7"] },
      { id: "s-nd-derivatives", item: 6, title: "Derivative transformations", reason: "For an affine map, a derivative takes the scale of the field and divides by the scale of its coordinate once for each order. The offset of the field does not appear.", evidence: ["spec-7"] },
      { id: "s-nd-substitution", item: 7, title: "Substitution and common factors", reason: "The tool substitutes into every equation and condition. Then it divides each one by the coefficient of the term with the highest derivative of a field.", evidence: ["spec-6", "spec-7"] },
      { id: "s-nd-parameters", item: 7, title: "Parameters, fields, coordinates and data", reason: "The remaining coefficients give the parameters and the output groups. The tool keeps them apart from the dimensionless fields and coordinates.", evidence: ["spec-6"] },
      { id: "s-nd-reverse", item: 7, title: "Reverse substitution", reason: "The tool multiplies by the common factor and substitutes the dimensional variables back. The result must equal the original equation exactly.", evidence: ["spec-6"] },
    ];
    if (pi) steps.splice(5, 0, { id: "s-nd-pi", item: 7, title: "Comparison with the Pi basis", reason: "Each dimensionless quantity that uses only Pi variables is a product of powers of the Finder's groups. The step names each group that the model does not use, with the reason.", evidence: ["spec-6", "mit-pi"] });

    return {
      ready: true,
      scales: scales.map((s) => ({
        name: s.name, id: s.v.id, label: labelOf(s.name), tex: texOfName(s.name), kind: s.v.kind, time: isTimeVar(s.v), hat: hat.get(s.name), hatTex: hatTex.get(/** @type {string} */ (hat.get(s.name))),
        offsetTex: varRows.find((r) => r.name === s.name)?.offsetTex, offsetWhy: offsets.get(s.name).why, offsetPlain: S.plain(offsets.get(s.name).poly),
        chosen: plainCandidate(s.chosen, s), status: s.chosen.source === SUPPLIED ? "confirmed" : "proposed",
        candidates: s.list.map((c) => ({ ...plainCandidate(c, s), chosen: c === s.chosen || Boolean(c.poly && s.chosen.poly && S.equal(c.poly, s.chosen.poly)),
          ratio: c.poly && c.valid && c !== s.chosen ? ratioOf(/** @type {any} */ (s.chosen.poly), c.poly) : null })),
        changed: s.changedFrom ? `${labelOf(/** @type {string} */ (hat.get(s.name)))} cannot use ${labelP((s.changedFrom.poly ?? S.zero()))} as its scale: ${s.changedFrom.signWhy || s.changedFrom.dimWhy}. It uses ${labelP((/** @type {any} */ (s.chosen.poly)))} instead (${s.chosen.mechanism}). ${labelOf(/** @type {string} */ (hat.get(s.name)))} now measures ${offsets.get(s.name).poly.size ? `${labelOf(s.name)} − ${labelP((offsets.get(s.name).poly))}` : labelOf(s.name)} in units of ${labelP((/** @type {any} */ (s.chosen.poly)))}, not ${labelP((s.changedFrom.poly ?? S.zero()))}.` : null,
      })),
      variables: varRows.map(({ name, id, hat: h, hatTex: ht, kind, time, defTex, invTex, inverseOk, scaleTex, scalePlain, offsetTex, offsetPlain }) => ({ name, id, hat: h, hatTex: ht, kind, time, defTex, invTex, inverseOk, scaleTex, scalePlain, offsetTex, offsetPlain })),
      derivatives: derivRows.map(({ tex: t, plain, reason }) => ({ tex: t, plain, reason })),
      equations: transformed.map((t) => ({ id: t.id, kind: t.kind, cond: t.cond, output: t.output, originalTex: t.originalTex, at: t.at ? { tex: t.at.tex, plain: t.at.plain, ok: t.at.ok } : null, domainTex: t.domainTex, domainText: t.domainText,
        substitutedTex: t.substitutedTex, simplifiedTex: t.simplifiedTex, factorTex: t.factorTex, factorPlain: S.plain(t.factor), reference: t.reference, dimensionlessTex: t.dimensionlessTex, namedTex: t.namedTex, dimensionlessPlain: t.dimensionlessPlain, dimensionless: t.dimensionless, reverseOk: t.reverseOk,
        inputs: [t.id, ...(interp.equations.concat(interp.conditions).find((x) => x.id === t.id)?.symbols ?? []).map((s) => bySym.get(s)?.id).filter(Boolean)] })),
      parameters: parameters.map(({ map, vec, ...p }) => ({ ...p, names: p.names.map((n) => ({ id: n.id, tex: n.tex, label: n.label, name: n.name, plain: n.plain, power: n.power, source: n.source, reference: n.reference, assumes: n.assumes })),
        value: p.value ?? null, dependent: p.dependent ?? null, independent: !p.dependent && p.role !== "output" })),
      independent: indep.filter((p) => p.role === "parameter").length,
      fields, coordinates: coords, prescribed: prescribedData,
      definitions: [...ruleOf.values()].map((r) => ({ id: r.id, kind: r.kind, symbol: r.symbol, eliminated: r.eliminated ?? null, tex: `${texOfName(r.symbol)}=${S.tex(r.rhs, { texOf })}`, synthesized: Boolean(r.synthesized) })),
      relations: relations.map((e) => ({ id: e.id, tex: e.tex, kind: e.kind })),
      pi: pi ? { ...pi, rows: pi.rows.map(({ vec, ...r }) => r) } : null,
      enters, checks, steps,
      synthesized: [...synth.values()].map((s) => ({ symbol: s.symbol, tex: s.tex, meaning: s.meaning })),
      inputs: [...new Set([...items.flatMap((e) => [e.id, ...e.symbols.map((s) => bySym.get(s)?.id).filter(Boolean)]), ...outputs.map((o) => o.id), ...paramDefs.map((d) => d.id), ...scaled.map((n) => `s-${bySym.get(n)?.id}`)])],
    };

    /** A candidate as plain data. */
    function plainCandidate(c, s) {
      return { n: c.n, symbols: c.poly ? [...S.names(c.poly)] : [], tex: c.poly ? show(c.poly) : null, label: c.poly ? labelP((c.poly)) : null, plain: c.poly ? S.plain(c.poly) : null, source: ["supplied", "natural", "balance"][c.source],
        reason: c.reason, also: c.also, mechanism: c.mechanism, items: c.items, sign: c.sign, signWhy: c.signWhy, dim: c.dim, dimOk: c.dimOk, dimWhy: c.dimWhy, value: c.value, valid: c.valid, supplied: c.supplied ?? null, error: c.error || null,
        record: c.poly ? { for: s.v.id, scale: S.plain(c.poly), offset: S.plain(offsets.get(s.name).poly), symbol: hat.get(s.name), reason: c.reason } : null };
    }
    /** The ratio chosen/alternative as a monomial, with its familiar name. */
    function ratioOf(a, b) {
      const r = normal(S.mul(a, S.pow(b, Q.q(-1), ctx)));
      if (r.size !== 1) return { tex: show(r), label: labelP((r)), names: [] };
      const t = monoOf(r);
      const map = compact(expMap(t.mono));
      const disp = monoDisplay(t.coef, map);
      // The ratio, or a power of it, may be a familiar group: L·√(hP/(kA_c)) = λ = (λ²)^(1/2).
      for (const k of [1, 2, -1, -2]) {
        const names = F.recognize(allVars, disp.exps.map((e) => Q.mul(e, Q.q(k))), catalogue);
        if (names.length) {
          const power = Q.q(1, k);
          return { tex: disp.tex, label: disp.label, names: names.map((n) => ({ id: n.id, tex: k === 1 ? n.tex : `\\left(${n.tex}\\right)^{${Q.str(power)}}`, label: k === 1 ? n.label : `(${n.label})^${Q.str(power)}`, name: k === 1 ? n.name.split(",")[0] : `the ${n.name.split(",")[0]}, to the power ${Q.str(power)}`, power: Q.str(power) })) };
        }
      }
      return { tex: disp.tex, label: disp.label, names: [] };
    }
  }

  /** Short decimal text of an exact value. */
  function C_num(v) {
    const x = Q.toNumber(v);
    if (Q.isInteger(v) && Q.abs(v).n < 1000000000n) return Q.str(v);
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e7) return String(Number(x.toPrecision(6)));
    const [m, e] = x.toExponential(5).split("e");
    return `${Number(m)}×10^${Number(e)}`;
  }
  /** Does TeX hold a + or − outside braces and \\left( \\right) pairs, after its first character? */
  function topLevelSum(t) {
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === "{" || t.startsWith("\\left", i)) depth++;
      else if (c === "}" || t.startsWith("\\right", i)) depth--;
      else if ((c === "+" || c === "-") && depth === 0 && i > 0) return true;
    }
    return false;
  }

  return { nondimensionalize, MODEL_KINDS };
});
