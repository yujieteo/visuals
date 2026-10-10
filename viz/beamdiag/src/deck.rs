//! The standard beamdswitch report template: one Markdown deck that beamdswitch turns into slides, a
//! handout, narration and a video, always in the same order:
//!
//!   front matter and title slide
//!   # Set-up               what was modelled, its units and conventions
//!   # Method               how the tool solved it
//!   # Results              the numbers, with key equations and plots
//!   # Checks and takeaway  what confirms the numbers, ending on one ::: key frame
//!
//! A frame's `body` is Markdown (LaTeX maths in $...$ or $$...$$); `narration` is plain spoken prose,
//! one caption per sentence. Every frame is narrated, and the last checks frame carries a key. The beam
//! diagram adds its hand calculations as a fifth section before the checks.

/// beamdswitch's British female default narrator.
pub const DEFAULT_VOICE: &str = "bf_emma";
pub const SECTIONS: [&str; 4] = ["Set-up", "Method", "Results", "Checks and takeaway"];
pub const HAND: &str = "Hand calculations";

#[derive(Clone, Debug, Default)]
pub struct Plot { pub x: [String; 2], pub xlabel: String, pub ylabel: String, pub curves: Vec<String> }

#[derive(Clone, Debug, Default)]
pub struct Frame { pub title: String, pub body: String, pub narration: String, pub notes: String, pub key: String, pub plot: Option<Plot> }

#[derive(Clone, Debug, Default)]
pub struct Meta { pub title: String, pub subtitle: String, pub author: String, pub date: String, pub voice: String }

/// A report: the title slide, then its frames by section (set-up, method, results, checks), and the
/// hand calculations, already cut into slides.
#[derive(Clone, Debug, Default)]
pub struct Report { pub meta: Meta, pub narration: String, pub notes: String, pub sections: [Vec<Frame>; 4], pub hand: Vec<Frame> }

pub fn one_line(s: &str) -> String { s.split_whitespace().collect::<Vec<_>>().join(" ") }

/// Markdown lines that would end a frame or a div early are refused rather than written.
fn block(text: &str, what: &str) -> Result<String, String> {
    let s = text.replace("\r\n", "\n").replace('\r', "\n");
    let s = s.trim();
    for line in s.split('\n') {
        let heading = { let h = line.len() - line.trim_start_matches('#').len(); (1..=2).contains(&h) && line[h..].starts_with(char::is_whitespace) };
        if heading || line.trim_start().starts_with(":::") { return Err(format!("{what} must not contain a heading or a ::: line: {line}")) }
    }
    Ok(s.to_string())
}

/// Narration is read aloud: no maths, markup or line structure.
fn spoken(text: &str, what: &str) -> Result<String, String> {
    let s = one_line(text);
    if s.is_empty() { return Err(format!("{what} needs a narration.")) }
    if s.contains(['$', '\\', '`', '*', '_', '#', '|', '<', '>']) { return Err(format!("{what} narration must be plain spoken prose: {s}")) }
    Ok(s)
}

fn div(out: &mut Vec<String>, name: &str, text: String) { out.extend([format!("::: {name}"), text, ":::".into(), String::new()]) }

fn frame(out: &mut Vec<String>, f: &Frame, place: &str) -> Result<(), String> {
    let title = one_line(&f.title);
    let what = format!("Frame \"{title}\" in {place}");
    if title.is_empty() { return Err(format!("A frame in {place} needs a title.")) }
    out.extend([format!("## {title}"), String::new()]);
    if !f.body.is_empty() { out.extend([block(&f.body, &what)?, String::new()]) }
    if let Some(p) = &f.plot {
        let mut lines = vec![format!("x: {}, {}", p.x[0], p.x[1])];
        if !p.xlabel.is_empty() { lines.push(format!("xlabel: {}", one_line(&p.xlabel))) }
        if !p.ylabel.is_empty() { lines.push(format!("ylabel: {}", one_line(&p.ylabel))) }
        lines.extend(p.curves.iter().map(|c| format!("y = {}", one_line(c))));
        div(out, "plot", lines.join("\n"));
    }
    if !f.key.is_empty() { div(out, "key", block(&f.key, &what)?) }
    if !f.notes.is_empty() { div(out, "notes", block(&f.notes, &what)?) }
    div(out, "narration", spoken(&f.narration, &what)?);
    Ok(())
}

