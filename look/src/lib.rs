//! The site's look for a sealed artifact: yujieteo/site's themes, fonts, base styles and header, so a
//! page built here reads like the site's own pages wherever the site serves it. theme.rs, style.css and
//! fonts/ are exact copies of the site's files (SOURCES.json pins the commit and each SHA-256).
//!
//! An artifact sits at play/<slug>/index.html on the site, so its header links climb two folders. It
//! has no site search: that needs the site's index, which a sealed copy cannot carry.

pub mod theme;

/// The three Fira subsets, as the site embeds them: CSS family, OpenType bytes.
pub const FONTS: [(&str, &[u8]); 3] = [
    ("Fira Sans", include_bytes!("../fonts/sans.otf")),
    ("Fira Mono", include_bytes!("../fonts/mono.otf")),
    ("Fira Math", include_bytes!("../fonts/math.otf")),
];
/// The site's base styles (web/style.css).
pub const STYLE: &str = include_str!("../style.css");
/// In a frame of a site page: no header, no space above the page.
const EMBED: &str = ":root[data-embed] .top { display: none; } :root[data-embed] main { padding: 0 0 1rem; }";

/// The light palette exports use, as `--token` names and #rrggbb values: saved figures print in it.
pub fn print_palette() -> Vec<(&'static str, String)> {
    let p = theme::palette("site-light", "");
    theme::TOKENS.iter().zip(p).map(|(t, c)| (*t, format!("#{c:06x}"))).collect()
}

