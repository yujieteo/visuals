/* Monte Carlo Probability Workbench: the statistical-physics lab of group 9. The left panel lists its examples, and the
 * centre card holds the lab: the example with its stated dynamics, the settings, Step, Run, Pause and Reset, the
 * results with their intervals, references and claim tags, the linked figures (a 3D view of the energy landscape on a
 * canvas, the sandpile grids at a block size, and SVG charts), the diagnostics, the assumptions and the records. A run
 * is a sequence of blocks on a worker pool (src/physics.js through src/physics-worker.js), merged in block order, so
 * 1 and 4 workers give the same result. The state is the kit's fields ph_* and the seed; the run lives beside it.
 * view.js calls these functions.
 */
(function () {
  "use strict";
  const g = /** @type {any} */ (globalThis);
  const Ph = g.MCPhysics, PP = g.MCPhysicsPlots, P = g.MCPlots, Pool = g.MCPool, Rng = g.MCRng;
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);
  /** @param {unknown} s */
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  /** @param {number | null | undefined} v */
  const fmt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : P.fmt(v));
  /** @param {number} n */
  const count = (n) => Math.round(n).toLocaleString("en-US");
  const TAG = /** @type {Record<string, string>} */ ({ theorem: "Theorem", numerical: "Numerical approximation", observation: "Finite-run observation" });
  /** @param {string} kind */
  const tag = (kind) => `<span class="tag tag-${kind}">${TAG[kind]}</span>`;
  const FAMILY = /** @type {Record<string, string>} */ ({ landscape: "Energy landscapes", sandpile: "Sandpiles" });
  const PLOTS = /** @type {Record<string, string>} */ ({ land: "3D landscape", arrhenius: "Arrhenius plot", route: "Barrier", exits: "Exit-time law", schedules: "Schedules", energy: "Energy", success: "Success",
    basins: "Well probabilities", swaps: "Swap rates", ladder: "Replica paths", grid: "Lattice", sizes: "Size laws", heights: "Heights", collapse: "Collapse", moments: "Moments", mean: "Mean size", blockvar: "Block variance", boxes: "Box counts" });
  const FIGS = /** @type {Record<string, string[]>} */ ({ "metastable-exit": ["land", "arrhenius", "route", "exits"], "annealing-schedules": ["land", "success", "schedules", "energy"], "tempering-wells": ["land", "basins", "swaps", "ladder"],
    "sandpile-btw": ["sizes", "grid", "heights"], "finite-size": ["collapse", "sizes", "moments", "mean"], "coarse-graining": ["grid", "blockvar", "boxes"] });
  const SCHED = /** @type {Record<string, string>} */ ({ log: "Logarithmic", geometric: "Geometric", linear: "Linear", quench: "Quench" });
  const LIMIT_MS = 180000;

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

  /* ---------- state and run ---------- */

  /** @param {Record<string, any>} s */
  const exampleOf = (s) => data.physics.examples.find((/** @type {any} */ x) => x.id === s.ph_example);
  /** @param {Record<string, any>} s */
  const keyOf = (s) => JSON.stringify([s.ph_example, Ph.jobOf(s), s.seed]);

  function source() {
    return ["src-rng", "src-special", "src-physics", "src-physics-worker"].map((id) => $(id).textContent).join("\n;\n");
  }
  function getPool() {
    if (!pool) pool = Pool.createPool({ source: source(), size: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)), engine: Ph });
    return pool;
  }

  /** A new, empty run for the state. @param {Record<string, any>} s */
  function newRun(s) {
    const job = Ph.jobOf(s), c = Ph.prepare(job, { seed: s.seed });
    return { key: keyOf(s), job, c, acc: c.ok ? Ph.empty(c) : null, status: c.ok ? "idle" : "error", message: "", elapsed: 0, started: 0, handle: null, mode: "" };
  }

  /** Run up to `to` blocks. @param {number} to */
  function go(to) {
    const r = run;
    if (!r || !r.c.ok || r.handle || r.acc.blocks >= to) return;
    r.status = "running";
    r.started = performance.now();
    r.message = "";
    const p = getPool();
    r.handle = p.run({ record: r.job, settings: { seed: r.c.seed }, opts: {}, from: r.acc.blocks, to }, {
      onBlock(/** @type {any} */ blk) {
        if (run !== r) return;
        r.acc = Ph.merge(r.acc, blk);
        if (r.elapsed + performance.now() - r.started > LIMIT_MS) { r.message = `The run reached the time limit of ${LIMIT_MS / 1000} s and paused.`; r.handle?.pause(); }
        schedule();
      },
      onEnd(/** @type {string} */ status, /** @type {string} */ message) {
        if (run !== r) return;
        r.elapsed += performance.now() - r.started;
        r.handle = null;
        r.mode = p.mode;
        r.status = status === "done" ? (r.acc.blocks >= r.c.blocks && !r.acc.error ? "done" : r.acc.error ? "error" : "paused") : status;
        if (message) r.message = message;
        schedule();
      },
    });
    r.mode = p.mode;
    schedule();
  }
  const start = () => { if (run?.c.ok) go(run.c.blocks); };
  const step = () => { if (run?.c.ok && !run.handle) go(Math.min(run.c.blocks, run.acc.blocks + 1)); };
  const pause = () => run?.handle?.pause();
  function reset() {
    run?.handle?.cancel();
    if (app) { run = newRun(app.state); lastKey = run.key; }
    schedule();
  }
  /** Space runs or pauses; "." steps. @param {string} k */
  function key(k) {
    if (k === " ") { if (run?.handle) pause(); else start(); }
    else if (k === ".") step();
  }

  /** Draw the status now and the rest at the next frame. */
  function schedule() {
    drawStatus();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (app && app.state.nav === "physics") drawRun(app.state); });
  }

  /** The summary of the current run, or null before its first block. */
  function summary() {
    return run?.c.ok && run.acc.blocks ? Ph.summary(run.c, run.acc) : null;
  }

  /* ---------- the left panel ---------- */

  /** @param {string} q */
  function matching(q) {
    const words = String(q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return data.physics.examples.filter((/** @type {any} */ x) => {
      const hay = [x.title, x.problem, x.observe, x.assumptions, FAMILY[x.family], "statistical physics critical metastability annealing tempering sandpile avalanche finite-size scaling coarse-graining energy landscape"].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  /** @param {string} q @param {Record<string, any>} s @param {string} head */
  function list(q, s, head) {
    const found = matching(q);
    return Object.keys(FAMILY).map((fam) => {
      const items = found.filter((/** @type {any} */ x) => x.family === fam);
      if (!items.length) return "";
      return `<${head} class="law-head">${esc(FAMILY[fam])}</${head}><ul class="model-list">${items.map((/** @type {any} */ x) => {
        const cur = s.nav === "physics" && s.ph_example === x.id;
        return `<li><button type="button" class="link${cur ? " current" : ""}" data-phys-open="${esc(x.id)}" aria-current="${cur}"><span class="kind">Behaviour</span> ${esc(x.title)}</button></li>`;
      }).join("")}</ul>`;
    }).join("");
  }

  /** The examples of group 9 for the Examples list of view.js. @param {string} q @param {Record<string, any>} s */
  function examples(q, s) {
    const html = list(q, s, "h4");
    return html ? `<h3 class="law-head">Statistical-physics test</h3>${html}` : "";
  }

  /** @param {Record<string, any>} s */
  function drawNav(s) {
    const box = $("phys-list"), k = JSON.stringify([s.q, s.nav, s.ph_example]);
    if (box.dataset.key !== k) {
      box.dataset.key = k;
      box.innerHTML = list(s.q, s, "h3") || `<p class="note">No example matches "${esc(s.q)}". Search by a phenomenon or a method.</p>`;
    }
    const search = $("phys-search");
    if (document.activeElement !== search && search.value !== s.q) search.value = s.q;
    const ml = $("phys-method-list");
    if (!ml.dataset.done) { ml.dataset.done = "1"; ml.innerHTML = data.physics.methods.map((/** @type {any} */ m) => `<li><button type="button" class="link" data-phys-method="${esc(m.id)}">${esc(m.name)}</button></li>`).join(""); }
  }

  /** The state that opens an example, with optional settings on top. @param {string} id @param {Record<string, any>} [extra] */
  function exampleState(id, extra = {}) {
    const x = data.physics.examples.find((/** @type {any} */ e) => e.id === id);
    if (!x) return null;
    const F = g.Model.FIELDS, base = Object.fromEntries(Object.keys(F).filter((k) => k.startsWith("ph_") && k !== "ph_az" && k !== "ph_el").map((k) => [k, F[k].default]));
    return { ...base, nav: "physics", ph_example: id, ...x.settings, ...extra };
  }
  /** @param {string} id @param {Record<string, any>} [extra] */
  function open(id, extra) {
    const st = exampleState(id, extra);
    if (st) app.set(st);
  }

  /* ---------- the centre card ---------- */

  /** @param {Record<string, any>} s */
  function draw(s) {
    app = app ?? g.VisualKit?.app;
    drawNav(s);
    const shown = s.nav === "physics";
    $("wb-physics").hidden = !shown;
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
    drawControls(s);
    drawMethodCard(s);
    drawRun(s);
  }

  /** @param {Record<string, any>} s */
  function drawHeader(s) {
    const x = exampleOf(s);
    $("phys-kind").textContent = `${FAMILY[x.family]} · Behaviour experiment`;
    $("phys-title").textContent = x.title;
    $("phys-problem").textContent = x.problem;
    $("phys-observe").textContent = `What to observe: ${x.observe}`;
    const lines = x.family === "sandpile" ? Ph.dynamics(run.job) : (() => {
      const L = Ph.LANDSCAPES[s.ph_land], land = Ph.landscape(s.ph_land), [tx, ty] = Ph.coords(land, land.trapNode), [gx, gy] = Ph.coords(land, land.globalNode);
      return [`${L.title}. ${L.text}`, x.assumptions,
        `Exact analysis of the grid: ${land.minima.length} local minima. The global minimum is at (${gx.toFixed(2)}, ${gy.toFixed(2)}), V = ${land.V[land.globalNode].toFixed(3)}. The trap, the minimum with the largest stability level, is at (${tx.toFixed(2)}, ${ty.toFixed(2)}), V = ${land.V[land.trapNode].toFixed(3)}. Its stability level is V_m = d* = ${land.dstar.toFixed(3)}.`];
    })();
    const k = JSON.stringify([s.ph_example, s.ph_land, lines]);
    if ($("phys-dynamics").dataset.key !== k) {
      $("phys-dynamics").dataset.key = k;
      $("phys-dynamics").innerHTML = `${x.family === "landscape" ? `<div class="formula" data-tex="${esc(Ph.LANDSCAPES[s.ph_land].tex)}"></div>` : ""}<ul>${lines.map((/** @type {string} */ t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
    }
    const errs = run && !run.c.ok ? run.c.errors : [];
    $("phys-errors").hidden = !errs.length;
    $("phys-errors").innerHTML = errs.length ? `<p>The setting has ${errs.length} ${errs.length === 1 ? "error" : "errors"}, so the page does not run it:</p><ul>${errs.map((/** @type {string} */ e) => `<li>${esc(e)}</li>`).join("")}</ul>` : "";
  }

  /** @param {Record<string, any>} s */
  const figsOf = (s) => FIGS[s.ph_example];
  /** @param {Record<string, any>} s */
  const shownPlot = (s) => (figsOf(s).includes(s.ph_plot) ? s.ph_plot : figsOf(s)[0]);

  /** The settings that apply to the example, the sizes in words and the figure buttons. @param {Record<string, any>} s */
  function drawControls(s) {
    const ex = s.ph_example, sand = exampleOf(s).family === "sandpile";
    const rows = /** @type {Record<string, boolean>} */ ({
      "phys-land-row": !sand, "phys-tlo-row": ex === "metastable-exit", "phys-thi-row": ex === "metastable-exit", "phys-cap-row": ex === "metastable-exit", "phys-reps-row": !sand,
      "phys-t0-row": ex === "annealing-schedules", "phys-tend-row": ex === "annealing-schedules", "phys-kappa-row": ex === "annealing-schedules", "phys-steps-row": ex === "annealing-schedules" || ex === "tempering-wells",
      "phys-tmin-row": ex === "tempering-wells", "phys-tmax-row": ex === "tempering-wells", "phys-k-row": ex === "tempering-wells", "phys-inner-row": ex === "tempering-wells", "phys-start-row": ex === "tempering-wells",
      "phys-rule-row": sand, "phys-bc-row": sand, "phys-drive-row": sand, "phys-g-row": sand, "phys-eps-row": sand, "phys-l-row": sand && ex !== "finite-size", "phys-lmax-row": ex === "finite-size",
      "phys-drives-row": sand, "phys-chains-row": sand, "phys-b-row": ex === "coarse-graining" || (sand && shownPlot(s) === "grid"),
      "phys-tau-row": ex === "finite-size" && shownPlot(s) === "collapse", "phys-d-row": ex === "finite-size" && shownPlot(s) === "collapse", "phys-view-row": shownPlot(s) === "land", "phys-el-row": shownPlot(s) === "land",
    });
    for (const [id, on] of Object.entries(rows)) $(id).style.display = on ? "" : "none";
    const job = run?.job;
    const words = !run?.c.ok ? "" : job.kind === "metastability" ? `${count(job.reps)} replicates at each of ${job.temps.length} temperatures (${job.temps.join(", ")}), at most ${count(job.steps)} steps each.`
      : job.kind === "annealing" ? `${count(job.reps)} replicates of ${count(job.steps)} steps for each of the 4 schedules. The logarithmic constant is c = ${fmt(run.c.logC)}.`
        : job.kind === "tempering" ? `${count(job.reps)} independent chains of ${count(job.sweeps)} sweeps, each sweep ${job.inner} Metropolis steps for each of ${job.replicas} temperatures.`
          : `${count(job.chains)} independent chains for each of L = ${job.sizes.join(", ")}: a warm-up of 4L²/g drives, then ${count(job.drives)} recorded drives.`;
    $("phys-size-out").textContent = words;
    const plot = shownPlot(s);
    $("phys-plots").innerHTML = figsOf(s).map((p) => `<button type="button" value="${p}" aria-pressed="${p === plot}">${esc(PLOTS[p])}</button>`).join("");
    $("phys-tau-out").textContent = String(s.ph_tau);
    $("phys-d-out").textContent = String(s.ph_d);
  }

  /** The card of the method of the example: its 6 parts with buttons that open its examples. @param {Record<string, any>} s */
  function drawMethodCard(s) {
    const id = /** @type {Record<string, string>} */ ({ "metastable-exit": "annealing", "annealing-schedules": "annealing", "tempering-wells": "tempering", "sandpile-btw": "sandpile", "finite-size": "fss", "coarse-graining": "coarse" })[s.ph_example];
    const m = data.physics.methods.find((/** @type {any} */ x) => x.id === id);
    const box = $("phys-method-card");
    if (box.dataset.key === m.id) return;
    box.dataset.key = m.id;
    const link = (/** @type {any} */ part) => `<button type="button" class="link" data-phys-open="${esc(part.example)}" data-phys-extra="${esc(JSON.stringify(part.settings ?? {}))}">Open it</button>`;
    const other = data.physics.methods.find((/** @type {any} */ x) => x.id === m.comparison.with);
    box.innerHTML = `<h3>${esc(m.name)} <span class="label">${esc(m.family)}</span></h3><div class="formula" data-tex="${esc(m.estimator)}"></div><p>${esc(m.estimatorText)}</p>
<div class="cols"><div><h4>Assumptions</h4><ul>${m.assumptions.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul><h4>Settings</h4><ul>${m.settings.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
<div><h4>Suitable example</h4><p>${esc(m.suitable.text)} ${link(m.suitable)}</p>
<h4>Failure example</h4><p>${esc(m.failure.text)} ${link(m.failure)}</p>
<h4>Comparison with ${esc(other.name.toLowerCase())}</h4><p>${esc(m.comparison.text)} ${link(m.comparison)}</p></div></div>`;
  }

  /** The status line, the progress bar and the buttons. */
  function drawStatus() {
    const r = run;
    if (!r || !app || app.state.nav !== "physics") return;
    const B = r.c.ok ? r.c.blocks : 0, done = r.c.ok ? r.acc.blocks / B : 0;
    $("phys-progress").value = done;
    $("phys-progress").textContent = `${Math.round(done * 100)} %`;
    const st = !r.c.ok ? "The setting has errors, so the page cannot run it." : r.status === "idle" ? "Ready. Press Run or Step."
      : `${r.status === "running" ? "Running" : r.status === "done" ? "Complete" : r.status === "paused" ? "Paused: the partial result is not complete" : r.status === "cancelled" ? "Cancelled" : "Stopped by an error"}: ${r.acc.blocks} of ${B} blocks, ${fmt((r.elapsed + (r.status === "running" ? performance.now() - r.started : 0)) / 1000)} s, ${esc(r.mode || "not started")}.`;
    $("phys-status").textContent = `${st}${r.message ? ` ${r.message}` : ""}${r.acc?.error ? ` ${r.acc.error}` : ""}`;
    const busy = !r.c.ok || !!r.handle || r.acc.blocks >= B;
    $("phys-go").disabled = busy;
    $("phys-step-run").disabled = busy;
    $("phys-pause").disabled = !r.handle;
    $("phys-pause").setAttribute("aria-pressed", String(r.status === "paused"));
  }

  /** The parts that change while the run proceeds. @param {Record<string, any>} s */
  function drawRun(s) {
    drawStatus();
    const sm = summary();
    drawResults(sm);
    drawFigure(s, sm);
    drawDiagnostics(s, sm);
    drawReplay(sm);
  }

  /** @param {any} sm */
  function drawResults(sm) {
    const box = $("phys-results");
    if (!sm) { box.innerHTML = `<p class="note">${run?.c.ok ? "Run the experiment to fill the table." : "No results: the setting has errors."}</p>`; return; }
    const rows = sm.rows.map((/** @type {any} */ r) => `<tr><th scope="row">${esc(r.label)}${r.unit ? ` <span class="note">[${esc(r.unit)}]</span>` : ""}</th><td class="num">${fmt(r.est)}</td>
<td class="num">${r.lo === null || r.lo === undefined ? `<span class="note">${esc(r.how)}</span>` : `${fmt(r.lo)} to ${fmt(r.hi)}<br><span class="note">${esc(r.how)}</span>`}</td>
<td class="num">${fmt(r.reference)}<br><span class="note">${esc(r.refHow)}</span></td><td>${r.tags.map((/** @type {string} */ t) => tag(t)).join("")}</td></tr>`).join("");
    box.innerHTML = `<table><caption>Results after ${sm.blocks} of ${sm.of} blocks. Seed ${app.state.seed}. ${sm.complete ? "" : "<strong>Partial: the run is not complete.</strong>"}</caption>
<thead><tr><th scope="col">Quantity</th><th scope="col">Estimate</th><th scope="col">95 % interval</th><th scope="col">Reference value</th><th scope="col">Claim</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ---------- figures ---------- */

  /** A token colour as [r, g, b], read at draw time so both themes draw right. @param {string} name */
  const token = (name) => PP.parseColour(getComputedStyle(document.documentElement).getPropertyValue(name) || "#808080");

  /** @param {Record<string, any>} s @param {any} sm */
  function drawFigure(s, sm) {
    const plot = shownPlot(s), canvasPlot = plot === "land" || plot === "grid";
    $("phys-canvas-box").hidden = !canvasPlot;
    $("phys-plot").hidden = canvasPlot;
    $("phys-fig-caption").textContent = PLOTS[plot];
    if (plot === "land") { $("phys-fig-note").textContent = drawLandscape(s, sm); return; }
    if (plot === "grid") { $("phys-fig-note").textContent = drawGrid(s, sm); return; }
    const f = chartOf(s, sm, plot);
    $("phys-plot").innerHTML = f.svg;
    $("phys-fig-note").textContent = f.note;
  }

  /** The canvas, sized to its box and the device pixel ratio. @returns {[CanvasRenderingContext2D, number, number]} */
  function canvas() {
    const cv = $("phys-canvas"), w = Math.max(280, Math.min(900, $("phys-canvas-box").clientWidth || 600)), h = Math.round(Math.min(460, w * 0.62)), r = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d"));
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, w, h);
    return [ctx, w, h];
  }

  /** The 3D view of the landscape with the minima, the minimax route and the paths of the run. @param {Record<string, any>} s @param {any} sm */
  function drawLandscape(s, sm) {
    const land = Ph.landscape(s.ph_land), [ctx, w, h] = canvas();
    const surf = PP.surface(land, s.ph_az, s.ph_el, w, h, 1), low = token("--c1"), high = token("--surface");
    for (const q of surf.quads) {
      ctx.beginPath();
      q.pts.forEach((/** @type {number[]} */ p, /** @type {number} */ i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = PP.mix(low, high, q.t, q.shade);
      ctx.fill();
    }
    /** @param {number[]} nodes @param {string} colour @param {number} width @param {boolean} [dash] */
    const path = (nodes, colour, width, dash = false) => {
      if (!nodes || nodes.length < 2) return;
      ctx.beginPath();
      nodes.forEach((n, i) => { const [x, y] = surf.point(n); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.setLineDash(dash ? [5, 4] : []); ctx.stroke(); ctx.setLineDash([]);
    };
    const css = (/** @type {string} */ n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    path(land.route.path, css("--fg"), 1.5, true);
    /** @type {string[]} */
    const key = ["Dashed: the minimax route from the trap to the global minimum"];
    if (sm?.kind === "metastability") { const t0 = sm.temps.find((/** @type {any} */ t) => t.path); if (t0) { path(t0.path, css("--c2"), 2); key.push(`Orange: the last ${t0.path.length} states before the first exit at T = ${t0.T}`); } }
    if (sm?.kind === "annealing" && sm.paths) {
      sm.paths.forEach((/** @type {number[]} */ p, /** @type {number} */ i) => { ctx.fillStyle = css(["--c1", "--c2", "--c3", "--c4"][i]); for (const n of p) { const [x, y] = surf.point(n); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); } });
      key.push("Dots: about 300 states of replicate 1, sampled through the run, for the logarithmic (blue), geometric (orange), linear (violet) and quench (teal) schedules");
    }
    if (sm?.kind === "tempering" && sm.cold) {
      for (const [nodes, colour] of [[sm.coldOne, "--c2"], [sm.cold, "--c4"]]) { ctx.fillStyle = css(/** @type {string} */ (colour)); for (const n of /** @type {number[]} */ (nodes)) { const [x, y] = surf.point(n); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); } }
      key.push("Teal dots: the state at T_min in parallel tempering, chain 1 · Orange dots: the one chain at T_min");
    }
    for (const [k, node] of land.minima.entries()) {
      const [x, y] = surf.point(node), main = k === land.global || k === land.trap;
      ctx.beginPath(); ctx.arc(x, y, main ? 5 : 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = css(k === land.global ? "--hl" : k === land.trap ? "--warn" : "--fg"); ctx.fill();
    }
    ctx.fillStyle = css("--fg"); ctx.font = "12px system-ui, sans-serif";
    const [gx, gy] = surf.point(land.globalNode), [tx, ty] = surf.point(land.trapNode);
    ctx.fillText("global minimum", gx + 8, gy - 6);
    ctx.fillText("trap", tx + 8, ty - 6);
    $("phys-canvas").setAttribute("aria-label", `3D view of the ${Ph.LANDSCAPES[s.ph_land].title.toLowerCase()}, turned ${s.ph_az}° and tilted ${s.ph_el}°. Low energy is dark blue. ${key.join(". ")}.`);
    return `Turn the view with the sliders, by dragging, or with the arrow keys on the focused figure. Energies above ${fmt(surf.cap)} are drawn at that level. Red dot: global minimum. Amber dot: the trap. ${key.join(". ")}.`;
  }

  /** The lattice of chain 1 and its largest avalanche, averaged over b x b blocks. @param {Record<string, any>} s @param {any} sm */
  function drawGrid(s, sm) {
    const [ctx, w, h] = canvas();
    const size = sm?.sizes?.find((/** @type {any} */ x) => x.final) ?? null;
    if (!size) { ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted"); ctx.font = "13px system-ui, sans-serif"; ctx.fillText("Run the experiment to draw the lattice.", 16, 28); $("phys-canvas").setAttribute("aria-label", "No lattice yet"); return ""; }
    const L = size.L, b = Math.min(Number(s.ph_b), Math.floor(L / 2)) || 1;
    const hz = Ph.coarse(size.final, L, b), fp = Ph.coarse(size.footprint ?? new Array(L * L).fill(0), L, b);
    const side = Math.min((w - 48) / 2, h - 50), x0 = 16, x1 = w / 2 + 8, y0 = 30, cell = side / hz.w;
    const low = token("--surface"), high = token("--c1"), hot = token("--c2");
    const top = run.job.rule === "manna" ? 1 : 3, fmax = Math.max(1, ...fp.values);
    for (let j = 0; j < hz.w; j++) for (let i = 0; i < hz.w; i++) {
      ctx.fillStyle = PP.mix(low, high, hz.values[i + hz.w * j] / top);
      ctx.fillRect(x0 + i * cell, y0 + (hz.w - 1 - j) * cell, Math.ceil(cell), Math.ceil(cell));
      const v = fp.values[i + hz.w * j];
      ctx.fillStyle = PP.mix(low, hot, v > 0 ? 0.25 + 0.75 * Math.log1p(v) / Math.log1p(fmax) : 0);
      ctx.fillRect(x1 + i * cell, y0 + (hz.w - 1 - j) * cell, Math.ceil(cell), Math.ceil(cell));
    }
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg"); ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`Heights, mean over ${b} × ${b} blocks`, x0, 18);
    ctx.fillText(`Largest avalanche: topplings, ${b} × ${b} blocks`, x1, 18);
    $("phys-canvas").setAttribute("aria-label", `The lattice of chain 1 at L = ${L} after the run, and its largest avalanche of ${count(size.maxS)} topplings, both as means over ${b} × ${b} blocks`);
    return `Left: the heights of chain 1 at the end of the run, from 0 (light) to ${top} (blue), as means over ${b} × ${b} blocks. Right: the topplings at each site in the largest avalanche of chain 1 (${count(size.maxS)} topplings), on a log scale. A coarse-grained view keeps the large-scale shape and loses the detail below b.`;
  }

  /** An empty chart with a message. @param {string} title @param {string} msg */
  const empty = (title, msg) => PP.chart({ title, xlabel: "", ylabel: "", series: [], empty: msg });

  /**
   * The SVG chart of one figure and its note.
   * @param {Record<string, any>} s @param {any} sm @param {string} plot @returns {{ svg: string, note: string }}
   */
  function chartOf(s, sm, plot) {
    if (plot === "route") {
      const land = Ph.landscape(s.ph_land), e = land.route.energy, base = land.V[land.trapNode];
      return { svg: PP.chart({ title: "Energy along the minimax route from the trap to the global minimum", xlabel: "Step along the route (grid moves)", ylabel: "Energy V",
        series: [{ label: "V along the route", x: e.map((/** @type {number} */ _, /** @type {number} */ i) => i), y: e }],
        guides: [{ x0: 0, y0: base, x1: e.length - 1, y1: base, label: "V at the trap" }, { x0: 0, y0: land.route.barrier, x1: e.length - 1, y1: land.route.barrier, label: `barrier: V_m = ${land.dstar.toFixed(3)} above the trap` }] }),
      note: "The route keeps its highest energy as low as possible. Its highest point above the trap is the stability level V_m, an exact value of the grid. Every exit must climb at least this high." };
    }
    if (!sm) return { svg: empty(PLOTS[plot], "Run the experiment to draw this figure."), note: "" };
    if (plot === "arrhenius") {
      const t = sm.temps.filter((/** @type {any} */ x) => x.n);
      const ref = sm.temps.filter((/** @type {any} */ x) => x.reference);
      const lo = ref.length ? ref.reduce((/** @type {any} */ a, /** @type {any} */ b) => (b.T < a.T ? b : a)) : null;
      const xs = sm.temps.map((/** @type {any} */ x) => 1 / x.T);
      const guides = lo ? [{ x0: Math.min(...xs), y0: lo.reference * Math.exp(sm.level * (Math.min(...xs) - 1 / lo.T)), x1: 1 / lo.T, y1: lo.reference, label: `slope V_m = ${sm.level.toFixed(3)}` }] : [];
      return { svg: PP.chart({ title: "Mean exit time against 1/T, log axis", xlabel: "1/T", ylabel: "Mean exit time E[τ] (steps, log axis)", ylog: true,
        series: [{ label: "run, 95 % interval", x: t.map((/** @type {any} */ x) => 1 / x.T), y: t.map((/** @type {any} */ x) => x.est), lo: t.map((/** @type {any} */ x) => x.lo), hi: t.map((/** @type {any} */ x) => x.hi), mark: "dots" },
          { label: "exact (linear solve)", x: ref.map((/** @type {any} */ x) => 1 / x.T), y: ref.map((/** @type {any} */ x) => x.reference), cls: "s2" }], guides }),
      note: `The dashed line has the slope V_m of the theorem through the exact value at the lowest temperature. The slope from the run is ${fmt(sm.fit?.slope)}, and the slope from the exact values is ${fmt(sm.exactFit?.slope)}. ${sm.exactFit && sm.exactFit.slope < sm.level ? "At these temperatures the exact slope is below V_m, because the theorem gives V_m only as the limit T → 0." : "The theorem gives V_m only as the limit T → 0."}` };
    }
    if (plot === "exits") {
      const series = sm.temps.filter((/** @type {any} */ x) => x.n && x.est > 0 && !x.censored).map((/** @type {any} */ x) => {
        const xs = [], ys = [];
        let below = 0;
        for (let k = 0; k < Ph.BINS; k++) { below += x.hist[k]; if (!x.hist[k]) continue; const [, hi] = Ph.binRange(k); const sv = 1 - below / x.n; if (sv > 0) { xs.push(hi / x.est); ys.push(sv); } }
        return { label: `T = ${x.T}`, x: xs, y: ys };
      });
      const grid = Array.from({ length: 40 }, (_, i) => 0.01 + (i * 6) / 39);
      series.push({ label: "exp(−x)", x: grid, y: grid.map((v) => Math.exp(-v)), cls: "hl", dash: true });
      return { svg: PP.chart({ title: "Survival function of the exit time scaled by its mean", xlabel: "τ / mean τ", ylabel: "P(τ > x · mean τ), log axis", ylog: true, x: [0, 6], y: [1e-3, 1], series }),
        note: "As T → 0 the scaled exit time tends to the exponential law, a straight line on this log axis. The points are a finite-run observation, and the log bins make them steps. A temperature with censored replicates is not drawn." };
    }
    if (plot === "schedules" || plot === "energy") {
      const xs = sm.checkpoints.map((/** @type {number} */ k) => k + 1);
      const series = sm.schedules.map((/** @type {any} */ x, /** @type {number} */ i) => ({ label: SCHED[x.kind], x: xs, y: plot === "schedules" ? sm.temps[i] : x.trace }));
      if (plot === "schedules") return { svg: PP.chart({ title: "Temperature of each schedule against the step", xlabel: "Step k + 1 (log axis)", ylabel: "Temperature T_k", xlog: true, series }), note: `The logarithmic schedule c/log(k + 2) with c = ${fmt(sm.logC)} decreases quickly at the start and slowly after that. At the last step it is ${fmt(sm.schedules[0].final)}. Hajek's condition needs c ≥ d* = ${fmt(sm.dstar)}.` };
      const land = Ph.landscape(s.ph_land), vg = land.V[land.globalNode];
      return { svg: PP.chart({ title: "Mean energy of the replicates against the step", xlabel: "Step k + 1 (log axis)", ylabel: "Mean energy", xlog: true, series, guides: [{ x0: xs[0], y0: vg, x1: xs.at(-1), y1: vg, label: "global minimum" }] }),
        note: "The mean over the replicates at 64 checkpoints, a finite-run observation. A curve that stays above the global minimum shows replicates that end in other wells." };
    }
    if (plot === "success") {
      const rows = sm.schedules.map((/** @type {any} */ x) => ({ label: SCHED[x.kind], est: x.success.est, lo: x.success.lo, hi: x.success.hi, reference: x.equilibrium }));
      return { svg: P.comparison({ rows, ylabel: "P(final state in the global basin)" }), note: "Wilson 95 % intervals. The dashed marks are the Boltzmann probabilities at each final temperature: the values at equilibrium, not the estimand. A gap means that the chain is not in equilibrium at the end." };
    }
    if (plot === "basins") {
      const land = Ph.landscape(s.ph_land), top = sm.basins.slice(0, 3), names = ["A", "B", "C"];
      const rows = top.flatMap((/** @type {any} */ b, /** @type {number} */ i) => [{ label: `PT, well ${names[i]}`, est: b.pt.est, lo: b.pt.lo, hi: b.pt.hi, reference: b.exact }, { label: `One chain, ${names[i]}`, est: b.one.est, lo: b.one.lo, hi: b.one.hi, reference: b.exact }]);
      const where = top.map((/** @type {any} */ b, /** @type {number} */ i) => { const [x, y] = Ph.coords(land, b.node); return `${names[i]} at (${x.toFixed(1)}, ${y.toFixed(1)})`; }).join(", ");
      return { svg: P.comparison({ rows, ylabel: "Probability of the well at T_min" }), note: `The 3 most probable wells: ${where}. For each, parallel tempering (PT) and one chain at T_min with the same number of Metropolis steps, with t intervals over the chains. The dashed marks are the exact Boltzmann probabilities.` };
    }
    if (plot === "swaps") {
      const xs = sm.swaps.map((/** @type {any} */ _, /** @type {number} */ r) => (sm.temps[r] + sm.temps[r + 1]) / 2);
      return { svg: PP.chart({ title: "Swap acceptance rate of each pair of neighbouring temperatures", xlabel: "Mean temperature of the pair (log axis)", ylabel: "Swap acceptance rate", xlog: true, y: [0, 1], series: [{ label: "swap rate", x: xs, y: sm.swaps, mark: "both" }] }),
        note: `A rate near 0 stops the movement of replicas between the two parts of the ladder. Each replica made ${fmt(sm.trips)} round trips from T_min to T_max and back, on average over the chains: a finite-run observation.` };
    }
    if (plot === "ladder") {
      const tr = sm.trace;
      if (!tr) return { svg: empty("Replica paths", "Run the experiment to draw this figure."), note: "" };
      const K = tr[0].length, xs = tr.map((/** @type {any} */ _, /** @type {number} */ i) => i), series = Array.from({ length: Math.min(K, 4) }, (_, r) => ({ label: `replica ${r + 1}`, x: xs, y: tr.map((/** @type {number[]} */ row) => row[r] + 1) }));
      return { svg: PP.chart({ title: "Temperature index of replicas 1 to 4 of chain 1, sampled through the run", xlabel: "Sample (256 through the run)", ylabel: `Temperature index (1 = T_min, ${K} = T_max)`, y: [0.5, K + 0.5], series }),
        note: "A replica that moves over the whole ladder carries states from the hot end, where the chain crosses the barriers, down to T_min." };
    }
    if (plot === "sizes") {
      const fss = s.ph_example === "finite-size";
      const series = fss ? sm.sizes.filter((/** @type {any} */ x) => x.chains).map((/** @type {any} */ x, /** @type {number} */ i) => ({ label: `L = ${x.L}`, x: x.size.map((/** @type {any} */ p) => p.x), y: x.size.map((/** @type {any} */ p) => p.y), cls: i < 4 ? `s${i + 1}` : "hl" }))
        : (() => { const x = sm.sizes[0]; return [["size s", "size", "s1"], ["area a", "area", "s2"], ["duration T", "duration", "s3"]].map(([label, k, cls]) => ({ label, x: x[k].map((/** @type {any} */ p) => p.x), y: x[k].map((/** @type {any} */ p) => p.y), cls })); })();
      return { svg: PP.chart({ title: fss ? "Avalanche size law for each lattice size" : `Law of the avalanche size, area and duration at L = ${sm.sizes[0].L}`, xlabel: "Value (log axis)", ylabel: "Density for each unit (log axis)", xlog: true, ylog: true, series }),
        note: fss ? "The cutoff moves to larger sizes as L grows. The straight part is a finite-run observation, not a theorem." : "Log bins, 4 for each factor of 2, of the drives with at least 1 toppling. A straight part on these axes is a finite-run observation on one lattice." };
    }
    if (plot === "heights") {
      const x = sm.sizes[0], ex = x.heights.exact;
      const rows = x.heights.freq.map((/** @type {number} */ f, /** @type {number} */ h) => ({ label: `height ${h}`, est: f, lo: null, hi: null, reference: ex ? ex[h] : null }));
      return { svg: P.comparison({ rows, ylabel: "Frequency at the central sites" }), note: ex ? "Dashed: the exact probabilities on the infinite lattice (Priezzhev 1994). The central sites of a finite lattice differ from them by a small amount that falls with L." : "No exact height probabilities are known for this setting." };
    }
    if (plot === "collapse") {
      const curves = Ph.collapse(sm.sizes.filter((/** @type {any} */ x) => x.chains), s.ph_tau, s.ph_d);
      return { svg: PP.chart({ title: `Data collapse: s^τ P(s) against s / L^D with τ = ${s.ph_tau} and D = ${s.ph_d}`, xlabel: "s / L^D (log axis)", ylabel: "s^τ P(s) (log axis)", xlog: true, ylog: true,
        series: curves.map((/** @type {any} */ c, /** @type {number} */ i) => ({ label: `L = ${c.L}`, x: c.x, y: c.y, cls: i < 4 ? `s${i + 1}` : "hl" })) }),
      note: "Move τ and D. Under the simple finite-size scaling hypothesis the curves fall on one curve. Several pairs look about as good on these lattices, and a good collapse does not establish a universality class." };
    }
    if (plot === "moments") {
      const pts = sm.sigma.filter((/** @type {any} */ x) => x.fit);
      const guides = sm.dFit ? [{ x0: pts[0].q, y0: sm.dFit.intercept + sm.dFit.slope * pts[0].q, x1: pts.at(-1).q, y1: sm.dFit.intercept + sm.dFit.slope * pts.at(-1).q, label: `slope ${sm.dFit.slope.toFixed(2)}` }] : [];
      const ex = sm.exactFit ? [{ label: "σ(1) from the exact ⟨s⟩", x: [1], y: [sm.exactFit.slope], mark: /** @type {"dots"} */ ("dots"), cls: "s2" }] : [];
      return { svg: PP.chart({ title: "Moment exponents σ(q) against the order q", xlabel: "Order q", ylabel: "σ(q): slope of log ⟨s^q⟩ against log L",
        series: [{ label: "run, 95 % interval", x: pts.map((/** @type {any} */ x) => x.q), y: pts.map((/** @type {any} */ x) => x.fit.slope), lo: pts.map((/** @type {any} */ x) => x.fit.lo), hi: pts.map((/** @type {any} */ x) => x.fit.hi), mark: "dots" }, ...ex], guides }),
      note: "Under simple finite-size scaling σ(q) = D(q + 1 − τ), a straight line of slope D. The slopes are finite-run observations on few sizes, and their intervals hold the Monte Carlo error only." };
    }
    if (plot === "mean") {
      const ok = sm.sizes.filter((/** @type {any} */ x) => x.chains);
      return { svg: PP.chart({ title: "Mean avalanche size against L", xlabel: "L (log axis)", ylabel: "⟨s⟩ for each drive (log axis)", xlog: true, ylog: true,
        series: [{ label: "run, 95 % interval", x: ok.map((/** @type {any} */ x) => x.L), y: ok.map((/** @type {any} */ x) => x.meanS.est), lo: ok.map((/** @type {any} */ x) => x.meanS.lo), hi: ok.map((/** @type {any} */ x) => x.meanS.hi), mark: "dots" },
          { label: "exact (Dhar)", x: ok.map((/** @type {any} */ x) => x.L), y: ok.map((/** @type {any} */ x) => x.reference), cls: "s2" }] }),
      note: "The exact mean follows from Δ E[n] = E[added]. With an open boundary and no dissipation, ⟨s⟩ / L² tends to a constant. For the BTW rule on a periodic lattice with ε > 0, it equals 1/(4ε) at every L: the dissipation sets the scale." };
    }
    const x = sm.sizes[0];
    const bs = x.scales;
    if (plot === "blockvar") {
      if (!x.blockVar) return { svg: empty("Block variance", "The lattice is too small for 2 block sizes."), note: "" };
      return { svg: PP.chart({ title: "Variance of the block mean of the heights against the block size", xlabel: "Block size b (log axis)", ylabel: "Variance of the block mean (log axis)", xlog: true, ylog: true,
        series: [{ label: "run", x: bs, y: x.blockVar, mark: "both" }], guides: [{ x0: bs[0], y0: x.blockVar[0], x1: bs.at(-1), y1: x.blockVar[0] * (bs[0] / bs.at(-1)) ** 2, label: "slope −2: independent heights" }] }),
      note: `Slope ${fmt(x.varFit?.slope)}, a finite-run observation on ${bs.length} scales. A slope steeper than −2 means that the block means vary less than for independent heights.` };
    }
    if (!x.box) return { svg: empty("Box counts", "No avalanche was large enough to count boxes."), note: "" };
    const nb = x.box.map((/** @type {number} */ v) => Math.exp(v));
    return { svg: PP.chart({ title: "Boxes touched by a large avalanche against the box size", xlabel: "Box size b (log axis)", ylabel: "Geometric mean of N_b (log axis)", xlog: true, ylog: true,
      series: [{ label: `${count(x.nBox)} avalanches`, x: bs, y: nb, mark: "both" }], guides: [{ x0: bs[0], y0: nb[0], x1: bs.at(-1), y1: nb[0] * (bs[0] / bs.at(-1)) ** 2, label: "slope −2: a compact set" }] }),
    note: `Slope ${fmt(x.boxFit?.slope)}, a finite-run observation on ${bs.length} scales. The avalanches with an area of at least L²/16 count.` };
  }

  /* ---------- diagnostics ---------- */

  /** @param {Record<string, any>} s @param {any} sm */
  function drawDiagnostics(s, sm) {
    const x = exampleOf(s), k = JSON.stringify([s.ph_example]);
    if ($("phys-assumptions").dataset.key !== k) {
      $("phys-assumptions").dataset.key = k;
      $("phys-assumptions").innerHTML = `<p>${esc(x.assumptions)}</p>`;
      $("phys-interpretation").innerHTML = `<p>${esc(x.diagnostics)}</p><p>${esc(x.interpretation)}</p>`;
    }
    const box = $("phys-diagnostics");
    if (!sm) { box.innerHTML = '<p class="note">Run the experiment to see the diagnostics.</p>'; return; }
    /** @type {string[]} */
    const out = [];
    if (sm.kind === "metastability") {
      for (const t of sm.temps) out.push(`<li>T = ${t.T}: ${count(t.n)} replicates, ${t.censored ? `<strong class="warn-text">${t.censored} censored at the step limit</strong>` : "none censored"}${t.reference ? `; exact mean ${fmt(t.reference)}${t.lo !== null ? `, ${t.reference >= t.lo && t.reference <= t.hi ? "inside" : "<strong class=\"bad-text\">outside</strong>"} the interval` : ""}` : ""}. ${tag("observation")}</li>`);
    } else if (sm.kind === "annealing") {
      for (const x2 of sm.schedules) out.push(`<li>${SCHED[x2.kind]}: Hajek's condition ${esc(x2.hajek)}. Final temperature ${fmt(x2.final)}. ${tag("theorem")}</li>`);
      for (const p of sm.pairs) out.push(`<li>Paired difference ${SCHED[p.a]} − ${SCHED[p.b]} in P(global basin): ${fmt(p.est)} (${fmt(p.lo)} to ${fmt(p.hi)}), from ${p.n10} and ${p.n01} discordant replicates on the same streams. ${tag("observation")}</li>`);
    } else if (sm.kind === "tempering") {
      out.push(`<li>Swap rates from T_min up: ${sm.swaps.map((/** @type {number | null} */ v) => fmt(v)).join(", ")}. ${tag("observation")}</li>`);
      out.push(`<li>Round trips of each replica from T_min to T_max and back: ${fmt(sm.trips)} on average over the chains. ${tag("observation")}</li>`);
      out.push(`<li>Exact mean energy at T_min: ${fmt(sm.exactEnergy)}. ${tag("theorem")}</li>`);
      out.push("<li>The t interval measures the spread between chains, not a bias that every chain shares. The single chains at T_min can agree with each other and still miss the exact value. This occurs when they all start in one well.</li>");
    } else {
      for (const z of sm.sizes.filter((/** @type {any} */ y) => y.chains)) {
        const b = z.balance;
        out.push(`<li>L = ${z.L}: ${z.chains} chains, ${count(z.drives)} recorded drives, ${fmt(z.zero / z.drives)} of them with no toppling, largest avalanche ${count(z.maxS)} topplings. ${tag("observation")}
<br>Grains: ${count(b.added)} added = ${count(b.lostEdge)} lost at the boundary + ${count(b.lostBulk)} lost in the bulk + ${count(b.massChange)} change of the mass: ${b.exact ? "exact" : "<strong class=\"bad-text\">not exact</strong>"}.
${z.recurrent !== null ? `<br>Burning test after the warm-up of ${count(z.burn)} drives: ${z.recurrent} of ${z.chains} chains recurrent. ${tag("theorem")}` : ""}
<br>Mean height in the first and second half of the drives: ${fmt(z.density[0].est)} and ${fmt(z.density[1].est)}: close values support a stationary state, and do not prove it.${z.residual !== null ? ` Conjugate-gradient residual of the exact mean: ${fmt(z.residual)}.` : ""}</li>`);
      }
      if (sm.fixed) out.push('<li class="warn-text">This dynamics uses no random number: with the BTW rule, a drive at the centre and ε = 0, every chain repeats the same orbit, so the page gives no interval.</li>');
    }
    box.innerHTML = `<ul>${out.join("")}</ul>`;
  }

  /* ---------- records ---------- */

  /** The run record: everything a replay needs, with the results. */
  function runRecord() {
    const s = app.state, sm = summary();
    return {
      format: Ph.FORMAT, version: Ph.VERSION, created: new Date().toISOString(),
      generator: { name: "Philox4x32-10", version: Rng.VERSION, streams: Rng.SCHEME, stream: "phys/<experiment>, replicate or chain i, variable v" },
      seed: s.seed, example: s.ph_example, settings: Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith("ph_") && !["ph_az", "ph_el", "ph_plot"].includes(k))), job: run?.job ?? Ph.jobOf(s),
      dynamics: run?.job?.kind === "sandpile" ? Ph.dynamics(run.job) : null, status: run?.status ?? "idle", blocks: run?.acc?.blocks ?? 0, of: run?.c?.blocks ?? 0,
      results: (sm?.rows ?? []).map((/** @type {any} */ r) => ({ quantity: r.label, estimate: r.est, lo: r.lo ?? null, hi: r.hi ?? null, interval: r.how, reference: r.reference ?? null, referenceKind: r.refHow, claims: r.tags })),
      statement: data.physics.statement,
      environment: { userAgent: navigator.userAgent },
      replay: "The same seed and settings give the same integer stream. Floating-point results can differ in the last digits between browsers.",
    };
  }

  /** Load a run record: set its example and settings, then compare the replay with it. @param {any} doc */
  function loadRun(doc) {
    if (!doc || doc.format !== Ph.FORMAT) throw new Error("The file is not a physics run record of this page.");
    if (doc.version !== Ph.VERSION) throw new Error(`The record uses version ${String(doc.version).slice(0, 10)}. This page reads version ${Ph.VERSION}.`);
    if (!data.physics.examples.some((/** @type {any} */ x) => x.id === doc.example)) throw new Error(`The record names the example "${String(doc.example).slice(0, 40)}", which this page does not have.`);
    expected = { key: "", doc };
    app.set({ ...(doc.settings ?? {}), nav: "physics", ph_example: doc.example, seed: doc.seed });
    expected.key = keyOf(app.state);
  }

  /** @param {any} sm */
  function drawReplay(sm) {
    const box = $("phys-replay");
    if (!expected) { box.textContent = ""; return; }
    if (!run || run.status !== "done" || !sm) { box.textContent = `Replay of the loaded record: ${run?.status === "running" ? "the run proceeds" : "complete the run to compare"}.`; return; }
    let same = 0, close = 0, off = 0;
    sm.rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      const e = expected.doc.results[i]?.estimate;
      if (e === r.est || (e === null && (r.est === null || r.est === undefined))) same++;
      else if (e !== null && e !== undefined && r.est !== null && Math.abs(e - r.est) <= 1e-12 * Math.max(1, Math.abs(e))) close++;
      else off++;
    });
    box.textContent = `Replay: ${same} estimates identical, ${close} equal up to the last digits, ${off} different.${off ? " A difference means that the settings or the page version differ." : ""}`;
  }

  /** The results as CSV, then the avalanche size densities of a sandpile run. */
  function resultsCsv() {
    const sm = summary(), s = app.state;
    /** @param {unknown} v */
    const cell = (v) => { const t = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const rows = [["example", "quantity", "estimate", "lo", "hi", "interval", "reference", "reference_kind", "claims", "seed"].join(",")];
    for (const r of sm?.rows ?? []) rows.push([s.ph_example, r.label, r.est, r.lo, r.hi, r.how, r.reference, r.refHow, r.tags.join(" "), s.seed].map(cell).join(","));
    if (sm?.kind === "sandpile") {
      rows.push("", ["L", "observable", "bin_centre", "density", "count"].join(","));
      for (const z of sm.sizes) for (const k of ["size", "area", "duration"]) for (const p of z[k] ?? []) rows.push([z.L, k, p.x, p.y, p.count].map(cell).join(","));
    }
    return `${rows.join("\n")}\n`;
  }

  /** Save the canvas figure as PNG, or as SVG for the 3D view. @param {"png" | "svg"} kind */
  function saveCanvas(kind) {
    const s = app.state, name = `physics-${s.ph_example}-${shownPlot(s)}`;
    if (kind === "svg") {
      if (shownPlot(s) !== "land") { $("phys-record-status").textContent = "The lattice figure saves as PNG only."; return; }
      const land = Ph.landscape(s.ph_land), surf = PP.surface(land, s.ph_az, s.ph_el, 640, 400, 2);
      save(`${name}.svg`, PP.surfaceSvg(surf, 640, 400, token("--c1"), token("--surface"), $("phys-canvas").getAttribute("aria-label") ?? "3D view"), "image/svg+xml");
      return;
    }
    $("phys-canvas").toBlob((/** @type {Blob | null} */ blob) => {
      if (!blob) { $("phys-record-status").textContent = "This browser could not draw the PNG."; return; }
      const a = document.createElement("a"), u = URL.createObjectURL(blob);
      a.href = u; a.download = `${name}.png`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
      $("phys-record-status").textContent = `Saved ${name}.png.`;
    }, "image/png");
  }

  /* ---------- report, tool and commands ---------- */

  /** @param {Record<string, any>} s */
  function report(s) {
    if (!run || run.key !== keyOf(s)) run = newRun(s);
    return Ph.report({ example: exampleOf(s), state: s, summary: summary(), status: run.status, errors: run.c.ok ? [] : run.c.errors });
  }

  const tool = {
    name: "get_physics_run",
    description: "Return the statistical-physics lab of the current view: the example, its stated dynamics and settings, the status of the run, and each result with its interval, its reference value and its claim tags (theorem, numerical approximation or finite-run observation). A finite lattice does not establish a universality class.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      if (run?.key !== keyOf(app.state)) run = newRun(app.state);
      const body = run.c.ok ? runRecord() : { errors: run.c.errors, example: app.state.ph_example };
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    },
  };

  const commands = [
    { label: "Open the statistical-physics lab", run: () => app.set({ nav: "physics" }) },
    { label: "Run the physics lab", run: () => { app.set({ nav: "physics" }); start(); } },
    { label: "Step one block of the physics lab", run: step },
    { label: "Reset the physics run", run: reset },
    { label: "Save the physics run record", run: () => save(`physics-${app.state.ph_example}-run.json`, `${JSON.stringify(runRecord(), null, 2)}\n`, "application/json") },
    ...(data?.physics?.examples ?? []).map((/** @type {any} */ x) => ({ label: `Open physics example: ${x.title}`, run: () => open(x.id) })),
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
      if (t.dataset.physOpen) open(t.dataset.physOpen, t.dataset.physExtra ? JSON.parse(t.dataset.physExtra) : {});
      else if (t.dataset.physMethod) {
        const m = data.physics.methods.find((/** @type {any} */ x) => x.id === t.dataset.physMethod);
        open(m.suitable.example, m.suitable.settings);
      }
    });
    $("phys-search").addEventListener("input", () => app.set({ q: $("phys-search").value.slice(0, 200) }, "replace"));
    $("phys-go").addEventListener("click", start);
    $("phys-step-run").addEventListener("click", step);
    $("phys-pause").addEventListener("click", pause);
    $("phys-reset").addEventListener("click", reset);
    $("phys-autorun").addEventListener("change", () => { autorun = $("phys-autorun").checked; });
    $("phys-plots").addEventListener("click", (/** @type {Event} */ e) => {
      const b = /** @type {HTMLButtonElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.("button"));
      if (b?.value) app.set({ ph_plot: b.value });
    });
    // Drag or arrow keys turn and tilt the 3D view; each change replaces the history entry.
    const cv = $("phys-canvas");
    /** @type {{ x: number, y: number, az: number, el: number } | null} */
    let drag = null;
    const clampEl = (/** @type {number} */ v) => Math.max(10, Math.min(90, Math.round(v)));
    const wrapAz = (/** @type {number} */ v) => ((Math.round(v) + 540) % 360) - 180;
    cv.addEventListener("pointerdown", (/** @type {PointerEvent} */ e) => { if (shownPlot(app.state) !== "land") return; drag = { x: e.clientX, y: e.clientY, az: app.state.ph_az, el: app.state.ph_el }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (/** @type {PointerEvent} */ e) => { if (drag) app.set({ ph_az: wrapAz(drag.az + (e.clientX - drag.x) * 0.5), ph_el: clampEl(drag.el + (e.clientY - drag.y) * 0.3) }, "replace"); });
    cv.addEventListener("pointerup", () => { drag = null; });
    cv.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
      if (shownPlot(app.state) !== "land") return;
      const d = /** @type {Record<string, number[]>} */ ({ ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] })[e.key];
      if (!d) return;
      e.preventDefault();
      app.set({ ph_az: wrapAz(app.state.ph_az + d[0]), ph_el: clampEl(app.state.ph_el + d[1]) }, "replace");
    });
    // The canvas reads the colours at draw time: redraw when the theme changes.
    const redraw = () => { if (app.state.nav === "physics") drawFigure(app.state, summary()); };
    new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", redraw);
    $("phys-save-run").addEventListener("click", () => save(`physics-${app.state.ph_example}-run.json`, `${JSON.stringify(runRecord(), null, 2)}\n`, "application/json"));
    $("phys-save-csv").addEventListener("click", () => save(`physics-${app.state.ph_example}-results.csv`, resultsCsv(), "text/csv"));
    $("phys-load-run").addEventListener("change", async () => {
      const f = $("phys-load-run").files?.[0];
      if (!f) return;
      try {
        let doc;
        try { doc = JSON.parse(await f.text()); } catch { throw new Error("The file is not JSON."); }
        loadRun(doc);
        $("phys-record-status").textContent = `Loaded ${f.name}.`;
      } catch (err) {
        $("phys-record-status").textContent = `The page did not load ${f.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
      $("phys-load-run").value = "";
    });
    $("phys-plot-svg").addEventListener("click", () => { if ($("phys-plot").hidden) saveCanvas("svg"); else hooks.saveSvg("phys-plot", `physics-${app.state.ph_example}-${shownPlot(app.state)}`); });
    $("phys-plot-png").addEventListener("click", () => { if ($("phys-plot").hidden) saveCanvas("png"); else hooks.savePng("phys-plot", `physics-${app.state.ph_example}-${shownPlot(app.state)}`); });
  }

  g.MCPhysView = { draw, bind, examples, open, key, tool, commands, report, runRecord, resultsCsv, get run() { return run; }, start, step, pause, reset };
})();
