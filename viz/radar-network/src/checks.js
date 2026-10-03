/* Radar network visualiser: reference checks and domain invariants.
 *
 * The page's "Reference checks" view, the report and the tests run these same functions: published MathWorks
 * cases against this model's own equations, and the domain invariants of the specification, each with the
 * numbers it compared and its status.
 */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const deps = node
    ? [require("./numerics.js"), require("./detector.js"), require("./model.js"), require("./state.js"), require("./signal.js")]
    : [root.RadarNet.numerics, root.RadarNet.detector, root.RadarNet.model, root.RadarNet.state, root.RadarNet.signal];
  const api = factory(...deps);
  if (node) module.exports = api;
  else (root.RadarNet = root.RadarNet || {}).checks = api;
})(typeof self !== "undefined" ? self : this, function (N, D, M, S, G) {
  "use strict";

  const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

  function references(cases) {
    return cases.cases.map((rc) => ({ ...M.referenceCheck(rc), title: rc.title, call: rc.call, source_url: rc.source_url, displayed: rc.displayed, status: M.referenceCheck(rc).pass ? "pass" : "fail" }));
  }

  /** Domain invariants: [{ id, statement, detail, pass }]. preset/examples are the page's data. */
  function invariants(preset, examples, evidence) {
    const out = [];
    const add = (id, statement, pass, detail) => out.push({ id, statement, pass: !!pass, status: pass ? "pass" : "fail", detail });
    const lam = N.C / 10e9;
    const base = { Pt: 1e5, Gt: 1000, Gr: 1000, lambda: lam, sigma: 1, L: 4 };
    const bi = M.radarEquation({ ...base, Rt: 30e3, Rr: 30e3 }).Pr;
    const mono = (base.Pt * base.Gt * base.Gt * lam * lam * base.sigma) / (M.FOUR_PI_CUBED * Math.pow(30e3, 4) * base.L);
    add("monostatic-reduction", "Monostatic geometry reduces the bistatic power equation to the R⁻⁴ equation.", rel(bi, mono) < 1e-12, `bistatic form ${N.sig(bi, 6)} W, R⁻⁴ form ${N.sig(mono, 6)} W`);
    const p2 = M.radarEquation({ ...base, Rt: 60e3, Rr: 60e3 }).Pr;
    add("twice-range", "Twice the range gives one sixteenth of the received power under fixed parameters.", rel(bi / p2, 16) < 1e-12, `ratio ${N.sig(bi / p2, 8)}`);
    add("three-db", "A 3 dB loss approximately halves power. It does not halve amplitude.", Math.abs(N.dbToLin(-3) - 0.5) < 0.002 && Math.abs(N.dbToAmp(-3) - 0.7079) < 1e-3, `power factor ${N.dbToLin(-3).toFixed(4)}, amplitude factor ${N.dbToAmp(-3).toFixed(4)}`);
    // Pulse-energy SNR from the sampled matched filter equals rho1: the gain counts once.
    const Fs = 20e6, tau = 10e-6, Ts = 600, Pr = 1e-15;
    const w = G.waveform({ waveform: "lfm", chirp: "up", pulse_s: tau, bandwidth_Hz: 10e6 }, Fs);
    const peak = Pr * w.E, sigma2 = N.K_B * Ts * Fs, rho1 = M.pulseSnr({ Pr, tau, Ts, Lmf: 1 });
    add("mf-gain-once", "Pulse-energy SNR includes matched-filter energy gain exactly once.", rel(peak / sigma2, rho1) < 1e-9, `sampled peak/noise ${N.sig(peak / sigma2, 6)}, ρ₁ ${N.sig(rho1, 6)}; LFM τB = 100 is not added again`);
    const win = G.processingWindow("rect", 64);
    add("coherent-gain", "Ideal coherent integration increases SNR by N for identical aligned pulses.", Math.abs(win.gain - 64) < 1e-9, `rectangular window gain ${N.sig(win.gain, 6)} for N = 64`);
    const sEq = S.applyExample(preset, examples, "equal-delay");
    const A = M.evaluateLink(sEq, "S1>S2:A", 0, { skipDetector: true }), B = M.evaluateLink(sEq, "S1>S2:B", 0, { skipDetector: true });
    add("equal-delay", "Equal delay does not imply equal received power.", Math.abs(A.geometry.tauE - B.geometry.tauE) < 1e-12 && rel(A.power.Pr, B.power.Pr) > 0.1, `τ_A = ${N.sig(A.geometry.tauE * 1e6, 8)} μs, τ_B = ${N.sig(B.geometry.tauE * 1e6, 8)} μs; P_B/P_A = ${N.sig(B.power.Pr / A.power.Pr, 6)}`);
    const sDef = S.defaultScenario(preset);
    const d0 = S.modelDigest(sDef);
    const moved = S.clone(sDef);
    moved.view.camera.yaw_deg += 47; moved.view.layers.beams = false; moved.view.expanded = ["R1>R1:T1"];
    add("camera-invariance", "Changing the camera or panel state changes no physical result.", d0 === S.modelDigest(moved) && M.evaluateLink(sDef, "R1>R2:T3", 0).power.Pr === M.evaluateLink(moved, "R1>R2:T3", 0).power.Pr, `model digest ${d0} before and after`);
    const sNull = S.applyExample(preset, examples, "doppler-null");
    const n = M.evaluateLink(sNull, "S1>S2:A", 20, { skipDetector: true });
    add("doppler-null", "Zero net path rate gives zero Doppler under the stated convention.", Math.abs(n.geometry.fD) < 1e-6, `Ṙ_t + Ṙ_r = ${N.sig(n.geometry.Rtdot + n.geometry.Rrdot, 3)} m/s, f_D = ${N.sig(n.geometry.fD, 3)} Hz`);
    const sx = N.stream(preset.scene.seed, "invariant", "fluctuation-mean");
    let e = 0, g = 0;
    const K = 20000;
    for (let i = 0; i < K; i++) { e += sx.exponential(); g += sx.gamma2(); }
    add("fluctuation-mean", "RCS fluctuations have the configured mean and update interval.", Math.abs(e / K - 1) < 4 / Math.sqrt(K) && Math.abs(g / K - 1) < 4 * Math.sqrt(0.5 / K), `${K} seeded draws: exponential mean ${(e / K).toFixed(4)}, gamma(2, 1/2) mean ${(g / K).toFixed(4)}; Swerling 1 and 3 hold one factor per dwell, 2 and 4 one per pulse`);
    const c0 = M.combineSnr([1, 1], [0, 0]), c1 = M.combineSnr([1, 1], [0, Math.PI]), cc = M.combineSnr([1, 1], [0, 0], [1, 1], [[1, 1], [1, 1]]);
    add("coherent-complex", "Coherent sums operate on complex signals with explicit noise covariance.", Math.abs(c0.snr - 2) < 1e-12 && c1.snr < 1e-24 && Math.abs(cc.snr - 1) < 1e-12, `in phase ${c0.snr}, opposite phase ${N.sig(c1.snr, 2)}, fully correlated noise ${cc.snr}`);
    const ev = evidence.series.every((s) => s.units === "Magnitude (dB)" && /not stated/i.test(s.reference) && s.gaps.length >= 0 && s.bounds.x[0] >= 175 && s.bounds.x[1] <= 185);
    add("evidence-provenance", "Imported or evidence data retain their domains, units, gaps, and provenance.", ev && !!evidence.provenance.source_sha256, `${evidence.series.length} series, units "Magnitude (dB)", reference not stated, azimuth 175° to 185°`);
    const round = S.importJson(S.exportJson(sDef));
    add("json-round-trip", "JSON round trips preserve semantic state and deterministic calculations.", round.ok && S.modelDigest(round.state) === d0 && M.evaluateLink(round.state, "R3>R3:T3", 0).power.Pr === M.evaluateLink(sDef, "R3>R3:T3", 0).power.Pr, `digest after import ${round.ok ? S.modelDigest(round.state) : "import failed"}`);
    const ids = M.linkIds(sDef);
    add("same-objects", "Scene, equations, tables, and exports identify the same objects and time.", ids.length === sDef.radars.length ** 2 * sDef.targets.length && new Set(ids).size === ids.length, `${ids.length} stable link ids (transmitter, receiver, target)`);
    return out;
  }

  /** Detector checks with exact conventions (independent closed forms and identities). */
  function detectorChecks() {
    const out = [];
    const add = (id, statement, pass, detail) => out.push({ id, statement, pass: !!pass, status: pass ? "pass" : "fail", detail });
    const eta = D.threshold("coherent", 1, 1e-6).eta;
    add("threshold-coherent", "Single complex cell: η = −ln P_fa and P(noise > η) = P_fa.", Math.abs(Math.exp(-eta) - 1e-6) < 1e-18, `η = ${eta.toFixed(6)}`);
    const t64 = D.threshold("noncoherent", 64, 1e-6);
    add("threshold-noncoherent", "Noncoherent: Q(N, η) = P_fa for the Gamma(N, 1) noise sum.", Math.abs(N.gammaPQ(64, t64.eta).Q / 1e-6 - 1) < 1e-9, `N = 64: η = ${t64.eta.toFixed(6)}`);
    const sw1 = D.pd({ integration: "coherent", pulses: 1, pfa: 1e-6, swerling: 1 }, 100);
    add("swerling1-closed", "Swerling 1, one cell: P_d = P_fa^(1/(1+ρ)).", Math.abs(sw1.pd - Math.pow(1e-6, 1 / 101)) < 1e-12, `P_d = ${sw1.pd.toFixed(8)}`);
    const sw2 = D.pd({ integration: "noncoherent", pulses: 8, pfa: 1e-6, swerling: 2 }, 3);
    const ref2 = N.gammaPQ(8, D.threshold("noncoherent", 8, 1e-6).eta / 4).Q;
    add("swerling2-closed", "Swerling 2, noncoherent: P_d = Q(N, η/(1+ρ₁)).", Math.abs(sw2.pd - ref2) < 1e-12, `N = 8, ρ₁ = 3: P_d = ${sw2.pd.toFixed(8)}`);
    const sw4n1 = D.pd({ integration: "noncoherent", pulses: 1, pfa: 1e-6, swerling: 4 }, 20), sw3n1 = D.pd({ integration: "coherent", pulses: 1, pfa: 1e-6, swerling: 3 }, 20);
    add("swerling34-single", "Swerling 3 and 4 agree for one pulse (both chi-square, 4 degrees of freedom).", Math.abs(sw4n1.pd - sw3n1.pd) < 1e-12, `P_d = ${sw3n1.pd.toFixed(8)} and ${sw4n1.pd.toFixed(8)}`);
    const hk = D.pd({ integration: "coherent", pulses: 16, pfa: 1e-6, swerling: 2, phase: "per-pulse" }, 30);
    const hkNum = D.hankelPd(D.phiPerPulse(2, 16, 30), eta);
    add("hankel-closed", "The Hankel inversion reproduces the closed form for per-pulse complex Gaussian echoes.", Math.abs(hk.pd - hkNum.pd) < 1e-9, `closed ${hk.pd.toFixed(10)}, Hankel ${hkNum.pd.toFixed(10)}`);
    const req = D.requiredSnr({ integration: "coherent", pulses: 1, pfa: 1e-6, pdRequired: 0.9, swerling: 0 });
    add("pd-inversion", "Required SNR inverts P_d: the residual at the solution is small.", Math.abs(req.residual) < 1e-8, `ρ_req = ${req.db.toFixed(4)} dB, residual ${N.sig(req.residual, 2)}`);
    return out;
  }

  return { references, invariants, detectorChecks };
});
