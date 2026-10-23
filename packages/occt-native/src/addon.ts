// Locates and loads the compiled Neon addon.
//
// Resolution order:
//   1. OCCT_NATIVE_ADDON: explicit path to an `occt-native.node`
//   2. native/<platform>-<arch>/occt-native.node inside this package (source builds)
//   3. the prebuilt platform package, e.g. @roonieone/occt-native-darwin-arm64

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

let requireFromHere = createRequire(import.meta.url);

function platformTag(): string {
    if (process.platform !== "linux") return `${process.platform}-${process.arch}`;
    // Node reports the glibc version only on glibc-based systems.
    let report: unknown = process.report.getReport();
    let header =
        typeof report === "object" && report !== null && "header" in report
            ? report.header
            : undefined;
    let isGlibc = typeof header === "object" && header !== null && "glibcVersionRuntime" in header;
    return `linux-${process.arch}-${isGlibc ? "gnu" : "musl"}`;
}

function candidatePaths(): string[] {
    let explicit = process.env["OCCT_NATIVE_ADDON"];
    if (explicit !== undefined && explicit !== "") return [explicit];
    let local = fileURLToPath(
        new URL(`../native/${process.platform}-${process.arch}/occt-native.node`, import.meta.url),
    );
    let candidates = [local];
    try {
        candidates.push(
            requireFromHere.resolve(`@roonieone/occt-native-${platformTag()}/occt-native.node`),
        );
    } catch {
        // No prebuilt package for this platform is installed; fall through to the error below.
    }
    return candidates;
}

function load(): unknown {
    let candidates = candidatePaths();
    let path = candidates.find(candidate => existsSync(candidate));
    if (path === undefined) {
        throw new Error(
            `@roonieone/occt-native has no native addon for ${platformTag()}. Looked in:\n` +
                candidates.map(candidate => `  ${candidate}`).join("\n") +
                "\nInstall the matching prebuilt package or build from source with " +
                "`pnpm --filter @roonieone/occt-native build:native`.",
        );
    }
    return requireFromHere(path);
}

let loaded: unknown;

/** The raw addon, typed by the caller's view of the functions it uses. */
export function addon<T>(): T {
    loaded ??= load();
    return loaded as T;
}
