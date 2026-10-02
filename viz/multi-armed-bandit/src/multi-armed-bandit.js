/* Interface for the multi-armed-bandit page. All numbers come from BanditLogic (mab-logic); the
 * deck comes from BanditReport (report.js) written by Beamdswitch.deck (beamdswitch.js). */
(function () {
  "use strict";
  const L = BanditLogic, D = JSON.parse(document.getElementById("mab-data").textContent);
  const KEY = "multi-armed-bandit:v1", SLUG = "multi-armed-bandit", NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs, text) => {
    const e = document.createElement(tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  };
  const svg = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  };
  const now = () => (typeof performance !== "undefined" ? performance.now() : 0);
  function freshSeed() {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return 2654435769; }
  }
  function say(msg, where) {
    if (where) where.textContent = msg;
    const a = $("announce");
    a.textContent = "";
    setTimeout(() => { a.textContent = msg; }, 30);
  }

  /* ---- Storage: optional; every access is guarded ---- */
  let store = null;
  try { store = window.localStorage; store.getItem(KEY); } catch (e) { store = null; }
  let S, sim, undo = [], running = false, timer = 0, saveTimer = 0, simKey = "";
  let viewOf = null, viewMemo = null;
  const view = () => (viewOf === S ? viewMemo : (viewMemo = L.view(viewOf = S)));
  const keyOf = (s) => JSON.stringify([s.simulation.probabilities, s.simulation.budget, s.simulation.seed, s.prior]);
  function boot() {
    let msg = store ? "" : "Autosave is unavailable in this browser context; use Export JSON to keep your work.";
    const saved = store && (function () { try { return store.getItem(KEY); } catch (e) { return null; } })();
    if (saved) {
      const r = L.parse(saved);
      if (r.error) msg = "Saved work could not be restored (" + r.error + "); started from the website example.";
      else { S = r.state; sim = r.sim; msg = "Restored your autosaved experiment."; }
    }
    if (!S) { S = L.fromTemplate(D, "website", freshSeed()); sim = L.simCreate(S); save(); }
    simKey = keyOf(S);
    $("store-status").textContent = msg;
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!store) return;
      try { store.setItem(KEY, L.serialise(S, sim)); }
      catch (e) { $("store-status").textContent = "Autosave failed (storage unavailable or full). Your session still works; use Export JSON to keep it."; }
    }, 300);
  }
  function edited() {
    const t = L.fromTemplate(D, S.template, 1), pick = (s) => JSON.stringify([s.title, s.success, s.unit, s.prior, s.variants.map((v) => [v.name, v.successes, v.trials])]);
    return pick(t) !== pick(S);
  }

  /* ---- Committing changes ---- */
  function commit(next, opts) {
    S = next;
    const o = opts || {};
    if (o.clearUndo) undo = [];
    if (keyOf(S) !== simKey) {
      const had = sim && sim.methods.ts.pulls > 0;
      pause();
      S.simulation.pulls = 0;
      sim = L.simCreate(S);
      simKey = keyOf(S);
      if (had) $("sim-status").textContent = "Settings changed, so the earlier simulation results no longer match and were reset.";
    }
    render(o.force);
    save();
  }
  function replace(next, nextSim, msg) {
    pause();
    S = next; sim = nextSim || L.simCreate(next); simKey = keyOf(S); undo = [];
    $("sim-status").textContent = "";
    render(true);
    save();
    say(msg, $("store-status"));
  }
  let pending = null;
  function ask(text, yes, back) {
    if (!edited()) return yes();
    pending = { yes, back };
    $("confirm-text").textContent = text;
    $("confirm").hidden = false;
    $("confirm-yes").focus();
  }
  function settle(ok) {
    const p = pending;
    pending = null;
    $("confirm").hidden = true;
    if (!p) return;
    if (ok) p.yes(); else if (p.back) { p.back.focus(); say("Kept your current experiment.", $("store-status")); }
  }

  /* ---- Experiment rendering ---- */
  const FIELDS = { title: "f-title", success: "f-success", unit: "f-unit" };
  const rowEls = new Map();
  let rowIds = "";
  function setErr(input, errId, msg) {
    $(errId).textContent = msg || "";
    input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function buildRows() {
    const body = $("vt-body");
    body.textContent = "";
    rowEls.clear();
    S.variants.forEach((v, i) => {
      const tr = el("tr"), c = {};
      const cell = (label, cls) => { const td = el("td", { "data-label": label }); if (cls) td.className = cls; tr.append(td); return td; };
      c.radio = el("input", { type: "radio", name: "sel", value: v.id });
      const hit = el("label", { class: "hit" });
      hit.append(c.radio);
      cell("Select").append(hit);
      c.name = el("input", { type: "text", id: "name-" + v.id, autocomplete: "off", "aria-describedby": "err-" + v.id });
      c.err = el("p", { class: "err", id: "err-" + v.id });
      const nameCell = cell("Name", "wide");
      nameCell.append(c.name, c.err);
      c.s = el("input", { type: "text", inputmode: "numeric", id: "s-" + v.id, autocomplete: "off", "aria-describedby": "err-" + v.id });
      cell("Successes").append(c.s);
      c.n = el("input", { type: "text", inputmode: "numeric", id: "n-" + v.id, autocomplete: "off", "aria-describedby": "err-" + v.id });
      cell("Trials").append(c.n);
      for (const [k, label] of [["f", "Failures"], ["rate", "Observed rate"], ["mean", "Posterior mean"], ["ci", "95% credible interval"], ["smp", "Thompson sample"], ["ucb", "UCB1 score"]]) c[k] = cell(label, "n");
      c.ci.className = "n wide-ish";
      c.rm = el("button", { type: "button", class: "rm" }, "Remove");
      cell("").append(c.rm);
      c.radio.addEventListener("change", () => { const r = L.select(S, v.id); if (r.state) { commit(r.state); say("Selected " + nameOf(v.id) + "."); } });
      c.name.addEventListener("change", () => {
        const r = L.rename(S, S.variants.findIndex((x) => x.id === v.id), c.name.value);
        setErr(c.name, "err-" + v.id, r.error);
        if (r.state) commit(r.state);
      });
      const counts = (input) => () => {
        const idx = S.variants.findIndex((x) => x.id === v.id), r = L.setCounts(S, idx, c.s.value, c.n.value);
        $("err-" + v.id).textContent = r.error || "";
        for (const x of [c.s, c.n]) x.setAttribute("aria-invalid", r.error ? "true" : "false");
        if (r.state && !r.unchanged) { commit(r.state, { clearUndo: true }); say("Updated counts for " + nameOf(v.id) + "; recommendations recalculated."); }
      };
      c.s.addEventListener("change", counts(c.s));
      c.n.addEventListener("change", counts(c.n));
      c.rm.addEventListener("click", () => {
        const name = nameOf(v.id), r = L.removeVariant(S, S.variants.findIndex((x) => x.id === v.id));
        if (r.error) return say(r.error, $("vt-status"));
        commit(r.state, { clearUndo: true });
        $("add-variant").focus();
        say("Removed " + name + ".", $("vt-status"));
      });
      c.tr = tr;
      rowEls.set(v.id, c);
      body.append(tr);
    });
    rowIds = S.variants.map((v) => v.id).join();
  }
  const nameOf = (id) => (S.variants.find((v) => v.id === id) || {}).name;
  const active = () => document.activeElement;
  function renderExperiment(force) {
    const V = view();
    $("template").value = S.template;
    const t = D.templates.find((x) => x.id === S.template);
    const basis = { fictional: "Fictional example counts", mixed: "Fictional starting counts plus your changes", entered: "Your entered evidence" }[S.basis];
    $("basis").textContent = basis;
    $("basis").className = "badge" + (S.basis === "entered" ? "" : " fic");
    $("template-note").textContent = t ? t.note : "";
    for (const f in FIELDS) {
      const input = $(FIELDS[f]);
      if (force || active() !== input) { if (force || input.getAttribute("aria-invalid") !== "true") input.value = S[f]; }
      if (force) setErr(input, "e-" + f, "");
    }
    if (rowIds !== S.variants.map((v) => v.id).join()) buildRows();
    V.rows.forEach((r, i) => {
      const c = rowEls.get(r.id);
      c.radio.checked = S.selected === r.id;
      c.radio.setAttribute("aria-label", "Select " + r.name + " for the next trial");
      c.name.setAttribute("aria-label", "Name of variant " + (i + 1));
      c.s.setAttribute("aria-label", "Successes for " + r.name);
      c.n.setAttribute("aria-label", "Trials for " + r.name);
      c.rm.setAttribute("aria-label", "Remove " + r.name);
      c.rm.disabled = S.variants.length <= L.LIMITS.minVariants;
      if (force || (active() !== c.name && c.name.getAttribute("aria-invalid") !== "true")) c.name.value = r.name;
      const countsBad = c.s.getAttribute("aria-invalid") === "true";
      if (force || (!countsBad && active() !== c.s && active() !== c.n)) { c.s.value = String(r.successes); c.n.value = String(r.trials); }
      if (force) { c.err.textContent = ""; for (const x of [c.name, c.s, c.n]) x.setAttribute("aria-invalid", "false"); }
      c.f.textContent = r.text.failures;
      c.rate.textContent = r.text.rate;
      c.mean.textContent = r.text.mean;
      c.mean.title = "Posterior " + r.text.posterior;
      c.ci.textContent = r.text.interval;
      c.smp.textContent = r.text.sample;
      if (V.ts.index === i) c.smp.append(el("span", { class: "tag ts" }, "★ Thompson pick"));
      c.ucb.textContent = r.text.ucb;
      if (V.ucb.index === i) c.ucb.append(el("span", { class: "tag ucb" }, "▲ UCB1 pick"));
      c.tr.className = S.selected === r.id ? "is-sel" : "";
    });
    $("add-variant").disabled = S.variants.length >= L.LIMITS.maxVariants;
    $("vt-count").textContent = S.variants.length + " variants (2 to 10). Total completed trials: " + V.totalText + ".";
    $("ts-pick").textContent = "★ " + V.ts.name;
    $("ts-why").textContent = V.ts.why;
    $("ts-select").textContent = "Select " + V.ts.name;
    $("ucb-pick").textContent = "▲ " + V.ucb.name + (V.ucb.untried ? " (untried)" : "");
    $("ucb-why").textContent = V.ucb.why;
    $("ucb-select").textContent = "Select " + V.ucb.name;
    $("disagree").textContent = V.disagreement;
    const sel = S.variants.find((v) => v.id === S.selected);
    $("sel-text").textContent = sel ? "Selected: " + sel.name + ". The next outcome you record is added to " + sel.name + "." : "No variant selected yet.";
    const why = V.canRecord;
    $("btn-success").disabled = $("btn-failure").disabled = !!why;
    $("record-why").textContent = why || "";
    $("btn-undo").disabled = !undo.length;
    const hints = $("hints");
    hints.textContent = "";
    for (const h of L.hints(S, V)) hints.append(el("li", null, h));
    for (const x of ["prior-a", "prior-b"]) {
      const input = $(x);
      if (force || (active() !== input && input.getAttribute("aria-invalid") !== "true")) input.value = String(S.prior[x.slice(-1)]);
      if (force) setErr(input, "e-prior", "");
    }
    $("prior-text").textContent = "Current prior: " + V.priorText + ", applied independently to every variant.";
    plotIntervals(V);
  }
  function width(id) {
    const w = $(id).clientWidth;
    return Math.max(280, Math.min(1100, w || 640));
  }
  function plotIntervals(V) {
    const W = width("ci-plot"), left = Math.min(150, W * 0.32), right = 16, rowH = 30, top = 8, H = top + V.rows.length * rowH + 30;
    const maxHi = Math.max.apply(null, V.rows.map((r) => Math.max(r.hi, r.sample)));
    const xmax = maxHi > 0.5 ? 1 : Math.min(1, Math.ceil((maxHi + 0.02) * 10) / 10);
    const x = (v) => left + (W - left - right) * v / xmax;
    const g = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-labelledby": "ci-title ci-desc" });
    g.append(svg("title", { id: "ci-title" }, "95% credible intervals, posterior means and Thompson samples"),
      svg("desc", { id: "ci-desc" }, V.rows.map((r) => r.name + ": mean " + r.text.mean + ", interval " + r.text.interval + ", sample " + r.text.sample).join("; ") + ". Exact values are in the table."));
    const ticks = 5;
    for (let i = 0; i <= ticks; i += 1) {
      const v = xmax * i / ticks, xx = x(v);
      g.append(svg("line", { x1: xx, x2: xx, y1: top, y2: H - 24, class: "grid" }), svg("text", { x: xx, y: H - 8, "text-anchor": "middle", class: "ax" }, Math.round(v * 100) + "%"));
    }
    V.rows.forEach((r, i) => {
      const y = top + i * rowH + rowH / 2, name = r.name.length > 18 ? r.name.slice(0, 17) + "…" : r.name;
      g.append(svg("text", { x: 0, y: y + 4 }, name + (V.ts.index === i ? " ★" : "") + (V.ucb.index === i ? " ▲" : "")),
        svg("line", { x1: x(r.lo), x2: Math.max(x(r.hi), x(r.lo) + 1), y1: y, y2: y, class: "ci" }),
        svg("circle", { cx: x(r.mean), cy: y, r: 4.5, class: "mean" }),
        svg("path", { d: "M" + x(r.sample) + " " + (y - 7) + "l6 7-6 7-6-7z", class: "smp" }));
    });
    $("ci-plot").replaceChildren(g);
  }

  /* ---- Simulation rendering and running ---- */
  let simIds = "";
  function buildSimInputs() {
    const box = $("sim-probs");
    box.textContent = "";
    S.variants.forEach((v, j) => {
      const f = el("div", { class: "field" }), id = "p-" + v.id;
      const input = el("input", { type: "text", inputmode: "decimal", id, autocomplete: "off", "aria-describedby": "e-sim" });
      input.addEventListener("change", simSettings);
      f.append(el("label", { for: id, id: "pl-" + v.id }), input);
      box.append(f);
    });
    simIds = S.variants.map((v) => v.id).join();
  }
  function simSettings(ev) {
    const r = L.setSimulation(S, { probabilities: S.variants.map((v) => $("p-" + v.id).value), budget: $("sim-budget").value, seed: $("sim-seed").value });
    for (const e of document.querySelectorAll("#panel-sim input")) e.setAttribute("aria-invalid", "false");
    $("e-sim").textContent = r.error || "";
    if (r.error) {
      const bad = r.field === "budget" ? $("sim-budget") : r.field === "seed" ? $("sim-seed") : $("p-" + S.variants[+r.field.slice(1)].id);
      bad.setAttribute("aria-invalid", "true");
      return;
    }
    if (r.unchanged) return;
    const had = sim.methods.ts.pulls > 0;
    commit(r.state);
    if (!had) say("Simulation settings applied.", $("sim-status"));
  }
  function renderSim(force) {
    if (simIds !== S.variants.map((v) => v.id).join()) buildSimInputs();
    const names = S.variants.map((v) => v.name), c = S.simulation;
    S.variants.forEach((v, j) => {
      $("pl-" + v.id).textContent = v.name + " success probability (%)";
      const input = $("p-" + v.id);
      if (force || (active() !== input && input.getAttribute("aria-invalid") !== "true")) input.value = String(+(c.probabilities[j] * 100).toFixed(6));
    });
    for (const [x, v] of [["sim-budget", c.budget], ["sim-seed", c.seed]]) {
      const input = $(x);
      if (force || (active() !== input && input.getAttribute("aria-invalid") !== "true")) input.value = String(v);
    }
    if (force) { $("e-sim").textContent = ""; for (const e of document.querySelectorAll("#panel-sim input")) e.setAttribute("aria-invalid", "false"); }
    const V = L.simView(sim, names), done = L.simDone(sim);
    $("sim-progress").textContent = V.progress + " Seed " + V.seed + ", prior " + view().priorText + ".";
    $("sim-step").disabled = $("sim-run").disabled = done || running;
    $("sim-pause").disabled = !running;
    $("sim-reset").disabled = !V.started && !running;
    const body = $("sim-body");
    body.textContent = "";
    for (const m of V.methods) {
      const tr = el("tr");
      tr.append(el("th", { scope: "row" }, m.label), el("td", { class: "n" }, m.text.pulls), el("td", { class: "n" }, m.text.successes), el("td", { class: "n" }, m.text.rate), el("td", { class: "n" }, m.text.regret));
      body.append(tr);
    }
    const ah = $("alloc-head"), ab = $("alloc-body");
    ah.textContent = ""; ab.textContent = "";
    const hr = el("tr");
    hr.append(el("th", { scope: "col" }, "Method"));
    V.settings.forEach((s) => hr.append(el("th", { scope: "col", class: "n" }, s.name + " (" + s.probability + ")")));
    ah.append(hr);
    for (const m of V.methods) {
      const tr = el("tr");
      tr.append(el("th", { scope: "row" }, m.label));
      for (const a of m.allocation) tr.append(el("td", { class: "n" }, a.text));
      ab.append(tr);
    }
    plotSim(V);
  }
  function plotSim(V) {
    const W = width("sim-chart"), H = Math.round(Math.max(220, Math.min(360, W * 0.5))), l = 48, r = 92, t = 10, b = 34;
    const top = Math.max(1, Math.ceil(sim.budget * sim.best), ...V.methods.map((m) => m.successes));
    const mag = Math.pow(10, Math.floor(Math.log10(top / 4))), unit = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((u) => u * 4 >= top), ymax = unit * 4;
    const x = (i) => l + (W - l - r) * i / sim.budget, y = (v) => H - b - (H - b - t) * v / ymax;
    const g = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-labelledby": "sc-title sc-desc" });
    g.append(svg("title", { id: "sc-title" }, "Cumulative successes by pull"),
      svg("desc", { id: "sc-desc" }, V.started ? V.methods.map((m) => m.label + ": " + m.text.successes + " successes after " + m.text.pulls + " pulls").join("; ") + ". The table below lists every value." : "No pulls yet."));
    for (let i = 0; i <= 4; i += 1) {
      const v = Math.round(ymax * i / 4), xv = Math.round(sim.budget * i / 4);
      g.append(svg("line", { x1: l, x2: W - r, y1: y(v), y2: y(v), class: "grid" }), svg("text", { x: l - 6, y: y(v) + 4, "text-anchor": "end", class: "ax" }, L.group(v)),
        svg("text", { x: x(xv), y: H - 14, "text-anchor": "middle", class: "ax" }, L.group(xv)));
    }
    g.append(svg("text", { x: (l + W - r) / 2, y: H - 1, "text-anchor": "middle", class: "ax" }, "Pulls per method"));
    const step = Math.max(1, Math.floor(sim.budget / (W - l - r)));
    const ends = [];
    for (const m of V.methods) {
      const curve = sim.methods[m.id].curve;
      if (!curve.length) continue;
      let d = "M" + x(0) + " " + y(0);
      for (let i = 0; i < curve.length; i += 1) if (i % step === step - 1 || i === curve.length - 1) d += "L" + x(i + 1).toFixed(1) + " " + y(curve[i]).toFixed(1);
      g.append(svg("path", { d, class: "line m-" + m.id }));
      ends.push({ x: x(curve.length) + 6, y: y(curve[curve.length - 1]) + 4, t: m.id === "ts" ? "Thompson" : m.id === "ucb" ? "UCB1" : "Equal" });
    }
    ends.sort((a, b) => a.y - b.y).forEach((e, i) => { if (i && e.y < ends[i - 1].y + 14) e.y = ends[i - 1].y + 14; g.append(svg("text", { x: e.x, y: e.y }, e.t)); });
    $("sim-chart").replaceChildren(g);
  }
  function pause() {
    if (running) { running = false; clearTimeout(timer); }
  }
  function afterSim() {
    S.simulation.pulls = sim.methods.ts.pulls;
    renderSim();
    save();
  }
  function tick() {
    if (!running) return;
    const t0 = now();
    let n = 0;
    while (n < 50 && L.simStep(sim)) { n += 1; if (now() - t0 > 20) break; }
    const done = L.simDone(sim);
    if (done) { running = false; say("Run complete: " + L.group(sim.budget) + " pulls per method.", $("sim-status")); }
    afterSim();
    if (running) timer = setTimeout(tick, 0);
  }
  function wireSim() {
    $("sim-budget").addEventListener("change", simSettings);
    $("sim-seed").addEventListener("change", simSettings);
    $("sim-step").addEventListener("click", () => { if (L.simStep(sim)) { $("sim-status").textContent = ""; afterSim(); say("Stepped to pull " + sim.methods.ts.pulls + "."); } });
    $("sim-run").addEventListener("click", () => {
      if (running || L.simDone(sim)) return;
      running = true;
      $("sim-status").textContent = "Running…";
      renderSim();
      $("sim-pause").focus();
      timer = setTimeout(tick, 0);
    });
    $("sim-pause").addEventListener("click", () => {
      pause();
      say("Paused at pull " + L.group(sim.methods.ts.pulls) + ".", $("sim-status"));
      renderSim();
      $("sim-run").focus();
    });
    $("sim-reset").addEventListener("click", () => {
      pause();
      sim = L.simCreate(S);
      afterSim();
      say("Simulation reset to zero pulls with the same settings and seed.", $("sim-status"));
      $("sim-step").focus();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && running) { pause(); renderSim(); $("sim-status").textContent = "Paused because the page was hidden; press Run to continue."; }
    });
  }

  /* ---- Exports ---- */
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function showText(label, text) {
    $("export-label").textContent = label;
    $("export-text").value = text;
  }
  function deckText() {
    const d = new Date();
    const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const simV = sim.methods.ts.pulls ? L.simView(sim, S.variants.map((v) => v.name)) : null;
    return Beamdswitch.deck(BanditReport.report(S, view(), simV, D, iso));
  }
  function wireExports() {
    $("save-beamdswitch").addEventListener("click", () => {
      let text;
      try { text = deckText(); } catch (e) { return say("The deck could not be written: " + e.message, $("deck-status")); }
      showText("Deck Markdown (" + SLUG + "-beamdswitch.md)", text);
      try { download(SLUG + "-beamdswitch.md", text, "text/markdown"); say("Saved " + SLUG + "-beamdswitch.md. If no download appears, select the text under Export as text.", $("deck-status")); }
      catch (e) { $("fallback").open = true; say("Saving is not allowed here; select the text under Export as text instead.", $("deck-status")); }
    });
    $("copy-beamdswitch").addEventListener("click", async () => {
      let text;
      try { text = deckText(); } catch (e) { return say("The deck could not be written: " + e.message, $("deck-status")); }
      showText("Deck Markdown (" + SLUG + "-beamdswitch.md)", text);
      try { await navigator.clipboard.writeText(text); say("Copied the deck. Paste it into beamdswitch.", $("deck-status")); }
      catch (e) { $("fallback").open = true; say("Copying is not allowed here. Use Save deck, or select the text under Export as text.", $("deck-status")); }
    });
    $("export-json").addEventListener("click", () => {
      const text = L.serialise(S, sim);
      showText("Experiment JSON (multi-armed-bandit-experiment.json)", text);
      try { download("multi-armed-bandit-experiment.json", text, "application/json"); say("Exported multi-armed-bandit-experiment.json. If no download appears, select the text under Export as text.", $("store-status")); }
      catch (e) { $("fallback").open = true; say("Saving is not allowed here; select the text under Export as text instead.", $("store-status")); }
    });
    $("import-json").addEventListener("change", (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        ev.target.value = "";
        const r = L.parse(String(reader.result));
        if (r.error) return say("Import rejected: " + r.error + " Your current experiment is unchanged.", $("store-status"));
        ask("Replace your edited experiment with the imported file?", () => replace(r.state, r.sim, "Imported " + file.name + "."), $("import-json"));
      };
      reader.onerror = () => say("The file could not be read.", $("store-status"));
      reader.readAsText(file);
    });
    $("reset").addEventListener("click", () => ask("Reset to the website example and discard your edited experiment?", () => replace(L.fromTemplate(D, "website", freshSeed()), null, "Reset to the website conversions example."), $("reset")));
  }

  /* ---- Wiring ---- */
  function render(force) { renderExperiment(force); renderSim(force); }
  const TABS = ["exp", "sim", "hrs"];
  function selectTab(id, focus) {
    for (const t of TABS) {
      const on = t === id;
      $("tab-" + t).setAttribute("aria-selected", on ? "true" : "false");
      $("tab-" + t).tabIndex = on ? 0 : -1;
      $("panel-" + t).hidden = !on;
    }
    if (focus) $("tab-" + id).focus();
    render();
    if (self.HoursPage) self.HoursPage.shown(id === "hrs");
  }
  function wire() {
    for (const t of TABS) {
      $("tab-" + t).addEventListener("click", () => selectTab(t));
      $("tab-" + t).addEventListener("keydown", (e) => {
        const k = e.key, i = TABS.indexOf(t), n = TABS.length;
        const to = k === "Home" ? TABS[0] : k === "End" ? TABS[n - 1] : k === "ArrowRight" ? TABS[(i + 1) % n] : k === "ArrowLeft" ? TABS[(i + n - 1) % n] : "";
        if (to) { e.preventDefault(); selectTab(to, true); }
      });
    }
    $("template").addEventListener("change", () => {
      const id = $("template").value, label = D.templates.find((x) => x.id === id).label;
      $("template").value = S.template;
      ask("Replace your edited experiment with the " + label + " template?", () => { replace(L.fromTemplate(D, id, freshSeed()), null, "Loaded the " + label + " template."); $("template").focus(); }, $("template"));
    });
    $("confirm-yes").addEventListener("click", () => settle(true));
    $("confirm-no").addEventListener("click", () => settle(false));
    for (const f in FIELDS) $(FIELDS[f]).addEventListener("change", () => {
      const r = L.setText(S, f, $(FIELDS[f]).value);
      setErr($(FIELDS[f]), "e-" + f, r.error);
      if (r.state) commit(r.state);
    });
    $("add-variant").addEventListener("click", () => {
      const r = L.addVariant(S);
      if (r.error) return say(r.error, $("vt-status"));
      commit(r.state, { clearUndo: true });
      const v = S.variants[S.variants.length - 1];
      $("name-" + v.id).focus();
      say("Added " + v.name + " with no trials; recommendations recalculated.", $("vt-status"));
    });
    const pick = (which) => () => {
      const id = view()[which].id, r = L.select(S, id);
      commit(r.state);
      say("Selected " + nameOf(id) + " for the next trial.", $("record-status"));
    };
    $("ts-select").addEventListener("click", pick("ts"));
    $("ucb-select").addEventListener("click", pick("ucb"));
    const rec = (ok) => () => {
      const before = L.snapshot(S), r = L.record(S, ok);
      if (r.error) return say(r.error, $("record-status"));
      undo.push(before);
      if (undo.length > 200) undo.shift();
      commit(r.state);
      const V = view();
      say("Recorded a " + (ok ? "success" : "failure") + " for " + nameOf(S.selected) + ". Thompson now recommends " + V.ts.name + "; UCB1 recommends " + V.ucb.name + ".", $("record-status"));
    };
    $("btn-success").addEventListener("click", rec(true));
    $("btn-failure").addEventListener("click", rec(false));
    $("btn-undo").addEventListener("click", () => {
      const snap = undo.pop();
      if (!snap) return;
      commit(L.restore(S, snap), { force: false });
      say("Undid the last recorded outcome; the previous recommendations and samples are restored.", $("record-status"));
    });
    $("btn-resample").addEventListener("click", () => {
      commit(L.resample(L.clone(S)));
      say("Drew new Thompson samples; Thompson now recommends " + view().ts.name + ". Evidence and UCB1 scores are unchanged.", $("record-status"));
    });
    for (const id of ["prior-a", "prior-b"]) $(id).addEventListener("change", () => {
      const r = L.setPrior(S, $("prior-a").value, $("prior-b").value);
      $("e-prior").textContent = r.error || "";
      for (const x of ["prior-a", "prior-b"]) $(x).setAttribute("aria-invalid", r.error ? "true" : "false");
      if (r.state && !r.unchanged) { commit(r.state, { clearUndo: true }); say("Prior changed to " + view().priorText + "; recommendations recalculated.", $("prior-text")); }
    });
    wireSim();
    wireExports();
    let rw = 0;
    if (typeof ResizeObserver !== "undefined") {
      let last = 0;
      new ResizeObserver(() => {
        const w = $("main").clientWidth;
        if (w === last) return;
        last = w;
        cancelAnimationFrame(rw);
        rw = requestAnimationFrame(() => { plotIntervals(view()); plotSim(L.simView(sim, S.variants.map((v) => v.name))); });
      }).observe($("main"));
    }
  }
  function tools() {
    const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
    if (!mc) return;
    const result = (x) => ({ content: [{ type: "text", text: JSON.stringify(x) }] });
    const snapshot = () => {
      const V = view();
      return { experiment: { title: S.title, success: S.success, unit: S.unit, template: S.template, evidence: S.basis, prior: V.priorText,
        variants: V.rows.map((r) => ({ name: r.name, successes: r.successes, failures: r.failures, trials: r.trials, observedRate: r.text.rate, posteriorMean: r.text.mean, interval95: r.text.interval, thompsonSample: r.text.sample, ucbScore: r.text.ucb })),
        selected: nameOf(S.selected) || null },
        recommendations: { thompson: { variant: V.ts.name, sample: V.ts.value, why: V.ts.why }, ucb1: { variant: V.ucb.name, score: V.ucb.value, why: V.ucb.why }, agree: V.agree },
        simulation: L.simView(sim, S.variants.map((v) => v.name)), hours: self.HoursPage ? self.HoursPage.snapshot() : null };
    };
    mc.registerTool({ name: "get_data", description: "Return the committed experiment, both recommendations, the simulation results and next week's hours plan, as shown on the page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute() { return result(snapshot()); } });
    mc.registerTool({ name: "get_metadata", description: "Return the page title, templates, assumptions, limits and method references.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute() { return result({ title: document.title, url: "https://teoyujie.org/visuals/multi-armed-bandit/", format: L.FORMAT, version: L.VERSION, templates: D.templates.map((t) => ({ id: t.id, label: t.label, fictional: t.fictional })), assumptions: D.assumptions, references: D.references, limits: L.LIMITS, hours: self.HoursLogic ? { format: HoursLogic.FORMAT, version: HoursLogic.VERSION, assumptions: D.hours.assumptions, limits: HoursLogic.LIMITS } : null }); } });
    mc.registerTool({ name: "query", description: "Find variants in the current experiment, or templates, whose name contains the text; read-only.", inputSchema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true }, async execute(input) {
      const q = String((input && input.text) || "").trim().toLowerCase(), snap = snapshot();
      const all = snap.experiment.variants.map((v) => Object.assign({ type: "variant" }, v)).concat(D.templates.map((t) => ({ type: "template", id: t.id, name: t.label, fictional: t.fictional })));
      const hits = all.filter((x) => !q || x.name.toLowerCase().includes(q));
      return result({ results: hits.slice(0, 50), total: hits.length, truncated: hits.length > 50 });
    } });
  }

  boot();
  $("nojs").hidden = true;
  $("app").hidden = false;
  wire();
  render(true);
  tools();
})();
