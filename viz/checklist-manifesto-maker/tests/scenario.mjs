// Shared set-up for this visual's tests: the page's own scripts loaded as CommonJS (as the page loads them as plain
// scripts), the bundled examples, and the scenarios the tests and fixtures use. Every scenario is built through the
// model's own operations, so a fixture is what a person using the page would produce.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const M = require("../src/model.js");
export const F = require("../src/formats.js");
export const D = require("../raw.json");

/** A deep-frozen copy, so a test fails if an operation mutates its input. @param {any} value */
export function frozen(value) {
  const copy = JSON.parse(JSON.stringify(value));
  const freeze = (/** @type {any} */ v) => {
    if (v && typeof v === "object") {
      Object.freeze(v);
      for (const k of Object.keys(v)) freeze(v[k]);
    }
    return v;
  };
  return freeze(copy);
}

/** A library holding one new draft from a bundled example. @param {string} id */
export function fromExample(id) {
  return M.fromExample(M.emptyLibrary(), D.examples.find((/** @type {any} */ x) => x.id === id));
}

/** The current entry of a library holding one example, reviewed and with a fresh Run. @param {string} id */
export function running(id) {
  return M.startRun(M.markReviewed(M.active(fromExample(id))));
}

/**
 * The failed-check scenario of "Publish a static page", as a person plays it: three steps done, the destination
 * check failed, the recovery route done and the Run restarted; then a reviewer record and a draft edit made while
 * the Run is active, so the draft is revision 2 and the Run stays on revision 1.
 */
export function failedCheckScenario() {
  let e = running("static-page");
  let run = e.run;
  for (const id of ["s1", "s2", "s3"]) run = M.record(run, id, "done");
  run = M.record(run, "c2", "not-applicable", "The site is new.");
  run = M.record(run, "c1", "failed");
  run = M.startRecovery(run, "r1");
  for (const id of ["a1", "a2", "a3", "k1", "k2"]) run = M.markRecovery(run, id, true);
  run = M.restart(run);
  e = M.addReviewer({ ...e, run }, { name: "A. Reviewer", date: "2026-10-05", note: "Read on a phone." });
  e = M.edit(e, (/** @type {any} */ def) => M.setField(def, "s2", "text", "Read the title and the first paragraph aloud."));
  return { ...e, trialNotes: "The first trial missed the backup check.\nSecond line." };
}

/** An entry whose text holds markup, comment delimiters, links and deck syntax, all of which must stay inert text. */
export function unsafeEntry() {
  const lib = fromExample("day-trip");
  return M.markReviewed(M.edit(M.active(lib), (/** @type {any} */ def) => {
    M.setField(def, def.id, "title", "Trip <script>alert(1)</script> --> <!-- x -->");
    M.setField(def, "s1", "text", "Pack [water](javascript:alert(1)) and <img src=x onerror=alert(1)>");
    M.setField(def, "s2", "details", "# not a heading\n::: narration\n## nor a frame\n-->");
    M.setField(def, "c1", "text", "Confirm `code` *stars* _under_ | pipe & $5 \\ backslash");
    M.setField(def, "x1", "instruction", "Stop --!> now");
  }));
}
