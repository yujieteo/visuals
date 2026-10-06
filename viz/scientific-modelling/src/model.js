/* Scientific Modelling: the page's model for the shared kit (scripts/kit/kit.js). The kit's state is the view:
 * the example, the tool, the researcher's repeating set, the row-reduction step, the basis shown and the detail
 * level, all in the URL. The model record itself (src/record.js) is the researcher's, kept in this browser and in
 * the model JSON; it also holds the scales the researcher chose and the declared model it follows. derive(state,
 * data, record) interprets the record's current version, runs the Finder, the Nondimensionalizer and the regime
 * analyses of its declared model (src/regime.js) and the stability and bifurcation analyses (src/stability.js) on the
 * confirmed version, marks the results that a later edit
 * invalidates, and returns plain data that the view, the Markdown report and the beamdswitch deck all read, so the
 * three outputs show the same values and statuses. The map's own view (axes, scales, fixed values, tolerance, point
 * and boundary) and the catalogue's selected declaration are in the URL too.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./rational.js"), require("./units.js"), require("./record.js"), require("./check.js"), require("./finder.js"), require("./nondim.js"), require("./sym.js"),
      require("./regime.js"), require("./stability.js"));
  } else root.Model = factory(root.SM.Q, root.SM.U, root.SM.R, root.SM.C, root.SM.F, root.SM.N, root.SM.S, root.SM.RM, root.SM.ST);
})(typeof self !== "undefined" ? self : this, function (Q, U, R, C, F, N, S, RM, ST) {
  "use strict";

  const SLUG = "scientific-modelling";
  const SCHEMA_VERSION = 1;
  const EXAMPLE_IDS = ["heat-transfer-pi", "straight-fin", "transient-slab", "lumped-body", "transient-cylinder", "transient-sphere", "volumetric-source", "multilayer-wall",
    "rayleigh-benard", "enclosure-convection", "lumped-radiation", "surface-radiation", "convection-radiation", "custom-ignition", "custom-lorenz",
    "euler-column", "beam-deflection", "elastica", "damped-oscillator", "beam-modes", "navier-plate", "cylindrical-shell", "thermal-rod", "thermal-plate",
    "pipe-flow", "channel-flow", "nozzle-flow", "hydraulic-jump", "blasius-plate", "airfoil-flow",
    "advection-channel", "couette-heating", "thermocapillary-flow", "conjugate-channel", "plate-convection", "tube-convection", "natural-wall", "mixed-convection",
    "fail-dimensions", "fail-zero-scale", "fail-zero-temperature-scale", "fail-dependent", "fail-conditions", "fail-entry", "fail-unsupported", "fail-plastic", "fail-nozzle-shock", "fail-jump-subcritical", "fail-airfoil-stall", "fail-dry-bed", "fail-plate-transition", "fail-surface-loss"];
  const EXAMPLE_LABELS = ["Convection: Pi groups", "Straight fin", "Transient slab", "Lumped body", "Transient cylinder", "Transient sphere", "Volumetric source", "Multilayer wall",
    "Rayleigh–Bénard convection", "Natural convection in an enclosure", "Lumped body with radiation", "Surface radiation", "Convection and radiation", "Custom ODE: ignition", "Custom ODE: Lorenz system",
    "Euler column", "Beam under a uniform load", "Nonlinear buckling: the elastica", "Damped oscillator", "Beam vibration modes", "Rectangular plate", "Cylindrical shell", "Heated rod", "Heated plate",
    "Pipe flow", "Channel flow", "Nozzle flow", "Hydraulic jump", "Flat-plate boundary layer", "Airfoil in potential flow",
    "Advection–diffusion in a channel", "Couette flow with viscous heating", "Thermocapillary flow in a layer", "Conjugate fluid–solid channel", "Forced convection over a plate", "Forced convection in a tube", "Natural convection at a vertical wall", "Mixed convection in a vertical channel",
    "Failure: inconsistent dimensions", "Failure: zero scale", "Failure: zero temperature scale", "Failure: dependent inputs", "Failure: missing conditions", "Failure: entry errors",
    "Failure: unsupported analysis", "Failure: plastic collapse", "Failure: shock in the nozzle", "Failure: no jump from a slow flow", "Failure: airfoil at a large angle", "Failure: flow over a dry bed", "Failure: plate in the transition range", "Failure: heat loss at the free surface"];
  const MAX_STEP = 60;

  /** The view state (§5): every field is in the URL when it differs from its default. */
  const FIELDS = {
    example: { type: "enum", default: EXAMPLE_IDS[0], values: EXAMPLE_IDS, label: "Example" },
    tool: { type: "enum", default: "finder", values: ["finder", "nondim", "regime", "catalogue"], label: "Tool" },
    repeating: { type: "string", default: "", label: "Repeating variables (symbols, comma-separated; empty for the automatic set)" },
    step: { type: "integer", default: 0, min: 0, max: MAX_STEP, step: 1, label: "Row-reduction step" },
    basis: { type: "enum", default: "familiar", values: ["familiar", "direct", "kernel"], label: "Basis shown" },
    detail: { type: "enum", default: "short", values: ["short", "full"], label: "Derivation detail" },
    map_x: { type: "string", default: "", label: "Regime map: the parameter on the x-axis (empty for the declared default)" },
    map_y: { type: "string", default: "", label: "Regime map: the parameter on the y-axis (empty for the declared default, none for a 1D diagram)" },
    x_scale: { type: "enum", default: "auto", values: ["auto", "log", "linear"], label: "Regime map: scale of the x-axis" },
    y_scale: { type: "enum", default: "auto", values: ["auto", "log", "linear"], label: "Regime map: scale of the y-axis" },
    fixed: { type: "string", default: "", label: "Regime map: fixed parameter values, such as Bi=0.5, Fo=0.25 (empty for the record's values)" },
    tolerance: { type: "enum", default: "1e-2", values: ["1e-1", "1e-2", "1e-3"], label: "Regime map: tolerance of the approximation error" },
    layers: { type: "string", default: "approximation,balance,stability,bifurcation,empirical,limits", label: "Regime map: the layers shown (approximation, balance, stability, bifurcation, empirical, limits)" },
    shade: { type: "string", default: "", label: "Regime map: the layer whose measure shades the map (empty for the first approximation)" },
    point: { type: "string", default: "", label: "Regime map: the inspected point as x,y (empty for the record's point)" },
    pick: { type: "string", default: "", label: "Regime map: the inspected boundary, as layer:index" },
    family: { type: "string", default: "", label: "Model catalogue: the declared model shown (empty for the record's or the first)" },
  };
  const EXAMPLES = EXAMPLE_IDS.map((id, i) => ({ id, label: EXAMPLE_LABELS[i], state: { example: id } }));
  const TOOLS = { finder: "Dimensionless Number Finder", nondim: "Model Nondimensionalizer", regime: "Regime Map Builder", catalogue: "Model catalogue" };
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
    const nondim = interpBase ? N.nondimensionalize(interpBase, { scales: base.scales ?? [], finder: finder && finder.ready ? finder : null, groups: D.groups.groups, confirmed: rec.interpretations ?? {} }) : null;

    /* ---------- results: the Analyses item, each with status, inputs, steps and evidence ---------- */
    const results = [];
    const add = (r) => {
      const inputs = r.inputs ?? [];
      const hit = inputs.filter((id) => changes.all.includes(id));
      results.push({ evidence: [], steps: [], tex: null, ...r, inputs, valid: !hit.length, invalidatedBy: hit });
    };
    const piInputs = interpBase ? [...new Set([interpBase, interp].flatMap((it) => {
      const syms = new Set(it.variables.filter((v) => it.piVariables.includes(v.id)).map((v) => v.symbol));
      const relations = it.equations.filter((e) => ["definition", "constraint"].includes(e.kind) && (e.symbols ?? []).every((s) => syms.has(s)));
      return [...it.piVariables, ...relations.map((e) => e.id)];
    })), "purpose", "preferred"] : [];
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
          status: "exact", inputs: piInputs, steps: ["s-pi-constraints"], evidence: ["mit-pi"] });
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
    if (nondim && nondim.ready) addNondim(nondim, interpBase, add, piInputs, data.references, rec.origin);
    else if (nondim && !nondim.ready && nondim.reason !== "blocked" && (nondim.reason !== "no-equations" || interpBase.calcs.find((c) => c.id === "nondimensionalize")?.intended)) {
      add({ id: "r-nd-unresolved", kind: "nondim", title: `Nondimensionalization: ${nondim.message}`, status: "unresolved", inputs: interpBase.equations.map((e) => e.id).concat((base.scales ?? []).map((x) => x.id)), next: nondim.next, steps: [], evidence: ["spec-6"] });
    }
    // The regime analyses of the declared model (spec sections 8 to 10): they read the Nondimensionalizer's result.
    const regime = interpBase && nondim ? RM.derive(state, data, { interp: interpBase, nd: nondim, base }) : null;
    for (const r of RM.results(regime)) add(r);
    if (regime && !regime.ready && regime.reason !== "no-declaration" && regime.reason !== "blocked") {
      add({ id: "r-rm-unresolved", kind: "regime", title: `Regime map: ${regime.message}${regime.problems?.length ? ` ${regime.problems.slice(0, 3).join(" ")}` : ""}`, status: "unresolved",
        inputs: ["purpose", ...interpBase.equations.map((e) => e.id), ...interpBase.conditions.map((c) => c.id), ...(base.scales ?? []).map((x) => x.id)], next: regime.next, steps: ["s-rm-declaration"], evidence: ["spec-10"] });
    }
    // Stability and bifurcation (spec section 8, hand calculation 9): the declared model's analysis, or a custom ODE system.
    const stability = interpBase ? ST.derive(state, data, { interp: interpBase, base, regime }) : null;
    for (const r of ST.results(stability)) add(r);
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
      interp: plainInterp(interp), finder, nondim, regime, stability, catalogue: RM.catalogue(data, state.family || rec.purpose?.declaration || "", state.tool === "catalogue" ? (id) => standard(data, D, id) : null), results, counts, changes, steps, shownStep, zeroNote, basisGroups,
      reference: ref ? { versions: data.references.versions, rank: ref.rank, groups: ref.groups, det: ref.det_DR } : null,
      history: rec.history, previousVersion: rec.previous ? rec.previous.version : null,
      previousDiff: rec.previous ? R.diff(rec.previous.inputs, current) : null,
      settings: rec.settings,
    };
  }

  /**
   * The Nondimensionalizer's results: the scales, each dimensionless equation and condition, the parameters and
   * their names, the comparison with the Pi basis, the parameters that enter, and the reverse substitution.
   */
  function addNondim(nd, it, add, piInputs, refs, origin) {
    const idOf = (sym) => it.variables.find((v) => v.symbol === sym)?.id;
    const scaleInputs = nd.scales.map((s) => `s-${s.id}`);
    for (const s of nd.scales) {
      const ids = [`s-${s.id}`, s.id, ...s.chosen.items, ...(s.chosen.symbols ?? []).map(idOf).filter(Boolean)];
      const v = nd.variables.find((x) => x.name === s.name);
      add({ id: `r-nd-scale-${s.id}`, kind: "scale", title: `The scale of ${s.label} is ${s.chosen.label}. ${s.chosen.reason}`, tex: v ? v.defTex : null,
        status: s.status, inputs: [...new Set(ids)], steps: ["s-nd-scales", "s-nd-variables"], evidence: ["spec-6"] });
      if (s.changed) {
        add({ id: `r-nd-refused-${s.id}`, kind: "scale", title: s.changed, status: "unresolved", inputs: [...new Set(ids)], steps: ["s-nd-scales"], evidence: ["spec-6"],
          next: `Make sure that the values are correct. To use a different scale for ${s.label}, enter it in the model's scales.` });
      }
    }
    for (const e of nd.equations) {
      const what = e.cond ? "Condition" : e.output ? "Definition" : "Equation";
      add({ id: `r-nd-eq-${e.id}`, kind: "dimensionless", title: `${what} ${e.id} in dimensionless form${e.factorTex === "1" ? "" : ", after division by its common factor"}.`,
        tex: `${e.dimensionlessTex}${e.at ? `\\quad\\text{at }${e.at.tex}` : ""}`, status: e.dimensionless && e.reverseOk ? "exact" : "unresolved",
        inputs: [...new Set([...e.inputs, ...scaleInputs])], steps: ["s-nd-substitution"], evidence: ["spec-6"] });
    }
    const ok = nd.equations.every((e) => e.reverseOk && (!e.at || e.at.ok));
    const defIds = [...new Set(nd.definitions.map((d) => d.id).filter(Boolean))];
    add({ id: "r-nd-reverse", kind: "reverse", title: ok ? `The reverse substitution recovers each of the ${nd.equations.length} equations and conditions exactly${defIds.length ? `, under the definition${defIds.length > 1 ? "s" : ""} ${defIds.join(", ")}` : ""}.`
      : `The reverse substitution does not recover ${nd.equations.filter((e) => !e.reverseOk).map((e) => e.id).join(", ")}.`, status: ok ? "exact" : "unresolved", inputs: nd.inputs, steps: ["s-nd-reverse"], evidence: ["spec-6"] });
    const params = nd.parameters.filter((p) => p.role === "parameter" && p.independent);
    const paramName = (p) => (p.names[0] ? `${p.names[0].label} = ${p.label}` : p.label);
    add({ id: "r-nd-parameters", kind: "parameters", title: params.length ? `The dimensionless model has ${params.length} independent parameter${params.length > 1 ? "s" : ""}: ${params.map(paramName).join(", ")}.`
      : "The dimensionless model has no parameter: its solution is the same for every value of the physical parameters.", status: "exact", inputs: nd.inputs, steps: ["s-nd-parameters"], evidence: ["spec-6"] });
    for (const p of nd.parameters) {
      for (const nm of p.names) {
        if (p.role === "output" && nm.id === "theta") continue;
        add({ id: `r-nd-name-${p.id}-${nm.id}`, kind: "name", title: `${p.label} matches the stored formula of the ${nm.name.split(",")[0]}: ${nm.plain}${nm.power < 0 ? ", as its reciprocal" : ""}.${nm.assumes.length ? ` This match assumes that ${nm.assumes.join(" and that ")}.` : ""}`,
          tex: `${p.tex}=${nm.tex}`, status: p.confirmed === nm.id ? "confirmed" : "proposed", inputs: p.contains, steps: ["s-nd-parameters"], evidence: [nm.source], name: nm.id, key: p.key });
      }
    }
    const valued = nd.parameters.filter((p) => p.value && p.role !== "output");
    if (valued.length) add({ id: "r-nd-values", kind: "values", title: `The entered values give ${valued.map((p) => `${p.names[0] ? p.names[0].label : p.label} = ${valueText(p.value)}`).join(", ")}.`, status: valued.every((p) => p.value.exact) ? "exact" : "numerical", inputs: nd.inputs, steps: ["s-nd-parameters"] });
    if (nd.pi) {
      const outside = nd.pi.rows.filter((r) => !r.inPi);
      add({ id: "r-nd-pi", kind: "pi", title: `${nd.pi.rows.filter((r) => r.inPi).length} dimensionless quantities are products of powers of the Pi groups. The model uses ${nd.pi.rank} of the ${nd.pi.m} groups.${nd.pi.absent.length ? ` ${nd.pi.absent.map((a) => a.label).join(", ")} ${nd.pi.absent.length > 1 ? "do" : "does"} not appear in the model.` : ""}${outside.length ? ` ${outside.length} ${outside.length > 1 ? "quantities use" : "quantity uses"} variables outside the Pi set.` : ""}`,
        status: "exact", inputs: [...new Set([...piInputs, ...nd.inputs])], steps: ["s-nd-pi"], evidence: ["spec-6", "mit-pi"] });
    }
    // SymPy's independent substitution (tools/references.py): the same factor and dimensionless form, exactly.
    const ref = refs?.nondimensional?.find((x) => x.example === origin);
    if (ref) {
      const vars = new Set([...nd.fields.map((f) => f.hat), ...nd.coordinates.map((c) => c.hat)]);
      const ctx = { isField: (n) => nd.fields.some((f) => f.hat === n), isCoordinate: (n) => nd.coordinates.some((c) => c.hat === n), depends: () => true, isVar: (n) => vars.has(n) };
      const same = (f) => {
        const e = nd.equations.find((x) => x.id === f.id);
        if (!e) return false;
        try {
          const [l, r] = e.dimensionlessPlain.split(" = ");
          return S.equal(S.sub(S.read(l, ctx), S.read(r, ctx)), S.read(f.dimensionless, ctx)) && S.equal(S.read(e.factorPlain), S.read(f.factor));
        } catch { return false; }
      };
      if (ref.forms.length && ref.forms.every(same)) {
        add({ id: "r-nd-reference", kind: "reference", title: `SymPy ${refs.versions.sympy} makes its own substitution with the chain rule. It gives the same common factor and dimensionless form for each of the ${ref.forms.length} equations and conditions.`,
          status: "exact", inputs: nd.inputs, steps: ["s-nd-reverse"], evidence: [] });
      }
    }
    const hidden = nd.enters.filter((e) => e.hidden);
    if (hidden.length) {
      for (const h of hidden) add({ id: `r-nd-hidden-${h.id}`, kind: "hidden", title: `${h.label} does not enter the dimensionless model: it cancels from every equation and condition, and no scale contains it.`, status: "unresolved", inputs: [h.id, ...nd.inputs], steps: ["s-nd-parameters"], evidence: ["spec-6"],
        next: `Check whether ${h.label} belongs in the model. A parameter that cancels has no effect on the solution.` });
    } else add({ id: "r-nd-enters", kind: "hidden", title: `Each of the ${nd.enters.length} physical parameters enters a scale, an offset, a coefficient or a condition, so no scale hides a parameter.`, status: "exact", inputs: nd.inputs, steps: ["s-nd-parameters"], evidence: ["spec-6"] });
  }

  /** The confirmed standard example of a declaration, for its acceptance checks in the catalogue. */
  function standard(data, D, id) {
    const rec = R.fromExample(D, id);
    const interp = C.interpret(R.inputs(rec), D);
    return { interp, nd: N.nondimensionalize(interp, { scales: rec.scales ?? [], finder: null, groups: D.groups.groups, confirmed: {} }), base: R.inputs(rec) };
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
