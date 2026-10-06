// The export package (step 5) with the pinned engine, through the page's own modules: the zip written and read back
// (and by Python's zipfile, an independent reader), every valid figure and every page of a timeline in the package,
// the manifest's hashes, versions, seeds and completion status, report.md's links, the specifications validated,
// deck.md parsed by beamdswitch's parser (the vendored copy and the upstream one at the tested commit), and a saved
// project made again from the same bytes reproducing every SVG figure and test result, a changed file refused.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { engine } from "./engine.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Profile = require("../src/profile.js");
/** @type {any} */ const Examples = require("../src/examples.js");
/** @type {any} */ const Grammar = require("../src/grammar.js");
/** @type {any} */ const ChartSpec = require("../src/chartspec.js");
/** @type {any} */ const Charts = require("../src/charts.js");
/** @type {any} */ const Family = require("../src/family.js");
/** @type {any} */ const Rank = require("../src/rank.js");
/** @type {any} */ const Render = require("../src/render.js");
/** @type {any} */ const Figure = require("../src/figure.js");
/** @type {any} */ const Fonts = require("../src/fonts.js");
/** @type {any} */ const Zip = require("../src/zip.js");
/** @type {any} */ const Package = require("../src/package.js");
/** @type {any} */ const Project = require("../src/project.js");
/** @type {any} */ const fontkit = require("../vendor/fontkit/fontkit.umd.min.js");
/** @type {any} */ const Beamdswitch = require("../../../scripts/templates/beamdswitch.js");
const { parseDeck } = await import("../../../scripts/templates/beamdswitch/deck.mjs");

const folder = new URL("../", import.meta.url);
const tested = JSON.parse(execFileSync("python3", [fileURLToPath(new URL("runtime_files.py", folder)), "beamdswitch"], { encoding: "utf8" }));
const upstream = await import(tested.parser);
const font = (name) => readFileSync(new URL(`vendor/liberation-fonts/${name}`, folder));
const fonts = Fonts.set(Fonts.face(fontkit, font("LiberationSans-Regular.ttf")), Fonts.face(fontkit, font("LiberationSans-Bold.ttf")), "bundled");
const settings = Figure.settingsOf({});
const sha = (/** @type {Uint8Array | string} */ b) => createHash("sha256").update(b).digest("hex");
const e = await engine();
let files = 0;

/**
 * A table through the page's pipeline: import, profile, every candidate, the family, the two lists and their
 * highlights explained, as src/findings.js gives them to the package.
 * @param {string} name @param {Uint8Array} bytes @param {{ overrides?: any }} [o]
 */
