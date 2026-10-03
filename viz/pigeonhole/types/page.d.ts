// The globals the page's inline scripts share through `self`, for the type check only (see tsconfig.json).
// The engine's type comes from its extracted copy; Beamdswitch is declared by hand because the verbatim
// beamdswitch copy is left out of the check.
interface Window {
  Pigeonhole: typeof import("../.typecheck/inline/pigeonhole-engine.js");
  Beamdswitch: { DEFAULT_VOICE: string; SECTIONS: [string, string][]; deck(report: object): string };
}
