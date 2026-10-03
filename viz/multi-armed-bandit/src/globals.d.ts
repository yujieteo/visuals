// Page globals the templates read, for type checking only; report.js is described only as far as they call it.
declare var BanditLogic: typeof import("./multi-armed-bandit-logic.js");
declare var BanditReport: { report(...args: any[]): object };
