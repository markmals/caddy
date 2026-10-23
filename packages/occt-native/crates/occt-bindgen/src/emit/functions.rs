//! Constructors and member functions.
//!
//! Members whose signature cxx can express are bound directly on the class (cxx takes the
//! member-function pointer, resolving overloads by type). Everything else goes through an
//! inline C++ shim: constructors, by-value objects, handles, strings and ambiguous lifetimes.
//! Every function returns `Result` so OCCT exceptions become Rust errors instead of aborting.

use crate::model::{Class, FnKind, Function, Pass, Ty, TypeUse};

use super::{
    item::Item,
    types::{bridge_name, cpp_prim, is_opaque, rust_prim},
};

pub struct Context<'a> {
    pub class: &'a Class,
    /// Bridge names a free function must not shadow.
    pub reserved: &'a dyn Fn(&str) -> bool,
    /// Whether a type can be copied into a `UniquePtr` (for static functions returning refs).
    pub copyable: &'a dyn Fn(&Ty) -> bool,
}

pub fn emit_function(function: &Function, context: &Context) -> Result<Item, String> {
    match function.kind {
        FnKind::Constructor => constructor(function, context.class),
        _ if is_direct(function) => Ok(direct(function, context)),
        _ => wrapper(function, context),
    }
}

fn opaque_name(ty: &Ty) -> String {
    bridge_name(ty).expect("opaque types have bridge names")
}

fn is_direct(function: &Function) -> bool {
    // Operators and members re-exposed from protected bases cannot be member-pointer bound.
    if function.needs_shim {
        return false;
    }
    let params_ok = function.params.iter().all(|param| match (&param.ty.ty, param.ty.pass) {
        (Ty::Prim(_), _) | (Ty::Enum(_), Pass::Value) => true,
        (ty, Pass::ConstRef | Pass::MutRef) => is_opaque(ty),
        _ => false,
    });
    let Some(ret) = &function.ret else { return params_ok };
    let type_ok = match (&ret.ty, ret.pass) {
        (Ty::Prim(_), _) | (Ty::Enum(_), Pass::Value) => true,
        (ty, Pass::ConstRef | Pass::MutRef) => is_opaque(ty),
        _ => false,
    };
    params_ok && type_ok && (ret.pass == Pass::Value || reference_return_ok(function, ret))
}

/// A returned reference needs a single unambiguous source of the same or stronger mutability.
fn reference_return_ok(function: &Function, ret: &TypeUse) -> bool {
    match function.kind {
        FnKind::Method { is_const } => ret.pass == Pass::ConstRef || !is_const,
        FnKind::Static => {
            let references: Vec<_> =
                function.params.iter().filter(|p| p.ty.pass != Pass::Value).collect();
            references.len() == 1
                && (ret.pass == Pass::ConstRef || references[0].ty.pass == Pass::MutRef)
        }
        FnKind::Constructor => false,
    }
}

fn direct_type(ty: &TypeUse) -> String {
    match (&ty.ty, ty.pass) {
        (Ty::Prim(prim), Pass::Value) => rust_prim(*prim).to_owned(),
        (Ty::Prim(prim), Pass::ConstRef) => format!("&{}", rust_prim(*prim)),
        (Ty::Prim(prim), Pass::MutRef) => format!("&mut {}", rust_prim(*prim)),
        (other, Pass::ConstRef) => format!("&{}", opaque_name(other)),
        (other, Pass::MutRef) => format!("Pin<&mut {}>", opaque_name(other)),
        (other, Pass::Value) => opaque_name(other),
    }
}

/// Rust name of a free function: `<Class>_<name>`, suffixed when it would shadow a type
/// (e.g. `TopoDS::Face` would otherwise become `TopoDS_Face`).
fn free_name(function: &Function, context: &Context) -> String {
    let name = format!("{}_{}", context.class.name, function.rust_name);
    if (context.reserved)(&name) { format!("{name}_fn") } else { name }
}

fn uses_owner(item: &mut Item, class: &Class) {
    if class.is_namespace {
        item.headers.insert(class.name.clone());
    } else {
        item.uses_name(&class.name);
    }
}

