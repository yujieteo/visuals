/* Universal Data Workbench: the findings of each table, its statistics and the two ranked lists.
 *
 * Once a table's charts are drawn, its hypothesis family runs (src/family.js) as one piece of work with progress
 * and Cancel, then its valid charts are ranked (src/rank.js) into two lists, "Unusual patterns" and "Statistically
 * supported patterns", each with its distinct highlights. Each highlight shows what was observed apart from why it
 * is highlighted, with its statistical status and fixed cautions; every chart of either list opens the same
 * details. The optional study details decide the tests again without a query; a subset the person opens runs as a
 * family of its own. No rows leave the page: the record and the tools hold statistics and specifications.
 */
(function (root, factory) {
  root.DWFindings = factory(root.DWFamily, root.DWRank, root.DWRender);
})(typeof self !== "undefined" ? self : this, function (Family, Rank, Render) {
  "use strict";

  const PAGE = 24;
  const LISTS = {
    unusual: { title: "Unusual patterns", what: "Ordered by unusualness: usefulness × the share of complete rows − penalties, ties by chart id. Rare values, strong relationships, group differences and abrupt changes in time score high." },
    supported: { title: "Statistically supported patterns", what: "Charts whose hypothesis passed its test's checks with an adjusted p-value of at most 0.05 (Benjamini–Yekutieli over the table's family), ordered by adjusted p-value, then usefulness. Exploratory evidence, not proof." },
  };
  const INDEPENDENT = [["unknown", "Not stated"], ["yes", "Yes"], ["no", "No"]];

  /**
   * Mount the findings on the page. `app` gives what the page shares: its store, h(), busy(), progress(),
   * refresh(), ensureEngine(), note(), message(), cancel(), byId(), formatting, the gallery, and the highlight
   * count of the view (highlights() and setHighlights(n)).
   * @param {any} app
   */
  function mount(app) {
    const { store, h, byId, fmtInt, plural } = app;
    /** @type {Map<string, any>} each table's statistics: runs, the family, the study details, the subsets */
    const tables = new Map();
    const stateOf = (name) => tables.get(name);
    const ensure = (name) => {
      if (!tables.has(name)) tables.set(name, { runs: 0, family: null, status: "none", reason: "", study: { ...Family.NO_STUDY }, subsets: [], shown: { unusual: PAGE, supported: PAGE }, open: {} });
      return tables.get(name);
    };

    /* ---------- running a family ---------- */

    /** Run the statistics of a table (or of one of its subsets) as one piece of work with progress and Cancel. */
    function analyse(table, subset = null) {
      return app.busy(subset ? `Statistics of a subset of ${table.name}` : `Statistics of ${table.name}`, () => analyseNow(table, subset));
    }

    async function analyseNow(table, subset) {
      const charts = app.gallery.state(table.name);
      if (!store.tables.includes(table) || !charts?.ctx) return;
      const st = ensure(table.name);
      const api = await app.ensureEngine();
      const name = subset ? `${table.name} where ${subset.field} = ${subset.level}` : table.name;
      if (!subset) Object.assign(st, { status: "running", reason: "" });
      st.runs += 1;
      app.refresh();
      // The charts this run ranks: a later regeneration makes the lists stale until the statistics run again.
      const chartsAt = charts.timing?.start ?? null;
      let fam;
      try {
        fam = await Family.run(api.query, { table: table.name, name, run: st.runs, subset, ctx: charts.ctx, classes: charts.classes, columns: table.columns,
          dismissed: table.dismissed, study: st.study, stopped: () => store.stop, progress: app.progress });
      } catch (error) {
        if (!subset) Object.assign(st, { status: "failed", reason: app.message(error) });
        app.note({ kind: "failed", table: table.name, text: `The statistics of ${name} could not run: ${app.message(error)}` });
        return;
      }
      if (subset) st.subsets = [...st.subsets.filter((x) => x.name !== name), fam];
      else {
        // Subset families were computed from the table as it read before: they go, and can be opened again.
        if (st.subsets.length) app.note({ kind: "statistics", table: table.name, text: `The subset families of ${table.name} (${st.subsets.map((f) => f.name).join("; ")}) were closed: the table's statistics ran again.` });
        Object.assign(st, { family: fam, status: fam.status, reason: fam.reason, chartsAt, subsets: [] });
      }
      app.note({ kind: "statistics", table: table.name, text: `Statistics of ${name}, run ${fam.run} (catalogue v${Family.CATALOGUE}): ${plural(fam.members.length, "hypothesis", "hypotheses")}, ${fmtInt(fam.m)} tested, ${fmtInt(fam.notTested)} not tested; `
        + (fam.status === "complete" ? `${fmtInt(fam.flagged)} with an adjusted p-value at or below 0.05 (Benjamini–Yekutieli).` : `incomplete (${fam.reason}), so no adjusted p-values.`) });
    }

    /** The study details changed: decide the table's family and its subsets again, without a query. */
    function setStudy(table, form) {
      const st = ensure(table.name);
      const data = new FormData(form);
      const next = { independent: String(data.get("independent") ?? "unknown"), repeated: String(data.get("repeated") ?? ""), design: String(data.get("design") ?? "unknown") };
      if (JSON.stringify(next) === JSON.stringify(st.study)) return;
      st.study = next;
      if (st.family) st.family = Family.decide(st.family, next);
      st.subsets = st.subsets.map((f) => Family.decide(f, next));
      const said = [`independent observations: ${INDEPENDENT.find(([v]) => v === next.independent)?.[1].toLowerCase()}`,
        `repeated measurements: ${next.repeated === "" ? "not stated" : next.repeated === "none" ? "none" : `by ${Family.repeatedBy(next)}`}`, `sample design: ${next.design}`];
      app.note({ kind: "changed", table: table.name, text: `You set the study details of ${table.name}: ${said.join("; ")}.${st.family ? ` The tests were decided again: ${fmtInt(st.family.m)} tested, ${fmtInt(st.family.flagged)} with an adjusted p-value at or below 0.05.` : ""}` });
      app.refresh();
    }

    function drop(name) { tables.delete(name); }

    /* ---------- ranking ---------- */

    /** Whether the charts were drawn again since the table's statistics ran. */
    const stale = (st, charts) => !!st?.family && !!charts && st.chartsAt !== (charts.timing?.start ?? null);

    /** The ranked lists of a table, or null while its family is not complete or its charts changed since. */
    function ranked(name) {
      const st = stateOf(name), charts = app.gallery.state(name);
      if (!st?.family || st.family.status !== "complete" || !charts || stale(st, charts)) return null;
      return Rank.rank(charts.candidates, st.family, { ctx: charts.ctx, classes: charts.classes, highlights: app.highlights() });
    }

    /** The suspected data errors of each field, for the cautions: a stand-in the person dismissed is a value, not an error. */
    function errorsOf(table) {
      const out = {};
      for (const c of table.columns) {
        const open = (c.errors ?? []).filter((e) => e.kind !== "sentinel" || !table.dismissed.includes(`${c.name}::sentinel::${e.examples[0]}`));
        const count = open.reduce((a, e) => a + e.count, 0);
        if (count) out[c.name] = { count, sentinels: open.filter((e) => e.kind === "sentinel").reduce((a, e) => a + e.count, 0) };
      }
      return out;
    }

    /** The explanation of one ranked chart. */
    function finding(table, r, id) {
      const charts = app.gallery.state(table.name);
      const cand = charts?.candidates.find((c) => c.id === id);
      return cand ? Rank.explain(cand, r, stateOf(table.name).family, { errors: errorsOf(table), sample: table.sample }) : null;
    }

    /* ---------- drawing ---------- */

    function draw() {
      const view = byId("findings-view");
      const table = store.tables.find((t) => t.name === store.selected);
      byId("findings-empty").hidden = !!table;
      if (!table) { view.replaceChildren(); return; }
      const st = stateOf(table.name);
      const charts = app.gallery.state(table.name);
      const head = h("div", { class: "table-head charts-head" }, h("h3", { text: `Findings of ${table.name}` }));
      const out = [head];
      if (!st || st.status === "none") {
        out.push(h("p", { class: "note", "data-family": "none", text: charts?.status === "complete" || charts?.status === "incomplete" ? "The statistics run once the charts are drawn." : "The statistics run once the table's charts are drawn." }));
        if (charts?.ctx && !store.busy) out.push(h("p", { class: "actions" }, h("button", { type: "button", class: "primary", onclick: () => analyse(table), text: "Run the statistics" })));
        view.replaceChildren(...out);
        return;
      }
      head.append(st.status === "running" ? h("span", { class: "badge", text: "Running…" }) : st.status === "complete" ? h("span", { class: "badge ok", text: "Complete" })
        : h("span", { class: "badge warn", text: st.status === "failed" ? "Failed" : `Incomplete: ${st.reason}` }));
      const fam = st.family;
      if (fam) out.push(h("p", { class: "accounting", "data-family": st.status }, h("strong", { text: `Family ${fam.name}, run ${fam.run}: ` }),
        `${plural(fam.members.length, "hypothesis", "hypotheses")}, ${fmtInt(fam.m)} tested (m), ${fmtInt(fam.notTested)} not tested; `,
        fam.status === "complete" ? `${fmtInt(fam.flagged)} with an adjusted p-value at or below 0.05.` : "no adjusted p-values while the family is incomplete."));
      else out.push(h("p", { class: "note", "data-family": st.status, text: st.status === "running" ? "Running the statistics…" : `The statistics could not run: ${st.reason}` }));
      if (store.busy) out.push(h("p", { class: "actions" }, h("button", { type: "button", onclick: () => app.cancel(), text: "Cancel" }), h("span", { class: "note", text: ` ${store.busy.text}` })));
      else if ((st.status !== "complete" && st.status !== "running") || stale(st, charts)) out.push(h("p", { class: "actions" }, h("button", { type: "button", class: "primary", onclick: () => analyse(table), text: "Run the statistics again" })));
      out.push(study(table, st, charts));
      const r = ranked(table.name);
      if (r) {
        out.push(h("div", { class: "filters" }, h("div", { class: "field" },
          h("label", { for: "highlight-count", text: "Distinct highlights per list (0 to 50)" }),
          // An emptied field keeps the count it had.
          h("input", { id: "highlight-count", type: "number", min: "0", max: "50", step: "1", value: String(r.count), onchange: (ev) => (ev.target.value.trim() === "" ? draw() : app.setHighlights(Number(ev.target.value))) }))));
        out.push(list(table, st, r, "unusual"), list(table, st, r, "supported"));
      } else if (fam) out.push(h("p", { class: "warn-text", text: stale(st, charts) ? "The charts were drawn again since the statistics ran: run the statistics again to rank them." : "The two lists need a complete family: run the statistics again to rank the charts." }));
      if (fam) out.push(familyView(fam, st, "family", `Hypothesis family ${fam.name}, run ${fam.run}: every member, tested or why not`));
      if (fam) out.push(subsets(table, st, charts));
      view.replaceChildren(...out);
    }

    /** The optional study details. */
    function study(table, st, charts) {
      const s = st.study;
      const select = (name, label, options, value) => h("div", { class: "field" }, h("label", { for: `study-${name}`, text: label }),
        h("select", { id: `study-${name}`, name }, options.map(([v, l]) => h("option", { value: v, selected: v === value, text: l }))));
      const fields = (charts?.classes ?? []).map((f) => f.name);
      const set = s.independent !== "unknown" || s.repeated !== "" || s.design !== "unknown";
      return h("details", { class: "study", open: !!st.open.study, ontoggle: (ev) => { st.open.study = ev.target.open; } },
        h("summary", {}, `Study details (optional): ${set ? "set by you" : "not stated, so independence is assumed, not confirmed"}`),
        h("p", { class: "note", text: "The figures and both lists are made without them. They decide which tests apply: without them, tests of independent rows run tagged \"independence assumed, not confirmed\", and are refused where the data contradicts independence (an identifier that repeats, serial correlation in time order)." }),
        h("form", { class: "change", onsubmit: (ev) => { ev.preventDefault(); setStudy(table, ev.target); } },
          select("independent", "Independent observations", INDEPENDENT, s.independent),
          select("repeated", "Repeated measurements", [["", "Not stated"], ["none", "None"], ...fields.map((f) => [`field:${f}`, `By ${f}`])], s.repeated),
          select("design", "Sample design", Family.DESIGNS.map((d) => [d, d === "unknown" ? "Not stated" : `${d[0].toUpperCase()}${d.slice(1)}`]), s.design),
          h("p", { class: "actions" }, h("button", { type: "submit", disabled: !!store.busy || !st.family, text: "Apply" })),
          h("p", { class: "note", text: "A \"no\", repeated measurements or a clustered design turns off the tests that assume independent rows, each with its reason; trend and level-shift tests allow for dependence in time." })),
        independence(st.family));
    }

    /** What the data says about independence. */
    function independence(fam) {
      if (!fam) return null;
      const items = [...fam.independence.checked.map((t) => `Identifier: ${t}`),
        ...fam.independence.serial.map((s) => `${s.field} in the order of ${s.time}: lag-1 autocorrelation ${fmt(s.r1)} (p ${s.p < 0.001 ? "< 0.001" : fmt(s.p, 3)})${s.flagged ? ": serial correlation, which contradicts independence" : ""}.`)];
      return h("div", {}, h("p", { class: "label", text: "Independence checks in the data" }),
        items.length ? h("ul", { class: "errors" }, items.map((t) => h("li", { text: t }))) : h("p", { class: "note", text: "Nothing to check: no identifier, and no time field to order the rows by." }));
    }

    const fmt = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)).toLocaleString("en-US", { maximumFractionDigits: d }) : "–");

    /** One list: its rule, its highlights explained, then every chart of it. */
    function list(table, st, r, key) {
      const meta = LISTS[/** @type {keyof typeof LISTS} */ (key)];
      const ids = key === "unusual" ? r.unusual : r.supported;
      const lights = key === "unusual" ? r.highlights.unusual : r.highlights.supported;
      const fewer = key === "unusual" ? r.fewer.unusual : r.fewer.supported;
      const out = [h("h4", { id: `list-${key}`, text: `${meta.title} (${fmtInt(ids.length)})` }), h("p", { class: "note", text: meta.what })];
      if (!ids.length) out.push(h("p", { text: key === "supported" ? "No chart has a tested hypothesis with an adjusted p-value at or below 0.05." : "No valid chart to rank." }));
      else {
        out.push(h("p", { "data-highlights": key, text: r.count === 0 ? "No highlight: you chose 0." : fewer !== null ? `${plural(lights.length, "distinct figure", "distinct figures")} highlighted: fewer than the ${r.count} you asked for, because no other chart of this list is distinct (another cluster, at most one field shared).` : `${plural(lights.length, "distinct figure", "distinct figures")} highlighted, each from another redundancy cluster and sharing at most one field with another.` }));
        out.push(h("ol", { class: "highlights" }, lights.map((id) => card(table, r, id, key))));
        const shown = st.shown[key];
        out.push(h("details", { class: "outcomes", open: !!st.open[key], ontoggle: (ev) => { st.open[key] = ev.target.open; } },
          h("summary", {}, `The whole list: ${plural(ids.length, "chart", "charts")}`),
          h("ol", { class: "ranked" }, ids.slice(0, shown).map((id, i) => row(table, r, id, i + 1, key))),
          ids.length > shown ? h("p", { class: "actions" }, h("button", { type: "button", onclick: () => { st.shown[key] += PAGE; draw(); }, text: `Show ${Math.min(PAGE, ids.length - shown)} more of ${fmtInt(ids.length - shown)}` })) : null));
      }
      return h("section", { "aria-labelledby": `list-${key}`, class: "list" }, out);
    }

    /** The blocks of one finding: Observed, Why highlighted, statistical status, cautions, fields and transformations. */
    function blocks(x) {
      const block = (label, lines, cls = "") => h("div", { class: `finding-block ${cls}` }, h("p", { class: "label", text: label }), h("ul", {}, lines.map((t) => h("li", { text: t }))));
      return [block("Observed", x.observed, "observed"), block("Why highlighted", x.why, "why"), block("Statistical status", x.status, "status"), block("Cautions", x.cautions, "cautions"),
        h("p", { class: "note finding-fields", text: `Fields: ${x.fields.join(", ")}. Transformations: ${x.transform.join(" ")}` })];
    }

    function card(table, r, id, key) {
      const x = finding(table, r, id);
      if (!x) return null;
      const place = r.places[/** @type {"unusual" | "supported"} */ (key)].get(id);
      return h("li", { class: "finding card", "data-finding": id },
        h("div", { class: "finding-head" }, app.gallery.thumb(table.name, id, x.title),
          h("div", {}, h("p", { class: "figure-name" }, h("strong", { text: `${place}. ${x.title}` }), h("span", { class: "note", text: Render.KIND_LABEL[x.kind] })),
            h("p", { class: "note", text: key === "unusual" ? `Unusualness ${fmt(x.unusualness, 3)} · cluster ${x.cluster}` : `Adjusted p-value ${Rank.pval(x.adjusted)} · cluster ${x.cluster}` }))),
        h("div", { class: "finding-body" }, blocks(x)));
    }

    function row(table, r, id, place, key) {
      const e = r.entries.get(id);
      const lit = (key === "unusual" ? r.highlights.unusual : r.highlights.supported).includes(id);
      const body = h("div", { class: "finding-body" });
      const details = h("details", { class: "finding-row", ontoggle: (ev) => {
        if (!ev.target.open || body.childElementCount) return;
        const x = finding(table, r, id);
        if (x) body.append(h("p", { class: "actions" }, h("button", { type: "button", onclick: () => app.gallery.open(table.name, id), text: "Open the chart" })), ...blocks(x));
      } }, h("summary", {}, h("strong", { text: `${place}. ${e.title}` }), h("span", { class: "note", text: ` ${Render.KIND_LABEL[e.kind]} · ${key === "unusual" ? `unusualness ${fmt(e.unusualness, 3)}` : `adjusted p-value ${Rank.pval(e.adjusted)}`} · ${e.cluster}${lit ? " · highlighted" : ""}` })), body);
      return h("li", {}, details);
    }

    /** A family's members: each hypothesis with its test, statistic, effect, n, raw and adjusted p, or why not tested. */
    function familyView(fam, st, key, title) {
      const order = [...fam.members].sort((a, b) => (a.status === "tested" ? 0 : 1) - (b.status === "tested" ? 0 : 1) || (a.adjusted ?? a.p ?? 2) - (b.adjusted ?? b.p ?? 2));
      return h("details", { class: "outcomes family", open: !!st.open[key], ontoggle: (ev) => { st.open[key] = ev.target.open; } },
        h("summary", {}, title),
        h("p", { class: "note", text: fam.definition }),
        h("p", { class: "note", text: `Raw and adjusted p-values: the adjustment is Benjamini–Yekutieli over the ${fmtInt(fam.m)} tests that passed their checks and ran (m), since tests share rows and fields; an adjusted p-value at or below 0.05 is exploratory evidence. Members not tested are listed with the reason and are not counted in m. Every rule: ` },
          h("a", { href: "catalog.md", text: "test catalogue v1" }), "."),
        ...(fam.cautions ?? []).map((c) => h("p", { class: "note", text: c })),
        h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": `${title}, scrolls sideways` },
          h("table", { class: "grid" },
            h("thead", {}, h("tr", {}, ["Hypothesis", "Pattern", "Fields", "Test", "Statistic", "Effect", "n", "Raw p", "Adjusted p-value", "Status"].map((x) => h("th", { scope: "col", text: x })))),
            h("tbody", {}, order.map((m) => h("tr", { "data-hypothesis": m.id },
              h("th", { scope: "row", class: "mono", text: m.id }),
              h("td", { text: Family.PATTERNS[/** @type {keyof typeof Family.PATTERNS} */ (m.pattern)].label }),
              h("td", { text: m.fields.join(", ") }),
              h("td", { text: m.test ?? "–" }),
              h("td", { class: "num", text: m.result ? `${m.result.statistic.name} ${fmt(m.result.statistic.value, 3)}` : "–" }),
              h("td", { class: "num", text: m.effect ? `${m.effect.name} ${fmt(m.effect.value, 3)}` : "–" }),
              h("td", { class: "num", text: m.result ? fmtInt(m.result.n) : "–" }),
              h("td", { class: "num", text: Rank.pval(m.p) }),
              h("td", { class: "num", text: Rank.pval(m.adjusted) }),
              h("td", { text: m.status === "tested" ? (m.flag ? "Exploratory evidence" : m.adjusted === null ? "Tested" : "Tested, adjusted p above 0.05") : m.reason })))))));
    }

    /** Subsets the person opens as families of their own. */
    function subsets(table, st, charts) {
      const options = (charts?.classes ?? []).filter((f) => f.cls === "C" && f.levels <= 12).flatMap((f) => (st.family.measures.levels[f.name]?.names ?? []).map((level) => [JSON.stringify([f.name, level]), `${f.name} = ${level}`]));
      const out = [h("h4", { text: "Subsets as families of their own" }),
        h("p", { class: "note", text: "A subset of the rows (one level of a category of at most 12 levels) is a new family with its own hypotheses, tests and adjustment, apart from the table's. Its findings do not enter the two lists, which rank the table's charts." })];
      if (options.length) {
        out.push(h("form", { class: "filters", onsubmit: (ev) => { ev.preventDefault(); const v = new FormData(ev.target).get("subset"); if (v) { const [field, level] = JSON.parse(String(v)); analyse(table, { field, level }); } } },
          h("div", { class: "field" }, h("label", { for: "subset-pick", text: "Subset" }), h("select", { id: "subset-pick", name: "subset" }, options.map(([v, l]) => h("option", { value: v, text: l })))),
          h("button", { type: "submit", disabled: !!store.busy, text: "Test this subset as a family" })));
      } else out.push(h("p", { class: "note", text: "No category of at most 12 levels to take a subset by." }));
      for (const f of st.subsets) {
        out.push(familyView(f, st, `subset:${f.name}`, `Family ${f.name}, run ${f.run}: ${plural(f.members.length, "hypothesis", "hypotheses")}, ${fmtInt(f.m)} tested, ${f.status === "complete" ? `${fmtInt(f.flagged)} with an adjusted p-value at or below 0.05` : `incomplete (${f.reason})`}`),
          h("p", { class: "actions" }, h("button", { type: "button", class: "small", onclick: () => { st.subsets = st.subsets.filter((x) => x !== f); app.note({ kind: "statistics", table: table.name, text: `Removed the family ${f.name}.` }); app.refresh(); }, text: `Remove ${f.name}` })));
      }
      return h("section", { "aria-label": "Subset families" }, out);
    }

    /* ---------- what the record and the tools read ---------- */

    /** A family without what each test needed: ids, tests, statistics, effects, p-values and reasons. */
    function familyOut(fam) {
      return { name: fam.name, run: fam.run, status: fam.status, reason: fam.reason || undefined, catalogue: fam.catalogue, grammar: fam.grammar, method: fam.method, alpha: fam.alpha,
        definition: fam.definition, size: fam.size, m: fam.m, notTested: fam.notTested, flagged: fam.flagged, study: fam.study, cautions: fam.cautions,
        independence: fam.independence, leftOut: Object.keys(fam.sentinels ?? {}).length ? fam.sentinels : undefined };
    }

    /** One hypothesis for the tools. */
    const hypothesisOut = (m) => ({ id: m.id, pattern: m.pattern, fields: m.fields, status: m.status, reason: m.reason || undefined, test: m.test ?? undefined,
      statistic: m.result?.statistic, df: m.result?.df, n: m.result?.n, effect: m.effect ?? undefined, ci: m.result?.effect?.ci ?? undefined, p: m.p ?? undefined,
      adjusted: m.adjusted ?? undefined, evidence: m.flag || undefined, assumption: m.assumption || undefined, seed: m.result?.seed });

    /** The findings of a table for the snapshot: the family's counts and each list's highlights by title. */
    function summary(name) {
      const st = stateOf(name);
      if (!st || !st.family) return st ? { status: st.status, reason: st.reason } : null;
      const r = ranked(name);
      const titles = (ids) => ids.map((id) => r.entries.get(id).title);
      return { status: st.status, family: familyOut(st.family), subsets: st.subsets.map((f) => ({ name: f.name, run: f.run, status: f.status, size: f.members.length, m: f.m, flagged: f.flagged })),
        highlights: r ? r.count : null, unusual: r ? { charts: r.unusual.length, highlighted: titles(r.highlights.unusual) } : null,
        supported: r ? { charts: r.supported.length, highlighted: titles(r.highlights.supported), adjusted: r.highlights.supported.map((id) => r.entries.get(id).adjusted) } : null };
    }

    /** The get_findings tool: the family, both lists with their highlights explained, one chart's finding, or the hypotheses. */
    function tool(name, o = {}) {
      const st = stateOf(name);
      const table = store.tables.find((t) => t.name === name);
      if (!st || !st.family || !table) return null;
      const r = ranked(name);
      if (o.id) {
        const x = r ? finding(table, r, o.id) : null;
        const cand = app.gallery.state(name)?.candidates.find((c) => c.id === o.id);
        if (!cand) return null;
        if (!x) return { id: o.id, outcome: cand.outcome, reason: cand.reason || "Not ranked: the family is not complete, or the charts changed since the statistics ran.", hypotheses: [] };
        const keys = new Set(r.entries.get(o.id).hypotheses);
        return { ...x, places: { unusual: r.places.unusual.get(o.id), supported: r.places.supported.get(o.id) ?? null }, hypotheses: st.family.members.filter((m) => keys.has(m.id)).map(hypothesisOut) };
      }
      const offset = Math.max(0, Math.floor(o.offset ?? 0));
      const entry = (id, place) => { const e = r.entries.get(id); return { place, id, kind: e.kind, fields: e.fields, title: e.title, unusualness: e.unusualness, adjusted: e.adjusted ?? undefined, usefulness: e.usefulness.score, measure: e.usefulness.name, penalties: e.penalties.map((p) => p.rule), cluster: e.cluster }; };
      const out = { table: name, family: familyOut(st.family), subsets: st.subsets.map((f) => ({ ...familyOut(f), hypotheses: f.members.map(hypothesisOut) })) };
      if (o.list === "family") return { ...out, offset, hypotheses: st.family.members.slice(offset, offset + 1000).map(hypothesisOut) };
      if (!r) return { ...out, lists: null, reason: "The two lists need a complete family whose charts have not changed since it ran." };
      const lists = { highlights: r.count, unusual: { charts: r.unusual.length, highlighted: r.highlights.unusual.map((id) => finding(table, r, id)), fewer: r.fewer.unusual },
        supported: { charts: r.supported.length, highlighted: r.highlights.supported.map((id) => finding(table, r, id)), fewer: r.fewer.supported } };
      if (o.list === "unusual" || o.list === "supported") {
        const ids = o.list === "unusual" ? r.unusual : r.supported;
        return { ...out, list: o.list, offset, count: ids.length, entries: ids.slice(offset, offset + 1000).map((id, i) => entry(id, offset + i + 1)) };
      }
      return { ...out, lists };
    }

    /** Take saved study details (a reopened project) before the table's statistics first run. @param {string} name @param {any} study */
    function restoreStudy(name, study) {
      ensure(name).study = { ...Family.NO_STUDY, ...(study ?? {}) };
    }

    return { analyse, draw, drop, summary, tool, ranked, restoreStudy, state: stateOf };
  }

  return { mount };
});
