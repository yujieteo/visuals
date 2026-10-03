#!/usr/bin/env python3
"""Build the stealth RCS evidence dataset and embed it in index.html.

Inputs, checked in next to this file:
  data/evidence.json          aircraft, the Toulmin arguments, sources, test articles, conditions, rights, images
  extract/figures/figures.json  the NASA figure crops and where they came from (extract/fetch_figures.py)
  extract/traces.json         the traces extracted from those crops (extract/digitize.py)
  beamdswitch.js              the site's standard beamdswitch report template, unchanged
  report.js                   the page's evidence as a beamdswitch report

Outputs:
  raw.json    the one versioned dataset (published as data.json) that the page, print view and exports share
  index.html  its <script id="dataset">, <script id="beamdswitch"> and <script id="report"> blocks and the
              static record between <!-- static-record --> and <!-- /static-record --> are rewritten in place

    python3 build.py            # regenerate raw.json and index.html
    python3 build.py --verify   # check both are fresh without writing

Every unknown value is null with a reason beside it; nothing is converted to dBsm or m².
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = {"build": "build.py", "extraction": "extract/digitize.py"}
TOULMIN = ["claim", "grounds", "warrant", "backing", "qualifier", "rebuttal"]
CONDITION_FIELDS = ["frequency", "bandwidth", "aspect", "coordinates", "polarization_tx", "polarization_rx",
                    "configuration", "geometry", "calibration", "experimental_uncertainty"]
# The fields of a series' compatibility key. Each must be known and equal for an absolute comparison.
KEY_FIELDS = ["article_id", "configuration", "geometry", "polarization_tx", "polarization_rx", "coordinates",
              "units", "reference", "calibration", "frequency"]
CRITICAL = ["polarization_tx", "polarization_rx", "geometry", "calibration", "reference"]
UNITS = "Magnitude (dB)"
REFERENCE = "Reference not stated"
DATASET_ID = "NASA-F117-MODEL"
ROLE_LABEL = {"original": "Original (measured data, dotted line in the figure)",
              "reconstructed": "Reconstructed (method output, solid line in the figure)"}


def fail(message):
    sys.exit(f"build.py: {message}")


def load(path):
    return json.loads((HERE / path).read_text(encoding="utf-8"))


def check_evidence(ev):
    ids = lambda key: {x["id"] for x in ev[key]}
    aircraft, sources, articles, conditions = ids("aircraft"), ids("sources"), ids("test_articles"), ids("conditions")
    results, types = ids("results"), ids("evidence_types")
    per_aircraft = {a: 0 for a in aircraft}
    for c in ev["claims"]:
        for part in TOULMIN:
            if not str(c.get(part) or "").strip():
                fail(f"{c['id']}: the {part} is empty")
        if c["result"] not in results or c["evidence_type"] not in types:
            fail(f"{c['id']}: unknown result or evidence type")
        if c["aircraft_id"] not in aircraft or c["conditions_id"] not in conditions:
            fail(f"{c['id']}: unknown aircraft or conditions")
        if c["test_article_id"] is not None and c["test_article_id"] not in articles:
            fail(f"{c['id']}: unknown test article")
        if not c["sources"] or any(s["source_id"] not in sources or not s["locator"] for s in c["sources"]):
            fail(f"{c['id']}: every source needs a known id and a locator")
        per_aircraft[c["aircraft_id"]] += 1
    for a, n in per_aircraft.items():
        if not 2 <= n <= 3:
            fail(f"{a}: {n} claims; the page shows 2 or 3 for each aircraft")
    # Unknown values are null with a reason, never zero or a guess.
    for cond in ev["conditions"]:
        for f in CONDITION_FIELDS:
            if f not in cond:
                fail(f"{cond['id']}: no {f} field")
        if any(cond[f] is None for f in CONDITION_FIELDS) and not cond.get("reason"):
            fail(f"{cond['id']}: null fields need a reason")
    for rec in ev["test_articles"] + ev["aircraft"]:
        for k, v in rec.items():
            if v is None and not rec.get(f"{k}_reason") and k not in ("variant_locator",):
                fail(f"{rec['id']}: {k} is null without a {k}_reason")


def series_from_traces(ev, traces, figures):
    fig_meta = {f["id"]: f for f in figures["figures"]}
    common = ev["figure_condition_common"]
    conds, series = [], []
    for fig in traces["figures"]:
        fc = ev["figure_conditions"][fig["id"]]
        cond = {"id": fc["id"], "label": fc["label"], "figure_id": fig["id"], "frequency": fc["frequency"], "frequency_ghz": fc["frequency_ghz"],
                **{k: common[k] for k in common}}
        conds.append(cond)
        meta = fig_meta[fig["id"]]
        for tr in fig["traces"]:
            role = tr["role"]
            if role == "reconstructed":
                segments = []
                current, last_x = [], None
                for s in tr["samples"]:
                    if last_x is not None and round(s[0] - last_x, 4) > 0.0201:
                        segments.append(current)
                        current = []
                    current.append(s)
                    last_x = s[0]
                if current:
                    segments.append(current)
            else:
                segments = tr["segments"]
            xs = [s[0] for seg in segments for s in seg]
            ys = [s[1] for seg in segments for s in seg]
            errs = sorted(s[2] for seg in segments for s in seg)
            series.append({
                "id": f"S-{fig['id'].upper()}-{role.upper()}",
                "dataset_id": DATASET_ID,
                "article_id": "TA-NASA-F117-MODEL",
                "source_id": "SRC-NASA-CR-191378",
                "figure": fig["figure"],
                "figure_id": fig["id"],
                "caption": meta["caption"],
                "locator": f"Figure {fig['figure']}, printed page {meta['printed_page']} (PDF page {meta['pdf_page']}), lower panel",
                "trace_role": role,
                "role_label": ROLE_LABEL[role],
                "source_style": tr["source_style"],
                "units": UNITS,
                "units_source": "The ordinate label says “MAGNITUDE IN DB”.",
                "reference": REFERENCE,
                "conditions_id": fc["id"],
                "frequency_ghz": fc["frequency_ghz"],
                "sample_format": ["azimuth_deg", "magnitude_db", "extraction_error_db"],
                "segments": segments,
                "gaps": tr["gaps"],
                "bounds": {"x": [min(xs), max(xs)], "y": [min(ys), max(ys)], "samples": len(xs), "segments": len(segments)},
                "extraction": {
                    "method": tr["sampling"],
                    "status": "Approximate values read from a printed figure. Not measurement values.",
                    "error_median_db": errs[len(errs) // 2],
                    "error_max_db": errs[-1],
                    "error_budget": fig["error_budget"],
                    "calibration": fig["calibration"],
                    "excluded": fig["excluded"],
                    "crop": f"extract/figures/{fig['crop_file']}",
                    "crop_sha256": fig["crop_sha256"],
                    "page_scan": meta["page_scan"],
                    "crop_box_in_scan": meta["crop_box_in_scan"],
                    "review_overlay": f"extract/{tr['review_overlay']}",
                    "tool": traces["tool"],
                    "crop_tool": figures["tool"],
                    "experimental_uncertainty": "Experimental uncertainty not stated",
                    "note": "Extraction error describes how well the printed line is read. It is not a bound on the RCS of a model or an aircraft.",
                },
            })
    return conds, series


def key_of(s, cond):
    return {"article_id": s["article_id"], "configuration": cond["configuration"], "geometry": cond["geometry"],
            "polarization_tx": cond["polarization_tx"], "polarization_rx": cond["polarization_rx"],
            "coordinates": cond["coordinates"], "units": s["units"],
            "reference": None if s["reference"] == REFERENCE else s["reference"],
            "calibration": cond["calibration"], "frequency": cond["frequency"]}


def compatibility(a, b, ca, cb):
    """How two series may be compared: absolute, method, condition, or not comparable, with reasons."""
    ka, kb = key_of(a, ca), key_of(b, cb)
    unknown = sorted({f for f in CRITICAL if ka[f] is None or kb[f] is None})
    differ = [f for f in KEY_FIELDS if ka[f] != kb[f] and not (ka[f] is None and kb[f] is None)]
    absolute = not unknown and not differ
    same_record = a["source_id"] == b["source_id"] and a["article_id"] == b["article_id"] and a["dataset_id"] == b["dataset_id"]
    if a["id"] == b["id"]:
        mode = "same"
    elif same_record and a["figure_id"] == b["figure_id"] and a["trace_role"] != b["trace_role"]:
        mode = "method"
    elif same_record and a["trace_role"] == b["trace_role"] and differ == ["frequency"]:
        mode = "condition"
    elif same_record and differ == ["frequency"]:
        mode = "condition"
    else:
        mode = "not_comparable"
    return {"a": a["id"], "b": b["id"], "mode": mode, "absolute": absolute,
            "unknown_critical_fields": unknown, "changed_fields": differ, "shared_panel": mode in ("same", "method", "condition")}


def aggregates(ev, series, conds):
    claims = ev["claims"]
    count = lambda key, value: sum(1 for c in claims if c[key] == value)
    return {
        "note": "Counts describe evidence records. They do not score stealth.",
        "claims_by_aircraft": {a["id"]: count("aircraft_id", a["id"]) for a in ev["aircraft"]},
        "claims_by_evidence_type": {t["id"]: count("evidence_type", t["id"]) for t in ev["evidence_types"]},
        "claims_by_result": {r["id"]: count("result", r["id"]) for r in ev["results"]},
        "condition_values": {
            "frequency": [{"id": c["figure_id"], "label": c["frequency"], "ghz": c["frequency_ghz"]} for c in sorted(conds, key=lambda c: c["frequency_ghz"])],
            "polarization": {"available": [], "label": "Not stated", "reason": "The source does not state the transmit or receive polarization, so the page has no polarization choice."},
            "fixed_aspect": {"available": [], "label": "Not applicable", "reason": "Each figure is an azimuth cut at one frequency. No figure holds the aspect fixed."},
        },
        "datasets_by_aircraft": {a["id"]: ([DATASET_ID] if a["id"] == "F117" else []) for a in ev["aircraft"]},
    }


def build():
    ev = load("data/evidence.json")
    traces = load("extract/traces.json")
    figures = load("extract/figures/figures.json")
    check_evidence(ev)
    conds, series = series_from_traces(ev, traces, figures)
    cond_by_id = {c["id"]: c for c in conds}
    nasa = next(s for s in ev["sources"] if s["id"] == "SRC-NASA-CR-191378")
    pairs = [compatibility(a, b, cond_by_id[a["conditions_id"]], cond_by_id[b["conditions_id"]]) for a in series for b in series]
    figure_records = [{"id": f["id"], "figure": f["figure"], "frequency_ghz": f["frequency_ghz"], "caption": f["caption"],
                       "pdf_page": f["pdf_page"], "printed_page": f["printed_page"], "crop": f"extract/figures/{f['crop_file']}",
                       "original_url": f"{nasa['pdf_url']}#page={f['pdf_page']}"} for f in figures["figures"]]
    dataset = {
        "id": DATASET_ID, "aircraft_id": "F117", "title": "NASA F-117 model: azimuth response, figures 5.10–5.12",
        "source_id": "SRC-NASA-CR-191378", "article_id": "TA-NASA-F117-MODEL", "evidence_type": "physical_model",
        "units": UNITS, "reference": REFERENCE, "rights_id": "R-NASA-CR-191378",
        "data_method": "Approximate values extracted from the printed figures (extract/digitize.py). No raw numeric data was found.",
        "angle_convention": "φ = 180° when the nose points toward the radar (section 5.1). The source does not state the rotation sense.",
        "figures": figure_records, "series": [s["id"] for s in series], "default_figure": "fig-5-11",
        "transfer_limit": "These curves describe one aluminum model in one test record. They do not give the RCS of a service F-117.",
    }
    out = {k: ev[k] for k in ("schema_version", "dataset_version", "title", "subtitle", "assessment_date", "purpose", "scope_notes",
                              "evidence_types", "results", "other_labels", "disclosure_levels", "aircraft", "claims",
                              "other_numerical_evidence", "no_curve_reasons", "search_limit", "sources", "test_articles", "rights",
                              "images", "image_derivatives", "outlines", "default_view")}
    out["visual"] = "stealth-rcs"
    out["conditions"] = ev["conditions"] + conds
    out["datasets"] = [dataset]
    out["series"] = series
    out["compatibility"] = {"key_fields": KEY_FIELDS, "critical_fields": CRITICAL, "pairs": pairs,
                            "rule": "An absolute comparison needs the same known value in every key field. An unknown critical field blocks it. Different aircraft variants do not share a key."}
    out["aggregates"] = aggregates(ev, series, conds)
    out["view_schema"] = {"fields": ["aircraft", "evidence", "result", "claim", "dataset", "frequency", "compare", "compare_frequency", "traces", "zoom", "sample", "dataset_version"],
                          "url_keys": {"aircraft": "a", "evidence": "ev", "result": "res", "claim": "c", "dataset": "ds", "frequency": "f", "compare": "cmp", "compare_frequency": "cf", "traces": "tr", "zoom": "z", "sample": "s"}}
    return out


# ---------- static record: what the page shows without JavaScript, and in print ----------

def esc(s):
    return html.escape(str(s), quote=True)


def stop(s):
    s = str(s)
    return s if s.endswith((".", "!", "?")) else s + "."


def static_record(d):
    src = {s["id"]: s for s in d["sources"]}
    res = {r["id"]: r for r in d["results"]}
    typ = {t["id"]: t for t in d["evidence_types"]}
    air = {a["id"]: a for a in d["aircraft"]}
    out = ['<section id="static-record" class="static-record" aria-labelledby="static-record-h">',
           '<h2 id="static-record-h">All arguments and sources</h2>',
           f'<p class="muted">Dataset version {esc(stop(d["dataset_version"]))} Assessment date {esc(stop(d["assessment_date"]))}</p>']
    for a in d["aircraft"]:
        out.append(f'<h3>{esc(a["full_name"])}</h3>')
        for c in (c for c in d["claims"] if c["aircraft_id"] == a["id"]):
            r = res[c["result"]]
            out.append(f'<article class="static-claim"><h4>{esc(c["id"])}: {esc(c["title"])}</h4><dl>')
            for part in TOULMIN:
                out.append(f'<dt>{part.capitalize()}</dt><dd>{esc(c[part])}</dd>')
            out.append(f'<dt>Result</dt><dd>{esc(r["symbol"])} {esc(stop(r["label"]))} {esc(c["do_not_infer"])}</dd>')
            out.append(f'<dt>Evidence type</dt><dd>{esc(typ[c["evidence_type"]]["label"])}</dd>')
            out.append(f'<dt>Assessed scope</dt><dd>{esc(c["assessed_scope"])}</dd>')
            out.append(f'<dt>Conditions not stated</dt><dd>{esc(c["conditions_not_stated"])}</dd>')
            for s in c["sources"]:
                so = src[s["source_id"]]
                out.append(f'<dt>Source</dt><dd>{esc(so["title"])}, {esc(so["author"])}, {esc(stop(so["date"] or "date not stated"))} {esc(stop(s["locator"]))} <a href="{esc(so["url"])}">{esc(so["url"])}</a></dd>')
            out.append('</dl></article>')
    out.append('<h3>Sources</h3><ol class="static-sources">')
    for s in d["sources"]:
        access = s["access"]
        line = f'{esc(stop(s["title"]))} {esc(stop(s["author"]))} {esc(stop(s["origin"]))} Date: {esc(stop(s["date"] or "not stated"))} <a href="{esc(s["url"])}">{esc(s["url"])}</a>. Accessed {esc(access["date"])}: {esc(stop(access["direct"]))}'
        if access.get("checked_copy"):
            line += f' Checked copy: <a href="{esc(access["checked_copy"])}">{esc(access["checked_copy"])}</a>.'
        if s.get("file_hash"):
            line += f' File hash: <code>{esc(s["file_hash"])}</code>.'
        out.append(f'<li id="static-{esc(s["id"])}">{line}</li>')
    out.append('</ol><h3>Image credits and rights</h3><ul>')
    for im in d["images"]:
        out.append(f'<li>{esc(air[im["aircraft_id"]]["name"])}: {esc(stop(im["credit"]))} DVIDS Photo ID {esc(im["photo_id"])}, VIRIN {esc(stop(im["virin"]))} <a href="{esc(im["source_url"])}">{esc(im["source_url"])}</a>. PUBLIC DOMAIN.</li>')
    out.append('</ul>')
    for r in d["rights"]:
        out.append(f'<p><strong>{esc(r["asset"])}</strong>: {esc(r["notice"])} Permitted use: {esc(stop(r["permitted_uses"]))} Restrictions: {esc(stop(r["restrictions"]))}{(" " + esc(r["disclaimer"])) if r.get("disclaimer") else ""}</p>')
    out.append(f'<p>{esc(d["datasets"][0]["transfer_limit"])} Units: {esc(stop(UNITS))} {esc(stop(REFERENCE))} Experimental uncertainty not stated.</p>')
    out.append('</section>')
    return "\n".join(out)


def replace_block(page, opening, content):
    page, found = re.subn(rf"({re.escape(opening)}).*?(</script>)", lambda m: m.group(1) + content + m.group(2), page, count=1, flags=re.S)
    if not found:
        fail(f"index.html has no {opening} block")
    return page


def render(dataset):
    raw = json.dumps(dataset, ensure_ascii=False, indent=1) + "\n"
    page = (HERE / "index.html").read_text(encoding="utf-8")
    block = json.dumps(dataset, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page = replace_block(page, '<script id="dataset" type="application/json">', block)
    for block_id, name in (("beamdswitch", "beamdswitch.js"), ("report", "report.js")):
        script = (HERE / name).read_text(encoding="utf-8")
        if "</script" in script:
            fail(f"{name} must not contain </script")
        page = replace_block(page, f'<script id="{block_id}">', "\n" + script)
    page, found = re.subn(r"<!-- static-record -->.*?<!-- /static-record -->",
                          lambda m: "<!-- static-record -->\n" + static_record(dataset) + "\n<!-- /static-record -->", page, count=1, flags=re.S)
    if not found:
        fail("index.html has no static-record markers")
    return raw, page


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--verify", action="store_true", help="check raw.json and index.html are fresh")
    args = parser.parse_args()
    raw, page = render(build())
    targets = {HERE / "raw.json": raw, HERE / "index.html": page}
    if args.verify:
        stale = [p.name for p, text in targets.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            fail(f"stale: {', '.join(stale)}; run python3 build.py")
        print("raw.json and index.html are fresh")
        return
    for path, text in targets.items():
        path.write_text(text, encoding="utf-8")
    print("wrote raw.json and index.html")


if __name__ == "__main__":
    main()
