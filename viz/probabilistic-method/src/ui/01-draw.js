/* Page part 1: drawing. Every renderer turns one evaluated state into SVG text plus a plain-language summary.
 * Colour never carries meaning alone: red edges are solid and blue dashed, bad marks carry ×, survivors ✓, selections are filled. */
// The page reaches the engine through PM only: the build gives the engine and the page separate scopes.
const esc = PM.escapeHtml, f = PM.fmt, T = PM.texToText;
/** @typedef {[number, number]} XY a point on the drawing */
const svgOpen = (/** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ label) => `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">`;
const circlePos = (/** @type {number} */ n, /** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ R, start = -Math.PI / 2) => Array.from({ length: n }, (_, i) => /** @type {XY} */ ([cx + R * Math.cos(start + (2 * Math.PI * i) / n), cy + R * Math.sin(start + (2 * Math.PI * i) / n)]));
const line = (/** @type {readonly number[]} */ a, /** @type {readonly number[]} */ b, /** @type {string} */ cls, extra = "") => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" class="${cls}" ${extra}/>`;
const dot = (/** @type {readonly number[]} */ p, /** @type {number} */ r, /** @type {string} */ cls, extra = "") => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r}" class="${cls}" ${extra}/>`;
const text = (/** @type {number} */ x, /** @type {number} */ y, /** @type {unknown} */ s, cls = "lbl", anchor = "middle") => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;
const cross = (/** @type {readonly number[]} */ p, /** @type {number} */ s, cls = "red") => `<path d="M${p[0] - s},${p[1] - s}L${p[0] + s},${p[1] + s}M${p[0] - s},${p[1] + s}L${p[0] + s},${p[1] - s}" class="${cls}" stroke-width="2"/>`;
const scale = (/** @type {number} */ d0, /** @type {number} */ d1, /** @type {number} */ r0, /** @type {number} */ r1) => (/** @type {number} */ x) => r0 + ((x - d0) / (d1 - d0 || 1)) * (r1 - r0);

/* A small line chart: series of [x, y] points, optional vertical markers and a shaded band. */
/**
 * @typedef {{ pts: number[][], dots?: boolean, fill?: string, cls?: string, width?: number, dash?: string, label?: string }} Series
 * @typedef {{ x?: number, y?: number, point?: number[], cls?: string, dash?: string, fill?: string, label?: string }} Marker
 * @typedef {{ from: number, to: number, label?: string }} Band
 */
/**
 * @param {{ w?: number, h?: number, x0: number, x1: number, y0: number, y1: number, series?: Series[], markers?: Marker[], bands?: Band[], xlabel?: string, ylabel?: string, title?: string, logY?: boolean }} chart
 */
function lineChart({ w = 600, h = 220, x0, x1, y0, y1, series = [], markers = [], bands = [], xlabel = "", ylabel = "", title = "", logY = false }) {
  const L = 48, R = 14, Tp = title ? 24 : 12, Bm = 34, yv = (/** @type {number} */ v) => (logY ? Math.log10(Math.max(v, 1e-12)) : v);
  const sx = scale(x0, x1, L, w - R), sy = scale(yv(y0), yv(y1), h - Bm, Tp);
  let s = svgOpen(w, h, title || ylabel) + (title ? text(L, 15, title, "ttl", "start") : "");
  for (const b of bands) s += `<rect x="${sx(b.from).toFixed(1)}" y="${Tp}" width="${Math.max(1, sx(b.to) - sx(b.from)).toFixed(1)}" height="${h - Bm - Tp}" class="fmuted" opacity=".12"/>` + text((sx(b.from) + sx(b.to)) / 2, Tp + 11, b.label || "", "lbl");
  s += line([L, h - Bm], [w - R, h - Bm], "axis") + line([L, Tp], [L, h - Bm], "axis");
  const yt = logY ? [y0, y1] : [y0, (y0 + y1) / 2, y1];
  for (const v of yt) s += text(L - 6, sy(yv(v)) + 4, f(v, 3), "lbl", "end");
  for (const v of [x0, (x0 + x1) / 2, x1]) s += text(sx(v), h - Bm + 15, f(v, 3), "lbl");
  if (xlabel) s += text((L + w - R) / 2, h - 4, xlabel, "lbl");
  if (ylabel) s += `<text transform="translate(12 ${(Tp + h - Bm) / 2}) rotate(-90)" class="lbl" text-anchor="middle">${esc(ylabel)}</text>`;
  for (const se of series) {
    const pts = se.pts.filter((p) => Number.isFinite(p[1]) && (!logY || p[1] > 0));
    if (!pts.length) continue;
    if (se.dots) for (const p of pts) s += dot([sx(p[0]), sy(yv(p[1]))], 3, se.fill || "fink");
    else s += `<polyline fill="none" points="${pts.map((p) => `${sx(p[0]).toFixed(1)},${sy(yv(p[1])).toFixed(1)}`).join(" ")}" class="${se.cls || "ink"}" stroke-width="${se.width || 1.6}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ""}/>`;
    if (se.label) { const p = pts[pts.length - 1]; s += text(sx(p[0]) - 4, sy(yv(p[1])) - 6, se.label, "lbl", "end"); }
  }
  for (const m of markers) {
    if (m.x !== undefined) s += line([sx(m.x), Tp], [sx(m.x), h - Bm], m.cls || "ink", `stroke-dasharray="${m.dash || "4 3"}"`) + (m.label ? text(sx(m.x) + 4, Tp + 22, m.label, "lbl", "start") : "");
    if (m.y !== undefined) s += line([L, sy(yv(m.y))], [w - R, sy(yv(m.y))], m.cls || "ink", `stroke-dasharray="${m.dash || "4 3"}"`) + (m.label ? text(w - R - 2, sy(yv(m.y)) - 4, m.label, "lbl", "end") : "");
    if (m.point) s += dot([sx(m.point[0]), sy(yv(m.point[1]))], 5, m.fill || "fyellow", 'stroke="var(--strong)"') + (m.label ? text(sx(m.point[0]) + 8, sy(yv(m.point[1])) - 6, m.label, "lbl", "start") : "");
  }
  return s + "</svg>";
}
/* Histogram with the stated trial count, an optional mean line and an optional overlay PMF (expected counts). */
/**
 * @param {Histogram} hist
 * @param {{ mean?: number | null, meanLabel?: string, pmf?: number[] | null, w?: number, h?: number, event?: ((b: Bin) => boolean) | null }} [options]
 */
function histogramChart(hist, { mean = null, meanLabel = "E", pmf = null, w = 600, h = 200, event = null } = {}) {
  const bins = hist.bins; if (!bins.length) return "";
  const L = 40, R = 10, Tp = 18, Bm = 30, maxC = Math.max(...bins.map((b) => b.count), ...(pmf ? bins.map((b) => (pmf[b.x0] || 0) * hist.N) : [0]), 1);
  const lo = bins[0].x0, hi = bins[bins.length - 1].x1, sx = scale(lo, hi, L, w - R), sy = scale(0, maxC, h - Bm, Tp);
  let s = svgOpen(w, h, `Histogram of ${hist.N} trials`) + text(L, 12, `${f(hist.N)} trials`, "lbl", "start");
  bins.forEach((b) => {
    const x = sx(b.x0) + 1, bw = Math.max(1, sx(b.x1) - sx(b.x0) - 2), y = sy(b.count), hit = event && event(b);
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(h - Bm - y).toFixed(1)}" class="${hit ? "fyellow" : "fink"}" opacity="${hit ? 0.9 : 0.55}"/>`;
  });
  if (pmf && hist.integer) s += `<polyline fill="none" class="red" stroke-width="2" stroke-dasharray="5 3" points="${bins.map((b) => `${(sx(b.x0) + sx(b.x1)) / 2},${sy((pmf[b.x0] || 0) * hist.N).toFixed(1)}`).join(" ")}"/>` + text(w - R, 12, "dashed: Poisson(μ) × trials", "lbl", "end");
  s += line([L, h - Bm], [w - R, h - Bm], "axis");
  const ticks = hist.integer && bins.length <= 25 ? bins : bins.filter((_, i) => i % Math.ceil(bins.length / 6) === 0);
  for (const b of ticks) s += text((sx(b.x0) + sx(b.x1)) / 2, h - Bm + 14, b.label, "lbl");
  if (mean !== null && Number.isFinite(mean) && mean >= lo && mean <= hi) s += line([sx(hist.integer ? mean + 0.5 : mean), Tp], [sx(hist.integer ? mean + 0.5 : mean), h - Bm], "blue", 'stroke-width="2" stroke-dasharray="6 3"') + text(sx(hist.integer ? mean + 0.5 : mean) + 4, Tp + 10, `${meanLabel} = ${f(mean)}`, "lbl", "start");
  return s + "</svg>";
}
/** @param {[string, number, string][]} rows label, value and kind (truth, proved or not justified) */
function barsHtml(rows) {
  const max = Math.max(1e-12, ...rows.map((r) => r[1]));
  const useLog = max / Math.max(1e-12, Math.min(...rows.map((r) => r[1]).filter((v) => v > 0))) > 50;
  const width = (/** @type {number} */ v) => (useLog ? Math.max(0, 1 + Math.log10(Math.max(v, 1e-12)) / 12) : v / Math.max(1, max)) * 100;
  return `<div class="bars">${rows.map(([label, v, kind]) => `<div class="bar"><span>${esc(label)} <span class="badge ${kind === "truth" ? "exp" : kind === "proved" ? "thm" : "todo"}">${esc(kind)}</span></span><span class="track"><span class="fill${kind === "not justified" ? " void" : ""}" style="width:${Math.min(100, width(v)).toFixed(1)}%"></span></span><span class="val">${f(v)}</span></div>`).join("")}${useLog ? '<p class="small muted">Bar lengths on a log scale (1 down to 10⁻¹²).</p>' : ""}</div>`;
}

