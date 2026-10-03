// The thermal-noise detector: thresholds, closed forms, inversion, small tails and seeded Monte Carlo of
// every Swerling case for coherent and noncoherent integration.
import assert from "node:assert/strict";
import test from "node:test";
import { CK, D, N } from "./helpers.mjs";

test("detector checks with closed forms pass", () => {
  for (const c of CK.detectorChecks()) assert.ok(c.pass, `${c.id}: ${c.detail}`);
});

test("thresholds: -ln Pfa for one complex cell, gamma tail for the noncoherent sum", () => {
  for (const pfa of [1e-2, 1e-6, 1e-10]) {
    assert.equal(D.threshold("coherent", 64, pfa).eta, -Math.log(pfa));
    for (const n of [1, 8, 64]) {
      const t = D.threshold("noncoherent", n, pfa);
      assert.ok(Math.abs(N.gammaPQ(n, t.eta).Q / pfa - 1) < 1e-9, `Q(${n}, eta) = Pfa`);
    }
  }
});

test("noncentral chi-square tails: small probabilities stay accurate", () => {
  // At zero noncentrality the tail is the central chi-square: exp(-x/2) for 2 dof.
  assert.ok(Math.abs(N.ncx2Tail(2 * 30, 2, 0).sf / Math.exp(-30) - 1) < 1e-12);
  // Pd for a weak target: the series and the complementary sum agree.
  const r = N.ncx2Tail(2 * 13.8155, 2, 2 * 1);
  assert.ok(Math.abs(r.sf + r.cdf - 1) < 1e-14);
  assert.ok(r.sf > 1e-6 && r.sf < 1e-2, `Pd = ${r.sf}`);
  // Near-one Pd: 1 - Pd comes from the cdf sum without cancellation.
  const s = N.ncx2Tail(2 * 13.8155, 2, 2 * 400);
  assert.ok(s.cdf > 0 && s.cdf < 1e-20, `1 - Pd = ${s.cdf}`);
});

test("required SNR: known single-pulse values and inversion residuals", () => {
  const base = { integration: "coherent", pulses: 1, pfa: 1e-6, pdRequired: 0.9 };
  const sw0 = D.requiredSnr({ ...base, swerling: 0 }), sw1 = D.requiredSnr({ ...base, swerling: 1 }), sw3 = D.requiredSnr({ ...base, swerling: 3 });
  assert.ok(Math.abs(sw0.db - 13.18) < 0.01, `Swerling 0: ${sw0.db}`);
  assert.ok(Math.abs(sw1.db - 10 * Math.log10(Math.log(1e-6) / Math.log(0.9) - 1)) < 1e-6, `Swerling 1 closed form: ${sw1.db}`);
  assert.ok(Math.abs(sw3.db - 17.3) < 0.05, `Swerling 3: ${sw3.db}`);
  const c64 = D.requiredSnr({ ...base, pulses: 64, swerling: 0 });
  assert.ok(Math.abs(c64.db - (sw0.db - 10 * Math.log10(64))) < 1e-6, "ideal coherent integration gains N");
  for (const r of [sw0, sw1, sw3, c64]) assert.ok(Math.abs(r.residual) < 1e-7);
});

/** Seeded Monte Carlo of the detector statistic, independent of the analytic code paths. */
function simulate({ integration, pulses, pfa, swerling, phase }, rho1, trials, seed) {
  const rng = N.stream(seed, "detector-test", integration, swerling, phase, pulses);
  const eta = D.threshold(integration, pulses, pfa).eta;
  let hits = 0;
  for (let t = 0; t < trials; t++) {
    const dwellX = swerling === 1 ? rng.exponential() : swerling === 3 ? rng.gamma2() : 1;
    const dwellPh = rng.phase();
    let re = 0, im = 0, sum = 0;
    for (let m = 0; m < pulses; m++) {
      const x = swerling === 2 ? rng.exponential() : swerling === 4 ? rng.gamma2() : dwellX;
      const ph = phase === "per-pulse" ? rng.phase() : dwellPh;
      const a = Math.sqrt(rho1 * x), n = rng.cnormal(1);
      const zr = a * Math.cos(ph) + n[0], zi = a * Math.sin(ph) + n[1];
      re += zr; im += zi; sum += zr * zr + zi * zi;
    }
    const T = integration === "coherent" ? (re * re + im * im) / pulses : sum;
    if (T > eta) hits++;
  }
  return N.wilson(hits, trials, 3.29); // 99.9% interval keeps the 28 cases from failing by chance
}

test("analytic Pd lies inside seeded Monte Carlo intervals for every case", () => {
  for (const integration of ["coherent", "noncoherent"]) for (const swerling of [0, 1, 2, 3, 4]) for (const phase of integration === "coherent" ? ["fixed", "per-pulse"] : ["fixed"]) {
    const opts = { integration, pulses: 4, pfa: 1e-3, swerling, phase };
    const req = D.requiredSnr({ ...opts, pdRequired: 0.6 });
    const pd = D.pd(opts, req.rho1).pd;
    const w = simulate(opts, req.rho1, 6000, 20261003);
    assert.ok(pd >= w.lo && pd <= w.hi, `${integration} SW${swerling} ${phase}: Pd ${pd.toFixed(4)} outside [${w.lo.toFixed(4)}, ${w.hi.toFixed(4)}]`);
  }
});

test("fluctuation averages converge", () => {
  const r = D.pd({ integration: "noncoherent", pulses: 16, pfa: 1e-6, swerling: 1 }, 2);
  assert.ok(r.converged);
  assert.match(r.check, /change on doubling/);
  const c = D.pd({ integration: "coherent", pulses: 16, pfa: 1e-6, swerling: 2 }, 0.5);
  assert.match(c.check, /grid 0.005 vs 0.01/);
  const err = Number(c.check.split("= ")[1]);
  assert.ok(err < 1e-4, c.check);
});
