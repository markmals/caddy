// Builds the Neon addon and stages it with the OCCT shared libraries it loads.
//
// Usage: node scripts/build-native.ts [--release]
// Output: native/<platform>-<arch>/occt-native.node plus the OCCT libraries in the same
// directory (the addon and OCCT both resolve siblings via @loader_path / $ORIGIN).

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const WORKSPACE_ROOT = resolve(PACKAGE_ROOT, "..", "..");
const TARGET = `${process.platform}-${process.arch}`;
const OCCT_LIB_DIR = join(
    PACKAGE_ROOT,
    ".occt",
    TARGET,
    process.platform === "win32" ? "bin" : "lib",
);
const STAGE_DIR = join(PACKAGE_ROOT, "native", TARGET);

const ADDON_FILE: Record<string, string> = {
    darwin: "libocct_neon.dylib",
    linux: "libocct_neon.so",
    win32: "occt_neon.dll",
};

function run(command: string, args: string[]): string {
    let outcome = spawnSync(command, args, {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
        stdio: ["inherit", "pipe", "inherit"],
    });
    if (outcome.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
    return outcome.stdout;
}

/** OCCT libraries a binary links directly, by their install name (e.g. libTKBO.8.0.dylib). */
function linkedOcctLibraries(binary: string): string[] {
    let output =
        process.platform === "darwin"
            ? run("otool", ["-L", binary])
            : process.platform === "linux"
              ? run("readelf", ["-d", binary])
              : run("dumpbin", ["/DEPENDENTS", binary]);
    let names = output.match(/(?:lib)?TK[A-Za-z0-9]+[.\w]*\.(?:dylib|so[.\d]*|dll)/g) ?? [];
    return [...new Set(names.map(name => basename(name)))];
}

function stageOcct(addon: string, stageDir: string): string[] {
    let staged = new Set<string>();
    let pending = linkedOcctLibraries(addon);
    while (pending.length > 0) {
        let name = pending.pop()!;
        if (staged.has(name)) continue;
        let source = join(OCCT_LIB_DIR, name);
        if (!existsSync(source))
            throw new Error(`missing OCCT library ${source}; run build-occt.ts`);
        // Copy the real file under its install name so symlinks are not needed in the package.
        copyFileSync(realpathSync(source), join(stageDir, name));
        staged.add(name);
        pending.push(...linkedOcctLibraries(source));
    }
    return [...staged].sort();
}

function main(): void {
    let release = process.argv.includes("--release");
    let addonFile = ADDON_FILE[process.platform];
    if (addonFile === undefined) throw new Error(`unsupported platform ${process.platform}`);
    run("cargo", ["build", "-p", "occt-neon", ...(release ? ["--release"] : [])]);
    let built = join(WORKSPACE_ROOT, "target", release ? "release" : "debug", addonFile);

    // Stage beside the destination and swap it in, so concurrent test runs never load a
    // half-copied directory.
    let staging = `${STAGE_DIR}.staging-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    copyFileSync(built, join(staging, "occt-native.node"));
    let libraries = stageOcct(join(staging, "occt-native.node"), staging);
    rmSync(STAGE_DIR, { recursive: true, force: true });
    renameSync(staging, STAGE_DIR);
    console.log(
        `staged ${join(STAGE_DIR, "occt-native.node")} with ${libraries.length} OCCT libraries`,
    );
}

main();
