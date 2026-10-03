// Page globals the templates read, for type checking only. EGLogicApi is typed in english-grammar-logic.js.
declare var EGLogic: EGLogicApi;
declare var EGReport: typeof import("../report.js");

// Types for report.js's JSDoc, named here so the page that inlines it verbatim holds no import( text.
declare namespace Deck {
  type Report = import("../tests/beamdswitch-template").BeamdswitchReport;
  type Frame = import("../tests/beamdswitch-template").BeamdswitchFrame;
}
