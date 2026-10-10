//! Beam diagram: a beam solver, its figure, report and hand calculations, compiled to WebAssembly.

pub mod app;
pub mod bdf;
pub mod deck;
pub mod draw;
pub mod engine;
pub mod figure;
pub mod fmt;
pub mod hand;
pub mod json;
pub mod num;
pub mod pdf;
pub mod report;
pub mod tex;
#[cfg(target_arch = "wasm32")]
mod wasm;
