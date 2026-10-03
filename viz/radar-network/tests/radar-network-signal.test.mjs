// Sampled processing: matched-filter normalisation, waveform energy, the fractional-delay filter against an
// independent frequency-domain delay, Doppler sign and FFT axis, window normalisation, range aliasing, phase
// sums, noise covariance, cancellation and determinism of seeded dwells.
import assert from "node:assert/strict";
import test from "node:test";
import { G, N, S, examples, fresh, preset } from "./helpers.mjs";

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const lfm = { waveform: "lfm", chirp: "up", pulse_s: 10e-6, bandwidth_Hz: 10e6 };
const rect = { waveform: "rect", chirp: "up", pulse_s: 10e-6, bandwidth_Hz: 10e6 };

test("LFM and rectangular pulses: constant envelope, energy equals the sample count", () => {
  for (const c of [lfm, rect]) {
    const w = G.waveform(c, 20e6);
    assert.equal(w.n, 200);
    close(w.E, 200, 1e-9, `${c.waveform} energy`);
    for (let i = 0; i < w.n; i++) close(Math.hypot(w.re[i], w.im[i]), 1, 1e-12, "envelope");
  }
  const w = G.waveform(lfm, 20e6);
  close(w.mu, 1e12, 1, "mu = B / tau");
  const down = G.waveform({ ...lfm, chirp: "down" }, 20e6);
  close(down.mu, -1e12, 1, "down chirp");
});

test("unit-energy matched filter: noise variance kept, one delayed pulse peaks at rho1", () => {
  const w = G.waveform(lfm, 20e6), h = G.matchedFilter(w);
  close(h.energy, 1, 1e-12, "sum |h|^2 = 1");
  // Correlate an integer-delayed pulse of power Pr in white noise of variance s2: peak SNR = Pr E / s2.
  const Pr = 3e-15, s2 = N.K_B * 600 * 20e6;
  const plan = { refWave: w, mf: h };
  const L = 400, re = new Float64Array(L), im = new Float64Array(L), d = 57, a = Math.sqrt(Pr);
  for (let i = 0; i < w.n; i++) { re[d + i] = a * w.re[i]; im[d + i] = a * w.im[i]; }
  const y = G.mfAt(plan, (i) => re[i] ?? 0, (i) => im[i] ?? 0, d);
  close((y[0] ** 2 + y[1] ** 2) / s2, (Pr * 10e-6) / (N.K_B * 600), 1e-9, "peak SNR = rho1");
});

test("fractional-delay filter matches an independent frequency-domain delay over the occupied band", () => {
  const w = G.waveform(lfm, 20e6), n = 512, frac = 0.37, shift = 100;
  const { h, D } = G.fdTaps(frac);
  const fir = new Float64Array(2 * n);
  for (let q = 0; q < w.n + h.length - 1; q++) {
    let r = 0, i = 0;
    for (let j = 0; j < h.length; j++) { const k = q - j; if (k >= 0 && k < w.n) { r += h[j] * w.re[k]; i += h[j] * w.im[k]; } }
    const idx = shift - D + q;
    if (idx >= 0 && idx < n) { fir[2 * idx] = r; fir[2 * idx + 1] = i; }
  }
  // Reference: FFT, multiply by exp(-j 2 pi f (shift + frac)), inverse FFT.
  const xr = new Float64Array(n), xi = new Float64Array(n);
  for (let i = 0; i < w.n; i++) { xr[i] = w.re[i]; xi[i] = w.im[i]; }
  N.fft2(xr, xi, -1);
  for (let k = 0; k < n; k++) {
    const f = (k < n / 2 ? k : k - n) / n, a = -2 * Math.PI * f * (shift + frac);
    const c = Math.cos(a), s = Math.sin(a), r = xr[k] * c - xi[k] * s, i = xr[k] * s + xi[k] * c;
    xr[k] = r; xi[k] = i;
  }
  N.fft2(xr, xi, 1);
  // Compare in band: low-pass both to |f| <= B/2 = 0.25 Fs and measure the amplitude error.
  const band = (re, im) => { const a = Float64Array.from(re), b = Float64Array.from(im); N.fft2(a, b, -1); for (let k = 0; k < n; k++) { const f = Math.abs(k < n / 2 ? k : k - n) / n; if (f > 0.25) { a[k] = 0; b[k] = 0; } } return [a, b]; };
  const [ar, ai] = band(Array.from({ length: n }, (_, i) => fir[2 * i]), Array.from({ length: n }, (_, i) => fir[2 * i + 1]));
  const [br, bi] = band(Array.from(xr, (v) => v / n), Array.from(xi, (v) => v / n));
  let err = 0, ref = 0;
  for (let k = 0; k < n; k++) { err += (ar[k] - br[k]) ** 2 + (ai[k] - bi[k]) ** 2; ref += br[k] ** 2 + bi[k] ** 2; }
  assert.ok(Math.sqrt(err / ref) < 5e-3, `in-band relative error ${Math.sqrt(err / ref)}`);
  const chk = G.fdCheck(10e6, 20e6);
  assert.ok(chk.amp_dB < 0.01 && chk.phase_deg < 0.1, JSON.stringify(chk));
});

