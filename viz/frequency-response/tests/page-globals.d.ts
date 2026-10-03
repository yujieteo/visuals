// The globals the page's scripts share: the engine script (<script id="fr-engine">) publishes self.FreqResponse,
// which the UI script reads. npm run typecheck copies the page's scripts to .typecheck/inline/ first.
declare var FreqResponse: typeof import("../.typecheck/inline/fr-engine.js");

// WebMCP: the browser's model-context API, where a page registers read-only tools for agents.
interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean };
  // Each tool validates its own agent-supplied JSON input, so the input is untyped here.
  execute(input?: any): Promise<{ content: { type: string; text: string }[] }>;
}
interface ModelContext {
  registerTool(tool: ModelContextTool): void;
}
interface Document {
  modelContext?: ModelContext;
}
interface Navigator {
  modelContext?: ModelContext;
}

// The engine's types, for the UI script, derived from the API it publishes.
declare namespace FR {
  type Api = typeof FreqResponse;
  type Inputs = ReturnType<Api["defaultInputs"]>;
  type Block = Inputs["plant"];
  type MimoInputs = NonNullable<Inputs["mimo"]>;
  type Complex = ReturnType<Api["cx"]>;
  type Analysis = ReturnType<Api["analyze"]>;
  type SisoAnalysis = Exclude<Analysis, { system: "mimo" }>;
  type MimoAnalysis = Extract<Analysis, { system: "mimo" }>;
  type CurveRow = NonNullable<ReturnType<Api["curves"]>>[number];
  type MimoCurves = NonNullable<ReturnType<Api["mimoCurves"]>>;
  type LocusPoint = NonNullable<ReturnType<Api["nyquistLocus"]>>[number];
}
