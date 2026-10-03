// The semantic state: validity rules, digest, JSON round trip, import refusal, examples and history.
import assert from "node:assert/strict";
import test from "node:test";
import { M, S, examples, fresh, preset } from "./helpers.mjs";

const msg = (scn) => S.validate(scn).map((e) => `${e.path}: ${e.message}`).join("\n");

test("input validity rules", () => {
  assert.equal(msg(fresh()), "");
  const cases = [
    [(s) => { s.processing.pfa = 0.95; }, /Pfa < Pd/],
    [(s) => { s.radars[0].tx.pulse_s = 2e-3; }, /τ · PRF < 1/],
    [(s) => { s.radars[0].tx.pulses = 2.5; }, /positive integer/],
    [(s) => { s.radars[0].rx.sampleRate_Hz = 5e6; }, /occupied baseband/],
    [(s) => { s.processing.echoLoss_dB = -1; }, /nonnegative/],
    [(s) => { s.targets[0].rcs.value_m2 = -1; }, /RCS must be nonnegative/],
    [(s) => { s.targets[0].rcs.analytic.w = [0.5, 0.2, 0.1]; }, /max\(w_d\) = 1/],
    [(s) => { s.targets[0].trajectory.waypoints = [{ t_s: 0, position_m: [0, 0, 0] }, { t_s: 0, position_m: [1, 0, 0] }]; }, /increase strictly/],
    [(s) => { s.radars[0].tx.carrier_Hz = 0; }, /frequency must be positive/],
  ];
  for (const [mutate, re] of cases) { const s = fresh(); mutate(s); assert.match(msg(s), re); }
  const g = fresh(); g.radars[0].antenna.peakGain_dBi = -3;
  assert.equal(msg(g), "", "gain below 0 dBi is allowed");
});

test("view changes leave the model digest; model edits change it", () => {
  const a = fresh(), b = S.clone(a);
  b.view.camera.distance_m *= 2; b.view.layers.trails = false; b.view.expanded = ["R1>R1:T1"]; b.view.time_s = 50;
  assert.equal(S.modelDigest(a), S.modelDigest(b));
  b.targets[0].rcs.value_m2 = 2;
  assert.notEqual(S.modelDigest(a), S.modelDigest(b));
});

test("JSON export and import round trip; snapshots keep their own digest", () => {
  const a = fresh();
  a.targets[3].rcs.mode = "analytic";
  const snap = { kind: "dwell", modelDigest: S.modelDigest(a) };
  const text = S.exportJson(a, [snap]);
  assert.equal(text, S.exportJson(S.clone(a), [snap]), "identical state gives identical export");
  const r = S.importJson(text);
  assert.ok(r.ok);
  assert.deepEqual(r.state, a);
  assert.equal(r.results[0].compatible, true);
  const doc = JSON.parse(text);
  doc.results[0].modelDigest = "0".repeat(32);
  assert.equal(S.importJson(JSON.stringify(doc)).results[0].compatible, false);
  assert.equal(doc.units.position, "m");
});

test("import refuses bad documents and names the reason", () => {
  assert.match(S.importJson("{").errors[0].message, /not JSON/);
  assert.match(S.importJson("{}").errors[0].message, /not a radar-network-scenario/);
  const d = JSON.parse(S.exportJson(fresh()));
  d.schemaVersion = 9;
  assert.match(S.importJson(JSON.stringify(d)).errors[0].message, /not supported/);
  const e = JSON.parse(S.exportJson(fresh()));
  e.state.radars[0].trajectory.position_m = [0, "x", 0];
  assert.ok(!S.importJson(JSON.stringify(e)).ok);
  const f = JSON.parse(S.exportJson(fresh()));
  f.state.targets[0].rcs.mode = "table";
  f.state.targets[0].rcs.table = { geometry: "monostatic", frequency_Hz: 10e9, units: "dBsm", az_deg: [0, 1], el_deg: [0, 1], values_m2: [[1, 1], [1, 1]], provenance: { source: "x" } };
  assert.match(S.importJson(JSON.stringify(f)).errors.map((x) => x.message).join(), /m2/);
});

test("every example loads, validates, and resets to the same state and seed", () => {
  for (const ex of examples.examples) {
    const a = S.applyExample(preset, examples, ex.id), b = S.applyExample(preset, examples, ex.id);
    assert.equal(S.validate(a).length, 0, `${ex.id}: ${msg(a)}`);
    assert.deepEqual(a, b);
    assert.equal(a.seed, 20261003);
    assert.ok(M.linkIds(a).includes(a.view.selectedLink), `${ex.id} selects one of its links`);
  }
  const t4 = S.applyExample(preset, examples, "aspect-response");
  assert.equal(t4.targets.find((t) => t.id === "T4").rcs.mode, "analytic");
});

test("history: undo and redo restore states with their labels", () => {
  const h = S.createHistory(), a = fresh(), b = S.clone(a);
  b.targets[0].rcs.value_m2 = 5;
  h.push("RCS T1 (t = 0.000 s)", a);
  const u = h.undo(b);
  assert.equal(u.state.targets[0].rcs.value_m2, 1);
  assert.equal(u.label, "RCS T1 (t = 0.000 s)");
  assert.equal(h.redo(u.state).state.targets[0].rcs.value_m2, 5);
});
