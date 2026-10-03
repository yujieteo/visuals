import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { checkSession, polarity } from "../scripts/polarity.mjs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("index.html");
const engine = /<script id="calibrator-engine">\n([\s\S]*?)<\/script>/.exec(html)[1];
const load = () => { const ctx = {}; ctx.self = ctx; vm.runInNewContext(engine, ctx); return ctx.Calibrator; };
const C = load();
const plain = (v) => JSON.parse(JSON.stringify(v));
const sample = read("sample-session.toon");
const T0 = Date.parse("2026-10-02T09:00:00Z");
const start = () => C.display(C.newState(C.parseSession(sample), T0), T0);
const ids = (s) => s.doc.questions.map((q) => q.question_id);

test("valid session import: the sample decodes, validates and opens question 1", () => {
  const doc = C.parseSession(sample);
  assert.equal(doc.session.session_id, "2026-10-02-sample");
  assert.equal(doc.questions.length, 5);
  assert.deepEqual(plain(Object.keys(doc.questions[0])), plain(C.FIELDS.questions));
  assert.equal(doc.questions[0].outcome, null);
  assert.equal(doc.sources.length, 7);
  // The page's codec reads and writes the files the site's scripts/toon.py writes, byte for byte.
  assert.deepEqual(plain(C.decode(sample)), JSON.parse(read("tests/fixtures/sample-session.json")));
  assert.equal(C.encode(JSON.parse(read("tests/fixtures/sample-session.json"))), sample);
  const edge = JSON.parse(read("tests/fixtures/edge.json"));
  assert.equal(C.encode(edge), read("tests/fixtures/edge.toon"));
  assert.deepEqual(plain(C.decode(read("tests/fixtures/edge.toon"))), edge);
  const s = start();
  assert.equal(s.current, 0);
  assert.deepEqual(plain(C.counts(s)), { answered: 0, skipped: 0, unseen: 5, total: 5 });
  assert.ok(Object.isFrozen(s.doc.questions[0]), "imported questions are immutable");
  // raw.json, published as data.json, describes the same schema the engine enforces.
  const meta = JSON.parse(read("raw.json"));
  assert.equal(meta.format, C.FORMAT);
  assert.equal(meta.version, C.VERSION);
  assert.deepEqual(meta.import_fields, plain(C.FIELDS));
  assert.deepEqual(meta.export_fields, plain(C.EXPORT_FIELDS));
  assert.deepEqual(meta.origins, plain(C.ORIGINS));
  assert.deepEqual(meta.states, plain(C.STATES));
});

