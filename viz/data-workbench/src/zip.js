/* Universal Data Workbench: the zip file of the export package, written and read in the browser.
 *
 * write(entries) makes one zip: each entry's bytes deflated (CompressionStream "deflate-raw") when that makes them
 * smaller, else stored; a Blob entry (a source file the person chose) is stored as it is and read a slice at a
 * time for its CRC-32, so a large file is never held in memory twice. Names are UTF-8 (flag bit 11). Past 65,535
 * entries or 4 GiB the archive is ZIP64. The result is a list of parts for one Blob, which the browser keeps on
 * disk when it is large.
 *
 * open(blob) reads a zip this file wrote (or any zip of stored and deflated entries): its central directory, then
 * one entry at a time. Pure apart from the streams: Node's checks run the same code.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWZip = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    TABLE[n] = c >>> 0;
  }

  /** CRC-32 of bytes, continuing from an earlier value. @param {Uint8Array} bytes @param {number} [crc] */
  function crc32(bytes, crc = 0) {
    let c = ~crc >>> 0;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return ~c >>> 0;
  }

  const LIMIT = 0xffffffff;
  const SLICE = 8 * 2 ** 20;
  const utf8 = (s) => new TextEncoder().encode(s);

  /** All the bytes a stream gives. @param {ReadableStream<Uint8Array>} stream */
  async function drain(stream) {
    const parts = [];
    let size = 0;
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      size += value.length;
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  /** Bytes through a CompressionStream or DecompressionStream of a format. */
  const through = (bytes, Stream, format) => drain(new Blob([bytes]).stream().pipeThrough(new Stream(format)));

  /** The MS-DOS time and date of a moment, in local time as zip tools read it. @param {Date} d */
  function dos(d) {
    const year = Math.min(2107, Math.max(1980, d.getFullYear()));
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }

  /** A little-endian record of [bytes, value] fields. @param {[number, number | bigint][]} fields */
  function record(fields) {
    const size = fields.reduce((a, [n]) => a + n, 0);
    const v = new DataView(new ArrayBuffer(size));
    let at = 0;
    for (const [n, x] of fields) {
      if (n === 2) v.setUint16(at, Number(x), true);
      else if (n === 4) v.setUint32(at, Number(x), true);
      else v.setBigUint64(at, BigInt(x), true);
      at += n;
    }
    return new Uint8Array(v.buffer);
  }

  /**
   * Write a zip of entries in order: { path, data } where data is a string, a Uint8Array or a Blob (stored as is).
   * `progress(done, total)` follows the entries; `stopped()` ends the work with an error named "AbortError".
   * @param {{ path: string, data: string | Uint8Array | Blob }[]} entries
   * @param {{ date?: Date, zip64?: boolean, progress?: (done: number, total: number) => void, stopped?: () => boolean }} [o]
   * @returns {Promise<{ parts: (Uint8Array | Blob)[], bytes: number, entries: number }>}
   */
  async function write(entries, o = {}) {
    const { time, date } = dos(o.date ?? new Date());
    const deflate = typeof CompressionStream === "function";
    const seen = new Set();
    /** @type {(Uint8Array | Blob)[]} */
    const parts = [];
    const central = [];
    let offset = 0;
    for (const [i, e] of entries.entries()) {
      if (o.stopped?.()) throw Object.assign(new Error("Cancelled while writing the package."), { name: "AbortError" });
      if (seen.has(e.path)) throw new Error(`The package names ${e.path} twice.`);
      seen.add(e.path);
      const name = utf8(e.path);
      let crc = 0, size = 0, packed, method = 0;
      if (e.data instanceof Blob) {
        size = e.data.size;
        for (let at = 0; at < size; at += SLICE) crc = crc32(new Uint8Array(await e.data.slice(at, at + SLICE).arrayBuffer()), crc);
        packed = e.data;
      } else {
        const raw = typeof e.data === "string" ? utf8(e.data) : e.data;
        size = raw.length;
        crc = crc32(raw);
        packed = raw;
        if (deflate && raw.length > 64) {
          const small = await through(raw, CompressionStream, "deflate-raw");
          if (small.length < raw.length) { packed = small; method = 8; }
        }
      }
      const csize = packed instanceof Blob ? packed.size : packed.length;
      const big = o.zip64 || size >= LIMIT || csize >= LIMIT || offset >= LIMIT;
      const extra = big ? record([[2, 1], [2, 24], [8, size], [8, csize], [8, offset]]) : new Uint8Array(0);
      const local = record([[4, 0x04034b50], [2, big ? 45 : 20], [2, 0x0800], [2, method], [2, time], [2, date], [4, crc],
        [4, big ? LIMIT : csize], [4, big ? LIMIT : size], [2, name.length], [2, big ? 20 : 0]]);
      // The local header's ZIP64 field holds only the two sizes.
      const localExtra = big ? record([[2, 1], [2, 16], [8, size], [8, csize]]) : extra;
      parts.push(local, name, localExtra, packed);
      central.push({ name, crc, size, csize, method, offset, big, extra });
      offset += local.length + name.length + (big ? 20 : 0) + csize;
      o.progress?.(i + 1, entries.length);
    }
    const start = offset;
    for (const c of central) {
      const head = record([[4, 0x02014b50], [2, (3 << 8) | 45], [2, c.big ? 45 : 20], [2, 0x0800], [2, c.method], [2, time], [2, date], [4, c.crc],
        [4, c.big ? LIMIT : c.csize], [4, c.big ? LIMIT : c.size], [2, c.name.length], [2, c.extra.length], [2, 0], [2, 0], [2, 0], [4, 0o100644 << 16],
        [4, c.big ? LIMIT : c.offset]]);
      parts.push(head, c.name, c.extra);
      offset += head.length + c.name.length + c.extra.length;
    }
    const dirSize = offset - start;
    const z64 = o.zip64 || central.length >= 0xffff || start >= LIMIT || dirSize >= LIMIT || central.some((c) => c.big);
    if (z64) {
      parts.push(record([[4, 0x06064b50], [8, 44], [2, 45], [2, 45], [4, 0], [4, 0], [8, central.length], [8, central.length], [8, dirSize], [8, start]]),
        record([[4, 0x07064b50], [4, 0], [8, offset], [4, 1]]));
      offset += 76;
    }
    const end = record([[4, 0x06054b50], [2, 0], [2, 0], [2, z64 ? 0xffff : central.length], [2, z64 ? 0xffff : central.length],
      [4, z64 ? LIMIT : dirSize], [4, z64 ? LIMIT : start], [2, 0]]);
    parts.push(end);
    return { parts, bytes: offset + end.length, entries: central.length };
  }

  /**
   * Open a zip: its entries by path, each readable once asked for. Refuses what is not a zip, an encrypted entry or
   * a compression other than stored or deflated.
   * @param {Blob} blob
   * @returns {Promise<{ paths: string[], has(path: string): boolean, size(path: string): number, bytes(path: string): Promise<Uint8Array>, text(path: string): Promise<string>, blob(path: string): Promise<Blob> }>}
   */
  async function open(blob) {
    const tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - 65557)).arrayBuffer());
    const tv = new DataView(tail.buffer);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("The file is not a zip archive.");
    let count = tv.getUint16(eocd + 10, true), dirSize = tv.getUint32(eocd + 12, true), start = tv.getUint32(eocd + 16, true);
    if (count === 0xffff || start === LIMIT || dirSize === LIMIT) {
      const loc = eocd - 20;
      if (loc < 0 || tv.getUint32(loc, true) !== 0x07064b50) throw new Error("The zip's ZIP64 locator is missing.");
      const at = Number(tv.getBigUint64(loc + 8, true));
      const rec = new DataView(await blob.slice(at, at + 56).arrayBuffer());
      if (rec.getUint32(0, true) !== 0x06064b50) throw new Error("The zip's ZIP64 directory end is missing.");
      count = Number(rec.getBigUint64(32, true)); dirSize = Number(rec.getBigUint64(40, true)); start = Number(rec.getBigUint64(48, true));
    }
    const dir = new Uint8Array(await blob.slice(start, start + dirSize).arrayBuffer());
    const dv = new DataView(dir.buffer);
    /** @type {Map<string, { method: number, csize: number, size: number, offset: number, flags: number }>} */
    const map = new Map();
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("The zip's central directory is damaged.");
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      let csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true), offset = dv.getUint32(p + 42, true);
      const n = dv.getUint16(p + 28, true), x = dv.getUint16(p + 30, true), c = dv.getUint16(p + 32, true);
      const name = new TextDecoder().decode(dir.subarray(p + 46, p + 46 + n));
      for (let q = p + 46 + n; q < p + 46 + n + x;) {
        const id = dv.getUint16(q, true), len = dv.getUint16(q + 2, true);
        if (id === 1) {
          let r = q + 4;
          if (size === LIMIT) { size = Number(dv.getBigUint64(r, true)); r += 8; }
          if (csize === LIMIT) { csize = Number(dv.getBigUint64(r, true)); r += 8; }
          if (offset === LIMIT) offset = Number(dv.getBigUint64(r, true));
        }
        q += 4 + len;
      }
      map.set(name, { method, csize, size, offset, flags });
      p += 46 + n + x + c;
    }
    async function dataOf(path) {
      const e = map.get(path);
      if (!e) throw new Error(`The zip holds no ${path}.`);
      if (e.flags & 1) throw new Error(`${path} is encrypted.`);
      if (e.method !== 0 && e.method !== 8) throw new Error(`${path} uses a compression this page cannot read.`);
      const head = new DataView(await blob.slice(e.offset, e.offset + 30).arrayBuffer());
      if (head.getUint32(0, true) !== 0x04034b50) throw new Error(`${path}: the zip's local header is damaged.`);
      const at = e.offset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
      return { e, data: blob.slice(at, at + e.csize) };
    }
    async function bytes(path) {
      const { e, data } = await dataOf(path);
      const raw = new Uint8Array(await data.arrayBuffer());
      return e.method === 8 ? through(raw, DecompressionStream, "deflate-raw") : raw;
    }
    return {
      paths: [...map.keys()],
      has: (path) => map.has(path),
      size: (path) => map.get(path)?.size ?? 0,
      bytes,
      text: async (path) => new TextDecoder().decode(await bytes(path)),
      /** A stored entry as a slice of the zip (nothing read); a deflated one inflated. */
      blob: async (path) => {
        const { e, data } = await dataOf(path);
        return e.method === 0 ? data : new Blob([await bytes(path)]);
      },
    };
  }

  return { crc32, write, open };
});
