---
name: radar-network
description: Use the radar network visualiser to read the radar range equation for 3 moving radars and 4 moving targets: every one of the 36 transmitter-receiver-target links with its power, SNR, detector threshold, required SNR, margin, delay, Doppler and full manual calculation, plus the published MathWorks reference checks. All absolute values are synthetic. Never use it for the RCS or range of a real aircraft.
---

# Use the radar network visualiser

Live at <https://teoyujie.org/visuals/radar-network/>. The page puts 3 radars and 4 targets in a right-handed local frame (x east, y north, z up, SI units). A link is (transmitter, receiver, target), so the initial scene has 36 links. Each link uses the bistatic radar equation, the single-pulse matched-filter SNR ρ₁ = P_r τ/(k T_s L_MF), and a thermal-noise square-law detector after ideal coherent integration. All absolute values (power, gains, losses, RCS, clutter) are synthetic. Only the carriers 4, 10 and 17 GHz come from the supplied evidence. To change the page, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the complete scenario and its model digest | `get_scenario` |
| List the links at the current time, with status, power, SNR and margin | `list_links` |
| Read one link's manual calculation, at the current time or another time | `get_link` |
| Read the MathWorks reference cases, the invariants and the detector checks | `get_checks` |
| Read the current view and the URL that restores it | `get_view` |
| Keep the analysis as a talk | the "Download report" button (beamdswitch deck) |
| Keep or move the scenario | "Export JSON" and "Import JSON" |

## Inputs

Link ids have the form `tx>rx:target`, for example `R1>R2:T3`. The initial objects are radars `R1`, `R2`, `R3` and targets `T1` to `T4`. Examples change the object set: for example, `equal-delay` has sites `S1`, `S2` and targets `A`, `B`. Times are in seconds from 0 to the scene duration (120 s at first).

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_scenario` | none | The semantic state in SI units and its model digest |
| `list_links` | `status` (optional) | Each link with type, status, reasons, received power (dBm), ρ₁ (dB), margin (dB), predicted P_d, delay and Doppler |
| `get_link` | `id` (required), `time_s` | The 7 calculation sections: objects, geometry, conversions, power, SNR and detector, margin and validity, sampled result |
| `get_checks` | none | Reference cases with this model's values, the domain invariants, the detector checks and the unverified checks |
| `get_view` | none | Example, selection, time, camera, layers, open calculations, tab and URL |

## Exports

- **JSON:** `radar-network-scenario.json`, the complete semantic scenario with schema and model versions, units, sources, seed and time. Sampled result snapshots carry their own model digest. Import checks schema, units, domain and finite values, and keeps the current scene when a check fails.
- **beamdswitch deck:** `radar-network-beamdswitch.md` (voice `bf_emma`): Set-up, Method, Results (all links), Checks and takeaway.
- **Data:** [data.json](https://teoyujie.org/visuals/radar-network/data.json) (`raw.json` here): the preset, the examples, the reference cases and the evidence curves.

## Worked example

`get_link({"id": "R1>R1:T3"})` at t = 0 s gives R = 87.678 km, P_r = 1.925×10⁻¹⁶ W (−127.16 dBm), ρ₁ = −6.34 dB, a required ρ₁ of −4.878 dB for P_d = 0.9 at P_fa = 10⁻⁶ with 64 coherent pulses, and a margin of −1.46 dB.