/* ---------- per-module renderers: draw(E, ui) → { svg, summary, extra } ---------- */

/**
 * What a lab's renderer draws: the SVG, a plain-language summary for screen readers, and optional extra HTML.
 * @typedef {{ svg: string, summary: string, extra?: string }} Drawing
 */
/** @type {Record<string, (E: Evaluated, ui: UiState) => Drawing>} */
const DRAW = {};


DRAW["first-moment"] = (E, ui) => {
  const { n, k } = E.P, I = E.I, pos = circlePos(n, 180, 180, 150), hl = ui.hl ?? (ui.focus === "witnesses" || ui.focus === "transition" ? 0 : null);
  let s = svgOpen(600, 360, `Complete graph K_${n} with a random red/blue edge colouring`);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const red = I.col[i * n + j]; s += line(pos[i], pos[j], red ? "red" : "blue", `stroke-width="1.1" opacity=".55" ${red ? "" : 'stroke-dasharray="4 3"'}`); }
  const shown = hl !== null && I.mono[hl] ? [I.mono[hl]] : ui.focus === "witnesses" ? I.mono.slice(0, 6) : [];
  for (const w of shown) { const S = w.set; for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) s += line(pos[S[a]], pos[S[b]], w.colour === "red" ? "red" : "blue", `stroke-width="4" ${w.colour === "red" ? "" : 'stroke-dasharray="7 4"'}`); }
  pos.forEach((p, i) => { s += dot(p, 9, "fbg ink", 'stroke-width="1.5"') + text(p[0], p[1] + 4, String(i), "lbl"); });
  const gx = 380, gw = 200, sc = scale(0, 2, gx, gx + gw), ex = Math.min(2, E.A.EX);
  s += text(gx, 40, "EXPECTED BAD CLIQUES", "lbl", "start") + `<text x="${gx}" y="70" class="ttl" style="font:600 26px var(--mono)">${esc(f(E.A.EX))}</text>`;
  s += `<rect x="${gx}" y="84" width="${gw}" height="12" class="fbg axis"/><rect x="${gx}" y="84" width="${(sc(ex) - gx).toFixed(1)}" height="12" class="${E.A.ok ? "fgreen" : "fred"}" opacity=".8"/>` + line([sc(1), 78], [sc(1), 102], "ink", 'stroke-width="2"') + text(sc(1), 116, "1", "lbl") + text(gx, 116, "0", "lbl", "start") + text(gx + gw, 116, "2", "lbl", "end");
  s += text(gx, 146, E.A.ok ? "< 1 — therefore at least one colouring" : "≥ 1 — the argument stops here", "lbl", "start") + text(gx, 162, E.A.ok ? `of K_${n} has no monochromatic K_${k}.` : "(a good colouring may still exist)", "lbl", "start");
  s += text(gx, 200, `THIS SAMPLE: X = ${I.X} bad ${k}-sets`, "ttl", "start") + text(gx, 218, `out of C(${n},${k}) = ${f(E.A.sets)}`, "lbl", "start");
  s += text(gx, 250, "red edges solid, blue edges dashed", "lbl", "start") + "</svg>";
  const reds = Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, j) => I.col[i * n + i + j + 1])).flat().reduce((a, b) => a + b, 0);
  const chips = I.mono.slice(0, 24).map((/** @type {{ set: number[], colour: string }} */ w, /** @type {number} */ i) => `<button class="chip" type="button" data-act="hl" data-i="${i}" aria-pressed="${hl === i}">I<sub>{${w.set.join(",")}}</sub> = 1 × ${w.colour}</button>`).join("");
  return { svg: s, summary: `K_${n} with ${PM.choose(n, 2)} edges, ${reds} red and ${PM.choose(n, 2) - reds} blue. ${I.X} of ${f(E.A.sets)} sets of ${k} vertices are monochromatic. E[X] = ${f(E.A.EX)}${E.A.ok ? ", below 1" : ", not below 1"}.`,
    extra: `<h3>Indicators that fired (X = Σ I<sub>S</sub>)</h3><div class="chips">${chips || '<span class="muted small">None: this colouring is already a witness, X = 0 ✓.</span>'}${I.X > 24 ? `<span class="small muted">… and ${I.X - 24} more</span>` : ""}</div>` };
};

DRAW.linearity = (E, ui) => {
  const n = E.P.n, I = E.I, pos = circlePos(n, 200, 180, 145);
  let s = svgOpen(600, 360, `Tournament on ${n} players`) + `<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="fink"/></marker></defs>`;
  const onPath = new Set(); for (let i = 0; i + 1 < I.path.length; i++) onPath.add(I.path[i] + ">" + I.path[i + 1]);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (I.beats[i * n + j]) {
    const a = pos[i], b = pos[j], d = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / d, (b[1] - a[1]) / d], hit = onPath.has(i + ">" + j);
    s += line([a[0] + u[0] * 12, a[1] + u[1] * 12], [b[0] - u[0] * 13, b[1] - u[1] * 13], hit ? "green" : "ink", `stroke-width="${hit ? 3 : 1}" opacity="${hit ? 1 : 0.35}" marker-end="url(#ah)"`);
  }
  pos.forEach((p, i) => { s += dot(p, 11, "fbg ink", 'stroke-width="1.5"') + text(p[0], p[1] + 4, String(i + 1), "lbl"); });
  s += text(400, 40, "HAMILTONIAN PATHS IN THIS TOURNAMENT", "lbl", "start") + `<text x="400" y="72" class="ttl" style="font:600 26px var(--mono)">${esc(f(I.X))}</text>`;
  s += text(400, 100, `E[X] = ${E.P.n}!/2^${E.P.n - 1} = ${f(E.A.EX)}`, "ttl", "start") + text(400, 130, "green: one witness path", "lbl", "start") + text(400, 146, "(found by inserting players one by one)", "lbl", "start");
  s += text(400, 180, I.X >= E.A.EX - 1e-9 ? "this tournament is at or above the mean ✓" : "this one is below the mean", "lbl", "start") + text(400, 196, "— some tournament must reach it", "lbl", "start") + "</svg>";
  const d = E.A.dependent;
  return { svg: s, summary: `Tournament on ${n} players with ${PM.choose(n, 2)} arcs. It has ${f(I.X)} directed Hamiltonian paths; the expected number is ${f(E.A.EX)}.`,
    extra: `<h3>Indicators are dependent — linearity does not care</h3><table class="rows"><tr><td>Pr[I<sub>identity</sub> = 1]</td><td>${f(E.A.pOne)}</td></tr><tr><td>identity and its rotation, Pr[both]</td><td>${f(d[0].joint)}</td></tr><tr><td>… if they were independent</td><td>${f(d[0].product)}</td></tr><tr><td>identity and its reversal, Pr[both]</td><td>${f(d[1].joint)}</td></tr></table>` };
};

DRAW.alterations = (E, ui) => {
  const G = E.F, I = E.I, n = E.P.n, stage = ui.focus === "random-object" ? 1 : ui.focus === "witnesses" || ui.focus === "variable" ? 2 : ui.labStep ?? 3, pos = circlePos(n, 200, 200, 150);
  let s = svgOpen(600, 400, `Graph on ${n} vertices; random selection then repair`);
  s += `<rect x="20" y="10" width="560" height="22" class="fbg axis"/>` + text(150, 26, "RANDOMISE", stage <= 2 ? "ttl" : "lbl") + text(430, 26, "REPAIR", stage >= 3 ? "ttl" : "lbl") + line([300, 10], [300, 32], "ink");
  for (const [a, b] of G.edges) s += line(pos[a], pos[b], "faint", 'stroke-width="1"');
  if (stage >= 2) for (const [a, b] of I.conflicts) s += line(pos[a], pos[b], "red", 'stroke-width="3"');
  const del = new Set(I.deleted);
  pos.forEach((p, v) => {
    if (stage >= 1 && I.sel[v]) {
      if (stage >= 3 && del.has(v)) s += dot(p, 6, "fbg ink", 'opacity=".35"') + cross(p, 5);
      else s += dot(p, 6, stage >= 3 ? "fgreen" : "fink");
    } else s += dot(p, 4, "fbg faint", 'stroke-width="1"');
  });
  const rows = [["selected", I.X], ["conflicts", I.Y], ["deleted", stage >= 3 ? I.deleted.length : "—"], ["survivors", stage >= 3 ? I.survivors : "—"], ["guaranteed X − Y", I.guaranteed]];
  rows.forEach(([k, v], i) => { s += text(400, 80 + i * 26, k, "lbl", "start") + `<text x="570" y="${80 + i * 26}" class="ttl" text-anchor="end" style="font-family:var(--mono)">${esc(String(v))}</text>`; });
  s += text(400, 230, `E[X − Y] = ${f(E.A.EXY)}`, "ttl", "start") + text(400, 248, "filled = kept, green = survivor ✓, × = deleted", "lbl", "start") + text(400, 264, "red connector = conflict edge", "lbl", "start");
  if (!I.independent) s += text(400, 292, `NOT independent: ${I.remaining} edges remain`, "ttl", "start");
  return { svg: s + "</svg>", summary: `Graph with ${n} vertices and ${G.edges.length} edges. ${I.X} vertices kept, ${I.Y} conflict edges, ${I.deleted.length} deleted, ${I.survivors} survive${I.independent ? " as an independent set" : " but the set is not independent (repair skipped)"}.` };
};

