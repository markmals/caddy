//! Spelling of model types in cxx bridge (Rust) and wrapper (C++) positions.

use crate::model::{Prim, Ty};

pub fn rust_prim(prim: Prim) -> &'static str {
    match prim {
        Prim::F64 => "f64",
        Prim::F32 => "f32",
        Prim::I32 => "i32",
        Prim::U32 => "u32",
        Prim::Usize => "usize",
        Prim::Bool => "bool",
        Prim::U8 => "u8",
    }
}

pub fn cpp_prim(prim: Prim) -> &'static str {
    match prim {
        Prim::F64 => "double",
        Prim::F32 => "float",
        Prim::I32 => "int32_t",
        Prim::U32 => "uint32_t",
        Prim::Usize => "size_t",
        Prim::Bool => "bool",
        Prim::U8 => "uint8_t",
    }
}

/// In-memory stream type declared by the built-in `occt_stream` bridge.
pub const STREAM_TYPE: &str = "OcctStream";
pub const STREAM_MODULE: &str = "occt_stream";

/// Name of a non-primitive type as declared in the bridges (and as a C++ typedef/class).
pub fn bridge_name(ty: &Ty) -> Option<String> {
    match ty {
        Ty::Class(name) | Ty::Collection(name) | Ty::Enum(name) => Some(name.clone()),
        Ty::Handle(name) => Some(format!("Handle_{name}")),
        Ty::Stream => Some(STREAM_TYPE.to_owned()),
        Ty::Prim(_) | Ty::Str | Ty::AsciiString => None,
    }
}

/// The allowlisted declaration whose header must be included for `ty`.
pub fn header_owner(ty: &Ty) -> Option<&str> {
    match ty {
        Ty::Class(name) | Ty::Collection(name) | Ty::Enum(name) | Ty::Handle(name) => Some(name),
        Ty::AsciiString => Some("TCollection_AsciiString"),
        Ty::Prim(_) | Ty::Str | Ty::Stream => None,
    }
}

/// True for types the bridge holds behind references or smart pointers.
pub fn is_opaque(ty: &Ty) -> bool {
    matches!(ty, Ty::Class(_) | Ty::Collection(_) | Ty::Handle(_))
}
