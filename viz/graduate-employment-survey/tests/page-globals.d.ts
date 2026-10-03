// The globals the page's scripts publish on self: the deck writer (report.js) and the shared template.
declare var GesReport: typeof import("../report.js");
declare var Beamdswitch: import("./beamdswitch-template").BeamdswitchTemplate;

// The report type, for report.js's JSDoc: named here so the page itself holds no import( text.
declare namespace Deck {
  type Report = import("./beamdswitch-template").BeamdswitchReport;
}
