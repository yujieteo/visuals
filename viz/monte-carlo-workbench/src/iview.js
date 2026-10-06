/* Monte Carlo Probability Workbench: the view of the guided interview, group 6. The questions sit in the left panel,
 * one select for each question that the earlier answers make relevant, with the optional numbers of the evidence.
 * The centre card shows the status of the interview ("insufficient evidence" with its reasons, or the ranked
 * candidates), each candidate with its reason, its competing explanations, its rejection tests and its sampling
 * methods, the model components, the unresolved assumptions, and the rule path as a graph and as a table in which
 * the reader switches a rule off. The reader picks any candidate of the pool, and "Make the model record" writes it
 * as model text and applies it as the custom model, the same record that the editor makes. The answers, the rules
 * switched off and the pick are the state fields iv, iv_off and iv_pick. view.js calls these functions.
 */
(function () {
  "use strict";
  const g = /** @type {any} */ (globalThis);
  const Iv = g.MCInterview, P = g.MCPlots;
  /** @param {unknown} s */
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);
  /** @param {number | null | undefined} v */
  const fmt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "–" : P.fmt(v));
  /** @param {number} d */
  const signed = (d) => (d > 0 ? `+${d}` : `−${-d}`);
  const BASIS = /** @type {Record<string, string>} */ ({ theorem: "Theorem", assumption: "Modelling assumption" });
  /** @param {string} b @param {string} source */
  const basisTag = (b, source) => `<span class="tag tag-${b === "theorem" ? "theorem" : "assumption"}" title="${esc(source)}">${BASIS[b]}</span>`;

  /** @type {any} */
  let app = null;
  /** @type {any} */
  let data = null;
  /** @type {any} */
  let hooks = null;
  /** The last evaluation and its key. @type {{ key: string, result: any }} */
  let last = { key: "", result: null };

  /** The evaluation of a state, kept for the same answers, rules switched off and pick. @param {Record<string, any>} s */
  function evaluate(s) {
    const key = JSON.stringify([s.iv, s.iv_off, s.iv_pick]);
    if (last.key !== key) last = { key, result: Iv.evaluate(data, { iv: s.iv, off: s.iv_off, pick: s.iv_pick }) };
    return last.result;
  }

  /** Set the answer text from the controls of the left panel, in its canonical form. @param {Record<string, string>} answers @param {Record<string, number>} evidence */
  function setAnswers(answers, evidence) {
    const text = Iv.format(data.interview, answers, evidence);
    if (text.length > 200) { $("notice").textContent = "The interview answers hold at most 200 characters. Clear some numbers."; return; }
    app.set({ iv: text });
  }

  /** Build the questions and the evidence fields once; draw() shows the relevant ones and sets their values. */
  function buildForm() {
    const spec = data.interview;
    const parts = [];
    for (const t of spec.topics) {
      parts.push(`<h3 class="law-head">${esc(t.title)}</h3>`);
      for (const q of spec.questions.filter((/** @type {any} */ x) => x.topic === t.id)) {
        parts.push(`<div class="iv-q" id="iv-row-${q.id}"><label for="iv-q-${q.id}">${esc(q.text)}</label>
<select id="iv-q-${q.id}" data-iv="${q.id}" aria-describedby="iv-h-${q.id}"><option value="">Not answered</option><option value="?">I do not know</option>${q.options.map((/** @type {any} */ o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("")}</select>
<p class="note" id="iv-h-${q.id}">${esc(q.help)}</p></div>`);
      }
    }
    parts.push('<h3 class="law-head">Numbers, if you know them</h3>');
    for (const e of spec.evidence) {
      parts.push(`<div class="iv-q" id="iv-row-e-${e.id}"><label for="iv-e-${e.id}">${esc(e.label)}</label>
<input id="iv-e-${e.id}" type="number" step="any" min="${e.min}" max="${e.max}" data-iv-e="${e.id}" inputmode="decimal" aria-describedby="iv-eh-${e.id}">
<p class="note" id="iv-eh-${e.id}">${esc(e.help)}</p></div>`);
    }
    $("iv-questions").innerHTML = parts.join("");
    $("iv-example").innerHTML = `<option value="">Choose an example</option>${spec.examples.map((/** @type {any} */ x) => `<option value="${esc(x.id)}">${esc(x.label)}</option>`).join("")}`;
  }

  /** @param {Record<string, any>} s */
  function drawForm(s) {
    const spec = data.interview;
    const { answers, evidence } = Iv.parse(s.iv, spec);
    const v = Iv.values(spec, answers);
    for (const q of spec.questions) {
      $(`iv-row-${q.id}`).hidden = v[q.id] === "-";
      const sel = $(`iv-q-${q.id}`), want = answers[q.id] ?? "";
      if (sel.value !== want) sel.value = want;
    }
    const r = evaluate(s);
    for (const e of spec.evidence) {
      $(`iv-row-e-${e.id}`).hidden = !r.evidence.some((/** @type {any} */ x) => x.id === e.id);
      const input = $(`iv-e-${e.id}`), want = evidence[e.id] === undefined ? "" : String(evidence[e.id]);
      if (document.activeElement !== input && input.value !== want) input.value = want;
    }
  }

  /** The rule path as a graph: answers on the left, the rules that fired in the centre, their outcomes on the right. @param {any} r */
  function graph(r) {
    const fired = r.path.filter((/** @type {any} */ p) => !p.off);
    const shown = new Set([...r.candidates.filter((/** @type {any} */ c) => c.supported).slice(0, 6).map((/** @type {any} */ c) => c.id), ...(r.chosen ? [r.chosen] : []), ...r.components.slice(0, 4).map((/** @type {any} */ c) => c.id)]);
    /** @typedef {{ id: string, label: string, title: string, cls: string }} GNode */
    /** @type {GNode[]} */
    const left = [];
    /** @type {GNode[]} */
    const mid = [];
    /** @type {GNode[]} */
    const right = [];
    /** @type {{ a: string, b: string, cls: string }[]} */
    const edges = [];
    const add = (/** @type {any[]} */ col, /** @type {any} */ n) => { if (!col.some((x) => x.id === n.id)) col.push(n); };
    for (const p of fired) {
      const effects = p.effect === "insufficient" ? [{ id: "out:insufficient", label: "Insufficient evidence", cls: "insufficient" }]
        : p.effect === "assume" ? [{ id: "out:assume", label: "Unresolved assumption", cls: "assume" }]
          : p.targets.filter((/** @type {any} */ t) => shown.has(t.id)).map((/** @type {any} */ t) => ({ id: `c:${t.id}`, label: t.name, cls: `cand${t.id === r.chosen ? " chosen" : ""}`, delta: t.delta }));
      if (!effects.length) continue;
      add(mid, { id: `r:${p.id}`, label: p.id, title: `${p.id}: ${p.reason}`, cls: `rule ${p.basis}` });
      for (const w of p.when) {
        add(left, { id: `a:${w.question}`, label: `${w.short}: ${w.label}`, title: `${w.text} ${w.label}`, cls: "answer" });
        edges.push({ a: `a:${w.question}`, b: `r:${p.id}`, cls: "in" });
      }
      for (const e of effects) {
        add(right, { id: e.id, label: e.label, title: e.label, cls: e.cls });
        edges.push({ a: `r:${p.id}`, b: e.id, cls: e.cls === "insufficient" ? "insufficient" : e.cls === "assume" ? "assume" : /** @type {any} */ (e).delta > 0 ? "for" : "against" });
      }
    }
    const W = P.W, rowH = 26, rows = Math.max(left.length, mid.length, right.length, 1), h = rows * rowH + 40;
    const cols = [[left, 120], [mid, 330], [right, 530]];
    const pos = new Map();
    for (const [col, x] of /** @type {[any[], number][]} */ (cols)) col.forEach((n, i) => pos.set(n.id, { x, y: 30 + (i + 0.5) * ((h - 40) / Math.max(col.length, 1)) }));
    const cut = (/** @type {string} */ t, /** @type {number} */ k) => (t.length > k ? `${t.slice(0, k - 1)}…` : t);
    const out = [`<text class="head" x="120" y="16" text-anchor="middle">Answers</text><text class="head" x="330" y="16" text-anchor="middle">Rules that fired</text><text class="head" x="530" y="16" text-anchor="middle">Outcomes</text>`];
    for (const e of edges) {
      const a = pos.get(e.a), b = pos.get(e.b);
      if (!a || !b) continue;
      const ax = e.a.startsWith("a:") ? a.x + 105 : a.x + 30, bx = e.b.startsWith("r:") ? b.x - 30 : b.x - 95;
      out.push(`<path class="edge ${e.cls}" d="M${ax} ${a.y.toFixed(1)} C${((ax + bx) / 2).toFixed(1)} ${a.y.toFixed(1)} ${((ax + bx) / 2).toFixed(1)} ${b.y.toFixed(1)} ${bx} ${b.y.toFixed(1)}"/>`);
    }
    for (const n of left) { const p = pos.get(n.id); out.push(`<g class="node ${n.cls}"><title>${esc(n.title)}</title><rect x="${p.x - 105}" y="${(p.y - 10).toFixed(1)}" width="210" height="20" rx="3"/><text x="${p.x}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle">${esc(cut(n.label, 30))}</text></g>`); }
    for (const n of mid) { const p = pos.get(n.id); out.push(`<g class="node ${n.cls}"><title>${esc(n.title)}</title><rect x="${p.x - 30}" y="${(p.y - 10).toFixed(1)}" width="60" height="20" rx="10"/><text x="${p.x}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle">${esc(n.label)}</text></g>`); }
    for (const n of right) { const p = pos.get(n.id); out.push(`<g class="node ${n.cls}"><title>${esc(n.title)}</title><rect x="${p.x - 95}" y="${(p.y - 10).toFixed(1)}" width="190" height="20" rx="3"/><text x="${p.x}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle">${esc(cut(n.label, 27))}</text></g>`); }
    const label = `Rule path: ${left.length} answers, ${mid.length} rules that fired and ${right.length} outcomes. A solid line supports a candidate, a dashed line excludes it`;
    return `<svg class="chart rulegraph" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>${out.join("")}</svg>`;
  }

  /** One candidate or component, with its reasons, other explanations, tests and methods. @param {any} c @param {any} r */
  function candidate(c, r) {
    const b = c.available ? Iv.build(data, r, c.id) : null;
    const pro = c.reasons.filter((/** @type {any} */ x) => x.delta > 0), con = c.reasons.filter((/** @type {any} */ x) => x.delta < 0);
    const where = c.role === "component" ? `Model component of group ${c.group}` : c.groupHere ? "On this page" : `Group ${c.group}, to come`;
    const methods = b?.ok ? `<dl class="readout">${[["independent", "Independent sampling"], ["inverse", "Inverse transform"], ["rejection", "Rejection sampling"]].map(([k, n]) => `<dt>${n}</dt><dd>${esc(b.methods[k].label)}. <em>${esc(b.methods[k].exactness)}</em></dd>`).join("")}</dl>`
      : c.methods ? `<p>${esc(c.methods)}</p>` : b ? `<p class="bad-text">${esc(b.errors.join(" "))}</p>` : "";
    const moments = b?.ok && b.moments.component === null ? `<p>At the parameters of the model record: mean ${fmt(b.moments.mean)}${b.moments.mean === null ? " (it does not exist)" : ""}, variance ${fmt(b.moments.variance)}${b.moments.variance === null ? " (it does not exist)" : ""}. ${b.illustrative.length ? `Illustrative values: ${b.illustrative.map((/** @type {string} */ n) => `<span class="mono">${esc(n)}</span>`).join(", ")}.` : ""} <span class="tag tag-theorem">Theorem</span></p>` : "";
    return `<li class="iv-cand${c.id === r.chosen ? " chosen" : ""}" data-candidate="${esc(c.id)}">
<h4>${c.role === "law" ? `${c.rank}. ` : ""}${esc(c.name)} <span class="tag">score ${c.score > 0 ? "+" : ""}${c.score}</span> <span class="tag">${esc(where)}</span>${c.id === r.chosen ? ' <span class="tag tag-chosen">Chosen</span>' : ""}</h4>
${pro.length ? `<p><strong>Reason.</strong> ${pro.map((/** @type {any} */ x) => `${esc(x.text)} ${basisTag(x.basis, x.source)}`).join(" ")}</p>` : '<p class="note">No rule supports it with these answers.</p>'}
${con.length ? `<p><strong>Against it.</strong> ${con.map((/** @type {any} */ x) => `${esc(x.text)} ${basisTag(x.basis, x.source)}`).join(" ")}</p>` : ""}
<p><strong>Other explanations.</strong> ${c.competing.map((/** @type {any} */ x) => `${esc(x.name)}${x.score !== null ? ` (score ${x.score})` : ""}: ${esc(x.text)}`).join(" ")}</p>
<details><summary>Rejection tests and sampling methods</summary>
<h5>Rejection tests</h5><ul>${c.tests.map((/** @type {string} */ t) => `<li>${esc(t)}</li>`).join("")}</ul>
<h5>Sampling methods</h5>${methods}${moments}
${c.example ? `<p><button type="button" class="link" data-open="${esc(c.example)}">Open an example model with it</button></p>` : ""}
</details></li>`;
  }

  /** @param {Record<string, any>} s */
  function drawCard(s) {
    const r = evaluate(s);
    const box = $("iv-body");
    const key = JSON.stringify([last.key, s.nav]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const focus = document.activeElement?.id;
    const supported = r.candidates.filter((/** @type {any} */ c) => c.supported);
    const shown = supported.slice(0, 6);
    const chosen = r.candidates.find((/** @type {any} */ c) => c.id === r.chosen);
    if (chosen && !shown.includes(chosen)) shown.push(chosen);
    const rest = r.candidates.filter((/** @type {any} */ c) => !shown.includes(c) && !c.excluded), out = r.candidates.filter((/** @type {any} */ c) => !shown.includes(c) && c.excluded);
    const tie = r.tie.length > 1 ? ` The rule graph cannot separate ${r.tie.map((/** @type {string} */ id) => esc(r.candidates.find((/** @type {any} */ c) => c.id === id).prose)).join(" and ")}: the rejection tests can.` : "";
    const status = r.status === "insufficient"
      ? `<div class="callout bad" id="iv-status"><p><strong>Insufficient evidence.</strong> The interview does not propose a model, because:</p><ul>${r.insufficient.map((/** @type {any} */ x) => `<li>${esc(x.reason)} <span class="note">(rule ${esc(x.rule)})</span></li>`).join("")}</ul><p class="note">Answer more questions, switch a rule off below, or choose a candidate yourself.</p></div>`
      : `<div class="callout ok" id="iv-status"><p><strong>${supported.length} ${supported.length === 1 ? "candidate" : "candidates"} for the ${esc(r.pool.noun)}.</strong> The rule graph ranks the ${esc(r.candidates[0].prose)} law first.${tie}</p></div>`;
    const b = chosen ? Iv.build(data, r, chosen.id) : null;
    const opts = r.candidates.map((/** @type {any} */ c) => `<option value="${esc(c.id)}"${c.id === r.chosen && r.picked ? " selected" : ""}>${esc(c.name)} (score ${c.score})</option>`).join("");
    const rules = r.path.map((/** @type {any} */ p) => `<tr${p.off ? ' class="off"' : ""}><td><input type="checkbox" id="iv-rule-${esc(p.id)}" data-rule="${esc(p.id)}"${p.off ? "" : " checked"} aria-label="Use rule ${esc(p.id)}"></td><th scope="row" class="mono">${esc(p.id)}</th>
<td>${p.when.length ? p.when.map((/** @type {any} */ w) => `${esc(w.short)}: ${esc(w.label)}`).join("; ") : "the best score is below 2"}</td>
<td>${p.effect === "insufficient" ? "Insufficient evidence" : p.effect === "assume" ? "Unresolved assumption" : p.targets.map((/** @type {any} */ t) => `${signed(t.delta)} ${esc(t.name)}`).join(", ")}</td>
<td>${basisTag(p.basis, p.source)}<br><span class="note">${esc(p.source)}</span></td><td>${esc(p.reason)}</td></tr>`).join("");
    const spec = data.interview;
    box.innerHTML = `${status}
<ul class="iv-alerts">${spec.alerts.map((/** @type {string} */ a) => `<li>${esc(a)}</li>`).join("")}</ul>
<h3>Evidence</h3>
<dl class="readout iv-evidence">${r.answers.map((/** @type {any} */ a) => `<dt>${esc(a.text)}</dt><dd${a.value === "?" ? ' class="warn-text"' : ""}>${esc(a.label)}</dd>`).join("")}${r.evidence.filter((/** @type {any} */ e) => e.value !== null).map((/** @type {any} */ e) => `<dt>${esc(e.label)}</dt><dd class="mono">${fmt(e.value)}</dd>`).join("")}</dl>
${r.notices.length ? `<ul class="errors">${r.notices.map((/** @type {string} */ n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
<h3>Candidate models</h3>
${shown.length ? `<ol class="iv-cands">${shown.map((/** @type {any} */ c) => candidate(c, r)).join("")}</ol>` : '<p class="note">No candidate has support from the answers yet.</p>'}
${rest.length ? `<p class="note">Other laws for a ${esc(r.pool.noun)}, with no support or exclusion: ${rest.map((/** @type {any} */ c) => esc(c.name)).join(", ")}.</p>` : ""}
${out.length ? `<p class="note">Excluded by the rules: ${out.map((/** @type {any} */ c) => `${esc(c.name)} (score ${c.score})`).join(", ")}.</p>` : ""}
${r.components.length ? `<h3>Model components</h3><p class="note">A law of one value does not give these parts of the model. Each one links to an example model.</p><ol class="iv-cands">${r.components.slice(0, 4).map((/** @type {any} */ c) => candidate(c, r)).join("")}</ol>` : ""}
<h3>Unresolved assumptions</h3>
${r.assumptions.length ? `<ul>${r.assumptions.map((/** @type {any} */ a) => `<li>${esc(a.text)}</li>`).join("")}</ul>` : '<p class="note">None: each question has an answer, and no rule records an assumption.</p>'}
<h3>Rule path</h3>
<div class="plot" id="iv-graph">${graph(r)}</div>
<p class="note">Clear a box to switch a rule off. The ranking then changes. A rule switched off stays in the table.</p>
<div class="table-scroll"><table class="iv-rules"><thead><tr><th scope="col">Use</th><th scope="col">Rule</th><th scope="col">When</th><th scope="col">Effect</th><th scope="col">Basis</th><th scope="col">Reason</th></tr></thead><tbody>${rules || '<tr><td colspan="6">No rule fired yet.</td></tr>'}</tbody></table></div>
<h3>Model record</h3>
<label class="label" for="iv-pick">Candidate for the model record</label>
<select id="iv-pick"><option value=""${r.picked ? "" : " selected"}>The top candidate of the rule graph</option>${opts}</select>
<p class="row"><button type="button" id="iv-make" class="primary"${b?.ok ? "" : " disabled"}>Make the model record</button></p>
<p id="iv-make-note" class="note">${b?.ok ? `The button writes the ${esc(chosen.prose)} law as model text, reads it with the editor's parser and applies it as the custom model.` : b ? esc(b.errors.join(" ")) : "Choose a candidate: the interview has none to write as a model."}</p>
${b?.ok ? `<details><summary>Model text that the button applies</summary><pre class="mono" id="iv-text">${esc(b.text)}</pre></details>` : ""}
<details><summary>The whole rule graph: ${spec.questions.length} questions, ${spec.rules.length} rules and ${spec.candidates.length} candidates</summary>
<ul class="iv-all">${spec.rules.map((/** @type {any} */ x) => `<li><span class="mono">${esc(x.id)}</span>: ${x.when === "weak" ? "when the best score is below 2" : (Array.isArray(x.when) ? x.when : [x.when]).map((/** @type {any} */ c) => Object.entries(c).map(([q, o]) => `${esc(spec.questions.find((/** @type {any} */ y) => y.id === q).short)} ∈ {${/** @type {string[]} */ (o).map((v) => esc(v)).join(", ")}}`).join(" and ")).join(" or ")} → ${esc(x.effect)}${x.targets ? ` ${esc(x.targets.join(", "))}` : ""}${x.weight ? ` (${x.weight})` : ""}. ${esc(x.reason)}</li>`).join("")}</ul></details>`;
    if (focus && $(focus) && document.activeElement !== $(focus)) $(focus).focus();
  }

  /** @param {Record<string, any>} s */
  function draw(s) {
    $("wb-interview").hidden = s.nav !== "interview";
    drawForm(s);
    if (s.nav === "interview") drawCard(s);
  }

  /** @param {any} a the kit's app @param {any} d the catalogue @param {{ apply(record: any, text: string): void }} h */
  function bind(a, d, h) {
    app = a;
    data = d;
    hooks = h;
    buildForm();
    $("iv-questions").addEventListener("change", (/** @type {Event} */ e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      const { answers, evidence } = Iv.parse(app.state.iv, data.interview);
      if (el.dataset.iv) {
        if (el.value) answers[el.dataset.iv] = el.value;
        else delete answers[el.dataset.iv];
      } else if (el.dataset.ivE) {
        const spec = data.interview.evidence.find((/** @type {any} */ x) => x.id === el.dataset.ivE);
        const v = el.value.trim() === "" ? NaN : Number(el.value);
        if (el.value.trim() === "") delete evidence[spec.id];
        else if (Number.isFinite(v) && v >= spec.min && v <= spec.max && (!spec.integer || Number.isInteger(v)) && !(spec.id === "sd" && v <= 0)) evidence[spec.id] = v;
        else { $("notice").textContent = `${spec.label}: ${spec.help}`; return; }
      } else return;
      setAnswers(answers, evidence);
    });
    $("iv-example").addEventListener("change", () => {
      const x = data.interview.examples.find((/** @type {any} */ y) => y.id === $("iv-example").value);
      if (x) app.set({ iv: x.iv, iv_off: "", iv_pick: "", nav: "interview" });
      $("iv-example").value = "";
    });
    $("iv-clear").addEventListener("click", () => app.set({ iv: "", iv_off: "", iv_pick: "" }));
    $("iv-body").addEventListener("change", (/** @type {Event} */ e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      if (el.id === "iv-pick") app.set({ iv_pick: el.value });
      else if (el.dataset.rule) {
        const off = new Set(String(app.state.iv_off).split(",").filter(Boolean));
        if (el.checked) off.delete(el.dataset.rule);
        else off.add(el.dataset.rule);
        app.set({ iv_off: [...off].join(",").slice(0, 200) });
      }
    });
    $("iv-body").addEventListener("click", (/** @type {Event} */ e) => {
      if (/** @type {HTMLElement} */ (e.target).closest?.("#iv-make")) make();
    });
  }

  /** Write the chosen candidate as model text and apply it as the custom model. */
  function make() {
    const r = evaluate(app.state);
    const b = Iv.build(data, r);
    if (!b.ok) { $("iv-make-note").textContent = b.errors.join(" "); return false; }
    hooks.apply(b.record, b.text);
    return true;
  }

  const tool = {
    name: "get_interview",
    description: "Return the guided interview of the current view: the answers and the evidence, the status (candidates or insufficient evidence) with its reasons, the ranked candidates with their reasons, competing explanations, rejection tests and sampling methods, the model components, the unresolved assumptions, the rule path, and the model text of the chosen candidate.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const r = evaluate(app.state), b = r.chosen ? Iv.build(data, r) : null;
      return { content: [{ type: "text", text: JSON.stringify({ ...r, model: b ? { ok: b.ok, text: b.text ?? null, errors: b.errors } : null }, null, 2) }] };
    },
  };

  const commands = [
    { label: "Open the guided interview", run: () => app.set({ nav: "interview" }) },
    { label: "Make the model record from the interview", run: () => { app.set({ nav: "interview" }); make(); } },
    { label: "Clear the interview answers", run: () => app.set({ iv: "", iv_off: "", iv_pick: "" }) },
  ];

  g.MCInterviewView = { draw, bind, make, tool, commands, result: () => (app ? evaluate(app.state) : null) };
})();
