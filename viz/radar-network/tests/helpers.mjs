// Shared loaders for this visual's tests: the src/ modules through require(), and the data files.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
export const read = (p) => readFileSync(new URL(p, root), "utf8");
export const json = (p) => JSON.parse(read(p));
export const N = require("../src/numerics.js");
export const D = require("../src/detector.js");
export const M = require("../src/model.js");
export const S = require("../src/state.js");
export const G = require("../src/signal.js");
export const CA = require("../src/calc.js");
export const CK = require("../src/checks.js");
export const RP = require("../src/report.js");
export const V = require("../src/scene3d.js");
export const preset = json("data/preset.json");
export const examples = json("data/examples.json");
export const references = json("data/reference-cases.json");
export const evidence = json("data/evidence.json");
export const fresh = () => S.defaultScenario(preset);
