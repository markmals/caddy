//! occt-bindgen: generates the opencascade-sys cxx bridges from OCCT headers.
//!
//! Usage:
//!   occt-bindgen --config <bindings.toml> --include <occt include dir> --source <occt source dir>
//!                --out <opencascade-sys dir> [--check] [-- <extra clang args>...]
//!
//! `--check` regenerates in memory and exits non-zero if the files on disk differ.

mod config;
mod emit;
mod extract;
mod model;
mod naming;
mod report;
mod toolkits;
mod types;

use std::{
    fs,
    path::{Path, PathBuf},
    process::ExitCode,
};

use clang::{Clang, Index, Unsaved, diagnostic::Severity};

use crate::{config::Config, extract::Extractor, toolkits::ToolkitIndex};

struct Args {
    config: PathBuf,
    include: PathBuf,
    source: PathBuf,
    out: PathBuf,
    check: bool,
    clang_args: Vec<String>,
}

fn parse_args() -> Result<Args, String> {
    let mut args = std::env::args().skip(1);
    let (mut config, mut include, mut source, mut out) = (None, None, None, None);
    let mut check = false;
    let mut clang_args = Vec::new();
    while let Some(arg) = args.next() {
        let mut value = || args.next().map(PathBuf::from).ok_or(format!("{arg} needs a value"));
        match arg.as_str() {
            "--config" => config = Some(value()?),
            "--include" => include = Some(value()?),
            "--source" => source = Some(value()?),
            "--out" => out = Some(value()?),
            "--check" => check = true,
            "--" => clang_args.extend(args.by_ref()),
            other => return Err(format!("unknown argument {other}")),
        }
    }
    Ok(Args {
        config: config.ok_or("--config is required")?,
        include: include.ok_or("--include is required")?,
        source: source.ok_or("--source is required")?,
        out: out.ok_or("--out is required")?,
        check,
        clang_args,
    })
}

fn occt_version(include: &Path) -> Result<String, String> {
    let text =
        fs::read_to_string(include.join("Standard_Version.hxx")).map_err(|e| e.to_string())?;
    text.lines()
        .find_map(|line| line.strip_prefix("#define OCC_VERSION_COMPLETE"))
        .map(|rest| rest.trim().trim_matches('"').to_owned())
        .ok_or_else(|| "OCC_VERSION_COMPLETE not found".into())
}

fn umbrella_source(config: &Config) -> String {
    let names = config.classes.iter().chain(&config.enums).chain(config.collections.keys());
    names.map(|name| format!("#include <{name}.hxx>\n")).collect()
}

fn run(args: Args) -> Result<bool, String> {
    let config = Config::load(&args.config)?;
    let version = occt_version(&args.include)?;
    let toolkit_index = ToolkitIndex::load(&args.source)?;

    let clang = Clang::new()?;
    let index = Index::new(&clang, false, false);
    let umbrella = "occt_bindgen_umbrella.cpp";
    let mut clang_args = vec![
        "-x".into(),
        "c++".into(),
        "-std=c++17".into(),
        format!("-I{}", args.include.display()),
    ];
    clang_args.extend(args.clang_args.iter().cloned());
    let unit = index
        .parser(umbrella)
        .arguments(&clang_args)
        .unsaved(&[Unsaved::new(umbrella, umbrella_source(&config))])
        .parse()
        .map_err(|error| format!("libclang parse failed: {error:?}"))?;
    let errors: Vec<String> = unit
        .get_diagnostics()
        .into_iter()
        .filter(|d| matches!(d.get_severity(), Severity::Error | Severity::Fatal))
        .map(|d| d.to_string())
        .collect();
    if !errors.is_empty() {
        return Err(format!("OCCT headers failed to parse:\n{}", errors.join("\n")));
    }

    let mut bindings = Extractor::new(&config, &unit)?.extract()?;
    let headers: Vec<String> = bindings
        .classes
        .iter()
        .map(|c| c.header.clone())
        .chain(bindings.enums.iter().map(|e| e.header.clone()))
        .chain(bindings.collections.iter().map(|c| c.header.clone()))
        .collect();
    bindings.toolkits = toolkit_index.closure(headers.iter().map(String::as_str));

    let (mut files, skipped) = emit::emit(&bindings, &version);
    files.insert("bindings-report.md".into(), report::render(&bindings, &skipped, &version));
    if args.check { check(&args.out, &files) } else { write(&args.out, &files) }
}

fn generated_files_on_disk(out: &Path) -> Vec<String> {
    let mut found = Vec::new();
    for (dir, extension) in [("src", "rs"), ("include/generated", "hxx")] {
        let Ok(entries) = fs::read_dir(out.join(dir)) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let is_generated = path.extension().is_some_and(|e| e == extension)
                && fs::read_to_string(&path)
                    .is_ok_and(|text| text.contains(emit::GENERATED_MARKER));
            if is_generated {
                found.push(format!("{dir}/{}", path.file_name().unwrap().to_string_lossy()));
            }
        }
    }
    found
}

fn write(out: &Path, files: &emit::Files) -> Result<bool, String> {
    for stale in generated_files_on_disk(out).into_iter().filter(|f| !files.contains_key(f)) {
        fs::remove_file(out.join(&stale)).map_err(|e| format!("{stale}: {e}"))?;
    }
    for (relative, content) in files {
        let path = out.join(relative);
        fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        if fs::read_to_string(&path).ok().as_deref() != Some(content.as_str()) {
            fs::write(&path, content).map_err(|e| format!("{relative}: {e}"))?;
        }
    }
    println!("occt-bindgen: wrote {} files to {}", files.len(), out.display());
    Ok(true)
}

fn check(out: &Path, files: &emit::Files) -> Result<bool, String> {
    let mut drift: Vec<String> = generated_files_on_disk(out)
        .into_iter()
        .filter(|f| !files.contains_key(f))
        .map(|f| format!("stale: {f}"))
        .collect();
    for (relative, content) in files {
        if fs::read_to_string(out.join(relative)).ok().as_deref() != Some(content.as_str()) {
            drift.push(format!("out of date: {relative}"));
        }
    }
    if drift.is_empty() {
        println!("occt-bindgen: {} files up to date", files.len());
    } else {
        eprintln!(
            "occt-bindgen: generated bindings differ from the generator output:\n{}",
            drift.join("\n")
        );
    }
    Ok(drift.is_empty())
}

fn main() -> ExitCode {
    match parse_args().and_then(run) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(error) => {
            eprintln!("occt-bindgen: {error}");
            ExitCode::FAILURE
        }
    }
}
