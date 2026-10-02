/* DOM, storage and export helpers shared by the page's two interfaces (mab-ui and hours-ui), as
 * self.BanditPage. Nothing here computes a number; BanditLogic and HoursLogic do. */
(function (root) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const make = (e, attrs, text) => {
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  };
  const el = (tag, attrs, text) => make(document.createElement(tag), attrs, text);
  const svg = (tag, attrs, text) => make(document.createElementNS(NS, tag), attrs, text);
  /* Show msg in where (if given) and announce it to screen readers; clearing first makes a repeat heard. */
  function say(msg, where) {
    if (where) where.textContent = msg;
    const a = $("announce");
    a.textContent = "";
    setTimeout(() => { a.textContent = msg; }, 30);
  }
  /* Today's local date as YYYY-MM-DD, for exported reports. */
  function isoToday() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  /* localStorage when this context allows it, else null, and the text saved under key (or null). */
  function openStore(key) {
    let store = null;
    try { store = window.localStorage; store.getItem(key); } catch (e) { store = null; }
    let saved = null;
    if (store) { try { saved = store.getItem(key); } catch (e) { saved = null; } }
    return { store, saved };
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  root.BanditPage = { $, el, svg, say, isoToday, openStore, download };
})(typeof self !== "undefined" ? self : this);
