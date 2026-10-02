/* Generating Functions Lab: the page. Reads self.GF (engine), self.GFLab (curriculum) and
   self.Beamdswitch (deck writer). Every view is rendered from the route in the URL hash, so deep
   links, Back and Forward work; the presentation and the Markdown export are built from the same
   lesson states as the lab. */
(function () {
  "use strict";
  const G = self.GF, L = self.GFLab, T = self.Beamdswitch, D = self.GF_DATA;
  const $ = (id) => document.getElementById(id);
  const esc = G.esc;
  const range = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i);
  const val = (x) => (G.isQ(x) ? G.qstr(x) : G.fmtInt(x));
  const num = (x) => (G.isQ(x) ? G.qnum(x) : G.bigRatio(G.B(x), 1n));
  const tex = (t, display = false) => `<span class="math${display ? " display" : ""}">${G.texToHtml(t)}</span>`;
  /* Prose with inline $…$ maths and **bold**. */
  const rich = (s) => String(s ?? "").split(/(\$[^$]+\$)/).map((part) => (part.startsWith("$") && part.endsWith("$") && part.length > 2 ? tex(part.slice(1, -1)) : scripts(esc(part).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")))).join("");
  // Plain-text captions write exponents the TeX way (ω^{kn}, x^N, a_{N−1}); show them as super/subscripts.
  function scripts(h) { return h.replace(/\^\{([^{}]+)\}/g, "<sup>$1</sup>").replace(/_\{([^{}]+)\}/g, "<sub>$1</sub>").replace(/\^([A-Za-z0-9])/g, "<sup>$1</sup>"); }
  const svg = (w, h, inner, alt) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" role="img" aria-label="${esc(alt)}"><title>${esc(alt)}</title>${inner}</svg>`;
  const line = (x1, y1, x2, y2, cls = "l-muted", extra = "") => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" class="${cls}" ${extra}/>`;
  const arrow = (x1, y1, x2, y2, cls = "l-acc") => line(x1, y1, x2, y2, cls, `marker-end="url(#${({ "l-c2": "arr-c2", "l-c3": "arr-c3", "l-muted": "arr-muted" })[cls] || "arr"})"`);
  const text = (x, y, s, cls = "", anchor = "middle") => `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" class="${cls}">${esc(s)}</text>`;
  const f = (x) => (Math.round(x * 100) / 100).toString();
  const say = (msg) => { const el = $("live"); el.textContent = ""; setTimeout(() => { el.textContent = msg; }, 30); };
  const btn = (label, act, attrs = {}, on = false, cls = "btn sm") => `<button type="button" class="${cls}" data-act="${act}" ${Object.entries(attrs).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")} aria-pressed="${on}">${label}</button>`;

  /* ---------- state ---------- */
  const S = {
    route: null, mode: "explore", step: 0, analytic: false, reps: false, local: {}, lastLesson: "ogf",
    fourier: { N: 4, a: [1, 2, 3, 4], b: [1, 1, 0, 0], k: 1, col: null, view: "phasor", shown: "both", play: null },
    sandbox: { a: [1, 2, 3, 4].map((x) => G.Q(x)), b: "1, 1", rep: "coefficients", note: "" },
    prob: { k: null, hints: 0, solution: false, result: null },
    compare: { a: "1, 1, 1, 1, 1", b: "1, 1, 1, 1, 1", op: "labelled", n: 3 },
    present: null, play: null,
  };

  /* ---------- routing ---------- */
  function routeFromHash() {
    const r = L.parseHash(location.hash);
    const q = new URLSearchParams((location.hash.split("?")[1] || ""));
    if (r.page === "lesson") { S.mode = q.get("mode") === "guided" ? "guided" : S.mode === "guided" && !location.hash.includes("mode=") ? "explore" : S.mode; S.step = Math.max(0, Number(q.get("step")) || 0); }
    return r;
  }
  function hashOf(r) {
    let h = L.hashFor(r);
    if (r.page === "lesson" && S.mode === "guided") h += (h.includes("?") ? "&" : "?") + `mode=guided&step=${S.step}`;
    return h;
  }
  function go(r, { replace = false, focus = true } = {}) {
    const lessonChanged = !S.route || S.route.page !== r.page || S.route.id !== r.id || S.route.k !== r.k;
    if (lessonChanged && r.page === "lesson" && !(S.route && S.route.page === "lesson" && S.route.id === r.id)) { S.local = {}; if (S.mode !== "guided") S.step = 0; }
    S.route = r;
    const h = hashOf(r);
    try { if (replace) history.replaceState(null, "", h); else if (location.hash !== h) history.pushState(null, "", h); } catch (e) { /* sandboxed iframes may refuse history writes */ }
    render(lessonChanged && focus);
  }
  function onLocation() { const h = location.hash; if (S.rendered === h) return; S.route = routeFromHash(); S.local = {}; render(true); }
  addEventListener("popstate", onLocation);
  addEventListener("hashchange", onLocation);

  /* ---------- the concept map (left navigation) ---------- */
  function renderNav() {
    const r = S.route;
    let h = `<button type="button" class="btn sm nav-close" data-nav-close aria-label="Close the concept map">✕ Close</button>`;
    for (const b of L.BRANCHES) {
      h += `<h2>${esc(b.title)}</h2>`;
      for (const l of L.LESSONS.filter((x) => x.branch === b.id)) {
        const cur = r.page === "lesson" && r.id === l.id;
        h += `<a href="#${l.hash}" ${cur ? 'aria-current="page"' : ""}><span class="lv">${l.level}</span><span>${esc(l.nav)}${l.optional ? ' <span class="opt">optional</span>' : ""}</span></a>`;
      }
    }
    h += `<h2>Labs</h2>`;
    for (const [hash, label, page] of [["#problems", "Problem ladder", "problems"], ["#compare", "Compare techniques", "compare"], ["#fourier", "Fourier lab", "fourier"], ["#sandbox", "Finite-vector sandbox", "sandbox"], ["#map", "Concept map", "map"], ["#techniques", "Technique index", "techniques"], ["#confusions", "Common confusions", "confusions"]])
      h += `<a href="${hash}" ${r.page === page || (page === "problems" && r.page === "problem") ? 'aria-current="page"' : ""}><span class="lv">·</span><span>${label}</span></a>`;
    $("nav").innerHTML = h;
  }
  function renderModes() {
    const r = S.route, m = r.page === "lesson" ? S.mode : r.page === "problems" || r.page === "problem" ? "problems" : r.page === "compare" ? "compare" : r.page === "fourier" ? "transform" : "";
    for (const b of document.querySelectorAll("#modes button")) b.setAttribute("aria-pressed", String(b.dataset.v === m));
  }

  /* ---------- universal visual grammar: strip, tape, bins ---------- */
  function stripHtml(a, sel, { egf = false, label = "a" } = {}) {
    const mags = a.map((x) => Math.abs(num(x))), max = Math.max(...mags, 1e-12), useLog = max / Math.max(Math.min(...mags.filter((m) => m > 0), max), 1e-12) > 200;
    const hgt = (m) => (m <= 0 ? 0 : useLog ? 6 + 54 * Math.log1p(m) / Math.log1p(max) : 4 + 56 * (m / max));
    return `<div class="strip" role="group" aria-label="Coefficient strip${useLog ? ", log-scaled heights" : ""}">${a.map((x, n) => { const v = val(x), short = v.length > 7 ? G.fmtNum(num(x), 3) : v; return `<button type="button" class="bar" data-act="n" data-v="${n}" aria-pressed="${n === sel}" aria-label="${label} sub ${n} equals ${esc(v)}${egf ? " (EGF: divided by " + n + " factorial)" : ""}"><span class="v">${esc(short)}</span><span class="b" style="height:${f(hgt(Math.abs(num(x))))}px"></span><span class="i">${n}</span></button>`; }).join("")}</div>`;
  }
  function tapeHtml(a, sel, { egf = false, variable = "x" } = {}) {
    const terms = [];
    const show = new Set(range(Math.min(a.length, 8)));
    if (sel !== null && sel < a.length) show.add(sel);
    let last = -1;
    for (const n of [...show].sort((x, y) => x - y)) {
      const c = a[n], q = G.toQ(c);
      if (q.n === 0n && n !== sel) continue;
      if (last >= 0 && n > last + 1) terms.push(`<span class="plus">+ ⋯</span>`);
      const neg = q.n < 0n, mag = val(G.Q(q.n < 0n ? -q.n : q.n, q.d)), mono = n === 0 ? "" : n === 1 ? `<i>${variable}</i>` : `<i>${variable}</i><sup>${n}</sup>`;
      const coef = n > 0 && mag === "1" ? "" : q.d !== 1n ? `(${mag})` : mag;
      const body = egf && n > 0 ? `${coef || ""}${mono}/${n}!` : `${coef}${mono}` || "1";
      terms.push(`${terms.length ? `<span class="plus">${neg ? "−" : "+"}</span>` : neg ? "−" : ""}<button type="button" class="term" data-act="n" data-v="${n}" aria-pressed="${n === sel}" aria-label="term ${n}: ${esc(val(c))} ${variable} to the ${n}">${body}</button>`);
      last = n;
    }
    return `<div class="tape" role="group" aria-label="Series tape">${terms.join("")}<span class="plus">+ ⋯</span></div>`;
  }
  function binsHtml(l, p, sel) {
    if (!l.objects) return `<p class="small muted">This lesson's objects are shown in the visual above.</p>`;
    const top = Math.min(l.n.max, Math.max(5, sel + 1)), lo = Math.max(l.n.min, top - 6), bins = [];
    for (let n = lo; n <= top; n++) { const o = l.objects(n, p); bins.push(`<button type="button" class="binbox" data-act="n" data-v="${n}" aria-pressed="${n === sel}"><div class="muted">size ${n}</div><div>${esc(o.items.slice(0, 3).join(" "))}${o.total > 3 ? " …" : ""}</div><div class="muted">${o.total} object${o.total === 1 ? "" : "s"}</div></button>`); }
    const o = l.objects(sel, p);
    return `<div class="bins" role="group" aria-label="Object bins by size">${bins.join("")}</div><p class="small"><strong>${o.total}</strong> object${o.total === 1 ? "" : "s"} of size ${sel}${o.total > o.items.length ? ` (first ${o.items.length} shown)` : ""}${o.total === 0 && sel > 7 ? "" : ""}:</p><div class="objs">${o.items.map((x) => `<span class="obj">${esc(x)}</span>`).join("") || '<span class="muted small">none listed at this size</span>'}</div>`;
  }

  /* ---------- per-lesson visuals: each returns { html, alt } ---------- */
  const CW = 40;
  const VIS = {};
  VIS.strip = (l, p, n, st, step) => {
    const a = range(10), stages = ["strip", "tape", "fold", "extract"], cur = stages[Math.min(step, 3)];
    const row = (label, inner, on) => `<div style="opacity:${on ? 1 : 0.45};transition:opacity var(--dur)"><p class="eyebrow">${label}</p>${inner}</div>`;
    return { alt: `The constant strip 1, 1, 1, … becomes the tape 1 + x + x² + ⋯, which folds into 1/(1 − x). Selected n = ${n}.`, html:
      row("coefficient strip", stripHtml(a.map(() => 1n), n), cur === "strip") +
      row("series tape", tapeHtml(a.map(() => 1n), n), cur === "tape") +
      row("folded", `<p>${tex("1 + x + x^2 + \\cdots = \\frac{1}{1-x}", true)}</p>`, cur === "fold") +
      row("extraction", `<p>${tex(`[x^{${n}}]\\,\\frac{1}{1-x} = 1`, true)}</p>`, cur === "extract") };
  };
  VIS.geometric = (l, p, n) => {
    const N = p.N, w = Math.max(360, (N + 3) * 30), h = 80;
    let s = "";
    for (let i = 0; i <= N + 2; i++) { const x = 10 + i * 30, fade = i > N; s += `<rect x="${x}" y="14" width="26" height="26" rx="3" class="${i === n ? "s-acc" : fade ? "s-surface" : "s-soft"}" stroke="var(--border)"/>${text(x + 13, 58, i === 0 ? "1" : i === 1 ? "x" : "x" + G.sup(i), fade ? "small" : "m")}`; }
    s += text(10 + (N + 3) * 30 - 6, 32, "⋯", "m");
    return { alt: `Unit blocks x⁰ to x${G.sup(N)}, then fading blocks: the truncated series approaching the infinite one.`, html: svg(w, h, s, "repeated unit blocks") + `<p>${tex(`1 + x + \\cdots + x^{${N}} = \\frac{1-x^{${N + 1}}}{1-x}`, true)}</p><p class="small muted">Formal identity: every coefficient agrees, no x needed. Toggle <em>Analytic function</em> to see convergence for |x| &lt; 1.</p>` };
  };
  VIS.shift = (l, p, n) => {
    const a = L.coefficients(l, { ...p, k: 0 }, 9), k = p.k, cols = 9 + 5, w = 70 + cols * CW, rows = [["A", 0], ["xA", 1], [`x${G.sup(k)}A`, k]];
    let s = "";
    rows.forEach(([lab, sh], r) => {
      const y = 10 + r * 50;
      s += text(30, y + 26, lab, "m");
      s += `<g class="anim" data-shift="${r}" style="transform:translateX(${sh * CW}px)">${a.map((c, i) => `<rect x="${60 + i * CW}" y="${y}" width="${CW - 4}" height="34" rx="4" class="cell ${r === 2 && i + sh === n ? "on" : r === 0 && i === n - k ? "on" : ""}"/>${text(60 + i * CW + (CW - 4) / 2, y + 22, G.fmtInt(c))}`).join("")}</g>`;
      for (let i = 0; i < sh; i++) s += `<rect x="${60 + i * CW}" y="${y}" width="${CW - 4}" height="34" rx="4" class="cell dim"/>${text(60 + i * CW + 18, y + 22, "0", "small")}`;
    });
    s += line(60 + n * CW + 18, 4, 60 + n * CW + 18, 158, "l-acc dash");
    s += text(60 + n * CW + 18, 170, `n = ${n}`, "small");
    return { alt: `Three strips: A, xA shifted one place and x^${k}A shifted ${k} places. Column ${n} of the last strip holds a${G.subs(Math.max(0, n - k))}.`, html: svg(w, 178, s, "shifted coefficient strips") };
  };
  VIS.addsub = (l, p, n) => {
    const M = 15, w = 40 + M * 34; let s = "";
    for (let i = 0; i < M; i++) {
      const x = 30 + i * 34, even = i % 2 === 0, forb = p.mode !== "A + B" && i % 3 === 0;
      s += `<rect x="${x}" y="${30}" width="26" height="60" rx="3" class="${even ? "s-acc" : "s-c2"}" opacity="${forb ? 0.25 : i === n ? 1 : 0.7}" data-act="n" data-v="${i}"/>`;
      s += text(x + 13, 22, even ? "A" : "B", "small") + text(x + 13, 106, String(i), i === n ? "" : "small");
      if (forb) s += line(x, 30, x + 26, 90, "l-fg") + line(x + 26, 30, x, 90, "l-fg");
    }
    s += `<rect x="${30 + n * 34 - 3}" y="27" width="32" height="66" rx="5" fill="none" class="l-acc"/>`;
    return { alt: `Bars for sizes 0 to 14: A (even) and B (odd) stack into one bar per size${p.mode !== "A + B" ? "; multiples of 3 are crossed out" : ""}.`, html: svg(w, 116, s, "stacked bars for even and odd piles") + `<p class="small">${p.mode === "A + B" ? "Merged: every size has exactly one pile, so A + B = 1/(1 − x)." : "Forbidden sizes 0, 3, 6, … are removed by subtracting 1/(1 − x³)."}</p>` };
  };
  VIS.diff = (l, p, n) => {
    const ops = S.local.ops || [];
    let a = range(12).map(() => G.Q(1)), prev = null, label = "\\frac{1}{1-x}";
    const labels = { "": "\\frac{1}{1-x}", d: "\\frac{1}{(1-x)^2}", dx: "\\frac{x}{(1-x)^2}", i: "\\log\\frac{1}{1-x}", dd: "\\frac{2}{(1-x)^3}", x: "\\frac{x}{1-x}", xd: "\\frac{1}{(1-x)^2}", dxd: "\\frac{1+x}{(1-x)^3}", di: "\\frac{1}{1-x}", id: "\\frac{1}{1-x}", ix: "x\\log\\frac{1}{1-x}" };
    for (const op of ops) { prev = a; a = op === "d" ? a.slice(1).map((c, i) => G.qmul(c, G.Q(i + 1))) : op === "x" ? [G.Q(0), ...a.slice(0, -1)] : [G.Q(0), ...a.slice(0, -1).map((c, i) => G.qdiv(c, G.Q(i + 1)))]; while (a.length < 12) a.push(G.Q(0)); }
    label = labels[ops.join("")] ?? null;
    const c = `<div class="ctrls">${btn("Differentiate", "diff", { op: "d" })}${btn("Multiply by x", "diff", { op: "x" })}${btn("Integrate", "diff", { op: "i" })}${btn("Reset", "diff", { op: "reset" })}</div>`;
    return { alt: `Working sequence after ${ops.length ? ops.map((o) => ({ d: "differentiate", x: "multiply by x", i: "integrate" })[o]).join(", ") : "no operations"}: ${a.slice(0, 6).map(val).join(", ")}, …`, html: c + (prev ? `<p class="eyebrow">before</p><div style="opacity:.5">${stripHtml(prev.slice(0, 12), -1)}</div><p class="small muted">${({ d: "aₙ ↓ multiply by n ↓ shift left", x: "shift right by one", i: "divide by n ↓ shift right" })[ops.at(-1)]}</p>` : "") + `<p class="eyebrow">now ${ops.length ? "(" + ops.map((o) => ({ d: "d/dx", x: "×x", i: "∫" })[o]).join(" then ") + ")" : ""}</p>${stripHtml(a.slice(0, 12), n)}<p>${label ? tex(label, true) : '<span class="muted small">(no closed form stored for this chain; the coefficients above are exact)</span>'}</p>` };
  };
  VIS.recurrence = (l, p, n, st, step) => {
    const F = G.fibonacciDP(12), cols = 12, w = 110 + cols * CW, ids = st.map((s) => s.id), at = (id) => step >= ids.indexOf(id);
    const names = at("translate") ? ["F(x)", "xF(x)", "x²F(x)"] : ["Fₙ", "Fₙ₋₁", "Fₙ₋₂"];
    let s = "";
    [0, 1, 2].forEach((r) => { const y = 10 + r * 44; s += text(52, y + 24, names[r], "m"); for (let i = 0; i < cols; i++) { const v = i - r >= 0 ? G.fmtInt(F[i - r]) : "·"; s += `<rect x="${100 + i * CW}" y="${y}" width="${CW - 4}" height="32" rx="4" class="cell ${i === n ? "on" : ""}" data-act="n" data-v="${i}"/>${text(100 + i * CW + 18, y + 21, v)}`; } });
    if (at("combine")) { const y = 10 + 3 * 44 + 6; s += text(52, y + 24, "F − xF − x²F", "small"); for (let i = 0; i < cols; i++) s += `<rect x="${100 + i * CW}" y="${y}" width="${CW - 4}" height="32" rx="4" class="cell ${i === 1 ? "on" : "dim"}"/>${text(100 + i * CW + 18, y + 21, i === 1 ? "1" : "0")}`; }
    const tilings = n >= 1 ? G.compositionsList([1, 2], n - 1, 8) : [];
    const tilesSvg = tilings.map((c) => { let x = 0, t = ""; for (const s2 of c) { t += `<rect x="${x}" y="0" width="${s2 * 18 - 2}" height="16" rx="2" class="${s2 === 1 ? "s-soft" : "s-acc"}" stroke="var(--border)"/>`; x += s2 * 18; } return `<svg viewBox="0 0 ${Math.max(x, 18)} 16" width="${Math.max(x, 18)}" height="16" aria-hidden="true" style="display:inline-block;margin:2px 8px 2px 0">${t}</svg>`; }).join("");
    return { alt: `Rows Fₙ, Fₙ₋₁, Fₙ₋₂ aligned; column ${n} reads F${G.subs(n)} = F${G.subs(Math.max(n - 1, 0))} + F${G.subs(Math.max(n - 2, 0))}.`, html: svg(w, at("combine") ? 200 : 146, s, "aligned shifted Fibonacci rows") + `<p class="small">Column ${n}: ${n >= 2 ? `${G.fmtInt(F[n])} = ${G.fmtInt(F[n - 1])} + ${G.fmtInt(F[n - 2])}` : `F${G.subs(n)} = ${F[n]} (initial value)`}. Tilings of length ${Math.max(n - 1, 0)} by squares and dominoes (${n >= 1 ? G.fmtInt(F[n]) : 0}):</p><div>${tilesSvg || '<span class="muted small">none</span>'}${n >= 1 && F[n] > 8n ? " …" : ""}</div>` };
  };
  VIS.partial = (l, p, n) => {
    const phi = (1 + Math.sqrt(5)) / 2, psi = (1 - Math.sqrt(5)) / 2, M = 11, w = 520, h = 220, base = 170, sc = 2.2;
    let s = `<rect x="200" y="6" width="120" height="28" rx="6" class="s-soft" stroke="var(--accent)"/>${text(260, 25, "F(x)", "m")}`;
    s += arrow(230, 34, 120, 62) + arrow(290, 34, 400, 62);
    s += `<rect x="40" y="62" width="170" height="26" rx="6" class="s-surface" stroke="var(--border)"/>${text(125, 80, "pole 1/φ ≈ 0.618 → φⁿ/√5", "small")}`;
    s += `<rect x="310" y="62" width="180" height="26" rx="6" class="s-surface" stroke="var(--border)"/>${text(400, 80, "pole 1/ψ ≈ −1.618 → −ψⁿ/√5", "small")}`;
    for (let i = 0; i < M; i++) {
      const x = 40 + i * 42, A = Math.pow(phi, i) / Math.sqrt(5), Bv = -Math.pow(psi, i) / Math.sqrt(5);
      s += `<rect x="${x}" y="${base - A * sc}" width="16" height="${A * sc}" class="s-acc" opacity="${i === n ? 1 : 0.6}"/>`;
      s += `<rect x="${x + 17}" y="${Bv >= 0 ? base - Bv * sc * 10 : base}" width="10" height="${Math.abs(Bv) * sc * 10}" class="s-c2"/>`;
      s += text(x + 13, base + 14, String(i), "small");
    }
    s += line(30, base, 510, base, "s-axis");
    const A = Math.pow(phi, n) / Math.sqrt(5), Bv = -Math.pow(psi, n) / Math.sqrt(5);
    return { alt: `F(x) splits at its two poles into geometric machines φⁿ/√5 and −ψⁿ/√5; at n = ${n} they are ${G.fmtNum(A, 6)} and ${G.fmtNum(Bv, 6)}, summing to F${G.subs(n)} = ${G.fmtInt(G.binet(n))}.`, html: svg(w, h, s, "partial fraction decomposition") + `<p class="small">n = ${n}: φⁿ/√5 = ${G.fmtNum(A, 8)}, −ψⁿ/√5 = ${G.fmtNum(Bv, 8)} (orange, drawn ×10), sum = <strong>${G.fmtInt(G.binet(n))}</strong> exactly (computed in ℚ(√5)).</p>` };
  };
  /* The product grid: cells (i, j) with a_i b_j; the anti-diagonal i + j = n is the coefficient c_n. */
  function gridSvg(a, b, n, { cyclic = false, label = "" } = {}) {
    const M = a.length, Nb = b.length, cw = M > 9 ? 30 : 38, w = 50 + Nb * cw, h = 40 + M * cw;
    let s = "";
    for (let j = 0; j < Nb; j++) s += text(50 + j * cw + cw / 2, 26, `b${G.subs(j)}=${val(b[j])}`, "small");
    for (let i = 0; i < M; i++) {
      s += text(22, 40 + i * cw + cw / 2 + 4, `a${G.subs(i)}`, "small");
      for (let j = 0; j < Nb; j++) {
        const k = cyclic ? (i + j) % M : i + j, on = k === n, wrapped = cyclic && i + j >= M;
        s += `<rect x="${50 + j * cw}" y="${36 + i * cw}" width="${cw - 3}" height="${cw - 3}" rx="3" class="cell hit ${on ? "on" : ""}" data-act="n" data-v="${k}" tabindex="-1"><title>a${i}·b${j} → x^${k}${wrapped ? " (wrapped)" : ""}</title></rect>`;
        s += text(50 + j * cw + (cw - 3) / 2, 36 + i * cw + cw / 2 + 2, cyclic ? `${k}${wrapped ? "↺" : ""}` : val(G.qmul(G.toQ(a[i]), G.toQ(b[j]))), on ? "" : "small");
      }
    }
    return svg(w, h, s, label || `product grid, ${cyclic ? "wrapped modulo " + M : "anti-diagonal i + j = " + n} highlighted`);
  }
  VIS.grid = (l, p, n) => {
    const M = Math.min(Math.max(n, 5) + 1, 13), a = range(M).map(() => 1n);
    const terms = range(n + 1).map((k) => `a${G.subs(k)}b${G.subs(n - k)}`);
    return { alt: `Product grid ${M}×${M}; the ${n + 1} cells on the anti-diagonal i + j = ${n} sum to c${G.subs(n)} = ${n + 1}.`, html: gridSvg(a, a, n) + `<p class="small">c${G.subs(n)} = ${terms.join(" + ")} = <strong>${n + 1}</strong>. Click any cell to read its diagonal.</p>` };
  };
  VIS.coins = (l, p, n) => {
    const ds = L.denoms(p), sols = G.coinSolutions(ds, n), pick = Math.min(S.local.coin ?? 0, Math.max(sols.length - 1, 0)), sel = sols[pick];
    const w = 380; let s = "";
    ds.forEach((d, r) => { const y = 20 + r * 34; s += text(40, y + 4, `${d}¢`, "m"); s += line(70, y, 70 + 290, y, "s-axis"); for (let c = 0; c * d <= n; c++) { const x = 70 + (290 * c * d) / Math.max(n, 1); s += `<circle cx="${f(x)}" cy="${y}" r="${sel && sel[r] === c ? 7 : 3.5}" class="${sel && sel[r] === c ? "s-acc" : "s-muted"}"/>`; } });
    const yb = 20 + ds.length * 34 + 10, X = ds.length - 2, Y = ds.length - 1, mx = Math.floor(n / ds[X]), my = Math.floor(n / ds[Y]), cs = Math.min(26, 300 / Math.max(mx + 1, my + 1, 1));
    let g = `${text(10, yb + 12, `lattice: ${ds[X]}¢ count →, ${ds[Y]}¢ count ↑`, "small", "start")}`;
    sols.forEach((sv, i) => { const x = 40 + sv[X] * cs, y = yb + 30 + (my - sv[Y]) * cs; g += `<circle cx="${f(x)}" cy="${f(y)}" r="${i === pick ? 8 : 5}" class="hit ${i === pick ? "s-acc" : "s-c3"}" data-act="local" data-k="coin" data-v="${i}" tabindex="-1"><title>${sv.map((c, j) => `${c}×${ds[j]}`).join(" + ")}</title></circle>`; });
    const hb = yb + 40 + (my + 1) * cs;
    return { alt: `Tracks for coins ${ds.join(", ")} up to ${n}; ${sols.length} lattice points satisfy the constraint. Selected: ${sel ? sel.map((c, j) => `${c}×${ds[j]}`).join(" + ") : "none"}.`, html: svg(w, hb, s + g, "coin tracks and lattice points") + `<p class="small">${sols.length} solutions of ${ds.map((d, i) => `${d === 1 ? "" : d}${"abc"[i]}`).join(" + ")} = ${n}. Selected (${pick + 1}/${sols.length}): <strong>${sel ? esc(sel.map((c, j) => `${c}×${ds[j]}`).join(" + ")) : "—"}</strong></p><div class="stepper">${btn("◀ previous solution", "local", { k: "coin", v: Math.max(pick - 1, 0) })}${btn("next solution ▶", "local", { k: "coin", v: Math.min(pick + 1, sols.length - 1) })}</div>` };
  };
  VIS.tiles = (l, p, n) => {
    const comps = G.compositionsList(L.partsOf(p), n, 40), cls = { 1: "s-soft", 2: "s-acc", 3: "s-c3" }, u = 24;
    const rows = comps.map((c) => { let x = 0, t = ""; for (const s2 of c) { t += `<rect x="${x}" y="0" width="${s2 * u - 3}" height="22" rx="3" class="${cls[s2] || "s-c2"}" stroke="var(--border)"/><text x="${x + (s2 * u - 3) / 2}" y="15" text-anchor="middle" class="small">${s2 === 1 ? "x" : "x" + G.sup(s2)}</text>`; x += s2 * u; } return `<div style="display:flex;gap:.6rem;align-items:center"><svg viewBox="0 0 ${Math.max(x, u)} 22" width="${Math.max(x, u)}" height="22" aria-hidden="true">${t}</svg><span class="small mono">${c.join("+") || "∅"}</span></div>`; });
    return { alt: `${comps.length} compositions of ${n} with parts ${L.partsOf(p).join(", ")}, each drawn as tiles whose lengths become powers of x.`, html: `<div style="display:grid;gap:.25rem">${rows.join("") || '<span class="muted">no compositions</span>'}</div>${G.compositionsCount(L.partsOf(p), n) > 40n ? `<p class="small muted">first 40 of ${G.fmtInt(G.compositionsCount(L.partsOf(p), n))}</p>` : ""}` };
  };
  VIS.builder = (l, p, n) => {
    const box = (title, gf, inner = "") => `<div style="border:1px solid var(--border);border-radius:.5rem;padding:.4rem .6rem;display:inline-flex;flex-direction:column;gap:.3rem;vertical-align:top;margin:.15rem;background:var(--surface)"><span class="eyebrow">${title}</span>${tex(gf)}${inner ? `<div>${inner}</div>` : ""}</div>`;
    const Z = box("atom Z", "x"), Z2 = box("atom pair Z²", "x^2"), Z3 = box("Z³", "x^3");
    const trees = { "SEQ(Z + Z²)": box("SEQUENCE", "\\frac{1}{1-A}", box("CHOICE", "A = x + x^2", Z + Z2)), "PAIR(SEQ(Z), SEQ(Z))": box("PAIR", "AB", box("SEQUENCE", "\\frac{1}{1-x}", Z) + box("SEQUENCE", "\\frac{1}{1-x}", Z)), "Z + Z²": box("CHOICE", "x + x^2", Z + Z2), "SEQ(Z + Z² + Z³)": box("SEQUENCE", "\\frac{1}{1-A}", box("CHOICE", "A = x + x^2 + x^3", Z + Z2 + Z3)) };
    const pairGrid = p.build.startsWith("PAIR") ? gridSvg(range(Math.max(n, 4) + 1).map(() => 1n), range(Math.max(n, 4) + 1).map(() => 1n), n) : "";
    return { alt: `Construction ${p.build} drawn as nested operator boxes with each box's generating function.`, html: `<div>${trees[p.build]}</div>${pairGrid ? `<p class="small">PAIR brings up the convolution grid:</p>${pairGrid}` : `<p class="small">${tex(L.BUILDS[p.build].tex)} = ${esc(G.seriesText(L.BUILDS[p.build].coeffs(9)))}</p>`}` };
  };
  VIS.nested = (l, p, n) => {
    const comps = G.compositionsList(range(n).map((i) => i + 1), n, 16);
    const one = (c) => `<span style="display:inline-flex;gap:.25rem;border:1px dashed var(--faint);border-radius:.4rem;padding:.2rem .3rem;margin:.15rem">${c.map((s2) => `<span style="border:1px solid var(--accent);border-radius:.3rem;padding:0 .25rem;background:var(--accent-soft)" class="mono small">${"•".repeat(s2)}</span>`).join("")}</span>`;
    return { alt: `${comps.length} outer rows whose slots hold inner blocks of total size ${n}.`, html: `<p class="eyebrow">outer slots (dashed) filled by inner blocks</p><div>${comps.map(one).join("") || "∅"}</div><div class="cols2" style="margin-top:.7rem"><div class="card"><p class="eyebrow">product A(x)B(x)</p><p class="small">one A-object beside one B-object; sizes add</p><span class="mono small">[••] × [•••] → ([••], [•••])</span></div><div class="card"><p class="eyebrow">composition A(B(x))</p><p class="small">every atom of an A-object becomes a B-object</p><span class="mono small">(u u u) → ([•][•••][••])</span></div></div>` };
  };
  function treeSvg(t, scale = 1) {
    const pos = []; let x = 0;
    const lay = (node, depth) => { if (node === null) { const me = { x: x++, depth, leaf: true }; pos.push(me); return me; } const L2 = lay(node[0], depth + 1); const me = { x: x++, depth, leaf: false }; const R = lay(node[1], depth + 1); me.kids = [L2, R]; pos.push(me); return me; };
    lay(t, 0);
    const maxD = Math.max(...pos.map((q) => q.depth)), w = Math.max(x * 9, 10) * scale, h = (maxD * 14 + 12) * scale;
    let s = "";
    for (const q of pos) if (q.kids) for (const k of q.kids) s += line(q.x * 9 * scale + 5, q.depth * 14 * scale + 6, k.x * 9 * scale + 5, k.depth * 14 * scale + 6, "l-fg");
    for (const q of pos) s += q.leaf ? `<rect x="${q.x * 9 * scale + 3}" y="${q.depth * 14 * scale + 4}" width="4" height="4" class="s-muted"/>` : `<circle cx="${q.x * 9 * scale + 5}" cy="${q.depth * 14 * scale + 6}" r="${3.6 * scale}" class="s-acc"/>`;
    return `<svg viewBox="0 0 ${f(w)} ${f(h)}" width="${f(w)}" height="${f(h)}" aria-hidden="true">${s}</svg>`;
  }
  const parenOf = (t) => (t === null ? "" : `(${parenOf(t[0])})${parenOf(t[1])}`);
  VIS.trees = (l, p, n) => {
    const trees = n <= 5 ? G.binaryTrees(n) : [], cat = G.catalanClosed(n);
    return { alt: `${G.fmtInt(cat)} binary trees with ${n} internal nodes${trees.length ? ", each drawn with its balanced parenthesis string" : ""}.`, html: `<p class="small">${tex("C = 1 + xC^2")}: a tree is a leaf (▪) or a root (●, contributes x) with two subtrees.</p><div style="display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end">${trees.map((t) => `<figure style="margin:0;text-align:center">${treeSvg(t, n <= 3 ? 1.6 : 1.1)}<figcaption class="mono small">${parenOf(t) || "ε"}</figcaption></figure>`).join("") || `<p class="muted small">${G.fmtInt(cat)} trees (drawn for n ≤ 5).</p>`}</div>` };
  };
  VIS.lagrange = (l, p, n) => {
    if (p.phi !== "(1+u)^2") {
      const t = n <= 5 ? G.rootedLabelledTrees(n) : null;
      return { alt: `Cayley trees: [xⁿ]T = nⁿ⁻¹/n! from (1/n)[uⁿ⁻¹]e^(nu).`, html: `<p>${tex(`[x^{${n}}]T = \\frac{1}{${n}}[u^{${n - 1}}]e^{${n}u} = \\frac{1}{${n}}\\cdot\\frac{${n}^{${n - 1}}}{${n - 1}!} = \\frac{${n}^{${n - 1}}}{${n}!}`, true)}</p><p class="small">${G.fmtInt(G.B(n) ** G.B(n - 1))} rooted labelled trees on ${n} vertices${t !== null ? `; brute force over all parent maps finds ${G.fmtInt(t)}` : ""}.</p>` };
    }
    const k = p.k, pw = G.power([1n, 2n, 1n], n, 2 * n + 1), want = n - k;
    const w = Math.max(360, (2 * n + 1) * 26 + 40), max = Math.max(...pw.map((c) => Number(c)));
    let s = "";
    pw.forEach((c, i) => { const hgt = 90 * Number(c) / max; s += `<rect x="${20 + i * 26}" y="${110 - hgt}" width="20" height="${hgt}" class="${i === want ? "s-acc" : "s-soft"}"/>${text(30 + i * 26, 124, String(i), "small")}`; });
    s += text(30 + want * 26, Math.max(110 - 90 * Number(pw[want] ?? 0n) / max - 6, 12), G.fmtInt(pw[want] ?? 0n));
    const unfold = ["T", "x\\,\\phi(T)", "x\\,\\phi(x\\,\\phi(T))", "x\\,\\phi(x\\,\\phi(x\\,\\phi(T)))"].map((t2, i) => `<div style="padding-left:${i * 1.2}rem">${i ? "↓ " : ""}${tex(t2)}</div>`).join("");
    return { alt: `Coefficients of (1 + u)^${2 * n}; the bar at u^${want} is selected: ${G.fmtInt(pw[want] ?? 0n)}, times ${k}/${n}.`, html: `<div class="cols2"><div><p class="eyebrow">tree of substitutions</p>${unfold}</div><div><p class="eyebrow">coefficient wanted ↓ coefficient in φ(u)ⁿ</p><p>${tex(`[x^{${n}}]T${k === 1 ? "" : `^{${k}}`} \\;\\to\\; \\frac{${k}}{${n}}[u^{${want}}](1+u)^{${2 * n}}`)}</p></div></div>${svg(w, 132, s, `coefficients of phi to the ${n}`)}<p class="small">${k}/${n} × ${G.fmtInt(pw[want] ?? 0n)} = <strong>${val(G.Q(G.B(k) * (pw[want] ?? 0n), n))}</strong></p>` };
  };
  VIS.labels = (l, p, n) => {
    const m = Math.min(n, 4), perms = G.permutations(m);
    const atoms = (lab) => `<span style="display:inline-flex;gap:.2rem;margin:.15rem;padding:.15rem .3rem;border:1px solid var(--border);border-radius:.3rem">${(lab || range(m).map(() => "•")).map((c) => `<span class="mono small" style="display:inline-block;min-width:1.2rem;text-align:center;border-radius:50%;background:var(--accent-soft)">${c}</span>`).join("")}</span>`;
    return { alt: p.view === "labelled" ? `${perms.length} labelled rows of ${m} atoms; the EGF divides by ${m}! to give 1.` : `One unlabelled row of ${m} atoms.`, html: `<p class="eyebrow">${p.view === "labelled" ? `labelled: ${m}! = ${perms.length} rows` : "ordinary: one row"}</p><div>${p.view === "labelled" ? perms.map((q) => atoms(q.map((i) => i + 1))).join("") : atoms(null)}</div><p>${p.view === "labelled" ? tex(`\\frac{${perms.length}}{${m}!}\\,x^{${m}} = x^{${m}}`) : tex(`1\\cdot x^{${m}}`)}</p>${n > 4 ? `<p class="small muted">Drawn for n ≤ 4; n = ${n} has ${G.fmtInt(G.factorial(n))} labelled rows.</p>` : ""}` };
  };
  VIS.split = (l, p, n) => {
    const k = Math.min(S.local.k ?? Math.min(2, n), n), subsets = [];
    for (let m = 0; m < 1 << n; m++) { const s2 = range(n).filter((i) => m & (1 << i)); if (s2.length === k) subsets.push(s2.map((i) => i + 1)); }
    const rows = range(n + 1).map((j) => `<tr${j === k ? ' class="hl"' : ""}><td>${j}</td><td>${G.fmtInt(G.binom(n, j))}</td><td>${G.fmtInt(G.factorial(j))}</td><td>1</td><td>${G.fmtInt(G.binom(n, j) * G.factorial(j))}</td></tr>`).join("");
    return { alt: `Choosing ${k} of ${n} labels for the left row: ${G.fmtInt(G.binom(n, k))} ways; total c${G.subs(n)} = ${G.fmtInt(G.arrangementsGF(n + 1)[n])}.`, html: `<div class="ctrls"><div class="ctrl"><span>left part size k</span>${range(n + 1).map((j) => btn(String(j), "local", { k: "k", v: j }, j === k)).join("")}</div></div><p class="small">C(${n}, ${k}) = ${G.fmtInt(G.binom(n, k))} ways to choose the left labels:</p><div class="objs">${subsets.slice(0, 40).map((s2) => `<span class="obj">{${s2.join(",")}} | {${range(n).map((i) => i + 1).filter((i) => !s2.includes(i)).join(",")}}</span>`).join("")}</div><div class="tablewrap"><table><thead><tr><th>k</th><th>C(n,k)</th><th>aₖ = k!</th><th>bₙ₋ₖ = 1</th><th>term</th></tr></thead><tbody>${rows}</tbody></table></div>` };
  };
  /* Islands: a permutation's cycles (or a partition's blocks), merged and split by transpositions. */
  function currentPerm(n) { let q = S.local.perm; if (!q || q.length !== n) q = S.local.perm = range(n).map((i) => (n > 1 ? [1, 0, 3, 2, 5, 4, 6, 7, 8, 9][i] ?? i : i)).map((v, i, arr) => (v < n ? v : i)); return q; }
  VIS.islands = (l, p, n) => {
    if (!p.kind.startsWith("cycles")) {
      const parts = n <= 6 ? G.setPartitions(n) : [], idx = Math.min(S.local.part ?? 0, Math.max(parts.length - 1, 0)), sp = parts[idx] || [];
      const blocks = []; sp.forEach((b, i) => (blocks[b] ??= []).push(i + 1));
      return { alt: `Set partition ${idx + 1} of ${parts.length}: ${blocks.length} blocks.`, html: `<div style="display:flex;flex-wrap:wrap;gap:.6rem">${blocks.map((b, i) => `<span style="border:2px solid var(--${["accent", "c2", "c3", "c4"][i % 4]});border-radius:1.2rem;padding:.3rem .7rem" class="mono">${b.join(" ")}</span>`).join("") || "∅"}</div><div class="stepper">${btn("◀ previous", "local", { k: "part", v: Math.max(idx - 1, 0) })}${btn("next ▶", "local", { k: "part", v: Math.min(idx + 1, parts.length - 1) })}<span class="small muted">${idx + 1} of ${parts.length}; ${blocks.length} islands → term ${tex(`\\frac{C^{${blocks.length}}}{${blocks.length}!}`)}</span></div>` };
    }
    const q = currentPerm(n), cyc = G.cyclesOf(q);
    const isl = cyc.map((c, i) => `<span style="border:2px solid var(--${["accent", "c2", "c3", "c4"][i % 4]});border-radius:1.2rem;padding:.3rem .7rem" class="mono">${c.map((v) => v + 1).join(" → ")}${c.length > 1 ? " ↺" : " ↺"}</span>`).join("");
    const terms = range(Math.max(n, 1) + 1).map((k) => (k === 0 ? "1" : k === 1 ? "C" : `\\frac{C^{${k}}}{${k}!}`));
    return { alt: `Permutation with ${cyc.length} cycles: ${cyc.map((c) => "(" + c.map((v) => v + 1).join(" ") + ")").join("")}.`, html: `<div style="display:flex;flex-wrap:wrap;gap:.6rem">${isl || "∅"}</div><div class="stepper">${btn("Merge two islands", "island", { op: "merge" })}${btn("Split an island", "island", { op: "split" })}</div><p>${terms.map((t2, k) => (k === cyc.length ? `<span class="hl">${tex(t2)}</span>` : tex(t2))).join(" + ")} + ⋯</p><p class="small muted">${cyc.length} island${cyc.length === 1 ? "" : "s"}: this object is counted in the term C${G.sup(cyc.length)}/${cyc.length}!.</p>` };
  };
  VIS.cycles = (l, p, n) => {
    const m = Math.min(n, 7), perms = G.permutations(m), q = perms[(p.pick * 7 + 3) % perms.length] || [], cyc = G.cyclesOf(q), R = 70, cx = 100, cy = 95;
    let s = "";
    const pt = (i) => [cx + R * Math.cos((2 * Math.PI * i) / Math.max(m, 1) - Math.PI / 2), cy + R * Math.sin((2 * Math.PI * i) / Math.max(m, 1) - Math.PI / 2)];
    q.forEach((t, i) => { const [x1, y1] = pt(i), [x2, y2] = pt(t); if (i === t) s += `<circle cx="${f(x1 + (x1 - cx) * 0.25)}" cy="${f(y1 + (y1 - cy) * 0.25)}" r="10" class="l-acc"/>`; else { const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy); s += arrow(x1 + (dx / d) * 14, y1 + (dy / d) * 14, x2 - (dx / d) * 14, y2 - (dy / d) * 14); } });
    q.forEach((_, i) => { const [x, y] = pt(i); s += `<circle cx="${f(x)}" cy="${f(y)}" r="12" class="s-soft" stroke="var(--accent)"/>${text(x, y + 4, String(i + 1))}`; });
    const st = G.stirling1(n + 1)[n];
    return { alt: `Permutation ${q.map((v) => v + 1).join(" ")} of ${m}: cycles ${cyc.map((c) => "(" + c.map((v) => v + 1).join(" ") + ")").join("")}.`, html: `<div class="cols2"><div>${svg(200, 190, s, "permutation as arrows")}</div><div><p class="small">two-line: ${range(m).map((i) => i + 1).join(" ")} ↦ ${q.map((v) => v + 1).join(" ")}</p><p class="small">cycles: <strong class="mono">${cyc.map((c) => "(" + c.map((v) => v + 1).join(" ") + ")").join("")}</strong> (${cyc.length})</p><p class="small">c(${n}, k), k = 0…${n}: ${st.map((c, k) => (k === cyc.length && m === n ? `<span class="hl">${G.fmtInt(c)}</span>` : G.fmtInt(c))).join(", ")}</p></div></div>${n > 7 ? `<p class="small muted">Drawn for n ≤ 7.</p>` : ""}` };
  };
  VIS.heatmap = (l, p, n) => {
    const M = 9, rows = G.stirling1(M), kSel = Math.min(S.local.k ?? 2, n), cw = 44, w = 70 + M * cw + 70, h = 30 + M * 30 + 10;
    let s = text(70 + (M * cw) / 2, 14, "k (cycles) →", "small");
    for (let i = 0; i < M; i++) {
      s += text(50, 30 + i * 30 + 19, `n=${i}`, "small");
      for (let k = 0; k < M; k++) { const c = rows[i][k] ?? 0n, inten = c > 0n ? 0.15 + 0.85 * Math.log1p(Number(c)) / Math.log1p(40320) : 0; s += `<rect x="${70 + k * cw}" y="${24 + i * 30}" width="${cw - 3}" height="27" rx="3" fill="var(--accent)" fill-opacity="${f(inten)}" stroke="${i === n && k === kSel ? "var(--fg)" : "var(--grid)"}" stroke-width="${i === n && k === kSel ? 2 : 1}" class="hit" data-act="cell" data-n="${i}" data-k="${k}" tabindex="-1"/>${c > 0n ? text(70 + k * cw + 20, 24 + i * 30 + 18, G.fmtInt(c), "small") : ""}`; }
      s += text(70 + M * cw + 30, 30 + i * 30 + 19, `Σ=${G.fmtInt(G.factorial(i))}`, i === n ? "" : "small");
    }
    const objs = n <= 5 ? G.permutations(n).filter((q) => G.cyclesOf(q).length === kSel).map((q) => G.cyclesOf(q).map((c) => `(${c.map((v) => v + 1).join(" ")})`).join("")) : [];
    return { alt: `Matrix of c(n, k); selected n = ${n}, k = ${kSel}: ${G.fmtInt(rows[Math.min(n, M - 1)]?.[kSel] ?? 0n)} permutations. Right column: y = 1 marginal n!.`, html: svg(w, h, s, "Stirling numbers heat map") + `<p class="small">Selected cell (n = ${n}, k = ${kSel}): ${objs.length ? objs.map((o) => `<span class="obj">${o}</span>`).join(" ") : "click a cell (n ≤ 5 lists the objects)"}.<br>Setting y = 1 sums each row (n!); ∂/∂y at y = 1 gives the total cycles, mean H${G.subs(n)} = ${G.qstr(L.harmonic(n))} ≈ ${G.fmtNum(G.qnum(L.harmonic(n)), 4)}.</p>` };
  };
  VIS.dice = (l, p, n) => {
    const pg = G.dicePGF(p.dice), M = pg.length, w = 40 + M * 22, max = Math.max(...pg.map(G.qnum));
    let s = "";
    pg.forEach((q, i) => { const hgt = 110 * G.qnum(q) / max; s += `<rect x="${20 + i * 22}" y="${130 - hgt}" width="18" height="${hgt}" class="${i === n ? "s-acc" : "s-soft"} hit" data-act="n" data-v="${i}" tabindex="-1"><title>P(sum=${i}) = ${G.qstr(q)}</title></rect>${i % 2 === 0 || M < 16 ? text(29 + i * 22, 144, String(i), "small") : ""}`; });
    const grid = p.dice === 2 ? `<p class="small">Two dice: the 6×6 grid of faces, diagonal i + j = ${n} (cells hold (1/6)(1/6)):</p>${gridSvg([0, ...range(6).map(() => G.Q(1, 6))], [0, ...range(6).map(() => G.Q(1, 6))], n, { label: "convolution grid for two dice" })}` : "";
    return { alt: `Histogram of the sum of ${p.dice} dice; P(sum = ${n}) = ${G.qstr(pg[n] ?? G.Q(0))}.`, html: svg(w, 150, s, "probability histogram") + `<p class="small">The histogram is the coefficient strip of ${tex("G(z)")}. P(sum = ${n}) = <strong>${G.qstr(pg[n] ?? G.Q(0))}</strong>.</p>` + grid };
  };
  /* Complex-plane helper: unit circle, axes, and a mapper. */
  function plane(size, scale, inner, alt, extra = 0) {
    const c = size / 2, m = (z) => [c + z.re * scale, c - z.im * scale];
    return { m, html: (body) => svg(size + extra, size, `${line(0, c, size, c, "s-axis")}${line(c, 0, c, size, "s-axis")}<circle cx="${c}" cy="${c}" r="${scale}" class="l-muted dash"/>${body}`, alt) };
  }
  VIS.filter = (l, p, n) => {
    const m = p.m, r = p.r % m, a = L.filterPoly(p), steps = S.play?.kind === "filter" ? S.play.step : m;
    const P = plane(240, 96 / m, "", `the ${m}th roots of unity and the phasor sum for x^${n}`), R = (z) => P.m(G.cmul(G.C(m), z)), pts = [G.C(0)]; let sum = G.C(0);
    for (let j = 0; j < m; j++) { sum = G.cadd(sum, G.cmul(G.C(1 / m), G.root(j * (n - r), m))); pts.push(sum); }
    let body = `<circle cx="120" cy="120" r="96" class="l-muted dash"/>`;
    for (let j = 0; j < m; j++) { const [x, y] = R(G.root(j, m)); body += `<circle cx="${f(x)}" cy="${f(y)}" r="5" class="s-c3"/>${text(x + (x > 120 ? 14 : -14), y - 6, j === 0 ? "1" : j === 1 ? "ω" : "ω" + G.sup(j), "m")}`; }
    for (let j = 0; j < Math.min(steps, m); j++) { const [x1, y1] = R(pts[j]), [x2, y2] = R(pts[j + 1]); body += arrow(x1, y1, x2, y2, j % 2 ? "l-c2" : "l-acc"); }
    const [sx, sy] = R(sum); body += `<circle cx="${f(sx)}" cy="${f(sy)}" r="6" fill="none" class="l-fg"/>`;
    const hit = ((n - r) % m + m) % m === 0;
    const cls = (i) => (((i - r) % m + m) % m === 0 ? "s-acc" : "s-surface");
    let st = ""; a.forEach((c, i) => { st += `<rect x="${10 + i * 28}" y="6" width="24" height="24" rx="3" class="${cls(i)} hit" stroke="${i === n ? "var(--fg)" : "var(--border)"}" stroke-width="${i === n ? 2 : 1}" data-act="n" data-v="${i}" tabindex="-1"/>${text(22 + i * 28, 22, G.fmtInt(c), "small")}${text(22 + i * 28, 44, String(i), "small")}`; });
    const total = G.rootsFilterExact(a, m, r);
    return { alt: `For x^${n}: the ${m} unit phasors ω^(j(${n}−${r})), head to tail, ${hit ? "all point to 1 and sum to 1" : "spread evenly and cancel to 0"}. Filtered total ${G.qstr(total)}.`, html: `<div class="cols2"><div>${P.html(body)}<div class="stepper">${btn("▶ Play the vector sum", "play", { kind: "filter", steps: m })}</div></div><div><p class="small">Monomial x${G.sup(n)}, residue class r = ${r} (mod ${m}). Arrows: the unit phasors ω<sup>j(n−r)</sup> head to tail; their sum is ${hit ? m : 0}, and dividing by ${m} gives:</p><p>${tex(`\\frac{1}{${m}}\\sum_{j=0}^{${m - 1}}\\omega^{j(${n}-${r})} = ${hit ? 1 : 0}`, true)}</p><p class="small">${hit ? "n ≡ r: every phasor points the same way." : "n ≢ r: the phasors spread evenly around the circle and cancel."}</p><p class="small">Fourier projection onto the character χ${G.subs(r)} of ℤ/${m}ℤ: ${tex(`P_{${r}} = \\frac{1}{${m}}\\sum_j \\omega^{-${r}j}T^j`)}, where ${tex("(TA)(x) = A(\\omega x)")}.</p></div></div>${svg(Math.max(10 + a.length * 28, 200), 52, st, "coefficients coloured by residue class")}<p class="small">Filtered sum (aₙ over n ≡ ${r} mod ${m}) = <strong>${G.qstr(total)}</strong> (exact in ℤ[ζ${G.subs(m)}]); explicit enumeration: ${G.fmtInt(G.residueSum(a, m, r))} ${G.qeq(total, G.Q(G.residueSum(a, m, r))) ? "✓" : "✗"}</p>` };
  };
  /* Phasor head-to-tail picture for A(ω^k), highlighting term col. */
  function phasorPlane(a, k, N, col = null, { size = 260, upto = null } = {}) {
    const path = G.phasorPath(a, k, N), maxR = Math.max(...path.map(G.cabs), 1), P = plane(size, (size / 2 - 16) / maxR, "", "");
    let body = "";
    for (let j = 0; j < N; j++) { const [x, y] = P.m(G.cmul(G.C(maxR > 1 ? 1 : 1), G.root(j, N))); body += `<circle cx="${f(x)}" cy="${f(y)}" r="3" class="s-c3"/>`; }
    const lim = upto ?? a.length;
    for (let i = 0; i < Math.min(lim, a.length); i++) { const [x1, y1] = P.m(path[i]), [x2, y2] = P.m(path[i + 1]); body += arrow(x1, y1, x2, y2, col === i ? "l-c2" : "l-acc"); }
    const [ex, ey] = P.m(path.at(-1)); body += `<circle cx="${f(ex)}" cy="${f(ey)}" r="5" class="s-fg"/>`;
    return svg(size, size, `${line(0, size / 2, size, size / 2, "s-axis")}${line(size / 2, 0, size / 2, size, "s-axis")}<circle cx="${size / 2}" cy="${size / 2}" r="${f((size / 2 - 16) / maxR)}" class="l-muted dash"/>${body}`, `phasors a_n omega^(${k}n) head to tail for root ${k} of ${N}, ending at ${G.fmtComplex(path.at(-1))}`);
  }
  const paren = (e) => (/^[−-]/.test(e) ? `(${e})` : e);
  const rootName = (k, N) => (N === 4 ? ["1", "i", "−1", "−i"][k % 4] : N === 2 ? ["1", "−1"][k % 2] : k === 0 ? "1" : k === 1 ? "ω" : "ω" + G.sup(k));
  const zStr = (z, N) => G.zExactString(z, N) ?? G.fmtComplex(G.zToComplex(z, N));
  VIS.vectors = (l, p, n) => {
    const N = p.N, a = L.fourierVec(N), v = G.dftExact(a, N), k = n % N;
    const rows = range(N).map((i) => `<div class="${i === k ? "hl" : ""}">a${G.subs(i)} = ${a[i]}</div><div class="${i === k ? "hl" : ""}">A(${rootName(i, N)}) = ${esc(zStr(v[i], N))}</div>`).join("");
    return { alt: `Coefficients ${a.join(", ")} and values at the ${N}th roots of unity: ${v.map((z) => zStr(z, N)).join("; ")}.`, html: `<div class="cols2"><div><p class="eyebrow">coefficient ↔ evaluation</p><div class="vec">${rows}</div><p class="small muted">ω = e<sup>2πi/${N}</sup>${N === 4 ? " = i" : ""}.</p></div><div><p class="eyebrow">A(${rootName(k, N)}) as phasors</p>${phasorPlane(a, k, N)}</div></div>` };
  };
  VIS.matrix = (l, p, n) => {
    const N = p.N, a = L.fourierVec(N), k = n % N, col = S.local.col ?? null, v = G.dftExact(a, N);
    const entry = (r, c) => { const e = (r * c) % N; return N === 4 ? ["1", "i", "−1", "−i"][e] : N === 2 ? ["1", "−1"][e] : e === 0 ? "1" : `ω${e === 1 ? "" : G.sup(e)}`; };
    const tbl = `<table class="dft-table" aria-label="DFT matrix"><thead><tr><th>k \\ n</th>${range(N).map((c) => `<th>${c}</th>`).join("")}<th>· a</th><th>A(ωᵏ)</th></tr></thead><tbody>${range(N).map((r) => `<tr${r === k ? ' class="hl"' : ""}><th>${r}</th>${range(N).map((c) => `<td><button type="button" class="${r === k && c === col ? "on" : ""}" data-act="entry" data-k="${r}" data-c="${c}" aria-label="row ${r} column ${c}: ${entry(r, c)}">${entry(r, c)}</button></td>`).join("")}<td>${r === 0 ? `[${a.join(", ")}]ᵀ` : ""}</td><td>${esc(zStr(v[r], N))}</td></tr>`).join("")}</tbody></table>`;
    return { alt: `DFT matrix for N = ${N}; row ${k} gives A(${rootName(k, N)}) = ${zStr(v[k], N)}.${col !== null ? ` Entry (${k}, ${col}) = ${entry(k, col)} rotates a${col}.` : ""}`, html: `<p class="small">${N === 4 ? "G = ℤ/4ℤ; " : ""}rows are characters χₖ(n) = ωᵏⁿ. Select an entry to highlight its phasor.</p><div class="tablewrap">${tbl}</div><div class="cols2"><div>${phasorPlane(a, k, N, col)}</div><div><p class="small">Row ${k}: A(${rootName(k, N)}) = ${a.map((c, i) => `${c}·${paren(entry(k, i))}`).join(" + ")} = <strong>${esc(zStr(v[k], N))}</strong></p>${col !== null ? `<p class="small">Entry (${k}, ${col}) = ${entry(k, col)}: coefficient a${G.subs(col)} = ${a[col]} is turned by ${entry(k, col)} (orange arrow).</p>` : ""}<p class="small muted">Views: coefficients (vector), phasors (left), matrix (above), polynomial (A evaluated at ${rootName(k, N)}).</p></div></div>` };
  };
  VIS.idft = (l, p, n) => {
    const N = p.N, a = L.fourierVec(N), v = G.dftExact(a, N), j = n % N;
    const terms = range(N).map((k) => G.cmul(G.zToComplex(v[k], N), G.root(-k * j, N)));
    const pts = [G.C(0)]; terms.forEach((t) => pts.push(G.cadd(pts.at(-1), t)));
    const maxR = Math.max(...pts.map(G.cabs), 1), size = 260, sc = (size / 2 - 16) / maxR, m = (z) => [size / 2 + z.re * sc, size / 2 - z.im * sc];
    let body = ""; for (let k = 0; k < N; k++) { const [x1, y1] = m(pts[k]), [x2, y2] = m(pts[k + 1]); body += arrow(x1, y1, x2, y2, k % 2 ? "l-c2" : "l-acc"); }
    const back = G.idftExact(v, N);
    return { alt: `Rotating each value A(ω^k) back by ω^(−k·${j}) and adding gives ${N}·a${j} = ${N * a[j]} on the real axis.`, html: `<div class="cols2"><div>${svg(size, size, `${line(0, size / 2, size, size / 2, "s-axis")}${line(size / 2, 0, size / 2, size, "s-axis")}${body}`, "inverse DFT phasor sum")}</div><div><p class="small">a${G.subs(j)} = (1/${N}) Σₖ A(ωᵏ)ω<sup>−${j}k</sup></p>${range(N).map((k) => `<div class="small mono">A(${rootName(k, N)})·${rootName((N - (k * j) % N) % N, N)} = ${G.fmtComplex(terms[k])}</div>`).join("")}<p class="small">Sum = ${G.fmtComplex(pts.at(-1))} = ${N}·a${G.subs(j)}, so a${G.subs(j)} = <strong>${G.qstr(back[j])}</strong></p><p class="small">IDFT(DFT(a)) = [${back.map(G.qstr).join(", ")}] = a ✓ (exact)</p></div></div>` };
  };
  VIS.cyclic = (l, p, n) => {
    const N = p.N, a = L.cycA(N), b = L.cycB(N), j = n % N, A = G.dftExact(a, N), Bv = G.dftExact(b, N), Cv = A.map((z, k) => G.zmul(z, Bv[k], N)), c = G.cyclicConvolution(a, b, N);
    const rows = range(N).map((k) => `<tr><td>${k}</td><td>${esc(zStr(A[k], N))}</td><td>${esc(zStr(Bv[k], N))}</td><td>${esc(zStr(Cv[k], N))}</td></tr>`).join("");
    const terms = range(N).filter((i) => b[((j - i) % N + N) % N] !== 0n).map((i) => `a${G.subs(i)}b${G.subs(((j - i) % N + N) % N)}${i > j ? "↺" : ""}`);
    return { alt: `Cyclic convolution of [${a}] and [${b}]: c = [${c}]; c${j} = ${terms.join(" + ")}. Via DFT: pointwise products, then inverse.`, html: `<div class="cols2"><div><p class="eyebrow">direct: grid wrapped mod ${N}</p>${gridSvg(a, b, j, { cyclic: true })}<p class="small">c${G.subs(j)} = ${terms.join(" + ")} = <strong>${G.fmtInt(c[j])}</strong> (↺ marks wrap-around)</p></div><div><p class="eyebrow">transform: DFT → multiply → IDFT</p><div class="tablewrap"><table><thead><tr><th>k</th><th>â = A(ωᵏ)</th><th>b̂</th><th>âb̂</th></tr></thead><tbody>${rows}</tbody></table></div><p class="small">IDFT(âb̂) = [${G.cyclicByDFT(a, b, N).map(String).join(", ")}] = [${c.map(String).join(", ")}] ✓</p></div></div>` };
  };
  VIS.fft = (l, p) => {
    const N = 8, stages = 3, w = 520, h = 300, colX = (s) => 60 + s * 140, rowY = (i) => 24 + i * 34;
    const rev = (i) => parseInt(i.toString(2).padStart(3, "0").split("").reverse().join(""), 2);
    let s = "";
    for (let st = 0; st < stages; st++) { const half = 1 << st; for (let i = 0; i < N; i++) { const partner = i ^ half; s += line(colX(st), rowY(i), colX(st + 1), rowY(i), "l-muted") + line(colX(st), rowY(i), colX(st + 1), rowY(partner), i & half ? "l-c2" : "l-acc"); } }
    for (let i = 0; i < N; i++) { s += text(colX(0) - 26, rowY(i) + 4, `a${G.subs(rev(i))}`, "small") + text(colX(stages) + 34, rowY(i) + 4, `A(ω${G.sup(i)})`, "small"); for (let st = 0; st <= stages; st++) s += `<circle cx="${colX(st)}" cy="${rowY(i)}" r="3" class="s-fg"/>`; }
    const M = p.size, naive = M * M, fast = (M / 2) * Math.log2(M), bw = 300;
    return { alt: `FFT butterfly for N = 8 in three stages; for length ${M}: ${naive} products naively versus ${fast} twiddle products.`, html: svg(w, h, s, "FFT butterfly diagram") + `<p class="small">Inputs in bit-reversed order; each stage combines A_even(x²) and x·A_odd(x²).</p><div class="small"><div>naive O(N²): ${naive.toLocaleString("en-US")} products</div><div style="height:12px;width:${bw}px;background:var(--c2);border-radius:3px"></div><div>FFT (N/2)log₂N: ${fast.toLocaleString("en-US")} twiddle products</div><div style="height:12px;width:${f(Math.max(2, (bw * fast) / naive))}px;background:var(--accent);border-radius:3px"></div></div>` };
  };
  VIS.automaton = (l, p, n) => {
    let s = `<circle cx="90" cy="70" r="30" class="s-soft" stroke="var(--accent)"/>${text(90, 66, "0", "m")}${text(90, 84, "last 0 / ε", "small")}<circle cx="260" cy="70" r="30" class="s-soft" stroke="var(--accent)"/>${text(260, 66, "1", "m")}${text(260, 84, "last 1", "small")}`;
    s += `<path d="M65 52 C 30 10, 10 60, 60 78" class="l-acc" marker-end="url(#arr)"/>${text(22, 30, "0 · x", "small")}`;
    s += `<path d="M115 55 C 160 30, 200 30, 235 55" class="l-acc" marker-end="url(#arr)"/>${text(175, 32, "1 · x", "small")}`;
    s += `<path d="M235 88 C 200 115, 160 115, 117 88" class="l-c2" marker-end="url(#arr-c2)"/>${text(175, 122, "0 · x", "small")}`;
    const strs = n <= 8 ? G.no11Strings(n) : [];
    let v = [1n, 0n]; const vs = []; for (let i = 0; i <= Math.min(n, 10); i++) { vs.push(v); v = [v[0] + v[1], v[0]]; }
    return { alt: `Two-state automaton; ${G.fmtInt(G.transferCounts(n + 1)[n])} accepted strings of length ${n}.`, html: `<div class="cols2"><div>${svg(330, 140, s, "two-state automaton for strings without 11")}</div><div><p>${tex("M = \\begin{bmatrix}1&1\\\\1&0\\end{bmatrix}")}</p><div class="tablewrap"><table><thead><tr><th>n</th><th>v₀ (end 0)</th><th>v₁ (end 1)</th><th>total</th></tr></thead><tbody>${vs.map((q, i) => `<tr${i === n ? ' class="hl"' : ""}><td>${i}</td><td>${q[0]}</td><td>${q[1]}</td><td>${q[0] + q[1]}</td></tr>`).join("")}</tbody></table></div></div></div><div class="objs">${strs.map((x) => `<span class="obj">${x || "ε"}</span>`).join("")}</div>` };
  };
  function ferrers(parts, hiPart) { const u = 9; let s = ""; parts.forEach((pp, r) => { for (let c = 0; c < pp; c++) s += `<circle cx="${c * u + 5}" cy="${r * u + 5}" r="3.4" class="${pp === hiPart ? "s-acc" : "s-muted"}"/>`; }); const w = Math.max(...parts, 1) * u + 2, h = Math.max(parts.length, 1) * u + 2; return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${s}</svg>`; }
  VIS.ferrers = (l, p, n) => {
    const parts = n <= 12 ? L.partList(p.kind, n) : [], hi = S.local.part ?? null;
    const sizes = range(Math.max(n, 1)).map((i) => i + 1).filter((k) => (p.kind === "odd" ? k % 2 : p.kind === "at most 3" ? k <= 3 : true));
    const factor = hi ? (p.kind === "distinct" ? `1 + x^{${hi}}` : `1 + x^{${hi}} + x^{${2 * hi}} + \\cdots = \\frac{1}{1-x^{${hi}}}`) : null;
    return { alt: `${parts.length || "Many"} Ferrers diagrams of ${n}${hi ? `; parts of size ${hi} highlighted` : ""}.`, html: `<div class="ctrls"><div class="ctrl"><span>highlight part size k</span>${sizes.slice(0, 12).map((k) => btn(String(k), "local", { k: "part", v: k }, k === hi)).join("")}</div></div>${factor ? `<p>${tex(factor, true)}</p>` : ""}<div style="display:flex;flex-wrap:wrap;gap:.8rem;align-items:flex-start">${parts.slice(0, 60).map((q) => `<figure style="margin:0">${ferrers(q, hi)}<figcaption class="mono small">${q.join("+") || "∅"}</figcaption></figure>`).join("") || `<p class="muted small">Diagrams drawn for n ≤ 12.</p>`}</div>` };
  };
  VIS.euler = (l, p, n) => {
    const dist = n <= 12 ? G.partitionsList(n, { distinct: true }) : [];
    const glaisher = (q) => q.flatMap((x) => { let m = x, k = 1; while (m % 2 === 0) { m /= 2; k *= 2; } return Array(k).fill(m); }).sort((x, y) => y - x);
    const N = 16, d = G.partitionsGF(N, { distinct: true }), o = G.partitionsGF(N, { parts: "odd" });
    return { alt: `${dist.length} distinct-part partitions of ${n}, each mapped by Glaisher's bijection to an odd-part partition.`, html: `<div class="tablewrap"><table><thead><tr><th>distinct parts</th><th></th><th>odd parts</th></tr></thead><tbody>${dist.map((q) => `<tr><td class="mono">${q.join("+") || "∅"}</td><td>↦</td><td class="mono">${glaisher(q).join("+") || "∅"}</td></tr>`).join("")}</tbody></table></div><div class="tablewrap"><table><thead><tr><th>n</th>${range(N).map((i) => `<th${i === n ? ' class="hl"' : ""}>${i}</th>`).join("")}</tr></thead><tbody><tr><th>Π(1 + xᵏ)</th>${d.map((c, i) => `<td${i === n ? ' class="hl"' : ""}>${c}</td>`).join("")}</tr><tr><th>Π 1/(1 − x²ᵏ⁻¹)</th>${o.map((c, i) => `<td${i === n ? ' class="hl"' : ""}>${c}</td>`).join("")}</tr></tbody></table></div>` };
  };
  /* Plot helper: series of points in data coordinates. */
  function plot(w, h, xs, ys, series, { xlabel = "", ylabel = "", marks = [] } = {}) {
    const [x0, x1] = xs, [y0, y1] = ys, X = (x) => 44 + ((x - x0) / (x1 - x0)) * (w - 56), Y = (y) => h - 28 - ((y - y0) / (y1 - y0)) * (h - 40);
    let s = line(44, h - 28, w - 10, h - 28, "s-axis") + line(44, 10, 44, h - 28, "s-axis") + text(w / 2, h - 6, xlabel, "small") + `<text x="12" y="${h / 2}" transform="rotate(-90 12 ${h / 2})" text-anchor="middle" class="small">${esc(ylabel)}</text>`;
    s += text(44, h - 15, G.fmtNum(x0, 3), "small") + text(w - 14, h - 15, G.fmtNum(x1, 3), "small") + text(36, h - 28, G.fmtNum(y0, 3), "small", "end") + text(36, 14, G.fmtNum(y1, 3), "small", "end");
    for (const sr of series) { const pts = sr.pts.filter(([x, y]) => Number.isFinite(y) && y >= y0 - (y1 - y0) && y <= y1 + (y1 - y0)); if (sr.dots) s += pts.map(([x, y]) => `<circle cx="${f(X(x))}" cy="${f(Y(Math.min(Math.max(y, y0), y1)))}" r="${sr.r || 2.5}" class="${sr.fill || "s-acc"}"/>`).join(""); else s += `<polyline points="${pts.map(([x, y]) => `${f(X(x))},${f(Y(Math.min(Math.max(y, y0), y1)))}`).join(" ")}" class="${sr.cls || "l-acc"}"/>`; }
    for (const mk of marks) s += line(X(mk), 10, X(mk), h - 28, "l-muted dash");
    return s;
  }
  VIS.poles = (l, p, n) => {
    const alphas = Object.keys({ "1/2": 0, "2/3": 0, "1": 0, "3/2": 0, "2": 0, "3": 0 }), al = G.qnum(G.Q(...p.alpha.split("/").map(Number)));
    const size = 240, sc = 50, c = size / 2;
    let body = `${line(0, c, size, c, "s-axis")}${line(c, 0, c, size, "s-axis")}<circle cx="${c}" cy="${c}" r="${sc}" class="l-muted dash"/><circle cx="${c}" cy="${c}" r="${f(sc / al)}" class="l-acc dash"/>`;
    for (const a of alphas) { const v = G.qnum(G.Q(...a.split("/").map(Number))), x = c + sc / v; body += `<g class="hit" data-act="param" data-k="alpha" data-v="${a}" tabindex="-1"><circle cx="${f(x)}" cy="${c}" r="9" fill="transparent"/>${a === p.alpha ? `<path d="M${f(x - 6)} ${c - 6}L${f(x + 6)} ${c + 6}M${f(x + 6)} ${c - 6}L${f(x - 6)} ${c + 6}" class="l-c2" stroke-width="3"/>` : `<circle cx="${f(x)}" cy="${c}" r="3" class="s-muted"/>`}</g>`; }
    body += text(c + sc / al, c + 22, `1/α = ${G.fmtNum(1 / al, 3)}`, "small");
    const M = 25, series = alphas.map((a) => { const v = G.qnum(G.Q(...a.split("/").map(Number))); return { pts: range(M).map((i) => [i, i * Math.log10(v)]), cls: a === p.alpha ? "l-acc" : "l-muted" }; });
    const pl = plot(300, 220, [0, M - 1], [-8, 12], series, { xlabel: "n", ylabel: "log₁₀ |aₙ|", marks: [n] });
    return { alt: `Pole at x = ${G.fmtNum(1 / al, 3)}; log₁₀ aₙ = n·log₁₀(${p.alpha}) has slope ${G.fmtNum(Math.log10(al), 3)}. Unit circle dashed grey; radius of convergence dashed blue.`, html: `<div class="cols2"><div>${svg(size, size, body, "complex x-plane with the pole")}<p class="small muted">Click a pole position (×) or use the α buttons.</p></div><div>${svg(300, 220, pl, "log coefficient size versus n")}</div></div><p class="small">Pole at x = 1/α = ${G.fmtNum(1 / al, 4)} → aₙ = αⁿ: ${al > 1 ? "inside the unit circle, coefficients grow" : al === 1 ? "on the unit circle, constant" : "outside the unit circle, coefficients decay"}.</p>` };
  };
  VIS.asymptotic = (l, p, n) => {
    const a = G.Q(...p.alpha.split("/").map(Number)), M = 200, ns = range(M).map((i) => i + 1);
    const ratio = ns.map((k) => [Math.log10(k), G.qnum(G.risingCoefficient(a, k)) / G.singularityEstimate(a, k)]);
    const cat = range(60).map((i) => i + 1).map((k) => [Math.log(k), Math.log(G.bigRatio(G.catalanClosed(k), 1n)) - k * Math.log(4)]);
    const pl1 = plot(300, 200, [0, Math.log10(M)], [0.4, 1.6], [{ pts: ratio }, { pts: [[0, 1], [Math.log10(M), 1]], cls: "l-muted dash" }], { xlabel: "log₁₀ n", ylabel: "exact / estimate" });
    const pl2 = plot(300, 200, [0, Math.log(60)], [-7, 0.2], [{ pts: cat, dots: true }, { pts: [[0, -0.5 * Math.log(Math.PI)], [Math.log(60), -0.5 * Math.log(Math.PI) - 1.5 * Math.log(60)]], cls: "l-c2" }], { xlabel: "log n", ylabel: "log(Cₙ/4ⁿ)" });
    const nn = Math.max(n, 1), ex = G.ratioToEstimate(G.catalanClosed(nn), G.catalanLogEstimate(nn));
    return { alt: `Left: [xⁿ](1−x)^−${p.alpha} divided by n^(α−1)/Γ(α) tends to 1. Right: log(Cₙ/4ⁿ) against log n follows a line of slope −3/2.`, html: `<div class="cols2"><div><p class="eyebrow">standard scale, α = ${p.alpha}</p>${svg(300, 200, pl1, "ratio of exact coefficient to estimate")}</div><div><p class="eyebrow">Catalan: 4ⁿ removed, slope −3/2 remains</p>${svg(300, 200, pl2, "Catalan polynomial correction")}</div></div><p class="small">Singularity at ¼ → factor 4ⁿ (divided out on the right). Square-root type → n<sup>−3/2</sup> (the slope). At n = ${nn}: Cₙ/(4ⁿ/(√π n<sup>3/2</sup>)) = ${G.fmtNum(ex, 6)}.</p>` };
  };
  VIS.saddle = (l, p, n) => {
    const r = Number(p.r) * n, th = range(181).map((i) => -Math.PI + (2 * Math.PI * i) / 180), mags = th.map((t) => G.contourMagnitude(n, r, t)), mx = Math.max(...mags);
    const pl = plot(320, 200, [-Math.PI, Math.PI], [0, 1.05], [{ pts: th.map((t, i) => [t, mags[i] / mx]) }], { xlabel: "θ on |z| = r", ylabel: "|eᶻ/zⁿ⁺¹| (scaled)", marks: [0] });
    const exact = 1 / G.qnum(G.Q(G.factorial(n))), bound = Math.exp(r - n * Math.log(r));
    return { alt: `Magnitude of the Cauchy integrand around |z| = ${G.fmtNum(r, 3)}; it peaks at θ = 0.`, html: `${svg(320, 200, pl, "integrand magnitude around the contour")}<p class="small">r = ${p.r}·n = ${G.fmtNum(r, 4)}. Cauchy bound eʳ/rⁿ = ${G.fmtNum(bound, 4)}${p.r === "1" ? " (smallest at r = n)" : ""}; exact 1/${n}! = ${G.fmtNum(exact, 6)}; saddle estimate eⁿ/(nⁿ√(2πn)) = ${G.fmtNum(G.saddleEstimate(n), 6)}.</p>` };
  };
  VIS.lattice = (l, p, n) => {
    const M = Math.max(n + 1, 6), g = G.latticeGrid(M), cw = M > 9 ? 34 : 44, w = 40 + M * cw, h = 30 + M * cw;
    let s = "";
    for (let a = 0; a < M; a++) for (let b = 0; b < M; b++) { const x = 30 + a * cw, y = h - 10 - (b + 1) * cw; s += `<rect x="${x}" y="${y}" width="${cw - 3}" height="${cw - 3}" rx="3" class="cell ${a === b ? (a === n ? "on" : "") : "dim"} hit" data-act="n" data-v="${a === b ? a : n}" tabindex="-1"/>${text(x + (cw - 3) / 2, y + cw / 2 + 2, G.fmtInt(g[a][b]), "small")}`; }
    let px = 30 + (cw - 3) / 2, py = h - 10 - cw / 2, d = `M${f(px)} ${f(py)}`; for (let i = 0; i < n; i++) { px += cw; d += ` L${f(px)} ${f(py)}`; py -= cw; d += ` L${f(px)} ${f(py)}`; }
    s += `<path d="${d}" class="l-c2"/>`;
    return { alt: `Lattice of path counts C(m+n, m); diagonal cell (${n}, ${n}) holds ${G.fmtInt(g[n][n])}; one staircase path drawn.`, html: svg(w, h, s, "coefficient lattice") + `<p class="small">Diagonal [x${G.sup(n)}y${G.sup(n)}] = C(${2 * n}, ${n}) = <strong>${G.fmtInt(g[n][n])}</strong>. One staircase path is drawn.</p>` };
  };
  VIS.unify = () => {
    const nodes = [["objects", "DISCRETE OBJECTS", 300, 20, "ogf"], ["coef", "COEFFICIENTS", 300, 70, "ogf"], ["gf", "GENERATING FUNCTION", 300, 120, "geometric-series"], ["alg", "ALGEBRA", 110, 180, "fibonacci"], ["comb", "COMBINATORICS", 300, 180, "symbolic-combinatorics"], ["ana", "ANALYSIS", 490, 180, "singularities"], ["alg2", "recurrences · convolution · composition", 110, 220, "convolution"], ["comb2", "constructions · labelled sets · partitions", 300, 245, "exponential-formula"], ["ana2", "singularities · asymptotics · contours", 490, 220, "singularity-analysis"], ["poly", "FINITE POLYNOMIAL", 110, 285, "finite-vectors"], ["roots", "EVALUATE AT ROOTS OF UNITY", 110, 335, "roots-of-unity"], ["dft", "DFT", 110, 385, "dft"], ["filt", "filters", 40, 435, "roots-of-unity"], ["pw", "pointwise products", 200, 435, "cyclic-convolution"], ["cyc", "cyclic convolution", 200, 480, "cyclic-convolution"]];
    const by = Object.fromEntries(nodes.map((q) => [q[0], q]));
    const edges = [["objects", "coef"], ["coef", "gf"], ["gf", "alg"], ["gf", "comb"], ["gf", "ana"], ["alg", "alg2"], ["comb", "comb2"], ["ana", "ana2"], ["alg2", "poly"], ["poly", "roots"], ["roots", "dft"], ["dft", "filt"], ["dft", "pw"], ["pw", "cyc"]];
    let s = edges.map(([a, b]) => arrow(by[a][2], by[a][3] + 10, by[b][2], by[b][3] - 12, "l-muted")).join("");
    for (const [id, lab, x, y, to] of nodes) { const w2 = Math.max(lab.length * 6.6, 60); s += `<a href="#${L.lesson(to).hash}" aria-label="${esc(lab)}: open ${esc(L.lesson(to).title)}"><rect x="${f(x - w2 / 2)}" y="${y - 12}" width="${f(w2)}" height="24" rx="6" class="${lab === lab.toUpperCase() ? "s-soft" : "s-surface"}" stroke="var(--border)"/>${text(x, y + 4, lab, lab === lab.toUpperCase() ? "" : "small")}</a>`; }
    return { alt: "Master diagram: objects → coefficients → generating function → algebra, combinatorics, analysis; algebra → finite polynomial → roots of unity → DFT → filters and pointwise products → cyclic convolution. Every node opens its lesson.", html: svg(600, 500, s, "the unifying concept diagram") + `<p class="small">Select any node to open its lesson.</p>` };
  };

  /* ---------- analytic views (Formal / Analytic toggle) ---------- */
  function analyticView(l, p, n) {
    if (l.id === "geometric-series") {
      const N = p.N, xs = range(97).map((i) => -0.96 + (1.92 * i) / 96);
      const s = plot(320, 200, [-1, 1], [0, 12], [{ pts: xs.map((x) => [x, 1 / (1 - x)]), cls: "l-c2" }, { pts: xs.map((x) => [x, G.evalAt(range(N + 1).map(() => 1n), x)]) }], { xlabel: "x", ylabel: "value", marks: [1] });
      return `${svg(320, 200, s, "partial sum versus 1/(1-x)")}<p class="small">Blue: 1 + x + ⋯ + x${G.sup(N)}. Orange: 1/(1 − x), with its pole at x = 1. Agreement improves as N grows only for |x| &lt; 1: the radius of convergence is 1.</p>`;
    }
    const poles = { fibonacci: [[0.618, "1/φ"], [-1.618, "1/ψ"]], "partial-fractions": [[0.618, "1/φ"], [-1.618, "1/ψ"]], catalan: [[0.25, "¼ (branch point)"]], "singularity-analysis": [[1, "1 (branch point)"], [0.25, "¼ for Catalan"]], "saddle-point": [] }[l.id] ?? [];
    if (l.id === "singularities") return `<p class="small">The pole moves in the visual above; the radius of convergence is the distance to it.</p>`;
    const size = 240, sc = 60, c = size / 2;
    let body = `${line(0, c, size, c, "s-axis")}${line(c, 0, c, size, "s-axis")}<circle cx="${c}" cy="${c}" r="${sc}" class="l-muted dash"/>`;
    const rho = poles.length ? Math.min(...poles.map((q) => Math.abs(q[0]))) : null;
    if (rho) body += `<circle cx="${c}" cy="${c}" r="${f(rho * sc)}" class="l-acc dash"/>`;
    for (const [x, lab] of poles) body += `<path d="M${f(c + x * sc - 5)} ${c - 5}L${f(c + x * sc + 5)} ${c + 5}M${f(c + x * sc + 5)} ${c - 5}L${f(c + x * sc - 5)} ${c + 5}" class="l-c2" stroke-width="2.5"/>${text(c + x * sc, c - 10, lab, "small")}`;
    return `${svg(size, size, body, "complex plane with singularities")}<p class="small">${poles.length ? `Singularities: ${poles.map((q) => q[1]).join(", ")}. Radius of convergence ${G.fmtNum(rho, 3)} (blue circle); the nearest singularity fixes the exponential growth (1/${G.fmtNum(rho, 3)})ⁿ.` : "eˣ is entire: no singularities, infinite radius. Coefficients decay faster than any exponential; the saddle point replaces singularity analysis."}</p>`;
  }

  /* ---------- lesson page ---------- */
  function renderLesson(r) {
    const l = L.lesson(r.id), p = r.params, n = r.n, st = l.states(p, n);
    S.lastLesson = l.id;
    S.step = Math.min(S.step, st.length - 1);
    const vis = VIS[l.visual](l, p, n ?? 0, st, S.step);
    const idx = L.LESSONS.indexOf(l), prev = L.LESSONS[idx - 1], next = L.LESSONS[idx + 1];
    const ctrls = Object.entries(l.params || {}).map(([k, spec]) => `<div class="ctrl" role="group" aria-label="${esc(spec.label)}"><span>${esc(spec.label)}</span>${spec.values.filter((v) => !spec.valid || spec.valid(v, p)).map((v) => btn(esc(String(v)), "param", { k, v }, String(v) === String(p[k]))).join("")}</div>`).join("");
    const variable = l.variable || "x";
    let gfCard = "", exCard = "";
    if (l.gfName) {
      const Nshow = l.gfType === "finite" && p.N ? (l.id === "fft" ? 5 : p.N) : Math.min(l.n.max + 1, Math.max(n + 2, 10), 16), a = L.coefficients(l, p, Nshow), egf = L.isEgf(l, p);
      const analyticToggle = l.analytic ? `<div class="ctrl" role="group" aria-label="Formal or analytic">${btn("Formal power series", "analytic", { v: 0 }, !S.analytic)}${btn("Analytic function", "analytic", { v: 1 }, S.analytic)}</div>` : "";
      gfCard = `<section class="card" aria-labelledby="gf-h"><h2 id="gf-h">Generating function</h2>${analyticToggle}<p>${tex(`${l.gfName} = ${l.closed(p)}`, true)}</p>${a.length ? tapeHtml(a, n < Nshow ? n : null, { egf, variable }) + stripHtml(a, n, { egf }) : ""}<p class="small muted">${egf ? "EGF: the strip shows the counts aₙ; the series is Σ aₙxⁿ/n!." : l.gfType === "PGF" ? "PGF: coefficients are probabilities." : "Select a bar or a term to extract it."}</p>${l.analytic && S.analytic ? `<div class="card" style="margin-top:.6rem"><p class="eyebrow">analytic view</p>${analyticView(l, p, n)}</div>` : l.analytic ? `<p class="small muted">Formal mode: coefficients and algebra only; no convergence is required.</p>` : ""}</section>`;
      const v = L.coefficient(l, p, n), checks = L.verify(l, p, n), main = checks[0], allOk = checks.every((c) => c.pass);
      exCard = `<section class="card" aria-labelledby="ex-h"><h2 id="ex-h">Coefficient extraction</h2><div class="extract"><label for="n-input">Coefficient: n =</label><button type="button" class="btn sm" data-act="n" data-v="${Math.max(l.n.min, n - 1)}" aria-label="previous n">◀</button><input id="n-input" type="number" inputmode="numeric" min="${l.n.min}" max="${L.nMax(l, p)}" value="${n}" data-input="n"><button type="button" class="btn sm" data-act="n" data-v="${Math.min(L.nMax(l, p), n + 1)}" aria-label="next n">▶</button></div>
        <div class="verdict"><span>${tex(`${egf ? `${n}!\\,` : ""}[${variable}^{${n}}]\\,${l.gfName}`)}</span><span class="big">${esc(val(v).length > 40 ? G.fmtNum(num(v), 8) : val(v))}</span>${main && l.enumerate ? `<span class="muted">${esc(l.enumLabel)}</span><span class="big">${esc(main.other.length > 40 ? G.fmtNum(Number(main.other.split("/")[0].replace("−", "-")), 8) : main.other)}</span>` : ""}<span class="${allOk ? "ok" : "bad"}" style="grid-column:1/-1">${checks.length ? (allOk ? (checks.length === 1 ? "✓ the independent check agrees" : `✓ all ${checks.length} independent checks agree`) : "✗ a check disagrees") : ""}</span></div>
        <p>${esc(l.answer(n, v, p))}</p></section>`;
    }
    const stepsHtml = `<ol class="steps">${st.map((s, i) => { const show = S.mode !== "guided" || i <= S.step; return `<li class="${i === S.step ? "cur" : ""} ${S.mode === "guided" && i > S.step ? "later" : ""}"><span class="stage">${esc(s.stage)}</span><button type="button" class="st" data-act="step" data-v="${i}" aria-current="${i === S.step}">${esc(s.title)}</button>${show ? `${s.tex.map((t) => `<div>${tex(t, true)}</div>`).join("")}<p class="small">${rich(s.text)}</p>` : ""}</li>`; }).join("")}</ol>`;
    const stepper = `<div class="stepper">${btn("← Previous step", "step", { v: Math.max(0, S.step - 1) })}${btn("Next step →", "step", { v: Math.min(st.length - 1, S.step + 1) })}<span class="small muted">step ${S.step + 1} of ${st.length} · <kbd>←</kbd> <kbd>→</kbd> <kbd>Space</kbd></span></div>`;
    const reps = l.reps ? l.reps(p) : null;
    const repTable = reps ? `<div class="tablewrap"><table><tbody>${Object.entries(reps).map(([k, v]) => `<tr><th>${esc({ sequence: "sequence", series: "formal power series", closed: "closed form", recurrence: "recurrence", class: "combinatorial class", matrix: "matrix", roots: "root evaluations", asymptotic: "asymptotic expression" }[k] || k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table></div>` : "";
    const checks = l.gfName ? L.verify(l, p, n) : L.verifyAll();
    const checkTable = `<div class="tablewrap"><table><thead><tr><th>check</th><th>generating function</th><th>independent</th><th>method</th><th></th></tr></thead><tbody>${checks.slice(0, 60).map((c) => `<tr><td>${esc(c.name)}</td><td class="mono">${esc(c.gf)}</td><td class="mono">${esc(c.other)}</td><td class="small">${esc(c.method)}${c.tol ? ` (tolerance ${G.fmtNum(c.tol, 2)})` : ""}</td><td class="${c.pass ? "ok" : "bad"}">${c.pass ? "✓" : "✗"}</td></tr>`).join("")}</tbody></table></div>${checks.length > 60 ? `<p class="small muted">${checks.filter((c) => c.pass).length} of ${checks.length} pass.</p>` : ""}`;
    const later = L.LESSONS.filter((x) => x.prerequisites.includes(l.id));
    const link = (id) => { const x = L.lesson(id); return x ? `<a href="#${x.hash}">${esc(x.title)}</a>` : id === "ogf-egf" ? `<a href="#compare/ogf-egf">OGF vs EGF lab</a>` : id === "character-table" ? `<a href="#fourier">character table</a>` : esc(id); };
    const fourierView = l.gfName && l.coeffs ? (() => { const a = L.coefficients(l, p, 8), isInt = a.every((x) => !G.isQ(x) || x.d === 1n); const vals = G.dftFloat(a.map((x) => num(x)), 8); return `<p class="small">Truncate to degree &lt; 8 and evaluate at the 8th roots of unity: these are the Fourier coordinates of this strip. Multiplying two such truncations modulo x⁸ − 1 multiplies these values pointwise.</p><div class="tablewrap"><table><thead><tr><th>k</th>${range(8).map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody><tr><th>aₖ</th>${a.map((x) => `<td class="mono">${esc(val(x))}</td>`).join("")}</tr><tr><th>A(ωᵏ)</th>${vals.map((z) => `<td class="mono small">${esc(G.fmtComplex(z, 3))}</td>`).join("")}</tr></tbody></table></div>${isInt && a.every((x) => Math.abs(num(x)) < 1e6) ? `<button type="button" class="btn sm" data-act="to-fourier" data-v="${esc(a.map((x) => val(x).replace("−", "-")).join(","))}">Open this vector in the Fourier lab</button>` : ""}`; })() : "";
    const hdr = `<p class="eyebrow">Level ${l.level} · ${esc(L.BRANCHES.find((b) => b.id === l.branch).title)} · difficulty <span class="dots" aria-label="${l.difficulty} of 5">${"●".repeat(l.difficulty)}${"○".repeat(5 - l.difficulty)}</span>${l.optional ? " · optional" : ""}</p><h1 tabindex="-1" id="page-h">${esc(l.title)}</h1><div class="chips">${l.techniques.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}<span class="chip">${esc(l.gfType)}</span></div>`;
    return `${hdr}
      <section class="card problem" aria-labelledby="prob-h"><h2 id="prob-h" class="sr">Problem</h2><p>${rich(l.problem)}</p><p class="small muted">${rich(l.discreteModel)}</p></section>
      <section class="card" aria-labelledby="vis-h"><h2 id="vis-h">Visual model</h2>${ctrls ? `<div class="ctrls">${ctrls}</div>` : ""}<div class="visual" id="visual">${vis.html}</div><p class="sr">${esc(vis.alt)}</p></section>
      ${l.gfName ? `<div class="grid2">${gfCard}${exCard}</div>` : ""}
      <section class="card" style="margin-top:.9rem" aria-labelledby="ops-h"><h2 id="ops-h">${S.mode === "guided" ? "Guided derivation" : "Operations"}</h2>${S.mode === "guided" ? `<p class="small muted">Problem → choose encoding → apply operation → simplify → extract coefficient → interpret.</p>` : ""}${stepsHtml}${stepper}</section>
      <details><summary>Why this works</summary><div class="inner"><p>${rich(l.key)}</p></div></details>
      ${l.objects ? `<details${S.local.objOpen ? " open" : ""} data-keep="objOpen"><summary>Show objects</summary><div class="inner">${binsHtml(l, p, n)}</div></details>` : ""}
      ${reps && reps.recurrence ? `<details><summary>Show recurrence</summary><div class="inner"><p class="math display">${esc(reps.recurrence)}</p></div></details>` : ""}
      ${reps ? `<details${S.reps ? " open" : ""} data-keep="reps"><summary>Representations <kbd>V</kbd></summary><div class="inner">${repTable}<p class="small muted">Many hard discrete problems become simple after choosing the correct representation.</p></div></details>` : ""}
      ${l.analytic ? `<details${S.analytic ? " open" : ""}><summary>Show analytic view <kbd>F</kbd></summary><div class="inner">${analyticView(l, p, n)}</div></details>` : ""}
      ${fourierView ? `<details><summary>Show Fourier view</summary><div class="inner">${fourierView}</div></details>` : ""}
      <details${S.local.verOpen ? " open" : ""} data-keep="verOpen"><summary>Verify numerically</summary><div class="inner">${checkTable}<p class="small muted">Exact integer and rational arithmetic throughout; floating point only where a tolerance is shown.</p></div></details>
      <details><summary>When should I use this?</summary><div class="inner"><p>${esc(l.when)}</p></div></details>
      <details><summary>Related techniques</summary><div class="inner"><p class="small">Builds on: ${l.prerequisites.map(link).join(", ") || "nothing (start here)"}.</p><p class="small">Related: ${l.related.map(link).join(", ")}.</p><p class="small">Leads to: ${later.map((x) => link(x.id)).join(", ") || "the unifying picture"}.</p></div></details>
      <div class="navrow">${prev ? `<a class="btn" href="#${prev.hash}">← ${esc(prev.nav)}</a>` : "<span></span>"}${next ? `<a class="btn" href="#${next.hash}">${esc(next.nav)} →</a>` : "<span></span>"}</div>`;
  }

  /* ---------- problems ---------- */
  function renderProblems() {
    return `<h1 tabindex="-1" id="page-h">Problem ladder</h1><p class="muted">From trivial to difficult; each problem has its own visual, progressive hints and a checked answer. Solutions stay hidden until you ask.</p><div class="ladder">${L.PROBLEMS.map((p) => `<a href="#problem-${p.k}"><div class="card"><p class="eyebrow">Problem ${p.k} · <span class="dots">${"●".repeat(p.difficulty)}${"○".repeat(5 - p.difficulty)}</span></p><strong>${esc(p.title)}</strong><p class="small muted">${esc(p.technique)}</p></div></a>`).join("")}</div>`;
  }
  function renderProblem(k) {
    const pr = L.PROBLEMS.find((x) => x.k === k), l = L.lesson(pr.lesson), p = L.params(l, pr.params || {}), n = l.n ? L.clampN(l, pr.ask.n, p) : 0;
    if (S.prob.k !== k) S.prob = { k, hints: 0, solution: false, result: null, attempt: "" };
    const vis = VIS[l.visual](l, p, n, l.states(p, n), 0), next = L.PROBLEMS.find((x) => x.k === k + 1);
    const q = pr.ask.approx ? `Estimate C${G.subs(pr.ask.n)} (within 1%)` : `Your answer for [x${G.sup(pr.ask.n)}] (or the value asked)`;
    return `<p class="eyebrow">Problem ${pr.k} of ${L.PROBLEMS.length} · ${esc(pr.technique)} · <span class="dots">${"●".repeat(pr.difficulty)}${"○".repeat(5 - pr.difficulty)}</span></p><h1 tabindex="-1" id="page-h">${esc(pr.title)}</h1>
      <section class="card problem"><p>${rich(pr.problem)}</p><p class="small muted">Visual hint: ${rich(pr.visualHint)}</p></section>
      <section class="card"><h2>Visual</h2><div class="visual">${vis.html}</div><p class="sr">${esc(vis.alt)}</p></section>
      <section class="card"><h2>Attempt</h2><form class="extract" data-form="answer"><label for="ans">${q}:</label><input id="ans" class="seq" style="width:12rem" value="${esc(S.prob.attempt || "")}" autocomplete="off"><button class="btn sm" type="submit">Check</button></form>${S.prob.result ? `<p class="${S.prob.result.ok ? "ok" : "bad"}" role="status">${S.prob.result.ok ? "✓ Correct." : "✗ Not yet."} ${esc(S.prob.result.reason || "")}</p>` : ""}
        <h3>Hints</h3><ol>${pr.hints.slice(0, S.prob.hints).map((h) => `<li>${rich(h)}</li>`).join("")}</ol><div class="stepper">${S.prob.hints < pr.hints.length ? btn(`Show hint ${S.prob.hints + 1} of ${pr.hints.length}`, "hint") : `<span class="small muted">All hints shown.</span>`}${btn(S.prob.solution ? "Hide solution" : "Show solution", "solution")}</div>
        ${S.prob.solution ? `<div class="card" style="margin-top:.6rem"><p class="eyebrow">solution</p><p>${tex(pr.solution, true)}</p><p class="small">Checked value: <strong>${esc(pr.ask.approx ? G.fmtNum(G.bigRatio(G.B(L.problemAnswer(pr)), 1n), 6) + " (exact Cₙ)" : val(L.problemAnswer(pr)))}</strong></p></div>` : ""}</section>
      <div class="navrow"><a class="btn" href="#${l.hash}">Open the lesson: ${esc(l.title)}</a>${next ? `<a class="btn" href="#problem-${next.k}">Next problem →</a>` : `<a class="btn" href="#problems">Back to the ladder</a>`}</div>`;
  }

  /* ---------- compare ---------- */
  function parseVec(s, limit = 12) { return String(s).split(/[,\s]+/).filter(Boolean).slice(0, limit).map((x) => { const m = /^(−|-)?(\d+)(?:\/(\d+))?$/.exec(x.trim()); return m ? G.Q(G.B((m[1] ? "-" : "") + m[2]), G.B(m[3] || 1)) : null; }).filter(Boolean); }
  function renderCompare(id) {
    const c = L.COMPARISONS.find((x) => x.id === id) || L.COMPARISONS[0];
    const tabs = `<div class="ctrls" role="tablist">${L.COMPARISONS.map((x) => `<a class="btn sm" role="tab" aria-selected="${x.id === c.id}" href="#compare/${x.id}">${esc(x.title)}</a>`).join("")}</div>`;
    let body;
    if (c.id === "ogf-egf") {
      const a = parseVec(S.compare.a), b = parseVec(S.compare.b), N = Math.min(a.length, b.length), n = Math.min(S.compare.n, N - 1);
      const og = range(N).map((m) => range(m + 1).reduce((s, k) => G.qadd(s, G.qmul(a[k], b[m - k])), G.Q(0)));
      const eg = range(N).map((m) => range(m + 1).reduce((s, k) => G.qadd(s, G.qmul(G.Q(G.binom(m, k)), G.qmul(a[k], b[m - k]))), G.Q(0)));
      const ogTerms = range(n + 1).map((k) => `a${G.subs(k)}b${G.subs(n - k)}`).join(" + "), egTerms = range(n + 1).map((k) => `${G.fmtInt(G.binom(n, k))}·a${G.subs(k)}b${G.subs(n - k)}`).join(" + ");
      const lab = S.compare.op === "labelled";
      body = `<section class="card"><h2>One finite sequence, two encodings</h2><div class="cols2"><label class="small">a = <input class="seq" data-input="cmp-a" value="${esc(S.compare.a)}" aria-label="sequence a"></label><label class="small">b = <input class="seq" data-input="cmp-b" value="${esc(S.compare.b)}" aria-label="sequence b"></label></div>
        <p>${tex("\\text{OGF} = \\sum a_nx^n")} = ${esc(G.seriesText(a))}<br>${tex("\\text{EGF} = \\sum a_n\\frac{x^n}{n!}")} = ${esc(G.seriesText(a, { egf: true }))}</p>
        <div class="ctrls"><div class="ctrl"><span>operation</span>${btn("combine two independent unlabelled objects", "cmp-op", { v: "unlabelled" }, !lab)}${btn("combine two subsets of labels", "cmp-op", { v: "labelled" }, lab)}</div><div class="ctrl"><span>n</span>${range(N).map((m) => btn(String(m), "cmp-n", { v: m }, m === n)).join("")}</div></div>
        <div class="cols2"><div class="card" style="${!lab ? "border-color:var(--accent)" : ""}"><p class="eyebrow">OGF convolution</p><p>${tex("c_n = \\sum_k a_kb_{n-k}")}</p><p class="small mono">c${G.subs(n)} = ${ogTerms} = <strong>${esc(G.qstr(og[n]))}</strong></p><p class="small">sequence: ${og.map(G.qstr).join(", ")}</p></div>
        <div class="card" style="${lab ? "border-color:var(--accent)" : ""}"><p class="eyebrow">EGF convolution</p><p>${tex("c_n = \\sum_k \\binom{n}{k}a_kb_{n-k}")}</p><p class="small mono">c${G.subs(n)} = ${egTerms} = <strong>${esc(G.qstr(eg[n]))}</strong></p><p class="small">sequence: ${eg.map(G.qstr).join(", ")}</p></div></div>
        <p class="small">The binomial coefficient is the visible act of choosing which ${n} labels go to which component: for n = ${n} there are ${range(n + 1).map((k) => G.fmtInt(G.binom(n, k))).join(" + ")} = ${G.fmtInt(1n << G.B(n))} label splits.</p></section>`;
    } else {
      const side = (id2) => { const l = L.lesson(id2), p = L.defaults(l), n = l.n.def, v = VIS[l.visual](l, p, n, l.states(p, n), 0); return `<section class="card"><p class="eyebrow">Level ${l.level}</p><h2><a href="#${l.hash}">${esc(l.title)}</a></h2><p>${tex(`${l.gfName} = ${l.closed(p)}`, true)}</p><div class="visual">${v.html}</div><p class="small">${esc(l.answer(n, L.coefficient(l, p, n), p))}</p></section>`; };
      body = `<div class="cols2">${side(c.left)}${side(c.right)}</div>`;
    }
    return `<h1 tabindex="-1" id="page-h">Compare: ${esc(c.title)}</h1>${tabs}<p class="notice">${esc(c.note)}</p>${body}`;
  }

  /* ---------- Fourier lab (Transform mode) ---------- */
  function renderFourier() {
    const F = S.fourier, N = F.N, a = F.a.slice(0, N), v = G.dftExact(a, N), k = F.k % N, b = F.b.slice(0, N);
    const inputs = range(N).map((i) => `<label class="mono">a${G.subs(i)}</label><span><input type="number" min="-9" max="9" value="${a[i]}" data-input="fa" data-i="${i}" aria-label="a sub ${i}"></span>`).join("");
    const values = range(N).map((i) => `<button type="button" class="btn sm ${i === k ? "on" : ""}" data-act="froot" data-v="${i}" aria-pressed="${i === k}">A(${rootName(i, N)})</button><span class="mono">${esc(zStr(v[i], N))}</span>`).join("");
    const back = G.idftExact(v, N);
    const entry = (r, c) => { const e = (r * c) % N; return N === 4 ? ["1", "i", "−1", "−i"][e] : N === 2 ? ["1", "−1"][e] : e === 0 ? "1" : `ω${e === 1 ? "" : G.sup(e)}`; };
    const chars = `<table class="dft-table" aria-label="Character table of Z/${N}Z"><thead><tr><th>χₖ(n)</th>${range(N).map((c) => `<th>n=${c}</th>`).join("")}</tr></thead><tbody>${range(N).map((r) => `<tr${r === k ? ' class="hl"' : ""}><th>χ${G.subs(r)}</th>${range(N).map((c) => `<td><button type="button" class="${r === k && c === F.col ? "on" : ""}" data-act="fentry" data-k="${r}" data-c="${c}" aria-label="chi ${r} of ${c} equals ${entry(r, c)}">${entry(r, c)}</button></td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const thetas = range(181).map((i) => (2 * Math.PI * i) / 180), mag = thetas.map((t) => G.cabs(a.reduce((s, c, n) => G.cadd(s, G.cmul(G.C(c), G.C(Math.cos(n * t), Math.sin(n * t)))), G.C(0))));
    const mx = Math.max(...mag, 1), pl = plot(320, 180, [0, 2 * Math.PI], [0, mx * 1.05], [{ pts: thetas.map((t, i) => [t, mag[i]]) }, { pts: range(N).map((j) => [(2 * Math.PI * j) / N, G.cabs(G.zToComplex(v[j], N))]), dots: true, fill: "s-c2", r: 4 }], { xlabel: "θ (x = eⁱᶿ)", ylabel: "|A(e^{iθ})|" });
    const prodMod = G.cyclicConvolution(a, b, N), Bv = G.dftExact(b, N);
    const rootAnn = `root ${k} of ${N} selected: ${k === 0 ? "omega to the zero equals one" : `omega${k === 1 ? "" : " to the " + k} equals ${zStr(G.zeta(k, N), N).replace("−", "minus ")}`}; A equals ${zStr(v[k], N).replace(/−/g, "minus ")}`;
    return `<h1 tabindex="-1" id="page-h">Fourier lab</h1><p class="muted">The DFT is the change of coordinates from the coefficients of a polynomial to its values at the roots of unity (ω = e<sup>2πi/N</sup>; numpy's fft uses e<sup>−2πi/N</sup>, so its row k is our row N − k).</p>
      <div class="ctrls"><div class="ctrl"><span>N</span>${[2, 3, 4, 8].map((x) => btn(String(x), "fN", { v: x }, x === N)).join("")}</div>${btn("Reset to 1, 2, …, N", "freset")}${btn("Worked example: 1 + 2x + 3x² + 4x³", "fN", { v: 4, ex: 1 })}</div>
      <div class="cols2"><section class="card"><h2>Coefficient space</h2><div class="vec">${inputs}</div><p class="small">${tex(`A(x) = ${a.map((c, i) => `${c}${i === 1 ? "x" : i ? `x^{${i}}` : ""}`).join(" + ").replace(/\+ -/g, "- ")}`)}</p></section>
        <section class="card"><h2>Value space</h2><div class="vec">${values}</div><p class="small">${btn("DFT →", "fdft")} ${btn("← IDFT", "fidft")} IDFT(DFT(a)) = [${back.map(G.qstr).join(", ")}] ${back.every((q, i) => G.qeq(q, G.Q(a[i]))) ? "✓ exact" : "✗"}</p></section></div>
      <div class="cols2" style="margin-top:.9rem"><section class="card"><h2>Phasors: A(${rootName(k, N)}) head to tail</h2><div class="visual">${phasorPlane(a, k, N, F.col, { upto: S.play?.kind === "fourier" ? S.play.step : null })}</div><p class="small" aria-live="polite">${esc(rootAnn)}</p><div class="stepper">${btn("▶ Play contributions", "play", { kind: "fourier", steps: N })}</div><p class="small mono">${a.map((c, i) => `${c}·${paren(entry(k, i))}`).join(" + ")} = ${esc(zStr(v[k], N))}</p></section>
        <section class="card"><h2>Polynomial on the unit circle</h2><div class="visual">${svg(320, 180, pl, "magnitude of A around the unit circle, with the N evaluation points")}</div><p class="small">The DFT samples A at N equally spaced points of the unit circle (orange).</p></section></div>
      <section class="card" style="margin-top:.9rem"><h2>Character table and DFT matrix: G = ℤ/${N}ℤ</h2><p class="small">Rows are the characters χₖ(n) = ωᵏⁿ; the DFT is the expansion in the character basis of the cyclic group. Select an entry to highlight its phasor.</p><div class="tablewrap">${chars}</div><p class="small">residue classes ↔ cyclic group ↔ characters ↔ roots of unity ↔ Fourier coordinates</p></section>
      <section class="card" style="margin-top:.9rem"><h2>Algebra: ℂ[x]/(x${G.sup(N)} − 1) ≅ ℂ${G.sup(N)}</h2><p class="small">Second vector b = [${b.join(", ")}]. Multiplication modulo x${G.sup(N)} − 1 (cyclic convolution) on the left becomes coordinatewise multiplication of values on the right.</p><div class="cols2"><div><p class="small mono">A(x)B(x) mod (x${G.sup(N)} − 1) = [${prodMod.join(", ")}]</p></div><div><p class="small mono">${range(N).map((j) => `${zStr(v[j], N)} × ${zStr(Bv[j], N)} = ${zStr(G.zmul(v[j], Bv[j], N), N)}`).join("<br>")}</p><p class="small">IDFT of the products = [${G.cyclicByDFT(a, b, N).join(", ")}] ✓</p></div></div></section>
      <p class="small">Related lessons: <a href="#roots-of-unity">roots-of-unity filter</a> · <a href="#finite-vectors">finite GFs as vectors</a> · <a href="#dft">DFT matrix</a> · <a href="#inverse-dft">inverse DFT</a> · <a href="#cyclic-convolution">cyclic convolution</a> · <a href="#fft">FFT</a></p>`;
  }

  /* ---------- sandbox ---------- */
  function renderSandbox() {
    const s = S.sandbox, a = s.a, N = a.length, allInt = a.every((q) => q.d === 1n);
    const vals = allInt ? G.dftExact(a.map((q) => q.n), N).map((z) => zStr(z, N)) : G.dftFloat(a.map(G.qnum), N).map((z) => G.fmtComplex(z));
    return `<h1 tabindex="-1" id="page-h">Finite-vector sandbox</h1><p class="muted">Finite vectors only; exact rational arithmetic. No symbolic algebra.</p>
      <section class="card"><label class="small">Sequence: <input class="seq" data-input="sb-a" value="${esc(a.map(G.qstr).join(", "))}" aria-label="sequence"></label><label class="small">Second vector (for Add and Convolve): <input class="seq" data-input="sb-b" value="${esc(s.b)}" aria-label="second vector"></label>
      <div class="ctrls" style="margin-top:.6rem">${["Shift", "Differentiate", "Integrate", "Add", "Convolve", "Evaluate at roots of unity", "DFT", "Inverse DFT", "Reset"].map((x) => btn(x, "sb", { op: x })).join("")}</div>${s.note ? `<p class="small" role="status">${esc(s.note)}</p>` : ""}</section>
      <div class="cols2" style="margin-top:.9rem"><section class="card"><h2>Coefficients</h2>${stripHtml(a, -1)}<p class="small">${esc(G.seriesText(a, { terms: 12 }).replace(" + ⋯", ""))}</p></section><section class="card"><h2>Values at the ${N}th roots of unity${allInt ? " (exact)" : " (float)"}</h2>${range(N).map((k) => `<div class="small mono${s.rep === "values" ? " hl" : ""}">A(${rootName(k, N)}) = ${esc(vals[k])}</div>`).join("")}</section></div>`;
  }

  /* ---------- static pages ---------- */
  function renderMap() {
    const vis = VIS.unify();
    const fourierMap = `<pre class="small mono" style="overflow:auto">FINITE GF / POLYNOMIALS\n         │\n         ↓\nevaluate at roots of unity\n         │\n         ↓\n       DFT\n      ↙   ↘\nfilters   cyclic convolution</pre>`;
    return `<h1 tabindex="-1" id="page-h">Concept map</h1><p class="muted">The navigation teaches the dependency structure: every node opens its lesson.</p><section class="card"><div class="visual">${vis.html}</div></section><div class="cols2" style="margin-top:.9rem"><section class="card"><h2>Branches</h2>${L.BRANCHES.map((b) => `<h3>${esc(b.title)}</h3><p class="small">${L.LESSONS.filter((l) => l.branch === b.id).map((l) => `<a href="#${l.hash}">${l.level}. ${esc(l.nav)}</a>`).join(" → ")}</p>`).join("")}</section><section class="card"><h2>Fourier branch</h2>${fourierMap}<h3>Extended branch</h3><p class="small">OGF → <a href="#probability">probability GFs</a> · <a href="#bivariate">bivariate</a> / <a href="#multivariate">multivariate GFs</a> · <a href="#partitions">q-series</a>. Dirichlet generating functions are not covered.</p><h3>Two ways to explain an equality</h3><p class="small"><a href="#euler-identity">Euler's identity</a>: algebraic identity ↔ combinatorial bijection.</p></section></div>`;
  }
  function renderTechniques() {
    return `<h1 tabindex="-1" id="page-h">Technique index</h1><div class="tablewrap"><table><thead><tr><th>technique</th><th>first taught in</th><th>when to use</th></tr></thead><tbody>${L.TECHNIQUES.map((t) => { const l = L.techniqueLesson(t); return `<tr><td>${esc(t)}</td><td>${l ? `<a href="#${l.hash}">${l.level}. ${esc(l.title)}</a>` : "—"}</td><td class="small">${l ? esc(l.when) : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
  }
  function renderConfusions() {
    return `<h1 tabindex="-1" id="page-h">Common confusions</h1>${L.CONFUSIONS.map((c) => `<section class="card"><h2>${esc(c.title)}</h2><p>${esc(c.text)}</p><a class="small" href="#${L.lesson(c.lesson).hash}">See: ${esc(L.lesson(c.lesson).title)}</a></section>`).join("")}`;
  }

  /* ---------- render ---------- */
  function render(focus = false) {
    const r = S.route;
    let html;
    if (r.page === "lesson") html = renderLesson(r);
    else if (r.page === "problems") html = renderProblems();
    else if (r.page === "problem") html = renderProblem(r.k);
    else if (r.page === "compare") html = renderCompare(r.id);
    else if (r.page === "fourier") { if (r.N && r.N !== S.fourier.N && !S.fourierTouched) setFourierN(r.N); html = renderFourier(); }
    else if (r.page === "sandbox") html = renderSandbox();
    else if (r.page === "map") html = renderMap();
    else if (r.page === "techniques") html = renderTechniques();
    else html = renderConfusions();
    const active = document.activeElement, activeKey = active && active.closest && active.closest("#view") ? keyOf(active) : null;
    $("view").innerHTML = (r.unknown ? `<p class="notice">No lesson called “${esc(r.unknown)}”; showing the first lesson.</p>` : "") + html;
    renderNav(); renderModes();
    const t = r.page === "lesson" ? L.lesson(r.id).title : r.page === "problem" ? `Problem ${r.k}` : ({ problems: "Problem ladder", compare: "Compare", fourier: "Fourier lab", sandbox: "Sandbox", map: "Concept map", techniques: "Technique index", confusions: "Common confusions" })[r.page];
    document.title = `${t} · Generating Functions Lab`;
    S.rendered = location.hash;
    animateShift();
    if (focus) { const h = $("page-h"); if (h) h.focus({ preventScroll: false }); $("nav").classList.remove("open"); $("menu-btn").setAttribute("aria-expanded", "false"); }
    else if (activeKey) { const el = $("view").querySelector(activeKey); if (el) el.focus({ preventScroll: true }); }
  }
  /* Keep keyboard focus on the same control across re-renders. */
  function keyOf(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const ds = el.dataset || {}, parts = Object.entries(ds).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}="${CSS.escape(v)}"]`);
    return parts.length ? `${el.tagName.toLowerCase()}${parts.join("")}` : null;
  }
  /* Multiplying by x^k physically slides the third strip: animate from the previous k. */
  function animateShift() {
    const g = document.querySelector('[data-shift="2"]');
    if (!g) { S.prevShift = null; return; }
    const to = g.style.transform;
    if (S.prevShift !== null && S.prevShift !== undefined && S.prevShift !== to) { g.style.transition = "none"; g.style.transform = S.prevShift; g.getBoundingClientRect(); g.style.transition = ""; g.style.transform = to; }
    S.prevShift = to;
  }

  /* ---------- actions ---------- */
  function setLesson(patch, { announce } = {}) {
    const r = S.route, l = L.lesson(r.id);
    const next = { ...r, ...patch, params: { ...r.params, ...(patch.params || {}) } };
    if (l.n) next.n = L.clampN(l, next.n, next.params);
    go(next, { replace: true, focus: false });
    if (announce) say(announce);
  }
  function setFourierN(N, ex = false) { const F = S.fourier; F.N = N; F.a = ex ? [1, 2, 3, 4] : range(N).map((i) => i + 1); F.b = range(N).map((i) => (i < 2 ? 1 : 0)); F.k = 1 % N; F.col = null; }
  function play(kind, steps) {
    if (S.playTimer) clearInterval(S.playTimer);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { S.play = null; render(); say("Vector sum shown in full (reduced motion)."); return; }
    S.play = { kind, step: 0 }; render();
    S.playTimer = setInterval(() => { S.play.step++; if (S.play.step >= steps) { clearInterval(S.playTimer); S.playTimer = null; S.play = null; } render(); }, 280);
  }
  function sandbox(op) {
    const s = S.sandbox, a = s.a, b = parseVec(s.b, 16);
    switch (op) {
      case "Shift": s.a = [G.Q(0), ...a].slice(0, 16); s.note = "Multiplied by x: coefficients shifted right by one."; break;
      case "Differentiate": s.a = a.length > 1 ? a.slice(1).map((c, i) => G.qmul(c, G.Q(i + 1))) : [G.Q(0)]; s.note = "Differentiated: each aₙ multiplied by n and shifted left."; break;
      case "Integrate": s.a = [G.Q(0), ...a.map((c, i) => G.qdiv(c, G.Q(i + 1)))].slice(0, 16); s.note = "Integrated: aₙ₋₁/n, shifted right."; break;
      case "Add": { const N = Math.max(a.length, b.length); s.a = range(N).map((i) => G.qadd(a[i] ?? G.Q(0), b[i] ?? G.Q(0))); s.note = "Added termwise."; break; }
      case "Convolve": { const N = Math.min(a.length + b.length - 1, 16); s.a = range(N).map((m) => range(m + 1).reduce((t, k) => G.qadd(t, G.qmul(a[k] ?? G.Q(0), b[m - k] ?? G.Q(0))), G.Q(0))); s.note = "Convolved: [xⁿ]AB = Σ aₖbₙ₋ₖ."; break; }
      case "Evaluate at roots of unity": case "DFT": s.rep = "values"; s.note = `Evaluated at the ${a.length}th roots of unity (the DFT).`; break;
      case "Inverse DFT": { s.rep = "coefficients"; const allInt = a.every((q) => q.d === 1n); s.note = allInt ? `Inverse DFT recovers [${G.idftExact(G.dftExact(a.map((q) => q.n), a.length)).map(G.qstr).join(", ")}] exactly.` : "Inverse DFT recovers the coefficients (float round trip for rational entries)."; break; }
      default: s.a = [1, 2, 3, 4].map((x) => G.Q(x)); s.b = "1, 1"; s.rep = "coefficients"; s.note = "Reset.";
    }
    if (!s.a.length) s.a = [G.Q(0)];
    say(s.note); render();
  }
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-act]");
    if (!t || !t.closest("#view, #modes")) return;
    const a = t.dataset.act, r = S.route;
    if (a === "mode") { const m = t.dataset.v; if (m === "explore" || m === "guided") { S.mode = m; if (r.page !== "lesson") go(L.parseHash("#" + L.lesson(S.lastLesson).hash)); else go(r, { replace: true, focus: false }); say(`${m === "guided" ? "Guided" : "Explore"} mode.`); } else go({ page: m === "problems" ? "problems" : m === "compare" ? "compare" : "fourier", id: m === "compare" ? "ogf-egf" : undefined, N: S.fourier.N }); return; }
    if (a === "n" && r.page === "lesson") { setLesson({ n: Number(t.dataset.v) }, { announce: `Coefficient n = ${t.dataset.v}.` }); return; }
    if (a === "n" && r.page === "problem") return;
    if (a === "param") { const l = L.lesson(r.id), spec = l.params[t.dataset.k]; setLesson({ params: { [t.dataset.k]: spec.values.find((v) => String(v) === t.dataset.v) } }, { announce: `${spec.label}: ${t.dataset.v}.` }); return; }
    if (a === "step") { S.step = Number(t.dataset.v); go(r, { replace: true, focus: false }); const st = L.lesson(r.id).states(r.params, r.n)[S.step]; say(`Step ${S.step + 1}: ${st.title}. ${st.text}`); return; }
    if (a === "analytic") { S.analytic = t.dataset.v === "1"; render(); say(S.analytic ? "Analytic view: radius of convergence and singularities." : "Formal view: coefficients only."); return; }
    if (a === "local") { S.local[t.dataset.k] = Number.isNaN(Number(t.dataset.v)) ? t.dataset.v : Number(t.dataset.v); render(); return; }
    if (a === "diff") { const op = t.dataset.op; S.local.ops = op === "reset" ? [] : [...(S.local.ops || []), op].slice(-4); render(); say({ d: "Differentiated. Each coefficient multiplied by its index and shifted left.", x: "Multiplied by x. Coefficients shifted right by one.", i: "Integrated. Each coefficient divided by its new index and shifted right.", reset: "Reset to the constant sequence." }[op]); return; }
    if (a === "island") { const n = r.n, q = currentPerm(n).slice(), cyc = G.cyclesOf(q); if (t.dataset.op === "merge" && cyc.length > 1) { const x = cyc[0][0], y = cyc[1][0]; [q[x], q[y]] = [q[y], q[x]]; say("Merged two islands."); } else if (t.dataset.op === "split") { const c = cyc.find((z) => z.length > 1); if (c) { const x = c[0], y = c[1]; [q[x], q[y]] = [q[y], q[x]]; say("Split an island in two."); } else say("Every island is already a single label."); } else say("Only one island: nothing to merge."); S.local.perm = q; render(); return; }
    if (a === "cell") { S.local.k = Number(t.dataset.k); setLesson({ n: Number(t.dataset.n) }, { announce: `n = ${t.dataset.n}, k = ${t.dataset.k}.` }); return; }
    if (a === "entry") { S.local.col = Number(t.dataset.c); setLesson({ n: Number(t.dataset.k) }, { announce: `Entry row ${t.dataset.k}, column ${t.dataset.c}.` }); return; }
    if (a === "play") { play(t.dataset.kind, Number(t.dataset.steps)); return; }
    if (a === "hint") { S.prob.hints++; render(); say(`Hint ${S.prob.hints}.`); return; }
    if (a === "solution") { S.prob.solution = !S.prob.solution; render(); return; }
    if (a === "cmp-op") { S.compare.op = t.dataset.v; render(); return; }
    if (a === "cmp-n") { S.compare.n = Number(t.dataset.v); render(); return; }
    if (a === "fN") { setFourierN(Number(t.dataset.v), !!t.dataset.ex); S.fourierTouched = true; go({ page: "fourier", N: S.fourier.N }, { replace: true, focus: false }); return; }
    if (a === "freset") { setFourierN(S.fourier.N); render(); return; }
    if (a === "froot") { S.fourier.k = Number(t.dataset.v); S.fourier.col = null; render(); const N = S.fourier.N, k = S.fourier.k; say(`root ${k} of ${N} selected: value ${zStr(G.dftExact(S.fourier.a.slice(0, N), N)[k], N)}`); return; }
    if (a === "fentry") { S.fourier.k = Number(t.dataset.k); S.fourier.col = Number(t.dataset.c); render(); return; }
    if (a === "fdft") { say(`DFT: values ${G.dftExact(S.fourier.a.slice(0, S.fourier.N), S.fourier.N).map((z) => zStr(z, S.fourier.N)).join("; ")}`); return; }
    if (a === "fidft") { say(`Inverse DFT: coefficients ${G.idftExact(G.dftExact(S.fourier.a.slice(0, S.fourier.N), S.fourier.N)).map(G.qstr).join(", ")}`); return; }
    if (a === "to-fourier") { const v = t.dataset.v.split(",").map(Number); setFourierN(8); S.fourier.a = v.map((x) => Math.max(-9, Math.min(9, x))); S.fourierTouched = true; go({ page: "fourier", N: 8 }); return; }
    if (a === "sb") { sandbox(t.dataset.op); return; }
  });
  document.addEventListener("toggle", (ev) => { const d = ev.target; if (d.dataset && d.dataset.keep) { if (d.dataset.keep === "reps") S.reps = d.open; else S.local[d.dataset.keep] = d.open; } }, true);
  document.addEventListener("change", (ev) => {
    const t = ev.target, k = t.dataset && t.dataset.input;
    if (!k) return;
    if (k === "n" && S.route.page === "lesson") setLesson({ n: Number(t.value) }, { announce: `Coefficient n = ${t.value}.` });
    else if (k === "fa") { S.fourier.a[Number(t.dataset.i)] = Math.max(-9, Math.min(9, Math.round(Number(t.value) || 0))); S.fourierTouched = true; render(); }
    else if (k === "cmp-a" || k === "cmp-b") { const v = parseVec(t.value); if (v.length) S.compare[k === "cmp-a" ? "a" : "b"] = v.map(G.qstr).join(", "); render(); }
    else if (k === "sb-a") { const v = parseVec(t.value, 16); if (v.length) S.sandbox.a = v; S.sandbox.note = v.length ? "" : "Enter integers or fractions separated by commas."; render(); }
    else if (k === "sb-b") { S.sandbox.b = t.value; }
  });
  document.addEventListener("submit", (ev) => {
    const form = ev.target;
    if (form.dataset.form !== "answer") return;
    ev.preventDefault();
    const pr = L.PROBLEMS.find((x) => x.k === S.route.k), v = form.querySelector("input").value;
    S.prob.attempt = v; S.prob.result = L.checkAnswer(pr, v); render(); say(S.prob.result.ok ? "Correct." : "Not yet. Try a hint.");
  });

  /* ---------- menu, palette, export ---------- */
  const beamBtn = $("beam-btn"), beamMenu = $("beam-menu");
  function toggleMenu(open = beamMenu.hidden) { beamMenu.hidden = !open; beamBtn.setAttribute("aria-expanded", String(open)); if (open) { updateMenu(); beamMenu.querySelector("button:not([disabled])").focus(); } }
  function updateMenu() { beamMenu.querySelector('[data-beam="lesson"]').disabled = S.route.page !== "lesson"; beamMenu.querySelector('[data-beam="problem"]').disabled = S.route.page !== "problem"; }
  beamBtn.addEventListener("click", () => toggleMenu());
  beamMenu.addEventListener("keydown", (ev) => { const items = [...beamMenu.querySelectorAll("button:not([disabled])")], i = items.indexOf(document.activeElement); if (ev.key === "ArrowDown") { ev.preventDefault(); items[(i + 1) % items.length].focus(); } if (ev.key === "ArrowUp") { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); } if (ev.key === "Escape") { toggleMenu(false); beamBtn.focus(); } });
  document.addEventListener("click", (ev) => { if (!beamMenu.hidden && !ev.target.closest(".rel")) toggleMenu(false); });
  /* The deck for the current context: lesson, problem, or the full core deck. */
  function currentReport(kind) {
    const r = S.route;
    if (kind === "full") return { report: L.fullReport(), name: "generating-functions-core.md", what: "Full core deck" };
    if ((!kind || kind === "problem") && r.page === "problem") return { report: L.problemReport(r.k), name: `generating-functions-problem-${r.k}.md`, what: `Problem ${r.k}` };
    if (r.page === "lesson") { const l = L.lesson(r.id); return { report: L.lessonReport(l.id, r.params, r.n), name: `generating-functions-${l.hash}.md`, what: `Lesson: ${l.title}` }; }
    return { report: L.fullReport(), name: "generating-functions-core.md", what: "Full core deck (no lesson selected)" };
  }
  function download(name, textBody) { const blob = new Blob([textBody], { type: "text/markdown;charset=utf-8" }), url = URL.createObjectURL(blob), el = document.createElement("a"); el.href = url; el.download = name; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function copy(textBody) { try { await navigator.clipboard.writeText(textBody); return true; } catch (e) { return false; } }
  let exportCur = null;
  function openExport(kind) {
    const c = currentReport(kind), md = T.deck(c.report);
    exportCur = { ...c, md };
    $("export-what").textContent = `${c.what} · ${md.split("\n").filter((x) => /^## /.test(x)).length} frames · voice bf_emma · open it in beamdswitch (teoyujie.org/visuals/beamdswitch).`;
    $("export-text").value = md;
    $("export").showModal();
    return md;
  }
  beamMenu.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-beam]"); if (!b) return;
    toggleMenu(false);
    const k = b.dataset.beam;
    if (k === "present") startPresentation();
    else if (k === "copy") { const c = currentReport(), md = T.deck(c.report); if (await copy(md)) say(`Copied ${c.what} as Markdown.`); else { openExport(); say("Copy blocked: the Markdown is selected in the dialog."); $("export-text").select(); } }
    else if (k === "download") { const c = currentReport(); download(c.name, T.deck(c.report)); say(`Downloaded ${c.name}.`); }
    else openExport(k);
  });
  $("export-copy").addEventListener("click", async () => { if (await copy(exportCur.md)) say("Copied."); else { $("export-text").select(); say("Copy blocked: text selected, press Ctrl+C."); } });
  $("export-download").addEventListener("click", () => { download(exportCur.name, exportCur.md); say(`Downloaded ${exportCur.name}.`); });
  $("export-close").addEventListener("click", () => $("export").close());

  const COMMANDS = [
    ["Go to OGF", "#ogf"], ["Go to EGF", "#egf"], ["Compare OGF / EGF", "#compare/ogf-egf"], ["Open Fibonacci recurrence", "#fibonacci"], ["Open convolution", "#convolution"], ["Open roots-of-unity filter", "#roots-of-unity"], ["Open DFT", "#fourier"], ["Open integer partitions", "#partitions"], ["Open Catalan asymptotics", "#singularity-analysis"], ["Start easiest problem", "#problem-1"], ["Continue next problem", "next-problem"], ["Toggle Formal / Analytic", "toggle-analytic"], ["Open BeamMD presentation", "present"], ["Reset example", "reset"], ["Open sandbox", "#sandbox"], ["Common confusions", "#confusions"],
  ];
  let palItems = [], palSel = 0;
  function palRender() {
    const q = $("pal-input").value.trim().toLowerCase();
    const cmds = COMMANDS.filter(([lab]) => !q || q.split(/\s+/).every((w) => lab.toLowerCase().includes(w))).map(([label, to]) => ({ kind: "command", label, to }));
    const found = L.search(q, 14).map((e) => ({ kind: e.kind, label: e.label, to: e.route }));
    palItems = [...cmds, ...found].slice(0, 18); palSel = Math.min(palSel, Math.max(palItems.length - 1, 0));
    $("pal-list").innerHTML = palItems.map((it, i) => `<li role="option" id="pal-${i}" aria-selected="${i === palSel}" data-i="${i}"><span class="kind">${esc(it.kind)}</span><span>${esc(it.label)}</span></li>`).join("") || `<li class="muted">No matches</li>`;
    $("pal-input").setAttribute("aria-activedescendant", palItems.length ? `pal-${palSel}` : "");
  }
  function palRun(it) {
    $("palette").close();
    if (!it) return;
    if (typeof it.to === "object") { go(it.to.page === "lesson" ? L.parseHash("#" + L.lesson(it.to.id).hash) : it.to); return; }
    if (it.to.startsWith("#")) { go(L.parseHash(it.to)); return; }
    if (it.to === "next-problem") { const k = S.route.page === "problem" ? Math.min(S.route.k + 1, L.PROBLEMS.length) : 1; go({ page: "problem", k }); }
    if (it.to === "toggle-analytic") toggleAnalytic();
    if (it.to === "present") startPresentation();
    if (it.to === "reset") resetExample();
  }
  function openPalette() { $("pal-input").value = ""; palSel = 0; palRender(); $("palette").showModal(); $("pal-input").focus(); }
  $("search-btn").addEventListener("click", openPalette);
  $("pal-input").addEventListener("input", () => { palSel = 0; palRender(); });
  $("pal-input").addEventListener("keydown", (ev) => { if (ev.key === "ArrowDown") { ev.preventDefault(); palSel = Math.min(palSel + 1, palItems.length - 1); palRender(); } else if (ev.key === "ArrowUp") { ev.preventDefault(); palSel = Math.max(palSel - 1, 0); palRender(); } else if (ev.key === "Enter") { ev.preventDefault(); palRun(palItems[palSel]); } });
  $("pal-list").addEventListener("click", (ev) => { const li = ev.target.closest("li[data-i]"); if (li) palRun(palItems[Number(li.dataset.i)]); });
  $("palette").addEventListener("click", (ev) => { if (ev.target === $("palette")) $("palette").close(); });

  function toggleAnalytic() { const l = S.route.page === "lesson" && L.lesson(S.route.id); if (!l || !l.analytic) { say("No analytic view for this page."); return; } S.analytic = !S.analytic; render(); say(S.analytic ? "Analytic view." : "Formal view."); }
  function resetExample() { if (S.route.page === "lesson") { const l = L.lesson(S.route.id); S.local = {}; S.step = 0; go({ page: "lesson", id: l.id, n: l.n ? l.n.def : null, params: L.defaults(l) }, { replace: true, focus: false }); say("Example reset."); } else if (S.route.page === "fourier") { setFourierN(4, true); render(); say("Fourier lab reset."); } else if (S.route.page === "sandbox") sandbox("Reset"); else if (S.route.page === "problem") { S.prob.k = null; render(); say("Problem reset."); } }

  /* ---------- presentation: the same report frames, rendered in the page ---------- */
  function mdToHtml(body, step) {
    let k = 0; const out = [];
    for (const blockRaw of String(body || "").split(/\n\s*\n/)) {
      const block = blockRaw.trim();
      if (!block || block.startsWith("<!--")) continue;
      if (/^\.\s+\.\s+\.$/.test(block)) { k++; continue; }
      const cls = k > step ? ' class="hidden-step"' : "";
      let h;
      if (block.startsWith("$$")) h = `<div${cls}>${tex(block.replace(/^\$\$|\$\$$/g, "").trim(), true)}</div>`;
      else if (block.startsWith("|")) { const rows = block.split("\n").filter((x) => !/^\|\s*-/.test(x)).map((x) => x.split("|").slice(1, -1).map((c) => c.trim())); h = `<div class="tablewrap"${cls}><table><thead><tr>${rows[0].map((c) => `<th>${rich(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; }
      else if (block.startsWith("- ")) h = `<ul${cls}>${block.split("\n").map((x) => `<li>${rich(x.replace(/^- /, ""))}</li>`).join("")}</ul>`;
      else h = `<p${cls}>${rich(block)}</p>`;
      out.push(h);
    }
    return { html: out.join(""), steps: k };
  }
  function startPresentation(overview = false) {
    const c = currentReport(), slides = L.slides(c.report);
    S.present = { slides, i: 0, step: 0, overview, title: c.report.meta.title, prevFocus: document.activeElement };
    $("present").hidden = false; document.body.style.overflow = "hidden";
    drawSlide(); $("present").querySelector('[data-pr="next"]').focus();
    say(`Presentation: ${slides.length} slides.`);
  }
  function drawSlide() {
    const P = S.present, sl = P.slides[P.i];
    $("pr-title").textContent = P.title;
    $("pr-count").textContent = `${P.i + 1} / ${P.slides.length}`;
    if (P.overview) {
      $("pr-body").innerHTML = `<div class="overview" style="flex:1">${P.slides.map((s, i) => `<button type="button" data-goto="${i}" class="${i === P.i ? "on" : ""}"><span class="eyebrow">${i + 1} · ${esc(s.kind)}</span><br><strong>${esc(s.title)}</strong></button>`).join("")}</div>`;
      const cur = $("pr-body").querySelector(".on"); if (cur) cur.focus();
      return;
    }
    let inner;
    if (sl.kind === "title") inner = `<div class="slide"><p class="eyebrow">BeamMD Switch</p><h2 style="margin-top:18vh">${esc(sl.title)}</h2><p class="muted">${esc(sl.subtitle || "")}</p></div>`;
    else if (sl.kind === "section") inner = `<div class="slide section"><h2>${esc(sl.title)}</h2></div>`;
    else {
      const md = mdToHtml(sl.body, P.step);
      let vis = "";
      if (sl._state && sl._state.lesson && P.step >= md.steps) { const l = L.lesson(sl._state.lesson), p = L.params(l, sl._state.params || {}), n = sl._state.n ?? (l.n ? l.n.def : 0), st = l.states(p, n), si = Math.max(0, st.findIndex((s) => s.id === sl._state.state)); try { vis = `<div class="visual" style="margin-top:1rem">${VIS[l.visual](l, p, n ?? 0, st, si).html}</div>`; } catch (e) { vis = ""; } }
      inner = `<div class="slide"><p class="eyebrow">${esc(sl.section)}</p><h2>${esc(sl.title)}</h2>${md.html}${sl.key && P.step >= md.steps ? `<p class="notice"><strong>${rich(sl.key)}</strong></p>` : ""}${vis}</div>`;
    }
    $("pr-body").innerHTML = inner;
  }
  function stepsOf(sl) { return sl.kind === "frame" ? mdToHtml(sl.body, 0).steps : 0; }
  function presentMove(d) {
    const P = S.present;
    if (d > 0) { if (P.step < stepsOf(P.slides[P.i])) P.step++; else if (P.i < P.slides.length - 1) { P.i++; P.step = 0; } }
    else { if (P.step > 0) P.step--; else if (P.i > 0) { P.i--; P.step = stepsOf(P.slides[P.i]); } }
    drawSlide(); say(`Slide ${P.i + 1}: ${P.slides[P.i].title}`);
  }
  function exitPresentation() { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); const P = S.present; S.present = null; $("present").hidden = true; document.body.style.overflow = ""; if (P && P.prevFocus && P.prevFocus.focus) P.prevFocus.focus(); say("Presentation closed."); }
  function toggleFullscreen() { const el = $("present"); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el.requestFullscreen) el.requestFullscreen().catch(() => say("Fullscreen is not available here.")); }
  $("present").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-pr]"), g = ev.target.closest("[data-goto]");
    if (g) { S.present.i = Number(g.dataset.goto); S.present.step = 0; S.present.overview = false; drawSlide(); return; }
    if (!b) return;
    const k = b.dataset.pr;
    if (k === "next") presentMove(1); else if (k === "prev") presentMove(-1); else if (k === "overview") { S.present.overview = !S.present.overview; drawSlide(); } else if (k === "full") toggleFullscreen(); else exitPresentation();
  });

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (ev) => {
    const typing = ev.target.closest && ev.target.closest("input, textarea, select, [contenteditable]");
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") { ev.preventDefault(); if ($("palette").open) $("palette").close(); else openPalette(); return; }
    if (S.present) {
      if (ev.key === "ArrowRight" || ev.key === " " || ev.key === "PageDown") { ev.preventDefault(); presentMove(1); }
      else if (ev.key === "ArrowLeft" || ev.key === "PageUp") { ev.preventDefault(); presentMove(-1); }
      else if (ev.key.toLowerCase() === "f" && !ev.metaKey && !ev.ctrlKey) toggleFullscreen();
      else if (ev.key.toLowerCase() === "o" && !ev.metaKey && !ev.ctrlKey) { S.present.overview = !S.present.overview; drawSlide(); }
      else if (ev.key === "Escape") { ev.preventDefault(); if (S.present.overview) { S.present.overview = false; drawSlide(); } else exitPresentation(); }
      else if (ev.key === "Enter" && S.present.overview) { const g = ev.target.closest("[data-goto]"); if (g) { ev.preventDefault(); g.click(); } }
      return;
    }
    if (typing || ev.metaKey || ev.ctrlKey || ev.altKey || $("palette").open || $("export").open) return;
    if (ev.target.closest && ev.target.closest("button, a, summary") && (ev.key === " " || ev.key === "Enter")) return;
    const r = S.route, key = ev.key;
    if (r.page === "lesson" && (key === "ArrowRight" || key === "ArrowLeft" || key === " ")) {
      const st = L.lesson(r.id).states(r.params, r.n), nx = key === "ArrowLeft" ? Math.max(0, S.step - 1) : Math.min(st.length - 1, S.step + 1);
      ev.preventDefault();
      if (nx !== S.step) { S.step = nx; go(r, { replace: true, focus: false }); say(`Step ${S.step + 1} of ${st.length}: ${st[S.step].title}.`); }
      return;
    }
    if (key === "Escape") { if (!beamMenu.hidden) toggleMenu(false); $("nav").classList.remove("open"); return; }
    const k2 = key.toLowerCase();
    if (k2 === "p") { ev.preventDefault(); startPresentation(); }
    else if (k2 === "o") { ev.preventDefault(); startPresentation(true); }
    else if (k2 === "e") { ev.preventDefault(); toggleMenu(true); }
    else if (k2 === "r") { ev.preventDefault(); resetExample(); }
    else if (k2 === "v" && r.page === "lesson") { ev.preventDefault(); S.reps = !S.reps; render(); say(S.reps ? "Representations shown." : "Representations hidden."); }
    else if (k2 === "f") { ev.preventDefault(); toggleAnalytic(); }
  });

  /* ---------- header ---------- */
  $("menu-btn").addEventListener("click", () => { const o = !$("nav").classList.contains("open"); $("nav").classList.toggle("open", o); $("menu-btn").setAttribute("aria-expanded", String(o)); });
  $("nav").addEventListener("click", (ev) => { if (ev.target.closest("a, [data-nav-close]")) { if (ev.target.closest("[data-nav-close]")) $("menu-btn").focus(); $("nav").classList.remove("open"); $("menu-btn").setAttribute("aria-expanded", "false"); } });
  const THEMES = ["system", "light", "dark"];
  let theme = "system";
  try { const t = localStorage.getItem("theme"); theme = t === "light" || t === "dark" ? t : "system"; } catch (e) { /* storage may be blocked */ }
  function applyTheme() { if (theme === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", theme); $("theme-btn").setAttribute("aria-label", `Colour theme: ${theme === "system" ? "follow system" : theme}`); $("theme-btn").textContent = theme === "light" ? "☀" : theme === "dark" ? "☾" : "◐"; }
  $("theme-btn").addEventListener("click", () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; try { if (theme === "system") localStorage.removeItem("theme"); else localStorage.setItem("theme", theme); } catch (e) { /* ignore */ } applyTheme(); say(`Theme: ${theme}.`); });
  applyTheme();

  /* ---------- WebMCP: read-only tools ---------- */
  function registerTools() {
    const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
    if (!mc || !mc.registerTool) return;
    const out = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
    const empty = { type: "object", properties: {}, additionalProperties: false };
    const ro = { readOnlyHint: true };
    mc.registerTool({ name: "get_metadata", description: "Return the lab's purpose, conventions (OGF/EGF, ω = e^{2πi/N}), the 34 levels with their deep-link fragments and techniques, the 22-problem ladder, and the corrections made to the specification.", inputSchema: empty, annotations: ro, async execute() { return out(D); } });
    mc.registerTool({ name: "get_current_view", description: "Return what the page shows: the route (lesson, problem, compare, fourier, sandbox), and for a lesson its parameters, coefficient n, [xⁿ] value, the answer sentence and every verification check.", inputSchema: empty, annotations: ro,
      async execute() { const r = S.route; if (r.page !== "lesson") return out({ route: r, hash: location.hash }); const l = L.lesson(r.id); return out({ route: r, hash: location.hash, lesson: l.title, level: l.level, coefficient: l.gfName ? val(L.coefficient(l, r.params, r.n)) : null, answer: l.gfName ? l.answer(r.n, L.coefficient(l, r.params, r.n), r.params) : l.key, checks: l.gfName ? L.verify(l, r.params, r.n) : [] }); } });
    mc.registerTool({ name: "extract_coefficient", description: "Compute [xⁿ] of a lesson's generating function exactly, with its independent checks, without changing the page. lesson is a fragment such as fibonacci, coin-change, catalan; params uses the lesson's own choices.", inputSchema: { type: "object", properties: { lesson: { type: "string" }, n: { type: "integer" }, params: { type: "object" } }, required: ["lesson"] }, annotations: ro,
      async execute(i) { const r = L.parseHash("#" + (i && i.lesson) + "?" + Object.entries((i && i.params) || {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")); if (r.unknown || !L.lesson(r.id).gfName) return out({ error: `unknown or coefficient-free lesson: ${i && i.lesson}` }); const l = L.lesson(r.id), n = L.clampN(l, i.n ?? l.n.def, r.params); return out({ lesson: l.hash, n, params: r.params, value: val(L.coefficient(l, r.params, n)), answer: l.answer(n, L.coefficient(l, r.params, n), r.params), checks: L.verify(l, r.params, n) }); } });
    mc.registerTool({ name: "dft", description: "Exact DFT of an integer vector (values A(ω^k), ω = e^{2πi/N}, exact strings for N in 1, 2, 3, 4, 6, 8) and its exact inverse.", inputSchema: { type: "object", properties: { vector: { type: "array", items: { type: "integer" }, maxItems: 16 } }, required: ["vector"] }, annotations: ro,
      async execute(i) { const a = ((i && i.vector) || []).slice(0, 16).map((x) => Math.round(Number(x) || 0)); if (!a.length) return out({ error: "vector must be nonempty" }); const N = a.length, v = G.dftExact(a, N); return out({ N, values: v.map((z) => ({ exact: G.zExactString(z, N), float: G.zToComplex(z, N) })), inverse: G.idftExact(v, N).map(G.qstr) }); } });
    mc.registerTool({ name: "run_self_tests", description: "Run the lab's verification engine: every lesson's generating-function coefficients against independent enumeration, recurrences or exact transforms, plus the asymptotic checks with their tolerances.", inputSchema: empty, annotations: ro, async execute() { const t = L.selfTests(); return out({ passed: t.filter((x) => x.pass).length, total: t.length, failures: t.filter((x) => !x.pass) }); } });
  }

  /* ---------- start ---------- */
  S.route = routeFromHash();
  render(false);
  registerTools();
})();
