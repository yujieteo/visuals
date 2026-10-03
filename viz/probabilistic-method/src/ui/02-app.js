/* Page part 2: state, views, events, exports and the read-only WebMCP tools.
 * One evaluated state E (module, parameters, seed) drives the lab, the proof lens, deck mode and every export. */
const $ = (id) => document.getElementById(id);
const now = () => Date.now();
const S = { view: "atlas", module: null, P: null, lens: "lab", deck: false, frame: 0, step: 0, asym: false, focus: "", labStep: null, hl: null, j: null, reveal: false, signs: null,
  trials: null, trialsN: 1000, conceptSel: "existence", rec: ["start"], cmpA: "first-moment", cmpB: "local-lemma", technique: null, autoplay: null };
let E = null, runId = 0, SELF = null;

/* ---------- state ---------- */

function evaluateNow() { E = PM.evaluate(PM.moduleById(S.module), S.P); }
function trialKey() { return S.module + JSON.stringify(S.P); }
function hashNow() { return PM.stateHash({ view: S.view, module: S.module, P: S.P, lens: S.lens, asym: S.asym, deck: S.deck, frame: S.frame, step: S.step, focus: S.focus, technique: S.technique, a: S.cmpA, b: S.cmpB }); }
function writeHash() { try { const h = hashNow(); if (location.hash === h) return; if (location.protocol === "file:") location.replace(h); else history.replaceState(null, "", h); } catch (e) { /* sandboxed frames may refuse; the state still works */ } }
function applyHash(hash) {
  const st = PM.parseHash(hash);
  S.view = st.view;
  if (st.view === "lab") { Object.assign(S, { module: st.module, P: st.P, deck: st.deck, frame: st.frame, step: st.step, lens: st.lens, asym: st.asym, focus: st.focus, labStep: null, hl: null, j: null, signs: null }); evaluateNow(); }
  if (st.view === "technique") S.technique = st.technique;
  if (st.view === "compare") { S.cmpA = st.a; S.cmpB = st.b; }
}
function openModule(id, extra = {}) {
  const mod = PM.moduleById(id);
  Object.assign(S, { view: "lab", module: id, P: { ...PM.defaults(mod), seed: S.P ? S.P.seed : PM.DEFAULT_SEED }, labStep: null, hl: null, j: null, signs: null, focus: "", deck: false, frame: 0, step: 0, asym: false }, extra);
  evaluateNow(); render(); writeHash(); window.scrollTo(0, 0);
}
/* New parameters or seed: drop the step, sign and highlight state that belonged to the old object, then redraw. */
function changeLab(P) { S.P = P; S.labStep = null; S.signs = null; S.hl = null; evaluateNow(); updateLab(); writeHash(); }
function setParam(key, value) {
  const mod = PM.moduleById(S.module), p = mod.params.find((x) => x.key === key), P = { ...S.P, [key]: PM.coerceParam(p, value) };
  changeLab(mod.coerce ? mod.coerce(P) : P);
}
function setSeed(seed) { changeLab({ ...S.P, seed: ((seed % 4294967296) + 4294967296) % 4294967296 }); }

/* ---------- small helpers ---------- */

const say = (msg) => { const l = $("live"); if (l) l.textContent = msg; };
function toast(msg) {
  say(msg);
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t);
  setTimeout(() => { if (t.remove) t.remove(); }, 1800);
}
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied`); }
  catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand("copy"); toast(`${what} copied`); } catch (e2) { toast("Copy failed: select and copy manually"); }
    if (ta.remove) ta.remove();
  }
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); if (a.remove) a.remove(); }, 0);
  toast(`Saved ${name}`);
}
const option = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? " selected" : ""}>${esc(label)}</option>`;
const famTitle = (id) => (PM.FAMILIES.find((x) => x.id === id) || { title: id }).title;

/* ---------- top level ---------- */

function render() {
  document.body.classList.toggle("proof-lens", S.view === "lab" && S.lens === "proof");
  for (const [id, on] of [["mode-atlas", S.view === "atlas"], ["mode-lab", S.view === "lab" && S.lens !== "proof"], ["mode-proof", S.view === "lab" && S.lens === "proof"], ["mode-deck", S.deck]]) { const b = $(id); b.setAttribute("aria-pressed", String(!!on)); }
  const main = $("main");
  if (S.view === "lab") renderLab(main);
  else if (S.view === "technique") main.innerHTML = techniqueView();
  else if (S.view === "compare") main.innerHTML = compareView();
  else if (S.view === "recommend") main.innerHTML = recommendView();
  else main.innerHTML = atlasView();
  renderActions();
  renderDeck();
}

/* ---------- lab ---------- */

