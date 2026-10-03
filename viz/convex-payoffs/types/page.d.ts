// Types for the page's globals, so tsc can check its inline script. Development only: like tests/, it stays in
// this repository. In the page, beamdswitch.js and report.js publish their APIs on self; the WebMCP API is not
// yet in TypeScript's DOM types.

declare var Beamdswitch: typeof import("../beamdswitch.js");
declare var ConvexReport: typeof import("../report.js");

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
