// The model the page's inline scripts share as the global TampinesEvents, for the type check only (see
// tsconfig.json). Its type comes from the extracted model, which also exports it to Node for the tests.
declare var TampinesEvents: typeof import("../.typecheck/inline/events-model.js");
type TampinesData = ReturnType<typeof TampinesEvents.load>;
type ClassEvent = TampinesData["events"][number];
type TampinesState = ReturnType<typeof TampinesEvents.defaults>;
