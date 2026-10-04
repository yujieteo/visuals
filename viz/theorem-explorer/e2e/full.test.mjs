// Theorem Explorer: the fuller browser checks (§28). The shared ones run through the kit's own controls (e2e/lib/kit.js);
// this file is the visual's own and names how to change its view: an example button (a Back entry), the marker
// that change shows in the Markdown record, and the slider the keyboard check moves.
import { kitSuite } from "../../../e2e/lib/kit.js";

await kitSuite("theorem-explorer", {
  change: (page) => page.locator('[data-example="tail-bounds"]').click(),
  marker: "Upper tail of a sum of independent fair coin flips",
  slider: "#budget",
});
