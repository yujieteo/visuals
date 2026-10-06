/* Monte Carlo Probability Workbench: the views of group 5, dependence and processes. The card of a copula, a process
 * or the conditional models; the sample paths of a process with the ensemble bands of the run and the first
 * passages; the scatter of a copula; the conditions of each process in the assumptions panel; and the multilevel
 * Monte Carlo panel, which runs the levels of a ready model through the page's worker pool, one range of blocks at a
 * time, and keeps the discretisation bias apart from the Monte Carlo error. view.js calls these functions with its
 * helpers; this file holds no state of the page except the multilevel run.
 */
(function () {
  "use strict";
  const g = /** @type {any} */ (globalThis);
  const En = g.MCEngine, Pr = g.MCProcesses, P = g.MCPlots, Ml = g.MCMultilevel;

  /** @param {unknown} s */
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  /** @param {number | null | undefined} v */
  const fmt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : P.fmt(v));
  /** @param {number} n */
  const count = (n) => n.toLocaleString("en-US");
  const TAG = /** @type {Record<string, string>} */ ({ theorem: "Theorem", numerical: "Numerical approximation", observation: "Finite-run observation" });
  /** @param {"theorem" | "numerical" | "observation"} kind */
  const tag = (kind) => `<span class="tag tag-${kind}">${TAG[kind]}</span>`;
  /** The badge of each condition: its words and whether it is good news, a warning or not applicable. */
  const BADGE = /** @type {Record<string, Record<string, [string, string]>>} */ ({
    stationarity: { true: ["stationary", "ok"], false: ["not stationary", "na"], null: ["not applicable", "na"] },
    stability: { true: ["stable", "ok"], false: ["not stable", "warn"], null: ["no stable level", "na"] },
    explosion: { true: ["explodes", "warn"], false: ["no explosion", "ok"], null: ["not applicable", "na"] },
    boundary: { true: ["boundary kept", "ok"], false: ["boundary broken", "warn"], null: ["no boundary", "na"] },
    discretisation: { true: ["stated", "ok"], false: ["biased", "warn"], null: ["not applicable", "na"] },
  });
  const TYPES = ["copula", "process", "conditional"];

  /** True for a library entry of group 5. @param {any} l */
  const owns = (l) => !!l && TYPES.includes(l.type);

  /** The conditions of a process as a list, with the live values at the current parameters. @param {any} x */
  function conditionList(x) {
    return `<ul class="conditions">${x.conditions.map((/** @type {any} */ c) => { const [word, cls] = BADGE[c.kind][String(c.holds)]; return `<li><strong>${esc(c.kind[0].toUpperCase() + c.kind.slice(1))}</strong> <span class="status status-${cls}">${esc(word)}</span>: ${esc(c.text)}</li>`; }).join("")}</ul>`;
  }

  /**
   * The card of a copula, a process or the conditional models: convention, formula, parameters, support, moments,
   * the dependence or the five conditions, the sampling methods with the samplers at the model's parameters, the
   * limiting cases, the links, and the experiment and workflows that use it.
   * @param {any} l @param {any} d @param {any} data @param {Record<string, string>} methods
   */
  function card(l, d, data, methods) {
    const live = l.type === "process" ? d.ok && d.dependence?.processes.find((/** @type {any} */ x) => x.law === l.id) : null;
    const cop = l.type === "copula" ? d.ok && d.dependence?.copulas.find((/** @type {any} */ x) => x.law === l.id) : null;
    const used = d.ok ? d.samplers?.find((/** @type {any} */ x) => x.law === l.id && x.methods) : null;
    const kind = l.type === "copula" ? "copula" : l.type === "process" ? "process" : "dependence structure";
    return `<h2>${esc(l.name)}</h2><p class="label">Group 5 · ${kind}</p><p>${esc(l.convention)}</p><div class="formula" data-tex="${esc(l.formula)}"></div>
<div class="cols"><div><h3>Parameters and support</h3><ul>${l.params.map((/** @type {any} */ p) => `<li><span class="mono">${esc(p.name)}</span>: <span data-tex="${esc(p.domain)}"></span></li>`).join("")}<li>Support: <span data-tex="${esc(l.support)}"></span></li></ul>
<h3>Moments</h3><dl class="readout"><dt>Mean</dt><dd><span data-tex="${esc(l.moments.mean)}"></span></dd><dt>Variance</dt><dd><span data-tex="${esc(l.moments.variance)}"></span></dd></dl><p>${esc(l.moments.existence)}</p>
${l.transforms ? `<h3>Transforms</h3><dl class="readout">${Object.entries(l.transforms).map(([k, v]) => `<dt>${esc(k.toUpperCase())}</dt><dd><span data-tex="${esc(v)}"></span></dd>`).join("")}</dl>` : ""}</div>
<div>${l.dependence ? `<h3>Dependence</h3><ul class="conditions"><li><strong>Kendall's tau</strong>: ${esc(l.dependence.tau)}</li><li><strong>Tail dependence</strong>: ${esc(l.dependence.tails)}</li><li><strong>Domain</strong>: ${esc(l.dependence.domain)}</li></ul>` : ""}
${cop ? `<p>At the parameters of <span class="mono">${esc(cop.name)}</span>: ${cop.at.tau.map((/** @type {any} */ t) => `τ(${t.i}, ${t.j}) = ${fmt(t.tau)}`).join(", ")}; ${cop.at.tails.map((/** @type {any} */ t) => `λ_L = ${fmt(t.lower)}, λ_U = ${fmt(t.upper)} for (${t.i}, ${t.j})`).join("; ")}. ${tag("theorem")}</p>` : ""}
${l.conditions ? `<h3>Conditions</h3><ul class="conditions">${Object.entries(l.conditions).map(([k, v]) => `<li><strong>${esc(k[0].toUpperCase() + k.slice(1))}</strong>: ${esc(v)}</li>`).join("")}</ul>` : ""}
${live ? `<h3>At the parameters of <span class="mono">${esc(live.name)}</span></h3>${conditionList(live)}` : ""}
<h3>Limiting and special cases</h3><ul>${l.limits.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h3>Linked entries</h3><ul>${l.links.map((/** @type {any} */ x) => `<li><button type="button" class="link" data-open="exp-${esc(x.to)}">${esc(data.laws.find((/** @type {any} */ y) => y.id === x.to)?.name ?? x.to)}</button>: ${esc(x.relation)}</li>`).join("")}</ul></div></div>
<h3>Sampling methods</h3><ul>${l.methods.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>
${used ? `<p class="note">At the parameters of <span class="mono">${esc(used.variable)}</span> in this model:</p><dl class="readout">${Object.keys(methods).filter((m) => used.methods[m]).map((m) => `<dt>${esc(methods[m])}</dt><dd>${esc(used.methods[m].label)}. <em>${esc(used.methods[m].exactness)}</em></dd>`).join("")}</dl>` : ""}
<p><button type="button" data-open="exp-${esc(l.id)}">Open the behaviour experiment</button> Workflows: ${data.models.filter((/** @type {any} */ m) => m.kind === "workflow" && m.law === l.id).map((/** @type {any} */ m) => `<button type="button" class="link" data-open="${esc(m.id)}">${esc(m.title)}</button>`).join(", ")}.</p>`;
  }

  /** The assumptions-panel section of group 5: each process with its conditions, each copula with tau and tails. @param {any} d */
  function assumptions(d) {
    const dep = d.dependence;
    if (!dep || (!dep.processes.length && !dep.copulas.length && !dep.given.length)) return "";
    return `${dep.processes.map((/** @type {any} */ x) => `<h4>Process <span class="mono">${esc(x.name)}</span>: ${esc(x.title)}</h4>${conditionList(x)}`).join("")}
${dep.copulas.map((/** @type {any} */ x) => `<h4>Copula <span class="mono">${esc(x.name)}</span>: ${esc(x.title)}, d = ${x.d}</h4><p>${x.at.tau.map((/** @type {any} */ t) => `Kendall's τ(${t.i}, ${t.j}) = ${fmt(t.tau)}`).join("; ")}. ${x.at.tails.map((/** @type {any} */ t) => `Tail dependence of (${t.i}, ${t.j}): λ_L = ${fmt(t.lower)}, λ_U = ${fmt(t.upper)}`).join("; ")}. ${tag("theorem")} The margins are uniform, so the copula alone holds the dependence (Sklar's theorem).</p>`).join("")}
${dep.given.length ? `<p>${dep.given.map((/** @type {string} */ n) => `<span class="mono">${esc(n)}</span>`).join(", ")} ${dep.given.length === 1 ? "takes" : "take"} the inverse transform of a given uniform u: the law of each is its own law, and the uniform carries the dependence.</p>` : ""}`;
  }

  /** The first passage level of a process variable that the model's quantities test, or null. @param {any} d @param {string} name */
  const levelOf = (d, name) => d.dependence?.processes.find((/** @type {any} */ x) => x.name === name)?.level ?? null;

  /** @type {{ key: string, paths: number[][], points: [number, number][] }} */
  let memo = { key: "", paths: [], points: [] };

  /**
   * The sample paths figure: the paths of replicates 1 to 12 of the run's first alternative in the plots, the
   * ensemble bands of the run, the reference mean and the first passages. Hidden when the model has no process.
   * @param {any} s @param {any} d @param {any} sm @param {any} run @param {(id: string) => any} $
   */
  function drawPaths(s, d, sm, run, $) {
    const box = $("fig-paths"), proc = d.ok ? d.dependence?.processes[0] : null;
    box.hidden = !proc || !run;
    if (box.hidden) return;
    const a = d.alt - 1, key = JSON.stringify([run.key, a, proc.name]);
    if (memo.key !== key) {
      let paths = [];
      try { paths = En.sample(run.c, a, 0, 12).map((/** @type {any[]} */ env) => env[run.c.slots.get(proc.name)]); } catch { paths = []; }
      memo = { key, paths, points: memo.points };
    }
    const spec = proc.band, raw = sm?.[0]?.bands?.[a];
    const band = spec && raw && raw.n ? { ...Pr.bandRead(raw, spec, [0.05, 0.25, 0.5, 0.75, 0.95]), t: spec.idx.map((/** @type {number} */ k) => proc.times[k]) } : null;
    const lv = levelOf(d, proc.name), step = ["poissonprocess", "compoundprocess", "markovchain", "branching", "hawkes"].includes(proc.law);
    $("paths-plot").innerHTML = P.paths({ t: proc.times, paths: memo.paths, band, refMean: proc.mean[a] ?? null, level: lv ? lv.value : null, up: lv ? lv.up : true, step,
      xlabel: proc.law === "markovchain" ? "step n" : proc.law === "branching" ? "generation n" : "time t", ylabel: proc.name });
    const hit = lv ? memo.paths.filter((p) => p.some((/** @type {number} */ x) => (lv.up ? x >= lv.value : x <= lv.value))).length : 0;
    const outside = band ? Math.max(...band.outside) : 0;
    $("paths-note").innerHTML = `${esc(proc.title)} <span class="mono">${esc(proc.name)}</span>${d.alternatives.length > 1 ? `, ${esc(d.alternatives[a])}` : ""}. The grey lines are replicates 1 to ${memo.paths.length} of this run, with the same streams and the plain design. ${band ? `The bands hold the pointwise 5 %, 25 %, 75 % and 95 % quantiles of ${count(band.n)} paths, read from counts in ${spec.bins} bins at ${spec.idx.length} grid times${outside > 0.001 ? `; up to ${fmt(100 * outside)} % of the values fall outside the window, so an outer band can be missing` : ""}. ${tag("observation")}` : "Run the experiment to draw the bands."} The dashed line is the mean of the law at each grid time. ${tag("theorem")} ${lv ? `${hit} of ${memo.paths.length} drawn paths reach the level ${fmt(lv.value)} at a grid time; a dot marks the first one. A path can cross the level between two grid times and come back, which the grid does not see.` : ""}`;
  }

  /** Kendall's tau of points, by counting concordant pairs. @param {[number, number][]} pts */
  function kendall(pts) {
    let s = 0, n = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { s += Math.sign((pts[i][0] - pts[j][0]) * (pts[i][1] - pts[j][1])); n++; }
    return n ? s / n : 0;
  }

  /**
   * The scatter of components 1 and 2 of the model's first copula variable for replicates 1 to 2,000, with their
   * Kendall's tau beside the copula's own. Hidden when the model has no copula.
   * @param {any} s @param {any} d @param {any} run @param {(id: string) => any} $
   */
  function drawScatter(s, d, run, $) {
    const box = $("fig-scatter"), cop = d.ok ? d.dependence?.copulas[0] : null;
    box.hidden = !cop || !run;
    if (box.hidden) return;
    const a = d.alt - 1, key = JSON.stringify(["scatter", run.key, a, cop.name]);
    if ($("scatter-plot").dataset.key === key) return;
    $("scatter-plot").dataset.key = key;
    /** @type {[number, number][]} */
    let pts = [];
    try { pts = En.sample(run.c, a, 0, 2000).map((/** @type {any[]} */ env) => { const u = env[run.c.slots.get(cop.name)]; return /** @type {[number, number]} */ ([u[0], u[1]]); }); } catch { pts = []; }
    $("scatter-plot").innerHTML = P.scatter({ points: pts, q: 0.9, xlabel: `${cop.name}[1]`, ylabel: `${cop.name}[2]` });
    const t = cop.at.tau[0], tl = cop.at.tails[0];
    $("scatter-note").innerHTML = `${esc(cop.title)}, components 1 and 2, replicates 1 to ${count(pts.length)}. Kendall's tau of these points: ${fmt(kendall(pts))} ${tag("observation")}; of the copula: ${fmt(t.tau)} ${tag("theorem")}. Tail dependence of the copula: λ_L = ${fmt(tl.lower)}, λ_U = ${fmt(tl.upper)}. A coefficient above 0 means that joint extremes stay likely at every level; the tail boxes show the levels 0.9 and 0.1.`;
  }

  /* ---------- multilevel Monte Carlo ---------- */

  /** The multilevel run of the page. @type {any} */
  let ml = null;

  /** The state that a multilevel run belongs to. @param {any} s @param {any} d */
  const runKey = (s, d) => JSON.stringify([s.model, d.text, s.params, s.method, s.seed, d.alt, d.quantity, s.mlmc_eps]);

  /** Cancel and drop the multilevel run when the state is no longer the state of the run. @param {any} s @param {any} d */
  function sync(s, d) {
    if (!ml || ml.key === runKey(s, d)) return;
    stopMultilevel();
    ml = null;
  }

  /** The last multilevel result, for the tool and the report. */
  const result = () => (ml ? { status: ml.status, message: ml.message, eps: ml.st.eps, seed: ml.seed, method: ml.method, quantity: ml.quantity, summary: Ml.summary(ml.st), reference: ml.reference, gridFree: ml.gridFree } : null);

  /**
   * The reference of quantity k on the level-0 grid, and whether it is the same with twice the steps.
   * @param {any} record @param {any} settings @param {number} n0 @param {number} alt @param {number} k
   */
  function gridReference(record, settings, n0, alt, k) {
    const at = (/** @type {number} */ n) => {
      const c = En.prepare(Ml.levelRecord(record, 0, n, alt), settings);
      return c.ok ? En.reference(c, En.momentStatus(c))[0]?.values[k] ?? null : null;
    };
    const r0 = at(n0), r1 = Number.isFinite(r0) ? at(2 * n0) : null;
    if (!Number.isFinite(r0)) return { reference: null, gridFree: false };
    return { reference: r0, gridFree: Number.isFinite(r1) && Math.abs(r1 - r0) <= 1e-12 * Math.max(Math.abs(r0), Math.abs(r1)) };
  }

  /**
   * Start a multilevel run of the current model for the quantity in the plots: levels 0, 1 and 2 with 2 blocks
   * each, then the sample sizes for the target ε, until the bias test passes or level 8.
   * @param {any} ctx { state, derived, record, overrides, pool, redraw }
   */
  function startMultilevel(ctx) {
    stopMultilevel();
    const s = ctx.state, d = ctx.derived, k = d.quantity - 1;
    const steps = Number(d.parameters.find((/** @type {any} */ p) => p.name === "steps")?.expr ?? 4);
    const overrides = { ...ctx.overrides };
    delete overrides.steps;
    delete overrides.coarsen;
    const n0 = Number.isInteger(steps) && steps >= 1 ? steps : 4;
    const st = Ml.start({ eps: s.mlmc_eps, maxLevel: Math.min(8, Math.floor(Math.log2(Pr.MAX_STEPS / n0))), initial: 2, n0 });
    const { reference, gridFree } = gridReference(ctx.record, { seed: s.seed, method: s.method, compare: "none", failure: "none", overrides, streams: "common" }, n0, d.alt - 1, k);
    const run = { key: runKey(s, d), st, status: "running", message: "", seed: s.seed, method: s.method, quantity: d.quantities[k].name, reference, gridFree, n0, accum: /** @type {any[]} */ ([]), handle: /** @type {any} */ (null), redraw: ctx.redraw };
    ml = run;
    const next = () => {
      if (ml !== run) return;
      const job = Ml.nextJob(st);
      if (!job) { run.status = st.converged ? "done" : "stopped"; run.message = st.message; run.redraw(); return; }
      const record = Ml.levelRecord(ctx.record, job.level, n0, d.alt - 1);
      const settings = { seed: Ml.levelSeed(s.seed, job.level), method: s.method, compare: "none", failure: "none", overrides, streams: "common" };
      const c = En.prepare(record, settings);
      if (!c.ok) { run.status = "error"; run.message = c.errors[0]; run.redraw(); return; }
      let acc = run.accum[job.level] ?? En.empty(c);
      run.handle = ctx.pool.run({ record, settings, opts: {}, from: job.from, to: job.to }, {
        onBlock(/** @type {any} */ stats) { acc = En.merge(acc, stats, c); },
        onEnd(/** @type {string} */ status, /** @type {string} */ message) {
          if (ml !== run || run.status === "cancelled") return;
          run.handle = null;
          if (status !== "done") { run.status = status; run.message = message || `The level ${job.level} run stopped: ${status}.`; run.redraw(); return; }
          if (acc.error) { run.status = "error"; run.message = acc.error; run.redraw(); return; }
          run.accum[job.level] = acc;
          Ml.afterJob(st, job.level, job.to, Ml.fromAccum(acc, job.level, k));
          run.redraw();
          next();
        },
      });
      run.redraw();
    };
    next();
  }

  function stopMultilevel() {
    // The status first: the pool reports the cancel to the run at once.
    if (ml && ml.status === "running") { ml.status = "cancelled"; ml.message = "Cancelled: the result covers the levels that finished, and it is not complete."; }
    if (ml?.handle) ml.handle.cancel();
  }

  /**
   * The multilevel panel: shown for a model with the parameters steps and coarsen. The level table, the level plot,
   * and the estimate with its Monte Carlo interval and, apart from it, the bias estimate of the finest level.
   * @param {any} s @param {any} d @param {(id: string) => any} $ @param {Record<string, string>} methods
   */
  function drawMultilevel(s, d, $, methods) {
    sync(s, d);
    const box = $("wb-mlmc");
    box.hidden = !d.ok || !d.dependence?.mlmc;
    if (box.hidden) return;
    const r = result(), sum = r?.summary;
    $("mlmc-stop").disabled = !ml || ml.status !== "running";
    $("mlmc-status").textContent = !ml ? `Press Run to estimate ${d.quantities[d.quantity - 1].name} on levels of the grid, with the method ${esc((methods[s.method] ?? s.method).toLowerCase())}, to the target root mean square error ε = ${fmt(s.mlmc_eps)}.`
      : `${ml.status === "running" ? "Running" : ml.status === "done" ? "Complete: the bias test passed" : ml.status === "stopped" ? "Stopped" : ml.status === "cancelled" ? "Cancelled" : "Error"}. ${ml.message}`;
    $("mlmc-plot").innerHTML = P.levels({ levels: sum?.levels ?? [] });
    if (!sum) { $("mlmc-table").innerHTML = ""; $("mlmc-result").innerHTML = ""; return; }
    $("mlmc-table").innerHTML = `<table><caption>Levels of the run: level l has a fine grid of n0 · 2^l steps and, above level 0, the coupled coarse grid with half as many. Seed of level l: the run seed plus (l + 1) · 2654435769.</caption><thead><tr><th scope="col">Level</th><th scope="col">Steps</th><th scope="col">Samples N_l</th><th scope="col">Mean of Y_l</th><th scope="col">Variance V_l</th><th scope="col">Cost of one sample</th></tr></thead><tbody>${sum.levels.map((/** @type {any} */ x) => `<tr><th scope="row">${x.l}</th><td class="num">${count(x.steps)}</td><td class="num">${count(x.n)}</td><td class="num">${fmt(x.mean)}</td><td class="num">${fmt(x.var)}</td><td class="num">${count(x.cost)}</td></tr>`).join("")}</tbody></table>`;
    const ref = r.reference;
    $("mlmc-result").innerHTML = `<dl class="mlmc-result"><dt>Estimate</dt><dd>${fmt(sum.est)} ${tag("observation")}</dd>
<dt>Monte Carlo error</dt><dd>standard error ${fmt(sum.se)}; 95 % interval ${fmt(sum.lo)} to ${fmt(sum.hi)}, from the independent levels (CLT). ${tag("numerical")}</dd>
<dt>Discretisation bias</dt><dd>${sum.bias === null ? "no estimate yet" : `about ${fmt(sum.bias)}: max(|Y_(L−1)|/2^α, |Y_L|)/(2^α − 1) with α = ${fmt(sum.alpha)} from the levels. It is an estimate from the finest levels, not a bound, and the interval above does not include it.`} ${tag("numerical")}</dd>
<dt>Rates</dt><dd>α = ${fmt(sum.alpha)} (decay of |E Y_l|), β = ${fmt(sum.beta)} (decay of V_l). Giles's theorem gives a cost of order ε^−2 when β > 1, and ε^−2 (log ε)^2 when β = 1.</dd>
<dt>Cost</dt><dd>${count(Math.round(sum.work))} path steps. Plain Monte Carlo on level ${sum.L} with the same Monte Carlo variance: about ${sum.plainWork === null ? "–" : count(Math.round(sum.plainWork))} steps${sum.ratio ? `, ${fmt(sum.ratio)} times as many` : ""}. ${tag("observation")}</dd>
<dt>Reference</dt><dd>${ref === null ? "none for this quantity" : r.gridFree ? `${fmt(ref)}, the value of the exact process, independent of the grid; the estimate differs by ${fmt(sum.est - ref)}, which is the sum of the remaining bias and the Monte Carlo error` : `${fmt(ref)}, the reference of the grid with steps = ${count(ml.n0)}. It is different from the finest grid of the run, so the difference from the estimate is not the bias and the Monte Carlo error`}</dd></dl>`;
  }

  g.MCDepView = { owns, card, assumptions, drawPaths, drawScatter, drawMultilevel, startMultilevel, stopMultilevel, sync, result, kendall };
})();
