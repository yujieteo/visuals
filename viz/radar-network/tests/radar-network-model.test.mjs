// The analytic model: published MathWorks cases, conventions, gains, RCS, link validity, direct path and
// self-leakage, scans, surfaces and the domain invariants.
import assert from "node:assert/strict";
import test from "node:test";
import { CK, M, N, S, evidence, examples, fresh, preset, references } from "./helpers.mjs";

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

test("published MathWorks reference cases agree within their tolerances", () => {
  for (const rc of references.cases) {
    const r = M.referenceCheck(rc);
    assert.ok(r.pass, `${rc.id}: computed ${r.computed}, published ${rc.published}`);
  }
  // The independent equation check of the specification task.
  close(M.referenceCheck(references.cases[0]).computed, 14.3777728, 5e-8, "monostatic SNR");
  close(M.referenceCheck(references.cases[1]).computed, 9.05468, 5e-7, "bistatic SNR");
  close(M.referenceCheck(references.cases[2]).computed, 194259.664, 1e-3, "monostatic range");
});

test("every domain invariant holds", () => {
  for (const i of CK.invariants(preset, examples, evidence)) assert.ok(i.pass, `${i.id}: ${i.detail}`);
});

test("orientation: Rz(yaw) Ry(-pitch) Rx(roll), positive pitch up, positive roll turns +y toward +z", () => {
  const R = M.bodyToWorld({ yaw: 90, pitch: 0, roll: 0 });
  const fwd = M.mulMV(R, [1, 0, 0]);
  close(fwd[0], 0, 1e-12, "yaw 90 x"); close(fwd[1], 1, 1e-12, "yaw 90 y");
  const up = M.mulMV(M.bodyToWorld({ yaw: 0, pitch: 30, roll: 0 }), [1, 0, 0]);
  close(up[2], Math.sin(Math.PI / 6), 1e-12, "positive pitch above the horizontal");
  const left = M.mulMV(M.bodyToWorld({ yaw: 0, pitch: 0, roll: 90 }), [0, 1, 0]);
  close(left[2], 1, 1e-12, "roll 90 sends body +y to +z");
  const Rr = M.bodyToWorld({ yaw: 37, pitch: -12, roll: 71 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) close(Rr[0][i] * Rr[0][j] + Rr[1][i] * Rr[1][j] + Rr[2][i] * Rr[2][j], i === j ? 1 : 0, 1e-12, "orthonormal");
});

test("the initial scene reproduces the specified state and 36 links", () => {
  const scn = fresh();
  assert.equal(scn.seed, 20261003);
  assert.equal(M.linkIds(scn).length, 36);
  assert.deepEqual(scn.radars.map((r) => [r.id, ...r.trajectory.position_m, r.tx.waveform, r.tx.chirp]), [["R1", -20000, 0, 100, "lfm", "up"], ["R2", 20000, 0, 100, "rect", "up"], ["R3", 0, -20000, 2000, "lfm", "down"]]);
  assert.deepEqual(scn.radars[2].antenna.pointing, { mode: "track", target: "T3" });
  for (const id of ["R1", "R2"]) {
    const b = M.boresight(scn, id, 0).u, d = N.vunit(N.vsub(scn.targets[2].trajectory.position_m, scn.radars.find((r) => r.id === id).trajectory.position_m));
    close(N.vdot(b, d), 1, 1e-12, `${id} aims at T3's initial position`);
  }
  assert.equal(scn.environment.clutter.patches.length, 25);
  assert.ok(scn.environment.clutter.patches.every((p) => p.area_m2 === 1e4 && p.sigma0_dB === -25 && p.position_m[2] === 0));
  const L = M.evaluateAll(scn, 0);
  assert.ok(L.every((l) => l.status === "ok"), "every initial link is valid");
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) M.evaluateAll(scn, i);
  assert.ok((performance.now() - t0) / 20 < 100, "36 analytic links update within 100 ms");
});