DRAW["second-moment"] = (E, ui) => {
  const I = E.I, G = I.G, n = E.P.n, pos = circlePos(n, 170, 180, 140), w = I.witnesses[0];
  let s = svgOpen(600, 360, `G(${n}, ${E.P.p}) with its cliques of size ${E.P.k}`);
  for (const [a, b] of G.edges) s += line(pos[a], pos[b], "ink", 'stroke-width=".8" opacity=".35"');
  if (w) for (let a = 0; a < w.length; a++) for (let b = a + 1; b < w.length; b++) s += line(pos[w[a]], pos[w[b]], "green", 'stroke-width="3.5"');
  pos.forEach((p, i) => { s += dot(p, w && w.includes(i) ? 7 : 5, w && w.includes(i) ? "fgreen" : "fbg ink"); });
  s += text(360, 40, "THIS SAMPLE", "lbl", "start") + text(360, 62, `X = ${f(I.X)} cliques K_${E.P.k}`, "ttl", "start") + text(360, 90, `E[X] = ${f(E.A.EX)}`, "ttl", "start") + text(360, 110, `E[X²]/E[X]² = ${f(E.A.ratio)}`, "ttl", "start");
  s += text(360, 140, `Pr[X > 0] ≥ ${f(E.A.pz)} (Paley–Zygmund)`, "lbl", "start") + text(360, 158, `Pr[X = 0] ≤ ${f(E.A.cheb)} (Chebyshev)`, "lbl", "start") + text(360, 186, "green: one clique witness", "lbl", "start") + "</svg>";
  const sel = ui.j ?? null, rows = E.A.table.map((/** @type {{ j: number, pairs: number, joint: number, contribution: number, independent: boolean }} */ r) => `<tr${sel === r.j ? ' class="active"' : ""}><td><button class="chip" type="button" data-act="j" data-i="${r.j}" aria-pressed="${sel === r.j}">j = ${r.j}</button></td><td class="num">${f(r.pairs)}</td><td class="num">${f(r.joint)}</td><td class="num">${f(r.contribution)}</td></tr>`).join("");
  // Only the second-moment lab draws this, and it has a sweep.
  const sweep = /** @type {{ p: number, markov: number, pz: number }[]} */ (/** @type {NonNullable<Module["sweep"]>} */ (E.mod.sweep)(E.P)), chart = lineChart({ x0: 0, x1: 1, y0: 0, y1: 1, title: "Threshold via moments", xlabel: "p", ylabel: "probability", series: [{ pts: sweep.map((d) => [d.p, d.markov]), cls: "red", label: "upper: min(1, E X)" }, { pts: sweep.map((d) => [d.p, d.pz]), cls: "blue", dash: "5 3", label: "lower: (EX)²/E[X²]" }], markers: [{ x: E.P.p, label: `p = ${f(E.P.p)}` }, { x: Math.min(1, E.A.threshold), cls: "green", label: "E X = 1" }] });
  const detail = sel !== null ? `<p class="eq">Pairs with |S ∩ T| = ${sel}: E[I<sub>S</sub>I<sub>T</sub>] = p<sup>2·${E.A.K} − ${PM.choose(sel, 2)}</sup> = ${f(E.A.table[sel].joint)}${sel < 2 ? " = E[I_S]·E[I_T] (no shared edge: independent)" : " (shared edges: positively correlated)"}</p>` : "";
  return { svg: s, summary: `Random graph with ${n} vertices and ${G.edges.length} edges containing ${f(I.X)} cliques of size ${E.P.k}. The second-moment ratio is ${f(E.A.ratio)}.`,
    extra: `<h3>Pair-overlap table: E[X²] = Σ over overlap j</h3><div class="scroll"><table class="grid"><tr><th>overlap</th><th>ordered pairs</th><th>E[I<sub>S</sub>I<sub>T</sub>]</th><th>contribution</th></tr>${rows}<tr><td><b>E[X²]</b></td><td></td><td></td><td class="num"><b>${f(E.A.EX2)}</b></td></tr></table></div>${detail}${E.P.cluster === "on" ? '<p class="small">Clustered model: the table describes G(n,p), not this variable.</p>' : ""}<div class="stage">${chart}</div>` };
};

/**
 * @param {Evaluated} E @param {ArrayLike<number>} col @param {number | null | undefined} highlight
 * @param {{ title?: string, badSet?: number[], resampled?: Set<number> | null }} [options]
 */
