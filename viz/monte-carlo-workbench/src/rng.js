/* Monte Carlo Probability Workbench: the pseudorandom generator. Philox4x32-10 (Salmon, Moraes, Dror and Shaw,
 * "Parallel random numbers: as easy as 1, 2, 3", SC 2011), a counter-based generator: each output block is a
 * function of a key and a counter alone. The page derives the key from the seed and a stream name, and the
 * counter from the replicate and the variable, so a draw does not depend on which worker computes it or in which
 * order. Node tests load this file with require(); the page and its workers run it as a plain script.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCRng = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const VERSION = "philox4x32-10/1";
  const SCHEME = "key = (seed, FNV-1a-32 of the stream name); counter = (draw j, replicate i, variable v, 0); 2 outputs of 32 bits give one double in (0, 1) with 53 bits";
  const M0 = 0xd2511f53, M1 = 0xcd9e8d57, W0 = 0x9e3779b9, W1 = 0xbb67ae85;

  /** The high 32 bits of the 64-bit product of two unsigned 32-bit integers. @param {number} a @param {number} b */
  function mulhi(a, b) {
    const al = a & 0xffff, ah = a >>> 16, bl = b & 0xffff, bh = b >>> 16;
    const lh = al * bh, hl = ah * bl;
    const mid = (lh & 0xffff) + (hl & 0xffff) + ((al * bl) >>> 16);
    return (ah * bh + (lh >>> 16) + (hl >>> 16) + (mid >>> 16)) >>> 0;
  }

  /**
   * One Philox4x32-10 output: 4 unsigned 32-bit integers from a 4-word counter and a 2-word key.
   * @param {number[]} ctr @param {number[]} key @param {Uint32Array} [out]
   */
  function philox(ctr, key, out = new Uint32Array(4)) {
    let c0 = ctr[0] >>> 0, c1 = ctr[1] >>> 0, c2 = ctr[2] >>> 0, c3 = ctr[3] >>> 0;
    let k0 = key[0] >>> 0, k1 = key[1] >>> 0;
    for (let r = 0; r < 10; r++) {
      if (r > 0) {
        k0 = (k0 + W0) >>> 0;
        k1 = (k1 + W1) >>> 0;
      }
      const hi0 = mulhi(M0, c0), lo0 = Math.imul(M0, c0) >>> 0;
      const hi1 = mulhi(M1, c2), lo1 = Math.imul(M1, c2) >>> 0;
      const n0 = (hi1 ^ c1 ^ k0) >>> 0, n2 = (hi0 ^ c3 ^ k1) >>> 0;
      c0 = n0;
      c1 = lo1;
      c2 = n2;
      c3 = lo0;
    }
    out[0] = c0;
    out[1] = c1;
    out[2] = c2;
    out[3] = c3;
    return out;
  }

  /** FNV-1a, 32 bits, of a stream name's UTF-16 code units. @param {string} name */
  function hashName(name) {
    let h = 0x811c9dc5;
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * The draws of one replicate i and one variable v in a named stream: a sequence of 2^32 Philox blocks.
   * @param {number} seed an integer in [0, 2^32) @param {string} name @param {number} i @param {number} v
   */
  function stream(seed, name, i, v) {
    const key = [seed >>> 0, hashName(name)];
    const ctr = [0, i >>> 0, v >>> 0, 0];
    const buf = new Uint32Array(4);
    let pos = 4, calls = 0, flip = false;
    const s = {
      /** The next unsigned 32-bit integer; its complement 2^32 − 1 − x for an antithetic draw. */
      u32() {
        if (pos === 4) {
          philox(ctr, key, buf);
          ctr[0] = (ctr[0] + 1) >>> 0;
          calls++;
          pos = 0;
        }
        return flip ? ~buf[pos++] >>> 0 : buf[pos++];
      },
      /** The next double in the open interval (0, 1): 53 random bits plus one half of the last place. */
      uniform() {
        const a = s.u32() >>> 5, b = s.u32() >>> 6;
        return (a * 67108864 + b + 0.5) / 9007199254740992;
      },
      /** An integer in [0, m) with no modulo bias, for 1 <= m <= 2^32 (rejection of the incomplete last range). @param {number} m */
      below(m) {
        if (m === 4294967296) return s.u32();
        const limit = 4294967296 - (4294967296 % m);
        for (;;) {
          const x = s.u32();
          if (x < limit) return x % m;
        }
      },
      /** A standard normal draw by the Box-Muller transform of two uniforms. */
      normal() {
        const u = s.uniform(), w = s.uniform();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
      },
      /**
       * Move to replicate i and variable v, at draw 0, without a new object. With `antithetic` every 32-bit output is
       * complemented, so uniform() gives exactly 1 − U for the U of the plain draw: the antithetic partner.
       * @param {number} i2 @param {number} v2 @param {boolean} [antithetic]
       */
      reset(i2, v2, antithetic = false) {
        ctr[0] = 0;
        ctr[1] = i2 >>> 0;
        ctr[2] = v2 >>> 0;
        pos = 4;
        flip = antithetic;
      },
      /** The number of Philox blocks this stream used. */
      get calls() { return calls; },
    };
    return s;
  }

  return { VERSION, SCHEME, philox, mulhi, hashName, stream };
});
