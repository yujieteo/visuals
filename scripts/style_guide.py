"""Shared page style for builders: the visual style guide's tokens as inline CSS.

The token values live under "style_guide" in design-tokens.json and follow
interactive-visual-spec/references/style-guide.md in yujieteo/skills. A builder
puts THEME_SCRIPT first in <head> and root_css(tokens) first in its <style>,
then declares its domain colours as aliases, such as --energy:var(--hl).
"""

# The site's own theme line (yujieteo/site templates/base.html): follow the
# reader's Light or Dark choice on teoyujie.org, else the system setting.
THEME_SCRIPT = (
    '<script id="site-theme">try { var t = localStorage.getItem("theme"); '
    'if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; '
    "} catch (e) {}</script>"
)


def _decls(values):
    return ";".join(f"--{name}:{value}" for name, value in values.items())


def root_css(tokens, extra=""):
    """:root tokens for both themes; extra is appended to the light :root block."""
    guide = tokens["style_guide"]
    light, dark = _decls(guide["light"]), _decls(guide["dark"])
    fonts = f"--sans:{tokens['font_sans']};--mono:{tokens['font_mono']}"
    tail = f";{extra}" if extra else ""
    return (
        f":root{{{light};{fonts}{tail};color-scheme:light dark}}"
        f'@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{{dark}}}}}'
        f':root[data-theme="dark"]{{{dark};color-scheme:dark}}'
        f':root[data-theme="light"]{{color-scheme:light}}'
    )


def luminance(hex_color):
    """WCAG relative luminance of a #rrggbb colour."""
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a, b):
    """WCAG contrast ratio between two #rrggbb colours, from 1 to 21."""
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)
