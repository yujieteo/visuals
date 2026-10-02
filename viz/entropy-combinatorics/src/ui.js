/* Entropy Methods in Combinatorics Lab: the page.
 *
 * Routing (hash deep links, spec §67), the five modes, the concept map, the command palette, the
 * BeamMD Switch menu, presentation mode and the read-only WebMCP tools. Every lesson, number and deck
 * comes from EntropyLessons / EntropyLab; this file only draws them.
 */
(function (root) {
  "use strict";
  const E = root.EntropyLab, Ls = root.EntropyLessons, R = root.EntropyRender, WG = root.EntropyWidgets, W = WG.W;
  const doc = root.document, $ = (id) => doc.getElementById(id), esc = R.esc, md = R.md, m = WG.m, f = E.fmt;
  const reduced = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  doc.documentElement.classList.add("js");

  const MODES = [["explore", "Explore"], ["guided", "Guided"], ["problems", "Problems"], ["compare", "Compare"], ["encode", "Encode"]];
  const REFS = [["map", "Concept map"], ["atlas", "Inequality atlas"], ["techniques", "Technique index"], ["failure-modes", "Failure modes"], ["when", "When should I try entropy?"], ["verify", "Verification"]];
  const LAB = (id) => Ls.LABS.find((l) => l.id === id) || null;
  const S = { mode: "explore", view: "counting", unit: "bits", wst: {}, ledger: false, arch: false, guided: {}, hints: {}, solved: {}, problem: 1, compare: Ls.COMPARISONS[0].id, encode: "permutations", deckKind: "proof", lastLesson: "counting" };

  /* ---------- context for widgets ---------- */
  const live = $("live");
  let liveTimer = 0;
  function say(msg) { if (!live) return; live.textContent = ""; clearTimeout(liveTimer); liveTimer = setTimeout(() => { live.textContent = msg; }, 30); }
  const fH = (bits) => `${f(E.inUnit(bits, S.unit), 3)} ${S.unit}`;
  const ctx = { get unit() { return S.unit; }, fH, say, reduced, play: () => {} };

  /* ---------- routing ---------- */
  function parse(hash) {
    const h = decodeURIComponent(String(hash || "").replace(/^#/, "")), [a, b] = h.split("/");
    if (!a) return { mode: "explore", view: "counting" };
    if (a === "guided" && Ls.byId(b)) return { mode: "guided", view: b };
    if (a === "problems") return { mode: "problems", problem: Math.min(16, Math.max(1, +b || 1)) };
    if (a === "compare") return { mode: "compare", compare: Ls.COMPARISONS.some((c) => c.id === b) ? b : Ls.COMPARISONS[0].id };
    if (a === "encode") return { mode: "encode", encode: b in Ls.ENCODE_FAMILIES ? b : "permutations" };
    if (Ls.byId(a) || LAB(a) || REFS.some(([id]) => id === a)) return { mode: "explore", view: a };
    return { mode: "explore", view: "counting", unknown: a };
  }
  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
  function route(focus) {
    const r = parse(location.hash);
    S.mode = r.mode;
    if (r.view) S.view = r.view;
    if (r.problem) S.problem = r.problem;
    if (r.compare) S.compare = r.compare;
    if (r.encode) S.encode = r.encode;
    if (Ls.byId(S.view)) S.lastLesson = S.view;
    render();
    if (focus) { const h = $("main").querySelector("h1"); if (h) h.focus({ preventScroll: false }); }
    if (r.unknown) say(`No section called ${r.unknown}; showing the first lesson.`);
  }

  /* ---------- the shell ---------- */
  function header() {
    $("modes").innerHTML = MODES.map(([id, label]) => `<button type="button" class="mode" data-mode="${id}" aria-pressed="${S.mode === id}">${label}</button>`).join("");
    $("units").innerHTML = ["bits", "nats"].map((u) => `<button type="button" data-unit="${u}" aria-pressed="${S.unit === u}">${u}</button>`).join("");
  }
  function nav() {
    const groups = [];
    for (const l of Ls.LESSONS) { let g = groups.find((x) => x.name === l.group); if (!g) groups.push((g = { name: l.group, items: [] })); g.items.push([l.id, l.short]); }
    groups.push({ name: "Labs", items: Ls.LABS.map((l) => [l.id, l.short]) }, { name: "Reference", items: REFS });
    const cur = S.mode === "explore" || S.mode === "guided" ? S.view : null;
    $("nav").innerHTML = groups.map((g) => `<h2>${esc(g.name)}</h2><ul>${g.items.map(([id, label]) => `<li><a href="#${id}" ${cur === id ? 'aria-current="page"' : ""}><span class="dot" aria-hidden="true"></span>${esc(label)}</a></li>`).join("")}</ul>`).join("") +
      `<details class="when"><summary>When should I try entropy?</summary>${whenHtml(true)}</details>`;
  }
  function render() {
    header(); nav();
    const main = $("main");
    let html;
    if (S.mode === "problems") html = problemsView();
    else if (S.mode === "compare") html = compareView();
    else if (S.mode === "encode") html = encodeView();
    else if (LAB(S.view)) html = labView(LAB(S.view));
    else if (REFS.some(([id]) => id === S.view)) html = refView(S.view);
    else html = lessonView(Ls.byId(S.view));
    main.innerHTML = html;
    mountWidgets();
    doc.title = `${titleOf()} · Entropy Methods in Combinatorics Lab — Yu Jie Teo`;
    $("menu-present").textContent = "Start presentation";
  }
  function titleOf() {
    if (S.mode === "problems") return `Problem ${S.problem}`;
    if (S.mode === "compare") return "Compare";
    if (S.mode === "encode") return "Encode";
    const l = Ls.byId(S.view) || LAB(S.view);
    return l ? l.title : (REFS.find(([id]) => id === S.view) || ["", "Reference"])[1];
  }
  const curLesson = () => Ls.byId(S.mode === "problems" ? Ls.PROBLEMS[S.problem - 1].lesson : S.mode === "compare" ? Ls.COMPARISONS.find((c) => c.id === S.compare).lesson : S.mode === "encode" ? "compression" : LAB(S.view) ? LAB(S.view).lesson : Ls.byId(S.view) ? S.view : S.lastLesson);

  /* ---------- widgets ---------- */
  function widgetBox(key, spec) {
    return `<div class="widget" data-wkey="${esc(key)}" data-wtype="${esc(spec.type)}"><div class="wc"></div><div class="wv"></div></div>`;
  }
  function stateFor(key, spec) {
    if (!S.wst[key]) S.wst[key] = W[spec.type].init(spec);
    return S.wst[key];
  }
  const SPECS = {};
  function mountWidgets() {
    for (const el of $("main").querySelectorAll(".widget")) {
      const key = el.dataset.wkey, spec = SPECS[key];
      if (!spec) continue;
      drawWidget(el, key, spec, true);
    }
  }
  function drawWidget(el, key, spec, full) {
    const w = W[spec.type], st = stateFor(key, spec);
    const a = doc.activeElement, sel = a && el.contains(a) ? focusSel(a) : null;
    if (full) el.querySelector(".wc").innerHTML = w.controls(st, ctx);
    el.querySelector(".wv").innerHTML = w.view(st, ctx);
    for (const o of el.querySelectorAll(".wc input[type=range]")) { const out = o.parentElement.querySelector("output"); if (out) out.textContent = o.value; }
    if (sel) { const t = el.querySelector(sel); if (t) t.focus({ preventScroll: true }); }
    const side = $("main").querySelector(`[data-side="${CSS.escape(key)}"]`);
    if (side) side.innerHTML = sideHtml(key, spec);
    const led = $("main").querySelector(`[data-led="${CSS.escape(key)}"]`);
    if (led) led.innerHTML = derivationHtml(curLesson(), key, spec);
  }
  function focusSel(a) {
    for (const k of ["data-k", "data-act", "data-paint", "data-mode"]) if (a.hasAttribute(k)) {
      const extra = a.hasAttribute("data-arg") ? `[data-arg="${CSS.escape(a.getAttribute("data-arg"))}"]` : "";
      return `[${k}="${CSS.escape(a.getAttribute(k))}"]${extra}`;
    }
    return null;
  }
  function budgetHtml(key, spec, lesson) {
    const w = W[spec.type], st = stateFor(key, spec);
    if (w.budget) { const b = w.budget(st); return WG.bars(b.rows.map((r) => ({ label: esc(r.label), bits: r.bits })), ctx); }
    const ex = lesson.example(E), rows = ex.rows.filter((r) => r.bits !== undefined);
    return rows.length ? WG.bars(rows.map((r) => ({ label: esc(r.label), bits: r.bits })), ctx) : `<p class="muted small">${m(lesson.identity || "H(X)=\\log|\\mathcal F|")}: the budget is the log of the count.</p>`;
  }
  function sideHtml(key, spec) { return budgetHtml(key, spec, curLesson()); }

  /* Delegated events for every widget. */
  function widgetOf(t) { const el = t.closest && t.closest(".widget"); return el ? { el, key: el.dataset.wkey, spec: SPECS[el.dataset.wkey] } : null; }
  function apply(wd, fn, full = true) { const w = W[wd.spec.type], st = stateFor(wd.key, wd.spec); fn(w, st); drawWidget(wd.el, wd.key, wd.spec, full); }
  function onInput(e, full) {
    const t = e.target, wd = widgetOf(t);
    if (!wd || !t.dataset.k) return;
    apply(wd, (w, st) => { st[t.dataset.k] = t.dataset.str && isNaN(+t.value) ? t.value : t.dataset.str && t.tagName === "SELECT" && !/^\d+$/.test(t.value) ? t.value : +t.value; if (w.change) w.change(st, t.dataset.k); }, full);
  }
  let painting = null, suppressClick = false;
  function onClick(e) {
    const t = e.target.closest("[data-act],[data-paint]");
    if (!t) return;
    const wd = widgetOf(t);
    if (!wd) return;
    if (t.dataset.paint !== undefined) { if (suppressClick) { suppressClick = false; return; } apply(wd, (w, st) => { w.act.paint(st, t.dataset.paint, ctx); w.act.endpaint(st); }); return; }
    const act = t.dataset.act, arg = t.dataset.arg || "";
    if (act === "drag") return;
    if (act === "lline") { highlightLedger(t, +arg); return; }
    apply(wd, (w, st) => {
      if (act === "step") {
        const [k, d, lo, hi] = arg.split("|");
        if (w.step && k.includes(".")) w.step(st, k, +d);
        else st[k] = Math.max(+lo, Math.min(+hi, Math.round((st[k] + +d) * 1e6) / 1e6));
        if (w.change) w.change(st, k);
      } else if (w.act && w.act[act]) w.act[act](st, arg, ctx);
    });
  }
  function highlightLedger(btn, i) {
    for (const b of btn.parentElement.querySelectorAll(".lline")) b.classList.toggle("sel", b === btn);
    const lesson = curLesson(), step = lesson.proof[Math.min(i, lesson.proof.length - 1)];
    const note = btn.closest(".card") && btn.closest(".card").querySelector(".lnote");
    if (note) note.innerHTML = `<b>${esc(btn.querySelector(".why").textContent)}:</b> ${md(step ? step.md : "")}`;
    say(`${btn.querySelector(".why").textContent}. ${step ? step.say : ""}`);
  }
  function onPointerDown(e) {
    const t = e.target.closest("[data-paint]"), d = e.target.closest('[data-act="drag"]');
    if (t) {
      const wd = widgetOf(t); if (!wd) return;
      e.preventDefault(); suppressClick = true; painting = { wd, last: t.dataset.paint };
      apply(wd, (w, st) => w.act.paint(st, t.dataset.paint, ctx));
      return;
    }
    if (d) {
      const wd = widgetOf(d); if (!wd) return;
      e.preventDefault();
      const rect = d.getBoundingClientRect(), arg = d.dataset.arg;
      const set = (y) => apply(wd, (w, st) => w.act.set(st, `${arg}|${Math.round(12 * (1 - Math.max(0, Math.min(1, (y - rect.top) / rect.height))))}`, ctx), false);
      set(e.clientY);
      const move = (ev) => set(ev.clientY), up = () => { root.removeEventListener("pointermove", move); root.removeEventListener("pointerup", up); say(`Entropy now ${fH(E.entropyCounts(stateFor(wd.key, wd.spec).w))}.`); };
      root.addEventListener("pointermove", move); root.addEventListener("pointerup", up);
    }
  }
  function onPointerMove(e) {
    if (!painting) return;
    const el = doc.elementFromPoint(e.clientX, e.clientY), t = el && el.closest && el.closest("[data-paint]");
    if (t && t.dataset.paint !== painting.last) { painting.last = t.dataset.paint; apply(painting.wd, (w, st) => w.act.paint(st, t.dataset.paint, ctx)); }
  }
  function onPointerUp() { if (painting) { const wd = painting.wd; painting = null; apply(wd, (w, st) => w.act.endpaint(st)); setTimeout(() => { suppressClick = false; }, 0); } }
  function onKey(e) {
    const t = e.target;
    if (t.dataset && t.dataset.act === "drag" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const wd = widgetOf(t); if (!wd) return;
      apply(wd, (w, st) => w.act.w(st, `${t.dataset.arg}|${e.key === "ArrowUp" ? 1 : -1}`, ctx));
    }
  }
  /* Auto-play a widget action (the random reveal); instant under reduced motion. */
  ctx.play = (act, times) => {
    const el = $("main").querySelector('.widget[data-wtype="matching"]'); if (!el) return;
    const wd = { el, key: el.dataset.wkey, spec: SPECS[el.dataset.wkey] };
    let k = 0;
    const tick = () => { if (k++ >= times) return; apply(wd, (w, st) => w.act[act](st, "", ctx)); if (!reduced) setTimeout(tick, 280); else tick(); };
    setTimeout(tick, reduced ? 0 : 150);
  };

  /* ---------- views ---------- */
  const dots = (d) => `<span class="diff" aria-label="Difficulty ${d} of 5">${"●".repeat(d)}${"○".repeat(5 - d)}</span>`;
  function variablesHtml(l) {
    if (!l.variables.length) return `<p class="muted">This lesson is about proof structure rather than one random object.</p>`;
    return WG.table(["variable", "sample space", "distribution", "support", "role"], l.variables.map((v) => [m(v.sym), m(v.space), v.dist ? m(v.dist) : "—", v.support ? m(v.support) : "—", esc(v.role)]));
  }
  function derivationHtml(l, key, spec) {
    if (S.arch) return WG.flowHtml(Ls.architecture(l));
    if (S.ledger && spec && W[spec.type].ledger) {
      const rows = W[spec.type].ledger(stateFor(key, spec));
      if (rows.length) return WG.ledgerHtml(rows, ctx) + `<div class="lnote small muted">Press a line to see the step that justifies it.</div>`;
    }
    const steps = l.proof;
    if (S.mode === "guided") {
      const k = Math.min(S.guided[l.id] || 0, steps.length - 1);
      return `<p class="small muted">Step ${k + 1} of ${steps.length}: one inequality at a time.</p><ol class="proof">${steps.slice(0, k + 1).map((s, i) => `<li class="${i === k ? "cur" : "done"}"><div>${md(s.md)}</div><span class="tag">${esc(s.why)}</span></li>`).join("")}</ol>` +
        `<div class="row"><button type="button" class="btn" data-guide="-1" ${k ? "" : "disabled"}>Previous step</button><button type="button" class="btn primary" data-guide="1" ${k < steps.length - 1 ? "" : "disabled"}>Next step</button></div>` +
        (k === steps.length - 1 ? `<div class="clever"><b>What was the clever move?</b> ${md(l.clever)}</div>` : "");
    }
    return `<ol class="proof">${steps.map((s) => `<li><div>${md(s.md)}</div><span class="tag">${esc(s.why)}</span></li>`).join("")}</ol>`;
  }
  function verifyHtml(l) {
    const ex = l.example(E);
    if (!ex.rows.length) return "";
    const has = (k) => ex.rows.some((r) => r[k] !== undefined && r[k] !== null);
    const cols = [["exact", "exact count"], ["bound", "entropy bound"], ["ratio", "ratio"], ["naive", "naive bound"], ["bits", "entropy"]].filter(([k]) => has(k));
    const cell = (k, v) => (v === undefined || v === null ? "—" : k === "bits" ? fH(v) : typeof v === "bigint" ? E.fmtCount(v) : f(v, 5));
    return `<section class="card"><h2>Verify on small examples</h2>${WG.table(["case", ...cols.map((c) => c[1])], ex.rows.map((r) => [esc(r.label), ...cols.map(([k]) => cell(k, r[k]))]))}<p class="small muted">Exact counts are enumerated; bounds are the entropy argument's output. Entropy often trades sharp constants for structural simplicity.</p></section>`;
  }
  function lessonView(l) {
    const key = l.id; SPECS[key] = l.widget;
    const prob = Ls.PROBLEMS.find((p) => p.lesson === l.id);
    return `<article class="lesson"><header class="lh"><p class="eyebrow">${esc(l.group)} · ${dots(l.difficulty)} · <span class="tech">${esc(l.technique)}</span></p><h1 tabindex="-1">${esc(l.title)}</h1>` +
      `<div class="row tools"><button type="button" class="btn" data-tool="ledger" aria-pressed="${S.ledger}">Entropy ledger</button><button type="button" class="btn" data-tool="arch" aria-pressed="${S.arch}">Proof architecture</button><button type="button" class="btn" data-tool="present">Present</button><button type="button" class="btn" data-tool="reset">Reset example</button>${prob ? `<a class="btn" href="#problems/${prob.level}">Try it as problem ${prob.level}</a>` : ""}</div></header>` +
      `<section class="card"><h2>Problem</h2>${md(l.problem)}</section>` +
      `<section class="card visual"><h2>Picture</h2>${widgetBox(key, l.widget)}</section>` +
      `<div class="quad"><section class="card"><h2>Random variables</h2>${l.randomObject ? md("**Random object:** " + l.randomObject) : ""}${variablesHtml(l)}</section>` +
      `<section class="card"><h2>Entropy budget</h2><div data-side="${key}"></div></section>` +
      `<section class="card"><h2>Encoding</h2>${l.family ? md("**Family:** " + l.family) : ""}${l.identity ? `<div class="mathblock">${m(l.identity)}</div>` : ""}</section>` +
      `<section class="card"><h2>Inequality</h2>${md(l.theorem)}</section></div>` +
      `<section class="card"><h2>${S.arch ? "Proof architecture" : S.ledger ? "Entropy ledger" : "Derivation"}</h2><div data-led="${key}">${derivationHtml(l, key, l.widget)}</div></section>` +
      `<div class="pair"><section class="card clever"><h2>What was the clever move?</h2>${md(l.clever)}</section><section class="card"><h2>When should I use this?</h2>${md(l.when)}</section></div>` +
      (l.equality || l.slack ? `<section class="card"><h2>Equality and slack</h2>${l.equality ? md("**Equality:** " + l.equality) : ""}${l.slack ? md("**Slack:** " + l.slack) : ""}</section>` : "") +
      verifyHtml(l) +
      `<nav class="related" aria-label="Neighbouring techniques"><h2>Neighbouring techniques</h2>${l.related.map((id) => { const r = Ls.byId(id) || LAB(id); return r ? `<a class="btn" href="#${id}">${esc(r.title)}</a>` : ""; }).join("")}</nav>` +
      pager(l) + `</article>`;
  }
  function pager(l) {
    const i = Ls.LESSONS.indexOf(l), p = Ls.LESSONS[i - 1], n = Ls.LESSONS[i + 1], pre = S.mode === "guided" ? "guided/" : "";
    return `<nav class="pager" aria-label="Lessons">${p ? `<a href="#${pre}${p.id}">← ${esc(p.title)}</a>` : "<span></span>"}${n ? `<a href="#${pre}${n.id}">${esc(n.title)} →</a>` : ""}</nav>`;
  }
  function labView(lab) {
    const key = lab.id; SPECS[key] = lab.widget;
    return `<article class="lesson"><header class="lh"><p class="eyebrow">Laboratory</p><h1 tabindex="-1">${esc(lab.title)}</h1><p>${esc(lab.blurb)}</p>` +
      `<div class="row tools"><button type="button" class="btn" data-tool="reset">Reset example</button><a class="btn" href="#${lab.lesson}">Open the lesson</a></div></header>` +
      `<section class="card visual">${widgetBox(key, lab.widget)}</section><section class="card"><h2>Entropy budget</h2><div data-side="${key}"></div></section></article>`;
  }
  function problemsView() {
    const p = Ls.PROBLEMS[S.problem - 1], l = Ls.byId(p.lesson), key = "problem-" + p.level, shown = S.hints[key] || 0, solved = !!S.solved[key];
    SPECS[key] = l.widget;
    const hints = l.hints || [];
    return `<article class="lesson problems"><nav class="ladder" aria-label="Problem ladder"><ol>${Ls.PROBLEMS.map((q) => `<li><a href="#problems/${q.level}" ${q.level === p.level ? 'aria-current="page"' : ""}><span class="lv">${q.level}</span> ${esc(q.title)}</a></li>`).join("")}</ol></nav>` +
      `<div><header class="lh"><p class="eyebrow">Problem ${p.level} of 16 · visual: ${esc(p.visual)}</p><h1 tabindex="-1">${esc(p.title)}</h1></header>` +
      `<section class="card"><h2>Problem</h2>${md(l.problem)}</section><section class="card visual"><h2>Picture</h2>${widgetBox(key, l.widget)}</section>` +
      `<section class="card"><h2>Hints</h2>${hints.length ? `<ol class="hints">${hints.slice(0, shown).map((h, i) => `<li><b>Hint ${i + 1}.</b> ${md(h)}</li>`).join("")}</ol>` : ""}` +
      `<div class="row">${shown < hints.length ? `<button type="button" class="btn" data-hint="1">Reveal hint ${shown + 1} of ${hints.length}</button>` : ""}<button type="button" class="btn ${shown >= hints.length ? "primary" : ""}" data-solve="1" ${solved ? "disabled" : ""}>${shown < hints.length ? "Skip to the solution" : "Show the solution"}</button></div></section>` +
      (solved ? `<section class="card"><h2>Solution</h2>${md(l.solution || l.theorem)}<p class="small">Technique: <b>${esc(p.technique)}</b>.</p></section><section class="card clever"><h2>What was the clever move?</h2>${md(l.clever)}</section><p><a class="btn" href="#${l.id}">Open the full lesson</a></p>` : "") +
      `<nav class="pager">${p.level > 1 ? `<a href="#problems/${p.level - 1}">← Problem ${p.level - 1}</a>` : "<span></span>"}${p.level < 16 ? `<a href="#problems/${p.level + 1}">Problem ${p.level + 1} →</a>` : ""}</nav></div></article>`;
  }
  function compareView() {
    const c = Ls.COMPARISONS.find((x) => x.id === S.compare), rows = c.numbers();
    const Q = [["counted", "What information is counted?"], ["dependence", "Where is dependence discarded?"], ["symmetry", "Where is symmetry used?"], ["generalises", "What generalises?"]];
    const col = (s) => `<section class="card"><h2>${esc(s.name)}</h2><dl>${Q.map(([k, q]) => `<dt>${q}</dt><dd>${md(s[k])}</dd>`).join("")}</dl></section>`;
    const mx = Math.max(...rows.map((r) => Math.max(r.log2a, r.log2b, r.exact !== undefined ? E.log2Big(r.exact) : r.log2a)), 1);
    const exactLog = (r) => (r.exact !== undefined ? E.log2Big(r.exact) : null);
    const chart = `<div class="quality" role="img" aria-label="Bound quality on a log scale">${rows.map((r) => `<div class="qrow"><span class="ql">${esc(r.label)}</span><span class="qbars">${exactLog(r) !== null ? `<span class="q q0" style="width:${(100 * exactLog(r)) / mx}%"><i>exact</i></span>` : ""}<span class="q q1" style="width:${(100 * r.log2a) / mx}%"><i>${esc(c.left.name)}</i></span><span class="q q2" style="width:${(100 * r.log2b) / mx}%"><i>${esc(c.right.name)}</i></span></span></div>`).join("")}</div>`;
    return `<article class="lesson"><header class="lh"><p class="eyebrow">Compare two counting approaches</p><h1 tabindex="-1">${esc(c.title)}</h1><div class="row" role="group" aria-label="Comparisons">${Ls.COMPARISONS.map((x) => `<a class="btn" href="#compare/${x.id}" ${x.id === c.id ? 'aria-current="page"' : ""}>${esc(x.title)}</a>`).join("")}</div></header>` +
      `<div class="pair">${col(c.left)}${col(c.right)}</div>` +
      `<section class="card"><h2>Numbers</h2>${WG.table(["case", "exact", esc(c.left.name), esc(c.right.name)], rows.map((r) => [esc(r.label), r.exact !== undefined ? E.fmtCount(r.exact) : "—", typeof r.a === "bigint" ? E.fmtCount(r.a) : f(r.a, 5), typeof r.b === "bigint" ? E.fmtCount(r.b) : f(r.b, 5)]))}` +
      `<h3>Bound quality (log₂ scale)</h3>${chart}<p class="small muted">Entropy is not universally better: it captures the exponential order with little bookkeeping, while a direct count is exact when it is available.</p></section>` +
      `<p><a class="btn" href="#${c.lesson}">Open the lesson</a></p></article>`;
  }
  function encodeView() {
    const key = "encode-mode"; SPECS[key] = { type: "encode", family: S.encode };
    const st = stateFor(key, SPECS[key]); if (st.fam !== S.encode) { st.fam = S.encode; st.order = null; }
    return `<article class="lesson"><header class="lh"><p class="eyebrow">Encode</p><h1 tabindex="-1">Describe the same object several ways</h1><p>Choosing the random variables is the creative part of the entropy method. Compare naive, separate and adaptive descriptions of one uniformly random object, and reorder the coordinates.</p></header>` +
      `<div class="row" role="group" aria-label="Families">${Object.entries(Ls.ENCODE_FAMILIES).map(([k, v]) => `<a class="btn" href="#encode/${k}" ${k === S.encode ? 'aria-current="page"' : ""}>${esc(v.label)}</a>`).join("")}</div>` +
      `<section class="card visual">${widgetBox(key, SPECS[key])}</section>` +
      `<section class="card"><h2>Entropy versus injective encoding</h2><div class="pair"><div class="flow"><h4>Classical encoding</h4><ol><li>object</li><li>fixed description</li><li>injectivity</li><li>count descriptions</li></ol></div><div class="flow"><h4>Entropy</h4><ol><li>uniform random object</li><li>random description</li><li>expected information</li><li>entropy inequality</li></ol></div></div><p>Entropy permits adaptive descriptions, conditional descriptions, average information accounting and overlapping projections.</p></section></article>`;
  }
  function whenHtml(short) {
    const w = Ls.WHEN;
    return `<p>Use entropy when ${esc(w.use)}, especially when:</p><ul>${w.especially.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` + (short ? "" : "") + `<ol class="flowline">${w.guide.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
  }
  function refView(id) {
    const head = (t, p = "") => `<header class="lh"><p class="eyebrow">Reference</p><h1 tabindex="-1">${esc(t)}</h1>${p}</header>`;
    if (id === "map") {
      const N = Ls.MAP.nodes, pos = Object.fromEntries(N.map((n) => [n.id, n]));
      return `<article class="lesson">${head("Concept map", "<p>Select any node to open its lesson. The whole lab is one transformation: family → uniform random object → coordinates → information inequality → H(X) = log |𝓕| → counting bound.</p>")}` +
        `<div class="cmap"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${Ls.MAP.edges.map(([a, b]) => `<line x1="${pos[a].x}" y1="${pos[a].y}" x2="${pos[b].x}" y2="${pos[b].y}"/>`).join("")}</svg>${N.map((n) => `<a class="node" href="#${n.id}" style="left:${n.x}%;top:${n.y}%">${esc(n.label)}</a>`).join("")}</div>` +
        `<ol class="cmaplist">${N.map((n) => `<li><a href="#${n.id}">${esc(n.label)}</a> — ${esc(Ls.byId(n.id).title)}</li>`).join("")}</ol>` +
        `<section class="card"><h2>Other branches of entropy</h2><p>${["compression", "typical-set", "kl-divergence", "data-processing", "han", "probabilistic-method"].map((x) => `<a class="btn" href="#${x}">${esc(Ls.byId(x).title)}</a>`).join(" ")}</p></section></article>`;
    }
    if (id === "atlas") return `<article class="lesson">${head("Entropy inequality atlas")}<div class="atlas">${Ls.ATLAS.map((a) => `<section class="card"><h2>${esc(a.name)}</h2><div class="mathblock">${m(a.tex)}</div><a href="#${a.lesson}">Problem: ${esc(Ls.byId(a.lesson).title)} →</a></section>`).join("")}</div></article>`;
    if (id === "techniques") return `<article class="lesson">${head("Technique index")}<label class="sel"><span class="lab">Filter</span><input type="search" id="tfilter" placeholder="e.g. Shearer" autocomplete="off"></label><ul class="tindex">${Ls.TECHNIQUES.map((t) => `<li><a href="#${Ls.techniqueLesson(t)}">${esc(t)}</a></li>`).join("")}</ul></article>`;
    if (id === "failure-modes") return `<article class="lesson">${head("Common failure modes")}<label class="sel"><span class="lab">Filter</span><input type="search" id="tfilter" placeholder="e.g. independence" autocomplete="off"></label><div class="tindex">${Ls.FAILURES.map((x) => `<section class="card"><h2>${esc(x.title)}</h2>${md(x.body)}<a href="#${x.lesson}">See ${esc(Ls.byId(x.lesson).title)} →</a></section>`).join("")}</div></article>`;
    if (id === "when") return `<article class="lesson">${head("When should I try entropy?")}<section class="card">${whenHtml(false)}</section><section class="card"><h2>The entropy method as proof design</h2><ol>${Ls.CHECKLIST.map((q) => `<li>${esc(q)}</li>`).join("")}</ol><a href="#proof-design">Open the checklist lesson →</a></section></article>`;
    const T = Ls.selfTests(), pass = T.filter((x) => x.pass).length;
    return `<article class="lesson">${head("Verification", `<p>Exact finite counts against entropy bounds, run in your browser now: <b>${pass} of ${T.length}</b> checks pass.</p>`)}` +
      `<ul class="tests">${T.map((x) => `<li class="${x.pass ? "pass" : "fail"}"><span aria-hidden="true">${x.pass ? "✓" : "✗"}</span> ${esc(x.name)}${x.pass ? "" : ` <b>failed</b> ${esc(x.detail)}`}</li>`).join("")}</ul>` +
      `<section class="card"><h2>Worked checks</h2>${["binomial", "loomis-whitney", "bregman"].map((id2) => `<h3>${esc(Ls.byId(id2).title)}</h3>${md(Ls.byId(id2).example(E).md)}`).join("")}</section></article>`;
  }

  /* ---------- global interactions ---------- */
  function onMainClick(e) {
    const t = e.target.closest("[data-tool],[data-guide],[data-hint],[data-solve]");
    if (!t) return onClick(e);
    if (t.dataset.tool === "ledger") { S.ledger = !S.ledger; S.arch = false; render(); focusAgain('[data-tool="ledger"]'); say(S.ledger ? "Entropy ledger shown." : "Derivation shown."); }
    else if (t.dataset.tool === "arch") { S.arch = !S.arch; render(); focusAgain('[data-tool="arch"]'); say(S.arch ? "Proof architecture shown." : "Derivation shown."); }
    else if (t.dataset.tool === "present") present("proof");
    else if (t.dataset.tool === "reset") resetExample();
    else if (t.dataset.guide) { const l = curLesson(); S.guided[l.id] = Math.max(0, Math.min(l.proof.length - 1, (S.guided[l.id] || 0) + +t.dataset.guide)); render(); focusAgain(`[data-guide="${t.dataset.guide}"]`); const s = l.proof[S.guided[l.id]]; say(`Step ${S.guided[l.id] + 1}: ${s.why}. ${s.say}`); }
    else if (t.dataset.hint) { const key = "problem-" + S.problem; S.hints[key] = (S.hints[key] || 0) + 1; render(); focusAgain("[data-hint],[data-solve]"); say(`Hint ${S.hints[key]} revealed.`); }
    else if (t.dataset.solve) { S.solved["problem-" + S.problem] = true; render(); say("Solution revealed."); }
  }
  function focusAgain(sel) { const el = $("main").querySelector(sel) || $("main").querySelector("h1"); if (el) el.focus({ preventScroll: true }); }
  function resetExample() {
    for (const k of Object.keys(S.wst)) if (k === S.view || k === "problem-" + S.problem || (S.mode === "encode" && k === "encode-mode")) delete S.wst[k];
    render(); say("Example reset.");
  }
  function setUnit(u) { S.unit = u; render(); say(`Entropies now in ${u}. Counting bounds are unchanged.`); }

  /* ---------- the command palette (spec §66) ---------- */
  const COMMANDS = [
    ["Start easiest problem", () => go("#problems/1")], ["Open Shearer", () => go("#shearer")], ["Open Loomis–Whitney", () => go("#loomis-whitney")], ["Open Bregman", () => go("#bregman")],
    ["Open matching lab", () => go("#matching-lab")], ["Open projection lab", () => go("#projection")], ["Open cover builder", () => go("#cover-builder")],
    ["Show entropy ledger", () => { S.ledger = true; S.arch = false; if (!Ls.byId(S.view) || S.mode !== "explore") go("#" + curLesson().id); else render(); }],
    ["Show proof architecture", () => { S.arch = true; if (!Ls.byId(S.view) || S.mode !== "explore") go("#" + curLesson().id); else render(); }],
    ["Toggle bits / nats", () => setUnit(S.unit === "bits" ? "nats" : "bits")], ["Open BeamMD presentation", () => present("proof")], ["Reset current example", resetExample],
    ["Export full core deck", () => openExport("core")], ["Show verification", () => go("#verify")], ["Open concept map", () => go("#map")],
  ];
  function paletteItems() {
    const out = [];
    for (const [label, fn] of COMMANDS) out.push({ label, kind: "command", run: fn });
    for (const l of Ls.LESSONS) out.push({ label: l.title, kind: l.technique, keys: `${l.short} ${l.technique} ${R.text(l.problem)}`, run: () => go("#" + l.id) });
    for (const l of Ls.LABS) out.push({ label: l.title, kind: "lab", run: () => go("#" + l.id) });
    for (const [id, label] of REFS) out.push({ label, kind: "reference", run: () => go("#" + id) });
    for (const p of Ls.PROBLEMS) out.push({ label: `Problem ${p.level}: ${p.title}`, kind: p.technique, run: () => go("#problems/" + p.level) });
    for (const t of Ls.TECHNIQUES) out.push({ label: t, kind: "technique", run: () => go("#" + Ls.techniqueLesson(t)) });
    for (const x of Ls.FAILURES) out.push({ label: x.title, kind: "failure mode", keys: R.text(x.body), run: () => go("#failure-modes") });
    for (const c of Ls.COMPARISONS) out.push({ label: `Compare: ${c.title}`, kind: "compare", run: () => go("#compare/" + c.id) });
    return out;
  }
  let palItems = [], palSel = 0;
  function openPalette() { const d = $("palette"); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); } $("pal-q").value = ""; filterPalette(); $("pal-q").focus(); }
  function closePalette() { const d = $("palette"); if (d.close) d.close(); else d.removeAttribute("open"); }
  function filterPalette() {
    const q = $("pal-q").value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    palItems = paletteItems().filter((it) => words.every((w) => `${it.label} ${it.kind} ${it.keys || ""}`.toLowerCase().replace(/[–-]/g, " ").includes(w.replace(/[–-]/g, " ")))).slice(0, 40);
    palSel = 0; drawPalette();
  }
  function drawPalette() {
    $("pal-list").innerHTML = palItems.map((it, i) => `<li role="option" id="pal-${i}" aria-selected="${i === palSel}" data-i="${i}"><span>${esc(it.label)}</span><small>${esc(it.kind)}</small></li>`).join("") || `<li class="muted">No match.</li>`;
    $("pal-q").setAttribute("aria-activedescendant", palItems.length ? `pal-${palSel}` : "");
    const cur = $(`pal-${palSel}`); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }
  function runPalette(i) { const it = palItems[i]; if (!it) return; closePalette(); it.run(); }

  /* ---------- BeamMD Switch: export and presentation (spec §68–§73) ---------- */
  const EXPORT_TITLES = { theorem: "current theorem", proof: "current proof", problem: "current problem", core: "full core deck" };
  function deckText(kind) { return Ls.deck(kind, curLesson().id); }
  function openExport(kind) {
    S.deckKind = kind;
    $("export-title").textContent = `BeamMD Switch: ${EXPORT_TITLES[kind]}`;
    $("export-text").value = deckText(kind);
    const d = $("export"); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    $("export-text").focus();
  }
  async function copyDeck(kind = S.deckKind) {
    const text = deckText(kind);
    try { await root.navigator.clipboard.writeText(text); say("Markdown copied."); } catch { openExport(kind); $("export-text").select(); say("Copy blocked by the browser: the Markdown is selected; press Ctrl+C or ⌘C."); }
  }
  function downloadDeck(kind = S.deckKind) {
    const text = deckText(kind), name = `entropy-${kind === "core" ? "core-deck" : `${kind}-${curLesson().id}`}.md`;
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" })), a = doc.createElement("a");
      a.href = url; a.download = name; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      say(`Saved ${name}.`);
    } catch { openExport(kind); say("Download blocked: copy the Markdown from the box instead."); }
  }
  function toggleMenu(open) {
    const b = $("beam-btn"), menu = $("beam-menu"), on = open ?? b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", String(on)); menu.hidden = !on;
    if (on) menu.querySelector("button").focus();
  }
  function onMenu(e) {
    const t = e.target.closest("[data-beam]"); if (!t) return;
    toggleMenu(false); $("beam-btn").focus();
    const a = t.dataset.beam;
    if (a === "present") present("proof");
    else if (a === "copy") copyDeck();
    else if (a === "download") downloadDeck();
    else openExport(a);
  }

  /* Presentation: rendered from the same deck model as the Markdown export. */
  const P = { slides: [], i: 0, step: 0, overview: false };
  function slidesOf(model) {
    const out = [{ kind: "title", title: model.meta.title, sub: model.meta.subtitle, steps: [], say: model.say }];
    for (const s of model.sections) { out.push({ kind: "section", title: s.title, steps: [] }); for (const fr of s.frames) out.push({ kind: "frame", ...fr }); }
    return out;
  }
  function present(kind) {
    const lesson = curLesson();
    P.slides = slidesOf(Ls.deckModel(kind === "core" ? "core" : "proof", lesson.id)); P.i = 0; P.step = 0; P.overview = false; P.back = doc.activeElement;
    $("present").hidden = false; doc.body.classList.add("presenting"); drawSlide(); $("present").focus();
    say(`Presentation started: ${P.slides.length} slides. Arrow keys or space to advance, O for overview, Escape to exit.`);
  }
  function drawSlide() {
    const s = P.slides[P.i], stage = $("slide");
    if (P.overview) {
      stage.innerHTML = `<h2>Overview</h2><ol class="ov">${P.slides.map((x, i) => `<li><button type="button" data-goto="${i}" ${i === P.i ? 'aria-current="true"' : ""}>${esc(x.kind === "title" ? "Title" : x.title)}</button></li>`).join("")}</ol>`;
      const c = stage.querySelector('[aria-current="true"]'); if (c) c.focus();
    } else if (s.kind === "title") stage.innerHTML = `<div class="stitle"><h2>${esc(s.title)}</h2><p>${esc(s.sub || "")}</p><p class="muted">${esc(s.say)}</p></div>`;
    else if (s.kind === "section") stage.innerHTML = `<div class="stitle"><h2>${esc(s.title)}</h2></div>`;
    else stage.innerHTML = `<h2>${esc(s.title)}</h2>${s.steps.slice(0, P.step + 1).map((x, k) => `<div class="sstep ${k === P.step ? "new" : ""}">${md(x)}</div>`).join("")}` +
      (s.state ? `<p class="slink"><button type="button" class="btn" data-open="${esc(s.state.lesson)}">Open in the lab: ${esc(Ls.byId(s.state.lesson) ? Ls.byId(s.state.lesson).short : s.state.lesson)}</button></p>` : "");
    $("pcount").textContent = `${P.i + 1} / ${P.slides.length}${s.steps && s.steps.length > 1 ? ` · step ${P.step + 1} of ${s.steps.length}` : ""}`;
  }
  function advance(d) {
    const s = P.slides[P.i];
    if (d > 0 && s.steps && P.step < s.steps.length - 1) P.step++;
    else if (d < 0 && P.step > 0) P.step--;
    else { const j = Math.max(0, Math.min(P.slides.length - 1, P.i + d)); if (j === P.i) return; P.i = j; P.step = d < 0 && P.slides[j].steps.length ? P.slides[j].steps.length - 1 : 0; }
    drawSlide();
    const cur = P.slides[P.i];
    say(cur.kind === "frame" ? `${cur.title}, step ${P.step + 1}` : cur.title);
  }
  function endPresent() {
    $("present").hidden = true; doc.body.classList.remove("presenting");
    if (doc.fullscreenElement && doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
    if (P.back && P.back.focus) P.back.focus();
  }
  function onPresentKey(e) {
    if ($("present").hidden) return false;
    const k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || (k === " " && !e.target.closest("button"))) { e.preventDefault(); advance(1); }
    else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); advance(-1); }
    else if (k === "Escape") { e.preventDefault(); if (P.overview) { P.overview = false; drawSlide(); $("present").focus(); } else endPresent(); }
    else if (k === "o" || k === "O") { P.overview = !P.overview; drawSlide(); }
    else if (k === "f" || k === "F") fullscreen();
    else if (k === "Home") { P.i = 0; P.step = 0; drawSlide(); }
    else if (k === "End") { P.i = P.slides.length - 1; P.step = 0; drawSlide(); }
    else return false;
    return true;
  }
  function fullscreen() { const el = $("present"); try { if (doc.fullscreenElement) doc.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => say("Fullscreen is not available here.")); } catch { say("Fullscreen is not available here."); } }

  /* ---------- wiring ---------- */
  /* Where each mode button goes from the current lesson: its own page, its guided proof, its problem
     level, or the comparison and encoding last open. */
  const MODE_ROUTES = {
    explore: (l) => `#${l.id}`,
    guided: (l) => `#guided/${l.id}`,
    problems: (l) => { const prob = Ls.PROBLEMS.find((p) => p.lesson === l.id); return `#problems/${prob ? prob.level : S.problem}`; },
    compare: () => `#compare/${S.compare}`,
    encode: () => `#encode/${S.encode}`,
  };
  function wire() {
    const main = $("main");
    main.addEventListener("click", onMainClick);
    main.addEventListener("input", (e) => { if (e.target.id === "tfilter") return filterIndex(e.target.value); if (e.target.type === "range") onInput(e, false); });
    main.addEventListener("change", (e) => { if (e.target.dataset && e.target.dataset.k) onInput(e, true); });
    main.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);
    main.addEventListener("keydown", onKey);
    $("modes").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mode]"); if (!b) return;
      go(MODE_ROUTES[Object.hasOwn(MODE_ROUTES, b.dataset.mode) ? b.dataset.mode : "encode"](curLesson()));
    });
    $("units").addEventListener("click", (e) => { const b = e.target.closest("[data-unit]"); if (b) setUnit(b.dataset.unit); });
    $("menu-btn").addEventListener("click", () => { const open = doc.body.classList.toggle("navopen"); $("menu-btn").setAttribute("aria-expanded", String(open)); if (open) $("nav").querySelector("a").focus(); });
    $("nav").addEventListener("click", (e) => { if (e.target.closest("a")) { doc.body.classList.remove("navopen"); $("menu-btn").setAttribute("aria-expanded", "false"); } });
    $("pal-btn").addEventListener("click", openPalette);
    $("pal-q").addEventListener("input", filterPalette);
    $("pal-q").addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); drawPalette(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(0, palSel - 1); drawPalette(); }
      else if (e.key === "Enter") { e.preventDefault(); runPalette(palSel); }
    });
    $("pal-list").addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) runPalette(+li.dataset.i); });
    $("palette").addEventListener("click", (e) => { if (e.target === $("palette")) closePalette(); });
    $("pal-close").addEventListener("click", closePalette);
    $("beam-btn").addEventListener("click", () => toggleMenu());
    $("beam-menu").addEventListener("click", onMenu);
    $("beam-menu").addEventListener("keydown", (e) => {
      const items = [...$("beam-menu").querySelectorAll("button")], i = items.indexOf(doc.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); toggleMenu(false); $("beam-btn").focus(); }
    });
    doc.addEventListener("click", (e) => { if (!e.target.closest("#beam") && $("beam-btn").getAttribute("aria-expanded") === "true") toggleMenu(false); });
    $("export-copy").addEventListener("click", () => copyDeck());
    $("export-download").addEventListener("click", () => downloadDeck());
    $("export-close").addEventListener("click", () => { const d = $("export"); if (d.close) d.close(); else d.removeAttribute("open"); });
    $("present").addEventListener("click", (e) => {
      const t = e.target.closest("[data-pc],[data-goto],[data-open]"); if (!t) return;
      if (t.dataset.goto) { P.i = +t.dataset.goto; P.step = 0; P.overview = false; drawSlide(); $("present").focus(); }
      else if (t.dataset.open) { endPresent(); go("#" + t.dataset.open); }
      else ({ prev: () => advance(-1), next: () => advance(1), overview: () => { P.overview = !P.overview; drawSlide(); }, full: fullscreen, exit: endPresent })[t.dataset.pc]();
    });
    doc.addEventListener("keydown", (e) => {
      if (onPresentKey(e)) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); if ($("palette").open) closePalette(); else openPalette(); return; }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "p" || e.key === "P") && !$("palette").open && !$("export").open) { e.preventDefault(); present("proof"); }
    });
    root.addEventListener("hashchange", () => route(true));
  }
  function filterIndex(q) {
    const w = q.trim().toLowerCase();
    for (const el of $("main").querySelectorAll(".tindex > li, .tindex > section")) el.hidden = !!w && !el.textContent.toLowerCase().includes(w);
  }

  /* ---------- WebMCP: read-only tools for agents ---------- */
  const result = (v) => ({ content: [{ type: "text", text: JSON.stringify(v, (k, x) => (typeof x === "bigint" ? x.toString() : x)) }] });
  const ro = { readOnlyHint: true }, none = { type: "object", properties: {}, additionalProperties: false };
  const lessonSummary = (l) => ({ id: l.id, title: l.title, group: l.group, technique: l.technique, difficulty: l.difficulty, url: `https://teoyujie.org/visuals/entropy-combinatorics/#${l.id}` });
  const tools = [
    { name: "get_metadata", description: "What this lab covers: lessons (with deep links), labs, the problem ladder, comparisons, units and deck kinds.", inputSchema: none, annotations: ro,
      async execute() { return result({ title: "Entropy Methods in Combinatorics Lab", url: "https://teoyujie.org/visuals/entropy-combinatorics/", lessons: Ls.LESSONS.map(lessonSummary), labs: Ls.LABS.map((l) => ({ id: l.id, title: l.title })), problems: Ls.PROBLEMS, comparisons: Ls.COMPARISONS.map((c) => ({ id: c.id, title: c.title })), units: ["bits", "nats"], deck_kinds: ["theorem", "proof", "problem", "core"] }); } },
    { name: "get_current_state", description: "The page as set: mode, view, unit, the current lesson and its widget state with the entropy budget.", inputSchema: none, annotations: ro,
      async execute() {
        const l = curLesson(), key = S.mode === "problems" ? "problem-" + S.problem : S.mode === "encode" ? "encode-mode" : S.view, spec = SPECS[key], st = spec ? stateFor(key, spec) : null;
        const b = spec && W[spec.type].budget ? W[spec.type].budget(st).rows.map((r) => ({ label: r.label, value: E.inUnit(r.bits, S.unit), unit: S.unit })) : null;
        return result({ mode: S.mode, view: S.view, unit: S.unit, lesson: lessonSummary(l), widget: spec ? { type: spec.type, state: st } : null, budget: b, ledger: S.ledger, architecture: S.arch });
      } },
    { name: "get_lesson", description: "One lesson by id: problem, encoding, theorem, proof steps with justifications, clever move, and its finite check computed now.", annotations: ro,
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
      async execute(i) { const l = Ls.byId(i && i.id); if (!l) return result({ error: `Unknown lesson. Known: ${Ls.LESSONS.map((x) => x.id).join(", ")}` }); const ex = l.example(E); return result({ ...lessonSummary(l), problem: l.problem, family: l.family, random_object: l.randomObject, identity: l.identity, theorem: l.theorem, proof: l.proof.map((s) => ({ step: s.md, justification: s.why })), clever_move: l.clever, when: l.when, equality: l.equality, slack: l.slack, related: l.related, check: ex.rows, check_markdown: ex.md }); } },
    { name: "compute_bound", description: "Compute an exact count and its entropy bound: kind binomial {n,k}, multinomial {parts}, bregman {adjacency: lists of right neighbours}, loomis_whitney {points: 3-tuples}, set_system {sets, n}.", annotations: ro,
      inputSchema: { type: "object", properties: { kind: { enum: ["binomial", "multinomial", "bregman", "loomis_whitney", "set_system"] }, n: { type: "integer", minimum: 0, maximum: 200 }, k: { type: "integer", minimum: 0 }, parts: { type: "array", items: { type: "integer", minimum: 0 } }, adjacency: { type: "array", items: { type: "array", items: { type: "integer", minimum: 0 } } }, points: { type: "array", items: { type: "array", items: { type: "integer" } } }, sets: { type: "array", items: { type: "array", items: { type: "integer", minimum: 0 } } } }, required: ["kind"], additionalProperties: false },
      async execute(i) {
        try {
          if (i.kind === "binomial") { if (!(i.n >= 0 && i.k >= 0 && i.k <= i.n && i.n <= 200)) throw new Error("need 0 ≤ k ≤ n ≤ 200"); const b = E.binomialBound(i.n, i.k); return result({ exact: b.exact, entropy_bound: b.bound, log2_exact: b.log2Exact, exponent_bits: b.exponent, ratio: b.ratio, en_over_k_bound: b.ek }); }
          if (i.kind === "multinomial") { if (!Array.isArray(i.parts) || !i.parts.length || i.parts.reduce((a, b) => a + b, 0) > 200) throw new Error("parts: non-negative integers summing to at most 200"); const b = E.multinomialBound(i.parts); return result({ exact: b.exact, entropy_bound: b.bound, H_bits: b.H, ratio: b.ratio }); }
          if (i.kind === "bregman") { const a = i.adjacency, n = Array.isArray(a) ? a.length : 0; if (!n || n > 8 || !a.every((r) => Array.isArray(r) && r.length && r.every((j) => Number.isInteger(j) && j >= 0 && j < n))) throw new Error("adjacency: 1 to 8 rows of distinct right-vertex indices 0..n−1, none empty"); const adj = a.map((r) => [...new Set(r)].sort((x, y) => x - y)); const b = E.bregman(adj); return result({ permanent: b.permanent, degrees: b.degrees, bregman_bound: b.bound, tight: b.tight, naive_product: b.naive }); }
          if (i.kind === "loomis_whitney") { if (!Array.isArray(i.points) || i.points.length > 1000 || !i.points.every((p) => Array.isArray(p) && p.length === 3)) throw new Error("points: up to 1000 integer 3-tuples"); const w = E.loomisWhitney(i.points, 3); return result({ size: w.size, shadows: w.proj.map((p) => p.size), size_squared: w.lhs, product: w.rhs, holds: w.holds, tight: w.tight, size_bound: w.bound }); }
          if (i.kind === "set_system") { if (!(i.n >= 1 && i.n <= 30) || !Array.isArray(i.sets)) throw new Error("need n from 1 to 30 and sets of elements 0..n−1"); const s = E.setSystem(i.sets.map((x) => x.filter((e) => e >= 0 && e < i.n)), i.n); return result({ size: s.size, p: s.p, sum_h_bits: s.sum, entropy_bound: s.bound }); }
          throw new Error("unknown kind");
        } catch (err) { return result({ error: String(err.message || err) }); }
      } },
    { name: "export_deck", description: "The beamdswitch Markdown deck the BeamMD Switch menu exports: kind theorem, proof, problem or core, for a lesson id (default: the current lesson).", annotations: ro,
      inputSchema: { type: "object", properties: { kind: { enum: ["theorem", "proof", "problem", "core"] }, lesson: { type: "string" } }, required: ["kind"], additionalProperties: false },
      async execute(i) { const id = i.lesson || curLesson().id; if (!Ls.byId(id)) return result({ error: "Unknown lesson id." }); if (!["theorem", "proof", "problem", "core"].includes(i.kind)) return result({ error: "kind must be theorem, proof, problem or core." }); return result({ markdown: Ls.deck(i.kind, id) }); } },
    { name: "run_self_tests", description: "Run the built-in deterministic verification: exact counts against entropy bounds.", inputSchema: none, annotations: ro,
      async execute() { return result(Ls.selfTests()); } },
  ];
  root.EntropyTools = tools;
  const mc = (doc && doc.modelContext) || (root.navigator && root.navigator.modelContext);
  if (mc && typeof mc.registerTool === "function") for (const t of tools) { try { mc.registerTool(t); } catch { /* already registered */ } }

  root.EntropyApp = { S, route, render, present, openExport, deckText, copyDeck, downloadDeck, setUnit, go, parse };
  wire();
  route(false);
})(typeof self !== "undefined" ? self : this);
