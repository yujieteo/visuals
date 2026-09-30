import test from "node:test";
import assert from "node:assert/strict";
import { L, FIXTURES, RAW, clone, compute } from "./helpers.mjs";

const R = L.report;
const reportOf = (model) => { const r = compute(model); return { r, rep: L.buildReport(r) }; };

test("Markdown has the notice, readable tables and a YAML block that imports back to the same model", () => {
  for (const p of RAW.presets) {
    const { r, rep } = reportOf(p.model);
    const md = R.markdown(rep, r.model);
    assert.match(md, /^# /);
    assert.match(md, /Verify independently/);
    assert.match(md, /\| Area +\| A +\| +[\d.e−]+ \| mm² +\|/);
    assert.match(md, /## Plastic bending/);
    assert.match(md, /```yaml\nsectionlab: 1\n/);
    assert.deepEqual(L.section.normalize(R.modelFromText(md)), r.model, p.id);
  }
});

test("Markdown table cells escape pipes and keep one line per row", () => {
  const m = clone(FIXTURES.cases.find((c) => c.id === "rect").model);
  m.title = "A | B";
  m.parts[0].name = "left | right\npart";
  const { r, rep } = reportOf(m);
  const md = R.markdown(rep, r.model);
  assert.ok(md.includes("left \\| right part"));
  assert.equal(L.section.normalize(R.modelFromText(md)).parts[0].name, "left | right\npart");
});

test("import reads plain YAML, the model block among several, and refuses ambiguous files", () => {
  const m = FIXTURES.cases.find((c) => c.id === "circle").model;
  const y = L.yaml.stringify(m);
  assert.deepEqual(R.modelFromText(y), m);
  assert.deepEqual(R.modelFromText(`# Notes\n\n\`\`\`yaml\nfoo: 1\n\`\`\`\n\n\`\`\`yaml\n${y}\`\`\`\n`), m);
  assert.throws(() => R.modelFromText(`# Notes\n\n\`\`\`yaml\n${y}\`\`\`\n\`\`\`yaml\n${y}\`\`\`\n`), /several YAML blocks/);
  assert.throws(() => R.modelFromText("# Notes\n\n```js\nx\n```\n"), /no ```yaml block/);
});

function checkPdf(pdf) {
  assert.ok(pdf.startsWith("%PDF-1.4\n"));
  assert.ok(pdf.endsWith("%%EOF\n"));
  const body = pdf.slice(pdf.indexOf("\n", 10) + 1);
  assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(body), "everything after the binary comment is ASCII");
  const startxref = +/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)[1];
  assert.ok(pdf.slice(startxref).startsWith("xref\n"));
  const [, first, count] = /^xref\n(\d+) (\d+)\n/.exec(pdf.slice(startxref));
  assert.equal(+first, 0);
  const rows = pdf.slice(startxref).split("\n").slice(2, 2 + +count);
  rows.slice(1).forEach((row, i) => {
    const off = +row.slice(0, 10);
    assert.ok(pdf.slice(off).startsWith(`${i + 1} 0 obj\n`), `object ${i + 1} offset`);
  });
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(pdf.slice(start + +m[1], start + +m[1] + 10), "\nendstream", "stream length");
  }
  assert.doesNotMatch(pdf, /FontFile/, "fonts are not embedded");
  assert.match(pdf, /\/BaseFont \/Helvetica /);
  return +/\/Count (\d+)/.exec(pdf)[1];
}

test("the PDF is a valid PDF 1.4 file with standard fonts and correct cross-references", () => {
  for (const p of RAW.presets) {
    const { rep } = reportOf(p.model);
    const pdf = R.pdf(rep);
    const pages = checkPdf(pdf);
    assert.ok(pages >= 1 && pages <= 4, `${p.id}: ${pages} pages`);
    assert.match(pdf, /\(Verify independently\./);
    assert.match(pdf, /\(Section properties\) Tj/);
  }
});

test("PDF text is reduced to ASCII and escaped", () => {
  const m = clone(FIXTURES.cases.find((c) => c.id === "rect").model);
  m.title = "Beam (σ ≥ 2) \\ test";
  const pdf = R.pdf(reportOf(m).rep);
  checkPdf(pdf);
  assert.ok(pdf.includes("(Beam \\(sigma >= 2\\) \\\\ test) Tj"));
});

test("SVG figures carry the plot geometry and escape the title", () => {
  const m = clone(FIXTURES.cases.find((c) => c.id === "tee-hole").model);
  m.title = "<b>&</b>";
  const { rep } = reportOf(m);
  const sec = R.sectionSvg(rep), cur = R.curveSvg(rep);
  for (const s of [sec, cur]) {
    assert.match(s, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.ok(!s.includes("<b>"), "title escaped");
    assert.equal((s.match(/<svg/g) || []).length, (s.match(/<\/svg>/g) || []).length);
  }
  const plot = JSON.parse(/data-plot='([^']+)'/.exec(cur)[1]);
  assert.ok(plot.kmax > 0 && plot.mmax > 0 && plot.width > 0);
  assert.ok(R.html(rep).includes("&lt;b&gt;&amp;&lt;/b&gt;"));
});

test("a report without a curve still renders every export", () => {
  const m = clone(FIXTURES.cases.find((c) => c.id === "rect").model);
  m.plastic.N = 1e9;
  const { r, rep } = reportOf(m);
  assert.ok(r.plastic.error);
  assert.match(R.markdown(rep, r.model), /\| Why +\| The axial force alone/);
  checkPdf(R.pdf(rep));
  assert.match(R.curveSvg(rep), /^<svg/);
});

test("number formatting", () => {
  assert.equal(R.fmt(0), "0");
  assert.equal(R.fmt(1234.5678), "1234.57");
  assert.equal(R.fmt(-0.5), "−0.5");
  assert.equal(R.fmt(2.5e7), "2.5e7");
  assert.equal(R.fmt(-3.2e-5), "−3.2e−5");
  assert.equal(R.fmt(null), "n/a");
  assert.equal(R.fmt(NaN), "n/a");
});
