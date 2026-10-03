// Page globals the templates read, for type checking only.
declare var OrientLogic: typeof import("./ooda-orientation-logic.js");
declare var OrientReport: typeof import("../report.js");

// Types for report.js's JSDoc, named here so the page that inlines it verbatim holds no import( text.
declare namespace Orient {
  type State = import("./ooda-orientation-logic.js").State;
  type Data = import("./ooda-orientation-logic.js").Data;
  type Item = import("./ooda-orientation-logic.js").Item;
  type Orientation = import("./ooda-orientation-logic.js").Orientation;
  type Transition = import("./ooda-orientation-logic.js").HistoryEntry & { from: string, to: string, moves: import("./ooda-orientation-logic.js").Move[], rejected: string[] };
  type Logic = typeof import("./ooda-orientation-logic.js");
  type Report = import("../tests/beamdswitch-template").BeamdswitchReport;
  type Frame = import("../tests/beamdswitch-template").BeamdswitchFrame;
}
