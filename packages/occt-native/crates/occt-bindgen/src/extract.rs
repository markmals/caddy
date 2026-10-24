//! Walks the libclang AST of the allowlisted OCCT headers and builds the binding model.

use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet, VecDeque},
    path::PathBuf,
};

use clang::{Accessibility, Availability, Entity, EntityKind, TranslationUnit};

use crate::{
    config::{CollectionKind, Config},
    model::{Bindings, Class, Collection, Enum, FnKind, Function, Param, Skipped, Ty},
    naming::{module_name, name_overloads, package_of, param_name},
    types::TypeTable,
};

pub struct Extractor<'tu> {
    config: &'tu Config,
    declarations: BTreeMap<String, Entity<'tu>>,
    /// Namespaces of free functions (OCCT 8 turned some package classes, e.g. `TopoDS`, into
    /// namespaces). A namespace may be reopened in several headers.
    namespaces: BTreeMap<String, Vec<Entity<'tu>>>,
    table: TypeTable,
    skipped: Vec<Skipped>,
    /// Header lines by path, read on demand when checking for `Standard_EXPORT`.
    sources: RefCell<BTreeMap<PathBuf, Vec<String>>>,
}

impl<'tu> Extractor<'tu> {
    pub fn new(config: &'tu Config, unit: &'tu TranslationUnit<'tu>) -> Result<Self, String> {
        let mut declarations = BTreeMap::new();
        let mut namespaces = BTreeMap::new();
        index_declarations(unit.get_entity(), &mut declarations, &mut namespaces);
        let mut extractor = Self {
            config,
            declarations,
            namespaces,
            table: TypeTable::default(),
            skipped: Vec::new(),
            sources: RefCell::default(),
        };
        extractor.build_type_table()?;
        Ok(extractor)
    }

