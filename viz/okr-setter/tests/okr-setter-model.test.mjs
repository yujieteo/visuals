// OKR Setter: the model's own fixtures (§36) and invariants (§37), computed by hand and independent of the page.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Model = require("../src/model.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const blank = Model.EXAMPLES.find((/** @type {{ id: string }} */ e) => e.id === "blank")?.state ?? {};
/** @param {Record<string, string | number>} patch */
const at = (patch) => Model.derive(VisualKit.normalize(Model.FIELDS, patch, blank).state);
const near = (/** @type {number | null} */ a, /** @type {number} */ b) => assert.ok(a !== null && Math.abs(a - b) < 1e-12, `${a} is not ${b}`);

test("known cases: a rising value, a falling value and a score give 40%, 50% and 60%, and the objective their mean", () => {
  const d = at({
    o1_title: "Grow", o1_k1_name: "Rise", o1_k1_unit: "u", o1_k1_start: 40, o1_k1_target: 70, o1_k1_current: 52,
    o1_k2_name: "Fall", o1_k2_unit: "days", o1_k2_start: 9, o1_k2_target: 3, o1_k2_current: 6,
    o1_k3_name: "Score", o1_k3_kind: "score", o1_k3_start: 0.2, o1_k3_target: 0.7, o1_k3_current: 0.5,
  });
  const [rise, fall, score] = d.objectives[0].krs;
  near(rise.progress, 0.4);
  near(fall.progress, 0.5);
  near(score.progress, 0.6);
  near(d.objectives[0].progress, 0.5);
  assert.equal(rise.text.progress, "40%");
  assert.equal(d.text.progress, "50%");
});

test("known cases: progress is held between 0 and 100% for the bar, and a target equal to the start has none", () => {
  const d = at({
    o1_title: "Edge", o1_k1_name: "Over", o1_k1_unit: "u", o1_k1_target: 100, o1_k1_current: 120,
    o1_k2_name: "Under", o1_k2_unit: "u", o1_k2_target: 100, o1_k2_current: -5,
    o1_k3_name: "Flat", o1_k3_unit: "u", o1_k3_start: 5, o1_k3_target: 5, o1_k3_current: 5,
  });
  const [over, under, flat] = d.objectives[0].krs;
  assert.deepEqual([over.progress, over.raw, under.progress, flat.progress], [1, 1.2, 0, null]);
  assert.equal(flat.measurable, false);
  near(d.objectives[0].progress, 0.5);
});

test("known cases: the checks name what is wrong with a weak key result and a weak objective", () => {
  const d = at({ o1_title: "Keep onboarding going", o1_k1_name: "Help the team analyze churn", o1_k1_target: 0 });
  const failing = (/** @type {{ pass: boolean, id: string }[]} */ checks) => checks.filter((c) => !c.pass).map((c) => c.id);
  assert.deepEqual(failing(d.objectives[0].checks), ["o1-action", "o1-count"]);
  assert.deepEqual(failing(d.objectives[0].krs[0].checks), ["o1-k1-measurable", "o1-k1-outcome", "o1-k1-timebound"]);
  assert.equal(d.objectives[0].krs[0].checks[0].detail, "The target equals the start, so there is nothing to measure.");
  assert.equal(d.objectives[0].krs[0].checks[1].detail, '"help" describes an activity: name the result instead.');
  assert.equal(d.objectives[0].checks[1].detail, '"keep" describes upkeep: say what will change.');
});

test("known cases: a real due date is time-bound, a date that does not exist or is missing is not", () => {
  const base = { o1_k1_name: "A", o1_k1_unit: "u" };
  assert.equal(at({ ...base, o1_k1_due: "2026-12-31" }).objectives[0].krs[0].checks[2].pass, true);
  assert.equal(at({ ...base, o1_k1_due: "2026-02-30" }).objectives[0].krs[0].checks[2].detail, "The due date is not a real date.");
  assert.equal(at({ ...base, o1_k1_due: "" }).objectives[0].krs[0].checks[2].detail, "No due date is set.");
});