test("synthetic directional gain: 3 dB down at half the full beamwidth, floor at A_max", () => {
  const scn = fresh(), r = scn.radars[0];
  r.antenna.pointing = { mode: "fixed", az_deg: 0, el_deg: 0 };
  const g = (az) => M.gainToward(scn, "R1", M.dirFromAzEl(az, 0), 0, 10e9);
  close(g(0).dBi, 30, 1e-12, "peak");
  close(g(5).dBi, 27, 1e-9, "half beamwidth");
  close(g(90).dBi, 0, 1e-12, "30 dB floor");
  assert.ok(g(90).floor);
  r.antenna.mode = "uniform";
  close(g(90).dBi, 30, 1e-12, "isotropic pattern factor");
  r.antenna.gainMode = "aperture";
  const at4 = M.peakGain(r, 4e9), at10 = M.peakGain(r, 10e9);
  close(N.linToDb(at10), 30, 1e-6, "aperture chosen for 30 dBi at 10 GHz");
  close(N.linToDb(at10 / at4), 20 * Math.log10(10 / 4), 1e-9, "G = 4 pi A / lambda^2");
});

test("synthetic aspect response and RCS validity rules", () => {
  const scn = fresh(), tg = scn.targets[3];
  tg.rcs.mode = "analytic";
  const L = M.evaluateLink(scn, "R3>R3:T4", 0);
  const r = L.rcs;
  close(r.sigma, 1 * (0.01 + 0.99 * (r.qt + r.qr) / 2), 1e-15, "sigma_b formula");
  assert.ok(r.sigma > 0 && r.sigma <= 1);
  tg.rcs.mode = "table";
  tg.rcs.table = { geometry: "monostatic", frequency_Hz: 10e9, units: "m2", az_deg: [-180, 180], el_deg: [-90, 90], values_m2: [[2, 2], [2, 2]], provenance: { source: "test" } };
  assert.equal(M.evaluateLink(scn, "R3>R3:T4", 0).rcs.sigma, 2);
  const bi = M.evaluateLink(scn, "R1>R3:T4", 0);
  assert.equal(bi.status, "outside-model");
  assert.match(bi.reasons.join(), /monostatic table cannot supply a bistatic value/);
  assert.equal(bi.power, null, "no power is invented for an invalid link");
  tg.rcs.table.values_m2[0][0] = null;
  assert.match(M.evaluateLink(scn, "R3>R3:T4", 0).reasons.join(), /missing table value/);
});

test("invalid links keep their rows and reasons, never a zero", () => {
  const scn = fresh();
  scn.radars[1].tx.carrier_Hz = 4e9;
  const L = M.evaluateLink(scn, "R1>R2:T3", 0);
  assert.equal(L.status, "incompatible");
  assert.match(L.reasons.join(), /receives at 4 GHz/);
  scn.radars[0].tx.enabled = false;
  assert.equal(M.evaluateLink(scn, "R1>R1:T3", 0).status, "inactive");
  const s2 = fresh();
  s2.targets[0].trajectory.position_m = [-20000, 50, 100];
  s2.targets[0].trajectory.velocity_mps = [0, 0, 0];
  const near = M.evaluateLink(s2, "R1>R1:T1", 0);
  assert.equal(near.status, "outside-model");
  assert.match(near.reasons.join(), /inside the 100 m far-field bound/);
  close(near.geometry.Rt, 50, 1e-9, "distance is not clamped");
});

test("delay, Doppler, range aliasing and noise-factor entry", () => {
  const scn = fresh();
  const L = M.evaluateLink(scn, "R1>R2:T3", 0), g = L.geometry;
  close(g.tauE, (g.Rt + g.Rr) / N.C, 1e-18, "echo delay");
  close(g.tauX, (g.Rt + g.Rr - g.D) / N.C, 1e-18, "excess delay");
  close(g.fD, -(g.Rtdot + g.Rrdot) / g.lambda, 1e-9, "Doppler");
  assert.ok(g.fD < 0, "T3 recedes, so Doppler is negative");
  scn.targets[2].trajectory.position_m = [200e3, 0, 8000];
  const far = M.evaluateLink(scn, "R1>R1:T3", 0);
  assert.equal(far.timing.pulseOffset, 1);
  assert.match(far.reasons.join(), /range aliasing/);
  const rx = { ...scn.radars[0].rx, tempMode: "noise-factor", antennaTemp_K: 290, noiseFigure_dB: 3, refTemp_K: 290 };
  close(M.systemTemperature(rx).Ts, 290 + (N.dbToLin(3) - 1) * 290, 1e-12, "noise factor applied once");
});

