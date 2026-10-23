//! Compiles the generated cxx bridges and links the OCCT toolkits they need.
//!
//! OCCT is located with CMake's `find_package(OpenCASCADE)` (see `OCCT/CMakeLists.txt`); point
//! it at an installation with `DEP_OCCT_ROOT`. The bindings in `src/` are generated from one
//! OCCT version, so the major.minor version must match `OCCT_VERSION`.

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
    fn detect() -> Self {
        println!("cargo:rerun-if-env-changed=DEP_OCCT_ROOT");
        let dst = cmake::Config::new("OCCT").register_dep("occt").build();
        let info = fs::read_to_string(dst.join("share").join("occ_info.txt"))
            .expect("OCCT/CMakeLists.txt did not report the OCCT installation");
        let value = |key: &str| {
            info.lines()
                .find_map(|line| line.strip_prefix(key)?.strip_prefix('='))
                .unwrap_or_else(|| panic!("occ_info.txt is missing {key}"))
                .to_owned()
        };
        let version = (
            value("VERSION_MAJOR").parse::<u8>().expect("major version"),
            value("VERSION_MINOR").parse::<u8>().expect("minor version"),
        );
        assert!(
            version == OCCT_VERSION,
            "found OCCT {}.{}, but the bindings were generated for {}.{}; set DEP_OCCT_ROOT to a \
             matching installation or regenerate the bindings",
            version.0,
            version.1,
            OCCT_VERSION.0,
            OCCT_VERSION.1,
        );
        let config = Self {
            include_dir: PathBuf::from(value("INCLUDE_DIR")),
            library_dir: PathBuf::from(value("LIBRARY_DIR")),
            is_dynamic: value("BUILD_SHARED_LIBS") == "ON",
        };
        assert!(Path::new(&config.include_dir).is_dir(), "OCCT include dir does not exist");
        // Exposed to dependents as DEP_OPENCASCADE_*.
        println!("cargo:include={}", config.include_dir.display());
        println!("cargo:lib_dir={}", config.library_dir.display());
        config
    }
}
