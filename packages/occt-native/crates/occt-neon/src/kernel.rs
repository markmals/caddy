//! Process-wide OCCT settings.

use neon::prelude::*;
use opencascade_sys::message::{
    Handle_Message_Messenger_get_mut, Handle_Message_PrinterOStream_to_Message_Printer,
    Message_DefaultMessenger, Message_Gravity, Message_PrinterOStream_get_type_descriptor,
    Message_PrinterOStream_new_gravity,
};

use crate::error::{OcctResult, OrThrow, attempt};

/// OCCT's default messenger prints translator statistics (e.g. every STEP transfer) to stdout.
/// The addon starts silent; `setKernelMessages(true)` restores console output.
pub fn set_console_messages(enabled: bool) -> OcctResult<()> {
    let mut messenger = Message_DefaultMessenger()?;
    let mut messenger = Handle_Message_Messenger_get_mut(messenger.pin_mut())?;
    messenger.as_mut().RemovePrinters(&*Message_PrinterOStream_get_type_descriptor()?)?;
    if enabled {
        let printer = Message_PrinterOStream_new_gravity(Message_Gravity::Message_Info)?;
        messenger
            .as_mut()
            .AddPrinter(&Handle_Message_PrinterOStream_to_Message_Printer(&printer))?;
    }
    Ok(())
}

#[neon::export(name = "setKernelMessages")]
fn set_kernel_messages<'cx>(cx: &mut Cx<'cx>, enabled: bool) -> NeonResult<()> {
    attempt(|| set_console_messages(enabled)).or_raise(cx)
}

#[neon::export(name = "occtVersion")]
const OCCT_VERSION: &str = "8.0.1";
