//! Themes: 19 families, Rose Pine first (the page default; Rose Pine Dawn is its light side). A family
//! with one empty palette has one scheme only: both modes wear the other palette. The page follows the device's
//! light or dark setting; exports use one preset. A theme ID names a family or one preset.

pub const VERSION: u32 = 2;
pub const TOKENS: [&str; 11] = ["bg", "surface", "fg", "fg2", "muted", "line", "accent", "accent-text", "warm", "green", "chrome"];
/// Family, light ID, dark ID, light palette, dark palette (in TOKENS order). Sources and the 4.5:1 text
/// contrast shifts are listed in docs/themes.md.
pub const THEMES: [(&str, &str, &str, &str, &str); 19] = [
    ("rose-pine", "rose-pine-dawn", "rose-pine", "faf4ed fffaf3 575279 706c8c 716c8b 908ba1 786995 286983 866a63 56738c f2e9e1",
        "191724 1f1d2e e0def4 908caa 87849e 666479 c4a7e7 9ccfd8 f6c177 5b8da7 26233a"),
    ("site", "site-light", "site-dark", "f4f3f1 ebe9e6 141414 3f3e3c 716f6b 8e8c8a 141414 141414 74726e 3f3e3c f4f3f1",
        "000000 111111 f2f2f2 c2c2c2 8a8a8a 5a5a5a f2f2f2 f2f2f2 c2c2c2 c2c2c2 000000"),
    ("solarized", "solarized-light", "solarized-dark", "FDF6E3 EEE8D5 586E75 657B83 667474 968E7A 268BD2 1F6FA8 CB4B16 859900 EEE8D5",
        "002B36 073642 93A1A1 839496 7A9199 437786 268BD2 6CB0E3 CB4B16 859900 00212B"),
    ("dracula", "dracula-light", "dracula", "FFFBEB F4EFD8 1F1F1F 4B4A5C 635D97 91909E 644AC9 A3144D A34D14 14710A EFEAD4",
        "282A36 343746 F8F8F2 C3C5D2 7E90C4 6F7287 BD93F9 FF79C6 FFB86C 50FA7B 21222C"),
    ("catppuccin", "catppuccin-latte", "catppuccin-mocha", "EFF1F5 E6E9EF 4C4F69 5C5F77 6B6D7F 888B95 8839EF 1E66F5 FE640B 40A02B DCE0E8",
        "1E1E2E 313244 CDD6F4 BAC2DE 80859E 66687D CBA6F7 89B4FA FAB387 A6E3A1 11111B"),
    ("tokyo-night", "tokyo-night-day", "tokyo-night", "E1E2E7 E9E9ED 3760BF 6172B0 5C638A 7D8091 2E7DE9 9854F1 B15C00 587539 D0D5E3",
        "1A1B26 24283B C0CAF5 A9B1D6 7A81A9 5E6687 7AA2F7 7DCFFF FF9E64 9ECE6A 16161E"),
    ("gruvbox", "gruvbox-light", "gruvbox-dark", "FBF1C7 F2E5BC 3C3836 665C54 7A6B5D 9A8968 B57614 076678 AF3A03 79740E EBDBB2",
        "282828 3C3836 EBDBB2 D5C4A1 9B8C7C 77706B FABD2F 83A598 FE8019 B8BB26 1D2021"),
    ("nord", "nord-light", "nord", "ECEFF4 E5E9F0 2E3440 4C566A 616D86 858A95 5E81AC 5E81AC D08770 A3BE8C D8DEE9",
        "2E3440 3B4252 ECEFF4 D8DEE9 8E9CB5 737D90 88C0D0 88C0D0 D08770 A3BE8C 242933"),
    ("absolutely", "absolutely-light", "absolutely-dark", "f9f9f7 f4f4f2 2d2d2b 60605e 70706e 8f8f8d 96624d 97624d b84e34 167e40 f4f4f2",
        "2d2d2b 373735 f9f9f7 c6c6c4 b2b2b0 787876 d39176 d39076 fe7857 00c853 373735"),
    ("everforest", "everforest-light", "everforest-dark", "fdf6e3 f4f0d9 5c6a72 616f74 616f75 88908f 627164 57707e 6e6c69 627164 efebd4",
        "2d353b 343f44 d3c6aa a0aa9e a7a998 7c7e77 a7c080 7fbbb3 e69875 a7c080 232a2e"),
    ("github", "github-light", "github-dark", "ffffff f6f8fa 1f2328 656d76 656d76 8d9399 0969da 0969da 9a6700 1a7f37 f6f8fa",
        "0d1117 161b22 e6edf3 b0b6bc 7d8590 5c6269 2f81f7 2f81f7 d29922 3fb950 010409"),
    ("linear", "linear-light", "linear-dark", "ffffff f5f5f5 08090a 3e3e44 62666d 8f9193 5b66ca 5b66ca 886a45 507958 f5f5f5",
        "08090a 191a1b f7f8f8 d0d6e0 8a8f98 5e5e62 707bd7 8fa4ff ffc47c 89d196 0f1011"),
    ("notion", "notion-light", "notion-dark", "ffffff f7f6f3 37352f 696863 72706d 94938f 2773be 1172c7 a55f18 437b5c f7f6f3",
        "191919 202020 d4d4d4 a5a5a5 9b9b9b 666666 529cca 529cca ffa344 4dab9a 202020"),
    ("one", "one-light", "one-dark", "fafafa eaeaeb 383a42 67696f 686970 8f9094 3e65bd 3e65bd 85631e 457449 eaeaeb",
        "282c34 21252b abb2bf 8d939f 8d94a1 707784 61afef 61afef d19a66 98c379 21252b"),
    ("proof", "proof", "proof", "f5f3ed efede6 2f312d 4b4d48 6e6b63 8b8b86 3d755d 3d755d 776b41 3d755d efede6",
        ""),
    ("raycast", "raycast-light", "raycast-dark", "ffffff f9f9f9 07080a 454647 6a6b6c 919292 bf4b4c bf4b4c 926d21 377e5d f9f9f9",
        "101010 1b1b1c f9f9f9 bfbfbf 9c9c9d 5f6061 ff6363 ff6363 ffbc33 59d499 1b1b1c"),
    ("vercel", "vercel-light", "vercel-dark", "ffffff fafafa 171717 666666 666666 929292 016cea 016cea 986a1e 337d6c fafafa",
        "000000 111111 ededed a1a1a1 a1a1a1 5c5c5c 137af3 52a8ff f5a623 50e3c2 000000"),
    ("vscode-plus", "vscode-plus-light", "vscode-plus-dark", "ffffff f3f3f3 000000 404040 6f6f6f 939393 0000ff 0000ff a31515 008000 f3f3f3",
        "1e1e1e 252526 d4d4d4 a6a6a6 8d8d8d 6a6a6a 569cd6 569cd6 ce9178 6a9955 252526"),
    ("xcode", "xcode-light", "xcode-dark", "ffffff f4f4f4 000000 404040 5d6c79 919191 9b2393 9b2393 c41a16 267507 f4f4f4",
        "1f1f24 2c2c31 ffffff c7c7c8 8c96a1 6c6c70 fc5fa3 fc5fa3 fc6a5d 67b7a4 1f1f24"),
];

