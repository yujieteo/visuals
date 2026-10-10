//! The page driven through its events, as the host sends them, without a browser: every command list
//! is valid JSON, edits re-solve, exports carry what they should, and the tools answer.

use beamdiag::app::App;
use beamdiag::json::{self, Value};

fn send(app: &mut App, ev: &str) -> Vec<Value> {
    let out = app.handle(ev);
    json::parse(&out).unwrap_or_else(|e| panic!("{ev}: {e}")).arr().unwrap().to_vec()
}

/// The value of the first command of `kind` aimed at `sel`.
fn find<'a>(cmds: &'a [Value], kind: &str, sel: &str) -> Option<&'a Value> { cmds.iter().find(|c| c.s(kind) == sel) }
fn html(cmds: &[Value], sel: &str) -> String { find(cmds, "html", sel).map_or(String::new(), |c| c.s("v").to_string()) }
fn text(cmds: &[Value], sel: &str) -> String { find(cmds, "text", sel).map_or(String::new(), |c| c.s("v").to_string()) }

fn started() -> App {
    let mut app = App::new();
    let fonts: Vec<String> = look::FONTS.iter().map(|f| format!("\"{}\"", look::base64(f.1))).collect();
    let c = send(&mut app, &format!("{{\"ev\":\"start\",\"w\":800,\"fonts\":[{}]}}", fonts.join(",")));
    assert!(html(&c, "#plots").starts_with("<svg") && html(&c, "#stats").contains("Determinate"));
    app
}

#[test]
fn the_page_opens_solved() {
    let mut app = App::new();
    let body = app.body("../../");
    assert!(!body.contains("{{") && body.contains("id=\"plotarea\"") && body.contains("data-key=\"s0\"") && body.contains("Pinned–pinned, uniform load"));
    assert!(body.contains("<td class=\"num\">") && body.contains("class=\"calc\""), "the table and the hand calculations are drawn");
    assert!(!body.contains("NaN") && !body.contains("undefined"));
}

