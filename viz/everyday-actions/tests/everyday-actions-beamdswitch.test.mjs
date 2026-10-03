import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const require = createRequire(import.meta.url);
const T = require("../beamdswitch.js");
const R = require("../report.js");
const html = read("index.html");
const DATA = JSON.parse(/<script type="application\/json" id="dataset">([\s\S]*?)<\/script>/.exec(html)[1]);

// Every pair of axes the page offers, every ATUS population, partial matches shown and hidden, with
// and without a selected activity, plus decision filters and a selected decision.
const VIEWS = R.X_KEYS.flatMap((x) => R.Y_KEYS.flatMap((y) => Object.keys(R.POPS).flatMap((pop) => [true, false].map((partial) =>
  ({ x, y, pop, partial, sel: DATA.activities[(x.length + y.length + pop.length) % DATA.activities.length].activity_id })))));
VIEWS.push(...R.TIERS.map((tier) => ({ tier, decision: DATA.decisions.find((d) => d.frequency_tier === tier).id })),
  ...[...new Set(DATA.decisions.map((d) => d.domain))].map((domain) => ({ domain, sel: "commuting" })));
const deckFor = (view) => T.deck(R.report(DATA, view));
const what = (v) => JSON.stringify(v);

test("the site's shared beamdswitch template is the copy the everyday-actions page inlines", () => {
  assertTemplateCopy("everyday-actions");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "everyday-actions");
  assertInlined(html, "report", read("report.js"), "everyday-actions");
});

test("the beamdswitch button saves, and Copy deck copies, the deck of the charts as set", async () => {
  const sel = DATA.activities[0].activity_id, tier = R.TIERS[0];
  const page = await openPage("everyday-actions", { search: `?pop=weekend&sel=${sel}` });
  await page.change("regret-tier", tier);
  await assertButtonsExport(page, "everyday-actions", deckFor({ x: "drm_proportion_reporting", y: "drm_positive_affect", pop: "weekend", partial: true, sel, tier, domain: "", decision: null }));
});

test("every view's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const v of VIEWS) assertStandardDeck(deckFor(v), what(v));
});

test("the plotted values in the deck are the published measurements, formatted as the page's table view", () => {
  let plotted = 0;
  for (const v of VIEWS) {
    const view = { x: "drm_proportion_reporting", y: "drm_positive_affect", pop: "all", partial: true, ...v };
    const md = deckFor(v), X = R.AXES[view.x], Y = R.AXES[view.y];
    const pts = view.x === view.y ? [] : R.points(DATA, view);
    if (pts.length < R.MIN_POINTS) { assert.ok(md.includes(view.x === view.y ? "## Choose two different measures" : `## Only ${pts.length} activities have both measures`), what(v)); continue; }
    plotted++;
    for (const p of pts) {
      // Each coordinate is the value of its source measurement record, not a recomputation.
      const mx = DATA.measurements.find((m) => m.id === R.measId(view.x, p.a.activity_id, view.pop));
      const my = DATA.measurements.find((m) => m.id === R.measId(view.y, p.a.activity_id, view.pop));
      assert.ok(mx && my, `${what(v)}: ${p.a.activity} has source records`);
      assert.ok(md.includes(`| ${p.a.activity.replace(/[\\$*_`|<>[\]]/g, "\\$&")} | ${X.fmt(mx.value)} | ${Y.fmt(my.value)} |`), `${what(v)}: ${p.a.activity}`);
    }
    const ys = pts.map((p) => p.y), xs = pts.map((p) => p.x);
    assert.ok(md.includes(`## Medians split the chart: ${X.short} ${X.fmt(R.median(xs))}, ${Y.short} ${Y.fmt(R.median(ys))}`), what(v));
    assert.ok(md.includes(`## Every plotted number has a source record: ${pts.length} of ${pts.length} points`), what(v));
    const sel = pts.find((p) => p.a.activity_id === view.sel);
    if (sel) assert.ok(md.includes(`## ${sel.a.activity}: ${X.short} ${X.fmt(sel.x)}, ${Y.short} ${Y.fmt(sel.y)}`), what(v));
  }
  assert.ok(plotted > 50, "most views are plotted");
});

test("the regret frontier counts are the authored codes, labelled as codes", () => {
  for (const v of VIEWS) {
    const md = deckFor(v);
    const ds = DATA.decisions.filter((d) => (!v.tier || d.frequency_tier === v.tier) && (!v.domain || d.domain === v.domain));
    const cheap = ds.filter((d) => d.reversibility >= 4 && d.time_sensitivity >= 4).length;
    assert.ok(md.includes(`## A regret frontier: ${ds.length} action${ds.length === 1 ? "" : "s"}, ${cheap} both reversible and time-limited`), what(v));
    assert.ok(md.includes("**These positions are authored codes on 1–5 scales, not measurements.**"), what(v));
    const d = DATA.decisions.find((x) => x.id === v.decision);
    if (d) assert.ok(md.includes(`- Reversibility ${d.reversibility} · time sensitivity ${d.time_sensitivity} · downside ${d.downside} · upside ${d.upside} · information ${d.information} (1–5).`), what(v));
  }
});
