//! Maps libclang types onto the binding type model, rejecting anything the bridge can't carry.

use std::collections::{BTreeMap, BTreeSet};

use clang::{Type, TypeKind};

use crate::model::{Pass, Prim, Ty, TypeUse};

/// What the generator knows about allowlisted names while classifying signatures.
#[derive(Default)]
pub struct TypeTable {
    pub classes: BTreeSet<String>,
    pub transient: BTreeSet<String>,
    pub enums: BTreeSet<String>,
    /// Canonical spelling (e.g. `NCollection_List<TopoDS_Shape>`) to configured typedef name.
    pub collections: BTreeMap<String, String>,
    pub handle_collections: BTreeSet<String>,
}

fn strip_const(spelling: &str) -> &str {
    spelling.trim().strip_prefix("const ").unwrap_or(spelling.trim())
}

impl TypeTable {
    pub fn classify_use(&self, ty: Type) -> Result<TypeUse, String> {
        match ty.get_kind() {
            TypeKind::LValueReference => {
                let pointee = ty.get_pointee_type().ok_or("reference without pointee")?;
                let pass = if pointee.is_const_qualified() { Pass::ConstRef } else { Pass::MutRef };
                let inner = self.classify(pointee)?;
                if matches!(inner, Ty::Str) {
                    return Err("reference to C string".into());
                }
                Ok(TypeUse { ty: inner, pass })
            }
            TypeKind::RValueReference => Err("rvalue reference".into()),
            TypeKind::Pointer => {
                let pointee = ty.get_pointee_type().ok_or("pointer without pointee")?;
                let is_char = matches!(
                    pointee.get_canonical_type().get_kind(),
                    TypeKind::CharS | TypeKind::CharU
                );
                if is_char && pointee.is_const_qualified() {
                    Ok(TypeUse { ty: Ty::Str, pass: Pass::Value })
                } else {
                    Err(format!("pointer `{}`", ty.get_display_name()))
                }
            }
            _ => Ok(TypeUse { ty: self.classify(ty)?, pass: Pass::Value }),
        }
    }

    fn classify(&self, ty: Type) -> Result<Ty, String> {
        let spelled = strip_const(&ty.get_display_name()).to_owned();
        if matches!(spelled.as_str(), "size_t" | "Standard_Size" | "std::size_t") {
            return Ok(Ty::Prim(Prim::Usize));
        }
        let canonical = ty.get_canonical_type();
        let prim = match canonical.get_kind() {
            TypeKind::Double => Some(Prim::F64),
            TypeKind::Float => Some(Prim::F32),
            TypeKind::Int => Some(Prim::I32),
            TypeKind::UInt => Some(Prim::U32),
            TypeKind::Bool => Some(Prim::Bool),
            TypeKind::UChar => Some(Prim::U8),
            _ => None,
        };
        if let Some(prim) = prim {
            return Ok(Ty::Prim(prim));
        }
        match canonical.get_kind() {
            TypeKind::Enum => {
                let name = declaration_name(canonical)?;
                if self.enums.contains(&name) {
                    Ok(Ty::Enum(name))
                } else {
                    Err(format!("enum `{name}` not allowlisted"))
                }
            }
            TypeKind::Record => self.classify_record(canonical),
            TypeKind::Void => Err("void value".into()),
            kind => Err(format!("unsupported type `{spelled}` ({kind:?})")),
        }
    }

    fn classify_record(&self, canonical: Type) -> Result<Ty, String> {
        let spelling = strip_const(&canonical.get_display_name()).to_owned();
        let is_stream =
            matches!(spelling.as_str(), "std::ostream" | "std::istream" | "std::iostream")
                || ["basic_ostream<char", "basic_istream<char", "basic_iostream<char"]
                    .iter()
                    .any(|stream| spelling.contains(stream));
        if is_stream {
            return Ok(Ty::Stream);
        }
        if spelling.starts_with("opencascade::handle<") {
            let target = canonical
                .get_template_argument_types()
                .and_then(|args| args.into_iter().next().flatten())
                .ok_or("handle without template argument")?
                .get_canonical_type();
            let target_spelling = strip_const(&target.get_display_name()).to_owned();
            if let Some(name) = self.collections.get(&target_spelling)
                && self.handle_collections.contains(name)
            {
                return Ok(Ty::Handle(name.clone()));
            }
            let name = declaration_name(target)?;
            return if self.transient.contains(&name) {
                Ok(Ty::Handle(name))
            } else {
                Err(format!("handle to `{target_spelling}` not allowlisted"))
            };
        }
        if let Some(name) = self.collections.get(&spelling) {
            return Ok(Ty::Collection(name.clone()));
        }
        // `NCollection_String` is a specialization, not a typedef target the allowlist can name;
        // OCCT documents its payload as UTF-8, which is what `Ty::Utf8String` carries.
        if spelling == "NCollection_UtfString<char>" {
            return Ok(Ty::Utf8String);
        }
        let name = declaration_name(canonical)?;
        if name == "TCollection_AsciiString" {
            Ok(Ty::AsciiString)
        } else if self.classes.contains(&name) {
            Ok(Ty::Class(name))
        } else {
            Err(format!("type `{spelling}` not allowlisted"))
        }
    }
}

fn declaration_name(ty: Type) -> Result<String, String> {
    ty.get_declaration()
        .and_then(|decl| decl.get_name())
        .ok_or_else(|| format!("anonymous type `{}`", ty.get_display_name()))
}
