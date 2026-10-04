// Prepare offline (website version only): one verified, version-consistent copy of the page and the runtime
// in the browser's Cache Storage, served by sw.js.
//
// Prepare offline and Check for update are the same command. It reads the page from the site (cache
// "no-store", past the service worker), takes the runtime list from that page, downloads every file into a
// new cache and checks its byte count and SHA-256. Only a complete, checked cache becomes current; the old
// one stays current until then and is deleted after. A failure deletes the new cache and keeps the old one.
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory();
  if (node) module.exports = api;
  else (root.PyNb = root.PyNb || {}).offline = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const POINTER = "pynb-pointer";
  const base = () => new URL("./", location.href);
  const pointerURL = () => new URL("pointer", base());

  /** Whether this page can have an offline copy: an https (or localhost) page with service workers. */
  const supported = () => typeof caches !== "undefined" && "serviceWorker" in navigator && /^https?:$/.test(location.protocol);

  /** @returns {Promise<{cache: string, build: string, urls: string[], bytes: number, prepared: number} | null>} */
  async function readPointer() {
    const response = await (await caches.open(POINTER)).match(pointerURL());
    return response ? response.json() : null;
  }

  /**
   * The offline state now: "ready" only when the pointer exists, the service worker controls the page and
   * every file of the current copy is still in the cache.
   * @returns {Promise<{state: "unsupported" | "none" | "ready" | "incomplete", missing?: number, pointer?: any}>}
   */
  async function status() {
    if (!supported()) return { state: "unsupported" };
    const pointer = await readPointer();
    if (!pointer) return { state: "none" };
    const cache = await caches.open(pointer.cache);
    let missing = 0;
    for (const url of pointer.urls) if (!(await cache.match(url))) missing++;
    if (missing || !navigator.serviceWorker.controller) return { state: "incomplete", missing, pointer };
    return { state: "ready", pointer };
  }

  /**
   * Download, check and switch to the site's current version.
   * @param {(done: number, total: number, path: string) => void} progress
   * @param {(file: any, bytes: ArrayBuffer) => Promise<void>} verify
   * @returns {Promise<{changed: boolean, build: string, bytes: number, persisted: boolean | null}>}
   */
  async function prepare(progress, verify) {
    const registration = await navigator.serviceWorker.register("sw.js");
    const pageResponse = await fetch("./", { cache: "no-store" });
    if (!pageResponse.ok) throw new Error(`the page: HTTP ${pageResponse.status}`);
    const html = await pageResponse.text();
    const block = new DOMParser().parseFromString(html, "text/html").getElementById("pynb-runtime");
    if (!block) throw new Error("the site's page has no runtime list");
    const manifest = JSON.parse(block.textContent);
    const old = await readPointer();
    const now = await status();
    if (old && old.build === manifest.build && now.state === "ready") return { changed: false, build: old.build, bytes: old.bytes, persisted: null };
    const name = `pynb-${manifest.build}`;
    await caches.delete(name);
    const cache = await caches.open(name);
    try {
      const page = () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      const urls = [base().href, new URL("index.html", base()).href];
      await cache.put(urls[0], page());
      await cache.put(urls[1], page());
      const total = manifest.downloads.reduce((sum, f) => sum + f.bytes, 0);
      let done = 0;
      for (const file of manifest.downloads) {
        const url = new URL(file.path, base()).href;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`${file.path}: HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        await verify(file, bytes);
        await cache.put(url, new Response(bytes, { headers: { "Content-Type": response.headers.get("Content-Type") || "application/octet-stream" } }));
        urls.push(url);
        done += file.bytes;
        progress(done, total, file.path);
      }
      const pointer = { cache: name, build: manifest.build, urls, bytes: total, prepared: Date.now() };
      await (await caches.open(POINTER)).put(pointerURL(), new Response(JSON.stringify(pointer), { headers: { "Content-Type": "application/json" } }));
    } catch (error) {
      await caches.delete(name);
      throw error;
    }
    for (const key of await caches.keys()) if (key.startsWith("pynb-") && key !== name && key !== POINTER) await caches.delete(key);
    const worker = registration.active || registration.waiting || registration.installing;
    if (worker) worker.postMessage({ type: "pynb-pointer" });
    if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: "pynb-pointer" });
    let persisted = null;
    try { persisted = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : null; } catch { persisted = null; }
    return { changed: true, build: manifest.build, bytes: manifest.downloads.reduce((sum, f) => sum + f.bytes, 0), persisted };
  }

  return { supported, status, prepare };
});
