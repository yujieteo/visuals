/* Radar network visualiser: the one versioned semantic state.
 *
 * The scene, calculations, import and export all use this state. It is plain JSON in SI units. The view
 * (time, selection, camera, layers, panels) is part of it but never enters the model digest, so a camera
 * or panel change cannot change a result. Arrays of objects are addressed by id, never by index.
 */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = node ? factory(require("./numerics.js"), require("./model.js")) : factory(root.RadarNet.numerics, root.RadarNet.model);
  if (node) module.exports = api;
  else (root.RadarNet = root.RadarNet || {}).state = api;
})(typeof self !== "undefined" ? self : this, function (N, M) {
  "use strict";

  const SCHEMA = "radar-network-scenario";
  const SCHEMA_VERSION = 1;
  const VISUAL = "radar-network";

  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const km = (x) => x * 1000;

  /* ===== DEFAULTS ===== */
  function waveformOf(code) {
    if (code === "rectangular") return { waveform: "rect", chirp: "up" };
    if (code === "lfm_down") return { waveform: "lfm", chirp: "down" };
    return { waveform: "lfm", chirp: "up" };
  }
  function makeRadar(row, P) {
    const wf = waveformOf(row.waveform);
    const lambda10 = N.C / 10e9;
    return {
      id: row.id,
      trajectory: { position_m: [km(row.x_km), km(row.y_km), km(row.z_km)], velocity_mps: [row.vx_mps, row.vy_mps, row.vz_mps], waypoints: [] },
      orientation: { yaw_deg: 0, pitch_deg: 0, roll_deg: 0, rates_dps: [0, 0, 0], waypoints: [] },
      tx: { enabled: true, power_W: P.peakPower_W, carrier_Hz: P.carrier_Hz, waveform: wf.waveform, chirp: wf.chirp, pulse_s: P.pulse_s, bandwidth_Hz: P.bandwidth_Hz, prf_Hz: P.prf_Hz, pulses: P.pulses, offset_s: 0 },
      rx: { enabled: true, tempMode: "system", systemTemp_K: P.systemTemp_K, antennaTemp_K: 290, noiseFigure_dB: 3, refTemp_K: 290, sampleRate_Hz: P.sampleRate_Hz, window_s: P.window_s.slice(), noiseBandwidth_Hz: P.noiseBandwidth_Hz, mfLoss_dB: P.mfLoss_dB },
      antenna: { mode: "directional", gainMode: "gain", peakGain_dBi: P.peakGain_dBi, aperture_m2: Number(((N.dbToLin(P.peakGain_dBi) * lambda10 * lambda10) / (4 * Math.PI)).toPrecision(12)), beamwidth_deg: P.beamwidth_deg, floor_dB: P.sidelobeFloor_dB, pointing: { mode: "fixed", az_deg: 0, el_deg: 0 }, farField_m: P.farField_m, pattern: null },
      leakage: { isolation_dB: P.selfIsolation_dB, cancellation_dB: P.selfCancellation_dB },
    };
  }
  function makeTarget(row, P) {
    return {
      id: row.id,
      trajectory: { position_m: [km(row.x_km), km(row.y_km), km(row.z_km)], velocity_mps: [row.vx_mps, row.vy_mps, row.vz_mps], waypoints: [] },
      orientation: { yaw_deg: row.yaw_deg, pitch_deg: 0, roll_deg: 0, rates_dps: [row.yaw_rate_deg_s, 0, 0], waypoints: [] },
      rcs: { mode: "constant", value_m2: P.rcs_m2, overrides: {}, analytic: { a: P.analyticAspect.a, w: P.analyticAspect.w.slice() }, table: null },
    };
  }
  /** Aim a radar's fixed boresight at a point (world az/el from its initial position). */
  function aimAt(radar, point) {
    const d = N.vsub(point, radar.trajectory.position_m);
    const ae = M.azElFromDir(N.vunit(d));
    // Rounded to 1e-9 degrees: trigonometric functions may differ in the last bit between JavaScript engines.
    const r9 = (x) => Math.round(x * 1e9) / 1e9;
    radar.antenna.pointing = { mode: "fixed", az_deg: r9(ae.az), el_deg: r9(ae.el) };
  }
  /** The sparse synthetic patch grid; each phase is fixed, drawn once from the seeded stream of its id. */
  function clutterPatches(cl, seed) {
    const out = [];
    for (const x of cl.grid_km) for (const y of cl.grid_km) {
      const id = `P${x < 0 ? "m" : "p"}${Math.abs(x)}_${y < 0 ? "m" : "p"}${Math.abs(y)}`;
      const phase = Math.round(360 * N.stream(seed, id, "clutter-phase").uniform() * 1e6) / 1e6;
      out.push({ id, position_m: [km(x), km(y), 0], area_m2: cl.area_m2, normal: [0, 0, 1], sigma0_dB: cl.sigma0_dB, phase_deg: phase });
    }
    return out;
  }

  /** The default scenario from the preset data (data/preset.json). */
  function defaultScenario(preset, sources = {}) {
    const P = preset.parameters;
    const radars = preset.radars.map((r) => makeRadar(r, P));
    const targets = preset.targets.map((t) => makeTarget(t, P));
    const t3 = targets.find((t) => t.id === "T3");
    for (const r of radars) {
      const row = preset.radars.find((x) => x.id === r.id);
      if (/tracks T3/.test(row.pointing)) r.antenna.pointing = { mode: "track", target: "T3" };
      else if (t3) aimAt(r, t3.trajectory.position_m);
    }
    const scn = {
      schema: SCHEMA,
      schemaVersion: SCHEMA_VERSION,
      visual: VISUAL,
      modelVersion: M.MODEL_VERSION,
      sources: clone(sources),
      seed: preset.scene.seed,
      scene: { duration_s: preset.scene.duration_s },
      radars,
      targets,
      processing: {
        integration: P.integration, swerling: P.swerling, phase: { mode: "fixed", value_deg: 0 },
        pfa: P.pfa, pdRequired: P.pdRequired, echoLoss_dB: P.echoLoss_dB, window: "hann",
        schedule: "simultaneous", dwellStart_s: null, trials: 1000, mfLossNote: "0 dB",
      },
      environment: {
        clutter: { enabled: preset.clutter.enabled, patches: clutterPatches(preset.clutter, preset.scene.seed), constantGamma: { enabled: false, gamma_dB: -20 } },
        directPath: { enabled: true, cancellation_dB: P.directCancellation_dB, extraLoss_dB: P.directExtraLoss_dB },
        interference: { enabled: false, power_W: 1e-13, bandwidth_Hz: 10e6 },
      },
      network: {
        mode: P.siteCombination, target: "T3", transmitter: "R1", receivers: radars.map((r) => r.id), weights: "equal",
        errors: Object.fromEntries(radars.map((r) => [r.id, { delay_s: 0, clock_s: 0, cfo_Hz: 0, phase_deg: 0, scatter_deg: 0 }])),
      },
      view: defaultView(radars, targets),
    };
    return scn;
  }
  function defaultView(radars, targets) {
    const sel = radars.length && targets.length ? M.linkId(radars[0].id, radars[0].id, (targets.find((t) => t.id === "T3") || targets[0]).id) : null;
    return {
      time_s: 0, paused: true, rate: 1, step_s: 1e-2,
      example: null,
      selectedObject: null, selectedLink: sel, channel: radars.length ? { rx: radars[0].id, tx: radars[0].id } : null,
      isolate: false, follow: false,
      camera: { yaw_deg: -60, pitch_deg: 28, distance_m: 210e3, target_m: [15e3, 5e3, 2e3], projection: "perspective", fov_deg: 50 },
      editPlane: "XY", mode: "rotate",
      layers: { beams: true, paths: true, trails: true, labels: true, clutter: true, surfaces: false, velocity: true },
      surfaceKind: "frozen",
      preset: "geometry",
      expanded: [],
      panels: { advanced: false },
      search: "",
    };
  }

  /* ===== PATHS ===== */
  // "radars.R1.tx.carrier_Hz": a segment after "radars" or "targets" or "patches" is an id.
  const ID_ARRAYS = new Set(["radars", "targets", "patches"]);
  function resolve(obj, path, create) {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (Array.isArray(cur) && ID_ARRAYS.has(parts[i - 1])) { cur = cur.find((x) => x.id === k); }
      else {
        if (cur[k] === undefined && create) cur[k] = {};
        cur = cur[k];
      }
      if (cur === undefined || cur === null) throw new RangeError(`no such path: ${path}`);
    }
    return { parent: cur, key: parts[parts.length - 1] };
  }
  function getPath(obj, path) { const { parent, key } = resolve(obj, path, false); return Array.isArray(parent) ? parent.find((x) => x.id === key) : parent[key]; }
  function setPath(obj, path, value) { const { parent, key } = resolve(obj, path, true); parent[key] = clone(value); return obj; }

  /* ===== EXAMPLES ===== */
  function applyExample(preset, examples, id, sources) {
    const ex = examples.examples.find((e) => e.id === id);
    if (!ex) throw new RangeError(`unknown example ${id}`);
    let scn;
    if (ex.fixture) {
      const base = { ...clone(preset), radars: ex.fixture.radars.map((r) => ({ pointing: "fixed", ...r })), targets: ex.fixture.targets };
      scn = defaultScenario(base, sources);
      // Aim each radar at the first target of the fixture.
      for (const r of scn.radars) aimAt(r, scn.targets[0].trajectory.position_m);
      scn.network = { ...scn.network, target: scn.targets[0].id, transmitter: scn.radars[0].id, receivers: scn.radars.map((r) => r.id) };
    } else scn = defaultScenario(preset, sources);
    for (const [path, value] of ex.set ?? []) setPath(scn, path, value);
    scn.seed = preset.scene.seed;
    scn.view.example = id;
    if (ex.select) {
      scn.view.selectedLink = ex.select;
      const p = M.parseLinkId(ex.select);
      scn.view.channel = ex.channel ?? { rx: p.rx, tx: p.tx };
    }
    return scn;
  }

  /* ===== VALIDATION ===== */
  const finite = (x) => typeof x === "number" && Number.isFinite(x);
  const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(finite);
  /** Input validity. Returns [{ path, message }]; empty means valid. */
  function validate(scn) {
    const e = [];
    const err = (path, message) => e.push({ path, message });
    if (scn.schema !== SCHEMA) err("schema", `expected "${SCHEMA}"`);
    if (scn.schemaVersion !== SCHEMA_VERSION) err("schemaVersion", `expected ${SCHEMA_VERSION}, found ${scn.schemaVersion}`);
    if (!finite(scn.seed) || !Number.isInteger(scn.seed)) err("seed", "the seed must be an integer");
    if (!(finite(scn.scene?.duration_s) && scn.scene.duration_s > 0)) err("scene.duration_s", "duration must be positive");
    const ids = new Set();
    for (const kind of ["radars", "targets"]) {
      if (!Array.isArray(scn[kind])) { err(kind, "must be a list"); continue; }
      for (const o of scn[kind]) {
        const at = `${kind}.${o.id}`;
        if (typeof o.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,15}$/.test(o.id)) err(at, "id must be a short name of letters and digits");
        if (ids.has(o.id)) err(at, "duplicate id");
        ids.add(o.id);
        const tr = o.trajectory;
        if (!tr || !vec3(tr.position_m) || !vec3(tr.velocity_mps)) err(`${at}.trajectory`, "position and velocity must be finite 3-vectors");
        const wps = tr?.waypoints ?? [];
        if (!Array.isArray(wps)) err(`${at}.trajectory.waypoints`, "must be a list");
        else {
          if (wps.length === 1) err(`${at}.trajectory.waypoints`, "use 0 or at least 2 waypoints");
          for (let i = 0; i < wps.length; i++) {
            if (!finite(wps[i].t_s) || !vec3(wps[i].position_m)) err(`${at}.trajectory.waypoints.${i}`, "waypoint needs t_s and position_m");
            if (i > 0 && !(wps[i].t_s > wps[i - 1].t_s)) err(`${at}.trajectory.waypoints.${i}`, "waypoint times must increase strictly");
          }
        }
        const ow = o.orientation?.waypoints ?? [];
        for (let i = 1; i < ow.length; i++) if (!(ow[i].t_s > ow[i - 1].t_s)) err(`${at}.orientation.waypoints.${i}`, "waypoint times must increase strictly");
        for (const k of ["yaw_deg", "pitch_deg", "roll_deg"]) if (!finite(o.orientation?.[k])) err(`${at}.orientation.${k}`, "must be a finite angle");
      }
    }
    for (const r of scn.radars ?? []) {
      const at = `radars.${r.id}`, t = r.tx, x = r.rx, a = r.antenna;
      if (!(t.carrier_Hz > 0)) err(`${at}.tx.carrier_Hz`, "frequency must be positive");
      if (!(t.power_W >= 0)) err(`${at}.tx.power_W`, "power must be nonnegative");
      if (!(t.pulse_s > 0)) err(`${at}.tx.pulse_s`, "pulse duration must be positive");
      if (!(t.prf_Hz > 0)) err(`${at}.tx.prf_Hz`, "PRF must be positive");
      if (!(t.pulse_s * t.prf_Hz < 1)) err(`${at}.tx.pulse_s`, "need τ · PRF < 1");
      if (!(Number.isInteger(t.pulses) && t.pulses >= 1)) err(`${at}.tx.pulses`, "pulse count must be a positive integer");
      if (!["lfm", "rect"].includes(t.waveform)) err(`${at}.tx.waveform`, "lfm or rect");
      if (t.waveform === "lfm" && !(t.bandwidth_Hz > 0)) err(`${at}.tx.bandwidth_Hz`, "LFM bandwidth must be positive");
      if (!finite(t.offset_s)) err(`${at}.tx.offset_s`, "transmit offset must be finite");
      if (!(x.sampleRate_Hz > 0)) err(`${at}.rx.sampleRate_Hz`, "sample rate must be positive");
      const occupied = t.waveform === "lfm" ? t.bandwidth_Hz : 1 / t.pulse_s;
      if (!(x.sampleRate_Hz >= occupied)) err(`${at}.rx.sampleRate_Hz`, `sample rate must cover the occupied baseband spectrum (${occupied / 1e6} MHz complex)`);
      if (x.tempMode === "system" && !(x.systemTemp_K > 0)) err(`${at}.rx.systemTemp_K`, "temperature must be positive");
      if (x.tempMode === "noise-factor" && !(x.antennaTemp_K >= 0 && x.refTemp_K > 0 && finite(x.noiseFigure_dB))) err(`${at}.rx`, "noise-factor entry needs T_a ≥ 0, T_0 > 0 and a finite noise figure");
      if (!(x.noiseBandwidth_Hz > 0)) err(`${at}.rx.noiseBandwidth_Hz`, "noise bandwidth must be positive");
      if (!(x.mfLoss_dB >= 0)) err(`${at}.rx.mfLoss_dB`, "losses must be nonnegative");
      if (!(Array.isArray(x.window_s) && x.window_s[0] >= 0 && x.window_s[1] > x.window_s[0])) err(`${at}.rx.window_s`, "window must be [start, end] with 0 ≤ start < end");
      if (!(a.farField_m > 0)) err(`${at}.antenna.farField_m`, "far-field distance must be positive");
      if (!["directional", "uniform", "imported"].includes(a.mode)) err(`${at}.antenna.mode`, "directional, uniform or imported");
      if (a.gainMode === "aperture" && !(a.aperture_m2 > 0)) err(`${at}.antenna.aperture_m2`, "aperture must be positive");
      if (!finite(a.peakGain_dBi)) err(`${at}.antenna.peakGain_dBi`, "gain must be finite (values below 0 dBi are allowed)");
      if (a.mode === "directional" && !(a.beamwidth_deg > 0 && a.floor_dB >= 0)) err(`${at}.antenna`, "beamwidth must be positive and the floor nonnegative");
      if (a.mode === "imported") for (const p of validateTable(a.pattern, "pattern")) err(`${at}.antenna.pattern`, p);
      if (a.pointing?.mode === "track" && !scn.targets.some((tg) => tg.id === a.pointing.target)) err(`${at}.antenna.pointing.target`, "tracked target does not exist");
      if (!(r.leakage.isolation_dB >= 0 && r.leakage.cancellation_dB >= 0)) err(`${at}.leakage`, "isolation and cancellation must be nonnegative");
    }
    for (const tg of scn.targets ?? []) {
      const r = tg.rcs, at = `targets.${tg.id}.rcs`;
      if (!(r.value_m2 >= 0)) err(`${at}.value_m2`, "RCS must be nonnegative");
      for (const [k, v] of Object.entries(r.overrides ?? {})) if (!(v >= 0)) err(`${at}.overrides.${k}`, "RCS must be nonnegative");
      const { a, w } = r.analytic;
      if (!(a > 0 && a <= 1)) err(`${at}.analytic.a`, "need 0 < a ≤ 1");
      if (!(Array.isArray(w) && w.length === 3 && w.every((x) => x >= 0 && x <= 1) && Math.max(...w) === 1)) err(`${at}.analytic.w`, "need 0 ≤ w_d ≤ 1 and max(w_d) = 1");
      if (r.mode === "table") for (const p of validateTable(r.table, "rcs")) err(`${at}.table`, p);
    }
    const p = scn.processing;
    if (!(p.pfa > 0 && p.pfa < p.pdRequired && p.pdRequired < 1)) err("processing.pfa", "need 0 < Pfa < Pd < 1");
    if (!["coherent", "noncoherent"].includes(p.integration)) err("processing.integration", "coherent or noncoherent");
    if (![0, 1, 2, 3, 4].includes(p.swerling)) err("processing.swerling", "Swerling case 0 to 4");
    if (!(p.echoLoss_dB >= 0)) err("processing.echoLoss_dB", "losses must be nonnegative");
    if (!["fixed", "per-dwell", "per-pulse"].includes(p.phase.mode)) err("processing.phase.mode", "fixed, per-dwell or per-pulse");
    if (!(Number.isInteger(p.trials) && p.trials >= 1 && p.trials <= 100000)) err("processing.trials", "1 to 100000 trials");
    const env = scn.environment;
    if (!(env.directPath.cancellation_dB >= 0 && env.directPath.extraLoss_dB >= 0)) err("environment.directPath", "cancellation and loss must be nonnegative");
    if (env.interference.enabled && !(env.interference.power_W >= 0 && env.interference.bandwidth_Hz > 0)) err("environment.interference", "power ≥ 0 and bandwidth > 0");
    for (const pt of env.clutter.patches) if (!(pt.area_m2 >= 0 && finite(pt.sigma0_dB) && vec3(pt.position_m) && vec3(pt.normal))) err(`environment.clutter.patches.${pt.id}`, "patch needs area ≥ 0, finite reflectivity, position and normal");
    if (!["separate", "ideal", "error"].includes(scn.network.mode)) err("network.mode", "separate, ideal or error");
    return e;
  }
  /** Imported RCS table or antenna pattern: schema, units, domain and finite values. */
  function validateTable(tab, kind) {
    const out = [];
    if (!tab || typeof tab !== "object") return ["missing table"];
    if (!(tab.frequency_Hz > 0)) out.push("frequency_Hz must be positive");
    if (!tab.provenance || typeof tab.provenance.source !== "string") out.push("provenance.source is required");
    const az = tab.az_deg, other = kind === "rcs" && tab.geometry === "bistatic" ? tab.beta_deg : tab.el_deg;
    const values = kind === "rcs" ? tab.values_m2 : tab.gain_dBi;
    if (kind === "rcs" && !["monostatic", "bistatic"].includes(tab.geometry)) out.push("geometry must be monostatic or bistatic");
    if (kind === "rcs" && tab.units !== "m2") out.push('units must be "m2" (absolute RCS)');
    if (kind === "pattern" && tab.units !== "dBi") out.push('units must be "dBi"');
    if (kind === "pattern" && !tab.interpolation) out.push("interpolation rule is required");
    const axisOk = (ax) => Array.isArray(ax) && ax.length >= 2 && ax.every(finite) && ax.every((v, i) => i === 0 || v > ax[i - 1]);
    if (!axisOk(az)) out.push("azimuth axis must be ≥ 2 increasing finite values");
    if (!axisOk(other)) out.push("second axis must be ≥ 2 increasing finite values");
    if (!Array.isArray(values) || values.length !== (other?.length ?? -1) || values.some((row) => !Array.isArray(row) || row.length !== (az?.length ?? -1))) out.push("values must be a [second axis][azimuth] grid");
    else for (const row of values) for (const v of row) if (v !== null && !(finite(v) && (kind !== "rcs" || v >= 0))) out.push("values must be finite (RCS nonnegative) or null for missing");
    return [...new Set(out)];
  }

  /* ===== DIGEST ===== */
  /** Canonical JSON: keys sorted, numbers as written by JSON.stringify. */
  function canonical(x) {
    if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
    if (x && typeof x === "object") return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}`;
    return JSON.stringify(x);
  }
  const hex = (words) => words.map((w) => w.toString(16).padStart(8, "0")).join("");
  /** Digest of the semantic model inputs: everything except the view. */
  function modelDigest(scn) {
    const { view, ...model } = scn;
    void view;
    return hex(N.cyrb128(canonical(model)));
  }
  /** Digest of the inputs a sampled dwell uses: the model plus dwell time and channel. */
  function dwellDigest(scn, dwell) { return hex(N.cyrb128(canonical({ model: modelDigest(scn), dwell }))); }

  /* ===== JSON EXPORT / IMPORT ===== */
  const UNITS = { position: "m", velocity: "m/s", angles: "deg", frequency: "Hz", power: "W", time: "s", gain: "dBi", loss: "dB", temperature: "K", rcs: "m^2" };
  /** The exported document: semantic state, units, sources and, optionally, result snapshots. */
  function exportDocument(scn, snapshots = []) {
    return { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, visual: VISUAL, modelVersion: scn.modelVersion, units: UNITS, digest: modelDigest(scn), state: clone(scn), results: snapshots.map(clone) };
  }
  function exportJson(scn, snapshots) { return JSON.stringify(exportDocument(scn, snapshots), null, 1) + "\n"; }
  /** Parse and check an imported document. Never returns a partly valid state: { ok, state, results, errors }. */
  function importJson(text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { return { ok: false, errors: [{ path: "", message: `not JSON: ${e.message}` }] }; }
    if (!doc || doc.schema !== SCHEMA) return { ok: false, errors: [{ path: "schema", message: `not a ${SCHEMA} document` }] };
    if (doc.schemaVersion !== SCHEMA_VERSION) return { ok: false, errors: [{ path: "schemaVersion", message: `version ${doc.schemaVersion} is not supported (expected ${SCHEMA_VERSION})` }] };
    const st = doc.state;
    if (!st || typeof st !== "object") return { ok: false, errors: [{ path: "state", message: "missing state" }] };
    let errors;
    try { errors = validate(st); } catch (e) { errors = [{ path: "state", message: `malformed state: ${e.message}` }]; }
    if (!errors.length && st.modelVersion !== M.MODEL_VERSION) errors.push({ path: "modelVersion", message: `model ${st.modelVersion} differs from this page's ${M.MODEL_VERSION}` });
    if (errors.length) return { ok: false, errors };
    const digest = modelDigest(st);
    const results = [];
    for (const r of doc.results ?? []) {
      if (!r || r.modelDigest !== digest) results.push({ ...r, compatible: false, note: "result snapshot from other parameters: shown as stale" });
      else results.push({ ...r, compatible: true });
    }
    return { ok: true, state: st, results, errors: [] };
  }

  /* ===== HISTORY ===== */
  /** Undo and redo over model states (the view is kept out, so camera moves are not history). */
  function createHistory(limit = 200) {
    const past = [], future = [];
    return {
      push(label, before) { past.push({ label, state: clone(before) }); if (past.length > limit) past.shift(); future.length = 0; },
      undo(current) { const h = past.pop(); if (!h) return null; future.push({ label: h.label, state: clone(current) }); return h; },
      redo(current) { const h = future.pop(); if (!h) return null; past.push({ label: h.label, state: clone(current) }); return h; },
      sizes: () => ({ undo: past.length, redo: future.length }),
      peek: () => ({ undo: past.at(-1)?.label ?? null, redo: future.at(-1)?.label ?? null }),
    };
  }

  return {
    SCHEMA, SCHEMA_VERSION, VISUAL, UNITS,
    clone, defaultScenario, defaultView, applyExample, aimAt,
    getPath, setPath,
    validate, validateTable,
    canonical, modelDigest, dwellDigest,
    exportDocument, exportJson, importJson,
    createHistory,
  };
});
