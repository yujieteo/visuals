// The in-page probes the checks share: a fingerprint of everything a reader
// can see change, the heuristic choice of a visual's primary control, and the
// widest elements when a page overflows.

/** @typedef {import("./manifest.js").PrimaryControl} PrimaryControl */

/** Controls whose names say they leave the page, export, or change only chrome. */
const NOT_PRIMARY = "reset|export|import|save|copy|download|upload|print|share|theme|dark|light|help|about|close|menu|search|self-test|selftest|skip|beamdswitch|deck|narrat|voice|video|record|fullscreen|open|file|json|markdown|clear|delete|dismiss|cancel|remove|undo|redo|palette|keyboard|shortcut|install";

/**
 * A hash of the visible state: URL, text, form values, ARIA state and the
 * drawings in SVG and canvas. The element marked data-e2e-operated is left
 * out, so a control's own new value does not count as the page responding.
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
export function fingerprint(page) {
  return page.evaluate(() => {
    /** @param {string} s */
    const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
    const skip = document.querySelector("[data-e2e-operated]");
    const parts = [location.href, document.title, document.body ? document.body.innerText : ""];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (el === skip) continue;
      const input = /** @type {HTMLInputElement} */ (el);
      parts.push(input.type === "checkbox" || input.type === "radio" ? String(input.checked) : input.value);
    }
    for (const el of document.querySelectorAll("[aria-selected], [aria-pressed], [aria-expanded], [aria-checked], [hidden]")) {
      if (el === skip) continue;
      parts.push(["aria-selected", "aria-pressed", "aria-expanded", "aria-checked", "hidden"].map((a) => el.getAttribute(a)).join(","));
    }
    for (const svg of document.querySelectorAll("svg")) parts.push(hash(svg.innerHTML));
    for (const canvas of document.querySelectorAll("canvas")) {
      try { parts.push(hash(/** @type {HTMLCanvasElement} */ (canvas).toDataURL())); } catch { /* tainted or lost */ }
    }
    return hash(parts.join("\u0001"));
  });
}

/**
 * Mark the most likely primary control not yet tried with data-e2e-candidate,
 * in order of preference (sliders, selects, number fields, tabs, radios,
 * checkboxes, buttons, then focusable marks in a chart), and describe it.
 * Marking one at a time survives pages that re-render their controls.
 * @param {import("playwright").Page} page
 * @param {string[]} tried names of controls already operated
 * @returns {Promise<{ action: PrimaryControl["action"], name: string } | null>}
 */