/// The family and scheme of a preset ID. Unknown IDs are None.
pub fn find(id: &str) -> Option<(&'static str, bool)> {
    let id = id.trim();
    THEMES.iter().find_map(|t| if id == t.1 { Some((t.0, false)) } else if id == t.2 { Some((t.0, true)) } else { None })
}

/// The preset canonical exports use: the theme's own preset, else its family's light one.
pub fn export(theme: &str) -> &str {
    if find(theme).is_some() { theme } else { THEMES.iter().find(|t| t.0 == theme).map_or("site-light", |t| t.1) }
}

/// The exact palette of a preset. Unknown IDs fall back to site-light. A one-scheme family wears its palette in both.
pub fn palette(id: &str) -> [u32; 11] {
    let (fam, dark) = find(id).unwrap_or(("site", false));
    let t = THEMES.iter().find(|t| t.0 == fam).unwrap();
    let mut p = [0; 11];
    p.iter_mut().zip((if (dark && !t.4.is_empty()) || t.3.is_empty() { t.4 } else { t.3 }).split(' ')).for_each(|(v, h)| *v = u32::from_str_radix(h, 16).unwrap_or(0));
    p
}

/// Every family as CSS: `data-theme` on <html> picks a family. Light or dark follows the device
/// unless <html data-mode> holds the reader's choice (the header's button).
pub fn css() -> String {
    let vars = |s: &str, m: &str| s.split(' ').zip(TOKENS).map(|(h, t)| format!("--{t}:#{h};")).collect::<String>() + "color-scheme:" + m;
    THEMES.iter().map(|(f, _, _, l, d)| {
        let r = if *f == "rose-pine" { ":root".into() } else { format!(":root[data-theme={f}]") };
        let (light, dark) = (vars(if l.is_empty() { d } else { l }, if l.is_empty() { "dark" } else { "light" }), vars(if d.is_empty() { l } else { d }, if d.is_empty() { "light" } else { "dark" }));
        format!("{r}{{{light}}}@media(prefers-color-scheme:dark){{{r}:not([data-mode=light]){{{dark}}}}}{r}[data-mode=dark]{{{dark}}}\n")
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_pair() {
        assert_eq!(find("dracula"), Some(("dracula", true)));
        assert_eq!(find("nord-light"), Some(("nord", false)));
        assert_eq!(palette("solarized-dark")[0], 0x002B36);
        assert!(css().contains("@media(prefers-color-scheme:dark){:root[data-theme=gruvbox]:not([data-mode=light]){--bg:#282828;"));
        assert!(css().contains(":root[data-theme=site][data-mode=dark]{--bg:#000000;"));
        assert!(css().starts_with(":root{--bg:#faf4ed;"));
        assert_eq!(palette("rose-pine")[0], 0x191724);
        assert_eq!(palette("github-light")[0], 0xffffff);
    }

    /// Text on the page background (fg, fg2, muted, accent-text) and on the surface (fg, fg2) reaches 4.5:1 in every
    /// added family.
    #[test]
    fn added_families_read() {
        let lum = |c: u32| {
            let f = |s: u32| { let v = ((c >> s) & 255) as f64 / 255.0; if v <= 0.03928 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) } };
            0.2126 * f(16) + 0.7152 * f(8) + 0.0722 * f(0)
        };
        let ratio = |a: u32, b: u32| { let (x, y) = (lum(a).max(lum(b)), lum(a).min(lum(b))); (x + 0.05) / (y + 0.05) };
        for (i, t) in THEMES.iter().enumerate().filter(|(i, _)| *i == 0 || *i > 7) {
            for id in [t.1, t.2] {
                let p = palette(id);
                for (a, b) in [(2, 0), (3, 0), (4, 0), (7, 0), (2, 1), (3, 1)] {
                    assert!(ratio(p[a], p[b]) >= 4.5, "{id} {i}: {} on {}", TOKENS[a], TOKENS[b]);
                }
            }
        }
    }
}
