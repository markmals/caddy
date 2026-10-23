// Regenerates crates/opencascade-sys from the OCCT headers built by build-occt.ts.
//
// Usage: node scripts/generate-bindings.ts [--check]
// Requires libclang (Xcode on macOS, libclang-dev on Linux); only maintainers need it.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const OCCT_ROOT = join(PACKAGE_ROOT, ".occt", `${process.platform}-${process.arch}`);
const SYS_CRATE = join(PACKAGE_ROOT, "crates", "opencascade-sys");

function capture(command: string, args: string[]): string {
    let outcome = spawnSync(command, args, { encoding: "utf8" });
    if (outcome.status !== 0) throw new Error(`${command} failed: ${outcome.stderr}`);
    return outcome.stdout.trim();
}

function main(): void {
    let stampPath = join(OCCT_ROOT, "occt-build.json");
    if (!existsSync(stampPath)) {
        throw new Error(`OCCT is not built for this platform; run \`node scripts/build-occt.ts\``);
    }
    let stamp = JSON.parse(readFileSync(stampPath, "utf8")) as { version: string };
    let clangArgs =
        process.platform === "darwin" ? ["-isysroot", capture("xcrun", ["--show-sdk-path"])] : [];
    let args = [
        "run",
        "--release",
        "--quiet",
        "-p",
        "occt-bindgen",
        "--",
        "--config",
        join(SYS_CRATE, "bindings.toml"),
        "--include",
        join(OCCT_ROOT, "include", "opencascade"),
        "--source",
        join(PACKAGE_ROOT, ".occt", `src-${stamp.version}`),
        "--out",
        SYS_CRATE,
        ...(process.argv.includes("--check") ? ["--check"] : []),
        "--",
        ...clangArgs,
    ];
    let outcome = spawnSync("cargo", args, { stdio: "inherit" });
    process.exit(outcome.status ?? 1);
}

main();