const MACHINE = [["problem", "Goal"], ["random-object", "Random object"], ["witnesses", "Witnesses"], ["variable", "Random variable"], ["bound", "Estimate"], ["transition", "Existence transition"], ["conclusion", "Construction / limitation"]];
function navHtml() {
  const groups = [];
  for (const fam of PM.FAMILIES) { const mods = PM.MODULES.filter((m) => m.family === fam.id); if (mods.length) groups.push([fam.title, mods]); }
  return groups.map(([t, mods]) => `<h3>${esc(t)}</h3>${mods.map((m) => `<button type="button" data-act="module" data-id="${m.id}" aria-current="${m.id === S.module}">${esc(m.short)}</button>`).join("")}`).join("") +
    `<h3>Everything else</h3><button type="button" data-act="atlas-inventory">All ${PM.INVENTORY.length} techniques</button><button type="button" data-act="recommend">Method recommender</button>`;
}
function controlsHtml(mod) {
  return mod.params.filter((p) => !p.hidden).map((p) => p.options
    ? `<label>${esc(p.label)}<select data-param="${p.key}" id="p-${p.key}">${p.options.map(([v, l]) => option(v, l, S.P[p.key])).join("")}</select></label>`
    : `<label for="p-${p.key}">${esc(p.label)} <output id="o-${p.key}">${esc(f(S.P[p.key]))}</output><input type="range" id="p-${p.key}" data-param="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${S.P[p.key]}"></label>`).join("");
}
function renderLab(main) {
  const mod = E.mod;
  main.innerHTML = `<div class="shell">
  <nav class="nav secondary" aria-label="Techniques">${navHtml()}</nav>
  <section class="center" aria-labelledby="lab-title">
    <label class="navselect secondary"><span class="sr">Technique</span><select class="field" data-act="module-select">${PM.MODULES.map((m) => option(m.id, m.title, S.module)).join("")}</select></label>
    <p class="small muted">${esc(famTitle(mod.family))} · ${esc(mod.archetype)} · <a href="#technique/${PM.INVENTORY.find((t) => t.module === mod.id)?.id || ""}">inventory entry</a></p>
    <h2 id="lab-title">${esc(mod.title)}</h2>
    <p class="lede">${esc(mod.intuition)}</p>
    <h3>Watch</h3>
    <div class="chips" role="group" aria-label="Proof machine stages" id="lab-machine"></div>
    <div id="lab-stage"></div>
    <div id="lab-four" class="four"></div>
    <div class="layer"><h3>Canonical problem</h3><p>${esc(mod.problem)}</p></div>
    <div class="layer"><h3>Random experiment</h3><p>${esc(mod.randomObject)}</p><p class="small" id="lab-seed"></p></div>
    <div class="layer secondary"><h3>Play</h3><div class="controls" id="lab-controls">${controlsHtml(mod)}</div></div>
    <div class="layer secondary" id="lab-exp-wrap"><h3>Experiment lens</h3><div id="lab-exp"></div></div>
  </section>
  <aside class="side" id="lab-side" aria-label="Proof"></aside></div>`;
  updateLab();
}
function updateLab() {
  if (S.view !== "lab" || !$("lab-stage")) return;
  const mod = E.mod, A = E.A, asm = mod.assumptions(E.P, A), proof = mod.proof(E.P, A), allOk = asm.every((a) => a.ok);
  for (const p of mod.params) { const o = $(`o-${p.key}`); if (o) o.textContent = f(E.P[p.key]); const i = $(`p-${p.key}`); if (i && String(i.value) !== String(E.P[p.key]) && document.activeElement !== i) i.value = E.P[p.key]; }
  $("lab-four").innerHTML = [["What was random?", mod.randomObject], ["What quantity did we control?", mod.variable], ["Why does the estimate imply a deterministic statement?", mod.why], ["Why this technique?", mod.need]].map(([q, a]) => `<div><b>${esc(q)}</b><span>${esc(a)}</span></div>`).join("");
  $("lab-machine").innerHTML = MACHINE.map(([id, l], i) => `<button class="chip" type="button" data-act="focus" data-id="${id}" aria-pressed="${S.focus === id}">${i + 1}. ${esc(l)}</button>`).join("");
  $("lab-seed").innerHTML = `<span class="num">seed: ${E.P.seed}</span> <button class="btn quiet" type="button" data-act="new-seed">New seed</button> <button class="btn quiet" type="button" data-act="copy-state">Copy state</button> <label class="small">set seed <input class="field num" type="number" min="0" step="1" value="${E.P.seed}" data-act="seed-input" style="width:7rem"></label>`;
  const d = DRAW[mod.id](E, S), steppable = STEPPABLE[mod.id];
  const max = steppable ? steppable(E) : 0, cur = S.labStep ?? max;
  $("lab-stage").innerHTML = `<div class="stage">${d.svg}${steppable ? `<div class="stagebar"><button class="btn" type="button" data-act="step-back" aria-label="Step back">◀</button><button class="btn" type="button" data-act="step" aria-label="Step forward">Step ▶</button><button class="btn quiet" type="button" data-act="step-start">Start</button><button class="btn quiet" type="button" data-act="step-end">End</button><span class="small num">step ${cur} / ${max}</span></div>` : ""}<p class="summary" id="lab-summary">${esc(d.summary)}</p></div>${d.extra || ""}`;
  say(d.summary);
  const asym = mod.asymptotic ? mod.asymptotic(E.P, A) : null;
  $("lab-side").innerHTML = `
    <h3>Key random variable</h3><div class="eq">${esc(T(mod.variableTex))}</div><p class="small">${esc(mod.variable)}</p>
    <h3>Why it works</h3><p class="small">${esc(mod.why)}</p>
    <h3 id="bound-h">Bound</h3><div class="eq" tabindex="-1" id="bound-eq">${esc(T(mod.boundTex))}</div>
    ${asym ? `<div class="chips" role="group" aria-label="Finite or asymptotic"><button class="chip" type="button" data-act="asym" data-v="0" aria-pressed="${!S.asym}">Finite</button><button class="chip" type="button" data-act="asym" data-v="1" aria-pressed="${S.asym}">Asymptotic</button></div>` : ""}
    ${asym && S.asym ? `<p class="eq">${esc(asym.formula)}</p><table class="rows">${asym.terms.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${esc(f(v))}</td></tr>`).join("")}<tr><td><b>total (exact ln)</b></td><td>${esc(f(asym.total))}</td></tr></table><p class="small">${esc(asym.note)}</p>`
      : `<table class="rows">${A.rows.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`}
    <div class="transition" aria-label="From random experiment to deterministic conclusion"><span>random experiment</span><span class="arrow">⟹</span><span>${allOk ? "deterministic conclusion" : "no conclusion"}</span></div>
    <div class="verdict ${allOk ? "ok" : "no"}"><b>${allOk ? "Deterministic conclusion" : "Theorem not applicable"}</b>${esc(allOk ? proof[proof.length - 1].text : asm.find((a) => !a.ok).broken || asm.find((a) => !a.ok).label)}</div>
    <h3>Proof</h3><ol class="proof">${proof.map((p, i) => `<li class="${S.focus === p.focus && S.proofIndex === i ? "active" : ""}"><button type="button" data-act="proof-step" data-i="${i}" data-id="${p.focus}">${esc(p.text)}</button></li>`).join("")}</ol>
    <div class="secondary">
    <h3>Break it — assumptions</h3><ul class="assume">${asm.map((a) => `<li class="${a.ok ? "" : "no"}">${a.ok ? "✓" : "×"} ${esc(a.label)}${a.ok ? "" : `<span class="why">${esc(a.broken || "")}</span>`}</li>`).join("")}</ul>
    <p><button class="btn" type="button" data-act="break">${esc(mod.breakIt.label)}</button> <button class="btn quiet" type="button" data-act="reset">Reset to defaults</button></p>
    <h3>Compare — why not another method?</h3>${mod.whyNot(E.P, A).map((w) => `<p class="small"><b>${esc(w.title)}</b> ${esc(w.text)}</p>`).join("")}
    <div class="chips">${mod.compare.map((c) => `<a class="chip" href="#compare/${mod.id}/${c}" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">${esc(mod.short)} ↔ ${esc(PM.moduleById(c).short)}</a>`).join("")}</div>
    <h3>Where next</h3><div class="chips">${mod.compare.concat(PM.COURSE[PM.COURSE.indexOf(mod.id) + 1] || []).filter((x, i, a) => a.indexOf(x) === i).map((c) => `<button class="chip" type="button" data-act="module" data-id="${c}">${esc(PM.moduleById(c).title)}</button>`).join("")}</div>
    </div>`;
  updateExperiment();
}
function updateExperiment() {
  const box = $("lab-exp"); if (!box || !E) return;
  const th = E.mod.experiment.theory(E.A, E.P), cap = E.mod.trialCap(E.P), tr = S.trials && S.trials.key === trialKey() ? S.trials : null;
  const sum = tr && tr.values.length ? PM.summarise(E, tr.values) : null;
  const thmText = th.bound === null || th.bound === undefined ? esc(th.boundLabel) : `${esc(th.boundLabel)}: <span class="num">${esc(th.boundKind === "at least" ? "≥ " : th.boundKind === "at most" ? "≤ " : "= ")}${esc(f(th.bound))}</span>`;
  box.innerHTML = `<div class="exp"><div class="two">
      <div><b class="badge thm">Theorem</b><p class="small">Proved guarantee for the event “${esc(th.event)}”: ${thmText}${th.lower !== undefined ? `; ${esc(th.lowerLabel)} ${esc(f(th.lower))}` : ""}.${th.mean !== null && th.mean !== undefined ? ` ${esc(th.meanLabel || "E")} = <span class="num">${esc(f(th.mean))}</span>.` : ""}</p></div>
      <div><b class="badge exp">Experiment</b><p class="small">${sum ? `What these ${f(sum.N)} finite simulations did: “${esc(th.event)}” in <span class="num">${f(sum.hits)} / ${f(sum.N)} = ${esc(f(sum.frac))}</span>; sample mean <span class="num">${esc(f(sum.mean))}</span>.${tr.values.length < tr.total ? ` Running… ${tr.values.length} of ${tr.total}.` : ""}` : "No simulation yet. Run trials to see what finite samples do."}</p></div></div>
    <p class="chips"><label class="small">trials <select class="field" data-act="trials-n">${[1, 100, 1000, 10000].map((n) => option(n, f(n), S.trialsN)).join("")}</select></label><button class="btn" type="button" data-act="run" id="run-trials">Run ${f(Math.min(S.trialsN, cap))}</button>${S.trialsN > cap ? `<span class="small muted">capped at ${f(cap)} to stay responsive</span>` : ""}</p>
    ${tr && tr.values.length < tr.total ? `<progress max="${tr.total}" value="${tr.values.length}"></progress>` : ""}
    ${sum ? `<div class="stage">${histogramChart(sum.hist, { mean: th.mean ?? null, meanLabel: th.meanLabel || "E", pmf: th.pmf || null, event: sum.hist.integer ? (b) => th.eventTest(b.x0, E.A, E.P) : null })}</div><p class="small muted">Label: ${esc(E.mod.experiment.label)}. Highlighted bars: outcomes where “${esc(th.event)}”. Every histogram uses exactly the ${f(sum.N)} trials stated.</p>` : ""}
    <p class="small"><b>Simulations illustrate; they never prove.</b> The existence or concentration claim comes from the displayed inequality.</p></div>`;
}
function runExperiment(N) {
  const cap = E.mod.trialCap(E.P), total = Math.max(1, Math.min(N, cap)), my = ++runId;
  S.trials = { key: trialKey(), values: [], total };
  const tick = () => {
    if (my !== runId || !S.trials || S.trials.key !== trialKey()) return;
    const t0 = now(); let i = S.trials.values.length;
    while (i < total && now() - t0 < 14) { S.trials.values.push(PM.trialValue(E, i)); i++; }
    updateExperiment();
    if (i < total) setTimeout(tick, 0); else say(`Experiment finished: ${total} trials.`);
  };
  tick();
}

/* ---------- atlas ---------- */

function conceptMapSvg() {
  const M = PM.CONCEPT_MAP, W = 600, H = 520, X = (x) => (x / 100) * W, Y = (y) => (y / 100) * (H - 40) + 20, byId = Object.fromEntries(M.nodes.map((n) => [n.id, n]));
  let s = svgOpen(W, H, "Concept map of the probabilistic method");
  for (const [a, b] of M.edges) s += line([X(byId[a].x), Y(byId[a].y)], [X(byId[b].x), Y(byId[b].y)], "axis", 'stroke-width="1.5"');
  for (const n of M.nodes) {
    const sel = S.conceptSel === n.id, w = Math.max(90, n.label.length * 7.4);
    s += `<g role="button" tabindex="0" data-act="concept" data-id="${n.id}" aria-pressed="${sel}" aria-label="${esc(n.label)}" style="cursor:pointer"><rect x="${(X(n.x) - w / 2).toFixed(1)}" y="${(Y(n.y) - 15).toFixed(1)}" width="${w.toFixed(1)}" height="30" rx="5" class="${sel ? "fink" : "fbg"} ink"/>${`<text x="${X(n.x).toFixed(1)}" y="${(Y(n.y) + 4).toFixed(1)}" text-anchor="middle" class="ttl" style="${sel ? "fill:var(--bg)" : ""}">${esc(n.label)}</text>`}</g>`;
    if (n.modules) { const names = n.modules.map((m) => PM.moduleById(m).short); for (let r = 0; r * 2 < names.length; r++) s += text(X(n.x), Y(n.y) + 28 + r * 13, names.slice(2 * r, 2 * r + 2).join(" · "), "lbl"); }
  }
  return s + "</svg>";
}
function conceptPanel() {
  const M = PM.CONCEPT_MAP, n = M.nodes.find((x) => x.id === S.conceptSel) || M.nodes[1];
  const pre = M.edges.filter(([, b]) => b === n.id).map(([a]) => M.nodes.find((x) => x.id === a).label), post = M.edges.filter(([a]) => a === n.id).map(([, b]) => M.nodes.find((x) => x.id === b).label);
  const mods = (n.modules || []).map(PM.moduleById);
  return `<div class="card"><h4>${esc(n.label)}</h4><p class="small"><b>Prerequisites:</b> ${esc(pre.join(", ") || "none — start here")}. <b>Descendants:</b> ${esc(post.join(", ") || "none")}.</p>
    ${mods.length ? `<div class="scroll"><table class="grid"><tr><th>technique</th><th>canonical problem</th><th>controls</th><th>typical conclusion</th></tr>${mods.map((m) => `<tr><td><button class="chip" type="button" data-act="module" data-id="${m.id}">${esc(m.short)}</button></td><td>${esc(m.archetype)}</td><td>${esc(m.pattern.controls)}</td><td>${esc(m.pattern.conclusion)}</td></tr>`).join("")}</table></div>` : ""}</div>`;
}
function inventoryTable() {
  return `<div class="scroll"><table class="grid"><tr><th>#</th><th>technique</th><th>family</th><th>archetypal problem</th><th>status</th></tr>${PM.INVENTORY.map((t) => {
    const m = t.module && PM.moduleById(t.module);
    return `<tr><td class="num">${t.n}</td><td><a href="#technique/${t.id}">${esc(t.title)}</a></td><td class="small">${esc(famTitle(t.family))}</td><td class="small">${esc(t.problem)}</td><td>${m ? `<span class="badge done">built</span> <a href="#${m.route}?scene=${t.scene}" class="small">${esc(m.short)} lab</a>` : '<span class="badge todo">not yet built</span>'}</td></tr>`;
  }).join("")}</table></div>`;
}
function atlasView() {
  const built = PM.INVENTORY.filter((t) => t.module).length;
  return `<div class="center" style="max-width:72rem;margin:auto">
  <p class="small muted">A visual laboratory for the probabilistic method</p>
  <h2>How can randomness prove that a deterministic object exists?</h2>
  <p class="lede">Construct a probability space ⟶ show good outcomes have positive probability ⟶ therefore one good object exists.</p>
  <p>Every technique below is the same machine: <b>random experiment → observable → dependency → inequality → deterministic consequence</b>. The later techniques answer one question: what should we measure when the elementary estimate is too weak?</p>
  <p><button class="btn primary" type="button" data-act="module" data-id="first-moment">Start from the beginning</button> <button class="btn" type="button" data-act="recommend">Which method do I need?</button> <button class="btn quiet" type="button" data-act="open-search">Search ⌘K</button></p>
  <div class="layer"><h3>The universal proof machine</h3><div class="chips">${MACHINE.map(([, l], i) => `<span class="chip" style="display:inline-flex;align-items:center">${i + 1}. ${esc(l)}</span>`).join("<span aria-hidden=\"true\">→</span>")}</div></div>
  <div class="layer"><h3>Problems, not chapters</h3><div class="cards">${PM.GALLERY.map(([q, m, ids]) => `<button class="card" type="button" data-act="module" data-id="${ids[0]}"><h4>${esc(q)}</h4><span class="small muted">${esc(m)}</span></button>`).join("")}</div></div>
  <div class="layer"><h3>Concept map — select a node</h3><div class="split"><div class="stage">${conceptMapSvg()}</div><div id="concept-panel">${conceptPanel()}</div></div></div>
  <div class="layer"><h3>Guided course</h3><ol>${PM.COURSE_STAGES.map(([t, ids]) => `<li>${esc(t)}: ${ids.map((id) => `<button class="chip" type="button" data-act="module" data-id="${id}">${esc(PM.moduleById(id).short)}</button>`).join(" ")}</li>`).join("")}</ol><p class="small muted">The order is a suggestion; every lab is open.</p></div>
  <div class="layer"><h3>Navigate by question</h3>${PM.PROBLEM_INDEX.map(([q, ids]) => `<p><b>${esc(q)}</b> ${ids.map((id) => { const m = PM.moduleById(id), t = PM.techniqueById(id); return m ? `<button class="chip" type="button" data-act="module" data-id="${id}">${esc(m.short)}</button>` : `<a class="chip" href="#technique/${id}" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">${esc(t ? t.title : id)} <span class="badge todo" style="margin-left:.3rem">not yet built</span></a>`; }).join(" ")}</p>`).join("")}</div>
  <div class="layer"><h3>Proof-pattern matrix</h3><div class="scroll"><table class="grid"><tr><th>method</th><th>controls</th><th>typical conclusion</th><th>works when</th></tr>${PM.MODULES.map((m) => `<tr><td><button class="chip" type="button" data-act="module" data-id="${m.id}">${esc(m.short)}</button></td><td>${esc(m.pattern.controls)}</td><td>${esc(m.pattern.conclusion)}</td><td>${esc(m.pattern.worksWhen)}</td></tr>`).join("")}</table></div></div>
  <div class="layer"><h3>Key comparisons</h3><div class="chips">${PM.KEY_COMPARISONS.map(([a, b]) => `<a class="chip" href="#compare/${a}/${b}" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">${esc(PM.moduleById(a).short)} ↔ ${esc(PM.moduleById(b).short)}</a>`).join("")}</div></div>
  <div class="layer" id="inventory"><h3>Complete technique inventory — ${built} of ${PM.INVENTORY.length} shown in a lab</h3><p class="small">Techniques not yet built keep their stable id and are marked as such; nothing here is a placeholder page.</p>${inventoryTable()}</div>
  <div class="layer"><h3>Self-tests</h3><p class="small" id="selftests">${SELF ? `${SELF.filter((x) => x.pass).length} of ${SELF.length} built-in self-tests pass${SELF.every((x) => x.pass) ? "." : `; failing: ${esc(SELF.filter((x) => !x.pass).map((x) => x.name).join(", "))}.`}` : ""}</p></div>
  </div>`;
}
function techniqueView() {
  const t = PM.techniqueById(S.technique), m = t.module && PM.moduleById(t.module), siblings = PM.MODULES.filter((x) => x.family === t.family);
  return `<div class="center" style="max-width:52rem;margin:auto"><p class="small muted"><a href="#atlas">Atlas</a> · technique ${t.n} · id <span class="num">${esc(t.id)}</span></p>
    <h2>${esc(t.title)} ${m ? '<span class="badge done">built</span>' : '<span class="badge todo">not yet built</span>'}</h2>
    <table class="rows"><tr><td>family</td><td>${esc(famTitle(t.family))}</td></tr><tr><td>archetypal problem</td><td>${esc(t.problem)}</td></tr><tr><td>planned visual</td><td>${esc(t.visual)}</td></tr></table>
    ${m ? `<p>This technique is demonstrated inside the <b>${esc(m.title)}</b> lab (scene: ${esc(PM.focusLabel({ A: {} }, t.scene))}).</p><p><button class="btn primary" type="button" data-act="module" data-id="${m.id}" data-focus="${t.scene}">Open the ${esc(m.short)} lab</button></p>`
      : `<p>Not yet built: this release does not have an interactive lab for it, and shows none rather than a placeholder. ${siblings.length ? "Nearest built labs:" : ""}</p><div class="chips">${siblings.map((x) => `<button class="chip" type="button" data-act="module" data-id="${x.id}">${esc(x.short)}</button>`).join("")}</div>`}</div>`;
}
function compareView() {
  const ids = [...PM.MODULES.map((m) => [m.id, m.title]), ...PM.INVENTORY.filter((t) => !t.module).map((t) => [t.id, `${t.title} (not yet built)`])];
  const { a, b } = PM.compareRows(S.cmpA, S.cmpB);
  const rows = [["Problem", "problem"], ["Intuition", "intuition"], ["Controls", "controls"], ["Key inequality", "inequality"], ["Works when", "worksWhen"], ["Canonical visual", "visual"], ["Typical conclusion", "conclusion"]];
  return `<div class="center" style="max-width:64rem;margin:auto"><p class="small muted"><a href="#atlas">Atlas</a> · technique comparison</p><h2>Compare two techniques</h2>
    <div class="split"><label>left <select class="field" data-act="cmp" data-side="a">${ids.map(([v, l]) => option(v, l, S.cmpA)).join("")}</select></label><label>right <select class="field" data-act="cmp" data-side="b">${ids.map(([v, l]) => option(v, l, S.cmpB)).join("")}</select></label></div>
    ${a && b ? `<div class="scroll"><table class="grid"><tr><th></th><th>${esc(a.title)}</th><th>${esc(b.title)}</th></tr>${rows.map(([l, k]) => `<tr><th>${l}</th><td>${esc(a[k])}</td><td>${esc(b[k])}</td></tr>`).join("")}</table></div>` : ""}
    <p class="chips">${[S.cmpA, S.cmpB].filter((x) => PM.moduleById(x)).map((x) => `<button class="btn" type="button" data-act="module" data-id="${x}">Open ${esc(PM.moduleById(x).short)}</button>`).join(" ")}</p>
    <h3>Especially important comparisons</h3><div class="chips">${PM.KEY_COMPARISONS.map(([x, y]) => `<a class="chip" href="#compare/${x}/${y}" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">${esc(PM.moduleById(x).short)} ↔ ${esc(PM.moduleById(y).short)}</a>`).join("")}</div></div>`;
}
function recommendView() {
  const R = PM.RECOMMENDER, path = S.rec, last = path[path.length - 1], node = R[last], done = !node;
  const trail = path.slice(0, -1).map((id, i) => { const nd = R[id], chosen = nd.options.find(([v]) => v === path[i + 1]); return `<li><b>${esc(nd.q)}</b> → ${esc(chosen ? chosen[1] : "")}${nd.why ? `<br><span class="small muted">${esc(nd.why)}</span>` : ""}</li>`; }).join("");
  return `<div class="center" style="max-width:52rem;margin:auto"><p class="small muted"><a href="#atlas">Atlas</a> · method recommender</p><h2>Which method do I need?</h2><ol>${trail}</ol>
    ${done ? `<div class="verdict ok"><b>Recommended</b>${esc(PM.moduleById(last).title)} — ${esc(PM.moduleById(last).need)}</div><p><button class="btn primary" type="button" data-act="module" data-id="${last}">Open the lab</button> <button class="btn quiet" type="button" data-act="rec-reset">Start again</button></p>`
      : `<h3>${esc(node.q)}</h3>${node.why ? `<p class="small">${esc(node.why)}</p>` : ""}<div class="chips">${node.options.map(([v, l]) => `<button class="btn" type="button" data-act="rec" data-id="${v}">${esc(l)}</button>`).join("")}</div>${path.length > 1 ? '<p><button class="btn quiet" type="button" data-act="rec-back">Back</button></p>' : ""}`}</div>`;
}

/* ---------- actions bar and export menu ---------- */

function renderActions() {
  const lab = S.view === "lab", bar = $("actions");
  bar.hidden = !lab;
  if (!lab) return;
  const step = !!STEPPABLE[S.module];
  for (const id of ["act-step"]) $(id).hidden = !step;
}
function buildActions() {
  $("actions").innerHTML = `<button class="btn" type="button" id="act-sample" title="Space">Sample</button><button class="btn" type="button" id="act-step">Step</button>
    <button class="btn" type="button" id="act-run">Run 1,000</button><button class="btn quiet opt" type="button" id="act-reset">Reset</button><span class="sep"></span>
    <button class="btn" type="button" id="act-proof">Proof ▶</button><button class="btn" type="button" id="act-deck">Deck ▶</button>
    <span class="menu"><button class="btn quiet" type="button" id="export-toggle" aria-haspopup="menu" aria-expanded="false">Export ▾</button>
    <span role="menu" id="export-menu" hidden>
      <button role="menuitem" type="button" id="copy-slide">Copy current slide Markdown</button>
      <button role="menuitem" type="button" id="copy-beamdswitch">Copy current technique deck</button>
      <button role="menuitem" type="button" id="copy-course">Copy full probabilistic-method deck</button>
      <button role="menuitem" type="button" id="save-beamdswitch">Download current technique .md</button>
      <button role="menuitem" type="button" id="save-course">Download full deck .md</button>
      <button role="menuitem" type="button" id="copy-sequence">Copy Beam MD Switch sequence</button>
      <button role="menuitem" type="button" id="copy-url">Copy state URL</button>
    </span></span>`;
  const on = (id, fn) => $(id).addEventListener("click", fn);
  on("act-sample", () => setSeed(E.P.seed + 1));
  on("act-step", () => labStep(1));
  on("act-run", () => { S.trialsN = 1000; runExperiment(1000); });
  on("act-reset", () => openModule(S.module));
  on("act-proof", () => toggleProof());
  on("act-deck", () => toggleDeck(true));
  on("export-toggle", () => { const m = $("export-menu"), open = m.hidden; m.hidden = !open; $("export-toggle").setAttribute("aria-expanded", String(open)); });
  const close = () => { $("export-menu").hidden = true; $("export-toggle").setAttribute("aria-expanded", "false"); };
  const deckName = () => `probabilistic-method-${S.module}-beamdswitch.md`;
  on("copy-slide", () => { close(); return copyText(PM.slideMarkdown(E, S.frame), "Slide Markdown"); });
  on("copy-beamdswitch", () => { close(); return copyText(PM.techniqueDeck(E), "Technique deck"); });
  on("copy-course", () => { close(); return copyText(PM.courseDeck(E.P.seed), "Full deck"); });
  on("save-beamdswitch", () => { close(); download(deckName(), PM.techniqueDeck(E)); });
  on("save-course", () => { close(); download("probabilistic-method-course-beamdswitch.md", PM.courseDeck(E.P.seed)); });
  on("copy-sequence", () => { close(); return copyText(PM.switchSequence(E), "Beam MD Switch sequence"); });
  on("copy-url", () => { close(); return copyText(PM.URL_BASE + hashNow(), "State URL"); });
}
function labStep(d) {
  const st = STEPPABLE[S.module]; if (!st) return;
  const max = st(E), cur = S.labStep ?? max;
  S.labStep = d === "start" ? 0 : d === "end" ? max : Math.max(0, Math.min(max, (cur >= max && d > 0 ? -1 : cur) + d));
  updateLab();
}
function toggleProof(force) { if (S.view !== "lab") return; S.lens = (force ?? S.lens !== "proof") ? "proof" : "lab"; render(); writeHash(); }

/* ---------- deck mode: the same frames the export writes ---------- */

function renderDeck() {
  let el = $("deck-root");
  if (!S.deck || S.view !== "lab") { if (el && el.remove) el.remove(); return; }
  if (!el || !el.isConnected) { el = document.createElement("div"); el.id = "deck-root"; document.body.append(el); }
  const frames = PM.deckFrames(E); S.frame = Math.min(S.frame, frames.length - 1);
  const fr = frames[S.frame]; S.step = Math.min(S.step, fr.steps - 1);
  const d = DRAW[S.module](E, { ...S, focus: fr.focus, labStep: null, hl: null });
  el.className = "deck"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", `Deck: ${E.mod.title}`);
  el.innerHTML = `<header><b>${esc(E.mod.title)}</b><span class="small muted">${esc(fr.section)} · frame ${S.frame + 1} of ${frames.length} · switch ${S.step + 1} of ${fr.steps}</span><span style="margin-left:auto"></span><button class="btn quiet" type="button" data-deck="slide">Copy slide</button><button class="btn quiet" type="button" data-deck="copy">Copy deck</button><button class="btn quiet" type="button" data-deck="save">Download .md</button><button class="btn" type="button" data-deck="close" aria-label="Exit deck mode (Escape)">Exit ✕</button></header>
    <div class="body"><div class="stage">${d.svg}<p class="summary">${esc(d.summary)}</p></div><div class="slide"><h2>${esc(fr.title)}</h2>${PM.renderMarkdown(fr.body, S.step)}${fr.key ? `<div class="verdict ok"><b>Key</b>${esc(fr.key)}</div>` : ""}<p class="small muted"><b>Narration:</b> ${esc(fr.narration)}</p></div></div>
    <footer><button class="btn" type="button" data-deck="prev" aria-label="Previous switch">◀</button><button class="btn primary" type="button" data-deck="next" aria-label="Next switch">▶</button><span class="small muted">← → or Space to advance · Esc to exit · voice: bf_emma</span></footer>`;
  say(`${fr.title}. ${fr.narration}`);
}
function deckMove(d) {
  const frames = PM.deckFrames(E);
  if (d > 0) { if (S.step + 1 < frames[S.frame].steps) S.step++; else if (S.frame + 1 < frames.length) { S.frame++; S.step = 0; } }
  else if (S.step > 0) S.step--; else if (S.frame > 0) { S.frame--; S.step = frames[S.frame].steps - 1; }
  renderDeck(); writeHash();
}
function toggleDeck(on) { if (S.view !== "lab") return; S.deck = on; if (on) { S.frame = S.frame || 0; S.step = S.step || 0; } render(); writeHash(); }

/* ---------- command palette and help ---------- */

function openPalette() {
  closeOverlay();
  const o = document.createElement("div"); o.className = "overlay"; o.id = "overlay";
  o.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="Search techniques"><input id="pal-input" type="search" placeholder="Search: bad events, tails, remove randomness, common neighbours…" aria-label="Search" autocomplete="off"><ul class="results" id="pal-results" role="listbox"></ul></div>`;
  document.body.append(o);
  const input = $("pal-input"), list = $("pal-results");
  let items = [], sel = 0;
  const draw = () => {
    items = input.value ? PM.search(input.value) : PM.MODULES.map((m) => ({ kind: "module", id: m.id, title: m.title, built: true }));
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.map((r, i) => `<li role="option" aria-selected="${i === sel}"><button type="button" data-pal="${i}">${esc(r.title)} <span class="small muted">${r.kind === "module" ? "lab" : r.module ? `in the ${esc(PM.moduleById(r.module).short)} lab` : "not yet built"}</span></button></li>`).join("") || '<li class="small muted">No match.</li>';
  };
  const go = (r) => { closeOverlay(); if (!r) return; if (r.kind === "module") openModule(r.id); else if (r.module) openModule(r.module, { focus: PM.techniqueById(r.id).scene }); else { S.view = "technique"; S.technique = r.id; render(); writeHash(); } };
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === "Enter") { go(items[sel]); e.preventDefault(); } });
  list.addEventListener("click", (e) => { const b = e.target.closest("[data-pal]"); if (b) go(items[Number(b.dataset.pal)]); });
  o.addEventListener("click", (e) => { if (e.target === o) closeOverlay(); });
  draw(); input.focus();
}
function openHelp() {
  closeOverlay();
  const keys = [["← / →", "previous / next proof state (deck: switch)"], ["↑ / ↓", "previous / next technique"], ["Space", "sample / advance"], ["R", "resample (new seed)"], ["A", "autoplay the proof"], ["P", "proof lens"], ["E", "experiment lens"], ["D", "deck mode"], ["C", "compare"], ["B", "show the bound"], ["?", "this help"], ["⌘K / Ctrl-K / /", "command palette"], ["Esc", "exit focused mode"]];
  const o = document.createElement("div"); o.className = "overlay"; o.id = "overlay";
  o.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"><h2>Keyboard</h2><table class="rows">${keys.map(([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td style="text-align:left;font-family:var(--sans)">${esc(v)}</td></tr>`).join("")}</table><p><button class="btn" type="button" id="help-close">Close</button></p></div>`;
  document.body.append(o); $("help-close").addEventListener("click", closeOverlay); $("help-close").focus();
  o.addEventListener("click", (e) => { if (e.target === o) closeOverlay(); });
}
function closeOverlay() { const o = $("overlay"); if (o && o.isConnected && o.remove) o.remove(); }

