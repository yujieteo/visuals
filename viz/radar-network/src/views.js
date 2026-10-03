/* Radar network visualiser: the linked views under the tab strip.
 *
 * Each view reads the state, the analytic links and the stored sampled results through the app API and never
 * keeps a second copy of the model: exercises and checks call the same model functions as the table.
 */
(function () {
  "use strict";
  const RN = window.RadarNet;
  const { numerics: N, model: M, state: S, signal: G, calc: CA, checks: CK, ui: U } = RN;
  const { $, h } = U;
  const C0 = N.C;
  const fx = CA.fixed, tx = CA.txt;
  const db = (x) => (x > 0 ? 10 * Math.log10(x) : -Infinity);

  const views = {};
  const panel = (id) => $(`#panel-${id}`);

  /* ===== TIME PLOT ===== */
  let scanTimer = 0;
  function ensureScan(api) {
    const app = api.app, id = api.view().selectedLink;
    if (!id) return null;
    const key = `${app.digest}|${id}`;
    if (app.scan && app.scan.key === key) return app.scan;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const t0 = performance.now();
      const res = M.scanLink(api.scn(), id);
      app.scan = { key, res, ms: performance.now() - t0 };
      if (app.tab === "time") views.render("time", api);
    }, 30);
    return null;
  }
  const chartWidth = (id) => Math.max(300, Math.min(1100, panel(id).clientWidth || 640));
  function timeCharts(api, sc) {
    const s = sc.res, t = api.view().time_s, T = api.scn().scene.duration_s, width = chartWidth("time");
    const pts = (k) => s.series.map((p) => [p.t, p[k]]);
    const marks = s.crossings.map((c) => ({ x: c.t, label: "" }));
    return [
      U.lineChart({ title: "Received power", ylabel: "Received power P_r (dBm)", xlabel: "Scene time (s)", series: [{ pts: pts("PrdBm"), color: "var(--c1)" }], cursorX: t, xr: [0, T], marks, height: 170, width }),
      U.lineChart({ title: "Threshold margin", ylabel: "Margin to the required SNR (dB)", xlabel: "Scene time (s)", series: [{ pts: pts("margin"), color: "var(--c3)" }], refY: 0, refLabel: "threshold", cursorX: t, xr: [0, T], marks, points: s.crossings.map((c) => ({ x: c.t, y: 0, title: `${c.direction} at ${c.t.toFixed(3)} s` })), height: 170, width }),
      U.lineChart({ title: "Doppler", ylabel: "Doppler f_D (Hz)", xlabel: "Scene time (s)", series: [{ pts: pts("fD"), color: "var(--c2)" }], refY: 0, cursorX: t, xr: [0, T], height: 170, width }),
    ].join("");
  }
  views.time = {
    render(api) {
      const p = panel("time"), L = api.selectedLink();
      p.textContent = "";
      p.append(h("h2", {}, "Time plot of the selected link"));
      if (!L) { p.append(h("p", { class: "note" }, "Select a link.")); return; }
      p.append(h("p", { class: "note" }, `${L.id}: received power, threshold margin and Doppler over the scene. Analytic results at each sample time; the vertical line is the scene time.`));
      const sc = ensureScan(api);
      if (!sc) { p.append(h("p", { class: "note", role: "status" }, "Scanning the link over the scene…")); return; }
      const charts = h("div", { id: "time-charts", html: timeCharts(api, sc) });
      p.append(charts);
      const s = sc.res;
      p.append(h("h3", {}, "Threshold crossings"));
      p.append(s.crossings.length ? h("ul", {}, ...s.crossings.map((c) => h("li", {}, h("button", { type: "button", onclick: () => api.setTime(c.t, { push: true }) }, `t = ${c.t.toFixed(3)} s`), ` ${c.direction}`))) : h("p", { class: "note" }, "No sign change of the margin was found at the sample resolution."));
      if (s.near.length) p.append(h("p", { class: "status warn" }, `Unresolved near-threshold intervals: ${s.near.map((n) => `${n.from.toFixed(2)}–${n.to.toFixed(2)} s (extremum ${fx(n.margin, 3)} dB)`).join("; ")}. ${s.near[0].note}.`));
      p.append(h("p", { class: "note" }, `${s.note} Segments split at ${s.breakpoints.length - 2} trajectory or orientation breakpoint(s). Scan time ${Math.round(sc.ms)} ms.`));
    },
    update(api) {
      const el = $("#time-charts"), sc = api.app.scan;
      if (el && sc && sc.key === `${api.app.digest}|${api.view().selectedLink}`) el.innerHTML = timeCharts(api, sc);
      else if (!el || !sc) this.render(api);
    },
  };

  /* ===== DWELL CONTROLS (shared by the signal and range-Doppler views) ===== */
  function channelPicker(api) {
    const s = api.scn(), ch = api.view().channel || { rx: s.radars[0].id, tx: s.radars[0].id };
    const rx = h("select", { "aria-label": "Receiver", onchange: (e) => api.setChannel(e.target.value, ch.tx) }, ...s.radars.map((r) => h("option", { value: r.id, selected: r.id === ch.rx }, r.id)));
    const txs = h("select", { "aria-label": "Matched filter of transmitter", onchange: (e) => api.setChannel(ch.rx, e.target.value) }, ...s.radars.map((r) => h("option", { value: r.id, selected: r.id === ch.tx }, r.id)));
    return h("p", { class: "field-inline" }, "Channel: receiver ", rx, " with the matched filter of transmitter ", txs);
  }
  function dwellControls(api) {
    const app = api.app, s = api.scn(), ch = api.view().channel, t = api.view().time_s;
    const box = h("div", { class: "card" });
    box.append(channelPicker(api));
    let plan;
    try { plan = G.planChannel(s, ch.rx, ch.tx, t); } catch (e) { plan = { ok: false, reasons: [e.message] }; }
    if (plan.ok) {
      const est = G.estimate(plan);
      box.append(h("p", { class: "note" }, `Dwell start ${fx(t, 3)} s (the scene time), ${plan.pulses} pulses at PRF ${tx(1 / plan.pri)} Hz: ${fx(plan.dwell * 1000, 1)} ms. Window ${tx(plan.w0 * 1e3)}–${tx(plan.w1 * 1e3)} ms after each pulse start: ${plan.Nw} samples at F_s = ${tx(plan.Fs / 1e6)} MHz. ${plan.contributors.length} contributors (${plan.excluded.length} left out with reasons).`),
        h("p", { class: "note" }, `Resource estimate: ${fx(est.bytes / 2 ** 20, 1)} MiB of ${fx(est.limit / 2 ** 20, 0)} MiB working memory; about ${tx(est.ops, 2)} floating-point operations; FFT length ${est.fftLength}. Nothing is reduced: every pulse, sample, target and patch is processed.`),
        h("p", { class: "note" }, plan.approximation));
      if (!est.ok) box.append(h("p", { class: "status bad" }, `Refused: needs ${fx(est.bytes / 2 ** 20, 1)} MiB; the working-memory target is 256 MiB.`));
    } else box.append(h("p", { class: "status bad" }, `This channel cannot be processed: ${plan.reasons.join("; ")}`));
    const busy = !!app.job;
    box.append(h("div", { class: "progress" },
      h("button", { type: "button", class: "primary", disabled: busy || !plan.ok, onclick: () => api.calculateDwell(false) }, "Calculate dwell"),
      h("button", { type: "button", disabled: busy, onclick: () => api.calculateDwell(true) }, "Calculate all channels"),
      h("button", { type: "button", disabled: !busy, onclick: api.cancelJob }, "Cancel"),
      h("progress", { id: "dwell-progress", max: "1", value: app.progress ? String(app.progress.done / Math.max(1, app.progress.total)) : "0", "aria-label": "Calculation progress" }),
      h("span", { id: "dwell-progress-text", class: "note", role: "status" }, app.progress ? `Calculating ${app.progress.label}…` : app.workerFailed ? "Runs on the main thread (no worker in this context)." : "Runs in a local worker.")));
    return box;
  }
  function currentDwell(api) {
    const ch = api.view().channel, app = api.app;
    return app.sampledAll.get(`${ch.rx}>${ch.tx}`) || (app.sampled && app.sampled.rx === ch.rx && app.sampled.tx === ch.tx ? app.sampled : null);
  }
  function staleBanner(rec) {
    if (!rec) return null;
    if (rec.stale) return h("p", { class: "stale", role: "status" }, `Result from previous parameters (model digest ${rec.digest}). Recalculate the dwell for the current values.`);
    return null;
  }
  views.progress = (api) => {
    const p = $("#dwell-progress"), tt = $("#dwell-progress-text"), pr = api.app.progress;
    if (p && pr) { p.value = String(pr.done / Math.max(1, pr.total)); tt.textContent = `Calculating ${pr.label}: ${pr.done} of ${pr.total} steps`; }
  };

  /* ===== RECEIVED SIGNAL ===== */
  function linePlot(canvas, series, xr, xlabel, ylabel) {
    const set = U.setupCanvas(canvas);
    if (!set) return;
    const { ctx, w, h: H } = set, m = { l: 52, r: 10, t: 18, b: 28 };
    const all = series.flatMap((s) => Array.from(s.y).filter(Number.isFinite));
    let y0 = Math.min(...all), y1 = Math.max(...all);
    if (!(y1 > y0)) { y0 -= 1; y1 += 1; }
    const Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    ctx.strokeStyle = U.token("--grid"); ctx.fillStyle = U.token("--muted"); ctx.font = `11px ${U.token("--mono")}`;
    for (let k = 0; k <= 4; k++) { const v = y0 + ((y1 - y0) * k) / 4; ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(w - m.r, Y(v)); ctx.stroke(); ctx.fillText(v.toFixed(0), 4, Y(v) + 4); }
    for (let k = 0; k <= 5; k++) { const v = xr[0] + ((xr[1] - xr[0]) * k) / 5; ctx.fillText(v.toFixed(0), m.l + (k / 5) * (w - m.l - m.r) - 8, H - 8); }
    ctx.font = `600 11px ${U.token("--sans")}`; ctx.fillText(ylabel, m.l, 12); ctx.textAlign = "right"; ctx.fillText(xlabel, w - m.r, H - 16); ctx.textAlign = "left";
    for (const s of series) {
      // Max-in-pixel downsampling for display only.
      const n = s.y.length, px = Math.max(1, Math.floor(w - m.l - m.r));
      ctx.strokeStyle = U.token(s.color); ctx.lineWidth = 1.2; ctx.beginPath();
      for (let p = 0; p < px; p++) {
        const i0 = Math.floor((p / px) * n), i1 = Math.max(i0 + 1, Math.floor(((p + 1) / px) * n));
        let v = -Infinity;
        for (let i = i0; i < i1; i++) if (s.y[i] > v) v = s.y[i];
        const x = m.l + p, y = Y(Math.max(y0, v));
        if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  views.signal = {
    render(api) {
      const p = panel("signal"), s = api.scn(), ch = api.view().channel;
      p.textContent = "";
      p.append(h("h2", {}, "Received signal before and after matched filtering"));
      p.append(dwellControls(api));
      const ref = s.radars.find((r) => r.id === ch.tx), rx = s.radars.find((r) => r.id === ch.rx);
      const w = G.waveform(ref.tx, rx.rx.sampleRate_Hz), mf = G.matchedFilter(w), fd = G.fdCheck(ref.tx.waveform === "lfm" ? ref.tx.bandwidth_Hz : 2 / ref.tx.pulse_s, rx.rx.sampleRate_Hz);
      const lim = M.waveformLimits(ref);
      p.append(h("div", { class: "grid2" },
        h("div", { class: "card" }, h("h3", {}, `Waveform of ${ref.id}`), h("ul", {},
          h("li", {}, ref.tx.waveform === "lfm" ? `LFM ${ref.tx.chirp}-chirp: μ = ${ref.tx.chirp === "down" ? "−" : "+"}B/τ = ${tx(w.mu)} Hz/s, phase π μ (t − τ/2)², constant envelope` : "Rectangular pulse, constant envelope"),
          h("li", {}, `${w.durationNote}; energy E = Σ|w|² = ${tx(w.E)}`),
          h("li", {}, `Matched filter: ${mf.rule}; Σ|h|² = ${tx(mf.energy, 6)}, so the output noise variance equals the input variance k T_s F_s.`),
          h("li", {}, `Fractional delay: ${fd.rule}; largest amplitude error ${tx(fd.amp_dB, 2)} dB, phase error ${tx(fd.phase_deg, 2)}°.`),
          ref.tx.waveform === "rect" ? h("li", {}, `Discretisation limit: a rectangular pulse is not band-limited. At F_s = ${tx(rx.rx.sampleRate_Hz / 1e6)} MHz its sinc spectrum is cut, and the band-limited delay filter rings at the edges. Its resolution uses the pulse-width convention c τ/2 = ${tx(lim.rangeResolution)} m.`) : h("li", {}, `Nominal resolution c/(2B) = ${tx(lim.rangeResolution)} m; τB = ${tx(lim.timeBandwidth)}.`))),
        h("div", { class: "card" }, h("h3", {}, `Receiver ${rx.id} samples`), h("ul", {},
          h("li", {}, `Complex sample rate F_s = ${tx(rx.rx.sampleRate_Hz / 1e6)} MHz; noise E|n|² = k T_s F_s = ${tx(N.K_B * M.systemTemperature(rx.rx).Ts * rx.rx.sampleRate_Hz)} W; each quadrature k T_s F_s / 2.`),
          h("li", {}, "The channel holds every active echo, clutter patch, direct path, self-leakage and noise. Other transmitters stay in it as interference; the receiver uses no hidden target labels."),
          h("li", {}, "Geometric Doppler is applied once, through the per-sample path delay of the carrier phase.")))));
      const rec = currentDwell(api), b = staleBanner(rec);
      if (b) p.append(b);
      if (!rec || !rec.result?.ok) { p.append(h("p", { class: "note" }, rec ? `Not calculated: ${(rec.result?.reasons || []).join("; ")}` : "No dwell for this channel yet: use Calculate dwell.")); return; }
      const r = rec.result, n = r.Nw;
      const raw = new Float64Array(n), out = new Float64Array(n), s2 = N.K_B * M.systemTemperature(rx.rx).Ts * rx.rx.sampleRate_Hz;
      for (let i = 0; i < n; i++) { raw[i] = db((r.rawPulse.re[i] ** 2 + r.rawPulse.im[i] ** 2) / s2); out[i] = db((r.mfPulse.re[i] ** 2 + r.mfPulse.im[i] ** 2) / s2); }
      const c1 = h("canvas", { class: "plot-canvas", role: "img", "aria-label": `Pulse ${r.showPulse} before matched filtering: power relative to the noise variance, dB, against delay.` });
      const c2 = h("canvas", { class: "plot-canvas", role: "img", "aria-label": `Pulse ${r.showPulse} after matched filtering: power relative to the noise variance, dB, against delay.` });
      p.append(h("h3", {}, `Pulse ${r.showPulse} of the dwell at ${fx(rec.t0, 3)} s`), c1, h("p", { class: "note" }, "Before the matched filter: |x|²/σ² (dB). Display downsampling keeps the largest value in each pixel; processing uses every sample."), c2, h("p", { class: "note" }, "After the unit-energy matched filter: |y|²/σ² (dB). A target's peak rises above the noise by its single-pulse SNR ρ₁."));
      requestAnimationFrame(() => {
        const xr = [r.w0 * 1e6, (r.w0 + n / r.Fs) * 1e6];
        linePlot(c1, [{ y: raw, color: "--c1" }], xr, "Delay in the window (μs)", "|x|²/σ² (dB)");
        linePlot(c2, [{ y: out, color: "--c3" }], xr, "Delay in the window (μs)", "|y|²/σ² (dB)");
      });
    },
    update() {},
  };

  /* ===== RANGE-DOPPLER ===== */
  let rdSel = null;
  function drawRD(canvas, rec, api) {
    const set = U.setupCanvas(canvas);
    if (!set) return null;
    const { ctx, w, h: H } = set, r = rec.result, m = { l: 56, r: 10, t: 16, b: 32 };
    const P = r.pulses, n = r.Nw, half = Math.floor(P / 2);
    const lo = 0, hi = 40;
    const val = (ix, iy) => { const k = (iy - half + P) % P; return 10 * Math.log10(r.power[k * n + ix] + 1e-30); };
    const map = U.heatmap(ctx, { x: m.l, y: m.t, w: w - m.l - m.r, h: H - m.t - m.b }, n, P, val, lo, hi);
    ctx.fillStyle = U.token("--muted"); ctx.font = `11px ${U.token("--mono")}`;
    const R = (ix) => (C0 * (r.w0 + ix / r.Fs)) / 2 / 1000;
    for (let k = 0; k <= 5; k++) { const ix = Math.round((k / 5) * (n - 1)); ctx.fillText(R(ix).toFixed(0), m.l + (k / 5) * map.w - 8, H - 18); }
    const prf = 1 / r.pri;
    for (const f of [-prf / 2, 0, prf / 2 - prf / P]) { const iy = Math.round((f * P) / prf) + half; ctx.fillText(f.toFixed(0), 4, m.t + map.h - ((iy + 0.5) / P) * map.h + 4); }
    ctx.font = `600 11px ${U.token("--sans")}`;
    ctx.fillText("Aliased Doppler (Hz)", m.l, 11);
    ctx.textAlign = "right"; ctx.fillText("Apparent equivalent range (R_t + R_r)/2 (km)", w - m.r, H - 4); ctx.textAlign = "left";
    const pos = (lag, bin) => { const iy = (bin + half) % P; return [m.l + ((lag + 0.5) / n) * map.w, m.t + map.h - ((iy + 0.5) / P) * map.h]; };
    ctx.lineWidth = 1.5;
    for (const c of r.cells) {
      if (!c.inWindow) continue;
      const [x, y] = pos(c.lag, c.bin);
      ctx.strokeStyle = U.token("--fg"); ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = U.token("--fg"); ctx.fillText(c.target, x + 8, y - 6);
    }
    if (rdSel) { const [x, y] = pos(rdSel.lag, rdSel.bin); ctx.strokeStyle = U.token("--hl"); ctx.strokeRect(x - 5, y - 5, 10, 10); }
    return { m, map, P, n, half, pos };
  }
  function rdReadout(rec) {
    const r = rec.result;
    if (!rdSel) return "Select a cell: click the map, or focus it and use the arrow keys.";
    const k = rdSel.bin, i = rdSel.lag, pw = r.power[k * r.Nw + i];
    const f = G.binFreq({ pulses: r.pulses, pri: r.pri }, k);
    const hit = r.cells.find((c) => c.lag === i && c.bin === k);
    return `Cell lag ${i} (apparent delay ${tx((r.w0 + i / r.Fs) * 1e6)} μs, equivalent range ${tx((C0 * (r.w0 + i / r.Fs)) / 2 / 1000)} km), Doppler bin ${k} (${tx(f)} Hz): |Y|²/σ² = ${tx(pw)} (${fx(db(pw), 2)} dB) against η = ${tx(r.eta)}: ${pw > r.eta ? "above the threshold in this realisation" : "below the threshold"}.${hit ? ` Expected cell of ${hit.id}.` : ""}`;
  }
  views.rd = {
    render(api) {
      const p = panel("rd"), s = api.scn();
      p.textContent = "";
      p.append(h("h2", {}, "Range–Doppler map of the combined received scene"));
      p.append(dwellControls(api));
      const rec = currentDwell(api), b = staleBanner(rec);
      if (b) p.append(b);
      if (!rec || !rec.result?.ok) { p.append(h("p", { class: "note" }, rec ? `Not calculated: ${(rec.result?.reasons || []).join("; ")}` : "No dwell for this channel yet: use Calculate dwell.")); return; }
      const r = rec.result, ref = s.radars.find((x) => x.id === rec.tx), lim = M.waveformLimits(ref);
      const canvas = h("canvas", { class: "plot-canvas rd-canvas", tabindex: "0", role: "img", "aria-label": "Range-Doppler map. Arrow keys move the selected cell; the readout below gives its value." });
      const readout = h("p", { class: "inset num", role: "status", "aria-live": "polite" });
      p.append(canvas, readout,
        h("p", { class: "note" }, `Colour: |Y|²/σ² from 0 dB to 40 dB (thermal noise has unit mean). Display downsampling keeps the largest value in each pixel; the processing uses all ${r.pulses} × ${r.Nw} cells. Circles mark the expected cells of ${rec.tx}'s echoes; the receiver itself uses no target labels.`));
      let geo = null;
      const redraw = () => { geo = drawRD(canvas, rec, api); readout.textContent = rdReadout(rec); };
      requestAnimationFrame(redraw);
      canvas.addEventListener("click", (e) => {
        if (!geo) return;
        const rc = canvas.getBoundingClientRect(), x = e.clientX - rc.left - geo.m.l, y = e.clientY - rc.top - geo.m.t;
        if (x < 0 || y < 0 || x > geo.map.w || y > geo.map.h) return;
        const lag = Math.min(r.Nw - 1, Math.floor((x / geo.map.w) * r.Nw)), iy = Math.min(r.pulses - 1, Math.floor(((geo.map.h - y) / geo.map.h) * r.pulses));
        rdSel = { lag, bin: (iy - geo.half + r.pulses) % r.pulses };
        // Snap to the strongest cell within 3 lags so a click on a narrow peak finds it.
        let best = rdSel.lag;
        for (let d = -3; d <= 3; d++) { const l = rdSel.lag + d; if (l >= 0 && l < r.Nw && r.power[rdSel.bin * r.Nw + l] > r.power[rdSel.bin * r.Nw + best]) best = l; }
        rdSel.lag = best;
        redraw();
      });
      canvas.addEventListener("keydown", (e) => {
        if (!rdSel) rdSel = r.cells[0] ? { lag: r.cells[0].lag, bin: r.cells[0].bin } : { lag: 0, bin: 0 };
        const step = e.shiftKey ? 50 : 1;
        if (e.key === "ArrowLeft") rdSel.lag = Math.max(0, rdSel.lag - step);
        else if (e.key === "ArrowRight") rdSel.lag = Math.min(r.Nw - 1, rdSel.lag + step);
        else if (e.key === "ArrowUp") rdSel.bin = (rdSel.bin + 1) % r.pulses;
        else if (e.key === "ArrowDown") rdSel.bin = (rdSel.bin - 1 + r.pulses) % r.pulses;
        else return;
        e.preventDefault(); redraw();
      });
      // Target cells: every part measured at the same processing stage.
      const tb = h("table", {}, h("thead", {}, h("tr", {}, ...["Echo of", "Lag", "Doppler bin (Hz)", "Pulse offset", "Range walk (m)", "Signal |s|²/σ²", "Clutter", "Interference", "Noise σ̂²", "SINR (approx.)", "Statistic", "Detection"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", {}, ...r.cells.map((c) => h("tr", {}, h("td", {}, h("button", { type: "button", class: "linkbtn", onclick: () => { rdSel = { lag: c.lag, bin: c.bin }; redraw(); } }, c.id)), h("td", { class: "num" }, String(c.lag)), h("td", { class: "num" }, `${c.bin} (${tx(c.binDoppler)})`), h("td", { class: "num" }, String(c.pulseOffset)), h("td", { class: "num" }, tx(c.walk_m)),
          h("td", { class: "num" }, `${fx(db(c.thermalSnr), 2)} dB`), h("td", { class: "num" }, `${fx(db(c.clutterPower), 2)} dB`), h("td", { class: "num" }, `${fx(db(c.interferencePower), 2)} dB`), h("td", { class: "num" }, tx(c.noisePower)), h("td", { class: "num" }, `${fx(db(c.sinr), 2)} dB`), h("td", { class: "num" }, tx(c.statistic)), h("td", {}, c.inWindow ? (c.detected ? "✓ detected (realised)" : "✗ not detected (realised)") : "outside the window")))));
      p.append(h("h3", {}, "Echo cells"), h("div", { class: "table-scroll" }, tb));
      p.append(h("p", { class: "note" }, `Thermal SNR, clutter power, interference power and measured noise are separate. The SINR substitution is an approximation, not a calibrated detection probability. Noise measured on ${r.noise.probes} probe cells: σ̂² = ${tx(r.noise.measured)} (expected 1). ${r.detections} of ${r.cellsTotal} cells exceed η = ${tx(r.eta)} in this realisation.`));
      p.append(h("div", { class: "card" }, h("h3", {}, "Processing settings and limits"), h("ul", {},
        h("li", {}, `Slow-time DFT over ${r.pulses} pulses, ${r.window.rule}: coherent gain ${tx(r.window.gain)} (window loss ${fx(r.window.loss_dB, 2)} dB against rectangular).`),
        h("li", {}, `Nominal range resolution ${tx(lim.rangeResolution)} m (${lim.resolutionRule}); slow-time resolution PRF/N = ${tx(lim.dopplerResolution)} Hz.`),
        h("li", {}, `Unambiguous range c/(2 PRF) = ${tx(lim.unambiguousRange / 1000)} km (equivalent range); Doppler is aliased into ±${tx(lim.unambiguousDoppler / 2)} Hz. Late echoes keep their pulse index (pulse offset).`),
        h("li", {}, `Contributors left out: ${r.excluded.length ? r.excluded.map((x) => `${x.label} (${x.reason})`).slice(0, 12).join("; ") + (r.excluded.length > 12 ? "; …" : "") : "none"}.`),
        h("li", {}, `Measured: ${r.ms} ms for this channel in this browser.`))));
      // Monte Carlo for the selected link's cell.
      const L = api.selectedLink(), cell = L && r.cells.find((c) => c.id === L.id);
      const mcBox = h("div", { class: "card" }, h("h3", {}, "Seeded Monte Carlo at the selected link's cell"));
      if (!cell) mcBox.append(h("p", { class: "note" }, `Select a link whose transmitter is ${rec.tx} and receiver ${rec.rx}.`));
      else {
        mcBox.append(h("p", { class: "note" }, `Trials redraw the thermal noise (and the fluctuation and phase draws of the selected models) at ${cell.id}'s cell and keep the dwell's clutter and interference. Seed ${s.seed}, ${s.processing.trials} trials, Wilson 95% intervals.`));
        mcBox.append(h("button", { type: "button", onclick: () => {
          const plan = G.planChannel(S.clone(s), rec.rx, rec.tx, rec.t0);
          if (!plan.ok) { api.notice(plan.reasons.join("; "), "err"); return; }
          api.app.mc = { id: cell.id, res: G.monteCarlo(plan, cell, { trials: s.processing.trials, eta: r.eta, seed: s.seed }), stale: rec.stale };
          views.rd.render(api);
        } }, `Estimate P_d and P_fa (${s.processing.trials} trials)`));
        const mc = api.app.mc;
        if (mc && mc.id === cell.id) {
          const R = mc.res;
          mcBox.append(h("p", { class: "num" }, `P_d ≈ ${fx(R.pd.p, 4)} (95% ${fx(R.pd.lo, 4)} to ${fx(R.pd.hi, 4)}), ${R.hits} of ${R.trials}; P_fa ≈ ${fx(R.pfa.p, 4)} (95% ${tx(R.pfa.lo, 2)} to ${tx(R.pfa.hi, 2)}), ${R.falseAlarms} of ${R.trials}.`), h("p", { class: "note" }, `${R.note} Analytic P_d (thermal noise, no clutter): ${L.detector ? CA.pdTxt(L.detector) : "—"}.`));
        }
      }
      p.append(mcBox);
    },
    update() {},
  };

  /* ===== AMBIGUITY ===== */
  const ambCache = new Map();
  views.amb = {
    render(api) {
      const p = panel("amb"), s = api.scn(), ch = api.view().channel;
      const ref = s.radars.find((r) => r.id === ch.tx), rx = s.radars.find((r) => r.id === ch.rx);
      p.textContent = "";
      p.append(h("h2", {}, `Delay–Doppler ambiguity of ${ref.id}'s waveform`), channelPicker(api));
      const w = G.waveform(ref.tx, rx.rx.sampleRate_Hz);
      const span = ref.tx.waveform === "lfm" ? Math.min(ref.tx.bandwidth_Hz, 0.4 * rx.rx.sampleRate_Hz) : Math.min(4 / ref.tx.pulse_s, 0.4 * rx.rx.sampleRate_Hz);
      const key = JSON.stringify([ref.tx.waveform, ref.tx.chirp, ref.tx.pulse_s, ref.tx.bandwidth_Hz, rx.rx.sampleRate_Hz]);
      const canvas = h("canvas", { class: "plot-canvas rd-canvas", role: "img", "aria-label": "Ambiguity function magnitude in dB against delay and Doppler." });
      p.append(canvas, h("p", { class: "note" }, `|χ(τ, f_d)| normalised to 1 at the origin, from −40 dB to 0 dB, delay ±${tx(ref.tx.pulse_s * 1e6)} μs and Doppler ±${tx(span / 1e6)} MHz. ${ref.tx.waveform === "lfm" ? "The LFM ridge couples delay and Doppler: a Doppler shift f moves the peak by f/μ." : "The rectangular pulse has its delay–Doppler response in one central lobe."} The waveform ambiguity is separate from the multi-target received map.`));
      setTimeout(() => {
        let a = ambCache.get(key);
        if (!a) { a = G.ambiguity(w, span, 96, Math.max(1, Math.ceil(w.n / 120))); ambCache.set(key, a); }
        const set = U.setupCanvas(canvas);
        if (!set) return;
        const { ctx, w: W, h: H } = set, m = { l: 56, r: 10, t: 16, b: 32 };
        U.heatmap(ctx, { x: m.l, y: m.t, w: W - m.l - m.r, h: H - m.t - m.b }, a.lags.length, a.nDop, (ix, iy) => 20 * Math.log10(a.values[ix * a.nDop + iy] + 1e-12), -40, 0);
        ctx.fillStyle = U.token("--muted"); ctx.font = `600 11px ${U.token("--sans")}`;
        ctx.fillText("Doppler (MHz)", m.l, 11); ctx.textAlign = "right"; ctx.fillText("Delay τ (μs)", W - m.r, H - 4); ctx.textAlign = "left";
        ctx.font = `11px ${U.token("--mono")}`;
        ctx.fillText((-ref.tx.pulse_s * 1e6).toFixed(0), m.l, H - 18); ctx.fillText((ref.tx.pulse_s * 1e6).toFixed(0), W - m.r - 20, H - 18);
        ctx.fillText((span / 1e6).toFixed(1), 4, m.t + 10); ctx.fillText((-span / 1e6).toFixed(1), 4, H - m.b);
      }, 0);
    },
    update() {},
  };

  /* ===== COHERENT COMPARISON ===== */
  function phasorSvg(rows, sum) {
    const R = 110, all = rows.map((r) => Math.hypot(r[0], r[1])).concat([Math.hypot(sum[0], sum[1])]), k = (0.9 * R) / Math.max(...all, 1e-12);
    let s = `<svg class="chart phasor" viewBox="${-R} ${-R} ${2 * R} ${2 * R}" role="img" aria-label="Phasors of each aligned channel and their sum"><circle cx="0" cy="0" r="${R - 2}" style="fill:none;stroke:var(--grid)"/><line x1="${-R}" x2="${R}" y1="0" y2="0" style="stroke:var(--axis)"/><line y1="${-R}" y2="${R}" x1="0" x2="0" style="stroke:var(--axis)"/>`;
    const colors = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"], dashes = ["", "6 3", "2 3", "8 3 2 3"];
    let x = 0, y = 0;
    rows.forEach((r, i) => { const nx = x + r[0] * k, ny = y - r[1] * k; s += `<line x1="${x}" y1="${y}" x2="${nx}" y2="${ny}" style="stroke:${colors[i % 4]};stroke-width:2" stroke-dasharray="${dashes[i % 4]}"/>`; x = nx; y = ny; });
    s += `<line x1="0" y1="0" x2="${sum[0] * k}" y2="${-sum[1] * k}" style="stroke:var(--fg);stroke-width:2.5"/><circle cx="${sum[0] * k}" cy="${-sum[1] * k}" r="3.5" style="fill:var(--fg)"/></svg>`;
    return s;
  }
  views.coherent = {
    render(api) {
      const p = panel("coherent"), s = api.scn(), net = s.network, t = api.view().time_s;
      p.textContent = "";
      p.append(h("h2", {}, "Coherent site combination and power comparison"));
      p.append(h("p", { class: "note" }, `Mode: ${({ separate: "separate results (default)", ideal: "coherent, ideal calibration", error: "coherent, explicit errors" })[net.mode]}. Target ${net.target}; waveform of ${net.transmitter}; receivers ${net.receivers.join(", ")}. Change them in Controls → Network.`));
      // Analytic combination.
      const tr = s.radars.find((r) => r.id === net.transmitter), fc = tr.tx.carrier_Hz;
      const rows = [], refused = [];
      for (const rxId of net.receivers) {
        const L = M.evaluateLink(s, M.linkId(net.transmitter, rxId, net.target), t);
        const grp = M.groupKey(s, net.transmitter, rxId);
        if (L.status !== "ok" || !L.snr) { refused.push(`${L.id}: ${L.reasons.join("; ") || L.status}`); continue; }
        const e = net.mode === "error" ? net.errors[rxId] ?? {} : {};
        const eps = net.mode === "error" ? N.rad((e.phase_deg ?? 0) + (e.scatter_deg ?? 0)) - 2 * Math.PI * fc * (e.clock_s ?? 0) : 0;
        const rho = L.snr.integration === "coherent" ? L.snr.rhoN : L.snr.rho1 * L.snr.pulses;
        rows.push({ id: L.id, rx: rxId, rho, eps, grp });
      }
      const groups = [...new Set(rows.map((r) => r.grp))];
      const card = h("div", { class: "card" }, h("h3", {}, "Analytic: aligned complex sum"));
      if (net.mode === "separate") card.append(h("p", { class: "note" }, "Separate results: no channels are combined. The table below compares their powers only."));
      else if (groups.length > 1) card.append(h("p", { class: "status bad" }, `Not one coherent group: ${groups.join(" / ")}. Coherent combination is refused; use the power comparison.`));
      else if (rows.length) {
        const comb = M.combineSnr(rows.map((r) => r.rho), rows.map((r) => r.eps));
        const ideal = Math.pow(rows.reduce((a, r) => a + Math.sqrt(r.rho), 0), 2) / rows.length;
        const ph = rows.map((r) => [Math.sqrt(r.rho) * Math.cos(r.eps), Math.sqrt(r.rho) * Math.sin(r.eps)]);
        card.append(h("div", { class: "grid2" }, h("div", { html: phasorSvg(ph, [comb.sumRe, comb.sumIm]) }), h("div", {},
          h("p", {}, `Group: ${groups[0]}`),
          h("ul", {}, ...rows.map((r, i) => h("li", { class: "num" }, `${["solid", "dashed", "dotted", "dash-dot"][i % 4]} ${r.id}: ρ = ${fx(db(r.rho), 2)} dB, residual phase ${fx(N.deg(r.eps), 2)}°`))),
          h("p", { class: "num" }, `|Σ wₘ√ρₘ e^{iεₘ}|² / (wᴴ Cₙ w) = ${tx(comb.num)} / ${tx(comb.den)} = ${tx(comb.snr)} (${fx(db(comb.snr), 2)} dB)`),
          h("p", { class: "num" }, `Ideal calibration (all ε = 0): ${tx(ideal)} (${fx(db(ideal), 2)} dB). Loss from errors: ${fx(db(ideal) - db(comb.snr), 2)} dB.`),
          h("p", { class: "note" }, "Equal weights; Cₙ = I for independent receiver thermal noise (every channel is a different receiver). The analytic sum uses the phase and clock errors; delay and frequency errors appear in the sampled result."))));
      }
      if (refused.length) card.append(h("p", { class: "note" }, `Left out: ${refused.join("; ")}`));
      p.append(card);
      // Sampled combination.
      const sc = h("div", { class: "card" }, h("h3", {}, "Sampled: aligned channel outputs"));
      sc.append(h("p", {}, h("button", { type: "button", class: "primary", disabled: !!api.app.job || net.mode === "separate", onclick: api.calculateCombination }, "Calculate combination"), " ", h("button", { type: "button", disabled: !api.app.job, onclick: api.cancelJob }, "Cancel"), " ", h("span", { class: "note", role: "status" }, api.app.progress && /combination/.test(api.app.progress.label) ? "Calculating…" : "")));
      const co = api.app.combo;
      if (co) {
        if (co.stale) sc.append(h("p", { class: "stale" }, `Result from previous parameters (digest ${co.digest}).`));
        const r = co.result;
        if (!r.ok) sc.append(h("p", { class: "status bad" }, `Refused: ${(r.reasons || []).join("; ")}`));
        else {
          const tb = h("table", {}, h("thead", {}, h("tr", {}, ...["Receiver", "Lag", "Bin", "|s|²/σ²", "Alignment phase (°)", "Residual phase (°)"].map((x) => h("th", {}, x)))), h("tbody", {}, ...r.rows.map((x) => h("tr", {}, h("td", {}, x.rx), h("td", { class: "num" }, String(x.lag)), h("td", { class: "num" }, String(x.bin)), h("td", { class: "num" }, tx(x.snr)), h("td", { class: "num" }, fx(N.deg(x.alignPhase), 2)), h("td", { class: "num" }, fx(N.deg(Math.atan2(Math.sin(x.residualPhase), Math.cos(x.residualPhase))), 2))))));
          sc.append(h("div", { class: "table-scroll" }, tb),
            h("p", { class: "num" }, `Combined signal SNR ${tx(r.combinedSnr)} (${fx(db(r.combinedSnr), 2)} dB); with noise and interference the statistic is ${tx(r.combinedStatistic)}. Ideal bound (Σ√ρ)²/M = ${tx(r.idealBound)}.`),
            h("p", { class: "num" }, `Cₙ = [${r.Cn.map((row) => row.join(" ")).join("; ")}], wᴴ Cₙ w = ${r.den}. ${r.noiseModel}.`),
            h("p", { class: "note" }, `${r.note} Power sum: ${tx(r.powerSum)}.`));
          if (r.refused.length) sc.append(h("p", { class: "note" }, `Refused channels: ${r.refused.map((x) => `${x.rx} (${x.reason})`).join("; ")}`));
        }
      } else sc.append(h("p", { class: "note" }, "No sampled combination yet."));
      p.append(sc);
      // Power comparison for every channel of the target.
      const all = M.linkIds(s).filter((id) => id.endsWith(`:${net.target}`)).map((id) => api.app.linkMap.get(id) || M.evaluateLink(s, id, t));
      p.append(h("div", { class: "card" }, h("h3", {}, `Power comparison for ${net.target} (not a coherent sum)`),
        h("div", { class: "table-scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ...["Link", "Group", "ρ₁ (dB)", "Status"].map((x) => h("th", {}, x)))), h("tbody", {}, ...all.map((L) => h("tr", {}, h("td", {}, L.id), h("td", { class: "note" }, M.groupKey(s, L.tx, L.rx)), h("td", { class: "num" }, L.snr ? fx(db(L.snr.rho1), 2) : "—"), h("td", {}, L.status === "ok" ? "valid" : `${api.statusText[L.status]}: ${L.reasons.join("; ")}`))))))));
    },
    update() {},
  };

  /* ===== EVIDENCE ===== */
  let evFig = null;
  views.evidence = {
    render(api) {
      const E = api.DATA.evidence, p = panel("evidence");
      evFig = evFig || E.dataset.default_figure;
      p.textContent = "";
      p.append(h("h2", {}, "Evidence: NASA F-117 aluminum-model curves"));
      p.append(h("div", { class: "callout" }, h("p", { style: "margin:0" }, h("strong", {}, "Separate evidence. "), `${E.dataset.units}, ${E.dataset.reference.toLowerCase()}. ${E.dataset.transfer_limit} These values are never converted to dBsm or m² and never enter a power or range result.`)));
      p.append(h("span", { class: "seg", role: "group", "aria-label": "Frequency" }, ...E.dataset.figures.map((f) => h("button", { type: "button", "aria-pressed": String(f.id === evFig), onclick: () => { evFig = f.id; views.evidence.render(api); } }, `${f.frequency_ghz} GHz`))));
      const fig = E.dataset.figures.find((f) => f.id === evFig);
      const ser = E.series.filter((x) => x.figure_id === evFig);
      const series = ser.map((x, i) => ({ pts: x.segments.flatMap((seg, j) => [...seg.map((q) => [q[0], q[1]]), ...(j < x.segments.length - 1 ? [[NaN, NaN]] : [])]), color: i === 0 ? "var(--c1)" : "var(--c2)", dash: x.trace_role === "original" ? "2 3" : "", label: x.trace_role }));
      p.append(h("div", { html: U.lineChart({ title: fig.caption, ylabel: `Magnitude (dB), reference not stated`, xlabel: "Azimuth φ (°)", series, xr: [175, 185], height: 260, width: chartWidth("evidence") }) }));
      p.append(h("p", { class: "note" }, `${fig.caption} Solid: reconstructed; dotted: original. Breaks in a line are gaps where the printed line was not read.`));
      const meta = h("dl", { class: "meta-list" });
      const add = (k, v) => meta.append(h("dt", {}, k), h("dd", {}, v));
      add("Frequency", `${fig.frequency_ghz} GHz (figure ${fig.figure}, PDF page ${fig.pdf_page})`);
      add("Angle convention", E.dataset.angle_convention);
      for (const x of ser) add(`${x.trace_role} trace`, `${x.bounds.samples} samples in ${x.bounds.segments} segment(s); gaps: ${x.gaps.map((g) => `${g.from}°–${g.to}° (${g.reason})`).join("; ") || "none"}; extraction error median ${x.extraction.error_median_db} dB, largest ${x.extraction.error_max_db} dB. ${x.extraction.status}`);
      add("Source", `${E.source.title}, ${E.source.author}, ${E.source.date}.`);
      add("Test article", `${E.test_article.kind}: ${E.test_article.material}; ${E.test_article.size}`);
      add("Experimental uncertainty", ser[0]?.extraction.experimental_uncertainty ?? "not stated");
      add("Provenance", `Copied from ${E.provenance.copied_from}, dataset ${E.provenance.dataset_version}, SHA-256 ${E.provenance.source_sha256.slice(0, 16)}…, commit ${(E.provenance.source_commit || "").slice(0, 12)}. ${E.provenance.verification_limit}`);
      p.append(meta, h("h3", {}, "Transfer limits"), h("ul", {}, ...E.limits.map((l) => h("li", {}, l))), h("p", {}, h("a", { href: E.source.url }, "NASA technical report record")));
    },
    update() {},
  };

  /* ===== REFERENCE CHECKS ===== */
  views.checks = {
    render(api) {
      const p = panel("checks"), D = api.DATA, s = api.scn();
      p.textContent = "";
      p.append(h("h2", {}, "Reference checks"));
      const refs = CK.references(D.references);
      p.append(h("p", { class: "note" }, `${D.references.note} Retrieved ${D.references.retrieved}.`));
      p.append(h("div", { class: "table-scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ...["Case", "MATLAB call (published)", "Published", "This model", "Difference", "Tolerance", "Status"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", {}, ...refs.map((r) => h("tr", {}, h("td", {}, h("a", { href: r.source_url }, r.title)), h("td", {}, h("code", {}, r.call)), h("td", { class: "num" }, `${r.published} ${r.units}`), h("td", { class: "num" }, `${tx(r.computed, 9)} ${r.units}`), h("td", { class: "num" }, tx(r.diff, 2)), h("td", { class: "num" }, `±${r.tolerance}`), h("td", { class: `status ${r.pass ? "ok" : "bad"}` }, r.pass ? "✓ pass" : "✗ fail")))))));
      const inv = CK.invariants(D.preset, D.examples, D.evidence), det = CK.detectorChecks();
      const list = (items) => h("ul", {}, ...items.map((i) => h("li", {}, h("span", { class: `status ${i.pass ? "ok" : "bad"}` }, i.pass ? "✓ pass " : "✗ fail "), `${i.statement} `, h("span", { class: "note" }, i.detail))));
      p.append(h("h3", {}, `Domain invariants (${inv.filter((i) => i.pass).length} of ${inv.length})`), list(inv));
      p.append(h("h3", {}, `Detector checks (${det.filter((i) => i.pass).length} of ${det.length})`), h("p", { class: "note" }, "Complex square-law detector, noise normalised to unit mean power, P_fa per decision cell. Checked against closed forms and identities in this page; the independent library and Monte Carlo checks are in the visual's tests."), list(det));
      const ch = api.view().channel, rx = s.radars.find((r) => r.id === ch.rx), ref = s.radars.find((r) => r.id === ch.tx);
      const fd = G.fdCheck(ref.tx.waveform === "lfm" ? ref.tx.bandwidth_Hz : 2 / ref.tx.pulse_s, rx.rx.sampleRate_Hz);
      p.append(h("h3", {}, "Processing checks"), h("ul", {},
        h("li", {}, `Fractional-delay filter over the occupied band of ${ref.id}: ${fd.rule}; amplitude error ${tx(fd.amp_dB, 2)} dB, phase error ${tx(fd.phase_deg, 2)}°. The tests compare it with an independent frequency-domain delay.`),
        h("li", {}, `Matched filter: unit energy, so the sampled peak-to-noise ratio of one delayed pulse equals ρ₁ (invariant "mf-gain-once").`)));
      const am = api.app.perf.analyticMs, med = am.length ? [...am].sort((a, b) => a - b)[Math.floor(am.length / 2)] : NaN;
      p.append(h("h3", {}, "Performance in this browser"), h("ul", {},
        h("li", {}, `Analytic update of all ${api.app.links.length} links: median ${fx(med, 2)} ms over the last ${am.length} updates (target 100 ms on the reference desktop).`),
        h("li", {}, api.app.perf.dwellMs !== null ? `Last sampled channel: ${api.app.perf.dwellMs} ms (target 5 s on the reference desktop).` : "No sampled channel calculated yet."),
        h("li", {}, "These are measurements, not guarantees.")));
      p.append(h("h3", {}, "Unverified"), h("ul", {}, ...D.references.unverified.map((u) => h("li", {}, u.statement, u.source_url ? [" ", h("a", { href: u.source_url }, "source")] : null))));
    },
    update() {},
  };

  /* ===== EXAMPLES AND EXERCISES ===== */
  function exercise(n, title, prompt, inputs, reveal) {
    const box = h("div", { class: "card exercise" }, h("h3", {}, `${n}. ${title}`), h("p", {}, prompt));
    const fields = inputs.map(([label, type]) => { const inp = h(type === "text" ? "textarea" : "input", { type: type === "text" ? null : "number", step: "any", rows: type === "text" ? "2" : null, "aria-label": label, style: "width:100%" }); return [label, inp]; });
    for (const [label, inp] of fields) box.append(h("label", {}, h("span", { class: "label" }, label), inp));
    const out = h("div", { class: "reveal", hidden: true, role: "status" });
    const btn = h("button", { type: "button", onclick: () => {
      if (fields.some(([, inp]) => !inp.value.trim())) { out.hidden = false; out.textContent = "Write your prediction first; then reveal."; return; }
      out.hidden = false; out.textContent = "";
      const r = reveal(fields.map(([, inp]) => inp.value));
      for (const line of r) out.append(h("p", {}, line));
    } }, "Reveal");
    box.append(btn, out);
    return box;
  }
  views.learn = {
    render(api) {
      const p = panel("learn"), D = api.DATA, s = api.scn();
      p.textContent = "";
      p.append(h("h2", {}, "Examples"));
      p.append(h("div", { class: "grid2" }, ...D.examples.examples.map((e) => h("div", { class: "card" }, h("h3", {}, e.title), h("p", {}, h("strong", {}, e.question)), h("p", { class: "note" }, e.explain), h("button", { type: "button", "aria-pressed": String(api.view().example === e.id), onclick: () => api.loadExample(e.id) }, api.view().example === e.id ? "Loaded" : "Load example")))));
      p.append(h("hr", { class: "rule" }), h("h2", {}, "Exercises: predict, then reveal"));
      const L = api.selectedLink();
      const mono = L && L.type === "monostatic" && L.power ? L : api.app.links.find((l) => l.type === "monostatic" && l.power);
      const grid = h("div", { class: "grid2" });
      grid.append(exercise(1, "Range doubling", `For ${mono ? mono.id : "a monostatic link"}, predict P_r(2R)/P_r(R) with every other factor fixed.`, [["Predicted ratio", "number"]], (v) => {
        if (!mono) return ["No monostatic link with power in this scene."];
        const g = mono.geometry, pw = mono.power;
        const a = M.radarEquation({ Pt: pw.Pt, Gt: pw.Gt, Gr: pw.Gr, lambda: pw.lambda, sigma: pw.sigma, Rt: g.Rt, Rr: g.Rr, L: pw.L }).Pr;
        const b = M.radarEquation({ Pt: pw.Pt, Gt: pw.Gt, Gr: pw.Gr, lambda: pw.lambda, sigma: pw.sigma, Rt: 2 * g.Rt, Rr: 2 * g.Rr, L: pw.L }).Pr;
        return [`Your prediction: ${v[0]}.`, `Model: P_r(R) = ${tx(a)} W at R = ${tx(g.Rt)} m; P_r(2R) = ${tx(b)} W. Ratio ${tx(b / a, 6)} = ${fx(db(b / a), 3)} dB: R⁴ grows by 16.`];
      }));
      grid.append(exercise(2, "Equal-delay fixture", "Sites at (−10, 0, 0) km and (10, 0, 0) km; targets A (0, 10, 0) km and B (5, √87.5, 0) km. Predict the delay of each echo and the power ratio P_B/P_A in dB.", [["Predicted delay (μs)", "number"], ["Predicted P_B/P_A (dB)", "number"]], (v) => {
        const f = S.applyExample(D.preset, D.examples, "equal-delay");
        const A = M.evaluateLink(f, "S1>S2:A", 0, { skipDetector: true }), B = M.evaluateLink(f, "S1>S2:B", 0, { skipDetector: true });
        return [`Your prediction: ${v[0]} μs, ${v[1]} dB.`, `Model: τ_A = ${tx(A.geometry.tauE * 1e6, 8)} μs, τ_B = ${tx(B.geometry.tauE * 1e6, 8)} μs (equal path sums ${tx(A.geometry.sum)} m).`, `Path products ${tx(A.geometry.product)} m² and ${tx(B.geometry.product)} m²: P_B/P_A = ${tx(B.power.Pr / A.power.Pr, 6)} = ${fx(db(B.power.Pr / A.power.Pr), 3)} dB.`];
      }));
      grid.append(exercise(3, "Zero bistatic Doppler", "Sites are stationary. Which target velocities give f_D = 0? Describe the direction, then reveal.", [["Your answer", "text"]], (v) => {
        const f = S.applyExample(D.preset, D.examples, "doppler-null");
        const Lk = M.evaluateLink(f, "S1>S2:A", 0, { skipDetector: true }), g = Lk.geometry, b = N.vadd(g.ut, g.ur);
        return [`Your answer: ${v[0]}`, `Model: f_D = −(v · (û_t + û_r))/λ for stationary sites. Here û_t + û_r = ${CA.vecTxt(b)}: on the baseline it is zero, so any velocity along the baseline gives f_D = ${tx(g.fD)} Hz. Elsewhere, f_D = 0 needs v perpendicular to the bistatic bisector û_t + û_r.`];
      }));
      grid.append(exercise(4, "Required SNR and threshold", "Explain how the required single-pulse SNR differs from the detector threshold η.", [["Your explanation", "text"]], (v) => {
        const Lk = L && L.detector ? L : api.app.links.find((l) => l.detector);
        if (!Lk) return ["No link with a detector result."];
        const d = Lk.detector;
        return [`Your answer: ${v[0]}`, `Model (${Lk.id}): η = ${tx(d.eta)} is a level on the normalised noise statistic, set by P_fa = ${tx(d.pfa)} alone (${d.thresholdRule.replace(/\\/g, "")}). The required ρ₁ = ${fx(d.req.db, 3)} dB is the signal level that makes P(T > η) = P_d = ${d.pdRequired}: it depends on P_d, P_fa, N, integration and fluctuation.`];
      }));
      grid.append(exercise(5, "Phase error on 2 equal channels", "Two equal channels each have SNR ρ. Predict the combined SNR, as a multiple of ρ, when one has a residual phase error of 90°.", [["Predicted multiple of ρ", "number"]], (v) => {
        const out = [0, 45, 90, 180].map((d) => { const c = M.combineSnr([1, 1], [0, N.rad(d)]); return `${d}°: ${tx(c.snr, 4)} ρ`; });
        return [`Your prediction: ${v[0]} ρ.`, `Model: |1 + e^{iΔφ}|²/2 = 2 cos²(Δφ/2) with equal weights and independent unit noise. ${out.join("; ")}.`];
      }));
      grid.append(exercise(6, "Find the double-counted gain", (() => {
        const Lk = L && L.snr ? L : api.app.links.find((l) => l.snr);
        const r = s.radars.find((x) => x.id === Lk.tx);
        return `A supplied calculation for ${Lk.id}: ρ = P_r τ B / (k T_s) = ${tx(Lk.power.Pr)} · ${tx(Lk.snr.tau)} · ${tx(r.tx.bandwidth_Hz)} / (1.380649×10⁻²³ · ${tx(Lk.snr.Ts)}) = ${tx((Lk.power.Pr * Lk.snr.tau * r.tx.bandwidth_Hz) / (N.K_B * Lk.snr.Ts))}. Which factor is counted twice, and by how many dB?`;
      })(), [["Your answer (dB)", "number"]], (v) => {
        const Lk = L && L.snr ? L : api.app.links.find((l) => l.snr);
        const r = s.radars.find((x) => x.id === Lk.tx), tb = Lk.snr.tau * r.tx.bandwidth_Hz;
        return [`Your answer: ${v[0]} dB.`, `Model: ρ₁ = P_r τ/(k T_s L_MF) = ${tx(Lk.snr.rho1)} already includes the matched-filter (pulse-compression) gain. Multiplying by B adds the time-bandwidth product τB = ${tx(tb)} a second time: ${fx(db(tb), 2)} dB too high.`];
      }));
      grid.append(exercise(7, "Why the NASA curves give no absolute range", "Explain why the NASA F-117 model curves cannot supply an absolute aircraft range.", [["Your explanation", "text"]], (v) => [`Your answer: ${v[0]}`, ...D.evidence.limits]));
      p.append(grid);
      p.append(h("p", { class: "note" }, "Every reveal calls the same model functions as the link table: no second calculation."));
    },
    update() {},
  };

  /* ===== DISPATCH ===== */
  views.render = (tab, api) => { try { views[tab].render(api); } catch (e) { console.error(e); panel(tab).textContent = `This view failed: ${e.message}`; } };
  views.update = (tab, api) => { try { views[tab].update(api); } catch (e) { console.error(e); } };
  RN.views = views;
})();
