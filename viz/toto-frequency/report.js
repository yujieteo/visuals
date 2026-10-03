/* The TOTO page's numbers as a beamdswitch report.
 *
 * report(D, view) turns the dataset and the page's current view ({ window, band, open }) into the
 * plain-data report that the standard template (beamdswitch.js, `Beamdswitch.deck`) writes as a
 * narrated Markdown deck. Every number comes from the dataset, formatted as the page shows it; the
 * page uses the same formatters and ranking, so the deck and the page cannot drift apart.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TotoReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
  const sayDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const bandText = (b) => (b.max == null ? `${b.min} or more` : b.min === 0 ? `0 to ${b.max}` : `${b.min} to ${b.max}`);
  // Rank 1 = most drawn; tied balls share a rank.
  function ranked(D, wid) {
    const rows = [...D.balls].sort((a, b) => b.counts[wid] - a.counts[wid] || a.number - b.number);
    let rank = 0;
    return rows.map((b, i) => {
      if (i === 0 || b.counts[wid] !== rows[i - 1].counts[wid]) rank = i + 1;
      return { ball: b, rank, count: b.counts[wid] };
    });
  }

  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /* Narration is read aloud: symbols become words and markup characters are dropped. */
  const say = (s) => String(s ?? "")
    .replace(/(\d)\s?%/g, "$1 percent").replace(/&/g, " and ").replace(/×/g, " times ").replace(/÷/g, " divided by ")
    .replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]]/g, " ").replace(/\s+/g, " ").trim();
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

  function report(D, view = {}) {
    const W = Object.fromEntries(D.windows.map((w) => [w.id, w])), B = Object.fromEntries(D.bands.map((b) => [b.id, b]));
    const w = W[view.window] || D.windows[0], wid = w.id, latest = D.latest_draw;
    const rows = ranked(D, wid), avg = w.average_per_ball.toFixed(1);
    const best = rows.filter((r) => r.rank === 1), top = best[0].count;
    const low = Math.min(...rows.map((r) => r.count)), least = rows.filter((r) => r.count === low);
    const zero = D.balls.filter((b) => b.counts[wid] === 0).length;
    const balls = (rs) => rs.map((r) => r.ball.number);
    const span = `${fmtDate(w.first_draw.date)} to ${fmtDate(latest.date)}`, spanSaid = `${sayDate(w.first_draw.date)} to ${sayDate(latest.date)}`;
    const total = D.balls.reduce((s, b) => s + b.counts[wid], 0);
    const tally = (id) => D.balls.filter((b) => b.bands[wid] === id).length;

    const setup = [{
      title: `The data: ${w.draws} draws in the last ${w.label}, ${span}`,
      body: [
        `- Window: the last ${md(w.label)}, every draw after ${fmtDate(w.after)}: draw ${w.first_draw.draw_no} (${fmtDate(w.first_draw.date)}) to draw ${latest.draw_no} (${fmtDate(latest.date)}).`,
        `- Each draw picks 6 winning numbers from the balls 1 to 49, then an additional number.`,
        ...D.sources.map((s) => `- ${md(s.publisher)}, [${md(s.title)}](${s.url}). Retrieved ${fmtDate(s.retrieved)}.`),
      ].join("\n"),
      narration: `The data are the ${w.draws} TOTO draws Singapore Pools published in the last ${w.label}, from ${spanSaid}. Each draw picks six winning numbers from the balls 1 to 49, then an additional number.`,
    }];

    const method = [{
      title: "A ball's count is the number of draws whose six winning numbers include it",
      body: [
        `- ${md(D.method[2])}`,
        `- ${md(D.method[1])}`,
        "",
        `$$ \\text{even-spread average} = \\frac{6 \\times ${w.draws}}{49} \\approx ${avg} $$`,
      ].join("\n"),
      narration: `A ball's count is the number of draws in the window whose six winning numbers include it; the additional number is not counted. If the winning numbers were spread evenly, every ball would be drawn 6 times ${w.draws}, divided by 49, which is about ${avg} times.`,
    }, {
      title: `Four colour bands: ${list(D.bands.map((b) => b.label.toLowerCase()))}`,
      body: [
        "| Band | Times drawn | Balls in the last " + md(w.label) + " |",
        "| --- | ---: | ---: |",
        ...[...D.bands].reverse().map((b) => `| ${md(b.label)} | ${bandText(b)} | ${tally(b.id)} |`),
      ].join("\n"),
      notes: md(D.method[3]),
      narration: `Balls are coloured in four bands, from blue for drawn least to red for drawn most. In the last ${w.label}, ${list([...D.bands].reverse().map((b) => `${tally(b.id) ? plural(tally(b.id), "ball") : "no balls"} ${tally(b.id) === 1 ? "was" : "were"} drawn ${bandText(b)} times`))}.`,
    }];

    const results = [{
      title: `Drawn most: ${best.length > 1 ? "balls" : "ball"} ${balls(best).join(", ")}, ${plural(top, "time")} each`,
      body: [
        `| Rank | Ball | Times drawn | Band | Last drawn |`,
        `| ---: | ---: | ---: | --- | --- |`,
        ...rows.filter((r) => r.rank <= 5).map((r) => `| ${r.rank} | ${r.ball.number} | ${r.count} | ${md(B[r.ball.bands[wid]].label)} | ${r.ball.last_drawn ? fmtDate(r.ball.last_drawn.date) : "—"} |`),
      ].join("\n"),
      notes: "Tied balls share a rank. The full table is on the page under Show the counts as a table.",
      narration: `In the last ${w.label}, ${best.length > 1 ? `balls ${list(balls(best).map(String))} were` : `ball ${best[0].ball.number} was`} drawn most, ${plural(top, "time")}${best.length > 1 ? " each" : ""}, against an even-spread average of about ${avg}.`,
    }, {
      title: `Drawn least: ${zero ? `${plural(zero, "ball")} not drawn at all` : `${least.length > 1 ? "balls" : "ball"} ${balls(least).join(", ")}, ${plural(low, "time")} each`}`,
      body: [
        `- Drawn ${plural(low, "time")}: ${least.length > 1 ? "balls" : "ball"} ${balls(least).join(", ")}.`,
        `- Balls not drawn at all in this window: ${zero}.`,
        `- Lowest band, ${md(D.bands[0].label.toLowerCase())} (${bandText(D.bands[0])} times): ${plural(tally(D.bands[0].id), "ball")}.`,
      ].join("\n"),
      narration: `At the other end, ${least.length > 1 ? `balls ${list(balls(least).map(String))} were` : `ball ${least[0].ball.number} was`} ${low === 0 ? "not drawn at all in this window" : `drawn ${plural(low, "time")}${least.length > 1 ? " each" : ""}, and every ball was drawn at least once`}.`,
    }];
    if (view.band && B[view.band]) {
      const b = B[view.band], lit = rows.filter((r) => r.ball.bands[wid] === b.id);
      results.push({
        title: `Highlighted: ${plural(lit.length, "ball")} drawn ${bandText(b)} times`,
        body: lit.length ? `${md(b.label)}: ${lit.map((r) => `${r.ball.number} (${r.count})`).join(", ")}.` : `No ball was drawn ${bandText(b)} times in the last ${md(w.label)}.`,
        narration: lit.length
          ? `The highlighted band, ${say(b.label.toLowerCase())}, holds ${plural(lit.length, "ball")} drawn ${bandText(b)} times: ${list(lit.map((r) => String(r.ball.number)))}.`
          : `No ball was drawn ${bandText(b)} times in the last ${w.label}.`,
      });
    }
    const open = D.balls.find((b) => b.number === view.open);
    if (open) {
      const r = rows.find((x) => x.ball === open), hits = D.draws.filter((d) => d.date > w.after && d.winning.includes(open.number));
      results.push({
        title: `Ball ${open.number}: drawn ${plural(open.counts[wid], "time")} in ${w.draws} draws, rank ${r.rank} of 49`,
        body: [
          ...D.windows.map((x) => `- Last ${md(x.label)}: ${plural(open.counts[x.id], "time")} of ${x.draws} draws · ${md(B[open.bands[x.id]].label.toLowerCase())}`),
          `- Last drawn: ${open.last_drawn ? `draw ${open.last_drawn.draw_no}, ${fmtDate(open.last_drawn.date)}` : "not in the last year"}`,
          `- ${hits.length ? `Drawn in the last ${md(w.label)} on: ${hits.map((d) => fmtDate(d.date)).join(" · ")}` : `Not drawn in the last ${md(w.label)}.`}`,
        ].join("\n"),
        narration: `Ball ${open.number} was drawn ${plural(open.counts[wid], "time")} in the last ${w.label}, rank ${r.rank} of 49. ${open.last_drawn ? `It was last drawn on ${sayDate(open.last_drawn.date)}.` : "It was not drawn in the last year."}`,
      });
    }

    const checks = [{
      title: `The counts add up: ${total} = 6 × ${w.draws} draws`,
      body: [
        "| Window | Draws | Sum of the 49 counts | 6 × draws |",
        "| --- | ---: | ---: | ---: |",
        ...D.windows.map((x) => `| Last ${md(x.label)} | ${x.draws} | ${D.balls.reduce((s, b) => s + b.counts[x.id], 0)} | ${6 * x.draws} |`),
      ].join("\n"),
      narration: `Each draw adds one to six balls, so the 49 counts must add up to six times the number of draws. In the last ${w.label} they add up to ${total}, which is 6 times ${w.draws}.`,
    }, {
      title: "Takeaway",
      key: `In the last ${md(w.label)}, ${best.length > 1 ? "balls" : "ball"} ${balls(best).join(", ")} ${best.length > 1 ? "were" : "was"} drawn most, ${plural(top, "time")}${best.length > 1 ? " each" : ""}, against an even-spread average of ${avg}. ${md(D.random_note.split(". ").slice(0, 2).join(". "))}.`,
      narration: `${best.length > 1 ? `Balls ${list(balls(best).map(String))} were` : `Ball ${best[0].ball.number} was`} drawn most in the last ${w.label}. But every TOTO draw is a fresh random draw, so past counts do not predict future draws.`,
    }];

    return {
      meta: { title: `TOTO ball frequency: the last ${w.label}`, subtitle: `${w.draws} Singapore Pools draws, ${span}`, date: `Data to ${fmtDate(latest.date)}` },
      narration: `This talk counts how often each of the 49 TOTO balls was a winning number in the last ${w.label}, over ${w.draws} Singapore Pools draws. Every count is a number of draws.`,
      notes: md(D.random_note),
      setup, method, results, checks,
    };
  }

  return { fmtDate, sayDate, plural, bandText, ranked, report };
});
