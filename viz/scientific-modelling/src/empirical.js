/* Scientific Modelling: the empirical layer of piece 7 (spec section 9, "Empirical boundary: cited correlation,
 * measured data and validity range"). A named correlation lives in data/convective.json with its constants, its
 * source, the measured data behind it and its validity range; this module evaluates it only inside that range and
 * refuses it outside, never by extrapolation. An empirical boundary has a cited value and, where the source gives
 * one, a range of uncertainty that the map draws as an unresolved band. The module also checks imported numerical
 * results: a file must state its provenance and use the page's group definitions, and the page compares each point
 * with the correlation inside its range only.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.SM = root.SM || {}).EM = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** A constant of the data: a number, or text such as "0.332" or "1/2". */
  const num = (x) => { if (typeof x === "number") return x; const m = /^\s*(-?[\d.]+)\s*\/\s*([\d.]+)\s*$/.exec(String(x)); return m ? Number(m[1]) / Number(m[2]) : Number(x); };
  /** The forms of the correlations; each takes the groups and the constants of data/convective.json. */
  const FORMS = {
    /** Nu = C Re^a Pr^b */
    power: (g, c) => num(c.C) * g.Re ** num(c.a) * g.Pr ** num(c.b),
    /** Churchill and Chu, laminar: Nu = 0.68 + 0.670 Ra^(1/4) [1 + (0.492/Pr)^(9/16)]^(-4/9) */
    "churchill-chu-laminar": (g, c) => num(c.c0) + num(c.c1) * g.Ra ** 0.25 * (1 + (num(c.c2) / g.Pr) ** (9 / 16)) ** (-4 / 9),
    /** Churchill and Chu, all Ra: Nu = {0.825 + 0.387 Ra^(1/6) / [1 + (0.492/Pr)^(9/16)]^(8/27)}^2 */
    "churchill-chu-all": (g, c) => (num(c.c0) + (num(c.c1) * g.Ra ** (1 / 6)) / (1 + (num(c.c2) / g.Pr) ** (9 / 16)) ** (8 / 27)) ** 2,
    /** Gnielinski with Filonenko's friction factor f = (1.82 log10 Re - 1.64)^-2 */
    gnielinski: (g, c) => {
      const f = (num(c.f1) * Math.log10(g.Re) - num(c.f2)) ** -2;
      return ((f / 8) * (g.Re - num(c.c0)) * g.Pr) / (1 + num(c.c1) * Math.sqrt(f / 8) * (g.Pr ** (2 / 3) - 1));
    },
  };

  /** The correlations of the data, by id. */
  const list = (data) => data?.convective?.correlations ?? [];
  const find = (data, id) => list(data).find((c) => c.id === id) ?? null;

  /** The violations of a validity range: one sentence for each group outside it. */
  function violations(corr, groups) {
    const out = [];
    for (const [k, [lo, hi]] of Object.entries(corr.range ?? {})) {
      const v = groups[k];
      if (!Number.isFinite(v)) out.push(`${k} is not known`);
      else if ((lo !== null && v < lo) || (hi !== null && v > hi)) out.push(`${k} = ${fmt(v)} is outside ${lo === null ? "" : `${fmt(lo)} ≤ `}${k}${hi === null ? "" : ` ≤ ${fmt(hi)}`}`);
    }
    return out;
  }

  /**
   * The value of a correlation, or the reasons it is refused. A refused value is null: the page never extrapolates.
   * @returns {{ ok: boolean, value: number | null, refused: string[], corr: any }}
   */
  function evaluate(corr, groups) {
    if (!corr || !FORMS[corr.form]) return { ok: false, value: null, refused: ["the correlation is not known"], corr };
    const bad = violations(corr, groups);
    if (bad.length) return { ok: false, value: null, refused: bad, corr };
    return { ok: true, value: FORMS[corr.form](groups, corr.constants), refused: [], corr };
  }
  /** The value of the form alone, for a check of the constants or a figure inside the range. */
  const formValue = (corr, groups) => FORMS[corr.form](groups, corr.constants);

  /** The region of an empirical boundary set (data/convective.json, boundaries) that holds a value. */
  function regionOf(set, value) {
    if (!Number.isFinite(value)) return null;
    return set.regions.find((r) => (r.lo === null || value >= r.lo) && (r.hi === null || value < r.hi)) ?? null;
  }

  /* ---------- imported numerical results ---------- */

  const SCHEMA = "scientific-modelling/numerical-results";
  const PROVENANCE = ["source", "method", "software", "date", "tolerance"];
  const isText = (x, max = 400) => typeof x === "string" && x.trim().length > 0 && x.length <= max;

  /**
   * Check an imported file of numerical results against the definitions of an example (data/convective.json,
   * imports). Returns { ok, errors, doc } with the points kept as plain numbers.
   */
  function validateImport(doc, spec) {
    const errors = [];
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ok: false, errors: ["The file is not a JSON object."] };
    if (doc.schema !== SCHEMA) errors.push(`The file is not a numerical-results file of this page (schema "${String(doc.schema).slice(0, 60)}").`);
    if (doc.schemaVersion !== 1) errors.push("The file must use schemaVersion 1.");
    const p = doc.provenance;
    if (!p || typeof p !== "object") errors.push("The file has no provenance. State the source, the method, the software, the date and the tolerance.");
    else for (const k of PROVENANCE) if (!isText(p[k])) errors.push(`The provenance has no ${k}.`);
    if (!spec) errors.push("This example accepts no imported results.");
    else {
      if (doc.example !== spec.example) errors.push(`The file is for the example "${String(doc.example).slice(0, 60)}", not "${spec.example}".`);
      for (const [g, def] of Object.entries(spec.definitions)) {
        const given = doc.definitions?.[g];
        if (given !== def) errors.push(`The file must define ${g} as "${def}"${given ? `, not "${String(given).slice(0, 80)}"` : ""}.`);
      }
      const cols = [...spec.inputs, spec.output];
      if (!Array.isArray(doc.points) || !doc.points.length || doc.points.length > 500) errors.push("The file needs a list of 1 to 500 points.");
      else doc.points.forEach((pt, i) => { for (const c of cols) if (!Number.isFinite(pt?.[c])) errors.push(`Point ${i + 1} has no number for ${c}.`); });
    }
    if (errors.length) return { ok: false, errors: errors.slice(0, 8) };
    return { ok: true, errors: [], doc: { schema: SCHEMA, schemaVersion: 1, example: doc.example, provenance: Object.fromEntries(PROVENANCE.concat(["author", "url", "notes"]).filter((k) => isText(p[k], 2000)).map((k) => [k, p[k]])),
      definitions: doc.definitions, points: doc.points.map((pt) => Object.fromEntries([...spec.inputs, spec.output, "uncertainty"].filter((c) => Number.isFinite(pt[c])).map((c) => [c, pt[c]]))) } };
  }

  /**
   * Compare imported points with a correlation: each point inside the range gets its relative deviation; a point
   * outside the range is kept but not compared. The status is numerical when every compared point is within the
   * stated tolerance, else unresolved.
   */
  function compare(doc, spec, corr, tolerance) {
    const rows = doc.points.map((pt) => {
      const groups = { ...spec.fixed, ...pt };
      const ev = evaluate(corr, groups);
      const value = ev.ok && spec.ratio ? ev.value / spec.ratio(groups) : ev.value;
      return { point: pt, model: ev.ok ? value : null, deviation: ev.ok ? (pt[spec.output] - value) / value : null, refused: ev.refused };
    });
    const compared = rows.filter((r) => r.deviation !== null);
    const worst = compared.reduce((m, r) => Math.max(m, Math.abs(r.deviation)), 0);
    return { rows, compared: compared.length, outside: rows.length - compared.length, worst, tolerance, passed: compared.length > 0 && worst <= tolerance };
  }

  function fmt(x) {
    if (!Number.isFinite(x)) return String(x);
    const a = Math.abs(x);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) { const [m, e] = x.toExponential(2).split("e"); return `${Number(m)}×10^${Number(e)}`; }
    return String(Number(x.toPrecision(4)));
  }

  return { FORMS, SCHEMA, PROVENANCE, list, find, violations, evaluate, formValue, regionOf, validateImport, compare, fmt };
});
