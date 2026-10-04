// Good food in Ubi, Hougang, Woodleigh, Paya Lebar and Eunos: the model's own known cases and invariants. The kit's
// contract (state, URL, JSON, deck template) is in ubi-hougang-food-kit.test.mjs; the dataset's rules are in
// test_ubi_hougang_food.py.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Model = require("../src/model.js");
const Report = require("../report.js");
const D = require("../raw.json");
const VisualKit = require("../../../scripts/kit/kit.js");
const at = (/** @type {Record<string, unknown>} */ patch) => Model.derive(VisualKit.normalize(Model.FIELDS, patch).state, D);
const views = [{}, ...Model.EXAMPLES.map((/** @type {KitExample} */ e) => e.state), { cuisine: "chinese", top: 50 }, { publishers: 4 }];

test("the model's cuisine and area ids are the dataset's", () => {
  assert.deepEqual(Model.CUISINES, D.cuisines.map((/** @type {any} */ c) => c.id));
  assert.deepEqual(Model.AREAS, D.areas.map((/** @type {any} */ a) => a.id));
});

test("known case: Indian food in Eunos is ranks 34, 36, 97, 99 and 100, on the overview and the Eunos map", () => {
  const d = at({ area: "eunos", cuisine: "indian" });
  assert.deepEqual(d.shown.map((/** @type {any} */ o) => o.rank), [34, 36, 97, 99, 100]);
  assert.equal(d.text.scope, "Indian in Eunos");
  assert.equal(d.text.count, "5 of the top 100");
  assert.deepEqual(d.maps.map((/** @type {any} */ m) => [m.id, m.markers.length]), [["overview", 5], ["eunos", 5]]);
});

test("known case: the spread puts one marker on its point, and 7 on a ring of 6 around it plus one on the next ring", () => {
  assert.deepEqual(Model.spread(1, 10), [[0, 0]]);
  const seven = Model.spread(7, 10);
  assert.equal(seven.length, 7);
  for (const [x, y] of seven.slice(0, 6)) assert.ok(Math.abs(Math.hypot(x, y) - 10) < 1e-9);
  assert.ok(Math.hypot(...seven[6]) > 10);
});

test("known case: 18 of the top 100 are named by 4 or more publishers", () => {
  const d = at({ publishers: 4 });
  assert.equal(d.shown.length, 18);
  assert.equal(d.text.scope, "Every cuisine and area, named by 4 or more publishers");
});

test("invariants: the area and cuisine counts add up to the places shown", () => {
  for (const v of views) {
    const d = at(v);
    const all = at({ ...v, area: "all" }).shown.length;
    assert.equal(Object.values(d.byArea).reduce((a, b) => a + b, 0), all, JSON.stringify(v));
    const any = at({ ...v, cuisine: "all" }).shown.length;
    assert.equal(Object.values(d.byCuisine).reduce((a, b) => a + b, 0), any, JSON.stringify(v));
  }
});

test("invariants: the bars and the dishes that are not estimable are the places shown, in the chosen order", () => {
  for (const v of views) {
    const d = at(v);
    assert.equal(d.bars.length + d.notEstimable.length, d.shown.length);
    const by = d.bars.map((/** @type {any} */ o) => (v.sort === "rank" ? o.rank : -Number(Model.kcalOf(o))));
    assert.deepEqual(by, [...by].sort((a, b) => a - b), JSON.stringify(v));
  }
});

test("invariants: every marker is inside its map, and on an area map no two markers overlap", () => {
  const view = Object.fromEntries(D.map.views.map((/** @type {any} */ v) => [v.id, v]));
  for (const m of at({}).maps) {
    const { w, h } = view[m.id];
    for (const k of m.markers) assert.ok(k.x >= 0 && k.x <= w && k.y >= 0 && k.y <= h, `${m.id}: ${k.id} at ${k.x}, ${k.y}`);
    if (m.id === "overview") continue;
    m.markers.forEach((/** @type {any} */ a, /** @type {number} */ i) => {
      for (const b of m.markers.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= Model.MARKER_GAP.area - 0.5, `${m.id}: ${a.id} and ${b.id}`);
    });
  }
});

test("the deck is narrated in the bf_emma voice and names the view", () => {
  const state = VisualKit.normalize(Model.FIELDS, { area: "eunos", cuisine: "indian" }).state;
  const deck = Report.report(state, Model.derive(state, D), D);
  assert.equal(deck.meta.voice, "bf_emma");
  assert.match(deck.meta.subtitle, /Indian in Eunos/);
});