test("known cases: 3 to 5 key results passes, 2 fails", () => {
  const three = at({ o1_title: "T", o1_k1_name: "A", o1_k2_name: "B", o1_k3_name: "C" });
  const two = at({ o1_title: "T", o1_k1_name: "A", o1_k2_name: "B" });
  assert.equal(three.objectives[0].checks[2].pass, true);
  assert.equal(two.objectives[0].checks[2].pass, false);
  assert.equal(two.objectives[0].checks[2].detail, "It has 2 key results.");
});

test("known cases: the grade reads a committed objective against 1.0 and an aspirational one against 0.6 to 0.7", () => {
  const kr = { o1_title: "T", o1_k1_name: "A", o1_k1_unit: "u", o1_k1_target: 100 };
  const grade = (/** @type {string} */ type, /** @type {number} */ current) => at({ ...kr, o1_type: type, o1_k1_current: current }).objectives[0].grade;
  assert.equal(grade("committed", 100), "Committed: fully achieved, as expected.");
  assert.equal(grade("committed", 80), "Committed: expected to reach 1.0, now 0.80. Google asks for an explanation of anything less.");
  assert.equal(grade("aspirational", 65), "Aspirational: 0.65 is in the 0.6 to 0.7 sweet spot.");
  assert.equal(grade("aspirational", 30), "Aspirational: 0.30 is outside the 0.6 to 0.7 sweet spot.");
  assert.equal(grade("aspirational", 100), "Aspirational: at 1.0. Always reaching 1.0 can mean the objective was not ambitious enough.");
});

const SOURCES_TOON = [
  "sources[4]{id,title,url}:",
  '  doerr,"John Doerr, Measure What Matters: what is an OKR (What Matters)","https://www.whatmatters.com/faqs/okr-meaning-definition-example"',
  '  rework,"Google re:Work: Set goals with OKRs","https://rework.withgoogle.com/en/guides/set-goals-with-okrs"',
  "  playbook,Google's OKR Playbook (What Matters),\"https://www.whatmatters.com/resources/google-okr-playbook\"",
  '  mistakes,Common OKR mistakes (What Matters),"https://www.whatmatters.com/faqs/common-okr-mistakes"',
];

test("known cases: the TOON of a one-key-result set is the literal text, quoting a title with a comma", () => {
  const d = at({
    o1_title: "Grow, fast", o1_k1_name: "Signups", o1_k1_unit: "users", o1_k1_start: 10, o1_k1_target: 50, o1_k1_current: 20,
    o1_k1_owner: "Ana", o1_k1_due: "2026-12-31",
  });
  assert.equal(Model.toToon(d), [
    "format: okr-set",
    "version: 1",
    "objectives[1]{id,title,type,progress,key_results}:",
    '  o1,"Grow, fast",aspirational,0.25,1',
    "key_results[1]{id,objective_id,name,kind,unit,start,target,current,progress,owner,due}:",
    "  o1-k1,o1,Signups,value,users,10,50,20,0.25,Ana,2026-12-31",
    "checks[6]{id,rule,pass,source,detail}:",
    "  o1-title,Has a title,true,doerr,The objective is named.",
    '  o1-action,"Action-oriented, not upkeep",true,rework,The title has no upkeep word.',
    "  o1-count,Has 3 to 5 key results,false,doerr,It has 1 key result.",
    "  o1-k1-measurable,Measurable,true,doerr,The target differs from the start.",
    '  o1-k1-outcome,"An outcome, not an activity",true,rework,The name has no activity word.',
    "  o1-k1-timebound,Time-bound,true,doerr,Due 2026-12-31.",
    ...SOURCES_TOON,
    "",
  ].join("\n"));
});

test("known cases: the blank set encodes as empty tables, with the sources", () => {
  assert.equal(Model.toToon(at({})), ["format: okr-set", "version: 1", "objectives: []", "key_results: []", "checks: []", ...SOURCES_TOON, ""].join("\n"));
});

