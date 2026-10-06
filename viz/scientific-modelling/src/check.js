/* Scientific Modelling: the interpretation and the checks before any analysis (spec section 3). It reads the
 * record's inputs and returns what the page shows for confirmation (each variable's dimension, kind and value in
 * SI, each equation and condition typeset with the dimension of every term), the failed checks with the next
 * useful action, and for each calculation whether its inputs are complete. A failed check blocks only the
 * calculations that read the failed input; the others still run.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./units.js"), require("./expr.js"));
  else (root.SM = root.SM || {}).C = factory(root.SM.Q, root.SM.U, root.SM.E);
})(typeof self !== "undefined" ? self : this, function (Q, U, E) {
  "use strict";

  /** The calculations of the plan, the piece that brings each, and whether it reads the equations. */
  const CALCS = [
    { id: "pi-groups", name: "Buckingham Pi groups (Finder)", piece: 1, equations: false },
    { id: "nondimensionalize", name: "Nondimensionalization", piece: 2, equations: true },
    { id: "dominant-balance", name: "Dominant balance", piece: 3, equations: true },
    { id: "asymptotic", name: "Asymptotic analysis", piece: 3, equations: true },
    { id: "regime-map", name: "Regime map", piece: 3, equations: true },
    { id: "stability", name: "Stability analysis", piece: 4, equations: true },
    { id: "bifurcation", name: "Bifurcation analysis", piece: 4, equations: true },
  ];
  const EQ_CALCS = CALCS.filter((c) => c.equations).map((c) => c.id);
  const CURRENT_PIECE = 4;

  /** TeX commands a variable's own TeX may use: letters, accents and fonts. Anything else (a link, a style, a
   * package load) is refused, because an imported record must not add behaviour to the page. */
  const TEX_COMMANDS = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma",
    "tau", "phi", "varphi", "chi", "psi", "omega", "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Phi", "Psi", "Omega", "infty", "prime", "partial", "cdot", "mathrm", "mathit",
    "mathsf", "mathbf", "dot", "ddot", "hat", "bar", "tilde", "vec", "max", "min"]);
  /** Is a variable's TeX made only of allowed commands and plain characters? */
  const safeTex = (tex) => /^[A-Za-z0-9_^{}\\ ,.'()+\-]*$/.test(tex) && [...tex.matchAll(/\\([A-Za-z]+)/g)].every((m) => TEX_COMMANDS.has(m[1]));

  /** A value or a range in the variable's unit: "200", "4e-5", "1..10", "1 to 10". */
  function parseValue(text) {
    const s = String(text ?? "").trim();
    if (!s) return null;
    const m = /^(.+?)\s*(?:\.\.|\bto\b|…)\s*(.+)$/.exec(s);
    if (m && !/^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(s)) {
      const lo = Q.parse(m[1]), hi = Q.parse(m[2]);
      if (!lo || !hi) return { error: `"${s}" is not a number or a range such as 1..10.` };
      if (Q.cmp(lo, hi) > 0) return { error: `The range ${s} starts above its end.` };
      return { lo, hi };
    }
    const v = Q.parse(s);
    return v ? { lo: v, hi: v } : { error: `"${s}" is not a number or a range such as 1..10.` };
  }

  /** Short decimal text of a rational: 6 significant digits, exact integers kept. */
  function num(v) {
    if (Q.isInteger(v) && v.n.toString().replace("-", "").length <= 9) return Q.str(v);
    const x = Q.toNumber(v);
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e7) return String(Number(x.toPrecision(6)));
    const [m, e] = x.toExponential(5).split("e");
    return `${Number(m)}×10^${Number(e)}`;
  }

  /**
   * The interpretation of a record's inputs. `data.quantities` is data/quantities.json.
   * @returns {any}
   */
  function interpret(inp, data) {
    const quantities = Object.fromEntries(data.quantities.quantities.map((q) => [q.id, q]));
    const issues = [];
    const addIssue = (x) => {
      const id = `i-${x.code}-${(x.subject ?? []).join("-")}${x.key ? `-${x.key}` : ""}`;
      if (issues.some((i) => i.id === id)) return;
      issues.push({ severity: "error", blocks: [], subject: [], ...x, id });
    };

    /* ---------- variables ---------- */
    const bySymbol = new Map();
    const variables = inp.variables.map((v) => {
      const ownTex = v.tex && v.tex.length <= 80 && safeTex(v.tex);
      if (v.tex && !ownTex) addIssue({ code: "tex-refused", subject: [v.id], severity: "warning", message: `${v.symbol}: the TeX "${v.tex.slice(0, 40)}" uses a command or a character that the page does not accept for a symbol.`, next: "Use letters, digits, _ ^ { } and the commands for Greek letters, accents and fonts. The page shows the default form now.", blocks: [] });
      const out = { id: v.id, symbol: v.symbol, tex: ownTex ? v.tex : E.nameTex(v.symbol), meaning: v.meaning, kind: v.kind, pi: v.pi !== false, domain: v.domain || "real",
        quantity: v.quantity || "", phase: v.phase || "", role: v.role || "", average: v.average || "", unitText: v.unit || "", dimensionText: v.dimension || "",
        dim: null, temperature: null, affine: null, dimensionless: null, value: null, valueText: v.value || "" };
      const blocks = out.pi ? ["pi-groups", ...EQ_CALCS] : EQ_CALCS;
      if (bySymbol.has(v.symbol)) addIssue({ code: "duplicate-symbol", subject: [v.id, bySymbol.get(v.symbol).id], message: `The symbol ${v.symbol} names two variables.`, next: `Rename one of them.`, blocks });
      bySymbol.set(v.symbol, out);
      const found = [];
      let unit = null;
      if (v.unit) {
        unit = U.parseUnit(v.unit);
        if (unit.error) { addIssue({ code: "unit-syntax", subject: [v.id], message: `${v.symbol}: the unit ${v.unit} cannot be read: ${unit.error}.`, next: "Write the unit as a product of SI units, such as W/(m^2*K).", blocks }); unit = null; }
        else found.push({ from: `the unit ${v.unit}`, dim: unit.dim });
      }
      if (v.dimension) {
        const d = U.parseDimension(v.dimension);
        if (d.error) addIssue({ code: "dimension-syntax", subject: [v.id], message: `${v.symbol}: the dimension ${v.dimension} cannot be read: ${d.error}.`, next: "Write the dimension with M L T Θ I N J, such as M L^-1 T^-1.", blocks });
        else found.push({ from: "the dimension formula", dim: d.dim });
      }
      const qty = v.quantity ? quantities[v.quantity] : null;
      if (v.quantity && !qty) addIssue({ code: "quantity-unknown", subject: [v.id], severity: "warning", message: `${v.symbol}: the quantity "${v.quantity}" is not in the vocabulary.`, next: "Choose a quantity from the list, or leave it empty.", blocks: [] });
      if (qty) found.push({ from: `the quantity ${qty.name}`, dim: U.parseDimension(qty.dim).dim });
      const first = found[0];
      if (first && found.some((f) => !U.deq(f.dim, first.dim))) {
        const groups = [];
        for (const f of found) {
          const g = groups.find((x) => U.deq(x.dim, f.dim));
          if (g) g.from.push(f.from);
          else groups.push({ dim: f.dim, from: [f.from] });
        }
        groups.sort((a, b) => a.from.length - b.from.length);
        const say = (g) => `${g.from.join(" and ")} ${g.from.length > 1 ? "give" : "gives"} ${U.text(g.dim)}`;
        const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
        addIssue({ code: "unit-conflict", subject: [v.id], message: `The entries of ${v.symbol} disagree. ${cap(say(groups[0]))}, but ${groups.slice(1).map(say).join(", and ")}.`,
          next: `Correct the unit, the dimension formula or the quantity of ${v.symbol} so that they agree.`, blocks });
      } else if (first) out.dim = first.dim;
      else addIssue({ code: "missing-dimension", subject: [v.id], message: `${v.symbol} has no unit, dimension or quantity.`, next: `Enter the unit of ${v.symbol}, such as m or W/(m*K).`, blocks });

      // Absolute temperature or temperature difference.
      const qT = qty?.temperature ?? null, uT = unit?.temperature ?? null;
      if (qT && uT && qT !== uT) {
        addIssue({ code: "unit-conflict", subject: [v.id], key: "temperature", message: `${v.symbol}: the quantity is ${qT === "absolute" ? "an absolute temperature" : "a temperature difference"}, but the unit ${v.unit} means ${uT === "absolute" ? "an absolute temperature" : "a temperature difference"}.`,
          next: uT === "absolute" ? `Write the difference in K or delta_degC.` : `Write the absolute temperature in K or degC.`, blocks });
      }
      out.temperature = qT ?? uT;
      if (out.dim && U.deq(out.dim, U.dim({ Θ: 1 })) && !out.temperature) {
        addIssue({ code: "temperature-kind", subject: [v.id], severity: "warning", message: `${v.symbol} has the dimension of temperature, but the model does not say if it is an absolute temperature or a difference.`,
          next: `Choose the quantity "absolute temperature" or "temperature difference" for ${v.symbol}.`, blocks: EQ_CALCS });
      }
      if (unit?.offset && out.temperature === "absolute") out.affine = unit.notes.length ? (v.unit.includes("F") ? "°F" : "°C") : null;
      // The meaning of a dimensionless input.
      if (out.dim && U.isNone(out.dim)) {
        out.dimensionless = qty?.meaning ?? unit?.meaning ?? null;
        if (!out.dimensionless && out.pi) addIssue({ code: "dimensionless-meaning", subject: [v.id], severity: "info", message: `${v.symbol} is dimensionless. The model does not say what it means.`, next: `Choose its quantity: angle, aspect ratio, fraction or a material parameter such as emissivity.`, blocks: [] });
      }
      // The value in SI.
      if (v.value) {
        const pv = parseValue(v.value);
        if (pv?.error) addIssue({ code: "value-syntax", subject: [v.id], message: `${v.symbol}: ${pv.error}`, next: "Enter a number such as 0.05, or a range such as 0.01..0.1.", blocks: [] });
        else if (pv) {
          const conv = (x) => (unit ? U.toSI(x, unit, out.temperature) : { exact: true, value: x });
          const lo = conv(pv.lo), hi = conv(pv.hi);
          if (lo.exact && hi.exact) {
            out.value = { lo: lo.value, hi: hi.value, exact: true, text: Q.eq(lo.value, hi.value) ? num(lo.value) : `${num(lo.value)} to ${num(hi.value)}` };
            const bad = { positive: (x) => Q.sign(x) <= 0, nonnegative: (x) => Q.sign(x) < 0, negative: (x) => Q.sign(x) >= 0, nonzero: (x) => Q.isZero(x) }[out.domain];
            const zeroInside = out.domain === "nonzero" && Q.sign(lo.value) <= 0 && Q.sign(hi.value) >= 0;
            if ((bad && (bad(lo.value) || bad(hi.value))) || zeroInside) {
              addIssue({ code: "value-domain", subject: [v.id], message: `${v.symbol} = ${out.value.text} is outside its declared domain (${out.domain}).`, next: `Correct the value, or change the domain of ${v.symbol} if the value is right.`, blocks: out.pi ? ["pi-groups"] : [] });
            }
          } else out.value = { exact: false, float: lo.float, text: String(Number(lo.float.toPrecision(6))) };
          if (unit?.offset && out.temperature === "absolute") out.valueNote = `${v.value} ${out.affine} is ${out.value.text} K.`;
        }
      }
      return out;
    });

    /* ---------- declared relations (domains of expressions) ---------- */
    const declaredRel = new Map();
    for (const a of inp.assumptions ?? []) {
      if (!a.relation) continue;
      const r = E.read(a.relation);
      if (r.error || r.ast.k !== "rel") { addIssue({ code: "relation-syntax", subject: [a.id], severity: "warning", message: `The relation "${a.relation}" of ${a.id} cannot be read.`, next: "Write it as an expression, a relation and 0, such as T_i - T_inf != 0.", blocks: [] }); continue; }
      const zeroRight = r.ast.r.k === "num" && Q.isZero(r.ast.r.v);
      if (zeroRight && ["!=", ">", "<"].includes(r.ast.op)) declaredRel.set(E.show(r.ast.l), r.ast.op === ">" ? "positive" : "nonzero");
    }
    const env = (name) => {
      const v = bySymbol.get(name);
      if (!v) return null;
      const rel = declaredRel.get(name);
      return { dim: v.dim, temperature: v.temperature, domain: rel === "positive" ? "positive" : rel === "nonzero" && v.domain !== "positive" ? "nonzero" : v.domain, affine: v.affine };
    };
    const declared = (text) => declaredRel.get(text) ?? null;

    /* ---------- equations and conditions ---------- */
    const texOf = (name) => bySymbol.get(name)?.tex ?? E.nameTex(name);
    function readRelation(item, what) {
      const r = E.read(item.text);
      const out = { id: item.id, kind: item.kind, text: item.text, note: item.note ?? "", domainText: item.domain ?? "", plain: null, tex: null, ast: null, terms: [], dim: null, symbols: [], issues: [] };
      if (r.error) {
        addIssue({ code: "equation-syntax", subject: [item.id], message: `${what} ${item.id} cannot be read: ${r.error}`, next: "Correct the syntax. The page shows the supported syntax under the equations.", blocks: EQ_CALCS });
        return out;
      }
      out.ast = r.ast;
      out.plain = r.plain;
      out.tex = E.tex(r.ast, texOf);
      out.symbols = E.symbols(r.ast);
      const sides = r.ast.k === "rel" ? [["left", r.ast.l], ["right", r.ast.r]] : [["left", r.ast]];
      for (const [side, node] of sides) for (const t of E.terms(node)) {
        const d = E.infer(t.node, env, declared).dim;
        out.terms.push({ side, text: E.show(t.node), tex: E.tex(t.node, texOf), sign: t.sign, dim: d ? U.text(d) : null, dimTex: d ? U.tex(d) : null });
      }
      const inf = E.infer(r.ast, env, declared);
      out.dim = inf.dim ? U.text(inf.dim) : null;
      for (const x of inf.issues) {
        const blocks = x.level === "info" ? [] : EQ_CALCS;
        const next = {
          "undefined-symbol": `Add ${x.symbol} to the variable table with its unit, or correct the name.`,
          "dimension-mismatch": "Compare the dimensions of the terms. Check the order of each derivative and the units of the coefficients.",
          "exponent-dimension": "Make the exponent a dimensionless number.",
          "function-argument": "Divide the argument by a scale of the same dimension.",
          "domain-required": "Declare the domain in the variable table or as a relation in the assumptions.",
          "absolute-temperature-sum": "Write the equation with temperature differences.",
          "absolute-temperature-scale": "No action: the tool converts the value. Check that the model uses the absolute temperature here on purpose.",
        }[x.code];
        addIssue({ code: x.code, subject: [item.id, ...(x.symbol ? [x.symbol] : [])], severity: x.level === "info" ? "info" : x.code === "domain-required" ? "warning" : "error",
          message: `${what} ${item.id}: ${x.message}`, next, blocks, terms: x.terms });
        out.issues.push(x.code);
      }
      return out;
    }
    const equations = (inp.equations ?? []).map((e) => readRelation(e, "Equation"));
    const conditions = (inp.conditions ?? []).map((c) => {
      const out = { ...readRelation(c, "Condition"), at: c.at ?? "", atVar: null, atTex: "" };
      const at = E.read(c.at ?? "");
      if (at.error || at.ast.k !== "rel" || at.ast.op !== "=" || at.ast.l.k !== "sym") {
        addIssue({ code: "condition-location", subject: [c.id], message: `Condition ${c.id}: the location "${c.at ?? ""}" is not of the form x = 0.`, next: "Write where the condition holds, such as x = L or t = 0.", blocks: EQ_CALCS });
      } else {
        out.atVar = at.ast.l.name;
        out.atTex = E.tex(at.ast, texOf);
        const v = bySymbol.get(out.atVar);
        if (!v) addIssue({ code: "undefined-symbol", subject: [c.id, out.atVar], message: `Condition ${c.id}: ${out.atVar} is not in the variable table.`, next: `Add ${out.atVar} to the variable table as a coordinate.`, blocks: EQ_CALCS });
        else if (v.kind !== "coordinate") addIssue({ code: "condition-location", subject: [c.id], message: `Condition ${c.id} holds at ${c.at}, but ${out.atVar} is not a coordinate.`, next: `Set the kind of ${out.atVar} to coordinate, or correct the location.`, blocks: EQ_CALCS });
      }
      return out;
    });

    /* ---------- structure: fields, coordinates, derivative orders ---------- */
    const isField = (s) => bySymbol.get(s)?.kind === "field";
    const isCoord = (s) => bySymbol.get(s)?.kind === "coordinate";
    const isTimeVar = (x) => { const v = bySymbol.get(x); return Boolean(v && (v.quantity === "time" || (v.dim && U.deq(v.dim, U.dim({ T: 1 }))))); };
    const model = { type: "variable list", fields: [], defined: [], coordinates: [], orders: {} };
    const MODEL_KINDS = ["governing", "constitutive", "closure", "source"];
    const governing = equations.filter((e) => e.ast && e.kind === "governing");
    const fieldSet = new Set(), coordSet = new Set(), definedSet = new Set();
    for (const e of equations) {
      if (!e.ast || e.kind === "constraint") continue;
      for (const s of e.symbols) {
        if (isCoord(s)) coordSet.add(s);
        if (isField(s)) (MODEL_KINDS.includes(e.kind) ? fieldSet : definedSet).add(s);
      }
    }
    model.fields = [...fieldSet];
    model.defined = [...definedSet].filter((f) => !fieldSet.has(f));
    model.coordinates = [...coordSet];

    // A field closed by a law of its own (q = -k*d(T,x)): its derivatives count as derivatives of the fields in the law.
    const laws = new Map();
    for (const e of equations) {
      if (!e.ast || e.ast.k !== "rel" || e.ast.op !== "=" || !["constitutive", "closure", "definition"].includes(e.kind)) continue;
      if (e.ast.l.k === "sym" && isField(e.ast.l.name)) laws.set(e.ast.l.name, e.ast.r);
    }
    const ordersIn = (ast, depth = 0) => {
      const out = {};
      const bump = (f, x, k) => { out[f] = out[f] ?? {}; out[f][x] = Math.max(out[f][x] ?? 0, k); };
      for (const d of E.derivatives(ast)) {
        if (!d.field) continue;
        for (const [x, k] of Object.entries(d.order)) bump(d.field, x, k);
        if (laws.has(d.field) && depth < 3) {
          for (const [g, o] of Object.entries(ordersIn(laws.get(d.field), depth + 1))) for (const [x, k] of Object.entries(o)) bump(g, x, k + (d.order[x] ?? 0));
        }
      }
      return out;
    };
    // The field each governing equation determines: the one with a time derivative, else the highest derivative.
    const determined = new Map();
    for (const e of governing) {
      const o = ordersIn(e.ast);
      const fields = Object.keys(o).filter((f) => isField(f) && !laws.has(f));
      const timed = fields.find((f) => Object.keys(o[f]).some(isTimeVar));
      const top = timed ?? fields.sort((a, b) => Object.values(o[b]).reduce((s, k) => s + k, 0) - Object.values(o[a]).reduce((s, k) => s + k, 0))[0] ?? e.symbols.find(isField);
      if (top) determined.set(top, e.id);
      if (top && o[top]) for (const [x, k] of Object.entries(o[top])) { model.orders[top] = model.orders[top] ?? {}; model.orders[top][x] = Math.max(model.orders[top][x] ?? 0, k); }
    }
    const derivCoords = new Set(equations.filter((e) => e.ast && MODEL_KINDS.includes(e.kind)).flatMap((e) => E.derivatives(e.ast).flatMap((d) => Object.keys(d.order))));
    model.type = !equations.length ? "variable list" : derivCoords.size >= 2 ? "PDE" : derivCoords.size === 1 ? "ODE" : "algebraic";

    // Conditions: a field with derivative order p in a coordinate needs p conditions in that coordinate. An interface
    // condition couples the fields on its two sides, so each of its n fields counts it as 1/n of a condition.
    model.conditionCount = [];
    const fieldsIn = (c) => c.symbols.filter((s) => model.orders[s]).length || 1;
    for (const [field, orders] of Object.entries(model.orders)) {
      for (const [x, p] of Object.entries(orders)) {
        const isTime = isTimeVar(x);
        const touching = conditions.filter((c) => c.atVar === x && c.symbols.includes(field));
        const sum = touching.reduce((s, c) => s + (c.kind === "interface" ? 1 / fieldsIn(c) : 1), 0);
        const given = { length: Math.round(sum * 1000) / 1000 };
        const places = [...new Set(touching.map((c) => c.at.replace(/\s+/g, " ").trim()))];
        model.conditionCount.push({ field, coordinate: x, order: p, needed: p, given: given.length, kind: isTime ? "initial" : "boundary", places });
        const noun = isTime ? (p === 1 ? "initial condition" : "initial conditions") : (p === 1 ? "boundary condition" : "boundary conditions");
        if (given.length < p) {
          addIssue({ code: "missing-conditions", subject: [field, x], message: `${field} has a derivative of order ${p} in ${x}, so it needs ${p} ${noun} in ${x}. The model gives ${given.length}${places.length ? ` (at ${places.join(", ")})` : ""}.`,
            next: isTime ? `Add the initial condition of ${field}, such as ${field} = ${field}_i at ${x} = 0.` : `Add a condition on ${field} at the other end of the ${x} domain, such as a surface condition at ${x} = L.`,
            blocks: EQ_CALCS });
        } else if (given.length > p) {
          addIssue({ code: "extra-conditions", subject: [field, x], severity: "warning", message: `${field} has a derivative of order ${p} in ${x}, but the model gives ${given.length} conditions in ${x} (at ${places.join(", ")}).`,
            next: `Check the order of the ${x} derivative in the governing equation, or remove a condition.`, blocks: [] });
        }
      }
    }

    // Closure: each field needs an equation of its own: a governing equation or a law.
    const open = model.fields.filter((f) => !determined.has(f) && !laws.has(f));
    if (open.length) {
      addIssue({ code: "incomplete-closure", subject: open, message: `No equation determines the field${open.length > 1 ? "s" : ""} ${open.join(", ")}. The model fields are ${model.fields.join(", ")}.`,
        next: `Add a constitutive law or closure for ${open.join(", ")}, such as ${open[0] === "q" ? "Fourier's law, q = -k*d(T,x) in the equation syntax" : `an equation for ${open[0]}`}.`, blocks: EQ_CALCS });
    }

    // Definitions with values: both sides in SI, exact.
    const definitionChecks = [];
    for (const e of equations) {
      if (!e.ast || e.ast.k !== "rel" || e.ast.op !== "=" || !["definition", "constraint"].includes(e.kind)) continue;
      const vals = e.symbols.map((s) => bySymbol.get(s)?.value);
      if (vals.some((x) => !x || !x.exact || !Q.eq(x.lo, x.hi))) continue;
      const at = (s) => bySymbol.get(s).value.lo;
      const l = evaluate(e.ast.l, at), r = evaluate(e.ast.r, at);
      if (!l || !r) continue;
      const ok = Q.eq(l, r);
      definitionChecks.push({ id: e.id, ok, left: num(l), right: num(r), text: e.plain });
      if (!ok) addIssue({ code: "definition-values", subject: [e.id], severity: "warning", message: `Equation ${e.id} (${e.plain}): the left side is ${num(l)} and the right side is ${num(r)} in SI units.`, next: "Correct one of the values so that the definition holds.", blocks: [] });
    }

    /* ---------- purpose and the intended calculation ---------- */
    const purpose = inp.purpose ?? {};
    const piVars = variables.filter((v) => v.pi);
    const observable = variables.find((v) => v.id === purpose.observable) ?? null;
    if (!observable) addIssue({ code: "observable-missing", subject: [], message: "The model names no quantity of interest.", next: "Choose the quantity of interest in the purpose.", blocks: ["pi-groups"] });
    else if (!observable.pi) addIssue({ code: "observable-missing", subject: [observable.id], message: `The quantity of interest ${observable.symbol} is not in the Pi set.`, next: `Include ${observable.symbol} in the Pi set.`, blocks: ["pi-groups"] });
    if (piVars.length < 2) addIssue({ code: "pi-set-small", subject: [], message: `The Pi set has ${piVars.length} variable${piVars.length === 1 ? "" : "s"}.`, next: "Include at least 2 physical variables in the Pi set.", blocks: ["pi-groups"] });
    const calc = CALCS.find((c) => c.id === purpose.calculation) ?? CALCS[0];
    // A declared model brings its own solver: only a custom PDE is outside the supported set for these two analyses.
    const customPde = (calc.id === "stability" || calc.id === "bifurcation") && model.type === "PDE" && !purpose.declaration;
    if (calc.piece > CURRENT_PIECE || customPde) {
      if (customPde) {
        addIssue({ code: "unsupported-analysis", subject: [calc.id], message: `${calc.name} of a custom PDE is outside the supported set, also after the later pieces. The page supports it for declared models and for custom finite ODE systems.`,
          next: "Write the model as a finite ODE system, such as a lumped body. Or use a declared model, such as boussinesq-box for buoyancy convection. The Finder result stays valid.", blocks: [calc.id] });
      } else {
        addIssue({ code: "planned-analysis", subject: [calc.id], severity: "warning", message: `Piece ${calc.piece} of the build plan adds ${calc.name.toLowerCase()}. This preview runs the Finder, the Nondimensionalizer, the regime analyses and the stability and bifurcation analyses of the declared models.`,
          next: "Use the Finder, the Nondimensionalizer or the Regime Map Builder now. The model keeps the intended calculation for the later piece.", blocks: [calc.id] });
      }
    }

    /* ---------- what each calculation needs ---------- */
    const calcs = CALCS.map((c) => {
      const blockedBy = issues.filter((i) => i.blocks.includes(c.id) && i.severity !== "info").map((i) => i.id);
      const available = c.piece <= CURRENT_PIECE;
      return { ...c, available, ready: available && !blockedBy.length, blockedBy, intended: c.id === calc.id };
    });

    return { variables, equations, conditions, geometry: inp.geometry ?? {}, purpose, observable: observable?.id ?? null, assumptions: inp.assumptions ?? [],
      model, definitionChecks, issues, calcs, piVariables: piVars.map((v) => v.id) };
  }

  /** The exact value of an algebraic tree (+ - * / and integer powers) at rational values, or null. */
  function evaluate(n, at) {
    switch (n.k) {
      case "num": return n.v;
      case "sym": return at(n.name);
      case "neg": { const a = evaluate(n.a, at); return a && Q.neg(a); }
      case "add": {
        let s = Q.ZERO;
        for (const t of n.terms) { const v = evaluate(t, at); if (!v) return null; s = Q.add(s, v); }
        return s;
      }
      case "mul": {
        let p = Q.ONE;
        for (const f of n.num) { const v = evaluate(f, at); if (!v) return null; p = Q.mul(p, v); }
        for (const f of n.den) { const v = evaluate(f, at); if (!v || Q.isZero(v)) return null; p = Q.div(p, v); }
        return p;
      }
      case "pow": {
        const b = evaluate(n.b, at), e = evaluate(n.e, at);
        if (!b || !e || !Q.isInteger(e) || (Q.isZero(b) && Q.sign(e) < 0)) return null;
        return Q.pow(b, e.n);
      }
      default: return null;
    }
  }

  return { CALCS, EQ_CALCS, CURRENT_PIECE, parseValue, num, interpret, evaluate };
});