test("window normalisation: sum w^2 = 1, coherent gain N for rectangular, Hann loss 1.76 dB", () => {
  for (const name of ["rect", "hann"]) {
    const w = G.processingWindow(name, 64);
    close(w.w.reduce((s, x) => s + x * x, 0), 1, 1e-12, `${name} sum w^2`);
  }
  close(G.processingWindow("rect", 64).gain, 64, 1e-9, "rect gain");
  close(G.processingWindow("hann", 64).loss_dB, 10 * Math.log10(1.5), 1e-9, "Hann loss");
});

test("Doppler sign, FFT axis and range aliasing in a sampled dwell", async () => {
  const scn = S.applyExample(preset, examples, "monostatic-scaling");
  scn.radars[0].tx.pulses = 16;
  scn.processing.window = "rect";
  // Approaching target at 3 m/s: f_D = +2 v / lambda = +200.1 Hz, inside +-PRF/2.
  scn.targets[0].trajectory.velocity_mps = [-3, 0, 0];
  const plan = G.planChannel(scn, "M1", "M1", 0);
  const c = plan.contributors.find((x) => x.id === "M1>M1:A");
  assert.ok(c.fD > 199 && c.fD < 201, `approach gives positive Doppler ${c.fD}`);
  const r = await G.runChannel(plan, {}, { pfa: 1e-6 });
  const cell = r.cells.find((x) => x.target === "A");
  let best = -1, bk = -1;
  for (let k = 0; k < r.pulses; k++) { const p = r.power[k * r.Nw + cell.lag]; if (p > best) { best = p; bk = k; } }
  assert.equal(bk, cell.bin, "the map peak sits in the expected Doppler bin");
  close(G.binFreq({ pulses: 16, pri: 1e-3 }, bk), 187.5, 1e-9, "bin 3 of 16 at 1 kHz is +187.5 Hz");
  // Aliased range: move B beyond c/(2 PRF) = 150 km.
  scn.targets[1].trajectory.position_m = [160e3, 0, 100];
  const p2 = G.planChannel(scn, "M1", "M1", 0), cb = p2.contributors.find((x) => x.id === "M1>M1:B");
  const e = G.expectedCell(p2, cb);
  assert.equal(e.pulseOffset, 1);
  close(e.apparentDelay, cb.tau0 + cb.tauDot * p2.dwell / 2 - 1e-3, 1e-12, "apparent delay");
});

test("a repeated dwell is identical, and reordering objects does not change the samples", async () => {
  const scn = S.applyExample(preset, examples, "equal-delay");
  scn.radars.forEach((r) => { r.tx.pulses = 4; });
  const run = async (s) => G.runChannel(G.planChannel(s, "S2", "S1", 0), {}, { pfa: 1e-6 });
  const a = await run(scn), b = await run(S.clone(scn));
  assert.deepEqual(Array.from(a.power.subarray(0, 4000)), Array.from(b.power.subarray(0, 4000)));
  const re = S.clone(scn);
  re.targets.reverse(); re.radars.reverse();
  const c = await run(re);
  assert.deepEqual(Array.from(a.power), Array.from(c.power), "streams depend on ids, not order");
  const d = S.clone(scn); d.seed = 7;
  const e = await run(d);
  assert.notDeepEqual(Array.from(a.power.subarray(0, 2000)), Array.from(e.power.subarray(0, 2000)), "another seed gives other noise");
});

test("measured noise at the map has unit mean; the memory limit refuses oversized dwells", async () => {
  const scn = S.applyExample(preset, examples, "monostatic-scaling");
  scn.radars[0].tx.pulses = 8;
  const r = await G.runChannel(G.planChannel(scn, "M1", "M1", 0), {}, { pfa: 1e-6 });
  close(r.noise.measured, 1, 0.1, "noise mean over probe cells");
  const big = S.clone(scn);
  big.radars[0].tx.pulses = 4096; big.radars[0].rx.window_s = [0, 0.99e-3]; big.radars[0].rx.sampleRate_Hz = 200e6;
  const p = G.planChannel(big, "M1", "M1", 0);
  const out = await G.runChannel(p, {}, {});
  assert.equal(out.refused, true);
  assert.match(out.reasons[0], /working-memory target is 256 MiB/);
});