test("real session import: the generated 100-question session pastes, validates and exports, even with pasted noise", () => {
  const toon = read("sessions/2026-10-02.toon");
  const t0 = performance.now();
  const doc = C.parseSession(toon);
  assert.ok(performance.now() - t0 < 1000, "decoding and validating a 129 kB session is fast");
  assert.deepEqual([doc.questions.length, doc.sources.length, doc.claims.length], [100, 240, 331]);
  // Copied from a web page or a chat app: CRLF, a BOM, blank lines before, spaces after lines and no-break spaces
  // in the indentation. All of it is noise toon.py never writes, and the session must still load unchanged.
  const noisy = [
    toon.replace(/\n/g, "\r\n"),
    `\uFEFF${toon}`,
    `\n\n${toon}\n\n`,
    toon.replace(/\n/g, " \n"),
    toon.replace(/^ {2}/gm, "\u00a0 "),
  ];
  for (const t of noisy) assert.deepEqual(plain(C.parseSession(t)), plain(doc));
  let s = C.display(C.newState(doc, T0), T0);
  for (let i = 0; i < 100; i++) s = (i % 3 ? C.answer(s, i, T0 + i + 1) : C.skip(s, T0 + i + 1)).state;
  const out = C.exportToon(s, T0 + 500), back = C.decode(out);
  assert.equal(back.responses.length, 100);
  assert.deepEqual(plain(back.claims), plain(doc.claims), "claims survive the export");
  // The page loads a session the moment it is pasted into the paste box, the path Safari leaves when it will not
  // hand the clipboard to Paste Session.
  assert.match(html, /\$\("manual-text"\)\.addEventListener\("paste"/);
});

test("invalid TOON rejection: malformed text and schema violations are refused with a reason", () => {
  const bad = [
    ["", /empty/],
    ["format: calibrator-session\n\tversion: 1", /tabs/],
    ["format: calibrator-session\n   version: 1", /multiple of two/],
    ['format: "unterminated', /unterminated/],
    [sample.replace("questions[5]", "questions[6]"), /declares 6 rows but has 5/],
    [sample.replace("q-2026-10-02-001,2026-10-02-sample,", "q-2026-10-02-001,"), /values for \d+ fields/],
    ["just some prose\nthat is not a session", /expected/],
    [sample.replace("format: calibrator-session", "format: other"), /format must be calibrator-session/],
    [sample.replace("q-2026-10-02-002,2026", "q-2026-10-02-001,2026"), /duplicate question_id/],
    [sample.replace(",notes,75,", ",gossip,75,"), /origin must be one of/],
    [sample.replace(",82,90,", ",820,90,"), /info_gain must be a number from 0 to 100/],
    [sample.replace(",exploit,", ",both,"), /explore_exploit/],
    [sample.replace('unresolved,null,null,"2026-10-02T08:00:00Z"\n  q-2026-10-02-002', 'unresolved,true,null,"2026-10-02T08:00:00Z"\n  q-2026-10-02-002'), /unresolved question has no outcome/],
    [sample.replace(/\n {2}q-2026-10-02-002,s1,Notes,[^\n]*/, "").replace("sources[7]", "sources[6]"), /q-2026-10-02-002 has no source/],
    [sample.replace("q-2026-10-02-004,s1,The earlier", "q-2026-10-02-004,s9,The earlier"), /unknown source s9/],
    [sample + "\nextra: 1", /unknown top-level key extra/],
    [read("tests/fixtures/export.toon"), /exported session/],
  ];
  for (const [text, reason] of bad) {
    assert.throws(() => C.parseSession(text), (e) => (e instanceof C.ToonError || e instanceof C.SchemaError) && reason.test(e.message), `${reason}`);
  }
});

test("unanswered state: an untouched question has no probability, not 50%", () => {
  const s = start();
  assert.equal(C.stateOf(s, ids(s)[0]), "unseen");
  assert.equal(s.responses[ids(s)[0]], undefined);
  const row = C.exportDocument(s, T0).responses[0];
  assert.equal(row.state, "unseen");
  assert.equal(row.first_probability, null);
  assert.equal(row.final_probability, null);
  // The page starts the slider hidden and labelled Unanswered, whatever the native value is.
  assert.match(html, /<input type="range" id="range"[^>]*class="unanswered"/);
  assert.match(html, /<output class="value none" id="value"[^>]*>Unanswered<\/output>/);
  for (const p of [-1, 101, 50.5, NaN, "50"]) assert.throws(() => C.answer(s, p, T0), /integer from 0 to 100/, String(p));
});

test("first-answer capture: probability, timestamp and latency are saved at once", () => {
  const r = C.answer(start(), 73, T0 + 4200);
  const a = r.state.responses[ids(r.state)[0]];
  assert.equal(r.first, true);
  assert.deepEqual(plain(a), { state: "answered", first_probability: 73, final_probability: 73, first_answered_at: T0 + 4200, final_answered_at: T0 + 4200, latency_ms: 4200, revision_history: [] });
  const row = C.exportDocument(r.state, T0 + 5000).responses[0];
  assert.equal(row.time_to_first_answer_ms, 4200);
  assert.equal(row.first_answered_at, "2026-10-02T09:00:04.200Z");
  assert.equal(row.first_shown_at, "2026-10-02T09:00:00.000Z");
  for (const p of [0, 100]) assert.equal(C.answer(start(), p, T0).state.responses[ids(start())[0]].first_probability, p, "the ends are answers");
});

test("slider input: the first answer is the value chosen, never the untouched thumb's 50", () => {
  // A 400px range with a 32px thumb, as on a phone. A tap at 70% of the thumb's run is 70 wherever the
  // browser left the native value: iOS does not move it on a tap, which saved every first answer as 50.
  const run = (f) => 100 + 16 + f * (400 - 32);
  assert.equal(C.pointerProbability(run(0.7), 100, 400, 32), 70);
  assert.equal(C.pointerProbability(run(0.2), 100, 400, 32), 20);
  assert.equal(C.pointerProbability(100, 100, 400, 32), 0, "a touch left of the thumb's run is 0");
  assert.equal(C.pointerProbability(600, 100, 400, 32), 100, "and right of it 100");
  for (const x of [100, 250, 333.3, 499]) assert.ok(Number.isInteger(C.pointerProbability(x, 100, 400, 32)));
  // Keyboard: nothing is chosen until a key chooses; Enter is not a choice, so an untouched question cannot save 50.
  assert.equal(C.keyProbability("Enter", null), null);
  assert.equal(C.keyProbability("Tab", null), null);
  assert.equal(C.keyProbability("ArrowRight", null), 50, "the first arrow reveals the thumb at the middle, unsaved");
  assert.equal(C.keyProbability("ArrowRight", 50), 51);
  assert.equal(C.keyProbability("ArrowDown", 0), 0);
  assert.equal(C.keyProbability("PageUp", 95), 100);
  assert.equal(C.keyProbability("End", null), 100);
  assert.equal(C.keyProbability("Home", 73), 0);
  // The page commits only a choice: the range takes no pointer input of its own, and commit() needs one.
  assert.match(html, /input\[type=range\]\{[^}]*pointer-events:none/);
  assert.match(html, /function commit\(\) \{\n {2}if \(choice == null\) return;/);
  const r = C.answer(start(), C.pointerProbability(run(0.7), 100, 400, 32), T0 + 3000);
  assert.equal(r.state.responses[ids(r.state)[0]].first_probability, 70);
});

test("auto-advance: the first answer moves on, and the last one stays and ends the session", () => {
  let s = start();
  const r = C.answer(s, 60, T0 + 1000);
  assert.equal(r.advanced, true);
  assert.equal(r.state.current, 1);
  assert.equal(s.current, 0, "state is never mutated in place");
  s = r.state;
  for (let i = 1; i < 4; i++) s = C.answer(C.display(s, T0 + 2000 * i), 50, T0 + 2000 * i + 500).state;
  assert.equal(s.current, 4);
  const last = C.answer(C.display(s, T0 + 9000), 10, T0 + 9500);
  assert.equal(last.end, true);
  assert.equal(last.advanced, false);
  assert.equal(last.state.current, 4);
});

test("Back and revisions: the first answer is never overwritten", () => {
  let s = C.answer(start(), 70, T0 + 3000).state;
  s = C.display(C.back(s), T0 + 5000);
  assert.equal(s.current, 0);
  const r = C.answer(s, 85, T0 + 6000);
  assert.equal(r.first, false);
  assert.equal(r.advanced, false, "a revision does not auto-advance");
  s = C.answer(r.state, 85, T0 + 6500).state;
  s = C.answer(s, 40, T0 + 8000).state;
  const a = s.responses[ids(s)[0]];
  assert.equal(a.first_probability, 70);
  assert.equal(a.final_probability, 40);
  assert.equal(a.latency_ms, 3000);
  assert.deepEqual(plain(a.revision_history), [{ probability: 85, at: T0 + 6000 }, { probability: 40, at: T0 + 8000 }], "an unchanged value is not a revision");
  const doc = C.exportDocument(s, T0 + 9000);
  assert.deepEqual(plain(doc.responses[0]).revision_count, 2);
  assert.equal(doc.responses[0].time_to_final_answer_ms, 8000);
  assert.deepEqual(plain(doc.revisions), [
    { question_id: ids(s)[0], revision: 1, probability: 85, at: "2026-10-02T09:00:06.000Z", ms_since_first_shown: 6000 },
    { question_id: ids(s)[0], revision: 2, probability: 40, at: "2026-10-02T09:00:08.000Z", ms_since_first_shown: 8000 },
  ]);
  assert.equal(C.back(C.back(s)).current, 0, "Back stops at question 1");
});

test("Skip: one call records only skipped and advances, and never erases an answer", () => {
  const r = C.skip(start(), T0 + 500);
  assert.equal(r.state.current, 1);
  assert.deepEqual(plain(r.state.responses[ids(r.state)[0]]), { state: "skipped" });
  // Skipping past an answered question keeps the answer.
  let s = C.answer(start(), 30, T0 + 1000).state;
  s = C.skip(C.back(s), T0 + 2000).state;
  assert.equal(s.responses[ids(s)[0]].final_probability, 30);
  // A skipped question can still be answered later.
  s = C.answer(C.back(C.skip(start(), T0).state), 55, T0 + 3000).state;
  assert.equal(s.responses[ids(s)[0]].state, "answered");
  // Skipping the last question ends the session where it is.
  let e = start();
  for (let i = 0; i < 4; i++) e = C.skip(e, T0).state;
  const end = C.skip(e, T0);
  assert.equal(end.end, true);
  assert.equal(end.state.current, 4);
});

test("answered, skipped and unseen stay distinct in the export", () => {
  let s = C.answer(start(), 73, T0 + 1000).state;
  s = C.skip(C.display(s, T0 + 2000), T0 + 2500).state;
  const doc = C.exportDocument(s, T0 + 3000);
  assert.deepEqual(plain(doc.responses.map((r) => r.state)), ["answered", "skipped", "unseen", "unseen", "unseen"]);
  assert.deepEqual(plain(doc.responses[1]), { ...Object.fromEntries(C.EXPORT_FIELDS.responses.map((f) => [f, null])), question_id: ids(s)[1], state: "skipped" });
  assert.deepEqual(plain(doc.responses[2]), plain({ ...doc.responses[1], question_id: ids(s)[2], state: "unseen" }));
  assert.deepEqual(plain([doc.session.answered, doc.session.skipped, doc.session.unseen, doc.session.question_count]), [1, 1, 3, 5]);
  assert.deepEqual(plain(C.counts(s)), { answered: 1, skipped: 1, unseen: 3, total: 5 });
});

test("local persistence: a saved session restores position, answers, skips, revisions and timings", () => {
  let s = C.answer(start(), 64, T0 + 1000).state;
  s = C.skip(C.display(s, T0 + 2000), T0 + 2200).state;
  s = C.answer(C.display(C.back(C.back(s)), T0 + 3000), 66, T0 + 3300).state;
  const restored = C.deserialize(C.serialize(s));
  assert.deepEqual(plain(restored), plain(s));
  assert.ok(Object.isFrozen(restored.doc.questions[0]));
  assert.equal(C.exportToon(restored, T0 + 4000), C.exportToon(s, T0 + 4000));
  assert.throws(() => C.deserialize("{}"), C.SchemaError);
  assert.throws(() => C.deserialize(C.serialize({ ...s, current: 99 })), /out of range/);
  // The unfinished guard: unexported work, or work after the last export, is unfinished.
  assert.equal(C.unfinished(s), true);
  let done = s;
  for (let i = 0; i < 5; i++) done = C.skip(done, T0 + 5000).state;
  done = C.markExported(done, T0 + 6000);
  assert.equal(C.unfinished(done), false);
  assert.equal(C.unfinished(C.answer(C.back(done), 12, T0 + 7000).state), true);
});

test("export round-trip: the exported TOON is the site's TOON and decodes to the same session", () => {
  let s = C.answer(start(), 73, T0 + 4200).state;
  s = C.display(s, T0 + 4500);
  s = C.skip(s, T0 + 6000).state;
  s = C.display(s, T0 + 6100);
  s = C.answer(s, 20, T0 + 9100).state;
  s = C.display(s, T0 + 9300);
  s = C.display(C.back(s), T0 + 10000);
  s = C.answer(s, 35, T0 + 12000).state;
  const doc = C.exportDocument(s, T0 + 15000), text = C.exportToon(s, T0 + 15000);
  assert.deepEqual(plain(doc), JSON.parse(read("tests/fixtures/export.json")));
  assert.equal(text, read("tests/fixtures/export.toon"), "byte for byte what scripts/toon.py writes");
  assert.deepEqual(plain(C.decode(text)), plain(doc));
  // The questions, sources and claims survive the export unchanged.
  const imported = C.parseSession(sample), back = C.decode(text);
  for (const k of ["questions", "sources", "claims"]) assert.deepEqual(plain(back[k]), plain(imported[k]));
  assert.equal(back.session.session_id, imported.session.session_id);
});

test("the codec reads every escape toon.py writes and rejects any other; a table row must be an object", () => {
  assert.deepEqual(plain(C.decode('k: "a\\\\b\\"c\\nd\\re\\tf\\u0001"')), { k: 'a\\b"c\nd\re\tf\u0001' });
  for (const bad of ['k: "a\\x"', 'k: "a\\']) assert.throws(() => C.decode(bad), C.ToonError, bad);
  const doc = C.parseSession(sample);
  for (const t of ["questions", "sources", "claims"]) {
    const broken = { ...doc, [t]: [1, ...doc[t].slice(1)] };
    assert.throws(() => C.validateSession(broken), /: not a row$/, t);
  }
});

test("slow cards: a hasty first answer to a high action_impact card is held for confirmation, nothing else is", () => {
  const s = start(), [q1, , q3] = s.doc.questions;
  assert.deepEqual([q1.action_impact, C.slowCard(q1), q3.action_impact, C.slowCard(q3)], [90, true, 72, false]);
  assert.equal(C.SLOW_IMPACT, 80);
  assert.equal(C.SLOW_MS, 8000);
  // Shown at T0: under 8 s is hasty, 8 s or more is not.
  assert.equal(C.hasty(s, T0 + 2000), true);
  assert.equal(C.hasty(s, T0 + 7999), true);
  assert.equal(C.hasty(s, T0 + 8000), false);
  // A revision is never held, however quick, and neither is a card below the threshold.
  const answered = C.back(C.answer(s, 70, T0 + 9000).state);
  assert.equal(C.hasty(C.display(answered, T0 + 10000), T0 + 10500), false);
  let low = s;
  for (let i = 0; i < 2; i++) low = C.skip(low, T0).state;
  low = C.display(low, T0 + 100);
  assert.equal(C.hasty(low, T0 + 200), false);
  // Confirming keeps the time the answer was given, so the latency is the real one.
  const kept = C.answer(s, 64, T0 + 3000).state.responses[q1.question_id];
  assert.equal(kept.latency_ms, 3000);
  // The page asks before saving, and only through the engine's check.
  assert.match(html, /<div class="confirm" id="hasty" hidden role="alertdialog"/);
  assert.match(html, /if \(C\.hasty\(S, t\)\) \{/);
  assert.match(html, /\$\("slow"\)\.hidden = !C\.slowCard\(q\);/);
});

test("old sessions and saved progress stay valid: every published session imports, and no field was added", () => {
  for (const f of fs.readdirSync(new URL("../sessions/", import.meta.url))) {
    const doc = C.parseSession(read(`sessions/${f}`));
    assert.ok(doc.questions.length > 0, f);
  }
  assert.deepEqual(plain(C.FIELDS), JSON.parse(read("raw.json")).import_fields);
  // A state saved before slow cards existed restores and exports unchanged.
  const s = C.answer(start(), 30, T0 + 1000).state;
  assert.equal(C.exportToon(C.deserialize(C.serialize(s)), T0 + 2000), C.exportToon(s, T0 + 2000));
});

test("polarity check: the swapped cards of session 1 are flagged, sound cards are not", () => {
  const card = (proposition, high_action, low_action) => ({ question_id: "x", proposition, high_action, low_action });
  // Session 1 had ten swapped cards. The word check finds eight; the other two (-041, -071) need reading.
  const s1 = C.parseSession(read("sessions/2026-10-02.toon"));
  const flagged = checkSession(s1).map((f) => f.question_id);
  for (const n of ["001", "030", "044", "048", "050", "088", "098", "099"]) assert.ok(flagged.includes(`cal-20261002-${n}`), n);
  assert.ok(flagged.length <= 10, "few false flags");
  assert.equal(checkSession(C.parseSession(sample)).length, 0);
  // The same card the right way round, and the double negative ("would deleting X lose anything").
  assert.equal(polarity(card("Will the ports still look worth porting in a month?", "keep porting at this pace", "pause porting")), null);
  assert.match(polarity(card("Will the ports still look worth porting in a month?", "pause porting", "keep porting")), /high action would reduce/);
  assert.equal(polarity(card("Would deleting the unused tools lose me anything?", "keep them", "delete them")), null);
  assert.match(polarity(card("Would deleting the unused tools lose me anything?", "delete them", "keep them")), /argues to continue/);
  assert.equal(polarity(card("Should I stop project X before investing another ten hours?", "stop X", "continue X")), null);
  // Two actions in the same direction, or with no recognised verb, are never flagged.
  assert.equal(polarity(card("Is the walk worth it?", "write it down", "ask again next week")), null);
  // The script runs offline and exits 1 when it flags a card, 0 when it does not.
  const run = (f) => { try { execFileSync("node", ["scripts/polarity.mjs", f], { cwd: new URL("..", import.meta.url) }); return 0; } catch (e) { return e.status; } };
  assert.equal(run("sample-session.toon"), 0);
  assert.equal(run("sessions/2026-10-02.toon"), 1);
});
