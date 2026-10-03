// Types for the page's globals, so tsc can check its inline scripts. Development only: like tests/, it stays in
// this repository. In the page, engine.js, beamdswitch.js and handcalc.js publish their APIs on self; the
// WebMCP API is not yet in TypeScript's DOM types.

declare var BeamDiag: typeof import("../engine.js");
declare var Beamdswitch: typeof import("../beamdswitch.js");
declare var HandCalc: typeof import("../handcalc.js");

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean };
  // A tool's input is the agent's JSON, unchecked until the tool reads it.
  execute(input: any): Promise<{ content: { type: string; text: string }[] }>;
}
interface ModelContext { registerTool(tool: ModelContextTool): void }
interface Document { modelContext?: ModelContext }
interface Navigator { modelContext?: ModelContext }

type BeamDiagModel = ReturnType<typeof import("../engine.js").validate>;
/** A section as the page keeps it: its shape and the dimensions or properties that shape takes, in SI. */
interface BeamDiagSectionSpec { shape: string; b?: number; h?: number; d?: number; t?: number; A?: number; I?: number; c?: number; Iy?: number; J?: number }
interface BeamDiagPreset {
  id: string; label: string; note: string; length: number; material: string;
  supports: BeamDiagModel["supports"]; loads: BeamDiagModel["loads"]; section: BeamDiagSectionSpec;
}
/** raw.json, which build.py inlines as the page's D. */
interface BeamDiagData {
  title: string; slug: string; version: string; summary: string; method: string;
  units: Record<string, string>; conventions: string[]; assumptions: string[];
  materials: { id: string; label: string; E: number; nu: number }[];
  sections: { id: string; label: string }[];
  presets: BeamDiagPreset[];
  nastran: { dialect: string; status: string; run: string[]; cards: { card: string; use: string }[] };
  sources: { id: string; title: string; url: string }[];
}
