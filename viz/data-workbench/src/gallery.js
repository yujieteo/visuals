/* Universal Data Workbench: the charts of each table, the gallery and the full-size view with its edits.
 *
 * After a table is profiled, every candidate of grammar v1 (src/grammar.js) gets a specification
 * (src/chartspec.js), is validated, computed with the engine (src/charts.js) and drawn (src/render.js), one after
 * another with progress and Cancel. Each ends with an outcome: valid, excluded (a rule and its reason), failed (an
 * error) or incomplete (cancelled, or beyond the 10,000 candidate cap, or the memory budget). Completed candidates
 * are kept when a run stops, and an unchanged candidate is not computed again when a column's reading changes.
 *
 * The gallery shows the valid figures of the selected table as pictures; the full-size view draws one figure as
 * SVG and lets the person change its fields, transformations, labels, scales and layout, and add facets. Every
 * change is validated before it is drawn and recorded in the specification and in the conversion log. The
 * full-size view draws the figure by the publication preset (src/publish.js), with its checks and its files.
 */
(function (root, factory) {
  root.DWGallery = factory(root.DWGrammar, root.DWChartSpec, root.DWCharts, root.DWRender, root.DWRank);
})(typeof self !== "undefined" ? self : this, function (Grammar, ChartSpec, Charts, Render, Rank) {
  "use strict";

  const PAGE = 24;
  /* A drawn figure is kept for the gallery when it is small and the figures kept so far stay within 64 MB; any other
   * is drawn again from the engine when it is shown. */
  const KEEP_SVG = 300000;
  const KEEP_ALL = 64 * 2 ** 20;

  /**
   * Mount the charts on the page. `app` gives what the page shares: its store, h(), busy(), exclusive(),
   * progress(), refresh(), ensureEngine(), note(), message(), the engine's error tests, formatting and byId().
   * @param {any} app
   */
  function mount(app) {
    const { store, h, byId, fmtInt, plural } = app;
    /** @type {Map<string, any>} the chart state of each table, by table name */
    const charts = new Map();
    /** @type {Map<string, any[]>} saved edited charts of a reopened table, until its first generation */
    const seeds = new Map();
    /** @type {Map<string, string>} picture URLs of drawn figures, by candidate id and version */
    const pictures = new Map();
    const viewer = { table: "", id: "", page: 1, zoom: "fit", error: "", busy: false, size: { width: 0, height: 0 }, drawing: 0 };
    /** @type {{ key: string, data: any } | null} the computed data of the chart open full size */
    let shownData = null;
    /** @type {Set<string>} pictures being drawn again, so a redraw does not ask twice */
    const drawing = new Set();
    /** @type {string[]} picture URLs no longer current, released once the gallery no longer shows them */
    const stale = [];
    let kept = 0;
    /** The SVG to keep with a candidate, within the limits. */
    const keep = (svg) => {
      if (svg.length > KEEP_SVG || kept + svg.length > KEEP_ALL) return null;
      kept += svg.length;
      return svg;
    };

    const stateOf = (name) => charts.get(name);
    const now = () => performance.now();

    /* ---------- generation ---------- */

    /** The profiles a table's grammar reads: every profiled column, and the ones not profiled marked so. */
    function columnsOf(table) {
      const all = table.imported.columns.filter((c) => c.name !== table.imported.rowColumn);
      return all.map((c, i) => table.columns.find((p) => p.name === c.name) ?? { name: c.name, position: i, notProfiled: true });
    }

    /** Whether the person marked a field additive. */
    const additiveOf = (table) => Object.fromEntries(Object.entries(store.additive).filter(([k]) => k.startsWith(`${table.name}\u0000`)).map(([k, v]) => [k.split("\u0000")[1], v]));

    /** What makes a candidate's figure: the fields as read, the table's rows and sample. A change means compute again. */
    function signature(cand, ctx) {
      return JSON.stringify([cand.kind, cand.fields.map((f) => {
        const i = ctx.fields[f];
        return [i.cls, i.levels, i.reading, i.type, i.precision, i.logRule, i.min, i.zone, i.ordered, i.unit, i.additive];
      }), ctx.rows, ctx.sample]);
    }

    /**
     * Generate (or bring up to date) the charts of a table, as one piece of work with progress and Cancel; then, unless
     * it was cancelled, the page's next step for the table (its statistics and ranking).
     */
    function generate(table) {
      return app.busy(`Charts of ${table.name}`, () => generateNow(table)).then(() => {
        if (!store.stop && stateOf(table.name)) app.charted?.(table);
      });
    }

    async function generateNow(table) {
      if (!app.store.tables.includes(table)) return;
      const api = await app.ensureEngine();
      const { classes, plan, ctx } = Charts.prepare({ name: table.name, rowColumn: table.imported.rowColumn, rows: table.imported.rows, sample: table.sample,
        columns: columnsOf(table), additive: additiveOf(table), records: table.lineage ?? [] });
      const st = stateOf(table.name) ?? { filter: { kind: "all", outcome: "valid" }, shown: PAGE, candidates: seeds.get(table.name) ?? [] };
      seeds.delete(table.name);
      const old = new Map(st.candidates.map((c) => [c.id, c]));
      st.candidates = plan.candidates.map((c) => {
        const sig = signature(c, ctx);
        const prev = old.get(c.id);
        if (prev && !prev.edited && prev.sig === sig && (prev.outcome === "valid" || prev.outcome === "excluded")) return prev;
        if (prev) forget(prev);
        // Every candidate holds a specification from the start, so an open view can always show its form.
        const fresh = { ...c, sig, outcome: "pending", reason: "", spec: ChartSpec.make(c, ctx), edited: false, svg: null, version: (prev?.version ?? 0) + 1, desc: "" };
        if (prev?.edited) {
          const v = ChartSpec.validate(prev.spec, ctx);
          if (v.ok) Object.assign(fresh, { spec: prev.spec, edited: true });
          else app.note({ kind: "chart", table: table.name, text: `Your edits to the chart ${c.id} no longer hold (${v.errors[0]}), so it is drawn as generated.` });
        }
        return fresh;
      });
      for (const [id, prev] of old) if (!st.candidates.some((c) => c.id === id)) forget(prev);
      // The first run of a table is timed from the start of its import: the time to first figures a person waits.
      Object.assign(st, { plan, classes, ctx, status: "generating", reason: "", timing: { begun: st.timing ? null : table.begun ?? null, start: now(), first: null, done: null } });
      charts.set(table.name, st);
      // Figures kept from the last run show at once: they are the first figures of this one.
      if (st.candidates.some((c) => c.outcome === "valid")) st.timing.first = now();
      const todo = st.candidates.filter((c) => c.outcome === "pending");
      let done = 0, last = 0;
      for (const cand of todo) {
        if (store.stop) break;
        app.progress(`Charts of ${table.name}: ${fmtInt(done + 1)} of ${fmtInt(todo.length)} (${Render.KIND_LABEL[cand.kind].toLowerCase()} of ${cand.fields.join(", ")})`, done, todo.length);
        await computeOne(api, st, cand);
        done += 1;
        if (cand.outcome === "valid" && !st.timing.first) { st.timing.first = now(); app.refresh(); }
        if (now() - last > 400) { last = now(); app.refresh(); }
      }
      const left = st.candidates.filter((c) => c.outcome === "pending");
      for (const c of left) Object.assign(c, { outcome: "incomplete", reason: "Not computed: you cancelled before this candidate." });
      st.timing.done = now();
      const counts = Grammar.accounting(st.candidates, sum(plan.overflow));
      st.status = counts.incomplete ? "incomplete" : "complete";
      if (left.length) st.reason = "you cancelled";
      else if (sum(plan.overflow)) st.reason = `${fmtInt(sum(plan.overflow))} candidates beyond the cap of ${fmtInt(plan.max)}`;
      // An open full-size view shows the chart as regenerated.
      if (viewer.id && viewer.table === table.name && /** @type {HTMLDialogElement} */ (byId("viewer")).open) drawViewer();
      app.note({ kind: "charts", table: table.name, text: `Charts of ${table.name} (grammar v${Grammar.VERSION}): ${plural(counts.total, "candidate", "candidates")}; ${fmtInt(counts.valid)} valid, ${fmtInt(counts.excluded)} excluded, ${fmtInt(counts.failed)} failed, ${fmtInt(counts.incomplete)} incomplete${st.reason ? ` (${st.reason})` : ""}.` });
      app.refresh();
    }

    const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

    /** Validate, compute and draw one candidate, and record its outcome. */
    async function computeOne(api, st, cand) {
      const spec = cand.spec ?? ChartSpec.make(cand, st.ctx);
      cand.spec = spec;
      try {
        const r = await Charts.evaluate(api.query, spec, st.ctx);
        if (r.outcome !== "valid") return Object.assign(cand, { outcome: r.outcome, reason: r.reason });
        const out = r.drawn, data = r.data;
        forget(cand);
        Object.assign(cand, { outcome: "valid", reason: "", desc: out.desc, collisions: out.collisions, dropped: out.dropped, facts: data.facts, features: Rank.features(spec, data, out),
          pages: data.page?.pages ?? 1, svg: keep(out.svg), version: cand.version + 1 });
      } catch (error) {
        if (app.cancelled(error) || store.stop) return Object.assign(cand, { outcome: "pending" });
        if (app.outOfMemory(error)) return Object.assign(cand, { outcome: "incomplete", reason: "Resource limit: the engine reached its memory budget." });
        Object.assign(cand, { outcome: "failed", reason: app.message(error) });
      }
      return cand;
    }

    /** Drop a candidate's kept figure and picture. */
    function forget(cand) {
      if (cand.svg) { kept -= cand.svg.length; cand.svg = null; }
      const key = `${cand.id}@${cand.version}`;
      const url = pictures.get(key);
      if (url) { stale.push(url); pictures.delete(key); }
    }

    /** Forget a removed table's charts. */
    function drop(name) {
      const st = stateOf(name);
      if (st) for (const c of st.candidates) forget(c);
      charts.delete(name);
    }

    /** The SVG of a valid candidate: kept from its drawing, or computed and drawn again (large scatter plots). */
    async function svgOf(st, cand, spec = cand.spec) {
      if (spec === cand.spec && cand.svg) return cand.svg;
      const api = await app.ensureEngine();
      const data = await app.exclusive(() => Charts.compute(api.query, spec, st.ctx));
      if (data.excluded) throw new Error(data.excluded);
      return Render.render(spec, data).svg;
    }

    /** A picture URL of a candidate for the gallery, made once per version. */
    function pictureOf(st, cand, img) {
      const key = `${cand.id}@${cand.version}`;
      const url = pictures.get(key);
      if (url) { img.src = url; return; }
      const set = (svg) => {
        const made = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        pictures.set(key, made);
        img.src = made;
      };
      if (cand.svg) set(cand.svg);
      else if (!store.busy && !drawing.has(key)) {
        drawing.add(key);
        svgOf(st, cand).then(set, () => { img.alt = `${img.alt} (could not be drawn again)`; }).finally(() => drawing.delete(key));
      }
    }

    /* ---------- the gallery ---------- */

    const OUTCOMES = [["valid", "Valid"], ["excluded", "Excluded"], ["failed", "Failed"], ["incomplete", "Incomplete"], ["all", "All outcomes"]];

    function draw() {
      drawGallery();
      // The cards shown now use current pictures only, so the old ones can go.
      for (const url of stale.splice(0)) URL.revokeObjectURL(url);
    }

    function drawGallery() {
      const view = byId("charts-view");
      const table = store.tables.find((t) => t.name === store.selected);
      byId("charts-empty").hidden = !!table;
      if (!table) { view.replaceChildren(); return; }
      const st = stateOf(table.name);
      const head = h("div", { class: "table-head charts-head" }, h("h3", { text: `Charts of ${table.name}` }));
      if (store.tables.length > 1) {
        head.append(h("label", { class: "visually-hidden", for: "charts-table", text: "Table" }),
          h("select", { id: "charts-table", onchange: (ev) => { store.selected = ev.target.value; app.refresh(); } }, store.tables.map((t) => h("option", { value: t.name, selected: t.name === table.name, text: t.name }))));
      }
      if (table.sample) head.append(h("span", { class: "badge warn", text: `Sample: ${fmtInt(table.imported.rows)} rows, seed ${table.sample.seed}` }));
      const out = [head];
      if (!st) {
        const why = table.status === "profiling" ? "The charts are generated once every column is profiled." : table.status === "incomplete" ? "Profiling stopped before every column was profiled; the charts can use the profiled columns." : "The charts of this table are not generated yet.";
        out.push(h("p", { class: "note", text: why }));
        if (table.status !== "profiling") out.push(h("p", { class: "actions" }, h("button", { type: "button", class: "primary", disabled: !!store.busy, onclick: () => generate(table), text: "Generate the charts" })));
        view.replaceChildren(...out);
        return;
      }
      const counts = Grammar.accounting(st.candidates, sum(st.plan.overflow));
      const t = st.timing;
      const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
      out.push(h("p", { class: "accounting", "data-accounting": st.status },
        h("strong", { text: `${plural(counts.total, "candidate", "candidates")} of grammar v${Grammar.VERSION}: ` }),
        `${fmtInt(counts.valid)} valid, ${fmtInt(counts.excluded)} excluded, ${fmtInt(counts.failed)} failed, ${fmtInt(counts.incomplete)} incomplete`,
        counts.pending ? `, ${fmtInt(counts.pending)} still to compute` : "", ".",
        st.status === "generating" ? h("span", { class: "badge", text: "Generating…" }) : st.status === "complete" ? h("span", { class: "badge ok", text: "Complete" }) : h("span", { class: "badge warn", text: `Incomplete: ${st.reason}` })));
      if (t.first || t.done) {
        const from = t.begun ? "the start of the import" : "the start of this run";
        const zero = t.begun ?? t.start;
        out.push(h("p", { class: "note", "data-timing": "", text: `First figure ${t.first ? `${secs(t.first - zero)} after ${from}` : "not drawn yet"}${t.done ? `; every candidate after ${secs(t.done - zero)}` : ""}, on this device.` }));
      }
      // Only candidates that a new run can compute: those beyond the 10,000 cap stay incomplete whatever runs.
      const again = st.candidates.some((c) => c.outcome === "incomplete" || c.outcome === "failed" || c.outcome === "pending");
      if (again && !store.busy) out.push(h("p", { class: "actions" }, h("button", { type: "button", onclick: () => generate(table), text: "Generate the remaining charts" })));
      if (store.busy) out.push(h("p", { class: "actions" }, h("button", { type: "button", onclick: () => app.cancel(), text: "Cancel" }), h("span", { class: "note", text: ` ${store.busy.text}` })));
      out.push(scope(st));
      out.push(filters(table, st));
      out.push(gallery(table, st));
      out.push(others(st, counts));
      view.replaceChildren(...out);
    }

    /** The search scope: the formula with this table's counts, the classes of the fields and the exclusions. */
    function scope(st) {
      const { counts, formula } = st.plan;
      const terms = Grammar.KINDS.map((k) => `${Render.KIND_LABEL[k.id]} ${fmtInt(formula.terms[k.id])}`).join(", ");
      return h("details", { class: "scope", open: !!st.opened?.scope, ontoggle: (ev) => { st.opened = { ...st.opened, scope: ev.target.open }; } },
        h("summary", {}, `Search scope: q = ${counts.q} measures, c = ${counts.c} categories, t = ${counts.t} times, l = ${counts.l} labels`),
        h("p", {}, "Count per table: ", h("code", { text: formula.text }), ` = ${fmtInt(formula.total)}.`),
        h("p", { class: "note", text: `${terms}.` }),
        sum(st.plan.overflow) ? h("p", { class: "warn-text", text: `Only the first ${fmtInt(st.plan.max)} candidates are generated; ${fmtInt(sum(st.plan.overflow))} more are incomplete: ${Object.entries(st.plan.overflow).map(([k, n]) => `${fmtInt(n)} ${Render.KIND_LABEL[k].toLowerCase()}`).join(", ")}.` }) : null,
        h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": "Field classes, scrolls sideways" },
          h("table", { class: "grid" },
            h("thead", {}, h("tr", {}, ["Field", "Class", "Why"].map((x) => h("th", { scope: "col", text: x })))),
            h("tbody", {}, st.classes.map((f) => h("tr", {}, h("th", { scope: "row", text: f.name }), h("td", { text: Grammar.CLASS_LABEL[f.cls] }), h("td", { text: f.reason })))))),
        h("p", { class: "note" }, "Facets are a control of each chart (a category of at most 12 levels), never searched. Every rule: ", h("a", { href: "grammar.md", text: "grammar v1" }), "."));
    }

    function filters(table, st) {
      const kinds = [["all", "All kinds"], ...Grammar.KINDS.filter((k) => st.plan.byKind[k.id]).map((k) => [k.id, `${Render.KIND_LABEL[k.id]} (${st.plan.byKind[k.id]})`])];
      const set = (key) => (ev) => { st.filter[key] = ev.target.value; st.shown = PAGE; draw(); };
      return h("div", { class: "filters" },
        h("div", { class: "field" }, h("label", { for: "chart-kind", text: "Kind" }),
          h("select", { id: "chart-kind", onchange: set("kind") }, kinds.map(([v, l]) => h("option", { value: v, selected: st.filter.kind === v, text: l })))),
        h("div", { class: "field" }, h("label", { for: "chart-outcome", text: "Outcome" }),
          h("select", { id: "chart-outcome", onchange: set("outcome") }, OUTCOMES.map(([v, l]) => h("option", { value: v, selected: st.filter.outcome === v, text: l })))));
    }

    const matching = (st) => st.candidates.filter((c) => (st.filter.kind === "all" || c.kind === st.filter.kind) && (st.filter.outcome === "all" || c.outcome === st.filter.outcome));

    function gallery(table, st) {
      const list = matching(st);
      const shown = list.slice(0, st.shown);
      const items = shown.map((c) => {
        const label = `${Render.KIND_LABEL[c.kind]}: ${c.fields.join(", ")}`;
        if (c.outcome !== "valid") {
          return h("li", { class: "figure-card" }, h("p", { class: "figure-name" }, h("strong", { text: label })), h("p", { class: c.outcome === "failed" ? "warn-text" : "note", text: `${c.outcome[0].toUpperCase()}${c.outcome.slice(1)}: ${c.reason || "not computed yet"}` }));
        }
        const img = h("img", { alt: c.desc, loading: "lazy", width: "360", height: String(Math.round((360 * c.spec.layout.height) / c.spec.layout.width)) });
        pictureOf(st, c, img);
        const badges = [c.edited ? h("span", { class: "badge", text: "Edited" }) : null, table.sample || c.facts?.scatterSample ? h("span", { class: "badge warn", text: "Sample" }) : null];
        return h("li", { class: "figure-card" },
          h("button", { type: "button", class: "figure-open", "data-candidate": c.id, "aria-label": `Open full size: ${c.spec.annotation.title}`, onclick: () => open(table.name, c.id) },
            img, h("span", { class: "figure-name" }, h("strong", { text: c.spec.annotation.title }), h("span", { class: "note", text: ` ${Render.KIND_LABEL[c.kind]}` }), ...badges)));
      });
      const more = list.length > shown.length ? h("p", { class: "actions" }, h("button", { type: "button", onclick: () => { st.shown += PAGE; draw(); }, text: `Show ${Math.min(PAGE, list.length - shown.length)} more of ${fmtInt(list.length - shown.length)}` })) : null;
      return h("section", { "aria-label": "Figures" },
        h("p", { class: "note", text: list.length ? `${plural(list.length, "chart matches", "charts match")}; ${fmtInt(shown.length)} shown. Open one for its full size and its edits.` : "No chart matches." }),
        h("ul", { class: "gallery" }, items), more);
    }

    /** Every candidate that is not valid, with its reason: excluded, failed and incomplete, and those beyond the cap. */
    function others(st, counts) {
      const list = st.candidates.filter((c) => c.outcome !== "valid" && c.outcome !== "pending");
      if (!list.length && !sum(st.plan.overflow)) return h("p", { class: "note", text: "Every candidate is valid." });
      return h("details", { class: "outcomes", open: !!st.opened?.outcomes, ontoggle: (ev) => { st.opened = { ...st.opened, outcomes: ev.target.open }; } },
        h("summary", {}, `Not valid: ${fmtInt(counts.excluded)} excluded, ${fmtInt(counts.failed)} failed, ${fmtInt(counts.incomplete)} incomplete`),
        h("ul", { class: "errors" }, list.slice(0, 500).map((c) => h("li", {}, h("strong", { text: `${c.outcome}: ` }), `${Render.KIND_LABEL[c.kind]} of ${c.fields.join(", ")}. ${c.reason}`)),
          list.length > 500 ? h("li", { text: `… and ${fmtInt(list.length - 500)} more.` }) : null,
          sum(st.plan.overflow) ? h("li", {}, h("strong", { text: "incomplete: " }), `${fmtInt(sum(st.plan.overflow))} candidates beyond the cap of ${fmtInt(st.plan.max)}, not generated.`) : null));
    }

    /* ---------- the full-size view ---------- */

    function open(tableName, id) {
      Object.assign(viewer, { table: tableName, id, page: 1, zoom: "fit", error: "" });
      const dialog = /** @type {HTMLDialogElement} */ (byId("viewer"));
      if (!dialog.open) dialog.showModal();
      drawViewer();
    }

    const current = () => {
      const st = stateOf(viewer.table);
      return { st, cand: st?.candidates.find((c) => c.id === viewer.id) };
    };

    /** The specification shown: the candidate's, on the page of events chosen in the view. */
    function shownSpec(cand) {
      const page = cand.spec.transform.find((/** @type {any} */ t) => t.id === "page");
      if (!page || page.page === viewer.page) return cand.spec;
      const copy = JSON.parse(JSON.stringify(cand.spec));
      copy.transform.find((/** @type {any} */ t) => t.id === "page").page = viewer.page;
      return copy;
    }

    async function drawViewer() {
      const { st, cand } = current();
      const dialog = /** @type {HTMLDialogElement} */ (byId("viewer"));
      if (!st || !cand) { dialog.close(); return; }
      byId("viewer-title").textContent = cand.spec.annotation.title;
      byId("viewer-kind").textContent = `${Render.KIND_LABEL[cand.kind]} · ${cand.id}${cand.edited ? " · edited" : ""}`;
      const valid = st.candidates.filter((c) => c.outcome === "valid");
      const at = valid.indexOf(cand);
      const nav = byId("viewer-nav");
      nav.replaceChildren(
        h("button", { type: "button", disabled: at <= 0, onclick: () => open(st.ctx.table, valid[at - 1].id), text: "Previous chart" }),
        h("button", { type: "button", disabled: at < 0 || at >= valid.length - 1, onclick: () => open(st.ctx.table, valid[at + 1].id), text: "Next chart" }),
        h("span", { class: "seg", role: "group", "aria-label": "Zoom" }, [["fit", "Fit"], ["100", "100%"], ["200", "200%"]].map(([z, l]) =>
          h("button", { type: "button", "aria-pressed": String(viewer.zoom === z), onclick: () => { viewer.zoom = z; zoom(); drawZoomButtons(); }, "data-zoom": z, text: l }))));
      await drawFigure(st, cand);
      const page = cand.spec.transform.find((/** @type {any} */ t) => t.id === "page");
      const pages = byId("viewer-pages");
      pages.replaceChildren();
      if (page) {
        const n = cand.pages ?? 1;
        pages.append(h("p", { class: "actions" },
          h("button", { type: "button", disabled: viewer.page <= 1, onclick: () => { viewer.page -= 1; drawViewer(); }, text: "Earlier events" }),
          h("span", { class: "note", text: ` Page ${viewer.page} of ${n}: ${page.size} events a figure, in time order. ` }),
          h("button", { type: "button", disabled: viewer.page >= n, onclick: () => { viewer.page += 1; drawViewer(); }, text: "Later events" })));
      }
      byId("viewer-edit").replaceChildren(...editor(st, cand));
      byId("viewer-spec").textContent = JSON.stringify(cand.spec, null, 2);
    }

    /**
     * Draw the open chart by the publication settings, with its publication panel: its data is computed once a
     * version and page, and a change of the settings draws the figure again without the engine.
     */
    async function drawFigure(st, cand) {
      const figure = byId("viewer-figure");
      const panel = byId("viewer-publish");
      const turn = ++viewer.drawing;
      if (cand.outcome !== "valid") {
        figure.replaceChildren(h("p", { class: "note", text: cand.outcome === "pending" ? "This chart is being computed again; it shows here once it is drawn." : `${cand.outcome[0].toUpperCase()}${cand.outcome.slice(1)}: ${cand.reason}` }));
        panel.replaceChildren();
        return;
      }
      try {
        const spec = shownSpec(cand);
        const key = `${cand.id}@${cand.version}#${viewer.page}`;
        // Another chart, version or page is drawn anew; new settings redraw the figure in place.
        if (shownData?.key !== key || !figure.querySelector("svg")) figure.replaceChildren(h("p", { class: "note", text: "Drawing…" }));
        if (shownData?.key !== key) {
          const api = await app.ensureEngine();
          const data = await app.exclusive(() => Charts.compute(api.query, spec, st.ctx));
          if (data.excluded) throw new Error(data.excluded);
          shownData = { key, data };
        }
        const data = shownData.data;
        const drawn = await app.publish.draw(spec, data);
        if (turn !== viewer.drawing) return;
        figure.innerHTML = drawn.svg;
        viewer.size = { width: drawn.scene.width, height: drawn.scene.height };
        zoom();
        app.publish.panel(panel, { spec, drawn, name: cand.id, redraw: () => { const now = current(); if (now.cand) drawFigure(now.st, now.cand); } });
      } catch (error) {
        if (turn !== viewer.drawing) return;
        figure.replaceChildren(h("p", { class: "warn-text", text: `This figure could not be drawn: ${app.message(error)}` }));
        panel.replaceChildren();
      }
    }

    function drawZoomButtons() {
      for (const b of byId("viewer-nav").querySelectorAll("[data-zoom]")) b.setAttribute("aria-pressed", String(b.getAttribute("data-zoom") === viewer.zoom));
    }

    /** Size the drawn figure: the width of the view, or its physical size (100% or 200%). */
    function zoom() {
      const svg = byId("viewer-figure").querySelector("svg");
      if (!svg) return;
      if (viewer.zoom === "fit") { svg.style.width = "100%"; svg.style.height = "auto"; return; }
      const k = Number(viewer.zoom) / 100;
      svg.style.width = `${viewer.size.width * k}mm`;
      svg.style.height = `${viewer.size.height * k}mm`;
    }

    /** The edit form of a chart: fields, transformations, labels, scales and layout. */
    function editor(st, cand) {
      const spec = cand.spec, kind = Grammar.KIND[spec.kind];
      const id = (x) => `edit-${x}`;
      const field = (key, label, control) => h("div", { class: "field" }, h("label", { for: id(key), text: label }), control);
      const select = (key, options, value) => h("select", { id: id(key), name: key }, options.map(([v, l]) => h("option", { value: v, selected: String(value) === String(v), text: l })));
      const groups = [];
      // Fields: each channel takes a field of its class.
      const byClass = (cls) => st.classes.filter((f) => f.cls === cls);
      groups.push(h("fieldset", { class: "edit-group" }, h("legend", { text: "Fields" }),
        kind.channels.map((ch, i) => field(ch, `${ch === "x2" ? "End (x2)" : ch === "label" ? "Labels" : ch}: ${Grammar.CLASS_LABEL[kind.classes[i]]}`,
          select(ch, byClass(kind.classes[i]).map((f) => [f.name, f.name]), spec.encoding[ch].field))),
        kind.classes[0] === kind.classes[1] && kind.channels.length === 2 ? h("label", { class: "choice" }, h("input", { type: "checkbox", name: "swap" }), " Swap x and y") : null));
      // Transformations.
      const t = (tid) => spec.transform.find((/** @type {any} */ x) => x.id === tid);
      const trans = [];
      if (t("bin:x")) trans.push(field("bins", "Bins (5 to 100; empty for the Freedman–Diaconis rule)", h("input", { id: id("bins"), name: "bins", type: "number", min: "5", max: "100", step: "1", value: t("bin:x").bins ?? "", placeholder: "by the rule" })));
      if (t("period:x")) {
        // Only periods the field's precision allows: a date has no hours, years are counted by year.
        const units = ChartSpec.periodsFor(st.ctx.fields[spec.encoding.x.field]?.precision);
        trans.push(field("unit", "Time period", select("unit", units.map((p) => [p, p === "auto" ? "By the rule (at least 20 periods)" : p]), t("period:x").unit)));
      }
      if (t("top:x")) trans.push(field("top", `Levels of ${spec.encoding.x.field} kept (the rest as Other)`, h("input", { id: id("top"), name: "top", type: "number", min: "1", max: spec.kind === "bar" ? "29" : "12", step: "1", value: t("top:x").n })));
      if (t("top:y")) trans.push(field("topY", `Levels of ${spec.encoding.y.field} kept (the rest as Other)`, h("input", { id: id("topY"), name: "topY", type: "number", min: "1", max: "12", step: "1", value: t("top:y").n })));
      const agg = t("aggregate");
      if (agg && agg.fn !== "count") {
        const yName = spec.encoding.y.field;
        const key = `${st.ctx.table}\u0000${yName}`;
        trans.push(field("fn", "Aggregate", select("fn", [["mean", "Mean, with a 95% interval"], ["sum", "Sum (only for a field marked additive)"]], agg.fn)),
          h("label", { class: "choice" }, h("input", { type: "checkbox", name: "additive", checked: !!store.additive[key] }), ` ${yName} is additive: a sum of its values means something`));
      }
      if (trans.length) groups.push(h("fieldset", { class: "edit-group" }, h("legend", { text: "Transformations" }), trans));
      // Scales.
      const scales = [];
      for (const ch of ["x", "y"]) {
        const sc = spec.scale[ch];
        if (!sc || (sc.type !== "linear" && sc.type !== "log10") || spec.encoding[ch]?.class !== "Q") continue;
        scales.push(field(`${ch}Scale`, `${ch} scale`, select(`${ch}Scale`, [["auto", "By the rule"], ["linear", "Linear"], ["log10", "Log10 (values above 0 only)"]], sc.rule === "set" ? sc.type : "auto")));
      }
      if (scales.length) groups.push(h("fieldset", { class: "edit-group" }, h("legend", { text: "Scales" }), scales));
      // Labels.
      const a = spec.annotation;
      groups.push(h("fieldset", { class: "edit-group wide" }, h("legend", { text: "Labels" }),
        field("title", "Title", h("input", { id: id("title"), name: "title", type: "text", maxlength: "200", value: a.title })),
        a.labels.x !== undefined ? field("xLabel", "x label", h("input", { id: id("xLabel"), name: "xLabel", type: "text", maxlength: "200", value: a.labels.x })) : null,
        a.labels.y !== undefined ? field("yLabel", "y label", h("input", { id: id("yLabel"), name: "yLabel", type: "text", maxlength: "200", value: a.labels.y })) : null,
        field("caption", "Caption (empty for the automatic one)", h("textarea", { id: id("caption"), name: "caption", rows: "2", maxlength: "2000" }, a.caption)),
        field("notes", "Notes (one a line)", h("textarea", { id: id("notes"), name: "notes", rows: "2", maxlength: "2000" }, a.notes.join("\n"))),
        h("p", { class: "note", text: "Units appear only when the source or you give one (a column's unit in Inspect); nothing here is inferred." })));
      // Layout.
      const facets = Grammar.facetFields(st.classes).filter((f) => !kind.channels.some((ch) => spec.encoding[ch].field === f.name));
      groups.push(h("fieldset", { class: "edit-group" }, h("legend", { text: "Layout" }),
        field("width", "Width (mm)", h("input", { id: id("width"), name: "width", type: "number", min: "40", max: "500", step: "1", value: spec.layout.width })),
        field("height", "Height (mm)", h("input", { id: id("height"), name: "height", type: "number", min: "30", max: "500", step: "1", value: spec.layout.height })),
        spec.kind.endsWith("timeline") ? h("p", { class: "note", text: "Timelines are not faceted in v1." }) : [
          field("facet", "Facets: one panel a level", select("facet", [["", "None"], ...facets.map((f) => [f.name, `${f.name} (${f.levels} levels)`])], spec.layout.facet?.field ?? "")),
          field("facetColumns", "Facet columns", h("input", { id: id("facetColumns"), name: "facetColumns", type: "number", min: "1", max: "6", step: "1", value: spec.layout.facet?.columns ?? 3 })),
        ]));
      // The chart is found again by its id when the form is sent: a regeneration may have replaced it meanwhile.
      const form = h("form", { class: "edit", onsubmit: (ev) => { ev.preventDefault(); const now = current(); if (now.cand) apply(now.st, now.cand, ev.target); } },
        groups,
        h("p", { id: "viewer-error", class: "warn-text", role: "alert", text: viewer.error }),
        h("p", { class: "actions" },
          h("button", { type: "submit", class: "primary", disabled: viewer.busy, text: "Apply" }),
          cand.edited ? h("button", { type: "button", disabled: viewer.busy, onclick: () => { const now = current(); if (now.cand) revert(now.st, now.cand); }, text: "Return to the generated chart" }) : null),
        h("p", { class: "note", text: "Each change is checked against the grammar's rules before it is drawn (a log scale needs values above 0; bars start at zero; facets need a category of at most 12 levels), and recorded in the specification and the log." }));
      return [form];
    }

    /**
     * Read the form into a change: only what differs from the specification, so a field the person left alone never
     * undoes what another change did to it (a new field's axis label, a sum's title).
     */
    function changeOf(spec, form) {
      const data = new FormData(form);
      const str = (k) => (data.has(k) ? String(data.get(k)) : undefined);
      const num = (k) => (data.has(k) && String(data.get(k)).trim() !== "" ? Number(data.get(k)) : undefined);
      const t = (id) => spec.transform.find((/** @type {any} */ x) => x.id === id);
      const scaleOf = (ch) => (spec.scale[ch]?.rule === "set" ? spec.scale[ch].type : "auto");
      const before = {
        bins: t("bin:x")?.bins ?? null, unit: t("period:x")?.unit, top: t("top:x")?.n, topY: t("top:y")?.n, fn: t("aggregate")?.fn,
        xScale: scaleOf("x"), yScale: scaleOf("y"), title: spec.annotation.title, xLabel: spec.annotation.labels.x, yLabel: spec.annotation.labels.y,
        caption: spec.annotation.caption, notes: spec.annotation.notes.join("\n"), width: spec.layout.width, height: spec.layout.height,
        facet: spec.layout.facet?.field ?? "", facetColumns: spec.layout.facet?.columns ?? 3,
      };
      /** @type {Record<string, any>} */
      const change = {};
      for (const ch of Grammar.KIND[spec.kind].channels) if (str(ch) !== undefined && str(ch) !== spec.encoding[ch].field) change[ch] = str(ch);
      if (data.get("swap")) change.swap = true;
      const read = { bins: data.has("bins") ? num("bins") ?? null : undefined, unit: str("unit"), top: num("top"), topY: num("topY"), fn: str("fn"), xScale: str("xScale"), yScale: str("yScale"),
        title: str("title"), xLabel: str("xLabel"), yLabel: str("yLabel"), caption: str("caption"), notes: str("notes")?.replace(/\r\n/g, "\n"), width: num("width"), height: num("height"),
        facet: str("facet"), facetColumns: num("facetColumns") };
      for (const [k, v] of Object.entries(read)) if (v !== undefined && v !== before[/** @type {keyof typeof before} */ (k)]) change[k] = v;
      return change;
    }

    async function apply(st, cand, form) {
      const data = new FormData(form);
      // A change that does not hold is refused with its reasons, and the form keeps what the person chose.
      const refuse = (text) => { viewer.error = text; byId("viewer-error").textContent = text; };
      // Marking a field additive is a fact about the field, for every chart of the table; the rules read it as the
      // person now marks it, and it holds only when this chart still holds with it.
      const agg = cand.spec.transform.find((/** @type {any} */ t) => t.id === "aggregate");
      let mark = null;
      if (agg && agg.fn !== "count") {
        const yName = cand.spec.encoding.y.field, want = !!data.get("additive");
        if (want !== !!store.additive[`${st.ctx.table}\u0000${yName}`]) mark = { yName, want };
      }
      const ctx = mark ? { ...st.ctx, fields: { ...st.ctx.fields, [mark.yName]: { ...st.ctx.fields[mark.yName], additive: mark.want } } } : st.ctx;
      const commitMark = () => {
        if (!mark) return;
        const key = `${st.ctx.table}\u0000${mark.yName}`;
        if (mark.want) store.additive[key] = true; else delete store.additive[key];
        st.ctx.fields[mark.yName].additive = mark.want;
        app.note({ kind: "changed", table: st.ctx.table, column: mark.yName, text: `You marked ${st.ctx.table}.${mark.yName} as ${mark.want ? "additive: a sum of its values means something" : "not additive"}.` });
        // Another chart may show a sum of this field: bring every chart of the table up to date.
        const table = store.tables.find((t) => t.name === st.ctx.table);
        if (!mark.want && table) generate(table);
      };
      let next;
      try {
        next = ChartSpec.edit(cand.spec, changeOf(cand.spec, form), ctx);
      } catch (error) {
        return refuse(`Not applied: ${app.message(error)}`);
      }
      const changed = next.edits.length !== cand.spec.edits.length;
      if (!changed && !mark) return refuse("Nothing changed.");
      const v = ChartSpec.validate(next, ctx);
      if (!v.ok) return refuse(`Not applied: ${v.errors.join("; ")}`);
      if (!changed) {
        commitMark();
        viewer.error = "";
        app.refresh();
        return drawViewer();
      }
      viewer.busy = true;
      viewer.error = "";
      let applied = false;
      try {
        const api = await app.ensureEngine();
        const out = await app.exclusive(async () => {
          // An edit is held to the ranking's rejections too: at least 5 complete rows, no field with one value.
          const rejected = await Charts.rejection(api.query, next, ctx);
          if (rejected) return { excluded: rejected };
          const d = await Charts.compute(api.query, next, ctx);
          return d.excluded ? { excluded: d.excluded } : { data: d, drawn: Render.render(next, d) };
        });
        if (out.excluded) { refuse(`Not applied: ${out.excluded}`); return; }
        // The chart as the table holds it now: a regeneration that ran first may have replaced the object.
        const live = stateOf(st.ctx.table)?.candidates.find((c) => c.id === cand.id);
        if (!live) { refuse("Not applied: this chart is no longer a candidate of the table."); return; }
        if (live.outcome === "pending") { refuse("Not applied: the charts of this table are being generated again; apply once they are complete."); return; }
        commitMark();
        forget(live);
        cand = live;
        // The edit holds and is drawn: whatever the generated chart's outcome was, this chart is valid.
        Object.assign(cand, { outcome: "valid", reason: "", spec: next, edited: true, desc: out.drawn.desc, facts: out.data.facts, features: Rank.features(next, out.data, out.drawn),
          pages: out.data.page?.pages ?? 1, svg: keep(out.drawn.svg), version: cand.version + 1 });
        viewer.page = 1;
        applied = true;
        app.note({ kind: "chart", table: st.ctx.table, text: `Edited the chart ${cand.id}: ${next.edits[next.edits.length - 1]}.` });
      } catch (error) {
        refuse(`Not applied: ${app.message(error)}`);
      } finally {
        viewer.busy = false;
        app.refresh();
        if (applied) drawViewer();
      }
    }

    /** Draw a chart as generated again, as one piece of work, so an earlier Cancel cannot leave it pending. */
    function revert(st, chosen) {
      return app.busy("Drawing", async () => {
        const cand = stateOf(st.ctx.table)?.candidates.find((c) => c.id === chosen.id);
        if (!cand) return;
        forget(cand);
        Object.assign(cand, { spec: ChartSpec.make(cand, st.ctx), edited: false, outcome: "pending", version: cand.version + 1 });
        const api = await app.ensureEngine();
        await computeOne(api, st, cand);
        if (cand.outcome === "pending") Object.assign(cand, { outcome: "incomplete", reason: "Not computed: you cancelled." });
        app.note({ kind: "chart", table: st.ctx.table, text: `Returned the chart ${cand.id} to the generated one: ${cand.outcome}.` });
        viewer.error = "";
      }).finally(() => drawViewer());
    }

    /* ---------- what the record and the tools read ---------- */

    /** The accounting of a table's charts, for the snapshot (no rows, no figures). */
    function summary(name) {
      const st = stateOf(name);
      if (!st) return null;
      const counts = Grammar.accounting(st.candidates, sum(st.plan.overflow));
      const t = st.timing;
      return { grammar: Grammar.VERSION, status: st.status, reason: st.reason, fields: st.plan.counts, formula: st.plan.formula.text, expected: st.plan.formula.total,
        ...counts, byKind: st.plan.byKind, edited: st.candidates.filter((c) => c.edited).length,
        timedFrom: t.begun ? "import" : "run", firstFigureSeconds: t.first ? Math.round(t.first - (t.begun ?? t.start)) / 1000 : null, allSeconds: t.done ? Math.round(t.done - (t.begun ?? t.start)) / 1000 : null };
    }

    /** The candidates of a table for the get_candidates tool: ids, kinds, fields, outcomes, reasons; one specification by id. */
    function candidates(name, o = {}) {
      const st = stateOf(name);
      if (!st) return null;
      if (o.id) {
        const c = st.candidates.find((x) => x.id === o.id);
        return c ? { id: c.id, kind: c.kind, fields: c.fields, outcome: c.outcome, reason: c.reason, description: c.desc, spec: c.spec } : null;
      }
      const list = st.candidates.filter((c) => !o.outcome || c.outcome === o.outcome);
      const offset = Math.max(0, Math.floor(o.offset ?? 0));
      return { table: name, ...summary(name), offset, count: list.length,
        candidates: list.slice(offset, offset + 1000).map((c) => ({ id: c.id, kind: c.kind, fields: c.fields, outcome: c.outcome, reason: c.reason || undefined, title: c.spec?.annotation.title, edited: c.edited || undefined, sample: c.facts?.scatterSample ?? undefined })) };
    }

    function bind() {
      const dialog = /** @type {HTMLDialogElement} */ (byId("viewer"));
      byId("viewer-close").addEventListener("click", () => dialog.close());
      dialog.addEventListener("close", () => { viewer.id = ""; });
    }

    /**
     * A small picture of a valid chart that opens it full size, for the lists of findings.
     * @param {string} tableName @param {string} id @param {string} label
     */
    function thumb(tableName, id, label) {
      const st = stateOf(tableName);
      const cand = st?.candidates.find((c) => c.id === id);
      if (!st || !cand || cand.outcome !== "valid") return null;
      const img = h("img", { alt: cand.desc, loading: "lazy", width: "240", height: String(Math.round((240 * cand.spec.layout.height) / cand.spec.layout.width)) });
      pictureOf(st, cand, img);
      return h("button", { type: "button", class: "figure-open thumb", "data-thumb": id, "aria-label": `Open full size: ${label}`, onclick: () => open(tableName, id) }, img);
    }

    /**
     * Seed a table's charts with saved edited specifications (a reopened project), before its first generation: each
     * is kept when it still validates against the table as read, as an edit made in the page is.
     * @param {string} name @param {{ id: string, spec: any }[]} edits
     */
    function seed(name, edits) {
      if (!edits.length) return;
      seeds.set(name, edits.map((e) => ({ id: e.id, edited: true, spec: e.spec, version: 0, svg: null })));
    }

    return { generate, draw, drop, summary, candidates, bind, thumb, open, seed, state: stateOf };
  }

  return { mount };
});
