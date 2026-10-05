/* Scientific Modelling: the shared model record (spec section 2). One versioned record holds the ten items:
 * purpose, variables, equations, geometry, conditions, assumptions, scales, analyses, evidence and history. The
 * researcher's inputs live in the record; the analyses are derived from a confirmed version and carry the inputs
 * they depend on, so an edit invalidates exactly the results that read a changed input. Every edit makes a new
 * version and keeps the version before it for comparison.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.SM = root.SM || {}).R = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SCHEMA = "scientific-modelling/model";
  const SCHEMA_VERSION = 1;
  /** The six result statuses of spec section 2, in the order the page explains them. */
  const STATUS = {
    proposed: "Proposed interpretation",
    confirmed: "Researcher-confirmed interpretation",
    exact: "Exact dimensional or algebraic check",
    numerical: "Numerical check with stated tolerance",
    evidence: "Physical claim with cited evidence",
    unresolved: "Unresolved or unsupported calculation",
  };
  const ITEMS = ["Purpose", "Variables", "Equations", "Geometry", "Conditions", "Assumptions", "Scales", "Analyses", "Evidence", "History"];
  const KINDS = { variable: ["parameter", "field", "coordinate", "constant"], equation: ["governing", "constitutive", "closure", "source", "constraint", "definition"],
    condition: ["boundary", "initial", "interface"], assumption: ["physical", "mathematical"] };
  const DOMAINS = ["positive", "nonnegative", "nonzero", "negative", "real"];
  const CALCULATIONS = ["pi-groups", "nondimensionalize", "dominant-balance", "asymptotic", "regime-map", "stability", "bifurcation"];
  const INPUT_KEYS = ["title", "purpose", "variables", "equations", "geometry", "conditions", "assumptions", "scales", "preferred", "evidence"];
  const SETTINGS = { arithmetic: "exact rationals (BigInt)", tolerance: "1e-12 relative, for floating-point comparisons only" };

  const clone = (x) => JSON.parse(JSON.stringify(x));

  /** JSON with sorted keys, so equal content has equal text. */
  function stable(x) {
    if (Array.isArray(x)) return `[${x.map(stable).join(",")}]`;
    if (x && typeof x === "object") return `{${Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(x[k])}`).join(",")}}`;
    return JSON.stringify(x ?? null);
  }
  /** A short content hash (FNV-1a, 32 bits) of any JSON value. */
  function hash(x) {
    const s = stable(x);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }

  const VARIABLE_DEFAULTS = { tex: "", meaning: "", quantity: "", phase: "", unit: "", dimension: "", value: "", kind: "parameter", domain: "positive", pi: true, role: "", average: "" };
  const variable = (v) => ({ ...VARIABLE_DEFAULTS, ...v });

  /** The inputs of a record: what the researcher enters, without versions or results. */
  function inputs(rec) {
    const out = {};
    for (const k of INPUT_KEYS) out[k] = clone(rec[k]);
    return out;
  }

  /** A complete record from an example of data/examples.json, resolving parts it borrows from another example. */
  function fromExample(data, id) {
    const all = data.examples.examples;
    const ex = all.find((e) => e.id === id) ?? all[0];
    const part = (key) => {
      const v = ex[key];
      if (typeof v === "string") return clone(all.find((e) => e.id === v)[key]);
      return clone(v ?? (key === "geometry" ? {} : []));
    };
    let variables = part("variables").map(variable);
    for (const [vid, patch] of Object.entries(ex.overrides ?? {})) variables = variables.map((v) => (v.id === vid ? { ...v, ...patch } : v));
    variables.push(...(ex.extra ?? []).map(variable));
    return {
      schema: SCHEMA, schemaVersion: SCHEMA_VERSION, origin: ex.id, version: 1,
      title: ex.title, purpose: clone(ex.purpose), variables, equations: part("equations"), geometry: part("geometry"),
      conditions: part("conditions"), assumptions: part("assumptions"), scales: part("scales"), preferred: clone(ex.preferred ?? []),
      evidence: part("evidence"), settings: clone(SETTINGS),
      history: [{ version: 1, change: `Loaded the example "${ex.title}".`, changed: [] }],
      confirmed: null, previous: null, interpretations: {},
    };
  }

  /** The stable ids of a record's inputs with a hash of each, for change detection. */
  function itemHashes(inp) {
    const out = { title: hash(inp.title), purpose: hash(inp.purpose), geometry: hash(inp.geometry), preferred: hash(inp.preferred) };
    for (const key of ["variables", "equations", "conditions", "assumptions", "scales", "evidence"]) for (const it of inp[key] ?? []) out[it.id] = hash(it);
    return out;
  }

  /** The ids added, removed and changed from inputs a to inputs b. */
  function diff(a, b) {
    const ha = itemHashes(a), hb = itemHashes(b);
    const added = Object.keys(hb).filter((k) => !(k in ha));
    const removed = Object.keys(ha).filter((k) => !(k in hb));
    const changed = Object.keys(hb).filter((k) => k in ha && ha[k] !== hb[k]);
    return { added, removed, changed, all: [...added, ...removed, ...changed] };
  }

  /**
   * A new version after `mutate(inputs)` changes the inputs; the same record when nothing changed. The new version
   * keeps the old inputs as `previous`, and the history records what changed and which ids it touched.
   */
  function edit(rec, mutate, summary) {
    const before = inputs(rec);
    const after = inputs(rec);
    mutate(after);
    const d = diff(before, after);
    if (!d.all.length) return rec;
    const next = { ...clone(rec), ...after, version: rec.version + 1, previous: { version: rec.version, inputs: before } };
    next.history = [...rec.history, { version: next.version, change: summary, changed: d.all }].slice(-200);
    return next;
  }

  /** The record with this version confirmed: the analyses run on the confirmed inputs. */
  function confirm(rec) {
    if (rec.confirmed && rec.confirmed.version === rec.version) return rec;
    const next = clone(rec);
    next.confirmed = { version: rec.version, inputs: inputs(rec) };
    next.history = [...rec.history, { version: rec.version, change: `Confirmed the interpretation of version ${rec.version}.`, changed: [] }].slice(-200);
    return next;
  }

  /** Is the current version the confirmed one? */
  const isConfirmed = (rec) => Boolean(rec.confirmed && rec.confirmed.version === rec.version);

  /** The record with one group interpretation confirmed or withdrawn by the researcher. */
  function confirmInterpretation(rec, key, name, yes) {
    const next = clone(rec);
    next.interpretations = { ...(rec.interpretations ?? {}) };
    if (yes) next.interpretations[key] = name;
    else delete next.interpretations[key];
    next.history = [...rec.history, { version: rec.version, change: `${yes ? "Confirmed" : "Withdrew"} the interpretation ${name}.`, changed: [] }].slice(-200);
    return next;
  }

  /* ---------- import ---------- */

  const isText = (x, max = 2000) => typeof x === "string" && x.length <= max;
  /**
   * A record from imported JSON, or the reasons it is refused. A refused file never replaces the current record.
   * @returns {{ record?: any, errors: string[] }}
   */
  function validate(doc) {
    const errors = [];
    const fail = (m) => { errors.push(m); };
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { errors: ["The file is not a model record."] };
    if (doc.schema !== SCHEMA) fail(`The file is not a model record of this page (schema "${String(doc.schema).slice(0, 60)}").`);
    if (doc.schemaVersion !== SCHEMA_VERSION) fail(`The file uses schema version ${String(doc.schemaVersion).slice(0, 10)}; this page reads version ${SCHEMA_VERSION}.`);
    if (errors.length) return { errors };
    if (!Number.isInteger(doc.version) || doc.version < 1) fail("The version must be a positive integer.");
    if (!isText(doc.title, 300)) fail("The title must be text of at most 300 characters.");
    if (!doc.purpose || !isText(doc.purpose.question ?? "") || !CALCULATIONS.includes(doc.purpose.calculation)) fail("The purpose needs a question and one of the known calculations.");
    const ids = new Set(), symbols = new Set();
    const list = (key, kinds, check) => {
      if (!Array.isArray(doc[key])) { fail(`${key} must be a list.`); return; }
      if (doc[key].length > 200) fail(`${key} has more than 200 items.`);
      doc[key].forEach((it, i) => {
        if (!it || typeof it !== "object" || !isText(it.id, 60) || !/^[A-Za-z0-9_.-]+$/.test(it.id)) { fail(`${key} item ${i + 1} needs an id of letters, digits, _ . or -.`); return; }
        if (ids.has(it.id)) fail(`The id ${it.id} occurs twice.`);
        ids.add(it.id);
        if (kinds && !kinds.includes(it.kind)) fail(`${it.id}: the kind "${String(it.kind).slice(0, 30)}" is not one of ${kinds.join(", ")}.`);
        check?.(it);
      });
    };
    list("variables", KINDS.variable, (v) => {
      if (!isText(v.symbol, 40) || !/^[A-Za-zͰ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*$/.test(v.symbol)) fail(`${v.id}: the symbol must be a name such as c_p or T_inf.`);
      else if (symbols.has(v.symbol)) fail(`The symbol ${v.symbol} occurs twice.`);
      symbols.add(v.symbol);
      if (!DOMAINS.includes(v.domain ?? "positive")) fail(`${v.id}: the domain must be one of ${DOMAINS.join(", ")}.`);
      for (const k of ["tex", "meaning", "quantity", "phase", "unit", "dimension", "value", "role", "average"]) if (v[k] !== undefined && !isText(v[k], 300)) fail(`${v.id}: ${k} must be short text.`);
      if (v.pi !== undefined && typeof v.pi !== "boolean") fail(`${v.id}: pi must be true or false.`);
    });
    list("equations", KINDS.equation, (e) => { if (!isText(e.text, 600)) fail(`${e.id}: the equation must be text.`); });
    list("conditions", KINDS.condition, (c) => { if (!isText(c.text, 600) || !isText(c.at ?? "", 100)) fail(`${c.id}: the condition needs text and a location.`); });
    list("assumptions", KINDS.assumption, (a) => { if (!isText(a.text, 600)) fail(`${a.id}: the assumption must be text.`); });
    list("scales", null);
    list("evidence", null, (e) => { if (!isText(e.claim ?? "", 600) || !isText(e.source ?? "", 100)) fail(`${e.id}: an evidence item needs a claim and a source.`); });
    if (!doc.geometry || typeof doc.geometry !== "object") fail("geometry must be an object.");
    if (!Array.isArray(doc.preferred) || doc.preferred.some((p) => !ids.has(p))) fail("preferred must list variable ids of this record.");
    if (doc.purpose && doc.purpose.observable && !ids.has(doc.purpose.observable)) fail("The quantity of interest must be a variable id of this record.");
    if (errors.length) return { errors };
    const rec = {
      schema: SCHEMA, schemaVersion: SCHEMA_VERSION, origin: isText(doc.origin, 60) ? doc.origin : "imported", version: doc.version,
      ...Object.fromEntries(INPUT_KEYS.map((k) => [k, clone(doc[k])])),
      settings: clone(SETTINGS),
      history: Array.isArray(doc.history) ? clone(doc.history).slice(-200) : [],
      confirmed: null, previous: null, interpretations: doc.interpretations && typeof doc.interpretations === "object" ? clone(doc.interpretations) : {},
    };
    rec.variables = rec.variables.map(variable);
    rec.history.push({ version: rec.version, change: "Imported the record. Confirm the interpretation to run the analyses.", changed: [] });
    return { record: rec, errors: [] };
  }

  return { SCHEMA, SCHEMA_VERSION, STATUS, ITEMS, KINDS, DOMAINS, CALCULATIONS, INPUT_KEYS, SETTINGS, clone, stable, hash, variable, inputs, fromExample,
    itemHashes, diff, edit, confirm, isConfirmed, confirmInterpretation, validate };
});
