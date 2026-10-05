// The expression language: precedence and associativity, vectors, the TeX form, and the refusal of every name that
// is not a model name, a constant or a listed function, so no expression can run JavaScript.
import assert from "node:assert/strict";
import test from "node:test";
import { X } from "./helpers.mjs";

const slots = new Map([["a", 0], ["b", 1], ["c", 2], ["V", 3]]);
const env = [2, 3, 4, [1, 5, 6, 3]];
/** @param {string} src */
const ev = (src) => X.build(src, slots).fn(env);

test("operators follow the usual precedence: * before -, ^ right-associative and above unary minus", () => {
  assert.equal(ev("a*b - c*a"), -2);
  assert.equal(ev("a - b - c"), -5);
  assert.equal(ev("a / b / c"), 2 / 3 / 4);
  assert.equal(ev("a ^ b ^ 2"), 512);
  assert.equal(ev("-a^2"), -4);
  assert.equal(ev("2^-1"), 0.5);
  assert.equal(ev("a + b * c ^ 2 - 1"), 49);
  assert.equal(ev("a < b and b < c or 0"), 1);
  assert.equal(ev("not a == 2"), 0);
  assert.throws(() => ev("a < b < c"), /do not chain/);
});

test("vectors: element-wise arithmetic and comparisons, reductions, indexing from 1, and an element-wise if", () => {
  assert.deepEqual(ev("V - 2"), [-1, 3, 4, 1]);
  assert.equal(ev("sum(V > 3)"), 2);
  assert.equal(ev("sum(pmax(V - [2, 2, 2, 2], 0))"), 8);
  assert.deepEqual(ev("if(V <= 4, 0, V)"), [0, 5, 6, 0]);
  assert.equal(ev("[30, 20, 10][2]"), 20);
  assert.equal(ev("distinct([1, 1, 2])"), 2);
  assert.equal(ev("maxcount([1, 1, 2])"), 2);
  assert.deepEqual(ev("normalize([1, 3])"), [0.25, 0.75]);
  assert.throws(() => ev("V[5]"), /outside 1..4/);
  assert.throws(() => ev("[1, 2] + [1, 2, 3]"), /do not combine/);
});

test("injection strings are refused before any run: no property access, no globals, no strings, no statements", () => {
  for (const src of ["constructor", "__proto__", "toString", "valueOf", "this", "globalThis", "alert(1)", "eval(\"1\")", "Function(\"x\")",
    "a.constructor", "[].constructor", "a; b", "a = 1", "`x`", "hasOwnProperty(1)", "process", "require(\"fs\")"]) {
    assert.throws(() => X.build(src, slots), X.ExprError, src);
  }
  assert.throws(() => X.build("x".repeat(1001), slots), /at most 1000/);
  assert.throws(() => X.build("(".repeat(70) + "1" + ")".repeat(70), slots), /nests at most/);
});

test("the names an expression reads, and its TeX", () => {
  assert.deepEqual([...X.names(X.parse("max(a - b, 0) + pi"))].sort(), ["a", "b"]);
  assert.equal(X.tex(X.parse("max(X - seats, 0)")), "\\max\\left(X - \\mathrm{seats}, 0\\right)");
  assert.equal(X.tex(X.parse("a / b")), "\\frac{a}{b}");
  assert.equal(X.texName("p_show"), "p_{\\mathrm{show}}");
});
