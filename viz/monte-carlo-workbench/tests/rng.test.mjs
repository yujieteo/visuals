// The generator: Philox4x32-10 against the known-answer vectors of Random123 (kat_vectors), the 32-bit high
// product against BigInt, and the stream scheme: a draw depends only on (seed, stream name, replicate, variable).
import assert from "node:assert/strict";
import test from "node:test";
import { Rng } from "./helpers.mjs";

/** @param {Uint32Array} a */
const hex = (a) => [...a].map((x) => x.toString(16).padStart(8, "0")).join(" ");

test("Philox4x32-10 matches the Random123 known-answer vectors", () => {
  assert.equal(hex(Rng.philox([0, 0, 0, 0], [0, 0])), "6627e8d5 e169c58d bc57ac4c 9b00dbd8");
  assert.equal(hex(Rng.philox([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff], [0xffffffff, 0xffffffff])), "408f276d 41c83b0e a20bc7c6 6d5451fd");
  assert.equal(hex(Rng.philox([0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344], [0xa4093822, 0x299f31d0])), "d16cfe09 94fdcceb 5001e420 24126ea1");
});

test("the high 32 bits of a 32 x 32 product equal the BigInt product, at the edges and at 10,000 fixed points", () => {
  const pts = [0, 1, 0xffff, 0x10000, 0x7fffffff, 0x80000000, 0xffffffff, 0xd2511f53, 0xcd9e8d57];
  const s = Rng.stream(3, "mulhi", 0, 0);
  for (let i = 0; i < 10000; i++) pts.push(s.u32());
  for (const a of pts.slice(0, 200)) for (const b of pts.slice(-50)) assert.equal(Rng.mulhi(a, b), Number((BigInt(a) * BigInt(b)) >> 32n), `${a} x ${b}`);
});

test("a draw depends only on seed, stream name, replicate and variable, not on the order of the calls", () => {
  const first = Rng.stream(42, "model", 7, 3), again = Rng.stream(42, "model", 7, 3);
  const a = Array.from({ length: 9 }, () => first.uniform());
  for (let i = 0; i < 5; i++) Rng.stream(42, "model", 8, 3).uniform();
  assert.deepEqual(Array.from({ length: 9 }, () => again.uniform()), a);
  const moved = Rng.stream(42, "model", 0, 0);
  moved.reset(7, 3);
  assert.deepEqual(Array.from({ length: 9 }, () => moved.uniform()), a, "reset() moves to the same counter");
  assert.notDeepEqual(Array.from({ length: 9 }, () => Rng.stream(42, "other", 7, 3).uniform()), a, "another stream name gives other draws");
  assert.notDeepEqual(Array.from({ length: 9 }, () => Rng.stream(43, "model", 7, 3).uniform()), a, "another seed gives other draws");
});

test("uniforms lie in the open interval (0, 1), and below(m) returns each of m values", () => {
  const s = Rng.stream(1, "range", 0, 0);
  let lo = 1, hi = 0;
  for (let i = 0; i < 100000; i++) { const u = s.uniform(); lo = Math.min(lo, u); hi = Math.max(hi, u); }
  assert.ok(lo > 0 && hi < 1);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(s.below(7));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(Rng.hashName("model"), Rng.hashName("model"));
});
