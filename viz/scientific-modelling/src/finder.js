/* Scientific Modelling: the Dimensionless Number Finder (spec section 4). From the variables of the Pi set it
 * builds the dimension matrix D, row-reduces it exactly with every step recorded, takes the rank r and a kernel
 * basis, selects r repeating variables with independent columns (or checks the researcher's set), solves the
 * exponent equations, and returns n − r groups with their dimensional cancellation, the rank check of the
 * basis, familiar names from stored formulas, the transformation to an equivalent familiar basis, the effect of
 * constraints between inputs, and what a correlation still needs. All arithmetic is exact (src/rational.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./linalg.js"), require("./units.js"), require("./expr.js"));
  else (root.SM = root.SM || {}).F = factory(root.SM.Q, root.SM.LA, root.SM.U, root.SM.E);
})(typeof self !== "undefined" ? self : this, function (Q, LA, U, E) {
  "use strict";

  const LETTERS = "abcdefghjkmnpqrsuvwxyz";

  const GREEK = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ",
    pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω", infty: "∞" };
  const SUPER = { "-": "⁻", "/": "ᐟ", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  /** Readable Unicode text of a variable's TeX: \rho -> ρ, c_{p} -> c_p, \dot{Q} -> Q̇, T-T_\infty -> T − T_∞. */
  function uni(tex) {
    return String(tex)
      .replace(/\\dot\{([^}]*)\}/g, "$1\u0307").replace(/\\mathrm\{([^}]*)\}/g, "$1").replace(/\\([A-Za-z]+)/g, (m, w) => GREEK[w] ?? w)
      .replace(/_\{([^}]*)\}/g, "_$1").replace(/\^\{([^}]*)\}/g, (m, e) => [...e].map((c) => SUPER[c] ?? c).join("")).replace(/[{}]/g, "").replace(/\\,|\s+/g, "")
      .replace(/-/g, " − ").replace(/\+/g, " + ");
  }
  const supText = (e) => [...Q.str(e)].map((c) => SUPER[c] ?? c).join("");
  /** Readable text of plain equation text: nu = mu/rho -> ν = μ/ρ, with each symbol as its variable's label. */
  const plainLabel = (plain, vars) => String(plain).replace(/[A-Za-z][A-Za-z0-9_]*/g, (w) => { const v = vars.find((x) => x.symbol === w); return v ? uni(v.tex) : w; })
    .replace(/\*/g, "").replace(/ - /g, " − ");

  /** TeX of an exponent: 2, -1, 1/2 (as a slash, which reads better in a superscript). */
  const expTex = (e) => (Q.isInteger(e) ? Q.str(e) : `${Q.str(e)}`);
  /** Plain exponent text for the monomial: ^2, ^(-1/2). */
  const expPlain = (e) => (Q.isInteger(e) && Q.sign(e) > 0 ? `^${Q.str(e)}` : `^(${Q.str(e)})`);

  /**
   * TeX and plain text of a monomial ∏ q_j^{a_j}: the positive powers over the negative powers.
   * @param {{ tex: string, symbol: string }[]} vars @param {any[]} exps rationals, one per variable
   */
  function monomial(vars, exps, first = -1) {
    const top = [], bottom = [], ptop = [], pbottom = [], utop = [], ubottom = [];
    const order = exps.map((_, j) => j);
    if (first >= 0) order.sort((a, b) => (a === first ? -1 : b === first ? 1 : a - b));
    order.forEach((j) => {
      const e = exps[j];
      if (Q.isZero(e)) return;
      const a = Q.abs(e);
      const sum = /[-+]/.test(vars[j].tex);
      const others = exps.filter((x, k) => k !== j && !Q.isZero(x) && Q.sign(x) === Q.sign(e)).length;
      const wrapped = sum || (!Q.eq(a, Q.ONE) && (/[_^]/.test(vars[j].tex) || (vars[j].tex.length > 1 && !vars[j].tex.startsWith("\\")))) ? `\\left(${vars[j].tex}\\right)` : vars[j].tex;
      const t = Q.eq(a, Q.ONE) ? (sum && others ? wrapped : vars[j].tex) : `${wrapped}^{${expTex(a)}}`;
      const p = Q.eq(a, Q.ONE) ? vars[j].symbol : `${vars[j].symbol}${expPlain(a)}`;
      let u = uni(vars[j].tex);
      if (/ /.test(u)) u = `(${u})`;
      if (!Q.eq(a, Q.ONE)) u += supText(a);
      (Q.sign(e) > 0 ? top : bottom).push(t);
      (Q.sign(e) > 0 ? ptop : pbottom).push(p);
      (Q.sign(e) > 0 ? utop : ubottom).push(u);
    });
    const tex = !bottom.length ? (top.join("\\,") || "1") : `\\frac{${top.join("\\,") || "1"}}{${bottom.join("\\,")}}`;
    const plain = !pbottom.length ? (ptop.join("*") || "1") : `${ptop.join("*") || "1"}/${pbottom.length > 1 ? `(${pbottom.join("*")})` : pbottom[0]}`;
    // A factor with a subscript is followed by a middle dot, so c_p·ρ does not read as c with subscript pρ.
    const join = (list) => list.map((u, i) => (i < list.length - 1 && /_[^)]*$/.test(u) ? `${u}·` : u)).join("");
    const label = !ubottom.length ? (join(utop) || "1") : `${join(utop) || "1"}/${ubottom.length > 1 ? `(${join(ubottom)})` : ubottom[0]}`;
    return { tex, plain, label };
  }

  /** The key of a group for the researcher's confirmations: symbol:exponent pairs in symbol order. */
  const groupKey = (vars, exps) => vars.map((v, j) => [v.symbol, exps[j]]).filter(([, e]) => !Q.isZero(e)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([s, e]) => `${s}:${Q.str(e)}`).join("|");

  /* ---------- familiar groups ---------- */

  const termMatches = (t, v) => {
    if (t.q !== v.quantity) return null;
    const kind = t.kind ?? "parameter";
    if (kind !== "any" && !(kind === v.kind || (kind === "parameter" && v.kind === "constant"))) return null;
    if (t.role && t.role !== v.role) return null;
    if (t.phase && v.phase && t.phase !== v.phase) return null;
    const notes = [];
    if (t.phase && !v.phase) notes.push(`${v.symbol} is ${t.phase === "fluid" ? "the fluid" : "the solid"} conductivity`);
    if (t.note) notes.push(`${v.symbol} is ${t.note}`);
    return notes.join(" and that ");
  };

  /**
   * Every one-to-one match of a form's terms to variables. `fixed` gives the exponent of each variable (a group to
   * name); without it, any variables of the Pi set may match (a candidate for a familiar basis).
   */
  function assignments(form, vars, fixed, sign = 1) {
    const out = [];
    const used = new Set();
    const pick = [], notes = [];
    (function go(i) {
      if (i === form.length) {
        if (fixed && vars.some((v, j) => !Q.isZero(fixed[j]) && !used.has(j))) return;
        out.push({ vars: pick.slice(), notes: notes.filter(Boolean) });
        return;
      }
      const t = form[i];
      for (let j = 0; j < vars.length; j++) {
        if (used.has(j)) continue;
        if (fixed && !Q.eq(fixed[j], Q.q(sign * t.e))) continue;
        const m = termMatches(t, vars[j]);
        if (m === null) continue;
        used.add(j); pick.push(j); notes.push(m);
        go(i + 1);
        used.delete(j); pick.pop(); notes.pop();
      }
    })(0);
    return out;
  }

  /** The familiar names of one group: the catalogue entries whose form matches it, or its reciprocal. */
  function recognize(vars, exps, catalogue) {
    const k = exps.filter((e) => !Q.isZero(e)).length;
    const names = [];
    for (const g of catalogue) {
      for (const form of g.forms) {
        if (form.length !== k) continue;
        for (const sign of [1, -1]) {
          const found = assignments(form, vars, exps, sign);
          if (found.length) {
            const notes = [...new Set(found[0].notes)];
            if (!names.some((n) => n.id === g.id && n.power === sign)) {
              const wrap = g.label.length > 3;
              names.push({ id: g.id, tex: sign > 0 ? g.tex : `${wrap ? `\\left(${g.tex}\\right)` : g.tex}^{-1}`, label: sign > 0 ? g.label : `${wrap ? `(${g.label})` : g.label}⁻¹`,
                name: g.name, def: g.def, plain: g.plain, reference: g.reference, source: g.source, power: sign, assumes: notes });
            }
          }
        }
      }
    }
    return names;
  }

  /** Candidate vectors of familiar groups over the Pi set, in catalogue order. */
  function candidates(vars, catalogue) {
    const out = [];
    for (const g of catalogue) for (const form of g.forms) for (const a of assignments(form, vars, null)) {
      const exps = vars.map(() => Q.ZERO);
      a.vars.forEach((j, i) => { exps[j] = Q.q(form[i].e); });
      if (!out.some((c) => c.exps.every((e, j) => Q.eq(e, exps[j])))) out.push({ id: g.id, exps, assumes: a.notes });
    }
    return out;
  }

  /* ---------- the Finder ---------- */

  /**
   * Run the Finder on an interpretation (src/check.js). `opts.repeating` is the researcher's set of variable ids or
   * null; `opts.preferred` the record's preferred reference variables; `opts.groups` data/groups.json's list;
   * `opts.confirmed` the researcher-confirmed group names by group key.
   */
  function find(interp, opts) {
    const catalogue = opts.groups ?? [];
    const vars = interp.variables.filter((v) => v.pi);
    const qoi = interp.observable;
    const ready = interp.calcs.find((c) => c.id === "pi-groups");
    if (!ready || !ready.ready) return { ready: false, blockedBy: ready ? ready.blockedBy : [] };
    const n = vars.length;
    const dims = vars.map((v) => v.dim);
    const rowIdx = U.BASE.map((_, i) => i).filter((i) => dims.some((d) => !Q.isZero(d[i])));
    const rows = rowIdx.map((i) => ({ base: U.BASE[i], name: U.BASE_NAMES[i] }));
    const D = rowIdx.map((i) => dims.map((d) => d[i]));
    const symbols = vars.map((v) => v.symbol);
    const steps = [];
    const step = (id, item, title, reason, extra = {}) => { steps.push({ id, item, title, reason, ...extra }); return id; };

    step("s-pi-variables", 2, "Variables and dimensions", "The Finder needs every supplied variable with its dimension. Each column of D comes from one row of this table.",
      { evidence: ["spec-4"], assumptions: (interp.assumptions ?? []).map((a) => a.id) });
    const Dtex = rows.length ? `\\begin{pmatrix}${D.map((r) => r.map(Q.str).join("&")).join("\\\\")}\\end{pmatrix}` : "()";
    step("s-pi-matrix", 3, "The dimension matrix D", `D has one column for each variable (${vars.map((v) => uni(v.tex)).join(", ")}). It has one row for each base dimension that occurs (${rows.map((r) => r.base).join(", ") || "none"}).`, { evidence: ["spec-4"] });

    /* row reduction, rank, kernel */
    const labels = vars.map((v) => uni(v.tex));
    const powLabel = (j) => (/ /.test(labels[j]) ? `(${labels[j]})` : labels[j]);
    const red = rows.length ? LA.rref(D, { cols: labels }) : { R: [], pivots: [], rank: 0, steps: [] };
    const r = red.rank, m = n - r;
    step("s-pi-rref", 3, "Row reduction of D", "Exact row operations bring D to reduced row echelon form. The number of pivots is the rank.", { evidence: ["spec-4"] });
    const ns = rows.length ? LA.nullspace(D) : { free: vars.map((_, j) => j), basis: vars.map((_, j) => vars.map((__, k) => (k === j ? Q.ONE : Q.ZERO))) };
    const kernel = ns.basis.map((b) => LA.integerScale(b));
    step("s-pi-kernel", 3, "Rank and kernel basis", `The rank is ${r}, so ${n} − ${r} = ${m} independent groups exist. Each free column gives one kernel vector.`, { evidence: ["spec-4", "mit-pi"] });

    /* repeating variables */
    const byId = (id) => vars.findIndex((v) => v.id === id);
    const scaleProblem = (v) => {
      if (v.id === qoi) return "it is the quantity of interest, which must appear in one group only";
      if (U.isNone(v.dim)) return "it is dimensionless, so it is a group by itself";
      if (v.kind === "field") return "it is a solution field, not a scale";
      if (v.kind === "coordinate") return "it is a coordinate, not a scale";
      if (v.value && v.value.exact && (Q.isZero(v.value.lo) || Q.isZero(v.value.hi) || (Q.sign(v.value.lo) < 0 && Q.sign(v.value.hi) > 0))) return `its value is ${v.value.text}, and a reference scale must not be 0`;
      if (!["positive", "negative", "nonzero"].includes(v.domain)) return `its domain (${v.domain}) allows 0, and a reference scale must not be 0`;
      return null;
    };
    const preferred = (opts.preferred ?? []).map(byId).filter((j) => j >= 0);
    const order = [...preferred, ...vars.map((_, j) => j).filter((j) => !preferred.includes(j))];
    const excluded = [];
    const usable = order.filter((j) => {
      const p = scaleProblem(vars[j]);
      if (p) excluded.push({ id: vars[j].id, symbol: vars[j].symbol, label: uni(vars[j].tex), tex: vars[j].tex, reason: p, preferred: preferred.includes(j) });
      return !p;
    });
    const auto = LA.independentColumns(D, usable, r);
    let chosen = auto.chosen, override = null;
    if (opts.repeating && opts.repeating.length) {
      const idx = opts.repeating.map(byId);
      let error = null;
      if (idx.some((j) => j < 0)) error = "a variable of the set is not in the Pi set";
      else if (new Set(idx).size !== idx.length) error = "the set names a variable twice";
      else if (idx.length !== r) error = `the set has ${idx.length} variables, but the rank is ${r}`;
      else if (LA.rank(LA.columns(D, idx)) !== r) error = "their dimension columns are not independent";
      else {
        const bad = idx.map((j) => [vars[j], scaleProblem(vars[j])]).find(([v, p]) => p && v.id !== qoi && !/coordinate|field/.test(p));
        if (bad) error = `${bad[0].symbol} cannot be a reference scale: ${bad[1]}`;
      }
      override = { ids: opts.repeating.slice(), error };
      if (!error) chosen = idx;
    }
    const complete = chosen.length === r;
    const reasons = [];
    if (complete) {
      let rk = 0;
      for (const j of chosen) {
        const before = rk;
        rk = LA.rank(LA.columns(D, chosen.slice(0, chosen.indexOf(j) + 1)));
        const adds = rows.filter((_, i) => !Q.isZero(D[i][j])).map((x) => x.base).join(" ");
        reasons.push({ id: vars[j].id, symbol: vars[j].symbol, tex: vars[j].tex, label: uni(vars[j].tex),
          text: `${override && !override.error ? "Your choice" : preferred.includes(j) ? "A preferred reference variable" : "The next variable in table order"}. Its column (${adds}) raises the rank from ${before} to ${rk}.` });
      }
    }
    const skipped = auto.refused.map((j) => ({ id: vars[j].id, symbol: vars[j].symbol, label: uni(vars[j].tex), tex: vars[j].tex, reason: "its column is a combination of the columns already chosen" }));
    step("s-pi-repeating", 4, "Repeating variables", complete
      ? `The Finder selects ${r} variables with independent dimension columns: ${chosen.map((j) => labels[j]).join(", ")}. Another set with independent columns gives an equivalent basis.`
      : `No set of ${r} usable variables has independent columns.`, { evidence: ["spec-4"] });

    // D_R: the repeating columns on r independent rows.
    const rowPick = complete ? LA.independentColumns(LA.transpose(LA.columns(D, chosen)), rows.map((_, i) => i), r).chosen : [];
    const DR = rowPick.map((i) => chosen.map((j) => D[i][j]));
    const detR = complete && r ? LA.det(DR) : Q.ONE;

    /* exponent equations and the direct basis */
    const letters = chosen.map((_, k) => LETTERS[k]);
    const nonRep = vars.map((_, j) => j).filter((j) => !chosen.includes(j));
    const exponentEquations = [];
    const direct = [], firsts = [];
    if (complete) {
      for (const q of nonRep) {
        const rhs = rowPick.map((i) => Q.neg(D[i][q]));
        const a = r ? LA.solve(DR, rhs) : [];
        const lines = rows.map((row, i) => {
          const parts = [];
          if (!Q.isZero(D[i][q])) parts.push(Q.str(D[i][q]));
          chosen.forEach((j, k) => {
            const c = D[i][j];
            if (Q.isZero(c)) return;
            const coef = Q.eq(c, Q.ONE) ? "" : Q.eq(c, Q.q(-1)) ? "-" : Q.str(c);
            parts.push(`${coef}${letters[k]}`);
          });
          const text = `${parts.join("+").replace(/\+-/g, "-") || "0"}=0`;
          const holds = Q.isZero(chosen.reduce((s, j, k) => Q.add(s, Q.mul(D[i][j], a[k])), D[i][q]));
          return { base: row.base, text, holds, used: rowPick.includes(i) };
        });
        const exps = vars.map(() => Q.ZERO);
        exps[q] = Q.ONE;
        chosen.forEach((j, k) => { exps[j] = a[k]; });
        exponentEquations.push({ id: vars[q].id, symbol: vars[q].symbol, tex: vars[q].tex, label: uni(vars[q].tex), letters: letters.slice(), lines, solution: a.map(Q.str), solutionTex: a.map(Q.tex), group: monomial(vars, exps, q).tex });
        direct.push(exps);
        firsts.push(q);
      }
    }
    step("s-pi-exponents", 4, "Exponent equations", complete
      ? `For each Pi variable q that is not a repeating variable, the Finder sets Π_q = q ${chosen.map((j, k) => `${powLabel(j)}^${letters[k]}`).join(" ")}. Then it solves one equation for each base dimension, in the order ${rows.map((x) => x.base).join(", ")}.`
      : "The exponent equations need a complete repeating set.", { evidence: ["spec-5"] });

    /* groups with cancellation, names and values */
    const confirmed = opts.confirmed ?? {};
    const describe = (exps, i, prefix, first = -1) => {
      const mono = monomial(vars, exps, first);
      const cancellation = rows.map((row, k) => {
        const contrib = vars.map((v, j) => [v, exps[j], D[k][j]]).filter(([, e, d]) => !Q.isZero(e) && !Q.isZero(d));
        const sum = contrib.reduce((s, [, e, d]) => Q.add(s, Q.mul(e, d)), Q.ZERO);
        return { base: row.base, text: `${contrib.map(([, e, d]) => `(${Q.str(e)})(${Q.str(d)})`).join(" + ") || "0"} = ${Q.str(sum)}`, zero: Q.isZero(sum) };
      });
      const numDim = vars.reduce((acc, v, j) => (Q.sign(exps[j]) > 0 ? U.dadd(acc, U.dscale(v.dim, exps[j])) : acc), U.NONE.slice());
      const denDim = vars.reduce((acc, v, j) => (Q.sign(exps[j]) < 0 ? U.dadd(acc, U.dscale(v.dim, Q.neg(exps[j]))) : acc), U.NONE.slice());
      const names = recognize(vars, exps, catalogue);
      const key = groupKey(vars, exps);
      const absTemps = vars.filter((v, j) => !Q.isZero(exps[j]) && v.temperature === "absolute");
      return {
        id: `${prefix}${i + 1}`, key, exps: Object.fromEntries(vars.map((v, j) => [v.id, Q.str(exps[j])]).filter(([, e]) => e !== "0")),
        tex: mono.tex, plain: mono.plain, label: mono.label, contains: vars.filter((_, j) => !Q.isZero(exps[j])).map((v) => v.id),
        cancellation, cancelTex: `\\left[${mono.tex}\\right]=${U.isNone(denDim) ? U.tex(numDim) : `\\frac{${U.tex(numDim)}}{${U.tex(denDim)}}`}=1`,
        dimensionless: cancellation.every((c) => c.zero),
        names, confirmed: confirmed[key] ?? null,
        value: value(vars, exps),
        absolute: absTemps.map((v) => v.symbol),
        meaning: exps.filter((e) => !Q.isZero(e)).length === 1 ? vars[exps.findIndex((e) => !Q.isZero(e))].dimensionless : null,
      };
    };
    const groups = direct.map((e, i) => describe(e, i, "g", firsts[i]));
    const kernelGroups = kernel.map((e, i) => describe(e, i, "k"));

    /* checks of the basis */
    const A = LA.transpose(direct);
    const basisRank = direct.length ? LA.rank(A) : 0;
    const DA = direct.map((e) => LA.mulMV(D, e));
    const checks = [];
    const check = (id, title, passed, detail, extra = {}) => checks.push({ id, title, status: "exact", passed, detail, ...extra });
    if (complete) {
      check("x-det", "det D_R is not 0", !Q.isZero(detR), `det D_R = ${Q.str(detR)} on the rows ${rowPick.map((i) => rows[i].base).join(", ")}${r ? "" : " (rank 0: no repeating variables)"}.`);
      check("x-Da", "D a = 0 for each group", DA.every(LA.isZeroVector), groups.map((g, i) => `For ${g.label}, D a = (${DA[i].map(Q.str).join(", ")}).`).join(" "));
      check("x-rank", "The basis has rank n − r", basisRank === m, `rank of the ${n} × ${m} exponent matrix = ${basisRank}, and n − r = ${m}.`);
      const idRows = nonRep.map((q) => direct.map((e) => e[q]));
      const isIdentity = idRows.every((row, i) => row.every((x, k) => Q.eq(x, k === i ? Q.ONE : Q.ZERO)));
      check("x-identity", "Independence: the rows of the other variables form the identity", isIdentity, `The rows for ${nonRep.map((j) => labels[j]).join(", ")} in the exponent matrix form the ${m} × ${m} identity, so the groups are independent.`);
      check("x-cancel", "Dimensional cancellation of each group", groups.every((g) => g.dimensionless), "Every base dimension has exponent sum 0 in every group.");
      check("x-kernel", "The row-reduced basis spans the same space", kernel.every((k) => LA.express(direct, k) !== null) && kernel.length === m, `Each of the ${kernel.length} kernel vectors of the reduced form is a linear combination of the exponent vectors of the ${m} groups.`);
    }
    step("s-pi-checks", 5, "Dimensional cancellation and independence", "Each group must be dimensionless, and the groups must be independent and complete.", { evidence: ["spec-4", "spec-5"] });

    /* constraints between inputs */
    const piSyms = new Set(symbols);
    const constraintItems = [];
    for (const e of interp.equations) {
      if (!e.ast || !["definition", "constraint"].includes(e.kind) || !e.symbols.every((s) => piSyms.has(s))) continue;
      const mono = e.ast.k === "rel" && e.ast.op === "=" ? monomialOf(e.ast, symbols) : null;
      if (mono) {
        const v = mono.exps;
        constraintItems.push({ id: e.id, text: e.plain, tex: e.tex, label: plainLabel(e.plain, vars), monomial: true, exps: v, group: monomial(vars, v).tex, groupLabel: monomial(vars, v).label, value: Q.str(mono.coef), consistent: LA.isZeroVector(LA.mulMV(D, v)) });
      } else constraintItems.push({ id: e.id, text: e.plain, tex: e.tex, label: plainLabel(e.plain, vars), monomial: false });
    }
    const monos = constraintItems.filter((c) => c.monomial && c.consistent);
    const cRank = monos.length ? LA.rank(LA.transpose(monos.map((c) => c.exps))) : 0;
    const others = constraintItems.filter((c) => !c.monomial).length;
    const free = Math.max(0, m - cRank - others);
    const constraints = { items: constraintItems.map(({ exps, ...rest }) => rest), rank: cRank, other: others, free, algebraic: m };
    if (constraintItems.length) step("s-pi-constraints", 5, "Relations between Pi variables", `The model states ${constraintItems.length} relation${constraintItems.length > 1 ? "s" : ""} between Pi variables. The ${m} groups are algebraically independent, but only ${free} of them can vary.`, { evidence: ["mit-pi", "spec-3"] });

    /* the familiar basis and the transformation */
    const pool = candidates(vars, catalogue).filter((c) => LA.isZeroVector(LA.mulMV(D, c.exps)));
    const qj = vars.findIndex((v) => v.id === qoi);
    const fam = [];
    const tryAdd = (c, allowRepeat = true) => {
      if (fam.length >= m) return;
      if (!allowRepeat && c.id && fam.some((f) => f.id === c.id)) return;
      if (LA.rank(LA.transpose([...fam.map((f) => f.exps), c.exps])) === fam.length + 1) fam.push(c);
    };
    if (complete && m) {
      const withQ = pool.find((c) => qj >= 0 && !Q.isZero(c.exps[qj]));
      if (withQ) tryAdd(withQ);
      else if (qj >= 0 && !chosen.includes(qj)) tryAdd({ id: null, exps: direct[nonRep.indexOf(qj)], first: qj });
      // A group that a constraint fixes stays in the basis as a fixed group.
      for (const c of monos) if (qj < 0 || Q.isZero(c.exps[qj])) tryAdd({ id: null, exps: c.exps, fixed: c.id });
      for (const c of pool) if (qj < 0 || Q.isZero(c.exps[qj])) tryAdd(c, false);
      for (const c of pool) if (qj < 0 || Q.isZero(c.exps[qj])) tryAdd(c);
      direct.forEach((e, i) => { if (qj < 0 || Q.isZero(e[qj])) tryAdd({ id: null, exps: e, first: firsts[i] }); });
    }
    let familiar = null;
    if (complete && m && fam.length === m) {
      const T = fam.map((f) => LA.express(direct, f.exps));
      const Tm = LA.transpose(T);
      const det = LA.det(Tm);
      const famGroups = fam.map((f, i) => ({ ...describe(f.exps, i, "f", f.first ?? -1), catalogue: f.id, fixed: f.fixed ?? null }));
      familiar = { groups: famGroups, named: fam.filter((f) => f.id).length, T: Tm.map((row) => row.map(Q.str)),
        Ttex: `\\begin{pmatrix}${Tm.map((row) => row.map(Q.str).join("&")).join("\\\\")}\\end{pmatrix}`, det: Q.str(det), equivalent: !Q.isZero(det),
        relations: famGroups.map((g, i) => ({ group: g.names[0]?.tex ?? g.tex, combo: T[i].map((c, k) => [c, groups[k]]).filter(([c]) => !Q.isZero(c)).map(([c, g2]) => `(${g2.tex})${Q.eq(c, Q.ONE) ? "" : `^{${Q.str(c)}}`}`).join("\\,") })) };
      check("x-equivalent", "The familiar basis is equivalent to the repeating-variable basis", !Q.isZero(det), `Each familiar group is a product of powers of the repeating-variable groups. The exponent matrix T has det T = ${Q.str(det)}, which is not 0.`);
    }
    step("s-pi-familiar", 5, "Familiar groups and equivalent bases", "A familiar name comes from a stored formula with its reference quantities. A product of powers of groups with an invertible exponent matrix gives an equivalent basis.", { evidence: ["spec-10", "comsol-htc"] });

    /* what a correlation still needs */
    const qGroup = familiar ? familiar.groups.find((g) => qj >= 0 && g.contains.includes(vars[qj].id)) : groups.find((g) => qj >= 0 && g.contains.includes(vars[qj].id));
    const restGroups = (familiar ? familiar.groups : groups).filter((g) => g !== qGroup && !g.fixed);
    const label = (g) => g.confirmed ? g.names.find((x) => x.id === g.confirmed)?.tex ?? g.tex : g.names[0]?.tex ?? g.tex;
    const relation = qGroup ? `${label(qGroup)}=f\\left(${restGroups.map(label).join(",\\;") || ""}\\right)` : null;
    step("s-pi-correlation", 5, "What a correlation needs", "Buckingham Pi analysis gives the groups of a relation, not the relation itself. Data or a solved model must supply the function f.", { evidence: ["mit-pi", "spec-5"] });

    return {
      ready: true, n, r, m,
      vars: vars.map((v) => ({ id: v.id, symbol: v.symbol, tex: v.tex, label: uni(v.tex), meaning: v.meaning, dim: U.text(v.dim), dimTex: U.tex(v.dim), kind: v.kind, quantity: v.quantity, phase: v.phase, temperature: v.temperature, affine: v.affine, value: v.value ? v.value.text : null })),
      rows, D: D.map((row) => row.map(Q.str)), Dtex,
      rref: { steps: red.steps.map((s, i) => ({ ...s, n: i + 1, matrixTex: `\\begin{pmatrix}${s.matrix.map((row) => row.join("&")).join("\\\\")}\\end{pmatrix}` })), R: red.R.map((row) => row.map(Q.str)),
        Rtex: rows.length ? `\\begin{pmatrix}${red.R.map((row) => row.map(Q.str).join("&")).join("\\\\")}\\end{pmatrix}` : "()", pivots: red.pivots.map((j) => labels[j]), free: ns.free.map((j) => labels[j]) },
      kernel: kernelGroups,
      repeating: { complete, ids: chosen.map((j) => vars[j].id), symbols: chosen.map((j) => vars[j].symbol), texs: chosen.map((j) => vars[j].tex), labels: chosen.map((j) => uni(vars[j].tex)), letters, reasons, excluded, skipped, override,
        auto: auto.chosen.map((j) => vars[j].id), DR: DR.map((row) => row.map(Q.str)), DRtex: complete && r ? `\\begin{pmatrix}${DR.map((row) => row.map(Q.str).join("&")).join("\\\\")}\\end{pmatrix}` : "", DRrows: rowPick.map((i) => rows[i].base), det: Q.str(detR) },
      exponentEquations, groups, familiar, checks, constraints,
      correlation: { relation, quantity: qj >= 0 ? vars[qj].symbol : null },
      steps,
    };
  }

  /** A relation that is a product of powers: { coef, exps } with exps over `symbols` (left minus right), or null. */
  function monomialOf(rel, symbols) {
    const exps = symbols.map(() => Q.ZERO);
    let coef = Q.ONE;
    const walk = (n, s) => {
      if (n.k === "sym") { const j = symbols.indexOf(n.name); if (j < 0) return false; exps[j] = Q.add(exps[j], Q.q(s)); return true; }
      if (n.k === "num") { coef = s > 0 ? Q.mul(coef, n.v) : Q.div(coef, n.v); return !Q.isZero(n.v); }
      if (n.k === "mul") return n.num.every((x) => walk(x, s)) && n.den.every((x) => walk(x, -s));
      if (n.k === "pow" && n.b.k === "sym" && n.e.k === "num") {
        const j = symbols.indexOf(n.b.name);
        if (j < 0) return false;
        exps[j] = Q.add(exps[j], Q.mul(n.e.v, Q.q(s)));
        return true;
      }
      return false;
    };
    // left = right  ->  left * right^-1 = 1, so the group (left / right) has the value 1 / coef ratio.
    if (!walk(rel.l, 1) || !walk(rel.r, -1)) return null;
    return { exps, coef: Q.inv(coef) };
  }

  /** The exact value or range of a group from the variables' SI values; null when one is missing or not exact. */
  function value(vars, exps) {
    const used = vars.map((v, j) => [v, exps[j]]).filter(([, e]) => !Q.isZero(e));
    if (!used.length || used.some(([v, e]) => !v.value || !v.value.exact || (!Q.isInteger(e) && Q.sign(v.value.lo) <= 0))) return null;
    if (used.some(([, e]) => !Q.isInteger(e))) {
      // A fractional power: a floating-point value, labelled as such.
      const at = used.reduce((p, [v, e]) => p * Q.toNumber(v.value.lo) ** Q.toNumber(e), 1);
      return { exact: false, text: String(Number(at.toPrecision(6))), float: at };
    }
    let lo = null, hi = null;
    const corners = 1 << used.length;
    for (let c = 0; c < corners; c++) {
      let p = Q.ONE;
      let ok = true;
      used.forEach(([v, e], i) => {
        const x = c & (1 << i) ? v.value.hi : v.value.lo;
        if (Q.isZero(x) && Q.sign(e) < 0) { ok = false; return; }
        p = Q.mul(p, Q.pow(x, e.n));
      });
      if (!ok) return { exact: true, undefined: true, text: "undefined: a divisor is 0" };
      if (!lo || Q.cmp(p, lo) < 0) lo = p;
      if (!hi || Q.cmp(p, hi) > 0) hi = p;
    }
    const exactText = (x) => (x.d === 1n || x.d.toString().length <= 6 ? Q.str(x) : null);
    return { exact: true, lo: Q.str(lo), hi: Q.str(hi), loFloat: Q.toNumber(lo), hiFloat: Q.toNumber(hi), fraction: exactText(lo) };
  }

  return { find, monomial, recognize, candidates, groupKey, monomialOf, value, uni, plainLabel };
});