    fn entity(&self, name: &str) -> Result<Entity<'tu>, String> {
        self.declarations.get(name).copied().ok_or_else(|| format!("`{name}` not found in headers"))
    }

    fn build_type_table(&mut self) -> Result<(), String> {
        for name in &self.config.classes {
            if self.namespaces.contains_key(name) && !self.declarations.contains_key(name) {
                continue;
            }
            let entity = self.entity(name)?;
            if !matches!(entity.get_kind(), EntityKind::ClassDecl | EntityKind::StructDecl) {
                return Err(format!("`{name}` is not a class"));
            }
            if name == "Standard_Transient"
                || ancestor_names(entity).iter().any(|base| base == "Standard_Transient")
            {
                self.table.transient.insert(name.clone());
            }
            self.table.classes.insert(name.clone());
        }
        for name in &self.config.enums {
            if self.entity(name)?.get_kind() != EntityKind::EnumDecl {
                return Err(format!("`{name}` is not an enum"));
            }
            self.table.enums.insert(name.clone());
        }
        for name in self.config.collections.keys() {
            let spelling = self.collection_spelling(name)?;
            if spelling.starts_with("NCollection_H") {
                self.table.handle_collections.insert(name.clone());
            }
            self.table.collections.insert(spelling, name.clone());
        }
        Ok(())
    }

    fn collection_spelling(&self, name: &str) -> Result<String, String> {
        let underlying = self
            .entity(name)?
            .get_typedef_underlying_type()
            .ok_or_else(|| format!("`{name}` is not a typedef"))?;
        Ok(underlying.get_canonical_type().get_display_name())
    }

    pub fn extract(mut self) -> Result<Bindings, String> {
        let config = self.config;
        let mut bindings = Bindings::default();
        for name in &config.enums {
            bindings.enums.push(self.extract_enum(name)?);
        }
        for (name, kind) in &config.collections {
            let collection = self
                .extract_collection(name, *kind)
                .map_err(|reason| format!("collection `{name}`: {reason}"))?;
            bindings.collections.push(collection);
        }
        for name in &config.classes {
            let class = self.extract_class(name)?;
            bindings.classes.push(class);
        }
        bindings.skipped = self.skipped;
        Ok(bindings)
    }

    fn extract_enum(&self, name: &str) -> Result<Enum, String> {
        let entity = self.entity(name)?;
        let underlying = entity.get_enum_underlying_type().ok_or("enum without underlying type")?;
        let repr = match underlying.get_canonical_type().get_display_name().as_str() {
            "unsigned int" => "u32",
            "int" => "i32",
            other => return Err(format!("enum `{name}` has unsupported underlying type {other}")),
        };
        let mut variants = Vec::new();
        let mut values = BTreeSet::new();
        for constant in entity.get_children() {
            if constant.get_kind() != EntityKind::EnumConstantDecl {
                continue;
            }
            let (value, _) = constant.get_enum_constant_value().ok_or("enum constant value")?;
            let variant = constant.get_name().ok_or("unnamed enum constant")?;
            // cxx rejects duplicate discriminants; OCCT aliases stay reachable via the first name.
            if values.insert(value) {
                variants.push((variant, value));
            }
        }
        Ok(Enum {
            name: name.to_owned(),
            module: module_name(package_of(name)),
            header: header_of(entity)?,
            repr,
            variants,
        })
    }

    fn extract_collection(&self, name: &str, kind: CollectionKind) -> Result<Collection, String> {
        let entity = self.entity(name)?;
        let canonical =
            entity.get_typedef_underlying_type().ok_or("not a typedef")?.get_canonical_type();
        let arguments: Vec<_> = canonical
            .get_template_argument_types()
            .unwrap_or_default()
            .into_iter()
            .flatten()
            .collect();
        let classify = |index: usize| -> Result<Ty, String> {
            let ty = arguments.get(index).copied().ok_or("missing template argument")?;
            Ok(self.table.classify_use(ty)?.ty)
        };
        let item = classify(0)?;
        let value = match kind {
            CollectionKind::IndexedDataMap | CollectionKind::DataMap => Some(classify(1)?),
            _ => None,
        };
        Ok(Collection {
            name: name.to_owned(),
            module: module_name(package_of(name)),
            header: header_of(entity)?,
            kind,
            item,
            value,
            is_handle: self.table.handle_collections.contains(name),
        })
    }

    fn extract_class(&mut self, name: &str) -> Result<Class, String> {
        if !self.declarations.contains_key(name)
            && let Some(namespaces) = self.namespaces.get(name).cloned()
        {
            return self.extract_namespace(name, &namespaces);
        }
        let entity = self.entity(name)?;
        let is_abstract = entity.is_abstract_record();
        let ancestors = ancestor_names(entity)
            .into_iter()
            .filter(|base| self.table.classes.contains(base))
            .collect();

        let mut constructors = Vec::new();
        let declares_constructor =
            entity.get_children().iter().any(|member| member.get_kind() == EntityKind::Constructor);
        if !is_abstract && !declares_constructor {
            // No user-declared constructor: C++ provides an implicit public default one.
            constructors.push(Function {
                cpp_name: name.to_owned(),
                kind: FnKind::Constructor,
                params: Vec::new(),
                ret: None,
                rust_name: String::new(),
                needs_shim: false,
            });
        }
        if !is_abstract {
            for member in entity.get_children() {
                if member.get_kind() == EntityKind::Constructor && self.is_bindable(member) {
                    if member.is_copy_constructor() || member.is_move_constructor() {
                        continue;
                    }
                    if let Some(function) = self.function(name, member, FnKind::Constructor) {
                        constructors.push(function);
                    }
                }
            }
        }
        let mut methods = Vec::new();
        let mut hidden = BTreeSet::new();
        for class in public_hierarchy(entity) {
            let mut declared_here = BTreeSet::new();
            for (member, via_using) in class_members(class) {
                if member.get_kind() != EntityKind::Method {
                    continue;
                }
                // Any declaration hides same-named base members, whatever its access.
                let member_name = member.get_name().unwrap_or_default();
                declared_here.insert(member_name.clone());
                let is_operator = member_name.starts_with("operator");
                if hidden.contains(&member_name)
                    || (is_operator && operator_rust_name(&member_name).is_none())
                    || !self.is_bindable(member)
                {
                    continue;
                }
                let kind = if member.is_static_method() {
                    FnKind::Static
                } else {
                    FnKind::Method { is_const: member.is_const_method() }
                };
                if let Some(mut function) = self.function(name, member, kind) {
                    function.needs_shim = via_using || is_operator;
                    methods.push(function);
                }
            }
            hidden.extend(declared_here);
        }
        let (constructors, methods) = self.name_and_filter(name, constructors, methods);
        Ok(Class {
            name: name.to_owned(),
            module: module_name(package_of(name)),
            header: header_of(entity)?,
            is_transient: self.table.transient.contains(name),
            is_namespace: false,
            clone: self.config.clone.iter().any(|c| c == name),
            ancestors,
            constructors,
            methods,
        })
    }

    fn extract_namespace(
        &mut self,
        name: &str,
        namespaces: &[Entity<'tu>],
    ) -> Result<Class, String> {
        let mut functions = Vec::new();
        for namespace in namespaces {
            for member in namespace.get_children() {
                if member.get_kind() != EntityKind::FunctionDecl || !self.is_bindable(member) {
                    continue;
                }
                if let Some(function) = self.function(name, member, FnKind::Static) {
                    functions.push(function);
                }
            }
        }
        let (_, methods) = self.name_and_filter(name, Vec::new(), functions);
        Ok(Class {
            name: name.to_owned(),
            module: module_name(package_of(name)),
            header: header_of(namespaces[0])?,
            is_transient: false,
            is_namespace: true,
            clone: false,
            ancestors: Vec::new(),
            constructors: Vec::new(),
            methods,
        })
    }

    fn name_and_filter(
        &mut self,
        class: &str,
        mut constructors: Vec<Function>,
        methods: Vec<Function>,
    ) -> (Vec<Function>, Vec<Function>) {
        name_overloads(&mut constructors, "new", true);
        let mut by_name: BTreeMap<String, Vec<Function>> = BTreeMap::new();
        for method in methods {
            by_name.entry(method.cpp_name.clone()).or_default().push(method);
        }
        let mut named = Vec::new();
        for (cpp_name, mut group) in by_name {
            let base =
                operator_rust_name(&cpp_name).map_or_else(|| cpp_name.clone(), str::to_owned);
            name_overloads(&mut group, &base, false);
            named.extend(group);
        }
        let constructors = self.apply_exclusions(class, constructors, "new");
        let methods = self.apply_exclusions(class, named, "");
        (constructors, methods)
    }

    fn apply_exclusions(
        &mut self,
        class: &str,
        functions: Vec<Function>,
        group: &str,
    ) -> Vec<Function> {
        functions
            .into_iter()
            .filter(|function| {
                let cpp = if group.is_empty() { function.cpp_name.as_str() } else { group };
                let excluded = self.config.is_excluded(class, cpp)
                    || self.config.is_excluded(class, &function.rust_name);
                if excluded {
                    self.skip(
                        format!("{class}::{}", function.rust_name),
                        "excluded in bindings.toml",
                    );
                }
                !excluded
            })
            .collect()
    }

    /// Public, non-deprecated, non-deleted, exported (or inline) declarations only.
    fn is_bindable(&mut self, member: Entity) -> bool {
        // Namespace-scope functions have no access specifier.
        let public = member.get_kind() == EntityKind::FunctionDecl
            || member.get_accessibility() == Some(Accessibility::Public);
        if !public || member.get_availability() == Availability::Deprecated || member.is_variadic()
        {
            return false;
        }
        let tokens: Vec<String> = member
            .get_range()
            .map(|range| range.tokenize().iter().map(|t| t.get_spelling()).collect())
            .unwrap_or_default();
        if tokens.windows(2).any(|pair| pair[0] == "=" && pair[1] == "delete") {
            return false;
        }
        // Only headers are parsed, so any visible definition (in-class or `.lxx`) is inline, and
        // pure virtuals dispatch through the vtable. Other out-of-line members are only
        // dllexported on Windows with Standard_EXPORT; the macro expands to nothing elsewhere,
        // so look for it in the declaration's source text.
        let linkable = member.is_inline_function()
            || member.is_pure_virtual_method()
            || member.get_definition().is_some()
            || self.declared_exported(member);
        if !linkable {
            let parent =
                member.get_semantic_parent().and_then(|p| p.get_name()).unwrap_or_default();
            let name = member.get_display_name().unwrap_or_default();
            self.skip(format!("{parent}::{name}"), "not exported (no Standard_EXPORT, not inline)");
        }
        linkable
    }

    fn declared_exported(&self, member: Entity) -> bool {
        let Some(start) = member.get_range().map(|range| range.get_start().get_file_location())
        else {
            return false;
        };
        let Some(file) = start.file else { return false };
        let path = file.get_path();
        let mut cache = self.sources.borrow_mut();
        let lines = cache.entry(path.clone()).or_insert_with(|| {
            std::fs::read_to_string(&path).unwrap_or_default().lines().map(str::to_owned).collect()
        });
        let line_text = |number: usize| number.checked_sub(1).and_then(|index| lines.get(index));
        // The macro sits on the declaration's first line (possibly inside the RTTI macro), or
        // alone on the line before it.
        let first_line = line_text(start.line as usize).is_some_and(|t| {
            t.contains("Standard_EXPORT") || t.contains("DEFINE_STANDARD_RTTIEXT")
        });
        let previous =
            line_text(start.line as usize - 1).is_some_and(|t| t.trim() == "Standard_EXPORT");
        first_line || previous
    }

    fn function(&mut self, class: &str, member: Entity, kind: FnKind) -> Option<Function> {
        let cpp_name = member.get_name().unwrap_or_default();
        let symbol = format!(
            "{class}::{cpp_name}{}",
            member
                .get_display_name()
                .map_or(String::new(), |d| d.trim_start_matches(&cpp_name).to_owned())
        );
        let mut taken = BTreeSet::from(["self_".to_owned()]);
        let mut params = Vec::new();
        for (index, argument) in member.get_arguments().unwrap_or_default().into_iter().enumerate()
        {
            let ty = match argument
                .get_type()
                .ok_or("argument without type".to_owned())
                .and_then(|ty| self.table.classify_use(ty))
            {
                Ok(ty) => ty,
                Err(reason) => {
                    self.skip(symbol, &format!("parameter {index}: {reason}"));
                    return None;
                }
            };
            let name = param_name(argument.get_name().as_deref(), index, &mut taken);
            let optional_text = ty.ty == Ty::Str && defaults_to_null(argument);
            params.push(Param { name, ty, optional_text });
        }
        let ret = match kind {
            FnKind::Constructor => None,
            _ => {
                let result = member.get_result_type()?;
                if result.get_kind() == clang::TypeKind::Void {
                    None
                } else {
                    match self.table.classify_use(result) {
                        Ok(ty) => Some(ty),
                        Err(reason) => {
                            self.skip(symbol, &format!("return: {reason}"));
                            return None;
                        }
                    }
                }
            }
        };
        Some(Function { cpp_name, kind, params, ret, rust_name: String::new(), needs_shim: false })
    }

    fn skip(&mut self, symbol: String, reason: &str) {
        self.skipped.push(Skipped { symbol, reason: reason.to_owned() });
    }
}

