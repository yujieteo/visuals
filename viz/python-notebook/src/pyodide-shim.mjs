// The Pyodide module that polyscript imports in the worker (patch 1 of src/runtime-patches.js points it here).
// It loads pyodide.mjs and pyodide.asm.mjs from blob: URLs of the boot message, gives Pyodide the index URL
// https://pyodide.invalid/v<version>/full/ that src/worker-boot.js serves from memory, and loads every wheel of
// the lock file at start, so no import of an included package needs a download.
const P = globalThis.__pynb;

export const version = P.boot.version;

export async function loadPyodide(options = {}) {
  const asm = await import(P.moduleURL("pyodide.asm.mjs"));
  const { loadPyodide: load } = await import(P.moduleURL("pyodide.mjs"));
  const pyodide = await load({
    ...options,
    indexURL: P.boot.index,
    lockFileContents: P.boot.lock,
    packageBaseUrl: P.boot.index,
    createPyodideModule: asm.default,
    packages: P.boot.packages,
    checkAPIVersion: true,
  });
  P.loaded(pyodide);
  return pyodide;
}
