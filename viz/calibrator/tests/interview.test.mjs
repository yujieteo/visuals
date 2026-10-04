import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("index.html");
const engine = /<script id="calibrator-engine">\n([\s\S]*?)<\/script>/.exec(html)[1];
const ctx = {}; ctx.self = ctx; vm.runInNewContext(engine, ctx);
const C = ctx.Calibrator, I = C.Interview;
const plain = (v) => JSON.parse(JSON.stringify(v));
const sample = read("sample-interview.toon");
const T0 = Date.parse("2026-10-04T09:00:00Z");
const start = () => I.display(I.newState(I.parse(sample), T0), T0);
const fill = (s, text, confidence = "", event_date = "") => I.setDraft(s, { text, confidence, event_date });
const Q1 = "interview-2026-10-04-sample-01", Q2 = "interview-2026-10-04-sample-02";
// The sample batch under another batch_id.
const otherBatch = () => {
  const d = JSON.parse(read("tests/fixtures/sample-interview.json"));
  d.batch.batch_id = "other-batch";
  d.questions.forEach((q) => { q.batch_id = "other-batch"; });
  return I.validate(d);
};

test("interview import: the sample batch decodes, validates and opens question 1, apart from probability sessions", () => {
  assert.equal(C.formatOf(sample), "optchat-interview");
  assert.equal(C.formatOf(read("sample-session.toon")), "calibrator-session");
  assert.throws(() => C.formatOf("not toon at all: ["), C.ToonError);
  assert.deepEqual(plain(C.decode(sample)), JSON.parse(read("tests/fixtures/sample-interview.json")));
  assert.equal(C.encode(JSON.parse(read("tests/fixtures/sample-interview.json"))), sample, "byte for byte what scripts/toon.py writes");
  const { doc } = I.parse(sample);
  assert.equal(doc.questions.length, 10);
  assert.deepEqual(plain(Object.keys(doc.questions[0])), plain(I.FIELDS.questions));
  const s = start();
  assert.equal(s.current, 0);
  assert.equal(s.shown[Q1], T0);
  assert.deepEqual(plain(I.counts(s)), { answered: 0, dont_remember: 0, skipped: 0, unseen: 10, drafts: 0, total: 10 });
  assert.ok(Object.isFrozen(s.doc.questions[0]), "imported questions are immutable");
  // The two formats never cross: each parser refuses the other's document.
  assert.throws(() => C.parseSession(sample), C.SchemaError);
  assert.throws(() => I.parse(read("sample-session.toon")), /format must be optchat-interview/);
  // raw.json, published as data.json, describes the same schema the engine enforces.
  const meta = JSON.parse(read("raw.json")).interview;
  assert.equal(meta.format, I.FORMAT);
  assert.equal(meta.version, I.VERSION);
  assert.deepEqual(meta.import_fields, plain(I.FIELDS));
  assert.deepEqual(meta.export_fields, plain(I.EXPORT_FIELDS));
  assert.deepEqual(meta.states, plain(I.STATES));
  assert.deepEqual(meta.answer_kinds, plain(I.KINDS));
});