function ringPicture(E, col, highlight, { title, badSet, resampled } = {}) {
  const H = E.F, N = H.N, cx = 180, cy = 190, R = 150, pos = circlePos(N, cx, cy, R);
  let s = "";
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" class="faint"/>`;
  for (let v = 0; v < N; v++) {
    const ang = -Math.PI / 2 + (2 * Math.PI * v) / N, red = col[v] === 1, r1 = red ? R : R - 12, r2 = red ? R + 12 : R;
    s += line([cx + r1 * Math.cos(ang), cy + r1 * Math.sin(ang)], [cx + r2 * Math.cos(ang), cy + r2 * Math.sin(ang)], red ? "red" : "blue", `stroke-width="${N > 300 ? 1 : 2}"${resampled && resampled.has(v) ? ' style="stroke-width:4"' : ""}`);
  }
  const mid = (/** @type {number[]} */ e) => { const a = -Math.PI / 2 + (2 * Math.PI * (e[0] + (H.k - 1) / 2)) / N; return [cx + (R - 30) * Math.cos(a), cy + (R - 30) * Math.sin(a)]; };
  for (const i of badSet || []) s += cross(mid(H.edges[i]), 4);
  if (highlight !== null && highlight !== undefined && H.edges[highlight]) {
    const e = H.edges[highlight], arc = (/** @type {number[]} */ ids, /** @type {string} */ cls, /** @type {number} */ r) => ids.forEach((v) => { const a = -Math.PI / 2 + (2 * Math.PI * v) / N; s += dot([cx + r * Math.cos(a), cy + r * Math.sin(a)], 3, cls); });
    for (const j of H.nbrs[highlight]) arc(H.edges[j], "fyellow", R + 20);
    arc(e, "fink", R + 20);
  }
  s += text(cx, cy - 6, title || "", "ttl") + text(cx, cy + 12, "outer tick red · inner tick blue", "lbl") + text(cx, cy + 28, "× = monochromatic edge", "lbl");
  return s;
}
DRAW["local-lemma"] = (E, ui) => {
  const A = E.A, H = E.F, f0 = A.focusEvent;
  let s = svgOpen(600, 380, `Hypergraph with ${A.m} edges of size ${E.P.k} on a ring of ${A.N} vertices`) + ringPicture(E, E.I.col, f0, { title: `${A.N} vertices, ${A.m} edges`, badSet: E.I.bad });
  const gx = 380, sc = scale(0, 2, gx, gx + 200);
  const gauge = (/** @type {number} */ y, /** @type {string} */ label, /** @type {number} */ v, /** @type {boolean} */ ok) => text(gx, y, label, "lbl", "start") + `<rect x="${gx}" y="${y + 6}" width="160" height="12" class="fbg axis"/><rect x="${gx}" y="${y + 6}" width="${((sc(Math.min(2, v)) - gx) * 0.8).toFixed(1)}" height="12" class="${ok ? "fgreen" : "fred"}" opacity=".8"/>` + line([gx + 80, y + 2], [gx + 80, y + 22], "ink", 'stroke-width="2"') + `<text x="595" y="${y + 17}" class="ttl" text-anchor="end" style="font-family:var(--mono)">${esc(f(v))}</text>`;
  s += gauge(40, "UNION BOUND m·p (needs < 1)", A.union, A.unionOk) + gauge(90, "LOCAL LEMMA e·p·(d+1) (needs ≤ 1)", A.gauge, A.ok);
  s += text(gx, 140, A.ok ? "Local Lemma condition satisfied ✓" : "condition fails ×", "ttl", "start");
  s += text(gx, 168, `selected A_${f0}: depends on ${H.nbrs[f0].length} events`, "lbl", "start") + text(gx, 184, H.nbrs[f0].length ? H.nbrs[f0].map((/** @type {number} */ x) => "A_" + x).join(", ").slice(0, 44) : "none", "lbl", "start");
  s += text(gx, 204, `the other ${A.m - 1 - H.nbrs[f0].length} events are irrelevant to it`, "lbl", "start") + text(gx, 220, "dark dots: its edge · yellow: dependents", "lbl", "start");
  /* phase diagram: d against p (log), the curve e p (d+1) = 1 */
  const px = 400, py = 240, pw = 180, ph = 120, sd = scale(0, 30, px, px + pw), sp = scale(-8, 0, py + ph, py), lg = (/** @type {number} */ p) => Math.log2(p);
  s += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" class="fbg axis"/>` + `<polyline fill="none" class="ink" points="${Array.from({ length: 31 }, (_, d) => `${sd(d).toFixed(1)},${sp(Math.max(-8, lg(1 / (Math.E * (d + 1))))).toFixed(1)}`).join(" ")}"/>`;
  s += dot([sd(Math.min(30, A.d)), sp(Math.max(-8, lg(A.p)))], 5, A.ok ? "fgreen" : "fred", 'stroke="var(--strong)"') + text(px + pw / 2, py + ph + 14, "d (dependency degree)", "lbl") + text(px - 4, py + 8, "p=1", "lbl", "end") + text(px - 4, py + ph, "2⁻⁸", "lbl", "end");
  s += text(px + pw - 4, py + 14, "invalid", "lbl", "end") + text(px + 6, py + ph - 6, "valid", "lbl", "start") + "</svg>";
  const list = Array.from({ length: Math.min(A.m, 60) }, (_, i) => `<button class="chip" type="button" data-act="focus-event" data-i="${i}" aria-pressed="${i === f0}">A<sub>${i}</sub> ${E.I.bad.includes(i) ? "×" : "✓"}</button>`).join("");
  return { svg: s, summary: `Ring of ${A.N} vertices with ${A.m} edges of size ${E.P.k}. ${E.I.X} bad events are currently true. Selected event A_${f0} depends on ${H.nbrs[f0].length ? H.nbrs[f0].map((/** @type {number} */ x) => "A_" + x).join(", ") : "no other event"}. e·p·(d+1) = ${f(A.gauge)}, m·p = ${f(A.union)}.`,
    extra: `<h3>Bad-event view — select an event to see its dependency neighbourhood</h3><div class="chips">${list}${A.m > 60 ? `<span class="small muted">… ${A.m - 60} more</span>` : ""}</div>` };
};
DRAW["moser-tardos"] = (E, ui) => {
  const I = E.I, H = E.F, steps = Math.min(ui.labStep ?? I.log.length, I.log.length), col = I.initial.slice();
  for (let i = 0; i < steps; i++) { const s0 = I.log[i]; H.edges[s0.event].forEach((/** @type {number} */ v, /** @type {number} */ j) => { col[v] = s0.values[j]; }); }
  /** @type {number[]} */
  const bad = []; H.edges.forEach((/** @type {number[]} */ e, /** @type {number} */ i) => { if (e.every((v) => col[v] === col[e[0]])) bad.push(i); });
  const cur = steps < I.log.length ? I.log[steps].event : null, last = steps > 0 ? I.log[steps - 1] : null;
  let s = svgOpen(600, 380, "Moser–Tardos resampling") + ringPicture(E, col, cur ?? (last ? last.event : null), { title: steps === I.log.length ? "no violated edge ✓" : `step ${steps} of ${I.log.length}`, badSet: bad, resampled: last ? new Set(H.edges[last.event]) : null });
  s += text(380, 40, "RESAMPLING HISTORY", "lbl", "start");
  const hist = I.log.slice(Math.max(0, steps - 12), steps);
  hist.forEach((/** @type {{ event: number }} */ h0, /** @type {number} */ i) => { s += text(380, 62 + i * 17, `A_${h0.event}`, i === hist.length - 1 ? "ttl" : "lbl", "start"); });
  if (steps === I.log.length) s += text(380, 62 + hist.length * 17, "✓ done", "ttl", "start");
  s += text(470, 62, "variables changed", "lbl", "start") + text(470, 80, `this step: ${last ? E.P.k : 0} / ${H.N}`, "ttl", "start") + text(470, 104, "violated now", "lbl", "start") + text(470, 122, String(bad.length), "ttl", "start");
  s += text(470, 146, "total resamplings", "lbl", "start") + text(470, 164, String(I.resamplings), "ttl", "start") + text(470, 188, "bound on E[R]", "lbl", "start") + text(470, 206, E.A.bound === null ? "none" : f(E.A.bound), "ttl", "start");
  return { svg: s + "</svg>", summary: `After ${steps} of ${I.resamplings} resamplings, ${bad.length} edges are monochromatic. Each resampling changes ${E.P.k} of ${H.N} variables.${cur !== null ? ` Next: resample the vertices of A_${cur}.` : ""}` };
};

DRAW.chernoff = (E, ui) => {
  const A = E.A, N = A.N, p = E.P.p, rho = E.P.rho, sd = Math.sqrt(Math.max(A.variance, 1e-9));
  let lo = Math.max(0, Math.floor(A.mu - 6 * sd)), hi = Math.min(N, Math.ceil(Math.max(A.a + 3 * sd, A.mu + 6 * sd)));
  if (rho > 0) { lo = 0; hi = N; }
  const pmf = (/** @type {number} */ x) => (1 - rho) * PM.binomPmf(N, x, p) + rho * (x === N ? p : x === 0 ? 1 - p : 0);
  const xs = []; for (let x = lo; x <= hi; x++) xs.push(x);
  if (xs.length > 260) { const st = Math.ceil(xs.length / 260); for (let i = xs.length - 1; i >= 0; i--) if (i % st) xs.splice(i, 1); }
  const maxP = Math.max(...xs.map(pmf)), w = 600, h = 300, L = 40, R = 10, Tp = 20, Bm = 34, sx = scale(lo, hi + 1, L, w - R), sy = scale(0, maxP * 1.1, h - Bm, Tp);
  let s = svgOpen(w, h, `Exact distribution of the degree, Bin(${N}, ${p})`) + text(L, 14, ui.focus === "mgf" ? "the tail indicator lies under the exponential envelope" : "exact PMF · shaded = tail X ≥ a · dashed = normal intuition", "lbl", "start");
  const bw = Math.max(1, (sx(hi + 1) - sx(lo)) / xs.length - 1);
  for (const x of xs) { const tail = x >= A.a - 1e-12, y = sy(pmf(x)); s += `<rect x="${sx(x).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${(h - Bm - y).toFixed(1)}" class="${tail ? "fred" : "fink"}" opacity="${tail ? 0.85 : 0.45}"/>`; }
  if (rho === 0) s += `<polyline fill="none" class="blue" stroke-width="1.5" stroke-dasharray="5 3" points="${xs.map((x) => `${(sx(x) + bw / 2).toFixed(1)},${sy(Math.exp(-((x - A.mu) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI))).toFixed(1)}`).join(" ")}"/>`;
  if (ui.focus === "mgf") { const sy2 = scale(0, 1.2, h - Bm, Tp); s += `<polyline fill="none" class="green" stroke-width="2" points="${xs.map((x) => `${(sx(x) + bw / 2).toFixed(1)},${sy2(Math.min(1.2, Math.exp(A.lambda * (x - A.a)))).toFixed(1)}`).join(" ")}"/>` + text(w - R, 30, "green: e^(λ(x − a)), λ = ln(1+δ) ≥ 1[x ≥ a]", "lbl", "end"); }
  s += line([sx(A.mu), Tp], [sx(A.mu), h - Bm], "ink", 'stroke-dasharray="3 3"') + text(sx(A.mu), h - Bm + 28, "μ", "lbl") + line([sx(A.a), Tp], [sx(A.a), h - Bm], "red", 'stroke-width="2"') + text(sx(A.a), h - Bm + 28, "a = (1+δ)μ", "lbl");
  s += line([L, h - Bm], [w - R, h - Bm], "axis") + text(L, h - Bm + 14, String(lo), "lbl") + text(w - R, h - Bm + 14, String(hi), "lbl", "end");
  return { svg: s + "</svg>", summary: `Degree X ~ Bin(${N}, ${p})${rho > 0 ? ` with correlation ρ = ${rho}` : ""}, mean ${f(A.mu)}. Exact Pr[X ≥ ${f(A.a)}] = ${f(A.exact)}; Chernoff bound ${f(A.chernoff)}${A.ok ? "" : " (not justified)"}. This sample has degree ${E.I.X}.`,
    extra: `<h3>Bound quality — truth against proved bounds</h3>${barsHtml(A.bars)}` };
};

