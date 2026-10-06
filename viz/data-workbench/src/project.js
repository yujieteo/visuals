/* Universal Data Workbench: a saved project, project.json in the export package, and its reopening.
 *
 * A project records what makes the package's figures and statistics again from the same files: each table's source
 * (file name, size, SHA-256, or the built-in example), how it was imported (all rows, a seeded sample, some
 * columns), the readings the person chose or approved, the dismissed suggestions, the fields marked additive, the
 * edited charts' specifications, the study details, the highlight count and the publication settings. It also
 * records what came out: the SHA-256 of every SVG figure file and each tested hypothesis's p-values, so a reopened
 * project says which figures and results it reproduced. It never holds a row.
 *
 * Reopening checks each source file's size and SHA-256 against the record and refuses a file that differs.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWProject = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FORMAT = "universal-data-workbench-project";
  const VERSION = 1;
  const TABLE = /^[a-z][a-z0-9_]{0,62}$/;
  const HEX = /^[0-9a-f]{64}$/;

  /**
   * The project document.
   * @param {{ saved: string, build: string, versions: any, highlights: number, publication: any, formats: string[], sources: boolean,
   *   tables: { name: string, source: any, import: any, overrides: any, dismissed: string[], additive: string[], study: any, edits: { id: string, spec: any }[],
   *   figures: Record<string, string>, results: Record<string, [number | null, number | null]> }[] }} p
   */
  function make(p) {
    return { format: FORMAT, version: VERSION, saved: p.saved, build: p.build, versions: p.versions, highlights: p.highlights, publication: p.publication,
      formats: p.formats, sourcesIncluded: p.sources, tables: p.tables };
  }

  /**
   * A project read from JSON text, or an error that says why it cannot be reopened.
   * @param {string} text
   */
  function parse(text) {
    let doc;
    try { doc = JSON.parse(text); } catch { throw new Error("project.json is not JSON."); }
    if (!doc || doc.format !== FORMAT) throw new Error("The file is not a project of the Universal Data Workbench.");
    if (doc.version !== VERSION) throw new Error(`The project is format version ${JSON.stringify(doc.version)}; this page reopens version ${VERSION}.`);
    if (!Array.isArray(doc.tables) || !doc.tables.length) throw new Error("The project holds no table.");
    const names = new Set();
    for (const t of doc.tables) {
      if (!TABLE.test(String(t?.name))) throw new Error(`The project names a table ${JSON.stringify(t?.name)}, which is not a table name.`);
      if (names.has(t.name)) throw new Error(`The project names the table ${t.name} twice.`);
      names.add(t.name);
      const s = t.source;
      if (!s || typeof s.file !== "string" || !Number.isInteger(s.bytes) || !HEX.test(String(s.sha256)) || (s.kind !== "csv" && s.kind !== "parquet"))
        throw new Error(`The source of ${t.name} is not recorded with its file, size, kind and SHA-256.`);
      const i = t.import;
      if (!i || !["full", "sample", "columns"].includes(i.choice)) throw new Error(`How ${t.name} was imported is not recorded.`);
      if (i.choice === "sample" && !(Number.isInteger(i.sample?.rows) && Number.isInteger(i.sample?.seed))) throw new Error(`The sample of ${t.name} has no rows and seed.`);
      if (i.choice === "columns" && !(Array.isArray(i.columns) && i.columns.length)) throw new Error(`The columns kept of ${t.name} are not recorded.`);
    }
    return doc;
  }

  /**
   * Whether a file is the one a table was made from: its size and SHA-256 against the record.
   * @param {any} source the recorded source @param {{ bytes: number, sha256: string }} file
   * @returns {{ ok: boolean, text: string }}
   */
  function check(source, file) {
    if (file.bytes === source.bytes && file.sha256 === source.sha256) return { ok: true, text: `matches: ${source.bytes.toLocaleString("en-US")} bytes, SHA-256 ${source.sha256.slice(0, 12)}…` };
    return { ok: false, text: `differs from the file the project was made from: ${file.bytes.toLocaleString("en-US")} bytes and SHA-256 ${file.sha256.slice(0, 12)}…, where the project records ${source.bytes.toLocaleString("en-US")} bytes and ${source.sha256.slice(0, 12)}…` };
  }

  /**
   * What a reopened table reproduced: its SVG figure files and its p-values, against the record.
   * @param {any} saved the table's record @param {Record<string, string>} figures path to SHA-256, as made again
   * @param {Record<string, [number | null, number | null]>} results hypothesis id to raw and adjusted p, as made again
   */
  function compare(saved, figures, results) {
    const want = Object.entries(saved.figures ?? {});
    const same = want.filter(([path, sha]) => figures[path] === sha).length;
    const differ = want.filter(([path, sha]) => figures[path] !== undefined && figures[path] !== sha).map(([path]) => path);
    const missing = want.filter(([path]) => figures[path] === undefined).map(([path]) => path);
    const extra = Object.keys(figures).filter((path) => !(path in (saved.figures ?? {})));
    const close = (a, b) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a)));
    const tests = Object.entries(saved.results ?? {});
    const statsMissing = tests.filter(([id]) => !results[id]).map(([id]) => id);
    const statsDiffer = tests.filter(([id, [p, q]]) => results[id] && !(close(results[id][0], p) && close(results[id][1], q))).map(([id]) => id);
    const statsSame = tests.length - statsMissing.length - statsDiffer.length;
    return { figures: { saved: want.length, same, differ, missing, extra }, results: { saved: tests.length, same: statsSame, differ: statsDiffer, missing: statsMissing },
      reproduced: want.length === same && !extra.length && statsSame === tests.length };
  }

  return { FORMAT, VERSION, make, parse, check, compare };
});