test("interview validation: schema violations are refused with a reason", () => {
  const doc = () => JSON.parse(read("tests/fixtures/sample-interview.json"));
  const refuse = (mutate, reason) => { const d = doc(); mutate(d); assert.throws(() => I.validate(d), reason); };
  refuse((d) => { d.version = 2; }, /version must be 1/);
  refuse((d) => { d.extra = 1; }, /unknown top-level key extra/);
  refuse((d) => { d.questions = []; }, /no questions/);
  refuse((d) => { d.questions[1].question_id = d.questions[0].question_id; }, /duplicate question_id/);
  refuse((d) => { d.questions[0].batch_id = "other"; }, /batch_id does not match/);
  refuse((d) => { d.questions[0].prompt = ""; }, /question 1/);
  refuse((d) => { d.questions[0].period = "2017/2015"; }, /period must be/);
  refuse((d) => { d.questions[0].mood = "x"; }, /unknown field mood/);
  refuse((d) => { d.evidence = d.evidence.filter((e) => e.question_id !== Q2); }, /has no evidence/);
  refuse((d) => { d.evidence[0].ref = "a note I read"; }, /ref must look like optchat/);
  refuse((d) => { d.evidence[0].question_id = "nope"; }, /unknown question_id nope/);
  refuse((d) => { d.responses = []; }, /needs both responses and answers/);
  // An exported batch: revisions in order, states that agree with the answers, valid confidence and dates.
  const exported = () => JSON.parse(read("tests/fixtures/interview-export.json"));
  const refuseExport = (mutate, reason) => { const d = exported(); mutate(d); assert.throws(() => I.validate(d), reason); };
  refuseExport((d) => { d.answers[1].revision = 3; }, /must run 1, 2, 3 in order/);
  refuseExport((d) => { d.answers[0].confidence = 101; }, /confidence must be an integer/);
  refuseExport((d) => { d.answers[0].event_date = "late nineties"; }, /event_date must be/);
  refuseExport((d) => { d.answers[0].text = null; }, /answer 1/);
  refuseExport((d) => { d.answers[0].kind = "guess"; }, /kind must be answer or dont_remember/);
  refuseExport((d) => { d.responses[2].state = "answered"; }, /does not match the answers/);
  refuseExport((d) => { d.responses[0].state = "skipped"; }, /does not match the answers/);
  refuseExport((d) => { d.responses.reverse(); }, /follow the question order/);
  for (const [v, ok] of [["2015", true], ["2015-06", true], ["2015-06-12", true], ["2014/2016", true], ["2016/2014", false], ["2015-13", false], ["2015-6", false], ["1/2/3", false]]) {
    assert.equal(I.approxDate(v), ok, v);
  }
});

test("interview drafts: typed text is kept per question, and a draft equal to the saved answer is dropped", () => {
  let s = fill(start(), "Half an answer");
  assert.deepEqual(plain(I.form(s)), { text: "Half an answer", confidence: "", event_date: "" });
  assert.equal(I.counts(s).drafts, 1);
  assert.equal(I.stateOf(s, Q1), "unseen", "a draft is not a submission");
  // Moving on and back keeps the draft; Skip never erases it.
  s = I.display(I.back(I.skip(s, T0 + 1000).state), T0 + 2000);
  assert.equal(I.form(s).text, "Half an answer");
  s = fill(s, "");
  assert.equal(I.counts(s).drafts, 0, "clearing the form leaves no draft");
  s = I.submit(fill(s, "Full answer", "80", "2015"), T0 + 3000).state;
  s = fill(I.back(s), "Full answer", "80", "2015");
  assert.equal(I.counts(s).drafts, 0, "the saved answer is not a draft");
  assert.deepEqual(plain(I.form(s)), { text: "Full answer", confidence: "80", event_date: "2015" });
});

test("interview submission: explicit, the first answer is kept, later changes append revisions", () => {
  let s = start();
  assert.throws(() => I.submit(s, T0 + 100), /Write an answer first/);
  assert.throws(() => I.submit(fill(s, "x", "1.5"), T0 + 100), /Confidence must be a whole number/);
  assert.throws(() => I.submit(fill(s, "x", "", "June"), T0 + 100), /When must be/);
  let r = I.submit(fill(s, "  First answer  ", "70", "2015-06"), T0 + 1000);
  assert.deepEqual([r.first, r.added, r.advanced, r.state.current], [true, true, true, 1]);
  s = r.state;
  assert.deepEqual(plain(s.submissions[Q1]), [{ kind: "answer", text: "First answer", confidence: 70, event_date: "2015-06", at: T0 + 1000 }]);
  // An unchanged submission appends nothing, and still moves on.
  r = I.submit(I.back(s), T0 + 2000);
  assert.deepEqual([r.added, r.state.current, r.state.submissions[Q1].length], [false, 1, 1]);
  // A changed one appends a revision; the first never changes.
  s = I.submit(fill(I.back(r.state), "Second answer", "", ""), T0 + 3000).state;
  assert.deepEqual(plain(s.submissions[Q1].map((a) => [a.text, a.confidence, a.event_date])), [["First answer", 70, "2015-06"], ["Second answer", null, null]]);
  assert.ok(Object.isFrozen(s.submissions[Q1][0]));
  // The last question stays on screen and reports the end.
  let end = s;
  while (!I.isLast(end)) end = I.skip(end, T0 + 4000).state;
  r = I.submit(fill(end, "Last"), T0 + 5000);
  assert.deepEqual([r.end, r.advanced, r.state.current], [true, false, 9]);
});

