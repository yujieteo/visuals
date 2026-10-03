/* Radar network visualiser: the beamdswitch report.
 *
 * Builds the report object for the site's unchanged template (Beamdswitch.deck) from the calculation
 * snapshot, the reference checks and the invariants, in the standard order: Set-up, Method, Results, Checks
 * and takeaway. Every number comes formatted from calc.js, so the deck says what the page shows. No timestamp:
 * identical state gives an identical deck. Narration is plain spoken prose; equations stay in frame bodies.
 */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = node ? factory(require("./numerics.js"), require("./model.js"), require("./calc.js")) : factory(root.RadarNet.numerics, root.RadarNet.model, root.RadarNet.calc);
  if (node) module.exports = api;
  else (root.RadarNet = root.RadarNet || {}).report = api;
})(typeof self !== "undefined" ? self : this, function (N, M, C) {
  "use strict";

  const SCENARIO_DATE = "2026-10-03";
  const { tex, txt, spoken, spokenFixed, fixed } = C;
  const km = (m) => fixed(m / 1000, 3);
  const spokenKm = (m) => `${spokenFixed(m / 1000, 3)} kilometres`;
  const say = (s) => String(s).replace(/[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻%&≈]/g, " ").replace(/−/g, "minus ").replace(/\s+/g, " ").trim();
  const statusWords = { ok: "valid", inactive: "inactive", incompatible: "incompatible", "outside-model": "outside the model", invalid: "invalid" };

  function pdSpoken(l) {
    if (l.pd === null) return "not calculated";
    if (l.pd > 0.9999) return "greater than 0.9999";
    if (l.pd < 1e-4) return `less than 0.0001`;
    return l.pd.toFixed(4);
  }

  /** Link frame: the manual calculation in key equations, and the result spoken. */
  function linkFrame(scn, l) {
    const calc = l.calc, sec = Object.fromEntries(calc.sections.map((s) => [s.id, s]));
    const title = `${l.id}: ${l.type}, ${l.status === "ok" ? `margin ${fixed(l.margin_dB, 2)} dB` : statusWords[l.status]}`;
    if (l.status !== "ok" || l.PrdBm === null) {
      return {
        title,
        body: `- Status: ${statusWords[l.status]}\n- Reasons: ${l.reasons.join("; ") || "none"}\n- Echo delay ${txt(l.tau_us)} μs, Doppler ${txt(l.fD)} Hz`,
        notes: "The link keeps its row. Its result is not replaced by zero.",
        narration: say(`Link ${l.id} is ${statusWords[l.status]}. ${l.reasons.length ? "The reason is: " + l.reasons.join(". ") + "." : ""}`),
      };
    }
    const pick = (id, label) => sec[id].rows.find((r) => r.label === label);
    const lines = [
      `$$${pick("power", "Substitution").tex}$$`,
      `$$${pick("power", "Result").tex}$$`,
      `$$${pick("snr", "Matched-filter SNR").tex}$$`,
      `$$${pick("margin", "Margin").tex}$$`,
    ];
    return {
      title,
      body: lines.join("\n\n") + `\n\n- Delay ${txt(l.tau_us)} μs, Doppler ${txt(l.fD)} Hz, predicted P_d ${l.pdText}`,
      notes: sec.objects.rows.concat(sec.geometry.rows, sec.conversions.rows).map((r) => `${r.label}: ${r.text ?? "$" + r.tex + "$"}`).join("\n\n"),
      narration: say(`Link ${l.id.replace(">", " to ").replace(":", " on target ")}. Received power is ${spokenFixed(l.PrdBm, 2)} decibels relative to one milliwatt. The single pulse signal to noise ratio is ${spokenFixed(l.rho1_dB, 2)} decibels. The margin to the required value is ${spokenFixed(l.margin_dB, 2)} decibels. The predicted probability of detection is ${pdSpoken(l)}.`),
    };
  }

  /**
   * The report object. ctx: { snapshot, references, invariants, detectorChecks, sampled (optional dwell
   * summary), camera, evidence, sources, example }.
   */
  function report(scn, ctx) {
    const snap = ctx.snapshot, t = snap.t;
    const radars = scn.radars.map((r) => {
      const k = M.kinematics(r, t);
      return `| ${r.id} | ${km(k.p[0])} | ${km(k.p[1])} | ${fixed(k.p[2], 1)} | ${C.vecTxt(k.v, 1, 4)} | ${r.tx.waveform === "lfm" ? "LFM " + r.tx.chirp : "rectangular"} | ${txt(r.tx.carrier_Hz / 1e9)} GHz | ${r.antenna.pointing.mode === "track" ? "tracks " + r.antenna.pointing.target : r.antenna.pointing.mode} |`;
    });
    const targets = scn.targets.map((tg) => {
      const k = M.kinematics(tg, t), a = M.attitude(tg, t);
      return `| ${tg.id} | ${km(k.p[0])} | ${km(k.p[1])} | ${fixed(k.p[2], 1)} | ${C.vecTxt(k.v, 1, 4)} | ${fixed(a.yaw, 2)} | ${tg.rcs.mode} |`;
    });
    const r0 = scn.radars[0], P = scn.processing;
    const setup = [
      {
        title: `Scene at t = ${fixed(t, 3)} s: ${scn.radars.length} radars, ${scn.targets.length} targets, ${snap.links.length} links`,
        body: `Purpose: explain the radar range equation in a moving network, with every calculation exposed.\n\n| Radar | x (km) | y (km) | z (m) | v (m/s) | Waveform | Carrier | Antenna |\n|---|---|---|---|---|---|---|---|\n${radars.join("\n")}`,
        notes: `Right-handed frame: x east, y north, z up, ground plane z = 0. Camera: ${ctx.camera ?? "default view"} (presentation only). Example: ${scn.view.example ?? "initial preset"}.`,
        narration: say(`This report covers ${scn.radars.length} radars and ${scn.targets.length} targets at a scene time of ${spokenFixed(t, 3)} seconds. Each combination of transmitter, receiver and target is one link, so there are ${snap.links.length} links. Positions are in kilometres, altitudes in metres and velocities in metres per second.`),
      },
      {
        title: "Targets and synthetic absolute RCS",
        body: `| Target | x (km) | y (km) | z (m) | v (m/s) | Yaw (°) | RCS mode |\n|---|---|---|---|---|---|---|\n${targets.join("\n")}`,
        notes: "Constant RCS is a synthetic absolute value. The analytic aspect mode is a synthetic sensitivity model, not an electromagnetic scattering solution.",
        narration: say(`The targets use synthetic absolute radar cross sections. The default value is 1 square metre for every target and link.`),
      },
      {
        title: "Radar parameters (synthetic values)",
        body: `- Peak power ${txt(r0.tx.power_W)} W, peak gain ${r0.antenna.peakGain_dBi} dBi, beamwidth ${r0.antenna.beamwidth_deg}°, floor ${r0.antenna.floor_dB} dB\n- Pulse ${txt(r0.tx.pulse_s * 1e6)} μs, LFM bandwidth ${txt(r0.tx.bandwidth_Hz / 1e6)} MHz, PRF ${txt(r0.tx.prf_Hz)} Hz, ${r0.tx.pulses} pulses\n- T_s ${txt(r0.rx.systemTemp_K)} K, F_s ${txt(r0.rx.sampleRate_Hz / 1e6)} MHz, echo loss ${P.echoLoss_dB} dB\n- P_fa ${txt(P.pfa)} per cell, required P_d ${P.pdRequired}, ${P.integration} integration, Swerling ${P.swerling}`,
        notes: "Only the carrier choices (4, 10 and 17 GHz) come from the supplied evidence. All other values are synthetic.",
        narration: say(`Each radar transmits ${spoken(r0.tx.power_W)} watts peak power with a peak gain of ${r0.antenna.peakGain_dBi} decibels relative to isotropic. The pulse lasts ${spoken(r0.tx.pulse_s * 1e6)} microseconds and the dwell has ${r0.tx.pulses} pulses. The system noise temperature is ${spoken(r0.rx.systemTemp_K)} kelvin.`),
      },
      {
        title: `Seed ${scn.seed} and sources`,
        body: `- Seed ${scn.seed}; streams from the seed, object IDs, dwell start and process name\n- Model ${scn.modelVersion}; scenario schema ${scn.schemaVersion}; model digest ${snap.digest}\n- Sources: ${Object.entries(ctx.sources ?? {}).map(([k, v]) => `${k} ${v}`).join("; ") || "see the page"}`,
        notes: "Conventions follow the MathWorks radar equation documentation. Published MathWorks values are references, not evidence that MATLAB ran for this report.",
        narration: say(`The random seed is ${scn.seed}. A repeated dwell with the same inputs gives the same result.`),
      },
    ];
    const method = [
      {
        title: "Bistatic radar equation, linear units inside products",
        body: "$$P_r=\\frac{P_tG_tG_r\\lambda^2\\sigma_b}{(4\\pi)^3R_t^2R_r^2L},\\qquad \\lambda=\\frac{c}{f},\\qquad G=10^{G_{dB}/10}$$\n\n$$P_r\\big|_{mono}=\\frac{P_tG^2\\lambda^2\\sigma}{(4\\pi)^3R^4L}$$",
        notes: "The 6 dB echo loss excludes geometric spreading, which is in the equation.",
        narration: say("Received power follows the bistatic radar equation. Gains and losses convert from decibels to linear values before the products. For a monostatic link the equation reduces to the inverse fourth power of range."),
      },
      {
        title: "Delay and Doppler from state and time",
        body: "$$\\tau_e=\\frac{R_t+R_r}{c},\\quad \\tau_x=\\frac{R_t+R_r-D}{c},\\quad f_D=-\\frac{\\dot R_t+\\dot R_r}{\\lambda}$$",
        notes: "Positive Doppler means approach. The range axis is the equivalent range (R_t + R_r)/2.",
        narration: say("Echo delay is the path sum divided by the speed of light. Doppler is minus the rate of the path sum divided by the wavelength, so a positive value means approach."),
      },
      {
        title: "Matched-filter SNR, integration and the thermal detector",
        body: "$$\\rho_1=\\frac{P_r\\tau}{kT_sL_{MF}},\\quad \\rho_N=N\\rho_1,\\quad \\eta=-\\ln P_{fa},\\quad P_d=1-F_{\\chi'^2_2(2\\rho_N)}(2\\eta)$$",
        notes: `Detector: square law after ideal coherent integration; noncoherent uses Q(N, η) = P_fa. Swerling ${P.swerling}; phase model ${P.phase.mode}. Required SNR is solved numerically and is not the threshold η.`,
        narration: say("The single pulse signal to noise ratio already includes the matched filter gain. Ideal coherent integration of N aligned pulses multiplies it by N. The threshold comes from the false alarm probability per cell. The required signal to noise ratio is a separate number that gives the required probability of detection."),
      },
      {
        title: "Assumptions and limits of the model",
        body: "- Synthetic absolute RCS, gains and losses\n- Simplified sidelobe floor in the synthetic antenna pattern\n- Thermal noise only in the analytic probabilities\n- Dwell approximation: frozen gains and attenuation, linear path-length model for delay and phase\n- Sparse synthetic clutter patches; assumed cancellation factors",
        notes: "The NASA F-117 model curves stay in a separate evidence panel: magnitude in dB with the reference not stated, never converted to dBsm or square metres.",
        narration: say("Every absolute value is synthetic. The analytic probabilities assume thermal noise only. The model holds gains and attenuation constant within a dwell."),
      },
    ];
    const results = snap.links.map((l) => linkFrame(scn, l));
    if (ctx.sampled && ctx.sampled.cells) {
      const s = ctx.sampled;
      results.push({
        title: `Sampled dwell: ${s.rx} with the ${s.tx} filter at t = ${fixed(s.t0, 3)} s${s.stale ? " (previous parameters)" : ""}`,
        body: `- Map: ${s.pulses} pulses × ${s.Nw} samples, ${s.window}; noise measured ${txt(s.noise)} (expected 1)\n- Cells above η = ${txt(s.eta)}: ${s.detections} of ${s.cellsTotal}\n` + s.cells.map((c) => `- ${c.id}: signal ${txt(c.snr)}, clutter ${txt(c.clutter)}, interference ${txt(c.interference)}, SINR ${txt(c.sinr)} (approximation), ${c.detected ? "detected" : "not detected"}`).join("\n"),
        notes: `${s.stale ? "These results come from a previous parameter snapshot, digest " + s.digest + ". They are not current. " : ""}Processing settings: unit-energy matched filter, slow-time DFT, seed ${scn.seed}. Display downsampling does not change the processing.`,
        narration: say(`The sampled dwell for receiver ${s.rx} with the filter of ${s.tx} found ${s.detections} cells above the threshold. ${s.stale ? "These results come from previous parameters." : ""} A sampled detection is one realised outcome, not a probability.`),
      });
    }
    const refRows = ctx.references.map((r) => `| ${r.title} | ${txt(r.published, 6)} ${r.units} | ${txt(r.computed, 8)} ${r.units} | ${txt(r.tolerance)} | ${r.status} |`);
    const inv = ctx.invariants;
    const passInv = inv.filter((i) => i.pass).length;
    const best = snap.links.filter((l) => l.status === "ok").sort((a, b) => b.margin_dB - a.margin_dB)[0];
    const checks = [
      {
        title: `Published MathWorks cases: ${ctx.references.filter((r) => r.pass).length} of ${ctx.references.length} within tolerance`,
        body: `| Case | Published | This model | Tolerance | Status |\n|---|---|---|---|---|\n${refRows.join("\n")}`,
        notes: "Published reference values only. MATLAB was not executed for this report. Detector fixtures from MATLAB are unverified.",
        narration: say(`The model reproduces ${ctx.references.filter((r) => r.pass).length} of ${ctx.references.length} published MathWorks reference values within their tolerances. MATLAB itself did not run for this report.`),
      },
      {
        title: `Domain invariants: ${passInv} of ${inv.length} hold`,
        body: inv.map((i) => `- ${i.status === "pass" ? "Pass" : "FAIL"}: ${i.statement}`).join("\n"),
        notes: inv.map((i) => `${i.id}: ${i.detail}`).join("\n\n"),
        narration: say(`${passInv} of ${inv.length} domain invariants hold. For example, twice the range gives one sixteenth of the received power.`),
      },
      {
        title: "Validity limits",
        body: `- Far-field bound ${r0.antenna.farField_m} m (synthetic); shorter paths are outside the model\n- Detector probabilities: thermal noise only; clutter and interference need sampled estimates\n- ${(ctx.detectorChecks ?? []).filter((c) => c.pass).length} of ${(ctx.detectorChecks ?? []).length} detector checks pass against closed forms; MATLAB detector fixtures unverified`,
        notes: "1,000 Monte Carlo trials cannot validate a false alarm probability of 1e-6. Wilson 95% intervals show what the trials support.",
        narration: say("The detector probabilities hold for thermal noise only. Paths shorter than the far field bound are outside the model."),
      },
      {
        title: "Takeaway",
        body: best ? `Best margin now: ${best.id}, ${fixed(best.margin_dB, 2)} dB.` : "No valid link at this time.",
        key: best ? `Power falls as $1/(R_t^2R_r^2)$: equal delay does not mean equal power, and twice the monostatic range costs a factor of 16 (12.04 dB). At t = ${fixed(t, 3)} s the best margin is ${fixed(best.margin_dB, 2)} dB on ${best.id}.` : "No valid link at this time.",
        narration: say(best ? `Received power falls with the product of the squared path lengths. At this time the best margin is ${spokenFixed(best.margin_dB, 2)} decibels on link ${best.id.replace(">", " to ").replace(":", " on target ")}.` : "No link is valid at this time."),
      },
    ];
    return {
      meta: { title: "Radar network: range equation in a moving scene", subtitle: `${scn.view.example ? "Example " + scn.view.example + ", " : ""}${snap.links.length} links at t = ${fixed(t, 3)} s`, date: SCENARIO_DATE, voice: "bf_emma" },
      narration: say(`This report explains the radar range equation for a network of moving radars and targets. Powers are in watts or decibels relative to one milliwatt, distances in metres or kilometres, and times in seconds.`),
      notes: "Generated by the radar network visualiser from its calculation snapshot. Full-precision values are in radar-network-scenario.json.",
      setup, method, results, checks,
    };
  }

  return { SCENARIO_DATE, report, say };
});
