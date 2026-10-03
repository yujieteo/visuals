// The engine the page's inline scripts share as the global QueueTime, for the type check only (see
// tsconfig.json). Its type comes from the extracted engine, which also exports it to Node.
declare var QueueTime: typeof import("../.typecheck/inline/queue-time-engine.js");