pub fn base64(b: &[u8]) -> String {
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(b.len().div_ceil(3) * 4);
    for c in b.chunks(3) {
        let n = c.iter().enumerate().fold(0u32, |n, (i, &x)| n | (x as u32) << (16 - 8 * i));
        s.extend((0..4).map(|i| if i <= c.len() { A[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' }));
    }
    s
}

/// HTML text and attribute escaping.
pub fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn fonts() -> String {
    FONTS.iter().map(|(fam, b)| format!("@font-face{{font-family:\"{fam}\";src:url(data:font/otf;base64,{}) format(\"opentype\")}}\n", base64(b))).collect()
}

/// The theme dialog's buttons, one per family, as the site draws them.
fn families() -> String {
    theme::THEMES.iter().map(|(f, _, _, l, d)| {
        let c = |p: &str, i: usize| p.split(' ').nth(i).unwrap_or("000000").to_string();
        let name: Vec<String> = f.split('-').map(|w| w[..1].to_uppercase() + &w[1..]).collect();
        let swatch = format!("--a:#{};--b:#{};--c:#{};--d:#{}", c(l, 0), c(l, 6), c(d, 0), c(d, 6));
        format!(r#"<button type="button" value="{f}" style="{swatch}"><i></i>{}</button>"#, name.join(" "))
    }).collect()
}

/// What a page needs to sit on the site.
pub struct Page<'a> {
    pub title: &'a str,
    pub description: &'a str,
    /// The path back to the site's root, such as "../../".
    pub root: &'a str,
    /// The page's own CSS, after the site's.
    pub style: &'a str,
    pub body: &'a str,
    /// Scripts and anything else after the dialogs.
    pub script: &'a str,
}

/// The whole page: the site's theme before the first paint, its fonts, themes and base styles, its
/// header and theme dialog, then the page's body and scripts.
pub fn page(p: &Page) -> String {
    let root = p.root;
    format!(r#"<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>
// The reader's theme, before the first paint: the site's localStorage keys mode and theme. In a frame of
// a site page (a notebook that embeds the artifact), that page has the header, and a theme picked
// there arrives as a storage event.
try {{
  const h = document.documentElement, read = () => {{
    const m = localStorage.getItem("mode"), t = localStorage.getItem("theme");
    m === "light" || m === "dark" ? (h.dataset.mode = m) : delete h.dataset.mode;
    t ? (h.dataset.theme = t) : delete h.dataset.theme;
  }};
  read();
  if (window.frameElement) h.dataset.embed = "";
  addEventListener("storage", (e) => (e.key === "mode" || e.key === "theme") && read());
}} catch (e) {{}}
</script>
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="icon" href="data:,">
<style>{fonts}{themes}{site}{EMBED}{style}</style>
<header class="top"><a href="{root}index.html">Yu Jie</a><nav>
<a href="{root}notes/index.html">Notes</a><a href="{root}stories/index.html">Stories</a><a href="{root}play/index.html">Play</a>
<button type="button" class="mode" aria-label="Theme" title="Theme"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 0 0 11z"/></svg></button>
</nav></header>
<main>{body}</main>
<dialog class="look" aria-label="Theme"><form method="dialog"><h2>Theme</h2><p class="muted">For every page, in this browser.</p><div class="fams">{families}</div>
<div class="modes"><button type="button" value="auto">Auto</button><button type="button" value="light">Light</button><button type="button" value="dark">Dark</button></div></form></dialog>
<script>
// Any dialog closes on a click on its backdrop.
document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => e.target === d && d.close()));
// Theme: a family and light, dark or the device's (Auto), picked in the header's dialog and
// remembered for every page of the site.
(() => {{
  const h = document.documentElement, d = document.querySelector(".look"), fam = (b) => b.parentNode.className === "fams";
  const chosen = (b) => b.value === (fam(b) ? h.dataset.theme || "site" : h.dataset.mode || "auto");
  const show = () => d.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", chosen(b)));
  const set = (k, v) => {{
    v ? (h.dataset[k] = v) : delete h.dataset[k];
    try {{ v ? localStorage.setItem(k, v) : localStorage.removeItem(k); }} catch (e) {{}}
    show();
  }};
  document.querySelector(".mode").addEventListener("click", () => (show(), d.showModal()));
  d.addEventListener("click", (e) => {{
    const b = e.target !== d && e.target.closest("button");
    if (b) fam(b) ? set("theme", b.value === "site" ? "" : b.value) : set("mode", b.value === "auto" ? "" : b.value);
  }});
}})();
</script>
{script}
"#,
        title = esc(p.title), description = esc(p.description), fonts = fonts(), themes = theme::css(), site = STYLE,
        style = p.style, body = p.body, families = families(), script = p.script)
}

/// SHA-256, for the copies' pins.
pub fn sha256(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut h: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 { msg.push(0) }
    msg.extend_from_slice(&((data.len() as u64) * 8).to_be_bytes());
    for block in msg.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 { w[i] = u32::from_be_bytes(block[4 * i..4 * i + 4].try_into().unwrap()) }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let mut v = h;
        for i in 0..64 {
            let s1 = v[4].rotate_right(6) ^ v[4].rotate_right(11) ^ v[4].rotate_right(25);
            let ch = (v[4] & v[5]) ^ (!v[4] & v[6]);
            let t1 = v[7].wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = v[0].rotate_right(2) ^ v[0].rotate_right(13) ^ v[0].rotate_right(22);
            let maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            let t2 = s0.wrapping_add(maj);
            v = [t1.wrapping_add(t2), v[0], v[1], v[2], v[3].wrapping_add(t1), v[4], v[5], v[6]];
        }
        for (a, b) in h.iter_mut().zip(v) { *a = a.wrapping_add(b) }
    }
    h.iter().map(|x| format!("{x:08x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_match_their_pins() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let pins = std::fs::read_to_string(root.join("SOURCES.json")).unwrap();
        let mut n = 0;
        // "path": { ..., "sha256": "hex" }: the file's pin is the first sha256 after its name.
        for (i, _) in pins.match_indices("\": {") {
            let name = &pins[pins[..i].rfind('"').unwrap() + 1..i];
            if name == "files" { continue }
            let at = i + pins[i..].find("\"sha256\": \"").unwrap() + 11;
            let want = &pins[at..at + 64];
            assert_eq!(sha256(&std::fs::read(root.join(name)).unwrap()), want, "{name} differs from its pinned copy");
            n += 1;
        }
        assert_eq!(n, 6);
        assert_eq!(sha256(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn page_has_the_site_header_and_theme() {
        let html = page(&Page { title: "T & U", description: "d", root: "../../", style: ".x{}", body: "<p>b</p>", script: "" });
        assert!(html.contains(r#"<a href="../../play/index.html">Play</a>"#));
        assert!(html.contains("<title>T &amp; U</title>"));
        assert!(html.contains(":root[data-mode=dark]{--bg:#000000;"));
        assert!(html.contains("if (window.frameElement) h.dataset.embed") && html.contains(":root[data-embed] .top { display: none; }"));
        assert!(html.contains("font-family:\"Fira Math\""));
        assert!(print_palette().contains(&("bg", "#f4f3f1".to_string())));
    }
}
