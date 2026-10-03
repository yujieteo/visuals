/* Radar network visualiser: sampled processing of one dwell.
 *
 * Synthetic complex baseband only (no RF carrier). One channel is a receiver with the matched filter of one
 * selected transmitter waveform; every other active transmitter at that carrier stays in the channel as
 * interference, and the receiver never uses hidden target labels. Per pulse window: target echoes, clutter
 * patches, direct paths, self-leakage, optional Gaussian interference and thermal noise; then the unit-energy
 * matched filter (FFT correlation) and a windowed slow-time DFT. Within the dwell, attenuation and gains are
 * frozen and delay and phase follow the linear path-length model. The envelope delay is set per pulse; the
 * carrier phase follows the linear model per sample, so the geometric Doppler is applied exactly once.
 */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = node ? factory(require("./numerics.js"), require("./model.js")) : factory(root.RadarNet.numerics, root.RadarNet.model);
  if (node) module.exports = api;
  else (root.RadarNet = root.RadarNet || {}).signal = api;
})(typeof self !== "undefined" ? self : this, function (N, M) {
  "use strict";

  const MEMORY_LIMIT = 256 * 1024 * 1024; // working-memory target, bytes
  const FD_TAPS = 32, FD_BETA = 8;
  const PROBES = 128;

  /* ===== WAVEFORMS ===== */
  /** Complex baseband samples of one pulse. LFM: mu = +-B/tau, phase pi mu (t - tau/2)^2, constant envelope. */
  function waveform(txc, Fs) {
    const n = Math.max(1, Math.round(txc.pulse_s * Fs));
    const re = new Float64Array(n), im = new Float64Array(n);
    const mu = txc.waveform === "lfm" ? (txc.chirp === "down" ? -1 : 1) * (txc.bandwidth_Hz / txc.pulse_s) : 0;
    for (let i = 0; i < n; i++) {
      const t = i / Fs - txc.pulse_s / 2;
      const ph = Math.PI * mu * t * t;
      re[i] = Math.cos(ph); im[i] = Math.sin(ph);
    }
    let E = 0;
    for (let i = 0; i < n; i++) E += re[i] * re[i] + im[i] * im[i];
    return { re, im, n, E, mu, Fs, type: txc.waveform, chirp: txc.chirp, sampledDuration: n / Fs, durationNote: Math.abs(n / Fs - txc.pulse_s) > 1e-12 ? `τ·F_s = ${(txc.pulse_s * Fs).toFixed(3)} is not an integer: ${n} samples are used` : `${n} samples` };
  }
  /** Unit-energy matched filter coefficients h[n] = conj(w[L-1-n]) / sqrt(E). Output noise variance = input variance. */
  function matchedFilter(w) {
    const s = 1 / Math.sqrt(w.E), re = new Float64Array(w.n), im = new Float64Array(w.n);
    for (let i = 0; i < w.n; i++) { re[i] = w.re[w.n - 1 - i] * s; im[i] = -w.im[w.n - 1 - i] * s; }
    let e = 0;
    for (let i = 0; i < w.n; i++) e += re[i] * re[i] + im[i] * im[i];
    return { re, im, n: w.n, scale: s, energy: e, rule: "h[n] = w*[L−1−n] / √E,  Σ|h|² = 1" };
  }

  /* ===== FRACTIONAL DELAY ===== */
  function besselI0(x) { let s = 1, t = 1; for (let k = 1; k < 60; k++) { t *= (x / (2 * k)) * (x / (2 * k)); s += t; if (t < 1e-17 * s) break; } return s; }
  const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
  /** Kaiser-windowed sinc taps for delay D + frac samples, D = taps/2 - 1, normalised to unit DC gain. */
  function fdTaps(frac, taps = FD_TAPS, beta = FD_BETA) {
    const h = new Float64Array(taps), D = taps / 2 - 1, i0b = besselI0(beta);
    let s = 0;
    for (let j = 0; j < taps; j++) {
      const r = (2 * (j - frac)) / (taps - 1) - 1; // window centred on the delayed peak
      const wv = Math.abs(r) <= 1 ? besselI0(beta * Math.sqrt(1 - r * r)) / i0b : 0;
      h[j] = sinc(j - D - frac) * wv;
      s += h[j];
    }
    for (let j = 0; j < taps; j++) h[j] /= s;
    return { h, D, frac };
  }
  /** Worst amplitude (dB) and phase (deg) error of the filter against the ideal delay over |f| <= band/2. */
  function fdCheck(band, Fs, taps = FD_TAPS, beta = FD_BETA) {
    let amp = 0, phase = 0;
    for (const frac of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const { h, D } = fdTaps(frac, taps, beta);
      for (let i = 0; i <= 64; i++) {
        const f = (-band / 2 + (band * i) / 64) / Fs;
        let re = 0, im = 0;
        for (let j = 0; j < taps; j++) { re += h[j] * Math.cos(-2 * Math.PI * f * j); im += h[j] * Math.sin(-2 * Math.PI * f * j); }
        const ang = 2 * Math.PI * f * (D + frac);
        const rr = re * Math.cos(ang) - im * Math.sin(ang), ri = re * Math.sin(ang) + im * Math.cos(ang); // H / ideal
        amp = Math.max(amp, Math.abs(20 * Math.log10(Math.hypot(rr, ri))));
        phase = Math.max(phase, Math.abs((Math.atan2(ri, rr) * 180) / Math.PI));
      }
    }
    return { amp_dB: amp, phase_deg: phase, band, Fs, taps, beta, rule: `${taps}-tap Kaiser-windowed sinc (β = ${beta}), checked over |f| ≤ ${(band / 2e6).toFixed(3)} MHz at 5 fractions` };
  }

  /* ===== DWELL PLAN ===== */
  const dwellKey = (t0) => String(Math.round(t0 * 1e6)); // dwell identified by its start time in microseconds
  function processingWindow(name, n) {
    const w = new Float64Array(n);
    for (let m = 0; m < n; m++) w[m] = name === "hann" ? (n === 1 ? 1 : 0.5 - 0.5 * Math.cos((2 * Math.PI * (m + 0.5)) / n)) : 1;
    let s2 = 0, s1 = 0;
    for (let m = 0; m < n; m++) { s2 += w[m] * w[m]; s1 += w[m]; }
    const k = 1 / Math.sqrt(s2);
    for (let m = 0; m < n; m++) w[m] *= k;
    return { w, gain: (s1 * s1) / s2, loss_dB: 10 * Math.log10(n / ((s1 * s1) / s2)), rule: name === "hann" ? "periodic-centred Hann, scaled to Σw² = 1" : "rectangular, scaled to Σw² = 1" };
  }

  /**
   * Plan one channel's dwell at start time t0: every contributor with its frozen amplitude, delay, delay rate,
   * Doppler and phase, and what was left out and why. Refuses a dwell with a trajectory corner inside it.
   */
  function planChannel(scn, rxId, txId, t0) {
    const rx = scn.radars.find((r) => r.id === rxId), ref = scn.radars.find((r) => r.id === txId);
    const reasons = [];
    if (!rx || !ref) return { ok: false, reasons: ["unknown radar"] };
    if (!rx.rx.enabled) reasons.push(`${rxId} receiver is off`);
    if (!ref.tx.enabled) reasons.push(`${txId} transmitter is off`);
    if (ref.tx.carrier_Hz !== rx.tx.carrier_Hz) reasons.push(`${rxId} receives at ${rx.tx.carrier_Hz / 1e9} GHz; ${txId} transmits at ${ref.tx.carrier_Hz / 1e9} GHz`);
    const Fs = rx.rx.sampleRate_Hz, f = rx.tx.carrier_Hz;
    const pulses = ref.tx.pulses, pri = 1 / ref.tx.prf_Hz, dwell = pulses * pri;
    const corners = [];
    for (const o of [...scn.radars, ...scn.targets]) for (const b of M.breakpoints(o)) if (b > t0 && b < t0 + dwell) corners.push(`${o.id} at ${b} s`);
    if (corners.length) reasons.push(`trajectory or orientation corner inside the dwell (${corners.join(", ")}): use a shorter dwell or another start time`);
    const w0 = rx.rx.window_s[0], w1 = rx.rx.window_s[1];
    const Nw = Math.round((w1 - w0) * Fs);
    if (Nw < 1) reasons.push("receive window holds no samples");
    if (reasons.length) return { ok: false, reasons, rxId, txId, t0 };
    const sched = scn.processing.schedule;
    const offsetOf = (r) => (sched === "scheduled" ? r.tx.offset_s : 0);
    const contributors = [], excluded = [];
    const phaseMode = scn.processing.phase.mode, key = dwellKey(t0);
    for (const tx of scn.radars) {
      if (!tx.tx.enabled) { excluded.push({ label: `${tx.id} transmitter`, reason: "transmitter off" }); continue; }
      if (tx.tx.carrier_Hz !== f) { excluded.push({ label: `${tx.id} transmitter`, reason: `out of band: ${tx.tx.carrier_Hz / 1e9} GHz` }); continue; }
      const wave = waveform(tx.tx, Fs);
      const base = { txId: tx.id, wave, pri: 1 / tx.tx.prf_Hz, offset: offsetOf(tx), pulseLen: wave.n / Fs };
      for (const tg of scn.targets) {
        const L = M.evaluateLink(scn, M.linkId(tx.id, rxId, tg.id), t0, { skipDetector: true });
        if (!L.power || L.status !== "ok") { excluded.push({ label: L.id, reason: L.reasons.join("; ") || L.status }); continue; }
        const g = L.geometry;
        contributors.push({
          ...base, kind: "target", id: L.id, target: tg.id,
          category: tx.id === txId ? `signal:${tg.id}` : "other-echo",
          amp: Math.sqrt(L.power.Pr), P: L.power.Pr, tau0: g.tauE, tauDot: (g.Rtdot + g.Rrdot) / N.C, fD: g.fD,
          phase: phaseMode === "fixed" ? N.rad(scn.processing.phase.value_deg) : null,
          stream: [scn.seed, tx.id, rxId, tg.id, key],
        });
      }
      if (scn.environment.clutter.enabled) {
        for (const p of scn.environment.clutter.patches) {
          const e = M.patchEcho(scn, p, tx.id, rxId, t0);
          if (!e.visible || !(e.Pr > 0)) { excluded.push({ label: `${tx.id}→${p.id}→${rxId}`, reason: "patch not visible from both sites" }); continue; }
          contributors.push({ ...base, kind: "clutter", id: `${tx.id}>${rxId}:${p.id}`, category: "clutter", amp: Math.sqrt(e.Pr), P: e.Pr, tau0: e.tauE, tauDot: -e.fD * (N.C / f) / N.C, fD: e.fD, phase: N.rad(p.phase_deg), fixedAmp: true });
        }
      }
      if (tx.id === rxId) {
        const d = M.directPath(scn, tx.id, rxId, t0);
        contributors.push({ ...base, kind: "leakage", id: `${tx.id} self-leakage`, category: "leakage", amp: d.amp, P: d.P, tau0: 0, tauDot: 0, fD: 0, phase: 0, fixedAmp: true, detail: d });
      } else if (scn.environment.directPath.enabled) {
        const d = M.directPath(scn, tx.id, rxId, t0);
        contributors.push({ ...base, kind: "direct", id: `${tx.id}→${rxId} direct path`, category: "direct", amp: d.amp, P: d.P, tau0: d.delay, tauDot: (-d.fD * (N.C / f)) / N.C, fD: d.fD, phase: 0, fixedAmp: true, detail: d });
      }
    }
    const Ts = M.systemTemperature(rx.rx).Ts;
    const sigma2 = N.K_B * Ts * Fs;
    const refWave = waveform(ref.tx, Fs);
    const win = processingWindow(scn.processing.window, pulses);
    const intf = scn.environment.interference;
    return {
      ok: true, rxId, txId, t0, key, seed: scn.seed, f, Fs, Nw, w0, w1, pulses, pri, dwell, offset: offsetOf(ref),
      Ts, sigma2, refWave, mf: matchedFilter(refWave), win, contributors, excluded,
      swerling: scn.processing.swerling, phaseMode, phaseValue: N.rad(scn.processing.phase.value_deg),
      interference: intf.enabled ? { power: intf.power_W, bandwidth: intf.bandwidth_Hz } : null,
      limits: M.waveformLimits(ref),
      noiseRule: "E|n|² = k T_s F_s;  each quadrature k T_s F_s / 2",
      approximation: "Dwell approximation: positions and velocities at the dwell start; attenuation and gains frozen; delay and phase follow the linear path-length model for the dwell.",
    };
  }

  /** Memory (bytes) and operation estimates for one channel's dwell; refuses above the working-memory target. */
  function estimate(plan) {
    const L = N.nextPow2(plan.Nw + plan.mf.n);
    const bytes = plan.pulses * plan.Nw * 4 * 3 + L * 8 * 6 + plan.Nw * 8 * 4;
    const synthOps = plan.contributors.length * plan.pulses * 2 * (plan.refWave.n + FD_TAPS) * FD_TAPS;
    const fftOps = plan.pulses * 2 * L * Math.log2(L) * 5 + plan.Nw * plan.pulses * Math.log2(Math.max(2, plan.pulses)) * 10;
    return { bytes, limit: MEMORY_LIMIT, ok: bytes <= MEMORY_LIMIT, ops: synthOps + fftOps, fftLength: L, mapCells: plan.pulses * plan.Nw };
  }

  /* ===== SYNTHESIS ===== */
  /** Fluctuation amplitude factor sqrt(x) and phase for contributor c at transmitted pulse index mp. */
  function fluctuation(plan, c, mp) {
    if (c.kind !== "target") return { a: 1, ph: c.phase };
    const sw = plan.swerling;
    let a = 1;
    if (sw === 1 || sw === 3) { const s = N.stream(...c.stream, "rcs-fluctuation"); a = Math.sqrt(sw === 1 ? s.exponential() : s.gamma2()); }
    else if (sw === 2 || sw === 4) { const s = N.stream(...c.stream, "rcs-fluctuation", mp); a = Math.sqrt(sw === 2 ? s.exponential() : s.gamma2()); }
    let ph;
    if (plan.phaseMode === "fixed") ph = plan.phaseValue;
    else if (plan.phaseMode === "per-dwell") ph = N.stream(...c.stream, "scatter-phase").phase();
    else ph = N.stream(...c.stream, "scatter-phase", mp).phase();
    return { a, ph };
  }

  /**
   * Add contributor c's echo of transmitted pulse mp into the window of channel pulse m, for samples [n0, n1).
   * Calls sink(index, re, im) per sample, so the same code fills a window or feeds cell dot products.
   */
  function echoInto(plan, c, m, mp, n0, n1, sink, err) {
    const winStart = plan.offset + m * plan.pri + plan.w0; // absolute time of sample 0 of window m (s, from t0)
    const tTx = c.offset + mp * c.pri; // pulse emission time from t0
    const clock = err?.clock_s ?? 0;
    const tau = c.tau0 + c.tauDot * tTx; // linear path-length model, evaluated at emission
    const arrive = tTx + tau + clock;
    const s = (arrive - winStart) * plan.Fs;
    const i0 = Math.floor(s), frac = s - i0;
    const { h, D } = fdTaps(frac);
    const L = c.wave.n, wr = c.wave.re, wi = c.wave.im;
    const fl = fluctuation(plan, c, mp);
    const amp = c.amp * fl.a * (err?.ampScale ?? 1);
    const twoPiF = 2 * Math.PI * plan.f;
    const cfo = err?.cfo_Hz ?? 0;
    const extraPhase = (err?.phase ?? 0) + (c.kind === "target" && c.target === err?.target ? err?.scatter ?? 0 : 0);
    // Output sample q (0 .. L + taps - 2) is at window index i0 - D + q.
    const qStart = Math.max(0, n0 - (i0 - D)), qEnd = Math.min(L + FD_TAPS - 1, n1 - (i0 - D));
    for (let q = qStart; q < qEnd; q++) {
      let re = 0, im = 0;
      const jLo = Math.max(0, q - L + 1), jHi = Math.min(FD_TAPS - 1, q);
      for (let j = jLo; j <= jHi; j++) { const k = q - j; re += h[j] * wr[k]; im += h[j] * wi[k]; }
      if (re === 0 && im === 0) continue;
      const n = i0 - D + q;
      const tAbs = winStart + n / plan.Fs;
      // Carrier phase of the path delay at this sample (linear model), plus scattering phase and errors.
      const tauN = c.tau0 + c.tauDot * (tAbs - tau);
      const ph = -twoPiF * (tauN + clock) + fl.ph + extraPhase + 2 * Math.PI * cfo * tAbs;
      const cr = Math.cos(ph) * amp, ci = Math.sin(ph) * amp;
      sink(n, re * cr - im * ci, re * ci + im * cr);
    }
  }
  /** Transmitted pulse indices whose echo of contributor c can overlap window m. */
  function pulsesFor(plan, c, m) {
    const winStart = plan.offset + m * plan.pri + plan.w0, winEnd = winStart + plan.Nw / plan.Fs;
    const span = c.pulseLen + (FD_TAPS + 2) / plan.Fs;
    // arrive(mp) ~ c.offset + mp pri (1 + tauDot) + tau0
    const k = c.pri * (1 + c.tauDot);
    const lo = Math.floor((winStart - span - c.tau0 - c.offset) / k) - 1, hi = Math.ceil((winEnd - c.tau0 - c.offset) / k) + 1;
    const out = [];
    for (let mp = lo; mp <= hi; mp++) out.push(mp);
    return out;
  }

  /* ===== PROCESSING ===== */
  /** Correlate x (length Nw) with the matched filter by FFT: y[n] = sum_q x[n+q] h'[q], the lag of an echo start. */
  function makeCorrelator(plan) {
    const L = N.nextPow2(plan.Nw + plan.refWave.n);
    const wr = new Float64Array(L), wi = new Float64Array(L);
    const s = plan.mf.scale;
    for (let i = 0; i < plan.refWave.n; i++) { wr[i] = plan.refWave.re[i] * s; wi[i] = plan.refWave.im[i] * s; }
    N.fft2(wr, wi, -1);
    const xr = new Float64Array(L), xi = new Float64Array(L);
    return function correlate(inRe, inIm, outRe, outIm) {
      xr.fill(0); xi.fill(0);
      xr.set(inRe); xi.set(inIm);
      N.fft2(xr, xi, -1);
      for (let k = 0; k < L; k++) { const ar = xr[k], ai = xi[k]; xr[k] = ar * wr[k] + ai * wi[k]; xi[k] = ai * wr[k] - ar * wi[k]; } // X conj(W)
      N.fft2(xr, xi, 1);
      for (let n = 0; n < plan.Nw; n++) { outRe[n] = xr[n] / L; outIm[n] = xi[n] / L; }
    };
  }
  /** Dot product of window samples with the matched filter at lag n: the filter output at one cell. */
  function mfAt(plan, getRe, getIm, n) {
    const L = plan.refWave.n, s = plan.mf.scale, wr = plan.refWave.re, wi = plan.refWave.im;
    let re = 0, im = 0;
    for (let q = 0; q < L; q++) { const xr = getRe(n + q), xi = getIm(n + q); re += xr * wr[q] + xi * wi[q]; im += xi * wr[q] - xr * wi[q]; }
    return [re * s, im * s];
  }
  /** Expected cell (lag, Doppler bin) of a contributor in this channel, with range and Doppler aliasing. */
  function expectedCell(plan, c) {
    // Delay at mid-dwell: the echo walks by tauDot * dwell over the dwell (range migration).
    const delay = c.tau0 + c.tauDot * (plan.dwell / 2) + c.offset - plan.offset - plan.w0;
    const walkSamples = c.tauDot * plan.dwell * plan.Fs;
    const k = Math.floor(delay / plan.pri), apparent = delay - k * plan.pri;
    const lag = Math.round(apparent * plan.Fs);
    const df = 1 / (plan.pulses * plan.pri);
    const prf = 1 / plan.pri;
    const alias = ((c.fD % prf) + prf + prf / 2) % prf - prf / 2;
    const bin = ((Math.round(alias / df) % plan.pulses) + plan.pulses) % plan.pulses;
    return { lag, bin, pulseOffset: k, apparentDelay: apparent + plan.w0, aliasedDoppler: alias, dopplerBinHz: df, inWindow: lag >= 0 && lag < plan.Nw, walkSamples, walk_m: (walkSamples / plan.Fs) * N.C / 2 };
  }
  const binFreq = (plan, k) => { const n = plan.pulses, kk = k >= n / 2 ? k - n : k; return kk / (n * plan.pri); };

  /**
   * Run one channel's dwell. Returns the range-Doppler map (power, normalised so thermal noise has unit mean),
   * the selected pulse before and after the matched filter, each target's cell with its signal, clutter,
   * interference and noise parts measured at the same processing stage, and the noise measured on probe cells.
   * hooks: { progress(done, total), cancelled() } — checked once per pulse.
   */
  async function runChannel(plan, hooks = {}, opts = {}) {
    const est = estimate(plan);
    if (!est.ok) return { ok: false, refused: true, reasons: [`needs ${(est.bytes / 2 ** 20).toFixed(1)} MiB; the working-memory target is ${(est.limit / 2 ** 20).toFixed(0)} MiB`], estimate: est };
    const t0 = Date.now();
    const { pulses, Nw } = plan;
    const showPulse = Math.min(pulses - 1, Math.max(0, opts.pulse ?? 0));
    const mapRe = new Float32Array(pulses * Nw), mapIm = new Float32Array(pulses * Nw);
    const xr = new Float64Array(Nw), xi = new Float64Array(Nw), yr = new Float64Array(Nw), yi = new Float64Array(Nw);
    const correlate = makeCorrelator(plan);
    const cells = [];
    for (const c of plan.contributors) if (c.kind === "target" && c.txId === plan.txId) cells.push({ target: c.target, id: c.id, contributor: c, ...expectedCell(plan, c) });
    // Per cell, per pulse, per category: matched-filter output at the cell lag (complex).
    const CATS = ["signal", "other-echo", "clutter", "direct", "leakage", "interference", "noise"];
    const acc = cells.map(() => Object.fromEntries(CATS.map((k) => [k, new Float64Array(2 * pulses)])));
    const probeLags = Array.from({ length: PROBES }, (_, i) => Math.floor(((i + 0.5) * Math.max(1, Nw - plan.refWave.n)) / PROBES));
    const probeNoise = new Float64Array(2 * pulses * PROBES), probeIntf = new Float64Array(2 * pulses * PROBES);
    // Per-category window for the cell dot products: only the samples a cell needs, kept sparse by range.
    const cellSpan = plan.refWave.n;
    const catBuf = new Map();
    const bufFor = (cat) => { let b = catBuf.get(cat); if (!b) { b = { re: new Float64Array(Nw + cellSpan), im: new Float64Array(Nw + cellSpan), touched: false }; catBuf.set(cat, b); } return b; };
    const lpf = plan.interference && plan.interference.bandwidth < plan.Fs ? lowpass(plan.interference.bandwidth / plan.Fs) : null;
    let rawPulse = null, mfPulse = null;
    for (let m = 0; m < pulses; m++) {
      if (hooks.cancelled && (await hooks.cancelled())) return { ok: false, cancelled: true, reasons: ["cancelled"] };
      xr.fill(0); xi.fill(0);
      for (const b of catBuf.values()) if (b.touched) { b.re.fill(0); b.im.fill(0); b.touched = false; }
      for (const c of plan.contributors) {
        const cat = c.category.startsWith("signal:") ? (c.target === undefined ? "signal" : c.category) : c.category;
        const b = bufFor(cat);
        for (const mp of pulsesFor(plan, c, m)) {
          echoInto(plan, c, m, mp, 0, Nw, (n, re, im) => { xr[n] += re; xi[n] += im; b.re[n] += re; b.im[n] += im; b.touched = true; });
        }
      }
      // Optional extra complex Gaussian interference, band-limited when narrower than F_s.
      const ib = bufFor("interference");
      if (plan.interference) {
        const s = N.stream(plan.seed, plan.rxId, plan.key, "interference", m);
        const raw = new Float64Array(2 * (Nw + (lpf ? lpf.length : 0)));
        for (let i = 0; i < raw.length / 2; i++) { const z = s.cnormal(plan.interference.power); raw[2 * i] = z[0]; raw[2 * i + 1] = z[1]; }
        for (let n = 0; n < Nw; n++) {
          let re = raw[2 * n], im = raw[2 * n + 1];
          if (lpf) { re = 0; im = 0; for (let j = 0; j < lpf.length; j++) { re += lpf.h[j] * raw[2 * (n + j)]; im += lpf.h[j] * raw[2 * (n + j) + 1]; } }
          xr[n] += re; xi[n] += im; ib.re[n] += re; ib.im[n] += im;
        }
        ib.touched = true;
      }
      // Thermal noise: complex white Gaussian, E|n|^2 = k Ts Fs.
      const nb = bufFor("noise");
      const ns = N.stream(plan.seed, plan.rxId, plan.key, "thermal-noise", m);
      for (let n = 0; n < Nw; n++) { const z = ns.cnormal(plan.sigma2); xr[n] += z[0]; xi[n] += z[1]; nb.re[n] = z[0]; nb.im[n] = z[1]; }
      nb.touched = true;
      if (m === showPulse) rawPulse = { re: Float32Array.from(xr), im: Float32Array.from(xi) };
      // Cell parts at the same processing stage.
      for (let ci = 0; ci < cells.length; ci++) {
        const cell = cells[ci];
        if (!cell.inWindow) continue;
        for (const [cat, b] of catBuf) {
          const key = cat.startsWith("signal:") ? (cat === `signal:${cell.target}` ? "signal" : "other-echo") : cat;
          const v = mfAt(plan, (i) => (i < Nw ? b.re[i] : 0), (i) => (i < Nw ? b.im[i] : 0), cell.lag);
          acc[ci][key][2 * m] += v[0]; acc[ci][key][2 * m + 1] += v[1];
        }
      }
      for (let p = 0; p < PROBES; p++) {
        const v = mfAt(plan, (i) => (i < Nw ? nb.re[i] : 0), (i) => (i < Nw ? nb.im[i] : 0), probeLags[p]);
        probeNoise[2 * (p * pulses + m)] = v[0]; probeNoise[2 * (p * pulses + m) + 1] = v[1];
        if (plan.interference) { const u = mfAt(plan, (i) => (i < Nw ? ib.re[i] : 0), (i) => (i < Nw ? ib.im[i] : 0), probeLags[p]); probeIntf[2 * (p * pulses + m)] = u[0]; probeIntf[2 * (p * pulses + m) + 1] = u[1]; }
      }
      correlate(xr, xi, yr, yi);
      if (m === showPulse) mfPulse = { re: Float32Array.from(yr), im: Float32Array.from(yi) };
      for (let n = 0; n < Nw; n++) { mapRe[m * Nw + n] = yr[n]; mapIm[m * Nw + n] = yi[n]; }
      if (hooks.progress) hooks.progress(m + 1, pulses + 1);
    }
    // Slow-time DFT per lag, window scaled to sum w^2 = 1, normalised by the thermal noise variance.
    const power = new Float32Array(pulses * Nw);
    const cplxRe = new Float32Array(pulses * Nw), cplxIm = new Float32Array(pulses * Nw);
    const sr = new Float64Array(pulses), si = new Float64Array(pulses);
    const inv = 1 / Math.sqrt(plan.sigma2);
    for (let n = 0; n < Nw; n++) {
      for (let m = 0; m < pulses; m++) { sr[m] = mapRe[m * Nw + n] * plan.win.w[m] * inv; si[m] = mapIm[m * Nw + n] * plan.win.w[m] * inv; }
      const [fr, fi] = N.dft(sr, si, -1);
      for (let k = 0; k < pulses; k++) { power[k * Nw + n] = fr[k] * fr[k] + fi[k] * fi[k]; cplxRe[k * Nw + n] = fr[k]; cplxIm[k * Nw + n] = fi[k]; }
    }
    if (hooks.progress) hooks.progress(pulses + 1, pulses + 1);
    const slow = (vec, k) => { let re = 0, im = 0; for (let m = 0; m < pulses; m++) { const a = (-2 * Math.PI * k * m) / pulses, c = Math.cos(a) * plan.win.w[m], s = Math.sin(a) * plan.win.w[m]; re += vec[2 * m] * c - vec[2 * m + 1] * s; im += vec[2 * m] * s + vec[2 * m + 1] * c; } return [re * inv, im * inv]; };
    // Noise measured on probe cells at every Doppler bin.
    let nsum = 0, isum = 0, count = 0;
    for (let p = 0; p < PROBES; p++) {
      for (let k = 0; k < pulses; k++) {
        const v = slow(probeNoise.subarray(2 * p * pulses, 2 * (p + 1) * pulses), k);
        nsum += v[0] * v[0] + v[1] * v[1];
        if (plan.interference) { const u = slow(probeIntf.subarray(2 * p * pulses, 2 * (p + 1) * pulses), k); isum += u[0] * u[0] + u[1] * u[1]; }
        count++;
      }
    }
    const noiseMeasured = nsum / count, gaussIntf = plan.interference ? isum / count : 0;
    const eta = opts.eta ?? -Math.log(opts.pfa ?? 1e-6);
    const cellOut = cells.map((cell, ci) => {
      const parts = {};
      for (const k of CATS) parts[k] = cell.inWindow ? slow(acc[ci][k], cell.bin) : [NaN, NaN];
      const tot = cell.inWindow ? [power[cell.bin * Nw + cell.lag], cplxRe[cell.bin * Nw + cell.lag], cplxIm[cell.bin * Nw + cell.lag]] : [NaN, NaN, NaN];
      const p2 = (v) => v[0] * v[0] + v[1] * v[1];
      const intfDet = [parts["other-echo"][0] + parts.direct[0] + parts.leakage[0], parts["other-echo"][1] + parts.direct[1] + parts.leakage[1]];
      const S = p2(parts.signal), Cl = p2(parts.clutter), I = p2(intfDet) + gaussIntf;
      return {
        target: cell.target, id: cell.id, lag: cell.lag, bin: cell.bin, inWindow: cell.inWindow, pulseOffset: cell.pulseOffset, walkSamples: cell.walkSamples, walk_m: cell.walk_m,
        apparentDelay: cell.apparentDelay, aliasedDoppler: cell.aliasedDoppler, binDoppler: binFreq(plan, cell.bin), dopplerBinHz: cell.dopplerBinHz,
        parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { re: v[0], im: v[1], power: p2(v) }])),
        perPulseSignal: Array.from(acc[ci].signal, (x) => x * inv),
        interferenceDeterministic: { re: intfDet[0], im: intfDet[1], power: p2(intfDet) },
        gaussianInterference: gaussIntf,
        total: { power: tot[0], re: tot[1], im: tot[2] },
        thermalSnr: S, clutterPower: Cl, interferencePower: I, noisePower: noiseMeasured,
        sinr: S / (noiseMeasured + Cl + I),
        statistic: tot[0], detected: tot[0] > eta,
      };
    });
    let detections = 0, peak = 0;
    for (let i = 0; i < power.length; i++) { if (power[i] > eta) detections++; if (power[i] > peak) peak = power[i]; }
    return {
      ok: true, rxId: plan.rxId, txId: plan.txId, t0: plan.t0, key: plan.key, pulses, Nw, Fs: plan.Fs, w0: plan.w0, pri: plan.pri,
      power, cplxRe, cplxIm, rawPulse, mfPulse, showPulse,
      cells: cellOut, noise: { measured: noiseMeasured, expected: 1, probes: PROBES * pulses, rule: "normalised: thermal noise has unit mean power at the map" },
      eta, detections, cellsTotal: power.length, peak,
      window: { rule: plan.win.rule, gain: plan.win.gain, loss_dB: plan.win.loss_dB },
      excluded: plan.excluded, contributors: plan.contributors.map((c) => ({ id: c.id, kind: c.kind, category: c.category, P: c.P, tau0: c.tau0, fD: c.fD })),
      estimate: est, ms: Date.now() - t0,
    };
  }
  /** Windowed-sinc low-pass with cutoff fc (cycles per sample, two-sided bandwidth fc), unit output power for white input. */
  function lowpass(fc, taps = 63) {
    const h = new Float64Array(taps), mid = (taps - 1) / 2;
    let e = 0;
    for (let j = 0; j < taps; j++) { const x = j - mid; h[j] = fc * sinc(fc * x) * (0.42 - 0.5 * Math.cos((2 * Math.PI * j) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * j) / (taps - 1))); e += h[j] * h[j]; }
    const s = 1 / Math.sqrt(e);
    for (let j = 0; j < taps; j++) h[j] *= s;
    return { h, length: taps };
  }

  /* ===== CELL-ONLY SYNTHESIS (other channels for site combination) ===== */
  /**
   * Matched-filter output per pulse at one lag of one channel, by category, synthesising only the samples that
   * lag needs. Noise at a single lag is drawn from its exact distribution CN(0, k Ts Fs) per pulse.
   */
  function cellSeries(plan, lag, err, only) {
    const L = plan.refWave.n, pulses = plan.pulses;
    const out = { signal: new Float64Array(2 * pulses), other: new Float64Array(2 * pulses), noise: new Float64Array(2 * pulses) };
    const br = new Float64Array(L), bi = new Float64Array(L);
    const list = only ? plan.contributors.filter((c) => c.id === only) : plan.contributors;
    for (let m = 0; m < pulses; m++) {
      for (const c of list) {
        br.fill(0); bi.fill(0);
        let touched = false;
        for (const mp of pulsesFor(plan, c, m)) echoInto(plan, c, m, mp, lag, lag + L, (n, re, im) => { br[n - lag] += re; bi[n - lag] += im; touched = true; }, err);
        if (!touched) continue;
        const v = mfAt(plan, (i) => br[i - lag], (i) => bi[i - lag], lag);
        const dst = c.kind === "target" && c.target === err?.target && c.txId === plan.txId ? out.signal : out.other;
        dst[2 * m] += v[0]; dst[2 * m + 1] += v[1];
      }
      const z = N.stream(plan.seed, plan.rxId, plan.key, "cell-noise", lag, m).cnormal(plan.sigma2);
      out.noise[2 * m] = z[0]; out.noise[2 * m + 1] = z[1];
    }
    return out;
  }
  function slowAt(plan, vec, k) {
    let re = 0, im = 0;
    for (let m = 0; m < plan.pulses; m++) { const a = (-2 * Math.PI * k * m) / plan.pulses, c = Math.cos(a) * plan.win.w[m], s = Math.sin(a) * plan.win.w[m]; re += vec[2 * m] * c - vec[2 * m + 1] * s; im += vec[2 * m] * s + vec[2 * m + 1] * c; }
    const inv = 1 / Math.sqrt(plan.sigma2);
    return [re * inv, im * inv];
  }

  /**
   * Coherent site combination for one target and one transmitter's waveform at several receivers.
   * mode "ideal": zero residual errors; "error": the per-receiver errors. Alignment uses the expected delay,
   * Doppler and phase of the error-free signal (the synthetic scattering phase is assumed known).
   */
  function combineSites(scn, t0, { target, transmitter, receivers, mode, errors }) {
    const channels = [], refused = [];
    const seen = new Set();
    for (const rxId of receivers) {
      if (seen.has(rxId)) { refused.push({ rx: rxId, reason: "duplicate channel from the same receiver: its noise is not independent" }); continue; }
      seen.add(rxId);
      const plan = planChannel(scn, rxId, transmitter, t0);
      if (!plan.ok) { refused.push({ rx: rxId, reason: plan.reasons.join("; ") }); continue; }
      channels.push({ rxId, plan, group: M.groupKey(scn, transmitter, rxId) });
    }
    const groups = [...new Set(channels.map((c) => c.group))];
    const fsSet = new Set(channels.map((c) => c.plan.Fs));
    if (fsSet.size > 1) return { ok: false, reasons: ["receivers use different sample rates: not one coherent group"], channels: [], refused, groups };
    const rows = [];
    for (const ch of channels) {
      const c = ch.plan.contributors.find((x) => x.kind === "target" && x.target === target && x.txId === transmitter);
      if (!c) { refused.push({ rx: ch.rxId, reason: `no valid echo of ${target} in this channel` }); continue; }
      const cell = expectedCell(ch.plan, c);
      const e = mode === "error" ? errors?.[ch.rxId] ?? {} : {};
      const lag = Math.round((cell.apparentDelay - ch.plan.w0 + (e.delay_s ?? 0)) * ch.plan.Fs);
      if (lag < 0 || lag >= ch.plan.Nw) { refused.push({ rx: ch.rxId, reason: "aligned cell outside the receive window" }); continue; }
      const ideal = cellSeries(ch.plan, lag, { target }, c.id);
      const errd = cellSeries(ch.plan, lag, mode === "error" ? { target, clock_s: e.clock_s ?? 0, cfo_Hz: e.cfo_Hz ?? 0, phase: N.rad(e.phase_deg ?? 0), scatter: N.rad(e.scatter_deg ?? 0) } : { target });
      const sIdeal = slowAt(ch.plan, ideal.signal, cell.bin);
      const s = slowAt(ch.plan, errd.signal, cell.bin), o = slowAt(ch.plan, errd.other, cell.bin), n = slowAt(ch.plan, errd.noise, cell.bin);
      const align = -Math.atan2(sIdeal[1], sIdeal[0]);
      rows.push({ rx: ch.rxId, lag, bin: cell.bin, group: ch.group, signal: s, other: o, noise: n, alignPhase: align, residualPhase: Math.atan2(s[1], s[0]) + align, snr: s[0] * s[0] + s[1] * s[1], sigma2: ch.plan.sigma2 });
    }
    if (!rows.length) return { ok: false, reasons: ["no eligible channel"], refused, groups };
    // Equal weights on noise-normalised outputs; independent receivers, so Cn = I and w^H Cn w = M.
    const Mn = rows.length, w = new Array(Mn).fill(1);
    const Cn = rows.map((_, i) => rows.map((__, j) => (i === j ? 1 : 0)));
    const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
    let sre = 0, sim = 0, tre = 0, tim = 0;
    for (const r of rows) {
      const a = rot(r.signal, r.alignPhase); sre += a[0]; sim += a[1];
      const b = rot([r.signal[0] + r.other[0] + r.noise[0], r.signal[1] + r.other[1] + r.noise[1]], r.alignPhase); tre += b[0]; tim += b[1];
    }
    let den = 0;
    for (let i = 0; i < Mn; i++) for (let j = 0; j < Mn; j++) den += w[i] * Cn[i][j] * w[j];
    const combinedSnr = (sre * sre + sim * sim) / den;
    const powerSum = rows.reduce((s, r) => s + r.snr, 0);
    return {
      ok: true, mode, target, transmitter, rows, refused, groups, weights: w, Cn, den,
      aligned: { re: sre, im: sim }, combinedSnr, combinedStatistic: (tre * tre + tim * tim) / den, total: { re: tre, im: tim },
      idealBound: Math.pow(rows.reduce((s, r) => s + Math.sqrt(r.snr), 0), 2) / Mn,
      powerSum, note: "Power sum shown for comparison only: it is not a coherent combination.",
      noiseModel: "independent receiver thermal noise; noise at the aligned cell drawn from CN(0, σ²) per pulse",
    };
  }

  /** Noise covariance of two unit-energy matched-filter outputs on the same receiver noise, at lags differing by d. */
  function filterCovariance(h1, h2, d) {
    let re = 0, im = 0;
    for (let q = 0; q < h1.n; q++) {
      const p = q + d;
      if (p < 0 || p >= h2.n) continue;
      // E[y1 y2*] = sigma^2 sum_q h1'[q] h2'*[q + d], with h' the correlation-form coefficients conj(w)/sqrt(E).
      re += h1.re[q] * h2.re[p] + h1.im[q] * h2.im[p];
      im += h1.im[q] * h2.re[p] - h1.re[q] * h2.im[p];
    }
    return { re, im, magnitude: Math.hypot(re, im) };
  }

  /* ===== AMBIGUITY ===== */
  /** |chi(tau, fd)|, normalised to 1 at the origin, on lags -L+1..L-1 and nDop Doppler bins over +-span Hz. */
  function ambiguity(w, span, nDop = 128, lagStep = 1) {
    const L = w.n, Fs = w.Fs;
    const lags = [];
    for (let l = -L + 1; l <= L - 1; l += lagStep) lags.push(l);
    const out = new Float32Array(lags.length * nDop);
    for (let li = 0; li < lags.length; li++) {
      const l = lags[li];
      for (let k = 0; k < nDop; k++) {
        const fd = -span + (2 * span * k) / (nDop - 1);
        let re = 0, im = 0;
        for (let n = Math.max(0, l); n < Math.min(L, L + l); n++) {
          const ar = w.re[n], ai = w.im[n], br = w.re[n - l], bi = -w.im[n - l];
          const pr = ar * br - ai * bi, pi = ar * bi + ai * br;
          const ph = (2 * Math.PI * fd * n) / Fs;
          re += pr * Math.cos(ph) - pi * Math.sin(ph); im += pr * Math.sin(ph) + pi * Math.cos(ph);
        }
        out[li * nDop + k] = Math.hypot(re, im) / w.E;
      }
    }
    return { values: out, lags, nDop, span, Fs, rule: "|χ(τ, f_d)| = |Σ w[n] w*[n−τ] e^{j2π f_d n/F_s}| / E" };
  }

  /* ===== MONTE CARLO AT ONE CELL ===== */
  /**
   * Seeded trials of one cell: Pd with the target and Pfa without it, under the selected fluctuation and phase
   * models, with the deterministic clutter and interference of the dwell and fresh thermal noise per trial.
   * The noise at a cell is CN(0, 1) after normalisation. Wilson 95% intervals.
   */
  function monteCarlo(plan, cell, { trials, eta, seed }) {
    const pulses = plan.pulses;
    // The clean echo at this cell (no fluctuation, zero scattering phase); each trial applies its own draws.
    const quiet = { ...plan, swerling: 0, phaseMode: "fixed", phaseValue: 0 };
    const series = cellSeries(quiet, cell.lag, { target: cell.target }, cell.id).signal;
    const inv = 1 / Math.sqrt(plan.sigma2);
    const clean = series.map((x) => x * inv);
    const det = [cell.parts.clutter.re + cell.interferenceDeterministic.re, cell.parts.clutter.im + cell.interferenceDeterministic.im];
    const gi = cell.gaussianInterference;
    const rng = N.stream(seed, plan.rxId, plan.txId, cell.target, plan.key, "monte-carlo");
    let hits = 0, fas = 0;
    const w = plan.win.w;
    for (let t = 0; t < trials; t++) {
      const fl = drawFluctuation(plan, rng, pulses);
      let re = 0, im = 0;
      for (let m = 0; m < pulses; m++) {
        const a = (-2 * Math.PI * cell.bin * m) / pulses, cw = Math.cos(a) * w[m], sw = Math.sin(a) * w[m];
        const vr = clean[2 * m] * fl.a[m], vi = clean[2 * m + 1] * fl.a[m];
        const pr = vr * Math.cos(fl.ph[m]) - vi * Math.sin(fl.ph[m]), pi = vr * Math.sin(fl.ph[m]) + vi * Math.cos(fl.ph[m]);
        re += pr * cw - pi * sw; im += pr * sw + pi * cw;
      }
      const n1 = rng.cnormal(1 + gi), n0 = rng.cnormal(1 + gi);
      if ((re + det[0] + n1[0]) ** 2 + (im + det[1] + n1[1]) ** 2 > eta) hits++;
      if ((det[0] + n0[0]) ** 2 + (det[1] + n0[1]) ** 2 > eta) fas++;
    }
    return { trials, seed, pd: N.wilson(hits, trials), pfa: N.wilson(fas, trials), hits, falseAlarms: fas, note: `${trials} trials cannot validate a Pfa near ${N.sig(Math.exp(-eta), 2)}: the interval shows what the trials support.` };
  }
  function drawFluctuation(plan, rng, pulses) {
    const sw = plan.swerling, a = new Float64Array(pulses).fill(1), ph = new Float64Array(pulses).fill(plan.phaseMode === "fixed" ? plan.phaseValue : 0);
    if (sw === 1 || sw === 3) { const x = Math.sqrt(sw === 1 ? rng.exponential() : rng.gamma2()); a.fill(x); }
    if (sw === 2 || sw === 4) for (let m = 0; m < pulses; m++) a[m] = Math.sqrt(sw === 2 ? rng.exponential() : rng.gamma2());
    if (plan.phaseMode === "per-dwell") ph.fill(rng.phase());
    if (plan.phaseMode === "per-pulse") for (let m = 0; m < pulses; m++) ph[m] = rng.phase();
    return { a, ph };
  }

  return {
    MEMORY_LIMIT, FD_TAPS, FD_BETA,
    waveform, matchedFilter, fdTaps, fdCheck, processingWindow,
    dwellKey, planChannel, estimate, runChannel, expectedCell, binFreq,
    echoInto, pulsesFor, mfAt, cellSeries, combineSites, filterCovariance,
    ambiguity, monteCarlo, lowpass,
  };
});