test("invariants: every check and every rule names a source the page links", () => {
  const raw = require("../raw.json");
  for (const rule of raw.rules) assert.ok(rule.source in Model.SOURCES, rule.text);
  for (const example of Model.EXAMPLES) {
    const d = Model.derive(VisualKit.normalize(Model.FIELDS, example.state).state);
    for (const ob of d.objectives) for (const c of ob.checks.concat(ob.krs.flatMap((/** @type {{ checks: any[] }} */ kr) => kr.checks))) assert.ok(c.source in Model.SOURCES, c.id);
  }
  for (const source of Object.values(Model.SOURCES)) assert.match(source.url, /^https:\/\//);
});

test("invariants: the shipped examples follow the rules, and the faults example breaks them", () => {
  const failing = (/** @type {string} */ id) => {
    const example = Model.EXAMPLES.find((/** @type {{ id: string }} */ e) => e.id === id) ?? { state: {} };
    const d = Model.derive(VisualKit.normalize(Model.FIELDS, example.state).state);
    return d.checks.total - d.checks.passed;
  };
  assert.deepEqual([failing("onboarding"), failing("race"), failing("blank")], [0, 0, 0]);
  assert.equal(failing("needs-work"), 6);
});

test("invariants: every example is a full state, derives progress in 0..1 and counts its checks", () => {
  for (const example of Model.EXAMPLES) {
    assert.deepEqual(Object.keys(example.state).sort(), Object.keys(Model.FIELDS).sort(), `${example.id} sets every field`);
    const d = Model.derive(VisualKit.normalize(Model.FIELDS, example.state).state);
    for (const ob of d.objectives) {
      assert.ok(ob.progress === null || (ob.progress >= 0 && ob.progress <= 1), `${example.id} ${ob.id}`);
      for (const kr of ob.krs) assert.ok(kr.progress === null || (kr.progress >= 0 && kr.progress <= 1), `${example.id} ${kr.id}`);
    }
    assert.ok(d.checks.passed <= d.checks.total);
  }
});

test("known cases: a score with no target is not measurable, and a score off the 0 to 1 scale is not either", () => {
  const faults = Model.EXAMPLES.find((/** @type {{ id: string }} */ e) => e.id === "needs-work")?.state ?? {};
  const asScore = at({ ...faults, o1_k1_kind: "score", o1_k1_current: 0.5, o1_k1_due: "2026-12-31" }).objectives[0].krs[0];
  assert.equal(asScore.name, "Improve onboarding");
  assert.equal(asScore.measurable, false);
  assert.equal(asScore.progress, null);
  assert.equal(asScore.checks[0].detail, "The target equals the start, so there is nothing to measure.");
  const off = at({ o1_k1_name: "S", o1_k1_kind: "score", o1_k1_start: 0, o1_k1_target: 9, o1_k1_current: 0.3 }).objectives[0].krs[0];
  assert.equal(off.measurable, false);
  assert.equal(off.checks[0].detail, "A score's start, target and current must be between 0 and 1.");
});

test("known cases: a number with no unit is measurable when its target differs from its start", () => {
  const nps = at({ o1_k1_name: "Net Promoter Score", o1_k1_start: 30, o1_k1_target: 50, o1_k1_current: 40 }).objectives[0].krs[0];
  assert.equal(nps.measurable, true);
  assert.equal(nps.checks[0].detail, "The target differs from the start.");
  near(nps.progress, 0.5);
});

test("known cases: the activity check flags the re:Work verbs, not outcome nouns that share a stem", () => {
  const outcome = (/** @type {string} */ name) => at({ o1_k1_name: name }).objectives[0].krs[0].checks[1].pass;
  assert.equal(outcome("Analytics dashboards adopted by 50 teams"), true);
  assert.equal(outcome("Helpdesk tickets closed same day"), true);
  assert.equal(outcome("Consulted with 10 customers"), false);
  assert.equal(outcome("Participating in standups"), false);
  assert.equal(outcome("Analyzes churn"), false);
});

test("invariants: the default state is the first example, and the blank example has no objectives", () => {
  assert.deepEqual(VisualKit.defaults(Model.FIELDS), Model.EXAMPLES[0].state);
  assert.equal(Model.derive(blank).objectiveCount, 0);
  assert.equal(Model.derive(blank).progress, null);
});
