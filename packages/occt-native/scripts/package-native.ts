// Assembles the per-platform npm package from a staged native build.
//
// Usage: node scripts/package-native.ts [--arch x64|arm64]
// Input:  native/<target>/ (from build-native.ts --release) and .occt/<target>/occt-build.json
// Output: npm/<target>/ — @roonieone/occt-native-<target>, ready for `npm pack`

import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { FREETYPE } from "./build-freetype.ts";
import { renderThirdPartyNotices } from "./third-party-notices.ts";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const ARCH = optionValue("--arch") ?? process.arch;
const STAGED_TARGET = `${process.platform}-${ARCH}`;

function optionValue(flag: string): string | undefined {
    let index = process.argv.indexOf(flag);
    return index === -1 ? undefined : process.argv[index + 1];
}

/** npm package suffix; Linux packages are split by C library. */
function packageTarget(): string {
    return process.platform === "linux" ? `${STAGED_TARGET}-gnu` : STAGED_TARGET;
}

function platformManifest(version: string): Record<string, unknown> {
    let target = packageTarget();
    return {
        name: `@roonieone/occt-native-${target}`,
        version,
        description:
            `Prebuilt @roonieone/occt-native addon with the OCCT 8.0.1 and ` +
            `FreeType ${FREETYPE.version} libraries for ${target}`,
        license: "Apache-2.0 AND LGPL-2.1-only WITH OCCT-exception-1.0 AND FTL",
        os: [process.platform],
        cpu: [ARCH],
        ...(process.platform === "linux" ? { libc: ["glibc"] } : {}),
        files: [
            "*.node",
            "*.dylib",
            "*.so*",
            "*.dll",
            "*.md",
            "LICENSE*",
            "occt-build.json",
            "freetype-build.json",
        ],
    };
}

const REPLACING_OCCT = `# Replacing the OCCT libraries

This package links Open CASCADE Technology dynamically, as permitted by the GNU LGPL-2.1 §6(b).
The OCCT shared libraries (\`libTK*\`) and the FreeType library they use sit next to
\`occt-native.node\` and are found through \`@loader_path\` (macOS), \`$ORIGIN\` (Linux) or the
addon's directory (Windows).

To use a modified OCCT:

1. Get the corresponding source (see \`SOURCE.md\`) and apply your changes.
2. Build it with the same configuration: \`node scripts/build-occt.ts\` from the
   @roonieone/occt-native source tree reproduces the options recorded in \`occt-build.json\`,
   against the FreeType recorded in \`freetype-build.json\`.
3. Copy the rebuilt libraries over the files in this directory, keeping their file names
   (the install names, e.g. \`libTKBO.8.0.dylib\`). The OCCT ABI must stay compatible with 8.0.
4. Restart Node.js.
`;

function main(): void {
    let stageDir = join(PACKAGE_ROOT, "native", STAGED_TARGET);
    let outDir = join(PACKAGE_ROOT, "npm", packageTarget());
    let manifest: unknown = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
    if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
        throw new Error("package.json has no version");
    }
    let version = String(manifest.version);

    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    for (let file of readdirSync(stageDir)) copyFileSync(join(stageDir, file), join(outDir, file));
    for (let file of ["LICENSE", "LICENSE.LGPL-2.1", "LICENSE.OCCT_EXCEPTION", "SOURCE.md"]) {
        copyFileSync(join(PACKAGE_ROOT, file), join(outDir, file));
    }
    // LICENSE.FREETYPE already came from the stage directory, beside the library it covers.
    for (let stamp of ["occt-build.json", "freetype-build.json"]) {
        copyFileSync(join(PACKAGE_ROOT, ".occt", STAGED_TARGET, stamp), join(outDir, stamp));
    }
    writeFileSync(join(outDir, "REPLACING_OCCT.md"), REPLACING_OCCT);
    writeFileSync(
        join(outDir, "THIRD_PARTY_NOTICES.md"),
        renderThirdPartyNotices({ includeOcctInternals: true }),
    );
    writeFileSync(
        join(outDir, "package.json"),
        `${JSON.stringify(platformManifest(version), null, 4)}\n`,
    );
    console.log(`assembled ${outDir}`);
}

main();
