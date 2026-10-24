// Packs one release into .release/: every platform package assembled in packages/occt-native/npm/
// (by package-native.ts, or downloaded from CI), @roonieone/occt-native with exactly those
// platform packages pinned as optionalDependencies, and @roonieone/caddy. Every package must
// carry the same version. Pinning only what is assembled keeps a release from declaring a
// platform package it never publishes.
//
// Usage: node scripts/release/pack.ts (run through `mise run release:pack`, which builds dist/)

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT_DIR = join(ROOT, ".release");
const OCCT_NATIVE = join(ROOT, "packages", "occt-native");
const CADDY = join(ROOT, "packages", "caddy");
const PLATFORM_PACKAGES = join(OCCT_NATIVE, "npm");

interface Manifest {
    name: string;
    version: string;
}

function readManifest(packageDir: string): Manifest {
    let manifest: unknown = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
    if (
        typeof manifest !== "object" ||
        manifest === null ||
        !("name" in manifest) ||
        !("version" in manifest)
    ) {
        throw new Error(`${packageDir}/package.json has no name or version`);
    }
    return { name: String(manifest.name), version: String(manifest.version) };
}

function pack(command: "npm" | "pnpm", packageDir: string): void {
    execFileSync(command, ["pack", "--pack-destination", OUT_DIR], {
        cwd: packageDir,
        stdio: "inherit",
    });
}

/** Packs @roonieone/occt-native with the platform pins, leaving package.json as it was. */
function packOcctNative(platformNames: string[], version: string): void {
    let manifestPath = join(OCCT_NATIVE, "package.json");
    let original = readFileSync(manifestPath, "utf8");
    let optionalDependencies = Object.fromEntries(
        platformNames.toSorted().map(name => [name, version]),
    );
    let pinned = { ...(JSON.parse(original) as object), optionalDependencies };
    writeFileSync(manifestPath, `${JSON.stringify(pinned, null, 4)}\n`);
    try {
        pack("pnpm", OCCT_NATIVE);
    } finally {
        writeFileSync(manifestPath, original);
    }
}

function main(): void {
    let { version } = readManifest(OCCT_NATIVE);
    let platformDirs = readdirSync(PLATFORM_PACKAGES, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => join(PLATFORM_PACKAGES, entry.name));
    if (platformDirs.length === 0) throw new Error(`no platform packages in ${PLATFORM_PACKAGES}`);

    let mismatched = [CADDY, ...platformDirs]
        .map(readManifest)
        .filter(manifest => manifest.version !== version);
    if (mismatched.length > 0) {
        let found = mismatched.map(manifest => `${manifest.name}@${manifest.version}`).join(", ");
        throw new Error(`every package must be ${version}; found ${found}`);
    }

    rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR);
    for (let platformDir of platformDirs) pack("npm", platformDir);
    packOcctNative(
        platformDirs.map(platformDir => readManifest(platformDir).name),
        version,
    );
    pack("pnpm", CADDY);
    console.log(`packed ${platformDirs.length + 2} packages at ${version} into ${OUT_DIR}`);
}

main();
