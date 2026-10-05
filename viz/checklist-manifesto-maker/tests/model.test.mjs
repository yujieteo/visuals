// The model of Checklist Manifesto Maker: deterministic drafts, schema validation, revisions, reviewer records,
// progress gates, dependencies, recovery and restart, corrections, edited active checklists and device storage.
// Each test runs the model and asserts on what it returns.
import assert from "node:assert/strict";
import test from "node:test";
import { D, F, M, failedCheckScenario, fromExample, frozen, running } from "./scenario.mjs";

const results = (/** @type {any} */ run) => Object.fromEntries(Object.entries(run.results).map(([k, v]) => [k, /** @type {any} */ (v).value]));

test("every bundled example is a valid draft with all five categories, labelled as an example, and gives no issue", () => {
  for (const x of D.examples) {
    const e = M.active(fromExample(x.id));
    assert.equal(e.checklist.example, x.id);
    assert.equal(e.checklist.revision, 1);
    assert.equal(e.run, null, "an example carries no results");
    assert.deepEqual(M.issues(e.checklist), [], x.id);
    const d = M.deriveDraft(e);
    assert.ok(d.steps > 0 && d.checks > 0, `${x.id}: steps and critical checks`);
    assert.ok(e.checklist.stopConditions.length || e.checklist.none.stop, `${x.id}: stop conditions or None specified`);
    assert.ok(e.checklist.escalationConditions.length || e.checklist.none.escalation, `${x.id}: escalation conditions or None specified`);
    assert.ok(d.recoverySteps > 0 || e.checklist.none.recovery, `${x.id}: recovery steps or None specified`);
    for (const p of d.pausePoints) assert.equal(p.target, "within", `${x.id}: ${p.title} has 5 to 9 items`);
    assert.deepEqual(M.readChecklist(M.payloadOf(e)), M.canonicalEntry(e), `${x.id} validates`);
  }
  assert.ok(D.examples.some((/** @type {any} */ x) => x.checklist.recoveryRoutes.some((/** @type {any} */ r) => r.triggers.some((/** @type {string} */ t) => /^c/.test(t)))), "one example has a failed-check recovery route");
});

test("an example creates a new draft and never replaces saved work or carries results", () => {
  let lib = fromExample("static-page");
  const first = lib.active;
  lib = M.updateActive(lib, (/** @type {any} */ e) => M.startRun(M.markReviewed(e)));
  lib = M.fromExample(lib, D.examples[1]);
  assert.equal(lib.checklists.length, 2);
  assert.notEqual(lib.active, first);
  assert.equal(M.active(lib).run, null);
  assert.ok(lib.checklists.find((/** @type {any} */ e) => e.checklist.id === first).run, "the earlier Run is kept");
});

test("pasted text becomes draft normal steps deterministically, with the original kept and nothing invented", () => {
  const text = "Pack water\n\n  Pack water  \n# Check the gate\n> quoted line\n";
  const a = F.draftFromText(text, "Trip", "cl1");
  assert.deepEqual(a, F.draftFromText(text, "Trip", "cl1"), "the same text gives the same draft");
  assert.equal(a.originalText, text);
  assert.equal(a.pausePoints.length, 1);
  assert.equal(a.pausePoints[0].mode, "", "the person chooses the mode");
  assert.deepEqual(a.pausePoints[0].items.map((/** @type {any} */ i) => [i.kind, i.text]), [["step", "Pack water"], ["step", "Pack water"], ["step", "Check the gate"], ["step", "quoted line"]]);
  const issues = M.issues(a).map((/** @type {any} */ i) => i.text).join(" ");
  assert.match(issues, /appears twice/, "the duplicate is flagged for the person to remove");
  assert.match(issues, /choose Read–Do or Do–Confirm/);
  assert.match(issues, /Stop conditions: add one, or record None specified/);
  const listed = F.pasteSteps("1. First step\n   continues here\n- [x] Second step\n* Third\nplain line");
  assert.deepEqual(listed, ["First step continues here", "Second step", "Third", "plain line"], "a list entry keeps its indented continuation");
  assert.throws(() => F.draftFromText(" \n\n", "", "cl1"), /no lines/);
  const prose = "This is a long paragraph of prose that explains the procedure in many words and is not shortened by the tool at all.";
  const long = F.draftFromText(prose, "", "cl1");
  assert.equal(long.pausePoints[0].items[0].text, prose, "prose is never summarised");
  assert.match(M.issues(long).map((/** @type {any} */ i) => i.text).join(" "), /Shorten it to one action/);
});

