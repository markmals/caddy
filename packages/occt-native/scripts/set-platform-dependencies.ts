// Release step: pins the per-platform binary packages as optionalDependencies of
// @roonieone/occt-native at the package's own version, so npm installs exactly one of them.
// Not kept in the workspace manifest because the platform packages exist only on the registry.
//
// Usage: node scripts/set-platform-dependencies.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE_JSON = join(resolve(import.meta.dirname, ".."), "package.json");
const PLATFORM_TARGETS = [
    "darwin-arm64",
    "darwin-x64",
    "linux-x64-gnu",
    "linux-arm64-gnu",
    "win32-x64",
];

let manifest: unknown = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error("package.json has no version");
}
let version = String(manifest.version);
let optionalDependencies = Object.fromEntries(
    PLATFORM_TARGETS.map(target => [`@roonieone/occt-native-${target}`, version]),
);
writeFileSync(PACKAGE_JSON, `${JSON.stringify({ ...manifest, optionalDependencies }, null, 4)}\n`);
console.log(`pinned ${PLATFORM_TARGETS.length} platform packages at ${version}`);