test("direct path (Friis) and self-leakage (isolation, not D = 0) with cancellation in power and amplitude", () => {
  const scn = fresh();
  const d = M.directPath(scn, "R1", "R2", 0);
  const lam = N.C / 10e9;
  close(d.raw, (1e5 * d.Gt.g * d.Gr.g * lam * lam) / Math.pow(4 * Math.PI * 40000, 2), 1e-30, "Friis power");
  close(d.P / d.raw, 1e-8, 1e-20, "80 dB cancellation scales power by 1e-8");
  close(d.amp / Math.sqrt(d.raw), 1e-4, 1e-16, "and amplitude by 1e-4");
  const s = M.directPath(scn, "R1", "R1", 0);
  assert.equal(s.kind, "self-leakage");
  close(s.raw, 1e5 * 1e-11, 1e-20, "110 dB isolation");
  assert.ok(Number.isFinite(s.P) && s.P > 0, "no D = 0 in Friis");
});

test("threshold scan refines crossings to 1 ms and segments at waypoint corners", () => {
  const scn = S.applyExample(preset, examples, "monostatic-scaling");
  scn.targets[0].trajectory.velocity_mps = [400, 0, 0];
  scn.scene.duration_s = 60;
  const sc = M.scanLink(scn, "M1>M1:A");
  assert.ok(sc.series.length >= 60 / 0.05);
  for (const c of sc.crossings) {
    const a = M.evaluateLink(scn, "M1>M1:A", c.t - 0.001).detector.margin_dB, b = M.evaluateLink(scn, "M1>M1:A", c.t + 0.001).detector.margin_dB;
    assert.ok(a * b <= 0, `crossing at ${c.t} is bracketed within 1 ms`);
  }
  scn.targets[0].trajectory.waypoints = [{ t_s: 0, position_m: [20e3, 0, 100] }, { t_s: 20.5, position_m: [30e3, 0, 100] }, { t_s: 60, position_m: [10e3, 0, 100] }];
  assert.ok(M.scanLink(scn, "M1>M1:A").breakpoints.includes(20.5));
});

test("bistatic threshold surfaces are Cassini ovals, not constant-delay ellipses", () => {
  for (const [K, d] of [[4, 1], [0.5, 1], [9, 0]]) {
    for (const loop of M.cassini(K, d, 60)) for (const [x, y] of loop) close(Math.hypot(x + d, y) * Math.hypot(x - d, y), K, 1e-9 * Math.max(1, K), `R_t R_r on the oval (K = ${K}, d = ${d})`);
  }
  assert.equal(M.cassini(0.5, 1).length, 2, "two ovals below K = d^2");
  const scn = fresh();
  const cut = M.rangeCut(scn, "R1>R1:T3", M.boresight(scn, "R1", 0).u, 0, { steps: 60 });
  assert.ok(cut.intervals.length >= 1, "the boresight cut has a detection interval");
});

test("coherent combination: aligned sum over w^H Cn w", () => {
  close(M.combineSnr([4, 4], [0, 0]).snr, 8, 1e-12, "two equal aligned channels");
  close(M.combineSnr([4, 4], [0, Math.PI / 2]).snr, 4, 1e-12, "90 degrees: 2 cos^2(45) rho");
  close(M.combineSnr([1, 1], [0, 0], [1, 1], [[1, 0.5], [0.5, 1]]).snr, 4 / 3, 1e-12, "correlated noise");
});
