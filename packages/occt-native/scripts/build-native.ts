// Builds the Neon addon and stages it with the OCCT and FreeType shared libraries it loads.
//
// Usage: node scripts/build-native.ts [--release] [--arch x64|arm64 (macOS cross build)]
// Output: native/<platform>-<arch>/occt-native.node plus the libraries in the same directory
// (the addon and OCCT both resolve siblings via @loader_path / $ORIGIN), and FreeType's
// license, which has to travel with the library it covers.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const ARCH = optionValue("--arch") ?? process.arch;
const TARGET = `${process.platform}-${ARCH}`;
// Rust target triples for macOS cross builds; host builds use Cargo's default target.
const CROSS_TRIPLES: Record<string, string> = {
    x64: "x86_64-apple-darwin",
    arm64: "aarch64-apple-darwin",
};
const CROSS_TRIPLE = ARCH === process.arch ? undefined : CROSS_TRIPLES[ARCH];
// OCCT and FreeType share one install prefix (see scripts/build-occt.ts).
const LIB_DIR = join(PACKAGE_ROOT, ".occt", TARGET, process.platform === "win32" ? "bin" : "lib");
const STAGE_DIR = join(PACKAGE_ROOT, "native", TARGET);

const ADDON_FILE: Record<string, string> = {
    darwin: "libocct_neon.dylib",
    linux: "libocct_neon.so",
    win32: "occt_neon.dll",
};

function optionValue(flag: string): string | undefined {
    let index = process.argv.indexOf(flag);
    return index === -1 ? undefined : process.argv[index + 1];
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
    let outcome = spawnSync(command, args, {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
        env,
        stdio: ["inherit", "pipe", "inherit"],
    });
    if (outcome.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
    return outcome.stdout;
}

/**
 * Bundled libraries a binary links directly, by their install name (e.g. libTKBO.8.0.dylib,
 * libfreetype.6.dylib). Everything else it links is part of the platform.
 */
function linkedLibraries(binary: string): string[] {
    let output =
        process.platform === "darwin"
            ? run("otool", ["-L", binary])
            : process.platform === "linux"
              ? run("readelf", ["-d", binary])
              : run("dumpbin", ["/DEPENDENTS", binary]);
    let pattern = /(?:lib)?(?:TK[A-Za-z0-9]+|freetype)[.\w]*\.(?:dylib|so[.\d]*|dll)/g;
    return [...new Set((output.match(pattern) ?? []).map(name => basename(name)))];
}

function stageLibraries(addon: string, stageDir: string): string[] {
    let staged = new Set<string>();
    let pending = linkedLibraries(addon);
    while (pending.length > 0) {
        let name = pending.pop()!;
        if (staged.has(name)) continue;
        let source = join(LIB_DIR, name);
        if (!existsSync(source)) throw new Error(`missing library ${source}; run build-occt.ts`);
        // Copy the real file under its install name so symlinks are not needed in the package.
        copyFileSync(realpathSync(source), join(stageDir, name));
        staged.add(name);
        pending.push(...linkedLibraries(source));
    }
    return [...staged].sort();
}

function main(): void {
    let release = process.argv.includes("--release");
    let addonFile = ADDON_FILE[process.platform];
    if (addonFile === undefined) throw new Error(`unsupported platform ${process.platform}`);
    if (ARCH !== process.arch && (process.platform !== "darwin" || CROSS_TRIPLE === undefined)) {
        throw new Error(`cannot cross-build ${TARGET} from ${process.platform}-${process.arch}`);
    }
    let cargoArgs = ["build", "-p", "occt-neon", ...(release ? ["--release"] : [])];
    let env = process.env;
    if (CROSS_TRIPLE !== undefined) {
        cargoArgs.push("--target", CROSS_TRIPLE);
        env = { ...process.env, DEP_OCCT_ROOT: join(PACKAGE_ROOT, ".occt", TARGET) };
    }
    run("cargo", cargoArgs, env);
    let profile = release ? "release" : "debug";
    let built = join(
        WORKSPACE_ROOT,
        "target",
        ...(CROSS_TRIPLE ? [CROSS_TRIPLE] : []),
        profile,
        addonFile,
    );

    // Stage beside the destination and swap it in, so concurrent test runs never load a
    // half-copied directory.
    let staging = `${STAGE_DIR}.staging-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    copyFileSync(built, join(staging, "occt-native.node"));
    let libraries = stageLibraries(join(staging, "occt-native.node"), staging);
    let license = join(PACKAGE_ROOT, ".occt", TARGET, "share", "freetype", "LICENSE.FREETYPE");
    if (!existsSync(license)) throw new Error(`missing ${license}; run build-occt.ts`);
    copyFileSync(license, join(staging, "LICENSE.FREETYPE"));
    rmSync(STAGE_DIR, { recursive: true, force: true });
    renameSync(staging, STAGE_DIR);
    console.log(`staged ${join(STAGE_DIR, "occt-native.node")} with ${libraries.length} libraries`);
}

main();
