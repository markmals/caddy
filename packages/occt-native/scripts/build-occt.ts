// Builds the pinned OCCT release, and the FreeType it needs, as shared libraries for the
// current platform.
//
// Shared (not static) libraries keep OCCT replaceable by end users, which is how the
// distributed addon satisfies LGPL-2.1 §6(b). See docs/licensing.md.
//
// Usage: node scripts/build-occt.ts [--jobs N] [--arch x64|arm64 (macOS cross build)]
// Output: .occt/<platform>-<arch>/{include,lib,share}

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";

import { FREETYPE, FREETYPE_LINK_LIBRARY, installFreetype } from "./build-freetype.ts";

const OCCT = {
    version: "8.0.1",
    tag: "V8_0_1",
    sha256: "0d6913eae4bcc09a3653ceced6dda1aec11c35a1513d4c06762c9b002092c68a",
};

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const CACHE_ROOT = join(PACKAGE_ROOT, ".occt");
// `--arch x64|arm64` cross-builds for the other macOS architecture (run under Rosetta to test).
const ARCH = optionValue("--arch") ?? process.arch;
const IS_CROSS_BUILD = ARCH !== process.arch;
const TARGET = `${process.platform}-${ARCH}`;
const SOURCE_ARCHIVE = join(CACHE_ROOT, `${OCCT.tag}.tar.gz`);
const SOURCE_DIR = join(CACHE_ROOT, `src-${OCCT.version}`);
const BUILD_DIR = join(CACHE_ROOT, `build-${OCCT.version}-${TARGET}`);
const INSTALL_DIR = join(CACHE_ROOT, TARGET);
const STAMP = join(INSTALL_DIR, "occt-build.json");
// Matches the oldest macOS supported by Node.js 24; keep in sync with .cargo/config.toml.
const MACOS_DEPLOYMENT_TARGET = "13.5";

const CMAKE_OPTIONS: Record<string, string> = {
    CMAKE_BUILD_TYPE: "Release",
    BUILD_LIBRARY_TYPE: "Shared",
    BUILD_CPP_STANDARD: "C++17",
    // Keep OCCT's argument/range checks so bad input raises Standard_Failure instead of UB.
    BUILD_RELEASE_DISABLE_EXCEPTIONS: "OFF",
    BUILD_MODULE_Draw: "OFF",
    BUILD_MODULE_Deprecated: "OFF",
    BUILD_DOC_Overview: "OFF",
    BUILD_SAMPLES_QT: "OFF",
    BUILD_GTEST: "OFF",
    INSTALL_DIR_LAYOUT: "Unix",
    INSTALL_DIR_LIB: "lib",
    INSTALL_DIR_INCLUDE: "include/opencascade",
    INSTALL_SAMPLES: "OFF",
    INSTALL_TEST_CASES: "OFF",
    // FreeType is installed into the same prefix by build-freetype.ts and staged beside the
    // addon, so OCCT must not copy it into lib/ under a second name.
    INSTALL_FREETYPE: "OFF",
    USE_D3D: "OFF",
    USE_DRACO: "OFF",
    USE_EIGEN: "OFF",
    USE_FFMPEG: "OFF",
    USE_FREEIMAGE: "OFF",
    // Font_FontMgr, Font_FTFont, StdPrs_BRepFont and Font_BRepTextBuilder need FreeType.
    USE_FREETYPE: "ON",
    USE_GLES2: "OFF",
    USE_OPENGL: "OFF",
    USE_OPENVR: "OFF",
    USE_RAPIDJSON: "OFF",
    USE_TBB: "OFF",
    USE_TCL: "OFF",
    USE_TK: "OFF",
    USE_VTK: "OFF",
    USE_XLIB: "OFF",
    // Install names of the form @rpath/libTK*.dylib so the addon can carry OCCT beside it.
    CMAKE_MACOSX_RPATH: "ON",
    CMAKE_INSTALL_NAME_DIR: "@rpath",
    CMAKE_INSTALL_RPATH: process.platform === "darwin" ? "@loader_path" : "$ORIGIN",
    ...(process.platform === "darwin"
        ? { CMAKE_OSX_DEPLOYMENT_TARGET: MACOS_DEPLOYMENT_TARGET }
        : {}),
    // Only set when cross-building so the host build's option stamp stays unchanged.
    ...(IS_CROSS_BUILD ? { CMAKE_OSX_ARCHITECTURES: ARCH === "x64" ? "x86_64" : "arm64" } : {}),
};

/**
 * Points OCCT's freetype.cmake straight at our install prefix. These are absolute paths, so
 * they stay out of CMAKE_OPTIONS (and the stamp) and are passed like INSTALL_DIR is; setting
 * every variable also stops OCCT's search from picking up a Homebrew or system FreeType.
 */
