/* Radar network visualiser: the page application.
 *
 * input -> parse -> normalise -> state -> derive -> render. One semantic state (RadarNet.state) holds the model
 * and the view; derive() evaluates the 36 analytic links at the scene time; render functions read the state and
 * the derived links and never change the model. Sampled processing runs only from "Calculate dwell", in a local
 * worker when the browser allows one. Views of the tab strip live in views.js.
 */
(function () {
  "use strict";
  const RN = window.RadarNet;
  const { numerics: N, model: M, state: S, signal: G, calc: CA, report: RP, checks: CK, scene3d: V, ui: U } = RN;
  const { $, $$, h, esc } = U;

  /* ===== DATA ===== */
  const DATA = JSON.parse($("#radar-data").textContent);
  const SOURCES = DATA.sources;

  /* ===== STATE ===== */
  const app = {
    scn: null, links: [], linkMap: new Map(), history: S.createHistory(),
    sampled: null, sampledAll: new Map(), combo: null, mc: null, scan: null, activeSurface: null,
    job: null, worker: null, workerFailed: false, playing: false, lastFrame: 0, lastCalcRefresh: 0,
    perf: { analyticMs: [], dwellMs: null }, tab: "time", digest: null,
  };
  RN.app = app;
  const scn = () => app.scn;
  const view = () => app.scn.view;

  function baseScenario(exampleId) {
    return exampleId ? S.applyExample(DATA.preset, DATA.examples, exampleId, SOURCES) : S.defaultScenario(DATA.preset, SOURCES);
  }

  /* ===== DERIVE ===== */
  function derive() {
    const t0 = performance.now();
    app.links = M.evaluateAll(scn(), view().time_s);
    app.linkMap = new Map(app.links.map((l) => [l.id, l]));
    const ms = performance.now() - t0;
    app.perf.analyticMs.push(ms);
    if (app.perf.analyticMs.length > 50) app.perf.analyticMs.shift();
    app.digest = S.modelDigest(scn());
  }
  const selectedLink = () => app.linkMap.get(view().selectedLink) || null;

  /* ===== NOTICES ===== */
  let noticeTimer = 0;
  function notice(text, kind = "") {
    const el = $("#notice");
    el.textContent = text;
    el.className = `notice ${kind}`;
    clearTimeout(noticeTimer);
    if (text) noticeTimer = setTimeout(() => { el.textContent = ""; }, 8000);
  }

  /* ===== EDITS AND HISTORY ===== */
  /** Apply a model edit: pause, record the state and its time, validate, recalculate. A failed check keeps the old state. */
  function edit(label, mutate, { pause = true } = {}) {
    if (pause) setPlaying(false);
    const before = S.clone(scn());
    try { mutate(scn()); } catch (e) { app.scn = before; notice(`Not applied: ${e.message}`, "err"); return false; }
    const errors = S.validate(scn());
    if (errors.length) {
      app.scn = before;
      notice(`Not applied: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`, "err");
      renderControls();
      return false;
    }
    app.history.push(`${label} (t = ${CA.fixed(before.view.time_s, 3)} s)`, before);
    modelChanged();
    return true;
  }
  function modelChanged() {
    app.scan = null; app.activeSurface = null; app.mc = null;
    derive();
    markStale();
    renderAll(true);
  }
  function markStale() {
    const d = app.digest;
    if (app.sampled) app.sampled.stale = app.sampled.digest !== d;
    for (const r of app.sampledAll.values()) r.stale = r.digest !== d;
    if (app.combo) app.combo.stale = app.combo.digest !== d;
  }
  function undo() {
    const hst = app.history.undo(scn());
    if (!hst) return notice("Nothing to undo.");
    const cam = view().camera;
    app.scn = hst.state; app.scn.view.camera = cam;
    notice(`Undone: ${hst.label}`);
    syncTimeInputs(); modelChanged();
  }
  function redo() {
    const hst = app.history.redo(scn());
    if (!hst) return notice("Nothing to redo.");
    const cam = view().camera;
    app.scn = hst.state; app.scn.view.camera = cam;
    notice(`Redone: ${hst.label}`);
    syncTimeInputs(); modelChanged();
  }

  /* ===== TIME ===== */
  function setTime(t, { push = false } = {}) {
    const T = scn().scene.duration_s;
    view().time_s = Math.max(0, Math.min(T, Math.round(t * 1e6) / 1e6));
    syncTimeInputs();
    derive();
    renderDynamic();
    if (push) writeHash(true); else writeHash(false);
  }
  function syncTimeInputs() {
    const T = scn().scene.duration_s, t = view().time_s;
    for (const id of ["#time-slider", "#time-num"]) { const el = $(id); el.max = T; if (document.activeElement !== el) el.value = String(t); }
  }
  function setPlaying(on) {
    app.playing = on;
    view().paused = !on;
    $("#play").setAttribute("aria-pressed", String(on));
    $("#play").textContent = on ? "Pause" : "Play";
    if (on) {
      if (view().time_s >= scn().scene.duration_s) setTime(0);
      app.lastFrame = performance.now();
      requestAnimationFrame(tick);
    } else renderCalcs();
  }
  function tick(now) {
    if (!app.playing) return;
    const dt = Math.min(0.25, (now - app.lastFrame) / 1000) * view().rate;
    app.lastFrame = now;
    let t = view().time_s + dt;
    if (t >= scn().scene.duration_s) { t = scn().scene.duration_s; setTime(t); setPlaying(false); return; }
    setTime(t);
    if (now - app.lastCalcRefresh > 1000) { app.lastCalcRefresh = now; renderCalcs(); }
    requestAnimationFrame(tick);
  }
  const dwellDuration = () => { const l = selectedLink(); const r = scn().radars.find((x) => x.id === (l ? l.tx : scn().radars[0]?.id)); return r ? r.tx.pulses / r.tx.prf_Hz : 0.064; };

  /* ===== URL STATE ===== */
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    return { ex: p.get("ex"), link: p.get("link"), t: p.has("t") ? Number(p.get("t")) : null, tab: p.get("tab") };
  }
  let lastHash = "";
  function writeHash(push) {
    const p = new URLSearchParams();
    if (view().example) p.set("ex", view().example);
    if (view().selectedLink) p.set("link", view().selectedLink);
    if (view().time_s) p.set("t", String(view().time_s));
    if (app.tab !== "time") p.set("tab", app.tab);
    const hash = `#${p.toString()}`;
    if (hash === lastHash) return;
    lastHash = hash;
    try {
      if (push) history.pushState(null, "", hash);
      else history.replaceState(null, "", hash);
    } catch (e) { /* file:// or sandboxed frame: keep the state in memory */ }
  }
  function applyHash() {
    const q = readHash(), notes = [];
    const exIds = DATA.examples.examples.map((e) => e.id);
    const ex = q.ex && exIds.includes(q.ex) ? q.ex : null;
    if (q.ex && !ex) notes.push(`Example "${q.ex}" is not in this page: the initial scene is shown.`);
    if (!app.scn || view().example !== ex) { app.scn = baseScenario(ex); app.history = S.createHistory(); app.sampled = null; app.sampledAll.clear(); app.combo = null; }
    if (q.link) { if (M.parseLinkId(q.link) && M.linkIds(scn()).includes(q.link)) { view().selectedLink = q.link; const p = M.parseLinkId(q.link); view().channel = { rx: p.rx, tx: p.tx }; } else notes.push(`Link "${q.link}" is not in this scene.`); }
    if (q.t !== null && Number.isFinite(q.t)) view().time_s = Math.max(0, Math.min(scn().scene.duration_s, q.t));
    if (q.tab && TABS.includes(q.tab)) app.tab = q.tab;
    return notes;
  }

  /* ===== TABLE ===== */
  const statusText = { ok: "valid", inactive: "inactive", incompatible: "incompatible", "outside-model": "outside the model", invalid: "invalid" };
  let tableIds = "";
  function buildTable() {
    const body = $("#link-body");
    body.textContent = "";
    for (const id of M.linkIds(scn())) {
      const p = M.parseLinkId(id);
      const tr = h("tr", { class: "link-row", dataset: { link: id }, id: `row-${cssId(id)}` },
        h("td", {}, h("button", { class: "linkbtn", type: "button", "aria-expanded": "false", "aria-controls": `calc-${cssId(id)}`, dataset: { toggle: id }, title: "Open or close the calculation" }, id)),
        h("td", { dataset: { c: "type" } }, p.tx === p.rx ? "● mono" : "◆ bistatic"),
        ...["pr", "rho", "margin", "pd", "delay", "doppler"].map((c) => h("td", { class: "num", dataset: { c } })),
        h("td", { dataset: { c: "status" } }));
      body.append(tr);
    }
    tableIds = M.linkIds(scn()).join(",");
  }
  const cssId = (id) => id.replace(/[^A-Za-z0-9_-]/g, "_");
  function updateTable() {
    if (M.linkIds(scn()).join(",") !== tableIds) buildTable();
    const sel = view().selectedLink, obj = view().selectedObject;
    const q = ($("#calc-search").value || "").trim().toLowerCase();
    for (const tr of $$("#link-body tr.link-row")) {
      const L = app.linkMap.get(tr.dataset.link);
      if (!L) continue;
      const set = (c, v) => { const td = tr.querySelector(`[data-c="${c}"]`); if (td.textContent !== v) td.textContent = v; };
      set("pr", L.power ? CA.fixed(L.power.PrdBm, 2) : "—");
      set("rho", L.snr ? CA.fixed(N.linToDb(L.snr.rho1), 2) : "—");
      set("margin", L.detector ? `${L.detector.margin_dB >= 0 ? "▲ +" : "▼ "}${CA.fixed(L.detector.margin_dB, 2)}` : "—");
      set("pd", L.detector ? CA.pdTxt(L.detector) : "—");
      set("delay", CA.txt(L.geometry.tauE * 1e6, 5));
      set("doppler", CA.fixed(L.geometry.fD, 1));
      set("status", L.status === "ok" ? (L.reasons.length ? `valid; ${L.reasons.join("; ")}` : "valid") : `${statusText[L.status]}: ${L.reasons.join("; ")}`);
      tr.classList.toggle("selected-row", tr.dataset.link === sel);
      const involved = !obj || [L.tx, L.rx, L.target].includes(obj);
      tr.classList.toggle("dim", view().isolate && !involved);
      const text = `${L.id} ${L.type} ${statusText[L.status]} ${L.reasons.join(" ")}`.toLowerCase();
      const calcText = (tr.nextElementSibling && tr.nextElementSibling.classList.contains("calc-row") ? tr.nextElementSibling.textContent : "").toLowerCase();
      const hide = q && !text.includes(q) && !calcText.includes(q);
      tr.hidden = !!hide;
      if (tr.nextElementSibling?.classList.contains("calc-row")) tr.nextElementSibling.hidden = !!hide;
    }
  }

  /* ===== CALCULATION PANELS ===== */
  function sampledFor(id) {
    const p = M.parseLinkId(id);
    const r = app.sampledAll.get(`${p.rx}>${p.tx}`) || (app.sampled && app.sampled.rx === p.rx && app.sampled.tx === p.tx ? app.sampled : null);
    if (!r || !r.result || !r.result.cells) return null;
    const cell = r.result.cells.find((c) => c.id === id);
    return cell ? { cell, stale: r.stale, eta: r.result.eta, rx: r.rx, tx: r.tx, t0: r.t0 } : null;
  }
  function calcElement(id) {
    const L = app.linkMap.get(id);
    const c = CA.linkCalc(scn(), L, sampledFor(id));
    const wrap = h("div", { class: "calc", id: `calc-${cssId(id)}` });
    wrap.append(h("p", { class: "note" }, `Calculation for ${id} at t = ${CA.fixed(L.t, 3)} s. Values below are selectable text; each equation also shows its source.`));
    if (L.status !== "ok") wrap.append(h("p", { class: "status bad" }, `${statusText[L.status]}: ${L.reasons.join("; ")}`));
    for (const sec of c.sections) {
      const s = h("section", {}, h("h4", {}, sec.title));
      for (const r of sec.rows) {
        const eq = h("div", { class: "eq" });
        if (r.tex) { eq.append(h("span", { class: "mjx" }, `\\(\\displaystyle ${r.tex}\\)`)); eq.append(h("code", { class: "src" }, r.tex)); }
        if (r.text) eq.append(h("span", {}, r.text));
        if (r.note) eq.append(h("span", { class: "nt" }, r.note));
        s.append(h("div", { class: "row" }, h("span", { class: "lbl" }, r.label), eq));
      }
      wrap.append(s);
    }
    return wrap;
  }
  function openCalc(id, open) {
    const tr = $(`#row-${cssId(id)}`);
    if (!tr) return;
    const btn = tr.querySelector("[data-toggle]");
    const next = tr.nextElementSibling;
    const isOpen = next && next.classList.contains("calc-row");
    const want = open ?? !isOpen;
    const exp = new Set(view().expanded);
    if (want && !isOpen) {
      const row = h("tr", { class: "calc-row" }, h("td", { colspan: "9" }, calcElement(id)));
      tr.after(row);
      U.typeset([row]);
      exp.add(id);
    } else if (!want && isOpen) { next.remove(); exp.delete(id); }
    btn.setAttribute("aria-expanded", String(want));
    view().expanded = [...exp];
  }
  /** Refresh the open panels (after a time or model change), typesetting only them. */
  function renderCalcs() {
    const rows = [];
    for (const id of view().expanded) {
      const tr = $(`#row-${cssId(id)}`);
      if (!tr || !app.linkMap.has(id)) continue;
      const next = tr.nextElementSibling;
      const fresh = h("tr", { class: "calc-row" }, h("td", { colspan: "9" }, calcElement(id)));
      if (next && next.classList.contains("calc-row")) next.replaceWith(fresh); else tr.after(fresh);
      tr.querySelector("[data-toggle]").setAttribute("aria-expanded", "true");
      rows.push(fresh);
    }
    if (rows.length) U.typeset(rows);
  }

  /* ===== SELECTED RESULT ===== */
  function renderSelected() {
    const L = selectedLink(), body = $("#selected-body");
    if (!L) { body.innerHTML = '<p class="note">Select a link in the table or the scene.</p>'; return; }
    const d = L.detector, items = [
      ["Link", `${L.id} (${L.type})`],
      ["Status", L.status === "ok" ? "valid" : statusText[L.status]],
      ["Received power", L.power ? `${CA.txt(L.power.Pr)} W = ${CA.fixed(L.power.PrdBm, 2)} dBm` : "—"],
      ["ρ₁ (matched filter)", L.snr ? `${CA.fixed(N.linToDb(L.snr.rho1), 2)} dB` : "—"],
      [L.snr?.integration === "coherent" ? "ρ_N (coherent)" : "Noncoherent N", L.snr ? (L.snr.integration === "coherent" ? `${CA.fixed(N.linToDb(L.snr.rhoN), 2)} dB` : String(L.snr.pulses)) : "—"],
      ["Threshold η", d ? CA.txt(d.eta) : "—"],
      ["Required ρ₁", d ? `${CA.fixed(d.req.db, 3)} dB` : "—"],
      ["Margin", d ? `${d.margin_dB >= 0 ? "▲ +" : "▼ "}${CA.fixed(d.margin_dB, 2)} dB` : "—"],
      ["Predicted P_d", d ? CA.pdTxt(d) : "—"],
      ["Delay τ_e", `${CA.txt(L.geometry.tauE * 1e6, 6)} μs`],
      ["Doppler f_D", `${CA.fixed(L.geometry.fD, 2)} Hz`],
      ["G_t / G_r", `${CA.fixed(L.gains.tx.dBi, 2)} / ${CA.fixed(L.gains.rx.dBi, 2)} dBi`],
      ["RCS σ_b", L.rcs.ok ? `${CA.txt(L.rcs.sigma)} m² (${L.rcs.mode})` : "—"],
      ["R_t, R_r", `${CA.fixed(L.geometry.Rt / 1000, 3)}, ${CA.fixed(L.geometry.Rr / 1000, 3)} km`],
    ];
    body.textContent = "";
    const dl = h("dl", { class: "kv" });
    for (const [k, v] of items) dl.append(h("div", {}, h("dt", {}, k), h("dd", { dataset: { k } }, v)));
    body.append(dl);
    if (L.reasons.length) body.append(h("p", { class: L.status === "ok" ? "note" : "status bad" }, L.reasons.join("; ")));
    body.append(h("p", { class: "note" }, "Predicted P_d is a probability under the thermal-noise model. A sampled detection in the range–Doppler view is one realised outcome."));
    body.append(h("p", {}, h("button", { type: "button", onclick: () => { openCalc(L.id, true); $(`#row-${cssId(L.id)}`)?.scrollIntoView({ block: "nearest" }); } }, "Open calculation")));
  }

  /* ===== SCENE ===== */
  const scene = { proj: null, picks: [], drag: null, pointers: new Map(), failed: false };
  function sceneColors() {
    return { fg: U.token("--fg"), muted: U.token("--muted"), faint: U.token("--faint"), grid: U.token("--grid"), radar: U.token("--c4"), target: U.token("--c3"), mono: U.token("--c1"), bi: U.token("--c2"), hl: U.token("--hl"), clutter: U.token("--c4"), font: `12px ${U.token("--sans")}` };
  }
  function drawScene() {
    if (scene.failed) return;
    const canvas = $("#scene");
    let set;
    try { set = U.setupCanvas(canvas); } catch (e) { set = null; }
    if (!set) { scene.failed = true; canvas.hidden = true; $("#scene-fallback").hidden = false; return; }
    const { ctx, w, h: hh } = set;
    const s = scn(), v = view(), t = v.time_s, col = sceneColors();
    if (v.follow && v.selectedObject) { try { v.camera.target_m = M.objectState(s, v.selectedObject, t).p; } catch (e) { v.follow = false; } }
    const proj = V.projector(v.camera, w, hh);
    scene.proj = proj;
    const prims = [];
    const L = v.layers;
    // Ground grid every 10 km over the scene extent.
    const pts = [...s.radars, ...s.targets].map((o) => M.kinematics(o, t).p);
    const ext = pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.max(a[1], p[0]), Math.min(a[2], p[1]), Math.max(a[3], p[1])], [-10e3, 10e3, -10e3, 10e3]);
    const gx0 = Math.floor(ext[0] / 10e3 - 1) * 10e3, gx1 = Math.ceil(ext[1] / 10e3 + 1) * 10e3, gy0 = Math.floor(ext[2] / 10e3 - 1) * 10e3, gy1 = Math.ceil(ext[3] / 10e3 + 1) * 10e3;
    const gstyle = { stroke: col.grid, width: 1 };
    for (let x = gx0; x <= gx1; x += 10e3) prims.push({ kind: "line", a: [x, gy0, 0], b: [x, gy1, 0], style: gstyle });
    for (let y = gy0; y <= gy1; y += 10e3) prims.push({ kind: "line", a: [gx0, y, 0], b: [gx1, y, 0], style: gstyle });
    prims.push({ kind: "line", a: [0, 0, 0], b: [10e3, 0, 0], style: { stroke: col.muted, width: 2 } }, { kind: "text", p: [10e3, 0, 0], text: "x east 10 km", style: { fill: col.muted, font: col.font } });
    prims.push({ kind: "line", a: [0, 0, 0], b: [0, 10e3, 0], style: { stroke: col.muted, width: 2 } }, { kind: "text", p: [0, 10e3, 0], text: "y north", style: { fill: col.muted, font: col.font } });
    prims.push({ kind: "line", a: [0, 0, 0], b: [0, 0, 5e3], style: { stroke: col.muted, width: 2 } }, { kind: "text", p: [0, 0, 5e3], text: "z up 5 km", style: { fill: col.muted, font: col.font } });
    if (L.clutter && s.environment.clutter.enabled) for (const p of s.environment.clutter.patches) prims.push({ kind: "marker", p: p.position_m, shape: "square", size: 3, style: { fill: col.clutter, alpha: 0.45 } });
    // Paths.
    if (L.paths) {
      const sel = v.selectedLink, obj = v.selectedObject;
      for (const l of app.links) {
        if (!l.geometry) continue;
        const isSel = l.id === sel, involved = obj && [l.tx, l.rx, l.target].includes(obj);
        if (v.isolate && !(isSel || involved)) continue;
        if (!isSel && !involved && l.status !== "ok") continue;
        const mono = l.type === "monostatic";
        const style = { stroke: mono ? col.mono : col.bi, width: isSel ? 2.5 : 1, dash: mono ? [] : [6, 3], alpha: isSel ? 1 : involved ? 0.55 : 0.12 };
        prims.push({ kind: "line", a: l.geometry.pt, b: l.geometry.pk, style }, { kind: "line", a: l.geometry.pk, b: l.geometry.pr, style });
      }
    }
    for (const r of s.radars) {
      const st = M.objectState(s, r.id, t), isSel = v.selectedObject === r.id;
      prims.push({ kind: "line", a: st.p, b: [st.p[0], st.p[1], 0], style: { stroke: col.faint, dash: [2, 3] } });
      if (L.beams && r.antenna.mode !== "uniform") {
        const b = M.boresight(s, r.id, t);
        prims.push(...V.cone(st.p, b.u, (r.antenna.beamwidth_deg ?? 10) / 2, 30e3, { stroke: col.radar, alpha: isSel ? 0.9 : 0.4 }));
      }
      if (L.velocity && N.vnorm(st.v) > 0) prims.push({ kind: "line", a: st.p, b: N.vadd(st.p, N.vscale(st.v, 30)), style: { stroke: col.radar, width: 1.5 } });
      if (L.trails) trail(r, t, col.radar, prims);
      corners(r, col.radar, prims);
      prims.push({ kind: "marker", p: st.p, shape: "square", size: 6, style: { stroke: col.radar, fill: col.radar, width: 2 }, ring: isSel ? col.hl : null, pick: r.id });
      if (L.labels) prims.push({ kind: "text", p: st.p, text: `${r.id} ${r.antenna.pointing.mode === "track" ? "(tracks " + r.antenna.pointing.target + ")" : ""}`, style: { fill: col.fg, font: col.font } });
    }
    for (const tg of s.targets) {
      const st = M.objectState(s, tg.id, t), isSel = v.selectedObject === tg.id;
      prims.push({ kind: "line", a: st.p, b: [st.p[0], st.p[1], 0], style: { stroke: col.faint, dash: [2, 3] } });
      // Body axes: nose (+x) and wings (+-y), 2.5 km long, so orientation shows.
      const nose = M.mulMV(st.R, [2500, 0, 0]), wing = M.mulMV(st.R, [0, 1200, 0]);
      prims.push({ kind: "poly", pts: [N.vadd(st.p, nose), N.vadd(st.p, wing), N.vsub(st.p, wing)], style: { stroke: col.target, fill: col.target, alpha: 0.35 } });
      if (L.velocity) prims.push({ kind: "line", a: st.p, b: N.vadd(st.p, N.vscale(st.v, 30)), style: { stroke: col.target, width: 1.5 } });
      if (L.trails) trail(tg, t, col.target, prims);
      corners(tg, col.target, prims);
      prims.push({ kind: "marker", p: st.p, shape: "triangle", size: 6, style: { stroke: col.target, fill: col.target, width: 2 }, ring: isSel ? col.hl : null, pick: tg.id });
      if (L.labels) prims.push({ kind: "text", p: st.p, text: `${tg.id}${tg.rcs.mode !== "constant" ? " (" + tg.rcs.mode + " RCS)" : ""}`, style: { fill: col.fg, font: col.font } });
    }
    if (L.surfaces) surfacePrims(prims, col);
    ctx.font = col.font;
    scene.picks = V.draw(ctx, proj, prims, { font: col.font });
    ctx.fillStyle = col.muted;
    ctx.fillText(`t = ${t.toFixed(3)} s · ${v.camera.projection} · ${v.mode === "move" ? "Move object (" + v.editPlane + ")" : "Rotate view"}`, 8, hh - 8);
    $("#scene-desc").textContent = describeScene();
  }
  function trail(o, t, color, prims) {
    const pts = [];
    for (let k = 20; k >= 0; k--) { const tt = t - k; if (tt >= 0) pts.push(M.kinematics(o, tt).p); }
    for (let i = 1; i < pts.length; i++) prims.push({ kind: "line", a: pts[i - 1], b: pts[i], style: { stroke: color, alpha: 0.15 + (0.5 * i) / pts.length, width: 1 } });
  }
  function corners(o, color, prims) {
    for (const w of o.trajectory.waypoints ?? []) prims.push({ kind: "marker", p: w.position_m, shape: "diamond", size: 4, style: { stroke: color, width: 1.5 } });
  }
  function surfacePrims(prims, col) {
    const L = selectedLink();
    if (!L || !L.range || !L.geometry) return;
    if (view().surfaceKind === "frozen") {
      const surf = M.frozenSurface(L.geometry.pt, L.geometry.pr, L.range.productAtThreshold, 10, 72);
      for (const line of surf.lines) for (let i = 1; i < line.length; i++) prims.push({ kind: "line", a: line[i - 1], b: line[i], style: { stroke: col.hl, alpha: 0.35 } });
    } else if (app.activeSurface && app.activeSurface.key === activeKey()) {
      for (const ray of app.activeSurface.rays) for (const iv of ray.intervals) prims.push({ kind: "line", a: N.vadd(ray.origin, N.vscale(ray.u, iv[0])), b: N.vadd(ray.origin, N.vscale(ray.u, iv[1])), style: { stroke: col.hl, alpha: 0.5, width: 1.5 } });
    }
  }
  const activeKey = () => `${app.digest}|${view().selectedLink}|${view().time_s}`;
  /** Active-model range cuts on a coarse grid of directions from the transmitter (on request: it is slow). */
  function computeActiveSurface() {
    const L = selectedLink();
    if (!L) return;
    notice("Computing active-model range cuts…");
    setTimeout(() => {
      const t0 = performance.now(), rays = [], origin = L.geometry.pt;
      for (const el of [0, 5, 15, 30]) for (let az = 0; az < 360; az += 30) {
        const u = M.dirFromAzEl(az, el);
        const cut = M.rangeCut(scn(), L.id, u, view().time_s, { steps: 90, rMax: 300e3 });
        rays.push({ origin, u, intervals: cut.intervals });
      }
      app.activeSurface = { key: activeKey(), rays, ms: performance.now() - t0 };
      notice(`Active-model range cuts: ${rays.length} rays, ${Math.round(app.activeSurface.ms)} ms. Each ray shows every interval where the margin is at least 0 dB.`);
      drawScene();
    }, 20);
  }
  function describeScene() {
    const s = scn(), t = view().time_s;
    const objs = [...s.radars, ...s.targets].map((o) => { const p = M.kinematics(o, t).p; return `${o.id} at (${CA.fixed(p[0] / 1000, 1)}, ${CA.fixed(p[1] / 1000, 1)}) km, altitude ${CA.fixed(p[2], 0)} m`; });
    const L = selectedLink();
    return `Scene at t = ${t.toFixed(3)} s. ${objs.join("; ")}. ${L ? `Selected link ${L.id}: ${L.type}, ${L.status === "ok" ? "margin " + CA.fixed(L.detector.margin_dB, 2) + " dB" : statusText[L.status]}.` : ""}`;
  }

  /* ===== SCENE INTERACTION ===== */
  function canvasPoint(e) { const r = $("#scene").getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function orbit(dyaw, dpitch) { const c = view().camera; c.yaw_deg = ((c.yaw_deg + dyaw + 540) % 360) - 180; c.pitch_deg = Math.max(-5, Math.min(89.5, c.pitch_deg + dpitch)); drawScene(); }
  function pan(dx, dy) {
    const c = view().camera, f = V.cameraFrame(c);
    const ground = N.vunit([f.fwd[0], f.fwd[1], 0]), right = N.vunit([f.right[0], f.right[1], 0]);
    const step = c.distance_m * 0.08;
    c.target_m = N.vadd(c.target_m, N.vadd(N.vscale(right, dx * step), N.vscale(Number.isFinite(ground[0]) ? ground : [0, 1, 0], dy * step)));
    view().follow = false; $("#follow-sel").setAttribute("aria-pressed", "false");
    drawScene();
  }
  function zoom(k) { const c = view().camera; c.distance_m = Math.max(2e3, Math.min(2e6, c.distance_m * k)); drawScene(); }
  function fitCamera() { const t = view().time_s; view().camera = V.fit(view().camera, [...scn().radars, ...scn().targets].map((o) => M.kinematics(o, t).p)); drawScene(); }
  function selectObject(id) {
    view().selectedObject = id;
    if (id) {
      // Prefer a link that involves the object: keep the current one if it does.
      const cur = selectedLink();
      if (!cur || ![cur.tx, cur.rx, cur.target].includes(id)) {
        const cand = app.links.find((l) => l.status === "ok" && [l.tx, l.rx, l.target].includes(id)) || app.links.find((l) => [l.tx, l.rx, l.target].includes(id));
        if (cand) selectLink(cand.id, { quiet: true });
      }
    }
    renderControls();
    renderDynamic();
  }
  function selectLink(id, { quiet = false } = {}) {
    if (!app.linkMap.has(id)) return;
    view().selectedLink = id;
    const p = M.parseLinkId(id);
    view().channel = { rx: p.rx, tx: p.tx };
    app.scan = null; app.mc = null;
    writeHash(true);
    if (!quiet) renderDynamic();
    renderTab();
  }
  function moveObjectTo(id, p, t) {
    const o = scn().radars.find((x) => x.id === id) || scn().targets.find((x) => x.id === id);
    const tr = o.trajectory;
    if ((tr.waypoints ?? []).length >= 2) {
      const cur = M.kinematics(o, t).p, d = N.vsub(p, cur);
      for (const w of tr.waypoints) w.position_m = N.vadd(w.position_m, d);
    } else tr.position_m = N.vsub(p, N.vscale(tr.velocity_mps, t));
  }
  function bindScene() {
    const c = $("#scene");
    c.addEventListener("pointerdown", (e) => {
      c.setPointerCapture(e.pointerId);
      scene.pointers.set(e.pointerId, canvasPoint(e));
      const [x, y] = canvasPoint(e);
      const hit = V.pick(scene.picks, x, y);
      if (scene.pointers.size === 2) { const [a, b] = [...scene.pointers.values()]; scene.drag = { kind: "pinch", d0: Math.hypot(a[0] - b[0], a[1] - b[1]), dist0: view().camera.distance_m, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; return; }
      if (view().mode === "move" && hit && hit.id === view().selectedObject) {
        setPlaying(false);
        scene.drag = { kind: "move", id: hit.id, before: S.clone(scn()), moved: false };
        c.classList.add("moving");
      } else scene.drag = { kind: e.shiftKey || e.button === 1 || e.button === 2 ? "pan" : "rotate", x, y, start: [x, y], hit, moved: false };
    });
    c.addEventListener("pointermove", (e) => {
      if (!scene.pointers.has(e.pointerId)) return;
      scene.pointers.set(e.pointerId, canvasPoint(e));
      const d = scene.drag;
      if (!d) return;
      const [x, y] = canvasPoint(e);
      if (d.kind === "pinch" && scene.pointers.size === 2) {
        const [a, b] = [...scene.pointers.values()];
        const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
        view().camera.distance_m = Math.max(2e3, Math.min(2e6, (d.dist0 * d.d0) / Math.max(dd, 1)));
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (Math.hypot(mid[0] - d.mid[0], mid[1] - d.mid[1]) > 20) { pan(-(mid[0] - d.mid[0]) / 60, (mid[1] - d.mid[1]) / 60); d.mid = mid; }
        drawScene();
        return;
      }
      if (d.kind === "move") {
        const id = d.id, t = view().time_s, cur = M.kinematics(scn().radars.find((r) => r.id === id) || scn().targets.find((r) => r.id === id), t).p;
        const p = V.rayPlane(scene.proj.ray(x, y), view().editPlane, cur);
        if (!p) return;
        if (view().editPlane === "XY") p[2] = cur[2];
        p[2] = Math.max(0, p[2]);
        moveObjectTo(id, p, t);
        d.moved = true;
        derive(); renderDynamic();
        return;
      }
      if (Math.hypot(x - d.start[0], y - d.start[1]) > 3) d.moved = true;
      if (d.kind === "rotate") orbit(-(x - d.x) * 0.4, (y - d.y) * 0.3);
      else pan(-(x - d.x) / 40, (y - d.y) / 40);
      d.x = x; d.y = y;
    });
    const end = (e) => {
      scene.pointers.delete(e.pointerId);
      const d = scene.drag;
      if (!d) return;
      if (scene.pointers.size) return;
      scene.drag = null;
      c.classList.remove("moving");
      if (d.kind === "move") {
        if (d.moved) {
          const errors = S.validate(scn());
          if (errors.length) { app.scn = d.before; notice(`Move refused: ${errors[0].message}`, "err"); }
          else app.history.push(`Move ${d.id} (t = ${CA.fixed(view().time_s, 3)} s)`, d.before);
          modelChanged();
        }
        return;
      }
      if (!d.moved && e.type === "pointerup") {
        const [x, y] = canvasPoint(e);
        const hit = V.pick(scene.picks, x, y);
        selectObject(hit ? hit.id : null);
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    c.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "ArrowLeft") orbit(-10, 0); else if (k === "ArrowRight") orbit(10, 0);
      else if (k === "ArrowUp") orbit(0, 5); else if (k === "ArrowDown") orbit(0, -5);
      else if (k === "+" || k === "=") zoom(0.85); else if (k === "-" || k === "_") zoom(1.18);
      else if (k === "Escape" && scene.drag) { if (scene.drag.kind === "move") { app.scn = scene.drag.before; modelChanged(); } scene.drag = null; }
      else return;
      e.preventDefault();
    });
    window.addEventListener("resize", () => { drawScene(); renderTab(); });
  }

  /* ===== CONTROLS ===== */
  const F = (path, label, o = {}) => ({ path, label, ...o });
  const CARRIERS = [["4000000000", "4 GHz"], ["10000000000", "10 GHz"], ["17000000000", "17 GHz"]];
  function fieldEl(f) {
    let value;
    try { value = f.get ? f.get() : S.getPath(scn(), f.path); } catch (e) { value = undefined; }
    const id = `f-${f.path.replace(/[^A-Za-z0-9]/g, "_")}${f.key ?? ""}`;
    let input;
    if (f.kind === "select") {
      input = h("select", { id, dataset: { path: f.path } }, ...f.options.map(([v, l]) => h("option", { value: v, selected: String(value) === String(v) }, l)));
    } else if (f.kind === "check") {
      input = h("input", { id, type: "checkbox", dataset: { path: f.path }, checked: !!value });
      return h("label", { class: "check", for: id }, input, f.label);
    } else {
      const shown = value === undefined || value === null ? "" : f.scale ? Number((value / f.scale).toPrecision(10)) : value;
      input = h("input", { id, type: f.kind === "text" ? "text" : "number", step: f.step ?? "any", min: f.min, max: f.max, value: String(shown), dataset: { path: f.path }, disabled: f.disabled });
    }
    input.addEventListener("change", () => {
      let v;
      if (f.kind === "check") v = input.checked;
      else if (f.kind === "select") v = f.numeric ? Number(input.value) : input.value;
      else if (f.kind === "text") v = input.value;
      else { v = Number(input.value); if (input.value.trim() === "" || !Number.isFinite(v)) { notice(`${f.label}: enter a finite number.`, "err"); renderControls(); return; } if (f.scale) v *= f.scale; }
      edit(`${f.label}`, (s) => (f.set ? f.set(s, v) : S.setPath(s, f.path, v)));
    });
    return h("label", { for: id }, h("span", {}, `${f.label}${f.unit ? ` (${f.unit})` : ""}`), input);
  }
  const fields = (list) => h("div", { class: "fields" }, ...list.map(fieldEl));
  function group(title, open, ...kids) { const d = h("details", { open: open || null }, h("summary", {}, title), ...kids); return d; }
  /** Position and velocity at the current time; editing keeps p(t) = p0 + v t consistent. */
  function kinFields(kind, o) {
    const base = `${kind}.${o.id}.trajectory`, t = () => view().time_s;
    const wp = (o.trajectory.waypoints ?? []).length >= 2;
    const pos = (i, label, unit, scale) => F(`${base}.position_m`, label, { key: `p${i}`, unit, scale, disabled: wp, get: () => M.kinematics(o, t()).p[i], set: (s, v) => { const ob = s[kind].find((x) => x.id === o.id); const p = M.kinematics(ob, t()).p; p[i] = v; moveObjectTo(o.id, p, t()); } });
    const vel = (i, label) => F(`${base}.velocity_mps`, label, { key: `v${i}`, unit: "m/s", disabled: wp, get: () => o.trajectory.velocity_mps[i], set: (s, v) => { const ob = s[kind].find((x) => x.id === o.id); const p = M.kinematics(ob, t()).p; ob.trajectory.velocity_mps[i] = v; ob.trajectory.position_m = N.vsub(p, N.vscale(ob.trajectory.velocity_mps, t())); } });
    return [pos(0, "x at t", "km", 1000), pos(1, "y at t", "km", 1000), pos(2, "Altitude at t", "m", 1), vel(0, "v_x"), vel(1, "v_y"), vel(2, "v_z")];
  }
  function orientFields(kind, o) {
    const b = `${kind}.${o.id}.orientation`;
    return [F(`${b}.yaw_deg`, "Yaw at t = 0", { unit: "°" }), F(`${b}.pitch_deg`, "Pitch at t = 0", { unit: "°" }), F(`${b}.roll_deg`, "Roll at t = 0", { unit: "°" }),
      ...[0, 1, 2].map((i) => F(`${b}.rates_dps`, ["Yaw rate", "Pitch rate", "Roll rate"][i], { key: `r${i}`, unit: "°/s", get: () => o.orientation.rates_dps[i], set: (s, v) => { s[kind].find((x) => x.id === o.id).orientation.rates_dps[i] = v; } }))];
  }
  /** Waypoint table: time-stamped positions, strictly increasing; shows the velocity change at each corner. */
  function waypointEditor(kind, o) {
    const wps = o.trajectory.waypoints ?? [];
    const box = h("div", {});
    box.append(h("p", { class: "note" }, wps.length ? "Piecewise-linear trajectory through these waypoints (times strictly increasing). Outside them the end segments continue." : "No waypoints: the trajectory is p(t) = p₀ + v t."));
    if (wps.length) {
      const tb = h("table", {}, h("thead", {}, h("tr", {}, ...["t (s)", "x (km)", "y (km)", "z (m)", "Segment v (m/s)", "Δv at corner (m/s)", ""].map((x) => h("th", {}, x)))));
      const body = h("tbody");
      wps.forEach((w, i) => {
        const vin = i > 0 ? N.vscale(N.vsub(w.position_m, wps[i - 1].position_m), 1 / (w.t_s - wps[i - 1].t_s)) : null;
        const vout = i < wps.length - 1 ? N.vscale(N.vsub(wps[i + 1].position_m, w.position_m), 1 / (wps[i + 1].t_s - w.t_s)) : null;
        const cell = (val, set, scale = 1) => { const inp = h("input", { type: "number", step: "any", value: String(Number((val / scale).toPrecision(10))), style: "width:6.5rem", "aria-label": `waypoint ${i + 1}` }); inp.addEventListener("change", () => edit(`Waypoint ${i + 1} of ${o.id}`, (s) => set(s[kind].find((x) => x.id === o.id).trajectory.waypoints[i], Number(inp.value) * scale))); return h("td", {}, inp); };
        body.append(h("tr", {}, cell(w.t_s, (W, v) => { W.t_s = v; }), cell(w.position_m[0], (W, v) => { W.position_m[0] = v; }, 1000), cell(w.position_m[1], (W, v) => { W.position_m[1] = v; }, 1000), cell(w.position_m[2], (W, v) => { W.position_m[2] = v; }),
          h("td", { class: "num" }, vout ? CA.vecTxt(vout, 1, 4) : "—"), h("td", { class: "num" }, vin && vout ? CA.txt(N.vnorm(N.vsub(vout, vin)), 4) : "—"),
          h("td", {}, h("button", { type: "button", onclick: () => edit(`Remove waypoint ${i + 1} of ${o.id}`, (s) => { const tr = s[kind].find((x) => x.id === o.id).trajectory; tr.waypoints.splice(i, 1); if (tr.waypoints.length === 1) tr.waypoints = []; }) }, "Remove"))));
      });
      tb.append(body);
      box.append(h("div", { class: "table-scroll" }, tb));
    }
    box.append(h("p", {},
      h("button", { type: "button", onclick: () => edit(`Add waypoint to ${o.id}`, (s) => {
        const ob = s[kind].find((x) => x.id === o.id), tr = ob.trajectory;
        if ((tr.waypoints ?? []).length < 2) { const T = s.scene.duration_s; tr.waypoints = [{ t_s: 0, position_m: M.kinematics(ob, 0).p }, { t_s: T, position_m: M.kinematics(ob, T).p }]; }
        else { const a = tr.waypoints.at(-2), b = tr.waypoints.at(-1), tm = (a.t_s + b.t_s) / 2; tr.waypoints.splice(tr.waypoints.length - 1, 0, { t_s: tm, position_m: M.kinematics(ob, tm).p }); }
      }) }, wps.length ? "Insert waypoint" : "Use waypoints"),
      wps.length ? h("button", { type: "button", onclick: () => edit(`Clear waypoints of ${o.id}`, (s) => { const ob = s[kind].find((x) => x.id === o.id), t = view().time_s; const k = M.kinematics(ob, t); ob.trajectory = { position_m: N.vsub(k.p, N.vscale(k.v, t)), velocity_mps: k.v, waypoints: [] }; }) }, "Back to p₀ + v t") : null));
    return box;
  }
  function importTableButton(label, kind, apply) {
    const inp = h("input", { type: "file", accept: ".json,application/json", "aria-label": label });
    inp.addEventListener("change", async () => {
      const f = inp.files[0]; if (!f) return;
      let tab;
      try { tab = JSON.parse(await f.text()); } catch (e) { notice(`${label}: not JSON (${e.message}).`, "err"); return; }
      const errs = S.validateTable(tab, kind);
      if (errs.length) { notice(`${label} refused: ${errs.join("; ")}. The current values stay.`, "err"); return; }
      edit(label, (s) => apply(s, tab));
    });
    return h("label", {}, h("span", {}, label), inp);
  }
  function renderControls() {
    const box = $("#controls");
    const focusedPath = document.activeElement && document.activeElement.dataset ? document.activeElement.id : null;
    const openState = new Map($$("#controls details").map((d) => [d.dataset.key, d.open]));
    box.textContent = "";
    const s = scn(), v = view();
    const objIds = [...s.radars.map((r) => r.id), ...s.targets.map((t) => t.id)];
    const selRadar = s.radars.find((r) => r.id === v.selectedObject) || s.radars.find((r) => r.id === M.parseLinkId(v.selectedLink || "")?.tx) || s.radars[0];
    const selTarget = s.targets.find((r) => r.id === v.selectedObject) || s.targets.find((r) => r.id === M.parseLinkId(v.selectedLink || "")?.target) || s.targets[0];
    const chooser = h("p", {}, h("label", { class: "field-inline" }, "Selected object ", h("select", { id: "object-select", "aria-label": "Selected object", onchange: (e) => selectObject(e.target.value || null) }, h("option", { value: "" }, "none"), ...objIds.map((id) => h("option", { value: id, selected: id === v.selectedObject }, id)))));
    box.append(chooser);
    // Scene.
    box.append(group("Scene", true, fields([
      F("scene.duration_s", "Duration", { unit: "s", min: 1 }),
      F("seed", "Seed", { step: 1, set: (sc, val) => { sc.seed = Math.round(val); } }),
    ]), h("p", {}, h("button", { type: "button", onclick: () => edit("Reset seed", (sc) => { sc.seed = DATA.preset.scene.seed; }) }, `Reset seed to ${DATA.preset.scene.seed}`), " ", h("button", { type: "button", onclick: resetScene }, "Reset whole scene"))));
    // Radar.
    if (selRadar) {
      const r = selRadar, b = `radars.${r.id}`;
      const pointing = r.antenna.pointing;
      box.append(group(`Radar ${r.id}`, !!v.selectedObject && v.selectedObject === r.id,
        h("h3", {}, "Position and motion"), fields(kinFields("radars", r)), waypointEditor("radars", r),
        h("h3", {}, "Orientation"), fields(orientFields("radars", r)),
        h("h3", {}, "Antenna"), fields([
          F(`${b}.antenna.mode`, "Pattern", { kind: "select", options: [["directional", "Synthetic directional"], ["uniform", "Isotropic pattern factor (G = G_peak)"], ["imported", "Imported pattern"]] }),
          F(`${b}.antenna.gainMode`, "Peak gain from", { kind: "select", options: [["gain", "Constant gain (dBi)"], ["aperture", "Constant effective aperture"]] }),
          F(`${b}.antenna.peakGain_dBi`, "Peak gain", { unit: "dBi" }),
          F(`${b}.antenna.aperture_m2`, "Effective aperture", { unit: "m²", min: 0 }),
          F(`${b}.antenna.beamwidth_deg`, "Beamwidth θ₃dB (full)", { unit: "°", min: 0 }),
          F(`${b}.antenna.floor_dB`, "Sidelobe floor A_max", { unit: "dB", min: 0 }),
          F(`${b}.antenna.pointing`, "Pointing", { kind: "select", options: [["fixed", "Fixed (world az/el)"], ["body", "Orientation-relative"], ...s.targets.map((t) => [`track:${t.id}`, `Track ${t.id}`])], get: () => (pointing.mode === "track" ? `track:${pointing.target}` : pointing.mode), set: (sc, val) => { const rr = sc.radars.find((x) => x.id === r.id); if (val.startsWith("track:")) rr.antenna.pointing = { mode: "track", target: val.slice(6) }; else { const bo = M.boresight(sc, r.id, view().time_s).u, ae = M.azElFromDir(bo); rr.antenna.pointing = { mode: val, az_deg: val === "fixed" ? ae.az : 0, el_deg: val === "fixed" ? ae.el : 0 }; } } }),
          F(`${b}.antenna.pointing.az_deg`, "Boresight azimuth", { unit: "°", disabled: pointing.mode === "track" }),
          F(`${b}.antenna.pointing.el_deg`, "Boresight elevation", { unit: "°", disabled: pointing.mode === "track" }),
          F(`${b}.antenna.farField_m`, "Far-field bound", { unit: "m", min: 0 }),
        ]), importTableButton(`Import antenna pattern for ${r.id}`, "pattern", (sc, tab) => { const rr = sc.radars.find((x) => x.id === r.id); rr.antenna.pattern = tab; rr.antenna.mode = "imported"; }),
        h("p", { class: "note" }, "G_dBi(θ) = G_peak − min(12 (θ/θ₃dB)², A_max): 3 dB down at half the full beamwidth; the floor is a simplified sidelobe floor. An imported pattern needs angle axes (az, el from boresight), units dBi, its frequency and an interpolation rule."),
        h("h3", {}, "Transmitter"), fields([
          F(`${b}.tx.enabled`, "Transmitter on", { kind: "check" }),
          F(`${b}.tx.carrier_Hz`, "Carrier", { kind: "select", numeric: true, options: CARRIERS }),
          F(`${b}.tx.power_W`, "Peak power", { unit: "kW", scale: 1000, min: 0 }),
          F(`${b}.tx.waveform`, "Waveform", { kind: "select", options: [["lfm", "LFM"], ["rect", "Rectangular"]] }),
          F(`${b}.tx.chirp`, "Chirp direction", { kind: "select", options: [["up", "Up (μ = +B/τ)"], ["down", "Down (μ = −B/τ)"]] }),
          F(`${b}.tx.pulse_s`, "Pulse duration τ", { unit: "μs", scale: 1e-6, min: 0 }),
          F(`${b}.tx.bandwidth_Hz`, "LFM bandwidth B", { unit: "MHz", scale: 1e6, min: 0 }),
          F(`${b}.tx.prf_Hz`, "PRF", { unit: "Hz", min: 0 }),
          F(`${b}.tx.pulses`, "Pulses per dwell N", { step: 1, min: 1, set: (sc, val) => { sc.radars.find((x) => x.id === r.id).tx.pulses = Math.round(val); } }),
          F(`${b}.tx.offset_s`, "Transmit offset (scheduled)", { unit: "μs", scale: 1e-6 }),
        ]),
        h("h3", {}, "Receiver"), fields([
          F(`${b}.rx.enabled`, "Receiver on", { kind: "check" }),
          F(`${b}.rx.tempMode`, "Temperature entry", { kind: "select", options: [["system", "System temperature T_s (includes the noise factor)"], ["noise-factor", "T_a + (F − 1) T₀ (noise factor applied once)"]] }),
          F(`${b}.rx.systemTemp_K`, "System temperature T_s", { unit: "K", min: 0, disabled: r.rx.tempMode !== "system" }),
          F(`${b}.rx.antennaTemp_K`, "Antenna temperature T_a", { unit: "K", min: 0, disabled: r.rx.tempMode !== "noise-factor" }),
          F(`${b}.rx.noiseFigure_dB`, "Noise figure", { unit: "dB", disabled: r.rx.tempMode !== "noise-factor" }),
          F(`${b}.rx.sampleRate_Hz`, "Complex sample rate F_s", { unit: "MHz", scale: 1e6, min: 0 }),
          F(`${b}.rx.window_s`, "Window start", { key: "w0", unit: "ms", get: () => r.rx.window_s[0] / 1e-3, set: (sc, val) => { sc.radars.find((x) => x.id === r.id).rx.window_s[0] = val * 1e-3; } }),
          F(`${b}.rx.window_s`, "Window end", { key: "w1", unit: "ms", get: () => r.rx.window_s[1] / 1e-3, set: (sc, val) => { sc.radars.find((x) => x.id === r.id).rx.window_s[1] = val * 1e-3; } }),
          F(`${b}.rx.noiseBandwidth_Hz`, "Analytic noise bandwidth B_n", { unit: "MHz", scale: 1e6, min: 0 }),
          F(`${b}.rx.mfLoss_dB`, "Matched-filter loss L_MF", { unit: "dB", min: 0 }),
          F(`${b}.leakage.isolation_dB`, "Self-leakage isolation", { unit: "dB", min: 0 }),
          F(`${b}.leakage.cancellation_dB`, "Self-leakage cancellation", { unit: "dB", min: 0 }),
        ]),
        h("p", { class: "note" }, `Sampled noise: E|n|² = k T_s F_s over the complex sample bandwidth F_s = ${CA.txt(r.rx.sampleRate_Hz / 1e6)} MHz; each quadrature has variance k T_s F_s / 2.`),
        h("p", {}, h("button", { type: "button", onclick: () => resetObject("radars", r.id) }, `Reset ${r.id}`))));
    }
    // Target.
    if (selTarget) {
      const tg = selTarget, b = `targets.${tg.id}`;
      const ov = Object.entries(tg.rcs.overrides ?? {});
      box.append(group(`Target ${tg.id}`, !!v.selectedObject && v.selectedObject === tg.id,
        h("h3", {}, "Position and motion"), fields(kinFields("targets", tg)), waypointEditor("targets", tg),
        h("h3", {}, "Orientation"), fields(orientFields("targets", tg)),
        h("h3", {}, "Absolute RCS"), fields([
          F(`${b}.rcs.mode`, "RCS mode", { kind: "select", options: [["constant", "Constant (synthetic)"], ["analytic", "Synthetic aspect response"], ["table", "Imported table"]] }),
          F(`${b}.rcs.value_m2`, "σ (constant) or σ₀ (aspect)", { unit: "m²", min: 0 }),
          F(`${b}.rcs.analytic.a`, "a (floor fraction)", { min: 0, max: 1 }),
          ...[0, 1, 2].map((i) => F(`${b}.rcs.analytic.w`, `w_${"xyz"[i]}`, { key: `w${i}`, min: 0, max: 1, get: () => tg.rcs.analytic.w[i], set: (sc, val) => { sc.targets.find((x) => x.id === tg.id).rcs.analytic.w[i] = val; } })),
        ]),
        h("p", { class: "note" }, "Synthetic aspect response: σ_b = σ₀[a + (1 − a)(q(û_t) + q(û_r))/2], q(û) = Σ w_d u_d² in the body frame; 0 < a ≤ 1, 0 ≤ w_d ≤ 1, max w_d = 1. Not an electromagnetic scattering solution."),
        h("p", { class: "note" }, `Per-link overrides (constant mode): ${ov.length ? ov.map(([k, val]) => `${k} = ${val} m²`).join(", ") : "none"}.`),
        overrideEditor(tg),
        importTableButton(`Import RCS table for ${tg.id}`, "rcs", (sc, tab) => { const tt = sc.targets.find((x) => x.id === tg.id); tt.rcs.table = tab; tt.rcs.mode = "table"; }),
        tg.rcs.table ? h("p", { class: "note" }, `Table: ${tg.rcs.table.geometry}, ${CA.txt(tg.rcs.table.frequency_Hz / 1e9)} GHz, source ${tg.rcs.table.provenance?.source}. Positive RCS interpolated in linear units; missing data and points outside the domain refuse.`) : null,
        h("p", {}, h("button", { type: "button", onclick: () => resetObject("targets", tg.id) }, `Reset ${tg.id}`))));
    }
    // Processing.
    box.append(group("Processing", false, fields([
      F("processing.integration", "Pulse integration", { kind: "select", options: [["coherent", "Ideal coherent"], ["noncoherent", "Noncoherent (square law)"]] }),
      F("processing.swerling", "Target fluctuation", { kind: "select", numeric: true, options: [[0, "Swerling 0"], [1, "Swerling 1 (dwell, exponential)"], [2, "Swerling 2 (pulse, exponential)"], [3, "Swerling 3 (dwell, gamma 2)"], [4, "Swerling 4 (pulse, gamma 2)"]] }),
      F("processing.phase.mode", "Scattering-phase update", { kind: "select", options: [["fixed", "Fixed for the scenario"], ["per-dwell", "Seeded per dwell"], ["per-pulse", "Seeded per pulse"]] }),
      F("processing.phase.value_deg", "Fixed scattering phase", { unit: "°" }),
      F("processing.pfa", "P_fa per cell", { min: 0, max: 1 }),
      F("processing.pdRequired", "Required P_d", { min: 0, max: 1 }),
      F("processing.echoLoss_dB", "Echo loss L (per link)", { unit: "dB", min: 0 }),
      F("processing.window", "Slow-time window", { kind: "select", options: [["hann", "Hann"], ["rect", "Rectangular"]] }),
      F("processing.schedule", "Transmission", { kind: "select", options: [["simultaneous", "Simultaneous"], ["scheduled", "Scheduled (transmit offsets)"]] }),
      F("processing.trials", "Monte Carlo trials", { step: 1, min: 1, set: (sc, val) => { sc.processing.trials = Math.round(val); } }),
    ]), h("p", { class: "note" }, "Required SNR, the noise-only threshold η, predicted P_d and sampled detections are separate quantities. The phase update interval is separate from the Swerling amplitude model.")));
    // Environment.
    const env = s.environment;
    box.append(group("Environment", false, fields([
      F("environment.clutter.enabled", "Clutter patches", { kind: "check" }),
      F("environment.clutter.patches", "Patch reflectivity σ⁰ (all)", { unit: "dB", get: () => env.clutter.patches[0]?.sigma0_dB, set: (sc, val) => { for (const p of sc.environment.clutter.patches) p.sigma0_dB = val; } }),
      F("environment.clutter.patches", "Patch area (all)", { key: "area", unit: "m²", get: () => env.clutter.patches[0]?.area_m2, set: (sc, val) => { for (const p of sc.environment.clutter.patches) p.area_m2 = val; } }),
      F("environment.directPath.enabled", "Direct paths", { kind: "check" }),
      F("environment.directPath.cancellation_dB", "Direct-path cancellation C", { unit: "dB", min: 0 }),
      F("environment.directPath.extraLoss_dB", "Direct-path additional loss", { unit: "dB", min: 0 }),
      F("environment.interference.enabled", "Extra Gaussian interference", { kind: "check" }),
      F("environment.interference.power_W", "Interference power", { unit: "W", min: 0 }),
      F("environment.interference.bandwidth_Hz", "Interference bandwidth", { unit: "MHz", scale: 1e6, min: 0 }),
    ]), h("p", { class: "note" }, "Each patch has σ = σ⁰ · area and goes through the same link equation. σ⁰ is a supplied bistatic assumption, not a universal terrain model. A cancellation of C dB scales residual power by 10^(−C/10) and amplitude by 10^(−C/20): an assumed factor, not a simulated adaptive canceller."), constantGammaView()));
    // Network.
    const net = s.network;
    box.append(group("Network", false, fields([
      F("network.mode", "Site combination", { kind: "select", options: [["separate", "Separate results"], ["ideal", "Coherent, ideal calibration"], ["error", "Coherent, explicit errors"]] }),
      F("network.target", "Target", { kind: "select", options: s.targets.map((t) => [t.id, t.id]) }),
      F("network.transmitter", "Transmitter waveform", { kind: "select", options: s.radars.map((r) => [r.id, r.id]) }),
      ...s.radars.map((r) => F("network.receivers", `Receiver ${r.id}`, { kind: "check", key: r.id, get: () => net.receivers.includes(r.id), set: (sc, on) => { const set = new Set(sc.network.receivers); if (on) set.add(r.id); else set.delete(r.id); sc.network.receivers = sc.radars.map((x) => x.id).filter((x) => set.has(x)); } })),
    ]), ...s.radars.filter((r) => net.receivers.includes(r.id)).map((r) => h("div", {}, h("p", { class: "label" }, `Errors at ${r.id} (explicit-error mode)`), fields([
      F(`network.errors.${r.id}.delay_s`, "Alignment delay error", { unit: "ns", scale: 1e-9 }),
      F(`network.errors.${r.id}.clock_s`, "Clock offset", { unit: "ns", scale: 1e-9 }),
      F(`network.errors.${r.id}.cfo_Hz`, "Carrier-frequency offset", { unit: "Hz" }),
      F(`network.errors.${r.id}.phase_deg`, "Residual phase", { unit: "°" }),
      F(`network.errors.${r.id}.scatter_deg`, "Scattering-phase error", { unit: "°" }),
    ]))), h("p", { class: "note" }, "Coherent combination needs one carrier, waveform, sample-rate and reference-timing group. Propagation phase alone does not establish the scattering phase: ideal calibration assumes it is known (a synthetic assumption).")));
    if (focusedPath) { const el = document.getElementById(focusedPath); if (el) el.focus(); }
    $$("#controls details").forEach((d) => { const key = d.querySelector("summary").textContent; d.dataset.key = key; if (openState.has(key)) d.open = openState.get(key); });
  }
  function overrideEditor(tg) {
    const sel = h("select", { "aria-label": `Override link for ${tg.id}` }, ...scn().radars.flatMap((a) => scn().radars.map((b) => h("option", { value: `${a.id}>${b.id}` }, `${a.id}>${b.id}`))));
    const val = h("input", { type: "number", step: "any", min: 0, placeholder: "m²", "aria-label": "Override RCS (m²)", style: "width:7rem" });
    return h("p", { class: "field-inline" }, "Override ", sel, val,
      h("button", { type: "button", onclick: () => { const v = Number(val.value); if (!(v >= 0) || val.value === "") return notice("Enter a nonnegative RCS.", "err"); edit(`RCS override ${sel.value}:${tg.id}`, (s) => { s.targets.find((x) => x.id === tg.id).rcs.overrides[sel.value] = v; }); } }, "Set"),
      h("button", { type: "button", onclick: () => edit(`Clear RCS override ${sel.value}:${tg.id}`, (s) => { delete s.targets.find((x) => x.id === tg.id).rcs.overrides[sel.value]; }) }, "Clear"));
  }
  /** Constant-gamma comparison: monostatic channels only, within its documented assumptions. */
  function constantGammaView() {
    const ch = view().channel, s = scn();
    const box = h("div", { class: "inset" }, h("p", { class: "label" }, "Constant-gamma comparison (monostatic only)"));
    if (!ch || ch.rx !== ch.tx) { box.append(h("p", { class: "note" }, `Channel ${ch ? ch.rx + " with the " + ch.tx + " filter" : "none"} is bistatic: the constant-gamma model is monostatic and is not applied to it.`)); return box; }
    const r = s.radars.find((x) => x.id === ch.rx), p = M.kinematics(r, view().time_s).p, gamma = -20;
    const rows = s.environment.clutter.patches.slice(0, 5).map((pt) => {
      const d = N.vsub(p, pt.position_m), graz = N.deg(Math.asin(d[2] / N.vnorm(d)));
      return `${pt.id}: grazing ${CA.fixed(graz, 2)}°, γ-model σ⁰ = ${CA.fixed(N.linToDb(M.constantGammaSigma0(gamma, graz)), 2)} dB vs supplied ${pt.sigma0_dB} dB`;
    });
    box.append(h("p", { class: "note" }, `σ⁰ = γ sin(ψ_g), γ = ${gamma} dB, for ${ch.rx}: a homogeneous-terrain monostatic model, shown for comparison only.`), h("ul", {}, ...rows.map((x) => h("li", { class: "note" }, x))));
    return box;
  }
  function resetObject(kind, id) {
    const base = baseScenario(view().example);
    const fresh = base[kind].find((x) => x.id === id);
    if (!fresh) return notice(`${id} has no reset value in this example.`, "err");
    edit(`Reset ${id}`, (s) => { const i = s[kind].findIndex((x) => x.id === id); s[kind][i] = fresh; });
  }
  function resetScene() {
    setPlaying(false);
    const before = S.clone(scn());
    const v = view();
    app.scn = baseScenario(v.example);
    app.history.push(`Reset scene (t = ${CA.fixed(before.view.time_s, 3)} s)`, before);
    app.sampled = null; app.sampledAll.clear(); app.combo = null;
    syncTimeInputs();
    modelChanged();
    notice(v.example ? `Example "${v.example}" reset: parameters and seed restored.` : "Scene reset to the initial preset.");
  }
  function loadExample(id, push = true) {
    setPlaying(false);
    const before = app.scn ? S.clone(scn()) : null;
    app.scn = baseScenario(id || null);
    if (before) app.history.push(`Load example ${id || "initial"}`, before);
    app.sampled = null; app.sampledAll.clear(); app.combo = null; app.scan = null; app.activeSurface = null;
    $("#example-select").value = id || "";
    syncTimeInputs();
    derive();
    fitCamera();
    writeHash(push);
    renderAll(true);
  }

  /* ===== TABS ===== */
  const TABS = ["time", "signal", "rd", "amb", "coherent", "evidence", "checks", "learn"];
  function setTab(id, push = true) {
    if (!TABS.includes(id)) return;
    app.tab = id;
    for (const t of TABS) {
      const tab = $(`#tab-${t}`), panel = $(`#panel-${t}`);
      tab.setAttribute("aria-selected", String(t === id)); tab.tabIndex = t === id ? 0 : -1;
      panel.hidden = t !== id;
    }
    writeHash(push);
    renderTab();
  }
  function renderTab() { if (RN.views) RN.views.render(app.tab, api); }

  /* ===== RENDER ===== */
  function renderDynamic() {
    updateTable();
    renderSelected();
    drawScene();
    if (RN.views) RN.views.update(app.tab, api);
  }
  function renderAll(full) {
    updateTable();
    renderSelected();
    drawScene();
    if (full) { renderControls(); renderCalcs(); }
    renderTab();
    const sz = app.history.sizes();
    $("#undo").disabled = !sz.undo; $("#redo").disabled = !sz.redo;
    $("#undo").title = app.history.peek().undo ? `Undo: ${app.history.peek().undo}` : "Nothing to undo";
    $("#redo").title = app.history.peek().redo ? `Redo: ${app.history.peek().redo}` : "Nothing to redo";
    for (const b of $$("[data-preset]")) b.setAttribute("aria-pressed", String(b.dataset.preset === view().preset));
    for (const b of $$("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === view().mode));
    for (const b of $$("[data-plane]")) b.setAttribute("aria-pressed", String(b.dataset.plane === view().editPlane));
    for (const cb of $$("[data-layer]")) cb.checked = !!view().layers[cb.dataset.layer];
    $("#surface-kind").value = view().surfaceKind;
    $("#projection").setAttribute("aria-pressed", String(view().camera.projection === "orthographic"));
    $("#follow-sel").setAttribute("aria-pressed", String(!!view().follow));
    $("#isolate-sel").setAttribute("aria-pressed", String(!!view().isolate));
  }

  /* ===== SAMPLED PROCESSING (WORKER) ===== */
  const WORKER_SCRIPTS = ["src-numerics", "src-detector", "src-model", "src-signal", "worker-glue"];
  function getWorker() {
    if (app.worker || app.workerFailed) return app.worker;
    try {
      const src = WORKER_SCRIPTS.map((id) => document.getElementById(id).textContent).join("\n;\n");
      const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      const w = new Worker(url);
      // Keep the blob URL until the worker answers: some engines load it after the constructor returns.
      app.workerUrl = url;
      w.addEventListener("error", (e) => {
        if (e && e.preventDefault) e.preventDefault();
        app.workerFailed = true; app.worker = null;
        try { URL.revokeObjectURL(url); } catch (err) { /* already gone */ }
        if (app.onWorkerFail) app.onWorkerFail();
      });
      app.worker = w;
    } catch (e) { app.workerFailed = true; app.worker = null; }
    return app.worker;
  }
  /** Run a job { type: "channel" | "combine", ... } in the worker, or on the main thread with yields. */
  function runJob(job, onProgress) {
    if (app.job) cancelJob();
    const token = { cancelled: false };
    app.job = token;
    const model = S.clone(scn()); delete model.view;
    const mainThread = async () => {
      let result;
      if (job.type === "channel") {
        const plan = G.planChannel(model, job.rx, job.tx, job.t0);
        if (!plan.ok) result = { ok: false, reasons: plan.reasons };
        else result = await G.runChannel(plan, { progress: onProgress, cancelled: async () => { await new Promise((r) => setTimeout(r, 0)); return token.cancelled; } }, job.opts);
      } else result = G.combineSites(model, job.t0, job.opts);
      if (token.cancelled) throw new Error("cancelled");
      return result;
    };
    return new Promise((resolve, reject) => {
      const finish = (ok, val) => { if (app.job === token) app.job = null; app.onWorkerFail = null; (ok ? resolve : reject)(val); };
      const fallback = () => { mainThread().then((r) => finish(true, r), (e) => finish(false, e)); };
      const w = getWorker();
      if (!w) { fallback(); return; }
      token.terminate = () => { w.terminate(); app.worker = null; finish(false, new Error("cancelled")); };
      app.onWorkerFail = () => { token.terminate = null; if (!token.cancelled) fallback(); };
      const onMsg = (e) => {
        const m = e.data;
        if (m.id !== job.id) return;
        if (app.workerUrl) { try { URL.revokeObjectURL(app.workerUrl); } catch (err) { /* already gone */ } app.workerUrl = null; }
        if (m.type === "progress") onProgress(m.done, m.total);
        else { w.removeEventListener("message", onMsg); if (m.type === "result") finish(true, m.result); else finish(false, new Error(m.message)); }
      };
      w.addEventListener("message", onMsg);
      w.postMessage({ ...job, scn: model });
    });
  }
  function cancelJob() {
    const j = app.job;
    if (!j) return;
    j.cancelled = true;
    if (j.terminate) j.terminate();
    app.job = null;
    notice("Calculation cancelled.");
    renderTab();
  }
  let jobSeq = 0;
  /** Calculate the dwell of one channel at the current time (or each channel when all is true). */
  async function calculateDwell(all = false) {
    const s = scn(), t0 = view().time_s, ch = view().channel;
    const list = all ? s.radars.flatMap((rx) => s.radars.filter((tx) => tx.tx.carrier_Hz === rx.tx.carrier_Hz).map((tx) => ({ rx: rx.id, tx: tx.id }))) : [ch];
    const ordered = all ? [ch, ...list.filter((c) => !(c.rx === ch.rx && c.tx === ch.tx))] : list; // selected channel first
    const pfa = s.processing.pfa;
    for (let i = 0; i < ordered.length; i++) {
      const c = ordered[i];
      const job = { id: ++jobSeq, type: "channel", rx: c.rx, tx: c.tx, t0, opts: { pfa, pulse: 0 } };
      app.progress = { label: `${c.rx} with the ${c.tx} filter (${i + 1} of ${ordered.length})`, done: 0, total: 1 };
      renderTab();
      let result;
      try {
        result = await runJob(job, (d, tot) => { app.progress = { ...app.progress, done: d, total: tot }; if (RN.views) RN.views.progress(api); });
      } catch (e) { app.progress = null; notice(e.message === "cancelled" ? "Calculation cancelled." : `Calculation failed: ${e.message}`, "err"); renderTab(); return; }
      const rec = { rx: c.rx, tx: c.tx, t0, result, digest: app.digest, dwellDigest: S.dwellDigest(s, { t0, rx: c.rx, tx: c.tx }), stale: false, params: S.clone(s) };
      if (result.ok) { app.sampledAll.set(`${c.rx}>${c.tx}`, rec); if (c.rx === ch.rx && c.tx === ch.tx) app.sampled = rec; app.perf.dwellMs = result.ms; }
      else if (c.rx === ch.rx && c.tx === ch.tx) app.sampled = rec;
    }
    app.progress = null; app.mc = null;
    renderTab(); renderCalcs();
    const r = app.sampled?.result;
    notice(r?.ok ? `Dwell calculated in ${r.ms} ms (${r.pulses} pulses × ${r.Nw} samples).` : `Dwell not calculated: ${(r?.reasons || []).join("; ")}`);
  }
  async function calculateCombination() {
    const s = scn(), net = s.network;
    if (net.mode === "separate") return notice("Site combination is set to separate results. Choose ideal calibration or explicit errors in the Network controls.");
    const job = { id: ++jobSeq, type: "combine", t0: view().time_s, opts: { target: net.target, transmitter: net.transmitter, receivers: net.receivers, mode: net.mode, errors: net.errors } };
    app.progress = { label: "coherent site combination", done: 0, total: 1 };
    renderTab();
    try {
      const result = await runJob(job, () => {});
      app.combo = { result, digest: app.digest, stale: false, t0: job.t0 };
    } catch (e) { notice(e.message === "cancelled" ? "Calculation cancelled." : `Combination failed: ${e.message}`, "err"); }
    app.progress = null;
    renderTab();
  }

  /* ===== EXPORT ===== */
  function resultSnapshots() {
    const out = [];
    for (const r of app.sampledAll.values()) {
      if (!r.result || !r.result.ok) continue;
      out.push({
        kind: "dwell", channel: { rx: r.rx, tx: r.tx }, t0: r.t0, modelDigest: r.digest, dwellDigest: r.dwellDigest, stale: r.stale,
        processing: { pulses: r.result.pulses, samples: r.result.Nw, Fs: r.result.Fs, window: r.result.window, eta: r.result.eta, matchedFilter: "unit energy", noise: r.result.noise },
        detections: r.result.detections, cellsTotal: r.result.cellsTotal, ms: r.result.ms,
        cells: r.result.cells.map((c) => ({ id: c.id, lag: c.lag, bin: c.bin, thermalSnr: c.thermalSnr, clutter: c.clutterPower, interference: c.interferencePower, noise: c.noisePower, sinr: c.sinr, statistic: c.statistic, detected: c.detected })),
        parameters: r.stale ? r.params : undefined,
      });
    }
    return out;
  }
  function exportJson() { U.download("radar-network-scenario.json", S.exportJson(scn(), resultSnapshots())); notice("Exported radar-network-scenario.json."); }
  function reportMarkdown() {
    const s = scn(), t = view().time_s;
    const snap = CA.snapshot(s, t, { digest: S.modelDigest(s), sampled: Object.fromEntries(app.links.map((l) => [l.id, sampledFor(l.id)]).filter((x) => x[1])) });
    const r = app.sampled && app.sampled.result && app.sampled.result.ok ? app.sampled : null;
    const sampled = r ? { rx: r.rx, tx: r.tx, t0: r.t0, stale: r.stale, digest: r.digest, pulses: r.result.pulses, Nw: r.result.Nw, window: r.result.window.rule, noise: r.result.noise.measured, eta: r.result.eta, detections: r.result.detections, cellsTotal: r.result.cellsTotal, cells: r.result.cells.map((c) => ({ id: c.id, snr: c.thermalSnr, clutter: c.clutterPower, interference: c.interferencePower, sinr: c.sinr, detected: c.detected })) } : null;
    const cam = view().camera;
    const rep = RP.report(s, {
      snapshot: snap, references: CK.references(DATA.references), invariants: CK.invariants(DATA.preset, DATA.examples, DATA.evidence), detectorChecks: CK.detectorChecks(),
      sampled, camera: `${cam.projection}, yaw ${CA.fixed(cam.yaw_deg, 1)}°, pitch ${CA.fixed(cam.pitch_deg, 1)}°, distance ${CA.fixed(cam.distance_m / 1000, 1)} km`, sources: SOURCES,
    });
    return window.Beamdswitch.deck(rep);
  }
  function markdownRecord() {
    const s = scn();
    return RP.markdown(s, { snapshot: CA.snapshot(s, view().time_s, { digest: S.modelDigest(s) }), references: CK.references(DATA.references) });
  }
  function downloadMarkdown() { U.download("radar-network-record.md", markdownRecord(), "text/markdown"); notice("Downloaded radar-network-record.md."); }
  async function copyMarkdown() { const ok = await U.copy(markdownRecord()); notice(ok ? "Markdown copied." : "Copy failed: use Download Markdown.", ok ? "" : "err"); }
  function downloadReport() { try { U.download("radar-network-beamdswitch.md", reportMarkdown(), "text/markdown"); notice("Downloaded radar-network-beamdswitch.md."); } catch (e) { notice(`Report failed: ${e.message}`, "err"); } }
  async function copyReport() { try { const ok = await U.copy(reportMarkdown()); notice(ok ? "Report copied." : "Copy failed: use Download report.", ok ? "" : "err"); } catch (e) { notice(`Report failed: ${e.message}`, "err"); } }

  /* ===== IMPORT ===== */
  function openImport() { $("#import-errors").textContent = ""; $("#import-text").value = ""; $("#import-file").value = ""; $("#import-dialog").showModal(); }
  async function applyImport() {
    const dlg = $("#import-dialog");
    let text = $("#import-text").value;
    const f = $("#import-file").files[0];
    if (f) text = await f.text();
    const res = S.importJson(text);
    if (!res.ok) {
      $("#import-errors").textContent = `Import refused; the current scene stays. ${res.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`;
      if (!dlg.open) { dlg.showModal(); }
      return;
    }
    const before = S.clone(scn());
    app.scn = res.state;
    app.history.push("Import JSON", before);
    app.sampled = null; app.sampledAll.clear(); app.combo = null;
    if (dlg.open) dlg.close();
    $("#import-file").value = "";
    $("#example-select").value = view().example || "";
    syncTimeInputs();
    modelChanged();
    const stale = res.results.filter((r) => !r.compatible).length;
    notice(`Imported the scenario (digest ${S.modelDigest(scn())}). ${res.results.length} result snapshot(s)${stale ? `, ${stale} from other parameters and shown as stale only in the file` : ""}. Recalculate a dwell to see sampled results.`);
  }

  /* ===== COMMAND PALETTE ===== */
  function paletteEntries() {
    const s = scn(), out = [];
    for (const o of [...s.radars, ...s.targets]) out.push({ kind: "object", label: `Select ${o.id}`, run: () => selectObject(o.id) });
    for (const id of M.linkIds(s)) out.push({ kind: "link", label: `Link ${id}`, run: () => { selectLink(id); openCalc(id, true); $(`#row-${cssId(id)}`)?.scrollIntoView({ block: "nearest" }); } });
    for (const t of TABS) out.push({ kind: "view", label: `View: ${$(`#tab-${t}`).textContent}`, run: () => setTab(t) });
    for (const ex of DATA.examples.examples) out.push({ kind: "example", label: `Example: ${ex.title}`, run: () => loadExample(ex.id) });
    const cmds = [["Play or pause", () => setPlaying(!app.playing)], ["Restart time", () => setTime(0)], ["Calculate dwell", () => { setTab("rd"); calculateDwell(false); }], ["Calculate all channels", () => { setTab("rd"); calculateDwell(true); }], ["Cancel calculation", cancelJob], ["Export JSON", exportJson], ["Import JSON", openImport], ["Download beamdswitch report", downloadReport], ["Download Markdown record", downloadMarkdown], ["Copy Markdown record", copyMarkdown], ["Copy beamdswitch report", copyReport], ["Undo", undo], ["Redo", redo], ["Reset scene", resetScene], ["Fit scene", fitCamera], ["Expand all calculations", () => expandAll(true)], ["Collapse all calculations", () => expandAll(false)], ["Keyboard shortcuts", () => $("#shortcut-dialog").showModal()]];
    for (const [label, run] of cmds) out.push({ kind: "command", label, run });
    for (const d of $$("#controls [data-path]")) {
      const lab = d.closest("label")?.querySelector("span")?.textContent || d.dataset.path;
      out.push({ kind: "parameter", label: `${lab} — ${d.dataset.path}`, run: () => { const det = d.closest("details"); if (det) det.open = true; d.focus(); d.scrollIntoView({ block: "center" }); } });
    }
    return out;
  }
  let palItems = [], palIndex = 0;
  function openPalette() {
    const dlg = $("#palette");
    if (dlg.open) return;
    dlg.showModal();
    $("#palette-input").value = "";
    filterPalette();
    $("#palette-input").focus();
  }
  function filterPalette() {
    const q = $("#palette-input").value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    palItems = paletteEntries().filter((e) => words.every((w) => `${e.kind} ${e.label}`.toLowerCase().includes(w))).slice(0, 60);
    palIndex = 0;
    drawPalette();
  }
  function drawPalette() {
    const ul = $("#palette-list");
    ul.textContent = "";
    palItems.forEach((e, i) => {
      const li = h("li", { role: "option", id: `pal-${i}`, "aria-selected": String(i === palIndex), onclick: () => runPalette(i) }, h("span", {}, e.label), h("span", { class: "kind" }, e.kind));
      ul.append(li);
    });
    $("#palette-input").setAttribute("aria-activedescendant", palItems.length ? `pal-${palIndex}` : "");
    ul.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }
  function runPalette(i) { const e = palItems[i]; if (!e) return; $("#palette").close(); e.run(); }
  function expandAll(open) {
    const ids = M.linkIds(scn()).filter((id) => !$(`#row-${cssId(id)}`)?.hidden);
    for (const id of ids) openCalc(id, open);
  }

  /* ===== KEYBOARD ===== */
  function isTyping(el) { return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); }
  function bindKeys() {
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
      if (isTyping(document.activeElement)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " && !(document.activeElement && ["BUTTON", "A", "SUMMARY"].includes(document.activeElement.tagName))) { e.preventDefault(); setPlaying(!app.playing); }
      else if (e.key === "?") $("#shortcut-dialog").showModal();
      else if (e.key === ",") setTime(view().time_s - Number($("#step-size").value));
      else if (e.key === ".") setTime(view().time_s + Number($("#step-size").value));
      else if (e.key === "d" || e.key === "D") { if (view().selectedLink) openCalc(view().selectedLink); }
      else if (e.key === "Escape" && scene.drag) { scene.drag = null; }
    });
    $("#palette-input").addEventListener("input", filterPalette);
    $("#palette-input").addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { palIndex = Math.min(palItems.length - 1, palIndex + 1); drawPalette(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { palIndex = Math.max(0, palIndex - 1); drawPalette(); e.preventDefault(); }
      else if (e.key === "Enter") { runPalette(palIndex); e.preventDefault(); }
    });
  }

  /* ===== BINDINGS ===== */
  function bind() {
    const exSel = $("#example-select");
    exSel.append(h("option", { value: "" }, "Initial scene (36 links)"), ...DATA.examples.examples.map((e) => h("option", { value: e.id }, e.title)));
    exSel.addEventListener("change", () => loadExample(exSel.value));
    $("#example-reset").addEventListener("click", resetScene);
    $$("[data-preset]").forEach((b) => b.addEventListener("click", () => applyPreset(b.dataset.preset)));
    $("#open-palette").addEventListener("click", openPalette);
    $("#undo").addEventListener("click", undo);
    $("#redo").addEventListener("click", redo);
    $("#reset").addEventListener("click", resetScene);
    $("#export-json").addEventListener("click", exportJson);
    $("#import-json").addEventListener("click", openImport);
    $("#import-apply").addEventListener("click", applyImport);
    $("#import-file").addEventListener("change", () => { if ($("#import-file").files[0]) applyImport(); });
    $("#md-download").addEventListener("click", downloadMarkdown);
    $("#md-copy").addEventListener("click", copyMarkdown);
    $("#import-cancel").addEventListener("click", () => $("#import-dialog").close());
    $("#report-download").addEventListener("click", downloadReport);
    $("#report-copy").addEventListener("click", copyReport);
    $("#shortcuts").addEventListener("click", () => $("#shortcut-dialog").showModal());
    $("#play").addEventListener("click", () => setPlaying(!app.playing));
    $("#restart").addEventListener("click", () => { setPlaying(false); setTime(0, { push: true }); });
    $("#step-back").addEventListener("click", () => setTime(view().time_s - Number($("#step-size").value)));
    $("#step-fwd").addEventListener("click", () => setTime(view().time_s + Number($("#step-size").value)));
    $("#dwell-step").addEventListener("click", () => setTime(view().time_s + dwellDuration()));
    $("#rate").addEventListener("change", (e) => { view().rate = Number(e.target.value); });
    $("#step-size").addEventListener("change", (e) => { view().step_s = Number(e.target.value); });
    $("#time-slider").addEventListener("input", (e) => { setPlaying(false); setTime(Number(e.target.value)); });
    $("#time-num").addEventListener("change", (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) { setPlaying(false); setTime(v, { push: true }); } });
    $$("[data-mode]").forEach((b) => b.addEventListener("click", () => { view().mode = b.dataset.mode; if (view().mode === "move" && !view().selectedObject) notice("Select an object first (tap it in the scene or use the Selected object control), then drag it."); renderAll(false); }));
    $$("[data-plane]").forEach((b) => b.addEventListener("click", () => { view().editPlane = b.dataset.plane; renderAll(false); }));
    $$("[data-cam]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.cam; if (k === "fit") fitCamera(); else { Object.assign(view().camera, V.PRESETS[k]); if (k === "home") fitCamera(); else drawScene(); } }));
    $("#projection").addEventListener("click", () => { const c = view().camera; c.projection = c.projection === "orthographic" ? "perspective" : "orthographic"; renderAll(false); });
    $$("[data-orbit]").forEach((b) => b.addEventListener("click", () => { const [a, p] = b.dataset.orbit.split(",").map(Number); orbit(a, p); }));
    $$("[data-pan]").forEach((b) => b.addEventListener("click", () => { const [a, p] = b.dataset.pan.split(",").map(Number); pan(a, p); }));
    $$("[data-zoom]").forEach((b) => b.addEventListener("click", () => zoom(Number(b.dataset.zoom))));
    $("#center-sel").addEventListener("click", () => { const id = view().selectedObject || selectedLink()?.target; if (id) { view().camera.target_m = M.objectState(scn(), id, view().time_s).p; drawScene(); } });
    $("#follow-sel").addEventListener("click", () => { if (!view().selectedObject) return notice("Select an object to follow."); view().follow = !view().follow; renderAll(false); });
    $("#isolate-sel").addEventListener("click", () => { view().isolate = !view().isolate; renderAll(false); });
    $("#clear-sel").addEventListener("click", () => { view().selectedObject = null; view().follow = false; view().isolate = false; renderAll(true); });
    $$("[data-layer]").forEach((cb) => cb.addEventListener("change", () => { view().layers[cb.dataset.layer] = cb.checked; drawScene(); }));
    $("#surface-kind").addEventListener("change", (e) => { view().surfaceKind = e.target.value; if (e.target.value === "active") { view().layers.surfaces = true; computeActiveSurface(); } renderAll(false); });
    $("#expand-all").addEventListener("click", () => expandAll(true));
    $("#collapse-all").addEventListener("click", () => expandAll(false));
    $("#expand-selected").addEventListener("click", () => { if (view().selectedLink) openCalc(view().selectedLink, true); });
    $("#calc-search").addEventListener("input", updateTable);
    $("#link-body").addEventListener("click", (e) => {
      const b = e.target.closest("[data-toggle]");
      if (b) { selectLink(b.dataset.toggle); openCalc(b.dataset.toggle); }
    });
    $$("[role=tab]").forEach((t) => {
      t.addEventListener("click", () => setTab(t.id.slice(4)));
      t.addEventListener("keydown", (e) => {
        const i = TABS.indexOf(t.id.slice(4));
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]; setTab(n); $(`#tab-${n}`).focus(); e.preventDefault(); }
      });
    });
    window.addEventListener("popstate", () => { const notes = applyHash(); syncTimeInputs(); derive(); $("#example-select").value = view().example || ""; setTab(app.tab, false); renderAll(true); if (notes.length) notice(notes.join(" ")); });
    for (const mq of ["(prefers-color-scheme: dark)"]) { try { matchMedia(mq).addEventListener("change", () => { drawScene(); renderTab(); }); } catch (e) { /* old browsers */ } }
    new MutationObserver(() => { drawScene(); renderTab(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  /** View presets change presentation only: layers, tab and camera. */
  function applyPreset(p) {
    view().preset = p;
    if (p === "geometry") { Object.assign(view().layers, { beams: true, paths: true, trails: true, labels: true, clutter: true, velocity: true }); setTab("time"); }
    else if (p === "signal") { Object.assign(view().layers, { beams: false, paths: true, trails: false, labels: true, clutter: true, velocity: false }); setTab("rd"); }
    else { Object.assign(view().layers, { beams: true, paths: true, trails: false, labels: true, clutter: false, velocity: false }); view().isolate = true; setTab("coherent"); }
    renderAll(false);
  }

  /* ===== WEBMCP (read-only) ===== */
  function registerTools() {
    const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
    if (!mc || typeof mc.registerTool !== "function") return;
    const ro = { readOnlyHint: true };
    const out = (x) => ({ content: [{ type: "text", text: JSON.stringify(x) }] });
    const summary = (l) => ({ id: l.id, type: l.type, status: l.status, reasons: l.reasons, received_power_dBm: l.power ? l.power.PrdBm : null, rho1_dB: l.snr ? N.linToDb(l.snr.rho1) : null, margin_dB: l.detector ? l.detector.margin_dB : null, pd: l.detector ? l.detector.pd : null, delay_us: l.geometry.tauE * 1e6, doppler_Hz: l.geometry.fD });
    try {
      mc.registerTool({ name: "get_scenario", description: "Return the complete semantic scenario (SI units), its model digest, seed, example and scene time. All absolute values are synthetic.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: ro, execute: async () => out({ digest: S.modelDigest(scn()), state: scn() }) });
      mc.registerTool({ name: "list_links", description: "List every (transmitter, receiver, target) link at the current scene time with type, status and reasons, received power (dBm), single-pulse SNR (dB), margin (dB), predicted Pd under thermal noise, delay and Doppler.", inputSchema: { type: "object", properties: { status: { type: "string", enum: ["ok", "inactive", "incompatible", "outside-model"] } }, additionalProperties: false }, annotations: ro, execute: async (i = {}) => out({ time_s: view().time_s, links: app.links.filter((l) => !i.status || l.status === i.status).map(summary) }) });
      mc.registerTool({ name: "get_link", description: "Return one link's full manual calculation (objects, geometry, conversions, power equation, SNR, detector, margin, validity, sampled result) at a time (default: the current scene time).", inputSchema: { type: "object", properties: { id: { type: "string", description: "tx>rx:target, e.g. R1>R2:T3" }, time_s: { type: "number", minimum: 0 } }, required: ["id"], additionalProperties: false }, annotations: ro, execute: async ({ id, time_s }) => { if (!M.linkIds(scn()).includes(id)) return out({ error: "unknown link id" }); const L = M.evaluateLink(scn(), id, time_s ?? view().time_s); return out(CA.linkCalc(scn(), L, time_s === undefined ? sampledFor(id) : null)); } });
      mc.registerTool({ name: "get_checks", description: "Return the published MathWorks reference cases with this model's values and status, the domain invariants and the detector checks, and the checks that stay unverified.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: ro, execute: async () => out({ references: CK.references(DATA.references), invariants: CK.invariants(DATA.preset, DATA.examples, DATA.evidence), detector: CK.detectorChecks(), unverified: DATA.references.unverified }) });
      mc.registerTool({ name: "get_view", description: "Return the page's view: example, selected link and object, time, camera, layers, open calculations, tab and the URL that restores it.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: ro, execute: async () => out({ view: view(), tab: app.tab, url: location.href }) });
    } catch (e) { /* a host without full WebMCP support */ }
  }

  /* ===== API FOR VIEWS ===== */
  const api = {
    app, DATA, SOURCES, scn, view, selectedLink, notice, edit, setTime, selectLink, setTab, openCalc, loadExample,
    calculateDwell, calculateCombination, cancelJob, sampledFor, drawScene, computeActiveSurface, cssId, statusText,
    setChannel: (rx, tx) => { view().channel = { rx, tx }; app.mc = null; renderTab(); },
  };
  RN.appApi = api;

  /* ===== INITIALIZATION ===== */
  function init() {
    const notes = applyHash();
    bind();
    bindScene();
    bindKeys();
    $("#example-select").value = view().example || "";
    syncTimeInputs();
    derive();
    fitCamera();
    buildTable();
    renderControls();
    setTab(app.tab, false);
    renderAll(true);
    registerTools();
    if (notes.length) notice(notes.join(" "));
    document.documentElement.dataset.ready = "true";
  }
  try { init(); } catch (e) {
    console.error(e);
    const n = document.getElementById("notice");
    if (n) n.textContent = `The interactive page failed to start: ${e.message}. The static table stays.`;
  }
})();
