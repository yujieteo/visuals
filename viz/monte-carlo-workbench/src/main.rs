//! The Monte Carlo Probability Workbench's data builder. It writes raw.json, the catalogue of the 12 files in
//! data/, with the same bytes as the Python builder that it replaces (build.py, last at 02fcb4f):
//!
//!   cargo run --release              write raw.json
//!   cargo run --release -- --verify  check that raw.json is current; write nothing
//!
//! The notebooks of yujieteo/site read the files in data/ through the site's visuals.lock, not raw.json.

mod py;

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use serde_json::{Map, Value};

/// The data files, in the order of the catalogue's keys.
pub const DATA: [&str; 12] = [
    "laws",
    "models",
    "methods",
    "theory",
    "glossary",
    "datasets",
    "groups",
    "limits",
    "interview",
    "rare",
    "chains",
    "physics",
];

/// This visual's folder, viz/monte-carlo-workbench.
fn folder() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// `{"format": "monte-carlo-workbench/catalogue", "version": 1}`, then each data file under its name.
pub fn catalogue(folder: &Path) -> Result<Value, String> {
    let mut out = Map::new();
    out.insert("format".into(), "monte-carlo-workbench/catalogue".into());
    out.insert("version".into(), 1.into());
    for name in DATA {
        let path = folder.join("data").join(format!("{name}.json"));
        let text =
            std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        let value = serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?;
        out.insert(name.into(), value);
    }
    Ok(Value::Object(out))
}

/// The bytes of raw.json: `json.dumps(catalogue, ensure_ascii=False, indent=1) + "\n"`.
pub fn raw(folder: &Path) -> Result<String, String> {
    Ok(py::indented(&catalogue(folder)?) + "\n")
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let verify = match args.as_slice() {
        [] => false,
        [flag] if flag == "--verify" => true,
        _ => {
            eprintln!("usage: monte-carlo-workbench [--verify]");
            return ExitCode::from(2);
        }
    };
    let dir = folder();
    let text = match raw(&dir) {
        Ok(text) => text,
        Err(e) => {
            eprintln!("monte-carlo-workbench: {e}");
            return ExitCode::FAILURE;
        }
    };
    let path = dir.join("raw.json");
    if verify {
        if std::fs::read(&path).ok().as_deref() != Some(text.as_bytes()) {
            eprintln!("monte-carlo-workbench: stale raw.json; run cargo run --release");
            return ExitCode::FAILURE;
        }
        println!(
            "monte-carlo-workbench/raw.json ({} bytes) is current",
            text.len()
        );
    } else {
        if let Err(e) = std::fs::write(&path, &text) {
            eprintln!("{}: {e}", path.display());
            return ExitCode::FAILURE;
        }
        println!(
            "wrote monte-carlo-workbench/raw.json ({} bytes)",
            text.len()
        );
    }
    ExitCode::SUCCESS
}
