/* Browser persistence (spec 8.1): a named library and a separately
 * autosaved working pattern, both in localStorage. Every access is guarded:
 * storage can be missing (private windows) or full. */

export const LIBRARY_KEY = "fastener-cg:library:v1";
export const WORKING_KEY = "fastener-cg:working:v1";

export class StorageFullError extends Error {}

function store() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  const s = store();
  if (!s) throw new Error("Browser storage is not available here; export the pattern to a file instead.");
  try {
    s.setItem(key, value);
  } catch (e) {
    const full = e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014);
    throw full ? new StorageFullError("Browser storage is full, so the pattern was not saved. Export it to a file to keep it.") : e;
  }
}

function read(key) {
  const s = store();
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

/* { name: { pattern, saved } } */
export function readLibrary() {
  try {
    const value = JSON.parse(read(LIBRARY_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function writeLibrary(library) {
  write(LIBRARY_KEY, JSON.stringify(library));
}

export function readWorking() {
  return read(WORKING_KEY);
}

export function writeWorking(json) {
  write(WORKING_KEY, json);
}

/* "Name", "Name (2)", "Name (3)", … — the first not in `taken`. */
export function uniqueName(name, taken) {
  if (!taken.includes(name)) return name;
  const stem = name.replace(/ \(\d+\)$/, "");
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})`;
    if (!taken.includes(candidate)) return candidate;
  }
}
