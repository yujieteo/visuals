"""Shared inline-script pieces that several builders emit byte for byte.

Each helper returns exactly the text a page ships, so a builder that uses it
produces the same page as one that spelled the text out.
"""
import re


def strip_types(js):
    """Drops the type annotations a JavaScript template carries for `npm run typecheck`, which pages never ship:
    whole-line JSDoc blocks (/** ... */), whole-line `// @ts-expect-error` notes, and inline JSDoc comments such as
    `let /** @type {State} */ S` (with the one space after them). Everything else is kept byte for byte, so a page
    built from an annotated template is the page built from the unannotated one. Templates use /** only for types."""
    out = re.sub(r"^[ \t]*/\*\*[\s\S]*?\*/[ \t]*\n", "", js, flags=re.M)
    out = re.sub(r"^[ \t]*// @ts-expect-error\b.*\n", "", out, flags=re.M)
    return re.sub(r"/\*\*[\s\S]*?\*/ ?", "", out)


def compact(js):
    """Drops type annotations (strip_types), whole-line comments, blank lines and indentation. The sources use no
    template literals or line continuations, so every statement is unchanged; tests run the compacted code the page
    ships."""
    out = re.sub(r"^[ \t]*/\*[\s\S]*?\*/[ \t]*\n", "", strip_types(js), flags=re.M)
    lines = [ln.strip() for ln in out.split("\n")]
    out = "\n".join(ln for ln in lines if ln and not ln.startswith("//"))
    assert "`" not in out and not re.search(r"\\$", out, re.M), "compact() cannot handle template literals or continuations"
    return out


def deck_buttons_js(slug, by_id=False):
    """The beamdswitch Save and Copy deck handlers. The page defines deck() and deckStatus first.

    by_id picks document.getElementById over document.querySelector, matching the page's other lookups.
    """
    find = (lambda name: f'document.getElementById("{name}")') if by_id else (lambda name: f'document.querySelector("#{name}")')
    return (
        'function saveDeck(text,name){const url=URL.createObjectURL(new Blob([text],{type:"text/markdown"})),'
        'a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();'
        "setTimeout(()=>URL.revokeObjectURL(url),1000)}\n"
        f'{find("save-beamdswitch")}.addEventListener("click",()=>{{const name="{slug}-beamdswitch.md";'
        "try{saveDeck(deck(),name);deckStatus.textContent=`Saved ${name}: open it in beamdswitch.`}"
        'catch{deckStatus.textContent="Could not save the beamdswitch deck here: use Copy deck instead."}});\n'
        f'{find("copy-beamdswitch")}.addEventListener("click",async()=>{{try{{await navigator.clipboard.writeText(deck());'
        'deckStatus.textContent="Copied the beamdswitch deck: paste it into beamdswitch."}'
        'catch{deckStatus.textContent="Could not copy the beamdswitch deck here: use the beamdswitch button to save it."}});'
    )