async function table(name, bytes, o = {}) {
  const path = e.register(`${name}.csv`, bytes);
  const imported = await Profile.importFile(e.query, { kind: "csv", path, table: name, n: ++files });
  const columns = [];
  for (const [i, c] of imported.columns.filter((/** @type {any} */ x) => x.name !== imported.rowColumn).entries()) {
    columns.push(await Profile.profileColumn(e.query, { table: name, rowColumn: imported.rowColumn, column: { ...c, position: i }, override: o.overrides?.[c.name] }));
  }
  Profile.pairRoles(columns);
  const { classes, plan, ctx } = Charts.prepare({ name, rowColumn: imported.rowColumn, rows: imported.rows, sample: null, columns });
  const candidates = [];
  for (const c of plan.candidates) {
    const spec = ChartSpec.make(c, ctx);
    const r = await Charts.evaluate(e.query, spec, ctx);
    candidates.push({ ...c, kindLabel: Render.KIND_LABEL[c.kind], spec, outcome: r.outcome, reason: r.reason, desc: r.drawn?.desc ?? "", facts: r.data?.facts, pages: r.data?.page?.pages ?? 1,
      features: r.outcome === "valid" ? Rank.features(spec, r.data, r.drawn) : null, edited: false });
  }
  const fam = await Family.run(e.query, { table: name, name, run: 1, ctx, classes, columns });
  const ranked = Rank.rank(candidates, fam, { ctx, classes, highlights: 6 });
  const explain = (id) => Rank.explain(candidates.find((c) => c.id === id), ranked, fam, {});
  const counts = Grammar.accounting(candidates, 0);
  const snapshot = { name, example: name === "planted" ? "planted" : null, kind: "csv", file: { name: `${name}.csv`, bytes: bytes.length, sha256: sha(bytes) }, rows: imported.rows,
    rowColumn: imported.rowColumn, columns: columns.length, status: "complete", reason: "", sample: null, columnsKept: null, rejected: imported.rejected, notProfiled: [],
    profiled: columns.map((c) => ({ name: c.name, sourceType: c.sourceType, type: c.type, reading: c.reading.kind, share: c.share, role: c.role, unit: c.unit, yourChanges: c.overridden })),
    charts: { grammar: Grammar.VERSION, status: "complete", reason: "", fields: plan.counts, formula: plan.formula.text, expected: plan.formula.total, ...counts },
    findings: { status: fam.status } };
  const lists = { unusual: { charts: ranked.unusual.length, highlighted: ranked.highlights.unusual.map(explain), fewer: ranked.fewer.unusual },
    supported: { charts: ranked.supported.length, highlighted: ranked.highlights.supported.map(explain), fewer: ranked.fewer.supported } };
  return { name, ctx, candidates, snapshot, overflow: plan.overflow, findings: { family: { name, m: fam.m }, lists }, additive: [],
    lists: { unusual: ranked.unusual.map((id) => ({ id, cluster: ranked.entries.get(id).cluster })), supported: ranked.supported.map((id) => ({ id })) },
    hypotheses: fam.members.map((/** @type {any} */ m) => ({ id: m.id, p: m.p ?? undefined, adjusted: m.adjusted ?? undefined, seed: m.result?.seed })),
    validated: { checked: counts.valid, invalid: candidates.filter((c) => c.outcome === "valid" && !ChartSpec.validate(c.spec, ctx).ok).map((c) => c.id) } };
}

/** Every SVG figure file of the tables, as src/exporter.js writes them with the publication preset. */
async function figures(tables) {
  const out = [];
  for (const job of Package.jobs(tables, ["svg"])) {
    const data = await Charts.compute(e.query, job.spec, tables.find((t) => t.name === job.table).ctx);
    const spec = Figure.sized(job.spec, settings);
    const drawn = Render.render(spec, data, Figure.styleOf(settings, { family: fonts.family, measure: fonts.measure }));
    const text = await Fonts.svgFile(drawn.svg, drawn.scene, fonts);
    const result = Figure.check({ ...drawn, spec }, { spec, settings, font: { name: fonts.name, kind: "bundled", bold: true, missing: fonts.missing }, files: { svg: Fonts.readSvg(text, fontkit) } });
    out.push({ table: job.table, id: job.id, page: job.page, format: "svg", path: job.paths.svg, text, bytes: Buffer.byteLength(text), sha256: sha(text), verdict: result.files.svg.verdict });
  }
  return out;
}

