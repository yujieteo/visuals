// Prints the initial scene's 36 link summaries as JSON for build.py's no-JavaScript table, with every number
// already formatted (2 decimals or 5 significant digits), so the page is identical across Node versions.
const path = require("path");
const root = path.resolve(__dirname, "..");
const S = require(path.join(root, "src/state.js")), M = require(path.join(root, "src/model.js")), CA = require(path.join(root, "src/calc.js")), N = require(path.join(root, "src/numerics.js"));
const preset = require(path.join(root, "data/preset.json"));
// build.py passes the page's source versions on stdin, so the digest here equals the page's digest.
const sources = JSON.parse(require("fs").readFileSync(0, "utf8") || "{}");
const scn = S.defaultScenario(preset, sources);
const status = { ok: "valid", inactive: "inactive", incompatible: "incompatible", "outside-model": "outside the model", invalid: "invalid" };
const rows = M.evaluateAll(scn, 0).map((L) => ({
  id: L.id, type: L.type === "monostatic" ? "● mono" : "◆ bistatic",
  pr: L.power ? CA.fixed(L.power.PrdBm, 2) : "—",
  rho: L.snr ? CA.fixed(N.linToDb(L.snr.rho1), 2) : "—",
  margin: L.detector ? `${L.detector.margin_dB >= 0 ? "▲ +" : "▼ "}${CA.fixed(L.detector.margin_dB, 2)}` : "—",
  pd: L.detector ? CA.pdTxt(L.detector) : "—",
  delay: CA.txt(L.geometry.tauE * 1e6, 5), doppler: CA.fixed(L.geometry.fD, 1),
  status: L.status === "ok" ? "valid" : `${status[L.status]}: ${L.reasons.join("; ")}`,
}));
process.stdout.write(JSON.stringify({ digest: S.modelDigest(scn), modelVersion: M.MODEL_VERSION, schemaVersion: S.SCHEMA_VERSION, rows }));
