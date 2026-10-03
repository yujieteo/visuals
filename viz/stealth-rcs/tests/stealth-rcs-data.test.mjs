// The dataset contract: the 8 arguments as specified, separate evidence types and results, unknown
// values kept unknown, model curves only from the cleared NASA source, in dB with no reference, and
// comparison modes that never allow an absolute or cross-aircraft comparison.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const D = JSON.parse(readFileSync(new URL("../raw.json", import.meta.url), "utf8"));
const here = (p) => new URL(`../${p}`, import.meta.url);
const TOULMIN = ["claim", "grounds", "warrant", "backing", "qualifier", "rebuttal"];

// The claims and results exactly as the specification gives them.
const EXPECTED = {
  "F117-1": ["The Air Force attributes reduced F-117 RCS to its faceted shape and coating.", "supported"],
  "F117-2": ["The NASA study compares measured and reconstructed responses from an F-117 model.", "supported"],
  "F22-1": ["GAO links internal F-22 stores to its low radar signature.", "supported"],
  "F22-2": ["GAO documents full-scale F-22 pole tests in its 1998 report.", "supported"],
  "F35-1": ["Lockheed Martin attributes F-35 stealth to aligned edges, embedded sensors, and internal weapons and fuel.", "supported"],
  "F35-2": ["The SigMA model retained its stealth signature after surface damage.", "cannot_verify"],
  "B2-1": ["The Air Force identifies the B-2's shape, composite materials, and coatings as contributors to low observability.", "supported"],
  "B2-2": ["GAO states that the early B-2 tests did not represent operational conditions or long-term wear and maintenance.", "supported"],
};

test("4 aircraft, 2 or 3 claims each, every claim with all 6 Toulmin components", () => {
  assert.deepEqual(D.aircraft.map((a) => a.id), ["F117", "F22", "F35", "B2"]);
  for (const a of D.aircraft) {
    const n = D.claims.filter((c) => c.aircraft_id === a.id).length;
    assert.ok(n >= 2 && n <= 3, `${a.id}: ${n} claims`);
  }
  for (const c of D.claims) for (const k of TOULMIN) assert.ok(c[k] && c[k].trim().length > 10, `${c.id} ${k}`);
});

test("claims and results match the specification; no absence of evidence is called a contradiction", () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), D.claims.map((c) => c.id).sort());
  for (const c of D.claims) {
    assert.equal(c.claim, EXPECTED[c.id][0], c.id);
    assert.equal(c.result, EXPECTED[c.id][1], c.id);
    assert.notEqual(c.result, "contradicted", c.id);
    assert.ok(c.assessed_scope && c.do_not_infer && c.conditions_not_stated, c.id);
    for (const s of c.sources) {
      const src = D.sources.find((x) => x.id === s.source_id);
      assert.ok(src && s.locator && s.quote, `${c.id}: source, locator and quotation`);
      assert.match(src.url, /^https:\/\//);
      assert.equal(src.access.date, "2026-10-03");
    }
  }
  assert.equal(D.aggregates.claims_by_result.supported, 7);
  assert.equal(D.aggregates.claims_by_result.cannot_verify, 1);
  assert.match(D.aggregates.note, /do not score stealth/);
});

test("evidence type, source origin and result stay separate fields", () => {
  const types = new Set(D.evidence_types.map((t) => t.id));
  for (const c of D.claims) {
    assert.ok(types.has(c.evidence_type));
    assert.ok(D.disclosure_levels.some((d) => d.id === c.disclosure));
  }
  // Test accounts without results say so.
  for (const id of ["F22-2", "F35-2", "B2-2"]) assert.equal(D.claims.find((c) => c.id === id).disclosure, "test_account_no_results", id);
  assert.equal(D.claims.find((c) => c.id === "F35-1").evidence_type, "manufacturer_claim");
});

test("unknown values are null with a reason, never zero or a guess", () => {
  const fields = ["frequency", "bandwidth", "aspect", "coordinates", "polarization_tx", "polarization_rx", "configuration", "geometry", "calibration", "experimental_uncertainty"];
  for (const c of D.conditions) {
    for (const f of fields) {
      assert.ok(f in c, `${c.id} ${f}`);
      assert.notEqual(c[f], 0, `${c.id} ${f}`);
      if (c[f] === null) assert.ok(c[`${f}_reason`] || c.reason, `${c.id} ${f} has a reason`);
    }
    // The source states one polarization at most; the page never invents a channel.
    assert.equal(c.polarization_tx, null, c.id);
    assert.equal(c.polarization_rx, null, c.id);
  }
});

test("F-35 article identities stay separate and the variant is not inferred", () => {
  const f35 = D.test_articles.filter((t) => t.aircraft_family === "F-35");
  assert.deepEqual(f35.map((t) => t.id).sort(), ["TA-F35-POFACETS", "TA-F35-SIGMA"]);
  for (const t of f35) assert.equal(t.variant, null);
  assert.equal(D.aircraft.find((a) => a.id === "F35").variant, null);
  assert.match(D.images.find((i) => i.id === "IMG-F35").caption_identity, /does not name the variant/);
});

