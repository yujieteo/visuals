// The page as a file: the shared theme script first, no external resources, every WebMCP tool declared,
// a static record of every argument and source for no-JavaScript readers and print, view checks that reset
// stale values with a notice, and reader text that follows the ASD-STE100 rules a script can check.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

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

test("the page registers exactly the WebMCP tools that visual.json names", () => {
  const registered = [...html.matchAll(/registerTool\(\{\s*name:\s*"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(registered.sort(), [...visual.webmcp_tools].sort());
  assert.ok(registered.length >= 3);
  assert.equal(html.match(/readOnlyHint: true/g).length, 1, "one shared read-only annotation");
});

test("without JavaScript the static record shows every argument, qualifier and source", () => {
  const m = /<!-- static-record -->([\s\S]*?)<!-- \/static-record -->/.exec(html);
  assert.ok(m);
  const text = m[1].replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  for (const c of D.claims) for (const k of R.TOULMIN) assert.ok(text.includes(c[k]), `${c.id} ${k}`);
  for (const s of D.sources) assert.ok(text.includes(s.url), s.id);
  assert.match(html, /<noscript>/);
  assert.match(html, /\.js \.static-record \{ display: none; \}/);
  assert.match(html, /@media print[\s\S]*\.js \.static-record \{ display: block; \}/);
});

test("view checks keep valid values and reset stale ones with a notice", () => {
  const ok = R.normalizeView(D, { aircraft: "F35", claim: "F35-2", zoom: [176, 178], traces: ["reconstructed"], sample: { figure: "fig-5-11", role: "reconstructed", x: 176.01 } });
  assert.deepEqual(ok.notices, []);
  assert.equal(ok.view.aircraft, "F35");
  assert.deepEqual(ok.view.zoom, [176, 178]);
  assert.equal(ok.view.sample.x, 176.01);
  const stale = R.normalizeView(D, { aircraft: "SR71", frequency: "fig-9-99", zoom: [100, 200], traces: ["phase"], sample: { figure: "fig-5-11", role: "reconstructed", x: 176.015 }, dataset_version: "2026-01-01.1" });
  assert.equal(stale.view.aircraft, "all");
  assert.equal(stale.view.frequency, "fig-5-11");
  assert.deepEqual(stale.view.zoom, [175, 185]);
  assert.deepEqual(stale.view.traces, ["original", "reconstructed"]);
  assert.equal(stale.view.sample, null, "a value between samples is never selected");
  assert.equal(stale.notices.length, 6);
  // A sample on a hidden trace is cleared.
  assert.equal(R.normalizeView(D, { traces: ["original"], sample: { figure: "fig-5-11", role: "reconstructed", x: 176.01 } }).view.sample, null);
  // Condition comparison needs a second, different frequency.
  const cmp = R.normalizeView(D, { compare: "condition", compare_frequency: "fig-5-11" });
  assert.notEqual(cmp.view.compare_frequency, "fig-5-11");
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
