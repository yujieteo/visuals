"""The site's theme script, which every page carries unchanged before its first <style>.

scripts/rules.py checks each page for it (the theme rule), and scripts/visual_kit.py puts it in every
generated page.
"""

# The site's own theme lines (yujieteo/site web/shell.html), with a storage listener for a page in a frame:
# the reader's family ("theme", none means Rose Pine) and Light or Dark ("mode", none means the device's)
# go to <html data-theme> and <html data-mode>, and a choice made in the site's header arrives as a storage
# event. scripts/theme_tokens.py writes the palettes that these attributes select.
THEME_SCRIPT = (
    '<script id="site-theme">try { var h = document.documentElement, read = function () { '
    'var m = localStorage.getItem("mode"), t = localStorage.getItem("theme"); '
    'if (m === "light" || m === "dark") h.dataset.mode = m; else delete h.dataset.mode; '
    'if (t) h.dataset.theme = t; else delete h.dataset.theme; }; read(); '
    'addEventListener("storage", function (e) { if (e.key === "mode" || e.key === "theme") read(); }); '
    "} catch (e) {}</script>"
)
