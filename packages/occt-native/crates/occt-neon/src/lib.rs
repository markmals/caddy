//! Neon (Node-API) addon exposing OCCT to JavaScript through the generated opencascade-sys
//! bindings. Exports are registered with `#[neon::export]` in each module.

mod booleans;
mod builder;
mod convert;
mod error;
mod io;
mod kernel;
mod measure;
mod primitives;
mod shape;
mod topology;

use neon::prelude::*;

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    neon::registered().export(&mut cx)?;
    if let Err(error) = kernel::set_console_messages(false) {
        return cx.throw_error(format!("cannot configure OCCT messages: {}", error.message));
    }
    Ok(())
}
