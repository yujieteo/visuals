// Types for the page's globals that no checked file declares, so tsc can check the inline scripts. Development
// only: like tests/, it stays in this repository. Beamdswitch is beamdswitch.js, an unchanged copy of the site's
// templates/beamdswitch.js left out of the check; the WebMCP API is not yet in TypeScript's DOM types.

interface BeamdswitchFrame { title: string; body?: string; narration: string; notes?: string; key?: string; plot?: { x: [unknown, unknown]; xlabel?: string; ylabel?: string; curves: string[] } }
interface BeamdswitchReport { meta?: Record<string, string | undefined>; narration: string; notes?: string; setup?: BeamdswitchFrame[]; method?: BeamdswitchFrame[]; results?: BeamdswitchFrame[]; checks?: BeamdswitchFrame[] }
declare var Beamdswitch: { DEFAULT_VOICE: string; SECTIONS: [string, string][]; deck(report: BeamdswitchReport): string };

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

interface Window {
  // What one inline block publishes for the next. Each block's own code is checked where it is written; on
  // self the engine and its data are a property bag, so they read as any.
  BayesData: any;
  Bayes: any;
  BayesTools: ModelContextTool[];
}
