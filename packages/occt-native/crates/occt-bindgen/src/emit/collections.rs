//! Accessors for allowlisted NCollection typedefs, chosen by their configured kind.
//!
//! Indices follow OCCT: `Array*`, `Sequence` and indexed maps are as OCCT defines them
//! (usually 1-based); `List` access is 0-based because OCCT lists have no index access.

use crate::{
    config::CollectionKind,
    model::{Collection, Ty},
};

use super::{
    helpers::handle_helpers,
    item::Item,
    types::{bridge_name, cpp_prim, rust_prim},
};

/// Spelling of an element in parameter / return position.
struct Spelled {
    rust_param: String,
    cpp_param: String,
    rust_return: String,
    cpp_return: String,
}

fn spell(ty: &Ty) -> Result<Spelled, String> {
    match ty {
        Ty::Prim(p) => Ok(Spelled {
            rust_param: rust_prim(*p).into(),
            cpp_param: cpp_prim(*p).into(),
            rust_return: rust_prim(*p).into(),
            cpp_return: cpp_prim(*p).into(),
        }),
        Ty::Enum(e) => Ok(Spelled {
            rust_param: e.clone(),
            cpp_param: e.clone(),
            rust_return: e.clone(),
            cpp_return: e.clone(),
        }),
        Ty::Class(_) | Ty::Collection(_) | Ty::Handle(_) => {
            let t = bridge_name(ty).expect("opaque");
            Ok(Spelled {
                rust_param: format!("&{t}"),
                cpp_param: format!("const {t}&"),
                rust_return: format!("&{t}"),
                cpp_return: format!("const {t}&"),
            })
        }
        other => Err(format!("unsupported collection element {other:?}")),
    }
}

struct Builder {
    rust: Vec<String>,
    cpp: Vec<String>,
}

impl Builder {
    fn add(&mut self, rust: String, cpp: String) {
        self.rust.push(rust);
        self.cpp.push(cpp);
    }
}