test("a content change makes a new revision; the same value, reviewer records and trial notes do not", () => {
  const e = frozen(M.active(fromExample("day-trip")));
  assert.equal(M.edit(e, (/** @type {any} */ d) => M.setField(d, "s1", "text", "Pack water for the day.")), e, "no change, no revision");
  const r2 = M.edit(e, (/** @type {any} */ d) => M.setField(d, "s1", "text", "Pack two litres of water."));
  assert.equal(r2.checklist.revision, 2);
  const r3 = M.edit(r2, (/** @type {any} */ d) => { M.addItem(d, "p1", "check", "Confirm the bag closes."); });
  assert.equal(r3.checklist.revision, 3);
  const reviewed = M.addReviewer(r3, { name: "Sam", date: "2026-10-05" });
  assert.equal(reviewed.checklist.revision, 3, "a reviewer record is not content");
  assert.equal(M.reviewerStatus(reviewed).current, true);
  const r4 = M.edit(reviewed, (/** @type {any} */ d) => M.setField(d, "p2", "mode", "do-confirm"));
  const status = M.reviewerStatus(r4);
  assert.deepEqual([status.current, status.stale], [false, 1], "the earlier record is stale after a content change");
  assert.match(status.text, /stale/);
  assert.throws(() => M.addReviewer(r4, { name: "", date: "2026-10-05" }), /needs a name/);
  assert.throws(() => M.addReviewer(r4, { name: "Sam", date: "5 Oct" }), /needs a date/);
});

test("review gates the first Run: errors, the author's review and a required reviewer record", () => {
  let e = M.active(fromExample("appointment"));
  assert.match(M.deriveDraft(e).blockers.join(" "), /Review revision 1 first/);
  assert.throws(() => M.startRun(e), /Review revision 1/);
  e = M.edit(e, (/** @type {any} */ d) => M.setField(d, d.id, "requiresReview", true));
  e = M.markReviewed(e);
  assert.match(M.deriveDraft(e).blockers.join(" "), /requires a reviewer record for revision 2/);
  e = M.addReviewer(e, { name: "Kim", date: "2026-10-05", note: "User supplied" });
  assert.equal(M.deriveDraft(e).canStart, true);
  const edited = M.edit(e, (/** @type {any} */ d) => M.setField(d, "s1", "text", "Pack the printed booking confirmation."));
  const d = M.deriveDraft(edited);
  assert.equal(d.canStart, false, "a new revision needs a new review and, when required, a new reviewer record");
  assert.equal(d.blockers.length, 2);
  const broken = M.edit(e, (/** @type {any} */ x) => M.setField(x, "p1", "mode", ""));
  assert.throws(() => M.markReviewed(broken), /Resolve 1 draft issue/);
});

test("design targets are suggestions: a long pause point is flagged, kept whole, and still runs", () => {
  let e = M.active(fromExample("static-page"));
  e = M.edit(e, (/** @type {any} */ d) => { for (let k = 0; k < 6; k++) M.addItem(d, "p1", "step", `Extra step ${k + 1}.`); });
  const d = M.deriveDraft(e);
  assert.equal(d.pausePoints[0].items, 12, "no item is hidden or removed");
  assert.equal(d.pausePoints[0].target, "above");
  assert.match(d.issues.find((/** @type {any} */ i) => i.target === "p1").text, /Consider another pause point/);
  assert.equal(d.errors, 0, "a target is never a blocking error");
  assert.equal(M.startRun(M.markReviewed(e)).run.checklist.pausePoints[0].items.length, 12);
});