/* ---------- events ---------- */

function proofSteps() { return E.mod.proof(E.P, E.A); }
function setProofIndex(i) {
  const steps = proofSteps(); S.proofIndex = (i + steps.length) % steps.length; S.focus = steps[S.proofIndex].focus; updateLab(); writeHash();
}
function onMainClick(e) {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.dataset.act, id = t.dataset.id, i = Number(t.dataset.i);
  if (act === "module") { openModule(id, t.dataset.focus ? { focus: t.dataset.focus } : {}); return; }
  if (act === "atlas-inventory") { S.view = "atlas"; render(); writeHash(); const inv = $("inventory"); if (inv && inv.scrollIntoView) inv.scrollIntoView(); return; }
  if (act === "recommend") { S.view = "recommend"; S.rec = ["start"]; render(); writeHash(); return; }
  if (act === "open-search") { openPalette(); return; }
  if (act === "rec") { S.rec = [...S.rec, id]; render(); return; }
  if (act === "rec-back") { S.rec = S.rec.slice(0, -1); render(); return; }
  if (act === "rec-reset") { S.rec = ["start"]; render(); return; }
  if (act === "concept") { S.conceptSel = id; render(); return; }
  if (act === "focus") { S.focus = S.focus === id ? "" : id; updateLab(); writeHash(); return; }
  if (act === "proof-step") { setProofIndex(i); return; }
  if (act === "hl") { S.hl = S.hl === i ? null : i; updateLab(); return; }
  if (act === "j") { S.j = S.j === i ? null : i; updateLab(); return; }
  if (act === "focus-event") { setParam("focus", i); return; }
  if (act === "new-seed") { setSeed(Math.floor(Math.random() * 1e6)); return; }
  if (act === "copy-state") { copyText(PM.URL_BASE + hashNow(), "State URL"); return; }
  if (act === "asym") { S.asym = t.dataset.v === "1"; updateLab(); writeHash(); return; }
  if (act === "break") { S.P = E.mod.breakIt.apply(S.P, E.A); evaluateNow(); renderLab($("main")); writeHash(); toast("Hypothesis broken: see the assumptions"); return; }
  if (act === "reset") { openModule(S.module); return; }
  if (act === "run") { runExperiment(S.trialsN); return; }
  if (act === "step") { labStep(1); return; }
  if (act === "step-back") { labStep(-1); return; }
  if (act === "step-start") { labStep("start"); return; }
  if (act === "step-end") { labStep("end"); return; }
  if (act === "reveal") { S.reveal = !S.reveal; updateLab(); return; }
  if (act === "flip-sign") { const x = (S.signs || E.I.x).slice(); x[i] = -x[i]; S.signs = x; updateLab(); return; }
  if (act === "reset-signs") { S.signs = null; updateLab(); return; }
  if (act === "clear-flips") { setParam("flips", ""); return; }
  if (act === "matrix") {
    const r = t.getBoundingClientRect(), n = Number(t.dataset.n), col = Math.floor(((e.clientX - r.left) / r.width) * n), row = Math.floor(((e.clientY - r.top) / r.height) * n);
    if (row !== col && row >= 0 && col >= 0 && row < n && col < n) flipPair(row, col);
  }
}
function flipPair(a, b) { const list = String(S.P.flips || "").split(",").filter(Boolean); list.push(`${Math.min(a, b)}-${Math.max(a, b)}`); setParam("flips", list.join(",")); }
function onMainInput(e) {
  const t = e.target;
  if (t.dataset && t.dataset.param) { setParam(t.dataset.param, t.value); return; }
}
function onMainChange(e) {
  const t = e.target, act = t.dataset && t.dataset.act;
  if (t.dataset && t.dataset.param && t.tagName === "SELECT") { setParam(t.dataset.param, t.value); return; }
  if (act === "module-select") { openModule(t.value); return; }
  if (act === "trials-n") { S.trialsN = Number(t.value); updateExperiment(); return; }
  if (act === "seed-input") { const v = Math.floor(Number(t.value)); if (Number.isFinite(v) && v >= 0) setSeed(v); return; }
  if (act === "cmp") { if (t.dataset.side === "a") S.cmpA = t.value; else S.cmpB = t.value; render(); writeHash(); }
}
function onMainSubmit(e) {
  const form = e.target; if (!form.dataset || form.dataset.act !== "flip-form") return;
  e.preventDefault(); const a = Number(form.elements.i.value), b = Number(form.elements.j.value);
  if (Number.isInteger(a) && Number.isInteger(b) && a !== b) flipPair(a, b);
}
function onDeckClick(e) {
  const b = e.target.closest && e.target.closest("[data-deck]"); if (!b) return;
  const k = b.dataset.deck;
  if (k === "close") toggleDeck(false);
  if (k === "next") deckMove(1);
  if (k === "prev") deckMove(-1);
  if (k === "slide") copyText(PM.slideMarkdown(E, S.frame), "Slide Markdown");
  if (k === "copy") copyText(PM.techniqueDeck(E), "Technique deck");
  if (k === "save") download(`probabilistic-method-${S.module}-beamdswitch.md`, PM.techniqueDeck(E));
}
function autoplay() {
  if (S.autoplay) { clearInterval(S.autoplay); S.autoplay = null; toast("Autoplay stopped"); return; }
  if (S.view !== "lab") return;
  setProofIndex(0);
  S.autoplay = setInterval(() => { const n = proofSteps().length; if ((S.proofIndex ?? 0) + 1 >= n) { clearInterval(S.autoplay); S.autoplay = null; return; } setProofIndex((S.proofIndex ?? 0) + 1); }, 1800);
}
function onKey(e) {
  const tag = (e.target && e.target.tagName) || "", typing = /INPUT|SELECT|TEXTAREA/.test(tag);
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); openPalette(); return; }
  if (e.key === "Escape") { if ($("overlay") && $("overlay").isConnected) closeOverlay(); else if (S.deck) toggleDeck(false); else if (S.lens === "proof") toggleProof(false); else { const m = $("export-menu"); if (m) m.hidden = true; } return; }
  if (typing || e.altKey || e.metaKey || e.ctrlKey) return;
  if ($("overlay") && $("overlay").isConnected) return;
  if (e.target && e.target.closest && e.target.closest("[role=button]") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.target.closest("[role=button]").dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
  const k = e.key;
  if (k === "/") { e.preventDefault(); openPalette(); return; }
  if (k === "?") { openHelp(); return; }
  if (S.view !== "lab") return;
  if (S.deck) { if (k === "ArrowRight" || k === " ") { e.preventDefault(); deckMove(1); } else if (k === "ArrowLeft") { e.preventDefault(); deckMove(-1); } else if (k === "d" || k === "D") toggleDeck(false); return; }
  const idx = PM.MODULES.findIndex((m) => m.id === S.module);
  if (k === "ArrowRight") { e.preventDefault(); setProofIndex((S.proofIndex ?? -1) + 1); }
  else if (k === "ArrowLeft") { e.preventDefault(); setProofIndex((S.proofIndex ?? 0) - 1); }
  else if (k === "ArrowDown") { e.preventDefault(); openModule(PM.MODULES[(idx + 1) % PM.MODULES.length].id); }
  else if (k === "ArrowUp") { e.preventDefault(); openModule(PM.MODULES[(idx - 1 + PM.MODULES.length) % PM.MODULES.length].id); }
  else if (k === " ") { if (e.target && /BUTTON|A/.test(tag)) return; e.preventDefault(); if (STEPPABLE[S.module]) labStep(1); else setSeed(E.P.seed + 1); }
  else if (k === "r" || k === "R") setSeed(E.P.seed + 1);
  else if (k === "a" || k === "A") autoplay();
  else if (k === "p" || k === "P") toggleProof();
  else if (k === "e" || k === "E") { S.lens = S.lens === "experiment" ? "lab" : "experiment"; const w = $("lab-exp-wrap"); if (w && w.scrollIntoView) w.scrollIntoView({ block: "start" }); writeHash(); }
  else if (k === "d" || k === "D") toggleDeck(true);
  else if (k === "c" || k === "C") { location.hash = `#compare/${S.module}/${E.mod.compare[0]}`; }
  else if (k === "b" || k === "B") { S.focus = "bound"; updateLab(); const b = $("bound-eq"); if (b && b.focus) b.focus(); }
}