/** The package of tables, written as the page writes it, and its zip. */
async function packageOf(tables, written) {
  const saved = "2026-10-06T08:00:00.000Z";
  const svgs = new Map(written.filter((f) => f.page === 1).map((f) => [`${f.table}\u0000${f.id}`, f.text]));
  const project = Project.make({ saved, build: "0".repeat(64), versions: { grammar: Grammar.VERSION, catalogue: Family.CATALOGUE }, highlights: 6, publication: settings, formats: ["svg"], sources: false,
    tables: tables.map((t) => ({ name: t.name, source: { file: t.snapshot.file.name, kind: "csv", bytes: t.snapshot.file.bytes, sha256: t.snapshot.file.sha256, example: t.snapshot.example, included: null },
      import: { choice: "full", sample: null, columns: null, fileRows: t.snapshot.rows }, overrides: {}, dismissed: [], additive: [], study: null, edits: [],
      figures: Object.fromEntries(written.filter((f) => f.table === t.name).map((f) => [f.path, f.sha256])),
      results: Object.fromEntries(t.hypotheses.filter((x) => x.p !== undefined).map((x) => [x.id, [x.p ?? null, x.adjusted ?? null]])) })) });
  const run = { saved, build: { page_sha256: "0".repeat(64) }, browser: "node", engine: { duckdb: "v1.5.4", duckdbWasm: "1.33.1-dev57.0", budget: "2.0 GiB" },
    versions: { grammar: Grammar.VERSION, specification: ChartSpec.SPEC_VERSION, catalogue: Family.CATALOGUE }, publication: { preset: "General", journal: null, dpi: 300, font: fonts.name },
    formats: ["svg"], sources: false, beamdswitch: { commit: tested.commit }, pieces: [{ title: "SQL and table algebra" }], step: 5, highlights: 6,
    methods: ["Charts: grammar v1."], operations: {}, describe: (x, spec) => Rank.transformText(x, spec), tables, figures: written, failures: [], seeds: [], log: [], project };
  const out = Package.files(run, svgs, Beamdswitch);
  const entries = [...out.files.map((f) => ({ path: f.path, data: new TextEncoder().encode(f.data) })), ...written.map((f) => ({ path: f.path, data: new TextEncoder().encode(f.text) }))];
  const listed = entries.map((x) => ({ path: x.path, bytes: x.data.length, sha256: sha(x.data) }));
  entries.push({ path: "manifest.json", data: Package.manifest(run, out.done, listed) });
  const zip = await Zip.write(entries, { date: new Date(saved) });
  return { run, out, zip: new Uint8Array(await new Blob(zip.parts).arrayBuffer()) };
}

// Every table the tests share is made before the first test starts: the engine runs one query at a time.
const plantedBytes = new TextEncoder().encode(Examples.planted());
const planted = await table("planted", plantedBytes);
const written = await figures([planted]);
const pkg = await packageOf([planted], written);
const dir = mkdtempSync(join(tmpdir(), "dw-export-"));
writeFileSync(join(dir, "package.zip"), pkg.zip);
const reader = await Zip.open(new Blob([pkg.zip]));
// The same project made again from the same bytes, as a reopened table is: the table dropped and imported again.
await e.query("DROP TABLE planted");
const again = await table("planted", plantedBytes);
const againWritten = await figures([again]);

test("the zip: deflated and stored entries, a Blob stored as it is, ZIP64 when asked; Python's zipfile reads each", async () => {
  for (const zip64 of [false, true]) {
    const big = new Uint8Array(randomBytes(70000));
    const z = await Zip.write([{ path: "a.txt", data: "the same line again\n".repeat(500) }, { path: "dir/é.bin", data: big }, { path: "s.csv", data: new Blob(["x,y\n1,2\n"]) }], { zip64, date: new Date(2026, 9, 6) });
    const bytes = new Uint8Array(await new Blob(z.parts).arrayBuffer());
    assert.equal(bytes.length, z.bytes);
    const file = join(dir, `t${zip64}.zip`);
    writeFileSync(file, bytes);
    const py = JSON.parse(execFileSync("python3", ["-c", "import zipfile,sys,json,hashlib;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps([z.testzip(),[(i.filename,i.file_size,i.compress_type,hashlib.sha256(z.read(i)).hexdigest()) for i in z.infolist()]]))", file], { encoding: "utf8" }));
    assert.equal(py[0], null, "every CRC checks");
    assert.deepEqual(py[1].map((/** @type {any} */ x) => x.slice(0, 3)), [["a.txt", 10000, 8], ["dir/é.bin", 70000, 0], ["s.csv", 8, 0]], "text deflated; bytes that do not shrink and a Blob stored");
    assert.equal(py[1][1][3], sha(big));
    const r = await Zip.open(new Blob([bytes]));
    assert.equal((await r.text("a.txt")).length, 10000);
    assert.deepEqual(await r.bytes("dir/é.bin"), big);
    assert.equal(await (await r.blob("s.csv")).text(), "x,y\n1,2\n");
  }
  await assert.rejects(Zip.write([{ path: "a", data: "x" }, { path: "a", data: "y" }]), /names a twice/);
  await assert.rejects(Zip.write([{ path: "a", data: "x" }], { stopped: () => true }), { name: "AbortError" });
  await assert.rejects(Zip.open(new Blob(["not a zip at all"])), /not a zip/);
});

