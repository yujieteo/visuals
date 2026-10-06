/* Monte Carlo Probability Workbench: the page. It starts the kit with the state of Model.FIELDS and draws the
 * three panels from the state and from the last run: navigation on the left, the experiment and its linked
 * visuals in the centre, theory, assumptions, diagnostics and interpretation on the right. Runs go through the
 * worker pool block by block; Step, Run, Pause and Reset run drive them. The run record, the model record, the
 * CSV tables and the figures save as files; the kit saves the view, the Markdown record and the deck.
 */
(function () {
  "use strict";
  const g = /** @type {any} */ (globalThis);
  const K = g.VisualKit, M = g.Model, En = g.MCEngine, P = g.MCPlots, Rng = g.MCRng, Rep = g.Report, D = g.MCDsl, Laws = g.MCLaws, Pool = g.MCPool, Cu = g.MCCustom;
  const data = M.DATA;
  const LIMIT_MS = 120000, AUTOSAVE = "monte-carlo-workbench/autosave/v1";
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);
  /** @param {unknown} s */
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  /** @param {number | null | undefined} v */
  const fmt = (v) => (v === null || v === undefined ? "–" : P.fmt(v));
  /** @param {number} n */
  const count = (n) => n.toLocaleString("en-US");
  /**
   * An estimate and its interval with enough significant digits that the two ends differ, from 4 up to 12.
   * @param {number | null} est @param {number | null} lo @param {number | null} hi @returns {[string, string, string]}
   */
  function precise(est, lo, hi) {
    if (est === null || lo === null || hi === null || !(hi > lo)) return [fmt(est), fmt(lo), fmt(hi)];
    const size = Math.max(Math.abs(lo), Math.abs(hi));
    const digits = Math.min(12, Math.max(4, Math.ceil(Math.log10(size / (hi - lo))) + 2));
    /** @param {number} v */
    const f = (v) => (Math.abs(v) >= 1e-3 && Math.abs(v) < 1e9 ? String(+v.toPrecision(digits)) : v.toPrecision(Math.min(digits, 6))).replace("-", "−");
    return [f(est), f(lo), f(hi)];
  }
  const METHOD = /** @type {Record<string, string>} */ ({ independent: "Independent sampling", inverse: "Inverse transform", rejection: "Rejection sampling", stratified: "Stratification", antithetic: "Antithetic variables", control: "Control variates", crn: "Common random numbers", none: "None" });
  const TAG = /** @type {Record<string, string>} */ ({ theorem: "Theorem", numerical: "Numerical approximation", observation: "Finite-run observation" });
  /** @param {"theorem" | "numerical" | "observation"} kind */
  const tag = (kind) => `<span class="tag tag-${kind}">${TAG[kind]}</span>`;

  /* ---------- the run ---------- */

  /** @type {any} */
  let app = null;
  /** @type {any} */
  let run = null;
  /** @type {any} */
  let sweepRun = null;
  /** @type {any} */
  let pool = null;
  let customVersion = 0, autorun = true, frame = 0, lastKey = "";
  /** The run record a reader loaded, to compare with the replay. @type {any} */
  let expected = null;

  function engineSource() {
    return ["src-rng", "src-special", "src-expr", "src-continuous", "src-tails", "src-laws", "src-custom", "src-constructed", "src-engine", "src-worker"].map((id) => $(id).textContent).join("\n;\n");
  }
  function getPool() {
    if (!pool) pool = Pool.createPool({ source: engineSource(), size: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)), engine: En });
    return pool;
  }
  /** @param {Record<string, any>} s */
  const runKey = (s) => JSON.stringify([s.model, s.params, s.method, s.compare, s.streams, s.strata, s.stratify, s.size, s.seed, s.failure, s.model === "custom" ? customVersion : 0]);
  /** The engine settings of a state. @param {Record<string, any>} s @param {Record<string, string>} overrides @param {string} [compare] */
  const settingsOf = (s, overrides, compare = s.compare) => ({ seed: s.seed, method: s.method, compare, failure: s.failure, overrides, streams: s.streams, strata: s.strata, stratify: s.stratify });

  /** A new, empty run for the state, or null when the model has errors. @param {Record<string, any>} s @param {any} d */
  function newRun(s, d) {
    if (!d.ok) return null;
    const { record } = M.modelOf(s, data);
    const settings = settingsOf(s, M.parseParams(s.params).overrides);
    const c = En.prepare(record, settings);
    if (!c.ok) return null;
    return { key: runKey(s), record, settings, c, d, target: 2 ** s.size / En.BLOCK, accum: En.empty(c), status: "idle", message: "", elapsed: 0, started: 0, handle: null, mode: "" };
  }

  /** Start or continue the run up to `to` blocks. @param {number} to */
  function go(to) {
    if (!run || run.handle) return;
    if (run.accum.blocks >= to) return;
    const r = run;
    r.status = "running";
    r.started = performance.now();
    r.message = "";
    const p = getPool();
    r.handle = p.run({ record: r.record, settings: r.settings, opts: { references: r.d.references.map((/** @type {any} */ x) => x.values), window: r.d.focus.window }, from: r.accum.blocks, to }, {
      onBlock(/** @type {any} */ stats) {
        if (run !== r) return;
        r.accum = En.merge(r.accum, stats, r.c);
        if (r.elapsed + performance.now() - r.started > LIMIT_MS) { r.message = `The run reached the time limit of ${LIMIT_MS / 1000} s and paused.`; r.handle?.pause(); }
        schedule();
      },
      onEnd(/** @type {string} */ status, /** @type {string} */ message) {
        if (run !== r) return;
        r.elapsed += performance.now() - r.started;
        r.handle = null;
        r.mode = p.mode;
        r.status = status === "done" ? (r.accum.blocks >= r.target ? "done" : "paused") : status;
        if (message) r.message = message;
        schedule();
      },
    });
    r.mode = p.mode;
    schedule();
  }
  function startRun() { if (run) go(run.target); }
  function stepRun() { if (run && !run.handle) go(Math.min(run.target, run.accum.blocks + 1)); }
  function pauseRun() { run?.handle?.pause(); }
  function resetRun() {
    run?.handle?.cancel();
    if (run) run = newRun(app.state, app.derived);
    schedule();
  }
  /** Draw the status line now, so it always matches the run, and the rest of the run's views at the next frame. */
  function schedule() {
    drawStatus();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => drawRun(app.state, app.derived));
  }

  /** The summary of the current run. */
  function summary() {
    if (!run || !run.accum.blocks) return null;
    return En.summary(run.c, run.accum, run.d.quantities.map((/** @type {any} */ q) => q.status), run.d.references);
  }

  /* ---------- left: navigation ---------- */

  /** @param {string} q */
  function matches(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.models.filter((/** @type {any} */ m) => {
      const law = data.laws.find((/** @type {any} */ l) => l.id === m.law);
      const hay = [m.title, m.domain, m.decision, m.reason, m.method, m.observe, m.law, law?.name, m.dsl].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  /** @param {Record<string, any>} s */
  function drawNav(s) {
    for (const id of ["examples", "editor", "library"]) $(`nav-${id}`).hidden = s.nav !== id;
    const list = matches(s.q);
    // The custom input examples of group 4 come last, under their own heading.
    const byLaw = [...data.laws, { id: "custom", name: "Custom law inputs" }].map((/** @type {any} */ l) => ({ law: l, models: list.filter((/** @type {any} */ m) => m.law === l.id) })).filter((/** @type {any} */ x) => x.models.length);
    $("example-list").innerHTML = byLaw.length ? byLaw.map((/** @type {any} */ x) => `<h3 class="law-head">${esc(x.law.name)}</h3><ul class="model-list">${x.models.map((/** @type {any} */ m) =>
      `<li><button type="button" class="link${m.id === s.model ? " current" : ""}" data-open="${esc(m.id)}" aria-current="${m.id === s.model}"><span class="kind">${m.kind === "experiment" ? "Behaviour" : m.kind === "input" ? `Input${m.fails ? ", fails" : ""}` : esc(m.domain)}</span> ${esc(m.title)}</button></li>`).join("")}</ul>`).join("")
      : `<p class="note">No example matches "${esc(s.q)}". Search by a decision, a phenomenon, a law or a method.</p>`;
    $("law-list").innerHTML = data.laws.map((/** @type {any} */ l) => `<li><button type="button" class="link" data-open="exp-${esc(l.id)}">${esc(l.name)}</button></li>`).join("");
    $("method-list").innerHTML = data.methods.map((/** @type {any} */ m) => `<li><button type="button" class="link" data-method="${esc(m.id)}">${esc(m.name)}</button></li>`).join("");
    $("theory-list").innerHTML = data.theory.map((/** @type {any} */ t) => `<li><button type="button" class="link" data-theory="${esc(t.id)}">${esc(t.title)}</button></li>`).join("");
  }

  /* ---------- centre ---------- */

  /** @param {Record<string, any>} s @param {any} d */
  function drawHeader(s, d) {
    const entry = data.models.find((/** @type {any} */ m) => m.id === s.model);
    $("model-kind").textContent = entry ? (entry.kind === "input" ? "Custom law input · an example of the checks" : `${entry.kind === "experiment" ? "Behaviour experiment" : `Workflow · ${entry.domain}`} · ${data.laws.find((/** @type {any} */ l) => l.id === entry.law)?.name} law`) : "Custom model from the editor";
    $("model-title").textContent = d.model.title;
    $("model-problem").textContent = d.model.problem;
    const ds = entry?.data?.kind === "real" ? data.datasets.find((/** @type {any} */ x) => x.id === entry.data.dataset) : null;
    $("model-data").textContent = ds ? `Real data: ${ds.title}. Source: ${ds.source} ${ds.licence}` : entry?.data?.text ?? (entry?.kind === "input" ? "An input example: the law line states the law, and the page checks it. There is no data." : entry ? "Synthetic: the parameters define the model that makes the data. They are illustrative values." : "Custom model: the reader states its parameters and data.");
    $("model-errors").hidden = d.ok;
    $("model-errors").innerHTML = d.ok ? "" : `<p>The model has ${d.errors.length} ${d.errors.length === 1 ? "error" : "errors"}, so the page does not run it:</p><ul>${d.errors.map((/** @type {string} */ e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
  }

  /** @param {Record<string, any>} s @param {any} d */
  function drawParams(s, d) {
    const key = JSON.stringify([s.model, s.params, customVersion]);
    const box = $("param-fields");
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.innerHTML = d.parameters.length ? d.parameters.map((/** @type {any} */ p) => `<div class="param">
<label for="p-${esc(p.name)}"><span class="mono">${esc(p.name)}</span>${p.unit ? ` <span class="unit">[${esc(p.unit)}]</span>` : ""}</label>
<input id="p-${esc(p.name)}" type="text" inputmode="decimal" spellcheck="false" data-param="${esc(p.name)}" value="${esc(p.expr)}" aria-describedby="pn-${esc(p.name)}">
<p class="note" id="pn-${esc(p.name)}">${esc(p.note)}${p.alternatives ? ` Alternatives set this parameter. A value here replaces it in every alternative.` : ""}${p.set ? ` <button type="button" class="link" data-unset="${esc(p.name)}">Use the model value ${esc(p.base)}</button>` : ""}</p>
</div>`).join("") : '<p class="note">This model has no parameters.</p>';
  }

  /** @param {Record<string, any>} s @param {any} d */
  function drawControls(s, d) {
    $("size-out").textContent = `2^${s.size} = ${count(2 ** s.size)}`;
    const stratified = s.method === "stratified" || s.compare === "stratified";
    $("strata-field").hidden = !stratified;
    $("strata-out").textContent = `K = 2^${s.strata} = ${2 ** s.strata}${d.ok && d.design.stratify ? `, on the uniform of ${d.design.stratify.name}` : ""}`;
    const vars = d.design?.scalars ?? [], key = vars.join(",") + s.stratify;
    if ($("stratify").dataset.key !== key) {
      $("stratify").innerHTML = [`<option value="">The focus variable</option>`, ...vars.map((/** @type {string} */ v) => `<option value="${esc(v)}"${v === s.stratify ? " selected" : ""}>${esc(v)}</option>`)].join("");
      $("stratify").dataset.key = key;
    }
    $("failure-note").textContent = d.ok ? d.failureNote : "";
    const ranges = $("sweep-param");
    const names = d.parameters.map((/** @type {any} */ p) => p.name);
    const opts = [`<option value="">Choose a parameter</option>`, ...names.map((/** @type {string} */ n) => `<option value="${esc(n)}"${n === s.sweep ? " selected" : ""}>${esc(n)}</option>`)].join("");
    if (ranges.dataset.key !== names.join(",") + s.sweep) { ranges.innerHTML = opts; ranges.dataset.key = names.join(",") + s.sweep; }
    $("alt-select").innerHTML = (d.alternatives ?? []).map((/** @type {string} */ a, /** @type {number} */ i) => `<option value="${i + 1}"${i + 1 === d.alt ? " selected" : ""}>${esc(a)}</option>`).join("");
    $("quantity-select").innerHTML = (d.quantities ?? []).map((/** @type {any} */ q, /** @type {number} */ i) => `<option value="${i + 1}"${i + 1 === d.quantity ? " selected" : ""}>${esc(q.name)} (${q.kind})</option>`).join("");
  }

  /** The run's frequencies of the focus variable for the plot kind. @param {any} d @param {any} h @param {string} kind */
  function empirical(d, h, kind) {
    const w = d.focus.window;
    if (!h || !h.values) return null;
    const xs = [], ys = [];
    if (d.focus.continuous) {
      // Densities at the bin centres; the CDF and the survival function at the right edges.
      if (kind === "pmf") {
        for (let k = 0; k < w.bins; k++) { xs.push(w.lo + (k + 0.5) * w.width); ys.push(h.bins[k] / (h.values * w.width)); }
        return { x: xs, y: ys };
      }
      let below = h.under;
      for (let k = 0; k < w.bins; k++) { below += h.bins[k]; xs.push(w.lo + (k + 1) * w.width); ys.push(kind === "survival" ? 1 - below / h.values : below / h.values); }
      if (kind === "survival") w.thresholds.forEach((/** @type {number} */ t, /** @type {number} */ i) => { xs.push(t); ys.push(h.exceed[i] / h.values); });
      if (kind !== "quantile") return { x: xs, y: ys };
      const qx = [], qy = [];
      for (const u of Array.from({ length: 199 }, (_, i) => (i + 1) / 200)) {
        const j = ys.findIndex((v) => v >= u);
        if (j < 0) break;
        qx.push(u);
        qy.push(xs[j]);
      }
      return { x: qx, y: qy };
    }
    if (kind === "pmf") {
      for (let k = 0; k < w.bins; k++) { xs.push(w.lo + k * w.width); ys.push(h.bins[k] / h.values); }
      return { x: xs, y: ys };
    }
    let below = h.under;
    for (let k = 0; k < w.bins; k++) {
      below += h.bins[k];
      xs.push(w.lo + k * w.width);
      ys.push(kind === "survival" ? 1 - below / h.values : below / h.values);
    }
    if (kind === "survival") w.thresholds.forEach((/** @type {number} */ t, /** @type {number} */ i) => { xs.push(t); ys.push(h.exceed[i] / h.values); });
    if (kind === "quantile") {
      const grid = Array.from({ length: 199 }, (_, i) => (i + 1) / 200), qx = [], qy = [];
      for (const u of grid) {
        const j = ys.findIndex((v) => v >= u);
        if (j < 0) break;
        qx.push(u);
        qy.push(xs[j] + (w.width > 1 ? w.width - 1 : 0));
      }
      return { x: qx, y: qy };
    }
    return { x: xs, y: ys };
  }

  /** @param {Record<string, any>} s @param {any} d @param {any} sm */
  function drawPlots(s, d, sm) {
    if (!d.ok) { $("dist-plot").innerHTML = ""; $("conv-plot").innerHTML = ""; return; }
    const a = d.alt - 1, q = d.quantity - 1, h = sm?.[0]?.hists?.[a] ?? null;
    const ylog = s.yscale === "log";
    $("dist-plot").innerHTML = s.plot === "tail" ? P.tail({ xlabel: d.focus.name, theory: d.focus.theory, empirical: empirical(d, h, "survival"), n: h?.values ?? 0, alpha: d.focus.law?.tailIndex })
      : P.distribution({ kind: s.plot, ylog, xlabel: d.focus.name, theory: d.focus.theory, empirical: empirical(d, h, s.plot), n: h?.values ?? 0, continuous: d.focus.continuous, width: d.focus.window.width });
    $("plot-pmf").textContent = d.focus.continuous ? "PDF" : "PMF";
    const outside = h && h.values ? (h.under + h.over) / h.values : 0, w = d.focus.window, end = w.lo + w.bins * w.width - (d.focus.continuous ? 0 : 1);
    $("dist-note").textContent = `${d.focus.name}${d.alternatives.length > 1 ? `, ${d.alternatives[a]}` : ""}. ${h ? `${count(h.values)} values, ${(outside * 100).toFixed(2)} % outside the window ${fmt(w.lo)} to ${fmt(end)}${h.max !== null ? `, largest value ${fmt(h.max)}` : ""}.` : "No run yet."} ${s.plot === "tail" ? `${d.focus.law?.tailIndex ? `The law of ${d.focus.name} has a regularly varying tail with index α = ${fmt(d.focus.law.tailIndex)}, so far out the reference line has the slope −α. ` : "A tail that is not regularly varying, such as a lognormal or a light tail, bends down on these axes. "}The plot shows x > 0 only. ` : ""}${d.focus.theory ? `The reference law comes from ${d.focus.law ? `the exact law: ${d.focus.law.label}${d.focus.law.numeric ? ", computed by numerical integration" : ""}` : "the law itself or from the enumeration"}.` : d.focus.continuous ? "No reference law: the focus is a function of several variables. A pilot sample of 2,048 replicates sets the window." : "No reference law: the support is too large to enumerate."}`;
    const ref = d.references[a]?.values[q] ?? null;
    const qd = d.quantities[q], st = qd.status.alts?.[a] ?? qd.status;
    // No band where the variance is infinite: the interval of each block would claim a precision that the law lacks.
    const band = st.variance !== "infinite";
    const trace = run && run.accum.trace.length ? run.accum.trace.map((/** @type {any} */ t) => { const e = t.est[0][a][q]; return { n: t.n, est: e[0], lo: band ? e[1] : null, hi: band ? e[2] : null }; }) : [];
    $("conv-plot").innerHTML = P.convergence({ trace, reference: ref, ylabel: `${qd.name}${qd.unit ? ` [${qd.unit}]` : ""}`, ylog: st.mean === "infinite" && trace.some((/** @type {any} */ t) => t.est > 0) });
    // An infinite mean comes with an infinite variance, so it is tested first: it is the stronger statement.
    $("conv-note").textContent = st.mean === "infinite" ? (qd.status.twoSided ? "The mean does not exist: both tails are heavy, so the line wanders with no limit. It shows a finite-run observation." : "The mean is infinite: the line shows a finite-run observation with no finite limit.") : st.variance === "infinite" ? "The variance is infinite: the page draws no interval band, and the estimate converges slowly." : "The band is the 95 % interval after each block.";
  }

  /** @param {any} q @param {any} status */
  function intervalCell(q, status) {
    if (q.est === null) return "–";
    if (q.lo === null) return `<span class="warn-text">${esc(q.how)}</span>`;
    const [, lo, hi] = precise(q.est, q.lo, q.hi);
    return `${lo} to ${hi}<br><span class="note">${esc(q.how)}${status.variance === "unknown" && q.kind === "expectation" ? ". The variance is not shown to be finite" : ""}${q.gain ? `. ${gainText(q.gain)}` : ""}</span>`;
  }

  /** The gain of a variance-reduction design in words. @param {any} g */
  function gainText(g) {
    return `Variance ratio against independent sampling: ${fmt(g.ratio)}${g.ratio < 1 ? " (a loss)" : ""}`;
  }

  /** @param {Record<string, any>} s @param {any} d @param {any} sm */
  function drawResults(s, d, sm) {
    if (!d.ok) { $("results-table").innerHTML = ""; $("decision-body").innerHTML = ""; return; }
    const m0 = sm?.[0];
    /** @type {string[]} */
    const rows = [];
    d.alternatives.forEach((/** @type {string} */ label, /** @type {number} */ a) => d.quantities.forEach((/** @type {any} */ qd, /** @type {number} */ k) => {
      const q = m0?.alts[a].quantities[k], st = qd.status.alts?.[a] ?? qd.status;
      const ref = d.references[a].values[k];
      const r = d.references[a], how = r.method === "quadrature" ? "adaptive quadrature over the quantile functions" : "enumeration";
      const refNote = ref === null ? (st.mean === "infinite" ? (qd.status.twoSided ? "None: the mean does not exist." : "None: the mean is infinite.") : r.how?.[k] === "" && r.reason === "" ? "No reference: the page has no exact law or quadrature for this quantity." : r.reason || (r.method === "quadrature" && qd.status.mean !== "finite" ? "None: the page cannot show that the mean exists." : "No reference.")) : r.how?.[k] ? r.how[k] : r.closed?.[k] ? "closed form" : r.neglected ? `${how}, neglected mass ≤ ${fmt(r.neglected)}` : how;
      rows.push(`<tr><th scope="row">${esc(label)}</th><td><span class="mono">${esc(qd.name)}</span><br><span class="note">${esc(qd.note)}${qd.unit ? ` [${esc(qd.unit)}]` : ""}</span></td>
<td class="num">${q ? precise(q.est, q.lo, q.hi)[0] : "–"}${q?.hits !== null && q?.hits !== undefined ? `<br><span class="note">${count(q.hits)} hits</span>` : ""}</td><td class="num">${q ? intervalCell(q, st) : "–"}</td>
<td class="num">${fmt(ref)}<br><span class="note">${esc(refNote)}</span></td><td>${q ? tag("observation") : ""}${ref !== null ? tag(d.references[a].closed?.[k] ? "theorem" : "numerical") : ""}</td></tr>`);
    }));
    $("results-table").innerHTML = `<table><caption>Estimates after ${count(run?.accum.n ?? 0)} replicates for each alternative. Seed ${s.seed}. ${run && run.status !== "done" && run.accum.blocks ? "<strong>Partial: the run is not complete.</strong>" : ""}</caption>
<thead><tr><th scope="col">Alternative</th><th scope="col">Quantity</th><th scope="col">Estimate</th><th scope="col">95 % interval</th><th scope="col">Reference value</th><th scope="col">Claim</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
    const dec = m0?.decision;
    const objective = d.decision?.objective, cons = d.decision?.constraints ?? [];
    const head = `<p>${objective ? `Objective: ${objective.direction} <span class="mono">${esc(objective.quantity)}</span>.` : "The model states no objective."} ${cons.length ? `Constraints: ${cons.map((/** @type {any} */ c) => `<span class="mono">${esc(c.quantity)} ${c.op === "<=" ? "≤" : "≥"} ${c.value}</span>`).join(", ")}.` : "No constraints."}</p>`;
    if (!dec) { $("decision-body").innerHTML = `${head}<p class="note">Run the experiment to compare the alternatives.</p>`; return; }
    const diffs = m0.diffs.map((/** @type {any} */ p) => `<li>${esc(d.alternatives[p.b])} − ${esc(d.alternatives[p.a])}: ${p.quantities.map((/** @type {any} */ q) => `<span class="mono">${esc(q.name)}</span> ${q.est === null ? esc(q.how) : `${fmt(q.est)} (${q.lo === null ? "no interval" : `${fmt(q.lo)} to ${fmt(q.hi)}`})${q.crn !== null ? `, variance ratio ${fmt(q.crn)} against independent alternatives` : ""}`}`).join("; ")}</li>`).join("");
    $("decision-body").innerHTML = `${head}<table><thead><tr><th scope="col">Alternative</th><th scope="col">Constraints</th><th scope="col">Admissible</th></tr></thead><tbody>${dec.rows.map((/** @type {any} */ r) => `<tr${r.a === dec.best ? ' class="best"' : ""}><th scope="row">${esc(r.label)}${r.a === dec.best ? " ★ best" : ""}</th><td>${r.checks.length ? r.checks.map((/** @type {any} */ c) => `${esc(c.quantity)}: <span class="verdict-${c.verdict.replace(/ /g, "-")}">${esc(c.verdict)}</span>`).join("<br>") : "none"}</td><td>${r.admissible ? "yes" : "no"}</td></tr>`).join("")}</tbody></table>
<p>${dec.best === null ? esc(dec.text) : `${esc(d.alternatives[dec.best])} is the best admissible alternative. ${dec.separated ? "Its paired 95 % intervals separate it from every other admissible alternative." : "<strong>Not separable:</strong> a paired interval still includes 0, so the run needs more replicates before this choice."}`} ${tag("observation")}</p>
${diffs ? `<details><summary>Paired differences, ${s.streams === "common" ? "common random numbers" : "separate streams"}</summary><ul>${diffs}</ul><p class="note">The variance ratio is (se_a² + se_b²)/se_d²: about 1 with separate streams, above 1 when common random numbers help, below 1 when they hurt. ${tag("observation")}</p></details>` : ""}`;
  }

  /** @param {Record<string, any>} s @param {any} d @param {any} sm */
  function drawCompare(s, d, sm) {
    const box = $("fig-compare");
    box.hidden = !d.ok || !sm || sm.length < 2;
    if (box.hidden) return;
    const q = d.quantity - 1, a = d.alt - 1;
    const rows = sm.map((/** @type {any} */ m) => { const x = m.alts[a].quantities[q]; return { label: METHOD[m.method], est: x.est, lo: x.lo, hi: x.hi, reference: x.reference }; });
    $("compare-plot").innerHTML = P.comparison({ rows, ylabel: d.quantities[q].name });
    const reps = run.accum.n * d.alternatives.length;
    $("compare-table").innerHTML = `<table><thead><tr><th scope="col">Method</th><th scope="col">Estimate</th><th scope="col">Sample variance</th><th scope="col">Variance of the estimate</th><th scope="col">Time for each replicate</th><th scope="col">Rejection</th></tr></thead><tbody>${sm.map((/** @type {any} */ m) => {
      const x = m.alts[a].quantities[q], v = x.sampleSd !== null ? x.sampleSd ** 2 : x.est !== null && x.kind === "probability" ? x.est * (1 - x.est) : null;
      return `<tr><th scope="row">${METHOD[m.method]}</th><td class="num">${fmt(x.est)}</td><td class="num">${fmt(v)}</td><td class="num">${x.se !== null ? fmt(x.se * x.se) : "–"}${x.gain ? `<br><span class="note">ratio ${fmt(x.gain.ratio)}</span>` : ""}</td><td class="num">${reps ? `${fmt((m.ms / reps) * 1000)} µs` : "–"}</td><td>${m.rejection.proposals ? `${fmt(m.rejection.accepts / m.rejection.proposals)} accepted` : "not used"}</td></tr>`;
    }).join("")}</tbody></table><p class="note">Both methods use the same streams and the same number of evaluations of the model, so the variances of the estimates compare directly. The ratio is the variance of plain sampling over the variance of the design. The times are a finite-run observation of this browser, and they include the worker overhead.</p>`;
  }

  /** @param {Record<string, any>} s @param {any} d */
  function drawModelViews(s, d) {
    if (!d.ok) { $("graph-plot").innerHTML = ""; $("equations").innerHTML = ""; $("variable-table").innerHTML = ""; return; }
    const key = JSON.stringify([s.model, customVersion]);
    if ($("graph-plot").dataset.key === key) return;
    $("graph-plot").dataset.key = key;
    $("graph-plot").innerHTML = P.graph(d.graph);
    $("variable-table").innerHTML = `<table><caption>Random variables, with the support at the first alternative</caption><thead><tr><th scope="col">Variable</th><th scope="col">Law</th><th scope="col">Support</th><th scope="col">Unit</th></tr></thead><tbody>${d.variableTable.map((/** @type {any} */ v) => `<tr><th scope="row"><span class="mono">${esc(v.name)}</span>${v.repeat > 1 ? ` <span class="note">${count(v.repeat)} i.i.d. copies</span>` : ""}<br><span class="note">${esc(v.note)}</span></th><td>${esc(v.law)}</td><td class="num">${esc(v.support)}</td><td>${esc(v.unit) || "–"}</td></tr>`).join("")}</tbody></table>`;
    $("equations").innerHTML = d.equations.map((/** @type {string} */ t) => `<div class="formula" data-tex="${esc(t)}"></div>`).join("");
    $("model-text").textContent = d.text;
  }

  /* ---------- right ---------- */

  /** @param {Record<string, any>} s @param {any} d @param {any} sm */
  function drawRight(s, d, sm) {
    for (const id of ["theory", "assumptions", "diagnostics", "interpretation"]) $(`panel-${id}`).hidden = s.panel !== id;
    const entry = data.models.find((/** @type {any} */ m) => m.id === s.model);
    const th = data.theory.find((/** @type {any} */ t) => t.id === s.theory);
    const key = JSON.stringify([s.theory]);
    if ($("theory-body").dataset.key !== key) {
      $("theory-body").dataset.key = key;
      $("theory-body").innerHTML = `<h3>${esc(th.title)}</h3><p>${tag("theorem")}</p><div class="formula" data-tex="${esc(th.statement)}"></div>
<h4>Assumptions</h4><ul>${th.assumptions.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul><h4>Proof sketch</h4><p>${esc(th.proof)}</p>
<h4>Counterexample</h4><p>${esc(th.counterexample)}</p><h4>Reference</h4><p class="note">${esc(th.reference)}</p>
<p><button type="button" data-linked="${esc(th.id)}">Open the linked experiment</button></p>`;
    }
    if (!d.ok) { $("panel-assumptions").innerHTML = $("panel-diagnostics").innerHTML = $("panel-interpretation").innerHTML = '<p class="note">Correct the model to see this panel.</p>'; return; }
    const method = data.methods.find((/** @type {any} */ m) => m.id === s.method);
    const parts = entry?.kind === "workflow" ? [["Decision and estimated quantity", entry.decision], ["Reason for the law", entry.reason], ["Parameters, units, data and assumptions", entry.inputs], ["Dependence or process model", entry.dependence], ["Method and estimator", entry.method]] : [];
    $("panel-assumptions").innerHTML = `${parts.map(([h, t]) => `<h4>${esc(h)}</h4><p>${esc(t)}</p>`).join("")}${entry?.kind === "experiment" ? `<h4>What the experiment shows</h4><p>${esc(entry.observe)}</p>` : ""}
<h4>Assumptions of ${esc(method.name.toLowerCase())}</h4><ul>${method.assumptions.map((/** @type {string} */ a) => `<li>${esc(a)}</li>`).join("")}</ul>
<h4>Model fields</h4><dl class="readout"><dt>Initial conditions</dt><dd>none</dd><dt>Dynamics</dt><dd>none: no time</dd><dt>Observation</dt><dd>${esc(d.observation ?? "complete")}</dd><dt>Censoring</dt><dd>${d.censoring ? `${esc(d.censoring.text)}: the model observes <span class="mono">${esc(d.censoring.obs)}</span> and the event indicator <span class="mono">${esc(d.censoring.event)}</span>. An estimator that reads only these names sees what a real study sees.` : "none"}</dd><dt>Truncation</dt><dd>${d.samplers?.some((/** @type {any} */ x) => /^truncated_/.test(x.law)) ? "a truncated law: the values outside [lower, upper] do not occur and leave no record" : "none"}</dd><dt>Selection</dt><dd>none in this group</dd></dl>`;
    const m0 = sm?.[0];
    /** @type {string[]} */
    const diag = [];
    d.quantities.forEach((/** @type {any} */ q, /** @type {number} */ k) => {
      const est = m0?.alts.map((/** @type {any} */ alt) => alt.quantities[k]) ?? [];
      // Where the alternatives differ in their tails, each one says whether its CLT interval is valid.
      const infinite = (/** @type {number} */ a) => (q.status.alts?.[a] ?? q.status).variance === "infinite", mixed = d.alternatives.some((/** @type {string} */ _, /** @type {number} */ a) => infinite(a) !== infinite(0));
      const cov = est.map((/** @type {any} */ x, /** @type {number} */ a) => x.coverage ? `${esc(d.alternatives[a])}: ${x.coverage.hit} of ${x.coverage.of} blocks (${fmt((100 * x.coverage.hit) / x.coverage.of)} %)${mixed && infinite(a) ? ", a CLT interval that is not valid here because the variance is infinite" : ""}` : "").filter(Boolean);
      const zero = est.some((/** @type {any} */ x) => x.hits === 0);
      const byAlt = (q.status.alts ?? []).some((/** @type {any} */ x) => x.mean !== q.status.mean || x.variance !== q.status.variance)
        ? ` By alternative: ${q.status.alts.map((/** @type {any} */ x, /** @type {number} */ i) => `${esc(d.alternatives[i])}, mean ${x.mean}, variance ${x.variance}`).join("; ")}.` : "";
      diag.push(`<li><span class="mono">${esc(q.name)}</span>: mean <strong>${q.status.twoSided ? "does not exist" : q.status.mean}</strong>, variance <strong>${q.status.variance}</strong>${q.status.alts ? " in the worst alternative" : ""}. ${esc(q.status.reason)}${byAlt} ${q.status.mean === "unknown" ? tag("observation") : tag("theorem")}
${q.status.variance === "infinite" ? `<br>No CLT interval${mixed ? " for an alternative with an infinite variance" : ""}: a finite sample variance would show a precision that the law does not have.` : ""}
${zero ? `<br>At least one alternative had 0 hits. The interval is the exact zero-hit bound 1 − 0.05^(1/n) ≈ 3/n = ${fmt(3 / (run?.accum.n || 1))}.` : ""}
${cov.length ? `<br>${q.status.variance === "infinite" && !mixed ? "Block coverage of a CLT interval, which is not valid here because the variance is infinite" : "Block coverage of the 95 % interval"}: ${cov.join("; ")}. ${tag("observation")}` : ""}</li>`);
    });
    const rej = m0?.rejection;
    const sampler = En.METHODS[s.method].sampler === "reference" ? "independent" : En.METHODS[s.method].sampler;
    const samp = d.samplers.map((/** @type {any} */ x) => {
      const m = x.methods?.[sampler];
      return `<li><span class="mono">${esc(x.variable)}</span>, ${esc(x.name)}: ${m ? `${esc(m.label)}. <em>${esc(m.exactness)}</em> ${sampling(m.sampling)}${m.acceptance !== null ? `, theoretical acceptance 1/M = ${fmt(m.acceptance)}` : ""}` : "its parameters change between replicates, so the page sets up its sampler for each draw."}</li>`;
    }).join("");
    const fit = d.dataset?.fit;
    const ds = d.dataset ? data.datasets.find((/** @type {any} */ x) => x.id === d.dataset.id) : null;
    $("panel-diagnostics").innerHTML = `<h4>Moments, intervals and coverage</h4><ul>${diag.join("")}</ul>
<h4>Samplers</h4><ul>${samp}</ul>
${designDiagnostics(s, d, m0)}
${rej && rej.proposals ? `<h4>Rejection</h4><p>${count(rej.accepts)} of ${count(rej.proposals)} proposals accepted (${fmt(rej.accepts / rej.proposals)}). ${rej.violations ? `<strong class="bad-text">${count(rej.violations)} proposals had p/(Mq) > 1: the envelope does not cover the target, so the accepted values do not follow the target law.</strong>` : "No envelope violation."} ${tag("observation")}</p>` : ""}
${fit?.kind === "series" ? seriesPanel(ds, fit) : fit ? `<h4>Data: ${esc(ds.title)}</h4><p>${count(fit.n)} observations, mean ${fmt(fit.mean)}. Maximum likelihood estimate ${fmt(fit.estimate)}. ${tag("numerical")}</p>
<table><thead><tr><th scope="col">Value</th><th scope="col">Observed</th><th scope="col">Expected, fitted law</th></tr></thead><tbody>${ds.values.map((/** @type {number} */ v, /** @type {number} */ i) => `<tr><td class="num">${v}${i === ds.values.length - 1 ? " or more" : ""}</td><td class="num">${count(ds.counts[i])}</td><td class="num">${fit.expected[i].toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td></tr>`).join("")}</tbody></table>
<p>Chi-square test against the fitted law: statistic ${fmt(fit.fittedTest.stat)} on ${fit.fittedTest.df} degrees of freedom, p = ${fmt(fit.fittedTest.p)}. ${fit.alternatives.map((/** @type {any} */ x) => `Against ${esc(x.label)}: statistic ${fmt(x.stat)}, p = ${fmt(x.p)}.`).join(" ")} ${tag("numerical")} A p-value measures the fit of this data to one law. It does not prove the law.</p>` : ""}
<h4>Claim tags</h4><p>${tag("theorem")} follows from a theorem under the stated assumptions. ${tag("numerical")} is a computed value with a stated error source. ${tag("observation")} is what this finite run showed.</p>
<p class="note">Group 8 adds the effective sample size and the Markov-chain diagnostics. Here every replicate is independent.</p>`;
    const dec = m0?.decision;
    $("panel-interpretation").innerHTML = `${entry?.kind === "workflow" ? `<h4>Diagnostics and competing models</h4><p>${esc(entry.diagnostics)}</p><h4>Interpretation and rejection conditions</h4><p>${esc(entry.interpretation)}</p>` : entry ? `<h4>What to observe</h4><p>${esc(entry.observe)}</p>` : '<p class="note">A custom model has no reviewed interpretation. Read each result with its claim tag.</p>'}
<h4>This run</h4><p>${run?.accum.blocks ? `${count(run.accum.n)} replicates for each alternative, seed ${s.seed}, ${esc(METHOD[s.method].toLowerCase())}. ${dec && dec.best !== null ? `The best admissible alternative in this run is ${esc(d.alternatives[dec.best])}${dec.separated ? "" : ", but it is not separable from the others yet"}.` : ""}` : "No run yet."} ${tag("observation")}</p>`;
  }

  /**
   * The diagnostics of a variance-reduction design: what the design did in this run, with the gain of each estimate.
   * @param {Record<string, any>} s @param {any} d @param {any} m0
   */
  function designDiagnostics(s, d, m0) {
    const design = En.METHODS[s.method].design;
    if (design === "plain") return "";
    const lines = [];
    if (design === "stratified" && d.design.stratify) lines.push(`<p>${d.design.stratify.K} equal strata of the uniform of <span class="mono">${esc(d.design.stratify.name)}</span>, ${count(Math.round((run?.accum.n ?? 0) / d.design.stratify.K))} replicates in each stratum. The strata have probability 1/K each, so the estimator is unbiased. ${tag("theorem")}</p>`);
    if (design === "antithetic") lines.push(`<p>Each pair uses U and 1 − U for every uniform. The interval uses the ${count((run?.accum.n ?? 0) / 2)} independent pair means. ${tag("theorem")}</p>`);
    if (design === "control" && d.design.control) lines.push(`<p>Control <span class="mono">${esc(d.design.control.name)} = ${esc(d.design.control.expr)}</span>, exact mean ${d.design.control.means.map((/** @type {number | null} */ v, /** @type {number} */ i) => `${fmt(v)}${d.alternatives.length > 1 ? ` (${esc(d.alternatives[i])})` : ""}`).join(", ")} by linearity of expectation. ${tag("theorem")}${s.failure === "control_mean" ? ` <strong class="bad-text">The estimator uses the mean plus 0.1 standard deviation: the assumption failure.</strong>` : ""}</p>`);
    const rows = d.quantities.map((/** @type {any} */ q, /** @type {number} */ k) => {
      const x = m0?.alts[d.alt - 1]?.quantities[k];
      if (!x || !x.gain) return `<li><span class="mono">${esc(q.name)}</span>: ${q.kind === "ratio" ? "a ratio keeps the plain estimator." : "no gain yet."}</li>`;
      const g = x.gain, extra = design === "antithetic" && g.rho !== null ? ` Correlation within the pairs: ${fmt(g.rho)}${g.rho > 0 ? ", positive, so the pairs add variance" : ""}.` : design === "control" ? ` β̂ = ${fmt(g.beta)}, correlation with the control ${fmt(g.rho)}, so at best 1/(1 − ρ²) = ${g.rho !== null && Math.abs(g.rho) < 1 ? fmt(1 / (1 - g.rho * g.rho)) : "–"}.` : "";
      return `<li><span class="mono">${esc(q.name)}</span>: ${gainText(g)}.${extra}</li>`;
    }).join("");
    return `<h4>${esc(METHOD[s.method])}</h4>${lines.join("")}<ul>${rows}</ul><p class="note">The ratio compares the variance of independent sampling with the same number of evaluations of the model. A ratio above 1 means the design needs fewer evaluations for the same precision. The ratios are a finite-run observation. ${tag("observation")}</p>`;
  }

  /* ---------- cards below the panels ---------- */

  /** @param {Record<string, any>} s @param {any} d */
  function drawCards(s, d) {
    const entry = data.models.find((/** @type {any} */ m) => m.id === s.model);
    const lawId = entry?.law ?? (d.samplers?.[0]?.catalogue ?? d.samplers?.[0]?.law) ?? (d.custom ? "custom" : "poisson");
    const key = JSON.stringify([lawId, s.method, s.streams, s.model, s.params, s.failure, customVersion]);
    if ($("law-card").dataset.key === key) return;
    $("law-card").dataset.key = key;
    const l = data.laws.find((/** @type {any} */ x) => x.id === lawId);
    // A law of the catalogue has its code in MCLaws; a constructed law of group 4 names its code parameters through
    // the variable that uses it, because they depend on the family (mixture_poisson has w and lambda).
    const used = d.samplers?.find((/** @type {any} */ x) => x.catalogue === lawId);
    const code = Laws.BY_ID[lawId] ?? (used ? { params: used.code, name: used.name } : l?.type === "constructed" ? { params: l.params.map((/** @type {any} */ p) => ({ name: p.name, text: "see the law line" })), name: l.name } : null);
    if (!l) { $("law-card").innerHTML = customCard(); $("method-card").innerHTML = methodCard(data.methods.find((/** @type {any} */ x) => x.id === s.method)); return; }
    if (!code) { $("law-card").innerHTML = observationCard(l); return; }
    $("law-card").innerHTML = `<h2>The ${esc(l.name)} law</h2><p>${esc(l.convention)}</p><div class="formula" data-tex="${esc(l.pdf ?? l.pmf)}"></div>
<div class="cols"><div><h3>Parameters and support</h3><ul>${l.params.map((/** @type {any} */ p) => `<li><span data-tex="${esc(p.domain)}"></span></li>`).join("")}<li>Support: <span data-tex="${esc(l.support)}"></span></li></ul>
<h3>Moments</h3><dl class="readout"><dt>Mean</dt><dd><span data-tex="${esc(l.moments.mean)}"></span></dd><dt>Variance</dt><dd><span data-tex="${esc(l.moments.variance)}"></span></dd></dl><p>${esc(l.moments.existence)}</p></div>
<div><h3>Transforms</h3><dl class="readout">${Object.entries({ pgf: "PGF", lt: "Laplace transform", mgf: "MGF", cf: "CF" }).filter(([k]) => l.transforms[k]).map(([k, label]) => `<dt>${label}</dt><dd><span data-tex="${esc(l.transforms[k])}"></span></dd>`).join("")}</dl>
<h3>Limiting and special cases</h3><ul>${l.limits.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h3>Linked laws</h3><ul>${l.links.map((/** @type {any} */ x) => `<li><button type="button" class="link" data-open="exp-${esc(x.to)}">${esc(data.laws.find((/** @type {any} */ y) => y.id === x.to).name)}</button>: ${esc(x.relation)}</li>`).join("")}</ul></div></div>
<h3>Parameters of the code${used && !Laws.BY_ID[lawId] ? `: ${esc(used.name)}` : ""}</h3><ul>${code.params.map((/** @type {any} */ p) => `<li><span class="mono">${esc(p.name)}</span>: ${esc(p.text)}</li>`).join("")}</ul>
<h3>Sampling methods</h3>${samplersOfLaw(d, lawId)}
<p><button type="button" data-open="exp-${esc(l.id)}">Open the behaviour experiment</button> Workflows: ${data.models.filter((/** @type {any} */ m) => m.kind === "workflow" && m.law === l.id).map((/** @type {any} */ m) => `<button type="button" class="link" data-open="${esc(m.id)}">${esc(m.title)}</button>`).join(", ")}.</p>`;
    $("method-card").innerHTML = methodCard(data.methods.find((/** @type {any} */ x) => x.id === s.method));
    $("crn-card").innerHTML = `${methodCard(data.methods.find((/** @type {any} */ x) => x.id === "crn"))}<p class="note">This page uses ${s.streams === "common" ? "common random numbers" : "separate streams"} now. <button type="button" class="link" data-streams="${s.streams === "common" ? "separate" : "common"}">Use ${s.streams === "common" ? "separate streams" : "common random numbers"}</button></p>`;
  }

  /**
   * The data panel of a series of annual maxima: the GEV and Gumbel fits with their standard errors, the deviance
   * test of ξ = 0, return levels, and a probability plot of the data against both fits.
   * @param {any} ds @param {any} fit
   */
  function seriesPanel(ds, fit) {
    /** @param {number} v @param {number | null} se */
    const pm = (v, se) => `${fmt(v)}${se === null ? "" : ` ± ${fmt(se)}`}`;
    const g = fit.gev, u = fit.gumbel;
    return `<h4>Data: ${esc(ds.title)}</h4><p>${count(fit.n)} annual maxima, ${ds.years[0]} to ${ds.years[ds.years.length - 1]}: mean ${fmt(fit.mean)} ${esc(ds.unit.split(",")[0])}, largest ${fmt(fit.max)}. Fits by maximum likelihood, ± one standard error from the observed information. ${tag("numerical")}</p>
<div class="table-scroll"><table><thead><tr><th scope="col">Law</th><th scope="col">μ</th><th scope="col">σ</th><th scope="col">ξ</th><th scope="col">Log-likelihood</th></tr></thead><tbody>
<tr><th scope="row">GEV</th><td class="num">${pm(g.mu, g.se[0])}</td><td class="num">${pm(g.sigma, g.se[1])}</td><td class="num">${pm(g.xi, g.se[2])}</td><td class="num">${fmt(g.loglik)}</td></tr>
<tr><th scope="row">Gumbel</th><td class="num">${pm(u.mu, u.se[0])}</td><td class="num">${pm(u.sigma, u.se[1])}</td><td class="num">0</td><td class="num">${fmt(u.loglik)}</td></tr></tbody></table></div>
<p>Deviance test of ξ = 0: ${fmt(fit.deviance)} on 1 degree of freedom, p = ${fmt(fit.p)}. ${tag("numerical")} A large p-value does not prove ξ = 0, and the standard error of ξ shows how far the tail can move.</p>
<table><caption>Return levels: the value that the annual maximum passes with probability 1/T</caption><thead><tr><th scope="col">T [years]</th><th scope="col">GEV fit</th><th scope="col">Gumbel fit</th></tr></thead><tbody>${fit.levels.map((/** @type {any} */ r) => `<tr><td class="num">${r.T}</td><td class="num">${fmt(r.gev)}</td><td class="num">${fmt(r.gumbel)}</td></tr>`).join("")}</tbody></table>
<div class="plot">${P.probability({ points: fit.plot, xlabel: "fitted quantile", ylabel: `observed maximum` })}</div>
<p class="note">Probability plot: each observed maximum against the fitted quantile at its Gringorten plotting position (i − 0.44)/(n + 0.12). Points on the diagonal agree with the fit. The return levels use the fitted parameters as exact values: they omit the uncertainty of the fit, which group 10 adds.</p>`;
  }

  /** The label exact, approximate or unavailable of a sampler (group 4). @param {string} [kind] */
  const sampling = (kind) => (kind ? `<span class="tag sampling-${esc(kind)}">${esc(kind === "exact" ? "exact sampling" : kind === "approximate" ? "approximate sampling" : "sampling unavailable")}</span>` : "");

  /**
   * The checks of the custom laws of the model (group 4): for each law line and each variable and alternative that
   * use it, each condition with its status (checked, failed or unverified) and how the page tested it, the sampling
   * label of each method, the approximation controls, the numerical error sources and the observations. The alerts
   * stay on the card: an MGF need not exist, and numerical checks do not prove a law.
   * @param {Record<string, any>} s @param {any} d
   */
  function drawCustom(s, d) {
    const box = $("custom-card");
    box.hidden = !d.custom;
    if (!d.custom) { box.dataset.key = ""; return; }
    const key = JSON.stringify([s.model, s.params, s.alt, customVersion]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const STATUS = /** @type {Record<string, string>} */ ({ checked: "checked", failed: "failed", unverified: "unverified" });
    const parts = d.custom.map((/** @type {any} */ law) => {
      // The alternative of the plots, else the first use: a law used by several variables shows each one.
      const uses = law.uses.filter((/** @type {any} */ u) => !u.label || u.alt === Math.min(s.alt, d.alternatives?.length ?? s.alt) - 1);
      const shown = uses.length ? uses : law.uses.slice(0, 1);
      const transform = law.kind === "mgf" || law.kind === "cf";
      return `<h3><span class="mono">${esc(law.name)}</span>: custom ${esc(law.kindName)}${law.params.length ? ` with the parameters <span class="mono">${esc(law.params.join(", "))}</span>` : ""}</h3>
${law.note ? `<p class="note">${esc(law.note)}</p>` : ""}${shown.map((/** @type {any} */ u) => {
        const r = u.report, values = Object.entries(u.values ?? {}).map(([k, v]) => `${k} = ${fmt(/** @type {number} */ (v))}`).join(", ");
        const obs = r.observations;
        return `<p class="note">${u.variable ? `For <span class="mono">${esc(u.variable)}</span>${u.via ? ` (the family of ${esc(u.via)})` : ""}${u.label && (d.alternatives?.length ?? 1) > 1 ? ` in ${esc(u.label)}` : ""}${values ? `, with ${esc(values)}` : ""}.` : "No variable uses this law; it has no parameters, so the page checks it as it stands."}</p>
<div class="table-scroll"><table class="checks"><caption>Checks of the input</caption><thead><tr><th scope="col">Condition</th><th scope="col">Status</th><th scope="col">How the page tested it</th></tr></thead><tbody>
${r.checks.map((/** @type {any} */ c) => `<tr><th scope="row">${esc(c.label)}</th><td><span class="status status-${esc(c.status)}">${esc(STATUS[c.status] ?? c.status)}</span></td><td>${esc(c.how)}</td></tr>`).join("")}</tbody></table></div>
${r.errors.length ? `<p class="bad-text">The page does not sample this law: ${esc(r.errors[0])}</p>` : ""}
<dl class="readout">${["independent", "inverse", "rejection"].map((m) => `<dt>${METHOD[m]}</dt><dd>${sampling(r.sampling[m])}</dd>`).join("")}</dl>
${r.controls.length ? `<h4>Approximation controls</h4><ul>${r.controls.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
${r.sources.length ? `<h4>Numerical error sources</h4><ul>${r.sources.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
${r.numeric && !r.numeric.bounded && r.numeric.mean !== null ? `<p>The table of the law has the mean ${fmt(r.numeric.mean)} and the variance ${fmt(r.numeric.variance)}. ${tag("numerical")} The support is not bounded, so these finite numbers do not show that E[X] or Var X exists.</p>` : ""}
${obs && obs.D !== null ? `<p>Observations: ${count(obs.n)} values, Kolmogorov–Smirnov distance D = ${fmt(obs.D)} to the law, asymptotic p = ${fmt(obs.p)}. ${tag("observation")} A p-value measures the fit of these values to this law. It does not prove the law${law.kind === "pmf" || law.kind === "table" ? ", and for a discrete law this p-value is conservative" : ""}.</p>` : ""}`;
      }).join("")}${transform ? `<p class="note">${law.kind === "mgf" ? "This input is an MGF. The page uses it through φ(t) = M(it), which needs M finite on an interval around 0." : "A CF exists for every law. The MGF of this law need not exist."}</p>` : ""}`;
    }).join("");
    box.innerHTML = `<h2 id="custom-head">Custom laws: checks and sampling</h2>
<div class="callout" role="note"><p><strong>Alert.</strong> ${Cu.ALERTS.map((/** @type {string} */ a) => esc(a)).join(" ")}</p></div>
<p class="note">Status: <span class="status status-checked">checked</span> the page tested the condition by the stated method, and it held there. <span class="status status-failed">failed</span> the page found a value where it does not hold; the law is not used in a run. <span class="status status-unverified">unverified</span> the page has no test that decides it here.</p>
${parts}`;
  }

  /** The card of the custom laws when the law card has no catalogue entry: what the inputs are and how the page checks them. */
  function customCard() {
    return `<h2>Custom law inputs</h2><p>A line of the model text defines a law by one of nine inputs: a PDF, a log-PDF, an unnormalised density, a PMF, a finite table, a CDF, a quantile function, an MGF or a characteristic function (CF). The line states its parameters, its support, its constraints and observations, and the variables name the law as any other law. The card "Custom laws: checks and sampling" above shows the checks of this model.</p>
<ul class="syntax"><li><code>law Sev(a) pdf(x) = a*x^(-a - 1) on [1, inf] where a > 1 obs [1.3, 2.2]</code></li><li><code>law Die table(k) = [1, 2, 3] probs [0.2, 0.3, 0.5]</code></li><li><code>law C cf(t) = exp(-abs(t))</code>: in a CF, i is the imaginary unit</li></ul>
<p>Examples: ${data.models.filter((/** @type {any} */ m) => m.kind === "input").map((/** @type {any} */ m) => `<button type="button" class="link" data-open="${esc(m.id)}">${esc(m.title)}</button>`).join(", ")}.</p>`;
  }

  /** The card of one method of the library. @param {any} m */
  function methodCard(m) {
    return `<h2>${esc(m.name)}</h2><p class="label">${esc(m.family)}</p><div class="formula" data-tex="${esc(m.estimator)}"></div><p>${esc(m.estimatorText)}</p>
<div class="cols"><div><h3>Assumptions</h3><ul>${m.assumptions.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul><h3>Settings</h3><ul>${m.settings.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
<div><h3>Suitable example</h3><p>${esc(m.suitable.text)} <button type="button" class="link" data-method-open="${esc(m.id)}:suitable">Open it</button></p>
<h3>Failure example</h3><p>${esc(m.failure.text)} <button type="button" class="link" data-method-open="${esc(m.id)}:failure">Open it</button></p>
<h3>Comparison with ${esc(METHOD[m.comparison.with].toLowerCase())}</h3><p>${esc(m.comparison.text)} <button type="button" class="link" data-method-open="${esc(m.id)}:comparison">Open it</button></p></div></div>`;
  }

  /** The card of an observation mechanism of the catalogue, such as censoring: no sampler of its own. @param {any} l */
  function observationCard(l) {
    return `<h2>${esc(l.name)}</h2><p class="label">Observation mechanism</p><p>${esc(l.convention)}</p><div class="formula" data-tex="${esc(l.pdf)}"></div>
<div class="cols"><div><h3>Inputs and support</h3><ul>${l.params.map((/** @type {any} */ p) => `<li><span data-tex="${esc(p.domain)}"></span></li>`).join("")}<li>Support: <span data-tex="${esc(l.support)}"></span></li></ul>
<h3>Moments of the observed value</h3><dl class="readout"><dt>Mean</dt><dd><span data-tex="${esc(l.moments.mean)}"></span></dd><dt>Variance</dt><dd><span data-tex="${esc(l.moments.variance)}"></span></dd></dl><p>${esc(l.moments.existence)}</p></div>
<div><h3>Transforms</h3><dl class="readout">${Object.entries({ mgf: "MGF", cf: "CF" }).filter(([k]) => l.transforms[k]).map(([k, label]) => `<dt>${label}</dt><dd><span data-tex="${esc(l.transforms[k])}"></span></dd>`).join("")}</dl>
<h3>Limiting and special cases</h3><ul>${l.limits.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h3>Linked laws</h3><ul>${l.links.map((/** @type {any} */ x) => `<li><button type="button" class="link" data-open="exp-${esc(x.to)}">${esc(data.laws.find((/** @type {any} */ y) => y.id === x.to).name)}</button>: ${esc(x.relation)}</li>`).join("")}</ul></div></div>
<h3>In the model text</h3><p>The line <code>censoring: right T by C</code> observes T_obs = min(T, C) and T_event = 1{T ≤ C}; <code>censoring: left T by C</code> observes T_obs = max(T, C) and T_event = 1{T ≥ C}. C is a variable, a parameter or a number.</p>
<p><button type="button" data-open="exp-${esc(l.id)}">Open the behaviour experiment</button> Workflows: ${data.models.filter((/** @type {any} */ m) => m.kind === "workflow" && m.law === l.id).map((/** @type {any} */ m) => `<button type="button" class="link" data-open="${esc(m.id)}">${esc(m.title)}</button>`).join(", ")}.</p>`;
  }

  /** The samplers of a law at the parameters of the first variable of this model that uses it. @param {any} d @param {string} lawId */
  function samplersOfLaw(d, lawId) {
    const v = d.ok ? d.samplers.find((/** @type {any} */ x) => (x.law === lawId || x.catalogue === lawId) && x.methods) : null;
    if (!v) return '<p class="note">This model sets the parameters of this law from other variables, so each draw sets up its own sampler. Open the behaviour experiment to see the samplers.</p>';
    return `<p class="note">At the parameters of <span class="mono">${esc(v.variable)}</span> in this model:</p><dl class="readout">${["independent", "inverse", "rejection"].map((m) => `<dt>${METHOD[m]}</dt><dd>${esc(v.methods[m].label)}. <em>${esc(v.methods[m].exactness)}</em> ${sampling(v.methods[m].sampling)}</dd>`).join("")}</dl>${v.alternate ? `<p class="note">${esc(v.alternate)}</p>` : ""}`;
  }

  /* ---------- draw ---------- */

  /** @param {Record<string, any>} s @param {any} d */
  function render(s, d) {
    app = app ?? K.app;
    const key = runKey(s);
    if (key !== lastKey) {
      lastKey = key;
      run?.handle?.cancel();
      run = newRun(s, d);
      // A loaded run record waits for the state it sets; any later change of the run ends the comparison.
      if (expected && expected.key && expected.key !== key) expected = null;
      if (run && autorun) startRun();
    } else if (run) run.d = d;
    drawNav(s);
    drawHeader(s, d);
    drawParams(s, d);
    drawControls(s, d);
    drawModelViews(s, d);
    drawCustom(s, d);
    drawCards(s, d);
    drawRun(s, d);
  }

  /** The parts that change while a run proceeds. @param {Record<string, any>} s @param {any} d */
  function drawRun(s, d) {
    const sm = summary();
    drawStatus();
    drawPlots(s, d, sm);
    drawResults(s, d, sm);
    drawCompare(s, d, sm);
    drawRight(s, d, sm);
    drawReplay(sm);
    drawSweep(s, d);
  }

  /** The progress bar, the status line and the state of the run buttons. */
  function drawStatus() {
    const r = run;
    const done = r ? r.accum.blocks / r.target : 0;
    $("run-progress").value = done;
    $("run-progress").textContent = `${Math.round(done * 100)} %`;
    const status = !r ? "The model has errors, so the page cannot run it." : r.status === "idle" ? "Ready. Press Run or Step." : `${r.status === "running" ? "Running" : r.status === "done" ? "Complete" : r.status === "paused" ? "Paused: the partial result is not complete" : r.status === "cancelled" ? "Cancelled" : "Stopped by an error"}: ${count(r.accum.n)} of ${count(r.target * En.BLOCK)} replicates, ${fmt((r.elapsed + (r.status === "running" ? performance.now() - r.started : 0)) / 1000)} s, ${esc(r.mode || "not started")}.`;
    $("run-status").textContent = `${status}${r?.message ? ` ${r.message}` : ""}${r?.accum.error ? ` ${r.accum.error}` : ""}`;
    $("run-go").disabled = !r || !!r.handle || r.accum.blocks >= r.target;
    $("run-step").disabled = !r || !!r.handle || r.accum.blocks >= r.target;
    $("run-pause").disabled = !r || !r.handle;
    $("run-pause").setAttribute("aria-pressed", String(r?.status === "paused"));
  }

  /* ---------- sweeps ---------- */

  /** @param {Record<string, any>} s @param {any} d */
  function startSweep(s, d) {
    if (!d.ok || !s.sweep) { $("sweep-status").textContent = "Choose a parameter to sweep."; return; }
    sweepRun?.handle?.cancel();
    const pts = s.sweep_points, xs = Array.from({ length: pts }, (_, i) => s.sweep_from + ((s.sweep_to - s.sweep_from) * i) / (pts - 1));
    const blocks = Math.max(1, Math.min(2 ** s.size, 2 ** 14) / En.BLOCK);
    const { record } = M.modelOf(s, data);
    const sw = { key: JSON.stringify([runKey(s), s.sweep, s.sweep_from, s.sweep_to, pts, s.quantity, s.alt]), x: xs, est: /** @type {(number | null)[]} */ ([]), lo: /** @type {(number | null)[]} */ ([]), hi: /** @type {(number | null)[]} */ ([]), ref: /** @type {(number | null)[]} */ ([]), i: 0, handle: /** @type {any} */ (null), error: "" };
    sweepRun = sw;
    const q = d.quantity - 1, a = d.alt - 1;
    const next = () => {
      if (sweepRun !== sw || sw.i >= xs.length) { schedule(); return; }
      const overrides = { ...M.parseParams(s.params).overrides, [s.sweep]: String(+xs[sw.i].toPrecision(10)) };
      const settings = settingsOf(s, overrides, "none");
      const c = En.prepare(record, settings);
      if (!c.ok) { sw.error = `At ${s.sweep} = ${fmt(xs[sw.i])}: ${c.errors[0]}`; schedule(); return; }
      const st = En.momentStatus(c), refs = En.reference(c, st);
      let acc = En.empty(c);
      sw.handle = getPool().run({ record, settings, opts: { references: refs.map((/** @type {any} */ r) => r.values), window: d.focus.window }, from: 0, to: blocks }, {
        onBlock(/** @type {any} */ stats) { acc = En.merge(acc, stats, c); },
        onEnd(/** @type {string} */ status, /** @type {string} */ message) {
          if (sweepRun !== sw) return;
          sw.handle = null;
          if (status !== "done") { sw.error = message || `The sweep stopped: ${status}.`; schedule(); return; }
          const x = En.summary(c, acc, st, refs)[0].alts[Math.min(a, c.alternatives.length - 1)].quantities[q];
          sw.est.push(x.est); sw.lo.push(x.lo); sw.hi.push(x.hi); sw.ref.push(x.reference);
          sw.i++;
          schedule();
          next();
        },
      });
    };
    next();
    schedule();
  }

  /** @param {Record<string, any>} s @param {any} d */
  function drawSweep(s, d) {
    const sw = sweepRun;
    if (!d.ok) { $("sweep-plot").innerHTML = ""; return; }
    const q = d.quantities[d.quantity - 1];
    $("sweep-plot").innerHTML = P.sweep({ x: sw ? sw.x.slice(0, sw.est.length) : [], est: sw?.est ?? [], lo: sw?.lo ?? [], hi: sw?.hi ?? [], ref: sw?.ref ?? [], xlabel: s.sweep || "parameter", ylabel: q.name });
    $("sweep-status").textContent = !sw ? `Each point runs ${count(Math.min(2 ** s.size, 2 ** 14))} replicates with the same streams.` : sw.error ? sw.error : sw.est.length < sw.x.length ? `Point ${sw.est.length + 1} of ${sw.x.length}.` : `Complete: ${sw.x.length} points.`;
  }

  /* ---------- records and exports ---------- */

  /** @param {string} name @param {string} body @param {string} type */
  function save(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("record-status").textContent = `Saved ${name}.`;
  }

  /** The current model as a versioned model record. */
  function modelRecord() {
    const { record } = M.modelOf(app.state, data);
    return { ...En.complete(record), order: record.order };
  }

  /** The run record: everything a replay needs, with the results of this run. */
  function runRecord() {
    const s = app.state, sm = summary();
    return {
      format: "monte-carlo-workbench/run", version: 1, created: new Date().toISOString(),
      generator: { name: "Philox4x32-10", version: Rng.VERSION, streams: Rng.SCHEME, blockSize: En.BLOCK, stream: En.STREAM },
      seed: s.seed, settings: { model: s.model, params: s.params, method: s.method, compare: s.compare, streams: s.streams, strata: s.strata, stratify: s.stratify, failure: s.failure, size: s.size, n: 2 ** s.size },
      model: modelRecord(), status: run?.status ?? "idle", replicates: run?.accum.n ?? 0,
      results: (sm ?? []).map((/** @type {any} */ m) => ({ method: m.method, alternatives: m.alts.map((/** @type {any} */ a) => ({ label: a.label, quantities: a.quantities.map((/** @type {any} */ q) => ({ name: q.name, kind: q.kind, n: q.n, estimate: q.est, lo: q.lo, hi: q.hi, interval: q.how, reference: q.reference, varianceRatio: q.gain?.ratio ?? null })) })) })),
      environment: { userAgent: navigator.userAgent },
      replay: "The same seed, settings and model give the same integer stream. Floating-point results can differ in the last digits between browsers, because Math.log and Math.exp are not exact.",
    };
  }

  /** Load a run record: its model and settings, then a replay that the page compares with the saved results. @param {any} doc */
  function loadRun(doc) {
    if (!doc || doc.format !== "monte-carlo-workbench/run") throw new Error("The file is not a run record of this page.");
    if (doc.version !== 1) throw new Error(`The run record uses version ${String(doc.version).slice(0, 10)}. This page reads version 1.`);
    const c = En.prepare(doc.model, { seed: doc.seed, method: doc.settings.method, overrides: {}, streams: doc.settings.streams ?? "common", strata: doc.settings.strata ?? M.FIELDS.strata.default, stratify: doc.settings.stratify ?? "" });
    if (!c.ok) throw new Error(`The model in the record has errors: ${c.errors[0]}`);
    M.setCustom(doc.model);
    customVersion++;
    const state = { model: "custom", params: doc.settings.params ?? "", method: doc.settings.method, compare: doc.settings.compare ?? "none", streams: doc.settings.streams ?? "common", strata: doc.settings.strata ?? M.FIELDS.strata.default, stratify: doc.settings.stratify ?? "", failure: doc.settings.failure ?? "none", size: doc.settings.size, seed: doc.seed };
    expected = { key: "", doc };
    app.set(state);
    expected.key = runKey(app.state);
    autosave();
  }

  /** @param {any} sm */
  function drawReplay(sm) {
    if (!expected) { $("replay-status").textContent = ""; return; }
    if (!run || run.status !== "done" || !sm) { $("replay-status").textContent = `Replay of the loaded run record: ${run?.status === "running" ? "the run proceeds" : "complete the run to compare"}.`; return; }
    if (run.accum.n !== expected.doc.replicates) { $("replay-status").textContent = `The record holds ${count(expected.doc.replicates)} replicates and this run ${count(run.accum.n)}, so the page cannot compare them.`; return; }
    let same = 0, close = 0, off = 0;
    sm.forEach((/** @type {any} */ m, /** @type {number} */ i) => m.alts.forEach((/** @type {any} */ a, /** @type {number} */ j) => a.quantities.forEach((/** @type {any} */ q, /** @type {number} */ k) => {
      const e = expected.doc.results[i]?.alternatives[j]?.quantities[k]?.estimate;
      if (e === q.est) same++;
      else if (e !== null && q.est !== null && Math.abs(e - q.est) <= 1e-12 * Math.max(1, Math.abs(e))) close++;
      else off++;
    })));
    $("replay-status").textContent = `Replay: ${same} estimates identical, ${close} equal up to the last digits, ${off} different.${off ? " A difference means that the model, the settings or the page version differ from the record." : ""}`;
  }

  /** The results as CSV, one row for each method, alternative and quantity. */
  function resultsCsv() {
    const sm = summary(), s = app.state;
    /** @param {unknown} v */
    const c = (v) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = [["model", "method", "alternative", "quantity", "kind", "n", "estimate", "lo", "hi", "interval", "reference", "variance_ratio", "streams", "seed"].join(",")];
    for (const m of sm ?? []) for (const a of m.alts) for (const q of a.quantities) rows.push([s.model, m.method, a.label, q.name, q.kind, q.n, q.est, q.lo, q.hi, q.how, q.reference, q.gain?.ratio ?? "", s.streams, s.seed].map(c).join(","));
    return `${rows.join("\n")}\n`;
  }

  /** The convergence trace as CSV. */
  function traceCsv() {
    const d = app.derived, rows = ["n,alternative,quantity,estimate,lo,hi"];
    for (const t of run?.accum.trace ?? []) d.alternatives.forEach((/** @type {string} */ a, /** @type {number} */ i) => d.quantities.forEach((/** @type {any} */ q, /** @type {number} */ k) => {
      const e = t.est[0][i][k], band = (q.status.alts?.[i] ?? q.status).variance !== "infinite";
      rows.push([t.n, `"${a.replace(/"/g, '""')}"`, q.name, e[0] ?? "", band ? e[1] ?? "" : "", band ? e[2] ?? "" : ""].join(","));
    }));
    return `${rows.join("\n")}\n`;
  }

  /** A figure as a standalone SVG with the computed colours of this theme. @param {SVGSVGElement} el */
  function standalone(el) {
    const copy = /** @type {SVGSVGElement} */ (el.cloneNode(true));
    const src = el.querySelectorAll("*"), dst = copy.querySelectorAll("*");
    src.forEach((node, i) => {
      const cs = getComputedStyle(node), out = /** @type {SVGElement} */ (dst[i]);
      for (const p of ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-family", "font-size", "font-weight"]) out.style.setProperty(p, cs.getPropertyValue(p));
    });
    const vb = el.viewBox.baseVal;
    copy.setAttribute("width", String(vb.width * 2));
    copy.setAttribute("height", String(vb.height * 2));
    copy.style.background = getComputedStyle(document.body).backgroundColor;
    return new XMLSerializer().serializeToString(copy);
  }

  /** @param {string} id @param {string} name */
  function saveSvg(id, name) {
    const el = $(id).querySelector("svg");
    if (el) save(`${name}.svg`, standalone(el), "image/svg+xml");
  }
  /** @param {string} id @param {string} name */
  function savePng(id, name) {
    const el = $(id).querySelector("svg");
    if (!el) return;
    const text = standalone(el), img = new Image(), url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) { $("record-status").textContent = "This browser could not draw the PNG. Save the SVG instead."; return; }
        const a = document.createElement("a"), u = URL.createObjectURL(blob);
        a.href = u;
        a.download = `${name}.png`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
        $("record-status").textContent = `Saved ${name}.png.`;
      }, "image/png");
    };
    img.onerror = () => { $("record-status").textContent = "This browser could not draw the PNG. Save the SVG instead."; };
    img.src = url;
  }

  /* ---------- the editor and autosave ---------- */

  function autosave() {
    try {
      localStorage.setItem(AUTOSAVE, JSON.stringify({ text: D.print(M.getCustom()), saved: new Date().toISOString() }));
      $("autosave-status").textContent = "This browser keeps the custom model. A saved file is the dependable record.";
    } catch {
      $("autosave-status").textContent = "This browser keeps no autosave here. Save the model record as a file.";
    }
  }

  function applyEditor() {
    const { record, errors } = D.parse($("editor-text").value, "custom");
    const c = errors.length ? null : En.prepare(record, { seed: 1, method: "independent", overrides: {} });
    const all = [...errors, ...(c && !c.ok ? c.errors : [])];
    $("editor-errors").innerHTML = all.map((e) => `<li>${esc(e)}</li>`).join("");
    if (all.length) { $("editor-status").textContent = `${all.length} ${all.length === 1 ? "problem" : "problems"}: the page keeps the earlier model.`; return; }
    M.setCustom(record);
    customVersion++;
    $("editor-status").textContent = "Applied: the custom model is the current model.";
    autosave();
    app.set({ model: "custom", params: "", sweep: "", stratify: "", quantity: 1, alt: 1 });
  }

  /* ---------- binding ---------- */

  /** @param {string} id */
  function openModel(id) {
    const m = data.models.find((/** @type {any} */ x) => x.id === id);
    if (!m) return;
    app.set({ ...Object.fromEntries(["params", "method", "compare", "streams", "strata", "stratify", "failure", "size", "plot", "yscale", "quantity", "alt", "sweep"].map((k) => [k, M.FIELDS[k].default])), ...M.exampleState(m) });
  }

  /** @param {any} a the kit's app */
  function bind(a) {
    app = a;
    document.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement} */ (e.target).closest?.("button");
      if (!t) return;
      if (t.dataset.open) openModel(t.dataset.open);
      else if (t.dataset.method === "crn") { app.set({ streams: "common" }); $("crn-card").scrollIntoView?.({ block: "start" }); }
      else if (t.dataset.method) app.set({ method: t.dataset.method });
      else if (t.dataset.streams) app.set({ streams: t.dataset.streams });
      else if (t.dataset.theory) app.set({ theory: t.dataset.theory, panel: "theory" });
      else if (t.dataset.unset) {
        const { overrides } = M.parseParams(app.state.params);
        delete overrides[t.dataset.unset];
        app.set({ params: M.formatParams(overrides, M.modelOf(app.state, data).record) });
      } else if (t.dataset.linked) {
        const th = data.theory.find((/** @type {any} */ x) => x.id === t.dataset.linked);
        openModel(th.experiment.model);
        app.set({ ...th.experiment.settings, panel: "diagnostics" });
      } else if (t.dataset.methodOpen) {
        const [id, part] = t.dataset.methodOpen.split(":"), m = data.methods.find((/** @type {any} */ x) => x.id === id);
        const target = m[part];
        openModel(target.model);
        // Common random numbers is the streams setting, not a method of the run.
        app.set({ ...(En.METHODS[id] ? { method: id } : {}), ...(part === "comparison" && En.METHODS[id] ? { compare: target.with } : {}), ...(target.settings ?? {}) });
      }
    });
    $("param-fields").addEventListener("change", (/** @type {Event} */ e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      if (!el.dataset.param) return;
      const { overrides } = M.parseParams(app.state.params);
      const rec = M.modelOf(app.state, data).record, base = rec.parameters.find((/** @type {any} */ p) => p.name === el.dataset.param)?.expr;
      const v = el.value.trim();
      if (!v || v === base) delete overrides[el.dataset.param];
      else overrides[el.dataset.param] = v.replace(/;/g, ",");
      const text = M.formatParams(overrides, rec);
      if (text.length > 200) { $("notice").textContent = "The parameter settings hold at most 200 characters. Use the editor for a larger change."; return; }
      app.set({ params: text });
    });
    // The search filters as the reader types; one history entry holds the whole query.
    $("search").addEventListener("input", () => app.set({ q: $("search").value.slice(0, 200) }, "replace"));
    $("run-go").addEventListener("click", startRun);
    $("run-step").addEventListener("click", stepRun);
    $("run-pause").addEventListener("click", pauseRun);
    $("run-reset").addEventListener("click", resetRun);
    $("autorun").addEventListener("change", () => { autorun = $("autorun").checked; });
    $("alt-select").addEventListener("change", () => app.set({ alt: Number($("alt-select").value) }));
    // The empty value, the focus variable, is a valid choice here, so this select has its own listener.
    $("stratify").addEventListener("change", () => app.set({ stratify: $("stratify").value }));
    $("quantity-select").addEventListener("change", () => app.set({ quantity: Number($("quantity-select").value) }));
    $("sweep-param").addEventListener("change", () => {
      const name = $("sweep-param").value, p = app.derived.parameters?.find((/** @type {any} */ x) => x.name === name);
      let v = 0;
      try { v = Number(g.MCExpr.value(p?.expr ?? "0")); } catch { v = 0; }
      const lo = Number.isFinite(v) ? v / 2 : 0, hi = Number.isFinite(v) ? (v === 0 ? 1 : v * 1.5) : 1;
      app.set({ sweep: name, sweep_from: +Math.min(lo, hi).toPrecision(6), sweep_to: +Math.max(lo, hi).toPrecision(6) });
    });
    $("sweep-run").addEventListener("click", () => startSweep(app.state, app.derived));
    $("editor-apply").addEventListener("click", applyEditor);
    $("editor-show").addEventListener("click", () => { $("editor-text").value = app.derived.text; $("editor-errors").innerHTML = ""; $("editor-status").textContent = "The editor shows the current model."; });
    $("editor-restore").addEventListener("click", () => {
      try {
        const saved = JSON.parse(localStorage.getItem(AUTOSAVE) ?? "null");
        if (saved?.text) { $("editor-text").value = saved.text; $("editor-status").textContent = `Restored the model text saved at ${saved.saved}. Press Apply to use it.`; }
        else $("editor-status").textContent = "No autosaved model text.";
      } catch { $("editor-status").textContent = "This browser keeps no autosave here."; }
    });
    $("save-model").addEventListener("click", () => save(`${app.state.model}-model.json`, `${JSON.stringify(modelRecord(), null, 2)}\n`, "application/json"));
    $("save-run").addEventListener("click", () => save(`${app.state.model}-run.json`, `${JSON.stringify(runRecord(), null, 2)}\n`, "application/json"));
    $("save-csv").addEventListener("click", () => save(`${app.state.model}-results.csv`, resultsCsv(), "text/csv"));
    $("save-trace").addEventListener("click", () => save(`${app.state.model}-trace.csv`, traceCsv(), "text/csv"));
    /** @param {string} input @param {(doc: any) => void} use */
    const loader = (input, use) => $(input).addEventListener("change", async () => {
      const f = $(input).files?.[0];
      if (!f) return;
      try {
        let doc;
        try { doc = JSON.parse(await f.text()); } catch { throw new Error("The file is not JSON."); }
        use(doc);
        $("record-status").textContent = `Loaded ${f.name}.`;
      } catch (e) {
        $("record-status").textContent = `The page did not load ${f.name}: ${e instanceof Error ? e.message : String(e)}`;
      }
      $(input).value = "";
    });
    loader("load-model", (doc) => {
      const c = En.prepare(doc, { seed: 1, method: "independent", overrides: {} });
      if (!c.ok) throw new Error(c.errors.slice(0, 3).join(" "));
      M.setCustom(doc);
      customVersion++;
      autosave();
      app.set({ model: "custom", params: "", sweep: "", stratify: "", quantity: 1, alt: 1 });
    });
    loader("load-run", loadRun);
    for (const [id, name] of [["dist-plot", "distribution"], ["conv-plot", "convergence"], ["compare-plot", "comparison"], ["sweep-plot", "sweep"], ["graph-plot", "dependency-graph"]]) {
      $(`${id}-svg`)?.addEventListener("click", () => saveSvg(id, `${app.state.model}-${name}`));
      $(`${id}-png`)?.addEventListener("click", () => savePng(id, `${app.state.model}-${name}`));
    }
    $("bench").addEventListener("click", benchmark);
    document.addEventListener("keydown", (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) || t.isContentEditable) return;
      if (e.key === " ") { e.preventDefault(); if (run?.handle) pauseRun(); else startRun(); }
      else if (e.key === ".") stepRun();
    });
    try {
      const saved = JSON.parse(localStorage.getItem(AUTOSAVE) ?? "null");
      if (saved?.text) {
        const parsed = D.parse(saved.text, "custom");
        if (!parsed.errors.length) M.setCustom(parsed.record);
        $("autosave-status").textContent = `An autosaved custom model from ${saved.saved} is the custom model of this page.`;
      }
    } catch {
      // No storage here: the page works without autosave.
    }
    $("editor-text").value = D.print(M.getCustom());
  }

  /** Measure the replicates for each second of the current model, on the main thread and with the workers. */
  function benchmark() {
    const s = app.state, { record } = M.modelOf(s, data);
    const settings = { ...settingsOf(s, M.parseParams(s.params).overrides, "none"), failure: "none" };
    const c = En.prepare(record, settings);
    if (!c.ok) return;
    const t0 = performance.now();
    for (let b = 0; b < 4; b++) En.block(c, b, {});
    const main = (4 * En.BLOCK * c.alternatives.length) / ((performance.now() - t0) / 1000);
    const t1 = performance.now();
    getPool().run({ record, settings, opts: {}, from: 0, to: 32 }, {
      onBlock() {},
      onEnd(/** @type {string} */ status) {
        const par = (32 * En.BLOCK * c.alternatives.length) / ((performance.now() - t1) / 1000);
        const full = (2 ** Model.MAX_SIZE * c.alternatives.length) / par;
        $("bench-status").textContent = `${status === "done" ? "" : `The measurement ended early (${status}). `}Main thread: ${count(Math.round(main))} replicates each second. ${esc(getPool().mode)}: ${count(Math.round(par))} replicates each second. A run of the largest size, 2^${Model.MAX_SIZE}, would take about ${fmt(full)} s here. These times are a finite-run observation of this browser.`;
      },
    });
    $("bench-status").textContent = "Measuring…";
  }

  /* ---------- tools and commands ---------- */

  const none = { type: "object", properties: {}, additionalProperties: false };
  /** @param {unknown} v */
  const out = (v) => ({ content: [{ type: "text", text: JSON.stringify(v, null, 2) }] });
  const ro = { readOnlyHint: true };
  const tools = [
    { name: "get_model", description: "Return the current model record, its model text, its parameters with the settings in force, and its moment status and reference values.", inputSchema: none, annotations: ro,
      execute: async () => { const d = app.derived; return out({ record: modelRecord(), text: d.text, parameters: d.parameters, quantities: d.quantities, references: d.references, errors: d.errors }); } },
    { name: "get_run", description: "Return the status of the current run and its estimates, intervals, reference values and decision for each method, alternative and quantity.", inputSchema: none, annotations: ro,
      execute: async () => out(runRecord()) },
    { name: "list_catalogue", description: "List the laws, the behaviour experiments, the workflows, the methods and the theory panels of this page, with ids and titles. Optional query filters the examples by decision, phenomenon, law or method.", inputSchema: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false }, annotations: ro,
      execute: async (/** @type {any} */ input) => out({ laws: data.laws.map((/** @type {any} */ l) => ({ id: l.id, name: l.name })), models: matches(String(input?.query ?? "")).map((/** @type {any} */ m) => ({ id: m.id, kind: m.kind, law: m.law, title: m.title, domain: m.domain ?? null })), methods: data.methods.map((/** @type {any} */ m) => ({ id: m.id, name: m.name })), theory: data.theory.map((/** @type {any} */ t) => ({ id: t.id, title: t.title })), groups: data.groups }) },
    { name: "get_law", description: "Return the catalogue entry of one law by id: its parameter convention, support, special and limit cases, moments, transforms and links.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, annotations: ro,
      execute: async (/** @type {any} */ input) => out(data.laws.find((/** @type {any} */ l) => l.id === input?.id) ?? { error: `No law has the id "${String(input?.id).slice(0, 40)}".` }) },
  ];
  const commands = [
    { label: "Run the experiment", run: startRun },
    { label: "Step one block", run: stepRun },
    { label: "Pause the run", run: pauseRun },
    { label: "Reset the run", run: resetRun },
    { label: "Save run record", run: () => save(`${app.state.model}-run.json`, `${JSON.stringify(runRecord(), null, 2)}\n`, "application/json") },
    { label: "Save model record", run: () => save(`${app.state.model}-model.json`, `${JSON.stringify(modelRecord(), null, 2)}\n`, "application/json") },
    { label: "Save results CSV", run: () => save(`${app.state.model}-results.csv`, resultsCsv(), "text/csv") },
    ...data.models.map((/** @type {any} */ m) => ({ label: `Open ${m.title}`, run: () => openModel(m.id) })),
    ...data.theory.map((/** @type {any} */ t) => ({ label: `Theory: ${t.title}`, run: () => app.set({ theory: t.id, panel: "theory" }) })),
  ];

  app = K.start({
    slug: M.SLUG, title: "Monte Carlo Probability Workbench", summary: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    schemaVersion: M.SCHEMA_VERSION, fields: M.FIELDS,
    derive: (/** @type {any} */ s) => M.derive(s, data),
    render,
    report: (/** @type {any} */ s, /** @type {any} */ d) => Rep.report(s, d, data, run && run.accum.blocks ? { status: run.status, n: run.accum.n, summary: summary() } : null),
    bind, tools, commands,
  });
  g.Workbench = { get run() { return run; }, summary, runRecord, modelRecord, resultsCsv, traceCsv, startRun, stepRun, pauseRun, resetRun, get pool() { return pool; } };
})();