fn direct(function: &Function, context: &Context) -> Item {
    let class = context.class;
    let mut item = Item::default();
    let mut lines = Vec::new();
    let mut rust_name = function.rust_name.clone();
    if class.is_namespace {
        lines.push(format!("#[namespace = \"{}\"]", class.name));
        lines.push(format!("#[cxx_name = \"{}\"]", function.cpp_name));
        rust_name = free_name(function, context);
    } else if function.rust_name != function.cpp_name {
        lines.push(format!("#[cxx_name = \"{}\"]", function.cpp_name));
    }
    let mut params = Vec::new();
    match function.kind {
        FnKind::Method { is_const: true } => params.push(format!("self: &{}", class.name)),
        FnKind::Method { is_const: false } => {
            params.push(format!("self: Pin<&mut {}>", class.name))
        }
        _ if class.is_namespace => {}
        _ => lines.push(format!("#[Self = \"{}\"]", class.name)),
    }
    uses_owner(&mut item, class);
    for param in &function.params {
        item.uses(&param.ty.ty);
        params.push(format!("{}: {}", param.name, direct_type(&param.ty)));
    }
    let ret = function.ret.as_ref().map_or("()".to_owned(), |ret| {
        item.uses(&ret.ty);
        direct_type(ret)
    });
    lines.push(format!("fn {rust_name}({}) -> Result<{ret}>;", params.join(", ")));
    item.rust = lines.join("\n");
    item
}

struct Shim {
    rust_params: Vec<String>,
    cpp_params: Vec<String>,
    arguments: Vec<String>,
}

fn shim_params(function: &Function, item: &mut Item) -> Result<Shim, String> {
    let mut shim = Shim { rust_params: Vec::new(), cpp_params: Vec::new(), arguments: Vec::new() };
    for param in &function.params {
        let name = &param.name;
        item.uses(&param.ty.ty);
        let (rust, cpp, argument) = match (&param.ty.ty, param.ty.pass) {
            (Ty::Prim(p), Pass::MutRef) => (
                format!("&mut {}", rust_prim(*p)),
                format!("{}& {name}", cpp_prim(*p)),
                name.clone(),
            ),
            (Ty::Prim(p), _) => {
                (rust_prim(*p).to_owned(), format!("{} {name}", cpp_prim(*p)), name.clone())
            }
            (Ty::Enum(e), Pass::Value | Pass::ConstRef) => {
                (e.clone(), format!("{e} {name}"), name.clone())
            }
            (Ty::Str, Pass::Value | Pass::ConstRef) => {
                ("&str".into(), format!("rust::Str {name}"), format!("std::string({name}).c_str()"))
            }
            (Ty::AsciiString, Pass::Value | Pass::ConstRef) => (
                "&str".into(),
                format!("rust::Str {name}"),
                format!("TCollection_AsciiString(std::string({name}).c_str())"),
            ),
            (Ty::Stream, Pass::MutRef) => {
                let t = super::types::STREAM_TYPE;
                (format!("Pin<&mut {t}>"), format!("{t}& {name}"), name.clone())
            }
            (ty, Pass::MutRef) if is_opaque(ty) => {
                let t = opaque_name(ty);
                (format!("Pin<&mut {t}>"), format!("{t}& {name}"), name.clone())
            }
            (ty, _) if is_opaque(ty) => {
                let t = opaque_name(ty);
                (format!("&{t}"), format!("const {t}& {name}"), name.clone())
            }
            (ty, pass) => return Err(format!("cannot pass {ty:?} as {pass:?}")),
        };
        shim.rust_params.push(format!("{name}: {rust}"));
        shim.cpp_params.push(cpp);
        shim.arguments.push(argument);
    }
    Ok(shim)
}

fn constructor(function: &Function, class: &Class) -> Result<Item, String> {
    let mut item = Item::default();
    let shim = shim_params(function, &mut item)?;
    let name = format!("{}_{}", class.name, function.rust_name);
    let (rust_owned, cpp_owned, construct) = if class.is_transient {
        let handle = format!("Handle_{}", class.name);
        let construct = format!(
            "std::make_unique<{handle}>(new {}({}))",
            class.name,
            shim.arguments.join(", ")
        );
        item.uses(&Ty::Handle(class.name.clone()));
        (handle.clone(), handle, construct)
    } else {
        let construct = format!("std::make_unique<{}>({})", class.name, shim.arguments.join(", "));
        item.uses_name(&class.name);
        (class.name.clone(), class.name.clone(), construct)
    };
    item.owns(&rust_owned);
    item.rust =
        format!("fn {name}({}) -> Result<UniquePtr<{rust_owned}>>;", shim.rust_params.join(", "));
    item.cpp = Some(format!(
        "inline std::unique_ptr<{cpp_owned}> {name}({}) {{ return {construct}; }}",
        shim.cpp_params.join(", ")
    ));
    Ok(item)
}

enum Returned {
    Void,
    Value { rust: String, cpp: String },
    Owned(String),
    Reference { rust: String, cpp: String, tied_to_self: bool },
    Text { ascii: bool },
}

