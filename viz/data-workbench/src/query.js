/* Universal Data Workbench: the Query and transform panel: the visual controls, the SQL editor, the result, the
 * derived views and tables, and the transformation records.
 *
 * Both ways of working make the same thing: a result with an explicit order and a record for each transformation
 * (src/transform.js). The controls build a pipeline of steps (src/algebra.js) and show each step's SQL as it is
 * edited; the editor runs statements of the whitelist (src/sqlcheck.js), kept verbatim as custom nodes. A result can
 * be saved as a derived view or table, which queries and the controls then read like any table, or analysed: it
 * becomes a table of its own with a profile, charts and a hypothesis family (app.analyse). Records of what made a
 * derived object are kept with ids (t1, t2, …) and referenced by its charts' specifications.
 */
(function (root, factory) {
  root.DWQuery = factory(root.DWSql, root.DWSqlCheck, root.DWAlgebra, root.DWTransform);
})(typeof self !== "undefined" ? self : this, function (Sql, Check, Algebra, Transform) {
  "use strict";

  const STARTER = "-- Statements of the whitelist: SELECT, WITH, PIVOT, UNPIVOT, CREATE VIEW, CREATE TABLE … AS, DROP.\nSELECT *\nFROM ";

  /**
   * Mount the panel. `app` gives the page's store, h(), byId(), formatting, busy(), exclusive(), progress(),
   * refresh(), ensureEngine(), note(), message(), cancel() and analyse(entry), which makes a derived table a table
   * of the workbench with its profile, charts and family.
   * @param {any} app
   */
  function mount(app) {
    const { store, h, byId, fmtInt, plural } = app;
    store.transforms = store.transforms ?? [];
    store.derived = store.derived ?? [];
    const view = { mode: "controls", source: "", steps: /** @type {any[]} */ ([]), inputs: /** @type {any[]} */ ([]), planError: "", planning: false,
      sql: "", last: /** @type {any} */ (null), name: "", values: /** @type {Record<string, any>} */ ({}) };
    let seq = 0;

    /* ---------- the catalog ---------- */

    const imported = () => store.tables.filter((t) => t.kind !== "derived");
    const derivedOf = (name) => store.derived.find((d) => d.name === name);
    /** Every table a query may read, with its columns: imports and derived objects. */
    function tables() {
      /** @type {Record<string, { columns: { name: string, type: string }[] }>} */
      const out = {};
      for (const t of imported()) out[t.name] = { columns: t.imported.columns.map((c) => ({ name: c.name, type: c.type })) };
      for (const d of store.derived) out[d.name] = { columns: d.columns };
      return out;
    }
    const checkCatalog = () => ({ imported: imported().map((t) => t.name), derived: Object.fromEntries(store.derived.map((d) => [d.name, d.kind])) });
    const names = () => [...store.tables.map((t) => t.name), ...store.derived.map((d) => d.name), ...store.queue.map((q) => q.name)];
    /** The readings of an imported table's text columns, for the readings step: those that read as more than text. */
    function readingsOf(name) {
      const t = store.tables.find((x) => x.name === name && x.kind !== "derived");
      /** @type {Record<string, any>} */
      const out = {};
      for (const c of t?.columns ?? []) if (!c.failed && c.textSource && c.reading.kind !== "text" && c.reading.kind !== "source") out[c.name] = c.reading;
      return out;
    }
    /** The views that read an object, directly or through other views. */
    function dependents(name) {
      const out = [];
      const walk = (n) => {
        for (const d of store.derived) if (d.kind === "view" && d.inputs.includes(n) && !out.includes(d.name)) { out.push(d.name); walk(d.name); }
      };
      walk(name);
      return out;
    }
    /** The ids of the records that made an object, with those of the derived objects it reads, oldest first. */
    function lineage(name, seen = new Set()) {
      const d = derivedOf(name);
      if (!d || seen.has(name)) return [];
      seen.add(name);
      const ids = [...d.inputs.flatMap((i) => lineage(i, seen)), ...d.records];
      return ids.filter((x, i) => ids.indexOf(x) === i).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    }

    /** Keep records with ids, and return the ids. */
    function keep(records, defines) {
      return records.map((r) => {
        const id = `t${store.transforms.length + 1}`;
        store.transforms.push({ id, ...r, defines });
        return id;
      });
    }

    /* ---------- running ---------- */

    function catalogFor(source) {
      return { tables: tables(), names: names(), readings: readingsOf(source) };
    }

    /** Run the controls' pipeline: every step and its record, then the result. */
    function runControls() {
      if (!view.source) return Promise.resolve();
      return app.busy("Running the controls", async () => {
        const api = await app.ensureEngine();
        const pipeline = { source: view.source, steps: view.steps.map(clean) };
        try {
          const r = await Transform.runPipeline(api.query, pipeline, catalogFor(view.source), { stopped: () => store.stop, onStep: (k, n) => app.progress(`Step ${k + 1} of ${n}`, k, n) });
          const preview = r.result ? await Transform.preview(api.query, r.result.columns) : [];
          view.last = { from: "controls", text: r.sql, ordered: true, records: r.steps.map((s) => s.record), result: r.result, preview, error: r.error, pipeline, refusals: [] };
        } catch (error) {
          view.last = { from: "controls", text: "", records: [], result: null, preview: [], error: app.message(error), refusals: [] };
        }
      });
    }

    /** Run the editor's statements in order: all are checked first, and nothing runs when one is refused. */
    function runSql() {
      const checked = Check.check(view.sql, checkCatalog());
      if (!checked.ok) {
        view.last = { from: "sql", text: view.sql, records: [], result: null, preview: [], error: checked.error, refusals: checked.statements.filter((s) => !s.ok).map((s) => `Statement ${s.n}: ${s.reason}`) };
        app.note({ kind: "refused", text: `SQL refused before anything ran: ${checked.error}` });
        app.refresh();
        return Promise.resolve();
      }
      return app.busy("Running the SQL", async () => {
        const api = await app.ensureEngine();
        const records = [];
        let result = null, preview = [], error = "", queryText = "", ordered = false;
        for (const s of checked.statements) {
          if (store.stop) { error = "You cancelled before every statement ran."; break; }
          app.progress(`Statement ${s.n} of ${checked.statements.length}`, s.n - 1, checked.statements.length);
          const blocked = s.kind === "drop" ? dropProblem(s.name) : s.kind.startsWith("create") && s.replace ? replaceProblem(s.name) : "";
          if (blocked) { error = `Statement ${s.n}: ${blocked}`; break; }
          try {
            const r = await Transform.runStatement(api.query, s);
            records.push(r.record);
            if (s.kind === "query") { result = r.result; preview = await Transform.preview(api.query, r.result.columns); queryText = s.query.text; ordered = s.query.ordered; }
            else applyDdl(s, r);
          } catch (e) {
            error = `Statement ${s.n}: ${app.message(e)}`;
            records.push({ kind: s.kind, source: "sql", label: `Statement ${s.n}`, sql: s.text, status: "failed", error: app.message(e), inputs: s.query?.refs ?? [], columns: [], rowsIn: [], notes: [], conversions: [], aggregates: [], joins: [] });
            break;
          }
        }
        view.last = { from: "sql", text: queryText, ordered, records, result, preview, error, refusals: [] };
      });
    }

    /** Why an object cannot be dropped: views read it. */
    function dropProblem(name) {
      const deps = dependents(name);
      return deps.length ? `${name} is read by the view${deps.length > 1 ? "s" : ""} ${deps.join(", ")}: drop ${deps.length > 1 ? "them" : "it"} first.` : "";
    }
    /** Why an object cannot be replaced: it is analysed (its profile and charts read it), or views read it. */
    function replaceProblem(name) {
      if (store.tables.some((t) => t.name === name)) return `${name} is analysed; remove it from the workbench in Inspect before you replace it.`;
      return "";
    }

    /** After CREATE or DROP: the registry of derived objects, the kept record and the log. */
    function applyDdl(s, r) {
      if (s.kind === "drop") {
        const d = derivedOf(s.name);
        if (!d) return;
        const [id] = keep([r.record], s.name);
        store.derived = store.derived.filter((x) => x !== d);
        const analysed = store.tables.find((t) => t.name === s.name);
        if (analysed) app.forget(analysed);
        app.note({ kind: "derived", table: s.name, text: `Dropped the derived ${d.kind} ${s.name} (${id}).` });
        return;
      }
      const kind = s.kind === "create-view" ? "view" : "table";
      const old = derivedOf(s.name);
      if (old && s.ifNotExists && !s.replace) return;
      const ids = keep([r.record], s.name);
      register({ name: s.name, kind, sql: s.text, query: s.query.text, ordered: s.query.ordered, inputs: s.query.refs, records: ids, rows: r.rows, columns: r.columns, origin: "SQL" });
      app.note({ kind: "derived", table: s.name, text: `Made the derived ${kind} ${s.name} with SQL (${ids.join(", ")}): ${plural(r.rows, "row", "rows")}, ${plural(r.columns.length, "column", "columns")}.` });
    }

    function register(entry) {
      const at = store.derived.findIndex((d) => d.name === entry.name);
      store.derived = at < 0 ? [...store.derived, entry] : store.derived.map((d, i) => (i === at ? entry : d));
    }

    /** Save the result as a derived view or table, or analyse it. */
    function save(kind) {
      const last = view.last;
      const name = view.name.trim();
      const problem = nameProblem(name);
      if (problem) { view.error = problem; app.refresh(); return Promise.resolve(); }
      view.error = "";
      if (kind === "analyse") return analyse(name, last.text, last.ordered, last, `the result of ${last.from === "controls" ? "the controls" : "the SQL"}`);
      return app.busy(`Saving ${name}`, async () => {
        const api = await app.ensureEngine();
        const statement = `CREATE ${kind.toUpperCase()} ${Sql.ident(name)} AS ${last.text}`;
        const checked = Check.check(statement, checkCatalog());
        if (!checked.ok) { view.error = checked.error; return; }
        try {
          const r = await Transform.runStatement(api.query, checked.statements[0]);
          const steps = last.from === "controls" ? last.records : [];
          const ids = keep([...steps, r.record], name);
          const s = checked.statements[0];
          register({ name, kind, sql: statement, query: last.text, ordered: last.ordered, inputs: last.from === "controls" ? inputsOf(last) : s.query.refs, records: ids, rows: r.rows, columns: r.columns,
            origin: last.from === "controls" ? "the visual controls" : "SQL", pipeline: last.pipeline ?? null });
          app.note({ kind: "derived", table: name, text: `Saved the derived ${kind} ${name} (${ids.join(", ")}): ${plural(r.rows, "row", "rows")}, ${plural(r.columns.length, "column", "columns")}.` });
          view.name = "";
        } catch (e) {
          view.error = `Not saved: ${app.message(e)}`;
        }
      });
    }

    /** The tables a pipeline reads: its source and the tables its steps join or combine with. */
    const inputsOf = (last) => [last.pipeline.source, ...last.pipeline.steps.filter((s) => s.table).map((s) => s.table)].filter((x, i, l) => l.indexOf(x) === i);

    /**
     * Make a result a table to analyse: CREATE TABLE with its row column, a record of it, then the table's profile,
     * charts and family. `from` is the result (its records are kept) or null for a derived object analysed as it is.
     */
    function analyse(name, text, ordered, from, what) {
      return app.busy(`Analysing ${name}`, async () => {
        const api = await app.ensureEngine();
        try {
          const a = await Transform.analysable(api.query, name, text, ordered);
          await api.query(a.sql);
          const columns = await Transform.describe(api.query, Sql.ident(name));
          const rows = (await api.query(`SELECT count(*)::DOUBLE AS n FROM ${Sql.ident(name)}`))[0].n;
          const inputs = from ? (from.from === "controls" ? inputsOf(from) : Check.check(text, checkCatalog()).statements[0]?.query?.refs ?? []) : [what.replace(/^the derived (view|table) /, "")];
          const record = { kind: "analyse", source: "analysis", label: `Analyse as ${name}`, inputs, parameters: { rowColumn: a.rowColumn }, sql: a.sql, columns, rowsIn: [], rowsOut: rows,
            order: a.how, notes: [`A selected result, analysed as its own table, chart set and family. Its row column: ${a.how}.`], conversions: [], aggregates: [], joins: [], status: "ok", error: "" };
          const ids = keep([...(from?.records ?? []).filter((r) => r.status !== "failed"), record], name);
          register({ name, kind: "table", sql: a.sql, query: text, ordered, inputs, records: ids, rows, columns, origin: from ? (from.from === "controls" ? "the visual controls" : "SQL") : "a derived object", analysed: true, pipeline: from?.pipeline ?? null,
            rowColumn: a.rowColumn, how: a.how, what });
          app.note({ kind: "derived", table: name, text: `Analysing ${what} as ${name} (${ids.join(", ")}): ${plural(rows, "row", "rows")}; its own profile, charts and family follow.` });
          view.name = "";
          await app.analyse({ name, rowColumn: a.rowColumn, rows, columns, lineage: lineage(name), what, sql: a.sql, how: a.how });
        } catch (e) {
          view.error = `Not analysed: ${app.message(e)}`;
        }
      });
    }

    /** Drop a derived object through the whitelist, as the editor would. */
    function dropObject(d) {
      view.sql = `DROP ${d.kind.toUpperCase()} ${Sql.ident(d.name)}`;
      view.mode = "sql";
      return runSql();
    }

    function nameProblem(name) {
      if (!name) return "Name the view or table first.";
      return Check.nameProblem(name, checkCatalog()) || (names().includes(name) ? `${name} is taken: choose another name.` : "");
    }

    /* ---------- planning the controls ---------- */

    /** A step as the compiler takes it: without the page's own fields. */
    const clean = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith("_")));

    /**
     * Each step's input columns, from the engine (DESCRIBE of the chain so far), so the forms list what each step
     * reads; a pivot's values are listed here too. Runs nothing but DESCRIBE and the pivot's distinct values.
     */
    let planned = 0;
    function plan() {
      const ticket = ++planned;
      if (!view.source) { view.inputs = []; return; }
      app.exclusive(async () => {
        if (ticket !== planned) return;
        const api = await app.ensureEngine();
        const cat = catalogFor(view.source);
        const stepNames = view.steps.map((_, i) => Algebra.stepName(i + 1, cat.names));
        const src = cat.tables[view.source];
        if (!src) return;
        let input = { ref: Sql.ident(view.source), columns: src.columns, order: Algebra.defaultOrder(src.columns) };
        const inputs = [], compiled = [];
        let error = "";
        for (const [i, step] of view.steps.entries()) {
          inputs.push(input.columns);
          step._error = "";
          try {
            if (step.op === "pivot" && step.on && step._valuesFor !== step.on && input.columns.some((c) => c.name === step.on)) {
              const prefix = Algebra.chain(view.source, compiled, null, stepNames.slice(0, i));
              const vals = await api.query(`SELECT DISTINCT CAST(${Sql.ident(step.on)} AS VARCHAR) AS v FROM (${prefix}) WHERE ${Sql.ident(step.on)} IS NOT NULL ORDER BY 1 LIMIT ${Algebra.MAX_PIVOT + 1}`);
              step.values = vals.map((r) => r.v);
              step._valuesFor = step.on;
            }
            const c = Algebra.compileStep(clean(step), { ...input, ref: Sql.ident(i ? stepNames[i - 1] : view.source) }, { ...cat, readings: i === 0 ? cat.readings : {} });
            step._sql = c.sql;
            compiled.push(c);
            const columns = await Transform.describe(api.query, `(${Algebra.chain(view.source, compiled, null, stepNames.slice(0, i + 1))})`);
            input = { ref: Sql.ident(stepNames[i]), columns, order: c.order };
          } catch (e) {
            step._error = app.message(e);
            error = `Step ${i + 1}: ${step._error}`;
            break;
          }
        }
        for (let k = inputs.length; k < view.steps.length; k += 1) inputs.push(input.columns);
        if (ticket !== planned) return;
        view.inputs = inputs;
        view.output = input.columns;
        view.planError = error;
        view.chain = error ? "" : Algebra.chain(view.source, compiled, input.order, stepNames);
        app.refresh();
      });
    }

    /* ---------- drawing ---------- */

    function draw() {
      const out = byId("query-view");
      if (!out) return;
      const any = store.tables.length > 0;
      byId("query-empty").hidden = any;
      if (!any) { out.replaceChildren(); return; }
      const focused = document.activeElement?.id;
      out.replaceChildren(
        h("div", { class: "seg mode", role: "group", "aria-label": "How to transform" },
          [["controls", "Visual controls"], ["sql", "SQL editor"]].map(([m, l]) => h("button", { type: "button", "aria-pressed": String(view.mode === m), "data-mode": m, onclick: () => { view.mode = m; app.refresh(); }, text: l }))),
        view.mode === "controls" ? controls() : editor(),
        result(),
        derivedList(),
        recordsList());
      if (focused) { const el = byId(focused); if (el instanceof HTMLElement) el.focus(); }
    }

    let uid = 0;
    const field = (label, control) => {
      const id = control.id || `q-${++uid}`;
      control.id = id;
      return h("div", { class: "field" }, h("label", { for: id, text: label }), control);
    };
    /** A select whose change sets a step's parameter. */
    const select = (id, options, value, onchange) => h("select", { id, onchange: (ev) => onchange(ev.target.value) },
      options.map(([v, l]) => h("option", { value: v, selected: String(value ?? "") === String(v), text: l })));
    const input = (id, value, onchange, type = "text", extra = {}) => h("input", { id, type, value: value ?? "", autocomplete: "off", spellcheck: "false", ...extra, onchange: (ev) => onchange(ev.target.value) });
    const checks = (legend, list, chosen, onchange, name) => h("fieldset", { class: "checks" }, h("legend", { text: legend }),
      list.map((c) => h("label", { class: "choice" }, h("input", { type: "checkbox", name, value: c, checked: chosen.includes(c), onchange: (ev) => onchange(ev.target.checked ? [...chosen, c] : chosen.filter((x) => x !== c)) }), ` ${c}`)));
    const tick = (label, checked, onchange) => h("label", { class: "choice" }, h("input", { type: "checkbox", checked, onchange: (ev) => onchange(ev.target.checked) }), ` ${label}`);

    function controls() {
      const all = Object.keys(tables());
      if (view.source && !all.includes(view.source)) { view.source = ""; view.steps = []; }
      const set = (step, key) => (v) => { step[key] = v; changed(); };
      const steps = view.steps.map((step, i) => stepView(step, i, set));
      const add = select("q-add", [["", "Add a step…"], ...Algebra.OPS.map((o) => [o.id, o.label])], "", (v) => {
        if (!v) return;
        view.steps.push(starter(v, view.output ?? tables()[view.source]?.columns ?? []));
        changed();
        setTimeout(() => byId(`q-step-${view.steps.length}`)?.scrollIntoView({ block: "nearest" }), 0);
      });
      return h("section", { class: "controls", "aria-label": "Visual controls" },
        h("p", { class: "note", text: "Build a transformation step by step. Each step shows the SQL it runs; the whole pipeline is one statement of the whitelist, which you can open in the SQL editor." }),
        field("Start from", select("q-source", [["", "Choose a table"], ...all.map((n) => [n, `${n}${derivedOf(n) ? ` (derived ${derivedOf(n).kind})` : ""}`])], view.source, (v) => { view.source = v; view.steps = []; view.last = null; changed(); })),
        view.source ? h("ol", { class: "steps" }, steps) : null,
        view.source ? h("div", { class: "actions" }, field("Add a step", add)) : null,
        view.planError ? h("p", { class: "warn-text", role: "alert", text: view.planError }) : null,
        view.source ? h("details", { class: "sql-shown", open: true }, h("summary", { text: "The pipeline's SQL" }), h("pre", { class: "mono wrap", "data-pipeline-sql": "", text: view.chain || Algebra.chain(view.source, [], Algebra.defaultOrder(tables()[view.source]?.columns ?? []), []) })) : null,
        view.source ? h("p", { class: "actions" },
          h("button", { type: "button", class: "primary", id: "q-run", disabled: !!store.busy || !!view.planError || view.planning, onclick: runControls, text: "Run the pipeline" }),
          h("button", { type: "button", disabled: !view.chain && view.steps.length > 0, onclick: () => { view.sql = view.chain || Algebra.chain(view.source, [], Algebra.defaultOrder(tables()[view.source]?.columns ?? []), []); view.mode = "sql"; app.refresh(); }, text: "Open in the SQL editor" })) : null);
    }

    function changed() {
      plan();
      app.refresh();
    }

    /** A new step's parameters, with the first sensible columns of its input. */
    function starter(op, cols) {
      // Columns the source's profile reads as categories come first, then the others; identifiers last.
      const profile = store.tables.find((t) => t.name === view.source)?.columns ?? [];
      const rank = (n) => { const c = profile.find((x) => x.name === n); return !c ? 1 : c.role === "identifier" ? 3 : c.type === "categorical" || c.type === "boolean" ? 0 : 1; };
      const plain = cols.filter((c) => !Algebra.isRowColumn(c.name)).map((c) => c.name).sort((a, b) => rank(a) - rank(b));
      const num = cols.filter((c) => Algebra.isNumeric(c.type)).map((c) => c.name);
      const other = Object.keys(tables()).find((n) => n !== view.source) ?? view.source;
      switch (op) {
        case "columns": return { op, keep: cols.filter((c) => !Algebra.isRowColumn(c.name)).map((c) => c.name), rename: {} };
        case "filter": return { op, match: "all", conditions: [{ column: plain[0] ?? "", op: "present", value: "" }] };
        case "sort": return { op, keys: [{ column: plain[0] ?? "", desc: false, nullsFirst: false }] };
        case "limit": return { op, n: 10, offset: 0 };
        case "distinct": return { op, columns: plain.slice(0, 1) };
        case "compute": return { op, name: "computed", kind: "convert", column: plain[0] ?? "", type: "DOUBLE" };
        case "readings": return { op, columns: Object.keys(readingsOf(view.source)) };
        case "aggregate": return { op, by: plain.slice(0, 1), measures: [{ fn: "count" }], having: null };
        case "join": return { op, table: other, kind: "left", keys: [{ left: plain[0] ?? "", right: (tables()[other]?.columns ?? []).find((c) => !Algebra.isRowColumn(c.name))?.name ?? "" }], nullsMatch: false };
        case "setop": return { op, set: "union_all", table: other, columns: plain.filter((c) => (tables()[other]?.columns ?? []).some((x) => x.name === c)) };
        case "window": return { op, fn: "row_number", column: num[0] ?? plain[0] ?? "", partition: [], order: [{ column: plain[0] ?? "", desc: false }], k: 3, as: "row_number" };
        case "pivot": return { op, rows: plain.slice(0, 1), on: plain[1] ?? "", fn: "count", column: "", values: [] };
        case "unpivot": return { op, columns: plain.slice(-2), name: "name", value: "value", keepMissing: false };
        case "hierarchy": return { op, id: plain[0] ?? "", parent: plain[1] ?? "", maxDepth: 100 };
        default: return { op };
      }
    }

    function stepView(step, i, set) {
      const cols = (view.inputs[i] ?? tables()[view.source]?.columns ?? []);
      const names = cols.filter((c) => !Algebra.isRowColumn(c.name)).map((c) => c.name);
      const opts = (list = names, blank = "") => [...(blank ? [["", blank]] : []), ...list.map((n) => [n, n])];
      const id = (k) => `q-${i + 1}-${k}`;
      const op = Algebra.OP[step.op];
      const body = [];
      switch (step.op) {
        case "columns":
          body.push(h("fieldset", { class: "checks" }, h("legend", { text: "Keep, and rename if you like" }),
            names.map((n) => h("div", { class: "keep-row" },
              h("label", { class: "choice" }, h("input", { type: "checkbox", checked: step.keep.includes(n), onchange: (ev) => { step.keep = ev.target.checked ? names.filter((x) => x === n || step.keep.includes(x)) : step.keep.filter((x) => x !== n); changed(); } }), ` ${n}`),
              step.keep.includes(n) ? h("input", { type: "text", "aria-label": `New name for ${n}`, placeholder: "same name", value: step.rename[n] ?? "", onchange: (ev) => { step.rename[n] = ev.target.value; changed(); } }) : null))));
          break;
        case "filter":
          body.push(field("Keep rows that meet", select(id("match"), [["all", "every condition (AND)"], ["any", "any condition (OR)"]], step.match, set(step, "match"))));
          step.conditions.forEach((c, k) => {
            const setc = (key) => (v) => { c[key] = v; changed(); };
            body.push(h("div", { class: "row-group" },
              field("Column", select(id(`c${k}`), opts(), c.column, setc("column"))),
              field("Is", select(id(`o${k}`), Object.entries(Algebra.FILTER_OPS), c.op, setc("op"))),
              ["missing", "present"].includes(c.op) ? null : field(c.op === "in" ? "Values, separated by commas" : "Value", input(id(`v${k}`), c.value, setc("value"))),
              c.op === "between" ? field("And", input(id(`w${k}`), c.value2, setc("value2"))) : null,
              step.conditions.length > 1 ? h("button", { type: "button", class: "small", onclick: () => { step.conditions.splice(k, 1); changed(); }, text: "Remove condition" }) : null));
          });
          body.push(h("button", { type: "button", class: "small", onclick: () => { step.conditions.push({ column: names[0] ?? "", op: "=", value: "" }); changed(); }, text: "Add a condition" }));
          break;
        case "sort":
          step.keys.forEach((k, n) => body.push(h("div", { class: "row-group" },
            field(n ? "Then by" : "Sort by", select(id(`k${n}`), opts(), k.column, (v) => { k.column = v; changed(); })),
            tick("Descending", k.desc, (v) => { k.desc = v; changed(); }), tick("Missing values first", k.nullsFirst, (v) => { k.nullsFirst = v; changed(); }),
            step.keys.length > 1 ? h("button", { type: "button", class: "small", onclick: () => { step.keys.splice(n, 1); changed(); }, text: "Remove" }) : null)));
          body.push(h("button", { type: "button", class: "small", onclick: () => { step.keys.push({ column: names[0] ?? "", desc: false, nullsFirst: false }); changed(); }, text: "Add a sort key" }));
          break;
        case "limit":
          body.push(h("div", { class: "row-group" }, field("Rows", input(id("n"), step.n, set(step, "n"), "number", { min: "0", step: "1" })), field("After (offset)", input(id("offset"), step.offset, set(step, "offset"), "number", { min: "0", step: "1" }))));
          break;
        case "distinct":
          body.push(checks("Distinct over (none ticked: every column)", names, step.columns, (v) => { step.columns = v; changed(); }, id("cols")));
          break;
        case "compute": computeForm(step, body, id, opts, names, set); break;
        case "readings": {
          const r = readingsOf(view.source);
          body.push(i === 0 && Object.keys(r).length ? checks("Read these columns as the profile reads them", Object.keys(r), step.columns, (v) => { step.columns = v; changed(); }, id("cols"))
            : h("p", { class: "note", text: "This step reads an imported table's own text columns, so it comes first, on a table whose profile reads some column as more than text." }));
          break;
        }
        case "aggregate": {
          body.push(checks("Group by", names, step.by, (v) => { step.by = v; changed(); }, id("by")));
          step.measures.forEach((m, k) => {
            const a = Algebra.AGG[m.fn] ?? {};
            const setm = (key) => (v) => { m[key] = v; changed(); };
            body.push(h("div", { class: "row-group" },
              field("Aggregate", select(id(`f${k}`), Object.entries(Algebra.AGG).map(([v, x]) => [v, x.label]), m.fn, setm("fn"))),
              a.column ? field("Of", select(id(`m${k}`), opts(names, "Choose"), m.column, setm("column"))) : null,
              a.second ? field("And", select(id(`n${k}`), opts(names, "Choose"), m.column2, setm("column2"))) : null,
              m.fn === "quantile" ? field("Quantile (0 to 1)", input(id(`p${k}`), m.p ?? 0.5, setm("p"), "number", { min: "0", max: "1", step: "0.01" })) : null,
              field("Name", input(id(`a${k}`), m.as ?? "", setm("as"), "text", { placeholder: "automatic" })),
              step.measures.length > 1 ? h("button", { type: "button", class: "small", onclick: () => { step.measures.splice(k, 1); changed(); }, text: "Remove" }) : null));
          });
          body.push(h("button", { type: "button", class: "small", onclick: () => { step.measures.push({ fn: "mean", column: names[0] ?? "" }); changed(); }, text: "Add an aggregate" }));
          const outNames = step.measures.map((m) => String(m.as ?? "").trim() || (m.fn === "count" ? "rows" : `${m.fn === "count_values" ? "n" : m.fn === "quantile" ? `q${String(m.p ?? 0.5).replace(/^0?\./, "")}` : m.fn}_${m.column}${m.fn === "corr" ? `_${m.column2}` : ""}`));
          const hv = step.having ?? { measure: "", op: ">", value: "" };
          body.push(h("div", { class: "row-group" },
            field("HAVING (keep groups where)", select(id("hm"), [["", "every group"], ...outNames.map((n) => [n, n])], hv.measure, (v) => { step.having = v ? { ...hv, measure: v } : null; changed(); })),
            step.having ? field("Is", select(id("ho"), ["=", "<>", "<", "<=", ">", ">="].map((o) => [o, o]), hv.op, (v) => { step.having.op = v; changed(); })) : null,
            step.having ? field("Value", input(id("hv"), hv.value, (v) => { step.having.value = v; changed(); }, "number")) : null));
          break;
        }
        case "join": {
          const other = Object.keys(tables());
          const rightCols = (tables()[step.table]?.columns ?? []).filter((c) => !Algebra.isRowColumn(c.name)).map((c) => c.name);
          body.push(h("div", { class: "row-group" },
            field("Join", select(id("table"), other.map((n) => [n, n]), step.table, (v) => { step.table = v; step.keys = [{ left: names[0] ?? "", right: (tables()[v]?.columns ?? []).find((c) => !Algebra.isRowColumn(c.name))?.name ?? "" }]; changed(); })),
            field("Kind", select(id("kind"), Object.entries(Algebra.JOINS).map(([v, l]) => [v, l.replace(" JOIN", "").toLowerCase()]), step.kind, set(step, "kind")))));
          if (step.kind !== "cross") {
            step.keys.forEach((k, n) => body.push(h("div", { class: "row-group" },
              field(n ? "And this column" : "This column", select(id(`l${n}`), opts(names, "Choose"), k.left, (v) => { k.left = v; changed(); })),
              field(`equals ${step.table}'s`, select(id(`r${n}`), opts(rightCols, "Choose"), k.right, (v) => { k.right = v; changed(); })),
              step.keys.length > 1 ? h("button", { type: "button", class: "small", onclick: () => { step.keys.splice(n, 1); changed(); }, text: "Remove" }) : null)));
            body.push(h("button", { type: "button", class: "small", onclick: () => { step.keys.push({ left: "", right: "" }); changed(); }, text: "Add a key pair" }),
              tick("Missing keys match each other (IS NOT DISTINCT FROM)", step.nullsMatch, (v) => { step.nullsMatch = v; changed(); }));
          }
          body.push(h("p", { class: "note", text: "Joins are explicit: matching column names alone do not make a relationship. The record lists unmatched keys on each side, duplicate keys and how many times rows are repeated." }));
          break;
        }
        case "setop": {
          const other = Object.keys(tables());
          const common = names.filter((n) => (tables()[step.table]?.columns ?? []).some((c) => c.name === n));
          body.push(h("div", { class: "row-group" },
            field("Combine", select(id("set"), Object.entries(Algebra.SETOPS).map(([v, l]) => [v, l]), step.set, set(step, "set"))),
            field("With", select(id("table"), other.map((n) => [n, n]), step.table, (v) => { step.table = v; step.columns = names.filter((n) => (tables()[v]?.columns ?? []).some((c) => c.name === n)); changed(); }))),
          checks(`Columns both tables have (${common.length})`, common, step.columns, (v) => { step.columns = v; changed(); }, id("cols")));
          break;
        }
        case "window": {
          const w = Algebra.WINDOW[step.fn] ?? {};
          body.push(h("div", { class: "row-group" },
            field("Function", select(id("fn"), Object.entries(Algebra.WINDOW).map(([v, x]) => [v, x.label]), step.fn, (v) => { step.fn = v; step.as = v; changed(); })),
            w.column ? field("Of", select(id("col"), opts(names, "Choose"), step.column, set(step, "column"))) : null,
            w.k ? field("k", input(id("k"), step.k, set(step, "k"), "number", { min: "1", max: "1000", step: "1" })) : null,
            field("Name", input(id("as"), step.as, set(step, "as")))),
          checks("Partition by (none: the whole table)", names, step.partition, (v) => { step.partition = v; changed(); }, id("part")),
          w.order ? h("div", { class: "row-group" },
            field("Ordered by", select(id("ord"), opts(names, "Choose"), step.order[0]?.column, (v) => { step.order = [{ column: v, desc: step.order[0]?.desc ?? false }]; changed(); })),
            tick("Descending", step.order[0]?.desc ?? false, (v) => { step.order = [{ column: step.order[0]?.column ?? "", desc: v }]; changed(); })) : null);
          break;
        }
        case "pivot": {
          const a = Algebra.AGG[step.fn] ?? {};
          body.push(checks("Rows: one for each value of", names, step.rows, (v) => { step.rows = v; changed(); }, id("rows")),
            h("div", { class: "row-group" },
              field("Columns: one for each value of", select(id("on"), opts(names, "Choose"), step.on, set(step, "on"))),
              field("Each cell", select(id("fn"), Object.entries(Algebra.AGG).filter(([k]) => k !== "corr").map(([v, x]) => [v, x.label]), step.fn, set(step, "fn"))),
              a.column ? field("Of", select(id("col"), opts(names, "Choose"), step.column, set(step, "column"))) : null),
            h("p", { class: "note", text: step.values?.length ? `The values of ${step.on}, listed in the SQL: ${step.values.slice(0, 12).join(", ")}${step.values.length > 12 ? `, … (${step.values.length})` : ""}.` : "Choose the column whose values become columns." }));
          break;
        }
        case "unpivot":
          body.push(checks("Columns to make rows of", names, step.columns, (v) => { step.columns = v; changed(); }, id("cols")),
            h("div", { class: "row-group" }, field("Name column", input(id("name"), step.name, set(step, "name"))), field("Value column", input(id("value"), step.value, set(step, "value")))),
            tick("Keep missing values as rows", step.keepMissing, (v) => { step.keepMissing = v; changed(); }));
          break;
        case "hierarchy":
          body.push(h("div", { class: "row-group" },
            field("Id", select(id("id"), opts(names, "Choose"), step.id, set(step, "id"))),
            field("Parent id", select(id("parent"), opts(names, "Choose"), step.parent, set(step, "parent"))),
            field("Deepest level", input(id("depth"), step.maxDepth, set(step, "maxDepth"), "number", { min: "1", max: "1000", step: "1" }))));
          break;
        default: break;
      }
      const rec = view.last?.from === "controls" && view.last.pipeline?.steps.length === view.steps.length ? view.last.records[i] : null;
      return h("li", { class: "step card", id: `q-step-${i + 1}` },
        h("fieldset", { class: "edit-group" }, h("legend", { text: `Step ${i + 1}: ${op?.label ?? step.op}` }),
          h("p", { class: "note", text: op?.about ?? "" }), body),
        step._error ? h("p", { class: "warn-text", text: step._error }) : step._sql ? h("pre", { class: "mono wrap step-sql", text: step._sql }) : null,
        rec ? recordView(rec, null) : null,
        h("p", { class: "actions" },
          h("button", { type: "button", class: "small", disabled: i === 0, onclick: () => { view.steps.splice(i - 1, 0, view.steps.splice(i, 1)[0]); changed(); }, text: "Move up" }),
          h("button", { type: "button", class: "small", disabled: i === view.steps.length - 1, onclick: () => { view.steps.splice(i + 1, 0, view.steps.splice(i, 1)[0]); changed(); }, text: "Move down" }),
          h("button", { type: "button", class: "small", onclick: () => { view.steps.splice(i, 1); changed(); }, text: "Remove step" })));
    }

    function computeForm(step, body, id, opts, names, set) {
      const kinds = [["convert", "Convert the type (TRY_CAST)"], ["fill", "Fill missing values (coalesce)"], ["arith", "Arithmetic"], ["case", "CASE: one value or another"], ["date", "A date part or period start"], ["text", "A text function"], ["number", "A number function"]];
      body.push(h("div", { class: "row-group" },
        field("Column name", input(id("name"), step.name, set(step, "name"))),
        field("Compute", select(id("kind"), kinds, step.kind, (v) => { step.kind = v; changed(); }))));
      const col = field("Of", select(id("col"), opts(names, "Choose"), step.column, set(step, "column")));
      const operand = (key, label) => {
        const o = step[key] ?? { value: 1 };
        step[key] = o;
        return h("div", { class: "row-group" },
          field(label, select(id(`${key}c`), [["", "a number"], ...names.map((n) => [n, n])], o.column ?? "", (v) => { step[key] = v ? { column: v } : { value: o.value ?? 1 }; changed(); })),
          o.column ? null : field("Number", input(id(`${key}v`), o.value, (v) => { step[key] = { value: v }; changed(); }, "number")));
      };
      switch (step.kind) {
        case "convert": body.push(h("div", { class: "row-group" }, col, field("To", select(id("type"), Algebra.CASTS.map((t) => [t, t]), step.type, set(step, "type"))))); break;
        case "fill": body.push(h("div", { class: "row-group" }, col, field("Missing values become", input(id("value"), step.value, set(step, "value"))))); break;
        case "arith":
          body.push(operand("a", "First"), field("Operation", select(id("op"), [["+", "+"], ["-", "−"], ["*", "×"], ["/", "÷"]], step.operator ?? "+", set(step, "operator"))), operand("b", "Second"));
          break;
        case "case":
          body.push(h("div", { class: "row-group" }, field("When", select(id("col"), opts(names, "Choose"), step.column, set(step, "column"))),
            field("Is", select(id("test"), Object.entries(Algebra.FILTER_OPS), step.test ?? "=", set(step, "test"))),
            ["missing", "present"].includes(step.test) ? null : field("Value", input(id("value"), step.value, set(step, "value")))),
          h("div", { class: "row-group" }, field("Then", input(id("then"), step.then, set(step, "then"))), field("Else", input(id("else"), step.else, set(step, "else")))));
          break;
        case "date":
          body.push(h("div", { class: "row-group" }, col,
            field("Part", select(id("part"), ["year", "quarter", "month", "week", "day", "dayofweek", "hour"].map((p) => [p, p]), step.part ?? "year", set(step, "part"))),
            field("As", select(id("how"), [["part", "its number (date_part)"], ["start", "the period's start (date_trunc)"]], step.how ?? "part", set(step, "how")))));
          break;
        case "text":
          body.push(h("div", { class: "row-group" }, col, field("Function", select(id("fn"), [["upper", "upper"], ["lower", "lower"], ["trim", "trim"], ["length", "length"], ["left", "the first n characters"]], step.fn ?? "upper", set(step, "fn"))),
            step.fn === "left" ? field("n", input(id("n"), step.n ?? 3, set(step, "n"), "number")) : null));
          break;
        case "number":
          body.push(h("div", { class: "row-group" }, col, field("Function", select(id("fn"), ["round", "abs", "ln", "log10", "sqrt", "floor", "ceil"].map((f) => [f, f]), step.fn ?? "round", set(step, "fn"))),
            step.fn === "round" || !step.fn ? field("Digits", input(id("n"), step.n ?? 0, set(step, "n"), "number")) : null));
          break;
        default: break;
      }
    }

    function editor() {
      const area = h("textarea", { id: "sql-editor", class: "mono", rows: "8", spellcheck: "false", autocapitalize: "off", autocomplete: "off", "aria-describedby": "sql-help",
        oninput: (ev) => { view.sql = ev.target.value; } }, view.sql || STARTER + (store.tables[0]?.name ?? ""));
      if (!view.sql) view.sql = area.value;
      const cat = checkCatalog();
      return h("section", { class: "editor", "aria-label": "SQL editor" },
        field("SQL", area),
        h("p", { id: "sql-help", class: "note" }, "The whitelist: SELECT (and FROM-first), WITH and WITH RECURSIVE, PIVOT and UNPIVOT, CREATE [OR REPLACE] VIEW, CREATE [OR REPLACE] TABLE … AS, and DROP VIEW or DROP TABLE of derived objects. Imported tables are read-only. Every statement is checked before any runs. Tables: ",
          h("code", { text: [...cat.imported, ...Object.keys(cat.derived)].join(", ") || "none" }), "."),
        h("p", { class: "actions" },
          h("button", { type: "button", class: "primary", id: "sql-run", disabled: !!store.busy, onclick: runSql, text: "Run" })));
    }

    /** The result of the last run: refusals or an error, the records, the rows, and what to do with it. */
    function result() {
      const last = view.last;
      if (!last) return h("p", { class: "note", text: "Run the pipeline or the SQL to see its result here, with a record of each transformation." });
      const out = [h("h3", { text: last.from === "controls" ? "Result of the controls" : "Result of the SQL" })];
      for (const r of last.refusals) out.push(h("p", { class: "warn-text", role: "alert", "data-refusal": "", text: `Refused: ${r}` }));
      if (last.error && !last.refusals.length) out.push(h("p", { class: "warn-text", role: "alert", text: last.error }));
      if (last.records.length) out.push(h("div", { class: "records", "data-run-records": "" }, h("h4", { text: "What each transformation did" }), last.records.map((r) => recordView(r, null))));
      if (last.result) {
        const r = last.result;
        out.push(h("p", { "data-result": "" }, h("strong", { text: `${plural(r.rows, "row", "rows")}, ${plural(r.columns.length, "column", "columns")}. ` }),
          `In the order of ${r.order}.${r.rows > last.preview.length ? ` The first ${fmtInt(last.preview.length)} are shown.` : ""}`));
        out.push(h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": "Result rows, scroll sideways" },
          h("table", { class: "grid result" },
            h("thead", {}, h("tr", {}, r.columns.map((c) => h("th", { scope: "col" }, c.name, h("span", { class: "type", text: ` ${c.type}` }))))),
            h("tbody", {}, last.preview.map((row) => h("tr", {}, row.map((v) => h("td", { class: v === null ? "null" : "", text: v === null ? "missing" : v }))))))));
        if (last.text) {
          out.push(h("div", { class: "save" },
            field("Name for a derived view or table", input("q-name", view.name, (v) => { view.name = v.trim(); }, "text", { placeholder: `result_${seq + 1}`, maxlength: "63" })),
            h("p", { class: "actions" },
              h("button", { type: "button", disabled: !!store.busy, onclick: () => { if (!view.name) view.name = `result_${++seq}`; save("view"); }, text: "Save as a view" }),
              h("button", { type: "button", disabled: !!store.busy, onclick: () => { if (!view.name) view.name = `result_${++seq}`; save("table"); }, text: "Save as a table" }),
              h("button", { type: "button", class: "primary", id: "q-analyse", disabled: !!store.busy, onclick: () => { if (!view.name) view.name = `result_${++seq}`; save("analyse"); }, text: "Analyse this result" })),
            view.error ? h("p", { class: "warn-text", role: "alert", text: view.error }) : null,
            h("p", { class: "note", text: "A view runs its query each time it is read; a table keeps the rows. Analyse makes the result a table of its own, with its own profile, charts and hypothesis family, like an imported table." })));
        }
      }
      return h("section", { class: "result-view", "aria-label": "Result" }, out);
    }

    function derivedList() {
      if (!store.derived.length) return h("p", { class: "note", text: "No derived view or table yet." });
      return h("section", { "aria-label": "Derived views and tables" }, h("h3", { text: "Derived views and tables" }),
        h("ul", { class: "derived" }, store.derived.map((d) => h("li", { class: "card", "data-derived": d.name },
          h("p", {}, h("strong", { text: d.name }), ` ${d.kind}, ${plural(d.rows, "row", "rows")}, ${plural(d.columns.length, "column", "columns")}; made with ${d.origin} from ${d.inputs.join(", ") || "no table"}; records ${d.records.join(", ")}.`,
            store.tables.some((t) => t.name === d.name) ? h("span", { class: "badge ok", text: "Analysed" }) : null),
          h("details", {}, h("summary", { text: "Its SQL" }), h("pre", { class: "mono wrap", text: d.sql })),
          h("p", { class: "actions" },
            store.tables.some((t) => t.name === d.name) ? null : h("button", { type: "button", class: "small", disabled: !!store.busy, onclick: () => {
              const name = `${d.name}_a`.slice(0, 63);
              analyse(nameProblem(name) ? `${d.name}_${++seq}`.slice(0, 63) : name, `SELECT * FROM ${Sql.ident(d.name)}`, false, null, `the derived ${d.kind} ${d.name}`);
            }, text: "Analyse" }),
            h("button", { type: "button", class: "small", disabled: !!store.busy, onclick: () => { view.mode = "controls"; view.source = d.name; view.steps = []; changed(); }, text: "Start the controls from it" }),
            h("button", { type: "button", class: "small", disabled: !!store.busy, onclick: () => dropObject(d), text: "Drop" }))))));
    }

    function recordsList() {
      return h("details", { class: "records-all", "data-records": String(store.transforms.length) },
        h("summary", { text: `Transformation records: ${fmtInt(store.transforms.length)}` }),
        store.transforms.length ? store.transforms.map((r) => recordView(r, r.id)) : h("p", { class: "note", text: "A record is kept for each transformation that makes, analyses or drops a derived object." }));
    }

    /** One record: kind, inputs, rows in and out, order, SQL, schema, notes, conversions, aggregates, joins. */
    function recordView(r, id) {
      const rowsIn = r.rowsIn.map((x) => `${x.name} ${fmtInt(x.rows)}`).join(" + ");
      const head = `${id ? `${id} · ` : ""}${r.label || r.kind}${r.rowsOut !== null && r.rowsOut !== undefined ? ` · ${rowsIn ? `${rowsIn} → ` : ""}${plural(r.rowsOut, "row", "rows")}` : ""}${r.status === "failed" ? " · failed" : ""}`;
      const flag = r.joins.some((j) => j.flagged);
      const facts = [
        ["Kind", `${r.kind}${r.source === "sql" ? " (custom SQL, kept as written)" : r.source === "controls" ? " (visual controls)" : ""}`],
        ["Inputs", r.inputs.join(", ") || "none"],
        r.parameters ? ["Parameters", JSON.stringify(r.parameters)] : null,
        r.columns.length ? ["Output schema", r.columns.map((c) => `${c.name} ${c.type}`).join(", ")] : null,
        r.order ? ["Order", r.order] : null,
        r.error ? ["Error", r.error] : null,
      ].filter(Boolean);
      return h("details", { class: `record${flag ? " flagged" : ""}`, "data-record": id ?? r.kind },
        h("summary", {}, head, flag ? h("span", { class: "badge warn", text: "Rows repeated" }) : null),
        h("dl", { class: "facts" }, facts.map(([k, v]) => [h("dt", { text: k }), h("dd", { class: k === "Parameters" || k === "Output schema" ? "mono" : "", text: v })])),
        r.sql ? h("pre", { class: "mono wrap", text: r.sql }) : null,
        r.notes.length ? h("ul", { class: "notes" }, r.notes.map((n) => h("li", { text: n }))) : null,
        r.conversions.length ? h("ul", { class: "notes" }, r.conversions.map((c) => h("li", { text: `${c.table ? `${c.table}.` : ""}${c.column} to ${c.to}: ${plural(c.failures, "value does", "values do")} not convert of ${fmtInt(c.of)} rows${c.examples.length ? `, such as ${c.examples.map((x) => JSON.stringify(x)).join(", ")}` : ""}; ${c.failures === 1 ? "it becomes" : "they become"} missing.` }))) : null,
        r.aggregates.length ? h("ul", { class: "notes" }, r.aggregates.map((a) => h("li", { text: `${a.column}: COUNT(*) = ${fmtInt(a.rows)} beside COUNT(${a.column}) = ${fmtInt(a.values)}; ${plural(a.skipped, "missing value is", "missing values are")} skipped by the aggregates.` }))) : null,
        r.joins.map(joinView));
    }

    function joinView(j) {
      if (!j.computed) return h("p", { class: "note", text: j.why });
      if (j.kind === "cross") return h("p", { class: "note", text: `Cross join of ${j.left} (${fmtInt(j.leftRows)} rows) and ${j.right} (${fmtInt(j.rightRows)} rows): every pair, ${plural(j.pairs, "row", "rows")}.` });
      const ex = (u) => (u.examples.length ? u.examples.map((e) => `${e.key.map((k) => (k === null ? "missing" : JSON.stringify(k))).join(" | ")}${e.rows > 1 ? ` ×${fmtInt(e.rows)}` : ""}`).join(", ") : "none");
      const row = (side, rows, missing, keys, dupK, dupR, u) => h("tr", {}, h("th", { scope: "row", text: side }), h("td", { class: "num", text: fmtInt(rows) }), h("td", { class: "num", text: fmtInt(missing) }),
        h("td", { class: "num", text: fmtInt(keys) }), h("td", { class: "num", text: `${fmtInt(dupK)} (${plural(dupR, "row", "rows")})` }), h("td", { class: "num", text: `${fmtInt(u.keys)} (${plural(u.rows, "row", "rows")})` }), h("td", { class: "wrap", text: ex(u) }));
      return h("div", { class: "join-diag", "data-join": j.kind },
        h("p", {}, h("strong", { text: `${j.kind[0].toUpperCase()}${j.kind.slice(1)} join of ${j.left} and ${j.right} on ${j.keys.map((k) => `${k.left} = ${k.right}`).join(" and ")}. ` }),
          j.nullsMatch ? "Missing keys match each other. " : "Missing keys never match. ",
          `${plural(j.matchedKeys, "key matches", "keys match")}; ${plural(j.pairs, "pair", "pairs")} of rows. `,
          j.kind === "semi" || j.kind === "anti" ? "A semi or anti join never repeats a row." : h("span", { class: j.flagged ? "warn-text" : "", "data-factor": String(j.factor) },
            `Row multiplication factor ${Number(j.factor.toFixed(3))}: each matched ${j.left} row joins ${Number(j.factor.toFixed(3))} ${j.right} rows on average${j.flagged ? ", so some rows are repeated." : "."}`)),
        h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": "Join keys, scroll sideways" },
          h("table", { class: "grid" },
            h("thead", {}, h("tr", {}, ["Side", "Rows", "Missing key", "Distinct keys", "Duplicate keys", "Unmatched keys", "Unmatched examples (up to 20)"].map((x) => h("th", { scope: "col", text: x })))),
            h("tbody", {}, row(j.left, j.leftRows, j.leftMissingKeys, j.leftKeys, j.leftDuplicateKeys, j.leftDuplicateRows, j.unmatchedLeft),
              row(j.right, j.rightRows, j.rightMissingKeys, j.rightKeys, j.rightDuplicateKeys, j.rightDuplicateRows, j.unmatchedRight)))));
    }

    /* ---------- what the record, the export and the tools read ---------- */

    /** The derived objects and kept records, for the snapshot (no rows; unmatched key examples are values). */
    function summary() {
      return { derived: store.derived.map((d) => ({ name: d.name, kind: d.kind, origin: d.origin, inputs: d.inputs, records: d.records, lineage: lineage(d.name), rows: d.rows, columns: d.columns, sql: d.sql,
        analysed: store.tables.some((t) => t.name === d.name), pipeline: d.pipeline ?? null, rowColumn: d.rowColumn ?? null, how: d.how ?? null, what: d.what ?? null })), records: store.transforms };
    }

    /**
     * Make a saved project's derived object again from its defining SQL, through the whitelist, with a record of it.
     * Returns what app.analyse needs when the object was analysed.
     * @param {(sql: string) => Promise<any[]>} query @param {any} d the project's record of the object
     */
    async function replay(query, d) {
      const checked = Check.check(d.sql, checkCatalog());
      if (!checked.ok) throw new Error(checked.error);
      const s = checked.statements[0];
      if (s.kind !== "create-view" && s.kind !== "create-table") throw new Error("its SQL does not make a view or a table");
      const r = await Transform.runStatement(query, s);
      const ids = keep([{ ...r.record, label: `${r.record.label}, reopened from the project` }], d.name);
      register({ name: d.name, kind: d.kind, sql: d.sql, query: s.query.text, ordered: s.query.ordered, inputs: d.inputs ?? s.query.refs, records: ids, rows: r.rows, columns: r.columns,
        origin: `${d.origin}, reopened`, analysed: !!d.analysed, pipeline: d.pipeline ?? null, rowColumn: d.rowColumn, how: d.how, what: d.what });
      return d.analysed ? { name: d.name, rowColumn: d.rowColumn, rows: r.rows, columns: r.columns, lineage: lineage(d.name), what: d.what, sql: d.sql, how: d.how } : null;
    }

    /** Forget the panel's state of a table removed from the workbench. */
    function forgetTable(name) {
      if (view.source === name) { view.source = ""; view.steps = []; }
    }

    return { draw, summary, dependents, forgetTable, replay };
  }

  return { mount };
});