test("the package holds every valid figure, every page of each timeline, and a manifest whose hashes hold", async () => {
  const valid = planted.candidates.filter((c) => c.outcome === "valid");
  assert.equal(valid.length, 155);
  const timeline = valid.find((c) => c.kind === "point-timeline");
  assert.equal(timeline.pages, 4, "2,000 events: 4 pages of 500");
  for (let p = 1; p <= 4; p++) assert.ok(reader.has(`figures/planted/${timeline.id}.p${p}.svg`), `timeline page ${p}`);
  assert.equal(reader.paths.filter((p) => p.startsWith("figures/")).length, 155 + 3);
  for (const c of valid) assert.ok(reader.paths.some((p) => p.startsWith(`figures/planted/${c.id}.`)), c.id);
  const py = JSON.parse(execFileSync("python3", ["-c", "import zipfile,sys,json,hashlib;z=zipfile.ZipFile(sys.argv[1]);m=json.loads(z.read('manifest.json'));print(json.dumps([z.testzip(),sorted(z.namelist()),[[f['path'],f['bytes'],f['sha256']] for f in m['files']],{p:[len(z.read(p)),hashlib.sha256(z.read(p)).hexdigest()] for p in z.namelist()}]))", join(dir, "package.zip")], { encoding: "utf8", maxBuffer: 2 ** 26 }));
  assert.equal(py[0], null);
  assert.deepEqual(py[1], [...["report.md", "highlights.json", "specs/planted.json", "transforms.json", "stats.json", "validation.json", "deck.md", "project.json", "manifest.json"], ...written.map((f) => f.path)].sort());
  for (const [path, bytes, hash] of py[2]) assert.deepEqual(py[3][path], [bytes, hash], `${path}: the manifest's size and SHA-256`);
  assert.equal(py[2].length, py[1].length - 1, "every file but the manifest is listed");
  const m = JSON.parse(await reader.text("manifest.json"));
  assert.equal(m.status, "complete");
  assert.deepEqual(m.remaining, []);
  assert.deepEqual(m.sources, [{ table: "planted", file: "planted.csv", bytes: plantedBytes.length, sha256: sha(plantedBytes), example: "planted", included: null }]);
  assert.equal(m.beamdswitch.commit, tested.commit);
  assert.deepEqual(m.versions, { grammar: "1", specification: "1", catalogue: Family.CATALOGUE });
  // A figure file is SVG with its font inside: a subset that maps every character it shows.
  for (const f of written) {
    const svg = Fonts.readSvg(f.text, fontkit);
    assert.ok(svg.fontFaces > 0 && !svg.unmapped.length, `${f.path}: ${svg.fontFaces} fonts, unmapped ${svg.unmapped.join("")}`);
  }
  assert.ok(Math.max(...written.map((f) => f.bytes)) < 400_000, "no figure holds a whole 400 KB font");
});

test("report.md links only to files in the package; every specification validates; stats and highlights hold the family", async () => {
  const report = await reader.text("report.md");
  const links = [...report.matchAll(/\]\((figures\/[^)]+)\)/g)].map((x) => x[1]);
  assert.ok(links.length >= 155);
  for (const l of links) assert.ok(reader.has(l), l);
  assert.match(report, /\*\*Status: complete\.\*\*/);
  assert.match(report, /### Unusual patterns: 6 distinct highlights/);
  const specs = JSON.parse(await reader.text("specs/planted.json"));
  assert.equal(specs.candidates.length, 155);
  for (const c of specs.candidates) assert.deepEqual(ChartSpec.validate(c.spec, planted.ctx), { ok: true, errors: [] }, c.id);
  const stats = JSON.parse(await reader.text("stats.json"));
  assert.equal(stats.tables[0].hypotheses.length, planted.hypotheses.length);
  const hl = JSON.parse(await reader.text("highlights.json"));
  assert.equal(hl.tables[0].unusual.highlighted.length, 6);
  assert.ok(hl.tables[0].unusual.highlighted.every((/** @type {any} */ x) => x.files.length && x.observed.length && x.why.length));
  const transforms = JSON.parse(await reader.text("transforms.json"));
  assert.equal(transforms.tables[0].chartTransforms.length, 155);
});

