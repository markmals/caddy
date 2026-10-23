//! Shared handling for OCCT `BRepBuilderAPI_MakeShape` algorithms.

use cxx::UniquePtr;
use opencascade_sys::message::{Message_ProgressRange, Message_ProgressRange_new};

use crate::error::OcctResult;

pub fn progress() -> OcctResult<UniquePtr<Message_ProgressRange>> {
    Ok(Message_ProgressRange_new()?)
}

/// Builds an algorithm deriving from `BRepBuilderAPI_MakeShape` and boxes its result, turning
/// `IsDone() == false` into an `OPERATION_FAILED` error naming the algorithm.
macro_rules! finish {
    ($maker:expr, $name:literal) => {{
        let maker = &mut $maker;
        maker.pin_mut().Build(&*$crate::builder::progress()?)?;
        if !maker.IsDone()? {
            return Err($crate::error::OcctError::failed(concat!($name, " failed")));
        }
        $crate::shape::boxed($crate::shape::owned(maker.pin_mut().Shape()?))
    }};
}

pub(crate) use finish;
