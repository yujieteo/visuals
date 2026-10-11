//! Paper links: the 16,431 links of the old site's Paper Links page, with its search, filters and BibTeX
//! export, compiled to WebAssembly. The page builder (bin/page.rs) packs and compresses links.json into the page.

pub mod app;
pub mod bib;
pub mod codec;
pub mod data;
pub mod fold;
pub mod json;
pub mod search;
pub mod tex;
#[cfg(target_arch = "wasm32")]
mod wasm;

pub use look::esc;
