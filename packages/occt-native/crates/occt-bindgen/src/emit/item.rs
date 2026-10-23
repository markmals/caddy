//! One generated declaration: its bridge line(s), optional C++ shim, and the types it touches.

use std::collections::BTreeSet;

use crate::model::Ty;

use super::types::{bridge_name, header_owner};

#[derive(Debug, Default)]
pub struct Item {
    /// Declaration inside the bridge's `unsafe extern "C++"` block.
    pub rust: String,
    /// Inline C++ definition placed in the module's generated header.
    pub cpp: Option<String>,
    /// Bridge type names referenced (need declarations or aliases in the module).
    pub types: BTreeSet<String>,
    /// Allowlisted names whose OCCT header must be included.
    pub headers: BTreeSet<String>,
    /// Bridge type names that appear inside `UniquePtr<...>`.
    pub owned: BTreeSet<String>,
}

impl Item {
    pub fn uses(&mut self, ty: &Ty) {
        if let Some(name) = bridge_name(ty) {
            self.types.insert(name);
        }
        if let Some(owner) = header_owner(ty) {
            self.headers.insert(owner.to_owned());
        }
    }

    pub fn uses_name(&mut self, name: &str) {
        self.types.insert(name.to_owned());
        self.headers.insert(name.to_owned());
    }

    pub fn owns(&mut self, bridge_type: &str) {
        self.owned.insert(bridge_type.to_owned());
    }
}
