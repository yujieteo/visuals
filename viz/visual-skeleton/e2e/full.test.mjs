// Visual skeleton: the generator's example: the fuller browser checks (§28). The shared ones run through the kit's own controls (e2e/lib/kit.js);
// this file is the visual's own and names how to change its view: an example button (a Back entry), the marker
// that change shows in the Markdown record, and the slider the keyboard check moves.
import { kitSuite } from "../../../e2e/lib/kit.js";

await kitSuite("visual-skeleton", {
  change: (page) => page.locator('[data-example="heavy"]').click(),
  marker: "Damping ratio ζ = 0.60",
  slider: "#damping",
});
