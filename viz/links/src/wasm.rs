//! The WebAssembly interface. The host writes bytes into memory from `alloc`: the compressed links once, for
//! `load`, then each event's JSON for `handle`, and reads `out_len` bytes of command JSON at the address it returns.

use crate::app::App;
use crate::{codec, data::Data, search::Index};
use std::cell::RefCell;

thread_local! {
    static APP: RefCell<Option<App>> = const { RefCell::new(None) };
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc(n: usize) -> *mut u8 { std::mem::ManuallyDrop::new(Vec::<u8>::with_capacity(n)).as_mut_ptr() }

/// SAFETY of both entries: `p` came from `alloc(n)` and the host wrote n bytes there; the Vec frees it.
fn take(p: *mut u8, n: usize) -> Vec<u8> { unsafe { Vec::from_raw_parts(p, n, n) } }

/// Decompresses the links and builds the search index; 1 when done.
#[unsafe(no_mangle)]
pub extern "C" fn load(p: *mut u8, n: usize) -> u32 {
    let packed = codec::decompress(&take(p, n));
    APP.with(|a| *a.borrow_mut() = Some(App::new(Index::new(Data::unpack(&packed)))));
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn handle(p: *mut u8, n: usize) -> *const u8 {
    let text = String::from_utf8(take(p, n)).unwrap_or_default();
    let out = APP.with(|a| a.borrow_mut().as_mut().map_or("[]".into(), |app| app.handle(&text)));
    OUT.with(|o| { *o.borrow_mut() = out.into_bytes(); o.borrow().as_ptr() })
}

#[unsafe(no_mangle)]
pub extern "C" fn out_len() -> usize { OUT.with(|o| o.borrow().len()) }
