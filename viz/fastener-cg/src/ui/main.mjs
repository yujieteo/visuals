/* Entry point of the built page. */

import { start } from "./app.mjs";

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
