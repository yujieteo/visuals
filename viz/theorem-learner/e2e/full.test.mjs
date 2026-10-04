// Theorem Learner: the fuller browser checks (§28). The shared ones run through the kit's own controls (e2e/lib/kit.js);
// this file names how to change the view (the second proof of the default theorem, a Back entry), the text that
// change puts in the Markdown record (a step slogan of that proof only), and the slider the keyboard check moves
// (the step walker).
import { kitSuite } from "../../../e2e/lib/kit.js";

await kitSuite("theorem-learner", {
  change: (page) => page.locator("#surface .proof-picker button:nth-of-type(2)").click(),
  marker: "Cover the space by bounded neighborhoods.",
  slider: "#walk",
});
