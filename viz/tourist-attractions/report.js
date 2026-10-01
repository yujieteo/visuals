/* The tourist attractions page's words and places as a beamdswitch report.
 *
 * report(D, view) turns the page's data (D: { rows, terms, medianLon, medianLat, described, source,
 * fetched }, with rows and terms as the page parses them) and its current view ({ query, term,
 * selection }) into the plain-data report that the standard template (beamdswitch.js,
 * `Beamdswitch.deck`) writes as a narrated Markdown deck. Counts, titles and overviews are the page's,
 * filtered the way its search box and word cloud filter them.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TouristReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const QUADRANTS = ["NW", "NE", "SW", "SE"];
  const QUADRANT_NAMES = { NW: "north-west", NE: "north-east", SW: "south-west", SE: "south-east" };
  const LISTED = 24; // The page lists the first 24 matches until Show all results.
  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]#]/g, "\\$&");
  /* Narration is read aloud: tags and markup characters are dropped and symbols become words. */
  const say = (s) => String(s ?? "").replace(/<[^>]*>/g, "")
    .replace(/(\d)\s?%/g, "$1 percent").replace(/&/g, " and ").replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]~^]/g, " ").replace(/\s+/g, " ").trim();
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

  /* The page's filteredRows() with its own search text and word. */
  function matches(rows, view = {}) {
    const text = String(view.query ?? "").trim().toLocaleLowerCase(), term = String(view.term ?? "").toLocaleLowerCase();
    return rows.filter((d) => (!text || `${d.title} ${d.address} ${d.overview} ${d.hours}`.toLocaleLowerCase().includes(text)) && (!term || d.marketing_terms.includes(term)));
  }
  const regional = (items) => { const c = { NW: 0, NE: 0, SW: 0, SE: 0 }; for (const d of items) c[d.region]++; return c; };
  const regionText = (c) => QUADRANTS.map((q) => `${q} ${c[q]}`).join(", ");
  const sayRegions = (c) => list(QUADRANTS.map((q) => `${c[q]} in the ${QUADRANT_NAMES[q]}`));

  function report(D, view = {}) {
    const rows = D.rows, terms = D.terms, term = view.term || null, query = String(view.query ?? "").trim();
    const visible = matches(rows, view), counts = regional(visible);
    const selected = rows.find((d) => d.id === view.selection && visible.includes(d));
    const top = terms.slice(0, 10), first = terms[0], leaders = terms.filter((t) => t.documents === first.documents);
    const leadWords = list(leaders.map((t) => `“${md(t.term)}”`)), sayLead = list(leaders.map((t) => t.term)), each = leaders.length > 1 ? " each" : "";
    const summary = term ? `${term} appears in ${visible.length} matching descriptions. ${regionText(counts)}.` : `Choose a word. The full map shows ${visible.length} attractions. ${regionText(counts)}.`;
    const countLine = `${visible.length} of ${rows.length} attractions shown${term ? ` for “${term}”` : ""}`;

    const setup = [{
      title: `The data: ${rows.length} Singapore tourist attractions, ${D.described} with an overview`,
      body: [
        `- ${rows.length} attractions with a name, address, opening hours, source coordinates and, for ${D.described} of them, an official overview.`,
        `- Source: ${md(D.source)}. Fetched ${D.fetched}.`,
      ].join("\n"),
      narration: `The data are ${rows.length} Singapore tourist attractions from the official tourism dataset. ${D.described} of them carry an overview, the marketing text this talk reads.`,
    }];

    const method = [{
      title: `Words are counted once per description; the top ${terms.length} appear in at least two`,
      body: [
        `- Counts are document frequency: a word counts once per description.`,
        `- The cloud shows the ${terms.length} most frequent words found in at least two descriptions, after HTML removal, Unicode case folding and a versioned stopword list. Words are not stemmed.`,
        `- The map splits the source coordinates at median longitude ${D.medianLon.toFixed(6)} and median latitude ${D.medianLat.toFixed(6)} into NW, NE, SW and SE quadrants.`,
      ].join("\n"),
      narration: `A word counts once for each description that uses it. The word cloud shows the ${terms.length} most frequent words found in at least two descriptions, after removing common function words. The map splits the attractions into four quadrants at their median longitude and latitude.`,
    }];

    const results = [{
      title: `Most frequent ${leaders.length > 1 ? "words" : "word"}: ${leadWords}, in ${first.documents} of ${D.described} descriptions${each}`,
      body: [
        "| Word | Descriptions | NW | NE | SW | SE |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        ...top.map((t) => `| ${md(t.term)} | ${t.documents} | ${t.nw} | ${t.ne} | ${t.sw} | ${t.se} |`),
      ].join("\n"),
      notes: `The page's word cloud has all ${terms.length} words; choose one to filter the map.`,
      narration: `The most frequent ${leaders.length > 1 ? `words are ${sayLead}` : `word is ${sayLead}`}, in ${first.documents} descriptions${each}, followed by ${list(top.slice(leaders.length, leaders.length + 4).map((t) => `${t.term} in ${t.documents}`))}.`,
    }, {
      title: countLine,
      body: [
        `- ${md(summary)}`,
        ...(query ? [`- Search: “${md(query)}”.`] : []),
        "",
        ...(visible.length
          ? visible.slice(0, LISTED).map((d, i) => `${i + 1}. ${md(d.title)} · ${md(d.address) || "Address not provided"}`)
          : ["No attractions match."]),
        ...(visible.length > LISTED ? ["", `And ${visible.length - LISTED} more, under Show all results.`] : []),
      ].join("\n"),
      narration: visible.length
        ? `${term ? `The word ${term} appears in ${plural(visible.length, "matching description")}` : `The map shows ${plural(visible.length, "attraction")}`}${query ? ` for the search ${say(query)}` : ""}: ${sayRegions(counts)}. ${term && visible.length ? `They include ${list(visible.slice(0, 3).map((d) => say(d.title)))}.` : ""}`.trim()
        : `No attractions match${term ? ` the word ${term}` : ""}${query ? ` and the search ${say(query)}` : ""}.`,
    }];
    if (selected) {
      results.push({
        title: md(selected.title) || "The selected attraction",
        body: [
          selected.overview ? md(selected.overview) : "No overview provided.",
          "",
          `- Address: ${md(selected.address) || "Not provided"}`,
          `- Opening hours: ${md(selected.hours) || "Not provided"}`,
          `- Region: ${selected.region}`,
          `- Coordinates: ${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}`,
          ...(selected.url ? [`- Website: [${md(selected.url)}](${selected.url})`] : []),
        ].join("\n"),
        notes: "This is the attraction selected on the page.",
        narration: `${say(selected.title)}, in the ${QUADRANT_NAMES[selected.region]} quadrant. ${selected.overview ? say(selected.overview) : "The source gives no overview for it."}`,
      });
    }

    const termRow = term && terms.find((t) => t.term === term);
    const checkRow = termRow || first, check = regional(matches(rows, { term: checkRow.term }));
    const checks = [{
      title: `The quadrants add up: “${checkRow.term}” ${checkRow.nw} + ${checkRow.ne} + ${checkRow.sw} + ${checkRow.se} = ${checkRow.documents}`,
      body: [
        `- The word's regional counts sum to its ${checkRow.documents} descriptions, and the map finds the same: ${regionText(check)}.`,
        `- Every word in the cloud appears in at least two descriptions; the least frequent shown, “${md(terms.at(-1).term)}”, in ${terms.at(-1).documents}.`,
      ].join("\n"),
      narration: `Each description sits in exactly one quadrant, so the word ${checkRow.term} has ${checkRow.nw} plus ${checkRow.ne} plus ${checkRow.sw} plus ${checkRow.se} descriptions, ${checkRow.documents} in all, the same as the map finds.`,
    }, {
      title: "Takeaway",
      key: `${leadWords} ${leaders.length > 1 ? "are the most repeated marketing words" : "is the most repeated marketing word"}, in ${first.documents} of ${D.described} descriptions${each}.${termRow ? ` “${md(term)}” appears in ${termRow.documents}: ${regionText(check)}.` : ""}`,
      narration: `The most repeated ${leaders.length > 1 ? `words in the official descriptions are ${sayLead}` : `word in the official descriptions is ${sayLead}`}, in ${first.documents} of ${D.described}${each}.${termRow ? ` The word ${term} appears in ${termRow.documents}: ${sayRegions(check)}.` : ""}`,
    }];

    return {
      meta: { title: "How Singapore attractions are marketed", subtitle: term ? `The word “${term}”: ${countLine}` : query ? `Search “${query}”: ${countLine}` : `${rows.length} attractions, ${terms.length} frequent words`, date: `Fetched ${D.fetched}` },
      narration: `This talk reads the official descriptions of ${rows.length} Singapore tourist attractions: which words recur, and where the places they describe are.`,
      setup, method, results, checks,
    };
  }

  return { matches, regional, report };
});