test("the progress gate: required steps and valid critical results open it; failed, unknown and stop block it", () => {
  const e = running("static-page");
  let run = frozen(e.run);
  assert.equal(M.gate(run).open, false);
  for (const id of ["s1", "s2", "s3", "s4"]) run = M.record(run, id, "done");
  assert.equal(M.gate(run).open, false, "a normal step never passes a critical check");
  assert.throws(() => M.record(run, "s1", "passed"), /not a result for a normal step/);
  run = M.record(run, "c2", "passed");
  run = M.record(run, "c1", "unknown");
  assert.deepEqual(M.gate(run).blockers.map((/** @type {any} */ b) => b.kind), ["unknown"], "unknown does not count as passed");
  run = M.record(run, "c1", "failed");
  assert.deepEqual(M.gate(run).blockers.map((/** @type {any} */ b) => b.kind), ["failed"]);
  assert.throws(() => M.advance(run), /Critical check failed/);
  run = M.record(run, "c1", "passed");
  assert.equal(M.gate(run).open, true);
  const stopped = M.report(M.advance(run), "x1");
  assert.equal(M.gate(stopped).open, false);
  let all = stopped;
  for (const id of ["s5", "s6", "s7", "s8"]) all = M.record(all, id, "done");
  all = M.record(all, "c3", "passed");
  assert.deepEqual(M.gate(all).blockers.map((/** @type {any} */ b) => b.kind), ["stop"], "an active stop blocks even with every item valid");
  assert.equal(M.deriveRun(all).activeStops[0], "x1");
});

test("not applicable needs an authored rule and a recorded reason; optional items do not block", () => {
  let run = running("day-trip").run;
  assert.throws(() => M.record(run, "c1", "not-applicable"), /Record why/);
  run = M.record(run, "c1", "not-applicable", "No ticket is needed for the walk.");
  assert.equal(M.valid(M.find(run.checklist, "c1").node, run.results.c1), true);
  const app = running("appointment").run;
  assert.throws(() => M.record(app, "c1", "not-applicable", "because"), /no applicability rule/);
  for (const id of ["s1", "s2", "s3", "s5"]) run = M.record(run, id, "done");
  run = M.record(run, "c2", "passed");
  assert.equal(M.gate(run).open, true, "the optional snack step is not required");
});

test("an escalation report shows help and does not block; a stop without a route keeps the Run stopped until it ends", () => {
  let run = running("appointment").run;
  for (const id of ["s1", "s2", "s3"]) run = M.record(run, id, "done");
  for (const id of ["c1", "c2"]) run = M.record(run, id, "passed");
  run = M.advance(run);
  run = M.report(run, "e1");
  assert.deepEqual(M.deriveRun(run).activeEscalations, ["e1"]);
  assert.equal(M.gate(run).blockers.some((/** @type {any} */ b) => b.kind === "stop"), false);
  run = M.resolveEscalation(run, "rep1");
  assert.deepEqual(M.deriveRun(run).activeEscalations, []);
  run = M.record(run, "c3", "failed");
  assert.deepEqual(M.routesFor(run), [], "no recovery route is authored");
  assert.throws(() => M.startRecovery(run, "r1"), /not linked/);
  const ended = M.endRun(run);
  assert.equal(ended.status, "ended");
  assert.throws(() => M.record(ended, "s4", "done"), /no Run in progress/);
});

test("recovery is chosen by explicit links only, needs every step and restart check, and restarts at its destination", () => {
  let run = running("static-page").run;
  run = M.record(run, "c2", "passed");
  run = M.record(run, "s4", "done");
  run = M.record(run, "c1", "failed");
  assert.deepEqual(M.routesFor(run).map((/** @type {any} */ r) => r.id), ["r1"], "only the route linked to the failed check");
  assert.throws(() => M.startRecovery(run, "r2"), /not linked/);
  run = M.startRecovery(run, "r1");
  assert.throws(() => M.record(run, "s1", "done"), /Finish or cancel the recovery/);
  for (const id of ["a1", "a2", "a3", "k1"]) run = M.markRecovery(run, id, true);
  assert.equal(M.canRestart(run), false, "every restart check must be confirmed");
  assert.throws(() => M.restart(run), /confirm every restart check/);
  run = M.markRecovery(run, "k2", true);
  assert.equal(M.canRestart(run), true);
  assert.equal(M.gate(run).open, false, "recovery never implies restart approval or progress");
  const restarted = M.restart(run);
  assert.equal(restarted.current, "p1");
  assert.equal(restarted.recovery, null);
  assert.deepEqual(results(restarted), { ...results(run), c1: "pending", s4: "pending" }, "the failed check and its dependent step are cleared; nothing else");
  assert.match(restarted.notice, /Cleared the trigger and the results that depend on it/);
});

