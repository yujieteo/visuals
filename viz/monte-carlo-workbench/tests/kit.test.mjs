// The workbench against the kit's contract: versioned state, URL and JSON round trips, and the Markdown record and
// beamdswitch deck of every example (scripts/kit/checks.mjs), with the report of a view that has no run yet.
import { createRequire } from "node:module";
import { kitTests } from "../../../scripts/kit/checks.mjs";

const require = createRequire(import.meta.url);
kitTests({
  slug: "monte-carlo-workbench",
  title: "Monte Carlo Probability Workbench",
  model: require("../src/model.js"),
  report: require("../src/report.js"),
  data: require("../raw.json"),
});
