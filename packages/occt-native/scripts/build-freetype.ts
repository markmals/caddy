// Builds the pinned FreeType release as a shared library, for build-occt.ts.
//
// OCCT only compiles its font support (Font_FontMgr, Font_FTFont, StdPrs_BRepFont,
// Font_BRepTextBuilder) with USE_FREETYPE=ON, so FreeType belongs to the addon's pinned
// dependency set rather than being whatever the build machine happens to carry. It installs
// into the same prefix as OCCT so `3RDPARTY_FREETYPE_DIR` is simply that prefix, and it ships
// beside the addon like the OCCT libraries do.
//
// Output: <prefix>/{include/freetype2,lib/libfreetype*,share/freetype/LICENSE.FREETYPE}

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FREETYPE = {
    version: "2.14.3",
    sha256: "e61b31ab26358b946e767ed7eb7f4bb2e507da1cfefeb7a8861ace7fd5c899a1",
};

/** FreeType's shared library as OCCT links it, per platform. */
export const FREETYPE_LINK_LIBRARY: Record<string, string> = {
    darwin: "libfreetype.dylib",
    linux: "libfreetype.so",
    win32: "freetype.lib",
};

export interface FreetypeOptions {
    /** Directory holding the downloaded archives and build trees (`.occt`). */
    cacheRoot: string;
    /** Install prefix, shared with OCCT (`.occt/<platform>-<arch>`). */
    installDir: string;
    /** Node architecture name; differs from `process.arch` for a macOS cross build. */
    arch: string;
    jobs: number;
    macosDeploymentTarget: string;
}

function run(command: string, args: string[]): void {
    console.log(`$ ${command} ${args.join(" ")}`);
    let outcome = spawnSync(command, args, { stdio: "inherit" });
    if (outcome.status !== 0) {
        throw new Error(`${command} exited with status ${outcome.status ?? outcome.signal}`);
    }
}

function cmakeOptions(options: FreetypeOptions): Record<string, string> {
    return {
        CMAKE_BUILD_TYPE: "Release",
        BUILD_SHARED_LIBS: "ON",
        // OCCT needs nothing but the font engine: no WOFF2 (brotli), no embedded PNG glyphs,
        // no complex-script shaping and no gzip/bzip2-compressed PCF fonts from system
        // libraries. FreeType's bundled copy of zlib (src/gzip) still handles gzipped fonts.
        FT_DISABLE_BROTLI: "ON",
        FT_DISABLE_BZIP2: "ON",
        FT_DISABLE_HARFBUZZ: "ON",
        FT_DISABLE_PNG: "ON",
        FT_DISABLE_ZLIB: "ON",
        // Install beside OCCT: lib/ and bin/, not lib64/ or a multiarch directory.
        CMAKE_INSTALL_PREFIX: options.installDir,
        CMAKE_INSTALL_BINDIR: "bin",
        CMAKE_INSTALL_INCLUDEDIR: "include",
        CMAKE_INSTALL_LIBDIR: "lib",
        // Resolved next to the addon, exactly like the OCCT libraries.
        CMAKE_MACOSX_RPATH: "ON",
        CMAKE_INSTALL_NAME_DIR: "@rpath",
        CMAKE_INSTALL_RPATH: process.platform === "darwin" ? "@loader_path" : "$ORIGIN",
        ...(process.platform === "darwin"
            ? { CMAKE_OSX_DEPLOYMENT_TARGET: options.macosDeploymentTarget }
            : {}),
        ...(options.arch === process.arch
            ? {}
            : { CMAKE_OSX_ARCHITECTURES: options.arch === "x64" ? "x86_64" : "arm64" }),
    };
}

function fetchSource(archive: string, sourceDir: string): void {
    if (!existsSync(archive)) {
        let url = `https://download.savannah.gnu.org/releases/freetype/freetype-${FREETYPE.version}.tar.gz`;
        run("curl", ["--fail", "--location", "--silent", "--show-error", "-o", archive, url]);
    }
    let digest = createHash("sha256").update(readFileSync(archive)).digest("hex");
    if (digest !== FREETYPE.sha256) {
        rmSync(archive);
        throw new Error(
            `FreeType archive checksum mismatch: expected ${FREETYPE.sha256}, got ${digest}`,
        );
    }
    // Extracted once and kept: build-occt.ts can be run for several targets against the same
    // source tree, and it is the only copy of the license texts the install prefix quotes.
    if (!existsSync(sourceDir)) {
        mkdirSync(sourceDir, { recursive: true });
        run("tar", ["-xzf", archive, "-C", sourceDir, "--strip-components=1"]);
    }
}

/** Final year of FreeType's own copyright line, which the FTL's credit clause asks for. */
function copyrightYear(sourceDir: string): string {
    let header = readFileSync(join(sourceDir, "include", "freetype", "freetype.h"), "utf8");
    let year = /Copyright \(C\) \d{4}-(\d{4}) by/.exec(header)?.[1];
    if (year === undefined) throw new Error("freetype.h has no copyright line");
    return year;
}

/** A section of a FreeType README, whose titles are underlined with asterisks. */
function readmeSection(path: string, title: string): string {
    let lines = readFileSync(path, "utf8").split("\n");
    let isTitle = (index: number): boolean => /^\*{3,}$/.test(lines[index + 1] ?? "");
    let start = lines.findIndex((line, index) => line === title && isTitle(index));
    if (start === -1) throw new Error(`${path} has no "${title}" section`);
    let end = lines.findIndex((line, index) => index > start && isTitle(index));
    return lines
        .slice(start, end === -1 ? undefined : end)
        .join("\n")
        .trimEnd();
}

