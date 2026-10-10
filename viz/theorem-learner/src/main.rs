//! The Theorem Learner's data builder, in place of the Python pipeline it replaces byte for byte:
//!
//!   cargo run --release -- packets [--per 30] [--out DIR] [--concepts FILE | --marked]
//!       authoring packets and the catalog indexes (packets.rs), in build/tl-work by default
//!   cargo run --release -- check FILE...
//!       the problems of authored learning files (learning.rs); authors run it on their batch
//!   cargo run --release -- assemble [--explorer PATH] [--out PATH]
//!       raw.json from viz/theorem-explorer/raw.json and data/learning/ (assemble.rs); it runs the checks first,
//!       so run `packets` once before it
//!
//! TE_WORK names the Theorem Explorer's work directory (default build/te-work), whose mathlib4 checkout gives
//! the file and lines of a Lean declaration.

mod assemble;
mod learning;
mod packets;
mod py;

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

/// The result types the Explorer scores; every other catalog record is a concept or a field.
pub const RESULT_TYPES: [&str; 11] = ["theorem", "lemma", "inequality", "identity", "principle", "formula", "criterion",
    "conjecture-proved", "construction", "classification", "other-result"];
/// A formal-declaration evidence URL: commit, file and line range.
pub static URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"/blob/([0-9a-f]{40})/(.+?\.lean)#L(\d+)-L(\d+)$").unwrap());

/// This visual's folder, viz/theorem-learner.
pub fn visual() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// A text file as Python's read_text reads it: UTF-8, with \r\n and \r read as \n.
pub fn read_text(path: &Path) -> String {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    if text.contains('\r') { text.replace("\r\n", "\n").replace('\r', "\n") } else { text }
}

pub fn read_json(path: &Path) -> Value {
    serde_json::from_str(&read_text(path)).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

pub fn write(path: &Path, text: &str) {
    std::fs::write(path, text).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
}

/// The *.json files of a folder, sorted by name; none when it does not exist.
pub fn json_files(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "json") && p.is_file()).collect();
    files.sort();
    files
}

fn work() -> PathBuf {
    std::env::var_os("TE_WORK").map_or_else(|| visual().join("../../build/te-work"), PathBuf::from)
}

fn option(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).map(|i| args.get(i + 1).unwrap_or_else(|| panic!("{name} needs a value")).clone())
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let explorer = || option(&args, "--explorer").map_or_else(|| visual().join("../theorem-explorer/raw.json"), PathBuf::from);
    match args.first().map(String::as_str) {
        Some("packets") => {
            let out = option(&args, "--out").map_or_else(learning::workdir, PathBuf::from);
            let counts = if args.iter().any(|a| a == "--marked") {
                packets::concept_packets(&explorer(), &packets::marked_concepts(&learning::learning()), &out)
            } else if let Some(file) = option(&args, "--concepts") {
                let ids: Vec<String> = read_text(Path::new(&file)).split_whitespace().map(String::from).collect();
                packets::concept_packets(&explorer(), &ids, &out)
            } else {
                let per = option(&args, "--per").map_or(30, |n| n.parse().expect("--per takes a number"));
                packets::build(&explorer(), &work(), per, &out)
            };
            println!("{}", py::repr(Some(&counts)));
        }
        Some("check") if args.len() > 1 => {
            let paths: Vec<PathBuf> = args[1..].iter().map(PathBuf::from).collect();
            let (n, problems) = learning::check_files(&paths);
            for line in &problems {
                println!("{line}");
            }
            println!("{n} theorems, {} problems", problems.len());
            if !problems.is_empty() {
                return ExitCode::FAILURE;
            }
        }
        Some("assemble") => {
            let out = option(&args, "--out").map_or_else(|| visual().join("raw.json"), PathBuf::from);
            match assemble::build(&explorer(), &work(), &out) {
                Ok((cov, gz)) => println!("{} core gz {gz}", py::indented(&cov)),
                Err(e) => {
                    eprintln!("{e}");
                    return ExitCode::FAILURE;
                }
            }
        }
        _ => {
            eprintln!("usage: theorem-learner packets [--per N] [--out DIR] [--concepts FILE | --marked] | check FILE... | assemble [--explorer PATH] [--out PATH]");
            return ExitCode::from(2);
        }
    }
    ExitCode::SUCCESS
}
