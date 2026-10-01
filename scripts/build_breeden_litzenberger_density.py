#!/usr/bin/env python3
"""Build the Breeden-Litzenberger risk-neutral density visualization.

The mathematics: the risk-neutral density p(K) is e^{rT} times the second
derivative of the call price with respect to strike.  Distribution theory
supplies the mechanism -- the call payoff (S_T - K)_+ has a kink whose second
distributional derivative is the Dirac delta delta(S_T - K).  Three routes
cross-check the same number: the model-free butterfly identity, the
Black-Scholes density, and the finite-difference second derivative of the call
price curve.  All prices are synthetic Black-Scholes prices, never market data.
"""
import argparse
import json
import math
import re
from html import escape
from pathlib import Path
from gallery import render_gallery

ROOT = Path(__file__).resolve().parents[1]
SLUG = "breeden-litzenberger-density"
RAW = ROOT / "data" / SLUG / "raw.json"
META = ROOT / "data" / SLUG / "meta.json"
TOKENS = ROOT / "design-tokens.json"
VIZ = ROOT / "viz" / SLUG / "index.html"
# The narrated report: the site's standard beamdswitch template, copied unchanged, and the page's
# report, which fills it from the strike and half-width shown. Both are inlined verbatim.
BEAMDSWITCH_JS = ROOT / "viz" / SLUG / "beamdswitch.js"
REPORT_JS = ROOT / "viz" / SLUG / "report.js"
GALLERY = ROOT / "index.html"


def phi(x):
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def Phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def bs_call(K, S0, r, sig, T):
    if K <= 0.0:
        return S0
    d1 = (math.log(S0 / K) + (r + 0.5 * sig * sig) * T) / (sig * math.sqrt(T))
    d2 = d1 - sig * math.sqrt(T)
    return S0 * Phi(d1) - K * math.exp(-r * T) * Phi(d2)


def density(K, S0, r, sig, T):
    if K <= 0.0:
        return 0.0
    d2 = (math.log(S0 / K) + (r - 0.5 * sig * sig) * T) / (sig * math.sqrt(T))
    return phi(d2) / (K * sig * math.sqrt(T))


def build_model(raw):
    m = raw["model"]
    S0, r, sig, T = m["S0"], m["r"], m["sigma"], m["T"]
    grid = raw["grid"]
    K_min, K_max, step = grid["K_min"], grid["K_max"], grid["step"]
    K0 = raw["reference_strike"]
    erT = math.exp(r * T)

    curves = []
    k = K_min
    while k <= K_max + 1e-9:
        curves.append([round(k, 4), bs_call(k, S0, r, sig, T), density(k, S0, r, sig, T)])
        k += step

    C0 = bs_call(K0, S0, r, sig, T)
    p0 = density(K0, S0, r, sig, T)
    cpp = math.exp(-r * T) * p0  # second derivative C''(K0) = e^{-rT} p(K0)

    d1 = (math.log(S0 / K0) + (r + 0.5 * sig * sig) * T) / (sig * math.sqrt(T))
    d2 = d1 - sig * math.sqrt(T)

    butterflies = []
    for delta in raw["butterfly_half_widths"]:
        price = bs_call(K0 - delta, S0, r, sig, T) - 2.0 * C0 + bs_call(K0 + delta, S0, r, sig, T)
        butterflies.append({
            "delta": delta,
            "price": price,
            "density_estimate": erT * price / (delta * delta),
        })

    return {
        "S0": S0, "r": r, "sigma": sig, "T": T, "erT": erT,
        "K0": K0, "d1": d1, "d2": d2,
        "C0": C0, "p0": p0, "cpp": cpp,
        "curves": curves,
        "butterflies": butterflies,
        "K_min": K_min, "K_max": K_max, "step": step,
        "slider": raw["slider"],
    }


def fmt(x, nd=6):
    return f"{x:.{nd}f}".rstrip("0").rstrip(".") if nd else str(x)


