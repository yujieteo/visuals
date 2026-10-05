// The variance-reduction designs of the engine against exact reference values, with 3 fixed seeds and 16,384
// replicates: stratification, antithetic variables, control variates and common random numbers. Each estimate must
// lie within 5.5 standard errors of its reference (a false failure below 4e-8 for each of the about 60 comparisons);
// each variance ratio is checked against its theoretical value with a wide margin. Then the quadrature references,
// the moment status of continuous models, and the refusals with their messages.
import assert from "node:assert/strict";
import test from "node:test";
import { D, En } from "./helpers.mjs";

const SEEDS = [5, 77, 31337], BLOCKS = 16;

/** Compile and run model text to BLOCKS blocks with the given settings. @param {string} text @param {any} settings */
function run(text, settings) {
  const c = En.prepare(D.parse(text).record, { seed: 1, method: "independent", compare: "none", failure: "none", overrides: {}, ...settings });
  if (!c.ok) throw new Error(c.errors.join(" "));
  const status = En.momentStatus(c), refs = En.reference(c, status);
  let acc = En.empty(c);
  for (let b = 0; b < BLOCKS; b++) acc = En.merge(acc, En.block(c, b, { references: refs.map((/** @type {any} */ r) => r.values) }), c);
  return { c, status, refs, acc, sm: En.summary(c, acc, status, refs) };
}

/** The error of an estimate in standard errors of its own interval. @param {any} q */
const z = (q) => (q.est - q.reference) / q.se;

const INTEGRAL = "U ~ cuniform(a = 0, b = 1)\nmean area = sqrt(1 - U^2)\nprob low = U < 0.3\n";

test("stratification: unbiased, a large gain for a smooth integrand, and equal strata of n/K replicates", () => {
  for (const seed of SEEDS) {
    const r = run(INTEGRAL, { seed, method: "stratified", strata: 4 }), [area, low] = r.sm[0].alts[0].quantities;
    assert.ok(Math.abs(area.reference - Math.PI / 4) < 1e-12, "the quadrature reference of the area is π/4");
    for (const q of [area, low]) assert.ok(Math.abs(z(q)) < 5.5, `seed ${seed} ${q.name}: z = ${z(q)}`);
    // With 16 strata the variance inside a stratum of a smooth function falls about K² times.
    assert.ok(area.gain.ratio > 50, `seed ${seed}: variance ratio ${area.gain.ratio}`);
    assert.match(area.how, /stratified CLT interval, 16 equal strata/);
    assert.deepEqual(r.acc.methods[0].acc[0][0].st.map((/** @type {any} */ s) => s.n), Array(16).fill((BLOCKS * 1024) / 16));
  }
});

test("stratification removes only the variance that the stratified variable explains", () => {
  const text = "A ~ normal(mu = 0, sigma = 0.1)\nC ~ normal(mu = 0, sigma = 1)\nmean s = A + C\n";
  for (const seed of SEEDS) {
    const a = run(text, { seed, method: "stratified", stratify: "A" }).sm[0].alts[0].quantities[0];
    const c = run(text, { seed, method: "stratified", stratify: "C" }).sm[0].alts[0].quantities[0];
    assert.ok(a.gain.ratio < 1.15, `seed ${seed}: A explains 1 % of the variance, ratio ${a.gain.ratio}`);
    assert.ok(c.gain.ratio > 5, `seed ${seed}: C explains 99 %, ratio ${c.gain.ratio}`);
    for (const q of [a, c]) assert.ok(Math.abs(z(q)) < 5.5, `seed ${seed}: z = ${z(q)}`);
  }
  const c = En.prepare(D.parse(text).record, { seed: 1, method: "stratified", stratify: "B", overrides: {} });
  assert.equal(c.ok, false);
  assert.match(c.errors[0], /stratified variable B is not a scalar random variable/);
});

