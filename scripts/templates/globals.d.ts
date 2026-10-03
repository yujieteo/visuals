// Page globals the templates read, for type checking only. The logic templates are typed by their own JSDoc. The
// report.js files are ports from each visualization's standalone repository, which types them; beamdswitch.js is the
// site's shared template, kept byte-identical here. Both are described here only as far as the templates call them.
declare var BanditLogic: typeof import("./multi-armed-bandit-logic.js");
declare var OrientLogic: typeof import("./ooda-orientation-logic.js");
declare var StockReport: typeof import("./stock-cases-report.js");
declare var Beamdswitch: { deck(report: object): string };
declare var BanditReport: { report(...args: any[]): object };
declare var OrientReport: { report(...args: any[]): object };
declare var EGReport: { report(...args: any[]): object };

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
declare var EGLogic: EGLogicApi;