pub fn collection_items(collection: &Collection) -> Result<Vec<Item>, String> {
    let l = &collection.name;
    let item = spell(&collection.item)?;
    let mut b = Builder { rust: Vec::new(), cpp: Vec::new() };
    let (rust_new_params, cpp_new_params, new_args) = match collection.kind {
        CollectionKind::Array1 => {
            ("lower: i32, upper: i32", "int32_t lower, int32_t upper", "lower, upper")
        }
        CollectionKind::Array2 => (
            "row_lower: i32, row_upper: i32, col_lower: i32, col_upper: i32",
            "int32_t row_lower, int32_t row_upper, int32_t col_lower, int32_t col_upper",
            "row_lower, row_upper, col_lower, col_upper",
        ),
        _ => ("", "", ""),
    };
    if collection.is_handle {
        b.add(
            format!("fn {l}_new({rust_new_params}) -> Result<UniquePtr<Handle_{l}>>;"),
            format!("inline std::unique_ptr<Handle_{l}> {l}_new({cpp_new_params}) {{ return std::make_unique<Handle_{l}>(new {l}({new_args})); }}"),
        );
    } else {
        b.add(
            format!("fn {l}_new({rust_new_params}) -> Result<UniquePtr<{l}>>;"),
            format!("inline std::unique_ptr<{l}> {l}_new({cpp_new_params}) {{ return std::make_unique<{l}>({new_args}); }}"),
        );
    }
    let (ip, cp, ir, cr) = (&item.rust_param, &item.cpp_param, &item.rust_return, &item.cpp_return);
    match collection.kind {
        CollectionKind::List => {
            b.add(
                format!("fn {l}_append(self_: Pin<&mut {l}>, item: {ip}) -> Result<()>;"),
                format!("inline void {l}_append({l}& self_, {cp} item) {{ self_.Append(item); }}"),
            );
            b.add(
                format!("fn {l}_size(self_: &{l}) -> Result<i32>;"),
                format!("inline int32_t {l}_size(const {l}& self_) {{ return self_.Size(); }}"),
            );
            b.add(
                format!("fn {l}_value(self_: &{l}, index: i32) -> Result<{ir}>;"),
                format!("inline {cr} {l}_value(const {l}& self_, int32_t index) {{ return occt_bindings::list_value(self_, index); }}"),
            );
        }
        CollectionKind::Sequence => {
            b.add(
                format!("fn {l}_append(self_: Pin<&mut {l}>, item: {ip}) -> Result<()>;"),
                format!("inline void {l}_append({l}& self_, {cp} item) {{ self_.Append(item); }}"),
            );
            b.add(
                format!("fn {l}_length(self_: &{l}) -> Result<i32>;"),
                format!("inline int32_t {l}_length(const {l}& self_) {{ return self_.Length(); }}"),
            );
            b.add(format!("fn {l}_value(self_: &{l}, index: i32) -> Result<{ir}>;"), format!("inline {cr} {l}_value(const {l}& self_, int32_t index) {{ return self_.Value(index); }}"));
        }
        CollectionKind::Array1 => {
            b.add(format!("fn {l}_set_value(self_: Pin<&mut {l}>, index: i32, item: {ip}) -> Result<()>;"), format!("inline void {l}_set_value({l}& self_, int32_t index, {cp} item) {{ self_.SetValue(index, item); }}"));
            b.add(format!("fn {l}_value(self_: &{l}, index: i32) -> Result<{ir}>;"), format!("inline {cr} {l}_value(const {l}& self_, int32_t index) {{ return self_.Value(index); }}"));
            for (method, cpp) in [("lower", "Lower"), ("upper", "Upper"), ("length", "Length")] {
                b.add(
                    format!("fn {l}_{method}(self_: &{l}) -> Result<i32>;"),
                    format!(
                        "inline int32_t {l}_{method}(const {l}& self_) {{ return self_.{cpp}(); }}"
                    ),
                );
            }
        }
        CollectionKind::Array2 => {
            b.add(format!("fn {l}_set_value(self_: Pin<&mut {l}>, row: i32, col: i32, item: {ip}) -> Result<()>;"), format!("inline void {l}_set_value({l}& self_, int32_t row, int32_t col, {cp} item) {{ self_.SetValue(row, col, item); }}"));
            b.add(format!("fn {l}_value(self_: &{l}, row: i32, col: i32) -> Result<{ir}>;"), format!("inline {cr} {l}_value(const {l}& self_, int32_t row, int32_t col) {{ return self_.Value(row, col); }}"));
            for (method, cpp) in [
                ("lower_row", "LowerRow"),
                ("upper_row", "UpperRow"),
                ("lower_col", "LowerCol"),
                ("upper_col", "UpperCol"),
            ] {
                b.add(
                    format!("fn {l}_{method}(self_: &{l}) -> Result<i32>;"),
                    format!(
                        "inline int32_t {l}_{method}(const {l}& self_) {{ return self_.{cpp}(); }}"
                    ),
                );
            }
        }
        CollectionKind::Map => {
            b.add(
                format!("fn {l}_add(self_: Pin<&mut {l}>, item: {ip}) -> Result<bool>;"),
                format!("inline bool {l}_add({l}& self_, {cp} item) {{ return self_.Add(item); }}"),
            );
            b.add(format!("fn {l}_contains(self_: &{l}, item: {ip}) -> Result<bool>;"), format!("inline bool {l}_contains(const {l}& self_, {cp} item) {{ return self_.Contains(item); }}"));
            b.add(
                format!("fn {l}_extent(self_: &{l}) -> Result<i32>;"),
                format!("inline int32_t {l}_extent(const {l}& self_) {{ return self_.Extent(); }}"),
            );
        }
        CollectionKind::IndexedMap => {
            b.add(
                format!("fn {l}_add(self_: Pin<&mut {l}>, item: {ip}) -> Result<i32>;"),
                format!(
                    "inline int32_t {l}_add({l}& self_, {cp} item) {{ return self_.Add(item); }}"
                ),
            );
            b.add(format!("fn {l}_contains(self_: &{l}, item: {ip}) -> Result<bool>;"), format!("inline bool {l}_contains(const {l}& self_, {cp} item) {{ return self_.Contains(item); }}"));
            b.add(
                format!("fn {l}_extent(self_: &{l}) -> Result<i32>;"),
                format!("inline int32_t {l}_extent(const {l}& self_) {{ return self_.Extent(); }}"),
            );
            b.add(format!("fn {l}_find_key(self_: &{l}, index: i32) -> Result<{ir}>;"), format!("inline {cr} {l}_find_key(const {l}& self_, int32_t index) {{ return self_.FindKey(index); }}"));
            b.add(format!("fn {l}_find_index(self_: &{l}, item: {ip}) -> Result<i32>;"), format!("inline int32_t {l}_find_index(const {l}& self_, {cp} item) {{ return self_.FindIndex(item); }}"));
        }
        CollectionKind::IndexedDataMap | CollectionKind::DataMap => {
            let value = spell(collection.value.as_ref().ok_or("map without value type")?)?;
            let (vp, vcp, vr, vcr) =
                (&value.rust_param, &value.cpp_param, &value.rust_return, &value.cpp_return);
            let tied_vr = vr.replacen('&', "&'a ", 1);
            b.add(format!("fn {l}_contains(self_: &{l}, key: {ip}) -> Result<bool>;"), format!("inline bool {l}_contains(const {l}& self_, {cp} key) {{ return self_.{}(key); }}", if collection.kind == CollectionKind::DataMap { "IsBound" } else { "Contains" }));
            b.add(
                format!("fn {l}_extent(self_: &{l}) -> Result<i32>;"),
                format!("inline int32_t {l}_extent(const {l}& self_) {{ return self_.Extent(); }}"),
            );
            if collection.kind == CollectionKind::DataMap {
                b.add(format!("fn {l}_bind(self_: Pin<&mut {l}>, key: {ip}, value: {vp}) -> Result<bool>;"), format!("inline bool {l}_bind({l}& self_, {cp} key, {vcp} value) {{ return self_.Bind(key, value); }}"));
                b.add(format!("fn {l}_find<'a>(self_: &'a {l}, key: {ip}) -> Result<{tied_vr}>;"), format!("inline {vcr} {l}_find(const {l}& self_, {cp} key) {{ return self_.Find(key); }}"));
            } else {
                b.add(format!("fn {l}_find_key(self_: &{l}, index: i32) -> Result<{ir}>;"), format!("inline {cr} {l}_find_key(const {l}& self_, int32_t index) {{ return self_.FindKey(index); }}"));
                b.add(format!("fn {l}_find_from_index(self_: &{l}, index: i32) -> Result<{vr}>;"), format!("inline {vcr} {l}_find_from_index(const {l}& self_, int32_t index) {{ return self_.FindFromIndex(index); }}"));
                b.add(format!("fn {l}_find_index(self_: &{l}, key: {ip}) -> Result<i32>;"), format!("inline int32_t {l}_find_index(const {l}& self_, {cp} key) {{ return self_.FindIndex(key); }}"));
            }
        }
    }
    let mut main = Item { rust: b.rust.join("\n"), cpp: Some(b.cpp.join("\n")), ..Item::default() };
    main.uses_name(l);
    main.uses(&collection.item);
    if let Some(value) = &collection.value {
        main.uses(value);
    }
    if collection.is_handle {
        main.uses(&Ty::Handle(l.clone()));
        main.owns(&format!("Handle_{l}"));
        Ok(vec![main, handle_helpers(l)])
    } else {
        main.owns(l);
        Ok(vec![main])
    }
}