test("antithetic variables: a monotone function gains, an even function loses half, and the pairs are independent", () => {
  const text = "X ~ normal(mu = 0, sigma = 1)\nmean pos = max(X, 0)\nmean sq = X^2\nprob up = X > 1\n";
  for (const seed of SEEDS) {
    const [pos, sq, up] = run(text, { seed, method: "antithetic" }).sm[0].alts[0].quantities;
    for (const q of [pos, sq, up]) assert.ok(Math.abs(z(q)) < 5.5, `seed ${seed} ${q.name}: z = ${z(q)}`);
    // ρ = −(1/(2π))/(1/2 − 1/(2π)) ≈ −0.467 for max(X, 0), so the ratio is 1/(1 + ρ) ≈ 1.88; ρ = 1 for X², a ratio 0.5;
    // ρ = −p/(1 − p) ≈ −0.189 for the event X > 1, a ratio ≈ 1.23.
    assert.ok(pos.gain.ratio > 1.7 && pos.gain.ratio < 2.1, `seed ${seed}: max(X, 0) ratio ${pos.gain.ratio}`);
    assert.ok(sq.gain.rho > 0.999 && Math.abs(sq.gain.ratio - 0.5) < 1e-3, `seed ${seed}: X² ratio ${sq.gain.ratio}, ρ = ${sq.gain.rho}`);
    assert.ok(up.gain.ratio > 1.1 && up.gain.ratio < 1.4, `seed ${seed}: X > 1 ratio ${up.gain.ratio}`);
    assert.equal(pos.n, BLOCKS * 1024, "n counts the evaluations of the model");
    assert.match(pos.how, new RegExp(`CLT interval of ${(BLOCKS * 1024) / 2} antithetic pair means`));
  }
});

test("control variates: unbiased with the exact control mean, a bias with a wrong one, and a gain near 1/(1 − ρ²)", () => {
  const text = "param q = 110\nD ~ normal(mu = 100, sigma = 20)\nmean profit = 3*min(D, q) - 2*q\ncontrol C = D\n";
  for (const seed of SEEDS) {
    const good = run(text, { seed, method: "control", compare: "independent" }), q = good.sm[0].alts[0].quantities[0];
    assert.equal(good.c.control.exact[0].mean, 100);
    assert.equal(good.c.control.exact[0].sd, 20);
    assert.ok(Math.abs(z(q)) < 5.5, `seed ${seed}: z = ${z(q)}`);
    assert.ok(Math.abs(q.gain.ratio - 1 / (1 - q.gain.rho ** 2)) < 0.05 * q.gain.ratio && q.gain.ratio > 3, `seed ${seed}: ratio ${q.gain.ratio}, ρ = ${q.gain.rho}`);
    const plain = good.sm[1].alts[0].quantities[0];
    assert.ok(plain.se > 1.7 * q.se, "the comparison run with independent sampling has the larger standard error");
    // The failure: μ_C + 0.1 σ_C moves the estimate up by 0.1 β σ_C ≈ 4, about 25 standard errors.
    const bad = run(text, { seed, method: "control", failure: "control_mean" }).sm[0].alts[0].quantities[0];
    assert.ok(z(bad) > 10, `seed ${seed}: the wrong control mean gives z = ${z(bad)}`);
  }
  const refuse = (/** @type {string} */ control) => En.prepare(D.parse(`D ~ normal(mu = 1, sigma = 1)\nT ~ student(nu = 2)\nmean m = D\ncontrol C = ${control}\n`).record, { seed: 1, method: "control", overrides: {} });
  assert.match(refuse("D^2").errors[0], /not an affine function/);
  assert.match(refuse("D*T").errors[0], /not affine: a product/);
  assert.match(refuse("T").errors[0], /infinite/);
  assert.match(En.prepare(D.parse("D ~ normal(mu = 1, sigma = 1)\nmean m = D\n").record, { seed: 1, method: "control", overrides: {} }).errors[0], /needs a control/);
});

test("common random numbers: a gain when the alternatives move together, a loss when they move apart, and about 1 with separate streams", () => {
  const together = "param h = 1\nX ~ normal(mu = 0, sigma = 1)\nmean y = h*X\nalt \"h = 1\": h = 1\nalt \"h = 2\": h = 2\n";
  const apart = "param w = 1\nX ~ normal(mu = 0, sigma = 1)\nmean y = w*X - (1 - w)*X\nalt \"up\": w = 1\nalt \"down\": w = 0\n";
  for (const seed of SEEDS) {
    // Var(2X − X) = 1 against Var(X) + Var(2X) = 5; Var(−X − X) = 4 against 1 + 1 = 2.
    assert.ok(Math.abs(run(together, { seed }).sm[0].diffs[0].quantities[0].crn - 5) < 1e-6);
    assert.ok(Math.abs(run(apart, { seed }).sm[0].diffs[0].quantities[0].crn - 0.5) < 1e-6);
    const sep = run(together, { seed, streams: "separate" }), common = run(together, { seed });
    assert.ok(Math.abs(sep.sm[0].diffs[0].quantities[0].crn - 1) < 0.1, `seed ${seed}: separate streams, ratio ${sep.sm[0].diffs[0].quantities[0].crn}`);
    assert.equal(sep.sm[0].alts[0].quantities[0].est, common.sm[0].alts[0].quantities[0].est, "the first alternative keeps its streams");
    assert.notEqual(sep.sm[0].alts[1].quantities[0].est, common.sm[0].alts[1].quantities[0].est, "the second alternative has its own streams");
  }
});

