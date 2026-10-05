/* Universal Data Workbench: the page. Import CSV and Parquet files, check them against the memory budget first,
 * profile every column, and let the person approve or dismiss each suggested correction. Runs only in the browser.
 *
 * State lives in `store`; every change redraws from it. The kit (VisualKit) keeps the one piece of URL state, the
 * open example, and gives the command palette, the Markdown record, the deck and the read-only WebMCP tools. No
 * imported value enters the URL, and no tool returns a row: they return the profiles, which hold example values.
 */
(function () {
  "use strict";
  const Sql = window.DWSql, Infer = window.DWInfer, Preflight = window.DWPreflight, Profile = window.DWProfile;
  const Sha = window.DWSha256, Examples = window.DWExamples, Engine = window.DWEngine, Report = window.DWReport;
  const DATA = JSON.parse(document.getElementById("dw-data").textContent);
  const byId = (id) => document.getElementById(id);
  const ROLES = ["measure", "identifier", "category", "ordered category", "time", "event label", "interval start", "interval end", "unknown"];

  /* ---------- formatting ---------- */

  const whole = new Intl.NumberFormat("en-US");
  const fmtInt = (n) => (Number.isFinite(n) ? whole.format(Math.round(n)) : "–");
  function fmtNum(x) {
    if (!Number.isFinite(x)) return "–";
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e7 || a < 1e-3)) return x.toExponential(3).replace("e+", "e");
    return Number(x.toPrecision(5)).toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  const fmtPct = (share) => (Number.isFinite(share) ? Infer.pct(share) : "–");
  const plural = (n, one, many) => `${fmtInt(n)} ${n === 1 ? one : many}`;
  const message = (error) => String(error?.message ?? error).split("\n")[0].slice(0, 300);

  /** One element: attributes (class, text, on<event>, others as attributes) and children. */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs ?? {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  /* ---------- state ---------- */

  const device = Preflight.device({
    coarsePointer: matchMedia("(pointer: coarse)").matches,
    screenMax: Math.max(screen.width || 0, screen.height || 0),
    deviceMemoryGiB: /** @type {any} */ (navigator).deviceMemory ?? null,
  });
  const store = {
    engine: { status: "idle", api: null, starting: null, error: "", version: "" },
    budgetChoice: "auto",
    queue: [],
    tables: [],
    selected: "",
    busy: null,
    stop: false,
    log: [],
    seq: 0,
    open: new Set(),
  };
  const budget = () => (store.budgetChoice === "auto" ? device.budget : Number(store.budgetChoice));
  const used = () => store.tables.reduce((a, t) => a + t.estimate, 0);
  const taken = () => [...store.tables.map((t) => t.name), ...store.queue.map((q) => q.name)];
  const tableOf = (name) => store.tables.find((t) => t.name === name);

  /** Redraw through the kit, so what the tools and exports read (its derived snapshot) is never stale. */
  let kit = null;
  const refresh = () => (kit ? kit.set({}, "replace") : draw());

  /** Add one entry to the conversion log. */
  function note(entry) {
    store.log.push({ n: store.log.length + 1, ...entry });
  }

  /* ---------- engine ---------- */

  function ensureEngine() {
    if (store.engine.api) return Promise.resolve(store.engine.api);
    if (store.engine.starting) return store.engine.starting;
    const base = new URL("runtime/", document.baseURI).href;
    store.engine.status = "starting";
    refresh();
    store.engine.starting = Engine.start({ workerUrl: `${base}duckdb-browser-eh.worker.js`, wasmUrl: `${base}duckdb-eh.wasm`, extensionRepository: `${base}extensions`, memoryLimitBytes: budget() })
      .then((api) => {
        Object.assign(store.engine, { api, status: "ready", version: api.version, error: "" });
        refresh();
        return api;
      }, (error) => {
        Object.assign(store.engine, { status: "failed", starting: null, error: message(error) });
        refresh();
        throw error;
      });
    return store.engine.starting;
  }

  /* One connection runs one piece of work at a time: a file checked while another imports waits its turn. */
  let turn = Promise.resolve();
  function exclusive(work) {
    const run = turn.then(work);
    turn = run.catch(() => {});
    return run;
  }

  /** Run a long step with progress; Cancel stops it between queries and stops the running query. */
  const busy = (label, work) => exclusive(() => busyNow(label, work));
  async function busyNow(label, work) {
    store.busy = { label, text: label, done: 0, total: 0 };
    store.stop = false;
    refresh();
    try {
      await work();
    } finally {
      store.busy = null;
      refresh();
    }
  }
  function progress(text, done, total) {
    if (!store.busy) return;
    Object.assign(store.busy, { text, done, total });
    const bar = byId("progress-bar"), line = byId("progress-text");
    if (bar instanceof HTMLProgressElement) {
      if (total) { bar.max = total; bar.value = done; } else bar.removeAttribute("value");
    }
    if (line) line.textContent = text;
  }
  async function cancel() {
    store.stop = true;
    progress("Cancelling…", 0, 0);
    try { await store.engine.api?.cancel(); } catch { /* nothing was running */ }
  }

  /* ---------- import ---------- */

  /** Queue files, then check each against the budget before anything is imported. */
  async function addFiles(list) {
    const added = [];
    for (const file of list) {
      const kind = /\.parquet$/i.test(file.name) ? "parquet" : /\.(csv|txt)$/i.test(file.name) ? "csv" : null;
      const item = { id: ++store.seq, file, fileName: file.name, kind, bytes: file.size, name: Profile.tableName(file.name, taken()),
        status: kind ? "checking" : "refused", problem: kind ? "" : "Not a .csv or .parquet file, so it is not imported.", choice: "", keep: [], columns: [] };
      store.queue.push(item);
      if (kind) added.push(item);
    }
    refresh();
    for (const item of added) await check(item);
  }

  const check = (item) => exclusive(() => checkNow(item));
  async function checkNow(item) {
    try {
      const api = await ensureEngine();
      item.path = await api.register(item.file);
      const probe = { table: `__probe_rejects_q${item.id}`, scan: `__probe_scans_q${item.id}` };
      try {
        item.columns = (await api.query(Sql.describeFile(item.kind, item.path, probe))).map((c) => c.column_name);
      } finally {
        for (const t of [probe.table, probe.scan]) await api.query(Sql.dropTemp(t)).catch(() => {});
      }
      if (item.kind === "csv") {
        const head = await item.file.slice(0, 2 ** 20).text();
        const lines = (head.match(/\n/g) ?? []).length + (head.endsWith("\n") ? 0 : 1);
        item.rows = Preflight.csvRows(item.bytes, Math.min(item.bytes, 2 ** 20), lines);
        item.estimate = Preflight.estimate("csv", item.bytes);
      } else {
        item.rows = (await api.query(Sql.parquetRows(item.path)))[0]?.rows ?? 0;
        item.estimate = Preflight.estimate("parquet", (await api.query(Sql.parquetSize(item.path)))[0]?.uncompressed ?? item.bytes, item.rows, item.columns.length);
      }
      const ahead = store.queue.filter((q) => q.id < item.id && q.status === "ready" && q.choice === "full").reduce((a, q) => a + q.estimate, 0);
      item.decision = Preflight.decide({ estimate: item.estimate, rows: item.rows, columns: item.columns.length, budget: budget(), used: used() + ahead });
      item.choice = item.decision.fits ? "full" : "";
      item.keep = item.columns.slice(0, Math.max(1, item.decision.maxColumns ?? item.columns.length));
      item.status = "ready";
    } catch (error) {
      item.status = "refused";
      item.problem = store.engine.status === "failed" ? `The engine could not start: ${store.engine.error}` : `This file could not be read: ${message(error)}`;
    }
    refresh();
  }

  /** Why a queued file's table name cannot be used, or "". */
  const nameIssue = (item) => Profile.nameProblem(item.name, [...store.tables.map((t) => t.name), ...store.queue.filter((q) => q !== item).map((q) => q.name)]);
  /** A queued file is imported once it is checked, has a choice that imports it and a usable name. */
  const importable = (q) => q.status === "ready" && !!q.choice && q.choice !== "skip" && !nameIssue(q);

  /**
   * Check a queued file again just before its import, against what the tables imported so far left: a choice made
   * earlier may no longer fit. A sample shrinks to fit; anything else waits for a new choice.
   */
  function stillFits(item) {
    const r = Preflight.recheck({ choice: item.choice, estimate: item.estimate, rows: item.rows, columns: item.columns.length, kept: item.keep.length, sample: item.decision.sample }, budget(), used());
    item.decision = { ...item.decision, ...r.decision };
    item.problem = r.problem;
    if (!r.ok) {
      item.choice = "";
      item.keep = item.keep.slice(0, Math.max(1, r.decision.maxColumns));
    }
    return r.ok;
  }

  /** Import every queued file that has a choice, one after another, then profile each. */
  function importQueue() {
    if (!store.queue.some(importable)) return Promise.resolve();
    return busy("Importing", async () => {
      // Chosen when this run's turn comes, so a second click never imports a file twice.
      const items = store.queue.filter(importable);
      for (const item of items) {
        if (store.stop) break;
        if (stillFits(item)) await importOne(item);
      }
      for (const item of items) if (store.stop && item.status === "ready") item.problem = "Not imported: you cancelled before this file.";
    });
  }

  async function importOne(item) {
    const api = await ensureEngine();
    progress(`Reading ${item.fileName}`, 0, 0);
    const sample = item.choice === "sample" ? item.decision.sample : null;
    const columns = item.choice === "columns" ? item.keep : null;
    let imported;
    try {
      imported = await Profile.importFile(api.query, { kind: item.kind, path: item.path, table: item.name, n: item.id, columns, sample, stopped: () => store.stop });
    } catch (error) {
      item.status = "refused";
      // A stop after the table was created leaves it in the engine: drop it, so nothing of the file is kept. A name
      // that is already an imported table's is never dropped.
      if (!tableOf(item.name)) await api.query(`DROP TABLE IF EXISTS ${Sql.ident(item.name)}`).catch(() => {});
      if (Engine.cancelled(error)) {
        item.problem = "Cancelled while reading: nothing of this file was kept.";
        note({ kind: "cancelled", table: item.name, text: `Import of ${item.fileName} cancelled while reading; nothing was kept.` });
      } else if (Engine.outOfMemory(error)) {
        // The estimate proved too low: offer a sample or fewer columns sized for a larger one.
        const retry = Preflight.afterOutOfMemory({ estimate: item.estimate, rows: item.rows, columns: item.columns.length }, budget(), used());
        Object.assign(item, { status: "ready", choice: "", estimate: retry.estimate, decision: retry.decision });
        item.keep = item.columns.slice(0, Math.max(1, retry.decision.maxColumns));
        item.problem = `The engine ran out of its ${Preflight.bytes(budget())} memory budget while reading this file, so nothing was kept. Choose a sample or fewer columns below.`;
        note({ kind: "failed", table: item.name, text: `Import of ${item.fileName} stopped at the memory budget (${Preflight.bytes(budget())}); nothing was kept.` });
      } else item.problem = `This file could not be imported: ${message(error)}`;
      return;
    }
    const estimate = columns ? Preflight.withColumns(item.estimate, columns.length, item.columns.length) : sample ? item.estimate * (imported.rows / Math.max(1, item.rows)) : item.estimate;
    const table = {
      name: item.name, kind: item.kind, example: item.example?.id ?? null,
      file: { name: item.fileName, bytes: item.bytes, sha256: "" }, estimate, imported, sample, columnsKept: columns,
      columns: [], status: "profiling", reason: "", overrides: {}, dismissed: [],
    };
    store.tables.push(table);
    store.queue = store.queue.filter((q) => q !== item);
    store.selected = table.name;
    const how = item.kind === "csv"
      ? `every value read as text, as written; ${dialectText(imported.dialect)}`
      : "each column with the file's own type";
    note({ kind: "import", table: table.name, text: `Imported ${item.fileName} as ${table.name}: ${plural(imported.rows, "row", "rows")}, ${plural(imported.columns.length - 1, "column", "columns")}; ${how}.${sample ? ` A seeded sample of ${fmtInt(sample.rows)} rows (seed ${sample.seed}) of about ${fmtInt(item.rows)}.` : ""}${columns ? ` Only ${plural(columns.length, "column", "columns")} of ${item.columns.length} kept.` : ""}${imported.rejected.count ? ` ${plural(imported.rejected.count, "line", "lines")} could not be read and are listed.` : ""}` });
    refresh();
    progress(`Checking ${item.fileName}: SHA-256`, 0, 1);
    table.file.sha256 = item.sha256 ?? (await Sha.ofBlob(item.file, (share) => progress(`Checking ${item.fileName}: SHA-256, ${Math.round(share * 100)}%`, share, 1), () => store.stop)) ?? "";
    await profileRest(table);
  }

  /** Profile the columns of a table not profiled yet; Cancel leaves the rest listed as not profiled. */
  async function profileRest(table) {
    const api = await ensureEngine();
    const all = table.imported.columns.filter((c) => c.name !== table.imported.rowColumn);
    const todo = all.filter((c) => !table.columns.some((p) => p.name === c.name));
    table.status = "profiling";
    table.reason = "";
    for (const c of todo) {
      if (store.stop) break;
      const done = table.columns.length;
      progress(`Profiling ${table.name}: column ${done + 1} of ${all.length} (${c.name})`, done, all.length);
      try {
        const col = await Profile.profileColumn(api.query, { table: table.name, rowColumn: table.imported.rowColumn, column: { ...c, position: all.indexOf(c) }, override: table.overrides[c.name] });
        table.columns.push(col);
        if (col.reading.kind !== "text" && col.reading.kind !== "source" && col.textSource) {
          note({ kind: "reading", table: table.name, column: col.name, text: `${table.name}.${col.name}: read as ${Infer.TYPE_LABEL[col.type]} (${readingText(col.reading)}); ${fmtPct(col.share)} of ${fmtInt(col.valued)} values read, ${plural(col.failures.count, "value does", "values do")} not.` });
        }
      } catch (error) {
        if (Engine.cancelled(error) || store.stop) break;
        if (Engine.outOfMemory(error)) { table.reason = `the engine reached its ${Preflight.bytes(budget())} memory budget at column ${c.name}`; break; }
        table.columns.push({ name: c.name, position: all.indexOf(c), failed: message(error), sourceType: c.type, overridden: [] });
      }
      table.columns.sort((a, b) => a.position - b.position);
      refresh();
    }
    Profile.pairRoles(table.columns);
    const left = all.length - table.columns.length;
    table.status = left ? "incomplete" : "complete";
    if (left && !table.reason) table.reason = store.stop ? "you cancelled" : "stopped";
    if (left) note({ kind: "cancelled", table: table.name, text: `Profiling of ${table.name} stopped (${table.reason}) after ${table.columns.length} of ${all.length} columns; ${plural(left, "column is", "columns are")} not profiled.` });
    refresh();
  }

  /** Re-profile one column after a change, keeping its place. */
  async function reprofile(table, name) {
    const api = await ensureEngine();
    const all = table.imported.columns.filter((c) => c.name !== table.imported.rowColumn);
    const c = all.find((x) => x.name === name);
    const col = await Profile.profileColumn(api.query, { table: table.name, rowColumn: table.imported.rowColumn, column: { ...c, position: all.indexOf(c) }, override: table.overrides[name] });
    table.columns = table.columns.map((x) => (x.name === name ? col : x));
    Profile.pairRoles(table.columns);
    return col;
  }

  async function approve(table, colName, id) {
    const col = table.columns.find((c) => c.name === colName);
    const s = col?.suggestions.find((x) => x.id === id);
    if (!s) return;
    await applyOverride(table, colName, { ...(table.overrides[colName] ?? {}), ...s.change }, "approved", `Approved: ${s.text}`);
  }

  /**
   * Give a column a new override (undefined: none) and profile it again. When that fails or is cancelled, the
   * column keeps its old override and profile, and the log says the change was not applied.
   */
  function applyOverride(table, colName, next, kind, text) {
    return busy("Applying", async () => {
      progress(text, 0, 0);
      const before = table.overrides[colName];
      const set = (value) => { if (value) table.overrides[colName] = value; else delete table.overrides[colName]; };
      set(next);
      try {
        const after = await reprofile(table, colName);
        note({ kind, table: table.name, column: colName, text: `${text} ${effect(after)}` });
      } catch (error) {
        set(before);
        note({ kind: "failed", table: table.name, column: colName, text: `Not applied (${Engine.cancelled(error) ? "cancelled" : message(error)}): ${text}` });
      }
    });
  }

  function dismiss(table, colName, id) {
    const col = table.columns.find((c) => c.name === colName);
    const s = col?.suggestions.find((x) => x.id === id);
    if (!s) return;
    table.dismissed.push(id);
    note({ kind: "dismissed", table: table.name, column: colName, text: `Dismissed: ${s.text}` });
    refresh();
  }

  /** What a change did, for the log. */
  function effect(col) {
    const parts = [`${col.name} reads as ${Infer.TYPE_LABEL[col.type]} (${readingText(col.reading)}), role ${col.role}`];
    if (col.madeMissing) parts.push(`${plural(col.madeMissing, "value", "values")} now missing`);
    parts.push(`${plural(col.failures.count, "value does", "values do")} not read`);
    return `${parts.join("; ")}.`;
  }

  /** The readings a person may choose for a text column, by id. */
  function readingChoices(col) {
    const own = { kind: col.inferred.reading.kind, format: col.inferred.reading.format };
    const list = [
      ["text", "Text, as written", "text", { kind: "text" }],
      ["category", "Categories", "categorical", { kind: "text" }],
      ["integer", "Whole numbers", "integer", { kind: "integer" }],
      ["integer-sep", "Whole numbers with , separators", "integer", { kind: "integer-sep" }],
      ["decimal", "Decimals", "decimal", { kind: "decimal" }],
      ["decimal-sep", "Decimals with , separators", "decimal", { kind: "decimal-sep" }],
      ["boolean", "Yes or no", "boolean", { kind: "boolean" }],
      ["date", "Dates YYYY-MM-DD", "date", { kind: "date" }],
      ...Sql.DATE_FORMATS.map((f) => [`date-format:${f.id}`, `Dates ${f.label}`, "date", { kind: "date-format", format: f.id }]),
      ...Sql.DATE_FORMATS.map((f) => [`date-formats:${f.id}`, `Dates YYYY-MM-DD and ${f.label}`, "date", { kind: "date-formats", format: f.id }]),
      ["datetime", "Date-times without a zone", "datetime", { kind: "datetime" }],
      ["datetime-zoned", "Date-times with a zone offset", "datetime", { kind: "datetime-zoned" }],
      ["time", "Times of day", "time", { kind: "time" }],
    ];
    return list.map(([id, label, type, reading]) => ({ id, label, type, reading, inferred: own.kind === reading.kind && own.format === reading.format && (type === col.inferred.type || reading.kind !== "text") }));
  }

  /** The choice that names a column's current reading, if one does; the form then shows it selected. */
  const currentChoice = (col, choices) => choices.find((r) => r.type === col.type && r.reading.kind === col.reading.kind && r.reading.format === col.reading.format && (col.type !== "categorical" || r.id === "category"));

  async function change(table, colName, form) {
    const col = table.columns.find((c) => c.name === colName);
    const data = new FormData(form);
    const next = { ...(table.overrides[colName] ?? {}) };
    const parts = [];
    const pick = String(data.get("reading") ?? "");
    const choices = col.textSource ? readingChoices(col) : [];
    // An empty pick keeps the reading; so does picking the reading in use, whatever else changes.
    if (pick && pick !== currentChoice(col, choices)?.id) {
      const choice = choices.find((r) => r.id === pick);
      if (choice) {
        next.type = choice.type;
        // Approved missing text carries over; approved missing numbers only to another numeric reading.
        const numeric = choice.type === "integer" || choice.type === "decimal";
        next.reading = { ...choice.reading, missingText: col.reading.missingText, ...(numeric ? { missingNumbers: col.reading.missingNumbers } : {}) };
        parts.push(`read as ${choice.label.toLowerCase()}`);
      }
    }
    const role = String(data.get("role") ?? "");
    if (role && role !== col.role) { next.role = role; parts.push(`role ${role}`); }
    const unit = String(data.get("unit") ?? "").trim().slice(0, 24);
    if (unit !== (col.unit ?? "")) { next.unit = unit; parts.push(unit ? `unit ${unit}` : "no unit"); }
    if (!parts.length) return;
    await applyOverride(table, colName, next, "changed", `You set ${table.name}.${colName}: ${parts.join(", ")}.`);
  }

  async function revert(table, colName) {
    await applyOverride(table, colName, undefined, "reverted", `Returned ${table.name}.${colName} to what the workbench inferred.`);
  }

  const removeTable = (table) => exclusive(() => removeNow(table));
  async function removeNow(table) {
    const api = await ensureEngine();
    await api.query(`DROP TABLE ${Sql.ident(table.name)}`);
    store.tables = store.tables.filter((t) => t !== table);
    if (store.selected === table.name) store.selected = store.tables[0]?.name ?? "";
    note({ kind: "removed", table: table.name, text: `Removed ${table.name} from the workbench; the file itself is unchanged.` });
    refresh();
  }

  /* ---------- examples ---------- */

  const loading = new Set();
  async function openExample(id) {
    const meta = DATA.examples.find((x) => x.id === id);
    if (!meta) return;
    const open = store.tables.find((t) => t.example === id);
    if (open) { store.selected = open.name; refresh(); return; }
    if (loading.has(id) || store.busy) return;
    loading.add(id);
    try {
      const text = id === "planted" ? Examples.planted() : DATA.files[id];
      const data = new TextEncoder().encode(text);
      await busy(`Opening ${meta.title}`, async () => {
        progress(store.engine.api ? `Opening ${meta.title}` : "Starting the engine: the first visit downloads about 40 MB, then the browser keeps it", 0, 0);
        let api;
        try { api = await ensureEngine(); } catch { return; }
        // Hash before registering: the engine takes the bytes over, which empties this copy.
        const hash = Sha.create();
        hash.update(data);
        const item = { id: ++store.seq, fileName: `${meta.table}.csv`, kind: "csv", bytes: data.length, sha256: hash.hex(), example: meta,
          name: Profile.tableName(meta.table, taken()), choice: "full", rows: 0, columns: [], estimate: Preflight.estimate("csv", data.length) };
        item.path = await api.registerBytes(item.fileName, data);
        await importOne(item);
      });
    } finally {
      loading.delete(id);
      refresh();
    }
  }

  /* ---------- drawing ---------- */

  /** The CSV dialect DuckDB detected, in words. */
  function dialectText(d) {
    if (!d) return "dialect not detected";
    const shown = (v) => (!v || v === "(empty)" ? "none" : v.includes('"') ? `'${v}'` : `"${v}"`);
    const ends = d.newline_delimiter === "\\r\\n" ? "CR LF" : d.newline_delimiter === "\\n" ? "LF" : String(d.newline_delimiter ?? "");
    return `delimiter ${shown(d.delimiter)}, quote ${shown(d.quote)}, escape ${shown(d.escape)}, header ${d.has_header ? "yes" : "no"}${d.skip_rows ? `, ${d.skip_rows} lines skipped before it` : ""}${ends ? `, line ends ${ends}` : ""}`;
  }

  function readingText(r) {
    const base = {
      text: "as written", source: "the file's own type", integer: "whole numbers", "integer-sep": 'whole numbers, "," thousands separators removed',
      decimal: "decimals", "decimal-sep": 'decimals, "," thousands separators removed', boolean: "yes or no", date: "YYYY-MM-DD",
      datetime: "ISO date-times, zone unknown", "datetime-zoned": "ISO date-times with offsets, in UTC", time: "times of day",
    }[r.kind];
    const layout = (id) => Sql.DATE_FORMATS.find((f) => f.id === id)?.label ?? id;
    const text = r.kind === "date-format" ? layout(r.format) : r.kind === "date-formats" ? `YYYY-MM-DD and ${layout(r.format)}` : base ?? r.kind;
    const extra = [];
    if (r.missingText?.length) extra.push(`${r.missingText.map((t) => `"${t}"`).join(", ")} as missing`);
    if (r.missingNumbers?.length) extra.push(`${r.missingNumbers.join(", ")} as missing`);
    return extra.length ? `${text}; ${extra.join("; ")}` : text;
  }

  function draw() {
    drawEngine();
    drawQueue();
    drawTables();
    drawExamples();
    drawLog();
  }

  function drawExamples() {
    const disabled = !!store.busy;
    for (const b of document.querySelectorAll("[data-example-open]")) /** @type {HTMLButtonElement} */ (b).disabled = disabled;
  }

  function drawEngine() {
    const e = store.engine;
    const select = byId("budget");
    if (select instanceof HTMLSelectElement) {
      select.value = store.budgetChoice;
      select.disabled = e.status !== "idle" && e.status !== "failed";
    }
    const parts = [`Memory budget: ${Preflight.bytes(budget())}${store.budgetChoice === "auto" ? `, for ${device.basis}` : ", chosen by you"}.`];
    if (store.tables.length) parts.push(`Estimated in use: ${Preflight.bytes(used())}.`);
    parts.push(e.status === "idle" ? "The engine starts with the first import." : e.status === "starting" ? "The engine is starting." : e.status === "ready" ? `Engine: DuckDB ${e.version}, ready; the budget is fixed until the page reloads.` : `The engine could not start: ${e.error}`);
    byId("budget-note").textContent = parts.join(" ");
    const status = byId("progress");
    status.hidden = !store.busy;
    if (store.busy) {
      byId("progress-text").textContent = store.busy.text;
      const bar = byId("progress-bar");
      if (store.busy.total) { bar.max = store.busy.total; bar.value = store.busy.done; } else bar.removeAttribute("value");
    }
    byId("cancel").hidden = !store.busy;
    const ready = store.queue.some(importable);
    /** @type {HTMLButtonElement} */ (byId("import")).disabled = !ready || !!store.busy;
    byId("engine-error").hidden = e.status !== "failed";
    byId("engine-error").textContent = e.status === "failed" ? `The engine could not start: ${e.error}. The workbench needs its engine files from this site; check the connection and reload.` : "";
  }

  function drawQueue() {
    const list = byId("queue");
    list.replaceChildren(...store.queue.map((item) => h("li", { class: "queue-item card" },
      h("div", { class: "queue-head" },
        h("strong", { text: item.fileName }),
        h("span", { class: "note", text: `${item.kind ? item.kind.toUpperCase() : "?"} · ${Preflight.bytes(item.bytes)}` })),
      item.status === "checking" ? h("p", { class: "note", text: "Checking the file against the memory budget…" }) : null,
      item.problem ? h("p", { class: "warn-text", text: item.problem }) : null,
      item.status === "ready" ? queueBody(item) : null,
      h("button", { type: "button", class: "small", onclick: () => { store.queue = store.queue.filter((q) => q !== item); draw(); }, disabled: !!store.busy, text: "Remove from list" }))));
    byId("queue-empty").hidden = store.queue.length > 0;
  }

  function queueBody(item) {
    const id = `name-${item.id}`;
    const problem = nameIssue(item);
    const nameField = h("div", { class: "field" },
      h("label", { for: id, text: "Table name" }),
      h("input", { id, type: "text", value: item.name, autocomplete: "off", spellcheck: "false", "aria-describedby": `${id}-help`,
        onchange: (ev) => { item.name = ev.target.value.trim(); draw(); } }),
      h("p", { id: `${id}-help`, class: problem ? "warn-text" : "note", text: problem || "Lower-case letters, digits and _." }));
    const est = h("p", { class: "note", text: `About ${fmtInt(item.rows)} rows and ${item.columns.length} columns; estimated ${Preflight.bytes(item.estimate)} in memory of ${Preflight.bytes(item.decision.left)} left.` });
    if (item.decision.fits) return h("div", {}, nameField, est, h("p", { class: "ok-text", text: problem ? "Fix the name to import." : "Fits the budget: all rows and columns will be imported." }));
    const name = `choice-${item.id}`;
    const option = (value, label, disabled) => h("label", { class: "choice" },
      h("input", { type: "radio", name, value, checked: item.choice === value, disabled, onchange: () => { item.choice = value; draw(); } }), ` ${label}`);
    const d = item.decision;
    return h("div", {}, nameField, est,
      h("fieldset", { class: "choices" },
        h("legend", { text: `Too large for this device's budget. ${item.fileName} is not imported until you choose:` }),
        option("sample", d.sample ? `A seeded sample of ${fmtInt(d.sample.rows)} rows (seed ${d.sample.seed}), labelled as a sample everywhere` : "A sample: none fits the budget", !d.sample),
        option("columns", d.maxColumns ? `Fewer columns: up to ${d.maxColumns} of ${item.columns.length}` : "Fewer columns: none fit the budget", !d.maxColumns),
        option("skip", "Skip this file", false)),
      item.choice === "columns" ? columnPicker(item) : null);
  }

  function columnPicker(item) {
    const max = item.decision.maxColumns;
    return h("fieldset", { class: "columns-pick" },
      h("legend", { text: `Keep up to ${max} columns (${item.keep.length} chosen)` }),
      item.columns.map((c, i) => h("label", { class: "choice" }, h("input", { type: "checkbox", name: `keep-${item.id}`, value: c, checked: item.keep.includes(c),
        disabled: !item.keep.includes(c) && item.keep.length >= max,
        onchange: (ev) => { item.keep = ev.target.checked ? item.columns.filter((x) => x === c || item.keep.includes(x)) : item.keep.filter((x) => x !== c); if (!item.keep.length) item.keep = [item.columns[i]]; draw(); } }), ` ${c}`)));
  }

  function drawTables() {
    const tabs = byId("table-tabs"), view = byId("table-view");
    byId("tables-empty").hidden = store.tables.length > 0;
    if (!store.tables.some((t) => t.name === store.selected)) store.selected = store.tables[0]?.name ?? "";
    tabs.replaceChildren(...store.tables.map((t) => h("button", { type: "button", role: "tab", id: `tab-${t.name}`, "aria-selected": String(t.name === store.selected), "aria-controls": "table-view",
      onclick: () => { store.selected = t.name; draw(); } },
      t.name, h("span", { class: "tab-note", text: ` ${fmtInt(t.imported.rows)} × ${t.imported.columns.length - 1}${t.status === "complete" ? "" : t.status === "profiling" ? ", profiling" : ", incomplete"}` }))));
    const t = tableOf(store.selected);
    view.replaceChildren(...(t ? tableView(t) : []));
    if (t) view.setAttribute("aria-labelledby", `tab-${t.name}`);
  }

  function tableView(t) {
    const out = [];
    const scope = t.sample ? h("span", { class: "badge warn", text: `Sample: ${fmtInt(t.imported.rows)} rows, seed ${t.sample.seed}` })
      : t.columnsKept ? h("span", { class: "badge warn", text: `${plural(t.columnsKept.length, "column", "columns")} kept` }) : h("span", { class: "badge", text: "All rows" });
    const status = t.status === "complete" ? h("span", { class: "badge ok", text: "Complete" })
      : t.status === "profiling" ? h("span", { class: "badge", text: "Profiling…" })
      : h("span", { class: "badge warn", text: `Incomplete: ${t.reason}` });
    out.push(h("div", { class: "table-head" }, h("h3", { text: t.name }), scope, status));
    const facts = [
      ["Source", `${t.file.name}, ${Preflight.bytes(t.file.bytes)}${t.example ? " (built-in example)" : ""}`],
      ["SHA-256", t.file.sha256 || (t.status === "profiling" ? "computing…" : "not computed (cancelled)")],
      ["Rows", `${fmtInt(t.imported.rows)}${t.sample ? ` (a seeded sample, seed ${t.sample.seed})` : ""}`],
      ["Columns", `${fmtInt(t.imported.columns.length - 1)} (plus ${t.imported.rowColumn}, each row's position in the file)`],
      t.kind === "csv" ? ["Read as", `CSV, every value kept as text as written; ${dialectText(t.imported.dialect)}`]
        : ["Read as", `Parquet with its own types; ${fmtInt(t.imported.parquet?.rowGroups)} row groups, ${Preflight.bytes(t.imported.parquet?.uncompressed)} before compression`],
      ["Every result uses", t.sample ? `the ${fmtInt(t.imported.rows)} sampled rows, not the whole file` : `all ${fmtInt(t.imported.rows)} rows`],
    ];
    out.push(h("dl", { class: "facts" }, facts.map(([k, v]) => [h("dt", { text: k }), h("dd", { class: k === "SHA-256" ? "mono wrap" : "", text: v })])));
    const actions = h("p", { class: "actions" });
    if (t.status === "incomplete") actions.append(h("button", { type: "button", disabled: !!store.busy, onclick: () => busy("Profiling", () => profileRest(t)), text: "Profile the remaining columns" }));
    actions.append(h("button", { type: "button", class: "small", disabled: !!store.busy, onclick: () => removeTable(t), text: "Remove this table" }));
    out.push(actions);
    out.push(overview(t));
    out.push(errorsSection(t));
    out.push(suggestionsSection(t));
    out.push(h("section", { class: "columns", "aria-label": `Columns of ${t.name}` }, h("h4", { text: "Column details" }), t.columns.map((c) => columnCard(t, c))));
    const left = t.imported.columns.filter((c) => c.name !== t.imported.rowColumn && !t.columns.some((p) => p.name === c.name));
    if (left.length && t.status !== "profiling") out.push(h("p", { class: "warn-text", text: `Not profiled: ${left.map((c) => c.name).join(", ")}.` }));
    return out;
  }

  /** A column's missing values (empty, and made missing by approval) and the markers still counted apart. */
  function missingOf(c) {
    const approved = c.missing.markerValues.filter((m) => (c.reading.missingText ?? []).includes(String(m.value).toLowerCase())).reduce((a, m) => a + m.n, 0);
    return { missing: c.missing.nulls + c.missing.blanks + (c.madeMissing ?? 0) + approved, markers: c.missing.markers - approved, approved };
  }

  /** A column's type in its source file: text for a CSV, the physical and converted Parquet type otherwise. */
  const sourceOf = (t, c) => (t.kind === "csv" ? "text" : t.imported.columns.find((x) => x.name === c.name)?.source ?? c.sourceType);

  function overview(t) {
    const rows = t.columns.map((c) => {
      if (c.failed) return h("tr", {}, h("th", { scope: "row" }, c.name), h("td", { colspan: "6", class: "warn-text", text: `Could not be profiled: ${c.failed}` }));
      const { missing, markers } = missingOf(c);
      const flags = [];
      if (c.errors.length) flags.push(plural(c.errors.reduce((a, e) => a + e.count, 0), "suspected error", "suspected errors"));
      if (c.unusual?.count) flags.push(plural(c.unusual.count, "unusual value", "unusual values"));
      const open = c.suggestions.filter((s) => !t.dismissed.includes(s.id)).length;
      if (open) flags.push(plural(open, "suggestion", "suggestions"));
      return h("tr", {},
        h("th", { scope: "row" }, h("a", { href: `#col-${t.name}-${c.position}`, onclick: (ev) => { ev.preventDefault(); store.open.add(`${t.name}\u0000${c.name}`); draw(); byId(`col-${t.name}-${c.position}`)?.scrollIntoView({ block: "start" }); }, text: c.name })),
        h("td", { text: sourceOf(t, c) }),
        h("td", {}, Infer.TYPE_LABEL[c.type], c.reading.kind !== "text" && c.reading.kind !== "source" && c.textSource || c.share < 1 ? h("span", { class: "note", text: ` ${fmtPct(c.share)}` }) : null),
        h("td", { text: c.role + (c.certainty !== "certain" ? ` (${c.certainty})` : "") }),
        h("td", { class: "num", text: `${missing ? `${fmtInt(missing)} (${fmtPct(missing / Math.max(1, t.imported.rows))})` : "0"}${markers > 0 ? ` + ${plural(markers, "marker", "markers")}` : ""}` }),
        h("td", { class: "num", text: fmtInt(c.distinct) }),
        h("td", { text: flags.join("; ") || "–" }));
    });
    return h("section", { "aria-label": `Overview of ${t.name}` },
      h("h4", { text: "Columns" }),
      h("p", { class: "note", text: "Read as: the type the workbench reads each column as, with the share of the values present that fit it. A column of text can be read as numbers or dates without changing the table." }),
      h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": `Columns of ${t.name}, scrolls sideways` },
        h("table", { class: "grid" },
          h("thead", {}, h("tr", {}, ["Column", "Source type", "Read as", "Role", "Missing", "Distinct", "Notes"].map((x) => h("th", { scope: "col", text: x })))),
          h("tbody", {}, rows))));
  }

  function errorsSection(t) {
    const items = [];
    for (const r of t.imported.rejected.examples) {
      items.push(h("li", {}, h("strong", { text: `Line ${fmtInt(r.line)}: ` }), `${r.error_type === "MISSING COLUMNS" ? "too few fields" : r.error_type === "TOO MANY COLUMNS" ? "too many fields" : r.error_type.toLowerCase()} (${r.error_message}); the line as written: `, h("code", { class: "wrap", text: r.csv_line })));
    }
    if (t.imported.rejected.count > t.imported.rejected.examples.length) items.push(h("li", { text: `… and ${fmtInt(t.imported.rejected.count - t.imported.rejected.examples.length)} more lines.` }));
    for (const c of t.columns) for (const e of c.errors ?? []) {
      items.push(h("li", {}, h("strong", { text: `${c.name}: ` }), `${e.text}`, e.examples.length ? h("span", { class: "note", text: ` (for example ${e.examples.slice(0, 5).map((v) => JSON.stringify(v)).join(", ")})` }) : null, "."));
    }
    return h("section", { "aria-label": `Suspected data errors in ${t.name}` },
      h("h4", { text: "Suspected data errors" }),
      h("p", { class: "note", text: "Shown apart from patterns in usable data. Nothing is removed or filled; an approved correction only changes how a value is read." }),
      items.length ? h("ul", { class: "errors" }, items) : h("p", { text: t.imported.rejected.count === 0 && t.status === "complete" ? "None found." : "None found so far." }));
  }

  function suggestionsSection(t) {
    const items = [];
    for (const c of t.columns) for (const s of c.suggestions ?? []) {
      if (t.dismissed.includes(s.id)) continue;
      items.push(h("li", { class: "suggestion" }, h("p", { text: s.text }),
        h("p", { class: "actions" },
          h("button", { type: "button", class: "primary", disabled: !!store.busy, "data-suggestion": s.id, onclick: () => approve(t, c.name, s.id), text: "Approve" }),
          h("button", { type: "button", disabled: !!store.busy, onclick: () => dismiss(t, c.name, s.id), text: "Dismiss" }))));
    }
    return h("section", { "aria-label": `Suggested corrections for ${t.name}` },
      h("h4", { text: "Suggested corrections" }),
      h("p", { class: "note", text: "Each changes what a value means, so none is applied until you approve it. The table keeps every value as written; the log records each choice." }),
      items.length ? h("ul", { class: "suggestions" }, items) : h("p", { text: "None open." }));
  }

  function columnCard(t, c) {
    const key = `${t.name}\u0000${c.name}`;
    const details = h("details", { class: "card column", id: `col-${t.name}-${c.position}`, open: store.open.has(key),
      ontoggle: (ev) => { if (ev.target.open) store.open.add(key); else store.open.delete(key); } });
    if (c.failed) {
      details.append(h("summary", {}, h("strong", { text: c.name }), h("span", { class: "note", text: " could not be profiled" })), h("p", { class: "warn-text", text: c.failed }));
      return details;
    }
    details.append(h("summary", {}, h("strong", { text: c.name }), h("span", { class: "note", text: ` ${Infer.TYPE_LABEL[c.type]} · ${c.role}${c.unit ? ` · ${c.unit}` : ""}` })));
    const missing = c.missing.nulls + c.missing.blanks;
    const gone = missingOf(c);
    const rows = [
      ["Source type", t.kind === "csv" ? "text, kept as written in the CSV" : `${sourceOf(t, c)}, read by DuckDB as ${c.sourceType}`],
      ["Read as", `${Infer.TYPE_LABEL[c.type]}: ${readingText(c.reading)}${c.overridden.length ? " (your choice)" : ""}`],
      ["Fits", c.reading.kind === "text" ? "every value, as text" : `${fmtPct(c.share)} of ${fmtInt(c.valued)} values present${c.failures.count ? `; ${plural(c.failures.count, "value does", "values do")} not read` : ""}`],
      ["Role", `${c.role} (${c.certainty}): ${c.roleReasons.join(" ")}`],
      ["Missing", `${fmtInt(missing)} empty${gone.markers ? `; ${plural(gone.markers, "marker", "markers")} counted apart, such as ${c.missing.markerValues.slice(0, 3).map((m) => `"${m.value}"`).join(", ")}` : ""}${c.madeMissing + gone.approved ? `; ${fmtInt(c.madeMissing + gone.approved)} made missing by approval` : ""}`],
      ["Distinct values", fmtInt(c.distinct)],
    ];
    if (c.unit) rows.push(["Unit", `${c.unit} (set by you)`]);
    details.append(h("dl", { class: "facts" }, rows.map(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })])));
    for (const n of c.notes) details.append(h("p", { class: "note", text: n }));
    details.append(summaryView(c));
    if (c.unusual) details.append(unusualView(c));
    if (c.identifier) details.append(h("p", { text: `Repeated values: ${fmtInt(c.identifier.repeats)}${c.identifier.repeated.length ? ` (most repeated: ${c.identifier.repeated.map((r) => `${JSON.stringify(r.value)} ×${fmtInt(r.n)}`).join(", ")})` : ""}. First values: ${c.identifier.first.map((r) => JSON.stringify(r.value)).join(", ")}.` }));
    if (c.failures.examples.length) details.append(h("p", {}, "Values that do not read, most frequent first: ", c.failures.examples.slice(0, 10).map((f, i) => [i ? ", " : "", h("code", { text: JSON.stringify(f.value) }), ` ×${fmtInt(f.n)} (first at row ${fmtInt(f.first_row)})`]), "."));
    details.append(changeForm(t, c));
    return details;
  }

  function summaryView(c) {
    const s = c.summary;
    if (!s) return h("p", { class: "note", text: c.type === "unsupported" ? "Not analysed in v1." : "No summary for this column." });
    if (s.kind === "numeric") {
      return h("div", { class: "summary" },
        spark(s.bins, `Histogram of ${c.name}: ${s.bins.length} bins from ${fmtNum(s.min)} to ${fmtNum(s.max)}`),
        h("dl", { class: "facts compact" }, [["Count", fmtInt(s.n)], ["Min", fmtNum(s.min)], ["1st percentile", fmtNum(s.p1)], ["Lower quartile", fmtNum(s.q1)], ["Median", fmtNum(s.median)], ["Mean", fmtNum(s.mean)],
          ["Upper quartile", fmtNum(s.q3)], ["99th percentile", fmtNum(s.p99)], ["Max", fmtNum(s.max)], ["Standard deviation", fmtNum(s.sd)], ["Skewness", fmtNum(s.skew)], ["Zeros", fmtInt(s.zeros)], ["Negative", fmtInt(s.negatives)]]
          .map(([k, v]) => [h("dt", { text: k }), h("dd", { class: "num", text: v })])));
    }
    if (s.kind === "time") {
      return h("div", { class: "summary" },
        s.bins.length ? spark(s.bins, `Count over time of ${c.name}: ${s.bins.length} equal spans from ${s.min} to ${s.max}`) : null,
        h("dl", { class: "facts compact" }, [["Count", fmtInt(s.n)], ["First", s.min ?? "–"], ["Last", s.max ?? "–"], ["Distinct", fmtInt(s.distinct_values)], ["Span", Number.isFinite(s.span_days) ? `${fmtInt(s.span_days)} days` : "–"]]
          .map(([k, v]) => [h("dt", { text: k }), h("dd", { class: "num", text: v })])));
    }
    const top = s.top ?? [];
    const max = Math.max(1, ...top.map((r) => r.n));
    return h("div", { class: "summary" },
      h("p", { class: "label", text: s.kind === "text" ? "Most frequent values" : "Levels by count" }),
      h("ul", { class: "bars" }, top.map((r) => h("li", {}, h("span", { class: "bar-label", text: r.value }), h("span", { class: "bar", style: `--w:${(100 * r.n / max).toFixed(1)}%` }), h("span", { class: "num", text: fmtInt(r.n) })))),
      top.length && top[0].singletons ? h("p", { class: "note", text: `${plural(top[0].singletons, "value appears", "values appear")} once.` }) : null,
      s.kind === "text" ? h("p", { class: "note", text: `Length from ${fmtInt(s.lenMin)} to ${fmtInt(s.lenMax)} characters, ${fmtNum(s.lenMean)} on average.` }) : null);
  }

  function unusualView(c) {
    const u = c.unusual;
    if (u.madZero) return h("p", { class: "note", text: "Unusual values: not checked, because at least half the values are equal (the median absolute deviation is 0)." });
    return h("p", {}, h("strong", { text: "Unusual values: " }), u.count ? `${plural(u.count, "value", "values")} with robust z above 3.5 (|x − median| / (1.4826 × MAD)), most extreme first: ${u.examples.map((x) => `${fmtNum(x.value)} (z ${fmtNum(x.z)}${x.n > 1 ? `, ×${fmtInt(x.n)}` : ""})`).join(", ")}. These stay in the data.` : "none with robust z above 3.5.");
  }

  function spark(bins, label) {
    const n = 20, wide = 240, tall = 48;
    const max = Math.max(1, ...bins.map((b) => b.n));
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${wide} ${tall}`);
    svg.setAttribute("class", "spark");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    for (const b of bins) {
      const r = document.createElementNS(ns, "rect");
      const hgt = Math.max(1, (b.n / max) * (tall - 2));
      r.setAttribute("x", String((b.bin * wide) / n + 0.5));
      r.setAttribute("width", String(wide / n - 1));
      r.setAttribute("y", String(tall - hgt));
      r.setAttribute("height", String(hgt));
      svg.append(r);
    }
    return svg;
  }

  function changeForm(t, c) {
    const choices = c.textSource ? readingChoices(c) : [];
    const current = currentChoice(c, choices);
    const id = (x) => `${x}-${t.name}-${c.position}`;
    const form = h("form", { class: "change", onsubmit: (ev) => { ev.preventDefault(); change(t, c.name, ev.target); } },
      h("p", { class: "label", text: "Change how this column is read" }),
      c.textSource ? h("div", { class: "field" }, h("label", { for: id("reading"), text: "Read as" }),
        h("select", { id: id("reading"), name: "reading" },
          current ? null : h("option", { value: "", selected: true, text: `Keep: ${readingText(c.reading)}` }),
          choices.map((r) => h("option", { value: r.id, selected: r === current, text: r.label + (r.inferred ? " (inferred)" : "") })))) : null,
      h("div", { class: "field" }, h("label", { for: id("role"), text: "Role" }),
        h("select", { id: id("role"), name: "role" }, ROLES.map((r) => h("option", { value: r, selected: r === c.role, text: r + (r === c.inferredRole ? " (inferred)" : "") })))),
      h("div", { class: "field" }, h("label", { for: id("unit"), text: "Unit (optional)" }), h("input", { id: id("unit"), name: "unit", type: "text", maxlength: "24", value: c.unit ?? "", placeholder: "none given" })),
      h("p", { class: "actions" },
        h("button", { type: "submit", disabled: !!store.busy, text: "Apply" }),
        c.overridden.length || c.unit ? h("button", { type: "button", disabled: !!store.busy, onclick: () => revert(t, c.name), text: "Return to the inferred reading" }) : null),
      h("p", { class: "note", text: "A change is logged and applies only to how the workbench reads the column; the table keeps every value as written." }));
    return form;
  }

  function drawLog() {
    const list = byId("log");
    list.replaceChildren(...store.log.map((e) => h("li", { text: e.text })));
    byId("log-empty").hidden = store.log.length > 0;
  }

  /* ---------- snapshot for the record, the deck and the tools ---------- */

  function snapshot() {
    return {
      engine: { status: store.engine.status, duckdb: store.engine.version || DATA.engine.duckdb, duckdbWasm: DATA.engine.duckdbWasm, budget: Preflight.bytes(budget()), budgetBasis: store.budgetChoice === "auto" ? device.basis : "chosen by you" },
      pieces: DATA.pieces,
      tables: store.tables.map((t) => ({
        name: t.name, example: t.example, kind: t.kind, file: { ...t.file }, rows: t.imported.rows, rowColumn: t.imported.rowColumn,
        columns: t.imported.columns.length - 1, status: t.status, reason: t.reason,
        sample: t.sample, columnsKept: t.columnsKept, dialect: t.imported.dialect, rejected: t.imported.rejected, parquet: t.imported.parquet,
        profiled: t.columns.filter((c) => !c.failed).map((c) => ({
          name: c.name, sourceType: c.sourceType, type: c.type, reading: readingText(c.reading), share: c.share, role: c.role, certainty: c.certainty,
          roleReasons: c.roleReasons, valued: c.valued, distinct: c.distinct, missing: (({ missing, markers }) => ({ missing, markers }))(missingOf(c)),
          failures: c.failures.count, failureExamples: c.failures.examples.map((f) => f.value), errors: c.errors.map((e) => ({ kind: e.kind, count: e.count, text: e.text, examples: e.examples })),
          unusual: c.unusual ? { count: c.unusual.count, rule: c.unusual.rule } : null, summary: c.summary ? { ...c.summary, bins: undefined } : null,
          suggestions: c.suggestions.filter((s) => !t.dismissed.includes(s.id)).map((s) => ({ id: s.id, text: s.text })), unit: c.unit, yourChanges: c.overridden,
        })),
        failedColumns: t.columns.filter((c) => c.failed).map((c) => ({ name: c.name, error: c.failed })),
        notProfiled: t.imported.columns.filter((c) => c.name !== t.imported.rowColumn && !t.columns.some((p) => p.name === c.name)).map((c) => c.name),
      })),
      log: store.log.map((e) => e.text),
    };
  }

  /* ---------- start ---------- */

  const examples = ["none", ...DATA.examples.map((x) => x.id)];
  let shown = "none";
  kit = window.VisualKit.start({
    slug: "data-workbench",
    title: "Universal Data Workbench",
    summary: "Import CSV and Parquet tables and inspect every column on this device.",
    schemaVersion: 1,
    fields: { example: { type: "enum", values: examples, default: "none", label: "Example" } },
    derive: () => snapshot(),
    render: (state) => {
      draw();
      // A link, Back or Forward that names another example opens it; the example buttons also open it on click.
      if (state.example !== shown) {
        shown = state.example;
        if (shown !== "none") openExample(shown);
      }
    },
    report: (_state, d) => Report.report(d),
    bind() {
      for (const b of document.querySelectorAll("[data-example-open]")) b.addEventListener("click", () => openExample(b.value));
      byId("files").addEventListener("change", (ev) => { addFiles([...ev.target.files]); ev.target.value = ""; });
      const drop = byId("drop");
      drop.addEventListener("dragover", (ev) => { ev.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", (ev) => { ev.preventDefault(); drop.classList.remove("over"); addFiles([...(ev.dataTransfer?.files ?? [])]); });
      byId("import").addEventListener("click", importQueue);
      byId("cancel").addEventListener("click", cancel);
      byId("budget").addEventListener("change", (ev) => { store.budgetChoice = ev.target.value; refresh(); });
      const select = byId("budget");
      select.append(...Preflight.CHOICES.map((b) => h("option", { value: String(b), text: Preflight.bytes(b) })));
    },
    tools: [
      { name: "get_tables", description: "List the imported tables: source file, size, SHA-256, rows, columns, whether all rows or a sample, completion status and the rows the CSV reader could not read. Never returns rows.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
        execute: async () => ({ content: [{ type: "text", text: JSON.stringify(snapshot().tables.map(({ profiled, ...t }) => ({ ...t, profiledColumns: profiled.length })), null, 2) }] }) },
      { name: "get_profile", description: "Return one table's column profiles: source type, inferred type and its share, role with reasons, missing values, values that do not read, summaries, unusual values, suspected data errors and open suggestions. Profiles hold example values, never whole rows.",
        inputSchema: { type: "object", properties: { table: { type: "string", description: "The table name, as get_tables lists it" } }, required: ["table"], additionalProperties: false }, annotations: { readOnlyHint: true },
        execute: async (/** @type {any} */ input) => {
          const t = snapshot().tables.find((x) => x.name === input?.table);
          return { content: [{ type: "text", text: t ? JSON.stringify(t, null, 2) : `No table named ${JSON.stringify(input?.table)}; get_tables lists them.` }] };
        } },
    ],
    commands: [
      ...DATA.examples.map((x) => ({ label: `Open the example: ${x.title}`, run: () => { kit.set({ example: x.id }); openExample(x.id); } })),
      { label: "Choose files to import", run: () => byId("files").click() },
    ],
  });
})();