DRAW.martingale = (E, ui) => {
  const I = E.I, A = E.A, m = A.m, k = Math.min(ui.labStep ?? m, m), path = I.path, w = 600, h = 300, L = 48, R = 12, Tp = 20, Bm = 30;
  const lo = Math.min(...path, A.mean - E.P.t) - 1, hi = Math.max(...path, A.mean + E.P.t) + 1, sx = scale(0, m, L, w - R), sy = scale(lo, hi, h - Bm, Tp);
  let s = svgOpen(w, h, "Doob martingale path") + text(L, 14, `Z_i = E[X | first i edges] · band: allowed step ±c = ${A.c}`, "lbl", "start");
  for (let i = 1; i <= k; i++) {
    const y0 = sy(path[i - 1] + A.c), y1 = sy(path[i - 1] - A.c);
    s += `<rect x="${sx(i - 1).toFixed(1)}" y="${y0.toFixed(1)}" width="${Math.max(1, sx(i) - sx(i - 1)).toFixed(1)}" height="${(y1 - y0).toFixed(1)}" class="fmuted" opacity=".1"/>`;
    if (Math.abs(path[i] - path[i - 1]) > A.c + 1e-9) s += cross([sx(i), sy(path[i])], 5);
  }
  s += line([L, sy(A.mean)], [w - R, sy(A.mean)], "blue", 'stroke-dasharray="5 3"') + text(w - R, sy(A.mean) - 4, "E[X]", "lbl", "end");
  for (const d of [-1, 1]) s += line([L, sy(A.mean + d * E.P.t)], [w - R, sy(A.mean + d * E.P.t)], "red", 'stroke-dasharray="2 4"') + text(w - R, sy(A.mean + d * E.P.t) - 4, d > 0 ? "E[X] + t" : "E[X] − t", "lbl", "end");
  s += `<polyline fill="none" class="ink" stroke-width="2" points="${path.slice(0, k + 1).map((/** @type {number} */ z, /** @type {number} */ i) => `${sx(i).toFixed(1)},${sy(z).toFixed(1)}`).join(" ")}"/>` + dot([sx(k), sy(path[k])], 4, "fyellow", 'stroke="var(--strong)"');
  s += line([L, h - Bm], [w - R, h - Bm], "axis") + text(L, h - 8, "0", "lbl") + text(w - R, h - 8, `m = ${m}`, "lbl", "end") + text((L + w) / 2, h - 8, "reveal step", "lbl");
  return { svg: s + "</svg>", summary: `Edge-exposure martingale for the number of ${PM.STATISTICS[E.P.stat]}: ${k} of ${m} edges revealed, prediction Z = ${f(path[k])}, final X = ${f(I.X)}, largest step ${f(I.maxStep)} against c = ${A.c}.`,
    extra: '<p class="small muted">The martingale is not the statistic itself: it is our changing prediction of its final value as edges are revealed.</p>' };
};

DRAW.janson = (E, ui) => {
  const I = E.I, G = I.G, n = E.P.n, pos = circlePos(n, 160, 180, 140);
  let s = svgOpen(600, 360, `G(${n}, ${E.P.p}) with its triangles`);
  for (const [a, b] of G.edges) s += line(pos[a], pos[b], "ink", 'stroke-width=".8" opacity=".35"');
  for (const t of I.tris.slice(0, 30)) s += `<polygon points="${t.map((/** @type {number} */ v) => pos[v].map((z) => z.toFixed(1)).join(",")).join(" ")}" class="fred red" fill-opacity=".18" stroke-width="2"/>`;
  pos.forEach((p) => { s += dot(p, 4, "fbg ink"); });
  /* overlap network: triangles as nodes, joined when they share an edge */
  const T0 = I.tris.slice(0, 16), tp = circlePos(T0.length, 460, 190, 90), share = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.filter((v) => b.includes(v)).length >= 2;
  s += text(460, 40, "OVERLAP NETWORK", "lbl") + text(460, 56, "triangles sharing an edge are joined", "lbl");
  for (let i = 0; i < T0.length; i++) for (let j = i + 1; j < T0.length; j++) if (share(T0[i], T0[j])) s += line(tp[i], tp[j], "red", 'stroke-width="2"');
  tp.forEach((p, i) => { s += `<path d="M${p[0]},${p[1] - 9}L${p[0] + 8},${p[1] + 6}L${p[0] - 8},${p[1] + 6}z" class="fbg ink"/>` + text(p[0], p[1] + 20, `△${i + 1}`, "lbl"); });
  if (!T0.length) s += text(460, 190, "no triangles: X = 0 ✓", "ttl");
  s += text(460, 330, `μ = ${f(E.A.mu)}   Δ = ${f(E.A.Delta)}`, "ttl") + "</svg>";
  return { svg: s, summary: `Random graph with ${n} vertices, ${G.edges.length} edges and ${I.X} triangles${G.planted ? " (a K4 was planted)" : ""}. μ = ${f(E.A.mu)}, Δ = ${f(E.A.Delta)}.`,
    extra: `<h3>Pr[no triangle]: the bracket</h3>${barsHtml([["Harris lower bound", E.A.harris, E.A.ok ? "proved" : "not justified"], ["Poisson guess e^(−μ)", E.A.poisson0, "heuristic"], ["Janson upper bound", E.A.janson, E.A.ok ? "proved" : "not justified"]])}` };
};

DRAW.nibble = (E, ui) => {
  const I = E.I, N = E.P.N, cols = Math.ceil(Math.sqrt(N * 1.6)), rowsN = Math.ceil(N / cols), r0 = Math.min(ui.labStep ?? I.rounds.length, I.rounds.length);
  const pos = Array.from({ length: N }, (_, v) => [20 + (v % cols) * (340 / Math.max(1, cols - 1)), 30 + Math.floor(v / cols) * (300 / Math.max(1, rowsN - 1))]);
  const covered = new Uint8Array(N); for (let i = 0; i < r0 - 1; i++) for (const e of I.rounds[i].accepted) for (const v of e) covered[v] = 1;
  const cur = r0 > 0 ? I.rounds[r0 - 1] : null;
  let s = svgOpen(600, 360, "Rödl nibble rounds");
  const tri = (/** @type {number[]} */ e, /** @type {string} */ cls, /** @type {string} */ extra) => `<polygon points="${e.map((v) => pos[v].map((z) => z.toFixed(1)).join(",")).join(" ")}" class="${cls}" fill="none" ${extra}/>`;
  if (cur) { for (const e of cur.collided) s += tri(e, "red", 'stroke-width="1.5"') + cross(pos[e[0]], 3); for (const e of cur.accepted) s += tri(e, "ink", 'stroke-width="2.5"'); }
  if (cur && cur.selected.length < 400) for (const e of cur.selected) if (!cur.accepted.includes(e) && !cur.collided.includes(e)) s += tri(e, "ink", 'stroke-dasharray="2 3"');
  pos.forEach((p, v) => { s += dot(p, 3, covered[v] ? "fmuted" : "fink", covered[v] ? 'opacity=".3"' : ""); });
  const pts = [[0, 1], ...I.rounds.slice(0, Math.max(1, r0)).map((/** @type {{ round: number, aliveAfter: number }} */ r) => [r.round, r.aliveAfter / N])];
  s += `<g transform="translate(370 20)">${text(110, 12, "uncovered fraction by round", "lbl")}`;
  const sx2 = scale(0, Math.max(8, I.rounds.length), 10, 220), sy2 = scale(0, 1, 280, 30);
  s += line([10, 280], [220, 280], "axis") + line([10, 30], [10, 280], "axis");
  s += `<polyline fill="none" class="blue" stroke-dasharray="5 3" points="${E.A.predicted.slice(0, Math.max(8, I.rounds.length) + 1).map((/** @type {number} */ v, /** @type {number} */ i) => `${sx2(i).toFixed(1)},${sy2(v).toFixed(1)}`).join(" ")}"/>`;
  s += `<polyline fill="none" class="ink" stroke-width="2" points="${pts.map(([x, y]) => `${sx2(x).toFixed(1)},${sy2(y).toFixed(1)}`).join(" ")}"/>` + text(220, 300, "dashed: predicted (heuristic)", "lbl", "end") + "</g>";
  return { svg: s + "</svg>", summary: `Round ${r0} of ${I.rounds.length}: ${cur ? `${cur.selected.length} candidates, ${cur.collided.length} collided, ${cur.accepted.length} accepted; ` : ""}${N - (cur ? cur.aliveAfter : N)} of ${N} vertices covered. Solid triangles accepted, dotted candidates, crossed collisions, faint covered vertices.`,
    extra: `<div class="scroll"><table class="grid"><tr><th>round</th><th>live vertices</th><th>candidate edges</th><th>accepted</th><th>collision rate</th></tr>${I.rounds.slice(0, 12).map((/** @type {ReturnType<typeof PM.runNibble>["rounds"][number]} */ r) => `<tr${r.round === r0 ? ' style="font-weight:700"' : ""}><td>${r.round}</td><td class="num">${r.aliveBefore}</td><td class="num">${r.selected.length}</td><td class="num">${r.accepted.length}</td><td class="num">${f(r.collisionRate)}</td></tr>`).join("")}</table></div>` };
};

