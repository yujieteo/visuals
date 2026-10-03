// The globals the page's scripts publish, for type checking only: the engine (dt-engine, typed by its own JSDoc
// typedefs) and the shared beamdswitch template (beamdswitch.js, which stays unchecked as a verbatim copy).
declare var DiagonalTension: Engine;
declare var Beamdswitch: { deck(report: Record<string, unknown>): string };
