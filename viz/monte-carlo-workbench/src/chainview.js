/* Monte Carlo Probability Workbench: the Markov chain, sequential and quasi-Monte Carlo lab of group 8. The left
 * panel lists its examples by family, and the centre card holds the lab: the example and its parameters, the method and
 * its comparison with their settings, Step, Run, Pause and Reset, the estimates with their intervals, references and
 * claim tags, the decision, the linked figures (trace, autocorrelation, target and draws, weights, genealogy, filter,
 * points, rate and runs), and three diagnostic sections that stay apart: Markov-chain diagnostics, weight degeneracy
 * and estimation error. A run is a sequence of independent runs (chains, samplers, filters or randomisations) on a
 * worker pool (src/chains.js through src/chains-worker.js), so 1 and 4 workers give the same result. The state is the
 * kit's fields c_*; the run lives beside it. view.js calls these functions.
 */
(function () {
  "use strict";
  const g = /** @type {any} */ (globalThis);
  const Ch = g.MCChains, P = g.MCPlots, Pool = g.MCPool, Rng = g.MCRng;
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
  const NAME = /** @type {Record<string, string>} */ ({ metropolis: "Metropolis–Hastings", gibbs: "Gibbs sampler", hmc: "Hamiltonian Monte Carlo", smc: "Sequential Monte Carlo", particle: "Particle filter", rqmc: "Randomised quasi-Monte Carlo", independent: "Independent sampling", none: "No comparison" });
  const FAMILY = /** @type {Record<string, string>} */ ({ target: "Markov chains and sequential samplers", filter: "Particle filters", integral: "Quasi-Monte Carlo integration" });
  const PLOTS = /** @type {Record<string, string>} */ ({ trace: "Trace", acf: "Autocorrelation", scatter: "Target and draws", weights: "Weights", genealogy: "Genealogy", filter: "Filter", points: "Points", rate: "Error rate", runs: "Runs" });
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
  /** The run record a reader loaded, to compare with its replay. @type {any} */
  let expected = null;
  let frame = 0, autorun = true, lastKey = "";
  /** @type {{ key: string, value: any }} */
  let refMemo = { key: "", value: null };

  /* ---------- state, record and run ---------- */

  /** @param {Record<string, any>} s */
  const exampleOf = (s) => data.chains.examples.find((/** @type {any} */ x) => x.id === s.c_example);
  /** The laboratory record of a state. @param {Record<string, any>} s */
  const recordOf = (s) => Ch.recordOf(exampleOf(s), s.c_params, data.datasets);
  /** The settings of a state. @param {Record<string, any>} s */
  const settingsOf = (s) => ({ seed: s.seed, method: s.c_method, compare: s.c_compare, size: s.c_size, runs: s.c_runs, step: s.c_step, eps: s.c_eps, leap: s.c_leap, start: s.c_start,
    resample: s.c_resample, ess: s.c_ess, schedule: s.c_schedule, temps: s.c_temps, moves: s.c_moves, scramble: s.c_scramble, path: s.c_path });
  /** @param {Record<string, any>} s */
  const keyOf = (s) => JSON.stringify([s.c_example, s.c_params, settingsOf(s)]);

  /** The reference of a record, kept while the record stays the same. @param {any} record */
  function referenceOf(record) {
    const key = JSON.stringify([record.model, record.params, record.data]);
    if (refMemo.key !== key) refMemo = { key, value: Ch.reference(record) };
    return refMemo.value;
  }

  function source() {
    return ["src-rng", "src-special", "src-chains", "src-chains-worker"].map((id) => $(id).textContent).join("\n;\n");
  }
  function getPool() {
    if (!pool) pool = Pool.createPool({ source: source(), size: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)), engine: Ch });
    return pool;
  }

  /** A new, empty run for the state, with the compiled job or its errors. @param {Record<string, any>} s */
  function newRun(s) {
    const { record, errors } = recordOf(s), settings = settingsOf(s);
    const prepared = errors.length ? { ok: false, errors } : Ch.prepare(record, settings);
    const c = prepared.ok ? prepared : { ok: false, errors: prepared.errors };
    const reference = c.ok ? referenceOf(record) : null;
    return { key: keyOf(s), record, settings, c, reference, acc: c.ok ? Ch.empty(c) : null, status: c.ok ? "idle" : "error", message: "", elapsed: 0, started: 0, handle: null, mode: "" };
  }

  /** Run up to `to` independent runs. @param {number} to */
  function go(to) {
    const r = run;
    if (!r || !r.c.ok || r.handle || r.acc.blocks >= to) return;
    r.status = "running";
    r.started = performance.now();
    r.message = "";
    const p = getPool();
    r.handle = p.run({ record: r.record, settings: r.settings, opts: { reference: r.reference }, from: r.acc.blocks, to }, {
      onBlock(/** @type {any} */ blk) {
        if (run !== r) return;
        r.acc = Ch.merge(r.acc, blk);
        if (r.elapsed + performance.now() - r.started > LIMIT_MS) { r.message = `The run reached the time limit of ${LIMIT_MS / 1000} s and paused.`; r.handle?.pause(); }
        schedule();
      },
      onEnd(/** @type {string} */ status, /** @type {string} */ message) {
        if (run !== r) return;
        r.elapsed += performance.now() - r.started;
        r.handle = null;
        r.mode = p.mode;
        r.status = status === "done" ? (r.acc.blocks >= r.c.settings.runs ? "done" : "paused") : status;
        if (message) r.message = message;
        schedule();
      },
    });
    r.mode = p.mode;
    schedule();
  }
  const start = () => { if (run?.c.ok) go(run.c.settings.runs); };
  const step = () => { if (run?.c.ok && !run.handle) go(Math.min(run.c.settings.runs, run.acc.blocks + 1)); };
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
    frame = requestAnimationFrame(() => { if (app && app.state.nav === "chains") drawRun(app.state); });
  }

  /** The summary of the current run, or null before its first run. */
  function summary() {
    return run?.c.ok && run.acc.blocks ? Ch.summary(run.c, run.acc, run.reference) : null;
  }

  /* ---------- the left panel and the library ---------- */

  /** The examples that match a search, by decision, phenomenon, law or method. @param {string} q */
  function matching(q) {
    const words = String(q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return data.chains.examples.filter((/** @type {any} */ x) => {
      const hay = [x.title, x.problem, x.domain, x.decision, x.reason, x.observe, x.method, x.model, FAMILY[x.family], NAME[x.settings.c_method], NAME[x.settings.c_compare], x.settings.c_method,
        "markov chain mcmc sequential particle quasi monte carlo"].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  /** The examples as a list under their families. @param {string} q @param {Record<string, any>} s @param {string} head the heading element */
  function list(q, s, head) {
    const found = matching(q);
    return Object.keys(FAMILY).map((fam) => {
      const items = found.filter((/** @type {any} */ x) => x.family === fam);
      if (!items.length) return "";
      return `<${head} class="law-head">${esc(FAMILY[fam])}</${head}><ul class="model-list">${items.map((/** @type {any} */ x) => {
        const cur = s.nav === "chains" && s.c_example === x.id;
        return `<li><button type="button" class="link${cur ? " current" : ""}" data-chain-open="${esc(x.id)}" aria-current="${cur}"><span class="kind">${x.kind === "experiment" ? "Behaviour" : esc(x.domain)} · ${esc(NAME[x.settings.c_method])}</span> ${esc(x.title)}</button></li>`;
      }).join("")}</ul>`;
    }).join("");
  }

  /** The examples of group 8 for the Examples list of view.js, as one more heading. @param {string} q @param {Record<string, any>} s */
  function examples(q, s) {
    const html = list(q, s, "h4");
    return html ? `<h3 class="law-head">Markov chain, sequential and quasi-Monte Carlo</h3>${html}` : "";
  }

  /** @param {Record<string, any>} s */
  function drawNav(s) {
    const box = $("chain-list"), k = JSON.stringify([s.q, s.nav, s.c_example]);
    if (box.dataset.key !== k) {
      box.dataset.key = k;
      box.innerHTML = list(s.q, s, "h3") || `<p class="note">No example matches "${esc(s.q)}". Search by a decision, a phenomenon, a law or a method.</p>`;
    }
    const search = $("chain-search");
    if (document.activeElement !== search && search.value !== s.q) search.value = s.q;
    $("chain-method-list").innerHTML = data.chains.methods.map((/** @type {any} */ m) => `<li><button type="button" class="link" data-chain-method="${esc(m.id)}">${esc(m.name)}</button></li>`).join("");
  }

  /** The state that opens an example, with optional settings on top. @param {string} id @param {Record<string, any>} [extra] */
  function exampleState(id, extra = {}) {
    const x = data.chains.examples.find((/** @type {any} */ e) => e.id === id);
    if (!x) return null;
    const F = g.Model.FIELDS, base = Object.fromEntries(Object.keys(F).filter((k) => k.startsWith("c_")).map((k) => [k, F[k].default]));
    return { ...base, nav: "chains", c_example: id, ...x.settings, ...extra };
  }
  /** @param {string} id @param {Record<string, any>} [extra] */
  function open(id, extra) {
    const st = exampleState(id, extra);
    if (st) app.set(st);
  }

  /* ---------- the centre card ---------- */

  /**
   * Draw the lab for the state: the run starts again when the record or the settings change, and the lab is hidden
   * unless the lab panel is open.
   * @param {Record<string, any>} s
   */
  function draw(s) {
    app = app ?? g.VisualKit?.app;
    drawNav(s);
    const shown = s.nav === "chains";
    $("wb-chains").hidden = !shown;
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
    drawControls(s);
    drawMethodCard(s);
    drawRun(s);
  }

  /** @param {Record<string, any>} s */
  function drawHeader(s) {
    const x = exampleOf(s);
    $("chain-kind").textContent = `${FAMILY[x.family]} · ${x.kind === "experiment" ? "Behaviour experiment" : `Workflow · ${x.domain}`}`;
    $("chain-title").textContent = x.title;
    $("chain-problem").textContent = x.problem;
    $("chain-observe").textContent = x.kind === "experiment" ? `What to observe: ${x.observe}` : x.decision;
    const ds = x.data?.dataset ? data.datasets.find((/** @type {any} */ d) => d.id === x.data.dataset) : null;
    $("chain-data").textContent = ds ? `${x.data.text} Source: ${ds.source} ${ds.licence}` : x.data.text;
    const errs = run && !run.c.ok ? run.c.errors : [];
    $("chain-errors").hidden = !errs.length;
    $("chain-errors").innerHTML = errs.length ? `<p>The setting has ${errs.length} ${errs.length === 1 ? "error" : "errors"}, so the page does not run it:</p><ul>${errs.map((/** @type {string} */ e) => `<li>${esc(e)}</li>`).join("")}</ul>` : "";
  }

  /** The parameter fields of the example. @param {Record<string, any>} s */
  function drawParams(s) {
    const box = $("chain-params"), k = JSON.stringify([s.c_example, s.c_params]);
    if (box.dataset.key === k) return;
    box.dataset.key = k;
    const x = exampleOf(s), set = Ch.parseParams(s.c_params, x.params.map((/** @type {any} */ p) => p.name)).values;
    box.innerHTML = x.params.map((/** @type {any} */ p) => `<div class="param"><label for="cp-${esc(p.name)}"><span class="mono">${esc(p.name)}</span>${p.unit ? ` <span class="unit">[${esc(p.unit)}]</span>` : ""}</label>
<input id="cp-${esc(p.name)}" type="text" inputmode="decimal" spellcheck="false" data-chain-param="${esc(p.name)}" value="${esc(set[p.name] ?? p.value)}" aria-describedby="cpn-${esc(p.name)}">
<p class="note" id="cpn-${esc(p.name)}">${esc(p.note)}</p></div>`).join("");
  }

  /** The method options of the family and the settings that apply to the method. @param {Record<string, any>} s */
  function drawControls(s) {
    const x = exampleOf(s), fam = x.family, rec = recordOf(s).record;
    const methods = Ch.FAMILY_METHODS[fam];
    const opts = (/** @type {string} */ cur, /** @type {boolean} */ withNone) => [...(withNone ? ["none"] : []), ...methods].map((m) => {
      const a = m === "none" ? { ok: true, reason: "" } : Ch.applicable(rec, m);
      return `<option value="${m}"${m === cur ? " selected" : ""}${a.ok ? "" : " disabled"}>${esc(NAME[m])}${a.ok ? "" : " (not available here)"}</option>`;
    }).join("");
    const k = JSON.stringify([fam, x.id, s.c_method, s.c_compare]);
    if ($("chain-method").dataset.key !== k) {
      $("chain-method").dataset.key = k;
      $("chain-method").innerHTML = opts(s.c_method, false);
      $("chain-compare").innerHTML = opts(s.c_compare, true);
    }
    const why = methods.map((/** @type {string} */ m) => Ch.applicable(rec, m)).filter((/** @type {any} */ a) => !a.ok).map((/** @type {any} */ a) => a.reason);
    $("chain-why").textContent = why.join(" ");
    const uses = [s.c_method, s.c_compare];
    const show = /** @type {Record<string, boolean>} */ ({
      "chain-step-row": uses.includes("metropolis"), "chain-eps-row": uses.includes("hmc"), "chain-leap-row": uses.includes("hmc"), "chain-start-row": uses.some((m) => ["metropolis", "gibbs", "hmc"].includes(m)),
      "chain-resample-row": uses.some((m) => m === "smc" || m === "particle"), "chain-ess-row": uses.some((m) => m === "smc" || m === "particle"), "chain-schedule-row": uses.includes("smc"),
      "chain-temps-row": uses.includes("smc") && s.c_schedule === "fixed", "chain-moves-row": uses.includes("smc"), "chain-scramble-row": fam === "integral", "chain-path-row": x.model === "asian",
    });
    for (const [id, on] of Object.entries(show)) $(id).style.display = on ? "" : "none";
    const unit = fam === "target" ? (s.c_method === "smc" ? "particles" : "draws after the warm-up in each chain") : fam === "filter" ? "particles" : "points in each randomisation";
    const [lo, hi] = Ch.LIMITS.size[fam];
    $("chain-size-out").textContent = `2^${s.c_size} = ${count(2 ** s.c_size)} ${unit} (2^${lo} to 2^${hi})`;
    $("chain-runs-label").textContent = fam === "target" ? (s.c_method === "smc" ? "Independent runs R" : "Independent chains R") : fam === "filter" ? "Independent filter runs R" : "Independent randomisations R";
    const plot = shownPlot(s);
    $("chain-coord-row").style.display = plot === "trace" || plot === "acf" ? "" : "none";
    $("chain-q-row").style.display = plot === "rate" || plot === "runs" ? "" : "none";
    const ok = JSON.stringify([x.id, s.c_coord, s.c_q]);
    if ($("chain-coord").dataset.key !== ok) {
      $("chain-coord").dataset.key = ok;
      $("chain-coord").innerHTML = (fam === "target" ? Ch.TARGETS[x.model].coords : ["1", "2"]).map((/** @type {string} */ n, /** @type {number} */ i) => `<option value="${i + 1}"${i + 1 === s.c_coord ? " selected" : ""}>${esc(n)}</option>`).join("");
      $("chain-q").innerHTML = x.quantities.map((/** @type {any} */ q, /** @type {number} */ i) => `<option value="${i + 1}"${i + 1 === s.c_q ? " selected" : ""}>${esc(q.name)}</option>`).join("");
    }
    const plots = plotsFor(s);
    $("chain-plots").innerHTML = plots.map((p) => `<button type="button" data-field="c_plot" value="${p}" aria-pressed="${p === shownPlot(s)}">${esc(PLOTS[p])}</button>`).join("");
  }

  /** The figures that apply to the family and the method. @param {Record<string, any>} s @returns {string[]} */
  function plotsFor(s) {
    const fam = exampleOf(s).family;
    if (fam === "filter") return ["filter", "weights", "genealogy", "runs"];
    if (fam === "integral") return ["rate", "points", "runs"];
    return s.c_method === "smc" ? ["scatter", "weights", "genealogy", "runs"] : ["trace", "acf", "scatter", "runs"];
  }
  /** @param {Record<string, any>} s */
  const shownPlot = (s) => (plotsFor(s).includes(s.c_plot) ? s.c_plot : plotsFor(s)[0]);

  /** The card of the chosen method: its 6 parts with buttons that open its examples. @param {Record<string, any>} s */
  function drawMethodCard(s) {
    const m = data.chains.methods.find((/** @type {any} */ x) => x.id === s.c_method);
    const box = $("chain-method-card");
    if (!m) { box.innerHTML = `<h3>${esc(NAME[s.c_method])}</h3><p>Independent sampling: the same n points as independent uniforms. Its card is in the method library of group 1.</p>`; box.dataset.key = s.c_method; return; }
    if (box.dataset.key === m.id) return;
    box.dataset.key = m.id;
    const link = (/** @type {any} */ part) => `<button type="button" class="link" data-chain-open="${esc(part.example)}" data-chain-extra="${esc(JSON.stringify(part.settings ?? {}))}">Open it</button>`;
    box.innerHTML = `<h3>${esc(m.name)} <span class="label">${esc(m.family)}</span></h3><div class="formula" data-tex="${esc(m.estimator)}"></div><p>${esc(m.estimatorText)}</p>
<div class="cols"><div><h4>Assumptions</h4><ul>${m.assumptions.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul><h4>Settings</h4><ul>${m.settings.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
<div><h4>Suitable example</h4><p>${esc(m.suitable.text)} ${link(m.suitable)}</p>
<h4>Failure example</h4><p>${esc(m.failure.text)} ${link(m.failure)}</p>
<h4>Comparison with ${esc(NAME[m.comparison.with].toLowerCase())}</h4><p>${esc(m.comparison.text)} ${link(m.comparison)}</p></div></div>`;
  }

  /** The status line, the progress bar and the buttons. */
  function drawStatus() {
    const r = run;
    if (!r || !app || app.state.nav !== "chains") return;
    const R = r.c.ok ? r.c.settings.runs : 0, done = r.c.ok ? r.acc.blocks / R : 0;
    $("chain-progress").value = done;
    $("chain-progress").textContent = `${Math.round(done * 100)} %`;
    const st = !r.c.ok ? "The setting has errors, so the page cannot run it." : r.status === "idle" ? "Ready. Press Run or Step."
      : `${r.status === "running" ? "Running" : r.status === "done" ? "Complete" : r.status === "paused" ? "Paused: the partial result is not complete" : r.status === "cancelled" ? "Cancelled" : "Stopped by an error"}: ${r.acc.blocks} of ${R} independent runs, ${fmt((r.elapsed + (r.status === "running" ? performance.now() - r.started : 0)) / 1000)} s, ${esc(r.mode || "not started")}.`;
    $("chain-status").textContent = `${st}${r.message ? ` ${r.message}` : ""}${r.acc?.error ? ` ${r.acc.error}` : ""}`;
    const busy = !r.c.ok || !!r.handle || r.acc.blocks >= R;
    $("chain-go").disabled = busy;
    $("chain-step-run").disabled = busy;
    $("chain-pause").disabled = !r.handle;
    $("chain-pause").setAttribute("aria-pressed", String(r.status === "paused"));
  }

  /** The parts that change while the run proceeds. @param {Record<string, any>} s */
  function drawRun(s) {
    drawStatus();
    const sm = summary();
    drawResults(s, sm);
    drawFigure(s, sm);
    drawDiagnostics(s, sm);
    drawReplay(sm);
  }

  /* ---------- results and decision ---------- */

  /**
   * Numbers with enough significant digits that the ends of the interval differ, from 4 up to 10.
   * @param {any} q @returns {(v: number | null | undefined) => string}
   */
  function digitsFor(q) {
    if (q.lo === null || q.hi === null || !(q.hi > q.lo)) return fmt;
    const size = Math.max(Math.abs(q.lo), Math.abs(q.hi)), digits = Math.min(10, Math.max(4, Math.ceil(Math.log10(size / (q.hi - q.lo))) + 2));
    return (v) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : Math.abs(v) >= 1e-3 && Math.abs(v) < 1e9 ? String(+v.toPrecision(digits)).replace("-", "−") : fmt(v));
  }
  /** @param {any} q */
  function intervalCell(q) {
    if (q.est === null) return `<span class="note">${esc(q.how)}</span>`;
    if (q.lo === null) return `<span class="warn-text">${esc(q.how)}</span>`;
    const f = digitsFor(q);
    return `${f(q.lo)} to ${f(q.hi)}<br><span class="note">${esc(q.how)}</span>`;
  }

  /** The table of estimates, then the decision of a workflow. @param {Record<string, any>} s @param {any} sm */
  function drawResults(s, sm) {
    const c = run?.c, x = exampleOf(s);
    if (!c?.ok) { $("chain-results").innerHTML = ""; $("chain-decision").innerHTML = ""; return; }
    const ref = run.reference, refTag = ref.tag === "exact" ? "theorem" : "numerical";
    const partial = run.status !== "done" && run.acc.blocks ? " <strong>Partial: the run is not complete.</strong>" : "";
    /** @type {string[]} */
    const rows = [];
    for (const m of sm?.methods ?? [s.c_method, ...(s.c_compare !== "none" ? [s.c_compare] : [])].map((id) => ({ method: id, quantities: null }))) {
      x.quantities.forEach((/** @type {any} */ qd, /** @type {number} */ i) => {
        const q = m.quantities?.[i] ?? { est: null, how: "no run yet", reference: ref.values[qd.id] ?? null, error: null, covered: null };
        const f = digitsFor(q);
        rows.push(`<tr><th scope="row">${esc(NAME[m.method])}</th><td>${esc(qd.name)}${qd.unit ? ` [${esc(qd.unit)}]` : ""}<br><span class="note">${esc(qd.note)}</span></td><td class="num">${f(q.est)}</td><td class="num">${intervalCell(q)}</td>
<td class="num">${f(q.reference)}</td><td class="num">${q.error === null ? "–" : fmt(q.error)}${q.covered === null ? "" : `<br><span class="${q.covered ? "verdict-met" : "verdict-not-met"}">${q.covered ? "inside the interval" : "outside the interval"}</span>`}</td><td>${q.est !== null ? tag("observation") : ""}</td></tr>`);
      });
    }
    $("chain-results").innerHTML = `<table><caption>Estimates after ${run.acc.blocks} of ${c.settings.runs} independent runs, seed ${s.seed}.${partial}</caption>
<thead><tr><th scope="col">Method</th><th scope="col">Quantity</th><th scope="col">Estimate</th><th scope="col">95 % interval</th><th scope="col">Reference</th><th scope="col">Error</th><th scope="col">Claim</th></tr></thead><tbody>${rows.join("")}</tbody></table>
<p>Reference values: ${esc(ref.how)}. ${tag(refTag)}</p>`;
    const rule = x.rule;
    if (!rule) { $("chain-decision").innerHTML = '<p class="note">A behaviour experiment has no decision. Read what to observe.</p>'; return; }
    const qd = x.quantities.find((/** @type {any} */ q) => q.id === rule.quantity), q = sm?.methods[0].quantities[x.quantities.indexOf(qd)];
    const op = rule.op === ">=" ? "≥" : "≤", refv = ref.values[rule.quantity];
    let verdict = "Run the lab to compare the estimate with the rule.";
    if (q && q.est !== null) {
      const lo = q.lo ?? q.est, hi = q.hi ?? q.est, holds = rule.op === ">=" ? lo >= rule.value : hi <= rule.value, fails = rule.op === ">=" ? hi < rule.value : lo > rule.value;
      verdict = holds ? `The whole interval meets the rule: ${esc(rule.yes)}` : fails ? `The whole interval fails the rule: ${esc(rule.no)}` : "<strong>Not separable:</strong> the interval holds the threshold, so the run needs more runs or a larger size before this choice.";
    }
    $("chain-decision").innerHTML = `<p>Rule: ${esc(qd.name)} ${op} ${fmt(rule.value)}. ${verdict} ${tag("observation")}</p><p class="note">At the reference value ${fmt(refv)}, the rule gives: ${esc((rule.op === ">=" ? refv >= rule.value : refv <= rule.value) ? rule.yes : rule.no)} ${tag(refTag)}</p>`;
  }

  /* ---------- the three kinds of diagnostic ---------- */

  /** @param {Record<string, any>} s @param {any} sm */
  function drawDiagnostics(s, sm) {
    const x = exampleOf(s), c = run?.c;
    const m0 = sm?.methods ?? [];
    // 1. Markov-chain diagnostics.
    const chains = m0.filter((/** @type {any} */ m) => m.chain);
    $("chain-markov").innerHTML = !c?.ok ? "" : !chains.length ? `<p class="note">Not applicable: ${esc(NAME[s.c_method])} does not make a Markov chain${s.c_method === "smc" ? ". Its Metropolis moves keep each tempered law invariant, but the sampler reads its weights, not a chain" : ""}.</p>`
      : chains.map((/** @type {any} */ m) => {
        const ch = m.chain;
        return `<h4>${esc(NAME[m.method])}</h4><p>Acceptance rate ${fmt(ch.accept)}${m.method === "hmc" ? `; divergent transitions after the warm-up: <strong${ch.divergent ? ' class="bad-text"' : ""}>${count(ch.divergent)}</strong>; largest energy error ${fmt(ch.maxEnergy)}; ${count(ch.grads)} gradients` : ""}. ${tag("observation")}</p>
<div class="table-scroll"><table><caption>For each series, over ${m.runs} chains of ${count(ch.n)} draws after the warm-up</caption><thead><tr><th scope="col">Series</th><th scope="col">Split R-hat</th><th scope="col">ESS</th><th scope="col">τ</th><th scope="col">MCSE</th></tr></thead><tbody>${ch.series.map((/** @type {any} */ v) => {
          const name = v.coord ? `coordinate ${v.name}` : x.quantities.find((/** @type {any} */ q) => q.id === v.name)?.name ?? v.name;
          return `<tr><th scope="row">${esc(name)}</th><td class="num${v.rhat !== null && v.rhat > 1.01 ? " warn-text" : ""}">${v.rhat === null ? "–" : v.rhat.toFixed(3)}</td><td class="num">${v.ess === null ? "–" : `${v.bound ? "≤ " : ""}${count(v.ess)}`}</td><td class="num">${fmt(v.tau)}</td><td class="num">${fmt(v.mcse)}</td></tr>`;
        }).join("")}</tbody></table></div>
<p>${ch.maxRhat > 1.01 ? `<strong class="warn-text">Split R-hat is ${ch.maxRhat.toFixed(3)} > 1.01: the chains disagree, so they have not reached a common law.</strong>` : "Split R-hat is at most 1.01: the chains agree with each other."} The effective sample size (ESS) estimates how many independent draws give the same variance of the mean, if the chains have reached the target law. <strong>The ESS is a diagnostic, not a proof of convergence:</strong> chains that all miss a mode agree with each other and can have a large ESS. ${tag("observation")}</p>`;
      }).join("");
    // 2. Weight degeneracy.
    const weighted = m0.filter((/** @type {any} */ m) => m.weights);
    $("chain-weights").innerHTML = !c?.ok ? "" : !weighted.length ? `<p class="note">Not applicable: ${esc(NAME[s.c_method])} has no importance weights${x.family === "integral" ? ". Each point has the weight 1/n" : ". Each draw of a chain has the weight 1/n"}.</p>`
      : weighted.map((/** @type {any} */ m) => {
        const w = m.weights, N = w.N;
        return `<h4>${esc(NAME[m.method])}</h4><ul><li>Smallest weight ESS: ${fmt(w.minEss)} of N = ${count(N)} particles (${fmt((100 * w.minEss) / N)} %); weight ESS at the end ${fmt(w.meanFinalEss)} (mean over the runs). ${tag("observation")}</li>
<li>Largest normalised weight at the end: ${fmt(w.maxW)}. Resampling steps: ${fmt(w.resamplings)} for each run${w.steps !== null ? `, over ${fmt(w.steps)} tempering steps${w.held ? "" : ". <strong class=\"warn-text\">The adaptive schedule could not hold the ESS threshold, so it finished in one step.</strong>"}` : ""}. ${tag("observation")}</li>
<li>Distinct ancestors at the start of the ${count(N)} particles at the end: ${fmt(w.surviving)} (mean over the runs). ${w.surviving < N / 10 ? "The paths share their early ancestors: path degeneracy." : ""} ${tag("observation")}</li>
<li>log Ẑ: ${fmt(w.logZ.est)}${w.logZ.lo !== null ? ` (${fmt(w.logZ.lo)} to ${fmt(w.logZ.hi)})` : ""}, spread over the runs ${fmt(w.logZ.sd)}; exact or numerical log Z: ${fmt(run.reference.logZ)}.${w.zRatio ? ` Mean of Ẑ/Z over the runs: ${fmt(w.zRatio.est)}. Ẑ has no bias, but log Ẑ has a negative bias of about half the variance of log Ẑ.` : ""} ${tag("observation")}</li></ul>
<p>The weight ESS (Σ w)² / Σ w² measures how even the weights are at one step. It is a diagnostic of the weights, not of the error: an even set of weights can still miss a region that no particle reached.</p>`;
      }).join("");
    // 3. Estimation error.
    $("chain-error").innerHTML = !c?.ok ? "" : !m0.length ? '<p class="note">Run the lab to see the estimation error.</p>'
      : m0.map((/** @type {any} */ m) => `<h4>${esc(NAME[m.method])}</h4><ul>${m.quantities.map((/** @type {any} */ q, /** @type {number} */ i) => {
        const qd = x.quantities[i];
        if (q.est === null) return `<li>${esc(qd.name)}: ${esc(q.how)}</li>`;
        const half = q.lo !== null ? (q.hi - q.lo) / 2 : null;
        return `<li>${esc(qd.name)}: error against the reference ${fmt(q.error)}${half !== null ? `, half-width of the interval ${fmt(half)}; the interval ${q.covered ? "holds" : "<strong class=\"bad-text\">does not hold</strong>"} the reference` : `; ${esc(q.how)}`}.${q.mcse !== undefined && q.mcse !== null ? ` Standard error from the spread of the ${m.runs} chains: ${fmt(q.se)}; from the ESS of the pooled chains: ${fmt(q.mcse)}. They agree only when the chains mix.` : ""} ${tag("observation")}</li>`;
      }).join("")}${m.integral ? `<li>Variance of independent points ÷ variance of the randomised points at n = ${count(m.integral.n)}: ${m.integral.ratio.map((/** @type {number | null} */ r, /** @type {number} */ i) => `${esc(x.quantities.find((/** @type {any} */ q) => q.id === Ch.INTEGRANDS[x.model].outputs[i])?.name ?? "")} ${r === null ? "–" : fmt(r)}`).join("; ")}. ${tag("observation")}</li>` : ""}</ul>`).join("")
        + (m0.length ? `<p>The interval comes from the spread of R independent runs, so it does not depend on a diagnostic. It is valid when each run has no bias, or a bias much smaller than its spread. A bias that all runs share, such as a missed mode, stays invisible to it: only the reference shows it.</p>` : "");
    $("chain-assumptions").innerHTML = !c?.ok ? "" : `${x.kind === "workflow" ? [["Reason for the model", x.reason], ["Parameters, units, data and assumptions", x.inputs], ["Dependence or process model", x.dependence], ["Method and estimator", x.method]].map(([h, t]) => `<h4>${esc(h)}</h4><p>${esc(t)}</p>`).join("") : ""}
<h4>Assumptions of ${esc(NAME[s.c_method].toLowerCase())}</h4><ul>${(data.chains.methods.find((/** @type {any} */ m) => m.id === s.c_method)?.assumptions ?? ["The points are independent and uniform on the unit cube."]).map((/** @type {string} */ a) => `<li>${esc(a)}</li>`).join("")}</ul>`;
    $("chain-interpretation").innerHTML = x.kind === "workflow" ? `<h4>Diagnostics and competing models</h4><p>${esc(x.diagnostics)}</p><h4>Interpretation and rejection conditions</h4><p>${esc(x.interpretation)}</p>` : `<p>${esc(x.observe)}</p>`;
  }

  /* ---------- figures ---------- */

  /** @param {string} label @param {string} body @param {number} [h] */
  const svg = (label, body, h = H) => `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>${body}</svg>`;
  /** @param {string} label @param {string} text */
  const empty = (label, text) => svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">${esc(text)}</text>`);

  /**
   * Axes, grid, ticks and titles inside a box. Returns the scales and the markup.
   * @param {{ x: [number, number], y: [number, number], xlog?: boolean, ylog?: boolean, xlabel: string, ylabel: string, box?: { l: number, r: number, t: number, b: number } }} o
   */
  function axes(o) {
    const b = o.box ?? { l: M.l, r: W - M.r, t: M.t, b: H - M.b };
    const sx = P.scale(o.x[0], o.x[1], b.l, b.r, !!o.xlog), sy = P.scale(o.y[0], o.y[1], b.b, b.t, !!o.ylog);
    const xt = o.xlog ? P.logTicks(o.x[0], o.x[1]) : P.ticks(o.x[0], o.x[1], 5), yt = o.ylog ? P.logTicks(o.y[0], o.y[1]) : P.ticks(o.y[0], o.y[1], 5);
    const xs = xt.length > 1 ? xt[1] - xt[0] : 0, ys = yt.length > 1 ? yt[1] - yt[0] : 0;
    const parts = ['<g class="grid">', ...yt.map((/** @type {number} */ v) => `<line x1="${b.l}" x2="${b.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/>`), '</g><g class="axis">',
      `<line x1="${b.l}" x2="${b.r}" y1="${b.b}" y2="${b.b}"/><line x1="${b.l}" x2="${b.l}" y1="${b.t}" y2="${b.b}"/></g><g class="tick">`,
      ...xt.map((/** @type {number} */ v) => `<text x="${sx(v).toFixed(1)}" y="${b.b + 17}" text-anchor="middle">${esc(o.xlog ? P.fmt(v) : P.tickLabel(v, xs))}</text>`),
      ...yt.map((/** @type {number} */ v) => `<text x="${b.l - 6}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end">${esc(o.ylog ? P.fmt(v) : P.tickLabel(v, ys))}</text>`), "</g>",
      `<text class="axis-title" x="${(b.l + b.r) / 2}" y="${b.b + 36}" text-anchor="middle">${esc(o.xlabel)}</text>`,
      `<text class="axis-title" transform="translate(${b.l - 50} ${(b.t + b.b) / 2}) rotate(-90)" text-anchor="middle">${esc(o.ylabel)}</text>`];
    return { sx, sy, markup: parts.join("") };
  }
  /** @param {number[]} xs @param {number[]} ys @param {(v: number) => number} sx @param {(v: number) => number} sy */
  const line = (xs, ys, sx, sy) => xs.map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(ys[i]).toFixed(1)}`).join("");
  /** A key at the top right. @param {string} text */
  const keyText = (text) => `<text class="direct-label" x="${W - M.r}" y="${M.t - 4}" text-anchor="end">${esc(text)}</text>`;

  /** @param {Record<string, any>} s @param {any} sm */
  function drawFigure(s, sm) {
    const c = run?.c, x = exampleOf(s), plot = shownPlot(s);
    $("chain-fig-caption").textContent = PLOTS[plot];
    if (!c?.ok) { $("chain-plot").innerHTML = ""; $("chain-fig-note").textContent = ""; return; }
    const runs = run.acc.runs, k = sm?.methods.findIndex((/** @type {any} */ m) => m.method === s.c_method) ?? 0;
    const mine = runs.map((/** @type {any} */ r) => r.methods[Math.max(0, k)]);
    const coord = Math.min(s.c_coord, 2) - 1, qi = Math.min(s.c_q, x.quantities.length) - 1;
    const out = { html: "", note: "" };
    if (plot === "trace") Object.assign(out, traceChart(c, mine, coord));
    else if (plot === "acf") Object.assign(out, acfChart(c, sm?.methods[Math.max(0, k)], coord));
    else if (plot === "scatter") Object.assign(out, scatterChart(c, mine[0]));
    else if (plot === "weights") Object.assign(out, weightsChart(c, mine));
    else if (plot === "genealogy") Object.assign(out, genealogyChart(c, mine[0]));
    else if (plot === "filter") Object.assign(out, filterChart(c, mine[0]));
    else if (plot === "points") Object.assign(out, pointsChart(c, mine[0]));
    else if (plot === "rate") Object.assign(out, rateChart(c, sm?.methods[0], qi, x));
    else Object.assign(out, runsChart(c, sm, qi, x));
    $("chain-plot").innerHTML = out.html;
    $("chain-fig-note").textContent = out.note;
  }

  /** The trace of the first 4 chains for one coordinate, with the warm-up shaded. @param {any} c @param {any[]} mine @param {number} coord */
  function traceChart(c, mine, coord) {
    const name = c.code.coords[coord], label = `Trace of ${name} in the first ${Math.min(4, mine.length)} chains, with the warm-up shaded`;
    const shown = mine.filter((m) => m?.trace).slice(0, 4);
    if (!shown.length) return { html: empty(label, "Run the lab to draw the chains."), note: "" };
    const n = shown[0].n, ys = shown.flatMap((m) => m.trace.map((/** @type {number[]} */ t) => t[coord + 1]));
    const f = axes({ x: [0, 2 * n], y: P.padRange(ys, 0.05), xlabel: "Iteration", ylabel: name });
    const parts = [`<rect class="band" x="${f.sx(0).toFixed(1)}" y="${M.t}" width="${(f.sx(n) - f.sx(0)).toFixed(1)}" height="${H - M.b - M.t}"/>`, f.markup];
    shown.forEach((m, i) => parts.push(`<path class="series s${i + 1}" d="${line(m.trace.map((/** @type {number[]} */ t) => t[0]), m.trace.map((/** @type {number[]} */ t) => t[coord + 1]), f.sx, f.sy)}"/>`));
    parts.push(keyText(`${shown.map((_, i) => ["blue", "orange", "green", "purple"][i]).join(", ")}: chains 1 to ${shown.length} · shaded: warm-up, not used`));
    return { html: svg(label, parts.join("")), note: `Each line is one chain, thinned to about 400 points. The page uses only the draws after the shaded warm-up. Chains that stay in different regions disagree, and split R-hat shows it.` };
  }

  /** The combined autocorrelation of one coordinate, with the lag where Geyer's sum stops. @param {any} c @param {any} m @param {number} coord */
  function acfChart(c, m, coord) {
    const name = c.code.coords[coord], label = `Autocorrelation of ${name}, combined over the chains, at lags 0 to 200`;
    const v = m?.chain?.series[coord];
    if (!v) return { html: empty(label, "Run the lab to draw the autocorrelation."), note: "" };
    const rho = v.acf, L = rho.length - 1;
    const f = axes({ x: [0, Math.max(1, L)], y: [Math.min(-0.1, ...rho), 1], xlabel: "Lag k", ylabel: `ρ_k of ${name}` });
    const parts = [f.markup, `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${f.sy(0).toFixed(1)}" y2="${f.sy(0).toFixed(1)}"/>`];
    parts.push(`<path class="series s1" d="${rho.map((/** @type {number} */ r, /** @type {number} */ i) => `M${f.sx(i).toFixed(1)} ${f.sy(0).toFixed(1)}V${f.sy(r).toFixed(1)}`).join("")}"/>`);
    parts.push(keyText(`τ = ${fmt(v.tau)} · ESS = ${v.ess === null ? "–" : `${v.bound ? "≤ " : ""}${count(v.ess)}`}`));
    return { html: svg(label, parts.join("")), note: `The integrated autocorrelation time τ = 1 + 2 Σ ρ_k uses Geyer's initial monotone sequence, and ESS = R n / τ. A slow decay means that each draw adds little new information.${v.bound ? " The sum did not end within the stored lags, so the ESS is an upper bound." : ""}` };
  }

  /** The target density as shading, with the draws of the first chain or the weighted particles, and the last leapfrog path. @param {any} c @param {any} m */
  function scatterChart(c, m) {
    const t = c.code, label = `The target density of (${t.coords[0]}, ${t.coords[1]}) as shading, with the draws of the first run`;
    const win = t.window(c.params, c.data, run.reference);
    const f = axes({ x: /** @type {[number, number]} */ (win[0]), y: /** @type {[number, number]} */ (win[1]), xlabel: t.coords[0], ylabel: t.coords[1] });
    const G = 36, cells = [];
    let top = -Infinity;
    const lp = [];
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const x0 = win[0][0] + ((i + 0.5) * (win[0][1] - win[0][0])) / G, x1 = win[1][0] + ((j + 0.5) * (win[1][1] - win[1][0])) / G, v = t.logp([x0, x1], c.params, c.data);
      lp.push(v);
      if (v > top) top = v;
    }
    const cw = (f.sx(win[0][1]) - f.sx(win[0][0])) / G, chh = (f.sy(win[1][0]) - f.sy(win[1][1])) / G;
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const a = Math.exp((lp[i * G + j] - top) / 2);
      if (a < 0.004) continue;
      cells.push(`<rect x="${(f.sx(win[0][0]) + i * cw).toFixed(1)}" y="${(f.sy(win[1][0]) - (j + 1) * chh).toFixed(1)}" width="${(cw + 0.3).toFixed(1)}" height="${(chh + 0.3).toFixed(1)}" fill-opacity="${Math.min(0.7, 0.08 + 0.62 * a).toFixed(2)}"/>`);
    }
    const parts = [`<g class="density">${cells.join("")}</g>`, f.markup];
    const inside = (/** @type {number[]} */ p) => p[0] >= win[0][0] && p[0] <= win[0][1] && p[1] >= win[1][0] && p[1] <= win[1][1];
    if (m?.cloud) parts.push(`<g class="draws">${m.cloud.filter(inside).map((/** @type {number[]} */ p) => `<circle cx="${f.sx(p[0]).toFixed(1)}" cy="${f.sy(p[1]).toFixed(1)}" r="${p.length > 2 ? Math.max(1, Math.min(6, 2 * Math.sqrt(p[2]))).toFixed(1) : 1.8}"/>`).join("")}</g>`);
    if (m?.path?.length > 1) parts.push(`<path class="series s2" d="${line(m.path.map((/** @type {number[]} */ p) => p[0]), m.path.map((/** @type {number[]} */ p) => p[1]), f.sx, f.sy)}"/>`);
    parts.push(keyText(`shading: target density · dots: ${m?.kind === "smc" ? "particles, area ∝ weight" : "draws of chain 1"}${m?.path?.length > 1 ? " · orange: last leapfrog path" : ""}`));
    return { html: svg(label, parts.join("")), note: m ? `${m.kind === "smc" ? "The particles at the end of the first run." : "Draws of the first chain after the warm-up, thinned to about 600."} Compare where the dots are with where the density is: a region with density and no dots is a region that the run missed.` : "Run the lab to draw the draws." };
  }

  /** The weight ESS at each step of each run, and the sorted weights of the first run at the end. @param {any} c @param {any[]} mine */
  function weightsChart(c, mine) {
    const label = "Weight ESS ÷ N at each step of each run, and the sorted normalised weights of the first run at the end";
    if (!mine.length || !mine[0]) return { html: empty(label, "Run the lab to draw the weights."), note: "" };
    const filter = mine[0].kind === "filter", N = mine[0].N, h1 = 170;
    const seqs = mine.map((m) => (filter ? m.ess : m.steps.slice(1).map((/** @type {any} */ x) => x.ess)).map((/** @type {number} */ e) => e / N));
    const T = Math.max(...seqs.map((x) => x.length));
    const f = axes({ x: [1, Math.max(2, T)], y: [0, 1], xlabel: filter ? "Time t" : "Tempering step k", ylabel: "ESS ÷ N", box: { l: M.l, r: W - M.r, t: M.t, b: h1 } });
    const parts = [f.markup];
    seqs.forEach((sq, i) => parts.push(`<path class="series ${i === 0 ? "s1" : "s3 faint"}" d="${line(sq.map((/** @type {number} */ _, /** @type {number} */ j) => j + 1), sq, f.sx, f.sy)}"/>`));
    const res = filter ? mine[0].resampled : mine[0].steps.slice(1).map((/** @type {any} */ x) => x.resampled);
    parts.push(`<g class="marks">${res.map((/** @type {boolean} */ r, /** @type {number} */ j) => (r ? `<line x1="${f.sx(j + 1).toFixed(1)}" x2="${f.sx(j + 1).toFixed(1)}" y1="${h1}" y2="${h1 - 6}"/>` : "")).join("")}</g>`);
    if (run.c.settings.resample !== "none") parts.push(`<line class="ref" x1="${M.l}" x2="${W - M.r}" y1="${f.sy(run.c.settings.ess).toFixed(1)}" y2="${f.sy(run.c.settings.ess).toFixed(1)}"/>`);
    const w = mine[0].weights ?? [], y2 = { t: h1 + 58, b: 2 * h1 + 46 };
    const vals = w.map((/** @type {number} */ v) => v * N).filter((/** @type {number} */ v) => v > 0);
    if (vals.length) {
      const lo = 10 ** Math.floor(Math.log10(Math.max(1e-6, vals[vals.length - 1]))), hi = 10 ** Math.ceil(Math.log10(Math.max(vals[0], 1.0001)));
      const g2 = axes({ x: [1, Math.max(2, w.length)], y: [lo, hi], xlog: true, ylog: true, xlabel: "Rank of the particle (log axis)", ylabel: "N W (log axis)", box: { l: M.l, r: W - M.r, t: y2.t, b: y2.b } });
      parts.push(g2.markup, `<line class="ref" x1="${M.l}" x2="${W - M.r}" y1="${g2.sy(1).toFixed(1)}" y2="${g2.sy(1).toFixed(1)}"/>`);
      const idx = Array.from({ length: Math.min(300, vals.length) }, (_, i) => Math.floor((i * vals.length) / Math.min(300, vals.length)));
      parts.push(`<path class="series s2" d="${line(idx.map((i) => i + 1), idx.map((i) => Math.max(lo, vals[i])), g2.sx, g2.sy)}"/>`);
    }
    parts.push(keyText("top: blue run 1, others faint, ticks: resampling · bottom: sorted N W, dashed: equal weights"));
    return { html: svg(label, parts.join(""), 2 * h1 + 92), note: "Equal weights give ESS = N and N W = 1 for each particle. A drop of the ESS to a few particles is weight degeneracy: the estimate then rests on a few particles, whatever N is." };
  }

  /** The ancestral lines of up to 128 particles of the last step, over a crowd of other particles. @param {any} c @param {any} m */
  function genealogyChart(c, m) {
    const label = "Genealogy of the particles: the ancestral lines of up to 128 particles of the last step, back to step 0";
    const gy = m?.genealogy;
    if (!gy) return { html: empty(label, "Run the lab to draw the genealogy."), note: "" };
    const all = [...gy.crowd.flat(), ...gy.nodes.flatMap((/** @type {number[][]} */ l) => l.map((v) => v[0]))].filter(Number.isFinite);
    const filter = m.kind === "filter";
    const f = axes({ x: [0, Math.max(1, gy.steps - 1)], y: P.padRange(all, 0.05), xlabel: filter ? "Time t" : "Tempering step k", ylabel: filter ? "State x_t" : c.code.coords[0] });
    const parts = [f.markup];
    parts.push(`<g class="crowd">${gy.crowd.map((/** @type {number[]} */ l, /** @type {number} */ k) => l.map((v) => `<circle cx="${f.sx(k).toFixed(1)}" cy="${f.sy(v).toFixed(1)}" r="1.4"/>`).join("")).join("")}</g>`);
    let d = "";
    for (let k = 1; k < gy.steps; k++) for (const [v, p] of gy.nodes[k]) { const pv = gy.nodes[k - 1][p]?.[0]; if (pv !== undefined) d += `M${f.sx(k - 1).toFixed(1)} ${f.sy(pv).toFixed(1)}L${f.sx(k).toFixed(1)} ${f.sy(v).toFixed(1)}`; }
    parts.push(`<path class="series s1 lineage" d="${d}"/>`);
    parts.push(keyText(`blue: ancestral lines · grey: other particles · ${gy.nodes[0].length} distinct ancestors at step 0`));
    return { html: svg(label, parts.join("")), note: `Each resampling step copies some particles and drops others, so the lines of the last particles merge as they go back. Here the traced particles have ${gy.nodes[0].length} distinct ${gy.nodes[0].length === 1 ? "ancestor" : "ancestors"} at step 0: path degeneracy. The filter law at the last step is still well estimated, but a smoothing estimate of an early state rests on few paths.` };
  }

  /** The observations, the reference filter mean ± 2 sd, and the filter mean ± 2 sd of the first run. @param {any} c @param {any} m */
  function filterChart(c, m) {
    const ref = run.reference, y = c.data.y, T = y.length, label = "Observations, the reference filter mean with ± 2 standard deviations, and the particle filter of the first run";
    const ts = Array.from({ length: T }, (_, i) => i + 1);
    const sv = c.record.model === "sv";
    const vals = [...(sv ? [] : y), ...ref.means.flatMap((/** @type {number} */ v, /** @type {number} */ i) => [v - 2 * ref.sds[i], v + 2 * ref.sds[i]]), ...(m?.means ?? [])];
    const f = axes({ x: [1, T], y: P.padRange(vals, 0.05), xlabel: "Time t", ylabel: sv ? "x_t = log σ_t²" : "Level x_t" });
    const parts = [f.markup];
    parts.push(`<path class="band" d="M${ts.map((t, i) => `${f.sx(t).toFixed(1)} ${f.sy(ref.means[i] + 2 * ref.sds[i]).toFixed(1)}`).join("L")}L${ts.slice().reverse().map((t) => `${f.sx(t).toFixed(1)} ${f.sy(ref.means[t - 1] - 2 * ref.sds[t - 1]).toFixed(1)}`).join("L")}Z"/>`);
    parts.push(`<path class="series s2 ref-law" d="${line(ts, ref.means, f.sx, f.sy)}"/>`);
    if (m?.means) parts.push(`<path class="series s1" d="${line(ts, m.means, f.sx, f.sy)}"/>`);
    if (!sv) parts.push(`<g class="obs">${y.map((/** @type {number} */ v, /** @type {number} */ i) => `<circle cx="${f.sx(i + 1).toFixed(1)}" cy="${f.sy(v).toFixed(1)}" r="2"/>`).join("")}</g>`);
    if (!sv) parts.push(`<line class="ref" x1="${M.l}" x2="${W - M.r}" y1="${f.sy(c.params.h).toFixed(1)}" y2="${f.sy(c.params.h).toFixed(1)}"/>`);
    parts.push(keyText(`blue: particle filter, run 1 · orange dashed: ${sv ? "grid filter" : "Kalman filter"}, band ± 2 sd${sv ? "" : " · dots: readings · dashed: h"}`));
    return { html: svg(label, parts.join("")), note: `The ${sv ? "grid filter is a numerical approximation" : "Kalman filter is exact for this linear model with normal noise"}. The particle filter mean should stay close to it at every time.` };
  }

  /** The first 256 points in dimensions 1 and 2: randomised Sobol points and independent points. @param {any} c @param {any} m */
  function pointsChart(c, m) {
    const label = "The first 256 points of the first run in dimensions 1 and 2: randomised Sobol points on the left, independent points on the right";
    if (!m?.points) return { html: empty(label, "Run the lab to draw the points."), note: "" };
    const size = 240, gap = 60, x0 = (W - 2 * size - gap) / 2, y0 = 30;
    /** @type {string[]} */
    const parts = [];
    [["qmc", `Sobol (${run.c.settings.scramble === "none" ? "plain" : run.c.settings.scramble === "shift" ? "shifted" : "scrambled"})`], ["plain", "Independent"]].forEach(([k, name], i) => {
      const left = x0 + i * (size + gap);
      parts.push(`<rect class="frame" x="${left}" y="${y0}" width="${size}" height="${size}"/>`);
      for (let j = 1; j < 16; j++) parts.push(`<line class="grid16" x1="${left + (j * size) / 16}" x2="${left + (j * size) / 16}" y1="${y0}" y2="${y0 + size}"/><line class="grid16" x1="${left}" x2="${left + size}" y1="${y0 + (j * size) / 16}" y2="${y0 + (j * size) / 16}"/>`);
      parts.push(`<g class="pts ${k}">${m.points[k].map((/** @type {number[]} */ p) => `<circle cx="${(left + p[0] * size).toFixed(1)}" cy="${(y0 + (1 - p[1]) * size).toFixed(1)}" r="2.2"/>`).join("")}</g>`);
      parts.push(`<text class="direct-label" x="${left + size / 2}" y="${y0 + size + 18}" text-anchor="middle">${esc(name)}: u₁ against u₂</text>`);
    });
    return { html: svg(label, parts.join(""), 300), note: "Each of the 256 squares of the 16 × 16 grid holds exactly one Sobol point: the first 256 points are a digital net. Independent points leave some squares empty and put several points in others." };
  }

  /** The root mean square error against n for the randomised and the independent points, log axes. @param {any} c @param {any} m @param {number} qi @param {any} x */
  function rateChart(c, m, qi, x) {
    const ids = c.code.outputs, id = x.quantities[qi].id, q = ids.indexOf(id), label = `Root mean square error of ${x.quantities[qi].name} against n over the runs, log axes, for randomised Sobol points and independent points`;
    const rate = m?.integral?.rate;
    if (!rate || m.runs < 2) return { html: empty(label, "Run at least 2 randomisations to draw the error rate."), note: "" };
    const pts = rate.map((/** @type {any} */ r) => ({ n: r.n, a: r.rmse[q].qmc, b: r.rmse[q].plain }));
    const ys = pts.flatMap((/** @type {any} */ p) => [p.a, p.b]).filter((/** @type {number} */ v) => v > 0);
    if (!ys.length) return { html: empty(label, "Every error is 0: the runs give the reference value."), note: "" };
    const yr = /** @type {[number, number]} */ ([10 ** Math.floor(Math.log10(Math.min(...ys))), 10 ** Math.ceil(Math.log10(Math.max(...ys)))]);
    const f = axes({ x: [pts[0].n, pts.at(-1).n], y: yr, xlog: true, ylog: true, xlabel: "Number of points n (log axis)", ylabel: "RMSE (log axis)" });
    const parts = [f.markup];
    const ok = (/** @type {any[]} */ arr, /** @type {string} */ k2) => arr.filter((p) => p[k2] > 0);
    const a = ok(pts, "a"), b = ok(pts, "b");
    if (a.length > 1) parts.push(`<path class="series s1" d="${line(a.map((p) => p.n), a.map((p) => p.a), f.sx, f.sy)}"/>`);
    if (b.length > 1) parts.push(`<path class="series s2" d="${line(b.map((p) => p.n), b.map((p) => p.b), f.sx, f.sy)}"/>`);
    const n0 = pts[0].n, b0 = b[0]?.b;
    if (b0) for (const [pw, cls] of [[0.5, "slope"], [1, "slope"], [1.5, "slope"]]) {
      const n1 = pts.at(-1).n, v1 = b0 * (n0 / n1) ** /** @type {number} */ (pw);
      parts.push(`<path class="${cls}" d="${line([n0, n1], [b0, Math.max(v1, yr[0])], f.sx, f.sy)}"/><text class="direct-label" x="${f.sx(n1).toFixed(1)}" y="${(f.sy(Math.max(v1, yr[0])) - 3).toFixed(1)}" text-anchor="end">n^−${pw}</text>`);
    }
    parts.push(keyText("blue: randomised Sobol · orange: independent · grey: slopes n^−½, n^−1, n^−3/2"));
    return { html: svg(label, parts.join("")), note: "The error at each n is the root mean square of the R estimates against the reference, a finite-run observation. Each prefix of 2^k Sobol points is a digital net, so one run gives every n." };
  }

  /** The estimate of each run for one quantity, for each method, with the interval and the reference. @param {any} c @param {any} sm @param {number} qi @param {any} x */
  function runsChart(c, sm, qi, x) {
    const qd = x.quantities[qi], label = `The estimate of ${qd.name} from each independent run, for each method, with the 95 % interval and the reference`;
    if (!sm) return { html: empty(label, "Run the lab to draw the runs."), note: "" };
    const cols = sm.methods.map((/** @type {any} */ m, /** @type {number} */ k) => ({ m, vals: run.acc.runs.map((/** @type {any} */ r) => runValue(c, r.methods[k], qd.id)).filter((/** @type {any} */ v) => v !== null) }));
    const ref = run.reference.values[qd.id];
    const all = [...cols.flatMap((/** @type {any} */ col) => [...col.vals, col.m.quantities[qi].lo, col.m.quantities[qi].hi]), ref].filter((v) => v !== null && v !== undefined && Number.isFinite(v));
    if (!all.length) return { html: empty(label, "No estimate of this quantity yet."), note: "" };
    const yr = P.padRange(all, 0.1), sy = P.scale(yr[0], yr[1], H - M.b, M.t, false), yt = P.ticks(yr[0], yr[1], 5), band = (W - M.l - M.r) / cols.length;
    const parts = ['<g class="grid">', ...yt.map((/** @type {number} */ v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/>`), '</g><g class="tick">',
      ...yt.map((/** @type {number} */ v) => `<text x="${M.l - 6}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end">${esc(P.tickLabel(v, yt.length > 1 ? yt[1] - yt[0] : 0))}</text>`), "</g>",
      `<text class="axis-title" transform="translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">${esc(qd.name)}</text>`];
    if (ref !== null && ref !== undefined) parts.push(`<line class="ref" x1="${M.l}" x2="${W - M.r}" y1="${sy(ref).toFixed(1)}" y2="${sy(ref).toFixed(1)}"/>`);
    cols.forEach((/** @type {any} */ col, /** @type {number} */ i) => {
      const cx = M.l + band * (i + 0.5), q = col.m.quantities[qi];
      col.vals.forEach((/** @type {number} */ v, /** @type {number} */ j) => parts.push(`<circle class="dot s${i + 1}" cx="${(cx - band * 0.25 + (band * 0.5 * (j + 0.5)) / col.vals.length).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="3"/>`));
      if (q.lo !== null) parts.push(`<line class="series s${i + 1} wide" x1="${(cx + band * 0.32).toFixed(1)}" x2="${(cx + band * 0.32).toFixed(1)}" y1="${sy(q.lo).toFixed(1)}" y2="${sy(q.hi).toFixed(1)}"/>`);
      if (q.est !== null) parts.push(`<circle class="dot s${i + 1}" cx="${(cx + band * 0.32).toFixed(1)}" cy="${sy(q.est).toFixed(1)}" r="5"/>`);
      parts.push(`<text class="direct-label" x="${cx.toFixed(1)}" y="${H - M.b + 18}" text-anchor="middle">${esc(NAME[col.m.method])}</text>`);
    });
    parts.push(keyText("small dots: one run each · large dot and bar: estimate and 95 % interval · dashed: reference"));
    return { html: svg(label, parts.join("")), note: "The interval comes from the spread of the runs. When every run misses the reference by the same amount, the interval is narrow and wrong: a shared bias." };
  }

  /** The value of one quantity in one run of a method. @param {any} c @param {any} m @param {string} id */
  function runValue(c, m, id) {
    if (!m) return null;
    if (m.kind === "chain") { const fids = c.quantities.filter((/** @type {string} */ q) => Object.prototype.hasOwnProperty.call(c.code.f, q)), j = fids.indexOf(id); return j < 0 ? null : m.series[c.code.coords.length + j].mean; }
    if (m.kind === "integral") return m[m.method === "rqmc" ? "qmc" : "plain"].at(-1)[m.ids.indexOf(id)];
    return m.estimates?.[id] ?? null;
  }

  /* ---------- records ---------- */

  /** The run record: everything a replay needs, with the results and the three kinds of diagnostic. */
  function runRecord() {
    const s = app.state, sm = summary();
    return {
      format: "monte-carlo-workbench/lab-run", version: 1, created: new Date().toISOString(),
      generator: { name: "Philox4x32-10", version: Rng.VERSION, streams: Rng.SCHEME, stream: `${Ch.STREAM}/<method>, run b, purpose v` },
      seed: s.seed, example: s.c_example, params: s.c_params, settings: settingsOf(s), record: run?.record ?? null, status: run?.status ?? "idle", runs: run?.acc?.blocks ?? 0,
      reference: run?.c.ok ? { tag: run.reference.tag, how: run.reference.how, values: run.reference.values, logZ: run.reference.logZ ?? null } : null,
      results: (sm?.methods ?? []).map((/** @type {any} */ m) => ({
        method: m.method,
        quantities: m.quantities.map((/** @type {any} */ q) => ({ id: q.id, estimate: q.est, lo: q.lo, hi: q.hi, interval: q.how, reference: q.reference, error: q.error })),
        markovChain: m.chain ? { accept: m.chain.accept, divergent: m.chain.divergent, series: m.chain.series.map((/** @type {any} */ v) => ({ name: v.name, rhat: v.rhat, ess: v.ess, essIsUpperBound: v.bound, tau: v.tau, mcse: v.mcse })) } : null,
        weightDegeneracy: m.weights ? { N: m.weights.N, minEss: m.weights.minEss, finalEss: m.weights.meanFinalEss, maxWeight: m.weights.maxW, resamplings: m.weights.resamplings, distinctAncestors: m.weights.surviving, logZ: m.weights.logZ.est, logZSpread: m.weights.logZ.sd } : null,
        integral: m.integral ? { varianceRatio: m.integral.ratio } : null,
      })),
      environment: { userAgent: navigator.userAgent },
      replay: "The same seed, record and settings give the same integer stream. Floating-point results can differ in the last digits between browsers. The effective sample size is a diagnostic, not a proof of convergence.",
    };
  }

  /** Load a run record: set its example and settings, then compare the replay with it. @param {any} doc */
  function loadRun(doc) {
    if (!doc || doc.format !== "monte-carlo-workbench/lab-run") throw new Error("The file is not a lab run record of this page.");
    if (doc.version !== 1) throw new Error(`The record uses version ${String(doc.version).slice(0, 10)}. This page reads version 1.`);
    if (!data.chains.examples.some((/** @type {any} */ x) => x.id === doc.example)) throw new Error(`The record names the example "${String(doc.example).slice(0, 40)}", which this page does not have.`);
    const st = doc.settings ?? {};
    expected = { key: "", doc };
    app.set({ nav: "chains", c_example: doc.example, c_params: doc.params ?? "", seed: doc.seed, c_method: st.method, c_compare: st.compare, c_size: st.size, c_runs: st.runs, c_step: st.step, c_eps: st.eps, c_leap: st.leap, c_start: st.start,
      c_resample: st.resample, c_ess: st.ess, c_schedule: st.schedule, c_temps: st.temps, c_moves: st.moves, c_scramble: st.scramble, c_path: st.path });
    expected.key = keyOf(app.state);
  }

  /** @param {any} sm */
  function drawReplay(sm) {
    const box = $("chain-replay");
    if (!expected) { box.textContent = ""; return; }
    if (!run || run.status !== "done" || !sm) { box.textContent = `Replay of the loaded record: ${run?.status === "running" ? "the run proceeds" : "complete the run to compare"}.`; return; }
    let same = 0, close = 0, off = 0;
    sm.methods.forEach((/** @type {any} */ m, /** @type {number} */ i) => m.quantities.forEach((/** @type {any} */ q, /** @type {number} */ k) => {
      const e = expected.doc.results[i]?.quantities[k]?.estimate;
      if (e === q.est) same++;
      else if (e !== null && e !== undefined && q.est !== null && Math.abs(e - q.est) <= 1e-12 * Math.max(1, Math.abs(e))) close++;
      else off++;
    }));
    box.textContent = `Replay: ${same} estimates identical, ${close} equal up to the last digits, ${off} different.${off ? " A difference means that the record, the settings or the page version differ." : ""}`;
  }

  /** The estimates as CSV, one row for each method and quantity, then one row for each run. */
  function resultsCsv() {
    const sm = summary(), s = app.state;
    /** @param {unknown} v */
    const cell = (v) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = [["example", "method", "quantity", "run", "estimate", "lo", "hi", "interval", "reference", "error", "seed"].join(",")];
    for (const [k, m] of (sm?.methods ?? []).entries()) for (const q of m.quantities) {
      rows.push([s.c_example, m.method, q.id, "all", q.est, q.lo, q.hi, q.how, q.reference, q.error, s.seed].map(cell).join(","));
      run.acc.runs.forEach((/** @type {any} */ r, /** @type {number} */ b) => rows.push([s.c_example, m.method, q.id, b + 1, runValue(run.c, r.methods[k], q.id), "", "", "", q.reference, "", s.seed].map(cell).join(",")));
    }
    return `${rows.join("\n")}\n`;
  }

  /* ---------- report, tool and commands ---------- */

  /** The plain-data report of the lab for the deck and the Markdown record. @param {Record<string, any>} s */
  function report(s) {
    if (!run || run.key !== keyOf(s)) run = newRun(s);
    return Ch.report({ example: exampleOf(s), method: data.chains.methods.find((/** @type {any} */ y) => y.id === s.c_method) ?? null, state: s, summary: summary(), reference: run.reference, errors: run.c.ok ? [] : run.c.errors, status: run.status });
  }

  const tool = {
    name: "get_lab_run",
    description: "Return the Markov chain, sequential and quasi-Monte Carlo lab of the current view: the example, its record and settings, the status of the run, each method's estimates with intervals and the reference, and the three kinds of diagnostic kept apart: Markov-chain diagnostics (split R-hat, ESS, acceptance, divergent transitions), weight degeneracy (weight ESS, largest weight, resampling, distinct ancestors, log Z) and the estimation error.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      if (run?.key !== keyOf(app.state)) run = newRun(app.state);
      const body = run.c.ok ? runRecord() : { errors: run.c.errors, example: app.state.c_example };
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    },
  };

  const commands = [
    { label: "Open the Markov chain and quasi-Monte Carlo lab", run: () => app.set({ nav: "chains" }) },
    { label: "Run the lab", run: () => { app.set({ nav: "chains" }); start(); } },
    { label: "Step one run of the lab", run: step },
    { label: "Reset the lab run", run: reset },
    { label: "Save the lab run record", run: () => save(`lab-${app.state.c_example}-run.json`, `${JSON.stringify(runRecord(), null, 2)}\n`, "application/json") },
    ...(data?.chains?.examples ?? []).map((/** @type {any} */ x) => ({ label: `Open lab example: ${x.title}`, run: () => open(x.id) })),
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
      if (t.dataset.chainOpen) open(t.dataset.chainOpen, t.dataset.chainExtra ? JSON.parse(t.dataset.chainExtra) : {});
      else if (t.dataset.chainMethod) {
        const m = data.chains.methods.find((/** @type {any} */ x) => x.id === t.dataset.chainMethod);
        open(m.suitable.example, m.suitable.settings);
      }
    });
    $("chain-params").addEventListener("change", (/** @type {Event} */ e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      if (!el.dataset.chainParam) return;
      const x = exampleOf(app.state), names = x.params.map((/** @type {any} */ p) => p.name), vals = /** @type {Record<string, any>} */ ({ ...Ch.parseParams(app.state.c_params, names).values });
      const v = el.value.trim().replace(/;/g, ""), spec = x.params.find((/** @type {any} */ p) => p.name === el.dataset.chainParam);
      if (!v || Number(v) === spec?.value) delete vals[el.dataset.chainParam];
      else vals[el.dataset.chainParam] = v;
      app.set({ c_params: names.filter((/** @type {string} */ n) => vals[n] !== undefined).map((/** @type {string} */ n) => `${n}=${vals[n]}`).join("; ").slice(0, 200) });
    });
    $("chain-search").addEventListener("input", () => app.set({ q: $("chain-search").value.slice(0, 200) }, "replace"));
    $("chain-go").addEventListener("click", start);
    $("chain-step-run").addEventListener("click", step);
    $("chain-pause").addEventListener("click", pause);
    $("chain-reset").addEventListener("click", reset);
    $("chain-autorun").addEventListener("change", () => { autorun = $("chain-autorun").checked; });
    $("chain-plots").addEventListener("click", (/** @type {Event} */ e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest?.("button");
      if (b && /** @type {HTMLButtonElement} */ (b).value) app.set({ c_plot: /** @type {HTMLButtonElement} */ (b).value });
    });
    $("chain-save-run").addEventListener("click", () => save(`lab-${app.state.c_example}-run.json`, `${JSON.stringify(runRecord(), null, 2)}\n`, "application/json"));
    $("chain-save-csv").addEventListener("click", () => save(`lab-${app.state.c_example}-results.csv`, resultsCsv(), "text/csv"));
    $("chain-load-run").addEventListener("change", async () => {
      const f = $("chain-load-run").files?.[0];
      if (!f) return;
      try {
        let doc;
        try { doc = JSON.parse(await f.text()); } catch { throw new Error("The file is not JSON."); }
        loadRun(doc);
        $("chain-record-status").textContent = `Loaded ${f.name}.`;
      } catch (err) {
        $("chain-record-status").textContent = `The page did not load ${f.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
      $("chain-load-run").value = "";
    });
    $("chain-plot-svg").addEventListener("click", () => hooks.saveSvg("chain-plot", `lab-${app.state.c_example}-${shownPlot(app.state)}`));
    $("chain-plot-png").addEventListener("click", () => hooks.savePng("chain-plot", `lab-${app.state.c_example}-${shownPlot(app.state)}`));
  }

  g.MCChainView = { draw, bind, examples, open, key, tool, commands, report, runRecord, resultsCsv, get run() { return run; }, start, step, pause, reset };
})();