test("a restart with no authored dependency resets the current pause point; it closes only the route's stop reports", () => {
  let run = running("static-page").run;
  for (const id of ["s1", "s2", "s3", "s4"]) run = M.record(run, id, "done");
  for (const id of ["c1", "c2"]) run = M.record(run, id, "passed");
  run = M.advance(run);
  run = M.record(run, "s5", "done");
  run = M.report(run, "x1");
  run = M.report(run, "e1");
  assert.deepEqual(M.routesFor(run).map((/** @type {any} */ r) => r.id), ["r2"]);
  run = M.startRecovery(run, "r2");
  for (const id of ["a4", "a5", "k3"]) run = M.markRecovery(run, id, true);
  run = M.restart(run);
  assert.equal(run.current, "p1", "restart destination");
  assert.deepEqual(run.completed, [], "pause points from the destination on must be confirmed again");
  assert.equal(run.results.s5.value, "pending", "a stop has no dependencies, so the pause point where it was reported is reset");
  assert.equal(run.results.s1.value, "done", "results elsewhere stay for the person to check again");
  assert.deepEqual(run.reports.map((/** @type {any} */ r) => [r.condition, r.status]), [["x1", "resolved"], ["e1", "active"]]);
  assert.match(run.notice, /No dependencies are authored/);
});

test("a correction that invalidates later progress pauses the Run, clears dependent results and explains", () => {
  let run = running("static-page").run;
  for (const id of ["s1", "s2", "s3", "s4"]) run = M.record(run, id, "done");
  for (const id of ["c1", "c2"]) run = M.record(run, id, "passed");
  run = M.advance(run);
  run = M.record(run, "s5", "done");
  const fine = M.record(run, "c2", "not-applicable", "The site is new.");
  assert.equal(fine.current, "p2", "a correction that stays valid keeps progress");
  assert.equal(fine.hold, null);
  const corrected = M.record(run, "c1", "failed");
  assert.equal(corrected.current, "p1");
  assert.deepEqual(corrected.completed, []);
  assert.equal(corrected.results.s4.value, "pending", "the step that depends on the corrected check is cleared");
  assert.equal(corrected.results.s5.value, "done", "results that do not depend on it stay");
  assert.equal(corrected.hold.reason, "correction");
  assert.match(corrected.hold.text, /Correction: “Confirm the intended page and destination\.” is now failed\. Cleared the results that depend on it: Run the publish command\. Reopened Before publication/);
  assert.throws(() => M.record(corrected, "s1", "pending"), /Confirm the current pause point/);
  const resumed = M.confirmPausePoint(corrected);
  assert.equal(M.deriveRun(resumed).failed[0], "c1");
  assert.throws(() => M.record(resumed, "s8", "done"), /not been reached/);
});

test("changing a passed check at the current pause point clears its recorded dependents and pauses", () => {
  let run = running("static-page").run;
  run = M.record(run, "c1", "passed");
  run = M.record(run, "s4", "done");
  run = M.record(run, "c1", "unknown");
  assert.equal(run.results.s4.value, "pending");
  assert.equal(run.hold.reason, "correction");
  const transitive = M.edit(M.active(fromExample("static-page")), (/** @type {any} */ d) => M.setDependency(d, "c2", "c1", true));
  assert.deepEqual(M.dependents(transitive.checklist, ["c1"]), ["c2", "s4"], "dependencies are followed through checks");
});

test("editing the draft never changes an active Run; a new Run starts fresh on the new revision", () => {
  const scenario = failedCheckScenario();
  assert.equal(scenario.checklist.revision, 2);
  assert.equal(scenario.run.revision, 1);
  assert.equal(scenario.run.checklist.revision, 1);
  assert.equal(M.find(scenario.run.checklist, "s2").node.text, "Read the title and the first paragraph.", "the Run keeps revision 1's text");
  assert.equal(M.find(scenario.checklist, "s2").node.text, "Read the title and the first paragraph aloud.");
  const again = M.startRun(M.markReviewed(scenario));
  assert.equal(again.run.id, "run2");
  assert.equal(again.run.revision, 2);
  assert.ok(Object.values(again.run.results).every((/** @type {any} */ r) => r.value === "pending"), "fresh results");
  const reset = M.resetRun(scenario);
  assert.equal(reset.run.revision, 1, "Reset Run keeps the Run's own revision");
  assert.ok(Object.values(reset.run.results).every((/** @type {any} */ r) => r.value === "pending"));
});