/* ---------- theme ---------- */

function applyTheme(t) { const root = document.documentElement; if (t === "light" || t === "dark") root.setAttribute("data-theme", t); else root.removeAttribute("data-theme"); }
function cycleTheme() {
  let t = ""; try { t = localStorage.getItem("theme") || ""; } catch (e) { /* storage may be blocked */ }
  t = t === "" ? "light" : t === "light" ? "dark" : "";
  try { if (t) localStorage.setItem("theme", t); else localStorage.removeItem("theme"); } catch (e) { /* ignore */ }
  applyTheme(t); toast(`Theme: ${t || "system"}`);
}

/* ---------- WebMCP: read-only tools for agents ---------- */

const result = (v) => ({ content: [{ type: "text", text: JSON.stringify(v) }] });
const ro = { readOnlyHint: true }, none = { type: "object", properties: {}, additionalProperties: false };
function analyseFor(input) {
  const mod = PM.moduleById(input && input.module);
  if (!mod) return { error: `Unknown module. Use one of: ${PM.MODULES.map((m) => m.id).join(", ")}.` };
  const Ev = PM.evaluate(mod, PM.withParams(mod, { ...(input.params || {}), seed: input.seed ?? PM.DEFAULT_SEED }));
  return { Ev, mod };
}
const tools = [
  { name: "get_metadata", description: "What this atlas contains: its modules (labs), the complete technique inventory with stable ids and build status, and the course order.", inputSchema: none, annotations: ro,
    async execute() { return result({ title: "Probabilistic Method Atlas", url: PM.URL_BASE, modules: PM.MODULES.map((m) => ({ id: m.id, route: m.route, title: m.title, family: m.family, params: m.params.filter((p) => !p.hidden).map((p) => ({ key: p.key, label: p.label, default: p.def, min: p.min, max: p.max, options: p.options && p.options.map((o) => o[0]) })) })), inventory: PM.INVENTORY.map((t) => ({ n: t.n, id: t.id, title: t.title, family: t.family, built: !!t.module, module: t.module })), course: PM.COURSE }); } },
  { name: "get_current_state", description: "The page as set: view, module, parameters, seed, the proof quantities, every assumption's status and the state URL.", inputSchema: none, annotations: ro,
    async execute() {
      if (S.view !== "lab") return result({ view: S.view, url: PM.URL_BASE + hashNow() });
      const asm = E.mod.assumptions(E.P, E.A);
      return result({ view: "lab", module: S.module, params: E.P, quantities: E.A.rows.map(([label, value]) => ({ label, value })), assumptions: asm.map((a) => ({ label: a.label, holds: a.ok, reason: a.ok ? null : a.broken })), conclusion: E.mod.proof(E.P, E.A).at(-1).text, summary: DRAW[S.module](E, S).summary, url: PM.URL_BASE + hashNow() });
    } },
  { name: "analyse_technique", description: "Compute one lab's proof quantities, assumptions and proof steps for given parameters and seed, without changing the page.", annotations: ro,
    inputSchema: { type: "object", properties: { module: { type: "string" }, params: { type: "object" }, seed: { type: "integer", minimum: 0 } }, required: ["module"], additionalProperties: false },
    async execute(input) { const r = analyseFor(input); if (r.error) return result(r); const { Ev, mod } = r; return result({ module: mod.id, params: Ev.P, quantities: Ev.A.rows.map(([label, value]) => ({ label, value })), assumptions: mod.assumptions(Ev.P, Ev.A).map((a) => ({ label: a.label, holds: a.ok })), proof: mod.proof(Ev.P, Ev.A).map((p) => p.text) }); } },
  { name: "export_technique_deck", description: "The narrated beamdswitch Markdown deck for one lab at given parameters and seed (deterministic).", annotations: ro,
    inputSchema: { type: "object", properties: { module: { type: "string" }, params: { type: "object" }, seed: { type: "integer", minimum: 0 } }, required: ["module"], additionalProperties: false },
    async execute(input) { const r = analyseFor(input); if (r.error) return result(r); return result({ module: r.mod.id, markdown: PM.techniqueDeck(r.Ev) }); } },
  { name: "run_self_tests", description: "Run the built-in deterministic self-tests.", inputSchema: none, annotations: ro, async execute() { return result(PM.selfTests()); } },
];
self.ProbabilisticMethodTools = tools;
const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
if (mc && typeof mc.registerTool === "function") for (const t of tools) mc.registerTool(t);

