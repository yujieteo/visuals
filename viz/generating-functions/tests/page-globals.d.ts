// The globals the page's scripts share: each script in index.html publishes its API on self. The page's own
// JSDoc names types through GFTypes rather than import(), so the built page holds no import( text at all.
declare var GF: typeof import("../engine.js");
declare var GFLab: typeof import("../lessons.js");
declare var Beamdswitch: import("./beamdswitch-template").BeamdswitchTemplate;
declare var GF_DATA: typeof import("../raw.json");

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

// The engine's and the curriculum's types, for the page's scripts.
declare namespace GFTypes {
  type Int = import("../engine.js").Int;
  type Rat = import("../engine.js").Rat;
  type Exact = import("../engine.js").Exact;
  type Complex = import("../engine.js").Complex;
  type BinaryTree = import("../engine.js").BinaryTree;
  type Lesson = import("../lessons.js").Lesson;
  type Params = import("../lessons.js").Params;
  type ParamSpec = import("../lessons.js").ParamSpec;
  type State = import("../lessons.js").State;
  type Route = import("../lessons.js").Route;
  type RouteRef = import("../lessons.js").RouteRef;
  type LessonRoute = import("../lessons.js").LessonRoute;
  type ProblemRoute = import("../lessons.js").ProblemRoute;
  type Report = import("../lessons.js").Report;
  type Slide = import("../lessons.js").Slide;
  type BeamdswitchFrame = import("./beamdswitch-template").BeamdswitchFrame;
}
