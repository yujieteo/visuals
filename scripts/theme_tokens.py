#!/usr/bin/env python3
"""Write the colour tokens of every page from the site's palettes.

    python3 scripts/theme_tokens.py            # rewrite the generated block of each file below
    python3 scripts/theme_tokens.py --check    # exit 1 when a file differs from what this would write

The only source of colour is look/src/theme.rs, an exact copy of yujieteo/site engine/src/theme.rs
(look/SOURCES.json pins it). The site gives each of its 19 families a light and a dark palette of 11 tokens
(bg, surface, fg, fg2, muted, line, accent, accent-text, warm, green, chrome), and the page selects them
as the site does: <html data-theme="family"> (none means Rose Pine), <html data-mode="light|dark"> (none
means the device's setting). The page tokens of the style guide come from them:

    --bg --surface --fg --line --accent --accent-text --warm --green --chrome   the palette, as is
    --fg2 --muted       the palette, moved toward --fg until each reaches 4.5:1 on --bg and --surface (text)
    --border, --faint   the line colour (decoration; never text)
    --focus             the accent text colour, moved toward --fg until it reaches 4.5:1 on --bg and --surface
    --on-focus          the background, for text on a --focus fill
    --grid              the background and the line colour, half and half (gridlines and table rules)
    --control, --axis   the line colour, moved toward --fg until it reaches 3:1 on --bg and --surface
    --c1 --c2 --c3 --c4 the accent, warm, accent-text (else fg2) and green colours, moved toward --fg until
                        each reaches 3:1 on --bg: the four series, in this order
    --hl                --fg, the datum that the story is about
    --ok --warn --bad   green, warm and warm, moved toward --fg until each reaches 4.5:1 on --bg
    --shadow            black at 16% in light and 60% in dark

A colour moves toward --fg in steps of 2%, as the site's build does for its own text colours. A palette
colour that already passes is not changed, and no hue that the palette lacks is added.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEME_RS = ROOT / "look" / "src" / "theme.rs"
TOKENS = ("bg", "surface", "fg", "fg2", "muted", "line", "accent", "accent-text", "warm", "green", "chrome")
DEFAULT = "rose-pine"
START, END = "/* generated: scripts/theme_tokens.py */", "/* end generated */"
# The files that carry the generated block between START and END.
TARGETS = (ROOT / "scripts" / "kit" / "style-tokens.css", ROOT / "viz" / "radar-network" / "src" / "style-tokens.css")

ROW = re.compile(r'\("([\w-]+)",\s*"([\w-]+)",\s*"([\w-]+)",\s*"([0-9a-fA-F ]*)",\s*"([0-9a-fA-F ]*)"\)')


def families():
    """[(family, light palette, dark palette)] in the site's order; a palette is a dict of token to (r, g, b).

    A family with one scheme wears it in both modes, as engine/src/theme.rs does."""
    out = []
    for family, _, _, light, dark in ROW.findall(THEME_RS.read_text(encoding="utf-8")):
        light, dark = light.strip() or dark.strip(), dark.strip() or light.strip()
        out.append((family, *({t: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for t, h in zip(TOKENS, p.split())}
                              for p in (light, dark))))
    return out


def luminance(c):
    r, g, b = [v / 255 / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def mix(a, b, t):
    """a moved toward b by t (0 to 1), channel by channel."""
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def reach(colour, toward, over, minimum):
    """colour, moved toward `toward` in steps of 2% until it has `minimum`:1 on every colour of `over`."""
    for step in range(0, 101, 2):
        c = mix(colour, toward, step / 100)
        if all(ratio(c, o) >= minimum for o in over):
            return c
    return toward


def hexed(c):
    return "#%02x%02x%02x" % c


def page_tokens(p, dark):
    """The page's tokens for one palette, as an ordered list of (name, value)."""
    bg, surface, fg = p["bg"], p["surface"], p["fg"]
    control = reach(p["line"], fg, (bg, surface), 3.0)
    third = p["accent-text"] if p["accent-text"] != p["accent"] else p["fg2"]
    series = [reach(c, fg, (bg,), 3.0) for c in (p["accent"], p["warm"], third, p["green"])]
    status = [reach(c, fg, (bg,), 4.5) for c in (p["green"], p["warm"], p["warm"])]
    tokens = [(t, hexed(reach(p[t], fg, (bg, surface), 4.5) if t in ("fg2", "muted") else p[t])) for t in TOKENS]
    tokens += [("grid", hexed(mix(bg, p["line"], 0.5))), ("control", hexed(control)), ("axis", hexed(control))]
    tokens += [("c%d" % (i + 1), hexed(c)) for i, c in enumerate(series)]
    focus = reach(p["accent-text"], fg, (bg, surface), 4.5)
    tokens += [("focus", hexed(focus))]
    tokens += [("ok", hexed(status[0])), ("warn", hexed(status[1])), ("bad", hexed(status[2])), ("hl", hexed(fg))]
    tokens.append(("shadow", "rgb(0 0 0 / 0.6)" if dark else "rgb(0 0 0 / 0.16)"))
    return tokens


def declarations(p, dark):
    return "".join("--%s:%s;" % kv for kv in page_tokens(p, dark)) + "color-scheme:" + ("dark" if dark else "light")


# Tokens that follow the palette by name, so a family block does not repeat them.
ALIASES = (("border", "var(--line)"), ("faint", "var(--line)"), ("on-focus", "var(--bg)"))


def block():
    """The generated CSS: the aliases, then one set of rules per family, as the site's theme.css() orders them.

    Light is the base; the device's dark setting applies unless data-mode is light; data-mode=dark applies always."""
    lines = [START, ":root{" + "".join("--%s:%s;" % a for a in ALIASES) + "}"]
    for family, light, dark in families():
        sel = ":root" if family == DEFAULT else ':root[data-theme="%s"]' % family
        d, l = declarations(dark, True), declarations(light, False)
        lines.append("%s{%s}" % (sel, l))
        lines.append("@media (prefers-color-scheme: dark){%s:not([data-mode=\"light\"]){%s}}" % (sel, d))
        lines.append("%s[data-mode=\"dark\"]{%s}" % (sel, d))
    default_light = next(light for family, light, _ in families() if family == DEFAULT)
    # Print: always the default light palette. Four :root pseudo-classes outweigh any family and mode rule above.
    lines.append("@media print{:root:root:root:root{%s}}" % declarations(default_light, False))
    lines.append(END)
    return "\n".join(lines)


def rewrite(text):
    """text with the generated block between START and END replaced by the current one."""
    start, end = text.find(START), text.find(END)
    if start < 0 or end < start:
        raise SystemExit("no generated block (%s ... %s) to replace" % (START, END))
    return text[:start] + block() + text[end + len(END):]


def stale(write=False):
    """The target files whose generated block differs from the current one, rewritten when ``write``."""
    out = []
    for path in TARGETS:
        old = path.read_text(encoding="utf-8")
        new = rewrite(old)
        if new != old:
            out.append(path.relative_to(ROOT).as_posix())
            if write:
                path.write_text(new, encoding="utf-8")
    return out


def main(argv):
    check = argv == ["--check"]
    if argv and not check:
        raise SystemExit(__doc__)
    out = stale(write=not check)
    if check and out:
        print("stale (run python3 scripts/theme_tokens.py): " + ", ".join(out))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