DRAW.quasirandom = (E, ui) => {
  const F = E.F, G = F.G, n = G.n, I = E.I, pos = circlePos(n, 150, 175, 130), inS = new Set(I.S), inT = new Set(I.T);
  let s = svgOpen(600, 360, `${E.P.type} graph on ${n} vertices`);
  for (const [a, b] of G.edges) s += line(pos[a], pos[b], "ink", 'stroke-width=".6" opacity=".25"');
  pos.forEach((p, v) => { if (inS.has(v)) s += `<rect x="${p[0] - 5}" y="${p[1] - 5}" width="10" height="10" class="fink"/>`; else s += dot(p, 3, "fmuted"); if (inT.has(v)) s += dot(p, 9, "fbg", 'fill="none" stroke="var(--blue)" stroke-width="2"'); });
  s += text(150, 330, "■ in S   ○ ring: in T", "lbl");
  const cell = Math.min(6, 200 / n), mx = 360, my = 30;
  s += text(mx, my - 8, "adjacency matrix (click to flip a pair)", "lbl", "start");
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (G.adj[i * n + j]) s += `<rect x="${(mx + j * cell).toFixed(1)}" y="${(my + i * cell).toFixed(1)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" class="fink" opacity=".7"/>`;
  s += `<rect x="${mx}" y="${my}" width="${(n * cell).toFixed(1)}" height="${(n * cell).toFixed(1)}" fill="transparent" class="axis" data-act="matrix" data-n="${n}" style="cursor:crosshair"/>`;
  const ey = my + n * cell + 40, eig = E.A.eig, sxe = scale(-n / 2, n, mx, mx + 220);
  s += text(mx, ey - 14, "spectrum (λ₁ = d, then the rest)", "lbl", "start") + line([mx, ey + 20], [mx + 220, ey + 20], "axis");
  for (const l of eig) s += line([sxe(l), ey + 6], [sxe(l), ey + 34], "ink", 'opacity=".6"');
  s += line([sxe(E.A.lambda), ey], [sxe(E.A.lambda), ey + 40], "red", 'stroke-width="2"') + line([sxe(-E.A.lambda), ey], [sxe(-E.A.lambda), ey + 40], "red", 'stroke-width="2"') + text(sxe(E.A.lambda), ey + 52, "±λ", "lbl");
  const meters = [...E.A.meters, ["cut discrepancy / mixing bound (this S, T)", Math.min(1, I.dev / Math.max(1e-9, I.bound)), `${f(I.dev)} / ${f(I.bound)}`]];
  return { svg: s + "</svg>", summary: `${E.P.type} graph: ${n} vertices, ${G.edges.length} edges, ${E.A.regular ? "regular" : "not regular"}, second eigenvalue ${f(E.A.lambda)}. Random S (${I.S.length}) and T (${I.T.length}) span ${I.e} ordered edges against ${f(I.expected)} expected; mixing bound ${f(I.bound)}.`,
    extra: `<h3>Quasirandom equivalence dashboard</h3><div class="bars">${meters.map(([l, v, t]) => `<div class="bar"><span>${esc(l)}</span><span class="track"><span class="fill" style="width:${(100 * Math.max(0, Math.min(1, v))).toFixed(1)}%"></span></span><span class="val">${esc(t)}</span></div>`).join("")}</div>
      <form class="chips" data-act="flip-form"><label class="small">flip pair <input class="field num" name="i" type="number" min="0" max="${n - 1}" value="0" style="width:4.5rem"></label><input class="field num" name="j" type="number" min="0" max="${n - 1}" value="1" style="width:4.5rem" aria-label="second vertex"><button class="btn" type="submit">Flip edge</button><button class="btn quiet" type="button" data-act="clear-flips">Undo all flips (${String(E.P.flips || "").split(",").filter(Boolean).length})</button></form>` };
};

DRAW["phase-transition"] = (E, ui) => {
  const I = E.I, F = E.F, n = E.P.n, sizes = new Map();
  for (const l of I.comp.label) sizes.set(l, (sizes.get(l) || 0) + 1);
  const maxL = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  let s = svgOpen(600, 380, `G(${n}, ${f(E.A.p)}) by coupled edge labels`);
  const P0 = (/** @type {number} */ v) => [20 + F.pos[v][0] * 320, 20 + F.pos[v][1] * 320];
  for (const [a, b] of I.present) s += line(P0(a), P0(b), I.comp.label[a] === maxL ? "ink" : "faint", `stroke-width="${I.comp.label[a] === maxL ? 1.6 : 1}"`);
  for (let v = 0; v < n; v++) s += dot(P0(v), 3, I.comp.label[v] === maxL ? "fink" : "fbg ink", I.comp.label[v] === maxL ? "" : 'stroke-width=".8"');
  s += text(180, 362, "filled: largest component · hollow: the rest", "lbl");
  s += `<g transform="translate(350 0)">` + text(0, 24, `p = ${f(E.A.p)}   np = ${f(E.P.c)}`, "ttl", "start") + text(0, 44, `largest component: ${I.L1}   second: ${I.L2}`, "ttl", "start") + text(0, 62, `regime: ${E.A.regime}`, "lbl", "start");
  const sx = scale(0, 3, 0, 240), sy = scale(0, 1, 200, 80);
  s += `<rect x="${sx(E.A.window[0]).toFixed(1)}" y="80" width="${(sx(E.A.window[1]) - sx(E.A.window[0])).toFixed(1)}" height="120" class="fmuted" opacity=".15"/>` + line([0, 200], [240, 200], "axis") + line([0, 80], [0, 200], "axis");
  s += `<polyline fill="none" class="blue" stroke-width="2" points="${E.A.curve.map((/** @type {number[]} */ [c, b]) => `${sx(c).toFixed(1)},${sy(b).toFixed(1)}`).join(" ")}"/>` + dot([sx(E.P.c), sy(I.L1 / n)], 5, "fyellow", 'stroke="var(--strong)"');
  s += text(0, 216, "0", "lbl") + text(sx(1), 216, "c = 1", "lbl") + text(240, 216, "3", "lbl", "end") + text(240, 92, "β(c) and L₁/n", "lbl", "end") + text(sx(1), 76, "window", "lbl");
  s += text(0, 248, "GENERATION SIZES", "lbl", "start") + text(0, 266, `graph BFS from vertex 0: ${I.bfs.gens.slice(0, 7).join(", ")}`, "lbl", "start") + text(0, 284, `Poisson(${f(E.P.c)}) tree: ${I.gw.gens.slice(0, 7).join(", ")}${I.gw.gens.length === 1 ? " (died out)" : ""}`, "lbl", "start");
  s += text(0, 304, I.bfs.collision ? `first collision: generation ${I.bfs.collision.generation} (not a tree)` : "no collision in the explored generations", "lbl", "start") + "</g>";
  return { svg: s + "</svg>", summary: `Random graph with ${n} vertices and ${I.present.length} edges at c = ${f(E.P.c)}: ${I.count} components, largest ${I.L1}, second ${I.L2}; predicted giant fraction ${f(E.A.beta)}.` };
};

DRAW.discrepancy = (E, ui) => {
  const A = E.F.A, m = A.length, n = A[0].length, x = ui.signs && ui.signs.length === n ? ui.signs : E.I.x, sums = PM.rowSums(A, x), worst = Math.max(...sums.map(Math.abs));
  const cw = Math.min(22, 420 / n), ch = Math.min(18, 300 / m), x0 = 50, y0 = 40;
  let s = svgOpen(600, y0 + m * ch + 30, "Incidence matrix times sign vector");
  x.forEach((/** @type {number} */ v, /** @type {number} */ j) => { s += `<g data-act="flip-sign" data-i="${j}" tabindex="0" role="button" aria-label="flip sign of element ${j}, now ${v > 0 ? "plus" : "minus"}" style="cursor:pointer"><rect x="${x0 + j * cw}" y="${y0 - 26}" width="${cw - 2}" height="20" class="fbg axis"/>${text(x0 + j * cw + cw / 2 - 1, y0 - 11, v > 0 ? "+" : "−", "ttl")}</g>`; });
  A.forEach((/** @type {number[]} */ row, /** @type {number} */ i) => {
    s += text(x0 - 8, y0 + i * ch + ch * 0.7, `S${i + 1}`, "lbl", "end");
    row.forEach((a, j) => { if (a) s += `<rect x="${x0 + j * cw}" y="${y0 + i * ch}" width="${cw - 2}" height="${ch - 2}" class="${x[j] > 0 ? "fink" : "fmuted"}" opacity="${x[j] > 0 ? 0.75 : 0.45}"/>`; else s += dot([x0 + j * cw + cw / 2 - 1, y0 + i * ch + ch / 2 - 1], 1.2, "fmuted"); });
    const v = sums[i]; s += `<text x="${x0 + n * cw + 34}" y="${y0 + i * ch + ch * 0.75}" class="${Math.abs(v) === worst ? "ttl" : "lbl"}" text-anchor="end" style="font-family:var(--mono)">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}</text>`;
    if (Math.abs(v) === worst) s += text(x0 + n * cw + 40, y0 + i * ch + ch * 0.75, "← disc", "lbl", "start");
  });
  return { svg: s + "</svg>", summary: `${m} sets on ${n} elements. Current colouring has discrepancy ${worst}; the union bound guarantees some colouring below ${E.A.tExact}. Signs are buttons: flip one to see every affected set change.`,
    extra: `<p class="small">Flip signs above (click or Enter). <button class="btn quiet" type="button" data-act="reset-signs">Back to the ${esc(E.P.algo)} colouring</button> <span class="badge ${E.P.algo === "random" ? "thm" : "exp"}">${E.P.algo === "random" ? "the proof's random colouring" : "experimental algorithm — no guarantee"}</span></p>` };
};

