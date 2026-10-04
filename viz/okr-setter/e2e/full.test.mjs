// OKR Setter: the fuller browser checks (§28). The shared ones run through the kit's own controls (e2e/lib/kit.js);
// this file is the visual's own and names how to change its view: an example button (a Back entry), the marker
// that change shows in the Markdown record, and the slider the keyboard check moves (a score key result's).
import { kitSuite } from "../../../e2e/lib/kit.js";

await kitSuite("okr-setter", {
  change: (page) => page.locator('[data-example="race"]').click(),
  marker: "Run a 10 km race by the end of the year",
  slider: "#o1_k3_slider",
});
