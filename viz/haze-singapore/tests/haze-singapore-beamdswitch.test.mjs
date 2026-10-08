import assert from "node:assert/strict";
import test from "node:test";
import { assertButtonsExport, assertStandardDeck, load, openPage, read } from "./beamdswitch-decks.mjs";

const SLUG = "haze-singapore";
const T = load(`beamdswitch.js`);
const R = load(`report.js`);
const raw = JSON.parse(read(`raw.json`));
const page = await openPage(SLUG);
const html = page.html;
const D = { ...page.run("D"), bands: page.run("BANDS"), sources: JSON.parse(/sources:(\[.*?\])\},\{metric,t,sel\}/.exec(html)[1]) };
const s = R.story(D);

// Both measures at the first hour, the first unhealthy hour, the peak and the last hour, with no region and each region selected.
const VIEWS = ["psi", "pm1"].flatMap((metric) => [0, s.first, D.peak, D.n - 1, 2000].flatMap((t) => [null, ...D.regions].map((sel) => ({ metric, t, sel }))));
const deckFor = (v) => T.deck(R.report(D, v));
const what = (v) => `${v.metric} t=${v.t} sel=${v.sel}`;

// The official reading for one hour, looked up in the committed API responses rather than the page's series.
function official(endpoint, field, t, region) {
  const stamp = new Date(Date.parse(D.start) + t * 36e5 + 8 * 36e5).toISOString().slice(0, 19) + "+08:00";
  for (const day of Object.values(raw[endpoint])) for (const item of day.data.items) if (item.timestamp === stamp) return item.readings[field]?.[region] ?? null;
  return null;
}

test("the beamdswitch button saves, and Copy deck copies, the deck of the measure, hour and region shown", async () => {
  page.run('metric="pm1";setT(2000,true);select("east")');
  assert.equal(page.run("sel"), "east");
  await assertButtonsExport(page, SLUG, deckFor({ metric: "pm1", t: 2000, sel: "east" }));
});

test("every view's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const v of VIEWS) {
    const deck = assertStandardDeck(deckFor(v), what(v));
    assert.equal(deck.meta.title, "Singapore haze, region by region", what(v));
    assert.equal(deck.meta.subtitle, `${R.METRICS[v.metric].name} at ${page.run(`fmt(${v.t})`)}`, `${what(v)}: the page's own time format`);
  }
});

test("the deck's readings are the official readings for the hour shown", () => {
  for (const v of VIEWS) {
    const md = deckFor(v), unit = v.metric === "psi" ? "" : " µg/m³";
    const field = v.metric === "psi" ? ["psi", "psi_twenty_four_hourly"] : ["pm25", "pm25_one_hourly"];
    for (const r of D.regions) {
      const value = official(...field, v.t, r);
      assert.equal(value, D.m[v.metric][r][v.t], `${what(v)}: ${r}`);
      const band = R.bandOf(D, v.metric, value), bands = D.bands[R.METRICS[v.metric].bands];
      assert.ok(md.includes(`| ${r[0].toUpperCase() + r.slice(1)} | ${value == null ? "–" : value + unit} | ${band == null ? "No reading" : `${bands[band].label} · ${bands[band].range}`} |`), `${what(v)}: ${r}`);
    }
    if (v.sel) {
      const p24 = official("psi", "pm25_twenty_four_hourly", v.t, v.sel), p1 = official("pm25", "pm25_one_hourly", v.t, v.sel);
      assert.ok(md.includes(`- PM2.5 (1-hour): ${p1 == null ? "–" : `${p1} µg/m³`}`) && md.includes(`- PM2.5 (24-hour): ${p24 == null ? "–" : `${p24} µg/m³`}`), what(v));
    }
  }
});

test("the deck's summary is the page's headline and lede, recounted from the hourly PSI", () => {
  const h1 = /<h1>([^<]*)<\/h1>/.exec(html)[1], lede = /<p class="lede">([^<]*)<\/p>/.exec(html)[1];
  assert.equal(R.headline(D), h1);
  const md = deckFor({ metric: "psi", t: D.peak });
  assert.ok(md.includes(`::: key\n${h1}. The map shows official regional readings, not a surface.\n:::`));
  assert.ok(lede.includes(`in ${s.unhealthy.length} of ${D.n.toLocaleString("en-US")} hours`) && md.includes(`in ${s.unhealthy.length} of ${D.n.toLocaleString("en-US")} hours, on ${s.days.length} days`));
  assert.ok(lede.includes(`(the highest was ${s.before})`) && md.includes(`the highest was ${s.before}.`));
  for (const r of D.regions) assert.ok(md.includes(`| ${r[0].toUpperCase() + r.slice(1)} | ${s.hours[r]} |`), r);
  assert.ok(lede.includes(`Central was Unhealthy for ${s.hours.central} of them`) && lede.includes(`North for only ${s.hours.north}`));
  // Every PSI reading in the committed responses: the peak is their maximum.
  let max = -1;
  for (const day of Object.values(raw.psi)) for (const item of day.data.items) for (const v of Object.values(item.readings.psi_twenty_four_hourly || {})) max = Math.max(max, v);
  assert.equal(s.peakPsi, max);
  assert.ok(md.includes(`## Peak: PSI ${max} in Central at ${page.run(`fmt(${D.peak})`)}`));
});
