// Renders THIRD_PARTY_NOTICES.md for the addon from the Cargo graph and the OCCT source tree.
//
// Covers every crate linked into occt-native.node (normal dependencies of occt-neon, excluding
// proc-macros, which run only at compile time) with its license files, and, for binary packages,
// the third-party code compiled into OCCT itself.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const OCCT_SOURCE = join(PACKAGE_ROOT, ".occt", "src-8.0.1", "src");

interface CrateLicense {
    name: string;
    version: string;
    license: string;
    texts: { file: string; text: string }[];
}

function cargo(args: string[]): string {
    let outcome = spawnSync("cargo", args, { cwd: WORKSPACE_ROOT, encoding: "utf8" });
    if (outcome.status !== 0) throw new Error(`cargo ${args.join(" ")} failed: ${outcome.stderr}`);
    return outcome.stdout;
}

function linkedCrates(): Set<string> {
    let tree = cargo([
        "tree",
        "-p",
        "occt-neon",
        "-e",
        "normal",
        "--prefix",
        "none",
        "--format",
        "{p}",
    ]);
    let crates = new Set<string>();
    for (let line of tree.split("\n")) {
        let match = /^(\S+) v(\S+)/.exec(line.trim());
        if (match === null || line.includes("(proc-macro)")) continue;
        if (match[1] === "occt-neon") continue;
        crates.add(`${match[1]}@${match[2]}`);
    }
    return crates;
}

function isPackageList(value: unknown): value is { packages: Record<string, unknown>[] } {
    return (
        typeof value === "object" &&
        value !== null &&
        "packages" in value &&
        Array.isArray(value.packages)
    );
}

function crateLicenses(): CrateLicense[] {
    let wanted = linkedCrates();
    let metadata: unknown = JSON.parse(cargo(["metadata", "--format-version", "1"]));
    if (!isPackageList(metadata)) throw new Error("unexpected cargo metadata output");
    let crates: CrateLicense[] = [];
    for (let entry of metadata.packages) {
        let name = String(entry["name"]);
        let version = String(entry["version"]);
        if (!wanted.has(`${name}@${version}`)) continue;
        let directory = dirname(String(entry["manifest_path"]));
        let texts = readdirSync(directory)
            .filter(file => /^(LICENSE|LICENCE|COPYING|NOTICE)/i.test(file))
            .sort()
            .map(file => ({ file, text: readFileSync(join(directory, file), "utf8").trim() }));
        crates.push({
            name,
            version,
            license: typeof entry["license"] === "string" ? entry["license"] : "see license files",
            texts,
        });
    }
    return crates.sort((a, b) => a.name.localeCompare(b.name));
}

/** Leading comment block of a source file, without comment markers. */
function headerComment(path: string, lines: number): string {
    return readFileSync(path, "utf8")
        .split("\n")
        .slice(0, lines)
        .map(line => line.replace(/^\s*(\/\/!?|\/\*|\*\/|\*)\s?/, ""))
        .join("\n")
        .trim();
}

function occtInternals(): string {
    if (!existsSync(OCCT_SOURCE))
        throw new Error(`OCCT source not found at ${OCCT_SOURCE}; run build-occt.ts`);
    let delabella = headerComment(
        join(OCCT_SOURCE, "ModelingAlgorithms/TKMesh/BRepMesh/delabella.cpp"),
        25,
    );
    let flex = headerComment(
        join(OCCT_SOURCE, "FoundationClasses/TKernel/FlexLexer/FlexLexer.h"),
        28,
    );
    let font = headerComment(
        join(OCCT_SOURCE, "Visualization/TKService/Font/Font_DejavuSans_Latin_woff.pxx"),
        45,
    )
        .split("\n")
        .slice(13)
        .join("\n");
    return [
        "## Third-party code inside OCCT 8.0.1",
        "",
        "### delabella (TKMesh)",
        "",
        "```text",
        delabella,
        "```",
        "",
        "### FlexLexer (TKernel)",
        "",
        "```text",
        flex,
        "```",
        "",
        "### DejaVu Sans / Bitstream Vera subset (TKService)",
        "",
        "```text",
        font,
        "```",
        "",
    ].join("\n");
}

// FreeType License §3 asks binary distributions to credit the project in their documentation.
const FREETYPE_NOTICE = [
    "## FreeType 2.14.3 (FTL)",
    "",
    "OCCT's font support loads `libfreetype`, shipped beside the addon. Portions of this software are copyright © 2026 The FreeType Project (www.freetype.org). All rights reserved. FreeType is used under the FreeType License (FTL), not the GPLv2 alternative; its bundled zlib (Jean-loup Gailly and Mark Adler) and BDF/PCF driver notices are reproduced with the license in `LICENSE.FREETYPE`.",
    "",
].join("\n");

/** Algorithms ported from other projects into the addon's own sources. */
function portedCode(): string {
    let scipy = readFileSync(join(PACKAGE_ROOT, "licenses", "scipy-BSD-3-Clause.txt"), "utf8");
    return [
        "## Code ported into the addon",
        "",
        "### ocp_gordon 0.3.1 (Apache-2.0)",
        "",
        "`crates/occt-neon/src/gordon` is derived from ocp_gordon, Copyright 2018 German Aerospace Center (DLR), itself a port of TiGL's Gordon surface code. Licensed under the Apache License 2.0, the same text as `LICENSE`.",
        "",
        "### SciPy 1.18.1 (BSD-3-Clause)",
        "",
        "`crates/occt-neon/src/gordon/optimize.rs` ports SciPy's BFGS, Wolfe line search and bounded scalar minimiser.",
        "",
        "```text",
        scipy.trimEnd(),
        "```",
        "",
    ].join("\n");
}

export function renderThirdPartyNotices(options: { includeOcctInternals: boolean }): string {
    let sections = [
        "# Third-party notices",
        "",
        "`occt-native.node` (Apache-2.0, see `LICENSE`) links Open CASCADE Technology 8.0.1 dynamically (GNU LGPL-2.1 with the Open CASCADE exception; see `LICENSE.LGPL-2.1` and `LICENSE.OCCT_EXCEPTION`) and statically links the Rust crates below.",
        "",
        portedCode(),
        "## Rust crates linked into the addon",
        "",
    ];
    for (let crate of crateLicenses()) {
        sections.push(`### ${crate.name} ${crate.version} (${crate.license})`, "");
        for (let { file, text } of crate.texts)
            sections.push(`${file}:`, "", "```text", text, "```", "");
    }
    if (options.includeOcctInternals) sections.push(occtInternals(), FREETYPE_NOTICE);
    return `${sections.join("\n")}\n`;
}

// `node scripts/third-party-notices.ts` writes the notices for the main (source) package, which
// ships no OCCT binaries.
if (import.meta.main) {
    writeFileSync(
        join(PACKAGE_ROOT, "THIRD_PARTY_NOTICES.md"),
        renderThirdPartyNotices({ includeOcctInternals: false }),
    );
}
