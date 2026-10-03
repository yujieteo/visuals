// The engine the page's scripts share as the global RiemannRoch, for the type check only (see tsconfig.json).
// Its type comes from src/engine.js, which also exports it to Node.
declare var RiemannRoch: typeof import("../src/engine.js");
