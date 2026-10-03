// The page as a file: the shared theme script first, no external resources, its read-only WebMCP tools run on a stub,
// a static record of every argument and source for no-JavaScript readers and print, view checks that reset
// stale values with a notice, and reader text that follows the ASD-STE100 rules a script can check.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const R = require("../report.js");
const D = require("../raw.json");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const visual = JSON.parse(readFileSync(new URL("../visual.json", import.meta.url), "utf8"));

test("the site-theme script comes first and the page loads nothing from outside its folder", () => {
  const theme = html.indexOf('<script id="site-theme">');
  assert.ok(theme > 0 && theme < html.indexOf("<style"));
  for (const m of html.matchAll(/\s(?:src|srcset)=["']([^"']+)["']/g)) assert.doesNotMatch(m[1], /^(https?:)?\/\//, m[1]);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/);
  assert.doesNotMatch(html, /@import|url\(\s*["']?https?:/);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie.org\/visuals\/stealth-rcs\/">/);
  assert.match(html, /<a href="\.\.\/\.\.\/visuals\.html">Visuals<\/a>/);
});

// Run the page's WebMCP block against a stub modelContext and return the tools it registers.
function webmcpTools() {
  const app = /<script id="app">([\s\S]*?)<\/script>/.exec(html)[1];
  const block = app.slice(app.indexOf("/* ===== WEBMCP"), app.indexOf("/* ===== INITIALIZATION"));
  const registered = {};
  const view = { ...R.defaults(D), sample: { figure: "fig-5-11", role: "original", index: 3 } };
  vm.runInNewContext(`const R = Rpt, I = R.index(D), DS = D.datasets[0];\n${block}`,
    { Rpt: R, D, view, location: { href: "https://example.test/#s=fig-5-11:original:3" }, document: { modelContext: { registerTool: (t) => (registered[t.name] = t) } }, navigator: {} });
  return registered;
}
const run = async (tool, input) => JSON.parse((await tool.execute(input)).content[0].text);

test("the page registers exactly the WebMCP tools that visual.json names, each read-only", async () => {
  const tools = webmcpTools();
  assert.deepEqual(Object.keys(tools).sort(), [...visual.webmcp_tools].sort());
  for (const tool of Object.values(tools)) assert.equal(tool.annotations.readOnlyHint, true, tool.name);
  const listed = await run(tools.list_claims, { aircraft: "F35" });
  assert.deepEqual(listed.claims.map((c) => c.id), ["F35-1", "F35-2"]);
  const claim = await run(tools.get_claim, { id: "B2-2" });
  for (const k of R.TOULMIN) assert.equal(claim[k], D.claims.find((c) => c.id === "B2-2")[k]);
  const series = await run(tools.get_series, { figure: "fig-5-10", role: "reconstructed", from: 179, to: 181 });
  assert.ok(series.segments.flat().length > 0 && series.segments.flat().every(([x]) => x >= 179 && x <= 181));
  assert.equal(series.reference, "Reference not stated");
  const v = await run(tools.get_view, {});
  assert.deepEqual(v.selected_sample.sample, R.ordered(R.seriesFor(D, "fig-5-11", "original"))[3]);
});

const sampleAt = (figure, role, x) => ({ figure, role, index: R.ordered(R.seriesFor(D, figure, role)).findIndex((p) => p[0] === x) });

test("view checks keep valid values and reset stale ones with a notice", () => {
  const ok = R.normalizeView(D, { aircraft: "F35", claim: "F35-2", zoom: [176, 178], traces: ["reconstructed"], sample: sampleAt("fig-5-11", "reconstructed", 176.01) });
  assert.deepEqual(ok.notices, []);
  assert.equal(ok.view.aircraft, "F35");
  assert.deepEqual(ok.view.zoom, [176, 178]);
  assert.equal(R.selectedSample(D, ok.view).sample[0], 176.01);
  const stale = R.normalizeView(D, { aircraft: "SR71", frequency: "fig-9-99", zoom: [100, 200], traces: ["phase"], sample: { figure: "fig-5-11", role: "reconstructed", index: 9999 }, dataset_version: "2026-01-01.1" });
  assert.equal(stale.view.aircraft, "all");
  assert.equal(stale.view.frequency, "fig-5-11");
  assert.deepEqual(stale.view.zoom, [175, 185]);
  assert.deepEqual(stale.view.traces, ["original", "reconstructed"]);
  assert.equal(stale.view.sample, null, "a sample that is not in the series is never selected");
  assert.equal(stale.notices.length, 6);
  // An old link that names the sample by x, an empty index and a fraction are cleared.
  for (const sample of [{ figure: "fig-5-11", role: "original", x: 178.2 }, { figure: "fig-5-11", role: "original", index: "" }, { figure: "fig-5-11", role: "original", index: "1.5" }])
    assert.equal(R.normalizeView(D, { sample }).view.sample, null, JSON.stringify(sample));
  // A sample on a hidden trace is cleared.
  assert.equal(R.normalizeView(D, { traces: ["original"], sample: sampleAt("fig-5-11", "reconstructed", 176.01) }).view.sample, null);
  // Condition comparison needs a second, different frequency.
  const cmp = R.normalizeView(D, { compare: "condition", compare_frequency: "fig-5-11" });
  assert.notEqual(cmp.view.compare_frequency, "fig-5-11");
});

test("every sample of every trace has its own identity, also where 2 dots share one azimuth", () => {
  for (const s of D.series) {
    const pts = R.ordered(s);
    assert.equal(pts.length, R.samplesOf(s).length);
    const seen = new Set();
    pts.forEach((p, index) => {
      // The identity survives the URL and the JSON view, as a string or a number.
      for (const raw of [index, String(index)]) {
        const { view, notices } = R.normalizeView(D, { frequency: s.figure_id, sample: { figure: s.figure_id, role: s.trace_role, index: raw } });
        assert.deepEqual(notices, [], `${s.id} ${index}`);
        const sel = R.selectedSample(D, view);
        assert.equal(sel.sample, p, `${s.id} ${index}`);
        assert.equal(sel.index, index);
      }
      seen.add(p);
    });
    assert.equal(seen.size, pts.length, s.id);
    for (let i = 1; i < pts.length; i++) assert.ok(pts[i - 1][0] <= pts[i][0], `${s.id}: ordered by azimuth`);
  }
  assert.ok(D.series.some((s) => new Set(R.samplesOf(s).map((p) => p[0])).size < R.samplesOf(s).length), "the data has dots that share one azimuth");
});

test("display rounding does not claim precision that the figure does not support", () => {
  assert.equal(R.db(-24.26), "−24.5");
  assert.equal(R.db(-24.2), "−24.0");
  assert.equal(R.deg(179.85), "179.85");
});

// ASD-STE100 rules that a script can check, on the reader text the page writes itself. Quotations,
// source titles, the specification's argument texts and stated conditions are exempt.
test("reader text: no contractions, no semicolons, no -ing verbs from a stop list, sentences of 25 words or fewer", () => {
  const texts = [D.purpose, ...D.scope_notes, ...D.evidence_types.map((t) => t.rule), ...D.results.map((r) => r.rule), D.search_limit,
    ...Object.values(D.no_curve_reasons), ...D.aircraft.flatMap((a) => [a.summary, a.variant_reason || "", ...a.design_features.map((f) => f.evidence_limit)]),
    ...D.claims.flatMap((c) => [c.assessed_scope, c.do_not_infer, c.conditions_not_stated]),
    ...D.images.map((i) => i.alt), ...D.other_numerical_evidence.map((n) => n.conditions_status),
    ...[...html.matchAll(/<p class="(?:note|lede)"[^>]*>([^<]+)</g)].map((m) => m[1])];
  const ING = /\b(using|showing|missing|having|being|getting|making|including|allowing|giving|following|according)\b/i;
  for (const t of texts.filter(Boolean)) {
    assert.doesNotMatch(t, /\b\w+n't\b|\b(it's|that's|there's|isn't|don't)\b/i, t);
    assert.doesNotMatch(t, /;/, t);
    assert.doesNotMatch(t, ING, t);
    for (const sentence of t.split(/(?<=[.!?])\s+/)) assert.ok(sentence.split(/\s+/).length <= 25, `over 25 words: ${sentence}`);
  }
});