test("operations are deterministic and never mutate their input", () => {
  assert.deepEqual(failedCheckScenario(), failedCheckScenario());
  const e = frozen(running("static-page"));
  const run = M.record(e.run, "s1", "done");
  assert.equal(e.run.results.s1.value, "pending");
  assert.notEqual(run, e.run);
  const def = frozen(e.checklist);
  assert.throws(() => M.addItem(def, "p1", "step"), TypeError, "editing goes through edit(), on a copy");
  assert.equal(M.edit(e, (/** @type {any} */ d) => { M.addItem(d, "p1", "step"); }).checklist.pausePoints[0].items.length, 7);
});

test("edits keep references whole: removing or reclassifying an item removes the links to it", () => {
  const e = M.edit(M.active(fromExample("static-page")), (/** @type {any} */ d) => {
    M.setKind(d, "c1", "step");
    M.removePausePoint(d, "p2");
  });
  const def = e.checklist;
  assert.deepEqual(M.find(def, "s4").node.dependsOn, ["c2"]);
  assert.deepEqual(def.recoveryRoutes.find((/** @type {any} */ r) => r.id === "r1").triggers, []);
  assert.deepEqual(def.recoveryRoutes.find((/** @type {any} */ r) => r.id === "r2").triggers, ["x1"], "the removed check's link goes; the stop condition's stays");
  assert.deepEqual(def.stopConditions[0].at, []);
  assert.deepEqual(M.readChecklist(M.payloadOf(e)), M.canonicalEntry(e), "the edited checklist is still valid");
  assert.throws(() => M.edit(e, (/** @type {any} */ d) => M.setNone(d, "stop", true)), /Remove the entries/);
});