test("interview I don't remember and Skip: distinct states, and neither erases an answer", () => {
  let s = start();
  s = I.dontRemember(s, T0 + 1000).state;
  assert.equal(I.stateOf(s, Q1), "dont_remember");
  s = I.skip(s, T0 + 2000).state;
  assert.equal(I.stateOf(s, Q2), "skipped");
  // Skip on an answered or dont_remember question keeps it.
  s = I.skip(I.back(I.back(s)), T0 + 3000).state;
  assert.equal(I.stateOf(s, Q1), "dont_remember");
  // Remembering later appends an answer after the dont_remember submission.
  s = I.submit(fill(I.back(s), "It came back to me"), T0 + 4000).state;
  assert.equal(I.stateOf(s, Q1), "answered");
  assert.deepEqual(plain(s.submissions[Q1].map((a) => a.kind)), ["dont_remember", "answer"]);
  // Answering a skipped question makes it answered.
  s = I.submit(fill(s, "Now I answer"), T0 + 5000).state;
  assert.equal(I.stateOf(s, Q2), "answered");
  assert.deepEqual(plain(I.counts(s)), { answered: 2, dont_remember: 0, skipped: 0, unseen: 8, drafts: 0, total: 10 });
});

test("interview export round-trip: the export is the site's TOON, and imports again to continue", () => {
  let s = start();
  s = fill(s, "Example answer: a school near home. I remember the walk from the bus stop.", "90", "1998/2001");
  s = I.submit(s, T0 + 60000).state; s = I.display(s, T0 + 61000);
  s = I.dontRemember(s, T0 + 70000).state; s = I.display(s, T0 + 71000);
  s = I.skip(s, T0 + 72000).state; s = I.display(s, T0 + 73000);
  s = I.display(I.back(I.back(I.back(s))), T0 + 80000);
  s = fill(s, "Example answer, revised: the same school, from 1998 to 2001. The walk took twenty minutes.", "95", "1998/2001");
  s = I.submit(s, T0 + 90000).state;
  const text = I.exportToon(s, T0 + 100000);
  assert.deepEqual(plain(I.exportDocument(s, T0 + 100000)), JSON.parse(read("tests/fixtures/interview-export.json")));
  assert.equal(text, read("tests/fixtures/interview-export.toon"), "byte for byte what scripts/toon.py writes");
  // Drafts stay on the device: an unsent draft is never exported.
  assert.equal(I.exportToon(fill(I.display(I.skip(I.skip(I.skip(s, T0).state, T0).state, T0).state, T0), "unsent"), T0 + 100000).includes("unsent"), false);
  // The export imports again with every submission, skip and display time, and exports the same.
  const again = I.newState(I.parse(text), T0 + 200000);
  assert.deepEqual(plain(again.submissions), plain(s.submissions));
  assert.deepEqual(plain(again.skipped), plain(s.skipped));
  assert.deepEqual(plain(again.shown), plain(s.shown));
  assert.equal(I.exportToon({ ...again, imported_at: s.imported_at }, T0 + 100000), text);
  // A revision made after the re-import appends as revision 3.
  const more = I.submit(fill(again, "Third version"), T0 + 300000).state;
  const rows = I.exportDocument(more, T0 + 400000).answers.filter((a) => a.question_id === Q1);
  assert.deepEqual(plain(rows.map((a) => a.revision)), [1, 2, 3]);
});