test("two equal channels: phase cancellation and reinforcement in the sampled combination", () => {
  const scn = S.applyExample(preset, examples, "equal-delay");
  scn.radars.forEach((r) => { r.tx.pulses = 8; r.antenna.mode = "uniform"; });
  scn.environment.directPath.enabled = false;
  // Put B on the perpendicular bisector so both receivers see equal echoes of A.
  const ideal = G.combineSites(scn, 0, { target: "A", transmitter: "S1", receivers: ["S1", "S2"], mode: "ideal" });
  assert.ok(ideal.ok);
  const sum = Math.sqrt(ideal.rows[0].snr) + Math.sqrt(ideal.rows[1].snr);
  close(ideal.combinedSnr, (sum * sum) / 2, 1e-6 * ideal.combinedSnr, "aligned: (sum sqrt rho)^2 / M");
  const errors = { S1: {}, S2: { phase_deg: 180 } };
  const opp = G.combineSites(scn, 0, { target: "A", transmitter: "S1", receivers: ["S1", "S2"], mode: "error", errors });
  const diff = Math.sqrt(opp.rows[0].snr) - Math.sqrt(opp.rows[1].snr);
  close(opp.combinedSnr, (diff * diff) / 2, 1e-6 * ideal.combinedSnr, "opposite phase cancels");
  const dup = G.combineSites(scn, 0, { target: "A", transmitter: "S1", receivers: ["S1", "S1", "S2"], mode: "ideal" });
  assert.match(dup.refused.map((x) => x.reason).join(), /same receiver/);
});

test("noise covariance of two matched filters on the same receiver", () => {
  const up = G.matchedFilter(G.waveform(lfm, 20e6)), down = G.matchedFilter(G.waveform({ ...lfm, chirp: "down" }, 20e6));
  close(G.filterCovariance(up, up, 0).magnitude, 1, 1e-12, "same filter, same lag: fully correlated");
  assert.ok(G.filterCovariance(up, down, 0).magnitude < 0.2, "up and down chirps are weakly correlated");
  // Check against an empirical covariance from seeded noise.
  const rng = N.stream(1, "cov-test"), n = 20000;
  let sr = 0, si = 0;
  for (let t = 0; t < n; t++) {
    const x = Array.from({ length: 200 }, () => rng.cnormal(1));
    let a = [0, 0], b = [0, 0];
    for (let q = 0; q < 200; q++) {
      const hr = up.re[199 - q], hi = up.im[199 - q], gr = down.re[199 - q], gi = down.im[199 - q];
      a = [a[0] + x[q][0] * hr - x[q][1] * hi, a[1] + x[q][0] * hi + x[q][1] * hr];
      b = [b[0] + x[q][0] * gr - x[q][1] * gi, b[1] + x[q][0] * gi + x[q][1] * gr];
    }
    sr += a[0] * b[0] + a[1] * b[1]; si += a[1] * b[0] - a[0] * b[1];
  }
  const emp = Math.hypot(sr / n, si / n), ana = G.filterCovariance(up, down, 0).magnitude;
  assert.ok(Math.abs(emp - ana) < 4 / Math.sqrt(n), `empirical ${emp} vs analytic ${ana}`);
});

test("direct-path cancellation reduces the residual in the channel", () => {
  const scn = fresh();
  scn.radars.forEach((r) => { r.tx.pulses = 2; });
  const p80 = G.planChannel(scn, "R2", "R1", 0);
  scn.environment.directPath.cancellation_dB = 40;
  const p40 = G.planChannel(scn, "R2", "R1", 0);
  const d80 = p80.contributors.find((c) => c.kind === "direct" && c.txId === "R1"), d40 = p40.contributors.find((c) => c.kind === "direct" && c.txId === "R1");
  close(d40.P / d80.P, 1e4, 1e-6, "40 dB more residual power");
  close(d40.amp / d80.amp, 100, 1e-9, "20 dB more residual amplitude");
});

test("Monte Carlo at a cell reports Wilson intervals and stays deterministic", async () => {
  const scn = S.applyExample(preset, examples, "monostatic-scaling");
  scn.radars[0].tx.pulses = 8;
  const plan = G.planChannel(scn, "M1", "M1", 0);
  const r = await G.runChannel(plan, {}, { pfa: 1e-3 });
  const cell = r.cells.find((c) => c.target === "B");
  const a = G.monteCarlo(plan, cell, { trials: 500, eta: r.eta, seed: 20261003 }), b = G.monteCarlo(plan, cell, { trials: 500, eta: r.eta, seed: 20261003 });
  assert.deepEqual(a, b);
  assert.ok(a.pd.lo <= a.pd.p && a.pd.p <= a.pd.hi);
  assert.match(a.note, /cannot validate a Pfa/);
});
