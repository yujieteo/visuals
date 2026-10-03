/* Radar network visualiser: the analytic model.
 *
 * Geometry from state and time (never from animation frames), orientation, antenna gain, absolute RCS,
 * the bistatic radar equation, delay and Doppler, the thermal-noise SNR chain, the detector margin, range and
 * threshold surfaces, threshold-crossing scans, the direct path and self-leakage, and the coherent-combination
 * arithmetic. Right-handed local frame: x east, y north, z up; SI units inside; positive Doppler means approach.
 */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = node ? factory(require("./numerics.js"), require("./detector.js")) : factory(root.RadarNet.numerics, root.RadarNet.detector);
  if (node) module.exports = api;
  else (root.RadarNet = root.RadarNet || {}).model = api;
})(typeof self !== "undefined" ? self : this, function (N, D) {
  "use strict";

  const MODEL_VERSION = "1.0.0";
  const { C, K_B, dbToLin, linToDb, rad, deg, vsub, vadd, vscale, vdot, vnorm, vunit, vcross } = N;
  const FOUR_PI_CUBED = Math.pow(4 * Math.PI, 3);

  /* ===== TRAJECTORIES ===== */
  /** Breakpoints (times) of an object's trajectory and orientation, inside [0, duration]. */
  function breakpoints(obj) {
    const out = [];
    for (const w of obj.trajectory?.waypoints ?? []) out.push(w.t_s);
    for (const w of obj.orientation?.waypoints ?? []) out.push(w.t_s);
    return out;
  }
  /** Position (m) and velocity (m/s) at time t. Linear p0 + v t, or piecewise linear through waypoints. */
  function kinematics(obj, t) {
    const tr = obj.trajectory;
    const wps = tr.waypoints ?? [];
    if (wps.length >= 2) {
      let i = 0;
      while (i < wps.length - 2 && t >= wps[i + 1].t_s) i++;
      const a = wps[i], b = wps[i + 1];
      const v = vscale(vsub(b.position_m, a.position_m), 1 / (b.t_s - a.t_s));
      return { p: vadd(a.position_m, vscale(v, t - a.t_s)), v, segment: i };
    }
    return { p: vadd(tr.position_m, vscale(tr.velocity_mps, t)), v: tr.velocity_mps.slice(), segment: 0 };
  }

  /* ===== ORIENTATION ===== */
  /** Yaw, pitch, roll (degrees) at t: constant rates, or constant rates between orientation waypoints. */
  function attitude(obj, t) {
    const o = obj.orientation ?? { yaw_deg: 0, pitch_deg: 0, roll_deg: 0 };
    const wps = o.waypoints ?? [];
    if (wps.length >= 2) {
      let i = 0;
      while (i < wps.length - 2 && t >= wps[i + 1].t_s) i++;
      const a = wps[i], b = wps[i + 1], f = (t - a.t_s) / (b.t_s - a.t_s);
      return { yaw: a.yaw_deg + f * (b.yaw_deg - a.yaw_deg), pitch: a.pitch_deg + f * (b.pitch_deg - a.pitch_deg), roll: a.roll_deg + f * (b.roll_deg - a.roll_deg) };
    }
    const r = o.rates_dps ?? [0, 0, 0];
    return { yaw: o.yaw_deg + r[0] * t, pitch: o.pitch_deg + r[1] * t, roll: o.roll_deg + r[2] * t };
  }
  /** Body-to-world rotation Rz(yaw) Ry(-pitch) Rx(roll), as a row-major 3x3. Body: +x forward, +y left, +z up. */
  function bodyToWorld(att) {
    const cy = Math.cos(rad(att.yaw)), sy = Math.sin(rad(att.yaw));
    const p = -rad(att.pitch), cp = Math.cos(p), sp = Math.sin(p);
    const cr = Math.cos(rad(att.roll)), sr = Math.sin(rad(att.roll));
    // Rz * Ry * Rx with standard right-handed active rotations.
    return [
      [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
      [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
      [-sp, cp * sr, cp * cr],
    ];
  }
  const mulMV = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
  const mulMtV = (M, v) => [M[0][0] * v[0] + M[1][0] * v[1] + M[2][0] * v[2], M[0][1] * v[0] + M[1][1] * v[1] + M[2][1] * v[2], M[0][2] * v[0] + M[1][2] * v[1] + M[2][2] * v[2]];
  /** Unit vector for azimuth (from +x toward +y) and elevation (positive up), degrees. */
  const dirFromAzEl = (az, el) => [Math.cos(rad(el)) * Math.cos(rad(az)), Math.cos(rad(el)) * Math.sin(rad(az)), Math.sin(rad(el))];
  const azElFromDir = (u) => ({ az: deg(Math.atan2(u[1], u[0])), el: deg(Math.asin(Math.max(-1, Math.min(1, u[2])))) });

  /* ===== OBJECT STATE AT TIME t ===== */
  /** overrides: { id: position } places an object at a hypothetical point (velocity and attitude kept). */
  function objectState(scn, id, t, overrides) {
    const obj = scn.radars.find((r) => r.id === id) || scn.targets.find((r) => r.id === id);
    if (!obj) throw new RangeError(`unknown object ${id}`);
    const k = kinematics(obj, t), att = attitude(obj, t);
    const p = overrides && overrides[id] ? overrides[id] : k.p;
    return { id, obj, p, v: k.v, att, R: bodyToWorld(att), segment: k.segment };
  }

  /* ===== ANTENNA ===== */
  function wavelength(f) { return C / f; }
  /** Peak gain (linear) of a radar's antenna at carrier f: the dBi value, or 4 pi Aeff / lambda^2. */
  function peakGain(radar, f) {
    const a = radar.antenna;
    if (a.gainMode === "aperture") return (4 * Math.PI * a.aperture_m2) / Math.pow(wavelength(f), 2);
    return dbToLin(a.peakGain_dBi);
  }
  /** Boresight unit vector of a radar at time t. */
  function boresight(scn, radarId, t, overrides) {
    const s = objectState(scn, radarId, t, overrides), pt = s.obj.antenna.pointing;
    if (pt.mode === "track") {
      const tgt = objectState(scn, pt.target, t, overrides);
      const u = vunit(vsub(tgt.p, s.p));
      return { u, mode: "track", detail: `tracks ${pt.target}` };
    }
    if (pt.mode === "body") return { u: mulMV(s.R, dirFromAzEl(pt.az_deg, pt.el_deg)), mode: "body", detail: `az ${pt.az_deg}°, el ${pt.el_deg}° in the body frame` };
    return { u: dirFromAzEl(pt.az_deg, pt.el_deg), mode: "fixed", detail: `az ${pt.az_deg.toFixed(3)}°, el ${pt.el_deg.toFixed(3)}° in the world frame` };
  }
  /** Gain (linear and dBi) toward unit direction u. */
  function gainToward(scn, radarId, u, t, f, overrides) {
    const radar = scn.radars.find((r) => r.id === radarId);
    const a = radar.antenna;
    const g0 = peakGain(radar, f), g0db = linToDb(g0);
    const b = boresight(scn, radarId, t, overrides);
    const theta = deg(Math.acos(Math.max(-1, Math.min(1, vdot(b.u, u)))));
    if (a.mode === "uniform") return { g: g0, dBi: g0db, theta, atten_dB: 0, boresight: b, rule: "isotropic pattern factor: G = G_peak in every direction" };
    if (a.mode === "imported") {
      const r = patternLookup(a.pattern, b.u, u, f);
      if (!r.ok) return { g: NaN, dBi: NaN, theta, atten_dB: NaN, boresight: b, invalid: r.reason, rule: "imported pattern" };
      return { g: dbToLin(r.dBi), dBi: r.dBi, theta, atten_dB: g0db - r.dBi, boresight: b, rule: `imported pattern, ${a.pattern.interpolation}` };
    }
    const atten = Math.min(12 * Math.pow(theta / a.beamwidth_deg, 2), a.floor_dB);
    const dBi = g0db - atten;
    return { g: dbToLin(dBi), dBi, theta, atten_dB: atten, floor: atten >= a.floor_dB, boresight: b, rule: "G_dBi = G_peak - min(12 (theta/theta_3dB)^2, A_max)" };
  }
  /** Imported pattern: gain in dBi on (az, el) offsets from boresight, bilinear in dB, no extrapolation. */
  function patternLookup(pat, bore, u, f) {
    if (!pat) return { ok: false, reason: "no imported pattern" };
    if (Math.abs(pat.frequency_Hz - f) > (pat.frequencyTolerance_Hz ?? 0)) return { ok: false, reason: `pattern frequency ${pat.frequency_Hz / 1e9} GHz does not match the carrier ${f / 1e9} GHz` };
    // Boresight frame: x along boresight, y horizontal left, z completing.
    const x = bore, zUp = [0, 0, 1];
    let y = vunit(vcross(zUp, x));
    if (!Number.isFinite(y[0])) y = [0, 1, 0];
    const z = vcross(x, y);
    const l = [vdot(u, x), vdot(u, y), vdot(u, z)];
    const az = deg(Math.atan2(l[1], l[0])), el = deg(Math.asin(Math.max(-1, Math.min(1, l[2]))));
    const v = bilinear(pat.az_deg, pat.el_deg, pat.gain_dBi, az, el);
    return v.ok ? { ok: true, dBi: v.value } : v;
  }
  function bracket(axis, x) {
    if (x < axis[0] || x > axis[axis.length - 1]) return null;
    let i = 0;
    while (i < axis.length - 2 && x > axis[i + 1]) i++;
    return { i, f: (x - axis[i]) / (axis[i + 1] - axis[i]) };
  }
  /** Bilinear interpolation of table[el][az]; missing (null) corner values or points outside the domain refuse. */
  function bilinear(azAxis, elAxis, table, az, el) {
    const a = bracket(azAxis, az), e = bracket(elAxis, el);
    if (!a || !e) return { ok: false, reason: `outside the table domain (az ${az.toFixed(2)}°, el ${el.toFixed(2)}°)` };
    const v00 = table[e.i][a.i], v01 = table[e.i][a.i + 1], v10 = table[e.i + 1][a.i], v11 = table[e.i + 1][a.i + 1];
    if ([v00, v01, v10, v11].some((v) => v === null || !Number.isFinite(v))) return { ok: false, reason: "missing table value at a neighbouring point" };
    const value = (1 - e.f) * ((1 - a.f) * v00 + a.f * v01) + e.f * ((1 - a.f) * v10 + a.f * v11);
    return { ok: true, value };
  }

  /* ===== RCS ===== */
  /** Synthetic aspect response: q(u) = sum_d w_d u_d^2 in the body frame. */
  const aspectQ = (u, w) => w[0] * u[0] * u[0] + w[1] * u[1] * u[1] + w[2] * u[2] * u[2];
  /** Absolute RCS (m^2) for target state ts, incident direction ut and receive direction ur (world, unit). */
  function rcs(target, ts, ut, ur, linkKey, f, monostatic) {
    const r = target.rcs;
    if (r.mode === "constant") {
      const over = r.overrides?.[linkKey];
      const v = over ?? r.value_m2;
      return { ok: true, sigma: v, mode: "constant", detail: over !== undefined ? `per-link override for ${linkKey}` : "constant value for the target", synthetic: true };
    }
    const bt = mulMtV(ts.R, ut), br = mulMtV(ts.R, ur);
    if (r.mode === "analytic") {
      const { a, w } = r.analytic;
      const qt = aspectQ(bt, w), qr = aspectQ(br, w);
      const sigma = r.value_m2 * (a + ((1 - a) * (qt + qr)) / 2);
      return { ok: true, sigma, mode: "analytic", qt, qr, bodyT: bt, bodyR: br, a, w, sigma0: r.value_m2, detail: "Synthetic aspect response", synthetic: true };
    }
    if (r.mode === "table") {
      const tab = r.table;
      if (!tab) return { ok: false, reason: "no imported RCS table" };
      if (Math.abs(tab.frequency_Hz - f) > (tab.frequencyTolerance_Hz ?? 0)) return { ok: false, reason: `table frequency ${tab.frequency_Hz / 1e9} GHz does not match the carrier ${f / 1e9} GHz` };
      if (tab.geometry === "monostatic" && !monostatic) return { ok: false, reason: "a monostatic table cannot supply a bistatic value" };
      const inc = azElFromDir(vscale(bt, -1)); // direction from target toward the transmitter, body frame
      let v;
      if (tab.geometry === "monostatic") v = bilinear(tab.az_deg, tab.el_deg, tab.values_m2, inc.az, inc.el);
      else {
        const beta = deg(Math.acos(Math.max(-1, Math.min(1, vdot(vscale(ut, -1), vscale(ur, -1))))));
        v = bilinear(tab.az_deg, tab.beta_deg, tab.values_m2, inc.az, beta);
      }
      if (!v.ok) return { ok: false, reason: v.reason };
      if (!(v.value >= 0)) return { ok: false, reason: "interpolated RCS is not a nonnegative value" };
      return { ok: true, sigma: v.value, mode: "table", detail: `imported table (${tab.provenance?.source ?? "no source"}), bilinear in m²`, synthetic: false };
    }
    return { ok: false, reason: `unknown RCS mode ${r.mode}` };
  }

  /* ===== RADAR EQUATION ===== */
  /** Bistatic radar equation, linear units. Returns the parts so a page can show each substitution. */
  function radarEquation({ Pt, Gt, Gr, lambda, sigma, Rt, Rr, L }) {
    const num = Pt * Gt * Gr * lambda * lambda * sigma;
    const den = FOUR_PI_CUBED * Rt * Rt * Rr * Rr * L;
    return { num, den, Pr: num / den };
  }
  /** Single-pulse matched-filter SNR: rho1 = Pr tau / (k Ts L_MF). */
  function pulseSnr({ Pr, tau, Ts, Lmf }) { return (Pr * tau) / (K_B * Ts * Lmf); }
  /** System noise temperature from the receive settings, with the noise factor applied exactly once. */
  function systemTemperature(rx) {
    if (rx.tempMode === "noise-factor") {
      const F = dbToLin(rx.noiseFigure_dB);
      return { Ts: rx.antennaTemp_K + (F - 1) * rx.refTemp_K, rule: "T_s = T_a + (F - 1) T_0", F };
    }
    return { Ts: rx.systemTemp_K, rule: "T_s entered directly (includes the receiver noise factor)" };
  }
  const dwellPulses = (wf) => wf.pulses;

  /* ===== LINKS ===== */
  const linkId = (tx, rx, tg) => `${tx}>${rx}:${tg}`;
  function parseLinkId(id) {
    const m = /^([^>]+)>([^:]+):(.+)$/.exec(id);
    return m ? { tx: m[1], rx: m[2], target: m[3] } : null;
  }
  function linkIds(scn) {
    const out = [];
    for (const tx of scn.radars) for (const rx of scn.radars) for (const tg of scn.targets) out.push(linkId(tx.id, rx.id, tg.id));
    return out;
  }
  function detectorOpts(scn, tx) {
    const p = scn.processing;
    return { integration: p.integration, pulses: tx.tx.pulses, pfa: p.pfa, pdRequired: p.pdRequired, swerling: p.swerling, phase: p.phase.mode };
  }

  /**
   * Evaluate one link at time t. Never replaces a result by zero: an inactive, incompatible or invalid link
   * keeps its reasons, and every number that could be computed.
   */
  function evaluateLink(scn, id, t, opts = {}) {
    const ids = parseLinkId(id);
    const out = { id, ...ids, t, reasons: [], status: "ok" };
    const tx = scn.radars.find((r) => r.id === ids.tx), rx = scn.radars.find((r) => r.id === ids.rx), tg = scn.targets.find((r) => r.id === ids.target);
    if (!tx || !rx || !tg) { out.status = "invalid"; out.reasons.push("unknown object"); return out; }
    out.type = tx.id === rx.id ? "monostatic" : "bistatic";
    const f = tx.tx.carrier_Hz, lambda = wavelength(f);
    if (!tx.tx.enabled) { out.status = "inactive"; out.reasons.push(`${tx.id} transmitter is off`); }
    if (!rx.rx.enabled) { out.status = "inactive"; out.reasons.push(`${rx.id} receiver is off`); }
    if (rx.tx.carrier_Hz !== f) { out.status = out.status === "ok" ? "incompatible" : out.status; out.reasons.push(`${rx.id} receives at ${rx.tx.carrier_Hz / 1e9} GHz; ${tx.id} transmits at ${f / 1e9} GHz`); }
    const ov = opts.overrides;
    const st = objectState(scn, tx.id, t, ov), sr = objectState(scn, rx.id, t, ov), sk = objectState(scn, tg.id, t, ov);
    const dt = vsub(sk.p, st.p), dr = vsub(sk.p, sr.p), db = vsub(sr.p, st.p);
    const Rt = vnorm(dt), Rr = vnorm(dr), Dbase = vnorm(db);
    const ut = vscale(dt, 1 / Rt), ur = vscale(dr, 1 / Rr);
    const Rtdot = vdot(vsub(sk.v, st.v), ut), Rrdot = vdot(vsub(sk.v, sr.v), ur);
    const tauE = (Rt + Rr) / C, tauX = (Rt + Rr - Dbase) / C, fD = -(Rtdot + Rrdot) / lambda;
    const beta = deg(Math.acos(Math.max(-1, Math.min(1, vdot(ut, ur)))));
    out.geometry = { f, lambda, pt: st.p, pr: sr.p, pk: sk.p, vt: st.v, vr: sr.v, vk: sk.v, Rt, Rr, D: Dbase, ut, ur, Rtdot, Rrdot, tauE, tauX, fD, beta, Requiv: (Rt + Rr) / 2, sum: Rt + Rr, product: Rt * Rr, attT: sk.att };
    const ffT = tx.antenna.farField_m, ffR = rx.antenna.farField_m;
    if (Rt < ffT) { out.status = out.status === "ok" ? "outside-model" : out.status; out.reasons.push(`R_t = ${Rt.toFixed(1)} m is inside the ${ffT} m far-field bound of ${tx.id}`); }
    if (Rr < ffR) { out.status = out.status === "ok" ? "outside-model" : out.status; out.reasons.push(`R_r = ${Rr.toFixed(1)} m is inside the ${ffR} m far-field bound of ${rx.id}`); }
    if (sk.p[2] < 0) { out.status = out.status === "ok" ? "outside-model" : out.status; out.reasons.push(`${tg.id} is below the ground plane z = 0`); }
    // Range aliasing: the window opens at window_s[0] after each pulse start.
    const pri = 1 / tx.tx.prf_Hz, w0 = rx.rx.window_s[0], w1 = rx.rx.window_s[1];
    const k = Math.floor((tauE - w0) / pri), apparent = tauE - k * pri;
    out.timing = { pri, pulseOffset: k, apparentDelay: apparent, apparentRange: (C * apparent) / 2, inWindow: apparent >= w0 && apparent <= w1, aliased: k > 0 };
    if (k > 0) out.reasons.push(`echo arrives ${k} pulse interval(s) late: apparent delay ${(apparent * 1e6).toFixed(3)} μs (range aliasing)`);
    // Gains along the paths.
    const gt = gainToward(scn, tx.id, ut, t, f, ov), gr = gainToward(scn, rx.id, ur, t, f, ov);
    out.gains = { tx: gt, rx: gr };
    if (gt.invalid || gr.invalid) { out.status = out.status === "ok" ? "outside-model" : out.status; out.reasons.push(gt.invalid || gr.invalid); }
    // RCS.
    const sig = rcs(tg, sk, ut, ur, `${tx.id}>${rx.id}`, f, tx.id === rx.id);
    out.rcs = sig;
    if (!sig.ok) { out.status = out.status === "ok" ? "outside-model" : out.status; out.reasons.push(sig.reason); }
    const L = dbToLin(scn.processing.echoLoss_dB);
    out.loss = { L, dB: scn.processing.echoLoss_dB };
    const rxT = systemTemperature(rx.rx);
    if (sig.ok && Number.isFinite(gt.g) && Number.isFinite(gr.g)) {
      const eq = radarEquation({ Pt: tx.tx.power_W, Gt: gt.g, Gr: gr.g, lambda, sigma: sig.sigma, Rt, Rr, L });
      out.power = { Pt: tx.tx.power_W, Gt: gt.g, Gr: gr.g, lambda, sigma: sig.sigma, L, ...eq, PrdBm: linToDb(eq.Pr) + 30 };
      const Lmf = dbToLin(rx.rx.mfLoss_dB), tau = tx.tx.pulse_s, Bn = rx.rx.noiseBandwidth_Hz;
      const Ninput = K_B * rxT.Ts * Bn;
      const rho1 = pulseSnr({ Pr: eq.Pr, tau, Ts: rxT.Ts, Lmf });
      const Np = dwellPulses(tx.tx);
      const integ = scn.processing.integration;
      out.snr = { Ts: rxT.Ts, tsRule: rxT.rule, Bn, Ninput, rhoInput: eq.Pr / Ninput, tau, Lmf, rho1, pulses: Np, rhoN: integ === "coherent" ? Np * rho1 : NaN, integration: integ };
      if (!opts.skipDetector) {
        const dopts = detectorOpts(scn, tx);
        const req = D.requiredSnr(dopts);
        const thr = D.threshold(dopts.integration, dopts.pulses, dopts.pfa);
        const p = D.pd(dopts, rho1, { check: !!opts.check });
        out.detector = { ...dopts, eta: thr.eta, thresholdRule: thr.rule, pd: p.pd, q: p.q, method: p.method, check: p.check, req, margin_dB: linToDb(rho1) - req.db };
        // Range interpretation at the required SNR with the current gains, RCS and loss frozen.
        const K2 = (tx.tx.power_W * gt.g * gr.g * lambda * lambda * sig.sigma * tau) / (FOUR_PI_CUBED * K_B * rxT.Ts * L * Lmf * req.rho1);
        out.range = { productAtThreshold: Math.sqrt(K2), product: Rt * Rr, monostaticRmax: Math.pow(K2, 0.25), frozen: true };
      }
    } else {
      out.power = null;
    }
    if (out.status !== "ok" && out.status !== "outside-model" && !out.reasons.length) out.reasons.push(out.status);
    out.valid = out.status === "ok";
    return out;
  }

  function evaluateAll(scn, t, opts) { return linkIds(scn).map((id) => evaluateLink(scn, id, t, opts)); }

  /* ===== DIRECT PATH AND SELF-LEAKAGE ===== */
  /** Friis direct-path power from transmitter i to receiver j (distinct sites), with cancellation. */
  function directPath(scn, txId, rxId, t) {
    const tx = scn.radars.find((r) => r.id === txId), rx = scn.radars.find((r) => r.id === rxId);
    const f = tx.tx.carrier_Hz, lambda = wavelength(f);
    if (txId === rxId) {
      const iso = rx.leakage.isolation_dB, can = rx.leakage.cancellation_dB;
      const raw = tx.tx.power_W * dbToLin(-iso);
      return { kind: "self-leakage", Pt: tx.tx.power_W, isolation_dB: iso, cancellation_dB: can, raw, P: raw * dbToLin(-can), amp: Math.sqrt(raw) * N.dbToAmp(-can), delay: 0, rule: "P = P_t 10^{-I/10} 10^{-C/10}" };
    }
    const st = objectState(scn, txId, t), sr = objectState(scn, rxId, t);
    const d = vsub(sr.p, st.p), Dd = vnorm(d), u = vscale(d, 1 / Dd);
    const gt = gainToward(scn, txId, u, t, f), gr = gainToward(scn, rxId, vscale(u, -1), t, f);
    const Ld = dbToLin(scn.environment.directPath.extraLoss_dB);
    const raw = (tx.tx.power_W * gt.g * gr.g * lambda * lambda) / (Math.pow(4 * Math.PI * Dd, 2) * Ld);
    const can = scn.environment.directPath.cancellation_dB;
    const Ddot = vdot(vsub(sr.v, st.v), u);
    return { kind: "direct", D: Dd, Gt: gt, Gr: gr, Ld, raw, cancellation_dB: can, P: raw * dbToLin(-can), amp: Math.sqrt(raw) * N.dbToAmp(-can), delay: Dd / C, fD: -Ddot / lambda, rule: "P = P_t G_t G_r λ² / ((4π D)² L_d)" };
  }

  /* ===== CLUTTER PATCHES ===== */
  /** One synthetic ground patch through the same link equation. */
  function patchEcho(scn, patch, txId, rxId, t) {
    const tx = scn.radars.find((r) => r.id === txId);
    const f = tx.tx.carrier_Hz, lambda = wavelength(f);
    const st = objectState(scn, txId, t), sr = objectState(scn, rxId, t);
    const p = patch.position_m;
    const dt = vsub(p, st.p), dr = vsub(p, sr.p), Rt = vnorm(dt), Rr = vnorm(dr);
    const ut = vscale(dt, 1 / Rt), ur = vscale(dr, 1 / Rr);
    const visible = vdot(ut, patch.normal) < 0 && vdot(ur, patch.normal) < 0; // both sites above the patch plane
    const gt = gainToward(scn, txId, ut, t, f), gr = gainToward(scn, rxId, ur, t, f);
    const sigma = dbToLin(patch.sigma0_dB) * patch.area_m2;
    const eq = radarEquation({ Pt: tx.tx.power_W, Gt: gt.g, Gr: gr.g, lambda, sigma, Rt, Rr, L: dbToLin(scn.processing.echoLoss_dB) });
    const Rtdot = vdot(vscale(st.v, -1), ut), Rrdot = vdot(vscale(sr.v, -1), ur);
    return { id: patch.id, visible, sigma, Rt, Rr, Pr: visible ? eq.Pr : 0, tauE: (Rt + Rr) / C, fD: -(Rtdot + Rrdot) / lambda, Gt: gt.dBi, Gr: gr.dBi, phase_deg: patch.phase_deg };
  }
  /** Monostatic constant-gamma comparison: sigma0 = gamma sin(grazing). Valid only for monostatic links. */
  function constantGammaSigma0(gamma_dB, grazing_deg) { return dbToLin(gamma_dB) * Math.sin(rad(grazing_deg)); }

  /* ===== THRESHOLD SURFACES ===== */
  /** Cassini oval in a plane: points with Rt Rr = K around foci at (-d, 0) and (d, 0). Returns closed loops. */
  function cassini(K, d, n = 180) {
    const loops = [];
    if (d === 0) { const r = Math.sqrt(K), l = []; for (let i = 0; i <= n; i++) { const a = (2 * Math.PI * i) / n; l.push([r * Math.cos(a), r * Math.sin(a)]); } return [l]; }
    const d2 = d * d;
    if (K >= d2) {
      const l = [];
      for (let i = 0; i <= n; i++) {
        const a = (2 * Math.PI * i) / n, c2 = Math.cos(2 * a), s2 = Math.sin(2 * a);
        const r = Math.sqrt(d2 * c2 + Math.sqrt(K * K - d2 * d2 * s2 * s2));
        l.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      loops.push(l);
    } else {
      const amax = 0.5 * Math.asin(K / d2);
      for (const side of [1, -1]) {
        const outer = [], inner = [];
        for (let i = 0; i <= n; i++) {
          const a = -amax + (2 * amax * i) / n, c2 = Math.cos(2 * a), s2 = Math.sin(2 * a);
          const root = Math.sqrt(Math.max(0, K * K - d2 * d2 * s2 * s2));
          const ro = Math.sqrt(d2 * c2 + root), ri = Math.sqrt(Math.max(0, d2 * c2 - root));
          outer.push([side * ro * Math.cos(a), ro * Math.sin(a)]);
          inner.push([side * ri * Math.cos(a), ri * Math.sin(a)]);
        }
        loops.push([...outer, ...inner.reverse(), outer[0]]);
      }
    }
    return loops;
  }
  /** Frozen surface Rt Rr = K as rings of revolution about the baseline from pt to pr (world points). */
  function frozenSurface(pt, pr, K, rings = 12, n = 96) {
    const mid = vscale(vadd(pt, pr), 0.5), base = vsub(pr, pt), d = vnorm(base) / 2;
    const ax = d > 0 ? vscale(base, 1 / (2 * d)) : [1, 0, 0];
    let e1 = vunit(vcross(ax, [0, 0, 1]));
    if (!Number.isFinite(e1[0])) e1 = [0, 1, 0];
    const e2 = vcross(ax, e1);
    const loops2 = cassini(K, d, n);
    const lines = [];
    for (let r = 0; r < rings; r++) {
      const phi = (Math.PI * r) / rings, dirv = vadd(vscale(e1, Math.cos(phi)), vscale(e2, Math.sin(phi)));
      for (const loop of loops2) lines.push(loop.map(([a, b]) => vadd(vadd(mid, vscale(ax, a)), vscale(dirv, b))));
    }
    return { lines, d, K, kind: d > 0 ? "Cassini surface of revolution about the baseline" : "sphere" };
  }
  /**
   * Active-model range cut: margin along the ray from origin in unit direction u, with gains and RCS
   * evaluated at each point (target placed there, its velocity and orientation kept). Bracketed roots.
   */
  function rangeCut(scn, id, u, t, { rMin = 100, rMax = 400e3, steps = 400, origin = "tx" } = {}) {
    const ids = parseLinkId(id);
    const base = objectState(scn, origin === "tx" ? ids.tx : ids.rx, t).p;
    const margin = (r) => {
      const L = evaluateLink(scn, id, t, { overrides: { [ids.target]: vadd(base, vscale(u, r)) } });
      return L.detector && L.status === "ok" ? L.detector.margin_dB : NaN;
    };
    const samples = [];
    {
      const lr0 = Math.log(rMin), lr1 = Math.log(rMax);
      for (let i = 0; i <= steps; i++) { const r = Math.exp(lr0 + ((lr1 - lr0) * i) / steps); samples.push([r, margin(r)]); }
      const intervals = [], roots = [];
      for (let i = 1; i < samples.length; i++) {
        const [r0, m0] = samples[i - 1], [r1, m1] = samples[i];
        if (Number.isFinite(m0) && Number.isFinite(m1) && m0 * m1 < 0) roots.push(N.bisect(margin, r0, r1, 0.5).x);
      }
      let inside = samples[0][1] >= 0, start = inside ? samples[0][0] : null;
      for (const r of roots) { if (inside) intervals.push([start, r]); else start = r; inside = !inside; }
      if (inside) intervals.push([start, rMax]);
      return { intervals, roots, samples, rMin, rMax, resolution: `${steps + 1} log-spaced samples from ${rMin} m to ${rMax / 1000} km, roots bisected to 0.5 m` };
    }
  }

  /* ===== TIME SCANS AND THRESHOLD CROSSINGS ===== */
  /**
   * Scan one link over [0, duration] at no more than 0.05 s, segmented at trajectory and orientation
   * breakpoints; refine sign changes of the margin to 1 ms; flag sampled local extrema near zero.
   */
  function scanLink(scn, id, { step = 0.05, refine = 1e-3, near_dB = 0.5 } = {}) {
    const ids = parseLinkId(id), T = scn.scene.duration_s;
    const objs = [ids.tx, ids.rx, ids.target].map((x) => scn.radars.find((r) => r.id === x) || scn.targets.find((r) => r.id === x));
    for (const r of [ids.tx, ids.rx]) { const pt = scn.radars.find((x) => x.id === r).antenna.pointing; if (pt.mode === "track") objs.push(scn.targets.find((x) => x.id === pt.target)); }
    const cuts = [...new Set([0, T, ...objs.flatMap(breakpoints).filter((x) => x > 0 && x < T)])].sort((a, b) => a - b);
    const series = [], crossings = [], near = [];
    const marginAt = (t) => { const L = evaluateLink(scn, id, t); return L.detector ? L.detector.margin_dB : NaN; };
    for (let s = 0; s < cuts.length - 1; s++) {
      const a = cuts[s], b = cuts[s + 1], n = Math.max(1, Math.ceil((b - a) / step - 1e-9));
      const seg = [];
      for (let i = 0; i <= n; i++) {
        const t = i === n ? b - 1e-9 * (s < cuts.length - 2 ? 1 : 0) : a + ((b - a) * i) / n;
        const L = evaluateLink(scn, id, t);
        seg.push({ t, PrdBm: L.power ? L.power.PrdBm : NaN, margin: L.detector ? L.detector.margin_dB : NaN, fD: L.geometry.fD, pd: L.detector ? L.detector.pd : NaN, status: L.status });
      }
      for (let i = 1; i < seg.length; i++) {
        const m0 = seg[i - 1].margin, m1 = seg[i].margin;
        if (Number.isFinite(m0) && Number.isFinite(m1) && m0 * m1 < 0) {
          const r = N.bisect(marginAt, seg[i - 1].t, seg[i].t, refine);
          crossings.push({ t: r.x, direction: m1 > m0 ? "rises above threshold" : "falls below threshold" });
        }
      }
      for (let i = 1; i < seg.length - 1; i++) {
        const m = seg[i].margin, p = seg[i - 1].margin, q = seg[i + 1].margin;
        const ext = (m >= p && m >= q) || (m <= p && m <= q);
        if (ext && Math.abs(m) < near_dB && p * m > 0 && q * m > 0) near.push({ from: seg[i - 1].t, to: seg[i + 1].t, margin: m, note: "sampled local extremum near the threshold: a tangential contact or a short crossing pair may be unresolved" });
      }
      series.push(...seg);
    }
    return { id, step, refine, breakpoints: cuts, series, crossings, near, note: `Samples every ≤ ${step} s; roots refined to ${refine * 1000} ms. A crossing pair shorter than the sample step can be missed.` };
  }

  /* ===== COHERENT COMBINATION (analytic) ===== */
  /**
   * Combined SNR of aligned channels: |sum w_m a_m e^{i eps_m}|^2 / (w^H Cn w), with a_m = sqrt(rho_m) and unit
   * per-channel noise variance on the diagonal of Cn. Returns the numerator, the denominator and the parts.
   */
  function combineSnr(rhos, phaseErr_rad, weights, Cn) {
    const M = rhos.length;
    const w = weights ?? new Array(M).fill(1);
    let re = 0, im = 0;
    for (let m = 0; m < M; m++) { const a = Math.sqrt(rhos[m]) * w[m]; re += a * Math.cos(phaseErr_rad[m]); im += a * Math.sin(phaseErr_rad[m]); }
    const C2 = Cn ?? Array.from({ length: M }, (_, i) => Array.from({ length: M }, (_, j) => (i === j ? 1 : 0)));
    let den = 0;
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) den += w[i] * C2[i][j] * w[j];
    const num = re * re + im * im;
    return { num, den, snr: num / den, sumRe: re, sumIm: im, weights: w, Cn: C2 };
  }
  /** Coherence group key for a channel (receiver rx with the filter of transmitter tx). */
  function groupKey(scn, txId, rxId) {
    const tx = scn.radars.find((r) => r.id === txId), rx = scn.radars.find((r) => r.id === rxId);
    const w = tx.tx;
    return [`${w.carrier_Hz / 1e9} GHz`, `${w.waveform}${w.waveform === "lfm" ? "-" + w.chirp : ""} ${w.pulse_s * 1e6} μs ${w.waveform === "lfm" ? w.bandwidth_Hz / 1e6 + " MHz" : ""}`.trim(), `${rx.rx.sampleRate_Hz / 1e6} MHz`, `offset ${w.offset_s * 1e6} μs`].join(" | ");
  }

  /* ===== AMBIGUITY LIMITS ===== */
  function waveformLimits(tx) {
    const w = tx.tx;
    return {
      unambiguousRange: C / (2 * w.prf_Hz),
      unambiguousDoppler: w.prf_Hz,
      rangeResolution: w.waveform === "lfm" ? C / (2 * w.bandwidth_Hz) : (C * w.pulse_s) / 2,
      resolutionRule: w.waveform === "lfm" ? "c/(2B), nominal LFM" : "c τ / 2, rectangular pulse-width convention",
      dopplerResolution: w.prf_Hz / w.pulses,
      dutyCycle: w.pulse_s * w.prf_Hz,
      timeBandwidth: w.waveform === "lfm" ? w.pulse_s * w.bandwidth_Hz : 1,
    };
  }

  /* ===== PUBLISHED REFERENCE CASES ===== */
  /** Evaluate one published MathWorks case with this model's own equations. */
  function referenceCheck(rc) {
    const i = rc.inputs, lambda = wavelength(i.f_Hz), Gt = dbToLin(i.Gt_dB), Gr = dbToLin(i.Gr_dB), L = dbToLin(i.L_dB);
    let computed;
    if (rc.kind === "snr") {
      const eq = radarEquation({ Pt: i.Pt_W, Gt, Gr, lambda, sigma: i.sigma_m2, Rt: i.Rt_m, Rr: i.Rr_m, L });
      computed = linToDb(pulseSnr({ Pr: eq.Pr, tau: i.tau_s, Ts: i.Ts_K, Lmf: 1 }));
    } else {
      const K = (i.Pt_W * Gt * Gr * lambda * lambda * i.sigma_m2 * i.tau_s) / (FOUR_PI_CUBED * K_B * i.Ts_K * L * dbToLin(i.snr_dB));
      computed = Math.pow(K, 0.25);
    }
    const diff = computed - rc.published;
    return { id: rc.id, computed, published: rc.published, diff, tolerance: rc.tolerance, pass: Math.abs(diff) <= rc.tolerance, units: rc.units };
  }

  return {
    MODEL_VERSION, FOUR_PI_CUBED, referenceCheck,
    kinematics, attitude, bodyToWorld, mulMV, mulMtV, dirFromAzEl, azElFromDir, objectState, breakpoints,
    wavelength, peakGain, boresight, gainToward, bilinear,
    aspectQ, rcs,
    radarEquation, pulseSnr, systemTemperature,
    linkId, parseLinkId, linkIds, detectorOpts, evaluateLink, evaluateAll,
    directPath, patchEcho, constantGammaSigma0,
    cassini, frozenSurface, rangeCut, scanLink,
    combineSnr, groupKey, waveformLimits,
  };
});