test("interview merge: a stale copy on this device takes the imported file's later revisions", () => {
  // Device A answers Q1 and revises it; device B keeps a stale copy with revision 1 only.
  const a1 = I.submit(fill(start(), "First"), T0 + 1000).state;
  const stale = I.markExported(a1, T0 + 1500);
  const a2 = I.submit(fill(I.back(I.display(a1, T0 + 2000)), "Second"), T0 + 3000).state;
  const fromA = I.parse(I.exportToon(a2, T0 + 4000));
  const merged = I.import(fromA, [null, stale], T0 + 5000);
  assert.deepEqual(plain(merged.submissions[Q1].map((x) => x.text)), ["First", "Second"]);
  assert.equal(merged.exported_at, stale.exported_at, "the device copy keeps its own state");
  assert.equal(I.unfinished(merged), true, "the merged revisions are not yet exported from this device");
  // A new answer on device B is revision 3, never a second revision 2.
  const next = I.submit(fill(I.display(I.back(merged), T0 + 6000), "Third"), T0 + 7000).state;
  const rows = I.exportDocument(next, T0 + 8000).answers.filter((x) => x.question_id === Q1);
  assert.deepEqual(plain(rows.map((x) => [x.revision, x.text])), [[1, "First"], [2, "Second"], [3, "Third"]]);
  // The stale file imported into the newer copy adds nothing and loses nothing.
  const back = I.import(I.parse(I.exportToon(stale, T0)), [null, next], T0 + 9000);
  assert.deepEqual(plain(back.submissions), plain(next.submissions));
  assert.equal(back.changed_at, next.changed_at);
  // The same revision with other content in the two copies stops the import.
  const other = I.submit(fill(I.back(I.display(a1, T0 + 2000)), "Other second"), T0 + 3000).state;
  assert.throws(() => I.import(fromA, [null, other], T0 + 5000), /revision 2 of .* is different in the two copies/);
  // A copy of another batch is not merged.
  const fresh = I.import(otherBatch(), [null, next], T0);
  assert.deepEqual(plain(fresh.submissions), {});
});

test("interview merge: the original batch imported again after a replace continues the previous copy's revisions", () => {
  // Batch X is answered, then replaced by another batch, so it moves to calibrator:interview-previous.
  let x = I.submit(fill(start(), "First"), T0 + 1000).state;
  x = I.submit(fill(I.back(I.display(x, T0 + 2000)), "Second"), T0 + 3000).state;
  const previous = I.deserialize(I.serialize(x));
  const y = I.display(I.newState(otherBatch(), T0), T0);
  // The original, unanswered file of X is imported again: the previous copy's answers come back.
  const again = I.import(I.parse(sample), [previous, y], T0 + 5000);
  assert.deepEqual(plain(again.submissions[Q1].map((x) => x.text)), ["First", "Second"]);
  const next = I.submit(fill(I.display(I.back(again), T0 + 6000), "Third"), T0 + 7000).state;
  const rows = I.exportDocument(next, T0 + 8000).answers.filter((a) => a.question_id === Q1);
  assert.deepEqual(plain(rows.map((a) => [a.revision, a.text])), [[1, "First"], [2, "Second"], [3, "Third"]]);
  // The export of the continued batch is valid and imports again.
  assert.equal(I.parse(I.exportToon(next, T0 + 8000)).history[Q1].length, 3);
});

test("interview persistence: a saved interview restores position, submissions, skips and drafts", () => {
  let s = I.submit(fill(start(), "One", "60"), T0 + 1000).state;
  s = I.skip(I.display(s, T0 + 2000), T0 + 2500).state;
  s = fill(I.display(s, T0 + 3000), "unsent draft");
  const restored = I.deserialize(I.serialize(s));
  assert.deepEqual(plain(restored), plain(s));
  assert.ok(Object.isFrozen(restored.doc.questions[0]));
  assert.ok(Object.isFrozen(restored.submissions[Q1][0]));
  assert.equal(I.form(restored).text, "unsent draft");
  assert.throws(() => I.deserialize("{}"), /Not a saved interview/);
  assert.throws(() => I.deserialize(C.serialize(C.newState(C.parseSession(read("sample-session.toon")), T0))), /Not a saved interview/);
  assert.throws(() => I.deserialize(I.serialize({ ...s, current: 10 })), /out of range/);
  assert.throws(() => I.deserialize(I.serialize({ ...s, drafts: { nope: { text: "" } } })), /unknown question nope/);
  // Unfinished until exported with no unseen question and no change after the export.
  assert.equal(I.unfinished(s), true);
  let done = s;
  while (!I.isLast(done)) done = I.skip(done, T0 + 4000).state;
  done = I.skip(done, T0 + 4000).state;
  done = I.markExported(done, T0 + 5000);
  assert.equal(I.unfinished(done), false);
  assert.equal(I.unfinished(I.submit(fill(done, "late"), T0 + 6000).state), true);
});
