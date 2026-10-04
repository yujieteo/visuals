/* OKR Setter: the domain model. This file is the visual's own.
 *
 * FIELDS is the semantic state (§5): up to OBJECTIVES objectives with up to KEY_RESULTS key results each, as flat
 * fields named o1_title, o1_k1_name, o1_k1_target and so on. A slot with an empty title or name is unused.
 * Change SCHEMA_VERSION when a field changes meaning, so an old saved file is refused rather than read wrongly (§13).
 * EXAMPLES are full states with stable ids. derive(state) computes every derived value from the state alone, so
 * the same state always gives the same numbers (§4). It touches no DOM, so node tests run it. toToon encodes the
 * set in the TOON format of yujieteo/site's scripts/toon.py, as the calibrator does.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Model = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const SLUG = "okr-setter";
  const SCHEMA_VERSION = 1;
  const OBJECTIVES = 3;
  const KEY_RESULTS = 5;
  const MIN_KR = 3;
  const BIG = 1e9;

  /** Where each rule comes from. Every check carries one of these ids, and the page links the address. */
  const SOURCES = {
    doerr: { title: "John Doerr, Measure What Matters: what is an OKR (What Matters)", url: "https://www.whatmatters.com/faqs/okr-meaning-definition-example" },
    rework: { title: "Google re:Work: Set goals with OKRs", url: "https://rework.withgoogle.com/en/guides/set-goals-with-okrs" },
    playbook: { title: "Google's OKR Playbook (What Matters)", url: "https://www.whatmatters.com/resources/google-okr-playbook" },
    mistakes: { title: "Common OKR mistakes (What Matters)", url: "https://www.whatmatters.com/faqs/common-okr-mistakes" },
  };

  /** Words that mark a key result as an activity, from the re:Work guide. */
  const ACTIVITY = /\b(consult|help|analy[sz]|participat)\w*/i;
  /** Words that mark an objective as upkeep, from the re:Work guide ("keep hiring", "maintain market position"). */
  const UPKEEP = /\b(keep|maintain|continue)\b/i;

  /** The per-key-result field suffixes, in order. */
  const PARTS = ["name", "kind", "start", "target", "current", "unit", "owner", "due"];
  /** @type {Record<string, string | number>} */
  const BLANK_KR = { name: "", kind: "value", start: 0, target: 100, current: 0, unit: "", owner: "", due: "" };

  /** @param {number} o @param {number} k @param {string} part */
  const krKey = (o, k, part) => `o${o}_k${k}_${part}`;
  /** @param {number} o */
  const titleKey = (o) => `o${o}_title`;
  /** @param {number} o */
  const typeKey = (o) => `o${o}_type`;

  /** @type {Record<string, KitField>} */
  const FIELD_TEMPLATE = {};
  /** @type {Record<string, string | number | boolean>} */
  const BLANK = {};
  for (let o = 1; o <= OBJECTIVES; o++) {
    FIELD_TEMPLATE[titleKey(o)] = { type: "string", label: `Objective ${o} title`, default: "" };
    BLANK[titleKey(o)] = "";
    FIELD_TEMPLATE[typeKey(o)] = { type: "enum", label: `Objective ${o} type`, default: "aspirational", values: ["aspirational", "committed"] };
    BLANK[typeKey(o)] = "aspirational";
    for (let k = 1; k <= KEY_RESULTS; k++) {
      const at = `Objective ${o}, key result ${k}`;
      /** @type {Record<string, KitField>} */
      const parts = {
        name: { type: "string", label: `${at}: name`, default: "" },
        kind: { type: "enum", label: `${at}: kind`, default: "value", values: ["value", "score"] },
        start: { type: "number", label: `${at}: start value`, default: 0, min: -BIG, max: BIG },
        target: { type: "number", label: `${at}: target value`, default: 100, min: -BIG, max: BIG },
        current: { type: "number", label: `${at}: current value`, default: 0, min: -BIG, max: BIG },
        unit: { type: "string", label: `${at}: unit`, default: "" },
        owner: { type: "string", label: `${at}: owner`, default: "" },
        due: { type: "string", label: `${at}: due date`, default: "" },
      };
      for (const part of PARTS) {
        FIELD_TEMPLATE[krKey(o, k, part)] = parts[part];
        BLANK[krKey(o, k, part)] = BLANK_KR[part];
      }
    }
  }

  /**
   * A full state: the blank set with the given objectives on top. Each objective is a title and key results;
   * a key result is a partial row.
   * @param {{ title: string, type?: "aspirational" | "committed", krs: Partial<Record<string, string | number>>[] }[]} objectives
   * @returns {Record<string, string | number | boolean>}
   */
  function setOf(objectives) {
    const state = { ...BLANK };
    objectives.forEach((objective, i) => {
      state[titleKey(i + 1)] = objective.title;
      state[typeKey(i + 1)] = objective.type ?? "aspirational";
      objective.krs.forEach((kr, j) => {
        for (const part of PARTS) if (kr[part] !== undefined) state[krKey(i + 1, j + 1, part)] = /** @type {string | number} */ (kr[part]);
      });
    });
    return state;
  }

  /** Named states with stable ids (§5, §18). Every example is written for this page: none is a real organisation's
   * set. @type {KitExample[]} */
  const EXAMPLES = [
    { id: "onboarding", label: "Team: faster onboarding (illustrative)", state: setOf([
      { title: "Make new users productive in their first week", type: "aspirational", krs: [
        { name: "Users who finish setup within 24 hours", unit: "%", start: 40, target: 70, current: 52, owner: "Product", due: "2026-12-31" },
        { name: "Median days from sign-up to first report", unit: "days", start: 9, target: 3, current: 6, owner: "Support", due: "2026-12-31" },
        { name: "Onboarding survey score", kind: "score", current: 0.6, owner: "Research", due: "2026-12-31" },
      ] },
      { title: "Cut the support load of setup", type: "committed", krs: [
        { name: "Setup tickets per 100 new users", unit: "tickets", start: 12, target: 6, current: 10, owner: "Support", due: "2026-12-31" },
        { name: "Setup tickets closed without an agent reply", unit: "%", start: 20, target: 40, current: 25, owner: "Support", due: "2026-12-31" },
        { name: "Setup guide read to the end by new users", unit: "%", start: 30, target: 60, current: 45, owner: "Docs", due: "2026-12-31" },
      ] },
    ]) },
    { id: "race", label: "Personal: run a first 10 km (illustrative)", state: setOf([
      { title: "Run a 10 km race by the end of the year", type: "aspirational", krs: [
        { name: "Longest run", unit: "km", start: 3, target: 10, current: 6, owner: "Me", due: "2026-11-30" },
        { name: "Runs per week", unit: "runs", start: 1, target: 3, current: 2, owner: "Me", due: "2026-11-30" },
        { name: "Training plan followed, as a score", kind: "score", current: 0.75, owner: "Me", due: "2026-11-30" },
      ] },
    ]) },
    { id: "needs-work", label: "Common faults (illustrative)", state: setOf([
      { title: "Keep onboarding going", krs: [
        { name: "Improve onboarding", start: 0, target: 0, current: 0 },
        { name: "Help the team analyze churn", unit: "reports", start: 0, target: 4, current: 1 },
      ] },
    ]) },
    { id: "blank", label: "Start blank", state: setOf([]) },
  ];

  /** @type {Record<string, KitField>} */
  const FIELDS = {};
  for (const [key, field] of Object.entries(FIELD_TEMPLATE)) FIELDS[key] = { ...field, default: EXAMPLES[0].state[key] };

  /** @param {number} x */
  const num = (x) => String(Number(x.toPrecision(6)));
  /** @param {number} p a fraction */
  const percent = (p) => `${Math.round(p * 100)}%`;
  /** @param {number} x @param {number} lo @param {number} hi */
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  /** @param {string} due */
  function validDate(due) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
    const d = new Date(`${due}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === due;
  }

  /** @typedef {{ id: string, pass: boolean, label: string, source: keyof typeof SOURCES, detail: string }} Check */

  /**
   * Where an objective's score stands against its type: a committed OKR is expected to reach 1.0, and the sweet
   * spot of an aspirational one is 0.6 to 0.7 (Google's OKR Playbook, re:Work).
   * @param {"aspirational" | "committed"} type @param {number} progress a fraction
   */
  function grade(type, progress) {
    const score = Math.round(progress * 100) / 100;
    if (type === "committed") return score >= 1 ? "Committed: fully achieved, as expected." : `Committed: expected to reach 1.0, now ${score.toFixed(2)}. Google asks for an explanation of anything less.`;
    if (score >= 1) return "Aspirational: at 1.0. Always reaching 1.0 can mean the objective was not ambitious enough.";
    if (score >= 0.6 && score <= 0.7) return `Aspirational: ${score.toFixed(2)} is in the 0.6 to 0.7 sweet spot.`;
    return `Aspirational: ${score.toFixed(2)} is outside the 0.6 to 0.7 sweet spot.`;
  }

  /**
   * One key result's values and checks. Progress is (current - start) / (target - start) for a value, clamped to
   * 0..1 for the bar, and the score itself for a score. A target equal to the start has no progress.
   * @param {Record<string, any>} state @param {number} o @param {number} k
   */
  function keyResult(state, o, k) {
    /** @param {string} part */
    const get = (part) => state[krKey(o, k, part)];
    const name = String(get("name")).trim();
    const score = get("kind") === "score";
    const unit = String(get("unit")).trim(), owner = String(get("owner")).trim(), due = String(get("due")).trim();
    const start = score ? 0 : Number(get("start")), target = score ? 1 : Number(get("target")), current = Number(get("current"));
    const span = target - start;
    const raw = score ? current : span === 0 ? null : (current - start) / span;
    const progress = raw === null ? null : clamp(raw, 0, 1);
    const measurable = score ? current >= 0 && current <= 1 : span !== 0 && unit !== "";
    const measurableWhy = score ? "A score must be between 0 and 1." : span === 0 ? "The target equals the start, so there is nothing to measure." : "A number needs a unit.";
    const activity = ACTIVITY.exec(name)?.[0] ?? null;
    const timed = validDate(due);
    const timedWhy = due === "" ? "No due date is set." : "The due date is not a real date.";
    const id = `o${o}-k${k}`;
    /** @type {Check[]} */
    const checks = [
      { id: `${id}-measurable`, pass: measurable, label: "Measurable", source: "doerr", detail: measurable ? (score ? "The score is between 0 and 1." : "It has a unit and a target that differs from the start.") : measurableWhy },
      { id: `${id}-outcome`, pass: activity === null, label: "An outcome, not an activity", source: "rework", detail: activity === null ? "The name has no activity word." : `"${activity.toLowerCase()}" describes an activity: name the result instead.` },
      { id: `${id}-timebound`, pass: timed, label: "Time-bound", source: "doerr", detail: timed ? `Due ${due}.` : timedWhy },
    ];
    return {
      id, objective: o, index: k, used: name !== "", name, kind: score ? "score" : "value", unit, owner, due,
      start, target, current, raw, progress, measurable, checks,
      text: {
        progress: progress === null ? "no progress can be shown" : percent(progress),
        current: score ? num(current) : `${num(current)}${unit ? ` ${unit}` : ""}`,
        target: score ? "1" : `${num(target)}${unit ? ` ${unit}` : ""}`,
        start: score ? "0" : `${num(start)}${unit ? ` ${unit}` : ""}`,
      },
    };
  }

  /**
   * Every value the page shows, from the state alone: per objective its key results, progress and checks, and the
   * set's overall progress.
   * @param {Record<string, any>} state
   */
  function derive(state) {
    const objectives = [];
    for (let o = 1; o <= OBJECTIVES; o++) {
      const title = String(state[titleKey(o)]).trim();
      const all = [];
      for (let k = 1; k <= KEY_RESULTS; k++) all.push(keyResult(state, o, k));
      const used = all.filter((kr) => kr.used);
      const shown = title !== "" || used.length > 0;
      const measured = used.filter((kr) => kr.progress !== null);
      const progress = measured.length ? measured.reduce((sum, kr) => sum + /** @type {number} */ (kr.progress), 0) / measured.length : null;
      const id = `o${o}`;
      const type = state[typeKey(o)] === "committed" ? "committed" : "aspirational";
      /** @type {Check[]} */
      const checks = shown ? [
        { id: `${id}-title`, pass: title !== "", label: "Has a title", source: "doerr", detail: title !== "" ? "The objective is named." : "Write the objective in a short phrase." },
        { id: `${id}-action`, pass: title === "" || !UPKEEP.test(title), label: "Action-oriented, not upkeep", source: "rework", detail: title !== "" && UPKEEP.test(title) ? `"${(UPKEEP.exec(title) ?? [""])[0].toLowerCase()}" describes upkeep: say what will change.` : "The title has no upkeep word." },
        { id: `${id}-count`, pass: used.length >= MIN_KR && used.length <= KEY_RESULTS, label: `Has ${MIN_KR} to ${KEY_RESULTS} key results`, source: "doerr",
          detail: `It has ${used.length} key result${used.length === 1 ? "" : "s"}.` },
      ] : [];
      objectives.push({
        id, index: o, title, type, shown, krs: used, slots: all, progress, checks, grade: progress === null ? null : grade(type, progress),
        text: { progress: progress === null ? "no progress yet" : percent(progress), score: progress === null ? "no score yet" : progress.toFixed(2) },
      });
    }
    const live = objectives.filter((ob) => ob.progress !== null);
    const progress = live.length ? live.reduce((sum, ob) => sum + /** @type {number} */ (ob.progress), 0) / live.length : null;
    const checks = objectives.flatMap((ob) => ob.checks.concat(ob.krs.flatMap((kr) => kr.checks)));
    const passed = checks.filter((c) => c.pass).length;
    return {
      objectives, progress, checks: { passed, total: checks.length },
      objectiveCount: objectives.filter((ob) => ob.shown).length,
      keyResultCount: objectives.reduce((n, ob) => n + ob.krs.length, 0),
      text: { progress: progress === null ? "no progress yet" : percent(progress), checks: `${passed} of ${checks.length} checks pass` },
    };
  }

  /* ---------- TOON (comma delimiter, two-space indent): the codec of the calibrator, encode only ---------- */
  const NUMERIC = /^[+-]?[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?$/i;
  const KEY = /^[A-Za-z_][A-Za-z0-9_.]*$/;
  /** @type {Record<string, string>} */
  const ESC = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };

  /** @param {string} value */
  function escapeText(value) {
    let out = "";
    for (const ch of value) {
      if (ESC[ch]) out += ESC[ch];
      else if (ch.charCodeAt(0) < 0x20) out += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
      else out += ch;
    }
    return out;
  }
  /** @param {string} v */
  const needsQuotes = (v) => v === "" || v !== v.replace(/^[ \t]+|[ \t]+$/g, "") || v === "true" || v === "false" || v === "null"
    || NUMERIC.test(v) || /[:"\\[\]{}]/.test(v) || /[\x00-\x1f]/.test(v) || v.includes(",") || v.startsWith("-") || v.startsWith("#");
  /** @param {string} v */
  const encodeString = (v) => (needsQuotes(v) ? `"${escapeText(v)}"` : v);
  /** @param {string} k */
  const encodeKey = (k) => (KEY.test(k) ? k : `"${escapeText(k)}"`);
  /** Python's repr(float): fixed notation for 1e-4 <= |x| < 1e16, else d.ddde+XX. @param {number} x */
  function pyFloat(x) {
    const [mant, exp] = x.toExponential().split("e");
    const e = Number(exp), digits = mant.replace("-", "").replace(".", ""), sign = x < 0 ? "-" : "";
    if (e >= -4 && e < 16) {
      if (e < 0) return `${sign}0.${"0".repeat(-e - 1)}${digits}`;
      const whole = digits.padEnd(e + 1, "0"), frac = digits.slice(e + 1);
      return frac ? `${sign}${whole.slice(0, e + 1)}.${frac}` : `${sign}${whole}`;
    }
    return `${mant}e${e < 0 ? "-" : "+"}${String(Math.abs(e)).padStart(2, "0")}`;
  }
  /** @param {string | number | boolean | null} v */
  function encodePrimitive(v) {
    if (v === null) return "null";
    if (typeof v === "boolean") return String(v);
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return "null";
      return Number.isInteger(v) && Math.abs(v) < 1e16 ? String(v) : pyFloat(v);
    }
    return encodeString(v);
  }
  /** @typedef {string | number | boolean | null} Cell */
  /** @param {string} key @param {Cell | Record<string, Cell>[]} value @param {string[]} lines */
  function encodeEntry(key, value, lines) {
    if (!Array.isArray(value)) {
      lines.push(`${encodeKey(key)}: ${encodePrimitive(value)}`);
      return;
    }
    if (!value.length) {
      lines.push(`${encodeKey(key)}: []`);
      return;
    }
    const fields = Object.keys(value[0]);
    lines.push(`${encodeKey(key)}[${value.length}]{${fields.map(encodeKey).join(",")}}:`);
    for (const row of value) lines.push(`  ${fields.map((f) => encodePrimitive(row[f])).join(",")}`);
  }
  /** @param {Record<string, Cell | Record<string, Cell>[]>} doc */
  function encode(doc) {
    /** @type {string[]} */
    const lines = [];
    for (const [key, value] of Object.entries(doc)) encodeEntry(key, value, lines);
    return lines.join("\n");
  }

  /** @param {number | null} p a fraction */
  const round3 = (p) => (p === null ? null : Math.round(p * 1000) / 1000);
  /** @param {string} s */
  const orNull = (s) => (s === "" ? null : s);

  /**
   * The set as TOON: objectives, key results and the plain checks, one table each. A score key result writes
   * start 0 and target 1.
   * @param {ReturnType<typeof derive>} d
   */
  function toToon(d) {
    const shown = d.objectives.filter((ob) => ob.shown);
    return encode({
      format: "okr-set",
      version: 1,
      objectives: shown.map((ob) => ({
        id: ob.id, title: orNull(ob.title), type: ob.type, progress: round3(ob.progress), key_results: ob.krs.length,
      })),
      key_results: shown.flatMap((ob) => ob.krs.map((kr) => ({
        id: kr.id, objective_id: ob.id, name: kr.name, kind: kr.kind, unit: orNull(kr.unit),
        start: kr.start, target: kr.target, current: kr.current, progress: round3(kr.progress),
        owner: orNull(kr.owner), due: orNull(kr.due),
      }))),
      checks: shown.flatMap((ob) => ob.checks.concat(ob.krs.flatMap((kr) => kr.checks))).map((c) => ({
        id: c.id, rule: c.label, pass: c.pass, source: c.source, detail: c.detail,
      })),
      sources: Object.entries(SOURCES).map(([id, source]) => ({ id, title: source.title, url: source.url })),
    }) + "\n";
  }

  return { SLUG, SCHEMA_VERSION, SOURCES, OBJECTIVES, KEY_RESULTS, MIN_KR, PARTS, FIELDS, EXAMPLES, krKey, titleKey, typeKey, derive, toToon, encode };
});