DRAW["epsilon-net"] = (E, ui) => {
  const pts = E.F.pts, I = E.I, N = E.P.N, eps = E.P.eps, sampled = new Set(I.idx);
  let s = svgOpen(600, 330, `${PM.RANGE_FAMILIES[E.P.family].label}: sample and missed ranges`);
  if (E.P.family === "intervals") {
    const sx = scale(0, 1, 30, 570), jit = (/** @type {number} */ i) => 120 + ((i * 37) % 60);
    if (I.miss.count) { const a = sx(Math.max(0, I.miss.lo === -Infinity ? 0 : I.miss.lo)), b = sx(Math.min(1, I.miss.hi === Infinity ? 1 : I.miss.hi)); s += `<rect x="${a.toFixed(1)}" y="100" width="${(b - a).toFixed(1)}" height="100" class="${I.miss.count >= eps * N ? "fred" : "fmuted"}" opacity=".15"/>` + text((a + b) / 2, 94, `largest gap: ${I.miss.count} points ${I.miss.count >= eps * N ? "≥ ε|X| — missed heavy range ×" : "< ε|X| ✓"}`, "lbl"); }
    pts.forEach((/** @type {number[]} */ p, /** @type {number} */ i) => { s += dot([sx(p[0]), jit(i)], sampled.has(i) ? 5 : 2, sampled.has(i) ? "fink" : "fmuted"); });
    s += line([30, 210], [570, 210], "axis") + text(300, 236, "points of X (jittered vertically for visibility); ● large = sampled", "lbl");
  } else {
    const sx = scale(0, 1, 40, 300), sy = scale(0, 1, 300, 40);
    if (I.miss.count) {
      const ux = Math.cos(I.miss.theta), uy = Math.sin(I.miss.theta), c = I.miss.cut, P1 = [c * ux - 2 * uy, c * uy + 2 * ux], P2 = [c * ux + 2 * uy, c * uy - 2 * ux], far = [ux * 3, uy * 3];
      s += `<clipPath id="sq"><rect x="40" y="40" width="260" height="260"/></clipPath><polygon clip-path="url(#sq)" points="${[P1, P2, [P2[0] + far[0], P2[1] + far[1]], [P1[0] + far[0], P1[1] + far[1]]].map((q) => `${sx(q[0]).toFixed(1)},${sy(q[1]).toFixed(1)}`).join(" ")}" class="${I.miss.count >= eps * N ? "fred" : "fmuted"}" opacity=".15"/>`;
    }
    s += `<rect x="40" y="40" width="260" height="260" fill="none" class="axis"/>`;
    pts.forEach((/** @type {number[]} */ p, /** @type {number} */ i) => { s += dot([sx(p[0]), sy(p[1])], sampled.has(i) ? 5 : 2, sampled.has(i) ? "fink" : "fmuted"); });
    s += text(170, 322, "shaded: heaviest halfplane avoiding the sample", "lbl");
  }
  s += `<g transform="translate(${E.P.family === "intervals" ? 30 : 330} ${E.P.family === "intervals" ? 260 : 60})">` + text(0, 0, `sample s = ${E.P.s}, heavy = ≥ ${E.A.heavy} points`, "ttl", "start") + text(0, 20, I.isNet ? "this sample is an ε-net ✓" : "this sample misses a heavy range ×", "ttl", "start") + text(0, 40, `union bound: Pr[fail] ≤ ${f(E.A.fail)}`, "lbl", "start") + "</g>";
  const vc = E.A.vcPts, vsx = scale(0, 1, 6, 66), vsy = scale(0, 1, 66, 6);
  const tiles = E.A.traces.map((/** @type {{ labels: number[], realised: boolean }} */ t) => `<span class="card" style="display:inline-block;padding:.2rem;margin:.15rem;text-align:center"><svg viewBox="0 0 72 72" width="54" height="54" role="img" aria-label="labeling ${t.labels.join("")} ${t.realised ? "realised" : "not realised"}">${vc.map((/** @type {number[]} */ p, /** @type {number} */ i) => dot([vsx(p[0]), E.P.family === "intervals" ? 36 : vsy(p[1])], 5, t.labels[i] ? "fink" : "fbg ink")).join("")}</svg><br><span class="small">${t.realised ? "✓" : "×"}</span></span>`).join("");
  return { svg: s + "</svg>", summary: `${N} points; a sample of ${E.P.s}. The heaviest range avoiding the sample holds ${I.miss.count} points (heavy means at least ${E.A.heavy}), so this sample ${I.isNet ? "is" : "is not"} an ε-net.`,
    extra: `<h3>VC panel — can ${vc.length} points realise every 0/1 labelling?</h3><div>${tiles}</div><p class="small">${E.A.shattered ? `All ${2 ** vc.length} labellings realised: this set is shattered.` : `Not every labelling is realised: this set is not shattered (filled = inside the range).`} VC dimension of ${esc(PM.RANGE_FAMILIES[E.P.family].label)} is ${E.A.d}.</p>` };
};

