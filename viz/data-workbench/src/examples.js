/* Universal Data Workbench: the synthetic "Planted patterns" example, generated from a fixed seed.
 *
 * 2,000 orders with patterns planted on purpose, so later pieces can check that the search finds them and this
 * piece can show how each kind of column profiles:
 *
 *   order_id   identifiers written with leading zeros (000001 ...)          an identifier, never a measure
 *   region     six regions and a rare seventh, "Atlantis" (0.5%)            a rare value
 *   segment    A or B; score is 0.8 standard deviations higher in B          a group difference
 *   order_date one row a day or so over 2024 and 2025                         time
 *   dose       uniform 0 to 10; response rises with it                        a monotone relation
 *   weight     normal, with a cluster of 1% near +8 standard deviations       unusual values
 *   sales      a level shift of +2 standard deviations from 2025-03-01        an abrupt change in time
 *   temp_c     normal, with five -999 stand-ins                               suspected data errors
 *   units, price, rating (1 to 5), active (yes or no), comment (mostly distinct text)
 *
 * The same seed gives the same bytes on every device; the Node checks pin its SHA-256.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./stats.js"));
  else root.DWExamples = factory(root.DWStats);
})(typeof self !== "undefined" ? self : this, function (Stats) {
  "use strict";

  const SEED = 20261005;
  const ROWS = 2000;

  const { random } = Stats;

  /** A standard normal draw (Box-Muller) from a uniform generator. */
  const normal = (u) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());

  const REGIONS = [["North", 0.24], ["South", 0.22], ["East", 0.2], ["West", 0.18], ["Central", 0.11], ["Islands", 0.045], ["Atlantis", 0.005]];
  const WORDS = ["late", "early", "gift", "repeat", "bulk", "fragile", "urgent", "return", "sample", "online", "store", "phone"];

  /** The planted table as CSV text, with a header row and "\n" line ends. */
  function planted(seed = SEED, rows = ROWS) {
    const u = random(seed);
    const lines = ["order_id,region,segment,order_date,units,price,score,dose,response,weight,sales,temp_c,rating,active,comment"];
    const start = Date.UTC(2024, 0, 1), shift = Date.UTC(2025, 2, 1), span = Date.UTC(2025, 11, 31) - start;
    for (let i = 0; i < rows; i++) {
      const pick = u();
      let acc = 0, region = REGIONS[REGIONS.length - 1][0];
      for (const [name, w] of REGIONS) { acc += w; if (pick < acc) { region = name; break; } }
      const segment = u() < 0.5 ? "A" : "B";
      const day = start + Math.floor(((i + u()) / rows) * span / 86400000) * 86400000;
      const date = new Date(day).toISOString().slice(0, 10);
      const units = Math.max(1, Math.round(4 + 2 * normal(u)));
      const price = Math.exp(3 + 0.5 * normal(u)).toFixed(2);
      const score = (50 + 10 * normal(u) + (segment === "B" ? 8 : 0)).toFixed(1);
      const dose = (10 * u()).toFixed(2);
      const response = (2 * Number(dose) + 0.15 * Number(dose) ** 2 + 3 * normal(u)).toFixed(2);
      const weight = (u() < 0.01 ? 70 + 8 * 12 + 4 * normal(u) : 70 + 12 * normal(u)).toFixed(1);
      const sales = (200 + 20 * normal(u) + (day >= shift ? 40 : 0)).toFixed(0);
      const temp = i % 400 === 7 ? "-999" : (24 + 4 * normal(u)).toFixed(1);
      const rating = String(Math.min(5, Math.max(1, Math.round(3.4 + normal(u)))));
      const active = u() < 0.7 ? "yes" : "no";
      const comment = `${WORDS[Math.floor(u() * WORDS.length)]} ${WORDS[Math.floor(u() * WORDS.length)]} order ${(i * 7919) % 100003}`;
      lines.push([String(i + 1).padStart(6, "0"), region, segment, date, units, price, score, dose, response, weight, sales, temp, rating, active, comment].join(","));
    }
    return `${lines.join("\n")}\n`;
  }

  return { SEED, ROWS, random, planted };
});
