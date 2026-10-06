/* Universal Data Workbench: the files of the export package, from what the page computed.
 *
 * The page (src/exporter.js) or a Node check gathers a run: the tables with their candidates and specifications,
 * the findings and hypotheses of each, the figure files it wrote with their checks, the publication settings, the
 * engine and build, and the project. This file turns the run into the package's text files, the same way in both:
 *
 *   figures/<table>/<chart>[.p<page>].<svg|pdf|png>   written by the page; every page of a timeline
 *   report.md           captions, methods, highlights and every figure, with links to the files
 *   highlights.json     both lists, their distinct highlights explained, the redundancy clusters
 *   specs/<table>.json  every candidate: outcome, reason, its files and its chart specification
 *   transforms.json     how each table was read, the conversion log, and each chart operation defined
 *   stats.json          each family: definition, every hypothesis with its test, effect, raw and adjusted p-value
 *   validation.json     the accounting, the specifications validated, each figure's checks, the deck
 *   deck.md             the beamdswitch deck: highlighted figures as base64 SVG images, statistics in LaTeX
 *   project.json        what reopens the project (src/project.js)
 *   sources/<file>      the source files, only when the person includes them
 *   manifest.json       last: every other file with its size and SHA-256, the versions, seeds, completion status
 *                       and remaining work
 *
 * Text from the data (table, column and level names) is escaped wherever it enters Markdown, and never enters the
 * deck's narration, which beamdswitch reads aloud. Nothing here holds a row.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWPackage = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FORMAT = "universal-data-workbench-package";
  const VERSION = 1;
  const FORMATS = ["svg", "pdf", "png"];
  const whole = new Intl.NumberFormat("en-US");
  const n = (x) => (Number.isFinite(x) ? whole.format(Math.round(x)) : "–");
  const count = (x, one, many) => `${n(x)} ${x === 1 ? one : many}`;
  const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

  /** Text from the data inside Markdown: one line, every character that means something to Markdown escaped. */
  const md = (text) => String(text ?? "").replace(/\s+/g, " ").trim().replace(/[\\`*_[\]<>$|#~]/g, "\\$&").replace(/^([-+:>]|\d+[.)])/, "\\$1");

  /** A file name for a chart id: ids are [a-z0-9_.-]; a long one is cut, with a short hash of itself. */
  function base(id) {
    const s = String(id);
    if (s.length <= 180) return s;
    let h = 0x811c9dc5;
    for (const ch of s) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193) >>> 0;
    return `${s.slice(0, 170)}-${h.toString(16).padStart(8, "0")}`;
  }

  /** The path of a figure file: a timeline of more than one page gets one file a page, p1 first. */
  const figurePath = (table, id, page, pages, format) => `figures/${table}/${base(id)}${pages > 1 ? `.p${page}` : ""}.${format}`;

  /** A source file's place in the package: the file name as given, kept apart by table. */
  const sourcePath = (table, file) => `sources/${table}/${String(file).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").slice(0, 200) || "source"}`;

  /** The specification of one page of a paged chart. */
  function pageSpec(spec, page) {
    const t = spec.transform.find((/** @type {any} */ x) => x.op === "page");
    if (!t || t.page === page) return spec;
    const copy = JSON.parse(JSON.stringify(spec));
    copy.transform.find((/** @type {any} */ x) => x.op === "page").page = page;
    return copy;
  }

  /**
   * Every figure the package holds, before any is written: each valid candidate of each table, each page of a
   * timeline, in each requested format.
   * @param {any[]} tables { name, candidates } @param {string[]} formats
   */
  function jobs(tables, formats) {
    const out = [];
    for (const t of tables) {
      for (const c of t.candidates) {
        if (c.outcome !== "valid") continue;
        const pages = c.spec.transform.some((/** @type {any} */ x) => x.op === "page") ? Math.max(1, c.pages ?? 1) : 1;
        for (let page = 1; page <= pages; page++) {
          out.push({ table: t.name, id: c.id, page, pages, spec: pageSpec(c.spec, page), paths: Object.fromEntries(formats.map((f) => [f, figurePath(t.name, c.id, page, pages, f)])) });
        }
      }
    }
    return out;
  }

  /* ---------- completion ---------- */

  /**
   * Whether the package holds everything its tables call for, and what remains: a table not profiled to the end,
   * charts not generated or incomplete, statistics not run or incomplete, figures not written.
   * @param {any} run
   */
  function completion(run) {
    const remaining = [];
    for (const t of run.tables) {
      const s = t.snapshot;
      if (s.status !== "complete") remaining.push(`${t.name}: profiling is ${s.status}${s.reason ? ` (${s.reason})` : ""}; ${count(s.notProfiled.length, "column is", "columns are")} not profiled.`);
      const ch = s.charts;
      if (!ch) remaining.push(`${t.name}: the charts are not generated.`);
      else {
        const left = ch.incomplete + ch.pending;
        if (ch.status !== "complete" || left) remaining.push(`${t.name}: the charts are ${ch.status === "generating" ? "being generated" : ch.status}${ch.reason ? ` (${ch.reason})` : ""}: ${count(left, "candidate has", "candidates have")} no figure yet.`);
        if (ch.failed) remaining.push(`${t.name}: ${count(ch.failed, "candidate", "candidates")} failed; specs/${t.name}.json gives each error.`);
      }
      const f = s.findings;
      if (!f || f.status === "none") remaining.push(`${t.name}: the statistics have not run, so there are no ranked lists or highlights.`);
      else if (f.status !== "complete") remaining.push(`${t.name}: the statistics are ${f.status}${f.reason ? ` (${f.reason})` : ""}, so there are no adjusted p-values or ranked lists.`);
      else if (!t.findings?.lists) remaining.push(`${t.name}: the charts changed after the statistics ran; run them again for the ranked lists.`);
    }
    const failed = run.failures ?? [];
    if (failed.length) remaining.push(`${count(failed.length, "figure file", "figure files")} could not be written: ${failed.slice(0, 5).map((x) => `${x.path} (${x.error})`).join("; ")}${failed.length > 5 ? "; validation.json lists the rest" : ""}.`);
    return { status: remaining.length ? "incomplete" : "complete", remaining };
  }

  /* ---------- the JSON files ---------- */

  /** specs/<table>.json: the accounting and every candidate with its outcome, reason, files and specification. */
  function specsFile(run, t) {
    const files = new Map();
    for (const f of run.figures) if (f.table === t.name) files.set(f.id, [...(files.get(f.id) ?? []), f.path]);
    return json({
      table: t.name, grammar: run.versions.grammar, specification: run.versions.specification, accounting: t.snapshot.charts,
      candidates: t.candidates.map((c) => ({ id: c.id, kind: c.kind, fields: c.fields, outcome: c.outcome, reason: c.reason || undefined, edited: c.edited || undefined,
        description: c.desc || undefined, pages: c.pages > 1 ? c.pages : undefined, files: files.get(c.id) ?? [], spec: c.spec ?? null })),
      beyondTheCap: t.overflow ?? {},
    });
  }

  /** transforms.json: how each table was read and changed, and every chart operation the specifications use. */
  function transformsFile(run) {
    const ops = new Map();
    for (const t of run.tables) for (const c of t.candidates) for (const x of c.spec?.transform ?? []) if (!ops.has(x.op)) ops.set(x.op, run.operations[x.op] ?? x.op);
    return json({
      tables: run.tables.map((t) => {
        const s = t.snapshot;
        return {
          table: t.name, source: { file: s.file.name, bytes: s.file.bytes, sha256: s.file.sha256, kind: s.kind, example: s.example ?? null },
          import: { rows: s.rows, columns: s.columns, rowColumn: s.rowColumn, sample: s.sample ?? null, columnsKept: s.columnsKept ?? null, dialect: s.dialect ?? null,
            rejectedLines: s.rejected?.count ?? 0, parquet: s.parquet ?? null },
          readings: s.profiled.map((c) => ({ column: c.name, sourceType: c.sourceType, type: c.type, reading: c.reading, share: c.share, role: c.role, unit: c.unit ?? null, yourChanges: c.yourChanges })),
          additive: t.additive ?? [],
          chartTransforms: t.candidates.filter((c) => c.outcome === "valid").map((c) => ({ chart: c.id, steps: (c.spec?.transform ?? []).map((/** @type {any} */ x) => ({ ...x, means: run.describe?.(x, c.spec) })) })),
        };
      }),
      operations: Object.fromEntries(ops),
      log: run.log,
    });
  }

  /** highlights.json: both lists of each table, their highlights explained, and the redundancy clusters. */
  function highlightsFile(run) {
    return json({
      count: run.highlights,
      tables: run.tables.map((t) => {
        const l = t.findings?.lists;
        if (!l) return { table: t.name, status: t.snapshot.findings?.status ?? "none", lists: null, reason: t.findings?.reason ?? "The statistics have not run for this table." };
        const files = (id) => run.figures.filter((f) => f.table === t.name && f.id === id).map((f) => f.path);
        const list = (name) => ({ charts: l[name].charts, fewer: l[name].fewer || undefined, highlighted: l[name].highlighted.map((x) => ({ ...x, files: files(x.id) })), entries: t.lists?.[name] ?? [] });
        return { table: t.name, status: "complete", unusual: list("unusual"), supported: list("supported"),
          redundancy: Object.entries((t.lists?.unusual ?? []).reduce((a, e) => ({ ...a, [e.cluster]: [...(a[e.cluster] ?? []), e.id] }), /** @type {Record<string, string[]>} */ ({})))
            .filter(([, ids]) => ids.length > 1).map(([cluster, ids]) => ({ cluster, charts: ids })) };
      }),
    });
  }

  /** stats.json: each table's family and every hypothesis, tested or not, with its subsets. */
  function statsFile(run) {
    return json({
      catalogue: run.versions.catalogue, correction: "Benjamini–Yekutieli over each family; an adjusted p-value of at most 0.05 is exploratory evidence",
      tables: run.tables.map((t) => (t.findings ? { table: t.name, family: t.findings.family, hypotheses: t.hypotheses ?? [], subsets: t.findings.subsets ?? [] }
        : { table: t.name, family: null, reason: "The statistics have not run for this table." })),
    });
  }

  /** validation.json: the accounting, the specifications validated, each figure file's checks, the deck. */
  function validationFile(run, deck) {
    const verdicts = { pass: 0, fail: 0, unverified: 0 };
    for (const f of run.figures) if (f.verdict) verdicts[/** @type {keyof typeof verdicts} */ (f.verdict.status)] = (verdicts[/** @type {keyof typeof verdicts} */ (f.verdict.status)] ?? 0) + 1;
    return json({
      accounting: run.tables.map((t) => ({ table: t.name, candidates: t.snapshot.charts?.total ?? 0, everyOneHasAnOutcome: !!t.snapshot.charts && t.snapshot.charts.pending === 0,
        valid: t.snapshot.charts?.valid ?? 0, excluded: t.snapshot.charts?.excluded ?? 0, failed: t.snapshot.charts?.failed ?? 0, incomplete: t.snapshot.charts?.incomplete ?? 0 })),
      specifications: run.tables.map((t) => ({ table: t.name, checked: t.validated?.checked ?? 0, invalid: t.validated?.invalid ?? [] })),
      figures: { preset: run.publication.preset, files: run.figures.length, verdicts,
        each: run.figures.map((f) => ({ path: f.path, bytes: f.bytes, verdict: f.verdict?.status ?? null, failing: f.failing?.length ? f.failing : undefined, unverified: f.unverified?.length ? f.unverified : undefined })),
        notWritten: run.failures ?? [] },
      deck: deck.check,
    });
  }

  /* ---------- report.md ---------- */

  function reportMd(run, done) {
    const out = [`# Universal Data Workbench: export package`, "",
      `Saved ${run.saved} by the Universal Data Workbench (${run.build.page_sha256.slice(0, 12)}), DuckDB ${md(run.engine.duckdb)} through DuckDB-WASM ${md(run.engine.duckdbWasm)}, in ${md(run.browser)}.`, "",
      done.status === "complete" ? "**Status: complete.** Every valid figure of every table is in this package." : `**Status: incomplete.** ${count(done.remaining.length, "item remains", "items remain")}; the list closes this report and manifest.json holds it too.`, "",
      "## What the package holds", "",
      `- \`figures/\`: ${count(run.figures.length, "file", "files")}, every valid figure as ${run.formats.map((f) => f.toUpperCase()).join(", ")}, every page of each timeline (publication preset ${md(run.publication.preset)}).`,
      "- `specs/`: each table's candidates with their outcome, reason and chart specification.",
      "- `transforms.json`, `stats.json`, `highlights.json`, `validation.json`: the readings and transformations, the statistics, the two lists with their highlights, and every check.",
      "- `deck.md`: a beamdswitch deck of the highlighted figures. `project.json`: open it in the workbench to reopen this project.",
      run.sources ? "- `sources/`: the source files, as you chose to include them." : "- The source files are not included; reopening the project asks for them and checks each one's SHA-256.",
      "- `manifest.json`: every file's size and SHA-256, the versions, the seeds and the completion status.", "",
      "## Sources", "",
      "| Table | File | Bytes | SHA-256 | Rows used |", "| --- | --- | --- | --- | --- |",
      ...run.tables.map((t) => `| ${md(t.name)} | ${md(t.snapshot.file.name)} | ${n(t.snapshot.file.bytes)} | \`${t.snapshot.file.sha256 || "not computed"}\` | ${n(t.snapshot.rows)}${t.snapshot.sample ? ` (a seeded sample, seed ${t.snapshot.sample.seed})` : ""} |`), "",
      "## Methods", "",
      ...run.methods.map((m) => `- ${m}`), ""];
    for (const t of run.tables) {
      const s = t.snapshot, ch = s.charts;
      out.push(`## ${md(t.name)}`, "");
      out.push(ch ? `Charts of grammar v${run.versions.grammar}: ${count(ch.total, "candidate", "candidates")} (${md(ch.formula)} = ${n(ch.expected)}); ${n(ch.valid)} valid, ${n(ch.excluded)} excluded, ${n(ch.failed)} failed, ${n(ch.incomplete)} incomplete.` : "The charts are not generated.", "");
      const l = t.findings?.lists;
      if (l) {
        for (const [key, title] of [["unusual", "Unusual patterns"], ["supported", "Statistically supported patterns"]]) {
          const list = l[key];
          out.push(`### ${title}: ${count(list.highlighted.length, "distinct highlight", "distinct highlights")} of ${count(list.charts, "chart", "charts")}`, "");
          if (list.fewer) out.push(`${md(list.fewer)}`, "");
          list.highlighted.forEach((x, i) => {
            const svg = run.figures.find((f) => f.table === t.name && f.id === x.id && f.format === "svg" && f.page === 1);
            out.push(`#### ${i + 1}. ${md(x.title)}`, "");
            if (svg) out.push(`![${md(x.title)}](${svg.path})`, "");
            out.push("**Observed.**", "", ...x.observed.map((o) => `- ${md(o)}`), "", "**Why highlighted.**", "", ...x.why.map((o) => `- ${md(o)}`), "",
              "**Statistical status.**", "", ...x.status.map((o) => `- ${md(o)}`), "", "**Cautions.**", "", ...x.cautions.map((o) => `- ${md(o)}`), "");
          });
        }
      } else out.push(`No ranked lists: ${md(t.findings?.reason ?? "the statistics have not run for this table")}.`, "");
      out.push(`### Every figure of ${md(t.name)}`, "");
      for (const c of t.candidates.filter((x) => x.outcome === "valid")) {
        const files = run.figures.filter((f) => f.table === t.name && f.id === c.id);
        out.push(`#### ${md(c.spec.annotation.title)}`, "");
        const first = files.find((f) => f.format === "svg" && f.page === 1);
        if (first) out.push(`![${md(c.spec.annotation.title)}](${first.path})`, "");
        out.push(`${md(c.desc)}${c.edited ? " Edited by you." : ""}`, "",
          `- Chart: \`${c.id}\`, ${md(c.kindLabel)} of ${c.fields.map(md).join(", ")}.`,
          `- Transformations: ${(c.spec.transform ?? []).map((/** @type {any} */ x) => md(run.describe?.(x, c.spec) ?? x.op)).join(" ")}`,
          `- Files: ${files.map((f) => `[${f.path.split("/").pop()}](${f.path})`).join(", ") || "none written"}.`, "");
      }
      const others = t.candidates.filter((c) => c.outcome !== "valid");
      if (others.length) out.push(`### Not valid in ${md(t.name)}`, "", ...others.map((c) => `- ${c.outcome}: \`${c.id}\`. ${md(c.reason)}`), "");
    }
    out.push("## Conversion log", "", ...(run.log.length ? run.log.map((line, i) => `${i + 1}. ${md(line)}`) : ["Nothing was converted."]), "");
    out.push("## Remaining work", "", ...(done.remaining.length ? done.remaining.map((r) => `- ${md(r)}`) : ["None: the package is complete."]), "",
      `This workbench is a preview; steps still to come: ${run.pieces.map((p) => md(p.title)).join("; ") || "none"}.`, "");
    return out.join("\n");
  }

  /* ---------- deck.md ---------- */

  /** A number in LaTeX: thousands grouped, at most four significant digits. */
  function tex(x) {
    if (!Number.isFinite(x)) return "\\text{–}";
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e6 || a < 1e-4)) {
      const [m, e] = x.toExponential(2).split("e");
      return `${m} \\times 10^{${Number(e)}}`;
    }
    const s = Number.isInteger(x) ? whole.format(x) : Number(x.toPrecision(4)).toLocaleString("en-US", { maximumFractionDigits: 6 });
    return s.replace(/,/g, "{,}");
  }

  const SYMBOL = {
    "Spearman's rho": "\\rho_s", "Hedges' g": "g", "omega-squared": "\\omega^2", "Cramér's V": "V", "Cramér's V of period and level": "V", "Kendall's tau": "\\tau",
    "Kendall's tau of the counts": "\\tau", "skewness": "\\gamma_1", "bimodality coefficient": "\\mathrm{BC}", "share of values with robust z above 3.5": "\\text{share}_{|z|>3.5}",
    "rarity of the rarest level": "\\text{rarity}", "largest shift in long-run SD": "\\Delta/\\sigma_{\\mathrm{LR}}", "level shift in long-run SD": "\\Delta/\\sigma_{\\mathrm{LR}}",
  };

  /** The statistics line of a highlight, in LaTeX: its effect measure, unusualness, adjusted p-value and rows. */
  function statsTex(x, facts) {
    const parts = [];
    const u = x.scores?.usefulness;
    if (u && u.name !== "none" && Number.isFinite(u.value)) parts.push(`${SYMBOL[u.name] ?? "\\text{effect}"} = ${tex(u.value)}`);
    parts.push(`U = ${tex(x.unusualness)}`);
    if (Number.isFinite(x.adjusted)) parts.push(`p_{\\mathrm{adj}} = ${tex(x.adjusted)}`);
    if (facts && Number.isFinite(facts.used)) parts.push(`n = ${tex(facts.used)}`);
    return `$$${parts.join(",\\quad ")}$$`;
  }

  /** Base64 of UTF-8 text. */
  function base64(text) {
    const bytes = new TextEncoder().encode(text);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
  }

  const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  const nth = (i) => ORDINAL[i] ?? `number ${i + 1}`;

  /**
   * deck.md: the beamdswitch deck of the package, through the site's template (its sections, narration and key). Each
   * distinct highlighted figure is a frame: its SVG file as a base64 image and its statistics in LaTeX, with what was
   * observed, its tests and cautions in the notes. `svgs` maps "table\u0000chart id" to the SVG file text.
   * @param {any} run @param {Map<string, string>} svgs @param {any} Beamdswitch the template @param {{ status: string, remaining: string[] }} done
   */
  function deck(run, svgs, Beamdswitch, done) {
    const tables = run.tables;
    const results = [];
    let embedded = 0;
    tables.forEach((t, ti) => {
      const l = t.findings?.lists;
      const ch = t.snapshot.charts;
      results.push({
        title: `${md(t.name)}: ${count(ch?.valid ?? 0, "valid figure", "valid figures")}`,
        body: [`- ${count(t.snapshot.rows, "row", "rows")} and ${count(t.snapshot.columns, "column", "columns")} from ${md(t.snapshot.file.name)}.`,
          ch ? `- ${count(ch.total, "candidate", "candidates")}: ${n(ch.valid)} valid, ${n(ch.excluded)} excluded, ${n(ch.failed)} failed, ${n(ch.incomplete)} incomplete.` : "- The charts are not generated.",
          l ? `- Distinct highlights: ${n(l.unusual.highlighted.length)} of unusual patterns, ${n(l.supported.highlighted.length)} of statistically supported patterns.`
            : `- No ranked lists: ${md(t.findings?.reason ?? "the statistics have not run")}.`].join("\n"),
        narration: `The ${nth(ti)} table has ${count(t.snapshot.rows, "row", "rows")}. ${count(ch?.valid ?? 0, "figure is", "figures are")} valid${l ? `, and ${count(l.unusual.highlighted.length, "is", "are")} highlighted as unusual` : ""}.`,
      });
      if (!l) return;
      const order = [...l.unusual.highlighted.map((x) => x.id), ...l.supported.highlighted.map((x) => x.id)].filter((id, i, a) => a.indexOf(id) === i);
      for (const id of order) {
        const x = l.unusual.highlighted.find((y) => y.id === id) ?? l.supported.highlighted.find((y) => y.id === id);
        const cand = t.candidates.find((c) => c.id === id);
        const svg = svgs.get(`${t.name}\u0000${id}`);
        const inUnusual = l.unusual.highlighted.findIndex((y) => y.id === id), inSupported = l.supported.highlighted.findIndex((y) => y.id === id);
        const where = [inUnusual >= 0 ? `highlight ${inUnusual + 1} of the unusual patterns` : "", inSupported >= 0 ? `highlight ${inSupported + 1} of the statistically supported patterns` : ""].filter(Boolean).join(" and ");
        if (svg) embedded += 1;
        results.push({
          title: md(x.title),
          body: [svg ? `![${md(x.title)}](data:image/svg+xml;base64,${base64(svg)})` : "*The figure could not be written; validation.json says why.*", "",
            statsTex(x, cand?.facts)].join("\n"),
          // What was observed, the tests and the cautions go to the presenter's notes and the handout: the slide holds the figure.
          notes: [...x.observed.map(md), ...x.status.map(md), ...x.cautions.map(md)].join("\n\n"),
          narration: `This ${String(cand?.kindLabel ?? "figure").toLowerCase()} is ${where}. ${x.adjusted !== null && x.adjusted !== undefined && x.adjusted <= 0.05 ? "Its adjusted p value is at most 0.05, which is exploratory evidence, not proof." : "No test flags it, so it is descriptive."} An association in it is not a cause.`,
        });
      }
    });
    const valid = tables.reduce((a, t) => a + (t.snapshot.charts?.valid ?? 0), 0);
    const report = {
      meta: { title: "Universal Data Workbench: highlighted figures", subtitle: `${count(tables.length, "table", "tables")}, ${count(valid, "valid figure", "valid figures")}`, date: run.saved.slice(0, 10), voice: "bf_emma" },
      narration: `This deck shows the highlighted figures of ${count(tables.length, "table", "tables")}, from an export package of the Universal Data Workbench.`,
      setup: [{
        title: "What was analysed",
        body: tables.length ? tables.map((t) => `- ${md(t.name)}: ${md(t.snapshot.file.name)}, ${count(t.snapshot.rows, "row", "rows")}${t.snapshot.sample ? `, a seeded sample (seed ${t.snapshot.sample.seed})` : ""}; SHA-256 \`${t.snapshot.file.sha256 || "not computed"}\``).join("\n") : "- No table.",
        narration: `${count(tables.length, "table was", "tables were")} imported on one device. The files never left it.`,
      }],
      method: [{
        title: "How the figures were found",
        body: run.methods.slice(0, 6).map((m) => `- ${m}`).join("\n"),
        narration: "Every valid chart of a fixed grammar was drawn, then ranked by how unusual it is. Tests in each table share one family, corrected by the Benjamini Yekutieli method.",
      }],
      results: results.length ? results : [{ title: "No table", body: "- Import a table to see its figures.", narration: "There is no table yet." }],
      checks: [{
        title: done.status === "complete" ? "The package is complete" : "The package is incomplete",
        body: [`- Figure files written: ${n(run.figures.length)}; not written: ${n((run.failures ?? []).length)}.`,
          ...done.remaining.slice(0, 8).map((r) => `- ${md(r)}`)].join("\n"),
        narration: done.status === "complete" ? "Every valid figure of every table is in the package." : `The package is incomplete: ${count(done.remaining.length, "item remains", "items remain")}, as its manifest lists.`,
        key: "Highlights are observed patterns, ranked by fixed rules; an adjusted p value of at most 0.05 is exploratory evidence, never a cause.",
      }],
    };
    const text = Beamdswitch.deck(report);
    return { text, check: { template: "the site's beamdswitch template (scripts/templates/beamdswitch.js)", voice: "bf_emma", frames: 1 + 4 + report.setup.length + report.method.length + report.results.length + report.checks.length,
      figuresEmbedded: embedded, testedWith: run.beamdswitch } };
  }

  /* ---------- the package ---------- */

  /**
   * The text files of the package, and the deck's own check, from a run. The manifest comes last, from every other
   * file (manifest()).
   * @param {any} run @param {Map<string, string>} svgs @param {any} Beamdswitch
   */
  function files(run, svgs, Beamdswitch) {
    const done = completion(run);
    const d = deck(run, svgs, Beamdswitch, done);
    return {
      done, deck: d,
      files: [
        { path: "report.md", data: reportMd(run, done) },
        { path: "highlights.json", data: highlightsFile(run) },
        ...run.tables.map((t) => ({ path: `specs/${t.name}.json`, data: specsFile(run, t) })),
        { path: "transforms.json", data: transformsFile(run) },
        { path: "stats.json", data: statsFile(run) },
        { path: "validation.json", data: validationFile(run, d) },
        { path: "deck.md", data: d.text },
        { path: "project.json", data: json(run.project) },
      ],
    };
  }

  /**
   * manifest.json: what made the package and everything in it.
   * @param {any} run @param {{ status: string, remaining: string[] }} done @param {{ path: string, bytes: number, sha256: string }[]} listed every other file
   */
  function manifest(run, done, listed) {
    return json({
      format: FORMAT, version: VERSION, saved: run.saved,
      status: done.status, remaining: done.remaining,
      build: run.build, browser: run.browser,
      engine: { duckdb: run.engine.duckdb, duckdbWasm: run.engine.duckdbWasm, memoryBudget: run.engine.budget },
      versions: run.versions,
      publication: run.publication,
      formats: run.formats,
      beamdswitch: run.beamdswitch,
      sources: run.tables.map((t) => ({ table: t.name, file: t.snapshot.file.name, bytes: t.snapshot.file.bytes, sha256: t.snapshot.file.sha256, example: t.snapshot.example ?? null,
        included: run.sources ? sourcePath(t.name, t.snapshot.file.name) : null })),
      seeds: run.seeds,
      transformations: "transforms.json", statisticalMethods: "stats.json",
      preview: { step: run.step, stepsToCome: run.pieces.map((p) => p.title) },
      files: listed,
    });
  }

  return { FORMAT, VERSION, FORMATS, md, base, figurePath, sourcePath, pageSpec, jobs, completion, files, manifest, tex, statsTex };
});