test("curves come only from the cleared NASA source, in dB with the reference not stated", () => {
  const nasaRights = D.rights.find((r) => r.id === "R-NASA-CR-191378");
  assert.equal(nasaRights.notice, "Work of the US Gov. Public Use Permitted.");
  assert.equal(nasaRights.release_eligible, true);
  for (const r of D.rights.filter((x) => ["R-ETRI", "R-IEEE-POFACETS"].includes(x.id))) assert.equal(r.release_eligible, false, r.id);
  assert.equal(D.series.length, 6);
  for (const s of D.series) {
    assert.equal(s.source_id, "SRC-NASA-CR-191378");
    assert.equal(s.units, "Magnitude (dB)");
    assert.equal(s.reference, "Reference not stated");
    assert.equal(s.extraction.experimental_uncertainty, "Experimental uncertainty not stated");
  }
  const curveText = JSON.stringify([D.series, D.datasets]);
  assert.doesNotMatch(curveText, /dBsm|m²|m\^2/, "no conversion to absolute RCS");
  for (const n of D.other_numerical_evidence) assert.equal(n.reproduction, "not_cleared");
});

test("samples stay inside the figure's displayed range, with gaps kept and no invented points", () => {
  for (const s of D.series) {
    const pts = s.segments.flat();
    for (const [x, y, e] of pts) {
      assert.ok(x >= 175 && x <= 185, `${s.id} x ${x}`);
      assert.ok(y > -70 && y < -10, `${s.id} y ${y}`);
      assert.ok(e > 0 && e < 10, `${s.id} error ${e}`);
      assert.equal(Math.round(y * 10) / 10, y, "values carry 0.1 dB at most");
    }
    for (const g of s.gaps) {
      assert.ok(g.from <= g.to && g.reason, `${s.id} gap`);
      if (s.trace_role === "reconstructed") assert.ok(!pts.some(([x]) => x >= g.from && x <= g.to), `${s.id}: no sample inside a gap`);
    }
    if (s.trace_role === "reconstructed") {
      // Fixed sample positions every 0.02 degrees: a gap is never bridged inside one segment.
      for (const seg of s.segments) for (let i = 1; i < seg.length; i++) assert.ok(Math.abs(seg[i][0] - seg[i - 1][0] - 0.02) < 1e-6, `${s.id} at ${seg[i][0]}`);
    }
  }
  // Figure 5.12 clips the solid line at the -70 dB frame: that is a gap, not a value.
  const s512 = D.series.find((s) => s.id === "S-FIG-5-12-RECONSTRUCTED");
  assert.ok(s512.gaps.some((g) => g.from <= 182.28 && g.to >= 182.28 && /frame/.test(g.reason)));
});

test("compatibility: no absolute comparison; method and condition comparisons only inside the test record", () => {
  const pair = (a, b) => D.compatibility.pairs.find((p) => p.a === a && p.b === b);
  for (const p of D.compatibility.pairs) {
    assert.equal(p.absolute, false, `${p.a} ${p.b}`);
    assert.ok(p.unknown_critical_fields.includes("calibration") && p.unknown_critical_fields.includes("reference"));
  }
  assert.equal(pair("S-FIG-5-11-ORIGINAL", "S-FIG-5-11-RECONSTRUCTED").mode, "method");
  assert.equal(pair("S-FIG-5-11-ORIGINAL", "S-FIG-5-10-ORIGINAL").mode, "condition");
  assert.deepEqual(pair("S-FIG-5-11-ORIGINAL", "S-FIG-5-10-ORIGINAL").changed_fields, ["frequency"]);
  assert.deepEqual(D.aggregates.datasets_by_aircraft, { F117: ["NASA-F117-MODEL"], F22: [], F35: [], B2: [] });
  for (const a of ["F22", "F35", "B2"]) assert.ok(D.no_curve_reasons[a], a);
  assert.deepEqual(D.aggregates.condition_values.frequency.map((f) => f.ghz), [4, 10, 17]);
  assert.deepEqual(D.aggregates.condition_values.polarization.available, []);
});

test("photographs: verified DVIDS records, credit, rights, alternative text and local derivatives", () => {
  assert.equal(D.images.length, 4);
  for (const im of D.images) {
    assert.match(im.photo_id, /^\d+$/);
    assert.match(im.virin, /^\d{6}-[A-Z]-[A-Z0-9]+-\d+$/);
    assert.match(im.source_url, /^https:\/\/www\.dvidshub\.net\/image\/\d+/);
    assert.equal(im.rights_id, "R-DVIDS-PD");
    assert.ok(im.credit && im.caption_identity && im.alt.length > 60, im.id);
    for (const w of [480, 960, 1440]) assert.ok(existsSync(here(`img/${im.aircraft_id.toLowerCase()}-${w}.jpg`)), `${im.id} ${w}`);
  }
  assert.match(D.images.find((i) => i.id === "IMG-F117").date_note, /June 6, 1998.*06\.05\.1998/);
  assert.equal(D.rights.find((r) => r.id === "R-DVIDS-PD").disclaimer, "The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.");
  const visual = JSON.parse(readFileSync(here("visual.json"), "utf8"));
  for (const a of visual.assets) assert.ok(existsSync(here(a)), a);
});
