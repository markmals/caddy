//! Assembly of one OCCT package into a cxx bridge (`src/<module>.rs`) and its C++ header.

use std::collections::BTreeSet;

use crate::model::Enum;

use super::{GENERATED_MARKER, item::Item};

pub struct Module {
    pub name: String,
    pub enums: Vec<Enum>,
    /// Opaque types whose canonical bridge declaration lives in this module.
    declared: BTreeSet<String>,
    pub items: Vec<Item>,
}

impl Module {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_owned(),
            enums: Vec::new(),
            declared: BTreeSet::new(),
            items: Vec::new(),
        }
    }

    pub fn declare(&mut self, bridge_type: &str) {
        self.declared.insert(bridge_type.to_owned());
    }

    fn owns_type(&self, name: &str) -> bool {
        self.declared.contains(name) || self.enums.iter().any(|e| e.name == name)
    }

    pub fn rust_source(
        &self,
        owned_anywhere: &BTreeSet<String>,
        owner_module: &dyn Fn(&str) -> String,
        occt_version: &str,
    ) -> String {
        let mut out = format!(
            "//! {GENERATED_MARKER} from OCCT {occt_version} headers. Do not edit; see bindings.toml.\n\
             pub use inner::*;\n\n#[rustfmt::skip]\n#[cxx::bridge]\nmod inner {{\n"
        );
        for enumeration in &self.enums {
            out.push_str(&format!(
                "    #[repr({})]\n    #[derive(Debug)]\n    enum {} {{\n",
                enumeration.repr, enumeration.name
            ));
            for (variant, value) in &enumeration.variants {
                out.push_str(&format!("        {variant} = {value},\n"));
            }
            out.push_str("    }\n\n");
        }
        out.push_str(&format!(
            "    unsafe extern \"C++\" {{\n        include!(\"opencascade-sys/include/generated/{}.hxx\");\n\n",
            self.name
        ));
        for enumeration in &self.enums {
            out.push_str(&format!("        type {};\n", enumeration.name));
        }
        for name in &self.declared {
            out.push_str(&format!("        type {name};\n"));
        }
        let referenced: BTreeSet<&String> =
            self.items.iter().flat_map(|item| &item.types).collect();
        for name in referenced.into_iter().filter(|name| !self.owns_type(name)) {
            out.push_str(&format!(
                "        type {name} = crate::{}::{name};\n",
                owner_module(name)
            ));
        }
        for item in &self.items {
            out.push('\n');
            for line in item.rust.lines() {
                out.push_str(&format!("        {line}\n"));
            }
        }
        out.push_str("    }\n");
        for name in self.declared.iter().filter(|name| owned_anywhere.contains(*name)) {
            out.push_str(&format!("\n    impl UniquePtr<{name}> {{}}"));
        }
        out.push_str("\n}\n");
        out
    }

    pub fn cpp_header(&self, header_of: &dyn Fn(&str) -> String, occt_version: &str) -> String {
        let mut headers: BTreeSet<String> = self.enums.iter().map(|e| e.header.clone()).collect();
        for name in &self.declared {
            headers.insert(header_of(name.strip_prefix("Handle_").unwrap_or(name)));
        }
        for item in &self.items {
            headers.extend(item.headers.iter().map(|name| header_of(name)));
        }
        let mut out = format!(
            "// {GENERATED_MARKER} from OCCT {occt_version} headers. Do not edit; see bindings.toml.\n\
             #pragma once\n#include \"../bindings_common.hxx\"\n#include \"handles.hxx\"\n\n"
        );
        for header in headers {
            out.push_str(&format!("#include <{header}>\n"));
        }
        for item in &self.items {
            if let Some(cpp) = &item.cpp {
                out.push('\n');
                out.push_str(cpp);
                out.push('\n');
            }
        }
        out
    }
}
