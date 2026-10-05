// Scientific Modelling against the kit's contract (scripts/kit/checks.mjs): the versioned view state, URL and
// JSON round trips, derive's plain data, and the Markdown record and beamdswitch deck of every example, parsed with
// beamdswitch's own parser. The examples here use each example's record as loaded, before confirmation; the
// model tests (scientific-modelling-model.test.mjs) confirm the records and check the analyses.
import { createRequire } from "node:module";
import { kitTests } from "../../../scripts/kit/checks.mjs";

const require = createRequire(import.meta.url);
kitTests({
  slug: "scientific-modelling",
  title: "Scientific Modelling and Dimensional Analysis",
  model: require("../src/model.js"),
  report: require("../src/report.js"),
  data: require("../raw.json"),
});
