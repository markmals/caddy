fn main() {
    // OCCT ships as shared libraries next to the addon (see docs/licensing.md), so the addon
    // resolves them relative to its own location.
    match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("macos") => println!("cargo:rustc-cdylib-link-arg=-Wl,-rpath,@loader_path"),
        Ok("linux") => println!("cargo:rustc-cdylib-link-arg=-Wl,-rpath,$ORIGIN"),
        _ => {}
    }
}
