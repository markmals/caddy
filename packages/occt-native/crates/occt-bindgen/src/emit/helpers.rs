//! Per-class conveniences that OCCT expresses through C++ language features: copies,
//! base-class conversions, and `opencascade::handle` management for transient classes.

use crate::model::{Bindings, Class};

use super::item::Item;

fn item(rust: String, cpp: String) -> Item {
    Item { rust, cpp: Some(cpp), ..Item::default() }
}

pub fn class_helpers(class: &Class, bindings: &Bindings) -> Vec<Item> {
    let c = &class.name;
    let mut items = Vec::new();
    if class.clone {
        let mut clone = item(
            format!("fn {c}_clone(self_: &{c}) -> UniquePtr<{c}>;"),
            format!(
                "inline std::unique_ptr<{c}> {c}_clone(const {c}& self_) {{ return std::make_unique<{c}>(self_); }}"
            ),
        );
        clone.uses_name(c);
        clone.owns(c);
        items.push(clone);
    }
    for b in &class.ancestors {
        let base = bindings.class(b).expect("ancestors are allowlisted classes");
        let mut as_ref = item(
            format!(
                "fn {c}_as_{b}(self_: &{c}) -> &{b};\nfn {c}_as_{b}_mut(self_: Pin<&mut {c}>) -> Pin<&mut {b}>;"
            ),
            format!(
                "inline const {b}& {c}_as_{b}(const {c}& self_) {{ return self_; }}\n\
                 inline {b}& {c}_as_{b}_mut({c}& self_) {{ return self_; }}"
            ),
        );
        as_ref.uses_name(c);
        as_ref.uses_name(b);
        items.push(as_ref);
        if class.clone && base.clone {
            let mut owned = item(
                format!("fn {c}_to_{b}(self_: &{c}) -> UniquePtr<{b}>;"),
                format!(
                    "inline std::unique_ptr<{b}> {c}_to_{b}(const {c}& self_) {{ return std::make_unique<{b}>(self_); }}"
                ),
            );
            owned.uses_name(c);
            owned.uses_name(b);
            owned.owns(b);
            items.push(owned);
        }
        if class.is_transient && base.is_transient {
            items.push(handle_casts(c, b));
        }
    }
    if class.is_transient {
        items.push(handle_helpers(c));
    }
    items
}

fn handle_casts(c: &str, b: &str) -> Item {
    let mut casts = item(
        format!(
            "fn Handle_{c}_to_{b}(handle: &Handle_{c}) -> UniquePtr<Handle_{b}>;\n\
             /// Null when `handle` does not refer to a `{c}`.\n\
             fn Handle_{c}_from_{b}(handle: &Handle_{b}) -> UniquePtr<Handle_{c}>;"
        ),
        format!(
            "inline std::unique_ptr<Handle_{b}> Handle_{c}_to_{b}(const Handle_{c}& handle) {{ return std::make_unique<Handle_{b}>(handle); }}\n\
             inline std::unique_ptr<Handle_{c}> Handle_{c}_from_{b}(const Handle_{b}& handle) {{ return std::make_unique<Handle_{c}>(Handle_{c}::DownCast(handle)); }}"
        ),
    );
    for name in [c, b] {
        casts.uses(&crate::model::Ty::Handle(name.to_owned()));
        casts.owns(&format!("Handle_{name}"));
    }
    casts
}

/// Null checks, dereference (throwing on null), copies and a null constructor for `Handle_<c>`.
pub fn handle_helpers(c: &str) -> Item {
    let h = format!("Handle_{c}");
    let mut helpers = item(
        format!(
            "fn {h}_null() -> UniquePtr<{h}>;\n\
             fn {h}_is_null(handle: &{h}) -> bool;\n\
             fn {h}_clone(handle: &{h}) -> UniquePtr<{h}>;\n\
             fn {h}_get(handle: &{h}) -> Result<&{c}>;\n\
             fn {h}_get_mut(handle: Pin<&mut {h}>) -> Result<Pin<&mut {c}>>;"
        ),
        format!(
            "inline std::unique_ptr<{h}> {h}_null() {{ return std::make_unique<{h}>(); }}\n\
             inline bool {h}_is_null(const {h}& handle) {{ return handle.IsNull(); }}\n\
             inline std::unique_ptr<{h}> {h}_clone(const {h}& handle) {{ return std::make_unique<{h}>(handle); }}\n\
             inline const {c}& {h}_get(const {h}& handle) {{ return occt_bindings::handle_get(handle); }}\n\
             inline {c}& {h}_get_mut({h}& handle) {{ return occt_bindings::handle_get(handle); }}"
        ),
    );
    helpers.uses(&crate::model::Ty::Handle(c.to_owned()));
    helpers.uses_name(c);
    helpers.owns(&h);
    helpers
}
