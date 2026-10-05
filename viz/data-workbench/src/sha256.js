/* Universal Data Workbench: SHA-256 of a source file, read in chunks, so a 250 MB file is never held twice.
 *
 * The browser's own digest needs the whole file in memory at once; this one takes it a slice at a time. The
 * Node checks compare it with node:crypto on the same bytes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWSha256 = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  /** An incremental SHA-256: update() with byte arrays in order, then hex(). */
  function create() {
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const w = new Uint32Array(64);
    const block = new Uint8Array(64);
    let filled = 0, total = 0;

    function compress(bytes, at) {
      for (let i = 0; i < 16; i++) w[i] = (bytes[at + 4 * i] << 24) | (bytes[at + 4 * i + 1] << 16) | (bytes[at + 4 * i + 2] << 8) | bytes[at + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const a = w[i - 15], b = w[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, k] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (k + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
    }

    return {
      /** @param {Uint8Array} bytes */
      update(bytes) {
        let i = 0;
        total += bytes.length;
        if (filled) {
          const take = Math.min(64 - filled, bytes.length);
          block.set(bytes.subarray(0, take), filled);
          filled += take;
          i = take;
          if (filled < 64) return;
          compress(block, 0);
          filled = 0;
        }
        for (; i + 64 <= bytes.length; i += 64) compress(bytes, i);
        if (i < bytes.length) {
          block.set(bytes.subarray(i), 0);
          filled = bytes.length - i;
        }
      },
      hex() {
        const bits = total * 8;
        const tail = new Uint8Array(filled < 56 ? 64 - filled : 128 - filled);
        tail[0] = 0x80;
        const view = new DataView(tail.buffer);
        view.setUint32(tail.length - 8, Math.floor(bits / 2 ** 32));
        view.setUint32(tail.length - 4, bits >>> 0);
        this.update(tail);
        return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
      },
    };
  }

  /**
   * The SHA-256 of a Blob (a File), 8 MiB at a time, reporting progress as a share of its bytes.
   * @param {Blob} blob @param {(share: number) => void} [progress] @param {() => boolean} [stopped]
   */
  async function ofBlob(blob, progress, stopped) {
    const hash = create();
    const step = 8 * 2 ** 20;
    for (let at = 0; at < blob.size; at += step) {
      if (stopped?.()) return null;
      hash.update(new Uint8Array(await blob.slice(at, at + step).arrayBuffer()));
      progress?.(Math.min(1, (at + step) / blob.size));
    }
    return hash.hex();
  }

  return { create, ofBlob };
});