fn returned(function: &Function, context: &Context) -> Result<Returned, String> {
    let Some(ret) = &function.ret else { return Ok(Returned::Void) };
    let method_const = match function.kind {
        FnKind::Method { is_const } => Some(is_const),
        _ => None,
    };
    let reference = |mutable: bool, rust: String, cpp: String| -> Result<Returned, String> {
        match method_const {
            Some(is_const) if !(mutable && is_const) => {
                Ok(Returned::Reference { rust, cpp, tied_to_self: true })
            }
            None if reference_return_ok(function, ret) => {
                Ok(Returned::Reference { rust, cpp, tied_to_self: false })
            }
            _ => Err("returned reference has no unambiguous owner".into()),
        }
    };
    match (&ret.ty, ret.pass) {
        (Ty::Prim(p), Pass::MutRef) => {
            reference(true, format!("&mut {}", rust_prim(*p)), format!("{}&", cpp_prim(*p)))
        }
        (Ty::Prim(p), _) => {
            Ok(Returned::Value { rust: rust_prim(*p).into(), cpp: cpp_prim(*p).into() })
        }
        (Ty::Enum(e), Pass::Value | Pass::ConstRef) => {
            Ok(Returned::Value { rust: e.clone(), cpp: e.clone() })
        }
        (Ty::Str, _) => Ok(Returned::Text { ascii: false }),
        (Ty::AsciiString, Pass::Value | Pass::ConstRef) => Ok(Returned::Text { ascii: true }),
        (ty, Pass::Value) if is_opaque(ty) => Ok(Returned::Owned(opaque_name(ty))),
        (ty, Pass::ConstRef) if is_opaque(ty) => {
            let t = opaque_name(ty);
            match reference(false, format!("&{t}"), format!("const {t}&")) {
                Err(_) if (context.copyable)(ty) => Ok(Returned::Owned(t)),
                other => other,
            }
        }
        (ty, Pass::MutRef) if is_opaque(ty) => {
            let t = opaque_name(ty);
            reference(true, format!("Pin<&mut {t}>"), format!("{t}&"))
        }
        (ty, pass) => Err(format!("cannot return {ty:?} as {pass:?}")),
    }
}

fn wrapper(function: &Function, context: &Context) -> Result<Item, String> {
    let class = context.class;
    let mut item = Item::default();
    let shim = shim_params(function, &mut item)?;
    if let Some(ret) = &function.ret {
        item.uses(&ret.ty);
    }
    let returned = returned(function, context)?;
    let name = free_name(function, context);
    let tied = matches!(returned, Returned::Reference { tied_to_self: true, .. });
    let lifetime = if tied { "'a " } else { "" };
    let mut rust_params = Vec::new();
    let mut cpp_params = Vec::new();
    let call = match function.kind {
        FnKind::Method { is_const } => {
            item.uses_name(&class.name);
            if is_const {
                rust_params.push(format!("self_: &{lifetime}{}", class.name));
                cpp_params.push(format!("const {}& self_", class.name));
            } else {
                rust_params.push(format!("self_: Pin<&{lifetime}mut {}>", class.name));
                cpp_params.push(format!("{}& self_", class.name));
            }
            format!("self_.{}({})", function.cpp_name, shim.arguments.join(", "))
        }
        _ => {
            uses_owner(&mut item, class);
            format!("{}::{}({})", class.name, function.cpp_name, shim.arguments.join(", "))
        }
    };
    rust_params.extend(shim.rust_params);
    cpp_params.extend(shim.cpp_params);
    let (rust_ret, cpp_ret, body) = match returned {
        Returned::Void => ("()".to_owned(), "void".to_owned(), format!("{call};")),
        Returned::Value { rust, cpp } => (rust, cpp, format!("return {call};")),
        Returned::Owned(t) => {
            item.owns(&t);
            (
                format!("UniquePtr<{t}>"),
                format!("std::unique_ptr<{t}>"),
                format!("return std::make_unique<{t}>({call});"),
            )
        }
        Returned::Reference { rust, cpp, tied_to_self } => {
            let rust = if tied_to_self { rust.replacen('&', "&'a ", 1) } else { rust };
            (rust, cpp, format!("return {call};"))
        }
        Returned::Text { ascii: true } => (
            "String".into(),
            "rust::String".into(),
            format!("return rust::String({call}.ToCString());"),
        ),
        Returned::Text { ascii: false } => (
            "String".into(),
            "rust::String".into(),
            format!(
                "const char* text = {call}; return rust::String(text != nullptr ? text : \"\");"
            ),
        ),
    };
    let generics = if tied { "<'a>" } else { "" };
    item.rust = format!("fn {name}{generics}({}) -> Result<{rust_ret}>;", rust_params.join(", "));
    item.cpp = Some(format!("inline {cpp_ret} {name}({}) {{ {body} }}", cpp_params.join(", ")));
    Ok(item)
}