/** Leading block comment of a C source file, without the comment markers. */
function headerComment(path: string): string {
    let lines = readFileSync(path, "utf8").split("\n");
    let end = lines.findIndex(line => line.includes("*/"));
    if (end === -1) throw new Error(`${path} has no header comment`);
    return lines
        .slice(0, end + 1)
        .map(line => line.replace(/^\s*\/?\*+\/?/, "").replace(/\*\/\s*$/, ""))
        .join("\n")
        .replace(/^\n+/, "")
        .replace(/\s+$/, "");
}

function separator(title: string): string {
    return `${"=".repeat(80)}\n${title}\n${"=".repeat(80)}`;
}

/**
 * The license text shipped with the library: FreeType offers the FTL and the GPLv2 as
 * mutually exclusive alternatives, so a distributor has to elect one — we elect the FTL — and
 * then satisfy its credit clause plus the licenses of the contributed drivers we compile.
 */
function licenseNotice(sourceDir: string): string {
    return [
        `FreeType ${FREETYPE.version} — https://freetype.org/`,
        "",
        "@roonieone/occt-native ships FreeType as a shared library next to occt-native.node;",
        "Open CASCADE uses it for Font_FontMgr, Font_FTFont and StdPrs_BRepFont.",
        "",
        "FreeType is offered under two mutually exclusive licenses. This distribution elects",
        "the FreeType License (FTL), reproduced below, and not the GNU General Public License",
        "version 2. As the FTL's credit clause requires:",
        "",
        `    Portions of this software are copyright (C) ${copyrightYear(sourceDir)} The FreeType`,
        "    Project (www.freetype.org). All rights reserved.",
        "",
        "Some of the compiled sources carry their own compatible licenses, reproduced after the",
        "FTL: the contributed BDF and PCF drivers (X Window System style), the gzip module",
        "(zlib license) and the HarfBuzz-derived files in src/autofit ('Old MIT'). HarfBuzz,",
        "libpng, brotli, bzip2 and system zlib support are disabled in this build.",
        "",
        separator("FreeType LICENSE.TXT"),
        "",
        readFileSync(join(sourceDir, "LICENSE.TXT"), "utf8").trimEnd(),
        "",
        separator("docs/FTL.TXT — the FreeType License, elected for this distribution"),
        "",
        readFileSync(join(sourceDir, "docs", "FTL.TXT"), "utf8").trimEnd(),
        "",
        separator("src/bdf/README — BDF driver"),
        "",
        readmeSection(join(sourceDir, "src", "bdf", "README"), "License"),
        "",
        separator("src/pcf/README — PCF driver"),
        "",
        readmeSection(join(sourceDir, "src", "pcf", "README"), "License"),
        "",
        separator("src/gzip/zlib.h — gzip module (zlib license)"),
        "",
        headerComment(join(sourceDir, "src", "gzip", "zlib.h")),
        "",
        separator("src/autofit/ft-hb-ft.c — HarfBuzz-derived sources ('Old MIT')"),
        "",
        headerComment(join(sourceDir, "src", "autofit", "ft-hb-ft.c")),
        "",
    ].join("\n");
}

/**
 * Builds and installs FreeType unless the install prefix already holds this exact build. The
 * build tree is removed afterwards — nothing reads it after the install, and the stamp, not
 * ninja, is what keeps repeated runs cheap.
 */
export function installFreetype(options: FreetypeOptions): void {
    let target = `${process.platform}-${options.arch}`;
    let stampPath = join(options.installDir, "freetype-build.json");
    let cmake = cmakeOptions(options);
    // The install prefix is absolute, so it is recorded as the target rather than verbatim.
    let { CMAKE_INSTALL_PREFIX: _prefix, ...stampedOptions } = cmake;
    let stamp = `${JSON.stringify({ ...FREETYPE, target, options: stampedOptions }, null, 4)}\n`;
    if (existsSync(stampPath) && readFileSync(stampPath, "utf8") === stamp) {
        console.log(`FreeType ${FREETYPE.version} already installed at ${options.installDir}`);
        return;
    }

    let archive = join(options.cacheRoot, `freetype-${FREETYPE.version}.tar.gz`);
    let sourceDir = join(options.cacheRoot, `freetype-src-${FREETYPE.version}`);
    let buildDir = join(options.cacheRoot, `freetype-build-${FREETYPE.version}-${target}`);
    mkdirSync(options.cacheRoot, { recursive: true });
    fetchSource(archive, sourceDir);

    let defines = Object.entries(cmake).map(([key, value]) => `-D${key}=${value}`);
    run("cmake", ["-S", sourceDir, "-B", buildDir, "-G", "Ninja", ...defines]);
    run("cmake", ["--build", buildDir, "--parallel", String(options.jobs)]);
    run("cmake", ["--install", buildDir]);

    let licenseDir = join(options.installDir, "share", "freetype");
    mkdirSync(licenseDir, { recursive: true });
    writeFileSync(join(licenseDir, "LICENSE.FREETYPE"), licenseNotice(sourceDir));
    writeFileSync(stampPath, stamp);
    rmSync(buildDir, { recursive: true, force: true });
    console.log(`FreeType ${FREETYPE.version} installed at ${options.installDir}`);
}
