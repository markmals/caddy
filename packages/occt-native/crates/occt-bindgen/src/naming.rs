//! Identifier conventions shared by the Rust and C++ emitters.

use std::collections::{BTreeMap, BTreeSet};

use crate::model::{Function, Pass, Prim, Ty};

/// OCCT package of a declaration: the prefix before the first `_` (`BRepPrimAPI_MakeBox` ->
/// `BRepPrimAPI`). Package classes such as `TopExp` are their own package.
pub fn package_of(name: &str) -> &str {
    name.split_once('_').map_or(name, |(package, _)| package)
}

/// snake_case module name for an OCCT package: `BRepPrimAPI` -> `b_rep_prim_api`.
pub fn module_name(package: &str) -> String {
    let chars: Vec<char> = package.chars().collect();
    let mut out = String::new();
    for (index, &ch) in chars.iter().enumerate() {
        let previous = index.checked_sub(1).map(|i| chars[i]);
        let next = chars.get(index + 1).copied();
        let boundary = ch.is_ascii_uppercase()
            && index > 0
            && (previous.is_some_and(|p| p.is_ascii_lowercase() || p.is_ascii_digit())
                || (previous.is_some_and(|p| p.is_ascii_uppercase())
                    && next.is_some_and(|n| n.is_ascii_lowercase())));
        if boundary {
            out.push('_');
        }
        out.push(ch.to_ascii_lowercase());
    }
    out
}

const RUST_KEYWORDS: &[&str] = &[
    "as", "async", "await", "box", "break", "const", "continue", "crate", "dyn", "else", "enum",
    "extern", "false", "fn", "for", "gen", "if", "impl", "in", "let", "loop", "match", "mod",
    "move", "mut", "priv", "pub", "ref", "return", "self", "static", "struct", "super", "trait",
    "true", "try", "type", "unsafe", "use", "where", "while", "yield",
];

/// Rust parameter name from an OCCT parameter name: `theShape` -> `shape`.
pub fn param_name(raw: Option<&str>, index: usize, taken: &mut BTreeSet<String>) -> String {
    let stripped = raw
        .map(|name| match name.strip_prefix("the") {
            Some(rest) if rest.starts_with(|c: char| c.is_ascii_uppercase()) => rest,
            _ => name,
        })
        .filter(|name| !name.is_empty());
    let mut name = match stripped {
        Some(name) => snake_case(name),
        None => format!("arg{index}"),
    };
    if RUST_KEYWORDS.contains(&name.as_str()) || name.starts_with(|c: char| c.is_ascii_digit()) {
        name.push('_');
    }
    while !taken.insert(name.clone()) {
        name.push('_');
    }
    name
}

fn snake_case(name: &str) -> String {
    let mut out = String::new();
    for (index, ch) in name.chars().enumerate() {
        if ch.is_ascii_uppercase() && index > 0 && !out.ends_with('_') {
            out.push('_');
        }
        out.push(ch.to_ascii_lowercase());
    }
    out
}

fn short_type(ty: &Ty, full: bool) -> String {
    let tail = |name: &str| {
        let short = if full { name } else { name.split_once('_').map_or(name, |(_, rest)| rest) };
        short.to_ascii_lowercase()
    };
    match ty {
        Ty::Prim(prim) => match prim {
            Prim::F64 => "real",
            Prim::F32 => "float",
            Prim::I32 => "int",
            Prim::U32 => "uint",
            Prim::Usize => "size",
            Prim::Bool => "bool",
            Prim::U8 => "byte",
        }
        .to_owned(),
        Ty::Enum(name) | Ty::Class(name) | Ty::Collection(name) => tail(name),
        Ty::Handle(name) => format!("h{}", tail(name)),
        Ty::Str | Ty::AsciiString | Ty::Utf8String => "str".to_owned(),
        Ty::Stream => "stream".to_owned(),
    }
}

/// Signature suffix such as `real3` or `ax2_real_real`, collapsing runs of equal types.
fn signature_suffix(function: &Function, full: bool, qualify: bool) -> String {
    let mut tokens: Vec<(String, usize)> = Vec::new();
    for param in &function.params {
        let mut token = short_type(&param.ty.ty, full);
        if qualify && param.ty.pass == Pass::MutRef {
            token = format!("mut{token}");
        }
        match tokens.last_mut() {
            Some((last, count)) if *last == token => *count += 1,
            _ => tokens.push((token, 1)),
        }
    }
    tokens
        .into_iter()
        .map(|(token, count)| if count > 1 { format!("{token}{count}") } else { token })
        .collect::<Vec<_>>()
        .join("_")
}

/// Assigns `rust_name` to each function of one overload set (same class, name and kind).
/// Constructors are always suffixed (`new`, `new_real3`); other names only when overloaded.
pub fn name_overloads(functions: &mut [Function], base: &str, always_suffix: bool) {
    if functions.len() == 1 && !always_suffix {
        functions[0].rust_name = base.to_owned();
        return;
    }
    for (full, qualify) in [(false, false), (false, true), (true, true)] {
        let names: Vec<String> = functions
            .iter()
            .map(|function| join_suffix(base, &signature_suffix(function, full, qualify)))
            .collect();
        let unique: BTreeSet<&String> = names.iter().collect();
        if unique.len() == names.len() {
            for (function, name) in functions.iter_mut().zip(names) {
                function.rust_name = name;
            }
            return;
        }
    }
    // Same parameter types (e.g. const and non-const overloads): number them deterministically.
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for function in functions.iter_mut() {
        let name = join_suffix(base, &signature_suffix(function, true, true));
        let count = counts.entry(name.clone()).or_default();
        *count += 1;
        function.rust_name = if *count == 1 { name } else { format!("{name}_{count}") };
    }
}

fn join_suffix(base: &str, suffix: &str) -> String {
    if suffix.is_empty() { base.to_owned() } else { format!("{base}_{suffix}") }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn module_names_follow_occt_package_words() {
        assert_eq!(module_name("BRepPrimAPI"), "b_rep_prim_api");
        assert_eq!(module_name("TopoDS"), "topo_ds");
        assert_eq!(module_name("GCPnts"), "gc_pnts");
        assert_eq!(module_name("BRepGProp"), "b_rep_g_prop");
        assert_eq!(module_name("STEPControl"), "step_control");
        assert_eq!(module_name("gp"), "gp");
        assert_eq!(module_name("Geom2dAPI"), "geom2d_api");
    }

    #[test]
    fn param_names_strip_occt_prefix_and_escape_keywords() {
        let mut taken = BTreeSet::new();
        assert_eq!(param_name(Some("theShape"), 0, &mut taken), "shape");
        assert_eq!(param_name(Some("Type"), 1, &mut taken), "type_");
        assert_eq!(param_name(None, 2, &mut taken), "arg2");
        assert_eq!(param_name(Some("theShape"), 3, &mut taken), "shape_");
    }
}
