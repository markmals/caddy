//! Resolves which OCCT toolkits (shared libraries) the generated bindings must link.
//!
//! OCCT's source tree is laid out as `src/<Module>/<Toolkit>/<Package>/<Header>.hxx`, and each
//! toolkit lists its dependencies in `EXTERNLIB.cmake`. Linking the dependency closure covers
//! symbols reached through inline header code as well as direct calls.

use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

pub struct ToolkitIndex {
    header_toolkit: BTreeMap<String, String>,
    dependencies: BTreeMap<String, BTreeSet<String>>,
}

impl ToolkitIndex {
    pub fn load(occt_source: &Path) -> Result<Self, String> {
        let mut index = Self { header_toolkit: BTreeMap::new(), dependencies: BTreeMap::new() };
        let src = occt_source.join("src");
        for module in read_dirs(&src)? {
            for toolkit in read_dirs(&module)? {
                let name = file_name(&toolkit);
                if !name.starts_with("TK") {
                    continue;
                }
                index.dependencies.insert(name.clone(), externlib(&toolkit, &name)?);
                for package in read_dirs(&toolkit)? {
                    for header in fs::read_dir(&package).map_err(|e| e.to_string())? {
                        let header = file_name(&header.map_err(|e| e.to_string())?.path());
                        if header.ends_with(".hxx") {
                            index.header_toolkit.insert(header, name.clone());
                        }
                    }
                }
            }
        }
        if index.header_toolkit.is_empty() {
            return Err(format!("no OCCT toolkits found under {}", src.display()));
        }
        Ok(index)
    }

    /// Toolkits defining `headers`, plus everything they depend on, sorted.
    pub fn closure<'a>(&self, headers: impl IntoIterator<Item = &'a str>) -> Vec<String> {
        let mut pending: Vec<String> =
            headers.into_iter().filter_map(|h| self.header_toolkit.get(h).cloned()).collect();
        let mut closure = BTreeSet::new();
        while let Some(toolkit) = pending.pop() {
            if closure.insert(toolkit.clone()) {
                pending.extend(self.dependencies.get(&toolkit).into_iter().flatten().cloned());
            }
        }
        closure.into_iter().collect()
    }
}

fn read_dirs(dir: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut dirs: Vec<_> = fs::read_dir(dir)
        .map_err(|error| format!("{}: {error}", dir.display()))?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.is_dir())
        .collect();
    dirs.sort();
    Ok(dirs)
}

fn file_name(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn externlib(toolkit: &Path, name: &str) -> Result<BTreeSet<String>, String> {
    let path = toolkit.join("EXTERNLIB.cmake");
    let Ok(text) = fs::read_to_string(&path) else { return Ok(BTreeSet::new()) };
    Ok(text
        .split(|c: char| c.is_whitespace() || c == '(' || c == ')')
        .filter(|token| token.starts_with("TK") && *token != name)
        .map(str::to_owned)
        .collect())
}
