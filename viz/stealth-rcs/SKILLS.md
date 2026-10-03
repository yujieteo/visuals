---
name: stealth-rcs
description: Use Stealth aircraft public RCS evidence to read the 8 sourced Toulmin arguments about F-117, F-22, F-35 and B-2 radar signatures, their results and limits, and the NASA F-117 aluminum model curves (dB, reference not stated) extracted from public-domain figures. Never use it to rank aircraft or to state an RCS value for a service aircraft.
---

# Use Stealth aircraft: public RCS evidence

Live at <https://teoyujie.org/visuals/stealth-rcs/>. The page assesses 8 public claims (2 for each aircraft) as Toulmin arguments: claim, grounds, warrant, backing, qualifier and rebuttal, with an evidence type, a result (supported within stated limits, contradicted by comparable evidence, or cannot verify from public evidence) and the conditions that the source does not state. The only curves are figures 5.10, 5.11 and 5.12 of NASA-CR-191378-VOL-4 (1992): one aluminum F-117 model, azimuth 175° to 185°, 4, 10 and 17 GHz, original and reconstructed traces. Their values are approximate extractions in dB with the reference not stated. They do not give the RCS of any aircraft. To change the page, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the scope, evidence types, result scale, aircraft and sources | `get_metadata` |
| List the claims, by aircraft, evidence type or result | `list_claims` |
| Read one claim's full argument, conditions, test article and quotations | `get_claim` |
| Read the extracted samples of one model trace, with gaps and extraction error | `get_series` |
| Read the reader's current view and its shareable URL | `get_view` |
| Keep the evidence as a talk or a document | the beamdswitch and Markdown buttons |

## Inputs

Aircraft ids `F117`, `F22`, `F35`, `B2`. Claim ids `F117-1`, `F117-2`, `F22-1`, `F22-2`, `F35-1`, `F35-2`, `B2-1`, `B2-2`. Figure ids `fig-5-10` (4 GHz), `fig-5-11` (10 GHz), `fig-5-12` (17 GHz). Trace roles `original` and `reconstructed`.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The purpose and scope limits, the evidence types, the results, the 4 aircraft, the dataset version and every source with its access record |
| `list_claims` | `aircraft`, `evidence_type`, `result` (all optional) | Each matching claim with its qualifier, evidence type and result |
| `get_claim` | `id` (required) | The 6 Toulmin components, result, assessed scope, conditions (unknown fields null with a reason), test article and sources with locators and quotations |
| `get_series` | `figure`, `role` (required), `from`, `to` in degrees | The samples `[azimuth_deg, magnitude_db, extraction_error_db]` in segments, the gaps with reasons, the units and the limit |
| `get_view` | none | The filters, selected claim, frequency, comparison, traces, zoom, selected sample and the URL that restores them |

## Exports

- **beamdswitch deck:** `stealth-rcs-beamdswitch.md`, a narrated Markdown deck (voice `bf_emma`): overview, the 4 aircraft groups with every argument, the selected view with its sample table, then sources, rights and credits.
- **Markdown record:** `stealth-rcs-record.md`, the same frames without narration.
- **JSON view:** `stealth-rcs-view.json`, which "Load view JSON" restores. The URL holds the same view.
- **Data:** [data.json](https://teoyujie.org/visuals/stealth-rcs/data.json) (`raw.json` here), the one versioned dataset.

## Worked example

`get_series({"figure": "fig-5-12", "role": "reconstructed", "from": 182.2, "to": 182.35})` returns samples near the deep null and a gap from 182.27° to 182.29° with the reason that the line meets the −70 dB frame. The figure does not show values below its axis bound, so no value is given there.
