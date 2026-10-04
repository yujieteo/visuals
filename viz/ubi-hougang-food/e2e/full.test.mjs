// Good food in Ubi, Hougang, Woodleigh, Paya Lebar and Eunos: the fuller browser checks (§28). Interim: these run the
// kit's shared checks (e2e/lib/kit.js) until the visual has its own browser checks. This file names how to change
// the view (an example button, a Back entry), the marker that change shows in the Markdown record, and the slider
// the keyboard check moves.
import { kitSuite } from "../../../e2e/lib/kit.js";

await kitSuite("ubi-hougang-food", {
  change: (page) => page.locator('[data-example="eunos-indian"]').click(),
  marker: "Indian in Eunos",
  slider: "#publishers",
});
