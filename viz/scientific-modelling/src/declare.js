/* Scientific Modelling: the declared models of spec section 10 (data/catalogue.json) and the record that names one in
 * purpose.declaration. A declaration has six parts: model, domain, operations, methods (with limitations),
 * acceptance and solver. The page links a record to its declaration through the Model Nondimensionalizer (piece 2):
 * the record's roles are assigned by quantity, kind and phase, and each dimensionless equation and condition that
 * the Nondimensionalizer derived from the record must equal the declared dimensionless form exactly, with the
 * declared scales and the declared parameters (src/sym.js, canonical forms). Only then do the regime map and the
 * declared solvers run on the record.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./expr.js"), require("./sym.js"));
  else (root.SM = root.SM || {}).D = factory(root.SM.Q, root.SM.E, root.SM.S);
})(typeof self !== "undefined" ? self : this, function (Q, E, S) {
  "use strict";

  /** The six parts of a declaration (spec section 10), in the order of the section's list. */
  const PARTS = [
    { id: "model", name: "Exact equations, closures, geometry and supported conditions" },
    { id: "domain", name: "Parameter domain and physical assumptions" },
    { id: "operations", name: "Supported symbolic and numerical operations" },
    { id: "methods", name: "Applicable mathematical analyses and explicit limitations" },
    { id: "acceptance", name: "Standard example, reference result and acceptance tolerances" },
    { id: "solver", name: "Solver, discretization, convergence criteria and reproducibility settings" },
  ];
  /** The four methods of spec section 8. */
  const METHODS = [
    { id: "dominant-balance", name: "Dominant balance" },
    { id: "asymptotic", name: "Asymptotic analysis" },
    { id: "stability", name: "Stability analysis" },
    { id: "bifurcation", name: "Bifurcation analysis" },
  ];

  const declarations = (data) => data.catalogue?.declarations ?? [];
  const find = (data, id) => declarations(data).find((d) => d.id === id) ?? null;

  /** What a declaration lacks of section 10's six parts, as sentences (empty when it is complete). */
  function problemsOf(decl) {
    const out = [];
    for (const p of PARTS) if (!decl[p.id]) out.push(`${decl.id} has no part "${p.id}" (${p.name.toLowerCase()}).`);
    const m = decl.model ?? {};
    if (!m.equations?.length || !m.conditions || !m.geometry || !m.closures) out.push(`${decl.id}: the model part needs equations, closures, geometry and conditions.`);
    if (!m.dimensionless?.equations?.length || !m.dimensionless?.parameters) out.push(`${decl.id}: the model part needs the declared dimensionless form.`);
    if (!decl.domain?.parameters?.length || !decl.domain?.assumptions?.length) out.push(`${decl.id}: the domain part needs parameters and assumptions.`);
    if (!decl.operations?.symbolic?.length || !decl.operations?.numerical?.length) out.push(`${decl.id}: the operations part needs symbolic and numerical operations.`);
    for (const x of METHODS) if (!decl.methods?.[x.id] || typeof decl.methods[x.id].applies !== "boolean" || !decl.methods[x.id].reason) out.push(`${decl.id}: the method ${x.id} needs "applies" and a reason.`);
    if (!decl.limitations?.length) out.push(`${decl.id}: the methods part needs explicit limitations.`);
    if (!decl.acceptance?.example || !decl.acceptance?.reference || !decl.acceptance?.tolerance) out.push(`${decl.id}: the acceptance part needs an example, a reference and a tolerance.`);
    for (const k of ["method", "discretization", "convergence", "reproducibility"]) if (!decl.solver?.[k]) out.push(`${decl.id}: the solver part needs ${k}.`);
    return out;
  }

  /* ---------- the record against a declaration, through the Nondimensionalizer ---------- */

  const WORD = /[A-Za-z][A-Za-z0-9_]*/g;
  const MAX_TRIES = 4096;

  /**
   * Match a confirmed interpretation (src/check.js) and the Nondimensionalizer's result on it (src/nondim.js) against
   * a declaration. Returns { ok, roles, hats, params, equations, conditions, sets, problems, next }.
   */
  function match(decl, interp, nd) {
    const fail = (problems, next) => ({ ok: false, roles: {}, hats: {}, params: [], equations: [], conditions: [], sets: {}, problems, next });
    if (!nd || !nd.ready) {
      const why = !nd ? "the Nondimensionalizer did not run on this version" : nd.reason === "blocked" ? "a failed check blocks the Nondimensionalizer" : String(nd.message ?? "the Nondimensionalizer did not run");
      return fail([`The declared model needs the dimensionless equations of the record, but ${why.replace(/\.$/, "")}.`], nd?.next || "Fix the checks that block the Nondimensionalizer, then confirm the interpretation.");
    }
    const roles = decl.model.roles;
    const vars = interp.variables;
    const candidates = roles.map((r) => vars.filter((v) => v.quantity === r.quantity && (v.kind === r.kind || (r.kind === "parameter" && v.kind === "constant")) && (!r.phase || !v.phase || r.phase === v.phase)));
    const missing = roles.filter((r, i) => !r.optional && !candidates[i].length);
    if (missing.length) return fail([`The record has no variable for the declared role${missing.length > 1 ? "s" : ""} ${missing.map((r) => `${r.id} (${r.meaning}: quantity ${r.quantity}, kind ${r.kind})`).join("; ")}.`], "Add the variable with its quantity, or choose another declared model.");
    const base = baseContext(interp, nd);
    let best = null, tries = 0;
    const assign = new Array(roles.length).fill(null);
    const used = new Set();
    function search(i) {
      if (tries > MAX_TRIES) return false;
      if (i === roles.length) {
        tries++;
        const map = {};
        roles.forEach((r, k) => { if (assign[k]) map[r.id] = assign[k]; });
        const res = attempt(decl, map, interp, nd, base);
        if (!best || res.score > best.score) best = res;
        return res.ok;
      }
      for (const v of candidates[i]) {
        if (used.has(v.id)) continue;
        assign[i] = v;
        used.add(v.id);
        if (search(i + 1)) return true;
        used.delete(v.id);
        assign[i] = null;
      }
      if (roles[i].optional) return search(i + 1);
      return false;
    }
    search(0);
    if (!best) return fail(["No assignment of the record's variables to the declared roles fits."], "Check the quantities and kinds of the variables.");
    return best;
  }

  /** The record's definitions as expansions (symbol -> polynomial), and the context of the dimensionless names. */
  function baseContext(interp, nd) {
    const fields = new Set(interp.variables.filter((v) => v.kind === "field").map((v) => v.symbol));
    const coords = new Set(interp.variables.filter((v) => v.kind === "coordinate").map((v) => v.symbol));
    for (const f of nd.fields ?? []) fields.add(f.hat);
    for (const c of nd.coordinates ?? []) coords.add(c.hat);
    for (const v of nd.variables) (v.kind === "coordinate" ? coords : fields).add(v.hat);
    const ctx = { isField: (n) => fields.has(n), isCoordinate: (n) => coords.has(n), depends: () => true, isVar: (n) => fields.has(n) || coords.has(n) };
    const defs = new Map();
    for (const e of interp.equations) {
      if (e.kind !== "definition" || !e.ast || e.ast.k !== "rel" || e.ast.op !== "=" || e.ast.l.k !== "sym") continue;
      if (fields.has(e.ast.l.name) || e.symbols.some((s) => fields.has(s) || coords.has(s)) || E.derivatives(e.ast.r).length) continue;
      try { defs.set(e.ast.l.name, S.fromAst(e.ast.r, ctx)); } catch { /* a definition outside the engine is not used */ }
    }
    return { ctx, defs };
  }

  function attempt(decl, map, interp, nd, base) {
    const dl = decl.model.dimensionless;
    const problems = [];
    let score = 0;
    const rename = (text) => String(text).replace(WORD, (w) => (map[w] ? map[w].symbol : w));
    // Declaration definitions apply to roles that the record does not have, such as α = k/(ρc_p).
    const defs = new Map(base.defs);
    for (const d of dl.definitions ?? []) if (!map[d.symbol] && !defs.has(d.symbol)) { try { defs.set(d.symbol, S.read(rename(d.def), base.ctx)); } catch { /* unused */ } }
    const normal = (p) => {
      let cur = p;
      for (let i = 0; i < 8; i++) {
        const next = S.subst(cur, { sym: (n) => defs.get(n) ?? null }, base.ctx);
        if (S.equal(next, cur)) return next;
        cur = next;
      }
      return cur;
    };
    const read = (text) => normal(S.read(rename(text), base.ctx));
    // The dimensionless variables: the declared scale and offset must be the Nondimensionalizer's.
    const hats = {};
    for (const v of dl.variables) {
      const rs = map[v.of]?.symbol;
      const ndv = rs ? nd.variables.find((x) => x.name === rs) : null;
      if (!ndv) { problems.push(`The Nondimensionalizer does not scale the declared variable ${v.of}.`); continue; }
      hats[v.symbol] = ndv.hat;
      let same = false;
      try { same = S.equal(normal(S.read(ndv.scalePlain, base.ctx)), read(v.scale)) && S.equal(normal(S.read(ndv.offsetPlain || "0", base.ctx)), read(v.offset)); } catch { same = false; }
      if (same) score += 1;
      else problems.push(`The scale of ${rs} is ${ndv.scalePlain} with the offset ${ndv.offsetPlain || "0"}, but the declared model uses ${rename(v.scale)} with the offset ${rename(v.offset)}.`);
    }
    // The declared parameters as polynomials of the record's symbols.
    const params = [];
    const paramPoly = new Map();
    for (const p of dl.parameters) {
      if (!p.def) continue;
      try { const poly = read(p.def); paramPoly.set(p.id, poly); params.push({ id: p.id, plain: S.plain(poly) }); }
      catch (e) { problems.push(`The declared parameter ${p.id} cannot be written with the record's variables: ${e instanceof Error ? e.message : String(e)}.`); }
    }
    const declared = (text) => {
      const named = String(text).replace(WORD, (w) => hats[w] ?? w);
      const p = S.read(named, base.ctx);
      return normal(S.subst(p, { sym: (n) => paramPoly.get(n) ?? null }, base.ctx));
    };
    const form = (text) => { const [l, r] = String(text).split(/\s=\s/); return S.sub(declared(l), declared(r)); };
    const same = (a, b) => S.equalCleared(a, b, base.ctx) || S.equalCleared(a, S.neg(b), base.ctx);
    const ndForm = (e) => { const [l, r] = e.dimensionlessPlain.split(" = "); return normal(S.sub(S.read(l, base.ctx), S.read(r, base.ctx))); };
    const pending = nd.equations.filter((e) => !e.output && e.dimensionlessPlain);
    const used = new Set();
    const equations = [];
    for (const eq of dl.equations) {
      let hit = null;
      try {
        const want = form(eq.text);
        hit = pending.find((e) => !e.cond && !used.has(e.id) && same(ndForm(e), want)) ?? null;
      } catch { hit = null; }
      if (hit) { used.add(hit.id); equations.push({ of: eq.of, record: hit.id, text: eq.text }); score += 2; }
      else problems.push(`No equation of the record has the declared dimensionless form ${eq.text}.`);
    }
    const conditions = [];
    const sets = {};
    const atOf = (e) => {
      const c = interp.conditions.find((x) => x.id === e.id);
      const hat = c ? nd.variables.find((x) => x.name === c.atVar)?.hat : null;
      return { hat, value: e.at ? e.at.plain : null };
    };
    for (const c of dl.conditions) {
      const [atSym, atVal] = String(c.at).split(/\s=\s/);
      const options = [{ text: c.text, sets: c.sets ?? declSets(decl, c.of, null) }, ...(c.alternatives ?? []).map((a, i) => ({ text: a.text, sets: declSets(decl, c.of, i) }))];
      let hit = null, which = null;
      for (const [k, opt] of options.entries()) {
        try {
          const want = form(opt.text), at = declared(atVal);
          hit = pending.find((e) => e.cond && !used.has(e.id) && atOf(e).hat === hats[atSym] && atOf(e).value !== null && S.equal(normal(S.read(atOf(e).value, base.ctx)), at) && same(ndForm(e), want)) ?? null;
        } catch { hit = null; }
        if (hit) { which = k; Object.assign(sets, opt.sets); break; }
      }
      if (hit) { used.add(hit.id); conditions.push({ of: c.of, record: hit.id, text: options[/** @type {number} */ (which)].text, at: c.at, alternative: which }); score += 2; }
      else problems.push(`No condition of the record has the declared dimensionless form ${c.text} at ${c.at}${c.alternatives?.length ? ` (or ${c.alternatives.map((a) => a.text).join(", or ")})` : ""}.`);
    }
    for (const e of pending) if (!used.has(e.id)) problems.push(`The record's ${e.cond ? "condition" : "equation"} ${e.id} (${e.dimensionlessPlain}) is not part of the declared model.`);
    const roles = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { id: v.id, symbol: v.symbol }]));
    return { ok: !problems.length, roles, hats, params, equations, conditions, sets, problems, score: score - problems.length,
      next: problems.length ? "Make the record's equations, conditions and scales the declared ones, or choose another declared model. The page shows the declared forms in the catalogue." : "" };
  }
  /** The parameter values that a declared condition fixes: an insulated tip sets Bi_t = 0. */
  function declSets(decl, of, alternative) {
    const c = decl.model.conditions.find((x) => x.id === of);
    if (!c) return {};
    if (alternative === null) return c.sets ?? {};
    return c.alternatives?.[alternative]?.sets ?? {};
  }

  /* ---------- values: the record's point and the dimensional reconstruction ---------- */

  /**
   * The SI values of the record's variables, as rationals where they are exact and single, else floats:
   * Map symbol -> { exact: rational | null, float: number }.
   */
  function valuesOf(interp) {
    const out = new Map();
    for (const v of interp.variables) {
      if (!v.value) continue;
      if (v.value.exact && Q.eq(v.value.lo, v.value.hi)) out.set(v.symbol, { exact: v.value.lo, float: Q.toNumber(v.value.lo) });
      else if (!v.value.exact && Number.isFinite(v.value.float)) out.set(v.symbol, { exact: null, float: v.value.float });
    }
    return out;
  }

  /** The value of a canonical polynomial at the record's values: { exact, float } or null when a value is missing. */
  function evaluate(p, values) {
    let exact = Q.ZERO, float = 0, isExact = true;
    for (const t of S.terms(p)) {
      let ex = t.coef, fl = Q.toNumber(t.coef);
      for (const [a, e] of t.mono) {
        if (a.t === "num") { fl *= Q.toNumber(a.v) ** Q.toNumber(e); ex = null; continue; }
        if (a.t !== "sym") return null;
        const v = values.get(a.name);
        if (!v) return null;
        fl *= v.float ** Q.toNumber(e);
        if (ex && v.exact && Q.isInteger(e) && !(Q.isZero(v.exact) && Q.sign(e) < 0)) ex = Q.mul(ex, Q.pow(v.exact, e.n));
        else ex = null;
      }
      float += fl;
      if (ex && isExact) exact = Q.add(exact, ex);
      else isExact = false;
    }
    return { exact: isExact ? exact : null, float };
  }

  /**
   * The record's point in the declared parameters: { [id]: { value, exact, from } } for each parameter whose
   * variables all have values. Uses the match's role names and the record's definitions.
   */
  function point(decl, m, interp, nd) {
    const values = valuesOf(interp);
    const base = baseContext(interp, nd);
    const rename = (text) => String(text).replace(WORD, (w) => (m.roles[w] ? m.roles[w].symbol : w));
    const defs = new Map(base.defs);
    for (const d of decl.model.dimensionless.definitions ?? []) if (!m.roles[d.symbol] && !defs.has(d.symbol)) defs.set(d.symbol, S.read(rename(d.def), base.ctx));
    // A defined parameter without its own value takes the value of its definition.
    for (const [s, p] of defs) if (!values.has(s)) { const v = evaluate(p, values); if (v) values.set(s, v); }
    const out = {};
    for (const p of decl.model.dimensionless.parameters) {
      if (!p.def) continue;
      const v = evaluate(S.read(rename(p.def), base.ctx), values);
      if (v && Number.isFinite(v.float)) out[p.id] = { value: v.exact ? Q.toNumber(v.exact) : v.float, exact: v.exact ? Q.str(v.exact) : null };
    }
    for (const [k, v] of Object.entries(m.sets ?? {})) out[k] = { value: v, exact: String(v) };
    return out;
  }

  /**
   * The dimensional value that a parameter value means: the declared parameter's `solve` variable, with every other
   * variable at its record value. { symbol, id, value (SI), unit } or null.
   */
  function reconstruct(decl, m, interp, nd, paramId, value) {
    const p = decl.model.dimensionless.parameters.find((x) => x.id === paramId);
    if (!p || !p.solve || !m.roles[p.solve]) return null;
    const target = m.roles[p.solve].symbol;
    const base = baseContext(interp, nd);
    const values = valuesOf(interp);
    const rename = (text) => String(text).replace(WORD, (w) => (m.roles[w] ? m.roles[w].symbol : w));
    const defs = new Map(base.defs);
    for (const d of decl.model.dimensionless.definitions ?? []) if (!m.roles[d.symbol] && !defs.has(d.symbol)) defs.set(d.symbol, S.read(rename(d.def), base.ctx));
    for (const [s, q] of defs) if (!values.has(s)) { const v = evaluate(q, values); if (v) values.set(s, v); }
    // Expand definitions that hold the target, so that the target appears as a plain factor.
    let poly = S.read(rename(p.def), base.ctx);
    for (let i = 0; i < 4; i++) poly = S.subst(poly, { sym: (n) => (n !== target && defs.has(n) && S.names(/** @type {any} */ (defs.get(n))).has(target) ? defs.get(n) : null) }, base.ctx);
    const ts = S.terms(poly);
    if (ts.length !== 1) return null;
    const t = ts[0];
    const own = t.mono.find(([a]) => a.t === "sym" && a.name === target);
    if (!own) return null;
    let rest = Q.toNumber(t.coef);
    for (const [a, e] of t.mono) {
      if (a === own[0]) continue;
      if (a.t === "num") { rest *= Q.toNumber(a.v) ** Q.toNumber(e); continue; }
      const v = a.t === "sym" ? values.get(a.name) : null;
      if (!v) return null;
      rest *= v.float ** Q.toNumber(e);
    }
    const x = (value / rest) ** (1 / Q.toNumber(own[1]));
    const v = interp.variables.find((y) => y.symbol === target);
    return Number.isFinite(x) ? { symbol: target, id: v?.id ?? null, tex: v?.tex ?? E.nameTex(target), meaning: v?.meaning ?? "", value: x, unit: v?.unitText ?? "" } : null;
  }

  return { PARTS, METHODS, declarations, find, problemsOf, match, point, reconstruct, valuesOf, evaluate };
});