test("deck.md opens in beamdswitch's parser, vendored and upstream at the tested commit, with each highlighted figure as a base64 SVG", async () => {
  const text = await reader.text("deck.md");
  for (const parse of [parseDeck, upstream.parseDeck]) {
    const deck = parse(text);
    assert.equal(deck.meta.voice, "bf_emma");
    assert.deepEqual(deck.frames.filter((/** @type {any} */ f) => f.kind === "section").map((/** @type {any} */ f) => f.title), ["Set-up", "Method", "Results", "Checks and takeaway"]);
    const images = deck.frames.filter((/** @type {any} */ f) => f.children.some((/** @type {any} */ c) => /!\[[^\]]*\]\(data:image\/svg\+xml;base64,/.test(c.text ?? "")));
    const ids = new Set([...pkg.run.tables[0].findings.lists.unusual.highlighted, ...pkg.run.tables[0].findings.lists.supported.highlighted].map((x) => x.id));
    assert.equal(images.length, ids.size, "one frame a distinct highlighted figure");
    for (const f of images) {
      assert.ok(f.narration && !/[$\\`*_#|<>]/.test(f.narration), `${f.title}: narrated in plain words`);
      assert.ok(f.notes.length > 0, `${f.title}: observations in the notes`);
      const body = f.children.map((/** @type {any} */ c) => c.text).join("\n");
      assert.match(body, /\$\$.*U = .*\$\$/, `${f.title}: statistics in LaTeX`);
      const b64 = /base64,([A-Za-z0-9+/=]+)\)/.exec(body)?.[1] ?? "";
      const svg = Buffer.from(b64, "base64").toString("utf8");
      assert.ok(written.some((w) => w.text === svg), `${f.title}: the image is the package's SVG file`);
    }
  }
});

test("completion: charts or statistics that did not finish, and figures not written, make the package incomplete with what remains", () => {
  const t = { ...planted, snapshot: { ...planted.snapshot, charts: { ...planted.snapshot.charts, status: "incomplete", reason: "you cancelled", incomplete: 12 }, findings: { status: "none" } }, findings: null };
  const done = Package.completion({ tables: [t], failures: [{ path: "figures/planted/x.png", error: "too many pixels" }] });
  assert.equal(done.status, "incomplete");
  assert.match(done.remaining.join("\n"), /charts are incomplete \(you cancelled\): 12 candidates have no figure yet/);
  assert.match(done.remaining.join("\n"), /statistics have not run/);
  assert.match(done.remaining.join("\n"), /1 figure file could not be written: figures\/planted\/x\.png \(too many pixels\)/);
});

test("a saved project made again from the same bytes reproduces every SVG figure and test result; a changed file is refused", async () => {
  const doc = Project.parse(await reader.text("project.json"));
  const saved = doc.tables[0];
  assert.equal(Object.keys(saved.figures).length, 158);
  const figuresAgain = Object.fromEntries(againWritten.map((f) => [f.path, f.sha256]));
  const results = Object.fromEntries(again.hypotheses.filter((x) => x.p !== undefined).map((x) => [x.id, [x.p ?? null, x.adjusted ?? null]]));
  const c = Project.compare(saved, figuresAgain, results);
  assert.equal(c.figures.same, 158, JSON.stringify(c.figures.differ.slice(0, 3)));
  assert.equal(c.results.same, c.results.saved);
  assert.ok(c.reproduced);
  assert.equal(Project.check(saved.source, { bytes: plantedBytes.length, sha256: sha(plantedBytes) }).ok, true);
  const changed = Project.check(saved.source, { bytes: plantedBytes.length, sha256: sha(new TextEncoder().encode(Examples.planted(1))) });
  assert.equal(changed.ok, false);
  assert.match(changed.text, /differs from the file the project was made from/);
  assert.throws(() => Project.parse('{"format":"something else"}'), /not a project/);
  assert.throws(() => Project.parse(JSON.stringify({ ...doc, version: 9 })), /format version 9/);
});