DRAW.entropy = (E, ui) => {
  const A = E.A, dist = A.dist.slice().sort((/** @type {{ p: number }} */ a, /** @type {{ p: number }} */ b) => b.p - a.p), maxS = Math.max(...dist.map((/** @type {{ p: number }} */ d) => (d.p > 0 ? -Math.log2(d.p) : 0)), 1);
  let s = svgOpen(600, 380, "Entropy as area: width = probability, height = surprise");
  const L = 30, W = 540, base = 170, hs = scale(0, maxS, 0, 130); let x = L;
  s += text(L, 18, "each outcome x: width Pr(x), height −log₂ Pr(x) — total area = H(X)", "lbl", "start");
  for (const d of dist) { if (d.p <= 0) continue; const w = d.p * W, h = hs(-Math.log2(d.p)); s += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${Math.max(0.5, w - 1).toFixed(1)}" height="${h.toFixed(1)}" class="fink" opacity=".55"/>`; if (w > 26) s += text(x + w / 2, base + 14, d.bits.join(""), "lbl"); x += w; }
  s += line([L, base], [L + W, base], "axis");
  const sc = scale(0, Math.max(A.sumHi, A.H, 0.01), L, L + W);
  s += text(L, 222, "GLOBAL INFORMATION BLOCK  H(X)", "lbl", "start") + `<rect x="${L}" y="228" width="${(sc(A.H) - L).toFixed(1)}" height="22" class="fink" opacity=".75"/>` + text(sc(A.H) + 4, 244, `${f(A.H)} bits`, "lbl", "start");
  s += text(L, 284, "SPLIT INTO COORDINATES  Σ H(Xᵢ)", "lbl", "start"); let cx = L;
  A.Hi.forEach((/** @type {number} */ h, /** @type {number} */ i) => { const w = sc(h) - L; s += `<rect x="${cx.toFixed(1)}" y="290" width="${Math.max(0.5, w - 2).toFixed(1)}" height="22" class="${i % 2 ? "fmuted" : "fink"}" opacity=".6"/>` + (w > 30 ? text(cx + w / 2, 305, `X${i + 1}`, "lbl") : ""); cx += w; });
  s += text(cx + 4, 306, `${f(A.sumHi)} bits`, "lbl", "start") + text(L, 340, `gap Σ H(Xᵢ) − H(X) = ${f(A.gap)} bits of shared information`, "ttl", "start");
  s += text(L, 362, `this sample: ${E.I.bits.join("")} with surprise ${f(E.I.X)} bits`, "lbl", "start");
  const shells = Array.from({ length: E.P.N + 1 }, (_, i) => [i, PM.logChoose(E.P.N, i) / Math.LN2]);
  const chart = lineChart({ x0: 0, x1: E.P.N, y0: 0, y1: E.P.N, title: "Hamming cube shells: log₂ C(N, i)", xlabel: "weight i", ylabel: "bits", series: [{ pts: shells, cls: "ink" }], markers: [{ x: A.r, label: `ball radius δN = ${A.r}` }, { y: A.bound, cls: "red", label: `N·h(δ) = ${f(A.bound)}` }, { y: A.logV, cls: "blue", label: `log₂ |ball| = ${f(A.logV)}` }] });
  return { svg: s + "</svg>", summary: `A ${E.P.bits}-bit chain with joint entropy ${f(A.H)} bits against ${f(A.sumHi)} bits for its coordinates. Hamming ball of radius ${A.r} in ${E.P.N} bits: log₂ size ${f(A.logV)} ≤ N·h(δ) = ${f(A.bound)}.`, extra: `<div class="stage">${chart}</div>` };
};

DRAW.derandomization = (E, ui) => {
  const G = E.F, A = E.A, n = G.n, k = Math.min(ui.labStep ?? n, n), path = A.path, pos = circlePos(n, 130, 190, 105);
  let s = svgOpen(600, 380, "Decision tree of conditional expectations");
  for (const [a, b] of G.edges) { const decided = a < k && b < k, cut = decided && A.assign[a] !== A.assign[b]; s += line(pos[a], pos[b], cut ? "green" : decided ? "faint" : "ink", `stroke-width="${cut ? 2.5 : 1}" ${decided ? "" : 'stroke-dasharray="3 3" opacity=".5"'}`); }
  pos.forEach((p, v) => { if (v < k) s += A.assign[v] ? dot(p, 8, "fink") : `<rect x="${p[0] - 7}" y="${p[1] - 7}" width="14" height="14" class="fbg ink" stroke-width="2"/>`; else s += dot(p, 6, "fbg faint"); s += text(p[0], p[1] - 11, `b${v + 1}`, "lbl"); });
  s += text(130, 330, "■ side 0 · ● side 1 · dashed: undecided (counts ½)", "lbl") + text(130, 348, "green: cut edges already decided", "lbl");
  const tx = 280, dy = Math.min(32, 300 / (n + 1));
  s += `<text x="${tx + 150}" y="${20}" class="ttl" text-anchor="middle">E[X] = ${esc(f(path[0].value))}</text>`;
  for (let i = 1; i <= k; i++) {
    const st = path[i], y = 20 + i * dy;
    s += text(tx, y, `b${i}`, "lbl", "start") + text(tx + 70, y, `0: ${f(st.e0)}`, st.choice === 0 ? "ttl" : "lbl", "start") + text(tx + 170, y, `1: ${f(st.e1)}`, st.choice === 1 ? "ttl" : "lbl", "start") + text(tx + 270, y, st.choice === 0 ? "← keep" : "keep →", "lbl", "start");
  }
  if (k === n) s += `<g transform="translate(${tx} ${Math.min(340, 30 + (n + 1) * dy)})">${text(0, 0, `RANDOM PROOF  E[X] ≥ ${f(A.mean)}`, "ttl", "start")}${text(0, 16, `⟹ DETERMINISTIC OBJECT  X = ${A.cut}`, "ttl", "start")}</g>`;
  return { svg: s + "</svg>", summary: `${k} of ${n} bits fixed. Conditional expectation ${f(path[k].value)} (it started at ${f(A.mean)}). ${k === n ? `Final cut: ${A.cut} of ${A.m} edges.` : ""}` };
};

DRAW.testing = (E, ui) => {
  const F = E.F, I = E.I, N = PM.TEST_N, reveal = !!ui.reveal, inS = new Map(I.S.map((/** @type {number} */ v, /** @type {number} */ i) => [v, i]));
  let s = svgOpen(600, 340, "A graph on 10,000 vertices; the tester sees only the sample");
  const cell = 3, gx = 10, gy = 10;
  if (reveal) for (let v = 0; v < N; v++) if (F.part[v] >= 0) s += `<rect x="${gx + (v % 100) * cell}" y="${gy + Math.floor(v / 100) * cell}" width="${cell}" height="${cell}" class="${["fred", "fblue", "fgreen"][F.part[v]]}" opacity=".5"/>`;
  s += `<rect x="${gx}" y="${gy}" width="${100 * cell}" height="${100 * cell}" fill="none" class="axis"/>`;
  for (const [v] of inS) s += dot([gx + (v % 100) * cell + 1.5, gy + Math.floor(v / 100) * cell + 1.5], 4, "fyellow", 'stroke="var(--strong)"');
  s += text(160, 326, reveal ? "hidden structure revealed (parts A, B, C shaded)" : "10,000 vertices; the tester sees only the yellow ones", "lbl");
  const ip = circlePos(I.S.length, 470, 150, 95), lab = (/** @type {number} */ v) => (F.part[v] < 0 ? "–" : "ABC"[F.part[v]]);
  for (const [a, b] of I.edges) s += line(ip[a], ip[b], "ink", 'opacity=".5"');
  if (I.witness) for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) s += line(ip[I.witness[a]], ip[I.witness[b]], "red", 'stroke-width="3"');
  ip.forEach((p, i) => { s += dot(p, 9, "fbg ink") + text(p[0], p[1] + 4, reveal ? lab(I.S[i]) : String(i + 1), "lbl"); });
  s += text(470, 268, "induced sample", "lbl") + text(470, 288, I.witness ? "witness triangle found — REJECT" : "no triangle seen — ACCEPT", "ttl");
  const counters = [["queries used", f(E.A.queries)], ["fraction of graph seen", PM.pct(E.A.seen, 2)], ["witness found", I.witness ? "YES" : "NO"]];
  return { svg: s + "</svg>", summary: `Graph on 10,000 vertices (${E.P.type === "far" ? `ε-far, ε = ${f(E.A.eps)}` : "triangle-free"}). The tester sampled ${E.P.s} vertices, made ${E.A.queries} queries and ${I.witness ? "found a triangle" : "found no triangle"}.`,
    extra: `<table class="rows">${counters.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join("")}</table><p><button class="btn quiet" type="button" data-act="reveal" aria-pressed="${reveal}">${reveal ? "Hide" : "Reveal"} the hidden structure</button></p><div class="stage">${lineChart({ x0: 3, x1: 62, y0: 0, y1: 1, title: "Pr[reject] against sample size (exact)", xlabel: "s", ylabel: "Pr[reject]", series: [{ pts: E.A.curve, cls: "ink" }], markers: [{ y: 2 / 3, cls: "green", label: "2/3" }, { x: E.P.s, label: `s = ${E.P.s}` }] })}</div>` };
};

DRAW.drc = (E, ui) => {
  const F = E.F, I = E.I, N = E.P.N, k = Math.min(ui.labStep ?? E.P.t, E.P.t), yA = (/** @type {number} */ a) => 30 + (a * 300) / Math.max(1, N - 1), xA = 120, xB = 360;
  let cur = Array.from({ length: N }, (_, a) => a); for (let i = 0; i < k; i++) cur = cur.filter((a) => F.adj[a][I.T[i]]);
  const inCur = new Set(cur), chosen = new Set(I.T.slice(0, k)), final = k === E.P.t, del = new Set(final ? I.deleted : []);
  let s = svgOpen(600, 360, "Dependent random choice on a bipartite graph");
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (F.adj[a][b] && chosen.has(b) && inCur.has(a)) s += line([xA, yA(a)], [xB, yA(b)], "ink", 'opacity=".45"');
  if (final) for (const [a, c] of I.bad.slice(0, 40)) s += `<path d="M${xA},${yA(a)} Q${xA - 60},${(yA(a) + yA(c)) / 2} ${xA},${yA(c)}" fill="none" class="red" stroke-width="1.5"/>`;
  for (let a = 0; a < N; a++) { const p = [xA, yA(a)]; s += inCur.has(a) ? (del.has(a) ? dot(p, 5, "fbg ink", 'opacity=".4"') + cross(p, 4) : dot(p, 5, final ? "fgreen" : "fink")) : dot(p, 3, "fbg faint"); }
  for (let b = 0; b < N; b++) { const p = [xB, yA(b)]; s += chosen.has(b) ? dot(p, 8, "fyellow", 'stroke="var(--strong)" stroke-width="2"') : dot(p, 3, "fmuted"); }
  s += text(xA, 18, "A", "ttl") + text(xB, 18, "B", "ttl") + text(470, 40, `chosen ${k} of t = ${E.P.t}`, "ttl") + text(470, 62, `|A′| = ${cur.length}`, "ttl");
  s += text(470, 84, `sizes: ${[N, ...I.steps.slice(0, k)].join(" → ")}`, "lbl") + (final ? text(470, 108, `bad pairs ${I.bad.length} (red arcs)`, "lbl") + text(470, 126, `deleted ${I.deleted.length} ×, |U| = ${I.U.length} ✓`, "lbl") : "");
  const tr = /** @type {{ t: number, EA: number, Ebad: number, gain: number }[]} */ (E.A.tradeoff), chart = lineChart({ x0: 1, x1: 8, y0: 0, y1: Math.max(...tr.map((d) => d.EA), 1), title: "Tradeoff in t: make A′ large vs kill bad pairs", xlabel: "t", ylabel: "expected count", series: [{ pts: tr.map((d) => [d.t, d.EA]), cls: "ink", label: "E|A′|" }, { pts: tr.map((d) => [d.t, d.Ebad]), cls: "red", dash: "4 3", label: "E[Y]" }, { pts: tr.map((d) => [d.t, Math.max(0, d.gain)]), cls: "green", label: "gain" }], markers: [{ x: E.P.t, label: `t = ${E.P.t}` }] });
  return { svg: s + "</svg>", summary: `Bipartite graph with ${N} + ${N} vertices. After ${k} chosen vertices the common neighbourhood has ${cur.length} vertices${final ? `; ${I.bad.length} bad pairs, ${I.deleted.length} deleted, final set U of ${I.U.length}` : ""}.`, extra: `<div class="stage">${chart}</div>` };
};

/* The labs whose picture steps through a process, and how many steps it has. */
/** @type {Partial<Record<string, (E: Evaluated) => number>>} */
const STEPPABLE = { alterations: (E) => 3, "moser-tardos": (E) => E.I.log.length, martingale: (E) => E.A.m, nibble: (E) => E.I.rounds.length, derandomization: (E) => E.P.n, drc: (E) => E.P.t };
