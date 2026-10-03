/* Radar network visualiser: manual calculations and the calculation snapshot.
 *
 * One implementation of every formatted calculation. The page's calculation panels, the exercises and the
 * beamdswitch report all read these steps, so the deck says exactly what the page shows. Each step has a
 * symbolic TeX form, a TeX substitution with numbers, and a plain-text result.
 */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = node ? factory(require("./numerics.js"), require("./model.js")) : factory(root.RadarNet.numerics, root.RadarNet.model);
  if (node) module.exports = api;
  else (root.RadarNet = root.RadarNet || {}).calc = api;
})(typeof self !== "undefined" ? self : this, function (N, M) {
  "use strict";

  /* ===== NUMBER FORMATS ===== */
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  function parts(x, d = 4) {
    if (x === 0) return { m: "0", e: 0 };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -3 && e < 6) return { m: String(Number(x.toPrecision(d))), e: 0 };
    let [m, ex] = x.toExponential(d - 1).split("e");
    return { m, e: Number(ex) };
  }
  /** TeX number with 4 significant digits by default: 1.234\times10^{-13}. */
  function tex(x, d = 4) {
    if (!Number.isFinite(x)) return x === Infinity ? "\\infty" : x === -Infinity ? "-\\infty" : "\\text{NaN}";
    const p = parts(x, d);
    return p.e ? `${p.m}\\times10^{${p.e}}` : p.m;
  }
  /** Plain text: 1.234×10⁻¹³, with a real minus sign. */
  function txt(x, d = 4) {
    if (!Number.isFinite(x)) return x === Infinity ? "∞" : x === -Infinity ? "−∞" : "not a number";
    const p = parts(x, d);
    const m = p.m.replace("-", "−");
    return p.e ? `${m}×10${String(p.e).split("").map((c) => SUP[c]).join("")}` : m;
  }
  /** Spoken: "1.234 times 10 to the power minus 13". */
  function spoken(x, d = 4) {
    if (!Number.isFinite(x)) return x === Infinity ? "infinity" : x === -Infinity ? "minus infinity" : "not a number";
    const p = parts(x, d);
    const m = p.m.startsWith("-") ? `minus ${p.m.slice(1)}` : p.m;
    return p.e ? `${m} times 10 to the power ${p.e < 0 ? "minus " + -p.e : p.e}` : m;
  }
  const fixed = (x, d) => (Number.isFinite(x) ? x.toFixed(d).replace(/^-/, "−") : txt(x));
  const fixedTex = (x, d) => (Number.isFinite(x) ? x.toFixed(d) : tex(x));
  const spokenFixed = (x, d) => (Number.isFinite(x) ? (x < 0 ? `minus ${(-x).toFixed(d)}` : x.toFixed(d)) : spoken(x));
  const vecTex = (v, s = 1, d = 4) => `(${v.map((x) => tex(x * s, d)).join(",\\,")})`;
  const vecTxt = (v, s = 1, d = 4) => `(${v.map((x) => txt(x * s, d)).join(", ")})`;
  const dBm = (W) => (W > 0 ? N.linToDb(W) + 30 : -Infinity);

  /* ===== MANUAL CALCULATION FOR ONE LINK ===== */
  /**
   * The seven sections of a link's calculation. `L` is model.evaluateLink(...); `sampled` (optional) holds the
   * current dwell's cell for this link, `stale` when its parameters differ from the current ones.
   */
  function linkCalc(scn, L, sampled) {
    const g = L.geometry, s = [];
    const hdr = { id: L.id, tx: L.tx, rx: L.rx, target: L.target, type: L.type, status: L.status, reasons: L.reasons };
    s.push({
      id: "objects", title: "1. Objects, time and conventions",
      rows: [
        { label: "Link", text: `${L.tx} transmits, ${L.rx} receives, target ${L.target} (${L.type}) at t = ${fixed(L.t, 3)} s` },
        { label: "Transmitter position", tex: `p_t=${vecTex(g.pt, 1e-3)}\\ \\mathrm{km},\\quad v_t=${vecTex(g.vt)}\\ \\mathrm{m/s}` },
        { label: "Receiver position", tex: `p_r=${vecTex(g.pr, 1e-3)}\\ \\mathrm{km},\\quad v_r=${vecTex(g.vr)}\\ \\mathrm{m/s}` },
        { label: "Target position", tex: `p_k=${vecTex(g.pk, 1e-3)}\\ \\mathrm{km},\\quad v_k=${vecTex(g.vk)}\\ \\mathrm{m/s}` },
        { label: "Target attitude", text: `yaw ${fixed(g.attT.yaw, 2)}°, pitch ${fixed(g.attT.pitch, 2)}°, roll ${fixed(g.attT.roll, 2)}°` },
        { label: "Conventions", text: "x east, y north, z up (right-handed). Yaw from +x toward +y; positive pitch above the horizontal; body axes +x forward, +y left, +z up; R = Rz(yaw) Ry(−pitch) Rx(roll). Positive Doppler means approach." },
      ],
    });
    s.push({
      id: "geometry", title: "2. Paths, delay and Doppler",
      rows: [
        { label: "Path lengths", tex: `R_t=\\lVert p_k-p_t\\rVert=${tex(g.Rt)}\\ \\mathrm{m},\\quad R_r=\\lVert p_k-p_r\\rVert=${tex(g.Rr)}\\ \\mathrm{m},\\quad D=${tex(g.D)}\\ \\mathrm{m}` },
        { label: "Directions", tex: `\\hat u_t=${vecTex(g.ut)},\\quad \\hat u_r=${vecTex(g.ur)},\\quad \\beta=${fixedTex(g.beta, 3)}^\\circ` },
        { label: "Path rates", tex: `\\dot R_t=(v_k-v_t)\\cdot\\hat u_t=${tex(g.Rtdot)}\\ \\mathrm{m/s},\\quad \\dot R_r=(v_k-v_r)\\cdot\\hat u_r=${tex(g.Rrdot)}\\ \\mathrm{m/s}` },
        { label: "Echo delay", tex: `\\tau_e=\\frac{R_t+R_r}{c}=\\frac{${tex(g.Rt + g.Rr)}}{299792458}=${tex(g.tauE * 1e6)}\\ \\mu\\mathrm{s}` },
        { label: "Excess delay", tex: `\\tau_x=\\frac{R_t+R_r-D}{c}=${tex(g.tauX * 1e6)}\\ \\mu\\mathrm{s}` },
        { label: "Doppler", tex: `f_D=-\\frac{\\dot R_t+\\dot R_r}{\\lambda}=-\\frac{${tex(g.Rtdot + g.Rrdot)}}{${tex(g.lambda)}}=${tex(g.fD)}\\ \\mathrm{Hz}` },
        { label: "Range axis", tex: `R_{eq}=\\frac{R_t+R_r}{2}=${tex(g.Requiv)}\\ \\mathrm{m}` },
        { label: "Range aliasing", text: L.timing.aliased ? `The echo arrives ${L.timing.pulseOffset} pulse interval(s) late: apparent delay ${txt(L.timing.apparentDelay * 1e6)} μs.` : `Pulse offset 0: the echo of pulse m arrives in window m (apparent delay ${txt(L.timing.apparentDelay * 1e6)} μs).` },
      ],
    });
    const gt = L.gains.tx, gr = L.gains.rx;
    const conv = [
      { label: "Wavelength", tex: `\\lambda=\\frac{c}{f}=\\frac{299792458}{${tex(g.f)}}=${tex(g.lambda)}\\ \\mathrm{m}` },
      { label: `Transmit gain (${L.tx})`, tex: `\\theta_t=${fixedTex(gt.theta, 3)}^\\circ,\\ G_t=${fixedTex(gt.dBi, 3)}\\ \\mathrm{dBi}\\Rightarrow 10^{${fixedTex(gt.dBi, 3)}/10}=${tex(gt.g)}`, note: gt.rule + (gt.floor ? " (simplified sidelobe floor)" : "") },
      { label: `Receive gain (${L.rx})`, tex: `\\theta_r=${fixedTex(gr.theta, 3)}^\\circ,\\ G_r=${fixedTex(gr.dBi, 3)}\\ \\mathrm{dBi}\\Rightarrow ${tex(gr.g)}`, note: gr.rule + (gr.floor ? " (simplified sidelobe floor)" : "") },
      { label: "Echo loss", tex: `L=${fixedTex(L.loss.dB, 2)}\\ \\mathrm{dB}\\Rightarrow 10^{${fixedTex(L.loss.dB, 2)}/10}=${tex(L.loss.L)}`, note: "Excludes geometric spreading, which is in the equation." },
    ];
    if (L.rcs.ok) {
      const r = L.rcs;
      conv.push(r.mode === "analytic"
        ? { label: "RCS (synthetic aspect response)", tex: `\\sigma_b=\\sigma_0\\Big[a+(1-a)\\tfrac{q(\\hat u_t)+q(\\hat u_r)}{2}\\Big]=${tex(r.sigma0)}\\Big[${tex(r.a)}+${tex(1 - r.a)}\\cdot\\tfrac{${tex(r.qt)}+${tex(r.qr)}}{2}\\Big]=${tex(r.sigma)}\\ \\mathrm{m^2}`, note: "Synthetic aspect response: not an electromagnetic scattering solution." }
        : { label: `RCS (${r.mode})`, tex: `\\sigma_b=${tex(r.sigma)}\\ \\mathrm{m^2}`, note: r.detail + (r.synthetic ? "; synthetic absolute value" : "") });
    } else conv.push({ label: "RCS", text: `No valid RCS: ${L.rcs.reason}` });
    s.push({ id: "conversions", title: "3. Conversions", rows: conv });
    const pw = L.power;
    s.push({
      id: "power", title: "4. Received power",
      rows: pw ? [
        { label: "Equation", tex: "P_r=\\frac{P_tG_tG_r\\lambda^2\\sigma_b}{(4\\pi)^3R_t^2R_r^2L}" },
        { label: "Substitution", tex: `P_r=\\frac{${tex(pw.Pt)}\\cdot${tex(pw.Gt)}\\cdot${tex(pw.Gr)}\\cdot(${tex(pw.lambda)})^2\\cdot${tex(pw.sigma)}}{(4\\pi)^3\\cdot(${tex(g.Rt)})^2\\cdot(${tex(g.Rr)})^2\\cdot${tex(pw.L)}}` },
        { label: "Numerator and denominator", tex: `\\frac{${tex(pw.num)}}{${tex(pw.den)}}=${tex(pw.Pr)}\\ \\mathrm{W}` },
        { label: "Result", tex: `P_r=${tex(pw.Pr)}\\ \\mathrm{W}=${fixedTex(pw.PrdBm, 2)}\\ \\mathrm{dBm}` },
      ] : [{ label: "Result", text: `Not calculated: ${L.reasons.join("; ")}` }],
    });
    const sn = L.snr, det = L.detector;
    s.push({
      id: "snr", title: "5. Noise, SNR, integration and required SNR",
      rows: sn ? [
        { label: "Noise convention", text: `${sn.tsRule}. Sampled noise: E|n|² = k T_s F_s, each quadrature k T_s F_s / 2.` },
        { label: "Input noise and SNR", tex: `N_{in}=kT_sB_n=1.380649\\times10^{-23}\\cdot${tex(sn.Ts)}\\cdot${tex(sn.Bn)}=${tex(sn.Ninput)}\\ \\mathrm{W},\\quad \\rho_{in}=\\frac{P_r}{N_{in}}=${tex(sn.rhoInput)}\\ (${fixedTex(N.linToDb(sn.rhoInput), 2)}\\ \\mathrm{dB})` },
        { label: "Matched-filter SNR", tex: `\\rho_1=\\frac{P_r\\tau}{kT_sL_{MF}}=\\frac{${tex(pw.Pr)}\\cdot${tex(sn.tau)}}{1.380649\\times10^{-23}\\cdot${tex(sn.Ts)}\\cdot${tex(sn.Lmf)}}=${tex(sn.rho1)}\\ (${fixedTex(N.linToDb(sn.rho1), 2)}\\ \\mathrm{dB})`, note: "Pulse energy SNR: includes the matched-filter gain once. The LFM time-bandwidth product is not added again." },
        sn.integration === "coherent"
          ? { label: "Ideal coherent integration", tex: `\\rho_N=N\\rho_1=${sn.pulses}\\cdot${tex(sn.rho1)}=${tex(sn.rhoN)}\\ (${fixedTex(N.linToDb(sn.rhoN), 2)}\\ \\mathrm{dB})` }
          : { label: "Noncoherent integration", tex: `T=\\sum_{m=1}^{${sn.pulses}}|z_m|^2,\\ \\text{noncentrality } 2N\\rho_1=${tex(2 * sn.pulses * sn.rho1)}` },
        det ? { label: "Detector threshold", tex: `${det.thresholdRule}\\Rightarrow\\eta=${tex(det.eta)}`, note: `Thermal noise only, P_fa = ${txt(det.pfa)} per decision cell. Threshold η is not the required SNR.` } : null,
        det ? { label: "Required SNR", tex: `\\rho_{req}=${tex(det.req.rho1)}\\ (${fixedTex(det.req.db, 3)}\\ \\mathrm{dB})\\ \\text{per pulse for } P_d=${det.pdRequired}`, note: `Swerling ${det.swerling}, ${det.integration}, phase ${det.phase}: ${det.req.method ?? ""}. ${det.req.check ?? ""}` } : null,
        det ? { label: "Predicted Pd", tex: `P_d=${pdTex(det)}`, note: `${det.method}. ${det.check}` } : null,
      ].filter(Boolean) : [{ label: "Result", text: "Not calculated." }],
    });
    s.push({
      id: "margin", title: "6. Threshold margin, range and validity",
      rows: det ? [
        { label: "Margin", tex: `M=10\\log_{10}\\rho_1-10\\log_{10}\\rho_{req}=${fixedTex(N.linToDb(sn.rho1), 3)}-(${fixedTex(det.req.db, 3)})=${fixedTex(det.margin_dB, 3)}\\ \\mathrm{dB}` },
        L.type === "monostatic"
          ? { label: "Range at the required SNR", tex: `R_{max}=\\Big[\\frac{P_tG^2\\lambda^2\\sigma\\tau}{(4\\pi)^3kT_sLL_{MF}\\rho_{req}}\\Big]^{1/4}=${tex(L.range.monostaticRmax)}\\ \\mathrm{m}\\ (\\text{now } R=${tex(g.Rt)}\\ \\mathrm{m})`, note: "Frozen parameters: the current gains, RCS and loss." }
          : { label: "Path product at the required SNR", tex: `R_tR_r=\\sqrt{\\frac{P_tG_tG_r\\lambda^2\\sigma_b\\tau}{(4\\pi)^3kT_sLL_{MF}\\rho_{req}}}=${tex(L.range.productAtThreshold)}\\ \\mathrm{m^2}\\ (\\text{now } ${tex(L.range.product)})`, note: "A Cassini oval in each plane through the baseline; not a constant-delay ellipsoid." },
        { label: "Validity", text: validity(scn, L) },
      ] : [{ label: "Validity", text: L.reasons.join("; ") || "No detector result." }],
    });
    const rows7 = [];
    if (sampled && sampled.cell) {
      const c = sampled.cell;
      if (sampled.stale) rows7.push({ label: "Status", text: "Result from previous parameters. Recalculate the dwell for current values." });
      rows7.push(
        { label: "Dwell", text: `Channel ${sampled.rx} with the ${sampled.tx} filter, dwell start ${fixed(sampled.t0, 3)} s, cell lag ${c.lag}, Doppler bin ${c.bin} (${txt(c.binDoppler)} Hz). Range walk over the dwell ${txt(c.walk_m)} m.` },
        { label: "Measured at the map", tex: `\\frac{|s|^2}{\\sigma^2}=${tex(c.thermalSnr)},\\ \\frac{|c|^2}{\\sigma^2}=${tex(c.clutterPower)},\\ \\frac{|i|^2}{\\sigma^2}=${tex(c.interferencePower)},\\ \\hat\\sigma_n^2=${tex(c.noisePower)}` },
        { label: "SINR (approximation)", tex: `\\mathrm{SINR}=\\frac{|s|^2}{\\hat\\sigma_n^2+|c|^2+|i|^2}=${tex(c.sinr)}\\ (${fixedTex(N.linToDb(c.sinr), 2)}\\ \\mathrm{dB})`, note: "A SINR substitution is an approximation, not a calibrated detection probability." },
        { label: "Sampled detection", text: `Statistic ${txt(c.statistic)} against η = ${txt(sampled.eta)}: ${c.detected ? "detected in this realisation" : "not detected in this realisation"}.` },
      );
    } else rows7.push({ label: "Sampled result", text: "No sampled dwell for this link. Select its channel and use Calculate dwell." });
    s.push({ id: "sampled", title: "7. Clutter, interference, coherence and sampled result", rows: rows7 });
    return { ...hdr, sections: s };
  }
  function pdTex(det) {
    if (det.pd > 0.9999 && det.q > 0) return `1-${tex(det.q)}`;
    return tex(det.pd);
  }
  function pdTxt(det) {
    if (!det) return "—";
    if (det.pd > 0.9999 && det.q > 0) return `1 − ${txt(det.q, 2)}`;
    if (det.pd < 1e-4) return txt(det.pd, 2);
    return det.pd.toFixed(4);
  }
  function validity(scn, L) {
    const out = [];
    out.push(`Far-field bounds ${scn.radars.find((r) => r.id === L.tx).antenna.farField_m} m (${L.tx}) and ${scn.radars.find((r) => r.id === L.rx).antenna.farField_m} m (${L.rx}).`);
    if (L.reasons.length) out.push(L.reasons.join("; ") + ".");
    out.push("Thermal-noise detector: no clutter or interference in these probabilities.");
    if (L.rcs?.synthetic) out.push("Synthetic absolute RCS.");
    return out.join(" ");
  }

  /* ===== SNAPSHOT ===== */
  /** The calculation snapshot: every link's summary and calculation at time t, with the model digest. */
  function snapshot(scn, t, extra = {}) {
    const links = M.evaluateAll(scn, t, { check: false });
    return {
      t, digest: extra.digest ?? null, seed: scn.seed,
      links: links.map((L) => ({
        id: L.id, tx: L.tx, rx: L.rx, target: L.target, type: L.type, status: L.status, reasons: L.reasons,
        PrdBm: L.power ? L.power.PrdBm : null, Pr: L.power ? L.power.Pr : null,
        rho1_dB: L.snr ? N.linToDb(L.snr.rho1) : null, margin_dB: L.detector ? L.detector.margin_dB : null,
        pd: L.detector ? L.detector.pd : null, pdText: pdTxt(L.detector),
        tau_us: L.geometry.tauE * 1e6, fD: L.geometry.fD,
        calc: linkCalc(scn, L, extra.sampled?.[L.id]),
      })),
    };
  }

  return { tex, txt, spoken, fixed, fixedTex, spokenFixed, vecTxt, dBm, linkCalc, snapshot, pdTxt };
});
