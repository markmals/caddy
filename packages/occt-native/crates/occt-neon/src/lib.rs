//! Neon (Node-API) addon exposing OCCT to JavaScript through the generated opencascade-sys
//! bindings. Exports are registered with `#[neon::export]` in each module.

mod assembly;
mod booleans;
mod builder;
mod construct;
mod convert;
mod error;
mod exchange;
mod export2d;
mod features;
mod fillets;
mod hlr;
mod io;
mod kernel;
mod marshal;
mod measure;
mod mesh;
mod obb;
mod offset;
mod primitives;
mod projection;
mod query;
mod shape;
mod step;
mod surfaces;
mod topology;
mod xde;

use neon::prelude::*;

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    neon::registered().export(&mut cx)?;
    if let Err(error) = kernel::set_console_messages(false) {
        return cx.throw_error(format!("cannot configure OCCT messages: {}", error.message));
    }
    Ok(())
}