/// Operators with a natural Rust name; all others are skipped.
fn operator_rust_name(cpp_name: &str) -> Option<&'static str> {
    match cpp_name {
        "operator()" => Some("call"),
        "operator==" => Some("eq"),
        _ => None,
    }
}

fn index_declarations<'tu>(
    unit: Entity<'tu>,
    declarations: &mut BTreeMap<String, Entity<'tu>>,
    namespaces: &mut BTreeMap<String, Vec<Entity<'tu>>>,
) {
    for child in unit.get_children() {
        let Some(name) = child.get_name() else { continue };
        match child.get_kind() {
            EntityKind::ClassDecl | EntityKind::StructDecl | EntityKind::EnumDecl => {
                if child.is_definition() {
                    declarations.insert(name, child);
                }
            }
            EntityKind::TypedefDecl | EntityKind::TypeAliasDecl => {
                declarations.entry(name).or_insert(child);
            }
            EntityKind::Namespace => namespaces.entry(name).or_default().push(child),
            _ => {}
        }
    }
}

/// Members declared in `class`, plus base-class members a public `using Base::Name;` re-exposes
/// (flagged `true`; OCCT uses this to publish selected members of protected bases).
fn class_members(class: Entity) -> Vec<(Entity, bool)> {
    let mut members = Vec::new();
    for child in class.get_children() {
        if child.get_kind() != EntityKind::UsingDeclaration {
            members.push((child, false));
            continue;
        }
        if child.get_accessibility() != Some(Accessibility::Public) {
            continue;
        }
        for reference in child.get_children() {
            let targets = match reference.get_kind() {
                EntityKind::OverloadedDeclRef => {
                    reference.get_overloaded_declarations().unwrap_or_default()
                }
                _ => reference.get_reference().into_iter().collect(),
            };
            members.extend(targets.into_iter().map(|target| (target, true)));
        }
    }
    members
}

