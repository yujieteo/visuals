import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { assertBlockedSave, assertStandardDeck, load, openPage, read } from "./finance-beamdswitch-checks.mjs";

const slug = "marvell";
// The shared scripts/templates/stock-cases-report.js (listed in uses in visual.json) as the page inlines it, type-stripped by scripts/page_parts.py.
const REPORT = execFileSync("python3", ["-c", "import sys; from page_parts import strip_types; sys.stdout.buffer.write(strip_types(open('templates/stock-cases-report.js', encoding='utf-8').read()).encode())"],
  { cwd: new URL("../../../scripts/", import.meta.url), encoding: "utf8" });
const METRICS = ["revenue", "cash_margin"];
const { Beamdswitch, StockReport } = load(read("beamdswitch.js"), REPORT);
const caseOf = (html) => JSON.parse(/,CASE=(\{.*?\}),svg=/.exec(html)[1]);

// The newest annual 10-K or 20-F fact for each fiscal-year end, recounted from the SEC source.
function annual(raw, tag) {
  const out = new Map();
  for (const f of raw.facts["us-gaap"][tag].units.USD)
    if (f.fp === "FY" && ["10-K", "20-F"].includes(f.form) && f.start && (!out.has(f.end) || f.filed > out.get(f.end).filed)) out.set(f.end, f);
  return out;
}

const html = read(`index.html`), C = caseOf(html);

test(`${slug}: each measure's deck parses in beamdswitch as the standard template, narrated on every slide`, () => {
  for (const metric of METRICS) {
    const deck = assertStandardDeck(Beamdswitch.deck(StockReport.report(C, { metric })), `${slug} ${metric}`);
    assert.equal(deck.meta.title, C.title);
    // The selected measure leads the results.
    const first = deck.frames.find((f) => f.section === "Results" && f.kind === "frame");
    assert.ok(first.title.startsWith(StockReport.METRICS[metric].label), `${slug} ${metric}: ${first.title}`);
  }
});

test(`${slug}: the deck's figures are the SEC filings', in the page's digits`, () => {
  const raw = JSON.parse(read(`raw.json`));
  const revenue = annual(raw, "RevenueFromContractWithCustomerExcludingAssessedTax"), cash = annual(raw, "NetCashProvidedByUsedInOperatingActivities");
  const ends = [...revenue.keys()].filter((e) => cash.has(e)).sort().slice(-4);
  assert.deepEqual(C.rows.map((r) => r.end), ends);
  const md = Beamdswitch.deck(StockReport.report(C, { metric: "revenue" }));
  for (const end of ends) {
    const rev = revenue.get(end).val, ocf = cash.get(end).val, fy = end.slice(0, 4);
    const money = "\\$" + (rev / 1e9).toFixed(2) + "B", margin = (100 * ocf / rev).toFixed(1) + "%";
    assert.ok(md.includes(`| ${fy} | ${end} | ${money} |`), `${slug} ${fy} revenue`);
    assert.ok(md.includes(`| ${fy} | ${end} | ${margin} |`), `${slug} ${fy} margin`);
    assert.ok(md.includes(`| ${fy} | \\$${(ocf / 1e9).toFixed(2)}B | ${money} | ${margin} |`), `${slug} ${fy} check row`);
    assert.ok(md.includes(`${(rev / 1e9).toFixed(2)} billion dollars in fiscal ${fy}`), `${slug} ${fy} spoken`);
  }
  assert.ok(md.includes(C.source) && md.includes("not investment advice"), slug);
});

test(`${slug}: the beamdswitch button saves, and Copy deck copies, the deck of the measure shown`, async () => {
  const page = openPage(slug, { "button[data-metric]": [{ metric: "revenue" }, { metric: "cash_margin" }] });
  for (const metric of ["revenue", "cash_margin", "revenue"]) {
    await page.click(page.pick("button[data-metric]", "metric", metric));
    const out = await page.exportDeck(), expected = Beamdswitch.deck(StockReport.report(C, { metric }));
    assert.deepEqual([out.name, out.text, out.copied], [`${slug}-beamdswitch.md`, expected, expected], `${slug} ${metric}`);
    assert.equal(out.status, `Saved ${slug}-beamdswitch.md: open it in beamdswitch.`);
  }
});

test(`${slug}: a blocked download points to Copy deck without touching the clipboard`, () => assertBlockedSave(slug));
