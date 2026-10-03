/* The page's model, run from the page itself, against the snapshot it inlines. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/** @param {string} name */
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const html = read("index.html");
const src = /** @type {RegExpExecArray} */ (/<script id="lanyard-model">\n([\s\S]*?)<\/script>/.exec(html))[1];
/** @type {{ self?: unknown, Lanyards?: typeof Lanyards }} */
const ctx = {};
ctx.self = ctx;
vm.runInNewContext(src, ctx);
const M = /** @type {typeof Lanyards} */ (ctx.Lanyards);
const data = JSON.parse(read("data.json"));
/** @type {Parameters<typeof Lanyards.value>[0][]} */
const items = data.items;
const ids = (/** @type {{id:string}[]} */ list) => list.map((it) => it.id);

test("the inlined snapshot is data.json", () => {
  const inline = /** @type {RegExpExecArray} */ (/<script id="lanyard-data" type="application\/json">\n([\s\S]*?)\n<\/script>/.exec(html))[1];
  assert.deepEqual(JSON.parse(inline), data);
  assert.match(data.retrieved, /^\d{4}-\d{2}-\d{2}$/);
});

test("every item has a shop link, an image and a price, with 15 to 30 items", () => {
  assert.ok(items.length >= 15 && items.length <= 30);
  assert.equal(new Set(ids(items)).size, items.length);
  for (const it of items) {
    assert.match(it.url, /^https:\/\/www\.amazon\.sg\/dp\/[A-Z0-9]{10}$/, it.id);
    assert.match(it.image, /^https:\/\//, it.id);
    assert.ok(it.price_sgd && it.price_sgd > 0, it.id);
    assert.ok(it.pros.length + it.cons.length >= 1, it.id);
  }
});

test("best value rewards rating and reviews and penalises price", () => {
  const base = { ...items[0], price_sgd: 10, rating: 4.5, reviews: 999 };
  assert.ok(M.value({ ...base, price_sgd: 20 }) < M.value(base));
  assert.ok(M.value({ ...base, reviews: 9 }) < M.value(base));
  assert.ok(M.value({ ...base, rating: 4 }) < M.value(base));
  assert.equal(M.value({ ...base, price_sgd: null }), 0);
  assert.equal(M.value(base), (4.5 * 3) / 10);
});

test("filters and sorts", () => {
  const cheap = M.view(items, { sort: "price", maxPrice: 15 });
  assert.ok(cheap.length > 0 && cheap.every((it) => /** @type {number} */ (it.price_sgd) <= 15));
  const prices = cheap.map((it) => /** @type {number} */ (it.price_sgd));
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const reel = M.view(items, { feature: "badge reel", minRating: 4.5 });
  assert.ok(reel.length > 0 && reel.every((it) => it.features.includes("badge reel") && /** @type {number} */ (it.rating) >= 4.5));
  const byValue = M.view(items, {}).map(M.value);
  assert.deepEqual(byValue, [...byValue].sort((a, b) => b - a));
  assert.equal(M.view(items, { shop: "Nowhere" }).length, 0);
  assert.equal(M.sgd(8.5), "S$8.50");
});
