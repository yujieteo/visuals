"""The site's theme script, which every page carries unchanged before its first <style>.

scripts/rules.py checks each page for it (the theme rule), and scripts/visual_kit.py puts it in every
generated page.
"""

# The site's own theme line (yujieteo/site templates/base.html): follow the
# reader's Light or Dark choice on teoyujie.org, else the system setting.
THEME_SCRIPT = (
    '<script id="site-theme">try { var t = localStorage.getItem("theme"); '
    'if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; '
    "} catch (e) {}</script>"
)
