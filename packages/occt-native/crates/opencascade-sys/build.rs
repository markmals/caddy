//! Compiles the generated cxx bridges and links the OCCT toolkits they need.
//!
//! `DEP_OCCT_ROOT` names the OCCT installation (`.cargo/config.toml` points it at the one
//! `scripts/build-occt.ts` installs). The bindings in `src/` are generated from one OCCT
//! version, so the major.minor version must match `OCCT_VERSION`.

use std::{
    env, fs,
    path::{Path, PathBuf},
};

/// OCCT version the checked-in bindings were generated from (see bindings-report.md).
const OCCT_VERSION: (u8, u8) = (8, 0);

fn main() {
    let occt = OcctConfig::detect();
    let target = env::var("TARGET").expect("TARGET is set by cargo");

    println!("cargo:rustc-link-search=native={}", occt.library_dir.display());
    let link_kind = if occt.is_dynamic { "dylib" } else { "static" };
    for toolkit in fs::read_to_string("occt-toolkits.txt").expect("occt-toolkits.txt").lines() {
        println!("cargo:rustc-link-lib={link_kind}={toolkit}");
    }
    if target.contains("windows") {
        println!("cargo:rustc-link-lib=dylib=user32");
    }

    let bridges: Vec<PathBuf> = fs::read_dir("src")
        .expect("src directory")
        .map(|entry| entry.expect("directory entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "rs"))
        .filter(|path| path.file_name().is_some_and(|name| name != "lib.rs"))
        .collect();

    let mut build = cxx_build::bridges(&bridges);
    if target.contains("windows-gnu") {
        build.define("OCC_CONVERT_SIGNALS", "TRUE");
    }
    // OCCT's include directory must come first: on case-insensitive filesystems a header in
    // `include/` could otherwise shadow an OCCT header of the same name.
    build
        .cpp(true)
        .std("c++17")
        .define("_USE_MATH_DEFINES", "TRUE")
        .flag_if_supported("-Wno-deprecated-declarations")
        .flag_if_supported("-Wno-unused-parameter")
        // OCCT 8 marks the TColgp_*/TopTools_* alias headers deprecated via #pragma message.
        .flag_if_supported("-Wno-#pragma-messages")
        .include(&occt.include_dir)
        .include("include")
        .compile("opencascade-sys-bridges");

    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-changed=include");
    println!("cargo:rerun-if-changed=occt-toolkits.txt");
}

struct OcctConfig {
    include_dir: PathBuf,
    library_dir: PathBuf,
    is_dynamic: bool,
}

impl OcctConfig {
    /// Reads an OCCT installation laid out as `scripts/build-occt.ts` installs it
    /// (`INSTALL_DIR_LAYOUT=Unix`): headers in `include/opencascade`, libraries in `lib`, and on
    /// Windows the DLLs in `bin`.
    fn detect() -> Self {
        println!("cargo:rerun-if-env-changed=DEP_OCCT_ROOT");
        let root = PathBuf::from(env::var_os("DEP_OCCT_ROOT").expect(
            "DEP_OCCT_ROOT must point at an OCCT installation (packages/occt-native/scripts/build-occt.ts)",
        ));
        let include_dir = root.join("include").join("opencascade");
        let library_dir = root.join("lib");
        let version_header = include_dir.join("Standard_Version.hxx");
        println!("cargo:rerun-if-changed={}", version_header.display());
        let version = header_version(&version_header);
        assert!(
            version == OCCT_VERSION,
            "found OCCT {}.{} in {}, but the bindings were generated for {}.{}; set DEP_OCCT_ROOT \
             to a matching installation or regenerate the bindings",
            version.0,
            version.1,
            root.display(),
            OCCT_VERSION.0,
            OCCT_VERSION.1,
        );
        let is_dynamic = ["lib/libTKernel.dylib", "lib/libTKernel.so", "bin/TKernel.dll"]
            .iter()
            .any(|library| root.join(library).exists());
        // Exposed to dependents as DEP_OPENCASCADE_*.
        println!("cargo:include={}", include_dir.display());
        println!("cargo:lib_dir={}", library_dir.display());
        Self {
            include_dir,
            library_dir,
            is_dynamic,
        }
    }
}

/// `OCC_VERSION_MAJOR` and `OCC_VERSION_MINOR` from OCCT's `Standard_Version.hxx`.
fn header_version(header: &Path) -> (u8, u8) {
    let source = fs::read_to_string(header)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", header.display()));
    let define = |name: &str| {
        source
            .lines()
            .find_map(|line| line.trim().strip_prefix("#define ")?.strip_prefix(name))
            .and_then(|value| value.trim().parse::<u8>().ok())
            .unwrap_or_else(|| panic!("{} does not define {name}", header.display()))
    };
    (define("OCC_VERSION_MAJOR "), define("OCC_VERSION_MINOR "))
}
