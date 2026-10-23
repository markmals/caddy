//! The allowlist (`bindings.toml`) that decides which OCCT declarations get bindings.

use std::{collections::BTreeMap, fs, path::Path};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// Classes (including "package" classes of static functions such as `TopExp`).
    pub classes: Vec<String>,
    /// Enums, bound as cxx shared enums.
    #[serde(default)]
    pub enums: Vec<String>,
    /// NCollection typedefs by name, with the access pattern to generate.
    #[serde(default)]
    pub collections: BTreeMap<String, CollectionKind>,
    /// Value classes that get `<Class>_clone` and owned upcasts (`<Class>_to_<Base>`).
    #[serde(default)]
    pub clone: Vec<String>,
    /// `Class::Name` mapped to the reason it is skipped. `Name` is a C++ member name (all
    /// overloads, `new` for constructors) or the generated Rust name of a single overload.
    #[serde(default)]
    pub exclude: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CollectionKind {
    List,
    Sequence,
    Array1,
    Array2,
    Map,
    IndexedMap,
    IndexedDataMap,
    DataMap,
}

impl Config {
    pub fn load(path: &Path) -> Result<Self, String> {
        let text = fs::read_to_string(path)
            .map_err(|error| format!("cannot read {}: {error}", path.display()))?;
        let config: Config =
            toml::from_str(&text).map_err(|error| format!("{}: {error}", path.display()))?;
        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> Result<(), String> {
        let mut seen = std::collections::BTreeSet::new();
        let names = self.classes.iter().chain(&self.enums).chain(self.collections.keys());
        for name in names {
            if !seen.insert(name) {
                return Err(format!("`{name}` is listed more than once"));
            }
        }
        for name in &self.clone {
            if !self.classes.contains(name) {
                return Err(format!("clone entry `{name}` is not a listed class"));
            }
        }
        Ok(())
    }

    pub fn is_excluded(&self, class: &str, member: &str) -> bool {
        self.exclude.contains_key(&format!("{class}::{member}"))
    }
}
