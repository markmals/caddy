// Publishes the tarballs scripts/release/pack.ts left in .release/: platform packages first, then
// @roonieone/occt-native, then @roonieone/caddy, so a published package never depends on a
// version that is not on the registry yet. A prerelease goes out under its identifier as the
// dist-tag (1.0.0-alpha.1 → alpha), anything else under latest. Versions already on the registry
// are skipped, so a run interrupted by a failed publish can simply be repeated.
//
// Usage: node scripts/release/publish.ts
// Locally, npm asks for two-factor approval in the browser for each package; in GitHub Actions,
// trusted publishing authenticates through OIDC and attaches provenance.

import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const RELEASE_DIR = join(resolve(import.meta.dirname, "../.."), ".release");
const PUBLISH_ORDER = ["@roonieone/occt-native-", "@roonieone/occt-native", "@roonieone/caddy"];

interface Tarball {
    path: string;
    name: string;
    version: string;
}

function readTarball(path: string): Tarball {
    let manifest = JSON.parse(
        execFileSync("tar", ["-xOzf", path, "package/package.json"], { encoding: "utf8" }),
    ) as { name: string; version: string };
    return { path, name: manifest.name, version: manifest.version };
}

/** Platform packages share their parent's name as a prefix, so they rank by prefix first. */
function publishRank(tarball: Tarball): number {
    let rank = PUBLISH_ORDER.findIndex((name, index) =>
        index === 0 ? tarball.name.startsWith(name) : tarball.name === name,
    );
    if (rank === -1) throw new Error(`${tarball.name} is not part of a Caddy release`);
    return rank;
}

function distTag(version: string): string {
    let prerelease = version.split("-")[1];
    if (prerelease === undefined) return "latest";
    let identifier = prerelease.split(".")[0] ?? "";
    if (!/^[a-z]+$/i.test(identifier)) {
        throw new Error(`cannot derive a dist-tag from the prerelease ${version}`);
    }
    return identifier;
}

function isPublished({ name, version }: Tarball): boolean {
    let view = spawnSync("npm", ["view", `${name}@${version}`, "version"], { encoding: "utf8" });
    if (view.status === 0) return view.stdout.trim() !== "";
    if (view.stderr.includes("E404")) return false;
    throw new Error(`npm view ${name}@${version} failed:\n${view.stderr}`);
}

function main(): void {
    let tarballs = readdirSync(RELEASE_DIR)
        .filter(file => file.endsWith(".tgz"))
        .map(file => readTarball(join(RELEASE_DIR, file)))
        .toSorted((a, b) => publishRank(a) - publishRank(b));
    if (tarballs.length === 0) throw new Error(`no tarballs in ${RELEASE_DIR}`);

    for (let tarball of tarballs) {
        if (isPublished(tarball)) {
            console.log(`${tarball.name}@${tarball.version} is already published; skipping`);
            continue;
        }
        let tag = distTag(tarball.version);
        console.log(`publishing ${tarball.name}@${tarball.version} under ${tag}`);
        execFileSync("npm", ["publish", tarball.path, "--access", "public", "--tag", tag], {
            stdio: "inherit",
        });
    }
}

main();
