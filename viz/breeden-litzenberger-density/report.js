/* The Breeden-Litzenberger page's numbers as a beamdswitch report.
 *
 * reading(P, K, D) is the page's own read-out at strike K with butterfly half-width D, from the
 * curves it draws. report(P, view) turns the page's data (P: the model, the curves, and the
 * cross-check table as the page prints it) and its current view ({ K, D }) into the plain-data
 * report that the standard template (beamdswitch.js, `Beamdswitch.deck`) writes as a narrated
 * Markdown deck. The page calls the same reading, so the deck and the chart cannot drift apart.
 */
(function (/** @type {any} */ root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BLReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  /** @typedef {[number, number, number]} CurvePoint a strike, its call price and its density */
  /**
   * The page's data: the model, the curves it draws and the cross-check table as it prints it.
   * @typedef {object} PageData
   * @property {{ S0: number, r: number, sigma: number, T: number, erT: number, K_min: number, K_max: number, step: number, slider: { K_min: number, K_max: number } }} MODEL
   * @property {CurvePoint[]} CURVES
   * @property {{ delta: string, price: string, est: string }[]} XCHECK
   * @property {{ title: string, url: string }[]} SOURCES
   * @property {number | string} K0
   * @property {string} P0
   * @property {string} C0
   * @property {string} CPP
   * @property {string} D2
   * @property {string} FETCHED
   */

  /* The value of column col (1 = call price, 2 = density) at strike K, interpolated on the grid. */
  /** @param {CurvePoint[]} CURVES @param {number} K @param {1 | 2} col */
  function at(CURVES, K, col) {
    let lo = 0, hi = CURVES.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1, c = CURVES[m][0]; if (c < K) lo = m + 1; else if (c > K) hi = m - 1; else return CURVES[m][col]; }
    if (hi < 0) hi = 0;
    if (lo > CURVES.length - 1) lo = CURVES.length - 1;
    const a = CURVES[hi], b = CURVES[lo];
    if (a[0] === b[0]) return a[col];
    const t = (K - a[0]) / (b[0] - a[0]);
    return a[col] + (b[col] - a[col]) * t;
  }

  /* The butterfly at K with half-width D: its second difference, density estimate and the closed form. */
  /** @param {PageData} P @param {number} K @param {number} D */
  function reading(P, K, D) {
    const cL = at(P.CURVES, K - D, 1), cK = at(P.CURVES, K, 1), cR = at(P.CURVES, K + D, 1);
    const secondDiff = cL - 2 * cK + cR;
    return { cL, cK, cR, secondDiff, est: P.MODEL.erT * secondDiff / (D * D), pK: at(P.CURVES, K, 2) };
  }

  /* Plain decimals for a plot expression: no binary noise such as 0.030000000000000002. */
  const num = (/** @type {number} */ x) => String(Number(x.toPrecision(12)));
  const pct = (/** @type {number} */ x) => num(x * 100) + "%";

  /** @param {PageData} P @param {{ K?: number, D?: number }} [view] @returns {import("./beamdswitch.js").Report} */
  function report(P, view = {}) {
    const M = P.MODEL, K = view.K ?? 100, D = view.D ?? 2, r = reading(P, K, D);
    const est = r.est.toFixed(5), pK = r.pK.toFixed(5), sd = r.secondDiff.toFixed(4), dd = (D * D).toFixed(2);
    const params = `S₀ = ${num(M.S0)}, r = ${pct(M.r)}, σ = ${pct(M.sigma)}, T = ${num(M.T)} year`;
    const paramsSaid = `a stock at ${num(M.S0)}, an interest rate of ${num(M.r * 100)} percent, volatility of ${num(M.sigma * 100)} percent and one year to expiry`;
    const finest = P.XCHECK.at(-1), widest = P.XCHECK[0];
    // The closed-form lognormal density as a plot expression in the strike x.
    const drift = num((M.r - 0.5 * M.sigma * M.sigma) * M.T), vol = num(M.sigma * Math.sqrt(M.T));
    const densityExpr = `exp(-0.5*((ln(${num(M.S0)}/x) + ${drift})/${vol})^2) / (x*${vol}*sqrt(2*pi))`;

    const setup = [{
      title: `A synthetic Black–Scholes market: ${params}`,
      body: [
        `- Call prices are Black–Scholes prices with $S_0 = ${num(M.S0)}$, $r = ${num(M.r)}$, $\\sigma = ${num(M.sigma)}$, $T = ${num(M.T)}$, not market data.`,
        `- Strikes from ${num(M.K_min)} to ${num(M.K_max)} in steps of ${num(M.step)}; the slider runs from ${num(M.slider.K_min)} to ${num(M.slider.K_max)}.`,
        `- Sources: ${P.SOURCES.map((s) => `[${s.title}](${s.url})`).join("; ")}.`,
      ].join("\n"),
      notes: "Every price in this talk is synthetic. The Breeden–Litzenberger identity itself is model-free: it needs only call prices that are convex in strike.",
      narration: `Every call price here is a synthetic Black-Scholes price, for ${paramsSaid}. None of it is market data.`,
    }];

    const method = [{
      title: "The payoff's kink differentiates twice into a Dirac delta",
      body: [
        "$$ \\partial_K (S_T - K)_+ = -H(S_T - K), \\qquad \\partial_K^2 (S_T - K)_+ = \\delta(S_T - K) $$",
        "",
        "$$ C(K) = e^{-rT}\\,\\mathbb{E}^Q[(S_T - K)_+] \\;\\Rightarrow\\; \\partial_K^2 C(K) = e^{-rT} p(K) $$",
        "",
        "$$ p(K) = e^{rT}\\,\\partial_K^2 C(K) $$",
      ].join("\n"),
      notes: "Breeden and Litzenberger, 1978. The first derivative of the kinked payoff is a step; the step's derivative is a Dirac delta.",
      narration: "A call pays the stock minus the strike when that is positive, so its payoff has a kink at the strike. Differentiating once in the strike gives a step, and differentiating again gives a Dirac delta. Taking expectations, the second derivative of the call price is the discounted risk-neutral density, so the density is e to the r T times the curvature of the call-price curve.",
    }, {
      title: "Two routes to the density at one strike: a butterfly and the closed form",
      body: [
        "$$ p(K) \\approx e^{rT}\\,\\frac{C(K-\\Delta) - 2C(K) + C(K+\\Delta)}{\\Delta^2} $$",
        "",
        "$$ p(K) = \\frac{\\varphi(d_2)}{K\\sigma\\sqrt{T}}, \\qquad d_2 = \\frac{\\ln(S_0/K) + (r - \\sigma^2/2)T}{\\sigma\\sqrt{T}} $$",
      ].join("\n"),
      narration: "A butterfly buys one call below the strike, sells two at the strike and buys one above it. Its price, scaled by e to the r T and divided by the half-width squared, estimates the density. The Black-Scholes closed form gives the exact density to compare against.",
    }];

    const results = [{
      title: `At K = ${num(K)} with Δ = ${num(D)}: butterfly density ${est}, Black–Scholes density ${pK}`,
      body: [
        `$$ e^{rT}\\cdot\\frac{${sd}}{${dd}} = ${est} \\qquad p(${num(K)}) = ${pK} $$`,
        "",
        `- Call prices: $C(${num(K - D)}) = ${r.cL.toFixed(4)}$, $C(${num(K)}) = ${r.cK.toFixed(4)}$, $C(${num(K + D)}) = ${r.cR.toFixed(4)}$; curvature ${sd}.`,
      ].join("\n"),
      plot: { x: [M.K_min, M.K_max], xlabel: "strike K", ylabel: "risk-neutral density p(K)", curves: [densityExpr] },
      notes: "This is the strike and half-width set on the page. The plot is the closed-form density across every strike.",
      narration: `At a strike of ${num(K)}, with a half-width of ${num(D)}, the butterfly's curvature is ${sd}. Scaled by e to the r T and divided by ${dd}, it estimates a density of ${est}, against the Black-Scholes density of ${pK}.`,
    }, {
      title: `At K = ${P.K0}, the butterflies converge on p(${P.K0}) = ${P.P0}`,
      body: [
        "| Δ | butterfly price | density estimate |",
        "| ---: | ---: | ---: |",
        ...P.XCHECK.map((x) => `| ${x.delta} | ${x.price} | ${x.est} |`),
        `| Black–Scholes p(${P.K0}) | | ${P.P0} |`,
      ].join("\n"),
      // @ts-expect-error finest is XCHECK.at(-1), and the cross-check table is never empty.
      narration: `At a strike of ${P.K0}, the butterfly estimate moves from ${widest.est} with a half-width of ${widest.delta} to ${finest.est} with a half-width of ${finest.delta}, closing on the Black-Scholes density of ${P.P0}.`,
    }];

    const checks = [{
      title: `Three routes, one number: e^rT · C″(${P.K0}) = ${P.P0}`,
      body: [
        `$$ C(${P.K0}) = ${P.C0}, \\quad C''(${P.K0}) = ${P.CPP}, \\quad e^{rT} C''(${P.K0}) = ${P.P0} $$`,
        "",
        `- Closed form: $d_2 = ${P.D2}$ at $K = ${P.K0}$ gives $p(${P.K0}) = ${P.P0}$.`,
        `- The butterflies at $\\Delta = ${P.XCHECK.map((x) => x.delta).join(", ")}$ give ${P.XCHECK.map((x) => x.est).join(", ")}.`,
      ].join("\n"),
      narration: `At a strike of ${P.K0} the call price is ${P.C0} and its second derivative is ${P.CPP}. Times e to the r T, that is ${P.P0}, the same as the closed-form density, and the butterflies close on it as the half-width shrinks.`,
    }, {
      title: "Takeaway",
      key: `The risk-neutral density is the curvature of the call-price curve: $p(K) = e^{rT}\\,\\partial_K^2 C(K)$. At $K = ${P.K0}$ all three routes give ${P.P0}.`,
      narration: `The risk-neutral density is e to the r T times the curvature of the call-price curve. At a strike of ${P.K0}, the butterflies, the second derivative and the closed form all give ${P.P0}.`,
    }];

    return {
      meta: { title: `The risk-neutral density at K = ${num(K)}`, subtitle: `Breeden–Litzenberger on synthetic Black–Scholes prices, butterfly half-width Δ = ${num(D)}`, date: `Retrieved ${P.FETCHED}` },
      narration: "This talk shows that the risk-neutral density is the curvature of the call-price curve. Strikes and prices are in the same currency units, and every price is a synthetic Black-Scholes price.",
      setup, method, results, checks,
    };
  }

  return { at, reading, report };
});
