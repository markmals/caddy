//! Language-neutral description of the declarations to bind, extracted from libclang.

use crate::config::CollectionKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Prim {
    F64,
    F32,
    I32,
    U32,
    Usize,
    Bool,
    U8,
}

/// A C++ type after resolving typedefs, stripped of reference/const qualifiers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ty {
    Prim(Prim),
    Enum(String),
    /// Allowlisted class (value or transient); transient classes are normally used via `Handle`.
    Class(String),
    /// `opencascade::handle<T>` for an allowlisted transient class or handle collection.
    Handle(String),
    /// Allowlisted NCollection typedef.
    Collection(String),
    /// `const char*` / `Standard_CString`.
    Str,
    /// `TCollection_AsciiString`, exchanged as UTF-8 text.
    AsciiString,
    /// `std::ostream` / `std::istream`, exchanged as an in-memory `OcctStream`.
    Stream,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pass {
    Value,
    ConstRef,
    MutRef,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypeUse {
    pub ty: Ty,
    pub pass: Pass,
}

#[derive(Debug, Clone)]
pub struct Param {
    pub name: String,
    pub ty: TypeUse,
    /// `const char*` parameter the C++ declaration defaults to a null pointer: OCCT reads that
    /// as "absent", and the binding maps an empty Rust string onto it.
    pub optional_text: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FnKind {
    Constructor,
    Method { is_const: bool },
    Static,
}

#[derive(Debug, Clone)]
pub struct Function {
    /// C++ member name (class name for constructors).
    pub cpp_name: String,
    pub kind: FnKind,
    pub params: Vec<Param>,
    /// `None` for `void` and constructors.
    pub ret: Option<TypeUse>,
    /// Unique Rust identifier, assigned after overload resolution.
    pub rust_name: String,
    /// Must be called through a C++ shim: operators, and members a `using` declaration
    /// re-exposes from a non-public base (their member pointers do not convert).
    pub needs_shim: bool,
}

#[derive(Debug, Clone)]
pub struct Class {
    pub name: String,
    pub module: String,
    pub header: String,
    pub is_transient: bool,
    /// A namespace of free functions rather than a class (no type, no constructors).
    pub is_namespace: bool,
    pub clone: bool,
    /// Allowlisted ancestors, nearest first.
    pub ancestors: Vec<String>,
    pub constructors: Vec<Function>,
    pub methods: Vec<Function>,
}

#[derive(Debug, Clone)]
pub struct Enum {
    pub name: String,
    pub module: String,
    pub header: String,
    pub repr: &'static str,
    pub variants: Vec<(String, i64)>,
}

#[derive(Debug, Clone)]
pub struct Collection {
    pub name: String,
    pub module: String,
    pub header: String,
    pub kind: CollectionKind,
    /// Element type, or key type for maps.
    pub item: Ty,
    /// Mapped value type for `IndexedDataMap` / `DataMap`.
    pub value: Option<Ty>,
    /// `NCollection_H*` variants live behind `opencascade::handle`.
    pub is_handle: bool,
}

#[derive(Debug, Clone)]
pub struct Skipped {
    pub symbol: String,
    pub reason: String,
}

#[derive(Debug, Default)]
pub struct Bindings {
    pub classes: Vec<Class>,
    pub enums: Vec<Enum>,
    pub collections: Vec<Collection>,
    pub skipped: Vec<Skipped>,
    /// OCCT toolkits that must be linked, sorted.
    pub toolkits: Vec<String>,
}

impl Bindings {
    pub fn class(&self, name: &str) -> Option<&Class> {
        self.classes.iter().find(|class| class.name == name)
    }

    pub fn collection(&self, name: &str) -> Option<&Collection> {
        self.collections.iter().find(|collection| collection.name == name)
    }

    /// Module that owns the Rust declaration of a type name.
    pub fn module_of(&self, name: &str) -> Option<&str> {
        if let Some(class) = self.class(name) {
            return Some(&class.module);
        }
        if let Some(collection) = self.collection(name) {
            return Some(&collection.module);
        }
        self.enums.iter().find(|e| e.name == name).map(|e| e.module.as_str())
    }
}
