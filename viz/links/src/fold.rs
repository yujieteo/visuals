//! The Unicode that the search and the citation keys need, as the old page's JavaScript did it.

/// JavaScript's `\s`, which `trim` and `split(/\s+/)` use.
pub fn js_space(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}'
        | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

/// The words of `s`, split on JavaScript's white space.
pub fn words(s: &str) -> impl Iterator<Item = &str> { s.split(js_space).filter(|w| !w.is_empty()) }

/// `s.normalize("NFKC").toLowerCase()`. In links.json NFKC changes only `…`, `™`, `ﬁ` and six full-width
/// forms (Python's unicodedata, when the data was converted), and no sequence composes; a query's
/// full-width forms fold too.
pub fn fold(s: &str) -> String {
    if s.is_ascii() { return s.to_ascii_lowercase() }
    let mut t = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\u{ff01}'..='\u{ff5e}' => t.push(char::from_u32(c as u32 - 0xfee0).unwrap_or(c)),
            '…' => t.push_str("..."),
            '™' => t.push_str("TM"),
            'ﬁ' => t.push_str("fi"),
            c => t.push(c),
        }
    }
    t.to_lowercase()
}

/// Each character of the titles and authors in links.json whose NFKD has ASCII in it, then that ASCII
/// (Python's unicodedata, when the data was converted).
const ASCII: &str = "ÀA ÁA ÂA ÃA ÄA ÇC ÈE ÉE ÊE ËE ÍI ÏI ÑN ÒO ÓO ÕO ÖO ÙU ÚU ÛU ÜU àa áa âa ãa äa åa çc èe ée êe ëe ìi íi îi ïi ñn \
òo óo ôo õo öo ùu úu üu ýy ÿy ąa ćc ĊC ČC čc ēe ęe ěe ĞG ğg İI ńn ŐO őo řr ŞS şs ŠS šs ũu żz ŽZ ơo ưu ǗU ếe …... ™TM （( ）) ，, －- ：: ＿_";

/// `s.normalize("NFKD").replace(/[^\x00-\x7f]/g, "")`, for the titles and authors of links.json.
pub fn ascii(s: &str) -> String {
    s.chars().map(|c| if c.is_ascii() { c.to_string() } else {
        ASCII.split(' ').find(|p| p.starts_with(c)).map_or(String::new(), |p| p[c.len_utf8()..].into())
    }).collect()
}