/// The class itself followed by its public bases, breadth-first.
fn public_hierarchy(entity: Entity) -> Vec<Entity> {
    let mut order = Vec::new();
    let mut queue = VecDeque::from([entity]);
    let mut seen = BTreeSet::new();
    while let Some(class) = queue.pop_front() {
        let Some(name) = class.get_name() else { continue };
        if !seen.insert(name) {
            continue;
        }
        order.push(class);
        for child in class.get_children() {
            if child.get_kind() != EntityKind::BaseSpecifier
                || child.get_accessibility() != Some(Accessibility::Public)
            {
                continue;
            }
            let base = child.get_type().and_then(|ty| ty.get_declaration());
            if let Some(base) = base.and_then(|b| b.get_definition())
                && base.get_kind() != EntityKind::ClassTemplate
            {
                queue.push_back(base);
            }
        }
    }
    order
}

/// True when the parameter's C++ default argument is a null pointer.
fn defaults_to_null(argument: Entity) -> bool {
    let Some(range) = argument.get_range() else { return false };
    let tokens: Vec<String> = range.tokenize().iter().map(|token| token.get_spelling()).collect();
    tokens
        .windows(2)
        .any(|pair| pair[0] == "=" && matches!(pair[1].as_str(), "nullptr" | "NULL" | "0"))
}

fn ancestor_names(entity: Entity) -> Vec<String> {
    public_hierarchy(entity).into_iter().skip(1).filter_map(|class| class.get_name()).collect()
}

fn header_of(entity: Entity) -> Result<String, String> {
    let file = entity
        .get_location()
        .and_then(|location| location.get_file_location().file)
        .ok_or("declaration without file")?;
    let path = file.get_path();
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or_else(|| format!("bad header path {}", path.display()))
}
