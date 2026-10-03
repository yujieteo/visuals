// Page globals every visual's JavaScript may read, for type checking only: the site's beamdswitch report
// template (inlined byte-identical, so it is not type-checked itself) as far as pages call it, and WebMCP.
// A visual's tsconfig.json includes this file; its own globals go in its folder.
declare var Beamdswitch: { deck(report: object): string };

// WebMCP: the pages register read-only tools with document.modelContext (navigator.modelContext in earlier drafts).
interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: object;
  execute(input?: any): Promise<object>;
}
interface ModelContext {
  registerTool(tool: ModelContextTool): void;
}
interface Document { modelContext?: ModelContext }
interface Navigator { modelContext?: ModelContext }
