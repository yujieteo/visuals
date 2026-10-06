/* Scientific Modelling: the views. The kit (VisualKit.start) owns the view state, the URL, Back and Forward, Reset,
 * the view JSON, the Markdown record, the deck, the command palette and the shared WebMCP tools. This file keeps the
 * model records (one per example, in this browser and in the model JSON), draws the three panels from derive(), and
 * adds the editor, the confirmation, the domain's WebMCP tools and palette commands. It never evaluates entered text
 * as code: equations go through the parser in src/expr.js.
 */
(function () {
  "use strict";

  const DATA = JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? "{}");
  const ENGINE = Model.engineData(DATA);
  const R = SM.R, F = SM.F, C = SM.C;
  const STORE_KEY = "scientific-modelling:records:v1";
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);
  /** @param {unknown} s */
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  /** Inline TeX. @param {string} tex */
  const ti = (tex) => `<span data-tex="${esc(tex)}"></span>`;
  /** Display TeX. @param {string} tex */
  const td = (tex) => `<div class="formula" data-tex="${esc(tex)}"></div>`;
  /** @param {string} k */
  const chip = (k) => `<span class="chip ${k}">${esc(R.STATUS[k])}</span>`;
  const SOURCES = Object.fromEntries(DATA.sources.sources.map((/** @type {any} */ s) => [s.id, s]));
  /** @param {string} id */
  const sourceLink = (id) => (SOURCES[id] ? `<a href="${esc(SOURCES[id].url)}" rel="noopener">${esc(SOURCES[id].title)}</a>` : esc(id));
  const SEVERITY = { error: "Error", warning: "Warning", info: "Note" };

  /* ---------- the model records ---------- */

  /** @type {Record<string, any>} */
  let store = {};
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    for (const [k, rec] of Object.entries(raw)) if (rec && rec.schema === R.SCHEMA && rec.schemaVersion === R.SCHEMA_VERSION) store[k] = rec;
  } catch {
    store = {};
  }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* private mode or a full store: the page still works */ }
  }
  /** The record of an example: the researcher's, else the example as loaded. @param {string} example */
  function active(example) {
    if (!store[example]) store[example] = R.fromExample(ENGINE, example);
    return store[example];
  }
  /** @type {any} */
  let app = null;
  /** @param {string} line */
  const tellModel = (line) => { $("model-status").textContent = line; };

  /**
   * Change the active record through `mutate(inputs)`. Each change is a new version; the old one stays for comparison.
   * @param {(inp: any) => void} mutate @param {string} summary @param {boolean} [structural] a change of the editor's rows
   */
  function commit(mutate, summary, structural = false) {
    const ex = app.state.example;
    const rec = active(ex);
    const next = R.edit(rec, mutate, summary);
    if (next === rec) return;
    store[ex] = next;
    persist();
    if (structural) editorKey = "";
    tellModel(`${summary} The model is now version ${next.version}.`);
    app.set({});
  }

  /* ---------- the editor ---------- */

  let editorKey = "";
  const KIND_OPTIONS = { variable: R.KINDS.variable, equation: R.KINDS.equation, condition: R.KINDS.condition, assumption: R.KINDS.assumption };
  /** @param {string} path @param {string[]} values @param {string} current @param {string} label @param {string[]} [labels] */
  const select = (path, values, current, label, labels) => `<label>${esc(label)}<select data-path="${esc(path)}">${values.map((v, i) => `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(labels ? labels[i] : v || "none")}</option>`).join("")}</select></label>`;
  /** @param {string} path @param {string} value @param {string} label @param {string} [cls] */
  const input = (path, value, label, cls = "") => `<label class="${cls}">${esc(label)}<input type="text" data-path="${esc(path)}" value="${esc(value)}" autocomplete="off" spellcheck="false"></label>`;

  /** Draw the editor from the record. Only a change of rows, an example, an import or a restore redraws it. @param {any} rec */
  function renderEditor(rec) {
    const key = `${app.state.example}|${rec.origin}|${["variables", "equations", "conditions", "assumptions", "scales"].map((k) => rec[k].map((/** @type {any} */ x) => x.id).join(",")).join("|")}|${rec.scales.map((/** @type {any} */ x) => `${x.for}:${x.scale}`).join(",")}`;
    if (key === editorKey) return;
    editorKey = key;
    const q = ENGINE.quantities.quantities;
    const vars = rec.variables;
    const symbolOf = (/** @type {string} */ id) => vars.find((/** @type {any} */ v) => v.id === id)?.symbol ?? "";
    $("editor-body").innerHTML = [
      `<p class="syntax">Each change makes a new version of the model. Equations use plain syntax, such as <code>rho*c_p*d(T,t) = k*d(T,x,x)</code>, or a LaTeX subset, such as <code>\\rho c_p \\frac{\\partial T}{\\partial t}</code>. Units use SI symbols, such as <code>W/(m^2*K)</code>. A lone degC is an absolute temperature; delta_degC is a difference.</p>`,
      `<fieldset><legend>Purpose</legend><div class="grid">`,
      input("title", rec.title, "Title", "wide"),
      input("purpose.question", rec.purpose.question, "Research question", "wide"),
      select("purpose.observable", ["", ...vars.map((/** @type {any} */ v) => v.id)], rec.purpose.observable ?? "", "Quantity of interest", ["none", ...vars.map((/** @type {any} */ v) => v.symbol)]),
      select("purpose.calculation", R.CALCULATIONS, rec.purpose.calculation, "Intended calculation"),
      select("purpose.declaration", ["", ...DATA.catalogue.declarations.map((/** @type {any} */ x) => x.id)], rec.purpose.declaration ?? "", "Declared model", ["none", ...DATA.catalogue.declarations.map((/** @type {any} */ x) => x.title)]),
      input("preferred", rec.preferred.map(symbolOf).join(", "), "Preferred reference variables", "wide"),
      `</div></fieldset>`,
      `<fieldset><legend>Variables</legend>`,
      ...vars.map((/** @type {any} */ v) => `<div class="item"><div class="grid">
        ${input(`variables.${v.id}.symbol`, v.symbol, "Symbol")}${input(`variables.${v.id}.unit`, v.unit, "Unit")}${input(`variables.${v.id}.dimension`, v.dimension, "Dimension")}${input(`variables.${v.id}.value`, v.value, "Value or range")}
        ${input(`variables.${v.id}.meaning`, v.meaning, "Meaning", "wide")}
        ${select(`variables.${v.id}.quantity`, ["", ...q.map((/** @type {any} */ x) => x.id)], v.quantity, "Quantity", ["none", ...q.map((/** @type {any} */ x) => x.name)])}
        ${select(`variables.${v.id}.phase`, ["", "fluid", "solid"], v.phase, "Phase")}
        ${select(`variables.${v.id}.kind`, KIND_OPTIONS.variable, v.kind, "Kind")}
        ${select(`variables.${v.id}.domain`, R.DOMAINS, v.domain, "Domain")}
        ${input(`variables.${v.id}.tex`, v.tex, "TeX (optional)")}
        <label class="check"><input type="checkbox" data-path="variables.${esc(v.id)}.pi"${v.pi ? " checked" : ""}> In the Pi set</label>
        <button type="button" data-remove="variables.${esc(v.id)}">Remove ${esc(v.symbol)}</button>
      </div></div>`),
      `<button type="button" data-add="variables">Add a variable</button></fieldset>`,
      `<fieldset><legend>Equations</legend>`,
      ...rec.equations.map((/** @type {any} */ e) => `<div class="item"><div class="grid">${select(`equations.${e.id}.kind`, KIND_OPTIONS.equation, e.kind, `Kind of ${e.id}`)}${input(`equations.${e.id}.text`, e.text, "Equation", "wide")}${input(`equations.${e.id}.domain`, e.domain ?? "", "Where it holds")}<button type="button" data-remove="equations.${esc(e.id)}">Remove ${esc(e.id)}</button></div></div>`),
      `<button type="button" data-add="equations">Add an equation</button></fieldset>`,
      `<fieldset><legend>Conditions</legend>`,
      ...rec.conditions.map((/** @type {any} */ c) => `<div class="item"><div class="grid">${select(`conditions.${c.id}.kind`, KIND_OPTIONS.condition, c.kind, `Kind of ${c.id}`)}${input(`conditions.${c.id}.text`, c.text, "Condition", "wide")}${input(`conditions.${c.id}.at`, c.at ?? "", "At, such as x = 0")}<button type="button" data-remove="conditions.${esc(c.id)}">Remove ${esc(c.id)}</button></div></div>`),
      `<button type="button" data-add="conditions">Add a condition</button></fieldset>`,
      `<fieldset><legend>Scales</legend><p class="syntax">A scale you enter here replaces the suggested scale of its variable, such as <code>L^2/alpha</code> for t. "Use this scale" in the Nondimensionalizer fills these rows.</p>`,
      ...rec.scales.map((/** @type {any} */ c) => `<div class="item"><div class="grid">${select(`scales.${c.id}.for`, ["", ...vars.filter((/** @type {any} */ v) => v.kind === "coordinate" || v.kind === "field").map((/** @type {any} */ v) => v.id)], c.for ?? "", `Variable of ${c.id}`, ["none", ...vars.filter((/** @type {any} */ v) => v.kind === "coordinate" || v.kind === "field").map((/** @type {any} */ v) => v.symbol)])}${input(`scales.${c.id}.scale`, c.scale ?? "", "Scale, such as L^2/alpha")}${input(`scales.${c.id}.offset`, c.offset ?? "", "Offset, such as T_inf")}${input(`scales.${c.id}.symbol`, c.symbol ?? "", "Dimensionless symbol")}${input(`scales.${c.id}.reason`, c.reason ?? "", "Reason", "wide")}<button type="button" data-remove="scales.${esc(c.id)}">Remove ${esc(c.id)}</button></div></div>`),
      `<button type="button" data-add="scales">Add a scale</button></fieldset>`,
      `<fieldset><legend>Geometry</legend><div class="grid">${input("geometry.domain", rec.geometry.domain ?? "", "Domain", "wide")}${input("geometry.coordinates", rec.geometry.coordinates ?? "", "Coordinates", "wide")}${input("geometry.interfaces", rec.geometry.interfaces ?? "", "Interfaces", "wide")}${select("geometry.shape", ["", "slab", "cylinder", "sphere", "cube"], rec.geometry.shape ?? "", "Shape (for the lumped body)", ["not stated", "slab", "long cylinder", "sphere", "cube"])}</div></fieldset>`,
      `<fieldset><legend>Assumptions</legend>`,
      ...rec.assumptions.map((/** @type {any} */ a) => `<div class="item"><div class="grid">${select(`assumptions.${a.id}.kind`, KIND_OPTIONS.assumption, a.kind, `Kind of ${a.id}`)}${input(`assumptions.${a.id}.text`, a.text, "Assumption", "wide")}${input(`assumptions.${a.id}.relation`, a.relation ?? "", "Relation, such as T_i - T_inf != 0")}${input(`assumptions.${a.id}.source`, a.source ?? "", "Source id")}<button type="button" data-remove="assumptions.${esc(a.id)}">Remove ${esc(a.id)}</button></div></div>`),
      `<button type="button" data-add="assumptions">Add an assumption</button></fieldset>`,
    ].join("\n");
  }

  /** Apply one edited field to the inputs. @param {any} inp @param {string} path @param {any} value */
  function applyPath(inp, path, value) {
    const [list, id, field] = path.split(".");
    if (path === "title") { inp.title = String(value).slice(0, 300); return "the title"; }
    if (path === "preferred") {
      const names = String(value).split(/[\s,]+/).filter(Boolean);
      inp.preferred = names.map((n) => inp.variables.find((/** @type {any} */ v) => v.symbol === n)?.id).filter(Boolean);
      return "the preferred reference variables";
    }
    if (list === "purpose" || list === "geometry") { inp[list][id] = String(value).slice(0, 600); return `the ${list} (${id})`; }
    const item = inp[list]?.find((/** @type {any} */ x) => x.id === id);
    if (!item) return "";
    item[field] = field === "pi" ? Boolean(value) : String(value).slice(0, 600);
    return `the ${field === "pi" ? "Pi set" : field} of ${list === "variables" ? item.symbol : id}`;
  }

  /* ---------- drawing ---------- */

  /** @param {any} d */
  function renderStatus(d) {
    const rec = active(app.state.example);
    const conf = d.confirmed ? `confirmed by you` : d.confirmedVersion ? `not confirmed (version ${d.confirmedVersion} is the confirmed one)` : "not confirmed";
    $("record-status").innerHTML = `<strong>${esc(d.title)}</strong><br>Version ${d.version}, ${esc(conf)}.${rec.origin !== app.state.example ? ` Imported from ${esc(rec.origin)}.` : d.version > 1 ? " You edited this example." : ""}`;
    const btn = $("confirm");
    btn.textContent = d.confirmed ? `You confirmed version ${d.version}` : `Confirm the interpretation of version ${d.version}`;
    btn.disabled = d.confirmed;
  }

  /** @param {any} d */
  function renderInterpretation(d) {
    const it = d.interp;
    const obs = it.variables.find((/** @type {any} */ v) => v.id === it.observable);
    const calc = it.calcs.find((/** @type {any} */ c) => c.intended);
    const vrows = it.variables.map((/** @type {any} */ v) => `<tr><td>${ti(v.tex)}</td><td>${esc(v.meaning)}</td><td>${esc(v.kind)}${v.temperature ? `, ${esc(v.temperature)} temperature` : ""}${v.dimensionless ? `, ${esc(v.dimensionless)}` : ""}</td><td>${v.dimTex ? ti(v.dimTex) : '<span class="sev-error">unknown</span>'}</td><td class="num">${esc(v.value ?? "none")}</td><td>${v.pi ? "yes" : "no"}</td></tr>`).join("");
    const eqs = it.equations.map((/** @type {any} */ e) => `<div>${e.tex ? td(e.tex) : `<p class="sev-error">${esc(e.text)}</p>`}<p class="term-dims"><span class="ids">${esc(e.id)}</span> ${esc(e.kind)}${e.domainText ? `, ${esc(e.domainText)}` : ""}.${e.terms.length ? `</p><ul class="term-dims">${e.terms.map((/** @type {any} */ t) => `<li>${ti(t.tex)}: ${t.dimTex ? ti(t.dimTex) : "unknown dimension"}</li>`).join("")}</ul>` : "</p>"}</div>`).join("");
    const conds = it.conditions.map((/** @type {any} */ c) => `<li>${c.tex ? ti(c.tex) : esc(c.text)} at ${c.atTex ? ti(c.atTex) : esc(c.at)} <span class="ids">${esc(c.id)}, ${esc(c.kind)}</span></li>`).join("");
    const counts = (it.model.conditionCount ?? []).map((/** @type {any} */ c) => `${esc(c.field)} needs ${c.needed} ${esc(c.kind)} condition${c.needed === 1 ? "" : "s"} in ${esc(c.coordinate)} and has ${c.given}`).join(", ");
    $("interpretation").innerHTML = [
      `<p><strong>Question.</strong> ${esc(it.purpose.question)}</p>`,
      `<p><strong>Quantity of interest:</strong> ${obs ? `${ti(obs.tex)}, ${esc(obs.meaning)}` : "none"}. <strong>Intended calculation:</strong> ${esc(calc?.name ?? "")}.</p>`,
      `<div class="scroll"><table class="data"><caption class="visually-hidden">Interpreted variables</caption><thead><tr><th scope="col">Symbol</th><th scope="col">Meaning</th><th scope="col">Kind</th><th scope="col">Dimension</th><th scope="col">Value in SI</th><th scope="col">Pi set</th></tr></thead><tbody>${vrows}</tbody></table></div>`,
      ...it.variables.filter((/** @type {any} */ v) => v.valueNote).map((/** @type {any} */ v) => `<p class="note">${esc(v.valueNote)}</p>`),
      `<h4>Equations</h4>${eqs || '<p class="muted">None. The Finder uses the Pi variables only.</p>'}`,
      `<h4>Conditions</h4>${conds ? `<ul class="plain-list">${conds}</ul>` : '<p class="muted">None.</p>'}`,
      `<p><strong>Geometry:</strong> ${esc(it.geometry.domain || "not stated")}. <strong>Coordinates:</strong> ${esc(it.geometry.coordinates || "not stated")}.</p>`,
      `<p><strong>Model type:</strong> ${esc(it.model.type)}.${counts ? ` <strong>Conditions:</strong> ${counts}.` : ""}</p>`,
    ].join("\n");
  }

  /** @param {any} d */
  function renderIssues(d) {
    const it = d.interp;
    const list = it.issues.map((/** @type {any} */ i) => `<li><span class="sev-${esc(i.severity)}">${esc(SEVERITY[/** @type {"error" | "warning" | "info"} */ (i.severity)])}:</span> ${esc(i.message)}${i.terms ? `<ul class="term-dims">${i.terms.map((/** @type {any} */ t) => `<li><code>${esc(t.text)}</code>: ${esc(t.dim ?? "unknown")}</li>`).join("")}</ul>` : ""}<span class="next">Next: ${esc(i.next)}</span>${i.blocks.length ? `<span class="ids">Blocks: ${esc(i.blocks.join(", "))}</span>` : ""}</li>`).join("");
    const calcs = it.calcs.map((/** @type {any} */ c) => `<tr><td>${esc(c.name)}</td><td>${c.piece}</td><td>${c.ready ? "Runs" : !c.available ? `Arrives in piece ${c.piece}${c.blockedBy.length ? `, and needs: ${esc(c.blockedBy.map((/** @type {string} */ id) => it.issues.find((/** @type {any} */ i) => i.id === id)?.code ?? id).join(", "))}` : ""}` : `Blocked: ${esc(c.blockedBy.map((/** @type {string} */ id) => it.issues.find((/** @type {any} */ i) => i.id === id)?.code ?? id).join(", "))}`}</td></tr>`).join("");
    $("issues").innerHTML = [
      list ? `<ul class="issue-list">${list}</ul>` : `<p>No failed check. A dimensional check does not establish physical validity.</p>`,
      `<h4>What each calculation needs</h4><div class="scroll"><table class="data"><caption class="visually-hidden">Calculations and their state</caption><thead><tr><th scope="col">Calculation</th><th scope="col">Piece</th><th scope="col">State</th></tr></thead><tbody>${calcs}</tbody></table></div>`,
    ].join("\n");
  }

  /** A labelled matrix in TeX: column symbols over the rows. @param {string[][]} M @param {string[]} cols @param {string[]} rows */
  const labelled = (M, cols, rows) => `\\begin{array}{c|${cols.map(() => "r").join("")}}${cols.map((c) => `&${c}`).join("")}\\\\\\hline ${M.map((r, i) => `${rows[i]}&${r.join("&")}`).join("\\\\")}\\end{array}`;

  /** @param {any} d @param {Record<string, any>} state */
  function renderFinder(state, d) {
    const f = d.finder;
    const gate = $("finder-gate"), main = $("finder-main");
    const blocked = f && !f.ready;
    if (d.confirmedVersion === null) {
      gate.innerHTML = `<div class="callout"><p><strong>The Finder runs on a confirmed interpretation.</strong> Read the interpretation of version ${d.version}, then select "Confirm the interpretation".</p><p>The checks before analysis already ran: they do not need the confirmation.</p></div>`;
      main.hidden = true;
      return;
    }
    if (blocked) {
      const why = f.blockedBy.map((/** @type {string} */ id) => d.interp.issues.find((/** @type {any} */ i) => i.id === id)).filter(Boolean);
      gate.innerHTML = `<div class="callout bad"><p><strong>A failed check blocks the Finder.</strong></p>${why.map((/** @type {any} */ i) => `<p>${esc(i.message)} <span class="next">Next: ${esc(i.next)}</span></p>`).join("")}</div>`;
      main.hidden = true;
      return;
    }
    const stale = d.results.filter((/** @type {any} */ r) => !r.valid);
    gate.innerHTML = d.confirmed ? "" : `<div class="callout warn"><p><strong>Version ${d.version} is not confirmed.</strong> The results come from confirmed version ${d.confirmedVersion}.</p><p>${stale.length ? `${stale.length} results read a changed input (${esc([...new Set(stale.flatMap((/** @type {any} */ r) => r.invalidatedBy))].join(", "))}) and show as invalidated. The other results stay valid.` : "No result reads a changed input, so every result stays valid."} Confirm version ${d.version} to run the Finder on it.</p></div>`;
    main.hidden = false;
    const cols = f.vars.map((/** @type {any} */ v) => v.tex);
    const rowNames = f.rows.map((/** @type {any} */ r) => (r.base === "Θ" ? "\\mathsf{\\Theta}" : `\\mathsf{${r.base}}`));
    $("finder-summary").innerHTML = [
      `<p class="summary-line">${f.n} variables, rank ${f.r}: <strong>${f.m} independent group${f.m === 1 ? "" : "s"}</strong>.${f.constraints.items.length ? ` A relation fixes ${f.m - f.constraints.free}, so only ${f.constraints.free} can vary.` : ""}</p>`,
      f.correlation.relation ? td(f.correlation.relation) : "",
      `<p class="note">${chip("evidence")} Buckingham Pi analysis gives the groups of this relation, not the function f. Data or a solved model must supply f (${sourceLink("mit-pi")}). The basis is not unique.</p>`,
      ...d.zeroNote.map((/** @type {string} */ z) => `<div class="callout warn"><p>${esc(z)}</p></div>`),
      f.repeating.override && f.repeating.override.error ? `<div class="callout bad"><p>Your repeating set ${esc(f.repeating.override.ids.join(", "))} is not valid: ${esc(f.repeating.override.error)}. The automatic set stays.</p></div>` : "",
    ].join("\n");
    const groups = d.basisGroups;
    $("finder-groups").innerHTML = `<p class="label">${esc(d.basisName)}</p>` + groups.map((/** @type {any} */ g, /** @type {number} */ i) => `<div class="group-card" data-group="${esc(g.id)}">
      ${td(`\\Pi_{${i + 1}}=${g.tex}`)}
      <p class="note">${esc(g.label)}${g.fixed ? `, fixed by ${esc(g.fixed)}` : ""}${g.meaning ? `. Meaning kept: ${esc(g.meaning)}` : ""}${g.absolute.length ? `. Uses absolute temperatures (${esc(g.absolute.join(", "))}): values in K` : ""}${g.value ? `. Value: ${esc(Model.valueText(g.value))}` : ""}.</p>
      ${g.names.length ? `<ul class="names plain-list">${g.names.map((/** @type {any} */ nm) => {
        const yes = g.confirmed === nm.id;
        return `<li>${chip(yes ? "confirmed" : "proposed")} ${ti(nm.tex)} ${esc(nm.name)}: ${esc(nm.plain)}.${nm.assumes.length ? ` This match assumes that ${esc(nm.assumes.join(" and that "))}.` : ""} <span class="note">${esc(nm.reference)}</span> <button type="button" data-name="${esc(`${g.key}|${nm.id}|${yes ? "0" : "1"}`)}">${yes ? "Withdraw this name" : `Confirm ${esc(nm.label)}`}</button></li>`;
      }).join("")}</ul>` : `<p class="note">No familiar name matches this group.</p>`}
    </div>`).join("");

    // Hand calculation 3: D, the stepper and the kernel.
    $("finder-matrix").innerHTML = `<p>One column for each variable and one row for each base dimension that occurs.</p>${td(`D=${labelled(f.D, cols, rowNames)}`)}`;
    const steps = f.rref.steps;
    const k = d.shownStep;
    const slider = $("step");
    slider.max = String(steps.length);
    slider.value = String(k);
    $("step-value").textContent = `${k} of ${steps.length}`;
    const cur = k ? steps[k - 1] : null;
    const rowLabels = f.rows.map((/** @type {any} */ _, /** @type {number} */ i) => `R_{${i + 1}}`);
    $("step-detail").innerHTML = (cur ? `<p>Step ${k}: ${ti(cur.tex)}. ${esc(cur.reason)}</p>${td(labelled(cur.matrix, cols, rowLabels))}` : `<p>Step 0: the matrix D. Move the slider to apply the row operations one at a time.</p>`)
      + (state.detail === "full" ? `<ol class="step-list">${steps.map((/** @type {any} */ s) => `<li>${ti(s.tex)}: ${esc(s.reason)}${td(s.matrixTex)}</li>`).join("")}</ol>` : "");
    $("finder-kernel").innerHTML = `<p>Reduced row echelon form, with pivots in ${esc(f.rref.pivots.join(", ") || "no column")}:</p>${td(`\\operatorname{rref}(D)=${labelled(f.rref.R, cols, rowLabels)}`)}
      <p>${chip("exact")} The rank is ${f.r}, so ${f.n} − ${f.r} = ${f.m} independent groups exist. The free columns (${esc(f.rref.free.join(", ") || "none")}) give the row-reduced kernel basis: ${f.kernel.map((/** @type {any} */ g) => ti(g.tex)).join(", ") || "none"}.</p>`;

    // Hand calculation 4.
    const rep = f.repeating;
    $("finder-repeating").innerHTML = [
      `<p>The Finder selects ${f.r} variables with independent dimension columns. Another valid set gives an equivalent basis.</p>`,
      `<ul class="plain-list">${rep.reasons.map((/** @type {any} */ r) => `<li>${ti(r.tex)}: ${esc(r.text)}</li>`).join("")}${rep.excluded.map((/** @type {any} */ e) => `<li class="muted">Not used: ${ti(e.tex)}, because ${esc(e.reason)}.</li>`).join("")}${rep.skipped.map((/** @type {any} */ e) => `<li class="muted">Not used: ${ti(e.tex)}, because ${esc(e.reason)}.</li>`).join("")}</ul>`,
      f.r ? td(`D_R=${rep.DRtex},\\qquad \\det D_R=${rep.det}`) : "<p>Rank 0: no repeating variables.</p>",
      f.r ? `<p class="note">${chip("exact")} The determinant is not 0, so the columns are independent. Rows of D_R: ${esc(rep.DRrows.join(", "))}.</p>` : "",
    ].join("\n");
    $("finder-equations").innerHTML = f.exponentEquations.length ? `<p>For each Pi variable ${ti("q")} that is not a repeating variable, ${ti(`\\Pi_q=q\\,${rep.texs.map((/** @type {string} */ t, /** @type {number} */ j) => `${/[-+]/.test(t) ? `\\left(${t}\\right)` : t}^{${rep.letters[j]}}`).join("\\,")}`)}. The table has one equation for each base dimension, in the order ${esc(f.rows.map((/** @type {any} */ r) => r.base).join(", "))}.</p>
      <div class="scroll"><table class="data"><caption class="visually-hidden">Exponent equations</caption><thead><tr><th scope="col">Variable</th><th scope="col">Exponent equations</th><th scope="col">Solution (${esc(rep.letters.join(", "))})</th><th scope="col">Group</th></tr></thead><tbody>
      ${f.exponentEquations.map((/** @type {any} */ q) => `<tr><td>${ti(q.tex)}</td><td>${q.lines.map((/** @type {any} */ l) => ti(l.text)).join("<br>")}</td><td>${ti(`(${q.solutionTex.join(",")})`)}</td><td>${ti(q.group)}</td></tr>`).join("")}</tbody></table></div>` : "<p>No other variables.</p>";

    // Hand calculation 5.
    const ref = d.results.find((/** @type {any} */ r) => r.id === "r-reference");
    $("finder-checks").innerHTML = [
      ...f.groups.map((/** @type {any} */ g) => td(g.cancelTex)),
      `<ul class="plain-list">${f.checks.map((/** @type {any} */ c) => `<li>${chip(c.status)} ${c.passed ? "Passed" : "<strong>Failed</strong>"}: ${esc(c.title)}. <span class="note">${esc(c.detail)}</span></li>`).join("")}</ul>`,
      ref ? `<p>${chip("exact")} ${esc(ref.title)} <span class="note">The script tools/references.py computed it once with SymPy ${esc(d.reference.versions.sympy)}.</span></p>` : `<p class="note">No SymPy reference covers this edited variable set. The exact checks above still apply.</p>`,
    ].join("\n");

    // Equivalent bases and constraints.
    const fam = f.familiar;
    $("finder-bases").innerHTML = [
      fam && !fam.named ? `<p>No group has a familiar name, so the familiar basis is the repeating-variable basis.</p>` : fam ? `<p>${chip("exact")} The familiar basis ${esc(fam.groups.map(Model.groupLabel).join(", "))} is a product of powers of the repeating-variable basis. The columns of T give the exponents:</p>${td(`T=${fam.Ttex},\\qquad \\det T=${fam.det}`)}<ul class="plain-list">${fam.relations.map((/** @type {any} */ r) => `<li>${ti(`${r.group}=${r.combo || "1"}`)}</li>`).join("")}</ul>` : "<p>No familiar basis is complete for this variable set.</p>",
      f.constraints.items.length ? `<p><strong>Relations between Pi variables.</strong> The ${f.constraints.algebraic} groups are algebraically independent, but only ${f.constraints.free} of them can vary:</p><ul class="plain-list">${f.constraints.items.map((/** @type {any} */ c) => `<li>${esc(c.id)}: ${c.tex ? ti(c.tex) : `<code>${esc(c.text)}</code>`}${c.monomial ? ` fixes ${ti(`${c.group}=${c.value}`)}` : ", not a power law, so it counts as one relation"}.</li>`).join("")}</ul>` : "<p>The model states no relation between the Pi variables.</p>",
    ].join("\n");
    $("finder-needs").innerHTML = `<p>Before a physical correlation, supply these items:</p><ul class="plain-list">
      <li>data or a solved model for the function f over the range of each group</li>
      <li>the geometry and the definition of each reference length${d.interp.geometry.domain ? ` (now: ${esc(d.interp.geometry.domain)})` : ""}</li>
      <li>the statement that the quantity of interest is a local or a mean value</li>
      <li>the type of boundary condition, such as wall temperature or wall heat flux${d.interp.conditions.length ? "" : " (the model has no conditions)"}</li>
      <li>the reference temperature of the properties, and all further physics that adds variables</li></ul>
      <p class="note">${chip("evidence")} The groups do not specify a universal relation. Geometry, conditions and more physics can add inputs (${sourceLink("spec-5")}).</p>`;
  }


  /** The Model Nondimensionalizer: scales, variables, derivatives, every equation and condition, the parameters,
   * the Pi basis, the parameters that enter, and the checks. @param {Record<string, any>} state @param {any} d */
  function renderNondim(state, d) {
    const nd = d.nondim;
    const gate = $("nondim-gate"), main = $("nondim-main");
    if (d.confirmedVersion === null) {
      gate.innerHTML = `<div class="callout"><p><strong>The Nondimensionalizer runs on a confirmed interpretation.</strong> Read the interpretation of version ${d.version}. Then select "Confirm the interpretation".</p><p>The checks before analysis already ran: they do not need the confirmation.</p></div>`;
      main.hidden = true;
      return;
    }
    if (!nd || !nd.ready) {
      const why = nd && nd.reason === "blocked" ? nd.blockedBy.map((/** @type {string} */ id) => d.interp.issues.find((/** @type {any} */ i) => i.id === id)).filter(Boolean) : [];
      gate.innerHTML = why.length
        ? `<div class="callout bad"><p><strong>A failed check blocks the Nondimensionalizer.</strong></p>${why.map((/** @type {any} */ i) => `<p>${esc(i.message)} <span class="next">Next: ${esc(i.next)}</span></p>`).join("")}</div>`
        : `<div class="callout ${nd && nd.reason === "no-equations" ? "" : "bad"}"><p><strong>${nd && nd.reason === "no-equations" ? "This model has no equation to nondimensionalize." : "The Nondimensionalizer cannot run on this model."}</strong> ${esc(nd?.message ?? "")}</p><p class="next">Next: ${esc(nd?.next ?? "")}</p></div>`;
      main.hidden = true;
      return;
    }
    const stale = d.results.filter((/** @type {any} */ r) => !r.valid && r.id.startsWith("r-nd-"));
    gate.innerHTML = d.confirmed ? "" : `<div class="callout warn"><p><strong>Version ${d.version} is not confirmed.</strong> The dimensionless model comes from confirmed version ${d.confirmedVersion}.</p><p>${stale.length ? `${stale.length} of its results read a changed input (${esc([...new Set(stale.flatMap((/** @type {any} */ r) => r.invalidatedBy))].join(", "))}) and show as invalidated.` : "No result of the Nondimensionalizer reads a changed input."}</p><p><button type="button" class="primary" data-confirm>Confirm version ${d.version}</button></p></div>`;
    main.hidden = false;
    const params = nd.parameters.filter((/** @type {any} */ p) => p.role === "parameter" && p.independent);
    const named = nd.parameters.filter((/** @type {any} */ p) => p.role !== "output" && p.names.length && !/^\\frac|[+-]/.test(p.names[0].tex));
    const eqLine = (/** @type {any} */ e) => `<li>${td(`${e.namedTex}${e.at ? `\\quad\\text{at }${e.at.tex}` : e.domainTex ? `,\\quad ${e.domainTex}` : ""}`)}<span class="ids">${esc(e.id)}${e.output ? `, defines ${esc(e.output)}` : ""}</span></li>`;
    $("nondim-summary").innerHTML = [
      `<p class="summary-line">${nd.variables.length} dimensionless variable${nd.variables.length === 1 ? "" : "s"}, <strong>${params.length} independent parameter${params.length === 1 ? "" : "s"}</strong>${params.length ? `: ${params.map((/** @type {any} */ p) => esc(p.names[0] ? p.names[0].label : p.label)).join(", ")}` : ""}.</p>`,
      `<ul class="model-list">${nd.equations.filter((/** @type {any} */ e) => !e.cond && !e.output).map(eqLine).join("")}${nd.equations.filter((/** @type {any} */ e) => e.cond).map(eqLine).join("")}${nd.equations.filter((/** @type {any} */ e) => e.output).map(eqLine).join("")}</ul>`,
      named.length ? `<p class="note">${chip("proposed")} The page proposes these names: ${named.map((/** @type {any} */ p) => `${ti(`${p.names[0].tex}=${p.tex}`)}`).join(", ")}. Confirm a name in the parameters below.</p>` : "",
      ...nd.scales.filter((/** @type {any} */ s) => s.changed).map((/** @type {any} */ s) => `<div class="callout warn"><p>${chip("unresolved")} ${esc(s.changed)}</p></div>`),
    ].join("\n");

    // Hand calculation 6: the scales with their mechanisms and the competing scales.
    $("nondim-scales").innerHTML = `<p>Each scale comes from your entry, the domain or the geometry, a prescribed value, or a balance of two terms. A scale must not be 0. "Use this scale" writes your choice into the model as a new version.</p>` + nd.scales.map((/** @type {any} */ s) => {
      const others = s.candidates.filter((/** @type {any} */ c) => !c.chosen);
      return `<div class="group-card scale-card" data-scale-var="${esc(s.id)}">
        <p><strong>${ti(s.tex)}</strong> (${esc(s.kind)}${s.time ? ", time" : ""}): ${chip(s.status)} scale ${ti(s.chosen.tex)}${s.chosen.value ? ` <span class="note">(${esc(s.chosen.value)} in SI units)</span>` : ""}${s.offsetPlain !== "0" ? `, offset ${ti(s.offsetTex)}` : ""}</p>
        <p class="note">${esc(s.chosen.reason)}${s.chosen.also.length ? ` Also: ${esc(s.chosen.also.join(" "))}` : ""}${s.offsetPlain !== "0" ? ` Offset: ${esc(s.offsetWhy)}.` : ""}</p>
        ${s.status === "confirmed" ? `<p class="note">You supplied this scale. <button type="button" data-unscale="${esc(s.id)}">Use the suggested scale</button></p>` : ""}
        ${others.length ? `<p class="label">Other candidates</p><ul class="plain-list">${others.map((/** @type {any} */ c) => `<li>${ti(c.tex ?? "?")}${c.valid ? "" : ` ${chip("unresolved")} <span class="sev-error">Refused:</span> ${esc(c.signWhy || c.error || (c.dimOk ? "" : `its dimension ${c.dim ?? "?"} is not that of ${s.label}`))}.`} <span class="note">${esc(c.reason)}</span>${c.ratio ? ` <span class="note">Ratio of the chosen scale to this one: ${ti(c.ratio.tex)}${c.ratio.names.length ? ` = ${c.ratio.names.map((/** @type {any} */ n) => ti(n.tex)).join(", ")}, ${esc(c.ratio.names.map((/** @type {any} */ n) => n.name).join(", "))} (a proposed name)` : ""}.</span>` : ""}${c.valid && c.record ? ` <button type="button" data-use-scale="${esc(`${s.id}|${c.n}`)}">Use this scale</button>` : ""}</li>`).join("")}</ul>` : `<p class="note">No other candidate: no other mechanism or prescribed value gives a scale for ${esc(s.label)}.</p>`}
      </div>`;
    }).join("");
    $("nondim-variables").innerHTML = `<h4>Dimensionless variables and their inverses</h4><ul class="plain-list">${nd.variables.map((/** @type {any} */ v) => `<li>${ti(v.defTex)} and ${ti(v.invTex)} ${chip(v.inverseOk ? "exact" : "unresolved")} <span class="note">${v.inverseOk ? "Each map is the inverse of the other." : "The maps do not compose to the identity."}</span></li>`).join("")}</ul>`;
    $("nondim-derivatives").innerHTML = nd.derivatives.length ? `<h4>Derivative transformations</h4><ul class="model-list">${nd.derivatives.map((/** @type {any} */ x) => `<li>${td(x.tex)}<span class="note">${esc(x.reason)}</span></li>`).join("")}</ul>` : "";

    // Hand calculation 7: every equation and condition, step by step.
    $("nondim-equations").innerHTML = nd.equations.map((/** @type {any} */ e) => `<div class="group-card eq-card" data-eq="${esc(e.id)}">
      <p><strong>${esc(e.id)}</strong> <span class="ids">${esc(e.kind)}${e.output ? `, defines ${esc(e.output)}` : ""}</span></p>
      ${td(e.originalTex)}${e.domainText ? `<p class="note">Holds ${esc(/^at /.test(e.domainText) ? e.domainText : `for ${e.domainText}`)}.</p>` : ""}
      <p class="label">Substitute</p>${td(e.substitutedTex)}
      <p class="label">Simplify</p>${td(e.simplifiedTex)}
      <p class="label">Divide by the common factor</p><p class="note">The factor is the coefficient of the term for ${esc(e.reference || "the first term")}: ${ti(e.factorTex)}.</p>
      ${td(`${e.dimensionlessTex}${e.at ? `\\quad\\text{at }${e.at.tex}` : e.domainTex ? `,\\quad ${e.domainTex}` : ""}`)}
      <p class="note">${chip(e.dimensionless ? "exact" : "unresolved")} ${e.dimensionless ? "Every coefficient is dimensionless." : "A coefficient is not dimensionless."} ${chip(e.reverseOk ? "exact" : "unresolved")} ${e.reverseOk ? "The reverse substitution gives back the dimensional form." : "The reverse substitution does not give back the dimensional form."}</p>
    </div>`).join("");

    // Parameters, fields, coordinates and prescribed data.
    const roleName = { parameter: "Parameter", geometry: "Geometry ratio", output: "Output" };
    $("nondim-parameters").innerHTML = [
      `<div class="scroll"><table class="data"><caption class="visually-hidden">Dimensionless groups of the model</caption><thead><tr><th scope="col">Kind</th><th scope="col">Group</th><th scope="col">Name</th><th scope="col">Value</th><th scope="col">In</th></tr></thead><tbody>${nd.parameters.map((/** @type {any} */ p) => `<tr><td>${esc(roleName[/** @type {"parameter"} */ (p.role)])}${p.dependent ? `, dependent: ${esc(p.dependent)}` : ""}</td><td>${ti(p.tex)}</td><td>${p.names.map((/** @type {any} */ nm) => { const yes = p.confirmed === nm.id; return `${chip(yes ? "confirmed" : "proposed")} ${ti(nm.tex)} ${esc(nm.name)} <button type="button" data-name="${esc(`${p.key}|${nm.id}|${yes ? "0" : "1"}`)}">${yes ? "Withdraw" : `Confirm ${esc(nm.label)}`}</button>`; }).join("<br>") || '<span class="muted">none</span>'}</td><td class="num">${p.value ? esc(Model.valueText(p.value)) : '<span class="muted">no values</span>'}</td><td>${esc(p.where.join(", "))}</td></tr>`).join("")}</tbody></table></div>`,
      `<p><strong>Solution fields:</strong> ${nd.fields.map((/** @type {any} */ f) => `${ti(`${f.tex}\\left(${f.of.join(",")}\\right)`)}`).join(", ") || "none"}. <strong>Coordinates:</strong> ${nd.coordinates.map((/** @type {any} */ c) => ti(c.tex)).join(", ") || "none"}. The parameters are constants of the model. The fields and the coordinates are not parameters.</p>`,
      `<p><strong>Prescribed data:</strong> ${nd.prescribed.length ? `${nd.prescribed.map((/** @type {any} */ x) => `${ti(x.tex)} in ${esc(x.id)}${x.at ? ` at ${ti(x.at)}` : ""}`).join(", ")}.` : "none. Every condition is homogeneous."}</p>`,
      nd.definitions.length ? `<p><strong>Definitions used:</strong> ${nd.definitions.map((/** @type {any} */ x) => `${ti(x.tex)} (${x.id ? esc(x.id) : "added by the tool"}, ${x.kind === "expand" ? "expanded" : `solved for ${esc(x.eliminated)}`})`).join(", ")}.</p>` : "",
    ].join("\n");

    // The Pi basis of the Finder.
    const pi = nd.pi;
    $("nondim-pi").innerHTML = !pi ? `<p class="note">The Finder did not run on this version, so the comparison is not available.</p>` : [
      `<p>The Finder found ${pi.m} independent groups. The dimensionless model uses ${pi.rank} of them.</p>`,
      `<ul class="plain-list">${pi.rows.map((/** @type {any} */ r) => `<li>${ti(r.tex)} (${esc(r.what)}): ${r.inPi ? `${chip("exact")} ${ti(`=${r.comboTex}`)} in the ${esc(pi.basis)} basis` : `${chip("unresolved")} ${esc(r.note ?? "")}`}</li>`).join("")}</ul>`,
      pi.absent.length ? `<p><strong>Pi groups that the model does not use:</strong></p><ul class="plain-list">${pi.absent.map((/** @type {any} */ a) => `<li>${ti(a.tex)}: ${esc(a.why)}</li>`).join("")}</ul><p class="note">${esc(pi.absentWhy)}</p>` : `<p>The model uses every Pi group.</p>`,
    ].join("\n");

    $("nondim-enters").innerHTML = `<p>A scale must not hide a physical parameter. Each parameter below enters a scale, an offset, a coefficient or a condition.</p><ul class="plain-list">${nd.enters.map((/** @type {any} */ e) => `<li>${e.hidden ? `${chip("unresolved")} ` : ""}<strong>${esc(e.label)}</strong>: ${e.hidden ? "does not enter the dimensionless model." : esc(e.where.join(", "))}${e.onlyScales ? ` <span class="note">Only through the scales or offsets: it changes the conversion to dimensional values, not the dimensionless solution.</span>` : ""}</li>`).join("")}</ul>`;
    const ref = d.results.find((/** @type {any} */ r) => r.id === "r-nd-reference");
    $("nondim-checks").innerHTML = `<ul class="plain-list">${nd.checks.map((/** @type {any} */ c) => `<li>${chip(c.status)} ${c.passed ? "Passed" : "<strong>Failed</strong>"}: ${esc(c.title)}. <span class="note">${esc(c.detail)}</span></li>`).join("")}</ul>${ref ? `<p>${chip(ref.status)} ${esc(ref.title)} <span class="note">The script tools/references.py computed it once.</span></p>` : `<p class="note">No SymPy reference covers this model version. The exact checks above still apply.</p>`}`;
  }

  /** @param {any} d @param {Record<string, any>} state */
  function renderTrace(d, state) {
    const f = d.finder;
    const legend = Object.keys(R.STATUS).map((k) => `<li>${chip(k)} <span>${d.counts[k]}</span></li>`).join("");
    const results = d.results.map((/** @type {any} */ r) => `<li class="${r.valid ? "" : "stale"}">${chip(r.status)} <span class="title">${esc(r.title)}</span>${r.tex ? ` ${ti(r.tex)}` : ""}${r.next ? `<span class="next">Next: ${esc(r.next)}</span>` : ""}${r.valid ? "" : `<span class="next">Invalidated by the change of ${esc(r.invalidatedBy.join(", "))}.</span>`}
      <span class="ids">${esc(r.id)}${r.inputs.length && (state.detail === "full" || !r.valid) ? `; inputs ${esc(r.inputs.join(", "))}` : r.inputs.length ? `; ${r.inputs.length} inputs` : ""}${r.steps.length ? `; steps ${esc(r.steps.join(", "))}` : ""}${r.evidence.length ? `; evidence ${esc(r.evidence.join(", "))}` : ""}</span></li>`).join("");
    const allSteps = [...(f && f.ready ? f.steps : []), ...(d.nondim && d.nondim.ready ? d.nondim.steps : [])];
    const steps = allSteps.length ? allSteps.map((/** @type {any} */ s) => `<li><strong>${esc(s.title)}</strong> <span class="ids">${esc(s.id)}, hand calculation ${s.item}</span><br>${esc(s.reason)}${s.evidence.length ? ` Evidence: ${s.evidence.map(sourceLink).join(", ")}.` : ""}${s.assumptions?.length ? ` Assumptions: ${esc(s.assumptions.join(", "))}.` : ""}</li>`).join("") : "";
    const used = new Set([...d.results.flatMap((/** @type {any} */ r) => r.evidence), ...allSteps.flatMap((/** @type {any} */ s) => s.evidence), ...d.interp.assumptions.map((/** @type {any} */ a) => a.source)]);
    const sources = DATA.sources.sources.filter((/** @type {any} */ s) => used.has(s.id)).map((/** @type {any} */ s) => `<li>${sourceLink(s.id)} <span class="ids">${esc(s.id)}, read ${esc(s.read)}</span><br><span class="note">${esc(s.supports)}</span></li>`).join("");
    const hist = d.history.slice().reverse().slice(0, 30).map((/** @type {any} */ h) => `<li>Version ${h.version}: ${esc(h.change)}${h.changed.length ? ` <span class="ids">${esc(h.changed.join(", "))}</span>` : ""}</li>`).join("");
    const diff = d.previousDiff;
    $("trace").innerHTML = [
      `<h3>Result statuses</h3><ul class="legend">${legend}</ul>`,
      `<p class="note">A dimensional check does not establish physical validity. A numerical check does not establish a mathematical proof.</p>`,
      `<h3>Results</h3><ul class="result-list">${results}</ul>`,
      steps ? `<h3>Derivation steps</h3><ol class="step-list">${steps}</ol>` : "",
      `<h3>Evidence</h3><ul class="plain-list">${sources || "<li>No source.</li>"}</ul>`,
      `<h3>History</h3>${diff ? `<p>Changes from version ${d.previousVersion}: ${diff.all.length ? esc([diff.added.length ? `added ${diff.added.join(", ")}` : "", diff.removed.length ? `removed ${diff.removed.join(", ")}` : "", diff.changed.length ? `changed ${diff.changed.join(", ")}` : ""].filter(Boolean).join(". ")) : "none"}.</p>` : ""}<ul class="plain-list">${hist}</ul>`,
      `<p class="note">Calculation settings: ${esc(d.settings.arithmetic)}. Tolerance: ${esc(d.settings.tolerance)}.</p>`,
    ].join("\n");
  }


  let lastDetail = "";
  /** @param {Record<string, any>} state @param {any} d */
  /** The import of numerical results: shown for an example that accepts them (data/convective.json, imports). @param {any} rec */
  function renderImports(rec) {
    const spec = DATA.convective?.imports?.[rec.origin];
    $("imports").hidden = !spec;
    if (!spec) return;
    const n = (rec.evidence ?? []).filter((/** @type {any} */ e) => e.kind === "numerical-results").length;
    $("imports-note").textContent = `${spec.describe} The file must state its provenance (${SM.EM.PROVENANCE.join(", ")}) and define ${Object.entries(spec.definitions).map(([k, v]) => `${k} as "${v}"`).join(" and ")}. ${n ? `The record holds ${n} imported file${n > 1 ? "s" : ""}.` : "The record holds no imported file."}`;
  }
  /** Add checked numerical results to the record's evidence, as a new version. @param {any} doc @param {string} name */
  function importResults(doc, name) {
    const rec = active(app.state.example);
    const spec = DATA.convective?.imports?.[rec.origin];
    const v = SM.EM.validateImport(doc, spec);
    if (!v.ok) { tellModel(`${name} was not loaded, and the record stays as it is: ${v.errors.slice(0, 3).join(" ")}`); return; }
    commit((/** @type {any} */ inp) => {
      let k = 1;
      while (inp.evidence.some((/** @type {any} */ e) => e.id === `ev-import-${k}`)) k++;
      inp.evidence.push({ id: `ev-import-${k}`, kind: "numerical-results", source: "import", claim: `Imported numerical results: ${v.doc.provenance.source}; ${v.doc.provenance.method}.`, results: v.doc });
    }, `Imported ${v.doc.points.length} numerical results from ${name}. Confirm the interpretation to compare them.`);
  }

  function render(state, d) {
    renderEditor(active(state.example));
    renderImports(active(state.example));
    renderStatus(d);
    renderInterpretation(d);
    renderIssues(d);
    for (const t of ["finder", "nondim", "regime", "catalogue"]) {
      $(`tab-${t}`).setAttribute("aria-selected", String(state.tool === t));
      $(`tool-${t}`).hidden = state.tool !== t;
    }
    if (state.tool === "finder") renderFinder(state, d);
    else if (state.tool === "nondim") renderNondim(state, d);
    else if (state.tool === "regime") { RegimeView.render(state, d); StabView.render(state, d); }
    else RegimeView.catalogue(state, d);
    renderTrace(d, state);
    if (state.detail !== lastDetail) {
      for (const el of document.querySelectorAll("details[data-section]")) /** @type {HTMLDetailsElement} */ (el).open = state.detail === "full";
      lastDetail = state.detail;
    }
    if (document.activeElement !== $("repeating")) $("repeating").value = state.repeating;
  }

  /* ---------- the model JSON ---------- */

  /** @param {string} name @param {string} body */
  function download(name, body) {
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  /** The model record with its analyses and derivation, as the page shows them. */
  function modelJson() {
    const rec = active(app.state.example);
    const d = app.derived;
    const doc = { ...R.clone(rec), analyses: d.results, derivation: d.finder && d.finder.ready ? { steps: d.finder.steps, rowReduction: d.finder.rref.steps.map((/** @type {any} */ s) => ({ n: s.n, op: s.op, text: s.text, reason: s.reason, matrix: s.matrix })),
      exponentEquations: d.finder.exponentEquations, groups: d.finder.groups.map((/** @type {any} */ g) => ({ id: g.id, label: g.label, exponents: g.exps, names: g.names.map((/** @type {any} */ n) => n.id), confirmed: g.confirmed })), checks: d.finder.checks } : null,
      nondimensionalization: nondimSummary(d.nondim),
      regimeMap: d.regime && d.regime.ready ? { declaration: d.regime.declaration.id, match: d.regime.match, axes: d.regime.axes, tolerance: d.regime.tolerance, fixed: d.regime.fixed,
        layers: d.regime.layers.map((/** @type {any} */ l) => ({ id: l.id, kind: l.kind, boundary: l.boundary, criterion: l.criterion, status: l.status, curves: l.curves.map((/** @type {any} */ c) => ({ id: c.id, label: c.label, points: c.points })) })),
        unresolved: { points: d.regime.unresolved.count, reasons: d.regime.unresolved.reasons }, point: d.regime.point, acceptance: d.regime.acceptance } : null,
      stability: d.stability && d.stability.ready ? d.stability : null,
      items: R.ITEMS };
    return `${JSON.stringify(doc, null, 2)}\n`;
  }

  /* ---------- WebMCP tools and commands ---------- */

  /** @param {unknown} value */
  const out = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
  const RO = { readOnlyHint: true };
  /** @type {KitTool[]} */
  const tools = [
    { name: "get_model", description: "Return the current model record (purpose, variables, equations, geometry, conditions, assumptions, scales, evidence and history), its version, whether the researcher confirmed it, and the checks before analysis with their next actions.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: RO,
      execute: async () => {
        const d = app.derived;
        return out({ record: JSON.parse(modelJson()), version: d.version, confirmed: d.confirmed, confirmedVersion: d.confirmedVersion, issues: d.interp.issues, calculations: d.interp.calcs });
      } },
    { name: "find_groups", description: "Run the Dimensionless Number Finder. With no input it returns the groups of the current confirmed record. With a variable list (symbol and dimension such as \"M L^-1 T^-1\", or symbol and unit) and a quantity of interest, it runs on that list without changing the page.",
      inputSchema: { type: "object", properties: {
        variables: { type: "array", items: { type: "object", properties: { symbol: { type: "string" }, dimension: { type: "string" }, unit: { type: "string" }, quantity: { type: "string" } }, required: ["symbol"] } },
        quantity_of_interest: { type: "string" }, repeating: { type: "array", items: { type: "string" } } }, additionalProperties: false }, annotations: RO,
      execute: async (/** @type {any} */ input = {}) => {
        if (!Array.isArray(input.variables)) {
          const f = app.derived.finder;
          if (!f || !f.ready) return out({ error: "The current model has no Finder result. Confirm its interpretation, or pass a variable list." });
          return out(summary(f));
        }
        const vars = input.variables.slice(0, 40).map((/** @type {any} */ v, /** @type {number} */ i) => R.variable({ id: `v${i + 1}`, symbol: String(v.symbol ?? ""), dimension: String(v.dimension ?? ""), unit: String(v.unit ?? ""), quantity: String(v.quantity ?? ""), kind: "parameter", domain: "positive", pi: true }));
        const qoi = vars.find((/** @type {any} */ v) => v.symbol === input.quantity_of_interest);
        const rec = { title: "Variable list from find_groups", purpose: { question: "", observable: qoi ? qoi.id : "", calculation: "pi-groups" }, variables: vars, equations: [], geometry: {}, conditions: [], assumptions: [], scales: [], preferred: [], evidence: [] };
        const it = C.interpret(rec, ENGINE);
        if (!qoi) return out({ error: "Name the quantity of interest: one of the symbols in the list.", issues: it.issues });
        const f = F.find(it, { repeating: Array.isArray(input.repeating) ? Model.repeatingIds(input.repeating.join(","), it.variables) : null, preferred: [], groups: ENGINE.groups.groups, confirmed: {} });
        if (!f.ready) return out({ error: "A failed check blocks the Finder.", issues: it.issues.filter((/** @type {any} */ i) => f.blockedBy.includes(i.id)) });
        return out(summary(f));
      } },
    { name: "nondimensionalize", description: "Return the Model Nondimensionalizer's result for the current confirmed record: each scale with its mechanism, its competing scales and refusals, the dimensionless variables and their inverses, the derivative transformations, every equation and condition in dimensionless form with its common factor, the parameters with their names, the comparison with the Pi basis, where each physical parameter enters, and the exact checks.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: RO,
      execute: async () => {
        const d = app.derived;
        if (!d.nondim || !d.nondim.ready) return out({ error: d.confirmedVersion === null ? "Confirm the interpretation first: the Nondimensionalizer runs on a confirmed version." : d.nondim?.message ?? "A failed check blocks the Nondimensionalizer.", next: d.nondim?.next ?? null, version: d.version });
        return out({ version: d.version, confirmed: d.confirmed, ...nondimSummary(d.nondim) });
      } },
    { name: "get_derivation", description: "Return the derivation record of the current Finder result: the steps with their reasons and evidence, every row operation with its matrix, the exponent equations, the checks, and each result with its status, inputs and validity.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: RO,
      execute: async () => {
        const d = app.derived;
        const f = d.finder;
        return out({ version: d.version, confirmed: d.confirmed, results: d.results, statuses: R.STATUS,
          finder: f && f.ready ? { steps: f.steps, rowReduction: f.rref.steps.map((/** @type {any} */ s) => ({ n: s.n, text: s.text, reason: s.reason, matrix: s.matrix })), repeating: f.repeating, exponentEquations: f.exponentEquations, checks: f.checks } : null });
      } },
    { name: "get_regime_map", description: "Return the Regime Map Builder's map of the current confirmed record: its declared model and the exact match of the dimensionless equations, the axes and scales, the fixed and derived parameters, each layer (approximation error or balance) with its criterion, boundary curves and regions, the unresolved points with their reasons, the points where no approximation meets the tolerance, the intersections, the limit paths and the inspected point. Optional inputs choose another slice without changing the page.",
      inputSchema: { type: "object", properties: { x: { type: "string" }, y: { type: "string", description: "a parameter id, or none for a 1D diagram" }, fixed: { type: "string", description: "such as Bi=0.5, Fo=0.25" },
        tolerance: { type: "string", enum: ["1e-1", "1e-2", "1e-3"] } }, additionalProperties: false }, annotations: RO,
      execute: async (/** @type {any} */ input = {}) => {
        const rg = regimeFor({ map_x: input.x, map_y: input.y, fixed: input.fixed, tolerance: input.tolerance });
        if (!rg || !rg.ready) return out(regimeError(rg));
        return out({ declaration: rg.declaration, match: rg.match, axes: rg.axes, fixed: rg.fixed, derived: rg.derived, tolerance: rg.tolerance,
          layers: rg.layers.map((/** @type {any} */ l) => ({ id: l.id, kind: l.kind, boundary: l.boundary, title: l.title, criterion: l.criterion, status: R.STATUS[l.status],
            curves: l.curves.map((/** @type {any} */ c) => ({ id: c.id, label: c.label, points: c.points })), regions: l.regions.map((/** @type {any} */ r) => ({ label: r.label, points: r.count, intervals: r.intervals ?? null })) })),
          unresolved: { points: rg.unresolved.count, reasons: rg.unresolved.reasons, intervals: rg.unresolved.intervals ?? null }, noApproximation: { points: rg.gap.count, intervals: rg.gap.intervals ?? null },
          intersections: rg.intersections, limits: rg.limits, point: rg.point, acceptance: rg.acceptance, notices: rg.notices });
      } },
    { name: "get_regime_point", description: "Inspect one point of the current record's declared model: the value and region of each layer there, the reduced models that meet the tolerance, the profile, the checks (such as the energy balance) and the dimensional reconstruction of the parameters with the record's other values. Give the parameters by id, such as {\"Bi\": 0.5, \"Fo\": 0.25}; the others keep the record's values.",
      inputSchema: { type: "object", properties: { parameters: { type: "object", additionalProperties: { type: "number" } }, tolerance: { type: "string", enum: ["1e-1", "1e-2", "1e-3"] } }, required: ["parameters"], additionalProperties: false }, annotations: RO,
      execute: async (/** @type {any} */ input = {}) => {
        const first = regimeFor({});
        if (!first || !first.ready) return out(regimeError(first));
        const ps = input.parameters && typeof input.parameters === "object" ? input.parameters : {};
        const ids = first.params.map((/** @type {any} */ p) => p.id).filter((/** @type {string} */ id) => typeof ps[id] === "number");
        if (!ids.length) return out({ error: `Give at least one parameter of ${first.params.map((/** @type {any} */ p) => p.id).join(", ")}.` });
        const [x, y] = [ids[0], ids[1] ?? "none"];
        const fixed = Object.entries(ps).filter(([k]) => k !== x && k !== y).map(([k, v]) => `${k}=${v}`).join(",");
        const rg = regimeFor({ map_x: x, map_y: y, fixed, tolerance: input.tolerance, point: y === "none" ? String(ps[x]) : `${ps[x]},${ps[y]}` });
        if (!rg || !rg.ready) return out(regimeError(rg));
        return out({ declaration: rg.declaration.id, tolerance: rg.tolerance, point: rg.point, notices: rg.notices });
      } },
    { name: "get_catalogue", description: "Return the declared model catalogue: every family of the build plan with the piece that brings it, and one declaration (the given id, else the current record's) with its six parts of section 10, the methods table and the acceptance result on its standard example.",
      inputSchema: { type: "object", properties: { declaration: { type: "string" } }, additionalProperties: false }, annotations: RO,
      execute: async (/** @type {any} */ input = {}) => {
        const st = { ...app.state, tool: "catalogue", family: typeof input.declaration === "string" ? input.declaration.slice(0, 60) : app.state.family };
        const d = Model.derive(st, DATA, active(st.example));
        return out(d.catalogue);
      } },
    { name: "get_stability", description: "Return the stability and bifurcation analysis of the current confirmed record (hand calculation 9): for a declared model of piece 4, the exact base-state, perturbation and symmetry checks, the growth rates and modes, the neutral curve, the branch with its comparison data, the amplitude equation and the classification; for a structures model that declares them, its stability results (the Euler column, the elastica, the oscillator and the beam modes); for a custom ODE system, the equilibria with their eigenvalues, the branches with their folds, branch points and Hopf points, the regions of multiple stable states and the search coverage. Each result has its status and tolerance.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: RO,
      execute: async () => {
        const d = app.derived;
        if (!d.stability) return out({ error: "The current record has no confirmed version. Confirm its interpretation first." });
        return out({ version: d.version, confirmed: d.confirmed, stability: d.stability, results: d.results.filter((/** @type {any} */ r) => r.id.startsWith("r-st-")), statuses: R.STATUS });
      } },
  ];
  /** The regime map of the current record with some view fields changed, without changing the page. @param {Record<string, any>} patch */
  function regimeFor(patch) {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v === "string"));
    const st = VisualKit.normalize(Model.FIELDS, { ...app.state, ...clean, pick: "" }).state;
    return Model.derive(st, DATA, active(st.example)).regime;
  }
  /** @param {any} rg */
  function regimeError(rg) {
    return { error: !rg ? "Confirm the interpretation first: the Regime Map Builder runs on a confirmed version." : rg.message, problems: rg?.problems ?? [], next: rg?.next ?? "" };
  }
  /** The Nondimensionalizer's result as the model JSON and an agent read it. @param {any} nd */
  function nondimSummary(nd) {
    if (!nd || !nd.ready) return null;
    return {
      scales: nd.scales.map((/** @type {any} */ s) => ({ variable: s.name, dimensionless: s.hat, scale: s.chosen.plain, offset: s.offsetPlain, status: s.status, reason: s.chosen.reason, changed: s.changed,
        candidates: s.candidates.map((/** @type {any} */ c) => ({ scale: c.plain, source: c.source, valid: c.valid, refused: c.valid ? null : c.signWhy || c.error, reason: c.reason, ratio: c.ratio ? c.ratio.label : null })) })),
      variables: nd.variables.map((/** @type {any} */ v) => ({ definition: v.defTex, inverse: v.invTex, inverseChecked: v.inverseOk })),
      derivatives: nd.derivatives,
      equations: nd.equations.map((/** @type {any} */ e) => ({ id: e.id, kind: e.kind, dimensionless: e.dimensionlessPlain, tex: e.dimensionlessTex, named: e.namedTex, factor: e.factorTex, at: e.at ? e.at.tex : null, holds: e.domainTex, coefficientsDimensionless: e.dimensionless, reverseSubstitution: e.reverseOk })),
      parameters: nd.parameters.map((/** @type {any} */ p) => ({ role: p.role, group: p.label, names: p.names.map((/** @type {any} */ n) => n.label), confirmed: p.confirmed, dependent: p.dependent, value: p.value ? Model.valueText(p.value) : null })),
      prescribed: nd.prescribed, pi: nd.pi, enters: nd.enters, checks: nd.checks, steps: nd.steps,
    };
  }
  /** The Finder result as an agent reads it. @param {any} f */
  function summary(f) {
    return { variables: f.n, rank: f.r, groups: f.groups.map((/** @type {any} */ g) => ({ label: g.label, tex: g.tex, exponents: g.exps, names: g.names.map((/** @type {any} */ n) => n.label), status: "Exact dimensional or algebraic check" })),
      repeating: f.repeating.symbols, familiar: f.familiar ? f.familiar.groups.map(Model.groupLabel) : null, relation: f.correlation.relation, constraints: f.constraints, checks: f.checks.map((/** @type {any} */ c) => ({ title: c.title, passed: c.passed })) };
  }

  const commands = [
    { label: "Confirm the interpretation", run: () => $("confirm").click() },
    { label: "Restore the example", run: () => $("restore").click() },
    { label: "Save model JSON", run: () => $("save-model").click() },
    { label: "Show the familiar basis", run: () => app.set({ basis: "familiar" }) },
    { label: "Show the repeating-variable basis", run: () => app.set({ basis: "direct" }) },
    { label: "Show the row-reduced basis", run: () => app.set({ basis: "kernel" }) },
    { label: "Show the full derivation", run: () => app.set({ detail: "full" }) },
    { label: "Use the suggested scales", run: () => commit((/** @type {any} */ inp) => { inp.scales = []; }, "Removed your scales; the suggested scales apply.", true) },
    { label: "Show the short view", run: () => app.set({ detail: "short" }) },
    { label: "Regime map: inspect the record's point", run: () => app.set({ tool: "regime", point: "", pick: "" }) },
    { label: "Regime map: show the 1D diagram", run: () => app.set({ tool: "regime", map_y: "none" }) },
    { label: "Regime map: show the declared 2D slice", run: () => app.set({ tool: "regime", map_x: "", map_y: "" }) },
    ...["1e-1", "1e-2", "1e-3"].map((t) => ({ label: `Regime map: tolerance ${Number(t)}`, run: () => app.set({ tool: "regime", tolerance: t }) })),
    ...Object.entries(Model.TOOLS).map(([id, name]) => ({ label: `Tool: ${name}`, run: () => app.set({ tool: id }) })),
    ...Model.EXAMPLES.map((/** @type {KitExample} */ e) => ({ label: `Example: ${e.label}`, run: () => app.set({ example: e.id }) })),
  ];

  /** @param {any} a */
  function bind(a) {
    app = a;
    RegimeView.bind(app, { esc, ti, td, chip, sourceLink, data: DATA });
    StabView.bind(app, { esc, ti, td, chip, sourceLink });
    $("confirm").addEventListener("click", () => {
      const ex = app.state.example;
      store[ex] = R.confirm(active(ex));
      persist();
      tellModel(`You confirmed the interpretation of version ${store[ex].version}. The Finder ran on it.`);
      app.set({});
    });
    $("restore").addEventListener("click", () => {
      const ex = app.state.example;
      const fresh = R.fromExample(ENGINE, ex);
      const rec = active(ex);
      const next = R.edit(rec, (/** @type {any} */ inp) => { for (const k of R.INPUT_KEYS) inp[k] = R.clone(fresh[k]); }, "Restored the example.");
      if (next !== rec) store[ex] = { ...next, origin: ex };
      persist();
      editorKey = "";
      tellModel(next === rec ? "The model already holds the example." : `Restored the example as version ${next.version}. Version ${rec.version} stays in the history.`);
      app.set({});
    });
    $("save-model").addEventListener("click", () => {
      const rec = active(app.state.example);
      const name = `scientific-modelling-model-${rec.origin}-v${rec.version}.json`;
      try { download(name, modelJson()); tellModel(`Saved ${name}.`); } catch (e) { tellModel(`Could not save ${name} here: ${String(e)}`); }
    });
    const file = $("load-model");
    file.addEventListener("change", async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      let doc = null;
      try { doc = JSON.parse(await chosen.text()); } catch { doc = null; }
      const res = doc ? R.validate(doc) : { errors: ["The file is not JSON."] };
      if (!res.record) tellModel(`${chosen.name} was not loaded, and the current record stays: ${res.errors.slice(0, 3).join(" ")}`);
      else {
        const ex = Model.EXAMPLES.some((/** @type {KitExample} */ e) => e.id === res.record.origin) ? res.record.origin : app.state.example;
        store[ex] = res.record;
        persist();
        editorKey = "";
        tellModel(`Loaded ${chosen.name} as version ${res.record.version}. Confirm its interpretation to run the Finder.`);
        app.set({ example: ex });
      }
      file.value = "";
    });
    const results = $("load-results");
    results.addEventListener("change", async () => {
      const chosen = results.files?.[0];
      if (!chosen) return;
      let doc = null;
      try { doc = JSON.parse(await chosen.text()); } catch { doc = null; }
      if (!doc) tellModel(`${chosen.name} is not JSON, and the record stays as it is.`);
      else importResults(doc, chosen.name);
      results.value = "";
    });
    $("sample-results").addEventListener("click", () => importResults(DATA.heatrefs?.sample, "the sample file"));
    $("repeating-auto").addEventListener("click", () => app.set({ repeating: "" }));
    $("tool-nondim").addEventListener("click", (/** @type {Event} */ e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const use = t.closest("button[data-use-scale]")?.getAttribute("data-use-scale");
      const unscale = t.closest("button[data-unscale]")?.getAttribute("data-unscale");
      const name = t.closest("button[data-name]")?.getAttribute("data-name");
      if (t.closest("button[data-confirm]")) { $("confirm").click(); return; }
      if (use) {
        const [varId, n] = use.split("|");
        const s = app.derived.nondim?.scales.find((/** @type {any} */ x) => x.id === varId);
        const c = s?.candidates.find((/** @type {any} */ x) => String(x.n) === n);
        if (!s || !c || !c.record) return;
        commit((/** @type {any} */ inp) => {
          inp.scales = inp.scales.filter((/** @type {any} */ x) => x.for !== varId);
          inp.scales.push({ id: `s-${varId}`, ...c.record });
        }, `Chose the scale ${c.label} for ${s.label}.`, true);
        tellModel(`You chose the scale ${c.label} for ${s.label}. Confirm the new version to run the Nondimensionalizer on it.`);
      } else if (unscale) {
        const s = app.derived.nondim?.scales.find((/** @type {any} */ x) => x.id === unscale);
        commit((/** @type {any} */ inp) => { inp.scales = inp.scales.filter((/** @type {any} */ x) => x.for !== unscale); }, `Removed your scale of ${s ? s.label : unscale}; the suggested scale applies.`, true);
      } else if (name) {
        const [key, nm, yes] = name.split("|");
        const ex = app.state.example;
        store[ex] = R.confirmInterpretation(active(ex), key, nm, yes === "1");
        persist();
        tellModel(yes === "1" ? `You confirmed the name ${nm}.` : `You withdrew the name ${nm}.`);
        app.set({});
      }
    });
    $("finder-groups").addEventListener("click", (/** @type {Event} */ e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest("button[data-name]");
      if (!b) return;
      const [key, name, yes] = String(b.getAttribute("data-name")).split("|");
      const ex = app.state.example;
      store[ex] = R.confirmInterpretation(active(ex), key, name, yes === "1");
      persist();
      tellModel(yes === "1" ? `You confirmed the name ${name} for this group.` : `You withdrew the name ${name}.`);
      app.set({});
    });
    const editor = $("editor-body");
    editor.addEventListener("change", (/** @type {Event} */ e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      const path = el.getAttribute("data-path");
      if (!path) return;
      const value = el.type === "checkbox" ? el.checked : el.value;
      commit((/** @type {any} */ inp) => { applyPath(inp, path, value); }, `Changed ${applyPathLabel(path)}.`);
    });
    editor.addEventListener("click", (/** @type {Event} */ e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      const add = t.closest("button[data-add]")?.getAttribute("data-add");
      const remove = t.closest("button[data-remove]")?.getAttribute("data-remove");
      if (add) {
        commit((/** @type {any} */ inp) => {
          const ids = new Set([...inp.variables, ...inp.equations, ...inp.conditions, ...inp.assumptions, ...inp.scales].map((/** @type {any} */ x) => x.id));
          const prefix = { variables: "v", equations: "e", conditions: "c", assumptions: "a", scales: "s" }[/** @type {"variables"} */ (add)];
          let n = 1;
          while (ids.has(`${prefix}-${n}`)) n++;
          const id = `${prefix}-${n}`;
          if (add === "variables") {
            let s = 1;
            while (inp.variables.some((/** @type {any} */ v) => v.symbol === `q${s}`)) s++;
            inp.variables.push(R.variable({ id, symbol: `q${s}`, meaning: "New variable", pi: true }));
          } else if (add === "equations") inp.equations.push({ id, kind: "governing", text: "" });
          else if (add === "conditions") inp.conditions.push({ id, kind: "boundary", text: "", at: "" });
          else if (add === "scales") inp.scales.push({ id, for: "", scale: "", offset: "", symbol: "", reason: "" });
          else inp.assumptions.push({ id, kind: "physical", text: "" });
        }, `Added ${add === "variables" ? "a variable" : add === "equations" ? "an equation" : add === "conditions" ? "a condition" : add === "scales" ? "a scale" : "an assumption"}.`, true);
      } else if (remove) {
        const [list, id] = remove.split(".");
        commit((/** @type {any} */ inp) => {
          inp[list] = inp[list].filter((/** @type {any} */ x) => x.id !== id);
          if (list === "variables") {
            inp.preferred = inp.preferred.filter((/** @type {string} */ p) => p !== id);
            if (inp.purpose.observable === id) inp.purpose.observable = "";
            inp.scales = inp.scales.filter((/** @type {any} */ c) => c.for !== id);
          }
        }, `Removed ${id}.`, true);
      }
    });
  }
  /** @param {string} path */
  function applyPathLabel(path) {
    const [list, id, field] = path.split(".");
    if (list === "title" || list === "preferred") return list === "title" ? "the title" : "the preferred reference variables";
    if (list === "purpose" || list === "geometry") return `the ${list} (${id})`;
    const rec = active(app.state.example);
    const item = rec[list]?.find((/** @type {any} */ x) => x.id === id);
    return `the ${field === "pi" ? "Pi set membership" : field} of ${list === "variables" && item ? item.symbol : id}`;
  }

  VisualKit.start({
    slug: Model.SLUG, title: "Scientific Modelling and Dimensional Analysis", summary: "One shared model record for three tools: the Dimensionless Number Finder, the Model Nondimensionalizer and the Regime Map Builder, with 26 declared model families.",
    schemaVersion: Model.SCHEMA_VERSION, fields: Model.FIELDS,
    derive: (/** @type {Record<string, any>} */ state) => Model.derive(state, DATA, active(state.example)),
    render, report: (/** @type {Record<string, any>} */ state, /** @type {any} */ d) => Report.report(state, d, DATA), bind, tools, commands,
  });
})();