test("quadrature references: two continuous variables, a mixed model, closed forms, linearity, and no value for too heavy a tail", () => {
  const ref = (/** @type {string} */ text) => { const c = En.prepare(D.parse(text).record, { seed: 1, method: "independent", overrides: {} }); return En.reference(c, En.momentStatus(c))[0]; };
  const disk = ref("X ~ cuniform(a = 0, b = 1)\nY ~ cuniform(a = 0, b = 1)\nprob inside = X^2 + Y^2 <= 1\n");
  assert.ok(Math.abs(disk.values[0] - Math.PI / 4) < 1e-8, `π/4 by nested quadrature: ${disk.values[0]}`);
  assert.equal(disk.method, "quadrature");
  const mix = ref("L ~ gamma(k = 2, theta = 1.5)\nN ~ poisson(lambda = L)\nprob zero = N == 0\nmean m = N\n");
  assert.ok(Math.abs(mix.values[0] - 0.16) < 1e-9 && Math.abs(mix.values[1] - 3) < 1e-8, "a gamma–Poisson mixture: P(N = 0) = (1 + θ)^(−k), E N = kθ");
  const closed = ref("X ~ exponential(rate = 0.5)\nprob p = X > 3\nmean m = X\n");
  assert.deepEqual(closed.closed, [true, true]);
  assert.ok(Math.abs(closed.values[0] - Math.exp(-1.5)) < 1e-15 && closed.values[1] === 2);
  const t = ref("T ~ student(nu = 1.5)\nY ~ gamma(k = 2, theta = 3)\nmean lin = 2*T + 3*Y + 1\nmean sq = T^2\nprob big = T > 10\n");
  assert.deepEqual([t.values[0], t.closed[0]], [19, true], "linearity: E[2T + 3Y + 1] = 19");
  assert.equal(t.values[1], null, "E[T²] is infinite for ν = 1.5, so it has no reference");
  assert.ok(Math.abs(t.values[2] - 0.0118296775568) < 1e-9, "P(T > 10) by quadrature");
  assert.match(ref("X ~ normal(mu = 0, sigma = 1)\nY ~ normal(mu = 0, sigma = 1)\nZ ~ normal(mu = 0, sigma = 1)\nprob p = X + Y + Z > 1\n").reason, /at most 2/);
});

test("moment status of continuous models: heavy tails by their order, light locations and scales, and unknown rates", () => {
  /** @param {string} text */
  const status = (text) => En.momentStatus(En.prepare(D.parse(text).record, { seed: 1, method: "independent", overrides: {} })).map((/** @type {any} */ s) => [s.mean, s.variance]);
  assert.deepEqual(status("T ~ student(nu = 1.5)\nmean m = 3*T - 1\n"), [["finite", "infinite"]]);
  assert.deepEqual(status("T ~ student(nu = 0.8)\nmean m = T\n"), [["infinite", "infinite"]]);
  assert.deepEqual(status("F ~ fisher(d1 = 4, d2 = 3)\nmean m = F\n"), [["finite", "infinite"]]);
  assert.deepEqual(status("U ~ cuniform(a = 0, b = 1)\nX ~ normal(mu = 10*U, sigma = 1 + U)\nmean m = X^2\n"), [["finite", "finite"]], "a random location and scale from a bounded law");
  assert.deepEqual(status("U ~ cuniform(a = 0, b = 1)\nX ~ exponential(rate = U)\nmean m = X\n"), [["unknown", "unknown"]], "a rate near 0 has no moment guarantee: E[1/U] is infinite");
  assert.deepEqual(status("G ~ gamma(k = 2, theta = 1)\nB ~ beta(a = G, b = 2)\nmean m = B\n"), [["finite", "finite"]], "a beta law is bounded whatever its shapes");
  assert.deepEqual(status("U ~ cuniform(a = 0.5, b = 1)\nmean m = 1/U\n"), [["unknown", "unknown"]], "a division by a random value is not a polynomial");
});
