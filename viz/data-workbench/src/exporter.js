/* Universal Data Workbench: the export package in one operation, and reopening a saved project.
 *
 * "Download the export package" writes every valid figure of every table, each page of a timeline, in each format
 * the person keeps ticked (SVG, PDF, PNG by the publication preset of src/publish.js, each read back and checked),
 * then the report, the JSON files, the deck and the project (src/package.js, src/project.js), the source files when
 * the person includes them, and the manifest last, into one zip (src/zip.js) saved through a blob link. It runs as
 * one piece of work with progress and Cancel; Cancel saves nothing. A figure that cannot be written is listed, and
 * the package then says it is incomplete, as it does for charts or statistics that did not finish.
 *
 * "Reopen a saved project" takes the package (or its project.json), finds each table's source in it, as a built-in
 * example, or as a file the person chooses, checks its size and SHA-256, imports it as it was imported, with the
 * readings, edits, study details and settings of the project, and then says how many SVG figures and test results
 * match the saved ones.
 */
(function (root, factory) {
  root.DWExport = factory(root.DWZip, root.DWPackage, root.DWProject, root.DWSha256, root.DWCharts, root.DWChartSpec, root.DWRender, root.DWRank, root.DWGrammar, root.DWFamily, root.DWExamples);
})(typeof self !== "undefined" ? self : this, function (Zip, Package, Project, Sha, Charts, ChartSpec, Render, Rank, Grammar, Family, Examples) {
  "use strict";

  /** What each chart operation of a specification does, for transforms.json (grammar.md has every rule). */
  const OPERATIONS = {
    records: "A derived table's charts start from the transformation records that made the table, by id (transforms.json lists each record).",
    complete: "Keep the rows with a value present in every encoded field (a timeline: a label and at least one end); nothing is filled, and the rows left out are counted on the figure.",
    bin: "Equal-width bins: the Freedman–Diaconis rule clamped to 5 to 100 bins, or the number you set.",
    bin2d: "A grid of equal-width cells on both axes, 40 by 40.",
    box: "Quartiles and the median; whiskers to the most extreme values within 1.5 × IQR of the box; at most 200 distinct values beyond them drawn.",
    top: "The most frequent levels kept (29 for a bar chart, 12 for groups and heatmap axes), the rest counted as Other.",
    period: "Time periods: the coarsest of hour, day, week (from Monday), month, quarter or year giving at least 20 periods, at most 500; values with an offset grouped in UTC.",
    aggregate: "Counts; or means with n and a 95% t interval; or sums of a field you marked additive.",
    sample: "Every point up to 50,000, else a seeded sample of 50,000 points (the numbers use every complete row).",
    "merge-duplicates": "Events with the same label, date, precision and qualifier merged into one mark with a count.",
    "order-check": "An interval timeline holds when the end is at or after the start in at least 90% of the rows with both.",
    page: "Timelines hold 500 events a figure, in time order; later events are later pages, each its own file.",
  };

  /**
   * Mount the export. `app` gives the page's store, h(), byId(), busy(), progress(), refresh(), ensureEngine(),
   * note(), message(), cancel(), formatting, snapshot(), the gallery, the findings, the publication figures, the
   * data block, the highlight count and reopen() (app.js imports the tables of a project).
   * @param {any} app
   */
  function mount(app) {
    const { store, h, byId, fmtInt, plural } = app;
    const view = { formats: ["svg", "pdf", "png"], sources: false, last: null, error: "", reopen: null };
    const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

    /* ---------- gathering the run ---------- */

    /** Every page of a paged tool answer. */
    function all(name, list, key) {
      const out = [];
      for (let offset = 0; ; offset += 1000) {
        const page = app.findings.tool(name, { list, offset });
        const items = page?.[key] ?? [];
        out.push(...items);
        if (items.length < 1000) return out;
      }
    }

    /** One table as the package reads it: its snapshot, candidates, findings, both lists and every hypothesis. */
    function gather(table, snap) {
      const st = app.gallery.state(table.name);
      const candidates = (st?.candidates ?? []).map((c) => ({ id: c.id, kind: c.kind, kindLabel: Render.KIND_LABEL[c.kind], fields: c.fields, outcome: c.outcome, reason: c.reason,
        edited: c.edited, desc: c.desc, pages: c.pages ?? 1, facts: c.facts, spec: c.spec }));
      const findings = app.findings.tool(table.name);
      const lists = findings?.lists ? { unusual: all(table.name, "unusual", "entries"), supported: all(table.name, "supported", "entries") } : null;
      const hypotheses = findings ? all(table.name, "family", "hypotheses") : [];
      const invalid = candidates.filter((c) => c.outcome === "valid" && !ChartSpec.validate(c.spec, st.ctx).ok).map((c) => c.id);
      const additive = Object.keys(store.additive).filter((k) => k.startsWith(`${table.name}\u0000`)).map((k) => k.split("\u0000")[1]);
      return { name: table.name, table, snapshot: snap, ctx: st?.ctx ?? null, candidates, overflow: st?.plan.overflow ?? {}, findings, lists, hypotheses, additive,
        validated: { checked: candidates.filter((c) => c.outcome === "valid").length, invalid } };
    }

    /** The tables of the page as the package reads them. */
    function tablesNow() {
      const snap = app.snapshot();
      return store.tables.map((t) => gather(t, snap.tables.find((x) => x.name === t.name)));
    }

    /** The seeds every result rests on. */
    function seedsOf(tables) {
      const out = [{ what: "scatter plots of more than 50,000 points draw a seeded sample", seed: ChartSpec.SEED }, { what: "permutation tests (T6) of the test catalogue", seed: Family.SEED }];
      for (const t of tables) {
        if (t.snapshot.sample) out.push({ what: `${t.name}: imported as a seeded sample of ${t.snapshot.sample.rows} rows`, seed: t.snapshot.sample.seed });
        if (t.snapshot.example === "planted") out.push({ what: `${t.name}: the Planted patterns example is generated from a seed`, seed: Examples.SEED });
        for (const hyp of t.hypotheses) if (hyp.seed !== undefined && hyp.seed !== Family.SEED) out.push({ what: `${t.name}: hypothesis ${hyp.id}`, seed: hyp.seed });
      }
      return out;
    }

    function methodsOf(publication) {
      return [
        `Charts: grammar v${Grammar.VERSION} (grammar.md beside the page): every single-field chart, pair chart and timeline of each table's measures, categories, times and labels, with fixed rules for bins, scales, levels and periods. Rows with a value missing are left out of that chart and counted on it; nothing is filled or removed.`,
        `Ranking and statistics: test catalogue v${Family.CATALOGUE} (catalog.md beside the page). Unusualness = usefulness × the share of complete rows − penalties. Each table's hypotheses form one family; p-values are adjusted by Benjamini–Yekutieli over it, and an adjusted p-value of at most 0.05 is exploratory evidence.`,
        `Distinct highlights per list: ${app.highlights()}; a redundant chart (same hypothesis or substitute fields) is skipped.`,
        `Figures: the ${publication.preset} preset (${publication.journal ? `${publication.journal}: ${publication.stage}` : "the workbench's own rules"}), ${publication.width ? `${publication.width} mm wide` : "each chart's own width"}, ${publication.dpi} dpi PNG, font ${publication.font}; each file is written, read back and checked (validation.json).`,
        "Engine: DuckDB in this browser; the files never left the device. No figure, report or deck holds a row; only counts, statistics and example values.",
      ];
    }

    /* ---------- the figures ---------- */

    /** SHA-256 of bytes. @param {Uint8Array} bytes */
    function sha(bytes) {
      const x = Sha.create();
      x.update(bytes);
      return x.hex();
    }

    /**
     * Write the figure files of tables in formats, one job after another with progress. Each file is read back and
     * checked; one that cannot be written is listed in failures.
     * @param {any[]} tables @param {string[]} formats @param {(job: any, file: any) => void} [keepSvg]
     */
    async function writeFigures(tables, formats, keepSvg) {
      const api = await app.ensureEngine();
      await app.publish.ready();
      const jobs = Package.jobs(tables, formats);
      const figures = [], failures = [], entries = [];
      for (const [i, job] of jobs.entries()) {
        if (store.stop) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
        app.progress(`Writing the figures: ${fmtInt(i + 1)} of ${fmtInt(jobs.length)} (${job.id}${job.pages > 1 ? `, page ${job.page}` : ""})`, i, jobs.length);
        const ctx = tables.find((t) => t.name === job.table).ctx;
        let drawn, files, result;
        try {
          const data = await Charts.compute(api.query, job.spec, ctx);
          if (data.excluded) throw new Error(data.excluded);
          drawn = await app.publish.draw(job.spec, data);
          files = await app.publish.write(drawn, formats);
          result = app.publish.checked(drawn, files);
        } catch (error) {
          if (app.cancelled(error) || store.stop) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
          for (const f of formats) failures.push({ path: job.paths[f], error: app.message(error) });
          continue;
        }
        for (const f of formats) {
          const file = files[f];
          if (!file?.blob) { failures.push({ path: job.paths[f], error: file?.error ?? "not written" }); continue; }
          const bytes = new Uint8Array(await file.blob.arrayBuffer());
          // The figure's own checks (text size, lines, colour, clipping, labels) and this file's.
          const checks = [...(result.checks ?? []), ...(result.files[f]?.checks ?? [])];
          figures.push({ table: job.table, id: job.id, page: job.page, format: f, path: job.paths[f], bytes: bytes.length, sha256: sha(bytes), verdict: result.files[f]?.verdict ?? null,
            failing: checks.filter((c) => c.status === "fail").map((c) => c.id), unverified: checks.filter((c) => c.status === "unverified").map((c) => c.id) });
          entries.push({ path: job.paths[f], data: bytes });
          if (f === "svg") keepSvg?.(job, file);
        }
      }
      return { figures, failures, entries };
    }

    /* ---------- the package ---------- */

    function saveBlob(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    /** The bytes of a table's source: the built-in example made again, or the file it was imported from. */
    function sourceOf(table) {
      if (table.example === "planted") return new TextEncoder().encode(Examples.planted());
      if (table.example) return new TextEncoder().encode(app.data.files[table.example]);
      return table.source ?? null;
    }

    const projectTable = (t, figures) => ({
      name: t.name,
      source: { file: t.table.file.name, kind: t.table.kind, bytes: t.table.file.bytes, sha256: t.table.file.sha256, example: t.table.example ?? null,
        included: view.sources ? Package.sourcePath(t.name, t.table.file.name) : null },
      import: { choice: t.table.sample ? "sample" : t.table.columnsKept ? "columns" : "full", sample: t.table.sample ?? null, columns: t.table.columnsKept ?? null, fileRows: t.table.sample?.of ?? t.table.imported.rows },
      overrides: t.table.overrides, dismissed: t.table.dismissed, additive: t.additive, study: app.findings.state(t.name)?.study ?? null,
      edits: t.candidates.filter((c) => c.edited).map((c) => ({ id: c.id, spec: c.spec })),
      figures: Object.fromEntries(figures.filter((f) => f.table === t.name && f.format === "svg").map((f) => [f.path, f.sha256])),
      results: Object.fromEntries(t.hypotheses.filter((x) => x.p !== undefined).map((x) => [x.id, [x.p ?? null, x.adjusted ?? null]])),
    });

    /** What a reopened analysed derived table restores and compares: as for an import, without a source file. */
    const analysedRecord = (t, figures) => {
      if (!t) return null;
      const { source: _source, import: _import, ...rest } = projectTable(t, figures);
      return rest;
    };

    function exportPackage() {
      if (!store.tables.length || store.busy) return Promise.resolve();
      view.error = "";
      return app.busy("Writing the export package", async () => {
        const saved = new Date();
        const formats = Package.FORMATS.filter((f) => view.formats.includes(f));
        try {
          const tables = tablesNow();
          const highlighted = new Set(tables.flatMap((t) => [...(t.findings?.lists?.unusual.highlighted ?? []), ...(t.findings?.lists?.supported.highlighted ?? [])].map((x) => `${t.name}\u0000${x.id}`)));
          const svgs = new Map();
          const written = await writeFigures(tables, formats, (job, file) => { if (job.page === 1 && highlighted.has(`${job.table}\u0000${job.id}`)) svgs.set(`${job.table}\u0000${job.id}`, file.text); });
          const publication = app.publish.summary();
          const transforms = app.snapshot().transforms;
          const run = {
            saved: saved.toISOString(), build: app.data.build, browser: navigator.userAgent, engine: app.snapshot().engine,
            versions: { grammar: Grammar.VERSION, specification: ChartSpec.SPEC_VERSION, catalogue: Family.CATALOGUE, package: Package.VERSION, project: Project.VERSION },
            publication, formats, sources: view.sources, beamdswitch: app.data.beamdswitch, pieces: app.data.pieces, step: app.data.step,
            highlights: app.highlights(), methods: methodsOf(publication), operations: OPERATIONS, describe: (x, spec) => Rank.transformText(x, spec),
            tables, figures: written.figures, failures: written.failures, seeds: seedsOf(tables), log: store.log.map((e) => e.text),
            project: Project.make({ saved: saved.toISOString(), build: app.data.build.page_sha256, versions: { grammar: Grammar.VERSION, catalogue: Family.CATALOGUE },
              highlights: app.highlights(), publication: app.publish.settings(), formats, sources: view.sources, tables: tables.filter((t) => t.table.kind !== "derived").map((t) => projectTable(t, written.figures)),
              derived: transforms.derived.map((d) => ({ name: d.name, kind: d.kind, sql: d.sql, origin: d.origin, inputs: d.inputs, analysed: d.analysed, pipeline: d.pipeline, rowColumn: d.rowColumn, how: d.how, what: d.what,
                restore: d.analysed ? analysedRecord(tables.find((t) => t.name === d.name), written.figures) : null })) }),
            transforms,
          };
          app.progress("Writing the report, the deck and the manifest", 0, 0);
          const { done, files } = Package.files(run, svgs, window.Beamdswitch);
          const entries = [...files.map((f) => ({ path: f.path, data: new TextEncoder().encode(f.data) })), ...written.entries];
          if (view.sources) {
            for (const t of tables.filter((x) => x.table.kind !== "derived")) {
              const src = sourceOf(t.table);
              if (src) entries.push({ path: Package.sourcePath(t.name, t.table.file.name), data: src });
            }
          }
          const listed = [];
          for (const e of entries) {
            const known = written.figures.find((f) => f.path === e.path);
            const isBlob = e.data instanceof Blob;
            listed.push({ path: e.path, bytes: isBlob ? e.data.size : e.data.length,
              sha256: known?.sha256 ?? (isBlob ? tables.find((t) => e.path === Package.sourcePath(t.name, t.table.file.name))?.table.file.sha256 : sha(e.data)) });
          }
          entries.push({ path: "manifest.json", data: Package.manifest(run, done, listed) });
          const zip = await Zip.write(entries, { date: saved, stopped: () => store.stop, progress: (k, total) => app.progress(`Packing the files: ${fmtInt(k)} of ${fmtInt(total)}`, k, total) });
          const name = `data-workbench-export-${run.saved.slice(0, 10)}.zip`;
          saveBlob(new Blob(zip.parts, { type: "application/zip" }), name);
          view.last = { name, bytes: zip.bytes, files: zip.entries, figures: written.figures.length, failures: written.failures.length, status: done.status, remaining: done.remaining };
          app.note({ kind: "export", text: `Saved ${name}: ${plural(written.figures.length, "figure file", "figure files")} of ${plural(tables.length, "table", "tables")}, ${plural(zip.entries, "file", "files")} in all, ${(zip.bytes / 2 ** 20).toFixed(1)} MB; ${done.status}${done.remaining.length ? ` (${plural(done.remaining.length, "item remains", "items remain")})` : ""}.` });
        } catch (error) {
          if (error?.name === "AbortError" || store.stop) { view.error = "Export cancelled: nothing was saved."; app.note({ kind: "cancelled", text: "Export cancelled: nothing was saved." }); }
          else { view.error = `The package could not be written: ${app.message(error)}`; app.note({ kind: "failed", text: view.error }); }
        }
      });
    }

    /* ---------- reopening ---------- */

    /** Read a chosen project: a package zip (with its sources when they are in it) or project.json. @param {File} file */
    async function choose(file) {
      view.reopen = { name: file.name, doc: null, error: "", given: new Map(), checks: new Map(), results: [], opened: [] };
      try {
        let text;
        if (/\.zip$/i.test(file.name)) {
          const zip = await Zip.open(file);
          if (!zip.has("project.json")) throw new Error("The zip holds no project.json: it is not an export package of the workbench.");
          text = await zip.text("project.json");
          const doc = Project.parse(text);
          for (const t of doc.tables) if (t.source.included && zip.has(t.source.included)) view.reopen.given.set(t.name, { blob: await zip.blob(t.source.included), from: "package" });
          view.reopen.doc = doc;
        } else view.reopen.doc = Project.parse(await file.text());
      } catch (error) {
        view.reopen.error = `${file.name} cannot be reopened: ${app.message(error)}`;
      }
      app.refresh();
    }

    /** Check a chosen source file against its record. @param {any} t @param {File} file */
    async function give(t, file) {
      const r = view.reopen;
      r.checks.set(t.name, { text: "Checking its SHA-256…", ok: false });
      app.refresh();
      const hash = await Sha.ofBlob(file);
      const c = Project.check(t.source, { bytes: file.size, sha256: hash ?? "" });
      r.checks.set(t.name, c);
      if (c.ok) r.given.set(t.name, { blob: file, from: "chosen" });
      else r.given.delete(t.name);
      app.refresh();
    }

    /** Reopen the project's tables, then check what they reproduce. */
    async function reopen() {
      const r = view.reopen;
      if (!r?.doc || store.busy) return;
      const doc = r.doc;
      app.publish.restore(doc.publication);
      app.setHighlights(doc.highlights);
      const opened = await app.reopen(doc, r.given);
      r.opened = opened;
      await app.settled();
      r.results = [];
      if (!opened.length) { app.refresh(); return; }
      await app.busy("Checking what the project reproduces", async () => {
        const tables = tablesNow().filter((t) => opened.includes(t.name));
        let written;
        try { written = await writeFigures(tables, ["svg"]); } catch { r.results.push({ table: "", text: "The check of the reopened figures was cancelled.", ok: false }); return; }
        for (const t of tables) {
          const saved = doc.tables.find((x) => x.name === t.name) ?? (doc.derived ?? []).find((x) => x.name === t.name)?.restore;
          const figures = Object.fromEntries(written.figures.filter((f) => f.table === t.name).map((f) => [f.path, f.sha256]));
          const results = Object.fromEntries(t.hypotheses.filter((x) => x.p !== undefined).map((x) => [x.id, [x.p ?? null, x.adjusted ?? null]]));
          const c = Project.compare(saved, figures, results);
          const text = `${t.name}: ${fmtInt(c.figures.same)} of ${plural(c.figures.saved, "SVG figure", "SVG figures")} and ${fmtInt(c.results.same)} of ${plural(c.results.saved, "test result", "test results")} match the saved project${c.reproduced ? "." : `; ${[c.figures.differ.length ? `${fmtInt(c.figures.differ.length)} figures differ (${c.figures.differ.slice(0, 3).join(", ")})` : "", c.figures.missing.length ? `${fmtInt(c.figures.missing.length)} not drawn` : "", c.figures.extra.length ? `${fmtInt(c.figures.extra.length)} new` : "", c.results.differ.length + c.results.missing.length ? `${fmtInt(c.results.differ.length + c.results.missing.length)} test results differ or are missing` : ""].filter(Boolean).join("; ")}.`}`;
          r.results.push({ table: t.name, text, ok: c.reproduced });
          app.note({ kind: "reopen", table: t.name, text: `Reopened ${text}` });
        }
      });
    }

    /* ---------- drawing ---------- */

    function draw() {
      const el = byId("export-view");
      if (!el) return;
      const tables = store.tables;
      const out = [];
      const formats = h("fieldset", { class: "edit-group" }, h("legend", { text: "Figure formats" }),
        Package.FORMATS.map((f) => h("label", { class: "choice" }, h("input", { type: "checkbox", name: "export-format", value: f, checked: view.formats.includes(f), disabled: !!store.busy,
          onchange: (ev) => { view.formats = ev.target.checked ? [...view.formats, f] : view.formats.filter((x) => x !== f); app.refresh(); } }), ` ${f.toUpperCase()}`)));
      const bytes = tables.reduce((a, t) => a + (t.file.bytes ?? 0), 0);
      const sources = h("label", { class: "choice" }, h("input", { type: "checkbox", id: "export-sources", checked: view.sources, disabled: !!store.busy, onchange: (ev) => { view.sources = ev.target.checked; app.refresh(); } }),
        ` Include the source files (${(bytes / 2 ** 20).toFixed(1)} MB): the package then holds your data`);
      out.push(h("form", { class: "edit export-options", onsubmit: (ev) => ev.preventDefault() }, formats, h("fieldset", { class: "edit-group" }, h("legend", { text: "Data" }), sources)));
      if (tables.length) {
        let pages = 0, valid = 0;
        for (const t of tables) for (const c of app.gallery.state(t.name)?.candidates ?? []) if (c.outcome === "valid") { valid += 1; pages += c.spec.transform.some((/** @type {any} */ x) => x.op === "page") ? c.pages ?? 1 : 1; }
        const settings = app.publish.summary();
        out.push(h("p", { class: "note", "data-export-plan": "" }, `The package will hold ${plural(valid, "valid figure", "valid figures")} of ${plural(tables.length, "table", "tables")}${pages > valid ? ` (${fmtInt(pages)} with every page of each timeline)` : ""}, ${view.formats.length ? `as ${view.formats.map((f) => f.toUpperCase()).join(", ")}` : "with no figure file: tick a format"}, by the ${settings.preset} preset (${settings.width ? `${settings.width} mm wide` : "each chart's own width"}, ${settings.dpi} dpi PNG; set it in a chart's full-size view), with report.md, highlights.json, the specifications, transforms.json, stats.json, validation.json, deck.md for beamdswitch, project.json and manifest.json.`));
        const open = [];
        for (const t of tables) {
          const st = app.gallery.state(t.name), f = app.findings.state(t.name);
          if (t.status !== "complete") open.push(`${t.name}: profiling is ${t.status}`);
          if (!st) open.push(`${t.name}: the charts are not generated`);
          else if (st.status !== "complete" || Grammar.accounting(st.candidates, sum(st.plan.overflow)).incomplete) open.push(`${t.name}: the charts are ${st.status === "generating" ? "being generated" : "incomplete"}`);
          if (!f?.family || f.status !== "complete") open.push(`${t.name}: the statistics ${f?.status === "running" ? "are running" : "have not completed"}`);
        }
        if (open.length) out.push(h("p", { class: "warn-text", "data-export-open": "" }, `The package will say it is incomplete: ${open.join("; ")}.`));
      } else out.push(h("p", { class: "note", text: "Import a table or open an example first: the package holds its figures." }));
      out.push(h("p", { class: "actions" },
        h("button", { type: "button", id: "export-package", class: "primary", disabled: !tables.length || !!store.busy || !view.formats.length, onclick: exportPackage, text: "Download the export package" }),
        store.busy ? h("button", { type: "button", onclick: () => app.cancel(), text: "Cancel" }) : null,
        store.busy ? h("span", { class: "note", text: ` ${store.busy.text}` }) : null));
      if (view.error) out.push(h("p", { class: "warn-text", role: "alert", text: view.error }));
      if (view.last) {
        const l = view.last;
        out.push(h("p", { class: l.status === "complete" ? "ok-text" : "warn-text", "data-export-status": l.status },
          `Saved ${l.name}: ${plural(l.figures, "figure file", "figure files")}, ${plural(l.files, "file", "files")} in all, ${(l.bytes / 2 ** 20).toFixed(1)} MB. ${l.status === "complete" ? "Complete." : `Incomplete: ${l.remaining.join(" ")}`}${l.failures ? ` ${plural(l.failures, "file", "files")} could not be written; validation.json says why.` : ""}`));
      }
      out.push(reopenView());
      el.replaceChildren(...out);
    }

    function reopenView() {
      const r = view.reopen;
      const parts = [h("h3", { id: "reopen-title", text: "Reopen a saved project" }),
        h("p", { class: "note", text: "Choose an export package (.zip) or its project.json. Each table is imported again from its source, which must be the same file: its size and SHA-256 are checked. Its readings, chart edits, study details, highlight count and publication settings come back, and the page then says how many figures and test results match the saved ones." }),
        h("div", { class: "field" }, h("label", { for: "reopen-file", text: "Saved project" }),
          h("input", { type: "file", id: "reopen-file", accept: ".zip,.json,application/zip,application/json", disabled: !!store.busy, onchange: (ev) => { const f = ev.target.files?.[0]; if (f) choose(f); ev.target.value = ""; } }))];
      if (!r) return h("section", { class: "reopen", "aria-labelledby": "reopen-title" }, parts);
      if (r.error) parts.push(h("p", { class: "warn-text", role: "alert", text: r.error }));
      if (r.doc) {
        const rows = r.doc.tables.map((t) => {
          const given = r.given.get(t.name), check = r.checks.get(t.name);
          const open = store.tables.some((x) => x.name === t.name);
          const status = r.opened.includes(t.name) ? h("span", { class: "ok-text", text: "Reopened." })
            : open ? h("span", { class: "warn-text", text: "A table of this name is open: remove it to reopen this one." })
            : t.source.example ? h("span", { class: "ok-text", text: "A built-in example: made again and checked." })
            : given?.from === "package" ? h("span", { class: "ok-text", text: "In the package: checked when it is reopened." })
            : h("span", {}, h("label", { for: `reopen-${t.name}`, text: `Choose ${t.source.file}` }), " ",
              h("input", { type: "file", id: `reopen-${t.name}`, accept: t.source.kind === "parquet" ? ".parquet" : ".csv,.txt", disabled: !!store.busy, onchange: (ev) => { const f = ev.target.files?.[0]; if (f) give(t, f); } }),
              check ? h("span", { class: check.ok ? "ok-text" : "warn-text", "data-source-check": check.ok ? "ok" : "differs", text: ` The file ${check.text}` }) : null);
          return h("li", { "data-reopen-table": t.name }, h("strong", { text: `${t.name}: ` }), `${t.source.file}, ${fmtInt(t.source.bytes)} bytes, SHA-256 ${t.source.sha256.slice(0, 12)}… `, status);
        });
        const ready = r.doc.tables.filter((t) => !store.tables.some((x) => x.name === t.name) && (t.source.example || r.given.has(t.name)));
        parts.push(h("p", {}, `${r.name}, saved ${String(r.doc.saved).slice(0, 10)}: ${plural(r.doc.tables.length, "table", "tables")}.`), h("ul", { class: "reopen-tables" }, rows),
          ready.length ? h("p", { class: "actions" }, h("button", { type: "button", id: "reopen-go", class: "primary", disabled: !!store.busy, onclick: reopen,
            text: ready.length === r.doc.tables.length ? "Reopen the project" : `Reopen ${plural(ready.length, "table", "tables")} of ${r.doc.tables.length}` })) : null);
        for (const x of r.results) parts.push(h("p", { class: x.ok ? "ok-text" : "warn-text", "data-reproduced": x.ok ? "yes" : "no", text: x.text }));
      }
      return h("section", { class: "reopen", "aria-labelledby": "reopen-title" }, parts);
    }

    return { draw, exportPackage, OPERATIONS };
  }

  return { mount, OPERATIONS };
});