test("validation refuses unknown fields, bad categories, results, ids and references before anything changes", () => {
  const good = M.payloadOf(failedCheckScenario());
  const bad = (/** @type {(doc: any) => void} */ fn, /** @type {RegExp} */ why) => {
    const doc = JSON.parse(JSON.stringify(good));
    fn(doc);
    assert.throws(() => M.readChecklist(doc), why);
  };
  bad((d) => { d.checklist.colour = "red"; }, /unknown field colour/);
  bad((d) => { d.checklist.pausePoints[0].items[0].kind = "warning"; }, /not a category/);
  bad((d) => { d.checklist.pausePoints[0].mode = "skim"; }, /not a mode/);
  bad((d) => { d.run.results.s1.value = "passed"; }, /not a result for a normal step/);
  bad((d) => { d.run.results.c2.reason = ""; }, /needs an authored applicability rule and a recorded reason/);
  bad((d) => { d.checklist.pausePoints[1].items[0].id = "s1"; }, /duplicate id s1/);
  bad((d) => { d.checklist.pausePoints[0].items[5].dependsOn = ["nope"]; }, /not another critical check/);
  bad((d) => { d.checklist.recoveryRoutes[0].restartAt = "p9"; }, /restartAt: is not a pause point/);
  bad((d) => { d.run.revision = 2; }, /Run's checklist is revision 1/);
  bad((d) => { d.run.checklist.recoveryRoutes[0].restartAt = ""; }, /run\.checklist: has a blocking issue: Recovery route “.*” has no restart destination/);
  bad((d) => { d.run.checklist.id = "cl9"; }, /belongs to another checklist/);
  bad((d) => { d.reviewers[0].revision = 3; }, /later than the checklist/);
  bad((d) => { d.run.current = "p7"; }, /not a pause point of the Run's revision/);
  bad((d) => { d.checklist.id = "Has Spaces"; }, /not a valid id/);
  assert.throws(() => M.readChecklist({ ...good, schemaVersion: 2 }), /schema version 2; this page reads version 1\. Nothing was changed/);
  assert.throws(() => M.readChecklist({ ...good, format: "other" }), /not a checklist-manifesto-maker document/);
  assert.throws(() => M.readChecklist({ ...good, schemaVersion: "1" }), /no schema version/);
});

test("device storage: save after a change, restore with a hold, report refusal, and never overwrite unreadable data", () => {
  const memory = () => {
    const map = new Map();
    return { map, getItem: (/** @type {string} */ k) => map.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { map.set(k, v); }, removeItem: (/** @type {string} */ k) => { map.delete(k); } };
  };
  const store = memory();
  const empty = M.loadLibrary(store);
  assert.deepEqual([empty.status.mode, empty.lib.checklists.length], ["ok", 0]);
  let lib = fromExample("static-page");
  lib = M.updateActive(lib, (/** @type {any} */ e) => ({ ...e, run: M.record(M.startRun(M.markReviewed(e)).run, "s1", "done") }));
  assert.deepEqual(M.saveLibrary(store, lib, empty.status), { mode: "ok", reason: "" });
  const back = M.loadLibrary(store);
  assert.equal(back.restored, 1);
  const run = M.active(back.lib).run;
  assert.equal(run.results.s1.value, "done", "progress survives a reload");
  assert.equal(run.current, "p1", "a reload never advances the procedure");
  assert.equal(run.hold.reason, "restored");
  assert.throws(() => M.record(run, "s2", "done"), /Confirm the current pause point/);
  assert.equal(M.record(M.confirmPausePoint(run), "s2", "done").results.s2.value, "done");
  const refusing = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => {} };
  assert.equal(M.saveLibrary(refusing, lib, { mode: "ok", reason: "" }).mode, "unavailable", "a refused save is reported, never claimed");
  const sealed = { getItem: () => { throw new Error("SecurityError"); } };
  assert.equal(M.loadLibrary(sealed).status.mode, "unavailable");
  for (const raw of [JSON.stringify({ ...JSON.parse(store.map.get(M.STORAGE_KEY)), schemaVersion: 2 }), "{not json"]) {
    const old = memory();
    old.map.set(M.STORAGE_KEY, raw);
    const read = M.loadLibrary(old);
    assert.equal(read.status.mode, "blocked");
    assert.equal(M.saveLibrary(old, lib, read.status).mode, "blocked");
    assert.equal(old.map.get(M.STORAGE_KEY), raw, "unsupported or unreadable saved data is left unchanged");
  }
  assert.equal(M.saveLibrary(store, M.removeEntry(lib, lib.active), { mode: "ok", reason: "" }).mode, "ok");
  assert.equal(store.map.has(M.STORAGE_KEY), false, "deleting the last checklist leaves no saved data");
});

test("imports join the library: a copy gets a new id with its Run, and Replace keeps the current id", () => {
  const scenario = failedCheckScenario();
  let lib = fromExample("static-page");
  lib = M.addEntry(lib, scenario);
  assert.equal(lib.checklists.length, 2);
  const copy = M.active(lib);
  assert.notEqual(copy.checklist.id, scenario.checklist.id);
  assert.equal(copy.run.checklist.id, copy.checklist.id, "the Run moves with its checklist");
  const replaced = M.replaceActive(lib, scenario);
  assert.equal(M.active(replaced).checklist.id, copy.checklist.id);
  assert.equal(M.active(replaced).run.checklist.id, copy.checklist.id);
  assert.deepEqual(M.readLibrary(JSON.parse(JSON.stringify(replaced))), replaced, "the library stays valid");
});

test("a route triggered by a stop condition cannot restart after the first pause point where that stop applies", () => {
  const e = M.active(fromExample("day-trip"));
  const later = (/** @type {string[]} */ at) => M.edit(e, (/** @type {any} */ def) => {
    def.stopConditions[0].at = at;
    def.recoveryRoutes[0].triggers = ["x1"];
    def.recoveryRoutes[0].restartAt = "p2";
  });
  const errors = (/** @type {any} */ x) => M.issues(x.checklist).filter((/** @type {any} */ i) => i.level === "error").map((/** @type {any} */ i) => i.text);
  for (const at of [[], ["p1"], ["p1", "p2"]]) {
    assert.deepEqual(errors(later(at)), ["Recovery route “Find or replace the documents” restarts after the first pause point where stop condition “The required travel documents are missing.” applies; a restart cannot skip pause points."], JSON.stringify(at));
    assert.throws(() => M.markReviewed(later(at)), /Resolve 1 draft issue/);
  }
  assert.deepEqual(errors(later(["p2"])), [], "a stop that applies only at the restart pause point is fine");
});