export function markCandidate(page, tried) {
  return page.evaluate(({ tried, notPrimary }) => {
    const exclude = new RegExp(notPrimary, "i");
    /** @param {Element} el */
    const visible = (el) => {
      const anyEl = /** @type {any} */ (el);
      if (typeof anyEl.checkVisibility === "function" && !anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    /** @param {Element} el */
    const name = (el) => {
      const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      return [el.getAttribute("aria-label"), label?.textContent, el.closest("label")?.textContent, el.textContent, el.getAttribute("title"), el.id, /** @type {any} */ (el).name]
        .map((s) => (s ?? "").trim().replace(/\s+/g, " ")).find(Boolean)?.slice(0, 60) ?? el.tagName.toLowerCase();
    };
    const scope = document.querySelector("main") ?? document.body;
    /** @type {[string, PrimaryControl["action"]][]} */
    const groups = [
      ["input[type=range]", "range"],
      ["select", "select"],
      ["input[type=number]", "fill"],
      ["[role=tab]", "click"],
      ["input[type=radio]", "check"],
      ["input[type=checkbox]", "check"],
      ["button, [role=button]", "click"],
      ["svg [tabindex], canvas[tabindex]", "hover"],
    ];
    for (const el of document.querySelectorAll("[data-e2e-candidate]")) el.removeAttribute("data-e2e-candidate");
    for (const root of [scope, document.body]) {
      for (const [selector, action] of groups) {
        for (const el of root.querySelectorAll(selector)) {
          if (el.closest("header nav, footer, dialog:not([open]), [aria-hidden=true]")) continue;
          if (/** @type {any} */ (el).disabled || el.getAttribute("aria-disabled") === "true" || !visible(el)) continue;
          // An option that is already on does nothing when chosen again.
          if (el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-selected") === "true") continue;
          if (action === "check" && /** @type {HTMLInputElement} */ (el).type === "radio" && /** @type {HTMLInputElement} */ (el).checked) continue;
          const label = name(el);
          if (tried.includes(label) || exclude.test(label) || exclude.test(el.id) || el.closest("a[href]")) continue;
          el.setAttribute("data-e2e-candidate", "");
          return { action, name: label };
        }
      }
    }
    return null;
  }, { tried, notPrimary: NOT_PRIMARY });
}

/**
 * Operate one control the way a reader would.
 * @param {import("playwright").Page} page
 * @param {string} selector
 * @param {PrimaryControl["action"]} action
 * @param {string} [value]
 */
export async function operate(page, selector, action, value) {
  const control = page.locator(selector).first();
  await control.evaluate((el) => el.setAttribute("data-e2e-operated", ""), undefined, { timeout: 5_000 });
  if (action === "click") {
    await control.click({ timeout: 5_000 });
  } else if (action === "hover") {
    await control.hover({ timeout: 5_000 });
    await control.focus({ timeout: 5_000 });
  } else if (action === "check") {
    await control.click({ timeout: 5_000 });
  } else if (action === "select") {
    const target = value ?? await control.evaluate((el) => {
      const select = /** @type {HTMLSelectElement} */ (el);
      return [...select.options].find((o) => !o.disabled && o.value !== select.value)?.value ?? select.value;
    });
    await control.selectOption(target, { timeout: 5_000 });
  } else if (action === "fill") {
    const target = value ?? await control.evaluate((el) => {
      const input = /** @type {HTMLInputElement} */ (el);
      const step = Number(input.step) || 1;
      const current = Number(input.value) || 0;
      const max = input.max === "" ? Infinity : Number(input.max);
      return String(current + step <= max ? current + step : current - step);
    });
    await control.fill(target, { timeout: 5_000 });
    await control.press("Tab");
  } else if (action === "range") {
    const start = await control.inputValue();
    if (value === undefined) {
      await control.focus();
      const atMax = await control.evaluate((el) => {
        const input = /** @type {HTMLInputElement} */ (el);
        return Number(input.value) >= Number(input.max || 100);
      });
      await page.keyboard.press(atMax ? "Home" : "End");
    }
    // Keys fire input and change natively; set the value directly when given one, or when the keys did not move it.
    await control.evaluate((el, { v, start }) => {
      const input = /** @type {HTMLInputElement} */ (el);
      if (v === null && input.value !== start) return;
      input.value = v ?? String(Number(input.value) === Number(input.min || 0) ? input.max || 100 : input.min || 0);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, { v: value ?? null, start });
  }
}

/**
 * The elements that stick out past the viewport's right edge, widest first.
 * @param {import("playwright").Page} page
 * @returns {Promise<{ scrollWidth: number, clientWidth: number, culprits: string[] }>}
 */
export function overflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const clientWidth = root.clientWidth;
    const scrollWidth = Math.max(root.scrollWidth, document.body ? document.body.scrollWidth : 0);
    /** @param {Element} el */
    const describe = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "");
    /** @type {[number, string][]} */
    const wide = [];
    if (scrollWidth > clientWidth + 1) {
      for (const el of document.body.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > clientWidth + 1 && r.width > 0) wide.push([r.right, `${describe(el)} (right ${Math.round(r.right)} px)`]);
      }
    }
    wide.sort((a, b) => b[0] - a[0]);
    return { scrollWidth, clientWidth, culprits: wide.slice(0, 4).map(([, d]) => d) };
  });
}