#[test]
fn edits_resolve_after_a_pause() {
    let mut app = started();
    let c = send(&mut app, r#"{"ev":"input","field":"length","value":"8000"}"#);
    assert!(c.iter().any(|c| c.get("later").num() == Some(150.0)));
    // The right support moves with the right end.
    assert_eq!(find(&c, "value", "[data-field=\"supports.1.x\"]").map(|c| c.s("v")), Some("8000"));
    let c = send(&mut app, r#"{"ev":"timer"}"#);
    assert!(text(&c, "#section-derived").contains("A = "));
    assert!((app.r().model.length - 8.0).abs() < 1e-12);
    let c = send(&mut app, r#"{"ev":"input","field":"length","value":""}"#);
    assert!(c.iter().all(|c| c.s("html") != "#plots"));
    let c = send(&mut app, r#"{"ev":"timer"}"#);
    assert!(html(&c, "#error").contains("Can't solve this beam"));
    assert!(find(&c, "attr", "[data-field=\"length\"]").is_some(), "the length field is marked");
    send(&mut app, r#"{"ev":"done","field":"length"}"#);
    send(&mut app, r#"{"ev":"input","field":"length","value":"6000"}"#);
    let c = send(&mut app, r#"{"ev":"timer"}"#);
    assert!(c.iter().any(|c| c.s("hidden") == "#error" && c.get("on") == &Value::Bool(true)));
}

#[test]
fn every_control_works() {
    let mut app = started();
    for ev in [
        r#"{"ev":"click","act":"add","arg":"point"}"#, r#"{"ev":"click","act":"add","arg":"moment"}"#, r#"{"ev":"click","act":"add","arg":"dist"}"#,
        r#"{"ev":"click","act":"add-support"}"#, r#"{"ev":"click","act":"ends","arg":"fixed,fixed"}"#, r#"{"ev":"click","act":"ends","arg":"fixed,"}"#,
        r#"{"ev":"change","field":"supports.0.kind","value":"pin"}"#, r#"{"ev":"click","act":"remove-load","arg":"0"}"#,
        r#"{"ev":"input","field":"loads.0.F","value":"-2500"}"#, r#"{"ev":"input","field":"loads.1.C","value":"400000"}"#,
        r#"{"ev":"change","field":"section.shape","value":"tube"}"#, r#"{"ev":"change","field":"section.shape","value":"custom"}"#,
        r#"{"ev":"input","field":"section.c","value":""}"#, r#"{"ev":"change","field":"material","value":"timber"}"#,
        r#"{"ev":"input","field":"material.E","value":"200000"}"#, r#"{"ev":"input","field":"material.nu","value":"0.3"}"#,
        r#"{"ev":"change","field":"origin","value":"mid"}"#, r#"{"ev":"change","field":"units","value":"kip-in"}"#,
        r#"{"ev":"change","field":"units","value":"kN-m"}"#, r#"{"ev":"input","field":"divisions","value":"8"}"#, r#"{"ev":"timer"}"#,
        r#"{"ev":"width","w":400}"#, r#"{"ev":"change","field":"preset","value":"fixed-fixed-udl"}"#,
    ] {
        send(&mut app, ev);
    }
    assert!(app.error.is_none(), "{:?}", app.error);
    assert_eq!(app.st.mat.0, "steel");
    // The material select recognises a typed preset.
    send(&mut app, r#"{"ev":"input","field":"material.nu","value":"0.33"}"#);
    let c = send(&mut app, r#"{"ev":"input","field":"material.E","value":"69000000"}"#);
    assert_eq!(find(&c, "value", "#material").map(|c| c.s("v")), Some("aluminium"));
}

#[test]
fn the_figure_can_be_read_and_dragged() {
    let mut app = started();
    let c = send(&mut app, r#"{"ev":"move","frac":0.3}"#);
    assert!(html(&c, "#readout").contains("<span class=\"k\">V </span>") && find(&c, "attr", "#plots .cursor").is_some());
    let c = send(&mut app, r#"{"ev":"key","key":"End","shift":false,"target":"plot"}"#);
    assert!(c.iter().any(|c| c.get("prevent") == &Value::Bool(true)));
    assert_eq!(app.cursor, Some(6.0));
    send(&mut app, r#"{"ev":"key","key":"PageUp","shift":false,"target":"plot"}"#);
    assert_eq!(app.cursor, Some(0.0));
    send(&mut app, r#"{"ev":"change","field":"preset","value":"pin-pin-mixed"}"#);
    send(&mut app, r#"{"ev":"down","key":"l0"}"#);
    let c = send(&mut app, r#"{"ev":"move","frac":0.5}"#);
    assert!(html(&c, "#plots").contains("class=\"handle active\""), "the dragged handle stays marked");
    let c = send(&mut app, r#"{"ev":"up"}"#);
    assert!(!html(&c, "#hand-body").is_empty(), "the hand calculations catch up when the drag ends");
    let before = app.st.loads[0].x;
    send(&mut app, r#"{"ev":"key","key":"ArrowRight","shift":true,"target":"l0"}"#);
    assert!(app.st.loads[0].x > before);
}

#[test]
fn exports_carry_the_beam() {
    let mut app = started();
    let c = send(&mut app, r#"{"ev":"click","act":"save-pdf"}"#);
    let pdf = find(&c, "save", "beamdiag.pdf").unwrap();
    assert!(pdf.s("data").starts_with("JVBERi0xLjc"), "a PDF 1.7 file");
    send(&mut app, r#"{"ev":"change","field":"format","value":"svg"}"#);
    let c = send(&mut app, r#"{"ev":"click","act":"save-image"}"#);
    let svg = find(&c, "save", "beamdiag.svg").unwrap().s("data").to_string();
    assert!(svg.starts_with("<?xml") && !svg.contains("var(--") && svg.contains("@font-face") && svg.contains("VALUES AT SUPPORTS AND LOADS"));
    send(&mut app, r#"{"ev":"change","field":"format","value":"png"}"#);
    let c = send(&mut app, r#"{"ev":"click","act":"save-image"}"#);
    assert!(c.iter().any(|c| c.get("raster").str().is_some_and(|s| s.contains("<svg"))));
    let c = send(&mut app, r#"{"ev":"result","tag":"png","ok":true}"#);
    assert_eq!(text(&c, "#figure-status"), "Saved beamdiag.png.");
    let c = send(&mut app, r#"{"ev":"click","act":"save-beamdswitch"}"#);
    assert!(find(&c, "save", "beamdiag-beamdswitch.md").unwrap().s("data").contains("Hand calculations"));
    let c = send(&mut app, r#"{"ev":"click","act":"copy-hand"}"#);
    assert!(c.iter().any(|c| c.s("tag") == "hand" && c.s("copy").starts_with("---")));
    send(&mut app, r#"{"ev":"input","field":"bdfname","value":"my beam"}"#);
    let c = send(&mut app, r#"{"ev":"click","act":"download"}"#);
    assert!(find(&c, "save", "my_beam.bdf").unwrap().s("data").contains("CBAR"));
    let c = send(&mut app, r#"{"ev":"result","tag":"bdf","ok":false}"#);
    assert!(c.iter().any(|c| c.s("open") == "#deck-details"));
    let c = send(&mut app, r#"{"ev":"toggle","open":true}"#);
    assert!(text(&c, "#deck").contains("BEGIN BULK"));
}

#[test]
fn the_tools_answer_in_si() {
    let mut app = started();
    let c = send(&mut app, r#"{"ev":"tools"}"#);
    let names: Vec<&str> = c[0].get("reply").arr().unwrap().iter().map(|t| t.s("name")).collect();
    assert_eq!(names, ["get_metadata", "get_current_beam", "solve_beam", "export_nastran_bdf"]);
    let reply = |app: &mut App, name: &str, input: &str| send(app, &format!("{{\"ev\":\"tool\",\"name\":\"{name}\",\"input\":{input}}}"))[0].get("reply").clone();
    let m = reply(&mut app, "get_metadata", "{}");
    assert_eq!(m.s("pageUnits"), "N-mm");
    assert_eq!(m.get("unitConventions").arr().unwrap().len(), 5);
    let b = reply(&mut app, "get_current_beam", "{}");
    assert_eq!(b.get("model").f("length"), 6.0);
    assert!((b.get("reactions").arr().unwrap()[0].f("Fy") - 30e3).abs() < 1e-6);
    let model = r#"{"length":4,"supports":[{"kind":"fixed","x":0}],"loads":[{"kind":"point","x":4,"F":-1000}],"material":{"E":2e11,"nu":0.3},"section":{"A":0.01,"I":1e-5}}"#;
    let s = reply(&mut app, "solve_beam", model);
    assert!((s.get("extremes").get("moment").f("value") + 4000.0).abs() < 1e-6);
    assert_eq!(reply(&mut app, "solve_beam", "{\"length\":-1}").s("field"), "length");
    let d = reply(&mut app, "export_nastran_bdf", &format!("{{\"model\":{model},\"units\":\"N-m\"}}"));
    assert!(d.s("bdf").contains("SOL 101"));
    let e = reply(&mut app, "export_nastran_bdf", "{\"units\":\"furlong\"}");
    assert_eq!(e.s("error"), "Unknown unit convention \"furlong\"; choose one of kN-m, N-m, N-mm, lbf-in, kip-in.");
}

#[test]
fn messages_follow_the_origin() {
    let mut app = started();
    send(&mut app, r#"{"ev":"change","field":"origin","value":"mid"}"#);
    send(&mut app, r#"{"ev":"input","field":"supports.1.x","value":"5000"}"#);
    let c = send(&mut app, r#"{"ev":"timer"}"#);
    let m = html(&c, "#error");
    assert!(m.contains("between −3000 mm and 3000 mm."), "{m}");
}

#[test]
fn visual_json_names_the_tools_the_page_registers() {
    let names = |v: &Value| v.arr().unwrap().iter().map(|t| t.str().unwrap_or(t.s("name")).to_string()).collect::<Vec<_>>();
    let visual = json::parse(include_str!("../visual.json")).unwrap();
    assert_eq!(names(visual.get("webmcp_tools")), names(&beamdiag::app::tools()));
}
