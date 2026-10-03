import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { SLUG, read } from "./finance-beamdswitch-checks.mjs";

const HEAD = "fy|revenue_usd|operating_cash_flow_usd|cash_margin_pct";

/** @typedef {{ fy: string, revenue: number, operating_cash_flow: number, cash_margin: number }} Row */
/**
 * A registered WebMCP tool, as the page passes it to registerTool.
 * @typedef {{ name: string, annotations: { readOnlyHint?: boolean }, execute(input?: object): Promise<{ content: { text: string }[] }> }} Tool
 */

// Run the page's WebMCP block against a stub modelContext and return the tools it registers.
/** @param {string} html */
function tools(html) {
  const rows = /const rows=(\[.*?\]),CASE=/.exec(html)?.[1];
  assert.ok(rows, "the page embeds its rows");
  const block = html.split("\n").find((l) => l.startsWith("const result="));
  /** @type {Record<string, Tool>} */
  const registered = {};
  vm.runInNewContext(`const rows=${rows};${block}`, { document: { modelContext: { registerTool: (/** @type {Tool} */ t) => (registered[t.name] = t) } }, navigator: {} });
  return { rows: /** @type {Row[]} */ (JSON.parse(rows)), registered };
}
/** @param {Tool} tool @param {object} [input] */
const text = async (tool, input) => (await tool.execute(input)).content[0].text;
/** @param {Row} r */
const line = (r) => `${r.fy}|${r.revenue}|${r.operating_cash_flow}|${r.cash_margin.toFixed(1)}`;

const { rows, registered } = tools(read("index.html"));
const { get_data, get_metadata, query } = registered;

test(`${SLUG}: every tool is read-only`, () => {
  assert.deepEqual(Object.keys(registered).sort(), ["get_data", "get_metadata", "query"]);
  for (const tool of Object.values(registered)) assert.equal(tool.annotations.readOnlyHint, true, tool.name);
});

test(`${SLUG}: query returns one fiscal year's row for a known fy`, async () => {
  const r = rows[1];
  assert.equal(await text(query, { fy: r.fy }), `${HEAD}\n${line(r)}\ntotal|1\nnext|compare revenue and cash margin`);
});

test(`${SLUG}: query names the available years for an unknown fy`, async () => {
  const years = rows.map((r) => r.fy).join(", ");
  assert.equal(await text(query, { fy: "1999" }), `${HEAD}\ntotal|0\nnext|unknown fiscal year; use one of ${years}`);
});

test(`${SLUG}: query without fy returns every row, in get_data's format`, async () => {
  const all = `${HEAD}\n${rows.map(line).join("\n")}\ntotal|${rows.length}`;
  for (const input of [{}, undefined]) assert.equal(await text(query, input), `${all}\nnext|compare revenue and cash margin`);
  assert.equal(await text(get_data, {}), `${all}\nnext|query a fiscal year`);
});

test(`${SLUG}: get_metadata cites the SEC source and fetch date in meta.json`, async () => {
  const meta = JSON.parse(read("meta.json"));
  const lines = (await text(get_metadata, {})).split("\n");
  assert.match(lines[0], /^ticker\|[A-Z]+$/);
  assert.deepEqual(lines.slice(1), [`source|${meta.source_url}`, `fetched|${meta.fetched}`, "next|get_data for all annual rows"]);
});