fn front(out: &mut Vec<String>, meta: &Meta, notes: &str, narration: &str) -> Result<(), String> {
    if one_line(&meta.title).is_empty() { return Err("The report needs a title.".into()) }
    out.push("---".into());
    let voice = if one_line(&meta.voice).is_empty() { DEFAULT_VOICE.to_string() } else { meta.voice.clone() };
    for (k, v) in [("title", &meta.title), ("subtitle", &meta.subtitle), ("author", &meta.author), ("date", &meta.date), ("voice", &voice)] {
        if !one_line(v).is_empty() { out.push(format!("{k}: {}", one_line(v))) }
    }
    out.extend(["---".into(), String::new()]);
    if !notes.is_empty() { div(out, "notes", block(notes, "The title slide")?) }
    div(out, "narration", spoken(narration, "The title slide")?);
    Ok(())
}

/// The slide that opens section `n` (from 1), then its frames.
fn section(out: &mut Vec<String>, title: &str, n: usize, frames: &[Frame]) -> Result<(), String> {
    if frames.is_empty() { return Err(format!("The {title} section needs at least one frame.")) }
    out.extend([format!("# {}", one_line(title)), String::new()]);
    div(out, "narration", format!("Part {n}. {}.", one_line(title)));
    for f in frames { frame(out, f, title)? }
    Ok(())
}

/// The report's deck: the template's four sections, with the hand calculations as Part 4 before the
/// checks, which become Part 5.
pub fn deck(r: &Report) -> Result<String, String> {
    if !r.sections[3].last().is_some_and(|f| !f.key.is_empty()) { return Err("The last checks frame must carry a ::: key.".into()) }
    let mut out = vec![];
    front(&mut out, &r.meta, &r.notes, &r.narration)?;
    let mut n = 0;
    for (i, frames) in r.sections.iter().enumerate() {
        if i == 3 && !r.hand.is_empty() { n += 1; section(&mut out, HAND, n, &r.hand)? }
        n += 1;
        section(&mut out, SECTIONS[i], n, frames)?;
    }
    Ok(out.join("\n"))
}

/// Any sections of frames as Markdown that beamdswitch opens as a deck.
pub fn document(meta: &Meta, narration: &str, sections: &[(String, Vec<Frame>)]) -> Result<String, String> {
    let mut out = vec![];
    front(&mut out, meta, "", narration)?;
    for (i, (title, frames)) in sections.iter().enumerate() { section(&mut out, title, i + 1, frames)? }
    Ok(out.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_what_would_break_the_deck() {
        let f = |body: &str, narration: &str| Frame { title: "T".into(), body: body.into(), narration: narration.into(), key: "k".into(), ..Default::default() };
        let r = |body: &str, narration: &str| Report { meta: Meta { title: "R".into(), ..Default::default() }, narration: "Hello.".into(),
            sections: [vec![f("", "a")], vec![f("", "b")], vec![f("", "c")], vec![f(body, narration)]], ..Default::default() };
        assert!(deck(&r("## no", "x")).unwrap_err().contains("heading"));
        assert!(deck(&r("  ::: no", "x")).unwrap_err().contains("::: line"));
        assert!(deck(&r("#tag is fine", "x")).is_ok());
        assert!(deck(&r("", "a $x$")).unwrap_err().contains("plain spoken prose"));
        let md = deck(&r("Body", "Said.")).unwrap();
        assert!(md.starts_with("---\ntitle: R\nvoice: bf_emma\n---\n\n::: narration\nHello.\n:::\n\n# Set-up\n"));
        assert!(md.contains("# Checks and takeaway\n\n::: narration\nPart 4. Checks and takeaway.\n:::\n\n## T\n\nBody\n\n::: key\nk\n:::\n\n::: narration\nSaid.\n:::\n"));
    }
}