function freetypeDefines(): string[] {
    let library = FREETYPE_LINK_LIBRARY[process.platform];
    if (library === undefined) throw new Error(`unsupported platform ${process.platform}`);
    let includeDir = join(INSTALL_DIR, "include", "freetype2");
    return [
        `-D3RDPARTY_FREETYPE_DIR=${INSTALL_DIR}`,
        `-D3RDPARTY_FREETYPE_INCLUDE_DIR_ft2build=${includeDir}`,
        `-D3RDPARTY_FREETYPE_INCLUDE_DIR_freetype2=${includeDir}`,
        `-D3RDPARTY_FREETYPE_LIBRARY=${join(INSTALL_DIR, "lib", library)}`,
        ...(process.platform === "win32"
            ? [`-D3RDPARTY_FREETYPE_DLL=${join(INSTALL_DIR, "bin", "freetype.dll")}`]
            : []),
    ];
}

function run(command: string, args: string[]): void {
    console.log(`$ ${command} ${args.join(" ")}`);
    let outcome = spawnSync(command, args, { stdio: "inherit" });
    if (outcome.status !== 0) {
        throw new Error(`${command} exited with status ${outcome.status ?? outcome.signal}`);
    }
}

function fetchSource(): void {
    if (!existsSync(SOURCE_ARCHIVE)) {
        let url = `https://github.com/Open-Cascade-SAS/OCCT/archive/refs/tags/${OCCT.tag}.tar.gz`;
        run("curl", [
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "-o",
            SOURCE_ARCHIVE,
            url,
        ]);
    }
    let digest = createHash("sha256").update(readFileSync(SOURCE_ARCHIVE)).digest("hex");
    if (digest !== OCCT.sha256) {
        rmSync(SOURCE_ARCHIVE);
        throw new Error(`OCCT archive checksum mismatch: expected ${OCCT.sha256}, got ${digest}`);
    }
    if (!existsSync(SOURCE_DIR)) {
        mkdirSync(SOURCE_DIR, { recursive: true });
        run("tar", ["-xzf", SOURCE_ARCHIVE, "-C", SOURCE_DIR, "--strip-components=1"]);
    }
}

function optionValue(flag: string): string | undefined {
    let index = process.argv.indexOf(flag);
    return index === -1 ? undefined : process.argv[index + 1];
}

function parseJobs(): number {
    let value = optionValue("--jobs");
    if (value === undefined) return availableParallelism();
    let jobs = Number(value);
    if (!Number.isInteger(jobs) || jobs < 1) throw new Error("--jobs expects a positive integer");
    return jobs;
}

// `.occt/current` points at the host install so Cargo can use one DEP_OCCT_ROOT.
function linkCurrent(): void {
    if (IS_CROSS_BUILD) return;
    let link = join(CACHE_ROOT, "current");
    rmSync(link, { force: true, recursive: true });
    symlinkSync(TARGET, link, process.platform === "win32" ? "junction" : "dir");
}

function main(): void {
    if (IS_CROSS_BUILD && process.platform !== "darwin") {
        throw new Error(
            "--arch cross-builds are only supported on macOS; build on the target platform",
        );
    }
    mkdirSync(CACHE_ROOT, { recursive: true });
    installFreetype({
        cacheRoot: CACHE_ROOT,
        installDir: INSTALL_DIR,
        arch: ARCH,
        jobs: parseJobs(),
        macosDeploymentTarget: MACOS_DEPLOYMENT_TARGET,
    });

    // The FreeType version is part of the stamp: changing it has to rebuild OCCT too.
    let stampContent = JSON.stringify(
        { ...OCCT, freetype: FREETYPE, target: TARGET, options: CMAKE_OPTIONS },
        null,
        4,
    );
    if (existsSync(STAMP) && readFileSync(STAMP, "utf8") === stampContent) {
        console.log(`OCCT ${OCCT.version} already installed at ${INSTALL_DIR}`);
        linkCurrent();
        return;
    }
    fetchSource();

    let defines = Object.entries(CMAKE_OPTIONS).map(([key, value]) => `-D${key}=${value}`);
    run("cmake", [
        "-S",
        SOURCE_DIR,
        "-B",
        BUILD_DIR,
        "-G",
        "Ninja",
        `-DINSTALL_DIR=${INSTALL_DIR}`,
        ...defines,
        ...freetypeDefines(),
    ]);
    run("cmake", ["--build", BUILD_DIR, "--parallel", String(parseJobs())]);
    run("cmake", ["--install", BUILD_DIR]);
    writeFileSync(STAMP, stampContent);
    // Nothing reads the build tree after the install, and it costs a few hundred megabytes
    // per target; the stamp above, not ninja, is what keeps repeated runs cheap.
    rmSync(BUILD_DIR, { recursive: true, force: true });
    linkCurrent();
    console.log(`OCCT ${OCCT.version} installed at ${INSTALL_DIR}`);
}

main();
