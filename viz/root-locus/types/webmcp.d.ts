// Types for WebMCP (https://webmachinelearning.github.io/webmcp/), the browser API the page registers its
// read-only tools with. Browsers without it leave document.modelContext and navigator.modelContext undefined.

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean };
  // The agent's arguments, shaped by inputSchema; each tool reads its own.
  execute(input: any): Promise<unknown> | unknown;
}

interface ModelContext {
  registerTool(tool: WebMcpTool): void;
}

interface Document {
  modelContext?: ModelContext;
}

interface Navigator {
  modelContext?: ModelContext;
}
