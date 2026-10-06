/* Scientific Modelling: the stability and bifurcation panel of piece 4 (hand calculation item 9), in the browser only.
 * StabView.render draws, below the Regime Map Builder, what derive()'s stability data holds: for a declared model the
 * exact base-state and perturbation checks, the eigenvalue problem with the neutral curve and the box modes, the
 * branch diagram with the published points, the amplitude equation and the classification with its checks, and the
 * search coverage; for the radiation models the equilibrium, the transient or the exact network; for a custom ODE
 * system the equilibria, the bifurcation diagram with its folds, branch points and Hopf points, the regions of
 * multiple stable states and, with two control parameters, the fold curves and the cusp. Every figure is an SVG at
 * the measured width of its container, and every value it draws is also in a table or a list beside it.
 */
(function () {
  "use strict";

  const SVG = "http://www.w3.org/2000/svg";
  /** @type {any} */
  let H = null;
  /** @param {string} id @returns {any} */
  const byId = (id) => document.getElementById(id);
  /** @param {number | null | undefined} x */
  function fmt(x) {
    if (x === null || x === undefined || !Number.isFinite(x)) return "–";
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e6) return String(Number(x.toPrecision(5)));
    const [m, e] = x.toExponential(2).split("e");
    return `${Number(m)}×10^${Number(e)}`;
  }
  /** @param {string} tag @param {Record<string, any>} attrs @param {string} [text] */
  function el(tag, attrs = {}, text) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* ---------- a small plot ---------- */

  /** @param {any} ax @param {number} a @param {number} b */
  function scale(ax, a, b) {
    const u = (/** @type {number} */ v) => (ax.log ? Math.log10(v) : v);
    const u0 = u(ax.min), u1 = u(ax.max);
    return (/** @type {number} */ v) => a + ((u(v) - u0) / (u1 - u0)) * (b - a);
  }
  /** @param {any} ax */
  function ticks(ax) {
    if (ax.log) {
      const out = [];
      for (let k = Math.ceil(Math.log10(ax.min) - 1e-9); k <= Math.floor(Math.log10(ax.max) + 1e-9); k++) out.push(10 ** k);
      return out;
    }
    const span = ax.max - ax.min, step0 = span / 5, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= step0) ?? step0;
    const out = [];
    for (let v = Math.ceil(ax.min / step - 1e-9) * step; v <= ax.max + 1e-9; v += step) out.push(Number(v.toPrecision(6)));
    return out;
  }
  /**
   * Draw a plot into host. spec: { x, y (axes: min, max, log, label), series [{ pts, stroke, dash, width, label }],
   * points [{ x, y, r, fill, stroke, shape, label }], bands [{ x0, x1, label }], aria }.
   * @param {HTMLElement} host @param {any} spec
   */
  function plot(host, spec) {
    const W = Math.max(300, Math.round(host.clientWidth || 600));
    const box = { l: W < 480 ? 52 : 66, r: 14, t: 10, w: 0, h: Math.round(Math.min(300, Math.max(190, W * 0.45))) };
    box.w = W - box.l - box.r;
    const Hh = box.t + box.h + 42;
    const svg = el("svg", { class: "chart", viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img", "aria-label": spec.aria });
    const sx = scale(spec.x, box.l, box.l + box.w), sy = scale(spec.y, box.t + box.h, box.t);
    const inside = (/** @type {number} */ x, /** @type {number} */ y) => x >= spec.x.min && x <= spec.x.max && y >= spec.y.min && y <= spec.y.max;
    const grid = el("g", { class: "grid" }), tick = el("g", { class: "tick" }), axis = el("g", { class: "axis" });
    for (const v of ticks(spec.x)) { const x = sx(v); grid.append(el("line", { x1: x, x2: x, y1: box.t, y2: box.t + box.h })); tick.append(el("text", { x, y: box.t + box.h + 15, "text-anchor": "middle" }, fmt(v))); }
    for (const v of ticks(spec.y)) { const y = sy(v); grid.append(el("line", { x1: box.l, x2: box.l + box.w, y1: y, y2: y })); tick.append(el("text", { x: box.l - 5, y: y + 4, "text-anchor": "end" }, fmt(v))); }
    axis.append(el("line", { x1: box.l, x2: box.l + box.w, y1: box.t + box.h, y2: box.t + box.h }), el("line", { x1: box.l, x2: box.l, y1: box.t, y2: box.t + box.h }));
    svg.append(grid);
    for (const b of spec.bands ?? []) {
      const x0 = sx(Math.max(spec.x.min, b.x0)), x1 = sx(Math.min(spec.x.max, b.x1));
      const r = el("rect", { x: x0, y: box.t, width: Math.max(1, x1 - x0), height: box.h, fill: b.fill ?? "var(--c3)", "fill-opacity": 0.12 });
      r.append(el("title", {}, b.label));
      svg.append(r);
    }
    svg.append(axis, tick);
    svg.append(el("text", { class: "axis-title", x: box.l + box.w / 2, y: box.t + box.h + 34, "text-anchor": "middle" }, `${spec.x.label}${spec.x.log ? " (log)" : ""}`));
    svg.append(el("text", { class: "axis-title", transform: `translate(12 ${box.t + box.h / 2}) rotate(-90)`, "text-anchor": "middle" }, `${spec.y.label}${spec.y.log ? " (log)" : ""}`));
    const lines = el("g");
    for (const s of spec.series ?? []) {
      let d = "", pen = false;
      for (const [x, y] of s.pts) {
        if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y) || !inside(x, y)) { pen = false; continue; }
        d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
        pen = true;
      }
      if (d) lines.append(el("path", { d, class: "series", stroke: s.stroke ?? "var(--c1)", "stroke-dasharray": s.dash ?? null, "stroke-width": s.width ?? 2 }));
    }
    svg.append(lines);
    const marks = el("g");
    for (const p of spec.points ?? []) {
      if (!inside(p.x, p.y)) continue;
      const cx = sx(p.x), cy = sy(p.y), r = p.r ?? 4;
      const m = p.shape === "diamond" ? el("rect", { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, transform: `rotate(45 ${cx} ${cy})`, fill: p.fill ?? "var(--fg)", stroke: p.stroke ?? "var(--bg)", "stroke-width": 1.5 })
        : p.shape === "square" ? el("rect", { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, fill: p.fill ?? "none", stroke: p.stroke ?? "var(--fg)", "stroke-width": 1.5 })
          : el("circle", { cx, cy, r, fill: p.fill ?? "var(--fg)", stroke: p.stroke ?? "var(--bg)", "stroke-width": 1.5 });
      if (p.label) m.append(el("title", {}, p.label));
      marks.append(m);
      if (p.text) marks.append(el("text", { x: cx + r + 3, y: cy - r - 2, class: "direct-label" }, p.text));
    }
    svg.append(marks);
    host.replaceChildren(svg);
  }
  /** A legend as HTML: swatches with their meanings. @param {{ cls: string, text: string }[]} items */
  const legend = (items) => `<ul class="st-legend">${items.map((i) => `<li><span class="key ${i.cls}"></span>${H.esc(i.text)}</li>`).join("")}</ul>`;
  const range = (vals, pad = 0.05, log = false) => {
    const v = vals.filter((x) => Number.isFinite(x) && (!log || x > 0));
    let a = Math.min(...v), b = Math.max(...v);
    if (log) return { min: 10 ** Math.floor(Math.log10(a)), max: 10 ** Math.ceil(Math.log10(b)) };
    if (a === b) { a -= 1; b += 1; }
    const p = (b - a) * pad;
    return { min: a - p, max: b + p };
  };

  /* ---------- the panel ---------- */

  /** @param {Record<string, any>} state @param {any} d */
  function render(state, d) {
    const host = byId("stability-panel");
    const { esc, chip } = H;
    const st = d.stability;
    if (d.confirmedVersion === null || !st) { host.innerHTML = ""; return; }
    if (!st.ready) {
      if (st.reason === "none") { host.innerHTML = ""; return; }
      host.innerHTML = `<h3>Hand calculation 9: stability and bifurcation</h3><div class="callout ${st.reason === "not-applicable" ? "" : "bad"}"><p>${st.reason === "not-applicable" ? "" : `${chip("unresolved")} `}${esc(st.message)}</p>${st.next ? `<p class="next">Next: ${esc(st.next)}</p>` : ""}</div>`;
      return;
    }
    const results = d.results.filter((/** @type {any} */ r) => r.id.startsWith("r-st-"));
    const list = `<ul class="result-list">${results.map((/** @type {any} */ r) => `<li class="${r.valid ? "" : "stale"}">${chip(r.status)} <span class="title">${esc(r.title)}</span>${r.tolerance ? ` <span class="note">Tolerance: ${esc(r.tolerance)}.</span>` : ""}${r.next ? `<span class="next">Next: ${esc(r.next)}</span>` : ""}</li>`).join("")}</ul>`;
    if (st.kind === "custom") { custom(host, st, list); return; }
    const an = st.analysis;
    const head = `<h3>Hand calculation 9: stability and bifurcation</h3><p class="note">${esc(st.declaration.title)}. ${an ? `Concept: ${esc(an.concept)}.` : ""} Stability: ${esc(st.methods.stability.reason)} Bifurcation: ${esc(st.methods.bifurcation.reason)}</p>`;
    const exact = exactBlock(st.exact);
    if (an?.family === "buoyancy-convection") box(host, head, exact, an, list);
    else if (an?.model === "lumped-radiation") lumped(host, head, exact, an, list);
    else if (an?.model === "surface-radiation") surface(host, head, an, list);
    else host.innerHTML = `${head}${exact}${list}`;
  }

  /** The exact checks: base state, perturbation equations, symmetry and Jacobian. @param {any} ex */
  function exactBlock(ex) {
    if (!ex) return "";
    const { esc, chip, td, ti } = H;
    const parts = [];
    if (ex.base) {
      parts.push(`<p>${chip(ex.base.ok ? "exact" : "unresolved")} Base state ${ex.base.state.map((/** @type {any} */ b) => ti(`${texName(b.field)}=${b.tex}`)).join(", ")}${ex.base.relation ? ` with ${esc(ex.base.relation)}` : ""}: every residual is 0 in ${ex.base.equations.length} equation${ex.base.equations.length > 1 ? "s" : ""} and ${ex.base.conditions.length} condition${ex.base.conditions.length === 1 ? "" : "s"}.</p>`);
      parts.push(`<details class="step-section" data-section><summary>Perturbation equations (order ε)</summary>${ex.perturbation.map((/** @type {any} */ p) => `<p class="ids">${esc(p.of)}</p>${td(`${p.linear}=0`)}${p.nonlinear !== "0" ? `<p class="note">Dropped terms of order ε²:</p>${td(p.nonlinear)}` : ""}`).join("")}</details>`);
    }
    if (ex.symmetry) parts.push(`<p>${chip(ex.symmetry.ok ? "exact" : "unresolved")} The dimensionless equations are invariant under ${esc(ex.symmetry.text)}.</p>`);
    if (ex.jacobian) parts.push(`<p>${chip(ex.jacobian.ok ? "exact" : "unresolved")} ${ti(`f=${ex.jacobian.rhsTex}`)}, so ${ti(`\\partial f/\\partial ${texName(ex.jacobian.field)}=${ex.jacobian.tex}`)}.</p>`);
    return parts.join("");
  }
  /** @param {string} n */
  const texName = (n) => ({ theta: "\\theta", Psi: "\\Psi", Omega: "\\Omega" })[n] ?? n;

  /** Buoyancy convection: modes, neutral curve, branch, field, amplitude equation. @param {HTMLElement} host @param {string} head @param {string} exact @param {any} an @param {string} list */
  function box(host, head, exact, an, list) {
    const { esc, ti } = H;
    const br = an.branch;
    host.innerHTML = `${head}${exact}
      <h4>Eigenvalue problem</h4>
      <p>Normal modes ${ti("e^{\\sigma\\tau+iaX}")} of the box have ${ti("a=n\\pi/\\Gamma")}. The least stable is mode n = ${an.box.n}: onset at ${ti(`Ra_c(\\Gamma)=${fmt(an.box.Ra)}`)}. At Ra = ${fmt(an.point.Ra)} its largest growth rate is ${ti(`\\sigma_1=${fmt(an.lead.re)}`)} (residual ${an.lead.residual.toExponential(1)}).</p>
      <figure class="st-figure"><div id="st-neutral" class="st-plot"></div><figcaption class="note">The line is the neutral curve Ra(a) of the unbounded layer. The diamond is its minimum Ra_c = ${fmt(an.critical.at(-1).Ra)} at a_c = ${an.critical.at(-1).a.toFixed(4)}. The circles are the wavenumbers nπ/Γ of the box, and the square is the record's point. Above the curve the conductive state is unstable.</figcaption></figure>
      <div class="scroll"><table class="data"><caption>Box modes at Ra = ${fmt(an.point.Ra)}</caption><thead><tr><th scope="col">n</th><th scope="col">a = nπ/Γ</th><th scope="col">Neutral Ra</th><th scope="col">Largest σ</th></tr></thead><tbody>${an.box.modes.map((/** @type {any} */ m) => `<tr><td class="num">${m.n}</td><td class="num">${fmt(m.a)}</td><td class="num">${fmt(m.Ra)}</td><td class="num">${fmt(m.sigma)}</td></tr>`).join("")}</tbody></table></div>
      <figure class="st-figure"><div id="st-mode" class="st-plot"></div><figcaption class="note">The neutral mode of n = ${an.box.n}: vertical velocity W(z) (blue) and temperature Θ(z) (orange), each scaled to 1.</figcaption></figure>
      ${br && br.ok ? `<h4>Roll branch and bifurcation</h4>
      <figure class="st-figure"><div id="st-branch" class="st-plot"></div><figcaption class="note">Nu against Ra. The conductive state has Nu = 1: solid where it is stable, dashed where it is unstable. The blue line is the computed roll branch${br.compare.length ? ", and the open circles are Table 1S of Wen, Goluskin and Doering" : ""}. The dotted line is the slope of the amplitude equation at onset, and the square is the record's Ra.</figcaption></figure>
      ${br.field ? `<figure class="st-figure"><div id="st-field" class="st-field"></div><figcaption class="note">Temperature T = (T_dim − T_c)/ΔT of the steady rolls at Ra = ${fmt(br.record ? br.record.Ra : br.points.at(-1).Ra)}, one period 0 ≤ X < 2π/a: cold (0) to hot (1).</figcaption></figure>` : ""}
      ${br.compare.length ? `<details class="step-section" data-section><summary>Comparison with Table 1S (${br.compare.length} values of Ra)</summary><div class="scroll"><table class="data"><thead><tr><th scope="col">Ra</th><th scope="col">Nu (page)</th><th scope="col">Nu (Table 1S)</th><th scope="col">Relative difference</th><th scope="col">Re (page)</th><th scope="col">Re (Table 1S)</th></tr></thead><tbody>${br.compare.map((/** @type {any} */ c) => `<tr><td class="num">${fmt(c.Ra)}</td><td class="num">${c.Nu.toFixed(6)}</td><td class="num">${c.ref.toFixed(6)}</td><td class="num">${c.rel.toExponential(1)}</td><td class="num">${c.Re.toFixed(4)}</td><td class="num">${c.refRe.toFixed(4)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      <p>Amplitude equation (stationary part): ${ti(`g_1(Ra-Ra_c)A+g_3A^3=0,\\quad g_3/g_1=${fmt(br.amplitude.ratio)}`)}. ${br.amplitude.supercritical ? "The roll branch starts above onset: a supercritical pitchfork." : "The roll branch starts below onset."} Onset slope ${ti(`dNu/d\\varepsilon=${fmt(br.amplitude.slope)}`)}.</p>` : `<p class="bad">${esc(br?.reason ?? "The roll branch did not compute.")}</p>`}
      <h4>Results</h4>${list}`;
    plot(byId("st-neutral"), {
      aria: `Neutral curve of the layer: Ra against the wavenumber a, with the minimum Ra_c = ${fmt(an.critical.at(-1).Ra)} and the box modes.`,
      x: { min: 0.5, max: 10, log: false, label: "wavenumber a" }, y: { min: 1000, max: 30000, log: true, label: "Ra" },
      series: [{ pts: an.curve, stroke: "var(--c1)" }],
      points: [{ x: an.critical.at(-1).a, y: an.critical.at(-1).Ra, shape: "diamond", label: `Unbounded layer: Ra_c = ${fmt(an.critical.at(-1).Ra)}` },
        ...an.box.modes.map((/** @type {any} */ m) => ({ x: m.a, y: m.Ra, r: 4, fill: "var(--bg)", stroke: "var(--fg)", label: `Box mode n = ${m.n}: Ra = ${fmt(m.Ra)}` })),
        { x: an.box.a, y: an.point.Ra, shape: "square", stroke: "var(--hl)", label: `Record: Ra = ${fmt(an.point.Ra)}` }],
    });
    plot(byId("st-mode"), {
      aria: "The neutral mode: W(z) and Θ(z) across the layer.", x: { min: 0, max: 1, label: "height z/H" }, y: { min: -0.1, max: 1.1, label: "scaled amplitude" },
      series: [{ pts: an.shape.z.map((/** @type {number} */ z, /** @type {number} */ i) => [z, an.shape.W[i]]), stroke: "var(--c1)" }, { pts: an.shape.z.map((/** @type {number} */ z, /** @type {number} */ i) => [z, an.shape.Theta[i]]), stroke: "var(--c2)" }],
    });
    if (br && br.ok) {
      const maxRa = Math.max(...br.points.map((/** @type {any} */ p) => p.Ra));
      const xax = { min: 1000, max: maxRa * 1.25, log: true, label: "Ra" };
      const nuMax = Math.max(...br.points.map((/** @type {any} */ p) => p.Nu));
      plot(byId("st-branch"), {
        aria: `Bifurcation diagram: Nu against Ra. The rolls branch from Nu = 1 at Ra = ${fmt(br.Ran)}.`, x: xax, y: { min: 0.8, max: Math.ceil(nuMax * 2) / 2, label: "Nu" },
        series: [{ pts: [[1000, 1], [br.Ran, 1]], stroke: "var(--fg)" }, { pts: [[br.Ran, 1], [xax.max, 1]], stroke: "var(--fg)", dash: "6 4" },
          { pts: [[br.Ran, 1], ...br.points.map((/** @type {any} */ p) => [p.Ra, p.Nu])], stroke: "var(--c1)" },
          { pts: [[br.Ran, 1], [br.Ran * 1.25, 1 + br.amplitude.slope * 0.25]], stroke: "var(--muted)", dash: "2 3", width: 1.5 }],
        points: [...br.compare.map((/** @type {any} */ c) => ({ x: c.Ra, y: c.ref, r: 3.5, fill: "var(--bg)", stroke: "var(--fg)", label: `Table 1S: Ra = ${fmt(c.Ra)}, Nu = ${c.ref}` })),
          { x: br.Ran, y: 1, shape: "diamond", label: `Supercritical pitchfork at Ra = ${fmt(br.Ran)}` },
          ...(br.record ? [{ x: br.record.Ra, y: br.record.Nu, shape: "square", stroke: "var(--hl)", label: `Record: Nu = ${fmt(br.record.Nu)}` }] : [])],
      });
      if (br.field) field(byId("st-field"), br.field);
    }
  }

  /** An RGB triple from a colour token such as #2a78d6. @param {string} name */
  function token(name) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [128, 128, 128];
  }
  /**
   * A temperature field as an image: one pixel per grid point, top row first, scaled smoothly by the browser.
   * Cold (0) is the first data colour, hot (1) the second, and 1/2 the background.
   * @param {HTMLElement} host @param {any} f
   */
  function field(host, f) {
    const nx = f.xs.length, nz = f.zs.length;
    const cold = token("--c1"), hot = token("--c2"), bg = token("--bg");
    const canvas = document.createElement("canvas");
    canvas.width = nx;
    canvas.height = nz;
    canvas.className = "st-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Temperature of the steady rolls over one period: hot plumes rise and cold plumes sink.");
    const g = canvas.getContext("2d");
    if (g) {
      const img = g.createImageData(nx, nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const t = Math.max(0, Math.min(1, f.T[i][j]));
        const c = t >= 0.5 ? hot : cold, w = Math.min(1, Math.abs(t - 0.5) * 2);
        const k = 4 * (j * nx + i);
        for (let q = 0; q < 3; q++) img.data[k + q] = Math.round(bg[q] + w * (c[q] - bg[q]));
        img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    host.replaceChildren(canvas);
  }

  /** The lumped body: equilibrium and transient. @param {HTMLElement} host @param {string} head @param {string} exact @param {any} an @param {string} list */
  function lumped(host, head, exact, an, list) {
    const { ti } = H;
    const e = an.equilibrium;
    host.innerHTML = `${head}${exact}<h4>Equilibrium and linearization</h4>
      <p>${ti(`\\theta^{*}=(1+q)^{1/4}=${fmt(e.theta)}`)}, ${ti(`f'(\\theta^{*})=-4\\theta^{*3}=${fmt(e.eigenvalue)}`)}: the equilibrium is linearly stable with the time constant ${ti(`1/(4\\theta^{*3})=${fmt(e.timeConstant)}`)}${e.timeConstantSeconds !== null ? ` (${fmt(e.timeConstantSeconds)} s)` : ""}.</p>
      <figure class="st-figure"><div id="st-transient" class="st-plot"></div><figcaption class="note">θ(τ) from θ_i = ${fmt(an.point.theta_i)}: the closed form (blue), the linearized decay (orange, dashed) and the equilibrium θ* (grey).</figcaption></figure>
      <h4>Results</h4>${list}`;
    const tr = an.transient;
    plot(byId("st-transient"), {
      aria: "Temperature ratio against time: the closed form, the linearized decay and the equilibrium.", x: { min: 0, max: tr.tau.at(-1), label: "τ" },
      y: { ...range([...tr.exact, ...tr.linear, e.theta], 0.08), label: "θ = T/T_e" }, series: [{ pts: tr.tau.map((/** @type {number} */ t, /** @type {number} */ i) => [t, tr.exact[i]]), stroke: "var(--c1)" }, { pts: tr.tau.map((/** @type {number} */ t, /** @type {number} */ i) => [t, tr.linear[i]]), stroke: "var(--c2)", dash: "6 4" }, { pts: [[0, e.theta], [tr.tau.at(-1), e.theta]], stroke: "var(--faint)", width: 1.5 }],
    });
  }

  /** The duct: view factors, radiosities and checks. @param {HTMLElement} host @param {string} head @param {any} an @param {string} list */
  function surface(host, head, an, list) {
    const { esc, ti } = H;
    if (!an.ok) { host.innerHTML = `${head}<p class="bad">${esc(an.reason)}</p>${list}`; return; }
    const v = an.viewFactors;
    host.innerHTML = `${head}<h4>Radiation network</h4>
      ${v ? `<p>Crossed strings for W = ${v.W}, H = ${v.H}, diagonal ${v.d}: ${ti(`F_{12}=${v.F12}`)}, ${ti(`F_{1R}=${v.F1R}`)}, ${ti(`F_{R1}=${v.FR1}`)}, ${ti(`F_{RR}=${v.FRR}`)}.</p>` : ""}
      <div class="scroll"><table class="data"><caption>Exact solution in units of σT₁⁴, with θ₂ = T₂/T₁ = ${esc(an.theta2)}</caption><thead><tr><th scope="col">Quantity</th><th scope="col">Exact</th><th scope="col">Decimal</th></tr></thead><tbody>
        ${["j_1", "j_2", "j_R"].map((n, i) => `<tr><td>${ti(n.replace("_", "_{") + "}")}</td><td class="num">${esc(an.j[i])}</td><td class="num">${fmt(Number(an.j[i].split("/")[0]) / Number(an.j[i].split("/")[1] ?? 1))}</td></tr>`).join("")}
        <tr><td>${ti("q_1^{*}")}</td><td class="num">${esc(an.q1)}</td><td class="num">${fmt(an.q1float)}</td></tr><tr><td>${ti("q_2^{*}")}</td><td class="num">${esc(an.q2)}</td><td class="num">${fmt(-an.q1float)}</td></tr></tbody></table></div>
      <p>${an.q1dim !== null ? `With σ, the floor loses ${ti(`q_1=${fmt(an.q1dim)}\\ \\mathrm{W/m^2}`)}. ` : ""}The side walls, which reradiate, settle at ${fmt(an.sideWallTemperature)} K.</p>
      <h4>Results</h4>${list}`;
  }

  /** A custom ODE system. @param {HTMLElement} host @param {any} st @param {string} list */
  function custom(host, st, list) {
    const { esc, td } = H;
    const an = st.analysis;
    const sp = an.branches.flatMap((/** @type {any} */ b) => b.special);
    host.innerHTML = `<h3>Hand calculation 9: stability and bifurcation of the custom ODE system</h3>
      <p class="note">The page analyses the equations as entered. It makes no physical claim about a custom system.</p>
      ${an.f.map((/** @type {any} */ f) => td(`\\frac{d${texName(f.state)}}{d${an.time}}=${f.tex}`)).join("")}
      <details class="step-section" data-section><summary>The exact Jacobian</summary>${td(`J=\\begin{pmatrix}${an.jacobian.map((/** @type {any[]} */ r) => r.map((x) => x.tex).join("&")).join("\\\\")}\\end{pmatrix}`)}</details>
      <h4>Equilibria at ${esc(an.control)} = ${fmt(an.values[an.control])}</h4>
      <div class="scroll"><table class="data"><thead><tr><th scope="col">#</th><th scope="col">${esc(an.states.join(", "))}</th><th scope="col">Eigenvalues</th><th scope="col">Stability</th></tr></thead><tbody>${an.equilibria.map((/** @type {any} */ e, /** @type {number} */ i) => `<tr><td class="num">${i + 1}</td><td class="num">${e.x.map(fmt).join(", ")}</td><td class="num">${[...new Set(e.eigenvalues.map((/** @type {any} */ v) => (v.im ? `${fmt(v.re)} ± ${fmt(Math.abs(v.im))}i` : fmt(v.re))))].join(", ")}</td><td>${esc(e.type)}</td></tr>`).join("")}</tbody></table></div>
      <h4>Continuation in ${esc(an.control)}</h4>
      <figure class="st-figure"><div id="st-ode-branches" class="st-plot"></div><figcaption class="note">${esc(an.states[0])} against ${esc(an.control)}. Solid lines are stable equilibria and dashed lines unstable ones. Diamonds are folds, squares branch points and circles Hopf points. The shaded intervals have two or more stable equilibria.</figcaption></figure>
      <div class="scroll"><table class="data"><caption>Special points</caption><thead><tr><th scope="col">Point</th><th scope="col">${esc(an.control)}</th><th scope="col">${esc(an.states.join(", "))}</th><th scope="col">Checks</th></tr></thead><tbody>${sp.map((/** @type {any} */ s) => `<tr><td>${esc(s.label)}</td><td class="num">${fmt(s.mu)}</td><td class="num">${s.x.map(fmt).join(", ")}</td><td>${esc(s.text)}</td></tr>`).join("")}</tbody></table></div>
      ${an.two ? `<h4>Two parameters: ${esc(an.control)} and ${esc(an.control2)}</h4><figure class="st-figure"><div id="st-ode-two" class="st-plot"></div><figcaption class="note">The shade gives the number of linearly stable equilibria at each grid point. No shade means one, violet means two, and grey means none in the search box. The lines are the fold curves, and the diamond is the cusp.</figcaption></figure>` : ""}
      <h4>Results</h4>${list}`;
    const pts = an.branches.flatMap((/** @type {any} */ b) => b.points);
    const xs = { min: an.range[0], max: an.range[1], label: an.control };
    const first = pts.map((/** @type {any} */ p) => p.x[0]);
    const lo = Math.min(...first), hi = Math.max(...first);
    // A positive state that spans more than two decades reads better on a logarithmic axis.
    const ys = { ...(lo > 0 && hi / lo > 100 ? range(first, 0, true) : range(first, 0.06)), log: lo > 0 && hi / lo > 100, label: an.states[0] };
    const series = [];
    for (const b of an.branches) {
      let run = [], stable = null;
      for (const p of b.points) {
        if (stable !== null && p.stable !== stable) { run.push([p.mu, p.x[0]]); series.push({ pts: run, stroke: stable ? "var(--c1)" : "var(--c2)", dash: stable ? null : "6 4" }); run = []; }
        stable = p.stable;
        run.push([p.mu, p.x[0]]);
      }
      if (run.length > 1) series.push({ pts: run, stroke: stable ? "var(--c1)" : "var(--c2)", dash: stable ? null : "6 4" });
    }
    plot(byId("st-ode-branches"), {
      aria: `Bifurcation diagram of ${an.states[0]} against ${an.control}, with ${sp.length} special points.`, x: xs, y: ys, series,
      bands: an.multistable.map((/** @type {number[]} */ m) => ({ x0: m[0], x1: m[1], label: "two or more stable equilibria" })),
      points: sp.map((/** @type {any} */ s) => ({ x: s.mu, y: s.x[0], shape: s.kind === "fold" ? "diamond" : s.kind === "branch-point" ? "square" : "circle", r: 4.5, fill: s.kind === "hopf" ? "var(--hl)" : undefined, label: `${s.label}: ${an.control} = ${fmt(s.mu)}` })),
    });
    if (an.two) {
      const host2 = byId("st-ode-two");
      const g = an.two.grid;
      plot(host2, {
        aria: `Two-parameter diagram in ${an.control} and ${an.control2}: the region with two stable equilibria between the fold curves, ending at the cusp.`,
        x: { min: an.range[0], max: an.range[1], label: an.control }, y: { min: an.range2[0], max: an.range2[1], label: an.control2 },
        series: an.two.curves.map((/** @type {any} */ c) => ({ pts: c.points, stroke: "var(--fg)" })),
        points: an.two.curves.flatMap((/** @type {any} */ c) => c.cusps.map((/** @type {any} */ k) => ({ x: k.mu, y: k.mu2, shape: "diamond", r: 5, label: `Cusp: ${an.control} = ${fmt(k.mu)}, ${an.control2} = ${fmt(k.mu2)}` }))),
      });
      // The counts as cells under the curves.
      const svg = host2.querySelector("svg");
      if (svg) {
        const W = Number(svg.getAttribute("width")), Hh = Number(svg.getAttribute("height"));
        const l = W < 480 ? 52 : 66, r = 14, t = 10, h = Hh - 42 - t, w = W - l - r;
        const cells = el("g");
        const nx = g.xs.length, ny = g.ys.length;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const c = g.counts[j * nx + i];
          if (c === 1) continue;
          const x0 = l + (w * (i - 0.5)) / (nx - 1), y0 = t + h - (h * (j + 0.5)) / (ny - 1);
          const rect = el("rect", { x: Math.max(l, x0), y: Math.max(t, y0), width: w / (nx - 1), height: h / (ny - 1), fill: c >= 2 ? "var(--c3)" : "var(--faint)", "fill-opacity": c >= 2 ? 0.22 : 0.3 });
          rect.append(el("title", {}, c >= 2 ? `${c} stable equilibria` : "no stable equilibrium in the search box"));
          cells.append(rect);
        }
        svg.insertBefore(cells, svg.children[1] ?? null);
      }
    }
  }

  /** @param {any} a @param {any} helpers */
  function bind(a, helpers) { H = { ...helpers, app: a }; }

  /** @type {any} */ (window).StabView = { render, bind, legend, fmt };
})();
