//! The WebAssembly interface: the host writes an event's JSON into memory from `alloc`, calls `handle`,
//! and reads `out_len` bytes of command JSON at the address it returns.

use crate::app::App;
use std::cell::RefCell;

thread_local! {
    static APP: RefCell<Option<App>> = const { RefCell::new(None) };
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn alloc(n: usize) -> *mut u8 { std::mem::ManuallyDrop::new(Vec::<u8>::with_capacity(n)).as_mut_ptr() }

#[unsafe(no_mangle)]
pub extern "C" fn handle(p: *mut u8, n: usize) -> *const u8 {
    // SAFETY: `p` came from `alloc(n)` and the host wrote n bytes there; the Vec frees it.
    let bytes = unsafe { Vec::from_raw_parts(p, n, n) };
    let text = String::from_utf8(bytes).unwrap_or_default();
    let out = APP.with(|a| a.borrow_mut().get_or_insert_with(App::new).handle(&text));
    OUT.with(|o| { *o.borrow_mut() = out.into_bytes(); o.borrow().as_ptr() })
}

#[unsafe(no_mangle)]
pub extern "C" fn out_len() -> usize { OUT.with(|o| o.borrow().len()) }
