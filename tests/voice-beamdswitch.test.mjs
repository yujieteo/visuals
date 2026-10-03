// Every page that exports a beamdswitch deck is a port of a standalone yujieteo/<repo> repository, whose
// voice-beamdswitch test checks that the page's inlined template names a narrator. This sweep keeps the
// set known, so a new exporting page here cannot go unchecked.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const EXPORTING = [
  "airbnb", "arm", "breeden-litzenberger-density", "convex-payoffs", "energy-email-productivity", "english-grammar",
  "fpl-expected-goals", "graduate-employment-survey", "haze-singapore", "manchester-city-finances", "marvell", "multi-armed-bandit", "ooda-orientation", "panw",
  "singapore-covid-governance-hindsight", "social-values-surveydata", "tourist-attractions",
];
const read = (/** @type {string} */ path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pages = readdirSync(new URL("../viz/", import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory() && readdirSync(new URL(`../viz/${d.name}/`, import.meta.url)).includes("index.html"))
  .map((d) => d.name)
  .filter((slug) => /save-beamdswitch|<script id="beamdswitch">/.test(read(`viz/${slug}/index.html`)))
  .sort();

test("the pages that export a beamdswitch deck are the known set", () => {
  assert.deepEqual(pages, EXPORTING);
});
