/* The stealth RCS evidence as a beamdswitch report and as a Markdown record.
 *
 * report(D, view) turns the dataset and the page's current view into the plain-data report that the
 * standard template (beamdswitch.js, `Beamdswitch.deck`) writes as a narrated Markdown deck. Its frames
 * follow the order overview, the 4 aircraft groups, the selected view, then sources and credits, inside
 * the template's fixed sections: Set-up (overview), Method (assessment rules), Results (aircraft groups
 * and the selected view) and Checks and takeaway (sources, rights and credits).
 * markdown(D, view) writes the same frames as one Markdown record, without narration.
 * normalizeView(D, raw) checks a view from a URL or a JSON file and resets stale values with a notice.
 * Active filters never remove evidence from either export: every claim and source is always written.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RcsReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TOULMIN = ["claim", "grounds", "warrant", "backing", "qualifier", "rebuttal"];
  const LABEL = { claim: "Claim", grounds: "Grounds", warrant: "Warrant", backing: "Backing", qualifier: "Qualifier", rebuttal: "Rebuttal" };
  const MINUS = "−";

  /* ---------- lookups and formats shared with the page ---------- */
  function index(D) {
    const by = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
    return {
      aircraft: by(D.aircraft), claim: by(D.claims), source: by(D.sources), type: by(D.evidence_types), result: by(D.results),
      article: by(D.test_articles), condition: by(D.conditions), series: by(D.series), dataset: by(D.datasets), image: by(D.images),
      rights: by(D.rights), disclosure: by(D.disclosure_levels),
    };
  }
  /* Displayed magnitudes are rounded to 0.5 dB: finer digits are not supported by the printed figure. */
  const db = (v) => (Math.round(v * 2) / 2).toFixed(1).replace("-", MINUS);
  const deg = (x) => x.toFixed(2);
  const err = (e) => e.toFixed(1);
  const seriesFor = (D, figure, role) => D.series.find((s) => s.figure_id === figure && s.trace_role === role);
  const samplesOf = (s) => s.segments.flat();
  /* A series' samples ordered by x, then y: a dotted trace can have 2 samples at one x. */
  const ordered = (s) => samplesOf(s).slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const position = (s) => (s.trace_role === "reconstructed" ? "exact sample position" : "centre of a printed dot");

  /* The view's selected sample as { series, sample: [x, y, e], index }, or null. A sample is its index in ordered(series). */
  function selectedSample(D, view) {
    if (!view.sample) return null;
    const s = seriesFor(D, view.sample.figure, view.sample.role);
    if (!s || !Number.isInteger(view.sample.index)) return null;
    const hit = ordered(s)[view.sample.index];
    return hit ? { series: s, sample: hit, index: view.sample.index } : null;
  }

  /* The aircraft whose curve panel the view shows: the aircraft filter, else the selected claim's aircraft. */
  function plotAircraft(D, view) {
    if (view.aircraft !== "all") return view.aircraft;
    const c = D.claims.find((x) => x.id === view.claim);
    return c ? c.aircraft_id : "F117";
  }
  const hasCurve = (D, aircraftId) => (D.aggregates.datasets_by_aircraft[aircraftId] || []).length > 0;

  /* ---------- view checks ---------- */
  function defaults(D) {
    const v = JSON.parse(JSON.stringify(D.default_view));
    return { ...v, sample: null, dataset_version: D.dataset_version };
  }

  function normalizeView(D, raw) {
    const view = defaults(D), notices = [];
    if (!raw || typeof raw !== "object") return { view, notices };
    const I = index(D);
    const take = (key, ok, label) => {
      if (raw[key] === undefined || raw[key] === null || raw[key] === "") return;
      if (ok(raw[key])) view[key] = raw[key];
      else notices.push(`The value “${String(raw[key])}” for ${label} is not in this dataset. The page used the default.`);
    };
    take("aircraft", (v) => v === "all" || I.aircraft[v], "the aircraft");
    take("evidence", (v) => v === "all" || I.type[v], "the evidence filter");
    take("result", (v) => v === "all" || I.result[v], "the result filter");
    take("claim", (v) => I.claim[v], "the claim");
    take("dataset", (v) => I.dataset[v], "the dataset");
    const figures = D.datasets[0].figures.map((f) => f.id);
    take("frequency", (v) => figures.includes(v), "the frequency");
    take("compare", (v) => v === "none" || v === "condition", "the comparison");
    if (view.compare === "condition") {
      take("compare_frequency", (v) => figures.includes(v) && v !== view.frequency, "the second frequency");
      if (!view.compare_frequency) view.compare_frequency = figures.find((f) => f !== view.frequency);
    } else view.compare_frequency = null;
    if (raw.traces !== undefined) {
      const t = Array.isArray(raw.traces) ? raw.traces.filter((r) => r === "original" || r === "reconstructed") : [];
      if (t.length && t.length === (Array.isArray(raw.traces) ? raw.traces.length : -1)) view.traces = ["original", "reconstructed"].filter((r) => t.includes(r));
      else notices.push("The trace choice is not valid. The page shows both traces.");
    }
    if (raw.zoom !== undefined) {
      const z = raw.zoom;
      if (Array.isArray(z) && z.length === 2 && z.every((v) => typeof v === "number" && isFinite(v)) && z[0] >= 175 && z[1] <= 185 && z[1] - z[0] >= 0.5)
        view.zoom = [z[0], z[1]];
      else notices.push("The zoom bounds are not in the range 175° to 185°. The page shows the full range.");
    }
    if (raw.sample) {
      const s = raw.sample;
      const cand = { figure: s.figure, role: s.role, index: /^\d+$/.test(String(s.index)) ? Number(s.index) : NaN };
      const okFigure = cand.figure === view.frequency || (view.compare === "condition" && cand.figure === view.compare_frequency);
      if (okFigure && view.traces.includes(cand.role) && selectedSample(D, { sample: cand })) view.sample = cand;
      else notices.push("The selected sample is not in the curves shown. The page cleared the selection.");
    }
    if (raw.dataset_version && raw.dataset_version !== D.dataset_version)
      notices.push(`The saved view is from dataset version ${raw.dataset_version}. This page uses version ${D.dataset_version}.`);
    return { view, notices };
  }

  /* ---------- text helpers ---------- */
  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  const link = (title, url) => `[${md(title)}](${url})`;
  /* Narration is read aloud: symbols become words and markup characters are dropped. */
  const say = (s) => String(s ?? "")
    .replace(/(\d)\s?%/g, "$1 percent").replace(/&/g, " and ").replace(/×/g, " by ").replace(/±/g, "plus or minus ")
    .replace(/(\d)°/g, "$1 degrees").replace(/φ/g, "azimuth").replace(/θ/g, "elevation").replace(/(\d)\s?–\s?(\d)/g, "$1 to $2")
    .replace(/[−–](?=\d)/g, "minus ").replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]≈⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, " ").replace(/\s+/g, " ").trim();
  const sentence = (s) => (/[.!?]$/.test(s) ? s : s + ".");

  /* ---------- frames ---------- */
  function overviewFrame(D, I) {
    const rows = D.aircraft.map((a) => {
      const n = D.claims.filter((c) => c.aircraft_id === a.id).length;
      return `| ${md(a.full_name)} | ${n} | ${md(a.summary)} |`;
    });
    return {
      title: "Overview: 4 aircraft, 8 sourced claims, no ranking",
      body: [md(D.purpose), "", ...D.scope_notes.map((s) => `- ${md(s)}`), "", "| Aircraft | Claims | Summary |", "| --- | ---: | --- |", ...rows].join("\n"),
      notes: [`Dataset version ${D.dataset_version}. Assessment date ${D.assessment_date}.`, "Filters on the page do not remove any evidence from this export.", md(D.search_limit)].join("\n"),
      narration: `${say(D.purpose)} ${D.scope_notes.map(say).join(" ")} The page shows 2 claims for each of the 4 aircraft.`,
    };
  }

  function rulesFrame(D) {
    return {
      title: "How the page assesses a claim",
      body: [
        "**Evidence types**", "",
        ...D.evidence_types.map((t) => `- ${md(t.label)}: ${md(t.rule)}`), "",
        "**Results**", "",
        ...D.results.map((r) => `- ${md(r.symbol)} ${md(r.label)}: ${md(r.rule)}`), "",
        `- ${md(D.other_labels.not_comparable)}: a comparison failed. ${md(D.other_labels.not_stated)}: the source does not give the field.`,
      ].join("\n"),
      notes: [md(D.compatibility.rule), "A supported design account does not establish its measured benefit. A test account does not establish its undisclosed numeric result."].join("\n"),
      narration: "The page keeps the evidence type, the source and the result apart. A result is supported within stated limits, contradicted by comparable evidence, or cannot be verified from public evidence. A supported design account does not establish its measured benefit.",
    };
  }

  function aircraftFrame(D, I, a) {
    const img = I.image[a.image_id];
    const curve = hasCurve(D, a.id) ? `- Curves: ${md(D.datasets[0].title)}. ${md(D.datasets[0].transfer_limit)}` : `- Curves: none. ${md(D.no_curve_reasons[a.id])}`;
    return {
      title: `${a.full_name}: design features and their evidence limits`,
      body: [`### ${md(a.full_name)}`, "", md(a.summary), "",
        ...a.design_features.map((f) => `- ${md(f.feature)}: ${md(f.evidence_limit)}`), curve, "",
        `Photograph: ${md(img.credit)}. DVIDS Photo ID ${img.photo_id}, VIRIN ${img.virin}. ${link("Image record", img.source_url)}.`].join("\n"),
      notes: [`Variant: ${md(a.variant || "Not stated")}. ${md(a.variant_reason || "")}`.trim(), md(img.caption_identity), md(img.date_note)].join("\n"),
      narration: `${say(a.full_name)}. ${say(a.summary)} ${a.design_features.map((f) => say(`${f.feature}. ${f.evidence_limit}`)).join(" ")}`,
    };
  }

  function claimFrame(D, I, c) {
    const a = I.aircraft[c.aircraft_id], r = I.result[c.result];
    const parts = TOULMIN.map((k) => `**${LABEL[k]}:** ${md(c[k])}`);
    return {
      title: `${a.name} ${c.id}: ${c.title}`,
      body: [`### ${md(a.full_name)}`, "", parts[0], "", "**Qualifier:** " + md(c.qualifier), "", ". . .", "",
        ...parts.slice(1, 4).flatMap((p) => [p, ""]), parts[5], "",
        `**Result:** ${md(r.symbol)} ${md(r.label)}. ${md(c.do_not_infer)}`, "",
        `**Evidence type:** ${md(I.type[c.evidence_type].label)}. ${md(I.disclosure[c.disclosure].label)}.`, "",
        `**Conditions not stated:** ${md(c.conditions_not_stated)}`].join("\n"),
      notes: [`Result: ${r.label}.`, `Assessed scope: ${md(c.assessed_scope)}`,
        ...c.sources.map((s) => `Source: ${md(I.source[s.source_id].title)}. ${sentence(md(s.locator))} ${I.source[s.source_id].url}`),
        ...c.sources.map((s) => `Quotation: “${md(s.quote)}”`)].join("\n"),
      narration: TOULMIN.map((k) => `${LABEL[k]}. ${sentence(say(c[k]))}`).join(" ") + ` Result. ${say(r.label)}. ${say(c.do_not_infer)}`,
    };
  }

  function visibleSeries(D, view) {
    const figs = [view.frequency, ...(view.compare === "condition" && view.compare_frequency ? [view.compare_frequency] : [])];
    return figs.flatMap((f) => view.traces.map((r) => seriesFor(D, f, r))).filter(Boolean);
  }

  /* The curve that the sample table lists: the selected sample's series, else the first series shown. */
  function tableSeries(D, view) {
    const sel = selectedSample(D, view);
    return sel ? sel.series : visibleSeries(D, view)[0] || null;
  }

  function inZoom(view, p) {
    return p[0] >= view.zoom[0] && p[0] <= view.zoom[1];
  }

  function selectedViewFrames(D, I, view) {
    const filters = `Aircraft: ${view.aircraft === "all" ? "all" : I.aircraft[view.aircraft].name}. Evidence type: ${view.evidence === "all" ? "all" : I.type[view.evidence].label}. Result: ${view.result === "all" ? "all" : I.result[view.result].label}.`;
    const claim = I.claim[view.claim];
    const pa = plotAircraft(D, view);
    const head = [`- Filters: ${md(filters)}`, `- Selected claim: ${md(claim.id)}, ${md(claim.claim)}`];
    if (!hasCurve(D, pa)) {
      const recs = D.other_numerical_evidence.filter((n) => n.aircraft_id === pa);
      return [{
        title: `Selected view: no eligible curve for the ${I.aircraft[pa].name}`,
        body: [...head, `- ${md(D.no_curve_reasons[pa])}`, ...recs.map((n) => `- Record not reproduced: ${link(I.source[n.source_id].title, I.source[n.source_id].url)}, ${md(n.locator)}. ${md(n.stated_conditions)} ${md(n.reason)}`)].join("\n"),
        notes: md(D.search_limit),
        narration: `The selected view is the ${say(I.aircraft[pa].name)}. ${say(D.no_curve_reasons[pa])} The page does not make a replacement curve.`,
      }];
    }
    const ds = D.datasets[0], shown = visibleSeries(D, view);
    const cond = (s) => I.condition[s.conditions_id];
    const mode = view.compare === "condition" ? `Condition comparison: the changed condition is the frequency, ${cond(seriesFor(D, view.frequency, "original")).frequency} and ${cond(seriesFor(D, view.compare_frequency, "original")).frequency}.`
      : view.traces.length === 2 ? "Method comparison: original and reconstructed traces from the same figure and test record." : "One trace.";
    const sel = selectedSample(D, view);
    const readout = sel ? `${sel.series.role_label}, figure ${sel.series.figure}: φ = ${deg(sel.sample[0])}° (${position(sel.series)}), magnitude ${db(sel.sample[1])} dB ± ${err(sel.sample[2])} dB extraction error. Approximate value read from the printed figure, not a measurement value.` : "No sample selected.";
    const viewFrame = {
      title: `Selected view: ${ds.title}`,
      body: [...head,
        `- Test article: ${md(I.article[ds.article_id].kind)}, ${md(I.article[ds.article_id].material)}. ${md(I.article[ds.article_id].size)}`,
        `- Evidence type: ${md(I.type[ds.evidence_type].label)}. Units: ${md(ds.units)}. ${md(ds.reference)}. Data method: ${md(ds.data_method)}`,
        `- Curves shown: ${shown.map((s) => `${md(s.role_label)}, figure ${s.figure} (${md(cond(s).frequency)})`).join("; ")}`,
        `- ${md(mode)} Absolute comparison: ${md(D.other_labels.not_comparable)}. Polarization, geometry and calibration are not stated.`,
        `- Zoom: ${deg(view.zoom[0])}° to ${deg(view.zoom[1])}°.`,
        `- Selected sample: ${md(readout)}`,
        `- Angle convention: ${md(ds.angle_convention)}`].join("\n"),
      notes: [md(ds.transfer_limit), "Experimental uncertainty not stated.", `Original figures: ${ds.figures.map((f) => f.original_url).join(" ")}`].join("\n"),
      narration: `The selected view shows the NASA model curves. ${say(mode)} ${sel ? `The selected sample is at azimuth ${deg(sel.sample[0])} degrees, with a magnitude of ${say(db(sel.sample[1]))} decibels, plus or minus ${err(sel.sample[2])} decibels of extraction error.` : "No sample is selected."} The reference of the decibel values is not stated. These curves do not give the RCS of a service aircraft.`,
    };
    const summary = {
      title: "Numerical summary of the curves shown",
      body: ["| Curve | Figure | Samples in zoom | Gaps | Highest | Lowest | Median extraction error |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
        ...shown.map((s) => {
          const pts = samplesOf(s).filter((p) => inZoom(view, p));
          const ys = pts.map((p) => p[1]);
          const gaps = s.gaps.filter((g) => g.to >= view.zoom[0] && g.from <= view.zoom[1]).length;
          return `| ${md(s.role_label)} | ${s.figure} (${md(cond(s).frequency)}) | ${pts.length} | ${gaps} | ${ys.length ? db(Math.max(...ys)) + " dB" : "none"} | ${ys.length ? db(Math.min(...ys)) + " dB" : "none"} | ± ${err(s.extraction.error_median_db)} dB |`;
        })].join("\n"),
      notes: ["Values in dB with the reference not stated. Values are rounded to 0.5 dB.", "Extraction error is not experimental uncertainty. Experimental uncertainty not stated.", "Where a trace meets the frame, the figure does not show lower values: that part is a gap."].join("\n"),
      narration: "This table gives the number of extracted samples, the gaps, and the highest and lowest values of each curve in the zoom range. The values are approximate.",
    };
    const ts = tableSeries(D, view);
    const rows = [];
    const pts = ordered(ts).filter((p) => inZoom(view, p));
    const gaps = ts.gaps.filter((g) => g.to >= view.zoom[0] && g.from <= view.zoom[1]);
    const events = [...pts.map((p) => ({ x: p[0], row: `| ${deg(p[0])} | ${db(p[1])} | ± ${err(p[2])} | Extracted |` })),
      ...gaps.map((g) => ({ x: g.from, row: `| ${deg(g.from)} to ${deg(g.to)} | No value | | Gap: ${md(g.reason)} |` }))].sort((a, b) => a.x - b.x);
    for (const e of events) rows.push(e.row);
    const table = {
      title: `Sample table: ${ts.role_label.split(" (")[0].toLowerCase()} trace, figure ${ts.figure}`,
      body: [`${md(ts.role_label)}. ${md(cond(ts).frequency)}. φ in degrees, magnitude in dB with the reference not stated.`, "",
        "| φ (°) | Magnitude (dB) | Extraction error (dB) | Status |", "| ---: | ---: | ---: | --- |", ...rows].join("\n"),
      notes: [`Sampling: ${md(ts.extraction.method)}.`, md(ts.extraction.status), `Crop: ${ts.extraction.crop} (SHA-256 ${ts.extraction.crop_sha256}).`].join("\n"),
      narration: `This table lists ${pts.length} extracted samples of the ${say(ts.role_label.split(" (")[0].toLowerCase())} trace in figure ${ts.figure}, with ${gaps.length} gaps. Each value is approximate and comes from the printed figure.`,
    };
    return [viewFrame, summary, table];
  }

  function sourcesFrame(D) {
    return {
      title: "Sources",
      body: D.sources.map((s, i) => {
        let line = `${i + 1}. ${md(s.title)}. ${md(s.author)}. ${md(s.origin)}. Date: ${md(s.date || "not stated")}. <${s.url}>. Accessed ${s.access.date}: ${md(s.access.direct)}.`;
        if (s.access.checked_copy) line += ` Checked copy: <${s.access.checked_copy}>.`;
        if (s.file_hash) line += ` File hash: ${md(s.file_hash)}.`;
        return line;
      }).join("\n"),
      notes: "The page checked each source on the assessment date. Where a site refused automated requests, the page checked an archived copy and names it.",
      narration: `The deck uses ${D.sources.length} sources. Each source has its full address, its date, its locator and the date of the check.`,
    };
  }

  function rightsFrame(D, I) {
    return {
      title: "Rights and image credits",
      body: [...D.images.map((im) => `- ${md(I.aircraft[im.aircraft_id].name)} photograph: ${md(im.credit)}. DVIDS Photo ID ${im.photo_id}, VIRIN ${im.virin}. PUBLIC DOMAIN. <${im.source_url}>`),
        "", ...D.rights.map((r) => `- ${md(r.asset)}: ${md(r.notice)} Permitted use: ${sentence(md(r.permitted_uses))} Restrictions: ${md(r.restrictions)}`),
        "", `> ${md(I.rights["R-DVIDS-PD"].disclaimer)}`,
        "", ...D.other_numerical_evidence.map((n) => `- Not reproduced: ${link(I.source[n.source_id].title, I.source[n.source_id].url)}. ${md(n.reason)}`)].join("\n"),
      notes: "This export has no images. It names the photographs and their credits. It copies no ETRI or IEEE curve.",
      narration: "The photographs are public domain images from DVIDS, with credit to each photographer. Their use does not imply endorsement by the Department of War. The NASA figures are a work of the United States government. The ETRI and IEEE curves are not reproduced, because their use is not cleared.",
    };
  }

  function takeawayFrame() {
    return {
      title: "Takeaway: support stays within each source's limits",
      body: "- The public sources support the design accounts and the NASA model comparison within their stated limits.\n- One manufacturer test claim cannot be verified from public evidence.\n- No source here gives the RCS of a service aircraft. The page does not rank the aircraft.",
      key: "Public evidence supports design accounts and one model comparison. It gives no RCS value for a service aircraft and no ranking.",
      notes: "Do not strengthen any claim beyond its qualifier.",
      narration: "The public sources support the design accounts and the NASA model comparison within their limits. One manufacturer test claim cannot be verified from public evidence. No source here gives the RCS of a service aircraft, and the page does not rank the aircraft.",
    };
  }

  function report(D, view) {
    const I = index(D);
    const v = view || defaults(D);
    const groups = D.aircraft.flatMap((a) => [aircraftFrame(D, I, a), ...D.claims.filter((c) => c.aircraft_id === a.id).map((c) => claimFrame(D, I, c))]);
    return {
      meta: { title: D.title, subtitle: D.subtitle, date: D.assessment_date },
      notes: `Dataset version ${D.dataset_version}. This deck holds every claim and source, whatever the filters on the page.`,
      narration: "This deck shows public evidence about the radar cross section of 4 stealth aircraft. It gives each claim with its evidence and the limits of that evidence.",
      setup: [overviewFrame(D, I)],
      method: [rulesFrame(D)],
      results: [...groups, ...selectedViewFrames(D, I, v)],
      checks: [sourcesFrame(D), rightsFrame(D, I), takeawayFrame()],
    };
  }

  /* The same frames as one Markdown record: sections as ##, frames as ###, notes kept, no narration. */
  function markdown(D, view) {
    const r = report(D, view);
    const out = [`# ${r.meta.title}`, "", `${r.meta.subtitle}. Assessment date ${r.meta.date}. ${r.notes}`, ""];
    for (const [key, title] of [["setup", "Overview"], ["method", "Assessment rules"], ["results", "Aircraft groups and the selected view"], ["checks", "Sources and credits"]]) {
      out.push(`## ${title}`, "");
      for (const f of r[key]) {
        out.push(`### ${f.title}`, "", f.body.replace(/^### /gm, "#### ").replace(/^\. \. \.$/gm, "").replace(/\n{3,}/g, "\n\n"), "");
        if (f.key) out.push(`**Key point:** ${f.key}`, "");
        if (f.notes) out.push("**Notes:**", "", ...f.notes.split("\n").map((l) => `- ${l}`), "");
      }
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  return { TOULMIN, index, db, deg, err, seriesFor, samplesOf, ordered, position, selectedSample, plotAircraft, hasCurve, defaults, normalizeView, visibleSeries, tableSeries, report, markdown, say, md, sentence };
});