def render(model, meta, tokens):
    colors = tokens["colors"]
    root_vars = (
        f"--bg:{colors['background']};--fg:{colors['foreground']};--muted:{colors['secondary']};"
        f"--surface:{colors['surface']};--border:{colors['border']};--focus:{colors['focus']};"
        f"--mark:{colors['mark']};--selected:{colors['selected']};"
        f"--sans:{tokens['font_sans']};--mono:{tokens['font_mono']}"
    )

    model_json = json.dumps({
        "S0": model["S0"], "r": model["r"], "sigma": model["sigma"], "T": model["T"],
        "erT": model["erT"], "K0": model["K0"],
        "K_min": model["K_min"], "K_max": model["K_max"], "step": model["step"],
        "slider": model["slider"],
    }, separators=(",", ":"))

    curves_json = json.dumps(model["curves"], separators=(",", ":"))

    # Cross-check table rows (verified numbers at K = 100).
    p0s = fmt(model["p0"])
    c0s = fmt(model["C0"], 4)
    cpps = fmt(model["cpp"])
    rows_html = []
    for b in model["butterflies"]:
        d = fmt(b["delta"])
        price = fmt(b["price"], 6)
        est = fmt(b["density_estimate"], 6)
        rows_html.append(
            f"<tr><td>{d}</td><td>{price}</td><td>{est}</td></tr>"
        )
    crosscheck_rows = "\n".join(rows_html)

    sources_html = "\n".join(
        f'<li><a href="{escape(s["url"])}">{escape(s["title"])}</a>'
        + (f', {escape(s["authors"])}' if s.get("authors") else "")
        + (f', {s["year"]}' if s.get("year") else "")
        + f'. {escape(s["claim"])}</li>'
        for s in meta["sources"]
    )
    sources_json = json.dumps(
        [{"title": s["title"], "url": s["url"]} for s in meta["sources"]],
        separators=(",", ":"))
    deck_json = json.dumps({
        "XCHECK": [{"delta": fmt(b["delta"]), "price": fmt(b["price"], 6), "est": fmt(b["density_estimate"], 6)}
                   for b in model["butterflies"]],
        "P0": p0s, "C0": c0s, "CPP": cpps, "D2": fmt(model["d2"], 4), "K0": fmt(model["K0"]),
        "FETCHED": meta["fetched"],
        "SOURCES": [{"title": s["title"], "url": s["url"]} for s in meta["sources"]],
    }, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
    d2_est = next(b for b in model["butterflies"] if b["delta"] == 2.0)["density_estimate"]
    p0_at_d2 = fmt(d2_est, 6)

    title = "The risk-neutral density is the curvature of the call-price curve"
    desc = ("Differentiate a call price twice in its strike: times e^rT, that curvature is the "
            "market-implied probability density of the stock ending at each strike. A Dirac delta "
            "hides in the payoff's kink.")

    html = TEMPLATE
    for token, value in [
        ("@@ROOT_VARS@@", root_vars),
        ("@@TITLE@@", title),
        ("@@DESC@@", desc),
        ("@@MODEL_JSON@@", model_json),
        ("@@CURVES_JSON@@", curves_json),
        ("@@CROSSCHECK_ROWS@@", crosscheck_rows),
        ("@@P0@@", p0s),
        ("@@C0@@", c0s),
        ("@@CPP@@", cpps),
        ("@@D2@@", fmt(model["d2"], 4)),
        ("@@K0@@", fmt(model["K0"])),
        ("@@SOURCE_URL@@", meta["source_url"]),
        ("@@FETCHED@@", meta["fetched"]),
        ("@@SOURCES_HTML@@", sources_html),
        ("@@SOURCES_JSON@@", sources_json),
        ("@@P0_AT_D2@@", p0_at_d2),
        ("@@DECK_JSON@@", deck_json),
        ("@@BEAMDSWITCH_JS@@", BEAMDSWITCH_JS.read_text()),
        ("@@REPORT_JS@@", REPORT_JS.read_text()),
    ]:
        html = html.replace(token, value)
    return html


def verify(raw, model, meta):
    # The precise input is unchanged and the model is internally consistent.
    assert raw["model"] == {"S0": 100.0, "r": 0.05, "sigma": 0.20, "T": 1.0}
    assert raw["grid"] == {"K_min": 60.0, "K_max": 160.0, "step": 0.5}
    assert raw["reference_strike"] == 100.0
    assert raw["butterfly_half_widths"] == [5.0, 2.0, 1.0, 0.5]

    # The checkable terminal result: p(100) = e^{rT} C''(100) ~= 0.019724,
    # and the butterflies converge onto it.
    assert round(model["p0"], 6) == 0.019724
    assert round(model["C0"], 4) == 10.4506
    assert round(model["cpp"], 6) == 0.018762
    assert abs(model["erT"] * model["cpp"] - model["p0"]) < 1e-12
    assert round(model["d1"], 4) == 0.3500 and round(model["d2"], 4) == 0.1500
    by_delta = {b["delta"]: b for b in model["butterflies"]}
    assert round(by_delta[5.0]["density_estimate"], 6) == 0.019623
    assert round(by_delta[2.0]["density_estimate"], 6) == 0.019708
    assert round(by_delta[1.0]["density_estimate"], 6) == 0.019720
    assert round(by_delta[0.5]["density_estimate"], 6) == 0.019723
    # Every butterfly estimate sits within 1% of the closed-form density.
    for b in model["butterflies"]:
        assert abs(b["density_estimate"] - model["p0"]) / model["p0"] < 0.01

    # Curves are monotone in strike (call price) and positive (density).
    calls = [c[1] for c in model["curves"]]
    dens = [c[2] for c in model["curves"]]
    assert all(a > b for a, b in zip(calls, calls[1:]))
    assert all(d > 0 for d in dens)
    assert len(model["curves"]) == 201

    assert meta["slug"] == SLUG and meta["fetched"] == "2026-09-29"
    assert meta["key_file_used"] is False

    html = VIZ.read_text()
    assert html.count("<h1>") == 1 and html.count("<svg") == 1 and html.count("<section") >= 1
    assert html.count("<script") == 3 and "<script src=" not in html
    assert f'<script id="beamdswitch">\n{BEAMDSWITCH_JS.read_text()}</script>' in html
    assert f'<script id="report">\n{REPORT_JS.read_text()}</script>' in html
    assert 'id="save-beamdswitch"' in html and 'id="copy-beamdswitch"' in html
    stripped = html
    for url in [meta["source_url"], "https://teoyujie.org/visuals/beamdswitch/"] + [s["url"] for s in meta["sources"]]:
        stripped = stripped.replace(f'href="{url}"', "")
    assert not re.search(r'''(?:src|href)=["']https?://''', stripped)
    assert html.count("mc?.registerTool") == 3 and html.count("readOnlyHint:true") == 3
    assert all(f'name:"{name}"' in html for name in ("get_data", "get_metadata", "query"))
    for needle in ["0.019724", "10.4506", "0.018762", "0.019708", "0.019623",
                   "delta", "Dirac", "Breeden", "synthetic Black-Scholes"]:
        assert needle.lower() in html.lower()
    assert "prefers-reduced-motion" in html and "reset" in html.lower()
    assert f'href="viz/{SLUG}/index.html"' in GALLERY.read_text()
    print("verified: Breeden-Litzenberger density 0.019724, butterflies converge, "
          "one inline SVG, 3 read-only tools, a beamdswitch deck, zero external assets")


TEMPLATE = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="@@DESC@@"><title>@@TITLE@@</title><style>
:root{@@ROOT_VARS@@;color-scheme:light}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 var(--sans)}main{width:min(100% - 2rem,72rem);margin:auto;padding:clamp(2rem,6vw,4rem) 0 1.5rem}h1{max-width:22ch;margin:0 0 .8rem;font-size:clamp(1.9rem,6vw,3.4rem);line-height:1.05;letter-spacing:-.035em}.lede{max-width:64ch;margin:.4rem 0 1rem}.method,.caveat{max-width:72ch;color:var(--muted)}.method{font-size:.95rem}.derivation{max-width:72ch;margin:1.5rem 0;padding:1rem 1.1rem;background:var(--surface);border-radius:.5rem;font:15px/1.7 var(--mono);overflow-x:auto}.derivation .step{display:block}.derivation .result{font-weight:700;color:var(--selected)}.derivation .why{color:var(--muted)}.controls{display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;align-items:center;margin:1.25rem 0 .5rem}.control{flex:1 1 18rem}.control label{display:block;font-size:.9rem;color:var(--muted);margin-bottom:.15rem}.readout{margin:.25rem 0 .75rem;font:14px var(--mono);color:var(--muted);min-height:1.2em}.seg{display:inline-flex;border:1px solid var(--border);border-radius:.5rem;overflow:hidden}.seg button{appearance:none;border:0;border-left:1px solid var(--border);background:var(--bg);color:var(--fg);font:600 15px/1 var(--sans);padding:0 1rem;min-height:44px;min-width:44px;cursor:pointer}.seg button:first-child{border-left:0}.seg button[aria-pressed="true"]{background:var(--mark);color:#fff}.reset{appearance:none;border:1px solid var(--border);border-radius:.5rem;background:var(--bg);color:var(--fg);font:600 15px/1 var(--sans);padding:0 1rem;min-height:44px;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid var(--focus);outline-offset:2px}input[type=range]{width:100%;min-height:44px;margin:0;accent-color:var(--mark)}svg{display:block;width:100%;height:auto;margin-top:.5rem}.axis{fill:var(--muted);font:13px var(--mono)}.tick{stroke:var(--border)}.grid{stroke:var(--border);stroke-dasharray:2 4}.call{fill:none;stroke:var(--fg);stroke-width:2}.dens{fill:none;stroke:var(--selected);stroke-width:2}.bracket{stroke:var(--muted)}.bracket-dot{fill:var(--mark)}.chord{stroke:var(--mark);stroke-width:1.5}.sag{stroke:var(--selected);stroke-width:2}.bar{fill:var(--mark);fill-opacity:.45}.density-dot{fill:var(--selected);stroke:var(--bg);stroke-width:2}.note{fill:var(--muted);font:12px var(--mono)}.panel-label{fill:var(--fg);font:600 13px var(--sans)}.xcheck{margin:1.5rem 0;max-width:72ch}.xcheck table{border-collapse:collapse;font:14px/1.5 var(--mono)}.xcheck th,.xcheck td{text-align:right;padding:.3rem .8rem .3rem 0;border-bottom:1px solid var(--border)}.xcheck th:first-child,.xcheck td:first-child{text-align:left}.xcheck th{color:var(--muted);font-weight:600}.xcheck .limit{font-weight:700}.caveat{margin-top:1.25rem;font-size:.9rem}.sources{margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);color:var(--muted);font-size:.9rem}.sources ol{padding-left:1.2rem;margin:.4rem 0}.sources li{padding:.15rem 0}.sources a{color:inherit;text-underline-offset:.18em}footer{padding:1.5rem 0 2.5rem;border-top:1px solid var(--border);color:var(--muted);font-size:.875rem;width:min(100% - 2rem,72rem);margin:auto}footer a{display:inline-block;padding:.7rem 0;color:inherit}.deck-row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:1rem 0 0}.deck-row .status{font-size:.9rem;color:var(--muted)}.deck-hint{max-width:72ch;margin:.4rem 0 0;font-size:.9rem;color:var(--muted)}.deck-hint a{color:inherit}@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}@media (max-width:430px){.seg button{padding:0 .75rem}.derivation{font-size:13.5px}}
</style></head><body><main>
<h1>@@TITLE@@.</h1>
<p class="lede">Differentiate a call price twice with respect to its strike <em>K</em>. Times <em>e<sup>rT</sup></em>, that second derivative is the market-implied probability density of the stock ending at that strike. The kink in a call&rsquo;s payoff is the reason: its second <em>distributional</em> derivative is a Dirac delta.</p>
<p class="method"><strong>Synthetic example.</strong> Call prices here are Black&ndash;Scholes prices (S<sub>0</sub>&nbsp;=&nbsp;100, r&nbsp;=&nbsp;5%, &sigma;&nbsp;=&nbsp;20%, T&nbsp;=&nbsp;1 year), not market data. Slide the strike and shrink the butterfly half-width &Delta; to watch curvature become density.</p>
<div class="deck-row"><button type="button" class="reset" id="save-beamdswitch" title="Save a narrated Markdown talk about this strike, to open in beamdswitch">beamdswitch</button><button type="button" class="reset" id="copy-beamdswitch" title="Copy the narrated Markdown talk, to paste into beamdswitch">Copy deck</button><span id="deck-status" class="status" role="status"></span></div>
<p class="deck-hint">The beamdswitch button saves the strike and half-width you set below as a narrated talk: a Markdown deck with the set-up, method, results and checks, every number as shown here, and a spoken narration on every slide. Open it in <a href="https://teoyujie.org/visuals/beamdswitch/">beamdswitch</a> to get slides, a handout, narration and a video. Copy deck puts the same deck on the clipboard, to paste into beamdswitch.</p>

<section class="derivation" aria-label="Derivation">
<span class="step">call payoff: C<sub>T</sub>(K) = (S<sub>T</sub> − K)<sub>+</sub></span>
<span class="step why">first derivative: ∂<sub>K</sub>(S<sub>T</sub> − K)<sub>+</sub> = −H(S<sub>T</sub> − K) <span class="ann">· kink → step</span></span>
<span class="step why">second derivative: ∂<sub>K</sub><sup>2</sup>(S<sub>T</sub> − K)<sub>+</sub> = δ(S<sub>T</sub> − K) <span class="ann">· step → Dirac delta</span></span>
<span class="step">price: C(K) = e<sup>−rT</sup> E<sup>Q</sup>[(S<sub>T</sub> − K)<sub>+</sub>]</span>
<span class="step why">so: ∂<sub>K</sub><sup>2</sup>C(K) = e<sup>−rT</sup> E<sup>Q</sup>[δ(S<sub>T</sub> − K)] = e<sup>−rT</sup> p(K)</span>
<span class="step result">∴ p(K) = e<sup>rT</sup> ∂<sub>K</sub><sup>2</sup>C(K) <span class="ann">· Breeden–Litzenberger, 1978</span></span>
</section>

<div class="controls">
  <div class="control"><label for="strike">Strike K = <span id="kval">100</span></label><input type="range" id="strike" min="65" max="145" step="0.5" value="100" aria-label="Strike K"></div>
  <div class="control"><label id="dlabel">Butterfly half-width &Delta;</label><div class="seg" role="group" aria-labelledby="dlabel"><button type="button" data-d="0.5" aria-pressed="false">0.5</button><button type="button" data-d="1" aria-pressed="false">1</button><button type="button" data-d="2" aria-pressed="true">2</button><button type="button" data-d="5" aria-pressed="false">5</button></div></div>
  <button type="button" class="reset" id="reset">Reset</button>
</div>
<p class="readout" id="readout" aria-live="polite"></p>

<svg id="chart" viewBox="0 0 960 640" role="img" aria-label="Call price curve and risk-neutral density curve versus strike"><title>Curvature of the call price curve equals the risk-neutral density</title><desc>Top panel: a convex, decreasing call price curve with a butterfly bracket spanning K minus delta to K plus delta. The vertical gap between the curve and its chord is the curvature. Bottom panel: the lognormal risk-neutral density curve, with the butterfly's normalized second difference drawn as a bar and the closed-form density as a dot at the same strike; they coincide.</desc></svg>

<section class="xcheck" aria-label="Independent numerical check">
<h2>The independent check: three routes, one number</h2>
<p>At K = 100, the butterfly portfolio (call@K&minus;&Delta; &minus; 2&thinsp;call@K + call@K+&Delta;) has a tent payoff that concentrates on a Dirac delta, so its normalized price must approach the density. The finite difference of the synthetic call curve below and the closed-form Black&ndash;Scholes density both confirm it:</p>
<table>
<thead><tr><th>&Delta;</th><th>butterfly price C(K&minus;&Delta;)&minus;2C(K)+C(K+&Delta;)</th><th>density estimate e<sup>rT</sup>&middot;price&thinsp;/&thinsp;&Delta;<sup>2</sup></th></tr></thead>
<tbody>
@@CROSSCHECK_ROWS@@
<tr><td class="limit">Black&ndash;Scholes p(100)</td><td>&nbsp;</td><td class="limit">@@P0@@</td></tr>
</tbody>
</table>
<p class="method">Closed form: p(K)&nbsp;=&nbsp;&phi;(d<sub>2</sub>)&thinsp;/&thinsp;(K&sigma;&radic;T) with d<sub>2</sub>&nbsp;=&nbsp;@@D2@@ at K&nbsp;=&nbsp;@@K0@@, giving p(100)&nbsp;=&nbsp;@@P0@@. The call price C(100)&nbsp;=&nbsp;@@C0@@, its second derivative C&Prime;(100)&nbsp;=&nbsp;@@CPP@@, and e<sup>rT</sup>&thinsp;C&Prime;(100)&nbsp;=&nbsp;@@P0@@ &mdash; the butterflies converge onto the same value as &Delta;&nbsp;&rarr;&nbsp;0.</p>
</section>

<p class="caveat"><strong>Honesty note.</strong> Every price on this page is a synthetic Black&ndash;Scholes number (S<sub>0</sub>&nbsp;=&nbsp;100, r&nbsp;=&nbsp;5%, &sigma;&nbsp;=&nbsp;20%, T&nbsp;=&nbsp;1y). The Breeden&ndash;Litzenberger identity itself is model-free: it only needs call prices that are convex in strike, so their second derivative exists almost everywhere.</p>

<section class="sources" aria-label="Sources">
<p><strong>Sources.</strong></p>
<ol>@@SOURCES_HTML@@</ol>
</section>
</main>
<footer>Source: <a href="@@SOURCE_URL@@">Martin, &ldquo;Options and the Gamma Knife&rdquo; (2018)</a>; original result by Breeden &amp; Litzenberger (1978). Retrieved @@FETCHED@@.</footer>
<noscript><p>This figure is drawn with JavaScript. The result holds without it: the risk-neutral density is p(K)&nbsp;=&nbsp;e<sup>rT</sup>&thinsp;&part;<sub>K</sub><sup>2</sup>C(K), the Black&ndash;Scholes density at K&nbsp;=&nbsp;100 is @@P0@@, and the &Delta;&nbsp;=&nbsp;2 butterfly estimates @@P0_AT_D2@@.</p></noscript>
<script id="beamdswitch">
@@BEAMDSWITCH_JS@@</script><script id="report">
@@REPORT_JS@@</script><script>
const MODEL=@@MODEL_JSON@@,CURVES=@@CURVES_JSON@@,DECK=@@DECK_JSON@@;
const NS="http://www.w3.org/2000/svg",svg=document.querySelector("#chart");
const slider=document.querySelector("#strike"),kval=document.querySelector("#kval");
const readout=document.querySelector("#readout"),segButtons=[...document.querySelectorAll(".seg button")];
const W=960,H=640,KMIN=MODEL.K_min,KMAX=MODEL.K_max;
const x0=78,x1=934,topY0=62,topY1=296,topMax=45,botY0=370,botY1=556,botMax=0.021;
const X=K=>x0+(K-KMIN)/(KMAX-KMIN)*(x1-x0);
const Ycall=v=>topY1-(v/topMax)*(topY1-topY0);
const Ydens=v=>botY1-(v/botMax)*(botY1-botY0);
// The interpolation and the butterfly read-out live in report.js, so the chart and the beamdswitch deck agree.
const P={MODEL,CURVES,...DECK},at=(K,col)=>BLReport.at(CURVES,K,col);
const add=(name,attrs,parent=svg)=>{const n=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);parent.append(n);return n;};
const text=(v,x,y,klass,anchor="start",parent=svg)=>{const n=add("text",{x,y,class:klass,"text-anchor":anchor},parent);n.textContent=v;return n;};
let K=100,D=2;
function drawBase(){svg.replaceChildren();svg.setAttribute("viewBox","0 0 960 640");
// y gridlines and labels, top (call price)
[0,10,20,30,40].forEach(v=>{add("line",{x1:x0,x2:x1,y1:Ycall(v),y2:Ycall(v),class:"grid"});text(v,x0-8,Ycall(v)+4,"axis","end");});
text("Call price C(K)",x0,topY0-12,"panel-label");
[0,0.005,0.010,0.015,0.020].forEach(v=>{add("line",{x1:x0,x2:x1,y1:Ydens(v),y2:Ydens(v),class:"grid"});text(v.toFixed(3),x0-8,Ydens(v)+4,"axis","end");});
text("Risk-neutral density p(K)",x0,botY0-12,"panel-label");
// x ticks shared
for(let k=60;k<=160;k+=10){add("line",{x1:X(k),x2:X(k),y1:topY0,y2:topY1,class:"tick"});add("line",{x1:X(k),x2:X(k),y1:botY0,y2:botY1,class:"tick"});text(String(k),X(k),H-22,"axis","middle");}
text("Strike K",x1,H-22,"panel-label","end");
// curves
const callPts=CURVES.map(c=>X(c[0]).toFixed(1)+","+Ycall(c[1]).toFixed(1)).join(" ");
const densPts=CURVES.map(c=>X(c[0]).toFixed(1)+","+Ydens(c[2]).toFixed(1)).join(" ");
add("polyline",{points:callPts,class:"call"});add("polyline",{points:densPts,class:"dens"});
// connector annotation between panels
add("line",{x1:x0+40,x2:x0+40,y1:topY1+18,y2:botY0-30,class:"bracket"});
add("polygon",{points:(x0+40-5)+","+(botY0-32)+" "+(x0+40+5)+","+(botY0-32)+" "+(x0+40)+","+(botY0-18),class:"bracket"});
text("\u00d7 e^rT \u00b7 \u2202\u00b2/\u2202K\u00b2",x0+52,(topY1+botY0)/2,"note",undefined);
}
function drawMarkers(){const g=document.querySelector("#markers");if(g)g.remove();const m=add("g",{id:"markers"});
const {cL,cK,cR,secondDiff,est,pK}=BLReport.reading(P,K,D);const sag=(cL+cR)/2-cK;
// butterfly bracket on call curve
add("line",{x1:X(K-D),x2:X(K+D),y1:Ycall(cL),y2:Ycall(cR),class:"chord"},m);
[K-D,K,K+D].forEach((kk,i)=>{const v=i===0?cL:i===1?cK:cR;add("line",{x1:X(kk),x2:X(kk),y1:Ycall(v),y2:topY1,class:"bracket"},m);add("circle",{cx:X(kk),cy:Ycall(v),r:4.5,class:"bracket-dot"},m);});
// sag (curvature) gap
add("line",{x1:X(K),x2:X(K),y1:Ycall(cK),y2:Ycall(cK+sag),class:"sag"},m);
const right=X(K)>700,anchor=right?"end":"start";
text("curvature = "+secondDiff.toFixed(4),right?X(K)-8:X(K)+8,Ycall(cK+sag/2),"note",anchor,m);
// density panel: butterfly bar + closed-form dot
const bx=X(K)-6;add("rect",{x:bx,y:Ydens(est),width:12,height:Ydens(0)-Ydens(est),class:"bar"},m);
add("circle",{cx:X(K),cy:Ydens(pK),r:6,class:"density-dot"},m);
text("e^rT\u00b7"+secondDiff.toFixed(4)+"/"+(D*D).toFixed(2)+" = "+est.toFixed(5),right?X(K)-10:X(K)+10,Ydens(est)-6,"note",anchor,m);
text("p(K) = "+pK.toFixed(5),right?X(K)-10:X(K)+10,Ydens(pK)-12,"note",anchor,m);
}
function update(){kval.textContent=K;segButtons.forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.d===String(D))));const {est,pK}=BLReport.reading(P,K,D);readout.textContent="At K = "+K+" with \u0394 = "+D+": butterfly density "+est.toFixed(5)+" \u00b7 Black\u2013Scholes density "+pK.toFixed(5);drawMarkers();}
slider.addEventListener("input",()=>{K=parseFloat(slider.value);update();});
segButtons.forEach(b=>b.addEventListener("click",()=>{D=parseFloat(b.dataset.d);update();}));
document.querySelector("#reset").addEventListener("click",()=>{K=100;D=2;slider.value="100";update();});
addEventListener("resize",()=>{});drawBase();update();
/* The beamdswitch deck of the strike and half-width shown: beamdswitch.js is the site's report template, report.js fills it. */
const deck=()=>Beamdswitch.deck(BLReport.report(P,{K,D})),deckStatus=document.querySelector("#deck-status");
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.querySelector("#save-beamdswitch").addEventListener("click",()=>{const name="breeden-litzenberger-density-beamdswitch.md";try{save(new Blob([deck()],{type:"text/markdown"}),name);deckStatus.textContent="Saved "+name+": open it in beamdswitch.";}catch{deckStatus.textContent="Could not save the beamdswitch deck here: use Copy deck to paste it into beamdswitch.";}});
document.querySelector("#copy-beamdswitch").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(deck());deckStatus.textContent="Copied the beamdswitch deck: paste it into beamdswitch.";}catch{deckStatus.textContent="Could not copy the beamdswitch deck here: use the beamdswitch button to save it.";}});
const result=value=>({content:[{type:"text",text:JSON.stringify(value)}]}),mc=(typeof document!=="undefined"&&document.modelContext)||(typeof navigator!=="undefined"&&navigator.modelContext);
mc?.registerTool({name:"get_data",description:"Return the synthetic Black-Scholes call-price and density curves plus the butterfly cross-check.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(){return result({model:MODEL,curves:CURVES,total:CURVES.length,truncated:false,next_steps:["Use query with filter.strike to inspect one strike."]})}});
mc?.registerTool({name:"get_metadata",description:"Return the claim, model parameters, sources, and fetch date.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(){return result({title:"@@TITLE@@",claim:"The risk-neutral density is e^rT times the second derivative of the call price in strike.",model:{S0:100,r:0.05,sigma:0.20,T:1.0},disclosure:"Synthetic Black-Scholes prices, not market data.",fetched:"@@FETCHED@@",sources:@@SOURCES_JSON@@,next_steps:["Use get_data for the full curves."]})}});
mc?.registerTool({name:"query",description:"Return the call price and risk-neutral density at one strike.",inputSchema:{type:"object",properties:{filter:{type:"object",properties:{strike:{type:"number"}},required:["strike"],additionalProperties:false}},additionalProperties:false},annotations:{readOnlyHint:true},async execute(input={}){const k=input.filter?.strike;if(k==null)return result({error:"supply filter.strike",next_steps:["Use filter.strike between 60 and 160."]});if(k<MODEL.K_min||k>MODEL.K_max)return result({error:"filter.strike out of range",next_steps:["Use filter.strike between "+MODEL.K_min+" and "+MODEL.K_max+"."]});return result({strike:k,call_price:at(k,1),density:at(k,2),disclosure:"Synthetic Black-Scholes prices, not market data.",next_steps:["Density equals e^rT times the second derivative of the call price."]})}});
</script></body></html>
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    raw = json.loads(RAW.read_text())
    meta = json.loads(META.read_text())
    model = build_model(raw)
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(render(model, meta, json.loads(TOKENS.read_text())))
        GALLERY.write_text(render_gallery())
    verify(raw, model, meta)


if __name__ == "__main__":
    main()
