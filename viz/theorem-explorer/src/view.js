/* Theorem Explorer: which result to learn next: the views. This file is the visual's own: it decodes the packs,
 * draws the six views and the result page from the state, keeps the reader's profile in local storage, and adds
 * the CSV, result JSON and profile exports, the domain WebMCP tools and the palette commands. The kit
 * (VisualKit.start) owns the state, the URL, Back and Forward, Reset, the view JSON, Markdown and beamdswitch
 * exports, the command palette and the shared WebMCP tools. Nothing here reads the network.
 */
(async function () {
  "use strict";

  const D = JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? "{}");
  const SVG = "http://www.w3.org/2000/svg";
  const PROFILE_KEY = "theorem-explorer:profile";
  const VIEW_KEY = "theorem-explorer:view";
  const ROW = 46;
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);

  /* ---------- DOM helpers: text is always set as text, never parsed as HTML ---------- */

  /** @param {string} tag @param {Record<string, any> | null} [props] @param {...any} kids @returns {any} */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : String(c));
    return e;
  }
  /** Replace an element's children; null, undefined and false children are left out, as in h(). @param {Element} el @param {...any} kids */
  /** Prose with $...$ math: MathJax reads the \\( \\) form after render. @param {string} text */
  const prose = (text) => {
    const t = String(text ?? "");
    if (!t.includes("$")) return h("blockquote", { text: t });
    return h("blockquote", { "data-prose-tex": "", text: t.replace(/\$\$([^$]+)\$\$/g, "\\[$1\\]").replace(/\$([^$\n]+)\$/g, "\\($1\\)") });
  };
  function typesetProse() {
    const mj = /** @type {any} */ (globalThis).MathJax;
    const els = [...document.querySelectorAll("[data-prose-tex='']")];
    if (!els.length || !mj?.typesetPromise) return;
    for (const el of els) el.setAttribute("data-prose-tex", "done");
    mj.typesetPromise(els).catch(() => {});
  }
  const put = (/** @type {Element} */ el, /** @type {any[]} */ ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  /** @param {string} tag @param {Record<string, string | number>} attrs @param {string} [text] @returns {any} */
  function svg(tag, attrs, text) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  /** A table from a header and rows of cells. @param {string[]} head @param {any[][]} rows @param {string} [caption] */
  const table = (head, rows, caption) => h("div", { class: "table-scroll" }, h("table", { class: "data" },
    caption ? h("caption", { text: caption }) : null,
    h("thead", null, h("tr", null, head.map((x) => h("th", { scope: "col", text: x })))),
    h("tbody", null, rows.map((r) => h("tr", null, r.map((c, j) => (j === 0 ? h("th", { scope: "row" }, c) : h("td", null, c))))))));
  /** @param {[string, any][]} pairs */
  const dl = (pairs) => h("dl", { class: "readout facts" }, pairs.filter((p) => p[1] !== null && p[1] !== undefined).map(([k, v]) => [h("dt", { text: k }), h("dd", null, v)]));
  const fmt = (/** @type {number | null} */ v) => Model.scoreLabel(v);
  /** @param {number} x @param {number} [d] */
  const num = (x, d = 1) => (x === null || x === undefined ? "unknown" : Number(x).toFixed(d).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1"));

  /* ---------- packs: decode in the browser, with no network ---------- */

  /** @param {{ gz: string }} p */
  async function decode(p) {
    const bin = atob(p.gz);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }

  // The catalog decodes before the kit starts, so report a stale link at once; the kit repeats the same notice.
  const early = VisualKit.fromHash(Model.FIELDS, location.hash);
  if (early.notices.length) $("notice").textContent = early.notices.join(" ");
  const loading = $("loading");
  try {
    const [core, detail] = await Promise.all([decode(D.packs.core), decode(D.packs.detail)]);
    Model.prime(D, "core", core);
    Model.prime(D, "detail", detail);
  } catch (e) {
    loading.textContent = `This browser cannot decode the catalog (it needs DecompressionStream): ${String(e)}. Use a current Chrome, Edge, Firefox or Safari.`;
    return;
  }
  loading.hidden = true;
  const IX = Model.index(D);
  const DET = Model.detail(D);
  const TAX = D.taxonomy;
  const catName = (/** @type {number} */ k) => `${TAX.categories[k][0]} (${TAX.categories[k][1]})`;
  const rowOf = (/** @type {string} */ id) => IX.byId.get(id) ?? -1;

  /* ---------- profile: known results in local storage, with a fallback ---------- */

  let storageOk = true;
  /** @type {Record<string, number>} */
  let known = {};
  /** @type {string[]} */
  let unresolvedIds = [];
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved) {
      const p = Model.readProfile(saved, D);
      known = p.known;
      unresolvedIds = p.unresolved;
    }
  } catch (e) {
    storageOk = !(e instanceof DOMException);
    if (!storageOk) unresolvedIds = [];
  }
  D.profile = { known };
  /** The view saved by an earlier visit. It is offered, not loaded, so a shared link opens as sent. */
  let savedView = "";
  try { savedView = localStorage.getItem(VIEW_KEY) ?? ""; } catch { savedView = ""; }
  /** @type {any} */
  let app = null;

  function storeProfile() {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(Model.profileOf(app.state, D)));
      localStorage.setItem(VIEW_KEY, app.json());
      storageOk = true;
    } catch {
      storageOk = false;
    }
  }
  /** @param {string} id @param {number | null} depth */
  function setKnown(id, depth) {
    if (depth === null) delete known[id];
    else known[id] = Math.max(known[id] ?? -1, depth);
    D.profile = { known };
    storeProfile();
    app.set({}, "replace");
  }

  /* ---------- small shared parts ---------- */

  /** @param {string} id @param {string} [label] @param {Record<string, any>} [extra] */
  const openBtn = (id, label, extra = {}) => h("button", { type: "button", class: "link", onclick: () => app.set({ sel: id, ...extra }) }, label ?? IX.rows[rowOf(id)]?.n ?? id);
  /** @param {string} line */
  const tell = (line) => { $("export-status").textContent = line; };
  /** @param {string} name @param {string} body @param {string} type */
  function save(name, body, type) {
    try {
      const url = URL.createObjectURL(new Blob([body], { type }));
      const a = h("a", { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      tell(`Saved ${name}.`);
    } catch (e) {
      tell(`Could not save ${name} here: ${String(e)}`);
    }
  }
  /** @param {string} text @param {string} line */
  async function copy(text, line) {
    try {
      await navigator.clipboard.writeText(text);
      tell(line);
    } catch {
      tell("Could not copy here: use the Save button instead.");
    }
  }
  /** @param {string} id */
  function togglePin(id) {
    const pins = Model.splitList(app.state.pins);
    const next = pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id];
    const text = next.join(",");
    if (text.length > 200) { tell("The pinned list is full (200 characters). Remove a pin first."); return; }
    app.set({ pins: text });
  }

  /* ---------- common: snapshot line, weights, tabs ---------- */

  function renderCommon(/** @type {any} */ state, /** @type {any} */ d) {
    const s = D.snapshot;
    $("snapshot-line").textContent = `Snapshot ${s.id}. Source freshness: evidence to ${s.evidence_cutoff} (mathlib ${String(D.sources.mathlib.commit).slice(0, 12)}, TheoremSearch dataset of ${D.sources.theoremsearch.last_modified}, Wikidata and Wikipedia retrieved ${D.sources.wikidata.retrieved}). File generated ${String(s.generated_at).slice(0, 10)}. The page never refreshes its sources.`;
    for (const v of Model.FIELDS.view.values ?? []) $(`view-${v}`).hidden = state.view !== v;
    $("weights").hidden = state.view === "about" || (state.view === "fields" && state.fview !== "utility");
    $("custom-weights").hidden = state.preset !== "custom";
    const names = Model.COMPONENT_NAMES.map((n, k) => `${n} ${d.weights[k]}`).join(", ");
    $("weights-line").textContent = `${names}. Sum ${d.weightSum}.` +
      (d.excluded.length ? ` Excluded components: ${d.excluded.map((/** @type {string} */ k) => Model.COMPONENT_NAMES[Model.COMPONENTS.indexOf(k)]).join(", ")}. The scores are a custom view over the remaining components only, not the full rubric.` : "") +
      (d.weightsOk ? "" : " The weights must add up to 100: every aggregate is unknown until they do.");
    $("result").hidden = !["learn", "catalog", "connections"].includes(state.view);
    for (const b of document.querySelectorAll("[data-example]")) {
      const ex = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === b.getAttribute("data-example"));
      b.setAttribute("aria-pressed", String(ex !== undefined && Object.entries(ex.state).every(([k, v]) => state[k] === v)));
    }
  }

  /* ---------- learn next ---------- */

  function renderLearn(/** @type {any} */ state, /** @type {any} */ d) {
    const L = d.learn;
    const depth = Model.DEPTHS.indexOf(state.depth);
    $("budget-band").textContent = Model.BANDS[state.budget - 1];
    const interests = $("interests");
    if (document.activeElement !== interests) interests.value = state.interests;
    $("interests-line").textContent = L.baseline ? "Baseline profile: no interests, so relevance is 1 for every result." : `Matched interests: ${L.interests.join(", ")}.`;
    $("known-count").textContent = String(d.counts.known);
    $("profile-status").textContent = [
      storageOk ? "The profile is kept in this browser's local storage." : "Local storage is not available here, so the profile lasts only while this tab is open. Use Save profile JSON to keep it.",
      unresolvedIds.length ? `Profile identities not in this snapshot: ${unresolvedIds.join(", ")}.` : "",
    ].join(" ");
    $("learn-summary").textContent = `${L.candidates} candidate results after the filters; ${L.excludedKnown} known at the ${state.depth} depth or deeper are left out; ${L.incomplete} have an incomplete priority (an interval). Reader level ${state.reader}, budget band ${state.budget}. The top ${L.recs.length} follow.`;
    put($("recs"), ...L.recs.map((/** @type {any} */ r) => {
      const x = DET[r.i];
      const why = x.why.split(/(?<=\.)\s/)[0];
      const comps = Object.entries(r.comps).map(([k, v]) => `${k.replace("_", " ")} ${v[0] === v[1] ? num(v[0], 2) : `${num(v[0], 2)} to ${num(v[1], 2)}`}`).join("; ");
      const effort = r.band === "x" ? "Effort: the depth does not apply" : `Effort: ${Model.bandLabel(String(r.shifted))}${r.shifted !== Number(r.band) ? ` (judged ${Model.bandLabel(r.band)} at the ${Model.LEVEL_NAMES[Model.LEVELS.indexOf(r.level)]} level, one band up for each level above yours)` : ""}`;
      return h("li", { class: "rec" },
        h("div", { class: "rec-head" },
          openBtn(r.id, r.name),
          h("span", { class: "num priority", text: r.complete ? `Priority ${num(r.p, 1)}` : `Priority incomplete: ${num(r.lo, 1)} to ${num(r.hi, 1)}` })),
        h("p", { class: "note", text: `${r.type}, ${Model.LEVEL_NAMES[Model.LEVELS.indexOf(r.level)]} level, score ${r.score === null ? `unknown (${num(r.scoreLo, 1)} to ${num(r.scoreHi, 1)})` : fmt(r.score)}${r.knownDepth ? `, known at the ${r.knownDepth} depth` : ""}.` }),
        h("p", null, h("strong", { text: "Why it matters: " }), why),
        h("p", null, h("strong", { text: "Missing prerequisites: " }), r.missing.length ? r.missing.map((/** @type {any} */ m, /** @type {number} */ j) => [j ? ", " : "", openBtn(m.id, m.name)]) : "no prerequisite result recorded", x.cn.length ? `. Concepts: ${x.cn.join(", ")}.` : "."),
        h("p", null, effort, "."),
        h("p", null, h("strong", { text: "Opens: " }), r.laterCount ? [r.later.map((/** @type {any} */ m, /** @type {number} */ j) => [j ? ", " : "", openBtn(m.id, m.name)]), r.laterCount > r.later.length ? ` and ${r.laterCount - r.later.length} more` : ""] : "no later result has this as its only missing prerequisite", "."),
        h("p", { class: "note", text: `Components (0 to 1): ${comps}.` }),
        h("div", { class: "actions" },
          h("button", { type: "button", onclick: () => setKnown(r.id, depth), text: `I know it (${state.depth})` }),
          h("button", { type: "button", onclick: () => togglePin(r.id), text: Model.splitList(state.pins).includes(r.id) ? "Unpin" : "Pin" }),
          h("button", { type: "button", onclick: () => app.set({ view: "connections", sel: r.id }), text: "Show the path" })));
    }));
  }

  /* ---------- catalog ---------- */

  /** Column definitions: label, sort key (or null) and cell text. @type {Record<string, { label: string, sort: string | null, cell: (i: number, a: any) => string }>} */
  const COLS = {
    type: { label: "Type", sort: null, cell: (i) => IX.rows[i].t.replace("not-a-result:", "not a result: ") },
    score: { label: "Score", sort: "score", cell: (_i, a) => fmt(a.v) },
    interval: { label: "Interval", sort: "lo", cell: (_i, a) => (a.v === null && a.missing[0] !== "weights" ? `${num(a.lo, 2)} to ${num(a.hi, 2)}` : "") },
    ...Object.fromEntries(Model.COMPONENTS.map((k, j) => [k, { label: k, sort: k, cell: (/** @type {number} */ i) => Model.scoreText(IX.scores[i][j]) }])),
    conf: { label: "Confidence", sort: null, cell: (i) => IX.rows[i].c + (IX.rows[i].c2 ? ` / ${IX.rows[i].c2}` : "") },
    formal: { label: "Formal", sort: null, cell: (i) => (IX.rows[i].f ? "mathlib" : "no") },
    level: { label: "Level", sort: "level", cell: (i) => Model.LEVEL_NAMES[IX.rows[i].lv] },
    effort: { label: "Effort u/a/p", sort: null, cell: (i) => IX.rows[i].ef.join("/") },
    statement: { label: "Statement tokens", sort: "statement", cell: (i) => (IX.rows[i].st ?? "unknown") + "" },
    proof: { label: "Proof tokens", sort: "proof", cell: (i) => (IX.rows[i].sp ?? "none") + "" },
    dependents: { label: "Dependents", sort: "dependents", cell: (i) => (IX.rows[i].dep ?? "") + "" },
    uses: { label: "Uses", sort: "uses", cell: (i) => String(IX.rows[i].ua + IX.rows[i].ui) },
    year: { label: "First use", sort: "year", cell: (i) => (IX.rows[i].yr ?? "") + "" },
    fields: { label: "Fields", sort: null, cell: (i) => IX.rows[i].cat.map((/** @type {number} */ k) => TAX.categories[k][0]).join(" ") || "unclassified" },
  };
  const COMPONENT_TITLES = Object.fromEntries(Model.COMPONENTS.map((k, j) => [k, Model.COMPONENT_NAMES[j]]));

  /** @type {{ order: number[], cols: string[], weights: number[], ok: boolean, sel: string }} */
  let tableModel = { order: [], cols: [], weights: [], ok: true, sel: "" };
  let tableFrame = 0;

  function drawRows() {
    const wrap = $("table-wrap");
    const { order, cols, weights, ok, sel } = tableModel;
    const first = Math.max(0, Math.floor(wrap.scrollTop / ROW) - 10);
    const last = Math.min(order.length, first + Math.ceil((wrap.clientHeight || 600) / ROW) + 20);
    const span = cols.length + 1;
    const rows = [h("tr", { class: "spacer", "aria-hidden": "true" }, h("td", { colspan: span, style: `height:${first * ROW}px` }))];
    for (let k = first; k < last; k++) {
      const i = order[k];
      const r = IX.rows[i];
      const a = ok ? Model.aggregate(IX.scores[i], weights) : { v: null, lo: 0, hi: 100, missing: ["weights"] };
      const preview = DET[i].concl ?? (DET[i].evs.find((/** @type {any} */ e) => e.kind === "source statement")?.claim ?? DET[i].wd ?? "");
      rows.push(h("tr", { class: r.id === sel ? "sel" : null, "aria-rowindex": k + 2, "aria-selected": r.id === sel ? "true" : null },
        h("th", { scope: "row", class: "name" },
          h("button", { type: "button", class: "link", onclick: () => { app.set({ sel: r.id }); $("result").scrollIntoView({ block: "start" }); } }, r.n),
          h("span", { class: "preview", text: preview.replace(/\s+/g, " ").slice(0, 160) })),
        cols.map((c) => h("td", { class: c === "fields" || c === "type" ? null : "num", text: COLS[c].cell(i, a) }))));
    }
    rows.push(h("tr", { class: "spacer", "aria-hidden": "true" }, h("td", { colspan: span, style: `height:${(order.length - last) * ROW}px` })));
    put($("catalog-body"), ...rows);
  }

  /* ---------- the formal library: every theorem of the pinned mathlib build (full build only) ---------- */

  /** @type {{ rows: any[], modules: string[], order: number[] } | null} */
  let formal = null;
  let formalFrame = 0;

  function drawFormal() {
    if (!formal) return;
    const wrap = $("formal-wrap");
    const { rows, modules, order } = formal;
    const first = Math.max(0, Math.floor(wrap.scrollTop / ROW) - 10);
    const last = Math.min(order.length, first + Math.ceil((wrap.clientHeight || 600) / ROW) + 20);
    const out = [h("tr", { class: "spacer", "aria-hidden": "true" }, h("td", { colspan: 10, style: `height:${first * ROW}px` }))];
    const n = (/** @type {number | null} */ x) => (x === null || x === undefined ? "not measured" : String(x));
    for (let k = first; k < last; k++) {
      const [name, m, st, sp, pu, hy, nd, ncl, sorry, link] = rows[order[k]];
      out.push(h("tr", { "aria-rowindex": k + 2 },
        h("th", { scope: "row", class: "name", text: name }), h("td", { text: modules[m] }),
        h("td", { class: "num", text: n(hy) }), h("td", { class: "num", text: n(ncl) }), h("td", { class: "num", text: n(nd) }),
        h("td", { class: "num", text: n(st) }), h("td", { class: "num", text: n(sp) }), h("td", { class: "num", text: n(pu) }),
        h("td", { text: sorry ? "yes" : "no" }),
        h("td", null, link >= 0 ? h("button", { type: "button", class: "link", onclick: () => { app.set({ sel: IX.rows[link].id }); $("result").scrollIntoView({ block: "start" }); } }, IX.rows[link].n) : "none")));
    }
    out.push(h("tr", { class: "spacer", "aria-hidden": "true" }, h("td", { colspan: 10, style: `height:${(order.length - last) * ROW}px` })));
    put($("formal-body"), ...out);
  }

  function filterFormal() {
    if (!formal) return;
    const q = String($("formal-q").value).trim().toLowerCase();
    const link = $("formal-link").value;
    const { rows, modules } = formal;
    formal.order = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (link === "linked" && r[9] < 0) continue;
      if (link === "unlinked" && r[9] >= 0) continue;
      if (q && !r[0].toLowerCase().includes(q) && !modules[r[1]].toLowerCase().includes(q)) continue;
      formal.order.push(i);
    }
    $("formal-count").textContent = `${formal.order.length.toLocaleString("en")} of ${rows.length.toLocaleString("en")} theorems shown (mathlib ${String(D.sources.mathlib.commit).slice(0, 12)}).`;
    $("formal-wrap").scrollTop = 0;
    drawFormal();
  }

  function setupFormal() {
    if (!D.packs.formal) return;
    $("formal-lib").hidden = false;
    $("formal-open").addEventListener("click", async () => {
      const button = /** @type {HTMLButtonElement} */ ($("formal-open"));
      button.disabled = true;
      $("formal-count").textContent = "Decoding the formal library…";
      try {
        const corpus = await decode(D.packs.formal);
        formal = { rows: corpus.rows, modules: corpus.modules, order: [] };
      } catch (e) {
        $("formal-count").textContent = `The formal library could not be decoded: ${String(e)}`;
        button.disabled = false;
        return;
      }
      button.hidden = true;
      $("formal-q").disabled = false;
      $("formal-link").disabled = false;
      $("formal-wrap").hidden = false;
      filterFormal();
    });
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let wait;
    $("formal-q").addEventListener("input", () => { clearTimeout(wait); wait = setTimeout(filterFormal, 200); });
    $("formal-link").addEventListener("change", filterFormal);
    $("formal-wrap").addEventListener("scroll", () => { cancelAnimationFrame(formalFrame); formalFrame = requestAnimationFrame(drawFormal); });
  }

  function renderCatalog(/** @type {any} */ state, /** @type {any} */ d) {
    const q = $("q");
    if (document.activeElement !== q) q.value = state.q;
    for (const key of ["grp", "arch", "cat", "acat"]) $(`f-${key}`).value = state[key];
    $("filter-count").textContent = `${d.counts.shown} of ${d.counts.records} records shown (${d.counts.shownUnknown} with an unknown aggregate). ${d.counts.formalUnnamed.toLocaleString("en")} unnamed mathlib theorems stay unscored: ${D.packs.formal ? "the formal library below lists them" : "the full build (pipeline/fullbuild.py) lists them in its formal library"}.`;
    put($("chips"), ...d.filters.map((/** @type {any} */ f) => h("li", null,
      h("button", { type: "button", class: "chip", "aria-label": `Remove the filter ${f.label}: ${f.value}`, onclick: () => app.set({ [f.key]: Model.FIELDS[f.key].default }) }, `${f.label}: ${f.value} ×`))));
    $("clear-filters").disabled = d.filters.length === 0;
    const cols = Model.splitList(state.cols).filter((c) => c in COLS);
    for (const box of document.querySelectorAll("#col-boxes input")) if (box instanceof HTMLInputElement) box.checked = cols.includes(box.value);
    put($("catalog-head"), h("tr", null,
      h("th", { scope: "col", "aria-sort": state.sort === "name" ? (state.dir === "asc" ? "ascending" : "descending") : null },
        h("button", { type: "button", class: "sort", onclick: () => sortBy("name") }, "Result")),
      cols.map((c) => {
        const s = COLS[c].sort;
        const on = s !== null && state.sort === s;
        return h("th", { scope: "col", title: COMPONENT_TITLES[c] ?? null, "aria-sort": on ? (state.dir === "asc" ? "ascending" : "descending") : null },
          s ? h("button", { type: "button", class: "sort", onclick: () => sortBy(s) }, COLS[c].label, on ? (state.dir === "asc" ? " ▲" : " ▼") : "") : COLS[c].label);
      })));
    $("catalog").setAttribute("aria-rowcount", String(d.order.length + 1));
    tableModel = { order: d.order, cols, weights: d.weights, ok: d.weightsOk, sel: d.selected.id };
    drawRows();
    drawEffort(state, d);
  }

  /** @param {string} key */
  function sortBy(key) {
    const s = app.state;
    app.set(s.sort === key ? { dir: s.dir === "asc" ? "desc" : "asc" } : { sort: key, dir: key === "name" ? "asc" : "desc" });
  }

  /** Impact (aggregate score) against effort (judged band): two ordinal axes, no ratio (spec section 8). */
  function drawEffort(/** @type {any} */ state, /** @type {any} */ d) {
    const chart = $("effort-chart");
    const W = Math.max(280, Math.round(chart.getBoundingClientRect().width) || 640), H = 300;
    const P = { l: 44, r: 12, t: 16, b: 40 };
    chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const depth = Model.DEPTHS.indexOf(state.depth);
    const X = (/** @type {number} */ b) => P.l + ((b - 0.5) / 5) * (W - P.l - P.r);
    const Y = (/** @type {number} */ v) => P.t + (1 - v / 100) * (H - P.t - P.b);
    const g = [svg("g", { class: "grid" }), svg("g", { class: "tick" }), svg("g", { class: "context" })];
    for (const v of [0, 25, 50, 75, 100]) {
      g[0].append(svg("line", { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v) }));
      g[1].append(svg("text", { x: P.l - 6, y: Y(v) + 4, "text-anchor": "end" }, String(v)));
    }
    for (let b = 1; b <= 5; b++) g[1].append(svg("text", { x: X(b), y: H - P.b + 16, "text-anchor": "middle" }, String(b)));
    /** @type {number[][]} */
    const grid = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
    let unknownScore = 0, noBand = 0;
    let sel = null;
    for (const i of d.order) {
      const a = d.weightsOk ? Model.aggregate(IX.scores[i], d.weights) : { v: null };
      const band = IX.rows[i].ef[depth];
      if (a.v === null) { unknownScore++; continue; }
      if (band === "x") { noBand++; continue; }
      const b = Number(band);
      grid[b - 1][Math.min(4, Math.floor(a.v / 20))]++;
      const jitter = (((i * 2654435761) >>> 0) % 1000) / 1000 - 0.5;
      const pt = svg("circle", { cx: X(b + jitter * 0.6).toFixed(1), cy: Y(a.v).toFixed(1), r: 2.5 });
      if (IX.rows[i].id === d.selected.id) sel = [X(b + jitter * 0.6), Y(a.v)];
      g[2].append(pt);
    }
    const marks = [svg("text", { class: "axis-title", x: P.l, y: 12 }, "Aggregate score"),
      svg("text", { class: "axis-title", x: W - P.r, y: H - 4, "text-anchor": "end" }, `Effort band at the ${state.depth} depth (1 under 1 hour ... 5 months)`)];
    if (sel) marks.push(svg("circle", { class: "hl", cx: sel[0].toFixed(1), cy: sel[1].toFixed(1), r: 6 }), svg("text", { class: "direct-label", x: (sel[0] + 9).toFixed(1), y: (sel[1] - 6).toFixed(1) }, d.selected.name.slice(0, 40)));
    put(chart, ...g, ...marks);
    $("effort-note").textContent = `Each dot is one filtered result (jitter inside each band). Left out: ${unknownScore} with an unknown aggregate, ${noBand} where the depth does not apply. The selected result is the large dot. Both axes are judgments, so the chart gives no impact-per-effort ratio.`;
    put($("effort-table"), table(["Effort band", "Score 0-20", "20-40", "40-60", "60-80", "80-100"], grid.map((row, b) => [`${b + 1} (${Model.BANDS[b]})`, ...row.map(String)])));
  }

  /* ---------- the result page ---------- */

  function renderResult(/** @type {any} */ state, /** @type {any} */ d) {
    const s = d.selected;
    const i = s.i;
    const r = IX.rows[i];
    const x = DET[i];
    const depth = Model.DEPTHS.indexOf(state.depth);
    const pinned = Model.splitList(state.pins).includes(s.id);
    const formal = x.evs.find((/** @type {any} */ e) => e.kind === "formal declaration");
    const sources = x.evs.filter((/** @type {any} */ e) => e.kind === "source statement" || e.kind === "formal declaration");
    const apps = x.evs.filter((/** @type {any} */ e) => e.kind === "use record (application)");
    const rels = s.relations;
    const firstRel = (/** @type {string[]} */ types) => { for (const t of types) if (rels[t]) return { t, item: rels[t].items[0] }; return null; };
    const alt = firstRel(["similar-problem", "generalization", "special-case", "equivalent"]);
    const onward = firstRel(["consequence", "research-influence", "generalization"]);
    const missing = IX.pre[i].filter((/** @type {number} */ j) => !(IX.rows[j].id in known));
    const sens = d.sensitivity.find((/** @type {any} */ e) => e.id === s.id);
    const comp = Model.COMPONENTS.map((k, j) => {
      const c = D.rubric.components[j];
      const a = IX.scores[i][j];
      const anchor = a >= 0 ? (c.anchors[String(a)] ?? `between the anchors ${a - 1} and ${a + 1}`) : a === -1 ? D.rubric.scale.u : D.rubric.scale.na;
      return [c.name, Model.scoreText(a), r.s2 ? Model.scoreText(IX.scores2[i][j]) : "none", String(d.weights[j]), anchor];
    });
    const m = s.measures;
    const nextActions = [
      h("li", null, h("a", { href: "#result-statement", text: "Inspect the statement" }), formal ? [" or ", h("a", { href: formal.url, rel: "noopener", text: "the formal proof in mathlib (online)" })] : " (no formal proof in the pinned mathlib)"),
      h("li", null, s.inCases.length ? h("button", { type: "button", class: "link", onclick: () => app.set({ view: "compare", cmp: s.inCases[0] }), text: `Compare in the case ${s.inCases[0]}` })
        : alt ? h("button", { type: "button", class: "link", onclick: () => app.set({ view: "compare", pins: [...new Set([...Model.splitList(state.pins), s.id, alt.item.other])].join(",").slice(0, 200) }), text: `Compare with ${alt.item.name} (${alt.t})` }) : "No comparison case or alternative is recorded"),
      h("li", null, missing.length ? ["Learn a missing prerequisite: ", openBtn(IX.rows[missing[0]].id)] : "No missing prerequisite result"),
      h("li", null, apps.length ? ["Examine an application: ", h("a", { href: apps[0].url, rel: "noopener", text: apps[0].paper ?? apps[0].url }), " (online)"] : "No documented application in the declared sources"),
      h("li", null, onward ? ["Explore a connection: ", openBtn(onward.item.other, `${onward.item.phrase} ${onward.item.name}`)] : "No consequence or research connection is recorded"),
      h("li", null, h("button", { type: "button", class: "link", onclick: () => app.set({ view: "connections" }), text: "Show the prerequisite path" }), ", ",
        h("button", { type: "button", class: "link", onclick: () => setKnown(s.id, depth), text: `mark it known (${state.depth})` }), ", ",
        h("button", { type: "button", class: "link", onclick: () => togglePin(s.id), text: pinned ? "unpin it" : "pin it" })),
      h("li", null, h("button", { type: "button", class: "link", onclick: saveResultJson, text: "Export the selected and pinned results as JSON" }), " or use Save beamdswitch deck"),
    ];
    put($("result"), 
      h("p", { class: "eyebrow" }, h("span", { text: r.t }), h("span", { text: s.id }), h("span", { text: `${Model.LEVEL_NAMES[r.lv]} level` })),
      h("h2", { id: "result-name", text: r.n }),
      x.al.length ? h("p", { class: "note", text: `Also called: ${x.al.join("; ")}.` }) : null,
      h("p", { class: "note", text: `Theorem categories: ${r.cat.map(catName).join(", ") || "unclassified"}. Application categories (judged from the evidence: where the result is applied): ${r.acat.map(catName).join(", ") || "none"}.` }),
      rels["candidate-identity"] ? h("p", { class: "callout" }, "Possibly the same result (not merged, uncertain): ", rels["candidate-identity"].items.map((/** @type {any} */ c, /** @type {number} */ j) => [j ? ", " : "", openBtn(c.other, c.name)])) : null,
      h("h3", { text: "Next actions" }), h("ul", { class: "next" }, nextActions),
      h("h3", { id: "result-statement", text: "Statement" }),
      h("div", { class: "two" },
        h("div", null, h("p", { class: "label", text: "Original statements (source text)" }),
          sources.length ? sources.map((/** @type {any} */ e) => h("figure", { class: "inset" },
            e.kind === "formal declaration" ? h("pre", { class: "lean", text: e.claim }) : prose(e.claim),
            h("figcaption", { class: "note" }, `${e.kind}, ${e.location}, revision ${String(e.revision).slice(0, 12)}. `, h("a", { href: e.url, rel: "noopener", text: "Source (online)" }), `. Reuse: ${e.reuse}.`)))
            : h("p", { class: "note", text: "No source statement text is in the snapshot for this result." })),
        h("div", null, h("p", { class: "label", text: "Restatements in papers (labelled, not the original)" }),
          x.rs.length ? x.rs.map((/** @type {any} */ e) => h("figure", { class: "inset" }, h("p", { class: "label", text: `Restatement: ${e.label}` }), prose(e.body), h("figcaption", { class: "note", text: `In ${e.paper}.` })))
            : h("p", { class: "note", text: "No restatement found in the TheoremSearch dataset." }),
          h("p", { class: "label", text: "Explanation (authored by the judge, ASD-STE100)" }), h("p", { text: x.why }))),
      x.sig ? dl([["Lean conclusion", h("code", { text: x.concl ?? "unknown" })],
        ["Hypotheses (explicit)", x.hyps.length ? h("ul", null, x.hyps.map((/** @type {string} */ y) => h("li", null, h("code", { text: y })))) : "none"],
        ["Typeclass assumptions", x.cls.length ? x.cls.join(", ") : "none"],
        ["Module", x.mod], ["Related declarations", `${x.ndecls} (${x.decls.slice(0, 6).join(", ")}${x.ndecls > 6 ? ", ..." : ""})`]]) : null,
      h("h3", { text: "Scores" }),
      h("p", null, `Aggregate under the active weights: `, h("strong", { class: "num", text: fmt(s.score) }),
        s.score === null ? ` (interval ${num(s.lo, 2)} to ${num(s.hi, 2)}; missing: ${s.missing.join(", ")})` : ` (rank ${s.rank} of the scored results)`,
        `. Confidence ${r.c}${r.c2 ? `; second assessment ${r.c2}` : ""}. Assessment consistency: ${s.consistency}${sens && sens.shift !== null ? `; the second assessment moves the rank by ${sens.shift > 0 ? "+" : ""}${sens.shift}` : ""}. Evidence: ${r.ev}.`),
      table(["Component", "Score", "Second assessment", "Weight", "Anchor for this score"], comp),
      r.s2 ? h("p", { class: "note", text: `Second assessment: ${x.why2}` }) : null,
      h("p", { class: "note", text: `${D.rubric.confidence.note} Judge: ${D.snapshot.judge.model} (${D.snapshot.judge.access}), rubric ${D.rubric.version}, prompt ${D.snapshot.prompt_version}, evidence cutoff ${D.snapshot.evidence_cutoff}.` }),
      h("h3", { text: "Measurements" }),
      dl([["Statement length", m.statement === null ? "unknown" : `${m.statement} tokens (${m.statementBasis})`],
        ["Proof length", m.proof === null ? `none (${m.proofBasis})` : `${m.proof} tokens (${m.proofBasis}); proof term ${m.proofTerm ?? "unknown"} nodes`],
        ["Explicit hypotheses", m.hypotheses ?? "not measured"], ["Typeclass assumptions", m.typeclasses ?? "not measured"],
        ["Data arguments (explicit, not propositions)", m.dataArguments ?? "not measured"], ["Direct dependents in mathlib", m.dependents ?? "not measured"],
        ["Axioms beyond propext, Quot.sound, Classical.choice", r.f ? (m.axioms.length ? m.axioms.join(", ") : "none") : "not measured"],
        ["Documented uses", `${s.uses.application} applications, ${s.uses.influence} research influences, ${s.uses.restatements} restatements, ${s.uses.theoremgraph} TheoremGraph matches`],
        ["Effort bands (understand / apply / prove)", r.ef.map((/** @type {string} */ b) => Model.bandLabel(b)).join("; ")],
        ["Prerequisite results", IX.pre[i].length ? IX.pre[i].map((/** @type {number} */ j, /** @type {number} */ k) => [k ? ", " : "", openBtn(IX.rows[j].id), IX.rows[j].id in known ? " (known)" : ""]) : "none recorded"],
        ["Prerequisite concepts", x.cn.join(", ") || "none recorded"]]),
      h("p", { class: "note", text: "Measurements count hypotheses, typeclass assumptions and axioms apart. Lengths are tokens of the pinned source text (te-measure/1, te-text-tokens/1). The selected proof is the mathlib proof; it is not claimed to be the shortest proof." }),
      h("details", null, h("summary", { text: `Evidence records (${x.evs.length})` }),
        h("ul", { class: "evidence" }, x.evs.map((/** @type {any} */ e) => h("li", null,
          h("strong", { text: `${e.kind} (${e.explicit ? "explicit" : "inferred"})` }), `: ${e.claim.replace(/\s+/g, " ").slice(0, 400)}`,
          h("span", { class: "note", text: ` ${e.location}; revision ${String(e.revision).slice(0, 12)}; dates ${Object.entries(e.dates ?? {}).map(([k, v]) => `${k} ${v}`).join(", ")}; method ${e.method}; reuse ${e.reuse}. ` }),
          e.url ? h("a", { href: e.url, rel: "noopener", text: "Link (online)" }) : null)))),
      h("details", null, h("summary", { text: `Relations (${Object.values(rels).reduce((n, g) => n + /** @type {any} */ (g).count, 0)})` }), relationList(rels)),
    );
  }

  /** @param {Record<string, any>} rels */
  function relationList(rels) {
    const groups = Model.REL_ORDER.filter((t) => rels[t]);
    if (!groups.length) return h("p", { class: "note", text: "No relation is recorded for this result." });
    return h("div", { class: "relations" }, groups.map((t) => h("section", null,
      h("h4", { text: `${t} (${rels[t].count})` }),
      h("p", { class: "note", text: `Status: ${rels[t].items[0].status}.` }),
      h("ul", null, rels[t].items.map((/** @type {any} */ e) => h("li", null, `It ${e.phrase} `, openBtn(e.other, e.name), e.note ? h("span", { class: "note", text: ` (${e.note})` }) : null))),
      rels[t].count > rels[t].items.length ? h("p", { class: "note", text: `${rels[t].count - rels[t].items.length} more are in the JSON export.` }) : null)));
  }

  /* ---------- comparisons ---------- */

  function renderCompare(/** @type {any} */ state, /** @type {any} */ d) {
    const c = d.compare;
    const dirText = c.metric.direction === "lower" ? "lower is better" : c.metric.direction === "higher" ? "higher is better" : "no direction: the values are compared, not ranked";
    const entries = c.entries.filter((/** @type {any} */ e) => e.value !== null).sort((/** @type {any} */ a, /** @type {any} */ b) => (a.rank ?? 0) - (b.rank ?? 0));
    const excluded = c.entries.filter((/** @type {any} */ e) => e.value === null);
    put($("case"), h("article", { class: "card" },
      h("h3", { text: c.title }),
      h("p", { text: c.question }),
      dl([["Goal", c.goal], ["Inputs", h("ul", null, c.inputs.map((/** @type {string} */ t) => h("li", { text: t })))],
        ["Admissible hypotheses", c.hypotheses.join("; ")], ["Target", c.target],
        ["Metric", `${c.metric.name} (${c.metric.unit}); ${dirText}`], ["Evidence cutoff", `${c.cutoff}; evaluated ${c.evaluated}`]]),
      h("p", { class: "callout", text: "Calculated guarantees: each value comes from the cited formula and the inputs above. They are not published empirical measurements." }),
      h("div", { class: "table-scroll" }, h("table", { class: "data" },
        h("thead", null, h("tr", null, ["Rank", "Result", "Guarantee", "Applies because", "Calculation", "Value", "Aggregate score", "Original date"].map((x) => h("th", { scope: "col", text: x })))),
        h("tbody", null, entries.map((/** @type {any} */ e) => h("tr", { class: e.result === c.best ? "best" : null },
          h("td", { class: "num", text: e.rank ? String(e.rank) : "-" }),
          h("th", { scope: "row" }, openBtn(e.result, e.name, { view: "catalog" }), hypothesesOf(e.i)),
          h("td", null, h("span", { "data-tex": e.tex })),
          h("td", { text: e.requires ?? "" }),
          h("td", null, h("code", { text: e.steps })),
          h("td", { class: "num" }, e.text, e.threshold ? ` (${e.meets ? "meets" : "fails"} ${e.threshold.op} ${e.threshold.value})` : ""),
          h("td", { class: "num", text: e.score ? fmt(e.score.v) : "unknown" }),
          h("td", { text: e.year ? `${e.year}: ${e.date}` : e.date ?? "unknown" }))),
          c.reference ? h("tr", { class: "ref" }, h("td", { text: "ref" }), h("th", { scope: "row", text: c.reference.label }), h("td"), h("td"), h("td", null, h("code", { text: c.reference.steps })), h("td", { class: "num", text: c.reference.text }), h("td"), h("td")) : null))),
      excluded.length ? [h("h4", { text: "Excluded results" }), h("ul", null, excluded.map((/** @type {any} */ e) => h("li", null, openBtn(e.result, e.name), `: ${e.excluded}`)))] : null,
      h("p", { class: "note", text: `Dominance: ${c.dominance}.${c.note ? ` ${c.note}` : ""} The rank uses only this metric on these inputs; the hypotheses and the inputs each result needs are the trade-off.` }),
      compareChart(c, entries)));
    renderPinned(state, d);
  }

  /** The hypotheses of a result, readable inside the comparison (spec section 11.1). @param {number} i */
  function hypothesesOf(i) {
    if (i < 0) return null;
    const x = DET[i];
    const src = x.evs.find((/** @type {any} */ e) => e.kind === "source statement");
    return h("details", { class: "hyps" }, h("summary", { text: "Hypotheses" }),
      x.sig ? [h("p", { class: "note", text: `Lean, explicit: ${x.hyps.length ? x.hyps.join("; ") : "none"}. Typeclasses: ${x.cls.join(", ") || "none"}.` }), h("code", { text: x.concl ?? "" })]
        : src ? prose(src.claim) : h("p", { class: "note", text: "No statement text in the snapshot." }));
  }

  /** A log-scale bar chart of the calculated values, with the reference line. @param {any} c @param {any[]} entries */
  function compareChart(c, entries) {
    if (c.metric.direction === "none" || !entries.length || entries.some((e) => !(e.value > 0))) return null;
    const W = 640, rowH = 28, P = { l: 200, r: 70, t: 22, b: 10 };
    const H = P.t + P.b + rowH * (entries.length + (c.reference ? 1 : 0));
    const all = [...entries.map((e) => e.value), ...(c.reference ? [c.reference.value] : [])];
    const lo = Math.floor(Math.log10(Math.min(...all))), hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(...all))));
    const X = (/** @type {number} */ v) => P.l + ((Math.log10(v) - lo) / (hi - lo)) * (W - P.l - P.r);
    const out = svg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${c.metric.name} for each result on a log scale; the table above gives the same values` });
    const grid = svg("g", { class: "grid" }), tick = svg("g", { class: "tick" });
    for (let p = lo; p <= hi; p++) { grid.append(svg("line", { x1: X(10 ** p), x2: X(10 ** p), y1: P.t, y2: H - P.b })); tick.append(svg("text", { x: X(10 ** p), y: 14, "text-anchor": "middle" }, `1e${p}`)); }
    out.append(grid, tick);
    entries.forEach((e, k) => {
      const y = P.t + k * rowH;
      out.append(svg("text", { x: P.l - 8, y: y + 18, "text-anchor": "end" }, e.name.slice(0, 28)),
        svg("rect", { class: e.result === c.best ? "bar hl-fill" : "bar", x: P.l, y: y + 6, width: Math.max(1, X(e.value) - P.l), height: rowH - 12 }),
        svg("text", { class: "direct-label", x: X(e.value) + 6, y: y + 18 }, e.text));
    });
    if (c.reference) {
      const x = X(c.reference.value);
      out.append(svg("line", { class: "ref", x1: x, x2: x, y1: P.t, y2: H - P.b }), svg("text", { class: "direct-label", x: x + 4, y: H - P.b - 8 }, `exact ${c.reference.text}`));
    }
    return h("figure", null, h("figcaption", { class: "label", text: `${c.metric.name}, log scale (${c.metric.direction} is better)` }), out);
  }

  function renderPinned(/** @type {any} */ state, /** @type {any} */ d) {
    if (!d.pinned.length) {
      put($("pinned"), h("p", { class: "note", text: "No result is pinned. Use Pin on a result page or a recommendation to compare results side by side here." }));
      return;
    }
    const head = ["Result", "Aggregate", ...Model.COMPONENT_NAMES, "Confidence", "Consistency", "Level", "Effort u/a/p", "Formal", "Hypotheses", ""];
    put($("pinned"), h("div", { class: "table-scroll" }, h("table", { class: "data" },
      h("thead", null, h("tr", null, head.map((x) => h("th", { scope: "col", text: x })))),
      h("tbody", null, d.pinned.map((/** @type {any} */ p) => h("tr", null,
        h("th", { scope: "row" }, openBtn(p.id, p.name, { view: "catalog" })),
        h("td", { class: "num", text: p.score === null ? `unknown (${num(p.lo, 2)} to ${num(p.hi, 2)})` : fmt(p.score) }),
        p.scores.map((/** @type {string} */ v) => h("td", { class: "num", text: v })),
        h("td", { text: p.conf }), h("td", { text: p.consistency }), h("td", { text: p.level }), h("td", { text: p.effort.join("/") }),
        h("td", { text: p.formal ? p.decl : "no" }), h("td", null, hypothesesOf(p.i)),
        h("td", null, h("button", { type: "button", onclick: () => togglePin(p.id), text: "Unpin" }))))))));
  }

  /* ---------- connections ---------- */

  function renderConnections(/** @type {any} */ state, /** @type {any} */ d) {
    const s = d.selected;
    const pick = $("pick");
    if (document.activeElement !== pick) pick.value = s.name;
    const p = s.path;
    const target = p.steps[p.steps.length - 1];
    put($("path"), 
      h("p", { class: "note", text: `The path to ${s.name} at the ${state.depth} depth: each prerequisite comes before the results that need it. It stops at results you know (${p.knownStops.length}). ${p.supported} edges have a formal reference in mathlib (supported); ${p.uncertain} are judged only (uncertain). This is not a guaranteed curriculum, and it gives no minimum study time.` }),
      p.cycles.length ? h("p", { class: "callout", text: `Cycle in the judged prerequisites: ${p.cycles.map((/** @type {string[]} */ c) => c.map((id) => IX.rows[rowOf(id)].n).join(" and ")).join("; ")}. The path keeps every result of the cycle; study them together.` }) : null,
      h("ol", { class: "path" }, p.steps.map((/** @type {any} */ st) => h("li", { class: st === target ? "target" : null },
        openBtn(st.id, st.name), ` (${Model.LEVEL_NAMES[Model.LEVELS.indexOf(st.level)]} level, ${Model.bandLabel(st.band)}${st.cycle ? ", in a prerequisite cycle" : ""}) `,
        st.id in known ? h("span", { class: "note", text: "known" }) : h("button", { type: "button", onclick: () => setKnown(st.id, Model.DEPTHS.indexOf(state.depth)), text: "I know it" })))),
      p.knownStops.length ? h("p", { class: "note" }, "Known prerequisites (the path stops here): ", p.knownStops.map((/** @type {string} */ id, /** @type {number} */ j) => [j ? ", " : "", openBtn(id)])) : null,
      DET[s.i].cn.length ? h("p", { class: "note", text: `Prerequisite concepts that are not catalog results: ${DET[s.i].cn.join(", ")}.` }) : null);
    drawGraph(s);
    put($("relations"), h("h3", { text: `Relations of ${s.name}` }), relationList(s.relations));
  }

  /** A radial graph: the selected result in the middle, related results around it, grouped by relation type. @param {any} s */
  function drawGraph(s) {
    const g = $("graph");
    const W = 420, C = W / 2, R = 120;
    const items = Model.REL_ORDER.flatMap((t) => (s.relations[t]?.items ?? []).slice(0, 6).map((/** @type {any} */ e) => ({ ...e, type: t })));
    const all = new Set(Model.REL_ORDER.flatMap((t) => (s.relations[t]?.items ?? []).map((/** @type {any} */ e) => e.other)));
    const seen = new Set();
    const shown = items.filter((e) => !seen.has(e.other) && seen.add(e.other)).slice(0, 36);
    const kids = [];
    shown.forEach((e, k) => {
      const ang = (2 * Math.PI * k) / Math.max(1, shown.length) - Math.PI / 2;
      const x = C + R * Math.cos(ang), y = C + R * Math.sin(ang);
      const formalRel = e.type === "proof-dependency" || e.type === "signature-reference";
      kids.push(svg("line", { class: formalRel ? "edge formal" : e.type === "prerequisite" ? "edge pre" : "edge", x1: C, y1: C, x2: x.toFixed(1), y2: y.toFixed(1) }));
      const node = svg("g", { class: "node", tabindex: 0, role: "button", "aria-label": `${e.phrase} ${e.name}` });
      node.append(svg("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 5 }), svg("text", { x: (x + (Math.cos(ang) >= 0 ? 8 : -8)).toFixed(1), y: (y + 4).toFixed(1), "text-anchor": Math.cos(ang) >= 0 ? "start" : "end" }, e.name.length > 20 ? `${e.name.slice(0, 19)}…` : e.name));
      const go = () => app.set({ sel: e.other });
      node.addEventListener("click", go);
      node.addEventListener("keydown", (/** @type {KeyboardEvent} */ ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } });
      kids.push(node);
    });
    kids.push(svg("circle", { class: "hl", cx: C, cy: C, r: 8 }), svg("text", { class: "direct-label", x: C, y: C + 24, "text-anchor": "middle" }, s.name.slice(0, 32)));
    kids.push(svg("text", { class: "tick", x: 6, y: W - 8 }, shown.length < all.size ? `${shown.length} of ${all.size} shown` : `${shown.length} related`));
    kids.push(svg("text", { class: "tick", x: W - 6, y: W - 8, "text-anchor": "end" }, "thick: formal; dashed: prerequisite"));
    put(g, ...kids);
  }

  /* ---------- fields over time ---------- */

  function renderFields(/** @type {any} */ state, /** @type {any} */ d) {
    const f = d.fields;
    const parts = [h("h3", { text: f.label }), h("p", { class: "note", text: `Unit: ${f.unit}. ${f.basis} ${f.tags}` }),
      h("p", { class: "note", text: `Taxonomy ${D.snapshot.taxonomy_version}; classification by the judge under ${D.rubric.version} and the use rule te-use-rule/1. A share change describes this evidence corpus, not a proven change in mathematical importance.` })];
    if (f.note) parts.push(h("p", { class: "callout", text: f.note }));
    if (f.years && f.counts) {
      parts.push(h("p", { class: "note", text: `Records without a year: ${f.undated} (totalled apart, not in any year). Years with no record show no data, not 0%.` }));
      parts.push(heatmap(f), markers());
      const rows = f.years.map((/** @type {number} */ y, /** @type {number} */ j) => [String(y), String(num(f.total[j], 2)), ...f.keys.map((/** @type {string} */ _k, /** @type {number} */ c) => (f.shares[j] ? `${num(f.shares[j][c], 1)}% (${num(f.counts[j][c], 2)})` : "no data"))]);
      parts.push(h("details", null, h("summary", { text: "Table: share (and count) per year" }), table(["Year", "Total", ...f.keys], rows)));
    } else if (f.bars) {
      parts.push(h("p", { class: "note", text: f.note ?? "" }));
      parts.push(table(["Category", "Named results", "Linked to mathlib", "Formal share", "Direct dependents of the linked declarations"], f.bars.map((/** @type {any} */ b) => [b.key, num(b.results, 2), num(b.formal, 2), b.share === null ? "no data" : `${b.share}%`, num(b.dependents, 2)])));
    } else if (f.steps) {
      if (f.steps.length) {
        parts.push(stepChart(f));
        parts.push(table(["Year", "Best guarantee", "From"], f.steps.map((/** @type {any} */ s) => [String(s.year), s.text, s.by])));
      }
      parts.push(h("p", { class: "note", text: `Without a dated original publication (not on the timeline): ${f.undatedEntries.join(", ") || "none"}.` }));
      parts.push(h("label", { class: "field" }, "Comparison case ", h("select", { onchange: (/** @type {Event} */ e) => app.set({ cmp: /** @type {HTMLSelectElement} */ (e.target).value }) },
        (Model.FIELDS.cmp.values ?? []).map((/** @type {string} */ v) => h("option", { value: v, selected: v === state.cmp, text: v })))));
    } else if (f.changes) {
      parts.push(table(["Result", "First assessment", "Second assessment", "Changed components", "Consistency"], f.changes.map((/** @type {any} */ c) => [openBtn(c.id, c.name, { view: "catalog" }), c.first, c.second, c.components.join(", ") || "none", c.consistency])));
      parts.push(h("p", { class: "note", text: f.note }));
    }
    put($("history"), ...parts);
  }

  /** Shares per year as a grid (one hue, darker is larger), with absolute totals above. @param {any} f */
  function heatmap(f) {
    const box = $("history");
    const W = Math.max(300, Math.round(box.getBoundingClientRect().width) || 640);
    const L = 110, top = 70, cellH = 22, H = top + cellH * f.keys.length + 24;
    const cw = (W - L - 8) / f.years.length;
    const out = svg("svg", { class: "chart heat", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${f.label} per year and category; the table below gives the same values` });
    const maxT = Math.max(1, ...f.total);
    out.append(svg("text", { class: "axis-title", x: 0, y: 12 }, `Total per year (max ${num(maxT, 0)})`));
    f.years.forEach((/** @type {number} */ y, /** @type {number} */ j) => {
      const x = L + j * cw;
      const bh = (f.total[j] / maxT) * 44;
      out.append(svg("rect", { class: "bar", x: (x + 1).toFixed(1), y: (top - 6 - bh).toFixed(1), width: Math.max(1, cw - 2).toFixed(1), height: bh.toFixed(1) }));
      if (j % Math.ceil(f.years.length / 8) === 0 || j === f.years.length - 1) out.append(svg("text", { class: "tick", x: (x + cw / 2).toFixed(1), y: H - 6, "text-anchor": "middle" }, String(y)));
      f.keys.forEach((/** @type {string} */ _k, /** @type {number} */ c) => {
        const share = f.shares[j]?.[c];
        const cell = svg("rect", { class: share === undefined || share === null ? "cell nodata" : "cell", x: (x + 0.5).toFixed(1), y: top + c * cellH + 1, width: Math.max(1, cw - 1).toFixed(1), height: cellH - 2 });
        if (share !== undefined && share !== null) cell.setAttribute("fill-opacity", String(Math.min(1, 0.06 + share / 60)));
        cell.append(svg("title", {}, `${y}, ${f.keys[c]}: ${share === null || share === undefined ? "no data" : `${share}% (${num(f.counts[j][c], 2)})`}`));
        out.append(cell);
      });
    });
    f.keys.forEach((/** @type {string} */ k, /** @type {number} */ c) => out.append(svg("text", { class: "tick", x: L - 6, y: top + c * cellH + 15, "text-anchor": "end" }, k.slice(0, 16))));
    return out;
  }

  /** The source and taxonomy changes on the timeline (spec section 10.5). */
  function markers() {
    const s = D.sources;
    return h("ul", { class: "marks" },
      h("li", { text: `TheoremSearch dataset revision ${String(s.theoremsearch.revision).slice(0, 12)} (${s.theoremsearch.last_modified}): the only source of use records and paper activity. Coverage before about 2000 is thin, so early shares rest on few papers.` }),
      h("li", { text: `arXiv taxonomy ${s.taxonomy.version}: one fixed taxonomy applied to every year (retrospective classification). Aliases such as cs.NA to math.NA are resolved first.` }),
      h("li", { text: `mathlib ${String(s.mathlib.commit).slice(0, 12)} and nLab ${String(s.nlab.commit).slice(0, 12)}: one snapshot, with no earlier snapshot to compare. Later snapshots add their source changes here.` }));
  }

  /** The capability step chart, log scale. @param {any} f */
  function stepChart(f) {
    const W = 640, H = 220, P = { l: 56, r: 16, t: 16, b: 28 };
    const vals = f.steps.map((/** @type {any} */ s) => s.value).filter((/** @type {number} */ v) => v > 0);
    if (!vals.length) return null;
    const y0 = f.steps[0].year, y1 = Math.max(y0 + 1, f.steps[f.steps.length - 1].year + 5);
    const lo = Math.floor(Math.log10(Math.min(...vals))), hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(...vals))));
    const X = (/** @type {number} */ y) => P.l + ((y - y0) / (y1 - y0)) * (W - P.l - P.r);
    const Y = (/** @type {number} */ v) => P.t + (1 - (Math.log10(v) - lo) / (hi - lo)) * (H - P.t - P.b);
    let d = "";
    f.steps.forEach((/** @type {any} */ s, /** @type {number} */ k) => { d += k ? `H${X(s.year).toFixed(1)}V${Y(s.value).toFixed(1)}` : `M${X(s.year).toFixed(1)} ${Y(s.value).toFixed(1)}`; });
    d += `H${X(y1).toFixed(1)}`;
    const out = svg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Best calculated guarantee by year, log scale; the table gives the same values` });
    const tick = svg("g", { class: "tick" });
    for (let p = lo; p <= hi; p++) tick.append(svg("text", { x: P.l - 6, y: Y(10 ** p) + 4, "text-anchor": "end" }, `1e${p}`));
    tick.append(svg("text", { x: P.l, y: H - 8 }, String(y0)), svg("text", { x: W - P.r, y: H - 8, "text-anchor": "end" }, String(y1)));
    out.append(tick, svg("path", { class: "series", d }));
    for (const s of f.steps) out.append(svg("text", { class: "direct-label", x: X(s.year) + 4, y: Y(s.value) - 6 }, `${s.year}: ${s.text}`));
    return out;
  }

  /* ---------- about ---------- */

  let aboutDrawn = "";
  function renderAbout(/** @type {any} */ state, /** @type {any} */ d) {
    const key = d.weights.join(",");
    if (aboutDrawn === key) return;
    aboutDrawn = key;
    const s = D.snapshot, cov = D.coverage;
    const R = D.rubric;
    const sources = Object.entries(D.sources).map(([k, v]) => {
      const val = /** @type {any} */ (v);
      const version = val.commit ?? val.revision ?? val.version ?? val.rule ?? "";
      return [k, String(version), val.retrieved ?? val.last_modified ?? val.date ?? "", val.reuse ?? val.licence ?? val.license ?? ""];
    });
    put($("about"), 
      h("h3", { text: "Snapshot" }),
      dl([["Snapshot", s.id], ["Generated", s.generated_at], ["Evidence cutoff (source freshness)", s.evidence_cutoff], ["Schema", s.schema_version], ["Rubric", s.rubric_version],
        ["Judge prompt", s.prompt_version], ["Taxonomy", `${s.taxonomy_version} (${s.taxonomy_source})`], ["Source manifest", s.source_manifest], ["Coverage report", s.coverage_report],
        ["Judge", `${s.judge.model}, ${s.judge.provider}: ${s.judge.access}`], ["Rules", s.rules.join(", ")],
        ["Previous snapshot", s.previous ?? "none: this is the first snapshot"], ["Identity map", `${s.identity_map.length} changed identities`]]),
      h("p", { class: "note", text: "The page never refreshes its sources. A refresh is a new snapshot: run python3 viz/theorem-explorer/pipeline/run.py (see AGENTS.md). It keeps the previous snapshot and writes a change report split into source, measurement, judge, rubric and identity changes." }),
      h("h3", { text: "Sources" }),
      table(["Source", "Version", "Retrieved", "Reuse terms"], sources),
      h("h3", { text: "Coverage" }),
      table(["Result type", "Records", "Scored", "Unscored"], cov.named.by_type.map((/** @type {any} */ t) => [t.type, String(t.records), String(t.scored), String(t.records - t.scored)])),
      h("p", { class: "note", text: `${cov.named.records} named records: ${cov.named.scored} scored, ${cov.named.unscored} not results (definitions, topics, open problems), kept but not scored. ${cov.named.second_assessment} have a second assessment. mathlib: ${cov.formal.theorems.toLocaleString("en")} kept theorems, ${cov.formal.linked_to_named} linked to named results, ${cov.formal.unnamed_unscored.toLocaleString("en")} unnamed and unscored (shown in the full build, hidden by default). ${cov.formal.constants.toLocaleString("en")} constants were read; exclusions: ${Object.entries(cov.formal.exclusions).map(([k, v]) => `${k} ${v}`).join(", ")}. sorry in the pinned library: ${cov.formal.sorry}.` }),
      h("p", { class: "note", text: `Use records: ${cov.uses["use records"]} (from ${cov.uses.papers.toLocaleString("en")} papers and ${cov.uses.statements.toLocaleString("en")} statements in the dataset; ${cov.uses["papers without year"]} papers have no year). Candidate names: ${cov.candidates}, ${cov.candidate_links} kept as uncertain identities. Prerequisite cycles: ${cov.prerequisite_cycles}.` }),
      h("h3", { text: "Rubric" }),
      h("p", { text: R.aggregate }),
      table(["Component", "Question", "Anchor 0", "Anchor 2", "Anchor 4", ...R.presets.map((/** @type {any} */ p) => p.name)],
        R.components.map((/** @type {any} */ c, /** @type {number} */ j) => [c.name, c.question, c.anchors["0"], c.anchors["2"], c.anchors["4"], ...R.presets.map((/** @type {any} */ p) => String(p.weights[j]))])),
      h("p", { class: "note", text: `${R.scale.odd} u: ${R.scale.u}. na: ${R.scale.na}.` }),
      dl([["High confidence", R.confidence.high], ["Medium confidence", R.confidence.medium], ["Low confidence", R.confidence.low], ["Note", R.confidence.note],
        ["Case set", `${R.case_set.id}: ${R.case_set.rule}`], ["Warning", R.case_set.warning]]),
      h("h3", { text: "Calibration cases" }),
      table(["Result", "Scores", "Second", "Aggregate (active weights)", "Confidence"], ["nm:union-bound", "nm:pigeonhole-principle", "wd:Q4975963", "wd:Q755991"].map((id) => {
        const i = rowOf(id), r = IX.rows[i];
        return [openBtn(id, r.n, { view: "catalog" }), r.s, r.s2 ?? "none", fmt(d.weightsOk ? Model.aggregate(IX.scores[i], d.weights).v : null), r.c];
      })),
      h("p", { class: "note", text: "The union bound and the pigeonhole principle test reusable tools, proof simplicity and application effort; Brown representability and Atiyah-Singer test structural significance and research influence. Their ranks are not fixed in advance. They test the rubric, not a universal benchmark." }),
      h("h3", { text: "Rank sensitivity to the second assessment" }),
      table(["Result", "First", "Second", "Rank (first)", "Rank (second)", "Shift", "Consistency"], d.sensitivity.slice(0, 20).map((/** @type {any} */ e) => [openBtn(e.id, e.name, { view: "catalog" }), fmt(e.first), fmt(e.second), String(e.rank1 ?? "unknown"), String(e.rank2 ?? "unknown"), String(e.shift ?? "unknown"), e.consistency])),
      h("p", { class: "note", text: `The ${d.sensitivity.length} results with two assessments, largest rank shift first (20 shown). The rank of the second assessment is among the first assessments of all other results.` }),
      h("h3", { text: "Learning rules" }), learnRules(),
      h("h3", { text: "Search" }), h("p", { text: Model.SEARCH_HELP }),
    );
  }

  function learnRules() {
    return h("dl", { class: "rules" }, Object.entries(Model.LEARN_RULES).filter(([k]) => k !== "weights").map(([k, v]) => [h("dt", { text: k.replace("_", " ") }), h("dd", { text: String(v) })]));
  }

  /* ---------- render ---------- */

  /** @param {Record<string, any>} state @param {any} d */
  function render(state, d) {
    renderCommon(state, d);
    if (state.view === "learn") renderLearn(state, d);
    if (state.view === "catalog") renderCatalog(state, d);
    if (state.view === "compare") renderCompare(state, d);
    if (state.view === "connections") renderConnections(state, d);
    if (state.view === "fields") renderFields(state, d);
    if (state.view === "about") renderAbout(state, d);
    if (["learn", "catalog", "connections"].includes(state.view)) renderResult(state, d);
    if (app) storeProfile();
    typesetProse();
  }

  /* ---------- exports ---------- */

  function saveResultJson() {
    const doc = Model.exportJson(app.state, app.derived, D);
    save(`${Model.SLUG}-results.json`, `${JSON.stringify(doc, null, 2)}\n`, "application/json");
  }

  /* ---------- WebMCP tools ---------- */

  /** @param {any} value */
  const out = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
  /** @param {string} id */
  function resultRecord(id) {
    const i = rowOf(Model.migrate(D, id));
    if (i < 0) return { error: `unknown result id ${id}` };
    const st = { ...app.state, sel: IX.rows[i].id };
    const d = Model.derive(st, D);
    const x = DET[i];
    const { path, relations, ...sel } = d.selected;
    return { ...sel, aliases: x.al, explanation: x.why, statement: { conclusion: x.concl, hypotheses: x.hyps, typeclasses: x.cls, declaration: x.sig }, sources: x.evs.filter((/** @type {any} */ e) => e.kind === "source statement").map((/** @type {any} */ e) => ({ claim: e.claim, url: e.url, revision: e.revision })), relationCounts: Object.fromEntries(Object.entries(relations).map(([k, v]) => [k, /** @type {any} */ (v).count])) };
  }

  /** The domain's read-only WebMCP tools; the kit adds get_metadata, get_state and get_markdown. @type {KitTool[]} */
  const tools = [
    { name: "get_result", description: "Return one result: scores (0-4, u unknown, na not applicable), the aggregate under the current weights, measurements, statement, sources and relation counts.",
      inputSchema: { type: "object", properties: { id: { type: "string", description: "A result id such as wd:Q755991 or nm:union-bound" } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ id?: string }} */ input = {}) => out(resultRecord(String(input.id ?? ""))) },
    { name: "search_results", description: "Search the catalog offline (every word must match the name, aliases, concepts, Lean name, type or categories). Returns ids, names and aggregates in the current sort order.",
      inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: ["query"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ query?: string, limit?: number }} */ input = {}) => {
        const d = Model.derive({ ...app.state, q: String(input.query ?? "").slice(0, 200), rtype: "all" }, D);
        return out({ count: d.order.length, results: d.order.slice(0, input.limit ?? 20).map((/** @type {number} */ i) => ({ id: IX.rows[i].id, name: IX.rows[i].n, type: IX.rows[i].t, score: d.weightsOk ? Model.aggregate(IX.scores[i], d.weights).v : null })) });
      } },
    { name: "get_recommendations", description: "Return the learn-next recommendations for the current profile (interests, depth, reader level, budget, known results), with the priority components.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => out(app.derived.learn) },
    { name: "get_learning_path", description: "Return the prerequisite path to a result, with cycles and the count of supported and uncertain edges.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ id?: string }} */ input = {}) => {
        const i = rowOf(Model.migrate(D, String(input.id ?? "")));
        if (i < 0) return out({ error: "unknown result id" });
        return out(Model.derive({ ...app.state, sel: IX.rows[i].id }, D).selected.path);
      } },
    { name: "get_comparison", description: "Return one comparison case with its calculated guarantees, ranks, exclusions and reference value.",
      inputSchema: { type: "object", properties: { id: { type: "string", enum: Model.FIELDS.cmp.values } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ id?: string }} */ input = {}) => out(Model.comparison(D, IX, String(input.id), app.derived.weights)) },
    { name: "get_field_series", description: "Return one history series (shares and counts per year, or bars or steps) for a history view, category kind, taxonomy level and mode.",
      inputSchema: { type: "object", properties: { view: { type: "string", enum: Model.FIELDS.fview.values }, by: { type: "string", enum: Model.FIELDS.fby.values }, level: { type: "string", enum: Model.FIELDS.flevel.values }, mode: { type: "string", enum: Model.FIELDS.mode.values } }, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {Record<string, string>} */ input = {}) => {
        const st = VisualKit.normalize(Model.FIELDS, { ...app.state, fview: input.view ?? app.state.fview, fby: input.by ?? app.state.fby, flevel: input.level ?? app.state.flevel, mode: input.mode ?? app.state.mode }).state;
        return out(Model.history(st, D, IX, IX.scores.map((/** @type {number[]} */ sc) => Model.aggregate(sc, Model.weightsOf(st)))));
      } },
  ];

  /* ---------- start ---------- */

  app = VisualKit.start({
    slug: Model.SLUG,
    title: document.title,
    summary: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    schemaVersion: Model.SCHEMA_VERSION,
    fields: Model.FIELDS,
    derive: (state) => Model.derive(state, D),
    render,
    report: (state, d) => Report.report(state, d, D),
    tools,
    commands: [
      ...Model.EXAMPLES.map((/** @type {KitExample} */ e) => ({ label: `Example: ${e.label}`, run: () => app.set(e.state) })),
      ...(Model.FIELDS.view.values ?? []).map((/** @type {string} */ v) => ({ label: `View: ${v}`, run: () => app.set({ view: v }) })),
      { label: "Save table CSV", run: () => save(`${Model.SLUG}-table.csv`, Model.csv(app.state, app.derived, D), "text/csv") },
      { label: "Save selected results JSON", run: saveResultJson },
      { label: "Save profile JSON", run: () => save(`${Model.SLUG}-profile.json`, `${JSON.stringify(Model.profileOf(app.state, D), null, 2)}\n`, "application/json") },
    ],
    bind(a) {
      app = a;
      for (const b of document.querySelectorAll("[data-example]")) {
        const ex = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === b.getAttribute("data-example"));
        if (ex) b.addEventListener("click", () => a.set(ex.state));
      }
      // Text fields whose empty value means "no filter": the kit ignores "", so they are bound here.
      /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
      $("q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => a.set({ q: $("q").value.slice(0, 200) }, "replace"), 200); });
      $("q").addEventListener("change", () => a.set({ q: $("q").value.slice(0, 200) }));
      $("interests").addEventListener("change", () => a.set({ interests: $("interests").value.slice(0, 200) }));
      // Taxonomy selects, filled from the pinned taxonomy.
      const opts = (/** @type {any[][]} */ list, /** @type {string} */ any) => [h("option", { value: "", text: any }), ...list.map((x) => h("option", { value: x[0], text: `${x[0]}: ${x[1]}` }))];
      put($("f-grp"), ...opts(TAX.groups, "Any group"));
      put($("f-arch"), ...opts(TAX.archives, "Any archive"));
      put($("f-cat"), ...opts(TAX.categories, "Any category"));
      put($("f-acat"), ...opts(TAX.categories, "Any application category"));
      for (const key of ["grp", "arch", "cat", "acat"]) $(`f-${key}`).addEventListener("change", (/** @type {Event} */ e) => a.set({ [key]: /** @type {HTMLSelectElement} */ (e.target).value }));
      put($("taxonomy-ids"), ...[...TAX.groups, ...TAX.archives, ...TAX.categories].map((x) => h("option", { value: x[0], text: x[1] })));
      put($("result-names"), ...IX.rows.map((/** @type {any} */ r) => h("option", { value: r.n })));
      $("pick").addEventListener("change", () => {
        const name = $("pick").value.trim().toLowerCase();
        const i = IX.rows.findIndex((/** @type {any} */ r) => r.n.toLowerCase() === name || r.id.toLowerCase() === name);
        if (i >= 0) a.set({ sel: IX.rows[i].id });
        else tell(`No result is named "${$("pick").value.slice(0, 60)}". Choose a name from the list.`);
      });
      $("clear-filters").addEventListener("click", () => a.set(Object.fromEntries(Model.FIELDS && ["q", "rtype", "grp", "arch", "cat", "acat", "level", "formal", "source", "ev", "cons", "min_hyp", "min_pro", "min_app", "y0", "y1", "incase", "known"].map((k) => [k, Model.FIELDS[k].default]))));
      put($("col-boxes"), ...Model.COLUMNS.map((/** @type {string} */ c) => h("label", null, h("input", { type: "checkbox", value: c, onchange: () => {
        const on = [...document.querySelectorAll("#col-boxes input")].filter((x) => /** @type {HTMLInputElement} */ (x).checked).map((x) => /** @type {HTMLInputElement} */ (x).value);
        a.set({ cols: on.join(",") });
      } }), ` ${COMPONENT_TITLES[c] ?? COLS[c].label}`)));
      $("table-wrap").addEventListener("scroll", () => { cancelAnimationFrame(tableFrame); tableFrame = requestAnimationFrame(drawRows); });
      $("search-help").textContent = Model.SEARCH_HELP;
      put($("learn-rules"), ...learnRules().childNodes);
      $("save-csv").addEventListener("click", () => save(`${Model.SLUG}-table.csv`, Model.csv(a.state, a.derived, D), "text/csv"));
      $("copy-csv").addEventListener("click", () => copy(Model.csv(a.state, a.derived, D), "Copied the table CSV."));
      $("save-profile").addEventListener("click", () => save(`${Model.SLUG}-profile.json`, `${JSON.stringify(Model.profileOf(a.state, D), null, 2)}\n`, "application/json"));
      $("reset-known").addEventListener("click", () => { known = {}; unresolvedIds = []; D.profile = { known }; storeProfile(); a.set({}, "replace"); $("profile-status").textContent = "Cleared the known results."; });
      const file = $("load-profile");
      file.addEventListener("change", async () => {
        const chosen = file.files?.[0];
        if (!chosen) return;
        try {
          const p = Model.readProfile(await chosen.text(), D);
          known = p.known;
          unresolvedIds = p.unresolved;
          D.profile = { known };
          a.set(p.state);
          tell(`Loaded ${chosen.name}: ${Object.keys(p.known).length} known results${p.migrated ? ` (from snapshot ${p.from}, through the identity map)` : ""}${p.unresolved.length ? `; ${p.unresolved.length} identities not in this snapshot` : ""}.`);
        } catch (e) {
          tell(`${chosen.name} was not loaded: ${e instanceof Error ? e.message : String(e)}`);
        }
        file.value = "";
      });
      setupFormal();
      $("deck-fallback").addEventListener("toggle", () => {
        if (!$("deck-fallback").open) return;
        try { $("deck-text").value = a.deck(); } catch (e) { $("deck-text").value = `The deck could not be written: ${String(e)}`; }
      });
    },
  });

  // Offer the view of the last visit only when it differs from the view this link opened.
  const restore = $("restore-view");
  if (savedView && savedView !== app.json()) {
    restore.hidden = false;
    restore.addEventListener("click", () => {
      try {
        app.load(VisualKit.fromJson(app.spec, savedView), "push");
        tell("Restored the view of your last visit.");
      } catch (e) {
        tell(`The saved view was not restored: ${e instanceof Error ? e.message : String(e)}`);
      }
      restore.hidden = true;
    });
  }
})();