/* ---------- start ---------- */

function start() {
  const st = $("static"); if (st && st.remove) st.remove();
  $("app").hidden = false;
  try { applyTheme(localStorage.getItem("theme") || ""); } catch (e) { /* storage may be blocked */ }
  buildActions();
  $("mode-atlas").addEventListener("click", () => { S.view = "atlas"; S.deck = false; render(); writeHash(); });
  $("mode-lab").addEventListener("click", () => { if (S.module) { S.view = "lab"; S.lens = "lab"; S.deck = false; evaluateNow(); render(); writeHash(); } else openModule("first-moment"); });
  $("mode-proof").addEventListener("click", () => { if (S.view !== "lab") openModule(S.module || "first-moment", { lens: "proof" }); else toggleProof(); });
  $("mode-deck").addEventListener("click", () => { if (S.view !== "lab") openModule(S.module || "first-moment", { deck: true }); else toggleDeck(!S.deck); });
  $("open-search").addEventListener("click", openPalette);
  $("theme").addEventListener("click", cycleTheme);
  $("help").addEventListener("click", openHelp);
  const main = $("main");
  main.addEventListener("click", onMainClick); main.addEventListener("input", onMainInput); main.addEventListener("change", onMainChange); main.addEventListener("submit", onMainSubmit);
  document.addEventListener("click", onDeckClick);
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", () => { if (location.hash === hashNow()) return; applyHash(location.hash); render(); });
  SELF = PM.selfTests();
  applyHash(location.hash);
  render();
}
start();
