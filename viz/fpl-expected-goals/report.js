/* The fpl-expected-goals page's players as a beamdswitch report.
 *
 * report(rows, view) turns the page's player rows and its current view ({ filter, fetched,
 * gameweek, source }) into the plain-data report that the standard template (beamdswitch.js,
 * `Beamdswitch.deck`) writes as a narrated Markdown deck. Every number is the row's own value,
 * formatted as the page's tooltip shows it (xGI to two places, the gap signed, cost as £5.8m);
 * the gap and the colour bands are defined here and the page's chart reuses them: gap = GI − xGI,
 * ahead above +0.25, behind below −0.25.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FplReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TITLE = "How much of the early FPL points are repeatable?";
  const POSITIONS = { all: "All", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
  const BAND = 0.25;

  const gap = (r) => r.gi - r.xgi;
  const band = (r) => (gap(r) > BAND ? "ahead" : gap(r) < -BAND ? "behind" : "even");
  const signed = (g) => (g > 0 ? "+" : "") + g.toFixed(2);
  const sayDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  const row = (r) => `| ${md(r.n)} | ${r.t} | ${r.p} | ${r.gi} | ${r.xgi.toFixed(2)} | ${signed(gap(r))} | £${r.c.toFixed(1)}m | ${r.pts} | ${r.m} |`;
  const HEAD = ["| Player | Team | Pos | GI | xGI | Gap | Cost | Pts | Mins |", "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"];

  function report(rows, view = {}) {
    const filter = POSITIONS[view.filter] ? view.filter : "all";
    const shown = rows.filter((r) => filter === "all" || r.p === filter);
    const who = filter === "all" ? "outfield players" : POSITIONS[filter].toLowerCase();
    const ahead = shown.filter((r) => band(r) === "ahead"), behind = shown.filter((r) => band(r) === "behind"), even = shown.filter((r) => band(r) === "even");
    const top = [...shown].sort((a, b) => gap(b) - gap(a)).slice(0, 5);
    const bottom = [...shown].sort((a, b) => gap(a) - gap(b)).slice(0, 5);
    const gi = shown.reduce((s, r) => s + r.gi, 0), xgi = shown.reduce((s, r) => s + r.xgi, 0);
    const gw = view.gameweek, fetched = view.fetched;
    const leader = top[0], trailer = bottom[0];

    const setup = [{
      title: `The data: ${shown.length} ${who} with at least 300 minutes, after Gameweek ${gw}`,
      body: [
        `- Source: [Fantasy Premier League bootstrap-static](${view.source}). Fetched ${fetched}. Gameweek ${gw}.`,
        `- Outfield players with at least 300 minutes: ${rows.length}. Shown: ${POSITIONS[filter]}${filter === "all" ? "" : `, ${shown.length} players`}.`,
        "- This is descriptive information, not advice.",
      ].join("\n"),
      narration: `The data are the Fantasy Premier League figures after Gameweek ${gw.replace(" of ", " of the ")} season, fetched on ${sayDate(fetched)}. ${filter === "all" ? `All ${rows.length} outfield players` : `The ${shown.length} ${who}, of ${rows.length} outfield players,`} with at least 300 minutes are shown.`,
    }];

    const method = [{
      title: "Each player's gap is goal involvements minus expected goal involvement",
      body: [
        "- Expected goal involvement (xGI) is a player's expected goals plus expected assists; goal involvements (GI) are goals plus assists.",
        "",
        "$$ \\text{gap} = \\text{GI} - \\text{xGI} $$",
        "",
        `- Above the line, ahead of expected: gap above +${BAND.toFixed(2)}, finishing that may regress.`,
        `- Below the line, behind expected: gap below −${BAND.toFixed(2)}, chances not converted.`,
        "- Otherwise on the line.",
      ].join("\n"),
      narration: `Expected goal involvement is a player's expected goals plus expected assists. Each player's gap is their actual goals plus assists minus that expectation. A gap above a quarter of a goal puts them ahead of expected, and below minus a quarter puts them behind.`,
    }];

    const results = [{
      title: `${ahead.length} ahead of expected, ${behind.length} behind, ${even.length} on the line`,
      body: [
        "| Band | Players |",
        "| --- | ---: |",
        `| Ahead of expected | ${ahead.length} |`,
        `| Behind expected | ${behind.length} |`,
        `| On the line | ${even.length} |`,
      ].join("\n"),
      narration: `Of the ${shown.length} ${who} shown, ${ahead.length} are ahead of expected, ${behind.length} are behind, and ${even.length} sit on the line.`,
    }, {
      title: `Furthest ahead: ${md(leader.n)}, ${leader.gi} from ${leader.xgi.toFixed(2)} expected`,
      body: [...HEAD, ...top.map(row)].join("\n"),
      notes: "Gap = GI − xGI. Cost in millions, points and minutes after the gameweek shown.",
      narration: `The five furthest ahead are ${list(top.map((r) => r.n))}. ${leader.n} leads with ${plural(leader.gi, "goal involvement")} from ${leader.xgi.toFixed(2)} expected, ${gap(leader).toFixed(2)} ahead.`,
    }, {
      title: `Furthest behind: ${md(trailer.n)}, ${trailer.gi} from ${trailer.xgi.toFixed(2)} expected`,
      body: [...HEAD, ...bottom.map(row)].join("\n"),
      narration: `The five furthest behind are ${list(bottom.map((r) => r.n))}. ${trailer.n} has ${plural(trailer.gi, "goal involvement")} from ${trailer.xgi.toFixed(2)} expected, ${(-gap(trailer)).toFixed(2)} behind.`,
    }];

    const checks = [{
      title: `The gaps add up: ${gi} goal involvements against ${xgi.toFixed(2)} expected`,
      body: [
        `- Goal involvements of the ${shown.length} players shown: ${gi}.`,
        `- Expected goal involvement of the same players: ${xgi.toFixed(2)}.`,
        `- Sum of their gaps: ${signed(gi - xgi)}.`,
        `- Every player sits in one band: ${ahead.length} + ${behind.length} + ${even.length} = ${shown.length}.`,
      ].join("\n"),
      narration: `Across the ${shown.length} players shown, goal involvements add up to ${gi} against ${xgi.toFixed(2)} expected, so as a group they are ${Math.abs(gi - xgi).toFixed(2)} ${gi >= xgi ? "ahead" : "behind"}.`,
    }, {
      title: "Takeaway",
      key: `${ahead.length} of the ${shown.length} ${md(who)} shown are ahead of expected; ${md(leader.n)} leads with ${leader.gi} goal involvements from ${leader.xgi.toFixed(2)} expected. Points from finishing above expected are the least likely to repeat. This is descriptive information, not advice.`,
      narration: `Players finishing well above their expected goal involvement, led by ${leader.n}, have the points least likely to repeat. This is descriptive information, not advice.`,
    }];

    return {
      meta: { title: TITLE, subtitle: `${POSITIONS[filter] === "All" ? "Outfield players" : POSITIONS[filter]} after Gameweek ${gw}`, date: `Data fetched ${fetched}` },
      narration: `This talk compares each Fantasy Premier League player's goal involvements with their expected goal involvement after Gameweek ${gw.replace(" of ", " of the ")} season, to ask how much of the early points are repeatable.`,
      notes: "This is descriptive information, not advice.",
      setup, method, results, checks,
    };
  }

  return { TITLE, POSITIONS, BAND, gap, band, signed, report };
});
