//! Errors surfaced to JavaScript as `Error` objects with a stable `code` property.
//!
//! Codes are part of the package contract; keep them in sync with `OcctErrorCode` in
//! `packages/occt-native/src/errors.ts`.

use neon::prelude::*;

pub mod code {
    /// Input rejected before reaching OCCT (wrong array length, non-positive size, ...).
    pub const INVALID_ARGUMENT: &str = "INVALID_ARGUMENT";
    /// OCCT raised a `Standard_Failure`; the class name is in `kernelException`.
    pub const OCCT_EXCEPTION: &str = "OCCT_EXCEPTION";
    /// An OCCT algorithm reported failure without throwing (`IsDone() == false`, errors set).
    pub const OPERATION_FAILED: &str = "OPERATION_FAILED";
    /// A shape handle was used after `shapeDispose`.
    pub const DISPOSED: &str = "DISPOSED";
    pub const IMPORT_FAILED: &str = "IMPORT_FAILED";
    pub const EXPORT_FAILED: &str = "EXPORT_FAILED";
}

#[derive(Debug)]
pub struct OcctError {
    pub code: &'static str,
    pub message: String,
    /// OCCT exception class, e.g. `Standard_DomainError`.
    pub kernel_exception: Option<String>,
}

impl OcctError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into(), kernel_exception: None }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new(code::INVALID_ARGUMENT, message)
    }

    pub fn failed(message: impl Into<String>) -> Self {
        Self::new(code::OPERATION_FAILED, message)
    }
}

impl From<cxx::Exception> for OcctError {
    /// The bridge reports OCCT exceptions as `<ExceptionClass>: <detail>` (see
    /// opencascade-sys/include/bindings_common.hxx).
    fn from(exception: cxx::Exception) -> Self {
        let what = exception.what();
        let (class, detail) = what.split_once(": ").unwrap_or((what, ""));
        let is_class_name =
            !class.is_empty() && class.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
        if !is_class_name {
            return Self::new(code::OCCT_EXCEPTION, what);
        }
        let message =
            if detail.is_empty() { class.to_owned() } else { format!("{class}: {detail}") };
        Self { code: code::OCCT_EXCEPTION, message, kernel_exception: Some(class.to_owned()) }
    }
}

pub type OcctResult<T> = Result<T, OcctError>;

pub fn throw<'cx, T>(cx: &mut Cx<'cx>, error: OcctError) -> NeonResult<T> {
    let js_error = JsError::error(cx, &error.message)?;
    js_error.prop(cx, "code").set(error.code)?;
    if let Some(class) = error.kernel_exception {
        js_error.prop(cx, "kernelException").set(class)?;
    }
    cx.throw(js_error)
}

pub trait OrThrow<T> {
    fn or_raise(self, cx: &mut Cx) -> NeonResult<T>;
}

impl<T, E: Into<OcctError>> OrThrow<T> for Result<T, E> {
    fn or_raise(self, cx: &mut Cx) -> NeonResult<T> {
        match self {
            Ok(value) => Ok(value),
            Err(error) => throw(cx, error.into()),
        }
    }
}

/// Runs a fallible block of OCCT calls; lets `?` convert bridge errors inside closures.
pub fn attempt<T>(body: impl FnOnce() -> OcctResult<T>) -> OcctResult<T> {
    body()
}
