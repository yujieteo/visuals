/* Monte Carlo Probability Workbench: the rare-event lab of group 7. The left panel lists the rare-event examples by
 * problem, and the centre card holds the lab: the problem, its law and its parameters, the method and its comparison,
 * Step, Run, Pause and Reset, the estimates with their intervals, references and claim tags, the decision, the
 * convergence against the work, the comparison of the methods, the stages or levels of the method, the tail plot and
 * a sweep that shows how the decision changes. The run is a sequence of independent replications on the page's
 * worker pool (src/rare.js through src/rare-worker.js), so 1 and 4 workers give the same result. The state is the
 * kit's fields r_*; the run lives beside it, as the model run does. view.js calls these functions.
 */
(function () {
  "use strict";
  const g = /** @type {any} */ (globalThis);
  const Ra = g.MCRare, P = g.MCPlots, Pool = g.MCPool, Rng = g.MCRng;
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);
  /** @param {unknown} s */
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  /** @param {number | null | undefined} v */
  const fmt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : P.fmt(v));
  /** @param {number} n */
  const count = (n) => Math.round(n).toLocaleString("en-US");
  const TAG = /** @type {Record<string, string>} */ ({ theorem: "Theorem", numerical: "Numerical approximation", observation: "Finite-run observation" });
  /** @param {"theorem" | "numerical" | "observation"} kind */
  const tag = (kind) => `<span class="tag tag-${kind}">${TAG[kind]}</span>`;
  const NAME = /** @type {Record<string, string>} */ ({ direct: "Direct simulation", tilting: "Exponential tilting", splitting: "Multilevel splitting", subset: "Subset simulation", ais: "Adaptive importance sampling", ce: "Cross-entropy method", none: "No comparison" });
  const LAW = /** @type {Record<string, string>} */ ({ exponential: "Exponential", weibull: "Weibull (k < 1)", pareto2: "Pareto II (Lomax)" });
  const LIMIT_MS = 180000;
  const W = 640, H = 300, M = { l: 64, r: 20, t: 18, b: 46 };

  /** @type {any} */
  let app = null;
  /** @type {any} */
  let data = g.Model?.DATA ?? null;
  /** @type {any} */
  let run = null;
  /** @type {any} */
  let pool = null;
  /** @type {any} */
  let sweep = null;
  /** The run record a reader loaded, to compare with its replay. @type {any} */
  let expected = null;
  let frame = 0, autorun = true, lastKey = "";
  /** @type {{ key: string, value: any }} */
  let refMemo = { key: "", value: null };

  /* ---------- state, record and run ---------- */

  /** The rare-event record of a state. @param {Record<string, any>} s */
  const recordOf = (s) => ({ format: Ra.FORMAT, version: Ra.VERSION, problem: s.r_problem, law: s.r_law, copula: s.r_copula, params: s.r_params });
  /** The settings of a state. @param {Record<string, any>} s */
  const settingsOf = (s) => ({ seed: s.seed, method: s.r_method, compare: s.r_compare, failure: s.r_failure, options: s.r_options, size: s.r_size, reps: s.r_reps });
  /** @param {Record<string, any>} s */
  const keyOf = (s) => JSON.stringify([recordOf(s), settingsOf(s)]);

  /** The reference of a compiled problem, kept while the record stays the same. @param {any} c @param {Record<string, any>} s */
  function referenceOf(c, s) {
    const key = JSON.stringify(recordOf(s));
    if (refMemo.key !== key) refMemo = { key, value: Ra.reference(c) };
    return refMemo.value;
  }

  function source() {
    return ["src-rng", "src-special", "src-expr", "src-continuous", "src-copulas", "src-rare", "src-rare-worker"].map((id) => $(id).textContent).join("\n;\n");
  }
  function getPool() {
    if (!pool) pool = Pool.createPool({ source: source(), size: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)), engine: Ra });
    return pool;
  }

  /** A new, empty run for the state, with the compiled problem or its errors. @param {Record<string, any>} s */
  function newRun(s) {
    const record = recordOf(s), settings = settingsOf(s), c = Ra.prepare(record, settings);
    return { key: keyOf(s), record, settings, c, acc: c.ok ? Ra.empty(c) : null, status: c.ok ? "idle" : "error", message: "", elapsed: 0, started: 0, handle: null, mode: "" };
  }

  /** Run replications up to `to`. @param {number} to */
  function go(to) {
    const r = run;
    if (!r || !r.c.ok || r.handle || r.acc.blocks >= to) return;
    r.status = "running";
    r.started = performance.now();
    r.message = "";
    const p = getPool();
    r.handle = p.run({ record: r.record, settings: r.settings, opts: {}, from: r.acc.blocks, to }, {
      onBlock(/** @type {any} */ blk) {
        if (run !== r) return;
        r.acc = Ra.merge(r.acc, blk, r.c);
        if (r.elapsed + performance.now() - r.started > LIMIT_MS) { r.message = `The run reached the time limit of ${LIMIT_MS / 1000} s and paused.`; r.handle?.pause(); }
        schedule();
      },
      onEnd(/** @type {string} */ status, /** @type {string} */ message) {
        if (run !== r) return;
        r.elapsed += performance.now() - r.started;
        r.handle = null;
        r.mode = p.mode;
        r.status = status === "done" ? (r.acc.blocks >= r.c.R ? "done" : "paused") : status;
        if (message) r.message = message;
        schedule();
      },
    });
    r.mode = p.mode;
    schedule();
  }
  const start = () => { if (run?.c.ok) go(run.c.R); };
  const step = () => { if (run?.c.ok && !run.handle) go(Math.min(run.c.R, run.acc.blocks + 1)); };
  const pause = () => run?.handle?.pause();
  function reset() {
    run?.handle?.cancel();
    if (app) { run = newRun(app.state); lastKey = run.key; }
    schedule();
  }
  /** Space runs or pauses; "." steps. @param {string} key */
  function key(key) {
    if (key === " ") { if (run?.handle) pause(); else start(); }
    else if (key === ".") step();
  }

  /** Draw the status now and the rest at the next frame. */
  function schedule() {
    drawStatus();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (app && app.state.nav === "rare") drawRun(app.state); });
  }

  /** The summary of the current run, or null before its first replication. */
  function summary() {
    return run?.c.ok && run.acc.blocks ? Ra.summary(run.c, run.acc) : null;
  }

  /* ---------- the left panel and the library ---------- */

  /** The examples that match a search, by decision, phenomenon, law or method. @param {string} q */
  function matching(q) {
    const words = String(q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return data.rare.presets.filter((/** @type {any} */ p) => {
      const pr = data.rare.problems.find((/** @type {any} */ x) => x.id === p.problem);
      const hay = [p.title, p.observe, pr.title, pr.decision, pr.reason, LAW[p.law], p.law, NAME[p.method], NAME[p.compare], p.method, p.compare, p.copula, "rare event ruin"].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  /** The examples as a list under their problems, for the rare-event panel and the examples list. @param {string} q @param {Record<string, any>} s */
  function list(q, s) {
    const found = matching(q);
    return data.rare.problems.map((/** @type {any} */ pr) => {
      const items = found.filter((/** @type {any} */ p) => p.problem === pr.id);
      if (!items.length) return "";
      return `<h3 class="law-head">${esc(pr.title)}</h3><ul class="model-list">${items.map((/** @type {any} */ p) => {
        const cur = s.nav === "rare" && isCurrent(p, s);
        return `<li><button type="button" class="link${cur ? " current" : ""}" data-rare-open="${esc(p.id)}" aria-current="${cur}"><span class="kind">${esc(NAME[p.method])}${p.failure !== "none" ? ", fails" : ""}</span> ${esc(p.title)}</button></li>`;
      }).join("")}</ul>`;
    }).join("");
  }

  /** @param {any} p @param {Record<string, any>} s */
  const isCurrent = (p, s) => p.problem === s.r_problem && p.law === s.r_law && p.params === s.r_params && p.method === s.r_method && p.compare === s.r_compare && p.failure === s.r_failure && (p.problem !== "cat" || p.copula === s.r_copula);

  /** The examples of group 7 for the Examples list of view.js, as one more heading. @param {string} q @param {Record<string, any>} s */
  function examples(q, s) {
    const html = list(q, s);
    return html ? `<h3 class="law-head">Rare events and ruin</h3>${html.replace(/<h3 class="law-head">/g, '<h4 class="law-head">').replace(/<\/h3>/g, "</h4>")}` : "";
  }

  /** @param {Record<string, any>} s */
  function drawNav(s) {
    const box = $("rare-list"), k = JSON.stringify([s.q, s.nav, recordOf(s), settingsOf(s)]);
    if (box.dataset.key !== k) {
      box.dataset.key = k;
      box.innerHTML = list(s.q, s) || `<p class="note">No rare-event example matches "${esc(s.q)}". Search by a decision, a phenomenon, a law or a method.</p>`;
    }
    const search = $("rare-search");
    if (document.activeElement !== search && search.value !== s.q) search.value = s.q;
    $("rare-method-list").innerHTML = data.rare.methods.map((/** @type {any} */ m) => `<li><button type="button" class="link" data-rare-method="${esc(m.id)}">${esc(m.name)}</button></li>`).join("");
  }

  /** The state that opens an example. @param {string} id */
  function presetState(id) {
    const p = data.rare.presets.find((/** @type {any} */ x) => x.id === id);
    if (!p) return null;
    return { nav: "rare", r_problem: p.problem, r_law: p.law, r_copula: p.copula, r_params: p.params, r_method: p.method, r_compare: p.compare, r_failure: p.failure, r_options: p.options, r_size: p.size, r_reps: p.reps };
  }
  /** @param {string} id */
  function open(id) {
    const st = presetState(id);
    if (st) app.set({ ...st, r_sweep: "" });
  }

  /* ---------- the centre card ---------- */

  /**
   * Draw the lab for the state: the run starts again when the record or the settings change, and the lab is hidden
   * unless the rare-event panel is open.
   * @param {Record<string, any>} s
   */
  function draw(s) {
    app = app ?? g.VisualKit?.app;
    drawNav(s);
    const shown = s.nav === "rare";
    $("wb-rare").hidden = !shown;
    if (!shown) return;
    const k = keyOf(s);
    if (k !== lastKey) {
      lastKey = k;
      run?.handle?.cancel();
      run = newRun(s);
      if (expected && expected.key && expected.key !== k) expected = null;
      if (run.c.ok && autorun) start();
    }
    drawHeader(s);
    drawParams(s);
    drawMethodCard(s);
    drawRun(s);
  }

  /** @param {Record<string, any>} s */
  function drawHeader(s) {
    const pr = data.rare.problems.find((/** @type {any} */ x) => x.id === s.r_problem);
    const preset = data.rare.presets.find((/** @type {any} */ p) => isCurrent(p, s));
    $("rare-kind").textContent = `Rare events and ruin · ${pr.title} · ${LAW[s.r_law]} law${s.r_problem === "cat" ? ` · ${s.r_copula} copula` : ""}`;
    $("rare-title").textContent = preset ? preset.title : pr.title;
    $("rare-problem").textContent = pr.statement;
    $("rare-data").textContent = pr.data;
    $("rare-observe").textContent = preset ? `What to observe: ${preset.observe}` : "A setting of your own: compare the methods with the reference, and read each result with its claim tag.";
    $("rare-copula-row").style.display = s.r_problem === "cat" ? "" : "none";
    const errs = run && !run.c.ok ? run.c.errors : [];
    $("rare-errors").hidden = !errs.length;
    $("rare-errors").innerHTML = errs.length ? `<p>The setting has ${errs.length} ${errs.length === 1 ? "error" : "errors"}, so the page does not run it:</p><ul>${errs.map((/** @type {string} */ e) => `<li>${esc(e)}</li>`).join("")}</ul>` : "";
  }

  /** The parameter fields of the problem and its law. @param {Record<string, any>} s */
  function drawParams(s) {
    const box = $("rare-params"), k = JSON.stringify([s.r_problem, s.r_law, s.r_params]);
    if (box.dataset.key === k) return;
    box.dataset.key = k;
    const set = Ra.parseParams(s.r_params).values;
    box.innerHTML = Ra.paramsFor(s.r_problem, s.r_law).map((/** @type {any} */ x) => `<div class="param"><label for="rp-${esc(x.name)}"><span class="mono">${esc(x.name)}</span>${x.unit ? ` <span class="unit">[${esc(x.unit)}]</span>` : ""}</label>
<input id="rp-${esc(x.name)}" type="text" inputmode="decimal" spellcheck="false" data-rare-param="${esc(x.name)}" value="${esc(set[x.name] ?? String(x.def))}" aria-describedby="rpn-${esc(x.name)}">
<p class="note" id="rpn-${esc(x.name)}">${esc(x.text)}</p></div>`).join("");
    const sel = $("rare-sweep-param"), names = Ra.paramsFor(s.r_problem, s.r_law).map((/** @type {any} */ x) => x.name);
    sel.innerHTML = [`<option value="">Choose a parameter</option>`, ...names.map((/** @type {string} */ n) => `<option value="${esc(n)}"${n === s.r_sweep ? " selected" : ""}>${esc(n)}</option>`)].join("");
  }

  /** The card of the chosen method: its 6 parts with buttons that open its examples. @param {Record<string, any>} s */
  function drawMethodCard(s) {
    const m = data.rare.methods.find((/** @type {any} */ x) => x.id === s.r_method);
    const box = $("rare-method-card");
    if (box.dataset.key === m.id) return;
    box.dataset.key = m.id;
    box.innerHTML = `<h3>${esc(m.name)} <span class="label">${esc(m.family)}</span></h3><div class="formula" data-tex="${esc(m.estimator)}"></div><p>${esc(m.estimatorText)}</p>
<div class="cols"><div><h4>Assumptions</h4><ul>${m.assumptions.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul><h4>Settings</h4><ul>${m.settings.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
<div><h4>Suitable example</h4><p>${esc(m.suitable.text)} <button type="button" class="link" data-rare-open="${esc(m.suitable.preset)}">Open it</button></p>
<h4>Failure example</h4><p>${esc(m.failure.text)} <button type="button" class="link" data-rare-open="${esc(m.failure.preset)}">Open it</button></p>
<h4>Comparison with ${esc(NAME[m.comparison.with].toLowerCase())}</h4><p>${esc(m.comparison.text)} <button type="button" class="link" data-rare-open="${esc(m.comparison.preset)}">Open it</button></p></div></div>`;
  }

  /** The status line, the progress bar and the buttons. */
  function drawStatus() {
    const r = run;
    if (!r || !app || app.state.nav !== "rare") return;
    const done = r.c.ok ? r.acc.blocks / r.c.R : 0;
    $("rare-progress").value = done;
    $("rare-progress").textContent = `${Math.round(done * 100)} %`;
    const st = !r.c.ok ? "The setting has errors, so the page cannot run it." : r.status === "idle" ? "Ready. Press Run or Step." : `${r.status === "running" ? "Running" : r.status === "done" ? "Complete" : r.status === "paused" ? "Paused: the partial result is not complete" : r.status === "cancelled" ? "Cancelled" : "Stopped by an error"}: ${r.acc.blocks} of ${r.c.R} replications of ${count(r.c.N)} paths, ${fmt((r.elapsed + (r.status === "running" ? performance.now() - r.started : 0)) / 1000)} s, ${esc(r.mode || "not started")}.`;
    $("rare-status").textContent = `${st}${r.message ? ` ${r.message}` : ""}`;
    const busy = !r.c.ok || !!r.handle || r.acc.blocks >= r.c.R;
    $("rare-go").disabled = busy;
    $("rare-step").disabled = busy;
    $("rare-pause").disabled = !r.handle;
    $("rare-pause").setAttribute("aria-pressed", String(r.status === "paused"));
  }

  /** The parts that change while the run proceeds. @param {Record<string, any>} s */
  function drawRun(s) {
    drawStatus();
    const sm = summary();
    drawResults(s, sm);
    drawFigures(s, sm);
    drawPanels(s, sm);
    drawSweep(s);
    drawReplay(sm);
  }

  /** @param {any} q */
  function intervalCell(q) {
    if (q.est === null) return `<span class="note">${esc(q.how)}</span>`;
    if (q.lo === null) return `<span class="warn-text">${esc(q.how)}</span>`;
    return `${fmt(q.lo)} to ${fmt(q.hi)}<br><span class="note">${esc(q.how)}</span>`;
  }

  /** The table of estimates and the reference row, then the decision. @param {Record<string, any>} s @param {any} sm */
  function drawResults(s, sm) {
    const c = run?.c;
    if (!c?.ok) { $("rare-results").innerHTML = ""; $("rare-decision").innerHTML = ""; return; }
    const ref = referenceOf(c, s);
    const rows = [];
    const partial = run.status !== "done" && run.acc.blocks ? " <strong>Partial: the run is not complete.</strong>" : "";
    for (const m of sm ?? c.methods.map((/** @type {string} */ id) => ({ method: id, refused: c.refused[id], q: [] }))) {
      if (m.refused) { rows.push(`<tr><th scope="row">${esc(NAME[m.method])}</th><td colspan="5" class="bad-text">Refused: ${esc(m.refused)}</td></tr>`); continue; }
      if (m.error) { rows.push(`<tr><th scope="row">${esc(NAME[m.method])}</th><td colspan="5" class="bad-text">${esc(m.error)}</td></tr>`); continue; }
      c.quantities.forEach((/** @type {any} */ qu, /** @type {number} */ i) => {
        if (c.problem === "cat" && qu.name !== "systemic" && qu.name !== "extreme" && s.r_detail !== "all") return;
        const q = m.q[i] ?? { est: null, how: "no replication yet" };
        rows.push(`<tr><th scope="row">${esc(NAME[m.method])}</th><td>${esc(qu.label)}${qu.policy ? `<br><span class="note">${esc(qu.policy)}</span>` : ""}</td><td class="num">${fmt(q.est)}${q.hits !== undefined && q.hits !== null ? `<br><span class="note">${count(q.hits)} paths in the event</span>` : ""}</td><td class="num">${intervalCell(q)}</td>
<td class="num">${q.relErr ? fmt(q.relErr) : "–"}</td><td>${q.est !== null ? tag("observation") : ""}</td></tr>`);
      });
    }
    const refRow = ref.value === null ? `<p class="note">${esc(ref.how)} ${tag("theorem")}</p>`
      : `<p>Reference: <strong>${fmt(ref.value)}</strong>, ${esc(ref.how)}. ${tag(ref.kind === "exact" ? "theorem" : "numerical")}${ref.asymptotic ? `<br>Asymptotic: ${fmt(ref.asymptotic.value)}, ${esc(ref.asymptotic.how)}. ${tag("theorem")}` : ""}${ref.ldp && ref.ldp.I ? `<br>Large deviations: I(a) = ${fmt(ref.ldp.I)} at a = b/n = ${fmt(ref.ldp.a)}, and θ* = ${fmt(ref.ldp.theta)}. Chernoff bound: ${fmt(ref.ldp.chernoff)}. Bahadur–Rao: ${fmt(ref.ldp.bahadurRao)}. ${tag("theorem")}` : ref.ldp?.note ? `<br>${esc(ref.ldp.note)} ${tag("theorem")}` : ""}${ref.adjustment ? `<br>Adjustment coefficient R = ${fmt(ref.adjustment)}. Lundberg bound e^(−Ru) = ${fmt(ref.lundberg)}. ${tag("theorem")}` : ""}</p>`;
    const work = (sm ?? []).filter((/** @type {any} */ m) => !m.refused && !m.error).map((/** @type {any} */ m) => `${esc(NAME[m.method])}: ${count(m.work)} draws${m.wnrv ? `, work-normalised relative variance ${fmt(m.wnrv)}` : ""}.`).join(" ");
    $("rare-results").innerHTML = `<table><caption>Estimates after ${run.acc.blocks} of ${c.R} replications of ${count(c.N)} paths each, seed ${s.seed}.${partial}</caption>
<thead><tr><th scope="col">Method</th><th scope="col">Quantity</th><th scope="col">Estimate</th><th scope="col">95 % interval</th><th scope="col">Relative error</th><th scope="col">Claim</th></tr></thead><tbody>${rows.join("")}</tbody></table>
${refRow}${work ? `<p class="note">Work: ${work} The work counts the random jumps or events that each method draws. ${tag("observation")}</p>` : ""}
${c.problem === "cat" ? `<p class="row"><label class="check"><input type="checkbox" id="rare-detail"${s.r_detail === "all" ? " checked" : ""}> Show every quantity of each policy</label></p>` : ""}`;
    drawDecision(s, sm);
  }

  /** @param {Record<string, any>} s @param {any} sm */
  function drawDecision(s, sm) {
    const c = run.c, first = sm?.find((/** @type {any} */ m) => !m.refused && !m.error);
    const dec = first ? Ra.decide(c, first) : null;
    if (c.problem !== "cat") {
      $("rare-decision").innerHTML = `<p>Target: P ≤ ${fmt(c.p.target)}. ${dec ? `${esc(NAME[first.method])}: <span class="verdict-${dec.rows[0].verdict.replace(/ /g, "-")}">${esc(dec.rows[0].verdict)}</span>. ${tag("observation")}` : "Run the lab to compare the estimate with the target."}</p>`;
      return;
    }
    const cat = c.cat;
    $("rare-decision").innerHTML = `<p>Choose the cheapest policy with P(at least ${c.p.m} defaults by T = ${fmt(c.p.T)} years) ≤ ${fmt(c.p.target)}.</p>
<table><thead><tr><th scope="col">Policy</th><th scope="col">Capital and premium</th><th scope="col">Cost over T</th><th scope="col">P(systemic ruin)</th><th scope="col">Target</th></tr></thead><tbody>${cat.policies.map((/** @type {any} */ pol, /** @type {number} */ a) => {
      const q = first?.q[3 * a], v = dec?.rows[a]?.verdict ?? "unknown";
      return `<tr${dec && dec.best === a ? ' class="best"' : ""}><th scope="row">${esc(pol.label)}${dec && dec.best === a ? " ★ chosen" : ""}</th><td>u = ${fmt(pol.u)}, c = ${fmt(pol.c)} a year</td><td class="num">${fmt(pol.cost)}<br><span class="note">${esc(pol.costText)}</span></td><td class="num">${q ? `${fmt(q.est)}${q.lo !== null && q.lo !== undefined ? `<br><span class="note">${fmt(q.lo)} to ${fmt(q.hi)}</span>` : ""}` : "–"}</td><td><span class="verdict-${v.replace(/ /g, "-")}">${esc(v)}</span></td></tr>`;
    }).join("")}</tbody></table>
<p>${dec ? dec.best === null ? "No policy meets the target with this run." : `${esc(cat.policies[dec.best].label)} is the cheapest policy that ${dec.separated ? "meets the target: its whole interval is below it" : "can meet the target: its interval holds the target, so the run needs more replications before this choice"}.` : "Run the lab to compare the policies."} ${tag("observation")}</p>
<p class="note">Exact values ${tag("theorem")}</p><ul class="note"><li>E N(T) = ${fmt(cat.EN)} events.</li><li>Mean event loss: ${fmt(cat.meanS)}.</li><li>Expected loss of each insurer: ${fmt(cat.expectedLoss)} a year.</li><li>Safety loading: ${cat.loading === null ? "not defined, because the mean loss is infinite" : fmt(cat.loading)}.</li><li>Expected recoveries of the layer for each event: ${fmt(cat.ceded)}.</li><li>Layer price for each insurer: ${fmt(cat.price)} a year.</li></ul>
${first?.risk ? `<p>Total loss over T: VaR at ${fmt(c.p.q)} = ${fmt(first.risk.var)}; ES = ${first.risk.es === null ? "<strong>no number</strong>" : fmt(first.risk.es)}. ${esc(first.risk.how[0].toUpperCase() + first.risk.how.slice(1))}${first.risk.how.endsWith(".") ? "" : "."} ${tag("numerical")} ${tag("observation")}</p>` : ""}`;
  }

  /* ---------- figures ---------- */

  /** @param {string} label @param {string} body @param {number} [h] */
  const svg = (label, body, h = H) => `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>${body}</svg>`;

  /**
   * Axes, grid, ticks and titles. Returns the scales and the markup.
   * @param {{ x: [number, number], y: [number, number], xlog?: boolean, ylog?: boolean, xlabel: string, ylabel: string }} o
   */
  function axes(o) {
    const sx = P.scale(o.x[0], o.x[1], M.l, W - M.r, !!o.xlog), sy = P.scale(o.y[0], o.y[1], H - M.b, M.t, !!o.ylog);
    const xt = o.xlog ? P.logTicks(o.x[0], o.x[1]) : P.ticks(o.x[0], o.x[1], 6), yt = o.ylog ? P.logTicks(o.y[0], o.y[1]) : P.ticks(o.y[0], o.y[1], 5);
    const xs = xt.length > 1 ? xt[1] - xt[0] : 0, ys = yt.length > 1 ? yt[1] - yt[0] : 0;
    const parts = ['<g class="grid">', ...yt.map((/** @type {number} */ v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/>`), '</g><g class="axis">',
      `<line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/><line x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/></g><g class="tick">`,
      ...xt.map((/** @type {number} */ v) => `<text x="${sx(v).toFixed(1)}" y="${H - M.b + 17}" text-anchor="middle">${esc(o.xlog ? P.fmt(v) : P.tickLabel(v, xs))}</text>`),
      ...yt.map((/** @type {number} */ v) => `<text x="${M.l - 6}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end">${esc(o.ylog ? P.fmt(v) : P.tickLabel(v, ys))}</text>`), "</g>",
      `<text class="axis-title" x="${(M.l + W - M.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(o.xlabel)}</text>`,
      `<text class="axis-title" transform="translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">${esc(o.ylabel)}</text>`];
    return { sx, sy, markup: parts.join("") };
  }
  /** A log range around positive values. @param {number[]} vals @returns {[number, number]} */
  function logRange(vals) {
    const pos = vals.filter((v) => v > 0 && Number.isFinite(v));
    if (!pos.length) return [1e-6, 1];
    let lo = 10 ** Math.floor(Math.log10(Math.min(...pos))), hi = 10 ** Math.ceil(Math.log10(Math.max(...pos)));
    if (lo === hi) { lo /= 10; hi *= 10; }
    return [lo, hi];
  }
  /** @param {number[]} xs @param {number[]} ys @param {(v: number) => number} sx @param {(v: number) => number} sy */
  const line = (xs, ys, sx, sy) => xs.map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(ys[i]).toFixed(1)}`).join("");

  /** The estimate of each method against its work, with its interval as a band and the reference as a dashed line. @param {any} c @param {any[]} trace @param {any} ref */
  function convergenceChart(c, trace, ref) {
    const methods = c.methods.filter((/** @type {string} */ m) => !c.refused[m]);
    /** @type {{ m: string, pts: any[] }[]} */
    const series = methods.map((/** @type {string} */ m) => {
      const k = c.methods.indexOf(m);
      return { m, pts: trace.map((/** @type {any} */ t) => t.methods[k]).filter((/** @type {any} */ p) => p && p.est !== null && p.est > 0 && p.work > 0) };
    });
    const label = `Estimate of ${c.quantities[0].label} against the work of each method, log axes${ref.value !== null ? ", with the reference as a dashed line" : ""}`;
    const all = series.flatMap((x) => x.pts);
    if (!all.length) return svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">No positive estimate yet: run the lab.</text>`);
    const ys = [...all.flatMap((p) => [p.est, p.lo, p.hi]), ...(ref.value ? [ref.value] : [])].filter((v) => v !== null && v > 0);
    const xr = /** @type {[number, number]} */ ([Math.min(...all.map((p) => p.work)), Math.max(...all.map((p) => p.work))]);
    if (xr[1] <= xr[0]) xr[1] = xr[0] * 2;
    const f = axes({ x: xr, y: logRange(ys), xlog: true, ylog: true, xlabel: "Work: random draws (log axis)", ylabel: `${c.quantities[0].label} (log axis)` });
    const parts = [f.markup];
    series.forEach((x, i) => {
      const band = x.pts.filter((p) => p.lo > 0 && p.hi > 0);
      if (band.length > 1) parts.push(`<path class="band" d="M${band.map((p) => `${f.sx(p.work).toFixed(1)} ${f.sy(p.hi).toFixed(1)}`).join("L")}L${band.slice().reverse().map((p) => `${f.sx(p.work).toFixed(1)} ${f.sy(p.lo).toFixed(1)}`).join("L")}Z"/>`);
      if (x.pts.length) parts.push(`<path class="series s${i + 1}" d="${line(x.pts.map((p) => p.work), x.pts.map((p) => p.est), f.sx, f.sy)}"/>`);
    });
    if (ref.value) parts.push(`<line class="ref" x1="${M.l}" x2="${W - M.r}" y1="${f.sy(ref.value).toFixed(1)}" y2="${f.sy(ref.value).toFixed(1)}"/>`);
    parts.push(`<text class="direct-label" x="${W - M.r}" y="${M.t - 4}" text-anchor="end">${esc(series.map((x, i) => `${i ? "orange" : "blue"}: ${NAME[x.m]}`).join(" · "))}${ref.value ? " · dashed: reference" : ""}</text>`);
    return svg(label, parts.join(""));
  }

  /** The tail plot: the reference curves and the run's estimate at the threshold; for the test, the survival function of the total loss. @param {any} c @param {any} ref @param {any} sm */
  function tailChart(c, ref, sm) {
    if (c.problem === "cat") {
      const m = sm?.find((/** @type {any} */ x) => x.risk);
      const label = "Survival function P(L > x) of the total loss over T from the weighted paths, log axes, with the value at risk and the expected shortfall";
      const a = run.acc.methods.find((/** @type {any} */ x) => x.grid);
      if (!m || !a) return svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Run direct simulation or a change of measure to draw the total loss.</text>`);
      const grid = c.cat.grid, sf = Array.from(a.grid.exceed, (/** @type {number} */ v) => v / a.grid.n);
      const pts = grid.map((/** @type {number} */ x, /** @type {number} */ i) => [x, sf[i]]).filter((/** @type {number[]} */ p) => p[1] > 0);
      if (pts.length < 2) return svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Too few paths to draw the tail.</text>`);
      const f = axes({ x: [pts[0][0], pts[pts.length - 1][0]], y: logRange(pts.map((/** @type {number[]} */ p) => p[1])), xlog: true, ylog: true, xlabel: "Total loss x over T (log axis)", ylabel: "P(L > x) (log axis)" });
      const parts = [f.markup, `<path class="series s1" d="${line(pts.map((/** @type {number[]} */ p) => p[0]), pts.map((/** @type {number[]} */ p) => p[1]), f.sx, f.sy)}"/>`];
      for (const [v, name] of [[m.risk.var, "VaR"], [m.risk.es, "ES"]]) if (v) parts.push(`<line class="ref" x1="${f.sx(v).toFixed(1)}" x2="${f.sx(v).toFixed(1)}" y1="${M.t}" y2="${H - M.b}"/><text class="direct-label" x="${(f.sx(v) + 4).toFixed(1)}" y="${M.t + 12}">${name} ${esc(fmt(v))}</text>`);
      return svg(label, parts.join(""));
    }
    const cv = ref.curves, label = `${c.problem === "sum" ? "P(S_n > x)" : "ψ(u)"} against ${c.problem === "sum" ? "x" : "u"}: the reference, the bounds and the asymptotic on a log axis, with the run's estimate at the threshold`;
    const series = /** @type {{ name: string, cls: string, y: (number | null)[], x?: number[] }[]} */ ([]);
    if (cv.exact) series.push({ name: "exact", cls: "series s2 ref-law", y: cv.exact });
    if (cv.chernoff) series.push({ name: "Chernoff bound", cls: "series s3 dashed", y: cv.chernoff });
    if (cv.bahadurRao) series.push({ name: "Bahadur–Rao", cls: "series s4", y: cv.bahadurRao });
    if (cv.lundberg) series.push({ name: "Lundberg bound", cls: "series s3 dashed", y: cv.lundberg });
    if (cv.asymptotic) series.push({ name: "asymptotic", cls: "series s3 dashed", y: cv.asymptotic });
    const est = sm?.find((/** @type {any} */ m) => !m.refused && !m.error && m.q[0]?.est > 0)?.q[0];
    const ys = [...series.flatMap((x) => x.y), ...(cv.numerical?.y ?? []), ...(est ? [est.est, est.lo, est.hi] : [])].filter((v) => v !== null && v > 0 && v <= 1);
    const f = axes({ x: [cv.x[0], cv.x[cv.x.length - 1]], y: logRange(/** @type {number[]} */ (ys)), ylog: true, xlabel: c.problem === "sum" ? "Threshold x" : "Initial capital u", ylabel: c.problem === "sum" ? "P(S_n > x) (log axis)" : "ψ(u) (log axis)" });
    const parts = [f.markup];
    for (const x of series) {
      const xs = cv.x.filter((/** @type {number} */ _, /** @type {number} */ i) => /** @type {number} */ (x.y[i]) > 0), y = x.y.filter((v) => /** @type {number} */ (v) > 0);
      if (xs.length > 1) parts.push(`<path class="${x.cls}" d="${line(xs, /** @type {number[]} */ (y), f.sx, f.sy)}"/>`);
    }
    if (cv.numerical) for (let i = 0; i < cv.numerical.x.length; i++) if (cv.numerical.y[i] > 0) parts.push(`<circle class="dot s2" cx="${f.sx(cv.numerical.x[i]).toFixed(1)}" cy="${f.sy(cv.numerical.y[i]).toFixed(1)}" r="3"/>`);
    parts.push(`<line class="ref" x1="${f.sx(c.x0).toFixed(1)}" x2="${f.sx(c.x0).toFixed(1)}" y1="${M.t}" y2="${H - M.b}"/>`);
    if (est) {
      if (est.lo > 0 && est.hi > 0) parts.push(`<line class="series s1" x1="${f.sx(c.x0).toFixed(1)}" x2="${f.sx(c.x0).toFixed(1)}" y1="${f.sy(est.lo).toFixed(1)}" y2="${f.sy(est.hi).toFixed(1)}"/>`);
      parts.push(`<circle class="dot s1" cx="${f.sx(c.x0).toFixed(1)}" cy="${f.sy(est.est).toFixed(1)}" r="5"/>`);
    }
    parts.push(`<text class="direct-label" x="${W - M.r}" y="${M.t - 4}" text-anchor="end">${esc([...series.map((x) => x.name), ...(cv.numerical ? ["dots: Asmussen–Kroese reference"] : []), "blue dot: this run"].join(" · "))}</text>`);
    return svg(label, parts.join(""));
  }

  /** The stages or levels of the chosen method in its last replication, as bars. @param {any} c @param {any} acc */
  function stagesChart(c, acc) {
    const k = c.methods.findIndex((/** @type {string} */ m) => !c.refused[m] && ["splitting", "subset", "ce", "ais"].includes(m));
    const m = k < 0 ? null : acc.methods[k], d = m?.diags.at(-1);
    const id = k < 0 ? "" : c.methods[k];
    const label = `${NAME[id] ?? "No multistage method"}: ${id === "splitting" ? "the fraction of paths that reach each level, and the part that entered past it" : id === "subset" ? "the fraction of samples above each level" : id === "ce" ? "the level and the parameter of each iteration" : id === "ais" ? "the twist and the paths in the event of each step" : "nothing to draw"}`;
    if (!d) return svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">${k < 0 ? "Choose splitting, subset simulation, adaptive importance sampling or the cross-entropy method to see its stages." : "Run the lab to draw the stages."}</text>`);
    const pol = c.problem === "cat" ? d.policies?.[0] ?? null : d;
    if (!pol) return svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">No stages yet.</text>`);
    /** @type {{ v: number, label: string, part?: number }[]} */
    let bars = [];
    let ylabel = "";
    if (id === "splitting") { bars = pol.fractions.map((/** @type {number} */ v, /** @type {number} */ i) => ({ v, part: pol.early[i], label: `stage ${i + 1}` })); ylabel = "Fraction of paths that reach the level"; }
    else if (id === "subset") { bars = pol.fractions.map((/** @type {number} */ v, /** @type {number} */ i) => ({ v, label: `γ = ${fmt(pol.thresholds[i])}` })); ylabel = "Fraction above the level"; }
    else if (id === "ce") { const top = c.problem === "cat" ? c.p.m : c.x0; bars = pol.path.slice(1).map((/** @type {any} */ x, /** @type {number} */ i) => ({ v: x.gamma / top, label: `${i + 1}: ${x.q.r !== undefined ? `r ${fmt(x.q.r)}` : `v ${fmt(x.q.v)}`}` })); ylabel = "Level γ_t as a fraction of the event level"; }
    else { bars = pol.path.slice(1).map((/** @type {any} */ x, /** @type {number} */ i) => ({ v: x.r, label: `${i + 1}: ${x.hits} in A` })); ylabel = "Twist r after the step"; }
    const top = Math.max(1, ...bars.map((b) => b.v));
    const f = axes({ x: [0, bars.length], y: [0, top], xlabel: id === "ce" || id === "ais" ? "Iteration (the label shows the parameter or the paths in the event)" : "Stage", ylabel });
    const bw = ((W - M.l - M.r) / Math.max(1, bars.length)) * 0.7;
    const parts = [f.markup];
    bars.forEach((b, i) => {
      const x = f.sx(i + 0.5) - bw / 2;
      parts.push(`<rect class="bar s1" x="${x.toFixed(1)}" y="${f.sy(b.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(f.sy(0) - f.sy(b.v)).toFixed(1)}"/>`);
      if (b.part) parts.push(`<rect class="bar s2" x="${x.toFixed(1)}" y="${f.sy(b.part).toFixed(1)}" width="${bw.toFixed(1)}" height="${(f.sy(0) - f.sy(b.part)).toFixed(1)}"/>`);
      if (bars.length <= 12) parts.push(`<text class="direct-label" x="${(x + bw / 2).toFixed(1)}" y="${(f.sy(b.v) - 4).toFixed(1)}" text-anchor="middle">${esc(b.label)}</text>`);
    });
    if (id === "splitting") parts.push(`<text class="direct-label" x="${W - M.r}" y="${M.t - 4}" text-anchor="end">blue: reached the level · orange: entered the stage already past it</text>`);
    return svg(label, parts.join(""));
  }

  /** @param {Record<string, any>} s @param {any} sm */
  function drawFigures(s, sm) {
    const c = run?.c;
    for (const id of ["rare-conv", "rare-comparison", "rare-stages", "rare-tail"]) if (!c?.ok) $(id).innerHTML = "";
    if (!c?.ok) return;
    const ref = referenceOf(c, s);
    $("rare-conv").innerHTML = convergenceChart(c, run.acc.trace, ref);
    const rows = (sm ?? []).filter((/** @type {any} */ m) => !m.refused && !m.error).map((/** @type {any} */ m) => ({ label: NAME[m.method], est: m.q[0].est, lo: m.q[0].lo, hi: m.q[0].hi, reference: ref.value }));
    $("rare-comparison").innerHTML = P.comparison({ rows, ylabel: c.quantities[0].label + (c.quantities[0].policy ? `, ${c.quantities[0].policy}` : "") });
    $("rare-stages").innerHTML = stagesChart(c, run.acc);
    $("rare-tail").innerHTML = tailChart(c, ref, sm);
  }

  /* ---------- assumptions, diagnostics and interpretation ---------- */

  /** @param {Record<string, any>} s @param {any} sm */
  function drawPanels(s, sm) {
    const c = run?.c, pr = data.rare.problems.find((/** @type {any} */ x) => x.id === s.r_problem);
    $("rare-assumptions").innerHTML = [["Decision and estimated quantity", pr.decision], ["Reason for the model", pr.reason], ["Parameters, units, data and assumptions", pr.inputs], ["Dependence and process model", pr.dependence]].map(([h, t]) => `<h4>${esc(h)}</h4><p>${esc(t)}</p>`).join("")
      + (c?.ok ? `<h4>Methods of this run</h4><ul>${c.methods.map((/** @type {string} */ m) => `<li>${esc(NAME[m])}: ${c.refused[m] ? `<span class="bad-text">refused. ${esc(c.refused[m])}</span>` : esc(data.rare.methods.find((/** @type {any} */ x) => x.id === m).assumptions[0])}</li>`).join("")}</ul>` : "");
    const diag = [];
    for (const m of sm ?? []) {
      if (m.refused || m.error || !m.diag) continue;
      const d = m.diag, last = d.last ?? {};
      const items = [];
      if (d.ess !== null && d.ess !== undefined) items.push(`effective sample size of the weights in the event ${fmt(d.ess)} (mean over the replications), largest share of one weight ${fmt(d.maxShare)}. The effective sample size is a diagnostic, not a proof of convergence.`);
      if (last.infiniteVariance) items.push(`<strong class="bad-text">The proposal family has a lighter tail than the target, so f/g is unbounded and the variance of the weights is infinite. The interval is not valid.</strong>`);
      if (last.reached === false || last.policies?.some((/** @type {any} */ x) => x.reached === false)) items.push("The levels did not reach the event within the iteration limit. The estimate uses the last proposal. This estimate has no bias, but its variance can be large.");
      if (last.adapted === false) items.push("<strong>No adaptation step had a path in the event, so the proposal stayed at its start.</strong>");
      if (d.accept !== null && d.accept !== undefined) items.push(`Acceptance rate of the chain moves: ${fmt(d.accept)}. Acceptance rate of the component proposals: ${fmt(last.componentAccept)} (spread ${fmt(last.spread)}).`);
      if (last.early) items.push(`fraction of the entrants of each stage that were already past its level: ${last.early.map((/** @type {number} */ x) => fmt(x)).join(", ")}.`);
      if (last.bound) items.push(`every weight is at most 1/β = ${fmt(last.bound)}.`);
      if (d.events !== null && d.events !== undefined) items.push(`mean number of events ${fmt(d.events)} against the exact E N(T) = ${fmt(c.cat.EN)}.`);
      diag.push(`<li><strong>${esc(NAME[m.method])}</strong>: ${items.join(" ") || "no diagnostic beyond the interval."} ${tag("observation")}</li>`);
    }
    $("rare-diagnostics").innerHTML = `${diag.length ? `<ul>${diag.join("")}</ul>` : '<p class="note">Run the lab to see the diagnostics of each method.</p>'}<p>${esc(pr.diagnostics)}</p>`;
    $("rare-interpretation").innerHTML = `<p>${esc(pr.interpretation)}</p><p class="note">${esc(pr.data)}</p>`;
  }

  /* ---------- sweep ---------- */

  /** Run the sweep: direct simulation, or the method of the run, at each value, for each policy. @param {Record<string, any>} s */
  function startSweep(s) {
    sweep?.handle?.cancel();
    if (!s.r_sweep) { $("rare-sweep-status").textContent = "Choose a parameter to sweep."; return; }
    const pts = s.r_points, xs = Array.from({ length: pts }, (_, i) => s.r_from + ((s.r_to - s.r_from) * i) / (pts - 1));
    const sw = { key: keyOf(s) + s.r_sweep, x: xs, rows: /** @type {any[]} */ ([]), i: 0, handle: /** @type {any} */ (null), error: "", method: s.r_method };
    sweep = sw;
    const next = () => {
      if (sweep !== sw || sw.i >= xs.length) { schedule(); return; }
      const record = Ra.withParam(recordOf(s), s.r_sweep, xs[sw.i]);
      const settings = { ...settingsOf(s), compare: "none", reps: Math.min(8, s.r_reps), size: Math.min(s.r_size, 11) };
      const c = Ra.prepare(record, settings);
      if (!c.ok) { sw.error = `At ${s.r_sweep} = ${fmt(xs[sw.i])}: ${c.errors[0]}`; schedule(); return; }
      if (c.refused[c.method]) { sw.error = `At ${s.r_sweep} = ${fmt(xs[sw.i])}: ${c.refused[c.method]}`; schedule(); return; }
      let acc = Ra.empty(c);
      sw.handle = getPool().run({ record, settings, opts: {}, from: 0, to: c.R }, {
        onBlock(/** @type {any} */ b) { acc = Ra.merge(acc, b, c); },
        onEnd(/** @type {string} */ status, /** @type {string} */ message) {
          if (sweep !== sw) return;
          sw.handle = null;
          if (status !== "done") { sw.error = message || `The sweep stopped: ${status}.`; schedule(); return; }
          const m = Ra.summary(c, acc)[0];
          sw.rows.push({ x: xs[sw.i], q: c.problem === "cat" ? c.cat.policies.map((/** @type {any} */ _, /** @type {number} */ a) => m.q[3 * a]) : [m.q[0]], best: Ra.decide(c, m)?.best ?? null, ref: c.problem === "cat" ? null : Ra.reference(c).value, target: c.p.target, labels: c.problem === "cat" ? c.cat.policies.map((/** @type {any} */ p) => p.label) : [c.quantities[0].label] });
          sw.i++;
          schedule();
          next();
        },
      });
    };
    next();
    schedule();
  }

  /** @param {Record<string, any>} s */
  function drawSweep(s) {
    const sw = sweep && sweep.key === keyOf(s) + s.r_sweep ? sweep : null;
    $("rare-sweep-status").textContent = !sw ? `Each point runs ${NAME[s.r_method].toLowerCase()} with at most 8 replications of 2^${Math.min(s.r_size, 11)} paths${s.r_problem === "cat" ? " for each policy" : ""}.` : sw.error || (sw.rows.length < sw.x.length ? `Point ${sw.rows.length + 1} of ${sw.x.length}.` : `Complete: ${sw.x.length} points.`);
    const label = `Sweep of ${s.r_sweep || "a parameter"}: the estimate${s.r_problem === "cat" ? " of P(systemic ruin) for each policy, with the target as a dashed line and the chosen policy at each value" : " with its interval and the reference"}`;
    if (!sw || sw.rows.length < 1) { $("rare-sweep").innerHTML = svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Choose a parameter and run the sweep.</text>`); $("rare-sweep-table").innerHTML = ""; return; }
    const rows = /** @type {any[]} */ (sw.rows), k = rows[0].q.length;
    const ys = [...rows.flatMap((r) => r.q.flatMap((/** @type {any} */ q) => [q.est, q.lo, q.hi])), ...rows.map((r) => r.ref), rows[0].target].filter((v) => v !== null && v !== undefined && v > 0);
    const xr = /** @type {[number, number]} */ ([rows[0].x, rows.at(-1).x > rows[0].x ? rows.at(-1).x : rows[0].x + 1]);
    const f = axes({ x: xr, y: logRange(ys), ylog: true, xlabel: s.r_sweep, ylabel: s.r_problem === "cat" ? "P(systemic ruin) (log axis)" : "Probability (log axis)" });
    const parts = [f.markup, `<line class="ref" x1="${M.l}" x2="${W - M.r}" y1="${f.sy(rows[0].target).toFixed(1)}" y2="${f.sy(rows[0].target).toFixed(1)}"/>`];
    for (let a = 0; a < k; a++) {
      const pts = rows.filter((r) => r.q[a].est > 0);
      if (pts.length > 1) parts.push(`<path class="series s${a + 1}" d="${line(pts.map((r) => r.x), pts.map((r) => r.q[a].est), f.sx, f.sy)}"/>`);
      for (const r of pts) parts.push(`<circle class="dot s${a + 1}" cx="${f.sx(r.x).toFixed(1)}" cy="${f.sy(r.q[a].est).toFixed(1)}" r="3.5"/>`);
    }
    const refs = rows.filter((r) => r.ref > 0);
    if (refs.length > 1) parts.push(`<path class="series s4 ref-law" d="${line(refs.map((r) => r.x), refs.map((r) => r.ref), f.sx, f.sy)}"/>`);
    parts.push(`<text class="direct-label" x="${W - M.r}" y="${M.t - 4}" text-anchor="end">${esc(rows[0].labels.map((/** @type {string} */ l, /** @type {number} */ i) => `${["blue", "orange", "green"][i] ?? ""}: ${l}`).join(" · "))} · dashed: target</text>`);
    $("rare-sweep").innerHTML = svg(label, parts.join(""));
    $("rare-sweep-table").innerHTML = s.r_problem !== "cat" ? "" : `<table><caption>The policy that the run chooses at each value of ${esc(s.r_sweep)}</caption><thead><tr><th scope="col">${esc(s.r_sweep)}</th>${rows[0].labels.map((/** @type {string} */ l) => `<th scope="col">${esc(l)}</th>`).join("")}<th scope="col">Chosen</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${fmt(r.x)}</th>${r.q.map((/** @type {any} */ q) => `<td class="num">${fmt(q.est)}</td>`).join("")}<td>${r.best === null ? "none meets the target" : esc(r.labels[r.best])}</td></tr>`).join("")}</tbody></table><p class="note">Each value is a finite-run observation. ${tag("observation")}</p>`;
  }

  /* ---------- records ---------- */

  /** The rare-event run record: everything a replay needs, with the results. */
  function runRecord() {
    const s = app.state, sm = summary();
    return {
      format: "monte-carlo-workbench/rare-run", version: 1, created: new Date().toISOString(),
      generator: { name: "Philox4x32-10", version: Rng.VERSION, streams: Rng.SCHEME, stream: `${Ra.STREAM}/<problem>/<method>, replication b` },
      seed: s.seed, record: recordOf(s), settings: settingsOf(s), status: run?.status ?? "idle", replications: run?.acc?.blocks ?? 0,
      reference: run?.c.ok ? (({ curves, ...rest }) => rest)(referenceOf(run.c, s)) : null,
      results: (sm ?? []).map((/** @type {any} */ m) => ({ method: m.method, refused: m.refused || null, error: m.error || null, work: m.work ?? 0, quantities: m.refused ? [] : run.c.quantities.map((/** @type {any} */ q, /** @type {number} */ i) => ({ name: q.name, policy: q.policy ?? null, label: q.label, estimate: m.q[i].est, lo: m.q[i].lo, hi: m.q[i].hi, interval: m.q[i].how })), risk: m.risk ?? null })),
      environment: { userAgent: navigator.userAgent },
      replay: "The same seed, record and settings give the same integer stream. Floating-point results can differ in the last digits between browsers.",
    };
  }

  /** Load a run record: set its record and settings, then compare the replay with it. @param {any} doc */
  function loadRun(doc) {
    if (!doc || doc.format !== "monte-carlo-workbench/rare-run") throw new Error("The file is not a rare-event run record of this page.");
    if (doc.version !== 1) throw new Error(`The record uses version ${String(doc.version).slice(0, 10)}. This page reads version 1.`);
    const c = Ra.prepare(doc.record, doc.settings);
    if (!c.ok) throw new Error(`The record has errors: ${c.errors[0]}`);
    expected = { key: "", doc };
    app.set({ nav: "rare", r_problem: doc.record.problem, r_law: doc.record.law, r_copula: doc.record.copula ?? "gumbel", r_params: doc.record.params ?? "", r_method: doc.settings.method, r_compare: doc.settings.compare ?? "none", r_failure: doc.settings.failure ?? "none", r_options: doc.settings.options ?? "", r_size: doc.settings.size, r_reps: doc.settings.reps, seed: doc.seed });
    expected.key = keyOf(app.state);
  }

  /** @param {any} sm */
  function drawReplay(sm) {
    const box = $("rare-replay");
    if (!expected) { box.textContent = ""; return; }
    if (!run || run.status !== "done" || !sm) { box.textContent = `Replay of the loaded record: ${run?.status === "running" ? "the run proceeds" : "complete the run to compare"}.`; return; }
    let same = 0, close = 0, off = 0;
    sm.forEach((/** @type {any} */ m, /** @type {number} */ i) => (m.q ?? []).forEach((/** @type {any} */ q, /** @type {number} */ k) => {
      const e = expected.doc.results[i]?.quantities[k]?.estimate;
      if (e === q.est) same++;
      else if (e !== null && e !== undefined && q.est !== null && Math.abs(e - q.est) <= 1e-12 * Math.max(1, Math.abs(e))) close++;
      else off++;
    }));
    box.textContent = `Replay: ${same} estimates identical, ${close} equal up to the last digits, ${off} different.${off ? " A difference means that the record, the settings or the page version differ." : ""}`;
  }

  /** The estimates as CSV, one row for each method and quantity. */
  function resultsCsv() {
    const sm = summary(), s = app.state;
    /** @param {unknown} v */
    const cell = (v) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = [["problem", "law", "method", "quantity", "policy", "estimate", "lo", "hi", "interval", "relative_error", "work", "seed"].join(",")];
    for (const m of sm ?? []) {
      if (m.refused || m.error) { rows.push([s.r_problem, s.r_law, m.method, "", "", "", "", "", m.refused || m.error, "", "", s.seed].map(cell).join(",")); continue; }
      run.c.quantities.forEach((/** @type {any} */ q, /** @type {number} */ i) => rows.push([s.r_problem, s.r_law, m.method, q.label, q.policy ?? "", m.q[i].est, m.q[i].lo, m.q[i].hi, m.q[i].how, m.q[i].relErr, m.work, s.seed].map(cell).join(",")));
    }
    return `${rows.join("\n")}\n`;
  }

  /* ---------- report, tool and commands ---------- */

  /** The plain-data report of the lab for the deck and the Markdown record. @param {Record<string, any>} s */
  function report(s) {
    if (!run || run.key !== keyOf(s)) run = newRun(s);
    return Ra.report(run.c, summary(), run.c.ok ? referenceOf(run.c, s) : null, data.rare, { status: run.status, replications: run.acc?.blocks ?? 0, seed: s.seed });
  }

  const tool = {
    name: "get_rare_run",
    description: "Return the rare-event lab of the current view: the problem record, the method settings, the status of the run, each method's estimates with intervals and claim tags or its refusal, the reference (exact, numerical or asymptotic), the diagnostics and, for the catastrophe test, the policies, their costs and the decision.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      if (run?.key !== keyOf(app.state)) run = newRun(app.state);
      const sm = summary(), c = run.c;
      const body = c.ok ? { ...runRecord(), decision: sm ? sm.map((/** @type {any} */ m) => ({ method: m.method, decision: Ra.decide(c, m) })) : null, policies: c.cat?.policies ?? null, diagnostics: (sm ?? []).map((/** @type {any} */ m) => ({ method: m.method, diag: m.diag ? { ess: m.diag.ess ?? null, maxShare: m.diag.maxShare ?? null, accept: m.diag.accept ?? null, events: m.diag.events ?? null } : null })) } : { errors: c.errors, record: recordOf(app.state) };
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    },
  };

  const commands = [
    { label: "Open the rare-event lab", run: () => app.set({ nav: "rare" }) },
    { label: "Run the rare-event lab", run: () => { app.set({ nav: "rare" }); start(); } },
    { label: "Step one replication of the rare-event lab", run: step },
    { label: "Reset the rare-event run", run: reset },
    { label: "Save the rare-event run record", run: () => save(`rare-${app.state.r_problem}-run.json`, `${JSON.stringify(runRecord(), null, 2)}\n`, "application/json") },
  ];
  /** @type {(name: string, body: string, type: string) => void} */
  let save = () => {};

  /**
   * Bind the controls of the lab. hooks holds view.js's save and its SVG and PNG exports.
   * @param {any} a the kit's app @param {any} catalogue @param {{ save: (name: string, body: string, type: string) => void, saveSvg: (id: string, name: string) => void, savePng: (id: string, name: string) => void }} hooks
   */
  function bind(a, catalogue, hooks) {
    app = a;
    data = catalogue;
    save = hooks.save;
    document.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement} */ (e.target).closest?.("button");
      if (!t) return;
      if (t.dataset.rareOpen) open(t.dataset.rareOpen);
      else if (t.dataset.rareMethod) app.set({ nav: "rare", r_method: t.dataset.rareMethod });
    });
    $("rare-params").addEventListener("change", (/** @type {Event} */ e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      if (!el.dataset.rareParam) return;
      const vals = Ra.parseParams(app.state.r_params).values, spec = Ra.paramsFor(app.state.r_problem, app.state.r_law).find((/** @type {any} */ x) => x.name === el.dataset.rareParam);
      const v = el.value.trim().replace(/;/g, "");
      if (!v || Number(v) === spec?.def) delete vals[el.dataset.rareParam];
      else vals[el.dataset.rareParam] = v;
      app.set({ r_params: Object.entries(vals).map(([k, x]) => `${k}=${x}`).join("; ").slice(0, 300) });
    });
    $("rare-search").addEventListener("input", () => app.set({ q: $("rare-search").value.slice(0, 200) }, "replace"));
    $("rare-go").addEventListener("click", start);
    $("rare-step").addEventListener("click", step);
    $("rare-pause").addEventListener("click", pause);
    $("rare-reset").addEventListener("click", reset);
    $("rare-autorun").addEventListener("change", () => { autorun = $("rare-autorun").checked; });
    $("rare-results").addEventListener("change", (/** @type {Event} */ e) => { if (/** @type {HTMLElement} */ (e.target).id === "rare-detail") app.set({ r_detail: /** @type {HTMLInputElement} */ (e.target).checked ? "all" : "" }); });
    $("rare-sweep-param").addEventListener("change", () => {
      const name = $("rare-sweep-param").value, spec = Ra.paramsFor(app.state.r_problem, app.state.r_law).find((/** @type {any} */ x) => x.name === name);
      if (!spec) { app.set({ r_sweep: "" }); return; }
      const cur = Number(Ra.parseParams(app.state.r_params).values[name] ?? spec.def);
      const lo = Math.max(spec.min, cur / 2), hi = Math.min(spec.max, cur === 0 ? 1 : cur * 2);
      app.set({ r_sweep: name, r_from: +lo.toPrecision(4), r_to: +hi.toPrecision(4) });
    });
    $("rare-sweep-run").addEventListener("click", () => startSweep(app.state));
    $("rare-save-run").addEventListener("click", () => save(`rare-${app.state.r_problem}-run.json`, `${JSON.stringify(runRecord(), null, 2)}\n`, "application/json"));
    $("rare-save-csv").addEventListener("click", () => save(`rare-${app.state.r_problem}-results.csv`, resultsCsv(), "text/csv"));
    $("rare-load-run").addEventListener("change", async () => {
      const f = $("rare-load-run").files?.[0];
      if (!f) return;
      try {
        let doc;
        try { doc = JSON.parse(await f.text()); } catch { throw new Error("The file is not JSON."); }
        loadRun(doc);
        $("rare-record-status").textContent = `Loaded ${f.name}.`;
      } catch (e) {
        $("rare-record-status").textContent = `The page did not load ${f.name}: ${e instanceof Error ? e.message : String(e)}`;
      }
      $("rare-load-run").value = "";
    });
    for (const [id, name] of [["rare-conv", "convergence"], ["rare-comparison", "comparison"], ["rare-stages", "stages"], ["rare-tail", "tail"], ["rare-sweep", "sweep"]]) {
      $(`${id}-svg`)?.addEventListener("click", () => hooks.saveSvg(id, `rare-${app.state.r_problem}-${name}`));
      $(`${id}-png`)?.addEventListener("click", () => hooks.savePng(id, `rare-${app.state.r_problem}-${name}`));
    }
  }

  g.MCRareView = { draw, bind, examples, open, key, tool, commands, report, runRecord, resultsCsv, get run() { return run; }, start, step, pause, reset };
})();
