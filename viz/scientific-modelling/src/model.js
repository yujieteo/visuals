/* Scientific Modelling: the page's model for the shared kit (scripts/kit/kit.js). The kit's state is the view:
 * the example, the tool, the researcher's repeating set, the row-reduction step, the basis shown and the detail
 * level, all in the URL. The model record itself (src/record.js) is the researcher's, kept in this browser and in
 * the model JSON. derive(state, data, record) interprets the record's current version, runs the Finder on the
 * confirmed version, marks the results that a later edit invalidates, and returns plain data that the view, the
 * Markdown report and the beamdswitch deck all read, so the three outputs show the same values and statuses.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./rational.js"), require("./units.js"), require("./record.js"), require("./check.js"), require("./finder.js"));
  } else root.Model = factory(root.SM.Q, root.SM.U, root.SM.R, root.SM.C, root.SM.F);
})(typeof self !== "undefined" ? self : this, function (Q, U, R, C, F) {
  "use strict";

  const SLUG = "scientific-modelling";
  const SCHEMA_VERSION = 1;
  const EXAMPLE_IDS = ["heat-transfer-pi", "straight-fin", "transient-slab", "fail-dimensions", "fail-zero-scale", "fail-dependent", "fail-conditions", "fail-entry", "fail-unsupported"];
  const EXAMPLE_LABELS = ["Convection: Pi groups", "Straight fin", "Transient slab", "Failure: inconsistent dimensions", "Failure: zero scale", "Failure: dependent inputs",
    "Failure: missing conditions", "Failure: entry errors", "Failure: unsupported analysis"];
  const MAX_STEP = 60;

  /** The view state (§5): every field is in the URL when it differs from its default. */
  const FIELDS = {
    example: { type: "enum", default: EXAMPLE_IDS[0], values: EXAMPLE_IDS, label: "Example" },
    tool: { type: "enum", default: "finder", values: ["finder", "nondim", "regime"], label: "Tool" },
    repeating: { type: "string", default: "", label: "Repeating variables (symbols, comma-separated; empty for the automatic set)" },
    step: { type: "integer", default: 0, min: 0, max: MAX_STEP, step: 1, label: "Row-reduction step" },
    basis: { type: "enum", default: "familiar", values: ["familiar", "direct", "kernel"], label: "Basis shown" },
    detail: { type: "enum", default: "short", values: ["short", "full"], label: "Derivation detail" },
  };
  const EXAMPLES = EXAMPLE_IDS.map((id, i) => ({ id, label: EXAMPLE_LABELS[i], state: { example: id } }));
  const TOOLS = { finder: "Dimensionless Number Finder", nondim: "Model Nondimensionalizer", regime: "Regime Map Builder" };
  const BASES = { familiar: "familiar basis", direct: "repeating-variable basis", kernel: "row-reduced basis" };

  /** The data the engine reads, from the page's dataset (raw.json). */
  const engineData = (data) => ({ examples: data.examples, quantities: data.quantities, groups: data.groups });

  /** The repeating set of the state as variable ids, from symbols. */
  function repeatingIds(text, variables) {
    const names = String(text ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return null;
    return names.map((s) => variables.find((v) => v.symbol === s)?.id ?? `?${s}`);
  }

  /** The interpretation as plain data: dimensions and values as text, no syntax trees. */
  function plainInterp(it) {
    return {
      variables: it.variables.map((v) => ({ id: v.id, symbol: v.symbol, tex: v.tex, meaning: v.meaning, kind: v.kind, pi: v.pi, domain: v.domain, quantity: v.quantity, phase: v.phase,
        unit: v.unitText, dimension: v.dimensionText, dim: v.dim ? U.text(v.dim) : null, dimTex: v.dim ? U.tex(v.dim) : null, temperature: v.temperature, affine: v.affine,
        dimensionless: v.dimensionless, value: v.value ? v.value.text : null, valueNote: v.valueNote ?? null })),
      equations: it.equations.map(({ ast, ...e }) => ({ ...e, plain: e.plain ?? null, tex: e.tex ?? null })),
      conditions: it.conditions.map(({ ast, ...c }) => ({ ...c, plain: c.plain ?? null, tex: c.tex ?? null })),
      geometry: it.geometry, purpose: it.purpose, observable: it.observable, assumptions: it.assumptions,
      model: it.model, definitionChecks: it.definitionChecks,
      issues: it.issues.map((i) => ({ id: i.id, code: i.code, severity: i.severity, subject: i.subject, message: i.message, next: i.next ?? "", blocks: i.blocks, terms: i.terms ?? null })),
      calcs: it.calcs,
    };
  }

  /** The reference case of data/references.json that has the same Pi set, or null. */
  function referenceFor(finder, refs) {
    if (!finder || !finder.ready || !refs) return null;
    const symbols = finder.vars.map((v) => v.symbol);
    return refs.cases.find((c) => c.symbols.join(",") === symbols.join(",") && c.D.length === finder.D.length && c.D.every((row, i) => row.join(",") === finder.D[i].join(","))) ?? null;
  }

  /**
   * Everything the page shows, from the view state, the dataset and the model record (the example's record when
   * none is given). Plain data: no BigInt, no undefined.
   */
  function derive(state, data, record) {
    const D = engineData(data);
    const rec = record ?? R.fromExample(D, state.example);
    const current = R.inputs(rec);
    const interp = C.interpret(current, D);
    const confirmed = R.isConfirmed(rec);
    const base = rec.confirmed ? rec.confirmed.inputs : null;
    const interpBase = base ? (confirmed ? interp : C.interpret(base, D)) : null;
    const changes = base && !confirmed ? R.diff(base, current) : { added: [], removed: [], changed: [], all: [] };
    const repeating = interpBase ? repeatingIds(state.repeating, interpBase.variables) : null;
    const finder = interpBase ? F.find(interpBase, { repeating, preferred: base.preferred, groups: D.groups.groups, confirmed: rec.interpretations ?? {} }) : null;
    const ref = referenceFor(finder, data.references);

    /* ---------- results: the Analyses item, each with status, inputs, steps and evidence ---------- */
    const results = [];
    const add = (r) => {
      const inputs = r.inputs ?? [];
      const hit = inputs.filter((id) => changes.all.includes(id));
      results.push({ evidence: [], steps: [], tex: null, ...r, inputs, valid: !hit.length, invalidatedBy: hit });
    };
    const piInputs = interpBase ? [...interpBase.piVariables, "purpose", "preferred"] : [];
    add({ id: "r-interpretation", kind: "interpretation", title: confirmed ? `The researcher confirmed the interpretation of version ${rec.version}.` : `The interpretation of version ${rec.version} is not confirmed.`,
      status: confirmed ? "confirmed" : "proposed", inputs: [] });
    for (const e of interp.equations) {
      const bad = e.issues.filter((c) => c !== "absolute-temperature-scale");
      const undef = interp.issues.filter((i) => i.code === "undefined-symbol" && i.subject[0] === e.id).map((i) => i.subject[1]);
      add({ id: `r-eq-${e.id}`, kind: "equation-check", title: !e.plain ? `The page cannot read equation ${e.id}.` : undef.length ? `The page cannot check equation ${e.id}, because ${undef.join(", ")} ${undef.length > 1 ? "are" : "is"} not in the variable table.` : bad.length ? `Equation ${e.id} fails its dimension check.` : `Equation ${e.id} is dimensionally consistent: every term has dimension ${e.dim ?? "?"}.`,
        status: bad.length || !e.plain ? "unresolved" : "exact", inputs: [e.id, ...e.symbols.map((s) => interp.variables.find((v) => v.symbol === s)?.id).filter(Boolean)], steps: [], evidence: ["spec-3"], current: true });
    }
    for (const c of interp.conditions) {
      const bad = c.issues.filter((x) => x !== "absolute-temperature-scale");
      if (!c.plain) continue;
      const undef = interp.issues.filter((i) => i.code === "undefined-symbol" && i.subject[0] === c.id).map((i) => i.subject[1]);
      add({ id: `r-eq-${c.id}`, kind: "equation-check", title: undef.length ? `The page cannot check condition ${c.id}, because ${undef.join(", ")} ${undef.length > 1 ? "are" : "is"} not in the variable table.` : bad.length ? `Condition ${c.id} fails its dimension check.` : `Condition ${c.id} is dimensionally consistent.`,
        status: bad.length ? "unresolved" : "exact", inputs: [c.id], evidence: ["spec-3"], current: true });
    }
    for (const cc of interp.model.conditionCount ?? []) {
      add({ id: `r-count-${cc.field}-${cc.coordinate}`, kind: "condition-count", title: `${cc.field} needs ${cc.needed} ${cc.kind} condition${cc.needed === 1 ? "" : "s"} in ${cc.coordinate}, ${cc.given === cc.needed ? "and the model gives" : cc.given < cc.needed ? "but the model gives only" : "but the model gives"} ${cc.given}.`,
        status: cc.given === cc.needed ? "exact" : "unresolved", inputs: interp.conditions.map((c) => c.id), evidence: ["spec-3"], current: true });
    }
    for (const d of interp.definitionChecks) {
      const text = F.plainLabel(d.text, interp.variables);
      add({ id: `r-def-${d.id}`, kind: "definition-check", title: d.ok ? `The values satisfy ${text} exactly: ${d.left} = ${d.right} in SI units.` : `The values do not satisfy ${text}. The two sides are ${d.left} and ${d.right} in SI units.`,
        status: d.ok ? "exact" : "unresolved", inputs: [d.id], evidence: ["spec-3"], current: true });
    }
    if (finder && finder.ready) {
      add({ id: "r-rank", kind: "rank", title: `rank D = ${finder.r}, so ${finder.n} − ${finder.r} = ${finder.m} independent groups.`, status: "exact", inputs: piInputs, steps: ["s-pi-matrix", "s-pi-rref", "s-pi-kernel"], evidence: ["spec-4", "mit-pi"] });
      finder.groups.forEach((g, i) => {
        add({ id: `r-group-${g.id}`, kind: "group", title: `Π${i + 1} = ${g.label} is dimensionless: D a = 0.`, tex: `\\Pi_{${i + 1}}=${g.tex}`, status: "exact", inputs: piInputs, steps: ["s-pi-exponents", "s-pi-checks"], evidence: ["spec-4"] });
        for (const nm of g.names) {
          const isConfirmed = g.confirmed === nm.id;
          add({ id: `r-name-${g.id}-${nm.id}`, kind: "name", title: `${g.label} matches the stored formula of the ${nm.name}, ${nm.plain}${nm.power < 0 ? ", as its reciprocal" : ""}.${nm.assumes.length ? ` This match assumes that ${nm.assumes.join(" and that ")}.` : ""}`,
            tex: `${g.tex}=${nm.tex}`, status: isConfirmed ? "confirmed" : "proposed", inputs: g.contains, steps: ["s-pi-familiar"], evidence: [nm.source], group: g.id, name: nm.id, key: g.key });
        }
      });
      if (finder.familiar) add({ id: "r-basis", kind: "basis", title: `The familiar basis ${finder.familiar.groups.map(groupLabel).join(", ")} is equivalent to the repeating-variable basis: det T = ${finder.familiar.det}.`,
        status: "exact", inputs: piInputs, steps: ["s-pi-familiar"], evidence: ["spec-5"] });
      if (finder.constraints.items.length) {
        const fixed = finder.m - finder.constraints.free;
        add({ id: "r-free", kind: "constraints", title: `The ${finder.m} groups are algebraically independent, but only ${finder.constraints.free} of them can vary. ${finder.constraints.items.length === 1 ? "The relation" : `The ${finder.constraints.items.length} relations`} ${finder.constraints.items.map((c) => c.label).join(", ")} ${finder.constraints.items.length === 1 ? "fixes" : "fix"} ${fixed} group${fixed === 1 ? "" : "s"}.`,
          status: "exact", inputs: [...piInputs, ...finder.constraints.items.map((c) => c.id)], steps: ["s-pi-constraints"], evidence: ["mit-pi"] });
      }
      if (ref) {
        add({ id: "r-reference", kind: "reference", title: `SymPy ${data.references.versions.sympy} gives the same matrix D, rank ${ref.rank} and a kernel of the same span${ref.det_DR !== null && ref.preferred.join(",") === finder.repeating.symbols.join(",") ? `, and det D_R = ${ref.det_DR}` : ""}.`,
          status: "exact", inputs: piInputs, steps: ["s-pi-kernel"], evidence: [] });
      }
      const valued = finder.groups.filter((g) => g.value);
      if (valued.length) {
        add({ id: "r-values", kind: "values", title: `The entered values give ${valued.map((g) => `${g.label} = ${valueText(g.value)}`).join(", ")}.`, status: valued.every((g) => g.value.exact) ? "exact" : "numerical", inputs: piInputs, steps: ["s-pi-checks"] });
        const floats = valued.filter((g) => g.value.exact && !g.value.undefined && g.value.lo === g.value.hi).map((g) => {
          const f = Object.entries(g.exps).reduce((p, [id, e]) => p * Q.toNumber(interpBase.variables.find((v) => v.id === id).value.lo) ** Q.toNumber(Q.parse(e)), 1);
          return Math.abs(f - g.value.loFloat) <= 1e-12 * Math.max(1, Math.abs(g.value.loFloat));
        });
        if (floats.length) add({ id: "r-values-float", kind: "values", title: `A floating-point evaluation of each group value agrees with the exact value within a relative tolerance of 1e-12.`, status: "numerical", inputs: piInputs, steps: ["s-pi-checks"], tolerance: "1e-12", passed: floats.every(Boolean) });
      }
      if (finder.correlation.relation) {
        add({ id: "r-relation", kind: "relation", title: "Buckingham Pi analysis gives the groups of the relation, but not the function f. Data or a solved model must supply f.", tex: finder.correlation.relation,
          status: "evidence", inputs: piInputs, steps: ["s-pi-correlation"], evidence: ["mit-pi"] });
      }
    }
    // Calculations the record asks for that this piece cannot run, or that a failed check blocks.
    for (const c of interp.calcs) {
      if (c.ready || (!c.available && !c.intended)) continue;
      const why = c.blockedBy.map((id) => interp.issues.find((i) => i.id === id)).filter(Boolean);
      const unsupported = why.some((i) => i.code === "unsupported-analysis");
      add({ id: `r-calc-${c.id}`, kind: "calculation", title: `${c.name}: ${unsupported ? "not supported for this model" : !c.available ? `piece ${c.piece} of the build plan adds it` : "blocked"}${why.length && !(why.length === 1 && why[0].code === "planned-analysis") ? `. Failed check: ${why.map((i) => i.message).join(" ")}` : "."}`,
        status: "unresolved", inputs: [], next: why[0]?.next ?? (c.available ? "" : "Use the Finder now."), current: true });
    }

    /* ---------- the view model: text both the page and the report read ---------- */
    const counts = Object.fromEntries(Object.keys(R.STATUS).map((k) => [k, results.filter((r) => r.status === k).length]));
    const steps = finder && finder.ready ? finder.rref.steps.length : 0;
    const shownStep = Math.min(state.step, steps);
    const zero = finder && finder.ready ? finder.repeating.excluded.filter((e) => e.preferred && /must not be 0/.test(e.reason)) : [];
    const zeroNote = zero.length && finder.repeating.complete ? zero.map((e) => {
      const g = finder.groups.find((x) => x.contains.includes(e.id));
      const exp = g ? Number(Object.entries(g.exps).find(([id]) => id === e.id)?.[1] ?? 0) : 0;
      return `${e.label} cannot be a reference scale: ${e.reason}. The Finder uses ${finder.repeating.labels.join(", ")} instead. ${e.label} now appears only in ${g ? g.label : "one group"}${exp > 0 ? `, with a positive exponent. Thus ${g?.names[0] ? g.names[0].id : "this group"} = 0 is a valid value` : ""}. Thus no group uses ${e.label} as a scale.`;
    }) : [];
    const basisGroups = !finder || !finder.ready ? [] : state.basis === "direct" ? finder.groups : state.basis === "kernel" ? finder.kernel : (finder.familiar ? finder.familiar.groups : finder.groups);

    return {
      title: rec.title, origin: rec.origin, version: rec.version, confirmed, confirmedVersion: rec.confirmed ? rec.confirmed.version : null,
      edited: rec.version > 1 || rec.origin !== state.example, tool: state.tool, toolName: TOOLS[state.tool], basis: state.basis, basisName: BASES[state.basis],
      interp: plainInterp(interp), finder, results, counts, changes, steps, shownStep, zeroNote, basisGroups,
      reference: ref ? { versions: data.references.versions, rank: ref.rank, groups: ref.groups, det: ref.det_DR } : null,
      history: rec.history, previousVersion: rec.previous ? rec.previous.version : null,
      previousDiff: rec.previous ? R.diff(rec.previous.inputs, current) : null,
      settings: rec.settings,
    };
  }

  /** The plain label of a group: its familiar name when it has one (the confirmed one first), else its formula. */
  function groupLabel(g) {
    const nm = (g.confirmed && g.names.find((x) => x.id === g.confirmed)) || g.names[0];
    return nm ? nm.label : g.label;
  }

  /** "1/160 (0.00625)" or a range. */
  function valueText(v) {
    if (!v) return "";
    if (v.undefined) return v.text;
    if (!v.exact) return `${v.text} (floating point)`;
    const one = (s, f) => (s && /\//.test(s) && s.length <= 12 ? `${s} = ${short(f)}` : short(f));
    return v.lo === v.hi ? one(v.fraction, v.loFloat) : `${short(v.loFloat)} to ${short(v.hiFloat)}`;
  }
  const short = (x) => (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e7 || x === 0 ? String(Number(x.toPrecision(6))) : x.toExponential(4));

  return { SLUG, SCHEMA_VERSION, FIELDS, EXAMPLES, TOOLS, BASES, MAX_STEP, engineData, repeatingIds, derive, valueText, groupLabel };
});
